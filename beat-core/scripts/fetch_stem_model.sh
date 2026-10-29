#!/bin/sh
# Downloads the stem separation model (HT-Demucs, MIT license) into ./models.
#   sh scripts/fetch_stem_model.sh          small variant, about 166 MB (recommended, same speed and quality)
#   sh scripts/fetch_stem_model.sh --full   full variant, about 316 MB
# Source: https://huggingface.co/StemSplitio/htdemucs-onnx (ONNX export of facebookresearch/demucs)
set -e
mkdir -p models && cd models
BASE=https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main
if [ "$1" = "--full" ]; then FILE=htdemucs.onnx; MIN=300000000; else FILE=htdemucs_fp16weights.onnx; MIN=150000000; fi
if [ -f "$FILE" ] && [ "$(wc -c < "$FILE")" -ge "$MIN" ]; then echo "$FILE is already there"; exit 0; fi
echo "Downloading $FILE ..."
curl -L --fail --progress-bar -o "$FILE.part" "$BASE/$FILE"
SIZE=$(wc -c < "$FILE.part")
if [ "$SIZE" -lt "$MIN" ]; then echo "The downloaded file is too small ($SIZE bytes): download failed, try again."; rm -f "$FILE.part"; exit 1; fi
mv "$FILE.part" "$FILE"
echo "$FILE OK ($SIZE bytes)"
