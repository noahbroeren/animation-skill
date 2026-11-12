# Character design (craft sheet)

This is the guide for designing the channel's own cast with the `CastBrand` system. Viewers recognise a channel's
characters before they read a word, from a few constants that never change (the brand); single characters differ only
in role layers on top. The most important rule: choose one option per brand layer for the whole cast, and keep at most
2 of the 5 signature layers of the measured reference family (change at least 3, aim for 4).

Read `characters.md` first for how the reference family is built and measured. Units: `W` = outer head width; frames at
30 fps. A "200 px head" means 200 px wide at a 1080 px frame width (270 px at 1440, 400 px at 2160).

## At a glance

| rule | target (median, range) | how to check |
|---|---|---|
| one value per brand layer | 0 characters override a brand layer | every bobble under `Board.brand`; `BobbleSpec.face` at most a resting lid |
| signature layers changed vs the reference family | >= 3 of 5, aim for 4 | the trap table (step 2) |
| one signature law | 1, on a different axis than a light-driven thick-thin line | brand page, still 340 |
| silhouette test | every role named as a solid shape 64 px tall; mask overlap < 0.85 | silhouette pass, scaled still |
| face pop | face >= 20 L* above its local background in every shot (reference 28, 16-40) | day / golden / night beat stills |
| face fill | L* >= 85, chroma <= 6 (<= 12 when the tint is the change); one fill for every human | colour pick |
| features at a 200 px head | eye long side >= 0.15 W, short side >= 0.08 W; brows >= 0.045 W and visible; mouth >= 0.10 W; limbs >= 0.04 W | still 340 scaled x2.4 |
| identity budget | <= 1 hair/hat element + 1 torso colour + 1 prop or detail + 1 face accessory | cast list |
| face vs hair or hat | >= 15 L* apart; hairline >= 0.25 W above the eye centres | still 340 |
| expression set | 12-17 whole faces + 6 talk mouths + blink; the resting face is not lidded half-ovals | expression row |
| views | front 76 %, three-quarter (both sides) 20 %, back 2 %, back of head 1 %, profile 1 % (small) | turnaround row |

## How it is built

1. **Split brand from role.** Everything in the left column is set once in the `CastBrand`; everything in the right
   column is per character.

   | layer | brand (one value for the whole cast) | role (per character) |
   |---|---|---|
   | face card | one fill colour, head height/width and superellipse n | never |
   | ink and line law | ink colour, width, taper or another law | never |
   | limbs and hands | mode, width, hand shape | never |
   | face construction | eye type, size, spacing, height; brow and mouth style; nose, ears, shine, catchlight | the resting expression may differ (a smug one, a cheerful one); the marks do not |
   | torso shape, face shading | bean or box; gradient | build: slim / regular / stout |
   | proportions | adult height in heads; kids = same head on a 0.7x body | small height differences |
   | top of the head | - | hair style or hat: the main identity |
   | costume | - | one torso colour (L* 40-75) + one detail (collar, tie, apron, badge) |
   | prop and accessory | - | one prop; at most one of glasses, moustache, beard |

   One card colour for every human is a stylisation, not a skin tone. Origin, age and identity come from hair texture
   and style, clothing, names, builds and ages, never from exaggerated facial features (`character-types.md` 3.11).

