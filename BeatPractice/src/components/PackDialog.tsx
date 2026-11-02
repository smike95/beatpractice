import { useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Package, X } from "lucide-react";
import { core, type ExportStatus } from "../core";
import { LoopSlot } from "../types";
import { NAMES } from "./StemsPanel";
import { getOwnerId } from "../utils/license";

type Lang = "uk" | "en";
type Mode = "separate" | "together" | "merge";
const MAX_GROUPS = 4;

/**
 * Saves the track as a .beatpack: a file that already holds the beat map and the separated parts, so another (weaker) device opens it
 * without analysing or separating. The user decides how the parts are packed: every part alone, all together (the song only),
 * or some of them merged into groups.
 */
export function PackDialog(props: {
  lang: Lang;
  displayName: string;
  title: string;
  artist: string;
  duration: number;       // seconds, for the size estimate
  stemNames: string[];    // empty when the song has not been separated
  loops: LoopSlot[];
  onClose: () => void;
}) {
  const { lang, displayName, title, artist, duration, stemNames, loops, onClose } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const nm = (n: string) => (NAMES[n] ?? [n, n])[lang === "en" ? 1 : 0];
  const hasStems = stemNames.length > 0;

  const [mode, setMode] = useState<Mode>(hasStems ? "separate" : "together");
  // merge mode: the group (0..3) of every part; by default the voice alone and everything else together
  const [group, setGroup] = useState<number[]>(() => stemNames.map((n) => (n === "vocals" ? 1 : 0)));
  const [groupNames, setGroupNames] = useState<string[]>(["", "", "", ""]);
  const [withMix, setWithMix] = useState(false);
  const [raw, setSt] = useState<ExportStatus | null>(null);
  const [started, setStarted] = useState(false);
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
  useEffect(() => { void poll(); return () => { if (timer.current) window.clearInterval(timer.current); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // the groups as the core wants them
  const groupLists: number[][] =
    mode === "separate" ? stemNames.map((_, i) => [i])
    : mode === "merge" ? Array.from({ length: MAX_GROUPS }, (_, g) => stemNames.map((_, i) => i).filter((i) => group[i] === g)).filter((l) => l.length > 0)
    : [];
  const usedGroupIds = mode === "merge" ? Array.from({ length: MAX_GROUPS }, (_, g) => g).filter((g) => group.some((x, i) => x === g && i < stemNames.length)) : [];
  const mixOn = mode === "together" || withMix;
  const tracksCount = (mode === "together" ? 0 : groupLists.length) + (mixOn ? 1 : 0);
  const estMb = Math.round((tracksCount * duration * 44100 * 4 * 0.55) / 1048576);
  const bad = mode === "merge" && groupLists.length < 1;

  const begin = async () => {
    setErr("");
    try {
      const safe = (displayName || "track").replace(/[\\/:*?"<>|]+/g, " ").trim();
      const path = await save({
        title: L("Зберегти пакет", "Save the pack"),
        defaultPath: `${safe}.beatpack`,
        filters: [{ name: "BeatPack", extensions: ["beatpack"] }],
      });
      if (!path) return;
      const out = /\.beatpack$/i.test(path) ? path : path + ".beatpack";
      setOutPath(out);
      setStarted(true);
      const names = mode === "merge" ? usedGroupIds.map((g) => groupNames[g].replace(/[;\n|]/g, " ").trim()).join(";") : "";
      const ok = await core.packSave({
        path: out,
        title: title || displayName,
        artist,
        owner: getOwnerId(),
        createdBy: "BeatPractice",
        groups: groupLists.map((l) => l.join(",")).join(";"),
        groupNames: names,
        loops: loops.map((l) => `${l.start}|${l.end}|${(l.name ?? "").replace(/[|\n]/g, " ")}`).join("\n"),
        includeMix: mixOn,
      });
      if (!ok) { setErr(L("Не вдалося почати збереження (триває інша операція або трек не готовий).", "Could not start (another operation is running or the track is not ready).")); return; }
      startPolling();
    } catch (e) { setErr(String(e)); }
  };
  const cancel = async () => { try { await core.exportCancel(); } catch { /* ignore */ } void poll(); };
  const close = () => { if (running) void cancel(); onClose(); };
  const pct = Math.round((st?.progress ?? 0) * 100);
  const chk = "w-5 h-5 cursor-pointer";
  const row = "flex items-center gap-3 cursor-pointer select-none";

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div role="dialog" aria-modal="true" id="pack-dialog" className="track-edit-dialog w-full max-w-lg rounded-2xl border shadow-2xl p-5 space-y-4">
          <p className="text-base font-bold text-emerald-600">{L("Пакет збережено", "The pack was saved")}</p>
          <p className="text-sm break-all">{outPath}</p>
          <p className="track-edit-label text-xs">{L("Скопіюйте цей файл на інший ваш пристрій і відкрийте його в програмі: аналіз і розділення там не потрібні.", "Copy this file to your other device and open it in the program: no analysis or separation is needed there.")}</p>
          <div className="flex justify-end"><button id="btn-pack-close" className="px-4 py-1.5 text-xs font-bold rounded-lg bg-sky-700 hover:bg-sky-600 text-white cursor-pointer" onClick={onClose}>{L("Закрити", "Close")}</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" id="pack-dialog" className="track-edit-dialog w-full max-w-lg rounded-2xl border shadow-2xl p-5 space-y-4 max-h-full overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold inline-flex items-center gap-2"><Package className="w-6 h-6" />{L("Зберегти пакет", "Save as a pack")}</h3>
          <button className="track-edit-close p-1 rounded-lg cursor-pointer" onClick={close} title={L("Закрити", "Close")}><X className="w-6 h-6" /></button>
        </div>
        <p className="track-edit-label text-sm truncate" title={displayName}>{displayName}</p>
        <p className="track-edit-label text-xs">{L(
          "Пакет містить трек, його ритм і партії. Його можна відкрити на слабкому пристрої, де трек не доведеться аналізувати й розділяти. Призначений для ваших власних пристроїв.",
          "The pack holds the track, its rhythm and its parts. It opens on a weak device without analysing or separating. It is meant for your own devices.")}</p>

        <div className="space-y-1.5" role="radiogroup" aria-label={L("Як упакувати партії", "How to pack the parts")}>
          <div className="text-xs font-bold uppercase tracking-wide track-edit-label">{L("Партії", "Parts")}</div>
          {hasStems && (
            <label className={row}><input type="radio" name="pack-mode" className={chk} checked={mode === "separate"} disabled={running} onChange={() => setMode("separate")} />
              <span className="text-sm">{L("Усі окремо", "All separate")} <span className="track-edit-label text-xs">({stemNames.map(nm).join(", ")})</span></span></label>
          )}
          <label className={row}><input type="radio" name="pack-mode" className={chk} checked={mode === "together"} disabled={running} onChange={() => setMode("together")} />
            <span className="text-sm">{L("Усі разом (лише пісня, без партій)", "All together (the song only, no parts)")}</span></label>
          {hasStems && (
            <label className={row}><input type="radio" name="pack-mode" className={chk} checked={mode === "merge"} disabled={running} onChange={() => setMode("merge")} />
              <span className="text-sm">{L("Об'єднати деякі", "Merge some")}</span></label>
          )}
          {!hasStems && <p className="track-edit-label text-xs">{L("Трек ще не розділено на партії: розділіть його в «Мікшері», щоб класти партії в пакет.", "The track is not split into parts yet: split it in the “Mixer” to put parts into the pack.")}</p>}
        </div>

        {mode === "merge" && (
          <div className="space-y-2 rounded-xl border track-edit-section p-3">
            <p className="track-edit-label text-xs">{L("Оберіть для кожної партії групу. Партії однієї групи зіллються в одну доріжку.", "Choose a group for every part. Parts of one group are merged into one track.")}</p>
            {stemNames.map((n, i) => (
              <div key={n + i} className="flex items-center justify-between gap-3">
                <span className="text-sm">{nm(n)}</span>
                <select aria-label={`${nm(n)}: ${L("група", "group")}`} disabled={running} value={group[i] ?? 0} onChange={(e) => setGroup((g) => g.map((v, k) => (k === i ? parseInt(e.target.value, 10) : v)))}
                  className="track-edit-btn !w-auto px-2 py-1 text-xs rounded-lg border">
                  {Array.from({ length: MAX_GROUPS }, (_, g) => <option key={g} value={g}>{L("Група", "Group")} {g + 1}</option>)}
                </select>
              </div>
            ))}
            <div className="space-y-1.5 pt-1">
              {usedGroupIds.map((g) => (
                <label key={g} className="flex items-center gap-2 text-sm">
                  <span className="shrink-0">{L("Група", "Group")} {g + 1}:</span>
                  <input type="text" maxLength={30} disabled={running} value={groupNames[g]} onChange={(e) => setGroupNames((a) => a.map((v, k) => (k === g ? e.target.value : v)))}
                    placeholder={stemNames.filter((_, i) => group[i] === g).map(nm).join(" + ")} aria-label={`${L("Назва групи", "Group name")} ${g + 1}`}
                    className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-transparent border border-slate-600 text-sm" />
                </label>
              ))}
            </div>
          </div>
        )}

        {mode !== "together" && (
          <label className={row}><input type="checkbox" className={chk} checked={withMix} disabled={running} onChange={(e) => setWithMix(e.target.checked)} />
            <span className="text-sm">{L("Додати й оригінальний трек", "Also include the original track")} <span className="track-edit-label text-xs">({L("точніший звук оригіналу, файл більший", "exact original sound, bigger file")})</span></span></label>
        )}
        {mode !== "together" && !withMix && <p className="track-edit-label text-xs">{L("Без оригіналу відтворення «без партій» складається з усіх партій разом.", "Without the original, playing “without parts” is made of all the parts together.")}</p>}

        <p className="track-edit-label text-xs">{L(`Приблизний розмір файлу: ${estMb} МБ`, `Approximate file size: ${estMb} MB`)}{loops.length ? L(`. Цикли (${loops.length}) і їхні назви зберігаються в пакеті.`, `. The loops (${loops.length}) and their names are saved in the pack.`) : ""}</p>

        {running && (
          <div className="space-y-1">
            <div className="track-edit-label text-xs">{L("Збереження", "Saving")}: {pct}%</div>
            <div className="h-2 rounded-full overflow-hidden track-edit-cover"><div className="h-full bg-sky-600 transition-all" style={{ width: `${pct}%` }} /></div>
          </div>
        )}
        {(st?.state === 3 || err) && <p role="alert" className="text-sm text-rose-600 break-words">{err || st?.error}</p>}

        <div className="flex justify-end gap-2">
          {running
            ? <button className="px-4 py-1.5 text-xs font-bold rounded-lg border track-edit-btn cursor-pointer" onClick={cancel}>{L("Скасувати", "Cancel")}</button>
            : (<>
                <button className="px-4 py-1.5 text-xs font-bold rounded-lg border track-edit-btn cursor-pointer" onClick={close}>{L("Закрити", "Close")}</button>
                <button id="btn-pack-start" disabled={bad} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-sky-700 hover:bg-sky-600 text-white cursor-pointer inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-default" onClick={begin}>
                  <Package className="w-4 h-4" />{L("Зберегти пакет…", "Save the pack…")}
                </button>
              </>)}
        </div>
      </div>
    </div>
  );
}
