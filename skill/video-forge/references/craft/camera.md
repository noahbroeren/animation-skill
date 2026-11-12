# Camera (craft sheet)

What the camera does inside a shot and across a join: a slow push on every frame, about two quick eased accents per
shot that land on the next subject as the narration names it, and a few louder moves (crash zooms, rolls, one whip, a
kick on a hit). The characters hold still, so the camera carries the life of the picture. The most important rule:
**the camera never parks** (still frames under 4 %, holds of about 11 f).

Units: f = frames at 30 fps. Screen speed in w/s = frame widths per second of image motion (pan + 0.55 x |change of
log zoom| + 0.55 x |roll in radians|, the mean displacement of image points); 1 w/s = 48 px per frame at 1,440 px wide.
Zoom rates in % per frame (+ = push in). Positions as fractions of the frame width (W) and height (H). Joins
(dissolve, cut, through, flash, iris) and their timing belong to the edit sheet; this sheet covers what the camera does
around them.

## At a glance

| rule | target (median, range) | how to check |
|---|---|---|
| the camera never parks | still frames (< 0.01 w/s) 2.9 % (1.8-4.8); a hold lasts 11 f (8-15), longest ~40 f | `vfa analyze`: `frac_still`, two stills 30 f apart |
| speed | median 0.19 w/s (0.14-0.28); fast + whip (> 0.15 w/s) 55 % of frames | `vfa analyze`: `frac_fast`, `frac_whip` |
| accents | 41.5 per min (36-51) = one every 1.45 s; 29.5 per min peak above 0.6 w/s | `vfa analyze` moves list |
| accent shape | 16 f (8-31), attack 7 f, release 7 f, peak 0.9 w/s (0.46-1.7), broad symmetric hump | moves: `frames`, `attack_frames`, `release_frames` |
| base push | +0.14 %/f per shot (0.01-0.40), +0.24 %/f in quiet frames; 62 % of shots end pushed in, 30 % pulled out | `push_in_shot_frac`, `pull_out_shot_frac` |
| crash zooms (>= 4 %/f) | 11.3 per min, 56 % in; 9 f (5-16), peak 6.6 %/f (5.2-9.6) | moves list, strip |
| roll | 19.7 roll moves per min, 3.0 deg (1.6-6.5) over 16 f (10-26); a held dutch tilt 1.3 % of the time | strip, stills |
| impact kick | 0.8 per min, 4-5 f, sign flips every frame, ~3.7 % W first shift | strip |
| whip with blur | ~1 per film, 6-16 f, ramp-in 2-5 f, peak 2-4 w/s | `vfa strips` |
| moving through joins | camera moving into 79 % and out of 91 % of dissolves; incoming 1.8x faster (0.14 vs 0.08 w/s) | `vfa strips` |
| composition | face centre y 0.42 H (0.35-0.47); x inside the centre third 82 %; caption line never on a face (0 of 39) | `render.mjs --stills cues+10` |
| first 3 s | camera moving from frame 0 (20 of 20); first change of picture 1.2 s (0.75-1.75); 3.0 visual events per s (2.3-4.4) | hook strip |

## How it is built

1. **A base push on every shot.** Each shot creeps in at 0.1-0.4 %/f for its whole length. In quiet frames about 80 %
   of the zoom is push-in. Pull-outs are kept for reveals.
2. **Accents on top.** About two per shot (one every 1.45 s): a quick eased re-frame that lands on the next subject or
   the next shot size while the narration names it. Types (n = 884): push-in 30 %, pan 28 %, tilt 24 %, pull-out 15 %,
   roll-led 3 %. The speed profile over an accent (11 points, mean of all, normalised):
   `0.27 0.49 0.61 0.67 0.71 0.72 0.70 0.64 0.56 0.42 0.22`: ramps over the first and last quarter, flat middle.
   Not a 3-frame snap and not a C2 smootherstep spike.
3. **Louder moves, rationed.** Crash zooms on reveal words and on the hook; a roll of a few degrees rides on about every
   second accent; one whip per film, from a cause to its effect; a kick only on a real hit, and the push stops there.
4. **Moves run through the joins.** The outgoing shot is still moving when the mix starts; the incoming shot is already
   moving faster and settles with an ease-out, so the join feels like one camera carrying on. Big travels accelerate
   into a push-through and decelerate out of it.
5. **Follow the object.** When something travels from A to B (a thrown, poured or fired object, a rope, a vehicle) the
   camera rides it instead of cutting: ease in at the launch, hold the object at a fixed screen spot, ease out on the
   next subject.
6. **Compose for 9:16 and the caption.** The face sits on or just below the upper third line, inside the centre third;
   the caption line (0.705 H) lies over the body, a table or the ground, never over a face.
