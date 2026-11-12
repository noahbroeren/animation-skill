# Script (craft sheet)

The script is the clock and the shot list of a short: every sentence is spoken in about 4 s and has to become a
picture. In this style it is a told story, not a lecture: one physical act in the first sentence, a doubter, a climb in
visible steps, the "why" held back to about 70 % of the runtime, and a last line that lands back on the opening. The
most important rule: **write about 15 drawable sentences of about 15 words, timed at 3.74 words/s, and keep the
mechanism for the last third.**

Units: seconds and frames (f) at 30 fps; positions as a share of the runtime (first word to file end). Voice, pauses
and the mix: `craft/sound.md`. Cross-channel hook and title evidence: `craft/hooks-titles.md`. Workflow and commands:
`pipeline/story-engine.md`.

## At a glance

| rule | target (median, range) | how to check |
|---|---|---|
| length and clock | 230 words for ~62 s (215-245) at 3.74 w/s (3.6-3.85); reference 234 [218-238] words in 63 s | `story.py lint` (INFO below 194 or above 257 words) |
| hook | 1 sentence, one physical act, 12-16 words (lint 10-16), 3.3 s [3.0-4.5] | lint `hook_words`, WEAK_OPEN, TEACH |
| sentence length | median 15 words (13-17), p75 ~20, max 32; about 1 in 10 sentences has 25+ words | lint (WARN median > 19, any > 32) |
| very short sentences (5 words or fewer) | 9 % [4-18]; keep 5-15 %, never 3 in a row | lint `short_sentence_share`, `max_consecutive_short` |
| joiners | 28 % of non-hook sentences open with So / But / Then / And | by hand |
| numbers, dates, names | 2.3 numbers per 100 words [2.0-3.3] (max 3.5); dates 0-1; names 0.5 per video (max 2) | lint numbers + dates; names by hand |
| doubter lines | 2 spoken lines [1-3] of ~9 words, at least one in the first 40 % | lint `mock_lines` (INFO) |
| "You see" | connector at 3-12 % (median 5 %) and/or pivot at 62-82 % (median 74 %); never at 12-60 % | lint pivot and "You see" WARNs |
| beats on the clock | mechanism starts 73 % [65-78], twist 85 % [78-91], last sentence 91 % [90-94] | `story.py beats` on the real `words.json` |
| humour | 4.7 devices per video; 0.80 per 10 s [0.73-0.92] | reviewer checklist |
| ending | echoes the hook in 14/20; outro or call to action in 0/20 | lint CTA FAIL, hook-echo INFO |
| picture per sentence | 1.27 joins per sentence [1.17-1.39]; 59 % of sentences open on a new shot | `story.py board`, `[board lint]` |

## How it is built

1. **Pick the story shape.** Three shapes cover 16 of the 20 measured shorts. Groups of 5-6 are anecdotes, not
   evidence, but the order is worth knowing:

   | shape | beat line | n, median views |
   |---|---|---|
   | underdog vindicated | someone does a thing that looks stupid; people mock him; a rival looks smart; time or weather turns; the stupid thing saves him and the rival is hit | 5, 14.1 M |
   | strange event, explained | an odd rule or scene; witnesses (or "you"); stranger and stranger; a short line of disbelief; a late "You see"; a dry understatement | 5, 8.2 M |
   | scheme and comeuppance (`story-engine.md` Formula B) | the schemer's act; the reward; escalation; authority pushes back; a quiet opponent or a hidden fact flips it; an origin tag | 6, 6.3 M |

   The other four: a "levels" list, two invented worlds and one explainer without a character (the lowest-viewed).
2. **Write the core in one line:** `[who] did [odd act] -> [what it caused] -> [the mechanism] -> [who got the ironic
   payoff]`, then 5-8 hook variants ranked with `story.py hooks`.
