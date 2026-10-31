import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { X } from "lucide-react";
import { BeatPracticeLogo } from "./BeatPracticeLogo";
import eulaRaw from "../../src-tauri/legal/EULA.txt?raw";
import noticesRaw from "../../src-tauri/legal/THIRD_PARTY_NOTICES.txt?raw";

// Change the name here (and in src-tauri/legal/*.txt, src-tauri/tauri.windows.conf.json) if the copyright holder differs.
const COPYRIGHT = "© 2026 Mike";

const strip = (s: string) => s.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

export function AboutDialog({ lang, onClose }: { lang: "uk" | "en"; onClose: () => void }) {
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const [version, setVersion] = useState("");
  const [tab, setTab] = useState<"eula" | "notices">("eula");
  useEffect(() => { getVersion().then(setVersion).catch(() => {}); }, []);

  const tabBtn = (id: "eula" | "notices", label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer ${tab === id ? "bg-sky-700 border-sky-700 text-white" : "track-edit-btn"}`}
    >{label}</button>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" id="about-dialog" className="track-edit-dialog w-full max-w-2xl rounded-2xl border shadow-2xl p-5 space-y-4 max-h-full flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <BeatPracticeLogo className="w-10 h-10 shrink-0" />
            <div>
              <div className="text-xl font-black leading-tight">BeatPractice</div>
              <div className="track-edit-label text-xs">{L("Версія", "Version")} {version || "…"} · {COPYRIGHT}</div>
            </div>
          </div>
          <button className="track-edit-close p-1 rounded-lg cursor-pointer" onClick={onClose} title={L("Закрити", "Close")}><X className="w-6 h-6" /></button>
        </div>
        <div className="flex gap-2">
          {tabBtn("eula", L("Ліцензійна угода", "License agreement"))}
          {tabBtn("notices", L("Сторонні компоненти", "Third-party components"))}
        </div>
        <pre className="track-edit-cover border rounded-xl p-3 text-xs whitespace-pre-wrap break-words overflow-y-auto min-h-0 flex-1 max-h-[55vh] font-mono" style={{ color: "inherit" }}>
          {strip(tab === "eula" ? eulaRaw : noticesRaw)}
        </pre>
        <div className="flex justify-end">
          <button className="px-4 py-1.5 text-xs font-bold rounded-lg bg-sky-700 hover:bg-sky-600 text-white cursor-pointer" onClick={onClose}>{L("Закрити", "Close")}</button>
        </div>
      </div>
    </div>
  );
}
