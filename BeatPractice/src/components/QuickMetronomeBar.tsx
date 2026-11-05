import type { ReactNode } from "react";
import { Switch } from "./Switch";

/** One switch with its icon and caption. Phones: stacked (icon + caption above, switch below), so three of them always fit; from `sm`: one line. */
function QuickSwitch(props: { id: string; icon: ReactNode; caption: string; checked: boolean; onChange: () => void; title: string }) {
  const { id, icon, caption, checked, onChange, title } = props;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-1 px-1.5 sm:px-2 py-1.5 sm:py-0 text-center sm:h-full min-w-0 sm:shrink-0">
      <div className="flex items-center gap-1 shrink-0">
        {icon}
        <span className="text-xs font-semibold text-slate-300">{caption}</span>
      </div>
      <Switch id={id} checked={checked} onChange={onChange} title={title} label={caption} />
    </div>
  );
}

/**
 * Quick metronome switches: click / accent / count-in. The ids and the `divide-slate-800/80` class are used by the light-theme rules in index.css.
 * Nothing is clipped any more: on narrow screens the three switches share the width equally instead of overflowing it.
 */
export function QuickMetronomeBar(props: {
  clickIcon: ReactNode; accentIcon: ReactNode; countInIcon: ReactNode;
  labels: { click: string; accent: string; countIn: string };
  titles: { click: string; accent: string; countIn: string };
  clickOn: boolean; accentOn: boolean; countInOn: boolean;
  onToggleClick: () => void; onToggleAccent: () => void; onToggleCountIn: () => void;
}) {
  const p = props;
  return (
    <div
      id="quick-metronome-control-bar"
      className="w-full sm:w-auto sm:h-10 bg-slate-950 px-1 sm:px-2.5 py-0 sm:py-1 rounded-xl border border-slate-800 select-none shrink-0 box-border"
    >
      <div className="grid grid-cols-3 sm:flex sm:items-center sm:justify-center divide-x divide-slate-800/80 sm:h-full w-full sm:whitespace-nowrap">
        <QuickSwitch id="quick-switch-metronome" icon={p.clickIcon} caption={p.labels.click} checked={p.clickOn} onChange={p.onToggleClick} title={p.titles.click} />
        <QuickSwitch id="quick-switch-accent" icon={p.accentIcon} caption={p.labels.accent} checked={p.accentOn} onChange={p.onToggleAccent} title={p.titles.accent} />
        <QuickSwitch id="quick-switch-countin" icon={p.countInIcon} caption={p.labels.countIn} checked={p.countInOn} onChange={p.onToggleCountIn} title={p.titles.countIn} />
      </div>
    </div>
  );
}
