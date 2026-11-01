#include "playback_engine.h"
#include "../third_party/signalsmith-stretch.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <mutex>

namespace beatcore {

namespace {
constexpr int kMaxChunk = 512;      // frames processed per internal step

std::vector<float> makeTick(int sr, double freq, double ms, float amp) {
    int n = (int)(sr * ms / 1000.0);
    std::vector<float> w(n);
    for (int i = 0; i < n; ++i) {
        double t = (double)i / sr;
        w[i] = (float)(amp * std::sin(2 * M_PI * freq * t) * std::exp(-t * 60.0));
    }
    return w;
}
// Metronome sounds. `high` = the accented (first beat) version of the sound.
std::vector<float> makeSound(int sr, int id, bool high) {
    auto env = [](double t, double k) { return std::exp(-t * k); };
    std::vector<float> w;
    switch (id) {
    default:
    case 0: return high ? makeTick(sr, 1800.0, 80.0, 0.6f) : makeTick(sr, 1000.0, 50.0, 0.35f);   // classic
    case 1: {   // wood block: pitched knock with a short body
        double f = high ? 1250.0 : 850.0;
        int n = (int)(sr * 0.06); w.resize(n);
        for (int i = 0; i < n; ++i) { double t = (double)i / sr;
            w[i] = (float)((high ? 0.45 : 0.38) * (std::sin(2 * M_PI * f * t) + 0.35 * std::sin(2 * M_PI * f * 2.4 * t)) * env(t, 85.0)); }
        return w; }
    case 2: {   // hi-hat: high-passed noise burst, longer when accented
        int n = (int)(sr * (high ? 0.09 : 0.04)); w.resize(n);
        unsigned s = high ? 12345u : 6789u; float prev = 0.f;
        for (int i = 0; i < n; ++i) { double t = (double)i / sr;
            s = s * 1664525u + 1013904223u;
            float x = ((float)(s >> 8) / (float)(1 << 24)) * 2.f - 1.f;
            float hp = x - prev; prev = x;                      // first difference = crude high-pass
            w[i] = (float)((high ? 0.30 : 0.24) * hp * env(t, high ? 38.0 : 85.0)); }
        return w; }
    case 3: {   // rim click: very short, bright
        double f1 = high ? 2300.0 : 1700.0, f2 = high ? 4300.0 : 3100.0;
        int n = (int)(sr * 0.03); w.resize(n);
        for (int i = 0; i < n; ++i) { double t = (double)i / sr;
            w[i] = (float)((high ? 0.40 : 0.33) * (std::sin(2 * M_PI * f1 * t) + 0.6 * std::sin(2 * M_PI * f2 * t)) * env(t, 150.0)); }
        return w; }
    case 4: {   // cowbell: two inharmonic tones, slightly saturated
        double f1 = high ? 700.0 : 560.0, f2 = high ? 1050.0 : 845.0;
        int n = (int)(sr * 0.16); w.resize(n);
        for (int i = 0; i < n; ++i) { double t = (double)i / sr;
            double x = std::sin(2 * M_PI * f1 * t) + std::sin(2 * M_PI * f2 * t);
            w[i] = (float)((high ? 0.55 : 0.45) * std::tanh(1.6 * x) * env(t, 20.0)); }
        return w; }
    case 5: {   // electronic beep: square wave with a tiny attack
        double f = high ? 1320.0 : 880.0;
        int n = (int)(sr * 0.05); w.resize(n);
        for (int i = 0; i < n; ++i) { double t = (double)i / sr;
            double sq = std::sin(2 * M_PI * f * t) >= 0 ? 1.0 : -1.0;
            double att = std::min(1.0, t / 0.001);
            w[i] = (float)((high ? 0.45 : 0.36) * sq * att * env(t, 45.0)); }
        return w; }
    }
}
struct ActiveClick { const std::vector<float>* wave; int pos; float gain; };

constexpr int kMaxStems = 8;

// One stereo track (the whole song, or one stem) with its own time stretcher.
struct Track {
    std::vector<float> L, R;                       // planar, with a second of zero padding at the end
    std::vector<float> outL, outR;                 // output of the last chunk
    signalsmith::stretch::SignalsmithStretch<float> stretch;
    explicit Track(int sr) {
        stretch.presetDefault(2, (float)sr);
        stretch.setTransposeFactor(1.0f);
        outL.resize(kMaxChunk); outR.resize(kMaxChunk);
    }
};
}

struct PlaybackEngine::Impl {
    int sr;
    // the song as one track, plus (optionally) the same song split into stems; the stems replace the main track while enabled
    Track main;
    std::vector<std::unique_ptr<Track>> stems;
    std::atomic<bool> stemsOnA{false};
    std::atomic<int> stemCountA{0};
    std::atomic<float> stemGainA[kMaxStems];
    bool stemsApplied = false;                    // audio-thread view of "stems are what is playing"
    std::mutex swapMu;                            // held by the audio thread while rendering, and while stems are swapped
    long totalFrames = 0;
    std::vector<double> beatSample;       // source-sample position of each beat
    std::vector<int> beatPos, beatBarLen;
    std::vector<float> peaks;
    long playFirst = -1, playLast = -1;   // beat index range

