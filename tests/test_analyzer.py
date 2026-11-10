"""Ground-truth tests for the analyzer: synthetic videos with known camera motion and cuts.

Run:  py -m pytest tests -q      (or: py tests/test_analyzer.py)
"""
import json
import math
import os
import subprocess
import sys
import tempfile

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "skill", "video-forge", "analyzer"))

from vfa.analyze import analyze, native_scale_estimate  # noqa: E402
from vfa.frame_metrics import MotionEstimator  # noqa: E402
from vfa.compare import compare  # noqa: E402

W, H, FPS = 640, 360, 30


def texture(seed, w=2400, h=1400):
    rng = np.random.default_rng(seed)
    img = (rng.random((h // 8, w // 8, 3)) * 255).astype(np.uint8)
    img = cv2.resize(img, (w, h), interpolation=cv2.INTER_CUBIC)
    for _ in range(300):
        c = tuple(int(x) for x in rng.integers(0, 255, 3))
        cv2.circle(img, (int(rng.integers(0, w)), int(rng.integers(0, h))), int(rng.integers(8, 60)), c, -1)
        cv2.line(img, tuple(int(x) for x in rng.integers(0, w, 2)), tuple(int(x) for x in rng.integers(0, h, 2)), (10, 10, 10), 3)
    return img


def view(tex, cx, cy, zoom, rot=0.0):
    """Render a W x H camera view of `tex` centred at (cx,cy) with zoom (>1 = closer)."""
    M = cv2.getRotationMatrix2D((cx, cy), rot, zoom)
    M[0, 2] += W / 2 - cx
    M[1, 2] += H / 2 - cy
    return cv2.warpAffine(tex, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def write_video(frames, path):
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}",
                          "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", path],
                         stdin=subprocess.PIPE)
    for f in frames:
        p.stdin.write(f.tobytes())
    p.stdin.close()
    p.wait()


def smoother(u):
    u = min(1.0, max(0.0, u))
    return u * u * u * (u * (6 * u - 15) + 10)


def test_motion_signs_and_zoom():
    tex = texture(1)
    est = MotionEstimator(W, H)
    g = lambda im: cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    est.update(g(view(tex, 1200, 700, 1.0)))
    # camera moves right by 3 px => content moves left => dx < 0
    r = est.update(g(view(tex, 1203, 700, 1.0)))
    assert r["dx"] < 0 and abs(r["dx"] * W + 3) < 0.3, r
    est.reset(g(view(tex, 1200, 700, 1.0)))
    r = est.update(g(view(tex, 1200, 700, 1.01)))
    assert abs(r["dlogs"] - math.log(1.01)) < 0.002, r
    est.reset(g(view(tex, 1200, 700, 1.0)))
    r = est.update(g(view(tex, 1200, 700, 1.0, rot=1.0)))
    assert abs(abs(r["drot"]) - 1.0) < 0.15, r


def test_fourier_mellin_fallback():
    # FM path directly: verify sign conventions agree with LK
    tex = texture(2)
    est = MotionEstimator(W, H)
    a = cv2.cvtColor(view(tex, 1200, 700, 1.0), cv2.COLOR_BGR2GRAY)
    b = cv2.cvtColor(view(tex, 1200, 700, 1.03), cv2.COLOR_BGR2GRAY)
    tx, ty, dl, dr, resp = est._fm(a, b)
    assert dl > 0 and abs(dl - math.log(1.03)) < 0.01, (dl, resp)
    c = cv2.cvtColor(view(tex, 1206, 700, 1.0), cv2.COLOR_BGR2GRAY)
    tx, ty, dl, dr, resp = est._fm(a, c)
    assert tx < 0 and abs(tx * W + 6) < 1.0, (tx, resp)


def build_sequence(path):
    """Shot A: 60f eased push-in 1.0->1.15 ; Shot B: 90f slow creep 0.15 px/frame ; Shot C: 45f fast pan."""
    t1, t2, t3 = texture(3), texture(4), texture(5)
    frames, truth = [], {"cuts": [60, 150]}
    for i in range(60):
        frames.append(view(t1, 1200, 700, 1.0 + 0.15 * smoother(i / 59)))
    for i in range(90):
        frames.append(view(t2, 1000 + 0.15 * i, 600, 1.0))
    for i in range(45):
        frames.append(view(t3, 800 + 8 * i, 700, 1.0))
    write_video(frames, path)
    return truth


def test_full_pipeline():
    d = tempfile.mkdtemp(prefix="vfa_test_")
    vid = os.path.join(d, "synthetic.mp4")
    truth = build_sequence(vid)
    fp = analyze(vid, os.path.join(d, "out"), sheets="all", speech="off", quiet=True)
    cut_frames = [int(round(t * FPS)) for t in fp["editing"]["cut_times"]]
    assert len(cut_frames) == 2 and all(abs(a - b) <= 1 for a, b in zip(cut_frames, truth["cuts"])), cut_frames
    s0, s1, s2 = fp["shots"]
    assert "push-in" in s0["camera"] and abs(s0["total_zoom"] - 1.15) < 0.02, s0["camera"]
    # eased glide: one move spanning most of the shot, ease-in-out
    assert s0["moves"] and s0["moves"][0]["ease"] == "ease-in-out", s0["moves"]
    # slow creep 0.15 px/frame = 0.007 w/s at 640 px -> must register as creep, not still
    assert s1["frac_creep"] > 0.6, (s1["frac_creep"], s1["speed_median"])
    assert abs(s1["total_pan_x"] * W + 0.15 * 89) < 2.0, s1["total_pan_x"] * W
    assert "pan-right" in s2["camera"], s2["camera"]
    assert os.path.exists(os.path.join(d, "out", "timeline.png"))
    assert len(fp["artifacts"]["sheets"]) == 4  # 195 frames / 60 per sheet
    # self-compare must be a perfect match
    c = compare(fp, fp)
    assert c["match_score"] == 100.0, c
    json.dumps(fp, default=float)


def sharp_texture(seed, w=1280, h=720):
    rng = np.random.default_rng(seed)
    img = np.full((h, w), 128, np.uint8)
    for _ in range(600):
        c = int(rng.integers(0, 255))
        if rng.random() < .5:
            cv2.circle(img, (int(rng.integers(0, w)), int(rng.integers(0, h))), int(rng.integers(3, 80)), c, -1, lineType=cv2.LINE_AA)
        else:
            cv2.line(img, tuple(int(x) for x in rng.integers(0, w, 2)), tuple(int(x) for x in rng.integers(0, h, 2)), c,
                     int(rng.integers(1, 4)), lineType=cv2.LINE_AA)
    return img


def test_native_scale():
    g = sharp_texture(1)
    native = native_scale_estimate(g)
    assert native["upscale_factor_estimate"] == 1.0, native
    for f, lo, hi in ((2, 1.6, 2.4), (3, 2.4, 3.3)):
        up = cv2.resize(cv2.resize(g, (int(1280 / f), int(720 / f)), interpolation=cv2.INTER_AREA), (1280, 720),
                        interpolation=cv2.INTER_LANCZOS4)
        e = native_scale_estimate(up)
        assert lo <= e["upscale_factor_estimate"] <= hi, (f, e)





def test_cut_detector_terminates_when_peak_precedes_candidate():
    """Regression: a candidate whose local score max lies BEFORE it used to loop forever."""
    from vfa.shots import detect_cuts
    n = 400
    hist = np.full(n, 0.02)
    luma = np.full(n, 0.01)
    # peak at 100, weaker candidate at 102 (max in window lies before it)
    hist[100], luma[100] = 0.9, 0.5
    hist[102], luma[102] = 0.6, 0.3
    cuts, flashes = detect_cuts(hist, luma, np.full(n, 5.0), np.zeros(n), 30.0)
    assert cuts == [100] and len(flashes) <= 1, (cuts, flashes)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
