/**
 * piban — extension pi **user-level** (tickets 10 et 20, spec § 3.3 / § 3.4).
 *
 * UN SEUL fichier, DEUX hooks — la surface de contact pi reste minimale (ticket 08) :
 *
 *   - `session_start`   : garantit que le board tourne et ouvre le navigateur sur le
 *                         kanban (« lancer pi suffit », ticket 20). Ne fait **rien** si le
 *                         serveur répond déjà : N sessions pi consécutives = zéro effet.
 *   - `session_shutdown`: défense 2 de la triple défense de fin de session kanban
 *                         (ticket 10) — défenses 1 (launcher) et 3 (réconciliation) la couvrent.
 *
 * INSTALL (étape documentée du ticket 16) :
 *   - copier CE FICHIER dans `~/.pi/agent/extensions/` — **user-level, jamais par
 *     projet** (évite le project trust à chaque projet, spec § 3.4) ;
 *   - créer le pointeur machine-local (hors du repo, jamais dans git) :
 *       `~/.pi/agent/extensions/piban.config.json`
 *         { "repoRoot": "/chemin/absolu/vers/le/repo/piban" }
 *
 * PORT / CONFIG (rien de machine-spécifique en dur, spec § 8) : lus au hook dans la même
 * config machine que le serveur — `<repoRoot>/config.json` fusionné avec
 * `<repoRoot>/config.local.json` (ignorée par git, local gagne). Seules constantes :
 * l'interface 127.0.0.1 (comme le curl du launcher, ticket 09) et le port défaut de
 * l'app (8787, spec § 3.1) si aucun fichier ne définit `port`.
 *
 * DÉMARRAGE (ticket 20) : jamais de build implicite ni de `npm` — on lance
 * `node <repoRoot>/server/dist/index.js` détaché, journal `<repoRoot>/.piban/server.log`.
 * `dist` absent / port pris par un autre programme / timeout → avertissement dans pi,
 * **jamais** de blocage de la session. Instance unique = le port (ticket 20 C5).
 *
 * WORKTREE (ticket 02) : le garde-fou décide **où** spawné, jamais **si** spawné, et ne
 * tue jamais d'instance. Si le cwd de la session (ou le `repoRoot` configuré) est un
 * **linked worktree** du repo piban, le serveur est spawné depuis le **worktree principal**
 * (la UI servie suit alors le travail du checkout principal, pas un branch figé).
 * Détection git best-effort (timeout 1,5 s) : tout échec retombe sur le comportement
 * actuel (spawn depuis le `repoRoot` configuré) avec une ligne d'information.
 *
 * COMPORTEMENT DE FIN DE SESSION (silencieux par design) :
 *   - ne signale que les vraies fins de session : `reason === 'quit'` (/quit, Ctrl+D,
 *     Ctrl+C, SIGTERM/SIGHUP, `ctx.shutdown()`). Les autres raisons (`new`, `resume`,
 *     `fork`, `reload`) changent de session sans la terminer — poster `ended` mentirait
 *     au board ; elles sont ignorées ;
 *   - user-level → chargée dans TOUTES les sessions pi de la machine : une session
 *     dont l'id n'a pas la forme `NN-slug` (id kanban, `--session-id <NN-slug>`)
 *     est ignorée — aucun POST, aucun effet ;
 *   - pointeur absent/illisible → no-op (piban pas installé sur cette machine) ;
 *   - serveur arrêté, endpoint pas encore servi ou timeout (500 ms) → silencieusement
 *     avéré : la fin de session pi n'est **jamais** retardée ni cassée — la défense 3
 *     (réconciliation) couvre le cas.
 *
 * Agnosticisme modèle (spec § 8) : aucune référence modèle/provider ici.
 * Dépendance : `fetch` natif + node:child_process/fs uniquement — aucun import du code
 * ni des paquets piban.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Port défaut de l'app (spec § 3.1) — seulement si aucun config ne définit `port`. */
