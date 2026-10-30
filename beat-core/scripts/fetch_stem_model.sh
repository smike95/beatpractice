#!/bin/sh
# Downloads a stem separation model (HT-Demucs, MIT license) into ./models.
#   sh scripts/fetch_stem_model.sh          6 parts: drums, bass, other, vocals, GUITAR, PIANO (about 136 MB, recommended)
#   sh scripts/fetch_stem_model.sh --four   4 parts: drums, bass, other, vocals (about 166 MB; used as a fallback)
#   sh scripts/fetch_stem_model.sh --full   4 parts, full precision (about 316 MB)
# Sources (ONNX exports of facebookresearch/demucs):
#   https://huggingface.co/StemSplitio/htdemucs-6s-onnx   and   https://huggingface.co/StemSplitio/htdemucs-onnx
set -e
mkdir -p models && cd models
case "$1" in
  --four) BASE=https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main;    FILE=htdemucs_fp16weights.onnx;    MIN=150000000 ;;
  --full) BASE=https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main;    FILE=htdemucs.onnx;                MIN=300000000 ;;
  *)      BASE=https://huggingface.co/StemSplitio/htdemucs-6s-onnx/resolve/main; FILE=htdemucs_6s_fp16weights.onnx; MIN=120000000 ;;
esac
if [ -f "$FILE" ] && [ "$(wc -c < "$FILE")" -ge "$MIN" ]; then echo "$FILE is already there"; exit 0; fi
echo "Downloading $FILE ..."
curl -L --fail --progress-bar -o "$FILE.part" "$BASE/$FILE"
SIZE=$(wc -c < "$FILE.part")
if [ "$SIZE" -lt "$MIN" ]; then echo "The downloaded file is too small ($SIZE bytes): download failed, try again."; rm -f "$FILE.part"; exit 1; fi
mv "$FILE.part" "$FILE"
echo "$FILE OK ($SIZE bytes)"
