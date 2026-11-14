import { useRef, useState } from "react";
import { Package } from "lucide-react";
import { BC, core } from "../core";
import { pickSavePath } from "../platform";
import { getOwnerId } from "../utils/license";
import { displayName } from "../player/usePlayer";
import type { PlaylistItem, PlaylistTag } from "../types";
import { Modal, ModalHeader } from "./ui/Modal";
import { btn } from "./ui/styles";
import { Segmented } from "./ui/Segmented";

type Lang = "uk" | "en";
type Phase = "idle" | "running" | "done" | "error";
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/**
 * Saves the whole playlist, or all the tracks of one tag, as ONE file (.beatlib) that holds a .beatpack of every track:
 * the beat map (and the separated parts, when they exist) are inside, so the other device opens the library and does not analyse anything.
 * The tracks are opened in the core one by one (a track that was not analysed yet is analysed now), so the player is busy meanwhile.
 */
export function LibraryExportDialog(props: {
  lang: Lang;
  playlist: PlaylistItem[];
  tags: PlaylistTag[];
  listForTag: (tagId: string) => PlaylistItem[];
  startTag: string | null;                         // the tag that is shown now (null = the whole playlist)
  activeItem: PlaylistItem | null;                 // opened again when the export is over
  onRestore: (item: PlaylistItem) => void;
  onClose: () => void;
}) {
  const { lang, playlist, tags, listForTag, startTag, activeItem, onRestore, onClose } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const [scope, setScope] = useState<string>(startTag ?? "all");
  const [stemsMode, setStemsMode] = useState<"none" | "ready" | "picked" | "all">("none");   // the parts in the library: none / only the already separated ones / for the chosen tracks / for every track
  const [pickedStems, setPickedStems] = useState<Set<string>>(new Set());
  const [stemPct, setStemPct] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState("");
  const [cur, setCur] = useState({ i: 0, name: "" });
  const [packPct, setPackPct] = useState(0);
  const [result, setResult] = useState<{ path: string; count: number; skipped: string[] } | null>(null);
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
  const waitStems = async (separating: boolean): Promise<boolean> => {
    for (;;) {
      if (cancelled.current) { if (separating) { try { await core.stemsCancel(); } catch { /* ignore */ } } return false; }
      const s = await core.snapshot();
      const st = s.stems?.state ?? 0;
      if (st === 2) return true;
      if (st >= 3) return false;
      if (st === 0 && separating) return false;
      setStemPct(Math.round((s.stems?.progress ?? 0) * 100));
      setStage(separating ? L("розділення на партії", "separating into parts") : L("завантаження партій", "loading the parts"));
      await sleep(300);
    }
  };
  const waitPack = async (): Promise<boolean> => {
    for (;;) {
      if (cancelled.current) { try { await core.exportCancel(); } catch { /* ignore */ } return false; }
      const e = await core.exportStatus();
      setPackPct(Math.round((e.progress ?? 0) * 100));
      if (e.state === 2) return true;
      if (e.state === 3) return false;
      await sleep(250);
    }
  };

  const begin = async () => {
    setErr("");
    const items = list.slice();
    if (items.length === 0) return;
    const safeScope = scope === "all" ? L("Плейліст", "Playlist") : (tags.find((t) => t.id === scope)?.name ?? "tag");
    const picked = await pickSavePath({
      title: L("Зберегти збірку", "Save the library"),
      defaultName: `${safeScope.replace(/[\\/:*?"<>|]+/g, " ").trim() || "BeatPractice"}.beatlib`,
      extension: "beatlib",
      filterName: "BeatPractice library",
    });
    if (!picked) return;
    const out = /\.beatlib$/i.test(picked) ? picked : picked + ".beatlib";
    cancelled.current = false;
    setPhase("running");
    const done: PlaylistItem[] = [];
    const skipped: string[] = [];
    const files: string[] = [];
    const groupsOf = new Map<string, boolean>();   // which tracks went into the library with their separated parts
    let dir: string | null = null;
    try {
      await core.pause().catch(() => {});
      dir = await core.libraryTempDir();
      const sep = dir.includes("\\") ? "\\" : "/";
      for (let i = 0; i < items.length; i++) {
        if (cancelled.current) break;
        const it = items[i];
        setCur({ i: i + 1, name: displayName(it) });
        setPackPct(0);
        setStage(L("читання файлу", "reading the file"));
        const opened = await core.openFile(it.path).catch(() => false);
        if (!opened || !(await waitReady())) { if (!cancelled.current) skipped.push(displayName(it)); continue; }
        await core.setMeterMode(it.meterMode ?? 0).catch(() => false);
        let groups = "";
        let mix = true;
        const wantStems = stemsMode === "ready" || stemsMode === "all" || (stemsMode === "picked" && pickedStems.has(it.id));
        const separateMissing = stemsMode === "picked" || stemsMode === "all";   // "ready" never separates, the other two separate what is not separated yet
        if (wantStems) {
          const info = await core.stemsInfo().catch(() => null);
          if (info?.cached) {
            await core.stemsStart().catch(() => false);          // the finished parts are loaded
            if (await waitStems(false)) {
              const names = (await core.stemsInfo()).names;
              if (names.length > 0) { groups = names.map((_, k) => String(k)).join(";"); mix = false; }
            }
          } else if (separateMissing && info?.available) {
            setStemPct(0);
            const startedSplit = await core.stemsStart().catch(() => false);   // not separated yet: it is separated now (takes minutes)
            if (startedSplit && (await waitStems(true))) {
              const names = (await core.stemsInfo()).names;
              if (names.length > 0) { groups = names.map((_, k) => String(k)).join(";"); mix = false; }
            }
          }
        }
        if (cancelled.current) break;
        setStage(L("запис пакета", "writing the pack"));
        const path = `${dir}${sep}${String(done.length + 1).padStart(3, "0")}.beatpack`;
        const started = await core.packSave({
          path,
          title: it.title || it.name,
          artist: it.artist || "",
          owner: getOwnerId(),
          createdBy: "BeatPractice",
          groups,
          groupNames: "",
          loops: it.loops.map((l) => `${l.start}|${l.end}|${(l.name ?? "").replace(/[|\n]/g, " ")}`).join("\n"),
          includeMix: mix,
        }).catch(() => false);
        if (!started || !(await waitPack())) { if (!cancelled.current) skipped.push(displayName(it)); continue; }
        files.push(path);
        done.push(it);
        groupsOf.set(it.id, groups !== "");
      }
      if (cancelled.current || files.length === 0) {
        if (files.length === 0 && !cancelled.current) { setErr(L("Жодного треку не вдалося зберегти.", "No track could be saved.")); setPhase("error"); }
        else setPhase("idle");
        return;
      }
      setStage(L("збирання файлу", "putting the file together"));
      const idx = new Map(done.map((it, k) => [it.id, k]));
      const usedTags = tags.filter((t) => done.some((it) => (it.tags ?? []).includes(t.id)));
      const manifest = {
        version: 1,
        createdBy: "BeatPractice",
        tags: usedTags.map((t) => ({ id: t.id, name: t.name })),
        tagOrder: Object.fromEntries(usedTags.map((t) => [t.id, listForTag(t.id).map((it) => idx.get(it.id)).filter((k): k is number => k !== undefined)])),
        tracks: done.map((it) => ({
          name: it.name, title: it.title, artist: it.artist, speed: it.speed, meterMode: it.meterMode,
          duration: it.trackInfo.duration, originalBpm: it.trackInfo.originalBpm, cover: it.cover, hasStems: groupsOf.get(it.id) || it.hasStems || undefined,
          tags: (it.tags ?? []).filter((id) => usedTags.some((t) => t.id === id)),
        })),
      };
      await core.libraryWrite(files, JSON.stringify(manifest), out, dir);
      dir = null;
      setResult({ path: out, count: done.length, skipped });
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
  const radio = "flex items-center gap-3 cursor-pointer select-none rounded-lg px-2 py-1.5 hover:bg-slate-800/60";

  if (phase === "done" && result) {
    return (
      <Modal id="library-export-dialog" width="lg" onClose={onClose}>
        <p className="text-base font-bold text-emerald-600">{L("Збірку збережено", "The library was saved")}</p>
        <p className="text-sm">{L(`Треків у збірці: ${result.count}.`, `Tracks in the library: ${result.count}.`)}</p>
        <p className="break-all text-sm">{result.path}</p>
        {result.skipped.length > 0 && (
          <p className="text-sm text-sky-500">{L("Не вдалося додати: ", "Could not add: ")}{result.skipped.join(", ")}</p>
        )}
        <p className="text-xs text-slate-400">{L("Скопіюйте цей файл на інший пристрій і відкрийте його в програмі (або перетягніть у вікно): усі треки з’являться в плейлісті з тегами та порядком, а розпізнавати нічого не треба.", "Copy this file to another device and open it in the app (or drop it on the window): all the tracks appear in the playlist with their tags and order, and nothing has to be analysed.")}</p>
        <div className="flex justify-end"><button className={btn.cta} onClick={onClose}>{L("Закрити", "Close")}</button></div>
      </Modal>
    );
  }

  return (
    <Modal id="library-export-dialog" width="lg" onClose={close} closeOnEscape={false}>
      <ModalHeader title={<span className="inline-flex items-center gap-2"><Package className="h-6 w-6" />{L("Експорт збірки", "Export a library")}</span>} onClose={close} closeLabel={L("Закрити", "Close")} />
      {!running && (
        <>
          <p className="text-sm text-slate-300">{L("Усі вибрані треки будуть записані в один файл. На іншому пристрої його достатньо відкрити: розпізнавання вже всередині.", "All the chosen tracks are written into one file. On the other device it is enough to open it: the analysis is already inside.")}</p>
          <div role="radiogroup" aria-label={L("Що зберегти", "What to save")} className="space-y-0.5">
            <label className={radio}>
              <input type="radio" name="lib-scope" className="h-5 w-5" checked={scope === "all"} onChange={() => setScope("all")} />
              <span>{L(`Весь плейліст (${playlist.length})`, `The whole playlist (${playlist.length})`)}</span>
            </label>
            {tagsWithTracks.map((t) => (
              <label key={t.id} className={radio}>
                <input type="radio" name="lib-scope" className="h-5 w-5" checked={scope === t.id} onChange={() => setScope(t.id)} />
                <span>{L(`Тег «${t.name}» (${listForTag(t.id).length})`, `Tag “${t.name}” (${listForTag(t.id).length})`)}</span>
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold">{L("Партії у збірці", "Parts in the library")}</div>
            <Segmented id="lib-stems-mode" ariaLabel={L("Партії у збірці", "Parts in the library")} value={stemsMode} onChange={setStemsMode}
              options={[{ value: "none", label: L("Без розділених партій", "No separated parts") }, { value: "ready", label: L("Тільки готові розділені", "Only the ready ones") }, { value: "picked", label: L("Для обраних", "For chosen") }, { value: "all", label: L("Для всіх", "For all") }]} />
            {stemsMode === "picked" && (
              <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-slate-700/70 p-1.5">
                {list.map((it) => (
                  <li key={it.id}>
                    <label className={radio}>
                      <input type="checkbox" className="h-5 w-5" checked={pickedStems.has(it.id)}
                        onChange={() => setPickedStems((p) => { const n = new Set(p); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })} />
                      <span className="min-w-0 flex-1 truncate">{displayName(it)}</span>
                      <span className={`shrink-0 text-xs ${it.hasStems ? "text-emerald-600" : "text-slate-400"}`}>{it.hasStems ? L("партії є", "has parts") : L("партій немає", "no parts")}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-slate-400">{L("Треки без розпізнавання буде розпізнано зараз, це може зайняти час.", "Tracks that have not been analysed are analysed now, which can take a while.")}{stemsMode === "ready" && L(" З партіями файл значно більший.", " The file is much larger with the parts.")}{(stemsMode === "picked" || stemsMode === "all") && L(" З партіями файл значно більший; розділення кожного треку теж триває кілька хвилин.", " The file is much larger with the parts; separating each track also takes a few minutes.")}</p>
          {err && <p className="text-sm text-rose-500" role="alert">{err}</p>}
          <div className="flex justify-end gap-2">
            <button className={btn.neutral} onClick={onClose}>{L("Скасувати", "Cancel")}</button>
            <button id="btn-library-start" className={btn.cta} disabled={list.length === 0} onClick={() => void begin()}>{L("Зберегти…", "Save…")}</button>
          </div>
        </>
      )}
      {running && (
        <>
          <p className="text-sm font-semibold">{L(`Трек ${cur.i} з ${list.length}`, `Track ${cur.i} of ${list.length}`)}</p>
          <p className="truncate text-sm text-slate-300" title={cur.name}>{cur.name}</p>
          <p className="text-xs text-slate-400">{stage}{stage.startsWith(L("розділення", "separating")) ? ` ${stemPct}%` : ""}</p>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuenow={Math.round(((cur.i - 1 + packPct / 100) / Math.max(1, list.length)) * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-sky-500 transition-[width] duration-200" style={{ width: `${Math.round(((cur.i - 1 + packPct / 100) / Math.max(1, list.length)) * 100)}%` }} />
          </div>
          <div className="flex justify-end"><button className={btn.neutral} onClick={() => { cancelled.current = true; }}>{L("Зупинити", "Stop")}</button></div>
        </>
      )}
    </Modal>
  );
}
