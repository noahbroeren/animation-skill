#!/usr/bin/env python3
"""Sound for a storyboard video, straight from the picture's cue sheet (timeline.json).

  py score.py <render_out>/timeline.json --project-dir engine/public/<id> [--track music_sneaky | --mood curious --bpm 100]
              [--vo vo.wav] [--vo-offset 0.1] [--sounds DIR] [--no-real] [--out master.wav]

A board project (engine/src/lib/board.tsx) writes into timeline.json what the picture does: `sounds` (a name and a
frame per effect), `music` (arrangement changes), `rain` (amount over time) and `places` (interior / exterior).
This tool turns that into an audio plan and runs mix.py. One source of truth: move a beat and its sound moves.

REAL SOUNDS FIRST. For every name it looks for NAME.wav in, in this order:
  1. <project-dir>/sounds/        (sounds made for this video)
  2. --sounds DIR or $VIDEO_FORGE_SOUNDS
  3. ~/.video-forge/sounds/       (your own library: recordings, licensed packs, ElevenLabs generations)
and only then falls back to the synthesized pack (sfx.py). The report says, per cue, which one was used.
Sound files are NOT part of the skill repository: generated and licensed audio stays on your machine. The prompts
that built the starter library are in audio/soundlib.json, so anyone can regenerate their own.

MUSIC. --track NAME uses NAME.wav from the same folders (a licensed or generated track); it is cut to length, shaped
by the board's `music` marks (build / full / calm / thin / stop) and ducked under the voice by mix.py. Without a
track the procedural bed (music.py) is arranged from the same marks.

AMBIENCE. One bed is rendered from `places` and `rain`: room tone inside, a street bed outside, rain where it rains.

Levels follow references/craft/general.md "Sound": everything is set by loudness relative to the voice; hits -4..-8 LU,
details -12..-18, beds -24..-34, music about 17 LU under the voice the whole way (1.11.2).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

import numpy as np
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 48000
DEFAULT_LU = {"impact": -9, "thud": -11, "whoosh": -12, "swish": -15, "pop": -15, "ding": -14, "chime": -16, "sparkle": -17, "tick": -18, "click": -14,
              "snip": -12, "coin": -11, "coins": -10, "hammer": -11, "rasp": -11, "hooves": -9, "thunder": -9, "sizzle": -11, "press": -11, "car": -10,
              "crowd_cheer": -11, "crowd_gasp": -10, "crowd_clap": -12, "crowd_laugh": -11, "crowd_boo": -11, "crowd_sad": -14, "creak": -15, "riser": -13, "rumble": -12, "splash": -10}
# synthesized stand-ins (sfx.py names) when no real sample exists; None = skip the cue
SYNTH = {"snip": "click", "coin": "ding", "coins": "sparkle", "hammer": "impact", "rasp": "creak", "hooves": "rumble", "thunder": "rumble", "sizzle": "whoosh", "press": "thud", "car": "whoosh",
         "crowd_cheer": None, "crowd_gasp": None, "crowd_clap": None, "crowd_laugh": None, "crowd_boo": None, "crowd_sad": None, "crowd_look": None, "crowd_point": None}
# 1.9: the reference keeps ONE bed level (sections within ~6 dB) and changes the music at the twist, not at the pivot
MODE_DB = {"build": 0.0, "full": 1.0, "calm": -1.0, "thin": -2.0, "stop": None}
SYNTH_LAYERS = {"build": ["pad", "pluck"], "full": ["pad", "pluck", "kick"], "calm": ["pad"], "thin": ["pad"]}


def read(path: str) -> np.ndarray:
    sr, x = wavfile.read(path)
    x = x.astype(np.float64) / (32768.0 if x.dtype == np.int16 else 2147483648.0 if x.dtype == np.int32 else 1.0)
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    if sr != SR:
        from scipy.signal import resample_poly
        x = resample_poly(x, SR, sr, axis=0)
    return x


def write(path: str, x: np.ndarray):
    wavfile.write(path, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))


def peak_time(x: np.ndarray) -> float:
    """seconds to the loudest 10 ms: lands the transient on the frame (0 for sounds that should START on the cue)"""
    env = np.abs(x).max(axis=1)
    k = SR // 100
    c = np.cumsum(np.pad(env, (k, 0)))
    env = (c[k:] - c[:-k]) / k
    t = float(np.argmax(env)) / SR
    return t if t < 0.6 else 0.0


def env_from(marks: list[tuple[float, float]], n: int, fade=0.3) -> np.ndarray:
    """piecewise-constant gain (linear) from (time, value) marks, smoothed with `fade` seconds"""
    g = np.zeros(n)
    for i, (t, v) in enumerate(marks):
        a = int(t * SR)
        b = int(marks[i + 1][0] * SR) if i + 1 < len(marks) else n
        g[max(0, a):max(0, b)] = v
    k = max(1, int(fade * SR))
    c = np.cumsum(np.pad(g, (k, k), mode="edge"))  # moving average by cumulative sum: a 14,400-tap convolution took minutes
    return ((c[k:] - c[:-k]) / k)[k // 2:k // 2 + n]


def loop_to(x: np.ndarray, n: int) -> np.ndarray:
    reps = int(np.ceil(n / len(x)))
    return np.tile(x, (reps, 1))[:n]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("timeline")
    ap.add_argument("--project-dir", required=True)
    ap.add_argument("--track")
    ap.add_argument("--mood", default="curious")
    ap.add_argument("--bpm", default="100")
    ap.add_argument("--vo", default="vo.wav")
    ap.add_argument("--vo-offset", type=float, default=0.0)
    ap.add_argument("--sounds")
    ap.add_argument("--no-real", action="store_true", help="synthesized sounds only (what the repository can reproduce)")
    ap.add_argument("--music-lu", type=float, default=-17.0)  # 1.11.2: the reference keeps its music ~17 dB under the voice, to the last frame
    ap.add_argument("--out", default="master.wav")
    a = ap.parse_args()
    tl = json.load(open(a.timeline, encoding="utf-8"))
    if "voOffset" in tl and a.vo_offset == 0.0:  # a storyboard says where its narration starts: picture and sound agree
        a.vo_offset = float(tl["voOffset"])
    fps, total = tl["fps"], tl["durationInFrames"]
    dur, n = total / fps, int(total / fps * SR)
    pub = os.path.abspath(a.project_dir)
    cfg = {}
    if os.path.exists(os.path.join(pub, "score.json")):
        cfg = json.load(open(os.path.join(pub, "score.json"), encoding="utf-8"))
    track = a.track or cfg.get("track")
    dirs = [os.path.join(pub, "sounds")] + [d for d in [a.sounds, os.environ.get("VIDEO_FORGE_SOUNDS"), os.path.join(os.path.expanduser("~"), ".video-forge", "sounds")] if d]
    synth_dir = os.path.join(pub, "sfx")
    if not os.path.exists(os.path.join(synth_dir, "creak.wav")):
        subprocess.run([sys.executable, os.path.join(HERE, "sfx.py"), "pack", synth_dir], check=True, stdout=subprocess.DEVNULL)
    cache = os.path.join(pub, "sounds_used")
    os.makedirs(cache, exist_ok=True)

    def real(name: str) -> str | None:
        if a.no_real:
            return None
        for d in dirs:
            p = os.path.join(d, name + ".wav")
            if os.path.exists(p):
                return p
        return None

    used: dict[str, str] = {}
    anchors: dict[str, float] = {}

    def resolve(name: str) -> str | None:
        """-> path relative to the project dir for mix.py, or None to skip"""
        if name in used:
            return used[name] or None
        p = real(name)
        if p:
            x = read(p)
            rel = os.path.join("sounds_used", name + ".wav")
            write(os.path.join(pub, rel), x)
            anchors[name] = peak_time(x)
            used[name] = rel
            return rel
        s = SYNTH.get(name, name)
        if s and os.path.exists(os.path.join(synth_dir, s + ".wav")):
            used[name] = os.path.join("sfx", s + ".wav")
            anchors[name] = {"whoosh": 0.27, "swish": 0.135}.get(s, 0.0)
            return used[name]
        used[name] = ""
        return None

    tracks = [{"file": a.vo, "start": a.vo_offset, "role": "voice", "highpass": 80}]
    rows = []
    for c in tl.get("sounds", []):
        f = resolve(c["name"])
        kind = "skipped" if not f else "real" if f.startswith("sounds_used") else "synth"
        rows.append((c["f"], c["name"], kind))
        if not f:
            continue
        t = {"file": f.replace("\\", "/"), "at_frame": int(c["f"]), "naive_lu": c.get("lu", DEFAULT_LU.get(c["name"], -14)), "role": "sfx", "pan": c.get("pan", 0.0),
             "anchor": c.get("anchor", anchors.get(c["name"], 0.0)) if kind == "synth" else anchors.get(c["name"], 0.0)}
        if c.get("on_word"):
            t["on_word"] = True
        if c["name"] in ("impact", "thud", "hammer", "press", "thunder", "ding", "chime"):
            t["send"] = 0.3
        tracks.append(t)

    # ---- ambience bed from places + rain
    amb = np.zeros((n, 2))
    places = tl.get("places") or [{"f": 0, "set": "street", "interior": False}]
    inside = env_from([(p["f"] / fps, 1.0 if p["interior"] else 0.0) for p in places], n)
    room = read(os.path.join(synth_dir, "roomtone.wav"))
    amb += loop_to(room, n) * (inside * 10 ** (-6 / 20))[:, None]
    st = real("street_day")
    street = read(st) if st else read(os.path.join(synth_dir, "wind.wav")) * 0.35
    amb += loop_to(street, n) * ((1 - inside) * 10 ** (0 / 20))[:, None]
    rain_marks = [(r["f"] / fps, float(r["amount"])) for r in tl.get("rain", [])]
    if any(v > 0 for _, v in rain_marks):
        rn = real("rain_loop")
        rain = read(rn) if rn else read(os.path.join(synth_dir, "wind.wav"))
        amb += loop_to(rain, n) * (env_from([(0, 0.0)] + rain_marks, n, 0.5) * 10 ** (8 / 20))[:, None]
    pk = np.abs(amb).max() or 1.0
    write(os.path.join(pub, "ambience.wav"), amb / pk * 0.5)
    tracks.append({"file": "ambience.wav", "start": 0, "role": "ambience", "naive_lu": -24})

    # ---- music
    marks = [(m["f"] / fps, m["mode"]) for m in tl.get("music", [])] or [(0.0, "build")]
    if marks[0][0] > 0.05:
        marks.insert(0, (0.0, "build"))
    mp = real(track) if track else None
    if mp:
        m = read(mp)
        m = m[:n] if len(m) >= n else np.concatenate([m, np.zeros((n - len(m), 2))])
        g = env_from([(t, 0.0 if MODE_DB[mode] is None else 10 ** (MODE_DB[mode] / 20)) for t, mode in marks], n, 0.22)
        fo = int(0.35 * SR)
        g[-fo:] *= np.linspace(1, 0, fo)
        write(os.path.join(pub, "bed.wav"), m * g[:, None])
        music_src = f"real track {track}"
    else:
        secs = []
        for i, (t, mode) in enumerate(marks):
            b = marks[i + 1][0] if i + 1 < len(marks) else dur - 0.25
            if mode == "stop":
                if secs:
                    secs[-1]["end"] = "stop" if i + 1 < len(marks) else "button"
                continue
            secs.append({"a": t, "b": b, "layers": SYNTH_LAYERS[mode]})
        json.dump(secs, open(os.path.join(pub, "sections.json"), "w"), indent=1)
        subprocess.run([sys.executable, os.path.join(HERE, "music.py"), "--mood", cfg.get("mood", a.mood), "--bpm", str(cfg.get("bpm", a.bpm)), "--seconds", f"{dur:.2f}", "--seed", "7",
                        "--sections", os.path.join(pub, "sections.json"), "--out", os.path.join(pub, "bed.wav")], check=True, stdout=subprocess.DEVNULL)
        music_src = "procedural bed (music.py)"
    tracks.append({"file": "bed.wav", "start": 0, "role": "music", "fade_in": 0.05})
    sections = []
    for i, (t, mode) in enumerate(marks):
        b = marks[i + 1][0] if i + 1 < len(marks) else dur
        sections.append([t, b, a.music_lu - (2.0 if mode in ("calm", "thin") else 0.0)])
    plan = {"duration": dur, "fps": fps, "target_lufs": -14, "true_peak": -2.0, "words": "words.json", "words_offset": a.vo_offset, "duck_db": -3,
            "music_sections": sections, "reverb": {"rt60": 1.1, "wet": 0.4}, "tracks": tracks}
    json.dump(plan, open(os.path.join(pub, "audio_plan.json"), "w"), indent=1)
    subprocess.run([sys.executable, os.path.join(HERE, "mix.py"), os.path.join(pub, "audio_plan.json"), "--out", os.path.join(pub, a.out), "--stems", os.path.join(pub, "stems")], check=True)
    nreal = sum(1 for r in rows if r[2] == "real"); nsyn = sum(1 for r in rows if r[2] == "synth"); nskip = sum(1 for r in rows if r[2] == "skipped")
    rep = [f"# Sound report ({os.path.basename(pub)})", "", f"- music: {music_src}", f"- effects: {len(rows)} cues: {nreal} real samples, {nsyn} synthesized, {nskip} skipped (no sample and no stand-in)",
           f"- ambience: {'street bed (real)' if st else 'wind (synthesized)'} outside, room tone inside" + (", rain" if any(v > 0 for _, v in rain_marks) else ""), "",
           "| frame | sound | source |", "|---|---|---|"] + [f"| {f} | {nm} | {k} |" for f, nm, k in rows]
    open(os.path.join(pub, "sound_report.md"), "w", encoding="utf-8").write("\n".join(rep) + "\n")
    print(f"[score] {len(rows)} cues ({nreal} real, {nsyn} synth, {nskip} skipped), music: {music_src} -> {os.path.join(pub, a.out)}")


if __name__ == "__main__":
    main()
