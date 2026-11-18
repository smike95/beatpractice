import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Modal, ModalHeader } from "./ui/Modal";
import { btn as btnStyle } from "./ui/styles";
import { lookupTrack } from "../utils/trackLookup";

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
  onSave: (m: TrackMeta) => void;
  onClose: () => void;
}) {
  const { initial, fileName, lang, onSave, onClose } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const [artist, setArtist] = useState(initial.artist);
  // the default name (file name without extension) is real, editable text, not a placeholder
  const defaultTitle = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const [title, setTitle] = useState(initial.title || defaultTitle);
  const [cover, setCover] = useState(initial.cover);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Opening the dialog (the pencil) quietly tries to recognise the artist, the title and the cover from the file name. Nothing is shown if it fails.
  // It fills only what is still empty or default, and stops as soon as the person has typed or chosen something themselves.
  const touched = useRef(false);
  const [searching, setSearching] = useState(false);   // a quiet "looking..." mark while the search runs; it disappears with no message when it ends
  useEffect(() => {
    const needsText = !initial.artist.trim();
    if (!needsText && initial.cover) return;
    const ac = new AbortController();
    const stop = window.setTimeout(() => ac.abort(), 25000);   // never wait longer than this
    setSearching(true);
    void lookupTrack(fileName, ac.signal).then((r) => {
      if (!r || ac.signal.aborted || touched.current) return;
      if (needsText) { setArtist(r.artist); setTitle(r.title); }
      if (!initial.cover && r.cover) setCover(r.cover);
    }).finally(() => { window.clearTimeout(stop); if (!ac.signal.aborted) setSearching(false); });
    return () => { window.clearTimeout(stop); ac.abort(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (touched.current) setSearching(false); }, [artist, title, cover]);

  const save = () => {
    const t = title.trim();
    // untouched default name with no artist: keep falling back to the file name
    onSave({ artist, title: !artist.trim() && t === defaultTitle ? "" : t, cover });
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try { touched.current = true; setCover(await fileToCover(f)); setErr(""); } catch { setErr(L("Не вдалося прочитати зображення.", "Could not read the image.")); }
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
              {searching && !cover && <span className="absolute inset-0 flex items-center justify-center bg-surface/60"><Loader2 className="w-6 h-6 animate-spin motion-reduce:animate-none text-accent-text" aria-hidden="true" /></span>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" className={btn} onClick={() => fileRef.current?.click()}><ImagePlus className="w-6 h-6" />{L("Обкладинка…", "Cover…")}</button>
            {cover && <button type="button" className={btn} onClick={() => setCover("")}><Trash2 className="w-6 h-6" />{L("Прибрати", "Remove")}</button>}
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
            {searching && <p role="status" className="track-edit-label flex items-center gap-1.5 text-xs"><Loader2 className="icon-xs animate-spin motion-reduce:animate-none text-accent-text" aria-hidden="true" />{L("Розпізнаємо пісню й шукаємо обкладинку…", "Recognising the song and looking for the cover…")}</p>}
            <p className="track-edit-label text-xs truncate" title={fileName}>{L("Файл", "File")}: {fileName}</p>
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
