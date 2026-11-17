import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { ACCENT_COLORS } from "../utils/accent";

/** TEMPORARY dropdown for choosing the accent colour (system colours of the Apple HIG). */
export function AccentPicker(props: { lang: "uk" | "en"; isDark: boolean; value: string; onChange: (id: string) => void; idSuffix?: string; field?: boolean }) {
  const { lang, isDark, value, onChange, field } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width?: number } | null>(null);
  const toggle = () => {
    if (!open && box.current) {
      const r = box.current.getBoundingClientRect();
      if (field) {   // in the settings dialog: opens below the field, as wide as the field (above it if there is no room)
        const below = window.innerHeight - r.bottom > 300;
        setPos(below ? { left: r.left, top: r.bottom + 4, width: r.width } : { left: r.left, bottom: window.innerHeight - r.top + 4, width: r.width });
      } else setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 232)), bottom: window.innerHeight - r.top + 6 });
    }
    setOpen((v) => !v);
  };
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const cur = ACCENT_COLORS.find((c) => c.id === value);
  const dot = (hex: string | null) => (
    <span aria-hidden className="inline-block h-4 w-4 shrink-0 rounded-full border border-black/20" style={{ background: hex ?? "linear-gradient(135deg,#d38bfc 50%,#0a5ec3 50%)" }} />
  );
  const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm cursor-pointer text-ink hover:bg-control-hover";
  const name = cur ? (lang === "en" ? cur.en : cur.uk) : L("Стандартний", "Default");
  return (
    <div ref={box} className={field ? "relative w-full" : "relative"}>
      <button
        id={`accent-picker${props.idSuffix ?? ""}`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={L("Акцентний колір", "Accent colour")}
        onClick={toggle}
        className={field
          ? "flex w-full items-center gap-2 rounded-lg border border-outline bg-canvas px-3 py-2 text-sm font-semibold text-ink cursor-pointer select-none hover:bg-control"
          : "flex items-center gap-1.5 p-2.5 lg:p-1.5 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-semibold cursor-pointer select-none bg-control hover:bg-control-hover text-ink-2 border-outline/80"}
      >
        {dot(cur ? (isDark ? cur.dark : cur.light) : null)}
        <span className={field ? "flex-1 text-left" : "hidden"}>{name}</span>
        <ChevronDown className="w-4 h-4" />
      </button>
      {open && (
        <div role="listbox" aria-label={L("Акцентний колір", "Accent colour")}
          style={pos ? { left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width } : undefined}
          className={`fixed z-[110] max-h-[50vh] overflow-y-auto rounded-xl border border-outline bg-surface p-1 shadow-xl ${field ? "" : "w-56"}`}>
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
