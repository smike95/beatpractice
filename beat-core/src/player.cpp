#include "portable_path.h"
#include "player.h"
#include "audio_file.h"
#include "stem_separator.h"
#include "../third_party/miniaudio.h"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstdio>
#include <fstream>

namespace beatcore {

namespace {
constexpr int kEngineRate = 44100;

uint64_t fnv1a(const std::string& path, uint64_t seed, uint64_t* sizeOut) {
    std::ifstream f(bcpath::make(path), std::ios::binary);
    uint64_t h = 1469598103934665603ULL ^ seed, n = 0;
    std::vector<char> buf(1 << 16);
    while (f) { f.read(buf.data(), buf.size()); std::streamsize g = f.gcount();
        for (std::streamsize i = 0; i < g; ++i) { h ^= (unsigned char)buf[i]; h *= 1099511628211ULL; } n += (uint64_t)g; }
    if (sizeOut) *sizeOut = n;
    return h;
}
long fileSize(const std::string& p) { return bcpath::fileSize(p); }
}

struct Player::Impl {
    std::string modelDir, cacheDir;
    std::atomic<int> state{(int)PlayerState::Idle};
    std::atomic<float> prog{0.f};
    std::atomic<bool> cached{false};
    mutable std::mutex mu; std::string err; std::shared_ptr<const BeatMap> map;
    std::thread worker;

    // current engine; swapped atomically, the old one is deleted after the audio thread has surely left it
    std::atomic<PlaybackEngine*> engine{nullptr};
    // settings remembered so a newly opened song inherits them
    std::atomic<double> speedS{1.0}; MetronomeSettings metS; std::atomic<float> volS{1.0f}; CountInSettings ciS; std::atomic<int> clickS{0};

    // ---- stems ----
    std::thread stemWorker;
    std::atomic<int> stemState{(int)StemState::None};
    std::atomic<float> stemProg{0.f};
    std::atomic<bool> stemCancel{false}, stemsOn{false};
    std::atomic<float> stemGains[8];
    std::atomic<int> songGen{0};                  // changes whenever a new song is opened
    std::string songPath, cacheBase;              // set by run() before the state becomes Ready
    Activations lastActs; bool haveActs = false;  // network output of the current song (guarded by mu)
    std::atomic<int> meterMode{0};
    std::string stemErr; std::vector<std::string> stemNamesV;   // guarded by mu

    // ---- export of the modified song to a WAV file (own engine, runs offline in the background) ----
    std::thread expWorker;
    std::atomic<int> expState{0};                 // 0 none, 1 running, 2 done, 3 error
    std::atomic<float> expProg{0.f};
    std::atomic<bool> expCancel{false};
    std::string expErr;                           // guarded by mu
    void expStopAndJoin() { expCancel = true; if (expWorker.joinable()) expWorker.join(); expCancel = false; }
    void expFail(const std::string& m) { { std::lock_guard<std::mutex> l(mu); expErr = m; } expState = 3; }

    struct ExpJob {
        std::string outPath, songPath, stemCache;
        std::vector<std::string> stemNames;
        bool metronome = false, useStems = false, separate = false;
        int countInBars = 0, clickIntoStem = -1;
        bool hasRange = false; double rangeA = 0, rangeB = 0;       // original-song seconds
        std::vector<int> stemIdx; std::vector<float> stemGain;      // parts to include and their levels
        std::shared_ptr<const BeatMap> map;
        double speed = 1.0; float vol = 1.0f; int click = 0; MetronomeSettings met;
    };

    static void putU32(FILE* f, uint32_t v) { std::fwrite(&v, 4, 1, f); }
    static void putU16(FILE* f, uint16_t v) { std::fwrite(&v, 2, 1, f); }

