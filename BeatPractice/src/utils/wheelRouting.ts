/**
 * The mouse wheel scrolls the zone under the pointer, always.
 *
 * Without this, the wheel could keep scrolling the zone the person clicked last (the page, or the playlist) even when the pointer was over the
 * other one. Here the wheel is handled by hand: the zone is found from the pointer position (the scrollable element under it that can still move
 * in that direction, else the page), and only that zone is moved. The playlist panel never passes the wheel on to the page behind it.
 * Dialogs, Ctrl + wheel (zoom of the waveform) and sideways wheel (the waveform's own scrolling) are left to the browser.
 */

interface Anim { target: number; raf: number }
const anims = new Map<Element, Anim>();

function canMove(el: HTMLElement, dy: number): boolean {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 1) return false;
  return dy < 0 ? el.scrollTop > 0 : el.scrollTop < max - 1;
}

function scrollerUnder(start: Element | null, dy: number): HTMLElement | null {
  for (let el = start; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && canMove(el as HTMLElement, dy)) return el as HTMLElement;
  }
  return null;
}

function move(el: HTMLElement, dy: number): void {
  const max = el.scrollHeight - el.clientHeight;
  const a = anims.get(el);
  if (Math.abs(dy) < 40) {                     // a touchpad: many small steps, already smooth
    if (a) { cancelAnimationFrame(a.raf); anims.delete(el); }
    el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + dy));
    return;
  }
  const target = Math.max(0, Math.min(max, (a ? a.target : el.scrollTop) + dy));   // a wheel notch: glide, and several notches add up
  if (a) cancelAnimationFrame(a.raf);
  const tick = () => {
    const cur = el.scrollTop, diff = target - cur;
    if (Math.abs(diff) < 0.6) { el.scrollTop = target; anims.delete(el); return; }
    el.scrollTop = cur + diff * 0.3;
    const n = anims.get(el); if (n) n.raf = requestAnimationFrame(tick);
  };
  anims.set(el, { target, raf: requestAnimationFrame(tick) });
}

export function installWheelRouting(): () => void {
  const onWheel = (e: WheelEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (!under) return;
    if (under.closest(".bp-modal-overlay, [role='dialog'], [data-native-wheel]")) return;   // dialogs, popovers: the browser's own behaviour
    const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1);
    const zone = scrollerUnder(under, dy);
    if (zone) { e.preventDefault(); move(zone, dy); return; }
    if (under.closest("aside")) { e.preventDefault(); return; }   // the playlist panel: nothing to scroll there must not move the page behind it
    const page = document.scrollingElement as HTMLElement | null;
    if (page && canMove(page, dy)) { e.preventDefault(); move(page, dy); }
  };
  window.addEventListener("wheel", onWheel, { passive: false, capture: true });
  return () => window.removeEventListener("wheel", onWheel, { capture: true } as EventListenerOptions);
}
