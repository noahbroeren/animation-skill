"""Human/Claude-readable visual artifacts: contact sheets, timeline chart, palette swatches, comparison sheets."""
from __future__ import annotations

import os

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


def font(size: int = 12):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def tc(frame: int, fps: float) -> str:
    s = frame / fps
    return f"{int(s // 60):02d}:{s % 60:05.2f}"


class SheetWriter:
    """Accumulates thumbnails and writes labelled grids (default: 2 s of frames per sheet = 60 @ 30 fps)."""

    def __init__(self, out_dir: str, fps: float, per_sheet: int, cols: int = 10, thumb_h: int = 120,
                 stride_sheets: int = 1, max_sheets: int = 400):
        self.out_dir, self.fps, self.per, self.cols, self.th = out_dir, fps, per_sheet, cols, thumb_h
        self.stride, self.max = max(1, stride_sheets), max_sheets
        os.makedirs(out_dir, exist_ok=True)
        self.buf: list[tuple[int, np.ndarray]] = []
        self.sheet_idx = 0
        self.written: list[str] = []
        self.f = font(11)
        self.cut_set: set[int] = set()

    def wants(self, frame_idx: int) -> bool:
        block = frame_idx // self.per
        return block % self.stride == 0 and len(self.written) < self.max

    def add(self, frame_idx: int, rgb: np.ndarray):
        if not self.wants(frame_idx):
            if self.buf:
                self.flush()
            return
        h, w = rgb.shape[:2]
        tw = int(round(w * self.th / h))
        self.buf.append((frame_idx, cv2.resize(rgb, (tw, self.th), interpolation=cv2.INTER_AREA)))
        if len(self.buf) >= self.per:
            self.flush()

    def flush(self):
        if not self.buf:
            return
        tw = self.buf[0][1].shape[1]
        rows = (len(self.buf) + self.cols - 1) // self.cols
        lab = 14
        sheet = Image.new("RGB", (self.cols * tw, rows * (self.th + lab) + 22), (18, 18, 20))
        d = ImageDraw.Draw(sheet)
        f0, f1 = self.buf[0][0], self.buf[-1][0]
        d.text((6, 4), f"frames {f0}-{f1}  |  {tc(f0, self.fps)} - {tc(f1, self.fps)}  |  {self.fps:g} fps, every frame",
               fill=(230, 230, 230), font=font(13))
        for k, (fi, th) in enumerate(self.buf):
            x, y = (k % self.cols) * tw, 22 + (k // self.cols) * (self.th + lab)
            sheet.paste(Image.fromarray(th), (x, y))
            col = (255, 80, 80) if fi in self.cut_set else (200, 200, 200)
            d.text((x + 3, y + self.th), f"{fi}", fill=col, font=self.f)
            if fi in self.cut_set:
                d.rectangle([x, y, x + tw - 1, y + self.th - 1], outline=(255, 60, 60), width=2)
        p = os.path.join(self.out_dir, f"sheet_{self.sheet_idx:04d}_f{f0:06d}.jpg")
        sheet.save(p, quality=85)
        self.written.append(p)
        self.sheet_idx += 1
        self.buf = []


def timeline_chart(path: str, series: dict[str, np.ndarray], fps: float, cuts: list[int],
                   audio_env: np.ndarray | None = None, onsets: list[float] | None = None,
                   words: list[dict] | None = None, width: int = 2400):
    """Stacked strip chart. One row per series, cut lines in red, audio + onsets + speech at the bottom."""
    rows = list(series.items())
    extra = (1 if audio_env is not None else 0) + (1 if words else 0)
    rh, pad, left = 70, 6, 150
    H = (len(rows) + extra) * (rh + pad) + 40
    img = Image.new("RGB", (width, H), (14, 14, 16))
    d = ImageDraw.Draw(img)
    n = max(len(v) for _, v in rows) if rows else 1
    W = width - left - 10
    fx = lambda i: left + int(i / max(1, n - 1) * W)
    f = font(12)
    dur = n / fps
    for s in range(0, int(dur) + 1, max(1, int(dur // 30) or 1)):
        x = left + int(s / max(1e-6, dur) * W)
        d.line([x, 20, x, H], fill=(40, 40, 46))
        d.text((x + 2, 4), f"{s}s", fill=(140, 140, 150), font=f)
    y = 24
    for name, v in rows:
        v = np.asarray(v, np.float64)
        lo, hi = np.nanpercentile(v, 1), np.nanpercentile(v, 99)
        if hi - lo < 1e-9:
            hi = lo + 1e-9
        d.rectangle([left, y, left + W, y + rh], outline=(50, 50, 58))
        d.text((6, y + rh // 2 - 14), name, fill=(220, 220, 220), font=f)
        d.text((6, y + rh // 2 + 2), f"{lo:.3g}..{hi:.3g}", fill=(120, 120, 130), font=font(10))
        step = max(1, len(v) // W)
        pts = [(fx(i), y + rh - int(np.clip((v[i] - lo) / (hi - lo), 0, 1) * rh)) for i in range(0, len(v), step)]
        if len(pts) > 1:
            d.line(pts, fill=(90, 200, 255), width=1)
        for c in cuts:
            d.line([fx(c), y, fx(c), y + rh], fill=(255, 70, 70))
        y += rh + pad
    if audio_env is not None and len(audio_env):
        d.rectangle([left, y, left + W, y + rh], outline=(50, 50, 58))
        d.text((6, y + rh // 2 - 7), "audio dB", fill=(220, 220, 220), font=f)
        m = len(audio_env)
        pts = [(left + int(i / max(1, m - 1) * W), y + rh - int(np.clip((audio_env[i] + 60) / 60, 0, 1) * rh))
               for i in range(0, m, max(1, m // W))]
        d.line(pts, fill=(120, 255, 140), width=1)
        for t in (onsets or []):
            x = left + int(t / max(1e-6, dur) * W)
            d.line([x, y + rh - 8, x, y + rh], fill=(255, 220, 90))
        y += rh + pad
    if words:
        d.rectangle([left, y, left + W, y + rh], outline=(50, 50, 58))
        d.text((6, y + rh // 2 - 7), "speech", fill=(220, 220, 220), font=f)
        for w in words:
            x0 = left + int(w["start"] / max(1e-6, dur) * W)
            x1 = max(x0 + 1, left + int(w["end"] / max(1e-6, dur) * W))
            d.rectangle([x0, y + 20, x1, y + rh - 20], fill=(200, 140, 255))
    img.save(path)
    return path


def palette(rgb: np.ndarray, k: int = 6) -> list[dict]:
    small = cv2.resize(rgb, (160, int(160 * rgb.shape[0] / rgb.shape[1])), interpolation=cv2.INTER_AREA)
    lab = cv2.cvtColor(small, cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
    cv2.setRNGSeed(7)
    _, labels, centers = cv2.kmeans(lab, k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.ravel(), minlength=k) / len(labels)
    rgbc = cv2.cvtColor(centers.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_LAB2RGB).reshape(-1, 3)
    out = [{"hex": "#%02x%02x%02x" % tuple(int(c) for c in col), "weight": round(float(w), 4)}
           for col, w in zip(rgbc, counts)]
    return sorted(out, key=lambda p: -p["weight"])


def palette_strip(path: str, shot_palettes: list[list[dict]], h: int = 40, w: int = 900):
    img = Image.new("RGB", (w, h * max(1, len(shot_palettes))), (0, 0, 0))
    d = ImageDraw.Draw(img)
    for r, pal in enumerate(shot_palettes):
        x = 0
        for p in pal:
            ww = int(p["weight"] * w)
            c = tuple(int(p["hex"][i:i + 2], 16) for i in (1, 3, 5))
            d.rectangle([x, r * h, x + ww, r * h + h - 1], fill=c)
            x += ww
    img.save(path)


def side_by_side(path: str, pairs: list[tuple[str, str]], labels=("REFERENCE", "OURS"), width: int = 640):
    """Stack reference/ours stills in rows for visual gap analysis (judge agents look at this)."""
    ims = []
    for a, b in pairs:
        A, B = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
        hA = int(A.height * width / A.width)
        A, B = A.resize((width, hA)), B.resize((width, int(B.height * width / B.width)))
        row = Image.new("RGB", (width * 2 + 10, max(A.height, B.height) + 20), (20, 20, 20))
        row.paste(A, (0, 20))
        row.paste(B, (width + 10, 20))
        dd = ImageDraw.Draw(row)
        dd.text((4, 3), labels[0], fill=(255, 210, 90), font=font(14))
        dd.text((width + 14, 3), labels[1], fill=(90, 210, 255), font=font(14))
        ims.append(row)
    H = sum(i.height for i in ims)
    out = Image.new("RGB", (ims[0].width, H), (20, 20, 20))
    y = 0
    for i in ims:
        out.paste(i, (0, y))
        y += i.height
    out.save(path, quality=90)
    return path
