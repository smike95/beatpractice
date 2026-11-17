import { useEffect, useRef, useState } from "react";
import { canShareSaved, pickSavePath, shareSaved } from "../platform";
import { ChevronDown, ChevronRight, Download, FileAudio, RotateCcw } from "lucide-react";
import { core, type ExportStatus } from "../core";
import { LoopSlot, barsText, loopLabel } from "../types";
import { NAMES } from "./StemsPanel";
import { NumberStepper } from "./NumberStepper";
import { Modal, ModalHeader } from "./ui/Modal";
import { btn } from "./ui/styles";
import { Segmented } from "./ui/Segmented";

type Lang = "uk" | "en";

/**
 * One line of the dialog: the title, what is set now (in words), and a button to change it; the controls fold open under it.
 * The whole header is clickable and has a chevron (it is visible that the line opens); a "Changed" mark shows what differs from the player.
 */
function Section(props: { title: string; summary: string; open: boolean; disabled: boolean; changed?: boolean; hint?: string; lang: Lang; onToggle: () => void; children: React.ReactNode; id: string }) {
  const { title, summary, open, disabled, changed, hint, lang, onToggle, children, id } = props;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="rounded-xl border track-edit-section p-3 space-y-2.5" id={id}>
      <div className="flex items-start justify-between gap-3">
        <button type="button" disabled={disabled} aria-expanded={open} onClick={onToggle} className="flex min-w-0 flex-1 items-start gap-2 text-left cursor-pointer disabled:cursor-default">
          <Chevron aria-hidden className="mt-0.5 h-4 w-4 shrink-0 track-edit-label" />
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wide track-edit-label">{title}</span>
              {changed && <span className="rounded-full bg-accent/15 px-2 py-px text-[11px] font-bold text-accent-text">{lang === "en" ? "Changed" : "Змінено"}</span>}
            </span>
            <span className="block text-sm break-words">{summary}</span>
          </span>
        </button>
        <button type="button" disabled={disabled} aria-expanded={open} onClick={onToggle}
          className={btn.compact}>
          {open ? (lang === "en" ? "Done" : "Готово") : (lang === "en" ? "Change" : "Змінити")}
        </button>
      </div>
      {open && <div className="space-y-2.5 pt-1">{hint && <p className="track-edit-label text-xs">{hint}</p>}{children}</div>}
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
  const [ciBars, setCiBars] = useState(Math.min(2, countInBars));   // the count-in: 0 = off, 1 or 2 bars
  const withCountIn = ciBars > 0;
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
  // what the player has now: the starting point of every setting here (to show what was changed, and to go back to it)
  const initial = useRef({ bpm: Math.round(currentBpm * 10) / 10, range: activeLoop !== null && loops[activeLoop] ? activeLoop : -1, click: metronomeOn, accent: accentOn, quiet: quiet.enabled, ci: Math.min(2, countInBars) }).current;

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
    L("Метроном у файлі", "Metronome included"),
    accent ? L("з акцентом", "accented") : L("без акценту", "no accent"),
    quietOn ? L(`тихі такти ${quiet.clickBars}+${quiet.quietBars}`, `quiet bars ${quiet.clickBars}+${quiet.quietBars}`) : null,
    withCountIn ? L(`відлік ${barsText(ciBars, "uk")}`, `count-in ${barsText(ciBars, "en")}`) : null,
  ].filter(Boolean).join(" · ");
  const partsSummary = !hasStems ? L("Трек не розділено на партії", "The track is not split into parts") : [
    chosen.map((i) => nm(stemNames[i])).join(", ") || L("нічого не вибрано", "nothing chosen"),
    separate ? L("кожна окремим файлом", "each as a separate file") : L("одним файлом", "one file"),
    separate && withClick ? (clickTargetValid ? L(`метроном у партії «${nm(stemNames[clickTarget])}»`, `metronome in “${nm(stemNames[clickTarget])}”`) : L("метроном окремим файлом", "metronome as a separate file")) : null,
  ].filter(Boolean).join(" · ");
  const rangeSummary = range < 0 ? L("Весь трек", "The whole track")
    : `${L("Тільки цикл", "Only the loop")} «${loopLabel(loopSlot, range, lang)}» (${mmss(loopSlot!.start)} – ${mmss(loopSlot!.end)})`;

  const tempoChanged = Math.abs(bpm - initial.bpm) > 0.05;
  const clickChanged = withClick !== initial.click || (withClick && (accent !== initial.accent || quietOn !== initial.quiet || ciBars !== initial.ci));
  const partsChanged = hasStems && (separate || stemNames.some((_, i) => picked[i] === !!stemMuted[i]));
  const rangeChanged = range !== initial.range;
  const anyChanged = tempoChanged || clickChanged || partsChanged || rangeChanged;
  const resetAll = () => {
    setBpm(initial.bpm); setRange(initial.range); setWithClick(initial.click); setAccent(initial.accent); setQuietOn(initial.quiet); setCiBars(initial.ci);
    setSeparate(false); setClickTarget(-1); setPicked(stemNames.map((_, i) => !stemMuted[i]));
  };
  // the result in one sentence, before the person saves anything
  const fileWord = separate && hasStems ? L(`${fileCount_()} файлів WAV`, `${fileCount_()} WAV files`) : L("1 файл WAV", "1 WAV file");
  function fileCount_() { return chosen.length + (withClick && !clickTargetValid ? 1 : 0); }
  const resultLine = [
    fileWord,
    range < 0 ? L("весь трек", "whole track") : L("тільки цикл", "loop only"),
    `${bpm.toFixed(1)} BPM`,
    withClick ? L("з метрономом", "with metronome") : L("без метронома", "no metronome"),
    hasStems ? (separate ? L("партії окремо", "parts separate") : L(`партій у міксі: ${chosen.length} з ${stemNames.length}`, `parts in the mix: ${chosen.length} of ${stemNames.length}`)) : null,
  ].filter(Boolean).join(" · ");

  const cleanName = displayName.replace(/[\\/:*?"<>|]+/g, " ").trim() || "track";
  const tags = [`${Math.round(bpm)} BPM`];
  if (loopSlot) tags.push(loopLabel(loopSlot, range, lang).replace(/[\\/:*?"<>|]+/g, " "));
  if (hasStems && !separate) { const off = stemNames.filter((_, i) => !picked[i]).map(nm); if (off.length) tags.push(L("без", "no") + " " + off.join(", ")); }
  const suggested = `${cleanName} (${tags.join(", ")}).wav`;

  const begin = async () => {
    setErr("");
    try {
      const path = await pickSavePath({
        title: separate && hasStems ? L("Назва файлів (до неї додасться назва партії)", "File name (the part name is added to it)") : L("Зберегти змінений трек", "Save the modified track"),
        defaultName: suggested,
        extension: "wav",
        filterName: "WAV",
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
      if (!ok) { setErr(L("Не вдалося почати експорт: триває інший експорт або трек ще не готовий.", "Could not start the export: another export is running or the track is not ready yet.")); return; }
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
      <Modal id="export-dialog" width="lg" onClose={onClose}>
          <p className="text-base font-bold text-emerald-600">{L("Трек успішно експортовано", "The track was exported successfully")}</p>
          {canShareSaved && <button id="btn-export-share" className={btn.success} onClick={() => void shareSaved(outPath.replace(/\.wav$/i, ""))}>{L("Зберегти або надіслати", "Save or send")}</button>}
          <p className="text-sm break-all">{fileCount > 1 ? L(`Збережено файлів: ${fileCount}. Назви починаються з:`, `Files saved: ${fileCount}. Names start with:`) : L("Файл збережено", "Saved to")}: {fileCount > 1 ? outPath.replace(/\.wav$/i, "") + " - …" : outPath}</p>
          <div className="flex justify-end">
            <button id="btn-export-close" className={btn.primary} onClick={onClose}>{L("Закрити", "Close")}</button>
          </div>
      </Modal>
    );
  }

  return (
    <Modal id="export-dialog" width="lg" onClose={close} closeOnEscape={false}>
        <ModalHeader title={L("Експорт треку", "Export track")} onClose={close} closeLabel={L("Закрити", "Close")} />

        <p className="track-edit-label text-sm truncate" title={displayName}>{displayName}</p>
        <p className="track-edit-label text-xs">{L("Тут ви зберігаєте трек як звичайний аудіофайл. Спочатку він налаштований так, як звучить у плеєрі зараз; натисніть «Змінити» біля потрібного рядка, якщо хочете інакше.", "Here you save the track as an ordinary audio file. It starts out set up the way it sounds in the player now; press “Change” next to a line if you want it different.")}</p>

        <div className="flex items-start justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3" id="export-result" role="status" aria-live="polite">
          <div className="flex min-w-0 items-start gap-2">
            <FileAudio aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent-text" />
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wide track-edit-label">{L("Буде створено", "You will get")}</div>
              <div className="text-sm font-semibold break-words">{noParts ? L("Нічого: позначте хоча б одну партію", "Nothing: tick at least one part") : resultLine}</div>
            </div>
          </div>
          {anyChanged && !running && (
            <button type="button" id="btn-export-reset" className={btn.compact} onClick={resetAll} title={L("Повернути налаштування плеєра", "Back to the player's settings")}>
              <RotateCcw className="h-4 w-4" />{L("Як у плеєрі", "As in player")}
            </button>
          )}
        </div>

        <Section id="export-sec-tempo" lang={lang} disabled={running} open={openSec === "tempo"} onToggle={() => toggle("tempo")} changed={tempoChanged}
          hint={L("Файл буде швидшим або повільнішим за оригінал. Для вправи зручно зменшити темп.", "The file will be faster or slower than the original. Lowering the tempo is handy for practice.")}
          title={L("Темп", "Tempo")} summary={tempoSummary}>
          <div className="flex flex-wrap items-center gap-2">
            <NumberStepper id="export-bpm" value={bpm} min={originalBpm > 0 ? Math.max(20, Math.round(originalBpm * 25) / 100) : 20} max={originalBpm > 0 ? Math.round(originalBpm * 200) / 100 : 400} step={1} decimals={1} suffix="BPM"
              label={L("Темп експорту", "Export tempo")} disabled={running} onChange={setBpm} />
            <button type="button" className={btn.compact} disabled={running} onClick={() => setBpm(Math.round(currentBpm * 10) / 10)}>{L("Поточний", "Current")} {currentBpm.toFixed(1)}</button>
            {originalBpm > 0 && <button type="button" className={btn.compact} disabled={running} onClick={() => setBpm(Math.round(originalBpm * 10) / 10)}>{L("Оригінал", "Original")} {originalBpm.toFixed(1)}</button>}
          </div>
        </Section>

        <Section id="export-sec-metronome" lang={lang} disabled={running} open={openSec === "metronome"} onToggle={() => toggle("metronome")} changed={clickChanged}
          hint={L("Метроном записується просто у файл, щоб він звучав і в звичайному плеєрі.", "The metronome is recorded into the file, so it also sounds in an ordinary player.")}
          title={L("Метроном", "Metronome")} summary={clickSummary}>
          <label className={row}><input type="checkbox" className={chk} checked={withClick} disabled={running} onChange={(e) => setWithClick(e.target.checked)} /><span className="text-sm">{L("Додати звук метронома", "Add the metronome sound")}</span></label>
          {withClick && (
            <div className="pl-8 space-y-2.5">
              <label className={row}><input type="checkbox" className={chk} checked={accent} disabled={running} onChange={(e) => setAccent(e.target.checked)} /><span className="text-sm">{L("Акцент на першій долі такту", "Accent on the first beat of the bar")}</span></label>
              <label className={row}><input type="checkbox" className={chk} checked={quietOn} disabled={running} onChange={(e) => setQuietOn(e.target.checked)} />
                <span className="text-sm">{L(`Тихі такти (${quiet.clickBars} з метрономом, ${quiet.quietBars} без)`, `Quiet bars (${quiet.clickBars} with clicks, ${quiet.quietBars} silent)`)}</span></label>
              {quietOn && <p className="track-edit-label text-xs pl-8">{L("Кількість тактів задається в блоці «Тихі такти».", "The number of bars is set in the “Quiet bars” block.")}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm">{L("Відлік", "Count-in")}</span>
                <Segmented id="export-countin" ariaLabel={L("Відлік", "Count-in")} value={ciBars} onChange={setCiBars} disabled={running}
                  options={[{ value: 0, label: L("Вимк", "Off") }, { value: 1, label: L("1 такт", "1 bar") }, { value: 2, label: L("2 такти", "2 bars") }]} />
              </div>
            </div>
          )}
        </Section>

        {hasStems ? (
          <Section id="export-sec-parts" lang={lang} disabled={running} open={openSec === "parts"} onToggle={() => toggle("parts")} changed={partsChanged}
            hint={L("Позначте партії, які мають бути у файлі. Зніміть позначку з тієї, яку хочете зіграти самі.", "Tick the parts that should be in the file. Untick the one you want to play yourself.")}
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
            {separate && withClick && (
              <div className="space-y-1.5" role="radiogroup" aria-label={L("Метроном", "Metronome")}>
                <div className="text-xs font-semibold track-edit-label">{L("Метроном:", "Metronome:")}</div>
                <label className={row}><input type="radio" name="export-click-target" className={chk} checked={!clickTargetValid} disabled={running} onChange={() => setClickTarget(-1)} /><span className="text-sm">{L("Окремим файлом", "As a separate file")}</span></label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className={row}><input type="radio" name="export-click-target" className={chk} checked={clickTargetValid} disabled={running || chosen.length === 0} onChange={() => setClickTarget(clickTargetValid ? -1 : (chosen[0] ?? -1))} /><span className="text-sm">{L("У партію:", "Into the part:")}</span></label>
                  <select aria-label={L("Партія з метрономом", "Part with the metronome")} disabled={running || !clickTargetValid} value={clickTargetValid ? clickTarget : (chosen[0] ?? 0)} onChange={(e) => setClickTarget(parseInt(e.target.value, 10))}
                    className="track-edit-btn !w-auto px-2 py-1 text-xs rounded-lg border">
                    {chosen.map((i) => <option key={i} value={i}>{nm(stemNames[i])}</option>)}
                  </select>
                </div>
                {ciOn && <p className="track-edit-label text-xs">{L("У файлах без метронома відлік замінено тишею тієї самої довжини, тому всі файли збігаються за часом.", "In files without the metronome the count-in is replaced by silence of the same length, so all files line up.")}</p>}
              </div>
            )}
            <p className="track-edit-label text-xs">
              {separate
                ? L("Партії зберігаються без урахування гучності в мікшері, усі однакової довжини: їх можна зібрати в іншій програмі.", "Parts are saved without the mixer levels, all of the same length, so they can be put together in another program.")
                : L("Позначені партії змішуються в один файл з тією гучністю, яку встановлено в мікшері.", "The ticked parts are mixed into one file at the levels set in the mixer.")}
            </p>
          </Section>
        ) : (
          <div className="rounded-xl border track-edit-section p-3">
            <div className="text-xs font-bold uppercase tracking-wide track-edit-label">{L("Партії", "Parts")}</div>
            <div className="text-sm">{partsSummary}. <span className="track-edit-label text-xs">{L("Щоб експортувати партії окремо, розділіть трек у «Мікшері».", "To export parts separately, split the track in the “Mixer”.")}</span></div>
          </div>
        )}

        <Section id="export-sec-range" lang={lang} disabled={running || loops.length === 0} open={openSec === "range"} onToggle={() => toggle("range")} changed={rangeChanged}
          hint={L("Можна зберегти весь трек або тільки один із ваших циклів.", "You can save the whole track or only one of your loops.")}
          title={L("Цикл", "Loop")} summary={loops.length === 0 ? `${rangeSummary}. ${L("Щоб зберегти лише фрагмент, створіть цикл на хвилі.", "To save only a part, create a loop on the waveform.")}` : rangeSummary}>
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
            <div className="h-3 rounded-full overflow-hidden track-edit-cover"><div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
            <div className="track-edit-label text-xs">{L("Зберігаємо", "Saving")}: {pct}%. {L("Не закривайте вікно, поки файл не буде готовий.", "Keep this window open until the file is ready.")}</div>
          </div>
        )}
        {(err || st?.state === 3) && <p className="text-sm text-rose-500 break-words">{err || st?.error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          {running ? (
            <button className={btn.neutral} onClick={cancel}>{L("Скасувати експорт", "Cancel export")}</button>
          ) : (
            <>
              <button className={btn.neutral} onClick={close}>{L("Закрити", "Close")}</button>
              <button id="btn-export-start" disabled={noParts || running} className={btn.primary} onClick={begin}>
                <Download className="w-6 h-6" />{separate && hasStems ? L("Зберегти файли WAV…", "Save WAV files…") : L("Зберегти як WAV…", "Save as WAV…")}
              </button>
            </>
          )}
        </div>
    </Modal>
  );
}
