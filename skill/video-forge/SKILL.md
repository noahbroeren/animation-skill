---
name: video-forge
description: Reverse-engineer any video, YouTube link, channel or screenshot by MEASURING it frame by frame at native fps (camera path, zoom, easing, jerk, cuts, grade, shadow tint, ink lines, depth of field, grain, loudness, tempo, speech rate, hook), then produce original, better videos rendered natively at 2K or 4K (YouTube 2560x1440 / 3840x2160, Shorts/TikTok/Reels 1440x2560 / 2160x3840, 30 or 60 fps) with a Remotion + three.js engine - inked or cinematic 3D worlds, consistent 2D characters, kinetic type, captions, transitions, synthesized SFX and score, mastered audio - and an automated QA plus reference gap-analysis loop. Use when the user asks to analyze, clone, recreate, study or improve a video or channel style, or to make an animated short, long-form YouTube video, explainer, documentary, story video or video series, or says "video-forge".
---

# video-forge

Turns "analyze this video, understand exactly how it was made, and make something better" into numbers, code and a finished, QA-checked video file.

**Core rule: measure, don't opine.** You can't recreate an opinion, but you can recreate a number. Every style decision traces back to a measurement of the reference. Then run your own render through the **same** analyzer: the delta is the to-do list.

```
SKILL_DIR = the folder containing this file
ANALYZER  = py  SKILL_DIR/analyzer/vfa.py        (python3 on macOS/Linux)
ENGINE    = SKILL_DIR/engine                      (npm install once; Node >= 18)
AUDIO     = SKILL_DIR/audio/*.py
```

First run on a machine: `node SKILL_DIR/scripts/doctor.mjs`. It checks ffmpeg, yt-dlp, Python packages, Node, engine `node_modules` and the GPU WebGL renderer, then prints exact fixes.

## Pick the mode

| User says | Mode | Read |
|---|---|---|
| "analyze / break down / how was this made" (file, URL, screenshots) | **A. Reverse-engineer** | `references/analyzer.md` |
| "make one like this / in this style / better than this" | **B. Recreate-better** | A, then `references/workflow.md` |
| idea, script or topic without a reference | **C. Original** | `references/workflow.md`, `references/craft.md` |
| channel URL, "series", episodes, 8-20 min video | **D. Long-form / series** | `references/longform.md` |
| "improve / fix / why does mine look cheap" | **E. Improve** | analyze both, `vfa compare`, `references/quality.md` |
| a known style ("2D characters in a 3D world", "like Ricks Clips", toon explainer) | **Style profile** | `references/styles/toonworld-explainer.md` (measured system + engine recipe); other profiles in `references/styles/` |

## The production loop (B, C, D)

1. **Study.** `vfa analyze REF` (or `vfa channel URL --top 20 --analyze` for a channel). Read `report.md`, look at `timeline.png` first, then contact sheets and keyframes. Write `style_bible.md` with measured numbers plus your reading of the story formula. `look_suggestion.json` already maps the grade, ink, DOF, grain and camera timing onto engine parameters.
2. **Story.** Hook = the first sentence and the first frame. Fact-check every claim (web search). Script at the measured words-per-second. Then make a beat sheet: each beat gets its start/end time, shot, camera move and *why*. Reject topics the reference channel already covered.
3. **Voice.** Generate or record the voice, then `py AUDIO/tts.py align vo.wav --out words.json`. Word timings are the clock of the whole video.
   - Preferred: a premium voice (e.g. ElevenLabs via its connector). Offline OS voices (`tts.py say`) are for previews only.
   - **Paid voices/APIs: show the estimated credit cost and get an explicit yes BEFORE generating.**
4. **Look test.** Scaffold with `node ENGINE/tools/new-project.mjs <id> --format short|long`. Build one key shot and render 3-6 stills (`render.mjs --stills ... --scale 0.5`). Put them next to reference keyframes (`vfa sbs`) and fix the biggest gap before animating everything.
5. **Build** the scenes: world, characters, camera, overlays, captions. Mark every intended hard cut (`innerCuts`) and every big graphic slam (`events`) so QA can tell intent from glitches.
6. **Stills review**, then a **full render** at native resolution: `node ENGINE/tools/render.mjs --project <id> --format <fmt> --fps 30|60`. Chunks are resumable.
7. **Sound.** Derive the SFX cues from the same timing code or `timeline.json`, then `py AUDIO/mix.py plan.json --out master.wav` (masters to -14 LUFS / -1 dBTP). Re-run render.mjs with `--audio master.wav`: cached chunks are only concatenated and muxed.
8. **QA gate.** `vfa qa FINAL.mp4 --plan timeline.json --fps 30 --duration S --ref REF_fingerprint.json`. A FAIL blocks delivery. Then LOOK at the sheets and score the judge rubric in `references/quality.md`, ideally with a fresh-context reviewer agent. Fix the worst three problems, re-render, re-measure. Stop when the gap table is green or the residuals are explained.
9. **Deliver.** Give the file path, resolution, whether it is native or upscaled (say which), fps, LUFS, the QA verdict, the remaining WARNs, and what was not verified.

