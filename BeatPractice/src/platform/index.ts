/**
 * Everything that depends on where the app runs: the desktop app (Tauri) or the Android app (Capacitor). The rest of the interface
 * uses only these functions, so it is the same code on both.
 *
 *  - call(): the commands of the player (core_*). Desktop: Tauri `invoke`. Android: the Capacitor plugin `BeatCore`, which hands the
 *    command as JSON to the C++ bridge (beat-core/src/bridge.cpp): the same names, arguments and results.
 *  - files: choosing, saving (on Android a saved file can then be shared / put to Drive / Files), "open with".
 */
import { registerPlugin } from "@capacitor/core";

export type PlatformKind = "tauri" | "android" | "web";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  }
}

function detect(): PlatformKind {
  if (typeof window === "undefined") return "web";
  if ("__TAURI_INTERNALS__" in window) return "tauri";
  if (window.Capacitor?.isNativePlatform?.() && window.Capacitor.getPlatform?.() === "android") return "android";
  return "web";
}
export const kind: PlatformKind = detect();
export const isDesktop = kind === "tauri";
export const isAndroid = kind === "android";

// ---- the Android plugin (Kotlin: BeatCorePlugin) -----------------------------------------------------------------
export interface ModelsStatus {
  installed: boolean;     // every model file is there
  sizeMb: number;         // what still has to be prepared
  error?: string;
}
interface BeatCorePlugin {
  call(o: { command: string; args: string }): Promise<{ result: string }>;
  pickFiles(o: { extensions: string[] }): Promise<{ paths: string[] }>;
  pickSavePath(o: { defaultName: string }): Promise<{ path: string }>;
  shareSaved(o: { basePath: string }): Promise<void>;
  getVersion(): Promise<{ version: string }>;
  modelsStatus(): Promise<ModelsStatus>;
  modelsDownload(): Promise<void>;
  modelsCancel(): Promise<void>;
  addListener(event: "modelsProgress", cb: (e: { progress: number }) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(event: "fileOpened", cb: (e: { paths: string[] }) => void): Promise<{ remove: () => Promise<void> }>;
}
let plugin: BeatCorePlugin | null = null;
function android(): BeatCorePlugin {
  if (!plugin) plugin = registerPlugin<BeatCorePlugin>("BeatCore");
  return plugin;
}

// ---- the player's commands ---------------------------------------------------------------------------------------
export async function call<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (kind === "tauri") {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
  }
  if (kind === "android") {
    const { result } = await android().call({ command, args: JSON.stringify(args) });
    const r = JSON.parse(result) as { ok?: T; error?: string };
    if (r.error !== undefined) throw new Error(r.error);
    return r.ok as T;
  }
  throw new Error("The player is not available here (open the app, not a web page).");
}

// ---- files -------------------------------------------------------------------------------------------------------
/** Choose files to add. Android: they are copied into the app's own storage and their paths there are returned. */
export async function pickAudioFiles(extensions: string[], title: string, filterName: string): Promise<string[]> {
  if (kind === "tauri") {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const res = await open({ multiple: true, title, filters: [{ name: filterName, extensions }] });
    return Array.isArray(res) ? res : typeof res === "string" ? [res] : [];
  }
  if (kind === "android") return (await android().pickFiles({ extensions })).paths;
  return [];
}

/** Desktop only: choose a folder (where the models are). */
export async function pickFolder(title: string): Promise<string | null> {
  if (kind !== "tauri") return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const dir = await open({ directory: true, title });
  return typeof dir === "string" ? dir : null;
}

/**
 * Where to write a file. Desktop: the system "save as" dialog. Android: a path in the app's export folder (no dialog; afterSave() then lets the
 * user put the file where they want).
 */
export async function pickSavePath(o: { title: string; defaultName: string; extension: string; filterName: string }): Promise<string | null> {
  if (kind === "tauri") {
    const { save } = await import("@tauri-apps/plugin-dialog");
    return (await save({ title: o.title, defaultPath: o.defaultName, filters: [{ name: o.filterName, extensions: [o.extension] }] })) ?? null;
  }
  if (kind === "android") return (await android().pickSavePath({ defaultName: o.defaultName })).path || null;
  return null;
}

/** Android: after a file (or several files starting with the same name) was written, offer to save / send them (system share sheet). */
export const canShareSaved = isAndroid;
export async function shareSaved(basePath: string): Promise<void> {
  if (kind === "android") await android().shareSaved({ basePath });
}

/** Files the user hands to the app: dropped on the window (desktop) or sent with "Open with" (Android). Returns a function that stops listening. */
export function onFilesOpened(cb: (paths: string[]) => void): () => void {
  let off: (() => void) | undefined;
  let dead = false;
  if (kind === "tauri") {
    void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) =>
      getCurrentWebview().onDragDropEvent((e) => { if (e.payload.type === "drop") cb(e.payload.paths); }).then((fn) => { if (dead) fn(); else off = fn; }),
    ).catch(() => {});
  } else if (kind === "android") {
    void android().addListener("fileOpened", (e) => cb(e.paths)).then((h) => { if (dead) void h.remove(); else off = () => void h.remove(); }).catch(() => {});
  }
  return () => { dead = true; off?.(); };
}

export async function appVersion(): Promise<string> {
  if (kind === "tauri") { const { getVersion } = await import("@tauri-apps/api/app"); return getVersion(); }
  if (kind === "android") return (await android().getVersion()).version;
  return "";
}

// ---- models (Android: inside the app bundle, copied into the app's folder once; on the desktop they come with the app) -----
export const modelsDownloadable = isAndroid;
export async function modelsStatus(): Promise<ModelsStatus> {
  if (kind !== "android") return { installed: true, sizeMb: 0 };
  return android().modelsStatus();
}
/** Prepares the models (copies them out of the app); onProgress gets 0..1. Resolves when they are ready. */
export async function modelsDownload(onProgress: (p: number) => void): Promise<void> {
  if (kind !== "android") return;
  const h = await android().addListener("modelsProgress", (e) => onProgress(e.progress));
  try { await android().modelsDownload(); } finally { void h.remove(); }
}
export async function modelsCancel(): Promise<void> { if (kind === "android") await android().modelsCancel(); }