    std::atomic<bool> playing{false};
    std::atomic<double> speedA{1.0};
    std::atomic<double> seekReq{-1.0};
    std::atomic<float> songVol{1.0f}, metVol{0.8f};
    std::atomic<bool> metOn{true}, accent{true};
    std::atomic<double> posOut{0.0};
    std::atomic<uint64_t> loopPacked{0};          // (A frame << 32) | B frame ; 0 = no loop
    std::atomic<int> ciBarsA{0};
    std::atomic<bool> ciEveryLoopA{false}, ciActiveA{false}, ciSilentA{false};
    std::atomic<long> stopFrame{-1};              // export: stop here (source frames), -1 = play to the end
    std::atomic<int> lastFrames{0};               // frames of real sound in the last render() call

    // audio-thread state
    double srcPos = 0;                    // source sample that will be heard at the next output sample
    long inCursor = 0;                    // source samples already given to the stretcher
    long lead = 0;                        // how far the stretcher's input runs ahead of srcPos (its latency)
    double appliedRate = 0;
    bool needReseek = true;
    size_t nextBeat = 0;
    std::atomic<bool> pendingCountIn{false}, pendingSnap{false};
    bool ciActive = false;
    int ciN = 0, ciNext = 0; double ciPeriod = 0; long ciTotal = 0, ciPos = 0;
    int fadeInLeft = 0;
    static constexpr int kLoopFade = 44;           // ~1 ms fade at the loop seam, avoids a click
    std::vector<ActiveClick> active;
    std::vector<std::vector<float>> bankLow, bankHigh;   // metronome sounds, built once (pointers stay valid)
    std::atomic<int> clickSoundA{0};
    std::atomic<int> ciBeatA{0}, ciTotalA{0};            // count-in progress for the visual metronome

    explicit Impl(int rate) : sr(rate), main(rate) {
        for (auto& g : stemGainA) g = 1.0f;
        for (int id = 0; id < kClickSounds; ++id) { bankLow.push_back(makeSound(sr, id, false)); bankHigh.push_back(makeSound(sr, id, true)); }
    }

    void locateNextBeat() {
        nextBeat = std::lower_bound(beatSample.begin(), beatSample.end(), srcPos - 0.5) - beatSample.begin();
        active.clear();
    }

    // (re)start the stretcher so that its next output sample is exactly the sound at srcPos
    // tracks that are heard right now: the stems (when enabled and present) or the whole song
    int activeTracks(Track** out) {
        if (stemsApplied && !stems.empty()) { int n = 0; for (auto& s : stems) out[n++] = s.get(); return n; }
        out[0] = &main; return 1;
    }

    void reseek(double rate) {
        Track* act[kMaxStems]; const int na = activeTracks(act);
        long start = std::max(0L, (long)std::floor(srcPos));
        int len = 0;
        for (int k = 0; k < na; ++k) {
            Track& t = *act[k];
            t.stretch.reset();
            t.stretch.setTransposeFactor(1.0f);
            len = t.stretch.outputSeekLength((float)rate);
            const float* in[2] = {t.L.data() + start, t.R.data() + start};
            t.stretch.outputSeek(in, len);
        }
        inCursor = start + len;
        lead = len;
        appliedRate = rate;
        needReseek = false;
    }

    void mixClicks(float* out, int n) {
        for (auto& c : active) {
            for (int i = 0; i < n; ++i) {
                int p = c.pos + i;
                if (p < 0) continue;
                if (p >= (int)c.wave->size()) break;
                float v = (*c.wave)[p] * c.gain;
                out[2*i] += v; out[2*i+1] += v;
            }
            c.pos += n;
        }
        active.erase(std::remove_if(active.begin(), active.end(),
            [](const ActiveClick& c) { return c.pos >= (int)c.wave->size(); }), active.end());
    }

