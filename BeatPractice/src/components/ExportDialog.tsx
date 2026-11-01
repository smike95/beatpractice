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
  stemGains: number[];   // per stem, level 0..1.5 (without the mute)
  metronomeOn: boolean;
  countInBars: number;   // the count-in set in the player (0 = off)
  loop: { active: boolean; start: number; end: number } | null; // the A-B loop, if it is on
  onClose: () => void;
}) {
  const { lang, displayName, originalBpm, currentBpm, stemNames, stemMuted, stemGains, metronomeOn, countInBars, loop, onClose } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const loopOn = !!loop && loop.active && loop.end > loop.start;
  const [loopOnly, setLoopOnly] = useState(loopOn);                 // with a loop on, the loop part is offered first
  const [withMetronome, setWithMetronome] = useState(false);
  const [withCountIn, setWithCountIn] = useState(countInBars > 0);
  const [ciBars, setCiBars] = useState(countInBars > 0 ? Math.min(2, countInBars) : 1);
  const [separate, setSeparate] = useState(false);
  // parts to export: by default those that are on in the player right now
  const [picked, setPicked] = useState<boolean[]>(() => stemNames.map((_, i) => !stemMuted[i]));
  const [fileCount, setFileCount] = useState(1);
  const [raw, setSt] = useState<ExportStatus | null>(null);
  const [started, setStarted] = useState(false);
  // a finished/failed export left over from an earlier opening of this dialog is not shown
  const st = started || raw?.state === 1 ? raw : null;
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
  const nm = (n: string) => (NAMES[n] ?? [n, n])[lang === "en" ? 1 : 0];
  const hasStems = stemNames.length > 0;
  const chosen = stemNames.map((_, i) => i).filter((i) => picked[i]);
  const off = stemNames.filter((_, i) => !picked[i]).map(nm);
  const cleanName = displayName.replace(/[\\/:*?"<>|]+/g, " ").trim() || "track";
  const tags = [`${Math.round(currentBpm)} BPM`];
  if (loopOnly && loopOn) tags.push(L("цикл", "loop"));
  if (hasStems && !separate && off.length) tags.push(L("без", "no") + " " + off.join(", "));
  const suggested = `${cleanName} (${tags.join(", ")}).wav`;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const noParts = hasStems && chosen.length === 0;
  const ciOn = withMetronome && withCountIn;

  const begin = async () => {
    setErr("");
    try {
      const path = await save({
        title: separate ? L("Назва файлів (до неї додасться назва партії)", "File name (the part name is added to it)") : L("Зберегти змінений трек", "Save the modified track"),
        defaultPath: suggested,
        filters: [{ name: "WAV", extensions: ["wav"] }],
      });
      if (!path) return;
      const out = /\.wav$/i.test(path) ? path : path + ".wav";
      setOutPath(out);
      setStarted(true);
      const ok = await core.exportStartEx({
        path: out,
        metronome: withMetronome,
        countInBars: ciOn ? ciBars : 0,
        rangeA: loopOnly && loopOn ? loop!.start : -1,
        rangeB: loopOnly && loopOn ? loop!.end : -1,
        separate: hasStems && separate,
        stems: hasStems ? chosen : [],
        gains: hasStems ? chosen.map((i) => stemGains[i] ?? 1) : [],
      });
      setFileCount(hasStems && separate ? chosen.length + (withMetronome ? 1 : 0) : 1);
      if (!ok) { setErr(L("Не вдалося почати експорт (уже триває інший або трек не готовий).", "Could not start the export (another one is running or the track is not ready).")); return; }
      startPolling();
    } catch (e) { setErr(String(e)); }
  };
  const cancel = async () => { try { await core.exportCancel(); } catch { /* ignore */ } void poll(); };
  const close = () => { if (running) void cancel(); onClose(); };

  const pct = Math.round((st?.progress ?? 0) * 100);

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div role="dialog" aria-modal="true" id="export-dialog" className="track-edit-dialog w-full max-w-lg rounded-2xl border shadow-2xl p-5 space-y-4">
          <p className="text-base font-bold text-emerald-600">{L("Трек успішно експортовано", "The track was exported successfully")}</p>
          <p className="text-sm break-all">{fileCount > 1 ? L(`Збережено файлів: ${fileCount}. Назва початку`, `Files saved: ${fileCount}. Name starts with`) : L("Файл збережено", "Saved to")}: {fileCount > 1 ? outPath.replace(/\.wav$/i, "") + " - …" : outPath}</p>
          <div className="flex justify-end">
            <button id="btn-export-close" className="px-4 py-1.5 text-xs font-bold rounded-lg bg-sky-700 hover:bg-sky-600 text-white cursor-pointer" onClick={onClose}>{L("Закрити", "Close")}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" id="export-dialog" className="track-edit-dialog w-full max-w-lg rounded-2xl border shadow-2xl p-5 space-y-4 max-h-full overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold">{L("Експорт треку", "Export track")}</h3>
          <button className="track-edit-close p-1 rounded-lg cursor-pointer" onClick={close} title={L("Закрити", "Close")}><X className="w-6 h-6" /></button>
        </div>

        <p className="track-edit-label text-sm truncate" title={displayName}>{displayName}</p>

        {loopOn && (
          <div className="space-y-1.5" role="radiogroup" aria-label={L("Що експортувати", "What to export")}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="radio" name="export-range" className="w-5 h-5 cursor-pointer" checked={loopOnly} disabled={running} onChange={() => setLoopOnly(true)} />
              <span className="text-sm">{L("Тільки цикл", "Only the loop")} <span className="font-mono">({mmss(loop!.start)} – {mmss(loop!.end)})</span></span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="radio" name="export-range" className="w-5 h-5 cursor-pointer" checked={!loopOnly} disabled={running} onChange={() => setLoopOnly(false)} />
              <span className="text-sm">{L("Весь трек", "The whole track")}</span>
            </label>
          </div>
        )}

        <ul className="text-sm space-y-1.5">
          <li>{L("Темп", "Tempo")}: <strong className="font-mono">{originalBpm > 0 ? `${originalBpm.toFixed(1)} → ${currentBpm.toFixed(1)} BPM (${speedPct}%)` : `${currentBpm.toFixed(1)} BPM`}</strong></li>
        </ul>

        {hasStems && (
          <div className="space-y-2">
            <div className="text-sm font-semibold">{L("Партії", "Parts")}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {stemNames.map((n, i) => (
                <label key={n + i} className="flex items-center gap-2 cursor-pointer select-none text-sm">
                  <input type="checkbox" className="w-5 h-5 cursor-pointer" checked={!!picked[i]} disabled={running}
                    onChange={() => setPicked((p) => p.map((v, k) => (k === i ? !v : v)))} />
                  {nm(n)}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" className="w-5 h-5 cursor-pointer" checked={separate} disabled={running} onChange={(e) => setSeparate(e.target.checked)} />
              <span className="text-sm">{L("Кожну партію окремим файлом", "Each part as a separate file")}</span>
            </label>
            <p className="track-edit-label text-xs">
              {separate
                ? L("Партії зберігаються з оригінальною гучністю (без регуляторів мікшера), однакової довжини, щоб їх можна було зібрати в іншій програмі.", "Parts are saved at their original level (mixer faders are not applied) and with equal length, so they can be put together in another program.")
                : L("В один файл змішуються позначені партії з рівнями з мікшера.", "The ticked parts are mixed into one file at the mixer levels.")}
            </p>
          </div>
        )}
        {!hasStems && <p className="track-edit-label text-xs">{L("Експорт бере поточні налаштування темпу й гучності. Щоб експортувати партії окремо, розділіть трек у «Мікшері».", "The export uses the current tempo and volume. To export parts separately, split the track in the “Mixer”.")}</p>}

        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input type="checkbox" className="w-5 h-5 cursor-pointer" checked={withMetronome} disabled={running} onChange={(e) => setWithMetronome(e.target.checked)} />
            <span className="text-sm">{separate && hasStems ? L("Метроном окремим файлом", "Metronome as a separate file") : L("Додати метроном у файл", "Add the metronome to the file")}{metronomeOn ? "" : ` (${L("зараз вимкнений", "currently off")})`}</span>
          </label>
          {withMetronome && (
            <div className="pl-8 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input id="export-countin" type="checkbox" className="w-5 h-5 cursor-pointer" checked={withCountIn} disabled={running} onChange={(e) => setWithCountIn(e.target.checked)} />
                <span className="text-sm">{L("Відлік перед початком", "Count-in before the start")}</span>
              </label>
              {withCountIn && [1, 2].map((n) => (
                <button key={n} type="button" disabled={running} onClick={() => setCiBars(n)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg border cursor-pointer ${ciBars === n ? "bg-sky-700 text-white border-sky-700" : "track-edit-btn"}`}>
                  {n} {L(n === 1 ? "такт" : "такти", n === 1 ? "bar" : "bars")}
                </button>
              ))}
            </div>
          )}
          {separate && hasStems && withMetronome && withCountIn && (
            <p className="track-edit-label text-xs pl-8">{L("У файлах партій відлік — тиша тієї ж довжини, клік чути лише у файлі метронома.", "In the part files the count-in is silence of the same length; the clicks are only in the metronome file.")}</p>
          )}
        </div>

        {running && (
          <div className="space-y-1.5">
            <div className="h-3 rounded-full overflow-hidden track-edit-cover"><div className="h-full bg-sky-600 transition-all" style={{ width: `${pct}%` }} /></div>
            <div className="track-edit-label text-xs">{L("Експорт", "Exporting")}: {pct}%</div>
          </div>
        )}
        {(err || st?.state === 3) && <p className="text-sm text-rose-500 break-words">{err || st?.error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          {running ? (
            <button className="track-edit-btn !w-auto px-4 py-1.5 text-xs font-bold rounded-lg border cursor-pointer" onClick={cancel}>{L("Скасувати експорт", "Cancel export")}</button>
          ) : (
            <>
              <button className="track-edit-btn !w-auto px-4 py-1.5 text-xs font-bold rounded-lg border cursor-pointer" onClick={close}>{L("Закрити", "Close")}</button>
              <button id="btn-export-start" disabled={noParts} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-sky-700 hover:bg-sky-600 text-white cursor-pointer inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-default" onClick={begin}>
                <Download className="w-6 h-6" />{separate && hasStems ? L("Зберегти файли WAV…", "Save WAV files…") : L("Зберегти як WAV…", "Save as WAV…")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
