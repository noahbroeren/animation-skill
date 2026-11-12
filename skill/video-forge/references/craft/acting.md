# Acting and character angles (craft sheet)

How characters are shown (view, camera angle, shot size, eye line) and how they move (faces, blinks, mouths, gestures,
walks, groups). In this style the camera supplies the motion and the characters supply the punctuation: a face or a
pose changes on one frame, on the stressed word, and then holds dead still, so every change reads. The most important
rule: **pop, then freeze** (no tween, no overshoot, no idle sway on a held face).

Units: frames (f) at 30 fps; head height and eye line as a share of the frame height (H), eye line measured from the
top; character sizes in head heights. Construction and drawing of the characters themselves: `craft/character-types.md`.

## At a glance

| rule | target (median, range) | how to check |
|---|---|---|
| views of the main character | front 76 %, three-quarter 20 % (per video 10-24 %), back + over-the-shoulder 3 %, profile 1 % | one still per second, count views |
| a turn | a drawing swap in 1-5 f; at most one in-between view per 90 deg; never a rotated, squashed or mirrored card | 30 f face strip |
| camera angle on characters | eye level 84 % (per video 76-94 %), high 9 %, low 4 %, top-down 3 %, dutch 1.3 % | `render.mjs --stills cues+10` |
| shot sizes on characters | WS 23 / FS 33 / MS 28 / MCU 9 / CU 5 / ECU 1 % (+ OTS 2 %) | seconds per `shot.size` from `planBoard` |
| eye line in CU-MS | 42 % from the top (37-48 %); head height median 7 % of H (5-10 %) | stills with a 10 % grid |
| face changes, active character | 2 per s (1-3) in acting moments; 2 of 3 are one-frame pops, 1 of 3 sit inside a shut-eye frame | 30 f face strip |
| hold after a change | 14 f (11-20), completely still; a still foil holds one face 2-10 s | 30 f face strip |
| blink | 2 f fully shut (16 of 21 timed), no half-lid frames; gaps 12-40 f on faces of MS and closer | 3-5 s face strip |
| mouths | only on quoted lines: a new shape every 2-4 f (8-14 per s, median 11) from ~6 shapes; the narrator never moves a mouth | strip on a quoted line and on narration |
| gestures | 2-6 f from rest to the extreme, no overshoot, no settle, then hold 15 f or more | strip |
| walk | 6 f per step (4-8; 12-15 only for a sad trudge), body bob at most 1-2 % of H | strip |
| squash and stretch | none on heads or bodies; a rigid hop of ~10 % of a head height is the only substitute | strip |

## How it is built

1. **A view is a drawing.** The card always faces the camera. Front, three-quarter left, three-quarter right, rarely
   profile or back, are separate drawings. A turn swaps drawings: directly (1 f), through one in-between view, or hidden
   in a 1-2 f shut-eye frame. Hair partings, badges and the prop hand stay on their own side: nothing is mirrored.
2. **The camera sits at eye level** and leaves it only for a reason in the script: low for a character who has power
   over another in this beat, high for one who is small, trapped or losing, top-down for someone lying on their back,
   a dutch tilt for chaos. A card seen from 15-25 deg above or below stays a camera-facing card; the drawing supplies the
   chin-up or head-down tilt.
3. **Mostly full and medium shots.** Close shots are short accents. Faces sit just above the frame centre, eyes at
   37-47 % from the top in MS to CU, which keeps them clear of the caption band (60-74 % of H).
4. **The face is a set of swappable parts.** Brows carry most of the emotion (flat, V, inverted V, one raised); the eyes
   switch mode (solid ovals, half lid, closed line, closed up-arc, squeezed, white ring with a small pupil); one mouth.
   Add-ons (sweat drop, blush, tears, steam, a colour fill of the whole head for rage) pop with the swap.
5. **Acting is choosing a new combination on the stressed word and holding it.** The swap lands 0-3 f before the word.
   The mouth may lead the eyes by 1 f; a startle can be a cascade of 3-5 pops in 6 f. Real in-betweens are rare (two lid
   frames on a slow reveal, a 4-step mouth opening into a laugh).
