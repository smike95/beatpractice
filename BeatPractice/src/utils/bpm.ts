/** The tempo of a track for display: the range of its sections ("100.3–143.9 BPM"), or one number if it is steady or the range is not known yet. */
export function formatBpmRange(min: number | undefined, max: number | undefined, average: number): string {
  if (min && max && max - min >= 0.5) return `${min.toFixed(1)}–${max.toFixed(1)} BPM`;
  const one = min && max ? (min + max) / 2 : average;
  return one > 0 ? `${one.toFixed(1)} BPM` : "—";
}

/** The lowest and the highest tempo (to tenths) among the sections that have one; null if none has. */
export function bpmSpan(bpms: number[]): { min: number; max: number } | null {
  const v = bpms.filter((b) => b > 0 && isFinite(b));
  if (!v.length) return null;
  return { min: Math.round(Math.min(...v) * 10) / 10, max: Math.round(Math.max(...v) * 10) / 10 };
}
