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
| idea, script or topic without a reference | **C. Original** | `references/story-engine.md` (topic -> hooks -> script lint -> fact-check gate -> beats + camera plan), `references/workflow.md`, `references/craft.md` |
| channel URL, "series", episodes, 8-20 min video | **D. Long-form / series** | `references/longform.md` |
| "improve / fix / why does mine look cheap" | **E. Improve** | analyze both, `vfa compare`, `references/quality.md` |
| a known style ("2D characters in a 3D world", "like Ricks Clips", toon explainer, "like Zack D Films", "like Kurzgesagt", documentary) | **Style profile** | `references/styles/` (`toonworld-explainer.md`, `realistic3d-explainer.md`, `flat-vector-explainer.md`, `documentary-essay.md`): measured system + engine recipe |
| "what kind of character", new cast, mascot, talking object, animal | **Character design** | `references/characters.md` (25 character types ranked by evidence, lip-sync tables, build specs) |
| "keep improving it", "make it as good as the reference", overnight polish | **Director loop** | `references/director-loop.md` (`tools/produce.mjs` + per-area reviewer agents + learning log) |

## The production loop (B, C, D)

1. **Study.** `vfa analyze REF` (or `vfa channel URL --top 20 --analyze` for a channel). Read `report.md`, look at `timeline.png` first, then contact sheets and keyframes. Write `style_bible.md` with measured numbers plus your reading of the story formula. `look_suggestion.json` already maps the grade, ink, DOF, grain and camera timing onto engine parameters.
2. **Story.** Hook = the first sentence and the first frame. Fact-check every claim (web search). Script at the measured words-per-second. Then make a beat sheet: each beat gets its start/end time, shot, camera move and *why*. Reject topics the reference channel already covered.
3. **Voice.** Generate or record the voice, then `py AUDIO/tts.py align vo.wav --out words.json`. Word timings are the clock of the whole video.
   - Default: ElevenLabs. First `py SKILL_DIR/story/story.py export script.txt --out vo.txt` and `py AUDIO/tts.py estimate --text-file vo.txt` (credits per model), show the user the cost, and only after an explicit yes run `py AUDIO/tts.py eleven --text-file vo.txt --voice-id ID --out vo.wav --words-out words.json --yes` (it refuses without `--yes`; it writes words.json from the character timestamps, which also drive lip-sync visemes). Offline OS voices (`tts.py say`) are for previews only.
   - **Paid voices/APIs: show the estimated credit cost and get an explicit yes BEFORE every generation, including re-takes.**
4. **Look test.** Scaffold with `node ENGINE/tools/new-project.mjs <id> --format short|long`. Build one key shot and render 3-6 stills (`render.mjs --stills ... --scale 0.5`). Put them next to reference keyframes (`vfa sbs`) and fix the biggest gap before animating everything.
5. **Build** the scenes: world, characters, camera, overlays, captions. Mark every intended hard cut (`innerCuts`) and every big graphic slam (`events`) so QA can tell intent from glitches.
   Declare what must read in each shot (`audit` on Stage3D) and run `render.mjs --stills cues --scale 0.25`: the shot audit
   catches occluders, subjects pushed out of frame by the push-in, and 9:16 framing that is too tight, before the full render.
