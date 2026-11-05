/**
 * Shared class strings for buttons, so the look (and the touch size) is defined in one place.
 * Touch targets: at least 44 px tall on phones (`min-h-11`), a little denser from `sm` upwards.
 * Colours of the neutral variants come from `.track-edit-btn` / `.track-edit-close` in index.css, so both themes keep working.
 */
const base =
  "inline-flex items-center justify-center gap-2 rounded-lg text-xs font-bold cursor-pointer select-none " +
  "transition-colors duration-150 disabled:opacity-40 disabled:cursor-default";
const regular = "min-h-11 sm:min-h-9 px-4";
const compact = "min-h-11 sm:min-h-8 px-3";

export const btn = {
  primary: `${base} ${regular} bg-sky-700 hover:bg-sky-600 text-white`,
  success: `${base} ${regular} bg-emerald-700 hover:bg-emerald-600 text-white`,
  danger: `${base} ${regular} bg-rose-600 hover:bg-rose-500 text-white`,
  neutral: `${base} ${regular} border track-edit-btn`,
  compact: `${base} ${compact} border track-edit-btn shrink-0`,
  /** the quiet dark button used inside panels (loops, stems); its colours follow the slate classes the light theme already maps */
  secondary: `${base} ${compact} border bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700`,
  /** the one big action of a panel */
  cta: `${base} min-h-11 px-5 text-sm bg-sky-600 hover:bg-sky-500 text-white`,
  /** one of several choices; the chosen one has a sky border (count-in, sound, meter mode, beats per bar) */
  option: (active: boolean) =>
    `${base} h-11 sm:h-9 px-3 border font-bold disabled:cursor-not-allowed ${
      active ? "bg-slate-700 text-white border-sky-500 border-2" : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
    }`,
  /** a small toggle / choice button */
  chip: (active: boolean) => `${base} ${compact} border ${active ? "bg-sky-700 text-white border-sky-700" : "track-edit-btn"}`,
  /** the round × button in a dialog header */
  icon: "track-edit-close inline-flex h-11 w-11 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg cursor-pointer transition-colors duration-150",
} as const;