3. **Fill the template.** 230 words at 3.74 w/s = 61.5 s of voice, plus a 0.32 s tail = 61.8 s (1,855 f). Clock times
   assume the first word on frame 0.

   | # | beat | clock s (f) | share | sentences | words (range) | what to write | what the animator gets |
   |---|---|---|---|---|---|---|---|
   | 1 | hook | 0.0-3.2 (0-96) | 5 % | 1 | 12 (10-16) | role + past-tense physical verb + concrete object + one odd detail or count | the act already moving on frame 0; a second setup by 1.5 s (45 f) |
   | 2 | setup | 3.2-10.7 (96-321) | 12 % | 2 | 28 (18-45) | optional "You see," + the rule of this world, the stakes or the prize, with one number you can show | a travel into the wider place; one prop or sign that shows the rule |
   | 3 | doubt | 10.7-14.4 (321-433) | 6 % | 1-2 | 14 (10-22), incl. one spoken line of 4-10 | someone with power, or a crowd, laughs, warns or waves it off | a face, a reaction, a two-shot |
   | 4 | escalation | 14.4-40.1 (433-1203) | 42 % | 6 (4-7) | 96 (80-120) | each sentence: So / But / Then or a clock word, a new object or place, one consequence; one list of three, one everyday unit, one absurd peak, a second short spoken line | a new shot on each sentence's first word; props grow, multiply or change colour step by step |
   | 5 | turn | 40.1-42.2 (1203-1267) | 3 % | 1 | 8 (4-9) | time or weather jumps, or the quiet opponent arrives | a light or weather change; the climax place |
   | 6 | mystery (optional) | 42.2-43.6 (1267-1307) | 2 % | 1 | 5 (3-7) | the viewer's own doubt as a short question | a held reaction |
   | 7 | pivot + mechanism | 43.6-51.6 (1307-1548) | 13 % | 2 (1-3) | 30 (15-40) | "You see," + the real mechanism, told with a prop already in the story or an everyday analogy aimed at "you" | a change of visual mode: a drawn plan, a cutaway, a cross-section model, a frozen frame turned into a photo, or an analogy insert that zooms back into the story |
   | 8 | reveal | 51.6-57.0 (1548-1709) | 9 % | 1 | 20 (12-30) | the consequence lands on the doubter or the rival (ironic reversal) | the biggest image, the music change, the second big hit |
   | 9 | payoff | 57.0-61.5 (1709-1845) | 7 % | 1 | 17 (12-20) | what it meant or where it came from, echoing a hook word or object; the last word is a concrete noun | hold the final image; the bed drops ~6 dB; the file ends ~0.3 s (9-10 f) after the word |

   Budget: 12 + 28 + 14 + 96 + 8 + 5 + 30 + 20 + 17 = 230. The mechanism then starts at 70 %, the reveal at 83 % and
   the last sentence at 92 %; "You see" as a connector sits at 5 %. Over 245 words: trim the escalation first.
   Reference shares: hook 6.5 % [5.2-8.7], setup 13 % [7-22], story (doubt, escalation, turn, mystery) 51 % [45-57],
   pivot + mechanism 11 % [0-16], reveal + payoff 16 % [13-19].

   An invented example on this template (a STORY frame around a true mechanism; 239 words, 16 sentences; `story.py
   lint` scores it 100 and estimates 67.7 s, at 3.74 w/s it speaks in about 63.9 s):
   ```
   # title: Why Manhole Lids Aren't Square
   An engineer put a brand-new square lid on a drain, and it fell straight through.
   You see, his town had 40 open drains, and the council wanted every one covered before the winter fair.
   Whoever covered them first would win the contract and a gold medal from the mayor.
   @foreman: Round lids? We'll look like a bakery.
   So the foreman cast his square lids twice as thick, and two of them still vanished into the sewer.
   Then he bolted a chain to every lid, and the chains rattled all night like angry ghosts.
   By the fair, the street had nine open holes, three bent carts and one very wet mayor.
   But the council gave him the contract anyway, because his lids were cheaper by a coin each.
   @engineer: Mind the corners when the snow comes.
   Then the snow came.
   Within a week the ploughs had knocked 11 lids into the sewer, and every single one was square.
   Why only the square ones?
   You see, a square lid is wider across its corners than along its sides, so on edge it slips through.
   Hold a coin over a paper ring a hair smaller, and however you tilt it, it will not fall through.
   On the first icy morning, the foreman's own square lid tipped on edge and swallowed him to the *knees*.
   By spring, every drain in town had a round lid: the one shape that never falls into its own hole.
   ```
