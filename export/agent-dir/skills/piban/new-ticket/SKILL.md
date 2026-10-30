---
name: new-ticket
description: Convertit une idée discutée en un ou plusieurs tickets d'implémentation auto-portés, écrits directement dans le tracker markdown local .scratch/<feature>/issues/. Utilise quand le user dit « crée un ticket », « convertis cette idée en ticket », « note cette idée », ou pour proposer spontanément un ticket pour une idée durable (au plus une proposition par session).
---

# new-ticket — convertir une idée en tickets

Tu transformes une idée en **tickets d'implémentation auto-portés** : une session fraîche qui ne lit que le fichier (et ses liens) doit pouvoir commencer le travail sans la conversation d'origine.

Ce skill écrit des fichiers markdown avec tes outils habituels. Il **n'appelle pas** le serveur kanban et **ne fait aucun git**.

## 1. Déclencheurs

- **Explicite** : le user demande de convertir, capturer ou créer un ticket.
- **Spontané** : tu peux proposer un ticket pour une idée **durable** — quelque chose qui devra être repris dans une autre session, pas un correctif ou une tâche de la session en cours.
  - **Au plus une proposition par session.** Si tu as déjà proposé un ticket dans cette session, n'en propose plus.
  - Propose, puis attends : « Veux-tu que je crée un ticket pour ça ? ». Sans accord clair, tu n'écris rien.
  - Une proposition refusée est abandonnée sans relance.

Si l'idée est en réalité une **décision à trancher**, ce n'est pas ce skill : dis-le (« ça ressemble à une décision — elle appartient à un effort wayfinder / `/wayfinder` ») et **n'écris aucun ticket**.

## 2. Confirmation avant écriture (obligatoire)

Avant d'écrire, présente au user, en une fois :

1. le **titre** retenu ;
2. la **destination** : `.scratch/<feature>/issues/` (feature existante ou nouveau slug) ;
3. l'**état initial** et la colonne attendue (« backlog » ou « à spécifier ») ;
4. s'il y a plusieurs tickets : la **liste numérotée** (numéros, titres, ordre, qui bloque qui).
5. la **catégorie** de travail (`Feature`, `Fix`, `UI/UX` ou nouvelle) et la **feature** (dossier `.scratch/<feature>/` existant du projet, ou nouveau slug) dans lequel écrire le ticket.

Un accord clair suffit ; ne redemande pas fichier par fichier. Tant que le user n'a pas confirmé, tu n'écris rien.

Un « crée le ticket » lancé avant d'avoir vu ces cinq points **ne dispense pas** de cette étape : il autorise l'écriture, il ne valide pas les paramètres. Présente-les, puis écris. Seule exception : le user a lui-même dicté le titre, la destination et l'état — il n'y a alors plus rien à confirmer.

## 3. Destination et numérotation

- Écris toujours dans `.scratch/<feature>/issues/NN-<slug>.md`, depuis la racine du projet.
- **Pas de dossier `inbox`**, pas de fichier unique regroupant plusieurs tickets. Si la feature n'existe pas, demande son slug (court, en minuscules) et crée l'arborescence.
- Un ticket d'implémentation peut cohabiter avec les tickets de décision d'un effort wayfinder dans le même `issues/` ; il ne porte pas de `Type:` et **ne modifie jamais `map.md`** (la map appartient à `/wayfinder`).
- **`NN` = plus grand numéro existant dans le dossier cible + 1.** Lis les fichiers qui matchent `^\d{2,3}-.*\.md$` (2 ou 3 chiffres), prends le maximum numérique, ajoute 1, et écris sur au moins 2 chiffres (`01`, `02`, …, `99`, `100`).
- Un numéro pris par un fichier existant n'est **jamais réutilisé**, même si son contenu est vide ou abandonné. Si un numéro a été supprimé pendant cette session et que tu le connais, ne le réattribue pas.
- Juste avant d'écrire, **relis le dossier** : une autre session a pu créer un ticket entre-temps. Si le maximum a bougé, prends le nouveau numéro et signale-le dans ton compte rendu.
- Ne remplace jamais un fichier existant : si le chemin existe déjà, recalcule `NN`.

