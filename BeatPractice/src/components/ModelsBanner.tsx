import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { modelsCancel, modelsDownload, modelsDownloadable, modelsStatus } from "../platform";

/**
 * Android: the neural networks (~220 MB) are not inside the app. Until they are downloaded, only ready packs (.beatpack) can be opened; after
 * that songs can be analysed and split into parts. Shown only where it is needed.
 */
export function ModelsBanner({ lang, onInstalled }: { lang: "uk" | "en"; onInstalled?: () => void }) {
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const [need, setNeed] = useState<{ sizeMb: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!modelsDownloadable) return;
    modelsStatus().then((s) => { if (!s.installed) setNeed({ sizeMb: s.sizeMb }); }).catch(() => {});
  }, []);
  if (!need) return null;

  const start = async () => {
    setErr(""); setBusy(true); setProgress(0);
    try {
      await modelsDownload(setProgress);
      setNeed(null); onInstalled?.();
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };
  return (
    <div id="models-banner" role="region" aria-label={L("Завантаження моделей", "Model download")} className="mx-3 mt-3 rounded-2xl border border-slate-700 bg-slate-900 p-3 space-y-2">
      <p className="text-sm">
        {L(
          `Щоб аналізувати треки й розділяти їх на партії, потрібно один раз завантажити моделі (≈${need.sizeMb} МБ, краще через Wi-Fi). Готові пакети .beatpack відкриваються й без цього.`,
          `To analyse tracks and split them into parts, the models (≈${need.sizeMb} MB, better on Wi-Fi) have to be downloaded once. Ready .beatpack packs open without them.`,
        )}
      </p>
      {busy && <div className="h-2 rounded-full overflow-hidden bg-slate-800"><div className="h-full bg-sky-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
      {err && <p role="alert" className="text-sm text-rose-500 break-words">{err}</p>}
      <div className="flex gap-2">
        {busy
          ? <button id="btn-models-cancel" className="px-4 py-1.5 text-xs font-bold rounded-lg border border-slate-600 cursor-pointer" onClick={() => void modelsCancel()}>{L("Скасувати", "Cancel")} ({Math.round(progress * 100)}%)</button>
          : <button id="btn-models-download" className="px-4 py-1.5 text-xs font-bold rounded-lg bg-sky-700 hover:bg-sky-600 text-white cursor-pointer inline-flex items-center gap-2" onClick={() => void start()}><Download className="w-4 h-4" />{L("Завантажити моделі", "Download the models")}</button>}
      </div>
    </div>
  );
}
