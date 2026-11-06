/**
 * Custom Provider Extension — Stack IA (vLLM DeepSeek V4) + Kilo Gateway + Albert API
 *
 * Connecte pi à un ou plusieurs providers OpenAI-compatibles.
 *
 * ── Principe (v2) ────────────────────────────────────────────────────────
 *   Les trois providers sont enregistrés INCONDITIONNELLEMENT : ils apparaissent
 *   donc dans `/login`, où chaque clé se saisit une fois pour toutes. Pi stocke la
 *   clé dans `auth.json` (à côté de ce fichier : `~/.pi/agent/` ou le dossier de
 *   `PI_CODING_AGENT_DIR`) et l'utilise en priorité sur l'environnement.
 *
 *   La pastille 🟢/🔴 affichée au démarrage ne dépend PAS de l'environnement : elle
 *   vient d'une sonde réelle de `GET {baseUrl}/models` (clé lue dans l'environnement,
 *   sinon dans `auth.json`).
 *     🟢 n modèle(s)            → provider joignable et clé acceptée
 *     🟡 clé absente            → aucune clé connue : la saisir via `/login`
 *     🔴 clé refusée            → la clé existe mais est rejetée (refaire /login)
 *     🔴 injoignable            → réseau interne inaccessible ou maintenance
 *
 *   Conséquence utile : le Stack IA GB10 est un provider INTERNE, joignable
 *   seulement depuis le réseau de l'organisation. 🔴 hors de ce réseau n'est pas
 *   une erreur — c'est l'information « provider interne non accessible d'ici ».
 *
 * ── Provider 1 : Stack IA vLLM (DeepSeek V4) ─────────────────────────────
 *   Config par défaut (hardcodée) :
 *     baseUrl = http://192.168.224.82:4000
 *     apiKey  = via CUSTOM_PROVIDER_API_KEY ou /login (JAMAIS en dur ici)
 *     modèle  = deepseek-v4-flash-vision (contexte 900K / sortie 65 536)
 *
 *   Variables d'environnement (toutes optionnelles) :
 *     CUSTOM_PROVIDER_BASE_URL
 *     CUSTOM_PROVIDER_API_KEY
 *     CUSTOM_PROVIDER_NAME
 *     CUSTOM_PROVIDER_AUTO_DISCOVER  (défaut: "true")
 *     CUSTOM_PROVIDER_MODELS         (JSON manuel, prioritaire si fourni)
 *
 *   Note : Contexte 1M tokens (NVFP4 + FP8 KV Cache), TP=2, double nœud
 *          Tool calling via --tool-call-parser deepseek_v4
 *
 *   CALIBRATION (relevé, PAS règle — voir ~/.pi/agent/backend-calibration.md & ADR-028) :
 *     deepseek-v4-flash-vision → 2 niveaux réellement distincts : `off` | `high`.
 *     `low`/`minimal`/`medium` = collapsés (alias de `off`). A/B #177 (07/10/2026).
 *
 * ── Provider 2 : Kilo Gateway ─────────────────────────────────────────────
 *   API key : KILO_API_KEY (ou /login)
 *
 *   Variables d'environnement (optionnelles) :
 *     KILO_API_KEY
 *     KILO_BASE_URL         (défaut: https://api.kilo.ai/api/gateway)
 *     KILO_PROVIDER_NAME    (défaut: "Kilo Gateway")
 *     KILO_AUTO_DISCOVER    (défaut: "true")
 *     KILO_MODELS           (JSON manuel, prioritaire si fourni)
 *
 * ── Provider 3 : Albert API (etalab.gouv.fr — OpenAI-compatible) ────────
 *   API key : ALBERT_API_KEY (ou /login)
 *
 *   Variables d'environnement (optionnelles) :
 *     ALBERT_API_KEY
 *     ALBERT_BASE_URL       (défaut: https://albert.api.etalab.gouv.fr/v1)
 *     ALBERT_PROVIDER_NAME  (défaut: "Albert API")
 *     ALBERT_AUTO_DISCOVER  (défaut: "true")
 *     ALBERT_MODELS         (JSON manuel, prioritaire si fourni)
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ═══════════════════════════════════════════════════════════════════════════════
//  Configuration
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // ── Stack IA vLLM (DeepSeek V4) ──
  stack: {
    baseUrl: process.env.CUSTOM_PROVIDER_BASE_URL || "http://192.168.224.82:4000",
    apiKey: process.env.CUSTOM_PROVIDER_API_KEY || "",
    name: process.env.CUSTOM_PROVIDER_NAME || "Stack IA GB10",
    api: (process.env.CUSTOM_PROVIDER_API || "openai-completions") as string,
    autoDiscover: process.env.CUSTOM_PROVIDER_AUTO_DISCOVER !== "false",
    manualModelsJson: process.env.CUSTOM_PROVIDER_MODELS,
    skipSslVerify: process.env.CUSTOM_PROVIDER_SKIP_SSL_VERIFY === "true",
  },
  // ── Kilo Gateway ──
  kilo: {
    baseUrl: process.env.KILO_BASE_URL || "https://api.kilo.ai/api/gateway",
    apiKey: process.env.KILO_API_KEY || "",
    name: process.env.KILO_PROVIDER_NAME || "Kilo Gateway",
    api: (process.env.KILO_API || "openai-completions") as string,
    autoDiscover: process.env.KILO_AUTO_DISCOVER !== "false",
    manualModelsJson: process.env.KILO_MODELS,
  },
  // ── Albert API (etalab.gouv.fr — OpenAI-compatible) ──
  albert: {
    baseUrl: process.env.ALBERT_BASE_URL || "https://albert.api.etalab.gouv.fr/v1",
    apiKey: process.env.ALBERT_API_KEY || "",
    name: process.env.ALBERT_PROVIDER_NAME || "Albert API",
    api: (process.env.ALBERT_API || "openai-completions") as string,
    autoDiscover: process.env.ALBERT_AUTO_DISCOVER !== "false",
    manualModelsJson: process.env.ALBERT_MODELS,
    skipSslVerify: false,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  Identité : dossier de config pi, clé enregistrée par /login, sonde de provider
// ═══════════════════════════════════════════════════════════════════════════════

/** Dossier de config pi courant — suit PI_CODING_AGENT_DIR, sinon ~/.pi/agent. */
function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || path.join(homedir(), ".pi", "agent");
}

