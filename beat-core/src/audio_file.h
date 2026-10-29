// Decodes an audio file (mp3, wav, flac, ogg) to float PCM using miniaudio.
#pragma once
#include <string>
#include <vector>
namespace beatcore {
// Returns interleaved float samples at the requested rate/channels; empty on failure.
std::vector<float> decodeAudioFile(const std::string& path, int channels, int sampleRate);
}
