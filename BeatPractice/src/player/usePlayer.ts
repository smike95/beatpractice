import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { BC, Caps, core, InitInfo, Snapshot, SongData, StemsInfo } from "../core";
import { AudioTrackInfo, LoopRange, LoopSlot, MetronomeConfig, PlayMode, PlaylistItem, StemMix } from "../types";
import { barStartTimes, computeSections, TempoSection, tempoVaries } from "../utils/sections";

const AUDIO_EXTS = ["mp3", "wav", "flac", "ogg"];
const STORE_KEY = "rt_playlist_v1";
const NO_LOOP: LoopRange = { active: false, start: 0, end: 0 };
const MAX_LOOPS = 3;
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
  });
  const [trackVolume, setTrackVolume] = useState(0.85);
  const [isTrackMuted, setIsTrackMuted] = useState(false);
  const [loops, setLoops] = useState<LoopSlot[]>([]);
  const [activeLoop, setActiveLoop] = useState<number | null>(null);
  const [selectedLoop, setSelectedLoop] = useState(0);
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
  const playlistRef = useRef(playlist);
  playlistRef.current = playlist;

  // ---- start-up: find the core --------------------------------------------------------------
  useEffect(() => {
    core.init().then(setInit).catch((e) => setMessage(String(e)));
  }, []);

  const chooseCoreDir = useCallback(async () => {
    const dir = await open({ directory: true, title: "Оберіть теку beat-core" });
    if (typeof dir !== "string") return;
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
        const s = await core.snapshot();
        if (!stop) setSnap(s);
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

  const patchItem = useCallback((id: string, patch: (it: PlaylistItem) => PlaylistItem) => {
    setPlaylist((prev) => prev.map((it) => (it.id === id ? patch(it) : it)));
  }, []);

  // ---- opening tracks -------------------------------------------------------------------------
  const openTrack = useCallback(async (item: PlaylistItem) => {
    requestedId.current = item.id;
    handledId.current = null;
    opening.current = true;
    setSong(null);
    setSongReady(false);
    setLoops([]);
    setActiveLoop(null);
    setMessage("");
    try {
      const ok = await core.openFile(item.path);
      if (!ok) setMessage("Не вдалося відкрити файл (ядро зайняте або файл недоступний).");
    } catch (e) {
      setMessage(String(e));
    } finally {
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
    handledId.current = id;
    const s = snap;
    (async () => {
      try {
        const item = playlistRef.current.find((p) => p.id === id);
        await core.setMeterMode(item?.meterMode ?? 0).catch(() => false);   // re-reads the saved analysis: fast
        const data = await core.songData();
        const speed = item?.speed ?? 1;
        await core.setSpeed(speed);
        const slots = item?.loops ?? [];
        const act = item?.activeLoop ?? null;
        setLoops(slots);
        setSelectedLoop(0);
        if (act !== null && slots[act] && slots[act].end > slots[act].start) {
          const ok = await core.setLoop(slots[act].start, slots[act].end);
          setActiveLoop(ok ? act : null);
        } else {
          await core.clearLoop();
          setActiveLoop(null);
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
  const togglePlay = useCallback(async () => {
    if (!ready || !snap) return;
    if (snap.playing) await core.pause();
    else await core.play();
  }, [ready, snap]);

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

  /** New loop: the current bar and the next three bars. */
  const addLoop = useCallback(() => {
    if (!ready || !snap || loops.length >= MAX_LOOPS || barTimes.length === 0) return;
    const bi = Math.max(0, lastLE(barTimes, snap.position));
    const endBar = Math.min(barTimes.length, bi + 4);
    const slot: LoopSlot = { start: barTimes[bi], end: endBar < barTimes.length ? barTimes[endBar] : snap.duration };
    const next = [...loops, slot];
    setLoops(next);
    setSelectedLoop(next.length - 1);
    persistLoops(next, activeLoop);
  }, [ready, snap, loops, barTimes, activeLoop, persistLoops]);

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

  /** A loop dragged on the waveform replaces the selected loop (or creates the first one) and switches it on. */
  const dragLoop = useCallback(
    async (start: number, end: number) => {
      if (!ready || !activeId) return;
      const idx = loops.length === 0 ? 0 : Math.min(selectedLoop, loops.length - 1);
      const slot: LoopSlot = { start, end };
      const ok = await core.setLoop(start, end);
      if (!ok) {
        setMessage("Ядро не прийняло цикл (завеликий або замалий).");
        return;
      }
      const next = loops.length === 0 ? [slot] : loops.map((l, i) => (i === idx ? slot : l));
      setLoops(next);
      setSelectedLoop(idx);
      setActiveLoop(idx);
      persistLoops(next, idx);
    },
    [ready, activeId, loops, selectedLoop, persistLoops],
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

  const addFiles = useCallback(
    (paths: string[]) => {
      const good = paths.filter(isAudio);
      if (good.length === 0) {
        if (paths.length > 0) setMessage("Підтримуються файли mp3, wav, flac, ogg.");
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
      setPlaylist((prev) => [...prev, ...items]);
      if (!activeId || !playlistRef.current.some((p) => p.id === activeId)) {
        setActiveId(items[0].id);
        void openTrack(items[0]);
      }
    },
    [activeId, openTrack],
  );

  const openFilesDialog = useCallback(async () => {
    const res = await open({
      multiple: true,
      title: "Додати аудіо",
      filters: [{ name: "Аудіо", extensions: AUDIO_EXTS }],
    });
    if (Array.isArray(res)) addFiles(res);
    else if (typeof res === "string") addFiles([res]);
  }, [addFiles]);

  // drag & drop of files onto the window
  const addFilesRef = useRef(addFiles);
  addFilesRef.current = addFiles;
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop") addFilesRef.current(event.payload.paths);
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // ---- stems ---------------------------------------------------------------------------------------------
  const stemsState = snap?.stems?.state ?? 0;
  const refreshStemsInfo = useCallback(() => {
    core.stemsInfo().then(setStemsInfo).catch(() => setStemsInfo(null));
  }, []);

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
    (kind: "reset" | "no-drums" | "only-drums" | "no-bass" | "no-vocals") => {
      const names = stemsInfo?.names ?? [];
      const idx = (n: string) => names.indexOf(n);
      updateMix((m) => {
        m.gain.fill(1); m.mute.fill(false); m.solo.fill(false);
        if (kind === "no-drums" && idx("drums") >= 0) m.mute[idx("drums")] = true;
        if (kind === "only-drums" && idx("drums") >= 0) { m.mute.fill(true); m.mute[idx("drums")] = false; }
        if (kind === "no-bass" && idx("bass") >= 0) m.mute[idx("bass")] = true;
        if (kind === "no-vocals" && idx("vocals") >= 0) m.mute[idx("vocals")] = true;
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

  const updateTrackMeta = useCallback(
    (id: string, meta: { artist: string; title: string; cover: string }) => {
      patchItem(id, (it) => ({ ...it, artist: meta.artist.trim() || undefined, title: meta.title.trim() || undefined, cover: meta.cover || undefined }));
    },
    [patchItem],
  );

  const activeIndex = playlist.findIndex((p) => p.id === activeId);
  const hasNext = activeIndex >= 0 && activeIndex + 1 < playlist.length;
  const hasPrev = activeIndex > 0;
  const playNext = useCallback(() => {
    const list = playlistRef.current;
    const i = list.findIndex((p) => p.id === activeId);
    if (i < 0 || i + 1 >= list.length) return;
    if (snap?.playing) autoPlayId.current = list[i + 1].id;
    selectTrack(list[i + 1]);
  }, [activeId, snap?.playing, selectTrack]);
  /** like a normal player: after the first seconds "back" goes to the start of the song, otherwise to the previous track */
  const skipBack = useCallback(() => {
    const list = playlistRef.current;
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
        const list = playlistRef.current;
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
    meterMode: activeItem?.meterMode ?? 0,
    setMeterMode,
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
    openFilesDialog,
  };
}
