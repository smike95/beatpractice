/**
 * Recognises the artist and the title of a song from the NAME OF ITS FILE and finds the cover on the internet.
 * It works silently: if anything is not sure or fails (no network, nothing found, a doubtful match), it returns null and nothing is shown.
 *
 * Step 1  parseFileName():  the file name -> candidates (artist, title), junk removed (numbers, "Official Video", "320kbps", site names...).
 *         This is the place of a small language model: lookupTrack() takes any `parse` function that returns candidates, so a model
 *         can replace the rules later without touching the rest.
 * Step 2  MusicBrainz (search of recordings): first by "title + artist", then by the whole cleaned name as free text (it finds names without a
 *         separator and with typos). An answer counts only if its words (artist + title) really cover the words of the file name and the other way round.
 * Step 3  Cover Art Archive: the front cover of a release, then of its release group, then the same for the next best answers.
 *         A song that is recognised but has no cover on the archive still returns its artist and title.
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
    .replace(/[\(\[\{][^\)\]\}]*$/, " ")   // an unclosed bracket at the end (a cut-off name) and what follows it
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—.,:;|]+|[\s\-–—.,:;|]+$/g, "")
    .trim();
}

/** The whole cleaned name as plain words (separators become spaces); used for the free-text search and for checking an answer. */
export function cleanWhole(fileName: string): string {
  const c = parseFileName(fileName)[0];
  return c ? cleanPiece(`${c.artist} ${c.title}`) : "";
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
const words = (s: string) => norm(s).split(" ").filter(Boolean);

function dice(x: string, y: string): number {
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const bi = (t: string) => { const m = new Map<string, number>(); for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
  const A = bi(x), B = bi(y); let hit = 0;
  A.forEach((n, g) => { hit += Math.min(n, B.get(g) ?? 0); });
  return (2 * hit) / (x.length - 1 + y.length - 1);
}
/** Two words are "the same" if equal, if one begins the other (a cut-off name: "Peopl" / "People") or if they are very alike (a typo). */
const sameWord = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a) || dice(a, b) >= 0.8));

/** How well an answer ("artist title") fits the file name: the share of the name's words found in the answer, and of the answer's words found in the name. */
function fit(input: string[], answer: string[]): { inCov: number; resCov: number } {
  if (!input.length || !answer.length) return { inCov: 0, resCov: 0 };
  const inHit = input.filter((w) => answer.some((v) => sameWord(w, v))).length;
  const resHit = answer.filter((v) => input.some((w) => sameWord(w, v))).length;
  return { inCov: inHit / input.length, resCov: resHit / answer.length };
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

async function tryImage(url: string, signal: AbortSignal): Promise<string> {
  try {
    const r = await fetch(url, { signal });
    if (!r.ok) return "";
    const blob = await r.blob();
    return blob.size > 2000 && blob.type.startsWith("image/") ? await imageToCover(blob) : "";
  } catch (e) { if (signal.aborted) throw e; return ""; }
}

/** The front cover of the releases of one recording: the release itself first, then its release group (covers are often filed there). */
async function coverOf(releases: any[], signal: AbortSignal): Promise<string> {
  const list = [...releases].sort((a, b) => Number(b.status === "Official") - Number(a.status === "Official")).slice(0, 6);
  for (const r of list) { if (r.id) { const c = await tryImage(`https://coverartarchive.org/release/${r.id}/front-500`, signal); if (c) return c; } }
  const groups = Array.from(new Set(list.map((r) => r["release-group"]?.id).filter(Boolean))).slice(0, 4) as string[];
  for (const g of groups) { const c = await tryImage(`https://coverartarchive.org/release-group/${g}/front-500`, signal); if (c) return c; }
  return "";
}

const q = (s: string) => `"${s.replace(/["\\]/g, " ")}"`;
const creditOf = (rec: any): string => (rec["artist-credit"] ?? []).map((a: any) => (a.name ?? a.artist?.name ?? "") + (a.joinphrase ?? "")).join("").trim();

/**
 * Finds the song. Returns the best doubtless match, or null. `parse` can be replaced by a model; `signal` cancels everything.
 */
export async function lookupTrack(fileName: string, signal: AbortSignal, parse: (name: string) => Candidate[] = parseFileName): Promise<LookupResult | null> {
  try {
    if (!loadLookupEnabled() || typeof fetch !== "function") return null;
    const cands = parse(fileName).slice(0, 2);
    const whole = cands.length ? cleanPiece(cands[0].artist + " " + cands[0].title) : "";
    const input = words(whole);
    if (!input.length) return null;

    const queries: string[] = [];
    for (const c of cands) if (c.artist) queries.push(`recording:${q(c.title)} AND artist:${q(c.artist)}`);
    queries.push(whole.replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, " "));   // the whole name as free text

    const good = new Map<string, { rec: any; credit: string; score: number }>();
    for (const query of queries) {
      const data = await mbFetch(`https://musicbrainz.org/ws/2/recording?fmt=json&limit=10&query=${encodeURIComponent(query)}`, signal);
      for (const rec of (Array.isArray(data?.recordings) ? data.recordings : [])) {
        const credit = creditOf(rec);
        if (!credit || !rec.title || (rec.score ?? 0) < 70) continue;
        const { inCov, resCov } = fit(input, words(`${credit} ${rec.title}`));
        if (inCov < 0.85 || resCov < 0.6) continue;
        const score = inCov + resCov + (rec.releases?.length ? 0.05 : 0);
        const key = norm(credit + " " + rec.title);
        const old = good.get(key);
        if (!old || score > old.score) good.set(key, { rec, credit, score });
      }
      if (good.size >= 1 && queries.indexOf(query) === 0) break;   // the exact question already answered
    }
    const ranked = Array.from(good.values()).sort((a, b) => b.score - a.score).slice(0, 3);
    if (!ranked.length) return null;
    for (const m of ranked) {
      const cover = await coverOf(m.rec.releases ?? [], signal);
      if (cover) return { artist: m.credit, title: String(m.rec.title), cover };
    }
    // recognised, but no cover on the archive: the text alone is still a result
    return { artist: ranked[0].credit, title: String(ranked[0].rec.title), cover: "" };
  } catch { /* silent by design */ }
  return null;
}
