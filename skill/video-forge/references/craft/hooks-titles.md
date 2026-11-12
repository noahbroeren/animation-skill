# Topics, hooks and titles: what is measured, what is researched

Use this when you pick a topic, write the hook and choose a title (story engine steps 1, 2 and 7). Two kinds of evidence:

- **Measured:** `vfa topics` on 7 channels, 2026-11-10/11. 1,184 Shorts were scored and 365 hooks transcribed (subtitles,
  with whisper as fallback). The data is numbers only and lives in `references/styles/data/topics_*.json`.
- **Researched:** 65 outside sources: YouTube Help, peer-reviewed headline and curiosity studies, and creator statements.
  The strongest are listed under "Sources".

When the two disagree, the measured channel data wins for these formats. Everything here is **correlation**. A score
tells you what out-performed on comparable channels; it does not promise views.

## How to read the numbers

- **Outlier score** = log10(views / median views of the 20 neighbouring uploads of the same channel). This removes
  channel growth and decay. Raw views mislead: on Kurzgesagt, upload order vs raw views has rho -0.61 (old Shorts
  dominate), while upload order vs the outlier score has rho +0.02.
- **×1.12** = the typical video with the feature does 12 % better than its upload neighbours. Brackets are a 90 %
  bootstrap CI. n < 8 is too few to trust.
- A feature **replicates** when at least 3 channels have n ≥ 8, at least 75 % of them agree on the direction, and the
  pooled CI excludes ×1.00.
- **Hooks** were sampled from the extremes (top 20 + bottom 20 by outlier, plus 10 from the middle). They are judged by
  top-N share minus bottom-N share, not by lift.

| Channel | Why it is here | Shorts scored | Hooks |
|---|---|---|---|
| RicksClips3000 | reference for `toonworld-explainer` (only the 27 newest uploads are this format) | 25 | 25 |
| Zack D. Films | reference for `realistic3d-explainer` | 295 | 54 |
| Kurzgesagt | reference for `flat-vector-explainer` | 135 | 51 |
| Veritasium | largest science-explainer Shorts catalogue | 90 | 50 |
| The Infographics Show | animated story/explainer Shorts at scale | 295 | 85 |
| SciShow | second large science-explainer channel | 235 | 50 |
| MinuteEarth | animated science explainers | 109 | 50 |

## Titles

**Replicating (use these):**

| Feature | Pooled | 90 % CI | n | Channels agreeing |
|---|---|---|---|---|
| Negation / contradiction ("Don't Work", "Isn't", "Nobody", "Never") | **×1.56** | 1.22-2.20 | 83 | 7 of 7 |
| Contains Why / How | ×1.12 | 1.02-1.19 | 419 | 5 of 6 |
| Starts with Why / How | ×1.10 | 1.02-1.17 | 394 | 5 of 6 |
| Contains This / These | **×0.84** | 0.69-0.97 | 77 | 3 of 4 |

- The negation effect is not "Why" in disguise. Titles with a negation but no Why/How do ×1.8 (n = 49); with both, ×1.4
  (n = 34). It also holds without curiosity words.
- The negation effect is the myth-busting form, "[Familiar thing] isn't / doesn't [what you think]". It fits the
  misconception research (S5 below). SciShow is the strongest source (31 of 83), but every channel points the same way.
- The reference channel's best titles use the same forms: "Why [Perfect X] Don't Work" and "The Job Nobody Wants".

**Close but not replicating:**
- ALL-CAPS word: ×0.83 [0.68-1.05], negative in 4 of 6 channels (SciShow ×0.60, MinuteEarth ×0.63).
- Curiosity word (secret, real reason, nobody, actually): ×1.06 [0.99-1.16], positive in 6 of 7.
- The label form "The [X] That [Y]": ×0.94 overall. It is +×1.98 on the reference channel, but n = 3. Use it as house
  style, not as evidence.

**No effect:** "?", "you", numbers, superlatives, emoji, hashtags, title length (|rho| ≤ 0.12).

**Rules:**
1. Use "Why [familiar thing] [odd behaviour]" or "Why [wrong alternative] [thing] Don't Work".
2. A contradiction beats a plain question: "Manhole Covers Aren't Round by Accident" (×1.20) beats "Why Manhole Covers
   Are Round" (×1.00).
3. Never use "This/These" or ALL-CAPS words.
4. Put hashtags in the description, not the title.
5. Put the key words in the first ~40 characters, because mobile feeds cut long titles. This is a convention, not
   measured here.

