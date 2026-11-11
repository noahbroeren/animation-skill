"""Transition strips: the frames around every cut, dissolve and DETECTED cut, one row per transition.

    vfa strips VIDEO --plan timeline.json [--analysis ANALYSIS_DIR] [--around 4] --out strips.jpg

Why this exists (coin proof short, 2026-11-11): the camera "travels" between shots were not travels. A key overlap made
the picture jump half the way in one frame and drift the rest; 12 of 23 detected cuts were such jumps, and QA let them
pass because the storyboard had listed frames around each travel as intended events. Numbers did not show it; nine
consecutive frames did, at a glance. So: before delivery, LOOK at every transition.

Rows are labelled: CUT (planned hard or soft cut), SOFT (planned dissolve), EVENT (a detected cut that only an event
explains: check that it really is a graphic entrance) and UNPLANNED (a detected cut nothing explains: a defect).
Each row also gets a harshness number: the mean absolute luma change across the transition frame divided by the mean
change of the frames around it (1 = no harder than the motion around it, above ~6 reads as a jump).
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile

import numpy as np


def transitions(plan: dict, fp: dict | None, fps: float) -> list[dict]:
    cuts = [int(f) for f in plan.get("cuts", [])]
    soft = [int(f) for f in plan.get("soft", [])]
    events = [int(f) for f in plan.get("events", [])]
    rows = [{"f": f, "kind": "CUT"} for f in cuts] + [{"f": f, "kind": "SOFT"} for f in soft]
    if fp:
        for t in fp.get("editing", {}).get("cut_times", []):
            c = int(round(t * fps))
            if any(abs(c - p) <= 2 for p in cuts) or any(abs(c - p) <= 8 for p in soft):
                continue
            rows.append({"f": c, "kind": "EVENT" if any(0 <= c - e <= 12 for e in events) else "UNPLANNED"})
    rows.sort(key=lambda r: r["f"])
    return rows


def strips(video: str, plan_path: str, out: str, analysis: str | None = None, around: int = 4, tile_w: int = 150) -> dict:
    from PIL import Image, ImageDraw
    plan = json.load(open(plan_path, encoding="utf-8"))
    fps, total = float(plan.get("fps", 30)), int(plan.get("durationInFrames", 10 ** 9))
    fp = None
    if analysis and os.path.exists(os.path.join(analysis, "fingerprint.json")):
        fp = json.load(open(os.path.join(analysis, "fingerprint.json"), encoding="utf-8"))
    rows = transitions(plan, fp, fps)
    if not rows:
        return {"rows": [], "out": None}
    n = 2 * around + 1
    wins = [(max(0, r["f"] - around), min(total - 1, r["f"] + around)) for r in rows]
    sel = "+".join(f"between(n\\,{a}\\,{b})" for a, b in wins)
    tmp = tempfile.mkdtemp(prefix="vf_strips_")
    base = ["ffmpeg", "-v", "error", "-y", "-i", video, "-vf", f"select='{sel}',scale={tile_w}:-2"]
    r = subprocess.run(base + ["-fps_mode", "passthrough", os.path.join(tmp, "f_%05d.png")], capture_output=True)
    if r.returncode != 0:  # ffmpeg < 5.1 spells it -vsync 0
        subprocess.run(base + ["-vsync", "0", os.path.join(tmp, "f_%05d.png")], check=True)
    files = sorted(os.listdir(tmp))
    # windows may overlap (frames are emitted once): map each window to the selected frame list
    selected = sorted(set(f for a, b in wins for f in range(a, b + 1)))
    idx = {f: i for i, f in enumerate(selected)}
    ims = {f: Image.open(os.path.join(tmp, files[i])).convert("RGB") for f, i in idx.items() if i < len(files)}
    th = next(iter(ims.values())).size[1]
    label_w = 150
    sheet = Image.new("RGB", (label_w + n * tile_w, len(rows) * th), (18, 14, 22))
    g = ImageDraw.Draw(sheet)
    col = {"CUT": (255, 230, 60), "SOFT": (120, 200, 255), "EVENT": (255, 160, 60), "UNPLANNED": (255, 70, 70)}
    for i, (r, (a, b)) in enumerate(zip(rows, wins)):
        fr = [f for f in range(a, b + 1) if f in ims]
        lum = [np.asarray(ims[f].convert("L"), dtype=np.float32) for f in fr]
        d = [float(np.abs(lum[k + 1] - lum[k]).mean()) for k in range(len(lum) - 1)]
        if d:
            k = int(np.argmax(d))
            rest = [v for j, v in enumerate(d) if j != k]
            r["harsh"] = round(d[k] / max(0.5, float(np.median(rest)) if rest else 0.5), 1)
            r["jump_at"] = fr[k + 1]
        for j, f in enumerate(fr):
            sheet.paste(ims[f], (label_w + (f - (r["f"] - around)) * tile_w, i * th))
        g.text((6, i * th + 6), f"{r['kind']}", fill=col[r["kind"]])
        g.text((6, i * th + 22), f"f {r['f']}  ({r['f'] / fps:.2f} s)", fill=(230, 230, 230))
        g.text((6, i * th + 38), f"harsh {r.get('harsh', 0)}", fill=(255, 120, 120) if r.get("harsh", 0) > 6 and r["kind"] != "CUT" else (200, 200, 200))
        x = label_w + around * tile_w
        g.line((x, i * th, x, i * th + th), fill=col[r["kind"]], width=1)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    sheet.save(out, quality=86)
    res = {"rows": rows, "out": out, "unplanned": [r["f"] for r in rows if r["kind"] == "UNPLANNED"], "event_explained": [r["f"] for r in rows if r["kind"] == "EVENT"]}
    json.dump(res, open(os.path.splitext(out)[0] + ".json", "w", encoding="utf-8"), indent=1)
    return res
