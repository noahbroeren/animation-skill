#!/usr/bin/env python3
"""Sound design for the elevator proof short, read from the picture's cues in timeline.json (one source of truth).

  py make_audio.py <render_out>/timeline.json

Same level model as the manhole demo (references/craft.md "Sound"): every cue is set by loudness relative to the
voice (naive_lu); camera place-changes get a swish centred on the dissolve; the music is arranged per story section
and STOPS dead under the drop (silence under the big moment), comes back calm for the night explanation, and full
for the payoff with a button hit after the last word.
"""
import json, os, shutil, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
AUDIO = os.path.abspath(os.path.join(ENGINE, "..", "audio"))
PUB = os.path.join(ENGINE, "public", "elevator")
tl = json.load(open(sys.argv[1], encoding="utf-8"))
fps, total = tl["fps"], tl["durationInFrames"]
C = {k.split(".", 1)[1]: v for k, v in tl.get("cues", {}).items() if k.startswith("otis.")}
if not C:
    raise SystemExit("timeline.json has no otis.* cues -- render with the current engine first")
S = lambda f: f / fps
sfx = os.path.join(PUB, "sfx")
if not os.path.exists(os.path.join(sfx, "creak.wav")):
    subprocess.run([sys.executable, os.path.join(AUDIO, "sfx.py"), "pack", sfx], check=True, stdout=subprocess.DEVNULL)
shutil.copy(os.path.join(HERE, "words.json"), os.path.join(PUB, "words.json"))

sections = [
    {"a": 0, "b": S(C["back"]), "layers": ["pad", "pluck"]},                                   # hook: curious, light
    {"a": S(C["back"]), "b": S(C["heck"]), "layers": ["pad"]},                                 # flashback: thin
    {"a": S(C["heck"]), "b": S(C["dropped"]) - 0.05, "layers": ["pad", "pluck", "kick"], "end": "stop"},  # build, hard stop
    {"a": S(C["wait"]), "b": S(C["three"]), "layers": ["pad"]},                                # calm explanation
    {"a": S(C["three"]), "b": total / fps - 0.25, "layers": ["pad", "pluck", "kick"], "end": "button"},
]
json.dump(sections, open(os.path.join(PUB, "sections.json"), "w"), indent=1)
subprocess.run([sys.executable, os.path.join(AUDIO, "music.py"), "--mood", "curious", "--bpm", "100", "--seconds", f"{total / fps:.2f}",
                "--seed", "7", "--sections", os.path.join(PUB, "sections.json"), "--out", os.path.join(PUB, "bed.wav")],
               check=True, stdout=subprocess.DEVNULL)


def s(name, frame, lu, pan=0.0, anchor=0.0, **kw):
    return {"file": f"sfx/{name}.wav", "at_frame": int(frame), "naive_lu": lu, "role": "sfx", "pan": pan, "anchor": anchor, **kw}


SW, WH = 0.135, 0.27  # swish / whoosh peak offsets (sfx.py peak = 0.45)
places = [C["back"], C["nobody"], C["heck"], C["yousee"], C["three"], C["andOtis"]]  # ~10 f dissolves
floor_step = (C["stairs"] - C["nobody"] - 6) / 6
tracks = [
    {"file": "vo.wav", "start": 0.1, "role": "voice", "highpass": 80},
    {"file": "bed.wav", "start": 0, "role": "music", "fade_in": 0.05},
    {"file": "sfx/roomtone.wav", "start": 0, "role": "ambience", "naive_lu": -30, "loop": True},
    {"file": "sfx/wind.wav", "start": 0, "role": "ambience", "naive_lu": -36, "loop": True},
    *[s("swish", f, -14, pan=(-0.3 if i % 2 else 0.3), anchor=SW) for i, f in enumerate(places)],
    s("pop", C["cut1"] - 3, -14),                                            # the "!" over his head
    # flashback hoist
    s("creak", C["back"] + 12, -16, distance_m=6), s("impact", C["snap0"], -8), s("whoosh", C["fell"] - 4, -10, anchor=WH),
    s("thud", C["fell"], -4, on_word=True, send=0.3), s("impact", C["fell"] + 2, -10), s("sparkle", C["everyone"], -16),
    # floors counter: a tick per floor, a stamp on "five"
    *[s("tick", C["nobody"] + 6 + round(i * floor_step), -18) for i in range(6)], s("thud", C["five"] - 2, -12),
    s("pop", C["heck"] + 4, -16),                                            # the "?" over the mocker
    s("chime", C["elisha"], -18, send=0.3), s("swish", C["tipped"] - 2, -18, anchor=SW),
    # the axe: wind-up swish, strike whoosh peaking on the hit, the rope snap
    s("swish", C["swung"], -14, anchor=SW), s("whoosh", C["snapped"] - 1, -10, anchor=WH),
    s("impact", C["snapped"], -4, on_word=True), s("creak", C["snapped"] + 6, -14),
    # the drop: rumble, the catch (biggest hit), the ratchet click, then silence
    s("rumble", C["dropped"] - 3, -12), s("thud", C["dropped"] + 3, -2, on_word=True, send=0.4), s("click", C["dropped"] + 4, -8),
    s("impact", C["dropped"] + 5, -10),
    s("pop", C["wait"] - 4, -12),
    # explanation
    s("riser", C["yousee"] - 54, -12), s("chime", C["yousee"], -14, send=0.3), s("sparkle", C["wagon"], -18),
    s("swish", C["bent"], -18, anchor=SW), s("swish", C["slack"], -16, anchor=SW), s("click", C["snapFlat"] + 2, -10),
    s("thud", C["jammed"] - 1, -8), s("ding", C["so2"], -14, send=0.3),
    # 1857 + ending
    s("creak", C["three"] + 24, -20, distance_m=8), s("sparkle", C["elevator2"], -14, pan=-0.2),
    s("riser", C["decades"] - 6, -14), s("sparkle", C["sky"], -16),
    s("ding", total - round(0.45 * fps), -4, send=0.3, on_word=True),        # button AFTER "possible."
]
plan = {"duration": total / fps, "fps": fps, "target_lufs": -14, "true_peak": -1.5,  # AAC encode adds ~0.1-0.5 dB: -1.5 master -> <= -1.0 delivered
        "words": "words.json", "words_offset": 0.1, "duck_db": -3,
        "music_sections": [[0, S(C["yousee"]), -19], [S(C["yousee"]), S(C["three"]), -21], [S(C["three"]), total / fps, -18]],  # reference short (vfa stems): music ~20 dB under the voice, playing 100 % of the runtime
        "reverb": {"rt60": 1.2, "wet": 0.45}, "tracks": tracks}
json.dump(plan, open(os.path.join(PUB, "audio_plan.json"), "w"), indent=1)
subprocess.run([sys.executable, os.path.join(AUDIO, "mix.py"), os.path.join(PUB, "audio_plan.json"), "--out", os.path.join(PUB, "master.wav"),
                "--stems", os.path.join(PUB, "stems")], check=True)
