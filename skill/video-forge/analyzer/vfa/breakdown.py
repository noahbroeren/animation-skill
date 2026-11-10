"""Beat-by-beat breakdown: align what is SAID with what the PICTURE does.

  vfa breakdown ANALYSIS_DIR [--out breakdown.md]

Reads fingerprint.json + transcript.json + frames.npz of an analysed video and writes a
table with one row per sentence: time span, words, words/s, which shots it spans, cuts
inside it, the camera move(s), luminance/saturation shift (lighting beats), and the
contact-sheet index to look at. This is the "script x picture" view that shows HOW a
short is constructed (hook placement, where the pivot lands, cut-on-word, light changes
on the explanation beat).
"""
from __future__ import annotations

import json
import os
import re

import numpy as np


def _sentences(tr: dict):
    words = tr.get("words") or []
    if words:
        out, cur = [], []
        for w in words:
            cur.append(w)
            if re.search(r"[.!?]$", w["word"].strip()):
                out.append(cur)
                cur = []
        if cur:
            out.append(cur)
        return [{"start": s[0]["start"], "end": s[-1]["end"], "text": " ".join(w["word"].strip() for w in s), "n": len(s)} for s in out]
    segs = tr.get("segments") or []
    return [{"start": s["start"], "end": s["end"], "text": s["text"], "n": len(s["text"].split())} for s in segs]


def breakdown(adir: str, out: str | None = None) -> str:
    fp = json.load(open(os.path.join(adir, "fingerprint.json"), encoding="utf-8"))
    tpath = os.path.join(adir, "transcript.json")
    tr = json.load(open(tpath, encoding="utf-8")) if os.path.exists(tpath) else {}
    A = np.load(os.path.join(adir, "frames.npz"))
    fps = fp["source"]["fps"]
    n = len(A["luma_mean"])
    cuts = [int(round(t * fps)) for t in fp["editing"]["cut_times"]]
    shots = fp["shots"]
    sents = _sentences(tr)
    L = [f"# Breakdown: `{os.path.basename(fp['source']['path'])}`", "",
         f"{fp['source']['analysed_seconds']:.1f}s, {len(shots)} shots, {len(cuts)} cuts, "
         f"speech {(fp.get('audio') or {}).get('speech', {}).get('wps_speaking', 0) or 0:.2f} w/s. "
         "Sheet = contact sheet index (60 frames each) to inspect.", "",
         "| # | time | words/s | said | shots | cuts in span | camera | light shift | sheet |", "|---|---|---|---|---|---|---|---|---|"]
    for i, s in enumerate(sents):
        a, b = int(s["start"] * fps), min(n - 1, int(s["end"] * fps))
        if b <= a:
            b = min(n - 1, a + 1)
        in_shots = [k for k, sh in enumerate(shots) if sh["start"] <= b and sh["end"] > a]
        cin = [c for c in cuts if a <= c <= b]
        # camera move WITHIN this sentence (shot-level totals are meaningless for 60 s travelling takes)
        seg = slice(a + 1, b + 1)
        z = float(np.exp(np.sum(A["dlogs"][seg])))
        px, py = float(np.sum(A["dx"][seg])), float(np.sum(A["dy"][seg]))
        sp = (np.hypot(A["dx"][seg], A["dy"][seg]) + np.abs(A["dlogs"][seg])) * fps
        parts = []
        if z > 1.03: parts.append(f"push x{z:.2f}")
        elif z < 0.97: parts.append(f"pull x{z:.2f}")
        if abs(px) > 0.05: parts.append(("pan-L" if px > 0 else "pan-R") + f" {abs(px):.2f}w")
        if abs(py) > 0.05: parts.append(("tilt-U" if py > 0 else "tilt-D") + f" {abs(py):.2f}w")
        if len(sp) and np.percentile(sp, 95) > 0.6: parts.append("WHIP/fast travel")
        cams = [", ".join(parts) or "creep/hold"]
        dl = float(np.mean(A["luma_mean"][b - 2:b + 1]) - np.mean(A["luma_mean"][a:a + 3])) if b - a > 4 else 0.0
        ds = float(np.mean(A["sat_mean"][b - 2:b + 1]) - np.mean(A["sat_mean"][a:a + 3])) if b - a > 4 else 0.0
        light = ("brighter" if dl > 0.04 else "darker" if dl < -0.04 else "") + (" more sat" if ds > 0.05 else " less sat" if ds < -0.05 else "")
        wps = s["n"] / max(0.05, s["end"] - s["start"])
        L.append(f"| {i} | {s['start']:.2f}-{s['end']:.2f} | {wps:.1f} | {s['text'][:140]} | {','.join(map(str, in_shots))} | "
                 f"{', '.join(f'{c / fps:.2f}s' for c in cin) or '-'} | {'; '.join(cams)[:70]} | {light.strip() or '-'} | {a // 60} |")
    gap_after = [(cuts[k] / fps) for k in range(len(cuts))]
    L += ["", "## Cuts vs. speech", ""]
    words = tr.get("words") or []
    for c in gap_after:
        near = min(words, key=lambda w: abs(w["start"] - c)) if words else None
        L.append(f"- cut {c:.2f}s" + (f" -> nearest word start '{near['word'].strip()}' at {near['start']:.2f}s (offset {c - near['start']:+.2f}s)" if near else ""))
    md = "\n".join(L) + "\n"
    out = out or os.path.join(adir, "breakdown.md")
    open(out, "w", encoding="utf-8").write(md)
    return out