    // Renders everything `e` plays into a 16-bit stereo WAV. Progress goes from p0 to p1. Returns false when cancelled or failed
    // (cancel: expState is set to 0 and the file is removed; failure: expFail() was called).
    bool renderToWav(PlaybackEngine& e, const std::string& path, double a, double b, bool hasRange, double speed, float p0, float p1) {
        FILE* f = bcpath::open(path, "wb");
        if (!f) { expFail("Cannot create the output file."); return false; }
        auto removeFile = [&] { std::error_code ec; std::filesystem::remove(bcpath::make(path), ec); };
        // 16-bit stereo WAV header (sizes are patched at the end)
        std::fwrite("RIFF", 1, 4, f); putU32(f, 0); std::fwrite("WAVEfmt ", 1, 8, f);
        putU32(f, 16); putU16(f, 1); putU16(f, 2); putU32(f, (uint32_t)kEngineRate); putU32(f, (uint32_t)kEngineRate * 4); putU16(f, 4); putU16(f, 16);
        std::fwrite("data", 1, 4, f); putU32(f, 0);
        const double songDur = std::max(1.0, e.durationSeconds());
        const double from = hasRange ? a : 0.0, to = hasRange ? b : songDur;
        const double span = std::max(0.25, to - from);
        if (hasRange) e.setStopAt(to);
        e.seekSeconds(from); e.play();
        // upper bound: the part itself at this speed, plus room for a count-in of up to 4 bars of 16 beats at 30 BPM
        const long maxFrames = (long)((span / std::max(0.25, speed) + 130.0) * kEngineRate);
        const int B = 4410;
        std::vector<float> blk(2 * B); std::vector<int16_t> pcm(2 * B);
        long total = 0;
        while (e.isPlaying() && total < maxFrames) {
            if (expCancel.load()) { std::fclose(f); removeFile(); expState = 0; return false; }
            e.render(blk.data(), B);
            const int valid = std::max(0, std::min(B, e.lastRenderFrames()));   // the last block may be shorter: no trailing silence
            for (int i = 0; i < 2 * valid; ++i) { float v = blk[i]; v = v > 1.f ? 1.f : (v < -1.f ? -1.f : v); pcm[i] = (int16_t)std::lrintf(v * 32767.f); }
            if (valid > 0 && std::fwrite(pcm.data(), 2, (size_t)2 * valid, f) != (size_t)2 * valid) {
                std::fclose(f); removeFile(); expFail("Cannot write the output file (disk full?)."); return false;
            }
            total += valid;
            const double frac = std::max(0.0, std::min(1.0, (e.positionSeconds() - from) / span));
            expProg = p0 + (p1 - p0) * (float)frac;
        }
        const uint32_t dataBytes = (uint32_t)(total * 4);
        std::fseek(f, 4, SEEK_SET); putU32(f, 36 + dataBytes);
        std::fseek(f, 40, SEEK_SET); putU32(f, dataBytes);
        std::fclose(f);
        expProg = p1;
        return true;
    }

    // one engine for one output file. tracks: the parts that are heard (empty = the song itself, or silence when `silentMain`)
    std::unique_ptr<PlaybackEngine> makeExportEngine(const ExpJob& j, std::vector<float> mainStereo,
                                                     std::vector<std::vector<float>> tracks, const std::vector<float>& gains,
                                                     bool metronome, int countInBars, bool silentCountIn, float songVol) {
        auto e = std::make_unique<PlaybackEngine>(kEngineRate);
        e->setSong(std::move(mainStereo)); e->setBeatMap(*j.map); e->setSpeed(j.speed);
        MetronomeSettings ms = j.met; ms.enabled = metronome; e->setMetronome(ms);
        e->setSongVolume(songVol); e->setClickSound(j.click);
        CountInSettings ci; ci.bars = metronome || silentCountIn ? countInBars : 0; e->setCountIn(ci);
        e->setCountInSilent(silentCountIn);
        if (!tracks.empty()) {
            e->setStems(std::move(tracks));
            for (size_t k = 0; k < gains.size(); ++k) e->setStemGain((int)k, gains[k]);
            e->setStemsEnabled(true);
        }
        return e;
    }

    static std::vector<float> stemToFloat(const StemSet& set, size_t k) {
        const long T = set.frames; const int16_t* p = set.pcm[k].data();
        std::vector<float> v((size_t)2 * T);
        for (long i = 0; i < T; ++i) { v[2*i] = p[i] / 32768.f; v[2*i+1] = p[T + i] / 32768.f; }
        return v;
    }
    static std::string stripWav(const std::string& p) {
        if (p.size() > 4 && (p.compare(p.size() - 4, 4, ".wav") == 0 || p.compare(p.size() - 4, 4, ".WAV") == 0)) return p.substr(0, p.size() - 4);
        return p;
    }

