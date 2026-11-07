import { useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { MetronomeIcon } from "./MetronomeIcon";
import { Switch } from "./Switch";
import { Popover } from "./ui/Popover";
import { MetronomeSettingsForm } from "./MetronomeSettingsForm";

type Lang = "uk" | "en";

/**
 * The lamps of the beats of a bar; the one that sounds now lights up (the first beat is red when it is accented, the others use the accent colour).
 * The id is used by the light-theme rules in index.css: the song's metronome and the free metronome each have their own.
 */
export function BeatLamps(props: { lang: Lang; beatsPerBar: number; activeBeat: number; id?: string }) {
  const { lang, beatsPerBar, activeBeat, id = "quick-metronome-visual-beats" } = props;
  return (
    <div id={id} className="flex items-center gap-1" title={lang === "en" ? "Metronome visual clicks" : "Візуальні кліки метронома"}>
      {Array.from({ length: beatsPerBar }).map((_, idx) => {
        const active = activeBeat === idx;
        return (
          <div
            key={idx}
            className={`flex h-6 w-6 items-center justify-center rounded font-mono text-xs font-bold transition-all duration-75 ${
              active
                ? idx === 0
                  ? "scale-110 bg-rose-500 font-black text-white shadow-[0_0_8px_rgba(244,63,94,0.8)]"
                  : "beat-non-accent-active scale-105 bg-sky-600 font-black text-white shadow-[0_0_8px_rgba(0,122,255,0.8)] dark:bg-sky-400 dark:text-slate-950 dark:shadow-[0_0_8px_rgba(191,90,242,0.8)]"
                : "beat-inactive border border-slate-800 bg-slate-900 text-slate-400"
            }`}
          >
            {idx + 1}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The metronome of the song in one block: icon, on / off switch, meter, the lamps of the beats and the settings button.
 * The button opens a small window with the settings (accent, count-in, sound, when the count-in sounds).
 * `#quick-metronome-visual-beats` is used by the light-theme rules in index.css: keep it on the lamps.
 */
export function MetronomeStrip(props: {
  lang: Lang;
  enabled: boolean;
  onToggle: () => void;
  meter: string;
  beatsPerBar: number;
  activeBeat: number;               // 0-based position in the bar of the beat that sounds now, -1 = none
  accent: boolean; onAccent: (v: boolean) => void;
  countInBars: number; onCountInBars: (n: number) => void;
  countInOnlyAtStart: boolean; onCountInMode: (onlyAtStart: boolean) => void;
  sound: number; soundCount: number; onSound: (id: number) => void;
}) {
  const { lang, enabled, onToggle, meter, beatsPerBar, activeBeat } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  return (
    <div ref={box} className="relative">
      <div id="quick-metronome-strip" className="flex h-12 items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 select-none">
        <MetronomeIcon className={`h-6 w-6 shrink-0 ${enabled ? "text-slate-200" : "text-slate-500"}`} />
        <Switch id="quick-switch-metronome" checked={enabled} onChange={onToggle} label={enabled ? L("Вимкнути метроном", "Turn the metronome off") : L("Увімкнути метроном", "Turn the metronome on")} />
        <span className="font-mono text-xs font-bold text-slate-400" title={L("Тактовий розмір", "Time signature")}>{meter}</span>
        <BeatLamps lang={lang} beatsPerBar={beatsPerBar} activeBeat={activeBeat} />
        <button
          id="btn-metronome-settings"
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={L("Налаштування метронома", "Metronome settings")}
          aria-label={L("Налаштування метронома", "Metronome settings")}
          className={`ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border cursor-pointer transition-colors duration-150 ${
            open ? "seg-on border-transparent" : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
          }`}
        >
          <SlidersHorizontal className="h-5 w-5" />
        </button>
      </div>
      <Popover open={open} onClose={() => setOpen(false)} containerRef={box} ariaLabel={L("Налаштування метронома", "Metronome settings")} id="metronome-settings-popover">
        <h3 className="text-sm font-bold text-slate-100">{L("Налаштування метронома", "Metronome settings")}</h3>
        <MetronomeSettingsForm
          lang={lang}
          accent={props.accent} onAccent={props.onAccent}
          sound={props.sound} soundCount={props.soundCount} onSound={props.onSound}
          countIn={{ bars: props.countInBars, onBars: props.onCountInBars, onlyAtStart: props.countInOnlyAtStart, onMode: props.onCountInMode }}
        />
      </Popover>
    </div>
  );
}
