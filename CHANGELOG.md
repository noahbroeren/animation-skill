# Changelog

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