Le **slug** est en minuscules ASCII, mots séparés par des tirets, court et descriptif (`react-board-travailler`, `valide-commit-trigger`).

## 4. État initial : deux valeurs, rien d'autre

Choisis selon la matière réellement produite par la discussion, jamais pour « faire avancer » le ticket :

| Cas | Ligne near-top | Colonne attendue |
|---|---|---|
| Idée brute : on capture vite, le contenu reste à étoffer | **pas de ligne `Status:`** | backlog (`needs-triage` par défaut) |
| Idée discutée : contexte, objectif, contraintes et critères sont déjà solides | `Status: needs-spec` | à spécifier |

Les autres états (`needs-triage`, `ready-for-agent`, `ready-for-human`, `claimed`, `ready-for-review`, `resolved`, `wontfix`) sont **réservés** au user, au kanban ou à d'autres skills : ne les écris jamais.

## 5. Template verrouillé

Respecte exactement cette forme. Dans le ticket, les champs vont **avant la première section `##`** (ne les mets jamais dans un bloc de code). Le corps est **immuable après création** : une correction ultérieure s'ajoute sous `## Comments`, elle ne réécrit pas les sections.

```markdown
# NN — <titre>

[Status: needs-spec]
[Category: Feature]
[Parent: NN]
[Blocked by: NN, NN]

## Contexte

<d'où vient l'idée, ce qui a été discuté, décisions prises, ce qu'il faut savoir sans la conversation>

## Objectif

<ce que « terminé » veut dire, en résultats observables>

## Contraintes

<limites, choix déjà tranchés, ce qu'il ne faut pas faire — ou « — »>

## Critères d'acceptation

- [ ] <critère vérifiable>
- [ ] <critère vérifiable>

## Liens

<chemins relatifs vers la spec, les tickets liés, la map, les fichiers concernés — ou « — »>
```

Dans ce bloc, les **crochets signalent une ligne optionnelle : ne les écris pas**. Les cinq sections et leur ordre sont, eux, obligatoires.

Règles de contenu :

- **Jamais de ligne `Type:`** : ce skill ne produit que la famille implémentation.
- Les lignes `Status:`, `Parent:` et `Blocked by:` sont **optionnelles** et seulement si le cas s'applique. Pas de `Blocked by: -` de remplissage : absence = non bloqué. Les ids sont numériques (`Parent: 14`, `Blocked by: 04, 07`), pas des noms de fichiers.
- `## Contraintes` et `## Liens` peuvent valoir `—`, mais les cinq sections existent toujours, dans cet ordre.
- **Idée discutée** : les critères d'acceptation sont des cases `- [ ]` vérifiables par une session fraîche (comportement observable, commande, fichier attendu) — pas des intentions.
- **Nommer le lieu du test** : si un test est attendu, nomme le fichier (ou la commande exacte) qui doit le porter. Sans ça, la session fraîche redécouvre la convention du projet et improvise.
- **Dire qui coche** : quand une vérification est hors de portée de la session (action du user dans une interface, lancement manuel, choix humain), écris-le dans le critère (« à cocher par le user »). Un critère qu'un agent ne peut pas satisfaire et qui ne dit pas qui le coche bloque la session.
- **Idée brute** (backlog) : écris le contexte et un objectif d'une phrase avec ce qui est connu ; un seul critère `- [ ] À préciser au triage` suffit. Ne fabrique pas de fausse précision.
- Écris dans la langue du projet (français si le projet est en français), en UTF-8.
- **Auto-portage** : aucun « comme discuté », « tu m'as dit », « l'option 2 ci-dessus », aucun renvoi à la conversation. Nomme les fichiers, les chemins, les ids et les décisions explicitement. Aucune hypothèse sur un modèle ou un provider LLM.
- Les liens sont relatifs au fichier du ticket et pointent vers des chemins qui existent (ou qui seront créés par un ticket listé). Un chemin absolu hors du projet est toléré pour un document utilisateur non versionné (ex. `~/.agents/skills/...`) : il est alors écrit tel quel.

