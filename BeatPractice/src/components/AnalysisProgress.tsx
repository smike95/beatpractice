import { useEffect, useState } from "react";

type Lang = "uk" | "en";

const PHRASES: Record<Lang, string[]> = {
  uk: [
    "Спочатку я послухаю…",
    "Дай трохи подумати…",
    "Трохи магії…",
    "Рахую долі на пальцях…",
    "Киваю головою в такт, суто для науки…",
    "Шукаю, де тут перша доля…",
    "Питаю в метронома, що він думає…",
    "Розкладаю ритм по поличках…",
    "Налаштовую вуха…",
    "Дослухаю до кінця, обіцяю не перемотувати…",
    "Ще трохи, і буде ритм…",
  ],
  en: [
    "First, I'll have a listen…",
    "Let me think for a moment…",
    "A little bit of magic…",
    "Counting the beats on my fingers…",
    "Nodding along, purely for science…",
    "Looking for the downbeat…",
    "Asking the metronome what it thinks…",
    "Sorting the rhythm onto shelves…",
    "Tuning my ears…",
    "Listening to the end, no skipping, promise…",
    "Almost there, the rhythm is coming…",
  ],
};

/**
 * The waiting block of the analysis: a progress bar with the percentage and a funny phrase that changes every few seconds.
 * `progress` is 0..1, or null while the length of the wait is not known (decoding): then the bar just moves.
 */
export function AnalysisProgress(props: { lang: Lang; progress: number | null; label: string }) {
  const { lang, progress, label } = props;
  const list = PHRASES[lang];
  const [i, setI] = useState(() => Math.floor(Math.random() * list.length));
  useEffect(() => {
    const t = window.setInterval(() => setI((k) => (k + 1) % list.length), 3500);
    return () => window.clearInterval(t);
  }, [list.length]);
  const pct = progress === null ? null : Math.max(0, Math.min(100, Math.round(progress * 100)));
  return (
    <div className="space-y-2" id="analysis-progress">
      <div className="flex items-center justify-between gap-3 text-xs font-medium">
        <span>{label}</span>
        {pct !== null && <span className="font-mono tabular-nums">{pct}%</span>}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-control" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
        {pct !== null
          ? <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
          : <div className="h-full w-1/3 rounded-full bg-accent animate-pulse motion-reduce:animate-none" />}
      </div>
      <p className="min-h-[1.25rem] text-center text-xs text-ink-3" aria-live="off">{list[i]}</p>
    </div>
  );
}
