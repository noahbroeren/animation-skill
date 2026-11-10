#!/usr/bin/env python3
"""Procedural SFX synthesis (deterministic, royalty-free by construction).

  py sfx.py pack OUT_DIR            # writes the standard pack (48 kHz stereo WAV)
  py sfx.py one whoosh OUT.wav --dur 0.6 --seed 3

Sounds: whoosh, swish, pop, click, impact, thud, riser, chime, ding, footstep,
sparkle, roomtone, wind, tick, boing, rumble, splash, creak. Real recordings (Freesound CC0,
BBC SFX under licence, own foley) usually sound better: use these as the
always-available baseline and for precise sync hits.
"""
from __future__ import annotations

import argparse
import os

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000


def _t(d):
    return np.arange(int(SR * d)) / SR


def _env(n, a=0.005, r=0.2, shape=2.0):
    t = np.arange(n) / SR
    att = np.clip(t / max(a, 1e-4), 0, 1)
    dec = np.exp(-np.maximum(0, t - a) / max(r, 1e-4) * shape)
    return att * dec


def _noise(n, rng, color="white"):
    x = rng.standard_normal(n)
    if color == "pink":
        X = np.fft.rfft(x)
        f = np.maximum(np.arange(len(X)), 1)
        x = np.fft.irfft(X / np.sqrt(f), n)
    elif color == "brown":
        x = np.cumsum(x)
        x -= np.convolve(x, np.ones(2000) / 2000, "same")
    return x / (np.abs(x).max() + 1e-9)


def _bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [max(20, lo), min(SR / 2 - 100, hi)], "band", fs=SR, output="sos"), x)


def _lp(x, f, order=2):
    return sosfilt(butter(order, min(f, SR / 2 - 100), "low", fs=SR, output="sos"), x)


def _sweep_filter(x, f0, f1, q=1.5, steps=64):
    out = np.zeros_like(x)
    n = len(x)
    seg = max(1, n // steps)
    for i in range(0, n, seg):
        c = f0 * (f1 / f0) ** (i / n)
        y = _bp(x[max(0, i - seg): i + seg], c / q, c * q)
        out[i:i + seg] = y[-len(out[i:i + seg]):] if len(y) >= len(out[i:i + seg]) else 0
    return out


def _moving_band(x, f_from, f_to, width_oct=0.9, peak_frac=0.45):
    """Time-varying log-Gaussian band-pass via STFT (smooth, no zipper steps): centre glides f_from -> f_to.
    Technique adapted from claude-animated-shorts sfx_gen.py (MIT)."""
    from scipy.signal import istft, stft
    nper = 1024
    f, t, Z = stft(x, fs=SR, nperseg=nper, noverlap=nper - 256)
    u = np.clip(t / max(t[-1], 1e-6), 0, 1)
    centre = f_from * (f_to / f_from) ** u
    lf = np.log2(np.maximum(f, 20.0))[:, None]
    gain = np.exp(-0.5 * ((lf - np.log2(centre)[None, :]) / (width_oct / 2)) ** 2)
    _, y = istft(Z * gain, fs=SR, nperseg=nper, noverlap=nper - 256)
    return y[: len(x)] if len(y) >= len(x) else np.pad(y, (0, len(x) - len(y)))


def whoosh(dur=0.6, seed=0, f0=300, f1=4000, peak=0.45):
    """Camera-move whoosh. Peak at `peak` x dur (anchor = peak*dur seconds in mix plans): rise (t/peak)^2.2 then
    exponential tail, plus a thin 'air' layer."""
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    body = _moving_band(_noise(n, rng, "pink"), f0, f1)
    air = _bp(_noise(n, rng), 3500, 12000) * 0.25
    t = np.linspace(0, 1, n)
    env = np.where(t < peak, (t / peak) ** 2.2, np.exp(-(t - peak) / max(1e-3, (1 - peak) * 0.35)))
    return (body + air * env) * env


def creak(dur=0.8, seed=17, f0=180, material="wood"):
    """Stick-slip creak: irregular impulse train through a resonator bank (wood/metal)."""
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    imp = np.zeros(n)
    t = 0.0
    while t < dur:
        imp[int(t * SR)] = 0.6 + 0.4 * rng.random()
        t += (1.0 / (f0 * (0.7 + 0.6 * np.sin(np.pi * t / dur)))) * (0.8 + 0.4 * rng.random())
    modes = [(1.0, 1.0), (2.3, 0.5), (3.9, 0.3), (6.1, 0.15)] if material == "wood" else [(1.0, 1.0), (2.76, 0.6), (5.4, 0.4), (8.9, 0.25)]
    out = np.zeros(n)
    base = 420 if material == "wood" else 900
    for m, a in modes:
        out += a * _bp(imp, base * m * 0.94, base * m * 1.06, 2)
    return out * np.sin(np.pi * np.linspace(0, 1, n)) ** 0.6


def swish(dur=0.3, seed=1):
    return whoosh(dur, seed, 1200, 7000)


def pop(dur=0.12, seed=2, f=600):
    t = _t(dur)
    freq = f * (1 + 2.5 * np.exp(-t * 60))
    ph = 2 * np.pi * np.cumsum(freq) / SR
    return np.sin(ph) * _env(len(t), 0.001, 0.03, 1.5)


def click(dur=0.03, seed=3):
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    return _bp(_noise(n, rng), 2000, 9000) * _env(n, 0.0005, 0.006)


def impact(dur=0.9, seed=4):
    rng = np.random.default_rng(seed)
    t = _t(dur)
    body = np.sin(2 * np.pi * np.cumsum(55 + 90 * np.exp(-t * 18)) / SR) * _env(len(t), 0.002, 0.25)
    crack = _lp(_noise(len(t), rng), 3500) * _env(len(t), 0.001, 0.05)
    return 0.8 * body + 0.5 * crack


def thud(dur=0.4, seed=5):
    t = _t(dur)
    return np.sin(2 * np.pi * np.cumsum(70 + 40 * np.exp(-t * 30)) / SR) * _env(len(t), 0.002, 0.08)


def riser(dur=2.0, seed=6):
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    t = np.linspace(0, 1, n)
    x = _sweep_filter(_noise(n, rng, "pink"), 200, 6000) * t ** 2
    tone = np.sin(2 * np.pi * np.cumsum(110 * 2 ** (t * 2)) / SR) * t ** 3 * 0.3
    return x + tone


def chime(dur=1.6, seed=7, f=880):
    t = _t(dur)
    out = np.zeros_like(t)
    for k, (m, a) in enumerate(((1, 1), (2.76, 0.5), (5.4, 0.25), (8.93, 0.12))):
        out += a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * (2 + 3 * k))
    return out * _env(len(t), 0.002, 10, 0.0001)


