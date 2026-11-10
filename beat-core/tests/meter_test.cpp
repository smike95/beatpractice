// Tests of bar-structure and tempo recognition on saved network output (tests/data/meter/*.act), made from synthetic songs
// with known structure. No network and no audio needed.   ./meter_test tests/data/meter
#include "../src/beat_analyzer.h"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <map>
#include <string>
using namespace beatcore;
static int failures = 0;
static void ok(bool c, const std::string& what) { printf("%-72s %s\n", what.c_str(), c ? "PASS" : "FAIL"); if (!c) ++failures; }

static std::map<int, int> barLengths(const BeatMap& m) {
    std::map<int, int> c;
    for (size_t i = 0; i < m.beats.size(); ++i) if (m.posInBar[i] == 1) c[m.barLength[i]]++;
    return c;
}
static std::string show(const std::map<int, int>& c) { std::string s; for (auto& kv : c) s += std::to_string(kv.first) + "x" + std::to_string(kv.second) + " "; return s; }
static BeatMap decode(const std::string& dir, const char* name, int mode) {
    Activations a; if (!a.load(dir + "/" + name + ".act")) { printf("cannot read %s\n", name); ++failures; return {}; }
    return decodeBeatMap(a, AnalyzerConfig::forMeterMode(mode));
}
static int total(const std::map<int, int>& c) { int t = 0; for (auto& kv : c) t += kv.second; return t; }
static int of(const std::map<int, int>& c, int len) { auto it = c.find(len); return it == c.end() ? 0 : it->second; }