    void runExport(const ExpJob& j) {
        try {
            expProg = 0.01f;
            // ---- the song itself (no separated parts) ----
            if (!j.useStems) {
                std::vector<float> stereo = decodeAudioFile(j.songPath, 2, kEngineRate);
                if (stereo.size() < 2 * (size_t)kEngineRate) return expFail("Cannot decode the file for export.");
                if (j.hasRange && j.rangeA >= (double)(stereo.size() / 2) / kEngineRate) return expFail("The selected part is outside the song.");
                auto e = makeExportEngine(j, std::move(stereo), {}, {}, j.metronome, j.countInBars, false, j.vol);
                if (expCancel.load()) { expState = 0; return; }
                if (!renderToWav(*e, j.outPath, j.rangeA, j.rangeB, j.hasRange, j.speed, 0.05f, 0.99f)) return;
                expProg = 1.f; expState = 2; return;
            }
            // ---- separated parts ----
            StemSet set;
            if (!set.load(j.stemCache)) return expFail("Separated parts of this song were not found on disk.");
            for (int k : j.stemIdx) if (k < 0 || (size_t)k >= set.pcm.size()) return expFail("A selected part does not exist in this song.");
            const size_t silentLen = (size_t)2 * set.frames;
            if (!j.separate) {                                       // all selected parts mixed into ONE file, at their levels
                std::vector<std::vector<float>> tracks; std::vector<float> gains;
                for (size_t n = 0; n < j.stemIdx.size(); ++n) {
                    tracks.push_back(stemToFloat(set, (size_t)j.stemIdx[n]));
                    gains.push_back(j.stemGain[n]);
                }
                auto e = makeExportEngine(j, std::vector<float>(silentLen, 0.f), std::move(tracks), gains, j.metronome, j.countInBars, false, j.vol);
                if (expCancel.load()) { expState = 0; return; }
                if (!renderToWav(*e, j.outPath, j.rangeA, j.rangeB, j.hasRange, j.speed, 0.05f, 0.99f)) return;
                expProg = 1.f; expState = 2; return;
            }
            // one file per selected part (original level, no volume changes: ready to be mixed elsewhere), plus a click file when the
            // metronome is on. Every file has the same length: a count-in is silent in the parts and audible in the click file.
            const std::string base = stripWav(j.outPath);
            const bool clickFile = j.metronome && j.clickIntoStem < 0;
            const int files = (int)j.stemIdx.size() + (clickFile ? 1 : 0);
            int done = 0;
            for (size_t n = 0; n < j.stemIdx.size(); ++n, ++done) {
                const bool withClick = j.metronome && j.clickIntoStem == j.stemIdx[n];   // this part carries the clicks
                std::vector<std::vector<float>> tracks; tracks.push_back(stemToFloat(set, (size_t)j.stemIdx[n]));
                auto e = makeExportEngine(j, std::vector<float>(silentLen, 0.f), std::move(tracks), {1.0f}, withClick, j.countInBars, !withClick, 1.0f);
                if (expCancel.load()) { expState = 0; return; }
                const std::string nm = (size_t)j.stemIdx[n] < set.names.size() ? set.names[(size_t)j.stemIdx[n]] : ("part" + std::to_string(n + 1));
                const float p0 = 0.02f + 0.97f * done / files, p1 = 0.02f + 0.97f * (done + 1) / files;
                if (!renderToWav(*e, base + " - " + nm + ".wav", j.rangeA, j.rangeB, j.hasRange, j.speed, p0, p1)) return;
            }
            if (clickFile) {
                auto e = makeExportEngine(j, std::vector<float>(silentLen, 0.f), {}, {}, true, j.countInBars, false, 0.f);
                if (expCancel.load()) { expState = 0; return; }
                if (!renderToWav(*e, base + " - click.wav", j.rangeA, j.rangeB, j.hasRange, j.speed, 0.02f + 0.97f * done / files, 0.99f)) return;
            }
            expProg = 1.f; expState = 2;
        } catch (const std::exception& ex) {
            expFail(std::string("Export failed: ") + ex.what());
        }
    }

    std::unique_ptr<BeatAnalyzer> analyzer;
    ma_context ctx; bool ctxInit = false; ma_device dev; bool devInit = false;

