# Storyboard as data (1.7): one `Board`, one command

A whole short is one object: the cast, the places, and a list of BEATS anchored on spoken words. The runtime
(`engine/src/lib/board.tsx`) derives the camera path, the light plan, the acting, crowd reactions, the shot audit, the
QA edit plan and the sound cue sheet from it. Worked example: `engine/src/projects/coins/index.tsx`
("Why You Can't Shave a Coin", 41 beats, 8 places, 57 s).

```
node tools/make.mjs --project ID                      # script -> claims -> voice -> words -> board -> stills -> audit -> produce
node tools/make.mjs --project ID --from board --to stills    # the authoring loop: one still per beat, with the beat name
```

`make.mjs` runs every stage it can and stops with one instruction when a stage needs you (write the script, finish
the fact check, make the voice, edit the draft board). Run the same command again and it continues.

## 1. The model

```ts
const board: Board = {
  id: "coins", title: "Why You Can't Shave a Coin", words: WORDS,          // words.json = the clock
  cast:   { clipper: { spec: clipperSpec, height: 1.72 }, newton: { spec: "bbGent" } },
  places: { den: { set: "workshop", opts: { era: "old" } },
            street: { set: "street", opts: { era: "old" }, crowd: 8, walkers: 3, wet: true,
                      vehicles: { coach: { kind: "carriage", path: [[-15, 0, 1.5], [0.6, 0, 1.2]], from: "y1696", to: "isaac", ease: "stop" } } } },
  props:  { press: () => ({ group, update(f, fps, api) { ... } }) },       // custom 3D pieces, animated from cue frames (api.T)
  beats:  [ ... ],
};
export const coinShort = boardProject(board);
```

A **beat** is one clause of the narration:

| field | meaning |
|---|---|
| `at` | the spoken word it starts on: `"coin"`, `"coin#2"` (second occurrence), `"the>79"` (first after word 79), or seconds. An exact word wins over a prefix. `off` shifts it (default -0.06 s: the picture leads the word). |
| `place`, `key` | where we are and the lighting key (`LIGHT_KEYS` name or a `LightKey`). Both persist until changed. |
| `via` | how the shot arrives: `glide` (default inside a place: the camera travels, starting before the cue and landing just after it), `dissolve` (default on a place change), `cut` (a soft cut: 4 frames of cross-dissolve, `softCut: 0` on the board for hard cuts), `whip`. |
| `shot` | `{ size, on, angle, side, move, amount, from, follow, h }` (section 3). |
| `act` | per actor: `at` / `walk` a mark, `pose` (a `BOBBLE_POSES` name or a pose), `expr`, `turn`, `view`, `hold`, `look`, `talk`, `hide`, `seat`. A pose holds until the next one; it pops 3 frames before the word. |
| `gag` | one or several of: `{ prop, at, id, origin, scale, in, until }`, `{ fx, on }`, `{ stamp }`, `{ label }`, `{ counter }`, `{ big }`. |
| `crowd` | the background reacts: `gasp`, `cheer`, `laugh`, `boo`, `clap`, `look`, `point`, `sad` (each member a few frames late, in their own variant). |
| `sfx`, `music` | sound names at this beat and the music arrangement from here (`build`, `full`, `calm`, `thin`, `stop`). Default sounds come from the picture (a swish on a dissolve, a pop on a prop, a thud on a stamp). |
| `kick`, `punch`, `rain`, `caption` | camera kick, push-in punch, rain amount from here on, caption height. |

Marks are names from the place's set (`"counter"`), another place (`"shop:counter"`), or coordinates relative to the
place (`[0.6, 0, -0.3]`). A wrong name fails at build time and lists the marks that exist.

## 2. Sets and marks (`lib/three/sets.ts`)

`street`, `alley`, `road`, `yard` (exteriors) and `shop`, `workshop`, `office`, `hall` (interiors with three walls and
a beamed ceiling). `era: "old" | "modern"` switches the dressing. Sheet: `node tools/render.mjs --project setsheet
--format short --stills 0,30,...,510 --scale 0.5` (day, night, and rain with the wet-ground reflection).

