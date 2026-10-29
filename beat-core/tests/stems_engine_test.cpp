// Tests of the multi-stem playback in PlaybackEngine (no audio device, no model): the "song" is three sine tones,
// the "stems" are those tones separately. Checks levels per stem, muting, live gain changes, speed changes
// (time stretching of every stem), switching on and off while playing, and swapping stems in while the audio thread runs.
#include "../src/playback_engine.h"
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <thread>
#include <vector>
using namespace beatcore;
static const int SR = 44100;
static int failures = 0;
static void expect(bool ok, const char* what, double v = -1) {
    if (v >= 0) printf("%-66s %.4f  %s\n", what, v, ok ? "PASS" : "FAIL"); else printf("%-66s %s\n", what, ok ? "PASS" : "FAIL");
    if (!ok) ++failures;
}
static const double F[3] = {220.0, 440.0, 880.0};
static const double A[3] = {0.20, 0.15, 0.10};
static const int SECONDS = 20;

static std::vector<float> tone(int k) {
    std::vector<float> v(2 * (size_t)SR * SECONDS);
    for (size_t i = 0; i < v.size() / 2; ++i) { float s = (float)(A[k] * std::sin(2 * M_PI * F[k] * (double)i / SR)); v[2*i] = s; v[2*i+1] = s; }
    return v;
}
static std::vector<float> mixOf() {
    std::vector<float> m(2 * (size_t)SR * SECONDS, 0.f);
    for (int k = 0; k < 3; ++k) { auto t = tone(k); for (size_t i = 0; i < m.size(); ++i) m[i] += t[i]; }
    return m;
}
static BeatMap makeMap() {
    BeatMap m; m.durationSec = SECONDS;
    for (int k = 0; k < 36; ++k) { m.beats.push_back(1.0 + 0.5 * k); m.barLength.push_back(4); m.posInBar.push_back(k % 4 + 1); }
    m.playFirstBeat = 0; m.playLastBeat = (int)m.beats.size() - 1; return m;
}
// amplitude of one frequency in the left channel of out[from..to) seconds (Goertzel)
static double amp(const std::vector<float>& out, double f, double from, double to) {
    long a = (long)(from * SR), b = std::min((long)(to * SR), (long)out.size() / 2);
    double w = 2 * M_PI * f / SR, c = 2 * std::cos(w), s1 = 0, s2 = 0;
    for (long i = a; i < b; ++i) { double s0 = out[2*i] + c * s1 - s2; s2 = s1; s1 = s0; }
    double re = s1 - s2 * std::cos(w), im = s2 * std::sin(w);
    return 2.0 * std::sqrt(re * re + im * im) / (double)(b - a);
}
static void run(PlaybackEngine& e, std::vector<float>& out, double seconds) {
    std::vector<float> b(2 * 441);
    for (long n = 0; n < (long)(seconds * 100); ++n) { e.render(b.data(), 441); out.insert(out.end(), b.begin(), b.end()); }
}
static void makeEngine(PlaybackEngine& e) {
    e.setSong(mixOf()); e.setBeatMap(makeMap());
    MetronomeSettings ms; ms.enabled = false; e.setMetronome(ms);
    e.setStems({tone(0), tone(1), tone(2)});
}

