"""Channel-scale analysis: analyze many videos in parallel, aggregate per group, correlate with views.

  vfa batch VIDEO_DIR --out DIR [--workers 3] [--meta selection.json] [--group-key era] [--speech auto]

selection.json (optional) = [{"id": "...", "title": "...", "views": 123, "era": "explainer"}, ...]
(ids match video file stems). Produces:
  DIR/<id>/...                  full per-video analysis (fingerprint, report, sheets, keyframes)
  DIR/index.md / index.json     one row per video (title, views, duration, cuts, wps, hook, camera, colour)
  DIR/group_<g>/                aggregate fingerprint + style_fingerprint.md per group (e.g. per era)
  DIR/all/                      aggregate over everything
  DIR/views_correlation.md      Spearman rank correlation of each metric with log(views) (indicative only)
"""
from __future__ import annotations

import glob
import json
import re
import math
import os
from concurrent.futures import ProcessPoolExecutor, as_completed

import numpy as np

from .compare import METRICS, aggregate, aggregate_md, get, load

VIDEO_EXT = (".mkv", ".mp4", ".webm", ".mov")


def _one(args):
    path, out, speech = args
    from .analyze import analyze
    if os.path.exists(os.path.join(out, "fingerprint.json")):
        return path, out, "cached"
    try:
        analyze(path, out, sheets="all", speech=speech, quiet=True)
        return path, out, "ok"
    except Exception as e:  # keep the batch going; report at the end
        return path, out, f"error: {e}"


def _rank(a):
    order = np.argsort(a)
    r = np.empty(len(a))
    r[order] = np.arange(len(a))
    return r


