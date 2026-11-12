# Depth (craft sheet)

Depth in this style comes from three things: depth of field chosen per shot (on for close shots and inserts, off for
medium and wide shots), aerial haze that pulls far objects toward a horizon colour set by the lighting key, and glow
that only real light sources get. The image stays clean: no grain, no lens effects. The single most important rule:
the depth of field is a shot decision; it never drifts or pulls inside a shot unless the story moves the focus.

Units: frames at 30 fps; u = 1 px at a 1080 px short side; W = frame width. "Edge spread" = 10-90 % width of a strong
edge (a sharp edge measures 1.1-1.6 u at 1080); σ = Gaussian blur radius; r = blur-disc radius.

## At a glance

| rule | target (median, range) | how to check |
|---|---|---|
| close-up, medium close-up, extreme close-up | background edge spread 17-23 u (σ 7-9 u, disc r 12-17 u); subject 1.5-3 u | edge snippet below |
| macro insert (a small prop filling the frame) | background spread ≥ 31 u (σ ≥ 12, r ≥ 22) | same |
| medium (waist-up with the room), full, wide | sharp: ≤ 1.6 u | same |
| share of shots with depth of field | about 1/3 | board shot sizes |
| centre / border sharpness (`dof_ratio`) | 1.9 (1.77-2.14, 4 shorts) | `vfa analyze` |
| focus pulls inside a shot | rare: 2 of 20 shorts, 10-15 f each | stills every 3 f |
| foreground framing objects | blurred by the near field; foreground particles as soft discs 0.02-0.06 W (5 of 20 shorts) | still |
| aerial haze by day | far objects 50-70 % of the way to a pale-blue haze (lighter than the sky near the horizon); mid ground desaturated (C* ≈ 13) | Lab of far objects against the sky |
| haze per key | golden: warm peach or cream; dusk: pink-violet; night: lavender-violet ground fog; visible in 10 of 20 shorts | stills per key |
| bloom | only on emissive sources: halo 50 % at 1.6-2 x the source radius, 10 % at 3-4 x; practical halos 1.3-3 x the lamp | radial profile around a lamp |
| faces and lit surfaces | never bloom | face edge on a still |
| grain and lens effects | none (grain σ 0.02 in flat areas); no chromatic aberration, softness or halation | `vfa analyze` `grain_sigma` |

## How it is built

1. **Choose the blur with the shot size.** Close shots and inserts isolate the subject; medium, full and wide shots
   keep the set readable because the set is part of the story. About one shot in three has depth of field.
2. **Focus on the eyes, blur by distance.** The background blur grows with its distance behind the focus plane
   (thin-lens shape: blur = blur-at-infinity x (1 − focus / distance)); a far background reaches the full disc.
3. **Ink first, blur second.** Lines are drawn before the blur so they soften with the background (`craft/ink.md`).
4. **Hold it.** The blur does not breathe inside a shot. When the camera travels between two framings, the blur blends
   from one size's value to the next over the travel.
5. **Rack only for a reason.** A focus pull moves the story from one subject to another (a foreground prop, a face
   behind) in 10-15 f.
6. **Blur the near side too.** Objects that frame the shot from the foreground blur strongly; floating particles close
   to the lens (snow, dust, sparks) turn into soft discs.
7. **Haze the distance.** Far objects move toward the key's horizon colour: by day a pale blue lighter than the sky at
   the horizon, at golden hour a warm peach, at night a lavender-violet; far objects lose contrast at all scales
   (unlike blur, haze lowers contrast without softening edges). Match the fog colour to the sky's horizon stop.
8. **Glow only where light is made.** Lamps, windows, screens, embers, the moon and glowing story objects bloom; lit
   surfaces and faces do not. A halo falls to half strength at about 1.8 x the source's radius.
9. **Keep the image clean.** No film grain (it only adds bitrate), no chromatic aberration, no lens softness; a ±1 LSB
   dither against banding is the only noise.

## Rules

1. Depth of field on for close, extra-close and insert shots; off for waist-up shots where the room matters, full and
   wide shots; on in 25-40 % of shots.
2. Close shots: background edge spread 17-23 u; inserts ≥ 30 u; sharp shots ≤ 1.6 u.
3. No focus change inside a shot except a deliberate rack of 10-15 f toward the new subject.
4. Across a camera travel the blur blends from the old size's value to the new one; never a jump in one frame.
5. Foreground framing objects are blurred; nothing sharp crosses between the lens and a face.
6. Aerial haze: by day far objects sit 50-70 % toward a pale-blue horizon colour; the fog colour equals the sky's
   horizon colour of the key.
7. Bloom threshold above every lit surface (only emissive values above 1 glow); halo 50 % at 1.6-2 x the source radius
   and 10 % at 3-4 x; faces never glow.
8. Grain σ < 0.3 (8-bit) in flat areas; chromatic aberration, lens softness and halation 0.

## In our engine