6. **Blinks are a separate 2-frame drawing** (a closed line), every 0.5-1.5 s on faces big enough to read, and they are
   the hinge where about a third of the swaps happen. Masks, deliberately still foils and closed-eye faces do not blink.
7. **Bodies are rigid between beats.** An action is 2-6 drawn frames to an extreme and a freeze. Only strikes and jumps
   get a wind-up. No breathing, no sway: between beats only the camera and the effects move.
8. **Mouths move only when a character speaks a line of the story.** A narrated hero holds one mouth per beat; the
   speaker's head stays still while the mouth runs, the free arm may gesture every 3-6 f.
9. **Groups are staged by contrast and by stagger.** One busy character next to one still foil; crowd reactions travel
   from head to head a few frames apart; wide crowds are frozen.

## Rules

1. **Views over a video:** front 70-80 %, three-quarter 15-25 %, back + over-the-shoulder 2-5 %, profile 2 % or less.
2. **Profile only small:** profiles appear mostly on small figures (5 % of WS samples, 1 % or less at FS and closer).
   A walk at FS or closer is drawn front or three-quarter.
3. **Back views have a job:** working (painting, digging, climbing), walking away, or the back of a head in the
   foreground of an over-the-shoulder shot (about 1 % of character time, head very large, out of focus).
4. **Turns:** 1 f direct swap; or 3-5 f with one in-between view (back, three-quarter, front); or one in-between plus
   2 shut-eye frames. A full turnaround front to back takes 4-5 f (front, three-quarter, profile, back).
5. **Never fake a view** by rotating, squashing or mirroring a card. A design with a side parting, a badge or a prop in
   one hand needs its own left and right three-quarter drawings.
6. **Group turns:** a whole row turning at once takes ~3 f; a wave of turns runs 3-5 f per head with heads ~12 f apart.
7. **Camera angle shares:** eye level 80-90 %, high 6-12 %, low 3-6 %, top-down 2-4 %, dutch 1-2 %.
8. **Angle motivation:** low only on a power or threat beat, high only on a smallness or victim beat, top-down only on a
   character lying down (or a set overview), dutch only on chaos beats. Check each against the script line.
9. **Shot size shares on characters:** WS 20-25 %, FS 30-35 %, MS 25-30 %, MCU 8-12 %, CU 4-6 %, ECU 2 % or less.
10. **Framing per size** (head height / eye line from the top): ECU 30-35 % / 45-50 % (only size that crops the crown);
    CU 18-22 % / 33-40 %; MCU 12-15 % / 40-46 %; MS 8-11 % / 37-47 %; OTS 8-13 % / 46-50 %; FS 5-7 % / 40-47 %;
    WS 2-4 % / 42-58 %.
11. **Deliberate exceptions to the eye line:** a towering character seen from below may put the eyes at the top edge
    (3-6 % from the top); a "small" character may sit low (eyes ~63 %). Rare: 3 cases in 20 videos.
12. **Expression swaps:** 1 f, landing 0-3 f before the stressed word; 25-35 % of swaps inside a 1-2 f shut-eye frame;
    1.5-3 swaps per s for the active character in acting moments (one fully logged hero: ~1.4 per s over all its
    screen time).
13. **Holds:** after a swap the face and body hold frozen 12 f or more (median target 14-20 f); zero idle sway, zero
    breathing. Many one-second windows in the reference are frozen for 25-30 f.
14. **Busy and still casting:** a talker may swap every 10-15 f (up to 3 per s); a foil holds one face 2-10 s and may
    not blink for 5 s.
15. **Blink:** 2 f fully shut, no half-lid frames; gap 12-45 f on faces of MS and closer, none on smaller faces; none on
    closed-eye expressions or deliberately still characters. Every eye state needs a matching shut drawing (straight
    line, up-arc for happy, squeeze for pain).