| set | marks |
|---|---|
| street | center, left, right, pavement, across, far, corner, shop1-4, roadL / roadR (vehicle paths); modern: meter, parking |
| alley | center, left, right, door, back, corner, front, barrelTop |
| road | center, roadL / roadR, roadside, sign, verge, stop |
| yard | center, lawn, left, right, door, bbq, fence; with `pool: true`: poolside, pool, pool2, deckChair |
| shop | keeper, customer, customer2, door, shelf, counterTop, counterTop2, center |
| workshop | bench, benchTop, benchTop2, visitor, door, center; old: anvil, anvilTop, forge; `garage: true`: bay |
| office | desk, deskTop, deskTop2, guest, guest2, window, door, books, center |
| hall | center, left, right, floor, back, door, machine; with the stage: stage, stageL, stageR |

Every set also returns `wide` (its establishing camera), `camBox` (where a camera may be), practical lamps and lit
windows that follow the key (`setNight`), sky panes for interiors (`setSky`) and free `crowdSpots`.

**9:16 is narrow.** At fov 44 the frame is only about 0.45 x the distance wide, so sets are built as towers, not
stages: narrow rooms, tall walls, dressing stacked upward. The same goes for your own props: stack three coins in a
column, not in a row.

## 3. Shot grammar (`lib/shots.ts`)

