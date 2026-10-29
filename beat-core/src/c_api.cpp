#include "beat_core_c.h"
#include "player.h"
#include <cstring>
#include <mutex>
#include <string>

using namespace beatcore;
struct bc_player { Player p; std::string err, tmp; bc_player(const char* m, const char* c) : p(m ? m : "", c ? c : "") {} };

extern "C" {
bc_player* bc_create(const char* m, const char* c) { try { return new bc_player(m, c); } catch (...) { return nullptr; } }
void bc_destroy(bc_player* h) { delete h; }
int bc_open_file(bc_player* h, const char* path) { return h && path && h->p.openFile(path) ? 1 : 0; }
void bc_unload(bc_player* h) { if (h) h->p.unload(); }
int bc_state(bc_player* h) { return h ? (int)h->p.state() : BC_ERROR; }
float bc_progress(bc_player* h) { return h ? h->p.progress() : 0.f; }
const char* bc_error(bc_player* h) { if (!h) return ""; h->err = h->p.error(); return h->err.c_str(); }
int bc_from_cache(bc_player* h) { return h && h->p.fromCache() ? 1 : 0; }
double bc_duration(bc_player* h) { return h ? h->p.durationSeconds() : 0; }
double bc_song_bpm(bc_player* h) { return h ? h->p.songBpm() : 0; }
void bc_play(bc_player* h) { if (h) h->p.play(); }
void bc_pause(bc_player* h) { if (h) h->p.pause(); }
int bc_is_playing(bc_player* h) { return h && h->p.isPlaying() ? 1 : 0; }
void bc_seek(bc_player* h, double s) { if (h) h->p.seekSeconds(s); }
double bc_position(bc_player* h) { return h ? h->p.positionSeconds() : 0; }
void bc_set_speed(bc_player* h, double r) { if (h) h->p.setSpeed(r); }
double bc_speed(bc_player* h) { return h ? h->p.speed() : 1.0; }
void bc_set_metronome(bc_player* h, int en, float vol, int acc) { if (!h) return; MetronomeSettings s; s.enabled = en != 0; s.volume = vol; s.accentFirstBeat = acc != 0; h->p.setMetronome(s); }
void bc_set_song_volume(bc_player* h, float v) { if (h) h->p.setSongVolume(v); }
void bc_set_count_in(bc_player* h, int bars, int every) { if (!h) return; CountInSettings s; s.bars = bars; s.everyLoopRestart = every != 0; h->p.setCountIn(s); }
int bc_is_counting_in(bc_player* h) { return h && h->p.isCountingIn() ? 1 : 0; }
int bc_set_meter_mode(bc_player* h, int mode) { return h && h->p.setMeterMode(mode) ? 1 : 0; }
int bc_meter_mode(bc_player* h) { return h ? h->p.meterMode() : 0; }
int bc_export_start(bc_player* h, const char* path, int met) { return h && path && h->p.exportStart(path, met != 0) ? 1 : 0; }
int bc_export_state(bc_player* h) { return h ? h->p.exportState() : 0; }
float bc_export_progress(bc_player* h) { return h ? h->p.exportProgress() : 0.f; }
const char* bc_export_error(bc_player* h) { if (!h) return ""; h->err = h->p.exportError(); return h->err.c_str(); }
void bc_export_cancel(bc_player* h) { if (h) h->p.exportCancel(); }
int bc_stems_available(bc_player* h) { return h && h->p.stemsAvailable() ? 1 : 0; }
int bc_stems_cached(bc_player* h) { return h && h->p.stemsCached() ? 1 : 0; }
int bc_stems_start(bc_player* h) { return h && h->p.stemsStart() ? 1 : 0; }
void bc_stems_cancel(bc_player* h) { if (h) h->p.stemsCancel(); }
int bc_stems_state(bc_player* h) { return h ? (int)h->p.stemsState() : 0; }
float bc_stems_progress(bc_player* h) { return h ? h->p.stemsProgress() : 0.f; }
const char* bc_stems_error(bc_player* h) { if (!h) return ""; h->err = h->p.stemsError(); return h->err.c_str(); }
int bc_stems_count(bc_player* h) { return h ? (int)h->p.stemNames().size() : 0; }
const char* bc_stem_name(bc_player* h, int i) { if (!h) return ""; auto n = h->p.stemNames(); h->tmp = (i >= 0 && i < (int)n.size()) ? n[i] : std::string(); return h->tmp.c_str(); }
void bc_stems_enable(bc_player* h, int on) { if (h) h->p.setStemsEnabled(on != 0); }
int bc_stems_enabled(bc_player* h) { return h && h->p.stemsEnabled() ? 1 : 0; }
void bc_set_stem_gain(bc_player* h, int i, float g) { if (h) h->p.setStemGain(i, g); }
int bc_count_in_beat(bc_player* h, int* beat, int* total) { return h && h->p.countInBeat(beat, total) ? 1 : 0; }
void bc_set_click_sound(bc_player* h, int id) { if (h) h->p.setClickSound(id); }
int bc_click_sound_count(void) { return PlaybackEngine::clickSoundCount(); }
int bc_set_loop(bc_player* h, double a, double b) { return h && h->p.setLoop(a, b) ? 1 : 0; }
void bc_clear_loop(bc_player* h) { if (h) h->p.clearLoop(); }
int bc_loop_enabled(bc_player* h) { return h && h->p.loopEnabled() ? 1 : 0; }
double bc_snap_to_bar(bc_player* h, double s) { return h ? h->p.snapToBar(s) : s; }
double bc_snap_to_beat(bc_player* h, double s) { return h ? h->p.snapToBeat(s) : s; }
int bc_current_beat(bc_player* h, int* bi, int* pos, int* len) {
    if (!h) return 0; BeatInfo b = h->p.currentBeat(); if (b.beatIndex < 0) return 0;
    if (bi) *bi = b.beatIndex; if (pos) *pos = b.posInBar; if (len) *len = b.barLength; return 1;
}
int bc_beat_count(bc_player* h) { if (!h) return 0; auto m = h->p.beatMap(); return m ? (int)m->beats.size() : 0; }
int bc_get_beats(bc_player* h, double* t, int* pos, int* len, int cap) {
    if (!h) return 0; auto m = h->p.beatMap(); if (!m) return 0;
    int n = std::min<int>(cap, (int)m->beats.size());
    for (int i = 0; i < n; ++i) { if (t) t[i] = m->beats[i]; if (pos) pos[i] = m->posInBar[i]; if (len) len[i] = m->barLength[i]; }
    return n;
}
int bc_peak_count(bc_player* h) { return h ? (int)h->p.peaks().size() : 0; }
int bc_get_peaks(bc_player* h, float* out, int cap) {
    if (!h || !out) return 0; auto v = h->p.peaks(); int n = std::min<int>(cap, (int)v.size());
    for (int i = 0; i < n; ++i) out[i] = v[i]; return n;
}
}