6. **Stills review**, then a **full render** at native resolution: `node ENGINE/tools/render.mjs --project <id> --format <fmt> --fps 30|60`. Chunks are resumable.
7. **Sound.** Derive the SFX cues from the same timing code or `timeline.json`, then `py AUDIO/mix.py plan.json --out master.wav` (masters to -14 LUFS / -1 dBTP). Re-run render.mjs with `--audio master.wav`: cached chunks are only concatenated and muxed.
8. **QA gate** (or all of 6-8 in one command: `node ENGINE/tools/produce.mjs --project ID --ref REF --ref-dir REF_DIR --style STYLE --change "..."`, then `py SKILL_DIR/analyzer/vfa_loop.py judgepack/collect/learn/lessons`; see `references/director-loop.md`). `vfa qa FINAL.mp4 --plan timeline.json --fps 30 --duration S --ref REF_fingerprint.json`. A FAIL blocks delivery. Then LOOK at the sheets and score the judge rubric in `references/quality.md`, ideally with a fresh-context reviewer agent. Fix the worst three problems, re-render, re-measure. Stop when the gap table is green or the residuals are explained.
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
- **Original telling, not a template.** YouTube's Shorts recommendations have favoured original content since 2026-10-01: re-uploads, template-based edits and plain narration of what is on screen get less reach. The 2025-07 "inauthentic content" monetization rule targets mass-produced, repetitive videos. Sources: Search Engine Journal and Android Authority reporting a Creator Insider announcement; the original YouTube post body was not retrievable. Reusing a topic is fine, but every video needs its own angle, story, characters and visuals. Never mass-produce near-identical episodes.
- **Don't claim "professional" or "tested" without evidence:** the QA verdict, rubric scores and gap table.

## Tooling map

| Need | Use |
|---|---|
| download with original-language audio + subs | `vfa fetch URL` |
| full measurement of one video | `vfa analyze VIDEO [--sheets all] [--speech whisper]` |
| channel style fingerprint | `vfa channel URL --top 20 --analyze`, then `vfa aggregate` |
| whole-channel study, eras, what correlates with views | `vfa batch VIDEOS --out D --workers 4 --meta selection.json --group-key era` |
| sentence-by-sentence script x camera x cuts x light | `vfa breakdown ANALYSIS_DIR` (analyze with `--speech whisper` first) |
| cast look-dev sheet | `node ENGINE/tools/render.mjs --project modelsheet --format long --stills 0,40` (40 = visemes + side view) |
| new character kinds (objects, animals, blobs, stick, chibi, flat vector, microbes) + style passes | `lib/characters/kinds.ts`; sheet: `render.mjs --project charsheet --format long --stills 0,40,70,100,130` |
| thumbnails from the 3D world (variants, feed-size preview sheet, ranked by `thumbcheck`) | `node ENGINE/tools/thumbs.mjs --project ID [--kind long,short,hires] --out DIR`; variants in the project's `thumbnails` (see `projects/manhole/thumbs.ts`) |
| render-speed benchmark before changing defaults | `node ENGINE/tools/bench.mjs --project ID --frames 180-299 --variants default,c4,veryfast,default` |
| one-command iteration: stills, render, audio, QA, gap, judge pack, learning log | `node ENGINE/tools/produce.mjs --project ID --ref ... --style ... --change "..."` |
| per-area reviewer packs, collect scores, learning log | `py SKILL_DIR/analyzer/vfa_loop.py judgepack OURS_DIR REF_DIR --out judge` / `collect judge` / `lessons STYLE` |
| CC0 models/HDRIs (Poly Haven), Kenney packs | `node ENGINE/tools/fetch-assets.mjs search|get|kenney`, then `loadModel()` |
| audio-driven lip-sync (Rhubarb, free/offline, auto-installed) | `py AUDIO/lipsync.py vo.wav --out cues.json [--script script.txt]`, then `pose.cue = cueAt(f, fps, cues.mouthCues)` |
| ElevenLabs voice (after a cost yes) | `py AUDIO/tts.py estimate --text-file vo.txt`, then `tts.py eleven --text-file vo.txt --voice-id ID --out vo.wav --words-out words.json --yes` |
| visual regression of the engine | `py tests/test_visual.py` in the repo (`--update` after an intended look change) |
| reference vs ours, ranked fixes | `vfa compare REF OURS` |
| side-by-side judge sheet | `vfa sbs --ref a.jpg,b.jpg --ours c.jpg,d.jpg --out sbs.jpg` |
| final gate | `vfa qa VIDEO --plan timeline.json --ref REF` |
| new production | `node ENGINE/tools/new-project.mjs ID` |
| script lint, hook ranking, title variants, fact-check gate, beat sheet + camera plan, TTS text | `py SKILL_DIR/story/story.py lint|hooks|titles|claims|verify|beats|scaffold|export` |
| which topics / hooks / titles out-perform on a channel (outlier score, CIs) | `vfa topics CHANNEL_URL --out DIR --summary-out references/styles/data/topics_<ch>.json`, `vfa topics-aggregate` |
| score a draft hook or rank titles on the measured data | `vfa hookcheck "hook" --style S`, `vfa titlecheck "t1" "t2" --style S` |
| stills / full render / 4K | `node ENGINE/tools/render.mjs --project ID [--stills 0,90] [--format long4k]` |
| one still per story cue (beat review sheet) + shot audit log | `render.mjs --project ID --stills cues --scale 0.25` -> `stills/index.json`, `shot_audit.log` |
| catch occluded / out-of-frame / tiny subjects before a full render | Stage3D `audit={(f, w) => subjects}` (`lib/three/audit.ts`); problems land in `<out>/shot_audit.log` |
| size a 9:16 close-up (hfov is ~0.56x vfov) | `frameDistance({ width, height, vfov, aspect: 9/16 })` in `lib/camera.ts` |
| a voice's real words/s (duration estimates) | `py SKILL_DIR/story/story.py calibrate words.json --voice ID`, then `# voice: ID` in the script |
| live preview + scrubbing | `cd ENGINE && npx remotion studio` |
| SFX pack, score bed, offline TTS, align, mix/master | `AUDIO/sfx.py`, `music.py`, `tts.py`, `mix.py` |

