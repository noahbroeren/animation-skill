"""Reference-vs-ours gap analysis and multi-video aggregation (channel style fingerprints)."""
from __future__ import annotations

import json
import math
import os

import numpy as np

# (path, label, tolerance, unit, advice if ours too LOW, advice if ours too HIGH)
METRICS = [
    ("color.luma_mean.median", "mean brightness", 0.04, "", "raise exposure / key light", "lower exposure"),
    ("color.luma_std.median", "contrast", 0.025, "", "increase contrast (deeper darks, brighter highlights)", "reduce contrast"),
    ("color.luma_p1.median", "black floor (p1)", 0.02, "", "lift blacks (raise grade.blackPoint): our darks go deeper than the reference", "deepen blacks (lower blackPoint)"),
    ("color.luma_p99.median", "white ceiling (p99)", 0.03, "", "brighten highlights / gain", "pull highlights down"),
    ("color.clip_black.median", "clipped black px", 0.01, "", "", "lift blacks: pure black is clipping"),
    ("color.clip_white.median", "clipped white px", 0.01, "", "", "highlights are burning out: lower gain / tone-map"),
    ("color.sat_mean.median", "saturation", 0.04, "", "increase saturation", "desaturate"),
    ("color.colorfulness.median", "colorfulness", 0.03, "", "bolder, more varied hues", "fewer/less intense hues"),
    ("color.warmth.median", "warmth (R-B)", 0.025, "", "warm the grade", "cool the grade"),
    ("color.shadow_a.median", "shadow tint a (green-/magenta+)", 2.0, "", "push shadows toward magenta", "push shadows toward green"),
    ("color.shadow_b.median", "shadow tint b (blue-/yellow+)", 2.0, "", "push shadows toward yellow", "push shadows toward blue"),
    ("color.high_a.median", "highlight tint a", 2.0, "", "highlights toward magenta/red", "highlights toward green"),
    ("color.high_b.median", "highlight tint b", 2.0, "", "highlights warmer (yellow)", "highlights cooler (blue)"),
    ("texture.ink_on_edges.median", "ink lines on edges", 0.08, "", "add/strengthen outline (ink) pass", "thin/weaken outlines"),
    ("texture.edge_density.median", "edge density (detail)", 0.015, "", "more texture/detail in materials", "simplify textures"),
    ("texture.grain_sigma.median", "grain sigma", 0.6, "", "add film grain", "reduce grain/noise"),
    ("texture.dof_ratio.median", "DOF centre/border sharpness", 0.3, "", "blur background more (DOF)", "less background blur"),
    ("motion.activity.median", "micro-animation activity", 0.004, "", "add idle/secondary animation (breathing, blinks, sway, particles)", "calm the motion"),
    ("camera.frac_creep", "frames with camera motion", 0.1, "", "never hold a dead-still camera: add slow creeps/push-ins", "lock the camera more"),
    ("camera.frac_fast", "frames with fast camera motion", 0.05, "", "more energetic moves", "fewer fast moves"),
    ("camera.glide_frames_median", "glide length (frames)", 5, "f", "longer, softer camera glides", "shorter glides"),
    ("camera.attack_frames_median", "move ease-in frames", 4, "f", "longer ease-in on moves", "snappier move starts"),
    ("camera.release_frames_median", "move ease-out frames", 4, "f", "longer ease-out on moves", "snappier move stops"),
    ("camera.jerk_rms_median", "camera jerk", 0.05, "", "", "smooth camera paths (higher-order easing, fewer keys)"),
    ("camera.push_in_shot_frac", "push-in shot fraction", 0.15, "", "more push-ins", "fewer push-ins"),
    ("editing.asl_seconds", "average shot length", 0.6, "s", "hold shots longer / cut less", "cut more often"),
    ("editing.cuts_per_minute", "cuts per minute", 3, "", "cut more", "cut less (travel the camera instead)"),
    ("audio.integrated_lufs", "loudness LUFS", 1.5, "LU", "louder master", "quieter master"),
    ("audio.lra_lu", "loudness range", 2.0, "LU", "more dynamics", "compress more"),
    ("audio.true_peak_dbtp", "true peak", 1.0, "dB", "", "limit peaks (<= -1 dBTP)"),
    ("audio.silence_frac", "silence fraction", 0.04, "", "add breathing room / pauses", "fill dead air"),
    ("audio.onset_rate", "sound onset rate", 0.6, "/s", "more SFX hits / rhythmic events", "fewer hits"),
    ("audio.speech.wps_speaking", "speech rate (words/s)", 0.3, "", "tighter, faster delivery", "slow the delivery"),
    ("audio.speech.speech_start_s", "speech starts at", 0.4, "s", "", "start talking sooner (hook in frame 1)"),
    # --- deep extras (`vfa analyze --deep`); rows appear only when both sides have them
    ("deep.ocr.words_per_page_median", "caption words/page", 0.6, "", "put more words on each caption page", "fewer words per caption page (split pages)"),
    ("deep.ocr.font_size_u_est", "caption font size (u)", 12, "u", "bigger captions", "smaller captions"),
    ("deep.ocr.uppercase_ratio", "caption uppercase share", 0.3, "", "uppercase the captions", "use sentence/lower case captions"),
    ("deep.ocr.center_y_rel", "caption vertical position", 0.06, "", "move captions up", "move captions down"),
    ("deep.ocr.sync_offset_s", "caption lead/lag vs speech", 0.08, "s", "captions appear too early: delay pages", "captions lag the voice: show pages sooner"),
    ("deep.transitions.dissolves_per_minute", "dissolves per minute", 2.0, "/min", "use more cross-dissolves between beats", "fewer dissolves (cut or travel instead)"),
    ("deep.transitions.soft_per_minute", "soft transitions per minute", 3.0, "/min", "more soft/camera transitions (dissolve, whip, zoom)", "fewer soft transitions"),
    ("deep.stems.music_presence", "music presence", 0.15, "", "keep a music bed under more of the runtime", "drop the music more often"),
    ("deep.stems.voice_music_margin_db_median", "voice-over-music margin", 3.0, "dB", "duck the music more under speech", "music can sit louder under the voice"),
    ("deep.stems.non_vocal_onset_rate", "SFX/music hit rate", 0.6, "/s", "more SFX hits / rhythmic accents", "fewer hits"),
]


