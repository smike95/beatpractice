import React, { useEffect, useRef, useState } from 'react';
import { BC } from './core';
import { PlaylistPanel } from './components/PlaylistPanel';
import { BeatPracticeLogo } from './components/BeatPracticeLogo';
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
import { ThemeMode } from './types';
import { Language, TranslationKey, translations } from './i18n';
import { QuickTempoBar } from './components/QuickTempoBar';
import { MetronomeStrip } from './components/MetronomeStrip';
import { TempoMapDialog } from './components/TempoMapDialog';
import { LoopConflictDialog } from './components/LoopConflictDialog';
import { MAX_LOOPS } from './player/usePlayer';
import { Modal } from './components/ui/Modal';
import { btn } from './components/ui/styles';
import { Download, Info, Languages, ListEnd, Monitor, Moon, Music, Package, Pause, Pencil, Play, Repeat, Repeat1, SkipBack, SkipForward, Smartphone, Sun, Upload, Wrench } from 'lucide-react';

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const isWindows = isDesktop && typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

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
        ? `Аналіз ритму… ${Math.round((snap.progress ?? 0) * 100)}%`
        : '';
  const handleRestart = player.restart;
  const handleTogglePlay = player.togglePlay;
  const handleBpmChange = player.changeBpm;
  const handleResetBpm = player.resetBpm;
  const handleSeek = player.seek;
  const handleSelectTrackFromPlaylist = player.selectTrack;
  const handleRemoveTrackFromPlaylist = player.removeTrack;

  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [packing, setPacking] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  // the playlist column is as tall as the window below the header: remember the header height
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--hdr', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [player.init?.loaded]);
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
    return <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">Завантаження…</div>;
  }
  if (!player.init.loaded) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <BeatPracticeLogo className="w-8 h-8" />
            <span className="text-xl font-black">BeatPractice</span>
          </div>
          <p className="text-sm text-slate-300">
            Оберіть теку <b>beat-core</b> (де лежать <span className="font-mono">build/</span> і <span className="font-mono">models/</span>).
          </p>
          {player.init.error && <p className="text-sm text-rose-400">{player.init.error}</p>}
          {player.message && <p className="text-sm text-rose-400">{player.message}</p>}
          <button
            onClick={player.chooseCoreDir}
            className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm cursor-pointer"
          >
            Обрати теку beat-core…
          </button>
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
  const themeLangButtons = (sfx: string) => (
    <>
      <button
        id={`btn-about${sfx}`}
        onClick={() => setAboutOpen(true)}
        title={lang === 'en' ? 'About BeatPractice' : 'Про програму'}
        aria-label={lang === 'en' ? 'About BeatPractice' : 'Про програму'}
        className="p-2.5 lg:p-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
      >
        <Info className="w-6 h-6" />
      </button>
            {/* Theme Toggle Button */}
            <button
              id={`header-theme-toggle${sfx}`}
              type="button"
              onClick={() => setThemeMode(prev => prev === 'dark' ? 'light' : prev === 'light' ? 'system' : 'dark')}
              className="flex items-center gap-1.5 p-2.5 lg:p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:active:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 text-xs font-semibold transition-all cursor-pointer shadow-2xs select-none"
              title={`${t('theme')}: ${themeMode === 'light' ? t('themeLight') : themeMode === 'dark' ? t('themeDark') : t('themeSystem')}`}
            >
              {themeMode === 'light' && <Sun className="w-6 h-6 text-amber-500" />}
              {themeMode === 'dark' && <Moon className="w-6 h-6 text-slate-200" />}
              {themeMode === 'system' && (
                <>
                  <Smartphone className="w-6 h-6 text-slate-700 dark:text-slate-200 sm:hidden" />
                  <Monitor className="w-6 h-6 text-slate-700 dark:text-slate-200 hidden sm:block" />
                </>
              )}
              <span className="hidden sm:inline font-medium">
                {themeMode === 'light' ? t('themeLight') : themeMode === 'dark' ? t('themeDark') : t('themeSystem')}
              </span>
            </button>

            {/* Language Toggle Button */}
            <button
              id={`header-lang-toggle${sfx}`}
              type="button"
              onClick={() => handleSetLang(lang === 'uk' ? 'en' : 'uk')}
              className="flex items-center gap-1 p-2.5 lg:p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:active:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 text-xs font-semibold transition-all cursor-pointer shadow-2xs select-none"
              title={lang === 'uk' ? 'Switch to English' : 'Перемкнути на українську'}
            >
              <Languages className="w-6 h-6 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
              <span className="hidden sm:inline font-bold text-xs">{lang === 'uk' ? 'УКР' : 'ENG'}</span>
            </button>

    </>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-slate-700 selection:text-white">
      {/* Header: emblem + name (above the playlist) and the player controls; stays in place when the page scrolls */}
      <header ref={headerRef} className="relative border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 select-none" data-tauri-drag-region>
        <div className="flex items-stretch" data-tauri-drag-region>
          <div className="flex-1 min-w-0" data-tauri-drag-region>
            <div className="max-w-[1920px] mx-auto flex flex-wrap lg:flex-nowrap items-center lg:items-stretch gap-x-2 gap-y-1 px-3 py-2 sm:px-4 lg:p-0 lg:gap-0" data-tauri-drag-region>
              <div className="order-1 lg:order-none flex-1 min-w-0 lg:flex-none lg:w-[25rem] lg:shrink-0 flex items-center gap-3 lg:px-4 lg:py-2 pointer-events-none">
                <BeatPracticeLogo className="w-10 h-10 shrink-0" />
                <span className="hidden sm:inline text-2xl font-black text-slate-100 tracking-tight">BeatPractice</span>
              </div>
              <div className={`contents lg:flex lg:flex-1 lg:min-w-0 lg:items-center lg:gap-3 lg:px-6 lg:py-2 lg:justify-end ${isWindows ? 'lg:pr-[9rem]' : ''}`} data-tauri-drag-region>
                <button
                  id="btn-export-track"
                  onClick={() => setExporting(true)}
                  disabled={!(track && player.ready)}
                  title={lang === 'en' ? 'Export the track with the current tempo and parts' : 'Експортувати трек із поточним темпом і партіями'}
                  className="order-2 lg:order-none w-11 h-11 lg:w-10 lg:h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default shrink-0"
                >
                  <Download className="w-6 h-6" />
                </button>
                <button
                  id="btn-save-pack"
                  onClick={() => setPacking(true)}
                  disabled={!(track && player.ready) || player.caps?.packs === false}
                  title={lang === 'en' ? 'Save as a pack (.beatpack) for another device' : 'Зберегти як пакет (.beatpack) для іншого пристрою'}
                  className="order-3 lg:order-none w-11 h-11 lg:w-10 lg:h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default shrink-0"
                >
                  <Package className="w-6 h-6" />
                </button>
              {/* Transport: back / play / next / what happens at the end (as in common players) */}
              <div id="transport-cluster" className="order-5 basis-full justify-center lg:order-none lg:basis-auto lg:justify-start flex items-center gap-2 shrink-0 lg:absolute lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2">
                <button
                  id="btn-restart-playback"
                  onClick={player.skipBack}
                  disabled={!track}
                  className="w-11 h-11 lg:w-10 lg:h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors cursor-pointer disabled:opacity-40"
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
                      ? 'bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 shadow-amber-400/30'
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
                  className="w-11 h-11 lg:w-10 lg:h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
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
                      ? 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                      : 'bg-sky-600 text-white border-sky-500 hover:bg-sky-500'
                  }`}
                >
                  {player.playMode === 'repeat' ? <Repeat1 className="w-6 h-6" /> : player.playMode === 'next' ? <ListEnd className="w-6 h-6" /> : <Repeat className="w-6 h-6" />}
                </button>
              </div>
                <div className="order-4 lg:hidden flex items-center gap-1 shrink-0">{themeLangButtons('-small')}</div>
              </div>
            </div>
          </div>
          {isWindows && <div className="absolute top-0 right-0"><WindowControls lang={lang} /></div>}
        </div>
      </header>

      <ModelsBanner lang={lang} />

      {/* Main Layout: Left Desktop Sidebar + Content */}
      <div className="flex-1 flex max-w-[1920px] w-full mx-auto">
        {/* DESKTOP FULL-HEIGHT PLAYLIST SIDEBAR */}
        <aside
          className="hidden lg:flex w-[25rem] shrink-0 border-r border-slate-800/80 bg-slate-900/50 p-4 flex-col sticky self-start overflow-hidden"
          style={{ top: 'var(--hdr, 56px)', height: 'calc(100vh - var(--hdr, 56px))' }}
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
            footer={<div className="flex items-center gap-2">{themeLangButtons('')}</div>}
            lang={lang}
          />

        </aside>

        {/* MAIN INTERACTIVE CONTENT */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 py-4 space-y-4 pb-28 md:pb-8">
          {/* Loading Overlay */}
          {isLoadingAudio && (
            <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3 text-slate-200 space-y-2">
              <div className="flex items-center justify-center gap-3">
                <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-medium">{analysisStatus || t('processingAudio')}</span>
              </div>
              {snap?.state === BC.ANALYZING && snap.duration > 0 && (
                <div className="flex items-center gap-3" id="analysis-preview">
                  <button
                    onClick={() => player.togglePreview()}
                    title={lang === 'en' ? 'Listen to the original while the analysis runs' : 'Послухати оригінал, поки триває аналіз'}
                    className={`p-1.5 rounded-lg border cursor-pointer shrink-0 text-white ${snap.playing ? 'bg-slate-800 hover:bg-slate-700 border-slate-700' : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500'}`}
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
                <p className="text-xs text-slate-400 text-center">{lang === 'en' ? 'You can listen to the original track while the analysis is running.' : 'Поки триває аналіз, можна послухати оригінальний трек.'}</p>
              )}
            </div>
          )}

          {/* Master Playback Transport Bar */}
          <section id="master-transport-bar" className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
            {/* Row 1: cover, title and the usual player controls */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
              <div className="flex items-center gap-3 min-w-0 flex-1 basis-64">
                <div className="w-14 h-14 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                  {track?.cover ? <img src={track.cover} alt="" className="w-full h-full object-cover" /> : <Music className="w-6 h-6 text-slate-300" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h2 id="track-title" className="text-base font-bold text-slate-100 truncate">
                      {track ? track.displayName : (lang === 'en' ? 'Waiting for an audio track' : 'Очікування завантаження аудіотреку')}
                    </h2>
                    {track && (
                      <button
                        id="btn-edit-track"
                        onClick={() => setEditing(true)}
                        title={lang === 'en' ? 'Edit artist, title and cover' : 'Змінити виконавця, назву та обкладинку'}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer shrink-0"
                      >
                        <Pencil className="w-6 h-6" />
                      </button>
                    )}
                  </div>
                  <div id="track-meta-line" className="flex items-center gap-x-3 gap-y-0.5 text-xs text-slate-400 mt-0.5 flex-wrap">
                    <span>{lang === 'en' ? 'Tempo' : 'Темп'}: <strong className="text-slate-200 font-mono">{track && track.originalBpmExact > 0 ? `${track.originalBpmExact.toFixed(1)} BPM` : '—'}</strong>
                      {track?.variableTempo && <em title={lang === 'en' ? 'The tempo changes during the song' : 'Темп змінюється протягом пісні'} className="ml-1.5 not-italic font-bold text-amber-500">{lang === 'en' ? 'variable' : 'змінний'}</em>}
                    </span>
                    <span>•</span>
                    <span>{lang === 'en' ? 'Meter' : 'Розмір'}:{' '}
                      {track?.variableMeter ? (
                        <strong className="text-slate-300" title={lang === 'en' ? 'Meters in the song, most frequent first' : 'Розміри в пісні, від найчастішого'}>
                          <span className="text-amber-500">{lang === 'en' ? 'Variable' : 'Змінний'}</span>: {track.meterLabels.join(', ')}
                        </strong>
                      ) : (
                        <strong className="text-slate-300">{track ? (track.meterLabels[0] ?? track.timeSignature) : '4/4'}</strong>
                      )}
                    </span>
                    {track && (
                      <button
                        id="btn-tempo-map"
                        type="button"
                        onClick={() => setTempoMapOpen(true)}
                        title={lang === 'en' ? 'Tempo map and sections' : 'Карта темпу та секцій'}
                        aria-label={lang === 'en' ? 'Tempo map and sections' : 'Карта темпу та секцій'}
                        className="-my-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer transition-colors duration-150"
                      >
                        <Wrench className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Row 2: tempo, metronome switches, visual beats (they wrap instead of overflowing) */}
            <div className="mt-3 flex flex-wrap items-center gap-2 max-w-full">
                <QuickTempoBar
                  hasTrack={!!track}
                  currentBpm={track?.currentBpm}
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
                onJumpBar={player.jumpBar}
              />
            ) : (
              <button
                type="button"
                onClick={openFilesDialog}
                className="mt-4 w-full border-2 border-dashed border-slate-800 hover:border-slate-600 rounded-xl p-8 text-center cursor-pointer transition-colors bg-slate-950/40 hover:bg-slate-900/40 group block select-none"
              >
                <div className="mx-auto w-12 h-12 rounded-full bg-slate-800/80 group-hover:bg-slate-700 text-slate-400 group-hover:text-slate-200 flex items-center justify-center mb-2.5 transition-colors">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-200">Додайте аудіотрек</p>
                <p className="text-xs text-slate-400 mt-1">Натисніть тут або перетягніть файли у вікно (MP3, WAV, FLAC, OGG)</p>
              </button>
            )}
            {player.message && <p className="mt-3 text-xs text-rose-400">{player.message}</p>}
          </section>

          {/* Under the waveform only the training tools. Before a track is open: just the free metronome. */}
          {track ? (
            <div className="space-y-4">
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
            </div>
          ) : (
            <ClickMetronomePanel
              lang={lang}
              trackKey={activeTrackId ?? ''}
              defaults={{
                bpm: 100,
                beats: currentBeatsPerBar,
                accent: metronomeConfig.accentFirstBeat,
                volume: metronomeConfig.volume,
                sound: player.clickSound,
              }}
              soundCount={player.caps.clickSounds}
              clickBeat={player.snap?.clickBeat ?? -1}
              trackPlaying={isPlaying}
              onPauseTrack={() => { if (isPlaying) player.togglePlay(); }}
            />
          )}

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
          meterModesSupported={player.caps.meterModes}
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

      {player.loopChoice && (
        <LoopConflictDialog
          lang={lang}
          loops={player.loops}
          hits={player.loopChoice.hits}
          canCreate={player.loops.length < MAX_LOOPS}
          isDark={isDark}
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
