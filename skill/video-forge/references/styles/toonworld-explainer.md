# Style profile: "toonworld explainer" (2D characters in an inked, painted 3D world)

How this profile was built:
- Measured from the Shorts channel @RicksClips3000 on 2026-11-10: 149 shorts, 418.7 M views. I downloaded 42 (all 27 current-era shorts plus 15 sketch-era) and analysed every frame with `vfa batch`.
- Three hero shorts got word-level Whisper breakdowns (`vfa breakdown`): 33 M, 27 M and 17 M views.
- Per-lighting-setup reference numbers come from a second, independent frame-level study (claude-animated-shorts, MIT, 20 shorts).
- Footage is not redistributed. Numbers and paraphrase only.

Use it for any topic. The style is the *system* below, not the channel's stories.

> **1.9 update (2026-11-12): the 20 newest shorts were re-studied frame by frame (all 35,987 frames looked at), and
> several numbers below turned out to be measurement artefacts.** Where this pack and `references/craft/` disagree,
> the craft sheets win. The corrections that matter:
> - **Joins:** about 81 % of shot changes are cross-dissolves of 7-9 frames; hard cuts are 0-2 per film. The automatic
>   cut detector misses dissolves, so the "16 s average shot" in the fingerprint is wrong: shots last a median 2.2 s,
>   joined softly, with the camera moving through every join (`craft/edit.md`).
> - **Glides:** the "44 f glide" is several moves merged. Accent moves last a median 16 f (about 7 f ease each side) on
>   top of a constant push; the camera is still on fewer than 4 % of frames (`craft/camera.md`).
> - **No whoosh on travels:** transitions carry a sound effect only at chance level (`craft/sound.md`).
> - **Characters:** one off-white face fill for the whole cast (no skin tones; warm or pink faces are scene light), a
>   plum-black ink, an outline thin on the lit side and thick on the shadow side, single-stroke limbs with disc hands;
>   front view 76 %, three-quarter 20 %; 2-frame blinks; lip sync only on quoted lines (`craft/characters.md`,
>   `craft/acting.md`). Do not copy that combination for a cast of our own (`craft/character-design.md`).
> - **Shading:** a cast shadow keeps ~45 % of the light and the surface hue, a form shadow ~22 % (`craft/shading.md`).
> - **Light:** about 4 keys and 5 changes per short, day first, night in the middle, golden late (`craft/lighting.md`).
> - **Script:** 3.74 words/s, ~234 words in 63 s, sentences ~15.5 words, the mechanism at ~73 % (`craft/script.md`).
> - **Sound:** a dark minor-key bed ~17.5 LU under the voice, ~50 small SFX a minute about 11 dB under it, -2 dBTP
>   (`craft/sound.md`).

## 1. Two eras, and what changed

| | sketch era (older, n=15) | explainer era (current, n=27) |
|---|---|---|
| format | 7-11 s joke skits, emoji titles | 40-78 s (median 59.5 s) story explainers, "Why/How..." titles |
| views | median ~1.5 M (top 15 M) | median ~8 M (top 33 M) |
| speech | 2.6 words/s | **3.63 words/s** (IQR 3.51-3.78), starts at frame 0 |
| camera | moving 84 % of frames, glides ~20 f | **moving 99 %**, 55 % of frames fast, glides **~44 f** (ease-in 9 f, ease-out 11.5 f), push-in in every shot |
| edit | ASL 5.7 s | hard cuts rare: ASL **16 s**, 2.7 cuts/min (10/27 videos have ≤ 1 cut), BUT **18-26 soft transitions/min** (quick 9-10 f dissolves, zoom and whip transitions; `vfa transitions`, 3/3 hero shorts) |
| grade | pure black (p1 = 0), clipped whites | **lifted blacks (p1 ≈ 0.098)**, whites ≈ 0.95, never clipped |
| sound | -13.7 LUFS, LRA 1.7 | -14.1 LUFS, LRA **2.2** (very compressed), TP ≈ -2 dBTP |

Lesson: the jump to long camera glides, lifted and coloured blacks, fact-based paradox stories, and relentless 3.6 words/s narration came with a jump of about 5× in median views.

Across all 42 videos, the strongest rank correlations with log(views) are longer glides (ρ +0.40) and longer ease-out (ρ +0.44). These are confounded by the era change. Treat them as hypotheses, not laws.

## 2. Script formula (27/27)

