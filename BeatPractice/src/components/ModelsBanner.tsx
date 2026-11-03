import { useEffect, useRef, useState } from "react";
import { modelsCancel, modelsDownload, modelsDownloadable, modelsStatus } from "../platform";

/**
 * Android: the neural networks are inside the app, but have to be copied into the app's own folder once (a few seconds on the first start).
 * Starts by itself and shows the progress; if something goes wrong there is a "Try again" button. Shown only where it is needed.
 */
export function ModelsBanner({ lang }: { lang: "uk" | "en" }) {
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const [need, setNeed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const run = async () => {
    setErr(""); setBusy(true); setProgress(0);
    try { await modelsDownload(setProgress); setNeed(false); }
    catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!modelsDownloadable || started.current) return;
    started.current = true;
    modelsStatus().then((s) => { if (!s.installed) { setNeed(true); void run(); } }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!need) return null;
  return (
    <div id="models-banner" role="status" aria-label={L("Підготовка моделей", "Preparing the models")} className="mx-3 mt-3 rounded-2xl border border-slate-700 bg-slate-900 p-3 space-y-2">
      <p className="text-sm">{L("Одноразова підготовка нейромереж для аналізу й розділення треків…", "One-time preparation of the neural networks for analysis and separation…")}</p>
      {busy && <div className="h-2 rounded-full overflow-hidden bg-slate-800"><div className="h-full bg-sky-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
      {err && <p role="alert" className="text-sm text-rose-500 break-words">{err}</p>}
      <div className="flex gap-2">
        {busy
          ? <button id="btn-models-cancel" className="px-4 py-1.5 text-xs font-bold rounded-lg border border-slate-600 cursor-pointer" onClick={() => void modelsCancel()}>{L("Скасувати", "Cancel")} ({Math.round(progress * 100)}%)</button>
          : <button id="btn-models-retry" className="px-4 py-1.5 text-xs font-bold rounded-lg bg-sky-700 hover:bg-sky-600 text-white cursor-pointer" onClick={() => void run()}>{L("Спробувати знову", "Try again")}</button>}
      </div>
    </div>
  );
}
