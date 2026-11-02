#include "package.h"
#include "portable_path.h"
#include "../third_party/miniaudio.h"
#include "../third_party/json.hpp"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <filesystem>
#ifdef BEATCORE_PACK_WRITER
#include <FLAC/stream_encoder.h>
#endif

namespace beatcore {
using nlohmann::json;
namespace {

const char kMagic[8] = {'B', 'E', 'A', 'T', 'P', 'A', 'C', 'K'};
constexpr uint64_t kMaxEntry = 1ull << 32;        // an entry of 4 GB or more is not a real one
constexpr uint64_t kMaxManifest = 32ull << 20;
constexpr long kMaxFrames = 44100L * 60 * 60 * 3; // 3 hours: more is a corrupt or hostile file
constexpr size_t kMaxTracks = 32;

uint32_t crc32(const uint8_t* p, size_t n, uint32_t crc = 0) {
    static uint32_t table[256]; static bool init = false;
    if (!init) { for (uint32_t i = 0; i < 256; ++i) { uint32_t c = i; for (int k = 0; k < 8; ++k) c = (c & 1) ? 0xEDB88320u ^ (c >> 1) : c >> 1; table[i] = c; } init = true; }
    crc = ~crc;
    for (size_t i = 0; i < n; ++i) crc = table[(crc ^ p[i]) & 0xFF] ^ (crc >> 8);
    return ~crc;
}
void put16(std::vector<uint8_t>& o, uint16_t v) { o.push_back(v & 255); o.push_back(v >> 8); }
void put32(std::vector<uint8_t>& o, uint32_t v) { for (int i = 0; i < 4; ++i) o.push_back((v >> (8 * i)) & 255); }
void put64(std::vector<uint8_t>& o, uint64_t v) { for (int i = 0; i < 8; ++i) o.push_back((v >> (8 * i)) & 255); }
uint64_t get(const uint8_t* p, int n) { uint64_t v = 0; for (int i = 0; i < n; ++i) v |= (uint64_t)p[i] << (8 * i); return v; }

struct Entry { std::string name; const uint8_t* data = nullptr; uint64_t size = 0; uint32_t crc = 0; };

bool fail(std::string* err, const char* msg) { if (err) *err = msg; return false; }

// ---- FLAC <-> planar int16 ----
bool decodeFlac(const uint8_t* data, size_t size, int rate, long frames, std::vector<int16_t>& planar) {
    ma_decoder_config cfg = ma_decoder_config_init(ma_format_s16, 2, (ma_uint32)rate);
    ma_decoder dec;
    if (ma_decoder_init_memory(data, size, &cfg, &dec) != MA_SUCCESS) return false;
    planar.assign((size_t)2 * frames, 0);
    std::vector<int16_t> buf(2 * 16384);
    long done = 0;
    while (done < frames) {
        ma_uint64 want = (ma_uint64)std::min<long>(16384, frames - done), got = 0;
        ma_decoder_read_pcm_frames(&dec, buf.data(), want, &got);
        if (got == 0) break;
        for (ma_uint64 i = 0; i < got; ++i) { planar[(size_t)done + i] = buf[2 * i]; planar[(size_t)frames + done + i] = buf[2 * i + 1]; }
        done += (long)got;
    }
    ma_decoder_uninit(&dec);
    return done == frames;                                  // a track shorter than the manifest says is damaged
}

#ifdef BEATCORE_PACK_WRITER
FLAC__StreamEncoderWriteStatus flacWrite(const FLAC__StreamEncoder*, const FLAC__byte buf[], size_t bytes, uint32_t, uint32_t, void* user) {
    auto* o = static_cast<std::vector<uint8_t>*>(user); o->insert(o->end(), buf, buf + bytes); return FLAC__STREAM_ENCODER_WRITE_STATUS_OK;
}
bool encodeFlac(const std::vector<int16_t>& planar, long frames, int rate, int level, std::vector<uint8_t>& out) {
    FLAC__StreamEncoder* enc = FLAC__stream_encoder_new();
    if (!enc) return false;
    FLAC__stream_encoder_set_channels(enc, 2); FLAC__stream_encoder_set_bits_per_sample(enc, 16);
    FLAC__stream_encoder_set_sample_rate(enc, (uint32_t)rate); FLAC__stream_encoder_set_compression_level(enc, (uint32_t)level);
    FLAC__stream_encoder_set_total_samples_estimate(enc, (FLAC__uint64)frames); FLAC__stream_encoder_set_verify(enc, false);
    out.clear();
    bool ok = FLAC__stream_encoder_init_stream(enc, flacWrite, nullptr, nullptr, nullptr, &out) == FLAC__STREAM_ENCODER_INIT_STATUS_OK;
    std::vector<FLAC__int32> block(2 * 8192);
    for (long pos = 0; ok && pos < frames; pos += 8192) {
        const long n = std::min<long>(8192, frames - pos);
        for (long i = 0; i < n; ++i) { block[2 * i] = planar[(size_t)pos + i]; block[2 * i + 1] = planar[(size_t)frames + pos + i]; }
        ok = FLAC__stream_encoder_process_interleaved(enc, block.data(), (uint32_t)n);
    }
    if (ok) ok = FLAC__stream_encoder_finish(enc);
    FLAC__stream_encoder_delete(enc);
    return ok;
}
#endif
} // namespace

std::vector<int16_t> sumTracks(const std::vector<const std::vector<int16_t>*>& parts) {
    if (parts.empty()) return {};
    std::vector<int16_t> out(parts[0]->size(), 0);
    for (size_t i = 0; i < out.size(); ++i) {
        int s = 0; for (auto* p : parts) if (i < p->size()) s += (*p)[i];
        out[i] = (int16_t)std::max(-32768, std::min(32767, s));
    }
    return out;
}

bool readPackageFromMemory(const uint8_t* d, size_t n, Package& out, std::string* err, bool withAudio, const PackProgress& progress) {
    out = Package();
    if (n < 12 || std::memcmp(d, kMagic, 8) != 0) return fail(err, "This is not a BeatPack file.");
    if (get(d + 8, 4) > kPackVersion) return fail(err, "This pack was made by a newer version of the program. Update the program.");
    std::vector<Entry> entries; size_t pos = 12; bool ended = false;
    while (pos + 2 <= n) {
        const size_t nl = (size_t)get(d + pos, 2); pos += 2;
        if (nl == 0) { ended = true; break; }
        if (nl > 255 || pos + nl + 12 > n) return fail(err, "The pack is damaged (bad entry).");
        Entry e; e.name.assign((const char*)d + pos, nl); pos += nl;
        e.size = get(d + pos, 8); e.crc = (uint32_t)get(d + pos + 8, 4); pos += 12;
        if (e.size > kMaxEntry || e.size > n - pos) return fail(err, "The pack is damaged or cut short.");
        e.data = d + pos; pos += (size_t)e.size; entries.push_back(e);
    }
    if (!ended) return fail(err, "The pack is cut short (the file was not copied completely).");
    auto find = [&](const std::string& nm) -> const Entry* { for (auto& e : entries) if (e.name == nm) return &e; return nullptr; };
    auto verify = [&](const Entry& e) { return crc32(e.data, (size_t)e.size) == e.crc; };

    const Entry* man = find("manifest.json");
    if (!man || man->size > kMaxManifest) return fail(err, "The pack has no description.");
    if (!verify(*man)) return fail(err, "The pack is damaged (check sum of the description).");
    json j;
    try { j = json::parse(man->data, man->data + man->size); } catch (...) { return fail(err, "The description of the pack is unreadable."); }
    try {
        if (j.value("format", "") != "beatpack") return fail(err, "This is not a BeatPack file.");
        out.meta.title = j.value("title", ""); out.meta.artist = j.value("artist", ""); out.meta.ownerId = j.value("owner", "");
        out.meta.createdBy = j.value("createdBy", ""); out.meta.modelName = j.value("model", "");
        out.sampleRate = j.value("sampleRate", 44100); out.frames = j.value("frames", 0L);
        if (out.sampleRate < 8000 || out.sampleRate > 192000 || out.frames <= 0 || out.frames > kMaxFrames) return fail(err, "The pack has wrong audio parameters.");
        BeatMap& m = out.map; const json& b = j.at("beatMap");
        m.durationSec = b.value("durationSec", 0.0); m.periodSec = b.value("periodSec", 0.0); m.bpm = b.value("bpm", 0.0);
        m.beats = b.at("beats").get<std::vector<double>>(); m.barLength = b.at("barLength").get<std::vector<int>>(); m.posInBar = b.at("posInBar").get<std::vector<int>>();
        m.playFirstBeat = b.value("playFirstBeat", -1); m.playLastBeat = b.value("playLastBeat", -1);
        if (m.barLength.size() != m.beats.size() || m.posInBar.size() != m.beats.size()) return fail(err, "The beat map in the pack is inconsistent.");
        if (m.playFirstBeat >= (int)m.beats.size() || m.playLastBeat >= (int)m.beats.size()) return fail(err, "The beat map in the pack is inconsistent.");
        for (auto& l : j.value("loops", json::array())) out.loops.push_back({l.value("name", ""), l.value("start", 0.0), l.value("end", 0.0)});
        for (auto& t : j.value("tracks", json::array())) out.trackNames.push_back(t.value("name", ""));
        if (out.trackNames.size() > kMaxTracks) return fail(err, "The pack has too many tracks.");
        if (const Entry* a = find("activations.bin")) {
            if (!verify(*a)) return fail(err, "The pack is damaged (check sum of the analysis).");
            if (a->size >= 8) {
                const uint64_t cnt = get(a->data, 4);
                if (a->size == 8 + cnt * 8 && cnt < (1u << 24)) {
                    out.acts.beat.resize(cnt); out.acts.downbeat.resize(cnt);
                    std::memcpy(out.acts.beat.data(), a->data + 8, cnt * 4); std::memcpy(out.acts.downbeat.data(), a->data + 8 + cnt * 4, cnt * 4);
                    out.acts.durationSec = m.durationSec;
                }
            }
        }
    } catch (...) { return fail(err, "The description of the pack is unreadable."); }
    if (const Entry* c = find("cover.bin")) if (verify(*c)) out.cover.assign(c->data, c->data + c->size);

    if (withAudio) {
        const size_t total = out.trackNames.size() + (find("mix.flac") ? 1 : 0); size_t doneN = 0;
        for (size_t i = 0; i < out.trackNames.size(); ++i) {
            const Entry* t = find("track-" + std::to_string(i) + ".flac");
            if (!t) return fail(err, "A track is missing in the pack.");
            if (!verify(*t)) return fail(err, "The pack is damaged (check sum of a track).");
            out.tracks.emplace_back();
            if (!decodeFlac(t->data, (size_t)t->size, out.sampleRate, out.frames, out.tracks.back())) return fail(err, "A track in the pack cannot be decoded.");
            if (progress && !progress((float)(++doneN) / (float)std::max<size_t>(1, total))) return fail(err, "Cancelled.");
        }
        if (const Entry* mx = find("mix.flac")) {
            if (!verify(*mx)) return fail(err, "The pack is damaged (check sum of the song).");
            if (!decodeFlac(mx->data, (size_t)mx->size, out.sampleRate, out.frames, out.mix)) return fail(err, "The song in the pack cannot be decoded.");
        }
        if (out.tracks.empty() && out.mix.empty()) return fail(err, "The pack has no sound.");
    }
    if (progress) progress(1.f);
    return true;
}

bool readPackage(const std::string& path, Package& out, std::string* err, bool withAudio, const PackProgress& progress) {
    FILE* f = bcpath::open(path, "rb");
    if (!f) return fail(err, "Cannot open the pack file.");
    std::fseek(f, 0, SEEK_END); const long long sz = (long long)std::ftell(f); std::fseek(f, 0, SEEK_SET);
    if (sz < 12) { std::fclose(f); return fail(err, "This is not a BeatPack file."); }
    std::vector<uint8_t> buf((size_t)sz);
    const size_t got = std::fread(buf.data(), 1, buf.size(), f); std::fclose(f);
    if (got != buf.size()) return fail(err, "Cannot read the pack file.");
    return readPackageFromMemory(buf.data(), buf.size(), out, err, withAudio, progress);
}

bool writePackage(const std::string& path, const Package& pkg, std::string* err, int flacLevel, const PackProgress& progress) {
#ifndef BEATCORE_PACK_WRITER
    (void)path; (void)pkg; (void)flacLevel; (void)progress; return fail(err, "This build cannot create packs.");
#else
    if (pkg.frames <= 0 || pkg.trackNames.size() != pkg.tracks.size()) return fail(err, "Nothing to pack.");
    if (pkg.tracks.empty() && pkg.mix.empty()) return fail(err, "Nothing to pack.");
    for (auto& t : pkg.tracks) if (t.size() != (size_t)2 * pkg.frames) return fail(err, "A track has a wrong length.");
    if (!pkg.mix.empty() && pkg.mix.size() != (size_t)2 * pkg.frames) return fail(err, "The song has a wrong length.");

    json j; j["format"] = "beatpack"; j["version"] = kPackVersion; j["title"] = pkg.meta.title; j["artist"] = pkg.meta.artist; j["owner"] = pkg.meta.ownerId;
    j["createdBy"] = pkg.meta.createdBy; j["model"] = pkg.meta.modelName; j["sampleRate"] = pkg.sampleRate; j["frames"] = pkg.frames;
    const BeatMap& m = pkg.map;
    j["beatMap"] = {{"durationSec", m.durationSec}, {"periodSec", m.periodSec}, {"bpm", m.bpm}, {"beats", m.beats}, {"barLength", m.barLength},
                    {"posInBar", m.posInBar}, {"playFirstBeat", m.playFirstBeat}, {"playLastBeat", m.playLastBeat}};
    j["tracks"] = json::array(); for (auto& nme : pkg.trackNames) j["tracks"].push_back({{"name", nme}});
    j["loops"] = json::array(); for (auto& l : pkg.loops) j["loops"].push_back({{"name", l.name}, {"start", l.start}, {"end", l.end}});
    const std::string man = j.dump();

    const std::string tmp = path + ".tmp";
    FILE* f = bcpath::open(tmp, "wb");
    if (!f) return fail(err, "Cannot create the pack file.");
    bool ok = true;
    auto writeEntry = [&](const std::string& name, const uint8_t* data, size_t size) {
        std::vector<uint8_t> h; put16(h, (uint16_t)name.size()); h.insert(h.end(), name.begin(), name.end());
        put64(h, size); put32(h, crc32(data, size));
        ok = ok && std::fwrite(h.data(), 1, h.size(), f) == h.size() && (size == 0 || std::fwrite(data, 1, size, f) == size);
    };
    { std::vector<uint8_t> h(kMagic, kMagic + 8); put32(h, kPackVersion); ok = std::fwrite(h.data(), 1, h.size(), f) == h.size(); }
    writeEntry("manifest.json", (const uint8_t*)man.data(), man.size());
    if (!pkg.acts.beat.empty() && pkg.acts.beat.size() == pkg.acts.downbeat.size()) {
        std::vector<uint8_t> a; put32(a, (uint32_t)pkg.acts.beat.size()); put32(a, 0);
        const size_t at = a.size(); a.resize(at + pkg.acts.beat.size() * 8);
        std::memcpy(a.data() + at, pkg.acts.beat.data(), pkg.acts.beat.size() * 4); std::memcpy(a.data() + at + pkg.acts.beat.size() * 4, pkg.acts.downbeat.data(), pkg.acts.downbeat.size() * 4);
        writeEntry("activations.bin", a.data(), a.size());
    }
    if (!pkg.cover.empty()) writeEntry("cover.bin", pkg.cover.data(), pkg.cover.size());
    const size_t total = pkg.tracks.size() + (pkg.mix.empty() ? 0 : 1); size_t doneN = 0;
    std::vector<uint8_t> enc;
    auto doTrack = [&](const std::string& name, const std::vector<int16_t>& pcm) {
        if (!encodeFlac(pcm, pkg.frames, pkg.sampleRate, std::max(0, std::min(8, flacLevel)), enc)) { ok = false; return; }
        writeEntry(name, enc.data(), enc.size());
        if (progress && !progress((float)(++doneN) / (float)total)) { ok = false; if (err) *err = "Cancelled."; }
    };
    for (size_t i = 0; ok && i < pkg.tracks.size(); ++i) doTrack("track-" + std::to_string(i) + ".flac", pkg.tracks[i]);
    if (ok && !pkg.mix.empty()) doTrack("mix.flac", pkg.mix);
    if (ok) { std::vector<uint8_t> e; put16(e, 0); ok = std::fwrite(e.data(), 1, e.size(), f) == e.size(); }
    ok = (std::fclose(f) == 0) && ok;
    std::error_code ec;
    if (ok) { std::filesystem::rename(bcpath::make(tmp), bcpath::make(path), ec); if (ec) { std::filesystem::remove(bcpath::make(path), ec); std::filesystem::rename(bcpath::make(tmp), bcpath::make(path), ec); } ok = !ec; }
    if (!ok) { std::filesystem::remove(bcpath::make(tmp), ec); if (err && err->empty()) *err = "Cannot write the pack file (disk full?)."; return false; }
    return true;
#endif
}

} // namespace beatcore