1. **Hook = an absurd act stated as fact, sentence 1, no setup.** Three forms:
   - a person did something that sounds dumb or impossible, with stakes
   - "If you X, you'd Y"
   - "X is illegal / impossible, yet ..."

   10-18 words. The voice starts on frame 0.
2. **Setting in 1-2 lines**, present tense, concrete: numbers, place, a named everyman or role.
3. **Rival or crowd mocks**, with 1-3 short in-character lines ("You're wrecking my railroad.").
4. **Escalation** across 3-6 beats, often marked in time ("In May... By July...").
5. **Mystery beat** ("Wait, what?" / "Did your frogs get hungry again?").
6. **Pivot "You see,"** followed by the real mechanism, explained with an everyday analogy. "You see" is the most common sentence opener in the channel.
7. **Ironic payoff** in the last 1-2 sentences. The video ends on the last word: no outro, no call to action.

Median sentence length is about 13 words. Contractions, no jargon unless it is explained in the next clause. Fact-check everything, and use story framing ("he", a fictional everyman) around a true mechanism.

## 3. Camera and editing grammar (from the hero breakdowns)

- **One camera move per sentence**, alternating push and pull. The 33 M short runs push ×1.18, pull ×0.61, push ×1.20, pull ×0.94, push ×2.40, pull ×0.44 and so on. Camera grammar is in the `camera` column of `vfa breakdown`.
- **Fast travels on sentence boundaries**, always with strong motion blur. 55 % of frames are "fast".
  - Engine: `look.motionBlur 0.5` + `Stage3D camAt`.
- **Glides about 44 frames, symmetric ease.** Between them, a constant slow exponential push-in. No handheld float.
  - Engine: `cameraRig({ push: { rate: 0.0025-0.003, punches: [key words] } })`.
- **Punch push-ins on key words.** Punch rate about 0.006-0.007/frame for about 30 frames.
- **Very few HARD cuts, and every cut lands on a word onset.** Measured: the 27 M short has 1 cut in 65 s, at 3.73 s on "two" (-0.01 s). In the 33 M short a cut lands on "Did" (+0.02 s).
- **Cut or glide:** anything over half a frame width or 40 % zoom is a cut, not a fly. Otherwise glide for at least 0.075 × px@720 frames (`glideOrCut()`).
- **Impact kick:** the offset flips sign every frame for 6-8 f, about 3 px at 720p. The push-in stops at the hit.
- **Soft transitions are the real edit (measured with `vfa transitions`, 3 hero shorts, 2026-11-10):** 18.4 / 22.2 / 25.8 soft
  transitions per minute, of which 4.6 / 14.8 / 12.9 cross-dissolves; median length 9-10.5 f. The old cut detector saw only 3 of
  25 scene changes in the 33 M short, which is why "ASL 16 s" looked so long. Use in-world dissolves (`dissolve` keys,
  ~10 f) between beats and places, plus zoom/whip travels; keep hard cuts for word-onset punches. White flash: 4 f.
- **DOF only on close-up, medium and insert beats** (about 1/3 of shots); wides stay sharp. Never pull focus inside a shot.

## 4. Look (engine presets `toonworld-day | golden | night | interior` + `TOON_SETUPS`)

**Grade:**
- lifted, coloured blacks (p1 ≈ 0.08-0.12; day RGB about (35,19,20), night about (9,10,38))
- whites 0.95-0.97
- saturation about 0.45-0.5 HSV mean
- contrast (luma std) about 0.20
- no grain

**Shadow tints:**
- channel median Lab a* +10.6, b* -5.4 (magenta-violet)
- day shadows keep the surface hue at about 0.5 × lit with more saturation
- sunset shadows are violet replacement colours
- night is blue-violet ambient with warm lamps

**Lighting follows the beat:**
- day for the set-up
- golden for the stakes or incident
- **night blue for the "You see" explanation**
- back to day for the payoff

Use `lookTimeline()` + `applyToonSetup()`.

**Ink:**
- near-constant about 3 px at 1080 on about 74 % of geometry edges, near-black or plum
- drawn **before** DOF so lines blur with the background
- never on character cards
- no lines on wall/floor seams

**Materials:**
- flat colour fields with gentle drift (`toonifyScene` drift) and thin painted joints at about half ink contrast
- planks with dark gaps, stone blocks
- no photographic noise

**Bloom:** only emissive sources (threshold 1.0). Faces never bloom.

## 5. Characters (`CharacterSpec.style = "toonworld"`)

