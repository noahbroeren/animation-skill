# Edit: joins, transitions and pacing (craft sheet)

The edit decides when the picture changes and how the eye gets across each change. In this style the viewer should
almost never feel a cut: four joins in five are short cross-dissolves with both cameras moving, most of the rest hide
inside a frame the eye cannot read (a push into an object, something crossing the lens, motion blur, white), and the
camera re-frames between joins so a new picture arrives about every 1.5 s. The one rule: join on the first word of a
new sentence with a 9-frame dissolve whose mix never jumps more than about 0.16 in a single frame.

## At a glance

| rule | target (median, range) | how to check |
|---|---|---|
| joins that are cross-dissolves | 79 % pooled (per film median 83 %, 36-100 %; 15 of 20 films >= 75 %) | `vfa transitions`, `vfa strips` |
| hard cuts per film | 0-1 (10 films 0, 8 films 1, one film 2, one documentary-like film 7) | `timeline.json` `cuts` (hard only with `softCut: 0`) |
| dissolve length | about 9 f visible (per-film medians 5.5-12); 7 f from 3 % to 97 % (IQR 5-9) | strips SOFT rows |
| largest mix step in one frame | 0.16 (never above 0.20) | strips `harsh` <= 2.5 on SOFT rows |
| dissolve start vs the word | 0 to +7 f after the onset (aim +2 f), never before | strips + `words.json` |
| cameras moving through a dissolve | outgoing 79 %, incoming 91 %; incoming 1.8x faster (0.14 vs 0.08 W/s) | stills f-6 ... f+12 |
| shot length (between joins) | per-film median 3.0 s (1.9-5.4), per-film mean 3.7 s (2.4-5.6) | `[board lint]` |
| new framing (join or re-framing) | every ~1.5 s (1.2-2.4) | `[board lint]`, stills |
| visual events per second | 2.35 (2.1-2.8); hook 3.0, middle 2.4, last 10 s 1.95 | count (no tool yet) |
| first change of picture | 1.2 s (IQR 0.75-1.75), within 3 s in 17/20; camera moving from frame 0 in 20/20 | stills 0-90 f |
| end | last frame 0.3-0.5 s after the last word ends; fades 0/20 | `timeline.json` vs `words.json` |
| sound on joins | at chance (27.5 % of joins vs 26 % random): no whoosh on dissolves | `sound_report.md` |

## How it is built

1. Lay the picture on the sentences: about 1.3 joins per sentence; 44 % of joins fall within 0.4 s of a sentence start
   (2.2x chance) and 62 % on a sentence or clause start.
2. Join with a short cross-dissolve that starts just after the first word of the new sentence, idea, place or time.
   Keep both cameras moving through it; the incoming one is already moving and settles with an ease-out.
3. Inside a sentence do not cut: the camera travels to the next subject (an accent move of ~16 f, `camera.md`).
4. Bridge about one dissolve in seven with a matched shape held at the same screen spot.
5. Put light and time changes inside the mix, never as a separate beat.
6. Hide about one join in six where the frame is unreadable for 1-5 frames: a push into a surface that fills the
   frame, a foreground object across the lens, the blur peak of a whip, a white-out.
7. Keep hard cuts as punctuation: 0-2 per film, on the word they stress.
8. Front-load the energy: more events per second in the hook, slightly fewer towards the end.
9. End on the picture of the last line with the camera still moving, 0.3-0.5 s after the last word. No fade.

### Shots and re-framings
A **shot** is one continuous camera path between two joins. A **re-framing** is an accent move inside a shot that
changes the size or the subject (zoom >= 1.3x or pan >= 0.4 W). The viewer counts framings, not shots: the edit changes
every 3-4 s, the picture every ~1.5 s.

| measure | value (20 every-frame logs unless noted) |
|---|---|
| shots per film | 8-25, median 16 (333 shots in 1,200 s) |
| shot length | per-film median 1.9-5.4 s (14 films, median 3.0 s); per-film mean 2.4-5.6 s (20 films, median 3.7 s) |
| automatic join detector | median shot 2.2 s (IQR 1.4-3.9, n = 391): it also splits a few strong in-shot events |
| framings per shot | 1.7-4.4 camera segments per shot where counted (8 films); a new framing every 1.2-2.4 s |
| camera accents | 41.5 /min (36-51), 29.5 /min above 0.6 W/s (details in `camera.md`) |
| in-shot travels that replace a join | ~5 per film; follow-the-object travels in at least 7 of 20 films |

