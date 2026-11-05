import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { btn } from "./styles";

const WIDTH = { md: "max-w-md", lg: "max-w-lg", xl: "max-w-xl", "2xl": "max-w-2xl" } as const;

/**
 * The one shell for every dialog: dimmed backdrop, centred card, fade-in, safe-area padding for phones.
 * - `onClose` set: a press on the backdrop closes it, and so does Esc (unless `closeOnEscape` is false).
 * - `onClose` not set: the user has to answer in the dialog itself.
 * - `scroll={false}`: the content scrolls by itself (a flex column), not the whole card.
 */
export function Modal(props: {
  id: string;
  width: keyof typeof WIDTH;
  role?: "dialog" | "alertdialog";
  onClose?: () => void;
  closeOnEscape?: boolean;
  layer?: "z-50" | "z-[100]";
  scroll?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { id, width, role = "dialog", onClose, closeOnEscape = true, layer = "z-50", scroll = true, className = "", children } = props;

  useEffect(() => {
    if (!onClose || !closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, closeOnEscape]);

  return (
    <div
      className={`bp-modal-overlay fixed inset-0 ${layer} flex items-center justify-center bg-black/55`}
      onMouseDown={onClose ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
    >
      <div
        role={role}
        aria-modal="true"
        id={id}
        className={`bp-modal track-edit-dialog w-full ${WIDTH[width]} rounded-2xl border shadow-2xl p-4 sm:p-5 space-y-4 ${scroll ? "overflow-y-auto overscroll-contain" : ""} ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

/** Title on the left, the × button on the right (44 px target on phones). */
export function ModalHeader(props: { title: ReactNode; onClose: () => void; closeLabel: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="min-w-0 text-base font-bold">{props.title}</h3>
      <button type="button" className={btn.icon} onClick={props.onClose} title={props.closeLabel} aria-label={props.closeLabel}>
        <X className="w-6 h-6" />
      </button>
    </div>
  );
}
