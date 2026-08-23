#!/bin/zsh
set -euo pipefail

SCRIPT_DIR=${0:A:h}
PROJECT_DIR=${SCRIPT_DIR:h}
ARTIFACT_DIR="$PROJECT_DIR/dist"
NPM_CACHE=$(mktemp -d "${TMPDIR:-/tmp}/relay-npm-cache.XXXXXX")

cleanup() {
  rm -rf "$NPM_CACHE"
}
trap cleanup EXIT

cd "$PROJECT_DIR"
mkdir -p "$ARTIFACT_DIR"
npm pack --cache "$NPM_CACHE" --pack-destination "$ARTIFACT_DIR"
