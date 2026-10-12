#!/usr/bin/env sh
# Refresh the served VSIX: build the extension, copy the .vsix into
# web/public/downloads/ (which IS committed — deploys are clean checkouts),
# and rewrite the baked constants in web/components/Download.tsx so the
# landing page, Hero, Settings and the docs guide all point at the exact
# file they ship (URL, sha256, size, version).
#
# Usage: sh web/scripts/copy-vsix.sh   (from anywhere)
# Then:  cd web && npx next build  (sanity), and commit everything it touched.
set -eu
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION="$(node -p "require('$REPO_ROOT/extension/package.json').version")"
VSI_NAME="deadend-${VERSION}.vsix"
DOWNLOADS="$REPO_ROOT/web/public/downloads"
DEST="$DOWNLOADS/$VSI_NAME"
DOWNLOAD_TS="$REPO_ROOT/web/components/Download.tsx"

echo "› extension version: ${VERSION}"
echo "› packaging ${VSI_NAME}…"(cd "$REPO_ROOT/extension" && npx vsce package -o "dist/${VSI_NAME}")

[ -f "$REPO_ROOT/extension/dist/${VSI_NAME}" ] || {
  echo "expected extension/dist/${VSI_NAME} not found" >&2; exit 1;
}

# drop stale copies from BOTH the served downloads folder AND the extension build folder
mkdir -p "$DOWNLOADS"
find "$DOWNLOADS" -maxdepth 1 -name 'deadend-*.vsix' ! -name "$VSI_NAME" -delete
find "$REPO_ROOT/extension/dist" -maxdepth 1 -name 'deadend-*.vsix' ! -name "$VSI_NAME" -delete

cp "$REPO_ROOT/extension/dist/${VSI_NAME}" "$DEST"

SHA="$(sha256sum "$DEST" | cut -d' ' -f1)"
BYTES="$(wc -c < "$DEST" | tr -d ' ')"
# ceiling in KB — matches the human size shown on the page ("36 KB")
SIZE="$(awk -v b="$BYTES" 'BEGIN { printf "%d KB", (b + 1023) / 1024 }')"
printf '%s  %s\n' "$SHA" "$VSI_NAME" > "$DOWNLOADS/${VSI_NAME}.sha256"

# rewrite the four baked constants — single source of truth for the UI
python3 - "$DOWNLOAD_TS" "$VERSION" "$SHA" "$SIZE" <<'PY'
import re, sys
path, version, sha, size = sys.argv[1:5]
src = open(path).read()
subs = {
    "VSIX_RELEASE_URL": f'export const VSIX_RELEASE_URL = "/downloads/deadend-{version}.vsix";',
    "VSIX_SHA256": f'export const VSIX_SHA256 = "{sha}";',
    "VSIX_SIZE": f'export const VSIX_SIZE = "{size}";',
    "VSIX_VERSION": f'export const VSIX_VERSION = "{version}";',
}
for name, line in subs.items():
    src, n = re.subn(rf"^export const {name} = .*;$", line, src, flags=re.M)
    if n != 1:
        sys.exit(f"could not rewrite {name} in {path}")
open(path, "w").write(src)
print(f"› rewrote constants in {path}")
PY

# the served file must be in git — stage it so it can't be forgotten
git -C "$REPO_ROOT" add -f "$DEST" "$DOWNLOADS/${VSI_NAME}.sha256"
git -C "$REPO_ROOT" add "$DOWNLOAD_TS"

echo "› ${VSI_NAME}: ${BYTES} bytes, sha256 ${SHA}"
echo "› updated ${DOWNLOAD_TS#"${REPO_ROOT}/"} and staged the artifacts."
echo "› next: cd web && npx next build, then commit and push."
