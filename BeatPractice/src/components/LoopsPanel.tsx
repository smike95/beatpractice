import { useEffect, useState } from "react";
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { LoopSlot, barsText, loopColor, loopLabel } from "../types";
import { Switch } from "./Switch";
import { SpinField } from "./ui/SpinField";
import { Segmented } from "./ui/Segmented";
import { StableLabel } from "./ui/StableLabel";
import { PanelCard } from "./ui/PanelCard";
import { btn as btnStyle } from "./ui/styles";

interface Props {
  loops: LoopSlot[];
  activeLoop: number | null;
  selectedLoop: number;
  barTimes: number[];
  duration: number;
  ready: boolean;
  lang: "uk" | "en";
  maxLoops: number;
  isDark: boolean;
  onSelect: (i: number) => void;
  onActivate: (i: number | null) => void;
  onUpdate: (i: number, slot: LoopSlot) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  currentBar: number; // 1-based bar the playhead is in
  countInOn: boolean;               // the count-in is switched on (metronome settings)
  countInOnLoop: boolean;           // count-in before every repeat of the loop
  onCountInOnLoop: (v: boolean) => void;
}

function lastLE(arr: number[], t: number): number {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Bar number: type it, or use the up / down buttons to the right of the field. */
function BarInput(props: { value: number; min: number; max: number; disabled?: boolean; onCommit: (v: number) => void }) {
  return <SpinField value={props.value} min={props.min} max={props.max} disabled={props.disabled} onChange={props.onCommit} label="№" widthClass="w-14" />;
}

/** The loop's name with a pencil (as for the track title): the pencil turns the name into a field; Enter / leaving applies, Esc cancels; empty = "Loop N". */
function NameEditor(props: { value: string; shown: string; label: string; onCommit: (v: string) => void }) {
  const { value, shown, label, onCommit } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = () => { setEditing(false); if (draft.trim() !== value) onCommit(draft.trim()); };
  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <span className="truncate text-sm font-bold text-slate-100" title={shown}>{shown}</span>
        <button type="button" aria-label={label} title={label}
          onClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
          className="p-3.5 -m-3.5 sm:p-1 sm:m-0 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer shrink-0 transition-colors duration-150">
          <Pencil className="w-4 h-4" />
        </button>
      </span>
    );
  }
  return (
    <input
      type="text" autoFocus value={draft} maxLength={40} placeholder={shown} aria-label={label}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      className="min-w-0 w-40 sm:w-56 h-11 sm:h-8 px-2 rounded-lg bg-slate-950 border border-sky-500 text-sm font-bold text-slate-100"
    />
  );
}