int main() {
    // 1) before stems are enabled the original mix is heard; stems do not change that
    {
        PlaybackEngine e(SR); makeEngine(e);
        expect(e.stemCount() == 3 && !e.stemsEnabled(), "3 stems loaded, not enabled yet");
        e.seekSeconds(2.0); e.play(); std::vector<float> o; run(e, o, 1.0);
        bool ok = true; for (int k = 0; k < 3; ++k) ok = ok && std::fabs(amp(o, F[k], 0.2, 0.9) - A[k]) < 0.01;
        expect(ok, "original mix: all three tones present at their levels");
    }
    for (double speed : {1.0, 0.8, 1.5}) {
        char nm[120];
        // 2) stems enabled with all gains 1 sounds like the original, at any speed
        PlaybackEngine e(SR); makeEngine(e); e.setSpeed(speed);
        e.seekSeconds(2.0); e.play(); e.setStemsEnabled(true);
        std::vector<float> o; run(e, o, 1.5);
        bool lv = true; double worst = 0;
        for (int k = 0; k < 3; ++k) { double d = std::fabs(amp(o, F[k], 0.5, 1.4) - A[k]); worst = std::max(worst, d); lv = lv && d < 0.012; }
        snprintf(nm, sizeof nm, "speed %.1f, stems on, gains 1: tone levels as in the mix (worst dev)", speed); expect(lv && e.stemsEnabled(), nm, worst);

        // 3) muting one stem removes exactly that tone
        e.setStemGain(1, 0.f);
        std::vector<float> o2; run(e, o2, 1.5);
        double a0 = amp(o2, F[0], 0.5, 1.4), a1 = amp(o2, F[1], 0.5, 1.4), a2 = amp(o2, F[2], 0.5, 1.4);
        snprintf(nm, sizeof nm, "speed %.1f: muting stem 2 silences 440 Hz only (440 Hz level)", speed);
        expect(a1 < 0.004 && std::fabs(a0 - A[0]) < 0.012 && std::fabs(a2 - A[2]) < 0.012, nm, a1);

        // 4) a live gain change: stem 3 at half level
        e.setStemGain(1, 1.f); e.setStemGain(2, 0.5f);
        std::vector<float> o3; run(e, o3, 1.5);
        double r = amp(o3, F[2], 0.6, 1.4) / A[2];
        snprintf(nm, sizeof nm, "speed %.1f: stem 3 at gain 0.5 plays at half level (ratio)", speed); expect(std::fabs(r - 0.5) < 0.06, nm, r);
    }

    // 5) switching stems on and off while playing: continuous position, no NaN, levels follow
    {
        PlaybackEngine e(SR); makeEngine(e); e.setSpeed(0.8);
        e.seekSeconds(1.0); e.play(); std::vector<float> b(2 * 441); bool finite = true; double last = e.positionSeconds(); bool mono = true;
        for (int n = 0; n < 600; ++n) {
            if (n == 100) e.setStemsEnabled(true);
            if (n == 250) { e.setStemGain(0, 0.f); }
            if (n == 400) e.setStemsEnabled(false);
            e.render(b.data(), 441);
            for (float v : b) if (!std::isfinite(v)) finite = false;
            double p = e.positionSeconds(); if (p < last - 1e-9) mono = false; last = p;
        }
        expect(finite && mono, "toggling stems and gains during playback: finite, position keeps moving forward");
    }

    // 6) loop + stems: the seam stays in time (stems follow the same loop as the song)
    {
        PlaybackEngine e(SR); makeEngine(e);
        e.setSpeed(0.8); e.seekSeconds(3.0); e.setLoop(3.0, 5.0); e.play(); e.setStemsEnabled(true);
        std::vector<float> b(2 * 441); bool ok = true; double lo = 1e9, hi = -1;
        for (int n = 0; n < 1500; ++n) { e.render(b.data(), 441); double p = e.positionSeconds(); lo = std::min(lo, p); hi = std::max(hi, p); for (float v : b) if (!std::isfinite(v)) ok = false; }
        expect(ok && lo >= 2.9 && hi <= 5.05, "looping 3.0-5.0 s with stems stays inside the loop", hi);
    }

    // 7) stems can be swapped in while the audio thread is running
    {
        PlaybackEngine e(SR); e.setSong(mixOf()); e.setBeatMap(makeMap());
        MetronomeSettings ms; ms.enabled = false; e.setMetronome(ms); e.play();
        std::atomic<bool> stop{false}, bad{false};
        std::thread audio([&] { std::vector<float> b(2 * 441); while (!stop) { e.render(b.data(), 441); for (float v : b) if (!std::isfinite(v)) bad = true; std::this_thread::sleep_for(std::chrono::microseconds(300)); } });
        for (int i = 0; i < 3; ++i) { e.setStems({tone(0), tone(1), tone(2)}); e.setStemsEnabled(i % 2 == 0); std::this_thread::sleep_for(std::chrono::milliseconds(30)); }
        stop = true; audio.join();
        expect(!bad && e.stemCount() == 3, "setStems while the audio thread is rendering is safe");
    }
    printf(failures ? "\n%d FAILED\n" : "\nALL PASSED\n", failures);
    return failures ? 1 : 0;
}
