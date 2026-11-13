#!/usr/bin/env python3
"""Tighten a narration take: shorten the pauses between words, never touch a word (1.11.2: tail-safe).

  py tighten.py vo_raw.wav --words words_raw.json --out vo.wav --words-out words.json
                [--sentence-gap 0.08] [--comma-gap 0.05] [--max-gap 0.04]

Why: reference shorts narrate at ~3.8 words/s with ~0.14 s sentence pauses; a TTS take lands at 2.6-2.9 w/s because of
0.4-0.9 s pauses. Cutting INSIDE the silence keeps the performance and buys 10-20 % of the runtime.

1.11.2 (measured on our own ElevenLabs takes): the aligner's word ENDS come ~0.19 s before the sound really stops
(p90 0.37 s), so cutting a fixed distance after them sliced the tails off sentence-final words ("swear.", "TV,") and
dropped them into digital silence: the "cut-off words" in the first doorphoto renders. Now the pause is found in the
AUDIO itself:
- a 10 ms RMS envelope; quiet = below (speech p95 - 30 dB); between two aligned words the longest quiet run that lasts
  >= 40 ms is the real pause (end_ac .. onset_ac);
- a cut only ever removes audio inside [end_ac + 50 ms, onset_ac - 40 ms]: every word keeps its full tail and attack;
- the kept silence is capped by punctuation (--sentence-gap after . ! ?, --comma-gap after , ; :, --max-gap elsewhere);
- both ends of a cut snap to the quietest 5 ms point within +-15 ms and join with a 25 ms equal-power crossfade;
- word times in --words-out shift with the cuts, so captions and cues stay exact; the lead is trimmed to 20 ms and the
  file ends 0.4 s after the last word.
Prints the number of cuts, the old and new duration and words/s.
"""
from __future__ import annotations

import argparse
import json

import numpy as np
from scipy.io import wavfile


def tighten(x: np.ndarray, sr: int, words: list[dict], sentence_cap=0.08, comma_cap=0.05, word_cap=0.04,
            floor_db=30.0, hold=0.04, tail=0.05, pre=0.04, xf=0.025):
    mono = x if x.ndim == 1 else x.mean(axis=1)
    mono = mono.astype(np.float64)
    hop, win = max(1, int(sr * 0.002)), max(2, int(sr * 0.010))
    n = max(1, (len(mono) - win) // hop)
    idx = np.arange(n)[:, None] * hop + np.arange(win)[None, :]
    e = 20 * np.log10(np.sqrt((mono[idx] ** 2).mean(1)) + 1e-9)
    thr = np.percentile(e[e > -90], 95) - floor_db
    fr = lambda t: min(n, max(0, int(t * sr / hop)))
    cuts: list[tuple[float, float]] = []
    for a, b in zip(words, words[1:]):
        j0, j1 = fr(a["start"]), fr(b["start"] + 0.06)
        q = e[j0:j1] <= thr
        best, cur, bs = (0, 0), 0, 0
        for k, v in enumerate(q):  # the longest quiet run = the real pause
            if v:
                bs = k if cur == 0 else bs
                cur += 1
                if cur > best[1] - best[0]:
                    best = (bs, k + 1)
            else:
                cur = 0
        if (best[1] - best[0]) * hop / sr < hold:
            continue
        end_ac, on_ac = (j0 + best[0]) * hop / sr, (j0 + best[1]) * hop / sr
        w = a["word"].strip().rstrip("\"'*")
        cap = sentence_cap if w[-1:] in ".?!" else comma_cap if w[-1:] in ",;:" else word_cap
        sil = on_ac - end_ac
        if sil <= cap + 0.03:
            continue
        lo, hi = end_ac + tail, on_ac - pre
        rem = min(sil - cap, hi - lo)
        if rem < 0.02:
            continue
        c0 = lo + (hi - lo - rem) / 2

        def snap(t: float) -> float:
            i, r = int(t * sr), int(0.015 * sr)
            seg = np.abs(mono[max(0, i - r):i + r])
            k = int(np.argmin(np.convolve(seg, np.ones(max(1, int(0.005 * sr))), "same")))
            return (max(0, i - r) + k) / sr
        cuts.append((snap(c0), snap(c0 + rem)))
    lead_end = max(0.0, words[0]["start"] - 0.02)
    nx = max(2, int(xf * sr))
    segs, pos, removed = [], int(lead_end * sr), lead_end
    shifts = [(lead_end, removed)]
    for c0, c1 in cuts:
        i0, i1 = int(c0 * sr), int(c1 * sr)
        if i0 - nx // 2 <= pos:
            continue
        segs.append(x[pos:i0 + nx // 2]); pos = i1 - nx // 2
        removed += (i1 - i0) / sr
        shifts.append((c1, removed))
    segs.append(x[pos:])
    y = segs[0]
    t = np.linspace(0, np.pi / 2, nx)
    fo, fi = np.cos(t), np.sin(t)
    if x.ndim > 1:
        fo, fi = fo[:, None], fi[:, None]
    for s in segs[1:]:  # equal-power crossfade at every join
        y = np.concatenate([y[:-nx], y[-nx:] * fo + s[:nx] * fi, s[nx:]])

    def shift(tt: float) -> float:
        s = 0.0
        for at, rm in shifts:
            if tt >= at - 1e-6:
                s = rm
        return max(0.0, tt - s)
    nw = [{**w, "start": round(shift(w["start"]), 3), "end": round(shift(w["end"]), 3)} for w in words]
    y = y[:int(min(len(y), (nw[-1]["end"] + 0.4) * sr))]
    return y, nw, len(cuts)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("wav")
    ap.add_argument("--words", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--words-out", required=True)
    ap.add_argument("--sentence-gap", type=float, default=0.08, help="silence kept after . ! ? (s)")
    ap.add_argument("--comma-gap", type=float, default=0.05, help="silence kept after , ; : (s)")
    ap.add_argument("--max-gap", type=float, default=0.04, help="silence kept between other words (s)")
    a = ap.parse_args()
    sr, x = wavfile.read(a.wav)
    if x.dtype == np.int16:
        x = x.astype(np.float32) / 32768.0
    elif x.dtype == np.int32:
        x = x.astype(np.float32) / 2147483648.0
    words = json.load(open(a.words, encoding="utf-8"))
    y, nw, nc = tighten(x, sr, words, a.sentence_gap, a.comma_gap, a.max_gap)
    wavfile.write(a.out, sr, (np.clip(y, -1, 1) * 32767.0).astype(np.int16))
    json.dump(nw, open(a.words_out, "w", encoding="utf-8"), indent=0)
    d0, d1 = len(x) / sr, len(y) / sr
    w0 = len(words) / max(1e-6, words[-1]["end"] - words[0]["start"]); w1 = len(nw) / max(1e-6, nw[-1]["end"] - nw[0]["start"])
    print(f"tighten: {nc} cuts, {d0:.2f} s -> {d1:.2f} s ({(1 - d1 / d0) * 100:.0f} % shorter), {w0:.2f} -> {w1:.2f} words/s")


if __name__ == "__main__":
    main()
