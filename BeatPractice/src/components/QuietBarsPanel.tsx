import { Volume2 } from "lucide-react";
import { MetronomeConfig } from "../types";
import { NumberStepper } from "./NumberStepper";
import { Switch } from "./Switch";

type Lang = "uk" | "en";

/** Training: the metronome sounds for some bars and is silent for some bars, over and over. Works with a track, a loop and without a track. */
export function QuietBarsPanel(props: {
  lang: Lang;
  config: MetronomeConfig;
  onChange: (patch: Partial<MetronomeConfig>) => void;
  loopOn: boolean;
}) {
  const { lang, config, onChange, loopOn } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const { quietEnabled: on, quietClickBars: cb, quietBars: qb } = config;
  return (
    <section id="quiet-bars-panel" className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-100 uppercase tracking-wide">
          <Volume2 className="w-6 h-6" />
          {L("Тихі такти", "Quiet bars")}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-400">{on ? L("Увімкнено", "On") : L("Вимкнено", "Off")}</span>
          <Switch checked={on} onChange={() => onChange({ quietEnabled: !on })} label={on ? L("Вимкнути тихі такти", "Turn quiet bars off") : L("Увімкнути тихі такти", "Turn quiet bars on")} />
        </div>
      </div>
      <p className="text-xs text-slate-400">
        {L(
          "Метроном лунає кілька тактів, потім кілька тактів мовчить, і так по колу. Грайте ці такти самі й перевіряйте, чи не втекли від темпу. З циклом схема починається спочатку на кожному проході.",
          "The metronome sounds for some bars, then is silent for some bars, over and over. Play through the silent bars on your own and check that you kept the tempo. With a loop the pattern starts again on every pass.",
        )}
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="space-y-1">
          <div className="track-edit-label text-xs">{L("З метрономом, тактів", "With the metronome, bars")}</div>
          <NumberStepper id="quiet-click-bars" value={cb} min={1} max={16} label={L("Тактів із метрономом", "Bars with the metronome")} onChange={(v) => onChange({ quietClickBars: v })} />
        </div>
        <div className="space-y-1">
          <div className="track-edit-label text-xs">{L("Без метронома, тактів", "Without it, bars")}</div>
          <NumberStepper id="quiet-silent-bars" value={qb} min={1} max={16} label={L("Тактів без метронома", "Silent bars")} onChange={(v) => onChange({ quietBars: v })} />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {L(`Схема: ${cb} з кліком, ${qb} без.`, `Pattern: ${cb} with clicks, ${qb} silent.`)}{" "}
        {loopOn ? L("Лічба тактів іде від початку циклу.", "Bars are counted from the loop start.") : L("Лічба тактів іде від першого такту треку.", "Bars are counted from the first bar of the track.")}
        {!config.enabled && ` ${L("Метроном зараз вимкнений у «Мікшері»: схема не буде чутна.", "The metronome is off in the “Mixer”: the pattern will not be heard.")}`}
      </p>
    </section>
  );
}
