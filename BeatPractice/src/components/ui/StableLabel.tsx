import type { ReactNode } from "react";

/**
 * Shows one of several labels while the button keeps the width of the LONGEST one, in any language or font.
 * All labels sit in the same grid cell; only the active one is visible, the others only take up space.
 */
export function StableLabel(props: { active: number; labels: ReactNode[]; align?: "text-left" | "text-center" | "text-right" }) {
  return (
    <span className="inline-grid">
      {props.labels.map((label, i) => (
        <span key={i} className={`col-start-1 row-start-1 ${props.align ?? "text-center"} ${i === props.active ? "" : "invisible"}`} aria-hidden={i === props.active ? undefined : true}>
          {label}
        </span>
      ))}
    </span>
  );
}
