# Sound (craft sheet)

Sound carries the pace. In this style one narrator talks without a breath from frame 0 to the last word, over one
dark, steady music bed, with small effects on whatever moves on screen. The most important rule: **the voice never
stops and nothing competes with it**: about 0.08 s of silence at a full stop and never more than 0.15 s, a bed 15-19 LU
under the voice that neither ducks nor jumps, and at most two hits near voice level.

Units: seconds and frames (f) at 30 fps. "re voice" = relative to the voice's median short-term level (K-weighted,
20 ms) during speech; LUFS and dBTP are absolute. Script, word budgets and beat positions: `craft/script.md`.

## At a glance

| rule | target (median, range) | how to check |
|---|---|---|
| narration pace | 3.74 w/s [3.64-3.85] = 4.92 syllables/s [4.80-4.99]; none of the 20 below 4.64 syl/s | `tighten.py` output line; `story.py calibrate` |
| silence at full stops / commas | 0.08 s [0.07-0.09] (2-3 f) / 0.06 s [0.05-0.07]; 0 inside clauses | gaps in `words.json` (they read ~0.05 s long) |
| longest silence | 0.13 s [0.12-0.16]; no pause of 0.3 s or more in 18/20 | same |
| voice start, tail | first word at 0.00 s in 20/20; the file ends 0.32 s [0.26-0.36] (~10 f) after the last word | board `voOffset`, `tail`; `vfa analyze` `speech_start_s` |
| master | -14.1 LUFS (17/20; 3 at -15.1..-15.2), LRA 2.1 LU [1.8-2.4], true peak -2.1 dBTP [-2.2..-2.0] | `ffmpeg ... ebur128=peak=true` on the mp4 |
| bed under the voice | music + ambience + SFX 17.5 LU [14.5-18.1] under the voice during speech | voice stem minus bed stems, ffmpeg (Check) |
| one bed level | ten-part bed span 4.7 dB [3.6-5.9]; bed in sentence gaps = bed under speech (0.0 dB [-0.1..+0.1]) | not built: listen for swells and dips |
| music character | minor in 17/20 (D minor 12/20); a loose pulse of bass notes at ~83 bpm [71-102]; no drum kit | by ear; key / bpm not built |
| bed darkness | bed spectral centroid 510 Hz [422-576]; bed power above 6 kHz 0.6 % [0.3-1.2] | `vfa stems` + the one-liner in Check |
| music shape | no change at the "You see" pivot; a change at the twist (42 % of twists vs 20 % chance); -6.3 dB [-8.1..+0.6] after the last word | board `music` marks |
| SFX density | ~50 events per minute [29-61] (counts +-40 %), 87 % of them under speech | `sound_report.md` cue count |
| SFX levels | peak re voice: median -11 dB, p90 -5.3 dB, loudest -0.5 dB [-2.8..+1.7]; a sound on a transition at chance (27.5 % vs 26 %) | not built (peak report) |

## How it is built

1. **Choose one narrator for everything.** Character lines are read by the same voice, slightly higher (+1.1 st
   [-0.5..+2.5] over its narration), never by a second, lower voice. Describe the voice you want by character: close,
   dry, bright, an energetic storyteller with a wide rise and fall, evenly articulated, no audible breaths (the
   measured narrator sits around 198 Hz [188-204] median pitch). Never clone or imitate a real narrator.
2. **Make one take and measure it** (`tts.py estimate` first: takes cost credits). The delivery to listen for:
   - the same speed in short and long sentences (3.85 vs 3.88 w/s): no slowing down for a punchline; the punch comes
     from the edit and the pitch;
   - a wide melody: pitch range p5-p95 16.3 st, each statement falling about 3 st [2.2-4.8] from its first to its last
     quarter;
   - stress on numbers and negations (2.5x and 2.1x their share of the stressed words; function words 0.5x), not on
     the last word by habit (6 % of stressed words vs a 7 % base rate).
3. **Edit it breath-free.** `tighten.py` cuts inside the silences, never inside a word: about 0.08 s at a full stop,
   0.06 s at a comma, no extra pause before the pivot or the last line (reference 0.09 s there). If the tightened take
   is still under 3.6 w/s, re-take with `--speed` = 3.74 / measured w/s (ElevenLabs accepts up to about 1.2) or pick a
   faster voice. Check syllables too: the reference speaks 1.32 syllables per word; names, dates and long words push
   that up (ours 1.42) and slow the take at the same speed setting.
4. **Put it on the clock.** First word on frame 0 (`voOffset: 0`), the file ends ~0.3 s after the last word
   (`tail: 0.32`). Captions and cues follow `words.json`, so they move with the edit.
