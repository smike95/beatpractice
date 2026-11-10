import { useEffect, useRef, useState } from "react";
import { Play, Square, TrendingUp } from "lucide-react";
import { SpinField } from "./ui/SpinField";
import { PanelCard } from "./ui/PanelCard";
import { Field } from "./ui/Field";
import { MiniButton } from "./ui/MiniButton";
import { StableLabel } from "./ui/StableLabel";

type Lang = "uk" | "en";

/**
 * Training: the tempo goes up (or down) in steps while you keep playing. A "pass" is one go through the active loop, or through the whole
 * track when no loop is on (the track has to repeat). The start is the tempo you have set now, the target is the original tempo, unless you
 * type other values.
 */
export function RampPanel(props: {
  lang: Lang;
  ready: boolean;
  playing: boolean;
  currentBpm: number;
  originalBpm: number;
  loopActive: boolean;
  loopWraps: number;       // loop passes counted by the core
  position: number;        // seconds, to see the track start over when there is no loop
  duration: number;
  onSetBpm: (bpm: number) => void;
  onPlay: () => void;
  onEnsureRepeat: () => void;   // no loop is on: the whole track has to repeat
  onPause: () => void;          // Stop also stops the song
}) {
  const { lang, ready, playing, currentBpm, originalBpm, loopActive, loopWraps, position, duration } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);
  const lo = Math.max(20, Math.round(originalBpm * 0.25 * 10) / 10), hi = Math.round(originalBpm * 2 * 10) / 10;
  const clampBpm = (v: number) => Math.min(hi, Math.max(lo, v));

  const [startOv, setStartOv] = useState<number | null>(null);    // null = the tempo at the moment of starting
  const [targetOv, setTargetOv] = useState<number | null>(null);  // null = the original tempo
  const [step, setStep] = useState(5);
  const [every, setEvery] = useState(2);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [passes, setPasses] = useState(0);                         // passes since the last step
  const [stepNo, setStepNo] = useState(0);

  const startShown = startOv ?? currentBpm;
  const targetShown = targetOv ?? originalBpm;

  const run = useRef({ bpm: 0, target: 0, passes: 0, step: 5, every: 2, stepNo: 0 });
  const lastCount = useRef(0);
  const [ownWraps, setOwnWraps] = useState(0);                  // track restarts seen here (used when no loop is on)
  const prevPos = useRef(0);

  // the number of passes so far: loop passes from the core, or track restarts seen here
  useEffect(() => {
    if (!playing) { prevPos.current = position; return; }
    if (!loopActive && duration > 0 && prevPos.current - position > duration * 0.5) setOwnWraps((v) => v + 1);
    prevPos.current = position;
  }, [position, playing, loopActive, duration]);
  const count = loopActive ? loopWraps : ownWraps;

  useEffect(() => {
    if (!running) { lastCount.current = count; return; }
    if (count < lastCount.current) lastCount.current = count;           // the counter started over (another song / loop)
    const fresh = count - lastCount.current;
    if (fresh <= 0) return;
    lastCount.current = count;
    const r = run.current;
    r.passes += fresh;
    while (r.passes >= r.every && !done) {
      r.passes -= r.every;
      const dir = r.target >= r.bpm ? 1 : -1;
      const next = dir > 0 ? Math.min(r.target, r.bpm + r.step) : Math.max(r.target, r.bpm - r.step);
      r.bpm = Math.round(next * 10) / 10; r.stepNo++;
      props.onSetBpm(r.bpm);
      setStepNo(r.stepNo);
      if (r.bpm === r.target) { setDone(true); setRunning(false); r.passes = 0; break; }
    }
    setPasses(r.passes);
  }, [count, running]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    const from = clampBpm(startOv ?? currentBpm), to = clampBpm(targetOv ?? originalBpm);
    run.current = { bpm: from, target: to, passes: 0, step: Math.max(0.5, step), every: Math.max(1, every), stepNo: 0 };
    lastCount.current = count; setPasses(0); setStepNo(0); setDone(false);
    props.onSetBpm(from);
    if (from === to) { setDone(true); return; }
    if (!loopActive) props.onEnsureRepeat();
    setRunning(true);
    if (!playing) props.onPlay();
  };
  const stop = () => { setRunning(false); if (playing) props.onPause(); };

  const unit = loopActive ? L("проходів циклу", "loop passes") : L("проходів треку", "track passes");
  const status = !ready ? L("Відкрийте трек.", "Open a track.")
    : done ? L(`Ціль ${targetShown.toFixed(1)} BPM досягнуто.`, `Target of ${targetShown.toFixed(1)} BPM reached.`)
    : running ? L(`Зараз ${run.current.bpm.toFixed(1)} BPM → ціль ${run.current.target.toFixed(1)}. Прохід ${passes + 1} з ${run.current.every}, кроків зроблено: ${stepNo}.`,
                  `Now ${run.current.bpm.toFixed(1)} BPM → target ${run.current.target.toFixed(1)}. Pass ${passes + 1} of ${run.current.every}, steps made: ${stepNo}.`)
    : "";

  return (
    <PanelCard
      info={<>{L("Темп збільшується з кожним проходом із зазначеним кроком.", "The tempo goes up with every pass by the chosen step.")}</>}
      id="ramp-panel"
      className="h-full"
      icon={<TrendingUp className="w-6 h-6" />}
      title={L("Розгін", "Speed-up")}
      actions={
        <button
          id="btn-ramp"
          type="button"
          disabled={!ready}
          onClick={() => (running ? stop() : start())}
          aria-pressed={running}
          className={`min-h-11 px-4 rounded-lg font-bold inline-flex items-center justify-center gap-2 cursor-pointer text-white shadow-sm transition-colors duration-150 disabled:opacity-40 disabled:cursor-default ${running ? "bg-rose-700 hover:bg-rose-600" : "bg-emerald-600 hover:bg-emerald-500"}`}
        >
          {running ? <Square className="w-5 h-5 shrink-0 fill-current" /> : <Play className="w-5 h-5 shrink-0 fill-current" />}
          <StableLabel active={running ? 1 : 0} labels={[L("Почати розгін", "Start"), L("Зупинити", "Stop")]} />
        </button>
      }
    >

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label={<>{L("Старт, BPM", "Start, BPM")} {startOv === null && <span className="text-slate-500">({L("поточний", "current")})</span>}</>}>
          <div className="flex items-center gap-2 flex-wrap">
            <SpinField id="ramp-start" value={startShown} min={lo} max={hi} step={1} decimals={1} widthClass="w-16" label={L("Стартовий темп", "Start tempo")} disabled={!ready || running} onChange={(v) => setStartOv(v)} />
            {startOv !== null && <MiniButton disabled={running} onClick={() => setStartOv(null)}>{L("поточний", "current")}</MiniButton>}
          </div>
        </Field>
        <Field label={<>{L("Ціль, BPM", "Target, BPM")} {targetOv === null && <span className="text-slate-500">({L("оригінал", "original")})</span>}</>}>
          <div className="flex items-center gap-2 flex-wrap">
            <SpinField id="ramp-target" value={targetShown} min={lo} max={hi} step={1} decimals={1} widthClass="w-16" label={L("Цільовий темп", "Target tempo")} disabled={!ready || running} onChange={(v) => setTargetOv(v)} />
            {targetOv !== null && <MiniButton disabled={running} onClick={() => setTargetOv(null)}>{L("оригінал", "original")}</MiniButton>}
          </div>
        </Field>
        <Field label={L("Крок, BPM", "Step, BPM")}>
          <SpinField id="ramp-step" value={step} min={1} max={50} label={L("Крок прискорення", "Step")} disabled={running} onChange={setStep} />
        </Field>
        <Field label={L(`Змінювати темп кожні N ${unit}`, `Change the tempo every N ${unit}`)}>
          <SpinField id="ramp-every" value={every} min={1} max={32} label={L("Проходів на крок", "Passes per step")} disabled={running} onChange={setEvery} />
        </Field>
      </div>
      {status && <p className="text-sm text-slate-200" role="status">{status}</p>}
    </PanelCard>
  );
}