const DEFAULT_PORT = 8787;
/** Interface d'écoute locale (même que le curl du launcher, ticket 09). */
const HOST = '127.0.0.1';
/**
 * Délai dur du POST `ended` : la fermeture de la session n'est jamais retardée au-delà.
 * 500 ms = très large marge sur un POST local (mesuré ~7 ms serveur allumé), et pire cas
 * borné à une demi-seconde si la connexion pend au lieu d'être refusée. Un POST perdu
 * n'est pas grave : les défenses 1 (launcher) et 3 (réconciliation) couvrent le cas.
 */
const POST_TIMEOUT_MS = 500;
/** Sonde de santé au démarrage de session : très court, ne retarde jamais pi. */
const HEALTH_TIMEOUT_MS = 500;
/** Attente maximale du board après un démarrage (ticket 20 C3). */
const START_TIMEOUT_MS = 8_000;
/** Intervalle de sonde pendant l'attente du démarrage. */
const START_POLL_MS = 250;
/** Durée de vie du témoin d'ouverture navigateur (ticket 20 C4). */
const BROWSER_LOCK_STALE_MS = 10_000;
/** Pointeur machine-local (créé par l'install, ticket 16) — hors du repo. */
const POINTER_PATH = path.join(os.homedir(), '.pi', 'agent', 'extensions', 'piban.config.json');
/** Id de session kanban = id de ticket `NN-slug` (grammaire `.scratch/`, ticket 03). */
const TICKET_SESSION_ID = /^\d{2,3}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readJson(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// ── Détection worktree piban (ticket 02) ────────────────────────────────────
/**
 * Timeout dur de chaque appel git de détection : la session pi ne doit jamais être
 * ralentie de façon perceptible (best-effort, ticket 02).
 */
const GIT_TIMEOUT_MS = 1_500;

/** Appel git injectable (tests) : sortie trimmée, `null` sur tout échec. */
export type GitRunner = (cwd: string, args: string[]) => Promise<string | null>;

/**
 * Appel git best-effort : `null` si pas de git, timeout, repo endommagé ou sortie non nulle.
 * Jamais d'exception, jamais plus de 1,5 s (ticket 02).
 */
export const gitBestEffort: GitRunner = (cwd, args) =>
  new Promise((resolve) => {
    let settled = false;
    let out = '';
    let child: ReturnType<typeof spawn>;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* déjà mort */
      }
      finish(null);
    }, GIT_TIMEOUT_MS);
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8');
    });
    child.on('close', (code: number | null) => finish(code === 0 ? out.trim() : null));
    child.on('error', () => finish(null));
  });

/** Marqueurs « c'est un checkout piban » (ticket 02) : `config.json` + `server/` à la racine. */
export function isPibanCheckout(dir: string): boolean {
  try {
    return existsSync(path.join(dir, 'config.json')) && statSync(path.join(dir, 'server')).isDirectory();
  } catch {
    return false;
  }
}

/**
 * (ticket 02) `dir` est-il dans un **linked worktree** (≠ worktree principal) du repo piban ?
 * Détection : `git rev-parse --git-common-dir` résout **hors** de `--show-toplevel`, et le
 * toplevel porte les marqueurs piban. `false` sur tout échec (hors repo, pas de git, timeout)
 * — l'appelant retombe alors sur le comportement existant.
 */
export function isLinkedPibanWorktree(dir: string, git: GitRunner = gitBestEffort): Promise<boolean> {
  return (async () => {
    const toplevel = await git(dir, ['rev-parse', '--show-toplevel']);
    if (toplevel === null) return false;
    const commonDir = await git(dir, ['rev-parse', '--git-common-dir']);
    if (commonDir === null) return false;
    const root = path.resolve(toplevel);
    const common = path.isAbsolute(commonDir) ? commonDir : path.resolve(dir, commonDir);
    const linked = common !== root && !common.startsWith(root + path.sep);
    return linked && isPibanCheckout(root);
  })();
}