**Tool:** `py ANALYZER titlecheck "t1" "t2" ... --style S` ranks titles on this data. `STORY titles script.txt --subject
"manhole covers" --fact "are round" --contrast square` fills the forms above and ranks them. `STORY lint` warns when the
script's `# title:` scores below 50.

## Topics

**Replicating:**
- Machine / building / vehicle "how it works" topics: ×0.90 [0.81-0.99], n = 130, under-performing on 4 of 5 channels
  (Kurzgesagt ×0.76, Infographics ×0.74, Veritasium ×0.89, Zack ×0.90). Wrap a mechanism in a **human act** (someone
  did something absurd with it) or a **rule being broken**. Don't sell the machine.

**Audience-dependent:** pick from the table of your channel, not from the pooled number.

| Topic family | Strong on | Weak on |
|---|---|---|
| Space / physics | SciShow ×1.48 (n = 112, CI excludes 1), Veritasium ×1.60 | Zack ×0.82, MinuteEarth ×0.90 |
| History | Infographics ×1.16 (n = 58), RicksClips ×1.31 (n < 8) | |
| Geopolitics / military | Infographics ×1.25 [1.01-1.59] (n = 109) | |
| Money | Zack ×1.28 (n = 17) | RicksClips ×0.42 (n < 8) |
| Law / crime | Zack ×1.49 (n = 8) | |
| Animals | Zack ×1.20 (n = 53) | RicksClips ×0.27 (n < 8) |
| Body / medicine | Kurzgesagt ×1.45 (n = 25) | |
| Disasters / survival | | Infographics ×0.66 (CI excludes 1); pooled ×0.85, only 2 channels with enough videos |
| Tech | | pooled ×0.73, n = 17 in total |

**The topic test** combines the measured data with research rules T1-T8:
1. The viewer thinks they half-know it (an everyday object, the body, a famous event).
2. It has a hidden mechanism, a paradox or an "illegal/impossible, yet" fact.
3. The mechanism can be shown in one striking frame.
4. There is a person with a goal or a problem in it.
5. It is not a bare machine explainer.
6. It is evergreen.

**Saturation:** if a big channel did the topic in the last 12 months, change the angle (a new number, a new comparison,
a stake, a misconception) or skip it. Original telling is required by YouTube's originality policy from 2026-10-01.

**Your own channel:** after ~30 uploads, run `vfa topics <your channel> --summary-out
references/styles/data/topics_<you>.json --style <style>`. Your own table then counts double in hookcheck and titlecheck.

## Hooks (the first sentence)

**Measured on the reference channel** (RicksClips, n = 25, nothing significant on its own):
- The toonworld formula is the baseline, not the differentiator: a flat third-person act or fact opens 17 of 25 hooks,
  in both the top and bottom halves.
- Within the formula, the top half has:
  - longer, more concrete hooks: 15.5 vs 12.5 words (rho +0.27);
  - the "X is illegal/impossible, yet" frame: 2 vs 0, both in the top 5;
  - fewer curiosity words: 1 vs 4.
- The only question hook is the second-worst video (×0.04 of its neighbours).
- "You just saw...", "Look at these..." openers sit in the bottom half.

**Across 6 channels** (top-N share minus bottom-N share; no hook type replicates):

| Hook type | Pooled | 90 % CI | Notes |
|---|---|---|---|
| Flat absurd act / fact | +8 pts | -3..+18 | Veritasium +30, MinuteEarth +30 (both CI excludes 0), SciShow +15; Zack -15, Infographics -20 |
| Number / superlative | +8 | -2..+17 | |
| Second person ("you") | +7 | -2..+17 | positive in 5 of 6 |
| "If you X, you'd Y" | +6 | -1..+12 | Zack +25 (n = 6), SciShow +15 |
| Curiosity gap | +6 | -3..+14 | Infographics +20, SciShow +25; Veritasium -20 |
| Question | -5 | -14..+4 | negative in Veritasium (-20), SciShow (-15), MinuteEarth (-10) |

**Rules for a toonworld hook:**
1. A declarative absurd act or fact, voiced on frame 0.
2. Aim for 14-18 words (lint accepts 10-18), with a concrete object, number or place.
3. Variants worth testing: "[X] is illegal/impossible in [place], yet [people] still [do it]" and "If you [everyday
   act], you'd [surprising consequence]".
4. Not a question, an imperative, a present-tense "you just saw" scene or a pile of mystery words.
5. Revealing the outcome is fine; withhold the mechanism (H9).

