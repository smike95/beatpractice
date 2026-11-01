import React, { useEffect, useRef, useState } from 'react';
import { BC } from './core';
import { PlaylistPanel } from './components/PlaylistPanel';
import { BeatPracticeLogo } from './components/BeatPracticeLogo';
import { MetronomeIcon } from './components/MetronomeIcon';
import { TrackMetronomeMixer } from './components/TrackMetronomeMixer';
import { Waveform } from './components/Waveform';
import { LoopsPanel } from './components/LoopsPanel';
import { StemsPanel } from './components/StemsPanel';
import { TrackEditDialog } from './components/TrackEditDialog';
import { ExportDialog } from './components/ExportDialog';
import { Slider } from './components/Slider';
import { Switch } from './components/Switch';
import { WindowControls } from './components/WindowControls';
import { AboutDialog } from './components/AboutDialog';
import { usePlayer } from './player/usePlayer';
import { ThemeMode } from './types';
import { Language, TranslationKey, translations } from './i18n';
import {
  Play,
  Pause,
  RotateCcw,
  Upload,
  Music,
  Music2,
  Sliders,
  Zap,
  Timer,
  ListMusic,
  Sun,
  Moon,
  Monitor,
  Smartphone,
  Languages,
  Loader2,
  Square,
  Repeat,
  Repeat1,
  ListEnd,
  SkipBack,
  SkipForward,
  Pencil,
  Download,
  Info,
} from 'lucide-react';

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

/** BPM field that lets you type freely and applies the value on Enter / blur. */
function BpmInput({ value, onCommit, disabled }: { value: number; onCommit: (bpm: number) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) {
      const v = parseInt(draft, 10);
      if (!isNaN(v) && v >= 20 && v <= 400) onCommit(v);
    }
    setDraft(null);
  };
  return (
    <input
      id="input-quick-bpm"
      type="text"
      inputMode="numeric"
      disabled={disabled}
      value={draft ?? (value > 0 ? String(value) : '—')}
      onFocus={(e) => { setDraft(value > 0 ? String(value) : ''); e.currentTarget.select(); }}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(null); (e.target as HTMLInputElement).blur(); } }}
      className="w-9 text-center text-xs font-mono font-bold text-slate-100 bg-transparent focus:outline-none"
      title="Поточний темп (введіть число і натисніть Enter)"
    />
  );
}

