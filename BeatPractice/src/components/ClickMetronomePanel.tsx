import { useEffect, useRef, useState } from "react";
import { Play, Square, Zap } from "lucide-react";
import { core } from "../core";
import { CLICK_SOUND_NAMES } from "../types";
import { Slider } from "./Slider";
import { Switch } from "./Switch";
import { MetronomeIcon } from "./MetronomeIcon";

type Lang = "uk" | "en";
type Translate = (uk: string, en: string) => string;
const MIN_BPM = 30, MAX_BPM = 250;
const clampBpm = (v: number) => Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(v)));

/* ------------------------------------------------------------------ */
/* Shared look of this panel (one place instead of repeated strings). */
/* Touch targets: 44 px on phones, a little denser from `sm` upwards. */
/* ------------------------------------------------------------------ */
const ui = {
  card: "rounded-2xl border border-slate-800 bg-slate-900 p-3 sm:p-4 space-y-4 shadow-sm",
  inset: "rounded-xl border border-slate-800 bg-slate-950",
  stepBtn:
    "h-11 sm:h-10 sm:min-w-[2.75rem] px-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 " +
    "text-sm font-bold tabular-nums text-slate-200 cursor-pointer select-none transition-colors duration-150",
  chip: (active: boolean) =>
    `h-11 sm:h-9 rounded-lg border text-xs font-bold cursor-pointer select-none transition-colors duration-150 ` +
    `disabled:opacity-40 disabled:cursor-not-allowed ${
      active ? "bg-slate-700 text-white border-sky-500 border-2" : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
    }`,
};

/** Start / stop. The size is fixed (48 × 48) and the icons are the same size, so nothing jumps when the state changes. */
function RunButton(props: { running: boolean; onToggle: () => void; L: Translate }) {
  const { running, onToggle, L } = props;
  const text = running ? L("Зупинити метроном", "Stop the metronome") : L("Запустити метроном", "Start the metronome");
  return (
    <button
      id="btn-click-metronome" type="button" onClick={onToggle} aria-pressed={running} title={text} aria-label={text}
      className={`h-12 w-12 shrink-0 rounded-xl flex items-center justify-center cursor-pointer text-white shadow-sm transition-colors duration-150 ${
        running ? "bg-rose-700 hover:bg-rose-600" : "bg-sky-700 hover:bg-sky-600"
      }`}
    >
      {running ? <Square className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
    </button>
  );
}

/** Dots of the bar; the one that clicks now lights up. */
function BeatDots(props: { beats: number; accent: boolean; active: number }) {
  const { beats, accent, active } = props;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: beats }, (_, i) => (
        <span
          key={i}
          className={`h-3.5 w-3.5 rounded-full border transition-colors duration-100 ${
            active === i ? (accent && i === 0 ? "bg-amber-400 border-amber-300" : "bg-sky-400 border-sky-300") : "border-slate-600"
          }`}
        />
      ))}
    </div>
  );
}

/** Tempo: the field with − / + steps. On a phone the field is on top and the six steps form one row below it. */
function BpmControl(props: {
  bpm: number; draft: string | null; L: Translate;
  onStep: (d: number) => void; onDraft: (v: string | null) => void; onCommit: () => void;
}) {
  const { bpm, draft, L, onStep, onDraft, onCommit } = props;
  const step = (d: number) => (
    <button
      key={d} type="button" className={ui.stepBtn} onClick={() => onStep(d)}
      aria-label={d < 0 ? L(`Повільніше на ${-d}`, `Slower by ${-d}`) : L(`Швидше на ${d}`, `Faster by ${d}`)}
    >
      {d < 0 ? `−${-d}` : `+${d}`}
    </button>
  );
  return (
    <div className="grid w-full grid-cols-6 gap-1.5 sm:flex sm:w-auto sm:items-center sm:ml-auto">
      {[-10, -5, -1].map(step)}
      <input
        id="click-metronome-bpm" type="text" inputMode="numeric" value={draft ?? String(bpm)}
        onChange={(e) => onDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
        onFocus={(e) => e.target.select()} onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { onDraft(null); (e.target as HTMLInputElement).blur(); }
        }}
        aria-label="BPM" title="BPM"
        className="col-span-6 row-start-1 mb-1 h-12 w-full rounded-lg border border-slate-700 bg-transparent text-center font-mono text-2xl font-bold tabular-nums transition-colors duration-150 sm:col-auto sm:mb-0 sm:h-10 sm:w-16"
      />
      {[1, 5, 10].map(step)}
    </div>
  );
}

/** Beats per bar (2 to 7). */
function BeatsPicker(props: { beats: number; L: Translate; onPick: (n: number) => void }) {
  const { beats, L, onPick } = props;
  return (
    <div className="grid grid-cols-6 gap-1.5 sm:flex" role="group" aria-label={L("Долей у такті", "Beats per bar")}>
      {[2, 3, 4, 5, 6, 7].map((n) => (
        <button key={n} type="button" onClick={() => onPick(n)} aria-pressed={beats === n} className={`${ui.chip(beats === n)} sm:w-9`}>
          {n}
        </button>
      ))}
    </div>
  );
}

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
  const L: Translate = (uk, en) => (lang === "en" ? en : uk);

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
  const pct = Math.round(volume * 100);

  return (
    <section id="click-metronome-panel" className={ui.card}>
      {/* start, beat dots and tempo */}
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-3 px-3 py-3 ${ui.inset}`}>
        <RunButton running={running} onToggle={() => (running ? stop() : start())} L={L} />
        <BeatDots beats={beats} accent={accent} active={running ? clickBeat : -1} />
        <BpmControl bpm={bpm} draft={draft} L={L} onStep={step} onDraft={setDraft} onCommit={commitDraft} />
      </div>

      {/* beats per bar, volume, accent */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <BeatsPicker beats={beats} L={L} onPick={(n) => setOwn((o) => ({ ...o, beats: n }))} />

        <div className={`flex min-w-[min(220px,100%)] flex-1 items-center gap-2 px-3 py-2 ${ui.inset}`}>
          <MetronomeIcon className="h-6 w-6 shrink-0 text-slate-300" />
          <Slider id="range-click-volume" min={0} max={2} step={0.01} value={volume} onChange={(v: number) => setOwn((o) => ({ ...o, volume: v }))} title={`${pct}%`} ariaLabel={L("Гучність метронома", "Metronome volume")} className="min-w-[70px] flex-1" />
          <span className="w-12 shrink-0 text-right font-mono text-xs font-bold text-slate-200">{pct}%</span>
        </div>

        <div className={`flex items-center gap-2 px-3 py-2 ${ui.inset}`}>
          <Zap className="h-6 w-6 shrink-0 text-slate-300" />
          <Switch id="switch-click-accent" checked={accent} onChange={(v) => setOwn((o) => ({ ...o, accent: v }))} label={L("Акцент на першій долі", "Accent on the first beat")} />
        </div>
      </div>

      {/* sound */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label={L("Звук метронома", "Metronome sound")}>
        {CLICK_SOUND_NAMES.map(([uk, en], id) => (
          <button key={id} type="button" disabled={soundCount <= id} onClick={() => setOwn((o) => ({ ...o, sound: id }))} className={`${ui.chip(sound === id && soundCount > 0)} px-3`}>
            {lang === "en" ? en : uk}
          </button>
        ))}
      </div>
    </section>
  );
}
