import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

/**
 * A small "i" button. The explanation appears in a floating tip while the pointer is over the button (after a short delay, as system
 * tooltips do) or the button has keyboard focus; on a touch screen a tap opens it and a tap elsewhere closes it. It takes no room in the layout.
 */
export function InfoTip(props: { children: ReactNode; label?: string; className?: string }) {
  const { children, label = "Info", className = "" } = props;
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = (delay: number) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(true), delay); };
  const hide = () => { window.clearTimeout(timer.current); setOpen(false); setPos(null); };

  // place the tip under the button, or above it when there is no room below; keep it inside the window
  useLayoutEffect(() => {
    if (!open || !btn.current || !tip.current) return;
    const r = btn.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    const m = 8;
    let left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(m, Math.min(window.innerWidth - t.width - m, left));
    let top = r.bottom + 6;
    if (top + t.height > window.innerHeight - m && r.top - 6 - t.height > m) top = r.top - 6 - t.height;
    setPos({ left, top });
  }, [open, children]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (e.target !== btn.current && !btn.current?.contains(e.target as Node)) hide(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); window.removeEventListener("scroll", hide, true); };
  }, [open]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-describedby={open ? "info-tip" : undefined}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") show(350); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") hide(); }}
        onFocus={() => show(0)}
        onBlur={hide}
        onClick={() => (open ? hide() : setOpen(true))}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-slate-100 cursor-pointer transition-colors normal-case ${className}`}
      >
        <Info className="icon-sm" />
      </button>
      {open && createPortal(
        <div
          ref={tip}
          id="info-tip"
          role="tooltip"
          className="pointer-events-none fixed z-[200] max-w-[22rem] rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-normal normal-case leading-snug tracking-normal text-slate-200 shadow-xl"
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
