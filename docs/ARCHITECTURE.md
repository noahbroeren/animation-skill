# Architecture

```
                 ┌──────────────── MEASURE ────────────────┐
 URL / file ──►  vfa fetch ─► vfa analyze ─► fingerprint.json, report.md, timeline.png,
 channel    ──►  vfa channel ─► aggregate     sheets/, keyframes/, look_suggestion.json
                 └─────────────────────────────────────────┘
                              │ style bible (numbers) + look_suggestion
                              ▼
 script ─► tts/record ─► tts.py align ─► words.json  (the clock)
                              │
                              ▼
 engine project (TSX): scenes ─► Timeline ─► Stage3D (three.js + PostPipeline) + DOM layers
                              │
          render.mjs ─► chunks (resumable) ─► concat ─► video.mp4 + timeline.json (edit plan)
                              │
 make_audio (same timing) ─► sfx.py / music.py ─► mix.py ─► master.wav (-14 LUFS) ─► mux
                              │
                 ┌──────────────── VERIFY ─────────────────┐
                 vfa qa FINAL --plan timeline.json --ref REF  ─► qa.md (PASS/WARN/FAIL)
                 vfa compare REF OURS                          ─► gap.md (ranked fixes)
                 judge rubric (fresh-context agent)            ─► fix worst 3 ─► loop
                 └─────────────────────────────────────────┘
```

## Key decisions

| decision | why | alternatives considered |
|---|---|---|
| **Remotion + three.js** for production | frame-deterministic (every frame is a pure function of frame), real GPU WebGL in headless Chrome, React/DOM for razor-sharp typography, native rendering at any resolution, parallel tabs; proven for this exact style by the reference | Blender (photoreal but not installed by default, slow iteration, heavy); Motion Canvas/Revideo (2D-first); raw canvas + Playwright (more glue); AI video generators (no 2K-native output, identity drift, not reproducible) |
| **own PostPipeline**, no R3F/postprocessing | pass order and determinism under our control (the reference's ink bug came from pass ordering inside a merged effect pass); fewer moving dependencies | @react-three/postprocessing |
| **2D character cards in 3D** + code-drawn characters | consistency across a series (one spec = same character forever), fast, stylable, cast real shadows; matches the studied viral style | rigged 3D characters (much heavier), AI-generated sprites (drift) |
| **Python analyzer** (OpenCV/NumPy/SciPy + ffmpeg) | mature CV primitives (LK, RANSAC, phase correlation, log-polar), streaming decode at native fps, constant memory | JS analyzers (fewer CV tools) |
| **LK+RANSAC + Fourier-Mellin** camera | subject-robust similarity fit; FM covers textureless art; both measure zoom/roll; integration catches slow creeps the reference's tool missed | dense optical flow only (subject motion pollutes), phase correlation only (missed slow moves) |
| **chunked, hash-keyed renders** | long-form: crash-safe, resumable, re-render only what changed; audio mux reuses cached video | single renderMedia call |
| **audio mixed outside the browser** | exact sample length, two-pass EBU R128 mastering, voice-keyed ducking, stems | Remotion `<Audio>` mixing |
| **edit plan (`timeline.json`) + QA** | the QA gate can tell intended cuts/events from glitches; style gaps are measured, not guessed | eyeballing only |

## Determinism contract

- No `Math.random`, `Date`, `performance.now` in scene code: use `rng(seed)`, `noise1`, `fbm1`, `hash32`.
- `update(world, frame)` sets every animated property from `frame` alone (frames render out of order in parallel tabs).
- Canvas textures are cached by key; procedural content is seeded.
- Verified: re-rendering the same project produces chunk caches keyed by source hash + settings.

## Resolution independence

All lengths are in `u` (1 u = 1 px at a 1080 px short side): ink widths, DOF radius, chromatic aberration, grain
cell size, caption sizes, bloom chain sized from the frame. A project designed in preview renders identically at
2K and 4K; the canvas is always the delivery size (pixel ratio 1) → native detail, verified by the spectral check.
