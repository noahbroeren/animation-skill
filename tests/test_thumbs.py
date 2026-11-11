"""Thumbnail checker tests on synthetic images (no rendering): feed-size OCR readability, WCAG contrast,
timestamp-zone logic, scoring order, diversity.

Run:  py tests/test_thumbs.py
"""
import os
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "skill", "video-forge", "analyzer", "vfa"))
import thumbcheck as tc  # noqa: E402

TMP = tempfile.mkdtemp(prefix="thumbtest_")


def font(sz):
    for f in ("arialbd.ttf", "Arial Bold.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(f, sz)
        except OSError:
            continue
    raise RuntimeError("no TrueType bold font found")


def make(name, text, size, xy=(60, 60), bg=(250, 250, 250), fg=(10, 10, 10), stroke=0, stroke_fill=(0, 0, 0), wh=(1280, 720), blob=None):
    """Draw `text` at xy; optional coloured blob = a 'subject'. Returns (path, text bbox)."""
    im = Image.new("RGB", wh, bg)
    d = ImageDraw.Draw(im)
    if blob:
        (cx, cy, r, col) = blob
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=col, outline=(20, 10, 30), width=8)
    f = font(size)
    d.text(xy, text, font=f, fill=fg, stroke_width=stroke, stroke_fill=stroke_fill)
    bb = d.textbbox(xy, text, font=f, stroke_width=stroke)
    p = os.path.join(TMP, name + ".png")
    im.save(p)
    return p, {"x0": bb[0], "y0": bb[1], "x1": bb[2], "y1": bb[3], "text": text}


def rgb(p):
    return np.asarray(Image.open(p).convert("RGB"))


def test_wcag_formula():
    assert abs(tc.contrast_ratio(float(tc.rel_lum([255, 255, 255])), float(tc.rel_lum([0, 0, 0]))) - 21.0) < 1e-6
    assert abs(tc.contrast_ratio(float(tc.rel_lum([255, 255, 255])), float(tc.rel_lum([255, 255, 255]))) - 1.0) < 1e-9
    # #767676 on white is the classic 4.5:1 AA threshold colour
    r = tc.contrast_ratio(float(tc.rel_lum([118, 118, 118])), float(tc.rel_lum([255, 255, 255])))
    assert 4.4 < r < 4.7, r


def test_box_contrast_low_vs_high():
    p_lo, b_lo = make("lo", "LOW", 200, bg=(215, 215, 215), fg=(250, 250, 250))
    p_hi, b_hi = make("hi", "HIGH", 200, bg=(250, 250, 250), fg=(10, 10, 10))
    p_ol, b_ol = make("ol", "OUTLINE", 160, bg=(225, 225, 225), fg=(255, 255, 255), stroke=12)
    lo = tc.box_contrast(rgb(p_lo), b_lo)["ratio"]
    hi = tc.box_contrast(rgb(p_hi), b_hi)["ratio"]
    ol = tc.box_contrast(rgb(p_ol), b_ol)["ratio"]
    assert lo < 1.6, lo  # white on light grey: unreadable
    assert hi > 15, hi
    assert ol > 10, ol  # a thick dark outline rescues white text on a light background


def test_feed_readability_big_vs_tiny():
    p_big, _ = make("big", "WHY ROUND", 190, xy=(50, 200))
    p_tiny, _ = make("tiny", "WHY ROUND", 22, xy=(50, 200))
    big = tc.check_image(p_big, "long", "WHY ROUND")
    tiny = tc.check_image(p_tiny, "long", "WHY ROUND")
    assert big["ocr_available"], "rapidocr-onnxruntime is required for this test"
    assert big["feed"]["168x94"]["survived"] == ["why", "round"], big["feed"]
    assert len(tiny["feed"]["168x94"]["survived"]) == 0, tiny["feed"]  # 22 px text is ~3 px tall at 168x94
    assert tc.word_found("it", ["fits"], "fits") is False  # short words must not match inside other words
    assert big["text_height_pct"]["min"] > 15
    sb, st = tc.score(dict(big, max_similarity=0.2)), tc.score(dict(tiny, max_similarity=0.2))
    assert sb["score"] > st["score"] + 20, (sb, st)
    assert any("do not survive" in f for f in st["fixes"])


def test_timestamp_zone():
    p_in, _ = make("ts_in", "HERE", 56, xy=(1080, 640))  # bottom-right, under the duration badge
    p_out, _ = make("ts_out", "TOP LEFT", 110, xy=(40, 40))
    r_in = tc.check_image(p_in, "long", "HERE")
    r_out = tc.check_image(p_out, "long", "TOP LEFT")
    assert r_in["timestamp"]["text_in_zone"], r_in["timestamp"]
    assert not r_out["timestamp"]["text_in_zone"], r_out["timestamp"]
    s_in = tc.score(dict(r_in, max_similarity=0.0))
    assert s_in["parts"]["timestamp"] == 0.0
    assert any("duration badge" in f for f in s_in["fixes"])
    # Shorts have no duration badge rule
    p_s, _ = make("short_ts", "HI", 120, xy=(700, 1600), wh=(1080, 1920))
    r_s = tc.check_image(p_s, "short", "HI")
    assert r_s["timestamp"] is None and "timestamp" not in tc.score(dict(r_s, max_similarity=0.0))["parts"]


def test_focal_one_subject_vs_clutter():
    p1, _ = make("one", "", 10, blob=(800, 360, 220, (255, 120, 20)))
    im = Image.new("RGB", (1280, 720), (240, 240, 240))
    d = ImageDraw.Draw(im)
    rs = np.random.default_rng(3)  # test-only randomness (fixed seed): many small competing objects
    for _ in range(60):
        x, y, r = rs.integers(0, 1280), rs.integers(0, 720), rs.integers(15, 45)
        d.rectangle((x - r, y - r, x + r, y + r), fill=tuple(int(c) for c in rs.integers(0, 255, 3)), outline=(0, 0, 0), width=3)
    p2 = os.path.join(TMP, "clutter.png")
    im.save(p2)
    f1 = tc.focal(rgb(p1), [])
    f2 = tc.focal(rgb(p2), [])
    assert f1["concentration"] > f2["concentration"], (f1, f2)
    assert f1["subject_pct"] > 8, f1
    assert f2["edge_density"] > f1["edge_density"]


def test_diversity_and_set():
    pa, _ = make("a", "SAME", 150, blob=(900, 400, 200, (255, 60, 60)))
    pb, _ = make("b", "SAME", 150, blob=(900, 400, 200, (255, 60, 60)))
    pc, _ = make("c", "OTHER", 150, bg=(20, 30, 90), fg=(255, 255, 255), blob=(300, 400, 150, (60, 220, 90)))
    res = tc.check_all([{"path": pa, "variant": "a", "text": "SAME"}, {"path": pb, "variant": "b", "text": "SAME"},
                        {"path": pc, "variant": "c", "text": "OTHER"}])
    by = {r["variant"]: r for r in res}
    assert by["a"]["max_similarity"] > 0.95 and by["a"]["most_similar"] == "b"
    assert by["c"]["max_similarity"] < by["a"]["max_similarity"]
    assert by["c"]["parts"]["diversity"] > by["a"]["parts"]["diversity"]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
