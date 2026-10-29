import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";

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

  const save = () => {
    const t = title.trim();
    // untouched default name with no artist: keep falling back to the file name
    onSave({ artist, title: !artist.trim() && t === defaultTitle ? "" : t, cover });
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try { setCover(await fileToCover(f)); setErr(""); } catch { setErr(L("Не вдалося прочитати зображення.", "Could not read the image.")); }
  };

  const field = "track-edit-field w-full px-3 py-2 rounded-lg border text-base focus:outline-none focus:ring-2";
  const btn = "track-edit-btn w-full px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" id="track-edit-dialog" className="track-edit-dialog w-full max-w-xl rounded-2xl border shadow-2xl p-5 space-y-4 max-h-full overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold">{L("Дані треку", "Track details")}</h3>
          <button className="track-edit-close p-1 rounded-lg cursor-pointer" onClick={onClose} title={L("Закрити", "Close")}><X className="w-6 h-6" /></button>
        </div>

        <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="track-edit-cover w-full aspect-square rounded-xl border overflow-hidden flex items-center justify-center">
              {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="w-6 h-6" />}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" className={btn} onClick={() => fileRef.current?.click()}><ImagePlus className="w-6 h-6" />{L("Обкладинка…", "Cover…")}</button>
            {cover && <button type="button" className={btn} onClick={() => setCover("")}><Trash2 className="w-6 h-6" />{L("Прибрати", "Remove")}</button>}
          </div>
          <div className="space-y-3 min-w-0">
            <label className="block space-y-1">
              <span className="track-edit-label text-xs font-semibold">{L("Виконавець", "Artist")}</span>
              <input id="edit-artist" type="text" className={field} value={artist} onChange={(e) => setArtist(e.target.value)} autoFocus />
            </label>
            <label className="block space-y-1">
              <span className="track-edit-label text-xs font-semibold">{L("Назва пісні", "Song title")}</span>
              <input id="edit-title" type="text" className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <p className="track-edit-label text-xs truncate" title={fileName}>{L("Файл", "File")}: {fileName}</p>
          </div>
        </div>
        {err && <p className="text-xs text-rose-500">{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button className={`${btn} !w-auto`} onClick={onClose}>{L("Скасувати", "Cancel")}</button>
          <button id="btn-save-track-meta" className="px-4 py-1.5 text-xs font-bold rounded-lg bg-sky-700 hover:bg-sky-600 text-white cursor-pointer" onClick={save}>{L("Зберегти", "Save")}</button>
        </div>
      </div>
    </div>
  );
}