| what | where (file / field) | 1.9 value | status |
|---|---|---|---|
| depth of field per shot size | `lib/board.tsx` `DOF_BY_SIZE` [maxBlur u, aperture]; blur at infinity = product | xclose [16, 1.4] = 22.4 u; close [14, 1.35] = 18.9; medium [14, 1.3] = 18.2; insert [24, 1.6] = 38.4; pov [9, 1.0]; two [6, 0.9]; low [4, 0.8]; full, wide, high, group 0 | built; partly: `medium` (waist-up, head 13 % of the frame height) is ON, while the study's waist-up shot with the room behind was sharp (n = 1): check it per shot |
| blur cap and near field | `look.dof.maxCoC`, `nearScale` | 2 x maxBlur; 1.2 | built |
| blend over travels | `board.tsx` look function | eased blend across the glide window; motion blur x 0.45 while travelling, x 0.15 on a follow | built |
| rack focus | `Beat.focus` | 10 f to the target, held until the next shot | built |
| place-level depth of field | `BoardPlace.look.dof` | overwritten every frame by the shot size | not usable on boards |
| tilt-shift on aerial shots | — | — | not built (seen in 2 of 20 shorts) |
| pass order | `lib/three/post.ts` `PostPipeline` | MSAA scene → INK → DOF → BLOOM → FINAL | built |
| fog per key | `lib/three/world.ts` `LIGHTS[k].fog`, `fogNF`; `lightPlan` default [12, 140] m | day #bfe0ff, morning #dbe7f2, golden #ffc89a, sunsetBack #ffb07a, dawn #ffd9c4, dusk #5a4ab0, night and nightMoon #2a3a8a, nightPractical #141a3c, office #7297aa, interiorWarm #2b2a4a, rain #87adbe | built (linear fog, cross-faded with the key) |
| height fog, sun-side fog tint | — | — | not built (`research/rendering.md` D7) |
| bloom | `lib/look.ts` toonBase `bloom` | threshold 1.0, strength 0.5, radius 1.2; night and dusk 0.95 / 0.6 / 1.4; rain 0.90 / 0.55 / 1.5; fog 0.85 / 0.5 / 1.8 | partly: halo size not calibrated to 1.8 x; the bright pass has a soft knee from 0.5 x threshold, so near-white lit surfaces add a faint glow; rain and fog thresholds sit below 1 |
| emissive sources | `lantern()` glass #ffc860 x 1.4, `litWindow`, sparks (HDR colour), FX on `NOINK` | above 1 in linear light | built |
| grain | `look.grain.amount` | 0 | built |
| dither | `post.ts` `FINAL` | triangular ±1 LSB, per frame | built |
| chromatic aberration, softness, halation | `look.chroma`, `softness`, `halation` | 0 | built |
| floating particles | `world.ts` `motes()` | points on `NOINK`, 300 by default | partly: no soft-disc (bokeh) mode for particles near the lens |

How to use it on a board: the shot size decides the blur, `focus` moves it, the key decides the haze.

```ts
{ at: "looked", shot: { size: "close", on: "hero" } },                  // background ≈ 17-23 u
{ at: "ring", shot: { size: "insert", on: "ringProp", h: 0.2 } },       // macro: ≥ 30 u
{ at: "behind", focus: "stranger" },                                    // a 10 f rack inside the same shot
{ at: "town", shot: { size: "wide" }, key: "golden" },                  // sharp; far roofs fade toward #ffc89a
```

## Check

- `vfa analyze FINAL.mp4 --out QA`: `dof_ratio` near 1.9 over the whole short; `grain_sigma` about 1 or less.
- Edge spread on a full-resolution still: profile across one strong background edge.

```python
import numpy as np, PIL.Image as I
im = np.asarray(I.open("still.png").convert("L"), float)
p = im[700, 300:380]                                   # across one background edge (dark to light)
lo, hi = np.percentile(p, 2), np.percentile(p, 98)
t = (p - lo) / (hi - lo)
i10, i90 = np.argmax(t > 0.1), np.argmax(t > 0.9)
print("spread", round(abs(i90 - i10) * 1080 / im.shape[1], 1), "u")   # sharp 1.1-1.6, close shots 17-23
```

- Haze: Lab of a far building against the sky at the horizon (by day the building is lighter and bluer than the same
  material near the camera, C* drops by half or more).
- Bloom: radial luminance profile around a lamp; the excess over the background should halve at about 1.8 x the lamp's
  radius. A face next to a lamp must not gain a halo.
- **Failure looks like:** a wide shot with a soft background (the set is lost), a close-up with a busy sharp
  background, the blur popping on a cut inside a travel, a prop sharp between the lens and a face, flat distance with
  no haze, glowing white walls or faces, or visible grain.

## Common mistakes

1. **Too little depth of field.** The coin short's `dof_ratio` was 1.45 against 1.9 (an earlier version measured 1.06
   with the blur off). 1.8 and 1.9 raised the per-size values and turned the blur on for close shots and inserts;
   check the ratio on the next render.
2. **Depth of field on every day shot.** On an earlier short the round that turned it on everywhere also lowered the
   ink coverage (`ink_on_edges` 0.35 → 0.30). Wides stay sharp.
3. **Blur instead of staging.** Depth also comes from staging: one person 1-1.5 m nearer the camera reads as an
   over-the-shoulder shot without any blur (`pipeline/board.md` section 8, rule 3).
4. **A prop between the lens and a face.** However good the prop, it reads as a mistake (`pipeline/board.md` rule 4).
5. **Camera blur on a followed subject.** The motion blur comes from the camera only, so a followed coach smeared while
   it stood still on screen; the board cuts the blur to 15 % during a follow.
6. **Hot lamps at night.** Night highlights went from b* +15.5 to +21.9 when the lamp band was too strong (now capped).
   The night look blooms from 0.95, so a lamp-lit wall that crosses it glows as if it were a source. Check the night
   key's highlights after adding lamps.

## Sources

Private frame study of the 20 newest shorts of a reference channel in this style (35,987 frames at 30 fps; edge-spread
profiles on native frames; 20 frame logs), 2026-11-12; cross-checked against an outside study of the same channel;
background: `references/research/rendering.md` (B6, B8), `references/research/lighting.md` (A6 rules 40-43),
`references/research/colour.md` (D3).
