#!/usr/bin/env python3
"""
Accessibility audit of the accent colours (src/utils/accent.ts) in both themes, and a search for the smallest correction when a colour fails.

  python3 scripts/accent-audit.py            # audit of the table as it is
  python3 scripts/accent-audit.py --suggest  # for every failing colour: the nearest passing colour, and the verdict on the pair of themes

Tests (WCAG 2.2), for each theme against the neutrals of index.css:
  text    the accent as TEXT on canvas and surface (headings, notes, icons with a caption) ........ >= 4.5
  tint    the accent as text on its own 15% tint over surface and canvas (tags, hover) ............ >= 4.5
  fill    the text on an accent FILL (buttons, chosen segment, active tab): normal and hover fill ... >= 4.5
  ui      the accent as a graphic (slider, switch, outline, focus ring, icon) on canvas, surface,
          control, hovered control and the empty part of a slider ................................... >= 3
A colour that needs more than the limits below (pair of themes) to pass is dropped from the list: the switch of the theme would look like another colour.
"""
import re, sys, math, pathlib

BG = {   # index.css --c-*
    "dark":  {"canvas": (28, 28, 30), "surface": (44, 44, 46), "control": (58, 58, 60), "control-hover": (72, 72, 74), "track": (72, 72, 74)},
    "light": {"canvas": (245, 245, 247), "surface": (255, 255, 255), "control": (236, 236, 236), "control-hover": (224, 224, 229), "track": (199, 199, 204)},
}
ON = {"white": (255, 255, 255), "dark": (29, 29, 31)}
# "The switch of the theme must not make the colour look like another one" (OKLab / OKLCH measures):
LIMIT_SELF = 0.16    # how far one theme's colour may be moved from the Apple original (OKLab distance)
LIMIT_HUE = 10.0     # hue shift between the two themes, degrees: the name of the colour stays
LIMIT_DL = 0.25      # lightness difference between the themes (the contrast rules alone need ~0.23: dark text colours on white, light ones on dark)
LIMIT_CHROMA = 0.65  # the less saturated variant keeps at least this part of the other one's chroma (no vivid -> washed-out)
LIMIT_DISTINCT = 0.06  # after the corrections two colours of the list must still differ by more than this in both themes (otherwise the later one is dropped)

def lin(c): c /= 255; return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lum(rgb): r, g, b = (lin(v) for v in rgb); return 0.2126 * r + 0.7152 * g + 0.0722 * b
def cr(a, b): la, lb = lum(a), lum(b); hi, lo = max(la, lb), min(la, lb); return (hi + 0.05) / (lo + 0.05)
def blend(fg, bg, a): return tuple(a * f + (1 - a) * b for f, b in zip(fg, bg))
def hexrgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
def rgbhex(c): return "#%02x%02x%02x" % tuple(max(0, min(255, round(v))) for v in c)

def to_oklab(rgb):
    r, g, b = (lin(v) for v in rgb)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = l ** (1 / 3), m ** (1 / 3), s ** (1 / 3)
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)
def from_oklab(L, a, b):
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    def gam(x): x = max(0.0, min(1.0, x)); return 255 * (12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055)
    return (gam(r), gam(g), gam(bb)), all(-1e-4 <= v <= 1 + 1e-4 for v in (r, g, bb))
