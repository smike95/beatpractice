// Physical memory of the device in bytes (0 = unknown). Used to choose a memory-saving setup for the neural networks.
#pragma once
#include <cstdint>
#if defined(_WIN32)
  #define NOMINMAX
  #include <windows.h>
#elif defined(__APPLE__)
  #include <sys/sysctl.h>
#else
  #include <unistd.h>
#endif
namespace beatcore {
inline uint64_t physicalMemoryBytes() {
#if defined(_WIN32)
    MEMORYSTATUSEX s; s.dwLength = sizeof(s);
    return GlobalMemoryStatusEx(&s) ? (uint64_t)s.ullTotalPhys : 0;
#elif defined(__APPLE__)
    uint64_t v = 0; size_t n = sizeof(v);
    return sysctlbyname("hw.memsize", &v, &n, nullptr, 0) == 0 ? v : 0;
#else
    const long pages = sysconf(_SC_PHYS_PAGES), ps = sysconf(_SC_PAGESIZE);
    return pages > 0 && ps > 0 ? (uint64_t)pages * (uint64_t)ps : 0;
#endif
}
} // namespace beatcore
