#!/usr/bin/env bash
# Build the extract_thumbnails sidecar binary for the current platform.
#
# Usage:
#   scripts/build-sidecar.sh
#
# Requirements:
#   pip install pyinstaller unitypy pillow
#
# Output:
#   src-tauri/sidecar/extract_thumbnails-<target-triple>[.exe]
#
# The Tauri sidecar naming convention requires the binary name to include the
# target triple, matching what `rustc -vV` reports as `host:`.
# See: https://tauri.app/v2/guides/bundling/sidecar/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SIDECAR_DIR="$REPO_ROOT/src-tauri/sidecar"
SOURCE="$SIDECAR_DIR/extract_thumbnails.py"

# Detect target triple from rustc
TARGET_TRIPLE="$(rustc -vV 2>/dev/null | awk '/^host:/{print $2}')"
if [[ -z "$TARGET_TRIPLE" ]]; then
  echo "Error: could not determine target triple from rustc. Is Rust installed?" >&2
  exit 1
fi

BINARY_NAME="extract_thumbnails-${TARGET_TRIPLE}"
echo "Building sidecar: $BINARY_NAME"
echo "Source: $SOURCE"
echo "Output: $SIDECAR_DIR/"

# Build with PyInstaller into a temp dist dir, then move the binary into sidecar/
DIST_DIR="$(mktemp -d)"
trap 'rm -rf "$DIST_DIR"' EXIT

python3 -m PyInstaller \
  --onefile \
  --name "$BINARY_NAME" \
  --distpath "$DIST_DIR" \
  --workpath "$DIST_DIR/build" \
  --specpath "$DIST_DIR" \
  "$SOURCE"

# Move binary to sidecar directory
if [[ "$TARGET_TRIPLE" == *"windows"* ]]; then
  mv "$DIST_DIR/${BINARY_NAME}.exe" "$SIDECAR_DIR/${BINARY_NAME}.exe"
  echo "Written: $SIDECAR_DIR/${BINARY_NAME}.exe"
else
  mv "$DIST_DIR/$BINARY_NAME" "$SIDECAR_DIR/$BINARY_NAME"
  chmod +x "$SIDECAR_DIR/$BINARY_NAME"
  echo "Written: $SIDECAR_DIR/$BINARY_NAME"
fi

echo "Done. Run 'npm run tauri build' to bundle this sidecar with the app."
