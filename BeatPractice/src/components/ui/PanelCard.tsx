import type { ReactNode } from "react";

/** The card every Training panel is built on: icon + title (+ optional controls on the right), then the content. */
export function PanelCard(props: { id: string; icon: ReactNode; title: string; actions?: ReactNode; children: ReactNode }) {
  const { id, icon, title, actions, children } = props;
  return (
    <section id={id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 shadow-sm">
      <div className="flex items-center justify-between gap-x-3 gap-y-2 flex-wrap">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100 uppercase tracking-wide">
          <span className="shrink-0" aria-hidden="true">{icon}</span>
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
