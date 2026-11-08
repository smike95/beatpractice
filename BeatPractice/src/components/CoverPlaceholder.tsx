import type { ReactNode } from "react";
import { Music2 } from "lucide-react";

/** The picture shown instead of a cover: the same note in the playlist and in the title of the track. `children` replaces the note (the playing animation). */
export function CoverPlaceholder(props: { className?: string; active?: boolean; rounded?: string; children?: ReactNode }) {
  const { className = "", active = false, rounded = "rounded-md", children } = props;
  return (
    <div className={`${className} ${rounded} flex shrink-0 items-center justify-center ${active ? "cover-ph-active shadow-xs" : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
      {children ?? <Music2 className="h-3/5 w-3/5" />}
    </div>
  );
}
