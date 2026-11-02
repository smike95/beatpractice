import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { Slider } from "./Slider";

type Lang = "uk" | "en";
const KEY = "beatpractice_click_metronome";
const MIN_BPM = 30, MAX_BPM = 250;
const clampBpm = (v: number) => Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(v)));

function loadSaved(): { bpm: number; beats: number } {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { bpm: clampBpm(Number(o.bpm) || 100), beats: [2, 3, 4, 5, 6, 7].includes(o.beats) ? o.beats : 4 };
  } catch { return { bpm: 100, beats: 4 }; }
}

/**
 * Metronome without a track (Training tab): start/stop and the tempo. It makes the clicks itself (Web Audio, scheduled a little ahead
 * so the beat stays even), independent of the song. The click level and the accent follow the main metronome settings.
 * It never plays together with the track: starting it pauses the track, and starting the track stops it.
 */
export function ClickMetronomePanel(props: {
  lang: Lang;
  volume: number;          // 0..2, the metronome level from the mixer
  accent: boolean;         // accent on the first beat
  quiet?: { enabled: boolean; clickBars: number; quietBars: number };   // quiet bars, as in the Training tab
  trackPlaying: boolean;
  onPauseTrack: () => void;
}) {
  const { lang, volume, accent, quiet, trackPlaying, onPauseTrack } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const saved = useRef(loadSaved());
  const [bpm, setBpm] = useState(saved.current.bpm);
  const [beats, setBeats] = useState(saved.current.beats);
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);   // text being typed into the tempo field
  const [flash, setFlash] = useState(-1);          // beat that sounds now (for the indicator)

  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const flashTimers = useRef<number[]>([]);
  const live = useRef({ bpm, beats, volume, accent, quiet });
  live.current = { bpm, beats, volume, accent, quiet };

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ bpm, beats })); } catch { /* ignore */ } }, [bpm, beats]);

  const stop = useCallback(() => {
    if (timerRef.current !== null) { window.clearInterval(timerRef.current); timerRef.current = null; }
    flashTimers.current.forEach((t) => window.clearTimeout(t)); flashTimers.current = [];
    setRunning(false); setFlash(-1);
  }, []);

  const start = useCallback(async () => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!ctxRef.current) ctxRef.current = new AC();
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") await ctx.resume();
      onPauseTrack();
      let beatIdx = 0;
      let next = ctx.currentTime + 0.08;
      const click = (t: number, strong: boolean) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "square"; o.frequency.value = strong ? 1800 : 1200;
        const peak = Math.min(1, 0.35 * live.current.volume);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
        o.connect(g).connect(ctx.destination);
        o.start(t); o.stop(t + 0.06);
      };
      const tick = () => {
        // schedule every beat that falls into the next 120 ms; the tempo is read again for each beat
        while (next < ctx.currentTime + 0.12) {
          const { bpm: b, beats: n, accent: acc, quiet: q } = live.current;
          const pos = beatIdx % n;
          // quiet bars: the bars are counted from the start, `clickBars` with clicks, then `quietBars` without
          const bar = Math.floor(beatIdx / n);
          const silent = !!q && q.enabled && bar % (q.clickBars + q.quietBars) >= q.clickBars;
          if (!silent) click(next, acc && pos === 0);
          const delay = Math.max(0, (next - ctx.currentTime) * 1000);
          const id = window.setTimeout(() => setFlash(silent ? -1 : pos), delay);
          flashTimers.current.push(id);
          if (flashTimers.current.length > 16) flashTimers.current.shift();
          next += 60 / b;
          beatIdx++;
        }
      };
      tick();
      timerRef.current = window.setInterval(tick, 25);
      setRunning(true);
    } catch { stop(); }
  }, [onPauseTrack, stop]);

  // the track and this metronome never play together
  useEffect(() => { if (trackPlaying && running) stop(); }, [trackPlaying, running, stop]);
  useEffect(() => () => { stop(); void ctxRef.current?.close(); ctxRef.current = null; }, [stop]);

  const step = (d: number) => { setDraft(null); setBpm((v) => clampBpm(v + d)); };
  const stepBtn = "min-w-[2.75rem] h-10 px-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-sm font-bold tabular-nums cursor-pointer text-slate-200";
  const commitDraft = () => {
    if (draft !== null) { const n = parseInt(draft, 10); if (!isNaN(n)) setBpm(clampBpm(n)); setDraft(null); }
  };

  return (
    <section id="click-metronome-panel" className="rounded-xl border border-slate-800 px-3 py-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          id="btn-click-metronome"
          type="button"
          onClick={() => (running ? stop() : void start())}
          aria-pressed={running}
          className={`px-4 py-2 rounded-lg font-bold inline-flex items-center gap-2 cursor-pointer text-white ${running ? "bg-rose-700 hover:bg-rose-600" : "bg-sky-700 hover:bg-sky-600"}`}
        >
          {running ? <><Square className="w-5 h-5 fill-current" />{L("Зупинити", "Stop")}</> : <><Play className="w-5 h-5 fill-current" />{L("Запустити", "Start")}</>}
        </button>
        <div className="text-sm font-semibold">{L("Метроном без треку", "Metronome without a track")}</div>
        <div className="flex items-center gap-1.5 ml-auto" aria-hidden={!running}>
          {Array.from({ length: beats }, (_, i) => (
            <span key={i} className={`w-3.5 h-3.5 rounded-full border ${flash === i ? (accent && i === 0 ? "bg-amber-400 border-amber-300" : "bg-sky-400 border-sky-300") : "border-slate-600"}`} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {[-10, -5, -1].map((d) => (
          <button key={d} type="button" className={stepBtn} onClick={() => step(d)} aria-label={L(`Повільніше на ${-d}`, `Slower by ${-d}`)}>−{-d}</button>
        ))}
        <label className="flex items-baseline gap-1 mx-1">
          <input
            id="click-metronome-bpm"
            type="text"
            inputMode="numeric"
            value={draft ?? String(bpm)}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            onFocus={(e) => e.target.select()}
            onBlur={commitDraft}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setDraft(null); (e.target as HTMLInputElement).blur(); } }}
            aria-label={L("Темп, BPM (можна ввести вручну)", "Tempo, BPM (type a value)")}
            className="w-16 h-10 text-center font-mono text-2xl font-bold tabular-nums rounded-lg border border-slate-700 bg-transparent"
          />
          <span className="text-xs font-semibold text-slate-400">BPM</span>
        </label>
        {[1, 5, 10].map((d) => (
          <button key={d} type="button" className={stepBtn} onClick={() => step(d)} aria-label={L(`Швидше на ${d}`, `Faster by ${d}`)}>+{d}</button>
        ))}
      </div>
      <Slider value={bpm} min={MIN_BPM} max={MAX_BPM} step={1} onChange={(v: number) => setBpm(clampBpm(v))} ariaLabel="BPM" className="w-full" />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="track-edit-label">{L("Долей у такті", "Beats per bar")}:</span>
        {[2, 3, 4, 5, 6, 7].map((n) => (
          <button key={n} type="button" onClick={() => setBeats(n)} aria-pressed={beats === n}
            className={`w-8 h-8 rounded-lg border text-xs font-bold cursor-pointer ${beats === n ? "bg-sky-700 text-white border-sky-700" : "border-slate-700 hover:bg-slate-800"}`}>{n}</button>
        ))}
      </div>
      <p className="track-edit-label text-xs">{L("Гучність і акцент на першій долі беруться з налаштувань метронома в «Мікшері». З треком одночасно не грає.", "Level and the accent on the first beat follow the metronome settings in the “Mixer”. It does not play together with a track.")}</p>
    </section>
  );
}
