---
name: feature-workflow
description: Procédure de modification de code protégée — branche de brouillon, points de sauvegarde, livraison, nettoyage. À charger dès qu'une demande touche au code d'un projet git (couleur, style, page, fonctionnalité, correction — même petite), et systématiquement quand la règle « protéger la version livrée » d'AGENTS.md s'applique. Détaille les déclencheurs, le lexique à employer, la livraison et les dégradations.
---

# feature-workflow — de l'idée à la livraison en langage naturel

Le user mène une feature en phrases courtes ; **tu fais le git et les builds**, le user ne fait
que vérifier (F5 / tests) et trancher. Le git n'intervient qu'aux bornes (**début / sauvegarde /
livraison / nettoyage**) ; la boucle d'itération est **édition + rebuild uniquement**.

Le dossier du projet **ne change jamais** : seule la branche courante change. Après chaque
changement de branche ou de code, le build est **obligatoire** avant de proposer quoi que ce soit
de voir.

## 1. Les mots à employer (dans ton dialogue, jamais dans tes commandes)

| Ce qu'il y a sous le capot | Ce que tu dis | Ce que tu ne dis pas |
|---|---|---|
| branche de travail, `dev-*`, `feature/x` | **ta branche de brouillon** | « branche de travail », « feature branch » |
| `master`, `main`, autre branche livrée | **la version que tu livres** | « branche livrable », « master » seul |
| un commit | **un point de sauvegarde** | « commit de sécurité » |
| un merge | **ranger**, **intégrer** | « merge », « mergé » |
| push / merge vers la version livrée | **livrer**, **publier** | « push », « publier sur master » |

Deux règles qui vont avec :

- **Les noms propres du projet restent exacts** : « ta branche `main` », « `feature/fond-bleu` »,
  jamais un nom masqué. Un conflit ou un échec doit rester diagnosticable — le concept est simple,
  le nom est vrai.
- **Le mot « validé » ne veut jamais dire « carte terminée »** : il vaut « c'est bon » (§ 3). Tu
  n'écris **jamais** de ligne `Status:` et tu ne touches pas au statut de la carte : seul le bouton
  « Validé » du board clôture un ticket. Si le user parle de clôturer, dis-le : « je ne clôture pas
  le ticket — c'est ton clic sur Validé qui le fait ».

## 2. Mise en route : une seule question, avec une proposition

Au démarrage, établis les paramètres du projet courant. Cherche d'abord dans `AGENTS.md`,
`package.json`, la doc, l'état git. **Tu ne poses qu'une seule question**, et seulement si un
paramètre important n'est pas évident — en **proposant un défaut** :

> « Je pars du principe que tu livres `main` et que ça se construit avec `npm run build` —
> dis-moi si c'est autre chose. »

| Paramètre | Exemple | Comment trancher |
|---|---|---|
| **La version que tu livres** | `main` | branche par défaut du repo ; **proposer un défaut**, ne jamais supposer en silence |
| **Ta branche de brouillon** | `dev-piban`, ou aucune | branche courante si elle diffère de la livrée ; **aucune question de topologie** : si elle n'existe pas, il n'y en a pas besoin (§ 4) |
| **Commande de build** | `cd web && npm run build` | scripts du projet ; proposer si doute |
| **Artefact / moyen de vérifier** | board sur `http://…/`, tests | URL du build servi ou commande de tests ; **le user vérifie lui-même** |
| **Projet piban + port** | `piban`, `18787` | seulement si la livraison passe par l'API (§ 5) |

Si tout est évident : **agis immédiatement** et énonce les paramètres retenus dans l'annonce. Tu ne
reposes plus de question ensuite, **sauf** pour un geste qui compte : livrer, supprimer, écraser.

**Pré-requis** : dépôt git. Sinon, refuse poliment le workflow (« cette méthode repose sur des
branches et des points de sauvegarde — sans git, je ne peux pas ») et propose d'éditer + builder
sans gestion de versions.

**Identité git absente** (installation fraîche : `git commit` échoue faute de `user.name` /
`user.email`) : constate-le, dis-le en clair (« git refuse d'enregistrer : aucune identité
configurée sur cette machine — je ne la configurerai pas à ta place ») et rends la main.
**Jamais** de `git config user.name` / `user.email` écrit par toi.

