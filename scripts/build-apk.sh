#!/usr/bin/env bash
# Build the NG Marshal field app APK.
#   ./scripts/build-apk.sh            → dist/NG-Marshal-<version>.apk (debug-signed, sideloadable)
#
# Toolchain (installed via Homebrew, no Android Studio):
#   openjdk@21 + android-commandlinetools (+ platform-tools, platforms;android-35, build-tools;35.0.0)
set -euo pipefail
cd "$(dirname "$0")/.."

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

VERSION=$(node -p "require('./package.json').version")
APK_OUT="dist/NG-Marshal-v${VERSION}.apk"

echo "── 1/4 static export (api routes excluded — unsupported in export mode)"
restore_api() { [ -d /tmp/ngm-api-backup ] && rm -rf src/app/api && mv /tmp/ngm-api-backup src/app/api || true; }
trap restore_api EXIT
rm -rf /tmp/ngm-api-backup
[ -d src/app/api ] && mv src/app/api /tmp/ngm-api-backup
rm -rf .next out
NEXT_OUTPUT=export npx next build
restore_api
trap - EXIT

echo "── 2/4 capacitor sync"
[ -d android ] || npx cap add android
npx cap sync android

echo "── 3/4 gradle assembleDebug"
cd android
./gradlew --quiet assembleDebug
cd ..

echo "── 4/4 collect apk"
mkdir -p dist
cp android/app/build/outputs/apk/debug/app-debug.apk "$APK_OUT"
echo ""
echo "✓ APK ready: $APK_OUT ($(du -h "$APK_OUT" | cut -f1 | tr -d ' '))"
