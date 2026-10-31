// End-to-end test of stem separation through the C API (null sound device, fake Demucs-like model):
//   BEATCORE_NULL_AUDIO=1 ./stems_player_test song.wav models_folder_with_a_stem_model cache
#include "../src/beat_core_c.h"
#include <chrono>
#include <cstdlib>
#include <cstdio>
#include <string>
#include <sys/stat.h>
#include <thread>
using namespace std::chrono;
static int fails = 0;
static void ok(bool c, const char* what) { printf("%-66s %s\n", what, c ? "PASS" : "FAIL"); if (!c) ++fails; }
static void sleepMs(int ms) { std::this_thread::sleep_for(milliseconds(ms)); }
static bool waitReady(bc_player* p, int sec) {
    auto t0 = steady_clock::now();
    while (bc_state(p) != BC_READY && bc_state(p) != BC_ERROR) { sleepMs(50); if (steady_clock::now() - t0 > seconds(sec)) return false; }
    return bc_state(p) == BC_READY;
}
static int waitStems(bc_player* p, int sec, bool* monotonic) {
    float last = 0; auto t0 = steady_clock::now();
    while (bc_stems_state(p) == 1) { float g = bc_stems_progress(p); if (g + 1e-6f < last) *monotonic = false; last = g; sleepMs(30); if (steady_clock::now() - t0 > seconds(sec)) break; }
    return bc_stems_state(p);
}
int main(int argc, char** argv) {
    if (argc < 4) { fprintf(stderr, "usage: stems_player_test song models cache\n"); return 1; }
    const std::string song = argv[1], models = argv[2], cache = argv[3];

    // --- a player whose model folder has no stem model: refuses politely
    {
        mkdir("/tmp/empty_models_dir", 0755);
        std::string beat = models + "/beat_this_small.onnx";   // reuse the beat models through symlinks
        for (const char* f : {"beat_this.onnx", "beat_this_small.onnx", "mel_spectrogram.onnx"}) { std::string cmd = std::string("ln -sf ") + models + "/" + f + " /tmp/empty_models_dir/" + f; (void)!system(cmd.c_str()); }
        bc_player* q = bc_create("/tmp/empty_models_dir", cache.c_str());
        ok(bc_stems_start(q) == 0, "no song yet: stems cannot start");
        bc_open_file(q, song.c_str());
        ok(waitReady(q, 300), "song ready (no stem model installed)");
        ok(bc_stems_available(q) == 0, "stems not available without the model file");
        ok(bc_stems_start(q) == 0 && bc_stems_state(q) == 3, "start refused, state = error");
        ok(std::string(bc_stems_error(q)).find("Stem model not found") != std::string::npos, "error message explains the missing model");
        bc_destroy(q);
    }

    bc_player* p = bc_create(models.c_str(), cache.c_str());
    bc_open_file(p, song.c_str());
    ok(waitReady(p, 300), "song ready");
    // --- meter recognition mode: re-reads the saved network output, the song stays usable
    { int n0 = bc_beat_count(p);
      ok(bc_set_meter_mode(p, 1) == 1 && bc_meter_mode(p) == 1 && bc_beat_count(p) > 8, "meter mode 'sensitive' applies to the loaded song");
      ok(bc_set_meter_mode(p, 2) == 1 && bc_beat_count(p) > 8, "meter mode 'strict' applies");
      ok(bc_set_meter_mode(p, 0) == 1 && bc_meter_mode(p) == 0 && std::abs(bc_beat_count(p) - n0) <= 2, "back to automatic gives the original result"); }
    ok(bc_stems_available(p) == 1, "stems available (model present)");
    ok(bc_stems_cached(p) == 0, "not cached yet");
    ok(bc_stems_enabled(p) == 0 && bc_stems_state(p) == 0, "initial state: off, nothing running");

    // --- separate
    auto t0 = steady_clock::now();
    ok(bc_stems_start(p) == 1, "separation starts");
    ok(bc_stems_start(p) == 0, "a second start while running is refused");
    bool mono = true;
    int st = waitStems(p, 600, &mono);
    double sec1 = duration<double>(steady_clock::now() - t0).count();
    printf("  (separation took %.1f s)\n", sec1);
    ok(st == 2, "separation finishes with state READY");
    if (st != 2) { printf("  error: %s\n", bc_stems_error(p)); return 1; }
    ok(mono, "progress never goes backwards");
    ok(bc_stems_count(p) == 4, "4 stems");
    ok(std::string(bc_stem_name(p, 0)) == "drums" && std::string(bc_stem_name(p, 1)) == "bass" &&
       std::string(bc_stem_name(p, 2)) == "other" && std::string(bc_stem_name(p, 3)) == "vocals", "names: drums, bass, other, vocals");
    ok(bc_stems_cached(p) == 1, "result is cached on disk");

    // --- use them
    bc_stems_enable(p, 1);
    ok(bc_stems_enabled(p) == 1, "stems can be switched on");
    bc_set_stem_gain(p, 0, 0.f); bc_set_stem_gain(p, 3, 1.5f);
    bc_play(p); sleepMs(600);
    ok(bc_is_playing(p) == 1 && bc_position(p) > 0.3, "plays with stems on");
    bc_set_speed(p, 0.8); sleepMs(400); bc_stems_enable(p, 0); sleepMs(300); bc_stems_enable(p, 1); sleepMs(300);
    ok(bc_is_playing(p) == 1 && bc_stems_enabled(p) == 1, "speed change and on/off while playing are fine");
    bc_pause(p);

    // --- opening another file resets stems
    bc_destroy(p);

    // --- second run: straight from the cache
    p = bc_create(models.c_str(), cache.c_str());
    bc_open_file(p, song.c_str());
    ok(waitReady(p, 300), "song ready again");
    ok(bc_stems_cached(p) == 1, "cache found for the same song");
    t0 = steady_clock::now(); bc_stems_start(p); mono = true; st = waitStems(p, 120, &mono);
    double sec2 = duration<double>(steady_clock::now() - t0).count();
    printf("  (from cache: %.2f s)\n", sec2);
    ok(st == 2 && bc_stems_count(p) == 4, "loads from cache");
    ok(sec2 < sec1 || sec2 < 3.0, "cache is not slower than separating");

    // --- cancel in the middle (needs a slow-enough separation: reopen under a different cache folder)
    bc_destroy(p);
    p = bc_create(models.c_str(), "/tmp/stems_cache_cancel");
    bc_open_file(p, song.c_str()); waitReady(p, 300);
    bc_stems_start(p); sleepMs(30); bc_stems_cancel(p);
    ok(bc_stems_state(p) == 0 || bc_stems_state(p) == 2, "cancel returns to 'none' (or it had already finished)");
    ok(bc_open_file(p, song.c_str()) == 1, "the song can be opened again after a cancel");
    waitReady(p, 300);
    ok(bc_stems_state(p) == 0, "a new song starts with stems off");
    // reopening while separation runs must not hang
    bc_stems_start(p); sleepMs(20);
    auto t1 = steady_clock::now(); bc_unload(p);
    ok(duration<double>(steady_clock::now() - t1).count() < 15.0 && bc_stems_state(p) == 0, "unload while separating stops it without hanging");
    bc_destroy(p);
    printf(fails ? "\n%d FAILED\n" : "\nALL PASSED\n", fails);
    return fails ? 1 : 0;
}
