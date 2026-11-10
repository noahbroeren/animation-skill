# Third-party notices

video-forge re-implements ideas from several open-source Claude skills (all MIT unless noted). Code that was
adapted (not just inspired) is listed with its origin.

| component | origin | license |
|---|---|---|
| `engine/src/lib/three/post.ts` ink mask technique (signed 2nd difference of 1/z for silhouettes, normal-angle creases, gamma-space ink composite, separate pass before DOF) | claude-animated-shorts `templates/bridge/ink.ts` (c) 2026 Mr omi | MIT |
| camera grammar ideas: smootherstep glides, creep on holds, sign-flipping decaying kicks; blink-on-expression-swap; words.json as the master clock | claude-animated-shorts (c) 2026 Mr omi | MIT |
| `engine/src/lib/time.ts` `monotone()` (Fritsch-Carlson monotone cubic for key poses), `follow()` delay-based follow-through | rossark-motion-skill (c) 2026 rossark0 | MIT |
| per-shot LK + RANSAC similarity camera estimation approach | reelmimic (c) 2026 ReelMimic contributors | MIT |
| loudnorm two-pass + sidechain ducking conventions; render(t) page contract; parallel segment render + lossless concat | animate (c) 2026 cth9191; lemo-opuscar (c) 2026 LemoLab | MIT |
| `audio/dsp.py` (BS.1770 K-weighting + gating, oversampled look-ahead limiter + mastering loop, decaying-noise IR, `dist_fx`, words-keyed ducking), `audio/mix.py` level model (loudness-relative cues, events -6 dB, section levels, rides, anchors), `music.py` section arrangement | claude-animated-shorts `templates/audio/` (c) 2026 Mr omi | MIT |
| `post.ts` DOF reach test + near-field gather, 7-knot monotone grade + zone saturation + Cb/Cr tints, pinned bloom chain; `shaders.ts` sunVis shadow-term patch, card shading (`cardShade`); `world.ts` `blocksShot` sight-line culling; toonworld character constants (bean head, thick-thin ink, blink/walk numbers) | claude-animated-shorts `templates/bridge/` (c) 2026 Mr omi | MIT |
| camera budget / transition grammar / anti-"AI slop" checklist ideas | huashu-design (c) 2026 alchaincyf | MIT |

Runtime dependencies: Remotion (Remotion License: https://remotion.dev/license), three.js (MIT), React (MIT),
NumPy/SciPy (BSD), OpenCV (Apache-2.0), Pillow (MIT-CMU), faster-whisper (MIT), FFmpeg (LGPL/GPL build-dependent), yt-dlp (Unlicense).
