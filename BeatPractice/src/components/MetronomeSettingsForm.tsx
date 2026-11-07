import type { ReactNode } from "react";
import { CLICK_SOUND_NAMES } from "../types";
import { Segmented } from "./ui/Segmented";
import { SelectField } from "./ui/SelectField";

type Lang = "uk" | "en";

function Row(props: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-slate-300">{props.label}</div>
      {props.children}
    </div>
  );
}

/**
 * The metronome settings, in the order of the pop-up of the main metronome: accent, count-in, sound, when the count-in sounds.
 * The free metronome shows the same rows without the count-in ones (it has no song to count into): leave `countIn` out.
 */
export function MetronomeSettingsForm(props: {
  lang: Lang;
  accent: boolean;
  onAccent: (v: boolean) => void;
  sound: number;
  soundCount: number;
  onSound: (id: number) => void;
  /** time signature (beats per bar): the free metronome only; the song's metronome follows the song */
  beats?: { value: number; onChange: (n: number) => void };
  countIn?: { bars: number; onBars: (n: number) => void; onlyAtStart: boolean; onMode: (onlyAtStart: boolean) => void };
}) {
  const { lang, accent, onAccent, sound, soundCount, onSound, countIn, beats } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  return (
    <div className="space-y-3.5">
      <Row label={L("Акцент", "Accent")}>
        <Segmented fill ariaLabel={L("Акцент на першій долі", "Accent on the first beat")} value={accent} onChange={onAccent}
          options={[{ value: false, label: L("Вимк", "Off") }, { value: true, label: L("Увімк", "On") }]} />
      </Row>
      {beats && (
        <Row label={L("Тактовий розмір", "Time signature")}>
          <Segmented fill ariaLabel={L("Долей у такті", "Beats per bar")} value={beats.value} onChange={beats.onChange}
            options={[2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))} />
        </Row>
      )}
      {countIn && (
        <Row label={L("Відлік", "Count-in")}>
          <Segmented fill ariaLabel={L("Відлік перед стартом", "Count-in before the start")} value={countIn.bars} onChange={countIn.onBars}
            options={[{ value: 0, label: L("Вимк", "Off") }, { value: 1, label: L("1 такт", "1 bar") }, { value: 2, label: L("2 такти", "2 bars") }]} />
        </Row>
      )}
      <Row label={L("Звук метронома", "Metronome sound")}>
        <SelectField label={L("Звук метронома", "Metronome sound")} value={sound} onChange={onSound} disabled={soundCount === 0}
          options={CLICK_SOUND_NAMES.map(([uk, en], id) => ({ value: id, label: lang === "en" ? en : uk, disabled: soundCount <= id }))} />
      </Row>
      {countIn && (
        <Row label={L("Коли звучить відлік", "When the count-in sounds")}>
          <Segmented fill ariaLabel={L("Коли звучить відлік", "When the count-in sounds")} value={countIn.onlyAtStart} onChange={countIn.onMode} disabled={countIn.bars === 0}
            options={[{ value: true, label: L("Тільки на початку", "Only at the start") }, { value: false, label: L("Перед кожним «плей»", "Before every play") }]} />
        </Row>
      )}
    </div>
  );
}
