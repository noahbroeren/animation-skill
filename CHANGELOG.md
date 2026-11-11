# Changelog

## 1.8.0 - 2026-11-12
- **The person is shown doing the thing.** Three strict reviewers scored the 1.7.1 coin short camera 4, edit 3, depth 3,
  characters 4 out of 10: 34 setups of 1.7 s, tools floating beside empty hands, a climax of half a second. The proof
  short is rewritten as 13 shots (`engine/src/projects/coins/index.tsx`): beats change the acting, the prop and the
  focus inside a shot. Held props are new (`hold` / `hold2`: shears with opening blades, coin, file, hammer, sack,
  quill, bar; `aim` points a prop at something), so the blades close on the word "shaves".
- **Storyboard**: `Beat.focus` (rack focus on a word), travels of 20-40 frames, a slow roll drift on every shot, eyes
  38 % from the top in medium and close shots, stronger depth of field per shot size, nods on spoken words, bigger
  captions, crowd reaction `snip`. `lintBoard` names short shots, whips, two texts at once, a climax held under a
  second and boards where people do not act; `render.mjs --stills` and `make.mjs` print it.
- **`story.py board` drafts one shot per sentence** (clauses, short sentences and replies are beats inside it, a
  dialogue exchange is one two-shot, no whips): 14 shots for the coin script, was 23.
- **Life and dressing in every set**: smoke, sparks, swinging signs, bunting, curtains, flickering lanterns, candles and
  chandeliers, wind in the trees, posters, shelves, cabinets, hanging rows of pots and tools; a plank rack instead of a
  flat board in the workshop; a dark wainscot under the wall colour in the old office.
- **Value and line**: brick has dark joints by default with a lit and a shaded edge per brick; world ink is heavier and
  darker (`widthNear` 4.2, `hue` 0.1), bobble outlines 18 % lighter; golden shade is less violet, night less blue.
- **Thumbnails, titles and 16:9 from the same storyboard**: every board has thumbnails (`autoThumbs`: hook, climax
  word, number, evidence, hardest hit), `story.py titles --auto --out` writes ranked title variants (script title
  rewrites plus every "why ..." clause the narration says, numbers as digits), and `make.mjs --also long` renders the
  16:9 version. All three run after `produce`.
- Fixed: the release bump had been rewriting a dependency's version in `package-lock.json` since 1.7.0 (restored; the
  lock's own version now follows the release).
- Measured on the coin short (same script, voice and sound; 1.7.1 -> 1.8.0): detected cuts 13 -> 4 (11 transitions, all soft), average shot (detector) 4.1 -> 11.3 s against 16.2 s in the reference,
  hardest transition 18.6 -> 7.0, micro-animation 0.013 -> 0.015 (reference 0.020), background blur ratio 1.23 -> 1.39,
  QA WARN with 0 FAIL. Final numbers of the last render: `renders/coins_final/report.md`.
- Still weak (next): camera travel is slower than the reference (fast-motion frames and glide length), the day
  interiors are warmer than the reference, and props stacked for 9:16 do not always fit the 16:9 frame.

## 1.7.1 - 2026-11-11
- **The cuts were too hard (user feedback on the coin short), and most of them were a bug.** The board's camera
  "travels" jumped: a shot ended two frames before the next cue while the travel to the next shot had already
  started, the rig handed over mid-travel and the picture jumped half the distance in one frame. 12 of 23 detected
  cuts were these jumps. QA passed them because the board had listed frames around every travel as intended events.
  Fixed: a shot now ends where the next travel starts (travel length follows the previous shot, 12-28 frames), and
  travels are no longer listed as events.
- **Softer cuts**: `via: "cut"` is a 4-frame cross-dissolve by default (`softCut` on the board, 0 = hard), the
  settle after a hard cut is 12 % over 16 frames (was 26 % over 11), and the subject keeps its side of the frame
  across a cut (`side` carries over).
- **`vfa strips`**: nine consecutive frames around every planned and detected transition, one row each, with a
  harshness number; `produce.mjs` writes `qa/strips.jpg`. `vfa qa` has a new line, "cuts explained only by an
  event" (WARN with the frames). Lesson: I judged transitions from numbers and stills; nine frames in a row showed
  the defect at a glance.
