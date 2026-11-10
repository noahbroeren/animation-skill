# Long-form and series production

Long-form is not "many shorts glued together". It needs one world, one cast and one look held for 5-20+ minutes, plus a story structure that re-earns attention every few minutes.

## Series bible (consistency across scenes and episodes)

Copy `SKILL/templates/series-bible.json` to `engine/src/projects/<series>/bible.json` and import it everywhere. It holds:
- `characters`: a CharacterSpec per recurring character (the exact same object every episode), plus voice (provider and voice id, rate) and signature expressions or props
- `look`: a preset name plus overrides (or the measured `look_suggestion` from the series reference)
- `palette`: brand colours, caption highlight, chapter-card colours
- `typography`: caption style, title font, sizes in u
- `locations`: named world builders and their seeds (`house({seed})` etc. are deterministic, so the same seed gives the same building)
- `camera`: default glide, creep, handheld
- `audio`: music mood/bpm per section type, SFX palette, LUFS target

Put shared builders (locations, cast) in `projects/<series>/shared/*.ts` and reuse them in every episode's project.

## Structure

```
cold open (10-20 s, the best moment)  ->  title (3-5 s)  ->  chapter 1  ->  ...  ->  payoff  ->  end card
```

- One `SceneDef` per chapter or sequence; long chapters can be split into several SceneDefs (one per location or setup).
- Each chapter opens with a mini-hook (a question or stakes) and closes an open loop.
- Use `chapter:` labels in SceneDefs. render.mjs writes them to `timeline.json`, ready for YouTube chapter timestamps (`m:ss Title`).
- Vary the visual mode every 30-90 s (3D scene / motion graphic / map / archival / talking character) to reset attention, but keep the look and palette constant.

## Production order for a 10-minute video

1. Script plus fact sheet. Read it aloud at the target words/s (≈150-170 wpm), so 10 min is about 1,500-1,700 words.
2. Voice in chapter-sized files (easier retakes): `vo_01.wav`, ... Align each to `words_01.json`; give each chapter its own offsets.
3. Build chapters in parallel. Agents can own separate chapter folders (file ownership!), with the shared bible read-only.
4. Look-test stills per chapter, then judge consistency side by side (`vfa sbs` with chapter keyframes): same black floor, tint and line weight.
5. Render chunked: `render.mjs --project <id> --format long --chunk 30`. A crashed or edited render resumes, and only chunks whose settings or source changed re-render.
6. Audio per chapter or as one master (`mix.py` takes any number of tracks; chapter VO files are separate tracks with starts from `timeline.json`).
7. QA the whole master plus a drift check: `vfa analyze` each chapter range (`--start --duration`) and `vfa compare` chapter vs chapter. Grade drift > 1 tolerance is a bug unless it's story-driven.

## Time and disk budgeting (measured on an RTX 5070, 16 threads)

| output | render speed | 10 min video |
|---|---|---|
| 2560x1440 mixed 3D/2D | ≈ 15 fps | ≈ 20 min |
| 3840x2160 | ≈ 7 fps | ≈ 45 min |

- Files are about 40-65 Mbps at CRF 16 with grain, about 3-5 GB per 10 min at 2K. Use `--crf 18-20` or `--codec h265` for archives.
- Chunks are kept for resuming; `--clean` deletes them after success.
- The Remotion temp bundle is deleted by render.mjs.
- 60 fps doubles render time. Use it only when motion needs it.

## Episode-to-episode continuity checklist

- [ ] same CharacterSpec objects (import from the bible; never copy-paste-edit)
- [ ] same look and grade overrides (`vfa compare ep1 ep2` colour rows are OK)
- [ ] same caption style and position; same chapter-card design
- [ ] recurring locations use the same seeds
- [ ] the voice is the same provider, voice and rate; loudness at -14 LUFS for every episode
- [ ] an intro/outro sting identical across episodes (render once, reuse the file)
