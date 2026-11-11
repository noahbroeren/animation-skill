# Shading, lighting, rendering and colour: the working rules

This is the short version. The four research reports behind it (about 4,300 lines, sourced, with evidence labels,
recipe tables and code sketches) are in `references/research/`:

| file | read it when |
|---|---|
| `research/toon-shading.md` | cel bands, shadow colour, outlines (inverted hull, screen space, jump flood), stylised specular and rim, halftone and hatching, how Guilty Gear / Spider-Verse / Zelda / Genshin / Hi-Fi Rush do it, three.js patching |
| `research/lighting.md` | key / fill / rim ratios, colour scripts, 20 lighting recipes mapped onto `lights()` / `TOON_SETUPS` / `LOOKS`, night and rain, phone readability, lighting 2D cards in 3D |
| `research/rendering.md` | shadows, AO, reflections, anti-aliasing, accumulation rendering, DOF, bloom, tone mapping, fog, instancing, determinism in headless Chromium |
| `research/colour.md` | value structure, palettes (12 with hex values), OKLab, 16 grading recipes for our `Look` fields, what YouTube really serves for Shorts, banding and dither experiments |

Each report ends with a ranked upgrade list for THIS engine; the status table at the bottom says what is already in.

## 1. Shading (toon / NPR)

1. **Shadows are a colour decision, not a darkness decision.** Shade = the surface's own hue, darker, a little MORE
   saturated, pulled toward cool (violet / blue). Never toward grey or black.
2. **Two bands, plus at most one accent.** Lit and shade; the third element is a thin terminator band or a rim, not
   another gradient.
3. **Form shadow and cast shadow get separate thresholds.** `ramp = band(N.L) x band(shadowMap)`. With one shared
   threshold the cast-shadow edge moves with the surface angle (ground vs wall).
4. **A terminator band sells "painted".** A thin, warm, saturated band where light meets shade (`uTerm`, 0.05 at night
   to 0.18 at sunset).
5. **Shade follows the form.** Up-facing shade takes sky colour, down-facing shade takes ground bounce
   (`uSkyFill`, `uBounce`). Without it, everything in shadow is one flat tone.
6. **Every light must reach the toon world AND the cards.** A lamp that lights nothing reads as a prop. Non-sun lights
   arrive as one soft, capped band (a pool of light), so a lamp's `distance` sets the pool size.
7. **Ambient occlusion is contact shading, tinted.** Multiply toward violet in corners and under props; never on the
   2D characters. Radius grows with distance so it survives wide shots.
8. **Lines: the ink can take the colour it outlines** (`look.ink.hue` 0.3-0.5): a dark version of the local colour
   reads as drawn; one black reads as a filter. Line weight follows distance; creases thinner than silhouettes.
