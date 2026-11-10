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
| camera budget / transition grammar / anti-"AI slop" checklist ideas | huashu-design (c) 2026 alchaincyf | MIT |

Runtime dependencies: Remotion (Remotion License: https://remotion.dev/license), three.js (MIT), React (MIT),
NumPy/SciPy (BSD), OpenCV (Apache-2.0), Pillow (MIT-CMU), faster-whisper (MIT), FFmpeg (LGPL/GPL build-dependent), yt-dlp (Unlicense).
