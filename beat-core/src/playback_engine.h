// Plays a song at any speed (pitch preserved) with a metronome that is locked to the song itself.
//
// Key idea: the metronome is NOT a separate timer. For every block of sound the engine knows exactly which
// stretch of the ORIGINAL song it is about to play, and puts each click at the exact output sample where
// the original beat will be heard. So the click cannot drift away from the music, whatever the speed.
//
// render() is the only function meant for the audio thread. Everything else may be called from the UI thread.
// setSong() must be called while the audio is stopped; setBeatMap() may be called at any time.
#pragma once
#include "beat_analyzer.h"
#include <atomic>
#include <memory>
#include <vector>

namespace beatcore {

struct MetronomeSettings {
    bool  enabled = true;
    float volume = 0.8f;          // 0..1.5
    bool  accentFirstBeat = true; // higher tone on the first beat of each bar
    // Quiet bars: the clicks sound for `clickBars` bars, then are silent for `quietBars` bars, and so on. The bars are counted from the
    // loop start while an A-B loop is on (so every pass sounds the same), otherwise from the first bar of the song.
    bool  quietEnabled = false;
    int   clickBars = 2;          // 1..16
    int   quietBars = 1;          // 1..16
};

struct CountInSettings {
    int  bars = 0;                // 0 = off (default). Count-in = this many bars of clicks (bar length taken from the song)
    bool everyLoopRestart = false;// also count in before every repetition of an A-B loop
};

class PlaybackEngine {
public:
    explicit PlaybackEngine(int outputSampleRate = 44100);
    ~PlaybackEngine();

    // interleaved stereo float at outputSampleRate
    void setSong(std::vector<float> interleavedStereo);
    void setBeatMap(const BeatMap& map);          // beat times are in seconds of the ORIGINAL song

    // Waveform overview: loudest absolute sample in each 10 ms of the song (0..1), kPeaksPerSecond values per second.
    static constexpr int kPeaksPerSecond = 100;
    const std::vector<float>& peaks() const;

    void play();
    void pause();
    bool isPlaying() const;
    void seekSeconds(double sourceSeconds);       // position in the ORIGINAL song
    double positionSeconds() const;               // original-song time of the sound about to be output
    double durationSeconds() const;

    void setSpeed(double ratio);                  // 0.25 .. 2.0   (0.8 = 20% slower), pitch unchanged
    double speed() const;
    void setMetronome(const MetronomeSettings& s);
    void setSongVolume(float v);                  // 0..1.5

    // Stems: the same song split into parts (e.g. drums, bass, other, vocals), each a stereo track of the song's length.
    // setStems() may be called at any time (it waits for the audio thread only for an instant); the parts are heard
    // only after setStemsEnabled(true). While enabled, each part has its own level (setStemGain, 0..1.5) and the
    // original mix is silent. Switching is seamless in time (the parts start exactly where the song is).
    void setStems(std::vector<std::vector<float>> interleavedStereoTracks);
    void setStemsEnabled(bool on);
    bool stemsEnabled() const;
    int stemCount() const;
    void setStemGain(int index, float gain);

    // Count-in: when play() starts from a stop/pause, the metronome counts `bars` bars at the CURRENT speed,
    // the song stays silent, and the song starts exactly one beat after the last count-in click.
    void setCountIn(const CountInSettings& s);
    bool isCountingIn() const;
    // While counting in: beat = number (1-based) of the click that was most recently played, total = clicks in the count-in.
    bool countInBeat(int* beat, int* total) const;

    // Count-in clicks can be made silent (the timing stays the same). Used by the export of separate parts, so that
    // every file has the same lead-in and the files stay aligned.
    void setCountInSilent(bool silent);

    // Offline use (export): playback stops by itself when the sound reaches `sourceSeconds` of the ORIGINAL song
    // (sample-exact, with a ~1 ms fade-out). A negative value removes the limit. Not meant to be combined with an A-B loop.
    void setStopAt(double sourceSeconds);
    // Number of frames that the last render() call filled with sound (the rest of the buffer is silence). 0 when paused.
    int lastRenderFrames() const;
    // How many times the A-B loop has wrapped from B back to A since the engine was made (for training modes that count passes).
    long loopWraps() const;

    // Metronome sound: 0 classic, 1 wood block, 2 hi-hat, 3 rim click, 4 cowbell, 5 electronic beep.
    static constexpr int kClickSounds = 6;
    static int clickSoundCount() { return kClickSounds; }
    void setClickSound(int id);

    // A-B loop (positions in ORIGINAL-song seconds). The jump from B back to A is sample-exact in time;
    // snap the points to bar starts with snapToBar() so the loop is musically seamless.
    bool setLoop(double aSeconds, double bSeconds);   // false if shorter than 0.25 s
    void clearLoop();
    bool loopEnabled() const;
    double snapToBeat(double seconds) const;      // nearest beat / nearest first-beat-of-bar (input returned if no beat map)
    double snapToBar(double seconds) const;

    // Audio thread: writes `frames` interleaved stereo frames (always fills the buffer, silence when paused).
    void render(float* out, int frames);

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace beatcore
