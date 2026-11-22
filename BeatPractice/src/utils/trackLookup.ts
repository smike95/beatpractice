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

export interface Candidate { artist: string; title: string; weak?: boolean }   // weak: the split into artist and title is only a guess ("artist-title" with no spaces)
export interface LookupResult { artist: string; title: string; cover: string; covers: string[]; exact: boolean }   // cover: the first of covers (data URLs), or ""; exact: the name in the database is the file name word for word

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
  // a bracket that holds only a web address of any ending: "(meloua.com)", "[mp3.pm]"
  s = s.replace(/[\(\[\{]\s*(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\s*[\)\]\}]/gi, " ");
  // brackets: remove those that hold only junk words (keep "(feat. X)", "(Live)", "(Remix)" as part of the title)
  s = s.replace(/[\(\[\{]([^\)\]\}]*)[\)\]\}]/g, (m, inner: string) => (JUNK.test(inner) || /^\s*\d+\s*$/.test(inner) ? " " : m));
  s = s.replace(JUNK, " ").replace(/[\(\[\{]\s*[\)\]\}]/g, " ");
  // an id or a timestamp that downloads put in front or at the end: "17769130660_artist-title", "artist - title 1769130660"
  { const noId = s.replace(/^\s*\d{6,}(?![\p{L}\p{N}])[\s._\-–—)]*/u, "").replace(/[\s._\-–—(\[]*\d{6,}[)\]]?\s*$/u, "");
    if (/[\p{L}]{2}/u.test(noId)) s = noId; }
  // a bracket that only holds an id like [dQw4w9WgXcQ]
  s = s.replace(/[\(\[\{]\s*(?=[\w-]*\d)(?=[\w-]*[A-Za-z])[\w-]{8,14}\s*[\)\]\}]/g, " ");
  s = s.replace(/^\s*(?:track\s*)?\d{1,3}\s*[.\-–—)_]\s*/i, "");   // a track number in front: "01. ", "03 - "
  s = s.replace(/^\s*\d{1,3}\s+(?=\D)/, "");                         // "01 Artist - Title"
  s = cleanPiece(s);
  // a site name glued to the end ("... albinoni SkySound7"): a last word of 7+ signs that mixes letters and digits
  { const m = /^(.*\S)\s+(?=[\p{L}\p{N}]*\p{L})(?=[\p{L}\p{N}]*\p{N})[\p{L}\p{N}]{7,}$/u.exec(s);
    if (m && m[1].split(/\s+/).length >= 3) s = m[1]; }
  if (!s) return [];

  const out: Candidate[] = [];
  const parts = s.split(/\s+[-–—]\s+|\s*[–—]\s*/).map(cleanPiece).filter(Boolean);
  if (parts.length >= 2) {
    const artist = parts[0];
    const title = parts.slice(1).join(" - ");
    out.push({ artist, title }, { artist: title, title: artist });   // the second one: the order "Title - Artist"
  } else {
    // no " - " with spaces: "artist-title" is still the usual form of downloaded files; try both orders (the search decides; "Jay-Z" just fails the field search
    // and is found by the free-text search of the whole name)
    const hy = s.split(/[\-–—]/).map(cleanPiece).filter(Boolean);
    if (!/\s/.test(s) && hy.length === 2) {
      out.push({ artist: hy[0], title: hy[1], weak: true }, { artist: hy[1], title: hy[0], weak: true });
    } else if (!/\s/.test(s) && hy.length >= 3) {
      // "twenty-one-pilots-heathens": the artist is the first one, two, three or four words (the search decides which)
      for (let k = 1; k <= Math.min(4, hy.length - 1); k++) out.push({ artist: hy.slice(0, k).join(" "), title: hy.slice(k).join(" "), weak: true });
    } else out.push({ artist: "", title: s });
  }
  return out;
}

// ---------- exact match ----------
const plainWords = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);

/** The words of a file name for the word-for-word comparison: only numeric codes (ids, track numbers) and web sites are left out. */
export function exactNameWords(fileName: string): string[] {
  let s = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/_/g, " ");
  s = s.replace(/[\(\[\{]\s*(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\s*[\)\]\}]/gi, " ").replace(SITE, " ");
  let ws = plainWords(s).filter((w) => !(/^\d+$/.test(w) && w.length >= 6));   // ids and time stamps
  if (ws.length >= 3 && /^\d{1,3}$/.test(ws[0])) ws = ws.slice(1);              // a track number in front
  return ws;
}

