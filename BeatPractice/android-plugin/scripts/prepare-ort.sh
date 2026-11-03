#!/usr/bin/env bash
# Fetches ONNX Runtime for Android (the official .aar from Maven Central) and lays it out the way beat-core's CMake expects:
#   <out>/include/...   <out>/lib/libonnxruntime.so      and copies the .so to jniLibs so that Gradle packages it.
# Usage: scripts/prepare-ort.sh <android project root>   (the version must match the desktop build: 1.22.0)
set -euo pipefail
ROOT="${1:?path of the Android project (the folder with android/)}"
VER=1.22.0
OUT="$ROOT/onnxruntime-android"
mkdir -p "$OUT/tmp" && cd "$OUT/tmp"
curl -fL -o ort.aar "https://repo1.maven.org/maven2/com/microsoft/onnxruntime/onnxruntime-android/$VER/onnxruntime-android-$VER.aar"
unzip -q -o ort.aar
mkdir -p "$OUT/include" "$OUT/lib" "$ROOT/android/app/src/main/jniLibs/arm64-v8a"
cp -r headers/* "$OUT/include/"
cp jni/arm64-v8a/libonnxruntime.so "$OUT/lib/"
cp jni/arm64-v8a/libonnxruntime.so "$ROOT/android/app/src/main/jniLibs/arm64-v8a/"
cd "$OUT" && rm -rf tmp
echo "ONNX Runtime $VER ready in $OUT"
# Google Play (apps that target Android 15+) needs every native library aligned to 16 KB pages. Check the result with:
#   zipalign -c -P 16 -v 4 app-release.apk | grep -v OK
