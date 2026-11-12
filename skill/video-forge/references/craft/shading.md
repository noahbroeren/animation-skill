# Shading (craft sheet)

Shading turns the set into painted objects: flat lit planes, a soft terminator, flat shade plateaus, and shadows that
keep the surface's own colour. The characters are flat cards that take the key light's colour as a tint and stay
bright. The single most important rule: a cast shadow on a lit-facing surface and a form shadow on a turned-away face
are two different things (about 45 % and 22 % of the light), never one shared shade term.

Units: frames at 30 fps; W = frame width; u = 1 px at a 1080 px short side. Ratios are linear luminance (shade / lit on
the same material); Lab values are CIE L*a*b* of the display image.

## At a glance

| rule | target (median, range) | how to check |
|---|---|---|
| cast shadow on a lit-facing surface | 0.45 (IQR 0.35-0.54, n = 574 frames); day 0.49, golden 0.45, night 0.39, interiors lit by lamps 0.36 | lit/shade snippet below |
| form shadow (face turned away from the key) | 0.22 (IQR 0.08-0.37, n = 537); never below 0.07 | same, across a plane change |
| cast-shadow tint (channel multiplier ÷ luminance ratio, R/G/B) | day 1.01 / 0.99 / 1.03; all keys 1.02 / 0.98 / 1.11; night 0.96 / 0.99 / 1.23 | same snippet, per channel |
| hue of the shade | rotated toward Lab hue ≈ 290-300°: reds and oranges −10..−12°, greens and cyans +11..+14°, yellows within ±4° | Lab of both sides |
| saturation in shade | HSV +0.07 (cast), +0.12 (form); Lab chroma x 0.84 | same |
| white surface in shade | lit L* 90 → shade L* 48, a* +5.3, b* −3.9 (mauve-grey, #786f79) | Lab |
| low-sun cast shadow | a replacement blue-violet: L* 20-35, b* −20..−30 (#333363 to #524e73) | Lab |
| terminator on matte curved forms | ≈ 12 % of the form's width (10-15 %) | luminance profile across the object |
| lit side | flat: gradient ≤ 0.1 L*/u inside a face; boxes get one value per face | profile |
| soft shadow edge (10-90 %) | 9.9 u (IQR 8.8-10.8) ≈ 0.9 % of W | profile across a cast-shadow edge |
| metals | continuous gradient plus one specular band 10-30 % of the object; darkest L* ≥ 19 | profile |
| faces on cards | day L* 89-100, C* ≤ 4 (n = 5); lamp L* 87-94, b* +15..+30 (n = 3); night L* 74-84, pink-lilac a* +13..+27 > \|b*\| (n = 3); no rim line | Lab on the forehead |

## How it is built

1. **Flat albedo.** One colour per material with a low painted drift (±3 %); texture detail comes from painted lines
   (`craft/textures.md`), not from shading.
2. **Form term.** N·L through a soft ramp that spends about 12 % of a round form going from lit to shade. Above the
   ramp the lit side is flat (no Lambert falloff), below it the shade side is a flat plateau. No visible third band,
   no coloured line on the terminator.
3. **Cast term.** The shadow map gets its own threshold, so a cast-shadow edge keeps the same softness on the ground
   and on a wall. The edge spreads over about 10 u at 1080.
4. **Cast colour.** Shade = lit colour x a near-neutral multiplier (day ≈ 0.47 / 0.46 / 0.48 per channel): the surface
   keeps its hue, gets a little more saturated and rotates slightly toward blue-violet, because sky fill still reaches
   it. White reads mauve-grey.
5. **Form colour.** A face turned away from the key gets about 22 % of the lit value: albedo x shade colour x sky fill
   on up-facing faces and ground bounce on down-facing ones. A box reads as three flat values (for example top 1.0,
   sides 0.25, underside 0.17 in linear light).
6. **Low sun.** At golden hour and sunset the cast shadow on warm ground is not a darker ground colour but a painted
   blue-violet (its blue channel can be BRIGHTER than the lit ground's: x 1.28 measured), which no light multiplier can
   make.
7. **Night.** Same multiplier with a stronger blue (B x 1.23); shadows stay coloured, never black.
8. **Facets.** Low-poly props (staves, buttons, rocks) show one tone per facet; that is part of the look.
9. **Metals.** Iron, copper and gold keep a physical gradient (for example L* 85 to 25 over 200 u) with one broad
   specular band and a dark reflection band; hero gold props can be fully physically shaded with hot speculars and
   4-point star glints (`craft/effects.md`).
10. **No ambient occlusion band.** Neither our study nor an outside study saw screen-space AO; grounding comes from cast
    shadows and contact shadows.
11. **Cards take light by rule, not by geometry.** The white face fill is multiplied by the key's tint with its
    luminance held (faces stay bright), a soft gradient darkens the side away from the key by 14-16 % across the
    head, a card in cast shadow takes the scene's shade tint lifted toward white, local lamps add a capped pool, and
    there is no rim line. A card that walks out of a shadow brightens over about 15 f. Contact: a soft blob by day; a
    long soft silhouette in the replacement colour at low sun. A dark backlit silhouette (face L* ≈ 39) is a deliberate
    beat, not the default.
12. **Rim only when motivated.** 8 of 20 shorts show a thin key-coloured rim on heads or silhouettes in some shots,
    always from a lamp, a screen, a fire or a low sun behind; never in plain daylight.

## Rules

1. Cast-shadow ratio on lit-facing surfaces 0.45 ± 0.05 by day (exterior and interior), 0.40 ± 0.05 at night,
   0.36 ± 0.05 in lamp-lit interiors.
2. Form-shadow ratio 0.22 ± 0.07; never below 0.07.
3. Cast-shadow tint: by day B/G ≤ 1.06 and R/G 1.00-1.04; at night B/G 1.20-1.30; never above 1.3 except the low-sun
   replacement.
4. White in day shade: a* +3..+7, b* −2..−6, L* 45-55 when lit L* is 90.
5. Low sun in frame: cast shadows on warm ground use the replacement colour (L* 20-35, b* −20..−30).
6. Terminator 10-15 % of the form's width; lit plateau ≤ 0.1 L*/u; one value per face on boxes; terminator colour
   band, if any, invisible (≤ 0.08 strength).
7. Metals: one specular band 10-30 % of the object, darkest L* ≥ 19.
8. No AO band visible in a still; corners and contacts darken only through cast shadows and contact blobs.
9. Faces: L* ≥ 84 by day and in interiors, ≥ 74 at night, except a deliberate backlit silhouette. Tint chroma
   C* ≤ 4 by day, 15-30 under lamps (b* > 0), 14-30 at night with a* > |b*| (pink-lilac, not blue).
10. No rim line on heads by day; a motivated rim (practical or low sun behind) stays thin and takes the source colour.
11. Characters shade by rule (tint, side gradient, shade tint, contact shadow); never real 3D shading on a 2D card.

## In our engine

| what | where (file / field) | 1.9 value | status |
|---|---|---|---|
| form ramp | `lib/three/shaders.ts` `TOON_SETUPS[k].rampLo / rampHi` | 0.02 / 0.60 for day, golden, interior, interiorWindow; night 0.15 / 0.40; dusk 0.12 / 0.40; sunsetBack 0.10 / 0.30 | built for the measured keys; night, dusk and sunsetBack ramps are narrower and not measured |
| cast multiplier (linear) | `ToonSetup.castMul` → `uCastMul` | day [0.44, 0.43, 0.46]; golden [0.42, 0.37, 0.47]; sunsetBack [0.40, 0.34, 0.48]; night [0.34, 0.35, 0.44]; interior [0.34, 0.32, 0.42]; interiorWindow [0.43, 0.43, 0.49]; rain [0.42, 0.44, 0.48]; dusk [0.36, 0.32, 0.46]; others [0.44, 0.43, 0.46] | built (1.9); re-measure on a render |
| cast threshold | `TOON_FRAG_BODY` `castT` | smoothstep(0.32, 0.68, sunVis x cookie) | built |
| form shade | `shadeMul` x 2 x mix(`bounce`, `skyFill`, up) | day #86828e with sky #bcbcc2 / bounce #b4b0ac | built |
| shade saturation | `shadeSat` | 0.15 day, golden; 0.2 night, interior | built |
| low-sun replacement | `shadeReplace` / `shadeReplaceAmt` | golden #3a3a6e 0.65; sunsetBack #333363 0.75; dusk #2a1f5c 0.40; night #2a2f6a 0.15 | built |
| terminator band | `term` / `termColor` | day 0.06, golden 0.08, night 0.05, interior 0.06; interiorWindow 0.10 (default), dusk 0.10, sunsetBack 0.18 | partly: three setups above rule 6 |
| painted drift | `drift`, `uDriftScale` | 0.03, 0.12 | built |
| ambient | `ambient` | 0.06 (overcast, rain, fog 0.20-0.30) | built |
| metals | — | the toon block drops the specular term | not built: keep a metal physically shaded with `material.userData.toon = true` before `toonifyScene` (needs light to reflect) |
| ambient occlusion | `lib/look.ts` toonBase `ao` | enabled, strength 0.5, radius 0.55 m, tint #7c6a92 | mismatch: the reference shows no AO band; test 0-0.2 and re-measure |
| card tint per key | `cardTint`, `cardTintMix` → `CARD_U.uTint`, `uTintMix` | day #ffffff 0.55; golden #ffe2c0; sunsetBack #ffc79a; night #f0c4dc 0.85; interior #ffe0b4 0.85; dusk #f0c8e0 0.85; interiorWindow #f4f0f6; rain #dde6ee | built; the tint is luminance-normalised |
| card brightness | `cardShade` (shaders.ts) | the card does not follow the key's intensity, only its tint | partly: night faces may land above L* 84; measure |
| card in cast shadow | `CARD_U.uShadeC` | the key's `shadeMul` lifted 62 % to white (day ≈ 0.71 linear) | built |
| card side gradient | `CARD_U.uGrad`, `uSide` | 0.32 (≈ 16 % darker on the far side), (0.92, 0.90, 0.96) | built |
| card rim | `uRimA` = `rim` x 0.15 | day 0.018, golden 0.045, night 0.03, sunsetBack 0.083 | built (no rim line); a per-shot motivated rim is not built |
| lamps on cards | `cardShade` local-light band | capped at 0.3 | built |
| backlit card | — | — | not built |
| contact shadow | `lib/three/cast.ts` `blob`, `shadowCaster` | neutral blob 0.45 x 0.30 of the card height, offset away from the sun; full-silhouette caster turned to the sun | built |
| face construction (crescent or gradient shading, line taper toward the shadow side) | `characters/kinds.ts` `CastBrand.faceShade`, `line.taper` | per brand | built (character sheets) |

How to use it: build a variant of a setup and give it to a key; exclude a hero metal from the toon block.

```ts
import { TOON_SETUPS, ToonSetup } from "../../lib/three/shaders";
const lampRoom: ToonSetup = { ...TOON_SETUPS.interior, castMul: [0.36, 0.34, 0.44], term: 0.05 };
const KEY = { ...LIGHT_KEYS.interiorWarm, toon: lampRoom };          // board: { at: "inside", key: KEY }
// a gold prop that should keep its specular (inside a board prop factory)
gold.material.userData.toon = true;                                  // toonifyScene() leaves it to three.js lighting
```

## Check

Sample a flat surface on both sides of a shadow edge on a full-resolution still (PNG, captions masked):

```python
import numpy as np, PIL.Image as I
im = np.asarray(I.open("still.png").convert("RGB"), float) / 255
lin = np.where(im <= 0.04045, im / 12.92, ((im + 0.055) / 1.055) ** 2.4)
def mean(y0, y1, x0, x1): return lin[y0:y1, x0:x1].reshape(-1, 3).mean(0)
lit, sh = mean(900, 940, 200, 260), mean(900, 940, 320, 380)       # same material, lit vs shadow
Y = lambda c: c @ [0.2126, 0.7152, 0.0722]
r = Y(sh) / Y(lit); print("ratio", round(r, 3), "tint", np.round(sh / lit / r, 2))
```

- Cast shadow by day: ratio 0.40-0.50 and tint B ≤ 1.06; a turned-away face: 0.15-0.29.
- Faces: Lab of a forehead patch per key against rule 9.
- `vfa analyze` reports `shadow_a` / `shadow_b` (darkest 20 %) and `vfa keygap` splits them per key.
- **Failure looks like:** dark blue cast shadows that eat the ground colour (ratio < 0.35, tint B > 1.2 by day),
  muddy brown shadows at sunset, a visible orange line along the terminator, a grey halo in corners (AO), a rim line
  on heads in daylight, or faces that drop to mid-grey in a room.

## Common mistakes

From our coin short and the reviews before 1.9:

1. **One shared shade term.** Every cast shadow became a dark blue form shade: ratio 0.277 against 0.447 (1.6x too
   dark) and tint 1.07 / 0.95 / 1.29 against 1.02 / 0.98 / 1.11. 1.9 split the terms (`castMul`).
2. **Neutral surfaces too magenta in shade:** a* +7.5 / b* −4.6 against +5.3 / −3.9.
3. **Tuning shade by eye.** Across review rounds the darks went b* −4.3 → −0.06 → −1.65 (target −5.4) as the shade was
   made "neutral", then "cool". Tune `castMul` / `shadeMul` against the measured tint, one key at a time.
4. **Violet shade everywhere at golden hour.** A violet shade colour read as mud on warm floors. The measured rule is
   narrower: the replacement colour belongs to LOW-SUN CAST shadows only; form shade keeps the surface hue.
5. **Rim on cards.** In 1.8.1 the card rim went up to 0.32-0.42 and lit the ink outline like a grey sticker edge; the
   reference has no rim line, so 1.9 keeps a trace (x 0.15).
6. **What was already right:** form ratio 0.220 against 0.218 and shadow edge 10.1 u against 9.9 u. Leave them.

## Sources

Private frame study of the 20 newest shorts of a reference channel in this style (35,987 frames at 30 fps; 129,745
automatic lit/shade edge pairs; about 60 hand profiles), 2026-11-12; cross-checked against an outside study of the same
channel; background: `references/research/toon-shading.md` (A1, A4, B3-B6, B15), `references/research/lighting.md`
(A6, C), `references/research/shading-lighting.md`.
