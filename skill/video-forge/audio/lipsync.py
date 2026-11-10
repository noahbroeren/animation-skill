#!/usr/bin/env python3
"""Audio-driven lip-sync cues with Rhubarb Lip Sync (MIT, offline): far better mouth timing than text-only visemes.

  py lipsync.py VO.wav --out cues.json [--script script.txt] [--rhubarb PATH]

Output: {"mouthCues": [{"start": s, "end": s, "value": "A".."H"|"X"}], ...} (Rhubarb's JSON). In the engine:
  import CUES from "./cues.json";  pose.cue = cueAt(frame, fps, CUES.mouthCues)   (lib/characters/kinds.ts)
  or for toon.ts characters: pose.viseme = CUE_TO_VISEME[cueAt(...)]
Give each speaking character only its own lines (split the VO per speaker, or slice cues by time).

Binary lookup: --rhubarb, $RHUBARB, `rhubarb` on PATH, else it downloads the official release once into
~/.cache/video-forge/rhubarb (Windows/macOS/Linux zip from github.com/DanielSWolf/rhubarb-lip-sync).
"""
from __future__ import annotations

import argparse
import io
import json
import os
import platform
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

VERSION = "1.14.0"
CACHE = os.path.join(os.path.expanduser("~"), ".cache", "video-forge", "rhubarb")


def _asset():
    sysname = platform.system()
    tag = {"Windows": "Windows", "Darwin": "macOS", "Linux": "Linux"}.get(sysname)
    if not tag:
        raise SystemExit(f"no Rhubarb build for {sysname}; install it manually and pass --rhubarb")
    return f"https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v{VERSION}/Rhubarb-Lip-Sync-{VERSION}-{tag}.zip"


def find_rhubarb(explicit: str | None = None) -> str:
    for c in (explicit, os.environ.get("RHUBARB"), shutil.which("rhubarb")):
        if c and os.path.exists(c):
            return c
    exe = "rhubarb.exe" if os.name == "nt" else "rhubarb"
    for root, _, files in os.walk(CACHE):
        if exe in files:
            return os.path.join(root, exe)
    url = _asset()
    print(f"[lipsync] downloading Rhubarb {VERSION} (MIT) from {url}", file=sys.stderr)
    data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "video-forge"}), timeout=120).read()
    os.makedirs(CACHE, exist_ok=True)
    zipfile.ZipFile(io.BytesIO(data)).extractall(CACHE)
    for root, _, files in os.walk(CACHE):
        if exe in files:
            p = os.path.join(root, exe)
            os.chmod(p, os.stat(p).st_mode | stat.S_IEXEC)
            return p
    raise SystemExit("Rhubarb download did not contain the binary")


def cues(vo: str, script: str | None = None, rhubarb: str | None = None, recognizer: str = "pocketSphinx") -> dict:
    exe = find_rhubarb(rhubarb)
    src = vo
    if not vo.lower().endswith(".wav"):  # Rhubarb reads WAV/OGG; convert anything else
        src = os.path.join(tempfile.mkdtemp(), "vo.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", vo, "-ac", "1", "-ar", "16000", src], check=True)
    out = os.path.join(tempfile.mkdtemp(), "cues.json")  # -o: on Windows Rhubarb's stdout comes back empty under -q
    cmd = [exe, "-f", "json", "--extendedShapes", "GHX", "-r", recognizer, "-q", "-o", out]
    if script:
        cmd += ["-d", script]
    r = subprocess.run(cmd + [src], capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(out):
        raise SystemExit(f"rhubarb failed ({r.returncode}): {r.stderr[-800:]}")
    return json.load(open(out, encoding="utf-8"))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("vo")
    ap.add_argument("--out", required=True)
    ap.add_argument("--script", help="dialog text: improves recognition (optional)")
    ap.add_argument("--rhubarb")
    ap.add_argument("--phonetic", action="store_true", help="language-independent recognizer (non-English VO)")
    a = ap.parse_args()
    d = cues(a.vo, a.script, a.rhubarb, "phonetic" if a.phonetic else "pocketSphinx")
    json.dump(d, open(a.out, "w", encoding="utf-8"), indent=1)
    n = len(d.get("mouthCues", []))
    print(f"{a.out}: {n} mouth cues over {d.get('metadata', {}).get('duration', '?')} s")


if __name__ == "__main__":
    main()
