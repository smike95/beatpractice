// Typed wrappers around the Tauri commands that talk to the C++ core.
import { invoke } from "@tauri-apps/api/core";

export const BC = { IDLE: 0, DECODING: 1, ANALYZING: 2, READY: 3, ERROR: 4 } as const;

export interface InitInfo {
  loaded: boolean;
  dir: string | null;
  error: string | null;
}

export interface BeatNow {
  index: number;
  posInBar: number;
  barLength: number;
}

export interface CountInNow {
  beat: number; // 1-based number of the latest count-in click (0 = none yet)
  total: number;
}

export interface StemsNow {
  state: number; // 0 none, 1 running, 2 ready, 3 error
  progress: number;
  enabled: boolean;
}

export interface StemsInfo {
  supported: boolean; // the core library has stem separation
  available: boolean; // ... and the model file is installed and a song is ready
  cached: boolean; // the parts of this song are already on disk
  error: string;
  names: string[]; // e.g. drums, bass, other, vocals (when ready)
}

export interface Caps {
  clickSounds: number; // 0 = the loaded core is too old to offer metronome sounds
  countInBeats: boolean;
  stems: boolean; // the core can separate stems at all
  meterModes: boolean; // the core can re-read the bar structure in different modes
}

export interface Snapshot {
  state: number;
  progress: number;
  error: string;
  fromCache: boolean;
  duration: number;
  songBpm: number;
  playing: boolean;
  position: number;
  speed: number;
  countingIn: boolean;
  loopEnabled: boolean;
  beat: BeatNow | null;
  countIn: CountInNow | null;
  stems: StemsNow;
}

export interface ExportStatus {
  supported: boolean;
  state: number; // 0 none, 1 running, 2 done, 3 error
  progress: number;
  error: string;
}

export interface SongData {
  times: number[];
  posInBar: number[];
  barLength: number[];
  peaks: number[];
}

export const core = {
  init: () => invoke<InitInfo>("core_init"),
  load: (dir: string) => invoke<void>("core_load", { dir }),
  openFile: (path: string) => invoke<boolean>("core_open_file", { path }),
  unload: () => invoke<void>("core_unload"),
  snapshot: () => invoke<Snapshot>("core_snapshot"),
  caps: () => invoke<Caps>("core_caps"),
  stemsInfo: () => invoke<StemsInfo>("core_stems_info"),
  exportStart: (path: string, metronome: boolean) => invoke<boolean>("core_export_start", { path, metronome }),
  exportStatus: () => invoke<ExportStatus>("core_export_status"),
  exportCancel: () => invoke<void>("core_export_cancel"),
  stemsStart: () => invoke<boolean>("core_stems_start"),
  stemsCancel: () => invoke<void>("core_stems_cancel"),
  stemsEnable: (on: boolean) => invoke<void>("core_stems_enable", { on }),
  setStemGain: (index: number, gain: number) => invoke<void>("core_set_stem_gain", { index, gain }),
  setMeterMode: (mode: number) => invoke<boolean>("core_set_meter_mode", { mode }),
  setClickSound: (id: number) => invoke<void>("core_set_click_sound", { id }),
  songData: () => invoke<SongData>("core_song_data"),
  play: () => invoke<void>("core_play"),
  pause: () => invoke<void>("core_pause"),
  seek: (seconds: number) => invoke<void>("core_seek", { seconds }),
  setSpeed: (ratio: number) => invoke<void>("core_set_speed", { ratio }),
  setMetronome: (enabled: boolean, volume: number, accent: boolean) =>
    invoke<void>("core_set_metronome", { enabled, volume, accent }),
  setSongVolume: (volume: number) => invoke<void>("core_set_song_volume", { volume }),
  setCountIn: (bars: number, everyLoop: boolean) =>
    invoke<void>("core_set_count_in", { bars, everyLoop }),
  setLoop: (a: number, b: number) => invoke<boolean>("core_set_loop", { a, b }),
  clearLoop: () => invoke<void>("core_clear_loop"),
  snapToBar: (seconds: number) => invoke<number>("core_snap_to_bar", { seconds }),
  snapToBeat: (seconds: number) => invoke<number>("core_snap_to_beat", { seconds }),
};
