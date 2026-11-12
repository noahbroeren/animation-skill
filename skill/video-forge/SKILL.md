---
name: video-forge
description: Reverse-engineer any video, YouTube link, channel or screenshot by MEASURING it frame by frame at native fps (camera path, zoom, easing, jerk, cuts, grade, shadow tint, ink lines, depth of field, grain, loudness, tempo, speech rate, hook), then produce original, better videos rendered natively at 2K or 4K (YouTube 2560x1440 / 3840x2160, Shorts/TikTok/Reels 1440x2560 / 2160x3840, 30 or 60 fps) with a Remotion + three.js engine - inked or cinematic 3D worlds, consistent 2D characters, kinetic type, captions, transitions, synthesized SFX and score, mastered audio - and an automated QA plus reference gap-analysis loop. Use when the user asks to analyze, clone, recreate, study or improve a video or channel style, or to make an animated short, long-form YouTube video, explainer, documentary, story video or video series, or says "video-forge".
---

# video-forge

Turns "analyze this video, understand exactly how it was made, and make something better" into numbers, code and a
finished, QA-checked video file.

**Core rule: measure, don't opine.** You can't recreate an opinion, but you can recreate a number. Every style decision
traces back to a measurement. Then run your own render through the **same** analyzer: the difference is the to-do list.

```
SKILL_DIR = the folder containing this file
ANALYZER  = py  SKILL_DIR/analyzer/vfa.py        (python3 on macOS/Linux)
ENGINE    = SKILL_DIR/engine                      (npm install once; Node >= 18)
AUDIO     = SKILL_DIR/audio/*.py
REFS      = SKILL_DIR/references                  (map: references/README.md)
```

First run on a machine: `node SKILL_DIR/scripts/doctor.mjs` (ffmpeg, yt-dlp, Python packages, Node, engine modules,
GPU WebGL renderer; prints exact fixes).

## 1. Pick the mode

| the user says | mode | read |
|---|---|---|
| "analyze / break down / how was this made" (file, URL, screenshots) | **A. Study** | `references/tools/analyzer.md` |
| "study this channel", "watch every frame", "learn his style" | **A+. Channel study** | `references/research/reference-study.md` (method), `vfa channel` / `vfa batch` |
| "make one like this / in this style / better" | **B. Recreate better** | A, then `references/pipeline/workflow.md` and the matching `references/styles/*.md` |
| a topic or script, "make the video", "one command" | **C. Story short (default)** | `references/pipeline/board.md`, `references/craft/script.md` |
| channel series, 8-20 min, 16:9 | **D. Long form** | `references/pipeline/longform.md` |
| "why does mine look cheap", "fix it", "keep improving" | **E. Improve** | `references/pipeline/quality.md`, `references/pipeline/director-loop.md` |
| characters, a cast, a mascot, "our own recognisable characters" | **Character design** | `references/craft/character-design.md`, then `characters.md`, `acting.md` |
| look, light, shadows, colour, ink, textures, depth, effects | **Look development** | `references/craft/` `lighting.md` `shading.md` `grade.md` `ink.md` `textures.md` `depth.md` `effects.md` |
| camera, cuts, transitions, captions, pacing | **Edit** | `references/craft/` `camera.md` `edit.md` `captions.md` |

## 2. The production loop

The default path for a story short is one command that stops when it needs you and resumes on the next run:

```
node ENGINE/tools/make.mjs --project ID [--ref FP --style S] [--from STAGE --to STAGE] [--also long]
```

Stages: **script** (lint against the style's measured targets) -> **claims** (fact-check gate) -> **voice** (paid voices
only after a cost estimate and an explicit yes) -> **words** (alignment + tightening) -> **board** (draft storyboard,
you make it good) -> **stills** (one still per beat + `[board lint]`) -> **audit** (every frame at 1/8 size, shot audit)
-> **produce** (render, sound, QA, strips, gap table, judge pack) -> thumbnails, ranked titles and, with `--also long`,
the 16:9 version.