def lch(rgb): L, a, b = to_oklab(rgb); return L, math.hypot(a, b), math.degrees(math.atan2(b, a)) % 360
def from_lch(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    return from_oklab(L, a, b)
def dE(x, y): p, q = to_oklab(x), to_oklab(y); return math.dist(p, q)
def dh(h1, h2): d = abs(h1 - h2) % 360; return min(d, 360 - d)

def hover_of(base, on):
    """Hover fill: one step towards more contrast with the text on it (darker under white text, lighter under dark text)."""
    L, C, h = lch(base)
    L2 = L - 0.05 if on == "white" else L + 0.05
    for k in range(20):
        rgb, ok = from_lch(L2, C * (1 - 0.05 * k), h)
        if ok: return rgb
    return base

def tests(theme, base, on):
    """All tests of one theme for the accent `base` with the text `on` on its fill. Returns [(name, ratio, need)]."""
    bg, out = BG[theme], []
    hov = hover_of(base, on)
    for n in ("canvas", "surface"): out.append((f"text/{n}", cr(base, bg[n]), 4.5))
    for n in ("surface", "canvas"): out.append((f"tint/{n}", cr(base, blend(base, bg[n], 0.15)), 4.5))
    out.append(("fill", cr(ON[on], base), 4.5)); out.append(("fill-hover", cr(ON[on], hov), 4.5))
    for n in ("canvas", "surface", "control", "control-hover", "track"): out.append((f"ui/{n}", cr(base, bg[n]), 3.0))
    return out
def passes(theme, base, on): return all(r >= need - 1e-9 for _, r, need in tests(theme, base, on))

def nearest(theme, orig):
    """The passing colour closest to `orig` (same hue; the lightness moves, the chroma stays as large as the gamut allows)."""
    L0, C0, h = lch(orig)
    best = None
    for on in ("white", "dark"):
        for i in range(0, 1001):
            L = i / 1000
            for k in range(0, 25):
                rgb, ok = from_lch(L, C0 * (1 - 0.04 * k), h)
                if ok: break
            else: continue
            rgb = tuple(round(v) for v in rgb)
            if passes(theme, rgb, on):
                d = dE(rgb, orig)
                if best is None or d < best[0]: best = (d, rgb, on)
    return best

def parse_table():
    src = pathlib.Path(__file__).resolve().parent.parent / "src/utils/accent.ts"
    rows = []
    for m in re.finditer(r'\{ id: "(\w+)".*?light: "(#\w+)", dark: "(#\w+)"', src.read_text(encoding="utf-8")):
        rows.append((m.group(1), hexrgb(m.group(2)), hexrgb(m.group(3))))
    return rows

def best_on(theme, base):
    ok = [on for on in ("white", "dark") if passes(theme, base, on)]
    return ok[0] if ok else max(("white", "dark"), key=lambda o: min(r / n for _, r, n in tests(theme, base, o)))

def default_pair():
    """The default accent of index.css: the first --accent is the dark theme's, the second the light theme's."""
    css = (pathlib.Path(__file__).resolve().parent.parent / "src/index.css").read_text(encoding="utf-8")
    d, l = [tuple(int(v) for v in m.split()) for m in re.findall(r"--accent: (\d+ \d+ \d+);", css)[:2]]
    return ("default", l, d)

def audit():
    for name, light, dark in parse_table() + [default_pair()]:
        for theme, c in (("light", light), ("dark", dark)):
            on = best_on(theme, c); t = tests(theme, c, on)
            bad = [f"{n} {r:.2f}<{need}" for n, r, need in t if r < need - 1e-9]
            print(f"{name:8s} {theme:5s} {rgbhex(c)} on={on:5s} " + ("PASS" if not bad else "FAIL: " + "; ".join(bad)))

def suggest():
    keep = []
    for name, light, dark in parse_table() + [default_pair()]:
        dl_, cl, onl = nearest("light", light)
        dd_, cd, ond = nearest("dark", dark)
        Ll, Cl, hl = lch(cl); Ld, Cd, hd = lch(cd)
        dL, ratio, hue = abs(Ld - Ll), min(Cl, Cd) / max(Cl, Cd, 1e-9), dh(hl, hd)
        why = []
        if dl_ > LIMIT_SELF or dd_ > LIMIT_SELF: why.append(f"moved too far from Apple ({dl_:.3f} / {dd_:.3f})")
        if dL > LIMIT_DL: why.append(f"lightness gap {dL:.2f}")
        if ratio < LIMIT_CHROMA: why.append(f"chroma ratio {ratio:.2f}")
        if hue > LIMIT_HUE and name != "default": why.append(f"hue {hue:.1f}")
        verdict = "KEEP" if not why else ("CORRECT ONLY (the default pair, not a choice)" if name == "default" else "DROP: " + "; ".join(why))
        print(f"{name:8s} light {rgbhex(light)}->{rgbhex(cl)} d={dl_:.3f} | dark {rgbhex(dark)}->{rgbhex(cd)} d={dd_:.3f} | dL={dL:.2f} chroma={ratio:.2f} hue={hue:.1f} => " + verdict)
        if not why or name == "default":   # the default pair (violet in the dark theme, blue in the light) is only corrected, never dropped
            keep.append((name, cl, cd, onl, ond))
    distinct = []
    for k in keep:
        twin = next((d for d in distinct if k[0] != "default" and d[0] != "default" and dE(k[1], d[1]) < LIMIT_DISTINCT and dE(k[2], d[2]) < LIMIT_DISTINCT), None)
        if twin: print(f"{k[0]}: DROP, after the correction it is the same colour as {twin[0]}")
        else: distinct.append(k)
    keep = distinct
    print()
    for name, cl, cd, onl, ond in keep:
        print(f'{name:8s} light: "{rgbhex(cl)}", dark: "{rgbhex(cd)}", lightHover: "{rgbhex(hover_of(cl, onl))}", darkHover: "{rgbhex(hover_of(cd, ond))}"  on: {onl}/{ond}')

if __name__ == "__main__":
    suggest() if "--suggest" in sys.argv else audit()
