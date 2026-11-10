"""Tests for the deep analysers (vfa ocr / transitions / stems / embed / pose / analyze --deep).

Synthetic ground truth: transitions rendered with known frames, captions rendered with known
words/timing/colours, tones for the stem fallback. Tests that need an optional dependency skip
(print "skip ...") when it is not installed.

Run:  py tests/test_analysis_ext.py
"""
import json
import os
import subprocess
import sys
import tempfile
import wave

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "skill", "video-forge", "analyzer"))

from vfa.extutil import optional  # noqa: E402

FPS = 30


class Skip(Exception):
    pass


def texture(seed, w=1200, h=900):
    rng = np.random.default_rng(seed)
    img = (rng.random((h // 10, w // 10, 3)) * 255).astype(np.uint8)
    img = cv2.resize(img, (w, h), interpolation=cv2.INTER_CUBIC)
    for _ in range(160):
        c = tuple(int(x) for x in rng.integers(0, 255, 3))
        cv2.circle(img, (int(rng.integers(0, w)), int(rng.integers(0, h))), int(rng.integers(10, 70)), c, -1)
        cv2.line(img, tuple(int(x) for x in rng.integers(0, w, 2)), tuple(int(x) for x in rng.integers(0, h, 2)), (15, 15, 15), 3)
    return img


def crop(tex, x, y, w, h):
    M = np.float32([[1, 0, -x], [0, 1, -y]])
    return cv2.warpAffine(tex, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def write_video(frames, path, audio_wav=None):
    h, w = frames[0].shape[:2]
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(FPS), "-i", "-"]
    if audio_wav:
        cmd += ["-i", audio_wav, "-c:a", "aac", "-b:a", "192k", "-shortest"]
    cmd += ["-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in frames:
        p.stdin.write(np.ascontiguousarray(f).tobytes())
    p.stdin.close()
    p.wait()
    assert p.returncode == 0


def write_wav(path, x, sr=44100):
    x = np.clip(x, -1, 1)
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


# ------------------------------------------------------------------ transitions

def build_transitions(path, W=480, H=270):
    """45f shots with a slow creep; hard cut @45, 12f dissolve @90, dip to black @147, 10f wipe @212."""
    T = [texture(s) for s in (11, 12, 13, 14, 15)]
    shot = lambda k, i: crop(T[k], 200 + 0.3 * i, 150, W, H)
    fr = []
    for i in range(45):
        fr.append(shot(0, i))
    for i in range(45):                       # 45..89
        fr.append(shot(1, i))
    for i in range(12):                       # 90..101 dissolve
        a = (i + 1) / 13
        fr.append(cv2.addWeighted(shot(1, 45 + i), 1 - a, shot(2, i), a, 0))
    for i in range(45):                       # 102..146
        fr.append(shot(2, 12 + i))
    for i in range(8):                        # 147..154 fade out
        fr.append((shot(2, 57 + i) * (1 - (i + 1) / 8)).astype(np.uint8))
    for i in range(4):                        # 155..158 black
        fr.append(np.zeros((H, W, 3), np.uint8))
    for i in range(8):                        # 159..166 fade in
        fr.append((shot(3, i) * ((i + 1) / 9)).astype(np.uint8))
    for i in range(45):                       # 167..211
        fr.append(shot(3, 8 + i))
    for i in range(10):                       # 212..221 wipe left->right
        f = shot(3, 53 + i).copy()
        x = int(round((i + 1) / 11 * W))
        f[:, :x] = shot(4, i)[:, :x]
        fr.append(f)
    for i in range(45):                       # 222..266
        fr.append(shot(4, 10 + i))
    write_video(fr, path)
    return {"hard_cut": 45, "dissolve": 90, "dip_black": 147, "wipe": 212}


def test_transitions_synthetic():
    from vfa.transitions import run
    d = tempfile.mkdtemp(prefix="vfa_tr_")
    vid = os.path.join(d, "tr.mp4")
    truth = build_transitions(vid)
    res = run(vid)
    got = [(r["type"], r["start_frame"], r["frames"]) for r in res["transitions"]]
    for typ, f0 in truth.items():
        hit = [g for g in got if g[0] == typ and abs(g[1] - f0) <= 3]
        assert hit, (typ, f0, got)
    diss = next(g for g in got if g[0] == "dissolve")
    assert 9 <= diss[2] <= 14, diss
    wipe = next(r for r in res["transitions"] if r["type"] == "wipe")
    assert wipe["details"]["direction"] == "left-to-right", wipe["details"]
    # nothing spurious inside the creeping shots
    assert len(got) <= 5, got
    assert res["summary"]["dissolves_per_minute"] > 0


# ------------------------------------------------------------------ OCR / captions

PAGES = ["HELLO BIG WORLD", "THIS IS A", "VERY SIMPLE CAPTION", "TEST WITH THREE", "WORDS ON EACH", "PAGE AND ONE",
         "YELLOW WORD THAT", "MARKS THE ACTIVE", "ONE RIGHT NOW", "SO THAT IS", "THE END NOW", "GOOD BYE FOLKS"]
PAGE_S = 0.5


def _font(size):
    from PIL import ImageFont
    for f in ("C:/Windows/Fonts/arialbd.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default(size=size)


def build_captions(path, W=540, H=960):
    """Shorts-style captions: 3 uppercase words/page, 0.5 s/page, white fill, black stroke, middle word yellow."""
    from PIL import Image, ImageDraw
    font = _font(46)
    bg = cv2.cvtColor(texture(21, 1400, 1300), cv2.COLOR_BGR2RGB)
    bg = (bg * 0.55 + np.array([20, 40, 90]) * 0.45).astype(np.uint8)
    fr = []
    n = int(len(PAGES) * PAGE_S * FPS)
    for i in range(n):
        im = Image.fromarray(np.ascontiguousarray(bg[100 + i // 2: 100 + i // 2 + H, 200 + i: 200 + i + W]))
        d = ImageDraw.Draw(im)
        words = PAGES[min(len(PAGES) - 1, int(i / (PAGE_S * FPS)))].split()
        widths = [d.textlength(w + " ", font=font) for w in words]
        x = (W - sum(widths) + d.textlength(" ", font=font)) / 2
        for k, w in enumerate(words):
            d.text((x, int(0.65 * H) - 30), w, font=font, fill=(255, 210, 63) if k == 1 else (255, 255, 255),
                   stroke_width=5, stroke_fill=(10, 10, 12))
            x += widths[k]
        fr.append(cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR))
    write_video(fr, path)


def test_ocr_captions():
    if optional("rapidocr_onnxruntime")[0] is None and optional("rapidocr")[0] is None:
        raise Skip("rapidocr not installed")
    from vfa.analyze import analyze
    from vfa.ocr import run
    d = tempfile.mkdtemp(prefix="vfa_ocr_")
    vid = os.path.join(d, "cap.mp4")
    build_captions(vid)
    adir = os.path.join(d, "an")
    analyze(vid, adir, sheets="none", speech="off", quiet=True)
    # transcript: each page's first word is spoken 0.05 s AFTER the page appears -> offset -0.05
    words = []
    for k, p in enumerate(PAGES):
        for j, w in enumerate(p.split()):
            t = k * PAGE_S + 0.05 + 0.2 * j
            words.append({"start": round(t, 3), "end": round(t + 0.18, 3), "word": w.lower()})
    json.dump({"engine": "test", "words": words, "segments": []}, open(os.path.join(adir, "transcript.json"), "w"))
    r = run(adir)
    c = r["caption"]
    assert c["present"], r
    assert c["words_per_page_median"] == 3, (c["words_per_page"], [p["text"] for p in r["pages"]])
    assert c["uppercase_ratio"] > 0.9, c["uppercase_ratio"]
    assert abs(c["center_y_rel"] - 0.65) < 0.05, c["center_y_rel"]
    f = c["fill_hex"]
    assert all(int(f[i:i + 2], 16) > 200 for i in (1, 3, 5)), f            # white fill
    assert c["outline"] and all(int(c["outline_hex"][i:i + 2], 16) < 70 for i in (1, 3, 5)), c["outline_hex"]
    hl = c["highlight_hex"]
    assert hl and int(hl[1:3], 16) > 190 and int(hl[5:7], 16) < 140, hl     # yellow active word
    assert c["timing"].startswith("frame-accurate")
    assert abs(c["page_seconds"]["median"] - PAGE_S) < 0.1, c["page_seconds"]
    assert c["sync"]["matched"] >= 8 and abs(c["sync_offset_s"] + 0.05) < 0.05, c["sync"]
    assert c["font"]["class"].startswith(("heavy sans", "regular sans")), c["font"]
    # Arial Bold at 46 px: cap height ~0.716 em = 33 px on a 540 px wide frame -> x2 = ~66 u
    assert 55 < c["core_height_u"] < 78, c["core_height_u"]
    assert 75 < c["font_size_u_est"] < 110, c["font_size_u_est"]


# ------------------------------------------------------------------ stems

def build_audio_video(path, dur=8.0, sr=44100):
    """Pad + kick music (stops 3.0-4.0 s) under a 'voice' (vowel-like harmonic bursts)."""
    t = np.arange(int(dur * sr)) / sr
    music = 0.12 * sum(np.sin(2 * np.pi * f * t) for f in (220, 277.2, 329.6))
    for b in np.arange(0, dur, 0.5):
        i = int(b * sr)
        n = int(0.12 * sr)
        music[i:i + n] += 0.5 * np.sin(2 * np.pi * 60 * t[:n]) * np.exp(-t[:n] * 30)
    stop = (t >= 3.0) & (t < 4.0)
    music[stop] = 0
    f0 = 140 + 20 * np.sin(2 * np.pi * 0.7 * t)
    ph = 2 * np.pi * np.cumsum(f0) / sr
    voice = sum((0.3 / k) * np.sin(k * ph) for k in range(1, 12))
    gate = ((t % 1.5) < 1.0) & ~stop
    voice *= gate * (0.6 + 0.4 * np.sin(2 * np.pi * 4 * t) ** 2)
    wav = path + ".wav"
    write_wav(wav, 0.5 * (music + voice))
    img = np.full((360, 640, 3), 60, np.uint8)
    write_video([img] * int(dur * FPS), path, audio_wav=wav)


def test_stems():
    from vfa.analyze import analyze
    from vfa import stems
    d = tempfile.mkdtemp(prefix="vfa_st_")
    vid = os.path.join(d, "a.mp4")
    build_audio_video(vid)
    adir = os.path.join(d, "an")
    analyze(vid, adir, sheets="none", speech="off", quiet=True)
    words = [{"start": s + 0.1 * k, "end": s + 0.1 * k + 0.08, "word": "la"} for s in (0, 1.5, 4.5, 6.0) for k in range(9)]
    json.dump({"words": words, "segments": [{"start": s, "end": s + 1.0, "text": "la la"} for s in (0, 1.5, 4.5, 6.0)]},
              open(os.path.join(adir, "transcript.json"), "w"))
    fb = stems._fallback(vid, adir, 8.0)                      # heuristic path always works
    assert fb["method"].startswith("HEURISTIC") and fb["music_presence"] is not None
    if optional("demucs.apply")[0] is None or optional("torch")[0] is None:
        raise Skip("demucs/torch not installed (fallback checked)")
    r = stems.run(adir)
    assert r["engine"].startswith("demucs"), r.get("demucs_error")
    assert 0.5 <= r["music_presence"] <= 0.97, r["music_presence"]
    assert any(abs(s["t"] - 3.0) < 0.5 for s in r["music_stops"]), r["music_stops"]
    assert r["loudness_lufs"].get("music") is not None


# ------------------------------------------------------------------ embed / similar

def test_embed_and_similar():
    if optional("open_clip")[0] is None or optional("torch")[0] is None:
        raise Skip("open_clip/torch not installed")
    from vfa.analyze import analyze
    from vfa.embed import run, similar
    d = tempfile.mkdtemp(prefix="vfa_em_")
    a, b = os.path.join(d, "a.mp4"), os.path.join(d, "b.mp4")
    build_transitions(a)
    build_captions(b)
    for v in (a, b):
        analyze(v, os.path.splitext(v)[0] + "_analysis", sheets="none", speech="off", quiet=True)
    r = run(a)
    for g in ("style", "lighting", "shot"):
        assert abs(sum(r["tags"][g].values()) - 1.0) < 0.02, r["tags"][g]
    assert len(r["summary"]["centroid"]) >= 256
    same = similar(a, a)
    other = similar(a, b)
    assert same["mean_nn_cos"] > 0.97 and same["style_similarity"] > 90, same
    assert other["mean_nn_cos"] < same["mean_nn_cos"] - 0.05, (other["mean_nn_cos"], same["mean_nn_cos"])
    assert os.path.exists(os.path.join(os.path.splitext(a)[0] + "_analysis", "embeddings.npz"))


# ------------------------------------------------------------------ pose

def test_pose_lag_and_no_character():
    from vfa.pose import _corr_lag, run
    x = np.sin(np.arange(300) / 5.0) + 0.05 * np.random.default_rng(0).standard_normal(300)
    y = np.roll(x, -3)                         # x lags y by 3 frames
    r0, lag, rb = _corr_lag(x, y, 8)
    assert lag == 3 and rb > 0.95, (lag, rb)
    d = tempfile.mkdtemp(prefix="vfa_po_")
    vid = os.path.join(d, "a.mp4")
    build_audio_video(vid, dur=3.0)
    r = run(vid)                                # no character at all: coverage must be honest (~0), no crash
    assert r["available"] and r["coverage"]["face"] < 0.05, r["coverage"]


# ------------------------------------------------------------------ analyze --deep + compare

def test_deep_and_compare():
    from vfa.analyze import analyze
    from vfa.compare import compare
    d = tempfile.mkdtemp(prefix="vfa_dp_")
    vid = os.path.join(d, "tr.mp4")
    build_transitions(vid)
    fp = analyze(vid, os.path.join(d, "an"), sheets="none", speech="off", quiet=True, deep=True,
                 deep_skip=["stems", "pose", "embed"])
    dp = fp["deep"]
    assert dp["transitions"]["available"] and dp["transitions"]["counts"]["dissolve"] >= 1, dp["transitions"]
    assert "ocr" in dp and dp["stems"]["reason"].startswith("skipped")
    saved = json.load(open(os.path.join(d, "an", "fingerprint.json"), encoding="utf-8"))
    assert "deep" in saved and "Deep analysis" in open(os.path.join(d, "an", "report.md"), encoding="utf-8").read()
    c = compare(saved, saved)
    assert c["match_score"] == 100.0 and any(r["metric"].startswith("deep.transitions") for r in c["rows"]), c["rows"]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            try:
                fn()
                print("ok", name)
            except Skip as e:
                print("skip", name, "-", e)
