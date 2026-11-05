import { useEffect, useState } from "react";
import { appVersion } from "../platform";
import { X } from "lucide-react";
import { BeatPracticeLogo } from "./BeatPracticeLogo";
import eulaRaw from "../../src-tauri/legal/EULA.txt?raw";
import noticesRaw from "../../src-tauri/legal/THIRD_PARTY_NOTICES.txt?raw";
import { Modal } from "./ui/Modal";
import { btn } from "./ui/styles";

// Copyright holder: Ukrainian and English spelling. The same name is in src-tauri/legal/*.txt and in the
// "publisher" and "copyright" fields of src-tauri/tauri.windows.conf.json and tauri.macos.conf.json.
const COPYRIGHT = { uk: "© 2026 Михайло С", en: "© 2026 Mykhailo S" };

const strip = (s: string) => s.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

export function AboutDialog({ lang, onClose }: { lang: "uk" | "en"; onClose: () => void }) {
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const [version, setVersion] = useState("");
  const [tab, setTab] = useState<"eula" | "notices">("eula");
  useEffect(() => { appVersion().then(setVersion).catch(() => {}); }, []);

  const tabBtn = (id: "eula" | "notices", label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={btn.chip(tab === id)}
    >{label}</button>
  );

  return (
    <Modal id="about-dialog" width="2xl" layer="z-[100]" scroll={false} className="flex flex-col" onClose={onClose}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <BeatPracticeLogo className="w-10 h-10 shrink-0" />
            <div>
              <div className="text-xl font-black leading-tight">BeatPractice</div>
              <div className="track-edit-label text-xs">{L("Версія", "Version")} {version || "…"} · {COPYRIGHT[lang]}</div>
            </div>
          </div>
          <button className={btn.icon} onClick={onClose} title={L("Закрити", "Close")}><X className="w-6 h-6" /></button>
        </div>
        <div className="flex gap-2">
          {tabBtn("eula", L("Ліцензійна угода", "License agreement"))}
          {tabBtn("notices", L("Сторонні компоненти", "Third-party components"))}
        </div>
        <pre className="track-edit-cover border rounded-xl p-3 text-xs whitespace-pre-wrap break-words overflow-y-auto min-h-0 flex-1 max-h-[55vh] font-mono" style={{ color: "inherit" }}>
          {strip(tab === "eula" ? eulaRaw : noticesRaw)}
        </pre>
        <div className="flex justify-end">
          <button className={btn.primary} onClick={onClose}>{L("Закрити", "Close")}</button>
        </div>
    </Modal>
  );
}
