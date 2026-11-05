import type { ReactNode } from "react";

/** The small secondary button (for example "reset to the current value"). 44 px tall on phones, 36 px from `sm`. */
export function MiniButton(props: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="min-h-11 sm:min-h-9 px-3 text-xs font-semibold rounded-lg border border-slate-700 hover:bg-slate-800 cursor-pointer transition-colors duration-150 disabled:opacity-40 disabled:cursor-default"
    >
      {props.children}
    </button>
  );
}
