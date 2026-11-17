import { useState } from "react";
import { Settings } from "lucide-react";
import { loadLookupEnabled, saveLookupEnabled } from "../utils/trackLookup";
import type { Language } from "../i18n";
import type { ThemeMode } from "../types";
import { Modal, ModalHeader } from "./ui/Modal";
import { Segmented } from "./ui/Segmented";
import { AccentPicker } from "./AccentPicker";
import { btn } from "./ui/styles";
import { Switch } from "./Switch";
import type { AccentChoice } from "../utils/accent";

/** The languages of the interface. Up to three are shown as a switch; with more, the setting becomes a drop-down list. */
export const LANGUAGES: { id: Language; label: string }[] = [
  { id: "uk", label: "Українська" },
  { id: "en", label: "English" },
];

/** Everything that is a setting of the interface and not of a track: theme, accent colour, language. */
export function SettingsDialog(props: {
  lang: Language;
  isDark: boolean;
  themeMode: ThemeMode;
  onTheme: (m: ThemeMode) => void;
  accent: AccentChoice;
  onAccent: (a: AccentChoice) => void;
  onLang: (l: Language) => void;
  onClose: () => void;
}) {
  const { lang, isDark, themeMode, onTheme, accent, onAccent, onLang, onClose } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const label = "text-sm font-semibold text-ink";
  const [lookup, setLookup] = useState(loadLookupEnabled);

  return (
    <Modal id="settings-dialog" width="md" onClose={onClose}>
      <ModalHeader title={<span className="inline-flex items-center gap-2"><Settings className="h-6 w-6" />{L("Налаштування", "Settings")}</span>} onClose={onClose} closeLabel={L("Закрити", "Close")} />

      <div className="space-y-2">
        <div className={label}>{L("Тема", "Theme")}</div>
        <Segmented fill id="settings-theme" ariaLabel={L("Тема", "Theme")} value={themeMode} onChange={onTheme}
          options={[
            { value: "system", label: L("Як у системі", "System") },
            { value: "light", label: L("Світла", "Light") },
            { value: "dark", label: L("Темна", "Dark") },
          ]} />
      </div>

      <div className="space-y-2">
        <div className={label}>{L("Колір", "Colour")}</div>
        {!accent.separate ? (
          <AccentPicker field lang={lang} isDark={isDark} value={accent.both} onChange={(id) => onAccent({ ...accent, both: id })} idSuffix="-settings" />
        ) : (
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="text-xs text-ink-3">{L("Світла тема", "Light theme")}</div>
              <AccentPicker field lang={lang} isDark={false} value={accent.light} onChange={(id) => onAccent({ ...accent, light: id })} idSuffix="-settings-light" label={L("Колір світлої теми", "Light theme colour")} />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-ink-3">{L("Темна тема", "Dark theme")}</div>
              <AccentPicker field lang={lang} isDark={true} value={accent.dark} onChange={(id) => onAccent({ ...accent, dark: id })} idSuffix="-settings-dark" label={L("Колір темної теми", "Dark theme colour")} />
            </div>
          </div>
        )}
        <label className="flex items-center justify-between gap-3 pt-1 text-sm text-ink-2 cursor-pointer">
          <span>{L("Різні кольори для світлої і темної теми", "Different colours for the light and dark theme")}</span>
          <Switch checked={accent.separate} onChange={(v) => onAccent(v ? { ...accent, separate: true, light: accent.both, dark: accent.both } : { ...accent, separate: false })} />
        </label>
      </div>

      <div className="space-y-2">
        <div className={label}>{L("Дані треку з інтернету", "Track data from the internet")}</div>
        <label className="flex items-center justify-between gap-3 text-sm text-ink-2 cursor-pointer">
          <span>{L("Розпізнавати виконавця, назву й обкладинку за назвою файлу", "Recognise the artist, title and cover from the file name")}</span>
          <Switch checked={lookup} onChange={(v) => { setLookup(v); saveLookupEnabled(v); }} />
        </label>
        <p className="text-xs text-ink-3">{L("Працює, коли ви натискаєте олівець біля назви. В інтернет іде лише очищена назва пісні та виконавець (MusicBrainz, Cover Art Archive), сам файл ніколи.", "Works when you press the pencil next to the title. Only the cleaned song name and artist go to the internet (MusicBrainz, Cover Art Archive), never the file itself.")}</p>
      </div>

      <div className="space-y-2">
        <div className={label}>{L("Мова", "Language")}</div>
        {LANGUAGES.length <= 3 ? (
          <Segmented fill id="settings-lang" ariaLabel={L("Мова", "Language")} value={lang} onChange={onLang}
            options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))} />
        ) : (
          <select id="settings-lang" aria-label={L("Мова", "Language")} value={lang} onChange={(e) => onLang(e.target.value as Language)}
            className="w-full rounded-lg border border-outline bg-canvas px-3 py-2 text-sm font-semibold text-ink cursor-pointer">
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        )}
      </div>

      <div className="flex justify-end"><button className={btn.cta} onClick={onClose}>{L("Готово", "Done")}</button></div>
    </Modal>
  );
}
