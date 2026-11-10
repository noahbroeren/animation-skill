"""Transition classification: what happens at every scene change (and the soft ones the cut detector misses).

Types: hard_cut, match_cut, dissolve, dip_black, dip_white, flash, wipe, whip_pan, zoom_through, other.

Method (all heuristics, calibrated on synthetic transitions; see tests/test_analysis_ext.py):
1. Pass 1 streams the video at 160 px wide and records per-frame series: frame difference d1,
   mean luma, contrast, gradient energy (x / y), sharpness, and a sliding "blend fit": with
   A = frame t-K and B = frame t+K, how well frame t is explained by (1-a)A + aB (least squares).
2. Candidates = analyzer cuts + own spikes + sustained elevated-difference runs + blend-fit runs
   + dark / bright excursions. Pass 2 keeps only the frames around candidates.
3. Each candidate grows into a span [s, e] of "changing" frames (uniform black/white holds are
   bridged). A = frame s-1 (last clean frame before), B = frame e (first clean frame after); the
   frames in between are classified by: luma excursion (dip / flash), alpha-ramp fit (dissolve),
   spatially coherent A|B partition that moves (wipe), camera speed + directional blur from
   frames.npz (whip pan), accumulated log-zoom (zoom-through) and A/B structural similarity
   (match cut). Soft candidates that fit none of these are dropped (camera moves, fast action).
"""
from __future__ import annotations

import math

import cv2
import numpy as np
from scipy.ndimage import percentile_filter, uniform_filter

from .extutil import fmt, load_fp, load_frames, resolve, save
from .mediaio import iter_frames, probe

TYPES = ["hard_cut", "match_cut", "dissolve", "dip_black", "dip_white", "flash", "wipe", "whip_pan",
         "zoom_through", "other"]
WIDTH = 160


