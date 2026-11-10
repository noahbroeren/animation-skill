"""Source separation and mix measurement (`vfa stems`).

With Demucs (htdemucs; torch, CUDA if available) the soundtrack is split into vocals / drums /
bass / other (cached as WAVs in <analysis>/stems/). Measured:
- integrated loudness per stem and for music = drums+bass+other (ffmpeg EBU R128)
- music presence: share of 100 ms hops where the music stem (400 ms RMS) is above -48 dBFS
- voice-to-music margin per sentence (transcript segments, else 1 s voiced chunks): RMS dB of
  vocals minus music over the sentence window (unweighted RMS, ~LU; >= 6 dB keeps words clear)
- SFX / hit density: spectral-flux onsets in the drums and "other" stems and their sum
- "music stops": music drops >= 15 dB under its 3 s running median (or below -55 dBFS) for >= 0.3 s
  after at least 1 s of music -- the deliberate silences before reveals

Without Demucs a clearly labelled HEURISTIC fallback is used: harmonic/percussive median-filter
split of the mix, the music bed measured in speech pauses (transcript word gaps), margin = speech
level minus the interpolated bed level.
"""
from __future__ import annotations

import os
import time
import wave

import numpy as np
from scipy.ndimage import median_filter, percentile_filter

from .audio import onsets_and_tempo
from .extutil import fmt, load_segments, load_words, optional, resolve, save, stats, torch_device, unavailable
from .mediaio import ebur128, probe, read_audio

SR = 44100
HOP = 0.1


