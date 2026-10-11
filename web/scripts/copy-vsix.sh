#!/usr/bin/env sh
# Rebuild the extension .vsix and refresh the web download copy.
# Usage: sh scripts/copy-vsix.sh   (from web/, or anywhere)
set -eu
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "building extension…"
(cd "$REPO_ROOT/extension" && npm run compile && npx vsce package -o dist/deadend-0.1.0.vsix)

mkdir -p "$REPO_ROOT/web/public/downloads"
cp "$REPO_ROOT/extension/dist/deadend-0.1.0.vsix" \
   "$REPO_ROOT/web/public/downloads/deadend-0.1.0.vsix"

SUM=$(sha256sum "$REPO_ROOT/web/public/downloads/deadend-0.1.0.vsix" | cut -d' ' -f1)
printf '%s  deadend-0.1.0.vsix\n' "$SUM" \
  > "$REPO_ROOT/web/public/downloads/deadend-0.1.0.vsix.sha256"
echo "checksum: $SUM"
echo "copied to web/public/downloads/ (force-add in git: git add -f web/public/downloads/*.vsix)"