## 6. Idée en plusieurs étapes

Ne découpe que si l'idée se décompose en **au moins deux tickets livrables indépendamment**. Sinon, un seul ticket.

1. **Ticket-parapluie d'abord** : il prend le premier numéro. Son `## Objectif` = tous les enfants livrés ; ses `## Critères d'acceptation` = **une checkbox par enfant**, libellée avec le numéro et le titre (`- [ ] 15 — <titre>`).
2. **Enfants ensuite**, dans l'ordre : numéros suivants, chacun avec `Parent: <NN du parapluie>`.
3. **Étapes ordonnées** : chaque enfant dépend du précédent avec `Blocked by: <NN précédent>` (chaîne). Enfants indépendants : **aucun** `Blocked by:` entre eux.
4. **Pas de cercle** : un parent n'apparaît **jamais** dans le `Blocked by:` de ses enfants ; le parapluie n'est pas bloqué par ses enfants. Un enfant n'est jamais son propre parent.
5. Si l'idée rejoint un **parapluie existant**, crée seulement le ou les enfants avec `Parent: <NN existant>` ; s'ils sont ordonnés, chaîne à partir du dernier enfant existant.
6. Le parapluie sera validé par le user quand tous ses enfants seront terminés — ce skill ne pose jamais `resolved`.

## 7. Écriture : directe, sans serveur ni git

- Écris les fichiers **directement** avec tes outils habituels. Le serveur kanban peut être arrêté : les fichiers `.scratch/` sont la source de vérité.
- **Aucun appel HTTP** au kanban (pas de création via API : elle n'existe pas en v1).
- **Aucune commande git** (ni `status`, ni `add`, ni `commit`) : les nouveaux fichiers restent non commités. Le commit suit l'habitude normale de fin de session, ou le trigger « Validé » qui rattrape les orphelins.
- **Création uniquement** : ne réécris, ne renomme et ne supprime aucun ticket existant, y compris un ticket créé plus tôt dans la session. Si une correction est demandée après coup, elle s'ajoute sous `## Comments` (append) — le corps ne bouge jamais — ou c'est le user qui la fait.
- Après confirmation, écris tous les fichiers d'un coup ; vérifie chaque chemin avant écriture (existence, numéro libre).

## 8. Contrôle final

Avant de rendre compte, relis chaque fichier créé :

- [ ] nom `NN-slug.md` dans `.scratch/<feature>/issues/`, numéro unique = max+1 du dossier ;
- [ ] titre `# NN — <titre>` (tiret cadratin), même `NN` que le nom de fichier ;
- [ ] aucune ligne `Type:` ;
- [ ] `Status:` absent ou `needs-spec` uniquement ; `Parent:`/`Blocked by:` corrects et hors blocs de code ;
- [ ] cinq sections exactes, dans l'ordre, critères en `- [ ]` ;
- [ ] chaîne de blocages sans cercle, ids référencés existants ;
- [ ] lecture autonome : aucune référence à la conversation, aucun modèle/provider supposé ;
- [ ] liens relatifs valides.

## 9. Compte rendu

Termine par un rapport court :

- les chemins créés, avec l'état initial et la colonne attendue (backlog / à spécifier) ;
- les relations (`Parent:`, `Blocked by:`) et l'ordre des enfants ;
- « aucun git effectué, aucun appel serveur » ;
- la suite utile pour le user : relire, déplacer dans le board, lancer une session, ou valider le parapluie quand les enfants sont terminés.
