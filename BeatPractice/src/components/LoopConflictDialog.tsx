import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "./ui/Modal";
import { btn } from "./ui/styles";
import { drawPeaks, lastLE, prepCanvas, useWidth } from "./Waveform";
import { loopColor, loopLabel, type LoopSlot } from "../types";

type Lang = "uk" | "en";

/** What the person decided: the new loop (maybe with moved edges) and the existing loops (maybe with moved edges). */
export interface LoopConflictAnswer {
  mode: "replace" | "separate";     // replace: the new loop takes the place of the loop `target`; separate: it is added as one more loop
  target?: number;                   // the index of the loop that is replaced (mode "replace")
  newLoop: { start: number; end: number };
  loops: LoopSlot[];                 // all existing loops, same order, with the edges as they were set here
}

const H = 150;          // height of the waveform
const RULER = 20;       // the strip with bar numbers
const overlap = (a: { start: number; end: number }, b: { start: number; end: number }) => Math.min(a.end, b.end) - Math.max(a.start, b.start) > 0.02;

/**
 * Shown when a new loop shares bars with existing loops. The place of the conflict is drawn on the waveform and the edges of the loops
 * can be moved right here (they snap to bar lines), so the conflict can be solved without leaving the dialog.
 * Buttons: save only the new loop (it replaces the loop it overlaps; with two or three overlapped loops there is one button per loop:
 * "instead of loop 1", "instead of loop 2"), save it as a separate loop, cancel.
 */
