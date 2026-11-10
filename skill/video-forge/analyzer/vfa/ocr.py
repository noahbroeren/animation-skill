"""On-screen text and caption analysis (`vfa ocr`).

Engine: RapidOCR (ONNX runtime; `pip install rapidocr-onnxruntime`). Without it the command
reports "unavailable" (no crash).

1. Coarse pass: OCR a frame every `every` seconds (plus 2 frames after each cut) at 720 px wide.
   Boxes are clustered into horizontal bands; the caption track is the centred band whose text
   keeps changing. Text that repeats unchanged is reported as static text (titles, watermarks).
2. Style (on caption boxes of the coarse pass): k-means (k=3, Lab) inside each padded box gives
   background / outline / fill; fill = the cluster deepest inside the glyphs, outline = the
   cluster that rings the fill. Stroke width = 4 x mean distance-transform inside the fill;
   outline width = outline area / fill perimeter. Highlight = a second, distinctly coloured fill
   cluster (the active word). Background box = a uniform ring around the text that stays the
   same colour while the picture changes.
3. Fine pass (frame-accurate page timing): every frame, the caption band is reduced to a
   fill-colour mask signature; a signature change starts a new page; each page is OCR'd once.
   Consecutive pages with identical text are merged (pop-in / highlight steps counted).
4. Sync: pages are aligned to transcript.json words (fuzzy match of the first token):
   offset = page start - word start (positive = caption appears after the word is spoken).

Font classification is a HEURISTIC from stroke weight (stroke / cap height), stroke contrast,
character width ratio and advance uniformity: heavy sans / regular sans / serif / mono /
handwritten, with the closest common families. Treat it as a starting point for a visual check.
"""
from __future__ import annotations

import difflib
import re

import cv2
import numpy as np

from .extutil import fmt, load_fp, load_words, optional, resolve, save, stats, unavailable
from .mediaio import iter_frames, probe

OCR_W = 720


def _engine():
    mod, err = optional("rapidocr_onnxruntime")
    if mod is not None:
        return mod.RapidOCR(), "rapidocr-onnxruntime"
    mod2, err2 = optional("rapidocr")
    if mod2 is not None:
        return mod2.RapidOCR(), "rapidocr"
    return None, err


def _ocr(engine, img_rgb: np.ndarray, min_score: float = 0.5) -> list[dict]:
    bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
    try:
        res = engine(bgr)
    except Exception:
        return []
    items = res[0] if isinstance(res, tuple) else getattr(res, "boxes", None)
    out = []
    if isinstance(res, tuple):
        for box, text, score in items or []:
            if float(score) >= min_score and str(text).strip():
                b = np.asarray(box, np.float32)
                out.append({"box": b, "text": str(text).strip(), "score": float(score)})
    else:  # rapidocr >= 2 result object
        boxes, txts, scores = getattr(res, "boxes", None), getattr(res, "txts", None), getattr(res, "scores", None)
        if boxes is not None:
            for b, t, s in zip(boxes, txts, scores):
                if float(s) >= min_score and str(t).strip():
                    out.append({"box": np.asarray(b, np.float32), "text": str(t).strip(), "score": float(s)})
    for o in out:
        b = o["box"]
        o["x0"], o["y0"] = float(b[:, 0].min()), float(b[:, 1].min())
        o["x1"], o["y1"] = float(b[:, 0].max()), float(b[:, 1].max())
    return out


def _norm(t: str) -> str:
    return re.sub(r"[^a-z0-9']+", " ", t.lower()).strip()


# --------------------------------------------------------------------------- style

def _lab(rgb: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)


def _hex(rgb) -> str:
    r, g, b = (int(round(float(x))) for x in rgb)
    return f"#{r:02x}{g:02x}{b:02x}"


