//! Runtime binding to the C++ beat-core shared library (`beat_core_c.h`).
//! The library is opened at run time (dlopen / LoadLibrary), so nothing is linked at build time.

use libloading::Library;
use std::ffi::{c_char, c_double, c_float, c_int, c_void, CStr, CString};
use std::path::Path;

type P = *mut c_void;

pub const BC_ERROR: i32 = 4;

pub struct Core {
    _lib: Library,
    p: P,
    destroy: unsafe extern "C" fn(P),
    open_file: unsafe extern "C" fn(P, *const c_char) -> c_int,
    unload: unsafe extern "C" fn(P),
    state: unsafe extern "C" fn(P) -> c_int,
    progress: unsafe extern "C" fn(P) -> c_float,
    error: unsafe extern "C" fn(P) -> *const c_char,
    from_cache: unsafe extern "C" fn(P) -> c_int,
    duration: unsafe extern "C" fn(P) -> c_double,
    song_bpm: unsafe extern "C" fn(P) -> c_double,
    play: unsafe extern "C" fn(P),
    pause: unsafe extern "C" fn(P),
    is_playing: unsafe extern "C" fn(P) -> c_int,
    seek: unsafe extern "C" fn(P, c_double),
    position: unsafe extern "C" fn(P) -> c_double,
    set_speed: unsafe extern "C" fn(P, c_double),
    speed: unsafe extern "C" fn(P) -> c_double,
    set_metronome: unsafe extern "C" fn(P, c_int, c_float, c_int),
    set_song_volume: unsafe extern "C" fn(P, c_float),
    set_count_in: unsafe extern "C" fn(P, c_int, c_int),
    is_counting_in: unsafe extern "C" fn(P) -> c_int,
    set_loop: unsafe extern "C" fn(P, c_double, c_double) -> c_int,
    clear_loop: unsafe extern "C" fn(P),
    loop_enabled: unsafe extern "C" fn(P) -> c_int,
    snap_to_bar: unsafe extern "C" fn(P, c_double) -> c_double,
    snap_to_beat: unsafe extern "C" fn(P, c_double) -> c_double,
    current_beat: unsafe extern "C" fn(P, *mut c_int, *mut c_int, *mut c_int) -> c_int,
    beat_count: unsafe extern "C" fn(P) -> c_int,
    get_beats: unsafe extern "C" fn(P, *mut c_double, *mut c_int, *mut c_int, c_int) -> c_int,
    peak_count: unsafe extern "C" fn(P) -> c_int,
    get_peaks: unsafe extern "C" fn(P, *mut c_float, c_int) -> c_int,
    // newer core versions only (the app still works with an older library, without these features)
    count_in_beat: Option<unsafe extern "C" fn(P, *mut c_int, *mut c_int) -> c_int>,
    set_click_sound: Option<unsafe extern "C" fn(P, c_int)>,
    click_sound_count: Option<unsafe extern "C" fn() -> c_int>,
    set_meter_mode: Option<unsafe extern "C" fn(P, c_int) -> c_int>,
    // stem separation (core with htdemucs support)
    stems_available: Option<unsafe extern "C" fn(P) -> c_int>,
    stems_cached: Option<unsafe extern "C" fn(P) -> c_int>,
    stems_start: Option<unsafe extern "C" fn(P) -> c_int>,
    stems_cancel: Option<unsafe extern "C" fn(P)>,
    stems_state: Option<unsafe extern "C" fn(P) -> c_int>,
    stems_progress: Option<unsafe extern "C" fn(P) -> c_float>,
    export_start: Option<unsafe extern "C" fn(P, *const c_char, c_int) -> c_int>,
    export_state: Option<unsafe extern "C" fn(P) -> c_int>,
    export_progress: Option<unsafe extern "C" fn(P) -> c_float>,
    export_error: Option<unsafe extern "C" fn(P) -> *const c_char>,
    export_cancel: Option<unsafe extern "C" fn(P)>,
    stems_error: Option<unsafe extern "C" fn(P) -> *const c_char>,
    stems_count: Option<unsafe extern "C" fn(P) -> c_int>,
    stem_name: Option<unsafe extern "C" fn(P, c_int) -> *const c_char>,
    stems_enable: Option<unsafe extern "C" fn(P, c_int)>,
    stems_enabled: Option<unsafe extern "C" fn(P) -> c_int>,
    set_stem_gain: Option<unsafe extern "C" fn(P, c_int, c_float)>,
}

// The C API is documented as thread-safe; access is additionally serialised by a Mutex.
unsafe impl Send for Core {}