**Tool:** `STORY hooks "h1" "h2" ...` blends the formula signals (0.4) with `vfa hookcheck` (0.6). Hookcheck is
deterministic and CI-weighted (lift × n/(n+8), halved when the CI includes 0; the matching style channel ×2). It
shows the 3 nearest high-outlier templates and rewrite suggestions.

## Pacing and length (measured)

- **Speech rate:** slower narration does better in 3 of 7 channels, and faster narration wins in none:
  - RicksClips rho -0.37 [-0.65, -0.01]
  - Veritasium -0.25 (CI excludes 0)
  - SciShow -0.28 (CI excludes 0)

  Stay inside the style's `wps_range` (toonworld 3.5-3.8). Don't push it higher. This **overrides** research rule S10
  ("brisk, 150-180 wpm"), which comes from lecture video, not Shorts.
- **Voice start:** the median is 0.0 s on every channel. Veritasium rewards an immediate start (rho -0.39).
- **Duration is channel-specific.** SciShow and Kurzgesagt do better longer: SciShow 50-61 s is 80 % of top-N vs 20 % of
  bottom-N, Kurzgesagt rho +0.41. Veritasium does better shorter (rho -0.33). RicksClips: > 61 s ×0.89 (n = 10),
  35-50 s ×1.20 (n = 7). This is measured only on the hook sample; ignore the pooled duration lifts in the raw aggregate.
- **Hook length:** research rule H3 ("≤ 8-9 words") is contradicted by the data. Measured top hooks are 10-19 words,
  and longer, concrete hooks lead on the reference channel.

## Research rules that hold (and are built into `story.py lint`)

| Rule | Strength | What the lint does |
|---|---|---|
| H2 No greeting / intro / "in this video" | Moderate | `WEAK_OPEN` FAIL |
| H4-H5 A specific gap: a named everyday thing + a surprising claim, a concrete number or noun | Strong (theory) | absurd / stakes / number signals |
| H6 No "here's how / let's learn" framing (lowered CTR in causal headline tests) | Moderate | `TEACH` WARN |
| H9 Revealing the outcome is fine; withhold the mechanism | Strong (lab) | pivot at 40-75 % of the runtime |
| S3 / S2 Re-hook and verbal turns | Anecdotal | re-hook gap check (`rehook_every_s`) |
| S5 One misconception or reversal per Short | Strong (learning) | misconception signal |
| S6 / S8 No outro, no mid-roll CTA | Anecdotal | CTA check |
| S7 Last line flows into the first (loop) | Anecdotal | loop-echo INFO |
| S11 A character with a goal or a problem | Strong (meta-analysis) | formula beats (setting, mock, incident) |
| T8 The payoff is a reusable mechanism, not only a fact | Strong (lab) | explanation beats before the payoff |
| P4 Negative / danger framing over "amazing" words, without misleading | Strong (headlines) | negative-word signal; title negation |

## Limits

- The classifiers are lexicon heuristics. About 10-15 % of titles land in topic "other", and some assignments are wrong.
- The view counts are a single snapshot (2026-11-10/11). Very new uploads are excluded.
- RicksClips has only 25 Shorts in this format, so none of its effects are significant on their own.
- Shorts flat listings carry no dates or durations. Duration data exists only for the per-video sample.
- Re-measure with `vfa topics` (cached, rate-limited, backs off on HTTP 429). Never use browser cookies or alternative
  clients to get around a block.

## Sources (primary first; the full list of 65 is in the research notes)

- YouTube Help: audience retention / key moments (answer 9314415), A/B testing titles and thumbnails (16391400),
  Research tab (11962757).
- YouTube Shorts originality update, 2026-10-01, reported by Search Engine Journal and Android Authority.
- Banerjee & Urminsky 2025, *Marketing Science* 44(3): causal headline tests; information-seeking ("teach me") cues
  lowered CTR.
- Robertson et al. 2023, *Nature Human Behaviour*: each negative word in a headline raised CTR by ~2.3 %.
- Loewenstein 1994, *Psychological Bulletin*; Kang et al. 2009, *Psychological Science*: curiosity peaks when people
  half-know the answer.
- Muller et al. 2008, *JCAL*: a misconception followed by a refutation teaches better.
- Leavitt & Christenfeld 2011, *Psychological Science*: spoilers don't spoil stories.
- Liquin & Lombrozo 2020, *Cognitive Psychology*: explanations that generalise satisfy curiosity.
- Berger & Milkman 2012, *JMR*: high-arousal emotion drives sharing.
- van Laer et al. 2014, *JCR*: narrative transportation meta-analysis.
- Guo, Kim & Rubin 2014, *L@S*: video engagement. Lecture video, so it does not transfer to Shorts pacing (see above).
