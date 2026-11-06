import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * A number field with up / down buttons to the right of it (bar numbers, counts, tempo).
 * You can type: the value is applied on Enter or when the field loses focus, Esc cancels. The buttons change it by `step` within min..max.
 */
export function SpinField(props: {
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  onChange: (v: number) => void;
  label: string;          // spoken name of the field and of its buttons
  id?: string;
  disabled?: boolean;
  widthClass?: string;    // width of the text part
}) {
  const { value, min, max, step = 1, decimals = 0, onChange, label, id, disabled, widthClass = "w-14" } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const round = (v: number) => Number(v.toFixed(decimals));
  const commit = () => {
    if (draft !== null) {
      const n = parseFloat(draft.replace(",", "."));
      if (!isNaN(n)) onChange(round(clamp(n)));
    }
    setDraft(null);
  };
  const nudge = (d: number) => { setDraft(null); onChange(round(clamp(value + d * step))); };
  const arrow = "flex flex-1 items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent";
  return (
    <div className={`inline-flex h-10 items-stretch overflow-hidden rounded-lg border border-slate-700 bg-slate-950 transition-colors duration-150 focus-within:border-sky-500 ${disabled ? "opacity-50" : ""}`}>
      <input
        id={id}
        type="text"
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        disabled={disabled}
        aria-label={label}
        value={draft ?? value.toFixed(decimals)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value.replace(decimals > 0 ? /[^0-9.,]/g : /[^0-9]/g, "").slice(0, 6))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "Escape") { setDraft(null); (e.target as HTMLInputElement).blur(); }
          else if (e.key === "ArrowUp") { e.preventDefault(); nudge(1); }
          else if (e.key === "ArrowDown") { e.preventDefault(); nudge(-1); }
        }}
        className={`${widthClass} bg-transparent px-1 text-center font-mono text-sm font-bold tabular-nums text-slate-100`}
      />
      <div className="flex w-8 flex-col divide-y divide-slate-700 border-l border-slate-700">
        <button type="button" tabIndex={-1} disabled={disabled || value >= max} onClick={() => nudge(1)} aria-label={`${label} +`} className={arrow}><ChevronUp className="h-4 w-4" /></button>
        <button type="button" tabIndex={-1} disabled={disabled || value <= min} onClick={() => nudge(-1)} aria-label={`${label} −`} className={arrow}><ChevronDown className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
