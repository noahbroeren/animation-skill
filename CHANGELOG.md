# Changelog

## 1.1.0 - 2026-11-10
- **Channel study:** 42 of 149 @RicksClips3000 shorts measured frame by frame, split into eras; 3 hero shorts analysed sentence by sentence.
  - New style profile `references/styles/toonworld-explainer.md` with an engine recipe.
- **Analyzer:**
  - `vfa batch`: parallel channel study, per-group aggregates, views correlation.
  - `vfa breakdown`: sentence x camera x cuts x light, plus cut-on-word offsets.
  - QA: 0.4 s freezes for shorts, white frames, dead air, speech-over-bed margin.
  - Relative jerk tolerance in `compare`.
- **Shaders:**
  - painted cel world material (`toonifyScene`, sun visibility x N.L, hue-keeping and violet replacement shadows, rim, colour drift)
  - wind sway, toon water
  - card shading (no emissive, scene tint, side gradient, contact blob)
  - depth-reprojected camera motion blur
  - DOF v2 (cInf/maxCoC, reach test, near field)
  - 7-knot tone curve + zone saturation + Cb/Cr zone tints
  - resolution-pinned bloom, ink normal fallback
- **Engine:**
  - per-frame `lookTimeline`, toonworld look presets per lighting setup
  - toonworld character style (bean head, thick-thin ink, stroke limbs), measured blink/walk numbers, auto light side
  - `FxLayer` (13 flat 2D effects), `WordCaptions`
  - camera `push` with punches, `follow`, screen-space kicks, `glideOrCut()`
  - street props, birds, `blocksShot()` sight-line culling
  - `cues` in the edit plan, model sheet project
- **Audio:**
  - `dsp.py` (BS.1770-4, momentary, 4x true-peak limiter, mastering loop, reverb IR, distance fx, words-keyed duck)
  - `mix.py` rewrite: loudness-relative levels, sections, rides, anchors, reverb send, stems, margin report, ffmpeg cross-check that aborts on disagreement
  - `music.py --sections` arrangement with stops and buttons
  - `splash` SFX
- **Fixes:**
  - 32-bit WAV scaling (caught by the cross-check)
  - three.js shadow-loop unrolling in the sunVis patch
  - crescent shading drawn on the wrong side
- **Demo:** `manhole` (toonworld explainer, 16/32 metrics in tolerance vs the channel aggregate, QA WARN with no FAIL).
- **Tests:** `tests/test_audio.py` (loudness vs ffmpeg, limiter, master loop, ducking).

## 1.0.0 - 2026-11-10
- analyzer `vfa`: fetch (original audio), analyze (every frame: camera LK+RANSAC / Fourier-Mellin, moves/easing/jerk,
  cuts, grade + Lab tints, ink-on-edges, grain, DOF, activity, native-detail estimate, EBU R128, onsets/BPM, speech),
  channel + aggregate, compare (gap table), qa (delivery gate with plan-aware cut/pop/flicker checks), sbs.
- engine: Remotion 4 + three.js r187; formats short/long/short4k/long4k/square; Stage3D with deterministic
  PostPipeline (ink, DOF, bloom/halation, ACES/neutral tonemap, display-space grade, vignette, grain, dither);
  camera rig; world kit; parametric 2D characters with props, blink/mouth/walk/idle; captions/titles/charts;
  transitions; chunked resumable renders; timeline.json edit plan; new-project scaffold.
- audio: procedural SFX pack, score bed, offline TTS + whisper alignment, mix/master (-14 LUFS, -1 dBTP).
- demos: `lighthouse` (9:16 2K short), `pendulum` (16:9 2K + 4K long-form).
- tests: ground-truth analyzer tests incl. regression for an infinite loop in cut detection.