4. **Write for the picture (our 10 rules).**
   1. Every sentence is drawable: a person by role, a physical verb, a thing you could hold or point at. No object, no
      sentence.
   2. Start inside the action: the first verb is something a character is already doing on frame 0, not a fact.
   3. One sentence, one new shot: each sentence brings a new place, object or framing, and the new noun sits in its
      first 3-5 words, where the join lands.
   4. Count with objects: a number must be showable as a pile, a row, a gauge or a size next to a coin, a finger or a
      sheet of paper. Years are not showable.
   5. Let doubters speak briefly: under 10 words, in the narrator's voice; it gives the animator a face to cut to.
   6. Climb in visible steps: every escalation is bigger, more, closer or later, so one composition repeats with one
      thing changed.
   7. Explain with a prop from the story, or an analogy the viewer could do at home; never a sentence only a chart
      could show.
   8. Put the turn in the weather or the clock ("that winter", "one night"): the light change comes free and tells
      the viewer the climax is near.
   9. End on an image, not a statement: the last sentence names something we will see, echoes the opening and stops
      on its strongest noun.
   10. Sound like a storyteller, not a list: mostly 12-20-word sentences joined with but / so / then; very short
       sentences only for a doubter, a turn or a punch.
5. **Place the humour.** 94 devices were labelled in 20 scripts, spread evenly (20 / 24 / 14 / 21 / 15 per fifth of
   the runtime). Every example below is invented:

   | device | count (videos) | example |
   |---|---|---|
   | ironic reversal | 18 (13) | the man who mocked the round lid is the one who falls into the square hole |
   | exaggeration / absurd image | 13 (10) | "By spring the town owned more warning signs than lids." |
   | mock or deadpan line | 11 (10) | "@clerk: Lovely. Another hole." |
   | list of three | 9 (8) | "nine open holes, three bent carts and one very wet mayor" |
   | callback / loop | 8 (6) | the last line comes back to the lid that fell in sentence 1 |
   | self-answered question | 7 (7) | "So what did he do? He made the lids heavier." |
   | simile / personification | 6 (5) | "The old elevator groaned like it had opinions about the third floor." |
   | understatement | 5 (5) | "The inspector was not delighted." |
   | escalating mockery | 5 (4) | a smirk, then a joke, then the whole office clapping |
   | everyday units | 4 (3) | "a gap no wider than a coin" |

6. **Turn every sentence into shots.** Per 10 sentences the reference makes about 13 joins: 6 on a sentence's first
   word, 2 on a clause start after a comma, 5 inside clauses.

   | reference (13 videos, 265 transitions) | number | our board |
   |---|---|---|
   | joins per sentence / per minute | 1.27 [1.17-1.39] / 19.3 [18.3-22.1] | `story.py board`: the first clause of each sentence carries the shot |
   | sentences that open on a new shot | 59 % [45-64] | `viaOf`: a shot beat on a sentence's first word dissolves (9 f) |
   | joins within 0.4 s (12 f) of a sentence start | 44 % (chance 20 %) | beat `off` default -0.06 s: the picture leads the word by ~2 f |
   | joins on a sentence or clause start | 62 % (chance 40 %) | clauses split at commas and "and / then / but", 4+ words, at most 3 per sentence |
   | sentences of 5 words or fewer | not measured (our rule 25) | the draft makes them a beat inside the shot before |
   | mechanism lines | a different visual mode in 5/5 checked | by hand (see the template, beat 7) |
   | hook | verb on screen by frame 3 in 14/20 and by frame 60 in 20/20; a second setup within 2 s in 14/20 (11 by a camera travel) | beat 0 at frame 0, a travel or a second shot before 45 f |

