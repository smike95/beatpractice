import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Images, ImagePlus, Search, Trash2, Undo2 } from "lucide-react";
import { SearchGlobe } from "./SearchGlobe";
import { Modal, ModalHeader } from "./ui/Modal";
import { btn as btnStyle } from "./ui/styles";
import { lookupTrackEx } from "../utils/trackLookup";

type Lang = "uk" | "en";

export interface TrackMeta {
  artist: string;
  title: string;
  cover: string; // data URL ("" = none)
}

/** Reads an image file and returns a small square JPEG (centre crop) as a data URL, so it can be stored with the playlist. */
export function fileToCover(file: File, size = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      const cv = document.createElement("canvas");
      cv.width = size;
      cv.height = size;
      const ctx = cv.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("canvas")); return; }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}

export function TrackEditDialog(props: {
  initial: TrackMeta;
  fileName: string;
  lang: Lang;
  onSave: (m: TrackMeta, opts: { coverRemoved: boolean }) => void;
  onClose: () => void;
  autoText?: boolean;    // the automatic search may fill the artist and the title (false after the person cancelled the automatic recognition of this track)
  autoCover?: boolean;   // ...and may look for a cover (false after the person removed the cover on purpose)
  suggested?: boolean;   // the fields were filled from the automatic suggestion (the "Auto" mark): a hint says so
  autoFilled?: boolean;  // the artist, title or cover of this track were filled in by the automatic recognition: the dialog offers to cancel that
  onUndoAuto?: () => void;
}) {
  const { initial, fileName, lang, onSave, onClose, autoText = true, autoCover = true, suggested = false, autoFilled = false, onUndoAuto } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const [artist, setArtist] = useState(initial.artist);
  // the default name (file name without extension) is real, editable text, not a placeholder
  const defaultTitle = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const [title, setTitle] = useState(initial.title || defaultTitle);
  const [cover, setCover] = useState(initial.cover);
  const [showGrid, setShowGrid] = useState(false);   // the grid of the covers found for this track
  const gridRef = useRef(false); gridRef.current = showGrid;
  const [covers, setCovers] = useState<string[]>(initial.cover ? [initial.cover] : []);   // the covers to choose from (the arrows go through them)
  const coverTouched = useRef(false);   // the person chose, removed or loaded a cover: the search does not replace it
  const coverRemoved = useRef(false);
  const coverRef = useRef(initial.cover); coverRef.current = cover;
  const artistRef = useRef(initial.artist); artistRef.current = artist;
  const titleRef = useRef(initial.title); titleRef.current = title;
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !gridRef.current) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The automatic recognition already ran when the track was added (usePlayer). Opening the dialog quietly looks for the missing artist and for more covers to
  // choose from (unless the person cancelled that); the search button does it on demand. It never overwrites what the person typed or chose, tries up to three times
  // when the database does not answer, and says something only after the button was pressed and nothing came of it, in plain words.
  const touched = useRef(false);
  const [note, setNote] = useState("");
  const [searching, setSearching] = useState(false);   // a quiet "looking..." mark while the search runs; it disappears with no message when it ends
  const acRef = useRef<AbortController | null>(null);
  const addCovers = (all: string[]) => setCovers((prev) => { const m = [...prev]; for (const c of all) if (!m.includes(c)) m.push(c); return m; });
  const runSearch = (manual: boolean) => {
    const needText = manual ? !artistRef.current.trim() : autoText && !initial.artist.trim();
    const fillCover = manual ? !coverRef.current : autoCover && !initial.cover;
    if (!needText && !manual && !autoCover) return;
    acRef.current?.abort();
    const ac = new AbortController(); acRef.current = ac;
    const stop = window.setTimeout(() => ac.abort(), 70000);   // never wait longer than this
    setSearching(true); setNote("");
    const typed = manual ? { a: artistRef.current.trim(), t: titleRef.current.trim() } : { a: initial.artist.trim(), t: initial.title.trim() };
    const input = typed.a && typed.t && typed.t !== defaultTitle ? `${typed.a} - ${typed.t}` : fileName;
    void (async () => {
      let last: Awaited<ReturnType<typeof lookupTrackEx>> | null = null;
      for (let attempt = 0; attempt < 3 && !ac.signal.aborted; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, attempt === 1 ? 3000 : 8000));
        if (ac.signal.aborted) return;
        last = await lookupTrackEx(input, ac.signal, {
          maxCovers: 8,
          onText: (txt) => {   // the text appears as soon as it is known, the covers later
            if (needText && !ac.signal.aborted && !touched.current) { setArtist(txt.artist); setTitle(txt.title); }
          },
          onCover: (c, all) => {   // the first cover is shown at once (if there is none and the person has not touched it); all go to the grid
            if (ac.signal.aborted) return;
            addCovers(all);
            if (!coverRef.current && !coverTouched.current && fillCover) setCover(c);
          },
        });
        if (last.reason === "off" || (last.completed && (last.result?.covers.length || !fillCover))) break;
      }
      if (ac.signal.aborted || !last) return;
      const r = last.result;
      if (r) {
        if (needText && !touched.current) { setArtist(r.artist); setTitle(r.title); }
        addCovers(r.covers);
      }
      if (manual && !touched.current && !(r && (r.covers.length > 0 || needText))) {
        setNote(last.reason === "off" ? L("Пошук в інтернеті вимкнено в налаштуваннях.", "Searching the internet is switched off in the settings.")
          : last.reason === "net" ? L("Зараз не вдалося підключитися до бази пісень. Спробуйте за хвилину.", "Could not reach the song database just now. Try again in a minute.")
          : r ? L("Обкладинок для цієї пісні не знайшлося.", "No covers were found for this song.")
          : L("Схожого в базі не знайшлося. Можна ввести дані вручну.", "Nothing similar was found. You can enter the details by hand."));
      }
    })().catch(() => { /* silent */ }).finally(() => { window.clearTimeout(stop); if (acRef.current === ac) setSearching(false); });
  };
  useEffect(() => { runSearch(false); return () => acRef.current?.abort(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (touched.current) setSearching(false); }, [artist, title, cover]);

  const save = () => {
    const t = title.trim();
    // untouched default name with no artist: keep falling back to the file name
    onSave({ artist, title: !artist.trim() && t === defaultTitle ? "" : t, cover }, { coverRemoved: !cover && (coverRemoved.current || !!initial.cover) });
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try { touched.current = true; coverTouched.current = true; coverRemoved.current = false; const c = await fileToCover(f); setCover(c); addCovers([c]); setErr(""); } catch { setErr(L("Не вдалося прочитати зображення.", "Could not read the image.")); }
  };

  const field = "track-edit-field w-full px-3 py-2 rounded-lg border text-base focus:outline-none focus:ring-2";
  const btn = "track-edit-btn w-full min-h-11 sm:min-h-9 px-3 text-xs font-bold rounded-lg border cursor-pointer transition-colors duration-150 inline-flex items-center justify-center gap-2 whitespace-nowrap";

  return (
    <Modal id="track-edit-dialog" width="xl" onClose={onClose} closeOnEscape={false}>
        <ModalHeader title={L("Дані треку", "Track details")} onClose={onClose} closeLabel={L("Закрити", "Close")} />

        <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="track-edit-cover relative w-full aspect-square rounded-xl border overflow-hidden flex items-center justify-center">
              {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="w-6 h-6" />}
              {searching && !cover && <span role="status" aria-label={L("Розпізнаємо пісню й шукаємо обкладинку", "Recognising the song and looking for the cover")} className="absolute inset-0 flex items-center justify-center bg-surface/60"><SearchGlobe className="text-accent-text" /></span>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" className={btn} onClick={() => fileRef.current?.click()}><ImagePlus className="w-6 h-6" />{L("Обкладинка…", "Cover…")}</button>
            {covers.length > 1 && <button type="button" className={btn} onClick={() => setShowGrid(true)}><Images className="w-6 h-6" />{L("Обрати", "Choose")} ({covers.length})</button>}
            <button type="button" className={btn} disabled={searching} onClick={() => runSearch(true)}><Search className="w-6 h-6" />{L("Знайти онлайн", "Find online")}</button>
            {cover && <button type="button" className={btn} onClick={() => { coverTouched.current = true; coverRemoved.current = true; setCover(""); }}><Trash2 className="w-6 h-6" />{L("Прибрати", "Remove")}</button>}
          </div>
          <div className="space-y-3 min-w-0">
            {autoFilled && onUndoAuto && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2">
                <span className="text-xs font-semibold text-accent-text">{L("Підставлено автоматично за назвою файла.", "Filled in automatically from the file name.")}</span>
                <button type="button" onClick={onUndoAuto} className="shrink-0 inline-flex items-center gap-1 rounded-md border border-accent/60 px-2 py-1 text-xs font-bold text-accent-text cursor-pointer hover:bg-accent/20"><Undo2 className="w-4 h-4" />{L("Скасувати", "Undo")}</button>
              </div>
            )}
            {suggested && <p className="text-xs font-semibold text-accent-text">{L("Підібрано автоматично за назвою файла. Перевірте й збережіть.", "Found automatically from the file name. Check it and save.")}</p>}
            <label className="block space-y-1">
              <span className="track-edit-label text-xs font-semibold">{L("Виконавець", "Artist")}</span>
              <input id="edit-artist" type="text" className={field} value={artist} onChange={(e) => { touched.current = true; setArtist(e.target.value); }} autoFocus />
            </label>
            <label className="block space-y-1">
              <span className="track-edit-label text-xs font-semibold">{L("Назва пісні", "Song title")}</span>
              <input id="edit-title" type="text" className={field} value={title} onChange={(e) => { touched.current = true; setTitle(e.target.value); }} />
            </label>
            <p className="track-edit-label text-xs truncate" title={fileName}>{L("Файл", "File")}: {fileName}</p>
            {note && !searching && <p role="status" className="track-edit-label text-xs">{note}</p>}
          </div>
        </div>
        {err && <p className="text-xs text-rose-500">{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button className={`${btn} !w-auto`} onClick={onClose}>{L("Скасувати", "Cancel")}</button>
          <button id="btn-save-track-meta" className={btnStyle.primary} onClick={save}>{L("Зберегти", "Save")}</button>
        </div>
        {showGrid && createPortal(
          <Modal id="cover-grid" width="xl" layer="z-[100]" onClose={() => setShowGrid(false)}>
            <ModalHeader title={L("Обкладинки до цього треку", "Covers for this track")} onClose={() => setShowGrid(false)} closeLabel={L("Закрити", "Close")} />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {covers.map((c, i) => (
                <button key={i} type="button" aria-label={`${L("Обкладинка", "Cover")} ${i + 1}`} aria-pressed={c === cover}
                  onClick={() => { coverTouched.current = true; coverRemoved.current = false; setCover(c); setShowGrid(false); }}
                  className={`relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 transition ${c === cover ? "border-accent" : "border-transparent hover:border-outline"}`}>
                  <img src={c} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </Modal>, document.body)}
    </Modal>
  );
}
