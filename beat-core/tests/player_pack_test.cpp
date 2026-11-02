// Open a .beatpack with the Player (no models, no analysis), play it, export from it, and pack it again with merged parts.
#include "../src/player.h"
#include <chrono>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <thread>
using namespace beatcore;
static int failures = 0;
static void expect(bool ok, const char* what, double v = -1) {
    if (v >= 0) printf("%-74s %.3f  %s\n", what, v, ok ? "PASS" : "FAIL"); else printf("%-74s %s\n", what, ok ? "PASS" : "FAIL");
    if (!ok) ++failures;
}
static std::vector<int16_t> tone(long frames, double f0, double amp) {
    std::vector<int16_t> v((size_t)2 * frames);
    for (long i = 0; i < frames; ++i) { v[i] = v[frames + i] = (int16_t)(amp * std::sin(2 * M_PI * f0 * i / 44100.0) * 32767); }
    return v;
}
static bool waitFor(const std::function<bool()>& c, int ms = 20000) { for (int t = 0; t < ms / 20; ++t) { if (c()) return true; std::this_thread::sleep_for(std::chrono::milliseconds(20)); } return false; }

int main() {
    setenv("BEATCORE_NULL_AUDIO", "1", 1);
    const long frames = 44100L * 8;
    Package p; p.frames = frames; p.sampleRate = 44100;
    p.meta.title = "Song"; p.meta.ownerId = "owner-1"; p.meta.createdBy = "test";
    p.map.durationSec = 8; p.map.bpm = 120; p.map.periodSec = 0.5;
    for (int k = 0; k < 15; ++k) { p.map.beats.push_back(0.25 + 0.5 * k); p.map.barLength.push_back(4); p.map.posInBar.push_back(k % 4 + 1); }
    p.map.playFirstBeat = 0; p.map.playLastBeat = 14;
    p.trackNames = {"drums", "bass", "vocals"};
    p.tracks = {tone(frames, 100, 0.2), tone(frames, 200, 0.2), tone(frames, 400, 0.2)};
    p.loops = {{"Verse", 1.25, 3.25}};
    std::string err;
    expect(writePackage("/tmp/pp.beatpack", p, &err), "make a test pack (3 tracks, no mix)");

    std::filesystem::create_directories("/tmp/emptymodels"); std::filesystem::create_directories("/tmp/ppcache");
    Player pl("/tmp/emptymodels", "/tmp/ppcache");
    expect(pl.openFile("/tmp/pp.beatpack"), "open the pack with a Player that has no models");
    expect(waitFor([&] { return pl.state() == PlayerState::Ready || pl.state() == PlayerState::Error; }) && pl.state() == PlayerState::Ready, "it becomes Ready without analysis");
    if (pl.state() != PlayerState::Ready) { printf("error: %s\n", pl.error().c_str()); return 1; }
    expect(pl.beatMap() && pl.beatMap()->beats.size() == 15 && std::fabs(pl.songBpm() - 120) < 1, "beat map comes from the pack", pl.songBpm());
    expect(pl.isPack(), "the player knows it is a pack");
    expect(pl.stemsState() == StemState::Ready && pl.stemNames().size() == 3, "tracks are ready at once");
    expect(pl.stemsStart(), "asking for separation is harmless");
    const std::string info = pl.packInfoJson();
    expect(info.find("\"Verse\"") != std::string::npos && info.find("owner-1") != std::string::npos && info.find("\"isPack\":true") != std::string::npos, "pack info has loops and owner");
    pl.play(); std::this_thread::sleep_for(std::chrono::milliseconds(300));
    expect(pl.positionSeconds() > 0.1, "it plays", pl.positionSeconds()); pl.pause();

#ifdef BEATCORE_WITH_ANALYSIS
    // export as separate files from the pack, loop part only
    ExportRequest er; er.path = "/tmp/ppout.wav"; er.stems = {0, 2}; er.stemGains = {1.f, 1.f}; er.separate = true; er.rangeA = 1.25; er.rangeB = 3.25;
    expect(pl.exportStart(er), "export two tracks as separate files from the pack");
    expect(waitFor([&] { return pl.exportState() != 1; }) && pl.exportState() == 2, "export is done", pl.exportState());
    const auto sz = [](const char* f) { std::error_code ec; return (double)std::filesystem::file_size(f, ec); };
    expect(std::fabs(sz("/tmp/ppout - drums.wav") - (2.0 * 44100 * 4 + 44)) < 8 && sz("/tmp/ppout - vocals.wav") == sz("/tmp/ppout - drums.wav"), "files are 2 s long and equal in size", sz("/tmp/ppout - drums.wav"));

    // pack again: merge drums+bass into one group
    PackRequest pr; pr.path = "/tmp/pp2.beatpack"; pr.title = "Song 2"; pr.groups = {{0, 1}, {2}}; pr.groupNames = {"rhythm", ""}; pr.includeMix = false; pr.createdBy = "test"; pr.loops = {{"Verse", 1.25, 3.25}};
    expect(pl.packSave(pr), "pack it again with merged parts");
    expect(waitFor([&] { return pl.exportState() != 1; }) && pl.exportState() == 2, "packing is done", pl.exportState());
    Package q; err.clear();
    expect(readPackage("/tmp/pp2.beatpack", q, &err), "the new pack reads back");
    expect(q.trackNames == std::vector<std::string>({"rhythm", "vocals"}) && q.mix.empty(), "two tracks: rhythm (merged) and vocals; no mix");
    bool sumOk = q.tracks.size() == 2; for (size_t i = 0; sumOk && i < q.tracks[0].size(); i += 1009) sumOk = q.tracks[0][i] == (int16_t)(p.tracks[0][i] + p.tracks[1][i]);
    expect(sumOk, "the merged track is the sum of drums and bass");
    expect(q.tracks.size() == 2 && q.tracks[1] == p.tracks[2], "the single part is copied unchanged");
    expect(q.loops.size() == 1 && q.loops[0].name == "Verse" && q.meta.title == "Song 2", "loops and title are in the new pack");

    // all together: only the song
    PackRequest pr2; pr2.path = "/tmp/pp3.beatpack"; pr2.includeMix = true; pr2.createdBy = "test";
    expect(pl.packSave(pr2) && waitFor([&] { return pl.exportState() != 1; }) && pl.exportState() == 2, "pack with no parts (the song only)");
    Package q2; expect(readPackage("/tmp/pp3.beatpack", q2, &err) && q2.trackNames.empty() && q2.mix.size() == (size_t)2 * frames, "it has only the mix (sum of the tracks)");
#else
    // the small core (phones) does not keep the sound of a pack in a second copy: it cannot export it or pack it again, and says so
    ExportRequest er; er.path = "/tmp/ppout_lite.wav"; er.stems = {0}; er.stemGains = {1.f}; er.separate = true;
    expect(!pl.exportStart(er), "small core: export from a pack is refused (no extra copy kept)");
    PackRequest pr; pr.path = "/tmp/pp_lite.beatpack"; pr.groups = {{0}}; pr.createdBy = "test";
    expect(!pl.packSave(pr), "small core: packing again is refused");
    Package q; err.clear();
    expect(writePackage("/tmp/pp2.beatpack", p, &err), "(make the second test pack directly)");
    p.trackNames = {"drums", "bass", "vocals"};
#endif
    // a pack is opened again: the second one has no mix and 2 tracks
    #ifndef BEATCORE_WITH_ANALYSIS
    { Package two = p; two.tracks = {sumTracks({&p.tracks[0], &p.tracks[1]}), p.tracks[2]}; two.trackNames = {"rhythm", "vocals"}; writePackage("/tmp/pp2.beatpack", two, &err); }
#endif
    expect(pl.openFile("/tmp/pp2.beatpack") && waitFor([&] { return pl.state() == PlayerState::Ready; }) && pl.stemNames().size() == 2, "the merged pack opens too");
    expect(pl.stemsState() == StemState::Ready, "its parts are ready (16-bit tracks in the engine)");
    pl.play(); std::this_thread::sleep_for(std::chrono::milliseconds(300)); expect(pl.positionSeconds() > 0.1, "and it plays", pl.positionSeconds()); pl.pause();
    // an ordinary song cannot be analysed here (small core), the full core would need models
#ifndef BEATCORE_WITH_ANALYSIS
    expect(pl.openFile("/tmp/pp.wav") && waitFor([&] { return pl.state() == PlayerState::Error; }) && pl.error().find("beatpack") != std::string::npos, "small core: an ordinary song gives a clear message");
#endif
    // an ordinary file that is no pack and no audio fails cleanly
    expect(waitFor([&] { return pl.openFile("/tmp/pp.beatpack.nothere.beatpack"); }, 2000), "a missing pack file can be tried");
    expect(waitFor([&] { return pl.state() == PlayerState::Error; }), "a missing pack gives an error, not a crash");
    printf(failures ? "\nFAILURES: %d\n" : "\nALL PASSED\n", failures);
    return failures ? 1 : 0;
}
