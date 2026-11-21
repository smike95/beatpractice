// Half-beat metronome clicks: an extra, quieter click exactly halfway between beats; off by default (no audio device needed).
#include "../src/playback_engine.h"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <vector>
using namespace beatcore;
static const int SR = 44100;
static int failures = 0;
static void expect(bool ok, const char* what) { printf("%-70s %s\n", what, ok ? "PASS" : "FAIL"); if (!ok) ++failures; }

static BeatMap makeMap(double first = 1.0, double period = 0.5, int n = 40) {
    BeatMap m; m.durationSec = 30;
    for (int k = 0; k < n; ++k) { m.beats.push_back(first + period * k); m.barLength.push_back(4); m.posInBar.push_back(k % 4 + 1); }
    m.playFirstBeat = 0; m.playLastBeat = (int)m.beats.size() - 1; return m;
}
static double peakIn(const std::vector<float>& o, double t0, double t1) {
    double p = 0; for (long i = (long)(t0 * SR); i < (long)(t1 * SR) && i < (long)o.size() / 2; ++i) p = std::max(p, (double)std::fabs(o[2*i])); return p;
}
// renders `seconds` of the metronome over a silent song, starting at `from`; sub = 0/1
static std::vector<float> render(int sub, double from, double seconds, double speed = 1.0, bool loop = false) {
    std::vector<float> silent(2 * SR * 30, 0.f);
    PlaybackEngine e(SR); e.setSong(silent); e.setBeatMap(makeMap()); e.setClickSound(1);
    MetronomeSettings ms; ms.enabled = true; ms.volume = 1.0f; ms.accentFirstBeat = false; e.setMetronome(ms);
    e.setClickSubdivision(sub); e.setSpeed(speed);
    e.seekSeconds(from); e.play();
    std::vector<float> out, b(2 * 441);
    for (int n = 0; n < (int)(seconds * 100); ++n) { e.render(b.data(), 441); out.insert(out.end(), b.begin(), b.end()); }
    (void)loop; return out;
}

int main() {
    // beats at 1.0, 1.5, 2.0 ... ; half-beats at 1.25, 1.75 ...; the render starts at 0.9
    { auto off = render(0, 0.9, 4.0);
      bool none = true; for (int k = 0; k < 5; ++k) if (peakIn(off, 1.25 + 0.5 * k - 0.9, 1.25 + 0.5 * k - 0.9 + 0.03) > 0.001) none = false;
      expect(none, "default (off): silent between the beats"); }
    { auto on = render(1, 0.9, 4.0);
      bool beats = true, mids = true; double pb = 0, pm = 0;
      for (int k = 0; k < 5; ++k) { double tb = 1.0 + 0.5 * k - 0.9, tm = 1.25 + 0.5 * k - 0.9;
          double a = peakIn(on, tb, tb + 0.03), m = peakIn(on, tm, tm + 0.03); pb = std::max(pb, a); pm = std::max(pm, m);
          if (a < 0.02) beats = false; if (m < 0.01) mids = false; }
      expect(beats, "on: every beat still sounds");
      expect(mids, "on: a click halfway between every two beats");
      expect(pm < pb * 0.8, "on: the half-beat click is quieter than the beat"); }
    // at half speed everything is twice as far apart: half-beats at (1.25 - 0.9) * 2
    { auto on = render(1, 0.9, 6.0, 0.5);
      bool mids = true; for (int k = 0; k < 4; ++k) { double tm = (1.25 + 0.5 * k - 0.9) / 0.5; if (peakIn(on, tm, tm + 0.04) < 0.01) mids = false; }
      expect(mids, "on, half speed: the half-beat clicks stay halfway"); }
    // starting in the middle of a beat: no double click at the start, the next half-beat is not skipped
    { auto on = render(1, 1.3, 1.5);   // next half-beat at 1.75, beat at 1.5, 2.0
      expect(peakIn(on, 0.0, 0.1) < 0.001, "on, start after a half-beat: nothing before the next click");
      expect(peakIn(on, 1.75 - 1.3, 1.75 - 1.3 + 0.03) > 0.01, "on, start after a half-beat: the next half-beat sounds"); }
    printf("\n%s\n", failures ? "FAILED" : "ALL PASSED");
    return failures ? 1 : 0;
}
