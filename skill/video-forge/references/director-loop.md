# Director loop: automatic improvement with agent teams

The loop that took the reference project from "looks cheap" to premium, made repeatable:

**produce → judge (one reviewer per area) → fix (file owners) → produce again → learn**

You (Claude) are the **director**. You never fix things yourself during the loop. You run the tools, read the scores, route fixes, merge, and decide when to stop.

## 0. Inputs

| | |
|---|---|
| project | engine project id (`src/projects/<id>`) |
| format / fps | delivery format, e.g. `short`, 30 |
| `--ref` | reference fingerprint: one video's analysis dir, a channel aggregate (`group_*/fingerprint_aggregate.json`), or a style profile's `styles/data/<style>_fingerprint.json` |
| `--ref-dir` | a reference analysis dir with `keyframes/` (for side-by-side sheets) |
| `--style` | style profile name (`toonworld-explainer`, ...). Learnings are written to `references/styles/<style>.learnings.md` |
| targets | QA has no FAIL; judge mean ≥ 8 and min ≥ 7; reference match ≥ 60 % for a recreate (lower is fine for an original in the style) |

## 1. Produce (one command)

```
node ENGINE/tools/produce.mjs --project ID --format short --fps 30 --ref REF --ref-dir REFDIR --style STYLE --change "iteration note"
```

It runs:
1. beat stills and `stills_sheet.jpg`
2. the full native render
3. `make_audio.py`
4. the mux
5. `vfa qa` (plan + mixreport + ref)
6. the judge pack
7. the iteration log + `learn` (if a previous iteration exists)
8. `report.md`

Read `report.md` first.

## 2. Judge: one fresh-context reviewer per area, in parallel

`ENGINE/out/<id>/<fmt>_<fps>/judge/<area>/prompt.md` exists for these areas: color, light, ink, texture, characters, depth, camera, edit, typography, sound, story.

Spawn one Agent per area (background, all in one message). Give each its `prompt.md` path, its `sbs.jpg` and its sheet list. Each must answer with the JSON schema in the prompt:

```json
{"area": "camera", "score": 6.5, "verdict": "...",
 "evidence": [{"frame": 412, "observation": "..."}],
 "fixes": [{"priority": 1, "owner": "...", "change": "...", "why": "..."}]}
```

Save each answer as `<area>/answer.json`, then run `py SKILL/analyzer/vfa_loop.py collect <judge dir>`. This writes:
- `scores.json` (mean and min)
- `fixes.md` (grouped by file owner)

Rules:
- Reviewers never see your opinion, only the work.
- Reviewers are not the agents who built it.
- Re-use the same reviewer (SendMessage) in the next round so it can confirm whether its fixes landed.

## 3. Fix: split the FILES, not just the jobs

Group fixes by owner. Typical owners:

| owner agent | owns |
|---|---|
| look | `src/lib/look.ts` presets used by the project, `shaders.ts` TOON_SETUPS, the project's `lookTimeline` |
| camera | the project's `cameraRig` keys / push / follow / kicks, `innerCuts` / `events` |
| world | the project's `build()` world parts, `textures.ts` / `world.ts` additions |
| cast | the project's character specs and poses, `characters/toon.ts` (style changes only) |
| sound | the project's `make_audio.py`, `audio/*.py` only if needed |
| story | `script.txt`, then re-voice and re-align, then re-time `timing()` |

If several fixers work at once:
- give each its own git worktree (Agent `isolation: "worktree"`) or sandbox copy;
- each edits ONLY its files;
- merge file by file;
- run `npx tsc --noEmit`;
- re-run produce.

Contracts between owners are exported constants (e.g. `timing()` cue names, `TOON_SETUPS`). Never let two agents edit one file.

## 4. Learn (automatic, plus your note)

`produce --style S --change "..."` compares the new gap table with the previous one and appends to `references/styles/<S>.learnings.md` / `.json` every metric that moved (improved/regressed, with numbers).

After the loop, run `py SKILL/analyzer/vfa_loop.py lessons --style S`:
- changes that improved a metric in at least 2 iterations become **confirmed rules**;
- move them into the style profile's rules (and into `craft.md` if they are general).

Changes that regressed go to "avoid".

## 5. Stop rule

Stop when:
- QA has no FAIL **and** judge min ≥ 7 **and** mean ≥ 8, **or**
- 4 iterations are done. In that case, report the residuals honestly: area, score, why it is still low, and what it would take.

Never loosen a target to make it pass.

## 6. Cost control

- Each iteration costs a full render: 1-3 min for a short, 10-45 min for long-form.
- For long-form, iterate on one chapter with `render.mjs --frames a-b` before producing the whole video.
- Reviewers read images: keep packs to about 6 side-by-side pairs plus the most relevant sheets.
- Paid services (voice, AI plates) never run inside the loop without the user's explicit OK on the cost.
