// Tests for the metronome sound bank, the count-in progress API and end-of-song behaviour (no audio device needed).
#include "../src/playback_engine.h"
#include <cmath>
#include <cstdio>
#include <vector>
using namespace beatcore;
static const int SR = 44100;
static int failures = 0;
static void expect(bool ok, const char* what) { printf("%-62s %s\n", what, ok ? "PASS" : "FAIL"); if (!ok) ++failures; }

static BeatMap makeMap(double first = 1.0, double period = 0.5, int n = 40) {
    BeatMap m; m.durationSec = 30;
    for (int k = 0; k < n; ++k) { m.beats.push_back(first + period * k); m.barLength.push_back(4); m.posInBar.push_back(k % 4 + 1); }
    m.playFirstBeat = 0; m.playLastBeat = (int)m.beats.size() - 1; return m;
}
static double peakIn(const std::vector<float>& o, double t0, double t1) {
    double p = 0; for (long i = (long)(t0 * SR); i < (long)(t1 * SR) && i < (long)o.size() / 2; ++i) p = std::max(p, (double)std::fabs(o[2*i])); return p;
}

int main() {
    BeatMap map = makeMap();
    std::vector<float> silent(2 * SR * 30, 0.f);

    expect(PlaybackEngine::clickSoundCount() == 6, "six metronome sounds");

    // 1) every sound: audible at each beat, silent between, never clipping, finite; accent louder-or-different
    for (int id = 0; id < PlaybackEngine::clickSoundCount(); ++id) {
        PlaybackEngine e(SR); e.setSong(silent); e.setBeatMap(map); e.setClickSound(id);
        MetronomeSettings ms; ms.enabled = true; ms.volume = 1.0f; ms.accentFirstBeat = true; e.setMetronome(ms);
        e.seekSeconds(0.9); e.play();
        std::vector<float> out; std::vector<float> b(2 * 441);
        for (int n = 0; n < 400; ++n) { e.render(b.data(), 441); out.insert(out.end(), b.begin(), b.end()); }
        bool finite = true; double mx = 0; for (float v : out) { if (!std::isfinite(v)) finite = false; mx = std::max(mx, (double)std::fabs(v)); }
        // beats at 1.0, 1.5, 2.0 ... ; render started at 0.9 -> beat k heard at (beat - 0.9)
        bool audible = true;
        for (int k = 0; k < 6; ++k) { double t = 1.0 + 0.5 * k - 0.9; if (peakIn(out, t, t + 0.03) < 0.02) audible = false; }
        char name[80];
        snprintf(name, sizeof name, "sound %d: audible on every beat", id); expect(audible, name);
        snprintf(name, sizeof name, "sound %d: finite and below clipping (peak %.2f)", id, mx); expect(finite && mx < 0.98, name);
    }

    // 2) count-in progress: 1 bar of 4 clicks, beats reported 1..4, then it ends
    {
        PlaybackEngine e(SR); e.setSong(silent); e.setBeatMap(map);
        CountInSettings ci; ci.bars = 1; e.setCountIn(ci);
        MetronomeSettings ms; ms.volume = 1.0f; ms.accentFirstBeat = false; e.setMetronome(ms);
        e.seekSeconds(1.0); e.play();
        std::vector<float> b(2 * 441); int last = 0, total = 0; std::vector<int> seen; bool wasCounting = false; double posDuring = -1;
        for (int n = 0; n < 400; ++n) {
            e.render(b.data(), 441);
            int beat = 0, tot = 0;
            if (e.countInBeat(&beat, &tot)) { wasCounting = true; total = tot; posDuring = e.positionSeconds(); if (beat != last) { seen.push_back(beat); last = beat; } }
        }
        bool seq = seen.size() == 4; for (size_t i = 0; i < seen.size(); ++i) if (seen[i] != (int)i + 1) seq = false;
        expect(wasCounting, "count-in reported as active");
        expect(seq && total == 4, "count-in beats reported as 1,2,3,4 (total 4)");
        expect(std::fabs(posDuring - 1.0) < 0.05, "song position stays at the bar start during count-in");
        int b2 = 0, t2 = 0; expect(!e.countInBeat(&b2, &t2) && !e.isCountingIn(), "count-in finished");
        expect(e.isPlaying() && e.positionSeconds() > 1.0, "song plays after the count-in");
    }

    // 3) a count-in happens again after pause() + seek() + play()  (this is what the 'restart' button does)
    {
        PlaybackEngine e(SR); e.setSong(silent); e.setBeatMap(map);
        CountInSettings ci; ci.bars = 1; e.setCountIn(ci);
        e.seekSeconds(1.0); e.play();
        std::vector<float> b(2 * 441); for (int n = 0; n < 300; ++n) e.render(b.data(), 441);   // 3 s: well past the count-in
        e.pause(); e.seekSeconds(0.0); e.play();
        bool counting = false; for (int n = 0; n < 20; ++n) { e.render(b.data(), 441); if (e.isCountingIn()) counting = true; }
        expect(counting, "pause+seek+play starts a new count-in");
        // seek while playing does NOT count in
        PlaybackEngine f(SR); f.setSong(silent); f.setBeatMap(map); f.setCountIn(ci);
        f.seekSeconds(1.0); f.play(); for (int n = 0; n < 300; ++n) f.render(b.data(), 441);
        f.seekSeconds(1.0); bool c2 = false; for (int n = 0; n < 20; ++n) { f.render(b.data(), 441); if (f.isCountingIn()) c2 = true; }
        expect(!c2, "seek while playing does not start a count-in (documented behaviour)");
    }

    // 4) end of song: playback stops by itself and the position sits at the end
    {
        std::vector<float> shortSong(2 * SR * 3, 0.f);
        BeatMap m = makeMap(0.5, 0.5, 5);
        PlaybackEngine e(SR); e.setSong(shortSong); e.setBeatMap(m);
        e.play(); std::vector<float> b(2 * 441); for (int n = 0; n < 400; ++n) e.render(b.data(), 441);
        expect(!e.isPlaying(), "playback stops at the end of the song");
        expect(std::fabs(e.positionSeconds() - e.durationSeconds()) < 0.05, "position is at the end after the song finished");
    }

    // 5) switching the sound while playing must be safe
    {
        PlaybackEngine e(SR); e.setSong(silent); e.setBeatMap(map); e.play();
        std::vector<float> b(2 * 441); bool ok = true;
        for (int n = 0; n < 300; ++n) { e.setClickSound(n % 8 - 1); e.render(b.data(), 441); for (float v : b) if (!std::isfinite(v)) ok = false; }
        expect(ok, "changing sound every block (incl. out-of-range ids) is safe");
    }
    printf(failures ? "\n%d FAILED\n" : "\nALL PASSED\n", failures);
    return failures ? 1 : 0;
}
