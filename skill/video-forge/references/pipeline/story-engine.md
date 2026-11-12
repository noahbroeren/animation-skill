# Story engine: from topic to a fact-checked, filmable plan

Use this for mode C (original) and B (recreate better). Claude writes; the tools measure, gate and translate the story
into a plan. Every number comes from `story/targets.json`, which follows the measured style profiles. Topic and hook
evidence is in `references/craft/hooks-titles.md`.

```
STORY = py SKILL_DIR/story/story.py
```

## 1. Topic (15 min)
- Pick from evidence, not taste:
  - `references/craft/hooks-titles.md` lists the topic families that out-perform on measured channels.
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
7. pivot ("You see,") at 62-82 % of the runtime (measured 2026-11-12: the mechanism starts at ~73 %); an optional early "You see," as a connector in the first ~12 % is fine; never anywhere in between (12-60 %)
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

## 6b. Storyboard draft: a gag per sentence (1.7)

`STORY board script.txt --words words.json --id ID --out ENGINE/src/projects/ID` writes a draft `Board` (one beat per clause,
anchored on its first content word) and `board.md`: a table with the proposed place, lighting key, shot and gag for every
clause, and the list **"still needs a gag"**. Proposals come from `story/gags.json`; add the topic's nouns there first.
The draft is generic on purpose: replace each generic pick with the topic's own prop (`references/pipeline/board.md`, section 4).
`node ENGINE/tools/make.mjs --project ID` runs lint, the fact-check gate, the voice, alignment, this draft, stills, the audit
pass and the produce loop as one resumable command.

## 7. Build, produce, improve
- Build the world and cast (`references/tools/engine.md`, `references/craft/character-types.md`).
- Then run the director loop (`references/pipeline/director-loop.md`): `produce.mjs` -> reviewers -> fixes -> `learn`.
- Time the script at the voice you will use: after the first VO, `STORY calibrate words.json --voice ID` stores its
  measured words/s in `story/voices.json`; put `# voice: ID` in the script and `lint`/`beats` estimate with it (or
  `--wps`). The reference rate (3.63 w/s) predicted 48 s for the elevator script; the ElevenLabs narrator ran 59.6 s.
- Make thumbnails from the finished world with `tools/thumbs.mjs`.
- Titles: `STORY titles script.txt --subject "manhole covers" --fact "are round" --contrast square` fills the measured
  forms (Why/How first, a negation such as "Don't Work", the reference channel's "The [X] That [Y]") and ranks them with
  `vfa titlecheck`. Pick the winner unless it misleads, and put it in the `# title:` header; `lint` warns below 50.
  No "This/These", no ALL-CAPS, hashtags in the description.

## Honesty rules
- Never present invented specifics (dates, names, numbers) as fact. Mark them STORY in claims.md, and keep the mechanism true.
- Don't claim a hook "will perform": the scores are correlations from measured channels (see the n and the CIs in `references/craft/hooks-titles.md`).

## Formula B: scheme and comeuppance (measured on one 3.1 M-view hero short)

Use it when the topic is "why people started doing X" or "how X was invented" and there is a character who games a
rule. Full beat table with timings: `styles/toonworld-explainer.casestudy.md`.

1. Hook = an ACT in progress with its consequence in the same sentence (present tense, <= 18 words).
2. The rule he exploits (why the act pays).
3. The reward, as a list of three.
4. Escalation x3-4, each a new picture: again -> chooses victims (list of three) -> accomplice -> absurd peak.
5. Authority pushes back: two short spoken lines (the official, then his cheeky excuse).
6. Stakes restated in one sentence.
7. The turn, announced by weather or light ("one rainy morning"), with an opponent who does NOT react.
8. The reveal object, shown by one gesture.
9. Reversal: the object proves the truth.
10. Origin tag in <= 8 words that answers the title. No CTA.

Production checklist for "a video like that one":
- 3 setups inside the first sentence (close on the actor, wide of the situation, close on the consequence); first cut
  before 1.5 s, on a word.
- one gag prop or set per sentence that makes the claim concrete (aim for 14+ setups per minute);
- a colour script per phase, and a weather / light change at the turn;
- a point-of-view shot for the reveal (show the evidence as the characters see it);
- pose-to-pose acting (`poseTrack`), every character in frame reacts to an incident;
- narration 3.1-3.9 w/s with pauses capped at ~0.2 s; music the whole way, ~20 dB under the voice.
