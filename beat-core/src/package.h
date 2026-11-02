// BeatPack: one file with everything a weak device needs to open a song without analysing or separating it:
// the beat map, the separated tracks (FLAC, sample-exact) and the user's loops. Made on a strong device, opened anywhere.
// Reading needs neither ONNX Runtime nor the models; writing needs libFLAC (BEATCORE_PACK_WRITER).
//
// File layout (little endian):
//   "BEATPACK" | u32 format version | entries... | end mark (u16 name length 0)
//   entry: u16 name length | name | u64 data size | u32 CRC-32 of the data | data
//   entries: "manifest.json" (first), "activations.bin" (optional), "track-N.flac", "mix.flac" (optional), "cover.bin" (optional)
#pragma once
#include "beat_analyzer.h"
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace beatcore {

struct PackLoop { std::string name; double start = 0, end = 0; };   // seconds of the original song

struct PackMeta {
    std::string title, artist;
    std::string ownerId;      // account / licence that made the pack ("" = not set); a different owner is warned about when opening
    std::string createdBy;    // program name and version
    std::string modelName;    // separation model that made the tracks
};

struct Package {
    PackMeta meta;
    int sampleRate = 44100;
    long frames = 0;
    BeatMap map;
    Activations acts;         // raw network output (lets another device change the metre mode); empty = not included
    std::vector<std::string> trackNames;          // empty = the song is not separated (only the mix)
    std::vector<std::vector<int16_t>> tracks;     // per track, planar: left channel (frames) then right channel (frames)
    std::vector<int16_t> mix;                     // the original song in the same layout; empty = not included
    std::vector<PackLoop> loops;
    std::vector<uint8_t> cover;                   // image bytes (jpeg/png), may be empty
};

constexpr uint32_t kPackVersion = 1;

// progress(0..1) may return false to cancel. On failure returns false and fills *err (short English text).
using PackProgress = std::function<bool(float)>;
bool readPackage(const std::string& path, Package& out, std::string* err, bool withAudio = true, const PackProgress& progress = {});
bool readPackageFromMemory(const uint8_t* data, size_t size, Package& out, std::string* err, bool withAudio = true, const PackProgress& progress = {});
bool writePackage(const std::string& path, const Package& pkg, std::string* err, int flacLevel = 5, const PackProgress& progress = {});   // needs BEATCORE_PACK_WRITER

// Sums tracks into one (saturating): used to merge some separated parts into a group before packing.
std::vector<int16_t> sumTracks(const std::vector<const std::vector<int16_t>*>& parts);

} // namespace beatcore
