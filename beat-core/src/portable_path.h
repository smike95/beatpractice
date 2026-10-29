// UTF-8 path helpers so that file names with Cyrillic (or any non-ASCII) characters work on Windows.
// All paths inside beat-core are UTF-8 std::string; on Windows they must be converted to UTF-16 before use.
#pragma once
#include <cstdio>
#include <filesystem>
#include <string>
#include <system_error>

namespace bcpath {
inline std::filesystem::path make(const std::string& utf8) { return std::filesystem::u8path(utf8); }

inline FILE* open(const std::string& utf8, const char* mode) {
#ifdef _WIN32
    std::wstring m;
    for (const char* c = mode; *c; ++c) m.push_back((wchar_t)*c);
    return _wfopen(make(utf8).c_str(), m.c_str());
#else
    return std::fopen(utf8.c_str(), mode);
#endif
}

inline long fileSize(const std::string& utf8) {
    std::error_code ec;
    auto n = std::filesystem::file_size(make(utf8), ec);
    return ec ? 0 : (long)n;
}

inline void makeDir(const std::string& utf8) {
    std::error_code ec;
    std::filesystem::create_directories(make(utf8), ec);
}
}  // namespace bcpath
