"""`vfa keygap`: per-section colour table. Guards the lesson from the elevator proof short: one section flipping moves a
video-wide median while every other section stays put.

Run:  py tests/test_keygap.py
"""
import json
import os
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "skill", "video-forge", "analyzer"))
from vfa.keygap import keygap, sections  # noqa: E402

KEYS = ["luma_mean", "luma_p99", "sat_mean", "warmth", "high_a", "high_b", "shadow_a", "shadow_b", "edge_density"]


def _analysis(high_b_by_section):
    d = tempfile.mkdtemp()
    n = 300
    arr = {k: np.full(n, 0.5, np.float32) for k in KEYS}
    hb = np.zeros(n, np.float32)
    for (a, b), v in zip([(0, 100), (100, 200), (200, 300)], high_b_by_section):
        hb[a:b] = v
    arr["high_b"] = hb
    np.savez(os.path.join(d, "frames.npz"), **arr)
    return d


def _plan():
    p = os.path.join(tempfile.mkdtemp(), "timeline.json")
    json.dump({"soft": [100, 200], "cuts": [50], "cues": {"s.day": 0, "s.night": 101, "s.end": 204}}, open(p, "w"))
    return p


def test_sections_follow_soft_transitions_and_take_cue_names():
    plan = json.load(open(_plan()))
    s = sections(plan, 300)
    assert [(a, b) for _, a, b in s] == [(0, 100), (100, 200), (200, 300)], s
    assert [n for n, _, _ in s] == ["day", "night", "end"], s
    assert len(sections(plan, 300, cuts=True)) == 4  # the hard cut at 50 splits the first section


def test_one_section_flipping_moves_the_video_median_and_keygap_shows_which():
    plan = _plan()
    before = _analysis([-4.0, -1.0, 13.0])   # median -1
    after = _analysis([-4.0, 14.0, 13.0])    # only the night section changed; median jumps to 13
    r = keygap(after, plan, ref={"color": {"high_b": {"median": 5.8}}}, prev_dir=before)
    assert abs(r["overall"]["high_b"] - 13.0) < 1e-6
    rows = {x["section"]: x for x in r["sections"]}
    assert rows["day"]["high_b"] == rows["day"]["high_b_prev"] and rows["end"]["high_b"] == rows["end"]["high_b_prev"]
    assert rows["night"]["high_b_prev"] == -1.0 and rows["night"]["high_b"] == 14.0
    assert "-1.0 -> **14.0**" in r["md"] and "reference" in r["md"]
    assert os.path.exists(os.path.join(after, "keygap.md")) and os.path.exists(os.path.join(after, "keygap.json"))


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