    static void callback(ma_device* d, void* out, const void*, ma_uint32 frames) {
        auto* self = (Impl*)d->pUserData;
        PlaybackEngine* e = self->engine.load();
        if (e) e->render((float*)out, (int)frames); else std::fill((float*)out, (float*)out + 2 * frames, 0.f);
    }

    bool startDevice() {
        if (devInit) return true;
        ma_device_config cfg = ma_device_config_init(ma_device_type_playback);
        cfg.playback.format = ma_format_f32; cfg.playback.channels = 2; cfg.sampleRate = kEngineRate;
        cfg.dataCallback = callback; cfg.pUserData = this; cfg.performanceProfile = ma_performance_profile_low_latency;
        ma_context* pc = nullptr;
        if (std::getenv("BEATCORE_NULL_AUDIO")) {       // test mode: no sound card needed
            ma_backend nb[] = {ma_backend_null};
            if (ma_context_init(nb, 1, nullptr, &ctx) != MA_SUCCESS) return false;
            ctxInit = true; pc = &ctx;
        }
        if (ma_device_init(pc, &cfg, &dev) != MA_SUCCESS) return false;
        devInit = true;
        return ma_device_start(&dev) == MA_SUCCESS;
    }

    // The 6-part model (drums, bass, other, vocals, guitar, piano) is preferred; the 4-part model is the fallback.
    // stemSkip > 0 means: the first model(s) found could not be used, take the next one.
    std::atomic<int> stemSkip{0};
    std::string stemModelPath() const {
        int skip = stemSkip.load();
        for (const char* n : {"htdemucs_6s_fp16weights.onnx", "htdemucs_6s.onnx", "htdemucs_fp16weights.onnx", "htdemucs.onnx"}) {
            std::string p = modelDir + "/" + n;
            if (fileSize(p) > 0) { if (skip > 0) { --skip; continue; } return p; }
        }
        return "";
    }
    std::string stemCacheFile(const std::string& model) const {
        return cacheBase + "_" + std::to_string(fileSize(model)) + ".stems";
    }
    void stemsStopAndJoin() {
        stemCancel = true;
        if (stemWorker.joinable()) stemWorker.join();
        stemCancel = false;
    }
    void stemFail(const std::string& m) { { std::lock_guard<std::mutex> l(mu); stemErr = m; } stemState = (int)StemState::Error; }

    void runStems(int gen) {
        try {
            PlaybackEngine* e = engine.load();
            if (!e) return stemFail("No song is loaded.");
            const std::string model = stemModelPath();
            const std::string cachePath = model.empty() ? "" : stemCacheFile(model);
            StemSet set;
            const long wantFrames = (long)std::llround(e->durationSeconds() * kEngineRate);
            bool got = !cachePath.empty() && set.load(cachePath) && std::labs(set.frames - wantFrames) < 4 * kEngineRate / 10;
            if (!got) {
                if (model.empty()) return stemFail("Stem model not found in " + modelDir + " (htdemucs_6s_fp16weights.onnx, htdemucs_6s.onnx, htdemucs_fp16weights.onnx or htdemucs.onnx).");
                stemProg = 0.01f;
                std::vector<float> st = decodeAudioFile(songPath, 2, kEngineRate);
                if (st.size() < 2 * (size_t)kEngineRate) return stemFail("Cannot decode the file again for stem separation.");
                const long T = (long)(st.size() / 2);
                std::vector<float> L(T), R(T);
                for (long i = 0; i < T; ++i) { L[i] = st[2*i]; R[i] = st[2*i+1]; }
                std::vector<float>().swap(st);
                StemSeparator sep(model);
                if (!sep.ok()) {
                    if (stemSkip.load() == 0) {            // try the next model file (e.g. the 4-part one) once
                        stemSkip = 1;
                        if (!stemModelPath().empty()) return runStems(gen);
                        stemSkip = 0;
                    }
                    return stemFail("Stem model cannot be used: " + sep.error());
                }
                const uint32_t all = (1u << sep.sourceNames().size()) - 1;
                set = sep.separate(L.data(), R.data(), T, all, [&](float p) {
                    stemProg = 0.02f + 0.93f * p;
                    return !stemCancel.load() && songGen.load() == gen;
                });
                if (set.pcm.empty()) {
                    if (stemCancel.load() || songGen.load() != gen) { stemState = (int)StemState::None; return; }
                    return stemFail("Stem separation failed.");
                }
                bcpath::makeDir(cacheDir);
                const std::string tmp = cachePath + ".tmp";
                if (set.save(tmp)) std::rename(tmp.c_str(), cachePath.c_str());
            }
            if (stemCancel.load() || songGen.load() != gen || engine.load() != e) { stemState = (int)StemState::None; return; }
            stemProg = 0.96f;
            std::vector<std::vector<float>> tracks;
            for (size_t k = 0; k < set.pcm.size(); ++k) {
                const long T = set.frames; const int16_t* p = set.pcm[k].data();
                std::vector<float> v((size_t)2 * T);
                for (long i = 0; i < T; ++i) { v[2*i] = p[i] / 32768.f; v[2*i+1] = p[T + i] / 32768.f; }
                tracks.push_back(std::move(v));
                std::vector<int16_t>().swap(set.pcm[k]);
            }
            e->setStems(std::move(tracks));
            for (int k = 0; k < 8; ++k) e->setStemGain(k, stemGains[k].load());
            e->setStemsEnabled(stemsOn.load());
            { std::lock_guard<std::mutex> l(mu); stemNamesV = set.names; stemErr.clear(); }
            stemProg = 1.f; stemState = (int)StemState::Ready;
        } catch (const std::exception& ex) { stemFail(std::string("Stem separation failed: ") + ex.what()); }
    }