## 3. Déclencheurs : deux portes seulement

| Le user dit | Tu fais (invisible) | Tu annonces (une ligne + état) |
|---|---|---|
| « je veux ajouter/changer **X** » | `git checkout -b feature/<slug>` **depuis ta branche de brouillon** (1×) → édition → **rebuild** | « Branche créée, X modifié, c'est buildé — *brouillon modifié, rien d'enregistré*. » |
| itération : « trop clair », « c'est mieux », **« non reviens »** | édition → **rebuild**. **Aucune mutation git** (lectures `git` de contrôle permises) | « C'est ajusté — *brouillon modifié, rien d'enregistré*. » |
| « montre-moi la version d'avant » | **stash** du travail (`git stash push -m "wip <slug>"`) → `git checkout <livrée>` → **rebuild** | « Voilà la version que tu livres — *rien d'enregistré, rien de livré*. » |
| « reviens à ma version » | `git checkout feature/<slug>` → `git stash pop` → **rebuild** | « Revenu sur ton brouillon — *brouillon modifié, rien d'enregistré*. » |
| **« c'est bon »** — tolérance large : « validé », « ok », « parfait », « nickel », « ça marche », « c'est tout bon » | **point de sauvegarde** sur la branche feature (`git commit -m "<slug> — <ce qui est fait>"`) **puis, s'il existe une branche de brouillon** : `git checkout <brouillon>` → `git merge feature/<slug>` → `git checkout feature/<slug>` → **rebuild** | « Point de sauvegarde pris — *enregistré, rien n'est livré*. » |
| **« publie »** / « livre » — tolérance **stricte** | § 5 | « C'est livré : N commits dans `<livrée>` — *livré*. » (ou « local », ou refus) |
| **« nettoie »** | `git branch -D feature/<slug>` (garde § 6) | « Branche supprimée — *le travail est enregistré* (et livré). » |

**Tolérance asymétrique** — c'est la règle centrale :

- **Sauvegarder** est sans risque et réversible : accepte un large éventail de formulations.
- **Livrer** engage la version que le user distribue : **seuls** « publie » / « livre » déclenchent.
  « pousse », « envoie », « mets en prod », « balance », « ok » ne suffisent **pas**.
- **Hors tolérance** : tu ne devines **jamais** et tu n'ignores **jamais**. Tu poses **une**
  question fermée avec ta proposition : « Tu parlais de livrer ? Rien n'est encore parti. »
  Une question en trop est aussi coûteuse qu'une question manquante.

Règles d'application :

- **Arbre sale et changement de branche** : `git checkout` refuse. Avant de quitter la branche
  feature, `git stash push -m "wip <slug>"` ; au retour, `git stash pop`. Jamais de commit
  improvisé pour changer de branche, jamais de `checkout -f`, jamais de `reset --hard`.
- `feature/<slug>` : un seul slug par feature, minuscules, tirets (`couleurs-pastel`). Créée **une
  seule fois** ; « non reviens » n'en crée pas.
- Le user peut itérer **après** un point de sauvegarde : nouveaux points de sauvegarde sur la
  feature (un par palier), jamais d'`amend` ni de `rebase`.

## 4. Le projet n'a pas de branche de brouillon

Beaucoup de projets n'ont qu'une branche (`main`) : c'est normal, **ce n'est pas une question à
poser**.

- `feature/<slug>` est créée **depuis la version livrée**.
- « c'est bon » = **point de sauvegarde seulement** (rien à ranger, il n'y a pas de brouillon).
- « publie » = intégration **directe** `feature/<slug>` → livrée, avec confirmation explicite avant
  le merge (§ 5, cas « API non applicable »).
- `feature/<slug>` reste donc non mergée jusqu'à la livraison : c'est attendu, ne le signale pas
  comme une anomalie.

Si un jour le user veut une branche de brouillon, il le dira — tu ne la crées pas de ta propre
initiative.

## 5. Livraison (« publie »)

