import React, { useEffect, useRef, useState } from 'react';
import { BC } from './core';
import { PlaylistPanel } from './components/PlaylistPanel';
import { BeatPracticeLogo } from './components/BeatPracticeLogo';
import { CoverPlaceholder } from './components/CoverPlaceholder';
import { TrackMetronomeMixer } from './components/TrackMetronomeMixer';
import { Waveform } from './components/Waveform';
import { LoopsPanel } from './components/LoopsPanel';
import { StemsPanel } from './components/StemsPanel';
import { ClickMetronomePanel } from './components/ClickMetronomePanel';
import { QuietBarsPanel } from './components/QuietBarsPanel';
import { RampPanel } from './components/RampPanel';
import { TrackEditDialog } from './components/TrackEditDialog';
import { ExportDialog } from './components/ExportDialog';
import { PackDialog } from './components/PackDialog';
import { ModelsBanner } from './components/ModelsBanner';
import { Slider } from './components/Slider';
import { WindowControls } from './components/WindowControls';
import { isDesktop } from './platform';
import { AboutDialog } from './components/AboutDialog';
import { usePlayer } from './player/usePlayer';
import { PlaylistItem, ThemeMode } from './types';
import { Language, TranslationKey, translations } from './i18n';
import { QuickTempoBar } from './components/QuickTempoBar';
import { MetronomeStrip } from './components/MetronomeStrip';
import { TempoMapDialog } from './components/TempoMapDialog';
import { LoopConflictDialog } from './components/LoopConflictDialog';
import { LibraryExportDialog } from './components/LibraryExportDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { ExportChooserDialog } from './components/ExportChooserDialog';
import { AnalysisProgress } from './components/AnalysisProgress';
import { formatBpmRange } from './utils/bpm';
import { BatchAudioExportDialog } from './components/BatchAudioExportDialog';
import { DuplicateDialog } from './components/DuplicateDialog';
import { MAX_LOOPS } from './player/usePlayer';
import { Modal } from './components/ui/Modal';
import { accentFor, applyAccent, loadAccent, saveAccent, type AccentChoice } from './utils/accent';
import { btn } from './components/ui/styles';
import { Info, ListEnd, Package, Pause, Pencil, Play, Repeat, Repeat1, Settings, SkipBack, SkipForward, Upload, Wrench } from 'lucide-react';

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const isMac = isDesktop && typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
// the gap between the top of the window and the track bar: on Windows the window buttons live there
const BAR_GAP_WIN = 40;
const isWindows = isDesktop && typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
const BAR_GAP = isWindows ? BAR_GAP_WIN : 8;

function formatPreviewTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function App() {
  const player = usePlayer();
  const {
    track, playlist, activeId: activeTrackId, isPlaying, currentTime, currentBeat, currentBeatsPerBar,
    metronomeConfig, setMetronomeConfig, trackVolume, setTrackVolume, isTrackMuted, setIsTrackMuted,
    loop, openFilesDialog, snap, song, sections,
  } = player;
  const speed = player.speed > 0 ? player.speed : 1;
  const countInRemaining: number | null = player.countingIn ? 1 : null;
  const isCountInOn = metronomeConfig.countInBars > 0;
  const isLoadingAudio = player.loading;
  const analysisStatus =
    snap?.state === BC.DECODING
      ? 'Розкодування…'
      : snap?.state === BC.ANALYZING
        ? 'Аналіз ритму…'
        : '';
  // the tempo that sounds now: in a song with changing tempo it is the tempo of the section under the playhead (the metronome clicks by it),
  // in a steady song the one tempo; both times the speed set in the player. Typed or stepped values are meant for this tempo.
  const secNow = track?.variableTempo ? player.sections.find((x) => (snap?.position ?? 0) >= x.startTime && (snap?.position ?? 0) < x.endTime) : undefined;
  const secBpm = secNow && secNow.bpm > 0 ? secNow.bpm : 0;
  const speedRatio = track && track.originalBpmExact > 0 ? track.bpmExact / track.originalBpmExact : 1;
  const shownBpm = track && track.originalBpmExact > 0 ? (secBpm > 0 ? secBpm : track.originalBpmExact) * speedRatio : 0;
  const currentTempo = shownBpm > 0 ? Math.round(shownBpm) : 100;
  const handleRestart = player.restart;
  const handleTogglePlay = player.togglePlay;
  const handleBpmChange = (bpm: number) => player.changeBpm(secBpm > 0 && snap && snap.songBpm > 0 ? (bpm * snap.songBpm) / secBpm : bpm);
  const handleResetBpm = player.resetBpm;
  const handleSeek = player.seek;
  // The playlist column: pinned = always open and the content is pushed aside; not pinned = a narrow strip that opens above the content on hover.
  const [wide, setWide] = useState<boolean>(() => typeof window === 'undefined' || window.innerWidth >= 1024);
  const [playlistPinned, setPlaylistPinned] = useState<boolean>(() => {
    try { const v = localStorage.getItem('beatpractice_playlist_pinned'); if (v === '1' || v === '0') return v === '1'; } catch { /* ignore */ }
    return true;
  });
  const [playlistOpen, setPlaylistOpen] = useState(false);   // opened above the content (hover, or the arrow on touch screens)
  const pinned = playlistPinned && wide;                     // a narrow window cannot push the content aside
  const expanded = pinned || playlistOpen;
  const asideRef = useRef<HTMLElement>(null);
  const leaveTimer = useRef<number | undefined>(undefined);
  const togglePin = () => setPlaylistPinned((v) => {
    try { localStorage.setItem('beatpractice_playlist_pinned', v ? '0' : '1'); } catch { /* ignore */ }
    return !v;
  });
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  // outside press closes the opened (not pinned) playlist: touch screens have no hover
  useEffect(() => {
    if (!playlistOpen || pinned) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.('.bp-modal-overlay')) return;   // a dialog of the playlist (tags, delete) is not "outside": the strip stays open under it
      if (asideRef.current && !asideRef.current.contains(e.target as Node)) setPlaylistOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [playlistOpen, pinned]);
  const onAsideEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(leaveTimer.current);
    setPlaylistOpen(true);
  };
  const onAsideLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if (e.buttons) {   // a track is being dragged: decide when the button is released
      const up = () => { window.removeEventListener('pointerup', up); if (!asideRef.current?.matches(':hover')) setPlaylistOpen(false); };
      window.addEventListener('pointerup', up);
      return;
    }
    leaveTimer.current = window.setTimeout(() => setPlaylistOpen(false), 150);
  };
  const handleRemoveTrackFromPlaylist = player.removeTrack;
  // Is the metronome slider of the mixer on the screen (not scrolled away, not under the sticky track bar)? If so, the free metronome does not repeat it.
  const [mixerVolumeVisible, setMixerVolumeVisible] = useState(false);
  useEffect(() => {
    let io: IntersectionObserver | undefined;
    let raf = 0;
    const setup = () => {
      io?.disconnect();
      const el = document.getElementById('range-mixer-metronome-volume');
      if (!el) { setMixerVolumeVisible(false); return; }
      const bar = document.getElementById('track-bar-wrap');
      const top = bar && getComputedStyle(bar).position === 'sticky' ? Math.round(bar.getBoundingClientRect().height) : 0;
      io = new IntersectionObserver(([e]) => setMixerVolumeVisible(!!e && e.isIntersecting), { rootMargin: `-${top}px 0px 0px 0px`, threshold: 0.9 });
      io.observe(el);
    };
    raf = requestAnimationFrame(setup);
    window.addEventListener('resize', setup);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', setup); io?.disconnect(); };
  }, [activeTrackId]);

  // The track bar is the top of the card at first; when the page scrolls under it, it becomes a separate rounded tile that stays at the top.
  // It lies in a full-width band of the colour of the page that reaches from the top of the window to the bottom edge of the tile:
  // the scroll "ends" at the tile, nothing shows above it or around its rounded corners (on Windows the band also holds the window buttons).
  const [barStuck, setBarStuck] = useState(false);
  useEffect(() => {
    // the band is "stuck" when it sits at the very top of the window (it is sticky there); checked on every scroll / resize,
    // so it does not matter when the track bar appears in the page
    const check = () => {
      const w = document.getElementById('track-bar-wrap');
      setBarStuck(!!w && window.innerWidth >= 640 && window.scrollY > 0 && w.getBoundingClientRect().top <= 0.5);
      // the scroll (also by keyboard / focus) treats the bottom edge of the sticky band as the top of the window
      document.documentElement.style.scrollPaddingTop = w && getComputedStyle(w).position === 'sticky' ? `${w.offsetHeight}px` : '';
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => { window.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
  }, []);
  const handleSelectTrackFromPlaylist = (item: PlaylistItem) => {
    player.selectTrack(item);
    if (!pinned && !window.matchMedia('(hover: hover)').matches) setPlaylistOpen(false);   // touch: the strip gets out of the way after a choice
  };
  useEffect(() => { document.documentElement.classList.toggle('mac', isMac); }, []);
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [packing, setPacking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportChooser, setExportChooser] = useState(false);                        // the first step of every export
  const [libraryExporting, setLibraryExporting] = useState<{ startTag: string | null } | null>(null);   // pack of a tag / of the playlist
  const [batchAudio, setBatchAudio] = useState<{ startTag: string | null } | null>(null);          // audio files of a tag / of the playlist
  const [aboutOpen, setAboutOpen] = useState(false);
  // the folded part of the mixer (stem separation) remembers whether it was open
  const [mixerOpen, setMixerOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('beatpractice_mixer_open') === '1'; } catch { return false; }
  });
  const toggleMixer = () => setMixerOpen((v) => {
    try { localStorage.setItem('beatpractice_mixer_open', v ? '0' : '1'); } catch { /* ignore */ }
    return !v;
  });
  const [tempoMapOpen, setTempoMapOpen] = useState(false);

  // Theme state: 'light' | 'dark' | 'system'
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('beatpractice_theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    } catch {}
    return 'system';
  });

  // Apply theme to document root
  useEffect(() => {
    const applyTheme = () => {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = themeMode === 'dark' || (themeMode === 'system' && systemPrefersDark);

      const root = document.documentElement;
      if (isDark) {
        root.classList.remove('light');
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
        root.classList.add('light');
      }
    };

    applyTheme();
    try {
      localStorage.setItem('beatpractice_theme', themeMode);
    } catch {}

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (themeMode === 'system') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeMode]);

  // accent colour (system colours of the Apple HIG): purple at the first start; re-applied when the theme changes
  const [accent, setAccent] = useState<AccentChoice>(() => loadAccent());
  useEffect(() => {
    const apply = () => { const dark = document.documentElement.classList.contains('dark'); applyAccent(accentFor(accent, dark), dark); }
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, [accent]);
  const handleSetAccent = (a: AccentChoice) => { setAccent(a); saveAccent(a); };

  // Language state
  const [lang, setLang] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('beatpractice_lang');
      if (saved === 'uk' || saved === 'en') return saved;
    } catch {}
    return 'uk';
  });

  const handleSetLang = (newLang: Language) => {
    setLang(newLang);
    try {
      localStorage.setItem('beatpractice_lang', newLang);
    } catch {}
  };

  const t = (key: TranslationKey) => (translations[lang] || translations.uk)[key] || key;

  const isDark = themeMode === 'dark' || (themeMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Keyboard: Space = play/pause, ←/→ = previous/next bar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
      if (e.code === 'Space') { e.preventDefault(); player.togglePlay(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); player.jumpBar(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); player.jumpBar(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player.togglePlay, player.jumpBar]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the core folder has not been chosen yet -------------------------------------------------
  if (!player.init) {
    return <div className="min-h-screen bg-canvas text-ink-3 flex items-center justify-center">Завантаження…</div>;
  }
  if (!player.init.loaded) {
    return (
      <div className="min-h-screen bg-canvas text-ink flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4 text-center">
          <div className="flex items-center justify-center gap-3">
            <BeatPracticeLogo className="w-10 h-10" />
            <span className="text-2xl font-black">BeatPractice</span>
          </div>
          {player.init.error ? (
            <>
              <p className="text-sm text-rose-400">{player.init.error}</p>
              <button
                onClick={player.chooseCoreDir}
                className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-accent-on font-bold text-sm cursor-pointer"
              >
                {lang === 'en' ? 'Choose the folder with the core…' : 'Вказати теку з ядром…'}
              </button>
            </>
          ) : (
            <p className="text-sm text-ink-3">{lang === 'en' ? 'Loading…' : 'Завантаження…'}</p>
          )}
        </div>
      </div>
    );
  }

  const sectionRows = sections;
  const currentBarNumber = (() => {
    const bt = player.barTimes;
    let lo = 0, hi = bt.length - 1, ans = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (bt[mid] <= currentTime) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans + 1;
  })();
  // the bottom row of the playlist: About, Settings (theme, colour, language), Export
  const footerButtons = (sfx: string) => (
    <>
      <button
        id={`btn-about${sfx}`}
        onClick={() => setAboutOpen(true)}
        title={lang === 'en' ? 'About BeatPractice' : 'Про програму'}
        aria-label={lang === 'en' ? 'About BeatPractice' : 'Про програму'}
        className="p-2.5 lg:p-2 rounded-xl border border-outline bg-control hover:bg-control-hover text-ink-2 cursor-pointer"
      >
        <Info className="w-6 h-6" />
      </button>
      <button
        id={`btn-settings${sfx}`}
        type="button"
        onClick={() => setSettingsOpen(true)}
        title={lang === 'en' ? 'Settings' : 'Налаштування'}
        aria-label={lang === 'en' ? 'Settings' : 'Налаштування'}
        className="flex items-center gap-1.5 p-2.5 lg:p-1.5 sm:px-3 sm:py-1.5 rounded-xl border border-outline bg-control hover:bg-control-hover text-xs font-semibold text-ink-2 cursor-pointer select-none"
      >
        <Settings className="w-6 h-6" />
        <span className="hidden sm:inline font-medium">{lang === 'en' ? 'Settings' : 'Налаштування'}</span>
      </button>
      {isDesktop && player.playlist.length > 0 && (
        <button
          id="btn-export-library"
          type="button"
          onClick={() => setExportChooser(true)}
          title={lang === 'en' ? 'Export a song, a tag or the playlist' : 'Експортувати пісню, тег або плейліст'}
          aria-label={lang === 'en' ? 'Export' : 'Експорт'}
          className="flex items-center gap-1.5 p-2.5 lg:p-1.5 sm:px-3 sm:py-1.5 rounded-xl border border-outline bg-control hover:bg-control-hover text-xs font-semibold text-ink-2 cursor-pointer select-none"
        >
          <Package className="w-6 h-6" />
          <span className="hidden sm:inline font-medium">{lang === 'en' ? 'Export' : 'Експорт'}</span>
        </button>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col font-sans selection:bg-control-hover selection:text-ink">
      {isWindows && <div className="fixed top-0 right-0 z-50"><WindowControls lang={lang} /></div>}

      <ModelsBanner lang={lang} />

      {/* Main Layout: Left Desktop Sidebar + Content */}
      <div className="flex-1 flex w-full">
        {/* DESKTOP FULL-HEIGHT PLAYLIST SIDEBAR */}
        {/* PLAYLIST COLUMN: a strip (emblem, covers, arrow) that opens above the content on hover, or pinned open */}
        <div className="relative shrink-0 transition-[width] duration-200 ease-out" style={{ width: pinned ? '25rem' : '4.5rem' }}>
          <aside
            ref={asideRef}
            id="playlist-sidebar"
            onPointerEnter={onAsideEnter}
            onPointerLeave={onAsideLeave}
            className={`fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden bg-surface border-r border-line/80 transition-[width,box-shadow] duration-200 ease-out ${expanded ? 'w-[min(25rem,92vw)] p-4' : 'w-[4.5rem] p-3'} ${expanded && !pinned ? 'shadow-2xl' : ''}`}
          >
          <PlaylistPanel
            isSidebar
            playlist={playlist.map((it) => ({ ...it, trackInfo: { ...it.trackInfo, duration: it.trackInfo.duration / (it.speed > 0 ? it.speed : 1) } }))}
            activeTrackId={activeTrackId}
            isPlaying={isPlaying}
            onSelectTrack={handleSelectTrackFromPlaylist}
            onRemoveTrack={handleRemoveTrackFromPlaylist}
            onOpenAddFiles={openFilesDialog}
            onReorder={player.reorderTracks}
            footer={<div className="flex flex-wrap items-center gap-2">{footerButtons('')}</div>}
            lang={lang}
            compact={!expanded}
            pinned={pinned}
            onTogglePin={wide ? togglePin : undefined}
            onExpand={() => setPlaylistOpen(true)}
            tags={player.tags}
            onToggleTag={player.toggleItemTag}
            onAddTagToItem={player.addTagToItem}
            onCreateTag={player.createTag}
            onRenameTag={player.renameTag}
            onDeleteTag={player.deleteTag}
            tagView={player.tagView}
            onTagView={player.setTagView}
            viewList={player.viewList}
            onReorderInTag={player.reorderInTag}
                      />

          </aside>
        </div>

        {/* the zone above the top bar: drag the window by it (the bar itself lets the clicks through when it is not stuck). It lies under the bar and the window buttons. */}
        {(isWindows || isMac) && <div data-tauri-drag-region className="fixed inset-x-0 top-0 z-20" style={{ height: isWindows ? BAR_GAP_WIN : 28 }} />}

        {/* MAIN INTERACTIVE CONTENT */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 py-4 space-y-4 pb-28 md:pb-8" style={isWindows ? { paddingTop: BAR_GAP_WIN + 8 } : isMac ? { paddingTop: 32 } : undefined}>
          {/* Loading Overlay */}
          {isLoadingAudio && (
            <div className="bg-surface/90 border border-outline rounded-xl p-3 text-ink-2 space-y-2">
              <AnalysisProgress lang={lang} label={snap?.state === BC.DECODING ? (lang === 'en' ? 'Decoding…' : analysisStatus) : snap?.state === BC.ANALYZING ? (lang === 'en' ? 'Analysing the rhythm…' : analysisStatus) : t('processingAudio')} progress={snap?.state === BC.ANALYZING ? (snap.progress ?? 0) : null} />
              {snap?.state === BC.ANALYZING && snap.duration > 0 && (
                <div className="flex items-center gap-3" id="analysis-preview">
                  <button
                    onClick={() => player.togglePreview()}
                    title={lang === 'en' ? 'Listen to the original while the analysis runs' : 'Послухати оригінал, поки триває аналіз'}
                    className={`p-1.5 rounded-lg border cursor-pointer shrink-0 text-white ${snap.playing ? 'bg-control hover:bg-control-hover border-outline' : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500'}`}
                  >
                    {snap.playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                  </button>
                  <span className="font-mono text-xs tabular-nums shrink-0">{formatPreviewTime(snap.position)}</span>
                  <Slider
                    min={0}
                    max={snap.duration}
                    step={0.1}
                    value={Math.min(snap.position, snap.duration)}
                    onChange={(v) => handleSeek(v)}
                    ariaLabel={lang === 'en' ? 'Position' : 'Позиція'}
                    className="flex-1 min-w-0"
                  />
                  <span className="font-mono text-xs tabular-nums shrink-0">{formatPreviewTime(snap.duration)}</span>
                </div>
              )}
              {snap?.state === BC.ANALYZING && snap.duration > 0 && (
                <p className="text-xs text-ink-3 text-center">{lang === 'en' ? 'You can listen to the original track while the analysis is running.' : 'Поки триває аналіз, можна послухати оригінальний трек.'}</p>
              )}
            </div>
          )}

          {/* Master Playback Transport Bar */}
          {/* Track bar: the top of the card with the track; when the page scrolls it stays under the top edge of the window and casts a shadow */}
          {/* before a track is open the main part has only the add-file field and the free metronome */}
          {track && (
          <div
            id="track-bar-wrap"
            data-tauri-drag-region
            className={`sm:sticky z-30 ${barStuck ? 'page-mask -mx-4 sm:-mx-6 px-4 sm:px-6' : 'pointer-events-none'}`}
            style={{ top: 0, marginTop: -BAR_GAP, paddingTop: BAR_GAP, willChange: 'transform' }}
          >
          <div
            id="track-bar"
            data-tauri-drag-region
            className={`pointer-events-auto bg-surface py-3 px-4 sm:px-5 border border-line transition-shadow ${barStuck ? 'is-stuck rounded-2xl' : 'border-b-0 rounded-t-2xl'}`}
          >
            <div data-tauri-drag-region className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
              <div data-tauri-drag-region className="flex items-center gap-3 min-w-0 flex-1 basis-64">
                <div className="hidden sm:flex w-14 h-14 rounded-xl bg-control border border-outline overflow-hidden items-center justify-center shrink-0">
                  {track?.cover ? <img src={track.cover} alt="" className="w-full h-full object-cover" /> : <CoverPlaceholder className="w-full h-full" rounded="" />}
                </div>
                <div data-tauri-drag-region className="min-w-0">
                  <div data-tauri-drag-region className="flex items-center gap-1.5 min-w-0">
                    <h2 id="track-title" className="text-base font-bold text-ink truncate max-w-[24rem]">
                      {track ? track.displayName : (lang === 'en' ? 'Waiting for an audio track' : 'Очікування завантаження аудіотреку')}
                    </h2>
                    {track && (
                      <button
                        id="btn-edit-track"
                        onClick={() => setEditing(true)}
                        title={lang === 'en' ? 'Edit artist, title and cover' : 'Змінити виконавця, назву та обкладинку'}
                        className="p-1 rounded-md text-ink-3 hover:text-ink hover:bg-control cursor-pointer shrink-0"
                      >
                        <Pencil className="icon-sm" />
                      </button>
                    )}
                  </div>
                  <div id="track-meta-line" data-tauri-drag-region className="flex items-center gap-x-3 gap-y-0.5 text-xs text-ink-3 mt-0.5 flex-wrap">
                    <span>{lang === 'en' ? 'Tempo' : 'Темп'}: <strong className="text-ink-2 font-mono">{track ? formatBpmRange(track.bpmMin, track.bpmMax, track.originalBpmExact) : '—'}</strong>
                      {track?.variableTempo && <em title={lang === 'en' ? 'The tempo changes during the song' : 'Темп змінюється протягом пісні'} className="ml-1.5 not-italic font-bold text-accent-text">{lang === 'en' ? 'variable' : 'змінний'}</em>}
                    </span>
                    <span>•</span>
                    <span>{lang === 'en' ? 'Meter' : 'Розмір'}:{' '}
                      {track?.variableMeter ? (
                        <strong className="text-ink-2" title={lang === 'en' ? 'Meters in the song, most frequent first' : 'Розміри в пісні, від найчастішого'}>
                          <span className="text-accent-text">{lang === 'en' ? 'Variable' : 'Змінний'}</span>: {track.meterLabels.join(', ')}
                        </strong>
                      ) : (
                        <strong className="text-ink-2">{track ? (track.meterLabels[0] ?? track.timeSignature) : '4/4'}</strong>
                      )}
                    </span>
                    {track && (
                      <button
                        id="btn-tempo-map"
                        type="button"
                        onClick={() => setTempoMapOpen(true)}
                        title={lang === 'en' ? 'Tempo map and sections' : 'Карта темпу та секцій'}
                        aria-label={lang === 'en' ? 'Tempo map and sections' : 'Карта темпу та секцій'}
                        className="-my-1 p-1 rounded-md text-ink-3 hover:text-ink hover:bg-control cursor-pointer shrink-0"
                      >
                        <Wrench className="icon-sm" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div data-tauri-drag-region className="ml-auto flex justify-end">
              <div id="transport-cluster" data-tauri-drag-region className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                <button
                  id="btn-restart-playback"
                  onClick={player.skipBack}
                  disabled={!track}
                  className="w-11 h-11 lg:w-10 lg:h-10 flex items-center justify-center bg-control hover:bg-control-hover text-ink-2 rounded-xl border border-outline transition-colors cursor-pointer disabled:opacity-40"
                  title={lang === 'en' ? 'To the start / previous track' : 'На початок / попередній трек'}
                >
                  <SkipBack className="w-6 h-6 fill-current" />
                </button>
                <button
                  id="btn-main-play-pause"
                  onClick={handleTogglePlay}
                  disabled={isLoadingAudio}
                  className={`h-12 w-32 px-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer ${
                    isPlaying
                      ? 'bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-[#1d1d1f] shadow-amber-400/30'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                  }`}
                  title="Відтворення / Пауза (Пробіл)"
                >
                  {isPlaying ? (<><Pause className="w-6 h-6 fill-current" /><span className="text-base">{t('pause')}</span></>) : (<><Play className="w-6 h-6 fill-current" /><span className="text-base">{t('play')}</span></>)}
                </button>
                <button
                  id="btn-next-track"
                  onClick={player.playNext}
                  disabled={!player.hasNext}
                  className="w-11 h-11 lg:w-10 lg:h-10 flex items-center justify-center bg-control hover:bg-control-hover text-ink-2 rounded-xl border border-outline transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  title={lang === 'en' ? 'Next track' : 'Наступний трек'}
                >
                  <SkipForward className="w-6 h-6 fill-current" />
                </button>
                <button
                  id="btn-play-mode"
                  onClick={player.cyclePlayMode}
                  aria-label={lang === 'en' ? 'When the song ends' : 'Коли пісня закінчиться'}
                  title={
                    player.playMode === 'stop'
                      ? (lang === 'en' ? 'At the end: stop (click to change)' : 'Після кінця: зупинитись (натисніть, щоб змінити)')
                      : player.playMode === 'repeat'
                        ? (lang === 'en' ? 'At the end: play this song again, with count-in (click to change)' : 'Після кінця: знову цей трек з початку, з відліком (натисніть, щоб змінити)')
                        : (lang === 'en' ? 'At the end: play the next track (click to change)' : 'Після кінця: наступний трек із плейліста (натисніть, щоб змінити)')
                  }
                  className={`w-11 h-11 lg:w-10 lg:h-10 flex items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                    player.playMode === 'stop'
                      ? 'bg-control text-ink-3 border-outline hover:bg-control-hover'
                      : 'bg-accent text-accent-on border-accent hover:bg-accent-hover'
                  }`}
                >
                  {player.playMode === 'repeat' ? <Repeat1 className="w-6 h-6" /> : player.playMode === 'next' ? <ListEnd className="w-6 h-6" /> : <Repeat className="w-6 h-6" />}
                </button>
              </div>
              </div>
            </div>
          </div>
          </div>
          )}

          <section id="master-transport-bar" className={track ? "bg-surface border border-line border-t-0 rounded-2xl rounded-t-none !mt-0 p-4 sm:p-5 pt-1 sm:pt-1 shadow-xl" : ""}>
            {track && (<>
            {/* Row 2: tempo, metronome switches, visual beats (they wrap instead of overflowing) */}
            <div className="flex flex-wrap items-center gap-2 max-w-full">
                <QuickTempoBar
                  hasTrack={!!track}
                  currentBpm={track ? (shownBpm > 0 ? Math.round(shownBpm) : track.currentBpm) : undefined}
                  canReset={!!track && track.currentBpm !== track.originalBpm}
                  onChange={handleBpmChange}
                  onReset={() => track && handleResetBpm()}
                  labels={{ minus5: t('decreaseTempo5'), minus1: t('decreaseTempo1'), plus1: t('increaseTempo1'), plus5: t('increaseTempo5'), reset: t('resetOriginalTempo') }}
                />

                <MetronomeStrip
                  lang={lang}
                  enabled={metronomeConfig.enabled}
                  onToggle={() => setMetronomeConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                  meter={track?.timeSignature || '4/4'}
                  beatsPerBar={currentBeatsPerBar}
                  activeBeat={(isPlaying || countInRemaining !== null) ? currentBeat % currentBeatsPerBar : -1}
                  accent={metronomeConfig.accentFirstBeat}
                  onAccent={(v) => setMetronomeConfig(prev => ({ ...prev, accentFirstBeat: v }))}
                  countInBars={metronomeConfig.countInBars}
                  onCountInBars={(n) => setMetronomeConfig(prev => ({ ...prev, countInBars: n }))}
                  countInOnlyAtStart={metronomeConfig.countInOnlyAtStart ?? false}
                  onCountInMode={(v) => setMetronomeConfig(prev => ({ ...prev, countInOnlyAtStart: v }))}
                  sound={player.clickSound}
                  soundCount={player.caps.clickSounds}
                  onSound={player.setClickSound}
                  subdivision={{ value: player.clickSub, onChange: player.setClickSubdivision }}
                />
            </div>


            {/* Compact Dual Volume Mixer: розміщено одразу під швидкими налаштуваннями ритму і метронома */}
            <div className="mt-3">
              <TrackMetronomeMixer
                trackVolume={trackVolume}
                onTrackVolumeChange={setTrackVolume}
                isTrackMuted={isTrackMuted}
                onTrackMuteToggle={() => setIsTrackMuted(!isTrackMuted)}
                metronomeVolume={metronomeConfig.volume}
                isMetronomeEnabled={metronomeConfig.enabled}
                onMetronomeVolumeChange={(vol) => setMetronomeConfig(prev => ({ ...prev, volume: vol }))}
                onMetronomeToggle={() => setMetronomeConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                expanded={mixerOpen}
                onExpandedToggle={toggleMixer}
                lang={lang}
              >
                <StemsPanel player={player} lang={lang} />
              </TrackMetronomeMixer>
            </div>
            </>)}

            {/* Waveform, bar navigation, zoom, sections, loop (or the empty state) */}
            {track ? (
              <Waveform
                song={song}
                duration={track.duration}
                position={currentTime}
                playing={isPlaying}
                barTimes={player.barTimes}
                sections={sections}
                loop={loop}
                loops={player.loops}
                activeLoop={player.activeLoop}
                speed={speed}
                isDark={isDark}
                currentBeat={currentBeat}
                beatsPerBar={currentBeatsPerBar}
                lang={lang}
                selectedLoop={player.selectedLoop}
                maxLoops={3}
                onRemoveLoop={(i) => void player.removeLoop(i)}
                stemPeaks={player.stemPeaks}
                stemGains={player.stemEffectiveGains}
                onSeek={handleSeek}
                onDragLoop={player.dragLoop}
                onUpdateLoop={(i, slot) => void player.updateLoop(i, slot)}
                onJumpBar={player.jumpBar}
              />
            ) : (
              <button
                type="button"
                onClick={openFilesDialog}
                className="w-full border-2 border-dashed border-line hover:border-outline rounded-xl p-8 text-center cursor-pointer transition-colors bg-canvas/40 hover:bg-surface/40 group block select-none"
              >
                <div className="mx-auto w-12 h-12 rounded-full bg-control/80 group-hover:bg-control-hover text-ink-3 group-hover:text-ink-2 flex items-center justify-center mb-2.5 transition-colors">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-ink-2">Додайте аудіотрек</p>
                <p className="text-xs text-ink-3 mt-1">Натисніть тут або перетягніть файли у вікно (MP3, WAV, FLAC, OGG)</p>
              </button>
            )}
            {player.message && <p className="mt-3 text-xs text-rose-400">{player.message}</p>}
          </section>

          {/* Under the waveform: before a track is open only the free metronome; with a track the training tools, and the free metronome stays as the lowest block. */}
          <div className="space-y-4">
          {track && (
            <>
              <LoopsPanel
                loops={player.loops}
                activeLoop={player.activeLoop}
                selectedLoop={player.selectedLoop}
                barTimes={player.barTimes}
                duration={track.duration}
                ready={player.ready}
                lang={lang}
                maxLoops={3}
                isDark={isDark}
                currentBar={currentBarNumber}
                countInOn={isCountInOn}
                countInBars={metronomeConfig.countInBars}
                onCountInBars={(n) => setMetronomeConfig((prev) => ({ ...prev, countInBars: n }))}
                countInOnLoop={metronomeConfig.countInOnLoop}
                onCountInOnLoop={(v) => setMetronomeConfig((prev) => ({ ...prev, countInOnLoop: v }))}
                onSelect={player.setSelectedLoop}
                onActivate={player.activateLoop}
                onUpdate={player.updateLoop}
                onAdd={player.addLoop}
                onRemove={player.removeLoop}
              />

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
                <QuietBarsPanel
                  lang={lang}
                  config={metronomeConfig}
                  onChange={(patch) => player.setMetronomeConfig((prev) => ({ ...prev, ...patch }))}
                />
                <RampPanel
                  lang={lang}
                  ready={player.ready}
                  playing={isPlaying}
                  currentBpm={track.bpmExact}
                  originalBpm={track.originalBpmExact}
                  loopActive={player.activeLoop !== null}
                  loopWraps={player.snap?.loopWraps ?? 0}
                  position={currentTime}
                  duration={track.duration}
                  onSetBpm={(bpm) => player.changeBpm(bpm)}
                  onPlay={() => { if (!isPlaying) player.togglePlay(); }}
                  onEnsureRepeat={() => { if (player.playMode !== 'repeat') player.setPlayMode('repeat'); }}
                  onPause={() => { if (isPlaying) player.togglePlay(); }}
                />
              </div>
            </>
          )}
            <ClickMetronomePanel
              lang={lang}
              trackKey={activeTrackId ?? ''}
              defaults={{
                bpm: currentTempo,
                beats: currentBeatsPerBar,
                accent: metronomeConfig.accentFirstBeat,
                volume: metronomeConfig.volume,
                sound: player.clickSound,
              }}
              soundCount={player.caps.clickSounds}
              subdivision={{ value: player.clickSub, onChange: player.setClickSubdivision }}
              clickBeat={player.snap?.clickBeat ?? -1}
              trackPlaying={isPlaying}
              onPauseTrack={() => { if (isPlaying) player.togglePlay(); }}
              hasTrack={!!track}
              sharedVolume={metronomeConfig.volume}
              onSharedVolume={(vol) => setMetronomeConfig(prev => ({ ...prev, volume: vol }))}
              showVolume={!track || !mixerVolumeVisible}
            />
          </div>

        </main>
      </div>

      {aboutOpen && <AboutDialog lang={lang} onClose={() => setAboutOpen(false)} />}
      {tempoMapOpen && track && (
        <TempoMapDialog
          lang={lang}
          halveTempo={player.halveTempo}
          onHalveTempo={(on) => void player.setHalveTempo(on)}
          meterPreset={player.meterMode}
          onMeterPreset={(p) => void player.setMeterMode(p)}
          ready={player.ready}
          sections={sectionRows}
          speed={speed}
          onGoTo={handleSeek}
          onClose={() => setTempoMapOpen(false)}
        />
      )}

      {exporting && track && (
        <ExportDialog
          lang={lang}
          displayName={track.displayName}
          originalBpm={track.originalBpmExact}
          currentBpm={track.bpmExact}
          stemNames={player.stemsState === 2 ? (player.stemsInfo?.names ?? []) : []}
          stemMuted={(player.stemsState === 2 ? (player.stemsInfo?.names ?? []) : []).map((_, i) => !!player.stemMix.mute[i])}
          stemGains={(player.stemsInfo?.names ?? []).map((_, i) => player.stemMix.gain[i] ?? 1)}
          metronomeOn={player.metronomeConfig.enabled}
          accentOn={player.metronomeConfig.accentFirstBeat}
          quiet={{ enabled: metronomeConfig.quietEnabled, clickBars: metronomeConfig.quietClickBars, quietBars: metronomeConfig.quietBars }}
          countInBars={player.metronomeConfig.countInBars}
          loops={player.loops}
          activeLoop={player.activeLoop}
          onClose={() => setExporting(false)}
          onBack={() => { setExporting(false); setExportChooser(true); }}
        />
      )}

      {packing && track && (
        <PackDialog
          lang={lang}
          displayName={track.displayName}
          title={track.title}
          artist={track.artist}
          duration={track.duration}
          stemNames={player.stemsState === 2 ? (player.stemsInfo?.names ?? []) : []}
          loops={player.loops}
          onClose={() => setPacking(false)}
          onBack={() => { setPacking(false); setExportChooser(true); }}
        />
      )}

      {player.packNotice && (
        <Modal id="pack-owner-notice" role="alertdialog" width="md">
            <h3 className="text-base font-bold">{lang === 'en' ? 'This pack was made for another owner' : 'Цей пакет створено для іншого власника'}</h3>
            <p className="text-sm">{lang === 'en'
              ? 'Packs are meant for the devices of the person who made them. Passing a pack to someone else is your own responsibility.'
              : 'Пакети призначені для пристроїв того, хто їх створив. Передача пакета іншим людям відбувається на вашу відповідальність.'}</p>
            <div className="flex justify-end">
              <button id="btn-pack-notice-ok" className={btn.primary} onClick={player.dismissPackNotice}>{lang === 'en' ? 'I understand' : 'Розумію'}</button>
            </div>
        </Modal>
      )}

      {player.dupAsk && (
        <DuplicateDialog lang={lang} ask={player.dupAsk} tags={player.tags} onAnswer={player.answerDup} />
      )}

      {settingsOpen && (
        <SettingsDialog
          lang={lang}
          isDark={isDark}
          themeMode={themeMode}
          onTheme={setThemeMode}
          accent={accent}
          onAccent={handleSetAccent}
          onLang={handleSetLang}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {exportChooser && (
        <ExportChooserDialog
          lang={lang}
          canSong={!!(track && player.ready)}
          hasTags={player.tags.some((t) => player.listForTag(t.id).length > 0)}
          onClose={() => setExportChooser(false)}
          onChoose={(c) => {
            setExportChooser(false);
            // for "a tag": the tag that is shown now, else the first one that has tracks (the dialog lets the person switch)
            const tagId = player.tagView ?? player.tags.find((t) => player.listForTag(t.id).length > 0)?.id ?? null;
            const startTag = c.scope === 'tag' ? tagId : null;
            if (c.kind === 'audio') { if (c.scope === 'song') setExporting(true); else setBatchAudio({ startTag }); }
            else { if (c.scope === 'song') setPacking(true); else setLibraryExporting({ startTag }); }
          }}
        />
      )}

      {libraryExporting && (
        <LibraryExportDialog
          lang={lang}
          playlist={player.playlist}
          tags={player.tags}
          listForTag={player.listForTag}
          startTag={libraryExporting.startTag}
          activeItem={player.playlist.find((p) => p.id === player.activeId) ?? null}
          onRestore={(item) => player.reloadTrack(item)}
          onClose={() => setLibraryExporting(null)}
          onBack={() => { setLibraryExporting(null); setExportChooser(true); }}
        />
      )}

      {batchAudio && (
        <BatchAudioExportDialog
          lang={lang}
          playlist={player.playlist}
          tags={player.tags}
          listForTag={player.listForTag}
          startTag={batchAudio.startTag}
          activeItem={player.playlist.find((p) => p.id === player.activeId) ?? null}
          onRestore={(item) => player.reloadTrack(item)}
          onClose={() => setBatchAudio(null)}
          onBack={() => { setBatchAudio(null); setExportChooser(true); }}
        />
      )}

      {player.loopChoice && song && track && (
        <LoopConflictDialog
          lang={lang}
          loops={player.loops}
          hits={player.loopChoice.hits}
          newLoop={{ start: player.loopChoice.start, end: player.loopChoice.end }}
          canCreate={player.loops.length < MAX_LOOPS}
          isDark={isDark}
          peaks={song.peaks}
          duration={track.duration}
          barTimes={player.barTimes}
          onChoose={(answer) => { void player.resolveLoopChoice(answer); }}
        />
      )}

      {editing && track && activeTrackId && (
        <TrackEditDialog
          initial={{ artist: track.artist, title: track.title, cover: track.cover }}
          fileName={track.fileName}
          lang={lang}
          onClose={() => setEditing(false)}
          onSave={(m) => { player.updateTrackMeta(activeTrackId, m); setEditing(false); }}
        />
      )}
    </div>
  );
}
