# Characters (craft sheet)

A character in this construction family is a flat drawn card: a near-white head with an ink line that is thin toward the
light and heavy away from it, a face made of a few ink marks, a bean torso that carries the role colour, and limbs that
are single strokes. For the viewer it does two jobs: the face is the brightest thing in the frame, so the eye lands on
it at phone size, and every role is told apart by its silhouette and costume. The most important rule: the face is
never the identity. One face fill, one ink and one construction for the whole cast; the role lives in the hair or hat,
the torso colour and one prop.

This sheet describes the measured FAMILY so the engine can be calibrated against it. Do not publish a cast that keeps
this whole family: `character-design.md` says which layers to change and how to design our own.

Units: `W` = outer head width (face plus outline, what you measure on screen). The engine's `d` is the head path width
(the ink is centred on the path), so W is about 1.03-1.05 d; this sheet ignores that difference. `HH` = head height.
Frames are at 30 fps.

## At a glance

| rule | target (median, range) | how to check |
|---|---|---|
| one face fill for the whole cast | L* 95 (89-98), chroma 4 (2-10); neutral light ~#FCF8F3 | colour-pick the face on a day still |
| face lead over the local background | +28 L* (16-40); never under +20 | face L* minus a ring 0.2 W around the head |
| head silhouette | H/W 0.945 (0.91-0.97), superellipse n 1.85 (crown 1.8, jaw 1.9), widest row at 50 % | charsheet still 340, calibration row |
| outline, thin (lit) / thick (shadow) side | 0.026 W (0.022-0.038) / 0.063 W (0.051-0.069); chin 0.071; ratio 2.2 | 4x crop of a still, measure both sides |
| thick side follows the key | key left: left/right width 0.39; key right: 2.6 | stills in two lighting keys |
| ink | plum-black #20101A (L* 7, a* +10, b* -4); one ink for every mark | colour-pick the darkest core |
| limbs / hands | one ink stroke 0.054 W (0.041-0.060) / ink discs 0.11-0.13 W | 4x crop |
| eyes | 0.18 W wide, centres 0.235 W apart (0.21-0.25), on the widest row | expression row, still 340 |
| brows / mouth | 0.17 W long, <= 0.06 W thick, 0.15 W above the eyes / centre 0.18 W below the eye line | expression row |
| body | 3.1-3.6 HH tall; bean torso 0.75 W wide (0.65-0.85), chin to hem 1.0 W | front cell, still 340 |
| shading | face 8 L* per head width (5-11), no edge; torso 17 L* per torso width, shade/lit 0.58 | stills; no hard crescent on faces |
| size in frame | largest head 26 % of frame width (19-35) when a face reads; one face per frame 70 % | beat stills (head width, eye line) |

## How it is built

1. **Head card.** A superellipse `|x/a|^n + |y/b|^n = 1` with b = 0.945 a and n about 1.85: a hair wider than tall and
   very slightly pointed at crown and chin (n below 2), not a circle and not a box. Widest row at half height.
   Per-character variation stays small: asymmetry under 5 % of the half-width, tilt under 3 degrees (median 1.3).
2. **Outline.** One closed line around the head whose width depends on the direction to the key light: 0.026 W on the
   lit side, 0.063 W on the far side, heaviest just below the shadow side and under the chin (0.071, where it merges
   with the collar). The thick side is about 20 degrees below horizontal. It flips when the key changes sides. The width
   is a share of the head, not a pixel width: from 60 px to 900 px heads it stays 4.3-4.8 % on average (log-log slope
   0.91). The line along the hairline is thinner, 0.039 W.
3. **Ink.** Near-black with a plum cast, #20101A (measured range #120214 to #31222C). The same ink draws the outline,
   limbs, hands, feet, brows, eyes and mouth.
4. **Hair or hat.** A separate solid cap laid over the top of the head with the same outline. Hair gets 2-7 thin strand
   lines (15 L* darker or lighter) and one light sheen arc; it may be wider than the head (up to ~110 %). At the centre
   line the hair or hat covers the top ~16 % of the head height: the hairline sits about 0.32 W above the eye centres
   (0.26-0.40). 44 % of heads have more than 40 % of the upper half covered; 19 % are bald or nearly. Hats are props
   with their own gradient and one specular arc while the face stays flat; they sit low and tilt with the head.
