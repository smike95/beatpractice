import type { ReactNode } from "react";

/** A small caption above a control. `min-w-0` lets it shrink inside a grid, so long captions wrap instead of pushing the page wide. */
export function Field(props: { label: ReactNode; children: ReactNode }) {
  return (
    // In a grid the cells of one row are as tall as the tallest; the caption stays on top and the control sits at the bottom,
    // so the controls of a row stand level even when the captions take a different number of lines.
    <div className="min-w-0 flex flex-col gap-1.5">
      <div className="track-edit-label text-xs">{props.label}</div>
      <div className="mt-auto">{props.children}</div>
    </div>
  );
}
