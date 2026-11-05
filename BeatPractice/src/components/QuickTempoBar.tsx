import { RotateCcw } from "lucide-react";
import { BpmInput } from "./BpmInput";

/** The ids below are used by the light-theme rules in index.css: keep them. */
const step =
  "h-11 sm:h-8 sm:min-w-10 px-2 flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white " +
  "text-xs font-mono font-bold rounded-lg border border-slate-800 cursor-pointer";

/**
 * Quick tempo row: -5 / -1 / typed BPM / +1 / +5 / back to the original tempo.
 * Phones: the BPM field is on its own line and the five buttons share the line below it (each at least 44 px). From `sm`: one compact row.
 */
export function QuickTempoBar(props: {
  hasTrack: boolean;
  currentBpm: number | undefined;
  canReset: boolean;
  onChange: (bpm: number) => void;
  onReset: () => void;
  labels: { minus5: string; minus1: string; plus1: string; plus5: string; reset: string };
}) {
  const { hasTrack, currentBpm, canReset, onChange, onReset, labels } = props;
  const base = currentBpm || 120;
  return (
    <div
      id="quick-tempo-control-bar"
      className="w-full sm:w-auto grid grid-cols-5 gap-1 p-1 sm:p-0 sm:px-1 sm:h-10 sm:flex sm:items-center sm:justify-center bg-slate-950 rounded-xl border border-slate-800 select-none shrink-0"
    >
      <button type="button" id="btn-quick-tempo-minus-5" onClick={() => onChange(base - 5)} className={step} title={labels.minus5}>-5</button>
      <button type="button" id="btn-quick-tempo-minus-1" onClick={() => onChange(base - 1)} className={step} title={labels.minus1}>-1</button>

      {/* current BPM, typing supported */}
      <div className="col-span-5 row-start-1 h-11 sm:h-8 flex items-center justify-center px-2 bg-slate-900 rounded-lg border border-slate-800 transition-colors duration-150 focus-within:border-slate-500 focus-within:ring-1 focus-within:ring-slate-500/50 sm:col-auto sm:row-auto">
        <BpmInput value={hasTrack ? (currentBpm ?? 0) : 0} onCommit={onChange} disabled={!hasTrack} />
        <span className="text-xs font-mono text-slate-400 select-none pr-0.5">BPM</span>
      </div>

      <button type="button" id="btn-quick-tempo-plus-1" onClick={() => onChange(base + 1)} className={step} title={labels.plus1}>+1</button>
      <button type="button" id="btn-quick-tempo-plus-5" onClick={() => onChange(base + 5)} className={step} title={labels.plus5}>+5</button>

      <button
        type="button"
        id="btn-quick-tempo-reset"
        onClick={onReset}
        disabled={!canReset}
        className={`h-11 sm:h-8 sm:w-10 flex items-center justify-center rounded-lg border cursor-pointer font-bold ${
          canReset ? "btn-attn shadow-sm" : "bg-slate-800 border-slate-700 text-slate-400 opacity-60 cursor-not-allowed"
        }`}
        title={labels.reset}
      >
        <RotateCcw className="w-6 h-6" />
      </button>
    </div>
  );
}
