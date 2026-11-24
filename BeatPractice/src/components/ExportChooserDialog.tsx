import { ListMusic, Music, Package, Tag } from "lucide-react";
import type { ReactNode } from "react";
import { ExportShell } from "./ui/ExportShell";
import { btn } from "./ui/styles";

type Lang = "uk" | "en";

/** What the person wants to export: an audio file or a pack, and for how many songs. */
export type ExportChoice = { kind: "audio" | "pack"; scope: "song" | "tag" | "all" };

/**
 * The first step of every export: one question, "what exactly?". Audio files are ordinary WAV files for any player;
 * a BeatPractice pack carries the recognised tempo (beat map) and the separated parts, so the other device does not analyse anything.
 * The dialogs behind the choices are the ones that already existed (track export, pack, library) plus the batch audio export.
 */
export function ExportChooserDialog(props: {
  lang: Lang;
  canSong: boolean;     // a track is open and ready
  hasTags: boolean;     // at least one tag has tracks
  onChoose: (c: ExportChoice) => void;
  onClose: () => void;
}) {
  const { lang, canSong, hasTags, onChoose, onClose } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);

  const row = (id: string, c: ExportChoice, icon: ReactNode, title: string, hint: string, disabled: boolean, why?: string) => (
    <button
      key={id}
      id={id}
      type="button"
      disabled={disabled}
      onClick={() => onChoose(c)}
      className="flex h-[5.5rem] w-full items-center gap-3 rounded-xl border border-line px-3 text-left transition-colors duration-150 hover:bg-control disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent cursor-pointer"
    >
      <span className="shrink-0 text-accent-text">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{title}</span>
        <span className="line-clamp-2 block text-xs text-ink-3">{disabled && why ? why : hint}</span>
      </span>
    </button>
  );

  const noTrack = L("Спочатку відкрийте трек.", "Open a track first.");
  const noTags = L("Немає тегів із треками.", "No tag has tracks.");

  const tag = (t: string) => <span className="rounded-md border border-line px-1.5 py-px font-mono text-[11px] font-semibold text-ink-3">{t}</span>;

  return (
    <ExportShell id="export-chooser-dialog" title={<span className="inline-flex items-center gap-2"><Package className="h-6 w-6" />{L("Що експортувати?", "What to export?")}</span>} onClose={onClose} closeLabel={L("Закрити", "Close")}
      footer={<button className={btn.neutral} onClick={onClose}>{L("Скасувати", "Cancel")}</button>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="space-y-2.5" aria-labelledby="export-audio-title">
          <div className="min-h-[4.25rem]">
            <h3 id="export-audio-title" className="flex items-center gap-2 text-sm font-bold text-ink">{L("Аудіофайл", "Audio file")}{tag(".wav")}</h3>
            <p className="text-xs text-ink-3">{L("Щоб слухати пісню в будь-якому плеєрі.", "To listen to the song in any player.")}</p>
          </div>
          {row("export-audio-song", { kind: "audio", scope: "song" }, <Music className="h-6 w-6" />, L("Пісню", "A song"),
            L("Поточний трек. Темп, метроном, партії й цикл можна змінити.", "The open track. You can change tempo, metronome, parts and loop."), !canSong, noTrack)}
          {row("export-audio-tag", { kind: "audio", scope: "tag" }, <Tag className="h-6 w-6" />, L("Пісні з тегом", "Songs with a tag"),
            L("Кожна пісня окремим файлом.", "Each song as its own file."), !hasTags, noTags)}
          {row("export-audio-all", { kind: "audio", scope: "all" }, <ListMusic className="h-6 w-6" />, L("Весь плейліст", "The whole playlist"),
            L("Кожна пісня окремим файлом.", "Each song as its own file."), false)}
        </section>

        <section className="space-y-2.5" aria-labelledby="export-pack-title">
          <div className="min-h-[4.25rem]">
            <h3 id="export-pack-title" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-ink">{L("Пакет BeatPractice", "BeatPractice pack")}{tag(".beatpack")}{tag(".beatlib")}</h3>
            <p className="text-xs text-ink-3">{L("Щоб відкрити пісні в BeatPractice на іншому пристрої. Темп і партії вже розпізнані.", "To open the songs in BeatPractice on another device. Tempo and parts are already analysed.")}</p>
          </div>
          {row("export-pack-song", { kind: "pack", scope: "song" }, <Music className="h-6 w-6" />, L("Одну пісню", "One song"),
            L("Поточний трек одним файлом.", "The open track as one file."), !canSong, noTrack)}
          {row("export-pack-tag", { kind: "pack", scope: "tag" }, <Tag className="h-6 w-6" />, L("Список за тегом", "A list by tag"),
            L("Усі пісні з тегом одним файлом.", "All songs with a tag in one file."), !hasTags, noTags)}
          {row("export-pack-all", { kind: "pack", scope: "all" }, <ListMusic className="h-6 w-6" />, L("Весь плейліст", "The whole playlist"),
            L("Усі пісні одним файлом.", "All songs in one file."), false)}
        </section>
      </div>

    </ExportShell>
  );
}
