import type { ReactNode } from "react";

/** A small caption above a control. `min-w-0` lets it shrink inside a grid, so long captions wrap instead of pushing the page wide. */
export function Field(props: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="track-edit-label text-xs">{props.label}</div>
      {props.children}
    </div>
  );
}