def get(d: dict, path: str):
    cur = d
    for p in path.split("."):
        if not isinstance(cur, dict) or p not in cur:
            return None
        cur = cur[p]
    return cur if isinstance(cur, (int, float)) and not isinstance(cur, bool) else None


def _fps(d: dict):
    v = (d.get("source") or {}).get("fps")
    return float(v) if isinstance(v, (int, float)) and v > 0 else None


def compare(ref: dict, ours: dict) -> dict:
    rows = []
    # frame-unit metrics are compared in the REFERENCE's frame rate: a 44 f glide @30 is 88 f @60, not "too long".
    # Per-frame motion energy scales ~1/fps (half the displacement per frame at 60 fps).
    rf, of = _fps(ref), _fps(ours)
    k = (rf / of) if rf and of else 1.0
    for path, label, tol, unit, low, high in METRICS:
        r, o = get(ref, path), get(ours, path)
        if r is None or o is None or (isinstance(r, float) and math.isnan(r)):
            continue
        if unit == "f":
            o = o * k
        elif path == "motion.activity.median":
            o = o / k
        delta = o - r
        if path.startswith("camera.jerk"):  # unit-heavy metric: compare relatively (30 % of the reference)
            tol = max(tol, 0.3 * abs(r))
        gap = abs(delta) / tol
        advice = low if delta < 0 else high
        status = "OK" if gap <= 1 else ("CLOSE" if gap <= 2 else "GAP")
        rows.append({"metric": path, "label": label, "ref": r, "ours": o, "delta": delta, "tolerance": tol,
                     "gap": round(gap, 2), "status": status, "advice": advice if status != "OK" else ""})
    rc, oc = (((ref.get("deep") or {}).get("embed") or {}).get("centroid"),
              ((ours.get("deep") or {}).get("embed") or {}).get("centroid"))
    if rc and oc and len(rc) == len(oc) and (ref["deep"]["embed"].get("model") == ours["deep"]["embed"].get("model")):
        a, b = np.asarray(rc, float), np.asarray(oc, float)
        cos = float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))
        gap = max(0.0, 0.9 - cos) / 0.07
        status = "OK" if gap <= 1 else ("CLOSE" if gap <= 2 else "GAP")
        rows.append({"metric": "deep.embed.centroid_cos", "label": "art-style similarity (CLIP centroid cos)", "ref": 1.0,
                     "ours": round(cos, 4), "delta": round(cos - 1.0, 4), "tolerance": 0.07, "gap": round(gap, 2),
                     "status": status, "advice": "" if status == "OK" else
                     "the look drifts from the reference (render style / palette / framing): run `vfa similar REF OURS` for per-shot neighbours"})
    rows.sort(key=lambda x: -x["gap"])
    ok = sum(1 for r in rows if r["status"] == "OK")
    return {"schema": "vfa.compare/1", "matched": ok, "total": len(rows),
            "match_score": round(100.0 * ok / max(1, len(rows)), 1), "rows": rows}