    bool earlyPublished = false;   // the engine was handed to the sound device before the analysis finished (worker thread only)
    void fail(const std::string& m) {
        { std::lock_guard<std::mutex> l(mu); err = m; }
        if (earlyPublished) {      // do not leave a song playing that the player has given up on
            earlyPublished = false;
            PlaybackEngine* o = engine.exchange(nullptr);
            if (o) { o->pause(); std::this_thread::sleep_for(std::chrono::milliseconds(250)); delete o; }
        }
        state = (int)PlayerState::Error;
    }

    void run(std::string path) {
        try {
            state = (int)PlayerState::Decoding; prog = 0.f; cached = false;
            stemState = (int)StemState::None; stemProg = 0.f; stemsOn = false;
            { std::lock_guard<std::mutex> l(mu); stemErr.clear(); stemNamesV.clear(); haveActs = false; }
            songPath = path; songGen++;
            std::vector<float> stereo = decodeAudioFile(path, 2, kEngineRate);
            if (stereo.size() < 2 * kEngineRate) return fail("Cannot decode this file (or it is shorter than 1 second).");
            prog = 0.04f;
            std::vector<float> mono = decodeAudioFile(path, 1, kSampleRate);
            if (mono.empty()) return fail("Cannot decode this file.");
            prog = 0.08f;

            // The original song can be played while the rhythm is still being analysed: the engine is published now
            // (without a beat map and without metronome); the beat map is added to the same engine when it is ready.
            auto* e = new PlaybackEngine(kEngineRate);
            e->setSong(std::move(stereo));
            e->setSpeed(speedS); e->setSongVolume(volS);
            { MetronomeSettings off = metS; off.enabled = false; e->setMetronome(off); }
            if (!startDevice()) { delete e; return fail("Cannot open the sound output device."); }
            { PlaybackEngine* old = engine.exchange(e); earlyPublished = true;
              if (old) { old->pause(); std::this_thread::sleep_for(std::chrono::milliseconds(250)); delete old; } }

            const std::string melP = modelDir + "/mel_spectrogram.onnx", netP = modelDir + "/beat_this.onnx";
            uint64_t sz = 0; uint64_t key = fnv1a(path, (uint64_t)fileSize(netP) * 31 + 7, &sz);
            char name[64]; std::snprintf(name, sizeof name, "%016llx_%llu.act", (unsigned long long)key, (unsigned long long)sz);
            const std::string cacheFile = cacheDir + "/" + name;
            { char b2[64]; std::snprintf(b2, sizeof b2, "%016llx_%llu", (unsigned long long)key, (unsigned long long)sz); cacheBase = cacheDir + "/" + b2; }
            Activations act;
            if (act.load(cacheFile)) { cached = true; }
            else {
                state = (int)PlayerState::Analyzing;
                if (!analyzer) {
                    if (fileSize(melP) == 0 || fileSize(netP) == 0) return fail("Model files not found in " + modelDir);
                    analyzer.reset(new BeatAnalyzer(melP, netP));
                }
                prog = 0.15f;
                act = analyzer->computeActivations(mono.data(), mono.size(), [this](float p) { prog = 0.15f + 0.85f * p; });
                analyzer.reset();   // free the network (~1 GB): it is needed only while a song is being analysed
                bcpath::makeDir(cacheDir); act.save(cacheFile);
            }
            { std::lock_guard<std::mutex> l(mu); lastActs = act; haveActs = true; }
            auto bm = std::make_shared<BeatMap>(decodeBeatMap(act, AnalyzerConfig::forMeterMode(meterMode.load())));
            if (bm->beats.size() < 8) return fail("Could not find a steady beat in this song.");

            e->setBeatMap(*bm);
            e->setMetronome(metS); e->setCountIn(ciS); e->setClickSound(clickS);
            { std::lock_guard<std::mutex> l(mu); map = bm; }
            earlyPublished = false;
            prog = 1.f; state = (int)PlayerState::Ready;
        } catch (const std::exception& ex) { fail(std::string("Analysis failed: ") + ex.what()); }
    }
};

Player::Player(const std::string& m, const std::string& c) : impl_(new Impl) { for (auto& g : impl_->stemGains) g = 1.0f; impl_->modelDir = m; impl_->cacheDir = c; bcpath::makeDir(c); }
Player::~Player() {
    auto& m = *impl_;
    m.expStopAndJoin();
    m.stemsStopAndJoin();
    if (m.worker.joinable()) m.worker.join();
    if (m.devInit) { ma_device_uninit(&m.dev); }
    if (m.ctxInit) ma_context_uninit(&m.ctx);
    delete m.engine.exchange(nullptr);
}

bool Player::openFile(const std::string& path) {
    auto& m = *impl_; int s = m.state.load();
    if (s == (int)PlayerState::Decoding || s == (int)PlayerState::Analyzing) return false;
    m.stemsStopAndJoin();
    if (m.worker.joinable()) m.worker.join();
    m.state = (int)PlayerState::Decoding;
    m.worker = std::thread([this, path] { impl_->run(path); });
    return true;
}
void Player::unload() {
    auto& m = *impl_; int s = m.state.load();
    if (s == (int)PlayerState::Decoding || s == (int)PlayerState::Analyzing) return;
    m.stemsStopAndJoin();
    m.stemState = (int)StemState::None; m.stemProg = 0.f; m.stemsOn = false;
    { std::lock_guard<std::mutex> l(m.mu); m.stemNamesV.clear(); m.stemErr.clear(); }
    if (m.worker.joinable()) m.worker.join();
    PlaybackEngine* old = m.engine.exchange(nullptr);
    if (old) { old->pause(); std::this_thread::sleep_for(std::chrono::milliseconds(250)); delete old; }
    { std::lock_guard<std::mutex> l(m.mu); m.map.reset(); m.err.clear(); }
    m.prog = 0.f; m.state = (int)PlayerState::Idle;
}
PlayerState Player::state() const { return (PlayerState)impl_->state.load(); }
float Player::progress() const { return impl_->prog; }
std::string Player::error() const { std::lock_guard<std::mutex> l(impl_->mu); return impl_->err; }
bool Player::fromCache() const { return impl_->cached; }
bool Player::setMeterMode(int mode) {
    auto& m = *impl_;
    m.meterMode = std::max(0, std::min(2, mode));
    if (state() != PlayerState::Ready) return false;
    Activations a;
    { std::lock_guard<std::mutex> l(m.mu); if (!m.haveActs) return false; a = m.lastActs; }
    auto bm = std::make_shared<BeatMap>(decodeBeatMap(a, AnalyzerConfig::forMeterMode(m.meterMode.load())));
    if (bm->beats.size() < 8) return false;
    PlaybackEngine* e = m.engine.load();
    if (!e) return false;
    e->setBeatMap(*bm);
    { std::lock_guard<std::mutex> l(m.mu); m.map = bm; }
    return true;
}
int Player::meterMode() const { return impl_->meterMode.load(); }
std::shared_ptr<const BeatMap> Player::beatMap() const { std::lock_guard<std::mutex> l(impl_->mu); return impl_->map; }
double Player::songBpm() const { auto m = beatMap(); return m ? m->bpm : 0.0; }
double Player::durationSeconds() const { auto* e = impl_->engine.load(); return e ? e->durationSeconds() : 0.0; }

#define WITH_ENGINE(expr, fallback) do { auto* e = impl_->engine.load(); if (e) { return (expr); } return (fallback); } while (0)
void Player::play() { if (auto* e = impl_->engine.load()) e->play(); }
void Player::pause() { if (auto* e = impl_->engine.load()) e->pause(); }
bool Player::isPlaying() const { WITH_ENGINE(e->isPlaying(), false); }
void Player::seekSeconds(double s) { if (auto* e = impl_->engine.load()) e->seekSeconds(s); }
double Player::positionSeconds() const { WITH_ENGINE(e->positionSeconds(), 0.0); }
void Player::setSpeed(double r) { impl_->speedS = r; if (auto* e = impl_->engine.load()) e->setSpeed(r); }
double Player::speed() const { return impl_->speedS; }
MetronomeSettings Player::metronomeSettings() const { return impl_->metS; }
long Player::loopWraps() const { auto* e = impl_->engine.load(); return e ? e->loopWraps() : 0; }
void Player::setMetronome(const MetronomeSettings& s) { impl_->metS = s; if (auto* e = impl_->engine.load()) e->setMetronome(s); }
void Player::setSongVolume(float v) { impl_->volS = v; if (auto* e = impl_->engine.load()) e->setSongVolume(v); }
void Player::setCountIn(const CountInSettings& s) { impl_->ciS = s; if (auto* e = impl_->engine.load()) e->setCountIn(s); }
bool Player::isCountingIn() const { WITH_ENGINE(e->isCountingIn(), false); }
bool Player::countInBeat(int* beat, int* total) const { WITH_ENGINE(e->countInBeat(beat, total), false); }
void Player::setClickSound(int id) { impl_->clickS = id; if (auto* e = impl_->engine.load()) e->setClickSound(id); }
bool Player::setLoop(double a, double b) { WITH_ENGINE(e->setLoop(a, b), false); }
void Player::clearLoop() { if (auto* e = impl_->engine.load()) e->clearLoop(); }
bool Player::loopEnabled() const { WITH_ENGINE(e->loopEnabled(), false); }
double Player::snapToBar(double s) const { WITH_ENGINE(e->snapToBar(s), s); }
double Player::snapToBeat(double s) const { WITH_ENGINE(e->snapToBeat(s), s); }
std::vector<float> Player::peaks() const { auto* e = impl_->engine.load(); return e ? e->peaks() : std::vector<float>(); }
bool Player::stemsAvailable() const { return state() == PlayerState::Ready && !impl_->stemModelPath().empty(); }
bool Player::stemsCached() const {
    if (state() != PlayerState::Ready) return false;
    const std::string m = impl_->stemModelPath();
    return !m.empty() && fileSize(impl_->stemCacheFile(m)) > 0;
}
bool Player::stemsStart() {
    auto& m = *impl_;
    if (state() != PlayerState::Ready) return false;
    if (m.stemModelPath().empty()) { m.stemFail("Stem model not found in " + m.modelDir + " (htdemucs.onnx or htdemucs_fp16weights.onnx)."); return false; }
    if (m.stemState.load() == (int)StemState::Running) return false;
    if (m.stemState.load() == (int)StemState::Ready) return true;
    m.stemsStopAndJoin();
    m.stemState = (int)StemState::Running; m.stemProg = 0.f;
    const int gen = m.songGen.load();
    m.stemWorker = std::thread([this, gen] { impl_->runStems(gen); });
    return true;
}
void Player::stemsCancel() { auto& m = *impl_; if (m.stemState.load() == (int)StemState::Running) { m.stemsStopAndJoin(); m.stemState = (int)StemState::None; } }
StemState Player::stemsState() const { return (StemState)impl_->stemState.load(); }
float Player::stemsProgress() const { return impl_->stemProg; }
std::string Player::stemsError() const { std::lock_guard<std::mutex> l(impl_->mu); return impl_->stemErr; }
std::vector<std::string> Player::stemNames() const { std::lock_guard<std::mutex> l(impl_->mu); return impl_->stemNamesV; }
void Player::setStemsEnabled(bool on) { impl_->stemsOn = on; if (auto* e = impl_->engine.load()) e->setStemsEnabled(on); }
bool Player::stemsEnabled() const { auto* e = impl_->engine.load(); return e && e->stemsEnabled(); }
void Player::setStemGain(int i, float g) { if (i >= 0 && i < 8) { impl_->stemGains[i] = g; if (auto* e = impl_->engine.load()) e->setStemGain(i, g); } }
bool Player::exportStart(const std::string& path, bool withMetronome) {
    // legacy form: the song as it sounds now (parts with a non-zero level, at their levels)
    ExportRequest r; r.path = path; r.withMetronome = withMetronome;
    if (impl_->stemState.load() == (int)StemState::Ready && impl_->stemsOn.load())
        for (int k = 0; k < 8 && k < (int)stemNames().size(); ++k) { float g = impl_->stemGains[k].load(); if (g > 0.f) { r.stems.push_back(k); r.stemGains.push_back(g); } }
    return exportStart(r);
}
bool Player::exportStart(const ExportRequest& r) {
    auto& m = *impl_;
    if (m.state.load() != (int)PlayerState::Ready || m.expState.load() == 1) return false;
    m.expStopAndJoin();
    Impl::ExpJob j;
    { std::lock_guard<std::mutex> l(m.mu); j.map = m.map; j.stemNames = m.stemNamesV; }
    if (!j.map) return false;
    j.outPath = r.path; j.songPath = m.songPath; j.metronome = r.withMetronome; j.separate = r.separate;
    j.countInBars = r.withMetronome ? std::max(0, std::min(4, r.countInBars)) : 0;   // a count-in is made only with the metronome
    j.clickIntoStem = r.clickIntoStem;
    if (r.rangeB > r.rangeA && r.rangeA >= 0) { j.hasRange = true; j.rangeA = r.rangeA; j.rangeB = r.rangeB; }
    j.speed = r.speedRatio > 0 ? std::max(0.25, std::min(2.0, r.speedRatio)) : m.speedS.load();
    j.vol = m.volS.load(); j.click = m.clickS.load(); j.met = m.metS;
    if (r.accent >= 0) j.met.accentFirstBeat = r.accent != 0;
    if (r.quiet >= 0) j.met.quietEnabled = r.quiet != 0;
    if (!r.stems.empty()) {
        if (m.stemState.load() != (int)StemState::Ready) return false;
        j.useStems = true; j.stemIdx = r.stems;
        for (size_t k = 0; k < r.stems.size(); ++k) j.stemGain.push_back(k < r.stemGains.size() ? std::max(0.f, std::min(1.5f, r.stemGains[k])) : 1.0f);
        j.stemCache = m.stemCacheFile(m.stemModelPath());
    }
    { std::lock_guard<std::mutex> l(m.mu); m.expErr.clear(); }
    m.expProg = 0.f; m.expState = 1;
    Impl* im = &m;
    m.expWorker = std::thread([im, j] { im->runExport(j); });
    return true;
}
int Player::exportState() const { return impl_->expState.load(); }
float Player::exportProgress() const { return impl_->expProg.load(); }
std::string Player::exportError() const { std::lock_guard<std::mutex> l(impl_->mu); return impl_->expErr; }
void Player::exportCancel() { auto& m = *impl_; if (m.expState.load() == 1) { m.expStopAndJoin(); if (m.expState.load() == 1) m.expState = 0; } }

bool Player::deviceRunning() const { return impl_->devInit; }

BeatInfo Player::currentBeat() const {
    BeatInfo bi; auto m = beatMap(); auto* e = impl_->engine.load();
    if (!m || !e) return bi;
    bi.countingIn = e->isCountingIn();
    double t = e->positionSeconds();
    auto it = std::upper_bound(m->beats.begin(), m->beats.end(), t + 0.02);
    if (it == m->beats.begin()) return bi;
    int i = (int)(it - m->beats.begin()) - 1;
    bi.beatIndex = i; bi.posInBar = m->posInBar[i]; bi.barLength = m->barLength[i];
    return bi;
}

} // namespace beatcore
