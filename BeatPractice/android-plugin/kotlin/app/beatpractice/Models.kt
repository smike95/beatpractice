package app.beatpractice

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * The neural network models are not in the app (they are ~220 MB): they are downloaded once, into the app's own storage, and checked with SHA-256.
 * Fill in MODEL_FILES with the real addresses and checksums (see ANDROID.md). The files are DATA, not code, which Google Play allows to download.
 */
object Models {
    data class ModelFile(val name: String, val url: String, val sha256: String, val sizeBytes: Long)

    // TODO: set the real https addresses (your own server or a public release) and the SHA-256 of every file.
    val MODEL_FILES = listOf(
        ModelFile("beat_this.onnx", "https://example.com/models/beat_this.onnx", "", 83_162_650L),
        ModelFile("mel_spectrogram.onnx", "https://example.com/models/mel_spectrogram.onnx", "", 270_742L),
        ModelFile("htdemucs_6s_fp16weights.onnx", "https://example.com/models/htdemucs_6s_fp16weights.onnx", "", 136_428_532L),
    )

    fun dir(ctx: Context): File = File(ctx.filesDir, "models").also { it.mkdirs() }

    fun missing(ctx: Context): List<ModelFile> = MODEL_FILES.filter { m -> File(dir(ctx), m.name).let { !it.exists() || it.length() != m.sizeBytes } }

    fun missingMb(ctx: Context): Int = (missing(ctx).sumOf { it.sizeBytes } / 1_048_576L).toInt()

    /** Downloads what is missing. progress: 0..1 over all files. Throws on a network error, a wrong checksum or a cancel (check [cancelled]). */
    fun download(ctx: Context, cancelled: () -> Boolean, progress: (Float) -> Unit) {
        val todo = missing(ctx)
        val total = todo.sumOf { it.sizeBytes }.coerceAtLeast(1L)
        var done = 0L
        for (m in todo) {
            val target = File(dir(ctx), m.name)
            val tmp = File(dir(ctx), m.name + ".part")
            val conn = URL(m.url).openConnection() as HttpURLConnection
            conn.connectTimeout = 20_000; conn.readTimeout = 30_000
            if (conn.responseCode != 200) throw RuntimeException("Download failed (${conn.responseCode}) for ${m.name}")
            val md = MessageDigest.getInstance("SHA-256")
            conn.inputStream.use { input ->
                FileOutputStream(tmp).use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        if (cancelled()) { tmp.delete(); throw RuntimeException("Cancelled") }
                        val n = input.read(buf); if (n < 0) break
                        out.write(buf, 0, n); md.update(buf, 0, n); done += n
                        progress((done.toFloat() / total).coerceIn(0f, 1f))
                    }
                }
            }
            val hex = md.digest().joinToString("") { "%02x".format(it) }
            if (m.sha256.isNotEmpty() && !hex.equals(m.sha256, ignoreCase = true)) { tmp.delete(); throw RuntimeException("The downloaded file ${m.name} is damaged (checksum)") }
            if (!tmp.renameTo(target)) throw RuntimeException("Cannot save ${m.name}")
        }
        progress(1f)
    }
}