Sizes: `wide` (omit `on` for the set's establishing camera), `full`, `medium`, `close`, `xclose`, `two` / `group`
(pass several names), `insert` (a prop, `h` = its size; it fills 60 % of the narrow side), `low`, `high`, `top`,
`pov` (`from` = whose eyes; that card is hidden).
Moves, run across the whole beat: `push`, `pull`, `orbit`, `crane`, `track`, `tilt`, `rise`. `angle` = degrees around
the subject (0 = from the front), `side` = look-room, `follow` = keep a moving actor or vehicle framed.

Rules the tools enforce or that the first board taught:

1. **Two people need to stand close.** Two subjects 2.7 m apart need a 16 m camera in 9:16. Keep them within about
   1.3 m and at the same depth for a `two`, or cut between singles.
2. **Inserts are for small things.** A 2.4 m machine is a `full` with `h: 2.4`, not an insert.
3. **Put the evidence 2.5-3.5 m from the eyes** for a `pov`; closer needs a fish-eye. The fov is chosen for you.
4. **A prop between the camera and a face is a mistake**, however good the prop. Float hand props at chest height on
   the side the character is NOT looking through, and end a floating prop (`until`) before the next insert behind it.
5. **Floating props have their origin in the centre** (`origin: "center"`); standing props have it at the base.
6. **Cut the camera motion blur on a follow.** The blur comes from camera motion only, so a followed coach would
   smear although it stands still on screen; the board cuts it to 15 % during a `follow`.
7. **A low sun is wrong indoors.** The forge chimney threw a shadow across the whole back wall under the `golden`
   key. Use a high sun with the warm look: `{ ...LIGHT_KEYS.golden, lights: "day", cookie: 0 }`. Cloud shadows are
   switched off indoors automatically.
8. **Dress the crowd for the era.** Background extras default to period presets for `era: "old"` sets (a hard hat in
   1695 was the first thing the stills showed). Override with `extras`.
9. **Transitions are judged on consecutive frames, never on numbers.** `vfa strips VIDEO --plan timeline.json --analysis
   QA_DIR/analysis --out strips.jpg` puts the nine frames around every cut, dissolve and DETECTED cut in one row each.
   The first board's travels were not travels: the shot before a travel ended two frames before the cue while the
   travel had started ten frames earlier, the camera rig handed over mid-way and the picture jumped half the distance
   in one frame. Twelve of 23 detected cuts were such jumps, and QA passed them because the board had listed frames
   around each travel as intended events. Now a shot ends where the next travel starts, travels are not listed as
   events, and QA warns about every detected cut that only an event explains.
10. **Cuts should not be felt.** Inside a place travel; cut only where the cut is the point (on a word, shot / reverse
   shot, a reveal). A cut is softened by 4 frames of cross-dissolve, the settle after it is small (12 % over 16 frames)
   and the new subject keeps the previous subject's side of the frame (`side` carries over unless you set it), so the
   eye does not have to jump across the picture.
11. **Look at one still per beat before any render:** `--stills cues+10` (10 frames after each cue, past the cut and
   the prop pop-in), then the 1/8-size audit pass. The audit found a character hidden by another card, a subject
   pushed out by a `rise`, and nothing else gets past it unseen.

## 4. A gag per sentence

Measured on the reference hero short: 14+ setups a minute, and every sentence has an object or an act that shows its
claim. `story.py board script.txt --words words.json --id ID --out src/projects/ID` drafts the board and writes
`board.md`, a table with a place, key, shot and proposed gag per clause and the list **"still needs a gag"**.
Proposals come from `story/gags.json` (keyword to set / key / gag / crowd reaction); add your topic's nouns there.
The draft is generic on purpose. The work that makes the video is replacing each generic pick with the topic's own
prop: in the coin short the shears that snip, the balance whose sack side goes UP, the press, the coin with the
missing ridges seen through Newton's eyes.

Ask of every line: *what object or act proves this sentence with the sound off?*

## 5. Light plan (`lib/three/lightplan.ts`)

One timeline of lighting keys per video; the board builds it from the beats' `key`. A key bundles sun, fill, fog,
sky, toon setup, look, cloud shadows and how far practical lamps are on. Keys: `day`, `morning`, `golden`,
`sunsetBack`, `dusk`, `night`, `nightMoon`, `nightPractical`, `overcast`, `rain`, `fog`, `office`, `interiorWarm`,
`spotlight`. A change of key is an edit: put it on a cut, a dissolve or a story turn. Tune each key on its own row of
`vfa keygap`, never on the video-wide median.

## 6. Weather, vehicles, crowd

- `rain: 1` on a beat starts rain (streaks and splash rings, world-anchored, following the camera); a place with
  `wet: true` gets the wet-ground reflection while it rains (`lib/three/weather.ts`: one extra scene render per
  frame, only then). Rain reads by backlight: use `night` or `nightPractical` with lit windows behind it.
- `vehicles` per place (`car`, `bus`, `truck`, `carriage`, `bicycle`; `lib/three/vehicles.ts`) drive a path between
  two cues; `act: { newton: { seat: { vehicle: "coach", seat: "inside" } } }` seats a character (sit pose, facing the
  way the vehicle points, no ground shadow), `seat: null` plus `at` lets them step out.
- `crowd: n` fills the set's free spots (not on a mark in use, not in a sight line); `walkers: n` cross on the far
  pavement. `crowd: "gasp"` on a beat makes them react.

## 7. Sound (`audio/score.py`)

The board writes `sounds`, `music`, `rain` and `places` into `timeline.json`; `score.py` builds the mix from it.
Real samples first (`public/ID/sounds/`, `$VIDEO_FORGE_SOUNDS`, `~/.video-forge/sounds/`), synthesis as the fallback;
`sound_report.md` lists which cue used what. `public/ID/score.json` (`{"track": "music_sneaky"}`) picks a licensed or
generated music track from the same folders; without one the procedural bed is arranged from the beats' `music` marks.
Audio files are not in the repository; `audio/soundlib.json` has the prompts that built the starter library.

## 8. Added in 1.8: hold the shot, put the tool in the hand

The first board was reviewed by three strict reviewers (camera 4, edit 3, depth 3, characters 4 out of 10). Their
verdict in one line: **the person is shown, not the act.** 34 setups of 1.7 s each, tools floating next to empty hands,
a climax that lasted half a second. What changed, and the rules that came out of it:

**One shot per sentence, beats inside it.** A beat without `shot` stays in the running shot and changes the acting, the
gag and the focus. Write a `shot` only where the picture really has to change; aim for 4-6 s per shot (the reference
holds 6.2 s). `story.py board` drafts it this way: the first clause of a sentence carries the shot, clauses, short
sentences and replies are beats inside it, a dialogue exchange is one two-shot. The storyboard lint
(`lintBoard`, printed as `[board lint]` by `render.mjs --stills` and by `make.mjs` after the stills) names: an average
shot under 3 s, shots under 1.2 s, whips, two texts on screen at once, a `big` word held under 1 s, and boards where
fewer than half of the beats change a pose.

| field | what it does |
|---|---|
| `focus: "id"` on a beat | racks the focus to that actor, prop or mark over 10 frames (until the next shot) |
| `act.hold` / `act.hold2` | a prop in the hand / in the other hand: `{ item: "shears", hand: "R", open: 0.85, aim: 180 }`, `{ item: "coin", hand: "L", len: 0.15, cut: true }`; items: shears, coin, file, hammer, sack, quill, bar, axe, cane, flag, bag, phone, cup, paper |
| `aim` on a held prop | absolute direction on screen in degrees (0 right, 90 up, 180 left), so shears point AT the coin whatever the arm does |
| `crowd: "snip"` | everybody is at it (shears and a coin, blades opening and closing); the other kinds: gasp, cheer, laugh, boo, look, clap, point, sad |
| gag `big` with `y`, `counter` with `color` | where the big word sits, the counter's colour (yellow by default) |
| `caption: 0.8` on a beat | caption height from that beat on (captions are 110 px at 70 % of the height by default) |

**Rules (each one was a defect in the first board):**
1. The action word of the sentence is a pose change ON that word, with the tool in the hand: open blades on the beat
   before, shut blades (`open: 0.02`, `lead: 1`) and a sparkle on "shaves". Numeric anchors (`at: 6.3`) time repeated
   strokes between words.
2. A subject that fills less than a fifth of the frame height is lost. `two`, `group` and `wide` on people who stand
   apart give small figures in 9:16: bring them within 1-2 m of each other, or frame a point between them:
   `{ size: "full", on: [x, 0, z], h: 1.9 }` (interiors clamp the camera, so the same shot is tighter there; exteriors
   frame about 3 x `h`: use `h` 2.7-3.1 for three people on a street).
3. Depth comes from staging, not from blur alone: one person 1-1.5 m nearer the camera than the other (the listener big
   in the foreground, the speaker behind) reads as an over-the-shoulder shot.
4. One text on screen at a time, and never the number the narrator is saying AND a stamp of it. End every stamp, label
   and counter with `until`.
5. The climax is one shot held for at least a second with its `big` word up the whole time; the person who causes it
   WALKS in (`walk`, `speed: 3.4`) instead of appearing on a cut.
6. Value separation before colour: the hero must not wear the wall's colour family. Dark walls (brick `#8a5a48`, dark
   joints are the default now) behind light faces, a light wall over a dark wainscot behind dark coats (`office`,
   `era: "old"`).
7. End on the picture of the last line and stop: `tail: 0.45`.

**Life in every set.** Sets carry their own motion (`update`): chimney and forge smoke, sparks, swinging signs, bunting,
curtains and trees in the wind, flickering lanterns, candles and chandeliers. Characters breathe, shift their weight,
move their eyes and nod a little on every spoken word. The camera is never level or still: a slow roll drift rides on
every shot, and travels take 20-40 frames.

**Thumbnails, titles and 16:9 from the same board.** Every board has thumbnails: without a `thumbnails` function
`autoThumbs` picks the hook, the `big` word, the counter, the evidence insert and the hardest hit, each frozen from the
3D world with 1-3 huge words (`thumbWords(title)`). After `produce`, `make.mjs` runs `tools/thumbs.mjs --kind all`
(1280x720, 2560x1440, 1080x1920, ranked in `thumbs/thumbs_report.md`), writes `titles.md`
(`story.py titles script.txt --auto`: rewrites of the script's title plus every "why ..." clause the narration says,
ranked on the measured title data) and, with `--also long`, renders the 16:9 version into `OUT/long/`: the shot grammar
re-frames every beat for the other aspect. Check its stills (`render.mjs --format long --stills cues+10`): props
stacked for 9:16 may not fit 16:9.
