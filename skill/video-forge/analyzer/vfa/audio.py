"""Audio analysis: loudness (EBU R128), dynamics, silences, onsets, tempo, speech/script metrics."""
from __future__ import annotations

import glob
import json
import os
import re

import numpy as np
from scipy.signal import find_peaks, stft

from .mediaio import ebur128, read_audio

SR = 22050


def envelope_db(a: np.ndarray, sr: int = SR, hop_s: float = 0.05) -> np.ndarray:
    hop = int(sr * hop_s)
    if len(a) < hop:
        return np.array([-120.0])
    n = len(a) // hop
    frames = a[: n * hop].reshape(n, hop)
    rms = np.sqrt((frames ** 2).mean(axis=1) + 1e-12)
    return 20 * np.log10(rms + 1e-9)


def silences(env_db: np.ndarray, hop_s: float = 0.05, thr_db: float = -45.0, min_s: float = 0.25) -> list[tuple[float, float]]:
    quiet = env_db < thr_db
    out, i, n = [], 0, len(quiet)
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            if (j - i) * hop_s >= min_s:
                out.append((round(i * hop_s, 3), round(j * hop_s, 3)))
            i = j
        else:
            i += 1
    return out


def onsets_and_tempo(a: np.ndarray, sr: int = SR) -> dict:
    if len(a) < sr:
        return {"onsets": [], "onset_rate": 0.0, "bpm": None, "bpm_confidence": 0.0}
    nfft, hop = 2048, 512
    _, _, Z = stft(a, fs=sr, nperseg=nfft, noverlap=nfft - hop, boundary=None, padded=False)
    mag = np.log1p(np.abs(Z) * 100)
    flux = np.maximum(0, np.diff(mag, axis=1)).sum(axis=0)
    flux = (flux - flux.mean()) / (flux.std() + 1e-9)
    fr = sr / hop
    # adaptive peak picking
    from scipy.ndimage import median_filter
    base = median_filter(flux, size=int(fr * 0.5) | 1)
    peaks, _ = find_peaks(flux - base, height=1.0, distance=max(1, int(fr * 0.06)))
    onset_t = (peaks + 1) * hop / sr
    # tempo: autocorrelation of onset envelope with log-normal prior around 120 bpm
    env = np.maximum(0, flux - base)
    env = env - env.mean()
    ac = np.correlate(env, env, mode="full")[len(env) - 1:]
    ac /= ac[0] + 1e-9
    bpms = np.arange(60, 201)
    lags = fr * 60.0 / bpms
    vals = np.interp(lags, np.arange(len(ac)), ac)
    prior = np.exp(-0.5 * (np.log2(bpms / 120.0) / 0.9) ** 2)
    score = vals * prior
    best = int(np.argmax(score))
    conf = float(vals[best])
    return {
        "onsets": [round(float(t), 3) for t in onset_t],
        "onset_rate": float(len(onset_t) / (len(a) / sr)),
        "bpm": float(bpms[best]) if conf > 0.05 else None,
        "bpm_confidence": conf,
    }


# ------------------------------------------------------------------ speech

def _parse_vtt(path: str) -> list[dict]:
    """Parse YouTube auto-subs into word-ish segments (deduplicating rolling captions)."""
    txt = open(path, encoding="utf-8", errors="ignore").read()
    segs, last = [], ""
    for block in txt.split("\n\n"):
        m = re.search(r"(\d+):(\d\d):(\d\d)\.(\d+) --> (\d+):(\d\d):(\d\d)\.(\d+)", block)
        if not m:
            continue
        g = list(map(int, m.groups()))
        t0 = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
        t1 = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
        lines = [re.sub(r"<[^>]+>", "", l).strip() for l in block.split("\n") if "-->" not in l]
        for l in lines:
            if l and l != last and not (segs and l in segs[-1]["text"]):
                segs.append({"start": t0, "end": t1, "text": l})
                last = l
    return segs


