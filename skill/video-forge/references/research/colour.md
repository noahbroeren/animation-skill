# Colour: palettes, grading and look development for stylized Shorts

> **Status note (video-forge 1.6, 2026-11-11).** This is a research report written against the engine as it was on
> 2026-11-11 before / during the 1.6 work. Its "what our engine has vs gaps" and "upgrades" sections are a backlog, not
> the current state: see `references/research/shading-lighting.md` section 5 for what has been applied since. Evidence labels
> in the text say which claims were read in a source, summarised from search, measured, or left unverified.


Research report for the video-forge engine and analyzer. Compiled 2026-11-11.

Scope: stylized animated video (inked 3D worlds, 2D cards, flat vector, CG) that is watched on phones through YouTube
Shorts. The report is written to be pasted into `references/` and turned into presets and checks.

## How to read the evidence labels

Every non-obvious claim carries one label. Treat anything marked U as a starting point to test, not as a fact.

| label | meaning |
|---|---|
| **[P]** | primary source fetched and read today (spec, vendor documentation, the author's own post or interview) |
| **[S]** | secondary source (tutorial, review, press coverage, search-result summary of a paper); plausible, not checked at the origin |
| **[M]** | measured or simulated here today; scripts are next to this file (`colour_calc.py`, `band_test.py`, `band_test2.py`) |
| **[D]** | derived by arithmetic from P or M facts |
| **[K]** | already measured by this skill (`craft.md`, `styles/*.md`, preset comments) |
| **[U]** | unverified: practitioner heuristic, my own judgement, or a classic claim I did not fetch a source for |

Units: OKLab/OKLCH `L` is 0..1, chroma `C` is about 0..0.32 inside sRGB, hue `h` in degrees. "LSB" is one 8-bit code value
(1/255). "u" is the engine unit (1 px at a 1080 px short side).

Reference points in OKLCH [M]: red `#FF0000` L .63 C .26 h 29; orange `#FF8000` h 53; yellow L .97 C .21 h 110; green
L .87 C .30 h 142; cyan L .91 C .16 h 195; blue L .45 C .31 h 264; magenta L .70 C .32 h 328. Blue and magenta have the
most chroma available, cyan and yellow the least, and yellow only exists at high lightness.

---

## A. Key principles

### A1. Value structure, saturation hierarchy, temperature

1. **Value first.** A frame must read with the colour removed. Check it on OKLab L (or Rec.709 luma): the subject should
   differ from what is directly behind it by at least 0.15 L at the focal point and 0.10 wherever the silhouette has to
   read. Below that, the separation has to come from an ink line, a rim light or blur. The desaturate test is a common
   illustration rule [S]; the thresholds are mine [U].
2. **Three or four value groups per frame**, one of them dominant by area. A frame whose luma histogram is one lump in the
   middle reads flat however colourful it is [U]. Analyzer proxies: `luma_std` (reference styles sit near 0.18-0.26 [K])
   and the p1/p50/p99 spread.
3. **No pure black and no clipped white in the stylized looks.** The measured cartoon reference has p1 = 0.06-0.08 and
   whites at 0.95-0.985 [K]. There is a delivery reason too: on a gamma-2.2 OLED at 200 nits the first visible step is
   about RGB 3, and RGB 1-5 are the steps at risk (up to RGB 10 in the worst panel tested) [S, monitor test].
4. **Saturation is a budget.** Most of the frame sits at low or middle chroma so the focal point can win. "The more
   saturation you hold in reserve, the more local saturation contrast you can create" [S]. Working ranges in OKLCH for
   this skill's styles [U, consistent with section B]: backgrounds C 0.03-0.12, characters 0.08-0.18, accents 0.17-0.25.
5. **Contrast raises saturation.** A per-channel S-curve stretches channel differences. In our shader a test colour gains
   +7 % saturation at `contrast` 1.1, +15 % at 1.2, +21 % at 1.3 and +28 % at 1.4, before `saturation` is touched [M].
   When you raise contrast to match a reference, expect to lower `saturation`.
6. **Chroma peaks in the lit midtones and the first shadow step**, and falls in the brightest highlights and the deepest
   shadows. It also falls with distance (aerial perspective): far layers move toward the sky colour, lighter and lower
   in contrast [K for the depth rule, U for the chroma shape].
7. **Warm against cool separates planes at equal value.** Warm key with cool shadows is the default; a cool key gives
   warm shadows [S]. The measured reference uses violet shadows at sunset where our first attempt had brown ones, and
   brown read cheap [K].
8. **Simultaneous contrast.** A colour is judged against its neighbours: a neutral grey beside orange looks bluish, and
   the same hex looks different on two backgrounds. Practical consequences: check character colours against every
   scene's background, and make an accent feel more saturated by surrounding it with a low-chroma complement rather
   than by pushing its own chroma to the gamut edge [U, classic Chevreul/Albers observation, no source fetched].

### A2. Schemes, proportion, emotion, colour scripts

9. **Build schemes in OKLCH, not HSL.** HSL hues are not evenly spaced and changing HSL hue changes visual lightness [P,
   CSS Color 4]. Schemes: analogous (within 30 degrees) plus one accent; complementary (h + 180); split-complementary
   (h + 150 and h + 210); triadic (120 apart). Computed examples at equal L and C [M]: accent red `#FF4B3E` has
   complement `#00A8BA` and splits `#00AD96` / `#009FE6`; sunset orange `#FFB35C` has complement `#94CBFF`; sky blue
   `#2F8FEA` has complement `#BF7B00`.
10. **60-30-10.** About 60 % dominant family (sky, ground, walls), 30 % secondary (characters, props), 10 % accent. It
    comes from interior design and is a guideline, not a law [S]. In a vertical short the accent is usually smaller,
    2-8 % of the frame [U].
11. **Limited palette.** Three to five hue families per scene plus neutrals. Introduce at most one new hue per story
    beat [U].
12. **Colour and emotion: real but coarse.** A 30-nation study (4,598 people, 12 colour terms, 20 emotions) found shared
    associations, and red was tied to both love and anger; nation still mattered, for example red also meant fear in
    Nigeria [S, press coverage of Jonauskaite et al. 2020]. Lightness and chroma carry mood more reliably than hue
    (bright and saturated reads positive and energetic; dark and desaturated reads negative or calm) [U]. So do not
    lean on "blue = sad". Set up your own code inside the video and keep it, the way the reference channel makes
    night-blue mean "now the explanation" [K].
13. **Colour script.** A strip of small colour keys, one per beat, planned before look development. Lou Romano: it
    carries inspiration and continuity, and starts from "tent-pole" images that hold each theme in its purest form;
    for Up the early keys showed Carl alone in muted colour, against the storybook prologue [P, interview]. Ralph
    Eggleston called it a map of colour across the film that guides lighting; on Inside Out he tracked overall shifts
    in colour, light and contrast across two worlds [S].
14. **A colour script for a 55-70 s short** (4-6 beats, mapped onto this skill's story formula) [D from K + U]:

    | beat | palette / look | luma mean | saturation | warmth | accent |
    |---|---|---|---|---|---|
    | hook (0-3 s) | strongest image, highest local contrast | 0.45-0.55 | high | either | present in frame 1 |
    | setting | sunny-day | 0.50-0.60 | 1.2-1.3x | warm | small |
    | escalation | golden-hour | 0.42-0.50 | 1.2x | warmest | growing |
    | the snap | flash or danger-alarm for under 1 s | spike | spike | hot | full frame |
    | "You see," explanation | night-blue | 0.25-0.35 | 1.25x on few hues | cool | one warm accent |
    | payoff | back to day or golden, brightest frame of the video | 0.55+ | highest | warm | resolved |

    Adjacent beats should differ in at least two of: luma mean by 0.10, sign of warmth, saturation by 15 % [U].

### A3. Palette construction for cartoons

15. **Derive, do not pick, the shadow colour.** Lit colour = albedo x key light; shadow colour = albedo x ambient light,
    computed in linear light. One key and one ambient per scene keeps every surface coherent. Picking "a darker version
    of the same hue" is what produces brown, muddy shadows [D, section B].
16. **Hue shift size.** Saturated surfaces shift 10-30 degrees between lit and shadow. A palette tool's rule of thumb:
    15-25 degrees reads natural, 30 or more reads stylized, 0 is flat [S]. Neutral and skin surfaces swing further
    because they take on the ambient hue: 12-48 degrees in the computed palettes below [M].
17. **Hue shift direction.** Under a warm key, shadows rotate toward blue-violet (OKLCH h 265-300) and highlights toward
    yellow (h 95-110) [S for the direction]. Per ramp step use about 12 degrees on the shadow side and 8 on the light
    side [U; see the generated ramps in B].
18. **Shadow saturation.** For a cartoon, keep shadow chroma at half or more of the lit chroma (computed skin: 0.44-0.74;
    over 1 at night). Grey shadows read as dirt. Drop chroma 15-20 % per step in the highlights [M for the numbers, U
    for the rule].
19. **Skin.** On a vectorscope every skin tone lies near one line, the I line at 123 degrees; skin types differ mainly in
    saturation and lightness, not hue [S, Kdenlive/Boris/OpenRV documentation]. Our three base skins sit at OKLCH h 49-62
    [M]. Under white light keep lit skin within about 10 degrees of the base hue. Under coloured light shift the whole
    character with the scene, never the skin alone. Give skin shadows a bounce term (20 % of the key) so they stay
    warm; a slightly more saturated band at the terminator imitates subsurface scattering [S, single source].
20. **Character against background.** Characters get more chroma and harder value edges than the world behind them.
    Targets [U]: L gap of 0.15 or an ink line; character chroma at least 0.04 above the background behind it;
    backgrounds lose contrast and gain sky colour with distance.
21. **Accent.** One per shot, on the focal point only, at most 10 % of the frame. It must beat its surroundings on at
    least two of three axes: hue 90 degrees or more away, L different by 0.20, C higher by 0.05 [U]. A hue-only
    accent fails for colour-blind viewers (see A6).
22. **Ink is never pure black.** Use a very dark colour leaning toward the shadow hue (the presets use `#0b0710` and
    `#140c10`; OKLCH L about 0.17) [K].

### A4. Perceptual colour spaces for tools

23. **Why OKLab.** Bjorn Ottosson designed it so L, C and h are perceived as orthogonal, blends are even, the white
    point is D65, and the maths is simple and stable. CIELAB and CIELUV predict hue badly, especially blue; blue-to-white
    blends in CIELAB, CIELUV and HSV all drift toward purple; HSV meets none of the requirements [P]. It was fitted to
    CAM16 lightness/chroma data and IPT hue data and models normal viewing conditions only [P].
24. **Conversion** (linear sRGB in, exact constants from the post) [P]:

    ```
    l = 0.4122214708 r + 0.5363325363 g + 0.0514459929 b
    m = 0.2119034982 r + 0.6806995451 g + 0.1073969566 b
    s = 0.0883024619 r + 0.2817188376 g + 0.6299787005 b
    l' = cbrt(l)  m' = cbrt(m)  s' = cbrt(s)
    L = 0.2104542553 l' + 0.7936177850 m' - 0.0040720468 s'
    a = 1.9779984951 l' - 2.4285922050 m' + 0.4505937099 s'
    b = 0.0259040371 l' + 0.7827717662 m' - 0.8086757660 s'
    inverse:
    l' = L + 0.3963377774 a + 0.2158037573 b
    m' = L - 0.1055613458 a - 0.0638541728 b
    s' = L - 0.0894841775 a - 1.2914855480 b
    r = +4.0767416621 l'^3 - 3.3077115913 m'^3 + 0.2309699292 s'^3
    g = -1.2684380046 l'^3 + 2.6097574011 m'^3 - 0.3413193965 s'^3
    b = -0.0041960863 l'^3 - 0.7034186147 m'^3 + 1.7076147010 s'^3
    ```
    OKLCH: `C = hypot(a, b)`, `h = atan2(b, a)`.
25. **Three kinds of mixing, three right answers.**
    - Physical operations (blur, antialiasing, alpha, light accumulation, resizing): linear light. sRGB's transfer curve
      is a CRT legacy and blending in it "darkens colors significantly when mixing saturated opposing colors" [P].
    - Gradients, palette interpolation, colour keys between looks: OKLab. CSS interpolates in Oklab by default and keeps
      gamma sRGB only for legacy colours [P].
    - Hue sweeps and keeping chroma through a transition: OKLCH with the shorter hue arc (the CSS default) [P].
26. **What the wrong space costs** (50 % mixes) [M]:

    | pair | sRGB (gamma) mix | linear-light mix | OKLab mix | OKLab L of the three |
    |---|---|---|---|---|
    | `#FF0000` + `#00FF00` | `#808000` | `#BCBC00` | `#D0A800` | 0.58 / 0.77 / 0.75 |
    | `#0000FF` + `#FFFF00` | `#808080` | `#BCBCBC` | `#6CABC7` | 0.60 / 0.79 / 0.71 |
    | `#FF4B3E` + `#2F8FEA` | `#976D94` | `#BE73B0` | `#B07F9E` | 0.59 / 0.66 / 0.65 |
    | `#0000FF` + `#FFFFFF` | `#8080FF` | `#BCBCFF` | `#74A3FF` | 0.66 / 0.82 / 0.72 |
    | `#FF00FF` + `#00FF00` | `#808080` | `#BCBCBC` | `#C6B4B4` | 0.60 / 0.79 / 0.78 |

    The gamma mix is the muddy one: red to green passes through a dark olive, and blue to yellow passes through plain
    grey. Blue to white in sRGB goes periwinkle-purple; in OKLab it stays blue.
27. **Gamut mapping.** Clamping R, G and B separately is simple and distorts hue [P]. Reduce chroma at constant hue
    instead. CSS's algorithm works in OKLCH with a binary search on chroma, `JND = 0.02`, `epsilon = 0.0001`, returning
    white at L >= 1 and black at L <= 0 [P]. Ottosson's alternative projects toward a point on the grey axis; his
    suggested default is "adaptive L0" with alpha = 0.05, where projecting toward mid-grey (L 0.5) or toward the cusp
    makes little visible difference [P]. The cusp is the most saturated in-gamut colour of a hue.
28. **Colour difference.** deltaE-OK is the Euclidean distance in OKLab, and the CSS gamut mapper uses 0.02 as its
    just-noticeable difference [P]. For CIEDE2000 the usual bands are: under 1 not perceptible, 1-2 on close
    side-by-side inspection, 2-3.5 visible at a glance, over 5 a different colour; these are rules of thumb [S]. The
    often-quoted 2.3 is the JND of the older CIE76 formula, not of deltaE2000 [S].
29. **Contrast for text: WCAG 2.x.** Ratio = (L1 + 0.05) / (L2 + 0.05) with relative luminance
    L = 0.2126 R + 0.7152 G + 0.0722 B on linearised sRGB (linearisation threshold 0.04045, corrected from 0.03928 in
    the current text) [P; coefficients are also what `thumbcheck.py` uses]. Thresholds: 4.5:1 normal text, 3:1 large
    text (18 pt, or 14 pt bold), 7:1 and 4.5:1 for AAA, 3:1 for the meaningful parts of graphics [P].
30. **Contrast for text: APCA.** Reports Lc from 0 to about 106, signed (negative means light text on dark). Lc 90
    preferred for body text, 75 minimum for body, 60 for other content text, 45 for large headlines, 30 the floor for
    any text, 15 the floor for non-text [P]. It is perceptually uniform, and its authors state that WCAG 2 "overstates
    contrast for dark colors" [P]. Constants (0.0.98G-4g): exponent 2.4; coefficients 0.2126729 / 0.7151522 /
    0.0721750; normBG 0.56, normTXT 0.57, revTXT 0.62, revBG 0.65; black threshold 0.022 with clamp exponent 1.414;
    scale 1.14; offset 0.027; low clip 0.1 [P]. APCA is still a candidate method with its own licence terms; use it as
    a second opinion beside WCAG, especially for dark scenes.
31. **Caption numbers** [M]: white on the ink stroke `#140C10` is 19.3:1 (Lc -108); highlight yellow `#FFE600` on the
    stroke is 15.2:1; but white on a bright sky horizon `#BFE6FF` is 1.3:1, white on sunset `#FFB35C` is 1.8:1, and
    yellow on white is 1.3:1. The fill never carries the contrast against the picture; the stroke does. Pure red on
    pure blue is only 2.2:1, and pure red on mid green is 1.15:1.

### A5. Grading operations and their order

32. **Order.** Scene-referred work first, display-referred look second, texture last:
    exposure and white balance, then primary trims (CDL), then tonemap, then display encoding, then the look (curve,
    saturation, split tone, LUT), then spatial effects (vignette), then grain, then dither, then 8-bit quantisation
    [U as a general rule; it is how our `FINAL` pass is already ordered]. Our pass does: chromatic aberration, softness,
    add bloom and halation, exposure, tonemap, sRGB encode, tone curve (S-curve or 7 knots), gamma, saturation and
    vibrance, split tone, zone saturation and zone tints, vignette, black/white remap, grain, dither [code].
33. **Lift / gamma / gain and offset.** Lift moves blacks and leaves white, gain moves white and leaves black, gamma
    bends the middle, offset moves everything [U, standard colourist definitions]. ASC CDL per channel:
    `out = (in x slope + offset) ^ power`, then one saturation value applied with Rec.709 weights
    (0.2126, 0.7152, 0.0722) as `luma + sat x (in - luma)`; clamping differs between implementations [S,
    Natron/OCIO, Kdenlive, Autodesk docs]. Our equivalents: `blackPoint`/`whitePoint` are output levels, `gamma` is
    gamma, `shadowTint`/`highlightTint` are per-channel lift and gain offsets.
34. **Contrast with a pivot.** The pivot is the level that does not move. Ours is a power curve on each side of the
    pivot with slope `contrast` at the pivot. Put the pivot on the value that must stay put, usually the subject's
    midtone: 0.45-0.50 for day scenes, 0.30-0.42 for low-key scenes (the documentary preset uses 0.30) [K + D].
35. **Curves.** The 7-knot curve (x = 0, .1, .25, .5, .75, .9, 1) replaces the S-curve. A film-like toe and shoulder is
    `[0, .062, .20, .50, .805, .938, 1]`: end slopes about 0.62, middle slope 1.2 [M].
36. **Split toning.** Tint shadows and highlights with roughly opposite hues. Size guide from the simulation of our own
    presets [M]: a 10 % grey pushed to Lab chroma 3-8 is visible but natural; 10-15 is a statement (toonworld-night
    sits at a +6.2, b -15.0).
37. **Saturation against vibrance.** Saturation scales every pixel's chroma; vibrance weights the less saturated pixels
    more, which protects colours that are already near clipping and is gentler on skin [S, several tutorials; Adobe's
    own wording not fetched]. Ours: `sat x (1 + vibrance x (1 - (max - min)))`.
38. **Hue-vs-sat and hue-vs-hue** change one hue range only. This is the tool for "greens and skies clip first" [K]
    without desaturating the cast. We do not have it (section E).
39. **3D LUTs.** A `.cube` file is text: `LUT_3D_SIZE N`, optional `DOMAIN_MIN` / `DOMAIN_MAX` (default 0 and 1), then
    N^3 RGB rows with red changing fastest. Common sizes are 17, 33 and 65 [S]. Tetrahedral interpolation is the
    preferred quality option over trilinear [U]. A LUT has no spatial or temporal control (no vignette, grain, bloom or
    per-shot change) [P, YouTube's HDR LUT notes] and is only valid for the input encoding it was built for [U].
40. **Film emulation and print looks.** A print stock is, in effect, a LUT over the graded negative: toe and shoulder,
    channel cross-talk, its own contrast and saturation; "a print film doesn't clip white, it bends it" [S, vendor
    text]. Specific colour claims about Kodak 2383 (cyan-leaning blues, deep blacks) could not be confirmed against a
    data sheet [U].
41. **Halation.** Bright light passes through the emulsion, reflects off the film base and re-exposes the film, leaving a
    red-orange glow around the brightest edges even with an anti-halation layer [S]. Ours is the bloom texture times
    (1.0, 0.25, 0.1).
42. **Bloom and vignette.** The measured cartoon reference blooms emissive sources only (threshold 1.0) [K]. Vignette
    0.08-0.20 guides without being seen, 0.30-0.45 is a mood [K presets].
43. **Tonemappers.**
    - The "ACES" in most real-time code is Narkowicz's fit `(x(2.51x+0.03)) / (x(2.43x+0.59)+0.14)`. Its author calls
      it "a very simple luminance only fit, which over saturates brights", and it is pre-exposed (multiply the input by
      0.6 for the original curve) [P]. This is the fit in `post.ts`.
    - AgX (Blender 4.0's default) handles over-exposure better than Filmic: bright colours go toward white as in real
      cameras; it is an SDR transform [P].
    - Khronos PBR Neutral keeps colours 1:1 up to a threshold (0.8 - 0.04 = 0.76) and then compresses with a
      desaturation of 0.15, so base colours and brand colours survive [S + code constants identical to ours].
    - What this means for hue [M]: an over-bright orange (linear 2.0, 0.9, 0.15; true hue 71) comes out at hue 104 with
      a plain clamp, 100 with the ACES fit and 68 with Neutral. An over-bright blue (true hue 264) comes out at 238,
      231 and 269. Clamp and the per-channel fit turn orange into yellow and blue into cyan; Neutral holds the hue.
44. **Teal and orange.** Skin of every type sits in orange, and teal is its complement, so cooling everything else
    makes people pop [S]. It became a cliche (peak roughly 2007-2018) and its failure mode is skin pushed too orange
    [S]. For designed cartoon palettes it does further harm: a strong two-hue grade collapses greens, reds and purples
    into the two families and flattens the local colours the palette was built on [U]. Better: put the contrast in the
    scene (orange key, teal ambient) and keep the grade's tints under Lab chroma 5.

### A6. Measuring and matching a reference

45. **Scopes.** Histogram: distribution and clipping. Waveform: levels against horizontal position, so black and white
    points per region. RGB parade: per-channel balance, which exposes a tint in blacks or whites. Vectorscope: hue as
    angle and saturation as radius; the skin line sits at 123 degrees [S]. Analyzer equivalents: luma percentiles and
    clip %, Lab a/b of the darkest and brightest 20 %, HSV saturation, the k-means palette.
46. **Match in this order:** black and white points (p1, p99); then the middle and contrast (p50, the tone curve);
    then balance (shadow and highlight a/b); then saturation overall and per zone; then single hues. Compare like with
    like: one fingerprint per lighting setup, as the toonworld presets already do [K + U].
47. **Statistics transfer (Reinhard, 2001).** Per channel in a decorrelated space:
    `out = (sigma_ref / sigma_src) x (x - mu_src) + mu_ref`. The paper uses l-alpha-beta (log LMS); most code uses
    CIELAB [S]. It assumes the two images have similar content; when sky share or subject size differ, transfer per
    tonal zone or per matched region and clamp the scale to about 0.5-2 [U].
48. **Consistency.** Hold a character's colours within deltaE-OK 0.02-0.04 between shots of one lighting setup, and treat
    larger steps as a deliberate lighting change [D from the 0.02 JND; band is U]. The existing `vfa compare`
    tolerances (luma 0.04, saturation 0.04, Lab a/b 2.0) are about one JND each [K + S].

### A7. Accessibility

49. About 8 % of men and 0.5 % of women have a red-green deficiency; deuteranomaly is the most common form, about 5 %
    of men [S].
50. "Color is not used as the only visual means of conveying information" (WCAG 1.4.1) [P]. In diagrams add a second
    cue: shape, label, position, pattern, or a lightness difference.
51. Okabe-Ito palette for categorical data: orange `#E69F00`, sky blue `#56B4E9`, bluish green `#009E73`, yellow
    `#F0E442`, blue `#0072B2`, vermilion `#D55E00`, reddish purple `#CC79A7`, black `#000000` [S].
52. A measured warning from our own palette [M, Machado 2009 matrices applied in linear RGB]: accent red `#FF4B3E` on
    grass `#4FAF3E` has deltaE-OK 0.33 for normal vision and 0.02 for deuteranopia, because the two have the same
    lightness (L 0.67). Red against sky blue keeps 0.29. Okabe-Ito vermilion against blue keeps 0.28.
53. Rule: categorical colours and accents need an L gap of 0.15-0.20 as well as a hue gap, or an outline [U].

---

## B. Palette recipes

### How the palettes are built

Each palette is one lighting situation: two sky stops, a far layer, a ground albedo, a key light, an ambient
("shadow") light, two accents and an ink colour. Lit and shadow colours are then computed in linear light [M]:

- world lit = albedo x (key + 0.35 x ambient)
- world shadow = albedo x ambient (a "replacement" shadow with no key at all, as in the measured reference)
- skin shadow = albedo x (ambient + 0.20 x key), the bounce term that keeps skin shadows warm

Any other surface can be added with the same three lines, which is the point: give the engine an albedo and the
palette's two lights and the shadow colour follows.

### B-table 1: world colours

| palette | sky top | sky horizon | far layer | ground albedo | ground lit | ground shadow | key light | ambient light | accent | accent 2 | ink |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sunny-day | `#2F8FEA` | `#BFE6FF` | `#9FD3E8` | `#4FAF3E` | `#51AD3A` | `#1C562D` | `#FFF4D6` x1.00 | `#8FA8FF` x0.55 | `#FF4B3E` | `#FFC83D` | `#1A1024` |
| golden-hour | `#5B6FD6` | `#FFB35C` | `#E8A27A` | `#8E7A4E` | `#905625` | `#2D1A29` | `#FFB56B` x1.00 | `#7A5CC8` x0.50 | `#18B8A8` | `#FFE08A` | `#24102A` |
| night-blue | `#070B2E` | `#1B2F7A` | `#16235C` | `#5A6FA8` | `#283D8A` | `#050842` | `#9DB8FF` x0.60 | `#3A3FAF` x0.32 | `#FFB84D` | `#FF6B8B` | `#05061A` |
| pastel-morning | `#BFE3F5` | `#FDE7EF` | `#E3E6F7` | `#BFE5C8` | `#CCE6CA` | `#8693B3` | `#FFF1E0` x1.00 | `#C9B8FF` x0.78 | `#FF8FA3` | `#FFD27A` | `#5A4A6A` |
| rainy-teal | `#6F8C93` | `#A9BDBF` | `#93A9AC` | `#5F7C78` | `#486866` | `#103133` | `#D5E4E6` x0.82 | `#4F8C96` x0.58 | `#FFB000` | `#E4572E` | `#12202A` |
| noir-doc | `#0E0F12` | `#2A2C31` | `#1C1D21` | `#6A6C72` | `#5B5C5F` | `#040508` | `#E8E6E0` x0.90 | `#30343C` x0.30 | `#E0312B` | `#F2F0EA` | `#050506` |
| retro-sunset | `#2B1055` | `#FF5E99` | `#7A2E8F` | `#3A2A7A` | `#39153D` | `#0A0243` | `#FF9E6B` x0.95 | `#6A3EC8` x0.50 | `#19F0E0` | `#FFE14D` | `#12062A` |
| paper-print | `#F4EBDD` | `#EFE2CF` | `#DCCDB6` | `#E9D9BF` | `#F0DCBF` | `#70748B` | `#FFF8EA` x1.00 | `#8FA0D8` x0.72 | `#F0563A` | `#2A4B9B` | `#2B2A33` |
| danger-alarm | `#2A0D1A` | `#B3261E` | `#5A1626` | `#7A3A42` | `#781615` | `#1D0112` | `#FF7A5C` x0.95 | `#6A2A8A` x0.45 | `#C6FF3D` | `#FFD23D` | `#14040C` |
| deep-cool | `#062B3D` | `#0E6E8C` | `#0B4A63` | `#2A6475` | `#10556D` | `#00122E` | `#8FF0FF` x0.80 | `#1E5A9A` x0.48 | `#FF8A3D` | `#FFE66B` | `#03141C` |
| vector-navy | `#1B1B5E` | `#3B2A8C` | `#2A2470` | `#2E2A7A` | `#2F2A82` | `#080553` | `#FFFFFF` x1.00 | `#6A5AE0` x0.60 | `#FF7A59` | `#FFC857` | `#0D0B2E` |
| warm-interior | `#6E4630` | `#96603E` | `#6B3F2A` | `#7A5238` | `#7B3D19` | `#190A10` | `#FFC27A` x1.00 | `#5A4A8A` x0.50 | `#3EC6C0` | `#F2E2B8` | `#1E0F0C` |

For `paper-print`, "sky" is the paper and the two accents are the two spot inks. For `warm-interior`, "sky" is the wall.
For `vector-navy`, "sky" is the background field and the accents are the shape colours (add `#3DDC97` and `#5CC8FF`
as third and fourth shape colours).

### B-table 2: skin under each light (lit / shadow)

Base skins: light `#F1C7A4`, medium `#C68E65`, deep `#7B4B30`.

| palette | light skin lit / shadow | medium skin lit / shadow | deep skin lit / shadow |
|---|---|---|---|
| sunny-day | `#F7C59A` / `#97838A` | `#CB8D5E` / `#7B5C54` | `#7E4A2C` / `#4B2F27` |
| golden-hour | `#F58F56` / `#8C5260` | `#C96532` / `#723839` | `#7D3415` / `#451A18` |
| night-blue | `#767287` / `#3E3A57` | `#605052` / `#312733` | `#392726` / `#1B1015` |
| pastel-morning | `#FFC8A5` / `#C8989F` | `#D38F66` / `#A46C62` | `#844B30` / `#65372E` |
| rainy-teal | `#BAA88C` / `#676F5F` | `#997856` / `#534E38` | `#5E3E28` / `#312618` |
| noir-doc | `#D2AB89` / `#675342` | `#AC7A54` / `#533926` | `#6A3F27` / `#311B0E` |
| retro-sunset | `#EE7954` / `#844060` | `#C45532` / `#6B2B39` | `#7A2A14` / `#401218` |
| paper-print | `#F8C9A4` / `#A08988` | `#CC9065` / `#826153` | `#7F4C30` / `#4F3126` |
| danger-alarm | `#EE5C41` / `#822E3F` | `#C44025` / `#6A1E24` | `#791E0D` / `#3F0B0D` |
| deep-cool | `#7AAB99` / `#3B5C60` | `#637A5E` / `#2F4039` | `#3B3F2C` / `#191E18` |
| vector-navy | `#F4C9AF` / `#896C86` | `#C98F6C` / `#704B52` | `#7D4C34` / `#432526` |
| warm-interior | `#F39854` / `#815046` | `#C86C31` / `#693728` | `#7C3714` / `#3F190F` |

For `noir-doc` the look desaturates everything afterwards; the skin values matter only for their lightness.

### B-table 3: computed checks (OKLCH) [M]

"Skin" is the medium skin, lit. "Sky" is the mean L of the two sky stops.

| palette | skin hue shift lit to shadow | skin L drop | skin shadow / lit chroma | ground hue shift | ground L drop | L gap skin-sky | L gap skin-ground | accent C / max sky C | accent hue distance from sky top | worst WCAG of white text on sky or ground | white on ink stroke | APCA Lc, white on sky top |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sunny-day | -22 | 0.19 | 0.44 | +10 | 0.27 | 0.08 | 0.03 | 0.22 / 0.16 | 137 | 1.3 | 18.4 | -66 |
| golden-hour | -26 | 0.20 | 0.57 | -82 | 0.26 | 0.08 | 0.11 | 0.12 / 0.16 | 89 | 1.8 | 17.8 | -76 |
| night-blue | -48 | 0.16 | 1.21 | 0 | 0.20 | 0.19 | 0.06 | 0.15 / 0.13 | 163 | 9.9 | 20.0 | -107 |
| pastel-morning | -21 | 0.12 | 0.74 | +124 | 0.23 | 0.21 | 0.19 | 0.14 / 0.05 | 140 | 1.2 | 8.0 | -20 |
| rainy-teal | +28 | 0.17 | 0.54 | +10 | 0.20 | 0.11 | 0.10 | 0.17 / 0.03 | 138 | 2.0 | 16.6 | -69 |
| noir-doc | 0 | 0.25 | 0.59 | -4 | 0.36 | 0.39 | 0.15 | 0.21 / 0.01 | 117 | 6.7 | 20.4 | -108 |
| retro-sunset | -29 | 0.20 | 0.61 | -50 | 0.09 | 0.10 | 0.31 | 0.15 / 0.20 | 109 | 2.9 | 19.4 | -105 |
| paper-print | -12 | 0.18 | 0.52 | -161 | 0.34 | 0.23 | 0.20 | 0.19 / 0.03 | 47 | 1.2 | 14.2 | -10 |
| danger-alarm | -13 | 0.20 | 0.63 | -41 | 0.22 | 0.20 | 0.18 | 0.22 / 0.18 | 131 | 6.5 | 20.0 | -107 |
| deep-cool | +29 | 0.20 | 0.50 | +29 | 0.23 | 0.16 | 0.13 | 0.17 / 0.09 | 176 | 5.8 | 18.7 | -104 |
| vector-navy | -45 | 0.24 | 0.60 | -9 | 0.14 | 0.38 | 0.35 | 0.17 / 0.15 | 120 | 11.1 | 19.0 | -105 |
| warm-interior | -13 | 0.23 | 0.55 | -52 | 0.26 | 0.14 | 0.19 | 0.11 / 0.09 | 141 | 5.2 | 18.6 | -93 |

What the checks say:

- **Bright daylight is where characters disappear.** In `sunny-day` and `golden-hour` a medium skin is within 0.03-0.11
  L of both the sky average and the lit ground. Value alone will not separate the cast there. This is why the measured
  style leans on ink outlines, cast shadows under the feet and DOF. Stage faces against the bright horizon or the far
  layer, not against mid sky.
- **`sunny-day` accent red on grass has no lightness gap** (both L 0.67) and vanishes for deuteranopes (A7.52). Stage
  the red accent against sky, sand or shadow, or outline it. The second accent `#FFC83D` is safe on grass.
- **`golden-hour` and `retro-sunset` accents have less chroma than their skies.** They win on hue (89-109 degrees away)
  and on lightness, not on chroma. Keep them small and bright.
- **Captions need the stroke in seven of twelve palettes** (worst white-on-background ratio under 4.5:1). In the five
  dark palettes white fill alone passes.
- **Large hue shifts on neutral ground are expected** (`pastel-morning` +124, `paper-print` -161): a nearly neutral
  surface simply takes the ambient hue. For saturated ground the shift is 0-50 degrees.

### Palette notes: mood, use and the look to pair with

| palette | mood and story use | pair with look (section C / existing) |
|---|---|---|
| sunny-day | set-up, innocence, comedy; highest key | `toy-saturated`, `toonworld-day` |
| golden-hour | stakes rising, nostalgia, last calm before the snap | `golden-hour`, `toonworld-golden` |
| night-blue | explanation mode, mystery, focus; one warm practical light as accent | `night-blue`, `toonworld-night` |
| pastel-morning | gentle, childlike, dream, soft tutorials | `pastel-soft` |
| rainy-teal | melancholy, bureaucracy, "the problem"; the yellow accent is the hero | `rainy-teal` |
| noir-doc | documentary essay, crime, archive; one red accent carries meaning | `noir-hard`, `doc-noir` |
| retro-sunset | 80s, arcade, hype, music beats | `synthwave-neon`, `retro-vhs` |
| paper-print | history, folk tale, infographic on paper; two spot inks and their overlap | `paper-print` |
| danger-alarm | the snap, catastrophe, alarm; hold for seconds, not minutes | `toy-saturated` at lower exposure, or `sickly-green` for dread |
| deep-cool | underwater, caves, sci-fi interiors, anatomy "inside the body" | `deep-cool` |
| vector-navy | flat vector explainer fields (the measured flat-vector style is cool, warmth -0.19, saturation 0.86 [K]) | `flat-vector`, `high-key-clean` |
| warm-interior | homes, workshops, taverns; teal accent for the object of interest | `toonworld-interior`, `golden-hour` at lower saturation |

### Hue-shifted ramps

Five-step ramps generated in OKLCH [M]: 0.11 L per step; shadows rotate 12 degrees per step toward violet (h 285) with
+10 % chroma on the first shadow step; lights rotate 8 degrees per step toward yellow (h 95) with -18 % chroma per
step; chroma reduced until the colour fits sRGB.

| base | shadow 2 | shadow 1 | base | light 1 | light 2 | OKLCH hue of the five |
|---|---|---|---|---|---|---|
| grass `#4FAF3E` | `#006648` | `#008C49` | `#4FAF3E` | `#93CB67` | `#CBE995` | 165, 153, 141, 133, 125 |
| red coat `#D8382E` | `#760034` | `#AD0034` | `#D8382E` | `#EF724F` | `#FFA67E` | 4, 16, 28, 36, 44 |
| skin medium `#C68E65` | `#884638` | `#AA6749` | `#C68E65` | `#E0B58E` | `#FADDB9` | 33, 45, 57, 65, 73 |
| sky blue `#2F8FEA` | `#383AA7` | `#3163D1` | `#2F8FEA` | `#59B7FB` | `#9CDAFF` | 275, 263, 251, 243, 235 |
| sand `#E8CF9A` | `#B0825B` | `#CEA774` | `#E8CF9A` | `#FFF5D4` | `#FFF6D2` | 62, 74, 86, 94, 95 |
| teal `#18B8A8` | `#006C77` | `#009192` | `#18B8A8` | `#76D8C0` | `#B3F7DC` | 208, 196, 184, 176, 168 |

Use these for flat-shaded 2D assets (cards, props, textures) where no light is computed. Green shadows go teal, red
shadows go crimson, skin shadows go red, blue shadows go violet. The sand row shows the limit: there is no room above
a light yellow, so the two light steps collapse; start from a darker base when you need highlights.

### Caption and overlay colours

| role | colour | notes |
|---|---|---|
| caption fill | `#FFFFFF` | never pure-white areas larger than the text itself |
| active-word highlight | `#FFE600` (or the palette's accent 2) | 15.2:1 on the stroke; 1.3:1 on white, so never without the stroke |
| stroke / box | `#140C10` or the palette ink | 3 u or thicker so it survives the 720p rendition (D) |
| warning red for text | `#FF4B3E` on the stroke: 5.8:1 | acceptable only at caption size; avoid pure `#FF0000` (D) |
| cyan label | `#19F0E0` on the stroke: 13.4:1 | good second highlight on warm scenes |

---

## C. Grading recipes mapped onto our Look fields

### What each field does, in shader order (from `post.ts`)

| step | field | effect |
|---|---|---|
| 1 | `exposure` | linear multiply before the tonemap |
| 2 | `tonemap` | `none` (clamp), `aces` (Narkowicz fit), `neutral` (Khronos PBR Neutral), `agxish` (luminance Reinhard with 8 % desaturation; not AgX) |
| 3 | sRGB encode | everything after this is display-referred |
| 4 | `contrast`, `pivot` or `knots[7]` | per-channel tone curve; knots replace the S-curve |
| 5 | `gamma` | `v ^ (1 / gamma)`; above 1 brightens the middle |
| 6 | `saturation`, `vibrance` | around Rec.709 luma of the encoded values |
| 7 | `shadowTint`, `highlightTint` | additive RGB weighted by `(1 - luma)^2` and `luma^2` |
| 8 | `zoneSat`, `tintS/M/H` | three-zone saturation and luma-neutral [Cb, Cr] tints; **only applied when `knots` is set** |
| 9 | `vignette` | multiply |
| 10 | `blackPoint`, `whitePoint` | output remap; the vignette cannot go below the black point |
| 11 | `grain` | added after the remap, weighted toward midtones (x0.25 at the extremes) |
| 12 | dither | uniform, 1 LSB wide |

To use `zoneSat` or the luma-neutral tints while keeping an S-curve, bake the S-curve into knots [M]:

- contrast 1.10, pivot 0.50: `[0, 0.0851, 0.2333, 0.5, 0.7667, 0.9149, 1]`
- contrast 1.16, pivot 0.50: `[0, 0.0773, 0.2238, 0.5, 0.7762, 0.9227, 1]`
- contrast 1.20, pivot 0.50: `[0, 0.0725, 0.2176, 0.5, 0.7824, 0.9275, 1]`
- contrast 1.22, pivot 0.50: `[0, 0.0702, 0.2146, 0.5, 0.7854, 0.9298, 1]`
- contrast 1.15, pivot 0.45: `[0, 0.0798, 0.2289, 0.5071, 0.7779, 0.9226, 1]`
- contrast 1.30, pivot 0.45: `[0, 0.0637, 0.2096, 0.5141, 0.8027, 0.94, 1]`

### The recipes

These are designed starting points, checked by simulation, not measured from references. When a reference exists its
fingerprint overrides them. Each is written as an override for `resolveLook(base, overrides)`.

```ts
// 1. pastel-soft: lifted blacks, low contrast, low saturation with vibrance, soft bloom. Pair: pastel-morning.
{ name: "pastel-soft", tonemap: "none", exposure: 1.03,
  grade: { blackPoint: 0.10, whitePoint: 0.97, contrast: 0.92, pivot: 0.5, saturation: 0.82, vibrance: 0.25,
           shadowTint: [0.012, 0, 0.03], highlightTint: [0.015, 0.008, -0.005], gamma: 1.08 },
  bloom: { enabled: true, threshold: 0.85, strength: 0.2, radius: 1.4 }, softness: 0.08,
  vignette: { amount: 0.06, softness: 0.7 }, grain: { amount: 0, size: 1 } }

// 2. toy-saturated: bright plastic-toy colour, clean, hue-safe highlights. Pair: sunny-day.
{ name: "toy-saturated", tonemap: "neutral", exposure: 1.05,
  grade: { blackPoint: 0.035, whitePoint: 0.985, contrast: 1.18, pivot: 0.5, saturation: 1.28, vibrance: 0.2,
           shadowTint: [0.02, -0.006, 0.045], highlightTint: [0.02, 0.01, -0.015], gamma: 1.0 },
  bloom: { enabled: true, threshold: 0.95, strength: 0.15, radius: 1.0 },
  vignette: { amount: 0.12, softness: 0.6 }, grain: { amount: 0, size: 1 } }

// 3. noir-hard: black and white, hard contrast, faint cool-to-warm split so it is not dead neutral. Pair: noir-doc.
{ name: "noir-hard", tonemap: "aces", exposure: 0.95,
  grade: { blackPoint: 0.012, whitePoint: 0.96, contrast: 1.38, pivot: 0.42, saturation: 0, vibrance: 0,
           shadowTint: [0, 0.002, 0.008], highlightTint: [0.008, 0.004, -0.004], gamma: 0.96 },
  bloom: { enabled: true, threshold: 0.8, strength: 0.2, radius: 1.0 }, halation: 0.06, softness: 0.05,
  vignette: { amount: 0.45, softness: 0.45 }, grain: { amount: 0.03, size: 1.3 } }

// 4. golden-hour: violet shadows, warm highlights, glow. Pair: golden-hour palette.
{ name: "golden-hour", tonemap: "neutral", exposure: 1.05,
  grade: { blackPoint: 0.055, whitePoint: 0.97, contrast: 1.16, pivot: 0.5, saturation: 1.18, vibrance: 0.2,
           shadowTint: [0.012, -0.012, 0.07], highlightTint: [0.04, 0.015, -0.035], gamma: 1.0 },
  bloom: { enabled: true, threshold: 0.85, strength: 0.35, radius: 1.5 }, halation: 0.1,
  vignette: { amount: 0.2, softness: 0.45 }, grain: { amount: 0, size: 1 } }

// 5. night-blue: low key, blue-violet blacks, cool whites, strong bloom on emissives. Pair: night-blue palette.
{ name: "night-blue", tonemap: "neutral", exposure: 0.9,
  grade: { blackPoint: 0.03, whitePoint: 0.94, contrast: 1.14, pivot: 0.42, saturation: 1.25, vibrance: 0.25,
           shadowTint: [-0.01, 0, 0.10], highlightTint: [-0.01, 0.005, 0.03], gamma: 0.94 },
  bloom: { enabled: true, threshold: 0.9, strength: 0.55, radius: 1.4 },
  vignette: { amount: 0.4, softness: 0.45 }, grain: { amount: 0, size: 1 } }   // dark gradients: see D before adding grain

// 6. rainy-teal: capped whites, low saturation, teal-leaning shadows, soft. Pair: rainy-teal palette.
{ name: "rainy-teal", tonemap: "aces", exposure: 0.92,
  grade: { blackPoint: 0.05, whitePoint: 0.90, contrast: 1.04, pivot: 0.45, saturation: 0.68, vibrance: 0.1,
           shadowTint: [-0.02, 0.012, 0.02], highlightTint: [-0.012, 0.004, 0.006], gamma: 0.98 },
  bloom: { enabled: true, threshold: 0.8, strength: 0.15, radius: 1.6 }, softness: 0.12,
  vignette: { amount: 0.25, softness: 0.55 }, grain: { amount: 0.008, size: 1 } }

// 7. retro-vhs: lifted milky blacks, capped whites, soft, colour fringing, coarse grain. Pair: retro-sunset.
//    Missing for a full VHS look: scanlines, horizontal chroma smear, head-switch noise (section F).
{ name: "retro-vhs", tonemap: "none", exposure: 1.0,
  grade: { blackPoint: 0.07, whitePoint: 0.93, contrast: 0.96, pivot: 0.5, saturation: 1.12, vibrance: 0,
           shadowTint: [0.025, -0.01, 0.04], highlightTint: [0.02, 0.005, -0.02], gamma: 1.0 },
  bloom: { enabled: true, threshold: 0.75, strength: 0.3, radius: 1.6 }, chroma: 2.2, softness: 0.3, halation: 0.15,
  vignette: { amount: 0.3, softness: 0.5 }, grain: { amount: 0.02, size: 1.6 } }

// 8. paper-print: paper-white ceiling, ink-grey floor, slightly low saturation, warm paper highlights. Pair: paper-print.
//    A static paper texture multiply would be better than animated grain (section F).
{ name: "paper-print", tonemap: "none", exposure: 1.0,
  grade: { blackPoint: 0.11, whitePoint: 0.93, contrast: 1.06, pivot: 0.5, saturation: 0.9, vibrance: 0.1,
           shadowTint: [0, 0, 0.03], highlightTint: [0.03, 0.018, -0.03], gamma: 1.04 },
  bloom: { enabled: false }, vignette: { amount: 0.1, softness: 0.7 }, grain: { amount: 0.018, size: 1.8 } }

// 9. teal-orange (restrained): teal shadows at Lab chroma about 5, warm highlights, near-neutral saturation.
{ name: "teal-orange", tonemap: "aces", exposure: 1.0,
  grade: { blackPoint: 0.025, whitePoint: 0.97, contrast: 1.14, pivot: 0.45, saturation: 1.02, vibrance: 0.12,
           shadowTint: [-0.032, 0.018, 0.026], highlightTint: [0.04, 0.012, -0.035], gamma: 1.0 },
  bloom: { enabled: true, threshold: 0.8, strength: 0.2, radius: 1.2 }, halation: 0.1,
  vignette: { amount: 0.28, softness: 0.55 }, grain: { amount: 0.012, size: 1.1 } }

// 10. bleach-bypass: half saturation, hard contrast, gritty. For war, disaster, cold facts.
{ name: "bleach-bypass", tonemap: "aces", exposure: 0.97,
  grade: { blackPoint: 0.015, whitePoint: 0.96, contrast: 1.32, pivot: 0.45, saturation: 0.48, vibrance: 0,
           shadowTint: [-0.006, 0.004, 0.012], highlightTint: [0.004, 0.004, -0.004], gamma: 0.97 },
  bloom: { enabled: true, threshold: 0.85, strength: 0.1, radius: 1.0 },
  vignette: { amount: 0.35, softness: 0.5 }, grain: { amount: 0.028, size: 1.2 } }

// 11. dream-memory: high, hazy, glowing. For flashbacks; the one place a crossfade is allowed (craft.md).
{ name: "dream-memory", tonemap: "neutral", exposure: 1.08,
  grade: { blackPoint: 0.09, whitePoint: 0.99, contrast: 0.9, pivot: 0.5, saturation: 0.9, vibrance: 0.3,
           shadowTint: [0.03, 0, 0.04], highlightTint: [0.03, 0.02, 0], gamma: 1.1 },
  bloom: { enabled: true, threshold: 0.65, strength: 0.6, radius: 1.8 }, softness: 0.3, chroma: 0.8, halation: 0.1,
  vignette: { amount: 0.25, softness: 0.6 }, grain: { amount: 0, size: 1 } }

// 12. sickly-green: green-yellow cast in shadows and highlights, low saturation. For dread, poison, illness.
{ name: "sickly-green", tonemap: "aces", exposure: 0.92,
  grade: { blackPoint: 0.03, whitePoint: 0.93, contrast: 1.16, pivot: 0.42, saturation: 0.78, vibrance: 0,
           shadowTint: [-0.015, 0.03, -0.01], highlightTint: [0, 0.02, -0.03], gamma: 0.96 },
  bloom: { enabled: true, threshold: 0.85, strength: 0.15, radius: 1.2 },
  vignette: { amount: 0.4, softness: 0.45 }, grain: { amount: 0.02, size: 1.2 } }

// 13. high-key-clean: white backgrounds stay white, crisp. For diagrams and product-style explainers.
{ name: "high-key-clean", tonemap: "none", exposure: 1.04,
  grade: { blackPoint: 0.02, whitePoint: 1.0, contrast: 1.04, pivot: 0.5, saturation: 1.08, vibrance: 0.1,
           shadowTint: [0, 0, 0.012], highlightTint: [0, 0, 0], gamma: 1.05 },
  bloom: { enabled: false }, vignette: { amount: 0.05, softness: 0.7 }, grain: { amount: 0, size: 1 } }

// 14. synthwave-neon: magenta-violet blacks, pink highlights, heavy bloom. Pair: retro-sunset.
{ name: "synthwave-neon", tonemap: "neutral", exposure: 1.05,
  grade: { blackPoint: 0.035, whitePoint: 0.98, contrast: 1.22, pivot: 0.42, saturation: 1.32, vibrance: 0.1,
           shadowTint: [0.035, -0.015, 0.09], highlightTint: [0.04, -0.012, 0.03], gamma: 0.97 },
  bloom: { enabled: true, threshold: 0.6, strength: 0.6, radius: 1.6 }, chroma: 1.4, halation: 0.2,
  vignette: { amount: 0.35, softness: 0.5 }, grain: { amount: 0.012, size: 1.2 } }

// 15. print-film-knots: film toe and shoulder, saturation falling off at both ends, luma-neutral cool shadows and
//     warm highlights. Uses the knot path, so zoneSat and tintS/H are active.
{ name: "print-film-knots", tonemap: "aces", exposure: 1.0,
  grade: { blackPoint: 0.022, whitePoint: 0.965, contrast: 1, pivot: 0.45, saturation: 1.0, vibrance: 0.1,
           shadowTint: [0, 0, 0], highlightTint: [0, 0, 0], gamma: 1.0,
           knots: [0, 0.062, 0.2, 0.5, 0.805, 0.938, 1], zoneSat: [0.85, 1.05, 0.8],
           tintS: [0.012, -0.010], tintM: [0, 0], tintH: [-0.010, 0.008] },
  bloom: { enabled: true, threshold: 0.8, strength: 0.2, radius: 1.3 }, halation: 0.12, softness: 0.1,
  vignette: { amount: 0.25, softness: 0.55 }, grain: { amount: 0.016, size: 1.2 } }

// 16. deep-cool: blue-teal low key with clean cyan whites. Pair: deep-cool palette.
{ name: "deep-cool", tonemap: "neutral", exposure: 0.95,
  grade: { blackPoint: 0.03, whitePoint: 0.95, contrast: 1.12, pivot: 0.45, saturation: 1.1, vibrance: 0.2,
           shadowTint: [-0.02, 0.01, 0.06], highlightTint: [-0.015, 0.01, 0.02], gamma: 0.97 },
  bloom: { enabled: true, threshold: 0.8, strength: 0.4, radius: 1.5 }, chroma: 0.6,
  vignette: { amount: 0.35, softness: 0.5 }, grain: { amount: 0, size: 1 } }
```

### What the recipes do (simulated) [M]

CPU port of the grade section, fed neutral greys and one mid-saturation test colour (.70, .45, .30).

| look | output black (8-bit RGB) | mid grey 0.46 becomes luma | output white (8-bit RGB) | Lab a, b of a 10 % grey | Lab a, b of a 90 % grey | saturation gain on the test colour | slope at mid grey |
|---|---|---|---|---|---|---|---|
| pastel-soft | 28, 26, 32 | 0.529 | 247, 247, 246 | +2.0, -2.8 | 0.0, +1.2 | 0.76 | 0.79 |
| toy-saturated | 14, 9, 20 | 0.468 | 251, 251, 248 | +5.3, -6.2 | -0.2, +2.7 | 1.53 | 1.11 |
| noir-hard | 3, 4, 5 | 0.449 | 245, 245, 244 | +0.1, -0.7 | 0.0, +0.9 | 0.00 | 1.29 |
| golden-hour | 17, 14, 30 | 0.473 | 247, 247, 239 | +6.6, -10.0 | 0.0, +5.4 | 1.35 | 1.06 |
| night-blue | 8, 8, 31 | 0.435 | 237, 240, 240 | +5.6, -13.9 | -0.1, -2.8 | 1.36 | 1.04 |
| rainy-teal | 13, 15, 17 | 0.437 | 227, 230, 230 | -2.2, -1.8 | -0.9, -0.5 | 0.60 | 0.88 |
| retro-vhs | 23, 18, 27 | 0.468 | 237, 237, 233 | +4.9, -4.6 | +0.2, +2.4 | 0.95 | 0.83 |
| paper-print | 28, 28, 34 | 0.500 | 237, 237, 231 | +1.2, -3.2 | -0.7, +4.3 | 0.82 | 0.87 |
| teal-orange | 6, 11, 13 | 0.466 | 247, 247, 239 | -4.0, -2.5 | +0.3, +5.3 | 1.14 | 1.07 |
| bleach-bypass | 4, 5, 7 | 0.444 | 245, 245, 244 | -0.4, -1.3 | -0.3, +0.8 | 0.55 | 1.24 |
| dream-memory | 30, 23, 32 | 0.544 | 252, 252, 252 | +3.7, -3.3 | 0.0, +1.9 | 0.88 | 0.81 |
| sickly-green | 8, 15, 8 | 0.443 | 237, 237, 230 | -6.2, +4.2 | -3.1, +4.3 | 0.80 | 1.03 |
| high-key-clean | 5, 5, 8 | 0.487 | 255, 255, 255 | +0.6, -1.6 | 0.0, 0.0 | 1.13 | 1.00 |
| synthwave-neon | 17, 9, 31 | 0.469 | 250, 247, 250 | +11.0, -12.9 | +5.2, -3.0 | 1.50 | 1.14 |
| print-film-knots | 6, 6, 11 | 0.447 | 246, 246, 242 | -0.5, -3.8 | +0.5, +2.3 | 1.27 | 1.16 |
| deep-cool | 8, 10, 22 | 0.447 | 239, 242, 242 | +0.4, -7.7 | -1.3, -1.6 | 1.17 | 1.03 |

Reading the table against the analyzer:

- "Output black" is the floor the analyzer will report as `luma_p1` when the scene contains true blacks.
- Lab a/b at 10 % and 90 % grey are what `shadow_a/b` and `high_a/b` will move toward. Lab a+ is magenta, a- green,
  b+ yellow, b- blue: `golden-hour` shadows are violet (+6.6, -10.0), `teal-orange` shadows are teal (-4.0, -2.5),
  `sickly-green` shadows are green-yellow (-6.2, +4.2).
- "Saturation gain" includes the effect of contrast. `toy-saturated` asks for 1.28 and delivers 1.53 on a mid colour.
  Watch greens and sky for clipping at that level.

### Existing presets through the same simulation [M]

| preset | output black | output white | Lab a, b of a 10 % grey | Lab a, b of a 90 % grey |
|---|---|---|---|---|
| cartoon-ink | 12, 9, 21 | 251, 251, 246 | +4.9, -7.2 | +0.1, +3.6 |
| toonworld-day | 23, 11, 11 | 240, 246, 247 | +6.2, +1.1 | +0.3, -5.9 |
| toonworld-golden | 15, 15, 34 | 247, 247, 247 | +6.4, -11.8 | +0.6, +0.1 |
| toonworld-night | 8, 8, 34 | 245, 245, 245 | +6.2, -15.0 | +1.7, -0.6 |
| cinematic-film | 5, 8, 12 | 247, 247, 241 | -0.9, -3.5 | 0.0, +4.4 |

`toonworld-day` gives red-magenta blacks (a +6.2, b +1.1, Lab hue about 10 degrees), not violet; its comment says
"magenta-violet". If the reference really measures violet there, the blue component is missing. Its `tintM` is not
applied at all (section E, gap 1).

---

## D. Delivery and compression rules

### D1. What YouTube actually serves for Shorts [M, 2026-11-11]

Format lists of five public Shorts read with yt-dlp; stream headers read with ffprobe. Video bitrates in Mbps.

| source (upload) | 720p VP9 / AV1 | 1080p H.264 / VP9 / AV1 | 1440p VP9 / AV1 | 2160p VP9 / AV1 |
|---|---|---|---|---|
| flat vector, 1080x1920 at 60 fps, two Shorts | 0.46-0.74 / 0.30-0.50 | 2.22-2.43 / 0.74-1.17 / 0.42-0.70 | not offered | not offered |
| CG, 2160x3840 at 30 fps, two Shorts | 1.35-1.48 / 0.79-1.11 | 2.06-3.27 / 1.71-2.38 / 1.01-1.65 | 5.25-7.22 / 3.46-5.31 | 14.6-16.2 / 6.68-9.83 |
| live action, 2160x3840 at 30 fps, one Short | 0.99 / 0.42 | 1.94 / 1.05 / 0.55 | 3.10 / 1.72 | 11.7 / 3.44 |

Every stream probed (H.264 High, VP9 Profile 0, AV1 Main, at 1080p and 2160p) was `yuv420p` 8-bit, `color_range=tv`,
primaries, transfer and matrix all `bt709`.

Rules that follow:

1. **The picture most viewers get is about 1-2.4 Mbps VP9 at 1080x1920, or about 0.5-1.5 Mbps at 720x1280.** That is
   0.016-0.038 bits per pixel per frame at 1080p30. Design the look to survive that [D]. Which rendition the phone
   Shorts player picks by default was not measured [U].
2. **Uploading above 1080p buys more bits per pixel, when the higher rendition is played.** VP9 at 1440p gets about 3x
   the 1080p bitrate for 1.78x the pixels, and 2160p gets 7-11x for 4x the pixels [M]. The skill's 1440x2560 and
   2160x3840 Shorts renders do receive their own renditions.
3. **YouTube's Shorts help page says "You can upload Short videos with a maximum resolution of 1080p"** [P]. That
   conflicts with the 1440p and 2160p Shorts streams measured above; the measurement is what the platform does today.
   Keep rendering at 2K or 4K, and keep QA honest by also checking the 1080p and 720p renditions.
4. **Flat art is cheap.** The flat-vector Shorts needed about half the bitrate of CG at the same size. Flat colour,
   clean ink lines and no grain compress well; texture, grain and particles cost [M + D].

### D2. Upload settings [P unless marked]

YouTube's recommended upload encoding:

- MP4, moov atom at the front, no edit lists. H.264 High profile, progressive, 2 consecutive B-frames, closed GOP of
  half the frame rate, CABAC, variable bitrate, chroma 4:2:0. Audio AAC-LC or Opus, 48 kHz, stereo 384 kbps.
- SDR bitrates: 1080p 8 Mbps (12 at 48-60 fps); 1440p 16 (24); 2160p 35-45 (53-68).
- Colour: BT.709 primaries, transfer and matrix. "YouTube converts full range to limited range." An sRGB transfer tag
  is converted to BT.709. An unspecified transfer is assumed to be BT.709. Do not upload with an RGB matrix.

For this engine:

5. **Keep tagging BT.709 and limited range** (`render.mjs` already passes `colorSpace: "bt709"`, `yuv420p`). The frames
   are sRGB-encoded, and the BT.709 tag is the normal web practice; tagging them as sRGB would make YouTube convert
   the pixel values [P for the conversion; the visual equivalence is U and worth one round-trip test, F8].
6. **CRF 14 is the right order of size.** It gives about the recommended 16 Mbps at 1440p on our content [K]. The
   upload only has to be clean enough that YouTube's encoder is not re-encoding our artefacts.
7. **Verify after encoding, with ffprobe:** `pix_fmt=yuv420p`, `color_range=tv`, `color_space`, `color_transfer` and
   `color_primaries` all `bt709`. A missing tag is a silent risk.
8. A complete command for a manual re-encode (the flags are standard ffmpeg/x264 options; the `aq-mode=3` dark-bias
   setting is a suggestion that I did not test against YouTube's result [U]):

   ```
   ffmpeg -i in.mov -c:v libx264 -preset medium -crf 14 -profile:v high -pix_fmt yuv420p -bf 2 -g 15 \
     -x264-params "open-gop=0:aq-mode=3" \
     -vf "scale=out_color_matrix=bt709:out_range=tv" \
     -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
     -movflags +faststart -c:a aac -b:a 384k -ar 48000 out.mp4
   ```
   (`-g 15` is half of 30 fps; use 30 for 60 fps.)

### D3. Banding, dither and grain: an experiment [M]

Setup: a 1080x1920, 30 fps, 2 s night-sky gradient (RGB 10,12,40 to 38,52,110 with a soft vignette, about 40 luma
steps over the frame height). Seven ways of getting to 8 bits, then x264 CRF 14 with BT.709 limited range (the engine's
upload), then VP9 as a stand-in for YouTube's transcode. Two metrics on a decoded frame:

- `flat8`: share of 8x8 luma blocks with no variation at all. Flat plateaus are what bands are made of.
- `step`: the 99th percentile of the row-to-row jump in a 64 px wide mean profile, in LSB. 1.0 means clean one-level
  stairs; lower means the stairs have been dissolved.

| 8-bit conversion | upload size (x264 CRF 14) | upload flat8 / step | after VP9 "2M" flat8 / step | after VP9 "1M" step | after AV1 step |
|---|---|---|---|---|---|
| plain rounding, no dither | 0.14 Mbps | 0.85 / 1.00 | 0.87 / 0.94 | 0.91 | 1.00 |
| uniform noise 1 LSB wide (what the engine does now) | 3.47 | 0.63 / 0.29 | 0.83 / 0.31 | 0.50 | 0.55 |
| triangular noise 2 LSB wide, new every frame | 2.92 | 0.61 / 0.29 | 0.83 / 0.39 | 0.48 | 0.57 |
| triangular noise 2 LSB wide, same every frame | 1.54 | 0.08 / 0.31 | 0.71 / 0.40 | 0.55 | 0.99 |
| high-passed ("blue-ish") triangular noise, new every frame | 2.52 | 0.67 / 0.29 | 0.82 / 0.34 | 0.34 | 0.56 |
| grain, sigma 2 LSB | 46.0 | 0.01 / 0.72 | 0.85 / 0.50 | 0.67 | 1.00 |
| grain, sigma 4 LSB | 102.8 | 0.00 / 1.50 | 0.77 / 0.50 | 0.50 | 0.93 |

The VP9 and AV1 encodes did not reach their bitrate targets on this easy clip (VP9 used 0.1-0.9 Mbps on the dithered
versions), so the encoders were quality-limited, not starved; they flattened the noise by choice.

And the effect of the JPEG intermediate that `render.mjs` uses by default (`imageFormat: "jpeg"`, quality 95), using
OpenCV's JPEG encoder as a stand-in for Chromium's:

| frames handed to x264 | flat8 before x264 | upload size | upload flat8 / step | after VP9 step |
|---|---|---|---|---|
| triangular dither, lossless frames | 0.00 | 2.92 Mbps | 0.61 / 0.29 | 0.39 |
| triangular dither, JPEG q95 frames | 0.30 | 7.87 | 0.54 / 0.42 | 0.50 |
| uniform dither (engine today), JPEG q95 frames | 0.47 | 6.65 | 0.62 / 0.39 | 0.50 |
| triangular dither, JPEG q100 frames | 0.01 | 5.15 | 0.39 / 0.28 | 0.50 |
| no dither, JPEG q95 frames | 0.88 | 0.13 | 0.83 / 1.00 | 1.00 |

What this shows, with the limits of one synthetic static clip and libvpx/SVT-AV1 instead of YouTube's encoders:

9. **Dither is worth it.** One or two LSB of noise dissolves the stair edges to about a third of their height at upload
   (step 1.0 to 0.29) and they are still a third to a half after a low-bitrate VP9 or AV1 pass (0.31-0.57), where
   the undithered version stays at 0.9-1.0. The delivery encoder removes most of the noise itself (flat8 back to
   0.8+) but the band edges stay softened.
10. **Dither is not free.** This gradient needs 0.14 Mbps clean and about 3 Mbps dithered. On real scenes the share is
    smaller, but it is the same mechanism as "grain multiplies file size x3-4" [K].
11. **Grain is a bad way to buy de-banding.** Sigma 2 LSB costs 46 Mbps at CRF 14 on this clip, fifteen times the
    dither, and after delivery encoding it protects the gradient no better (step 0.5-1.0). The delivery encoder
    throws the grain away. Use grain only when the look wants visible grain, and expect little of it to arrive.
    YouTube's HDR guidance makes the same point from the other side: it may remove noise to meet streaming bitrates
    and recommends denoising first [P]. Netflix's film-grain synthesis work reports about 30 % bitrate saved when
    grain is removed before encoding and re-synthesised in the player [S].
12. **High-passed noise survived best at the lowest bitrate** (VP9 "1M" step 0.34 against 0.48-0.50 for white noise) and
    cost 14 % less at upload. This agrees with the graphics literature, which calls blue noise "the way to go" when a
    texture lookup is affordable [P, Wronski] and recommends triangular noise 2 LSB wide over uniform noise 1 LSB wide
    [P, Gjol].
13. **A static dither pattern is the cheapest at upload (1.5 Mbps) and survives x264 best, but falls apart at low
    delivery bitrate** (AV1 step 0.99). It is also the "dirty window" pattern Gjol warns about. Animate the noise.
14. **The JPEG q95 intermediate erases the dither in 30-47 % of blocks, more than doubles the upload bitrate of dark
    gradients, and leaves harder steps (0.42 against 0.29).** For night scenes and other gradient-heavy shots render
    with `--image-format png`.

### D4. Chroma subsampling: what breaks and how to avoid it

15. **4:2:0 halves chroma resolution in both directions.** At 1080x1920 the colour planes are 540x960. A luma edge stays
    sharp; an edge drawn mainly by colour spreads, and saturated colour next to its complement loses brightness at the
    border because luma is computed from gamma-encoded values [S, Wikipedia]. Reconstructed chroma can also land
    outside the RGB range and clip, for example around sharp red/black detail [S].
16. **Why red and blue are the worst cases** [D]: in BT.709 a pure red has luma code 63 and a pure blue 32, out of
    16-235, with chroma at the rail (Cr 240 for red, Cb 240 for blue). Almost all of their signal is in the
    half-resolution planes. Green (luma 173) and yellow (219) carry their edges in luma.

    | colour | Y' (16-235) | Cb (16-240) | Cr (16-240) |
    |---|---|---|---|
    | red `#FF0000` | 63 | 102 | 240 |
    | blue `#0000FF` | 32 | 240 | 118 |
    | magenta `#FF00FF` | 78 | 214 | 230 |
    | green `#00FF00` | 173 | 42 | 26 |
    | yellow `#FFFF00` | 219 | 16 | 138 |
    | accent red `#FF4B3E` | 112 | 104 | 208 |

17. **Rules** [U, derived from 15-16]:
    - Every important edge needs a luma difference. Red on blue (2.2:1) and red on green (1.15:1) are colour-only
      edges and will be soft and ragged after delivery.
    - The ink line is also a compression tool: a dark line between two saturated regions hides the chroma bleed.
    - Thin saturated details (text strokes, wires, small icons) should be at least 3 u wide, which is 3 px in the
      1080p rendition and 2 px at 720p.
    - Prefer `#FF4B3E` over `#FF0000`: it has nearly twice the luma code (112 against 63) and leaves chroma off the
      rail.
    - Never put small saturated red or blue text on black or on its complement. Use white or yellow fill with a dark
      stroke and keep red for large shapes.

### D5. Safe levels

18. **Black floor.** Keep the graded floor at 0.02-0.05 (5-13 of 255) for stylized looks [K], and keep anything the
    viewer must see above about 0.06 (15 of 255) [U]. Reason: near-black steps RGB 1-5 are the ones OLEDs lose [S],
    and a phone at low brightness in a dark room has even less to work with [U].
19. **White ceiling.** 0.95-0.985 for cartoon looks [K]. The upload is full-range RGB converted to limited range, so
    there are no illegal levels to worry about; EBU R103's broadcast tolerance (8-bit 5-246 preferred, 16-235
    nominal) only matters for television delivery [S].
20. **Limited range costs levels.** 256 full-range codes map onto 220 luma codes, so about one in seven adjacent luma
    levels merges [D]. That is one more reason dark gradients band after delivery and one more reason to dither.
21. **Channel clipping.** A saturated colour can clip one channel while luma is far from white. Under a clamp or a
    per-channel tonemap this skews hue (A5.43). Keep albedo x light under 1.0 for saturated surfaces, or use the
    `neutral` tonemap.

### D6. Phones

22. **Viewing conditions are uncontrolled.** Auto-brightness, True Tone and Night Shift move brightness and white point;
    Night Shift warms the whole display on a schedule [S]. Reported "typical indoor" phone brightness ranges from 200
    to 800 nits depending on the source [S, conflicting]. Outdoors, reflections lift the blacks [U].
    Consequence: story-critical information must be carried by value contrast in the middle of the range, not by a
    subtle warm/cool difference or by shadow detail.
23. **Colour management.** iOS is colour-managed and treats untagged content as sRGB [S]. SDR Shorts are BT.709 [M], so
    on a managed wide-gamut phone they are not stretched to the panel's gamut. Android behaviour varies by device and
    display mode [U]. Do not design for extra saturation "because phones are vivid".
24. **HDR.** Stay SDR. HDR upload needs 10-bit or more, Rec.2020 primaries, PQ or HLG, and correct metadata;
    YouTube then derives the SDR version automatically, "may be imperfect", and mis-tagged files are badly distorted
    [P]. Our canvas is 8-bit sRGB, so there is no real HDR signal to deliver.
25. **Text.** Caption contrast is decided by the stroke (A4.31). Keep the craft.md rule of 4.5:1 against the picture and
    measure it after compression at the 720p rendition (F8, F9). With APCA as a second check, aim for an absolute Lc
    of 75 or more between fill and stroke; white on our ink is 108.

### D7. Export checklist

| check | target | source |
|---|---|---|
| container, codec | MP4 faststart, H.264 High, yuv420p, 2 B-frames, closed GOP = fps / 2 | [P] |
| tags | bt709 primaries / transfer / matrix, range tv | [P], [M] |
| upload bitrate | 1080p 8-12 Mbps, 1440p 16-24, 2160p 35-68 (CRF 14 lands there) | [P], [K] |
| intermediate frames | PNG for dark or gradient-heavy shots; JPEG q95 is acceptable elsewhere | [M] |
| dither | on, animated, 1-2 LSB | [M], [P] |
| grain | off unless the look needs it; never as de-banding | [M] |
| black floor / white ceiling | p1 0.02-0.05, p99 0.95-0.985 for stylized looks | [K] |
| saturated edges | luma edge or ink line on every one; thin details 3 u or wider | [U] |
| delivery proxy | re-encode to VP9 1080p near 1.5 Mbps and 720p near 0.7 Mbps and look at it | [M] for the numbers |

---

## E. What our engine has, and the gaps

### Has (from `look.ts`, `post.ts`, `frame_metrics.py`, `analyze.py`, `compare.py`, `render.mjs`)

- **Pipeline:** half-float scene with 4x MSAA; ink, DOF, motion blur, bloom (soft knee, dual filter), halation as a
  red-tinted share of the bloom; a single finishing pass in the order listed in section C.
- **Tonemaps:** `none`, `aces` (the Narkowicz fit, without the 0.6 pre-scale), `neutral` (Khronos PBR Neutral, constants
  0.76 and 0.15 match the published ones), `agxish` (a luminance Reinhard with 8 % desaturation and a 1.15 gain; it
  is not AgX).
- **Grade:** S-curve with pivot or a 7-knot monotone curve (Fritsch-Carlson tangents on the CPU); gamma; saturation and
  vibrance; additive split tone; three-zone saturation and luma-neutral Cb/Cr tints; vignette; output black and white
  points; midtone-weighted grain; dither.
- **Look tooling:** presets per lighting setup, `lerpLook`, `lookTimeline` with eased cross-fades, `lookFromSuggestion`.
- **Analyzer colour metrics:** Rec.709 luma mean, std and percentiles (p1, p5, p50, p95, p99); black and white clip
  shares; HSV saturation mean and p90; Hasler-Susstrunk colourfulness (formula matches the paper's structure [S]);
  warmth as mean R-B; CIELAB a/b of the darkest 20 %, brightest 20 % and the middle; k-means (k = 6, Lab) palette per
  shot; grain sigma. `vfa compare` has per-metric tolerances and advice.
- **Text contrast:** WCAG ratio in `thumbcheck.py` for thumbnails; a 4.5:1 rule for captions in craft.md.
- **Export:** H.264 CRF 14, `yuv420p`, `colorSpace: "bt709"`, JPEG q95 intermediate frames by default, PNG optional.

### Gaps, in order of impact

1. **Zone tints and zone saturation are silently ignored without knots.** In `render()` the `uTS/uTM/uTH/uZSat`
   uniforms are only set, and the shader block only runs, when `grade.knots` has 7 entries. `toonworld-day` sets
   `tintM: [0.012, -0.01]` with no knots, so that tint has never been applied. Any future preset that sets
   `zoneSat` or `tintS/M/H` on the S-curve path fails the same way.
2. **Hue skew on over-range colour.** The toon looks use `tonemap: "none"`, which is a clamp, and the ACES option is a
   per-channel fit. Both turn an over-bright orange into yellow (hue 71 to 100-104) and blue into cyan (264 to
   231-238) [M]. Bloom adds light on top of scene colour before the tonemap, so emissive sources are exactly where
   this bites. There is no gamut compression step.
3. **Dither and intermediates.** The dither is uniform and 1 LSB wide where the literature and our test favour
   triangular 2 LSB or blue noise; its hash is offset by `frame` on both axes, so the same pattern slides one pixel
   diagonally per frame instead of being re-drawn; and the default JPEG q95 intermediate removes a third to a half of
   it in dark gradients [M]. Grain is scaled to x0.25 in the darkest tones, so it does not help there either.
4. **No hue-preserving, perceptual colour maths anywhere.** Saturation and vibrance work on gamma-encoded values with
   Rec.709 weights; vibrance uses max-min; `lerpLook` switches colour strings at t = 0.5 instead of interpolating
   them; there is no OKLab helper for palettes, gradients, fog or ramps. (I did not audit every material and sky
   shader for gamma-space mixing; that is worth a pass.)
5. **Missing grade controls.** No white balance (temperature / tint); no hue-vs-sat or hue-vs-hue, so "greens and sky
   clip first" can only be fixed by desaturating everything; no skin protection; no CDL-style linear trims before the
   tonemap; the split tone has no balance control and is not luma-neutral (it shifts luma by 0.002-0.005 at 10 %
   grey, small) [M]; negative shadow tints cannot take effect at true black because the result is clamped at zero.
6. **The measured `warmth` has nowhere to go.** `look_suggestion.json` carries `warmth`, but `Look` has no field for it
   and `lookFromSuggestion` drops it.
7. **`look_suggestion` infers the grade from scene statistics, not from a transform fit.** `contrast = luma_std / 0.22`
   and `saturation = sat_mean / 0.40` describe the picture, not the grade: a naturally colourful scene and a
   strongly graded dull one get the same number. Nothing produces `knots`, `zoneSat` or `tintS/M/H`; they are
   hand-entered.
8. **Analyzer colour metrics are not perceptual.** HSV saturation is hue-dependent and unstable in darks (a nearly
   black pixel can read as saturation 1.0). Shadow and highlight zones are percentile-based, so a high-key frame's
   "shadows" are its midtones. There is no hue histogram, no dominant/secondary/accent shares, no subject-background
   value gap, no per-channel clipping, no banding metric, no shot-to-shot colour consistency, no skin check.
9. **No delivery-proxy check.** QA looks at our master, not at what YouTube will make of it at 1-2 Mbps.
10. **Caption contrast is not measured on the video.** `vfa ocr` already extracts `fill_hex` and `outline_hex` per
    page; nothing turns them into a WCAG or APCA number against the actual background. No colour-blind simulation.
11. **No LUT path** in either direction (cannot load a `.cube`, cannot export a Look as one for ffmpeg or Resolve).
12. **Stylized finishing gaps.** No static paper texture, no scanlines or horizontal chroma smear for VHS, no coloured
    or white vignette, no halftone or posterise stage. Halation shares the bloom's threshold and radius.
13. **Palettes are not data.** Colours live as hex strings in projects and light presets; there is no `Palette` type that
    carries key and ambient lights, derives shadow colours and can be checked.

---

## F. The most valuable upgrades

Ordered by value for effort. Each has a sketch concrete enough to implement.

### F1. Make zone tints and zone saturation always available (bug fix, an hour)

Run the zone block whenever any of `zoneSat`, `tintS`, `tintM`, `tintH` is set, independent of `knots`.

```ts
// post.ts render(): replace the knots-only branch
const hasKnots = !!(g.knots && g.knots.length === 7);
f.uUseKnots.value = hasKnots ? 1 : 0;
if (hasKnots) { f.uKy.value = g.knots; f.uKm.value = monoTangents(KX, g.knots!); }
const zones = !!(g.zoneSat || g.tintS || g.tintM || g.tintH);
f.uUseZones.value = zones ? 1 : 0;
(f.uZSat.value as THREE.Vector3).set(...(g.zoneSat ?? [1, 1, 1]));
(f.uTS.value as THREE.Vector3).copy(cbcr(g.tintS)); (f.uTM.value as THREE.Vector3).copy(cbcr(g.tintM)); (f.uTH.value as THREE.Vector3).copy(cbcr(g.tintH));
```
```glsl
uniform int uUseZones;
...
if (uUseZones == 1) { /* the existing 3-zone block, unchanged */ }
```

Then re-measure `toonworld-day` against its reference, because its mid tint will switch on for the first time.

### F2. Better dither, and lossless frames where it matters

- Triangular, 2 LSB wide, re-drawn every frame; reduce to uniform near 0 and 1 so the mean is preserved (Gjol).
- Optionally a 64x64 blue-noise texture (void-and-cluster) with a per-frame offset; in our test high-passed noise held
  up best at low delivery bitrate.
- `render.mjs`: choose PNG automatically when a look is low-key (for example mean luma under 0.3 or
  `blackPoint`-to-median range under 0.25), or expose `look.dither.intermediate = "png"`.

```glsl
// FINAL, replacing the last dither line
vec2 dp = gl_FragCoord.xy + vec2(mod(frame * 37.0, 256.0), mod(frame * 91.0, 256.0));   // new field every frame
float n1 = h12(dp), n2 = h12(dp + 19.19);
float tri = n1 + n2 - 1.0;                                    // triangular, [-1, 1]
float lum = dot(v, vec3(0.2126, 0.7152, 0.0722));
float edge = min(lum, 1.0 - lum) * 255.0;                     // distance to the rails, in LSB
v += mix(n1 - 0.5, tri, clamp(edge, 0.0, 1.0)) / 255.0;      // uniform at the rails, triangular elsewhere
```

Expected result from D3: band steps at delivery about one third to one half of the undithered height; upload cost of
roughly 3 Mbps on a pure dark gradient, far less on real scenes.

### F3. Stop hue skew in highlights

Smallest change: make `neutral` the tonemap of the toon presets (it is 1:1 below 0.76, so palette colours survive) and
keep `none` for flat-vector work where nothing exceeds 1. Better: add a hue-preserving soft clip before the sRGB encode
for the `none` path.

```glsl
// compress by the peak channel so ratios (hue) are kept, then desaturate only what still exceeds 1
vec3 softClipHue(vec3 c){
  float pk = max(c.r, max(c.g, c.b));
  if (pk <= 0.8) return c;
  float np = 0.8 + 0.2 * (1.0 - exp(-(pk - 0.8) / 0.2));     // 0.8..inf -> 0.8..1.0
  c *= np / pk;
  return mix(c, vec3(np), smoothstep(1.0, 3.0, pk) * 0.6);     // very bright colours head for white
}
```

Check: the four over-range test colours in A5.43 should stay within 5 degrees of their true OKLCH hue.

### F4. `lib/color.ts`: an OKLab toolkit

One small module used by palettes, look interpolation, sky and fog gradients, and CPU-side checks.

```ts
export type RGB = [number, number, number];                    // sRGB 0..1, gamma-encoded
export const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export function oklab([r, g, b]: RGB): RGB {
  r = toLinear(r); g = toLinear(g); b = toLinear(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function linearFromOklab([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
        s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
export const oklch = (c: RGB): RGB => { const [L, a, b] = oklab(c); return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360]; };
/** constant-L, constant-h chroma reduction (CSS Color 4 style binary search) */
export function fromOklch(L: number, C: number, h: number): RGB {
  const at = (c: number) => linearFromOklab([L, c * Math.cos(h * Math.PI / 180), c * Math.sin(h * Math.PI / 180)]);
  const ok = (v: RGB) => v.every((x) => x >= -1e-4 && x <= 1 + 1e-4);
  if (L >= 1) return [1, 1, 1]; if (L <= 0) return [0, 0, 0];
  let lo = 0, hi = C, v = at(C);
  if (!ok(v)) { while (hi - lo > 1e-4) { const mid = (lo + hi) / 2; ok(at(mid)) ? (lo = mid) : (hi = mid); } v = at(lo); }
  return v.map((x) => toSrgb(Math.min(1, Math.max(0, x)))) as RGB;
}
export const mixOklab = (a: RGB, b: RGB, t: number): RGB => { const A = oklab(a), B = oklab(b);
  const [L, C, h] = (([l, x, y]) => [l, Math.hypot(x, y), (Math.atan2(y, x) * 180 / Math.PI + 360) % 360])(A.map((v, i) => v + (B[i] - v) * t) as RGB);
  return fromOklch(L, C, h); };
export const deltaEOK = (a: RGB, b: RGB) => Math.hypot(...oklab(a).map((v, i) => v - oklab(b)[i]));   // JND about 0.02
/** hue-shifted ramp: steps < 0 are shadows, > 0 lights */
export function rampStep(base: RGB, i: number, o = { dL: 0.11, shadowHue: 285, lightHue: 95, shadowDeg: 12, lightDeg: 8 }): RGB {
  const [L, C, h] = oklch(base); const target = i < 0 ? o.shadowHue : o.lightHue;
  const d = ((target - h + 540) % 360) - 180, step = (i < 0 ? o.shadowDeg : o.lightDeg) * Math.abs(i);
  const hh = h + Math.sign(d) * Math.min(Math.abs(d), step);
  const cc = i < 0 ? C * (i === -1 ? 1.1 : 1.05) : C * (1 - 0.18 * i);
  return fromOklch(Math.min(0.97, Math.max(0.05, L + o.dL * i)), cc, (hh + 360) % 360);
}
```

Uses: `lerpLook` interpolates `ink.color` (and any future colour fields) with `mixOklab`; sky and fog gradients get
OKLab stops; `rampStep` generates card shading colours; `deltaEOK` powers consistency checks.

### F5. Palettes as data, with checks

```ts
export type Palette = { name: string; skyTop: string; skyHorizon: string; far: string;
  key: { color: string; gain: number }; ambient: { color: string; gain: number };
  accent: string; accent2: string; ink: string };
/** lit and shadow colour of any albedo under a palette, in linear light (bounce = 0.2 for skin) */
export function lightSurface(albedo: string, p: Palette, bounce = 0): { lit: string; shadow: string } { /* B formulas */ }
export function checkPalette(p: Palette, skin: string[], ground: string): string[] { /* returns warnings: */ }
//  - L gap skin-sky and skin-ground under 0.12: "needs ink/rim/DOF"
//  - accent fails two of three (hue >= 90, dL >= 0.20, dC >= 0.05) against sky and ground
//  - accent vs ground deltaE-OK under 0.08 after deuteranopia simulation
//  - white caption worst-case WCAG under 4.5: "stroke required" (informational)
```

Ship the twelve palettes of section B as `PALETTES`, and let `lights()` presets and `toonifyScene` take a palette so
key, ambient, fog and sky stay tied together. The style bible template then records one palette name per beat.

### F6. `vfa gradefit`: fit the grade as a transform, not as a description

Input: reference frames (per lighting setup) and our render of a comparable shot with the neutral look. Output: a
patch for `Look.grade` with `knots`, `zoneSat`, `tintS/M/H`, `blackPoint`, `whitePoint`.

```python
def gradefit(ref_rgb, ours_rgb):                       # float 0..1 arrays, any sizes
    yr, yo = luma(ref_rgb), luma(ours_rgb)
    bp, wp = np.percentile(yr, 1), np.percentile(yr, 99)
    # 1. tone curve by histogram (CDF) matching: where must OUR luma quantiles land to look like the reference?
    q = np.linspace(0.5, 99.5, 200)
    src, dst = np.percentile(yo, q), (np.percentile(yr, q) - bp) / max(wp - bp, 1e-3)
    knots = np.interp([0, .1, .25, .5, .75, .9, 1], src, np.clip(dst, 0, 1))
    knots[0], knots[-1] = 0.0, 1.0
    knots = np.maximum.accumulate(knots)               # keep it monotone
    # 2. per-zone chroma ratio (OKLab) -> zoneSat; 3. per-zone mean a/b difference -> luma-neutral tints
    zones = lambda y: [y < np.percentile(y, 30), (y >= np.percentile(y, 30)) & (y <= np.percentile(y, 70)), y > np.percentile(y, 70)]
    Lr, Lo = oklab(ref_rgb), oklab(apply_curve(ours_rgb, knots))
    zs, tints = [], []
    for mr, mo in zip(zones(yr), zones(yo)):
        cr, co = np.hypot(Lr[mr, 1], Lr[mr, 2]).mean(), np.hypot(Lo[mo, 1], Lo[mo, 2]).mean()
        zs.append(float(np.clip(cr / max(co, 1e-4), 0.5, 2.0)))                  # Reinhard-style scale, clamped
        tints.append(ab_to_cbcr(Lr[mr, 1:].mean(0) - Lo[mo, 1:].mean(0) * zs[-1]))
    return {"blackPoint": bp, "whitePoint": wp, "knots": knots.round(4).tolist(), "zoneSat": zs,
            "tintS": tints[0], "tintM": tints[1], "tintH": tints[2]}
```

Loop: render stills with the neutral look, fit, render with the fitted look, run `vfa compare`, fit the residual once
more. This separates "the scene is different" from "the grade is different", which the current suggestion cannot. It
needs F1 first.

### F7. Analyzer colour metrics v2

Add to `color_metrics` (cheap at 512 px):

| metric | how | used for |
|---|---|---|
| `ok_chroma_mean`, `ok_chroma_p90` | OKLCH chroma per pixel | perceptual saturation; replaces HSV in compare (keep HSV for continuity) |
| `hue_hist12`, `dominant_share`, `secondary_share`, `accent_share`, `accent_hue` | chroma-weighted 12-bin OKLCH hue histogram; accent = small-area bin with the highest mean chroma | the 60-30-10 check; hue families per scene |
| `chan_clip` | share of pixels with any channel at 252 or more while luma is under 0.9 | saturated clipping and hue skew |
| `subject_bg_dL` | OKLab L of the centre region (or the pose/face box when available) minus its surrounding ring | value separation, rule A1.1 |
| `band_flat8`, `band_step` | the two metrics from D3, on regions with low gradient energy | banding risk |
| `shadow_abs_*`, `highlight_abs_*` | a/b of pixels with L under 0.25 and over 0.75 (absolute zones) next to the percentile zones | high-key and low-key frames |
| `shot_dE` | deltaE-OK between matched palette clusters of consecutive shots in one setup | consistency, target 0.04 or less |
| `skin_hue_ok` | where a face is found: OKLCH hue of the face region against 45-65 under near-white light | skin drift |

`vfa compare` rows: OK chroma (tolerance 0.015), accent share (0.03), subject separation (0.05), band step (0.15).

### F8. Delivery-proxy QA

`vfa qa --delivery V`: re-encode the master the way the platform will, then measure and make sheets from that.

```
ffmpeg -i master.mp4 -vf scale=1080:1920:flags=lanczos -c:v libvpx-vp9 -b:v 1500k -deadline good -cpu-used 2 -pix_fmt yuv420p -an proxy_1080.webm
ffmpeg -i master.mp4 -vf scale=720:1280:flags=lanczos  -c:v libvpx-vp9 -b:v 700k  -deadline good -cpu-used 2 -pix_fmt yuv420p -an proxy_720.webm
```

Bitrates come from D1 (CG content; halve them for flat vector). Report: `band_step` and `flat8` on dark shots, caption
contrast (F9), SSIM against the master for the worst five shots, and a side-by-side crop sheet. Also add a one-time
round-trip test: a colour chart rendered by the engine, encoded, decoded with ffmpeg as BT.709 limited, compared
with the source in deltaE-OK. It settles the sRGB-pixels-with-BT.709-tag question on our exact pipeline.

### F9. Caption and overlay contrast on the real video, with a colour-blind pass

For every caption page from `vfa ocr` (it already has `fill_hex`, `outline_hex`, the box and the frame range):

- WCAG ratio and APCA Lc of fill against outline, and of outline against the 5th and 95th percentile luma of the
  picture just outside the box. Fail under 4.5:1 for fill/outline; warn when the outline is thinner than 3 u at
  delivery size.
- Highlight word against the normal fill: deltaE-OK of 0.15 or more, and still 0.08 or more after deuteranopia and
  protanopia simulation, so the active word is not a hue-only cue.

```python
MACHADO = {  # severity 1.0, Machado et al. 2009; apply to LINEAR RGB (assumption, the project page does not state it)
 "protan": [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
 "deutan": [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
 "tritan": [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]}
def apca(txt, bg):                                    # sRGB 0..1 triples -> signed Lc
    Y = lambda c: sum(k * v ** 2.4 for k, v in zip((0.2126729, 0.7151522, 0.0721750), c))
    clamp = lambda y: y if y > 0.022 else y + (0.022 - y) ** 1.414
    yt, yb = clamp(Y(txt)), clamp(Y(bg))
    if abs(yb - yt) < 0.0005: return 0.0
    if yb > yt: s = (yb ** 0.56 - yt ** 0.57) * 1.14; return 0.0 if s < 0.1 else (s - 0.027) * 100
    s = (yb ** 0.65 - yt ** 0.62) * 1.14; return 0.0 if s > -0.1 else (s + 0.027) * 100
```

The same simulation applies to diagrams: any two categorical colours must keep deltaE-OK 0.08 or more under all three
matrices, or carry a label or shape.

### F10. 3D LUT in and out

- **Export:** evaluate the display-referred part of a Look (curve, gamma, saturation, tints, zones, black/white remap)
  on a 33x33x33 grid and write `.cube` (red fastest). Use: apply our look to stock footage or stills with ffmpeg
  (`-vf lut3d=look.cube:interp=tetrahedral`) so mixed-media videos share one grade; hand a look to an editor.
- **Import:** load a `.cube` as a `THREE.Data3DTexture` (RGBA half-float, linear filter) and sample it after the sRGB
  encode and before the vignette: `v = mix(v, texture(uLut, v * (N - 1.0) / N + 0.5 / N).rgb, uLutMix);`. The half-texel
  scale and offset matter; without them the LUT's ends are wrong. Trilinear filtering is acceptable at 33 or more.
- A LUT only covers the per-pixel colour part. Bloom, halation, vignette and grain stay in the Look.

```ts
export function lookToCube(g: Look["grade"], N = 33): string {
  const rows = [`TITLE "video-forge"`, `LUT_3D_SIZE ${N}`];
  for (let b = 0; b < N; b++) for (let gI = 0; gI < N; gI++) for (let r = 0; r < N; r++)
    rows.push(gradeCPU([r / (N - 1), gI / (N - 1), b / (N - 1)], g).map((x) => x.toFixed(6)).join(" "));
  return rows.join("\n");
}
```

`gradeCPU` is the CPU port of the shader's grade block; `colour_calc.py` has a working Python version to translate.
Keep the two in step with a unit test on a few hundred random colours.

### F11. Grade controls that are missing

- **White balance** before the tonemap: `c *= vec3(1.0 + t, 1.0, 1.0 - t) * vec3(1.0, 1.0 - m, 1.0)` with small
  temperature `t` and tint `m`, normalised to keep luma. Gives `warmth` from the analyzer a field to drive.
- **Hue-vs-sat** with six weights (R, Y, G, C, B, M): compute hue from the encoded colour, blend the two nearest
  weights, scale chroma around luma. Enough to pull greens and sky back without touching skin.
- **Skin-safe vibrance:** reduce the vibrance boost for hues within 25 degrees of the skin hue.
- **Luma-neutral split tone:** express `shadowTint`/`highlightTint` as [Cb, Cr] like the zone tints, or subtract the
  tint's own luma. Add a `balance` field to move the crossover.
- **CDL trims** (slope, offset, power) before the tonemap for exposure-like corrections that respect scene light.

### F12. Stylized finishing stages and the colour-script sheet

- **Paper:** a static, tiling paper-fibre texture multiplied in display space (strength 0.03-0.08), not animated.
- **VHS:** horizontal chroma blur (blur Cb/Cr over 6-10 u, leave luma), scanline modulation of 2-3 %, luma noise that
  is horizontally stretched, a slight vertical jitter on cuts.
- **Vignette colour:** tint and a "white vignette" option for dream looks; a focal vignette centred on the subject.
- **Halation of its own:** a wider, red-only blur of the brightest highlights, independent of bloom threshold.
- **Colour-script sheet:** `render.mjs --colourscript` renders one small still per beat from the `lookTimeline` keys and
  lays them in a strip with each beat's palette swatches, luma mean, OK chroma and warmth underneath. It is the
  planning and review tool behind rule A2.14 and makes "every beat looks the same" visible before a full render.

---

## G. Sources

### Fetched and read (P)

| URL | supports |
|---|---|
| https://bottosson.github.io/posts/oklab/ | OKLab design goals, exact matrices, CIELAB/HSV hue problems, fitting data, limits (A4.23-24) |
| https://bottosson.github.io/posts/colorwrong/ | why gamma-space blending is wrong; linear for physical operations (A4.25) |
| https://bottosson.github.io/posts/gamutclipping/ | RGB clamping distorts hue; projection methods; adaptive L0 alpha 0.05; the cusp (A4.27) |
| https://www.w3.org/TR/css-color-4/ | Oklab as default interpolation space, legacy sRGB exception, HSL hue non-uniformity, gamut mapping in OKLCH with JND 0.02 and epsilon 0.0001, deltaE-OK definition, shorter hue arc (A2.9, A4.25-28) |
| https://www.w3.org/TR/WCAG21/ | contrast thresholds 4.5:1, 3:1, 7:1; large text definition; non-text 3:1; use of colour; 0.04045 threshold note (A4.29, A7.50) |
| https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell.html | APCA Lc levels and use cases; WCAG 2 overstating dark contrast (A4.30) |
| https://github.com/Myndex/apca-w3 | APCA constants, argument order, signed output, licence note (A4.30, F9) |
| https://support.google.com/youtube/answer/1722171 | upload container, codec, GOP, bitrates, BT.709 and range handling (D2) |
| https://support.google.com/youtube/answer/7126552 | HDR upload requirements, automatic SDR conversion, LUT hints without spatial control, noise removal remark (D6.24, D3.11, A5.39) |
| https://support.google.com/youtube/answer/10059070 | Shorts up to 3 minutes; the "maximum resolution of 1080p" sentence (D1.3) |
| https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/ | ACES fit constants, pre-exposure 0.6, "luminance only fit, which over saturates brights" (A5.43) |
| https://developer.blender.org/docs/release_notes/4.0/color_management/ | AgX replaces Filmic, brights go to white, SDR only (A5.43) |
| https://pixelmager.github.io/linelight/banding | causes of banding; triangular noise about 2 LSB wide; animate the noise; blue noise; keep the rails clean (D3, F2) |
| https://bartwronski.com/2016/10/30/dithering-part-three-real-world-2d-quantization-dithering/ | white, Bayer, interleaved gradient and blue noise compared; IGN formula; blue noise recommended (D3.12) |
| https://www.thunderchunky.co.uk/articles/pixar-colour-and-tent-poles-with-lou-romano/ | colour script purpose and process; tent-pole images; Up and The Incredibles examples (A2.13) |
| https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html | Machado et al. simulation matrices at severity 1.0 (F9, A7.52) |

### Secondary (S): search summaries, documentation and articles not read in full

| URL | supports |
|---|---|
| https://www.awn.com/animationworld/ralph-eggleston-talks-inside-out | Eggleston on the colour script as the film's emotional shorthand (A2.13) |
| https://www.moma.org/audio/playlist/192/2575 and https://hyperallergic.com/610771/the-art-of-pixar-chronicle-books/ | origin of Pixar colour scripts (A2.13) |
| https://www.sciencedaily.com/releases/2020/09/200910150247.htm and https://eprints.whiterose.ac.uk/id/eprint/169496/ | Jonauskaite et al. 2020, 30 nations, red with love and anger, national variation (A2.12) |
| https://ziva.sh/tools/pixel-art-palette-generator | hue-shift rule of thumb 15-25 degrees, shadows more saturated, highlights less (A3.16) |
| https://pixnote.net/en/learn/color-palette and https://medium.com/pixel-grimoire/how-to-start-making-pixel-art-6-a74f562a4056 | cool shadows, warm highlights (A3.17) |
| https://docs.kdenlive.org/en/tips_and_tricks/scopes/vectorscope_i_and_q_lines.html, https://lifeart.github.io/openrv-web/docs/scopes/vectorscope.html | skin tones on the I line at 123 degrees (A3.19, A6.45) |
| https://tips.clip-studio.com/en-us/articles/7178 and related illustration tutorials | character/background separation by value, saturation and temperature; the desaturate test; saturation in reserve (A1.1, A1.4, A3.20) |
| https://drawpaintacademy.com/how-to-paint-under-different-light-sources/ | warm light gives relatively cool shadows and the reverse (A1.7) |
| https://www.apartmenttherapy.com/interior-design-rule-60-30-10-explained-37504313 and similar | 60-30-10 definition and origin (A2.10) |
| https://natron-docs.readthedocs.io/en/stable/plugins/fr.inria.openfx.OCIOCDLTransform.html, https://docs.kdenlive.org/en/effects_and_filters/video_effects/color_image_correction/sat.html | ASC CDL formula and saturation with Rec.709 weights (A5.33) |
| https://zhjngli.github.io/AgX/reference/concepts/lut-format.html, https://forum.blackmagicdesign.com/viewtopic.php?p=232952 | `.cube` keywords, red-fastest order, common sizes (A5.39) |
| https://github.com/dmnsgn/glsl-tone-map/blob/main/neutral.glsl, https://modelviewer.dev/examples/tone-mapping | Khronos PBR Neutral constants and intent (A5.43) |
| https://digitalproduction.com/2014/01/13/print-film-emulation-luts/, https://lowepost.com/insider/insights/print-film-emulation-workflow-r76/ | what a print emulation is (A5.40) |
| https://www.wikipedia.org/wiki/Remjet, https://theasc.com/article/kodak-enhances-vision3/ | halation mechanism and anti-halation layers (A5.41) |
| https://view.ceros.com/editorial-content/teal-orange-desktop/p/1, https://wolfcrow.com/why-are-films-shot-in-two-colors/ | teal and orange rationale and criticism (A5.44) |
| https://www.howtogeek.com/719427/the-difference-between-saturation-and-vibrance-in-photoshop-lightroom/, https://photographylife.com/saturation-or-vibrance | saturation against vibrance (A5.37) |
| https://medium.com/codezest/super-fast-color-transfer-algorithm-bd1a76bc7619, https://www.academia.edu/9445485/Color_Transfer_between_Images | Reinhard colour transfer formula and colour space (A6.47) |
| https://colour.readthedocs.io/en/latest/generated/colour.difference.JND_CIE1976.html, https://intercom.help/pantone/en/articles/7182324-what-does-delta-e-δe-or-de-signify | deltaE bands; 2.3 belongs to CIE76 (A4.28) |
| https://pyimagesearch.com/2017/06/05/computing-image-colorfulness-with-opencv-and-python/, https://github.com/DrNickRedfern/HSM3 | Hasler-Susstrunk formula and its category thresholds (E) |
| https://siegal.bio.nyu.edu/color-palette/, https://jfly.uni-koeln.de/color/ | Okabe-Ito palette values (A7.51) |
| https://www.allaboutvision.com/conditions/color-blindness/color-deficiency/, https://pmc.ncbi.nlm.nih.gov/articles/PMC3328350 | colour vision deficiency prevalence (A7.49) |
| https://en.wikipedia.org/wiki/Chroma_subsampling | 4:2:0 definition, gamma luminance error, out-of-gamut reconstruction, chroma siting (D4.15) |
| https://tftcentral.co.uk/articles/does-oled-have-a-black-crush-problem-understanding-and-testing-oled-shadow-detail | near-black visibility on OLED, RGB 1-5 at risk (A1.3, D5.18) |
| https://knowledgehub.ebu.ch/files/live/sites/tech/files/shared/r/r103.pdf, https://ebu.io/qc/items/0051B | EBU R103 preferred range 5-246 for 8-bit (D5.19) |
| https://www.broadbandtvnews.com/2025/07/04/netflix-film-grain-synthesis-saves-on-the-bitrate/, https://norkin.org/pdf/DCC_2018_AV1_film_grain.pdf | bitrate saved by removing and re-synthesising grain (D3.11) |
| https://thepostflow.com/post-production/why-do-your-exports-look-different-on-your-iphone/, https://www.provideocoalition.com/ios-9-3s-night-shift-warming-screens-everywhere-messing-color-work/ | iOS colour management, Night Shift and True Tone (D6.22-23) |
| https://www.pixelsham.com/?p=25230 | ffmpeg BT.709 tagging flags (D2.8) |

### Measured here (M), 2026-11-11

| what | how | where |
|---|---|---|
| Shorts rendition ladder and bitrates | `yt-dlp -F` on five public Shorts from three channels | D1 |
| Shorts stream colour metadata | `ffprobe` on stream URLs (itags 137, 248, 399, 313), nothing saved | D1 |
| dither, grain and JPEG-intermediate experiment | `band_test.py`, `band_test2.py` (ffmpeg 9.0.2: libx264, libvpx-vp9, SVT-AV1 4.2) | D3 |
| palettes, skin under light, OKLCH checks, ramps, mixing table, caption contrast, Y'CbCr table, colour-blind check | `colour_calc.py` | A4, A7, B, D4 |
| look recipes and existing presets through a CPU port of the grade | `colour_calc.py` | C |
| tonemap hue skew | `colour_calc.py` (same formulas as `post.ts`) | A5.43 |

Scripts and raw results:
`(research scratch folder)`
(`colour_calc.py`, `calc_out.md`, `band_test.py`, `band_test2.py`, `band\results.json`).

### Not verified (U): the main items to test before they become rules

- The numeric thresholds for value separation (0.15 / 0.10 L), chroma ranges per layer, accent "two of three axes",
  shadow chroma at half of lit chroma, and beat-to-beat change sizes. They are consistent with the computed palettes
  but were not tested on viewers or against references.
- Simultaneous contrast and the lift/gamma/gain definitions are standard knowledge; no source was fetched.
- Tetrahedral against trilinear LUT quality; LUT validity only for its input encoding.
- Specific Kodak 2383 colour behaviour.
- Which rendition the phone Shorts player selects by default, and Android colour management across devices.
- That BT.709-tagged sRGB pixels look identical after YouTube on phones (F8 has the test).
- `aq-mode=3` and other x264 tuning improving the result after YouTube's transcode.
- The Machado matrices being defined for linear RGB (the project page does not state the space).
- Whether a 10-bit upload reduces 8-bit banding in YouTube's SDR output (not tested; all delivered SDR streams were
  8-bit).
- The dither experiment used one synthetic static gradient, OpenCV's JPEG encoder and libvpx/SVT-AV1 at default
  quality settings. The direction of each result is clear; the exact numbers will differ on YouTube's encoders.
