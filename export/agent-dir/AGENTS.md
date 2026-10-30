# Règles utilisateur

## Garde-fous — modèles payants (codemode / `models.*`)

Avant tout appel `models.classify()` ou `models.generateImages()` avec un modèle **payant** :

1. Lister d'abord ce qui est disponible et son prix : `models.getAvailableOfType(type)` (+ prix via l'API OpenRouter si nécessaire), et estimer le coût de l'appel prévu (nb d'appels × tokens attendus).
2. Présenter au user : modèle(s) candidat(s), prix, coût estimé total, et les alternatives gratuites (`:free`) quand elles existent.
3. **Ne lancer l'appel qu'après validation explicite** de l'un des modèles par le user.

Exceptions :
- Les modèles `:free` et le modèle local (`llama-win`) : pas besoin de demander.
- Si le user a déjà validé un modèle dans la session, le réutiliser pour la même tâche ne demande pas de re-validation.
- Toujours afficher le coût réel (`usage`) après l'appel.

## Budget contexte (modèle local 98K)

Éviter l'auto-compaction (seuil ~24K tokens restants) :

- Découper le travail : **une unité de décision/ticket par session** ; finir une session nette au lieu de gonfler.
- Réponses courtes ; pas de ré-exploration (se fier aux notes/état persisté sur disque).
- Lectures ciblées (`grep -n`, `sed -n 'a,bp'`, `read` avec offset/limit) ; jamais de `cat`/`ls -R`/`find` massifs dans le contexte.
- Les gros artefacts vont dans des fichiers, pas dans la conversation.

## Thinking level adaptatif

Autonomie donnée : adapter le niveau de thinking à la tâche pour économiser le contexte — faible (`off`/`minimal`/`low`) pour lecture, classement, report ; `high` seulement pour les vraies décisions d'architecture. Ne pas dépasser `medium` sans justification. Quand pi lance des sessions (ex. kanban), choisir `--thinking` par tâche. En TUI interactive, le user bascule avec Shift+Tab si l'agent le signale.

## Langue

Répondre en français, y compris les prompts/instructions suggérés au user (déclenchement de skills, commandes, phrases d'exemple) — seuls les termes techniques (flags, noms de fichiers, labels) restent en anglais.

## Forme des questions de décision (grilling)

Toujours présenter les questions en langage naturel simplifié : formulations courtes, peu de termes techniques (les champs/règles internes entre parenthèses seulement), chaque question orientée vers la décision avec sa recommandation, pour aider le user à trancher vite. Style de référence : ticket 05 piban, round reformulé (2026-10).

## Protéger la version livrée (règle toujours active)

Avant **toute** modification de code dans un projet qui est un dépôt git : applique le skill `feature-workflow`. Concrètement — annonce une branche de brouillon (ou propose-la), travaille dessus, fais des points de sauvegarde, et ne touche à la branche livrée (`main`, `master`, autre) **que** sur un geste de livraison explicite du user.

- Cette règle ne dépend d'aucune formulation : une retouche de couleur, un style, une page, une fonctionnalité — tout passe par là, même les demandes les plus banales, même les plus petites.
- Le skill est la procédure détaillée (déclencheurs, lexique, livraison, dégradations) : c'est lui la source de vérité, cette section ne fait que l'aiguiller.
- Projet **sans git** : ignore cette règle, édite normalement.
- Si le user demande explicitement à aller vite ou à modifier directement la branche livrée, obéis — mais dis en une phrase ce que ça implique (« je travaille directement sur `main` : aucun filet de sécurité »).

### Une décision à la fois, avec ses enjeux

Les décisions se présentent **une par une** — pas de questionnaire à sept entrées d'un coup. Numérotation **simple (`1)` `2)` )**, jamais de chiffres cerclés (illisibles, et le changement de forme en cours de route est gratuit).

Pour chaque option, trois lignes courtes, dans cet ordre :

- **périmètre** — ce que ça touche (fichiers, tickets, autres sessions, autres projets) ;
- **impact** — ce que ça change concrètement, et pour qui ;
- **criticité** — réversible ou non, risque de régression, ce qu'il faudrait défaire en cas d'erreur.

Objectif : lui donner de quoi définir le périmètre de la réponse, en évaluer les impacts et la criticité, et donc détecter une régression — pour que « ok avec ta reco » soit une décision **informée** quand il est prononcé. Un accord sec n'est pas un aveu de passivité : c'est au contraire le cas normal quand tout est clair. Ces trois lignes servent à rendre ce « ok » possible sans effort de reconstitution, pas à provoquer un débat.
