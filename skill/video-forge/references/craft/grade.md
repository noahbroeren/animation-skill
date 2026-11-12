# Grade (craft sheet)

The grade is the last layer: it sets the black floor, the white ceiling, the middle and the saturation for each scene
type, and gives the darks their colour. The look is clean and saturated: lifted but coloured blacks, near-white
highs by day, more saturation as the light falls, blue as the largest hue family, no grain. The single most important
rule: grade per lighting key against that key's targets, never on the whole-video median.

Units: Y' = Rec.709 luma of the display image (0-1); saturation = mean HSV saturation; Lab = CIE L*a*b*; all statistics
with the burned-in caption band masked.

## At a glance

| rule | target (median, range) | how to check |
|---|---|---|
| black floor (Y' p1) | all .076 (IQR .048-.107); day .096 (.067-.137) | `vfa analyze` luma p1; per key `vfa keygap` |
| middle (Y' p50) | all .441 (IQR .296-.587); day .548; golden .425; night .297; interior day .551; interior night .237 | `vfa keygap` |
| white ceiling (Y' p99) | all .945; day .973 (≥ .94); golden .914; night .850 | `vfa keygap` |
| saturation (HSV mean) | all .454; day .435 (IQR .366-.506); golden .464; night .539; interior night .574 | `vfa keygap` |
| colourfulness (Hasler-Süsstrunk) | .276 | `vfa analyze` |
| contrast (Y' std) | .207 | `vfa analyze` |
| darks (darkest 15 %) | always coloured: a* +9..+15, b* from 0 (day) to −21 (night); never neutral grey | `vfa analyze` `shadow_a` / `shadow_b` |
| highs (brightest 10 %) | day faintly yellow b* +7; golden peach b* +20; night lilac-white a* +11, b* 0 | `highlight_a` / `highlight_b` |
| hue budget (pixels with C* > 15) | blue + violet (Lab 270-330°) 30-40 %; red-orange + orange (30-90°) ≤ 30 %; yellow + grass green (90-150°) ≥ 8 % when there are exteriors | hue snippet below |
| saturation against light | rises as luma falls: night and lamp-lit interiors +0.10..+0.14 over day | `vfa keygap` |
| vignette (side / centre luma) | day ≥ 0.95 (none); golden 0.90-0.97; night 0.86-0.91; interiors at night 0.65-0.90 | flat grey test frame |
| grain | none: σ 0.02 (8-bit) in flat areas; dither only | `vfa analyze` `grain_sigma` |

### Per scene type (per-frame medians, IQR in brackets)

| type | n | Y' p1 | Y' p50 | Y' p99 | sat | colourful | darks L* / a* / b* | highs L* / a* / b* |
|---|---|---|---|---|---|---|---|---|
| day exterior | 186 | .096 [.067, .137] | .548 [.448, .632] | .973 [.940, .984] | .435 | .317 | 27.9 / +9.2 / −0.1 | 89.6 / −0.6 / +7.0 |
| golden / sunset | 47 | .082 | .425 [.321, .497] | .914 | .464 | .279 | 18.3 / +13.6 / −8.1 | 83.2 / +6.1 / +20.2 |
| night exterior | 47 | .068 | .297 [.238, .377] | .850 | .539 | .273 | 13.6 / +13.9 / −20.9 | 73.7 / +10.9 / −0.2 |
| rain / storm day | 20 | .022 | .356 | .991 | .491 | .273 | — | — |
| storm night | 23 | .061 | .268 | .863 | .619 | .271 | 17.3 / +15.3 / −28.4 | 67.5 / +11.1 / −7.0 |
| interior day | 128 | .077 | .551 [.419, .654] | .965 | .368 | .262 | 21.0 / +10.4 / −7.4 | 91.0 / 0.0 / +2.6 |
| interior, warm lamp | 31 | .060 | .233 | .942 | .532 | .246 | 9.0 / +12.3 / −4.2 | 83.7 / +10.5 / +17.0 |
| interior night | 50 | .049 | .237 [.173, .320] | .865 | .574 | .245 | 7.7 / +13.0 / −17.8 | 76.7 / +10.7 / −0.3 |
| special (cutaway, insert) | 58 | .089 | .409 | .928 | .499 | .270 | — | — |
| all | 590 | .076 | .441 | .945 | .454 | .276 | 19.0 / +11.0 / −7.0 | 86.7 / +1.1 / +6.7 |

Lab hue anchors: red ≈ 40°, orange ≈ 65°, yellow ≈ 102°, green ≈ 136°, cyan ≈ 196°, sky blue ≈ 270°, blue ≈ 306°,
magenta ≈ 328°. Dark hues: day 359° (warm-neutral), golden 329° (plum), night 304° (blue), interior day 325° (mauve).

Hue shares of chromatic pixels (%):

| Lab hue | 0-30 | 30-60 | 60-90 | 90-120 | 120-150 | 150-240 | 240-270 | 270-300 | 300-330 | 330-360 |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 7.5 | 13.7 | 15.1 | 5.2 | 6.2 | 4.3 | 5.5 | 24.6 | 12.2 | 5.7 |
| day exterior | 4.8 | 13.8 | 22.3 | 6.3 | 15.3 | 4.5 | 10.0 | 18.8 | 2.7 | 1.5 |
| golden | 11.1 | 23.0 | 15.6 | 4.4 | 3.3 | 1.4 | 2.5 | 9.2 | 16.9 | 12.5 |
| night exterior | 3.6 | 4.7 | 3.3 | 0.8 | 1.6 | 1.3 | 1.6 | 52.4 | 25.8 | 4.9 |
| interior, warm lamp | 16.9 | 34.2 | 15.2 | 1.9 | 0.6 | 1.2 | 0.2 | 9.7 | 9.8 | 10.4 |
| interior night | 4.1 | 5.4 | 4.4 | 0.5 | 0.2 | 1.6 | 1.3 | 44.9 | 33.4 | 4.2 |

Across the 20 shorts the per-video means spread moderately (Y' mean .32-.60, saturation .33-.60) and none of the grade
numbers predicts views (Spearman |ρ| ≤ 0.27, p ≥ 0.25, n = 20). 19 of 20 shorts spend 0-48 % of their frames at night
and ≤ 42 % in cutaways; the two weakest by views were the outliers (68 % night, 71 % cutaway): a hint, not a rule.

## How it is built

1. **Light first.** The grade cannot make a pool or a window patch; a dark room is fixed with light
   (`craft/lighting.md`), not with gamma.
2. **One look per key.** Each lighting key carries its look; the look cross-fades with the key change (in OKLab).
3. **Black floor.** Lift the floor a little (output floor 0.02-0.04) so p1 lands at 0.07-0.10; the darks keep their
   colour because the floor and the shadow tint are coloured.
4. **White ceiling.** By day near-white highs (p99 ≥ 0.94); golden and night top out lower (0.91, 0.85).
5. **Middle.** Day p50 0.45-0.63; nights 0.24-0.38. Exposure and pivot move it; gamma is the last resort.
6. **Saturation.** About 0.44 by day, more at night and under lamps (0.53-0.62). Contrast also raises saturation
   (+7 % at 1.1, +15 % at 1.2), so lower `saturation` when you raise `contrast`.
7. **Coloured darks and highs.** Darks lean plum/mauve by day and blue at night; highs lean faintly yellow by day,
   peach at golden hour, lilac-white at night. Use the split-tone tints, not a global colour cast.
8. **Hue budget.** Plan the palette so blue and violet own about a third of the chroma (sky, water, night, shade),
   warm wood and brick stay under 30 %, and exteriors bring grass greens and yellows.
9. **Vignette only in the dark.** None by day; 0.25-0.45 at golden hour and at night.
10. **Clean image.** No grain, no chromatic aberration, no lens softness, no halation; a ±1 LSB dither against banding.

## Rules

1. Per key within the IQRs above: day p1 0.07-0.14, p50 0.45-0.63, p99 ≥ 0.94, saturation 0.37-0.51; night p50
   0.24-0.38, p99 0.78-0.94, saturation 0.44-0.63; interior night p50 0.17-0.32, saturation ≥ 0.5.
2. Darks are coloured: mean darks a* +9..+15 and b* 0..−21 by type (plum by day, blue at night); |a*| + |b*| > 8.
3. Day highs b* +4..+9 (faintly warm, not blue); golden highs b* +15..+25; night highs b* −7..+2.
4. Hue budget per short: blue + violet 30-40 % of chromatic pixels, red-orange + orange ≤ 30 %, yellow + grass green
   ≥ 8 % when exteriors are shown.
5. Night and lamp-lit frames are more saturated than day frames by ≥ 0.08.
6. Vignette: day side/centre ≥ 0.95; night and interiors 0.6-0.9.
7. Grain σ < 0.3 (8-bit) in flat areas; no film effects.
8. Tune each key on its own row of `vfa keygap`; after every change, re-read the rows that did NOT change.
9. Night ≤ 50 % and cutaways ≤ 45 % of a short's frames.

## In our engine

Looks live in `lib/look.ts`; the board picks one per lighting key (`LIGHT_KEYS[k].look`). The final pass is in
`lib/three/post.ts` (`FINAL`): exposure, tonemap, sRGB, S-curve (`contrast`, `pivot`), gamma, saturation and
vibrance, `shadowTint` x (1 − l)², `highlightTint` x l², optional zone tints, vignette, black/white floor, grain, dither.

| what | where (file / field) | 1.9 value | status |
|---|---|---|---|
| shared base | `toonBase` | tonemap `none` (hue-preserving clip), grain 0, bloom threshold 1.0 | built |
| day | `toonworld-day` | exposure 1.06, blackPoint 0.03, whitePoint 0.99, contrast 1.22 (pivot 0.5), saturation 1.32, vibrance 0.15, shadowTint [0.03, −0.01, 0.03], highlightTint [0, 0, −0.015], vignette 0.12 / 0.5 | built (1.9); re-measure on a render |
| golden | `toonworld-golden` | blackPoint 0.04, whitePoint 0.96, contrast 1.2, saturation 1.25, shadowTint [0.02, −0.01, 0.05], highlightTint [0.03, 0.01, −0.03], vignette 0.25 | built (1.9) |
| night | `toonworld-night` | blackPoint 0.02, whitePoint 0.94, contrast 1.15 (pivot 0.45), saturation 1.3, shadowTint [0, −0.01, 0.07], highlightTint [0.02, 0, 0.01], vignette 0.45 | built (1.9) |
| interior | `toonworld-interior` | blackPoint 0.05, whitePoint 0.99, contrast 1.1, saturation 1.2, shadowTint [0.04, −0.005, 0.02], vignette 0.3 | partly: one look for interior day (p50 .551) and interior night (p50 .237); the split is not built |
| dusk, rain, overcast, fog, office | `toonworld-dusk` etc. | design values from 1.6 | partly: not calibrated on the study |
| interior lift | `lib/board.tsx` `INTERIOR_LIFT` | gamma 1.22 on interior sets without a place `look` | partly: lifts the darks; prefer light |
| project / place / key tweaks | `Board.look`, `BoardPlace.look`, `tweak(key, look)` | — | built |
| look cross-fade | `lerpLook` (OKLab for colours) via the light plan | fade per key change | built |
| zone tints and zone saturation | `grade.tintS/M/H`, `zoneSat` | off | built |
| dither | `post.ts` `FINAL` | triangular ±1 LSB, per frame | built |
| hue-budget measurement | — | — | not built in `vfa`: use the snippet |

How to use it on a board:

```ts
const DAY = tweak("day", { grade: { saturation: 1.36 } });    // a project tweak on ONE key; re-measure only its rows
beats: [{ at: 0, key: DAY }, /* ... */],
places: {
  den: { set: "workshop", opts: { era: "old" }, look: { grade: { gamma: 1.0 } } },  // lit well enough: no interior lift
},
```

## Check

- `vfa analyze FINAL.mp4 --out QA` then `vfa keygap QA --plan timeline.json --ref FINGERPRINT`: one row per section;
  compare each with its scene type above. The "decided by" line names the section that sets each video-wide median.
- Hue budget on stills (one per beat, captions masked):

```python
import cv2, numpy as np
lab = cv2.cvtColor(cv2.imread("still.png"), cv2.COLOR_BGR2LAB).astype(float)   # 8-bit: a, b offset by 128
h0, h1 = int(lab.shape[0] * 0.58), int(lab.shape[0] * 0.76); lab[h0:h1] = 128   # mask the caption band
a, b = lab[..., 1] - 128, lab[..., 2] - 128
C, hue = np.hypot(a, b), np.degrees(np.arctan2(b, a)) % 360
m = C > 15
share = lambda lo, hi: round(100 * (m & (hue >= lo) & (hue < hi)).sum() / m.sum(), 1)
print("blue+violet", share(270, 330), "red-orange+orange", share(30, 90), "yellow+green", share(90, 150))
```

- **Failure looks like:** milky blacks (p1 > 0.11), grey mids (day p50 < 0.45), no near-white (p99 < 0.92 by day), a
  blue "filter" night (low saturation, neutral darks), orange-brown frames (red-orange > 40 % of the chroma), visible
  grain or a dark frame edge by day.

## Common mistakes

From our coin short (same scripts as the reference, frames scaled to 1080):

1. **Lifted blacks, grey mids, no near-white:** p1 0.116 / p50 0.352 / p99 0.903 against 0.076 / 0.441 / 0.945. The
   causes were gamma lifts of 1.26-1.46 on dark rooms and nights. Light the rooms; let the floor do the lifting.
2. **Dull and too warm:** saturation 0.403 against 0.454, colourfulness 0.230 against 0.276; mean b* +5.3 against +0.8
   (`vfa` warmth 0.118 against 0.046); highs a* +4.9..+8.1 against +1.9 (too magenta).
3. **Darks without blue:** darks b* −2.2 against −7.0. 1.9 moved `shadowTint` toward blue per key.
4. **Hue budget upside down:** red-orange + orange 48.7 % of the chroma (wood and brick rooms), blue + violet 28.1 %,
   yellow + grass green 0.8 % (target ≥ 8 %). Fix it in the sets and sky, not in the grade.
5. **Grading the median.** On an earlier short QA said "highlights too warm" (b* 11.1 against 5.8). Grading the day
   shots cooler three times did nothing to the number and pushed the day sections from +5.8 to −8.7; the cause was
   the night section, whose highs flipped from −0.8 to +14.3 when lamps began to light the set (`vfa keygap`).
6. **A project-wide override.** The coin board set `look: { grade: { saturation: 1.2, vibrance: 0.22 } }` to lift its
   wood rooms (colourfulness 0.19-0.20 against 0.29). `Board.look` and place looks REPLACE fields, they do not
   multiply: with the 1.9 looks that line pulls day (1.32), golden (1.25) and night (1.3) all down to 1.2.
   Tweak the key or the place that is low (`tweak`, `BoardPlace.look`), not all of them.

## Sources

Private frame study of the 20 newest shorts of a reference channel in this style (35,987 frames at 30 fps, 590
labelled full-resolution stills), 2026-11-12; background: `references/research/colour.md` (A1-A3, A5, C, D3),
`references/research/lighting.md` (A3, A4), `references/research/shading-lighting.md` section 4.
