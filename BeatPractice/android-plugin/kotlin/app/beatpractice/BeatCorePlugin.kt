package app.beatpractice

import android.app.ActivityManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The bridge between the React interface and the C++ player on Android.
 *  - call(): hands a command (core_*) with JSON arguments to the C++ bridge (the same commands as the desktop app) and returns its JSON answer.
 *  - files: the system file picker (no storage permissions needed: the chosen files are COPIED into the app's own folder), sharing of saved files.
 *  - models: first-start download of the neural networks.
 * The commands run on one background thread so that the interface never waits for the player.
 */
@CapacitorPlugin(name = "BeatCore")
class BeatCorePlugin : Plugin() {
    private var handle = 0L
    private val worker = Executors.newSingleThreadExecutor()
    private val cancelDownload = AtomicBoolean(false)

    private fun cacheDir(): File = File(context.filesDir, "cache").also { it.mkdirs() }
    private fun libraryDir(): File = File(context.filesDir, "library").also { it.mkdirs() }
    private fun exportDir(): File = File(context.getExternalFilesDir(null) ?: context.filesDir, "exports").also { it.mkdirs() }

    /** Phones with little memory keep the song as 16-bit samples and load the model the economical way. */
    private fun lowMemory(): Boolean {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val mi = ActivityManager.MemoryInfo(); am.getMemoryInfo(mi)
        return mi.totalMem < 8L * 1024 * 1024 * 1024
    }

    @Synchronized private fun ensureBridge(): Long {
        if (handle == 0L) handle = BeatCoreNative.create(Models.dir(context).absolutePath, cacheDir().absolutePath, lowMemory())
        return handle
    }

    @PluginMethod
    fun call(call: PluginCall) {
        val command = call.getString("command") ?: return call.reject("no command")
        val args = call.getString("args") ?: "{}"
        worker.execute {
            try {
                val h = ensureBridge()
                if (h == 0L) { call.reject("The player could not be started"); return@execute }
                val answer = BeatCoreNative.call(h, command, args)
                if (command == "core_stems_start" || command == "core_export_start_ex" || command == "core_export_start" || command == "core_pack_save") watchLongJob(h, answer)
                val out = JSObject(); out.put("result", answer); call.resolve(out)
            } catch (e: Throwable) { call.reject(e.message ?: "error") }
        }
    }

    // ---- long jobs: keep the app alive while they run ------------------------------------------------------------------
    private val watching = AtomicBoolean(false)

    /** If the job really started ({"ok":true}), runs a foreground service until neither separation nor export/pack is running any more. */
    private fun watchLongJob(h: Long, startAnswer: String) {
        if (!startAnswer.contains("\"ok\":true") || !watching.compareAndSet(false, true)) return
        try { KeepAliveService.start(context, "Обробка треку… / Processing…") } catch (e: Exception) { watching.set(false); return }
        Thread {
            try {
                while (true) {
                    Thread.sleep(2000)
                    if (handle == 0L) break
                    val s = BeatCoreNative.call(h, "core_snapshot", "{}"); val x = BeatCoreNative.call(h, "core_export_status", "{}")
                    val stemsRunning = Regex("\"stems\":\\{[^}]*\"state\":1").containsMatchIn(s)
                    val exportRunning = Regex("\"state\":1").containsMatchIn(x)
                    if (!stemsRunning && !exportRunning) break
                }
            } catch (e: Exception) { /* stop below */ }
            KeepAliveService.stop(context); watching.set(false)
        }.start()
    }

    // ---- choosing files ------------------------------------------------------------------------------------------
    @PluginMethod
    fun pickFiles(call: PluginCall) {
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE); type = "*/*"
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("audio/*", "application/octet-stream"))   // .beatpack has no registered type
        }
        startActivityForResult(call, i, "pickedFiles")
    }

    @ActivityCallback
    private fun pickedFiles(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val data = result.data
        if (result.resultCode != android.app.Activity.RESULT_OK || data == null) { call.resolve(JSObject().put("paths", org.json.JSONArray())); return }
        val uris = ArrayList<Uri>()
        data.clipData?.let { for (k in 0 until it.itemCount) uris.add(it.getItemAt(k).uri) }
        data.data?.let { uris.add(it) }
        worker.execute {
            val paths = org.json.JSONArray()
            for (u in uris) copyIn(u)?.let { paths.put(it.absolutePath) }
            call.resolve(JSObject().put("paths", paths))
        }
    }

    /** Copies a chosen document into the app's library (the player needs a real file path) and returns the copy. */
    private fun copyIn(uri: Uri): File? = try {
        var name = "file"
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) name = c.getString(0) ?: name }
        name = name.replace(Regex("[\\\\/:*?\"<>|]"), "_")
        var target = File(libraryDir(), name)
        var n = 1
        while (target.exists()) { target = File(libraryDir(), "${name.substringBeforeLast('.', name)} ($n)${if (name.contains('.')) "." + name.substringAfterLast('.') else ""}"); n++ }
        context.contentResolver.openInputStream(uri)?.use { input -> target.outputStream().use { input.copyTo(it) } }
        target
    } catch (e: Exception) { null }

    /** Files that other apps send to us ("Open with"): called by MainActivity (see ANDROID.md). */
    fun handleIncoming(intent: Intent?) {
        val uri = intent?.data ?: return
        worker.execute {
            val f = copyIn(uri) ?: return@execute
            val paths = org.json.JSONArray().put(f.absolutePath)
            notifyListeners("fileOpened", JSObject().put("paths", paths))
        }
    }

    // ---- saving ------------------------------------------------------------------------------------------------------
    @PluginMethod
    fun pickSavePath(call: PluginCall) {
        val name = (call.getString("defaultName") ?: "export").replace(Regex("[\\\\/:*?\"<>|]"), "_")
        call.resolve(JSObject().put("path", File(exportDir(), name).absolutePath))
    }

    /** Offers every file that starts with basePath (one export may make several files) to the system share sheet: Drive, Files, messengers... */
    @PluginMethod
    fun shareSaved(call: PluginCall) {
        val base = call.getString("basePath") ?: return call.reject("no path")
        val dir = File(base).parentFile ?: return call.reject("bad path")
        val prefix = File(base).name
        val files = dir.listFiles { f -> f.isFile && f.name.startsWith(prefix) && !f.name.endsWith(".tmp") }?.toList().orEmpty()
        if (files.isEmpty()) return call.reject("Nothing to send")
        val uris = ArrayList(files.map { FileProvider.getUriForFile(context, context.packageName + ".fileprovider", it) })
        val send = Intent(if (uris.size == 1) Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE).apply {
            type = "*/*"
            if (uris.size == 1) putExtra(Intent.EXTRA_STREAM, uris[0]) else putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try { activity.startActivity(Intent.createChooser(send, null)); call.resolve() }
        catch (e: ActivityNotFoundException) { call.reject("No app can take the file") }
    }

    @PluginMethod
    fun getVersion(call: PluginCall) {
        val v = try { context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "" } catch (e: Exception) { "" }
        call.resolve(JSObject().put("version", v))
    }

    // ---- models ---------------------------------------------------------------------------------------------------------
    @PluginMethod
    fun modelsStatus(call: PluginCall) {
        val missing = Models.missing(context)
        call.resolve(JSObject().put("installed", missing.isEmpty()).put("sizeMb", Models.missingMb(context)))
    }

    @PluginMethod
    fun modelsDownload(call: PluginCall) {
        cancelDownload.set(false)
        worker.execute {
            try {
                Models.download(context, { cancelDownload.get() }) { p -> notifyListeners("modelsProgress", JSObject().put("progress", p.toDouble())) }
                // nothing else to do: the player looks for the model files when it starts an analysis or a separation
                call.resolve()
            } catch (e: Throwable) { call.reject(e.message ?: "download failed") }
        }
    }

    @PluginMethod
    fun modelsCancel(call: PluginCall) { cancelDownload.set(true); call.resolve() }

    override fun handleOnDestroy() {
        synchronized(this) { if (handle != 0L) { BeatCoreNative.bridgeFree(handle); handle = 0L } }
        worker.shutdown()
    }
}