### Join types and their shares (20 films, ~315 joins, each counted once by its main device)

| join | share | films | frames | used for |
|---|---|---|---|---|
| cross-dissolve | ~79 % (~250) | 20/20 | ~9 visible, 7 for 3-97 % | new sentence, idea, place, time |
| ... with a matched shape | ~15 % of dissolves | 14/20 | same | the noun of the shared object; same head position |
| ... with a light or time change in the mix | ~7 % of dissolves | 9/20 | 5-14 | a time phrase, day to dusk or night |
| push / zoom / fly-through | ~7 % (~22) | 12/20 | push 10-25, mix 5-12 inside it | the noun of the thing the camera enters |
| hard cut | ~5 % (17) | 10/20 | 1 | stressed word, impact, question, the other end of a call |
| foreground wipe / fly-past | ~4 % (~14) | 7/20 | covered 2-5 f of a 4-17 f pass | a change of subject or speaker |
| whip with the join in the blur | ~3 % (~10) | 6/20 | 6-16, ramp 2-5 | cause to effect, to the reaction |
| flash / white-out | ~1.5 % (+5 dissolves through white) | 7/20 | 5-20 | explosion, glow, a jump in time |
| iris | ~1.5 % (5) | 2/20 | 4-5 | a point of view through a round lens |
| fade or dip to black | 0 | 0/20 | - | never |

### The dissolve
- **Length:** 7 f from 3 % to 97 % mix (median, IQR 5-9, n = 242, alpha fit); about 9 f of visible double image by eye
  (per-film medians 5.5-12 f, median of films 9 f). Single dissolves run 2-23 f.
- **Curve:** halfway between linear and smoothstep. Per-frame increments 0.09 0.12 0.15 0.16 0.15 0.13 0.11 0.08; mean
  alpha at 9 equal steps 0.01 0.09 0.21 0.36 0.52 0.67 0.81 0.92 0.99. No frame carries more than ~0.16.
- **Start:** on the first word of the new idea, 0 to +7 f after its onset (most films within 0-3 f, one film median
  +6.5 f). The picture follows the voice by a few frames; it never leads it.
- **Both pictures move:** 79 % of dissolves start while the outgoing camera still moves (> 0.03 W/s), 91 % end with the
  incoming camera already moving. The incoming shot moves 1.8x faster (0.14 vs 0.08 W/s median) and eases out; 38 %
  leave the mix pushing in, 15 % pulling out.
- **Matched shapes:** about 1 dissolve in 7 keeps an element at the same screen spot: most often a head at the same
  position, then a round object, a held prop, a light, a texture or a grid. Position within ~3 % W, size within ~15 %.

### Hidden joins (about 1 join in 6)
- **Through:** the camera accelerates into a surface that ends up filling the frame (a window, screen, lens, mirror,
  photo, hole, liquid, bright sky) and the new place appears inside it; ~22 joins in 12 films, plus ~8 pushes into
  objects inside shots. A reverse form shrinks the new picture into a frame (a photo) inside the old one.
- **Foreground wipe:** a head, post, door jamb, smoke column, sign, tree trunk, stack of boxes or a sheet of paper
  crosses the lens and covers >= 2/3 of the frame for 2-5 f; the place changes behind it. ~14 joins in 7 films.
- **Whip:** the switch sits in the 1-3 frames of peak directional blur (sharpness < 0.6 of the neighbours); ~10 joins in
  6 films. Whips in all: about one per film.
- **Flash / white-out:** a light in the picture (explosion, glow, smoke lit white) drives the frame to near-white and
  the new shot comes out of it; ~9 in 7 films.
- **Relight instead of a cut:** the framing stays, the light changes in 1 f or over 10-25 f; ~21 in 11 films. Two films
  run a time-lapse of 4-8 light steps inside one shot.
- **Iris:** a circle opens on a point of view through a round lens; 5 in 2 films.

### Hard cuts, time jumps
- 17 visible hard cuts in 20 films (2 more sit inside whip blur). Uses: a stressed word, an impact frame, a question
  line, the other end of a phone call, an axial cut-in 10-15 % closer at an action or light peak. The new shot holds or
  drifts at once; there is no settle bump after the cut.
