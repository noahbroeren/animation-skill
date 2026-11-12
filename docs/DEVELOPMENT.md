# Development guide

## Tests

```bash
py tests/test_analyzer.py            # ground truth: pan sign, zoom, roll, FM fallback, eased glide, slow creep,
                                     # cuts, sheets, self-compare=100%, upscale detection, cut-loop regression
cd skill/video-forge/engine && npx tsc --noEmit        # engine typecheck
node skill/video-forge/scripts/doctor.mjs --gpu         # environment + GPU WebGL probe
node skill/video-forge/engine/tools/render.mjs --project smoke --format short --stills 0,60 --scale 0.5   # render smoke
```

End-to-end verification used for 1.0.0:
1. `render.mjs --project lighthouse --format short --audio ...` → `vfa qa --plan` → WARN (no FAIL), -14.0 LUFS.
2. `render.mjs --project pendulum --format long` and `--format long4k` → `vfa qa` → WARN (no FAIL).
3. `vfa analyze` on the 21,361-frame reference → fingerprint + report.

## Extending

- **New look**: add to `LOOKS` in `engine/src/lib/look.ts`; prefer deriving it from a measured `look_suggestion.json`.
- **New world prop**: add a builder to `engine/src/lib/three/world.ts` (return a `THREE.Group`, use `shadowed()`, seeded `rng`).
- **New character feature/prop**: `engine/src/lib/characters/toon.ts` (`Pose.prop`, `drawCharacter`). Keep sizes relative to `hw`/`headW`.
- **New transition**: `engine/src/lib/timeline.tsx` (`Wrap` enter/exit branches + `DEF_FRAMES`).
- **New metric**: compute in `analyzer/vfa/frame_metrics.py` (per frame) → add key to `COLOR_KEYS`/`TEX_KEYS` in
  `analyze.py` → add a row to `METRICS` in `compare.py` (tolerance + advice) → document in `references/tools/analyzer.md`.
- **New QA check**: `analyzer/vfa/qa.py` (`add(name, status, detail)`); respect `intended()` for planned events.

## Conventions

- Determinism (no `Math.random`/`Date` in scene code), sizes in `u`, timings from `words.json`, one function per
  shared timing (picture + graphics + sound).
- Keep `SKILL.md` short (< 200 lines); detail goes in `references/` (progressive disclosure).
- Don't commit renders, generated audio, reference footage or `node_modules` (see `.gitignore`).

## Releasing

1. Run the tests above; render both demos; run QA.
2. Bump `CHANGELOG.md` and `analyzer/vfa/__init__.py` version.
3. Commit, tag `vX.Y.Z`, push.