16. **Mouth:** moves only on quoted or voiced lines, a new shape every 2-4 f (8-14 per s) from ~6 shapes (closed line,
    small o, open with tongue, wide yell, teeth grid, laugh with a tooth band); head still while talking; narrated
    characters keep one mouth per beat and never nod to the narration.
17. **Gesture:** 2-6 f from rest to the extreme (hand drop 2 f, arms up 3 f, shrug 3 f, point 5 f, lift a prop to the
    face 6-7 f, lean in 30 deg in 5 f), no overshoot or settle frames, then hold 15 f or more.
18. **Anticipation only for hits and jumps:** strike = 1 f wind-up peak (or a 6 f held wind-up) + 1-2 f strike +
    4-5 f impact effect; jump = 2-3 f crouch, ~9 f rise, 3 f hang at the apex; stomp = 9 f knee lift, 2 f down.
19. **No squash and stretch** on bodies or heads. For a big switch use a rigid hop of ~10 % of a head height (1-2 f up).
    Strain (pushing, gripping) is a whole-card jitter of 1-3 % of the head size per frame.
20. **Walk:** 5-7 f per step (6 f default; 12-15 f only for a sad trudge), drawn on ones, body bob 1-2 % of H or less;
    some walkers do not bob at all. A walk-in from the edge takes ~11 f; a slide-in 4-5 f.
21. **Secondary motion only on loose costume pieces:** a hat that flies off travels 16-25 f with +-30 deg rocking or one
    full turn. Hair never moves.
22. **Props** sit at the end of the arm stroke and rotate with the forearm; a prop is visible 3 f or more before its
    noun; a lid or a card flips in 4-5 f.
23. **Two-shots** (27 % of character time; 3+ characters 18 %): three-quarter views facing each other, or front-on side
    by side with the eyes slid toward the other; the nearer head covers 10-25 % of the other.
24. **Listener:** frozen face and no blink for the whole line; the reaction pops after the line, not during it.
25. **Crowds:** frozen in wide shots; a group reaction starts 3-6 f later per head; a group laugh bobs 4-6 f per bob
    with a different phase per head; a shared glare may land on all at once.
26. **Characters as transitions:** at least one character walking past the lens as a foreground wipe, or a push through
    a prop a character holds (a lens, a mirror), per video instead of a plain dissolve (8 wipes in 7 of 20 videos).
    Match-on-action cuts were not found; do not rely on them.

## In our engine

