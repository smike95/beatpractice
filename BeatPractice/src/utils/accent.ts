import { useEffect, useState } from "react";

/**
 * The accent colours the person can choose from. Each is an Apple system colour (macOS 27 UI Kit) that passes the accessibility tests of
 * scripts/accent-audit.py in BOTH themes. A colour that needed a bigger correction to pass than the limits of that script (so that the switch of the
 * theme would look like another colour) is not in the list: orange, yellow, green, mint, teal, cyan, indigo, and pink (it became the same as red).
 * The two values of a colour are slightly different on purpose: the dark theme gets the lighter shade (with dark text on the fill), the light theme the darker one
 * (with white text on the fill). Run `python3 scripts/accent-audit.py` after any change of this table.
 */
export interface AccentColor { id: string; uk: string; en: string; light: string; dark: string; lightHover: string; darkHover: string }

export const ACCENT_COLORS: AccentColor[] = [
  { id: "red",    uk: "Червоний",    en: "Red",      light: "#bf041b", dark: "#ff837b", lightHover: "#a60416", darkHover: "#fea098" },
  { id: "blue",   uk: "Синій",       en: "Blue",     light: "#0c62b7", dark: "#62adfd", lightHover: "#09549f", darkHover: "#82bdfe" },
  { id: "purple", uk: "Фіолетовий",  en: "Purple",   light: "#a40ab7", dark: "#ed7afe", lightHover: "#8f099f", darkHover: "#f09bfc" },
  { id: "brown",  uk: "Коричневий",  en: "Brown",    light: "#845939", dark: "#cea07b", lightHover: "#754b2b", darkHover: "#deb08a" },
  { id: "gray",   uk: "Графітовий",  en: "Graphite", light: "#626267", dark: "#a9a9ae", lightHover: "#545459", darkHover: "#b9b9be" },
];

/** The text on an accent fill: white on the darker shades of the light theme, near-black on the lighter shades of the dark theme (both >= 4.5:1). */
const ON_LIGHT = "255 255 255";
const ON_DARK = "29 29 31";

/** The choice of the person: one colour for both themes (the default is purple) or, only if they want it, a colour for each theme. */
export interface AccentChoice { separate: boolean; both: string; light: string; dark: string }
export const DEFAULT_ACCENT: AccentChoice = { separate: false, both: "purple", light: "purple", dark: "purple" };

const KEY = "beatpractice_accent2";
const OLD_KEY = "beatpractice_accent";   // the first version stored one id (or "default", which no longer exists: it becomes purple)

const known = (v: unknown): v is string => typeof v === "string" && ACCENT_COLORS.some((c) => c.id === v);

export function loadAccent(): AccentChoice {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      return { separate: !!o.separate, both: known(o.both) ? o.both : "purple", light: known(o.light) ? o.light : "purple", dark: known(o.dark) ? o.dark : "purple" };
    }
    const old = localStorage.getItem(OLD_KEY);
    if (known(old)) return { separate: false, both: old, light: old, dark: old };
  } catch { /* ignore */ }
  return DEFAULT_ACCENT;
}

/** The colour id that applies now. */
export const accentFor = (a: AccentChoice, isDark: boolean): string => (a.separate ? (isDark ? a.dark : a.light) : a.both);

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
const trip = (hex: string) => rgb(hex).join(" ");
const VARS = ["--accent", "--accent-hover", "--accent-text", "--accent-on"];

/**
 * Replaces the four accent tokens of index.css (rgb triplets) with the Apple system colour for the given theme.
 * Everything in the interface reads only these tokens. An unknown id falls back to the CSS values of the theme.
 */
export function applyAccent(id: string, isDark: boolean): void {
  const root = document.documentElement;
  const c = ACCENT_COLORS.find((x) => x.id === id);
  if (!c) VARS.forEach((v) => root.style.removeProperty(v));
  else {
    const base = isDark ? c.dark : c.light;
    root.style.setProperty("--accent", trip(base));
    root.style.setProperty("--accent-hover", trip(isDark ? c.darkHover : c.lightHover));   // Apple's own "Light Vibrant" / "Dark (plus lighter)" swatches
    root.style.setProperty("--accent-text", trip(base));
    root.style.setProperty("--accent-on", isDark ? ON_DARK : ON_LIGHT);
  }
  window.dispatchEvent(new Event("bp-accent"));   // canvases (the waveform) cannot read CSS variables by themselves
}

/** The current accent as "r g b" (what the CSS sees), for canvas drawing. Re-renders when the accent or the theme changes. */
export function useAccentRgb(isDark: boolean): string {
  const read = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || (isDark ? "191 90 242" : "0 122 255");
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    on();
    window.addEventListener("bp-accent", on);
    return () => window.removeEventListener("bp-accent", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);
  return v;
}

export function saveAccent(a: AccentChoice): void {
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* ignore */ }
}
