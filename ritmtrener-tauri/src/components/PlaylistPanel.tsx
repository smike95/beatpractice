import React from 'react';
import { PlaylistItem } from '../types';
import { ListMusic, Plus, Trash2, Play, Music } from 'lucide-react';
import { Language, translations } from '../i18n';
import { displayName } from '../player/usePlayer';

interface PlaylistPanelProps {
  playlist: PlaylistItem[];
  activeTrackId: string | null;
  isPlaying: boolean;
  onSelectTrack: (item: PlaylistItem) => void;
  onRemoveTrack: (id: string, e: React.MouseEvent) => void;
  onOpenAddFiles: () => void;
  isSidebar?: boolean;
  lang?: Language;
}

const formatDuration = (seconds: number): string => {
  if (isNaN(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const formatTotalDuration = (seconds: number): string => {
  if (isNaN(seconds) || seconds <= 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs} год ${mins} хв`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const PlaylistPanel: React.FC<PlaylistPanelProps> = ({
  playlist,
  activeTrackId,
  isPlaying,
  onSelectTrack,
  onRemoveTrack,
  onOpenAddFiles,
  isSidebar = false,
  lang = 'uk'
}) => {
  const t = (key: keyof typeof translations.uk) => (translations[lang] || translations.uk)[key] || key;
  const containerClasses = isSidebar
    ? 'flex flex-col h-full w-full'
    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm dark:shadow-xl flex flex-col';

  return (
    <div id="playlist-panel" className={containerClasses}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2 select-none">
          <ListMusic className="w-6 h-6 text-slate-700 dark:text-slate-300 shrink-0" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
            {t('playlist')}: {playlist.length}
          </h3>
        </div>

        <button
          type="button"
          id="btn-add-more-tracks"
          onClick={onOpenAddFiles}
          className="px-2.5 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 active:bg-slate-950 dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-lg flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-xs"
          title={t('addTrack')}
        >
          <Plus className="w-6 h-6" />
          <span>{t('addTrack')}</span>
        </button>
      </div>

      {/* Track List */}
      <div className="flex-1 min-h-0 overflow-y-auto mt-3 pr-1 space-y-2">
        {playlist.length === 0 ? (
          <div
            onClick={onOpenAddFiles}
            className="border-2 border-dashed border-slate-200 dark:border-slate-800/90 hover:border-slate-400 dark:hover:border-slate-600 rounded-xl p-5 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-100/60 dark:hover:bg-slate-900/40 group mt-2"
          >
            <Music className="w-6 h-6 text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300 mx-auto mb-1.5 transition-colors" />
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">
              {t('emptyPlaylist')}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('emptyPlaylistSub')}
            </p>
          </div>
        ) : (
          playlist.map((item) => {
            const isActive = item.id === activeTrackId;
            return (
              <div
                key={item.id}
                id={`playlist-item-${item.id}`}
                onClick={() => onSelectTrack(item)}
                className={`relative p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none ${
                  isActive
                    ? 'bg-slate-100 dark:bg-slate-800 border-slate-400 dark:border-slate-600 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'bg-slate-50/70 hover:bg-slate-100 dark:bg-slate-950/60 dark:hover:bg-slate-800/60 border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* Play or active animated icon */}
                  {item.cover ? (
                    <img src={item.cover} alt="" className={`w-10 h-10 rounded-md object-cover shrink-0 ${isActive ? 'ring-2 ring-sky-500' : ''}`} />
                  ) : (
                  <div
                    className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
                      isActive
                        ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-xs'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {isActive && isPlaying ? (
                      <div className="flex items-end gap-0.5 h-4">
                        <span className="w-0.5 bg-current rounded-full animate-bounce h-4" />
                        <span className="w-0.5 bg-current rounded-full animate-bounce h-2.5 [animation-delay:0.15s]" />
                        <span className="w-0.5 bg-current rounded-full animate-bounce h-4 [animation-delay:0.3s]" />
                      </div>
                    ) : (
                      <Play className="w-6 h-6 fill-current" />
                    )}
                  </div>
                  )}

                  {/* Song Details */}
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-bold truncate ${isActive ? 'text-slate-950 dark:text-white font-black' : 'text-slate-800 dark:text-slate-200'}`}>
                      {displayName(item)}
                    </p>
                    <div className="flex flex-nowrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono whitespace-nowrap">
                      <span>{formatDuration(item.trackInfo.duration)}</span>
                      <span>•</span>
                      <span className={`font-semibold ${isActive ? 'text-slate-900 dark:text-slate-200 font-bold' : 'text-slate-600 dark:text-slate-400'}`}>
                        {(item.trackInfo.originalBpmExact ?? item.trackInfo.originalBpm) > 0 ? `${(item.trackInfo.originalBpmExact ?? item.trackInfo.originalBpm).toFixed(1)} BPM` : '—'}
                      </span>
                      <span>•</span>
                      <span>{item.trackInfo.timeSignature}</span>
                    </div>
                  </div>
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  id={`btn-remove-track-${item.id}`}
                  onClick={(e) => onRemoveTrack(item.id, e)}
                  className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:text-slate-500 dark:hover:text-rose-400 dark:hover:bg-rose-950/30 rounded-lg transition-colors shrink-0 cursor-pointer"
                  title={t('deleteTrack')}
                >
                  <Trash2 className="w-6 h-6" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Summary Divider & Track Count / Total Duration */}
      <div
        id="playlist-bottom-summary"
        className="pt-3 mt-2 border-t border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 select-none px-1"
      >
        <div className="flex items-center gap-1.5">
          <span>Треків:</span>
          <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">{playlist.length}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span>Час:</span>
          <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">
            {formatTotalDuration(
              playlist.reduce((acc, curr) => acc + (curr.trackInfo?.duration || 0), 0)
            )}
          </span>
        </div>
      </div>
    </div>
  );
};
