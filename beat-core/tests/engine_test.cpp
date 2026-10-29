// Self-contained test of PlaybackEngine (no audio files needed): a silent "song" with a synthetic beat grid.
// Checks that every metronome click lands at the exact output sample where its original beat is heard,
// at several speeds, after a speed change in the middle, and after a seek.
#include "../src/playback_engine.h"
#include <cmath>
#include <cstdio>
#include <vector>
using namespace beatcore;
static const int SR = 44100;

static BeatMap makeMap() {
    BeatMap m; m.durationSec = 100;
    for (int k = 0; k < 190; ++k) { m.beats.push_back(1.0 + 0.5 * k); m.barLength.push_back(4); m.posInBar.push_back(k % 4 + 1); }
    m.playFirstBeat = 0; m.playLastBeat = (int)m.beats.size() - 1; return m;
}
static std::vector<double> detectClicks(const std::vector<float>& out) {   // seconds from start of `out`
    std::vector<double> c; long last = -1000000;
    for (size_t i = 0; i < out.size() / 2; ++i)
        if (std::fabs(out[2*i]) > 0.004f && (long)i - last > (long)(0.02 * SR)) { c.push_back((double)i / SR); last = (long)i; }
        else if (std::fabs(out[2*i]) > 0.004f) last = (long)i;
    return c;
}
static void run(PlaybackEngine& e, std::vector<float>& out, double seconds) {
    std::vector<float> b(2 * 441);
    for (long n = 0; n < (long)(seconds * 100); ++n) { e.render(b.data(), 441); out.insert(out.end(), b.begin(), b.end()); }
}
static int failures = 0;
static void check(const char* name, const std::vector<double>& got, const std::vector<double>& want) {
    double worst = 0; size_t n = std::min(got.size(), want.size());
    for (size_t i = 0; i < n; ++i) worst = std::max(worst, std::fabs(got[i] - want[i]));
    bool ok = got.size() == want.size() && worst < 0.00015;
    printf("%-34s clicks %zu/%zu  worst error %.3f ms  %s\n", name, got.size(), want.size(), worst * 1000, ok ? "PASS" : "FAIL");
    if (!ok) ++failures;
}