2. **Pass the copy test: the five signature layers.** Any three of these together read as the reference family. Keep at
   most two.

   | # | signature layer | the reference family | counts as changed when | engine field |
   |---|---|---|---|---|
   | 1a | face fill | near-white, L* ~97, chroma ~3 | clearly tinted: chroma 6-12 at L* >= 88 | `face` |
   | 1b | head geometry | near-ellipse, H/W 0.93-0.96, n 1.75-1.95 | squircle n >= 2.6, egg H/W >= 1.1, or wide H/W <= 0.85 | `head { hw, n }` |
   | 2 | line law | plum-black, ~2.2x heavier away from the key | even width (taper 0) or another law (double line, halo); a new ink colour alone does not count | `ink`, `line { w, taper }` |
   | 3 | limb law | one ink-colour stroke ~0.054 W, ink-disc hands | limbs not in the ink colour, or hands not ink discs | `limbs`, `hands` |
   | 4 | eye default | lidded dark half-ovals 0.21-0.25 W apart, deadpan at rest | another eye type at rest AND spacing >= 0.30 W | `eyes` (FaceSpec), `baseLid` |
   | 5 | hair construction | solid cap with strand lines and one sheen arc | another treatment: flat shapes without strands or sheen, a geometric cut, a hat-first cast | `hairShine: "flat" \| "rim"` (`"arc"` = the reference's) |

   Layer 1 counts once (1a or 1b). Also never: rebuild a specific recurring character of the reference (its hair or
   hat, colour and prop combination) in any brand; fall back into our old traps, the "chibi sticker" (coloured sleeves
   3.5x too thick, skin fists, a skin face 14 L* darker, a 12 % chin line) or "clip-art" eyes (catchlight dots 0.33 W
   apart on a plain circle). Changing layers never excuses missing the readability numbers.

3. **Choose one signature law.** One rule that every character obeys and that a viewer feels without naming it. The
   reference's law is its light-driven thick-thin line; ours sits on another axis and must show in every shot at a
   200 px head. Pick one and keep the other layers quiet.

   | candidate | engine | status | watch |
   |---|---|---|---|
   | coloured even line (deep navy, teal or brown ink, constant width) | `ink`, `line { w: 0.035-0.045, taper: 0 }` | built | flat read: keep `faceShade: "gradient"` |
   | one geometry everywhere (squircle heads, the same corner rounding on props) | `head.n` 2.6-3.0; props have no shared field | partly | above n 3 heads read as screens |
   | limbs in the costume colour with face-colour ball hands | `limbs: { mode: "tint" }`, `hands: { mode: "ball" }` | built | the tint must stay visible against the torso and the ground |
   | tall pill eyes set wide | `eyes: "pill"`, spacing 0.32-0.36 of the face box | built | narrow side >= 0.08 W |
   | a thin light halo outside the ink line | - | not built | must not look like a sticker edge |
   | a double line (ink plus an inner colour line) | - | not built | busy at 64 px |

4. **Run the recognisability tests.**
   - **Silhouette at 64 px:** every role in front and three-quarter, solid fill, no inner lines, scaled so the figure is
     64 px tall. Each must be named, and no two masks may overlap more than 0.85 (IoU, `character-types.md` 3.2). The
     difference has to come from the head top, the torso outline and the prop: at 64 px there is no face.
   - **Face pop >= 20 L*:** on beat stills in a day, a golden and a night key, the face fill minus a ring 0.2 W around
     the head. Fix a failure in the set (a darker wall, a move, another key), never by darkening the face.
   - **Features at a 200 px head:** every expression named correctly at arm's length on a phone, with the minimum sizes
     from the table above.
   - **Family test:** our cast next to the `calibration` row at 64 px and at 200 px. Nobody who knows the reference may
     take ours for it at either size.
   - **Blank test:** two roles with no hair, no hat and a grey torso must still read as OUR family (the brand carries)
     and must be impossible to tell apart (the face is not the identity).

5. **Design process, step by step.**
   1. *Moodboard of rules, not pictures.* In 6-10 lines: what the channel promises; the cast's temper (deadpan, warm,
      frantic); one shape word (round, square, angular); the eras and roles the stories need; the world's dominant hues
      (role colours avoid them); the signature law candidate; the reference layers we will not keep. Pictures of other
      channels' characters stay out of the repository.
   2. *One option per layer.* Fill in the worksheet below; stop if fewer than 3 signature layers changed.
   3. *Build the `CastBrand`* as a constant in the project and set `Board.brand`. Role specs keep only role fields.
   4. *Render the turnaround and expression page:* add `row("ours", OURS)` to `page12()` in
      `engine/src/projects/charsheet/index.tsx` and run
      `node tools/render.mjs --project charsheet --format long --stills 340`. Page 12 shows three roles in front,
      three-quarter and side, nine expressions, a point and a cheer, next to `bobble`, `calibration` and `example`.
   5. *Test at phone size:* the heads on page 12 are about 85 px wide (a wide-shot size); for the 200 px test scale the
      still x2.4 and look at it on a phone at full width; then run the tests of step 4 on three real beat stills.
   6. *Iterate one layer at a time:* change one value, re-render still 340, note the change and the test result. Expect
      3-6 rounds.
   7. *Lock:* freeze the brand with a version id before the first published video (later changes = a new id), note it
      in the series bible, then build the role cast and the expression set (step 6).

   ```
   layer            | our choice              | reference family                 | changed?
   1a face fill     |                         | near-white, chroma ~3            |
   1b head          | hw = , n =              | 0.945, 1.85                      |
   2  line law      | ink = , w = , taper =   | plum-black, light-tapered        |
   3  limbs / hands | mode = , w = / hands =  | ink stroke 0.054, ink discs      |
   4  eye default   | type = , spacing =      | lidded, 0.235 W apart            |
   5  hair          |                         | cap + strands + sheen            |
   signature law    |                         | light-driven thick-thin line     |
   ```

