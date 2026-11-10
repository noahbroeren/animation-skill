# Quality: gates, judging, iteration, honesty

Quality is a loop, not a step: **render → measure → look → judge → fix the worst 3 → re-render**. Stop when the gates pass and the rubric hits the target, or after 4 rounds with residuals listed.

## 1. Automated gate: `vfa qa`

```
py SKILL/analyzer/vfa.py qa FINAL.mp4 --plan timeline.json --fps 30 --duration S [--min-class 2k|4k] [--ref REF.json] [--lufs -14]
```

The exit code is 1 on any FAIL. It writes `qa.md`, `qa.json`, `analysis/` (sheets, timeline) and `gap.md` (with `--ref`).

| check | FAIL / WARN when |
|---|---|
| resolution | below the 2K class (or 4K with `--min-class 4k`) |
| fps / duration / codec | mismatch with the plan |
| bitrate | under 80 % of YouTube's recommendation (WARN) |
| black stretches / starts on black | any black start = FAIL |
| frozen stretches | ≥ 2.5 s frozen (WARN; deliberate holds are allowed) |
| cuts vs plan | a detected cut that isn't a planned cut or event = FAIL (glitch) |
| pops | an unexplained frame jump = FAIL |
| flicker | luminance zig-zag outside cuts, events and fast moves (WARN) |
| clipping | p90 clipped black or white ≥ 2 % (WARN) |
| camera snaps | moves ≤ 6 f outside planned transitions (WARN) |
| native detail | the spectral estimate says upscaled (WARN; report honestly) |
| loudness / true peak / A-V length | outside ±1.5 LU of target / TP > -0.9 dBTP = FAIL / A-V delta > 0.1 s |
| style match | with `--ref`: < 70 % of metrics within tolerance (WARN) |

**Declare intent** so the gate can tell intent from glitches: `innerCuts` (planned hard cuts inside a scene) and `events` (graphic slams, flashes, lighting snaps) on SceneDefs.

## 2. Look, don't assume

Automated checks are necessary, not sufficient. After every full render:
1. Open `qa/analysis/timeline.png`.
2. Open the contact sheets for:
   - the first 3 s (hook)
   - every planned cut and transition
   - every caption-dense section
   - the climax
   - the last 2 s
3. Never judge motion from a single still; read consecutive frames on the sheet.

## 3. Judge rubric (score 1-10 with evidence; target ≥ 8 in every row for "professional")

Run it in a **fresh-context reviewer** (a subagent that did not write the code). Give it the side-by-side sheets (`vfa sbs`), the reference keyframes, `qa.md` and `gap.md`. Ask for a score, evidence (frame numbers) and the single most effective fix for each row.

| # | area | 10 looks like |
|---|---|---|
| 1 | Hook | frame 1 is a strong image, the paradox or question lands in < 2 s, and nothing wasted |
| 2 | Story and clarity | one idea per beat, the pivot and payoff land, facts sourced |
| 3 | Composition and camera | readable subject, depth layers, glides 18-40 f, motivated moves, no dead holds |
| 4 | Lighting and colour | key/fill separation, story-driven light, measured grade, no clipping or pure black (unless intended) |
| 5 | Materials and texture | painted or real textures, no plastic flatness, consistent style |
| 6 | Character and acting | consistent design, readable expressions, anticipation and follow-through, lands before the word |
| 7 | Motion and timing | arcs, ease, secondary motion, physics plausible, rhythm matches the voice |
| 8 | Edit and transitions | cuts on action or word, transitions match the grammar, no glitches |
| 9 | Typography and captions | readable, safe-zone correct, synced, on-brand |
| 10 | Sound | voice clear, bed ducked, ambience present, SFX frame-accurate, -14 LUFS / -1 dBTP |
| 11 | Technical | native 2K/4K, fps, bitrate, no artifacts, A/V synced |
| 12 | Reference match / improvement | gap table mostly OK; deliberate improvements stated with numbers |

## 4. Multi-agent gap analysis (for "make it look as good as the reference")

This is the method that took the reference project from "looks cheap" to "premium":

1. **Gap agents, one topic each.** Each compares reference frames with ours and returns NUMBERS, not adjectives:
   - colour/grade
   - ink/line work
   - light and shadow
   - textures/materials
   - characters (proportions, head ratio, limb thickness)
   - depth and framing (DOF, layers)
   - motion (camera glide, jerk, character timing)
   - sound

   Give each the same brief: the reference fingerprint, ours, `gap.md`, the sheets and the keyframes.
2. **Rebuild agents with file ownership.** Each one owns its files, for example:
   - camera: `projects/<id>/camera.ts`
   - world: `world-*.ts`
   - characters: `cast-*.ts`
   - look: `look.ts` overrides

   Each works in its own git worktree or sandbox copy. Contracts between owners are exported constants.
3. **Merge file by file,** typecheck, re-render, re-measure. Split the FILES, not just the jobs: agents editing the same file break each other's work.
4. The gap agents may find that **your own notes were wrong** (in the reference project, "egg-shaped heads" turned out to be wrong when measured). Trust measurements over first impressions.

## 5. Iteration protocol

- Each round, log in `work/<id>/polish-log.md`:
  - the three worst problems (with frames)
  - the fix
  - the before/after crops or metrics
- Change one dimension per render when diagnosing, and several when the fixes are independent.
- Re-run `vfa compare`. A fix that doesn't move its metric didn't work.
- Stop rule: all FAILs cleared, rubric ≥ 8 everywhere or 4 rounds done; list the residuals.

## 6. Honesty rules (always)

- Say exactly which resolution was rendered natively and which parts, if any, were upscaled or AI-generated.
- Report QA verdicts verbatim, including WARNs, with the reason they're acceptable.
- "Tested" means you ran it and looked at the output. Name what you did not verify (e.g. a 60 fps render not tried, a platform upload not tried).
- If an external service was unavailable (no API key, private video), say so and what you did instead.
