#include "bridge.h"
#include "player.h"
#include "playback_engine.h"
#include "../third_party/json.hpp"
#include <mutex>

namespace beatcore {
using nlohmann::json;

struct Bridge::Impl {
    std::mutex mu;
    std::string modelDir, cacheDir;
    std::unique_ptr<Player> player;
    bool lowMemory = false;

    Player& P() { return *player; }

    json snapshot() {
        Player& p = P();
        const int st = (int)p.state();
        json j;
        j["state"] = st; j["progress"] = p.progress(); j["error"] = st == (int)PlayerState::Error ? p.error() : std::string();
        j["fromCache"] = p.fromCache(); j["duration"] = p.durationSeconds(); j["songBpm"] = p.songBpm();
        j["playing"] = p.isPlaying(); j["position"] = p.positionSeconds(); j["speed"] = p.speed();
        j["countingIn"] = p.isCountingIn(); j["loopEnabled"] = p.loopEnabled(); j["loopWraps"] = (long long)p.loopWraps();
        const BeatInfo b = p.currentBeat();
        j["beat"] = b.beatIndex >= 0 ? json{{"index", b.beatIndex}, {"posInBar", b.posInBar}, {"barLength", b.barLength}} : json(nullptr);
        int cb = 0, ct = 0;
        j["countIn"] = p.countInBeat(&cb, &ct) ? json{{"beat", cb}, {"total", ct}} : json(nullptr);
        j["clickBeat"] = p.standaloneClickBeat();
        j["stems"] = {{"state", (int)p.stemsState()}, {"progress", p.stemsProgress()}, {"enabled", p.stemsEnabled()}};
        return j;
    }
    json songData() {
        Player& p = P(); json j; auto m = p.beatMap();
        j["times"] = m ? json(m->beats) : json::array(); j["posInBar"] = m ? json(m->posInBar) : json::array(); j["barLength"] = m ? json(m->barLength) : json::array();
        j["peaks"] = p.peaks();
        return j;
    }

