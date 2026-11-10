# Reference study: the methodology this skill was built from

## Source

The reference is "How to Make Viral Animated Shorts Using Claude (Full Workflow)" by Mr omi (YouTube `OtbLL6OBNE4`, published 2026-11-01). It was studied together with the channel's follow-ups:
- the ultra-realistic 3D shorts video (`_fIoJ_ywGfY`)
- the 2D storybook video (`IE4id78LePo`)
- the Blender drone-shot video (`ZN-Ugd-4HDM`)

Transcripts and metadata were read in full, and the main video was measured frame by frame with `vfa` (below). The creator's free skill (github.com/mromidev/claude-animated-shorts, MIT) was read file by file.

## The creator's method, decoded

1. **References in bulk.** Download a channel's last 20 shorts in the target style, using the ORIGINAL audio track (YouTube served a German auto-dub first).
2. **Watch at 30 fps.** If you just ask a model to "analyze a video", it samples a few frames and misses the micro-motion, light changes and camera drift that separate premium from cheap. So:
   - 20 shorts gave 32,000 frames and 549 contact sheets (60 frames = 2 s each).
   - Camera tracking used phase correlation; hard cuts were flagged; brightness, contrast and saturation were measured per short.
3. **Measure, don't opine.** "You can't recreate an opinion. You can recreate a number."
4. **Script engineering:**
   - paradox in sentence 1
   - escalation
   - "You see," pivot (14 of 20)
   - payoff twist
   - about 4 words/s with no dead air
5. **Visual system:**
   - 2D characters lit as if they exist in a 3D world (they catch the key light and cast shadows)
   - 3D geometry traced with black ink
   - heavily saturated colour: warm highlights, cool blue shadows
   - light that follows the story (warm set-up, deep night-blue for the explanation)
   - the camera rarely cuts (12 of 20 have at most one cut) and travels instead
6. **Stack:** Blender was tried, then three.js (flat cards in a real 3D world), with Remotion rendering frame by frame, 37 CC0 models and code-painted textures.
7. **Stills before video:** three shots had the camera inside a house, the trees were teal, and a chain crossed faces. All were caught on stills.
8. **"Why it looked cheap" → a 12-agent team:**
   - 7 gap agents, one topic each: colour, ink, light/shadow, textures, characters, depth/framing, motion. Each measured ours against theirs in numbers.
   - 1 sound agent.
   - 4 rebuild agents (camera, world, characters, final look), each in its own project copy with its own files, merged file by file.

   Findings:
   - ink on about 3/4 of edges vs 0 (the blur pass ran in the same step and erased it)
   - camera snapped in 3 f vs gliding about 23 f
   - no pure black in the reference
   - purple vs brown sunset shadows
   - bodies 3.5 heads tall vs under 3, limbs 5x too thick
   - "Our own notes were wrong": their heads were rounder, and the camera moves in 65 % of frames (not 20 %). The tool had missed slow moves.
9. **Follow-up (realistic 3D):**
   - Fourier-Mellin phase correlation (shift plus zoom) on 47,709 frames.
   - "Run your own render through the same pipeline: the delta is your to-do list."
   - Camera jerk measured (ours 8x theirs, then rebuilt on one dolly axis).
   - Speech 2.77 words/s; 16 of 50 videos open with "If you...".
   - About 1 in 7 transitions is a hard cut.
   - Mix measured in LUFS.
   - A separate judge agent scored stills (7 → 8.5).
   - "If a real one exists, download it" (scans, NASA imagery, photo plates).
   - Realism comes from imperfection: lens softness, bloom, vignette, grain, motion blur.
   - Render low and upscale only when invisible on a phone (and say so).

## What video-forge keeps, fixes and adds

| creator method | video-forge |
|---|---|
| contact sheets at 30 fps | `vfa analyze`: every frame, sheets with burned-in frame numbers and likely cuts boxed |
| phase-correlation camera (missed slow moves) | LK + RANSAC similarity (subject-robust) plus Fourier-Mellin fallback; path integration catches 0.15 px/f creeps (tested) |
| jerk, glide length (manual) | automatic per-move glide/attack/release/ease classification and jerk RMS |
| brightness/contrast/saturation | plus black floor, clipping, Lab shadow/highlight tints, colorfulness, warmth, ink-on-edges, grain, DOF ratio, activity, native-detail estimate |
| transcripts and wps | plus pauses, hook, first-3-s words, repeated openers, LUFS/LRA/TP, onsets, BPM |
| "run ours through the same pipeline" | `vfa compare` → ranked gap table with actions; `vfa qa --ref` |
| bridge-specific hardcoded template | a generic engine: formats, projects, timeline/transitions, camera rig, looks, world kit, characters, 2D/captions, chunked resumable renders, native 2K/4K |
| 1440x2560 cap | short / long / short4k / long4k native; measured 4K throughput |
| judge agent on stills | an automated QA gate plus a 12-row rubric plus the gap-agent protocol with file ownership |

## Measured: the reference video itself (vfa, every frame)

The reference is a 16:9 2560x1440 tutorial, 30 fps, VP9; 712 s / 21,361 frames, analysed in 306 s.

