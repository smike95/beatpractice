#include "portable_path.h"
#include "stem_separator.h"
#include <onnxruntime_cxx_api.h>
#include <algorithm>
#include <cstdlib>
#include <cmath>
#include <cstdio>
#include <cstring>

namespace beatcore {

std::vector<std::string> defaultSourceNames(int count) {
    if (count == 6) return {"drums", "bass", "other", "vocals", "guitar", "piano"};
    if (count == 4) return {"drums", "bass", "other", "vocals"};
    std::vector<std::string> n;
    for (int i = 0; i < count; ++i) n.push_back("source" + std::to_string(i + 1));
    return n;
}

struct StemSeparator::Impl {
    Ort::Env env{ORT_LOGGING_LEVEL_WARNING, "stems"};
    Ort::SessionOptions opts;
    std::unique_ptr<Ort::Session> sess;
    std::string inName, outName, err;
    bool half = false;
    int segment = 343980;                 // 7.8 s at 44.1 kHz (Demucs default) when the model accepts any length
    int S = 0;                            // number of sources
    std::vector<std::string> names;

    static bool pickLayout(int64_t d1, int64_t d2, int& S, bool& sourcesFirst) {
        auto isS = [](int64_t v) { return v == 4 || v == 6; };
        if (isS(d1) && (d2 == 2 || d2 < 0)) { S = (int)d1; sourcesFirst = true; return true; }
        if (isS(d2) && (d1 == 2 || d1 < 0)) { S = (int)d2; sourcesFirst = false; return true; }
        return false;
    }

    // One model call. in: planar [2][segment]. out: canonical [S][2][segment]. Fills S if it was unknown.
    bool run(const std::vector<float>& in, std::vector<float>& out) {
        Ort::MemoryInfo mi = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
        std::vector<int64_t> shape{1, 2, (int64_t)segment};
        const char* inN[] = {inName.c_str()};
        const char* outN[] = {outName.c_str()};
        std::vector<Ort::Value> res;
        std::vector<Ort::Float16_t> in16;
        if (half) {
            in16.resize(in.size());
            for (size_t i = 0; i < in.size(); ++i) in16[i] = Ort::Float16_t(in[i]);
            Ort::Value v = Ort::Value::CreateTensor<Ort::Float16_t>(mi, in16.data(), in16.size(), shape.data(), shape.size());
            res = sess->Run(Ort::RunOptions{nullptr}, inN, &v, 1, outN, 1);
        } else {
            Ort::Value v = Ort::Value::CreateTensor<float>(mi, const_cast<float*>(in.data()), in.size(), shape.data(), shape.size());
            res = sess->Run(Ort::RunOptions{nullptr}, inN, &v, 1, outN, 1);
        }
        auto osh = res[0].GetTensorTypeAndShapeInfo().GetShape();
        if (osh.size() != 4 || osh[3] != segment) { err = "unexpected model output shape"; return false; }
        int s = 0; bool sf = true;
        if (!pickLayout(osh[1], osh[2], s, sf)) { err = "model output is not [1,sources,2,N]"; return false; }
        if (S == 0) { S = s; names = defaultSourceNames(S); }
        if (s != S) { err = "model output changed size"; return false; }
        out.assign((size_t)S * 2 * segment, 0.f);
        const size_t T = (size_t)segment;
        auto at = [&](int src, int ch) -> size_t { return sf ? ((size_t)src * 2 + ch) * T : ((size_t)ch * S + src) * T; };
        if (half) {
            const Ort::Float16_t* p = res[0].GetTensorData<Ort::Float16_t>();
            for (int src = 0; src < S; ++src) for (int ch = 0; ch < 2; ++ch) {
                float* d = out.data() + ((size_t)src * 2 + ch) * T; const Ort::Float16_t* q = p + at(src, ch);
                for (size_t t = 0; t < T; ++t) d[t] = q[t].ToFloat();
            }
        } else {
            const float* p = res[0].GetTensorData<float>();
            for (int src = 0; src < S; ++src) for (int ch = 0; ch < 2; ++ch)
                std::memcpy(out.data() + ((size_t)src * 2 + ch) * T, p + at(src, ch), T * sizeof(float));
        }
        return true;
    }
};

StemSeparator::StemSeparator(const std::string& modelPath, bool lowMemory) : impl_(new Impl) {
    auto& m = *impl_;
    try {
        m.opts.SetIntraOpNumThreads(4);
        if (lowMemory) {
            // Optimising the graph while loading (constant folding, fusion) needs several GB for this model, more than a small computer or
            // a phone has. Without it the model loads with about 1 GB, and separating a song takes a little longer.
            m.opts.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_DISABLE_ALL);
            m.opts.DisableCpuMemArena(); m.opts.DisableMemPattern();
        } else m.opts.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
        m.sess.reset(new Ort::Session(m.env, bcpath::make(modelPath).c_str(), m.opts));
        if (m.sess->GetInputCount() != 1 || m.sess->GetOutputCount() != 1) {
            m.err = "unsupported model: it has " + std::to_string(m.sess->GetInputCount()) + " inputs and " +
                    std::to_string(m.sess->GetOutputCount()) + " outputs (need exactly 1 and 1: a model with the STFT inside)";
            return;
        }
        Ort::AllocatorWithDefaultOptions al;
        m.inName = m.sess->GetInputNameAllocated(0, al).get();
        m.outName = m.sess->GetOutputNameAllocated(0, al).get();
        auto inInfo = m.sess->GetInputTypeInfo(0);            // keep alive: ti only points into it
        auto ti = inInfo.GetTensorTypeAndShapeInfo();
        auto ish = ti.GetShape();
        auto et = ti.GetElementType();
        if (et == ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT16) m.half = true;
        else if (et != ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT) { m.err = "unsupported model input type"; return; }
        if (ish.size() != 3 || (ish[1] > 0 && ish[1] != 2)) { m.err = "unsupported model input: expected [1, 2, N]"; return; }
        if (ish[2] > 0) m.segment = (int)ish[2];
        auto outInfo = m.sess->GetOutputTypeInfo(0);
        auto osh = outInfo.GetTensorTypeAndShapeInfo().GetShape();
        if (osh.size() != 4) { m.err = "unsupported model output: expected [1, sources, 2, N]"; return; }
        bool sf = true; int s = 0;
        if (Impl::pickLayout(osh[1], osh[2], s, sf)) { m.S = s; m.names = defaultSourceNames(s); }
        else {                                            // dynamic shape: find out by running once
            std::vector<float> zeros((size_t)2 * m.segment, 0.f), out;
            if (!m.run(zeros, out) && m.err.empty()) m.err = "cannot determine the number of sources";
        }
    } catch (const std::exception& e) { m.err = e.what(); }
}
StemSeparator::~StemSeparator() = default;
bool StemSeparator::ok() const { return impl_->err.empty() && impl_->S > 0; }
const std::string& StemSeparator::error() const { return impl_->err; }
const std::vector<std::string>& StemSeparator::sourceNames() const { return impl_->names; }
int StemSeparator::segmentFrames() const { return impl_->segment; }

