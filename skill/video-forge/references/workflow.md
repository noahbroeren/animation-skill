# Workflows

Commands assume `SKILL` = the skill folder. On Windows use `py`, elsewhere `python3`.
Keep everything for one production in a working folder outside the skill: `work/<id>/`
holds refs, analysis and notes. The engine project lives in `SKILL/engine/src/projects/<id>`.

---

## A. Reverse-engineer a video ("how was this made?")

1. **Get the file.**
   - URL: `py SKILL/analyzer/vfa.py fetch URL --out work/<id>/refs`. This picks the best stream up to 2160p plus the ORIGINAL-language audio and the subtitles.
   - Local file: use it directly.
   - Screenshots only: skip to step 4 and analyze the stills with `vfa sbs`, plus your eyes on palette and composition.
2. **Measure.** `py SKILL/analyzer/vfa.py analyze VIDEO --out work/<id>/analysis/ref`
   - Videos under 4 min get contact sheets of EVERY frame (60 frames = 2 s per sheet). Longer ones are sampled; use `--sheets all` to force every frame.
   - Speech uses the sidecar subtitles if present, else faster-whisper. Use `--speech whisper` for exact word timings.
3. **Read in this order:**
   1. `timeline.png`: the whole video on one image (cuts in red; luma, saturation, camera speed, zoom, activity, ink, DOF, audio, speech)
   2. `report.md`: numbers plus the shot list
   3. `sheets/`: look at the hook (first 3 s) frame by frame, every cut, and the climax
   4. `keyframes/`: one full-resolution still per shot, for colour and composition
4. **Decode the construction.** Write `work/<id>/style_bible.md` from `SKILL/templates/style_bible.md`, every line backed by a number or a frame reference:
   - **Script formula:** the hook type, escalation, pivot phrase (e.g. "You see,"), payoff, words/s, sentence length, first-word time.
   - **Visual system:** rendering medium (2D cards in 3D? live action? motion graphics?), line work (`ink_on_edges`), palette (`palettes.png`), grade (black floor, shadow and highlight tint), lens (DOF ratio, grain).
   - **Camera grammar:** % moving frames, glide length, ease type, push-in share, jerk.
   - **Editing grammar:** average shot length (ASL), cuts/min, first-cut time, transition types (look at frames around each cut: hard, whip, zoom-through, match cut, cross-dissolve).
   - **Sound:** LUFS, LRA, onset rate, music presence and BPM, SFX density, silence share.
   - **Typography:** caption style, position, words per caption page, highlight colour. Read it off the sheets.
5. **Explain HOW and WHY** (what each choice does for retention or clarity), not just WHAT. If the user wants a reusable style, turn the bible into an engine `Look` (`look_suggestion.json` + `lookFromSuggestion()`) and a camera preset.
6. **Be transparent.** List what you could not access (age-gated, private or region-locked content, missing audio) and what is inference rather than measurement.

### Channel mode (style of a whole channel)

1. Run `py SKILL/analyzer/vfa.py channel URL --top 20 --sort views --analyze --out work/<id>/channel`.
2. Read `work/<id>/channel/style_fingerprint.md`. It gives medians and IQRs, the share of videos with at most 1 cut, and every hook.
3. Rules that hold across most videos are the style. Outliers are creative choices.
4. Use `fingerprint_aggregate.json` as `--ref` for `vfa compare` and `vfa qa`.
5. Note which topics the channel has already covered, so you can avoid repeating them.

---

## B. Recreate-better ("make one like this, but better")

1. Do mode A first. For a channel, use the channel aggregate.
2. **Choose an original story** the reference hasn't told. Fact-check every claim with web search and note the sources in `work/<id>/facts.md`. Look for the detail that becomes the joke or the twist (the reference found "the river was only 2 ft deep").
3. **Script** in the reference formula, at its measured words/s (±10%).
4. Run `node SKILL/engine/tools/new-project.mjs <id> --format short|long --look <preset>`.
5. **Voice** (see `audio.md` in craft) to get `words.json`. Write the beat table: beat, start-end s, shot, camera move, look and light, SFX, why.
6. **Look test.** Render ONE hero shot as 3-6 stills.
   - `vfa sbs` them against the reference keyframes.
   - Fix the biggest gap first. Usual order: line work, then grade, then DOF, then proportions.
   - Optionally score with a fresh-context reviewer (quality.md §Judge).
7. **Build** the full timeline. Rules:
   - one persistent world per sequence where possible
   - camera travel between moments
   - reactions 0-3 frames before their word
   - mark `innerCuts` and `events`
8. **Stills pass** at every beat, then the full render: `render.mjs --project <id> --format <fmt>`.
9. **Sound design.** Cues come from the same timing code (see `projects/lighthouse/make_audio.py`). Mix to `master.wav`, then re-render with `--audio` (chunks are cached).
10. **QA plus gap analysis.**
    - Run `vfa qa FINAL --plan timeline.json --ref REF_fingerprint`.
    - Then `vfa compare REF analysis/fingerprint.json`; the qa run writes `qa/gap.md`.
    - Fix the top gaps that matter for the style. Ignore gaps that are deliberate improvements.
11. **"Better" means measurably better** on at least one axis the reference is weak on, with no regression on the others:
    - readability: captions inside the safe zones, at least 1.8 s per caption page
    - smoother camera: lower jerk
    - cleaner audio: LUFS on target, no clipping
    - richer secondary motion
    - stronger fact density

    State which axis you improved, with numbers.

---

## C. Original video from an idea or script

1. Pick the format: Shorts (`short`, 9:16, 20-70 s) or long-form (`long`, 16:9, 3-20 min). Pick the look preset (`cartoon-ink`, `cinematic-film`, `documentary`, `clean-explainer`, `neon-night`, `noir`), or build one.
2. Write the story with craft.md §Story: hook, promise, escalation, pivot, payoff, button.
3. Continue from B.4. Without a reference, use craft.md's measured defaults as targets: glide 18-40 f, creep on holds, shots of 2-6 s for shorts, -14 LUFS, 2.8-3.8 words/s.

---

## D. Long-form and series

Follow `longform.md`. Key differences:
- A **series bible** (characters, palette, locations, look, typography, voice) is shared by all episodes.
- **Chapters** are separate scenes with their own Stage3D, joined by transitions.
- Render in chunks (default 20 s) and re-render only what changed.
- Run QA per episode; check drift across episodes with `vfa compare EP1 EP2`.

---

## E. Improve an existing video

1. `vfa analyze` the user's video and, if available, a reference they admire.
2. Run `vfa compare REF THEIRS`. It gives a ranked list of gaps, each with a concrete action.
3. Run `vfa qa THEIRS` for defects: black or frozen stretches, pops, flicker, clipping, loudness, A/V length, native-detail estimate.
4. Look at the sheets. Score the rubric (quality.md) and name the three worst problems with frame numbers.
5. If the project source exists (our engine), fix and re-render. If it's a finished file:
   - re-master audio: `mix.py` with the video's audio as the voice track
   - re-grade with ffmpeg, if that's the issue
   - re-caption, or re-cut with ffmpeg
   - otherwise recommend the rebuild

   Be explicit about which fixes are possible on a flat file and which need the source.