6. **Turnaround and expression set every main character needs** (shares measured on the reference; secondary roles can
   skip back views and the rare faces).

   | view | share of character shots | used for | engine |
   |---|---|---|---|
   | front | 76 % | default, dialogue, reactions | `view: "front"` built |
   | three-quarter, left and right | 20 % (37 % of medium close-ups) | two characters facing each other, pointing, walking | `view: "three"`, `facing: 1 / -1` built |
   | back, three-quarter back | 2 % | walking away, working at something, climbing | not built |
   | back of the head (over the shoulder) | 1 % | a foreground head looking at the scene | not built |
   | profile | 1 %, small figures only | riders, walkers, silhouettes | `view: "side"` built |
   | lying face-up, chin-up, seated, bent forward 30 degrees | top-down 3 %, low angle 4 % of shots | angle shots | seated (`sit`) built, others not |

   Each view is its own drawing; a prop stays in the same hand on both three-quarter sides.

   | slot | reference share | engine `expr` | our rule |
   |---|---|---|---|
   | resting face | ~55 % of faces (the reference rests on lidded eyes) | `neutral` with the brand's eyes | one per cast; never lidded half-ovals |
   | smug / sly, deadpan / bored | part of the resting family | `smug`, `deadpan` | |
   | happy, laugh | closed eyes 13 % (with sleepy and blinks) | `happy`, `laugh` | |
   | shock / alarm | white eyes 11 % | `shock` (uses `brand.shock`) | |
   | worried | - | `nervous` | |
   | angry, effort | teeth on 17 % of large faces | `angry`, `determined` | |
   | sad, crying | - | `sad`, `cry` | |
   | skeptic, scheming | mixed eye states 12 % (wink, skeptic) | `think`, `scheming` | |
   | embarrassed, disgust | - | `embarrassed`, `disgust` | blush only here |
   | wink, asleep, dizzy, rage take | rare | - | not built |
   | talk mouths (6) | quoted lines only | `cue` (Rhubarb A-H) | narration never moves a mouth |
   | blink | 2 frames shut, every 12-45 f on faces >= medium shot | 4 soft frames | 2-frame blink not built |

