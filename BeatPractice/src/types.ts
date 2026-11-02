// Types shared by the UI. Audio data itself lives in the C++ core; the UI only keeps numbers.

export type TimeSignature = string; // e.g. "4/4", "3/4"

export interface LoopRange {
  active: boolean;
  start: number; // seconds
  end: number; // seconds
}

/** One of the saved training loops (bar boundaries, in song seconds). */
export interface LoopSlot {
  start: number;
  end: number;
  name?: string; // set by the user; shown everywhere instead of "Loop N"
}

/** The name of a loop: the user's own, or "Цикл N". Used in the loop list, on the waveform and in the export. */
export function loopLabel(slot: LoopSlot | undefined, index: number, lang: "uk" | "en"): string {
  const n = slot?.name?.trim();
  return n ? n : `${lang === "en" ? "Loop" : "Цикл"} ${index + 1}`;
}

/** Levels of the separated parts, by index (drums, bass, other, vocals ...). */
export interface StemMix {
  gain: number[]; // 0..1.5
  mute: boolean[];
  solo: boolean[];
}

export type PlayMode = "stop" | "repeat" | "next"; // what to do when the song ends

export interface AudioTrackInfo {
  name: string;
  duration: number;
  originalBpm: number; // tempo of the song as found by the analyzer (whole number, for comparisons)
  originalBpmExact?: number; // the same, to tenths, for display
  currentBpm: number; // tempo at the current speed
  timeSignature: TimeSignature;
}

export interface PlaylistItem {
  id: string;
  name: string;
  path: string;
  trackInfo: AudioTrackInfo;
  speed: number; // playback ratio remembered for this track
  loops: LoopSlot[]; // up to 3 training loops
  activeLoop: number | null; // index of the loop that is switched on
  meterMode?: number; // 0 automatic, 1 sensitive, 2 strict (3 and 4 beats only)
  artist?: string; // set by the user
  title?: string;
  cover?: string; // small picture as a data URL
  stemMix?: StemMix; // levels of the separated parts for this track
  stemsOn?: boolean; // the separated parts are what is played
  addedAt: number;
}

export type ThemeMode = "dark" | "light" | "system";

export interface MetronomeConfig {
  enabled: boolean;
  volume: number; // 0..2
  accentFirstBeat: boolean;
  countInBars: number; // 0, 1 or 2
  countInOnLoop: boolean;
  quietEnabled: boolean; // quiet bars: some bars with clicks, then some bars without
  quietClickBars: number; // bars with clicks (1..16)
  quietBars: number; // silent bars (1..16)
}
