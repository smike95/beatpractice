import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

/**
 * A small window that opens under its button, or above it when there is not enough room below (it always opens into the visible part of the window). The parent wraps the button and the Popover in one `relative` element and passes
 * that element as `containerRef`: a press outside of it, or Esc, closes the window.
 */
export function Popover(props: {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  ariaLabel: string;
  align?: "left" | "right";
  widthClass?: string;
  id?: string;
  children: ReactNode;
}) {
  const { open, onClose, containerRef, ariaLabel, align = "right", widthClass = "w-[26rem]", id, children } = props;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open, onClose, containerRef]);
  const box = useRef<HTMLDivElement>(null);
  const [up, setUp] = useState(false);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const c = containerRef.current, p = box.current;
      if (!c || !p) return;
      const r = c.getBoundingClientRect();
      const h = p.offsetHeight + 8;
      const below = window.innerHeight - r.bottom, above = r.top;
      setUp(below < h && above > below);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, containerRef]);
  if (!open) return null;
  return (
    <div
      ref={box}
      id={id}
      role="dialog"
      aria-label={ariaLabel}
      className={`bp-popover track-edit-dialog absolute z-40 ${up ? "bottom-full mb-2" : "top-full mt-2"} max-h-[calc(100vh-1rem)] overflow-y-auto ${align === "right" ? "right-0" : "left-0"} ${widthClass} max-w-[calc(100vw-2rem)] rounded-2xl border p-4 shadow-2xl space-y-4`}
    >
      {children}
    </div>
  );
}
