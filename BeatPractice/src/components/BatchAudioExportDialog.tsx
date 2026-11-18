import { useRef, useState } from "react";
import { Music } from "lucide-react";
import { BC, core } from "../core";
import { pickFolder } from "../platform";
import { displayName } from "../player/usePlayer";
import type { PlaylistItem, PlaylistTag } from "../types";
import { ExportShell } from "./ui/ExportShell";
import { btn } from "./ui/styles";
import { Segmented } from "./ui/Segmented";

type Lang = "uk" | "en";
type Phase = "idle" | "running" | "done" | "error";
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/**
 * Saves every song of the playlist (or of one tag) as its own WAV file in a folder. The songs are opened in the core one by one
 * (a song that was not analysed yet is analysed now), so the player is busy meanwhile; the open track comes back at the end.
 */
export function BatchAudioExportDialog(props: {
  lang: Lang;
  playlist: PlaylistItem[];
  tags: PlaylistTag[];
  listForTag: (tagId: string) => PlaylistItem[];
  startTag: string | null;                         // the tag chosen in the first step (null = the whole playlist)
  activeItem: PlaylistItem | null;                 // opened again when the export is over
  onRestore: (item: PlaylistItem) => void;
  onClose: () => void;
  onBack?: () => void;   // back to the first step (the choice of what to export)
}) {
  const { lang, playlist, tags, listForTag, startTag, activeItem, onRestore, onClose, onBack } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const [scope, setScope] = useState<string>(startTag ?? "all");
  const [tempo, setTempo] = useState<"track" | "original">("track");   // each song at the tempo set for it in the playlist, or as recorded
  const [withClick, setWithClick] = useState(false);                   // the metronome in the files, sounding as set in the player (volume, sound, accent, quiet bars)
  const [countIn, setCountIn] = useState<0 | 1 | 2>(0);                 // bars of count-in before each song (only with the metronome)
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState("");
  const [cur, setCur] = useState({ i: 0, name: "" });
  const [pct, setPct] = useState(0);
  const [result, setResult] = useState<{ dir: string; count: number; skipped: string[] } | null>(null);
  const [err, setErr] = useState("");
  const cancelled = useRef(false);

  const tagsWithTracks = tags.filter((t) => listForTag(t.id).length > 0);
  const list: PlaylistItem[] = scope === "all" ? playlist : listForTag(scope);
  const running = phase === "running";

  const waitReady = async (): Promise<boolean> => {
    for (;;) {
      if (cancelled.current) return false;
      const s = await core.snapshot();
      if (s.state === BC.READY) return true;
      if (s.state === BC.ERROR || s.state === BC.IDLE) return false;
      setStage(s.state === BC.ANALYZING ? L("розпізнавання", "analysing") : L("читання файлу", "reading the file"));
      await sleep(300);
    }
  };
  const waitExport = async (): Promise<boolean> => {
    for (;;) {
      if (cancelled.current) { try { await core.exportCancel(); } catch { /* ignore */ } return false; }
      const e = await core.exportStatus();
      setPct(Math.round((e.progress ?? 0) * 100));
      if (e.state === 2) return true;
      if (e.state === 3) return false;
      await sleep(250);
    }
  };

  const begin = async () => {
    setErr("");
    const items = list.slice();
    if (items.length === 0) return;
    const dir = await pickFolder(L("Папка для аудіофайлів", "Folder for the audio files"));
    if (!dir) return;
    const sep = dir.includes("\\") ? "\\" : "/";
    cancelled.current = false;
    setPhase("running");
    const skipped: string[] = [];
    const used = new Set<string>();
    let count = 0;
    try {
      await core.pause().catch(() => {});
      for (let i = 0; i < items.length; i++) {
        if (cancelled.current) break;
        const it = items[i];
        setCur({ i: i + 1, name: displayName(it) });
        setPct(0);
        setStage(L("читання файлу", "reading the file"));
        const opened = await core.openFile(it.path).catch(() => false);
        if (!opened || !(await waitReady())) { if (!cancelled.current) skipped.push(displayName(it)); continue; }
        await core.setMeterMode(it.meterMode ?? 0).catch(() => false);
        // a file name that is free in the folder (two songs can have the same name)
        const base = displayName(it).replace(/[\\/:*?"<>|]+/g, " ").trim() || "track";
        let name = base, n = 2;
        while (used.has(name.toLowerCase())) name = `${base} (${n++})`;
        used.add(name.toLowerCase());
        setStage(L("запис файлу", "writing the file"));
        const ok = await core.exportStartEx({
          path: `${dir}${sep}${name}.wav`,
          metronome: withClick,
          countInBars: withClick ? countIn : 0,
          rangeA: -1,
          rangeB: -1,
          separate: false,
          stems: [],
          gains: [],
          speedRatio: tempo === "track" && it.speed > 0 ? it.speed : 1,
          accent: withClick ? -1 : 0,          // -1 = as in the player
          quiet: withClick ? -1 : 0,
          clickIntoStem: -1,
        }).catch(() => false);
        if (!ok || !(await waitExport())) { if (!cancelled.current) skipped.push(displayName(it)); continue; }
        count++;
      }
      if (cancelled.current) { setPhase("idle"); return; }
      if (count === 0) { setErr(L("Жодного треку не вдалося зберегти.", "No track could be saved.")); setPhase("error"); return; }
      setResult({ dir, count, skipped });
      setPhase("done");
    } catch (e) {
      setErr(String(e));
      setPhase("error");
    } finally {
      await core.pause().catch(() => {});
      if (activeItem) onRestore(activeItem);   // the track that was open is opened again
    }
  };

  const close = () => { if (running) cancelled.current = true; onClose(); };
  const radio = "flex items-center gap-3 cursor-pointer select-none rounded-lg px-2 py-1.5 hover:bg-control/60";

  if (phase === "done" && result) {
    return (
      <ExportShell id="batch-audio-export-dialog" title={<span className="inline-flex items-center gap-2"><Music className="h-6 w-6" />{L("Експорт аудіофайлів", "Export audio files")}</span>} onClose={onClose} closeLabel={L("Закрити", "Close")}
        footer={<button className={btn.primary} onClick={onClose}>{L("Закрити", "Close")}</button>}>
        <p className="text-base font-bold text-emerald-600">{L("Файли збережено", "The files were saved")}</p>
        <p className="text-sm">{L(`Збережено файлів: ${result.count}.`, `Files saved: ${result.count}.`)}</p>
        <p className="break-all text-sm">{result.dir}</p>
        {result.skipped.length > 0 && <p className="text-sm text-accent-text">{L("Не вдалося зберегти: ", "Could not save: ")}{result.skipped.join(", ")}</p>}
      </ExportShell>
    );
  }

  return (
    <ExportShell id="batch-audio-export-dialog" title={<span className="inline-flex items-center gap-2"><Music className="h-6 w-6" />{L("Експорт аудіофайлів", "Export audio files")}</span>} onClose={close} closeLabel={L("Закрити", "Close")} closeOnEscape={false}
      onBack={running ? undefined : onBack} backLabel={L("Назад", "Back")}
      footer={running ? (
        <button className={btn.neutral} onClick={() => { cancelled.current = true; }}>{L("Зупинити", "Stop")}</button>
      ) : (
        <button id="btn-batch-audio-start" className={btn.primary} disabled={list.length === 0} onClick={() => void begin()}>{L("Обрати папку…", "Choose a folder…")}</button>
      )}>
      {!running && (
        <>
          <p className="text-sm text-ink-2">{L("Кожна пісня буде збережена окремим WAV-файлом у вибраній папці.", "Each song is saved as its own WAV file in the folder you choose.")}</p>
          <div role="radiogroup" aria-label={L("Що зберегти", "What to save")} className="space-y-0.5">
            <label className={radio}>
              <input type="radio" name="batch-scope" className="h-5 w-5" checked={scope === "all"} onChange={() => setScope("all")} />
              <span>{L(`Весь плейліст (${playlist.length})`, `The whole playlist (${playlist.length})`)}</span>
            </label>
            {tagsWithTracks.map((t) => (
              <label key={t.id} className={radio}>
                <input type="radio" name="batch-scope" className="h-5 w-5" checked={scope === t.id} onChange={() => setScope(t.id)} />
                <span>{L(`Тег «${t.name}» (${listForTag(t.id).length})`, `Tag “${t.name}” (${listForTag(t.id).length})`)}</span>
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold">{L("Темп", "Tempo")}</div>
            <Segmented grid id="batch-tempo" ariaLabel={L("Темп", "Tempo")} value={tempo} onChange={setTempo}
              options={[{ value: "track", label: L("Як налаштовано для треку", "As set for the track") }, { value: "original", label: L("Оригінальний", "Original") }]} />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold">{L("Метроном у файлах", "Metronome in the files")}</div>
            <Segmented grid id="batch-click" ariaLabel={L("Метроном у файлах", "Metronome in the files")} value={withClick} onChange={setWithClick}
              options={[{ value: false, label: L("Без метронома", "No metronome") }, { value: true, label: L("З метрономом", "With the metronome") }]} />
            {withClick && (
              <>
                <div className="text-sm font-semibold">{L("Відлік перед піснею", "Count-in before the song")}</div>
                <Segmented fill id="batch-countin" ariaLabel={L("Відлік перед піснею", "Count-in before the song")} value={countIn} onChange={setCountIn}
                  options={[{ value: 0, label: L("Без відліку", "None") }, { value: 1, label: L("1 такт", "1 bar") }, { value: 2, label: L("2 такти", "2 bars") }]} />
                <p className="text-xs text-ink-3">{L("Метроном звучить так, як налаштовано в плеєрі: гучність, звук, акцент на першій долі, тихі такти.", "The metronome sounds as set in the player: volume, sound, accent on the first beat, quiet bars.")}</p>
              </>
            )}
          </div>
          <p className="text-xs text-ink-3">{L("Файли з усім треком. Треки без розпізнавання буде розпізнано зараз, це може зайняти час.", "Whole tracks. Tracks that have not been analysed are analysed now, which can take a while.")}</p>
          {err && <p className="text-sm text-rose-500" role="alert">{err}</p>}
        </>
      )}
      {running && (
        <>
          <p className="text-sm font-semibold">{L(`Трек ${cur.i} з ${list.length}`, `Track ${cur.i} of ${list.length}`)}</p>
          <p className="truncate text-sm text-ink-2" title={cur.name}>{cur.name}</p>
          <p className="text-xs text-ink-3">{stage}</p>
          <div className="h-2 overflow-hidden rounded-full bg-control" role="progressbar" aria-valuenow={Math.round(((cur.i - 1 + pct / 100) / Math.max(1, list.length)) * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${Math.round(((cur.i - 1 + pct / 100) / Math.max(1, list.length)) * 100)}%` }} />
          </div>
        </>
      )}
    </ExportShell>
  );
}
