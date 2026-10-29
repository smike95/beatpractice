import { useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Download, X } from "lucide-react";
import { core, type ExportStatus } from "../core";
import { NAMES } from "./StemsPanel";

type Lang = "uk" | "en";

/** Exports the track as it sounds now: tempo, parts switched off, optionally the metronome (WAV, 16-bit). */
export function ExportDialog(props: {
  lang: Lang;
  displayName: string;
  originalBpm: number;   // 0 = unknown
  currentBpm: number;
  stemNames: string[];   // empty when the song has not been separated
  stemMuted: boolean[];  // per stem
  metronomeOn: boolean;
  onClose: () => void;
}) {
  const { lang, displayName, originalBpm, currentBpm, stemNames, stemMuted, metronomeOn, onClose } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const [withMetronome, setWithMetronome] = useState(false);
  const [st, setSt] = useState<ExportStatus | null>(null);
  const [outPath, setOutPath] = useState("");
  const [err, setErr] = useState("");
  const timer = useRef<number | null>(null);

  const running = st?.state === 1;
  const done = st?.state === 2;

  const poll = async () => {
    try {
      const s = await core.exportStatus();
      setSt(s);
      if (s.state !== 1 && timer.current) { window.clearInterval(timer.current); timer.current = null; }
    } catch (e) { setErr(String(e)); }
  };
  const startPolling = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(poll, 300);
    void poll();
  };
  useEffect(() => {
    void poll().then(() => undefined);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (st?.state === 1 && !timer.current) startPolling(); }, [st?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const speedPct = originalBpm > 0 ? Math.round((currentBpm / originalBpm) * 100) : 100;
  const off = stemNames.filter((_, i) => stemMuted[i]).map((n) => (NAMES[n] ?? [n, n])[lang === "en" ? 1 : 0]);
  const cleanName = displayName.replace(/[\\/:*?"<>|]+/g, " ").trim() || "track";
  const suggested = `${cleanName} (${Math.round(currentBpm)} BPM${off.length ? ", " + L("без", "no") + " " + off.join(", ") : ""}).wav`;

  const begin = async () => {
    setErr("");
    try {
      const path = await save({
        title: L("Зберегти змінений трек", "Save the modified track"),
        defaultPath: suggested,
        filters: [{ name: "WAV", extensions: ["wav"] }],
      });
      if (!path) return;
      const out = /\.wav$/i.test(path) ? path : path + ".wav";
      setOutPath(out);
      const ok = await core.exportStart(out, withMetronome);
      if (!ok) { setErr(L("Не вдалося почати експорт (уже триває інший або трек не готовий).", "Could not start the export (another one is running or the track is not ready).")); return; }
      startPolling();
    } catch (e) { setErr(String(e)); }
  };
  const cancel = async () => { try { await core.exportCancel(); } catch { /* ignore */ } void poll(); };
  const close = () => { if (running) void cancel(); onClose(); };

  const pct = Math.round((st?.progress ?? 0) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" id="export-dialog" className="track-edit-dialog w-full max-w-lg rounded-2xl border shadow-2xl p-5 space-y-4 max-h-full overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold">{L("Експорт треку", "Export track")}</h3>
          <button className="track-edit-close p-1 rounded-lg cursor-pointer" onClick={close} title={L("Закрити", "Close")}><X className="w-6 h-6" /></button>
        </div>

        <p className="track-edit-label text-sm truncate" title={displayName}>{displayName}</p>

        <ul className="text-sm space-y-1.5">
          <li>{L("Темп", "Tempo")}: <strong className="font-mono">{originalBpm > 0 ? `${originalBpm.toFixed(1)} → ${currentBpm.toFixed(1)} BPM (${speedPct}%)` : `${currentBpm.toFixed(1)} BPM`}</strong></li>
          <li>{L("Партії", "Parts")}: <strong>{stemNames.length === 0 ? L("оригінальний запис", "original recording") : off.length === 0 ? L("усі ввімкнені", "all on") : `${L("вимкнено", "off")}: ${off.join(", ")}`}</strong></li>
        </ul>
        <p className="track-edit-label text-xs">{L("Експорт бере поточні налаштування темпу, гучності та партій (вкладка «Розділення партій»).", "The export uses the current tempo, volume and parts settings (the “Stem separation” tab).")}</p>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input type="checkbox" className="w-5 h-5 cursor-pointer" checked={withMetronome} disabled={running} onChange={(e) => setWithMetronome(e.target.checked)} />
          <span className="text-sm">{L("Додати метроном у файл", "Add the metronome to the file")}{metronomeOn ? "" : ` (${L("зараз вимкнений", "currently off")})`}</span>
        </label>

        {running && (
          <div className="space-y-1.5">
            <div className="h-3 rounded-full overflow-hidden track-edit-cover"><div className="h-full bg-sky-600 transition-all" style={{ width: `${pct}%` }} /></div>
            <div className="track-edit-label text-xs">{L("Експорт", "Exporting")}: {pct}%</div>
          </div>
        )}
        {done && <p className="text-sm text-emerald-600 font-semibold break-all">{L("Готово", "Done")}: {outPath}</p>}
        {(err || st?.state === 3) && <p className="text-sm text-rose-500 break-words">{err || st?.error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          {running ? (
            <button className="track-edit-btn !w-auto px-4 py-1.5 text-xs font-bold rounded-lg border cursor-pointer" onClick={cancel}>{L("Скасувати експорт", "Cancel export")}</button>
          ) : (
            <>
              <button className="track-edit-btn !w-auto px-4 py-1.5 text-xs font-bold rounded-lg border cursor-pointer" onClick={close}>{L("Закрити", "Close")}</button>
              <button id="btn-export-start" className="px-4 py-1.5 text-xs font-bold rounded-lg bg-sky-700 hover:bg-sky-600 text-white cursor-pointer inline-flex items-center gap-2" onClick={begin}>
                <Download className="w-6 h-6" />{L("Зберегти як WAV…", "Save as WAV…")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