5. **Face.** Flat ink marks straight on the fill. No nose, no ears, no catchlights, no default blush. Layout (origin =
   head centre on the widest row, + = down, mirror x for the other side):

   | mark | position | size |
   |---|---|---|
   | eyes | centres (+-0.118, 0) | default: dark half-oval 0.18 x 0.11 with a flat lid bar on top |
   | brows | centres (+-0.118, -0.15) | 0.17 long, 0.05 thick at the inner end tapering to 0.035, always apart from the eyes |
   | mouth | centre (0, +0.18) | default: small filled dark lens 0.10 x 0.035 |

   In three-quarter view every mark slides 0.06-0.12 W toward the facing side (37 % of faces) and the far eye is NOT
   narrowed (far/near width 1.1). The face is swapped as whole drawings from a library, never rigged or tweened.
6. **Expression library** (17 drawings; measured eye states over 584 faces: both lidded 55 %, closed or line 13 %,
   white rings 11 %, round dots 9 %, mixed 12 %; mouths on large faces: small filled shape 69 %, teeth 17 %, small open
   11 %, thin line 3 %):

   | expression | eyes | brows (inner / outer end, - = up) | mouth and extras |
   |---|---|---|---|
   | deadpan (default) | lidded half-ovals 0.18 x 0.11 | flat | dark lens 0.10 x 0.035 |
   | smug | lidded, pupils toward the facing side | facing brow up 0.03 | dash 0.12 tilted 8 degrees |
   | sleepy / bored | slit 0.17 x 0.035 under a lid bar | low, +0.02 | dash 0.08 |
   | happy | closed arcs, 0.17 wide, rise 0.06 | -0.02 / -0.02 | smile arc 0.14 x 0.04 |
   | laugh | arcs or squeezed `> <` | -0.03 / -0.03 | open D 0.30 x 0.14, white tooth band 0.03, tongue |
   | shock | white rings 0.22, 0.02 apart, ring stroke 15 % and pupil 42 % of the ring | raised 0.05, arched | O 0.10 x 0.14 or a wavy line 0.18; sweat drop |
   | angry | lidded, lid slanted 15 degrees inner-down | V: +0.03 / -0.03, 25 degrees, cutting into the eye | frown arc 0.12 or tooth grid |
   | effort / pain | squeezed `> <` slits | V | tooth grid 0.24 x 0.09 with 3-5 dividers |
   | worried | dots 0.08 x 0.11 | -0.03 / +0.01 | wavy line 0.16, two waves; sweat drop |
   | sad / crying | dots set low, or shut | inner end up 20 degrees | down arc 0.12; tear streams 0.03 wide |
   | wink | one closed arc, one lidded | open-side brow up | smirk |
   | skeptic | lidded, pupils sideways | one up 0.05, one flat | side dash |
   | yell / talk | lidded or rings | V or raised | D 0.30 x 0.18 with tongue; quoted lines only |
   | blissful | closed arcs | relaxed | soft smile plus blush ovals (emotion only) |
   | asleep | three ticks or flat lines per eye | flat | wavy snore mouth |
   | dizzy | spirals 0.15 | - | wavy |
   | blink | flat line 0.17, 2 frames | - | - |

   Add-ons pop in with the swap: sweat drop #A8DCFF, blush #FF6F86 at 35 % (ovals 0.12 x 0.06 under the eyes), tears,
   steam, a whole-head colour fill for a rage take. Mouth interior #54212A, tongue #E06E78, teeth white. Timing (snap,
   hold, blinks, lip sync on quoted lines only) is in `acting.md`.
7. **Torso.** A bean under the head with no neck: 0.75 W wide (0.65-0.85), widest at 65 % of its height, bottom/top
   width 1.34, top tucked 0.05 W under the chin, hem 1.0 W below the chin (robes 1.9). The head is ~1.3x the torso
   width. Clothing = the torso's flat colour plus at most ~5 details (collar, tie, buttons, badge, pocket, apron, sash)
   in thin inner lines 0.015-0.02 W.
8. **Limbs.** One curved ink stroke per limb, 0.054 W, round caps, no knee, no elbow, no sleeve. Arms start inside the
   torso sides 0.15 W below the chin (x +-0.33) and reach the hip when hanging (length ~1.0 W). Hands are ink discs
   0.12 W (they may become small three-finger mitts when gripping); feet are ink ovals ~0.16 x 0.07 W or pointed stubs.
   Limbs keep their world width in close-ups. Far limbs may be drawn a little lighter.
