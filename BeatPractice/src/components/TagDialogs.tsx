import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Modal, ModalHeader } from "./ui/Modal";
import { btn } from "./ui/styles";
import type { PlaylistItem, PlaylistTag } from "../types";
import { displayName } from "../player/usePlayer";

type Lang = "uk" | "en";
const field = "track-edit-field w-full px-3 py-2 rounded-lg border text-base focus:outline-none focus:ring-2";
const cancelBtn = "track-edit-btn min-h-11 sm:min-h-9 px-3 text-xs font-bold rounded-lg border cursor-pointer transition-colors duration-150 inline-flex items-center justify-center gap-2 whitespace-nowrap";

/** The window for a new tag, made like the window of the track details: a labelled field, Cancel / Create; Enter creates. */
function NewTagDialog(props: { lang: Lang; onCreate: (name: string) => void; onClose: () => void }) {
  const { lang, onCreate, onClose } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const [name, setName] = useState("");
  const save = () => { if (name.trim()) { onCreate(name); onClose(); } };
  return (
    <Modal id="new-tag-dialog" width="md" onClose={onClose} closeOnEscape layer="z-[100]">
      <ModalHeader title={L("Новий тег", "New tag")} onClose={onClose} closeLabel={L("Закрити", "Close")} />
      <label className="block space-y-1">
        <span className="track-edit-label text-xs font-semibold">{L("Назва тегу", "Name of the tag")}</span>
        <input
          id="new-tag-name" type="text" className={field} value={name} maxLength={32} autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
        />
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className={cancelBtn} onClick={onClose}>{L("Скасувати", "Cancel")}</button>
        <button type="button" id="btn-create-tag" className={btn.primary} disabled={!name.trim()} onClick={save}>{L("Створити", "Create")}</button>
      </div>
    </Modal>
  );
}

/** The button that opens the window for a new tag. */
function NewTag(props: { lang: Lang; onCreate: (name: string) => void }) {
  const { lang, onCreate } = props;
  const [open, setOpen] = useState(false);
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  return (
    <>
      <button type="button" id="btn-new-tag" className={`${btn.secondary} self-start`} onClick={() => setOpen(true)}>
        <Plus className="h-5 w-5" />{L("Новий тег", "New tag")}
      </button>
      {open && <NewTagDialog lang={lang} onCreate={onCreate} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The tags of one track: switch the existing ones on and off, or make a new one for it. */
export function TrackTagsDialog(props: {
  lang: Lang; item: PlaylistItem; tags: PlaylistTag[];
  onToggle: (itemId: string, tagId: string) => void;
  onCreateForItem: (itemId: string, name: string) => void;
  onClose: () => void;
}) {
  const { lang, item, tags, onToggle, onCreateForItem, onClose } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const on = new Set(item.tags ?? []);
  return (
    <Modal id="track-tags-dialog" width="md" onClose={onClose} layer="z-[100]">
      <ModalHeader title={L("Теги треку", "Tags of the track")} onClose={onClose} closeLabel={L("Закрити", "Close")} />
      <p className="truncate text-xs text-slate-400">{displayName(item)}</p>
      {tags.length === 0 ? (
        <p className="text-sm text-slate-400">{L("Тегів ще немає. Створіть перший нижче.", "There are no tags yet. Make the first one below.")}</p>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label={L("Теги", "Tags")}>
          {tags.map((t) => (
            <button key={t.id} type="button" aria-pressed={on.has(t.id)} onClick={() => onToggle(item.id, t.id)} className={`${btn.chip(on.has(t.id))} rounded-full`}>
              {on.has(t.id) && <Check className="h-4 w-4" />}{t.name}
            </button>
          ))}
        </div>
      )}
      <NewTag lang={lang} onCreate={(name) => onCreateForItem(item.id, name)} />
      <div className="flex justify-end"><button type="button" className={btn.cta} onClick={onClose}>{L("Готово", "Done")}</button></div>
    </Modal>
  );
}

/** All tags: rename, delete (the tag disappears from every track that had it) and make new ones. */
export function ManageTagsDialog(props: {
  lang: Lang; tags: PlaylistTag[]; counts: Record<string, number>;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => boolean;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { lang, tags, counts, onCreate, onRename, onDelete, onClose } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const [pending, setPending] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const commit = (t: PlaylistTag) => {
    const v = drafts[t.id];
    if (v !== undefined && v.trim() !== t.name) onRename(t.id, v);
    setDrafts((d) => { const { [t.id]: _drop, ...rest } = d; return rest; });
  };
  const doomed = tags.find((t) => t.id === pending);
  return (
    <Modal id="manage-tags-dialog" width="md" onClose={onClose} layer="z-[100]">
      <ModalHeader title={L("Керування тегами", "Manage tags")} onClose={onClose} closeLabel={L("Закрити", "Close")} />
      {tags.length === 0 && <p className="text-sm text-slate-400">{L("Тегів ще немає.", "There are no tags yet.")}</p>}
      <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
        {tags.map((t) => (
          <li key={t.id} className="flex items-center gap-2">
            <input
              value={drafts[t.id] ?? t.name} maxLength={32} aria-label={L("Назва тегу", "Name of the tag")} className={field}
              onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
              onBlur={() => commit(t)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setDrafts((d) => { const { [t.id]: _drop, ...rest } = d; return rest; }); }}
            />
            <span className="w-24 shrink-0 text-right text-xs text-slate-400">{L(`треків: ${counts[t.id] ?? 0}`, `tracks: ${counts[t.id] ?? 0}`)}</span>
            <button type="button" onClick={() => setPending(t.id)} title={L("Видалити тег", "Delete the tag")} aria-label={L("Видалити тег", "Delete the tag")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-950/30 hover:text-rose-400 cursor-pointer">
              <Trash2 className="h-5 w-5" />
            </button>
          </li>
        ))}
      </ul>
      {doomed && (
        <div className="space-y-2 rounded-xl border border-rose-500/40 p-3" role="alert">
          <p className="text-sm">
            {L(`Видалити тег «${doomed.name}»? Він зникне з усіх треків, де був (${counts[doomed.id] ?? 0}).`, `Delete the tag “${doomed.name}”? It will disappear from every track that has it (${counts[doomed.id] ?? 0}).`)}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className={btn.neutral} onClick={() => setPending(null)}>{L("Скасувати", "Cancel")}</button>
            <button type="button" className={btn.danger} onClick={() => { onDelete(doomed.id); setPending(null); }}>{L("Видалити", "Delete")}</button>
          </div>
        </div>
      )}
      <NewTag lang={lang} onCreate={onCreate} />
      <div className="flex justify-end"><button type="button" className={btn.cta} onClick={onClose}>{L("Готово", "Done")}</button></div>
    </Modal>
  );
}