7. **Open on motion.** The camera moves on frame 0 and the picture changes (new subject or framing) within ~1.2 s.

Speed bands (share of frames, median of 20 videos):

| band | reference | our coin short |
|---|---|---|
| still < 0.01 w/s | 2.9 % (1.8-4.8) | 2.1 % |
| creep 0.01-0.03 | 8.7 % (4.8-11) | 19.6 % |
| slow 0.03-0.15 | 30.9 % (22-37) | 41.8 % |
| fast 0.15-0.6 | 34.8 % (32-39) | 24.6 % |
| whip > 0.6 | 20.4 % (17-29) | 11.9 % |

## Rules

1. **Never park:** still frames under 4 %, creep (0.01-0.03 w/s) at most 11 %, a hold 8-15 f; longer near-holds (2-4 s)
   only in dialogue, and then with a slow push or a light drift.
2. **Speed:** median 0.15-0.28 w/s; fast + whip frames (> 0.15 w/s) 50-60 %.
3. **Base push:** 0.1-0.4 %/f on every shot, at a near-constant rate; 60-65 % of shots end net pushed in, at most 35 %
   net pulled out. A pull-out needs a reveal.
4. **Accent rate:** 40 +- 8 per min; at least one per 1.5 s; about 30 per min peak above 0.6 w/s.
5. **Accent shape:** 16 f (8-31), attack 7 +- 3 f, release 7 +- 3 f, peak 0.5-1.7 w/s (median 0.9); speed profile
   within 0.1 of the profile above (an `inOutSine` or smoothstep travel fits).
6. **Accent timing:** the accent lands on the word that names its new subject; it starts before the word.
7. **Crash zooms (>= 4 %/f):** 8-15 per min, 5-16 f, peak 5-10 %/f, a little over half of them inward; on reveal words
   and on the hook (a push of x2 in 10 f on frame 0 is in range).
8. **Fast accents (>= 1.9 w/s):** ~9 per min, 7-21 f, attack 5 f, release 6 f.
9. **Roll:** ~20 roll moves per min of 1.5-6.5 deg over 10-26 f, mostly riding on a pan or an arc; 0.4-5 deg of total
   roll per shot. A held dutch tilt only on chaos beats (1-2 % of the film).
10. **Kicks:** at most 1 per min, 4-5 f, sign flip every frame, first shift ~3-4 % W; only on an impact, and the base
    push stops at the hit.
11. **Whip:** ~1 per film, 6-16 f: ramp in 2-5 f to 2-4 w/s, a decel a little longer than the ramp, directional blur
    (sharpness under 0.6 of the neighbours) at the peak; land with the new subject on a third line moving to centre.
12. **No hand-held float:** the measured high-frequency residual is ~0.1 px at 720 px wide.
13. **Through the joins:** the outgoing camera keeps moving (>= 0.03 w/s) until the mix ends; the incoming one starts at
    0.1-0.3 w/s and eases out over 15-30 f. No settle to a hold before a join.
14. **Follow the object:** 20-60 f; ease in 8-12 f at the launch, the object held within +-5 % W with a small look
    ahead, ease out 12-20 f on the next subject. Seen in 6 or more of 20 videos.
15. **Face position:** face centre y 0.35-0.47 H; x inside the centre third (0.33-0.67 W) 80 % of the time, otherwise on
    a third line (0.25-0.30 or 0.70-0.85 W).
16. **Caption band:** nothing important between 0.67 and 0.74 H.
17. **Depth devices:** an out-of-focus foreground element (an edge of a desk, a sign, a prop, a second head) in ~25 %
    of frames; a framing device (doorway, window, porthole, lens ring) in ~14 %; object-only frames ~20 %.
18. **Hook:** camera moving at frame 0; first change of picture by 1.5 s (17 of 20 change within 3 s); 3 or more visual
    events per s in the first 3 s (middle of the film 2.4, last 10 s 1.95).
19. **Hook devices** (each seen in the first 3 s): fly past the first subject's head into an insert; back out through a
    window into a wide with a crash pull-back; ride a moving object to the second subject; a crash push into an object
    on frame 0; a whip from a cause to its effect; a push into an opening that ends top-down.
20. **Ending:** the camera is still moving or settling in the last second (14 of 20); no fade.

## In our engine

