/**
 * TEMPORARY: a switchable accent colour, to choose one shared accent for both themes.
 * Colours are the system colours of the Apple HIG for macOS (light / dark variants of the same hue).
 * Every value is an exact swatch of the Apple macOS 27 UI Kit (Sketch): base = System Colors/Light/* and /Dark/*,
 * hover = System Colors/Light Vibrant (use plus darker)/* and /Dark (use plus lighter)/*. Nothing is derived or adjusted.
 */
export interface AccentColor { id: string; uk: string; en: string; light: string; dark: string; lightHover: string; darkHover: string }

export const ACCENT_COLORS: AccentColor[] = [
  { id: "red",    uk: "Червоний",    en: "Red",    light: "#ff383c", dark: "#ff4245", lightHover: "#f52f32", darkHover: "#ff4747" },
  { id: "orange", uk: "Помаранчевий", en: "Orange", light: "#ff8d28", dark: "#ff9230", lightHover: "#f58625", darkHover: "#ff9e33" },
  { id: "yellow", uk: "Жовтий",      en: "Yellow", light: "#ffcc00", dark: "#ffd600", lightHover: "#f5c200", darkHover: "#ffe014" },
  { id: "green",  uk: "Зелений",     en: "Green",  light: "#34c759", dark: "#30d158", lightHover: "#26bf4d", darkHover: "#3bdb63" },
  { id: "mint",   uk: "М’ятний",     en: "Mint",   light: "#00c8b3", dark: "#00dac3", lightHover: "#00bda9", darkHover: "#2de0cd" },
  { id: "teal",   uk: "Бірюзовий",   en: "Teal",   light: "#00c3d0", dark: "#00d2e0", lightHover: "#00b3bf", darkHover: "#2dd7e0" },
  { id: "cyan",   uk: "Блакитний",   en: "Cyan",   light: "#00c0e8", dark: "#3cd3fe", lightHover: "#00abcf", darkHover: "#47d8fc" },
  { id: "blue",   uk: "Синій",       en: "Blue",   light: "#0088ff", dark: "#0091ff", lightHover: "#0078f0", darkHover: "#0a99ff" },
  { id: "indigo", uk: "Індиго",      en: "Indigo", light: "#6155f5", dark: "#6d7cff", lightHover: "#5c50e6", darkHover: "#7163ff" },
  { id: "purple", uk: "Фіолетовий",  en: "Purple", light: "#cb30e0", dark: "#db34f2", lightHover: "#b72bc9", darkHover: "#e647fc" },
  { id: "pink",   uk: "Рожевий",     en: "Pink",   light: "#ff2d55", dark: "#ff375f", lightHover: "#f5234b", darkHover: "#ff4169" },
  { id: "brown",  uk: "Коричневий",  en: "Brown",  light: "#ac7f5e", dark: "#b78a66", lightHover: "#9e7354", darkHover: "#c29672" },
  { id: "gray",   uk: "Графітовий",  en: "Graphite", light: "#8e8e93", dark: "#98989d", lightHover: "#848489", darkHover: "#a2a2a7" },
];

const KEY = "beatpractice_accent";

export function loadAccent(): string {
  try { const v = localStorage.getItem(KEY); if (v && ACCENT_COLORS.some((c) => c.id === v)) return v; } catch { /* ignore */ }
  return "default";
}

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
/** Is white text readable on this colour? (yellow, mint, cyan... need dark text) */
function needsDarkText(hex: string): boolean {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160;
}

const VARS = ["--accent", "--accent-hover", "--accent-subtle", "--accent-border", "--accent-text", "--accent-on", "--brand-primary", "--brand-hover", "--brand-subtle", "--brand-border", "--brand-text"];

/** Sets the accent on <html> for the given theme; "default" removes everything and the original colours come back. */
export function applyAccent(id: string, isDark: boolean): void {
  const root = document.documentElement;
  const c = ACCENT_COLORS.find((x) => x.id === id);
  if (!c) { root.removeAttribute("data-accent"); VARS.forEach((v) => root.style.removeProperty(v)); return; }
  const base = isDark ? c.dark : c.light;
  const [r, g, b] = rgb(base);
  const hover = isDark ? c.darkHover : c.lightHover;   // Apple's own "Light Vibrant" / "Dark (plus lighter)" swatches
  const text = base;                                    // the system colour itself, no derived shades
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  set("--accent", base); set("--accent-hover", hover); set("--accent-text", text);
  set("--accent-subtle", `rgba(${r},${g},${b},${isDark ? 0.16 : 0.10})`);
  set("--accent-border", `rgba(${r},${g},${b},${isDark ? 0.40 : 0.30})`);
  set("--accent-on", needsDarkText(base) ? "#1d1d1f" : "#ffffff");
  set("--brand-primary", base); set("--brand-hover", hover); set("--brand-text", text);
  set("--brand-subtle", `rgba(${r},${g},${b},${isDark ? 0.16 : 0.10})`);
  set("--brand-border", `rgba(${r},${g},${b},${isDark ? 0.40 : 0.30})`);
  root.setAttribute("data-accent", id);
}

export function saveAccent(id: string): void {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}
