# piban-migration

Migration de l'environnement de travail piban (pi agent + skills + extensions + piban)
d'une machine WSL à une autre, via ce repo GitHub privé comme transit.

**Aucun secret n'est dans ce repo** : pas d'`auth.json` (clés API), pas de clés SSH.
Les `node_modules`, `sessions/` (historique) et caches ne sont pas transportés — tout est régénéré.

## Contenu

```
export/
  agent-dir/          → sera copié tel quel dans ~/.pi/agent-piban/
    AGENTS.md, APPEND_SYSTEM.md, profile.md, reflexes.md
    settings.json     (déjà adapté : exclusion du ~/.agents/skills partagé)
    models.json       (définitions providers/modèles — provider local llama-win inclus,
                       à adapter au bureau si tu n'y tournes pas de LLM local)
    npm/package.json  (pi-subagents, pi-web-access — installé par import.sh)
    extensions/       (kilo.ts, orca-agent-status.ts, session-shutdown.ts,
                       piban.config.json — repoRoot patché par import.sh)
    skills/           (lot de skills COMPLET de la machine d'origine, privé au pi piban)
  piban/
    config.local.json (template — projectsRoot patché par import.sh)
import.sh             → à exécuter sur la machine cible
```

## Import (machine cible, WSL)

Prérequis : pi agent **1.4.0** (même version = binaire partagé entre les deux pi),
Node.js v22, clé SSH GitHub de la machine (→ `ssh -T git@github.com` OK),
Windows Terminal (pour le mode `wt` de lancement des sessions piban).

```sh
git clone git@github.com:pb0kaoss-create/piban-migration.git ~/piban-migration
cd ~/piban-migration
./import.sh /mnt/c/Users/<profil>/projets
```

L'import :
1. copie la config dans `~/.pi/agent-piban/` (le pi existant `~/.pi/agent` est **intouché**) ;
2. installe `pi-subagents` + `pi-web-access` dans le config dir ;
3. clone **piban** (branch `dev-piban`) dans `<projectsRoot>/piban`, `npm ci` + build ;
4. patche les chemins machine (`piban.config.json`, `config.local.json`) ;
5. ajoute l'alias `pi-piban` dans `~/.bashrc`.

## Vérifications après import (checklist de preuves)

- [ ] `pi-piban` démarre ; la liste de skills chargées = **lot piban uniquement**
      (grilling, domain-modeling, feature-workflow, new-ticket, …) — le lot à plat
      du pi existant ne doit pas apparaître. Si des skills de
      `~/.agents/skills/` persistent, changer dans `~/.pi/agent-piban/settings.json`
      `"skills": ["-~/.agents/skills"]` en `"skills": ["-~/.agents/skills/*"]` et retester.
- [ ] Les 4 extensions piban sont chargées au démarrage.
- [ ] `pi` (existant) démarre toujours, avec SES skills, intouché.
- [ ] `cd <projectsRoot>/piban && npm start` → board `http://localhost:18787` répond.
- [ ] Un projet matt-pocock déplacé dans `<projectsRoot>/` (doit contenir `.git`
      + `.scratch/`) apparaît sur le board.
- [ ] Dans `pi-piban` : clés API ressaisies + modèle par défaut choisi
      (`defaultProvider`/`defaultModel` hérités de la machine d'origine).

## Limites / notes

- **Sessions (historique de conversations) non transportées** : le pi piban du
  bureau démarre à zéro. (Les sessions sont de l'état, pas de la config.)
- **modèle local** : la machine d'origine pointe `llama-win`/`qwen3.8-27b` par
  défaut — si le bureau n'a pas de LLM local, choisir un autre modèle au 1er lancement.
- **Binaire pi partagé** : les deux pi utilisent le même install 1.4.0 ; une mise à
  jour pi met à jour les deux ensemble (c'est voulu — critère de compat post-maj piban).
- Une fois la migration validée, ce repo peut être supprimé (ou archivé) : il ne
  contient rien de secret, mais ce n'est pas un repo de travail.