| what | where (file / field) | 1.9 value | status |
|---|---|---|---|
| base push per shot | `lib/shots.ts` `moveEnd` via `shot.move: "push"`, `amount` | 0.26 of the distance over the whole beat, ease `smooth` (test, 4 s medium: 0.006 %/f on frame 1, 0.38 %/f mid-beat, 0.05 %/f at the end) | partly: starts and ends at rest (creep frames); the ease is not settable |
| rig push | `lib/camera.ts` `push.rate`, board `rig.push` | 0.0024 per frame | not effective on board shots: the rig pushes only on holds, and every board shot is one key-to-key glide (test: camera distance unchanged over a 120 f beat) |
| shot without `move` | `shots.ts` `shotKeys` (a 1e6-frame hold key) | locked camera, only roll drift and handheld | not built as measured: give every shot a `move` |
| punch | board `punch: true` -> rate 0.0065, 28 f, from 2 f before the word | no effect inside a board shot (same reason, tested); 0.65 %/f is not a crash zoom anyway | not built |
| accent travel | `lib/board.tsx` `glideLen`, `via: "glide"` | 14-26 f (0.35 x the framing before, clamped), starts 60 % before the cue, ease `inOutSine`; a framing under 20 f before it becomes a soft cut | built; length not settable per beat |
| crash zoom | a travel between sizes (table below); `via: "through"` (pushes the old picture in to 45 % of its distance, the new one out from 45 %) | no preset | partly: no 5-16 f crash move on its own |
| default ease | `camera.ts` `smoother` (C2) for keys without `ease` | used by whips and hand-written rigs | partly: the measured hump is `inOutSine` / smoothstep |
| roll accents | `CamKey.roll` (degrees); board `driftCam` | drift 1.1 sin(0.42 t) + 0.45 sin(0.97 t) deg, at most 0.03 deg/f | not built: no 1.5-6.5 deg roll over 10-26 f on travels; the drift is too slow to count as a roll move (0.08 deg/f) |
| dutch | none | none | not built |
| kicks | board `kick: amp` -> `camera.ts` `Kick` | 7 f, sign flip every frame, decay (1 - n/7)^1.5; first shift ~0.083 x amp of W in 9:16, roll 2.3 x amp deg | partly: 7 f (reference 4-5), `frames` not settable from a board; amp 0.45 gives the measured ~3.7 % W |
| whip | `via: "whip"` | 6 f glide landing 3 f after the cue, ease `smoother`; blur from `look.motionBlur` 0.5 (cap 90 u) | partly: symmetric 3 f ramps, no join at the blur peak; `lintBoard` flags every whip (one per film is the target: accept that one line) |
| follow | `shot.follow: actorId / vehicleId` -> rig `follow` | blend 6 f in, 4 f out, look-ahead 0, motion blur x0.15 | partly: actors and vehicles only (a flying prop needs a custom prop and its own `follow`); reference ease 8-12 f in, 12-20 f out |
| moving through a dissolve | `camera.ts` `dissolveAt` | both cameras run (1.9) | built; the incoming move starts from rest (`smooth`); reference arrives at 0.1-0.3 w/s |
| handheld | board `rig.handheld` | 0.012 m, speed 0.4 | built (our float measured 0.135 px vs 0.12 px at 720 w: equal) |
| motion blur | look `motionBlur` | 0.5 shutter; x0.45 during travels, x0.15 during follows | built |
| face position | `shots.ts` `HEAD_FRAMING`, `side` | eyes 37-47 % from the top; `side: +-1` puts the subject 0.21 W off centre (a `side` between -0.8 and 0.8 stays in the centre third); the side carries over to the next shot | built |
| caption line | board `WordCaptions` | centre 0.704 H | built |
| hook | first beat | its move starts from rest | partly: no moving start on frame 0, no lint for "first change of picture by 1.5 s" |

Peak speed of an `inOutSine` travel, for sizing accents: a pan of p frame widths in N frames peaks at ~47 x p / N w/s;
a zoom of x r peaks at ~157 x ln(r) / N %/f (~26 x ln(r) / N w/s). The median accent (0.9 w/s in 16 f) is a pan of
~0.3 W or a zoom of ~x1.75. Single-character travels between engine sizes (computed with the 1.9 rig, same subject):

| travel | screen zoom | 14 f | 20 f | 26 f |
|---|---|---|---|---|
| medium -> close | x1.53 | 4.8 %/f (0.79 w/s) | 3.4 %/f (0.55) | 2.6 %/f (0.43) |
| close -> xclose | x1.60 | 5.3 %/f (0.87) | 3.7 %/f (0.61) | 2.9 %/f (0.47) |
| full -> medium | x2.00 | 7.8 %/f (1.28) | 5.5 %/f (0.90) | 4.2 %/f (0.69) |
| full -> close | x3.07 | 12.7 %/f (2.10) | 8.9 %/f (1.47) | 6.9 %/f (1.13) |

A crash zoom (>= 4 %/f) is a 14 f travel of x1.5 or more, or a 20-26 f travel of x2 or more. Because `glideLen` is 0.35 x the framing before it, a
14 f travel needs a framing of 40 f or less before it; ~57 f gives 20 f; 74 f or more gives 26 f.

How to use it on a board:

