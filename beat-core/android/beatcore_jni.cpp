// JNI glue for the Android app: the Kotlin object `app.beatpractice.BeatCoreNative` (see ../../BeatPractice/android-plugin) calls these.
// It is only three functions: make the bridge, call a command with JSON, free it. Everything else is in bridge.cpp.
// Text travels as UTF-8 byte arrays, not as jstring: JNI strings are "modified UTF-8", which cannot hold emoji (and other characters outside
// the basic plane) that may be in file names and titles.
#include "../src/bridge.h"
#include <jni.h>
#include <string>

namespace {
std::string bytes(JNIEnv* env, jbyteArray a) {
    if (!a) return std::string();
    const jsize n = env->GetArrayLength(a);
    std::string s((size_t)n, '\0');
    if (n > 0) env->GetByteArrayRegion(a, 0, n, reinterpret_cast<jbyte*>(&s[0]));
    return s;
}
jbyteArray toArray(JNIEnv* env, const char* s) {
    const jsize n = (jsize)std::char_traits<char>::length(s);
    jbyteArray a = env->NewByteArray(n);
    if (a && n > 0) env->SetByteArrayRegion(a, 0, n, reinterpret_cast<const jbyte*>(s));
    return a;
}
}

extern "C" {

// Returns the handle (0 if it could not be made).
JNIEXPORT jlong JNICALL Java_app_beatpractice_BeatCoreNative_bridgeNew(JNIEnv* env, jclass, jbyteArray modelDir, jbyteArray cacheDir, jboolean lowMemory) {
    return reinterpret_cast<jlong>(bc_bridge_new(bytes(env, modelDir).c_str(), bytes(env, cacheDir).c_str(), lowMemory ? 1 : 0));
}

// Returns {"ok": ...} or {"error": "..."} as UTF-8 JSON.
JNIEXPORT jbyteArray JNICALL Java_app_beatpractice_BeatCoreNative_bridgeCall(JNIEnv* env, jclass, jlong handle, jbyteArray command, jbyteArray argsJson) {
    const char* out = bc_bridge_call(reinterpret_cast<void*>(handle), bytes(env, command).c_str(), bytes(env, argsJson).c_str());
    return toArray(env, out ? out : "{\"error\":\"no answer\"}");
}

JNIEXPORT void JNICALL Java_app_beatpractice_BeatCoreNative_bridgeFree(JNIEnv*, jclass, jlong handle) {
    bc_bridge_free(reinterpret_cast<void*>(handle));
}

}
