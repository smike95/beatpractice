// Turns network probabilities into a steady beat grid and bar structure. No neural network here.
#include "portable_path.h"
#include "beat_analyzer.h"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <limits>

namespace beatcore {
namespace {

inline double sigmoid(double x) { return 1.0 / (1.0 + std::exp(-x)); }

// same as scipy.ndimage.gaussian_filter1d(sigma=1.0, mode='reflect', truncate=4)
std::vector<double> gaussianSmooth(const std::vector<double>& x, double sigma = 1.0) {
    const int r = (int)(4.0 * sigma + 0.5);
    std::vector<double> k(2 * r + 1);
    double sum = 0;
    for (int i = -r; i <= r; ++i) { k[i + r] = std::exp(-0.5 * i * i / (sigma * sigma)); sum += k[i + r]; }
    for (auto& v : k) v /= sum;
    const int n = (int)x.size();
    std::vector<double> y(n, 0.0);
    for (int i = 0; i < n; ++i) {
        double s = 0;
        for (int j = -r; j <= r; ++j) {
            int idx = i + j;
            if (idx < 0) idx = -idx - 1;
            if (idx >= n) idx = 2 * n - idx - 1;
            idx = std::max(0, std::min(n - 1, idx));
            s += k[j + r] * x[idx];
        }
        y[i] = s;
    }
    return y;
}

// coarse global beat period (seconds) from autocorrelation of the beat probability
double globalPeriod(const std::vector<float>& beatLogit, const AnalyzerConfig& cfg) {
    const int n = (int)beatLogit.size();
    std::vector<double> p(n);
    for (int i = 0; i < n; ++i) p[i] = sigmoid(beatLogit[i]);
    std::vector<double> x = gaussianSmooth(p);
    double mean = 0; for (double v : x) mean += v; mean /= std::max(1, n);
    for (double& v : x) v -= mean;
    const int lagLo = (int)std::ceil(cfg.minPeriodSec * kFrameRate - 1e-9);
    const int lagHi = std::min((int)std::floor(cfg.maxPeriodSec * kFrameRate + 1e-9), n - 1);
    std::vector<double> ac(lagHi + 2, 0.0);
    double best = -std::numeric_limits<double>::infinity();
    for (int lag = lagLo; lag <= lagHi; ++lag) {
        double s = 0;
        for (int i = 0; i + lag < n; ++i) s += x[i] * x[i + lag];
        ac[lag] = s; best = std::max(best, s);
    }
    // multiples of the true beat period (2x, 3x ...) score almost as high as the beat itself,
    // so take the FASTEST clear peak, not simply the highest one
    int bestLag = lagLo;
    for (int lag = lagLo; lag <= lagHi; ++lag) {
        bool peak = (lag == lagLo || ac[lag] >= ac[lag - 1]) && (lag == lagHi || ac[lag] >= ac[lag + 1]);
        if (peak && ac[lag] >= cfg.fasterPeakRatio * best) { bestLag = lag; break; }
    }
    return bestLag / kFrameRate;
}

// Local beat period (seconds) for every frame: the autocorrelation is measured in a sliding window and the
// result follows the previous window, so a tempo change is tracked instead of being forced to the global tempo.
std::vector<double> localPeriods(const std::vector<float>& beatLogit, double globalP, const AnalyzerConfig& cfg) {
    const int n = (int)beatLogit.size();
    std::vector<double> flat(n, globalP);
    if (!cfg.localTempo) return flat;
    std::vector<double> p(n);
    for (int i = 0; i < n; ++i) p[i] = sigmoid(beatLogit[i]);
    std::vector<double> x = gaussianSmooth(p);
    double mean = 0; for (double v : x) mean += v; mean /= std::max(1, n);
    for (double& v : x) v -= mean;
    const int W = std::max(100, (int)(cfg.localWindowSec * kFrameRate)), H = std::max(10, (int)(cfg.localHopSec * kFrameRate));
    const int lagLo = (int)std::ceil(cfg.minPeriodSec * kFrameRate - 1e-9);
    const int lagHi = std::min((int)std::floor(cfg.maxPeriodSec * kFrameRate + 1e-9), W / 2);
    if (n < W || lagHi <= lagLo) return flat;

    std::vector<double> centers, pers;
    double prev = globalP * kFrameRate;                                   // in frames
    for (int c0 = W / 2; ; c0 += H) {
        int c = std::min(c0, n - W / 2);
        const int a = c - W / 2, b = c + W / 2;
        std::vector<double> ac(lagHi + 2, 0.0);
        double best = -std::numeric_limits<double>::infinity();
        for (int lag = lagLo; lag <= lagHi; ++lag) {
            double s = 0; for (int i = a; i + lag < b; ++i) s += x[i] * x[i + lag];
            ac[lag] = s; best = std::max(best, s);
        }
        // candidates: clear peaks; choose the one nearest (in log scale) to the previous window's tempo
        double pick = -1, bestDist = 1e9;
        for (int lag = lagLo; lag <= lagHi; ++lag) {
            bool peak = (lag == lagLo || ac[lag] >= ac[lag - 1]) && (lag == lagHi || ac[lag] >= ac[lag + 1]);
            if (!peak || ac[lag] < 0.55 * best || best <= 0) continue;
            // parabolic refinement of the peak position
            double l = lag;
            if (lag > lagLo && lag < lagHi) { double d = ac[lag-1] - 2 * ac[lag] + ac[lag+1]; if (d < 0) l += 0.5 * (ac[lag-1] - ac[lag+1]) / d; }
            double dist = std::fabs(std::log(l / prev));
            if (dist < bestDist) { bestDist = dist; pick = l; }
        }
        if (pick < 0) pick = prev;
        prev = pick;
        centers.push_back(c); pers.push_back(pick / kFrameRate);
        if (c >= n - W / 2) break;
    }
    // steady songs keep the single global period, exactly as before
    bool steady = true;
    for (double v : pers) if (std::fabs(v / globalP - 1.0) > cfg.localSteadyTolerance) steady = false;
    if (steady) return flat;
    // median of 3 against single outliers, then interpolate between window centres (log scale)
    std::vector<double> sm(pers);
    for (size_t i = 1; i + 1 < pers.size(); ++i) { double a = pers[i-1], b = pers[i], d = pers[i+1]; sm[i] = std::max(std::min(a, b), std::min(std::max(a, b), d)); }
    std::vector<double> out(n);
    size_t k = 0;
    for (int t = 0; t < n; ++t) {
        while (k + 1 < centers.size() && centers[k + 1] <= t) ++k;
        if (t <= centers.front()) out[t] = sm.front();
        else if (k + 1 >= centers.size()) out[t] = sm.back();
        else { double f = (t - centers[k]) / (centers[k+1] - centers[k]); out[t] = std::exp((1 - f) * std::log(sm[k]) + f * std::log(sm[k+1])); }
    }
    return out;
}

// chain of beats that keeps an even spacing (dynamic programming); fills gaps with a steady ruler
std::vector<int> beatChain(const std::vector<float>& beatLogit, const std::vector<double>& periodSec, const AnalyzerConfig& cfg) {
    const int n = (int)beatLogit.size();
    std::vector<double> p(n);
    for (int i = 0; i < n; ++i) p[i] = sigmoid(beatLogit[i]);
    std::vector<double> act = gaussianSmooth(p);
    std::vector<double> score(act);
    std::vector<int> prev(n, -1);
    int hiMax = 0;
    for (int t = 0; t < n; ++t) {
        const double P = periodSec[t] * kFrameRate;
        const int lo = std::max(1, (int)(cfg.chainMinRatio * P)), hi = (int)(cfg.chainMaxRatio * P) + 1;
        hiMax = std::max(hiMax, hi);
        double bestV = -std::numeric_limits<double>::infinity(); int bestC = -1;
        for (int k = lo; k <= hi; ++k) {
            int c = t - k; if (c < 0) continue;
            double l = std::log(k / P);
            double v = score[c] - cfg.chainTightness * l * l / P;
            if (v > bestV) { bestV = v; bestC = c; }
        }
        if (bestC >= 0 && bestV > 0) { score[t] = act[t] + bestV; prev[t] = bestC; }
    }
    if (n < hiMax) return {};
    int t = n - hiMax; double bs = score[t];
    for (int i = n - hiMax; i < n; ++i) if (score[i] > bs) { bs = score[i]; t = i; }
    std::vector<int> path{t};
    while (prev[t] >= 0) { t = prev[t]; path.push_back(t); }
    std::reverse(path.begin(), path.end());
    return path;
}

struct BarState { int a, b, p; };   // a = previous bar length, b = current bar length, p = position in current bar

// most likely bar structure: alternating bar lengths (4,3,4,3) are cheap, isolated changes are expensive
std::vector<std::pair<int,int>> barStructure(const std::vector<int>& frames, const std::vector<float>& downLogit,
                                             const AnalyzerConfig& cfg) {
    const int nB = (int)frames.size(), nF = (int)downLogit.size();
    std::vector<double> ld(nB), lnd(nB);
    for (int i = 0; i < nB; ++i) {
        int f0 = std::max(0, frames[i] - 2), f1 = std::min(nF, frames[i] + 3);
        float m = -1e30f; for (int f = f0; f < f1; ++f) m = std::max(m, downLogit[f]);
        double pr = sigmoid(m);
        ld[i] = std::log(pr + 1e-6); lnd[i] = std::log(1.0 - pr + 1e-6);
    }
    const auto& Ns = cfg.barLengths;
    auto lenCost = [&](int N) { return N == 4 ? 0.0 : (N == 3 ? cfg.costLength3 : (N == 2 ? cfg.costLength2 : cfg.costLengthOther)); };
    std::vector<BarState> S;
    for (int a : Ns) for (int b : Ns) for (int p = 1; p <= b; ++p) S.push_back({a, b, p});
    auto idx = [&](int a, int b, int p) {
        for (size_t i = 0; i < S.size(); ++i) if (S[i].a == a && S[i].b == b && S[i].p == p) return (int)i;
        return -1;
    };
    const int ns = (int)S.size();
    const double NEG = -1e9;
    std::vector<std::vector<double>> V(nB, std::vector<double>(ns, NEG));
    std::vector<std::vector<int>> bp(nB, std::vector<int>(ns, 0));
    for (int i = 0; i < ns; ++i)
        if (S[i].a == S[i].b) V[0][i] = (S[i].p == 1 ? ld[0] : lnd[0]) - lenCost(S[i].b);
    for (int t = 1; t < nB; ++t) {
        for (int i = 0; i < ns; ++i) {
            const auto& s = S[i];
            double em = (s.p == 1) ? ld[t] : lnd[t];
            if (s.p > 1) { int j = idx(s.a, s.b, s.p - 1); V[t][i] = V[t-1][j] + em; bp[t][i] = j; }
            else {
                double best = NEG; int bj = 0;
                for (int a2 : Ns) {
                    int j = idx(a2, s.a, s.a);                 // previous bar (length s.a) just finished
                    double c = (s.b == s.a) ? 0.0 : (s.b == a2 ? cfg.alternationPenalty
                                                              : cfg.meterChangePenalty + lenCost(s.b));
                    double v = V[t-1][j] - c;
                    if (v > best) { best = v; bj = j; }
                }
                V[t][i] = best + em; bp[t][i] = bj;
            }
        }
    }
    int cur = 0; for (int i = 1; i < ns; ++i) if (V[nB-1][i] > V[nB-1][cur]) cur = i;
    std::vector<int> seq{cur};
    for (int t = nB - 1; t > 0; --t) { cur = bp[t][cur]; seq.push_back(cur); }
    std::reverse(seq.begin(), seq.end());
    std::vector<std::pair<int,int>> out;
    for (int i : seq) out.push_back({S[i].b, S[i].p});
    return out;
}

} // namespace

BeatMap decodeBeatMap(const Activations& a, const AnalyzerConfig& cfg) {
    BeatMap m; m.durationSec = a.durationSec;
    if (a.beat.size() < 200 || a.beat.size() != a.downbeat.size()) return m;
    m.periodSec = globalPeriod(a.beat, cfg);
    std::vector<int> fr = beatChain(a.beat, localPeriods(a.beat, m.periodSec, cfg), cfg);
    if (fr.size() < 8) return m;
    auto st = barStructure(fr, a.downbeat, cfg);
    for (size_t i = 0; i < fr.size(); ++i) {
        m.beats.push_back(fr[i] / kFrameRate);
        m.barLength.push_back(st[i].first); m.posInBar.push_back(st[i].second);
    }
    // metronome range: from the first bar that opens a run of equal strong bars, to the last strong bar
    std::vector<int> starts;
    for (size_t i = 0; i < fr.size(); ++i) if (m.posInBar[i] == 1) starts.push_back((int)i);
    starts.push_back((int)fr.size());
    const int nb = (int)starts.size() - 1;
    std::vector<char> strong(nb, 0);
    for (int k = 0; k < nb; ++k) {
        bool ok = true;
        for (int i = starts[k]; i < starts[k+1]; ++i) {
            int f = std::min(fr[i], (int)a.beat.size() - 1);
            if (sigmoid(a.beat[f]) < cfg.strongBeatThreshold) { ok = false; break; }
        }
        strong[k] = ok;
    }
    int first = -1, last = -1;
    for (int k = 0; k + cfg.stableBars <= nb && first < 0; ++k) {
        bool ok = true;
        for (int j = 0; j < cfg.stableBars; ++j)
            if (!strong[k+j] || m.barLength[starts[k+j]] != m.barLength[starts[k]]) ok = false;
        if (ok) first = k;
    }
    for (int k = nb - 1; k >= 0; --k) if (strong[k]) { last = k; break; }
    if (first >= 0 && last >= first) { m.playFirstBeat = starts[first]; m.playLastBeat = starts[last+1] - 1; }

    // precise average tempo: beats are 20 ms apart in time resolution, so use the whole playing range, not one spacing
    int i0 = m.playFirstBeat >= 0 ? m.playFirstBeat : 0;
    int i1 = m.playLastBeat  >= 0 ? m.playLastBeat  : (int)m.beats.size() - 1;
    if (i1 > i0) m.bpm = 60.0 * (i1 - i0) / (m.beats[i1] - m.beats[i0]);
    return m;
}

bool Activations::save(const std::string& path) const {
    FILE* f = bcpath::open(path, "wb"); if (!f) return false;
    int n = (int)beat.size();
    std::fwrite(&durationSec, sizeof durationSec, 1, f); std::fwrite(&n, sizeof n, 1, f);
    std::fwrite(beat.data(), sizeof(float), n, f); std::fwrite(downbeat.data(), sizeof(float), n, f);
    std::fclose(f); return true;
}
bool Activations::load(const std::string& path) {
    FILE* f = bcpath::open(path, "rb"); if (!f) return false;
    int n = 0;
    bool ok = std::fread(&durationSec, sizeof durationSec, 1, f) == 1 && std::fread(&n, sizeof n, 1, f) == 1 && n > 0 && n < 10000000;
    if (ok) { beat.resize(n); downbeat.resize(n);
        ok = std::fread(beat.data(), sizeof(float), n, f) == (size_t)n && std::fread(downbeat.data(), sizeof(float), n, f) == (size_t)n; }
    std::fclose(f); return ok;
}

} // namespace beatcore
