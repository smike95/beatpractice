import { useEffect, useRef, useState } from "react";
import { Play, SlidersHorizontal, Square, Volume2 } from "lucide-react";
import { core } from "../core";
import { Slider } from "./Slider";
import { MetronomeSettingsForm } from "./MetronomeSettingsForm";
import { MetronomeIcon } from "./MetronomeIcon";
import { BeatLamps } from "./MetronomeStrip";
import { QuickTempoBar } from "./QuickTempoBar";
import { Popover } from "./ui/Popover";

type Lang = "uk" | "en";
type Translate = (uk: string, en: string) => string;
const MIN_BPM = 30, MAX_BPM = 250;
const clampBpm = (v: number) => Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(v)));

/** Every block of the row is 48 px high, like the blocks of the song's metronome and tempo. */
const block = "flex h-12 items-center rounded-xl border border-slate-800 bg-slate-950 select-none";   // only the lamps are in a block
const plain = "flex h-12 items-center select-none";

/** Start / stop. The size is fixed and the icons are the same size, so nothing jumps when the state changes. */
function RunButton(props: { running: boolean; onToggle: () => void; L: Translate }) {
  const { running, onToggle, L } = props;
  const text = running ? L("Зупинити метроном", "Stop the metronome") : L("Запустити метроном", "Start the metronome");
  return (
    <button
      id="btn-click-metronome" type="button" onClick={onToggle} aria-pressed={running} title={text} aria-label={text}
      className={`h-9 w-24 shrink-0 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer text-white text-xs font-bold shadow-sm transition-colors duration-150 ${
        running ? "bg-rose-700 hover:bg-rose-600" : "bg-emerald-600 hover:bg-emerald-500"
      }`}
    >
      {running ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
      {running ? L("Стоп", "Stop") : L("Старт", "Start")}
    </button>
  );
}

/**
 * Free metronome. It is built like the metronome of the song, in one row that wraps by blocks:
 * 1) emblem, name, start / stop; 2) tempo and the settings button (accent, time signature, sound); 3) the lamps of the beats; then the volume.
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
  /** with a track open both metronomes share one volume, set by the mixer; this block shows its own slider only while the mixer's one is scrolled out of sight */
  hasTrack: boolean;
  sharedVolume: number;
  onSharedVolume: (v: number) => void;
  showVolume: boolean;
}) {
  const { lang, trackKey, defaults, soundCount, clickBeat, trackPlaying, onPauseTrack } = props;
  const L: Translate = (uk, en) => (lang === "en" ? en : uk);

  // what the user has changed; everything else follows the song
  const [own, setOwn] = useState<{ bpm?: number; beats?: number; accent?: boolean; volume?: number; sound?: number }>({});
  useEffect(() => setOwn({}), [trackKey]);
  const bpm = clampBpm(own.bpm ?? defaults.bpm);
  const beats = own.beats ?? defaults.beats;
  const accent = own.accent ?? defaults.accent;
  const volume = props.hasTrack ? props.sharedVolume : own.volume ?? defaults.volume;
  const setVolume = (v: number) => (props.hasTrack ? props.onSharedVolume(v) : setOwn((o) => ({ ...o, volume: v })));
  const sound = own.sound ?? defaults.sound;

  const [running, setRunning] = useState(false);
  const graceUntil = useRef(0);

  // send every change to the core while it is running
  useEffect(() => { if (running) core.clickSet(true, bpm, beats, accent, volume, sound).catch(() => {}); }, [running, bpm, beats, accent, volume, sound]);
  const stop = () => { setRunning(false); core.clickSet(false, bpm, beats, accent, volume, sound).catch(() => {}); };
  const start = () => { onPauseTrack(); graceUntil.current = Date.now() + 800; setRunning(true); };
  useEffect(() => { if (trackPlaying && running) stop(); }, [trackPlaying]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (running && clickBeat < 0 && Date.now() > graceUntil.current) setRunning(false); }, [clickBeat, running]);   // the core stopped it (a song was opened)
  useEffect(() => () => { core.clickSet(false, 100, 4, true, 1, 0).catch(() => {}); }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBox = useRef<HTMLDivElement>(null);
  const pct = Math.round(volume * 100);
  const setBpm = (v: number) => setOwn((o) => ({ ...o, bpm: clampBpm(v) }));

  return (
    <section id="click-metronome-panel" className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        {/* 1: emblem, name, start / stop */}
        <div className={`${plain} gap-3`}>
          <MetronomeIcon className={`h-6 w-6 shrink-0 ${running ? "text-slate-200" : "text-slate-400"}`} />
          <span className="text-sm font-bold text-slate-100 whitespace-nowrap">{L("Вільний метроном", "Free metronome")}</span>
        </div>

        {/* 2: tempo and the settings button */}
        <div ref={settingsBox} className="relative flex items-center gap-2">
          <QuickTempoBar
            hasTrack
            bare
            currentBpm={bpm}
            canReset={bpm !== clampBpm(defaults.bpm)}
            onChange={setBpm}
            onReset={() => setBpm(defaults.bpm)}
            labels={{
              minus5: L("Повільніше на 5", "Slower by 5"), minus1: L("Повільніше на 1", "Slower by 1"),
              plus1: L("Швидше на 1", "Faster by 1"), plus5: L("Швидше на 5", "Faster by 5"),
              reset: L("Темп відкритого треку", "Tempo of the open track"),
            }}
          />
          <div className={plain}>
            <button
              id="btn-click-metronome-settings" type="button" onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen} aria-haspopup="dialog"
              title={L("Налаштування метронома", "Metronome settings")} aria-label={L("Налаштування метронома", "Metronome settings")}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border cursor-pointer transition-colors duration-150 ${
                settingsOpen ? "seg-on border-transparent" : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
              }`}
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
          </div>
          <Popover open={settingsOpen} onClose={() => setSettingsOpen(false)} containerRef={settingsBox} ariaLabel={L("Налаштування метронома", "Metronome settings")} id="click-metronome-settings-popover" align="left">
            <h3 className="text-sm font-bold text-slate-100">{L("Налаштування метронома", "Metronome settings")}</h3>
            <MetronomeSettingsForm
              lang={lang}
              accent={accent} onAccent={(v) => setOwn((o) => ({ ...o, accent: v }))}
              beats={{ value: beats, onChange: (n) => setOwn((o) => ({ ...o, beats: n })) }}
              sound={sound} soundCount={soundCount} onSound={(id) => setOwn((o) => ({ ...o, sound: id }))}
            />
          </Popover>
        </div>

        {/* 3: the lamps of the beats */}
        <div className={`${block} px-3`}>
          <BeatLamps id="click-metronome-visual-beats" lang={lang} beatsPerBar={beats} activeBeat={running ? clickBeat : -1} />
        </div>

        {/* volume: the same channel as the metronome in the mixer of the song; only while the mixer's slider is out of sight */}
        {props.showVolume && (
        <div className={`${plain} min-w-[220px] flex-1 gap-2`}>
          <Volume2 className="h-6 w-6 shrink-0 text-slate-300 mixer-icon" aria-hidden="true" />
          <span className="mixer-label shrink-0 text-xs font-semibold text-slate-300">{L("Гучність", "Volume")}</span>
          <Slider id="range-click-volume" min={0} max={2} step={0.01} value={volume} onChange={setVolume} title={`${pct}%`} ariaLabel={L("Гучність метронома", "Metronome volume")} className="min-w-[70px] flex-1" />
          <span className="mixer-value w-11 shrink-0 text-right font-mono text-xs font-bold text-slate-200">{pct}%</span>
        </div>
        )}
        {/* start / stop: always the rightmost block */}
        <div className="ml-auto flex h-12 items-center">
          <RunButton running={running} onToggle={() => (running ? stop() : start())} L={L} />
        </div>
      </div>
    </section>
  );
}
