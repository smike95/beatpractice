// Offline test tool: plays a song through the PlaybackEngine into a WAV file.
//   render_cli song.mp3 --activations song.act --speed 0.8 --out out.wav [--start 30] [--seconds 40] [--no-metronome]
//              [--loop-a 20 --loop-b 30]  (snapped to bar starts)  [--count-in 1] [--count-in-loop]
// Prints the original-song time of every click it makes, so the result can be verified.
#include "../src/audio_file.h"
#include "../src/playback_engine.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

using namespace beatcore;

static void writeWav(const std::string& path, const std::vector<float>& x, int sr) {
    FILE* f = std::fopen(path.c_str(), "wb"); if (!f) return;
    uint32_t dataBytes = (uint32_t)(x.size() * 2), riff = 36 + dataBytes, fmtLen = 16, rate = sr, byteRate = sr * 4;
    uint16_t pcm = 1, ch = 2, align = 4, bits = 16;
    std::fwrite("RIFF", 1, 4, f); std::fwrite(&riff, 4, 1, f); std::fwrite("WAVEfmt ", 1, 8, f);
    std::fwrite(&fmtLen, 4, 1, f); std::fwrite(&pcm, 2, 1, f); std::fwrite(&ch, 2, 1, f); std::fwrite(&rate, 4, 1, f);
    std::fwrite(&byteRate, 4, 1, f); std::fwrite(&align, 2, 1, f); std::fwrite(&bits, 2, 1, f);
    std::fwrite("data", 1, 4, f); std::fwrite(&dataBytes, 4, 1, f);
    for (float v : x) { v = v > 1 ? 1 : (v < -1 ? -1 : v); int16_t s = (int16_t)(v * 32767); std::fwrite(&s, 2, 1, f); }
    std::fclose(f);
}

int main(int argc, char** argv) {
    std::string in, act, out = "out.wav"; double speed = 1.0, start = 0, seconds = 30, la = -1, lb = -1; bool met = true, ciLoop = false; int ci = 0;
    for (int i = 1; i < argc; ++i) {
        std::string a = argv[i]; auto nx = [&]() -> const char* { return i + 1 < argc ? argv[++i] : ""; };
        if (a == "--activations") act = nx(); else if (a == "--speed") speed = atof(nx());
        else if (a == "--out") out = nx(); else if (a == "--start") start = atof(nx());
        else if (a == "--seconds") seconds = atof(nx()); else if (a == "--no-metronome") met = false;
        else if (a == "--loop-a") la = atof(nx()); else if (a == "--loop-b") lb = atof(nx());
        else if (a == "--count-in") ci = atoi(nx()); else if (a == "--count-in-loop") ciLoop = true;
        else if (a[0] != '-') in = a;
    }
    const int sr = 44100;
    Activations ac; if (act.empty() || !ac.load(act)) { fprintf(stderr, "need --activations\n"); return 1; }
    BeatMap map = decodeBeatMap(ac, AnalyzerConfig{});
    std::vector<float> pcm = decodeAudioFile(in, 2, sr);
    if (pcm.empty()) { fprintf(stderr, "cannot decode %s\n", in.c_str()); return 2; }
    PlaybackEngine eng(sr);
    eng.setSong(std::move(pcm)); eng.setBeatMap(map); eng.setSpeed(speed);
    MetronomeSettings ms; ms.enabled = met; eng.setMetronome(ms);
    if (la >= 0 && lb > la) {
        double sa = eng.snapToBar(la), sb = eng.snapToBar(lb);
        eng.setLoop(sa, sb); fprintf(stderr, "loop %.3f .. %.3f s\n", sa, sb);
        if (start < sa) start = sa;
    }
    CountInSettings cs; cs.bars = ci; cs.everyLoopRestart = ciLoop; eng.setCountIn(cs);
    eng.seekSeconds(start); eng.play();
    const long total = (long)(seconds * sr);
    std::vector<float> res; res.reserve(total * 2);
    std::vector<float> blk(2 * 441);
    while ((long)res.size() / 2 < total && eng.isPlaying()) {
        eng.render(blk.data(), 441);
        res.insert(res.end(), blk.begin(), blk.end());
    }
    writeWav(out, res, sr);
    if (la >= 0 || ci > 0) { printf("{}\n"); return 0; }
    // expected click positions in the OUTPUT file (seconds from its start), for verification
    printf("{\"speed\":%.4f,\"start\":%.3f,\"clicks\":[", speed, start);
    bool first = true;
    for (size_t i = 0; i < map.beats.size(); ++i) {
        if ((int)i < map.playFirstBeat || (int)i > map.playLastBeat || map.beats[i] < start) continue;
        double t = (map.beats[i] - start) / speed;
        if (t * sr >= (double)res.size() / 2) break;
        printf("%s[%.4f,%d]", first ? "" : ",", t, map.posInBar[i]); first = false;
    }
    printf("]}\n");
    return 0;
}
