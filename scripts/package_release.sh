#!/bin/zsh
set -euo pipefail

SCRIPT_DIR=${0:A:h}
PROJECT_DIR=${SCRIPT_DIR:h}
ARTIFACT_DIR="$PROJECT_DIR/dist"
MAC_ZIP="$PROJECT_DIR/apps/macos/dist/Relay-macOS.zip"

cd "$PROJECT_DIR"
mkdir -p "$ARTIFACT_DIR"

rm -f "$ARTIFACT_DIR"/*.tgz "$ARTIFACT_DIR/Relay-macOS.zip" "$ARTIFACT_DIR/SHA256SUMS.txt"
"$PROJECT_DIR/scripts/build_cli.sh"

if [[ "$(uname -s)" == "Darwin" ]] && command -v swift >/dev/null 2>&1; then
  "$PROJECT_DIR/apps/macos/scripts/build_app.sh"
  cp "$MAC_ZIP" "$ARTIFACT_DIR/Relay-macOS.zip"
else
  echo "Skipping the macOS app because Swift on macOS is required."
fi

cd "$ARTIFACT_DIR"
shasum -a 256 ./*.tgz > SHA256SUMS.txt
if [[ -f Relay-macOS.zip ]]; then
  shasum -a 256 Relay-macOS.zip >> SHA256SUMS.txt
fi

echo "Release artifacts: $ARTIFACT_DIR"
