import { useState } from "react";
import { Modal, ModalHeader } from "./ui/Modal";
import { btn } from "./ui/styles";
import { CoverPlaceholder } from "./CoverPlaceholder";
import { isAnalysed, isSeparated, type DupChoice } from "../player/duplicates";
import type { DupAsk } from "../player/usePlayer";
import type { PlaylistItem, PlaylistTag } from "../types";

type Lang = "uk" | "en";
const fileOf = (p: string) => p.split(/[\\/]/).pop() ?? p;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/**
 * A track that looks like one already in the playlist: the two are shown side by side with what each of them has
 * (artist, title, cover, analysis, separated parts, tags), and the user chooses: keep the existing one, keep the new one, or merge them.
 */
export function DuplicateDialog(props: { lang: Lang; ask: DupAsk; tags: PlaylistTag[]; onAnswer: (choice: DupChoice, all: boolean) => void }) {
  const { lang, ask, tags, onAnswer } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const [all, setAll] = useState(false);
  const left = ask.total - ask.index;
  const yes = L("так", "yes"), no = L("ні", "no");
  const tagNames = (it: PlaylistItem) => (it.tags ?? []).map((id) => tags.find((t) => t.id === id)?.name).filter((x): x is string => !!x);

  const column = (it: PlaylistItem, heading: string) => {
    const tg = tagNames(it);
    const ext = /\.beatpack$/i.test(it.path) ? L("пакет", "pack") : L("аудіофайл", "audio file");
    return (
      <div className="min-w-0 flex-1 space-y-1.5 rounded-xl border border-slate-700/70 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-sky-500">{heading}</p>
        <div className="flex items-center gap-3">
          {it.cover ? <img src={it.cover} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <CoverPlaceholder className="h-14 w-14" rounded="rounded-lg" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" title={it.title || it.name}>{it.title || it.name}</p>
            <p className="truncate text-xs text-slate-400">{it.artist || L("виконавець не вказаний", "no artist")}</p>
          </div>
        </div>
        <dl className="space-y-1 text-xs">
          <div className="flex justify-between gap-2"><dt className="text-slate-400">{L("Файл", "File")}</dt><dd className="min-w-0 truncate text-right" title={it.path}>{fileOf(it.path)} · {ext}</dd></div>
          {it.trackInfo.duration > 0 && <div className="flex justify-between gap-2"><dt className="text-slate-400">{L("Тривалість", "Length")}</dt><dd>{clock(it.trackInfo.duration)}</dd></div>}
          <div className="flex justify-between gap-2"><dt className="text-slate-400">{L("Розпізнано", "Analysed")}</dt><dd className={isAnalysed(it) ? "font-semibold text-emerald-600" : ""}>{isAnalysed(it) ? yes : no}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-400">{L("Розділено на партії", "Separated into parts")}</dt><dd className={isSeparated(it) ? "font-semibold text-emerald-600" : ""}>{isSeparated(it) ? yes : no}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-400">{L("Теги", "Tags")}</dt><dd className="min-w-0 truncate text-right">{tg.length ? tg.join(", ") : "—"}</dd></div>
        </dl>
      </div>
    );
  };

  return (
    <Modal id="duplicate-dialog" width="lg" onClose={() => onAnswer("keep-existing", false)} closeOnEscape={false} layer="z-[100]">
      <ModalHeader title={L("Такий трек уже є", "This track is already here")} onClose={() => onAnswer("keep-existing", false)} closeLabel={L("Пропустити", "Skip")} />
      <p className="text-sm text-slate-300">
        {L("Новий трек схожий на той, що вже є в плейлісті. Що залишити?", "The new track looks like one that is already in the playlist. Which one to keep?")}
        {ask.total > 1 && <span className="text-slate-400"> {L(`(дублікат ${ask.index} з ${ask.total})`, `(duplicate ${ask.index} of ${ask.total})`)}</span>}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        {column(ask.existing, L("Наявний", "Existing"))}
        {column(ask.incoming, L("Новий", "New"))}
      </div>
      <p className="text-xs text-slate-400">
        {L("«Обʼєднати» залишає один трек, у якому поєднано найкраще з обох: виконавець, назва й обкладинка беруться з того, де вони є; звук — з того, де є партії або розпізнавання; теги й цикли додаються з обох.", "“Merge” keeps one track that has the best of both: artist, title and cover come from the one that has them; the sound comes from the one with separated parts or analysis; tags and loops are added from both.")}
      </p>
      {left > 0 && (
        <label className="flex cursor-pointer select-none items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={all} onChange={(e) => setAll(e.target.checked)} />
          <span className="text-sm">{L(`Те саме для решти дублікатів (${left})`, `The same for the remaining duplicates (${left})`)}</span>
        </label>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" id="btn-dup-keep-existing" className={btn.neutral} onClick={() => onAnswer("keep-existing", all)}>{L("Залишити наявний", "Keep the existing")}</button>
        <button type="button" id="btn-dup-keep-new" className={btn.neutral} onClick={() => onAnswer("keep-new", all)}>{L("Залишити новий", "Keep the new")}</button>
        <button type="button" id="btn-dup-merge" className={btn.cta} onClick={() => onAnswer("merge", all)}>{L("Обʼєднати", "Merge")}</button>
      </div>
    </Modal>
  );
}
