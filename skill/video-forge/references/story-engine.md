# Story engine: from topic to a fact-checked, filmable plan

Use this for mode C (original) and B (recreate better). Claude writes; the tools measure, gate and translate the story
into a plan. Every number comes from `story/targets.json`, which follows the measured style profiles. Topic and hook
evidence is in `references/hooks-topics.md`.

```
STORY = py SKILL_DIR/story/story.py
```

## 1. Topic (15 min)
- Pick from evidence, not taste:
  - `references/hooks-topics.md` lists the topic families that out-perform on measured channels.
  - `vfa topics <channel>` gives the outlier-score data for a reference channel.
- A good topic is an everyday object or rule with a hidden mechanism, a paradox, an "illegal/impossible" fact, or a
  story with stakes. It can be explained with one visual analogy in 40-70 s.
- **Saturation check:** search the reference channel's titles (cached by `vfa topics`) and YouTube for the topic. If a big
  channel did it in the last 12 months, find a different angle or skip it.
- Write the core in one line: `[who] did [absurd act] -> [what went wrong] -> mechanism -> [ironic payoff]`.

## 2. Hook variants (10 min)
- Write 5-8 hook sentences. Each states the absurd act or the stakes as fact, in the first sentence: no greeting and no "did you know".
- Rank them: `STORY hooks "hook 1" "hook 2" ...`. This uses the formula signals plus the measured hook model (`vfa hookcheck`) when topic data exists.
- Keep the best. Note the runner-up as a re-hook line for the middle.

## 3. Script (20 min)
Write in the script format (header lines, `@speaker:` lines, `[place:x]`, `*punch*` words, optional `[beat:pivot]`).

Follow the formula of the style:
1. hook
2. setting
3. rival/crowd mock (1-3 lines)
4. escalation with time markers
5. incident
6. mystery ("Wait, what?")
7. pivot ("You see,") once, at 40-75 % of the runtime
8. mechanism with one analogy
9. ironic payoff as the last line, with no outro or CTA

Then run `STORY lint script.txt --style <style>`:
- Fix every FAIL.
- Fix the WARNs unless you can say why not.
- Aim for a score of at least 90.

Example: `story/examples/manhole.txt`, which scores 100.

## 4. Fact-check gate (mandatory)
- `STORY claims script.txt --out claims.md` lists every sentence with a number, date, name, superlative or causal claim.
- Verify each claim with web search. Set:
  - **OK** with a source URL;
  - **FIX** and rewrite the sentence;
  - **STORY** for deliberate fictional framing around a true mechanism; say which part is invented.
- `STORY verify claims.md` must PASS before any voice is generated.
- Put the sources in the video description.

## 5. Voice (paid: cost gate)
1. `STORY export script.txt --out vo.txt [--per-speaker voices/]` strips the tags. Then `py AUDIO/tts.py estimate --text-file vo.txt`.
2. Show the user the credit cost and wait for a yes.
3. `tts.py eleven ... --yes` writes `words.json`.

For on-screen speakers, also run `py AUDIO/lipsync.py vo.wav --script script.txt --out cues.json` (Rhubarb).

## 6. Beat sheet + camera plan
- `STORY beats script.txt --words words.json --out plan/` writes `beats.md` and `beats.json`, with one row per sentence:
  - timing (from the real VO)
  - beat
  - shot
  - camera move: one per sentence, alternating push/pull, 44 f centred on the sentence start, a 10 f in-world dissolve on place changes, a follow + kick on the incident
  - punch words
  - light section (day -> golden -> night pivot -> day)
  - FX and SFX
  - lip-sync windows
- `STORY scaffold plan/beats.json --out ENGINE/src/projects/<id>/story_plan.ts` generates typed helpers.
- In `index.tsx`, fill `SHOTS` (one framing per place plus its push/pull partner) and use:
  ```ts
  const rig = cameraRig(planKeys(fps, SHOTS), { push: planPush(fps), kicks: planKicks(fps), refFps: 30 });
  <Stage3D ... camAt={(f, fp) => rig.at(f, fp)} dissolveAt={(f, fp) => rig.dissolveAt(f, fp)} cuts={rig.cuts} />
  SceneDef: { cues: planCues(fps), innerSoft: planSoft(fps), events: planEvents(fps) }
  lighting: planLight(fps)    lip-sync: planLipsync(fps) + cueAt()/visemeAt()
  ```
  `tests/test_story.py` checks that this plan compiles and runs without camera jumps at 30 and 60 fps.

## 7. Build, produce, improve
- Build the world and cast (`references/engine.md`, `references/characters.md`).
- Then run the director loop (`references/director-loop.md`): `produce.mjs` -> reviewers -> fixes -> `learn`.
- Make thumbnails from the finished world with `tools/thumbs.mjs`. Titles come from the measured title patterns in `references/hooks-topics.md`.

## Honesty rules
- Never present invented specifics (dates, names, numbers) as fact. Mark them STORY in claims.md, and keep the mechanism true.
- Don't claim a hook "will perform": the scores are correlations from measured channels (see the n and the CIs in `hooks-topics.md`).
