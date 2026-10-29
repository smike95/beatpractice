import type { CSSProperties } from "react";

/** The one slider used everywhere: the part to the left of the handle is clearly coloured, the rest is neutral. */
export function Slider(props: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  id?: string;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { value, min, max, step, onChange, id, title, ariaLabel, disabled, className } = props;
  const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className={`bp-range cursor-pointer disabled:cursor-default disabled:opacity-50 ${className ?? "flex-1 min-w-24"}`}
      style={{ "--pct": `${pct}%` } as CSSProperties}
    />
  );
}