def transcribe(path: str, model: str = "small", language: str | None = None) -> dict | None:
    """Word-timestamped transcript via faster-whisper (GPU if available). None if unavailable."""
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except Exception:
        return None
    m = None
    last_err: Exception | None = None
    # decode with ffmpeg ourselves: faster-whisper's PyAV path breaks across PyAV versions
    pcm = read_audio(path, 16000)
    if pcm.size == 0:
        return {"engine": "failed", "error": "no audio", "segments": [], "words": []}
    for device, ctype in (("cuda", "float16"), ("cpu", "int8")):
        try:
            m = WhisperModel(model, device=device, compute_type=ctype)
            segments, info = m.transcribe(pcm, word_timestamps=True, language=language, vad_filter=True)
            words, segs = [], []
            for s in segments:
                segs.append({"start": s.start, "end": s.end, "text": s.text.strip()})
                for w in s.words or []:
                    words.append({"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word.strip()})
            return {"engine": f"faster-whisper/{model}/{device}", "language": info.language,
                    "segments": segs, "words": words}
        except Exception as e:  # cuda libs missing etc. -> try next
            last_err = e
            continue
    return {"engine": "failed", "error": str(last_err), "segments": [], "words": []}


def speech_metrics(tr: dict, duration: float) -> dict:
    words = tr.get("words") or []
    segs = tr.get("segments") or []
    if not words and segs:  # VTT fallback: approximate per-word times inside segments
        for s in segs:
            toks = s["text"].split()
            for k, t in enumerate(toks):
                a = s["start"] + (s["end"] - s["start"]) * k / max(1, len(toks))
                words.append({"start": a, "end": a + 0.2, "word": t})
    if not words:
        return {"has_speech": False}
    full = " ".join(s["text"] for s in segs) if segs else " ".join(w["word"] for w in words)
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", full) if s.strip()]
    gaps = [words[i + 1]["start"] - words[i]["end"] for i in range(len(words) - 1)]
    gaps = np.array([g for g in gaps if g >= 0] or [0])
    speech_span = words[-1]["end"] - words[0]["start"]
    first3 = [w for w in words if w["start"] < 3.0]
    starts = [s.split()[:2] for s in sentences if len(s.split()) >= 2]
    opener_counts: dict[str, int] = {}
    for st in starts:
        k = " ".join(st).lower().strip(",.!?")
        opener_counts[k] = opener_counts.get(k, 0) + 1
    return {
        "has_speech": True,
        "words": len(words),
        "wps_overall": len(words) / max(1e-6, duration),
        "wps_speaking": len(words) / max(1e-6, speech_span),
        "speech_start_s": words[0]["start"],
        "speech_coverage": float(min(1.0, speech_span / max(1e-6, duration))),
        "pause_median_s": float(np.median(gaps)), "pause_p90_s": float(np.percentile(gaps, 90)),
        "long_pauses": int((gaps > 0.6).sum()),
        "words_first_3s": len(first3),
        "hook": sentences[0] if sentences else "",
        "sentence_words_median": float(np.median([len(s.split()) for s in sentences])) if sentences else 0,
        "sentences": len(sentences),
        "repeated_openers": {k: v for k, v in sorted(opener_counts.items(), key=lambda kv: -kv[1]) if v > 1},
    }


def find_sidecar_subs(video_path: str) -> str | None:
    base = os.path.splitext(video_path)[0]
    c = sorted(glob.glob(glob.escape(base) + "*.vtt"))
    pref = [p for p in c if ".en-orig." in p] + [p for p in c if ".en." in p] + c
    return pref[0] if pref else None


def analyze_audio(path: str, duration: float, out_dir: str, speech: str = "auto",
                  whisper_model: str = "small") -> dict:
    """speech: 'whisper' | 'subs' | 'auto' (subs if sidecar exists else whisper) | 'off'."""
    a = read_audio(path, SR)
    if a.size == 0:
        return {"has_audio": False}
    loud = ebur128(path)
    env = envelope_db(a)
    sil = silences(env)
    sil_total = sum(b - a_ for a_, b in sil)
    ot = onsets_and_tempo(a)
    res = {
        "has_audio": True, **loud,
        "rms_db_median": float(np.median(env)), "rms_db_p10": float(np.percentile(env, 10)),
        "rms_db_p95": float(np.percentile(env, 95)),
        "dynamic_spread_db": float(np.percentile(env, 95) - np.percentile(env, 10)),
        "silence_frac": float(sil_total / max(1e-6, duration)), "silences": sil[:200],
        "onset_rate": ot["onset_rate"], "bpm": ot["bpm"], "bpm_confidence": ot["bpm_confidence"],
    }
    np.save(os.path.join(out_dir, "audio_env_db.npy"), env.astype(np.float32))
    with open(os.path.join(out_dir, "onsets.json"), "w") as f:
        json.dump(ot["onsets"], f)
    tr = None
    if speech != "off":
        sub = find_sidecar_subs(path)
        if speech in ("subs", "auto") and sub:
            tr = {"engine": f"subtitles:{os.path.basename(sub)}", "segments": _parse_vtt(sub), "words": []}
        if tr is None and speech in ("whisper", "auto"):
            tr = transcribe(path, whisper_model)
    if tr:
        with open(os.path.join(out_dir, "transcript.json"), "w", encoding="utf-8") as f:
            json.dump(tr, f, ensure_ascii=False, indent=1)
        res["speech"] = {"engine": tr.get("engine"), **speech_metrics(tr, duration)}
    return res