def spearman(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    m = np.isfinite(x) & np.isfinite(y)
    if m.sum() < 6:
        return None
    rx, ry = _rank(x[m]), _rank(y[m])
    if rx.std() == 0 or ry.std() == 0:
        return None
    return float(np.corrcoef(rx, ry)[0, 1])


def run_batch(video_dir: str, out: str, workers: int = 3, meta_path: str | None = None, group_key: str | None = None,
              speech: str = "auto") -> dict:
    os.makedirs(out, exist_ok=True)
    # skip yt-dlp partial/intermediate streams (id.f400.mp4, *.part) still being merged
    vids = sorted(p for p in glob.glob(os.path.join(video_dir, "*")) if p.lower().endswith(VIDEO_EXT)
                  and not re.search(r"\.f\d+\.\w+$", p))
    meta = {}
    if meta_path:
        for m in json.load(open(meta_path, encoding="utf-8")):
            meta[m["id"]] = m
    jobs = [(v, os.path.join(out, os.path.splitext(os.path.basename(v))[0]), speech) for v in vids]
    status = {}
    with ProcessPoolExecutor(max_workers=max(1, workers)) as ex:
        futs = [ex.submit(_one, j) for j in jobs]
        for i, f in enumerate(as_completed(futs), 1):
            p, o, st = f.result()
            status[os.path.basename(o)] = st
            print(f"[batch] {i}/{len(jobs)} {os.path.basename(p)}: {st}", flush=True)

    rows, fps_by_id = [], {}
    for v, o, _ in jobs:
        vid = os.path.basename(o)
        if not os.path.exists(os.path.join(o, "fingerprint.json")):
            continue
        fp = load(o)
        fps_by_id[vid] = fp
        info = {}
        ij = os.path.splitext(v)[0] + ".info.json"
        if os.path.exists(ij):
            d = json.load(open(ij, encoding="utf-8"))
            info = {"title": d.get("title"), "views": d.get("view_count"), "upload_date": d.get("upload_date"), "likes": d.get("like_count")}
        m = {**info, **meta.get(vid, {})}
        sp = (fp.get("audio") or {}).get("speech") or {}
        c, cam, ed = fp["color"], fp["camera"], fp["editing"]
        rows.append({
            "id": vid, "title": m.get("title"), "views": m.get("views"), "group": m.get(group_key) if group_key else None,
            "upload_date": m.get("upload_date"), "seconds": round(fp["source"]["analysed_seconds"], 2),
            "w": fp["source"]["width"], "h": fp["source"]["height"],
            "cuts": ed["hard_cuts"], "asl": round(ed["asl_seconds"], 2), "wps": sp.get("wps_speaking"),
            "speech_start": sp.get("speech_start_s"), "hook": sp.get("hook"),
            "moving": round(cam["frac_creep"], 3), "glide": cam["glide_frames_median"], "push_in": cam["push_in_shot_frac"],
            "black_p1": c["luma_p1"]["median"], "sat": c["sat_mean"]["median"], "shadow": c["shadow_tint_name"],
            "ink": fp["texture"]["ink_on_edges"]["median"], "dof": fp["texture"]["dof_ratio"]["median"],
            "lufs": (fp.get("audio") or {}).get("integrated_lufs"), "bpm": (fp.get("audio") or {}).get("bpm"),
        })
    rows.sort(key=lambda r: -(r["views"] or 0))
    json.dump(rows, open(os.path.join(out, "index.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    L = [f"# Batch index ({len(rows)} videos)", "", "| views | group | s | cuts | ASL | wps | moving | glide f | black p1 | sat | ink | shadow | LUFS | hook |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    f2 = lambda v, fmt="{:.2f}": "-" if v is None else fmt.format(v)
    for r in rows:
        L.append(f"| {r['views'] or 0:,} | {r['group'] or ''} | {r['seconds']} | {r['cuts']} | {r['asl']} | {f2(r['wps'])} | {r['moving']:.0%} | {r['glide']:.0f} | "
                 f"{f2(r['black_p1'], '{:.3f}')} | {f2(r['sat'])} | {f2(r['ink'])} | {r['shadow']} | {f2(r['lufs'], '{:.1f}')} | {(r['hook'] or '')[:90]} |")
    open(os.path.join(out, "index.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")

    groups = {"all": list(fps_by_id)}
    if group_key:
        for r in rows:
            if r["group"]:
                groups.setdefault(f"group_{r['group']}", []).append(r["id"])
    for g, ids in groups.items():
        if len(ids) < 2:
            continue
        agg = aggregate([fps_by_id[i] for i in ids])
        d = os.path.join(out, g)
        os.makedirs(d, exist_ok=True)
        json.dump(agg, open(os.path.join(d, "fingerprint_aggregate.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        open(os.path.join(d, "style_fingerprint.md"), "w", encoding="utf-8").write(aggregate_md(agg))

    # what goes with views (rank correlation; small samples => indicative only)
    views = {r["id"]: r["views"] for r in rows if r["views"]}
    corr = []
    for path, label, *_ in METRICS:
        xs, ys = [], []
        for vid, fp in fps_by_id.items():
            v = get(fp, path)
            if v is not None and vid in views:
                xs.append(v)
                ys.append(math.log10(views[vid]))
        rho = spearman(xs, ys)
        if rho is not None:
            corr.append((abs(rho), rho, label, len(xs)))
    corr.sort(reverse=True)
    C = ["# Metric vs log(views): Spearman rank correlation", "",
         f"n = {len(views)} videos. |rho| < 0.3 is noise at this sample size; correlation is not causation "
         "(eras, topics and the algorithm confound it). Use as hypotheses, not rules.", "", "| metric | rho | n |", "|---|---|---|"]
    C += [f"| {lab} | {rho:+.2f} | {n} |" for _, rho, lab, n in corr]
    open(os.path.join(out, "views_correlation.md"), "w", encoding="utf-8").write("\n".join(C) + "\n")
    errors = {k: v for k, v in status.items() if v.startswith("error")}
    print(f"[batch] done: {len(rows)} analysed, {len(errors)} errors -> {out}")
    return {"rows": rows, "errors": errors}