- Time passes inside a dissolve that carries the new light key (~17), in a time-lapse of light steps inside one shot,
  through a white-out, or on a counter or calendar flip. Never through black.

### Pacing (visual events per second = joins + camera accent starts + action onsets)

| window | events /s (median, IQR) |
|---|---|
| 0-3 s | 3.0 (2.3-4.4) |
| 3-10 s | 2.6 |
| middle | 2.4 (2.0-2.7) |
| last 10 s | 1.95 (1.6-2.7) |
| whole film | 2.35 (2.1-2.8) = joins 0.32 + accents 0.69 + action onsets 1.32 (pose and expression swaps, pop-ins, effects) |

Captions add 2.76 changes per second on top and are not counted.

### The first 3 seconds
The camera moves in the first second in 20 of 20 films. The first change of picture comes at 1.2 s (IQR 0.75-1.75),
within 3 s in 17 of 20: a travel past or over something or an orbit (6), a push or crash push into a detail (5), riding a
moving object (2), a framing jump (2), an action that throws the camera (1), a dissolve (1). The other 3 hold one
framing with a push and change at 3.3-6.3 s.

### Endings
No fade and no end card (0/20). The last frame comes 0.43-1.15 s after the onset of the last word (median 0.7 s), about
0.3-0.5 s after it ends. The camera still moves in the last second in 14/20 (a frozen tail of 6-40 f in 3). Last shot
median ~3.4 s. Two films loop back to the opening framing (two more end in a place like the opening); the rest end on
the payoff tableau (an explosion in 3).

## Rules

1. >= 75 % of joins are cross-dissolves; hard cuts <= 2 per film (aim 0-1); fades to black 0.
2. Join on the first word of a new sentence, idea, place or time (about 1.3 joins per sentence); inside a sentence,
   re-frame with a camera travel instead of a join.
3. Dissolve: about 9 f visible, 7 f from 3 % to 97 %; no frame carries more than 0.20 of the mix (aim <= 0.16).
4. The mix starts 0 to +7 f after the onset of the word (aim +2 f), never before it.
5. Both cameras move through the mix: outgoing >= 0.03 W/s until the mix ends, incoming >= 0.1 W/s on its first frame
   and easing out over 15-30 f. No settle or hold right before a dissolve.
6. A light-key change on a join happens inside the mix: each half keeps its own key.
7. About 1 dissolve in 7 is a match: the shared element within 3 % W of its position and 15 % of its size.
8. About 1 join in 6 hides in an unreadable frame (through, foreground, blur peak, white) covered for 1-5 frames.
9. Shots between joins: per-film median 3-4 s, none under 1.2 s; a new framing every 1.2-2.4 s, each held >= 0.9 s.
10. Visual events: >= 3 /s in the first 3 s, ~2.4 /s in the middle, ~2 /s in the last 10 s.
11. Hook: the camera moves from frame 0; the first new picture by 1.5 s.
12. Hard cut: on the stressed syllable +-1 f; the new shot moves at once, no settle bump.
13. Time jumps: a dissolve with a key change, a relight, a white-out or a counter; never a dip to black.
14. Ending: the last frame 0.3-0.5 s after the last word ends, camera still moving, no fade; echoing frame 0 is a bonus.
15. No sound effect for the join itself; sounds come from what moves (`sound.md`).
16. Whips: about one per film, 6-16 f, with directional blur.

## In our engine