def _write_wav(path: str, x: np.ndarray, sr: int = SR):
    x = np.clip(np.asarray(x, np.float32), -1, 1)
    if x.ndim == 1:
        x = x[:, None]
    with wave.open(path, "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def _read_wav(path: str) -> np.ndarray:
    with wave.open(path, "rb") as w:
        n, ch = w.getnframes(), w.getnchannels()
        a = np.frombuffer(w.readframes(n), "<i2").astype(np.float32) / 32768.0
    return a.reshape(-1, ch)


os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")


def separate(video: str, out_dir: str, model_name: str = "htdemucs") -> dict:
    """Run Demucs once and cache stems. Returns {name: wav_path, "_device": ..., "_seconds": ...}."""
    names = ["vocals", "drums", "bass", "other"]
    paths = {n: os.path.join(out_dir, f"{n}.wav") for n in names}
    if all(os.path.exists(p) and os.path.getmtime(p) >= os.path.getmtime(video) for p in paths.values()):
        return paths | {"_device": "cache", "_seconds": 0.0}
    torch, err = optional("torch")
    pre, err2 = optional("demucs.pretrained")
    app, err3 = optional("demucs.apply")
    if torch is None or pre is None or app is None:
        raise RuntimeError(err or err2 or err3)
    t0 = time.time()
    dev = torch_device()
    model = pre.get_model(model_name)
    model.eval()
    a = read_audio(video, SR, mono=False)
    if a.size == 0:
        raise RuntimeError("no audio")
    wav = torch.tensor(a.T.copy())
    ref = wav.mean(0)
    mu, sd = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        src = app.apply_model(model, ((wav - mu) / sd)[None], device=dev, shifts=1, split=True, overlap=0.25,
                              progress=False)[0]
    src = (src * sd + mu).cpu().numpy()
    os.makedirs(out_dir, exist_ok=True)
    for i, n in enumerate(model.sources):
        if n in paths:
            _write_wav(paths[n], src[i].T)
    return paths | {"_device": dev, "_seconds": round(time.time() - t0, 1)}


def _env_db(x: np.ndarray, sr: int = SR, win: float = 0.4, hop: float = HOP) -> np.ndarray:
    if x.ndim > 1:
        x = x.mean(1)
    h = int(sr * hop)
    n = len(x) // h
    if n == 0:
        return np.array([-120.0])
    e = (x[: n * h].reshape(n, h) ** 2).mean(1)
    k = max(1, int(round(win / hop)))
    e = np.convolve(e, np.ones(k) / k, "same")
    return 10 * np.log10(e + 1e-12)


def _seg_db(x: np.ndarray, t0: float, t1: float, sr: int = SR) -> float:
    a, b = int(t0 * sr), int(t1 * sr)
    seg = x[a:b]
    if seg.ndim > 1:
        seg = seg.mean(1)
    if len(seg) < sr * 0.05:
        return float("nan")
    return float(10 * np.log10((seg ** 2).mean() + 1e-12))


def _sentences(adir: str, vocal_env: np.ndarray | None, dur: float) -> list[tuple[float, float, str]]:
    segs = load_segments(adir)
    if segs:
        return [(s["start"], s["end"], s.get("text", "")) for s in segs if s["end"] - s["start"] > 0.2]
    if vocal_env is None:
        return []
    out = []
    for i in range(0, int(dur)):
        sl = vocal_env[int(i / HOP): int((i + 1) / HOP)]
        if len(sl) and np.mean(sl > -40) > 0.5:
            out.append((float(i), float(i + 1), ""))
    return out


def music_stops(music_db: np.ndarray, present_thr: float = -48.0) -> list[dict]:
    med = percentile_filter(music_db, 50, size=max(3, int(3.0 / HOP)) | 1, mode="nearest")
    low = (music_db < med - 15) | (music_db < -55)
    out, i, n = [], 0, len(low)
    run_on = 0
    while i < n:
        if not low[i]:
            run_on = run_on + 1 if music_db[i] > present_thr else 0
            i += 1
            continue
        j = i
        while j < n and low[j]:
            j += 1
        if (j - i) * HOP >= 0.3 and run_on * HOP >= 1.0 and j < n:
            out.append({"t": round(i * HOP, 2), "seconds": round((j - i) * HOP, 2),
                        "drop_db": round(float(med[i] - music_db[i:j].mean()), 1)})
        run_on = 0
        i = j
    return out


def _measure(stems: dict[str, np.ndarray], adir: str, dur: float, paths: dict[str, str] | None) -> dict:
    voc = stems["vocals"]
    music = stems["drums"] + stems["bass"] + stems["other"]
    env = {k: _env_db(v) for k, v in stems.items()}
    env["music"] = _env_db(music)
    loud = {}
    if paths:
        for k, p in paths.items():
            if not k.startswith("_") and os.path.exists(p):
                loud[k] = ebur128(p).get("integrated_lufs")
    present = env["music"] > -48.0
    sentences = _sentences(adir, env["vocals"], dur)
    margins = []
    for t0, t1, txt in sentences:
        v, m = _seg_db(voc, t0, t1), _seg_db(music, t0, t1)
        if np.isfinite(v) and np.isfinite(m):
            margins.append({"t0": round(t0, 2), "t1": round(t1, 2), "voice_db": round(v, 1), "music_db": round(m, 1),
                            "margin_db": round(v - m, 1), "text": txt[:60]})
    on = {}
    for k in ("drums", "other"):
        on[k] = onsets_and_tempo(stems[k].mean(1)[::2] if stems[k].ndim > 1 else stems[k][::2], 22050)
    nonvocal = onsets_and_tempo(music.mean(1)[::2], 22050)
    stops = music_stops(env["music"])
    first = np.where(present)[0]
    mg = [m["margin_db"] for m in margins]
    return {
        "loudness_lufs": loud,
        "music_presence": round(float(present.mean()), 3),
        "music_start_s": round(float(first[0] * HOP), 2) if len(first) else None,
        "voice_music_margin_db": stats(mg, 1),
        "sentences_below_6db": sum(1 for m in mg if m < 6),
        "per_sentence": margins,
        "onset_rate": {"drums": round(on["drums"]["onset_rate"], 3), "other": round(on["other"]["onset_rate"], 3),
                       "non_vocal": round(nonvocal["onset_rate"], 3)},
        "music_bpm": nonvocal.get("bpm"),
        "music_stops": stops[:60], "music_stop_count": len(stops),
        "stem_level_db_median": {k: round(float(np.median(v)), 1) for k, v in env.items()},
    }


def _fallback(video: str, adir: str, dur: float) -> dict:
    """HEURISTIC without demucs: bed level in speech pauses; HPSS percussive onsets."""
    from scipy.signal import stft
    a = read_audio(video, 22050)
    if a.size == 0:
        return {"has_audio": False}
    env = _env_db(a, 22050, win=0.2)
    words = load_words(adir) or []
    speech = np.zeros(len(env), bool)
    for w in words:
        speech[int(w["start"] / HOP): int(np.ceil(w["end"] / HOP)) + 1] = True
    pauses = ~speech
    bed = np.where(pauses, env, np.nan)
    pres = float(np.nanmean(bed > -48)) if np.isfinite(bed).any() else None
    margins = []
    for s in (load_segments(adir) or []):
        i0, i1 = int(s["start"] / HOP), int(s["end"] / HOP) + 1
        lo, hi = max(0, i0 - int(3 / HOP)), min(len(env), i1 + int(3 / HOP))
        b = bed[lo:hi]
        b = b[np.isfinite(b)]
        if len(b) >= 2 and i1 > i0:
            margins.append(float(np.mean(env[i0:i1])) - float(np.median(b)))
    f, t, Z = stft(a, fs=22050, nperseg=2048, noverlap=1536)
    mag = np.abs(Z)
    perc = median_filter(mag, size=(17, 1))
    harm = median_filter(mag, size=(1, 17))
    P = perc ** 2 / (perc ** 2 + harm ** 2 + 1e-12) * mag
    from scipy.signal import istft
    _, xp = istft(P * np.exp(1j * np.angle(Z)), fs=22050, nperseg=2048, noverlap=1536)
    on = onsets_and_tempo(xp.astype(np.float32), 22050)
    return {"method": "HEURISTIC fallback (no demucs): bed measured in speech pauses, HPSS percussive onsets",
            "music_presence": None if pres is None else round(pres, 3),
            "music_presence_basis": "fraction of speech pauses with a bed above -48 dBFS" if words else "no transcript: unreliable",
            "voice_music_margin_db": stats(margins, 1), "onset_rate": {"percussive": round(on["onset_rate"], 3)},
            "music_bpm": on.get("bpm")}


def run(target: str, video: str | None = None, out_name: str = "stems", model: str = "htdemucs",
        keep_wavs: bool = True) -> dict:
    vid, adir = resolve(target, video)
    pr = probe(vid)
    if not pr.has_audio:
        d = unavailable("stems", "no audio stream")
        save(adir, out_name, d, "## Stems\n\n- no audio stream")
        return d
    data = {"schema": "vfa.stems/1", "available": True, "video": vid}
    try:
        paths = separate(vid, os.path.join(adir, "stems"), model)
        stems = {k: _read_wav(p) for k, p in paths.items() if not k.startswith("_")}
        mpath = os.path.join(adir, "stems", "music.wav")
        if not os.path.exists(mpath) or os.path.getmtime(mpath) < os.path.getmtime(paths["vocals"]):
            _write_wav(mpath, stems["drums"] + stems["bass"] + stems["other"])
        paths = paths | {"music": mpath}
        data.update(engine=f"demucs/{model}", device=paths["_device"], separation_seconds=paths["_seconds"],
                    stem_files={k: v for k, v in paths.items() if not k.startswith("_")})
        m = _measure(stems, adir, pr.duration, paths)
        data.update(m)
    except Exception as e:
        data.update(engine="fallback", demucs_error=f"{type(e).__name__}: {str(e)[:200]}",
                    install_hint="py -m pip install demucs torch (CUDA: --index-url https://download.pytorch.org/whl/cu130)")
        data.update(_fallback(vid, adir, pr.duration))
    data["summary"] = {"available": True, "engine": data.get("engine"),
                       "music_presence": data.get("music_presence"),
                       "voice_music_margin_db_median": (data.get("voice_music_margin_db") or {}).get("median"),
                       "voice_music_margin_db_p10": (data.get("voice_music_margin_db") or {}).get("p10"),
                       "music_stop_count": data.get("music_stop_count"),
                       "non_vocal_onset_rate": (data.get("onset_rate") or {}).get("non_vocal"),
                       "loudness_lufs": data.get("loudness_lufs")}
    save(adir, out_name, data, md_section(data))
    return data


def md_section(d: dict) -> str:
    if not d.get("available"):
        return "## Stems\n\n- unavailable: " + d.get("reason", "")
    mg = d.get("voice_music_margin_db") or {}
    L = ["## Stems (music / voice / SFX)", "", f"- Engine: {d.get('engine')} ({d.get('method', 'source separation')})"]
    if d.get("loudness_lufs"):
        L.append("- Integrated loudness per stem (LUFS): " + ", ".join(f"{k} {fmt(v, '{:.1f}')}" for k, v in d["loudness_lufs"].items()))
    L += [f"- Music presence **{fmt(d.get('music_presence'), '{:.0%}')}** of the runtime; music starts at {fmt(d.get('music_start_s'), '{:.2f}')} s; tempo {fmt(d.get('music_bpm'), '{:.0f}')} bpm",
          f"- Voice-over-music margin per sentence: median **{fmt(mg.get('median'), '{:.1f}')} dB**, p10 {fmt(mg.get('p10'), '{:.1f}')} dB "
          f"({d.get('sentences_below_6db', 'n/a')} sentences under 6 dB)",
          f"- Onsets/s: {d.get('onset_rate')}"]
    if d.get("music_stops") is not None:
        L.append(f"- Music stops: {d.get('music_stop_count')} at {[s['t'] for s in d['music_stops'][:12]]} s")
    return "\n".join(L)
