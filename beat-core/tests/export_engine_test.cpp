// Tests of what the export relies on in PlaybackEngine (no audio device, no model):
// stop-at (sample-exact end of an exported part), lastRenderFrames (no trailing silence), silent count-in (parts of equal length).
#include "../src/playback_engine.h"
#include <cmath>
#include <cstdio>
#include <vector>
using namespace beatcore;
static const int SR = 44100;
static int failures = 0;
static void expect(bool ok, const char* what, double v = -1) {
    if (v >= 0) printf("%-70s %.3f  %s\n", what, v, ok ? "PASS" : "FAIL"); else printf("%-70s %s\n", what, ok ? "PASS" : "FAIL");
    if (!ok) ++failures;
}
static const int SECONDS = 20;
static BeatMap makeMap() {   // 120 BPM, 4/4, first beat at 1.0 s
    BeatMap m; m.durationSec = SECONDS;
    for (int k = 0; k < 36; ++k) { m.beats.push_back(1.0 + 0.5 * k); m.barLength.push_back(4); m.posInBar.push_back(k % 4 + 1); }
    m.playFirstBeat = 0; m.playLastBeat = (int)m.beats.size() - 1; return m;
}
static std::vector<float> tone(double amp) {
    std::vector<float> v(2 * (size_t)SR * SECONDS);
    for (size_t i = 0; i < v.size() / 2; ++i) { float s = (float)(amp * std::sin(2 * M_PI * 440.0 * (double)i / SR)); v[2*i] = s; v[2*i+1] = s; }
    return v;
}
struct Rendered { std::vector<float> pcm; double startPos = 0; bool stopped = false; };
// same loop as Player::renderToWav
static Rendered renderPart(PlaybackEngine& e, double a, double b, double speed) {
    Rendered r; e.setStopAt(b); e.seekSeconds(a); e.play();
    const int B = 4410; std::vector<float> blk(2 * B); long guard = 0;
    while (e.isPlaying() && guard++ < 100000) {
        e.render(blk.data(), B);
        int valid = std::max(0, std::min(B, e.lastRenderFrames()));
        r.pcm.insert(r.pcm.end(), blk.begin(), blk.begin() + 2 * valid);
    }
    r.stopped = !e.isPlaying(); (void)speed; return r;
}
static double rms(const std::vector<float>& v, double from, double to) {
    long a = (long)(from * SR) * 2, b = std::min((long)(to * SR) * 2, (long)v.size()); double s = 0; long n = 0;
    for (long i = a; i < b; i += 2) { s += (double)v[i] * v[i]; ++n; }
    return n ? std::sqrt(s / n) : 0;
}
static std::unique_ptr<PlaybackEngine> mk(double speed, bool metronome, int ciBars, bool ciSilent, float vol) {
    auto e = std::make_unique<PlaybackEngine>(SR);
    e->setSong(tone(0.2)); e->setBeatMap(makeMap()); e->setSpeed(speed);
    MetronomeSettings ms; ms.enabled = metronome; ms.volume = 0.8f; e->setMetronome(ms);
    e->setSongVolume(vol); CountInSettings ci; ci.bars = ciBars; e->setCountIn(ci); e->setCountInSilent(ciSilent);
    return e;
}
int main() {
    for (double speed : {1.0, 0.8, 1.25}) {
        auto e = mk(speed, false, 0, false, 1.f);
        Rendered r = renderPart(*e, 3.0, 9.0, speed);
        double secs = (double)r.pcm.size() / 2 / SR, want = 6.0 / speed;
        char name[96]; snprintf(name, sizeof name, "part 3..9 s at speed %.2f has the length of the part", speed);
        expect(r.stopped && std::fabs(secs - want) < 0.003, name, secs);
        expect(rms(r.pcm, secs - 0.02, secs) > 0.05, "  sound goes right up to the end (no trailing silence)");
    }
    // count-in: silent vs audible, same length
    auto ea = mk(1.0, true, 1, false, 1.f), es = mk(1.0, true, 1, true, 1.f);
    Rendered ra = renderPart(*ea, 1.0, 5.0, 1.0), rs = renderPart(*es, 1.0, 5.0, 1.0);
    expect(ra.pcm.size() == rs.pcm.size(), "audible and silent count-in give files of equal length", (double)ra.pcm.size() / 2 / SR);
    expect(ra.pcm.size() / 2 > (size_t)(5.9 * SR), "count-in (1 bar = 2 s) is added before the 4 s part");
    expect(rms(rs.pcm, 0.0, 1.9) < 1e-6, "silent count-in is silence");
    expect(rms(ra.pcm, 0.0, 1.9) > 1e-3, "audible count-in has clicks");
    // click-only pass: song volume 0 -> only clicks, after the count-in too
    auto ec = mk(1.0, true, 1, false, 0.f);
    Rendered rc = renderPart(*ec, 1.0, 5.0, 1.0);
    expect(rc.pcm.size() == ra.pcm.size(), "click file has the same length as the others");
    expect(rms(rc.pcm, 2.0, 5.9) > 1e-3 && rms(rc.pcm, 2.0, 5.9) < 0.05, "click file: clicks only, no song");
    // whole song without a stop point still ends by itself
    auto ew = mk(1.0, false, 0, false, 1.f);
    Rendered rw = renderPart(*ew, 0.0, -1.0, 1.0);
    expect(rw.stopped && std::fabs((double)rw.pcm.size() / 2 / SR - SECONDS) < 0.003, "whole song: exact length", (double)rw.pcm.size() / 2 / SR);
    printf(failures ? "\nFAILURES: %d\n" : "\nALL PASSED\n", failures);
    return failures ? 1 : 0;
}