| what | where (file / field) | 1.9 value | status |
|---|---|---|---|
| default join | `board.tsx viaOf` | new place, or a `shot` on a sentence-start word -> dissolve; inside a sentence -> glide; framing < 20 f -> cut | built |
| dissolve length and curve | `camera.ts dissolveAt`, board `dissolve: 9` | 9 f, t = 0.5 u + 0.5 smoothstep(u): 0.06 0.15 0.26 0.38 0.50 0.62 0.74 0.85 0.94, max step 0.124 | built |
| dissolve start | beat `off` (default -0.06 s) | the mix starts ~2 f before the onset, 50 % at ~+2 f | partly: `off: 0.07` starts it ~2 f after |
| outgoing half | `three/Stage3D.tsx` (`fa`) | world held at the frame before the key; its camera keeps moving | built |
| incoming camera | `shots.ts shotKeys` | a `move` eases in from rest over the whole shot; a shot without `move` gets no push at all inside a board | not built: B should arrive moving and ease out |
| key change on a dissolve | `board.tsx` light keys `[f + 5, key, 10]` | the light fades from 5 f before to 5 f after the key | partly: the old shot starts changing 5 f early |
| match dissolve | staging | no helper | not built (stage it, check stills) |
| soft cut | `Board.softCut` | 6 f dissolve (max step 0.18) | built |
| hard cut on one beat | - | `softCut: 0` hardens every cut of the board | not built |
| travel inside a sentence | `glideLen`, `inOutSine` | 14-26 f, starts 60 % before the word | built |
| `through` | `camera.ts dissolveAt` (`join`) | 9 f: A pushed to 45 % of its distance (accelerating), B comes out from 45 % (decelerating) | partly: no lead-in push |
| `flash` | `three/post.ts` mix mode 1 | 10 f, white peak 0.92 mid-way, A -> B between 35 and 65 % | partly: symmetric, no source glow |
| `iris` | `three/post.ts` mix mode 2 | 6 f, B opens in a circle over A, thin dark ring | partly: no held POV mask |
| `whip` | `shots.ts` | 6 f, lands 3 f after the cue, camera motion blur, whoosh -12 LU; lint warns | partly: no join inside the blur |
| `past` (foreground wipe) | - | - | not built |
| relight as a join | `lightplan.ts` via a `key` on a beat without `shot` | 14 f fade that ends on the beat | partly: no `via`, no 1 f switch, no time-lapse |
| follow the object | `shot.follow`, rig `follow` | blend in 6 f, out 4 f | built for actors and vehicles |
| intended picture change | `Beat.event` | frames relative to the beat -> `timeline.json events` | built |
| edit plan for QA | `timeline.json` `cuts`, `soft`, `events` | SOFT rows at f + 4 (iris f + 3, whip f - 3) | built |
| shot lint | `lintBoard` | average shot < 3 s, shots < 1.2 s, re-framings < 0.9 s, > 2.2 framings per take, whips | built |
| sound on joins | `boardSounds` | none on dissolves and travels, a whoosh on a whip | built |
| ending | `Board.tail` | default 0.9 s; the last move runs past the last frame | partly: set `tail: 0.4` |
| hook and pacing counts | - | - | not built |

On a board (sketch; marks from `pipeline/board.md`):

```ts
places: { den: { set: "workshop", opts: { era: "old" } }, street: { set: "street", opts: { era: "old" } },
          shop: { set: "shop", opts: { era: "old" } } },                        // cast: smith (+ marks of each set)
beats: [
  { at: "Every", place: "den", key: "day", shot: { size: "medium", on: "smith", move: "push", amount: 0.2 } },
  { at: "coin", shot: { size: "insert", on: "anvilTop", h: 0.2, move: "push" } },  // same sentence: travel
  // new sentence + place + key: 9 f dissolve, started ~2 f after the word, light changes inside the mix
  { at: "That", off: 0.07, place: "street", key: "night", shot: { size: "full", on: "shop1", move: "push", amount: 0.4 } },
  { at: "Inside", via: "through", place: "shop", shot: { size: "close", on: "keeper", move: "push" } }, // into shop1
  { at: "bang", via: "flash", gag: { fx: "impact", on: "counterTop" }, shot: { size: "medium", on: "keeper", move: "pull" } },
  { at: "edge", event: [0, 6] },                   // a prop turns on purpose: QA lists it, does not fail it
],
tail: 0.4,                                         // 0.3-0.5 s after the last word
```

## Transition recipes

Frame 0 = the onset of the word that motivates the join; A = outgoing shot, B = incoming shot; W/s = frame widths per
second. Request each on the beat that starts B: `via: "dissolve" | "through" | "flash" | "iris" | "cut" | "glide" |
"whip"`. Declare deliberate picture changes that are not joins with `event: [frames]`.

**T1 Cross-dissolve** (`via: "dissolve"`, or nothing on a sentence start or a new place). Status: built; start time,
B's arrival and the key timing partly (see the table).
- f-12 to f+1: A keeps its move (a push of 0.1-0.5 %/f or the end of an accent); never settle into a hold before the mix.
- f+2 to f+10: the mix, alpha 0.03 0.10 0.21 0.36 0.52 0.67 0.81 0.92 0.99, then 1. Both cameras run.
- B is moving on its first mixed frame (push 0.2-0.5 %/f or a sideways drift of 0.15-0.3 W/s) and eases out to its base
  push by f+25 to f+35. B shows its own light key from its first frame; A keeps its own.
