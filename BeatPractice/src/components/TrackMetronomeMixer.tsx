import React from 'react';
import { Slider } from './Slider';
import { Sliders, Music, ChevronDown } from 'lucide-react';
import { MetronomeIcon } from './MetronomeIcon';

interface TrackMetronomeMixerProps {
  trackVolume: number; // 0 to 1.0
  onTrackVolumeChange: (vol: number) => void;
  isTrackMuted?: boolean;
  onTrackMuteToggle?: () => void;

  metronomeVolume: number; // 0 to 2.0
  isMetronomeEnabled: boolean;
  onMetronomeVolumeChange: (vol: number) => void;
  onMetronomeToggle: () => void;

  /** Folded part under the volume sliders (stem separation). */
  expanded?: boolean;
  onExpandedToggle?: () => void;
  lang?: 'uk' | 'en';
  children?: React.ReactNode;
}

export const TrackMetronomeMixer: React.FC<TrackMetronomeMixerProps> = ({
  trackVolume,
  onTrackVolumeChange,
  isTrackMuted = false,
  onTrackMuteToggle,
  metronomeVolume,
  isMetronomeEnabled,
  onMetronomeVolumeChange,
  onMetronomeToggle,
  expanded = false,
  onExpandedToggle,
  lang = 'uk',
  children
}) => {
  const trackPercent = Math.round(trackVolume * 100);
  const metronomePercent = Math.round(metronomeVolume * 100);

  return (
    <div
      id="dual-volume-mixer"
      className="bg-slate-100/90 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/90 rounded-xl px-3 sm:px-4 py-2 shadow-2xs flex flex-wrap items-center justify-between gap-2.5 text-xs select-none"
    >
      <button
        type="button"
        id="btn-mixer-toggle"
        onClick={onExpandedToggle}
        aria-expanded={expanded}
        aria-controls="mixer-details"
        title={expanded ? (lang === 'en' ? 'Fold the mixer' : 'Згорнути мікшер') : (lang === 'en' ? 'Unfold the mixer: stem separation' : 'Розгорнути мікшер: розділення на партії')}
        className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider shrink-0 cursor-pointer rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-slate-200/70 dark:hover:bg-slate-800/70 transition-colors"
      >
        <Sliders className="w-6 h-6 text-slate-700 dark:text-slate-300" />
        <span className="text-xs text-slate-700 dark:text-slate-300 font-bold">{lang === 'en' ? 'Mixer' : 'Мікшер'}</span>
        <ChevronDown className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      <div className="flex-1 min-w-[260px] grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 items-center">
        {/* Track Volume Channel */}
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900/90 px-3 py-1.5 sm:py-2 rounded-lg border border-slate-200 dark:border-slate-800/80 mixer-channel-box shadow-2xs">
          <button
            type="button"
            onClick={onTrackMuteToggle}
            className={`flex items-center gap-1 font-semibold shrink-0 cursor-pointer transition-colors ${
              isTrackMuted ? 'text-rose-500 font-bold' : 'text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white'
            }`}
            title={isTrackMuted ? 'Увімкнути звук треку' : 'Заглушити трек'}
          >
            <Music className="w-6 h-6 text-slate-600 dark:text-slate-300 mixer-icon" />
            <span className="mixer-label">Трек</span>
          </button>

          <Slider
            id="range-mixer-track-volume"
            min={0}
            max={1.0}
            step={0.01}
            value={isTrackMuted ? 0 : trackVolume}
            onChange={onTrackVolumeChange}
            title={`Гучність треку: ${trackPercent}%`}
            className="flex-1 min-w-[70px]"
          />

          <span className="font-mono font-bold text-slate-800 dark:text-slate-200 w-10 text-right text-xs mixer-value">
            {isTrackMuted ? 'Mute' : `${trackPercent}%`}
          </span>
        </div>

        {/* Metronome Volume Channel */}
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900/90 px-3 py-1.5 sm:py-2 rounded-lg border border-slate-200 dark:border-slate-800/80 mixer-channel-box shadow-2xs">
          <button
            type="button"
            onClick={onMetronomeToggle}
            className={`flex items-center gap-1 font-semibold shrink-0 cursor-pointer transition-colors ${
              isMetronomeEnabled ? 'text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400'
            }`}
            title={isMetronomeEnabled ? 'Вимкнути метроном' : 'Увімкнути метроном'}
          >
            <MetronomeIcon className={`w-6 h-6 mixer-icon ${isMetronomeEnabled ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`} />
            <span className="mixer-label">Клік</span>
          </button>

          <Slider
            id="range-mixer-metronome-volume"
            min={0}
            max={2.0}
            step={0.01}
            value={metronomeVolume}
            onChange={onMetronomeVolumeChange}
            title={`Гучність метронома: ${metronomePercent}%`}
            className="flex-1 min-w-[70px]"
          />

          <span className="font-mono font-bold text-slate-800 dark:text-slate-200 w-10 text-right text-xs mixer-value">
            {metronomePercent}%
          </span>
        </div>
      </div>

      {expanded && (
        <div id="mixer-details" className="basis-full w-full pt-1">
          {children}
        </div>
      )}
    </div>
  );
};
