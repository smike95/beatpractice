/* Flat C interface to beat-core. It is loaded at run time by the BeatPractice application (Rust, libloading) and can be used from
   any language with a C FFI. All functions are thread-safe with respect to each other (call from the UI thread).
   Strings and file paths are UTF-8 (also on Windows). */
#ifndef BEAT_CORE_C_H
#define BEAT_CORE_C_H
#ifdef __cplusplus
extern "C" {
#endif
#if defined(_WIN32)
#define BC_API __declspec(dllexport)
#else
#define BC_API __attribute__((visibility("default")))
#endif

typedef struct bc_player bc_player;

/* state values */
enum { BC_IDLE = 0, BC_DECODING = 1, BC_ANALYZING = 2, BC_READY = 3, BC_ERROR = 4 };

BC_API bc_player* bc_create(const char* model_dir, const char* cache_dir);
BC_API void       bc_destroy(bc_player*);

/* opening is asynchronous: poll bc_state / bc_progress. Returns 1 if started, 0 if busy. */
BC_API int         bc_open_file(bc_player*, const char* path);
BC_API void        bc_unload(bc_player*);               /* forget the current song (no-op while loading) */
BC_API int         bc_state(bc_player*);
BC_API float       bc_progress(bc_player*);            /* 0..1 */
BC_API const char* bc_error(bc_player*);               /* valid until the next call of bc_error */
BC_API int         bc_from_cache(bc_player*);

BC_API double bc_duration(bc_player*);                 /* seconds */
BC_API double bc_song_bpm(bc_player*);                 /* average tempo of the original recording */

BC_API void   bc_play(bc_player*);
BC_API void   bc_pause(bc_player*);
BC_API int    bc_is_playing(bc_player*);
BC_API void   bc_seek(bc_player*, double seconds);     /* original-song seconds */
BC_API double bc_position(bc_player*);                 /* original-song seconds */
/* Export the song as it sounds now (tempo, volume, parts on/off and levels) to a 16-bit WAV file, in the background.
   bc_export_state: 0 none, 1 running, 2 done, 3 error. Returns 1 if started. */
BC_API int         bc_export_start(bc_player*, const char* wav_path, int with_metronome);
BC_API int         bc_export_state(bc_player*);
BC_API float       bc_export_progress(bc_player*);
BC_API const char* bc_export_error(bc_player*);
BC_API void        bc_export_cancel(bc_player*);

BC_API void   bc_set_speed(bc_player*, double ratio);  /* 0.25 .. 2.0 ; target_bpm / song_bpm */
BC_API double bc_speed(bc_player*);

BC_API void bc_set_metronome(bc_player*, int enabled, float volume, int accent_first_beat);
BC_API void bc_set_song_volume(bc_player*, float volume);
BC_API void bc_set_count_in(bc_player*, int bars, int every_loop_restart);
BC_API int  bc_is_counting_in(bc_player*);
/* while counting in: *beat = number (1-based) of the latest click, *total = clicks in the count-in. Returns 1 while counting in. */
BC_API int  bc_count_in_beat(bc_player*, int* beat, int* total);
/* meter recognition: 0 automatic, 1 sensitive (follows the network more closely), 2 strict (only 3 and 4 beats).
   Applies instantly to the loaded song (re-reads the saved network output); returns 1 if the song's beat map was rebuilt.
   The chosen mode is also used for songs opened afterwards. After a change, read the beats again (bc_get_beats). */
BC_API int  bc_set_meter_mode(bc_player*, int mode);
BC_API int  bc_meter_mode(bc_player*);

/* stems: the song split into parts by a Demucs model from the models folder: 6 parts (drums, bass, other, vocals, guitar, piano)
   with htdemucs_6s*.onnx, otherwise 4 parts (drums, bass, other, vocals) with htdemucs*.onnx. The part names come from bc_stem_name.
   bc_stems_start runs in the background; poll bc_stems_state: 0 none, 1 running, 2 ready, 3 error. Results are cached on disk.
   When ready, bc_stems_enable(1) plays the parts instead of the original mix, each with its own level (bc_set_stem_gain 0..1.5). */
BC_API int         bc_stems_available(bc_player*);   /* a song is ready and the model file exists */
BC_API int         bc_stems_cached(bc_player*);      /* the parts of this song are already on disk */
BC_API int         bc_stems_start(bc_player*);
BC_API void        bc_stems_cancel(bc_player*);
BC_API int         bc_stems_state(bc_player*);
BC_API float       bc_stems_progress(bc_player*);
BC_API const char* bc_stems_error(bc_player*);
BC_API int         bc_stems_count(bc_player*);
BC_API const char* bc_stem_name(bc_player*, int index);   /* valid until the next call of bc_stem_name */
BC_API void        bc_stems_enable(bc_player*, int on);
BC_API int         bc_stems_enabled(bc_player*);
BC_API void        bc_set_stem_gain(bc_player*, int index, float gain);

/* metronome sound: 0 classic, 1 wood block, 2 hi-hat, 3 rim click, 4 cowbell, 5 electronic beep */
BC_API void bc_set_click_sound(bc_player*, int id);
BC_API int  bc_click_sound_count(void);

BC_API int    bc_set_loop(bc_player*, double a_seconds, double b_seconds); /* 1 = ok */
BC_API void   bc_clear_loop(bc_player*);
BC_API int    bc_loop_enabled(bc_player*);
BC_API double bc_snap_to_bar(bc_player*, double seconds);
BC_API double bc_snap_to_beat(bc_player*, double seconds);

/* beat the sound is currently at (for the visual metronome). Returns 1 if valid. */
BC_API int bc_current_beat(bc_player*, int* beat_index, int* pos_in_bar, int* bar_length);

/* the whole beat map (for waveform markers). Call with null buffers to get the count. */
BC_API int bc_beat_count(bc_player*);
BC_API int bc_get_beats(bc_player*, double* times, int* pos_in_bar, int* bar_length, int capacity);

/* waveform overview: 100 values per second of audio, each 0..1 (loudest sample in that 10 ms) */
BC_API int bc_peak_count(bc_player*);
BC_API int bc_get_peaks(bc_player*, float* out, int capacity);

#ifdef __cplusplus
}
#endif
#endif
