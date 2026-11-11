# Case study: one hero short of the toonworld reference, measured frame by frame

Source: a 62.2 s vertical short from the reference channel of `toonworld-explainer.md` (uploaded 2026-11-08, 3.1 M
views and 98 k likes three days later; title form "Why [people] started [doing X]"). Measured 2026-11-11 with
`vfa analyze --sheets all --speech whisper --deep` (1,867 frames, every frame) plus `vfa breakdown`. Numbers and
paraphrase only: no footage, frames or transcript are stored. Fingerprint: `data/toonworld-explainer_case1_fingerprint.json`.

Use this file when the user wants "a video like that one": it is the per-shot recipe that the channel aggregate
(27 shorts) averages away.

## 1. Story (238 words, 16 sentences, 3.85 words/s, no pause longer than 0.6 s)

It is NOT the "You see," mechanism formula. It is a **scheme-and-comeuppance fable** that ends as an origin story:

| # | beat | what the sentence does (paraphrased) | s |
|---|---|---|---|
| 1 | hook = an ACT in progress | a man brakes on purpose and gets hit from behind; 17 words, present tense, consequence inside the sentence | 0-4.3 |
| 2 | the rule he exploits | he climbs out holding his neck, because the driver behind always gets the blame | 4.6-10.1 |
| 3 | reward, rule of three | the insurer pays for his car, his doctor and a fat cheque | 10.3-15.7 |
| 4 | escalation 1: again | next week he repeats it with another car | 15.9-18.5 |
| 5 | escalation 2: he chooses victims | a three-item list of easy targets | 18.6-23.9 |
| 6 | escalation 3: an accomplice | a friend boxes the victim in | 24.1-27.6 |
| 7 | escalation 4: absurd peak | so much money that he buys a nicer car just to crash it | 27.6-31.7 |
| 8 | authority pushes back | the insurer calls; ONE spoken line by the clerk, ONE cheeky reply by him | 31.9-38.7 |
| 9 | stakes restated | it is his word against the other driver's, and he counts on that | 38.7-43.3 |
| 10 | the turn, marked by weather | "one rainy morning" he picks a quiet man in an old car | 43.5-49.7 |
| 11 | the opponent does NOT react | he does not shout, does not even get out (two negations) | 49.9-52.5 |
| 12 | the reveal object | he just points at a small box on his windscreen | 52.6-54.9 |
| 13 | reversal | it filmed an empty road and a man braking for nothing | 54.9-59.7 |
| 14 | origin tag (7 words) | "and that is how [the object] was invented" - answers the title, no CTA | 60.0-61.9 |

Rules to take from it:
- **Hook with an act, not a fact.** The first sentence shows somebody DOING the strange thing, and its result.
- **One new idea per 3-4 s**, and every escalation step is a new picture (new place, new prop or new time of day).
- **Lists come in threes** (twice here).
- **Two lines of dialogue, mid-video**, both short, one of them a joke. Narration everywhere else.
- **The turn is announced by a change of weather and light**, not by "but then".
- **The antagonist who wins is calm.** His whole performance is one gesture (pointing).
- **End on the answer to the title** in under 8 words and stop. Runtime ends 0.3 s after the last word.
- The narration itself is plain. **The jokes are in the picture** (see section 3).

## 2. Edit and camera (measured)

| metric | this short | channel aggregate (27) | our elevator v1 |
|---|---|---|---|
| hard cuts | 9 (8.7/min), first at 1.23 s | 2.7/min | 2.0/min |
| scene changes incl. soft | **20** (one per 3.1 s): 7 cuts, 8 dissolves (median 11 f), 2 zoom-throughs, 1 wipe | - | 12 |
| setups in the first sentence | **3** (interior close-up, exterior wide, impact close) | - | 1 |
| longest take | 16.5 s and 13.4 s: one continuous travel across 3-4 sentences | 16.2 s ASL | 20 s |
| frames with camera motion | 93 % (fast 39 %, whip 7 %) | 99 % (fast 55 %) | 93 % (fast 27 %) |
| glide length median | 24 f (IQR 12-54) | 44 f | 20 f |
| push-in shots | 80 %, pull-outs 20 % | 100 % | 100 % |
| handheld | in every shot, roll of a few degrees | yes | none |

- Cuts land on a word start (median offset 0.07 s), usually a stressed noun ("highway", "doctor") or a conjunction
  that starts the next clause ("because", "but").
- **Point-of-view shots carry the story twice**: from the driver's seat through the windscreen, and the dash-cam's own
  footage with a diegetic overlay (REC dot, time code, speed) for the reveal. The reveal is SHOWN as evidence.
- Long takes travel along a line of things (a row of cars at dusk) while the narration lists them: one move, one list.