5. **Lay one bed.** One music cue under 100 % of the narration, plus the ambience `score.py` builds from the places
   (room tone inside, a street bed outside, rain where it rains). The cue measured in this style: minor key, a held bass
   note on each slow, loose beat (one note every ~0.7 s) with one sustained melody line above it (roughly 500-1,800 Hz),
   no kick or snare pattern, a dark spectrum (centroid ~500 Hz). The whole bed is dark, not only the music: under 1 %
   of its power lies above 6 kHz, so street, rain and room beds and bright effects (snips, sparkles, sizzles) need a
   low-pass or darker samples. It sits 17-18 LU under the voice and is not audibly ducked. The same KIND of cue
   returns in every video (key, tempo, timbre), not the same loop: no recording was found reused across the 20 shorts.
6. **Shape the bed at two points only.** It starts with the voice, stays within a few dB for the whole video, and does
   NOT change at the "You see" pivot (level -0.8 dB [-2.4..+0.7], novelty at chance). It changes once at the twist (a
   new section or a swell) and drops about 6 dB in the last ~0.3 s, with no sting or button ringing after the last
   word.
7. **Put effects on actions, not on edits.** About 50 small events a minute, each on something that moves on screen:
   low thumps (~31 % of events), clicks and pops (~25 %), impacts and crashes (~7 %), tonal dings (~2 %), whooshes and
   risers (~3 %); the rest is music-like. Density is highest in the hook (~54 per min) and the mechanism (42-49), lowest
   in the reveal (~30), where the music and one big hit carry it. One or two big hits reach voice level: on the hook's
   action (the loudest hit of the video sits in the first 2 s in 6/20; one of the three loudest in the first 3 s in
   10/20) and on the final catastrophe (last 10 % in 5/20). Of 12 loud events checked against the picture, 10 sat on a
   contact or an impact and none on a transition.
8. **Master to a fixed chain:** -14 LUFS, LRA about 2, true peak about -2 dBTP on the delivered file.
9. **Listen, then measure** (Check below). Listen to the hook, the twist and the last second on headphones.

## Rules

Narration
1. 3.6-3.85 w/s and 4.75-4.95 syllables/s, first word to last word. Not below 4.6 syl/s; not faster than the range
   either (inside it, slower did better: syl/s vs views rho -0.55, n 20, exploratory).
2. Silence 0.06-0.10 s at full stops (max 0.15 s), 0.04-0.08 s at commas, none inside clauses; zero gaps of 0.25 s or
   more anywhere.
3. First word on frame 0-1; the file ends 0.25-0.35 s after the last word.
4. No audible breaths; the rate is the same in short and long sentences.

Delivery
5. One narrator reads every line; character lines 0 to +3 st above the narration, in the same voice.
6. Pitch range p5-p95 of 14 st or more; statements fall 2-5 st from their first to their last quarter.
7. Stress lands on numbers and negations ("never", "nobody", "can't"), not automatically on the last word.

Mix
8. Master -14.0 +-0.2 LUFS integrated, LRA 1.7-2.5 LU, true peak -2.0 to -2.2 dBTP on the delivered mp4 (17/20
   references at -14.1 LUFS; none above -1.9 dBTP).
9. Bed (music + ambience + SFX) 15-19 LU under the voice during speech.
10. No audible ducking: the bed in sentence gaps within 1 dB of the bed under speech.
11. One bed level: the bed's 1.5 s running median, split into ten equal parts, spans 6 dB or less (reference 4.7 dB;
    16/20 stay within +-4 dB of their own median in all ten parts).

Music
12. Minor key; a slow, loose pulse of 65-115 bpm carried by bass notes, not drums; one melody line; no kick / snare
    pattern; the drums stem (which also catches foley) at or below the whole accompaniment (reference -0.1 dB).
13. Dark: bed spectral centroid 400-650 Hz and at most 1.5 % of the bed's power above 6 kHz (music + ambience + SFX,
    measured like the reference on the demucs accompaniment).
14. No arrangement change at the pivot (within +-1 dB, no new section); one change at the twist; the bed falls 6 dB
    (4-8) in the last 0.3 s; no sting, no button, no ring after the last word.
15. Music under the whole narration; no hard music stop by default.

SFX
16. 30-60 events per minute (reference 50 [29-61]; the better-viewed half used fewer, 35 vs 52, rho -0.39, p 0.10:
    weak), each on an on-screen action: a contact, a landing, a pop-in, a slam, a tap.
