"""Thumbnail checker: measurable "will this read in the feed?" checks for YouTube thumbnails.

    py thumbcheck.py IMG... --out report.json [--meta meta.json] [--sheet thumbs_sheet.jpg] [--kind long|short]

Standalone (no package imports; usable as `vfa.thumbcheck` too). Needs numpy + opencv; OCR needs
`rapidocr-onnxruntime` (without it the OCR checks are reported as unavailable and score 0).

`--meta` is a JSON list (or {"images": [...]}) of {"path", "variant", "kind", "text", "note"} written by
engine/tools/thumbs.mjs: `text` is the intended wording, so readability is measured against what SHOULD be read.

Checks, their rule and where the rule comes from
------------------------------------------------
- specs: long-form 16:9, min width 640, JPG/PNG, < 2 MB for mobile upload (desktop allows 50 MB); Shorts 9:16,
  min height 640, custom Shorts thumbnails are set in YouTube Studio on desktop.
  Source: YouTube Help "Add video thumbnails" support.google.com/youtube/answer/72431 (checked 2026-11-10; it now
  recommends 3840x2160 / 2160x3840; 1280x720 remains the widely used upload size).
- readability at feed size: the image is downscaled (INTER_AREA) to the size it is shown at -- 168x94 (compact
  list: sidebar "up next", mobile search rows) and 360x202 (home grid) for long-form, ~100x178 for Shorts shelves --
  then upscaled x4 and x2 for the OCR detector, and RapidOCR reads it. A word "survives" if OCR recovers it (fuzzy >= 0.75).
  Sizes are the YouTube web client's long-standing thumbnail slot sizes at 1x (ytd-thumbnail compact = 168x94,
  grid ~ 360x202); 1x is the strictest case (phones show the same CSS size at 2-3x pixels).
- word count <= 4 and text height: heuristic creator guidance (short, huge text; the thumbnail complements the
  title rather than repeating it) -- YouTube Creator Academy "Make great thumbnails" lesson and YouTube Help
  thumbnail best practices. Text height = OCR line box height / image height, smallest intended line.
- text contrast: WCAG 2.x relative luminance contrast ratio (L1 + 0.05) / (L2 + 0.05) between the two Otsu classes
  inside each text box (fill vs outline/background). 3:1 = WCAG AA large text, 4.5:1 = AA, 7:1 = AAA
  (w3.org/TR/WCAG22 SC 1.4.3 / 1.4.6; relative luminance definition in WCAG "Understanding 1.4.3").
- focal clarity: saliency = mean of the spectral residual (Hou & Zhang, CVPR 2007, "Saliency Detection: A Spectral
  Residual Approach") and frequency-tuned colour contrast (Achanta et al., CVPR 2009). Text boxes are masked out;
  concentration = saliency mass of the biggest salient blob / mass of all salient blobs (1 = one clear focal point).
  Edge density = Canny edge pixels at 320 px wide (clutter proxy).
- subject size: area of the largest salient blob (text excluded), % of the frame.
- timestamp zone (long-form only): YouTube draws the duration badge over the bottom-right corner; the zone checked is
  the right 20 % x bottom 15 %. No text (intended or not) may touch it and its saliency share should not exceed ~2x its area.
- colour pop vs UI: mean CIE76 colour distance of the image (and of its 4 % border strip) to YouTube's light
  (#ffffff) and dark (#0f0f0f) page backgrounds + mean HSV saturation. A thumbnail that is close to the page colour
  melts into the feed.
- diversity: similarity to the other images of the same kind (0.5 x correlation of 32x32 grey + 0.5 x HS histogram
  intersection). A test set should offer genuinely different pictures.

Score (0-100) = weighted sum of the per-check scores (each 0..1):
    readability 25, text size 10, word count 8, contrast 12, focal clarity 15, subject size 10,
    timestamp zone 5 (long only; Shorts renormalise the rest to 100), colour pop 10, diversity 5.
Every check that loses points emits a plain-language fix.
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sys

import cv2
import numpy as np

WEIGHTS = {"readability": 25, "text_size": 10, "word_count": 8, "contrast": 12, "focal": 15, "subject": 10,
           "timestamp": 5, "pop": 10, "diversity": 5}
FEED = {"long": [(168, 94), (360, 202)], "short": [(100, 178)]}
TS_ZONE = (0.80, 0.85)  # x >= 80 % of width, y >= 85 % of height
UI = {"light": (255, 255, 255), "dark": (15, 15, 15)}
MAX_BYTES = 2 * 1024 * 1024

_OCR = None


def _engine():
    global _OCR
    if _OCR is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            _OCR = RapidOCR()
        except Exception as e:  # noqa: BLE001
            try:
                from rapidocr import RapidOCR  # type: ignore
                _OCR = RapidOCR()
            except Exception:
                _OCR = False
                print(f"[thumbcheck] OCR unavailable: {e}", file=sys.stderr)
    return _OCR or None


def ocr(rgb: np.ndarray, min_score: float = 0.5) -> list[dict]:
    eng = _engine()
    if eng is None:
        return []
    try:
        res = eng(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    except Exception:
        return []
    out = []
    items = res[0] if isinstance(res, tuple) else None
    if isinstance(res, tuple):
        triples = items or []
    else:
        triples = zip(getattr(res, "boxes", None) or [], getattr(res, "txts", None) or [], getattr(res, "scores", None) or [])
    for box, text, score in triples:
        if float(score) >= min_score and str(text).strip():
            b = np.asarray(box, np.float32)
            out.append({"text": str(text).strip(), "score": float(score), "x0": float(b[:, 0].min()), "y0": float(b[:, 1].min()),
                        "x1": float(b[:, 0].max()), "y1": float(b[:, 1].max())})
    return out


def ocr_multi(rgb: np.ndarray, min_score: float = 0.5) -> list[dict]:
    """OCR at several sizes (the detector misses very large glyphs at full size); boxes in full-size coords.
    Boxes found at a smaller scale are added where no larger-scale box overlaps them."""
    boxes = ocr(rgb, min_score)
    h, w = rgb.shape[:2]
    for tw in sorted({w // 2, 640, 480, 360}, reverse=True):
        if tw >= w:
            continue
        k = w / tw
        sm = cv2.resize(rgb, (tw, max(1, round(h / k))), interpolation=cv2.INTER_AREA)
        for b in ocr(sm, min_score):
            b = dict(b, x0=b["x0"] * k, y0=b["y0"] * k, x1=b["x1"] * k, y1=b["y1"] * k)
            if not any(min(o["x1"], b["x1"]) > max(o["x0"], b["x0"]) and min(o["y1"], b["y1"]) > max(o["y0"], b["y0"]) for o in boxes):
                boxes.append(b)
    return boxes


def norm_words(t: str) -> list[str]:
    return [w for w in re.sub(r"[^a-z0-9.]+", " ", t.lower().replace("|", " ")).split() if re.search(r"[a-z0-9]", w)]


def _clean(w: str) -> str:
    return re.sub(r"[^a-z0-9]", "", w.lower())


def word_found(word: str, tokens: list[str], joined: str) -> bool:
    w = _clean(word)
    if not w:
        return True
    if len(w) >= 4 and w in joined:  # OCR glues words ("PRICESX2"); short words must match a token (else "it" in "fits")
        return True
    return any(difflib.SequenceMatcher(None, w, _clean(t)).ratio() >= 0.75 for t in tokens)


def survival(rgb: np.ndarray, words: list[str], size: tuple[int, int]) -> tuple[list[str], str]:
    """Downscale to the feed size, upscale x4 and x2 for the detector, OCR; which intended words come back."""
    small = cv2.resize(rgb, size, interpolation=cv2.INTER_AREA)
    texts = []
    for k in (4, 2):  # the detector has a preferred text size: try two magnifications, keep what either reads
        big = cv2.resize(small, (size[0] * k, size[1] * k), interpolation=cv2.INTER_CUBIC)
        texts.append(" ".join(b["text"] for b in ocr(big, 0.4)))
    text = " | ".join(t for t in texts if t)
    toks = norm_words(text)
    joined = "".join(_clean(t) for t in toks)
    return [w for w in words if word_found(w, toks, joined)], text


# ------------------------------------------------------------------ colour / luminance
def rel_lum(rgb) -> np.ndarray:
    """WCAG relative luminance of sRGB values in 0..255."""
    c = np.asarray(rgb, np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def contrast_ratio(l1: float, l2: float) -> float:
    a, b = max(l1, l2), min(l1, l2)
    return (a + 0.05) / (b + 0.05)


def box_contrast(rgb: np.ndarray, b: dict) -> dict:
    """Otsu split inside the text box -> WCAG ratio between the two classes; plus text-vs-surround ring."""
    h, w = rgb.shape[:2]
    x0, y0, x1, y1 = int(max(0, b["x0"])), int(max(0, b["y0"])), int(min(w, b["x1"])), int(min(h, b["y1"]))
    crop = rgb[y0:y1, x0:x1]
    if crop.size < 30:
        return {"ratio": 1.0, "surround": 1.0}
    L = rel_lum(crop)
    g = np.clip(L ** (1 / 2.2) * 255, 0, 255).astype(np.uint8)
    t, _ = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    hi, lo = L[g > t], L[g <= t]
    if hi.size < 5 or lo.size < 5:
        return {"ratio": 1.0, "surround": 1.0}
    lh, ll = float(np.median(hi)), float(np.median(lo))
    pad = int(0.25 * (y1 - y0)) + 2
    X0, Y0, X1, Y1 = max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)
    ring = np.ones((Y1 - Y0, X1 - X0), bool)
    ring[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = False
    lr = float(np.median(rel_lum(rgb[Y0:Y1, X0:X1])[ring])) if ring.any() else ll
    # the text "fill" is the class that differs most from the surround
    fill = lh if abs(lh - lr) >= abs(ll - lr) else ll
    return {"ratio": contrast_ratio(lh, ll), "surround": contrast_ratio(fill, lr)}


def to_lab(rgb: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    lab[..., 0] *= 100 / 255.0
    lab[..., 1:] -= 128
    return lab


def colour_pop(rgb: np.ndarray) -> dict:
    sm = cv2.resize(rgb, (160, max(1, round(160 * rgb.shape[0] / rgb.shape[1]))), interpolation=cv2.INTER_AREA)
    lab = to_lab(sm)
    hsv = cv2.cvtColor(sm, cv2.COLOR_RGB2HSV).astype(np.float32)
    bw = max(2, round(0.04 * sm.shape[1]))
    border = np.concatenate([lab[:bw].reshape(-1, 3), lab[-bw:].reshape(-1, 3), lab[:, :bw].reshape(-1, 3), lab[:, -bw:].reshape(-1, 3)])
    out = {"saturation": round(float(hsv[..., 1].mean() / 255), 3)}
    for k, c in UI.items():
        ui = to_lab(np.array([[c]], np.uint8))[0, 0]
        out[f"dE_{k}"] = round(float(np.linalg.norm(lab - ui, axis=-1).mean()), 1)
        out[f"border_dE_{k}"] = round(float(np.linalg.norm(border - ui, axis=-1).mean()), 1)
    return out


# ------------------------------------------------------------------ saliency
def saliency(rgb: np.ndarray, width: int = 128) -> np.ndarray:
    """Mean of spectral residual (Hou & Zhang 2007) and frequency-tuned colour contrast (Achanta 2009), 0..1."""
    h = max(1, round(width * rgb.shape[0] / rgb.shape[1]))
    sm = cv2.resize(rgb, (width, h), interpolation=cv2.INTER_AREA)
    g = cv2.cvtColor(sm, cv2.COLOR_RGB2GRAY).astype(np.float64)
    F = np.fft.fft2(g)
    logA = np.log(np.abs(F) + 1e-9)
    sr = logA - cv2.blur(logA, (3, 3))
    s1 = np.abs(np.fft.ifft2(np.exp(sr + 1j * np.angle(F)))) ** 2
    s1 = cv2.GaussianBlur(s1, (0, 0), width / 40)
    lab = to_lab(cv2.GaussianBlur(sm, (5, 5), 0)).astype(np.float64)
    s2 = np.linalg.norm(lab - lab.reshape(-1, 3).mean(0), axis=-1)
    n = lambda a: (a - a.min()) / (a.max() - a.min() + 1e-9)  # noqa: E731
    return n(0.5 * n(s1) + 0.5 * n(s2))


def focal(rgb: np.ndarray, text_boxes: list[dict]) -> dict:
    sal = saliency(rgb)
    sh, sw = sal.shape
    H, W = rgb.shape[:2]
    m = sal.copy()
    for b in text_boxes:  # text is judged separately: the subject is what is left
        m[int(b["y0"] / H * sh):int(np.ceil(b["y1"] / H * sh)), int(b["x0"] / W * sw):int(np.ceil(b["x1"] / W * sw))] = 0
    thr = max(0.25, float(m.mean() + m.std()))
    mask = (m >= thr).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    masses = [float(m[lab == i].sum()) for i in range(1, n)]
    areas = [int(stats[i, cv2.CC_STAT_AREA]) for i in range(1, n)]
    if masses:
        k = int(np.argmax(masses))
        conc = masses[k] / (sum(masses) + 1e-9)
        big = 100 * areas[k] / (sh * sw)
        blobs = sum(1 for x in masses if x > 0.15 * masses[k])
        ys, xs = np.nonzero(lab == k + 1)
        centre = [round(float(xs.mean() / sw), 3), round(float(ys.mean() / sh), 3)]
    else:
        conc, big, blobs, centre = 0.0, 0.0, 0, [0.5, 0.5]
    gray = cv2.cvtColor(cv2.resize(rgb, (320, max(1, round(320 * H / W))), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2GRAY)
    edges = float((cv2.Canny(gray, 80, 160) > 0).mean())
    return {"concentration": round(conc, 3), "subject_pct": round(big, 1), "salient_blobs": blobs, "subject_centre": centre,
            "edge_density": round(edges, 4), "_sal": sal}


def timestamp_zone(shape, text_boxes: list[dict], sal: np.ndarray) -> dict:
    H, W = shape[:2]
    zx, zy = TS_ZONE[0] * W, TS_ZONE[1] * H
    hit = []
    for b in text_boxes:
        ix = max(0.0, min(b["x1"], W) - max(b["x0"], zx))
        iy = max(0.0, min(b["y1"], H) - max(b["y0"], zy))
        if ix * iy > 0.02 * (b["x1"] - b["x0"]) * (b["y1"] - b["y0"]):
            hit.append(b["text"])
    sh, sw = sal.shape
    share = float(sal[int(TS_ZONE[1] * sh):, int(TS_ZONE[0] * sw):].sum() / (sal.sum() + 1e-9))
    area = (1 - TS_ZONE[0]) * (1 - TS_ZONE[1])
    return {"text_in_zone": hit, "saliency_share": round(share, 3), "area_share": round(area, 3)}


def signature(rgb: np.ndarray):
    g = cv2.cvtColor(cv2.resize(rgb, (32, 32), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2GRAY).astype(np.float64).ravel()
    hsv = cv2.cvtColor(cv2.resize(rgb, (96, 96), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [16, 8], [0, 180, 0, 256]).ravel()
    return (g - g.mean()) / (g.std() + 1e-9), hist / (hist.sum() + 1e-9)


def similarity(a, b) -> float:
    corr = float(np.mean(a[0] * b[0]))
    inter = float(np.minimum(a[1], b[1]).sum())
    return 0.5 * max(0.0, corr) + 0.5 * inter


# ------------------------------------------------------------------ scoring
def _c(x: float) -> float:
    return float(min(1.0, max(0.0, x)))


def check_image(path: str, kind: str | None = None, text: str | None = None) -> dict:
    bgr = cv2.imread(path, cv2.IMREAD_COLOR)
    if bgr is None:
        raise SystemExit(f"cannot read {path}")
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    H, W = rgb.shape[:2]
    label = kind or ("short" if H > W else "long")
    kind = "long" if label == "hires" else label  # hires = a bigger long-form master: same rules
    r: dict = {"path": path, "kind": label, "size": [W, H], "bytes": os.path.getsize(path)}
    # specs
    spec = []
    if kind == "long":
        if abs(W / H - 16 / 9) > 0.02:
            spec.append("not 16:9")
        if W < 640:
            spec.append("narrower than 640 px")
    else:
        if abs(W / H - 9 / 16) > 0.02:
            spec.append("not 9:16")
        if H < 640:
            spec.append("shorter than 640 px")
    if r["bytes"] > MAX_BYTES:
        spec.append("over 2 MB (too big for mobile upload; desktop allows 50 MB)")
    if not path.lower().endswith((".jpg", ".jpeg", ".png")):
        spec.append("not JPG/PNG")
    r["spec_issues"] = spec
    # text
    full = ocr_multi(rgb)
    r["ocr_full"] = " ".join(b["text"] for b in full)
    words = norm_words(text) if text else norm_words(r["ocr_full"])  # no intended text: judge whatever text is there
    r["intended"] = text
    r["words"] = words
    r["word_count"] = len(words)
    toks_of = lambda b: norm_words(b["text"])  # noqa: E731
    tboxes = [b for b in full if any(word_found(t, words, "".join(_clean(w) for w in words)) for t in toks_of(b))] if words else []
    r["ocr_available"] = _engine() is not None
    r["feed"] = {}
    for size in FEED[kind]:
        got, raw = survival(rgb, words, size) if words else ([], "")
        r["feed"][f"{size[0]}x{size[1]}"] = {"survived": got, "missing": [w for w in words if w not in got], "ocr": raw}
    heights = [100 * (b["y1"] - b["y0"]) / H for b in tboxes]
    r["text_height_pct"] = {"min": round(min(heights), 1), "max": round(max(heights), 1)} if heights else None
    cons = [box_contrast(rgb, b) for b in tboxes]
    r["contrast"] = {"min_ratio": round(min(c["ratio"] for c in cons), 2), "min_surround": round(min(c["surround"] for c in cons), 2)} if cons else None
    fo = focal(rgb, tboxes)
    sal = fo.pop("_sal")
    r["focal"] = fo
    r["timestamp"] = timestamp_zone(rgb.shape, full, sal) if kind == "long" else None  # any text, intended or not
    r["pop"] = colour_pop(rgb)
    r["_sig"] = signature(rgb)
    return r


def score(r: dict) -> dict:
    s, fixes = {}, []
    n = r["word_count"]
    feeds = list(r["feed"].values())
    if n:
        surv = [len(f["survived"]) / n for f in feeds]
        s["readability"] = _c(0.7 * surv[0] + 0.3 * surv[-1]) if len(surv) > 1 else _c(surv[0])
        small = list(r["feed"].keys())[0]
        if r["feed"][small]["missing"]:
            fixes.append(f"At {small} these words do not survive: {', '.join(r['feed'][small]['missing'])}. Make them bigger/bolder or cut words.")
    else:
        s["readability"] = 0.6  # a text-free thumbnail can work; it just cannot be checked
    th = r["text_height_pct"]
    if n and th:
        lo, hi = (3, 8) if r["kind"] == "short" else (6, 16)
        s["text_size"] = _c((th["min"] - lo) / (hi - lo))
        if s["text_size"] < 0.8:
            fixes.append(f"Smallest text line is {th['min']}% of the height; aim for >= {hi}%.")
    else:
        s["text_size"] = 0.0 if n else 0.6
        if n:
            fixes.append("The intended text was not found by OCR at full size: check outline/contrast and font.")
    s["word_count"] = 0.6 if n == 0 else 1.0 if n <= 4 else 0.5 if n == 5 else 0.0
    if n > 4:
        fixes.append(f"{n} words: cut to 3-4; the title carries the rest.")
    c = r["contrast"]
    if c:
        s["contrast"] = _c((c["min_ratio"] - 3.0) / 4.0)
        if c["min_ratio"] < 4.5:
            fixes.append(f"Text contrast {c['min_ratio']}:1 is under WCAG AA 4.5:1: thicker dark outline or a darker scrim.")
    else:
        s["contrast"] = 0.0 if n else 0.6
    fo = r["focal"]
    s["focal"] = _c(0.7 * _c((fo["concentration"] - 0.3) / 0.5) + 0.3 * _c((0.16 - fo["edge_density"]) / 0.10))
    if fo["concentration"] < 0.6:
        fixes.append(f"Attention is split ({fo['salient_blobs']} salient areas, concentration {fo['concentration']}): crop tighter, darken/blur the rest.")
    if fo["edge_density"] > 0.12:
        fixes.append(f"Busy picture (edge density {fo['edge_density']:.3f}): simplify the background or push DOF.")
    s["subject"] = _c((fo["subject_pct"] - 5) / 15)
    if fo["subject_pct"] < 15:
        fixes.append(f"Main subject covers only {fo['subject_pct']}% of the frame: dolly in until it fills ~20-40%.")
    if r["kind"] != "short" and r["timestamp"]:
        ts = r["timestamp"]
        s["timestamp"] = 0.0 if ts["text_in_zone"] else _c(1 - (ts["saliency_share"] / ts["area_share"] - 2) / 2)
        if ts["text_in_zone"]:
            fixes.append(f"Text sits under the duration badge (bottom-right): {', '.join(ts['text_in_zone'])}.")
        elif s["timestamp"] < 0.8:
            fixes.append("Important detail sits in the bottom-right corner where the duration badge goes.")
    p = r["pop"]
    mind = min(p["dE_light"], p["dE_dark"])
    s["pop"] = _c(0.5 * _c((mind - 20) / 30) + 0.5 * _c((p["saturation"] - 0.2) / 0.3))
    if s["pop"] < 0.7:
        which = "light" if p["dE_light"] < p["dE_dark"] else "dark"
        fixes.append(f"Low pop against YouTube {which} mode (dE {mind}, saturation {p['saturation']}): more saturated colours / contrast.")
    s["diversity"] = _c((0.92 - r.get("max_similarity", 0.0)) / 0.3)
    if r.get("max_similarity", 0) > 0.8:
        fixes.append(f"Looks like '{r.get('most_similar')}' (similarity {r['max_similarity']}): change angle, colour or subject.")
    for issue in r["spec_issues"]:
        fixes.append(f"Spec: {issue}.")
    w = dict(WEIGHTS)
    if r["kind"] == "short":
        w.pop("timestamp")
    tot = sum(w.values())
    sc = sum(s[k] * w[k] for k in w) * 100 / tot
    if r["spec_issues"]:
        sc *= 0.85
    return {"score": round(sc, 1), "parts": {k: round(v, 2) for k, v in s.items() if k in w}, "fixes": fixes}


def check_all(items: list[dict]) -> list[dict]:
    res = []
    for it in items:
        r = check_image(it["path"], it.get("kind"), it.get("text"))
        r.update({k: it[k] for k in ("variant", "note") if k in it})
        res.append(r)
    for r in res:  # diversity within each kind
        others = [o for o in res if o is not r and o["kind"] == r["kind"]]
        if others:
            sims = [(similarity(r["_sig"], o["_sig"]), o.get("variant") or os.path.basename(o["path"])) for o in others]
            m = max(sims)
            r["max_similarity"], r["most_similar"] = round(m[0], 3), m[1]
    for r in res:
        r.update(score(r))
        r.pop("_sig", None)
    return res


# ------------------------------------------------------------------ contact sheet
def make_sheet(results: list[dict], out: str):
    """One row per variant: long thumb, feed mock-ups (light + dark, 360x202 and 168x94 with a duration badge),
    Shorts cover + ~100x178 shelf size on light and dark, score + top fixes."""
    from PIL import Image, ImageDraw, ImageFont

    def font(sz, bold=True):
        for f in (["arialbd.ttf", "Arial Bold.ttf", "DejaVuSans-Bold.ttf"] if bold else ["arial.ttf", "DejaVuSans.ttf"]):
            try:
                return ImageFont.truetype(f, sz)
            except OSError:
                continue
        return ImageFont.load_default()

    by: dict[str, dict] = {}
    for r in results:
        by.setdefault(r.get("variant") or os.path.splitext(os.path.basename(r["path"]))[0], {})[r["kind"]] = r
    rows = list(by.items())
    rows.sort(key=lambda kv: -max(x["score"] for x in kv[1].values()))
    RH, LW = 420, 640
    cols = [LW, 600, 600, 236, 250, 420]
    Wt = sum(cols) + 20 * (len(cols) + 1)
    sheet = Image.new("RGB", (Wt, 70 + RH * len(rows)), (40, 40, 46))
    d = ImageDraw.Draw(sheet)
    d.text((20, 18), "thumbnails  |  full size  |  feed on light  |  feed on dark  |  Shorts cover  |  Shorts shelf  |  score", font=font(28), fill=(235, 235, 240))

    def badge(im, dur="0:42"):
        dd = ImageDraw.Draw(im)
        f = font(12 if im.width < 200 else 15)
        tw = dd.textlength(dur, font=f)
        x1, y1 = im.width - 4, im.height - 4
        dd.rounded_rectangle((x1 - tw - 8, y1 - (16 if im.width < 200 else 20), x1, y1), 3, fill=(0, 0, 0))
        dd.text((x1 - tw - 4, y1 - (15 if im.width < 200 else 19)), dur, font=f, fill=(255, 255, 255))
        return im

    def feed_panel(img, bg, fg):
        p = Image.new("RGB", (cols[1], RH - 30), bg)
        dd = ImageDraw.Draw(p)
        g = badge(img.resize((360, 202), Image.LANCZOS))
        p.paste(g, (14, 14))
        dd.ellipse((14, 228, 46, 260), fill=(150, 150, 150))
        dd.rounded_rectangle((56, 230, 340, 244), 4, fill=fg)
        dd.rounded_rectangle((56, 252, 260, 264), 4, fill=fg)
        dd.rounded_rectangle((56, 274, 200, 284), 3, fill=tuple(int(0.5 * a + 0.5 * b) for a, b in zip(fg, bg)))
        c = badge(img.resize((168, 94), Image.LANCZOS))
        p.paste(c, (390, 14))
        for k, wv in enumerate((190, 160, 110)):
            dd.rounded_rectangle((390, 118 + 18 * k, 390 + wv, 128 + 18 * k), 3, fill=fg if k < 2 else tuple(int(0.5 * a + 0.5 * b) for a, b in zip(fg, bg)))
        return p

    for i, (name, ks) in enumerate(rows):
        y = 70 + i * RH
        x = 20
        lg = ks.get("long")
        if lg:
            im = Image.open(lg["path"]).convert("RGB")
            sheet.paste(im.resize((LW, 360), Image.LANCZOS), (x, y))
        d.text((x, y + 366), name, font=font(26), fill=(255, 210, 63))
        x += cols[0] + 20
        if lg:
            sheet.paste(feed_panel(im, (255, 255, 255), (30, 30, 30)), (x, y))
            sheet.paste(feed_panel(im, (15, 15, 15), (235, 235, 235)), (x + cols[1] + 20, y))
        x += cols[1] + cols[2] + 40
        sh = ks.get("short")
        if sh:
            sim = Image.open(sh["path"]).convert("RGB")
            sheet.paste(sim.resize((round((RH - 10) * 9 / 16), RH - 10), Image.LANCZOS), (x, y))
            p = Image.new("RGB", (cols[4], RH - 30), (255, 255, 255))
            p.paste(sim.resize((100, 178), Image.LANCZOS), (12, 12))
            dark = Image.new("RGB", (cols[4] - 124, RH - 30), (15, 15, 15))
            dark.paste(sim.resize((100, 178), Image.LANCZOS), (8, 12))
            p.paste(dark, (124, 0))
            sheet.paste(p, (x + cols[3] + 20, y))
        x += cols[3] + cols[4] + 40
        ty = y
        for kind in ("long", "hires", "short"):
            r = ks.get(kind)
            if not r:
                continue
            d.text((x, ty), f"{kind}: {r['score']:.0f}/100", font=font(30), fill=(255, 255, 255))
            ty += 38
        best = ks.get("long") or ks.get("short")
        if best:
            parts = ", ".join(f"{k} {v:.1f}" for k, v in best["parts"].items())
            for line in _wrap(parts, 46)[:3]:
                d.text((x, ty), line, font=font(16, False), fill=(190, 190, 200))
                ty += 20
            for fx in best["fixes"][:4]:
                for line in _wrap("- " + fx, 46)[:3]:
                    d.text((x, ty), line, font=font(16, False), fill=(255, 170, 150))
                    ty += 20
    sheet.save(out, quality=90)
    return out


def _wrap(s: str, n: int) -> list[str]:
    out, cur = [], ""
    for w in s.split():
        if len(cur) + len(w) + 1 > n and cur:
            out.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        out.append(cur)
    return out


def _jsonable(o):
    if isinstance(o, dict):
        return {k: _jsonable(v) for k, v in o.items() if not k.startswith("_")}
    if isinstance(o, (list, tuple)):
        return [_jsonable(v) for v in o]
    if isinstance(o, (np.floating, np.integer)):
        return o.item()
    return o


def main(argv=None):
    ap = argparse.ArgumentParser(description="YouTube thumbnail checks (feed-size OCR, contrast, focal point, timestamp zone, pop, diversity)")
    ap.add_argument("images", nargs="*")
    ap.add_argument("--out", default="thumbcheck.json")
    ap.add_argument("--meta", help="JSON list of {path, variant, kind, text, note}")
    ap.add_argument("--kind", choices=["long", "short", "hires"], help="force kind for all images (default: from aspect)")
    ap.add_argument("--sheet", help="also write a contact sheet JPG")
    a = ap.parse_args(argv)
    items = []
    if a.meta:
        m = json.load(open(a.meta, encoding="utf-8"))
        items = m["images"] if isinstance(m, dict) else m
    items += [{"path": p, **({"kind": a.kind} if a.kind else {})} for p in a.images]
    if not items:
        ap.error("no images")
    res = check_all(items)
    json.dump(_jsonable({"weights": WEIGHTS, "results": res}), open(a.out, "w", encoding="utf-8"), indent=1)
    for r in sorted(res, key=lambda r: -r["score"]):
        print(f"{r['score']:5.1f}  {r['kind']:5s}  {r.get('variant') or os.path.basename(r['path'])}")
    if a.sheet:
        make_sheet(res, a.sheet)
        print(f"[thumbcheck] sheet -> {a.sheet}")
    print(f"[thumbcheck] report -> {a.out}")


if __name__ == "__main__":
    main()
