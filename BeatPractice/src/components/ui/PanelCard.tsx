import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";

/**
 * The card every Training panel is built on: icon + title (+ a small "i" button with the explanation) (+ optional controls on the right), then the content.
 * The explanation is hidden behind the "i" button, so the card stays quiet.
 */
export function PanelCard(props: { id?: string; icon: ReactNode; title: string; info?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  const { id, icon, title, info, actions, className = "", children } = props;
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <section id={id} className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 shadow-sm ${className}`}>
      <div className="flex min-h-11 items-center justify-between gap-x-3 gap-y-2 flex-wrap">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100 uppercase tracking-wide">
          <span className="shrink-0" aria-hidden="true">{icon}</span>
          {title}
          {info && (
            <button
              type="button"
              onClick={() => setInfoOpen((v) => !v)}
              aria-expanded={infoOpen}
              aria-label="Info"
              title="Info"
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full cursor-pointer transition-colors normal-case ${infoOpen ? "seg-on" : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"}`}
            >
              <Info className="icon-sm" />
            </button>
          )}
        </h2>
        {actions}
      </div>
      {info && infoOpen && <p className="text-xs text-slate-400" role="note">{info}</p>}
      {children}
    </section>
  );
}
