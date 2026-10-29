// Separates a song into parts.
//   stems_cli song.mp3 --model models/htdemucs_6s.onnx --keep drums,guitar --out outdir
//   stems_cli --probe --model models/htdemucs_6s.onnx          (prints what the model looks like)
#include "../src/audio_file.h"
#include "../src/stem_separator.h"
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <sstream>
using namespace beatcore;

static void writeWav(const std::string& path, const StemSet& s, int idx) {
    FILE* f = std::fopen(path.c_str(), "wb"); if (!f) return;
    uint32_t bytes = (uint32_t)(s.frames * 4), riff = 36 + bytes, fmt = 16, rate = (uint32_t)s.sampleRate, br = rate * 4;
    uint16_t pcm = 1, ch = 2, al = 4, bits = 16;
    std::fwrite("RIFF", 1, 4, f); std::fwrite(&riff, 4, 1, f); std::fwrite("WAVEfmt ", 1, 8, f); std::fwrite(&fmt, 4, 1, f);
    std::fwrite(&pcm, 2, 1, f); std::fwrite(&ch, 2, 1, f); std::fwrite(&rate, 4, 1, f); std::fwrite(&br, 4, 1, f);
    std::fwrite(&al, 2, 1, f); std::fwrite(&bits, 2, 1, f); std::fwrite("data", 1, 4, f); std::fwrite(&bytes, 4, 1, f);
    const int16_t* L = s.pcm[idx].data(); const int16_t* R = L + s.frames;
    for (long i = 0; i < s.frames; ++i) { std::fwrite(L + i, 2, 1, f); std::fwrite(R + i, 2, 1, f); }
    std::fclose(f);
}

int main(int argc, char** argv) {
    std::string in, model, keep = "all", out = ".", cacheOut; bool probe = false;
    for (int i = 1; i < argc; ++i) { std::string a = argv[i]; auto nx = [&]() -> std::string { return i + 1 < argc ? argv[++i] : ""; };
        if (a == "--model") model = nx(); else if (a == "--keep") keep = nx(); else if (a == "--out") out = nx();
        else if (a == "--probe") probe = true; else if (a == "--save-cache") cacheOut = nx(); else if (a[0] != '-') in = a; }
    if (model.empty()) { fprintf(stderr, "usage: stems_cli song.mp3 --model model.onnx [--keep drums,guitar|all] [--out dir]\n"); return 1; }
    StemSeparator sep(model);
    if (!sep.ok()) { printf("MODEL NOT USABLE: %s\n", sep.error().c_str()); return 2; }
    printf("model OK: %zu sources (", sep.sourceNames().size());
    for (auto& n : sep.sourceNames()) printf(" %s", n.c_str());
    printf(" ), segment %d frames (%.2f s)\n", sep.segmentFrames(), sep.segmentFrames() / 44100.0);
    if (probe || in.empty()) return 0;
    uint32_t mask = 0;
    if (keep == "all") mask = (1u << sep.sourceNames().size()) - 1;
    else { std::stringstream ss(keep); std::string t;
        while (std::getline(ss, t, ',')) for (size_t i = 0; i < sep.sourceNames().size(); ++i) if (sep.sourceNames()[i] == t) mask |= 1u << i; }
    std::vector<float> pcm = decodeAudioFile(in, 2, 44100);
    if (pcm.empty()) { fprintf(stderr, "cannot decode %s\n", in.c_str()); return 3; }
    long T = (long)(pcm.size() / 2); std::vector<float> L(T), R(T);
    for (long i = 0; i < T; ++i) { L[i] = pcm[2 * i]; R[i] = pcm[2 * i + 1]; }
    auto t0 = std::chrono::steady_clock::now();
    StemSet set = sep.separate(L.data(), R.data(), T, mask, [](float p) { fprintf(stderr, "\r%3d%%", (int)(p * 100)); return true; });
    double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    fprintf(stderr, "\n");
    if (set.pcm.empty()) { printf("separation failed\n"); return 4; }
    printf("done in %.1f s (%.2fx real time): %zu tracks\n", secs, secs / (T / 44100.0), set.names.size());
    for (size_t i = 0; i < set.names.size(); ++i) writeWav(out + "/" + set.names[i] + ".wav", set, (int)i);
    if (!cacheOut.empty()) set.save(cacheOut);
    return 0;
}
