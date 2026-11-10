#!/usr/bin/env python3
"""Sound design for the manhole short, read from the picture's cues in timeline.json (one source of truth).

  py make_audio.py <render_out>/timeline.json

Level model (references/craft.md "Sound"): every cue is set by LOUDNESS relative to the voice (naive_lu):
beds -26..-32, big hits 0..-6, details -12..-20; camera travels get a whoosh/swish anchored at its peak; the music
is arranged per story section and STOPS dead under the incident (silence under the big moment), comes back calm for
the night explanation, full for the payoff with a button hit after the last word. Ducking keys off words.json.
Measured channel mix: -14 LUFS, LRA ~2.2 LU, bed only ~5-10 LU under the voice.
"""
import json, os, shutil, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
AUDIO = os.path.abspath(os.path.join(ENGINE, "..", "audio"))
PUB = os.path.join(ENGINE, "public", "manhole")
tl = json.load(open(sys.argv[1], encoding="utf-8"))
fps, total = tl["fps"], tl["durationInFrames"]
C = {k.split(".", 1)[1]: v for k, v in tl.get("cues", {}).items() if k.startswith("street.")}
if not C:
    raise SystemExit("timeline.json has no cues -- render with the current engine first")
S = lambda f: f / fps
sfx = os.path.join(PUB, "sfx")
if not os.path.exists(os.path.join(sfx, "splash.wav")):
    subprocess.run([sys.executable, os.path.join(AUDIO, "sfx.py"), "pack", sfx], check=True, stdout=subprocess.DEVNULL)
shutil.copy(os.path.join(HERE, "words.json"), os.path.join(PUB, "words.json"))

sections = [
    {"a": 0, "b": S(C["morning"]), "layers": ["pad", "pluck", "kick"]},                         # set-up: bouncy
    {"a": S(C["morning"]), "b": S(C["drop"]), "layers": ["pad", "pluck"], "end": "stop"},       # tension, hard stop
    {"a": S(C["explain"]), "b": S(C["summer"]), "layers": ["pad"]},                              # calm night explanation
    {"a": S(C["summer"]), "b": total / fps - 0.25, "layers": ["pad", "pluck", "kick"], "end": "button"},
]
json.dump(sections, open(os.path.join(PUB, "sections.json"), "w"), indent=1)
subprocess.run([sys.executable, os.path.join(AUDIO, "music.py"), "--mood", "playful", "--bpm", "104", "--seconds", f"{total / fps:.2f}",
                "--seed", "11", "--sections", os.path.join(PUB, "sections.json"), "--out", os.path.join(PUB, "bed.wav")],
               check=True, stdout=subprocess.DEVNULL)


def s(name, frame, lu, pan=0.0, anchor=0.0, **kw):
    return {"file": f"sfx/{name}.wav", "at_frame": int(frame), "naive_lu": lu, "role": "sfx", "pan": pan, "anchor": anchor, **kw}


travels = [C["mayor"], C["foundry"], C["cart"], C["summer"], C["oldf"]]
tracks = [
    {"file": "vo.wav", "start": 0.1, "role": "voice", "highpass": 80},
    {"file": "bed.wav", "start": 0, "role": "music", "fade_in": 0.05},
    {"file": "sfx/roomtone.wav", "start": 0, "role": "ambience", "naive_lu": -32, "loop": True},
    {"file": "sfx/wind.wav", "start": 0, "role": "ambience", "naive_lu": -34, "loop": True},
    s("sparkle", C["square1"], -14),
    *[s("swish", f + 2, -12, pan=(-0.3 if i % 2 else 0.3), anchor=0.15) for i, f in enumerate(travels)],  # peak on the move
    s("whoosh", C["spring"] + 6, -11, anchor=0.3),
    s("pop", C["squareQ"], -12), s("boing", C["squareQ"] + 6, -16),
    *[s("footstep", f, -20, pan=-0.2, distance_m=7) for f in range(C["mayor"] + 6, C["foundry"] - 6, 11)],
    s("rumble", C["cart"], -16, distance_m=6),
    s("sparkle", C["loves"], -14, pan=0.2),
    s("click", C["lifts"], -12), s("tick", C["turns"], -14), s("thud", C["slips"], -8),
    s("whoosh", C["drop"], -8, anchor=0.3, send=0.4),
    s("splash", C["hole"] - 2, -2, send=0.6),                 # biggest hit, wet: it's down a shaft
    s("impact", C["hole"] + 9, -10),
    s("pop", C["wait"], -12),
    s("riser", C["explain"] - 60, -18), s("chime", C["explain"], -12, send=0.3),
    s("swish", C["corner"], -14), s("whoosh", C["through"], -12, anchor=0.3), s("pop", C["circle"], -12), s("thud", C["never"], -8),
    s("ding", C["doubled"], -6), s("sparkle", C["doubled"] + 3, -14),
]
plan = {"duration": total / fps, "fps": fps, "target_lufs": -14, "true_peak": -1.0,
        "words": "words.json", "words_offset": 0.1, "duck_db": -3,
        "music_sections": [[0, S(C["explain"]), -9], [S(C["explain"]), S(C["summer"]), -12], [S(C["summer"]), total / fps, -9]],
        "reverb": {"rt60": 1.0, "wet": 0.5}, "tracks": tracks}
json.dump(plan, open(os.path.join(PUB, "audio_plan.json"), "w"), indent=1)
subprocess.run([sys.executable, os.path.join(AUDIO, "mix.py"), os.path.join(PUB, "audio_plan.json"), "--out", os.path.join(PUB, "master.wav"),
                "--stems", os.path.join(PUB, "stems")], check=True)