- Also fixed on the way: a follow shot's key path now ends where its subject ends (the camera jumped back to the car's
  starting point when the follow was over), whips and travels are declared in the plan (`soft`, `travels`), and the
  "undeclared cut" guess no longer switches the motion blur off on the fastest frames of a travel.
- Measured on the coin short (same script, voice and sound): detected cuts 23 -> 13 (11 planned soft cuts + the whip
  + one fast travel), cuts explained only by an event 12 -> 0, unplanned 0, average shot length 2.4 -> 4.1 s, style
  match 16/32 -> 18/32, QA WARN with 0 FAIL (the one WARN is the style match).

## 1.7.0 - 2026-11-11
- **Storyboard as data** (`engine/src/lib/board.tsx`, guide `references/board.md`). A short is ONE `Board`: the cast,
  the places and a list of beats anchored on spoken words. Each beat names the place, the lighting key, the shot and how
  it arrives, what every character does and the visual gag. The runtime derives the camera path, the light plan,
  pose-to-pose acting, crowd reactions, the shot audit subjects, the QA edit plan and the sound cue sheet from it.
- **One command from script to verified video**: `node tools/make.mjs --project ID`. Stages script (lint) -> claims
  (fact-check gate) -> voice -> words (align + `tighten.py`) -> board (draft + compile) -> stills -> audit (1/8 size,
  shot audit must be clean) -> produce (native render, sound, mux, QA, per-key colour table). It stops with one
  instruction when a stage needs a person or the agent and continues on the next run.
- **A gag per sentence**: `story.py board` drafts the board from a script (place, key, shot and gag per clause from
  `story/gags.json`) and lists the sentences that still need a concrete gag.
- **Ready-made sets with marks** (`lib/three/sets.ts`): street, alley, road, yard (pool), shop, workshop (garage),
  office, hall; `era: "old" | "modern"`; practical lamps and lit windows follow the lighting key; 21 small gag props.
  Composed for 9:16: narrow, tall, dressing stacked upward. Sheet project `setsheet` (day, night, rain).
- **Shot grammar** (`lib/shots.ts`): wide, full, medium, close, xclose, two, group, insert, low, high, top and
  point-of-view; moves push, pull, orbit (a true arc), crane, track, tilt, rise; arrivals cut (with an 11-frame
  settle), dissolve, glide (travel), whip. Inside a place the board travels the camera instead of cutting.
- **One light plan per video** (`lib/three/lightplan.ts`): 14 lighting keys, each bundling sun, fill, fog, sky, toon
  setup, look, cloud shadows and practicals; a key change on a cut switches on the frame, on a dissolve it fades with it.
- **Vehicles with characters inside** (`lib/three/vehicles.ts`): car (6 bodies), bus, truck, coach with horses
  (walk / trot), bicycle; `drive()` along a path, seats tuned so a seated card shows head and shoulders. Sheet `propsheet`.
- **Rain and a wet street** (`lib/three/weather.ts`): world-anchored streaks, splash rings, and a wet ground with a
  real planar reflection broken by puddle noise and drop ripples.
- **Characters**: a true three-quarter view (`view: "three"`), smear frames and settle on `poseTrack` pops, crowds that
  react (`CrowdPool.react`: gasp, cheer, laugh, boo, look, clap, point, sad; each member late in their own way), idle
  micro-motion on posed hands and heads. Charsheet page 11 (still 310).
- **Sound from the picture** (`audio/score.py`): the board's cue sheet becomes the mix; real samples first
  (`~/.video-forge/sounds/`), synthesis as the fallback, a generated or licensed music track shaped by the board's
  music marks, ambience per place, rain. `sound_report.md` says which cue used what. The audio itself is never in the
  repository; `audio/soundlib.json` has the prompts of the starter library. `audio/tighten.py` caps narration pauses.