## Reference files (load only what the task needs)

- `references/workflow.md`: step-by-step for each mode, with command lines and decision points
- `references/analyzer.md`: every metric (how it is measured, what it means, what to do with it), reading the artifacts, limits
- `references/engine.md`: engine API (formats, projects, timeline/transitions, Stage3D, camera rig, looks/post, world kit, characters, 2D/typography, render tool, performance, troubleshooting)
- `references/craft.md`: cinematography, lighting/colour, animation/motion, editing/pacing, story/hooks/retention, typography/captions, sound. Measured defaults plus an anti-"AI-look" checklist
- `references/quality.md`: QA gates, judge rubric, multi-agent gap analysis with file ownership, iteration protocol, honesty rules
- `references/longform.md`: series bible, chapters, consistency across episodes, chunked renders, disk/time budgeting
- `references/characters.md`: character-type research (what works where, evidence), viseme/lip-sync tables, specs for new kinds
- `references/story-engine.md`: topic -> hook variants -> script to the measured formula -> fact-check gate -> beat sheet + generated camera plan
- `references/hooks-topics.md`: measured topic, hook and title effects on 7 channels (1,184 Shorts, CIs, what replicates) plus the research rules they confirm or overrule
- `references/director-loop.md`: the automated improvement loop (produce -> per-area judges -> fixers by file ownership -> learning log)
- `references/external.md`: optional paid/external integrations (premium voices, AI video plates, Blender photoreal, upscalers) and how to label them
- `references/styles/*.md`: measured style profiles with engine recipes (start: `toonworld-explainer.md`, a 149-short channel study)
- `references/reference-study.md`: the reference methodology this skill was built from, plus measured results

Demo projects to copy from:
- `engine/src/projects/manhole`: 9:16 toonworld explainer built from the channel study. It uses the toon shaders, per-beat lighting, follow-cam down a shaft, FX, one-word captions, and section-arranged sound from cues.
- `engine/src/projects/lighthouse`: 9:16 inked-3D story short with one persistent world, camera travel and pattern-synced 2D graphics.
- `engine/src/projects/pendulum`: 16:9 chaptered long-form with multiple 3D scenes, charts, transitions and subtitles.
- `engine/src/projects/modelsheet`: cast look-dev.
