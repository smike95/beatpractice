// The JSON bridge gives the same answers as the desktop app's Tauri commands (same names, arguments and result shapes).
#include "../src/bridge.h"
#include "../src/package.h"
#include "../third_party/json.hpp"
#include <chrono>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <thread>
using json = nlohmann::json;
static int failures = 0;
static void expect(bool ok, const char* what) { printf("%-76s %s\n", what, ok ? "PASS" : "FAIL"); if (!ok) ++failures; }
static std::vector<int16_t> tone(long frames, double f0, double amp) { std::vector<int16_t> v((size_t)2 * frames); for (long i = 0; i < frames; ++i) v[i] = v[frames + i] = (int16_t)(amp * std::sin(2 * M_PI * f0 * i / 44100.0) * 32767); return v; }

int main() {
    setenv("BEATCORE_NULL_AUDIO", "1", 1);
    using namespace beatcore;
    const long frames = 44100L * 8;
    Package p; p.frames = frames; p.sampleRate = 44100; p.meta.title = "Song"; p.meta.artist = "Me";
    p.map.durationSec = 8; p.map.bpm = 120; p.map.periodSec = 0.5;
    for (int k = 0; k < 15; ++k) { p.map.beats.push_back(0.25 + 0.5 * k); p.map.barLength.push_back(4); p.map.posInBar.push_back(k % 4 + 1); }
    p.map.playFirstBeat = 0; p.map.playLastBeat = 14;
    p.trackNames = {"drums", "vocals"}; p.tracks = {tone(frames, 100, 0.2), tone(frames, 400, 0.2)}; p.loops = {{"Verse", 1.25, 3.25}};
    std::string err; writePackage("/tmp/br.beatpack", p, &err);
    std::filesystem::create_directories("/tmp/brmodels"); std::filesystem::create_directories("/tmp/brcache");

    void* b = bc_bridge_new("/tmp/brmodels", "/tmp/brcache", 1);
    auto call = [&](const char* c, const json& a = json::object()) { return json::parse(bc_bridge_call(b, c, a.dump().c_str())); };

    json r = call("core_init");
    expect(r["ok"]["loaded"] == true && r["ok"]["dir"] == "/tmp/brmodels", "core_init: loaded, with the model folder");
    r = call("core_caps");
    expect(r["ok"]["packs"] == true && r["ok"]["stems"] == true && r["ok"]["clickSounds"].get<int>() >= 1 && r["ok"]["meterModes"] == true, "core_caps");
    expect(call("core_open_file", {{"path", "/tmp/br.beatpack"}})["ok"] == true, "core_open_file starts");
    json s;
    for (int i = 0; i < 400; ++i) { s = call("core_snapshot")["ok"]; if (s["state"] == 3 || s["state"] == 4) break; std::this_thread::sleep_for(std::chrono::milliseconds(20)); }
    expect(s["state"] == 3, "core_snapshot: Ready");
    const char* keys[] = {"state", "progress", "error", "fromCache", "duration", "songBpm", "playing", "position", "speed", "countingIn", "loopEnabled", "loopWraps", "beat", "countIn", "stems"};
    bool all = true; for (auto k : keys) if (!s.contains(k)) { all = false; printf("   missing %s\n", k); }
    expect(all && s["stems"].contains("state") && s["stems"].contains("progress") && s["stems"].contains("enabled"), "snapshot has every field the UI reads");
    expect(std::fabs(s["songBpm"].get<double>() - 120) < 0.5 && std::fabs(s["duration"].get<double>() - 8) < 0.1, "tempo and duration");
    json sd = call("core_song_data")["ok"];
    expect(sd["times"].size() == 15 && sd["posInBar"].size() == 15 && sd["barLength"].size() == 15 && sd["peaks"].size() > 10, "core_song_data: beats and peaks");
    json si = call("core_stems_info")["ok"];
    expect(si["supported"] == true && si["names"] == json::array({"drums", "vocals"}), "core_stems_info: the parts of the pack");
    json sp = call("core_stem_peaks")["ok"];
    expect(sp.size() == 2 && sp[0].size() == sd["peaks"].size() && std::fabs(sp[0][5].get<double>() - 0.2) < 0.02 && std::fabs(sp[1][5].get<double>() - 0.2) < 0.02, "core_stem_peaks: one overview per part, same length as the song's");
    json pi = json::parse(call("core_pack_info")["ok"].get<std::string>());
    expect(pi["isPack"] == true && pi["title"] == "Song" && pi["loops"][0]["name"] == "Verse", "core_pack_info: JSON text with title and loops");
    call("core_stems_enable", {{"on", true}}); call("core_set_stem_gain", {{"index", 0}, {"gain", 0.5}});
    call("core_set_metronome", {{"enabled", true}, {"volume", 1.0}, {"accent", true}}); call("core_set_quiet_bars", {{"enabled", true}, {"clickBars", 1}, {"quietBars", 1}});
    call("core_set_count_in", {{"bars", 1}, {"everyLoop", false}}); call("core_set_speed", {{"ratio", 0.9}}); call("core_set_song_volume", {{"volume", 1.0}});
    expect(call("core_set_loop", {{"a", 1.25}, {"b", 3.25}})["ok"] == true, "core_set_loop");
    call("core_play"); std::this_thread::sleep_for(std::chrono::milliseconds(700));
    s = call("core_snapshot")["ok"];
    expect(s["playing"] == true && s["position"].get<double>() > 0.2 && s["loopEnabled"] == true && s["stems"]["enabled"] == true && std::fabs(s["speed"].get<double>() - 0.9) < 1e-6, "playing with a loop, parts on, speed 0.9");
    call("core_pause");
    { const double v = call("core_snap_to_bar", {{"seconds", 2.1}})["ok"].get<double>(); expect(std::fabs(v - 2.25) < 0.01, "core_snap_to_bar (bars start at 0.25, 2.25, ...)"); }
    call("core_clear_loop");

#ifdef BEATCORE_WITH_ANALYSIS
    json ex = {{"options", {{"path", "/tmp/brout.wav"}, {"metronome", true}, {"countInBars", 1}, {"rangeA", 1.25}, {"rangeB", 3.25}, {"separate", true},
                            {"stems", {0, 1}}, {"gains", {1.0, 1.0}}, {"speedRatio", 0}, {"accent", 1}, {"quiet", 0}, {"clickIntoStem", 1}}}};
    expect(call("core_export_start_ex", ex)["ok"] == true, "core_export_start_ex");
    json st; for (int i = 0; i < 500; ++i) { st = call("core_export_status")["ok"]; if (st["state"] != 1) break; std::this_thread::sleep_for(std::chrono::milliseconds(20)); }
    expect(st["state"] == 2 && st["supported"] == true, "core_export_status: done");
    expect(std::filesystem::exists("/tmp/brout - drums.wav") && std::filesystem::exists("/tmp/brout - vocals.wav") && !std::filesystem::exists("/tmp/brout - click.wav"), "separate files; the clicks went into the chosen part (no click file)");

    json ps = {{"options", {{"path", "/tmp/br2.beatpack"}, {"title", "T"}, {"artist", "A"}, {"owner", ""}, {"createdBy", "x"}, {"groups", "0,1"}, {"groupNames", "all"},
                            {"loops", "1.25|3.25|Verse\n"}, {"includeMix", false}}}};
    expect(call("core_pack_save", ps)["ok"] == true, "core_pack_save");
    for (int i = 0; i < 500; ++i) { st = call("core_export_status")["ok"]; if (st["state"] != 1) break; std::this_thread::sleep_for(std::chrono::milliseconds(20)); }
    Package q; expect(st["state"] == 2 && readPackage("/tmp/br2.beatpack", q, &err) && q.trackNames == std::vector<std::string>({"all"}) && q.loops.size() == 1 && q.meta.title == "T", "the saved pack has the merged group, loop and title");

#else
    // the small core keeps no second copy of a pack's sound: export and packing again are refused (a computer does these)
    expect(call("core_export_start_ex", {{"options", {{"path", "/tmp/brout.wav"}, {"stems", {0}}, {"gains", {1.0}}}}})["ok"] == false, "small core: export from a pack is refused");
#endif
    expect(call("core_no_such_command").contains("error"), "an unknown command gives {error}");
    expect(json::parse(bc_bridge_call(b, "core_play", "{not json")).contains("error"), "broken arguments give {error}, no crash");
    expect(json::parse(bc_bridge_call(nullptr, "core_play", "{}")).contains("error"), "no bridge gives {error}, no crash");
    call("core_unload"); bc_bridge_free(b);
    printf(failures ? "\nFAILURES: %d\n" : "\nALL PASSED\n", failures); return failures ? 1 : 0;
}
