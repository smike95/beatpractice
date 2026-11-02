// The disk form of a set of separated tracks (the cache of the app). No ONNX Runtime needed.
#include "portable_path.h"
#include "stem_separator.h"
#include <cstdio>
#include <cstring>

namespace beatcore {

// ---- cache file: "BCST1", tracks, sample rate, frames, then per track: name length, name, int16 data ----
bool StemSet::save(const std::string& path) const {
    FILE* f = bcpath::open(path, "wb"); if (!f) return false;
    uint32_t n = (uint32_t)names.size(), sr = (uint32_t)sampleRate; int64_t fr = frames;
    bool ok = std::fwrite("BCST1", 1, 5, f) == 5 && std::fwrite(&n, 4, 1, f) == 1 && std::fwrite(&sr, 4, 1, f) == 1 && std::fwrite(&fr, 8, 1, f) == 1;
    for (uint32_t i = 0; ok && i < n; ++i) {
        uint32_t len = (uint32_t)names[i].size();
        ok = std::fwrite(&len, 4, 1, f) == 1 && std::fwrite(names[i].data(), 1, len, f) == len &&
             std::fwrite(pcm[i].data(), 2, pcm[i].size(), f) == pcm[i].size();
    }
    std::fclose(f); return ok;
}
bool StemSet::load(const std::string& path) {
    FILE* f = bcpath::open(path, "rb"); if (!f) return false;
    char magic[5]; uint32_t n = 0, sr = 0; int64_t fr = 0;
    bool ok = std::fread(magic, 1, 5, f) == 5 && std::memcmp(magic, "BCST1", 5) == 0 && std::fread(&n, 4, 1, f) == 1 &&
              std::fread(&sr, 4, 1, f) == 1 && std::fread(&fr, 8, 1, f) == 1 && n > 0 && n < 32 && fr > 0 && fr < (1LL << 33);
    names.clear(); pcm.clear();
    for (uint32_t i = 0; ok && i < n; ++i) {
        uint32_t len = 0; ok = std::fread(&len, 4, 1, f) == 1 && len < 64;
        if (!ok) break;
        std::string nm(len, '\0'); ok = std::fread(&nm[0], 1, len, f) == len;
        std::vector<int16_t> d((size_t)2 * fr); ok = ok && std::fread(d.data(), 2, d.size(), f) == d.size();
        if (ok) { names.push_back(nm); pcm.push_back(std::move(d)); }
    }
    std::fclose(f);
    if (!ok) { names.clear(); pcm.clear(); return false; }
    sampleRate = (int)sr; frames = (long)fr; return true;
}

} // namespace beatcore
