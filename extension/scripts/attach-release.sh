#!/usr/bin/env sh
# Attach the built .vsix to a GitHub release (does not publish to Marketplace).
# Usage: sh scripts/attach-release.sh [version]
# Requires: gh CLI authenticated in this checkout; existing tag optional.
set -eu
VERSION="${1:-0.1.0}"
VSIX="dist/deadend-${VERSION}.vsix"
REPO="${GITHUB_REPO:-gowthamchoudhary/DeadEnd}"
TAG="v${VERSION}"

if [ ! -f "$VSIX" ]; then
  echo "missing $VSIX — build it first: (cd extension && npm run package)" >&2
  exit 1
fi

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "$VSIX" --repo "$REPO" --clobber
else
  gh release create "$TAG" "$VSIX" --repo "$REPO" \
    --title "DeadEnd VS Code extension v${VERSION}" \
    --notes "Install: Extensions → ⋯ → Install from VSIX. Agents supported: claude-code, codex, opencode, pi, antigravity, copilot-cli (see SUPPORT.md)."
fi
echo "attached $VSIX to release $TAG"
