// Splits a song into sections of one steady bar length (or a "mixed" stretch that alternates, e.g. 4+3).
// Port of beat_trainer_app/lib/core/tempo_sections.dart. posInBar is 1-based (1 = first beat of the bar).

export interface TempoSection {
  firstBar: number; // 1-based
  lastBar: number;
  startTime: number; // for display (the first section starts at 0)
  endTime: number; // for display (the last section ends at the song end)
  loopStart: number; // exact bar boundaries
  loopEnd: number;
  meters: number[];
  mixed: boolean;
  bpm: number;
  bars: number;
  label: string;
}

export function computeSections(
  times: number[],
  pos: number[],
  lens: number[],
  duration: number,
  minRun = 4,
): TempoSection[] {
  const barStarts: number[] = [];
  for (let i = 0; i < pos.length; i++) if (pos[i] === 1) barStarts.push(i);
  if (barStarts.length === 0 || times.length < 3) return [];

  const runN: number[] = [];
  const runFirst: number[] = [];
  const runCount: number[] = [];
  for (let k = 0; k < barStarts.length; k++) {
    const n = lens[barStarts[k]];
    if (runN.length > 0 && runN[runN.length - 1] === n) {
      runCount[runCount.length - 1]++;
    } else {
      runN.push(n);
      runFirst.push(k);
      runCount.push(1);
    }
  }

  // 0 = steady, 1 = short, 2 = short run absorbed at an edge
  const kinds: number[] = runN.map((_, r) => (runCount[r] >= minRun ? 0 : 1));
  const firstSteady = kinds.indexOf(0);
  if (firstSteady >= 0) {
    for (let r = 0; r < firstSteady; r++) kinds[r] = 2;
    const lastSteady = kinds.lastIndexOf(0);
    for (let r = lastSteady + 1; r < kinds.length; r++) kinds[r] = 2;
  }

  const sFirst: number[] = [];
  const sLast: number[] = [];
  const sMixed: boolean[] = [];
  const sN: number[] = [];
  const sNs: Set<number>[] = [];
  let r = 0;
  while (r < runN.length) {
    if (kinds[r] === 2) {
      r++;
      continue;
    }
    if (kinds[r] === 0) {
      const fb = runFirst[r];
      const lb = fb + runCount[r] - 1;
      const n = runN[r];
      if (sFirst.length > 0 && !sMixed[sMixed.length - 1] && sN[sN.length - 1] === n) {
        sLast[sLast.length - 1] = lb;
      } else {
        sFirst.push(fb);
        sLast.push(lb);
        sMixed.push(false);
        sN.push(n);
        sNs.push(new Set([n]));
      }
      r++;
    } else {
      const fb = runFirst[r];
      let lb = fb;
      const ns = new Set<number>();
      while (r < runN.length && kinds[r] === 1) {
        ns.add(runN[r]);
        lb = runFirst[r] + runCount[r] - 1;
        r++;
      }
      sFirst.push(fb);
      sLast.push(lb);
      sMixed.push(true);
      sN.push(0);
      sNs.push(ns);
    }
  }
  if (sFirst.length === 0) return [];
  for (let i = 0; i + 1 < sFirst.length; i++) sLast[i] = sFirst[i + 1] - 1;
  sFirst[0] = 0;
  sLast[sLast.length - 1] = barStarts.length - 1;

  const out: TempoSection[] = [];
  for (let k = 0; k < sFirst.length; k++) {
    const b0 = barStarts[sFirst[k]];
    const b1 = sLast[k] + 1 < barStarts.length ? barStarts[sLast[k] + 1] : times.length;
    const period = times[b1 - 1] - times[b1 - 2];
    const t0 = times[b0];
    const t1 = Math.min(times[b1 - 1] + period, duration);
    const n = b1 - b0;
    const bpm = n > 2 ? (60 * (n - 1)) / (times[b1 - 1] - t0) : 0;
    const meters = Array.from(sNs[k]).sort((a, b) => a - b);
    const mixed = sMixed[k];
    out.push({
      firstBar: sFirst[k] + 1,
      lastBar: sLast[k] + 1,
      startTime: k === 0 ? 0 : t0,
      endTime: k === sFirst.length - 1 ? duration : t1,
      loopStart: t0,
      loopEnd: t1,
      meters,
      mixed,
      bpm,
      bars: sLast[k] - sFirst[k] + 1,
      label: mixed ? meters.map((m) => `${m}/4`).join(" + ") : `${meters[0]}/4`,
    });
  }
  return out;
}

/** Start time of every bar (first beat of each bar), plus the total end. */
export function barStartTimes(times: number[], pos: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < pos.length; i++) if (pos[i] === 1) out.push(times[i]);
  return out;
}

/** Does the tempo drift or jump inside the song? Compares the spread of per-bar tempos (10th..90th percentile). */
export function tempoVaries(times: number[], pos: number[], lens: number[]): boolean {
  const bpms: number[] = [];
  for (let i = 0; i < pos.length; i++) {
    if (pos[i] !== 1) continue;
    const n = lens[i];
    if (i + n >= times.length) continue;
    const dur = times[i + n] - times[i];
    if (dur > 0.2) bpms.push((60 * n) / dur);
  }
  if (bpms.length < 8) return false;
  bpms.sort((a, b) => a - b);
  const q = (f: number) => bpms[Math.min(bpms.length - 1, Math.floor(f * bpms.length))];
  const med = q(0.5);
  return med > 0 && (q(0.9) - q(0.1)) / med > 0.06;
}
