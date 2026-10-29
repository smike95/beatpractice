// Splits a song into parts (drums, bass, vocals, guitar, piano, other) with a Demucs-type ONNX model.
// Supported model layout: ONE input "waveform" [1, 2, N] (stereo, 44.1 kHz) and ONE output [1, S, 2, N]
// (S sources: 4 = drums,bass,other,vocals ; 6 = drums,bass,other,vocals,guitar,piano). float32 or float16.
// The STFT must be inside the model ("single-file" export). Anything else is reported by error().
#pragma once
#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace beatcore {

// The result: a few tracks that together make up the song.
struct StemSet {
    std::vector<std::string> names;          // e.g. {"drums", "guitar", "rest"}
    long frames = 0;
    int sampleRate = 44100;
    std::vector<std::vector<int16_t>> pcm;   // per track, planar: left channel (frames) then right channel (frames)
    bool save(const std::string& path) const;
    bool load(const std::string& path);
};

std::vector<std::string> defaultSourceNames(int count);

class StemSeparator {
public:
    explicit StemSeparator(const std::string& modelPath);
    ~StemSeparator();

    bool ok() const;
    const std::string& error() const;                       // why the model cannot be used (empty if ok)
    const std::vector<std::string>& sourceNames() const;    // every source the model makes, in model order
    int segmentFrames() const;                              // length of one model call, in frames

    // keepMask: bit i set = source i becomes its own track; all other sources are summed into one "rest" track.
    // progress(0..1) may return false to cancel (an empty StemSet is returned then).
    StemSet separate(const float* left, const float* right, long frames, uint32_t keepMask,
                     const std::function<bool(float)>& progress = {}) const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace beatcore