| what | where (file / field) | 1.9 value | status |
|---|---|---|---|
| single-character framing | `lib/shots.ts` `HEAD_FRAMING` (uses `Subject.head`, `Subject.eye`) | xclose 0.32 / 0.47, close 0.20 / 0.37, medium 0.13 / 0.44, full 0.065 / 0.45, low 0.08 / 0.42 | built. Our `medium` is the reference MCU, `close` the CU, `xclose` the ECU, `full` the FS |
| MS (head 9 %, eyes 40 %) | none | none | not built: the second most common size (28 %) has no preset; `fill` switches `HEAD_FRAMING` off |
| two-shot eye line | `shots.ts` `frameShot`, sizes `two` / `group` | eyes 44 % from the top | built |
| over-the-shoulder | none (`shots.ts` header says so) | none | not built: needs a back-of-head drawing |
| camera angle | sizes `low` (camera at 0.14 x the subject height), `high` (2.3 m + 0.6 x height above the feet), `top` (overhead) | angle is tied to a size | partly: no low-angle close-up, no high-angle medium; `shot.angle` is the yaw around the subject, not the tilt |
| dutch tilt | `CamKey.roll` exists in the rig; the board only adds `driftCam` (+-1.5 deg slow drift) | none on a beat | not built |
| views | `Act.view` front / three / side, `Act.facing` 1 / -1 | the view switches on the first frame of the pop (a 1 f swap) | partly: no back, three-quarter back, lying face-up or chin-up drawings; `facing: -1` mirrors the whole drawing (`drawKind` scales by -1) |
| turn helper | none | none | not built: `turnTo(view, frames)` with one in-between view or a shut-eye frame |
| head turn | `Act.look` (sets `turn` 0.65 toward the target), `Act.turn` | blends with the pose (5 f, overshoot) | partly: a feature slide, not a drawing swap |
| poses | `characters/kinds.ts` `BOBBLE_POSES` | 15: idle, wave, point, shrug, cheer, think, facepalm, neck, hips, phone, shock, carry, sit, run, limp | built |
| pose timing | `kinds.ts` `poseTrack`, board keys | blend 5 f (1 f on a cut or a new place), outBack `c1` 1.9 (~12 % overshoot), up to 2 smear frames per pop, 8 f settle on hair, hat, prop and hem | not built as measured: blend 2 f, no overshoot, no smear, no hair settle; no per-act `blend` field on a board |
| lead | `Act.lead` | 3 f before the word, 0 on a cut or a new place | built |
| expressions | `kinds.ts` `EX`, `KExpr` | 16 faces; `expr` switches on the first frame of the pop | partly: snap swaps work; matching shut drawings and the 17-face library are not built |
| expression squash | `EX[*].act.squash` | ignored for bobbles (only object / blob / microbe use it); `BOBBLE_POSES.shock` still sets `squash` 1.06 and `idlePose` breathes +-2 % | partly: remove the pose squash and the breathing |
| blinks | `characters/toon.ts` `blinkAt`, `LID`; board passes every pose key as a forced blink | 4 f (half, shut, shut, half), gaps 0.5-2.3 s, every character, forced on every key | not built: 2 f shut blink, gaps 12-45 f on faces of MS and closer, `blinks: false` for foils, a blink hinge on ~30 % of swaps only |
| holds | `lib/board.tsx` `updateWorld` + `toon.ts` `idlePose` | head tilt +-3.8 deg, lean +-1.4 deg (+ idle +-3.5 deg), bob, hand drift +-0.03-0.05 head units, eye drift with a dart every ~3 s, settle +-2 deg, breathing | not built: frozen holds |
| nods | `board.tsx` `updateWorld` | a nod on every narrated word longer than 3 letters, on every standing character | not built: remove (the narration never moves a character) |
| talking | `Act.talk` -> `TALK` mouth cues every 0.08 s | 12.5 changes per s from 6 shapes | built (rate). Not built: head still while talking, a lint for mouths on narrated words |
| walk | `board.tsx` `walkPose(f, fps, 2.7)` | 11 f per step, always drawn in profile | not built: 6 f per step, front or three-quarter walks at FS and closer |
| props in hand | `Act.hold` / `hold2`, `aim` | attached to the hand | built |
| crowd reactions | `Beat.crowd` -> `CrowdPool.react` | each member 1-8 f late in its own variant; the pool breathes when it has events | partly: wide crowds are not frozen; no head-turn wave helper |
| character wipe | none (`past` join) | none | not built |
| board lint | `lintBoard` | warns when fewer than half of the beats change a pose | partly: no checks for view shares, holds under 12 f, mouths on narration |

How to use it on a board (sizes named the engine way):

```ts
beats: [
  // set-up: full shot at eye level, front view; give the shot a move (see craft/camera.md)
  { at: "Every", place: "shop", shot: { size: "full", on: "hero", move: "push", amount: 0.15 },
    act: { hero: { at: "keeper", pose: "idle", expr: "neutral" } } },
  // the stressed word: face and hand change together, 3 f before the word (Act.lead default), then hold
  { at: "never", act: { hero: { pose: "point", expr: "smug" } } },
  // a swap between words: anchor on seconds, one face change every 10-30 f in acting moments
  { at: 4.85, act: { hero: { expr: "nervous" } } },
  // two-shot: three-quarter views facing each other; the foil holds one face
  { at: "asked", shot: { size: "two", on: ["hero", "rival"] },
    act: { hero: { view: "three", facing: 1 }, rival: { view: "three", facing: -1, expr: "deadpan" } } },
  // a quoted line: only the speaker talks; the listener reacts AFTER the line, on the next word
  { at: "Why", act: { rival: { talk: true, expr: "angry" } } },
  { at: "He", act: { hero: { expr: "shock" } } },
  // power beat: low angle on the character who wins it
  { at: "ordered", shot: { size: "low", on: "rival", move: "push" } },
]
```

