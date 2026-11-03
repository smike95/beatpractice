package app.beatpractice

/**
 * The three native functions of libbeatcore_jni.so (beat-core/android/beatcore_jni.cpp). Text goes as UTF-8 bytes (emoji and other characters
 * outside the basic plane cannot travel as JNI strings).
 */
object BeatCoreNative {
    init { System.loadLibrary("beatcore_jni") }

    @JvmStatic private external fun bridgeNew(modelDir: ByteArray, cacheDir: ByteArray, lowMemory: Boolean): Long
    @JvmStatic private external fun bridgeCall(handle: Long, command: ByteArray, argsJson: ByteArray): ByteArray
    @JvmStatic external fun bridgeFree(handle: Long)

    fun create(modelDir: String, cacheDir: String, lowMemory: Boolean): Long =
        bridgeNew(modelDir.toByteArray(Charsets.UTF_8), cacheDir.toByteArray(Charsets.UTF_8), lowMemory)

    fun call(handle: Long, command: String, argsJson: String): String =
        String(bridgeCall(handle, command.toByteArray(Charsets.UTF_8), argsJson.toByteArray(Charsets.UTF_8)), Charsets.UTF_8)
}
