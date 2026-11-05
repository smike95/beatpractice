import { useEffect, useState } from "react";
import { Slider } from "./Slider";
import { Switch } from "./Switch";
import { Loader2, RotateCcw } from "lucide-react";
import type { usePlayer } from "../player/usePlayer";
import { btn as btnStyle } from "./ui/styles";

type Player = ReturnType<typeof usePlayer>;
type Lang = "uk" | "en";

export const NAMES: Record<string, [string, string]> = {
  drums: ["Ударні", "Drums"],
  bass: ["Бас", "Bass"],
  other: ["Інше", "Other"],
  vocals: ["Вокал", "Vocals"],
  guitar: ["Гітара", "Guitar"],
  piano: ["Клавішні", "Keys"],
  rest: ["Решта", "Rest"],
};

function mmss(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function StemsPanel({ player, lang }: { player: Player; lang: Lang }) {
  // lives inside the folded part of the mixer: a light block, not a separate card
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const { caps, stemsInfo: info, stemsState: state, stemsProgress: progress, stemMix, ready } = player;
  const names = info?.names ?? [];
  
  // a clock for the elapsed / remaining time while separating
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (state !== 1) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [state]);
  const elapsed = state === 1 ? (now - player.stemsStartedAt) / 1000 : 0;
  const eta = progress > 0.04 ? (elapsed * (1 - progress)) / progress : NaN;

  const card = "border-t border-slate-200 dark:border-slate-800 pt-3 space-y-4";
  const btn = btnStyle.secondary;
  const primary = btnStyle.cta;

  const neuralNote = (
    <p className="text-xs text-slate-400">
      {L("Нейромережа розділяє пісню на ударні, бас, вокал та інше.", "A neural network splits the song into drums, bass, vocals and the rest.")}
    </p>
  );

  // ---- the core cannot do it / the model is missing ------------------------------------------------
  if (!caps.stems) {
    return (
      <section className={card}>
        <p className="text-sm text-amber-500">
          {L(
            "У вашій збірці ядра ще немає розділення на партії: перезберіть beat-core з оновленими файлами (див. README).",
            "Your build of the core cannot separate stems yet: rebuild beat-core with the updated files (see README).",
          )}
        </p>
      </section>
    );
  }
  if (!ready) {
    return (
      <section className={card}>
        <p className="text-sm text-slate-400">{L("Відкрийте трек, щоб розділити його на партії.", "Open a track to split it into stems.")}</p>
      </section>
    );
  }
  if (info && !info.available) {
    return (
      <section className={card}>
        <p className="text-sm text-amber-500">
          {L("Модель розділення ще не встановлена. Завантажте її (один раз, близько 170 МБ):", "The separation model is not installed yet. Download it (once, about 170 MB):")}
        </p>
        <pre className="text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-200 overflow-x-auto">cd /шлях/до/beat-core{"\n"}sh scripts/fetch_stem_model.sh</pre>
        <button className={btn} onClick={player.refreshStems}>{L("Перевірити ще раз", "Check again")}</button>
      </section>
    );
  }

  // ---- not started ----------------------------------------------------------------------------------
  if (state === 0 || state === 3) {
    return (
      <section className={card}>
        {state === 3 && <p className="text-sm text-rose-400">{info?.error || L("Не вдалося розділити пісню.", "Separation failed.")}</p>}
        <div>
          <button id="btn-split-song" className={primary} onClick={player.startStems}>
            {info?.cached ? L("Завантажити готові партії", "Load the finished stems") : L("Розділити пісню на партії", "Split the song into stems")}
          </button>
        </div>
        {neuralNote}
        <p className="text-xs text-slate-400">
          {info?.cached
            ? L("Для цієї пісні партії вже пораховані, це займе кілька секунд.", "The stems of this song are already computed, this takes a few seconds.")
            : L(
                "Це робиться один раз для пісні й може тривати кілька хвилин (залежить від комп'ютера). Результат зберігається. Поки йде розділення, пісню можна слухати як зазвичай.",
                "This is done once per song and can take a few minutes (depends on the computer). The result is saved. You can keep listening to the song while it runs.",
              )}
        </p>
      </section>
    );
  }

  // ---- running ----------------------------------------------------------------------------------------
  if (state === 1) {
    return (
      <section className={card}>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm text-slate-200">
            <span className="inline-flex items-center gap-2"><Loader2 className="w-6 h-6 animate-spin" />{L("Розділення…", "Separating…")} {Math.round(progress * 100)}%</span>
            <button className={btn} onClick={player.cancelStems}>{L("Скасувати", "Cancel")}</button>
          </div>
          <div className="h-2 rounded bg-slate-800 overflow-hidden"><div className="h-full bg-sky-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <div className="text-xs text-slate-400 font-mono">
            {L("Минуло", "Elapsed")} {mmss(elapsed)} • {L("залишилось приблизно", "about")} {mmss(eta)} {lang === "en" ? "left" : ""}
          </div>
          <p className="text-xs text-slate-400">{L("Пісню можна слухати як зазвичай, поки йде розділення.", "You can keep listening to the song while it runs.")}</p>
        </div>
        {neuralNote}
      </section>
    );
  }

  // ---- ready: the mixer of parts ----------------------------------------------------------------------
  // quick mixes: only one part is heard. In this order; parts with other names (merged groups of a pack) follow.
  const ORDER = ["drums", "guitar", "piano", "vocals", "bass", "other"];
  const label = (n: string) => (NAMES[n] ?? [n, n])[lang === "en" ? 1 : 0];
  const onlyList = [...ORDER.filter((n) => names.includes(n)), ...names.filter((n) => !ORDER.includes(n) && n !== "rest")];
  return (
    <section className={card}>
      <div className="flex flex-wrap gap-2">
        {onlyList.map((n) => (
          <button key={n} className={btn} onClick={() => player.stemPreset({ only: n })}>{L(`Тільки ${label(n).toLowerCase()}`, `${label(n)} only`)}</button>
        ))}
        <button className={btn} onClick={() => player.stemPreset("reset")}>
          <span className="inline-flex items-center gap-1"><RotateCcw className="w-6 h-6" />{L("Скинути", "Reset")}</span>
        </button>
      </div>

      <div className="space-y-2">
        {names.map((n, i) => {
          const g = stemMix.gain[i] ?? 1;
          const muted = !!stemMix.mute[i];
          return (
            <div key={n + i} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-800 px-3 py-2">
              <div className="w-full sm:w-44 min-w-0 text-sm font-semibold text-slate-100 truncate">{(NAMES[n] ?? [n, n])[lang === "en" ? 1 : 0]}</div>
              <Slider
                min={0}
                max={150}
                step={5}
                value={Math.round(g * 100)}
                onChange={(v) => player.setStemGainUi(i, v / 100)}
                ariaLabel={(NAMES[n] ?? [n, n])[lang === "en" ? 1 : 0]}
              />
              <span className="w-12 text-right text-xs font-mono text-slate-300">{Math.round(g * 100)}%</span>
              <Switch
                checked={!muted}
                onChange={() => player.toggleStemMute(i)}
                label={(NAMES[n] ?? [n, n])[lang === "en" ? 1 : 0]}
                title={muted ? L("Партію вимкнено — натисніть, щоб увімкнути", "Part is off — click to turn on") : L("Партію увімкнено — натисніть, щоб вимкнути", "Part is on — click to turn off")}
              />
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">
        {L("Гучність «Трек» вище діє й на розділені партії. Метроном і відлік працюють так само.", "The 'Track' volume above applies to the stems too. Metronome and count-in work as usual.")}
      </p>
    </section>
  );
}