def _gray(rgb: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0


def _blend_fit(A: np.ndarray, B: np.ndarray, F: np.ndarray) -> tuple[float, float, float]:
    """F ~ A + a (B - A). Returns (alpha, relative residual, mean|B-A|)."""
    D = B - A
    dab = float(np.abs(D).mean())
    if dab < 1e-4:
        return 0.0, 9.0, dab
    a = float(((F - A) * D).sum() / ((D * D).sum() + 1e-9))
    res = float(np.abs(F - A - a * D).mean() / dab)
    return a, res, dab


def _ssim(a: np.ndarray, b: np.ndarray) -> float:
    a = cv2.GaussianBlur(cv2.resize(a, (48, int(48 * a.shape[0] / a.shape[1]))), (3, 3), 0)
    b = cv2.GaussianBlur(cv2.resize(b, (48, int(48 * b.shape[0] / b.shape[1]))), (3, 3), 0)
    C1, C2 = 0.01 ** 2, 0.03 ** 2
    mu_a, mu_b = cv2.blur(a, (7, 7)), cv2.blur(b, (7, 7))
    saa = cv2.blur(a * a, (7, 7)) - mu_a ** 2
    sbb = cv2.blur(b * b, (7, 7)) - mu_b ** 2
    sab = cv2.blur(a * b, (7, 7)) - mu_a * mu_b
    m = ((2 * mu_a * mu_b + C1) * (2 * sab + C2)) / ((mu_a ** 2 + mu_b ** 2 + C1) * (saa + sbb + C2))
    return float(m.mean())


def _motion_explains(A: np.ndarray, B: np.ndarray) -> float:
    """Ratio diff(B, shift(A)) / diff(B, A) after phase-correlation alignment (<0.5 => camera move)."""
    h, w = A.shape
    win = cv2.createHanningWindow((w, h), cv2.CV_32F)
    (sx, sy), _ = cv2.phaseCorrelate(A.copy(), B.copy(), win)  # copies: OpenCV may window in place
    if abs(sx) > w / 4 or abs(sy) > h / 4:
        return 1.0
    M = np.float32([[1, 0, sx], [0, 1, sy]])
    As = cv2.warpAffine(A, M, (w, h), borderMode=cv2.BORDER_REFLECT)
    m = max(4, int(abs(sx)) + 2), max(4, int(abs(sy)) + 2)
    sl = (slice(m[1], h - m[1]), slice(m[0], w - m[0]))
    d0 = float(np.abs(B - A)[sl].mean()) + 1e-6
    return float(np.abs(B - As)[sl].mean()) / d0


def _edge_sim(a: np.ndarray, b: np.ndarray) -> float:
    """Correlation of gradient-magnitude maps (layout / silhouette similarity, colour-blind)."""
    def g(x):
        x = cv2.GaussianBlur(cv2.resize(x, (64, int(64 * x.shape[0] / x.shape[1]))), (3, 3), 0)
        m = np.hypot(cv2.Sobel(x, cv2.CV_32F, 1, 0), cv2.Sobel(x, cv2.CV_32F, 0, 1))
        m = cv2.GaussianBlur(m, (5, 5), 0)
        return (m - m.mean()) / (m.std() + 1e-6)
    return float((g(a) * g(b)).mean())


def scan(video: str, fps: float, K: int) -> dict:
    """Pass 1: per-frame series at 160 px."""
    d1, luma, std, ex, ey, sharp = [], [], [], [], [], []
    bl_a, bl_r, bl_d, bl_m = [], [], [], []
    ring: list[np.ndarray] = []
    prev = None
    for rgb in iter_frames(video, WIDTH):
        g = _gray(rgb)
        d1.append(0.0 if prev is None else float(np.abs(g - prev).mean()))
        luma.append(float(g.mean()))
        std.append(float(g.std()))
        gx, gy = cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1)
        ex.append(float(np.abs(gx).mean()))
        ey.append(float(np.abs(gy).mean()))
        sharp.append(float(cv2.Laplacian(g, cv2.CV_32F).var()))
        ring.append(g)
        if len(ring) > 2 * K + 1:
            ring.pop(0)
        if len(ring) == 2 * K + 1:
            a, r, d = _blend_fit(ring[0], ring[-1], ring[K])
            bl_a.append(a)
            bl_r.append(r)
            bl_d.append(d)
            # only where a blend is plausible: is it just a camera move? (expensive -> conditional)
            bl_m.append(_motion_explains(ring[0], ring[-1]) if (d > 0.06 and r < 0.35) else 1.0)
        prev = g
    n = len(d1)
    pad = lambda v, fill: np.concatenate([np.full(K, fill), np.asarray(v, np.float64), np.full(max(0, n - K - len(v)), fill)])[:n]
    return {"n": n, "d1": np.asarray(d1), "luma": np.asarray(luma), "std": np.asarray(std),
            "ex": np.asarray(ex), "ey": np.asarray(ey), "sharp": np.asarray(sharp),
            "blend_alpha": pad(bl_a, 0.0), "blend_resid": pad(bl_r, 9.0), "blend_dab": pad(bl_d, 0.0),
            "blend_motion": pad(bl_m, 1.0)}


def _runs(mask: np.ndarray, min_len: int = 1, max_gap: int = 0) -> list[tuple[int, int]]:
    out, i, n = [], 0, len(mask)
    while i < n:
        if not mask[i]:
            i += 1
            continue
        j = i
        while True:
            while j + 1 < n and mask[j + 1]:
                j += 1
            k = j + 1
            while k < n and k - j - 1 < max_gap and not mask[k]:
                k += 1
            if max_gap and k < n and mask[k] and k - j - 1 <= max_gap:
                j = k
                continue
            break
        if j - i + 1 >= min_len:
            out.append((i, j))
        i = j + 1
    return out