const isWindows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

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
  const [activeTab, setActiveTab] = useState<'metro' | 'training'>('metro');

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
  const SOUNDS: Array<[string, string]> = [
    ['Класичний', 'Classic'], ["Дерев'яний блок", 'Wood block'], ['Хай-хет', 'Hi-hat'],
    ['Рім-клік', 'Rim click'], ['Ковбел', 'Cowbell'], ['Електронний біп', 'Electronic beep'],
  ];
  const TABS = [
    { id: 'metro' as const, Icon: Sliders, label: lang === 'en' ? 'Metronome & tempo' : 'Метроном та темп' },
    { id: 'training' as const, Icon: Timer, label: lang === 'en' ? 'Training' : 'Тренування' },
  ];

  const themeLangButtons = (sfx: string) => (
    <>
      <button
        id={`btn-about${sfx}`}
        onClick={() => setAboutOpen(true)}
        title={lang === 'en' ? 'About BeatPractice' : 'Про програму'}
        aria-label={lang === 'en' ? 'About BeatPractice' : 'Про програму'}
        className="p-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
      >
        <Info className="w-6 h-6" />
      </button>
            {/* Theme Toggle Button */}
            <button
              id={`header-theme-toggle${sfx}`}
              type="button"
              onClick={() => setThemeMode(prev => prev === 'dark' ? 'light' : prev === 'light' ? 'system' : 'dark')}
              className="flex items-center gap-1.5 p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:active:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 text-xs font-semibold transition-all cursor-pointer shadow-2xs select-none"
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
              className="flex items-center gap-1 px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:active:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 text-xs font-semibold transition-all cursor-pointer shadow-2xs select-none"
              title={lang === 'uk' ? 'Switch to English' : 'Перемкнути на українську'}
            >
              <Languages className="w-6 h-6 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
              <span className="font-bold text-xs sm:text-xs">{lang === 'uk' ? 'УКР' : 'ENG'}</span>
            </button>

    </>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-slate-700 selection:text-white">
      {/* Header: emblem + name (above the playlist) and the player controls; stays in place when the page scrolls */}
      <header ref={headerRef} className="relative border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 select-none" data-tauri-drag-region>
        <div className="flex items-stretch" data-tauri-drag-region>
          <div className="flex-1 min-w-0" data-tauri-drag-region>
            <div className="max-w-[1920px] mx-auto flex items-stretch" data-tauri-drag-region>
              <div className="lg:w-[25rem] shrink-0 flex items-center gap-3 px-3 sm:px-4 py-2 pointer-events-none">
                <BeatPracticeLogo className="w-10 h-10 shrink-0" />
                <span className="text-2xl font-black text-slate-100 tracking-tight">BeatPractice</span>
              </div>
              <div className={`flex-1 min-w-0 flex items-center gap-3 px-3 sm:px-6 py-2 ${isWindows ? 'justify-center lg:px-[9rem]' : 'justify-end'}`} data-tauri-drag-region>
                <button
                  id="btn-export-track"
                  onClick={() => setExporting(true)}
                  disabled={!(track && player.ready)}
                  title={lang === 'en' ? 'Export the track with the current tempo and parts' : 'Експортувати трек із поточним темпом і партіями'}
                  className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default shrink-0"
                >
                  <Download className="w-6 h-6" />
                </button>
              {/* Transport: back / play / next / what happens at the end (as in common players) */}
              <div id="transport-cluster" className="flex items-center gap-2 shrink-0">
                <button
                  id="btn-restart-playback"
                  onClick={player.skipBack}
                  disabled={!track}
                  className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors cursor-pointer disabled:opacity-40"
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
                  className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
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
                  className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                    player.playMode === 'stop'
                      ? 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                      : 'bg-sky-600 text-white border-sky-500 hover:bg-sky-500'
                  }`}
                >
                  {player.playMode === 'repeat' ? <Repeat1 className="w-6 h-6" /> : player.playMode === 'next' ? <ListEnd className="w-6 h-6" /> : <Repeat className="w-6 h-6" />}
                </button>
              </div>
                <div className="lg:hidden flex items-center gap-1.5 shrink-0">{themeLangButtons('-small')}</div>
              </div>
            </div>
          </div>
          {isWindows && <div className="absolute top-0 right-0"><WindowControls lang={lang} /></div>}
        </div>
      </header>

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
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 cursor-pointer shrink-0"
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
                  </div>
                </div>
              </div>

            </div>

            {/* Row 2: tempo, metronome switches, visual beats (they wrap instead of overflowing) */}
            <div className="mt-3 flex flex-wrap items-center gap-2 max-w-full">
                {/* 1. Quick Tempo Control Row */}
                <div
                  id="quick-tempo-control-bar"
                  className="w-full sm:w-auto h-10 flex items-center justify-between sm:justify-center gap-1 bg-slate-950 px-1 rounded-xl border border-slate-800 select-none shrink-0"
                >
                  <button
                    type="button"
                    id="btn-quick-tempo-minus-5"
                    onClick={() => handleBpmChange((track?.currentBpm || 120) - 5)}
                    className="h-8 min-w-10 px-2 flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-mono font-bold rounded-lg border border-slate-800 transition-all active:scale-95 cursor-pointer"
                    title={t('decreaseTempo5')}
                  >
                    -5
                  </button>
                  <button
                    type="button"
                    id="btn-quick-tempo-minus-1"
                    onClick={() => handleBpmChange((track?.currentBpm || 120) - 1)}
                    className="h-8 min-w-10 px-2 flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-mono font-bold rounded-lg border border-slate-800 transition-all active:scale-95 cursor-pointer"
                    title={t('decreaseTempo1')}
                  >
                    -1
                  </button>

                  {/* Current BPM input with direct keyboard typing support */}
                  <div className="h-8 flex items-center px-2 bg-slate-900 rounded-lg border border-slate-800 focus-within:border-slate-500 focus-within:ring-1 focus-within:ring-slate-500/50">
                    <BpmInput value={track ? track.currentBpm : 0} onCommit={handleBpmChange} disabled={!track} />
                    <span className="text-xs font-mono text-slate-400 select-none pr-0.5">BPM</span>
                  </div>

                  <button
                    type="button"
                    id="btn-quick-tempo-plus-1"
                    onClick={() => handleBpmChange((track?.currentBpm || 120) + 1)}
                    className="h-8 min-w-10 px-2 flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-mono font-bold rounded-lg border border-slate-800 transition-all active:scale-95 cursor-pointer"
                    title={t('increaseTempo1')}
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    id="btn-quick-tempo-plus-5"
                    onClick={() => handleBpmChange((track?.currentBpm || 120) + 5)}
                    className="h-8 min-w-10 px-2 flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-mono font-bold rounded-lg border border-slate-800 transition-all active:scale-95 cursor-pointer"
                    title={t('increaseTempo5')}
                  >
                    +5
                  </button>

                  {/* Reset to Original Tempo */}
                  <button
                    type="button"
                    id="btn-quick-tempo-reset"
                    onClick={() => track && handleResetBpm()}
                    disabled={!track || track.currentBpm === track.originalBpm}
                    className={`h-8 w-10 flex items-center justify-center rounded-lg border transition-all active:scale-95 cursor-pointer font-bold ${
                      track && track.currentBpm !== track.originalBpm
                        ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-600 shadow-sm'
                        : 'bg-slate-800 border-slate-700 text-slate-400 opacity-60 cursor-not-allowed'
                    }`}
                    title={t('resetOriginalTempo')}
                  >
                    <RotateCcw className="w-6 h-6" />
                  </button>
                </div>

                {/* 2. Quick Metronome Controls */}
                <div
                  id="quick-metronome-control-bar"
                  className="w-full sm:w-auto h-10 flex items-center justify-center bg-slate-950 px-2 sm:px-2.5 py-1 rounded-xl border border-slate-800 select-none shrink-0 box-border overflow-hidden"
                >
                  <div className="flex items-center justify-between sm:justify-center divide-x divide-slate-800/80 h-full w-full whitespace-nowrap">
                    {/* Switch 1: Клік (звужений) */}
                    <div className="flex items-center justify-center gap-1 pl-1 pr-2 sm:pr-2.5 text-center h-full shrink-0">
                      <div className="flex items-center gap-1 shrink-0">
                        <MetronomeIcon className={`w-6 h-6 shrink-0 ${metronomeConfig.enabled ? 'text-slate-200' : 'text-slate-500'}`} />
                        <span className="text-xs sm:text-xs font-semibold text-slate-300">{t('click')}</span>
                      </div>
                      <Switch
                        id="quick-switch-metronome"
                        checked={metronomeConfig.enabled}
                        onChange={() => setMetronomeConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                        title={metronomeConfig.enabled ? t('metronomeOn') : t('metronomeOff')}
                        label={t('click')}
                      />
                    </div>

                    {/* Switch 2: Акцент (звужений) */}
                    <div className="flex items-center justify-center gap-1 px-1.5 sm:px-2 text-center h-full shrink-0">
                      <div className="flex items-center gap-1 shrink-0">
                        <Zap className={`w-6 h-6 shrink-0 ${metronomeConfig.accentFirstBeat ? 'text-slate-200' : 'text-slate-500'}`} />
                        <span className="text-xs sm:text-xs font-semibold text-slate-300">{t('accent')}</span>
                      </div>
                      <Switch
                        id="quick-switch-accent"
                        checked={metronomeConfig.accentFirstBeat}
                        onChange={() => setMetronomeConfig(prev => ({ ...prev, accentFirstBeat: !prev.accentFirstBeat }))}
                        title={metronomeConfig.accentFirstBeat ? t('accentOn') : t('accentOff')}
                        label={t('accent')}
                      />
                    </div>

                    {/* Switch 3: Відлік */}
                    <div className="flex items-center justify-center gap-1 pl-1.5 sm:pl-2 pr-1 text-center h-full shrink-0">
                      <div className="flex items-center gap-1 shrink-0">
                        <Timer className={`w-6 h-6 shrink-0 ${isCountInOn ? 'text-slate-200' : 'text-slate-500'}`} />
                        <span className="text-xs sm:text-xs font-semibold text-slate-300">{t('countIn')}</span>
                      </div>
                      <Switch
                        id="quick-switch-countin"
                        checked={isCountInOn}
                        onChange={() => setMetronomeConfig(prev => ({ ...prev, countInBars: isCountInOn ? 0 : 1, countInOnLoop: !isCountInOn }))}
                        title={isCountInOn ? t('countInOn') : t('countInOff')}
                        label={t('countIn')}
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Quick Metronome Visual Beat Clicks Widget (Shown on desktop & tablet, hidden on mobile) */}
                <div
                  id="quick-metronome-visual-beats"
                  className="flex h-10 items-center justify-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800 select-none shrink-0 box-border overflow-hidden whitespace-nowrap"
                  title={lang === 'en' ? `Metronome visual clicks (${track?.timeSignature || '4/4'})` : `Візуальні кліки метронома (${track?.timeSignature || '4/4'})`}
                >
                  <span className="text-xs text-slate-400 font-mono font-bold mr-0.5">
                    {track?.timeSignature || '4/4'}
                  </span>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: currentBeatsPerBar }).map((_, idx) => {
                      const isActive = (isPlaying || countInRemaining !== null) && (currentBeat % currentBeatsPerBar) === idx;
                      const isFirst = idx === 0;
                      return (
                        <div
                          key={idx}
                          className={`w-6 h-6 rounded flex items-center justify-center font-mono font-bold text-xs transition-all duration-75 select-none ${
                            isActive
                              ? isFirst
                                ? 'bg-rose-500 text-white scale-110 shadow-[0_0_8px_rgba(244,63,94,0.8)] font-black'
                                : 'bg-sky-600 dark:bg-sky-400 text-white dark:text-slate-950 scale-105 shadow-[0_0_8px_rgba(2,132,199,0.8)] dark:shadow-[0_0_8px_rgba(56,189,248,0.8)] beat-non-accent-active font-black'
                              : 'bg-slate-900 text-slate-400 border border-slate-800 beat-inactive'
                          }`}
                        >
                          {idx + 1}
                        </div>
                      );
                    })}
                  </div>
                </div>
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

          {/* Tabs: Metronome & tempo / Training (stem separation is in the folded mixer) */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 flex-wrap">
            {TABS.map(({ id, Icon, label }) => (
              <button
                key={id}
                id={`tab-${id}`}
                onClick={() => setActiveTab(id)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === id
                    ? 'bg-slate-900 text-white border border-slate-900 shadow-2xs dark:bg-slate-800 dark:text-white dark:border-slate-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-900'
                }`}
              >
                <Icon className="w-6 h-6" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* TAB 1: Metronome & tempo */}
          {activeTab === 'metro' && (
            <div className="space-y-4">
              <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <MetronomeIcon className="w-6 h-6 text-slate-200 shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-slate-100 uppercase tracking-wide">{lang === 'en' ? 'Metronome' : 'Метроном'}</div>
                    <div className="text-xs text-slate-400">{lang === 'en' ? 'The click is locked to the real beats of the song.' : 'Клік прив’язаний до справжніх долей пісні й не пливе.'}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{t('countIn')}:</span>
                    {[0, 1, 2].map((n) => (
                      <button
                        key={n}
                        onClick={() => setMetronomeConfig((prev) => ({ ...prev, countInBars: n }))}
                        className={`px-3 py-1 rounded-lg border font-bold cursor-pointer transition-colors ${
                          metronomeConfig.countInBars === n ? 'bg-slate-700 text-white border-slate-500' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        {n === 0 ? 'OFF' : `${n} ${lang === 'en' ? (n === 1 ? 'bar' : 'bars') : n === 1 ? 'такт' : 'такти'}`}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      id="switch-countin-on-loop"
                      checked={metronomeConfig.countInOnLoop}
                      disabled={!isCountInOn}
                      onChange={(v) => setMetronomeConfig((prev) => ({ ...prev, countInOnLoop: v }))}
                      label={lang === 'en' ? 'Count-in before every loop repeat' : 'Відлік перед кожним повтором циклу'}
                    />
                    <span>{lang === 'en' ? 'Count-in before every loop repeat' : 'Відлік перед кожним повтором циклу'}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-300">{lang === 'en' ? 'Metronome sound' : 'Звук метронома'}</div>
                  <div className="flex flex-wrap gap-2">
                    {SOUNDS.map(([uk, en], id) => (
                      <button
                        key={id}
                        disabled={player.caps.clickSounds <= id}
                        onClick={() => player.setClickSound(id)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          player.clickSound === id && player.caps.clickSounds > 0
                            ? 'bg-slate-700 text-white border-sky-500 border-2'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        {lang === 'en' ? en : uk}
                      </button>
                    ))}
                  </div>
                  {player.caps.clickSounds === 0 && (
                    <p className="text-xs text-amber-500">
                      {lang === 'en'
                        ? 'Your build of the core does not have sound choice yet: rebuild beat-core with the updated files (see README).'
                        : 'У вашій збірці ядра ще немає вибору звуку: перезберіть beat-core з оновленими файлами (див. README).'}
                    </p>
                  )}
                </div>
              </section>

              {/* Tempo map (sections found automatically) */}
              <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                  <Music2 className="w-6 h-6" />
                  <span>{lang === 'en' ? 'Tempo map & sections' : 'Карта темпу та секцій'}</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-300">{lang === 'en' ? 'Meter recognition' : 'Розпізнавання розміру'}:</span>
                    {([
                      [0, lang === 'en' ? 'Auto' : 'Авто', lang === 'en' ? 'Balanced: bars of 3 to 7 beats, changes need clear evidence' : 'Збалансовано: такти з 3–7 долей, зміни розміру за чітких ознак'],
                      [1, lang === 'en' ? 'Sensitive' : 'Чутливо', lang === 'en' ? 'Follows the neural network more closely: finds odd and changing meters more readily' : 'Ближче до нейромережі: легше знаходить непарні й змінні розміри'],
                      [2, lang === 'en' ? '3 and 4 only' : 'Лише 3 і 4 долі', lang === 'en' ? 'Only 3/4 and 4/4, changes need strong evidence' : 'Лише 3/4 і 4/4, зміни розміру лише за дуже чітких ознак'],
                    ] as const).map(([m, label, tip]) => (
                      <button
                        key={m}
                        id={`meter-mode-${m}`}
                        title={tip}
                        disabled={!player.ready || !player.caps.meterModes}
                        onClick={() => player.setMeterMode(m)}
                        className={`px-3 py-1 rounded-lg border text-xs font-bold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          player.meterMode === m ? 'bg-slate-700 text-white border-sky-500 border-2' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    {player.caps.meterModes
                      ? (lang === 'en' ? 'If a complex song is shown with the wrong meter, try "Sensitive". Cycles of this track are cleared when the mode changes.' : 'Якщо складний трек показано з хибним розміром, спробуйте «Чутливо». Під час зміни режиму цикли цього треку скидаються.')
                      : (lang === 'en' ? 'Update the core (beat-core) to choose the recognition mode.' : 'Щоб обирати режим розпізнавання, оновіть ядро (beat-core).')}
                  </p>
                </div>
                {sectionRows.length === 0 ? (
                  <p className="text-sm text-slate-400">{lang === 'en' ? 'Open a track to see its sections.' : 'Відкрийте трек, щоб побачити секції.'}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-slate-300">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-800">
                          <th className="py-1.5 pr-3">#</th>
                          <th className="py-1.5 pr-3">{lang === 'en' ? 'Bars' : 'Такти'}</th>
                          <th className="py-1.5 pr-3">{lang === 'en' ? 'Time' : 'Час'}</th>
                          <th className="py-1.5 pr-3">{lang === 'en' ? 'Meter' : 'Розмір'}</th>
                          <th className="py-1.5 pr-3">BPM</th>
                          <th className="py-1.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {sectionRows.map((sec, i) => (
                          <tr key={i} className="border-b border-slate-800/60">
                            <td className="py-1.5 pr-3 font-mono">{i + 1}</td>
                            <td className="py-1.5 pr-3 font-mono">{sec.firstBar}–{sec.lastBar} ({sec.bars})</td>
                            <td className="py-1.5 pr-3 font-mono">{formatTime(sec.startTime / speed)}–{formatTime(sec.endTime / speed)}</td>
                            <td className="py-1.5 pr-3 font-mono font-bold">{sec.label}</td>
                            <td className="py-1.5 pr-3 font-mono">{sec.bpm > 0 ? Math.round(sec.bpm * speed) : '—'}</td>
                            <td className="py-1.5 text-right whitespace-nowrap">
                              <button onClick={() => handleSeek(sec.loopStart)} className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer">{lang === 'en' ? 'Go to' : 'Перейти'}</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 2: Training (more tools will be added here) */}
          {activeTab === 'training' && (
            <div className="space-y-4">
              <LoopsPanel
                loops={player.loops}
                activeLoop={player.activeLoop}
                selectedLoop={player.selectedLoop}
                barTimes={player.barTimes}
                duration={track?.duration ?? 0}
                ready={player.ready}
                lang={lang}
                maxLoops={3}
                currentBar={currentBarNumber}
                onSelect={player.setSelectedLoop}
                onActivate={player.activateLoop}
                onUpdate={player.updateLoop}
                onAdd={player.addLoop}
                onRemove={player.removeLoop}
              />
              <div className="flex items-center gap-3 rounded-xl border border-slate-800 px-3 py-2 text-sm">
                <Switch
                  id="switch-countin-on-loop-loops-tab"
                  checked={metronomeConfig.countInOnLoop}
                  disabled={!isCountInOn}
                  onChange={(v) => setMetronomeConfig((prev) => ({ ...prev, countInOnLoop: v }))}
                  label={lang === 'en' ? 'Count-in before every loop repeat' : 'Відлік перед кожним повтором циклу'}
                  title={isCountInOn ? undefined : (lang === 'en' ? 'Turn the count-in on first (Metronome tab)' : 'Спершу увімкніть відлік (вкладка «Метроном»)')}
                />
                <span>{lang === 'en' ? 'Count-in before every loop repeat' : 'Відлік перед кожним повтором циклу'}</span>
              </div>
            </div>
          )}

        </main>
      </div>

      {aboutOpen && <AboutDialog lang={lang} onClose={() => setAboutOpen(false)} />}

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
          countInBars={player.metronomeConfig.countInBars}
          loop={loop}
          onClose={() => setExporting(false)}
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