def compare_md(res: dict, ref_name: str, ours_name: str) -> str:
    L = [f"# Gap analysis: `{ours_name}` vs reference `{ref_name}`", "",
         f"**{res['matched']}/{res['total']} metrics within tolerance (score {res['match_score']}).** "
         "Sorted by gap (gap = |delta| / tolerance). Fix from the top; re-render; re-measure.", "",
         "| status | metric | reference | ours | gap | do this |", "|---|---|---|---|---|---|"]
    for r in res["rows"]:
        L.append(f"| {r['status']} | {r['label']} | {r['ref']:.4g} | {r['ours']:.4g} | {r['gap']} | {r['advice']} |")
    return "\n".join(L) + "\n"


def aggregate(fps_list: list[dict]) -> dict:
    """Median across many fingerprints for every metric in METRICS (+ spread), keeping the same schema
    so the aggregate itself can be used as a `compare` reference."""
    out: dict = {"schema": "vfa.fingerprint/1", "aggregate_of": len(fps_list),
                 "sources": [f.get("source", {}).get("path") for f in fps_list], "spread": {}}
    fr = [f.get("source", {}).get("fps") for f in fps_list if isinstance(f.get("source", {}).get("fps"), (int, float))]
    if fr:  # frame-unit metrics are rescaled against this in compare()
        out["source"] = {"fps": float(np.median(fr)), "path": f"aggregate of {len(fps_list)}"}
    for path, *_ in METRICS:
        vals = [get(f, path) for f in fps_list]
        vals = [v for v in vals if v is not None and not (isinstance(v, float) and math.isnan(v))]
        if not vals:
            continue
        med = float(np.median(vals))
        cur = out
        parts = path.split(".")
        for p in parts[:-1]:
            cur = cur.setdefault(p, {})
        cur[parts[-1]] = med
        out["spread"][path] = {"p25": float(np.percentile(vals, 25)), "p75": float(np.percentile(vals, 75)),
                               "n": len(vals)}
    # CLIP style centroid (deep.embed): mean of unit centroids, so an aggregate can be a `compare` reference
    cents = [((f.get("deep") or {}).get("embed") or {}) for f in fps_list]
    cents = [c for c in cents if c.get("centroid")]
    if cents and len({c.get("model") for c in cents}) == 1:
        m = np.mean([np.asarray(c["centroid"], float) for c in cents], axis=0)
        m /= np.linalg.norm(m) + 1e-9
        out.setdefault("deep", {}).setdefault("embed", {}).update(
            {"centroid": [round(float(x), 4) for x in m], "model": cents[0].get("model"), "n": len(cents)})
    # editing & speech patterns that matter for formula extraction
    durations = [f["source"]["analysed_seconds"] for f in fps_list if "source" in f]
    hooks = [((f.get("audio") or {}).get("speech") or {}).get("hook") for f in fps_list]
    openers: dict[str, int] = {}
    for f in fps_list:
        for k, v in (((f.get("audio") or {}).get("speech") or {}).get("repeated_openers") or {}).items():
            openers[k] = openers.get(k, 0) + v
    out["patterns"] = {
        "duration_median_s": float(np.median(durations)) if durations else None,
        "duration_p10_p90": [float(np.percentile(durations, 10)), float(np.percentile(durations, 90))] if durations else None,
        "videos_with_le1_cut": sum(1 for f in fps_list if f.get("editing", {}).get("hard_cuts", 99) <= 1),
        "hooks": [h for h in hooks if h],
        "common_sentence_openers": dict(sorted(openers.items(), key=lambda kv: -kv[1])[:15]),
    }
    return out


def aggregate_md(agg: dict) -> str:
    L = [f"# Style fingerprint across {agg['aggregate_of']} videos", "",
         "Median of each metric (IQR in brackets). Use `fingerprint_aggregate.json` as the `--ref` for `vfa compare`.", "",
         "| metric | median | IQR |", "|---|---|---|"]
    for path, label, *_ in METRICS:
        v = get(agg, path)
        if v is None:
            continue
        sp = agg["spread"].get(path, {})
        L.append(f"| {label} | {v:.4g} | {sp.get('p25', 0):.4g} - {sp.get('p75', 0):.4g} |")
    p = agg["patterns"]
    L += ["", "## Format patterns",
          f"- Duration median {p['duration_median_s']}s (p10-p90 {p['duration_p10_p90']})",
          f"- Videos with <= 1 hard cut: {p['videos_with_le1_cut']}/{agg['aggregate_of']}",
          f"- Common sentence openers: {p['common_sentence_openers']}", "", "## Hooks (first sentence of each video)"]
    L += [f"{i + 1}. {h}" for i, h in enumerate(p["hooks"])]
    return "\n".join(L) + "\n"


def load(path: str) -> dict:
    if os.path.isdir(path):
        path = os.path.join(path, "fingerprint.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)