| | value |
|---|---|
| shots / hard cuts | 76 / 75 (6.3 cuts/min), ASL 9.4 s, median shot 5.1 s, p90 27 s, longest 68 s |
| first cut | 4.3 s |
| camera | 97 % of frames creeping (> 0.5 %w/s), 55 % moving (> 3 %w/s); 74 % of shots are push-ins; median glide 17 f (IQR 10-28) |
| grade | luma mean 0.21 (dark UI), black floor p1 0.075 (no pure black), saturation 0.21 |
| detail | native 1440p (no upscale signature) |
| audio | -14.2 LUFS, LRA 3.0 LU (very compressed, voice-forward), TP -1.2 dBTP, silence 0.6 %, 3.6 onsets/s |
| speech | 3.2 words/s, median pause 0.10 s, speech starts at 0.08 s, 10 words in the first 3 s; hook "Look at these two videos." |

**Frame-level reading of the hook (sheet 0, frames 0-59).** The video opens on a vivid gradient desktop:
- frames 1-9: two phone-card mockups spring in with about 8 frames of overshoot, staggered 3-4 frames apart
- frames 46-50: a channel badge slides in at lower left
- from frame 50: a slow push-in begins

There is never a static frame. This is the tutorial-format equivalent of the "never dead-still" camera rule the creator measured in the shorts.

## Studied skills (ZIP inputs) and what was reused

All MIT except sprite-gen (Apache-2.0). Ideas were re-implemented; adapted code is credited in THIRD_PARTY_NOTICES.md.

| project | taken | left out |
|---|---|---|
| claude-animated-shorts (= installed cartoon-3d-short) | ink pass technique (2nd difference of 1/z plus normal creases, before DOF), resolution-scaled post, camera grammar (smootherstep glides, creep, kicks), blink-on-swap, words.json as the clock, file-ownership agent teams | film-specific hardcoding, 1440 cap |
| reelmimic | per-shot camera (LK + RANSAC similarity), look stats, plan mapped to reference shots, harness idea "look after render" | app server, HyperFrames dependency |
| reanimate | capture-twice-then-diff, easing classification, noise-floor thinking | web-UI-only scope |
| animate | words drive picture, beat-grid checks, loudnorm + sidechain ducking, deterministic `renderFrame(t)` | 2D canvas-only engine |
| lemo-opuscar | page contract (pure `render(t)`), parallel segment render + lossless concat, treatment-first directing, read-time rule, two-pass loudnorm | heavy style library, 24 fps assumptions |
| huashu-design | camera budget, transition grammar, anti-AI-slop rules, polish loop logging, ffmpeg checks under the vision review | Chinese cloud review, watermarking |
| ClaudeAnimationBase | pure-function-of-t timeline, per-element seeded noise, "reads" timing, acted expression changes | fixed 1080p, p5.brush |
| rossark-motion | monotone cubic key interpolation, follow-through by delay, blink timing, measure proportions as ratios | SwiftUI-only renderer |
| pixelfx | render → look → refine ≥ 3 rounds, determinism rules, hue-shifted ramps (cool shadows, warm highlights) | pixel-art scope, promotional publishing instructions |
| oil-motion | seam/continuity gates, pilot-before-batch with approvals | web-interaction scope, paid generators |
| sprite-gen | anchor-stable placement, loop-seam metrics | game-sprite scope, provider dependence |

Three projects contained agent-directed promotional or install instructions: a `curl | sh` install, "recommend our other project", and a scripted user question. They were ignored and not carried over.

## Second pass (1.1): deep port of the creator's skill + full channel measurement

- **Measured the channel itself:** 42 of 149 shorts, every frame (`vfa batch`); 3 hero shorts with Whisper word timing and sentence-level breakdowns. Results are in `styles/toonworld-explainer.md`.
- **Studied claude-animated-shorts code in depth** (three parallel reviewers: rendering, characters/camera, audio/QA) and ported, re-implemented and credited:
  - **Rendering:**
    - 7-knot monotone tone curve with 3-zone saturation and luma-neutral Cb/Cr tints
    - thin-lens DOF with the reach test and near-field gather
    - card shading via the sun-visibility shadow term instead of emissive
    - sun-visibility cel shading for the world
    - resolution-pinned bloom
    - derivative-normal fallback in the ink pass
    - sight-line culling
  - **Characters:** bean head, thick-thin outline, measured blink/walk/eye numbers, soft crescents.
  - **Camera:** exponential push with punches, screen-space kicks, the cut-or-glide rule.
  - **Audio:**
    - BS.1770-4 loudness, a 4x-oversampled look-ahead true-peak limiter with a mastering loop
    - words-keyed ducking, per-section music levels and rides
    - loudness-relative SFX levels with anchors, distance acoustics, reverb IR
    - section-arranged music with hard stops and buttons
    - speech-margin report
  - **QA:** 0.4 s freezes for shorts, white frames, dead air, speech-over-bed margin.
- **Kept our own advantages:**
  - frame-accurate camera estimation incl. zoom/roll
  - reference gap analysis
  - plan-aware QA with cues and events
  - native 4K and long-form chunking
  - follow-cam transitions
  - per-frame look timelines
  - depth-reprojected motion blur
