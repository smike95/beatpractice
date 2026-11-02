import { useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Download, X } from "lucide-react";
import { core, type ExportStatus } from "../core";
import { LoopSlot, loopLabel } from "../types";
import { NAMES } from "./StemsPanel";
import { NumberStepper } from "./NumberStepper";

type Lang = "uk" | "en";

/** One line of the dialog: the title, what is set now, and a button to change it (the controls fold open under it). */
function Section(props: { title: string; summary: string; open: boolean; disabled: boolean; lang: Lang; onToggle: () => void; children: React.ReactNode; id: string }) {
  const { title, summary, open, disabled, lang, onToggle, children, id } = props;
  return (
    <div className="rounded-xl border track-edit-section p-3 space-y-2.5" id={id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wide track-edit-label">{title}</div>
          <div className="text-sm break-words">{summary}</div>
        </div>
        <button type="button" disabled={disabled} aria-expanded={open} onClick={onToggle}
          className="track-edit-btn !w-auto shrink-0 px-3 py-1 text-xs font-bold rounded-lg border cursor-pointer disabled:opacity-40">
          {open ? (lang === "en" ? "Done" : "Готово") : (lang === "en" ? "Change" : "Змінити")}
        </button>
      </div>
      {open && <div className="space-y-2.5 pt-1">{children}</div>}
    </div>
  );
}

/** Exports the track as it is set up now (tempo, metronome, parts, loop); each of them can be changed here (WAV, 16-bit). */
export function ExportDialog(props: {
  lang: Lang;
  displayName: string;
  originalBpm: number;   // 0 = unknown
  currentBpm: number;
  stemNames: string[];   // empty when the song has not been separated
  stemMuted: boolean[];  // per stem
  stemGains: number[];   // per stem, level 0..1.5 (without the mute)
  metronomeOn: boolean;
  accentOn: boolean;
  quiet: { enabled: boolean; clickBars: number; quietBars: number };
  countInBars: number;   // the count-in set in the player (0 = off)
  loops: LoopSlot[];     // the saved loops
  activeLoop: number | null;
  onClose: () => void;
}) {
  const { lang, displayName, originalBpm, currentBpm, stemNames, stemMuted, stemGains, metronomeOn, accentOn, quiet, countInBars, loops, activeLoop, onClose } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);

  // everything starts as it is in the player right now
  const [bpm, setBpm] = useState(Math.round(currentBpm * 10) / 10);
  const [range, setRange] = useState<number>(activeLoop !== null && loops[activeLoop] ? activeLoop : -1);   // -1 = the whole track, else a loop index
  const [withClick, setWithClick] = useState(metronomeOn);
  const [accent, setAccent] = useState(accentOn);
  const [quietOn, setQuietOn] = useState(quiet.enabled);
  const [withCountIn, setWithCountIn] = useState(countInBars > 0);
  const [ciBars, setCiBars] = useState(countInBars > 0 ? Math.min(2, countInBars) : 1);
  const [separate, setSeparate] = useState(false);
  const [clickTarget, setClickTarget] = useState(-1);               // separate files: -1 = own file, else the part that gets the clicks
  const [picked, setPicked] = useState<boolean[]>(() => stemNames.map((_, i) => !stemMuted[i]));
  const [openSec, setOpenSec] = useState<string | null>(null);
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


  const nm = (n: string) => (NAMES[n] ?? [n, n])[lang === "en" ? 1 : 0];
  const hasStems = stemNames.length > 0;
  const chosen = stemNames.map((_, i) => i).filter((i) => picked[i]);
  const noParts = hasStems && chosen.length === 0;
  const loopSlot = range >= 0 ? loops[range] : undefined;
  const mmss = (v: number) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, "0")}`;
  const bpmChanged = originalBpm > 0 && Math.abs(bpm - currentBpm) > 0.05;
  const ratio = originalBpm > 0 ? bpm / originalBpm : 0;
  const clickTargetValid = separate && hasStems && clickTarget >= 0 && picked[clickTarget];
  const ciOn = withClick && withCountIn;

  // short descriptions of what is set (shown while the section is folded)
  const tempoSummary = originalBpm > 0
    ? `${bpm.toFixed(1)} BPM · ${L("оригінал", "original")} ${originalBpm.toFixed(1)} BPM (${Math.round((bpm / originalBpm) * 100)}%)`
    : `${bpm.toFixed(1)} BPM`;
  const clickSummary = !withClick ? L("Без метронома", "No metronome") : [
    L("Клік у файлі", "Clicks included"),
    accent ? L("з акцентом", "accented") : L("без акценту", "no accent"),
    quietOn ? L(`тихі такти ${quiet.clickBars}+${quiet.quietBars}`, `quiet bars ${quiet.clickBars}+${quiet.quietBars}`) : null,
    withCountIn ? L(`відлік ${ciBars} ${ciBars === 1 ? "такт" : "такти"}`, `count-in ${ciBars} bar${ciBars === 1 ? "" : "s"}`) : null,
    separate && hasStems ? (clickTargetValid ? L(`у доріжці «${nm(stemNames[clickTarget])}»`, `in “${nm(stemNames[clickTarget])}”`) : L("окремим файлом", "as a separate file")) : null,
  ].filter(Boolean).join(" · ");
  const partsSummary = !hasStems ? L("Трек не розділено на партії", "The track is not split into parts") : [
    chosen.map((i) => nm(stemNames[i])).join(", ") || L("нічого не вибрано", "nothing chosen"),
    separate ? L("кожна окремим файлом", "each as a separate file") : L("одним файлом", "one file"),
  ].join(" · ");
  const rangeSummary = range < 0 ? L("Весь трек", "The whole track")
    : `${L("Тільки цикл", "Only the loop")} «${loopLabel(loopSlot, range, lang)}» (${mmss(loopSlot!.start)} – ${mmss(loopSlot!.end)})`;

  const cleanName = displayName.replace(/[\\/:*?"<>|]+/g, " ").trim() || "track";
  const tags = [`${Math.round(bpm)} BPM`];
  if (loopSlot) tags.push(loopLabel(loopSlot, range, lang).replace(/[\\/:*?"<>|]+/g, " "));
  if (hasStems && !separate) { const off = stemNames.filter((_, i) => !picked[i]).map(nm); if (off.length) tags.push(L("без", "no") + " " + off.join(", ")); }
  const suggested = `${cleanName} (${tags.join(", ")}).wav`;

  const begin = async () => {
    setErr("");
    try {
      const path = await save({
        title: separate && hasStems ? L("Назва файлів (до неї додасться назва партії)", "File name (the part name is added to it)") : L("Зберегти змінений трек", "Save the modified track"),
        defaultPath: suggested,
        filters: [{ name: "WAV", extensions: ["wav"] }],
      });
      if (!path) return;
      const out = /\.wav$/i.test(path) ? path : path + ".wav";
      setOutPath(out);
      setStarted(true);
      const ok = await core.exportStartEx({
        path: out,
        metronome: withClick,
        countInBars: ciOn ? ciBars : 0,
        rangeA: loopSlot ? loopSlot.start : -1,
        rangeB: loopSlot ? loopSlot.end : -1,
        separate: hasStems && separate,
        stems: hasStems ? chosen : [],
        gains: hasStems ? chosen.map((i) => stemGains[i] ?? 1) : [],
        speedRatio: bpmChanged ? ratio : 0,
        accent: accent ? 1 : 0,
        quiet: quietOn ? 1 : 0,
        clickIntoStem: clickTargetValid ? clickTarget : -1,
      });
      setFileCount(hasStems && separate ? chosen.length + (withClick && !clickTargetValid ? 1 : 0) : 1);
      if (!ok) { setErr(L("Не вдалося почати експорт (уже триває інший або трек не готовий).", "Could not start the export (another one is running or the track is not ready).")); return; }
      startPolling();
    } catch (e) { setErr(String(e)); }
  };
  const cancel = async () => { try { await core.exportCancel(); } catch { /* ignore */ } void poll(); };
  const close = () => { if (running) void cancel(); onClose(); };

  const toggle = (id: string) => setOpenSec((v) => (v === id ? null : id));
  const chk = "w-5 h-5 cursor-pointer";
  const row = "flex items-center gap-3 cursor-pointer select-none";

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
        <p className="track-edit-label text-xs">{L("Трек експортується так, як налаштовано зараз. Біля кожного пункту його можна змінити.", "The track is exported as it is set up now. Each item can be changed.")}</p>

        <Section id="export-sec-tempo" lang={lang} disabled={running} open={openSec === "tempo"} onToggle={() => toggle("tempo")}
          title={L("Темп", "Tempo")} summary={tempoSummary}>
          <div className="flex flex-wrap items-center gap-2">
            <NumberStepper id="export-bpm" value={bpm} min={originalBpm > 0 ? Math.max(20, Math.round(originalBpm * 25) / 100) : 20} max={originalBpm > 0 ? Math.round(originalBpm * 200) / 100 : 400} step={1} decimals={1} suffix="BPM"
              label={L("Темп експорту", "Export tempo")} disabled={running} onChange={setBpm} />
            <button type="button" className="track-edit-btn !w-auto px-2.5 py-1 text-xs font-bold rounded-lg border cursor-pointer" disabled={running} onClick={() => setBpm(Math.round(currentBpm * 10) / 10)}>{L("Поточний", "Current")} {currentBpm.toFixed(1)}</button>
            {originalBpm > 0 && <button type="button" className="track-edit-btn !w-auto px-2.5 py-1 text-xs font-bold rounded-lg border cursor-pointer" disabled={running} onClick={() => setBpm(Math.round(originalBpm * 10) / 10)}>{L("Оригінал", "Original")} {originalBpm.toFixed(1)}</button>}
          </div>
        </Section>

        <Section id="export-sec-metronome" lang={lang} disabled={running} open={openSec === "metronome"} onToggle={() => toggle("metronome")}
          title={L("Метроном", "Metronome")} summary={clickSummary}>
          <label className={row}><input type="checkbox" className={chk} checked={withClick} disabled={running} onChange={(e) => setWithClick(e.target.checked)} /><span className="text-sm">{L("Додати клік метронома", "Add the metronome clicks")}</span></label>
          {withClick && (
            <div className="pl-8 space-y-2.5">
              <label className={row}><input type="checkbox" className={chk} checked={accent} disabled={running} onChange={(e) => setAccent(e.target.checked)} /><span className="text-sm">{L("Акцент на першій долі такту", "Accent on the first beat of the bar")}</span></label>
              <label className={row}><input type="checkbox" className={chk} checked={quietOn} disabled={running} onChange={(e) => setQuietOn(e.target.checked)} />
                <span className="text-sm">{L(`Тихі такти (${quiet.clickBars} з кліком, ${quiet.quietBars} без)`, `Quiet bars (${quiet.clickBars} with clicks, ${quiet.quietBars} silent)`)}</span></label>
              {quietOn && <p className="track-edit-label text-xs pl-8">{L("Кількість тактів задається у вкладці «Тренування».", "The number of bars is set in the “Training” tab.")}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <label className={row}><input id="export-countin" type="checkbox" className={chk} checked={withCountIn} disabled={running} onChange={(e) => setWithCountIn(e.target.checked)} /><span className="text-sm">{L("Відлік перед початком", "Count-in before the start")}</span></label>
                {withCountIn && [1, 2].map((n) => (
                  <button key={n} type="button" disabled={running} onClick={() => setCiBars(n)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg border cursor-pointer ${ciBars === n ? "bg-sky-700 text-white border-sky-700" : "track-edit-btn !w-auto"}`}>
                    {n} {L(n === 1 ? "такт" : "такти", n === 1 ? "bar" : "bars")}
                  </button>
                ))}
              </div>
              {separate && hasStems && (
                <div className="space-y-1.5" role="radiogroup" aria-label={L("Куди покласти клік", "Where to put the clicks")}>
                  <label className={row}><input type="radio" name="export-click-target" className={chk} checked={!clickTargetValid} disabled={running} onChange={() => setClickTarget(-1)} /><span className="text-sm">{L("Клік окремим файлом", "Clicks as a separate file")}</span></label>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className={row}><input type="radio" name="export-click-target" className={chk} checked={clickTargetValid} disabled={running || chosen.length === 0} onChange={() => setClickTarget(clickTargetValid ? clickTarget : chosen[0])} /><span className="text-sm">{L("Клік у доріжку:", "Clicks into the part:")}</span></label>
                    <select aria-label={L("Доріжка для кліку", "Part for the clicks")} disabled={running || !clickTargetValid} value={clickTargetValid ? clickTarget : (chosen[0] ?? 0)} onChange={(e) => setClickTarget(parseInt(e.target.value, 10))}
                      className="track-edit-btn !w-auto px-2 py-1 text-xs rounded-lg border">
                      {chosen.map((i) => <option key={i} value={i}>{nm(stemNames[i])}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {separate && hasStems && ciOn && <p className="track-edit-label text-xs">{L("Відлік у файлах, де немає кліку, — тиша тієї ж довжини, тож усі файли збігаються за часом.", "In files without the clicks the count-in is silence of the same length, so all files line up.")}</p>}
            </div>
          )}
        </Section>

        {hasStems ? (
          <Section id="export-sec-parts" lang={lang} disabled={running} open={openSec === "parts"} onToggle={() => toggle("parts")}
            title={L("Партії", "Parts")} summary={partsSummary}>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {stemNames.map((n, i) => (
                <label key={n + i} className="flex items-center gap-2 cursor-pointer select-none text-sm">
                  <input type="checkbox" className={chk} checked={!!picked[i]} disabled={running} onChange={() => setPicked((p) => p.map((v, k) => (k === i ? !v : v)))} />
                  {nm(n)}
                </label>
              ))}
            </div>
            <div className="space-y-1.5" role="radiogroup" aria-label={L("Як зберегти партії", "How to save the parts")}>
              <label className={row}><input type="radio" name="export-parts-mode" className={chk} checked={!separate} disabled={running} onChange={() => setSeparate(false)} /><span className="text-sm">{L("Одним треком (змішати позначені)", "As one track (mix the ticked parts)")}</span></label>
              <label className={row}><input type="radio" name="export-parts-mode" className={chk} checked={separate} disabled={running} onChange={() => setSeparate(true)} /><span className="text-sm">{L("Зберегти як окремі файли", "Save as separate files")}</span></label>
            </div>
            <p className="track-edit-label text-xs">
              {separate
                ? L("Партії зберігаються з оригінальною гучністю (без регуляторів мікшера), однакової довжини, щоб їх можна було зібрати в іншій програмі.", "Parts are saved at their original level (mixer faders are not applied) and with equal length, so they can be put together in another program.")
                : L("Позначені партії змішуються з рівнями з мікшера.", "The ticked parts are mixed at the mixer levels.")}
            </p>
          </Section>
        ) : (
          <div className="rounded-xl border track-edit-section p-3">
            <div className="text-xs font-bold uppercase tracking-wide track-edit-label">{L("Партії", "Parts")}</div>
            <div className="text-sm">{partsSummary}. <span className="track-edit-label text-xs">{L("Щоб експортувати партії окремо, розділіть трек у «Мікшері».", "To export parts separately, split the track in the “Mixer”.")}</span></div>
          </div>
        )}

        <Section id="export-sec-range" lang={lang} disabled={running || loops.length === 0} open={openSec === "range"} onToggle={() => toggle("range")}
          title={L("Цикл", "Loop")} summary={loops.length === 0 ? `${rangeSummary} (${L("циклів немає", "no loops")})` : rangeSummary}>
          <div className="space-y-1.5" role="radiogroup" aria-label={L("Що експортувати", "What to export")}>
            <label className={row}><input type="radio" name="export-range" className={chk} checked={range < 0} disabled={running} onChange={() => setRange(-1)} /><span className="text-sm">{L("Весь трек", "The whole track")}</span></label>
            {loops.map((s, i) => (
              <label key={i} className={row}><input type="radio" name="export-range" className={chk} checked={range === i} disabled={running} onChange={() => setRange(i)} />
                <span className="text-sm">{L("Тільки цикл", "Only the loop")} «{loopLabel(s, i, lang)}» <span className="font-mono">({mmss(s.start)} – {mmss(s.end)})</span></span></label>
            ))}
          </div>
        </Section>

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
              <button id="btn-export-start" disabled={noParts || running} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-sky-700 hover:bg-sky-600 text-white cursor-pointer inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-default" onClick={begin}>
                <Download className="w-6 h-6" />{separate && hasStems ? L("Зберегти файли WAV…", "Save WAV files…") : L("Зберегти як WAV…", "Save as WAV…")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