/**
 * Clé écrite par `/login` pour un provider, ou undefined.
 * Lecture seule, jamais journalisée : auth.json est un fichier de credentials.
 */
function storedKey(providerId: string): string | undefined {
  try {
    const auth = JSON.parse(readFileSync(path.join(agentDir(), "auth.json"), "utf8")) as Record<
      string,
      { apiKey?: string; key?: string }
    >;
    const value = auth[providerId]?.apiKey ?? auth[providerId]?.key;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined; // absent/illisible : « pas de clé connue », jamais une erreur
  }
}

/** Résultat d'une sonde de disponibilité. */
type ProbeResult =
  | { state: "green"; models: number }
  | { state: "no-key" }
  | { state: "denied" }
  | { state: "unreachable" };

/**
 * Sonde `GET {baseUrl}/models` : c'est ELLE qui décide de la pastille, jamais
 * `process.env` (défaut v1 corrigé ici : la clé peut venir de `/login`).
 * Distingue quatre états — dont « injoignable » (réseau interne, maintenance).
 */
async function probeProvider(
  providerId: string,
  cfg: { baseUrl: string; apiKey?: string },
): Promise<ProbeResult> {
  const key = cfg.apiKey || storedKey(providerId);
  if (!key) return { state: "no-key" };
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(6_000),
    });
    if (res.status === 401 || res.status === 403) return { state: "denied" };
    if (!res.ok) return { state: "unreachable" };
    const payload = (await res.json().catch(() => null)) as { data?: unknown[] } | null;
    return { state: "green", models: Array.isArray(payload?.data) ? payload.data.length : 0 };
  } catch {
    return { state: "unreachable" }; // timeout, DNS, refus de connexion, maintenance
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Specs réelles des modèles DeepSeek V4 servis par Albert API (etalab.gouv.fr)
//  ───────────────────────────────────────────────────────────────────────────────
//  L'heuristique detectCapabilities() attribue 1M de contexte / 65 536 tokens de
//  sortie à tout id contenant "deepseek-v4". Or l'alias Albert
//  "deepseek-ai/DeepSeek-V4-Flash-0731" n'offre qu'une fenêtre de 131 072 tokens :
//  pi demandait alors max_tokens = 65 536 sur une session à ~65k tokens d'input
//  (65 537 + 65 536 = 131 073 > 131 072) → erreur 400 BadRequest.
//  La fenêtre réelle active aussi la compaction de pi ; le plafond de sortie
//  16 384 laisse une marge sûre même si l'estimation d'input de pi sous-compte.
// ═══════════════════════════════════════════════════════════════════════════════

const ALBERT_DEEPSEEK_SPECS: Record<
  string,
  { contextWindow: number; maxTokens: number }
> = {
  "deepseek-ai/deepseek-v4-flash-0731": { contextWindow: 131_072, maxTokens: 16_384 },
  "deepseek-ai/deepseek-v4-flash": { contextWindow: 131_072, maxTokens: 16_384 },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════════════════

interface DiscoveredModel {
  id: string;
  name?: string;
  context_window?: number;
  context_length?: number;  // Kilo Gateway utilise context_length
  max_tokens?: number;
  input_modalities?: string[];
}

interface ProviderModel {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  compat: {
    supportsDeveloperRole: boolean;
    supportsReasoningEffort: boolean;
    maxTokensField: "max_completion_tokens" | "max_tokens";
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Détection des capacités à partir du nom du modèle
// ═══════════════════════════════════════════════════════════════════════════════

function detectCapabilities(id: string): {
  images: boolean;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
} {
  const lower = id.toLowerCase();

  // Modèles avec support vision / images
  const visionModels = [
    "vision", "vl", "llava", "bakllava", "minicpm-v", "cogvlm",
    "gemini", "gemma-3", "qwen2-vl", "qwen-vl", "phi-3-vision",
    "pixtral", "llama-3.2-vision", "granite-3.2-vision",
    "minicpm", "internvl", "yi-vision", "moondream",
  ];
  const images = visionModels.some((kw) => lower.includes(kw));

  // Modèles avec reasoning / pensée
  const reasoningModels = [
    "deepseek-r1", "deepseek-v4", "qwq", "o1-", "o3-", "reasoning",
    "marco-o1", "openthinker", "deepscaler", "r1-",
  ];
  const reasoning = reasoningModels.some((kw) => lower.includes(kw));

  // Contexte et tokens max — valeurs par défaut généreuses
  let contextWindow = 128_000;
  let maxTokens = 16_384;

  // Modèles avec très grand contexte
  if (lower.includes("gemini") || lower.includes("gemma-3")) {
    contextWindow = 1_000_000;
    maxTokens = 65_536;
  } else if (lower.includes("mistral") || lower.includes("mixtral")) {
    contextWindow = 131_072;
    maxTokens = 32_768;
  } else if (lower.includes("command-r")) {
    contextWindow = 131_072;
    maxTokens = 4_096;
  } else if (lower.includes("qwq") || lower.includes("qwen2.5") || lower.includes("qwen-2.5")) {
    contextWindow = 131_072;
    maxTokens = 8_192;
  } else if (lower === "deepseek-v4-flash-vision") {
    contextWindow = 900_000;
    maxTokens = 65_536;
  } else if (lower.includes("deepseek-v4")) {
    contextWindow = 1_000_000;
    maxTokens = 65_536;
  } else if (lower.includes("deepseek-v3") || lower.includes("deepseek-chat")) {
    contextWindow = 131_072;
    maxTokens = 8_192;
  } else if (lower.includes("deepseek-r1")) {
    contextWindow = 131_072;
    maxTokens = 32_768;
  }

  return { images, reasoning, contextWindow, maxTokens };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Découverte automatique des modèles (OpenAI-compatible /v1/models)
// ═══════════════════════════════════════════════════════════════════════════════

async function discoverModels(
  baseUrl: string,
  apiKey: string,
  skipSslVerify: boolean = false,
): Promise<ProviderModel[]> {
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;

  const fetchOptions: RequestInit = {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(6_000),
  };

  if (skipSslVerify) {
    try {
      const { Agent } = require("node:https") as typeof import("node:https");
      (fetchOptions as { agent?: unknown }).agent = new Agent({ rejectUnauthorized: false });
    } catch {
      /* pas d'agent : la découverte échouera proprement plus bas, jamais de crash */
    }
  }

  let response: Response;
  try {
    response = await fetch(url, fetchOptions);
  } catch {
    return []; // injoignable → fallback → feu 🔴 (travail invisible)
  }

  if (!response.ok) {
    return []; // HTTP non-OK → fallback → feu 🔴
  }

  const payload = (await response.json().catch(() => null)) as
    | { data?: DiscoveredModel[]; models?: DiscoveredModel[]; object?: string }
    | DiscoveredModel[]
    | null;

  if (!payload) return [];

  // Normaliser : OpenAI → { data: [...] }, Ollama → { object: "list", data: [...] }
  let rawModels: DiscoveredModel[] = [];
  if (Array.isArray(payload)) {
    rawModels = payload;
  } else if (Array.isArray(payload.data)) {
    rawModels = payload.data;
  }

  if (rawModels.length === 0) return [];

  // Mapping des IDs courts vers noms complets pour LiteLLM
  const modelIdMapping: Record<string, string> = {
    "qwen80b": "qwen/qwen3-next-80b-a3b-instruct-fp8",
    "qwen": "qwen/qwen3-32b",
    "llama": "meta-llama/llama-3.3-70b-instruct",
    // Ajouter d'autres mappings selon besoin
  };

  return rawModels
    .map((m) => {
      const originalId = m.id;
      // Normaliser l'ID : utiliser le nom complet si disponible dans le mapping
      const normalizedId = modelIdMapping[originalId.toLowerCase()] || originalId;
      const idLower = originalId.toLowerCase();
      const caps = detectCapabilities(originalId);

      // Albert API : priorité 1 = champs renvoyés par /models, priorité 2 = specs
      // réelles connues (ALBERT_DEEPSEEK_SPECS), priorité 3 = heuristique.
      // (Uniquement pour Albert : le Stack IA local DeepSeek V4 NVFP4 a réellement 1M.)
      let albertSpec: { contextWindow: number; maxTokens: number } | undefined;
      if (baseUrl.toLowerCase().includes("albert.api.etalab.gouv.fr")) {
        // Match exact sur l'alias complet, sinon toute variante contenant
        // "deepseek-v4-flash" (ex. sans préfixe org ou suffixé) → même spec.
        albertSpec =
          ALBERT_DEEPSEEK_SPECS[idLower] ??
          (idLower.includes("deepseek-v4-flash")
            ? ALBERT_DEEPSEEK_SPECS["deepseek-ai/deepseek-v4-flash"]
            : undefined);
      }

      // Compat spécifique DeepSeek : thinking format & reasoning_effort
      const isDeepseekReasoning = caps.reasoning && idLower.includes("deepseek");

      return {
        id: normalizedId,
        name: m.name ?? originalId,
        reasoning: caps.reasoning,
        input: (caps.images
          ? ["text", "image"]
          : ["text"]) as ("text" | "image")[],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow:
          m.context_window ?? m.context_length ?? albertSpec?.contextWindow ?? caps.contextWindow,
        maxTokens: m.max_tokens ?? albertSpec?.maxTokens ?? caps.maxTokens,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: isDeepseekReasoning,
          maxTokensField: "max_tokens" as const,
          ...(isDeepseekReasoning ? { thinkingFormat: "deepseek" as const } : {}),
        },
      };
      // NOTE — comportement du backend Stack IA GB10 (deepseek-v4-flash-vision,
      // vLLM chat template). Spécifique à CE backend → vit ICI (extension provider), pas
      // dans le harness (model-agnostic) ni dans les docs canoniques :
      //   · thinking OFF → thinking:{type:"disabled"} (lite).
      //   · thinking ON  → thinking:{type:"enabled"} + reasoning_effort verbatim.
      //     Mesure A/B #205 (même carte #207, même modèle, 3 niveaux) : les étages réels
      //     sont {high} (profond) vs {medium, off} (lite) — `medium` ≈ `off` (alias d'off,
      //     PAS d'high). `reasoning_effort` est donc au moins partiellement respecté
      //     (high ≠ medium mesuré) : ne pas inférer des niveaux collapsés depuis la seule
      //     forme binaire du champ enabled/disabled.
      // → Ne pas promettre une profondeur distincte pour un niveau : calibrer sur le
      //   backend. Confirmé par réplication (A/B #205 + #208, 3 runs/niveau, correction
      //   OK sur les 9 runs). Une `thinkingLevelMap` optionnelle permettrait de mapper
      //   `medium`/`off` vers une valeur lite (et `high` vers une valeur profonde) si on
      //   veut l'expliciter.
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Fallback
// ═══════════════════════════════════════════════════════════════════════════════

function fallbackModel(providerName: string = "Unknown"): ProviderModel[] {
  return [
    {
      id: "default",
      name: `${providerName} — Default`,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_384,
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        maxTokensField: "max_tokens",
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Résolution des modèles pour un provider donné
// ═══════════════════════════════════════════════════════════════════════════════

interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  name: string;
  api: string;
  autoDiscover: boolean;
  manualModelsJson?: string;
  skipSslVerify?: boolean;
}

async function resolveModels(config: ProviderConfig): Promise<ProviderModel[]> {
  const { baseUrl, apiKey, name, autoDiscover, manualModelsJson, skipSslVerify = false } = config;

  if (manualModelsJson) {
    try {
      return JSON.parse(manualModelsJson);
    } catch {
      return fallbackModel(name);
    }
  }

  if (autoDiscover) {
    // Auto-découverte silencieuse : l'état est porté par le retour
    // (modèles découverts → 🟢, fallback → 🔴 dans les notifications).
    const models = await discoverModels(baseUrl, apiKey, skipSslVerify);
    return models.length === 0 ? fallbackModel(name) : models;
  }

  return fallbackModel(name);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Thinking — calibration (relevé, PAS règle — voir backend-calibration.md & ADR-028)
// ───────────────────────────────────────────────────────────────────────────────
//  deepseek-v4-flash-vision (GB10) → 2 modes réellement distincts : `off` | `high`.
//  `medium` ≈ `off` (alias d'off, A/B #205 + #208). Mapping cran d'usage → littéral.
//  Changement de modèle → mettre à jour le mapping ICI (CRAN_TO_LEVEL) + le relevé
//  backend-calibration.md — AUCUNE règle ni aucun doc normatif ne bouge.
// ═══════════════════════════════════════════════════════════════════════════════
const CRAN_TO_LEVEL = {
  bas:  "off",   // lite
  haut: "high",  // deep
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
//  Extension
// ═══════════════════════════════════════════════════════════════════════════════

export default async function (pi: ExtensionAPI) {
  // Message de patience : pi attend cette factory avant de finir le démarrage
  // (custom-provider.md — "pi waits for the factory before startup continues").
  // console.warn = seul canal d'affichage disponible avant session_start.
  console.warn("[custom-provider] ⏳ Vérification des providers/modèles en cours…");

  // Les TROIS providers sont enregistrés INCONDITIONNELLEMENT : c'est ce qui les fait
  // apparaître dans /login (saisie de clé). La pastille, elle, vient d'une sonde réelle
  // (probeProvider) — plus aucune décision d'affichage fondée sur process.env.
  const providers = [
    { id: "stack-ia-gb10", cfg: CONFIG.stack, label: CONFIG.stack.name },
    { id: "kilo-gateway", cfg: CONFIG.kilo, label: CONFIG.kilo.name },
    { id: "albert-api", cfg: CONFIG.albert, label: CONFIG.albert.name },
  ];

  const etats = await Promise.all(
    providers.map(async (p) => {
      // Clé effective : environnement d'abord (CI, machines sans auth.json), sinon
      // celle enregistrée par /login. Sert à la découverte ET à la sonde.
      const cle = p.cfg.apiKey || storedKey(p.id);
      const [probe, models] = await Promise.all([
        probeProvider(p.id, p.cfg),
        resolveModels({ ...p.cfg, apiKey: cle ?? "" }),
      ]);
      // Fallback = modèle factice : ne jamais exposer un modèle fantôme dans /model.
      const decouverts = models.length === 1 && models[0]?.id === "default" ? [] : models;

      pi.registerProvider(p.id, {
        name: p.label,
        baseUrl: p.cfg.baseUrl,
        // apiKey volontairement omise si elle ne vient pas de l'environnement :
        // pi résout alors par auth.json (/login), qui reste la source de vérité.
        ...(p.cfg.apiKey ? { apiKey: p.cfg.apiKey } : {}),
        api: p.cfg.api as any,
        authHeader: true,
        // Liste vide → champ omis : le provider reste visible dans /login, sans
        // modèle fantôme en attendant que la sonde passe (login ou réseau rétabli).
        ...(decouverts.length ? { models: decouverts } : {}),
      });

      return { p, probe };
    }),
  );

  const notifications: string[] = etats.map(({ p, probe }) => {
    const entete = `🔌 ${p.label} —`;
    switch (probe.state) {
      case "green":
        return `${entete} 🟢 ${probe.models} modèle(s)`;
      case "no-key":
        return `${entete} 🟡 clé absente — /login`;
      case "denied":
        return `${entete} 🔴 clé refusée — refaire /login`;
      default:
        return `${entete} 🔴 injoignable (réseau interne ou maintenance)`;
    }
  });

  // ── Outil `set_thinking` : pilotage du niveau de raisonnement par l'agent ──
  // L'agent appelle cet outil en TÊTE de ticket selon la classe (voir ADR-028).
  // Le mappage cran → littéral est calibré ICI (CRAN_TO_LEVEL) + backend-calibration.md.
  // Lag d'un tour : setThinkingLevel agit sur la génération suivante → bénin en tête de ticket.
  pi.registerTool({
    name: "set_thinking",
    label: "Définir le niveau de raisonnement",
    description:
      "Fixe le cran d'effort de raisonnement de la session. À appeler en TÊTE de ticket, " +
      "selon la classe : cran bas = lite (réversible·S, doc/kanban, pur protocole) ; " +
      "cran haut = deep (intermédiaire, irréversible, tout ce qui demande du jugement). " +
      "Le mappage vers le niveau réel du backend est fait par l'extension (calibré).",
    parameters: Type.Object({
      cran: Type.Union([
        Type.Literal("bas", { description: "lite — réversible·S / doc / protocole" }),
        Type.Literal("haut", { description: "deep — intermédiaire / irréversible / jugement" }),
      ]),
    }),
    async execute(_id, params) {
      // fail-closed : valeur inconnue / absente → cran haut (ne jamais descendre par erreur).
      // Source de vérité unique : le fallback lit CRAN_TO_LEVEL.haut, pas un littéral dupliqué.
      const level = CRAN_TO_LEVEL[params.cran] ?? CRAN_TO_LEVEL.haut;
      pi.setThinkingLevel(level);
      return {
        content: [{ type: "text", text: `niveau de raisonnement → ${params.cran} (${level})` }],
        details: { cran: params.cran, level },
      };
    },
  });

  // Notification UNIQUE groupée au démarrage : les notify successifs
  // s'écrasent dans la même zone d'affichage (seul le dernier resterait
  // visible) → un seul message multi-lignes porte tous les feux.
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    if (notifications.length === 0) return;

    ctx.ui.notify(
      [...notifications, "→ /model pour choisir"].join("\n"),
      "info",
    );
  });
}
