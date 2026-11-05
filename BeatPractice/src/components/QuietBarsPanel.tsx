import { Volume2 } from "lucide-react";
import { MetronomeConfig } from "../types";
import { NumberStepper } from "./NumberStepper";
import { Switch } from "./Switch";
import { PanelCard } from "./ui/PanelCard";
import { Field } from "./ui/Field";
import { StableLabel } from "./ui/StableLabel";

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
    <PanelCard
      id="quiet-bars-panel"
      icon={<Volume2 className="w-6 h-6" />}
      title={L("Тихі такти", "Quiet bars")}
      actions={
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-400"><StableLabel align="text-right" active={on ? 1 : 0} labels={[L("Вимкнено", "Off"), L("Увімкнено", "On")]} /></span>
          <Switch checked={on} onChange={() => onChange({ quietEnabled: !on })} label={on ? L("Вимкнути тихі такти", "Turn quiet bars off") : L("Увімкнути тихі такти", "Turn quiet bars on")} />
        </div>
      }
    >
      <p className="text-xs text-slate-400">
        {L(
          "Метроном лунає кілька тактів, потім кілька тактів мовчить, і так по колу. Грайте ці такти самі й перевіряйте, чи не втекли від темпу. З циклом схема починається спочатку на кожному проході.",
          "The metronome sounds for some bars, then is silent for some bars, over and over. Play through the silent bars on your own and check that you kept the tempo. With a loop the pattern starts again on every pass.",
        )}
      </p>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <Field label={L("З метрономом, тактів", "With the metronome, bars")}>
          <NumberStepper id="quiet-click-bars" value={cb} min={1} max={16} label={L("Тактів із метрономом", "Bars with the metronome")} onChange={(v) => onChange({ quietClickBars: v })} />
        </Field>
        <Field label={L("Без метронома, тактів", "Without it, bars")}>
          <NumberStepper id="quiet-silent-bars" value={qb} min={1} max={16} label={L("Тактів без метронома", "Silent bars")} onChange={(v) => onChange({ quietBars: v })} />
        </Field>
      </div>
      <p className="text-xs text-slate-500">
        {L(`Схема: ${cb} з кліком, ${qb} без.`, `Pattern: ${cb} with clicks, ${qb} silent.`)}{" "}
        {loopOn ? L("Лічба тактів іде від початку циклу.", "Bars are counted from the loop start.") : L("Лічба тактів іде від першого такту треку.", "Bars are counted from the first bar of the track.")}
        {!config.enabled && ` ${L("Метроном зараз вимкнений у «Мікшері»: схема не буде чутна.", "The metronome is off in the “Mixer”: the pattern will not be heard.")}`}
      </p>
    </PanelCard>
  );
}