- No sound for the join. The caption switches on its own word.

**T2 Match dissolve** (`via: "dissolve"` + staging). Status: not built as a helper.
- T1, plus an element both pictures share: a head, a round object, a held prop, a light, a texture, a grid.
- Frame B so the element's screen centre is within 3 % W of A's and its size within 15 %; move both cameras the same
  way, or hold the element still while the world changes around it. Use it on the word that names the shared thing.
- Board: two shots framed `on` the same prop or mark at the same size; compare stills at f-1 and f+10.

**T3 Hard cut** (`via: "cut"` + `softCut: 0`). Status: soft cut built (6 f dissolve); a hard cut on one beat not built.
- f-1 is the last A frame, f0 the first B frame, on the stressed syllable +-1 f.
- B moves from its first frame with a small eased move; no settle bump. An axial cut-in jumps 10-15 % closer on the
  same axis at an action or light peak. At most 2 per film.

**T4 Whip** (`via: "whip"`). Status: partly (6 f symmetric, camera motion blur, cannot change place).
- f-6 to f-2: accelerate along the pan from 0.2 to 1.5 W/s (ease in).
- f-1 to f+1: peak 2-4 W/s, blur along the motion ~0.5 x the frame-to-frame shift (60-120 px at 1080 w), sharpness under
  0.6 of normal. A join switches on f0, inside the peak.
- f+2 to f+8: decelerate to 0.1 W/s, a little longer than the ramp up; blur gone by f+4. Land the new subject on a third
  line drifting toward the centre. 9-15 f in all, about one per film.

**T5 Through** (`via: "through"`). Status: partly (9 f push inside the mix only; no lead-in, no reverse form).
- f-20 to f-6: the push accelerates from +0.5 to +4-8 %/f toward a surface that will fill the frame; roll 2-5 deg optional.
- f-5 to f0: the surface fills >= 90 % of the frame at +6-12 %/f; its rim goes soft.
- f-3 to f+5: mix 6-9 f with T1's curve, or switch on a frame where the surface is uniform (white, black, glass).
- f+1 to f+25: B starts tight or "inside" and keeps pushing at a falling rate, or pulls back fast (x0.4 in 5-10 f) and
  decelerates. Reverse form: B shrinks into a frame inside A (scale 1 -> 0.3 over 8-14 f) as the frame's border fades in.
- Board: frame the beat before ON the surface (`on: "shop1"`, `move: "push"`, `amount` 0.3-0.5), then `via: "through"`.

**T6 Foreground wipe** (`via: "past"`). Status: not built.
- Put an object on the camera path 0.2-0.6 m from the lens (head, post, door jamb, smoke, sign, trunk, boxes, paper).
- f-4 to f+3: the camera passes it at 0.8-2 W/s, or it sweeps across on its own in 4-17 f; it covers >= 2/3 of the frame
  for 2-5 f, out of focus and blurred. Switch A -> B on the covered frames; B continues the same screen direction and
  decelerates. A softer form runs a T1 mix while the object crosses.
- Today: no board field. A custom prop crossing the lens during a dissolve is the nearest (untested).