export function LoopConflictDialog(props: {
  lang: Lang;
  loops: LoopSlot[];
  hits: number[];                    // indices of the existing loops that share bars with the new one
  newLoop: { start: number; end: number };
  canCreate: boolean;                // there is a free place for one more loop
  isDark: boolean;
  peaks: number[];
  duration: number;
  barTimes: number[];
  onChoose: (answer: LoopConflictAnswer | null) => void;
}) {
  const { lang, hits, canCreate, isDark, peaks, duration, barTimes, onChoose } = props;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);

  const [nl, setNl] = useState(props.newLoop);
  const [ex, setEx] = useState<LoopSlot[]>(() => props.loops.map((l) => ({ ...l })));
  const [drag, setDrag] = useState<{ who: "new" | number; edge: "start" | "end" } | null>(null);

  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const w = useWidth(box);

  // the bar lines (the end of the song closes the last bar) and the shortest bar: the edges snap to these, a loop is never shorter than one bar
  const lines = useMemo(() => [...barTimes.filter((t) => t < duration - 1e-6), duration], [barTimes, duration]);
  const minBar = useMemo(() => {
    let m = Infinity;
    for (let i = 1; i < lines.length; i++) m = Math.min(m, lines[i] - lines[i - 1]);
    return Number.isFinite(m) && m > 0.05 ? m : 0.5;
  }, [lines]);

  // the part of the song that is shown: the loops involved with some room around them (fixed while the edges move)
  const view = useMemo(() => {
    const all = [props.newLoop, ...hits.map((i) => props.loops[i])];
    const lo = Math.min(...all.map((l) => l.start)), hi = Math.max(...all.map((l) => l.end));
    const pad = Math.max(minBar * 3, (hi - lo) * 0.25);
    return { t0: Math.max(0, lo - pad), t1: Math.min(duration, hi + pad) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const span = Math.max(0.001, view.t1 - view.t0);
  const xOf = (t: number) => ((t - view.t0) / span) * w;
  const tOf = (x: number) => view.t0 + (x / Math.max(1, w)) * span;
  const snap = (t: number) => {
    let best = lines[0], bd = Infinity;
    for (const l of lines) { const d = Math.abs(l - t); if (d < bd) { bd = d; best = l; } }
    return best;
  };

  const touching = hits.filter((i) => overlap(nl, ex[i]));          // the loops that still share bars with the new one
  const resolved = touching.length === 0;
  const barNo = (t: number) => Math.max(0, lastLE(barTimes, t + 0.001)) + 1;
  const barsOf = (l: { start: number; end: number }) => { const a = barNo(l.start), b = Math.max(a, barNo(l.end - 0.002)); return a === b ? `${a}` : `${a}–${b}`; };
  const commonBars = (() => {   // the bars that the new loop shares with the loops it touches
    if (resolved) return "";
    const a = Math.min(...touching.map((i) => Math.max(nl.start, ex[i].start))), b = Math.max(...touching.map((i) => Math.min(nl.end, ex[i].end)));
    return barsOf({ start: a, end: b });
  })();
  const newColour = loopColor(Math.min(props.loops.length, 2), isDark);

  // ---- drawing ----
  useEffect(() => {
    const c = cv.current;
    if (!c || w <= 0) return;
    const ctx = prepCanvas(c, w, H);
    if (!ctx) return;
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--c-ink-4").trim() || "142 142 147";
    const ink3 = css.getPropertyValue("--c-ink-3").trim() || "174 174 178";
    const line = css.getPropertyValue("--c-line").trim() || "58 58 60";
    drawPeaks(ctx, peaks, w, RULER, H - RULER, view.t0, view.t1, `rgb(${ink} / 0.7)`);
    // bar lines and numbers
    ctx.font = "11px 'Jura Tabular', Jura, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    const b0 = Math.max(0, lastLE(barTimes, view.t0));
    const every = Math.max(1, Math.ceil(36 / Math.max(1, (minBar / span) * w)));   // numbers not closer than ~36px
    for (let b = b0; b < barTimes.length && barTimes[b] <= view.t1; b++) {
      if (barTimes[b] < view.t0) continue;
      const x = Math.round(xOf(barTimes[b])) + 0.5;
      ctx.strokeStyle = `rgb(${line} / 0.9)`;
      ctx.beginPath(); ctx.moveTo(x, RULER - 4); ctx.lineTo(x, H); ctx.stroke();
      if (b % every === 0) { ctx.fillStyle = `rgb(${ink3})`; ctx.fillText(String(b + 1), x + 3, RULER / 2); }
    }
    const band = (l: { start: number; end: number }, c: { solid: string; fill: string; fillStrong: string }, dashed: boolean) => {
      const x0 = xOf(l.start), x1 = xOf(l.end);
      ctx.fillStyle = dashed ? c.fill : c.fillStrong;
      ctx.fillRect(x0, RULER, Math.max(2, x1 - x0), H - RULER);
      ctx.save();
      ctx.strokeStyle = c.solid; ctx.lineWidth = 2;
      if (dashed) ctx.setLineDash([6, 4]);
      ctx.strokeRect(x0 + 1, RULER + 1, Math.max(2, x1 - x0) - 2, H - RULER - 2);
      ctx.restore();
    };
    hits.forEach((i) => band(ex[i], loopColor(i, isDark), true));
    band(nl, newColour, false);
    // the place of the conflict: striped, in red
    touching.forEach((i) => {
      const a = xOf(Math.max(nl.start, ex[i].start)), b = xOf(Math.min(nl.end, ex[i].end));
      ctx.save();
      ctx.beginPath(); ctx.rect(a, RULER, b - a, H - RULER); ctx.clip();
      ctx.fillStyle = "rgba(244,63,94,0.28)"; ctx.fillRect(a, RULER, b - a, H - RULER);
      ctx.strokeStyle = "rgba(244,63,94,0.85)"; ctx.lineWidth = 2;
      for (let x = a - (H - RULER); x < b; x += 10) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + (H - RULER), RULER); ctx.stroke(); }
      ctx.restore();
    });
  }, [w, peaks, view, nl, ex, hits, isDark, barTimes, minBar, span, touching.length]);

  // ---- moving the edges ----
  const move = (who: "new" | number, edge: "start" | "end", t: number) => {
    const s = snap(t);
    const put = (l: { start: number; end: number }) => (edge === "start" ? { ...l, start: Math.min(s, l.end - minBar * 0.9) } : { ...l, end: Math.max(s, l.start + minBar * 0.9) });
    if (who === "new") setNl((l) => put(l));
    else setEx((a) => a.map((l, i) => (i === who ? put(l) : l)));
  };
  const onDown = (e: React.PointerEvent, who: "new" | number, edge: "start" | "end") => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ who, edge });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag || !box.current) return;
    const r = box.current.getBoundingClientRect();
    move(drag.who, drag.edge, tOf(e.clientX - r.left));
  };
  const onUp = () => setDrag(null);

  const handle = (who: "new" | number, edge: "start" | "end", t: number, colour: string, label: string) => {
    const x = xOf(t);
    return (
      <div key={`${who}-${edge}`} role="slider" aria-label={label} title={label}
        onPointerDown={(e) => onDown(e, who, edge)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ left: x - 11, top: RULER, height: H - RULER, width: 22, cursor: "ew-resize", touchAction: "none", zIndex: who === "new" ? 20 : 10 }}
        className="absolute flex items-center justify-center group">
        <span style={{ background: colour, height: 46 }} className="block w-1.5 rounded-full shadow ring-1 ring-black/25 opacity-90 group-hover:w-2" />
      </div>
    );
  };

  const answer = (mode: "replace" | "separate", target?: number): LoopConflictAnswer => ({ mode, target, newLoop: nl, loops: ex });
  const full = !canCreate;

  return (
    <Modal id="loop-conflict-dialog" width="xl" role="alertdialog" onClose={() => onChoose(null)}>
      <h3 className="text-base font-bold">
        {hits.length > 1 ? L("Новий цикл зачіпає кілька наявних", "The new loop touches several existing loops") : L("Новий цикл накладається на наявний", "The new loop overlaps an existing loop")}
      </h3>

      <div ref={box} className="relative select-none overflow-hidden rounded-lg border border-line bg-canvas" style={{ height: H }}>
        <canvas ref={cv} style={{ width: "100%", height: H, display: "block" }} />
        {w > 0 && hits.map((i) => (
          <div key={`ex-${i}`}>
            {handle(i, "start", ex[i].start, loopColor(i, isDark).solid, `${L("Початок циклу", "Loop start")} ${loopLabel(ex[i], i, lang)}`)}
            {handle(i, "end", ex[i].end, loopColor(i, isDark).solid, `${L("Кінець циклу", "Loop end")} ${loopLabel(ex[i], i, lang)}`)}
          </div>
        ))}
        {w > 0 && handle("new", "start", nl.start, newColour.solid, L("Початок нового циклу", "Start of the new loop"))}
        {w > 0 && handle("new", "end", nl.end, newColour.solid, L("Кінець нового циклу", "End of the new loop"))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: newColour.solid }} aria-hidden="true" />{L("Новий цикл", "New loop")} <span className="font-mono text-ink-3">{barsOf(nl)}</span></span>
        {hits.map((i) => (
          <span key={i} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: loopColor(i, isDark).solid }} aria-hidden="true" />«{loopLabel(ex[i], i, lang)}» <span className="font-mono text-ink-3">{barsOf(ex[i])}</span></span>
        ))}
      </div>

      {resolved ? (
        <p className="text-sm font-semibold text-emerald-600" role="status">{L("Цикли більше не накладаються.", "The loops no longer overlap.")}</p>
      ) : (
        <p className="text-sm text-ink-2" role="status">
          {L(`Спільні такти: ${commonBars}.`, `Shared bars: ${commonBars}.`)} {L("Потягніть межі циклів на хвилі, щоб розсунути їх.", "Drag the edges of the loops on the waveform to move them apart.")}
        </p>
      )}
      {full && <p className="text-xs text-ink-3">{L("Усі три місця для циклів зайняті.", "All three loop places are taken.")}</p>}

      <div className="flex flex-col gap-2">
        {resolved ? (
          <button type="button" id="loop-conflict-save" className={btn.cta} disabled={full} onClick={() => onChoose(answer("separate"))}>
            {L("Зберегти цикл", "Save the loop")}
          </button>
        ) : (
          <>
            {touching.length === 1 ? (
              <button type="button" id="loop-conflict-replace" className={`${btn.cta} flex-col !items-center !gap-0 py-2`} onClick={() => onChoose(answer("replace", touching[0]))}>
                <span>{L("Зберегти тільки новий", "Save only the new loop")}</span>
                <span className="text-xs font-normal opacity-85">{L(`замінить «${loopLabel(ex[touching[0]], touching[0], lang)}»`, `replaces “${loopLabel(ex[touching[0]], touching[0], lang)}”`)}</span>
              </button>
            ) : touching.map((i) => (
              <button key={i} type="button" id={`loop-conflict-replace-${i}`} className={`${btn.cta} flex-col !items-center !gap-0 py-2`} onClick={() => onChoose(answer("replace", i))}>
                <span>{L("Зберегти замість", "Save instead of")} «{loopLabel(ex[i], i, lang)}»</span>
                <span className="text-xs font-normal opacity-85">{L(`такти ${barsOf(ex[i])}; інші цикли лишаться`, `bars ${barsOf(ex[i])}; the other loops stay`)}</span>
              </button>
            ))}
            <button type="button" id="loop-conflict-separate" className={btn.neutral} disabled={full} onClick={() => onChoose(answer("separate"))}>
              {L("Зберегти новий як окремий", "Save the new loop as a separate one")}
            </button>
          </>
        )}
        <button type="button" id="loop-conflict-cancel" className={btn.neutral} onClick={() => onChoose(null)}>
          {L("Скасувати", "Cancel")}
        </button>
      </div>
    </Modal>
  );
}