9. **Never anchor a pattern to the screen** (halftone, hatching, wobble): with a moving camera it swims ("shower
   door"). Anchor to the world or the object and change any boil on twos or threes.
10. **Patches must compose.** Use `addPatch(material, key, fn)`; a second `onBeforeCompile` silently replaces the first
    (this is how wind sway was lost for two releases).

## 2. Lighting

1. **Lighting has jobs, in this order:** make the subject readable, tell the time and place, set the mood of the beat,
   guide the eye, add beauty. Art-direct it; do not simulate it.
2. **Key from 15-45 degrees to the side and above. Ratios:** 1.5:1 overcast, 3-4:1 normal day, 6-8:1 low key,
   16:1+ a spotlight. Fill is the sky's colour, not grey.
3. **A colour script is the plan.** One lighting key per story phase; contrast BETWEEN phases is the storytelling
   (the measured hero short: bright day, violet dusk, night with practicals, cool office, grey-teal rain).
4. **A lighting change is an edit.** Change it on a cut, a dissolve or a story turn (11-18 frames), not at random.
5. **Warm / cool is the cheapest contrast.** Warm key with cool shade by day; cool ambient with warm practicals at night.
6. **Night is not dark and moonlight is not blue.** Day-for-night recipe: key BEHIND the subject as a rim, about two
   stops down, sky darkened separately, faces protected, warm practicals added. Faces stay at 0.45+ display value.
7. **Phone rules:** subject and background at least 0.30 apart in value with the lighter one at 0.50+; nothing
   essential below 0.10; dark gradients band, so keep night skies textured or dithered.
8. **Rain reads by backlight and wet ground,** not by grey: darker, shinier ground, streaks only where a light is
   behind them, desaturated cool grade.
9. **Break up big lit planes:** cloud shadows (`uCookie`), foliage dapple, window patterns, light shafts. A large evenly
   lit plane is the main reason an exterior reads as a CG stage.
10. **Flat characters in a lit world:** tint them, do not shape them; keep a face-brightness floor; give every card a
    contact shadow, a rim in the key light's colour, and the scene's shade TINT (not grey) when in cast shadow.

Recipes: 20 setups in `research/lighting.md` section B. In code: `lights(scene, preset)` presets `day`, `golden`,
`night`, `overcast`, `dusk`, `rain`, `storm`, `fog`, `morning`, `sunsetBack`, `dawn`, `nightMoon`, `nightPractical`,
`neon`, `interiorWindow`, `interiorWarm`, `spotlight`, `studio`, `space`; `TOON_SETUPS` `day`, `golden`, `night`,
`interior`, `overcast`, `rain`, `dusk`, `fog`, `interiorWindow`, `sunsetBack`; looks `toonworld-day|golden|night|
interior|dusk|rain|overcast|fog|office`. The new ones are design values anchored on the measured palette: tune by render.

## 3. Rendering

1. **We are an offline renderer.** Quality per frame matters, fps does not; but never accumulate ACROSS frames
   (Remotion renders out of order): accumulate inside one frame or bake in `build()`.
2. **Fixed sample patterns, not per-frame random ones:** structured error is invisible in motion, per-frame noise
   flickers and costs bitrate.
3. **Order:** linear HDR for everything that models light, then exposure, tone map, sRGB, display-referred grade,
   grain, and dither LAST. Ink is blended in display gamma on purpose.
4. **A cel ramp amplifies artefacts:** shadow-map noise, low shadow resolution and banding become hard edges. Shadow
   quality matters more in toon looks than in realistic ones. Bias: a large `shadow.bias` detaches contact shadows.
5. **Cut-outs need alpha-to-coverage** (`alphaToCoverage: true` with the MSAA target): character silhouettes are the
   most-watched edges in the frame.
6. **The cheapest thing sets the look:** one shadow texel, one hard card edge or one banded sky is what the eye finds.

## 4. Colour

1. **Value first.** A frame that works in greyscale works; saturation and hue are added on top. Keep the focal point
   the strongest value contrast.
2. **Mix colours in OKLab, never in sRGB** (`lib/color.ts`: `mixOklab`, `gradientOklab`, `shadeOf`, `lightOf`,
   `deltaEOK`, `contrastRatio`). sRGB mixes go muddy and dark in the middle.
3. **Hue-shifted ramps:** shadows 10-15 degrees toward violet-blue and slightly more chroma; lights toward yellow and
   less chroma.
4. **Contrast raises saturation.** Our per-channel S-curve adds about +15 % saturation at contrast 1.2: lower
   `saturation` when you raise `contrast`.
5. **Over-range colours must keep their hue.** A plain clamp turns bright orange yellow and blue cyan; the `none`
   tone-map path now scales by the peak channel first.
6. **Delivery:** YouTube serves Shorts as 8-bit 4:2:0 bt709 limited range at roughly 0.7-2.4 Mbps for 1080p (1440p
   and 2160p renditions exist and get 3x and 7-11x that). So: dither every gradient (triangular, 1 LSB, last step),
   avoid thin saturated red/blue detail (4:2:0 smears it), keep text strokes thick, and for dark shots render the
   intermediates as PNG (`--image-format png`): JPEG frames erase the dither in a third or more of the blocks.
7. **Palettes and looks:** 12 palettes with hex values and 16 look recipes are in `research/colour.md` (sections B, C).

## 5. Status: what the engine does now (1.6) and what is still open

| area | in the engine | still open (see the reports' upgrade lists) |
|---|---|---|
| cel model | split form x cast ramp, shade hue rules, terminator band, form-following fill, rim, painted drift, cloud-shadow cookie | ramp LUT textures, stylised specular, `fwidth` crisp-band option, halftone / hatch presets |
| lights | sun + 19 presets, lamps light world and cards as capped pools, `lightShafts()`, sky sun glow | lighting keys with one timeline (`lightRig`), per-card light controls, directional backlight rim, rain / wet kit |
| outlines | depth + normal ink with distance weight, coloured ink | object-ID edges, light-aware line weight, ink parity for wind-displaced and alpha-cut meshes |
| grounding | tinted SSAO on the world, contact blobs, shadow bias fixed | shadow frustum fitted per shot, edge-aware AO blur, two-layer contact shadows |
| image | MSAA 4x, alpha-to-coverage cut-outs, DOF, camera motion blur, bloom, triangular dither | in-frame accumulation (AA + soft shadows + true motion blur), post height fog, planar reflections, environment light for PBR props |
| colour | zone tints fixed, hue-preserving clip, OKLab toolkit, OKLab look cross-fades, 5 new toonworld looks | palettes as data with checks, `vfa gradefit`, LUT in/out, delivery-proxy QA, caption contrast with colour-blind simulation |

**Measure per lighting key.** `vfa keygap` prints luma, saturation, warmth and highlight / shadow tint per section. The
video-wide medians in `gap.md` are decided by whichever section sits in the middle (analyzer.md, `vfa keygap`).

Rule of use: before inventing a look or a light setup, find the nearest recipe in the reports, apply it, render the cue
stills, and measure against the reference fingerprint. New numbers go back into the presets, not into one project.