def candidates(S: dict, fps: float, cut_frames: list[int]) -> tuple[list[dict], np.ndarray]:
    n, d1, luma = S["n"], S["d1"], S["luma"]
    if n > 1:
        d1[0] = d1[1]
    win = max(5, int(3 * fps) | 1)
    base = np.maximum(percentile_filter(d1, 20, size=win, mode="nearest"), 0.002)
    S["base"] = base
    ev = []
    for c in cut_frames:
        if 0 < c < n:
            ev.append({"lo": c, "hi": c, "src": "cut_detector"})
    spike = (d1 > np.maximum(6 * base, 0.05))
    for c in np.where(spike)[0]:
        ev.append({"lo": int(c), "hi": int(c), "src": "spike"})
    el = d1 > np.maximum(2.5 * base, base + 0.006)
    for a, b in _runs(el, min_len=3, max_gap=1):
        if b - a + 1 <= 4 * fps:
            ev.append({"lo": a, "hi": b, "src": "soft_scan"})
    bl = (S["blend_dab"] > 0.06) & (S["blend_resid"] < 0.35) & (S["blend_alpha"] > 0.15) & (S["blend_alpha"] < 0.85) \
        & (S["blend_motion"] > 0.5)
    S["bl"] = bl
    for a, b in _runs(bl, min_len=2, max_gap=1):
        ev.append({"lo": a, "hi": b, "src": "soft_scan"})
    med = np.asarray(percentile_filter(luma, 50, size=max(5, int(fps) | 1), mode="nearest"))
    dark = (luma < 0.07) & (np.convolve(luma, np.ones(3) / 3, "same") < 0.09)
    for a, b in _runs(dark, min_len=1, max_gap=2):
        ev.append({"lo": a, "hi": b, "src": "soft_scan"})
    bright = (luma - med > 0.18) | (luma > 0.92)
    for a, b in _runs(bright, min_len=1, max_gap=1):
        ev.append({"lo": a, "hi": b, "src": "soft_scan"})
    # merge overlapping / near events
    ev.sort(key=lambda e: e["lo"])
    merged: list[dict] = []
    gap = max(2, int(0.25 * fps))
    for e in ev:
        if merged and e["lo"] <= merged[-1]["hi"] + gap:
            m = merged[-1]
            m["hi"] = max(m["hi"], e["hi"])
            m["srcs"].add(e["src"])
        else:
            merged.append({"lo": e["lo"], "hi": e["hi"], "srcs": {e["src"]}})
    return merged, el


def collect(video: str, wanted: set[int]) -> dict[int, np.ndarray]:
    frames = {}
    if not wanted:
        return frames
    last = max(wanted)
    for i, rgb in enumerate(iter_frames(video, WIDTH)):
        if i in wanted:
            frames[i] = _gray(rgb)
        if i >= last:
            break
    return frames


def _span(seed: int, lo: int, hi: int, inside: np.ndarray, n: int, lim: int) -> tuple[int, int]:
    s = seed
    while s - 1 > 0 and (inside[s - 1] or (s - 2 > 0 and inside[s - 2] and s - 2 >= lo - 1)) and seed - s < lim:
        s -= 1
    e = seed
    while e + 1 < n and (inside[e + 1] or (e + 2 < n and inside[e + 2] and e + 2 <= hi + 1)) and e - seed < lim:
        e += 1
    return max(1, min(s, lo)), max(e, hi)


def _mono(v) -> float:
    v = np.asarray(v, np.float64)
    if len(v) >= 3 and np.std(v) > 1e-6:
        return float(np.corrcoef(np.arange(len(v)), v)[0, 1])
    return 1.0 if len(v) == 2 and v[-1] > v[0] else 0.0


def _camera(npz: dict | None, s: int, e: int, skip: int | None, fps: float) -> tuple[float, float]:
    """(peak camera speed in widths/s, accumulated |log zoom|) around [s, e] from frames.npz."""
    if npz is None or "dx" not in npz:
        return 0.0, 0.0
    m = len(npz["dx"])
    w0, w1 = max(0, s - 4), min(m, e + 5)
    idx = [j for j in range(w0, w1) if j != skip]
    if not idx:
        return 0.0, 0.0
    sp = np.hypot(npz["dx"][idx], npz["dy"][idx])
    return float(np.max(sp)) * fps, float(np.abs(npz["dlogs"][idx]).sum())