    // A count-in must lead into a BAR START, otherwise the song seems to start late (silent intro, or mid-bar position).
    // So when playback starts, move the start to the first bar of the metronome range, or to the nearest bar start.
    void snapStartToBar() {
        long first = -1;
        for (size_t i = (size_t)std::max(0L, playFirst); i < beatSample.size(); ++i)
            if (beatPos[i] == 1) { first = (long)i; break; }
        double target = srcPos;
        if (first >= 0 && srcPos < beatSample[first]) target = beatSample[first];
        else {
            double bestD = 1e18;
            for (size_t i = 0; i < beatSample.size(); ++i)
                if (beatPos[i] == 1 && std::fabs(beatSample[i] - srcPos) < bestD) { bestD = std::fabs(beatSample[i] - srcPos); target = beatSample[i]; }
        }
        srcPos = target; needReseek = true; locateNextBeat();
    }

    void startCountIn(bool snap) {
        const int bars = ciBarsA.load();
        if (bars <= 0 || beatSample.size() < 2) return;
        if (snap) snapStartToBar();
        const double rate = speedA.load();
        long idx = std::lower_bound(beatSample.begin(), beatSample.end(), srcPos - 0.5) - beatSample.begin();
        idx = std::max(0L, std::min(idx, (long)beatSample.size() - 2));
        long span = std::min(4L, (long)beatSample.size() - 1 - idx);
        double periodSrc = (beatSample[idx + span] - beatSample[idx]) / (double)span;
        ciN = std::max(1, std::min(32, bars * beatBarLen[idx]));
        ciPeriod = periodSrc / rate;
        ciTotal = (long)std::llround(ciN * ciPeriod);
        ciPos = 0; ciNext = 0; ciActive = true; ciActiveA = true;
        ciTotalA = ciN; ciBeatA = 0;
        active.clear();
    }

    // one chunk of count-in: silence plus clicks
    void countInChunk(float* out, int n) {
        std::memset(out, 0, sizeof(float) * 2 * n);
        const float mv = metVol.load(); const bool acc = accent.load();
        const int sid = std::max(0, std::min(kClickSounds - 1, clickSoundA.load()));
        while (ciNext < ciN) {
            long off = (long)std::llround(ciNext * ciPeriod);
            if (off >= ciPos + n) break;
            if (!ciSilentA.load()) active.push_back({(acc && ciNext == 0) ? &bankHigh[sid] : &bankLow[sid], (int)-(off - ciPos), mv});
            ++ciNext;
            ciBeatA = ciNext;
        }
        mixClicks(out, n);
        ciPos += n;
        if (ciPos >= ciTotal) { ciActive = false; ciActiveA = false; }
    }

