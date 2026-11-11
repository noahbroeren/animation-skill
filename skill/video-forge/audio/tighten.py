#!/usr/bin/env python3
"""Tighten a narration take: cap every pause between words, keep the words untouched.

  py tighten.py vo_raw.wav --words words_raw.json --out vo.wav --words-out words.json [--max-gap 0.2] [--sentence-gap 0.3]

Why (measured, references/styles/toonworld-explainer.casestudy.md): the reference narrates at 3.1-3.9 words/s with
pauses capped near 0.2 s; an ElevenLabs take usually lands at 2.6-2.8 w/s because of 0.4-0.9 s sentence pauses.
Cutting INSIDE the silence (never inside a word) keeps the performance and buys 10-15 % of the runtime.

- A gap between two words longer than --max-gap is shortened to it (--sentence-gap after . ! ? : and before a line
  of another speaker), cutting out the middle of the gap with 12 ms cosine crossfades at the quietest sample nearby.
- Word times in --words-out are shifted to match, so captions and cues stay exact (no second alignment needed).
- Leading silence is trimmed to 40 ms, the tail to 150 ms.
Prints the old and new duration and words/s.
"""
from __future__ import annotations

import argparse
import json

import numpy as np
from scipy.io import wavfile


def tighten(x: np.ndarray, sr: int, words: list[dict], max_gap=0.2, sentence_gap=0.3, xf=0.012):
    n = len(x)
    mono = x if x.ndim == 1 else x.mean(axis=1)
    env = np.abs(mono.astype(np.float64))
    k = max(1, int(sr * 0.01))
    c = np.cumsum(np.pad(env, (k, 0)))
    env = (c[k:] - c[:-k]) / k

    def quiet(a: float, b: float) -> int:
        """sample index of the quietest 10 ms window inside [a, b] seconds"""
        i0, i1 = max(0, int(a * sr)), min(n - 1, int(b * sr))
        return i0 if i1 <= i0 else i0 + int(np.argmin(env[i0:i1]))

    cuts: list[tuple[int, int]] = []  # sample ranges to remove
    lead = words[0]["start"]
    if lead > 0.06:
        cuts.append((0, int((lead - 0.04) * sr)))
    for a, b in zip(words, words[1:]):
        gap = b["start"] - a["end"]
        cap = sentence_gap if a["word"].rstrip('"\'').endswith((".", "!", "?", ":")) else max_gap
        if gap > cap + 0.03:
            keep = cap / 2
            c0 = quiet(a["end"] + keep * 0.6, a["end"] + keep * 1.2)
            c1 = c0 + int((gap - cap) * sr)
            cuts.append((c0, min(c1, int((b["start"] - 0.02) * sr))))
    tail = words[-1]["end"] + 0.15
    if tail * sr < n:
        cuts.append((int(tail * sr), n))
    out, pos, removed, shifts = [], 0, 0, []
    nx = int(xf * sr)
    for c0, c1 in cuts:
        if c1 <= c0 or c0 < pos:
            continue
        seg = x[pos:c0].astype(np.float64)
        if out and len(seg) > nx and len(out[-1]) > nx:  # crossfade the join
            w = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, nx))
            w = w if x.ndim == 1 else w[:, None]
            out[-1][-nx:] = out[-1][-nx:] * (1 - w) + seg[:nx] * w
            seg = seg[nx:]
            removed += nx
        out.append(seg)
        removed += c1 - c0
        shifts.append((c1 / sr, removed / sr))
        pos = c1
    if pos < n:
        out.append(x[pos:].astype(np.float64))
    y = np.concatenate(out) if out else x.astype(np.float64)

    def shift(t: float) -> float:
        s = 0.0
        for at, rem in shifts:
            if t >= at - 1e-6:
                s = rem
            else:
                break
        return max(0.0, t - s)

    new_words = [{**w, "start": round(shift(w["start"]), 3), "end": round(shift(w["end"]), 3)} for w in words]
    return y.astype(x.dtype if np.issubdtype(x.dtype, np.floating) else np.float64), new_words


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("wav")
    ap.add_argument("--words", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--words-out", required=True)
    ap.add_argument("--max-gap", type=float, default=0.2)
    ap.add_argument("--sentence-gap", type=float, default=0.3)
    a = ap.parse_args()
    sr, x = wavfile.read(a.wav)
    scale = 1.0
    if x.dtype == np.int16:
        x, scale = x.astype(np.float32) / 32768.0, 32767.0
    elif x.dtype == np.int32:
        x, scale = x.astype(np.float32) / 2147483648.0, 32767.0
    words = json.load(open(a.words, encoding="utf-8"))
    y, nw = tighten(x, sr, words, a.max_gap, a.sentence_gap)
    wavfile.write(a.out, sr, (np.clip(y, -1, 1) * 32767.0).astype(np.int16))
    json.dump(nw, open(a.words_out, "w", encoding="utf-8"), indent=0)
    d0, d1 = len(x) / sr, len(y) / sr
    print(f"tighten: {d0:.2f} s -> {d1:.2f} s ({(1 - d1 / d0) * 100:.0f} % shorter), {len(words) / d0:.2f} -> {len(words) / d1:.2f} words/s")


if __name__ == "__main__":
    main()
