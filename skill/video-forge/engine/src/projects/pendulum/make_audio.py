#!/usr/bin/env python3
"""Sound design for the pendulum long-form demo, driven by the render's timeline.json
(scene starts/transitions) + words.json. Usage: py make_audio.py <timeline.json>"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
AUDIO = os.path.abspath(os.path.join(ENGINE, "..", "audio"))
PUB = os.path.join(ENGINE, "public", "pendulum")
tl = json.load(open(sys.argv[1]))
fps, total = tl["fps"], tl["durationInFrames"]
TITLE = 3.5
sfx = os.path.join(PUB, "sfx")
if not os.path.exists(os.path.join(sfx, "whoosh.wav")):
    subprocess.run([sys.executable, os.path.join(AUDIO, "sfx.py"), "pack", sfx], check=True, stdout=subprocess.DEVNULL)
subprocess.run([sys.executable, os.path.join(AUDIO, "music.py"), "--mood", "curious", "--bpm", "88", "--seconds", f"{total / fps:.2f}",
                "--seed", "7", "--out", os.path.join(PUB, "bed.wav")], check=True, stdout=subprocess.DEVNULL)
tracks = [{"file": "vo.wav", "start": TITLE, "role": "voice", "highpass": 80},
          {"file": "bed.wav", "start": 0, "gain_db": -13, "role": "music", "fade_in": 0.3, "fade_out": 2.5, "duck_db": -9},
          {"file": "sfx/roomtone.wav", "start": 0, "gain_db": -34, "role": "ambience", "loop": True},
          {"file": "sfx/riser.wav", "start": 0.2, "gain_db": -20, "role": "sfx"}]
kind = {"dip": "swish", "whip": "whoosh", "zoom": "whoosh", "crossfade": "swish"}
for sc in tl["scenes"][1:]:
    if sc["transition"] in kind:
        tracks.append({"file": f"sfx/{kind[sc['transition']]}.wav", "at_frame": max(0, sc["start"] - 3), "gain_db": -12, "role": "sfx"})
chart = next(s for s in tl["scenes"] if s["id"] == "chart")
words = json.load(open(os.path.join(HERE, "words.json")))
for i in (33, 42):  # counter + bar reveals
    tracks.append({"file": "sfx/pop.wav", "at_frame": round((words[i]["start"] + TITLE) * fps), "gain_db": -14, "role": "sfx"})
tracks.append({"file": "sfx/chime.wav", "at_frame": tl["scenes"][-1]["start"] + 10, "gain_db": -14, "role": "sfx"})
plan = {"duration": total / fps, "fps": fps, "target_lufs": -14, "true_peak": -1.0, "tracks": tracks}
json.dump(plan, open(os.path.join(PUB, "audio_plan.json"), "w"), indent=1)
subprocess.run([sys.executable, os.path.join(AUDIO, "mix.py"), os.path.join(PUB, "audio_plan.json"), "--out", os.path.join(PUB, "master.wav")], check=True)