/** (ticket 02) Worktree principal du repo contenant `dir` (première entrée du listing). */
export async function mainWorktreeOf(dir: string, git: GitRunner = gitBestEffort): Promise<string | null> {
  const out = await git(dir, ['worktree', 'list', '--porcelain']);
  if (out === null) return null;
  const line = out.split('\n').find((entry) => entry.startsWith('worktree '));
  return line === undefined ? null : line.slice('worktree '.length).trim();
}

export interface SpawnRoot {
  /** Répertoire depuis lequel le serveur sera **effectivement** spawné. */
  root: string;
  /** `true` si le répertoire configuré a été remplacé par le worktree principal. */
  changed: boolean;
  /** `null` si inchangé ; sinon la raison à logger/notifier. */
  reason: string | null;
}

/**
 * (ticket 02) Décide **où** spawné le serveur — jamais **si** (ticket 20), et ne tue jamais
 * d'instance. Si le cwd de la session, sinon le `repoRoot` configuré, est un linked worktree
 * du repo piban, le spawn passe par le **worktree principal**. Tout échec de détection git
 * (pas de git, timeout, repo endommagé) retombe sur le comportement actuel (spawn depuis le
 * `repoRoot` configuré), avec une ligne d'information. Ne jette jamais.
 */
export async function resolveSpawnRoot(
  cwd: string,
  configRoot: string,
  opts: { git?: GitRunner; info?: (message: string) => void } = {},
): Promise<SpawnRoot> {
  const git = opts.git ?? gitBestEffort;
  const info = opts.info ?? (() => {});
  const configAbs = path.resolve(configRoot);
  const tryMain = async (source: string): Promise<string | null> => {
    if (!(await isLinkedPibanWorktree(source, git))) return null;
    const main = await mainWorktreeOf(source, git);
    if (main === null || path.resolve(main) === path.resolve(source)) {
      info(`piban : détection worktree incomplète (source ${source}) — spawn inchangé.`);
      return null;
    }
    return main;
  };
  // 1) Le cwd de la session est dans un linked worktree piban (cas du workspace Orca).
  const fromCwd = await tryMain(cwd);
  if (fromCwd !== null && path.resolve(fromCwd) !== configAbs) {
    return {
      root: fromCwd,
      changed: true,
      reason: `piban : cwd de la session = linked worktree (${cwd}) — serveur spawné depuis le worktree principal ${fromCwd} (ticket 02).`,
    };
  }
  // 2) Le repoRoot configuré pointe lui-même sur un linked worktree.
  const fromConfig = fromCwd !== null ? fromCwd : await tryMain(configRoot);
  if (fromConfig !== null && path.resolve(fromConfig) !== configAbs) {
    return {
      root: fromConfig,
      changed: true,
      reason: `piban : repoRoot configuré = linked worktree (${configRoot}) — serveur spawné depuis le worktree principal ${fromConfig} (ticket 02).`,
    };
  }
  // 3) Cas général (projets tiers, clone normal, déjà le principal) : inchangé.
  return { root: configRoot, changed: false, reason: null };
}

/**
 * Repo + port lus de la config machine (même `config.local.*` que le serveur, ticket 09) ;
 * `null` si piban n'est pas installé/configure sur cette machine (pointeur absent ou
 * invalidé, repo disparu, port illisible) → les hooks ne font rien.
 */
export function loadPibanConfig(): { repoRoot: string; port: number } | null {
  const pointer = readJson(POINTER_PATH);
  const repoRoot: unknown = pointer?.repoRoot;
  if (typeof repoRoot !== 'string' || !path.isAbsolute(repoRoot)) return null;
  const base = readJson(path.join(repoRoot, 'config.json')) ?? {};
  const local = readJson(path.join(repoRoot, 'config.local.json')) ?? {};
  const port: unknown = local.port ?? base.port ?? DEFAULT_PORT;
  return typeof port === 'number' && Number.isInteger(port) && port > 0 && port < 65536
    ? { repoRoot, port }
    : null;
}