**Préconditions** : le travail est enregistré (§ 3, « c'est bon »). S'il ne l'est pas, fais le
point de sauvegarde **et** le rangement dans le brouillon **avant** de livrer (c'est le même geste,
annonce-le simplement). Puis il faut être sur **ta branche de brouillon** — si tu es sur
`feature/<slug>` et qu'une branche de brouillon existe, `git checkout <brouillon>` d'abord (l'arbre
est propre après le point de sauvegarde, aucun stash nécessaire). Sans branche de brouillon, tu
restes sur `feature/<slug>` : c'est elle qui part vers la livrée (§ 4). Jamais HEAD détaché.

**Cas nominal — projet géré par un kanban piban en service** : même mécanique que le bouton 🚀 :

```sh
# 1. aperçu en lecture seule (ne livre rien)
curl http://127.0.0.1:<port>/api/projects/<nom-du-projet>/publish

# 2. le geste, seulement après l'annonce
curl -X POST http://127.0.0.1:<port>/api/projects/<nom-du-projet>/publish
```

- `<port>` : config piban de la machine (`~/.pi/agent/extensions/piban.config.json` → `repoRoot`
  → `config.local.json` / `config.json`, champ `port`). `<nom-du-projet>` : nom connu du kanban.
- **L'aperçu est pour toi, pas une seconde confirmation** : le « publie » du user **est** l'accord.
  Exception : si l'aperçu montre quelque chose d'inattendu (dizaines de commits, mauvaise branche,
  fichiers étrangers), tu t'arrêtes et tu demandes. La livraison emporte **l'état entier de la
  branche de brouillon**, pas seulement la feature en cours — dis-le si l'écart est notable
  (« dont 4 commits hors de ta feature »).

**Refus de l'API — arrêt, rien de forcé** : conflit (409 + fichiers) → liste les fichiers, « rien
n'est forcé », attends ; `on-master` → rien à livrer ; `detached-head` → à régler ; `master-checked-out`
→ demande au user de libérer la branche ; `no-master` → voir ci-dessous.

**API non applicable** (livrable ≠ `master` — nom codé en dur côté serveur, ticket 26 —, kanban
arrêté, projet non géré par piban) : deux issues, annoncées **avant** d'agir —
(a) merge + push **manuels**, avec **confirmation explicite avant chaque commande git**, ou
(b) t'arrêter avant le merge en le disant. Jamais de merge dans la version livrée sans un `POST`
réussi ou un accord explicite pour (a).

**Sans remote `origin`** : la livraison reste locale. Annonce « C'est livré en local — aucun dépôt
distant, rien à pousser — *livré* », sans le présenter comme une erreur.

## 6. Règles de fer

1. **Rebuild obligatoire** après chaque changement de branche ou de code, avant toute annonce de
   vérification.
2. **Jamais de commit direct sur la version livrée.** Elle n'avance que par la livraison (§ 5).
3. **Jamais de force** : pas de `-f`, pas de `reset --hard` sur une avancée, pas de réécriture
   d'historique.
4. **Conflit → arrêt immédiat** : liste les fichiers, dis que rien n'est forcé ni résolu, attends.
   Aucune résolution automatique, aucune sans accord explicite.
5. **La vérification est l'action du user** (F5, tests). Tu n'annonces jamais « vérifié », « ça
   marche », « le contraste est bon » : « c'est buildé — refresh », et le user juge.
6. **Jamais de `Status:`** ni de changement de statut de carte, quel que soit le mot employé.
7. **« Nettoie »** : seulement si la feature est déjà intégrée (vérifier `git log`) ; sinon, dis-le
   et ne supprime rien.

## 7. Signature d'état (fin de chaque annonce)

Une ligne, au présent, sans jargon, **toujours terminée par l'état** — même formulation à chaque
fois, c'est ce qui rend l'état lisible sans réfléchir :

| Situation | Signature |
|---|---|
| travail modifié, rien d'enregistré | *brouillon modifié, rien d'enregistré* |
| point de sauvegarde pris | *enregistré, rien n'est livré* |
| livré | *livré* (ou *livré en local*) |
| rien n'a changé | *rien n'a bougé* |
| conflit / refus | *rien n'est forcé, rien n'est livré* |

Avant d'annoncer, vérifie l'état (lectures `git` : permises, ce ne sont pas des mutations) :
`git branch --show-current` = la branche que tu crois ; `git log --oneline -3` = le point de
sauvegarde / l'intégration attendus ; le build a couru **après** le dernier changement.

Compte rendu : **une ligne**, dans la langue du projet. Ces phrases sont des modèles — garde le
même niveau de détail et de simplicité, et ne remplace **jamais** les noms de branches par des
périphrases.
