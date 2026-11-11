"""Per-lighting-key colour table: the video-wide median hides what each section does.

Why this exists (elevator proof short, 2026-11-11): `vfa qa` reported "highlight tint b 11.1 vs 5.8: highlights too
warm". Three rounds of grading the DAY shots cooler did nothing, because the number is a median over all frames and it
had moved for one reason only: the NIGHT section's highlights flipped from -0.8 to +14 when lamps started lighting the
set. Whichever section sits at the middle of the sorted frames decides the median. So before touching a grade, look
at the sections:

    vfa keygap ANALYSIS_DIR --plan timeline.json [--ref FINGERPRINT] [--prev OTHER_ANALYSIS_DIR]

Sections are cut at the plan's soft transitions (place / lighting changes); pass --cuts to split at hard cuts too.
Writes keygap.md next to frames.npz and prints it.
"""
from __future__ import annotations

import json
import os

import numpy as np

COLS = [("luma_mean", "luma", 3), ("luma_p99", "white p99", 3), ("sat_mean", "sat", 3), ("warmth", "warmth", 3),
        ("high_a", "hi a", 1), ("high_b", "hi b", 1), ("shadow_a", "sh a", 1), ("shadow_b", "sh b", 1), ("edge_density", "edges", 4)]
REFKEY = {"luma_mean": "color.luma_mean.median", "luma_p99": "color.luma_p99.median", "sat_mean": "color.sat_mean.median",
          "warmth": "color.warmth.median", "high_a": "color.high_a.median", "high_b": "color.high_b.median",
          "shadow_a": "color.shadow_a.median", "shadow_b": "color.shadow_b.median", "edge_density": "texture.edge_density.median"}


def _get(d: dict, path: str):
    for k in path.split("."):
        if not isinstance(d, dict) or k not in d:
            return None
        d = d[k]
    return d


def _npz(analysis_dir: str):
    p = analysis_dir if analysis_dir.endswith(".npz") else os.path.join(analysis_dir, "frames.npz")
    if not os.path.exists(p) and os.path.exists(os.path.join(analysis_dir, "analysis", "frames.npz")):
        p = os.path.join(analysis_dir, "analysis", "frames.npz")
    return np.load(p, allow_pickle=True), os.path.dirname(p)


def sections(plan: dict, n_frames: int, cuts: bool = False, min_frames: int = 12):
    """[(name, start, end)] from the plan's soft transitions (+ hard cuts when asked); names from the nearest cue."""
    bounds = sorted(set([0, n_frames] + [int(f) for f in plan.get("soft", [])] + ([int(f) for f in plan.get("cuts", [])] if cuts else [])))
    bounds = [b for b in bounds if 0 <= b <= n_frames]
    cues = sorted(((int(v), k.split(".", 1)[-1]) for k, v in (plan.get("cues") or {}).items() if isinstance(v, (int, float))), key=lambda x: x[0])
    out = []
    for a, b in zip(bounds, bounds[1:]):
        if b - a < min_frames:
            continue
        near = [n for f, n in cues if a - 6 <= f <= a + 12]
        out.append((near[0] if near else f"f{a}", a, b))
    return out


def keygap(analysis_dir: str, plan_path: str, ref: dict | None = None, prev_dir: str | None = None, cuts: bool = False) -> dict:
    z, adir = _npz(analysis_dir)
    n = len(z["luma_mean"])
    plan = json.load(open(plan_path, encoding="utf-8"))
    secs = sections(plan, n, cuts)
    zp = _npz(prev_dir)[0] if prev_dir else None
    rows = []
    for name, a, b in secs:
        r = {"section": name, "start": a, "end": b, "share": (b - a) / n}
        for k, _, _ in COLS:
            if k in z.files:
                r[k] = float(np.median(z[k][a:b]))
                if zp is not None and k in zp.files and len(zp[k]) >= b:
                    r[k + "_prev"] = float(np.median(zp[k][a:b]))
        rows.append(r)
    overall = {k: float(np.median(z[k])) for k, _, _ in COLS if k in z.files}
    refv = {k: _get(ref, p) for k, p in REFKEY.items()} if ref else {}
    # which section decides each video-wide median: the one whose own median is closest to it
    decides = {k: min(rows, key=lambda r: abs(r.get(k, 1e9) - overall[k]))["section"] for k in overall}
    res = {"schema": "vfa.keygap/1", "frames": n, "sections": rows, "overall": overall, "reference": refv, "decided_by": decides}
    md = to_md(res, bool(zp is not None))
    with open(os.path.join(adir, "keygap.md"), "w", encoding="utf-8") as f:
        f.write(md)
    with open(os.path.join(adir, "keygap.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, indent=1)
    res["md"] = md
    return res


def to_md(res: dict, has_prev: bool) -> str:
    cols = [c for c in COLS if c[0] in res["overall"]]
    L = ["# Colour per section (lighting key)", "",
         "The video-wide numbers in `gap.md` are medians over ALL frames: one section crossing the middle moves them.",
         "Tune each lighting key against the reference on its own row; only then look at the overall row.", "",
         "| section | frames | share | " + " | ".join(lbl for _, lbl, _ in cols) + " |", "|---|---|---|" + "---|" * len(cols)]

    def cell(r, k, nd):
        v = r.get(k)
        if v is None:
            return "-"
        s = f"{v:.{nd}f}"
        if has_prev and k + "_prev" in r and abs(v - r[k + "_prev"]) > 10 ** -nd * 5:
            s = f"{r[k + '_prev']:.{nd}f} -> **{s}**"
        return s

    for r in res["sections"]:
        L.append(f"| {r['section']} | {r['start']}-{r['end']} | {r['share'] * 100:.0f} % | " + " | ".join(cell(r, k, nd) for k, _, nd in cols) + " |")
    L.append("| **video median** | | | " + " | ".join(f"**{res['overall'][k]:.{nd}f}**" for k, _, nd in cols) + " |")
    if res["reference"]:
        L.append("| reference | | | " + " | ".join(("-" if res["reference"].get(k) is None else f"{res['reference'][k]:.{nd}f}") for k, _, nd in cols) + " |")
    L += ["", "Decided by (the section whose own median sits at the video-wide median): "
          + ", ".join(f"{lbl} = `{res['decided_by'][k]}`" for k, lbl, _ in cols if k in res["decided_by"]), ""]
    return "\n".join(L)
