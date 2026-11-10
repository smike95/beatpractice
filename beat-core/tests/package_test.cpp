// BeatPack: write -> read gives the same sound and beat map; damaged and cut files are refused; the file is much smaller than raw PCM.
#include "../src/package.h"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <fstream>
using namespace beatcore;
static int failures = 0;
static void expect(bool ok, const char* what, double v = -1) {
    if (v >= 0) printf("%-72s %.3f  %s\n", what, v, ok ? "PASS" : "FAIL"); else printf("%-72s %s\n", what, ok ? "PASS" : "FAIL");
    if (!ok) ++failures;
}
static std::vector<int16_t> synth(long frames, double f0, double amp, unsigned seed) {      // a tone with a little noise: planar L|R
    std::vector<int16_t> v((size_t)2 * frames); unsigned s = seed;
    for (long i = 0; i < frames; ++i) {
        s = s * 1664525u + 1013904223u; const double noise = ((s >> 16) / 65535.0 - 0.5) * 0.02;
        v[i] = (int16_t)((amp * std::sin(2 * M_PI * f0 * i / 44100.0) + noise) * 32767);
        v[frames + i] = (int16_t)((amp * std::sin(2 * M_PI * f0 * 1.01 * i / 44100.0) + noise) * 32767);
    }
    return v;
}
static std::vector<char> slurp(const std::string& p) { std::ifstream f(p, std::ios::binary); return std::vector<char>((std::istreambuf_iterator<char>(f)), {}); }
static void spit(const std::string& p, const std::vector<char>& d) { std::ofstream f(p, std::ios::binary); f.write(d.data(), (std::streamsize)d.size()); }

int main() {
    const long frames = 44100L * 6;
    Package p; p.frames = frames; p.sampleRate = 44100;
    p.meta.title = "Тестова пісня"; p.meta.artist = "Artist"; p.meta.ownerId = "owner-123"; p.meta.createdBy = "BeatPractice test"; p.meta.modelName = "htdemucs_6s";
    p.map.durationSec = 6; p.map.bpm = 120; p.map.periodSec = 0.5;
    for (int k = 0; k < 12; ++k) { p.map.beats.push_back(0.25 + 0.5 * k); p.map.barLength.push_back(4); p.map.posInBar.push_back(k % 4 + 1); }
    p.map.playFirstBeat = 0; p.map.playLastBeat = 11;
    p.acts.beat.assign(300, 0.5f); p.acts.downbeat.assign(300, -1.25f); p.acts.durationSec = 6;
    p.trackNames = {"drums", "vocals", "rest"};
    p.tracks = {synth(frames, 110, 0.4, 1), synth(frames, 440, 0.3, 2), synth(frames, 220, 0.3, 3)};
    p.mix = synth(frames, 330, 0.5, 4);
    p.loops = {{"Приспів", 1.0, 3.0}, {"", 3.0, 5.0}};
    p.cover = {1, 2, 3, 4, 5};

    const std::string path = "/tmp/test.beatpack";
    std::string err;
    expect(writePackage(path, p, &err), "write a pack");
    const double raw = (double)(4 * 2 * frames * 2), packed = (double)std::filesystem::file_size(path);
    expect(packed < raw * 0.75, "the pack is much smaller than raw PCM (ratio)", packed / raw);

    Package q; err.clear();
    expect(readPackage(path, q, &err), "read it back");
    expect(q.meta.title == p.meta.title && q.meta.artist == p.meta.artist && q.meta.ownerId == "owner-123" && q.meta.modelName == "htdemucs_6s", "meta (UTF-8 title, owner, model) is kept");
    expect(q.frames == frames && q.sampleRate == 44100, "frames and sample rate are kept");
    expect(q.map.beats == p.map.beats && q.map.posInBar == p.map.posInBar && q.map.barLength == p.map.barLength && q.map.playLastBeat == 11 && q.map.bpm == 120, "beat map is the same");
    expect(q.acts.beat == p.acts.beat && q.acts.downbeat == p.acts.downbeat, "network output is the same");
    expect(q.loops.size() == 2 && q.loops[0].name == "Приспів" && q.loops[1].end == 5.0, "loops and their names are kept");
    expect(q.trackNames == p.trackNames, "track names are kept");
    expect(q.tracks.size() == 3 && q.tracks[0] == p.tracks[0] && q.tracks[1] == p.tracks[1] && q.tracks[2] == p.tracks[2], "tracks are bit-exact (lossless)");
    expect(q.mix == p.mix, "the mix is bit-exact");
    expect(q.cover == p.cover, "cover is kept");

    Package info; expect(readPackage(path, info, &err, false) && info.tracks.empty() && info.map.beats.size() == 12 && info.trackNames.size() == 3, "info without decoding the sound");

    // merging parts into a group
    auto g = sumTracks({&p.tracks[0], &p.tracks[2]});
    bool sumOk = g.size() == p.tracks[0].size(); for (size_t i = 0; sumOk && i < g.size(); i += 997) sumOk = g[i] == (int16_t)std::max(-32768, std::min(32767, (int)p.tracks[0][i] + p.tracks[2][i]));
    expect(sumOk, "merged group = saturating sum of its parts");

    // damage: flip one byte in the middle of a track
    auto bytes = slurp(path);
    { auto b = bytes; b[b.size() / 2] ^= 0x5A; spit("/tmp/bad1.beatpack", b); Package r; err.clear(); expect(!readPackage("/tmp/bad1.beatpack", r, &err), "a flipped byte is detected", 0); printf("      (%s)\n", err.c_str()); }
    { auto b = bytes; b.resize(b.size() * 2 / 3); spit("/tmp/bad2.beatpack", b); Package r; err.clear(); expect(!readPackage("/tmp/bad2.beatpack", r, &err), "a cut-short file is refused", 0); printf("      (%s)\n", err.c_str()); }
    { std::vector<char> b = {'h', 'e', 'l', 'l', 'o', ' ', 'w', 'o', 'r', 'l', 'd', '!', '!'}; spit("/tmp/bad3.beatpack", b); Package r; err.clear(); expect(!readPackage("/tmp/bad3.beatpack", r, &err), "a foreign file is refused", 0); }
    { auto b = bytes; b[8] = 99; spit("/tmp/bad4.beatpack", b); Package r; err.clear(); expect(!readPackage("/tmp/bad4.beatpack", r, &err), "a newer format version is refused", 0); printf("      (%s)\n", err.c_str()); }
    { Package r; err.clear(); expect(!readPackage("/tmp/does-not-exist.beatpack", r, &err), "a missing file is refused", 0); }
    // random garbage must never crash the reader
    { unsigned s = 7; bool survived = true; for (int t = 0; t < 200; ++t) { auto b = bytes; for (int k = 0; k < 8; ++k) { s = s * 1664525u + 1013904223u; b[s % std::min<size_t>(b.size(), 600)] ^= (char)(s >> 20); }
        Package r; std::string e; readPackageFromMemory((const uint8_t*)b.data(), b.size(), r, &e); } expect(survived, "200 randomly damaged headers do not crash the reader"); }
    printf(failures ? "\nFAILURES: %d\n" : "\nALL PASSED\n", failures);
    return failures ? 1 : 0;
}
