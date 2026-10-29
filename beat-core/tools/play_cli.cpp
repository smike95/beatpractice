// Terminal player for testing the sound output on a real machine (no Flutter needed).
//   play_cli song.mp3 --models models --cache cache
// Keys:  space play/pause   [ ] speed -/+ 5%   m metronome on/off   a accent on/off   c count-in 0/1/2 bars
//        z set loop start (nearest bar)  x set loop end (nearest bar)  v clear loop   , . back/forward one bar   q quit
#include "../src/player.h"
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <termios.h>
#include <thread>
#include <unistd.h>
#include <sys/select.h>
using namespace beatcore;

struct RawTerm { termios old; bool ok = false;
    RawTerm() { if (isatty(0) && tcgetattr(0, &old) == 0) { termios t = old; t.c_lflag &= ~(ICANON | ECHO); tcsetattr(0, TCSANOW, &t); ok = true; } }
    ~RawTerm() { if (ok) tcsetattr(0, TCSANOW, &old); } };
static int readKey() { fd_set f; FD_ZERO(&f); FD_SET(0, &f); timeval tv{0, 50000};
    if (select(1, &f, nullptr, nullptr, &tv) > 0) { char c; if (read(0, &c, 1) == 1) return c; } return -1; }

int main(int argc, char** argv) {
    std::string in, models = "models", cache = "cache"; double start = -1; double speed = 1;
    for (int i = 1; i < argc; ++i) { std::string a = argv[i];
        if (a == "--models" && i + 1 < argc) models = argv[++i]; else if (a == "--cache" && i + 1 < argc) cache = argv[++i];
        else if (a == "--speed" && i + 1 < argc) speed = atof(argv[++i]); else if (a[0] != '-') in = a; }
    if (in.empty()) { fprintf(stderr, "usage: play_cli song.mp3 --models models --cache cache\n"); return 1; }
    Player p(models, cache);
    p.openFile(in);
    while (p.state() == PlayerState::Decoding || p.state() == PlayerState::Analyzing) {
        printf("\r%s %3d%%   ", p.state() == PlayerState::Decoding ? "decoding " : "analyzing", (int)(p.progress() * 100)); fflush(stdout);
        std::this_thread::sleep_for(std::chrono::milliseconds(200)); }
    if (p.state() != PlayerState::Ready) { printf("\nerror: %s\n", p.error().c_str()); return 2; }
    auto map = p.beatMap();
    printf("\nready%s: %.1f BPM, %zu beats, play range %.1f..%.1f s\n", p.fromCache() ? " (analysis from cache)" : "", p.songBpm(), map->beats.size(),
           map->beats[map->playFirstBeat], map->beats[map->playLastBeat]);
    p.setSpeed(speed);
    CountInSettings ci; ci.bars = 0; MetronomeSettings ms; double loopA = -1; int ciBars = 0;
    RawTerm term;
    if (!term.ok) printf("(not a terminal: playing for 15 s)\n");
    auto t0 = std::chrono::steady_clock::now();
    for (;;) {
        int k = readKey();
        if (k == 27) { while (readKey() != -1) {} k = -1; }   // ignore arrow keys and other escape sequences
        if (k == 'q') break;
        if (k == ' ') { p.isPlaying() ? p.pause() : p.play(); }
        else if (k == '[') p.setSpeed(std::max(0.25, p.speed() - 0.05));
        else if (k == ']') p.setSpeed(std::min(2.0, p.speed() + 0.05));
        else if (k == 'm') { ms.enabled = !ms.enabled; p.setMetronome(ms); }
        else if (k == 'a') { ms.accentFirstBeat = !ms.accentFirstBeat; p.setMetronome(ms); }
        else if (k == 'c') { ciBars = (ciBars + 1) % 3; ci.bars = ciBars; p.setCountIn(ci); }
        else if (k == 'z') { loopA = p.snapToBar(p.positionSeconds()); }
        else if (k == 'x' && loopA >= 0) { double b = p.snapToBar(p.positionSeconds()); if (p.setLoop(loopA, b)) {} }
        else if (k == 'v') { p.clearLoop(); loopA = -1; }
        else if (k == ',' || k == '.') { BeatInfo bi = p.currentBeat(); double t = p.positionSeconds(); double bar = 60.0 / std::max(1.0, p.songBpm()) * std::max(1, bi.barLength);
            p.seekSeconds(std::max(0.0, p.snapToBar(t + (k == '.' ? bar : -bar)))); }
        BeatInfo bi = p.currentBeat();
        printf("\r%s pos %6.1fs  x%.2f (%.0f BPM)  beat %d/%d  metro %s accent %s count-in %d%s%s   ", p.isPlaying() ? (p.isCountingIn() ? "COUNT" : "PLAY ") : "PAUSE",
               p.positionSeconds(), p.speed(), p.songBpm() * p.speed(), bi.posInBar, bi.barLength, ms.enabled ? "on " : "off", ms.accentFirstBeat ? "on " : "off", ciBars,
               p.loopEnabled() ? "  LOOP" : (loopA >= 0 ? "  A set" : ""), "");
        fflush(stdout);
        if (!term.ok) { if (!p.isPlaying() && std::chrono::steady_clock::now() - t0 > std::chrono::seconds(1)) p.play();
            if (std::chrono::steady_clock::now() - t0 > std::chrono::seconds(15)) break; }
    }
    printf("\n");
    return 0;
}
