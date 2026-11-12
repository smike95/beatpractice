import { AlertTriangle, Wrench } from "lucide-react";
import { Modal, ModalHeader } from "./ui/Modal";
import { Segmented } from "./ui/Segmented";
import { MiniButton } from "./ui/MiniButton";
import type { TempoSection } from "../utils/sections";

type Lang = "uk" | "en";

const mmss = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * Tempo map and sections in a pop-up window (opened by the wrench button next to the time signature under the song title).
 * Top: divide the tempo by two (the network found a fast song twice too fast). Then the meter recognition and the list of sections.
 */
export function TempoMapDialog(props: {
  lang: Lang;
  halveTempo: boolean;
  onHalveTempo: (on: boolean) => void;
  meterPreset: number;                 // 0 auto, 1 sensitive, 2 strict ("coarse")
  onMeterPreset: (preset: number) => void;
  ready: boolean;
  sections: TempoSection[];
  speed: number;                       // the sections are shown at the tempo that is playing now
  onGoTo: (seconds: number) => void;
  onClose: () => void;
}) {
  const { lang, halveTempo, onHalveTempo, meterPreset, onMeterPreset, ready, sections, speed, onGoTo, onClose } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const disabled = !ready;
  const th = "py-1.5 pr-3 font-semibold";
  return (
    <Modal id="tempo-map-dialog" width="2xl" onClose={onClose}>
      <ModalHeader
        title={<span className="inline-flex items-center gap-2"><Wrench className="h-6 w-6" />{L("Карта темпу та секцій", "Tempo map & sections")}</span>}
        onClose={onClose}
        closeLabel={L("Закрити", "Close")}
      />

      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-slate-300">{L("Темп", "Tempo")}</div>
        <Segmented ariaLabel={L("Ділення темпу навпіл", "Divide the tempo by two")} value={halveTempo} onChange={onHalveTempo} disabled={disabled}
          options={[{ value: false, label: L("Як визначено", "As detected") }, { value: true, label: "÷ 2", title: L("Темп усього треку ділиться навпіл", "The tempo of the whole track is divided by two") }]} />
        <p className="text-xs text-slate-400">{L("Для швидких пісень, темп яких визначено вдвічі завищеним (наприклад, 210 замість 105).", "For fast songs whose tempo was found twice too high (for example 210 instead of 105).")}</p>
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-slate-300">{L("Розпізнавання розміру", "Meter recognition")}</div>
        <Segmented ariaLabel={L("Розпізнавання розміру", "Meter recognition")} value={meterPreset} onChange={onMeterPreset} disabled={disabled}
          options={[
            { value: 0, label: L("Авто", "Auto"), title: L("Збалансовано: такти з 3–7 долей, зміни розміру за чітких ознак", "Balanced: bars of 3 to 7 beats, changes need clear evidence") },
            { value: 1, label: L("Чутливо", "Sensitive"), title: L("Ближче до нейромережі: легше знаходить непарні й змінні розміри", "Follows the neural network more closely: finds odd and changing meters more readily") },
            { value: 2, label: L("Грубо", "Coarse"), title: L("Лише 3/4 і 4/4, зміни розміру лише за дуже чітких ознак", "Only 3/4 and 4/4, changes need strong evidence") },
          ]} />
        <p className="text-xs text-slate-400">
          {L("Якщо складний трек показано з хибним розміром, спробуйте «Чутливо» або «Грубо».", "If a complex song is shown with the wrong meter, try “Sensitive” or “Coarse”.")}
        </p>
        <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-500">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {L("Під час зміни режиму цикли цього треку скидаються.", "Changing the mode clears the loops of this track.")}
        </p>
      </div>

      {sections.length === 0 ? (
        <p className="text-sm text-slate-400">{L("Відкрийте трек, щоб побачити секції.", "Open a track to see its sections.")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-slate-300">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-400">
                <th className={th}>#</th>
                <th className={th}>{L("Такти", "Bars")}</th>
                <th className={th}>{L("Час", "Time")}</th>
                <th className={th}>{L("Розмір", "Meter")}</th>
                <th className={th}>BPM</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {sections.map((sec, i) => (
                <tr key={i} className="border-b border-slate-800/60">
                  <td className="py-1.5 pr-3 font-mono">{i + 1}</td>
                  <td className="py-1.5 pr-3 font-mono">{sec.firstBar}–{sec.lastBar} ({sec.bars})</td>
                  <td className="py-1.5 pr-3 font-mono">{mmss(sec.startTime / speed)}–{mmss(sec.endTime / speed)}</td>
                  <td className="py-1.5 pr-3 font-mono font-bold">{sec.label}</td>
                  <td className="py-1.5 pr-3 font-mono">{sec.bpm > 0 ? Math.round(sec.bpm * speed) : "—"}</td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    <MiniButton onClick={() => onGoTo(sec.loopStart)}>{L("Перейти", "Go to")}</MiniButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
