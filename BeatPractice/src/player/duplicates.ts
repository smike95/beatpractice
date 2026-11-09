import type { LoopSlot, PlaylistItem } from "../types";

/** How the user decided about a pair of tracks that look like the same song. */
export type DupChoice = "keep-existing" | "keep-new" | "merge";

const norm = (s: string) =>
  s.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\(\d+\)\s*$/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** What the track is called for the comparison: "artist title" when both are known, otherwise the name of the file. */
export function dupKey(it: PlaylistItem): string {
  const a = (it.artist ?? "").trim(), t = (it.title ?? "").trim();
  return norm(a && t ? `${a} ${t}` : it.name);
}

/** The first track of `pool` that is the same song as `it`: the same name and, when both lengths are known, the same length (±2 s). */
export function findDuplicate(pool: PlaylistItem[], it: PlaylistItem): PlaylistItem | null {
  const key = dupKey(it);
  if (!key) return null;
  const d = it.trackInfo.duration;
  for (const p of pool) {
    if (p.id === it.id || dupKey(p) !== key) continue;
    const pd = p.trackInfo.duration;
    if (d > 0 && pd > 0 && Math.abs(d - pd) > 2) continue;
    return p;
  }
  return null;
}

const isPack = (it: PlaylistItem) => /\.beatpack$/i.test(it.path);
/** The beat map is known: the track was opened (analysed) here, or it comes in a pack. */
export const isAnalysed = (it: PlaylistItem) => isPack(it) || it.trackInfo.originalBpm > 0;
/** The parts of the song (drums, bass, voice...) are separated. */
export const isSeparated = (it: PlaylistItem) => !!it.hasStems || !!it.stemsOn;

/** Two tracks in one: what one of them lacks is taken from the other; the source of the sound is the one that is separated, else analysed. */
export function mergeItems(a: PlaylistItem, b: PlaylistItem): PlaylistItem {
  // a = the existing one (keeps its place and id), b = the new one
  const score = (x: PlaylistItem) => (isSeparated(x) ? 2 : 0) + (isAnalysed(x) ? 1 : 0);
  const src = score(b) > score(a) ? b : a;
  const loops: LoopSlot[] = [...a.loops];
  for (const l of b.loops) if (loops.length < 3 && !loops.some((x) => Math.abs(x.start - l.start) < 0.05 && Math.abs(x.end - l.end) < 0.05)) loops.push(l);
  const tags = Array.from(new Set([...(a.tags ?? []), ...(b.tags ?? [])]));
  return {
    ...a,
    path: src.path,
    trackInfo: src === b && b.trackInfo.originalBpm > 0 ? b.trackInfo : a.trackInfo.originalBpm > 0 ? a.trackInfo : b.trackInfo,
    artist: a.artist || b.artist,
    title: a.title || b.title,
    cover: a.cover || b.cover,
    meterMode: a.meterMode ?? b.meterMode,
    stemMix: a.stemMix ?? b.stemMix,
    stemsOn: a.stemsOn ?? b.stemsOn,
    hasStems: isSeparated(a) || isSeparated(b) ? true : undefined,
    loops,
    activeLoop: a.activeLoop != null && a.activeLoop < loops.length ? a.activeLoop : null,
    tags: tags.length ? tags : undefined,
  };
}

/** "Keep the new one": it takes the place of the existing one (the id and the position stay, so the playlist and the active track are not confused). */
export function replaceItem(existing: PlaylistItem, incoming: PlaylistItem): PlaylistItem {
  return { ...incoming, id: existing.id, addedAt: existing.addedAt };
}
