import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Minimise / maximise / close for the window without the system title bar (Windows): same size and look as the system ones. */
export function WindowControls({ lang }: { lang: "uk" | "en" }) {
  const [maximized, setMaximized] = useState(false);
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);

  useEffect(() => {
    const w = getCurrentWindow();
    let un: (() => void) | undefined;
    let dead = false;
    const refresh = () => { w.isMaximized().then((m) => { if (!dead) setMaximized(m); }).catch(() => {}); };
    refresh();
    w.onResized(refresh).then((f) => { if (dead) f(); else un = f; }).catch(() => {});
    return () => { dead = true; un?.(); };
  }, []);

  const btn = "w-[46px] h-8 flex items-center justify-center text-slate-300 hover:bg-slate-700/70 hover:text-white cursor-pointer transition-colors";
  const w = () => getCurrentWindow();
  const g = { width: 10, height: 10, viewBox: "0 0 10 10", fill: "none", stroke: "currentColor", strokeWidth: 1 } as const;
  return (
    <div className="flex items-start shrink-0" id="window-controls">
      <button className={btn} onClick={() => void w().minimize()} title={L("Згорнути", "Minimize")} aria-label={L("Згорнути", "Minimize")}>
        <svg {...g}><path d="M0 5.5h10" /></svg>
      </button>
      <button className={btn} onClick={() => void w().toggleMaximize()} title={maximized ? L("Відновити розмір", "Restore") : L("Розгорнути", "Maximize")} aria-label={maximized ? L("Відновити розмір", "Restore") : L("Розгорнути", "Maximize")}>
        {maximized ? <svg {...g}><path d="M2.5 2.5V.5h7v7h-2" /><path d="M.5 2.5h7v7h-7z" /></svg> : <svg {...g}><path d="M.5.5h9v9h-9z" /></svg>}
      </button>
      <button className={`${btn} hover:!bg-[#e81123]`} onClick={() => void w().close()} title={L("Закрити", "Close")} aria-label={L("Закрити", "Close")}>
        <svg {...g}><path d="M0 0l10 10M10 0L0 10" /></svg>
      </button>
    </div>
  );
}
