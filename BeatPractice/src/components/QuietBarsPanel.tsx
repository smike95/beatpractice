import { Volume2 } from "lucide-react";
import { MetronomeConfig } from "../types";
import { Switch } from "./Switch";
import { PanelCard } from "./ui/PanelCard";
import { Field } from "./ui/Field";
import { SpinField } from "./ui/SpinField";
import { Segmented } from "./ui/Segmented";
import { StableLabel } from "./ui/StableLabel";

type Lang = "uk" | "en";

/** Training: the metronome sounds for some bars and is silent for some bars, over and over. Works with a track, a loop and without a track. */
export function QuietBarsPanel(props: {
  lang: Lang;
  config: MetronomeConfig;
  onChange: (patch: Partial<MetronomeConfig>) => void;
}) {
  const { lang, config, onChange } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const { quietEnabled: on, quietClickBars: cb, quietBars: qb } = config;
  const cont = config.quietContinue ?? false;
  return (
    <PanelCard
      id="quiet-bars-panel"
      className="h-full"
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
          "Метроном лунає кілька тактів, потім кілька тактів мовчить, і так по колу. Грайте ці такти самі й перевіряйте, чи не втекли від темпу.",
          "The metronome sounds for some bars, then is silent for some bars, over and over. Play through the silent bars on your own and check that you kept the tempo.",
        )}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label={L("З метрономом, тактів", "With the metronome, bars")}>
          <SpinField id="quiet-click-bars" value={cb} min={1} max={16} label={L("Тактів із метрономом", "Bars with the metronome")} onChange={(v) => onChange({ quietClickBars: v })} />
        </Field>
        <Field label={L("Без метронома, тактів", "Without it, bars")}>
          <SpinField id="quiet-silent-bars" value={qb} min={1} max={16} label={L("Тактів без метронома", "Silent bars")} onChange={(v) => onChange({ quietBars: v })} />
        </Field>
      </div>
      <Field label={L("У циклі", "In a loop")}>
        <Segmented
          id="quiet-loop-mode"
          ariaLabel={L("Схема тихих тактів у циклі", "Quiet-bar pattern in a loop")}
          value={cont}
          onChange={(v) => onChange({ quietContinue: v })}
          options={[
            { value: false, label: L("Заново в циклі", "Restart"), title: L("У кожному проході циклу схема починається спочатку", "Every pass of the loop starts the pattern again") },
            { value: true, label: L("Продовжувати", "Continue"), title: L("При повторі циклу схема йде далі, не починаючись спочатку", "On a loop repeat the pattern goes on instead of starting again") },
          ]}
        />
      </Field>
      <p className="text-xs text-slate-500">
        {L(`Схема: ${cb} з кліком, ${qb} без.`, `Pattern: ${cb} with clicks, ${qb} silent.`)}
        {!config.enabled && ` ${L("Метроном зараз вимкнений: схема не буде чутна.", "The metronome is off: the pattern will not be heard.")}`}
      </p>
    </PanelCard>
  );
}
