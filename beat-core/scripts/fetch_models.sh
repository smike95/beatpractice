#!/bin/sh
# Downloads the neural network models into ./models and checks them.
set -e
mkdir -p models && cd models
B=https://raw.githubusercontent.com/danigb/beat-this-rs/main/models
fetch() { [ -f "$1" ] || curl -L --fail -o "$1" "$2"; }
fetch mel_spectrogram.onnx   $B/mel_spectrogram.onnx
fetch beat_this_small.onnx   $B/beat_this_small.onnx
fetch beat_this.onnx https://github.com/danigb/beat-this-rs/releases/download/model-large/beat_this.onnx
cat > SHA256SUMS <<'S'
fdd59e65c515331308e4c8841edf99972deca646bdf6197744c2a5b7755e3de9  mel_spectrogram.onnx
a5f8d39d989f31859454ba27afe61c5317ca95e4d9373e6853e5361b8937172f  beat_this_small.onnx
5f810debe53459b559127fb55bbad40035bb47cc567b20e501670f968c770f02  beat_this.onnx
S
(sha256sum -c SHA256SUMS 2>/dev/null || shasum -a 256 -c SHA256SUMS)
echo "models OK"