**T7 Iris** (`via: "iris"`). Status: partly (the opening is built; the held POV mask is not).
- A circle centred on the subject opens from ~3 % W to full size in 4-5 f (ease in), with a thin bright ring (~0.5 % W).
- For a look through a round lens it stops at ~1.2 W across and the outside stays near-black (#120a14-like) for the
  whole point-of-view shot; reverse it to close. Rare: a point of view only.

**T8 Relight / time-lapse** (no `via` yet: a `key` on a beat without `shot`). Status: partly.
- Same framing, the slow push continues. One change: the key jumps in 1-2 f (a lamp goes out: luma -35 % in 2 f) or
  ramps over 10-25 f. Time-lapse: 4-8 light steps 12-20 f apart, each a 3-8 f mini-dissolve in which props and poses jump.
- Board today: the light fades over 14 f ending on the beat; add `event: [0]` if QA reads the change as a cut.

**T9 Flash** (`via: "flash"`). Status: partly (symmetric 10 f, the white does not grow out of A's own light).
- f-8 to f0: bloom and exposure ramp until the frame is near white (luma > 0.9), from a light source in A.
- f0 to f+12: B comes out of the white with T1's curve; on a big explosion the white holds 2-4 f and B switches in hard.
- Board: put the source on the beat (`gag: { fx: "impact", on }`) so the white has a cause.

**T10 Follow the object** (no join; `shot.follow`). Status: built for actors and vehicles; a thrown prop needs the
rig's `follow` with a target function in a custom project.
- Ease in 8-12 f at the launch; hold the object at a fixed screen spot (+-5 % W) with a small look-ahead; ease out
  12-20 f on arrival at the next subject; 20-60 f in all.

**T11 Graphic flip** (counter or calendar). Status: not built (`gag: { counter }` ticks a number, it does not flip).
- A card flips in 4 f (0 -> 90 deg in 2 f, swap, 90 -> 0 deg in 2 f), one flip every 6-10 f; the camera keeps pushing.

**T12 Travel / re-framing** (`via: "glide"`, the default inside a sentence). Status: built (`glideLen`).
- Starts 8-16 f before the word, lands 6-10 f after it, 14-26 f with a symmetric ease; lands on the subject the narration
  names. The next re-framing comes >= 0.9 s later. Speeds and profiles: `camera.md`.

## Check

- **Every join, before delivery:** `vfa strips OUT.mp4 --plan timeline.json --analysis QA_DIR/analysis --around 6 --out
  strips.jpg`. A good 9 f dissolve spreads the change: SOFT rows show `harsh` 1-2.5; above 6 is drawn red and is a jump.
  UNPLANNED rows are defects; EVENT rows must be the prop change you declared.
- **One join at full rate:** `render.mjs --project ID --frames 1194-1216` (a cue at f 1200) and step through it.
- **Join mix:** `vfa transitions OUT.mp4`: dissolves per minute (reference ~12.5 /min), soft transitions per minute and
  the share of dissolves among all joins (>= 0.75). `whip_pan` / `zoom_through` also fire on in-shot camera moves.
- **Shot rhythm:** `[board lint]` from `render.mjs --stills` or `make.mjs`.
- **Hook:** `render.mjs --project ID --stills 0,15,30,45,60,90 --scale 0.5`: the frame must differ between 0 and 15,
  and a new picture must be up by 45.
- **Ending:** `durationInFrames` in `timeline.json` minus (last word end + `voOffset`) x 30 = 9-15 f.
- **Pacing:** no tool yet. Count joins, travels and beats with a pose, expression, gag or effect per window and compare
  with 3.0 / 2.6 / 2.4 / 1.95 per second.
- **Do not trust** the analyzer's ASL or the gap tool's "hold shots longer" in this style: its cut detector misses
  dissolves (it found 4 of ~22 joins on one reference film).

## Common mistakes

From our coin short and its first board:

1. **Dissolves that read as cuts.** Four 14 f dissolves moved 0.50 of the mix in one frame (alpha 0.28 -> 0.78): both
   halves rendered one world, so place, actors and light switched at the key in both. Fix (1.9): separate worlds, the mix
   starts on the key, 9 f, max step 0.124.
2. **Soft cuts as 3-frame ghosts** against 7-9 f dissolves in the reference. Fix: `softCut` 6.
3. **Travels that jumped.** 12 of 23 detected cuts were travels where the rig handed over mid-way and the picture jumped
   half the distance in one frame; QA passed them as listed events. Fix: a shot ends where the next travel starts; read
   the strips, not only the numbers.
4. **Cutting instead of joining:** 23 hard cuts a minute on the first board; the reference has 0-1 per film.
5. **Restless setups:** 34 setups of 1.7 s each. The reference holds ~3 s per shot with 1-2 re-framings inside.
6. **A whoosh on every join:** 43 % of our cuts carried one (20 % by chance); the reference sits at chance. Fix (1.9):
   no sound on dissolves or travels.
7. **A slow incoming shot:** 0.11 W/s after our joins against 0.14, and 56 % of our shots ended pulled out (reference
   30 %). Give the incoming shot a push (`move: "push"`).

## Sources

Private every-frame study of the 20 newest shorts of @RicksClips3000, a reference channel in this style (35,987 frames at
30 fps, 20 frame logs with 333 shots and ~315 joins, alpha fits of 242 dissolves, 2026-11-12); tools in
`references/tools/analyzer.md`.
