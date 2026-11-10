#!/usr/bin/env python3
"""Mix + master from a JSON plan. Frame-accurate SFX, voice-keyed ducking, loudness mastering.

  py mix.py plan.json --out master.wav [--stems DIR]

plan.json:
{
  "duration": 23.5,            # seconds (use timeline.json durationInFrames / fps)
  "fps": 30,
  "target_lufs": -14, "true_peak": -1.0,
  "tracks": [
    {"file": "vo.wav", "start": 0.25, "gain_db": 0, "role": "voice"},
    {"file": "bed.wav", "start": 0, "gain_db": -14, "role": "music", "fade_in": 0.5, "fade_out": 2,
     "duck_db": -8, "lowpass": 9000},
    {"file": "sfx/whoosh.wav", "at_frame": 132, "gain_db": -8, "role": "sfx", "pan": -0.3, "highpass": 150},
    {"file": "sfx/roomtone.wav", "start": 0, "gain_db": -30, "role": "ambience", "loop": true}
  ]
}
Rules baked in (from the reference/skill studies): voice sits ~8-10 dB over music;
music ducks under the voice with 80 ms attack / 400 ms release; SFX land on exact
frames; master to -14 LUFS integrated (YouTube/TikTok normalise there) with a
-1 dBTP ceiling; output length is exactly `duration` so A/V never drifts.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, resample_poly, sosfilt

SR = 48000


def load(path: str) -> np.ndarray:
    """Any audio file -> float32 stereo 48 kHz (via ffmpeg for mp3/m4a/ogg)."""
    if not path.lower().endswith(".wav"):
        tmp = path + ".48k.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ar", str(SR), "-ac", "2", "-c:a", "pcm_f32le", tmp], check=True)
        path = tmp
    sr, x = wavfile.read(path)
    if x.dtype.kind == "i":
        x = x.astype(np.float32) / np.iinfo(x.dtype).max
    x = x.astype(np.float32)
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    if sr != SR:
        from math import gcd
        g = gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g, axis=0).astype(np.float32)
    return x[:, :2]


def filt(x, kind, f):
    return sosfilt(butter(2, f, kind, fs=SR, output="sos"), x, axis=0).astype(np.float32)


def envelope(x: np.ndarray, attack=0.08, release=0.4, thr_db=-40.0) -> np.ndarray:
    """0..1 'voice present' envelope with attack/release smoothing."""
    mono = np.abs(x).mean(axis=1)
    hop = 480
    n = max(1, len(mono) // hop)
    rms = np.array([np.sqrt(np.mean(mono[i * hop:(i + 1) * hop] ** 2) + 1e-12) for i in range(n)])
    on = (20 * np.log10(rms + 1e-9) > thr_db).astype(np.float32)
    a, r = np.exp(-hop / (SR * attack)), np.exp(-hop / (SR * release))
    env = np.zeros_like(on)
    for i in range(1, n):
        c = a if on[i] > env[i - 1] else r
        env[i] = c * env[i - 1] + (1 - c) * on[i]
    return np.interp(np.arange(len(mono)), np.arange(n) * hop, env).astype(np.float32)


def mix(plan: dict, base_dir: str, stems_dir: str | None = None) -> np.ndarray:
    n = int(round(plan["duration"] * SR))
    fps = plan.get("fps", 30)
    buses = {r: np.zeros((n, 2), np.float32) for r in ("voice", "music", "sfx", "ambience")}
    for tr in plan["tracks"]:
        x = load(os.path.join(base_dir, tr["file"]))
        if tr.get("highpass"):
            x = filt(x, "high", tr["highpass"])
        if tr.get("lowpass"):
            x = filt(x, "low", tr["lowpass"])
        start = tr["at_frame"] / fps if "at_frame" in tr else tr.get("start", 0.0)
        s = int(round(start * SR))
        if tr.get("loop"):
            reps = int(np.ceil((n - s) / max(1, len(x)))) + 1
            x = np.tile(x, (reps, 1))
        x = x[: max(0, n - s)]
        g = 10 ** (tr.get("gain_db", 0) / 20)
        x = x * g
        if tr.get("fade_in"):
            k = min(len(x), int(tr["fade_in"] * SR))
            x[:k] *= np.linspace(0, 1, k)[:, None]
        if tr.get("fade_out"):
            k = min(len(x), int(tr["fade_out"] * SR))
            x[-k:] *= np.linspace(1, 0, k)[:, None]
        pan = tr.get("pan", 0.0)
        if pan:
            x = x * np.array([np.sqrt((1 - pan) / 2) * 1.414, np.sqrt((1 + pan) / 2) * 1.414], np.float32)
        role = tr.get("role", "sfx")
        if s < n and len(x):
            buses[role][s:s + len(x)] += x
    # duck music + ambience under the voice
    v_env = envelope(buses["voice"]) if np.abs(buses["voice"]).max() > 0 else np.zeros(n, np.float32)
    duck_db = min([t.get("duck_db", -8) for t in plan["tracks"] if t.get("role") == "music"] or [-8])
    duck = 10 ** ((duck_db * v_env) / 20)
    buses["music"] *= duck[:, None]
    buses["ambience"] *= (10 ** ((duck_db * 0.5 * v_env) / 20))[:, None]
    if stems_dir:
        os.makedirs(stems_dir, exist_ok=True)
        for k, v in buses.items():
            wavfile.write(os.path.join(stems_dir, f"{k}.wav"), SR, v)
    return sum(buses.values())


def master(x: np.ndarray, out: str, lufs=-14.0, tp=-1.0):
    raw = out + ".premaster.wav"
    wavfile.write(raw, SR, x.astype(np.float32))
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-i", raw, "-af", f"loudnorm=I={lufs}:TP={tp}:LRA=11:print_format=json",
                        "-f", "null", "-"], capture_output=True, text=True)
    m = json.loads(re.findall(r"\{[^{}]+\}", r.stderr)[-1])
    af = (f"loudnorm=I={lufs}:TP={tp}:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
          f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    n = len(x)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af", af + f",aresample={SR},alimiter=limit={10 ** (tp / 20):.4f}:level=disabled",
                    "-ar", str(SR), "-c:a", "pcm_s24le", "-t", f"{n / SR:.6f}", out], check=True)
    os.unlink(raw)
    print(f"{out}: mastered to {lufs} LUFS / {tp} dBTP (measured input {m['input_i']} LUFS)")
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("plan")
    ap.add_argument("--out", required=True)
    ap.add_argument("--stems")
    a = ap.parse_args()
    plan = json.load(open(a.plan, encoding="utf-8"))
    x = mix(plan, os.path.dirname(os.path.abspath(a.plan)), a.stems)
    master(x, a.out, plan.get("target_lufs", -14.0), plan.get("true_peak", -1.0))


if __name__ == "__main__":
    main()
