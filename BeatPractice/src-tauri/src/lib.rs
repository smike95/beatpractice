mod core;

use core::{Core, BC_ERROR};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
struct AppState {
    core: Mutex<Option<Core>>,
    dir: Mutex<Option<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InitInfo {
    loaded: bool,
    dir: Option<String>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BeatNow {
    index: i32,
    pos_in_bar: i32,
    bar_length: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    state: i32,
    progress: f32,
    error: String,
    from_cache: bool,
    duration: f64,
    song_bpm: f64,
    playing: bool,
    position: f64,
    speed: f64,
    counting_in: bool,
    loop_enabled: bool,
    beat: Option<BeatNow>,
    count_in: Option<CountInNow>,
    stems: StemsNow,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StemsNow {
    state: i32,       // 0 none, 1 running, 2 ready, 3 error
    progress: f32,
    enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StemsInfo {
    supported: bool,  // the core library has stem separation
    available: bool,  // ... and the model file is installed and a song is ready
    cached: bool,     // the parts of this song are already on disk
    error: String,
    names: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CountInNow {
    beat: i32,
    total: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Caps {
    click_sounds: i32,
    count_in_beats: bool,
    stems: bool,
    meter_modes: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SongData {
    times: Vec<f64>,
    pos_in_bar: Vec<i32>,
    bar_length: Vec<i32>,
    peaks: Vec<f32>,
}

fn config_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("core_dir.txt"))
}

/// Windows gives resource paths a `\\?\` prefix; the native library and the C++ core prefer plain paths.
fn plain_path(p: &std::path::Path) -> String {
    let s = p.to_string_lossy().to_string();
    match s.strip_prefix(r"\\?\") {
        Some(rest) if !rest.starts_with("UNC\\") => rest.to_string(),
        _ => s,
    }
}

/// The core shipped inside the installed application (`<resources>/core-bundle`), if present.
fn bundled_core(app: &AppHandle) -> Option<String> {
    let dir = app.path().resource_dir().ok()?.join("core-bundle");
    if dir.join(core::LIB_REL).exists() { Some(plain_path(&dir)) } else { None }
}

/// Analysis results go to a writable per-user folder (the install folder may be read-only).
fn user_cache_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_local_data_dir().ok().map(|d| d.join("cache"))
}

fn load_into(state: &AppState, dir: &str, cache: Option<&std::path::Path>) -> Result<(), String> {
    let core = Core::load(dir, cache)?;
    // Drop the previous core first (stops audio), then install the new one.
    *state.core.lock().unwrap() = None;
    *state.core.lock().unwrap() = Some(core);
    *state.dir.lock().unwrap() = Some(dir.to_string());
    Ok(())
}

fn with_core<R>(state: &State<AppState>, f: impl FnOnce(&Core) -> R) -> Result<R, String> {
    let guard = state.core.lock().unwrap();
    match guard.as_ref() {
        Some(c) => Ok(f(c)),
        None => Err("Ядро не завантажене".to_string()),
    }
}

/// Called once at start: tries the folder remembered from the previous run.
#[tauri::command]
fn core_init(app: AppHandle, state: State<AppState>) -> InitInfo {
    if state.core.lock().unwrap().is_some() {
        return InitInfo { loaded: true, dir: state.dir.lock().unwrap().clone(), error: None };
    }
    if let Some(dir) = bundled_core(&app) {
        let cache = user_cache_dir(&app);
        return match load_into(&state, &dir, cache.as_deref()) {
            Ok(()) => InitInfo { loaded: true, dir: Some(dir), error: None },
            Err(e) => InitInfo { loaded: false, dir: Some(dir), error: Some(e) },
        };
    }
    let saved = config_file(&app)
        .and_then(|f| std::fs::read_to_string(f).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    match saved {
        None => InitInfo { loaded: false, dir: None, error: None },
        Some(dir) => match load_into(&state, &dir, None) {
            Ok(()) => InitInfo { loaded: true, dir: Some(dir), error: None },
            Err(e) => InitInfo { loaded: false, dir: Some(dir), error: Some(e) },
        },
    }
}

#[tauri::command]
fn core_load(app: AppHandle, state: State<AppState>, dir: String) -> Result<(), String> {
    load_into(&state, &dir, None)?;
    if let Some(f) = config_file(&app) {
        let _ = std::fs::write(f, &dir);
    }
    Ok(())
}

#[tauri::command]
fn core_open_file(state: State<AppState>, path: String) -> Result<bool, String> {
    with_core(&state, |c| c.open_file(&path))
}

#[tauri::command]
fn core_unload(state: State<AppState>) -> Result<(), String> {
    with_core(&state, |c| c.unload())
}

/// Everything the UI needs every ~30 ms, in one call.
#[tauri::command]
fn core_snapshot(state: State<AppState>) -> Result<Snapshot, String> {
    with_core(&state, |c| {
        let st = c.state();
        Snapshot {
            state: st,
            progress: c.progress(),
            error: if st == BC_ERROR { c.error() } else { String::new() },
            from_cache: c.from_cache(),
            duration: c.duration(),
            song_bpm: c.song_bpm(),
            playing: c.is_playing(),
            position: c.position(),
            speed: c.speed(),
            counting_in: c.is_counting_in(),
            loop_enabled: c.loop_enabled(),
            count_in: c.count_in_beat().map(|(beat, total)| CountInNow { beat, total }),
            stems: StemsNow { state: c.stems_state(), progress: c.stems_progress(), enabled: c.stems_enabled() },
            beat: c.current_beat().map(|b| BeatNow {
                index: b.index,
                pos_in_bar: b.pos_in_bar,
                bar_length: b.bar_length,
            }),
        }
    })
}

/// Beat map and waveform peaks; call once after the song becomes READY.
#[tauri::command]
fn core_song_data(state: State<AppState>) -> Result<SongData, String> {
    with_core(&state, |c| {
        let b = c.beats();
        SongData {
            times: b.times,
            pos_in_bar: b.pos_in_bar,
            bar_length: b.bar_length,
            peaks: c.peaks(),
        }
    })
}

/// What the loaded library can do (older libraries lack metronome sounds and count-in progress).
#[tauri::command]
fn core_caps(state: State<AppState>) -> Result<Caps, String> {
    with_core(&state, |c| {
        let sounds = c.click_sound_count();
        Caps { click_sounds: sounds, count_in_beats: sounds > 0, stems: c.has_stems(), meter_modes: c.has_meter_modes() }
    })
}

/// Details about stem separation of the current song (call when a song becomes ready and when the state changes).
#[tauri::command]
fn core_stems_info(state: State<AppState>) -> Result<StemsInfo, String> {
    with_core(&state, |c| StemsInfo {
        supported: c.has_stems(),
        available: c.stems_available(),
        cached: c.stems_cached(),
        error: if c.stems_state() == 3 { c.stems_error() } else { String::new() },
        names: if c.stems_state() == 2 { c.stem_names() } else { Vec::new() },
    })
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportStatus {
    supported: bool,
    state: i32, // 0 none, 1 running, 2 done, 3 error
    progress: f32,
    error: String,
}

#[tauri::command]
fn core_export_start(state: State<AppState>, path: String, metronome: bool) -> Result<bool, String> {
    with_core(&state, |c| c.export_start(&path, metronome))?
}
#[tauri::command]
fn core_export_status(state: State<AppState>) -> Result<ExportStatus, String> {
    with_core(&state, |c| ExportStatus {
        supported: c.has_export(),
        state: c.export_state(),
        progress: c.export_progress(),
        error: if c.export_state() == 3 { c.export_error() } else { String::new() },
    })
}
#[tauri::command]
fn core_export_cancel(state: State<AppState>) -> Result<(), String> { with_core(&state, |c| c.export_cancel()) }

#[tauri::command]
fn core_stems_start(state: State<AppState>) -> Result<bool, String> { with_core(&state, |c| c.stems_start()) }
#[tauri::command]
fn core_stems_cancel(state: State<AppState>) -> Result<(), String> { with_core(&state, |c| c.stems_cancel()) }
#[tauri::command]
fn core_stems_enable(state: State<AppState>, on: bool) -> Result<(), String> { with_core(&state, |c| c.stems_enable(on)) }
#[tauri::command]
fn core_set_stem_gain(state: State<AppState>, index: i32, gain: f32) -> Result<(), String> {
    with_core(&state, |c| c.set_stem_gain(index, gain))
}

/// How eagerly bars follow the network: 0 automatic, 1 sensitive, 2 strict. Returns true when the loaded song was re-analysed.
#[tauri::command]
fn core_set_meter_mode(state: State<AppState>, mode: i32) -> Result<bool, String> { with_core(&state, |c| c.set_meter_mode(mode)) }

#[tauri::command]
fn core_set_click_sound(state: State<AppState>, id: i32) -> Result<(), String> {
    with_core(&state, |c| c.set_click_sound(id))
}

#[tauri::command]
fn core_play(state: State<AppState>) -> Result<(), String> { with_core(&state, |c| c.play()) }
#[tauri::command]
fn core_pause(state: State<AppState>) -> Result<(), String> { with_core(&state, |c| c.pause()) }
#[tauri::command]
fn core_seek(state: State<AppState>, seconds: f64) -> Result<(), String> { with_core(&state, |c| c.seek(seconds)) }
#[tauri::command]
fn core_set_speed(state: State<AppState>, ratio: f64) -> Result<(), String> { with_core(&state, |c| c.set_speed(ratio)) }
#[tauri::command]
fn core_set_metronome(state: State<AppState>, enabled: bool, volume: f32, accent: bool) -> Result<(), String> {
    with_core(&state, |c| c.set_metronome(enabled, volume, accent))
}
#[tauri::command]
fn core_set_song_volume(state: State<AppState>, volume: f32) -> Result<(), String> {
    with_core(&state, |c| c.set_song_volume(volume))
}
#[tauri::command]
fn core_set_count_in(state: State<AppState>, bars: i32, every_loop: bool) -> Result<(), String> {
    with_core(&state, |c| c.set_count_in(bars, every_loop))
}
#[tauri::command]
fn core_set_loop(state: State<AppState>, a: f64, b: f64) -> Result<bool, String> { with_core(&state, |c| c.set_loop(a, b)) }
#[tauri::command]
fn core_clear_loop(state: State<AppState>) -> Result<(), String> { with_core(&state, |c| c.clear_loop()) }
#[tauri::command]
fn core_snap_to_bar(state: State<AppState>, seconds: f64) -> Result<f64, String> { with_core(&state, |c| c.snap_to_bar(seconds)) }
#[tauri::command]
fn core_snap_to_beat(state: State<AppState>, seconds: f64) -> Result<f64, String> { with_core(&state, |c| c.snap_to_beat(seconds)) }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Only one copy of the program may run: a second launch just brings the existing window to the front.
    // (This plugin has to be registered first.)
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            core_init,
            core_load,
            core_open_file,
            core_unload,
            core_snapshot,
            core_caps,
            core_set_click_sound,
            core_set_meter_mode,
            core_stems_info,
            core_stems_start,
            core_export_start,
            core_export_status,
            core_export_cancel,
            core_stems_cancel,
            core_stems_enable,
            core_set_stem_gain,
            core_song_data,
            core_play,
            core_pause,
            core_seek,
            core_set_speed,
            core_set_metronome,
            core_set_song_volume,
            core_set_count_in,
            core_set_loop,
            core_clear_loop,
            core_snap_to_bar,
            core_snap_to_beat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
