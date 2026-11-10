"""Audio DSP core: BS.1770-4 loudness, momentary loudness, oversampled true-peak limiter, mastering loop,
synthetic reverb IR, distance acoustics, words-keyed ducking curve.

Techniques adapted from the MIT-licensed claude-animated-shorts audio templates (c) 2026 Mr omi
(dsp.py / mix.py / timeline.py): K-weighted gated loudness, 4x-oversampled look-ahead limiter with a
gain-iteration master loop, decaying-noise IR with faster HF decay, dist_fx(d), words.json ducking.
All signals here are float arrays shaped (2, n) at 48 kHz unless noted.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage, signal

SR = 48000
_KB1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
_KA1 = [1.0, -1.69065929318241, 0.73248077421585]
_KB2 = [1.0, -2.0, 1.0]
_KA2 = [1.0, -1.99004745483398, 0.99007225036621]


def as2(x: np.ndarray) -> np.ndarray:
    """(n,) / (n,2) / (2,n) -> (2,n) float64."""
    x = np.asarray(x, np.float64)
    if x.ndim == 1:
        return np.stack([x, x])
    return x.T if x.shape[0] != 2 and x.shape[1] == 2 else x


def _kweight(x):
    return signal.lfilter(_KB2, _KA2, signal.lfilter(_KB1, _KA1, x, axis=-1), axis=-1) ** 2


def lufs(x: np.ndarray) -> float:
    """Integrated loudness (BS.1770-4: 400 ms blocks, 75 % overlap, -70 abs / -10 rel gates)."""
    x = as2(x)
    if x.shape[1] < 19200:
        return -np.inf
    z = _kweight(x)
    c = np.concatenate([np.zeros((2, 1)), np.cumsum(z, -1)], -1)
    w, h = 19200, 4800
    s = np.arange(0, x.shape[1] - w + 1, h)
    e = ((c[:, s + w] - c[:, s]) / w).sum(0)
    L = -0.691 + 10 * np.log10(e + 1e-30)
    k = L > -70
    if not k.any():
        return -np.inf
    k &= L > -0.691 + 10 * np.log10(e[k].mean()) - 10
    return float(-0.691 + 10 * np.log10(e[k].mean()))


def momentary(x: np.ndarray, hop_s: float = 0.01) -> np.ndarray:
    """Momentary loudness (400 ms window) every hop_s seconds (LUFS)."""
    x = as2(x)
    z = _kweight(x)
    c = np.concatenate([np.zeros((2, 1)), np.cumsum(z, -1)], -1)
    w, h = 19200, int(hop_s * SR)
    if x.shape[1] < w:
        return np.array([-np.inf])
    s = np.arange(0, x.shape[1] - w + 1, h)
    e = ((c[:, s + w] - c[:, s]) / w).sum(0)
    return -0.691 + 10 * np.log10(e + 1e-30)


def true_peak_db(x: np.ndarray) -> float:
    up = signal.resample_poly(as2(x), 4, 1, axis=-1)
    return float(20 * np.log10(np.abs(up).max() + 1e-12))


def tp_limit(x: np.ndarray, ceil_db: float = -1.0, look: float = 0.003, rel: float = 0.08) -> np.ndarray:
    """Look-ahead limiter on 4x-oversampled peaks (true-peak safe)."""
    x = as2(x)
    n = x.shape[1]
    up = np.abs(signal.resample_poly(x, 4, 1, axis=-1)).max(0)
    pk = np.pad(up, (0, max(0, 4 * n - len(up))))[: 4 * n].reshape(n, 4).max(1)
    g = np.minimum(1.0, 10 ** (ceil_db / 20) / np.maximum(pk, 1e-12))
    L = 2 * int(look * SR) + 1
    g = ndimage.minimum_filter1d(g, L)
    a = np.exp(-1 / (rel * SR))
    g = np.minimum(g, 1 - signal.lfilter([1 - a], [1, -a], 1 - g))  # release
    g = ndimage.uniform_filter1d(g, L)
    return x * np.minimum(g, 1.0)


def master(x: np.ndarray, target: float = -14.0, ceil_db: float = -1.0) -> tuple[np.ndarray, dict]:
    """Gain + true-peak limit, iterated until within 0.02 LU of target."""
    x = as2(x)
    L0 = lufs(x)
    G = target - L0 if np.isfinite(L0) else 0.0
    y = x
    for _ in range(6):
        y = tp_limit(x * 10 ** (G / 20), ceil_db)
        d = target - lufs(y)
        if abs(d) < 0.02:
            break
        G += d
    return y, {"input_lufs": L0, "gain_db": G, "lufs": lufs(y), "true_peak_dbtp": true_peak_db(y)}


def make_ir(rt60: float = 1.1, seed: int = 1, pre: float = 0.012, hf: float = 1.6) -> np.ndarray:
    """Stereo decaying-noise reverb IR; highs decay `hf` times faster than lows."""
    r = np.random.default_rng(seed)
    n = int(rt60 * 1.25 * SR)
    t = np.arange(n) / SR
    ir = r.standard_normal((2, n)) * np.exp(-6.91 * t / rt60)
    sos = signal.butter(1, 3000, fs=SR, output="sos")
    m = np.clip(t / (rt60 / hf), 0, 1)
    for c in range(2):
        lo = signal.sosfilt(sos, ir[c])
        ir[c] = ir[c] * (1 - m) + lo * m
    fade = np.minimum(1, t / 0.02)
    ir *= fade
    ir /= np.sqrt((ir ** 2).sum() / 2)
    return np.concatenate([np.zeros((2, int(pre * SR))), ir], 1)


def reverb(send_mono: np.ndarray, ir: np.ndarray, n: int, wet: float = 0.55) -> np.ndarray:
    out = np.stack([signal.fftconvolve(send_mono, ir[c])[:n] for c in range(2)])
    out = signal.sosfilt(signal.butter(2, 25, "high", fs=SR, output="sos"), out, axis=-1)
    return wet * out


def dist_fx(d: float) -> tuple[float, float, float]:
    """Camera distance (m) -> (gain dB, lowpass Hz, reverb send). Close = dry & bright, far = quiet, dull, wet."""
    d = max(d, 3.5)
    return (-14 * np.log10(d / 3.5), float(np.clip(17000 * (3.5 / d) ** 0.55, 1800, 17000)),
            0.06 + 0.45 * float(np.clip(np.log(d / 3.5) / np.log(25), 0, 1)))


def duck_curve(words: list[dict], n: int, depth: float = -3.0, pre: float = 0.08, post: float = 0.12,
               att: float = 0.07, rel: float = 0.45, merge: float = 0.3, ctrl: int = 1000) -> np.ndarray:
    """Gain curve in dB keyed from word timings (not from audio): duck while words are spoken."""
    sp: list[list[float]] = []
    for w in words:
        if sp and w["start"] - sp[-1][1] < merge:
            sp[-1][1] = max(sp[-1][1], w["end"])
        else:
            sp.append([w["start"], w["end"]])
    nc = int(n / SR * ctrl) + 2
    va = np.zeros(nc)
    for s, e in sp:
        va[max(0, int((s - pre) * ctrl)): int((e + post) * ctrl)] = 1
    ka, kr = 1 - np.exp(-1 / (att * ctrl)), 1 - np.exp(-1 / (rel * ctrl))
    env = np.zeros(nc)
    e = 0.0
    for i, t in enumerate(va):
        e += (t - e) * (ka if t > e else kr)
        env[i] = e
    return np.interp(np.arange(n) / SR, np.arange(nc) / ctrl, depth * env)


def smooth_steps(db: np.ndarray, seconds: float) -> np.ndarray:
    return ndimage.uniform_filter1d(db, max(1, int(seconds * SR)))