    // plays up to nReq frames of song (fewer if the loop end is reached); returns frames written
    int renderChunk(float* out, int nReq) {
        const double rate = speedA.load();
        const uint64_t lp = loopPacked.load();
        const bool loopOn = lp != 0;
        const double lo = (double)(lp >> 32), hi = (double)(lp & 0xffffffffu);
        if (loopOn && srcPos >= hi) {                   // loop switched on after we had already passed B
            srcPos = lo + std::fmod(srcPos - hi, hi - lo); needReseek = true; locateNextBeat();
        }
        int n = nReq; bool wrapNow = false, stopNow = false;
        if (loopOn) {
            int nl = (int)std::ceil((hi - srcPos) / rate - 1e-9);
            if (nl <= n) { n = std::max(1, nl); wrapNow = true; }
        } else {
            const long sf = stopFrame.load();
            if (sf >= 0) {
                int nl = (int)std::ceil(((double)sf - srcPos) / rate - 1e-9);
                if (nl <= n) { n = std::max(1, nl); stopNow = true; }
            }
        }
        {   // stems switched on/off from the UI: start the newly heard tracks exactly at srcPos
            const bool want = stemsOnA.load() && !stems.empty();
            if (want != stemsApplied) { stemsApplied = want; needReseek = true; }
        }
        const bool bypass = std::fabs(rate - 1.0) < 1e-9;
        if (!bypass && (needReseek || rate != appliedRate)) reseek(rate);
        Track* act[kMaxStems]; const int na = activeTracks(act);
        const double srcStart = srcPos;
        const double srcEnd = srcPos + n * rate;

        if (bypass) {
            long base = (long)std::llround(srcPos);
            for (int a = 0; a < na; ++a) {
                Track& t = *act[a];
                for (int i = 0; i < n; ++i) {
                    long k = base + i;
                    t.outL[i] = (k >= 0 && k < totalFrames) ? t.L[k] : 0.f;
                    t.outR[i] = (k >= 0 && k < totalFrames) ? t.R[k] : 0.f;
                }
            }
            appliedRate = 1.0; needReseek = true;       // stretcher state is stale after bypass
        } else {
            long target = std::max(inCursor, (long)std::floor(srcEnd) + lead);   // keep the constant lead
            int inN = (int)(target - inCursor);
            for (int a = 0; a < na; ++a) {
                Track& t = *act[a];
                const float* in[2] = {t.L.data() + inCursor, t.R.data() + inCursor};
                float* o[2] = {t.outL.data(), t.outR.data()};
                t.stretch.process(in, inN, o, n);
            }
            inCursor += inN;
        }

        const float sv = songVol.load();
        if (!stemsApplied) {
            for (int i = 0; i < n; ++i) { out[2*i] = main.outL[i] * sv; out[2*i+1] = main.outR[i] * sv; }
        } else {                                        // stems: each part has its own level
            for (int i = 0; i < n; ++i) { out[2*i] = 0.f; out[2*i+1] = 0.f; }
            for (int a = 0; a < na; ++a) {
                const float g = stemGainA[a].load() * sv;
                const Track& t = *act[a];
                if (g == 0.f) continue;
                for (int i = 0; i < n; ++i) { out[2*i] += t.outL[i] * g; out[2*i+1] += t.outR[i] * g; }
            }
        }
        if (fadeInLeft > 0) {
            for (int i = 0; i < n && fadeInLeft > 0; ++i, --fadeInLeft) {
                float g = (float)(kLoopFade - fadeInLeft + 1) / kLoopFade;
                out[2*i] *= g; out[2*i+1] *= g;
            }
        }
        if (wrapNow || stopNow) {
            int f = std::min(n, kLoopFade);
            for (int i = 0; i < f; ++i) {
                float g = (float)(i + 1) / (f + 1);              // goes 1 -> 0 over the last f frames
                out[2*(n-1-i)] *= g; out[2*(n-1-i)+1] *= g;
            }
        }

        // metronome: put each click at the output sample where its original beat is heard
        const double effEnd = wrapNow ? hi : (stopNow ? std::min(srcEnd, (double)stopFrame.load()) : srcEnd);
        if (metOn.load() && playFirst >= 0) {
            const float mv = metVol.load(); const bool acc = accent.load();
            const int sid = std::max(0, std::min(kClickSounds - 1, clickSoundA.load()));
            while (nextBeat < beatSample.size() && beatSample[nextBeat] < effEnd) {
                long idx = (long)nextBeat;
                if (idx >= playFirst && idx <= playLast) {
                    int off = (int)std::floor((beatSample[nextBeat] - srcStart) / rate + 0.5);
                    off = std::max(0, std::min(n - 1, off));
                    bool first = acc && beatPos[nextBeat] == 1;
                    active.push_back({first ? &bankHigh[sid] : &bankLow[sid], -off, mv});
                }
                ++nextBeat;
            }
        } else {
            while (nextBeat < beatSample.size() && beatSample[nextBeat] < effEnd) ++nextBeat;
        }
        mixClicks(out, n);

        if (wrapNow) {
            srcPos = lo + (srcEnd - hi);                // carry the sub-sample overshoot: loops never drift
            needReseek = true; fadeInLeft = kLoopFade;
            nextBeat = std::lower_bound(beatSample.begin(), beatSample.end(), lo - 1e-6) - beatSample.begin();
            if (ciEveryLoopA.load()) pendingCountIn = true;
        } else {
            srcPos = srcEnd;
        }
        return n;
    }
};

PlaybackEngine::PlaybackEngine(int sr) : impl_(new Impl(sr)) {}
PlaybackEngine::~PlaybackEngine() = default;

void PlaybackEngine::setSong(std::vector<float> st) {
    auto& m = *impl_;
    m.totalFrames = (long)(st.size() / 2);
    m.main.L.assign(m.totalFrames + m.sr * 2, 0.f); m.main.R.assign(m.totalFrames + m.sr * 2, 0.f);
    for (long i = 0; i < m.totalFrames; ++i) { m.main.L[i] = st[2*i]; m.main.R[i] = st[2*i+1]; }
    m.srcPos = 0; m.needReseek = true; m.locateNextBeat(); m.posOut = 0;
    const long hop = std::max(1, m.sr / kPeaksPerSecond);
    m.peaks.assign((size_t)((m.totalFrames + hop - 1) / hop), 0.f);
    for (long i = 0; i < m.totalFrames; ++i) {
        float v = std::max(std::fabs(m.main.L[i]), std::fabs(m.main.R[i]));
        float& p = m.peaks[(size_t)(i / hop)]; if (v > p) p = v;
    }
}
const std::vector<float>& PlaybackEngine::peaks() const { return impl_->peaks; }
void PlaybackEngine::setBeatMap(const BeatMap& map) {
    auto& m = *impl_;
    std::lock_guard<std::mutex> g(m.swapMu);                     // the audio thread is not inside render() while this runs
    m.beatSample.clear(); m.beatPos = map.posInBar; m.beatBarLen = map.barLength;
    for (double t : map.beats) m.beatSample.push_back(t * m.sr);
    m.playFirst = map.playFirstBeat; m.playLast = map.playLastBeat;
    m.locateNextBeat();
}
void PlaybackEngine::setStems(std::vector<std::vector<float>> tracks) {
    auto& m = *impl_;
    std::vector<std::unique_ptr<Track>> ns;                      // built outside the lock: this is the slow part
    for (auto& st : tracks) {
        if ((int)ns.size() >= kMaxStems) break;
        auto t = std::make_unique<Track>(m.sr);
        t->L.assign(m.totalFrames + m.sr * 2, 0.f); t->R.assign(m.totalFrames + m.sr * 2, 0.f);
        const long frames = std::min<long>(m.totalFrames, (long)(st.size() / 2));
        for (long i = 0; i < frames; ++i) { t->L[i] = st[2*i]; t->R[i] = st[2*i+1]; }
        std::vector<float>().swap(st);                           // free the source copy early
        ns.push_back(std::move(t));
    }
    std::lock_guard<std::mutex> g(m.swapMu);                     // waits until the audio thread is not inside render()
    m.stems = std::move(ns);
    m.stemCountA = (int)m.stems.size();
    for (auto& x : m.stemGainA) x = 1.0f;
    m.needReseek = true;
}
void PlaybackEngine::setStemsEnabled(bool on) { impl_->stemsOnA = on; }
bool PlaybackEngine::stemsEnabled() const { return impl_->stemsOnA && impl_->stemCountA > 0; }
int PlaybackEngine::stemCount() const { return impl_->stemCountA; }
void PlaybackEngine::setStemGain(int i, float g) {
    if (i >= 0 && i < kMaxStems) impl_->stemGainA[i] = std::max(0.f, std::min(1.5f, g));
}
void PlaybackEngine::play() { if (!impl_->playing.exchange(true)) { impl_->pendingSnap = true; impl_->pendingCountIn = true; } }
void PlaybackEngine::pause() { impl_->playing = false; }
bool PlaybackEngine::isPlaying() const { return impl_->playing; }
void PlaybackEngine::seekSeconds(double s) { impl_->seekReq = std::max(0.0, s); }
double PlaybackEngine::positionSeconds() const { return impl_->posOut / impl_->sr; }
double PlaybackEngine::durationSeconds() const { return (double)impl_->totalFrames / impl_->sr; }
void PlaybackEngine::setSpeed(double r) { impl_->speedA = std::max(0.25, std::min(2.0, r)); }
double PlaybackEngine::speed() const { return impl_->speedA; }
void PlaybackEngine::setMetronome(const MetronomeSettings& s) {
    impl_->metOn = s.enabled; impl_->metVol = s.volume; impl_->accent = s.accentFirstBeat;
}
void PlaybackEngine::setSongVolume(float v) { impl_->songVol = std::max(0.f, std::min(1.5f, v)); }
void PlaybackEngine::setCountIn(const CountInSettings& s) { impl_->ciBarsA = std::max(0, std::min(4, s.bars)); impl_->ciEveryLoopA = s.everyLoopRestart; }
bool PlaybackEngine::isCountingIn() const { return impl_->ciActiveA; }
bool PlaybackEngine::countInBeat(int* beat, int* total) const {
    if (!impl_->ciActiveA) return false;
    if (beat) *beat = impl_->ciBeatA;
    if (total) *total = impl_->ciTotalA;
    return true;
}
void PlaybackEngine::setCountInSilent(bool silent) { impl_->ciSilentA = silent; }
void PlaybackEngine::setStopAt(double s) { impl_->stopFrame = s < 0 ? -1L : (long)std::llround(s * impl_->sr); }
int PlaybackEngine::lastRenderFrames() const { return impl_->lastFrames; }
void PlaybackEngine::setClickSound(int id) { impl_->clickSoundA = std::max(0, std::min(kClickSounds - 1, id)); }
bool PlaybackEngine::setLoop(double a, double b) {
    auto& m = *impl_;
    double dur = (double)m.totalFrames / m.sr;
    a = std::max(0.0, std::min(a, dur)); b = std::max(0.0, std::min(b, dur));
    if (b - a < 0.25) return false;
    uint64_t fa = (uint64_t)std::llround(a * m.sr), fb = (uint64_t)std::llround(b * m.sr);
    m.loopPacked = (fa << 32) | fb;
    return true;
}
void PlaybackEngine::clearLoop() { impl_->loopPacked = 0; }
bool PlaybackEngine::loopEnabled() const { return impl_->loopPacked != 0; }
double PlaybackEngine::snapToBeat(double sec) const {
    const auto& m = *impl_; if (m.beatSample.empty()) return sec;
    double s = sec * m.sr; size_t i = std::lower_bound(m.beatSample.begin(), m.beatSample.end(), s) - m.beatSample.begin();
    size_t best = (i == 0) ? 0 : std::min(i, m.beatSample.size() - 1);
    if (i > 0 && i < m.beatSample.size() && s - m.beatSample[i-1] < m.beatSample[i] - s) best = i - 1;
    return m.beatSample[best] / m.sr;
}
double PlaybackEngine::snapToBar(double sec) const {
    const auto& m = *impl_; if (m.beatSample.empty()) return sec;
    double s = sec * m.sr, bestD = 1e18, bestT = sec;
    for (size_t i = 0; i < m.beatSample.size(); ++i)
        if (m.beatPos[i] == 1 && std::fabs(m.beatSample[i] - s) < bestD) { bestD = std::fabs(m.beatSample[i] - s); bestT = m.beatSample[i] / m.sr; }
    return bestT;
}

void PlaybackEngine::render(float* out, int frames) {
    auto& m = *impl_;
    std::unique_lock<std::mutex> swapLock(m.swapMu, std::try_to_lock);   // only contended while stems are being swapped in
    if (!swapLock.owns_lock()) { std::memset(out, 0, sizeof(float) * 2 * frames); m.lastFrames = 0; return; }
    double req = m.seekReq.exchange(-1.0);
    if (req >= 0) {
        m.srcPos = req * m.sr; m.needReseek = true; m.locateNextBeat(); m.fadeInLeft = 0;
        m.ciActive = false; m.ciActiveA = false;       // a seek during the count-in cancels it (a pending count-in from play() stays)
    }
    std::memset(out, 0, sizeof(float) * 2 * frames);
    if (!m.playing || m.totalFrames == 0) {
        m.ciActive = false; m.ciActiveA = false; m.active.clear(); m.posOut = m.srcPos; m.lastFrames = 0; return;
    }
    int done = 0;
    while (done < frames) {
        if (m.pendingCountIn.exchange(false)) { m.startCountIn(m.pendingSnap.exchange(false)); }
        if (m.ciActive) {
            int n = (int)std::min<long>(std::min(kMaxChunk, frames - done), m.ciTotal - m.ciPos);
            n = std::max(1, n);
            m.countInChunk(out + 2 * done, n); done += n; continue;
        }
        if (m.srcPos >= m.totalFrames) { m.playing = false; break; }
        { const long sf = m.stopFrame.load(); if (sf >= 0 && m.srcPos >= (double)sf) { m.playing = false; break; } }
        done += m.renderChunk(out + 2 * done, std::min(kMaxChunk, frames - done));
    }
    m.posOut = m.srcPos;
    m.lastFrames = done;
}

} // namespace beatcore
