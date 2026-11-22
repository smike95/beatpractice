import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Search, Trash2 } from "lucide-react";
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
}) {
  const { initial, fileName, lang, onSave, onClose, autoText = true, autoCover = true } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const [artist, setArtist] = useState(initial.artist);
  // the default name (file name without extension) is real, editable text, not a placeholder
  const defaultTitle = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const [title, setTitle] = useState(initial.title || defaultTitle);
  const [cover, setCover] = useState(initial.cover);
  const [covers, setCovers] = useState<string[]>(initial.cover ? [initial.cover] : []);   // the covers to choose from (the arrows go through them)
  const coverTouched = useRef(false);   // the person chose, removed or loaded a cover: the search does not replace it
  const coverRemoved = useRef(false);
  const coverRef = useRef(initial.cover); coverRef.current = cover;
  const artistRef = useRef(initial.artist); artistRef.current = artist;
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The automatic recognition already ran when the track was added (usePlayer). Opening the dialog tries once more while the artist or the cover is still empty
  // (unless the person cancelled that), and the search button does it on demand: it then also collects several covers to choose from.
  // Nothing is shown if the quiet search fails; the button shows why. It never overwrites what the person typed or chose.
  const touched = useRef(false);
  const [note, setNote] = useState("");   // why the search found nothing (a short grey line; the dialog stays quiet when it found something)
  const [searching, setSearching] = useState(false);   // a quiet "looking..." mark while the search runs; it disappears with no message when it ends
  const acRef = useRef<AbortController | null>(null);
  const addCovers = (all: string[]) => setCovers((prev) => { const m = [...prev]; for (const c of all) if (!m.includes(c)) m.push(c); return m; });
  const runSearch = (manual: boolean) => {
    const needText = manual ? !artistRef.current.trim() : autoText && !initial.artist.trim();
    const needCover = manual ? true : autoCover && !initial.cover;
    if (!needText && !needCover) return;
    acRef.current?.abort();
    const ac = new AbortController(); acRef.current = ac;
    const stop = window.setTimeout(() => ac.abort(), 60000);   // never wait longer than this
    setSearching(true); setNote("");
    void lookupTrackEx(fileName, ac.signal, {
      maxCovers: 8,
      onText: (txt) => {   // the text appears as soon as it is known, the covers later
        if (needText && !ac.signal.aborted && !touched.current) { setArtist(txt.artist); setTitle(txt.title); }
      },
      onCover: (c, all) => {   // the first cover is shown at once (if there is none and the person has not touched it); all go to the arrows
        if (ac.signal.aborted) return;
        addCovers(all);
        if (!coverRef.current && !coverTouched.current && needCover) setCover(c);
      },
    }).then(({ result: r, reason, detail }) => {
      if (ac.signal.aborted) return;
      if (!r && !touched.current) {
        setNote(reason === "off" ? L("Розпізнавання вимкнено в налаштуваннях.", "Recognition is switched off in the settings.")
          : reason === "net" ? L(`Не вдалося зв’язатися з базою пісень${detail ? ` (${detail})` : ""}. Спробуйте ще раз пізніше.`, `Could not reach the song database${detail ? ` (${detail})` : ""}. Try again later.`)
          : L("У базі нічого певного не знайдено за цією назвою.", "Nothing certain was found in the database for this name."));
      }
      if (!r) return;
      if (needText && !touched.current) { setArtist(r.artist); setTitle(r.title); }
      addCovers(r.covers);
      if (r.covers.length === 0 && manual) setNote(L("Обкладинок для цієї пісні не знайдено.", "No covers were found for this song."));
    }).finally(() => { window.clearTimeout(stop); if (acRef.current === ac) setSearching(false); });
  };
  useEffect(() => { runSearch(false); return () => acRef.current?.abort(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (touched.current) setSearching(false); }, [artist, title, cover]);

  // the arrows: through the covers that were found (and the current one)
  const step = (dir: 1 | -1) => {
    if (covers.length === 0) return;
    const i = covers.indexOf(cover);
    const n = i < 0 ? (dir === 1 ? 0 : covers.length - 1) : (i + dir + covers.length) % covers.length;
    coverTouched.current = true; coverRemoved.current = false; setCover(covers[n]);
  };

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
              {covers.length > 1 && (
                <>
                  <button type="button" aria-label={L("Попередня обкладинка", "Previous cover")} onClick={() => step(-1)} className="absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/55 text-white flex items-center justify-center cursor-pointer hover:bg-black/75"><ChevronLeft className="w-5 h-5" /></button>
                  <button type="button" aria-label={L("Наступна обкладинка", "Next cover")} onClick={() => step(1)} className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/55 text-white flex items-center justify-center cursor-pointer hover:bg-black/75"><ChevronRight className="w-5 h-5" /></button>
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-bold">{Math.max(1, covers.indexOf(cover) + 1)} / {covers.length}</span>
                </>
              )}
              {searching && !cover && <span role="status" aria-label={L("Розпізнаємо пісню й шукаємо обкладинку", "Recognising the song and looking for the cover")} className="absolute inset-0 flex items-center justify-center bg-surface/60"><SearchGlobe className="text-accent-text" /></span>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" className={btn} onClick={() => fileRef.current?.click()}><ImagePlus className="w-6 h-6" />{L("Обкладинка…", "Cover…")}</button>
            <button type="button" className={btn} disabled={searching} onClick={() => runSearch(true)}><Search className="w-6 h-6" />{L("Знайти онлайн", "Find online")}</button>
            {cover && <button type="button" className={btn} onClick={() => { coverTouched.current = true; coverRemoved.current = true; setCover(""); }}><Trash2 className="w-6 h-6" />{L("Прибрати", "Remove")}</button>}
          </div>
          <div className="space-y-3 min-w-0">
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
    </Modal>
  );
}