Shot-size shares straight from a board (engine names; `medium` counts as MCU):

```ts
const P = planBoard(board, 30), per: Record<string, number> = {};
P.shotBeats.forEach((x, k) => { const n = (P.shotBeats[k + 1]?.f ?? P.total) - x.f, s = x.shot?.size ?? "wide"; per[s] = (per[s] ?? 0) + n; });
```

## Check

- **Framing:** `node tools/render.mjs --project ID --stills cues+10 --scale 0.5`; on each still with a character read
  the head height and the eye line on a 10 % grid. Failure: a crown cut at CU or MCU, eyes above 33 % from the top, or a
  face on the caption band (67-74 %).
- **Shares:** the snippet above for sizes; views and angles from one still per second (a `--stills` list every 30 f).
  Failure: front over 85 %, no three-quarter two-shots, 100 % eye level, `medium` over 20 % of character time.
- **Faces, holds, blinks, gestures:** a one-second strip at full rate cropped on the face:
  `ffmpeg -v error -ss T -t 1 -i FINAL.mp4 -vf "crop=W:H:X:Y,scale=216:-1,tile=10x3" -frames:v 1 strip.jpg`. Count
  the face changes, the longest frame-identical run, the shut frames of each blink and the frames of each gesture.
  Failure: a head that tilts in a hold, a blink with half lids, a gesture that passes its extreme and comes back.
- **Mouths:** the same strip on a narrated sentence must show one mouth shape for the whole beat; on a quoted line a
  new shape every 2-4 f.
- **Views on the model sheet:** `node tools/render.mjs --project charsheet --format long --stills 0,40,70,100,130`.
- `vfa pose` measures blinks and lip sync on real faces; cartoon faces are often not detected, so do not trust its blink
  rate here. Count blinks on strips.

## Common mistakes

From our coin short (56 s, 1,440 x 2,560), measured the same way as the reference:

1. **Crowns cut, heads too big.** Our close shots framed the head at 22 % of H with the eyes at 30 % from the top
   (reference MCU 13 % / 44 %). Fixed in 1.9 by `HEAD_FRAMING`.
2. **Sitting too close.** MCU and closer 23 %, MS 45 %, FS + WS 31 % of character time (reference 15 / 28 / 56 %).
   Use `full` and wide shots for a third of the film each, `medium` (MCU) for under 12 %.
3. **One view, one angle.** Front 93 %, three-quarter 7 %, no back or profile; 100 % eye level. Drawing every
   two-shot in three-quarter (24 % of our character time) would reach the reference share on its own.
4. **Holds never froze.** Every held face swayed (head tilt +-3.8 deg, lean +-1.4 deg, hand drift) and nodded on every
   narrated word, so pops did not read as pops. Fix: no idle on held poses, no nods.
5. **Too few face changes.** 0.8 changes per s in acting moments (reference 2.2), and none of them inside a blink.
6. **Soft blinks.** 4 frames (half, shut, shut, half) against 2 shut frames; the rate (43 per min) was already right.
7. **Mushy gestures.** A 5 f blend with an overshoot and a smear frame, then drifting; the reference reaches the
   extreme in 2-6 f and freezes.
8. **Slow walks.** 11 f per step against 6 (1.8x slower), always in profile.
9. **Too few groups.** 1 / 2 / 3+ characters on screen 64 / 24 / 12 % of character time (reference 54 / 27 / 18 %).

## Sources

Private frame study of the 20 newest shorts of a reference channel in this style (35,987 frames at 30 fps, 2026-11-12):
1,196 one-per-second census samples, 107 full-rate acting strips (42 counted frame by frame, 21 blinks timed), an
every-frame motion scan; our coin short measured with the same scripts. Older, coarser acting numbers:
`references/styles/toonworld-explainer.md` (superseded where they differ).