7. **Lint, voice, board.** `story.py lint` until the score is 90+ with no FAIL; fact-check (`claims`, `verify`); voice;
   `story.py beats --words words.json` to read the real positions; `story.py board` for the draft and its list
   "still needs a gag": every line on that list breaks rule 1 of step 4.

## Rules

Length and pace
1. 215-245 words for 58-66 s (target 230 for 62 s); never under 200 words for a short over 55 s.
2. Time the draft at 3.74 w/s; after the first take, time it at the voice's own calibrated rate (`# voice: ID`).

Hook
3. Sentence 1 is one physical act in the past tense, by a person named by role, with a concrete object and one odd
   detail or count: 10-16 words (aim 12-16), spoken in 2.8-4.5 s. Reference: "[he / a role / they] + verb + object" in
   14/20; one sentence with two separate acts is a fault.
4. Not a question (1/20, the lowest-viewed), greeting, "did you know", "you just saw", "look at", date or lesson framing.
5. The outcome may be told; the mechanism never is.
6. A variant worth testing is the forbidden-rule frame (3/20): "In one hotel, nobody was allowed to press the elevator
   button twice."

Sentences
7. Median 13-17 words; at most 1 in 6 sentences over 25 words; none over 32.
8. Sentences of 5 words or fewer: 5-15 %, and each one is a doubter's line, a turn or a mystery echo (pooled lengths:
   mockery 9, turns 9, mystery questions 7 words; every other beat 15-18). Never more than 2 in a row.
9. 25-35 % of non-hook sentences open with a joiner (reference So 10 %, But 7 %, Then 5 %, And 5 %, Well 2 %); 2-4 clock
   words per 100 words (reference 3.5 [2.3-4.4]).
10. Numbers at most 3.5 per 100 words, each a quantity on screen; dates at most 1 per video (2/20 had any).
11. Proper names at most 2 per video; everyone else is a role ("the foreman", "his landlord").
12. Abstract nouns at most 6 % of content words (reference 4 % [2-6]); content words about 44 % of all words.
13. About 1 "you" per 100 words (0.5-1.7); the analogy line is where "you" belongs (4/20 told a whole act in "you").
14. 0-2 questions per video (median 1): a doubter's line, a mystery echo or a self-answered set-up.
15. 1-3 spoken character lines of 4-12 words (median 9), at least one in the first 40 % (20 of 37 were), read by the
    narrator. 16/20 had at least one.
16. 4-6 escalation sentences; each names a new object or place; 2-4 of them carry a clock word.
17. At least 4 humour devices (0.7+ per 10 s), at least one in every fifth of the runtime, including one list of three
    and the ironic reversal at the end.

Structure
18. "You see" at most twice: a connector at 3-12 % (6/20 used it there) and the pivot at 62-82 % (10/20); never between
    12 % and 60 %. "Well," can open a line at 20-56 %.
19. The mechanism starts at 62-82 % (aim 70-74 %), takes 1-3 sentences and 15-40 words (at most 15 % of the runtime),
    and uses a prop already in the story or an everyday analogy; skip it when the picture shows it (6/20 had none).
20. The twist lands at 78-91 %; the title question is answered at 80 % or later (reference 89 % [81-93]).
21. The last sentence starts at 88-95 % and has 12-20 words (reference 18 [14.5-20]).

Ending
22. The last line echoes a hook word or object, or proves the hook's claim; it is the twist image itself (8/20) or what
    it meant (12/20), and its last word is a concrete noun.
23. No outro, no call to action, no "part 2", no question at the end.

Picture
24. Every sentence has a role, a physical verb and an object you could point at; its new noun sits in the first 3-5
    words.
25. A sentence of 18+ words gets a second picture after its comma; a sentence of 5 words or fewer stays in the shot
    before.