/** URL locale du board. */
export function boardUrl(port: number): string {
  return `http://${HOST}:${port}/`;
}

/** Le board répond-il (piban, pas n'importe quel programme) ? */
export async function boardHealthy(port: number): Promise<boolean> {
  if (typeof fetch !== 'function') return false;
  try {
    const response = await fetch(`${boardUrl(port)}api/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return body !== null && typeof body === 'object' && (body as { ok?: unknown }).ok === true;
  } catch {
    return false;
  }
}

/**
 * Démarre le serveur **détaché** (`node server/dist/index.js`), journal dans
 * `.piban/server.log`. `false` = application pas compilée (on n'improvise jamais un build).
 */
export function startServerProcess(repoRoot: string): boolean {
  const entry = path.join(repoRoot, 'server', 'dist', 'index.js');
  if (!existsSync(entry)) return false;
  try {
    const dir = path.join(repoRoot, '.piban');
    mkdirSync(dir, { recursive: true });
    const log = openSync(path.join(dir, 'server.log'), 'a');
    const child = spawn(process.execPath, [entry], {
      cwd: repoRoot,
      detached: true,
      stdio: ['ignore', log, log],
    });
    child.on('error', () => {
      /* silencieux : le prochain lancement retentera */
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Élection du seul pi qui ouvre l'onglet (ticket 20 C4) : fichier témoin exclusif,
 * périmé au-delà de 10 s — aucun état persistant, aucun nettoyage à faire.
 */
export function claimBrowserOpen(repoRoot: string, now: number = Date.now()): boolean {
  const dir = path.join(repoRoot, '.piban');
  const lock = path.join(dir, 'browser-open');
  try {
    mkdirSync(dir, { recursive: true });
    const age = now - statSync(lock).mtimeMs;
    if (age < BROWSER_LOCK_STALE_MS) return false; // un autre pi ouvre déjà l'onglet
    unlinkSync(lock);
  } catch {
    /* témoin absent (cas normal) : on tente de le prendre */
  }
  try {
    writeFileSync(lock, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    return false; // course perdue : un autre pi a ouvert l'onglet
  }
}

/** Ouvre le board dans le navigateur **par défaut** de Windows (interop WSL). */
export function openBoardInBrowser(port: number): boolean {
  if (process.platform !== 'linux' || !existsSync('/mnt/c')) return false;
  try {
    // `cmd.exe /c start "" <url>` = navigateur par défaut ; cwd hors chemin UNC
    // (cmd.exe refuse de démarrer dans `\\wsl.localhost\...`).
    const child = spawn('cmd.exe', ['/c', 'start', '', boardUrl(port)], {
      cwd: '/mnt/c',
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', () => {
      /* silencieux : le board reste accessible à la main */
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export type EnsureBoardResult = 'running' | 'started' | 'no-build' | 'failed';

export interface EnsureBoardDeps {
  repoRoot: string;
  port: number;
  /** Sonde « le board répond ? » (défaut : `boardHealthy`). */
  healthy?: () => Promise<boolean>;
  /** Démarrage détaché (défaut : `startServerProcess`). */
  start?: () => boolean;
  /** Ouverture du navigateur (défaut : `openBoardInBrowser`). */
  openBrowser?: () => boolean;
  /** Élection du seul onglet (défaut : `claimBrowserOpen`). */
  claim?: () => boolean;
  /** Avertissement non bloquant (défaut : silencieux). */
  warn?: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
}

/**
 * Garantit un board joignable (ticket 20 C3) : rien si le serveur répond ; sinon
 * démarrage détaché, attente bornée, et **un seul** onglet ouvert. Ne jette jamais.
 */
export async function ensureBoard(deps: EnsureBoardDeps): Promise<EnsureBoardResult> {
  const healthy = deps.healthy ?? (() => boardHealthy(deps.port));
  const start = deps.start ?? (() => startServerProcess(deps.repoRoot));
  const openBrowser = deps.openBrowser ?? (() => openBoardInBrowser(deps.port));
  const claim = deps.claim ?? (() => claimBrowserOpen(deps.repoRoot));
  const warn = deps.warn ?? (() => {});
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? START_TIMEOUT_MS;

  if (await healthy()) return 'running'; // déjà là : aucune relance, aucun onglet

  let started = false;
  try {
    started = start();
  } catch {
    started = false;
  }
  if (!started) {
    warn(
      `piban : impossible de démarrer le board (application pas compilée ? lance « npm run build » dans ${deps.repoRoot}).`,
    );
    return 'no-build';
  }

  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    await sleep(START_POLL_MS);
    if (await healthy()) {
      if (claim()) openBrowser();
      return 'started';
    }
  }
  warn(
    `piban : le board n'a pas répondu en ${Math.round(timeoutMs / 1000)} s — voir ` +
      `${path.join(deps.repoRoot, '.piban', 'server.log')} (port déjà pris par un autre programme ?).`,
  );
  return 'failed';
}

export default function (pi: ExtensionAPI) {
  pi.on('session_start', async (_event, ctx) => {
    const config = loadPibanConfig();
    if (config === null) return; // piban pas installé sur cette machine
    const info = (message: string) => {
      try {
        ctx.ui.notify(message, 'info');
      } catch {
        /* l'information ne doit jamais casser la session */
      }
    };
    try {
      // Garde-fou worktree (ticket 02) : décide OÙ spawné, jamais SI (ticket 20).
      let repoRoot = config.repoRoot;
      const resolution = await resolveSpawnRoot(process.cwd(), config.repoRoot, { info });
      if (resolution.changed && resolution.reason !== null) {
        repoRoot = resolution.root;
        info(resolution.reason);
      }
      await ensureBoard({
        repoRoot,
        port: config.port,
        warn: (message) => {
          try {
            ctx.ui.notify(message, 'warning');
          } catch {
            /* l'avertissement ne doit jamais casser la session */
          }
        },
      });
    } catch {
      // Jamais bloquant : une session pi démarre même si piban est cassé (ticket 20 C3).
    }
  });

  pi.on('session_shutdown', async (event, ctx) => {
    // Changement de session (`new` / `resume` / `fork` / `reload`) n'est PAS une fin de
    // session : signaler `ended` dans ces cas mentirait au board (spec § 4.2 : « en
    // cours » ne se lève qu'au Validé ou à un drag). Seul `quit` termine la session.
    if (event?.reason !== 'quit') return;

    let sessionId: string;
    try {
      sessionId = ctx.sessionManager.getSessionId();
    } catch {
      return;
    }
    // User-level : chargée dans toutes les sessions de la machine — ne signaler
    // que les sessions kanban (id `NN-slug` posé par le launcher, ticket 09).
    if (!TICKET_SESSION_ID.test(sessionId)) return;

    const config = loadPibanConfig();
    if (config === null || typeof fetch !== 'function') return;

    // Même contrat que le curl du launcher (ticket 09) : l'endpoint est servi et
    // dédoublonné par le serveur (ticket 11) ; `ticket` = id de session.
    const url = `${boardUrl(config.port)}api/sessions/${encodeURIComponent(sessionId)}/ended`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticket: sessionId }),
        signal: AbortSignal.timeout(POST_TIMEOUT_MS),
      });
    } catch {
      // Serveur arrêté / endpoint pas encore servi / timeout : silencieux.
      // La défense 3 (réconciliation, ticket 11) couvre le cas — et rien ici
      // ne retarde ni ne casse la fermeture de la session pi.
    }
  });
}
