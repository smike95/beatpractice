// Player: everything the app needs behind one object.
//   open a file -> decode + analyze in the background (cached) -> play through the sound device.
// Thread rules: all public functions may be called from the UI thread. The sound device has its own thread.
#pragma once
#include "playback_engine.h"
#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <thread>

namespace beatcore {

enum class PlayerState { Idle = 0, Decoding = 1, Analyzing = 2, Ready = 3, Error = 4 };
enum class StemState { None = 0, Running = 1, Ready = 2, Error = 3 };

struct BeatInfo { int beatIndex = -1; int posInBar = 0; int barLength = 0; bool countingIn = false; };

class Player {
public:
    // modelDir contains mel_spectrogram.onnx and beat_this.onnx ; cacheDir stores analysis results (created if missing)
    Player(const std::string& modelDir, const std::string& cacheDir);
    ~Player();

    bool openFile(const std::string& path);      // false if a file is still being processed
    void unload();                               // drop the current song (stops sound); ignored while a file is being processed
    PlayerState state() const;
    float progress() const;                      // 0..1 while Decoding/Analyzing
    std::string error() const;
    bool fromCache() const;                      // last analysis came from the cache

    std::shared_ptr<const BeatMap> beatMap() const;
    // How eagerly the bar structure follows the network: see AnalyzerConfig::forMeterMode (0 auto, 1 sensitive, 2 strict).
    // Re-reads the saved network output of the current song, so it is instant. Returns true if applied to a loaded song.
    bool setMeterMode(int mode);
    int meterMode() const;
    double songBpm() const;                      // average tempo of the original song
    double durationSeconds() const;

    // playback (no-ops until Ready)
    void play(); void pause(); bool isPlaying() const;
    void seekSeconds(double s); double positionSeconds() const;
    void setSpeed(double ratio); double speed() const;
    void setMetronome(const MetronomeSettings& s);
    void setSongVolume(float v);
    void setCountIn(const CountInSettings& s); bool isCountingIn() const;
    bool countInBeat(int* beat, int* total) const;   // see PlaybackEngine::countInBeat
    void setClickSound(int id);                       // see PlaybackEngine::kClickSounds
    bool setLoop(double a, double b); void clearLoop(); bool loopEnabled() const;
    double snapToBar(double s) const; double snapToBeat(double s) const;
    BeatInfo currentBeat() const;
    std::vector<float> peaks() const;            // waveform overview, PlaybackEngine::kPeaksPerSecond per second

    // ---- stems: the song split into parts (drums, bass, other, vocals ...) by a Demucs ONNX model ----
    // The model file (htdemucs.onnx or htdemucs_fp16weights.onnx) must be in modelDir. Separation runs in the background and
    // is cached on disk per song, so the next time the parts are ready in about a second. When Ready, the parts are loaded
    // into the engine; setStemsEnabled(true) plays them instead of the original mix, each with its own level.
    bool stemsAvailable() const;                 // a song is ready and the model file exists
    bool stemsCached() const;                    // the parts of the current song are already on disk
    bool stemsStart();                           // false if no song is ready, no model, or already running
    void stemsCancel();
    StemState stemsState() const;
    float stemsProgress() const;                 // 0..1
    std::string stemsError() const;
    std::vector<std::string> stemNames() const;  // valid when state is Ready
    void setStemsEnabled(bool on);
    bool stemsEnabled() const;
    void setStemGain(int index, float gain);     // 0..1.5

    // ---- export: renders the whole song as it sounds now (tempo, volume, parts on/off and levels) to a 16-bit WAV file ----
    // Runs in the background (does not disturb playback). State: 0 none, 1 running, 2 done, 3 error. The metronome is
    // included only if withMetronome is true.
    bool exportStart(const std::string& wavPath, bool withMetronome);   // false if no song is ready or an export is running
    int exportState() const; float exportProgress() const; std::string exportError() const;
    void exportCancel();

    bool deviceRunning() const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace beatcore