## In our engine

| what | where (file / field) | 1.9 value | status |
|---|---|---|---|
| clock rate | `story/targets.json` `wps`, `wps_range` (toonworld-explainer) | 3.74, [3.6, 3.85] | built |
| length | `words_range`, `duration_s`, `duration_target_s` | [215, 245], [40, 78], 62 | built (INFO under 194 / over 257 words; FAIL outside 40-78 s) |
| timing estimate | `story.py time_sentences` (no words file) | words / wps + 0.25 s after every full stop | partly: `wps` already includes pauses, so the estimate reads ~0.25 s long per sentence (about +4 s on 16 sentences); trust `beats --words` |
| voice rate | `story.py calibrate words.json --voice ID` -> `story/voices.json`; `# voice: ID` header | e.g. clark-v4-tight 3.14 w/s | built |
| hook | `hook_words`; `WEAK_OPEN` (FAIL), `TEACH` (WARN), absurd / stakes signal (WARN) | [10, 16] | partly: a question hook and a two-act hook are not flagged; the act signal is a word list ("put", "made", "built" pass, "dropped" does not); `hooks-titles.md` still names 14-18 from the older 25-hook sample |
| sentence length | `sentence_words_median`, `sentence_words_max` | 15 (WARN above 19), 32 | partly: a median far BELOW 15 is not flagged (a 9-word median passes; only the short share catches it) |
| short sentences | `short_sentence_share`, `short_sentence_words`, `max_consecutive_short` | [0.05, 0.15], 5, 2 | built (WARN above 15 % and at 3 in a row; no check below 5 %) |
| "You see" and pivot | `pivot_phrases`, `pivot_position`, `connector_you_see` | [0.62, 0.82], [0.03, 0.12] | built (`story-engine.md` step 3 still says 40-75 %: the measured window is this one) |
| last sentence | `payoff_last_frac` | 0.09 | partly: labels the last ~9 % of sentences "payoff"; the 88-95 % start is not checked |
| numbers, dates | `numbers_per_100w_max`, `dates_max` | 3.5, 1 | built (counts digits and hundred / thousand / million / billion / dozen; "three", "forty" are not counted) |
| names | `proper_names_max` | 2 | not built: in `targets.json`, lint does not read it (`story.py claims` lists sentences with named entities) |
| spoken lines | `mock_lines`, `dialogue_lines` | [1, 3], [1, 3] | partly: lint counts `@speaker:` lines against `mock_lines` (INFO); `dialogue_lines` is unused; the first-40 % position is not checked |
| re-hooks | `rehook_every_s` | 9 (WARN after 14.4 s without one) | built |
| callback, CTA | lint hook echo (a 4+-letter word shared by sentence 1 and the last two); CTA regex over the last 3 sentences | INFO / FAIL | built (the CTA regex also fires on plain prose such as "any way you like and it...": reword) |
| joiners, humour, abstract nouns, clock words | none | - | not built (reviewer checklist; part of `vfa scriptcheck`) |
| draft board | `story.py board` (`story/board.py`) | one shot per sentence on its first clause; clauses of 4+ words, at most 3; 5-word sentences stay in the shot before; a dialogue exchange is one two-shot | built (its `music: "calm"` on the pivot breaks `craft/sound.md` rule 16: delete it) |
| joins | `engine/src/lib/board.tsx` `viaOf`, `glideLen` | shot on a sentence's first word -> dissolve 9 f; inside a sentence -> glide 14-26 f; a framing under 20 f -> soft cut 6 f | built |
| join rate | `soft_transitions_per_min` | [18, 26] | not built: documented only, no code reads it; `lintBoard` checks shot length, not joins per sentence |

How the template looks on a board (invented example; `lid` and `lidModel` are props in `board.props`; `street`,
`town` and `workshop` are places):

