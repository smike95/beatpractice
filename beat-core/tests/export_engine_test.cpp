// Tests of what the export relies on in PlaybackEngine (no audio device, no model):
// stop-at (sample-exact end of an exported part), lastRenderFrames (no trailing silence), silent count-in (parts of equal length).
#include "../src/playback_engine.h"
#include <algorithm>
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
    // quiet bars: 1 bar of clicks, 1 bar silent (bars are 2 s long, the first bar starts at 1.0 s)
    {
        auto eq = mk(1.0, true, 0, false, 0.f);
        MetronomeSettings ms; ms.enabled = true; ms.volume = 0.8f; ms.quietEnabled = true; ms.clickBars = 1; ms.quietBars = 1; eq->setMetronome(ms);
        Rendered rq = renderPart(*eq, 1.0, 9.0, 1.0);          // part starts at bar 1
        expect(rms(rq.pcm, 0.0, 2.0) > 1e-3, "quiet bars: bar 1 clicks");
        expect(rms(rq.pcm, 2.05, 3.95) < 1e-6, "quiet bars: bar 2 silent");
        expect(rms(rq.pcm, 4.0, 6.0) > 1e-3, "quiet bars: bar 3 clicks");
        expect(rms(rq.pcm, 6.05, 7.95) < 1e-6, "quiet bars: bar 4 silent");
        // with a loop the pattern restarts at A on every pass; loop = bars 3..6 (5.0 .. 13.0 s), pattern click, quiet, click, quiet
        auto el = mk(1.0, true, 0, false, 0.f);
        el->setMetronome(ms); el->setLoop(5.0, 13.0); el->seekSeconds(5.0); el->play();
        std::vector<float> all; std::vector<float> blk(2 * 4410);
        for (int i = 0; i < 170; ++i) { el->render(blk.data(), 4410); all.insert(all.end(), blk.begin(), blk.end()); }   // 17 s
        expect(rms(all, 0.0, 2.0) > 1e-3 && rms(all, 2.05, 3.95) < 1e-6 && rms(all, 4.0, 6.0) > 1e-3 && rms(all, 6.05, 7.9) < 1e-6, "loop pass 1: click, quiet, click, quiet");
        expect(rms(all, 8.0, 10.0) > 1e-3 && rms(all, 10.05, 11.95) < 1e-6 && rms(all, 12.0, 14.0) > 1e-3, "loop pass 2 starts again with clicks", rms(all, 8.0, 10.0));
        expect(el->loopWraps() == 2, "loop wraps are counted", (double)el->loopWraps());
    }
    // 16-bit storage sounds like float storage: whole song and stems, at speed 1 (bypass) and at other speeds (stretcher)
    {
        const long F = (long)SR * SECONDS;
        auto to16 = [&](const std::vector<float>& f) { std::vector<int16_t> v((size_t)2 * F); for (long i = 0; i < F; ++i) { v[(size_t)i] = (int16_t)std::lrintf(f[2*i] * 32768.f); v[(size_t)F + i] = (int16_t)std::lrintf(f[2*i+1] * 32768.f); } return v; };
        for (double speed : {1.0, 0.8}) {
            auto mkE = [&](bool pcm16) {
                auto e = std::make_unique<PlaybackEngine>(SR);
                std::vector<float> s1 = tone(0.2), s2(2 * (size_t)F);
                for (long i = 0; i < F; ++i) { float x = (float)(0.15 * std::sin(2 * M_PI * 660.0 * i / SR)); s2[2*i] = x; s2[2*i+1] = x; }
                if (pcm16) { e->setSongPcm16(to16(s1), F); e->setStemsPcm16({to16(s1), to16(s2)}); }
                else { e->setSong(s1); e->setStems({s1, s2}); }
                e->setBeatMap(makeMap()); e->setSpeed(speed); e->setStemsEnabled(true); e->setStemGain(0, 1.f); e->setStemGain(1, 0.5f);
                e->seekSeconds(2.0); e->play(); return e;
            };
            auto ef = mkE(false), ei = mkE(true);
            std::vector<float> a, b, blk(2 * 4410);
            for (int i = 0; i < 100; ++i) { ef->render(blk.data(), 4410); a.insert(a.end(), blk.begin(), blk.end()); ei->render(blk.data(), 4410); b.insert(b.end(), blk.begin(), blk.end()); }
            double maxd = 0; for (size_t i = 0; i < a.size(); ++i) maxd = std::max(maxd, (double)std::fabs(a[i] - b[i]));
            char nm[96]; snprintf(nm, sizeof nm, "16-bit stems/song equal float ones (speed %.1f): max difference", speed);
            expect(maxd < 0.0005 && rms(a, 0.5, 9.0) > 0.05, nm, maxd);
            expect(ef->peaks().size() == ei->peaks().size(), "  waveform overview has the same size");
        }
    }
    // a click-only metronome (no song): even clicks, accent on the first beat of each bar, own volume and sound
    {
        PlaybackEngine e(SR);                                    // no song at all
        e.setStandaloneClick(true, 120.0, 3, true, 0.8f, 0);
        std::vector<float> all, blk(2 * 4410);
        for (int i = 0; i < 100; ++i) { e.render(blk.data(), 4410); all.insert(all.end(), blk.begin(), blk.end()); }   // 10 s
        std::vector<long> on; for (long i = 0; i + 200 < (long)all.size() / 2; ++i) if (std::fabs(all[2*i]) > 0.02f && (on.empty() || i - on.back() > SR / 4)) on.push_back(i);
        expect(on.size() == 20, "click-only metronome: 120 BPM for 10 s gives 20 clicks", (double)on.size());
        bool even = on.size() > 2; for (size_t k = 1; k < on.size(); ++k) if (std::labs((on[k] - on[k-1]) - SR / 2) > 2) even = false;
        expect(even, "  the clicks are evenly spaced (to 2 samples)");
        auto peak = [&](long from) { float m = 0; for (long i = from; i < from + 2000; ++i) m = std::max(m, std::fabs(all[2*i])); return m; };
        expect(peak(on[0]) > peak(on[1]) * 1.01f && std::fabs(peak(on[0]) - peak(on[3])) < 1e-4, "  the first beat of a bar (3 beats) has the accent");
        expect(e.standaloneBeat() >= 0, "  the beat position is reported");
        e.setStandaloneClick(false, 120.0, 3, true, 0.8f, 0);
        e.render(blk.data(), 4410); e.render(blk.data(), 4410);
        double sum = 0; for (float v : blk) sum += std::fabs(v);
        expect(sum < 1e-6 && e.standaloneBeat() == -1, "  switched off: silence");
    }
    printf(failures ? "\nFAILURES: %d\n" : "\nALL PASSED\n", failures);
    return failures ? 1 : 0;
}