7. **Worked example: `BRANDS.example`, layer by layer.** (Values as of 1.9; `kinds.ts` is the source of truth. The face
   box is 0.94 d, so FaceSpec numbers x 0.94 = head widths.)

   | layer | code | on the head | vs the reference family | changed? |
   |---|---|---|---|---|
   | 1a face fill | `face: "#FBF6EE"` | L* 97, chroma 4 | the same near-white (difference under 2 dE) | no |
   | 1b head | `head: { hw: 0.92, n: 2.7 }` | a squircle, slightly wide | ellipse 0.945 / 1.85 | yes |
   | 2 line law | `ink: "#1C2440"`, `line: { w: 0.038 }` | even navy line 0.038 d (L* 15, chroma 20) | plum-black, tapered | yes |
   | 3 limbs, hands | `limbs: { mode: "tint", w: 0.075 }`, `hands: { mode: "ball", size: 0.15 }` | strokes 0.075 d in the costume colour 30 % darker; face-colour balls 0.15 d with an outline | ink strokes, ink discs | yes |
   | 4 eyes | `eyes: "pill", eyeSize: 0.115, eyeSpacing: 0.34, eyeY: 0.46, catchlight: true` | open pills 0.108 x 0.205 d, centres 0.32 d apart, on the widest row, with catchlights | lidded, 0.235 apart | yes |
   | brows, mouth | `brows: "thick", browScale: 1.1`, `mouthWidth: 0.24, mouthY: 0.68` | brows ~0.096 d thick, ~0.17 d long; mouth 0.23 d wide, 0.21 d below the eyes | - | - |
   | shock | `shock: { eyes: "whites", eyeSize: 0.2, eyeSpacing: 0.34 }` | white eyes 0.19 x 0.23 d | rings 0.22, close | - |
   | 5 hair | engine default | cap with a zigzag fringe and one sheen arc, no strands | cap, strands, sheen | partly, not by design |
   | quiet layers | `torso: "bean"`, `faceShade: "gradient"`, `shine: true`, no ears, no nose | | | |

   Result: 4 of 5 signature layers changed, all readability minimums met (eye 0.205 x 0.108 d, brows 0.096 d, limbs
   0.075 d). Weak points to fix in our real brand: the face fill is the reference's; two loud candidates (navy line AND
   tinted limbs) compete for the signature law; the brows sit ~0.19 d above the eyes and hide under the cap fringe. It
   is an example of the method, not the channel's brand.

## Rules

1. A brand sets one value for every layer: face fill, ink, head, line law, limbs, hands, eye default, torso shape, face
   extras, face shading. No character overrides a brand layer.
2. Change at least 3 of the 5 signature layers (layer 1 counts once); a new ink colour alone does not change the line law.
3. Face fill L* >= 85 and chroma <= 6 (up to 12 when the tint is the layer-1 change); one fill for every human; not a
   skin tone.
4. Face >= 20 L* above its local background in every shot, in every lighting key.
5. Silhouette test at 64 px passes: every role named; mask IoU between any two < 0.85.
6. At a 200 px head: eye long side >= 0.15 W, short side >= 0.08 W; brows >= 0.045 W thick and visible; mouth
   >= 0.10 W; limbs >= 0.04 W; hands >= 0.10 W.
7. Line width 0.03-0.045 W for an even line; no part of any line thinner than 0.022 W.
8. Hairline >= 0.25 W above the eye centres; face and hair/hat >= 15 L* apart.
9. Identity budget: <= 1 hair/hat element + 1 torso colour + 1 prop or detail + 1 face accessory per character.
10. Torso colours L* 40-75; each role in a story has its own hue; no role colour on the world's dominant hue.
11. Exactly one signature law, on an axis other than a light-driven thick-thin line.
12. Expression set: 12-17 whole faces + 6 talk mouths + blink; the resting face is not lidded half-ovals.
13. Views: front, three-quarter both sides, back, back of head; profile only for small figures.
14. A brand is frozen after the first published video; changes get a new version id.

## In our engine