def classify(ev: dict, S: dict, F: dict[int, np.ndarray], el: np.ndarray, fps: float, npz: dict | None) -> dict | None:
    n, d1, luma, std = S["n"], S["d1"], S["luma"], S["std"]
    lo, hi = ev["lo"], ev["hi"]
    seed = lo + int(np.argmax(d1[lo:hi + 1])) if hi >= lo else lo
    uniform = std < 0.035
    inside = el | uniform | np.concatenate([[False], uniform[:-1]])
    inside[seed] = True
    lim = int(2.5 * fps)
    nb = max(d1[max(0, seed - 1)], d1[min(n - 1, seed + 1)])
    isolated = d1[seed] > 0.04 and d1[seed] > 2.5 * nb and not uniform[seed] and not uniform[max(0, seed - 1)]
    if isolated:                                   # one-frame change: a cut, whatever moves around it
        s, e = seed, seed
    else:
        s, e = _span(seed, lo, hi, inside, n, lim)
        lm = luma[s:e]
        dip = len(lm) and (lm.min() < 0.07 or lm.max() > 0.9)
        # long spans: re-anchor on the strongest blend-fit run inside (dissolve hidden in a camera move)
        bl = S.get("bl")
        if bl is not None and e - s > 0.6 * fps and not dip:
            runs = _runs(bl[s:e + 1], min_len=2, max_gap=1)
            if runs:
                a, b = min(runs, key=lambda r: S["blend_resid"][s + r[0]: s + r[1] + 1].min())
                K = S["K"]
                s2, e2 = s + a - K + 1, s + b + K
                while s2 < e2 and not el[s2]:
                    s2 += 1
                while e2 > s2 and not el[e2]:
                    e2 -= 1
                if e2 - s2 >= 2:
                    s, e = max(1, s2), e2
    a_i, b_i = s - 1, min(n - 1, e)
    if a_i not in F or b_i not in F:
        return None
    A, B = F[a_i], F[b_i]
    mids = [i for i in range(s, e) if i in F]
    n_int = e - s
    lumA, lumB = float(luma[a_i]), float(luma[b_i])
    det = {"n_intermediate": n_int, "luma_before": round(lumA, 3), "luma_after": round(lumB, 3)}
    cam_speed, zoom_acc = _camera(npz, s, e, seed if isolated else None, fps)
    det["camera_speed_w_per_s"] = round(cam_speed, 3)
    det["zoom_log_acc"] = round(zoom_acc, 3)
    src = "cut_detector" if "cut_detector" in ev["srcs"] else "soft_scan"
    out = {"start_frame": int(s), "end_frame": int(e), "frames": int(n_int), "t": round(s / fps, 3),
           "duration_s": round(n_int / fps, 3), "source": src}

    def T(typ, conf):
        return out | {"type": typ, "confidence": round(float(min(1.0, max(0.0, conf))), 2), "details": det}

    if n_int == 0:
        ss, es = _ssim(A, B), _edge_sim(A, B)
        det.update(ssim_ab=round(ss, 3), edge_sim_ab=round(es, 3), jump=round(float(d1[seed]), 3))
        if cam_speed > 1.5:
            return T("whip_pan", cam_speed / 3.0)        # cut hidden inside a fast pan
        if zoom_acc > 0.35:
            return T("zoom_through", zoom_acc / 0.6)
        if ss > 0.55 and es > 0.5:
            return T("match_cut", (ss - 0.45) / 0.3)
        return T("hard_cut", (d1[seed] - 3 * S["base"][seed]) / 0.15 + 0.3)

    # --- luma excursions: flash, dip to black / white
    lum_mid = np.array([luma[i] for i in range(s, e)])
    mn, mx = float(lum_mid.min()), float(lum_mid.max())
    if mx > max(lumA, lumB) + 0.2 and n_int <= max(4, int(0.12 * fps)):
        return T("flash", (mx - max(lumA, lumB)) / 0.4)
    if mn < 0.07 and mn < min(lumA, lumB) - 0.06:
        return T("dip_black", (min(lumA, lumB) - mn) / 0.2)
    if mx > 0.9 and mx > max(lumA, lumB) + 0.06:
        return T("dip_white", (mx - max(lumA, lumB)) / 0.2)

    dab = float(np.abs(B - A).mean())
    det["dab"] = round(dab, 3)
    strong_dissolve = weak_dissolve = wipe = None
    if mids and n_int >= 2 and dab > 0.03:
        alphas, resids, ps, cohs, pfit, prof = [], [], [], [], [], []
        D = cv2.GaussianBlur(np.abs(B - A), (5, 5), 0)
        diffmask = D > 0.06
        Ab, Bb = cv2.GaussianBlur(A, (5, 5), 0), cv2.GaussianBlur(B, (5, 5), 0)
        for i in mids:
            a, r, _ = _blend_fit(A, B, F[i])
            alphas.append(a)
            resids.append(r)
            Fi = cv2.GaussianBlur(F[i], (5, 5), 0)
            dA, dB = np.abs(Fi - Ab), np.abs(Fi - Bb)
            mB = (dB < dA).astype(np.float32)
            if diffmask.sum() > 50:
                ps.append(float(mB[diffmask].mean()))
                cohs.append(float(np.abs(2 * uniform_filter(mB, size=9)[diffmask] - 1).mean()))
                # partition fit: every changed pixel equals A or B (wipe), not neither (camera move)
                pfit.append(float((np.minimum(dA, dB)[diffmask] / D[diffmask]).mean()))
                prof.append(((mB * diffmask).sum(0) / np.maximum(1, diffmask.sum(0)),
                             (mB * diffmask).sum(1) / np.maximum(1, diffmask.sum(1))))
            else:
                ps.append(0.0)
                cohs.append(0.0)
                pfit.append(9.0)
                prof.append((None, None))
        alphas, resids, ps, cohs, pfit = map(np.asarray, (alphas, resids, ps, cohs, pfit))
        mot = _motion_explains(A, B)
        det.update(alpha=[round(float(x), 2) for x in alphas], resid_median=round(float(np.median(resids)), 3),
                   b_fraction=[round(float(x), 2) for x in ps], motion_explained_ratio=round(mot, 3))
        ma = _mono(alphas)
        ramp = ma > 0.85 and alphas.min() < 0.45 and alphas.max() > 0.55 and mot > 0.5
        rm = float(np.median(resids))
        if ramp and rm < 0.2:
            strong_dissolve = 0.5 * (1 - rm / 0.3) + 0.5 * ma
        elif ramp and rm < 0.3:
            weak_dissolve = 0.5 * (1 - rm / 0.3) + 0.5 * ma
        partial = (ps > 0.1) & (ps < 0.9)
        if partial.sum() >= 2:
            pf, co = float(np.median(pfit[partial])), float(cohs[partial].mean())
            det.update(partition_fit=round(pf, 3), coherence=round(co, 3))
            if co > 0.65 and pf < 0.2 and _mono(ps) > 0.8 and np.median(resids[partial]) > 0.2:
                k = int(np.argmin(np.abs(ps - 0.5)))
                colp, rowp = prof[k]
                direction = "?"
                if colp is not None:
                    if np.abs(2 * colp - 1).mean() >= np.abs(2 * rowp - 1).mean():
                        direction = "left-to-right" if colp[: len(colp) // 3].mean() > colp[-len(colp) // 3:].mean() else "right-to-left"
                    else:
                        direction = "top-to-bottom" if rowp[: len(rowp) // 3].mean() > rowp[-len(rowp) // 3:].mean() else "bottom-to-top"
                det["direction"] = direction
                wipe = co * (1 - pf)
    if strong_dissolve is not None:
        return T("dissolve", strong_dissolve)
    if wipe is not None:
        return T("wipe", wipe)

    # --- camera-driven transitions (content replaced by fast camera motion)
    sh = S["sharp"]
    blur_drop = float(min(sh[i] for i in range(s, e))) / (min(sh[a_i], sh[b_i]) + 1e-9)
    an = lambda i: math.log((S["ey"][i] + 1e-6) / (S["ex"][i] + 1e-6))
    aniso = max(abs(an(i) - 0.5 * (an(a_i) + an(b_i))) for i in range(s, e))
    det.update(blur_ratio=round(blur_drop, 3), blur_anisotropy=round(aniso, 3))
    new_content = dab > 0.08 and _ssim(A, B) < 0.5
    if new_content:
        whip = max(cam_speed / 1.5, (1 - blur_drop) / 0.65 * min(1.0, aniso / 0.35))
        zoom = zoom_acc / 0.35
        if max(whip, zoom) >= 1.0:
            return T("whip_pan", whip / 2) if whip >= zoom else T("zoom_through", zoom / 2)
    if weak_dissolve is not None:
        return T("dissolve", weak_dissolve)
    if "cut_detector" in ev["srcs"]:
        return T("other", 0.3)
    return None


def run(target: str, video: str | None = None, out_name: str = "transitions") -> dict:
    vid, adir = resolve(target, video)
    pr = probe(vid)
    fps = pr.fps
    fp = load_fp(adir)
    npz = load_frames(adir)
    K = max(3, int(round(0.2 * fps)))
    S = scan(vid, fps, K)
    S["K"] = K
    n = S["n"]
    cut_frames = [int(round(t * fps)) for t in (fp.get("editing") or {}).get("cut_times", [])]
    evs, el = candidates(S, fps, cut_frames)
    P = int(round(0.6 * fps))
    wanted: set[int] = set()
    for e in evs:
        wanted.update(range(max(0, e["lo"] - P - int(2.5 * fps)), min(n, e["hi"] + P + int(2.5 * fps))))
    F = collect(vid, wanted)
    res: list[dict] = []
    for e in evs:
        r = classify(e, S, F, el, fps, npz)
        if r is None:
            continue
        if res and r["start_frame"] <= res[-1]["end_frame"]:
            # overlapping spans: keep the more specific / more confident one
            if r["type"] == res[-1]["type"] or r["confidence"] <= res[-1]["confidence"]:
                continue
            res.pop()
        res.append(r)
    minutes = n / fps / 60.0
    counts = {t: sum(1 for r in res if r["type"] == t) for t in TYPES}
    soft = [r for r in res if r["type"] not in ("hard_cut", "match_cut")]
    missed = [r for r in res if r["source"] == "soft_scan" and not any(abs(r["start_frame"] - c) <= 3 or r["start_frame"] <= c <= r["end_frame"] for c in cut_frames)]
    summary = {"available": True, "total": len(res), "counts": counts,
               "per_minute": {t: round(c / minutes, 2) for t, c in counts.items() if c} if minutes else {},
               "dissolves_per_minute": round(counts["dissolve"] / minutes, 2) if minutes else 0.0,
               "soft_per_minute": round(len(soft) / minutes, 2) if minutes else 0.0,
               "soft_fraction": round(len(soft) / max(1, len(res)), 3),
               "missed_by_cut_detector": len(missed),
               "median_soft_frames": float(np.median([r["frames"] for r in soft])) if soft else None}
    data = {"schema": "vfa.transitions/1", "available": True, "video": vid, "fps": fps, "frames": n,
            "method": "heuristic: blend-fit / luma excursion / A|B partition / camera speed (see module doc)",
            "summary": summary, "transitions": res}
    save(adir, out_name, data, md_section(data))
    return data


def md_section(d: dict) -> str:
    s = d["summary"]
    L = ["## Transitions", "",
         f"- {s['total']} scene changes: " + ", ".join(f"{k} {v}" for k, v in s["counts"].items() if v),
         f"- Per minute: {s['per_minute']}; soft (non-cut) share {s['soft_fraction']:.0%}; "
         f"missed by the cut detector: {s['missed_by_cut_detector']}",
         f"- Median soft-transition length: {fmt(s['median_soft_frames'], '{:.0f}')} frames", "",
         "| t | type | frames | conf | notes |", "|---|---|---|---|---|"]
    for r in d["transitions"][:200]:
        det = r.get("details", {})
        note = det.get("direction") or (f"ssim {det['ssim_ab']}" if "ssim_ab" in det else "")
        L.append(f"| {r['t']:.2f}s | {r['type']} | {r['frames']} | {r['confidence']} | {note} |")
    L += ["", "_Heuristic classifier; check the contact sheets for anything typed `other` or low confidence._"]
    return "\n".join(L)