int main(int argc, char** argv) {
    const std::string dir = argc > 1 ? argv[1] : "tests/data/meter";

    // steady 4/4 stays 4/4 in every mode
    for (int mode = 0; mode < 3; ++mode) {
        auto c = barLengths(decode(dir, "A_44_110", mode));
        ok(of(c, 4) == total(c) && total(c) > 25, "steady 4/4, mode " + std::to_string(mode) + ": all bars have 4 beats  (" + show(c) + ")");
    }
    // 7 beats per bar (automatic and sensitive): recognised as 7 instead of being forced into 4s
    for (int mode = 0; mode < 2; ++mode) {
        auto c = barLengths(decode(dir, "C_74_130", mode));
        ok(of(c, 7) >= total(c) * 8 / 10, "7/4 song, mode " + std::to_string(mode) + ": bars of 7 beats  (" + show(c) + ")");
        auto g = barLengths(decode(dir, "G_78_2_2_3", mode));
        ok(of(g, 7) >= total(g) * 8 / 10, "7-pulse song (2+2+3), mode " + std::to_string(mode) + "  (" + show(g) + ")");
    }
    // strict: only 3 and 4 beats
    { auto c = barLengths(decode(dir, "C_74_130", 2)); ok(of(c, 3) + of(c, 4) == total(c), "strict mode never uses other lengths  (" + show(c) + ")"); }
    // 4,4,3 pattern: mostly fours with a good share of threes
    { auto c = barLengths(decode(dir, "D_mixed_44_44_34", 0)); ok(of(c, 4) > of(c, 3) && of(c, 3) >= 6 && of(c, 3) + of(c, 4) >= total(c) * 8 / 10, "4+4+3 pattern keeps its threes (auto)  (" + show(c) + ")"); }
    // tempo change 100 -> 135 BPM at 35 s: expected about 58 + 79 = 137 beats; the old decoder produced 165
    {
        BeatMap m = decode(dir, "E_44_tempo_step", 0);
        ok(m.beats.size() >= 130 && m.beats.size() <= 145, "tempo step 100 -> 135 BPM: beat count about right  (" + std::to_string(m.beats.size()) + ", expected ~137)");
        double early = 0, late = 0; int ne = 0, nl = 0;
        for (size_t i = 0; i + 1 < m.beats.size(); ++i) {
            double bpm = 60.0 / (m.beats[i + 1] - m.beats[i]);
            if (m.beats[i] < 30) { early += bpm; ++ne; } else if (m.beats[i] > 40) { late += bpm; ++nl; }
        }
        early /= std::max(1, ne); late /= std::max(1, nl);
        ok(std::fabs(early - 100) < 8, "before the change the beats follow ~100 BPM  (" + std::to_string((int)early) + ")");
        ok(std::fabs(late - 135) < 8, "after the change the beats follow ~135 BPM  (" + std::to_string((int)late) + ")");
    }
    // steady tempo is untouched by local tempo tracking
    { BeatMap m = decode(dir, "A_44_110", 0); ok(std::fabs(m.bpm - 110.0) < 0.5, "steady song keeps its tempo (" + std::to_string(m.bpm) + ")"); }
    // The network found TWICE the real tempo (a 105 BPM 4/4 song reported as 210): mode +10 keeps every second beat
    {
        const double realBpm = 105.0, eighth = 60.0 / realBpm / 2.0;                 // peaks of the network every half beat
        const int n = 3600;                                                          // 72 s
        Activations a; a.durationSec = n / kFrameRate; a.beat.assign(n, -6.f); a.downbeat.assign(n, -6.f);
        for (int k = 0;; ++k) {
            int f = (int)std::lround((1.0 + k * eighth) * kFrameRate); if (f >= n - 2) break;
            for (int d = -1; d <= 1; ++d) a.beat[f + d] = (d == 0 ? 6.f : 2.f);       // every half beat
            if (k % 8 == 0) for (int d = -1; d <= 1; ++d) a.downbeat[f + d] = (d == 0 ? 6.f : 2.f);   // a real bar = 8 half beats
        }
        BeatMap plain = decodeBeatMap(a, AnalyzerConfig::forMeterMode(0));
        BeatMap half = decodeBeatMap(a, AnalyzerConfig::forMeterMode(10));
        auto c = barLengths(half);
        ok(plain.bpm > 190, "double-tempo song without correction: ~210 BPM  (" + std::to_string((int)plain.bpm) + ")");
        ok(std::fabs(half.bpm - realBpm) < 1.5, "double-tempo song with mode 10: ~105 BPM  (" + std::to_string(half.bpm) + ")");
        ok(of(c, 4) >= total(c) * 9 / 10 && total(c) > 25, "double-tempo song with mode 10: bars of 4 beats  (" + show(c) + ")");
        ok(half.beats.size() * 2 + 4 >= plain.beats.size() && half.beats.size() * 2 <= plain.beats.size() + 4, "mode 10 keeps half of the beats");
        ok(AnalyzerConfig::forMeterMode(12).barLengths.size() == 2 && AnalyzerConfig::forMeterMode(12).tempoDivide == 2, "mode 12 = strict presets + divide by two");
        // every kept beat is a bar start of the original grid (the phase is chosen by the downbeats)
        int onDown = 0, starts = 0;
        for (size_t i = 0; i < half.beats.size(); ++i) if (half.posInBar[i] == 1) {
            ++starts; int f = (int)std::lround(half.beats[i] * kFrameRate);
            float mx = -9; for (int d = -2; d <= 2; ++d) mx = std::max(mx, a.downbeat[std::min(n - 1, std::max(0, f + d))]);
            if (mx > 3) ++onDown;
        }
        ok(starts > 20 && onDown * 10 >= starts * 9, "bar starts of mode 10 sit on the network's downbeats  (" + std::to_string(onDown) + "/" + std::to_string(starts) + ")");
    }
    // "The Beautiful People" (Marilyn Manson, ~144 BPM): the network is unsure for the first ~25 s (a drum roll in 16ths, its
    // autocorrelation peaks at 4 x 0.14 s = 0.56 s), then it is rock steady. The intro must keep the song's tempo and 4/4 bars,
    // and the metronome must start where the drums enter (4.6 s), not 25 s later.
    {
        BeatMap m = decode(dir, "H_beautiful_people", 0);
        ok(std::fabs(m.bpm - 144.0) < 1.5, "weak intro: song tempo ~144 BPM  (" + std::to_string(m.bpm) + ")");
        std::vector<double> ibi;
        for (size_t i = 0; i + 1 < m.beats.size(); ++i) if (m.beats[i] >= 6.0 && m.beats[i + 1] < 25.0) ibi.push_back(m.beats[i + 1] - m.beats[i]);
        std::sort(ibi.begin(), ibi.end());
        double med = ibi.empty() ? 0 : ibi[ibi.size() / 2];
        ok(med > 0.40 && med < 0.44, "weak intro: beats keep the song's spacing, not the roll's  (median " + std::to_string(med) + " s)");
        auto c = barLengths(m);
        ok(of(c, 4) >= total(c) * 95 / 100, "weak intro: bars of 4 beats  (" + show(c) + ")");
        double startSec = m.playFirstBeat >= 0 ? m.beats[m.playFirstBeat] : 999;
        ok(startSec > 3.0 && startSec < 6.0, "weak intro: the metronome starts where the drums enter  (" + std::to_string(startSec) + " s)");
        BeatMap strict = decode(dir, "H_beautiful_people", 2);
        auto cs = barLengths(strict);
        ok(of(cs, 4) == total(cs), "mode 2 (coarse): every bar has 4 beats  (" + show(cs) + ")");
        BeatMap half = decode(dir, "H_beautiful_people", 10);
        ok(std::fabs(half.bpm - 72.0) < 1.0, "mode 10 halves it: ~72 BPM  (" + std::to_string(half.bpm) + ")");
    }
    printf(failures ? "\n%d FAILED\n" : "\nALL PASSED\n", failures);
    return failures ? 1 : 0;
}
