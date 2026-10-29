// Command-line tool: analyze a song and print the beat map as JSON.
//   analyze_cli song.mp3 --mel models/mel_spectrogram.onnx --model models/beat_this.onnx [options]
// Tuning without re-running the network:
//   analyze_cli song.mp3 ... --dump-activations song.act     (once)
//   analyze_cli --activations song.act --switch-penalty 4    (instant)
#include "../src/audio_file.h"
#include "../src/beat_analyzer.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <sstream>

using namespace beatcore;

int main(int argc, char** argv) {
    std::string input, mel, model, actIn, actOut;
    AnalyzerConfig cfg;
    for (int i = 1; i < argc; ++i) {
        std::string a = argv[i];
        auto next = [&]() -> const char* { return (i + 1 < argc) ? argv[++i] : ""; };
        if (a == "--mel") mel = next();
        else if (a == "--model") model = next();
        else if (a == "--activations") actIn = next();
        else if (a == "--dump-activations") actOut = next();
        else if (a == "--switch-penalty") cfg.meterChangePenalty = atof(next());
        else if (a == "--alternation-penalty") cfg.alternationPenalty = atof(next());
        else if (a == "--cost3") cfg.costLength3 = atof(next());
        else if (a == "--no-local-tempo") cfg.localTempo = false;
        else if (a == "--cost-other") cfg.costLengthOther = atof(next());
        else if (a == "--cost2") cfg.costLength2 = atof(next());
        else if (a == "--tightness") cfg.chainTightness = atof(next());
        else if (a == "--strong") cfg.strongBeatThreshold = atof(next());
        else if (a == "--stable-bars") cfg.stableBars = atoi(next());
        else if (a == "--bar-lengths") { cfg.barLengths.clear(); std::stringstream ss(next()); std::string t;
                                          while (std::getline(ss, t, ',')) cfg.barLengths.push_back(atoi(t.c_str())); }
        else if (a[0] != '-') input = a;
    }
    Activations act;
    if (!actIn.empty()) {
        if (!act.load(actIn)) { fprintf(stderr, "cannot read %s\n", actIn.c_str()); return 2; }
    } else {
        if (input.empty() || mel.empty() || model.empty()) {
            fprintf(stderr, "usage: analyze_cli song.mp3 --mel mel_spectrogram.onnx --model beat_this.onnx\n"); return 1; }
        std::vector<float> pcm = decodeAudioFile(input, 1, kSampleRate);
        if (pcm.empty()) { fprintf(stderr, "cannot decode %s\n", input.c_str()); return 2; }
        BeatAnalyzer an(mel, model, cfg);
        act = an.computeActivations(pcm.data(), pcm.size());
        if (!actOut.empty()) act.save(actOut);
    }
    BeatMap m = decodeBeatMap(act, cfg);
    printf("{\"duration\":%.3f,\"periodSec\":%.4f,\"bpm\":%.2f,\"playFirstBeat\":%d,\"playLastBeat\":%d,\n\"beats\":[",
           m.durationSec, m.periodSec, m.bpm, m.playFirstBeat, m.playLastBeat);
    for (size_t i = 0; i < m.beats.size(); ++i) printf("%s%.3f", i ? "," : "", m.beats[i]);
    printf("],\n\"barLength\":["); for (size_t i = 0; i < m.beats.size(); ++i) printf("%s%d", i ? "," : "", m.barLength[i]);
    printf("],\n\"pos\":[");       for (size_t i = 0; i < m.beats.size(); ++i) printf("%s%d", i ? "," : "", m.posInBar[i]);
    printf("]}\n");
    return 0;
}
