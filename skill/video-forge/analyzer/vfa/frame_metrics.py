"""Per-frame measurements: color/grade, texture (ink, grain, DOF), camera motion, cut evidence.

Design notes
- Camera motion uses two estimators:
  * LK feature tracking + RANSAC similarity (pan/tilt, zoom, roll). Robust to
    moving foreground characters because characters become RANSAC outliers.
  * Fourier-Mellin phase correlation (translation + log-polar scale/rotation)
    as fallback for flat, feature-poor frames (2D vector art, skies).
  The reference methodology (phase correlation only, stride 1) missed slow
  push-ins; we additionally integrate the path and evaluate motion at multiple
  speed thresholds, so sub-pixel creeps are still detected.
- Everything is computed on a downscaled stream (default 512 px wide) in one
  pass; full-resolution checks (sharpness, native-resolution estimate) are done
  separately on sampled stills.
"""
from __future__ import annotations

import math

import cv2
import numpy as np

# ---------------------------------------------------------------- color/grade

_LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def _percentiles_u8(gray: np.ndarray, ps=(1, 5, 50, 95, 99)) -> list[float]:
    hist = np.bincount(gray.ravel(), minlength=256).astype(np.float64)
    cdf = np.cumsum(hist) / hist.sum()
    return [float(np.searchsorted(cdf, p / 100.0)) / 255.0 for p in ps]


def color_metrics(rgb: np.ndarray, gray: np.ndarray) -> dict:
    f = rgb.astype(np.float32) / 255.0
    y = f @ _LUMA
    p1, p5, p50, p95, p99 = _percentiles_u8(gray)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    sat = hsv[..., 1].astype(np.float32) / 255.0
    R, G, B = f[..., 0], f[..., 1], f[..., 2]
    rg = R - G
    yb = 0.5 * (R + G) - B
    colorfulness = math.sqrt(rg.std() ** 2 + yb.std() ** 2) + 0.3 * math.sqrt(rg.mean() ** 2 + yb.mean() ** 2)
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    L = lab[..., 0]
    a = lab[..., 1] - 128.0
    b = lab[..., 2] - 128.0
    lo, hi = np.percentile(L[::2, ::2], (20, 80))
    sh = L <= lo
    hl = L >= hi
    mid = ~(sh | hl)

    def tint(mask):
        if mask.sum() < 16:
            return 0.0, 0.0, 0.0
        am, bm = float(a[mask].mean()), float(b[mask].mean())
        return am, bm, float(math.degrees(math.atan2(bm, am)) % 360)

    sa, sb, sh_h = tint(sh)
    ha, hb, hl_h = tint(hl)
    ma, mb, _ = tint(mid)
    return {
        "luma_mean": float(y.mean()), "luma_std": float(y.std()),
        "luma_p1": p1, "luma_p5": p5, "luma_p50": p50, "luma_p95": p95, "luma_p99": p99,
        "clip_black": float((gray <= 3).mean()), "clip_white": float((gray >= 252).mean()),
        "sat_mean": float(sat.mean()), "sat_p90": float(np.percentile(sat[::2, ::2], 90)),
        "colorfulness": float(colorfulness),
        "warmth": float((R - B).mean()),  # >0 warm, <0 cool
        "shadow_a": sa, "shadow_b": sb, "shadow_hue": sh_h, "shadow_chroma": math.hypot(sa, sb),
        "high_a": ha, "high_b": hb, "high_hue": hl_h, "high_chroma": math.hypot(ha, hb),
        "mid_a": ma, "mid_b": mb,
    }


# ------------------------------------------------------------------- texture

_NOISE_K = np.array([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], np.float32)
_K5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))