/** Is the name in the database (artist + title, in either order) the file name word for word, apart from numeric codes and web sites? */
export function isExactName(fileName: string, artist: string, title: string): boolean {
  const f = exactNameWords(fileName), a = plainWords(artist), t = plainWords(title);
  if (!f.length || !a.length || !t.length) return false;
  const same = (x: string[], y: string[]) => x.length === y.length && x.every((w, i) => w === y[i]);
  return same(f, [...a, ...t]) || same(f, [...t, ...a]);
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
  // MusicBrainz asks for at most one request per second, and answers 503 / 429 when its servers are busy: wait a little and ask again (twice at most)
  for (let attempt = 0; ; attempt++) {
    const wait = lastMb + 1100 - Date.now();
    lastMb = Date.now() + Math.max(0, wait);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const r = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (r.ok) return r.json();
    if ((r.status === 503 || r.status === 429) && attempt < 2) { await new Promise((res) => setTimeout(res, 2000 * (attempt + 1))); continue; }
    throw new Error("mb " + r.status);
  }
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

/** Release groups of the answers in the order they are worth trying: plain albums and singles first, compilations, live records and the like last. */
function groupsOf(releases: any[]): { gid: string; rid: string }[] {
  const rank = (r: any) => {
    const g = r["release-group"] ?? {};
    const sec: string[] = g["secondary-types"] ?? [];
    const prim = String(g["primary-type"] ?? "");
    return sec.length * 10 + (prim === "Album" || prim === "Single" || prim === "EP" ? 0 : 3) + (r.status === "Official" ? 0 : 1);
  };
  const sorted = releases.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r);
  const seen = new Set<string>(), out: { gid: string; rid: string }[] = [];
  for (const r of sorted) {
    const gid = String(r["release-group"]?.id ?? r.id ?? "");
    if (!gid || seen.has(gid)) continue;
    seen.add(gid); out.push({ gid, rid: String(r.id ?? "") });
  }
  return out.slice(0, 12);
}

/**
 * Front covers of the releases (one per release group, the better kinds of release first), as many as `max`, without repeats.
 * `onCover` is called for each new one, so the first can be shown while the others are still coming.
 */
async function coversOf(releases: any[], signal: AbortSignal, max: number, have: string[], onCover?: (c: string, all: string[]) => void): Promise<void> {
  const urls: string[] = [];
  for (const g of groupsOf(releases)) {
    urls.push(`https://coverartarchive.org/release-group/${g.gid}/front-500`);
    if (g.rid) urls.push(`https://coverartarchive.org/release/${g.rid}/front-500`);
  }
  for (let i = 0; i < urls.length && have.length < max; i += 4) {
    const got = await Promise.all(urls.slice(i, i + 4).map((u) => tryImage(u, signal)));
    for (const c of got) if (c && !have.includes(c) && have.length < max) { have.push(c); onCover?.(c, have); }
  }
}

const q = (s: string) => `"${s.replace(/["\\]/g, " ")}"`;
const creditOf = (rec: any): string => (rec["artist-credit"] ?? []).map((a: any) => (a.name ?? a.artist?.name ?? "") + (a.joinphrase ?? "")).join("").trim();
const STOP = new Set(["the", "a", "an", "and", "of", "feat", "ft", "vs"]);
const sig = (ws: string[]) => ws.filter((w) => !STOP.has(w));
// words that make a recording a different thing (a karaoke copy, a tribute, a remix...) unless the file name has them too
const OTHER = /\b(karaoke|tribute|cover|instrumental|remix|acoustic|live|demo|medley|parody|8[ -]?bit|lullaby|piano version|orchestral|sped up|slowed|reverb|nightcore)\b/i;

export interface LookupOptions {
  parse?: (name: string) => Candidate[];
  /** the artist and the title, as soon as they are known (the covers can take much longer) */
  onText?: (t: { artist: string; title: string; exact: boolean }) => void;
  /** a new cover was found (all so far are in `all`) */
  onCover?: (cover: string, all: string[]) => void;
  /** how many covers to collect: 1 for the quiet background search, more when a person will choose */
  maxCovers?: number;
}

/**
 * Finds the song. Returns the best doubtless match, or null. `parse` can be replaced by a model; `signal` cancels everything.
 */
export async function lookupTrack(fileName: string, signal: AbortSignal, parse: (name: string) => Candidate[] = parseFileName): Promise<LookupResult | null> {
  return (await lookupTrackEx(fileName, signal, { parse, maxCovers: 1 })).result;
}

/**
 * Same as lookupTrack, but: the options give the text and each cover as soon as they are known (a cover search can take a long time and must
 * not hold the text back or lose it), and `completed` says whether the search really got its answers. completed = false means a network error or a
 * timeout, so the caller should try again; completed = true with no result means "searched, nothing sure found".
 */
