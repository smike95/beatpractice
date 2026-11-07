import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Bookmark, LocateFixed, Trash2 } from "lucide-react";
import { SongData } from "../core";
import { LoopRange, LoopSlot, barsText, loopColor, loopLabel } from "../types";
import { TempoSection } from "../utils/sections";

type Lang = "uk" | "en";

interface Props {
  song: SongData | null;
  duration: number;
  position: number;
  playing: boolean;
  barTimes: number[];
  sections: TempoSection[];
  loop: LoopRange;
  loops: LoopSlot[];
  activeLoop: number | null;
  selectedLoop: number;                   // the loop that a drag replaces when there is no room for a new one
  speed: number; // playback ratio: clock times are shown as they are heard at this speed
  isDark: boolean;
  currentBeat: number; // 0-based
  beatsPerBar: number;
  lang: Lang;
  /** overview of every separated part and the level each is heard at (0 = off); empty = parts are not used */
  stemPeaks?: number[][];
  stemGains?: number[];
  onSeek: (t: number) => void;
  onDragLoop: (start: number, end: number) => void;
  maxLoops: number;                       // dragging makes a new loop while there is room for one
  onRemoveLoop: (index: number) => void;
  onJumpBar: (dir: -1 | 1) => void;
}

const PRESET_ZOOMS = [1, 2, 4, 8];
const ZOOM_MAX = 32;
const ZOOM_FACTOR = 1.25;   // one step of the − / + buttons and of Ctrl + wheel
const nextZoom = (z: number, dir: 1 | -1): number => {
  let n = dir > 0 ? z * ZOOM_FACTOR : z / ZOOM_FACTOR;
  n = Math.min(ZOOM_MAX, Math.max(1, Math.round(n * 1000) / 1000));
  return n < 1.02 ? 1 : n;
};

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/** index of the last element <= t, or -1 */
function lastLE(arr: number[], t: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function prepCanvas(cv: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (cv.width !== pw || cv.height !== ph) {
    cv.width = pw;
    cv.height = ph;
  }
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

function drawPeaks(
  ctx: CanvasRenderingContext2D,
  peaks: number[],
  w: number,
  y0: number,
  h: number,
  tStart: number,
  tEnd: number,
  color: string,
) {
  if (peaks.length === 0 || tEnd <= tStart) return;
  const mid = y0 + h / 2;
  ctx.fillStyle = color;
  for (let x = 0; x < w; x++) {
    const ta = tStart + ((tEnd - tStart) * x) / w;
    const tb = tStart + ((tEnd - tStart) * (x + 1)) / w;
    const i0 = Math.max(0, Math.floor(ta * 100));
    const i1 = Math.max(i0 + 1, Math.floor(tb * 100));
    let m = 0;
    for (let i = i0; i < i1 && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
    const a = Math.max(0.5, m * (h / 2 - 1));
    ctx.fillRect(x, mid - a, 1, a * 2);
  }
}

export function Waveform(props: Props) {
  const { song, duration, position, playing, barTimes, sections, loop, loops, activeLoop, selectedLoop, speed, isDark, currentBeat, beatsPerBar, lang } = props;
  const { stemPeaks, stemGains } = props;
  const { onSeek, onDragLoop, onJumpBar, maxLoops, onRemoveLoop } = props;
  const sp = speed > 0 ? speed : 1;
  const L = (uk: string, en: string) => (lang === "en" ? en : uk);

  const [zoom, setZoom] = useState(1);
  const [viewStart, setViewStart] = useState(0);
  const [follow, setFollow] = useState(true);
  const [dragSel, setDragSel] = useState<{ a: number; b: number } | null>(null);

  const mainRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const mainBox = useRef<HTMLDivElement>(null);
  const miniBox = useRef<HTMLDivElement>(null);
  const mainW = useWidth(mainBox);
  const miniW = useWidth(miniBox);

  const MAIN_H = 150;
  const MINI_H = 34;
  const RULER_H = 22;

  const viewDur = duration > 0 ? duration / zoom : 1;
  const clampStart = useCallback(
    (s: number) => Math.min(Math.max(0, s), Math.max(0, duration - duration / zoom)),
    [duration, zoom],
  );

  // Follow mode (zoomed in): the playhead moves to the middle of the window, then stays
  // in the middle while the waveform scrolls; once the end of the waveform reaches the
  // right edge the waveform stops and the playhead moves on to the end.
  useEffect(() => {
    if (duration <= 0) return;
    if (zoom === 1) {
      if (viewStart !== 0) setViewStart(0);
      if (!follow) setFollow(true);
      return;
    }
    if (!follow) return;
    // A loop that fits into the window: the waveform stands still, only the playhead moves.
    // (If the loop is not in view yet, the window is placed once so that it is centred on the loop.)
    if (loop.active && loop.end > loop.start && loop.end - loop.start <= viewDur) {
      if (loop.start < viewStart - 1e-6 || loop.end > viewStart + viewDur + 1e-6) {
        setViewStart(clampStart((loop.start + loop.end) / 2 - viewDur / 2));
      }
      return;
    }
    const target = clampStart(position - viewDur / 2);
    if (Math.abs(target - viewStart) > 1e-6) setViewStart(target);
  }, [position, zoom, duration, follow, loop.active, loop.start, loop.end]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- horizontal scrollbar under the waveform (manual scrolling) ----
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || duration <= 0 || zoom <= 1) return;
    const want = (viewStart / duration) * el.scrollWidth;
    if (Math.abs(el.scrollLeft - want) > 1) el.scrollLeft = want;
  }, [viewStart, zoom, duration, mainW]);
  const onScrollbar = () => {
    const el = scrollRef.current;
    if (!el || duration <= 0 || zoom <= 1) return;
    const want = (viewStart / duration) * el.scrollWidth;
    if (Math.abs(el.scrollLeft - want) <= 2) return; // echo of our own programmatic scroll
    setFollow(false);
    setViewStart(clampStart((el.scrollLeft / el.scrollWidth) * duration));
  };
  const onWheelMain = (e: React.WheelEvent) => {
    if (zoom <= 1 || duration <= 0 || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    setFollow(false);
    setViewStart(clampStart(viewStart + (e.deltaX / Math.max(1, mainW)) * viewDur));
  };

  const changeZoom = (z: number) => {
    setZoom(z);
    if (duration > 0) setViewStart(Math.min(Math.max(0, position - duration / z / 2), Math.max(0, duration - duration / z)));
  };
  const zoomStep = (dir: 1 | -1) => {
    const n = nextZoom(zoom, dir);
    if (n !== zoom) changeZoom(n);
  };

  // Ctrl + mouse wheel over the waveform zooms (in steps of the zoom buttons) around the mouse pointer.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    if (!e.ctrlKey || !song || duration <= 0) return;
    e.preventDefault();
    const now = performance.now();
    if (now - lastWheelZoom.current < 120) return;
    lastWheelZoom.current = now;
    const dir: 1 | -1 = e.deltaY < 0 ? 1 : -1;
    const n = nextZoom(zoom, dir);
    if (n === zoom) return;
    if (playing && follow) { changeZoom(n); return; }   // while following the playhead it stays in the middle
    const rect = mainBox.current?.getBoundingClientRect();
    const frac = rect && rect.width > 0 ? Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) : 0.5;
    const tCursor = viewStart + frac * viewDur;
    const newDur = duration / n;
    setZoom(n);
    setViewStart(Math.min(Math.max(0, tCursor - frac * newDur), Math.max(0, duration - newDur)));
  };
  const lastWheelZoom = useRef(0);
  useEffect(() => {
    const el = mainBox.current;
    if (!el) return;
    const h = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  const colors = useMemo(
    () => ({
      wave: isDark ? "#48484a" : "#c7c7cc",
      waveDone: isDark ? "#6e6e73" : "#8e8e93",
      // when some parts are off: the whole song is drawn dim, the parts that are heard are drawn brighter over it
      waveDim: isDark ? "#48484a" : "#e5e5ea",
      waveLive: isDark ? "#aeaeb2" : "#6e6e73",
      bar: isDark ? "rgba(202,120,246,0.60)" : "rgba(0,122,255,0.55)",
      beat: isDark ? "rgba(148,163,184,0.25)" : "rgba(100,116,139,0.22)",
      label: isDark ? "#8e8e93" : "#48484a",
      loop: isDark ? "rgba(202,120,246,0.32)" : "rgba(0,122,255,0.24)",
      dim: isDark ? "rgba(2,6,23,0.50)" : "rgba(15,23,42,0.16)",
      loopText: isDark ? "#1d1d1f" : "#ffffff",
      loopEdge: isDark ? "#ca78f6" : "#007aff",
      play: "#e11d48",
      ruler: isDark ? "rgba(15,23,42,0.55)" : "rgba(241,245,249,0.9)",
    }),
    [isDark],
  );
  // The part of the song that is really heard. Peaks of a mix cannot be added exactly, so the loudness of the parts that are on is compared
  // with the loudness of all parts (as the square root of the sum of squares, a good estimate for unrelated sounds) and the real overview of the song is
  // scaled by that ratio: with every part on it is exactly the real overview.
  const livePeaks = useMemo(() => {
    if (!song || !stemPeaks || !stemGains || stemPeaks.length === 0 || stemGains.length === 0) return null;
    const n = Math.min(stemPeaks.length, stemGains.length);
    const anyOff = stemGains.slice(0, n).some((g) => g <= 0);
    if (!anyOff) return null;
    const len = song.peaks.length;
    const out = new Array<number>(len).fill(0);
    for (let i = 0; i < len; i++) {
      let all = 0, act = 0;
      for (let k = 0; k < n; k++) {
        const p = stemPeaks[k][i] ?? 0;
        all += p * p;
        const a = p * Math.max(0, stemGains[k]);
        act += a * a;
      }
      out[i] = all > 1e-10 ? Math.min(1, song.peaks[i] * Math.min(1.5, Math.sqrt(act / all))) : 0;
    }
    return out;
  }, [stemPeaks, stemGains, song]);


  // ---- main waveform ------------------------------------------------------------------------
  useEffect(() => {
    const cv = mainRef.current;
    if (!cv || mainW <= 0) return;
    const ctx = prepCanvas(cv, mainW, MAIN_H);
    if (!ctx || !song || duration <= 0) return;
    const w = mainW;
    const t0 = viewStart;
    const t1 = viewStart + viewDur;
    const xOf = (t: number) => ((t - t0) / viewDur) * w;

    // loop region (and live selection while dragging)
    // the active loop: everything outside it is dimmed, the inside is tinted, the edges are thick
    const act = activeLoop !== null ? loops[activeLoop] : undefined;
    if (act) {
      const x0 = Math.max(0, xOf(act.start)), x1 = Math.min(w, xOf(act.end));
      ctx.fillStyle = colors.dim;
      if (x0 > 0) ctx.fillRect(0, RULER_H, x0, MAIN_H - RULER_H);
      if (x1 < w) ctx.fillRect(x1, RULER_H, w - x1, MAIN_H - RULER_H);
      ctx.fillStyle = loopColor(activeLoop ?? 0, isDark).fillStrong;
      ctx.fillRect(xOf(act.start), RULER_H, Math.max(1, xOf(act.end) - xOf(act.start)), MAIN_H - RULER_H);
    }
    // the other (switched off) loops: a dashed outline
    loops.forEach((l, i) => {
      if (i === activeLoop) return;
      ctx.save();
      ctx.setLineDash([6, 4]);
      const lc = loopColor(i, isDark);
      ctx.fillStyle = lc.fill;
      ctx.fillRect(xOf(l.start), RULER_H, Math.max(2, xOf(l.end) - xOf(l.start)), MAIN_H - RULER_H);
      ctx.strokeStyle = lc.solid;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(xOf(l.start) + 0.5, RULER_H + 1.5, Math.max(2, xOf(l.end) - xOf(l.start)) - 1, MAIN_H - RULER_H - 3);
      ctx.restore();
      ctx.fillStyle = lc.solid;
      ctx.font = "bold 15px Menlo, monospace";
      ctx.fillText(`${i + 1}`, xOf(l.start) + 6, MAIN_H - 9);
    });
    if (dragSel) {
      const a = Math.min(dragSel.a, dragSel.b), b = Math.max(dragSel.a, dragSel.b);
      const target = loops.length < maxLoops ? loops.length : Math.max(0, Math.min(loops.length - 1, selectedLoop));   // the loop that this drag makes / replaces
      const dc = loopColor(target, isDark);
      ctx.fillStyle = dc.fillStrong;
      ctx.fillRect(xOf(a), RULER_H, Math.max(1, xOf(b) - xOf(a)), MAIN_H - RULER_H);
      ctx.fillStyle = dc.solid;
      ctx.fillRect(xOf(a), RULER_H, 2, MAIN_H - RULER_H);
      ctx.fillRect(xOf(b) - 2, RULER_H, 2, MAIN_H - RULER_H);
    }

    if (livePeaks) {
      drawPeaks(ctx, song.peaks, w, RULER_H, MAIN_H - RULER_H, t0, t1, colors.waveDim);
      drawPeaks(ctx, livePeaks, w, RULER_H, MAIN_H - RULER_H, t0, t1, colors.waveLive);
    } else drawPeaks(ctx, song.peaks, w, RULER_H, MAIN_H - RULER_H, t0, t1, colors.wave);

    // beats (thin) – only when there is enough room
    const times = song.times;
    const pxPerBeat = times.length > 1 ? (w / viewDur) * (duration / times.length) : 0;
    const first = Math.max(0, lastLE(times, t0));
    for (let i = first; i < times.length && times[i] <= t1; i++) {
      if (song.posInBar[i] === 1) continue;
      if (pxPerBeat < 7) break;
      const x = Math.round(xOf(times[i]));
      ctx.fillStyle = colors.beat;
      ctx.fillRect(x, RULER_H, 1, MAIN_H - RULER_H);
    }

    // bar lines + ruler
    ctx.fillStyle = colors.ruler;
    ctx.fillRect(0, 0, w, RULER_H);
    const visBars = barTimes.filter((t) => t >= t0 - 1 && t <= t1 + 1).length || 1;
    const pxPerBar = w / visBars;
    const steps = [1, 2, 4, 5, 8, 10, 16, 20, 25, 50, 100, 200];
    const step = steps.find((s) => pxPerBar * s >= 52) ?? 200;
    ctx.font = "15px Menlo, monospace";
    ctx.textBaseline = "middle";
    const b0 = Math.max(0, lastLE(barTimes, t0));
    for (let b = b0; b < barTimes.length && barTimes[b] <= t1; b++) {
      const x = Math.round(xOf(barTimes[b]));
      ctx.fillStyle = colors.bar;
      ctx.fillRect(x, 0, 1, MAIN_H);
      const num = b + 1;
      if (num === 1 || num % step === 0) {
        ctx.fillStyle = colors.label;
        ctx.fillText(String(num), x + 3, RULER_H / 2 + 1);
      }
    }

    // active loop: coloured band in the ruler with its number, thick edges and a bottom bar
    if (act) {
      const x0 = xOf(act.start), x1 = xOf(act.end);
      const ac = loopColor(activeLoop ?? 0, isDark);
      ctx.fillStyle = ac.solid;
      ctx.fillRect(x0, 0, Math.max(2, x1 - x0), RULER_H);
      ctx.fillRect(x0 - 1, RULER_H, 4, MAIN_H - RULER_H);
      ctx.fillRect(x1 - 3, RULER_H, 4, MAIN_H - RULER_H);
      ctx.fillRect(x0, MAIN_H - 4, Math.max(2, x1 - x0), 4);
      ctx.fillStyle = ac.text;
      ctx.font = "bold 15px Menlo, monospace";
      ctx.textBaseline = "middle";
      ctx.fillText(loopLabel(loops[activeLoop ?? 0], activeLoop ?? 0, lang), Math.max(x0, 0) + 8, RULER_H / 2 + 1);
    }

    // playhead
    const px = xOf(position);
    if (px >= -2 && px <= w + 2) {
      ctx.fillStyle = colors.play;
      ctx.fillRect(Math.round(px) - 1, 0, 2, MAIN_H);
      ctx.beginPath();
      ctx.arc(Math.round(px), 5, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // the live "N bars" label of a loop being dragged: drawn LAST, above the waveform, the ruler and the playhead
    if (dragSel) {
      const a = Math.min(dragSel.a, dragSel.b), b = Math.max(dragSel.a, dragSel.b);
      const target = loops.length < maxLoops ? loops.length : Math.max(0, Math.min(loops.length - 1, selectedLoop));
      const dc = loopColor(target, isDark);
      // how many bars are selected now
      const nBars = Math.max(1, lastLE(barTimes, b - 0.001) - lastLE(barTimes, a + 0.001) + 1);
      const txt = barsText(nBars, lang);
      ctx.font = "bold 15px Menlo, monospace";
      const tw = ctx.measureText(txt).width + 16;
      const cx = Math.min(w - tw / 2 - 2, Math.max(tw / 2 + 2, (xOf(a) + xOf(b)) / 2));
      ctx.fillStyle = dc.solid;
      ctx.beginPath(); ctx.roundRect(cx - tw / 2, RULER_H + 8, tw, 24, 8); ctx.fill();
      ctx.fillStyle = dc.text; ctx.textBaseline = "middle"; ctx.textAlign = "center";
      ctx.fillText(txt, cx, RULER_H + 20); ctx.textAlign = "start";
    }
  }, [song, duration, position, viewStart, viewDur, mainW, loops, activeLoop, dragSel, barTimes, colors, lang, livePeaks, isDark, maxLoops, selectedLoop]);

  // ---- minimap --------------------------------------------------------------------------------
  useEffect(() => {
    const cv = miniRef.current;
    if (!cv || miniW <= 0) return;
    const ctx = prepCanvas(cv, miniW, MINI_H);
    if (!ctx || !song || duration <= 0) return;
    const w = miniW;
    const xOf = (t: number) => (t / duration) * w;
    if (loop.active) {
      ctx.fillStyle = colors.loop;
      ctx.fillRect(xOf(loop.start), 0, Math.max(3, xOf(loop.end) - xOf(loop.start)), MINI_H);
      ctx.fillStyle = colors.loopEdge;
      ctx.fillRect(xOf(loop.start), 0, 2, MINI_H);
      ctx.fillRect(xOf(loop.end) - 2, 0, 2, MINI_H);
    }
    if (livePeaks) {
      drawPeaks(ctx, song.peaks, w, 0, MINI_H, 0, duration, colors.waveDim);
      drawPeaks(ctx, livePeaks, w, 0, MINI_H, 0, duration, colors.waveLive);
    } else drawPeaks(ctx, song.peaks, w, 0, MINI_H, 0, duration, colors.waveDone);
    if (zoom > 1) {
      ctx.strokeStyle = colors.loopEdge;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(xOf(viewStart) + 0.5, 0.5, Math.max(2, xOf(viewDur)) - 1, MINI_H - 1);
    }
    ctx.fillStyle = colors.play;
    ctx.fillRect(Math.round(xOf(position)) - 1, 0, 2, MINI_H);
  }, [song, duration, position, viewStart, viewDur, zoom, miniW, loop, colors, livePeaks]);

  // ---- mouse on the main waveform --------------------------------------------------------------
  const dragRef = useRef<{ x0: number; t0: number; moved: boolean } | null>(null);
  const timeAt = (clientX: number): number => {
    const r = mainRef.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return viewStart + f * viewDur;
  };
  const barSpan = (ta: number, tb: number): [number, number] | null => {
    if (barTimes.length === 0) return null;
    const a = Math.min(ta, tb);
    const b = Math.max(ta, tb);
    const ia = Math.max(0, lastLE(barTimes, a));
    const ib = Math.max(ia, lastLE(barTimes, b));
    const start = barTimes[ia];
    const end = ib + 1 < barTimes.length ? barTimes[ib + 1] : duration;
    return [start, end];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!song) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { x0: e.clientX, t0: timeAt(e.clientX), moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) > 6) d.moved = true;
    if (d.moved) {
      const span = barSpan(d.t0, timeAt(e.clientX));
      if (span) setDragSel({ a: span[0], b: span[1] });
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved) {
      const span = barSpan(d.t0, timeAt(e.clientX));
      setDragSel(null);
      if (span && span[1] > span[0]) {
        onDragLoop(span[0], span[1]);
        onSeek(span[0]);
      }
    } else {
      onSeek(d.t0);
    }
  };

  // ---- derived numbers for the header -------------------------------------------------------------
  const barIdx = barTimes.length > 0 ? Math.max(0, lastLE(barTimes, position)) : 0;
  const totalBars = barTimes.length;
  const btn =
    "h-8 w-24 inline-flex items-center justify-center text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="mt-3.5 rounded-2xl border border-slate-800 bg-slate-900 p-3 sm:p-4 space-y-3">
      {/* clock, bar navigation, zoom */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 shrink-0">
          <span className="text-2xl font-black font-mono text-slate-100 tabular-nums">{fmt(position / sp)}</span>
          <span className="text-xs font-mono text-slate-400">/ {fmt(duration / sp)}</span>
        </div>

        <div className="flex shrink-0 h-10 items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-1 select-none">
          <button className={btn} disabled={!song} onClick={() => onJumpBar(-1)} title={L("Такт назад (←)", "Previous bar (←)")}>
            <span className="inline-flex items-center gap-1"><ChevronLeft className="w-6 h-6" />{L("Такт", "Bar")}</span>
          </button>
          <span className="px-2 text-xs text-slate-300 inline-flex items-center gap-1.5 whitespace-nowrap">
            <Bookmark className="w-6 h-6 text-slate-400" />
            {L("Такт", "Bar")} <strong className="font-mono text-slate-100">{totalBars ? barIdx + 1 : "—"}</strong>
            <span className="text-slate-500">/ {totalBars || "—"}</span>
            <span className="text-slate-500">•</span>
            <strong className="font-mono text-emerald-500">{song ? `${currentBeat + 1}/${beatsPerBar}` : "—"}</strong>
          </span>
          <button className={btn} disabled={!song} onClick={() => onJumpBar(1)} title={L("Такт вперед (→)", "Next bar (→)")}>
            <span className="inline-flex items-center gap-1">{L("Такт", "Bar")}<ChevronRight className="w-6 h-6" /></span>
          </button>
        </div>

        <div className="flex shrink-0 h-10 items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-1 select-none">
          <button
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-default"
            disabled={!song || zoom <= 1}
            onClick={() => zoomStep(-1)}
            title={L("Зменшити масштаб (Ctrl + колесо вниз)", "Zoom out (Ctrl + wheel down)")}
            aria-label={L("Зменшити масштаб", "Zoom out")}
          ><ZoomOut className="w-6 h-6" /></button>
          <span className="text-xs text-slate-400 mr-1 whitespace-nowrap">{L("Масштаб", "Zoom")} <strong className="font-mono text-slate-100 inline-block w-10 text-left">×{zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}</strong></span>
          {PRESET_ZOOMS.map((z) => (
            <button
              key={z}
              disabled={!song}
              onClick={() => changeZoom(z)}
              className={`h-8 min-w-[3rem] px-2 inline-flex items-center justify-center text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                Math.abs(zoom - z) < 0.01
                  ? "bg-slate-700 text-white border-slate-500"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
              }`}
            >
              ×{z}
            </button>
          ))}
          <button
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-default"
            disabled={!song || zoom >= ZOOM_MAX}
            onClick={() => zoomStep(1)}
            title={L("Збільшити масштаб (Ctrl + колесо вгору)", "Zoom in (Ctrl + wheel up)")}
            aria-label={L("Збільшити масштаб", "Zoom in")}
          ><ZoomIn className="w-6 h-6" /></button>
        </div>
      </div>

      {/* sections */}
      {sections.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2">
          <span className="text-xs font-semibold text-slate-400">{L("Секції:", "Sections:")}</span>
          {sections.map((s, i) => {
            const active = position >= s.startTime && position < s.endTime;
            return (
              <button
                key={i}
                onClick={() => onSeek(s.loopStart)}
                title={`${L("Такти", "Bars")} ${s.firstBar}–${s.lastBar}, ${fmt(s.startTime / sp)}`}
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-2 border-[3px] cursor-pointer transition-colors bg-slate-800 text-slate-200 hover:bg-slate-700 ${
                  active ? "border-amber-400" : "border-slate-700"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                <span>{sections.length === 1 ? L("Основний трек", "Main track") : `${L("Секція", "Section")} ${i + 1}`}</span>
                <span className="font-mono text-xs opacity-80">{s.label}</span>
                {s.bpm > 0 && <span className="font-mono text-xs text-amber-500">{Math.round(s.bpm)}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* minimap */}
      <div>
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span>{L("Оглядова стрічка треку (Мінікарта):", "Track overview (minimap):")}</span>
          <span className="font-mono">{totalBars ? `${totalBars} ${L("тактів", "bars")} (${fmt(duration / sp)})` : ""}</span>
        </div>
        <div ref={miniBox} className="rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
          <canvas
            ref={miniRef}
            style={{ width: "100%", height: MINI_H, display: "block", cursor: "pointer" }}
            onClick={(e) => {
              if (duration <= 0) return;
              const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
              onSeek(((e.clientX - r.left) / r.width) * duration);
            }}
          />
        </div>
      </div>

      {/* main waveform */}
      <div ref={mainBox} className="rounded-lg overflow-hidden bg-slate-950 border border-slate-800 relative select-none">
        <canvas
          ref={mainRef}
          style={{ width: "100%", height: MAIN_H, display: "block", cursor: "crosshair", touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheelMain}
        />
        {/* a trash can at the right edge of every loop; when the loop is too narrow for it, it sits just outside the loop */}
        {song && duration > 0 && loops.map((l, i) => {
          const x = ((l.start - viewStart) / viewDur) * mainW, x1 = ((l.end - viewStart) / viewDur) * mainW;
          if (x1 < 0 || x > mainW) return null;                                   // the loop is out of the view
          const BTN = 28, GAP = 6;
          const fitsInside = x1 - x >= BTN + 2 * GAP + 8;
          const rawLeft = fitsInside ? Math.min(x1, mainW) - BTN - GAP : (x1 + GAP + BTN <= mainW - 2 ? x1 + GAP : x - BTN - GAP);
          const left = Math.max(4, Math.min(mainW - BTN - 4, rawLeft));
          const lc = loopColor(i, isDark);
          return (
            <button key={i} type="button" aria-label={`${L("Видалити цикл", "Delete loop")} ${loopLabel(l, i, lang)}`} title={`${L("Видалити цикл", "Delete loop")}: ${loopLabel(l, i, lang)}`}
              onClick={() => onRemoveLoop(i)}
              style={{ left, top: RULER_H + 6, background: lc.solid, color: lc.text }}
              className="absolute w-7 h-7 rounded-lg flex items-center justify-center shadow cursor-pointer opacity-90 hover:opacity-100">
              <Trash2 className="w-4 h-4" />
            </button>
          );
        })}
        {song && zoom > 1 && !follow && (
          <button
            onClick={() => setFollow(true)}
            title={L("Повернутися до позначки й слідкувати за нею", "Jump back to the playhead and follow it")}
            className="absolute top-2 right-2 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-2 border border-sky-400 bg-sky-700 hover:bg-sky-600 text-white shadow cursor-pointer"
          >
            <LocateFixed className="w-6 h-6" />
            {L("Слідкувати", "Follow")}
          </button>
        )}
        {!song && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
            {L("Хвиля з'явиться після аналізу треку", "The waveform appears after the track is analysed")}
          </div>
        )}
      </div>
      {zoom > 1 && (
        <div ref={scrollRef} onScroll={onScrollbar} className="overflow-x-auto overflow-y-hidden -mt-2" style={{ height: 18 }}>
          <div style={{ width: `${zoom * 100}%`, height: 1 }} />
        </div>
      )}
      <div className="text-xs text-slate-500 -mt-1.5">
        {L("Клік — перемотати. Протягніть по хвилі — задати цикл по тактах.", "Click to seek. Drag across the waveform to set a bar loop.")}
      </div>

      {/* keep "playing" referenced so the header re-renders predictably */}
      <span className="hidden">{playing ? "▶" : "⏸"}</span>
    </div>
  );
}