- **Proof short 2, "Why You Can't Shave a Coin"** (`projects/coins`, 41 beats, 8 sets, 56.8 s, 1440x2560): script lint
  98/100, fact-check gate PASS (and the script says the marked edge is from 1662, not Newton's), ElevenLabs narration
  tightened 62.0 -> 55.9 s (2.77 -> 3.08 words/s), 79 sound cues (32 real samples, 46 synthesized, 1 skipped), a
  generated music track. Native render in about 4 minutes (only the current set is drawn).
  Measured over three produce iterations (QA verdict WARN each time, 0 FAIL; the one WARN left is style match 16/32 against the
  channel fingerprint, 16/32 against the hero short): mean brightness 0.33 -> 0.40 (reference 0.47, hero short 0.40),
  fast-motion frames 0.20 -> 0.32 (0.55 / 0.39), DOF ratio 1.06 -> 1.25 (1.95 / 1.43), colourfulness 0.19 -> 0.23 (0.29),
  highlight b -2.1 -> 3.4 (5.8), micro-animation 0.010 -> 0.012 (0.020), flicker warning gone (a key change that faded in
  before its cut). Still open: the cut detector reads the 24-frame travels as cuts (23 detected, 11 planned), edge density
  0.037 against 0.061 (close-ups in rooms, depth of field), micro-animation.
- **Bugs found** (both silent): `toonWater()` never compiled (an `#include` in the middle of a line); the shot audit
  counted hidden meshes as occluders. Also: a moving-average with a 14,400-tap convolution made `score.py` take minutes
  (cumulative sum now, 6 s for the whole mix).
- Lessons recorded in `references/board.md` (nine rules): two people must stand within 1.3 m for a 9:16 two-shot; a
  character's own shadow can put his props in shade; a low sun is wrong indoors; dress the crowd for the era; camera
  motion blur smears a followed subject; a key change on a cut must not fade in early (it measured as flicker).
- **Highlight warmth found and fixed (elevator v8).** The video-wide "highlight tint b 11.1 vs 5.8" was not a day-grade
  problem: the night section's highlights had flipped from -0.8 to +14 once lamps lit the set, and that section sat at
  the middle of the sorted frames. Fix: pale night key, day tints back to the v3 values, no global highlight zone tint.
  Measured v8: highlight b 7.2 (reference 5.8, in tolerance), style match 22/32, QA WARN only on style match.
- **`vfa keygap`**: colour medians per section (lighting key) with the reference row, a before / after column
  (`--prev`) and which section decides each video-wide median. Tune a grade per key, never on the overall number.

## 1.6.0 - 2026-11-11
- **Character audit (bobble pack).** Two audit sheets (charsheet stills 250, 280) and a full review; fixed: front-view
  walk stagger, fist-only gestures (`hands`: point / open), no head turn (`turn`) or tilt (`headTilt`, automatic per
  expression), empty "phone" pose (props phone / cup / paper), floating tipped hat (the hat follows the hand), ring eyes
  inside glasses, hair poking through hats, one-legged profile, the sit pose, body size changing with the hat
  (`bobbleScale`). Table in `references/characters.md`.
- **Research: shaders, lighting, rendering, colour.** Four sourced reports (4,300 lines) in `references/research/`, the
  working rules and a status table in `references/shading-lighting.md`.
- **Applied from the research:**
  - `addPatch()`: shader patches compose; wind sway had been silently dropped by the toon patch since 1.1.
  - Toon model v5: split form x cast ramp, form-following sky / bounce fill, terminator band, lamps light the world,
    cloud-shadow cookie; 6 new `TOON_SETUPS`.
  - Cards: scene-tinted shade, key-colour rim, lamps light characters, alpha-to-coverage silhouettes.
  - Post: stylised tinted SSAO (`look.ao`), coloured ink (`look.ink.hue`), zone tints fixed (they were ignored without
    knots), hue-preserving clip on the `none` tone map, triangular dither, OKLab look cross-fades, 5 new toonworld looks.
  - World: 13 new `lights()` presets with fog distances, shadow bias fixed (9 cm contact gap), `lightShafts()`, sky sun glow.
  - `lib/color.ts`: OKLab toolkit, WCAG contrast.
- **Elevator proof short v7** with all of the above (hall light shafts, sun glow, cloud shadows on the street, lamp-lit
  night explanation, pointing hands and head turns). Measured: QA verdict WARN (style match 21/32 against the channel
  fingerprint; v3 before the light effects: 22/32). Every technical check passes (3 planned cuts, no pops or flicker,
  -14.0 LUFS, -1.4 dBTP, shot audit clean). Edge density 6.8 % -> 6.4 %, micro-animation 0.0091 -> 0.0098.
  Open: highlights measure warmer than the reference at full resolution (Lab b 11.1 vs 5.8) although the 1/8-size
  proxy reads 4.8 after the `tintH` correction; the cause is not found yet. Render time doubled (about 7-9 fps at
  1440x2560 with 4 tabs, was 15): AO, alpha-to-coverage and the extra light terms.
- Lessons recorded while tuning: lamp pools were too hot at gain 1.6 (now 1.0, cap 0.32); a violet-blue AO tint pulled
  the shadows too blue (`#7c6a92` now); ink hue 0.4 made lines measure too light (0.22 now); the low-resolution audit
  pass is good for cuts, pops and camera collisions but NOT a reliable proxy for colour metrics.

## 1.5.0 - 2026-11-11
- **Set-dressing kit** (`lib/three/world.ts`): `textTexture`, `signBoard`, `banner`, `lattice` (iron-and-glass walls and
  railings), `brickTexture`, `crate`, `barrel`, `spokedWheel`, `cart`, `awning`, `steamEngine`, `scaffold`, `rowFacade`,
  `lantern`. Procedural and deterministic.
- **Elevator proof short v3**: closed exhibition hall (glass lattice walls, galleries, lanterns, banners, title board,
  a turning steam engine, cargo, city facades outside the glass), dressed street (pavements, shop signs and awnings,
  far rows on both horizons, carts, the store's cast-iron front and name board, a building site on the empty lot).
  The "floors 1-6" crane now climbs a real 6-floor front (it was climbing the 4-floor warehouse).
  Median edge density over the 48 cue stills: 4.95 % -> 6.6 % (reference hero short: 8.7 %).
- **Camera collision check** (`cameraInside()` in `lib/three/audit.ts`, every frame): the v3 crane drifted into the house
  across the street; QA failed the first render (unexpected cut at f 423). Now logged in `shot_audit.log`.
  New habit: a 2-minute **audit pass** at `--scale 0.125` before every native render.
- Docs: engine.md "Added in 1.5" (kit table + dressing rules + audit pass), SKILL.md tooling rows and build step, case study updated.

## 1.4.0 - 2026-11-11
- **Bobble character pack** (`kind: "bobble"`, `lib/characters/kinds.ts`): big-head figures with a long jacket and
  straight legs (3.4 heads; 2.6 for the short build), two-bone IK on all limbs, fists and shoes, 11 outfits, 10 hair
  styles, 10 hats, facial hair, glasses, neckwear, props and hat tip; cel shading with fringe and collar shadows.
  20 presets `KIND_PRESETS.bb*`, `BOBBLE_POSES` (15 poses), charsheet pages 7-8.
- **`poseTrack()`**: pose-to-pose acting, one held pose per clause with a pop.
- **Case study of one hero short** (`references/styles/toonworld-explainer.casestudy.md`, fingerprint
  `data/toonworld-explainer_case1_fingerprint.json`, numbers and paraphrase only): 14-beat scheme-and-comeuppance
  story, 20 scene changes in 62 s (65 % soft), 3 setups in the first sentence, a gag prop per sentence, colour script
  with a weather turn, POV reveal, captions, and a mix with music 20 dB under the voice.
- **Story engine:** formula B (scheme and comeuppance) + a production checklist in `story-engine.md`.
- **Elevator proof short v2:** bobble cast with period wardrobe, pose-to-pose acting, hook opens on a close-up and cuts
  on the second clause, handheld rig, narration tightened 2.72 -> 3.14 w/s (59.6 s -> 51.8 s), music 19-21 dB under
  the voice, bigger crowd.
- Held hats hang crown-down from the hand (they covered the face); `StickHold.hat` accepts bobble hats.

## 1.3.0 - 2026-11-11
Built a complete proof short with the skill ("Why Elevators Don't Fall", 9:16 2K, 60.6 s, ElevenLabs VO, new stick cast),
then measured it frame by frame against the reference channel and fixed what the measurement and the review found.
Match vs the reference fingerprint: iteration 1 17/32 (53.1) -> 2: 24/32 (75.0) -> 3/final: 25/32 (78.1). Final QA verdict
PASS on every check (-14.0 LUFS, -1.4 dBTP, 2 planned cuts, no pops/flicker), shot audit clean. Remaining measured gaps:
fewer fast camera moves and shorter glides than the reference, lower micro-animation (thin stick cast, see learnings), less DOF.

- **Engine bugs found by measuring the proof short:**
  - `cameraRig` push punches re-applied on every later hold (shots crept in by up to ~40 %). Fixed (`lib/camera.ts`).
  - `vfa qa` passed a -0.9 dBTP file while saying "must be <= -1.0"; the AAC encode adds ~0.1-0.5 dB. QA now PASS <= -1.0,
    WARN <= -0.5, FAIL above (on the delivered file); `mix.py` masters to -1.5 dBTP by default.
- **Shot audit (`lib/three/audit.ts`, Stage3D `audit`)**: raycast + projection check per declared subject: occluded (cards
  only where opaque), out of frame, at the edge, tiny/overfilled. `render.mjs` collects `<out>/shot_audit.log`. Verified on
  the short (found the hook's helper pushed out of frame) and with a negative test (a crowd card in front of the hero crowd).
- **`render.mjs --stills cues`**: one still per named story cue + `stills/index.json` (fast beat review + audit pass).
- **Stick cast with accessories** (`StickSpec`: `head`, `hat` x6, `hair` x6, `stache`, `beard`, `glasses`, `neckwear` x3,
  `coat` with tails/buttons, `skirt`, `build`, `cheeks`; pose `hold` props axe/cane/hat/flag/lever/bag, `hatLift`/`hatTilt`),
  presets `stickGent/Worker/Lady/Kid/Prof`, charsheet page 6.
- **`CharacterCard` `pad`**: canvas room above/beside the card so props and big gestures are not clipped; feet stay at y = 0.
- **Framing helpers** `hfov()` / `frameDistance()`: 9:16 horizontal FOV is ~0.56x vertical; size close-ups by numbers.
- **`motes()`** world-kit drifting dust/pollen (micro-animation gap .007 vs .020 on the reference).
- **Story engine voice calibration**: `story.py calibrate words.json --voice ID` -> `story/voices.json`; `# voice: ID` and
  `--wps` make `lint`/`beats` time the script at the real voice (reference rate predicted 48 s; the narrator ran 59.6 s).
- **Reference fingerprint shipped**: `references/styles/data/toonworld-explainer_fingerprint.json` (27 Shorts, numbers only).
- **Demo project `elevator`** (story/examples/elevator.txt + fact-check sheet, thumbnails, sound design from the picture's
  cues, audit subjects per section). Docs: engine.md "Added in 1.3", characters.md stick cast, craft.md 9:16 framing,
  travels instead of cuts, AAC headroom; quality.md true-peak rule; story-engine.md calibration.

## 1.2.0 - 2026-11-11
- **Topic, hook and title research (measured, `analyzer/vfa/topics.py`, `references/hooks-topics.md`):**
  - `vfa topics CHANNEL`: outlier score (views vs the 20 neighbouring uploads), topic/title/hook classifiers, bootstrap CIs, hook
    transcripts from subtitles with a whisper fallback. Polite: cached, `--sleep-requests`, backs off 60/180/540 s on HTTP 429
    and the bot wall, and stops after repeated blocks. `--no-network` re-analyses from cache.
  - `vfa topics-aggregate`: which effects replicate across channels. `vfa hookcheck` and the new `vfa titlecheck` score drafts on
    the data (CI-weighted, shrunk, the style's own channel x2; nested lexicons such as why -> curiosity count once).
  - Measured on 7 channels (1,184 Shorts, 365 hooks), numbers only in `references/styles/data/topics_*.json`:
    - Titles with a negation or contradiction: x1.56 [1.22-2.20], 7 of 7 channels, and not a Why/How confound.
    - Titles with Why/How: x1.12. With This/These: x0.84.
    - Machine 'how it works' topics: x0.90.
    - No hook type replicates across channels. On the reference channel, longer and more concrete absurd-fact hooks lead.
    - Slower narration does better on 3 of 7 channels and faster narration on none. This overrules the 'brisk 150-180 wpm' rule.
  - `story.py titles`: fills the measured title forms from `--subject/--fact/--contrast` and ranks them. `lint` warns on a weak
    `# title:`. `hooks` shows the measured score next to the blend.
  - `vfa thumbcheck` is now a `vfa` subcommand.
- **Director loop (automated improvement):**
  - `engine/tools/produce.mjs`: one command for stills -> render -> audio -> mux -> QA -> gap -> judge pack -> learning log -> report.
  - `analyzer/vfa_loop.py`: `judgepack` (per-area reviewer packs with side-by-sides, rubric and JSON answer schema for 11 areas), `collect` (scores + fixes grouped by file owner), `learn`/`lessons` (per-style learning log: which changes moved which metrics).
  - `references/director-loop.md`: protocol for reviewer agents per area, fixer agents with file ownership, stop rule, cost control.
  - Proven on the manhole demo: reference match 50 -> 59.4 -> 62.5 -> 65.6 over three loops (11 reviewer agents, QA 0 FAIL, 1 WARN), and the learning log holds the confirmed and rejected rules.
- **Thumbnail generator:**
  - `tools/thumbs.mjs` + `lib/thumbs.tsx`: variants rendered from the real 3D world, with a camera override, heavy outlined 1-4 word text, accents and a pop grade.
  - Sizes: long 1280x720, Shorts cover 1080x1920, hires 2560x1440.
  - A feed-size preview sheet on light and dark UI.
  - `analyzer/vfa/thumbcheck.py` ranks variants by OCR readability at feed size, contrast, focal clarity, subject size, the timestamp zone, colour pop and diversity.
  - Character cards face the thumbnail camera.
  - The manhole demo has 7 variants, scoring 79-97.
- **Story engine (`story/story.py`, `references/story-engine.md`):**
  - Steps: `lint`, `hooks`, `claims` + `verify`, `export`, `beats`, `scaffold`.
    - `lint` checks the script against the measured formula of a style: duration at the measured speech rate, hook length and type, one pivot inside the measured window, a re-hook interval, no call to action, and a loopable ending.
    - `hooks` ranks hook variants.
    - `claims` + `verify` is a fact-check gate that blocks the voice until every claim has a source.
    - `export` writes clean text for TTS, also per speaker.
    - `beats` writes a beat sheet with timing from words.json, shot, camera move, punches, light, FX, SFX and lip-sync.
    - `scaffold` generates a typed camera and story plan for the engine.
  - `story/targets.json` holds the measured targets for 4 styles.
  - Hook rules from 65-source research: lesson framing is penalised, misconception and concrete/number/negative hooks are credited.
  - New SKILL.md rule: original telling, never a template (YouTube's Shorts originality change, 2026-10-01).
- **Style profiles** (measured: yt-dlp + `vfa batch/transitions/stems/ocr`), each with a `vfa compare` fingerprint and a look preset:
  - `realistic3d-explainer` (Zack D. Films, 22 CG shorts)
  - `flat-vector-explainer` (Kurzgesagt, 10 videos + 7 shorts)
  - `documentary-essay` (LEMMiNO, 9 documentaries)
  - Look presets: `realistic3d-bright`, `flat-vector`, `doc-noir`.
- **Camera fix:** the push accumulated during a long hold now carries into the next move. It used to snap back, a jump of up to 2.5 m at the start of a glide. Tested by running a generated plan at 30 and 60 fps.
- **Deep analysis (`vfa analyze --deep`, or each tool on its own; all optional, with honest fallbacks):**
  - `vfa transitions`: hard cut, dissolve, dip, flash, wipe, whip pan, zoom-through, match cut.
  - `vfa ocr`: captions (words/page, font size in u, colours, outline, position, sync vs speech, font class).
  - `vfa stems`: Demucs voice/music/drums/other with per-stem loudness, music presence, voice-over-music margin, hit rate.
  - `vfa embed` / `similar`: CLIP style tags and per-shot nearest neighbours vs a reference.
  - `vfa pose`: MediaPipe body language and lip-sync correlation; flags itself as unreliable on cartoons.
  - `compare` gained 10 deep metrics plus CLIP art-style similarity. Frame-unit metrics are now compared at the reference's fps, so 60 fps renders score fairly.
  - QA tolerance windows and the snap threshold are now seconds-based.
- **Measured corrections to the toonworld-explainer profile** (3 hero shorts):
  - 18-26 soft transitions per minute (quick 9-10 f dissolves, zoom and whip transitions). The old cut detector saw 3 of 25 scene changes.
  - Music under 98-100 % of the runtime, voice about 19-20 dB above it. An earlier "5-10 LU under" rule was wrong for this channel.
  - Captions: 1 word per page, 0.37 s, outline 0.06 em, on the word.
  - The manhole demo now changes place with 10 f in-world dissolves and glides only inside a place.
- **Characters:**
  - `references/characters.md`: research on 25 character types, ranked by evidence for shorts and long-form, plus a viseme/lip-sync guide and build specs.
  - Lip-sync: text-based visemes (`Pose.viseme`, `visemeAt()` from word timings) and audio-based Rhubarb cues (`audio/lipsync.py` downloads Rhubarb 1.14 (MIT) on first use, or uses `--rhubarb PATH` / `$RHUBARB`; `cueAt()` with a 2-frame lead and a 2-frame minimum hold). Tested: 275 cues for the 42 s manhole VO in 16 s; the founder in the manhole demo lip-syncs from them. Side/profile view.
  - `CrowdPool`: distance-tiered crowds, poses on twos, side-view walks, cue-gated acting.
  - Stronger never-still idle.
  - `lib/characters/kinds.ts`: 7 new kinds (object, critter incl. quadrupeds, blob, stick, chibi, flatvec, microbe), 50+ presets, a shared face with 16 expressions and Rhubarb mouth cues, 4-beat walk/hop/IK/spring helpers, and style passes (sketch, cutout, silhouette, pixelize) that work on every character. Usable on 3D cards and in crowds; `charsheet` look-dev project.
- **Production:**
  - ElevenLabs is the default voice, behind a hard cost gate: `tts.py estimate` first, and `tts.py eleven ... --yes` refuses to run without `--yes`. It writes `words.json` from the character timestamps.
  - Real assets: Poly Haven search/get (CC0, credited) and Kenney zip import; `loadModel()` (glTF, toon-shaded, ground-aligned, recolour).
  - Blender bridge for the realistic-3D path (`tools/blender_bridge.py`), tested with Blender 5.3: EEVEE and Cycles (OptiX GPU requested), several glTFs with offsets, HDRI, shadow-catcher ground, DOF, Freestyle toon ink, and the same camera grammar as `cameraRig` (glides, cuts, `via` arcs).
  - Camera:
    - `refFps` for frame-rate-independent timing at 60 fps.
    - In-world dissolves (`dissolve` keys plus `Stage3D dissolveAt`, `innerSoft` in the edit plan).
    - Bezier arc travels (`via`).
  - No motion blur across hard cuts (it used to smear the first incoming frame).
- **Look:**
  - Ink thresholds x0.6 / 30-degree creases (coverage 0.24 -> towards 0.35).
  - Plaster value noise, speckle, chipped brick and grime band; per-tile variation.
  - Cooler toonworld highlights, pure-white day cards, golden key from the front three-quarter.
- **Captions:** shown on the word onset instead of about 3 frames late, single words by default, thicker outline and shadow, `yAt` to keep them clear of faces.
- **Audio:**
  - Fixed: SFX shorter than 400 ms were never levelled (`momentary()` = -inf), so swish/pop/click played about 14 LU hot. New `dsp.event_loudness()` measures over the sound's own length, `mix.py` reports `lu_vs_voice` per cue and lists level errors over 2 LU.
  - Distance gain is applied after levelling; detail SFX are ducked under spoken words.
  - `whoosh` rebuilt with a moving STFT band and a defined peak; new `creak`.
- **Render speed (measured with the new `tools/bench.mjs`, full 1,274-frame short, Ryzen 7 9800X3D + RTX 5070):**
  - New defaults: concurrency 4 (was 8), x264 `medium` (was `slow`), CRF 14 (was 16).
  - Render time 141-145 s -> 78-128 s, about 1.4x faster on average (the spread comes from other jobs on the machine).
  - Bitrate 10 -> 15.5 Mbps, which meets YouTube's 1440p30 recommendation.
  - One GPU gets choked by 8 Chromium WebGL tabs: more tabs is slower.
- **Robustness:** visual regression tests (`tests/test_visual.py`, SSIM + colour shift vs baselines), 2 new audio regression tests.

## 1.1.0 - 2026-11-10
- **Channel study:** 42 of 149 @RicksClips3000 shorts measured frame by frame, split into eras; 3 hero shorts analysed sentence by sentence.
  - New style profile `references/styles/toonworld-explainer.md` with an engine recipe.
- **Analyzer:**
  - `vfa batch`: parallel channel study, per-group aggregates, views correlation.
  - `vfa breakdown`: sentence x camera x cuts x light, plus cut-on-word offsets.
  - QA: 0.4 s freezes for shorts, white frames, dead air, speech-over-bed margin.
  - Relative jerk tolerance in `compare`.
- **Shaders:**
  - painted cel world material (`toonifyScene`, sun visibility x N.L, hue-keeping and violet replacement shadows, rim, colour drift)
  - wind sway, toon water
  - card shading (no emissive, scene tint, side gradient, contact blob)
  - depth-reprojected camera motion blur
  - DOF v2 (cInf/maxCoC, reach test, near field)
  - 7-knot tone curve + zone saturation + Cb/Cr zone tints
  - resolution-pinned bloom, ink normal fallback
- **Engine:**
  - per-frame `lookTimeline`, toonworld look presets per lighting setup
  - toonworld character style (bean head, thick-thin ink, stroke limbs), measured blink/walk numbers, auto light side
  - `FxLayer` (13 flat 2D effects), `WordCaptions`
  - camera `push` with punches, `follow`, screen-space kicks, `glideOrCut()`
  - street props, birds, `blocksShot()` sight-line culling
  - `cues` in the edit plan, model sheet project
- **Audio:**
  - `dsp.py` (BS.1770-4, momentary, 4x true-peak limiter, mastering loop, reverb IR, distance fx, words-keyed duck)
  - `mix.py` rewrite: loudness-relative levels, sections, rides, anchors, reverb send, stems, margin report, ffmpeg cross-check that aborts on disagreement
  - `music.py --sections` arrangement with stops and buttons
  - `splash` SFX
- **Fixes:**
  - 32-bit WAV scaling (caught by the cross-check)
  - three.js shadow-loop unrolling in the sunVis patch
  - crescent shading drawn on the wrong side
- **Demo:** `manhole` (toonworld explainer, 16/32 metrics in tolerance vs the channel aggregate, QA WARN with no FAIL).
- **Tests:** `tests/test_audio.py` (loudness vs ffmpeg, limiter, master loop, ducking).

## 1.0.0 - 2026-11-10
- analyzer `vfa`: fetch (original audio), analyze (every frame: camera LK+RANSAC / Fourier-Mellin, moves/easing/jerk,
  cuts, grade + Lab tints, ink-on-edges, grain, DOF, activity, native-detail estimate, EBU R128, onsets/BPM, speech),
  channel + aggregate, compare (gap table), qa (delivery gate with plan-aware cut/pop/flicker checks), sbs.
- engine: Remotion 4 + three.js r187; formats short/long/short4k/long4k/square; Stage3D with deterministic
  PostPipeline (ink, DOF, bloom/halation, ACES/neutral tonemap, display-space grade, vignette, grain, dither);
  camera rig; world kit; parametric 2D characters with props, blink/mouth/walk/idle; captions/titles/charts;
  transitions; chunked resumable renders; timeline.json edit plan; new-project scaffold.
- audio: procedural SFX pack, score bed, offline TTS + whisper alignment, mix/master (-14 LUFS, -1 dBTP).
- demos: `lighthouse` (9:16 2K short), `pendulum` (16:9 2K + 4K long-form).
- tests: ground-truth analyzer tests incl. regression for an infinite loop in cut detection.
