import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";

/** Minimise / maximise / close for the window without the system title bar (Windows). */
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

  const btn = "w-12 self-stretch flex items-center justify-center text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer transition-colors";
  const w = () => getCurrentWindow();
  return (
    <div className="flex items-stretch shrink-0" id="window-controls">
      <button className={btn} onClick={() => void w().minimize()} title={L("Згорнути", "Minimize")} aria-label={L("Згорнути", "Minimize")}><Minus className="w-6 h-6" /></button>
      <button className={btn} onClick={() => void w().toggleMaximize()} title={maximized ? L("Відновити розмір", "Restore") : L("Розгорнути", "Maximize")} aria-label={maximized ? L("Відновити розмір", "Restore") : L("Розгорнути", "Maximize")}>
        {maximized ? <Copy className="w-6 h-6" /> : <Square className="w-6 h-6" />}
      </button>
      <button className={`${btn} hover:!bg-rose-600`} onClick={() => void w().close()} title={L("Закрити", "Close")} aria-label={L("Закрити", "Close")}><X className="w-6 h-6" /></button>
    </div>
  );
}