**Proportions and drawing:**
- 3.5 heads tall; kids 2.7-3.0
- bean head H/W 0.93 with a narrower chin (egg -0.12)
- legs and arms are single ink strokes (about 0.055 head widths), ink-dot hands, stroke feet
- plum thick-thin outline, about 5 % of head width
- eyes 26 % of head width apart, lidded half-disc eyes; shock = white circles with small pupils
- no blush, no catchlights

**Shading:**
- soft crescents: skin ×(.96,.86,.84), cloth ×(.64,.66,.74)
- cards take the scene light's tint, keep a bright floor (×0.86) in cast shadow, and darken toward the side away from the sun (`cardShade`)
- contact blob under the feet; full-silhouette shadow from the hidden sun-facing caster

**Acting:**
- reactions 0-3 f before the word; expression swaps hidden by a blink
- blinks every 0.5-2.3 s, 4 frames
- walk about 2.6 steps/s, bob about 5 %, lean 1-7°
- props carry the joke (`Pose.prop`)
- every sentence is illustrated literally

**Never-still world:** background townsfolk walking, birds, smoke, clouds, gestures on key words. Micro-animation activity is about 0.02 (`vfa` `motion.activity`).

**FX:** flat 2D cartoon sprites in 3D (`FxLayer`): sparkle on the hook object, "?"/"!" over heads, splash, dust, stars on the payoff, smoke.

## 6. Captions

One word at a time (sometimes 2-3 when words are very short), white heavy sans with a thin dark outline, lower-middle (about 60-74 % of height), hard swap on every word (`WordCaptions`).

Measured with `vfa ocr` on the 33 M short: 1 word per page (max 2), 0.37 s per page, centre at 70 % of height, fill #fdfcfc,
outline ≈ 0.06 em, no box, no highlight colour, 2 % uppercase, font ≈ 88-96 u (closest: Montserrat Black), appears ON the
word (sync −0.001 s vs Whisper).

## 7. Sound (`audio/mix.py` level model)

- **Master:** -14 LUFS, LRA about 2.2, TP ≤ -1.
- **Bed (measured with `vfa stems`, 3 hero shorts):** music under 98-100 % of the runtime, voice ≈ 19-20 dB above the music per
  sentence (p10 ≈ 13 dB); in LUFS vocals −14.2 vs music −29.7 (≈ 15.5 LU under). Duck from `words.json` (-3 dB).
  An earlier "5-10 LU under" rule and a reviewer's push in that direction were WRONG for this channel: measure, don't opine.
- **Music:** arranged per section (`music.py --sections`):
  - bouncy for the set-up
  - the music keeps playing in 3/3 hero shorts (presence ≥ 98 %): a hard stop is an option for one big hit, not the norm
  - calm pad for the explanation
  - full for the payoff, with a button hit after the last word
- **SFX:**
  - whoosh/swish on every camera travel (anchored at its peak), pops on graphics, a big hit on the incident
  - levels: beds -30, hits 0..-6, details -12..-20 LU vs the voice
  - one shared reverb send

## 8. Recipe (engine)

```
look    = lookTimeline([[0, day], [incident, golden], [youSee, night], [payoff, day]])  + motionBlur 0.5
world   = toonifyScene(scene, makeToonUniforms(TOON_SETUPS.day)); windSway(trees); props via blocksShot()
cast    = CharacterCard(spec{style:"toonworld"}, h, px, sun)  -> cardShade + blob + sun-facing shadow caster
camera  = cameraRig(keys per sentence, { push: { rate: .0028, punches: keyWords }, kicks, follow })
captions= <WordCaptions words={words} />
plan    = SceneDef{ innerCuts, events (FX slams + travels), cues (all story beats) } -> timeline.json -> make_audio.py
QA      = vfa qa FINAL --plan timeline.json --ref references/styles/data/toonworld-explainer_fingerprint.json --mixreport master_mixreport.json
```

Worked example: `engine/src/projects/manhole` ("Why manhole covers are round"), improved with the director loop: reference match
50 → 59.4 → 62.5 → 65.6 over three iterations (learning log: `toonworld-explainer.learnings.md`); the last step adopted the
measured grammar (10 f place-change dissolves: ours 10 f / 8.5 per min vs ref 9-10.5 f / 4.6-14.8; voice-over-music p10 13.0 dB
vs 12.8). Remaining gaps: fast-motion frames (15 % vs 55 %: the reference keeps moving fast INSIDE shots), micro-animation
(0.007 vs 0.020), highlights still warm (b* 14 vs 5.8), edge detail 0.033 vs 0.061.
