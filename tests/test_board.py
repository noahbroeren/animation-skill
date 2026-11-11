"""1.7 storyboard tooling: `story.py board` (a gag per sentence), `tighten.py` (pauses capped, word times shifted) and
`score.py` (sound from the picture's cue sheet, synthesized path = what the repository can reproduce).

Run:  py tests/test_board.py
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.join(HERE, "..", "skill", "video-forge")
sys.path.insert(0, os.path.join(SKILL, "story"))
sys.path.insert(0, os.path.join(SKILL, "audio"))
SR = 48000


def test_board_draft_gives_every_clause_a_place_a_shot_and_flags_missing_gags():
    out = tempfile.mkdtemp()
    script = os.path.join(SKILL, "story", "examples", "coins.txt")
    words = os.path.join(SKILL, "engine", "public", "coins", "words.json")
    r = subprocess.run([sys.executable, os.path.join(SKILL, "story", "story.py"), "board", script, "--words", words, "--id", "drafttest", "--out", out], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    ts = open(os.path.join(out, "index.tsx"), encoding="utf-8").read()
    md = open(os.path.join(out, "board.md"), encoding="utf-8").read()
    assert "boardProject(board)" in ts and 'import WORDS from "./words.json"' in ts
    rows = [json.loads(l.strip().rstrip(",")) for l in ts.splitlines() if l.strip().startswith('{"at"')]
    assert len(rows) >= 19, len(rows)                      # at least one beat per sentence (19), long sentences split
    assert rows[0]["at"] == 0 and "place" in rows[0] and rows[0]["key"]
    assert all("shot" in b and "act" in b for b in rows)
    sizes = [b["shot"]["size"] for b in rows]
    assert all(a != b or a == "close" for a, b in zip(sizes, sizes[1:])), sizes    # never the same size twice (spoken lines may both be close)
    # anchors exist in the narration, in order
    toks = [w["word"].lower().strip('.,?!:"') for w in json.load(open(words))]
    pos = 0
    for b in rows[1:]:
        w = str(b["at"]).split("#")[0]
        assert w in toks[pos:], (w, pos)
        pos = toks.index(w, pos)
    stamps = [b["gag"]["stamp"] for b in rows if "stamp" in b.get("gag", {})]
    assert "1695" in stamps and "1696" in stamps            # years become stamps
    assert "Still needs a gag" in md and "**needs a gag**" in md


def _bursts(times, dur):
    x = np.zeros(int(dur * SR), np.float32)
    for a, b in times:
        t = np.arange(int((b - a) * SR)) / SR
        x[int(a * SR):int(a * SR) + len(t)] = 0.5 * np.sin(2 * np.pi * 220 * t) * np.hanning(len(t))
    return x


def test_tighten_caps_pauses_and_keeps_words_on_their_sound():
    from tighten import tighten
    spans = [(0.5, 0.8), (0.9, 1.2), (2.4, 2.7), (2.8, 3.1), (4.6, 4.9)]   # gaps: 0.1, 1.2 (sentence end), 0.1, 1.5
    words = [{"word": w, "start": a, "end": b} for w, (a, b) in zip(["one", "two.", "three", "four", "five"], spans)]
    x = _bursts(spans, 5.5)
    y, nw = tighten(x, SR, words, max_gap=0.2, sentence_gap=0.3)
    assert len(y) < len(x) * 0.62, (len(x), len(y))
    gaps = [b["start"] - a["end"] for a, b in zip(nw, nw[1:])]
    assert max(gaps) < 0.36, gaps
    assert abs(gaps[0] - 0.1) < 0.02 and abs(gaps[2] - 0.1) < 0.02            # short pauses untouched
    for w in nw:                                                              # each word still sits on its burst
        mid = int((w["start"] + w["end"]) / 2 * SR)
        assert np.abs(y[mid - 2400:mid + 2400]).max() > 0.3, w


def test_score_builds_a_master_from_the_cue_sheet_without_real_samples():
    pub = tempfile.mkdtemp()
    fps, total = 30, 240
    spans = [(0.4, 0.8), (1.0, 1.5), (2.2, 2.9), (4.0, 4.6), (5.5, 6.2)]
    wavfile.write(os.path.join(pub, "vo.wav"), SR, (_bursts(spans, 7.0) * 32767).astype(np.int16))
    json.dump([{"word": f"w{i}", "start": a, "end": b} for i, (a, b) in enumerate(spans)], open(os.path.join(pub, "words.json"), "w"))
    tl = {"fps": fps, "durationInFrames": total, "sounds": [{"f": 30, "name": "swish", "lu": -15}, {"f": 60, "name": "snip"}, {"f": 90, "name": "crowd_gasp"}, {"f": 120, "name": "impact", "on_word": True}],
          "music": [{"f": 0, "mode": "build"}, {"f": 120, "mode": "stop"}, {"f": 150, "mode": "full"}], "rain": [{"f": 90, "amount": 1}, {"f": 180, "amount": 0}],
          "places": [{"f": 0, "set": "shop", "interior": True}, {"f": 90, "set": "street", "interior": False}]}
    tlp = os.path.join(pub, "timeline.json")
    json.dump(tl, open(tlp, "w"))
    r = subprocess.run([sys.executable, os.path.join(SKILL, "audio", "score.py"), tlp, "--project-dir", pub, "--no-real"], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-2000:]
    sr, m = wavfile.read(os.path.join(pub, "master.wav"))
    assert abs(len(m) / sr - total / fps) < 0.1
    rep = open(os.path.join(pub, "sound_report.md"), encoding="utf-8").read()
    assert "4 cues: 0 real samples, 3 synthesized, 1 skipped" in rep, rep      # no stand-in for a crowd gasp: skipped, and said so
    plan = json.load(open(os.path.join(pub, "audio_plan.json")))
    assert any(t["file"] == "ambience.wav" for t in plan["tracks"]) and any(t.get("role") == "music" for t in plan["tracks"])
    snip = next(t for t in plan["tracks"] if t.get("at_frame") == 60)
    assert snip["file"].endswith("click.wav") and snip["naive_lu"] == -9          # stand-in + default level by name


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
