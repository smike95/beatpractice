# BeatPack (`.beatpack`) format, version 1

One file with a song that is already analysed and (optionally) separated, so that a weak device (old Windows PC, Android phone)
opens it without the neural networks. Made by `writePackage`, opened by `readPackage` / `readPackageFromMemory` (`src/package.h`).

## Layout (all numbers little endian)

    "BEATPACK" (8 bytes) | u32 format version | entry ... | u16 0 (end mark)
    entry = u16 name length (1..255) | name (UTF-8) | u64 data size | u32 CRC-32 of the data | data

| entry | meaning |
|---|---|
| `manifest.json` | first; description (below) |
| `activations.bin` | optional; u32 count, u32 0, then `count` float32 beat logits, `count` float32 downbeat logits (20 ms frames). Lets another device change the metre mode without the network |
| `track-N.flac` | track N, 16-bit stereo FLAC, sample-exact (lossless) |
| `mix.flac` | optional; the original song |
| `cover.bin` | optional; jpeg/png bytes |

`manifest.json`: `format:"beatpack"`, `version`, `title`, `artist`, `owner` (account / licence id, may be empty), `createdBy`, `model`,
`sampleRate`, `frames`, `beatMap {durationSec, periodSec, bpm, beats[], barLength[], posInBar[], playFirstBeat, playLastBeat}`,
`tracks[{name}]`, `loops[{name,start,end}]` (seconds of the original song).

## Rules for readers

* Check the version: a larger one than you know = refuse and ask to update the program. Unknown entries are ignored.
* Check every CRC before using an entry. Never trust sizes: the reader refuses entries longer than the file, more than 32 tracks, more than 3 hours of sound.
* All tracks (and the mix) have the same length `frames` and are sample-aligned with the beat map. Use only lossless codecs for tracks.
* Writing goes to `<name>.tmp` and is renamed at the end, so a broken write never leaves a half file.
* `owner`: if it differs from this device's account / licence, warn the user (the pack is for the owner's own devices) and let them confirm.

## Building

`BEATCORE_PACK_WRITER=ON` (default) fetches and builds libFLAC 1.4.3 (BSD) for writing. A device that only opens packs configures with
`-DBEATCORE_PACK_WRITER=OFF`: reading uses the FLAC decoder already inside miniaudio.

## The small core (phones)

`-DBEATCORE_WITH_ANALYSIS=OFF` builds the core without ONNX Runtime, the networks and the separation code. It opens `.beatpack` files only
(an ordinary song gives the message "opens only .beatpack files"), plays them, and keeps the sound as 16-bit samples that are moved into the engine
(a pack with 6 tracks of 4 minutes needs about 340 MB at the peak, the full core with float tracks needed twice that). It does not keep a second
copy of the sound, so it cannot export a pack to WAV or pack it again; the computer does that. Add `-DBEATCORE_PACK_WRITER=OFF` to drop libFLAC too.

## Memory notes (measured with the real models, htdemucs_6s fp16)

* Loading the separation model with graph optimisation (`ORT_ENABLE_ALL`) needs more than 3.8 GB of RAM here (the process was killed on a 4 GB machine).
  With `lowMemory` (no graph optimisation) it loads with about 1 GB and separates a 12 s clip in 26 s on one core (2.2x real time).
  The player picks `lowMemory` by itself when the device has less than 8 GB of RAM or `bc_set_low_memory(1)` was called.
* Separated parts go into the engine as 16-bit samples without a float copy.