def ding(dur=1.0, seed=8):
    return chime(dur, seed, 1320)


def footstep(dur=0.18, seed=9):
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    return _lp(_noise(n, rng, "brown"), 900) * _env(n, 0.002, 0.04) + 0.3 * _bp(_noise(n, rng), 1500, 5000) * _env(n, 0.001, 0.015)


def sparkle(dur=1.0, seed=10):
    rng = np.random.default_rng(seed)
    out = np.zeros(int(SR * dur))
    for _ in range(14):
        st = int(rng.random() * len(out) * 0.7)
        c = chime(0.4, seed, 1500 + rng.random() * 2500) * (0.3 + 0.5 * rng.random())
        out[st:st + len(c)] += c[: len(out) - st]
    return out


def roomtone(dur=10.0, seed=11):
    rng = np.random.default_rng(seed)
    return _lp(_noise(int(SR * dur), rng, "pink"), 1800) * 0.15


def wind(dur=10.0, seed=12):
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    x = _sweep_filter(_noise(n, rng, "pink"), 250, 900, 2.0)
    lfo = 0.6 + 0.4 * np.sin(2 * np.pi * 0.17 * np.arange(n) / SR + 1.3)
    return x * lfo


def tick(dur=0.05, seed=13):
    return pop(dur, seed, 2400) * 0.6


def boing(dur=0.6, seed=14):
    t = _t(dur)
    f = 180 * (1 + 0.5 * np.sin(2 * np.pi * 9 * t) * np.exp(-t * 5))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(len(t), 0.003, 0.25)


def rumble(dur=3.0, seed=15):
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    return _lp(_noise(n, rng, "brown"), 120, 4) * np.sin(np.pi * np.linspace(0, 1, n)) * 1.5


def splash(dur=1.1, seed=16):
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    body = _lp(_noise(n, rng, "pink"), 2500) * _env(n, 0.004, 0.18)
    out = body * 0.9
    for _ in range(9):  # bubbles: short rising sine chirps
        st = int((0.06 + rng.random() * 0.6) * SR)
        d = int((0.04 + rng.random() * 0.06) * SR)
        t = np.arange(d) / SR
        f0 = 500 + rng.random() * 900
        b = np.sin(2 * np.pi * np.cumsum(f0 * (1 + 3 * t / (d / SR))) / SR) * np.exp(-t * 40) * 0.35
        out[st:st + d] += b[: max(0, min(d, n - st))]
    return out


SOUNDS = {k: v for k, v in globals().items() if k in (
    "whoosh", "swish", "pop", "click", "impact", "thud", "riser", "chime", "ding", "footstep", "sparkle",
    "roomtone", "wind", "tick", "boing", "rumble", "splash", "creak")}


def save(path: str, x: np.ndarray, peak_db: float = -3.0, pan: float = 0.0):
    x = x / (np.abs(x).max() + 1e-9) * 10 ** (peak_db / 20)
    l, r = x * np.sqrt((1 - pan) / 2), x * np.sqrt((1 + pan) / 2)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    wavfile.write(path, SR, np.stack([l, r], 1).astype(np.float32))
    return path


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("pack")
    p.add_argument("out")
    p = sub.add_parser("one")
    p.add_argument("name", choices=sorted(SOUNDS))
    p.add_argument("out")
    p.add_argument("--dur", type=float)
    p.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    if a.cmd == "pack":
        for name, fn in SOUNDS.items():
            print(save(os.path.join(a.out, f"{name}.wav"), fn(), -6.0 if name in ("roomtone", "wind", "rumble") else -3.0))
    else:
        kw = {"seed": a.seed}
        if a.dur:
            kw["dur"] = a.dur
        print(save(a.out, SOUNDS[a.name](**kw)))


if __name__ == "__main__":
    main()
