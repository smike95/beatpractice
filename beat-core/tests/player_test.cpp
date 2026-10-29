// Integration test of Player + C API using a "null" sound device (no sound card needed; runs in real time).
//   BEATCORE_NULL_AUDIO=1 ./player_test song.mp3 models cache
#include "../src/beat_core_c.h"
#include <chrono>
#include <cmath>
#include <cstdio>
#include <thread>
#include <vector>
static int fails = 0;
#ifdef __linux__
#include <fstream>
#include <string>
static long statusKB(const char* key) { std::ifstream f("/proc/self/status"); std::string l; while (std::getline(f, l)) if (l.rfind(key, 0) == 0) return std::stol(l.substr(std::string(key).size() + 1)); return 0; }
static void rssMB(const char* when) { printf("  memory %-28s now %5ld MB, peak so far %5ld MB\n", when, statusKB("VmRSS") / 1024, statusKB("VmHWM") / 1024); }
#else
static void rssMB(const char*) {}
#endif
static void ok(bool c, const char* what) { printf("%-60s %s\n", what, c ? "PASS" : "FAIL"); if (!c) ++fails; }
static void sleepMs(int ms) { std::this_thread::sleep_for(std::chrono::milliseconds(ms)); }
int main(int argc, char** argv) {
    if (argc < 4) { fprintf(stderr, "usage: player_test song.mp3 models cache\n"); return 1; }
    bc_player* p = bc_create(argv[2], argv[3]);
    ok(p != nullptr, "create player");
    ok(bc_open_file(p, argv[1]) == 1, "open file starts");
    ok(bc_open_file(p, argv[1]) == 0, "second open while busy is refused");
    int seen[5] = {0}; float lastProg = 0; bool monotonic = true;
    auto t0 = std::chrono::steady_clock::now();
    while (bc_state(p) != BC_READY && bc_state(p) != BC_ERROR) {
        seen[bc_state(p)] = 1; float g = bc_progress(p); if (g + 1e-6f < lastProg) monotonic = false; lastProg = g; sleepMs(100);
        if (std::chrono::steady_clock::now() - t0 > std::chrono::seconds(300)) break;
    }
    printf("  (loading took %.1f s, from cache: %d)\n", std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count(), bc_from_cache(p));
    rssMB("when READY");
    sleepMs(8000); rssMB("8 s after READY");
    ok(bc_state(p) == BC_READY, "reaches READY"); if (bc_state(p) != BC_READY) { printf("  error: %s\n", bc_error(p)); return 1; }
    ok(monotonic, "progress never goes backwards");
    double bpm = bc_song_bpm(p), dur = bc_duration(p);
    printf("  song %.1f s, %.2f BPM, %d beats\n", dur, bpm, bc_beat_count(p));
    ok(bpm > 40 && bpm < 240 && dur > 10, "sane tempo and duration");
    int n = bc_beat_count(p); std::vector<double> t(n); std::vector<int> pos(n), len(n);
    ok(bc_get_beats(p, t.data(), pos.data(), len.data(), n) == n, "beat map readable");

    bc_set_speed(p, 0.8); bc_set_metronome(p, 1, 0.8f, 1); bc_set_count_in(p, 0, 0);
    bc_seek(p, 30.0); bc_play(p); sleepMs(3000);
    double p1 = bc_position(p); bc_pause(p); sleepMs(300); double p2 = bc_position(p); sleepMs(500); double p3 = bc_position(p);
    printf("  after 3 s of playing at 0.8x from 30 s: position %.2f s (expect ~32.4)\n", p1);
    ok(std::fabs(p1 - 32.4) < 0.5, "position advances at the chosen speed");
    ok(std::fabs(p3 - p2) < 0.01, "position holds while paused");
    ok(bc_is_playing(p) == 0, "reports paused");

    bc_set_count_in(p, 1, 0);
    double target = bc_snap_to_bar(p, 40.0); bc_seek(p, target);
    auto tp = std::chrono::steady_clock::now(); bc_play(p); sleepMs(300);
    ok(bc_is_counting_in(p) == 1, "count-in is running right after play");
    while (bc_is_counting_in(p) && std::chrono::steady_clock::now() - tp < std::chrono::seconds(10)) sleepMs(5);
    double cin = std::chrono::duration<double>(std::chrono::steady_clock::now() - tp).count();
    double expectCin = 4 * 60.0 / bpm / 0.8;
    printf("  count-in lasted %.2f s (expected %.2f s)\n", cin, expectCin);
    ok(std::fabs(cin - expectCin) < 0.25, "count-in length matches 1 bar at the chosen speed");
    sleepMs(1000); double afterCount = bc_position(p); bc_pause(p);
    printf("  1 s after the count-in the song is at %.2f s (started at %.2f s, expect +0.8)\n", afterCount, target);
    ok(std::fabs(afterCount - (target + 0.8)) < 0.3, "song starts at the right place after the count-in");

    bc_set_count_in(p, 0, 0);
    double a = bc_snap_to_bar(p, 50.0), b = bc_snap_to_bar(p, 58.0);
    ok(bc_set_loop(p, a, b) == 1 && bc_loop_enabled(p) == 1, "loop set");
    bc_seek(p, a); bc_play(p); sleepMs(14000); double lp = bc_position(p); bc_pause(p);
    printf("  loop %.2f..%.2f s, after 14 s position %.2f s\n", a, b, lp);
    ok(std::fabs(lp - (a + (14.0 - (b - a) / 0.8) * 0.8)) < 0.3, "after 14 s the loop has wrapped once, position as predicted");
    bc_clear_loop(p); ok(bc_loop_enabled(p) == 0, "loop cleared");
    int bi, ps, ln; bc_seek(p, 60.0); sleepMs(200); bc_play(p); sleepMs(300); bc_pause(p);
    ok(bc_current_beat(p, &bi, &ps, &ln) == 1 && ps >= 1 && ps <= ln, "current beat info valid");
    bc_unload(p);
    ok(bc_state(p) == BC_IDLE && bc_duration(p) == 0.0 && bc_beat_count(p) == 0, "unload empties the player");
    ok(bc_open_file(p, argv[1]) == 1, "open again after unload");
    t0 = std::chrono::steady_clock::now();
    while (bc_state(p) != BC_READY && bc_state(p) != BC_ERROR && std::chrono::steady_clock::now() - t0 < std::chrono::seconds(120)) sleepMs(50);
    ok(bc_state(p) == BC_READY && bc_from_cache(p) == 1 && bc_duration(p) > 10, "reopened from cache");
    bc_destroy(p);
    ok(true, "destroy without crash");
    printf(fails ? "PLAYER TEST FAILED\n" : "PLAYER TEST PASSED\n");
    return fails ? 1 : 0;
}
