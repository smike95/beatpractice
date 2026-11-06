import { useEffect, type ReactNode, type RefObject } from "react";

/**
 * A small window that opens under its button. The parent wraps the button and the Popover in one `relative` element and passes
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
  if (!open) return null;
  return (
    <div
      id={id}
      role="dialog"
      aria-label={ariaLabel}
      className={`bp-popover track-edit-dialog absolute top-full z-40 mt-2 ${align === "right" ? "right-0" : "left-0"} ${widthClass} max-w-[calc(100vw-2rem)] rounded-2xl border p-4 shadow-2xl space-y-4`}
    >
      {children}
    </div>
  );
}