9. **Proportions.** Adult: head 1.0 x 0.945, chin at +0.47, legs from the hem to the feet at chin + 2.2 W, total
   3.1-3.6 HH (mean ~3.4). Kids keep the adult head and get a body ~0.7x as tall. Pose habits: torso lean 3-8 degrees,
   head tilt up to 5, one arm busy, feet turned out.
10. **Colour and shading on the card.** The face fill is one colour for everybody; warm, pink or blue faces on screen
    are the scene light (about 15 % of the background chroma reaches the face; night faces turn lavender-blue). The
    face takes a soft linear ramp of ~8 L* across the head away from the key (key from above 51 %, left 30 %, right
    15 %, below 4 % of faces), toward a lavender shadow (~#E8DFE9 from the white). No cel edge on the face. The torso
    shades twice as hard: 17 L* per torso width, shade/lit luminance 0.58. Costume colours sit at L* 40-75 (median 58).
    Night shots may add a thin warm rim on the lit edge.
11. **In the world.** The card always faces the camera, stands in the ground (grass can cover the feet) with a contact
    blob and a cast shadow, and keeps its 28 L* lead over what is behind it.
12. **Views.** Each view is its own drawing: front (76 % of character shots), three-quarter left and right (20 %),
    back or three-quarter back (2 %), back of the head for over-the-shoulder shots (1 %), profile (1 %, small only).
    Back view = a plain head disc under the hair or hat mass. Profile = the disc with one eye at the front edge and the
    hair mass at the back (no nose to draw). In three-quarter the hair mass slides to the back of the skull and shows
    which way the character faces. Turns are swaps, never rotated or squashed cards (`acting.md`).
13. **Identity budget.** A role = 1 silhouette element on top of the head (hair or hat) + 1 torso colour + 1 prop or
    costume detail + at most 1 face accessory (glasses as thick rings, a filled moustache or beard). Common costume
    signals: tall pleated toque (cook), peaked cap with a badge (guard), hard hat (worker), crown (ruler), wide brim
    (frontier), full helmet with the face in the visor (armour). Crowds are instanced head cards with randomised hair,
    glasses and shirt colour. Object characters reuse the same face marks, ink and limb law on a non-head shape.

## Rules

1. One face fill for the cast: L* >= 85 and chroma <= 6 in neutral light; no per-character skin tones.
2. On screen the face is >= 20 L* above its local background in every shot (target 28).
3. 10-20 % of the scene's chroma reaches the face (night faces visibly cooler, golden faces warmer).
4. Head: outer H/W 0.93-0.96, n 1.75-1.95, widest row at 48-55 % of the height; asymmetry <= 5 %, tilt <= 3 degrees.
5. Outline (share of W): lit side 0.022-0.038, shadow side 0.051-0.069, bottom 0.06-0.077, mean 0.040-0.051.
6. Thick/thin ratio 1.8-2.8, and the thick side is on the side away from the key, not fixed to one side.
7. Line width scales with the head (+-10 % from 60 to 900 px heads); no fixed pixel floor above 2 px at 1080 width.
8. One ink for outline, limbs, hands and face marks: sRGB within (18-49, 2-35, 14-44), target #20101A.
9. Limbs 0.045-0.060 W in the ink colour, round caps, no knees; hands discs 0.10-0.14 W; feet <= 0.2 W long.
10. Eyes: default 0.17-0.19 x 0.09-0.12 W, centres 0.21-0.25 W apart, within +-0.05 W of the widest row; no catchlights.
11. Shock eyes: rings 0.21-0.23 W, ring stroke 15 % and pupil 40 % of the ring width.
12. Brows 0.16-0.19 W long, 0.045-0.06 thick, 0.13-0.18 above the eye centres, never touching the eyes or hidden.
13. Mouth centre 0.17-0.19 W below the eye line; default <= 0.14 W wide; grin <= 0.42 W with a tooth band.
14. No nose, ears or default blush in front view; blush only as an emotion add-on.
15. Hairline >= 0.25 W above the eye centres at the centre line, so the brows stay visible.
16. Torso: bean, bottom/top 1.2-1.6, widest at 60-70 %, width 0.65-0.85 W, chin to hem 0.9-1.1 W, no neck.
17. Height: adults 3.1-3.6 HH; kids the same head on a 0.7x body.
18. Face gradient 5-11 L* per head width with no hard edge; torso 8-24 L* per torso width, shade/lit 0.45-0.77.
19. Hero head 19-35 % of the frame width in shots where the face must read; one character in ~70 % of face shots.
20. Identity budget per character: <= 1 hair/hat element + 1 torso colour + 1 prop or detail + 1 face accessory.

## In our engine

| what | where (file / field) | 1.9 value | status |
|---|---|---|---|
| house style for a whole cast | `Board.brand` (`lib/board.tsx`) -> `BobbleSpec.brand` | applied to every bobble without its own | built |
| face fill | `CastBrand.face` (`lib/characters/kinds.ts`) | calibration #FCF8F3; replaces each spec's `skin` | built |
| ink | `CastBrand.ink` | #20101A | built |
| head silhouette | `CastBrand.head { hw, n }` -> `sePath` in `drawBobble` | 0.945 / 1.85 | built; per-character head variation not built |
| outline width | `CastBrand.line.w` (x d), `c.lw` | 0.026, floor 1 px, scales with the card | built |
| thick-thin law | `CastBrand.line.taper` -> `taperUnder` (ink copy under the fill, shifted 0.94 x taper away from the key and 0.34 x taper down) | 0.038 -> about 0.05 d on the shadow side, about 0.026 d under the chin (computed from the code) | partly: shadow side ~20 % light, chin not thickened (target 0.071); key side is only left/right (`CharacterCard.place`), a top or back key is not modelled |
| limbs | `CastBrand.limbs { mode: "ink", w }` | 0.054, one curved stroke, far limbs 12 % lighter | built |
| hands / feet | `CastBrand.hands { mode: "disc", size }`; feet in `drawLeg` | disc 0.12; ink oval 0.17 x 0.08 d | built |
| default eyes | `CastBrand.eyes` (FaceSpec; face box = 0.94 d) | solid, eyeSize 0.19, eyeSpacing 0.25, eyeY 0.457, baseLid 0.42 -> 0.18 d wide, 0.235 d apart, on the widest row | built |
| shock eyes | `CastBrand.shock` | whites, eyeSize 0.23 -> 0.22 d | built; ring stroke / pupil share not checked |
| brows | `eyes.brows: "thick"`, `browScale` (drawFace) | 1.25 -> about 0.075 d thick, 0.33 d long, 0.2 d above the eyes (computed) | partly: twice the measured length, 0.05 d too high, hidden under the cap fringe |
| mouth | `eyes.mouthWidth`, `mouthY` | 0.14 / 0.65 -> 0.13 d wide, 0.18 d below the eyes | built |
| no nose, ears, shine | `CastBrand.ears / nose / shine` | false | built |
| face shading | `CastBrand.faceShade: "gradient"` | linear ramp to x(0.92, 0.90, 0.96), no edge | built |
| torso | `CastBrand.torso: "bean"` (`bean()`) | 0.74 d wide, widest at 62 %; chin to hem about 1.2 d | partly: hem ~20 % long |
| height | `BobbleSpec.heightHeads` (head widths) | 3.4 = 3.6 HH | built (top of the range) |
| scene tint on cards | `TOON_SETUPS[key].cardTint / cardTintMix` (`three/shaders.ts`) | day #ffffff, golden #ffe2c0, night #f0c4dc; mix 0.55 (0.85 night, interior, dusk) | built |
| framing by head size | `HEAD_FRAMING` (`lib/shots.ts`) | close 0.20 / 0.37, medium 0.13 / 0.44, full 0.065 / 0.45 (head share of frame height / eye line) | built |
| hair construction | `bobbleHair`, `bobbleHair3` | solid cap with a zigzag fringe and one sheen arc, no strand lines | partly; not a brand field |
| expression library | `KEXPRS` (16), `EX` table | no wink, sleepy, asleep, dizzy or rage drawings; blinks 4 soft frames | partly |
| views | `KPose.view` front / three / side | back, three-quarter back, lying, chin-up | not built |

Calibration is for engine tests and side-by-sides only:

```ts
import { BRANDS, BobbleSpec, KIND_PRESETS } from "../../lib/characters/kinds";
// engine test: the measured family on our own roles, next to the house style we publish
const test: Board = { id: "calib-test", title: "calibration", words: WORDS, brand: BRANDS.calibration,
  cast: { a: { spec: "bbHero" }, b: { spec: "bbChef" } }, places: { p: { set: "street" } }, beats: [ /* ... */ ] };
// BobbleSpec.face wins over brand.eyes; in a published cast use it at most for a resting lid (character-design.md)
const squinter = { ...KIND_PRESETS.bbHero, id: "squinter", brand: BRANDS.calibration, face: { baseLid: 0.55 } } as BobbleSpec;
```

## Check

- **Brand page:** `node tools/render.mjs --project charsheet --format long --stills 340` (page 12): rows `bobble`,
  `calibration`, `example`; each shows three roles in front, three-quarter and side, nine expressions, a point and a
  cheer. Fail: brows invisible, eyes merged into one bar, a hard crescent on a face, sleeves instead of strokes.
- **Line widths:** crop one head from a still at 4x (`ffmpeg -i still.png -vf "crop=...,scale=iw*4:-1" head.png`)
  and measure the ink across the lit side, the shadow side and the chin against W. Fail: equal sides, or a chin above
  0.08 W.
- **Face lead:** on the beat stills (`node tools/make.mjs --project ID --from board --to stills`) pick the face fill
  and a ring about 0.2 W around the head. Fail: under +20 L* (pale walls, sky, white interiors behind faces).
- **Scene tint:** the same face in a day, golden and night still must shift hue with the key while staying the
  brightest shape. Fail: identical face colour in every key, or a night face darker than the wall behind it.
- **Size in frame:** single-character shots are framed by `HEAD_FRAMING`; on the beat stills check the head width
  (19-35 % of the frame width where the face must read) and the eye line (37-47 % from the top). The shot audit
  (`lib/three/audit.ts`) only flags a subject under 6 % of the frame height as "tiny". Fail: a face shot with the head
  under 15 % of the frame width, or eyes inside the caption band (60-74 %).

## Common mistakes

From our coin short (rendered before 1.9, measured with the same pipeline on 27 faces) and the first 1.9 brand page:

| mistake | ours | target | fix |
|---|---|---|---|
| per-character skin tones | face #F1C8A2, L* 83 (75-88); skins L* 64-92 | one fill, L* 95 | `CastBrand.face` |
| round head | circle, H/W 1.00, n 2 | 0.945, n 1.85 (or the brand's) | `CastBrand.head` |
| heavy even outline | lit side 5.6 % W (2.2x), left/right ratio 1.0 | 2.6 % lit, 6.3 % shadow | `line { w, taper }` |
| doubled chin line | 11.5-12.9 % W at the chin (1.7x); the old second stroke was shifted upward | 0.071 | brand line law (no second stroke) |
| sleeve limbs | coloured tube plus two ink edges, about 18 % W (3.5x); legs ~20 % | 0.054 ink stroke | `limbs { mode: "ink" }` |
| skin fists | 16 % W in the skin colour | ink disc 0.12 | `hands { mode: "disc" }` |
| clip-art eyes | dots 0.147 W wide, 0.333 W apart, 0.16 W above the widest row, catchlights | 0.18 wide, 0.235 apart, on the row, none | `CastBrand.eyes` |
| hard face crescent | crescent edge at 0.075 d | soft ~8 L* ramp | `faceShade: "gradient"` |
| boxy narrow torso | rounded box 0.63 W | bean 0.75 W | `torso: "bean"` |
| cropped crowns | medium shot head 22 % of frame height, eyes at 30 % | 13 % / 44 % | `HEAD_FRAMING` (1.9) |
| front-only cast | front 93 %, three-quarter 7 %, no back or profile | 76 / 20 / 2 / 1 % | use `view: "three"`; back views not built |
| hidden brows (1.9 page 12) | the cap fringe ends 0.1-0.15 W above the eye centres and covers the brows in every expression but angry | hairline >= 0.25 W above the eyes | raise the fringe or lower the brows; brows drawn over the hair is not built |

## Sources

Private study: measured on the 20 newest shorts of a reference channel in this style, 35,987 frames, 2026-11-12
(799 faces at 1 fps, 850 character samples, 42 full-rate acting strips); background in `character-types.md` sections
3.2-3.8.
