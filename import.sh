#!/bin/sh
# piban-migration — import sur l'ordi du travail (WSL).
# Usage : ./import.sh [PROJECTS_ROOT]
#   PROJECTS_ROOT : dossier des projets vu de WSL (défaut : $HOME/projets)
# Ne touche PAS ~/.pi/agent (pi existant) — tout va dans ~/.pi/agent-piban.
set -eu

PROJECTS_ROOT="${1:-$HOME/projets}"
PI_DIR="$HOME/.pi/agent-piban"
SRC="$(cd "$(dirname "$0")" && pwd)/export"
P="$PROJECTS_ROOT/piban"

command -v pi >/dev/null 2>&1 || { echo "ERREUR : 'pi' introuvable dans PATH (WSL)."; exit 1; }
if [ -d "$PI_DIR" ] && [ ! -f "$PI_DIR/.piban-migration-imported" ]; then
  echo "ERREUR : $PI_DIR existe sans marker d'import — import interrompu ?" >&2
  echo "Inspecte le dossier, puis soit supprime-le pour repartir à zéro, soit crée le marker : touch $PI_DIR/.piban-migration-imported" >&2
  exit 1
fi

echo "== 1/5 config pi piban -> $PI_DIR"
mkdir -p "$PI_DIR"
if [ -f "$PI_DIR/.piban-migration-imported" ]; then
  echo "déjà importé — étapes 1-2 sautées"
else
  cp -a "$SRC/agent-dir/." "$PI_DIR/"
  echo "== 2/5 paquetages pi (pi-subagents, pi-web-access)"
  (cd "$PI_DIR/npm" && npm install --no-fund --no-audit --loglevel=error)
  touch "$PI_DIR/.piban-migration-imported"
fi

echo "== 3/5 repo piban -> $P"
mkdir -p "$PROJECTS_ROOT"
if [ -d "$P/.git" ]; then
  echo "piban déjà cloné ici — pull seulement"
  (cd "$P" && git checkout dev-piban 2>/dev/null || git checkout -b dev-piban master && git pull origin master --ff-only)
else
  git clone git@github.com:pb0kaoss-create/piban.git "$P"
  (cd "$P" && git checkout -b dev-piban)
fi
(cd "$P" && npm ci --no-fund --no-audit --loglevel=error)
(cd "$P" && npm run build --silent)

echo "== 4/5 config machine piban (chemins adaptés)"
# repoRoot dans l'extension piban
sed -i "s|/mnt/e/dev/projets/piban|$P|" "$PI_DIR/extensions/piban.config.json"
# config.local.json (port, projectsRoot, tty)
sed "s|/mnt/e/dev/projets|$PROJECTS_ROOT|" "$SRC/piban/config.local.json" > "$P/config.local.json"
cat "$P/config.local.json"

echo "== 5/5 alias pi-piban"
if ! grep -q 'pi-piban' ~/.bashrc 2>/dev/null; then
  echo "alias pi-piban='PI_CODING_AGENT_DIR=\"\$HOME/.pi/agent-piban\" pi'" >> ~/.bashrc
fi

echo
echo "OK. Prochaines étapes :"
echo "  1) source ~/.bashrc   (ou nouveau terminal)"
echo "  2) pi-piban           -> au 1er lancement : configurer les clés API / modèle"
echo "     (auth.json : SAMAIS copié ici — à ressaisir dans le pi piban)"
echo "  3) Vérifier : liste de skills au démarrage = lot piban uniquement"
echo "     (le ~/.agents/skills du pi existant doit être exclu)"
echo "  4) cd $P && npm start -> board sur http://localhost:18787"
echo "  5) pi (existant) démarre toujours avec SES skills — vérifier aussi"
