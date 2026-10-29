import { useEffect, useState } from "react";
import { Plus, Repeat, X } from "lucide-react";
import { LoopSlot } from "../types";
import { Switch } from "./Switch";

interface Props {
  loops: LoopSlot[];
  activeLoop: number | null;
  selectedLoop: number;
  barTimes: number[];
  duration: number;
  ready: boolean;
  lang: "uk" | "en";
  maxLoops: number;
  onSelect: (i: number) => void;
  onActivate: (i: number | null) => void;
  onUpdate: (i: number, slot: LoopSlot) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  currentBar: number; // 1-based bar the playhead is in
}

function lastLE(arr: number[], t: number): number {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Number field: type freely, applied on Enter / leaving the field. */
function BarInput(props: { value: number; min: number; max: number; disabled?: boolean; onCommit: (v: number) => void }) {
  const { value, min, max, disabled, onCommit } = props;
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);
  const commit = () => {
    if (draft !== null) {
      const v = parseInt(draft, 10);
      if (!isNaN(v)) onCommit(Math.min(max, Math.max(min, v)));
    }
    setDraft(null);
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      value={draft ?? String(value)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setDraft(null); (e.target as HTMLInputElement).blur(); }
      }}
      className="w-16 px-1.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono text-center text-sm focus:outline-none focus:border-sky-500"
    />
  );
}

export function LoopsPanel(props: Props) {
  const { loops, activeLoop, selectedLoop, barTimes, duration, ready, lang, maxLoops, currentBar } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const total = barTimes.length;

  const fromBar = (s: LoopSlot) => Math.max(1, lastLE(barTimes, s.start + 0.001) + 1);
  const toBar = (s: LoopSlot) => Math.max(fromBar(s), lastLE(barTimes, s.end - 0.001) + 1);
  const slotFromBars = (from: number, to: number): LoopSlot => {
    const a = Math.min(Math.max(1, from), total);
    const b = Math.min(Math.max(a, to), total);
    return { start: barTimes[a - 1], end: b < total ? barTimes[b] : duration };
  };

  const btn =
    "px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-100 uppercase tracking-wide">
          <Repeat className="w-6 h-6" />
          {L("Цикли по тактах", "Bar loops")}
        </div>
        <button className={btn} disabled={!ready || loops.length === 0 || loops.length >= maxLoops} onClick={props.onAdd}
          title={loops.length >= maxLoops ? L("Максимум 3 цикли", "Up to 3 loops") : ""}>
          <span className="inline-flex items-center gap-1"><Plus className="w-6 h-6" />{L("Цикл", "Loop")}</span>
        </button>
      </div>
      <p className="text-xs text-slate-400">
        {L(
          "Грає один цикл за раз. Протягніть по хвилі, щоб задати межі виділеного циклу. Межі завжди притискаються до початку такту.",
          "One loop plays at a time. Drag across the waveform to set the selected loop. Edges always snap to bar starts.",
        )}
      </p>

      {loops.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-700 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-slate-300 font-semibold">{L("Цикл 1", "Loop 1")} <span className="text-slate-500 font-normal">— {L("ще не задано", "not set yet")}</span></div>
          <button className={btn} disabled={!ready} onClick={props.onAdd}>{L("Створити з поточного такту", "Create from the current bar")}</button>
        </div>
      )}

      {loops.map((s, i) => {
        const on = activeLoop === i;
        const sel = selectedLoop === i;
        const fb = fromBar(s), tb = toBar(s);
        return (
          <div
            key={i}
            onClick={() => props.onSelect(i)}
            className={`rounded-xl border-2 p-3 space-y-2.5 cursor-pointer transition-colors ${sel ? "border-sky-500" : "border-slate-800"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                <span className={`w-5 h-5 rounded-md text-xs flex items-center justify-center font-mono ${on ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"}`}>{i + 1}</span>
                {L("Цикл", "Loop")} {i + 1}
                <span className="text-xs font-normal text-slate-400 font-mono">
                  {tb - fb + 1} {L("такт.", "bars")}
                </span>
                {sel && <span className="text-xs font-normal text-sky-500">{L("виділено для хвилі", "target of the waveform")}</span>}
              </div>
              <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs font-semibold text-slate-400">{on ? L("Грає", "Playing") : L("Вимкнено", "Off")}</span>
                <Switch
                  checked={on}
                  disabled={!ready}
                  onChange={() => props.onActivate(on ? null : i)}
                  label={on ? L("Вимкнути цикл", "Turn the loop off") : L("Увімкнути цикл", "Turn the loop on")}
                />
                <button
                  className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                  title={L("Видалити цикл", "Delete loop")}
                  onClick={() => props.onRemove(i)}
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300" onClick={(e) => e.stopPropagation()}>
              <label className="flex items-center gap-1.5">
                {L("З такту", "From bar")}
                <BarInput value={fb} min={1} max={Math.max(1, total)} disabled={!ready || total === 0}
                  onCommit={(v) => props.onUpdate(i, slotFromBars(v, Math.max(v, tb)))} />
              </label>
              <label className="flex items-center gap-1.5">
                {L("по такт", "to bar")}
                <BarInput value={tb} min={1} max={Math.max(1, total)} disabled={!ready || total === 0}
                  onCommit={(v) => props.onUpdate(i, slotFromBars(Math.min(fb, v), v))} />
              </label>
              <button className={btn} disabled={!ready || total === 0} onClick={() => props.onUpdate(i, slotFromBars(currentBar, Math.max(currentBar, tb)))}>
                {L("Початок = поточний такт", "Start = current bar")}
              </button>
              <button className={btn} disabled={!ready || total === 0} onClick={() => props.onUpdate(i, slotFromBars(Math.min(fb, currentBar), currentBar))}>
                {L("Кінець = поточний такт", "End = current bar")}
              </button>
              <span className="text-slate-500">/ {total || "—"}</span>
            </div>
          </div>
        );
      })}
    </section>
  );
}
