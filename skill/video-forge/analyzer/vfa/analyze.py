"""One-pass video analysis -> fingerprint.json + report.md + look_suggestion.json + visual artifacts."""
from __future__ import annotations

import json
import math
import os
import time

import cv2
import numpy as np

from . import __version__
from .audio import analyze_audio
from .frame_metrics import MotionEstimator, color_metrics, hsv_hist, texture_metrics
from .mediaio import grab_frame, iter_frames, probe
from .shots import analyze_shot, detect_cuts, summarize_camera, summarize_editing
from .visuals import SheetWriter, palette, palette_strip, timeline_chart

COLOR_KEYS = ["luma_mean", "luma_std", "luma_p1", "luma_p5", "luma_p50", "luma_p95", "luma_p99", "clip_black",
              "clip_white", "sat_mean", "sat_p90", "colorfulness", "warmth", "shadow_a", "shadow_b", "shadow_chroma",
              "high_a", "high_b", "high_chroma", "mid_a", "mid_b"]
TEX_KEYS = ["edge_density", "ink_density", "ink_on_edges", "grain_sigma", "dof_ratio"]
MOT_KEYS = ["dx", "dy", "dlogs", "drot", "inliers", "residual", "activity", "fg_motion"]


def native_scale_estimate(gray: np.ndarray, cliff_decades: float = 1.2) -> dict:
    """Heuristic native-detail estimate from the spectrum.

    An image upscaled by k carries (almost) no energy above 1/k of Nyquist, so
    its radial log-power profile shows a "cliff" at r = 1/k. Native renders and
    camera footage decay smoothly. Calibrated on synthetic data: 2x and 3x
    upscales are detected reliably; ~1.33x upscales and upscales hidden under
    grain/noise are often NOT detected (reported as native). Treat as a WARN
    signal, never as proof.
    """
    g = gray.astype(np.float32)
    g -= g.mean()
    h, w = g.shape
    win = np.outer(np.hanning(h), np.hanning(w)).astype(np.float32)
    P = np.abs(np.fft.fftshift(np.fft.fft2(g * win))) ** 2
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.maximum(np.abs(xx - w / 2) / (w / 2), np.abs(yy - h / 2) / (h / 2))  # separable resize => square cutoff
    bins = np.clip((r * 100).astype(int), 0, 100)
    s = np.bincount(bins.ravel(), P.ravel(), 101) / np.maximum(1, np.bincount(bins.ravel(), None, 101))
    s = np.convolve(np.log10(s[:100] + 1e-6), np.ones(3) / 3, "same")
    depth, at = 0.0, 1.0
    for k in range(15, 95):
        d = s[max(10, k - 6):k - 1].mean() - s[k + 2:min(100, k + 8)].mean()
        if d > depth:
            depth, at = float(d), k / 100
    upscaled = depth >= cliff_decades and at <= 0.85
    f = round(1.0 / at, 2) if upscaled else 1.0
    return {"cliff_decades": round(depth, 2), "cliff_at_nyquist": at, "upscale_factor_estimate": f,
            "effective_height": int(h / f)}


def lab_hue_name(a: float, b: float) -> str:
    c = math.hypot(a, b)
    if c < 2.0:
        return "neutral"
    h = math.degrees(math.atan2(b, a)) % 360
    for lim, name in ((20, "magenta-red"), (55, "red-orange"), (80, "orange"), (105, "yellow"), (150, "yellow-green"),
                      (190, "green"), (230, "teal-cyan"), (265, "cyan-blue"), (300, "blue"), (330, "blue-violet"),
                      (350, "purple-magenta"), (361, "magenta-red")):
        if h < lim:
            return name
    return "?"


def _stats(v: np.ndarray) -> dict:
    v = np.asarray(v, np.float64)
    v = v[np.isfinite(v)]
    if not len(v):
        return {"median": None}
    return {"median": float(np.median(v)), "p10": float(np.percentile(v, 10)), "p90": float(np.percentile(v, 90))}


