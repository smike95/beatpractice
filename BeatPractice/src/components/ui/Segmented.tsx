import type { ReactNode } from "react";

export type SegmentedOption<T> = { value: T; label: ReactNode; title?: string };

/**
 * Segmented control: one of a few choices, all visible at once (a radio group that looks like a switch).
 * `fill` makes the segments share the whole width. The chosen segment uses `.seg-on`, which has a light-theme variant in index.css.
 */
export function Segmented<T extends string | number | boolean>(props: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  fill?: boolean;
  id?: string;
}) {
  const { value, options, onChange, ariaLabel, disabled, fill, id } = props;
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      className={`${fill ? "flex w-full" : "inline-flex"} gap-0.5 rounded-lg border border-slate-700 bg-slate-950 p-0.5 ${disabled ? "opacity-50" : ""}`}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            disabled={disabled}
            onClick={() => { if (!on) onChange(o.value); }}
            className={`${fill ? "flex-1 px-2" : "px-3"} min-h-9 rounded-md text-xs font-bold whitespace-nowrap transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed ${
              on ? "seg-on shadow-sm" : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
