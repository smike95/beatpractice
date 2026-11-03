// One JSON entry point to the whole player, for hosts that are not Rust (the Android app through JNI / a Capacitor plugin).
// The commands, their arguments and their results are exactly those of the Tauri commands of the desktop app (core_*), so the same
// user interface runs on both: bridgeCall(b, "core_snapshot", "{}") returns what the `core_snapshot` command returns.
//
//   result:  {"ok": <value>}   or   {"error": "text"}
#pragma once
#include <memory>
#include <string>

namespace beatcore {

class Bridge {
public:
    // modelDir: where the neural network models are (may be empty: only packs can then be opened); cacheDir: analysis results
    Bridge(const std::string& modelDir, const std::string& cacheDir);
    ~Bridge();
    std::string call(const std::string& command, const std::string& argsJson);   // thread-safe
    // phones: song as 16-bit samples, low-memory model loading
    void setLowMemory(bool on);
private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace beatcore

extern "C" {
void*       bc_bridge_new(const char* model_dir, const char* cache_dir, int low_memory);
// The returned text stays valid until the next call from the same thread.
const char* bc_bridge_call(void* bridge, const char* command, const char* args_json);
void        bc_bridge_free(void* bridge);
}
