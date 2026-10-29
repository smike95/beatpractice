// Runs the Beat This! network (ONNX Runtime) and hands the result to decodeBeatMap().
#include "portable_path.h"
#include "beat_analyzer.h"
#include <onnxruntime_cxx_api.h>
#include <algorithm>
#include <limits>
#include <stdexcept>

namespace beatcore {

struct BeatAnalyzer::Impl {
    AnalyzerConfig cfg;
    Ort::Env env{ORT_LOGGING_LEVEL_WARNING, "beatcore"};
    Ort::SessionOptions opts;
    std::unique_ptr<Ort::Session> mel, net;
};

BeatAnalyzer::BeatAnalyzer(const std::string& melPath, const std::string& netPath, const AnalyzerConfig& cfg)
    : impl_(new Impl) {
    impl_->cfg = cfg;
    impl_->opts.SetIntraOpNumThreads(2);
    impl_->opts.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
    // do not keep the memory used by the largest layers: it would stay allocated for as long as the model is loaded
    impl_->opts.DisableCpuMemArena();
    impl_->opts.DisableMemPattern();
    impl_->mel.reset(new Ort::Session(impl_->env, bcpath::make(melPath).c_str(), impl_->opts));
    impl_->net.reset(new Ort::Session(impl_->env, bcpath::make(netPath).c_str(), impl_->opts));
}
BeatAnalyzer::~BeatAnalyzer() = default;
const AnalyzerConfig& BeatAnalyzer::config() const { return impl_->cfg; }

Activations BeatAnalyzer::computeActivations(const float* mono, size_t numSamples, const std::function<void(float)>& progress) const {
    Ort::MemoryInfo mi = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);

    // 1) audio -> mel spectrogram [1, T, 128]
    std::vector<int64_t> ashape{1, (int64_t)numSamples};
    Ort::Value ain = Ort::Value::CreateTensor<float>(mi, const_cast<float*>(mono), numSamples, ashape.data(), ashape.size());
    const char* mi_names[] = {"audio_pcm"}; const char* mo_names[] = {"mel_spectrogram"};
    auto mout = impl_->mel->Run(Ort::RunOptions{nullptr}, mi_names, &ain, 1, mo_names, 1);
    auto mshape = mout[0].GetTensorTypeAndShapeInfo().GetShape();
    const int T = (int)mshape[1];
    const float* S = mout[0].GetTensorData<float>();

    Activations act;
    act.durationSec = (double)numSamples / kSampleRate;
    act.beat.assign(T, -1e9f); act.downbeat.assign(T, -1e9f);

    // 2) network on overlapping 30 s chunks
    const int CH = impl_->cfg.chunkFrames, B = impl_->cfg.chunkBorder, step = CH - 2 * B;
    const char* ni_names[] = {"spectrogram"}; const char* no_names[] = {"beat", "downbeat"};
    for (int s = 0; s < std::max(1, T - CH + step); s += step) {
        int e = std::min(T, s + CH), s0 = std::max(0, e - CH), len = e - s0;
        std::vector<int64_t> shape{1, len, 128};
        Ort::Value in = Ort::Value::CreateTensor<float>(mi, const_cast<float*>(S + (size_t)s0 * 128),
                                                        (size_t)len * 128, shape.data(), shape.size());
        auto out = impl_->net->Run(Ort::RunOptions{nullptr}, ni_names, &in, 1, no_names, 2);
        const float* b = out[0].GetTensorData<float>(); const float* d = out[1].GetTensorData<float>();
        int lo = (s0 == 0) ? 0 : B, hi = (e == T) ? len : len - B;
        for (int i = lo; i < hi; ++i) { act.beat[s0 + i] = b[i]; act.downbeat[s0 + i] = d[i]; }
        if (progress) progress(std::min(1.0f, (float)e / (float)T));
    }
    return act;
}

BeatMap BeatAnalyzer::analyze(const float* mono, size_t n) const {
    return decodeBeatMap(computeActivations(mono, n), impl_->cfg);
}

} // namespace beatcore