1. **Study the reference** (`vfa analyze` / `vfa batch`), read the style pack, and write down the numbers you will match.
2. **Write** to the script template in `references/craft/script.md`: about 230 words for 62 s, picture-first sentences,
   the mechanism at ~72 % of the runtime, the last line echoing the hook. `story.py lint` checks it.
3. **Board** (`references/pipeline/board.md`): beats on spoken words; one shot per sentence; the tool in the hand on the
   action word; one house style for the cast (`Board.brand`); joins and framing come from the measured defaults.
4. **Look at stills** before rendering. Fix the worst three gaps, re-render, re-measure.
5. **Deliver** only after `vfa qa` (no FAIL) and after LOOKING at `qa/strips.jpg` (every transition, frame by frame).
   Report the file, resolution, native or upscaled, fps, LUFS, the QA verdict, the WARNs and what was not verified.

## 3. Non-negotiables

- **2K minimum for finals**, rendered natively: `short` 1440x2560, `long` 2560x1440, `short4k`, `long4k`. Never upscale
  and call it native; `--scale < 1` and preview formats are not deliverables.
- **Determinism:** every frame is a pure function of the frame number (`rng(seed)`, `noise1`, `fbm1`; no `Math.random`).
- **The voice is the clock.** Picture changes land on word onsets (joins start on the first word of a new sentence,
  expressions snap on their word), captions come from `words.json`, SFX hit exact frames.
- **One source of truth per fact:** a timing that drives picture, sound and graphics is one function.
- **Original telling.** Study other channels for technique and numbers only; never recreate their characters, stories
  or shots. Reference footage, frames and transcripts stay in a private folder outside this repository.
- **Paid APIs:** show the estimated cost and get an explicit yes before every generation, including re-takes (unless the
  user gave a standing budget).
- **No claims without evidence:** "professional" or "tested" needs the QA verdict, rubric scores and the gap table.

## 4. The numbers that matter most (toonworld style, measured on 20 reference shorts, 2026-11-12)

| area | target | sheet |
|---|---|---|
| joins | ~80 % cross-dissolves of 7-9 frames (no frame carries > 0.2 of the mix), 0-2 hard cuts per film | `craft/edit.md` |
| camera | never still (< 4 % still frames); accent moves ~16 f with ~7 f ease each side; 60 % of shots end pushed in | `craft/camera.md` |
| framing | head 13 % of frame height with the eyes 44 % from the top in a medium close-up; one character per shot by default | `craft/acting.md` |
| acting | front 76 %, three-quarter 20 %; expressions swap on one frame and hold 12-20+ f; blinks 2 f; mouths move only on quoted lines | `craft/acting.md` |
| characters | one face fill and one ink for the whole cast; outline thin on the lit side, thick on the shadow side; role = hair/hat + torso colour + one prop | `craft/characters.md` |
| shading | cast shadow keeps ~45 % of the light and the surface hue; form shadow ~22 %; soft terminator; faces stay bright and take the light's colour | `craft/shading.md` |
| light | about 4 keys and 5 changes per short: day first, night in the middle, golden late; changes on joins or as in-shot relights | `craft/lighting.md` |
| depth | background blur on close-ups and inserts only (about a third of the shots) | `craft/depth.md` |
| captions | 1-2 words, centre at 70 % of the height, switched on the word, never blank, no pop, no colour | `craft/captions.md` |
| script | 3.6-3.85 words/s, sentences of 13-17 words, few very short ones, <= 1 date, mechanism at 62-82 % | `craft/script.md` |
| sound | -14 LUFS, true peak -2 dBTP, one dark minor-key bed ~17 LU under the voice, ~50 small SFX a minute, at most 2 big hits | `craft/sound.md` |

## 5. Tools by stage

