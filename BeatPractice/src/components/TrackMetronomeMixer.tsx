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
      className="border rounded-xl px-3 sm:px-4 py-2 shadow-2xs flex flex-wrap items-center justify-between gap-2.5 text-xs select-none bg-canvas/80 border-line/90"
    >
      <button
        type="button"
        id="btn-mixer-toggle"
        onClick={onExpandedToggle}
        aria-expanded={expanded}
        aria-controls="mixer-details"
        title={expanded ? (lang === 'en' ? 'Fold the mixer' : 'Згорнути мікшер') : (lang === 'en' ? 'Unfold the mixer' : 'Розгорнути мікшер')}
        className="flex items-center gap-1.5 font-semibold uppercase tracking-wider shrink-0 cursor-pointer rounded-lg px-2.5 mr-2 min-h-11 sm:min-h-9 transition-colors text-ink-3 hover:bg-control/70"
      >
        <Sliders className="w-6 h-6 text-ink-2" />
        <span className="text-xs font-bold text-ink-2">{lang === 'en' ? 'Mixer' : 'Мікшер'}</span>
        <ChevronDown className={`w-4 h-4 transition-transform  text-ink-3${expanded ? 'rotate-180' : ''}`} />
      </button>

      <div className="flex-1 min-w-[260px] sm:min-w-[500px] grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 items-center">
        {/* Track Volume Channel */}
        <div className="flex items-center gap-2 px-3 py-0.5 sm:py-2 rounded-lg border mixer-channel-box shadow-2xs bg-surface/90 border-line/80">
          <button
            type="button"
            onClick={onTrackMuteToggle}
            className={`flex items-center gap-1 min-h-11 sm:min-h-0 font-semibold shrink-0 cursor-pointer transition-colors ${
              isTrackMuted ? 'text-rose-500 font-bold' : 'text-ink-2 hover:text-ink'
            }`}
            title={isTrackMuted ? 'Увімкнути звук треку' : 'Заглушити трек'}
          >
            <Music className="w-6 h-6 mixer-icon text-ink-2" />
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

          <span className="font-mono font-bold w-11 shrink-0 text-right text-xs mixer-value text-ink-2">
            {isTrackMuted ? 'Mute' : `${trackPercent}%`}
          </span>
        </div>

        {/* Metronome Volume Channel */}
        <div className="flex items-center gap-2 px-3 py-0.5 sm:py-2 rounded-lg border mixer-channel-box shadow-2xs bg-surface/90 border-line/80">
          <button
            type="button"
            onClick={onMetronomeToggle}
            className={`flex items-center gap-1 min-h-11 sm:min-h-0 font-semibold shrink-0 cursor-pointer transition-colors ${
              isMetronomeEnabled ? 'text-ink-2 hover:text-ink' : 'text-ink-4 hover:text-ink-3'
            }`}
            title={isMetronomeEnabled ? 'Вимкнути метроном' : 'Увімкнути метроном'}
          >
            <MetronomeIcon className={`w-6 h-6 mixer-icon ${isMetronomeEnabled ? 'text-ink-2' : 'text-ink-4'}`} />
            <span className="mixer-label">{lang === 'en' ? 'Metronome' : 'Метроном'}</span>
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

          <span className="font-mono font-bold w-11 shrink-0 text-right text-xs mixer-value text-ink-2">
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
