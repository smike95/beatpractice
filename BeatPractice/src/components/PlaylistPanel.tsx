import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlaylistItem, PlaylistTag } from '../types';
import { ChevronRight, Pause, Pin, PinOff, Plus, Search, Trash2, Music, Play, Tag, X } from 'lucide-react';
import { CoverPlaceholder } from './CoverPlaceholder';
import { Language, translations } from '../i18n';
import { displayName } from '../player/usePlayer';
import { Modal } from './ui/Modal';
import { formatBpmRange } from '../utils/bpm';
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
  /** save the playlist or a tag as one library file (desktop) */
}

/** The small mark of the current track: play while it sounds, pause while it is paused. */
const NowMark: React.FC<{ playing: boolean; lang: Language }> = ({ playing, lang }) => {
  const label = playing ? (lang === 'en' ? 'Playing' : 'Грає') : (lang === 'en' ? 'Paused' : 'Пауза');
  const Icon = playing ? Play : Pause;
  return <span role="img" aria-label={label} title={label} className="flex h-[11px] w-[11px] shrink-0 items-center justify-center text-accent-text"><Icon className="icon-mark" fill="currentColor" strokeWidth={0} /></span>;
};

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
    : 'border rounded-2xl p-4 shadow-sm flex flex-col bg-surface border-line shadow-xl';

  // ---- reordering with the grip handle (pointer events: HTML5 drag-and-drop does not work reliably in the app window) ----
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [drag, setDrag] = useState<{ id: string; from: number; ins: number } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PlaylistItem | null>(null);
  // the "Керувати" mode: only in it the tiles show the drag handles, the tag and the delete buttons
  const [manage, setManage] = useState(false);
  useEffect(() => { if (playlist.length === 0) setManage(false); }, [playlist.length]);
  useEffect(() => { if (compact) setManage(false); }, [compact]);
  // any action in the main window (a press on a button, a field, the waveform...; scrolling is not one) ends the Edit mode
  useEffect(() => {
    if (!manage) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || !t.closest) return;
      if (t.closest('#playlist-panel') || t.closest('.bp-modal-overlay')) return;
      if (t.closest('button, a, input, select, textarea, canvas, label, [role="button"], [role="switch"], [role="tab"], [role="option"]')) setManage(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [manage]);

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
      <img src={item.cover} alt="" className={`${size} rounded-md object-cover shrink-0 ${isActive ? 'ring-2 ring-accent' : ''}`} />
    ) : (
      <CoverPlaceholder className={size} active={isActive} />
    );

  // the dialogs (tags, delete) are drawn in both states of the panel: if they lived only in the open one, folding the strip under a dialog
  // would hide it and hovering the strip would bring it back, in a loop
  const dialogs = (
    <>
      {pendingDelete && createPortal(
        <Modal id="confirm-delete-track" role="alertdialog" width="md" layer="z-[100]" onClose={() => setPendingDelete(null)}>
          <p className="text-base font-bold">{lang === 'en' ? 'Remove this track from the playlist?' : 'Видалити цей трек із плейліста?'}</p>
          <p className="text-sm break-words">{displayName(pendingDelete)}</p>
          <p className="text-xs text-ink-3">{lang === 'en' ? 'The file on the disk stays.' : 'Файл на диску залишиться.'}</p>
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
    </>
  );

  if (compact) {
    return (
      <div id="playlist-panel" className="flex h-full w-full flex-col items-center">
        <div className="mac-top-space" data-tauri-drag-region />
        <div className="shrink-0 h-2" data-tauri-drag-region />
        <div className="shrink-0 pb-2 text-center text-[11px] font-black leading-[1.05] tracking-tight text-ink pointer-events-none select-none" data-tauri-drag-region aria-label="BeatPractice">
          beat<br />Practice
        </div>
        {/* the list is as wide as the whole strip (the strip's own padding is taken back), so the mark to the left of a cover is not cut off by the scrolling */}
        <div className="-mx-3 flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto py-1" style={{ width: 'calc(100% + 1.5rem)' }}>
          {base.map((item) => {
            const isActive = item.id === activeTrackId;
            return (
              <button key={item.id} type="button" onClick={() => onSelectTrack(item)} title={displayName(item)} aria-label={displayName(item)} className="relative shrink-0 rounded-lg cursor-pointer">
                {coverOf(item, isActive, 'w-10 h-10')}
                {/* the same place as in the open playlist: to the left of the cover, the play triangle points at it */}
                {isActive && <span className="absolute right-full top-1/2 mr-[3px] -translate-y-1/2"><NowMark playing={isPlaying} lang={lang} /></span>}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          id="btn-expand-playlist"
          onClick={onExpand}
          title={lang === 'en' ? 'Show the playlist' : 'Показати плейліст'}
          aria-label={lang === 'en' ? 'Show the playlist' : 'Показати плейліст'}
          className="mt-2 shrink-0 w-10 h-10 flex items-center justify-center rounded-xl text-ink-2 hover:text-ink hover:bg-control cursor-pointer"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
        {dialogs}
      </div>
    );
  }

  return (
    <div id="playlist-panel" className={containerClasses}>
      {/* Emblem and name (left), the pin (right) */}
      <div className="mac-top-space" data-tauri-drag-region />
      <div className="flex items-center gap-2 shrink-0 -mt-2" data-tauri-drag-region>
        <span className="flex-1 min-w-0 truncate text-left text-2xl font-black tracking-tight pointer-events-none text-ink">beatPractice</span>
        {onTogglePin && (
          <button
            type="button"
            id="btn-pin-playlist"
            onClick={onTogglePin}
            aria-pressed={pinned}
            title={pinned ? (lang === 'en' ? 'Unpin: the playlist folds into a strip' : 'Відкріпити: плейліст згортається у смугу') : (lang === 'en' ? 'Pin: keep the playlist open' : 'Закріпити: плейліст завжди відкритий')}
            aria-label={pinned ? (lang === 'en' ? 'Unpin the playlist' : 'Відкріпити плейліст') : (lang === 'en' ? 'Pin the playlist' : 'Закріпити плейліст')}
            className={`w-6 h-6 shrink-0 flex items-center justify-center rounded-md cursor-pointer transition-colors ${pinned ? 'text-ink' : 'text-ink-3 hover:text-ink'}`}
          >
            {pinned ? <Pin className="icon-xs" /> : <PinOff className="icon-xs" />}
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
            className={`h-10 w-full rounded-lg border border-outline bg-canvas pr-8 text-sm text-ink placeholder:text-ink-4 ${query === '' ? 'pl-9' : 'pl-3'}`}
          />
          {query === '' && <Search className="icon-sm pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden="true" />}
          {query !== '' && (
            <button type="button" onClick={() => setQuery('')} title={lang === 'en' ? 'Clear' : 'Очистити'} aria-label={lang === 'en' ? 'Clear' : 'Очистити'}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md text-ink-3 hover:text-ink cursor-pointer">
              <X className="icon-sm" />
            </button>
          )}
        </div>
        <button
          type="button"
          id="btn-add-more-tracks"
          onClick={onOpenAddFiles}
          className="h-10 px-3 shrink-0 text-xs font-semibold bg-control hover:bg-control-hover active:bg-surface text-ink rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          title={t('addTrack')}
        >
          <Plus className="w-5 h-5" />
          <span className="whitespace-nowrap">{t('addTrack')}</span>
        </button>
      </form>

      {((hasTags && (playlist.length > 0 || allTags.length > 0)) || playlist.length > 0) && (
        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-1.5" role="group" aria-label={lang === 'en' ? 'Filter by tags' : 'Фільтр за тегами'}>
          {hasTags && allTags.map((tg) => (
            <button key={tg.id} type="button" aria-pressed={tagView === tg.id}
              onClick={() => onTagView?.(tagView === tg.id ? null : tg.id)}
              className={`${btn.chip(tagView === tg.id)} rounded-full !min-h-7 sm:!min-h-7 px-2.5`}>
              {tg.name}
            </button>
          ))}
          {hasTags && (
            <button type="button" id="btn-manage-tags" onClick={() => setManageTags(true)}
              title={lang === 'en' ? 'Manage tags' : 'Керувати тегами'} aria-label={lang === 'en' ? 'Manage tags' : 'Керувати тегами'}
              className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-ink-3 hover:bg-control hover:text-ink cursor-pointer">
              <Tag className="icon-sm" />{lang === 'en' ? 'Tags' : 'Теги'}
            </button>
          )}
          {playlist.length > 0 && (
            <button type="button" id="btn-edit-playlist" aria-pressed={manage} onClick={() => setManage((v) => !v)}
              title={lang === 'en' ? 'Order, tags and deleting of tracks' : 'Порядок, теги й видалення треків'}
              className={`ml-auto inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold cursor-pointer transition-colors ${manage ? 'bg-accent text-accent-on hover:bg-accent-hover' : 'text-ink-3 hover:bg-control hover:text-ink'}`}>
              {manage ? (lang === 'en' ? 'Done' : 'Готово') : (lang === 'en' ? 'Manage' : 'Керувати')}
            </button>
          )}
        </div>
      )}

      {inTagView && (
        <p className="mt-1.5 shrink-0 text-xs text-ink-3">
          {lang === 'en'
            ? `List of the tag “${tagName(tagView!) ?? ''}”. The order of the filtered tracks does not affect the order in the main playlist.`
            : `Список тегу «${tagName(tagView!) ?? ''}». Порядок відфільтрованих треків не впливає на порядок в основному плейлісті.`}
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
            className="group border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors group mt-2 border-line/90 hover:border-outline bg-canvas/40 hover:bg-surface/40"
          >
            <Music className="w-6 h-6 mx-auto mb-1.5 transition-colors text-ink-4 group-hover:text-ink-2" />
            <p className="text-xs font-semibold text-ink-2 group-hover:text-ink">
              {t('emptyPlaylist')}
            </p>
            <p className="text-xs text-ink-3 mt-0.5">
              {t('emptyPlaylistSub')}
            </p>
          </div>
        ) : (
          visible.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-ink-3">{lang === 'en' ? 'Nothing found' : 'Нічого не знайдено'}</p>
          ) : visible.map(({ item, index }) => {
            const isActive = item.id === activeTrackId;
            const showLineBefore = !filtered && drag && drag.ins === index && drag.ins !== drag.from && drag.ins !== drag.from + 1;
            const showLineAfter = !filtered && drag && index === base.length - 1 && drag.ins === base.length && drag.from !== base.length - 1;
            return (
              <React.Fragment key={item.id}>
              {showLineBefore && <div className="h-1 rounded-full bg-accent -my-1" />}
              <div
                ref={(el) => { itemRefs.current[item.id] = el; }}
                id={`playlist-item-${item.id}`}
                onClick={() => onSelectTrack(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelectTrack(item); } }}
                className={`relative py-2 pr-2 pl-1 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none ${
                  drag?.id === item.id ? 'opacity-50 ' : ''}${isActive
                    ? 'shadow-xs bg-control border-outline text-ink'
                    : 'bg-canvas/60 hover:bg-control/60 border-line hover:border-outline text-ink-2'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {/* The gutter on the left is reserved in every tile, so nothing moves when the mode changes. It holds the three-dot drag handle
                      (in the Edit mode) whose middle dot is the play / pause mark of the current track; outside the Edit mode, only the mark. */}
                  <div className="w-3.5 shrink-0 self-stretch flex items-center justify-center">
                    {manage && !filtered ? (
                      <button
                        type="button"
                        className="relative flex flex-col items-center gap-[3px] cursor-grab after:absolute after:-inset-x-1.5 after:-inset-y-3 after:content-[''] active:cursor-grabbing touch-none rounded-md text-ink-3 hover:text-ink-2 transition-colors duration-150"
                        title={lang === 'en' ? 'Drag to change the order' : 'Перетягніть, щоб змінити порядок'}
                        aria-label={lang === 'en' ? 'Drag to change the order' : 'Перетягніть, щоб змінити порядок'}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => onGripDown(e, item.id, index)}
                        onPointerMove={onGripMove}
                        onPointerUp={onGripUp}
                        onPointerCancel={() => setDrag(null)}
                      >
                        <span className="block h-1 w-1 rounded-full bg-current" />
                        {isActive ? <NowMark playing={isPlaying} lang={lang} /> : <span className="block h-1 w-1 rounded-full bg-current" />}
                        <span className="block h-1 w-1 rounded-full bg-current" />
                      </button>
                    ) : isActive ? <NowMark playing={isPlaying} lang={lang} /> : null}
                  </div>
                  {/* Play or active animated icon */}
                  {item.cover ? (
                    <img src={item.cover} alt="" className={`w-10 h-10 rounded-md object-cover shrink-0 ${isActive ? 'ring-2 ring-accent' : ''}`} />
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
                    <p className={`text-xs font-bold truncate ${isActive ? 'font-black text-ink' : 'text-ink-2'}`}>
                      {displayName(item)}
                    </p>
                    <div className="flex flex-nowrap items-center gap-1.5 text-xs mt-0.5 font-mono whitespace-nowrap text-ink-3">
                      <span>{formatDuration(item.trackInfo.duration)}</span>
                      <span>•</span>
                      <span className={`font-semibold ${isActive ? 'font-bold text-ink-2' : 'text-ink-3'}`}>
                        {formatBpmRange(item.trackInfo.bpmMin, item.trackInfo.bpmMax, item.trackInfo.originalBpmExact ?? item.trackInfo.originalBpm)}
                      </span>
                      <span>•</span>
                      <span>{item.trackInfo.timeSignature}</span>
                    </div>
                    {hasTags && (item.tags ?? []).some((id) => tagName(id)) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(item.tags ?? []).map((id) => tagName(id) && (
                          <span key={id} className="rounded-full bg-accent/15 px-2 py-px text-xs font-semibold leading-4 text-accent-text">{tagName(id)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {manage && hasTags && (
                  <button
                    type="button"
                    id={`btn-track-tags-${item.id}`}
                    onClick={(e) => { e.stopPropagation(); setTagItemId(item.id); }}
                    className="p-2.5 sm:p-1.5 text-ink-3 hover:text-accent-text hover:bg-accent/10 rounded-lg transition-colors shrink-0 cursor-pointer"
                    title={lang === 'en' ? 'Tags of the track' : 'Теги треку'}
                    aria-label={lang === 'en' ? 'Tags of the track' : 'Теги треку'}
                  >
                    <Tag className="w-6 h-6" />
                  </button>
                )}

                {/* Delete button (Edit mode only; it takes its place in the tile) */}
                {manage && (
                  <button
                    type="button"
                    id={`btn-remove-track-${item.id}`}
                    onClick={(e) => { e.stopPropagation(); setPendingDelete(item); }}
                    className="p-2.5 sm:p-1.5 rounded-lg transition-colors shrink-0 cursor-pointer text-ink-4 hover:text-rose-400 hover:bg-rose-950/30"
                    title={t('deleteTrack')}
                    aria-label={t('deleteTrack')}
                  >
                    <Trash2 className="w-6 h-6" />
                  </button>
                )}
              </div>
              {showLineAfter && <div className="h-1 rounded-full bg-accent -my-1" />}
              </React.Fragment>
            );
          })
        )}
      </div>

      {/* Bottom Summary Divider & Track Count / Total Duration */}
      <div
        id="playlist-bottom-summary"
        className="pt-3 mt-2 border-t shrink-0 grid grid-cols-2 items-center text-xs select-none px-1 border-line text-ink-3"
      >
        <div className="flex items-center gap-1.5 justify-self-start">
          <span>Треків:</span>
          {/* a tag shown: how many tracks have it (no total); a search: found / all */}
          <span className="font-bold font-mono text-ink-2">{inTagView ? visible.length : filtered ? `${visible.length} / ${playlist.length}` : playlist.length}</span>
        </div>

        {/* the time of the tracks that are shown */}
        <div className="flex items-center gap-1.5 justify-self-end">
          <span>Час:</span>
          <span className="font-bold font-mono text-ink-2">
            {formatTotalDuration(visible.reduce((acc, { item }) => acc + (item.trackInfo?.duration || 0), 0))}
          </span>
        </div>

      </div>

      {footer && <div className="pt-3 mt-3 border-t shrink-0 border-line">{footer}</div>}

      {dialogs}

    </div>
  );
};
