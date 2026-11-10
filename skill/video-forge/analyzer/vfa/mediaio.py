"""Media I/O: ffprobe, streaming frame decode, audio decode, yt-dlp helpers.

Everything shells out to ffmpeg/ffprobe/yt-dlp so it works on Windows, macOS
and Linux without compiled extras. Frames are streamed (never fully held in RAM)
so 60-minute long-form videos analyze in constant memory.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from fractions import Fraction
from typing import Iterator

import numpy as np


def need(tool: str) -> str:
    path = shutil.which(tool)
    if not path:
        raise SystemExit(f"[vfa] required tool not found on PATH: {tool}")
    return path


@dataclass
class Probe:
    path: str
    width: int
    height: int
    fps: float
    fps_str: str
    duration: float
    nb_frames: int
    vcodec: str
    pix_fmt: str
    bit_rate: int
    has_audio: bool
    acodec: str | None
    sample_rate: int | None
    channels: int | None

    @property
    def aspect(self) -> str:
        r = self.width / max(1, self.height)
        if abs(r - 9 / 16) < 0.02:
            return "9:16"
        if abs(r - 16 / 9) < 0.02:
            return "16:9"
        if abs(r - 1) < 0.02:
            return "1:1"
        if abs(r - 4 / 5) < 0.02:
            return "4:5"
        return f"{r:.3f}:1"

    def to_dict(self) -> dict:
        d = self.__dict__.copy()
        d["aspect"] = self.aspect
        return d


def probe(path: str) -> Probe:
    need("ffprobe")
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path],
        capture_output=True, text=True, check=True,
    ).stdout
    info = json.loads(out)
    v = next((s for s in info["streams"] if s.get("codec_type") == "video"), None)
    a = next((s for s in info["streams"] if s.get("codec_type") == "audio"), None)
    if v is None:
        raise SystemExit(f"[vfa] no video stream in {path}")
    fr = v.get("avg_frame_rate") or v.get("r_frame_rate") or "30/1"
    try:
        fps = float(Fraction(fr)) if fr != "0/0" else float(Fraction(v.get("r_frame_rate", "30/1")))
    except (ZeroDivisionError, ValueError):
        fps = 30.0
    dur = float(info.get("format", {}).get("duration") or v.get("duration") or 0)
    nb = int(v.get("nb_frames") or 0) or int(round(dur * fps))
    w, h = int(v["width"]), int(v["height"])
    # honour rotation metadata (phone footage)
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(sd["rotation"])
    if abs(rot) in (90, 270):
        w, h = h, w
    return Probe(
        path=path, width=w, height=h, fps=fps, fps_str=fr, duration=dur, nb_frames=nb,
        vcodec=v.get("codec_name", "?"), pix_fmt=v.get("pix_fmt", "?"),
        bit_rate=int(info.get("format", {}).get("bit_rate") or 0),
        has_audio=a is not None, acodec=a.get("codec_name") if a else None,
        sample_rate=int(a["sample_rate"]) if a and a.get("sample_rate") else None,
        channels=int(a["channels"]) if a and a.get("channels") else None,
    )


def iter_frames(path: str, width: int, start: float = 0.0, duration: float | None = None,
                fps: float | None = None) -> Iterator[np.ndarray]:
    """Yield RGB uint8 frames scaled to `width` (height keeps aspect, even).

    Decodes every frame at native rate unless `fps` is given. This is the
    "watch at 30 fps" requirement: nothing is skipped by default.
    """
    need("ffmpeg")
    p = probe(path)
    height = int(round(p.height * width / p.width / 2)) * 2
    vf = [f"scale={width}:{height}:flags=area"]
    if fps:
        vf.insert(0, f"fps={fps}")
    cmd = ["ffmpeg", "-v", "error", "-nostdin"]
    if start > 0:
        cmd += ["-ss", f"{start:.3f}"]
    cmd += ["-i", path]
    if duration:
        cmd += ["-t", f"{duration:.3f}"]
    cmd += ["-an", "-vf", ",".join(vf), "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=width * height * 3 * 4)
    size = width * height * 3
    try:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            yield np.frombuffer(buf, np.uint8).reshape(height, width, 3)
    finally:
        proc.stdout.close()
        proc.kill()
        proc.wait()


def grab_frame(path: str, t: float, out_png: str, width: int | None = None) -> str:
    """Extract one full-quality still at time t (seconds)."""
    vf = ["-vf", f"scale={width}:-2:flags=lanczos"] if width else []
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.4f}", "-i", path, "-frames:v", "1",
                    *vf, out_png], check=True)
    return out_png


def read_audio(path: str, sr: int = 22050, mono: bool = True) -> np.ndarray:
    """Decode audio to float32 [-1,1]. Returns empty array if no audio."""
    need("ffmpeg")
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-i", path, "-vn", "-ac", "1" if mono else "2",
           "-ar", str(sr), "-f", "s16le", "-"]
    raw = subprocess.run(cmd, capture_output=True).stdout
    a = np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
    if not mono:
        a = a.reshape(-1, 2)
    return a


def ebur128(path: str) -> dict:
    """Integrated loudness (LUFS), loudness range (LU) and true peak (dBTP) via ffmpeg."""
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", path, "-vn",
                        "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    txt = r.stderr
    tail = txt[txt.rfind("Summary:"):] if "Summary:" in txt else ""
    res: dict = {}

    def grab(key: str, unit: str):
        i = tail.find(key)
        if i < 0:
            return None
        seg = tail[i + len(key): i + len(key) + 40]
        try:
            return float(seg.split(unit)[0].strip().split()[-1])
        except (ValueError, IndexError):
            return None

    res["integrated_lufs"] = grab("I:", "LUFS")
    res["lra_lu"] = grab("LRA:", "LU")
    res["true_peak_dbtp"] = grab("Peak:", "dBFS")
    return res


def ytdlp_download(url: str, out_dir: str, max_height: int = 2160, audio_lang_original: bool = True,
                   name: str = "%(id)s") -> str:
    """Download a video at the best quality up to max_height with the ORIGINAL audio track.

    YouTube serves auto-dubbed tracks to some regions; the reference methodology
    (and our own analysis) needs the original language for script/WPS analysis.
    """
    need("yt-dlp")
    os.makedirs(out_dir, exist_ok=True)
    aud = "ba[format_note*=original]/ba[language^=en]/ba" if audio_lang_original else "ba"
    fmt = f"bv*[height<={max_height}]+({aud})/b[height<={max_height}]/b"
    tmpl = os.path.join(out_dir, f"{name}.%(ext)s")
    subprocess.run(["yt-dlp", "-f", fmt, "--merge-output-format", "mkv", "--write-info-json",
                    "--write-auto-subs", "--write-subs", "--sub-langs", "en.*,en,-live_chat",
                    "--sub-format", "vtt", "--no-playlist", "-o", tmpl, url], check=True)
    r = subprocess.run(["yt-dlp", "--no-playlist", "--print", "filename", "-o", tmpl,
                        "--merge-output-format", "mkv", "-f", fmt, url],
                       capture_output=True, text=True, check=True)
    fn = r.stdout.strip().splitlines()[-1]
    base = os.path.splitext(fn)[0]
    for ext in (".mkv", ".mp4", ".webm"):
        if os.path.exists(base + ext):
            return base + ext
    return fn


def ytdlp_list(url: str, limit: int = 200) -> list[dict]:
    """Flat-list a channel/playlist tab. Returns id, title, duration, view_count, url."""
    need("yt-dlp")
    r = subprocess.run(["yt-dlp", "--flat-playlist", "-I", f"1:{limit}", "-J", url],
                       capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        raise SystemExit(f"[vfa] yt-dlp could not list {url}: {r.stderr[-400:]}")
    data = json.loads(r.stdout)
    items = []
    for e in data.get("entries") or []:
        if not e:
            continue
        items.append({
            "id": e.get("id"), "title": e.get("title"), "duration": e.get("duration"),
            "view_count": e.get("view_count"),
            "url": e.get("url") if str(e.get("url", "")).startswith("http")
            else f"https://www.youtube.com/watch?v={e.get('id')}",
        })
    return items
