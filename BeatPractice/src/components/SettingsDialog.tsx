import { Settings } from "lucide-react";
import type { Language } from "../i18n";
import type { ThemeMode } from "../types";
import { Modal, ModalHeader } from "./ui/Modal";
import { Segmented } from "./ui/Segmented";
import { AccentPicker } from "./AccentPicker";
import { btn } from "./ui/styles";

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
  accent: string;
  onAccent: (id: string) => void;
  onLang: (l: Language) => void;
  onClose: () => void;
}) {
  const { lang, isDark, themeMode, onTheme, accent, onAccent, onLang, onClose } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const label = "text-sm font-semibold text-ink";

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
        <AccentPicker field lang={lang} isDark={isDark} value={accent} onChange={onAccent} idSuffix="-settings" />
        <p className="text-xs text-ink-3">{L("Один акцентний колір для обох тем: системні кольори Apple.", "One accent colour for both themes: the Apple system colours.")}</p>
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