```ts
beats: [
  // every shot gets a move: without one the camera is locked
  { at: "Every", place: "street", shot: { size: "full", on: "hero", move: "push", amount: 0.2 } },
  // accent inside the sentence: a travel to the next size, landing just after the word
  { at: "coin", shot: { size: "medium", on: "hero", move: "push", amount: 0.12 } },
  // reveal word after a short framing (<= 40 f): a 14 f travel, ~5 %/f = a crash zoom
  { at: "missing", shot: { size: "close", on: "hero", move: "push", amount: 0.1 } },
  // a pull-out only for a reveal; `wide` without `on` uses the set's establishing camera
  { at: "whole", shot: { size: "wide", move: "pull", amount: 0.2 } },
  // follow the moving thing to the next subject instead of cutting
  { at: "rolled", shot: { size: "full", on: "coach", follow: "coach" } },
  // one real impact: one kick at full size
  { at: "slammed", kick: 0.45 },
]
```

## Check

- **Speed, bands, accents:** `vfa analyze FINAL.mp4 --out QA`, then the camera block of the fingerprint: `frac_fast`
  (target ~0.55; its fast band starts at 0.15 w/s like this sheet), `frac_whip` (~0.20), `frac_still` (its still band is
  < 0.005 w/s, half of ours), the moves list (`frames`, `attack_frames`, `release_frames`, `ease`) and
  `push_in_shot_frac` / `pull_out_shot_frac` (~0.62 / ~0.30). `vfa compare REF_FP QA/fingerprint.json` gives the gap
  table. Measure the reference and ours with the same tool: absolute speeds differ by 1.3-1.9x between estimators.
- **Locked shots:** two stills 30 f apart inside one shot (`render.mjs --stills A,B`); the framing must differ.
  Failure: identical crops, or a push that only happens in the travel.
- **Joins:** `vfa strips FINAL.mp4 --plan timeline.json --out strips.jpg`; in every nine-frame dissolve row both
  pictures move. Failure: the incoming picture starts still and only begins to move after the mix.
- **Composition:** `render.mjs --stills cues+10`: face centre at 0.35-0.47 H, inside the centre third, nothing important
  at 0.67-0.74 H.
- **Hook:** `ffmpeg -v error -t 3 -i FINAL.mp4 -vf "select='not(mod(n\,2))',scale=144:-1,tile=9x5" -frames:v 1 hook.jpg`.
  Failure: frames 0-5 identical, or the same framing for longer than 1.5 s.
- **Kicks, whips, rolls:** a full-rate strip around each one; count the frames and the sign flips.

## Common mistakes

From our coin short (56 s), measured with the same scripts as the reference:

1. **Half the speed.** Median 0.088 w/s (reference 0.19), fast + whip frames 37 % (55 %), creep frames 19.6 % (8.7 %).
   Read from the code, the likely causes: beat-long moves eased at both ends, 1.8 travels of 30-60 f, and shots
   without a `move` standing locked.
2. **Soft accents.** Peak 0.61 w/s (0.89); 19.2 accents per min above 0.6 w/s (29.5). The older style pack's "44 f
   glide" came from a detector that merges compound moves; a single accent is 16 f. Long, slow moves belong to the
   base push.
3. **Half the crash zooms.** 5.3 per min (11.3).
4. **Too many pull-outs.** 56 % of our shots ended net pulled out (30 %). Default every MS-and-closer shot to `push`.
5. **Too many, too small kicks.** 9 `kick` beats in 56 s at amp 0.02-0.05 (0.2-0.4 % W): 4.3 detected shakes per min
   against 0.8 at ~3.7 % W. One or none per film, at amp ~0.45.
6. **Too few rolls.** 13.9 roll moves per min (19.7); the slow roll drift never reaches a roll move's 0.08 deg/f.
7. **A slow incoming camera.** After a join ours moved 0.11 w/s (0.142); the reference's incoming shot is 1.8x faster
   than the outgoing one.
8. **Faces too high.** Head centres ~0.31 H in close frames (0.42 H). Fixed in 1.9 by `HEAD_FRAMING`.
9. **Dead punches.** Tested on the 1.9 rig: `punch` and `rig.push` do not act inside board shots. Until that changes,
   put the push into the shot's `move` and make crash zooms with short travels.

## Sources

Private frame study of the 20 newest shorts of a reference channel in this style (35,987 frames at 30 fps, 2026-11-12):
every frame camera-tracked (optical flow, similarity fit), 884 accents, 380 shots, 242 dissolves, 59 composition
frames, the first 3 s of all 20 at full rate; our coin short measured with the same scripts; travel and push values
computed with the 1.9 `cameraRig`. Older, coarser camera numbers: `references/styles/toonworld-explainer.md`
(superseded where they differ).