StemSet StemSeparator::separate(const float* Lc, const float* Rc, long T, uint32_t keepMask,
                                const std::function<bool(float)>& progress) const {
    StemSet set;
    auto& m = *impl_;
    if (!ok() || T <= 0) return set;
    const int S = m.S, L = m.segment, stride = (int)(L * 0.75);   // Demucs: 25 % overlap between segments

    // which tracks we produce
    std::vector<int> trackOf(S, -1); int K = 0;
    for (int s = 0; s < S; ++s) if (keepMask & (1u << s)) { trackOf[s] = K++; set.names.push_back(m.names[s]); }
    if (K == 0) return StemSet{};
    const int rest = (K < S) ? K : -1;
    if (rest >= 0) { for (int s = 0; s < S; ++s) if (trackOf[s] < 0) trackOf[s] = rest; set.names.push_back("rest"); }
    const int nTracks = K + (rest >= 0 ? 1 : 0);
    set.frames = T; set.sampleRate = 44100;
    set.pcm.assign(nTracks, std::vector<int16_t>((size_t)2 * T, 0));

    // normalise the whole song like Demucs does (zero mean, unit std of the mono mix)
    double sum = 0, sq = 0;
    for (long t = 0; t < T; ++t) { double v = 0.5 * (Lc[t] + Rc[t]); sum += v; sq += v * v; }
    const double mean = sum / T;
    double var = std::max(0.0, sq / T - mean * mean) * (T > 1 ? (double)T / (T - 1) : 1.0);
    const float sd = var > 1e-12 ? (float)std::sqrt(var) : 1.f;

    // triangular weights (Demucs: transition_power = 1)
    std::vector<float> w(L);
    { const int a = L / 2, b = L - L / 2; const float mx = (float)std::max(a, b);
      for (int t = 0; t < a; ++t) w[t] = (t + 1) / mx;
      for (int t = 0; t < b; ++t) w[a + t] = (b - t) / mx; }

    std::vector<float> acc((size_t)nTracks * 2 * L, 0.f), ws(L, 0.f), in((size_t)2 * L), out;
    const long nSeg = (T + stride - 1) / stride;
    for (long k = 0; k < nSeg; ++k) {
        const long off = k * stride;
        for (int t = 0; t < L; ++t) {
            long i = off + t;
            in[t] = i < T ? (float)((Lc[i] - mean) / sd) : 0.f;
            in[L + t] = i < T ? (float)((Rc[i] - mean) / sd) : 0.f;
        }
        if (!m.run(in, out)) return StemSet{};
        for (int s = 0; s < S; ++s) {
            const int tj = trackOf[s];
            for (int c = 0; c < 2; ++c) {
                float* a = acc.data() + ((size_t)tj * 2 + c) * L;
                const float* o = out.data() + ((size_t)s * 2 + c) * L;
                for (int t = 0; t < L; ++t) a[t] += w[t] * o[t];
            }
        }
        for (int t = 0; t < L; ++t) ws[t] += w[t];

        const bool last = (k == nSeg - 1);
        const long flushEnd = last ? T : (k + 1) * stride;
        const long count = flushEnd - off;
        for (int tj = 0; tj < nTracks; ++tj) for (int c = 0; c < 2; ++c) {
            const float* a = acc.data() + ((size_t)tj * 2 + c) * L;
            int16_t* dst = set.pcm[tj].data() + (size_t)c * T + off;
            for (long t = 0; t < count; ++t) {
                float v = a[t] / ws[t] * sd * 32767.f;
                v = std::max(-32768.f, std::min(32767.f, v));
                dst[t] = (int16_t)std::lrintf(v);
            }
        }
        if (!last) {                                          // slide the window: drop what has been written out
            for (int tj = 0; tj < nTracks; ++tj) for (int c = 0; c < 2; ++c) {
                float* a = acc.data() + ((size_t)tj * 2 + c) * L;
                std::memmove(a, a + stride, (size_t)(L - stride) * sizeof(float));
                std::fill(a + (L - stride), a + L, 0.f);
            }
            std::memmove(ws.data(), ws.data() + stride, (size_t)(L - stride) * sizeof(float));
            std::fill(ws.begin() + (L - stride), ws.end(), 0.f);
        }
        if (progress && !progress((float)(k + 1) / (float)nSeg)) return StemSet{};
    }
    return set;
}

} // namespace beatcore
