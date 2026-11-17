/**
 * Recognises the artist and the title of a song from the NAME OF ITS FILE and finds the cover on the internet.
 * It works silently: if anything is not sure or fails (no network, nothing found, a doubtful match), it returns null and nothing is shown.
 *
 * Step 1  parseFileName():  the file name -> candidates (artist, title), junk removed (numbers, "Official Video", "320kbps", site names...).
 *         This is the place of a small language model: lookupTrack() takes any `parse` function that returns candidates, so a model
 *         can replace the rules later without touching the rest.
 * Step 2  MusicBrainz (search of recordings): a candidate counts only if the answer is really similar to it (we do not trust a score alone).
 * Step 3  Cover Art Archive: the front cover of the first release that has one.
 * Privacy: only the cleaned artist and title go to the internet, never the file or its path; the switch is in Settings.
 */

export interface Candidate { artist: string; title: string }
export interface LookupResult { artist: string; title: string; cover: string }   // cover: data URL or ""

const KEY = "beatpractice_online_lookup";
export const loadLookupEnabled = (): boolean => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } };
export const saveLookupEnabled = (v: boolean): void => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* ignore */ } };

// ---------- step 1: the rules ----------
const JUNK = /(?<![\p{L}\p{N}])(official|video|music video|audio|lyrics?|lyric video|clip|hd|hq|4k|1080p|720p|remaster(ed)?( \d{4})?|mp3|flac|wav|m4a|\d{2,3}\s?kbps|kbps|free download|download|full album|visualizer|караоке|текст|скачати|слухати онлайн|без реклами)(?![\p{L}\p{N}])/iu;
const SITE = /(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.(?:com|net|org|ru|ua|me|fm|to|cc|info|biz|su)\b/gi;

export function cleanPiece(s: string): string {
  return s
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—.,:;|]+|[\s\-–—.,:;|]+$/g, "")
    .trim();
}

export function parseFileName(fileName: string): Candidate[] {
  let s = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  s = s.replace(/_/g, " ").replace(SITE, " ").replace(/[\(\[\{]\s*[\)\]\}]/g, " ");
  // brackets: remove those that hold only junk words (keep "(feat. X)", "(Live)", "(Remix)" as part of the title)
  s = s.replace(/[\(\[\{]([^\)\]\}]*)[\)\]\}]/g, (m, inner: string) => (JUNK.test(inner) || /^\s*\d+\s*$/.test(inner) ? " " : m));
  s = s.replace(JUNK, " ").replace(/[\(\[\{]\s*[\)\]\}]/g, " ");
  s = s.replace(/^\s*(?:track\s*)?\d{1,3}\s*[.\-–—)_]\s*/i, "");   // a track number in front: "01. ", "03 - "
  s = s.replace(/^\s*\d{1,3}\s+(?=\D)/, "");                         // "01 Artist - Title"
  s = cleanPiece(s);
  if (!s) return [];

  const out: Candidate[] = [];
  const parts = s.split(/\s+[-–—]\s+|\s*[–—]\s*/).map(cleanPiece).filter(Boolean);
  if (parts.length >= 2) {
    const artist = parts[0];
    const title = parts.slice(1).join(" - ");
    out.push({ artist, title }, { artist: title, title: artist });   // the second one: the order "Title - Artist"
  } else {
    out.push({ artist: "", title: s });
  }
  return out;
}

// ---------- helpers ----------
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\bfeat\.?.*$|\bft\.?.*$/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function sim(a: string, b: string): number {   // 0..1, Dice coefficient on character pairs
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bi = (t: string) => { const m = new Map<string, number>(); for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
  const A = bi(x), B = bi(y); let hit = 0;
  A.forEach((n, g) => { hit += Math.min(n, B.get(g) ?? 0); });
  return (2 * hit) / (Math.max(1, x.length - 1) + Math.max(1, y.length - 1));
}

let lastMb = 0;
async function mbFetch(url: string, signal: AbortSignal): Promise<any> {
  const wait = lastMb + 1100 - Date.now();   // MusicBrainz asks for at most one request per second
  lastMb = Date.now() + Math.max(0, wait);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const r = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("mb " + r.status);
  return r.json();
}

async function imageToCover(blob: Blob, size = 320): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("img")); i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const cv = document.createElement("canvas"); cv.width = size; cv.height = size;
    const ctx = cv.getContext("2d"); if (!ctx) throw new Error("canvas");
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return cv.toDataURL("image/jpeg", 0.86);
  } finally { URL.revokeObjectURL(url); }
}

async function findCover(releaseIds: string[], signal: AbortSignal): Promise<string> {
  for (const id of releaseIds.slice(0, 4)) {
    try {
      const r = await fetch(`https://coverartarchive.org/release/${id}/front-500`, { signal });
      if (!r.ok) continue;
      const blob = await r.blob();
      if (blob.size > 2000 && blob.type.startsWith("image/")) return await imageToCover(blob);
    } catch (e) { if (signal.aborted) throw e; }
  }
  return "";
}

const q = (s: string) => `"${s.replace(/["\\]/g, " ")}"`;

/**
 * Tries the candidates one after another. Returns the first doubtless match, or null.
 * `parse` can be replaced by a model; `signal` cancels everything (the dialog was closed).
 */
export async function lookupTrack(fileName: string, signal: AbortSignal, parse: (name: string) => Candidate[] = parseFileName): Promise<LookupResult | null> {
  try {
    if (!loadLookupEnabled() || typeof fetch !== "function") return null;
    const cands = parse(fileName).slice(0, 2);
    for (const c of cands) {
      const query = c.artist ? `recording:${q(c.title)} AND artist:${q(c.artist)}` : `recording:${q(c.title)}`;
      const data = await mbFetch(`https://musicbrainz.org/ws/2/recording?fmt=json&limit=6&query=${encodeURIComponent(query)}`, signal);
      const recs: any[] = Array.isArray(data?.recordings) ? data.recordings : [];
      for (const rec of recs) {
        const credit = (rec["artist-credit"] ?? []).map((a: any) => (a.name ?? a.artist?.name ?? "") + (a.joinphrase ?? "")).join("").trim();
        const title = String(rec.title ?? "");
        const tSim = sim(title, c.title);
        const aSim = c.artist ? sim(credit, c.artist) : 0.8;   // no artist in the name: the title must then match very well, and we take the artist from the answer
        const strong = c.artist ? tSim >= 0.85 && aSim >= 0.85 : tSim >= 0.95;
        if (!strong || (rec.score ?? 0) < 90 || !credit) continue;
        const releases: any[] = rec.releases ?? [];
        // official albums and singles first
        releases.sort((a, b) => Number(b.status === "Official") - Number(a.status === "Official"));
        const cover = await findCover(releases.map((r) => r.id).filter(Boolean), signal);
        return { artist: credit, title, cover };
      }
    }
  } catch { /* silent by design */ }
  return null;
}
