/**
 * TEMPORARY: a switchable accent colour, to choose one shared accent for both themes.
 * Colours are the system colours of the Apple HIG for macOS (light / dark variants of the same hue).
 * Values follow macOS 26 "system colours"; edit the table to match the latest HIG / Figma "macOS 27" file.
 */
export interface AccentColor { id: string; uk: string; en: string; light: string; dark: string }

export const ACCENT_COLORS: AccentColor[] = [
  { id: "red",    uk: "Червоний",    en: "Red",    light: "#ff3d30", dark: "#ff4245" },
  { id: "orange", uk: "Помаранчевий", en: "Orange", light: "#ff8d28", dark: "#ff9230" },
  { id: "yellow", uk: "Жовтий",      en: "Yellow", light: "#ffcc00", dark: "#ffd600" },
  { id: "green",  uk: "Зелений",     en: "Green",  light: "#34c759", dark: "#30d158" },
  { id: "mint",   uk: "М’ятний",     en: "Mint",   light: "#00c8b3", dark: "#00dac3" },
  { id: "teal",   uk: "Бірюзовий",   en: "Teal",   light: "#00c3d0", dark: "#00d2e0" },
  { id: "cyan",   uk: "Блакитний",   en: "Cyan",   light: "#00c0e8", dark: "#3cd3fe" },
  { id: "blue",   uk: "Синій",       en: "Blue",   light: "#0088ff", dark: "#0091ff" },
  { id: "indigo", uk: "Індиго",      en: "Indigo", light: "#6155f5", dark: "#6b5dff" },
  { id: "purple", uk: "Фіолетовий",  en: "Purple", light: "#cb30e0", dark: "#db34f2" },
  { id: "pink",   uk: "Рожевий",     en: "Pink",   light: "#ff2d55", dark: "#ff375f" },
  { id: "brown",  uk: "Коричневий",  en: "Brown",  light: "#ac7f5e", dark: "#b78a66" },
];

const KEY = "beatpractice_accent";

export function loadAccent(): string {
  try { const v = localStorage.getItem(KEY); if (v && ACCENT_COLORS.some((c) => c.id === v)) return v; } catch { /* ignore */ }
  return "default";
}

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function shade(hex: string, k: number): string {   // k < 1 darkens, k > 1 lightens
  const [r, g, b] = rgb(hex).map((v) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k))));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
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
  const hover = isDark ? shade(base, 1.12) : shade(base, 0.82);
  const text = isDark ? shade(base, 1.18) : shade(base, 0.9);   // text on the page background keeps contrast
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