def analyze(path: str, out_dir: str, width: int = 512, sheets: str = "auto", sheet_seconds: float = 2.0,
            speech: str = "auto", whisper_model: str = "small", keyframes: bool = True,
            start: float = 0.0, duration: float | None = None, quiet: bool = False,
            deep: bool = False, deep_skip: list[str] | None = None) -> dict:
    t0 = time.time()
    os.makedirs(out_dir, exist_ok=True)
    pr = probe(path)
    fps = pr.fps
    dur = duration or max(0.0, pr.duration - start)
    if sheets == "auto":
        sheets = "all" if dur <= 240 else "sampled"
    per = max(1, int(round(sheet_seconds * fps)))
    stride = 1 if sheets == "all" else max(1, int(round(10.0 / sheet_seconds)))
    sw = SheetWriter(os.path.join(out_dir, "sheets"), fps, per, stride_sheets=stride) if sheets != "none" else None

    rows: dict[str, list] = {k: [] for k in COLOR_KEYS + TEX_KEYS + MOT_KEYS + ["hist_d", "luma_d"]}
    method_counts: dict[str, int] = {}
    est = None
    prev_hist = prev_gray = None
    n = 0
    for rgb in iter_frames(path, width, start=start, duration=duration):
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        if est is None:
            est = MotionEstimator(gray.shape[1], gray.shape[0])
        cm = color_metrics(rgb, gray)
        tm = texture_metrics(gray)
        mm = est.update(gray)
        hist = hsv_hist(rgb)
        hd = 0.0 if prev_hist is None else float(cv2.compareHist(prev_hist, hist, cv2.HISTCMP_BHATTACHARYYA))
        ld = 0.0 if prev_gray is None else float(np.abs(gray.astype(np.int16) - prev_gray).mean() / 255.0)
        for k in COLOR_KEYS:
            rows[k].append(cm[k])
        for k in TEX_KEYS:
            rows[k].append(tm[k])
        for k in MOT_KEYS:
            rows[k].append(mm[k])
        rows["hist_d"].append(hd)
        rows["luma_d"].append(ld)
        method_counts[mm["method"]] = method_counts.get(mm["method"], 0) + 1
        if sw:
            if hd > 0.3 and not (mm["inliers"] > 0.6 and mm["residual"] < 1.2):
                sw.cut_set.add(n)  # provisional marker (final cuts are in fingerprint.json)
            sw.add(n, rgb)
        prev_hist, prev_gray = hist, gray.astype(np.int16)
        n += 1
        if not quiet and n % 900 == 0:
            print(f"[vfa] {n} frames ({n / fps:.0f}s) analysed, {n / (time.time() - t0):.0f} fps")
    if n == 0:
        raise SystemExit("[vfa] decoded zero frames")
    A = {k: np.asarray(v, np.float64) for k, v in rows.items()}

    cuts, flashes = detect_cuts(A["hist_d"], A["luma_d"], A["residual"], A["inliers"], fps)
    # zero the motion sample across cuts (it's meaningless there)
    for c in cuts:
        for k in ("dx", "dy", "dlogs", "drot"):
            A[k][c] = 0.0
    bounds = [0] + cuts + [n]
    shots = [analyze_shot(A, bounds[i], bounds[i + 1], fps) for i in range(len(bounds) - 1)]
    camera = summarize_camera(shots, fps)
    editing = summarize_editing(shots, cuts, flashes, n, fps)

    # re-render sheets with cut highlights (sheets were streamed; mark cuts in a sidecar list instead)
    if sw:
        sw.flush()

    # keyframes + palettes + native-resolution estimate (full-res stills)
    kf_dir = os.path.join(out_dir, "keyframes")
    os.makedirs(kf_dir, exist_ok=True)
    shot_pals, res_est = [], []
    pick = shots if len(shots) <= 60 else [shots[i] for i in np.linspace(0, len(shots) - 1, 60).astype(int)]
    for s in shots:
        s["palette"] = None
    for idx, s in enumerate(pick):
        mid = (s["start"] + s["end"]) // 2
        p = os.path.join(kf_dir, f"shot{shots.index(s):03d}_f{mid:06d}.jpg")
        if keyframes:
            try:
                grab_frame(path, start + mid / fps, p)
                im = cv2.cvtColor(cv2.imread(p), cv2.COLOR_BGR2RGB)
                s["keyframe"] = p
                s["palette"] = palette(im)
                shot_pals.append(s["palette"])
                if idx % max(1, len(pick) // 8) == 0:
                    res_est.append(native_scale_estimate(cv2.cvtColor(im, cv2.COLOR_RGB2GRAY)))
            except Exception as e:  # pragma: no cover
                s["keyframe_error"] = str(e)
    if shot_pals:
        palette_strip(os.path.join(out_dir, "palettes.png"), shot_pals)

    color = {k: _stats(A[k]) for k in COLOR_KEYS}
    texture = {k: _stats(A[k]) for k in TEX_KEYS}
    sh_a, sh_b = color["shadow_a"]["median"], color["shadow_b"]["median"]
    hi_a, hi_b = color["high_a"]["median"], color["high_b"]["median"]
    color["shadow_tint_name"] = lab_hue_name(sh_a, sh_b)
    color["highlight_tint_name"] = lab_hue_name(hi_a, hi_b)
    motion = {"activity": _stats(A["activity"]), "fg_motion": _stats(A["fg_motion"]),
              "estimator_usage": method_counts}

    audio = analyze_audio(path, dur, out_dir, speech=speech, whisper_model=whisper_model) if pr.has_audio else {"has_audio": False}

    words = None
    tpath = os.path.join(out_dir, "transcript.json")
    if os.path.exists(tpath):
        words = json.load(open(tpath, encoding="utf-8")).get("words") or None
    env = np.load(os.path.join(out_dir, "audio_env_db.npy")) if os.path.exists(os.path.join(out_dir, "audio_env_db.npy")) else None
    onsets = json.load(open(os.path.join(out_dir, "onsets.json"))) if os.path.exists(os.path.join(out_dir, "onsets.json")) else None
    speed_all = np.zeros(n)
    for s in shots:
        if "_speed_series" in s:
            speed_all[s["start"] + 1: s["start"] + 1 + len(s["_speed_series"])] = s["_speed_series"]
    timeline_chart(os.path.join(out_dir, "timeline.png"), {
        "luma": A["luma_mean"], "contrast": A["luma_std"], "saturation": A["sat_mean"],
        "colorfulness": A["colorfulness"], "cam speed": speed_all, "zoom/frame": A["dlogs"],
        "activity": A["activity"], "ink/edges": A["ink_on_edges"], "dof ratio": A["dof_ratio"],
    }, fps, cuts, env, onsets, words)

    for s in shots:
        s.pop("_speed_series", None)
    np.savez_compressed(os.path.join(out_dir, "frames.npz"), **A)

    fp = {
        "schema": "vfa.fingerprint/1", "tool_version": __version__,
        "source": {**pr.to_dict(), "analysis_width": width, "frames_analysed": n, "start": start,
                   "analysed_seconds": n / fps},
        "editing": editing, "camera": camera, "color": color, "texture": texture, "motion": motion,
        "audio": audio,
        "resolution": {},
        "shots": shots,
        "artifacts": {"sheets": sw.written if sw else [], "timeline": os.path.join(out_dir, "timeline.png"),
                      "keyframes_dir": kf_dir, "palettes": os.path.join(out_dir, "palettes.png")},
        "elapsed_s": round(time.time() - t0, 1),
    }
    if res_est:
        fp["resolution"] = {"upscale_factor_estimate_median": float(np.median([r["upscale_factor_estimate"] for r in res_est])),
                            "effective_height_median": int(np.median([r["effective_height"] for r in res_est])),
                            "samples": res_est}
    with open(os.path.join(out_dir, "fingerprint.json"), "w", encoding="utf-8") as f:
        json.dump(fp, f, indent=1, default=float)
    look = look_suggestion(fp)
    with open(os.path.join(out_dir, "look_suggestion.json"), "w") as f:
        json.dump(look, f, indent=1)
    with open(os.path.join(out_dir, "report.md"), "w", encoding="utf-8") as f:
        f.write(render_report(fp, look))
    if deep:
        if start > 0 or duration:
            print("[vfa] --deep needs a full-length analysis (no --start/--duration); extras skipped")
        else:
            from .deep import run_deep
            fp["deep"], deep_md = run_deep(out_dir, deep_skip, quiet)
            with open(os.path.join(out_dir, "fingerprint.json"), "w", encoding="utf-8") as f:
                json.dump(fp, f, indent=1, default=float)
            with open(os.path.join(out_dir, "report.md"), "a", encoding="utf-8") as f:
                f.write(deep_md + "\n")
    if not quiet:
        print(f"[vfa] done: {n} frames, {len(shots)} shots in {fp['elapsed_s']}s -> {out_dir}")
    return fp


# --------------------------------------------------------------------------- derived outputs

def look_suggestion(fp: dict) -> dict:
    """Translate measurements into video-forge engine parameters (engine/src/look/types.ts)."""
    c, t, cam, ed = fp["color"], fp["texture"], fp["camera"], fp["editing"]
    m = lambda d, k, default=0.0: (d.get(k) or {}).get("median", default) if isinstance(d.get(k), dict) else default
    p1, p99 = m(c, "luma_p1"), m(c, "luma_p99", 1.0)
    sat = m(c, "sat_mean", 0.4)
    # Lab a/b -> approximate RGB tint offsets (normalized, small)
    def tint(a, b):
        r = 0.0045 * a + 0.0015 * b
        g = -0.004 * a + 0.0015 * b
        bl = -0.006 * b + 0.001 * a
        return [round(r, 4), round(g, 4), round(bl, 4)]
    glide = cam.get("glide_frames_median") or 24
    return {
        "schema": "videoforge.look/1",
        "grade": {
            "blackPoint": round(max(0.0, p1 - 0.005), 4),      # lift so blacks never hit 0 if the ref doesn't
            "whitePoint": round(min(1.0, p99 + 0.005), 4),
            "contrast": round(m(c, "luma_std", 0.2) / 0.22, 3),  # 1.0 ~ "typical" footage
            "saturation": round(sat / 0.40, 3),
            "shadowTint": tint(m(c, "shadow_a"), m(c, "shadow_b")),
            "highlightTint": tint(m(c, "high_a"), m(c, "high_b")),
            "warmth": round(m(c, "warmth"), 4),
        },
        "ink": {"strength": round(min(1.0, m(t, "ink_on_edges") * 1.3), 3), "measured_ink_on_edges": m(t, "ink_on_edges")},
        "dof": {"enabled": m(t, "dof_ratio", 1) > 1.4, "measured_ratio": m(t, "dof_ratio", 1)},
        "grain": {"sigma_8bit": round(m(t, "grain_sigma"), 3)},
        "camera": {"glideFrames": int(round(glide)), "attackFrames": int(cam.get("attack_frames_median") or glide / 2),
                   "releaseFrames": int(cam.get("release_frames_median") or glide / 2),
                   "creepPerSecond": round(max(0.0, cam.get("speed_median", 0.0)), 4),
                   "movingFrac": cam.get("frac_creep", 0.0), "pushInShotFrac": cam.get("push_in_shot_frac", 0.0)},
        "edit": {"aslSeconds": round(ed.get("asl_seconds", 3.0), 3), "cutsPerMinute": round(ed.get("cuts_per_minute", 0), 2)},
        "audio": {k: fp["audio"].get(k) for k in ("integrated_lufs", "lra_lu", "true_peak_dbtp", "bpm")}
        | {"wps": (fp["audio"].get("speech") or {}).get("wps_speaking")},
    }


def _f(v, fmt="{:.3f}"):
    return "n/a" if v is None else fmt.format(v)


def render_report(fp: dict, look: dict) -> str:
    s, ed, cam, c, t, au = fp["source"], fp["editing"], fp["camera"], fp["color"], fp["texture"], fp["audio"]
    md = lambda d, k: (d.get(k) or {}).get("median")
    L = [f"# Video analysis: `{os.path.basename(s['path'])}`", "",
         f"{s['width']}x{s['height']} ({s['aspect']}) @ {s['fps']:.3f} fps, {s['analysed_seconds']:.1f}s analysed, "
         f"{s['frames_analysed']} frames (every frame), codec {s['vcodec']}. Analysis took {fp['elapsed_s']}s.", "",
         "> Numbers, not opinions: every rule below is measured. Re-run the same analysis on your render and diff "
         "(`vfa compare`) -- the delta is the to-do list.", "",
         "## Editing", f"- Shots: **{ed['shots']}**, hard cuts: {ed['hard_cuts']} ({ed['cuts_per_minute']:.1f}/min), flash frames: {ed['flash_frames']}",
         f"- Average shot length {ed['asl_seconds']:.2f}s (median {ed['shot_len_median']:.2f}s, p10 {ed['shot_len_p10']:.2f}s, p90 {ed['shot_len_p90']:.2f}s, longest {ed['longest_shot']:.1f}s)",
         f"- First cut at {ed['first_cut_seconds']:.2f}s", "",
         "## Camera",
         f"- Frames with camera motion: creep>{0.5}%w/s **{cam['frac_creep'] * 100:.0f}%**, move>3%w/s {cam['frac_move'] * 100:.0f}%, fast>15% {cam['frac_fast'] * 100:.0f}%, whip>60% {cam['frac_whip'] * 100:.1f}%",
         f"- Moves/min {cam['moves_per_minute']:.1f}; glide length median **{cam['glide_frames_median']:.0f} frames** (IQR {cam['glide_frames_p25']:.0f}-{cam['glide_frames_p75']:.0f}); attack {cam['attack_frames_median']:.0f}f / release {cam['release_frames_median']:.0f}f",
         f"- Easing histogram: {cam['ease_histogram']}",
         f"- Push-in shots {cam['push_in_shot_frac'] * 100:.0f}%, pull-out shots {cam['pull_out_shot_frac'] * 100:.0f}%; jerk RMS median {cam['jerk_rms_median']:.3f} w/s^3",
         f"- Estimators used: {fp['motion']['estimator_usage']}", "",
         "## Color & grade",
         f"- Luma mean {_f(md(c, 'luma_mean'))}, contrast (std) {_f(md(c, 'luma_std'))}; black floor p1 **{_f(md(c, 'luma_p1'))}**, p99 {_f(md(c, 'luma_p99'))}; clipped black {_f(md(c, 'clip_black'), '{:.2%}')}, clipped white {_f(md(c, 'clip_white'), '{:.2%}')}",
         f"- Saturation mean {_f(md(c, 'sat_mean'))} (p90 {_f(md(c, 'sat_p90'))}), colorfulness {_f(md(c, 'colorfulness'))}, warmth (R-B) {_f(md(c, 'warmth'))}",
         f"- Shadow tint: **{c['shadow_tint_name']}** (Lab a {_f(md(c, 'shadow_a'), '{:.1f}')}, b {_f(md(c, 'shadow_b'), '{:.1f}')}); highlight tint: **{c['highlight_tint_name']}** (a {_f(md(c, 'high_a'), '{:.1f}')}, b {_f(md(c, 'high_b'), '{:.1f}')})", "",
         "## Texture & lens",
         f"- Ink lines on edges: **{_f(md(t, 'ink_on_edges'), '{:.0%}')}** of detected edges have a dark line (ink density {_f(md(t, 'ink_density'), '{:.2%}')})",
         f"- Edge density {_f(md(t, 'edge_density'), '{:.2%}')}, grain sigma {_f(md(t, 'grain_sigma'), '{:.2f}')} (8-bit units)",
         f"- DOF ratio centre/border sharpness {_f(md(t, 'dof_ratio'), '{:.2f}')} (>1.4 suggests shallow depth of field / background blur)",
         f"- Subject/micro-animation activity (camera-compensated) median {_f(md(fp['motion'], 'activity'), '{:.4f}')}", ""]
    r = fp.get("resolution") or {}
    if r:
        L += ["## Resolution honesty",
              f"- Container {s['width']}x{s['height']}; detail estimate suggests effective height ~**{r.get('effective_height_median')}px** "
              f"(upscale factor ~{r.get('upscale_factor_estimate_median')}). 1.0 = native detail.", ""]
    if au.get("has_audio"):
        L += ["## Audio",
              f"- Loudness {_f(au.get('integrated_lufs'), '{:.1f}')} LUFS, LRA {_f(au.get('lra_lu'), '{:.1f}')} LU, true peak {_f(au.get('true_peak_dbtp'), '{:.1f}')} dBTP",
              f"- Silence {au['silence_frac'] * 100:.1f}% of runtime; onset rate {au['onset_rate']:.2f}/s; tempo {_f(au.get('bpm'), '{:.0f}')} bpm (conf {au['bpm_confidence']:.2f})"]
        sp = au.get("speech") or {}
        if sp.get("has_speech"):
            L += [f"- Speech ({sp.get('engine')}): {sp['words']} words, **{sp['wps_speaking']:.2f} words/s** while speaking ({sp['wps_overall']:.2f} overall), starts at {sp['speech_start_s']:.2f}s, {sp['words_first_3s']} words in first 3 s",
                  f"- Pauses median {sp['pause_median_s']:.2f}s, p90 {sp['pause_p90_s']:.2f}s, long (>0.6s) pauses: {sp['long_pauses']}",
                  f"- Hook (first sentence): \"{sp['hook'][:240]}\"",
                  f"- Repeated sentence openers: {dict(list(sp['repeated_openers'].items())[:8])}"]
        L.append("")
    L += ["## Shot list", "", "| # | start | dur | camera | glide/ease | activity | palette |", "|---|---|---|---|---|---|---|"]
    fps = s["fps"]
    for i, sh in enumerate(fp["shots"][:400]):
        mv = sh.get("moves") or []
        ease = "; ".join(f"{m['frames']}f {m['ease']}" for m in mv[:3]) or "-"
        pal = " ".join(p["hex"] for p in (sh.get("palette") or [])[:4])
        L.append(f"| {i} | {sh['start'] / fps:.2f}s | {sh['seconds']:.2f}s | {sh.get('camera', '-')} | {ease} | {_f(sh.get('activity_median'), '{:.4f}')} | {pal} |")
    L += ["", "## Engine look suggestion", "", "```json", json.dumps(look, indent=1), "```", "",
          "## Artifacts", f"- Timeline chart: `{fp['artifacts']['timeline']}` (look at this first)",
          f"- Contact sheets: {len(fp['artifacts']['sheets'])} in `sheets/` (frame numbers burned in, cuts boxed red)",
          f"- Keyframes per shot: `{fp['artifacts']['keyframes_dir']}`", ""]
    return "\n".join(L)