export function LoopsPanel(props: Props) {
  const { loops, activeLoop, selectedLoop, barTimes, duration, ready, lang, maxLoops, currentBar, isDark } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const total = barTimes.length;

  const fromBar = (s: LoopSlot) => Math.max(1, lastLE(barTimes, s.start + 0.001) + 1);
  const toBar = (s: LoopSlot) => Math.max(fromBar(s), lastLE(barTimes, s.end - 0.001) + 1);
  const slotFromBars = (from: number, to: number): LoopSlot => {
    const a = Math.min(Math.max(1, from), total);
    const b = Math.min(Math.max(a, to), total);
    return { start: barTimes[a - 1], end: b < total ? barTimes[b] : duration };
  };

  const keepName = (old: LoopSlot, next: LoopSlot): LoopSlot => (old.name ? { ...next, name: old.name } : next);

  const btn = btnStyle.secondary;

  return (
    <PanelCard
      icon={<Repeat className="w-6 h-6" />}
      title={L("Цикли по тактах", "Bar loops")}
      actions={
        <button className={btn} disabled={!ready || loops.length === 0 || loops.length >= maxLoops} onClick={props.onAdd}
          title={loops.length >= maxLoops ? L("Максимум 3 цикли", "Up to 3 loops") : ""}>
          <span className="inline-flex items-center gap-1"><Plus className="w-6 h-6" />{L("Цикл", "Loop")}</span>
        </button>
      }
    >
      <p className="text-xs text-slate-400">
        {L(
          "Грає один цикл за раз. Протягніть по хвилі, щоб задати межі виділеного циклу. Межі завжди притискаються до початку такту.",
          "One loop plays at a time. Drag across the waveform to set the selected loop. Edges always snap to bar starts.",
        )}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-slate-800 px-3 py-2">
        <span className="text-xs font-semibold text-slate-300">{L("Відлік перед кожним повтором циклу", "Count-in before every loop repeat")}</span>
        <Segmented
          id="switch-countin-on-loop-loops-tab"
          ariaLabel={L("Відлік перед кожним повтором циклу", "Count-in before every loop repeat")}
          value={props.countInOnLoop}
          onChange={props.onCountInOnLoop}
          disabled={!props.countInOn}
          options={[{ value: false, label: L("Вимк", "Off") }, { value: true, label: L("Увімк", "On"), title: props.countInOn ? undefined : L("Спершу увімкніть відлік у налаштуваннях метронома", "Turn the count-in on first in the metronome settings") }]}
        />
      </div>

      {loops.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-700 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-slate-300 font-semibold">{loopLabel(undefined, 0, lang)} <span className="text-slate-500 font-normal">— {L("ще не задано", "not set yet")}</span></div>
          <button className={btn} disabled={!ready} onClick={props.onAdd}>{L("Створити з поточного такту", "Create from the current bar")}</button>
        </div>
      )}

      {loops.map((s, i) => {
        const on = activeLoop === i;
        const sel = selectedLoop === i;
        const fb = fromBar(s), tb = toBar(s);
        const col = loopColor(i, isDark);
        return (
          <div
            key={i}
            onClick={() => props.onSelect(i)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); props.onSelect(i); } }}
            style={{ borderColor: sel ? col.solid : undefined, background: sel ? col.fill : undefined }}
            className={`rounded-xl border-2 p-3 space-y-3 cursor-pointer transition-colors duration-150 ${sel ? "" : "border-slate-800"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span style={{ background: on ? col.solid : undefined, color: on ? col.text : undefined, borderColor: col.solid }}
                  className={`w-5 h-5 shrink-0 rounded-md border text-xs flex items-center justify-center font-mono ${on ? "" : "bg-slate-800 text-slate-300"}`}>{i + 1}</span>
                <NameEditor value={s.name ?? ""} shown={loopLabel(s, i, lang)} label={L("Змінити назву циклу", "Rename the loop")}
                  onCommit={(v) => props.onUpdate(i, { start: s.start, end: s.end, ...(v ? { name: v } : {}) })} />
                <span className="text-xs font-normal text-slate-400 whitespace-nowrap">{barsText(tb - fb + 1, lang)}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs font-semibold text-slate-400"><StableLabel align="text-right" active={on ? 1 : 0} labels={[L("Вимкнено", "Off"), L("Грає", "Playing")]} /></span>
                <Switch
                  checked={on}
                  disabled={!ready}
                  onChange={() => props.onActivate(on ? null : i)}
                  label={on ? L("Вимкнути цикл", "Turn the loop off") : L("Увімкнути цикл", "Turn the loop on")}
                />
                <button
                  className="p-2.5 sm:p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer transition-colors duration-150"
                  title={L("Видалити цикл", "Delete loop")} aria-label={L("Видалити цикл", "Delete loop")}
                  onClick={() => props.onRemove(i)}
                >
                  <Trash2 className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-xs text-slate-300" onClick={(e) => e.stopPropagation()}>
              <label className="flex items-center gap-1.5">
                {L("З такту", "From bar")}
                <BarInput value={fb} min={1} max={Math.max(1, total)} disabled={!ready || total === 0}
                  onCommit={(v) => props.onUpdate(i, keepName(s, slotFromBars(v, Math.max(v, tb))))} />
              </label>
              <label className="flex items-center gap-1.5">
                {L("по такт", "to bar")}
                <BarInput value={tb} min={1} max={Math.max(1, total)} disabled={!ready || total === 0}
                  onCommit={(v) => props.onUpdate(i, keepName(s, slotFromBars(Math.min(fb, v), v)))} />
              </label>
              <button className={btn} disabled={!ready || total === 0} onClick={() => props.onUpdate(i, keepName(s, slotFromBars(currentBar, Math.max(currentBar, tb))))}>
                {L("Початок = поточний такт", "Start = current bar")}
              </button>
              <button className={btn} disabled={!ready || total === 0} onClick={() => props.onUpdate(i, keepName(s, slotFromBars(Math.min(fb, currentBar), currentBar)))}>
                {L("Кінець = поточний такт", "End = current bar")}
              </button>
              <span className="text-slate-500">/ {total || "—"}</span>
            </div>
          </div>
        );
      })}
    </PanelCard>
  );
}
