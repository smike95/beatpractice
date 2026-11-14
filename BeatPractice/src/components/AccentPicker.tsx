import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Palette } from "lucide-react";
import { ACCENT_COLORS } from "../utils/accent";

/** TEMPORARY dropdown for choosing the accent colour (system colours of the Apple HIG). */
export function AccentPicker(props: { lang: "uk" | "en"; isDark: boolean; value: string; onChange: (id: string) => void; idSuffix?: string }) {
  const { lang, isDark, value, onChange } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const cur = ACCENT_COLORS.find((c) => c.id === value);
  const dot = (hex: string | null) => (
    <span aria-hidden className="inline-block h-4 w-4 shrink-0 rounded-full border border-black/20" style={{ background: hex ?? "linear-gradient(135deg,#bf5af2 50%,#007aff 50%)" }} />
  );
  const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm cursor-pointer hover:bg-slate-700/60";
  return (
    <div ref={box} className="relative">
      <button
        id={`accent-picker${props.idSuffix ?? ""}`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={L("Акцентний колір (тимчасово)", "Accent colour (temporary)")}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 p-2.5 lg:p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 text-xs font-semibold cursor-pointer select-none"
      >
        <Palette className="w-6 h-6" />
        {dot(cur ? (isDark ? cur.dark : cur.light) : null)}
        <span className="hidden sm:inline font-medium">{cur ? (lang === "en" ? cur.en : cur.uk) : L("Акцент", "Accent")}</span>
        <ChevronDown className="w-4 h-4" />
      </button>
      {open && (
        <div role="listbox" aria-label={L("Акцентний колір", "Accent colour")} className="absolute right-0 z-50 mt-1 max-h-[70vh] w-56 overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 p-1 shadow-xl text-slate-100">
          <button type="button" role="option" aria-selected={value === "default"} className={item} onClick={() => { onChange("default"); setOpen(false); }}>
            {dot(null)}<span className="flex-1">{L("Стандартний", "Default")}</span>{value === "default" && <Check className="h-4 w-4" />}
          </button>
          {ACCENT_COLORS.map((c) => (
            <button key={c.id} type="button" role="option" aria-selected={value === c.id} className={item} onClick={() => { onChange(c.id); setOpen(false); }}>
              {dot(isDark ? c.dark : c.light)}<span className="flex-1">{lang === "en" ? c.en : c.uk}</span>{value === c.id && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
