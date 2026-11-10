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
if not os.path.exists(os.path.join(sfx, "creak.wav")):
    subprocess.run([sys.executable, os.path.join(AUDIO, "sfx.py"), "pack", sfx], check=True, stdout=subprocess.DEVNULL)
shutil.copy(os.path.join(HERE, "words.json"), os.path.join(PUB, "words.json"))

sections = [
    {"a": 0, "b": S(C["morning"]), "layers": ["pad", "pluck", "kick"]},                         # set-up: bouncy
    {"a": S(C["morning"]), "b": S(C["drop"]), "layers": ["pad", "pluck"], "end": "stop"},       # tension, hard stop
    {"a": S(C["wait"]), "b": S(C["summer"]), "layers": ["pad"]},                                 # calm pad back on "Wait" (short silence only under the splash)
    {"a": S(C["summer"]), "b": total / fps - 0.25, "layers": ["pad", "pluck", "kick"], "end": "button"},
]
json.dump(sections, open(os.path.join(PUB, "sections.json"), "w"), indent=1)
subprocess.run([sys.executable, os.path.join(AUDIO, "music.py"), "--mood", "playful", "--bpm", "104", "--seconds", f"{total / fps:.2f}",
                "--seed", "11", "--sections", os.path.join(PUB, "sections.json"), "--out", os.path.join(PUB, "bed.wav")],
               check=True, stdout=subprocess.DEVNULL)


def s(name, frame, lu, pan=0.0, anchor=0.0, **kw):
    return {"file": f"sfx/{name}.wav", "at_frame": int(frame), "naive_lu": lu, "role": "sfx", "pan": pan, "anchor": anchor, **kw}


# camera travels are 44 f centred on their cue (index.tsx) -> the whoosh PEAK lands on the cue frame.
# whoosh(0.6 s) peaks at 0.27 s, swish(0.3 s) at 0.135 s (sfx.py peak=0.45).
SW, WH = 0.135, 0.27
travels = [C["mayor"], C["foundry"], C["cart"], C["summer"], C["oldf"]]  # place changes (now ~10 f dissolves): a soft swish centred on each
quiet = [C["corner"], C["turn2"], C["circle"]]  # small push/pull moves in the explanation
tracks = [
    {"file": "vo.wav", "start": 0.1, "role": "voice", "highpass": 80},
    {"file": "bed.wav", "start": 0, "role": "music", "fade_in": 0.05},
    {"file": "sfx/roomtone.wav", "start": 0, "role": "ambience", "naive_lu": -32, "loop": True},
    {"file": "sfx/wind.wav", "start": 0, "role": "ambience", "naive_lu": -34, "loop": True},
    s("sparkle", C["square1"], -14),
    *[s("swish", f, -14, pan=(-0.3 if i % 2 else 0.3), anchor=SW) for i, f in enumerate(travels)],
    *[s("swish", f, -18, pan=(0.2 if i % 2 else -0.2), anchor=SW) for i, f in enumerate(quiet)],
    s("whoosh", C["spring"], -8, anchor=WH),                      # the crane: fastest move gets the biggest whoosh
    s("whoosh", C["morning"], -12, anchor=WH), s("tick", C["morning"] + 3, -16),  # time-jump dissolve
    s("swish", C["lifts"], -18, anchor=SW), s("swish", C["turns"], -18, anchor=SW),
    s("pop", C["squareQ"] - 8, -12), s("boing", C["squareQ"] - 6, -16),  # land BEFORE "Square?", not on it
    *[s("footstep", f, -20, pan=-0.2, distance_m=7) for f in range(C["mayor"] + 6, C["foundry"] - 6, 11)],
    s("rumble", C["cart"], -16, distance_m=6),
    s("sparkle", C["loves"], -14, pan=0.2),
    s("click", C["lifts"] + 4, -14), s("creak", C["turns"] + 4, -16), s("thud", C["slips"], -8),
    s("whoosh", C["drop"] + 6, -6, anchor=WH, send=0.4),          # peak on the follow-cam peak
    s("splash", C["hole"] - 2, -2, send=0.6, on_word=True),       # biggest hit, wet: it's down a shaft
    s("impact", C["hole"] + 9, -10),
    s("pop", C["wait"] - 6, -12),
    s("riser", C["explain"] - 60, -10), s("chime", C["explain"], -12, send=0.3),
    s("whoosh", C["through"], -12, anchor=WH), s("pop", C["circle"] + 8, -14), s("thud", C["never"], -8),
    s("ding", total - round(0.42 * fps), -4, send=0.3, on_word=True), s("sparkle", C["doubled"] + 3, -14),  # button AFTER "prices."
]
plan = {"duration": total / fps, "fps": fps, "target_lufs": -14, "true_peak": -1.0,
        "words": "words.json", "words_offset": 0.1, "duck_db": -3,
        "music_sections": [[0, S(C["explain"]), -13], [S(C["explain"]), S(C["summer"]), -14], [S(C["summer"]), total / fps, -12]],  # measured: music ~15.5 LU under VO (vfa stems, 3 hero shorts)
        "reverb": {"rt60": 1.0, "wet": 0.5}, "tracks": tracks}
json.dump(plan, open(os.path.join(PUB, "audio_plan.json"), "w"), indent=1)
subprocess.run([sys.executable, os.path.join(AUDIO, "mix.py"), os.path.join(PUB, "audio_plan.json"), "--out", os.path.join(PUB, "master.wav"),
                "--stems", os.path.join(PUB, "stems")], check=True)
