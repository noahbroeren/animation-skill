"""Audio DSP tests: BS.1770 loudness vs ffmpeg, true-peak limiter, mastering loop, ducking curve.

Run:  py tests/test_audio.py
"""
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "skill", "video-forge", "audio"))
import dsp  # noqa: E402

SR = 48000


def tone(db=-20.0, f=997.0, sec=6.0):
    t = np.arange(int(SR * sec)) / SR
    x = 10 ** (db / 20) * np.sin(2 * np.pi * f * t)
    return np.stack([x, x])


def ffmpeg_lufs(x):
    p = os.path.join(tempfile.mkdtemp(), "t.wav")
    wavfile.write(p, SR, x.T.astype(np.float32))
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", p, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s*(-?[\d.]+) LUFS", r)[-1])


def test_lufs_matches_ffmpeg():
    for db in (-12.0, -20.0, -30.0):
        x = tone(db)
        assert abs(dsp.lufs(x) - ffmpeg_lufs(x)) < 0.3, (db, dsp.lufs(x), ffmpeg_lufs(x))


def test_lufs_is_relative():
    x = tone(-18)
    assert abs((dsp.lufs(x) - dsp.lufs(x * 0.5)) - 6.02) < 0.05


def test_true_peak_limiter():
    rng = np.random.default_rng(1)
    x = rng.standard_normal((2, SR * 3)) * 0.6
    y = dsp.tp_limit(x, -1.0)
    assert dsp.true_peak_db(y) <= -0.9, dsp.true_peak_db(y)


def test_master_loop_hits_target():
    rng = np.random.default_rng(2)
    x = tone(-30) + rng.standard_normal((2, SR * 6)) * 0.01
    y, info = dsp.master(x, -14.0, -1.0)
    assert abs(info["lufs"] + 14.0) < 0.05 and info["true_peak_dbtp"] <= -0.9, info


def test_duck_curve_keyed_from_words():
    n = SR * 4
    c = dsp.duck_curve([{"start": 1.0, "end": 1.5}, {"start": 1.6, "end": 2.0}], n, depth=-3)
    assert abs(c[int(0.2 * SR)]) < 0.01            # silent before speech
    assert c[int(1.8 * SR)] < -2.5                  # ducked while speaking (gaps < 0.3 s merged)
    assert c[int(3.9 * SR)] > -1.0                  # released after


def test_event_loudness_short_sounds():
    # regression: momentary() is -inf under 400 ms, so short SFX (pop 0.12 s, swish 0.3 s) were never levelled
    pop = tone(-20, 1000, 0.12)
    assert np.isfinite(dsp.event_loudness(pop))
    assert abs(dsp.event_loudness(pop) - dsp.event_loudness(tone(-20, 1000, 1.0))) < 1.0  # same level, any length


def test_mix_levels_short_sfx_relative_to_voice():
    sys.path.insert(0, os.path.join(HERE, "..", "skill", "video-forge", "audio"))
    import json
    import mix
    d = tempfile.mkdtemp()
    wavfile.write(os.path.join(d, "vo.wav"), SR, tone(-20, 300, 4.0).T.astype(np.float32))
    wavfile.write(os.path.join(d, "pop.wav"), SR, tone(-3, 1500, 0.12).T.astype(np.float32))
    plan = {"duration": 4.0, "fps": 30, "tracks": [{"file": "vo.wav", "role": "voice"},
            {"file": "pop.wav", "at_frame": 60, "naive_lu": -6}]}
    _, rep = mix.mix(plan, d)
    got = [c for c in rep["cues"] if c["file"] == "pop.wav"][0]["lu_vs_voice"]
    assert got is not None and abs(got - (-12)) < 1.0, got  # naive -6, events get a further -6
    assert not rep.get("level_errors")


def test_rhubarb_lipsync_if_installed():
    """Audio-driven mouth cues (skips when Rhubarb is not installed/cached; never downloads in tests)."""
    import shutil
    cache = os.path.join(os.path.expanduser("~"), ".cache", "video-forge", "rhubarb")
    exe = os.environ.get("RHUBARB") or shutil.which("rhubarb") or next(
        (os.path.join(r, f) for r, _, fs in os.walk(cache) for f in fs if f in ("rhubarb.exe", "rhubarb")), None)
    if not exe:
        print("skip test_rhubarb_lipsync_if_installed (no rhubarb)")
        return
    sys.path.insert(0, os.path.join(HERE, "..", "skill", "video-forge", "audio"))
    import lipsync
    d = tempfile.mkdtemp()
    t = np.arange(int(SR * 2.0)) / SR  # a vowel-like buzz with syllable envelope: Rhubarb must open and close the mouth
    x = 0.3 * np.sign(np.sin(2 * np.pi * 140 * t)) * (0.5 + 0.5 * np.sin(2 * np.pi * 3 * t)) ** 2
    wavfile.write(os.path.join(d, "v.wav"), SR, x.astype(np.float32))
    cues = lipsync.cues(os.path.join(d, "v.wav"), rhubarb=exe, recognizer="phonetic")["mouthCues"]
    assert cues and abs(cues[-1]["end"] - 2.0) < 0.1
    assert len({c["value"] for c in cues}) >= 2


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
