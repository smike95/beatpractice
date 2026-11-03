package app.beatpractice

import android.content.Context
import java.io.File
import java.io.FileOutputStream

/**
 * The neural network models (~220 MB) travel inside the app bundle, in an install-time asset pack (see ANDROID.md), so no server and no network are needed.
 * The player (ONNX Runtime) needs real files, so on the first start they are copied from the app's assets into its own folder (a few seconds, once).
 *
 * When you change a model file, give it a new name (for example ...-v2.onnx) and update this list: a copy is taken as good when its size matches.
 */
object Models {
    data class ModelFile(val name: String, val sizeBytes: Long)

    val MODEL_FILES = listOf(
        ModelFile("beat_this.onnx", 83_162_650L),
        ModelFile("mel_spectrogram.onnx", 270_742L),
        ModelFile("htdemucs_6s_fp16weights.onnx", 136_428_532L),
    )

    fun dir(ctx: Context): File = File(ctx.filesDir, "models").also { it.mkdirs() }

    fun missing(ctx: Context): List<ModelFile> = MODEL_FILES.filter { m -> File(dir(ctx), m.name).let { !it.exists() || it.length() != m.sizeBytes } }

    fun missingMb(ctx: Context): Int = (missing(ctx).sumOf { it.sizeBytes } / 1_048_576L).toInt()

    /** Copies what is missing from assets/models/ . progress: 0..1 over all files. Throws on a cancel or when an asset is absent (debug build without the pack). */
    fun installFromAssets(ctx: Context, cancelled: () -> Boolean, progress: (Float) -> Unit) {
        val todo = missing(ctx)
        val total = todo.sumOf { it.sizeBytes }.coerceAtLeast(1L)
        var done = 0L
        for (m in todo) {
            val target = File(dir(ctx), m.name)
            val tmp = File(dir(ctx), m.name + ".part")
            val input = try { ctx.assets.open("models/" + m.name) } catch (e: java.io.IOException) {
                throw RuntimeException("The model ${m.name} is not in the app. Build the app bundle with the models_pack asset pack (see ANDROID.md).")
            }
            input.use { ins ->
                FileOutputStream(tmp).use { out ->
                    val buf = ByteArray(256 * 1024)
                    while (true) {
                        if (cancelled()) { tmp.delete(); throw RuntimeException("Cancelled") }
                        val n = ins.read(buf); if (n < 0) break
                        out.write(buf, 0, n); done += n
                        progress((done.toFloat() / total).coerceIn(0f, 1f))
                    }
                }
            }
            if (tmp.length() != m.sizeBytes) { tmp.delete(); throw RuntimeException("The model ${m.name} has an unexpected size: update Models.kt") }
            if (!tmp.renameTo(target)) throw RuntimeException("Cannot save ${m.name}")
        }
        progress(1f)
    }
}
