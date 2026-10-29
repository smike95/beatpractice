#!/usr/bin/env python3
"""Runs analyze_cli on the reference songs and compares with tests/golden/*.json.
Usage: python3 tests/compare.py --cli build/analyze_cli --models models \
         disturbed=/path/Disturbed.mp3 karna=/path/Karna.mp3 heathens=/path/Heathens.mp3
PASS = same number of beats, same bar structure, beat times within 30 ms."""
import argparse, json, subprocess, sys, os
ap = argparse.ArgumentParser()
ap.add_argument("--cli", default="build/analyze_cli"); ap.add_argument("--models", default="models")
ap.add_argument("--model", default="beat_this.onnx"); ap.add_argument("songs", nargs="+")
a = ap.parse_args(); here = os.path.dirname(os.path.abspath(__file__)); bad = 0
for item in a.songs:
    name, path = item.split("=", 1)
    g = json.load(open(os.path.join(here, "golden", name + ".json")))
    out = subprocess.run([a.cli, path, "--mel", os.path.join(a.models, "mel_spectrogram.onnx"),
                          "--model", os.path.join(a.models, a.model)], capture_output=True, text=True)
    if out.returncode: print(name, "FAILED to run:", out.stderr.strip()); bad += 1; continue
    c = json.loads(out.stdout)
    ok = len(c["beats"]) == len(g["beats"])
    dt = max((abs(x - y) for x, y in zip(c["beats"], g["beats"])), default=9) * 1000 if ok else 9999
    sb = sum(x != y for x, y in zip(c["barLength"], g["barLength"])); sp = sum(x != y for x, y in zip(c["pos"], g["pos"]))
    rng = (c["playFirstBeat"], c["playLastBeat"]) == (g["playFirstBeat"], g["playLastBeat"])
    good = ok and dt <= 30 and sb == 0 and sp == 0 and rng
    print("%-9s %s  beats %d/%d  max diff %.0f ms  bar-length diffs %d  position diffs %d  play range %s"
          % (name, "PASS" if good else "FAIL", len(c["beats"]), len(g["beats"]), dt, sb, sp, "same" if rng else "DIFFERENT"))
    bad += not good
sys.exit(1 if bad else 0)
