#!/bin/zsh
set -euo pipefail

SCRIPT_DIR=${0:A:h}
PROJECT_DIR=${SCRIPT_DIR:h}
APP_DIR="$PROJECT_DIR/dist/Relay.app"
ZIP_PATH="$PROJECT_DIR/dist/Relay-macOS.zip"
MODULE_CACHE="$PROJECT_DIR/.build/module-cache"

export CLANG_MODULE_CACHE_PATH="$MODULE_CACHE"
export SWIFTPM_MODULECACHE_OVERRIDE="$MODULE_CACHE"

cd "$PROJECT_DIR"
mkdir -p "$MODULE_CACHE"
swift build --disable-sandbox -c release

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
cp .build/release/PassOnDock "$APP_DIR/Contents/MacOS/Relay"
cp Info.plist "$APP_DIR/Contents/Info.plist"
chmod +x "$APP_DIR/Contents/MacOS/Relay"

codesign --force --deep --sign - "$APP_DIR"
rm -f "$ZIP_PATH"
ditto -c -k --sequesterRsrc --keepParent "$APP_DIR" "$ZIP_PATH"

echo "$APP_DIR"
echo "$ZIP_PATH"