| stage | need | use |
|---|---|---|
| study | download with original audio + subs | `vfa fetch URL` |
| | measure one video / a channel / many videos | `vfa analyze VIDEO [--sheets all]`, `vfa channel URL --top 20 --analyze`, `vfa batch DIR --out D --workers 4` |
| | style fingerprint, gap to ours | `vfa aggregate`, `vfa compare REF OURS` |
| | script x picture per sentence | `vfa breakdown ANALYSIS_DIR` |
| | captions, transitions, stems, poses, CLIP tags | `vfa ocr`, `vfa transitions`, `vfa stems`, `vfa pose`, `vfa embed` (or `vfa analyze --deep`) |
| | topics, hooks, titles that out-perform | `vfa topics`, `vfa hookcheck`, `vfa titlecheck` |
| write | lint, hooks, titles, fact-check, beats, TTS text | `py SKILL_DIR/story/story.py lint|hooks|titles|claims|verify|beats|board|export` |
| | voice rate of a narrator | `story.py calibrate words.json --voice ID` |
| voice | estimate, generate, align, tighten | `py AUDIO/tts.py estimate|eleven|align`, `py AUDIO/tighten.py` |
| build | storyboard as data | `boardProject(board)` in `lib/board.tsx`; example `src/projects/coins` |
| | sets with marks, props | `buildSet(name, opts, origin)`, `PROPS` in `lib/three/sets.ts`; sheet `--project setsheet` |
| | shots, moves, joins | `frameShot` / `shotKeys` in `lib/shots.ts` (`via`: dissolve, glide, cut, through, flash, iris, whip) |
| | light plan | `lightPlan([[frame, key, fade?]])`, `LIGHT_KEYS` in `lib/three/lightplan.ts` |
| | characters and a cast house style | `kind: "bobble"`, `CastBrand` / `BRANDS` in `lib/characters/kinds.ts`; **our cast: `brand: BRANDS.ours`** (locked `ours-v1`, sheet `references/sheets/our-cast-v1.jpg`) and the characters `castEntry("milo")` / `extra(seed)` in `lib/characters/ours.ts` (bible `references/cast/ours-v1.md`; sheets `--project castsheet`, `hairsheet`, `facesheet`, `wardrobesheet`) |
| | pose-to-pose acting | `poseTrack`, `BOBBLE_POSES` |
| | vehicles, weather, crowds | `lib/three/vehicles.ts`, `lib/three/weather.ts`, `CrowdPool.react` |
| | thumbnails, titles, 16:9 | `tools/thumbs.mjs`, `story.py titles --auto`, `make.mjs --also long` |
| render | stills per beat, audit pass, full render | `render.mjs --stills cues+10 --scale 0.3`, `render.mjs --scale 0.125 --crf 34`, `render.mjs --format short` |
| sound | sound from the picture, mix | `py AUDIO/score.py timeline.json --project-dir ENGINE/public/ID`, `AUDIO/mix.py` |
| QA | the gate, transitions, colour per key | `vfa qa VIDEO --plan timeline.json --ref REF`, `vfa strips`, `vfa keygap` |
| | reviewers and learning log | `node ENGINE/tools/produce.mjs`, `py SKILL_DIR/analyzer/vfa_loop.py judgepack|collect|lessons` |
| | engine regressions | `py tests/test_visual.py` (`--update` after an intended look change) |

## 6. Where the knowledge lives

`references/README.md` is the map. In short: `pipeline/` (how to make a video), `craft/` (measured reference sheets,
each mapped to engine parameters), `tools/` (analyzer, engine, external tools), `styles/` (measured style packs),
`research/` (long background reports), `sheets/` (our own rendered reference sheets).

Demo projects: `engine/src/projects/coins` (**start here**: a 9:16 story short as one storyboard with a cast house
style), `manhole` (toonworld explainer), `lighthouse` (inked 3D story), `pendulum` (16:9 long form), `charsheet`,
`setsheet`, `propsheet` (look-dev sheets).
