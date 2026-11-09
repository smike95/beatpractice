import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlaylistItem, PlaylistTag } from '../types';
import { ChevronRight, Pin, PinOff, Plus, Search, Trash2, Music, GripVertical, Tag, X } from 'lucide-react';
import { BeatPracticeLogo } from './BeatPracticeLogo';
import { CoverPlaceholder } from './CoverPlaceholder';
import { Language, translations } from '../i18n';
import { displayName } from '../player/usePlayer';
import { Modal } from './ui/Modal';
import { btn } from './ui/styles';
import { ManageTagsDialog, TrackTagsDialog } from './TagDialogs';

interface PlaylistPanelProps {
  playlist: PlaylistItem[];
  activeTrackId: string | null;
  isPlaying: boolean;
  onSelectTrack: (item: PlaylistItem) => void;
  onRemoveTrack: (id: string, e: React.MouseEvent) => void;
  onOpenAddFiles: () => void;
  onReorder: (from: number, to: number) => void;
  footer?: React.ReactNode;
  isSidebar?: boolean;
  lang?: Language;
  /** narrow strip: the emblem, the covers of the tracks and an arrow at the bottom */
  compact?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
  onExpand?: () => void;
  /** tags of the tracks (all optional: without `tags` the panel has no tag controls) */
  tags?: PlaylistTag[];
  onToggleTag?: (itemId: string, tagId: string) => void;
  onAddTagToItem?: (itemId: string, name: string) => void;
  onCreateTag?: (name: string) => void;
  onRenameTag?: (id: string, name: string) => boolean;
  onDeleteTag?: (id: string) => void;
  /** a tag shown as a saved list with its own order of the tracks */
  tagView?: string | null;
  onTagView?: (id: string | null) => void;
  viewList?: PlaylistItem[];
  onReorderInTag?: (from: number, to: number) => void;
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
  onReorder,
  footer,
  isSidebar = false,
  lang = 'uk',
  compact = false,
  pinned = false,
  onTogglePin,
  onExpand,
  tags,
  onToggleTag,
  onAddTagToItem,
  onCreateTag,
  onRenameTag,
  onDeleteTag,
  tagView = null,
  onTagView,
  viewList,
  onReorderInTag,
}) => {
  const t = (key: keyof typeof translations.uk) => (translations[lang] || translations.uk)[key] || key;
  const containerClasses = isSidebar
    ? 'flex flex-col h-full w-full'
    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm dark:shadow-xl flex flex-col';

  // ---- reordering with the grip handle (pointer events: HTML5 drag-and-drop does not work reliably in the app window) ----
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [drag, setDrag] = useState<{ id: string; from: number; ins: number } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PlaylistItem | null>(null);

  // the list that is shown: the whole playlist, or the tracks of the chosen tag in the order they have inside that tag
  const inTagView = !!tagView && !!viewList && !!onReorderInTag;
  const base = inTagView ? viewList! : playlist;
  const insertionAt = (clientY: number): number => {
    for (let i = 0; i < base.length; i++) {
      const el = itemRefs.current[base[i].id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return base.length;
  };
  const onGripDown = (e: React.PointerEvent, id: string, from: number) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({ id, from, ins: from });
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const list = listRef.current;
    if (list) {
      const r = list.getBoundingClientRect();
      if (e.clientY < r.top + 24) list.scrollTop -= 14;
      else if (e.clientY > r.bottom - 24) list.scrollTop += 14;
    }
    const ins = insertionAt(e.clientY);
    if (ins !== drag.ins) setDrag({ ...drag, ins });
  };
  const onGripUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const to = drag.ins > drag.from ? drag.ins - 1 : drag.ins;
    setDrag(null);
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (to !== drag.from) (inTagView ? onReorderInTag! : onReorder)(drag.from, to);
  };

  // ---- search: the list is filtered while typing; Enter / the button opens the first track found ----
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  // ---- tags: filter chips (a track must have all the chosen tags), the dialogs ----
  const hasTags = !!tags && !!onToggleTag && !!onAddTagToItem && !!onCreateTag && !!onRenameTag && !!onDeleteTag;
  const [tagItemId, setTagItemId] = useState<string | null>(null);
  const [manageTags, setManageTags] = useState(false);
  const allTags = tags ?? [];
  const tagName = (id: string) => allTags.find((t) => t.id === id)?.name;
  const tagCounts: Record<string, number> = {};
  playlist.forEach((it) => (it.tags ?? []).forEach((id) => { tagCounts[id] = (tagCounts[id] ?? 0) + 1; }));
  const filtered = q !== '';
  const visible = base
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => q === '' || displayName(item).toLowerCase().includes(q))
    ;
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q !== '' && visible.length > 0) onSelectTrack(visible[0].item);
  };
  const coverOf = (item: PlaylistItem, isActive: boolean, size: string) =>
    item.cover ? (
      <img src={item.cover} alt="" className={`${size} rounded-md object-cover shrink-0 ${isActive ? 'ring-2 ring-sky-500' : ''}`} />
    ) : (
      <CoverPlaceholder className={size} active={isActive} />
    );

  if (compact) {
    return (
      <div id="playlist-panel" className="flex h-full w-full flex-col items-center">
        <div className="mac-top-space" data-tauri-drag-region />
        <div className="shrink-0 pb-3 pointer-events-none" data-tauri-drag-region><BeatPracticeLogo className="w-9 h-9" /></div>
        <div className="flex-1 min-h-0 w-full overflow-y-auto flex flex-col items-center gap-2 py-1">
          {base.map((item) => (
            <button key={item.id} type="button" onClick={() => onSelectTrack(item)} title={displayName(item)} aria-label={displayName(item)} className="shrink-0 rounded-lg cursor-pointer">
              {coverOf(item, item.id === activeTrackId, 'w-10 h-10')}
            </button>
          ))}
        </div>
        <button
          type="button"
          id="btn-expand-playlist"
          onClick={onExpand}
          title={lang === 'en' ? 'Show the playlist' : 'Показати плейліст'}
          aria-label={lang === 'en' ? 'Show the playlist' : 'Показати плейліст'}
          className="mt-2 shrink-0 w-10 h-10 flex items-center justify-center rounded-xl text-slate-300 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    );
  }

  return (
    <div id="playlist-panel" className={containerClasses}>
      {/* Emblem and name (left), the pin (right) */}
      <div className="mac-top-space" data-tauri-drag-region />
      <div className="flex items-center gap-2 shrink-0" data-tauri-drag-region>
        <BeatPracticeLogo className="w-9 h-9 shrink-0 pointer-events-none" />
        <span className="flex-1 min-w-0 truncate text-left text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 pointer-events-none">BeatPractice</span>
        {onTogglePin && (
          <button
            type="button"
            id="btn-pin-playlist"
            onClick={onTogglePin}
            aria-pressed={pinned}
            title={pinned ? (lang === 'en' ? 'Unpin: the playlist folds into a strip' : 'Відкріпити: плейліст згортається у смугу') : (lang === 'en' ? 'Pin: keep the playlist open' : 'Закріпити: плейліст завжди відкритий')}
            aria-label={pinned ? (lang === 'en' ? 'Unpin the playlist' : 'Відкріпити плейліст') : (lang === 'en' ? 'Pin the playlist' : 'Закріпити плейліст')}
            className={`w-6 h-6 shrink-0 flex items-center justify-center rounded-md cursor-pointer transition-colors ${pinned ? 'seg-on' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'}`}
          >
            {pinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Search (live) with its button, and adding tracks */}
      <form onSubmit={submitSearch} role="search" className="flex items-center gap-2 mt-3 shrink-0">
        <div className="relative flex-1 min-w-0">
          <input
            id="playlist-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
            placeholder={lang === 'en' ? 'Search the playlist' : 'Пошук у плейлісті'}
            aria-label={lang === 'en' ? 'Search the playlist' : 'Пошук у плейлісті'}
            className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 pl-3 pr-8 text-sm text-slate-100 placeholder:text-slate-500"
          />
          {query !== '' && (
            <button type="button" onClick={() => setQuery('')} title={lang === 'en' ? 'Clear' : 'Очистити'} aria-label={lang === 'en' ? 'Clear' : 'Очистити'}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-100 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          type="submit"
          id="btn-playlist-search"
          title={lang === 'en' ? 'Open the first track found' : 'Відкрити перший знайдений трек'}
          aria-label={lang === 'en' ? 'Open the first track found' : 'Відкрити перший знайдений трек'}
          className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
        >
          <Search className="w-5 h-5" />
        </button>
        <button
          type="button"
          id="btn-add-more-tracks"
          onClick={onOpenAddFiles}
          className="h-10 px-3 shrink-0 text-xs font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-100 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          title={t('addTrack')}
        >
          <Plus className="w-5 h-5" />
          <span className="whitespace-nowrap">{t('addTrack')}</span>
        </button>
      </form>

      {hasTags && (playlist.length > 0 || allTags.length > 0) && (
        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-1.5" role="group" aria-label={lang === 'en' ? 'Filter by tags' : 'Фільтр за тегами'}>
          {allTags.map((tg) => (
            <button key={tg.id} type="button" aria-pressed={tagView === tg.id}
              onClick={() => onTagView?.(tagView === tg.id ? null : tg.id)}
              className={`${btn.chip(tagView === tg.id)} rounded-full !min-h-7 sm:!min-h-7 px-2.5`}>
              {tg.name}
            </button>
          ))}
          <button type="button" id="btn-manage-tags" onClick={() => setManageTags(true)}
            title={lang === 'en' ? 'Manage tags' : 'Керувати тегами'} aria-label={lang === 'en' ? 'Manage tags' : 'Керувати тегами'}
            className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer">
            <Tag className="h-4 w-4" />{lang === 'en' ? 'Tags' : 'Теги'}
          </button>
        </div>
      )}

      {inTagView && (
        <p className="mt-1.5 shrink-0 text-xs text-slate-400">
          {lang === 'en'
            ? `Saved list of the tag “${tagName(tagView!) ?? ''}”: drag the tracks to order them here; the main playlist keeps its own order.`
            : `Збережений список тегу «${tagName(tagView!) ?? ''}»: перетягуйте треки, щоб впорядкувати їх тут; головний плейліст зберігає свій порядок.`}
        </p>
      )}

      {/* Track List */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto mt-3 pr-1 space-y-2">
        {playlist.length === 0 ? (
          <div
            onClick={onOpenAddFiles}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpenAddFiles(); } }}
            className="group border-2 border-dashed border-slate-200 dark:border-slate-800/90 hover:border-slate-400 dark:hover:border-slate-600 rounded-xl p-5 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-100/60 dark:hover:bg-slate-900/40 group mt-2"
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
          visible.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-slate-400">{lang === 'en' ? 'Nothing found' : 'Нічого не знайдено'}</p>
          ) : visible.map(({ item, index }) => {
            const isActive = item.id === activeTrackId;
            const showLineBefore = !filtered && drag && drag.ins === index && drag.ins !== drag.from && drag.ins !== drag.from + 1;
            const showLineAfter = !filtered && drag && index === base.length - 1 && drag.ins === base.length && drag.from !== base.length - 1;
            return (
              <React.Fragment key={item.id}>
              {showLineBefore && <div className="h-1 rounded-full bg-sky-500 -my-1" />}
              <div
                ref={(el) => { itemRefs.current[item.id] = el; }}
                id={`playlist-item-${item.id}`}
                onClick={() => onSelectTrack(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelectTrack(item); } }}
                className={`relative p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none ${
                  drag?.id === item.id ? 'opacity-50 ' : ''}${isActive
                    ? 'bg-slate-100 dark:bg-slate-800 border-slate-400 dark:border-slate-600 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'bg-slate-50/70 hover:bg-slate-100 dark:bg-slate-950/60 dark:hover:bg-slate-800/60 border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1 min-w-0 flex-1">
                  {/* Grip handle: drag to move the track (not while the list is filtered) */}
                  {!filtered && <button
                    type="button"
                    className="p-2.5 sm:p-1.5 -ml-2.5 sm:-ml-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing touch-none shrink-0 rounded-lg transition-colors duration-150"
                    title={lang === 'en' ? 'Drag to change the order' : 'Перетягніть, щоб змінити порядок'}
                    aria-label={lang === 'en' ? 'Drag to change the order' : 'Перетягніть, щоб змінити порядок'}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => onGripDown(e, item.id, index)}
                    onPointerMove={onGripMove}
                    onPointerUp={onGripUp}
                    onPointerCancel={() => setDrag(null)}
                  >
                    <GripVertical className="w-6 h-6" />
                  </button>}
                  {/* Play or active animated icon */}
                  {item.cover ? (
                    <img src={item.cover} alt="" className={`w-10 h-10 rounded-md object-cover shrink-0 ${isActive ? 'ring-2 ring-sky-500' : ''}`} />
                  ) : (
                  <CoverPlaceholder className="w-10 h-10" active={isActive}>
                    {isActive && isPlaying ? (
                      <div className="flex items-end gap-0.5 h-4">
                        <span className="w-0.5 bg-current rounded-full animate-bounce h-4" />
                        <span className="w-0.5 bg-current rounded-full animate-bounce h-2.5 [animation-delay:0.15s]" />
                        <span className="w-0.5 bg-current rounded-full animate-bounce h-4 [animation-delay:0.3s]" />
                      </div>
                    ) : undefined}
                  </CoverPlaceholder>
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
                    {hasTags && (item.tags ?? []).some((id) => tagName(id)) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(item.tags ?? []).map((id) => tagName(id) && (
                          <span key={id} className="rounded-full bg-sky-500/15 px-2 py-px text-xs font-semibold leading-4 text-sky-500">{tagName(id)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {hasTags && (
                  <button
                    type="button"
                    id={`btn-track-tags-${item.id}`}
                    onClick={(e) => { e.stopPropagation(); setTagItemId(item.id); }}
                    className="p-2.5 sm:p-1.5 text-slate-400 hover:text-sky-500 hover:bg-sky-500/10 rounded-lg transition-colors shrink-0 cursor-pointer"
                    title={lang === 'en' ? 'Tags of the track' : 'Теги треку'}
                    aria-label={lang === 'en' ? 'Tags of the track' : 'Теги треку'}
                  >
                    <Tag className="w-6 h-6" />
                  </button>
                )}

                {/* Delete button */}
                <button
                  type="button"
                  id={`btn-remove-track-${item.id}`}
                  onClick={(e) => { e.stopPropagation(); setPendingDelete(item); }}
                  className="p-2.5 sm:p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:text-slate-500 dark:hover:text-rose-400 dark:hover:bg-rose-950/30 rounded-lg transition-colors shrink-0 cursor-pointer"
                  title={t('deleteTrack')}
                >
                  <Trash2 className="w-6 h-6" />
                </button>
              </div>
              {showLineAfter && <div className="h-1 rounded-full bg-sky-500 -my-1" />}
              </React.Fragment>
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
          <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">{filtered || inTagView ? `${visible.length} / ${playlist.length}` : playlist.length}</span>
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

      {footer && <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800 shrink-0">{footer}</div>}

      {hasTags && tagItemId && playlist.find((it) => it.id === tagItemId) && createPortal(
        <TrackTagsDialog lang={lang === 'en' ? 'en' : 'uk'} item={playlist.find((it) => it.id === tagItemId)!} tags={allTags}
          onToggle={onToggleTag!} onCreateForItem={onAddTagToItem!} onClose={() => setTagItemId(null)} />,
        document.body
      )}
      {hasTags && manageTags && createPortal(
        <ManageTagsDialog lang={lang === 'en' ? 'en' : 'uk'} tags={allTags} counts={tagCounts}
          onCreate={(n) => { onCreateTag!(n); }} onRename={onRenameTag!} onDelete={onDeleteTag!} onClose={() => setManageTags(false)} />,
        document.body
      )}

      {pendingDelete && createPortal(
        <Modal id="confirm-delete-track" role="alertdialog" width="md" layer="z-[100]" onClose={() => setPendingDelete(null)}>
          <p className="text-base font-bold">{lang === 'en' ? 'Remove this track from the playlist?' : 'Видалити цей трек із плейліста?'}</p>
          <p className="text-sm break-words">{displayName(pendingDelete)}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button className={btn.neutral} onClick={() => setPendingDelete(null)}>
              {lang === 'en' ? 'Cancel' : 'Скасувати'}
            </button>
            <button
              id="btn-confirm-delete-track"
              autoFocus
              className={btn.danger}
              onClick={() => { const id = pendingDelete.id; setPendingDelete(null); onRemoveTrack(id, { stopPropagation: () => {} } as React.MouseEvent); }}
            >
              {lang === 'en' ? 'Remove' : 'Видалити'}
            </button>
          </div>
        </Modal>,
        document.body
      )}
    </div>
  );
};