int main() {
    BeatMap map = makeMap();
    std::vector<float> silent(2 * SR * 100, 0.f);

    for (double sp : {0.5, 0.8, 1.0, 1.5}) {
        PlaybackEngine e(SR); e.setSong(silent); e.setBeatMap(map); e.setSpeed(sp); e.seekSeconds(10); e.play();
        std::vector<float> out; run(e, out, 20);
        std::vector<double> want;
        for (double b : map.beats) { double t = (b - 10) / sp; if (b >= 10 && t < 20) want.push_back(t); }
        char nm[64]; snprintf(nm, sizeof nm, "constant speed %.2f", sp); check(nm, detectClicks(out), want);
    }
    {   // speed change in the middle (reseeks the stretcher)
        PlaybackEngine e(SR); e.setSong(silent); e.setBeatMap(map); e.setSpeed(1.0); e.seekSeconds(10); e.play();
        std::vector<float> out; run(e, out, 6);
        double tChange = (double)out.size() / 2 / SR, srcChange = e.positionSeconds();
        e.setSpeed(0.5); run(e, out, 14);
        std::vector<double> want;
        for (double b : map.beats) {
            if (b >= srcChange) { double t = tChange + (b - srcChange) / 0.5; if (t < 20) want.push_back(t); }
            else if (b >= 10) want.push_back(b - 10);
        }
        check("speed change 1.0 -> 0.5", detectClicks(out), want);
    }
    {   // seek while playing
        PlaybackEngine e(SR); e.setSong(silent); e.setBeatMap(map); e.setSpeed(0.8); e.seekSeconds(5); e.play();
        std::vector<float> out; run(e, out, 6);
        double tSeek = (double)out.size() / 2 / SR; e.seekSeconds(40); run(e, out, 14);
        std::vector<double> want;
        for (double b : map.beats) {
            if (b >= 5 && (b - 5) / 0.8 < tSeek - 1e-9) want.push_back((b - 5) / 0.8);
        }
        for (double b : map.beats) { double t = tSeek + (b - 40) / 0.8; if (b >= 40 && t < 20) want.push_back(t); }
        check("seek 5 s -> 40 s while playing", detectClicks(out), want);
    }
    {   // waveform peaks: 100 per second, loudest sample of each 10 ms
        std::vector<float> song(2 * SR * 3, 0.f);               // 3 s of silence with a 0.5-amplitude click at 1.0 s and a 0.25 one at 2.505 s
        song[2 * SR] = 0.5f; song[2 * (long)(2.505 * SR) + 1] = -0.25f;
        PlaybackEngine e(SR); e.setSong(song); const auto& pk = e.peaks();
        bool ok = pk.size() == 300 && std::fabs(pk[100] - 0.5f) < 1e-6 && std::fabs(pk[250] - 0.25f) < 1e-6 && pk[50] == 0.f && pk[299] == 0.f;
        printf("%-34s %zu peaks, click values %.2f / %.2f  %s\n", "waveform peaks", pk.size(), pk.size() > 250 ? pk[100] : -1.f, pk.size() > 250 ? pk[250] : -1.f, ok ? "PASS" : "FAIL");
        if (!ok) ++failures;
    }
    // ---------------- loop and count-in ----------------
    for (double sp : {1.0, 0.8, 0.7}) {                       // A = beat 18 (10.0 s), B = beat 26 (14.0 s): 8 beats per lap
        PlaybackEngine e(SR); e.setSong(silent); e.setBeatMap(map); e.setSpeed(sp);
        e.setLoop(10.0, 14.0); e.seekSeconds(10.0); e.play();
        std::vector<float> out; run(e, out, 40);
        double lap = 4.0 / sp; std::vector<double> want;
        for (int L = 0; L * lap < 40; ++L) for (int k = 0; k < 8; ++k) { double t = L * lap + k * 0.5 / sp; if (t < 40) want.push_back(t); }
        char nm[64]; snprintf(nm, sizeof nm, "A-B loop 4 s, speed %.2f", sp); check(nm, detectClicks(out), want);
    }
    for (double sp : {1.0, 0.8}) {                            // count-in: 1 bar = 4 beats, song starts one beat after the last click
        PlaybackEngine e(SR); e.setSong(silent); e.setBeatMap(map); e.setSpeed(sp);
        CountInSettings ci; ci.bars = 1; e.setCountIn(ci); e.seekSeconds(9.0); e.play();    // 9.0 s = first beat of a bar
        std::vector<float> out; run(e, out, 10);
        double P = 0.5 / sp; std::vector<double> want;
        for (int k = 0; k < 4; ++k) want.push_back(k * P);                                  // count-in clicks
        for (int k = 0; k < 40; ++k) { double t = 4 * P + k * P; if (t < 10) want.push_back(t); }   // song clicks
        char nm[64]; snprintf(nm, sizeof nm, "count-in 1 bar, speed %.2f", sp); check(nm, detectClicks(out), want);
    }
    for (double sp : {1.0, 0.8}) {                            // song audio must start exactly when the count-in ends
        std::vector<float> song(2 * SR * 100, 0.f);
        for (int i = 0; i < (int)(0.004 * SR); ++i) { float v = 0.9f * std::sin(2 * M_PI * 3000.0 * i / SR) * (1.f - i / (0.004f * SR)); long k = (long)(9.0 * SR) + i; song[2*k] = v; song[2*k+1] = v; }
        PlaybackEngine e(SR); e.setSong(song); e.setBeatMap(map); e.setSpeed(sp);
        CountInSettings ci; ci.bars = 1; e.setCountIn(ci);
        MetronomeSettings ms; ms.volume = 0.f; e.setMetronome(ms);                         // silent clicks: only the song's burst is audible
        e.seekSeconds(9.0); e.play(); std::vector<float> out; run(e, out, 6);
        double expect = 4 * 0.5 / sp, best = 0; long bi = 0;
        for (size_t i = 0; i < out.size() / 2; ++i) if (std::fabs(out[2*i]) > best) { best = std::fabs(out[2*i]); bi = (long)i; }
        double got = (double)bi / SR; bool ok = std::fabs(got - expect) < 0.006 && best > 0.1;
        printf("%-34s song hit at %.4f s, expected %.4f s  %s\n", sp == 1.0 ? "count-in ends where song starts 1.0" : "count-in ends where song starts 0.8", got, expect, ok ? "PASS" : "FAIL");
        if (!ok) ++failures;
    }
    for (double sp : {1.0, 0.8}) {                            // count-in from the very start / mid-bar must lead into a bar start
        for (double startAt : {0.0, 9.75}) {                  // bar starts: 5.0 s is the first one in the metronome range, then every 2 s (9.0, 11.0 ...)
            std::vector<float> song(2 * SR * 100, 0.f);
            double burstAt = startAt == 0.0 ? 5.0 : 9.0;
            for (int i = 0; i < (int)(0.004 * SR); ++i) { float v = 0.9f * std::sin(2 * M_PI * 3000.0 * i / SR) * (1.f - i / (0.004f * SR)); long k = (long)(burstAt * SR) + i; song[2*k] = v; song[2*k+1] = v; }
            BeatMap m2 = map; m2.playFirstBeat = 8;           // beat 8 = 5.0 s = first beat of a bar
            PlaybackEngine e(SR); e.setSong(song); e.setBeatMap(m2); e.setSpeed(sp);
            CountInSettings ci; ci.bars = 1; e.setCountIn(ci);
            MetronomeSettings ms; ms.volume = 0.f; e.setMetronome(ms);
            e.seekSeconds(startAt); e.play(); std::vector<float> out; run(e, out, 6);
            double expect = 4 * 0.5 / sp, best = 0; long bi = 0;
            for (size_t i = 0; i < out.size() / 2; ++i) if (std::fabs(out[2*i]) > best) { best = std::fabs(out[2*i]); bi = (long)i; }
            double got = (double)bi / SR; bool ok = std::fabs(got - expect) < 0.006 && best > 0.1;
            char nm[80]; snprintf(nm, sizeof nm, "count-in from %.2f s, speed %.1f: bar at", startAt, sp);
            printf("%-46s %.4f s, expected %.4f s  %s\n", nm, got, expect, ok ? "PASS" : "FAIL");
            if (!ok) ++failures;
        }
    }
    {   // count-in before every loop repetition: marks at each lap start are 'burst' hits in the song
        for (double sp : {1.0, 0.8}) {
            std::vector<float> song(2 * SR * 100, 0.f);
            for (int i = 0; i < (int)(0.004 * SR); ++i) { float v = 0.9f * std::sin(2 * M_PI * 3000.0 * i / SR) * (1.f - i / (0.004f * SR)); long k = (long)(9.0 * SR) + i; song[2*k] = v; song[2*k+1] = v; }
            PlaybackEngine e(SR); e.setSong(song); e.setBeatMap(map); e.setSpeed(sp);
            CountInSettings ci; ci.bars = 1; ci.everyLoopRestart = true; e.setCountIn(ci);
            MetronomeSettings ms; ms.volume = 0.f; e.setMetronome(ms);
            e.setLoop(9.0, 13.0); e.seekSeconds(9.0); e.play(); std::vector<float> out; run(e, out, 40);
            double cyc = (4 * 0.5 + 4.0) / sp, cin = 4 * 0.5 / sp; int hits = 0; bool ok = true;
            for (int L = 0; L * cyc + cin < 38; ++L) {
                double t0 = L * cyc + cin; long a = (long)((t0 - 0.05) * SR), b = (long)((t0 + 0.05) * SR); double best = 0; long bi = a;
                for (long i = a; i < b; ++i) if (std::fabs(out[2*i]) > best) { best = std::fabs(out[2*i]); bi = i; }
                double got = (double)bi / SR; if (!(best > 0.1 && std::fabs(got - t0) < 0.006)) ok = false; ++hits;
            }
            printf("%-34s lap-start hits checked %d  %s\n", sp == 1.0 ? "count-in every loop, speed 1.0" : "count-in every loop, speed 0.8", hits, ok ? "PASS" : "FAIL");
            if (!ok) ++failures;
        }
    }
    printf(failures ? "ENGINE TEST FAILED\n" : "ENGINE TEST PASSED\n");
    return failures ? 1 : 0;
}
