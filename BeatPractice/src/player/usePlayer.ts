import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onFilesOpened, pickAudioFiles, pickFolder } from "../platform";
import { BC, Caps, core, InitInfo, Snapshot, SongData, StemsInfo } from "../core";
import { AudioTrackInfo, LoopRange, LoopSlot, MetronomeConfig, PlayMode, PlaylistItem, PlaylistTag, StemMix } from "../types";
import { getOwnerId } from "../utils/license";
import { DupChoice, findDuplicate, mergeItems, replaceItem } from "./duplicates";
import { barStartTimes, computeSections, TempoSection, tempoVaries } from "../utils/sections";

const AUDIO_EXTS = ["mp3", "wav", "flac", "ogg", "beatpack", "beatlib"];
const STORE_KEY = "rt_playlist_v1";
const NO_LOOP: LoopRange = { active: false, start: 0, end: 0 };
export const MAX_LOOPS = 3;
const MAX_STEMS = 8;
const defaultMix = (): StemMix => ({
  gain: Array(MAX_STEMS).fill(1),
  mute: Array(MAX_STEMS).fill(false),
  solo: Array(MAX_STEMS).fill(false),
});
/** the level that actually goes to the core: mute and solo applied */
function effectiveGain(mix: StemMix, i: number): number {
  const anySolo = mix.solo.some(Boolean);
  if (mix.mute[i]) return 0;
  if (anySolo && !mix.solo[i]) return 0;
  return mix.gain[i];
}
const MODE_KEY = "rt_playmode_v1";
const SOUND_KEY = "rt_clicksound_v1";
const TAGS_KEY = "rt_tags_v1";
const TAG_ORDER_KEY = "rt_tagorder_v1";   // { tagId: [trackId, ...] }: the order of the tracks inside each tag
const TAG_VIEW_KEY = "rt_tagview_v1";     // the tag whose list is shown (null = the whole playlist)

function loadTags(): PlaylistTag[] {
  try {
    const j = JSON.parse(localStorage.getItem(TAGS_KEY) || "[]");
    if (Array.isArray(j)) return j.filter((t) => t && typeof t.id === "string" && typeof t.name === "string");
  } catch { /* ignore */ }
  return [];
}
function loadTagOrder(): Record<string, string[]> {
  try {
    const j = JSON.parse(localStorage.getItem(TAG_ORDER_KEY) || "{}");
    if (j && typeof j === "object" && !Array.isArray(j)) {
      const out: Record<string, string[]> = {};
      for (const k of Object.keys(j)) if (Array.isArray(j[k])) out[k] = j[k].filter((x: unknown) => typeof x === "string");
      return out;
    }
  } catch { /* ignore */ }
  return {};
}
const sameTag = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

function loadStored(): { items: PlaylistItem[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if (Array.isArray(j.items)) {
        const items = j.items.map((it: any) => {
          if (Array.isArray(it.loops)) return it;
          const old = it.loop;
          const has = old && old.end > old.start;
          const { loop: _drop, ...rest } = it;
          return { ...rest, loops: has ? [{ start: old.start, end: old.end }] : [], activeLoop: has && old.active ? 0 : null };
        });
        return { items, activeId: j.activeId ?? null };
      }
    }
  } catch {
    /* ignore */
  }
  return { items: [], activeId: null };
}

function fileName(path: string): string {
  const n = path.split(/[\\/]/).pop() ?? path;
  return n.replace(/\.[^.]+$/, "");
}

function isAudio(path: string): boolean {
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  return AUDIO_EXTS.includes(ext);
}

/** "Artist — Title" when the user filled them in, otherwise the file name */
export function displayName(it: { name: string; artist?: string; title?: string }): string {
  const a = (it.artist ?? "").trim(), t = (it.title ?? "").trim();
  if (a && t) return `${a} — ${t}`;
  return t || a || it.name;
}

