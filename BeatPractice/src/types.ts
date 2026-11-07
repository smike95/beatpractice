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
  countInOnlyAtStart?: boolean; // count-in only when playing from the start (not when resuming after a pause); default: before every play
  quietContinue?: boolean;      // quiet bars keep counting over loop repeats (default: every pass starts the pattern again)
}

/** "1 такт", "2 такти", "5 тактів" (Ukrainian plural rules), "1 bar" / "8 bars". Always spelled out. */
export function barsText(n: number, lang: "uk" | "en"): string {
  if (lang === "en") return `${n} ${n === 1 ? "bar" : "bars"}`;
  const m10 = n % 10, m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? "такт" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "такти" : "тактів";
  return `${n} ${word}`;
}

/** Every loop has its own colour everywhere in the interface (list, waveform). */
const LOOP_PALETTE = [
  { light: "#007aff", dark: "#409cff" },   // blue
  { light: "#af52de", dark: "#ca78f6" },   // violet
  { light: "#d97706", dark: "#fbbf24" },   // amber
  { light: "#059669", dark: "#34d399" },   // green
  { light: "#db2777", dark: "#f472b6" },   // pink
  { light: "#0d9488", dark: "#2dd4bf" },   // teal
];
export function loopColor(index: number, isDark: boolean): { solid: string; fill: string; fillStrong: string; text: string } {
  const p = LOOP_PALETTE[((index % LOOP_PALETTE.length) + LOOP_PALETTE.length) % LOOP_PALETTE.length];
  const solid = isDark ? p.dark : p.light;
  const r = parseInt(solid.slice(1, 3), 16), g = parseInt(solid.slice(3, 5), 16), b = parseInt(solid.slice(5, 7), 16);
  return { solid, fill: `rgba(${r},${g},${b},0.14)`, fillStrong: `rgba(${r},${g},${b},0.30)`, text: isDark ? "#1d1d1f" : "#ffffff" };
}

/** Names of the metronome sounds, in the order of the core: [Ukrainian, English]. */
export const CLICK_SOUND_NAMES: Array<[string, string]> = [
  ["Класичний", "Classic"], ["Дерев'яний блок", "Wood block"], ["Хай-хет", "Hi-hat"],
  ["Рім-клік", "Rim click"], ["Ковбел", "Cowbell"], ["Електронний біп", "Electronic beep"],
];