def box_style(frame: np.ndarray, it: dict) -> dict | None:
    """Measure fill / outline / stroke / highlight / box for one OCR text box."""
    H, W = frame.shape[:2]
    h = it["y1"] - it["y0"]
    if h < 8:
        return None
    pad = int(max(3, 0.15 * h))
    x0, y0 = int(max(0, it["x0"] - pad)), int(max(0, it["y0"] - pad))
    x1, y1 = int(min(W, it["x1"] + pad)), int(min(H, it["y1"] + pad))
    crop = frame[y0:y1, x0:x1]
    if crop.size < 300:
        return None
    lab = _lab(crop).reshape(-1, 3)
    K = 3
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5)
    _, lab_lbl, centers = cv2.kmeans(lab, K, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    lbl = lab_lbl.reshape(crop.shape[:2])
    ring = np.concatenate([lbl[:2].ravel(), lbl[-2:].ravel(), lbl[:, :2].ravel(), lbl[:, -2:].ravel()])
    bg = int(np.bincount(ring, minlength=K).argmax())
    fg = (lbl != bg).astype(np.uint8)
    dt_fg = cv2.distanceTransform(fg, cv2.DIST_L2, 3)
    depth = {k: float(dt_fg[lbl == k].mean()) if (lbl == k).any() else 0.0 for k in range(K) if k != bg}
    if not depth:
        return None
    fill = max(depth, key=depth.get)
    others = [k for k in depth if k != fill]
    fill_m = (lbl == fill).astype(np.uint8)
    if fill_m.sum() < 20:
        return None
    rim = cv2.dilate(fill_m, np.ones((5, 5), np.uint8)) - fill_m
    outline = None
    ring_frac = 0.0
    if others:
        o = others[0]
        ring_frac = float((lbl[rim > 0] == o).mean()) if rim.sum() else 0.0
        if ring_frac > 0.45 and (lbl == o).sum() > 0.15 * fill_m.sum():
            outline = o
    rgb = crop.reshape(-1, 3).astype(np.float32)
    col = lambda k: np.median(rgb[(lbl == k).ravel()], axis=0)
    dt_fill = cv2.distanceTransform(fill_m, cv2.DIST_L2, 3)
    stroke = 4.0 * float(dt_fill[fill_m > 0].mean())
    # stroke contrast: widths at ridge pixels (local maxima of the distance transform)
    ridge = (dt_fill >= cv2.dilate(dt_fill, np.ones((3, 3), np.uint8)) - 1e-3) & (fill_m > 0) & (dt_fill > 0.8)
    rw = 2 * dt_fill[ridge]
    contrast = float(np.percentile(rw, 80) / max(0.5, np.percentile(rw, 20))) if rw.size > 10 else None
    prof = fill_m.sum(1).astype(np.float32)
    rows = np.where(prof > 0.02 * fill_m.shape[1])[0]          # fill only (outline excluded)
    ink_h = float(rows.max() - rows.min() + 1) if rows.size else h
    core_h = float((prof > 0.35 * prof.max()).sum()) if prof.max() > 0 else ink_h  # x-height or cap height
    perim = float(cv2.Canny(fill_m * 255, 50, 150).astype(bool).sum())
    outline_w = float((lbl == outline).sum()) / max(1.0, perim) if outline is not None else 0.0
    # highlight: a second distinct colour inside the fill (active word)
    highlight = None
    fill_pix = lab[(lbl == fill).ravel()]
    if len(fill_pix) > 60:
        _, l2, c2 = cv2.kmeans(fill_pix, 2, None, crit, 2, cv2.KMEANS_PP_CENTERS)
        share = np.bincount(l2.ravel(), minlength=2) / len(l2)
        de = float(np.linalg.norm(c2[0] - c2[1]))
        mi = int(share.argmin())
        chroma = float(np.hypot(c2[mi][1] - 128, c2[mi][2] - 128))
        if de > 40 and chroma > 35 and 0.12 < share.min() < 0.6:
            mrgb = np.median(rgb[(lbl == fill).ravel()][l2.ravel() == mi], axis=0)
            highlight = {"hex": _hex(mrgb), "share": round(float(share.min()), 3), "delta_e": round(de, 1)}
    # background-box ring: just outside the padded box
    p2 = int(max(4, 0.5 * h))
    X0, Y0, X1, Y1 = int(max(0, it["x0"] - p2)), int(max(0, it["y0"] - p2)), int(min(W, it["x1"] + p2)), int(min(H, it["y1"] + p2))
    big = frame[Y0:Y1, X0:X1].astype(np.float32)
    ring2 = np.concatenate([big[:3].reshape(-1, 3), big[-3:].reshape(-1, 3), big[:, :3].reshape(-1, 3), big[:, -3:].reshape(-1, 3)])
    return {"fill_rgb": col(fill).tolist(), "outline_rgb": col(outline).tolist() if outline is not None else None,
            "bg_rgb": col(bg).tolist(), "outline_ring_frac": round(ring_frac, 3),
            "stroke_px": stroke, "outline_px": outline_w, "ink_h": ink_h, "core_h": core_h, "box_h": h, "contrast": contrast,
            "highlight": highlight, "ring_mean": ring2.mean(0).tolist(), "ring_std": float(ring2.std(0).mean()),
            "chars": len(re.sub(r"\s", "", it["text"])), "box_w": it["x1"] - it["x0"]}


FONT_SUGGEST = {
    "heavy sans (condensed)": ["Anton", "Bebas Neue", "Oswald Bold", "Impact"],
    "heavy sans": ["Montserrat Black/ExtraBold", "Poppins Black", "Arial Black", "The Bold Font"],
    "regular sans": ["Inter", "Roboto", "Arial", "Open Sans"],
    "light sans": ["Inter Light", "Roboto Light", "Helvetica Neue Light"],
    "serif": ["Georgia", "Merriweather", "Playfair Display", "Times New Roman"],
    "mono": ["JetBrains Mono", "Roboto Mono", "Courier New"],
    "handwritten": ["Permanent Marker", "Caveat", "Comic Neue / Komika"],
}


def classify_font(styles: list[dict], em_per_core: float, ocr_scores: list[float]) -> dict:
    """HEURISTIC font class from stroke weight, stroke contrast, character width and advance uniformity.

    All ratios are in em (font size), estimated from the core height (cap height if the captions are
    uppercase, else x-height): Arial Regular stem ~0.09 em, Arial Bold ~0.15, Arial Black/Montserrat
    Black ~0.2; average advance ~0.5 em (Arial), ~0.6 (Montserrat), ~0.42 (Anton/Bebas, condensed)."""
    em = [s["core_h"] * em_per_core for s in styles]
    w = [s["stroke_px"] / max(1.0, e) for s, e in zip(styles, em)]
    weight = float(np.median(w)) if w else None
    con = [s["contrast"] for s in styles if s.get("contrast")]
    contrast = float(np.median(con)) if con else None
    wr = [s["box_w"] / max(1, s["chars"]) / max(1.0, e) for s, e in zip(styles, em) if s["chars"] >= 2]
    width_ratio = float(np.median(wr)) if wr else None
    adv_cv = float(np.std(wr) / np.mean(wr)) if len(wr) >= 6 else None
    sc = float(np.median(ocr_scores)) if ocr_scores else 1.0
    cls = "regular sans"
    if adv_cv is not None and adv_cv < 0.05 and len(wr) >= 10:
        cls = "mono"
    elif contrast is not None and contrast > 2.0 and (weight or 0) < 0.12:
        cls = "serif"
    elif sc < 0.75 and contrast is not None and contrast > 1.8:
        cls = "handwritten"
    elif weight is not None and weight >= 0.13:
        cls = "heavy sans (condensed)" if (width_ratio or 1) < 0.45 else "heavy sans"
    elif weight is not None and weight < 0.06:
        cls = "light sans"
    return {"class": cls, "suggested_families": FONT_SUGGEST[cls], "weight_em": None if weight is None else round(weight, 3),
            "stroke_contrast": None if contrast is None else round(contrast, 2),
            "char_width_em": None if width_ratio is None else round(width_ratio, 3),
            "advance_cv": None if adv_cv is None else round(adv_cv, 3),
            "method": "HEURISTIC: stroke weight / contrast / width in em; confirm visually"}


# --------------------------------------------------------------------------- tracks

def find_bands(samples: list[dict], H: int) -> list[dict]:
    """Cluster OCR boxes into horizontal bands (by vertical centre)."""
    items = [(s["i"], it) for s in samples for it in s["items"]]
    if not items:
        return []
    items.sort(key=lambda x: (x[1]["y0"] + x[1]["y1"]) / 2)
    bands: list[dict] = []
    for i, it in items:
        cy = (it["y0"] + it["y1"]) / 2
        if bands and abs(cy - bands[-1]["cy"]) < 0.035 * H:
            b = bands[-1]
            b["items"].append((i, it))
            b["cy"] = float(np.median([(x["y0"] + x["y1"]) / 2 for _, x in b["items"]]))
        else:
            bands.append({"cy": cy, "items": [(i, it)]})
    out = []
    n_samples = max(1, len(samples))
    for b in bands:
        texts = [_norm(it["text"]) for _, it in b["items"]]
        frames = sorted(set(i for i, _ in b["items"]))
        cxs = [((it["x0"] + it["x1"]) / 2) for _, it in b["items"]]
        hs = [it["y1"] - it["y0"] for _, it in b["items"]]
        distinct = len(set(texts))
        out.append({"cy": b["cy"], "presence": len(frames) / n_samples, "distinct_ratio": distinct / max(1, len(texts)),
                    "cx_med": float(np.median(cxs)), "h_med": float(np.median(hs)),
                    "y0": float(np.percentile([it["y0"] for _, it in b["items"]], 5)),
                    "y1": float(np.percentile([it["y1"] for _, it in b["items"]], 95)),
                    "texts": texts, "items": b["items"], "frames": frames})
    return out


def align_sync(pages: list[dict], words: list[dict]) -> dict:
    if not words or not pages:
        return {"matched": 0}
    toks = [_norm(w["word"]) for w in words]
    ptr, offs, end_offs = 0, [], []
    for p in pages:
        pt = _norm(p["text"]).split()
        if not pt:
            continue
        best, bj = 0.0, None
        for j in range(ptr, min(len(toks), ptr + 12)):
            r = difflib.SequenceMatcher(None, pt[0], toks[j]).ratio()
            if r > best:
                best, bj = r, j
            if r == 1.0:
                break
        if bj is not None and best >= 0.75:
            offs.append(p["start"] - words[bj]["start"])
            last = min(len(words) - 1, bj + len(pt) - 1)
            end_offs.append(p["end"] - words[last]["end"])
            p["word_start"] = words[bj]["start"]
            ptr = bj + 1
    return {"matched": len(offs), "matched_frac": round(len(offs) / max(1, len(pages)), 3),
            "onset_offset_s": stats(offs, 3), "end_offset_s": stats(end_offs, 3)}


def run(target: str, video: str | None = None, every: float | None = None, out_name: str = "ocr",
        fine: bool = True) -> dict:
    vid, adir = resolve(target, video)
    eng, why = _engine()
    if eng is None:
        d = unavailable("ocr", why, "py -m pip install rapidocr-onnxruntime")
        save(adir, out_name, d, "## On-screen text / captions\n\n- unavailable: " + why)
        return d
    pr = probe(vid)
    fps, dur = pr.fps, pr.duration
    if every is None:
        every = 0.5 if dur <= 180 else (1.0 if dur <= 900 else 2.0)  # the fine pass gives frame timing
    fp = load_fp(adir)
    cuts = [int(round(t * fps)) for t in (fp.get("editing") or {}).get("cut_times", [])]
    step = max(1, int(round(every * fps)))
    want = set(range(0, int(dur * fps) + 1, step)) | {c + 2 for c in cuts}
    samples: list[dict] = []
    keep_frames: dict[int, np.ndarray] = {}
    W = min(OCR_W, pr.width)
    Hh = None
    for i, rgb in enumerate(iter_frames(vid, W)):
        Hh = rgb.shape[0]
        if i in want:
            items = _ocr(eng, rgb)
            samples.append({"i": i, "items": items})
            if items and len(keep_frames) < 400:
                keep_frames[i] = rgb.copy()
    n_frames = i + 1 if samples else 0
    H = Hh or 1
    bands = find_bands(samples, H)
    cap = None
    for b in sorted(bands, key=lambda b: -b["presence"]):
        if b["presence"] >= 0.15 and b["distinct_ratio"] >= 0.2 and abs(b["cx_med"] / W - 0.5) < 0.2:
            cap = b
            break
    static = []
    for b in bands:
        if b is cap:
            continue
        common = max(set(b["texts"]), key=b["texts"].count) if b["texts"] else ""
        if b["presence"] >= 0.3 and b["texts"].count(common) / len(b["texts"]) > 0.6:
            static.append({"text": common, "y_rel": round(b["cy"] / H, 3), "presence": round(b["presence"], 3)})
    other_text = sum(1 for b in bands if b is not cap and b["presence"] < 0.3)

    data = {"schema": "vfa.ocr/1", "available": True, "engine": "rapidocr", "video": vid, "every_s": every,
            "samples": len(samples), "frame_size_ocr": [W, H], "static_text": static, "transient_text_bands": other_text}
    caption: dict = {"present": cap is not None}
    if cap is not None:
        styles, scores, upper, letters = [], [], 0, 0
        for i, it in cap["items"]:
            scores.append(it["score"])
            for ch in it["text"]:
                if ch.isalpha():
                    letters += 1
                    upper += ch.isupper()
            if i in keep_frames and len(styles) < 60:
                st = box_style(keep_frames[i], it)
                if st:
                    styles.append(st)
        upper_ratio = upper / max(1, letters)
        short = min(pr.width, pr.height)
        to_u = (pr.width / W) * 1080.0 / short       # OCR px -> u (1 u = 1 px at 1080 short side)
        ink_h = float(np.median([s["ink_h"] for s in styles])) if styles else cap["h_med"]
        core_h = float(np.median([s["core_h"] for s in styles])) if styles else 0.55 * cap["h_med"]
        em_per_core = 1 / 0.70 if upper_ratio > 0.5 else 1 / 0.53   # cap height ~0.70 em, x-height ~0.53 em
        stroke = float(np.median([s["stroke_px"] for s in styles])) if styles else None
        outl = [s for s in styles if s["outline_rgb"] is not None]
        has_outline = len(outl) >= 0.5 * max(1, len(styles))
        outline_px = float(np.median([s["outline_px"] for s in outl])) if outl else 0.0
        hls = [s["highlight"]["hex"] for s in styles if s.get("highlight")]
        rings = np.array([s["ring_mean"] for s in styles]) if styles else np.zeros((0, 3))
        ring_std_in = float(np.median([s["ring_std"] for s in styles])) if styles else 99.0
        ring_std_across = float(rings.std(0).mean()) if len(rings) > 2 else 99.0
        bg_box = ring_std_in < 8.0 and ring_std_across < 10.0
        # font size estimate: cap height ~0.72 em (uppercase), x-height ~0.52 em; mixed case boxes ~ cap height
        em = core_h * em_per_core
        font = classify_font(styles, em_per_core, scores)
        caption.update({
            "band_y_rel": [round(cap["y0"] / H, 3), round(cap["y1"] / H, 3)], "center_y_rel": round(cap["cy"] / H, 3),
            "presence_in_samples": round(cap["presence"], 3),
            "text_height_rel": round(ink_h / H, 4), "text_height_u": round(ink_h * to_u, 1),
            "core_height_u": round(core_h * to_u, 1), "core_is": "cap height" if upper_ratio > 0.5 else "x-height",
            "font_size_u_est": round(em * to_u, 1),
            "uppercase_ratio": round(upper_ratio, 3),
            "fill_hex": _hex(np.median([s["fill_rgb"] for s in styles], 0)) if styles else None,
            "outline": has_outline,
            "outline_hex": _hex(np.median([s["outline_rgb"] for s in outl], 0)) if outl else None,
            "outline_px_u": round(outline_px * to_u, 2) if outl else 0.0,
            "outline_rel_em": round(outline_px / max(1e-6, em), 3) if outl else 0.0,
            "stroke_px_u": None if stroke is None else round(stroke * to_u, 2),
            "highlight_hex": max(set(hls), key=hls.count) if len(hls) >= max(2, 0.15 * len(styles)) else None,
            "highlight_frac_of_samples": round(len(hls) / max(1, len(styles)), 3),
            "background_box": bool(bg_box), "box_hex": _hex(rings.mean(0)) if bg_box and len(rings) else None,
            "font": font, "styled_samples": len(styles)})
        # ---------------- fine pass: frame-accurate pages
        pages = _fine_pass(vid, eng, W, cap, caption, styles, fps) if fine else []
        if not pages:  # fall back to coarse samples
            pages = _coarse_pages(samples, cap, fps, step)
            caption["timing"] = "coarse (sample-limited)"
        else:
            caption["timing"] = "frame-accurate (fine pass)"
        wpp = [len(p["text"].split()) for p in pages if p["text"]]
        pdur = [p["end"] - p["start"] for p in pages if p["text"]]
        on = sum(pdur)
        caption.update({"pages": len([p for p in pages if p["text"]]), "words_per_page": stats(wpp, 2),
                        "words_per_page_median": float(np.median(wpp)) if wpp else None,
                        "page_seconds": stats(pdur, 3), "on_screen_frac": round(on / max(1e-6, n_frames / fps), 3),
                        "highlight_steps": int(sum(p.get("steps", 0) for p in pages))})
        words = load_words(adir)
        if words:
            sync = align_sync([p for p in pages if p["text"]], words)
            caption["sync"] = sync
            if sync.get("onset_offset_s", {}).get("median") is not None:
                caption["sync_offset_s"] = sync["onset_offset_s"]["median"]
                caption["sync_offset_frames"] = round(sync["onset_offset_s"]["median"] * fps, 1)
        data["pages"] = pages
    data["caption"] = caption
    data["summary"] = _summary(data)
    save(adir, out_name, data, md_section(data))
    return data


def _coarse_pages(samples, cap, fps, step):
    pages = []
    ids = set(cap["frames"])
    for s in samples:
        txt = " ".join(it["text"] for it in sorted(s["items"], key=lambda x: x["x0"])
                       if cap["y0"] - 4 <= (it["y0"] + it["y1"]) / 2 <= cap["y1"] + 4) if s["i"] in ids else ""
        t = s["i"] / fps
        if pages and _norm(pages[-1]["text"]) == _norm(txt):
            pages[-1]["end"] = t + step / fps
        else:
            pages.append({"start": t, "end": t + step / fps, "text": txt})
    return pages


def _fine_pass(vid, eng, W, cap, caption, styles, fps) -> list[dict]:
    """Segment the caption band per frame by a fill-colour mask signature; OCR each segment once."""
    if not styles:
        return []
    fill_lab = _lab(np.uint8([[np.median([s["fill_rgb"] for s in styles], 0)]]))[0, 0]
    pad = int(0.6 * cap["h_med"])
    y0, y1 = int(max(0, cap["y0"] - pad)), int(cap["y1"] + pad)
    border = int(max(16, cap["h_med"]))      # OCR detector needs margin around the text
    segs: list[dict] = []
    prev_sig = None
    cur = None
    thr_area = None
    for i, rgb in enumerate(iter_frames(vid, W)):
        band = rgb[y0:y1]
        lab = _lab(band)
        m = (np.linalg.norm(lab - fill_lab, axis=2) < 22).astype(np.float32)
        sig = cv2.resize(m, (96, 12), interpolation=cv2.INTER_AREA)
        area = float(sig.mean())
        if thr_area is None:
            thr_area = 0.004
        change = prev_sig is None or float(np.abs(sig - prev_sig).sum()) / max(1e-6, max(sig.sum(), prev_sig.sum())) > 0.35
        if change:
            if cur is not None:
                cur["end_f"] = i
                segs.append(cur)
            cur = {"start_f": i, "area": area, "crop": band.copy(), "ocr_at": i + 2}
        elif cur is not None and i == cur["ocr_at"]:
            cur["crop"] = band.copy()
        prev_sig = sig
    if cur is not None:
        cur["end_f"] = i + 1
        segs.append(cur)
    # OCR each segment (>= 2 frames) once
    pages: list[dict] = []
    for sg in segs:
        n = sg["end_f"] - sg["start_f"]
        txt = ""
        if sg["area"] > 0.002 and n >= 2:
            its = _ocr(eng, cv2.copyMakeBorder(sg["crop"], border, border, border, border, cv2.BORDER_REPLICATE))
            txt = " ".join(it["text"] for it in sorted(its, key=lambda x: x["x0"]))
        sg.pop("crop", None)
        if n < 2 and pages:  # transient (animation frame): absorb
            pages[-1]["end"] = sg["end_f"] / fps
            continue
        if pages and _norm(pages[-1]["text"]) == _norm(txt):
            pages[-1]["end"] = sg["end_f"] / fps
            pages[-1]["steps"] = pages[-1].get("steps", 0) + (1 if txt else 0)
        else:
            pages.append({"start": round(sg["start_f"] / fps, 3), "end": round(sg["end_f"] / fps, 3), "text": txt, "steps": 0})
    for p in pages:
        p["end"] = round(p["end"], 3)
    return pages


def _summary(d: dict) -> dict:
    c = d.get("caption") or {}
    s = {"available": True, "captions": c.get("present", False), "static_text": [x["text"] for x in d.get("static_text", [])][:5]}
    if c.get("present"):
        for k in ("words_per_page_median", "text_height_u", "font_size_u_est", "text_height_rel", "uppercase_ratio",
                  "fill_hex", "outline", "outline_hex", "outline_rel_em", "highlight_hex", "background_box",
                  "center_y_rel", "on_screen_frac", "sync_offset_s", "pages"):
            s[k] = c.get(k)
        s["page_seconds_median"] = (c.get("page_seconds") or {}).get("median")
        s["font_class"] = (c.get("font") or {}).get("class")
        s["font_suggest"] = ((c.get("font") or {}).get("suggested_families") or [None])[0]
    return s


def md_section(d: dict) -> str:
    if not d.get("available"):
        return "## On-screen text / captions\n\n- unavailable: " + d.get("reason", "")
    c = d["caption"]
    L = ["## On-screen text / captions", ""]
    if not c.get("present"):
        L.append("- No caption track found (no centred band of changing text).")
    else:
        f = c["font"]
        sy = c.get("sync") or {}
        L += [f"- Caption track at {c['center_y_rel']:.0%} of height (band {c['band_y_rel']}); on screen {c['on_screen_frac']:.0%} of the runtime; timing {c.get('timing')}",
              f"- **{fmt(c.get('words_per_page_median'), '{:.1f}')} words/page** (p10-p90 {c['words_per_page']['p10']}-{c['words_per_page']['p90']}), "
              f"page {fmt((c['page_seconds'] or {}).get('median'), '{:.2f}')} s median, {c['pages']} pages, {c['highlight_steps']} same-text restyles (pop/highlight steps)",
              f"- Size: ink height {c['text_height_u']} u ({c['text_height_rel']:.1%} of H), {c['core_is']} {c['core_height_u']} u, est. font-size ~{c['font_size_u_est']} u (1 u = 1 px at 1080 short side); uppercase {c['uppercase_ratio']:.0%}",
              f"- Colour: fill {c['fill_hex']}, outline {c['outline_hex'] if c['outline'] else 'none'} "
              f"(~{c['outline_px_u']} u = {c['outline_rel_em']:.2f} em), highlight {c['highlight_hex'] or 'none detected'}, background box: {'yes ' + str(c['box_hex']) if c['background_box'] else 'no'}",
              f"- Font (heuristic): **{f['class']}** (stroke {f['weight_em']} em, contrast {f['stroke_contrast']}, advance {f['char_width_em']} em) -> try {', '.join(f['suggested_families'][:3])}"]
        if sy.get("matched"):
            o = sy["onset_offset_s"]
            L.append(f"- Sync vs transcript: {sy['matched']} pages matched; caption appears {o['median']:+.3f}s vs the spoken word (p10 {o['p10']:+.3f}, p90 {o['p90']:+.3f}; + = after)")
    if d.get("static_text"):
        L.append(f"- Static on-screen text: {[s['text'] for s in d['static_text']]}")
    return "\n".join(L)