    // returns the value of the command or throws std::runtime_error(message)
    json run(const std::string& cmd, const json& a) {
        Player& p = P();
        auto num = [&](const char* k, double d = 0) { return a.contains(k) && a[k].is_number() ? a[k].get<double>() : d; };
        auto boo = [&](const char* k) { return a.contains(k) && a[k].is_boolean() && a[k].get<bool>(); };
        auto str = [&](const char* k) { return a.contains(k) && a[k].is_string() ? a[k].get<std::string>() : std::string(); };
        if (cmd == "core_init") return {{"loaded", true}, {"dir", modelDir}, {"error", nullptr}};
        if (cmd == "core_load") return nullptr;                       // the host decides where the models are; nothing to choose here
        if (cmd == "core_unload") { p.unload(); return nullptr; }
        if (cmd == "core_open_file") return p.openFile(str("path"));
        if (cmd == "core_snapshot") return snapshot();
        if (cmd == "core_song_data") return songData();
        if (cmd == "core_click_set") { p.setStandaloneClick(boo("on"), num("bpm", 100), (int)num("beats", 4), boo("accent"), (float)num("volume", 1), (int)num("sound")); return nullptr; }
        if (cmd == "core_stem_peaks") return p.stemPeaks();
        if (cmd == "core_caps") {
            const int sounds = PlaybackEngine::clickSoundCount();
            return {{"clickSounds", sounds}, {"countInBeats", sounds > 0}, {"stems", true}, {"meterModes", true}, {"packs", true}};
        }
        if (cmd == "core_stems_info") {
            return {{"supported", true}, {"available", p.stemsAvailable()}, {"cached", p.stemsCached()},
                    {"error", p.stemsState() == StemState::Error ? p.stemsError() : std::string()},
                    {"names", p.stemsState() == StemState::Ready ? json(p.stemNames()) : json::array()}};
        }
        if (cmd == "core_export_start") return p.exportStart(str("path"), boo("metronome"));
        if (cmd == "core_export_start_ex") {
            const json o = a.contains("options") ? a["options"] : json::object();
            ExportRequest r; r.path = o.value("path", ""); r.withMetronome = o.value("metronome", false); r.countInBars = o.value("countInBars", 0);
            r.rangeA = o.value("rangeA", -1.0); r.rangeB = o.value("rangeB", -1.0); r.separate = o.value("separate", false);
            if (o.contains("stems")) r.stems = o["stems"].get<std::vector<int>>();
            if (o.contains("gains")) r.stemGains = o["gains"].get<std::vector<float>>();
            r.speedRatio = o.value("speedRatio", 0.0); r.accent = o.value("accent", -1); r.quiet = o.value("quiet", -1); r.clickIntoStem = o.value("clickIntoStem", -1);
            return p.exportStart(r);
        }
        if (cmd == "core_pack_info") return p.packInfoJson();           // a JSON text inside the result, as in the desktop app
        if (cmd == "core_pack_save") {
            const json o = a.contains("options") ? a["options"] : json::object();
            PackRequest r; r.path = o.value("path", ""); r.title = o.value("title", ""); r.artist = o.value("artist", ""); r.ownerId = o.value("owner", "");
            r.createdBy = o.value("createdBy", ""); r.includeMix = o.value("includeMix", true);
            const std::string groups = o.value("groups", ""), names = o.value("groupNames", ""), loops = o.value("loops", "");
            { size_t pos = 0; while (pos <= groups.size()) { size_t e = groups.find(';', pos); if (e == std::string::npos) e = groups.size();
                std::vector<int> idx; const std::string seg = groups.substr(pos, e - pos); size_t q = 0;
                while (q < seg.size()) { size_t c = seg.find(',', q); if (c == std::string::npos) c = seg.size(); if (c > q) idx.push_back(std::atoi(seg.substr(q, c - q).c_str())); q = c + 1; }
                if (!idx.empty()) r.groups.push_back(idx); pos = e + 1; } }
            { size_t pos = 0; while (pos <= names.size() && !names.empty()) { size_t e = names.find(';', pos); if (e == std::string::npos) e = names.size(); r.groupNames.push_back(names.substr(pos, e - pos)); pos = e + 1; } }
            { size_t pos = 0; while (pos < loops.size()) { size_t e = loops.find('\n', pos); if (e == std::string::npos) e = loops.size(); const std::string line = loops.substr(pos, e - pos); pos = e + 1;
                size_t a1 = line.find('|'), a2 = a1 == std::string::npos ? a1 : line.find('|', a1 + 1); if (a2 == std::string::npos) continue;
                r.loops.push_back({line.substr(a2 + 1), std::atof(line.substr(0, a1).c_str()), std::atof(line.substr(a1 + 1, a2 - a1 - 1).c_str())}); } }
            return p.packSave(r);
        }
        if (cmd == "core_set_quiet_bars") { MetronomeSettings s = p.metronomeSettings(); s.quietEnabled = boo("enabled"); s.clickBars = (int)num("clickBars", 2); s.quietBars = (int)num("quietBars", 1); p.setMetronome(s); return nullptr; }
        if (cmd == "core_export_status") return {{"supported", true}, {"state", p.exportState()}, {"progress", p.exportProgress()}, {"error", p.exportState() == 3 ? p.exportError() : std::string()}};
        if (cmd == "core_export_cancel") { p.exportCancel(); return nullptr; }
        if (cmd == "core_stems_start") return p.stemsStart();
        if (cmd == "core_stems_cancel") { p.stemsCancel(); return nullptr; }
        if (cmd == "core_stems_enable") { p.setStemsEnabled(boo("on")); return nullptr; }
        if (cmd == "core_set_stem_gain") { p.setStemGain((int)num("index"), (float)num("gain", 1)); return nullptr; }
        if (cmd == "core_set_meter_mode") return p.setMeterMode((int)num("mode"));
        if (cmd == "core_set_click_sound") { p.setClickSound((int)num("id")); return nullptr; }
        if (cmd == "core_play") { p.play(); return nullptr; }
        if (cmd == "core_pause") { p.pause(); return nullptr; }
        if (cmd == "core_seek") { p.seekSeconds(num("seconds")); return nullptr; }
        if (cmd == "core_set_speed") { p.setSpeed(num("ratio", 1)); return nullptr; }
        if (cmd == "core_set_metronome") { MetronomeSettings s = p.metronomeSettings(); s.enabled = boo("enabled"); s.volume = (float)num("volume", 1); s.accentFirstBeat = boo("accent"); p.setMetronome(s); return nullptr; }
        if (cmd == "core_set_song_volume") { p.setSongVolume((float)num("volume", 1)); return nullptr; }
        if (cmd == "core_set_count_in") { CountInSettings s; s.bars = (int)num("bars"); s.everyLoopRestart = boo("everyLoop"); p.setCountIn(s); return nullptr; }
        if (cmd == "core_set_loop") return p.setLoop(num("a"), num("b"));
        if (cmd == "core_clear_loop") { p.clearLoop(); return nullptr; }
        if (cmd == "core_snap_to_bar") return p.snapToBar(num("seconds"));
        if (cmd == "core_snap_to_beat") return p.snapToBeat(num("seconds"));
        throw std::runtime_error("Unknown command: " + cmd);
    }
};

Bridge::Bridge(const std::string& modelDir, const std::string& cacheDir) : impl_(new Impl) {
    impl_->modelDir = modelDir; impl_->cacheDir = cacheDir;
    impl_->player.reset(new Player(modelDir, cacheDir));
}
Bridge::~Bridge() = default;
void Bridge::setLowMemory(bool on) { std::lock_guard<std::mutex> g(impl_->mu); impl_->lowMemory = on; impl_->player->setLowMemory(on); }

std::string Bridge::call(const std::string& command, const std::string& argsJson) {
    json out;
    try {
        json args = argsJson.empty() ? json::object() : json::parse(argsJson, nullptr, true, false);
        if (args.is_discarded()) throw std::runtime_error("Bad arguments (not JSON)");
        std::lock_guard<std::mutex> g(impl_->mu);
        out["ok"] = impl_->run(command, args);
    } catch (const std::exception& e) {
        out = json{{"error", std::string(e.what())}};
    }
    return out.dump();
}

} // namespace beatcore

extern "C" {
void* bc_bridge_new(const char* model_dir, const char* cache_dir, int low_memory) {
    try {
        auto* b = new beatcore::Bridge(model_dir ? model_dir : "", cache_dir ? cache_dir : "");
        b->setLowMemory(low_memory != 0);
        return b;
    } catch (...) { return nullptr; }
}
const char* bc_bridge_call(void* bridge, const char* command, const char* args_json) {
    static thread_local std::string out;
    out = bridge && command ? static_cast<beatcore::Bridge*>(bridge)->call(command, args_json ? args_json : "") : "{\"error\":\"no bridge\"}";
    return out.c_str();
}
void bc_bridge_free(void* bridge) { delete static_cast<beatcore::Bridge*>(bridge); }
}
