// Decodes audio files with miniaudio (implementation lives in miniaudio_impl.cpp).
#include "portable_path.h"
#include "../third_party/miniaudio.h"
#include "audio_file.h"

namespace beatcore {
std::vector<float> decodeAudioFile(const std::string& path, int channels, int sampleRate) {
    ma_decoder_config dc = ma_decoder_config_init(ma_format_f32, (ma_uint32)channels, (ma_uint32)sampleRate);
    ma_decoder dec;
#ifdef _WIN32
    if (ma_decoder_init_file_w(bcpath::make(path).c_str(), &dc, &dec) != MA_SUCCESS) return {};
#else
    if (ma_decoder_init_file(path.c_str(), &dc, &dec) != MA_SUCCESS) return {};
#endif
    std::vector<float> out, buf(65536 * channels);
    for (;;) {
        ma_uint64 got = 0;
        ma_decoder_read_pcm_frames(&dec, buf.data(), 65536, &got);
        if (got == 0) break;
        out.insert(out.end(), buf.begin(), buf.begin() + (size_t)got * channels);
    }
    ma_decoder_uninit(&dec);
    return out;
}
}
