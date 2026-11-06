import { Modal } from "./ui/Modal";
import { btn } from "./ui/styles";
import { loopColor, loopLabel, type LoopSlot } from "../types";

type Lang = "uk" | "en";

/**
 * Shown when a new loop shares bars with existing loops.
 * One loop touched: "new loop" or "change this loop". Several touched: "new loop" or "change one of them".
 * When all places are taken there is no "new loop" button.
 * `onChoose`: "new", the index of the loop to change, or null (cancel).
 */
export function LoopConflictDialog(props: {
  lang: Lang;
  loops: LoopSlot[];
  hits: number[];
  canCreate: boolean;
  isDark: boolean;
  onChoose: (answer: "new" | number | null) => void;
}) {
  const { lang, loops, hits, canCreate, isDark, onChoose } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const many = hits.length > 1;
  const names = hits.map((i) => `«${loopLabel(loops[i], i, lang)}»`).join(", ");
  const title = many
    ? L("Новий цикл зачіпає кілька існуючих", "The new loop touches several loops")
    : L("Новий цикл накладається на існуючий", "The new loop overlaps an existing loop");
  const text = many
    ? L(`Він має спільні такти з: ${names}. Створити новий цикл чи змінити один із них?`, `It shares bars with: ${names}. Create a new loop, or change one of them?`)
    : L(`Він має спільні такти з ${names}. Створити новий цикл чи змінити цей?`, `It shares bars with ${names}. Create a new loop, or change that one?`);

  return (
    <Modal id="loop-conflict-dialog" width="md" role="alertdialog" onClose={() => onChoose(null)}>
      <h3 className="text-base font-bold">{title}</h3>
      <p className="text-sm text-slate-300">{text}</p>
      {!canCreate && (
        <p className="text-xs text-slate-400">{L("Усі місця для циклів зайняті, тож можна лише змінити існуючий.", "All loop places are taken, so you can only change an existing loop.")}</p>
      )}
      <div className="flex flex-col gap-2">
        {canCreate && (
          <button type="button" id="loop-conflict-new" className={btn.cta} onClick={() => onChoose("new")}>
            {L("Створити новий цикл", "Create a new loop")}
          </button>
        )}
        {hits.map((i) => {
          const c = loopColor(i, isDark);
          return (
            <button key={i} type="button" id={`loop-conflict-change-${i}`} className={`${btn.neutral} justify-start`} onClick={() => onChoose(i)}>
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.solid }} aria-hidden="true" />
              <span className="min-w-0 truncate">{L("Змінити", "Change")} «{loopLabel(loops[i], i, lang)}»</span>
              <span className="ml-auto shrink-0 font-normal text-slate-400">{barsInfo(loops[i], lang)}</span>
            </button>
          );
        })}
        <button type="button" id="loop-conflict-cancel" className={btn.neutral} onClick={() => onChoose(null)}>
          {L("Скасувати", "Cancel")}
        </button>
      </div>
    </Modal>
  );
}

/** How long the loop is, in seconds. */
function barsInfo(slot: LoopSlot | undefined, lang: Lang): string {
  if (!slot) return "";
  const sec = Math.max(0, slot.end - slot.start);
  return `${sec.toFixed(1)} ${lang === "en" ? "s" : "с"}`;
}