| what | where (file / field) | 1.9 value | status |
|---|---|---|---|
| house style type | `CastBrand` (`lib/characters/kinds.ts`) | face, ink, head, line, limbs, hands, eyes, shock, torso, ears, nose, shine, faceShade, hairline, hairShine, heads | built |
| fringe height | `CastBrand.hairline` (face widths above the eye centres) | unset = the old low fringe (~0.07 W, brows hidden); 0.25-0.32 in the drafts | built: lifts the cap / spiky fringe and the hairline points of every style, short sideburns |
| hair treatment | `CastBrand.hairShine` | `"arc"` (default), `"flat"`, `"rim"` (a darker band along the hairline) | built |
| proportions | `CastBrand.heads` | 3.4 default; a spec's own `heightHeads` wins | built |
| hair volume and strands | `CastBrand.hairVolume`, `hairStrands` | 1.045 / 0; round 3: 1.13 / 6 | built: strands flow from the crown to the hairline (front, three-quarter, profile) with a lit-crown ramp; with strands on, layer 5 counts as kept |
| colour running | `CastBrand.blend` (`Ctx.blend` in `part()`) | 0 = hard cel crescent; 0.9 in round 3 | built: blurs the crescent edge on clothes, hats and props drawn with `part()` |
| mitten hands | `hands: { mode: "mitt" }` | ink mitten with a thumb, size 0.15 | built: black hands that are not ink discs (layer 3 changed) |
| brow width | `FaceSpec.browW` (face line widths) | 1.5 in round 3 | built |
| hair and hats follow the head | `bobbleHair(..., lift, n)`, a y-scale by `head.hw` | front and profile crowns trace the brand's superellipse; egg heads get taller hair, hats ride on the crown, the card makes room | built |
| copy test + readability numbers | `brandReport(brand)`, `brandNote(brand)` (charsheet) | layers changed / kept, face L* and chroma, eye, brow, hairline, fails | built: printed beside every page-13 row |
| apply to a cast | `Board.brand` (`lib/board.tsx`) | every bobble without its own `brand` | built |
| measured family | `BRANDS.calibration` | see `characters.md` | built; engine tests only, never publish |
| example house style | `BRANDS.example` | step 7 | built; not final |
| role fields | `BobbleSpec` hair, hat, top, legs, shoes, beard, stache, glasses, neck, build | `skin` is ignored when `brand.face` is set | built |
| per-character face tweak | `BobbleSpec.face` (wins over `brand.eyes`) | - | built; at most a resting lid (`baseLid`), never the eye type or spacing |
| brand page | `page12()` in `projects/charsheet/index.tsx`, still 340 | rows bobble, calibration, example | built |
| our brand directions | `BRAND_DRAFTS` + `page13()`, still 370 | A block, B egg, C wide, D bold (same three roles in every row) | built; round 2 |
| round 3 | `BRAND_A3` + `page14()` (still 400) | A3, A3 mitt, A3 big head | built |
| **our locked cast** | `BRANDS.ours` (id `ours-v1`), close-up `page15()` (still 430), sheet `page16()` (still 460), `references/sheets/our-cast-v1.jpg` | A3 big head: 3.2 heads, squircle head, near-white card, black ink limbs, lidded eyes with a catchlight, combed hair, blend 0.9 | locked 2026-11-12; a change gets a new id (`ours-v2`) |
| silhouette view | `PassSpec { pass: "silhouette" }` (`drawAnyStyled`) | used on page 2 | partly: no brand silhouette row, no IoU check |
| face-pop check | - | - | not built (no face lead gate in QA) |
| other line laws (halo, double line) | - | - | not built |
| back, three-quarter back, lying, chin-up views | `KPose.view` | front / three / side | not built |
| expressions | `KEXPRS_ALL` (`faces.ts` `FACE_X_EXPRS` + `EX_X`) | 118 faces (wink, asleep, dizzy, love, sick, rage, ...), 25 eye kinds, 51 mouths, 48 face effects; 4-frame blink | built; 2-frame blink not built |
| skin marks and conditions | `BobbleSpec.marks`, `KPose.skin`, an expression's `skin` (`faces.ts` `SKIN_X`) | 52: freckles, stubble, wrinkles, eyebags, scar, lashes, lipstick, sunburn, sick, pale, frozen, soot, blackeye, ... | built |
| hair styles | `hair.ts` `HAIR_X` (+ the 10 in kinds.ts) | 62 styles in front, three-quarter and profile | built |
| wardrobe | `wardrobe.ts`: `HAT_X`, `TOP_X`, `PATTERN_X`, `NECK_X`, `PROP_X` | 73 hats, 55 tops, 18 prints, 21 neckwear, 103 held props | built |
| our cast | `ours.ts` `OUR_CAST`, `castEntry`, `signaturePose`, `extra(seed)`; bible `references/cast/ours-v1.md` | 111 characters (14 core) + endless extras; core silhouettes at 64 px overlap at most 0.78 | built |
| brand in the series bible | `templates/series-bible.json` | no brand field | not built |

