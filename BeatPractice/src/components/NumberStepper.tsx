import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

/**
 * A number with − / + buttons and a field to type into (applied on Enter or when the field is left; Esc cancels).
 * `decimals` > 0 allows a decimal part. Values are always kept between min and max.
 */
export function NumberStepper(props: {
  value: number;
  min: number;
  max: number;
  step?: number;          // what the buttons add / subtract
  decimals?: number;
  suffix?: string;
  disabled?: boolean;
  label: string;          // for screen readers
  onChange: (v: number) => void;
  id?: string;
}) {
  const { value, min, max, step = 1, decimals = 0, suffix, disabled, label, onChange, id } = props;
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const round = (v: number) => (decimals > 0 ? Math.round(v * 10 ** decimals) / 10 ** decimals : Math.round(v));
  const shown = decimals > 0 ? value.toFixed(decimals) : String(value);
  const commit = () => {
    if (draft !== null) {
      const v = parseFloat(draft.replace(",", "."));
      if (!isNaN(v)) onChange(clamp(round(v)));
    }
    setDraft(null);
  };
  const btn = "w-9 h-9 rounded-lg border border-slate-700 hover:bg-slate-800 flex items-center justify-center cursor-pointer text-slate-200 disabled:opacity-40 disabled:cursor-default";
  return (
    <div className="inline-flex items-center gap-1.5">
      <button type="button" className={btn} disabled={disabled || value <= min} aria-label={`${label} −`} onClick={() => onChange(clamp(round(value - step)))}><Minus className="w-4 h-4" /></button>
      <input
        id={id}
        type="text"
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        disabled={disabled}
        value={draft ?? shown}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value.replace(decimals > 0 ? /[^0-9.,]/g : /[^0-9]/g, "").slice(0, 6))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setDraft(null); (e.target as HTMLInputElement).blur(); }
        }}
        className="w-16 h-9 text-center font-mono text-sm font-bold rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-sky-500 disabled:opacity-40"
      />
      <button type="button" className={btn} disabled={disabled || value >= max} aria-label={`${label} +`} onClick={() => onChange(clamp(round(value + step)))}><Plus className="w-4 h-4" /></button>
      {suffix && <span className="text-xs font-semibold text-slate-400">{suffix}</span>}
    </div>
  );
}
