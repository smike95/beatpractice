import { useEffect, useRef, useState } from "react";
import { Play, Square, Zap } from "lucide-react";
import { core } from "../core";
import { CLICK_SOUND_NAMES } from "../types";
import { Slider } from "./Slider";
import { Switch } from "./Switch";
import { MetronomeIcon } from "./MetronomeIcon";

type Lang = "uk" | "en";
const MIN_BPM = 30, MAX_BPM = 250;
const clampBpm = (v: number) => Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(v)));

/**
 * Metronome with no track (Training tab, at the bottom): start / stop, tempo (buttons and typing), beats per bar, its OWN accent, volume and sound.
 * It starts with the tempo, accent, volume and sound of the opened song and changes only what the user changes. The quiet bars do not touch it.
 * The clicks are made by the core (the same sounds as the main metronome, even timing). It never plays together with the track.
 */
export function ClickMetronomePanel(props: {
  lang: Lang;
  trackKey: string;                 // changes with the song: the defaults are taken again
  defaults: { bpm: number; beats: number; accent: boolean; volume: number; sound: number };
  soundCount: number;               // how many sounds the core has
  clickBeat: number;                // position in the bar of the last click, -1 = off (from the snapshot)
  trackPlaying: boolean;
  onPauseTrack: () => void;
}) {
  const { lang, trackKey, defaults, soundCount, clickBeat, trackPlaying, onPauseTrack } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);

  // what the user has changed; everything else follows the song
  const [own, setOwn] = useState<{ bpm?: number; beats?: number; accent?: boolean; volume?: number; sound?: number }>({});
  useEffect(() => setOwn({}), [trackKey]);
  const bpm = clampBpm(own.bpm ?? defaults.bpm);
  const beats = own.beats ?? defaults.beats;
  const accent = own.accent ?? defaults.accent;
  const volume = own.volume ?? defaults.volume;
  const sound = own.sound ?? defaults.sound;

  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const graceUntil = useRef(0);

  // send every change to the core while it is running
  useEffect(() => { if (running) core.clickSet(true, bpm, beats, accent, volume, sound).catch(() => {}); }, [running, bpm, beats, accent, volume, sound]);
  const stop = () => { setRunning(false); core.clickSet(false, bpm, beats, accent, volume, sound).catch(() => {}); };
  const start = () => { onPauseTrack(); graceUntil.current = Date.now() + 800; setRunning(true); };
  useEffect(() => { if (trackPlaying && running) stop(); }, [trackPlaying]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (running && clickBeat < 0 && Date.now() > graceUntil.current) setRunning(false); }, [clickBeat, running]);   // the core stopped it (a song was opened)
  useEffect(() => () => { core.clickSet(false, 100, 4, true, 1, 0).catch(() => {}); }, []);

  const step = (d: number) => { setDraft(null); setOwn((o) => ({ ...o, bpm: clampBpm(bpm + d) })); };
  const commitDraft = () => {
    if (draft !== null) { const n = parseInt(draft, 10); if (!isNaN(n)) setOwn((o) => ({ ...o, bpm: clampBpm(n) })); setDraft(null); }
  };
  const stepBtn = "min-w-[2.75rem] h-10 px-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-sm font-bold tabular-nums cursor-pointer text-slate-200";
  const pct = Math.round(volume * 100);

  return (
    <section id="click-metronome-panel" className="rounded-2xl border border-slate-800 bg-slate-900 p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3 bg-slate-950 rounded-xl border border-slate-800 px-3 py-2.5">
        <button
          id="btn-click-metronome" type="button" onClick={() => (running ? stop() : start())} aria-pressed={running}
          title={running ? L("Зупинити метроном", "Stop the metronome") : L("Запустити метроном", "Start the metronome")}
          aria-label={running ? L("Зупинити метроном", "Stop the metronome") : L("Запустити метроном", "Start the metronome")}
          className={`w-12 h-12 rounded-xl flex items-center justify-center cursor-pointer text-white ${running ? "bg-rose-700 hover:bg-rose-600" : "bg-sky-700 hover:bg-sky-600"}`}
        >
          {running ? <Square className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
        </button>

        <div className="flex items-center gap-1.5" aria-hidden="true">
          {Array.from({ length: beats }, (_, i) => (
            <span key={i} className={`w-3.5 h-3.5 rounded-full border ${running && clickBeat === i ? (accent && i === 0 ? "bg-amber-400 border-amber-300" : "bg-sky-400 border-sky-300") : "border-slate-600"}`} />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          {[-10, -5, -1].map((d) => <button key={d} type="button" className={stepBtn} onClick={() => step(d)} aria-label={L(`Повільніше на ${-d}`, `Slower by ${-d}`)}>−{-d}</button>)}
          <input
            id="click-metronome-bpm" type="text" inputMode="numeric" value={draft ?? String(bpm)}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            onFocus={(e) => e.target.select()} onBlur={commitDraft}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setDraft(null); (e.target as HTMLInputElement).blur(); } }}
            aria-label="BPM" title="BPM"
            className="w-16 h-10 text-center font-mono text-2xl font-bold tabular-nums rounded-lg border border-slate-700 bg-transparent"
          />
          {[1, 5, 10].map((d) => <button key={d} type="button" className={stepBtn} onClick={() => step(d)} aria-label={L(`Швидше на ${d}`, `Faster by ${d}`)}>+{d}</button>)}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-1.5" role="group" aria-label={L("Долей у такті", "Beats per bar")}>
          {[2, 3, 4, 5, 6, 7].map((n) => (
            <button key={n} type="button" onClick={() => setOwn((o) => ({ ...o, beats: n }))} aria-pressed={beats === n}
              className={`w-8 h-8 rounded-lg border text-xs font-bold cursor-pointer ${beats === n ? "bg-slate-700 text-white border-sky-500 border-2" : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"}`}>{n}</button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex-1 min-w-[220px]">
          <MetronomeIcon className="w-6 h-6 text-slate-300 shrink-0" />
          <Slider id="range-click-volume" min={0} max={2} step={0.01} value={volume} onChange={(v: number) => setOwn((o) => ({ ...o, volume: v }))} title={`${pct}%`} className="flex-1 min-w-[70px]" />
          <span className="font-mono font-bold text-slate-200 w-12 text-right text-xs shrink-0">{pct}%</span>
        </div>

        <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
          <Zap className="w-6 h-6 text-slate-300" />
          <Switch id="switch-click-accent" checked={accent} onChange={(v) => setOwn((o) => ({ ...o, accent: v }))} label={L("Акцент на першій долі", "Accent on the first beat")} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={L("Звук метронома", "Metronome sound")}>
        {CLICK_SOUND_NAMES.map(([uk, en], id) => (
          <button key={id} type="button" disabled={soundCount <= id} onClick={() => setOwn((o) => ({ ...o, sound: id }))}
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              sound === id && soundCount > 0 ? "bg-slate-700 text-white border-sky-500 border-2" : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"}`}>
            {lang === "en" ? en : uk}
          </button>
        ))}
      </div>
    </section>
  );
}
