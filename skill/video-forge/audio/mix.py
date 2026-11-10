#!/usr/bin/env python3
"""Mix + master from a JSON plan: loudness-relative levels, words-keyed ducking, per-section music,
distance acoustics, shared reverb, true-peak mastering, stems, and a margin report.

  py mix.py plan.json --out master.wav [--stems DIR]

plan.json:
{
  "duration": 23.5, "fps": 30, "target_lufs": -14, "true_peak": -1.0,
  "words": "words.json", "words_offset": 0.15,          # duck the music from WORD timings (not audio)
  "duck_db": -3,                                        # gentle; section levels do the real levelling
  "music_sections": [[0, 8.2, -10], [8.2, 14, -12]],    # music bed LU relative to the voice per section
  "rides": [[3.65, 4.3, -3]],                           # extra music dips under quiet sentence ends
  "reverb": {"rt60": 1.1, "wet": 0.55},
  "tracks": [
    {"file": "vo.wav", "start": 0.15, "role": "voice"},
    {"file": "bed.wav", "role": "music", "fade_in": 0.5, "fade_out": 2},
    {"file": "sfx/whoosh.wav", "at_frame": 132, "naive_lu": -11, "anchor": 0.09, "pan": -0.3},
    {"file": "sfx/impact.wav", "at_frame": 300, "naive_lu": 0, "distance_m": 12},
    {"file": "sfx/roomtone.wav", "role": "ambience", "naive_lu": -30, "loop": true}
  ]
}
Level model (adapted from claude-animated-shorts, MIT): every SFX/ambience is set by LOUDNESS relative to the
voice ("naive_lu"); events get a further -6 dB ("applied" = naive - 6, beds are not reduced). Ladder:
beds -26..-30, big hits 0..-6, details -12..-20. "anchor" = seconds into the file where the transient/peak is,
so the PEAK lands on the frame. Legacy "gain_db" (absolute) still works.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, resample_poly, sosfilt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dsp  # noqa: E402

SR = dsp.SR


def load(path: str) -> np.ndarray:
    """Any audio file -> float64 (2, n) at 48 kHz (ffmpeg for mp3/m4a/ogg)."""
    if not path.lower().endswith(".wav"):
        tmp = path + ".48k.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ar", str(SR), "-ac", "2", "-c:a", "pcm_f32le", tmp], check=True)
        path = tmp
    sr, x = wavfile.read(path)
    if x.dtype.kind == "i":
        x = x.astype(np.float64) / np.iinfo(x.dtype).max
    x = x.astype(np.float64)
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    if sr != SR:
        from math import gcd
        g = gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g, axis=0)
    return x[:, :2].T.copy()


def filt(x, kind, f):
    return sosfilt(butter(2, f, kind, fs=SR, output="sos"), x, axis=-1)


def place(bus: np.ndarray, x: np.ndarray, s: int):
    n = bus.shape[1]
    if s >= n or s + x.shape[1] <= 0:
        return
    a, b = max(0, s), min(n, s + x.shape[1])
    bus[:, a:b] += x[:, a - s:b - s]


def mix(plan: dict, base_dir: str, stems_dir: str | None = None):
    n = int(round(plan["duration"] * SR))
    fps = plan.get("fps", 30)
    buses = {r: np.zeros((2, n)) for r in ("voice", "music", "sfx", "ambience")}
    send = np.zeros(n)
    tracks = plan["tracks"]
    # voice first: everything else is levelled against it
    for tr in [t for t in tracks if t.get("role") == "voice"]:
        x = load(os.path.join(base_dir, tr["file"]))
        if tr.get("highpass"):
            x = filt(x, "high", tr["highpass"])
        place(buses["voice"], x * 10 ** (tr.get("gain_db", 0) / 20), int(round(tr.get("start", 0) * SR)))
    v_ref = dsp.lufs(buses["voice"])
    words_t = []
    if plan.get("words"):
        _w = json.load(open(os.path.join(base_dir, plan["words"]), encoding="utf-8"))
        words_t = [(w["start"] + plan.get("words_offset", 0.0), w["end"] + plan.get("words_offset", 0.0)) for w in _w]
    if not np.isfinite(v_ref):
        v_ref = -20.0
    report = {"voice_lufs": v_ref, "cues": []}
    for tr in tracks:
        role = tr.get("role", "sfx")
        if role == "voice":
            continue
        x = load(os.path.join(base_dir, tr["file"]))
        if tr.get("highpass"):
            x = filt(x, "high", tr["highpass"])
        if tr.get("lowpass"):
            x = filt(x, "low", tr["lowpass"])
        start = tr["at_frame"] / fps if "at_frame" in tr else tr.get("start", 0.0)
        start -= tr.get("anchor", 0.0)  # land the transient/peak on the frame
        s = int(round(start * SR))
        if tr.get("loop"):
            reps = int(np.ceil((n - max(0, s)) / max(1, x.shape[1]))) + 1
            x = np.tile(x, (1, reps))
        x = x[:, : max(0, n - s)] if s >= 0 else x[:, -s: n - s]
        s = max(0, s)
        if x.shape[1] == 0:
            continue
        send_amt = tr.get("send", 0.0)
        gd = 0.0
        if "distance_m" in tr:
            gd, lp, sd = dsp.dist_fx(tr["distance_m"])
            x = filt(x, "low", lp)
            send_amt = max(send_amt, sd)
        is_bed = role in ("ambience", "music") or tr.get("loop")
        lu_vs_voice = None
        if "naive_lu" in tr:  # loudness-relative level (distance gain applied AFTER levelling, else it is undone)
            meas = dsp.lufs(x) if is_bed else dsp.event_loudness(x)
            if np.isfinite(meas):
                applied = tr["naive_lu"] - (0 if is_bed else 6)
                x = x * 10 ** ((v_ref + applied + gd - meas) / 20)
                lu_vs_voice = (dsp.lufs(x) if is_bed else dsp.event_loudness(x)) - v_ref
                if abs(lu_vs_voice - (applied + gd)) > 2.0:
                    report.setdefault("level_errors", []).append({"file": tr["file"], "target": applied + gd, "got": lu_vs_voice})
            else:
                report.setdefault("level_errors", []).append({"file": tr["file"], "target": tr["naive_lu"], "got": None})
        else:
            x = x * 10 ** ((tr.get("gain_db", 0) + gd) / 20)
        if words_t and not is_bed and tr.get("naive_lu", 0) < -8 and not tr.get("on_word"):
            # detail SFX never sit on a spoken word: duck them under words (hits at -8 LU or louder are exempt)
            tt = (np.arange(x.shape[1]) + s) / SR
            on = np.zeros(x.shape[1], bool)
            for w0, w1 in words_t:
                on |= (tt >= w0 - 0.03) & (tt <= w1 + 0.03)
            if on.any():
                x = x * 10 ** (dsp.smooth_steps(on * plan.get("sfx_word_duck_db", -6.0), 0.03) / 20)
        if tr.get("fade_in"):
            k = min(x.shape[1], int(tr["fade_in"] * SR))
            x[:, :k] *= np.linspace(0, 1, k)
        if tr.get("fade_out"):
            k = min(x.shape[1], int(tr["fade_out"] * SR))
            x[:, -k:] *= np.linspace(1, 0, k)
        pan = tr.get("pan", 0.0)
        if pan:
            x = x * np.array([[np.sqrt((1 - pan) / 2) * 1.414], [np.sqrt((1 + pan) / 2) * 1.414]])
        place(buses[role], x, s)
        if send_amt:
            send[s:s + x.shape[1]] += send_amt * x.mean(0)[: n - s]
        report["cues"].append({"file": tr["file"], "t": round(start, 3), "role": role, "naive_lu": tr.get("naive_lu"),
                               "lu_vs_voice": None if lu_vs_voice is None else round(lu_vs_voice, 1)})

    # music: per-section level vs voice, words-keyed duck, rides
    music_db = np.zeros(n)
    for a, b, target in plan.get("music_sections", []):
        sl = slice(int(a * SR), int(b * SR))
        Lm, Lv = dsp.lufs(buses["music"][:, sl]), dsp.lufs(buses["voice"][:, sl])
        if np.isfinite(Lm) and np.isfinite(Lv):
            music_db[sl] = Lv + target - Lm
    if plan.get("music_sections"):
        music_db = dsp.smooth_steps(music_db, 0.4)
    for a, b, d in plan.get("rides", []):
        r = np.zeros(n)
        r[int(a * SR):int(b * SR)] = d
        music_db += dsp.smooth_steps(r, 0.06)
    words = None
    if plan.get("words"):
        words = json.load(open(os.path.join(base_dir, plan["words"]), encoding="utf-8"))
        off = plan.get("words_offset", 0.0)
        words = [{"start": w["start"] + off, "end": w["end"] + off} for w in words]
        duck = dsp.duck_curve(words, n, plan.get("duck_db", -3.0))
        music_db += duck
        buses["ambience"] *= 10 ** ((duck * 0.5) / 20)
    buses["music"] *= 10 ** (music_db / 20)

    rv = plan.get("reverb")
    wet = dsp.reverb(send, dsp.make_ir(rv.get("rt60", 1.1), 3), n, rv.get("wet", 0.55)) if rv and np.abs(send).max() > 0 else 0.0
    buses["sfx"] = buses["sfx"] + wet

    if words:  # speech margin: voice minus bed (music+ambience+sfx) on spoken windows, p10
        Mv = dsp.momentary(buses["voice"])
        Mb = dsp.momentary(buses["music"] + buses["ambience"] + buses["sfx"])
        tc = np.arange(len(Mv)) * 0.01 + 0.2
        k = np.zeros(len(tc), bool)
        for w in words:
            k |= (tc >= w["start"] + 0.03) & (tc <= w["end"] - 0.03)
        if k.any():
            m = (Mv - Mb)[k]
            report["speech_margin_p10"] = float(np.percentile(m, 10))
            report["speech_margin_median"] = float(np.median(m))
    if stems_dir:
        os.makedirs(stems_dir, exist_ok=True)
        for k2, v in buses.items():
            wavfile.write(os.path.join(stems_dir, f"{k2}.wav"), SR, v.T.astype(np.float32))
    return sum(buses.values()), report


def write_master(x: np.ndarray, out: str, lufs_target=-14.0, tp=-1.0) -> dict:
    y, info = dsp.master(x, lufs_target, tp)
    wavfile.write(out, SR, (np.clip(y, -1, 1).T * 2147483647.0).astype(np.int32))  # full-scale 32-bit PCM
    # cross-check with ffmpeg's EBU R128 meter
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", out, "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    tail = r[r.rfind("Summary:"):]
    info["ffmpeg_check"] = " ".join(l.strip() for l in tail.splitlines() if l.strip().startswith(("I:", "Peak:", "LRA:")))
    import re
    m = re.search(r"I:\s*(-?[\d.]+) LUFS", tail)
    if m and abs(float(m.group(1)) - info["lufs"]) > 0.5:  # two independent meters must agree
        raise SystemExit(f"loudness cross-check FAILED: ours {info['lufs']:.2f} vs ffmpeg {m.group(1)} LUFS ({out})")
    return info


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("plan")
    ap.add_argument("--out", required=True)
    ap.add_argument("--stems")
    a = ap.parse_args()
    plan = json.load(open(a.plan, encoding="utf-8"))
    x, rep = mix(plan, os.path.dirname(os.path.abspath(a.plan)), a.stems)
    info = write_master(x, a.out, plan.get("target_lufs", -14.0), plan.get("true_peak", -1.0))
    rep.update(info)
    json.dump(rep, open(os.path.splitext(a.out)[0] + "_mixreport.json", "w"), indent=1, default=float)
    sm = rep.get("speech_margin_p10")
    print(f"{a.out}: {info['lufs']:.2f} LUFS, TP {info['true_peak_dbtp']:.2f} dBTP (ffmpeg: {info['ffmpeg_check']})"
          + (f"; speech margin p10 {sm:.1f} LU" if sm is not None else ""))


if __name__ == "__main__":
    main()
