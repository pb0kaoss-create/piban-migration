# Profil utilisateur — comment travailler avec lui

Fichier lu **à la demande** (renvoi depuis `APPEND_SYSTEM.md` et `AGENTS.md`). À consulter au début
d'une session longue, ou dès qu'une décision de conception se pose. Écrire ici uniquement des choses
**durables et vérifiées en session** — pas des impressions.

## Qui / contexte

- Construit **piban**, fork de pi agent : kanban local (`.scratch/`), workflow de modification
  protégée, distribution prévue (GitHub, puis déploiement en organisation sur GitLab).
- Repo de référence : `/mnt/e/dev/projets/piban` (branche de brouillon `dev-piban`, livrée `master`).
  Board servi sur `http://127.0.0.1:18787` depuis ce dossier.
- Travaille surtout **en français** ; les termes techniques (flags, fichiers, labels) restent en anglais.
- Contexte matériel variable : poste de vacances (modèle local 98k, brièveté imposée) vs poste de
  bureau (contexte 1M, plusieurs projets, coexistence avec `pi` et `omp`). Ne pas figer une règle
  liée à un seul de ces contextes.
- Modèles utilisés : local `qwen3.8-27b` (gratuit, lent), `kilo` (gratuit), `deepseek-flash` (payant).
  Les appels payants demandent une validation (cf. `AGENTS.md`).

## Comment il travaille

- Il **pilote** : il ne code pas lui-même, il décide, observe et juge. Il lit souvent la session
  en direct pendant que l'agent travaille.
- Il **corrige plutôt qu'il ne rejette** : ses retours sont des nuances qui changent la conception
  (ex. « demander un courriel découragera les débutants », « `~/piban/` sera confondu avec le nom du
  produit », « une description ne peut pas couvrir toutes les formulations »). Les prendre au sérieux
  immédiatement : ils sont généralement justes.
- Il **délègue volontiers** (« ta reco ? »), mais vérifie ensuite et tranche : donner une
  recommandation claire, assumée, avec ses raisons — pas un catalogue d'options neutres.
- Débutant en git, à l'aise en conception, process et pédagogie. Expliquer les mécanismes internes
  quand ils éclairent une décision ; ne pas simplifier au point de masquer un risque.

## Ce qu'il attend d'un agent

1. Une décision à la fois, numérotation `1)` `2)`, avec **périmètre / impact / criticité**.
2. Les **questions de conception avant** d'écrire un ticket ou un fichier — pas après.
3. Un **critère de succès défini avant** un test.
4. Des **preuves** : état git lu, commande exécutée, sortie réelle. Jamais « vérifié » sur la foi
   d'un rapport d'agent.
5. Du langage simple ; vulgariser sans infantiliser ; assumer les limites (« je ne peux pas savoir »).
6. Signaler les pièges de processus (qui parle, quand on s'arrête, quel état est ambigu).

## Pièges déjà rencontrés (ne pas les répéter)

- **Auto-jeu d'un test** : l'agent joue l'utilisateur *et* l'assistant, puis atteste la conformité.
  Un test d'acceptation doit dire qui parle et quand on s'arrête.
- **Reprise de session** : relancer un ticket reprend la session précédente, qui peut réciter un état
  périmé sans relire les fichiers. Vérifier la fraîcheur, archiver la session si besoin.
- **Description de skill comme classifieur** : énumérer des formulations ne garantit aucun
  déclenchement. Passer par une règle toujours active (`AGENTS.md`) qui aiguille vers le skill.
- **Avertissement d'interface trop large** : signaler « du travail non revu part » alors que rien de
  concerné ne part → fausse alerte qui bloque une publication légitime.
- **Appliquer une consigne sans lire l'état réel** : vérifier avant d'agir (branche, statut, session).

## Fichiers qui comptent

- `~/.pi/agent/AGENTS.md` — règles durables (langue, decisions, protections, modèles payants).
- `~/.pi/agent/reflexes.md` — fiche réflexe côté utilisateur (6 points).
- `~/.pi/agent/extensions/session-shutdown.ts` + `piban.config.json` — hook de démarrage du board.
- `~/.agents/skills/piban/` — skills distribués (`new-ticket`, `feature-workflow`).
- Tracker des tickets : `.scratch/<feature>/issues/NN-slug.md` du repo piban.
