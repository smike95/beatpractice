#!/bin/bash
# The macOS installer window: two huge icons (the app and the Applications folder) and nothing else; the window is fitted to the icons.
# Usage: make-dmg.sh <rust_target> <arch-label>      (run from the repository root, after `tauri build`)
# Needs create-dmg (brew install create-dmg). The result replaces the .dmg that Tauri made in bundle/dmg.
set -euo pipefail

TARGET="$1"; ARCH="$2"
BUNDLE="BeatPractice/src-tauri/target/${TARGET}/release/bundle"
APP="$(find "${BUNDLE}" -maxdepth 2 -name '*.app' -type d | head -1)"
if [ -z "${APP}" ]; then echo "No .app found under ${BUNDLE}:"; ls -R "${BUNDLE}" || true; exit 1; fi
NAME="$(basename "${APP}" .app)"
VER="$(node -p "require('./BeatPractice/src-tauri/tauri.conf.json').version")"
OUT_DIR="${BUNDLE}/dmg"
OUT="${OUT_DIR}/${NAME}_${VER}_${ARCH}.dmg"

# geometry (points): icon 192, side margin 72, gap between the icons 112, 56 above the icons, room for the label below
ICON=192; MARGIN=72; GAP=112; TOP=56; LABEL=44; BOTTOM=36; TITLEBAR=28   # the background is ${WIDTH} x $(( TOP + ICON + LABEL + BOTTOM )) points: see background.png
WIDTH=$(( MARGIN + ICON + GAP + ICON + MARGIN ))
HEIGHT=$(( TOP + ICON + LABEL + BOTTOM + TITLEBAR ))
X1=$(( MARGIN + ICON / 2 ))
X2=$(( X1 + ICON + GAP ))
Y=$(( TOP + ICON / 2 ))

HERE="$(cd "$(dirname "$0")" && pwd)"
STAGE="$(mktemp -d)"
WORK="$(mktemp -d)"
# one background file with both resolutions (Retina)
tiffutil -cathidpicheck "${HERE}/background.png" "${HERE}/background@2x.png" -out "${WORK}/background.tiff"

cp -R "${APP}" "${STAGE}/"
TMP_OUT="$(mktemp -d)/${NAME}.dmg"      # built aside: the .dmg Tauri made is replaced only when this one is ready

create-dmg \
  --volname "${NAME}" \
  --background "${WORK}/background.tiff" \
  --volicon "BeatPractice/src-tauri/icons/icon.icns" \
  --window-pos 200 120 \
  --window-size ${WIDTH} ${HEIGHT} \
  --icon-size ${ICON} \
  --text-size 14 \
  --icon "${NAME}.app" ${X1} ${Y} \
  --hide-extension "${NAME}.app" \
  --app-drop-link ${X2} ${Y} \
  --no-internet-enable \
  "${TMP_OUT}" "${STAGE}"

mkdir -p "${OUT_DIR}"
rm -f "${OUT_DIR}"/*.dmg
mv "${TMP_OUT}" "${OUT}"

ls -la "${OUT_DIR}"