17. Peaks: median -10 to -13 dB re voice, p90 at -3 dB or below.
18. At most 2 cues per video at -3 dB re voice or louder, the loudest at 0 to +2 dB: the hook's action and/or the final
    catastrophe.
19. Nothing on a dissolve or a camera travel by default; a whoosh only when something flies past the lens.
20. Where older sheets disagree (`styles/toonworld-explainer.md` section 7 and `craft/general.md` "Sound": a whoosh on
    every travel, a calm pad under the explanation, a button hit after the last word, a bed 5-10 LU under the voice),
    this sheet wins for this style: the measurement contradicted each of them.

## In our engine

| what | where (file / field) | 1.9 value | status |
|---|---|---|---|
| narration gaps | `audio/tighten.py --max-gap`, `--sentence-gap` (CLI defaults; `make.mjs` words stage) | 0.08 / 0.14 s; lead silence cut when over 0.02 s; 0.15 s kept after the last word | built (the `tighten()` function's own defaults are still 0.2 / 0.3: call the CLI) |
| voice rate | `story.py calibrate words.json --voice ID` -> `story/voices.json` | clark-v4 2.72, clark-v4-tight 3.14 w/s | built (measures; does not correct) |
| voice speed | `audio/tts.py eleven --speed` | 1.0; `make.mjs` never passes it | partly: the flag exists; voice-speed calibration (pick `--speed` from a first take to land 3.6-3.85 w/s) not built |
| syllable rate, pitch range, breath check | - | - | not built (part of `vfa scriptcheck`) |
| voice start | `Board.voOffset` (`board.tsx planBoard`); `score.py` reads `voOffset` from `timeline.json` | default 0.1 s | partly: set `voOffset: 0` on every board |
| tail | `Board.tail` | default 0.9 s (`board.md` suggests 0.45) | partly: set `tail: 0.32` |
| character lines | `story.py export` (one `vo.txt`, the narrator reads all) vs `--per-speaker DIR` | narrator unless `--per-speaker` | built; the +1 st lift per line is not built |
| master | `score.py` plan `target_lufs`, `true_peak` -> `mix.py` | -14, -2.0 dBTP | built (the true peak is set on the WAV, and `score.py` writes -2.0 with no flag; the AAC encode can add 0.1-0.5 dB, so measure the mp4) |
| LRA | - | not targeted; `master_mixreport.json` prints ffmpeg's LRA | partly |
| music level | `score.py --music-lu`, `music_sections` | -19 LU; calm / thin sections -21 | built |
| ducking | plan `duck_db` (`mix.py`, from word timings); `sfx_word_duck_db` | -3 dB on music; detail SFX (`lu` below -8, not `on_word`) -6 dB under words | built (in 0.08 s gaps the duck hardly releases: the coin short measured 0.5 dB) |
| arrangement levels | `score.py MODE_DB` | build 0, full +1, calm -1, thin -2 dB, stop = silence | built (flattened in 1.9) |
| draft music marks | `story.py board` (`story/board.py`) | build on the hook, calm on the pivot, full on the payoff | partly: delete the `calm` on the pivot, move `full` to the twist |
| end of the music | `score.py`: a real track fades linearly over the last 0.35 s; the procedural bed's last section ends 0.25 s before the file end | - | built for tracks (with `tail: 0.32` the fade averages about -5.5 dB over the tail); partly for the procedural bed (silence instead of -6 dB); a final `stop` adds a button boom: avoid it |
| music choice | `public/ID/score.json` `{"track": NAME}` or `{"mood", "bpm"}` for `music.py` | default mood `curious` (lydian, low-pass 4 kHz), bpm 100 | not built: selection by key / bpm / centroid. Use a minor, dark library track, or `{"mood": "night", "bpm": 84}` (minor pads, no kick, low-pass 1.5 kHz; 205 Hz centroid on a 20 s test render, `curious` 452 Hz, `tense` 176-191 Hz) |
| ambience | `score.py`: `street_day` sample (or synthesized wind) outside, room tone inside, `rain_loop`; naive -24 LU | no filtering | partly: on the coin stems the ambience has 17 % of its power above 6 kHz and the effects 9 % (the music 0.3 %): no low-pass on the ambience or SFX bus yet |
| procedural `full` | `score.py SYNTH_LAYERS["full"]` | pad + pluck + kick | partly: kick moods (warm, tense, epic, playful) get a drum kit in `full` |
| SFX levels | `score.py DEFAULT_LU` (naive LU re voice; `mix.py` takes a further 6 dB off events) | impact -9, thud -11, hammer -11, sizzle -11, press -11, snip -12, whoosh -12, click -14, pop -15, swish -15, tick -18 | built (lowered in 1.9 without a new measurement) |
| sounds from the picture | `board.tsx boardSounds` | fx impact -8, other fx pop -15, stamp thud -13, prop pop / drop -15, counter tick-tick-ding, `big` impact -10, crowd -12, whip whoosh -12, every `kick` a thud at -6 (`on_word`); nothing on dissolves or travels | built; partly: the kick thud is exempt from word ducking and is a source of hot peaks |
| board fields | `Beat.sfx` (name or `{ name, lu, df, anchor, pan, on_word }`), `Beat.music` (build / full / calm / thin / stop) | - | built |
| SFX peak limiter | - | - | not built: at most 2 cues at -3 dB re voice or louder, momentary peak at most voice median +1 dB |
| reports | `public/ID/sound_report.md`, `public/ID/master_mixreport.json` | cue list (real / synth / skipped); LUFS, TP, ffmpeg I / LRA, `speech_margin_median` / `_p10`, `level_errors` | built |
| whole-render check | `vfa scriptcheck` | - | not built (demucs + whisper + the rule tables of this sheet and `craft/script.md`) |

On a board (invented example, the manhole script of `craft/script.md`):

```ts
const board: Board = {
  id: "lids", title: "Why Manhole Lids Aren't Square", words: WORDS,
  voOffset: 0,   // first word on frame 0 (default 0.1 s)
  tail: 0.32,    // the file ends ~0.3 s after the last word (default 0.9 s)
  // ...cast, places, props
  beats: [
    // big hit 1: the lid lands 4 f after the beat; thud 3 dB over its default (-11)
    { at: 0, place: "street", key: "day", music: "build", sfx: [{ name: "thud", lu: -8, df: 4 }] },
    // small foley on what moves (the chains), default level
    { at: "rattled", sfx: [{ name: "click", df: 2 }, { name: "click", df: 9 }] },
    // no music mark on the "You see" pivot
    { at: "morning", music: "full" },                          // the one change, on the twist (~83 %)
    // big hit 2: the lid tips and swallows him; impact 3 dB over its default (-9)
    { at: "knees", sfx: [{ name: "impact", lu: -6, on_word: true }] },
    // no final `music: "stop"`: on the procedural bed it adds a button boom after the last word
  ],
};
// public/lids/score.json: { "track": "<a minor, dark library cue>" } or { "mood": "night", "bpm": 84 }
```

## Check

- **Pace:** `tighten.py` prints `tighten: A s -> B s (x % shorter), r0 -> r1 words/s`; r1 must be 3.6-3.85. Store it:
  `py story/story.py calibrate public/ID/words.json --voice ID`.
- **Gaps and start:**
  `py -c "import json,sys; W=json.load(open(sys.argv[1])); g=[b['start']-a['end'] for a,b in zip(W,W[1:])]; print(W[0]['start'], round(max(g),3), sum(x>=0.25 for x in g))" public/ID/words.json`
  prints the first word's start, the longest gap and the gaps of 0.25 s or more. A failure: a start over 0.02 s, a
  longest gap over 0.2 s, any count above 0. (Word-timing gaps read about 0.05 s longer than the audible silence.)
- **Master:** `ffmpeg -hide_banner -nostats -i FINAL.mp4 -af ebur128=peak=true:framelog=quiet -f null -` prints I,
  LRA and the true peak. Check the mp4, not the WAV. Failure: I outside -13.8..-14.2, LRA above 2.5, true peak above
  -1.9 (target -2.0 to -2.2).
- **Bed:** in `public/ID/stems/`, `ffmpeg -hide_banner -nostats -i voice.wav -af ebur128=framelog=quiet -f null -`
  and `ffmpeg -hide_banner -nostats -i music.wav -i sfx.wav -i ambience.wav -filter_complex
  "amix=inputs=3:normalize=0,ebur128=framelog=quiet" -f null -`; the difference of the two I values must be 15-19 LU
  (under 15: the bed is too loud; over 19: it is lost). The mix report's `speech_margin_median` is a per-window
  median and reads higher (coin 1.9 remix: 19.5 there, 16.3 LU this way). `vfa stems FINAL.mp4` adds per-sentence
  voice-over-music margins, the SFX onset rate and `music_stops` (any stop is a failure unless it was planned).
- **Darkness:** run `vfa stems FINAL.mp4`, then on its demucs accompaniment (`FINAL_analysis/stems/music.wav` = music
  + SFX + ambience, the method behind the reference numbers):
  `py -c "import sys,numpy as np;from scipy.io import wavfile;from scipy.signal import stft;sr,x=wavfile.read(sys.argv[1]);x=x.astype(float);x=x.mean(1) if x.ndim>1 else x;f,t,Z=stft(x,sr,nperseg=2048);P=abs(Z)**2;e=P.sum(0);c=(f[:,None]*P).sum(0)/(e+1e-12);b=(f>=20)&(f<16000);print(round(float(np.median(c[e>np.percentile(e,30)]))),'Hz',round(100*P[(f>=6000)&b].sum()/P[b].sum(),2),'% above 6 kHz')" FINAL_analysis/stems/music.wav`
  (power-weighted centroid per frame, median over the louder 70 % of frames). Targets 400-650 Hz and at most 1.5 %.
  Compare centroids only through demucs: on the same coin mix (1.9 remix) the demucs accompaniment reads 1,612 Hz and
  our own bed stems 467 Hz. The share above 6 kHz agrees between the two (6.2 % vs 7.5 %), so run the one-liner on
  `public/ID/stems/music.wav`, `sfx.wav` and `ambience.wav` to find the bright layer.
- **Effects:** `sound_report.md` rows / minutes = events per minute (30-60). Look at each listed frame on a still:
  the sound must sit on a contact. Peaks re voice and the two-hit limit have no tool yet: listen for any effect louder
  than the word it lands on.
- **Speech on the render:** `vfa analyze FINAL.mp4 --speech whisper`: `speech_start_s` 0.0, `wps_speaking`, pause
  median and p90.
- **Ears:** the hook, the twist and the last second. A failure is an audible pause, a swell on "You see", an effect
  over a word, or a ring after the last word.

## Common mistakes

From our coin short (56 s):

| what went wrong | ours vs reference | fix |
|---|---|---|
| a slow narrator | 3.09 w/s, 4.40 syl/s (below all 20 references) vs 3.74 / 4.92; tightening alone reaches ~3.2 w/s | `--speed` 1.15-1.2 or a faster voice, then the 1.9 tighten caps; fewer names and dates (1.42 vs 1.32 syllables per word) |
| breathing room | full stops 0.12 s, commas 0.095 s, longest 0.24 s, two pauses of 0.41 s vs 0.08 / 0.06 / 0.13 s, none | `tighten.py` 0.08 / 0.14 (1.9 defaults) |
| a late start, a long end | voice at 0.10 s, tail 0.46 s vs 0.00 / 0.32 s | `voOffset: 0`, `tail: 0.32`; and put board settings on their own line: in the coin board `voOffset: 0.1, tail: 0.45` sit after a `//` comment on the same line, so the board runs on the defaults (tail 0.9 s) |
| other voices for the characters | separate voices 4.9 st BELOW the narrator vs the narrator himself 1.1 st above | one `vo.txt` for all lines (no `--per-speaker`) |
| hot effects | SFX peaks p90 +1.3 dB, loudest +4.3 dB re voice vs -5.3 / -0.5 dB; about 10 cues hand-set at -4..-7 LU plus a -6 LU thud on every `kick` | leave `lu` at the defaults, raise only the two big hits (by 3 dB at most), then listen |
| sound on the edit | 43 % of our cuts carried a sound (chance 20 %) vs chance level | fixed in 1.9: no swish on dissolves or travels |
| a restless bed | 11 music marks (3 stops, `calm` on the pivot): ten-part span 7.6 dB with +5.2 dB in the 50-60 % part, LRA 2.8 vs 4.7 dB and 2.1; the 1.9 remix with the same marks still reads LRA 2.6 | `build` at 0, one change at the twist, the fade at the end |
| a bright, hissy bed | centroid 1,692 Hz and 6.3 % of the bed's power above 6 kHz vs 510 Hz and 0.6 %; drums stem +2.6 dB re accompaniment vs -0.1 dB. Still there in the 1.9 remix (1,612 Hz, 6.2 %). The hiss is the ambience (17 % of its power above 6 kHz) and the effects (9 %); the music track is 0.3 % | low-pass the street, rain and room beds and the bright effects near 6 kHz, or pick darker samples; keep a dark, minor, kit-free cue |
| a hot master | true peak -1.5 dBTP vs -2.1 | 1.9 plan value -2.0; measure the mp4 |

What was already right: integrated loudness -14.1 LUFS, bed margin 17.6 LU (16.9 on the true stems), D minor, 60
events per minute.

## Sources

The private study of 20 shorts of a reference channel in this style (35,987 frames; vocal and accompaniment stems,
BS.1770 loudness, word timings; 13 frame logs for the effect-to-picture checks; 2026-11-12); earlier full-mix audio
notes agree within their error (bed 15 +-3 dB vs 17.5 +-1 LU).