## Non-negotiables

- **2K minimum for finals:** `short` 1440x2560, `long` 2560x1440, `short4k` 2160x3840, `long4k` 3840x2160. The engine renders natively at these sizes.
  - Never upscale and call it native. If anything is upscaled (an AI-generated plate, archival footage), label it, and `vfa qa` estimates effective detail.
  - Preview formats and `--scale < 1` are not deliverables.
- **Determinism:** every frame is a pure function of the frame number. No `Math.random`, no `Date`; use `rng(seed)`, `noise1` and `fbm1` from `lib/time.ts`.
- **Glide, don't snap.** Camera moves take 18-48 frames with C2 (`smoother`) easing (the measured toon-explainer median is 44 f). Every hold pushes in slowly (`push`), so no frame is dead-still unless it is meant to be. Travel the camera into the next moment, with motion blur on fast travels. If the travel exceeds half a frame or 40 % zoom (`glideOrCut()`), CUT instead, on a word onset.
- **No pure black and no clipped whites** unless the reference has them. Shadows take a hue (often cool or violet); highlights are warm. Read `color.shadow_tint_name` from the report.
- **The voice is the clock.** Reactions land 0-3 frames *before* their word. Captions come from `words.json`. Music ducks under the voice; SFX hit exact frames.
- **One source of truth per fact.** A timing, pattern or position that drives picture AND sound AND graphics is ONE function, shared by all three.
- **Don't claim "professional" or "tested" without evidence:** the QA verdict, rubric scores and gap table.

## Tooling map

| Need | Use |
|---|---|
| download with original-language audio + subs | `vfa fetch URL` |
| full measurement of one video | `vfa analyze VIDEO [--sheets all] [--speech whisper]` |
| channel style fingerprint | `vfa channel URL --top 20 --analyze`, then `vfa aggregate` |
| whole-channel study, eras, what correlates with views | `vfa batch VIDEOS --out D --workers 4 --meta selection.json --group-key era` |
| sentence-by-sentence script x camera x cuts x light | `vfa breakdown ANALYSIS_DIR` (analyze with `--speech whisper` first) |
| cast look-dev sheet | `node ENGINE/tools/render.mjs --project modelsheet --format long --stills 0` |
| reference vs ours, ranked fixes | `vfa compare REF OURS` |
| side-by-side judge sheet | `vfa sbs --ref a.jpg,b.jpg --ours c.jpg,d.jpg --out sbs.jpg` |
| final gate | `vfa qa VIDEO --plan timeline.json --ref REF` |
| new production | `node ENGINE/tools/new-project.mjs ID` |
| stills / full render / 4K | `node ENGINE/tools/render.mjs --project ID [--stills 0,90] [--format long4k]` |
| live preview + scrubbing | `cd ENGINE && npx remotion studio` |
| SFX pack, score bed, offline TTS, align, mix/master | `AUDIO/sfx.py`, `music.py`, `tts.py`, `mix.py` |

## Reference files (load only what the task needs)

- `references/workflow.md`: step-by-step for each mode, with command lines and decision points
- `references/analyzer.md`: every metric (how it is measured, what it means, what to do with it), reading the artifacts, limits
- `references/engine.md`: engine API (formats, projects, timeline/transitions, Stage3D, camera rig, looks/post, world kit, characters, 2D/typography, render tool, performance, troubleshooting)
- `references/craft.md`: cinematography, lighting/colour, animation/motion, editing/pacing, story/hooks/retention, typography/captions, sound. Measured defaults plus an anti-"AI-look" checklist
- `references/quality.md`: QA gates, judge rubric, multi-agent gap analysis with file ownership, iteration protocol, honesty rules
- `references/longform.md`: series bible, chapters, consistency across episodes, chunked renders, disk/time budgeting
- `references/external.md`: optional paid/external integrations (premium voices, AI video plates, Blender photoreal, upscalers) and how to label them
- `references/styles/*.md`: measured style profiles with engine recipes (start: `toonworld-explainer.md`, a 149-short channel study)
- `references/reference-study.md`: the reference methodology this skill was built from, plus measured results

Demo projects to copy from:
- `engine/src/projects/manhole`: 9:16 toonworld explainer built from the channel study. It uses the toon shaders, per-beat lighting, follow-cam down a shaft, FX, one-word captions, and section-arranged sound from cues.
- `engine/src/projects/lighthouse`: 9:16 inked-3D story short with one persistent world, camera travel and pattern-synced 2D graphics.
- `engine/src/projects/pendulum`: 16:9 chaptered long-form with multiple 3D scenes, charts, transitions and subtitles.
- `engine/src/projects/modelsheet`: cast look-dev.
