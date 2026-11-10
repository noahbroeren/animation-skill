#!/usr/bin/env python3
"""Sound design for the lighthouse short. Every cue is computed from words.json with the SAME
formulas as index.tsx timing(), so sound can't drift from picture. Writes public/lighthouse/master.wav."""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
AUDIO = os.path.abspath(os.path.join(ENGINE, "..", "audio"))
PUB = os.path.join(ENGINE, "public", "lighthouse")
FPS, OFF = 30, 0.15
words = [{**w, "start": w["start"] + OFF, "end": w["end"] + OFF} for w in json.load(open(os.path.join(HERE, "words.json")))]
def W(txt, frm=0): return next(i for i, w in enumerate(words) if i >= frm and w["word"].lower().startswith(txt.lower()))
at = lambda i: words[i]["start"]
F = lambda s: round(s * FPS)
T = dict(total=F(words[-1]["end"] + 1.5), travel1=F(at(W("At")) + 0.15), rack=F(at(W("tiny")) + 0.25), crane=F(at(W("You")) + 0.75),
         cut=F(at(W("Sailors")) - 0.2), book=F(at(W("book"))), happy=F(at(W("exactly"))), travel2=F(at(W("So", 60)) + 0.1), here=F(at(W("here"))))
dur = T["total"] / FPS
sfx = os.path.join(PUB, "sfx")
if not os.path.exists(os.path.join(sfx, "whoosh.wav")):
    subprocess.run([sys.executable, os.path.join(AUDIO, "sfx.py"), "pack", sfx], check=True, stdout=subprocess.DEVNULL)
subprocess.run([sys.executable, os.path.join(AUDIO, "music.py"), "--mood", "night", "--bpm", "80", "--seconds", f"{dur:.2f}", "--seed", "4",
                "--hits", f"{T['here'] / FPS:.3f}", "--out", os.path.join(PUB, "bed.wav")], check=True, stdout=subprocess.DEVNULL)
flashes = [at(W("Two")), at(W("Two")) + 0.45, at(W("Two")) + 2.2]
tracks = [
    {"file": "vo_tight.wav", "start": OFF, "role": "voice", "highpass": 80},
    {"file": "bed.wav", "start": 0, "gain_db": -15, "role": "music", "fade_in": 0.4, "fade_out": 1.2, "duck_db": -8},
    {"file": "sfx/wind.wav", "start": 0, "gain_db": -30, "role": "ambience", "loop": True},
    {"file": "sfx/rumble.wav", "start": 0.2, "gain_db": -24, "role": "ambience"},
    {"file": "sfx/whoosh.wav", "at_frame": T["travel1"] - 24, "gain_db": -9, "role": "sfx", "pan": 0.3},
    {"file": "sfx/swish.wav", "at_frame": T["rack"] + 4, "gain_db": -16, "role": "sfx", "pan": -0.2},
    {"file": "sfx/whoosh.wav", "at_frame": T["crane"] - 4, "gain_db": -10, "role": "sfx"},
    *[{"file": "sfx/chime.wav", "at_frame": F(t), "gain_db": -20, "role": "sfx", "pan": 0.15 * (i - 1)} for i, t in enumerate(flashes)],
    *[{"file": "sfx/pop.wav", "at_frame": F(t) + 1, "gain_db": -14, "role": "sfx"} for t in (at(W("Two")), at(W("quick")) + 0.1, at(W("One", 40)))],
    {"file": "sfx/thud.wav", "at_frame": T["cut"], "gain_db": -18, "role": "sfx"},
    {"file": "sfx/swish.wav", "at_frame": T["book"] - 6, "gain_db": -12, "role": "sfx", "pan": 0.2},
    {"file": "sfx/sparkle.wav", "at_frame": T["happy"], "gain_db": -16, "role": "sfx"},
    {"file": "sfx/whoosh.wav", "at_frame": T["travel2"] - 2, "gain_db": -9, "role": "sfx", "pan": -0.3},
    {"file": "sfx/impact.wav", "at_frame": T["here"] - 1, "gain_db": -10, "role": "sfx"},
    {"file": "sfx/chime.wav", "at_frame": T["here"], "gain_db": -12, "role": "sfx"},
]
plan = {"duration": dur, "fps": FPS, "target_lufs": -14, "true_peak": -1.0, "tracks": tracks}
json.dump(plan, open(os.path.join(PUB, "audio_plan.json"), "w"), indent=1)
subprocess.run([sys.executable, os.path.join(AUDIO, "mix.py"), os.path.join(PUB, "audio_plan.json"), "--out", os.path.join(PUB, "master.wav"),
                "--stems", os.path.join(PUB, "stems")], check=True)
print(json.dumps(T))
