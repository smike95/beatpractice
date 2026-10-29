// beat-core: finds beats and bars (first beat of each bar) in a song.
// Step 1: neural network (Beat This!, ONNX) gives "probability of a beat/downbeat" per 20 ms frame.
// Step 2: decodeBeatMap() turns those probabilities into a clean, steady beat grid + bar structure.
// All tunable numbers live in AnalyzerConfig, so most tuning never touches the algorithm.
#pragma once
#include <string>
#include <vector>
#include <functional>
#include <memory>

namespace beatcore {

constexpr double kFrameRate = 50.0;      // network output frames per second
constexpr int    kSampleRate = 22050;    // audio rate the network expects (mono)

struct AnalyzerConfig {
    // ---- neural network chunking (do not change unless the model changes) ----
    int chunkFrames = 1500;
    int chunkBorder = 6;

    // ---- global tempo search ----
    double minPeriodSec = 0.25;          // fastest beat spacing considered (0.25 s = 240 BPM)
    double maxPeriodSec = 1.2;           // slowest (1.2 s = 50 BPM)
    double fasterPeakRatio = 0.8;        // prefer the fastest autocorrelation peak that scores >= this share of the best one

    // ---- steady beat chain (dynamic programming) ----
    double chainTightness = 60.0;        // higher = beats must be more evenly spaced
    double chainMinRatio  = 0.8;         // a beat may follow the previous one after 0.8 .. 1.25 periods
    double chainMaxRatio  = 1.25;
    // the tempo is followed locally, so a song may speed up or slow down by much more than 25 % overall
    bool   localTempo = true;
    double localWindowSec = 12.0;        // length of the window in which the local beat period is measured
    double localHopSec = 2.0;            // distance between measurements
    double localSteadyTolerance = 0.06;  // if every window is within this share of the global period, the tempo is treated as steady

    // ---- bar structure ----
    std::vector<int> barLengths = {3, 4, 5, 6, 7};   // allowed bar lengths in beats
    double meterChangePenalty = 5.0;     // cost of switching to a NEW bar length
    double alternationPenalty = 0.7;     // cost of returning to the bar length used two bars ago (4,3,4,3...)
    double costLength2 = 1.5;            // extra cost for bars of 2 beats (rare; avoids splitting 4/4 into 2+2)
    double costLength3 = 0.5;            // small extra cost for bars of 3 beats
    double costLengthOther = 2.0;        // extra cost for any other non-4 length (5, 6, 7 ...)

    // ---- where the metronome should play ----
    double strongBeatThreshold = 0.3;    // a beat is "real music" if network confidence >= this
    int    stableBars = 3;               // metronome starts at the first bar that begins this many equal bars in a row

    // Meter recognition presets: 0 = automatic (the defaults above), 1 = sensitive (follows the network more closely, accepts
    // changes of meter and 5/7-beat bars more readily), 2 = strict (only 3 and 4 beats, changes of meter need strong evidence).
    static AnalyzerConfig forMeterMode(int mode) {
        AnalyzerConfig c;
        if (mode == 1) { c.meterChangePenalty = 2.5; c.alternationPenalty = 0.5; c.costLengthOther = 1.0; }
        else if (mode == 2) { c.barLengths = {3, 4}; c.meterChangePenalty = 8.0; c.costLengthOther = 1.0; }
        return c;
    }
};

struct Activations {                     // raw network output, 1 value per 20 ms frame (logits)
    std::vector<float> beat, downbeat;
    double durationSec = 0;
    bool save(const std::string& path) const;
    bool load(const std::string& path);
};

struct BeatMap {
    double durationSec = 0;
    double periodSec = 0;                // global beat period found by autocorrelation (coarse)
    double bpm = 0;                      // from the median spacing of the final beats (precise)
    std::vector<double> beats;           // beat times in seconds
    std::vector<int> barLength;          // length (in beats) of the bar that beat i belongs to
    std::vector<int> posInBar;           // 1 = first beat of the bar
    int playFirstBeat = -1;              // metronome range (inclusive indices); -1 = none
    int playLastBeat = -1;
};

// Pure function: no neural network, no I/O. Fast, so settings can be tuned on saved activations.
BeatMap decodeBeatMap(const Activations& act, const AnalyzerConfig& cfg);

class BeatAnalyzer {
public:
    // melModelPath: mel_spectrogram.onnx ; beatModelPath: beat_this.onnx (large) or beat_this_small.onnx
    BeatAnalyzer(const std::string& melModelPath, const std::string& beatModelPath, const AnalyzerConfig& cfg = {});
    ~BeatAnalyzer();
    // mono audio at kSampleRate
    // progress: called with 0..1 while the network runs (may be empty)
    Activations computeActivations(const float* mono, size_t numSamples, const std::function<void(float)>& progress = {}) const;
    BeatMap analyze(const float* mono, size_t numSamples) const;
    const AnalyzerConfig& config() const;
private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace beatcore
