import type { ReactNode } from "react";
import { InfoTip } from "./InfoTip";

/**
 * The card every Training panel is built on: icon + title (+ a small "i" button with the explanation) (+ optional controls on the right), then the content.
 * The explanation is a tip that floats over the "i" button while the pointer is on it, so the card takes no extra room.
 */
export function PanelCard(props: { id?: string; icon: ReactNode; title: string; info?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  const { id, icon, title, info, actions, className = "", children } = props;
  return (
    <section id={id} className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 shadow-sm ${className}`}>
      <div className="flex min-h-11 items-center justify-between gap-x-3 gap-y-2 flex-wrap">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100 uppercase tracking-wide">
          <span className="shrink-0" aria-hidden="true">{icon}</span>
          {title}
          {info && <InfoTip>{info}</InfoTip>}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
