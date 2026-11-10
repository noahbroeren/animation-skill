"""Cut detection, shot segmentation and camera-move analysis (glide length, easing, jerk)."""
from __future__ import annotations

import math

import numpy as np
from scipy.ndimage import median_filter
from scipy.signal import savgol_filter

# speed thresholds in "frame widths per second" (combined pan + zoom)
SPEED_BANDS = {"creep": 0.005, "move": 0.03, "fast": 0.15, "whip": 0.6}


def detect_cuts(hist_d: np.ndarray, luma_d: np.ndarray, residual: np.ndarray, inliers: np.ndarray,
                fps: float, min_shot_frames: int = 4) -> tuple[list[int], list[int]]:
    """Return (cut_frames, flash_frames). A cut at index i means frame i starts a new shot.

    Evidence combines an HSV-histogram Bhattacharyya distance and luma change,
    both relative to their rolling median (adaptive to busy footage), and is
    vetoed when the camera model explains the change (fast pans aren't cuts).
    """
    n = len(hist_d)
    if n < 3:
        return [], []
    k = max(5, int(fps // 2) | 1)
    base_h = median_filter(hist_d, size=k, mode="nearest")
    base_l = median_filter(luma_d, size=k, mode="nearest")
    score = (hist_d - base_h) / (base_h + 0.02) + (luma_d - base_l) / (base_l + 0.01)
    cand = (hist_d > 0.25) & (score > 4.0)
    cand |= (hist_d > 0.5) & (score > 2.0)
    explained = (inliers > 0.6) & (residual < 1.2)
    cand &= ~explained
    cuts, flashes = [], []
    last = -10 ** 9
    i = 1
    while i < n:
        if cand[i]:
            # local maximum within +-2 frames
            lo, hi = max(1, i - 2), min(n, i + 3)
            j = lo + int(np.argmax(score[lo:hi]))
            if j - last >= min_shot_frames:
                cuts.append(j)
                last = j
            elif cuts and j - last < min_shot_frames:
                flashes.append(j)
            i = max(i, j) + 1  # never move backwards (regression: infinite loop on long videos)
        else:
            i += 1
    return cuts, flashes


def _bands(speed: np.ndarray) -> dict:
    out = {}
    for name, thr in SPEED_BANDS.items():
        out[f"frac_{name}"] = float((speed > thr).mean()) if len(speed) else 0.0
    out["frac_still"] = float((speed <= SPEED_BANDS["creep"]).mean()) if len(speed) else 0.0
    return out


def _smooth(x: np.ndarray, win: int, deriv: int = 0, dt: float = 1.0) -> np.ndarray:
    if len(x) < 5:
        return np.zeros_like(x) if deriv else x.copy()
    w = min(win, len(x) - (1 - len(x) % 2))
    if w % 2 == 0:
        w -= 1
    w = max(w, 5)
    if w > len(x):
        return np.zeros_like(x) if deriv else x.copy()
    return savgol_filter(x, w, 3, deriv=deriv, delta=dt)


def find_moves(speed_s: np.ndarray, fps: float, thr: float = SPEED_BANDS["move"], min_frames: int = 4) -> list[dict]:
    """Segment a smoothed speed signal into discrete camera moves and describe their easing."""
    moves = []
    on = speed_s > thr
    i, n = 0, len(on)
    while i < n:
        if not on[i]:
            i += 1
            continue
        j = i
        while j < n and on[j]:
            j += 1
        # extend to where speed falls below 25% of threshold (true start/stop of the glide)
        a, b = i, j
        while a > 0 and speed_s[a - 1] > thr * 0.25 and speed_s[a - 1] <= speed_s[a] + 1e-9:
            a -= 1
        while b < n and speed_s[b] > thr * 0.25 and speed_s[b] <= speed_s[b - 1] + 1e-9:
            b += 1
        seg = speed_s[a:b]
        if len(seg) >= max(min_frames, round(min_frames * fps / 30)):  # durations are seconds-based (authored @30)
            pk = int(np.argmax(seg))
            peak = float(seg[pk])
            t10 = next((k for k in range(pk + 1) if seg[k] >= 0.1 * peak), 0)
            t90 = next((k for k in range(pk + 1) if seg[k] >= 0.9 * peak), pk)
            r90 = next((k for k in range(len(seg) - 1, pk - 1, -1) if seg[k] >= 0.9 * peak), pk)
            r10 = next((k for k in range(len(seg) - 1, pk - 1, -1) if seg[k] >= 0.1 * peak), len(seg) - 1)
            attack, release, plateau = t90 - t10, r10 - r90, r90 - t90
            dur = len(seg)
            if dur <= max(6, round(0.2 * fps)):  # < 0.2 s = snap at any fps
                ease = "snap"
            elif plateau > 0.5 * dur:
                ease = "linear-ish (plateau)"
            elif attack > 0.25 * dur and release > 0.25 * dur:
                ease = "ease-in-out"
            elif attack <= 0.15 * dur:
                ease = "ease-out (fast start)"
            elif release <= 0.15 * dur:
                ease = "ease-in (hard stop)"
            else:
                ease = "asymmetric"
            moves.append({"start": a, "end": b, "frames": dur, "seconds": dur / fps, "peak_speed": peak,
                          "attack_frames": attack, "release_frames": release, "plateau_frames": plateau,
                          "peak_pos": pk / max(1, dur - 1), "ease": ease})
        i = j
    return moves


def analyze_shot(frames: dict, a: int, b: int, fps: float) -> dict:
    """frames: dict of per-frame arrays (already index-aligned). Shot covers [a, b)."""
    dx, dy = frames["dx"][a + 1:b], frames["dy"][a + 1:b]  # first frame's motion belongs to the cut
    dl, dr = frames["dlogs"][a + 1:b], frames["drot"][a + 1:b]
    n = b - a
    res = {"start": a, "end": b, "frames": n, "seconds": n / fps}
    if len(dx) < 3:
        res.update({"camera": "too-short", "moves": []})
        return res
    # camera path: content displacement integrated (fractions of frame width)
    px, py, pz = np.cumsum(dx), np.cumsum(dy), np.cumsum(dl)
    win = int(max(5, round(fps * 0.4)))
    vx, vy, vz = (_smooth(p, win, 1, 1 / fps) for p in (px, py, pz))
    speed_s = np.sqrt(vx ** 2 + vy ** 2) + np.abs(vz)  # width/s + log-zoom/s
    raw_speed = np.sqrt(dx ** 2 + dy ** 2) * fps + np.abs(dl) * fps
    jitter = float(np.std(raw_speed - np.interp(np.arange(len(raw_speed)), np.arange(len(speed_s)), speed_s)))
    jx = _smooth(px, max(win, 9), 3, 1 / fps)
    jy = _smooth(py, max(win, 9), 3, 1 / fps)
    jz = _smooth(pz, max(win, 9), 3, 1 / fps)
    jerk = np.sqrt(jx ** 2 + jy ** 2 + jz ** 2)
    total_zoom = math.exp(float(pz[-1]))
    tx, ty, trot = float(px[-1]), float(py[-1]), float(np.sum(dr))
    kinds = []
    if total_zoom > 1.02:
        kinds.append(f"push-in x{total_zoom:.3f}")
    elif total_zoom < 0.98:
        kinds.append(f"pull-out x{total_zoom:.3f}")
    if abs(tx) > 0.04:
        kinds.append("pan-" + ("left" if tx > 0 else "right") + f" {abs(tx):.2f}w")  # content right => camera left
    if abs(ty) > 0.04:
        kinds.append("tilt-" + ("up" if ty > 0 else "down") + f" {abs(ty):.2f}w")
    if abs(trot) > 1.5:
        kinds.append(f"roll {trot:+.1f}deg")
    if jitter > 0.02:
        kinds.append("handheld/shake")
    if not kinds:
        kinds.append("locked/still" if float(np.median(speed_s)) < SPEED_BANDS["creep"] else "subtle drift")
    moves = find_moves(speed_s, fps)
    res.update({
        "camera": ", ".join(kinds),
        "total_zoom": total_zoom, "total_pan_x": tx, "total_pan_y": ty, "total_roll_deg": trot,
        "speed_median": float(np.median(speed_s)), "speed_p90": float(np.percentile(speed_s, 90)),
        "jerk_rms": float(np.sqrt(np.mean(jerk ** 2))), "jitter": jitter,
        "activity_median": float(np.median(frames["activity"][a + 1:b])),
        "moves": moves, **_bands(speed_s),
        "_speed_series": speed_s,  # stripped before JSON
    })
    return res


def summarize_camera(shots: list[dict], fps: float) -> dict:
    sp = np.concatenate([s["_speed_series"] for s in shots if "_speed_series" in s] or [np.zeros(1)])
    moves = [m for s in shots for m in s.get("moves", [])]
    glide = [m["frames"] for m in moves]
    jr = [s["jerk_rms"] for s in shots if "jerk_rms" in s and s["frames"] > fps]
    eases: dict[str, int] = {}
    for m in moves:
        eases[m["ease"]] = eases.get(m["ease"], 0) + 1
    zooms = [s.get("total_zoom", 1.0) for s in shots if s["frames"] > fps]
    return {
        **_bands(sp),
        "speed_median": float(np.median(sp)), "speed_p90": float(np.percentile(sp, 90)),
        "moves_per_minute": len(moves) / max(1e-6, len(sp) / fps / 60),
        "glide_frames_median": float(np.median(glide)) if glide else 0.0,
        "glide_frames_p25": float(np.percentile(glide, 25)) if glide else 0.0,
        "glide_frames_p75": float(np.percentile(glide, 75)) if glide else 0.0,
        "attack_frames_median": float(np.median([m["attack_frames"] for m in moves])) if moves else 0.0,
        "release_frames_median": float(np.median([m["release_frames"] for m in moves])) if moves else 0.0,
        "ease_histogram": eases,
        "jerk_rms_median": float(np.median(jr)) if jr else 0.0,
        "push_in_shot_frac": float(np.mean([z > 1.02 for z in zooms])) if zooms else 0.0,
        "pull_out_shot_frac": float(np.mean([z < 0.98 for z in zooms])) if zooms else 0.0,
    }


def summarize_editing(shots: list[dict], cuts: list[int], flashes: list[int], n_frames: int, fps: float) -> dict:
    lens = np.array([s["seconds"] for s in shots]) if shots else np.zeros(1)
    dur = n_frames / fps
    return {
        "shots": len(shots), "hard_cuts": len(cuts), "flash_frames": len(flashes),
        "cuts_per_minute": len(cuts) / max(1e-6, dur / 60),
        "asl_seconds": float(lens.mean()), "shot_len_median": float(np.median(lens)),
        "shot_len_p10": float(np.percentile(lens, 10)), "shot_len_p90": float(np.percentile(lens, 90)),
        "longest_shot": float(lens.max()), "first_cut_seconds": cuts[0] / fps if cuts else dur,
        "cut_times": [round(c / fps, 3) for c in cuts],
    }
