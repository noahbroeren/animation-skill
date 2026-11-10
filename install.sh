#!/usr/bin/env bash
# Install video-forge into ~/.claude/skills and set up dependencies.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/video-forge"
PY="${PYTHON:-python3}"
mkdir -p "$(dirname "$DEST")"
if [ -e "$DEST" ] && [ ! -L "$DEST" ]; then echo "Updating $DEST"; fi
rsync -a --delete --exclude node_modules --exclude out "$HERE/skill/video-forge/" "$DEST/"
"$PY" -m pip install -r "$DEST/analyzer/requirements.txt"
(cd "$DEST/engine" && npm install --no-audit --no-fund)
node "$DEST/scripts/doctor.mjs" || true
echo "Installed to $DEST"
