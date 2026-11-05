import { useState } from "react";

/** BPM field that lets you type freely and applies the value on Enter / blur. */
export function BpmInput({ value, onCommit, disabled }: { value: number; onCommit: (bpm: number) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) {
      const v = parseInt(draft, 10);
      if (!isNaN(v) && v >= 20 && v <= 400) onCommit(v);
    }
    setDraft(null);
  };
  return (
    <input
      id="input-quick-bpm"
      type="text"
      inputMode="numeric"
      disabled={disabled}
      value={draft ?? (value > 0 ? String(value) : '—')}
      onFocus={(e) => { setDraft(value > 0 ? String(value) : ''); e.currentTarget.select(); }}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(null); (e.target as HTMLInputElement).blur(); } }}
      className="w-9 text-center text-xs font-mono font-bold text-slate-100 bg-transparent focus:outline-none"
      title="Поточний темп (введіть число і натисніть Enter)"
    />
  );
}