macro_rules! opt_sym {
    ($lib:expr, $name:literal, $t:ty) => {{
        match $lib.get::<$t>(concat!($name, "\0").as_bytes()) {
            Ok(s) => Some(*s),
            Err(_) => None,
        }
    }};
}

macro_rules! sym {
    ($lib:expr, $name:literal, $t:ty) => {{
        let s: libloading::Symbol<$t> = $lib
            .get(concat!($name, "\0").as_bytes())
            .map_err(|e| format!("{}: {}", $name, e))?;
        *s
    }};
}

#[cfg(target_os = "macos")]
pub const LIB_REL: &str = "build/libbeatcore_c.dylib";
#[cfg(target_os = "windows")]
pub const LIB_REL: &str = "build/beatcore_c.dll";
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub const LIB_REL: &str = "build/libbeatcore_c.so";

pub struct BeatData {
    pub times: Vec<f64>,
    pub pos_in_bar: Vec<i32>,
    pub bar_length: Vec<i32>,
}

pub struct CurrentBeat {
    pub index: i32,
    pub pos_in_bar: i32,
    pub bar_length: i32,
}

impl Core {
    /// `dir` is the beat-core folder that contains `build/` and `models/`.
    /// `cache_dir` is where analysis results are stored; `None` means `<dir>/cache`.
    pub fn load(dir: &str, cache_dir: Option<&Path>) -> Result<Core, String> {
        let base = Path::new(dir);
        // Join the parts one by one: on Windows a path with mixed `\` and `/` is not treated as absolute by
        // LoadLibraryEx, so the DLLs next to the core (onnxruntime.dll ...) would not be found.
        let lib_path = LIB_REL.split('/').fold(base.to_path_buf(), |p, part| p.join(part));
        if !lib_path.exists() {
            return Err(format!(
                "Не знайдено бібліотеку ядра: {}",
                lib_path.display()
            ));
        }
        let models = base.join("models");
        let cache = cache_dir.map(|p| p.to_path_buf()).unwrap_or_else(|| base.join("cache"));
        let _ = std::fs::create_dir_all(&cache);

        // Windows: load the helper DLLs that lie next to the core first (by full path), so the core finds them
        // even if the system has other copies (e.g. an old onnxruntime.dll in System32).
        #[cfg(windows)]
        {
            if let Some(dll_dir) = lib_path.parent() {
                for name in ["vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll", "onnxruntime.dll"] {
                    let p = dll_dir.join(name);
                    if p.exists() {
                        if let Ok(l) = unsafe { Library::new(&p) } {
                            std::mem::forget(l); // keep it loaded for the whole run
                        }
                    }
                }
            }
        }

        unsafe {
            let lib = Library::new(&lib_path).map_err(|e| {
                let mut hint = String::new();
                if let Some(d) = lib_path.parent() {
                    if !d.join("onnxruntime.dll").exists() && cfg!(windows) {
                        hint = " (поруч немає onnxruntime.dll)".to_string();
                    }
                }
                format!("Не вдалося завантажити {}: {}{}", lib_path.display(), e, hint)
            })?;

            let create: unsafe extern "C" fn(*const c_char, *const c_char) -> P =
                sym!(lib, "bc_create", unsafe extern "C" fn(*const c_char, *const c_char) -> P);

            let models_c = CString::new(models.to_string_lossy().as_bytes())
                .map_err(|e| e.to_string())?;
            let cache_c =
                CString::new(cache.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
            let p = create(models_c.as_ptr(), cache_c.as_ptr());
            if p.is_null() {
                return Err("bc_create повернув null (перевірте теку models)".into());
            }

            Ok(Core {
                destroy: sym!(lib, "bc_destroy", unsafe extern "C" fn(P)),
                open_file: sym!(lib, "bc_open_file", unsafe extern "C" fn(P, *const c_char) -> c_int),
                unload: sym!(lib, "bc_unload", unsafe extern "C" fn(P)),
                state: sym!(lib, "bc_state", unsafe extern "C" fn(P) -> c_int),
                progress: sym!(lib, "bc_progress", unsafe extern "C" fn(P) -> c_float),
                error: sym!(lib, "bc_error", unsafe extern "C" fn(P) -> *const c_char),
                from_cache: sym!(lib, "bc_from_cache", unsafe extern "C" fn(P) -> c_int),
                duration: sym!(lib, "bc_duration", unsafe extern "C" fn(P) -> c_double),
                song_bpm: sym!(lib, "bc_song_bpm", unsafe extern "C" fn(P) -> c_double),
                play: sym!(lib, "bc_play", unsafe extern "C" fn(P)),
                pause: sym!(lib, "bc_pause", unsafe extern "C" fn(P)),
                is_playing: sym!(lib, "bc_is_playing", unsafe extern "C" fn(P) -> c_int),
                seek: sym!(lib, "bc_seek", unsafe extern "C" fn(P, c_double)),
                position: sym!(lib, "bc_position", unsafe extern "C" fn(P) -> c_double),
                set_speed: sym!(lib, "bc_set_speed", unsafe extern "C" fn(P, c_double)),
                speed: sym!(lib, "bc_speed", unsafe extern "C" fn(P) -> c_double),
                set_metronome: sym!(lib, "bc_set_metronome", unsafe extern "C" fn(P, c_int, c_float, c_int)),
                set_song_volume: sym!(lib, "bc_set_song_volume", unsafe extern "C" fn(P, c_float)),
                set_count_in: sym!(lib, "bc_set_count_in", unsafe extern "C" fn(P, c_int, c_int)),
                is_counting_in: sym!(lib, "bc_is_counting_in", unsafe extern "C" fn(P) -> c_int),
                set_loop: sym!(lib, "bc_set_loop", unsafe extern "C" fn(P, c_double, c_double) -> c_int),
                clear_loop: sym!(lib, "bc_clear_loop", unsafe extern "C" fn(P)),
                loop_enabled: sym!(lib, "bc_loop_enabled", unsafe extern "C" fn(P) -> c_int),
                snap_to_bar: sym!(lib, "bc_snap_to_bar", unsafe extern "C" fn(P, c_double) -> c_double),
                snap_to_beat: sym!(lib, "bc_snap_to_beat", unsafe extern "C" fn(P, c_double) -> c_double),
                current_beat: sym!(lib, "bc_current_beat", unsafe extern "C" fn(P, *mut c_int, *mut c_int, *mut c_int) -> c_int),
                beat_count: sym!(lib, "bc_beat_count", unsafe extern "C" fn(P) -> c_int),
                get_beats: sym!(lib, "bc_get_beats", unsafe extern "C" fn(P, *mut c_double, *mut c_int, *mut c_int, c_int) -> c_int),
                peak_count: sym!(lib, "bc_peak_count", unsafe extern "C" fn(P) -> c_int),
                get_peaks: sym!(lib, "bc_get_peaks", unsafe extern "C" fn(P, *mut c_float, c_int) -> c_int),
                count_in_beat: opt_sym!(lib, "bc_count_in_beat", unsafe extern "C" fn(P, *mut c_int, *mut c_int) -> c_int),
                set_click_sound: opt_sym!(lib, "bc_set_click_sound", unsafe extern "C" fn(P, c_int)),
                click_sound_count: opt_sym!(lib, "bc_click_sound_count", unsafe extern "C" fn() -> c_int),
                set_meter_mode: opt_sym!(lib, "bc_set_meter_mode", unsafe extern "C" fn(P, c_int) -> c_int),
                stems_available: opt_sym!(lib, "bc_stems_available", unsafe extern "C" fn(P) -> c_int),
                stems_cached: opt_sym!(lib, "bc_stems_cached", unsafe extern "C" fn(P) -> c_int),
                stems_start: opt_sym!(lib, "bc_stems_start", unsafe extern "C" fn(P) -> c_int),
                stems_cancel: opt_sym!(lib, "bc_stems_cancel", unsafe extern "C" fn(P)),
                stems_state: opt_sym!(lib, "bc_stems_state", unsafe extern "C" fn(P) -> c_int),
                stems_progress: opt_sym!(lib, "bc_stems_progress", unsafe extern "C" fn(P) -> c_float),
                export_start: opt_sym!(lib, "bc_export_start", unsafe extern "C" fn(P, *const c_char, c_int) -> c_int),
                export_state: opt_sym!(lib, "bc_export_state", unsafe extern "C" fn(P) -> c_int),
                export_progress: opt_sym!(lib, "bc_export_progress", unsafe extern "C" fn(P) -> c_float),
                export_error: opt_sym!(lib, "bc_export_error", unsafe extern "C" fn(P) -> *const c_char),
                export_cancel: opt_sym!(lib, "bc_export_cancel", unsafe extern "C" fn(P)),
                stems_error: opt_sym!(lib, "bc_stems_error", unsafe extern "C" fn(P) -> *const c_char),
                stems_count: opt_sym!(lib, "bc_stems_count", unsafe extern "C" fn(P) -> c_int),
                stem_name: opt_sym!(lib, "bc_stem_name", unsafe extern "C" fn(P, c_int) -> *const c_char),
                stems_enable: opt_sym!(lib, "bc_stems_enable", unsafe extern "C" fn(P, c_int)),
                stems_enabled: opt_sym!(lib, "bc_stems_enabled", unsafe extern "C" fn(P) -> c_int),
                set_stem_gain: opt_sym!(lib, "bc_set_stem_gain", unsafe extern "C" fn(P, c_int, c_float)),
                p,
                _lib: lib,
            })
        }
    }

    pub fn open_file(&self, path: &str) -> bool {
        match CString::new(path) {
            Ok(c) => unsafe { (self.open_file)(self.p, c.as_ptr()) != 0 },
            Err(_) => false,
        }
    }
    pub fn unload(&self) { unsafe { (self.unload)(self.p) } }
    pub fn state(&self) -> i32 { unsafe { (self.state)(self.p) } }
    pub fn progress(&self) -> f32 { unsafe { (self.progress)(self.p) } }
    pub fn error(&self) -> String {
        unsafe {
            let s = (self.error)(self.p);
            if s.is_null() { String::new() } else { CStr::from_ptr(s).to_string_lossy().into_owned() }
        }
    }
    pub fn from_cache(&self) -> bool { unsafe { (self.from_cache)(self.p) != 0 } }
    pub fn duration(&self) -> f64 { unsafe { (self.duration)(self.p) } }
    pub fn song_bpm(&self) -> f64 { unsafe { (self.song_bpm)(self.p) } }
    pub fn play(&self) { unsafe { (self.play)(self.p) } }
    pub fn pause(&self) { unsafe { (self.pause)(self.p) } }
    pub fn is_playing(&self) -> bool { unsafe { (self.is_playing)(self.p) != 0 } }
    pub fn seek(&self, s: f64) { unsafe { (self.seek)(self.p, s) } }
    pub fn position(&self) -> f64 { unsafe { (self.position)(self.p) } }
    pub fn set_speed(&self, r: f64) { unsafe { (self.set_speed)(self.p, r) } }
    pub fn speed(&self) -> f64 { unsafe { (self.speed)(self.p) } }
    pub fn set_metronome(&self, enabled: bool, volume: f32, accent: bool) {
        unsafe { (self.set_metronome)(self.p, enabled as c_int, volume, accent as c_int) }
    }
    pub fn set_song_volume(&self, v: f32) { unsafe { (self.set_song_volume)(self.p, v) } }
    pub fn set_count_in(&self, bars: i32, every_loop: bool) {
        unsafe { (self.set_count_in)(self.p, bars, every_loop as c_int) }
    }
    pub fn is_counting_in(&self) -> bool { unsafe { (self.is_counting_in)(self.p) != 0 } }
    pub fn set_loop(&self, a: f64, b: f64) -> bool { unsafe { (self.set_loop)(self.p, a, b) != 0 } }
    pub fn clear_loop(&self) { unsafe { (self.clear_loop)(self.p) } }
    pub fn loop_enabled(&self) -> bool { unsafe { (self.loop_enabled)(self.p) != 0 } }
    /// (beat, total) while the count-in is running and the library supports it.
    pub fn count_in_beat(&self) -> Option<(i32, i32)> {
        let f = self.count_in_beat?;
        let (mut b, mut t) = (0 as c_int, 0 as c_int);
        if unsafe { f(self.p, &mut b, &mut t) } != 0 { Some((b, t)) } else { None }
    }
    pub fn set_click_sound(&self, id: i32) {
        if let Some(f) = self.set_click_sound { unsafe { f(self.p, id) } }
    }
    /// Number of metronome sounds offered by the library (0 = old library without this feature).
    pub fn click_sound_count(&self) -> i32 {
        match self.click_sound_count { Some(f) => unsafe { f() }, None => 0 }
    }
    /// Meter recognition mode (0 automatic, 1 sensitive, 2 strict). None = the library is too old to offer it.
    pub fn has_meter_modes(&self) -> bool { self.set_meter_mode.is_some() }
    pub fn set_meter_mode(&self, mode: i32) -> bool { self.set_meter_mode.map_or(false, |f| unsafe { f(self.p, mode) } != 0) }

    // ---- stems -----------------------------------------------------------------------------------
    /// True when the loaded library knows about stem separation at all.
    pub fn has_stems(&self) -> bool { self.stems_start.is_some() && self.stems_state.is_some() }
    pub fn stems_available(&self) -> bool { self.stems_available.map_or(false, |f| unsafe { f(self.p) } != 0) }
    pub fn stems_cached(&self) -> bool { self.stems_cached.map_or(false, |f| unsafe { f(self.p) } != 0) }
    pub fn stems_start(&self) -> bool { self.stems_start.map_or(false, |f| unsafe { f(self.p) } != 0) }
    pub fn stems_cancel(&self) { if let Some(f) = self.stems_cancel { unsafe { f(self.p) } } }
    /// 0 none, 1 running, 2 ready, 3 error
    pub fn stems_state(&self) -> i32 { self.stems_state.map_or(0, |f| unsafe { f(self.p) }) }
    pub fn has_export(&self) -> bool { self.export_start.is_some() && self.export_state.is_some() }
    pub fn export_start(&self, path: &str, metronome: bool) -> Result<bool, String> {
        let f = self.export_start.ok_or_else(|| "Ця версія ядра не вміє експортувати".to_string())?;
        let c = CString::new(path.as_bytes()).map_err(|e| e.to_string())?;
        Ok(unsafe { f(self.p, c.as_ptr(), metronome as c_int) } != 0)
    }
    pub fn export_state(&self) -> i32 { self.export_state.map_or(0, |f| unsafe { f(self.p) }) }
    pub fn export_progress(&self) -> f32 { self.export_progress.map_or(0.0, |f| unsafe { f(self.p) }) }
    pub fn export_error(&self) -> String {
        match self.export_error {
            Some(f) => unsafe {
                let s = f(self.p);
                if s.is_null() { String::new() } else { CStr::from_ptr(s).to_string_lossy().into_owned() }
            },
            None => String::new(),
        }
    }
    pub fn export_cancel(&self) { if let Some(f) = self.export_cancel { unsafe { f(self.p) } } }
    pub fn stems_progress(&self) -> f32 { self.stems_progress.map_or(0.0, |f| unsafe { f(self.p) }) }
    pub fn stems_error(&self) -> String {
        match self.stems_error {
            Some(f) => unsafe {
                let s = f(self.p);
                if s.is_null() { String::new() } else { CStr::from_ptr(s).to_string_lossy().into_owned() }
            },
            None => String::new(),
        }
    }
    pub fn stem_names(&self) -> Vec<String> {
        let (count, name) = match (self.stems_count, self.stem_name) {
            (Some(c), Some(n)) => (c, n),
            _ => return Vec::new(),
        };
        let n = unsafe { count(self.p) }.max(0);
        (0..n)
            .map(|i| unsafe {
                let s = name(self.p, i);
                if s.is_null() { String::new() } else { CStr::from_ptr(s).to_string_lossy().into_owned() }
            })
            .collect()
    }
    pub fn stems_enable(&self, on: bool) { if let Some(f) = self.stems_enable { unsafe { f(self.p, on as c_int) } } }
    pub fn stems_enabled(&self) -> bool { self.stems_enabled.map_or(false, |f| unsafe { f(self.p) } != 0) }
    pub fn set_stem_gain(&self, i: i32, g: f32) { if let Some(f) = self.set_stem_gain { unsafe { f(self.p, i, g) } } }

    pub fn snap_to_bar(&self, s: f64) -> f64 { unsafe { (self.snap_to_bar)(self.p, s) } }
    pub fn snap_to_beat(&self, s: f64) -> f64 { unsafe { (self.snap_to_beat)(self.p, s) } }

    pub fn current_beat(&self) -> Option<CurrentBeat> {
        let (mut i, mut pos, mut len) = (0 as c_int, 0 as c_int, 0 as c_int);
        let ok = unsafe { (self.current_beat)(self.p, &mut i, &mut pos, &mut len) };
        if ok != 0 {
            Some(CurrentBeat { index: i, pos_in_bar: pos, bar_length: len })
        } else {
            None
        }
    }

    pub fn beats(&self) -> BeatData {
        let n = unsafe { (self.beat_count)(self.p) }.max(0) as usize;
        let mut times = vec![0f64; n];
        let mut pos_in_bar = vec![0i32; n];
        let mut bar_length = vec![0i32; n];
        if n > 0 {
            let got = unsafe {
                (self.get_beats)(
                    self.p,
                    times.as_mut_ptr(),
                    pos_in_bar.as_mut_ptr(),
                    bar_length.as_mut_ptr(),
                    n as c_int,
                )
            }
            .max(0) as usize;
            times.truncate(got);
            pos_in_bar.truncate(got);
            bar_length.truncate(got);
        }
        BeatData { times, pos_in_bar, bar_length }
    }

    pub fn peaks(&self) -> Vec<f32> {
        let n = unsafe { (self.peak_count)(self.p) }.max(0) as usize;
        let mut out = vec![0f32; n];
        if n > 0 {
            let got = unsafe { (self.get_peaks)(self.p, out.as_mut_ptr(), n as c_int) }.max(0) as usize;
            out.truncate(got);
        }
        out
    }
}

impl Drop for Core {
    fn drop(&mut self) {
        unsafe { (self.destroy)(self.p) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Runs against a tiny stub library built from beat_core_c.h (see BEATCORE_STUB_DIR).
    #[test]
    fn talks_to_stub_library() {
        let dir = match std::env::var("BEATCORE_STUB_DIR") {
            Ok(d) => d,
            Err(_) => return, // not configured: skip
        };
        let c = Core::load(&dir, None).expect("load stub");
        assert!(c.open_file("/some/song.mp3"));
        assert_eq!(c.state(), 3);
        assert!((c.duration() - 12.5).abs() < 1e-9);
        assert!((c.song_bpm() - 90.0).abs() < 1e-9);
        c.set_speed(0.75);
        assert!((c.speed() - 0.75).abs() < 1e-9);
        c.seek(4.25);
        assert!((c.position() - 4.25).abs() < 1e-9);
        c.play();
        assert!(c.is_playing());
        c.pause();
        assert!(!c.is_playing());
        assert!(c.set_loop(2.0, 6.0));
        assert!(!c.set_loop(6.0, 2.0));
        assert!(c.loop_enabled());
        c.clear_loop();
        assert!(!c.loop_enabled());
        assert!((c.snap_to_bar(5.3) - 4.0).abs() < 1e-9);
        let cb = c.current_beat().expect("beat");
        assert_eq!((cb.index, cb.pos_in_bar, cb.bar_length), (7, 3, 4));
        let b = c.beats();
        assert_eq!(b.times.len(), 25);
        assert_eq!(b.pos_in_bar[5], 2);
        assert_eq!(b.bar_length[24], 4);
        assert!((b.times[24] - 12.0).abs() < 1e-9);
        let p = c.peaks();
        assert_eq!(p.len(), 1250);
        assert!((p[149] - 0.49).abs() < 1e-6);
        c.set_metronome(true, 0.8, true);
        c.set_count_in(2, false);
        assert!(c.is_counting_in());
        assert_eq!(c.error(), "stub error");
        assert_eq!(c.click_sound_count(), 6);
        c.set_click_sound(3);
        assert_eq!(c.count_in_beat(), Some((2, 4)));
        // stems
        assert!(c.has_stems());
        assert!(c.has_meter_modes());
        assert!(c.set_meter_mode(1));
        assert!(c.stems_available());
        assert!(!c.stems_cached());
        assert!(c.stems_start());
        assert_eq!(c.stems_state(), 2);
        assert!((c.stems_progress() - 1.0).abs() < 1e-6);
        assert_eq!(c.stem_names(), vec!["drums", "bass", "other", "vocals"]);
        c.stems_enable(true);
        assert!(c.stems_enabled());
        c.set_stem_gain(0, 0.0);
        assert_eq!(c.stems_error(), "stems error");
    }

    #[test]
    fn missing_library_gives_error_text() {
        let e = Core::load("/definitely/not/here", None).err().expect("must fail");
        assert!(e.contains("Не знайдено"));
    }

    /// A library built before the metronome sounds / count-in progress existed must still load.
    #[test]
    fn older_library_without_new_functions_still_loads() {
        let dir = match std::env::var("BEATCORE_OLD_STUB_DIR") {
            Ok(d) => d,
            Err(_) => return,
        };
        let c = Core::load(&dir, None).expect("load old stub");
        assert_eq!(c.click_sound_count(), 0);
        assert_eq!(c.count_in_beat(), None);
        assert!(!c.has_stems());
        assert!(!c.has_meter_modes());
        assert!(!c.set_meter_mode(1));
        assert_eq!(c.stem_names(), Vec::<String>::new());
        assert_eq!(c.stems_state(), 0);
        c.stems_enable(true); // harmless no-ops
        c.set_stem_gain(1, 0.5);
        c.set_click_sound(2); // must be a harmless no-op
        assert!(c.open_file("/some/song.mp3"));
    }
}
