"""Shared helpers for the optional "deep" analysers (ocr, transitions, stems, embed, pose).

Conventions
- Every extra works on an analysis dir (the output of `vfa analyze`); given a bare video it
  looks for `<video>_analysis/` and creates a light analysis there if missing.
- Every extra writes `<name>.json` + `<name>.md` into the analysis dir and returns a dict
  with a compact "summary" (what `vfa analyze --deep` stores under fingerprint["deep"]).
- Optional dependencies are imported lazily via `optional()`; a missing package yields a
  result with "available": False and a reason, never an exception that kills `vfa analyze`.
"""
from __future__ import annotations

import importlib
import json
import os
import shutil
import urllib.request

import numpy as np

VIDEO_EXTS = (".mp4", ".mkv", ".webm", ".mov", ".m4v", ".avi")


def optional(module: str):
    """Import a module lazily. Returns (module, None) or (None, reason)."""
    try:
        return importlib.import_module(module), None
    except Exception as e:  # ImportError, DLL load failures, version clashes...
        return None, f"{module} unavailable ({type(e).__name__}: {str(e)[:160]})"


def resolve(target: str, video: str | None = None, ensure_analysis: bool = True) -> tuple[str, str]:
    """Return (video_path, analysis_dir) for a video path or an analysis dir."""
    if os.path.isdir(target):
        adir = target
        if video is None:
            fp = os.path.join(adir, "fingerprint.json")
            if os.path.exists(fp):
                video = json.load(open(fp, encoding="utf-8")).get("source", {}).get("path")
        if not video or not os.path.exists(video):
            raise SystemExit(f"[vfa] cannot find the source video for {adir}; pass --video")
        return video, adir
    if not os.path.exists(target):
        raise SystemExit(f"[vfa] not found: {target}")
    vid = target
    adir = video if (video and os.path.isdir(video)) else os.path.splitext(vid)[0] + "_analysis"
    if ensure_analysis and not os.path.exists(os.path.join(adir, "fingerprint.json")):
        from .analyze import analyze
        print(f"[vfa] no analysis found; running a light `vfa analyze` into {adir}")
        analyze(vid, adir, sheets="none", speech="off", quiet=True)
    os.makedirs(adir, exist_ok=True)
    return vid, adir


def load_fp(adir: str) -> dict:
    p = os.path.join(adir, "fingerprint.json")
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}


def load_frames(adir: str) -> dict | None:
    p = os.path.join(adir, "frames.npz")
    if not os.path.exists(p):
        return None
    z = np.load(p)
    return {k: z[k] for k in z.files}


def load_words(adir: str) -> list[dict] | None:
    p = os.path.join(adir, "transcript.json")
    if not os.path.exists(p):
        return None
    t = json.load(open(p, encoding="utf-8"))
    return t.get("words") or None


def load_segments(adir: str) -> list[dict] | None:
    p = os.path.join(adir, "transcript.json")
    if not os.path.exists(p):
        return None
    return json.load(open(p, encoding="utf-8")).get("segments") or None


def save(adir: str, name: str, data: dict, md: str) -> str:
    os.makedirs(adir, exist_ok=True)
    with open(os.path.join(adir, f"{name}.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, default=_json_default)
    p = os.path.join(adir, f"{name}.md")
    with open(p, "w", encoding="utf-8") as f:
        f.write(md.rstrip() + "\n")
    return p


def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    return str(o)


def unavailable(name: str, reason: str, hint: str = "") -> dict:
    return {"schema": f"vfa.{name}/1", "available": False, "reason": reason, "install_hint": hint,
            "summary": {"available": False, "reason": reason}}


def cache_dir() -> str:
    d = os.environ.get("VFA_CACHE") or os.path.join(os.path.expanduser("~"), ".cache", "vfa")
    os.makedirs(d, exist_ok=True)
    return d


def download(url: str, name: str) -> str:
    """Download a model file once into the vfa cache (official URLs only)."""
    dst = os.path.join(cache_dir(), name)
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return dst
    tmp = dst + ".part"
    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f)
    os.replace(tmp, dst)
    return dst


def stats(v, nd: int = 4) -> dict:
    v = np.asarray(v, np.float64)
    v = v[np.isfinite(v)]
    if not len(v):
        return {"median": None, "p10": None, "p90": None, "n": 0}
    return {"median": round(float(np.median(v)), nd), "p10": round(float(np.percentile(v, 10)), nd),
            "p90": round(float(np.percentile(v, 90)), nd), "n": int(len(v))}


def torch_device() -> str:
    torch, _ = optional("torch")
    if torch is not None:
        try:
            if torch.cuda.is_available():
                return "cuda"
        except Exception:
            pass
    return "cpu"


def fmt(v, f="{:.2f}"):
    return "n/a" if v is None else f.format(v)