```ts
beats: [
  // sentence 1 (hook): the shot is up on frame 0 and the act is already moving
  { at: 0, place: "street", key: "day", shot: { size: "medium", on: "engineer", move: "push" },
    act: { engineer: { pose: "shock" } }, gag: { prop: "lid", at: "center", in: "drop" } },
  // same sentence, second clause: the camera travels (glide) to the drain; no sentence start, so no dissolve
  { at: "fell", shot: { size: "insert", on: "lid", h: 0.9 } },
  // sentence 2 opens on a new place with its first word: a 9 f dissolve to a wide of the forty drains
  { at: "you", place: "town", shot: { size: "wide" } },
  // the 7-word doubter line: one shot for the exchange, the foreman talks (narrator's voice)
  { at: "round", shot: { size: "two", on: ["foreman", "engineer"] }, act: { foreman: { pose: "point", expr: "laugh", talk: true } } },
  // the 4-word turn ("snow#2": the engineer's line said "snow" first): a beat inside the running shot that changes
  // the light, not a new shot
  { at: "snow#2", key: "overcast" },
  // the pivot ("You see", second time): a new visual mode, a cutaway of a lid and its hole
  { at: "you#2", place: "workshop", shot: { size: "insert", on: "lidModel", h: 0.6 } },
],
```

## Check

- `py story/story.py lint public/ID/script.txt --style toonworld-explainer`: no FAIL, score 90 or more. Failures look
  like `WARN 28% of the sentences have 5 words or fewer`, `WARN pivot at 48% of the runtime (target 62%-82%)`,
  `WARN 'You see' outside its two places`, `INFO the ending does not echo the hook`.
- `py story/story.py beats script.txt --words words.json --out plan/`: `beats.md` has the real start of every sentence;
  read the mechanism, twist and last-sentence positions there, not from the lint estimate.
- `py story/story.py board ...`: `board.md` "still needs a gag" = sentences that are not drawable yet.
- `node tools/render.mjs --project ID --stills cues+10` prints `[board lint]` and one still per beat: a sentence whose
  still does not show its claim with the sound off fails rule 24.
- By hand (no tool yet): joiner share, humour count per fifth, proper names, the first spoken line before 40 %, one
  act in the hook, the last word a noun.

## Common mistakes

From our coin short (56 s, 18 sentences):

| what went wrong | ours vs reference | fix |
|---|---|---|
| too few words | 172 words vs 234; at the reference pace our 56 s would hold 207 | write to 215-245 words; trim the escalation, not the setup |
| telegraphic sentences | median 9 words vs 15.5; 28 % of sentences of 5 words or fewer vs 9 % | join with but / so / then; keep short lines for a doubter, a turn or a punch (lint `short_sentence_share`) |
| history-lecture register | 6.4 numbers per 100 words, 6 dates, 5 proper names vs 2.3 / 0-1 / 0.5 | clock words instead of years, roles instead of names, only showable counts |
| a crowded hook | 17 words, 5.0 s, two acts vs 12.5 words, 3.3 s, one act | one act and its odd detail; the second act becomes sentence 2 |
| a lecture in the middle | 3 explanation sentences = 16 % of the runtime vs 1-2 and 11 % | 1-3 sentences, 15-40 words, told with a story prop |
| no callback | ended on a new object vs 14/20 echoing the hook | end on the hook's object or claim |
| few joiners, date openers | 3 of 17 sentences open with a joiner (18 %) vs 28 %; 4 open with a date or a day | open with So / But / Then; move the time into a clock word |
| the weakest shape | a scheme-and-comeuppance story (median 6.3 M in the reference, n 6) | try the underdog shape first when the topic allows it (n 5, anecdotal) |

What was already right: mechanism at 69 %, twist at 85 %, last sentence at 90 %, humour 0.71 per 10 s, 2 spoken lines.

## Sources

The private study of 20 shorts of a reference channel in this style (35,987 frames, transcripts and stems, 2026-11-12;
13 frame logs for the picture-per-sentence numbers); hook and title evidence in `references/craft/hooks-titles.md`.