def texture_metrics(gray: np.ndarray) -> dict:
    h, w = gray.shape
    edges = cv2.Canny(gray, 60, 160)
    edge_mask = edges > 0
    # ink = thin dark lines: black-hat response on dark pixels
    bh = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, _K5)
    ink = (bh > 38) & (gray < 110)
    ink_d = cv2.dilate(ink.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    ink_on_edges = float(ink_d[edge_mask].mean()) if edge_mask.any() else 0.0
    # Immerkaer fast noise sigma (grain) in 0..255 units
    conv = cv2.filter2D(gray.astype(np.float32), -1, _NOISE_K)
    sigma = math.sqrt(math.pi / 2.0) * np.abs(conv[1:-1, 1:-1]).sum() / (6.0 * (w - 2) * (h - 2))
    # depth of field proxy: sharpness of centre vs border ring
    lap = np.abs(cv2.Laplacian(gray, cv2.CV_32F, ksize=3))
    cy0, cy1, cx0, cx1 = int(h * .3), int(h * .7), int(w * .3), int(w * .7)
    centre = float(lap[cy0:cy1, cx0:cx1].mean())
    ring = lap.copy()
    ring[cy0:cy1, cx0:cx1] = np.nan
    border = float(np.nanmean(ring))
    return {
        "edge_density": float(edge_mask.mean()),
        "ink_density": float(ink.mean()),
        "ink_on_edges": ink_on_edges,
        "grain_sigma": float(sigma),
        "sharp_centre": centre, "sharp_border": border,
        "dof_ratio": float(centre / (border + 1e-6)),
    }


# ----------------------------------------------------------------- cut cues

def hsv_hist(rgb: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    hist = cv2.calcHist([hsv], [0, 1, 2], None, [16, 4, 4], [0, 180, 0, 256, 0, 256])
    cv2.normalize(hist, hist, 1.0, 0.0, cv2.NORM_L1)
    return hist


# -------------------------------------------------------------- camera motion

def _similarity_from_affine(M: np.ndarray, cx: float, cy: float, w: int):
    a, b = float(M[0, 0]), float(M[1, 0])
    scale = math.hypot(a, b)
    rot = math.degrees(math.atan2(b, a))
    # displacement of the image centre, in fractions of frame width
    nx = M[0, 0] * cx + M[0, 1] * cy + M[0, 2]
    ny = M[1, 0] * cx + M[1, 1] * cy + M[1, 2]
    return (nx - cx) / w, (ny - cy) / w, math.log(max(scale, 1e-6)), rot


class MotionEstimator:
    """Estimates the global (camera) transform from frame t-1 to frame t.

    Returns dict(dx, dy, dlogs, drot, inliers, method, residual, activity):
      dx, dy   image content shift in fractions of frame width (content moving
               right => +dx; camera panning left)
      dlogs    log scale change (+ => content grows => push-in / zoom-in)
      drot     roll in degrees
      activity motion-compensated residual energy => character/micro animation
    """

    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.cx, self.cy = w / 2.0, h / 2.0
        self.prev = None
        self.prev_pts = None
        side = 256
        self.fm_size = side
        self.win = cv2.createHanningWindow((side, side), cv2.CV_32F)

    def _features(self, gray):
        return cv2.goodFeaturesToTrack(gray, maxCorners=500, qualityLevel=0.005, minDistance=7, blockSize=7)

    def _fm(self, g0: np.ndarray, g1: np.ndarray):
        s = self.fm_size
        a = cv2.resize(g0, (s, s), interpolation=cv2.INTER_AREA).astype(np.float32)
        b = cv2.resize(g1, (s, s), interpolation=cv2.INTER_AREA).astype(np.float32)
        A = np.log1p(np.abs(np.fft.fftshift(np.fft.fft2(a * self.win)))).astype(np.float32)
        B = np.log1p(np.abs(np.fft.fftshift(np.fft.fft2(b * self.win)))).astype(np.float32)
        max_r = s / 2.0
        flags = cv2.WARP_POLAR_LOG | cv2.INTER_LINEAR | cv2.WARP_FILL_OUTLIERS
        la = cv2.warpPolar(A, (s, s), (s / 2, s / 2), max_r, flags)
        lb = cv2.warpPolar(B, (s, s), (s / 2, s / 2), max_r, flags)
        # ignore the lowest radii (DC dominated) and use a window
        la[:, : s // 8] = 0
        lb[:, : s // 8] = 0
        (sx, sy), _ = cv2.phaseCorrelate(la, lb, self.win)
        m = s / math.log(max_r)
        dlogs = -sx / m  # magnified content => spectrum contracts
        rot = -sy * 360.0 / s
        if rot > 90:
            rot -= 180
        if rot < -90:
            rot += 180
        (tx, ty), resp = cv2.phaseCorrelate(a, b, self.win)
        return tx * (self.w / s) / self.w, ty * (self.h / s) / self.w, dlogs, rot, resp

    def update(self, gray: np.ndarray) -> dict:
        out = {"dx": 0.0, "dy": 0.0, "dlogs": 0.0, "drot": 0.0, "inliers": 0.0,
               "method": "none", "residual": 0.0, "activity": 0.0, "fg_motion": 0.0}
        if self.prev is None:
            self.prev = gray
            self.prev_pts = self._features(gray)
            return out
        M = None
        p0 = self.prev_pts
        if p0 is not None and len(p0) >= 25:
            p1, st, _ = cv2.calcOpticalFlowPyrLK(self.prev, gray, p0, None, winSize=(21, 21), maxLevel=3,
                                                 criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
            good = st.ravel() == 1
            if good.sum() >= 20:
                a0, a1 = p0[good].reshape(-1, 2), p1[good].reshape(-1, 2)
                M, inl = cv2.estimateAffinePartial2D(a0, a1, method=cv2.RANSAC, ransacReprojThreshold=1.0,
                                                     maxIters=2000, confidence=0.995)
                if M is not None:
                    inl = inl.ravel().astype(bool)
                    ratio = float(inl.mean())
                    if ratio >= 0.35 and inl.sum() >= 15:
                        dx, dy, dl, dr = _similarity_from_affine(M, self.cx, self.cy, self.w)
                        proj = (a0 @ M[:, :2].T) + M[:, 2]
                        err = np.linalg.norm(proj - a1, axis=1)
                        out.update(dx=dx, dy=dy, dlogs=dl, drot=dr, inliers=ratio, method="lk",
                                   residual=float(np.median(err[inl])))
                        if (~inl).any():
                            out["fg_motion"] = float(np.median(err[~inl]) / self.w) * (~inl).mean()
                    else:
                        M = None
        if M is None:
            tx, ty, dl, dr, resp = self._fm(self.prev, gray)
            if resp > 0.05:
                out.update(dx=tx, dy=ty, dlogs=dl, drot=dr, inliers=float(resp), method="fm")
                c, s_ = math.cos(math.radians(dr)) * math.exp(dl), math.sin(math.radians(dr)) * math.exp(dl)
                M = np.array([[c, -s_, 0], [s_, c, 0]], np.float64)
                # translate so the centre maps to centre + shift
                M[0, 2] = self.cx - (c * self.cx - s_ * self.cy) + tx * self.w
                M[1, 2] = self.cy - (s_ * self.cx + c * self.cy) + ty * self.w
        # motion-compensated residual => subject/micro animation energy
        if M is not None:
            warped = cv2.warpAffine(self.prev, M.astype(np.float32), (self.w, self.h), flags=cv2.INTER_LINEAR,
                                    borderMode=cv2.BORDER_REPLICATE)
            m = 8
            diff = np.abs(warped[m:-m, m:-m].astype(np.int16) - gray[m:-m, m:-m].astype(np.int16))
        else:
            diff = np.abs(self.prev.astype(np.int16) - gray.astype(np.int16))
        out["activity"] = float(diff.mean() / 255.0)
        self.prev = gray
        pts = self._features(gray)
        self.prev_pts = pts
        return out

    def reset(self, gray: np.ndarray):
        self.prev = gray
        self.prev_pts = self._features(gray)