function lastLE(arr: number[], t: number): number {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

function mostCommonBarLength(data: SongData): number {
  const counts = new Map<number, number>();
  for (let i = 0; i < data.posInBar.length; i++) {
    if (data.posInBar[i] === 1) counts.set(data.barLength[i], (counts.get(data.barLength[i]) ?? 0) + 1);
  }
  let best = 4;
  let bestN = 0;
  counts.forEach((n, len) => {
    if (n > bestN) {
      best = len;
      bestN = n;
    }
  });
  return best;
}

/** A track that looks like one already in the playlist, waiting for the user's decision. */
export interface DupAsk {
  existing: PlaylistItem;
  incoming: PlaylistItem;
  index: number;   // which duplicate of this batch it is
  total: number;   // how many duplicates the batch has
}

/** A new loop that shares bars with existing loops, waiting for the user's decision. */
export interface LoopChoice {
  start: number;
  end: number;
  hits: number[];                 // indices of the existing loops it shares bars with
  origin: "drag" | "add";
}

/** Indices of the loops that share at least some bars with start..end (loops that only touch at a bar line do not count). */
function overlappingLoops(loops: LoopSlot[], start: number, end: number): number[] {
  const out: number[] = [];
  loops.forEach((l, i) => { if (Math.min(l.end, end) - Math.max(l.start, start) > 0.02) out.push(i); });
  return out;
}

export function usePlayer() {
  const [init, setInit] = useState<InitInfo | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [song, setSong] = useState<SongData | null>(null);
  const [songReady, setSongReady] = useState(false);
  const [message, setMessage] = useState("");
  const stored = useMemo(loadStored, []);
  const [playlist, setPlaylist] = useState<PlaylistItem[]>(stored.items);
  const [activeId, setActiveId] = useState<string | null>(stored.activeId);
  const [metronomeConfig, setMetronomeConfigState] = useState<MetronomeConfig>({
    enabled: true,
    volume: 1.15,
    accentFirstBeat: false,
    countInBars: 0,
    countInOnLoop: false,
    quietEnabled: false,
    quietClickBars: 2,
    quietBars: 1,
  });
  const [trackVolume, setTrackVolume] = useState(0.85);
  const [isTrackMuted, setIsTrackMuted] = useState(false);
  const [loops, setLoops] = useState<LoopSlot[]>([]);
  const [activeLoop, setActiveLoop] = useState<number | null>(null);
  const [selectedLoop, setSelectedLoop] = useState(0);
  // a new loop that shares bars with existing ones waits here until the user decides (new loop / change one of the hit loops)
  const [loopChoice, setLoopChoice] = useState<LoopChoice | null>(null);
  const [caps, setCaps] = useState<Caps>({ clickSounds: 0, countInBeats: false, stems: false, meterModes: false });
  const [stemsInfo, setStemsInfo] = useState<StemsInfo | null>(null);
  const [stemMix, setStemMixState] = useState<StemMix>(defaultMix());
  const [stemsStartedAt, setStemsStartedAt] = useState<number>(0);
  const stemsLoadedFor = useRef<string | null>(null);
  const [playMode, setPlayModeState] = useState<PlayMode>(() => {
    const v = localStorage.getItem(MODE_KEY);
    return v === "repeat" || v === "next" ? v : "stop";
  });
  const [clickSound, setClickSoundState] = useState<number>(() => Number(localStorage.getItem(SOUND_KEY) ?? 0) || 0);

  const requestedId = useRef<string | null>(null);
  const handledId = useRef<string | null>(null);
  const autoPlayId = useRef<string | null>(null); // start playing as soon as this track is ready
  const wasPlaying = useRef(false);
  const playModeRef = useRef<PlayMode>(playMode);
  playModeRef.current = playMode;
  const opening = useRef(false);
  // Which snapshot belongs to which opened track: the core has no track id, so snapshots are numbered.
  // A READY snapshot is trusted only if its request started after core.openFile() returned for the requested track
  // (otherwise it is the previous track's snapshot and its tempo / length would land on the new track).
  const pollSeq = useRef(0);        // number of the latest snapshot request that was started
  const snapSeq = useRef(0);        // number of the request that produced the current `snap`
  const freshFrom = useRef(0);      // the first request number that already reflects the requested track
  const openGen = useRef(0);        // grows with every track opening; stale async work compares against it
  const playlistRef = useRef(playlist);
  playlistRef.current = playlist;

  // ---- start-up: find the core --------------------------------------------------------------
  useEffect(() => {
    core.init().then(setInit).catch((e) => setMessage(String(e)));
  }, []);

  const chooseCoreDir = useCallback(async () => {
    const dir = await pickFolder("Оберіть теку beat-core");
    if (!dir) return;
    try {
      await core.load(dir);
      setInit({ loaded: true, dir, error: null });
      setMessage("");
    } catch (e) {
      setInit({ loaded: false, dir, error: String(e) });
    }
  }, []);

  // ---- polling (~30 Hz) ----------------------------------------------------------------------
  useEffect(() => {
    if (!init?.loaded) return;
    let stop = false;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const my = ++pollSeq.current;
        const s = await core.snapshot();
        if (!stop) { snapSeq.current = my; setSnap(s); }
      } catch (e) {
        if (!stop) setMessage(String(e));
      } finally {
        busy = false;
      }
    };
    const id = setInterval(tick, 33);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [init?.loaded]);

  // ---- persistence of the playlist -------------------------------------------------------------
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ items: playlist, activeId }));
    } catch {
      /* ignore */
    }
  }, [playlist, activeId]);

  const setPlayMode = useCallback((m: PlayMode) => {
    setPlayModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
  }, []);
  const setClickSound = useCallback((id: number) => {
    setClickSoundState(id);
    try { localStorage.setItem(SOUND_KEY, String(id)); } catch { /* ignore */ }
    core.setClickSound(id).catch(() => {});
  }, []);
  // what can the loaded core do?
  useEffect(() => {
    if (!init?.loaded) return;
    core.caps().then(setCaps).catch(() => setCaps({ clickSounds: 0, countInBeats: false, stems: false, meterModes: false }));
  }, [init?.loaded]);

  // a pack from another owner: shown until the user confirms
  const [packNotice, setPackNotice] = useState<{ owner: string; title: string } | null>(null);

  // ---- tags of the tracks -----------------------------------------------------------------------
  const [tags, setTags] = useState<PlaylistTag[]>(loadTags);
  const tagsRef = useRef<PlaylistTag[]>(tags);
  useEffect(() => {
    tagsRef.current = tags;
    try { localStorage.setItem(TAGS_KEY, JSON.stringify(tags)); } catch { /* ignore */ }
  }, [tags]);

  /** Makes a tag (or finds the one with the same name) and returns its id; null for an empty name. */
  const createTag = useCallback((name: string): string | null => {
    const n = name.trim().slice(0, 32);
    if (!n) return null;
    const found = tagsRef.current.find((t) => sameTag(t.name, n));
    if (found) return found.id;
    const tag: PlaylistTag = { id: `tag_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: n };
    tagsRef.current = [...tagsRef.current, tag];
    setTags(tagsRef.current);
    return tag.id;
  }, []);
  const renameTag = useCallback((id: string, name: string): boolean => {
    const n = name.trim().slice(0, 32);
    if (!n || tagsRef.current.some((t) => t.id !== id && sameTag(t.name, n))) return false;
    tagsRef.current = tagsRef.current.map((t) => (t.id === id ? { ...t, name: n } : t));
    setTags(tagsRef.current);
    return true;
  }, []);
  /** Deletes the tag and takes it off every track that had it. */
  const deleteTag = useCallback((id: string) => {
    tagsRef.current = tagsRef.current.filter((t) => t.id !== id);
    setTags(tagsRef.current);
    setPlaylist((prev) => prev.map((it) => (it.tags?.includes(id) ? { ...it, tags: it.tags.filter((x) => x !== id) } : it)));
    setTagOrder((o) => { const { [id]: _gone, ...rest } = o; return rest; });
    setTagViewState((v) => (v === id ? null : v));
  }, []);
  const toggleItemTag = useCallback((itemId: string, tagId: string) => {
    setPlaylist((prev) => prev.map((it) => {
      if (it.id !== itemId) return it;
      const cur = it.tags ?? [];
      return { ...it, tags: cur.includes(tagId) ? cur.filter((x) => x !== tagId) : [...cur, tagId] };
    }));
  }, []);
  const addTagToItem = useCallback((itemId: string, name: string) => {
    const id = createTag(name);
    if (!id) return;
    setPlaylist((prev) => prev.map((it) => (it.id === itemId && !(it.tags ?? []).includes(id) ? { ...it, tags: [...(it.tags ?? []), id] } : it)));
  }, [createTag]);

  // ---- a tag as a saved list: the tracks that have it, in the order the user gave them inside this tag ----
  const [tagOrder, setTagOrder] = useState<Record<string, string[]>>(loadTagOrder);
  const [tagView, setTagViewState] = useState<string | null>(() => {
    try { return localStorage.getItem(TAG_VIEW_KEY); } catch { return null; }
  });
  useEffect(() => { try { localStorage.setItem(TAG_ORDER_KEY, JSON.stringify(tagOrder)); } catch { /* ignore */ } }, [tagOrder]);
  useEffect(() => {
    try { if (tagView) localStorage.setItem(TAG_VIEW_KEY, tagView); else localStorage.removeItem(TAG_VIEW_KEY); } catch { /* ignore */ }
  }, [tagView]);
  const activeTagView = tagView && tags.some((t) => t.id === tagView) ? tagView : null;   // a deleted tag is no view
  /** The list that is shown (and played in order): the whole playlist, or the tracks of the chosen tag in their own order. */
  const viewList = useMemo(() => {
    if (!activeTagView) return playlist;
    const own = playlist.filter((it) => (it.tags ?? []).includes(activeTagView));
    const order = tagOrder[activeTagView] ?? [];
    const rank = (id: string) => { const k = order.indexOf(id); return k < 0 ? Number.MAX_SAFE_INTEGER : k; };
    return own.map((it, i) => ({ it, i })).sort((x, y) => rank(x.it.id) - rank(y.it.id) || x.i - y.i).map((x) => x.it);   // tracks without a place keep the playlist order, after the placed ones
  }, [playlist, tagOrder, activeTagView]);
  const tagOrderRef = useRef(tagOrder);
  tagOrderRef.current = tagOrder;
  const viewListRef = useRef<PlaylistItem[]>(viewList);
  viewListRef.current = viewList;
  /** The tracks that have the tag, in the order they have inside it. */
  const listForTag = useCallback((tagId: string): PlaylistItem[] => {
    const own = playlistRef.current.filter((it) => (it.tags ?? []).includes(tagId));
    const order = tagOrderRef.current[tagId] ?? [];
    const rank = (id: string) => { const k = order.indexOf(id); return k < 0 ? Number.MAX_SAFE_INTEGER : k; };
    return own.map((it, i) => ({ it, i })).sort((x, y) => rank(x.it.id) - rank(y.it.id) || x.i - y.i).map((x) => x.it);
  }, []);
  const setTagView = useCallback((id: string | null) => setTagViewState(id), []);
  /** Moves a track inside the list of the chosen tag (the order of the whole playlist stays as it is). */
  const reorderInTag = useCallback((from: number, to: number) => {
    const tagId = activeTagView;
    const ids = viewListRef.current.map((it) => it.id);
    if (!tagId || from < 0 || from >= ids.length || to < 0 || to >= ids.length || from === to) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    setTagOrder((o) => ({ ...o, [tagId]: ids }));
  }, [activeTagView]);

  const patchItem = useCallback((id: string, patch: (it: PlaylistItem) => PlaylistItem) => {
    setPlaylist((prev) => prev.map((it) => (it.id === id ? patch(it) : it)));
  }, []);

  // ---- opening tracks -------------------------------------------------------------------------
  const openTrack = useCallback(async (item: PlaylistItem) => {
    requestedId.current = item.id;
    handledId.current = null;
    opening.current = true;
    openGen.current += 1;
    freshFrom.current = Number.MAX_SAFE_INTEGER;   // nothing is trusted until the core has accepted the file
    setSong(null);
    setSongReady(false);
    setLoops([]);
    setActiveLoop(null);
    setLoopChoice(null);
    setMessage("");
    try {
      const ok = await core.openFile(item.path);
      if (!ok) setMessage("Не вдалося відкрити файл (ядро зайняте або файл недоступний).");
    } catch (e) {
      setMessage(String(e));
    } finally {
      freshFrom.current = pollSeq.current + 1;       // only requests started from now on describe this track
      opening.current = false;
    }
  }, []);

  // open the remembered track once the core is available
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!init?.loaded || autoOpened.current) return;
    autoOpened.current = true;
    const item = playlistRef.current.find((p) => p.id === activeId);
    if (item) void openTrack(item);
  }, [init?.loaded, activeId, openTrack]);

  // when the core reports READY for the requested track: fetch data, apply the track's settings
  useEffect(() => {
    if (!snap || snap.state !== BC.READY) return;
    const id = requestedId.current;
    if (!id || opening.current || handledId.current === id) return;
    if (snapSeq.current < freshFrom.current) return;   // still the previous track's READY snapshot
    handledId.current = id;
    const s = snap;
    const gen = openGen.current;
    const stale = () => requestedId.current !== id || openGen.current !== gen;   // the user has switched tracks meanwhile
    (async () => {
      try {
        const item = playlistRef.current.find((p) => p.id === id);
        await core.setMeterMode(item?.meterMode ?? 0).catch(() => false);   // re-reads the saved analysis: fast
        if (stale()) return;
        const data = await core.songData();
        if (stale()) return;
        const speed = item?.speed ?? 1;
        await core.setSpeed(speed);
        if (stale()) return;
        const slots = item?.loops ?? [];
        const act = item?.activeLoop ?? null;
        setLoops(slots);
        setSelectedLoop(0);
        if (act !== null && slots[act] && slots[act].end > slots[act].start) {
          const ok = await core.setLoop(slots[act].start, slots[act].end);
          if (stale()) return;
          setActiveLoop(ok ? act : null);
        } else {
          await core.clearLoop();
          if (stale()) return;
          setActiveLoop(null);
        }
        // a .beatpack brings its own title, loops and owner
        const pk = await core.packInfo();
        if (stale()) return;
        if (pk.isPack) {
          const mine = getOwnerId();
          if (pk.owner && mine && pk.owner !== mine) setPackNotice({ owner: pk.owner, title: pk.title || item?.name || "" });
          if (item) {
            const imported: LoopSlot[] = item.loops.length === 0 && pk.loops
              ? pk.loops.slice(0, MAX_LOOPS).filter((l) => l.end > l.start).map((l) => ({ start: l.start, end: l.end, ...(l.name ? { name: l.name } : {}) }))
              : [];
            patchItem(id, (it) => ({
              ...it,
              title: it.title || pk.title || undefined,
              artist: it.artist || pk.artist || undefined,
              loops: imported.length ? imported : it.loops,
            }));
            if (imported.length) setLoops(imported);
          }
        }
        setSong(data);
        if (item) {
          const len = mostCommonBarLength(data);
          patchItem(id, (it) => ({
            ...it,
            trackInfo: {
              ...it.trackInfo,
              duration: s.duration,
              originalBpm: Math.round(s.songBpm),
              originalBpmExact: Math.round(s.songBpm * 10) / 10,
              currentBpm: Math.round(s.songBpm * speed),
              timeSignature: `${len}/4`,
            },
          }));
        }
        setSongReady(true);
        if (autoPlayId.current === id) {
          autoPlayId.current = null;
          await core.play();
        }
      } catch (e) {
        setMessage(String(e));
      }
    })();
  }, [snap, patchItem]);

  // push mixer / metronome settings to the core whenever they change (or a song becomes ready)
  useEffect(() => {
    if (!songReady) return;
    core.setMetronome(metronomeConfig.enabled, metronomeConfig.volume, metronomeConfig.accentFirstBeat).catch(() => {});
    core.setCountIn(metronomeConfig.countInBars, metronomeConfig.countInOnLoop).catch(() => {});
    core.setQuietBars(metronomeConfig.quietEnabled, metronomeConfig.quietClickBars, metronomeConfig.quietBars + (metronomeConfig.quietContinue ? 100 : 0)).catch(() => {});
    core.setSongVolume(isTrackMuted ? 0 : trackVolume).catch(() => {});
  }, [songReady, metronomeConfig, trackVolume, isTrackMuted]);

  useEffect(() => {
    if (songReady && caps.clickSounds > 0) core.setClickSound(clickSound).catch(() => {});
  }, [songReady, caps.clickSounds, clickSound]);

  // ---- derived values -------------------------------------------------------------------------
  const activeItem = playlist.find((p) => p.id === activeId) ?? null;
  const ready = songReady && snap?.state === BC.READY;
  const loading = snap?.state === BC.DECODING || snap?.state === BC.ANALYZING;
  const sections: TempoSection[] = useMemo(
    () => (song && snap ? computeSections(song.times, song.posInBar, song.barLength, snap.duration) : []),
    [song, snap?.duration], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const barTimes = useMemo(() => (song ? barStartTimes(song.times, song.posInBar) : []), [song]);
  const variableTempo = useMemo(() => (song ? tempoVaries(song.times, song.posInBar, song.barLength) : false), [song]);
  // bar lengths present in the song, most frequent first (e.g. ["4/4", "3/4"]); "variable" if a second length is more than noise
  const meters = useMemo(() => {
    if (!song) return [] as { len: number; n: number }[];
    const counts = new Map<number, number>();
    for (let i = 0; i < song.posInBar.length; i++) if (song.posInBar[i] === 1) counts.set(song.barLength[i], (counts.get(song.barLength[i]) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([len, n]) => ({ len, n }));
  }, [song]);
  const variableMeter = useMemo(() => {
    const total = meters.reduce((a, m) => a + m.n, 0);
    return meters.length > 1 && total > 0 && (total - meters[0].n >= 3) && (total - meters[0].n) / total >= 0.04;
  }, [meters]);
  const meterLabels = useMemo(() => meters.map((m) => `${m.len}/4`), [meters]);
  const loop: LoopRange =
    activeLoop !== null && loops[activeLoop]
      ? { active: true, start: loops[activeLoop].start, end: loops[activeLoop].end }
      : NO_LOOP;

  const track: (AudioTrackInfo & {
    sections: TempoSection[]; bpmExact: number; variableTempo: boolean; variableMeter: boolean;
    meterLabels: string[]; originalBpmExact: number; displayName: string; fileName: string; artist: string; title: string; cover: string;
  }) | null = activeItem
    ? {
        name: activeItem.name,
        fileName: activeItem.name,
        artist: activeItem.artist ?? "",
        title: activeItem.title ?? "",
        cover: activeItem.cover ?? "",
        displayName: displayName(activeItem),
        originalBpmExact: ready && snap ? Math.round(snap.songBpm * 10) / 10 : activeItem.trackInfo.originalBpmExact ?? activeItem.trackInfo.originalBpm,
        meterLabels,
        duration: ready && snap ? snap.duration : activeItem.trackInfo.duration,
        originalBpm: ready && snap ? Math.round(snap.songBpm) : activeItem.trackInfo.originalBpm,
        currentBpm: ready && snap ? Math.round(snap.songBpm * snap.speed) : activeItem.trackInfo.currentBpm,
        timeSignature:
          ready && snap?.beat ? `${snap.beat.barLength}/4` : activeItem.trackInfo.timeSignature,
        sections,
        bpmExact: ready && snap ? snap.songBpm * snap.speed : activeItem.trackInfo.currentBpm,
        variableTempo,
        variableMeter,
      }
    : null;

  // ---- actions --------------------------------------------------------------------------------
  // Count-in switched off for one start (resuming in the middle with "count-in only at the start"); put back as soon as the sound runs.
  const countInHeld = useRef(false);
  useEffect(() => {
    if (snap?.playing && countInHeld.current) {
      countInHeld.current = false;
      core.setCountIn(metronomeConfig.countInBars, metronomeConfig.countInOnLoop).catch(() => {});
    }
  }, [snap?.playing]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Play: with an active loop it starts at the loop start, unless the paused position is inside the loop (then it just goes on). */
  const togglePlay = useCallback(async () => {
    if (!ready || !snap) return;
    if (snap.playing) { await core.pause(); return; }
    let pos = snap.position;
    if (loop.active && (pos < loop.start - 0.01 || pos >= loop.end - 0.01)) { pos = loop.start; await core.seek(pos); }
    if (metronomeConfig.countInBars > 0 && metronomeConfig.countInOnlyAtStart) {
      const startPos = loop.active ? loop.start : 0;
      const firstBar = loop.active ? loop.start : (barTimes[0] ?? 0);
      const atStart = pos <= startPos + 0.3 || pos <= firstBar + 0.05;
      if (!atStart) { countInHeld.current = true; await core.setCountIn(0, metronomeConfig.countInOnLoop).catch(() => {}); }
    }
    await core.play();
  }, [ready, snap, loop, metronomeConfig, barTimes]);

  // While the rhythm is still being analysed the original song can already be played.
  const togglePreview = useCallback(async () => {
    if (!snap || snap.state !== BC.ANALYZING || snap.duration <= 0) return;
    if (snap.playing) await core.pause();
    else await core.play();
  }, [snap]);

  const seek = useCallback((t: number) => {
    core.seek(Math.max(0, t)).catch(() => {});
  }, []);

  // "To the start": while playing this is pause + seek + play, so the count-in (if switched on) is played again.
  const restart = useCallback(async () => {
    const t = loop.active ? loop.start : 0;
    if (snap?.playing) {
      await core.pause();
      await core.seek(t);
      await core.play();
    } else {
      await core.seek(t);
    }
  }, [loop, snap?.playing]);

  const changeBpm = useCallback(
    (bpm: number) => {
      if (!ready || !snap || snap.songBpm <= 0 || !activeId) return;
      const ratio = Math.min(2, Math.max(0.25, bpm / snap.songBpm));
      core.setSpeed(ratio).catch(() => {});
      patchItem(activeId, (it) => ({ ...it, speed: ratio }));
    },
    [ready, snap, activeId, patchItem],
  );

  const resetBpm = useCallback(() => {
    if (!ready || !activeId) return;
    core.setSpeed(1).catch(() => {});
    patchItem(activeId, (it) => ({ ...it, speed: 1 }));
  }, [ready, activeId, patchItem]);

  const persistLoops = useCallback(
    (next: LoopSlot[], act: number | null) => {
      if (activeId) patchItem(activeId, (it) => ({ ...it, loops: next, activeLoop: act }));
    },
    [activeId, patchItem],
  );

  /** Switch the loop with this index on (null = off). Only one loop plays at a time. */
  const activateLoop = useCallback(
    async (idx: number | null) => {
      if (!ready || !activeId) return;
      if (idx === null) {
        await core.clearLoop();
        setActiveLoop(null);
        persistLoops(loops, null);
        return;
      }
      const slot = loops[idx];
      if (!slot) return;
      const ok = await core.setLoop(slot.start, slot.end);
      if (!ok) {
        setMessage("Ядро не прийняло цикл (завеликий або замалий).");
        return;
      }
      setActiveLoop(idx);
      setSelectedLoop(idx);
      persistLoops(loops, idx);
      await core.seek(slot.start).catch(() => {});     // playback goes to the loop at once (the previous loop is replaced in the core)
    },
    [ready, activeId, loops, persistLoops],
  );

  const updateLoop = useCallback(
    async (idx: number, slot: LoopSlot) => {
      if (!ready) return;
      const next = loops.map((l, i) => (i === idx ? slot : l));
      setLoops(next);
      if (activeLoop === idx) {
        const ok = await core.setLoop(slot.start, slot.end);
        if (!ok) setMessage("Ядро не прийняло цикл (завеликий або замалий).");
      }
      persistLoops(next, activeLoop);
    },
    [ready, loops, activeLoop, persistLoops],
  );

  /** Puts a loop from the "+" button into the list: `target` is "new" or the index of the loop it replaces. */
  const applyAddLoop = useCallback(
    async (slot: LoopSlot, target: "new" | number) => {
      const makeNew = target === "new";
      if (makeNew && loops.length >= MAX_LOOPS) return;
      if (!makeNew && !loops[target]) return;
      const idx = makeNew ? loops.length : target;
      const put: LoopSlot = makeNew || !loops[idx]?.name ? slot : { ...slot, name: loops[idx].name };   // a changed loop keeps its name
      const next = makeNew ? [...loops, put] : loops.map((l, i) => (i === idx ? put : l));
      setLoops(next);
      setSelectedLoop(idx);
      if (activeLoop === idx) {
        const ok = await core.setLoop(put.start, put.end);
        if (!ok) setMessage("Ядро не прийняло цикл (завеликий або замалий).");
      }
      persistLoops(next, activeLoop);
    },
    [loops, activeLoop, persistLoops],
  );

  /** New loop: the current bar and the next three bars. If it shares bars with existing loops, the user is asked first. */
  const addLoop = useCallback(() => {
    if (!ready || !snap || loops.length >= MAX_LOOPS || barTimes.length === 0) return;
    const bi = Math.max(0, lastLE(barTimes, snap.position));
    const endBar = Math.min(barTimes.length, bi + 4);
    const slot: LoopSlot = { start: barTimes[bi], end: endBar < barTimes.length ? barTimes[endBar] : snap.duration };
    const hits = overlappingLoops(loops, slot.start, slot.end);
    if (hits.length > 0) { setLoopChoice({ start: slot.start, end: slot.end, hits, origin: "add" }); return; }
    void applyAddLoop(slot, "new");
  }, [ready, snap, loops, barTimes, applyAddLoop]);

  const removeLoop = useCallback(
    async (idx: number) => {
      const next = loops.filter((_, i) => i !== idx);
      let act = activeLoop;
      if (act === idx) {
        act = null;
        await core.clearLoop();
      } else if (act !== null && act > idx) {
        act -= 1;
      }
      setLoops(next);
      setActiveLoop(act);
      setSelectedLoop(Math.max(0, Math.min(selectedLoop, next.length - 1)));
      persistLoops(next, act);
    },
    [loops, activeLoop, selectedLoop, persistLoops],
  );

  /** Puts a loop dragged on the waveform into the list: `target` is "new" or the index of the loop it replaces; it becomes the active loop. */
  const applyDragLoop = useCallback(
    async (start: number, end: number, target: "new" | number) => {
      if (!ready || !activeId) return;
      const makeNew = target === "new";
      if (makeNew && loops.length >= MAX_LOOPS) return;
      if (!makeNew && !loops[target]) return;
      const idx = makeNew ? loops.length : target;
      const slot: LoopSlot = makeNew ? { start, end } : { start, end, ...(loops[idx]?.name ? { name: loops[idx].name } : {}) };   // a replaced loop keeps its name
      const ok = await core.setLoop(start, end);
      if (!ok) {
        setMessage("Ядро не прийняло цикл (завеликий або замалий).");
        return;
      }
      const next = makeNew ? [...loops, slot] : loops.map((l, i) => (i === idx ? slot : l));
      setLoops(next);
      setSelectedLoop(idx);
      setActiveLoop(idx);
      persistLoops(next, idx);
      await core.seek(start).catch(() => {});
    },
    [ready, activeId, loops, persistLoops],
  );

  /**
   * A loop dragged on the waveform becomes a NEW loop while there is room for one (up to MAX_LOOPS); when they are all taken it replaces the selected one.
   * If it shares bars with existing loops, the user is asked first: a new loop, or change one of the loops it touches.
   */
  const dragLoop = useCallback(
    async (start: number, end: number) => {
      if (!ready || !activeId) return;
      const hits = overlappingLoops(loops, start, end);
      if (hits.length > 0) { setLoopChoice({ start, end, hits, origin: "drag" }); return; }
      await applyDragLoop(start, end, loops.length < MAX_LOOPS ? "new" : Math.min(selectedLoop, loops.length - 1));
    },
    [ready, activeId, loops, selectedLoop, applyDragLoop],
  );

  /** The user's answer to the question about a loop that shares bars: "new", the index of the loop to change, or null = cancel. */
  const resolveLoopChoice = useCallback(
    async (answer: "new" | number | null) => {
      const c = loopChoice;
      setLoopChoice(null);
      if (!c || answer === null) return;
      if (c.origin === "drag") await applyDragLoop(c.start, c.end, answer);
      else await applyAddLoop({ start: c.start, end: c.end }, answer);
    },
    [loopChoice, applyDragLoop, applyAddLoop],
  );

  const jumpBar = useCallback(
    (dir: -1 | 1) => {
      if (!ready || !snap || barTimes.length === 0) return;
      const pos = snap.position;
      const minBound = loop.active ? loop.start : 0;
      if (dir > 0) {
        const next = barTimes.find((t) => t > pos + 0.05);
        if (next !== undefined) seek(next);
      } else {
        let idx = -1;
        for (let i = 0; i < barTimes.length; i++) if (barTimes[i] <= pos - 0.4) idx = i;
        seek(Math.max(minBound, idx >= 0 ? barTimes[idx] : 0));
      }
    },
    [ready, snap, barTimes, loop, seek],
  );

  const selectTrack = useCallback(
    (item: PlaylistItem) => {
      if (item.id === activeId && songReady) return;
      core.pause().catch(() => {});
      setActiveId(item.id);
      void openTrack(item);
    },
    [activeId, songReady, openTrack],
  );

  /** Opens the track in the core again even if it is the active one (after the core was used for something else, e.g. the export of a library). */
  const reloadTrack = useCallback(
    (item: PlaylistItem) => {
      core.pause().catch(() => {});
      setActiveId(item.id);
      void openTrack(item);
    },
    [openTrack],
  );

  const reorderTracks = useCallback((from: number, to: number) => {
    setPlaylist((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length || from === to) return prev;
      const next = [...prev];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });
  }, []);

  const removeTrack = useCallback(
    (id: string, e?: { stopPropagation: () => void }) => {
      e?.stopPropagation();
      const rest = playlistRef.current.filter((p) => p.id !== id);
      setPlaylist(rest);
      if (id === activeId) {
        core.pause().catch(() => {});
        core.unload().catch(() => {});
        setSong(null);
        setSongReady(false);
        setLoops([]);
        setActiveLoop(null);
        requestedId.current = null;
        if (rest.length > 0) {
          setActiveId(rest[0].id);
          void openTrack(rest[0]);
        } else {
          setActiveId(null);
        }
      }
    },
    [activeId, openTrack],
  );

  // ---- duplicates: a track that is already in the playlist (the same song) is not added silently ----
  const [dupAsk, setDupAsk] = useState<DupAsk | null>(null);
  const dupResolver = useRef<((a: { choice: DupChoice; all: boolean }) => void) | null>(null);
  const answerDup = useCallback((choice: DupChoice, all: boolean) => {
    setDupAsk(null);
    const r = dupResolver.current;
    dupResolver.current = null;
    r?.({ choice, all });
  }, []);
  /**
   * Adds the tracks to the playlist. For every one that is the same song as a track already there (or as an earlier one of this batch)
   * the user chooses: keep the existing one, keep the new one (it takes the place of the existing one), or merge them (they complete each other).
   * Returns, for every incoming id, the id of the track that stands for it in the playlist.
   */
  const integrateItems = useCallback(
    async (incoming: PlaylistItem[]): Promise<Map<string, string>> => {
      const finalId = new Map<string, string>();
      const pool: PlaylistItem[] = [...playlistRef.current];
      let total = 0;
      { const sim = [...pool]; for (const it of incoming) { if (findDuplicate(sim, it)) total++; else sim.push(it); } }
      const ops: PlaylistItem[] = [];
      let remembered = null as DupChoice | null;
      let n = 0;
      for (const it of incoming) {
        const ex = findDuplicate(pool, it);
        if (!ex) { pool.push(it); ops.push(it); finalId.set(it.id, it.id); continue; }
        n++;
        let choice: DupChoice | null = remembered;
        if (!choice) {
          const a = await new Promise<{ choice: DupChoice; all: boolean }>((res) => { dupResolver.current = res; setDupAsk({ existing: ex, incoming: it, index: n, total }); });
          choice = a.choice;
          if (a.all) remembered = choice;
        }
        finalId.set(it.id, ex.id);
        if (choice === "keep-existing") continue;
        const updated = choice === "keep-new" ? replaceItem(ex, it) : mergeItems(ex, it);
        pool[pool.findIndex((p) => p.id === ex.id)] = updated;
        ops.push(updated);
      }
      setPlaylist((prev) => {
        const next = [...prev];
        for (const op of ops) {
          const k = next.findIndex((p) => p.id === op.id);
          if (k >= 0) next[k] = op; else next.push(op);
        }
        return next;
      });
      // the track that is open was replaced or merged: it is opened again from its new source
      const open = ops.find((op) => op.id === requestedId.current && playlistRef.current.some((p) => p.id === op.id));
      if (open) void openTrack(open);
      return finalId;
    },
    [openTrack],
  );

  /** A library file (.beatlib): its packs are unpacked into the data folder of the app and added to the playlist with their tags and order. */
  const importLibrary = useCallback(
    async (path: string) => {
      try {
        const { manifest, files } = await core.libraryRead(path);
        let m: { tags?: { id: string; name: string }[]; tracks?: { name?: string; artist?: string; title?: string; speed?: number; meterMode?: number; tags?: string[]; duration?: number; originalBpm?: number; cover?: string; hasStems?: boolean }[]; tagOrder?: Record<string, number[]> } = {};
        try { m = JSON.parse(manifest); } catch { /* a library without a manifest: only the packs */ }
        const tagMap: Record<string, string> = {};
        for (const t of m.tags ?? []) { const id = createTag(t.name); if (id) tagMap[t.id] = id; }
        const stamp = Date.now();
        const items: PlaylistItem[] = files.map((p, i) => {
          const t = m.tracks?.[i] ?? {};
          const nm = t.name || fileName(p);
          return {
            id: `${stamp}_${i}_${Math.random().toString(36).slice(2, 7)}`,
            name: nm,
            path: p,
            trackInfo: { name: nm, duration: t.duration ?? 0, originalBpm: t.originalBpm ?? 0, currentBpm: t.originalBpm ?? 0, timeSignature: "4/4" },
            ...(t.cover ? { cover: t.cover } : {}),
            ...(t.hasStems ? { hasStems: true } : {}),
            speed: typeof t.speed === "number" ? t.speed : 1,
            loops: [],
            activeLoop: null,
            ...(typeof t.meterMode === "number" ? { meterMode: t.meterMode } : {}),
            ...(t.artist ? { artist: t.artist } : {}),
            ...(t.title ? { title: t.title } : {}),
            ...((t.tags ?? []).map((x) => tagMap[x]).filter(Boolean).length ? { tags: (t.tags ?? []).map((x) => tagMap[x]).filter(Boolean) } : {}),
            addedAt: stamp + i,
          } as PlaylistItem;
        });
        if (items.length === 0) return;
        const finalId = await integrateItems(items);
        const added = items.filter((it) => finalId.get(it.id) === it.id);
        // the order inside every tag as it was in the library: after the tracks that were already placed there
        setTagOrder((o) => {
          const next = { ...o };
          for (const [oldTag, idx] of Object.entries(m.tagOrder ?? {})) {
            const local = tagMap[oldTag];
            if (!local) continue;
            const ids = idx.map((k) => (items[k] ? finalId.get(items[k].id) : undefined)).filter((x): x is string => !!x);
            next[local] = [...(next[local] ?? []).filter((x) => !ids.includes(x)), ...ids];
          }
          return next;
        });
        setMessage(`Із збірки: додано ${added.length}, уже були в плейлісті ${items.length - added.length}. Аналіз уже в пакетах, чекати не треба.`);
        if (added.length > 0 && (!activeId || !playlistRef.current.some((p) => p.id === activeId))) {
          setActiveId(added[0].id);
          void openTrack(added[0]);
        }
      } catch (e) {
        setMessage(`Не вдалося відкрити збірку: ${String(e)}`);
      }
    },
    [activeId, openTrack, createTag, integrateItems],
  );

  const addFiles = useCallback(
    (allPaths: string[]) => {
      const libs = allPaths.filter((p) => /\.beatlib$/i.test(p));
      libs.forEach((p) => { void importLibrary(p); });
      const paths = allPaths.filter((p) => !/\.beatlib$/i.test(p));
      if (libs.length > 0 && paths.length === 0) return;
      const good = paths.filter(isAudio);
      if (good.length === 0) {
        if (paths.length > 0) setMessage("Підтримуються файли mp3, wav, flac, ogg і пакети beatpack.");
        return;
      }
      const known = new Set(playlistRef.current.map((p) => p.path));
      const items: PlaylistItem[] = good
        .filter((p) => !known.has(p))
        .map((p, i) => ({
          id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
          name: fileName(p),
          path: p,
          trackInfo: { name: fileName(p), duration: 0, originalBpm: 0, currentBpm: 0, timeSignature: "4/4" },
          speed: 1,
          loops: [],
          activeLoop: null,
          addedAt: Date.now() + i,
        }));
      if (items.length === 0) return;
      void (async () => {
        const finalId = await integrateItems(items);
        const added = items.filter((it) => finalId.get(it.id) === it.id);
        if (added.length > 0 && (!activeId || !playlistRef.current.some((p) => p.id === activeId))) {
          setActiveId(added[0].id);
          void openTrack(added[0]);
        }
      })();
    },
    [activeId, openTrack, importLibrary, integrateItems],
  );

  const openFilesDialog = useCallback(async () => {
    const paths = await pickAudioFiles(AUDIO_EXTS, "Додати аудіо", "Аудіо та пакети BeatPack");
    if (paths.length) addFiles(paths);
  }, [addFiles]);

  // files dropped onto the window (desktop) or sent to the app with "Open with" (Android)
  const addFilesRef = useRef(addFiles);
  addFilesRef.current = addFiles;
  useEffect(() => onFilesOpened((paths) => addFilesRef.current(paths)), []);

  // ---- stems ---------------------------------------------------------------------------------------------
  const stemsState = snap?.stems?.state ?? 0;
  const refreshStemsInfo = useCallback(() => {
    core.stemsInfo().then(setStemsInfo).catch(() => setStemsInfo(null));
  }, []);

  useEffect(() => {
    if (activeId && (stemsInfo?.cached || stemsState === 2)) {
      patchItem(activeId, (it) => (it.hasStems ? it : { ...it, hasStems: true }));
    }
  }, [activeId, stemsInfo?.cached, stemsState, patchItem]);

  const persistMix = useCallback(
    (mix: StemMix, on?: boolean) => {
      if (!activeId) return;
      patchItem(activeId, (it) => ({ ...it, stemMix: mix, ...(on === undefined ? {} : { stemsOn: on }) }));
    },
    [activeId, patchItem],
  );

  // a song became ready: look up what is possible; restore this track's mix; load cached parts straight away if they were in use
  useEffect(() => {
    if (!songReady || !activeId || stemsLoadedFor.current === activeId) return;
    stemsLoadedFor.current = activeId;
    const item = playlistRef.current.find((p) => p.id === activeId);
    setStemMixState(item?.stemMix ?? defaultMix());
    core
      .stemsInfo()
      .then((info) => {
        setStemsInfo(info);
        if (info.supported && info.cached && item?.stemsOn) {
          setStemsStartedAt(Date.now());
          core.stemsStart().catch(() => {});
        }
      })
      .catch(() => setStemsInfo(null));
  }, [songReady, activeId]);
  useEffect(() => {
    if (!songReady) stemsLoadedFor.current = null;
  }, [songReady]);

  // state of the separation changed (ready / error / reset): refresh the details
  const lastStemsState = useRef(0);
  useEffect(() => {
    if (lastStemsState.current === stemsState) return;
    lastStemsState.current = stemsState;
    if (songReady) refreshStemsInfo();
  }, [stemsState, songReady, refreshStemsInfo]);

  // parts are ready: send their levels and the on/off choice to the core
  const stemsReadyFor = useRef<string | null>(null);
  useEffect(() => {
    if (stemsState !== 2 || !activeId) {
      if (stemsState !== 2) stemsReadyFor.current = null;
      return;
    }
    const names = stemsInfo?.names ?? [];
    names.forEach((_, i) => core.setStemGain(i, effectiveGain(stemMix, i)).catch(() => {}));
    if (stemsReadyFor.current !== activeId) {
      stemsReadyFor.current = activeId;
      const item = playlistRef.current.find((p) => p.id === activeId);
      core.stemsEnable(true).catch(() => {});
      if (item && item.stemsOn !== true) persistMix(stemMix, true);
    }
  }, [stemsState, activeId, stemMix, stemsInfo]);

  // waveform overview of every part (fetched when the parts are ready) and the levels that are really heard
  const [stemPeaks, setStemPeaks] = useState<number[][]>([]);
  useEffect(() => {
    if (stemsState !== 2 || !songReady) { setStemPeaks([]); return; }
    let live = true;
    core.stemPeaks().then((p) => { if (live) setStemPeaks(p); }).catch(() => { if (live) setStemPeaks([]); });
    return () => { live = false; };
  }, [stemsState, songReady, activeId]);
  const stemsEnabledNow = snap?.stems?.enabled ?? false;
  const stemEffectiveGains = useMemo(
    () => (stemsState === 2 && stemsEnabledNow ? (stemsInfo?.names ?? []).map((_, i) => effectiveGain(stemMix, i)) : []),
    [stemsState, stemsEnabledNow, stemsInfo, stemMix],
  );

  const startStems = useCallback(() => {
    setStemsStartedAt(Date.now());
    setMessage("");
    persistMix(stemMix, true);
    core.stemsStart().then((ok) => { if (!ok) refreshStemsInfo(); }).catch((e) => setMessage(String(e)));
  }, [refreshStemsInfo, persistMix, stemMix]);
  const cancelStems = useCallback(() => {
    core.stemsCancel().catch(() => {});
  }, []);
  const setStemsOn = useCallback(
    (on: boolean) => {
      core.stemsEnable(on).catch(() => {});
      persistMix(stemMix, on);
    },
    [persistMix, stemMix],
  );
  const updateMix = useCallback(
    (fn: (m: StemMix) => StemMix, on?: boolean) => {
      const next = fn({ gain: [...stemMix.gain], mute: [...stemMix.mute], solo: [...stemMix.solo] });
      setStemMixState(next);
      persistMix(next, on);
      if (on !== undefined) core.stemsEnable(on).catch(() => {});
    },
    [stemMix, persistMix],
  );
  const setStemGainUi = useCallback((i: number, g: number) => updateMix((m) => { m.gain[i] = g; return m; }), [updateMix]);
  const toggleStemMute = useCallback((i: number) => updateMix((m) => { m.mute[i] = !m.mute[i]; return m; }), [updateMix]);
  const toggleStemSolo = useCallback((i: number) => updateMix((m) => { m.solo[i] = !m.solo[i]; return m; }), [updateMix]);
  /** quick mixes; they also switch the parts on */
  const stemPreset = useCallback(
    (kind: "reset" | { only: string }) => {
      const names = stemsInfo?.names ?? [];
      updateMix((m) => {
        m.gain.fill(1); m.mute.fill(false); m.solo.fill(false);
        if (kind !== "reset") {
          const k = names.indexOf(kind.only);
          if (k >= 0) { m.mute.fill(true); m.mute[k] = false; }      // only this part is heard
        }
        return m;
      }, true);
    },
    [stemsInfo, updateMix],
  );

  // ---- meter mode, track details, next / previous ------------------------------------------------------
  const setMeterMode = useCallback(
    async (mode: number) => {
      if (!ready || !activeId) return;
      patchItem(activeId, (it) => ({ ...it, meterMode: mode, loops: [], activeLoop: null }));
      setLoops([]);
      setActiveLoop(null);
      await core.clearLoop().catch(() => {});
      const ok = await core.setMeterMode(mode).catch(() => false);
      if (!ok) { setMessage("Не вдалося перерахувати розмір для цього треку."); return; }
      const data = await core.songData();
      setSong(data);
      const len = mostCommonBarLength(data);
      patchItem(activeId, (it) => ({ ...it, trackInfo: { ...it.trackInfo, timeSignature: `${len}/4` } }));
    },
    [ready, activeId, patchItem],
  );

  /** Tempo found twice too fast (210 instead of 105): divide it by two for the whole track. Bars change, so the loops are cleared like with a meter mode. */
  const setHalveTempo = useCallback(
    async (on: boolean) => {
      if (!ready || !activeId) return;
      const preset = (activeItem?.meterMode ?? 0) % 10;
      core.setSpeed(1).catch(() => {});
      patchItem(activeId, (it) => ({ ...it, speed: 1 }));
      await setMeterMode(preset + (on ? 10 : 0));
    },
    [ready, activeId, activeItem, patchItem, setMeterMode],
  );

  const updateTrackMeta = useCallback(
    (id: string, meta: { artist: string; title: string; cover: string }) => {
      patchItem(id, (it) => ({ ...it, artist: meta.artist.trim() || undefined, title: meta.title.trim() || undefined, cover: meta.cover || undefined }));
    },
    [patchItem],
  );

  // "next" and "back" go along the list that is shown: the chosen tag in its own order, or the whole playlist (also when the playing track is not in the tag)
  const queueOf = (id: string | null) => (viewListRef.current.some((p) => p.id === id) ? viewListRef.current : playlistRef.current);
  const queue = viewList.some((p) => p.id === activeId) ? viewList : playlist;
  const activeIndex = queue.findIndex((p) => p.id === activeId);
  const hasNext = activeIndex >= 0 && activeIndex + 1 < queue.length;
  const hasPrev = activeIndex > 0;
  const playNext = useCallback(() => {
    const list = queueOf(activeId);
    const i = list.findIndex((p) => p.id === activeId);
    if (i < 0 || i + 1 >= list.length) return;
    if (snap?.playing) autoPlayId.current = list[i + 1].id;
    selectTrack(list[i + 1]);
  }, [activeId, snap?.playing, selectTrack]);
  /** like a normal player: after the first seconds "back" goes to the start of the song, otherwise to the previous track */
  const skipBack = useCallback(() => {
    const list = queueOf(activeId);
    const i = list.findIndex((p) => p.id === activeId);
    const pos = snap?.position ?? 0;
    if (pos > 2 * Math.max(0.25, snap?.speed ?? 1) || i <= 0) { void restart(); return; }
    if (snap?.playing) autoPlayId.current = list[i - 1].id;
    selectTrack(list[i - 1]);
  }, [activeId, snap?.position, snap?.playing, snap?.speed, restart, selectTrack]);
  const cyclePlayMode = useCallback(() => {
    setPlayMode(playModeRef.current === "stop" ? "repeat" : playModeRef.current === "repeat" ? "next" : "stop");
  }, [setPlayMode]);

  // ---- what to do when the song reaches its end -----------------------------------------------
  useEffect(() => {
    const playing = !!snap?.playing;
    const was = wasPlaying.current;
    wasPlaying.current = playing;
    if (!snap || !was || playing || !ready) return;
    if (snap.duration <= 0 || snap.position < snap.duration - 0.2) return; // paused by the user, not the end
    const mode = playModeRef.current;
    (async () => {
      if (mode === "repeat") {
        await core.seek(0);
        await core.play(); // play() from a stop: the count-in (if on) is played again
        return;
      }
      if (mode === "next") {
        const list = queueOf(activeId);
        const i = list.findIndex((p) => p.id === activeId);
        const nxt = i >= 0 && i + 1 < list.length ? list[i + 1] : null;
        if (nxt) {
          autoPlayId.current = nxt.id;
          selectTrack(nxt);
          return;
        }
      }
      await core.seek(0);
    })();
  }, [snap, ready, activeId, selectTrack]);

  // ---- visual metronome: real beats while playing, count-in clicks while counting in ------------------
  const ci = snap?.countIn ?? null;
  const beatsPerBarNow = snap?.beat ? snap.beat.barLength : 4;
  let visBeat = snap?.beat ? snap.beat.posInBar - 1 : 0;
  let visAccent = snap?.beat ? snap.beat.posInBar === 1 : false;
  if (ci) {
    visBeat = ci.beat > 0 ? (ci.beat - 1) % beatsPerBarNow : -1;
    visAccent = ci.beat > 0 && (ci.beat - 1) % beatsPerBarNow === 0;
  }

  return {
    init,
    chooseCoreDir,
    message,
    setMessage,
    packNotice,
    stemPeaks,
    stemEffectiveGains,
    dismissPackNotice: () => setPackNotice(null),
    snap,
    song,
    ready,
    loading,
    track,
    playlist,
    activeId,
    sections,
    meterLabels,
    variableMeter,
    meterMode: (activeItem?.meterMode ?? 0) % 10,         // recognition preset 0 auto, 1 sensitive, 2 strict
    halveTempo: (activeItem?.meterMode ?? 0) >= 10,        // the tempo is divided by two for this track
    setMeterMode: (preset: number) => setMeterMode(preset + ((activeItem?.meterMode ?? 0) >= 10 ? 10 : 0)),   // keeps the "halve" choice
    setHalveTempo,
    updateTrackMeta,
    hasNext,
    hasPrev,
    playNext,
    skipBack,
    cyclePlayMode,
    barTimes,
    isPlaying: !!snap?.playing,
    currentTime: snap?.position ?? 0,
    speed: snap?.speed ?? 1,
    currentBeat: visBeat,
    currentBeatsPerBar: beatsPerBarNow,
    isAccentBeat: visAccent,
    countingIn: !!snap?.countingIn,
    countIn: ci,
    caps,
    stemsInfo,
    stemsState,
    stemsProgress: snap?.stems?.progress ?? 0,
    stemsEnabled: !!snap?.stems?.enabled,
    stemsStartedAt,
    stemMix,
    refreshStems: refreshStemsInfo,
    startStems,
    cancelStems,
    setStemsOn,
    setStemGainUi,
    toggleStemMute,
    toggleStemSolo,
    stemPreset,
    clickSound,
    setClickSound,
    playMode,
    setPlayMode,
    metronomeConfig,
    setMetronomeConfig: setMetronomeConfigState,
    trackVolume,
    setTrackVolume,
    isTrackMuted,
    setIsTrackMuted,
    loop,
    loops,
    activeLoop,
    selectedLoop,
    setSelectedLoop,
    addLoop,
    loopChoice,
    resolveLoopChoice,
    removeLoop,
    updateLoop,
    activateLoop,
    dragLoop,
    togglePlay,
    togglePreview,
    seek,
    restart,
    changeBpm,
    resetBpm,
    jumpBar,
    selectTrack,
    removeTrack,
    reorderTracks,
    viewList,
    tagView: activeTagView,
    setTagView,
    reorderInTag,
    listForTag,
    reloadTrack,
    dupAsk,
    answerDup,
    tags,
    createTag,
    renameTag,
    deleteTag,
    toggleItemTag,
    addTagToItem,
    openFilesDialog,
  };
}