export async function lookupTrackEx(fileName: string, signal: AbortSignal, opts: LookupOptions = {}): Promise<{ result: LookupResult | null; completed: boolean; reason?: "off" | "net" | "none"; detail?: string }> {
  const parse = opts.parse ?? parseFileName;
  const maxCovers = Math.max(1, opts.maxCovers ?? 8);
  let completed = true;
  let netError = "";
  try {
    if (!loadLookupEnabled() || typeof fetch !== "function") return { result: null, completed: true, reason: "off" };
    const cands = parse(fileName).slice(0, 4);
    const whole = cands.length ? cleanPiece(cands[0].artist + " " + cands[0].title) : "";
    const input = words(whole);
    if (!input.length) return { result: null, completed: true };

    const free = (ws: string[]) => ws.join(" ").replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, " ");
    const structured: string[] = [];
    for (const c of cands) {
      if (!c.artist) continue;
      structured.push(`recording:${q(c.title)} AND artist:${q(c.artist)}`);
      // a cut-off title ("The Beautiful Peopl") or a title with extra words after it ("Anytime Anywhere adagio ..."): the last word as a prefix, then only the first two words
      const tw = words(c.title);
      if (!c.weak && tw.length && tw[tw.length - 1].length >= 3) structured.push(`recording:(${tw.map((w, i) => (i === tw.length - 1 ? w + "*" : w)).join(" AND ")}) AND artist:${q(c.artist)}`);
      if (!c.weak && tw.length > 2) structured.push(`recording:(${tw.slice(0, 2).join(" AND ")}) AND artist:${q(c.artist)}`);
    }
    // the whole name as free text, then the same with the last words left off (junk or a long tail after the song's name)
    const freeQs = [free(input)];
    for (let L = input.length - 1; L >= Math.max(3, input.length - 3) && input.length >= 5; L--) freeQs.push(free(input.slice(0, L)));
    // a name with no clear split goes to the free-text search first; an explicit "artist - title" to the exact search first
    const guessed = cands.length === 0 || cands.every((c) => !c.artist || c.weak);
    const queries = Array.from(new Set(guessed ? [freeQs[0], ...structured, ...freeQs.slice(1)] : [...structured, ...freeQs]));

    const inputS = sig(input);
    const good = new Map<string, { rec: any; credit: string; score: number; exact: boolean }>();
    for (const query of queries) {
      let data: any;
      try { data = await mbFetch(`https://musicbrainz.org/ws/2/recording?fmt=json&limit=25&query=${encodeURIComponent(query)}`, signal); }
      catch (e) { if (signal.aborted) throw e; completed = false; netError = String((e as Error)?.message ?? e); continue; }   // try the next question
      for (const rec of (Array.isArray(data?.recordings) ? data.recordings : [])) {
        const credit = creditOf(rec);
        if (!credit || !rec.title || (rec.score ?? 0) < 40) continue;
        const first = String(rec["artist-credit"]?.[0]?.name ?? rec["artist-credit"]?.[0]?.artist?.name ?? credit);
        const tw = words(String(rec.title)), pw = words(first), cw = words(credit);
        // the artist (the first credited one) and the whole title must be in the file name; a stranger's version of the song is not this song
        const artistIn = sig(pw).length > 0 && sig(pw).every((w) => inputS.some((v) => sameWord(w, v)));
        const titleIn = sig(tw).length > 0 && sig(tw).every((w) => inputS.some((v) => sameWord(w, v)));
        if (!artistIn || !titleIn) continue;
        const ans = sig([...cw, ...tw]);
        const covered = inputS.filter((w) => ans.some((v) => sameWord(w, v))).length / Math.max(1, inputS.length);   // how much of the file name the answer explains
        const extra = ans.filter((v) => !inputS.some((w) => sameWord(w, v))).length / Math.max(1, ans.length);          // answer words the file name does not have
        // the file name is explained (almost) fully, or it has a long tail (a second title, a site, a note) and the answer holds the rest
        if (!(covered >= 0.85 || (covered >= 0.4 && inputS.length >= 5))) continue;
        const text = `${credit} ${rec.title} ${rec.disambiguation ?? ""}`;
        if (OTHER.test(text) && !OTHER.test(whole)) continue;   // a karaoke copy, a tribute, a remix... that the file name does not ask for
        const exact = isExactName(whole, credit, String(rec.title)) || isExactName(fileName, credit, String(rec.title));
        const score = covered * 2 - extra + Math.min(10, rec.releases?.length ?? 0) * 0.02 - (rec.disambiguation ? 0.15 : 0) + (exact ? 5 : 0);
        const key = norm(credit + " " + rec.title);
        const old = good.get(key);
        if (!old || score > old.score) good.set(key, { rec, credit, score, exact });
      }
      if (good.size >= 1) break;   // this question already answered
    }
    const ranked = Array.from(good.values()).sort((a, b) => b.score - a.score).slice(0, 4);
    if (!ranked.length) return { result: null, completed, reason: completed ? "none" : "net", detail: netError };
    const best = ranked[0];
    const text = { artist: best.credit, title: String(best.rec.title) };
    opts.onText?.({ ...text, exact: best.exact });   // the text is known now; the covers may still take a while
    const covers: string[] = [];
    try {
      // the releases of the best answer first, then those of the others (the same song as a single, on an album, on a compilation...)
      for (const m of ranked) { if (covers.length >= maxCovers) break; await coversOf(m.rec.releases ?? [], signal, maxCovers, covers, opts.onCover); }
    } catch { completed = false; }   // the cover search was cut off: the text and what was found are still a result
    return { result: { ...text, cover: covers[0] ?? "", covers, exact: best.exact }, completed };
  } catch { completed = false; /* silent by design */ }
  return { result: null, completed, reason: "net", detail: netError };
}
