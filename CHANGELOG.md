# Changelog

## 1.2.0 - 2026-11-11
- **Topic, hook and title research (measured, `analyzer/vfa/topics.py`, `references/hooks-topics.md`):**
  - `vfa topics CHANNEL`: outlier score (views vs the 20 neighbouring uploads), topic/title/hook classifiers, bootstrap CIs, hook
    transcripts from subtitles with a whisper fallback. Polite: cached, `--sleep-requests`, backs off 60/180/540 s on HTTP 429
    and the bot wall, and stops after repeated blocks. `--no-network` re-analyses from cache.
  - `vfa topics-aggregate`: which effects replicate across channels. `vfa hookcheck` and the new `vfa titlecheck` score drafts on
    the data (CI-weighted, shrunk, the style's own channel x2; nested lexicons such as why -> curiosity count once).
  - Measured on 7 channels (1,184 Shorts, 365 hooks), numbers only in `references/styles/data/topics_*.json`:
    - Titles with a negation or contradiction: x1.56 [1.22-2.20], 7 of 7 channels, and not a Why/How confound.
    - Titles with Why/How: x1.12. With This/These: x0.84.
    - Machine 'how it works' topics: x0.90.
    - No hook type replicates across channels. On the reference channel, longer and more concrete absurd-fact hooks lead.
    - Slower narration does better on 3 of 7 channels and faster narration on none. This overrules the 'brisk 150-180 wpm' rule.
  - `story.py titles`: fills the measured title forms from `--subject/--fact/--contrast` and ranks them. `lint` warns on a weak
    `# title:`. `hooks` shows the measured score next to the blend.
  - `vfa thumbcheck` is now a `vfa` subcommand.
- **Director loop (automated improvement):**
  - `engine/tools/produce.mjs`: one command for stills -> render -> audio -> mux -> QA -> gap -> judge pack -> learning log -> report.
  - `analyzer/vfa_loop.py`: `judgepack` (per-area reviewer packs with side-by-sides, rubric and JSON answer schema for 11 areas), `collect` (scores + fixes grouped by file owner), `learn`/`lessons` (per-style learning log: which changes moved which metrics).
  - `references/director-loop.md`: protocol for reviewer agents per area, fixer agents with file ownership, stop rule, cost control.
  - Proven on the manhole demo: reference match 50 -> 59.4 -> 62.5 -> 65.6 over three loops (11 reviewer agents, QA 0 FAIL, 1 WARN), and the learning log holds the confirmed and rejected rules.
- **Thumbnail generator:**
  - `tools/thumbs.mjs` + `lib/thumbs.tsx`: variants rendered from the real 3D world, with a camera override, heavy outlined 1-4 word text, accents and a pop grade.
  - Sizes: long 1280x720, Shorts cover 1080x1920, hires 2560x1440.
  - A feed-size preview sheet on light and dark UI.
  - `analyzer/vfa/thumbcheck.py` ranks variants by OCR readability at feed size, contrast, focal clarity, subject size, the timestamp zone, colour pop and diversity.
  - Character cards face the thumbnail camera.
  - The manhole demo has 7 variants, scoring 79-97.
- **Story engine (`story/story.py`, `references/story-engine.md`):**
  - Steps: `lint`, `hooks`, `claims` + `verify`, `export`, `beats`, `scaffold`.
    - `lint` checks the script against the measured formula of a style: duration at the measured speech rate, hook length and type, one pivot inside the measured window, a re-hook interval, no call to action, and a loopable ending.
    - `hooks` ranks hook variants.
    - `claims` + `verify` is a fact-check gate that blocks the voice until every claim has a source.
    - `export` writes clean text for TTS, also per speaker.
    - `beats` writes a beat sheet with timing from words.json, shot, camera move, punches, light, FX, SFX and lip-sync.
    - `scaffold` generates a typed camera and story plan for the engine.
  - `story/targets.json` holds the measured targets for 4 styles.
  - Hook rules from 65-source research: lesson framing is penalised, misconception and concrete/number/negative hooks are credited.
  - New SKILL.md rule: original telling, never a template (YouTube's Shorts originality change, 2026-10-01).
- **Style profiles** (measured: yt-dlp + `vfa batch/transitions/stems/ocr`), each with a `vfa compare` fingerprint and a look preset:
  - `realistic3d-explainer` (Zack D. Films, 22 CG shorts)
  - `flat-vector-explainer` (Kurzgesagt, 10 videos + 7 shorts)
  - `documentary-essay` (LEMMiNO, 9 documentaries)
  - Look presets: `realistic3d-bright`, `flat-vector`, `doc-noir`.
- **Camera fix:** the push accumulated during a long hold now carries into the next move. It used to snap back, a jump of up to 2.5 m at the start of a glide. Tested by running a generated plan at 30 and 60 fps.
- **Deep analysis (`vfa analyze --deep`, or each tool on its own; all optional, with honest fallbacks):**
  - `vfa transitions`: hard cut, dissolve, dip, flash, wipe, whip pan, zoom-through, match cut.
  - `vfa ocr`: captions (words/page, font size in u, colours, outline, position, sync vs speech, font class).
  - `vfa stems`: Demucs voice/music/drums/other with per-stem loudness, music presence, voice-over-music margin, hit rate.
  - `vfa embed` / `similar`: CLIP style tags and per-shot nearest neighbours vs a reference.
  - `vfa pose`: MediaPipe body language and lip-sync correlation; flags itself as unreliable on cartoons.
  - `compare` gained 10 deep metrics plus CLIP art-style similarity. Frame-unit metrics are now compared at the reference's fps, so 60 fps renders score fairly.
  - QA tolerance windows and the snap threshold are now seconds-based.
- **Measured corrections to the toonworld-explainer profile** (3 hero shorts):
  - 18-26 soft transitions per minute (quick 9-10 f dissolves, zoom and whip transitions). The old cut detector saw 3 of 25 scene changes.
  - Music under 98-100 % of the runtime, voice about 19-20 dB above it. An earlier "5-10 LU under" rule was wrong for this channel.
  - Captions: 1 word per page, 0.37 s, outline 0.06 em, on the word.
  - The manhole demo now changes place with 10 f in-world dissolves and glides only inside a place.
- **Characters:**
  - `references/characters.md`: research on 25 character types, ranked by evidence for shorts and long-form, plus a viseme/lip-sync guide and build specs.
  - Lip-sync: text-based visemes (`Pose.viseme`, `visemeAt()` from word timings) and audio-based Rhubarb cues (`audio/lipsync.py` downloads Rhubarb 1.14 (MIT) on first use, or uses `--rhubarb PATH` / `$RHUBARB`; `cueAt()` with a 2-frame lead and a 2-frame minimum hold). Tested: 275 cues for the 42 s manhole VO in 16 s; the founder in the manhole demo lip-syncs from them. Side/profile view.
  - `CrowdPool`: distance-tiered crowds, poses on twos, side-view walks, cue-gated acting.
  - Stronger never-still idle.
  - `lib/characters/kinds.ts`: 7 new kinds (object, critter incl. quadrupeds, blob, stick, chibi, flatvec, microbe), 50+ presets, a shared face with 16 expressions and Rhubarb mouth cues, 4-beat walk/hop/IK/spring helpers, and style passes (sketch, cutout, silhouette, pixelize) that work on every character. Usable on 3D cards and in crowds; `charsheet` look-dev project.
- **Production:**
  - ElevenLabs is the default voice, behind a hard cost gate: `tts.py estimate` first, and `tts.py eleven ... --yes` refuses to run without `--yes`. It writes `words.json` from the character timestamps.
  - Real assets: Poly Haven search/get (CC0, credited) and Kenney zip import; `loadModel()` (glTF, toon-shaded, ground-aligned, recolour).
  - Blender bridge for the realistic-3D path (`tools/blender_bridge.py`), tested with Blender 5.3: EEVEE and Cycles (OptiX GPU requested), several glTFs with offsets, HDRI, shadow-catcher ground, DOF, Freestyle toon ink, and the same camera grammar as `cameraRig` (glides, cuts, `via` arcs).
  - Camera:
    - `refFps` for frame-rate-independent timing at 60 fps.
    - In-world dissolves (`dissolve` keys plus `Stage3D dissolveAt`, `innerSoft` in the edit plan).
    - Bezier arc travels (`via`).
  - No motion blur across hard cuts (it used to smear the first incoming frame).
- **Look:**
  - Ink thresholds x0.6 / 30-degree creases (coverage 0.24 -> towards 0.35).
  - Plaster value noise, speckle, chipped brick and grime band; per-tile variation.
  - Cooler toonworld highlights, pure-white day cards, golden key from the front three-quarter.
- **Captions:** shown on the word onset instead of about 3 frames late, single words by default, thicker outline and shadow, `yAt` to keep them clear of faces.
- **Audio:**
  - Fixed: SFX shorter than 400 ms were never levelled (`momentary()` = -inf), so swish/pop/click played about 14 LU hot. New `dsp.event_loudness()` measures over the sound's own length, `mix.py` reports `lu_vs_voice` per cue and lists level errors over 2 LU.
  - Distance gain is applied after levelling; detail SFX are ducked under spoken words.
  - `whoosh` rebuilt with a moving STFT band and a defined peak; new `creak`.
- **Render speed (measured with the new `tools/bench.mjs`, full 1,274-frame short, Ryzen 7 9800X3D + RTX 5070):**
  - New defaults: concurrency 4 (was 8), x264 `medium` (was `slow`), CRF 14 (was 16).
  - Render time 141-145 s -> 78-128 s, about 1.4x faster on average (the spread comes from other jobs on the machine).
  - Bitrate 10 -> 15.5 Mbps, which meets YouTube's 1440p30 recommendation.
  - One GPU gets choked by 8 Chromium WebGL tabs: more tabs is slower.
- **Robustness:** visual regression tests (`tests/test_visual.py`, SSIM + colour shift vs baselines), 2 new audio regression tests.

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