```ts
import { BRANDS, CastBrand, BobbleSpec } from "../../lib/characters/kinds";
// our house style: start from the example, then change layers one at a time (see the worksheet)
export const OURS: CastBrand = { ...BRANDS.example, id: "ours-v1",
  face: "#E6F2FF",                      /* 1a: tinted card colour, L* 95, chroma 8 */
  line: { w: 0.04 },                    /* 2: even line, the signature law */
  limbs: { mode: "tint", w: 0.07 },     /* 3: costume-colour strokes */
};
// a role = brand + hair or hat + one torso colour + one detail + one prop
const baker: BobbleSpec = { id: "baker", kind: "bobble", skin: "#ffffff" /* ignored under a brand face */,
  hat: { style: "chef", color: "#fbfaf6" }, top: { color: "#d9822b", style: "apron", accent: "#f4efe6" }, stache: "#4a3020" };
const board: Board = { id: "ID", title: "...", words: WORDS, brand: OURS, cast: { baker: { spec: baker } }, places, beats };
```

## Check

- **Turnaround and expressions:** `node tools/render.mjs --project charsheet --format long --stills 340`, page 12, with
  a row for our brand. Fail: brows hidden, eyes that read as specks, roles that differ only by colour.
- **Silhouette at 64 px:** render our roles with `pass: { pass: "silhouette", fill: "#000000" }` cells (as page 2
  does), then scale the still so the figures are 64 px tall (`ffmpeg -i f000340.png -vf "scale=iw*0.23:-1:flags=area"
  sil64.png`; page-12 figures are ~280 px tall). Fail: two roles you cannot name apart, or a hat that merges with the
  head into one blob.
- **Phone size:** scale still 340 x2.4 (heads ~200 px) and view it on a phone at full width. Fail: an expression you
  have to guess. A medium close-up on a 6.1-inch phone shows the head at ~110 px: busts at that size on a mid-tone wall
  (L* ~59) are the realistic check; page 13's heads (75-95 px) are already close to it.
- **Copy count and minimums in one line:** `brandReport(brand)` (page 13 prints it per row). Fail: fewer than 3
  changed, or any entry under `fails`.
- **Face pop:** three beat stills of a real board (`node tools/make.mjs --project ID --from board --to stills`) in day,
  golden and night keys; colour-pick the face and the ring around it. Fail: under +20 L*.
- **Copy count:** fill in the worksheet in step 5 and count the changed signature layers. Fail: fewer than 3.

## Common mistakes

| mistake | where | what we saw | fix |
|---|---|---|---|
| no brand | coin short, before 1.9 | 8 characters, 6 skin colours (L* 64-92), measured faces L* 83: the cast had no family read and faces sat 14 L* under the reference | one `CastBrand` per cast |
| chibi sticker | coin short | sleeve limbs ~18 % W (3.5x), skin fists 16 % W, a 12 % W chin line | brand limb and line laws |
| clip-art eyes | coin short | catchlight dots 0.147 W wide, 0.33 W apart, 0.16 W above the widest row | a designed eye default on the widest row |
| eyes too small for the sheet | first render of `BRANDS.example` | pill eyes 0.08 d wide with thin line brows: on page 12's ~85 px heads they read as specks | eyeSize 0.115 and thick brows (current values) |
| brows under the fringe | page 12, all three rows | brows ~0.19 d above the eyes, the cap fringe ends 0.10-0.15 W above them | raise the fringe or lower the brows (rule 8) |
| hair ignores the head shape | page 13 round 1 | an egg head (H/W 1.16) rose above the cap; squircle corners poked out beside a round crown; the lifted fringe left long sideburn tabs | the crown follows the brand superellipse and `hw`; a lifted fringe gets short sideburns |
| four directions that look alike | page 13 round 1 | only line colour and eye type differed; the shared hair and jacket carried the read | push every brand layer of a direction the same way (geometry, line, limbs, eyes, hair, height) |
| ghost lids | page 14 first render | the upper half of lidded dark eyes was painted over with a flat skin colour; on a gradient face it showed as a pale ring above the lid | clip the eye under the lid line, never paint skin over it |
| strands as a fan | page 15 first render | every strand started at one parting point: the hair read as a pumpkin | start the strands spread along the crown, end them spread along the hairline |
| layer 1 changed by accident only | `BRANDS.example` | the fill is the reference's near-white; only the squircle changes layer 1 | decide the fill and the geometry separately in the worksheet |

## Sources

Private study: measured on the 20 newest shorts of a reference channel in this style, 35,987 frames, 2026-11-12
(799 faces, 850 character samples); design background in `character-types.md` sections 3.1-3.11.
