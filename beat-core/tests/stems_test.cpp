// Test of the stem separator with FAKE models (made by tests/make_fake_models.py): source s = c[s] * mix.
// Because the fake model is exactly linear, any mistake in cutting into segments, overlap-adding, normalising,
// choosing which parts to keep or in the cache file shows up as a numerical error.
//   ./stems_test <folder with fake_*.onnx>
#include "../src/stem_separator.h"
#include <cmath>
#include <cstdio>
#include <random>
using namespace beatcore;
static int fails = 0;
static void ok(bool c, const char* what, double v = -1) {
    if (v >= 0) printf("%-62s %.6f  %s\n", what, v, c ? "PASS" : "FAIL"); else printf("%-62s %s\n", what, c ? "PASS" : "FAIL");
    if (!c) ++fails;
}
int main(int argc, char** argv) {
    std::string dir = argc > 1 ? argv[1] : ".";
    const double c6[6] = {0.30, 0.20, 0.10, 0.15, 0.15, 0.10};
    const long T = 1234567;                                   // not a multiple of any segment or stride
    std::vector<float> L(T), R(T);
    std::mt19937 rng(7); std::normal_distribution<float> nd(0.f, 0.12f);
    for (long i = 0; i < T; ++i) {
        float tone = 0.25f * std::sin(2 * M_PI * 220.0 * i / 44100.0);
        L[i] = tone + nd(rng) + 0.02f;                        // a little DC offset on purpose
        R[i] = 0.7f * tone + nd(rng) - 0.01f;
    }
    struct Case { const char* file; int S; uint32_t mask; double tol; const char* label; };
    Case cases[] = {
        {"fake_6s_fixed.onnx", 6, 0b111111, 2e-4, "6 parts, all kept, fixed 2 s segment"},
        {"fake_6s_fixed.onnx", 6, 0b010001, 2e-4, "6 parts, keep drums+guitar (+rest)"},
        {"fake_6s_fixed.onnx", 6, 0b000001, 2e-4, "6 parts, keep only drums (+rest)"},
        {"fake_6s_dynamic.onnx", 6, 0b001010, 2e-4, "6 parts, model accepts any length (7.8 s segments)"},
        {"fake_4s_fixed.onnx", 4, 0b1001, 2e-4, "4 parts, keep drums+vocals"},
        {"fake_6s_half.onnx", 6, 0b100100, 3e-3, "6 parts, float16 model, keep other+piano"},
    };
    for (const auto& c : cases) {
        StemSeparator sep(dir + "/" + c.file);
        char buf[160];
        if (!sep.ok()) { snprintf(buf, sizeof buf, "%s: model usable (%s)", c.label, sep.error().c_str()); ok(false, buf); continue; }
        std::vector<float> seen; bool mono = true;
        StemSet set = sep.separate(L.data(), R.data(), T, c.mask, [&](float p) { if (!seen.empty() && p < seen.back()) mono = false; seen.push_back(p); return true; });
        const auto names = defaultSourceNames(c.S);
        // expected tracks: kept sources in model order, then "rest"
        std::vector<std::vector<int>> groups; std::vector<std::string> wantNames;
        std::vector<int> restSrc;
        for (int s = 0; s < c.S; ++s) { if (c.mask & (1u << s)) { groups.push_back({s}); wantNames.push_back(names[s]); } else restSrc.push_back(s); }
        if (!restSrc.empty()) { groups.push_back(restSrc); wantNames.push_back("rest"); }
        bool shape = set.names == wantNames && set.pcm.size() == groups.size() && set.frames == T;
        snprintf(buf, sizeof buf, "%s: track names and count", c.label); ok(shape, buf);
        if (!shape) continue;
        // the separator removes the DC offset of the mono mix before the model (like Demucs) and does not put it back
        double dcSum = 0; for (long i = 0; i < T; ++i) dcSum += 0.5 * (L[i] + R[i]);
        const double dc = dcSum / T;
        double worst = 0;
        for (size_t g = 0; g < groups.size(); ++g) {
            double k = 0; for (int s : groups[g]) k += c6[c.S == 4 ? s : s] / (c.S == 4 ? 1.0 : 1.0);
            if (c.S == 4) { double sum = 0; for (int s = 0; s < 4; ++s) sum += c6[s]; k = 0; for (int s : groups[g]) k += c6[s] / sum; }
            const int16_t* pl = set.pcm[g].data(); const int16_t* pr = pl + T;
            for (long i = 0; i < T; i += 3) {                  // every 3rd frame is plenty
                worst = std::max(worst, std::fabs(pl[i] / 32768.0 - k * (L[i] - dc)));
                worst = std::max(worst, std::fabs(pr[i] / 32768.0 - k * (R[i] - dc)));
            }
        }
        snprintf(buf, sizeof buf, "%s: max error vs exact", c.label); ok(worst < c.tol, buf, worst);
        snprintf(buf, sizeof buf, "%s: progress goes up to 1", c.label); ok(mono && !seen.empty() && std::fabs(seen.back() - 1.f) < 1e-6, buf);
        if (c.mask == 0b010001) {                              // cache file round trip
            StemSet back; bool saved = set.save("/tmp/stems_test_cache.bcs"), loaded = back.load("/tmp/stems_test_cache.bcs");
            ok(saved && loaded && back.names == set.names && back.frames == set.frames && back.pcm == set.pcm, "cache file save/load gives identical tracks");
            std::remove("/tmp/stems_test_cache.bcs");
        }
    }
    {   // cancel
        StemSeparator sep(dir + "/fake_6s_fixed.onnx"); int calls = 0;
        StemSet s = sep.separate(L.data(), R.data(), T, 0b1, [&](float) { return ++calls < 3; });
        ok(s.pcm.empty() && calls == 3, "cancelling stops early and returns nothing");
        StemSet none = sep.separate(L.data(), R.data(), T, 0, {});
        ok(none.pcm.empty(), "empty selection returns nothing");
    }
    {   // a model that is not a separator is rejected with a message
        StemSeparator bad(dir + "/not_a_model.onnx");
        ok(!bad.ok() && !bad.error().empty(), "a missing/invalid model file is rejected with a message");
    }
    printf(fails ? "STEMS TEST FAILED\n" : "STEMS TEST PASSED\n");
    return fails ? 1 : 0;
}
