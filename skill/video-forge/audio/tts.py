#!/usr/bin/env python3
"""Voice-over: synthesize (offline) and/or align word timings.

  py tts.py say  --text-file script.txt --out vo.wav [--voice NAME] [--rate 1]   # Windows SAPI / macOS say / espeak
  py tts.py align vo.wav --out words.json [--text-file script.txt]               # faster-whisper word timestamps
  py tts.py voices

Word timings (words.json) are the clock of the whole video: captions, lip-flap,
reaction timing (land reactions 0-3 frames BEFORE the word), cuts on stressed
words and music ducking all read it.

Better voices: ElevenLabs (via its MCP connector or API) or a human recording.
PAID SERVICES: always show the user the estimated credit cost and get an explicit
yes before generating. Then run `align` on the resulting file.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile


def say(text: str, out: str, voice: str | None = None, rate: int = 0):
    out = os.path.abspath(out)
    sysname = platform.system()
    if sysname == "Windows":
        tf = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8")
        tf.write(text)
        tf.close()
        ps = (
            "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
            + (f"$s.SelectVoice('{voice}'); " if voice else
               "$v = $s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name }; "
               "foreach ($p in @('Microsoft Aria','Microsoft Guy','Microsoft Jenny','Microsoft Zira','Microsoft David')) "
               "{ $m = $v | Where-Object { $_ -like \"$p*\" } | Select-Object -First 1; if ($m) { $s.SelectVoice($m); break } }; ")
            + f"$s.Rate = {int(rate)}; "
            + "$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono); "
            + f"$s.SetOutputToWaveFile('{out}', $fmt); $s.Speak([IO.File]::ReadAllText('{tf.name}')); $s.Dispose(); Write-Output $s.Voice.Name"
        )
        r = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True)
        os.unlink(tf.name)
        if r.returncode != 0 or not os.path.exists(out):
            raise SystemExit(f"SAPI failed: {r.stderr[-500:]}")
    elif sysname == "Darwin":
        aiff = out + ".aiff"
        subprocess.run(["say", *(["-v", voice] if voice else []), "-o", aiff, text], check=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", aiff, "-ar", "48000", out], check=True)
        os.unlink(aiff)
    else:
        eng = shutil.which("espeak-ng") or shutil.which("espeak")
        if not eng:
            raise SystemExit("no offline TTS found (install espeak-ng) -- or record / use a paid voice")
        subprocess.run([eng, *(["-v", voice] if voice else []), "-w", out, text], check=True)
    return out


def voices():
    if platform.system() == "Windows":
        ps = "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | % { $_.VoiceInfo.Name + ' | ' + $_.VoiceInfo.Culture }"
        print(subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True).stdout)
    else:
        print("macOS: `say -v ?`; Linux: `espeak-ng --voices`")


def align(audio: str, out: str, text: str | None = None, model: str = "small"):
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "analyzer"))
    from vfa.audio import transcribe  # noqa: E402
    tr = transcribe(audio, model, language="en")
    if not tr or not tr.get("words"):
        raise SystemExit(f"alignment failed: {tr and tr.get('error')}")
    words = [{"word": w["word"], "start": w["start"], "end": w["end"]} for w in tr["words"]]
    if text:  # restore exact script spelling/punctuation when token counts match
        toks = text.split()
        if len(toks) == len(words):
            for w, t in zip(words, toks):
                w["word"] = t
    with open(out, "w", encoding="utf-8") as f:
        json.dump(words, f, indent=1)
    dur = words[-1]["end"] - words[0]["start"]
    print(f"{out}: {len(words)} words, {len(words) / max(1e-6, dur):.2f} words/s, speech {words[0]['start']:.2f}-{words[-1]['end']:.2f}s")
    return words


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("say")
    p.add_argument("--text-file", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--voice")
    p.add_argument("--rate", type=int, default=0)
    p = sub.add_parser("align")
    p.add_argument("audio")
    p.add_argument("--out", required=True)
    p.add_argument("--text-file")
    p.add_argument("--model", default="small")
    sub.add_parser("voices")
    a = ap.parse_args()
    if a.cmd == "say":
        print(say(open(a.text_file, encoding="utf-8").read(), a.out, a.voice, a.rate))
    elif a.cmd == "align":
        align(a.audio, a.out, open(a.text_file, encoding="utf-8").read() if a.text_file else None, a.model)
    else:
        voices()


if __name__ == "__main__":
    main()
