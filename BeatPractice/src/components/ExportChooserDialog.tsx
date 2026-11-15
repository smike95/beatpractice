import { ListMusic, Music, Package, Tag } from "lucide-react";
import type { ReactNode } from "react";
import { Modal, ModalHeader } from "./ui/Modal";
import { btn } from "./ui/styles";

type Lang = "uk" | "en";

/** What the person wants to export: an audio file or a pack, and for how many songs. */
export type ExportChoice = { kind: "audio" | "pack"; scope: "song" | "tag" | "all" };

/**
 * The first step of every export: one question, "what exactly?". Audio files are ordinary WAV files for any player;
 * a pack carries the recognised tempo (beat map) and the separated parts, so the other device does not analyse anything.
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
      className="flex w-full items-start gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-colors duration-150 hover:bg-control disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent cursor-pointer"
    >
      <span className="mt-0.5 shrink-0 text-accent-text">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{title}</span>
        <span className="block text-xs text-ink-3">{disabled && why ? why : hint}</span>
      </span>
    </button>
  );

  const noTrack = L("Спочатку відкрийте трек.", "Open a track first.");
  const noTags = L("Немає тегів із треками.", "No tag has tracks.");

  return (
    <Modal id="export-chooser-dialog" width="lg" onClose={onClose}>
      <ModalHeader title={<span className="inline-flex items-center gap-2"><Package className="h-6 w-6" />{L("Що експортувати?", "What do you want to export?")}</span>} onClose={onClose} closeLabel={L("Закрити", "Close")} />

      <section className="space-y-2" aria-labelledby="export-audio-title">
        <div>
          <h3 id="export-audio-title" className="text-sm font-bold text-ink">{L("Аудіофайл (WAV)", "Audio file (WAV)")}</h3>
          <p className="text-xs text-ink-3">{L("Звичайні файли для будь-якого плеєра.", "Ordinary files for any player.")}</p>
        </div>
        {row("export-audio-song", { kind: "audio", scope: "song" }, <Music className="h-6 w-6" />, L("Пісню", "A song"),
          L("Поточний трек: темп, метроном, партії та цикл можна змінити.", "The open track; tempo, metronome, parts and loop can be changed."), !canSong, noTrack)}
        {row("export-audio-tag", { kind: "audio", scope: "tag" }, <Tag className="h-6 w-6" />, L("Усі пісні з тегом", "All songs with a tag"),
          L("Кожна пісня окремим файлом у вибраній папці.", "Each song as its own file in a folder you choose."), !hasTags, noTags)}
        {row("export-audio-all", { kind: "audio", scope: "all" }, <ListMusic className="h-6 w-6" />, L("Весь плейліст", "The whole playlist"),
          L("Кожна пісня окремим файлом у вибраній папці.", "Each song as its own file in a folder you choose."), false)}
      </section>

      <section className="space-y-2" aria-labelledby="export-pack-title">
        <div>
          <h3 id="export-pack-title" className="text-sm font-bold text-ink">{L("Пакет для іншого пристрою", "A pack for another device")}</h3>
          <p className="text-xs text-ink-3">{L("З розпізнаним темпом і розділеними партіями: на іншому пристрої нічого розпізнавати не треба.", "With the recognised tempo and the separated parts: the other device analyses nothing.")}</p>
        </div>
        {row("export-pack-song", { kind: "pack", scope: "song" }, <Music className="h-6 w-6" />, L("Одну пісню", "One song"),
          L("Поточний трек одним файлом .beatpack.", "The open track as one .beatpack file."), !canSong, noTrack)}
        {row("export-pack-tag", { kind: "pack", scope: "tag" }, <Tag className="h-6 w-6" />, L("Список за тегом", "A list by tag"),
          L("Усі пісні з тегом одним файлом .beatlib.", "All songs with a tag in one .beatlib file."), !hasTags, noTags)}
        {row("export-pack-all", { kind: "pack", scope: "all" }, <ListMusic className="h-6 w-6" />, L("Весь плейліст", "The whole playlist"),
          L("Усі пісні одним файлом .beatlib.", "All songs in one .beatlib file."), false)}
      </section>

      <div className="flex justify-end"><button className={btn.neutral} onClick={onClose}>{L("Скасувати", "Cancel")}</button></div>
    </Modal>
  );
}
