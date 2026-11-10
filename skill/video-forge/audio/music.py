#!/usr/bin/env python3
"""Procedural score bed (deterministic). Placeholder-quality but tasteful and royalty-free.

  py music.py --mood warm --bpm 96 --seconds 60 --out bed.wav [--seed 1] [--hits 12.5,30.0]

Moods: warm (major, plucks), curious (lydian, light), tense (minor, pulses),
epic (minor, big pads + toms), playful (major, staccato), night (minor-9 pads).
Each bar change lands on the beat grid; --hits adds accents (stops/booms) at exact
times so music punctuates the edit. For hero productions use a licensed track and
let mix.py duck it under the voice.
"""
from __future__ import annotations

import argparse

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
MOODS = {
    "warm": {"root": 57, "prog": [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], "pluck": True, "kick": True, "bright": 3000},
    "curious": {"root": 60, "prog": [[0, 4, 7, 11], [2, 6, 9], [0, 4, 7, 11], [7, 11, 14]], "pluck": True, "kick": False, "bright": 4000},
    "tense": {"root": 50, "prog": [[0, 3, 7], [0, 3, 8], [-2, 2, 5], [-1, 3, 7]], "pluck": False, "kick": True, "bright": 1800},
    "epic": {"root": 45, "prog": [[0, 3, 7], [-4, 0, 3], [-7, -3, 0], [-2, 2, 5]], "pluck": False, "kick": True, "bright": 2500},
    "playful": {"root": 62, "prog": [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], "pluck": True, "kick": True, "bright": 5000},
    "night": {"root": 52, "prog": [[0, 3, 7, 10, 14], [-4, 0, 3, 7], [-2, 2, 5, 9], [-5, -1, 2, 7]], "pluck": False, "kick": False, "bright": 1500},
}


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lp(x, f):
    return sosfilt(butter(2, f, "low", fs=SR, output="sos"), x)


def pad(freqs, dur, rng):
    t = np.arange(int(SR * dur)) / SR
    out = np.zeros_like(t)
    for f in freqs:
        for det in (-0.12, 0.0, 0.11):
            fr = f * 2 ** (det / 12)
            out += np.sign(np.sin(2 * np.pi * fr * t + rng.random() * 6)) * 0.12 + np.sin(2 * np.pi * fr * t) * 0.5
    a = np.minimum(1, t / 0.6) * np.minimum(1, (dur - t) / 0.4)
    return out * np.clip(a, 0, 1) / max(1, len(freqs))


def pluck(f, dur=0.6):
    n = int(SR * dur)
    period = max(2, int(SR / f))
    rng = np.random.default_rng(int(f))
    buf = rng.uniform(-1, 1, period)
    out = np.zeros(n)
    for i in range(n):  # Karplus-Strong
        out[i] = buf[i % period]
        buf[i % period] = 0.996 * 0.5 * (buf[i % period] + buf[(i + 1) % period])
    return out


def kick(dur=0.4):
    t = np.arange(int(SR * dur)) / SR
    return np.sin(2 * np.pi * np.cumsum(45 + 110 * np.exp(-t * 35)) / SR) * np.exp(-t * 9)


def place(buf, start, x, gain=1.0):
    """Add x into buf at sample `start`, clipped to the buffer (no-op when out of range)."""
    if start >= len(buf) or start + len(x) <= 0:
        return
    a = max(0, start)
    b = min(len(buf), start + len(x))
    buf[a:b] += x[a - start:b - start] * gain


def render(mood="warm", bpm=96, seconds=60.0, seed=1, hits=()):
    m = MOODS[mood]
    rng = np.random.default_rng(seed)
    beat = 60.0 / bpm
    bar = beat * 4
    n = int(SR * seconds)
    L = np.zeros(n)
    R = np.zeros(n)
    bars = int(np.ceil(seconds / bar))
    for b in range(bars):
        chord = m["prog"][b % len(m["prog"])]
        st = int(b * bar * SR)
        p = pad([mtof(m["root"] + c) for c in chord], bar + 0.4, rng)
        place(L, st, p, 0.5)
        place(R, st, np.roll(p, 240), 0.5)
        if m["pluck"]:
            for k in range(8):
                note = m["root"] + 12 + chord[(k * 2 + b) % len(chord)]
                s2 = st + int(k * beat / 2 * SR)
                pl = pluck(mtof(note), 0.5) * (0.25 if k % 2 else 0.35)
                pan = 0.3 if k % 2 else -0.3
                place(L, s2, pl, 1 - pan)
                place(R, s2, pl, 1 + pan)
        if m["kick"]:
            for k in range(4):
                s3 = st + int(k * beat * SR)
                kk = kick() * (0.55 if k % 2 == 0 else 0.3)
                place(L, s3, kk)
                place(R, s3, kk)
    for h in hits:
        s4 = int(h * SR)
        kk = kick(1.2) * 0.9
        place(L, s4, kk)
        place(R, s4, kk)
    L, R = lp(L, m["bright"]), lp(R, m["bright"])
    fade = np.minimum(1, np.arange(n) / (SR * 1.0)) * np.minimum(1, (n - np.arange(n)) / (SR * 2.0))
    out = np.stack([L * fade, R * fade], 1)
    return out / (np.abs(out).max() + 1e-9) * 0.7


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mood", default="warm", choices=sorted(MOODS))
    ap.add_argument("--bpm", type=float, default=96)
    ap.add_argument("--seconds", type=float, default=60)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--hits", default="")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    hits = [float(x) for x in a.hits.split(",") if x.strip()]
    wavfile.write(a.out, SR, render(a.mood, a.bpm, a.seconds, a.seed, hits).astype(np.float32))
    print(a.out)


if __name__ == "__main__":
    main()
