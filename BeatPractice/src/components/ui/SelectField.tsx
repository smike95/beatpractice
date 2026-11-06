import { ChevronDown } from "lucide-react";

/** A pull-down list (the native list of the system, styled like the other fields). */
export function SelectField(props: {
  value: number;
  options: { value: number; label: string; disabled?: boolean }[];
  onChange: (v: number) => void;
  label: string;
  id?: string;
  disabled?: boolean;
}) {
  const { value, options, onChange, label, id, disabled } = props;
  return (
    <div className="relative">
      <select
        id={id}
        aria-label={label}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-slate-700 bg-slate-950 pl-3 pr-9 text-sm font-semibold text-slate-100 transition-colors duration-150 hover:bg-slate-900 focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}