## 3. Staging: a visual gag per sentence

Every sentence gets one prop or set that makes the claim concrete and funnier than the words:
- the reward list: a hospital bed on the front lawn, then banknotes raining over him;
- the escalation: the garage literally overflowing with cash; a new sports car bought to be crashed;
- the insurer: a desk sign counting the days since his last injury that flips to zero on the line, and framed photos
  of his earlier "accidents" on the office wall (set dressing that tells the back-story);
- the excuse line: he takes the call from a pool with a rubber duck;
- the comeuppance: rain, desaturated blue-grey, an old car with a calm driver.

Count: 14 distinct sets or set-ups for 16 sentences. Our elevator v1 had 6 places for 17 sentences.

## 4. Colour script (per story phase)

| phase | light | palette anchors |
|---|---|---|
| hook + rule + reward | bright day, deep blue sky | #1b80d9 sky, #969aa1 road, saturated car colours |
| escalation | dusk, violet sky, headlights on | #6e54d3, #170e33 |
| peak greed | night, practical lights (garage, string lights) | #011d68, warm bulbs |
| authority | cool office daylight | #7297aa, wood #994f2c |
| turn + reveal | rain, overcast, desaturated teal-grey | #314e5f, #87adbe |

Whole short: luma mean 0.40, saturation 0.44, warmth -0.07 (cool), black floor 0.008 (this short HAS true blacks, the
channel median 0.098 does not), edge density 8.7 % (ours: 4.9 %: their worlds carry about twice the detail: textured
asphalt, grass blades, reflective car paint, wet-road reflections, rain streaks, volumetric clouds), DOF ratio 1.43.

## 5. Characters and acting (looked at frame by frame)

- Build: big round head (about 38 % of the height), pill torso, thin limbs with fists, ~2.6 heads. Flat 2D cut-outs that
  always face the camera, inside a detailed 3D world, lit by the scene (soft shading, glass reflections over them).
- **They interact with the world**: sit behind a steering wheel with a seat belt, lean on a bumper, stand in a pool
  with a waterline, hold a phone, a clipboard, a coffee, a cheque.
- **Pose-to-pose**: one held pose per clause, popped into in a few frames; no floaty in-betweens. Micro-animation
  activity 0.027 (ours 0.007): the bodies are large in frame and the pops are big.
- Faces: tiny ink features. Emotion comes from brow angle + mouth shape + one effect (sweat drop, ring eyes for
  shock, >< for pain). Expression changes ON the word.
- Background characters react too (the victims get ring eyes); nobody in frame is neutral during an incident.
- Lip-sync is loose (mouth-to-speech r = 0.04): mouths are expression mouths, not phoneme tracks. Do not spend effort
  on narration lip-sync; give only the characters' own lines a talking mouth.

## 6. Captions and sound (measured)

- Captions: 1 word per page (2-3 only for short function-word groups), 0.35 s per page, at 70 % of the height, on
  screen 95 % of the runtime, white heavy sans (~85 u, 4.3 % of the height), black outline 0.06 em, no box, no
  highlight colour, frame-accurate (-0.009 s median vs the spoken word).
- Voice 3.85 w/s, pauses p90 0.19 s, no pause over 0.6 s. Loudness -14.0 LUFS, LRA 2.2 LU, true peak -2.0 dBTP.
- Music plays 100 % of the runtime at 99 bpm and sits **20 dB under the voice** (median margin 20.4 dB, p10 17.9):
  much quieter than our first mixes (9-15 LU). No music stops. Non-vocal onsets 1.7 per second: SFX on every action.

## 7. What changed in the skill because of this

- New `bobble` character kind and a 20-character pack (`lib/characters/kinds.ts`, characters.md 5.3 I): full-body IK
  acting, props, hat tip, 11 outfits, 10 hair styles, 10 hats, tall (3.4 heads) and short (2.6 heads) builds.
- `poseTrack()`: pose-to-pose acting with a pop, one held pose per clause.
- Elevator proof short v2: hook opens on a close-up of the man and cuts on the second clause, handheld on the rig,
  narration tightened from 2.72 to 3.14 w/s (pauses capped at 0.2 s), music 19-21 dB under the voice.
- Checklist for "a video like that" (story-engine.md): act-hook, 3 setups in sentence one, a gag prop per sentence,
  14+ setups per minute, colour script per phase with a weather turn, POV shot for the reveal, origin tag.

Not built yet (largest remaining gaps, in order): world detail (edge density 4.9 % vs 8.7 %: needs real CC0 vehicle /
building assets and detail textures), diegetic screen overlays (dash-cam UI), particle crowds (money rain),
characters seated inside vehicles behind reflective glass.
