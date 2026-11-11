# Lighting for stylised animation and cinematography: research report for video-forge

> **Status note (video-forge 1.6, 2026-11-11).** This is a research report written against the engine as it was on
> 2026-11-11 before / during the 1.6 work. Its "what our engine has vs gaps" and "upgrades" sections are a backlog, not
> the current state: see `references/shading-lighting.md` section 5 for what has been applied since. Evidence labels
> in the text say which claims were read in a source, summarised from search, measured, or left unverified.


Written 2026-11-11 for the video-forge engine (Remotion 4 + three.js 0.187, toonworld style: flat 2D cut-out
characters in a cel-shaded, inked 3D world, vertical 9:16 Shorts, lighting that changes with the story beat).

How to read the tags:

- `[S12]` = supported by source 12 in section F (fetched and read unless F says "search summary only").
- `[derived]` = my arithmetic on sourced numbers (formula shown or obvious).
- `[design]` = a recommended starting value for OUR engine. It is a judgement call that follows the sourced
  principles and the measured reference short, but no source gives that exact number. Tune by render and measurement.
- `[unverified]` = stated from general craft knowledge or a secondary source; I could not confirm it against a
  primary source in this session.
- Engine conventions used below: the camera sits on +z and looks toward -z (checked in `projects/elevator`), so a
  sun direction with `z > 0` is a FRONT light, `z < 0` is a BACK light, `x < 0` comes from screen-left. `dir` is the
  vector from the target TOWARD the sun, exactly as in `LIGHTS[...].dir`.

Contents: (A) key principles, (B) recipe tables and paste-ready presets, (C) rules for lighting 2D cards in 3D,
(D) what our engine has vs gaps, (E) the 12 most valuable upgrades, (F) sources and the list of unverified claims.

---

## A. Key principles (numbered rules, with numbers)

### A1. What lighting is for

1. **Lighting has five jobs, in this order of priority for a Short.** Sharon Calahan's Pixar chapter
   "Storytelling through Lighting" is organised around exactly these objectives: directing the viewer's eye,
   creating depth, conveying time of day and season, enhancing mood/atmosphere/drama, revealing character
   personality and situation; it then has a separate section on continuity [S1]. For a 60 s vertical video watched
   on a phone, treat them as a checklist per shot: (1) can the eye find the subject in under half a second,
   (2) is there depth, (3) does the light say when/where we are, (4) does it carry the beat's emotion, (5) does it
   say something about the character.
2. **Lighting in production CG is art-directed, not simulated.** Pixar's own light model was built to "cheat the
   physics of light": per-object light selection, shaped cones/barn doors, cut-on/cut-off distances, blockers,
   movable and coloured shadows, fake shadows and projected "cookies" [S23]. Sony "broke" its physically based
   renderer on purpose for Spider-Verse and The Mitchells vs the Machines [S33][S34]. Klaus lighters were asked to
   simplify shading so it would not look "too 3D" [S32]. Rule: physical plausibility is a starting point; the frame
   that reads wins.
3. **Light the master, then cheat the close-ups.** Feature practice: colour keys are approved first, a master
   lighter sets up the sequence (1 to 4 weeks on Inside Out), then shot lighters refine; on Inside Out the lights
   were cheated so a character looking down kept an appealing, well-shaped face [S44]. Live action says the same:
   light the wide first, keep direction/colour/quality consistent in the closer shots, and cheat when it serves
   the film [S43].

### A2. Three-point lighting and ratios

4. **Key light position:** 15 to 45 degrees to the side of the camera and 15 to 45 degrees above it (Birn) [S3];
   Wikipedia gives 30 to 45 degrees for both [S4]; a Blender animation guide allows 30 to 60 degrees to the side
   [S6]. Raise the key so shadows fall downward and do not cut across the eyes [S6]. For our sun this means: a
   "portrait" key sits front-left or front-right at 30 to 50 degrees elevation; our `day` preset (51 degrees
   elevation, 58 degrees to the left, front) is at the top of that range.
5. **Fill:** opposite side from the key, lower than the key, at most half the key's brightness (2:1) and as little
   as one-eighth (8:1) for shadowy scenes; tint the fill with the environment's colour because fill stands in for
   bounced light [S3]. A fill that is too strong gives a "flat, low-contrast image" [S4]. Animation guidance for
   readable shots: fill at 25 to 50 % of key [S6].
6. **Ratio arithmetic.** Each stop doubles the ratio: 1 stop = 2:1, 2 stops = 4:1, 3 stops = 8:1. The ASC convention
   measures (key + fill) : fill, so a key one stop over the fill is 2:1 as light sources but 3:1 as a lighting
   ratio on the subject [S2]. Always say which convention a number uses. In this report "ratio" means lit side :
   shadow side on the subject (the ASC convention) unless stated.
7. **What the ratios read as** (definitions vary between sources; treat as conventions) [S2][S5][S3]:

   | lit:shadow | stops | reads as | use in our shorts |
   |---|---|---|---|
   | 1:1 to 1.5:1 | 0 to 0.6 | flat, shadowless, "high key"; overcast, beauty, sitcom | overcast, rain, dream/flashback, diagram inserts |
   | 2:1 | 1 | bright, friendly, barely modelled | high-key comedy set-up, kids' content |
   | 3:1 to 4:1 | 1.6 to 2 | natural daylight modelling, "normal" drama | default day, office, morning |
   | 6:1 to 8:1 | 2.6 to 3 | low key, dramatic, noir/horror starts here (Wikipedia: low key is about 8:1, high key approaches 1:1) | golden hour walls, night, practical-lit interiors |
   | 16:1 and more | 4+ | silhouette, spotlight, space | reveal spotlight, backlit silhouette, space |

8. **Real daylight for calibration.** Direct sun is about 111,000 lux; shade lit by the whole clear blue sky at
   midday is about 20,000 lux; a typical overcast midday is 1,000 to 2,000 lux; a clear sunrise/sunset is about
   400 lux; full moon 0.05 to 0.25 lux [S11][S12]. So real clear noon is about (111 + 20) : 20 = 6.5:1, roughly 2.7
   stops [derived]. Cartoons run brighter shadows than reality: our toon `day` setup is 4.3:1 (see D). That is a
   style choice and matches the measured reference rule "shade is about 0.5 x lit in display values".
9. **Rim / back light:** behind the subject, above, opposite the camera; as bright as needed to draw the edge;
   usually light-linked so it hits only the subject and not the set [S3]. Animation guide: rim at 0.5 to 1.2 x key,
   raised until the edge shows without blowing out; if it turns into a distracting stripe, lower it or aim it at
   the outer contour only [S6]. A **kicker** is a rim from lower and more to the side that also lights part of the
   visible cheek/side; a back light only draws the contour [S4].
10. **Rim instead of outline for silhouettes.** Valve codified, from Leyendecker/Cornwell/Rockwell illustration:
    shading goes warm-to-cool and "shadows go to cool, not black"; saturation increases at the terminator, which is
    often reddened; high-frequency detail is omitted; silhouettes are emphasised with rim highlights rather than
    dark outlines. Their rim term is masked by a Fresnel factor (1 - N.V)^4 and by N.up so rim only appears on
    upward-facing edges, exploiting the instinct that light comes from above [S21]. Our style has ink lines AND can
    have rim; the rim then carries light direction and separation, the ink carries shape.
11. **Motivated and practical light.** A warm close-up cut into a cool wide only works when a visible source
    (lamp, candle, campfire) explains it [S43]. Night exteriors: supplement the existing sources at a low level so
    they still provide the general exposure, hide small lights on the practicals to raise them, use backlight to
    separate subjects from dark backgrounds and keep some fill [S29]. Rule for us: every local pool of light in a
    night or interior scene needs a visible emissive object in or near frame (lamp, window, screen, headlight,
    string light).
12. **Keep faces appealing.** Fill from near the camera axis lifts eye sockets and under-chin [S6]. Pixar cheats
    lights per shot to keep a face well shaped [S44]. Day-for-night practice: add plenty of fill to faces or select
    the faces in the grade and lighten them, because "faces must stay visible for performances to read" [S18].

### A3. Guiding the eye and reading on a phone

13. **The eye goes to the largest local value contrast first, then to saturation and warm colour, then to sharp
    detail** [unverified wording; the principle is the subject of Calahan's "Directing the viewer's eye" section
    [S1] and of every source below]. Animation checklists: if character and background have similar brightness,
    change one of them BEFORE adding lights; do a squint test (pose still reads when squinting) and an outline test
    (head, shoulders and hands never merge into the background during the move) [S6].
14. **Two value families.** Gurney's recipe for an atmospheric backlit scene: restrict the picture to two value
    families (light = sky and highlights, dark = everything else), reserve the very darkest darks for a few small
    foreground areas, raise the distant darks so they do not compete, grade the darks from warm near the sun to
    cool at the edges, and remove detail from dark silhouettes [S16]. Generalised rule for us: each frame is 2 or 3
    value groups; the subject sits where the brightest group meets the darkest.
15. **Phone screens lose the bottom of the tone scale first.** Reflected ambient light adds a veil of luminance
    E x R / pi (E in lux, R the screen reflectance) on top of the picture [S41, search summary only]. DisplayMate
    measured that the reflected light already exceeds a phone's own black level at 300 lux, that images are "barely
    visible" at 20,000 lux and "almost invisible" at 40,000 lux, with screen reflectance of 4.4 to 15.5 % on the
    phones tested [S40]. Worked numbers for R = 5 % and a display gamma of 2.2 [derived]:

    | viewing condition | phone white | veil | sRGB 0.10 vs 0.20 | 0.20 vs 0.40 | 0.20 vs 0.50 | 0.30 vs 0.60 |
    |---|---|---|---|---|---|---|
    | dim room, 50 lux | 300 nits | 0.8 nits | 3.5:1 | 4.3:1 | 7.0:1 | 4.5:1 |
    | indoor, 300 lux | 400 nits | 4.8 nits | 2.2:1 | 3.6:1 | 5.6:1 | 4.1:1 |
    | bright room / window, 1,000 lux | 500 nits | 16 nits | 1.6:1 | 2.7:1 | 4.1:1 | 3.5:1 |
    | outdoors overcast, 5,000 lux | 800 nits | 80 nits | 1.2:1 | 1.8:1 | 2.5:1 | 2.5:1 |
    | outdoor shade, 10,000 lux | 600 nits | 159 nits | 1.1:1 | 1.4:1 | 1.6:1 | 1.8:1 |

    Reading: a detail that separates by 0.10 in display value in the darks (0.10 vs 0.20) is fine in a dark room and
    gone by a window. WCAG asks for 3:1 between a graphic and its neighbour for it to count as perceivable, and its
    contrast formula carries the same idea as a "+0.05 flare" term [S42].
16. **Phone-safe value rules** [design, from 15]:
    - Story-critical separation (subject vs what is directly behind it): at least 0.30 apart in display value AND the
      lighter of the two at 0.50 or more. That holds 3:1 or better up to about 1,000 lux.
    - Faces and hands: 0.45 or higher mean display luma in every setup, including night (0.55+ in daylight setups).
    - Nothing the viewer must see below 0.10. Use 0.03 to 0.10 only for mass (silhouette interiors, deep background).
    - Night frames: mean luma 0.22 to 0.30, with at least 5 to 10 % of the frame above 0.60 (practicals, rim, the lit
      face). A frame that is only dark blue reads as a broken video in a feed.
    - Check every lighting setup at 360 px width with a veil added (see E10).
17. **Small-screen composition:** one focal light pool per frame; background detail contrast inside the pool, not
    outside it; rim or value gap around the head; captions sit at 70 % of the height in the reference [case study],
    so keep the pool and the face above that band and do not put the brightest practical behind the captions.
18. **Compression dislikes dark gradients.** Social platforms compress hard; smooth dark gradients band and block up
    [S51, weak source]. Keep the engine's dither on, give night skies some structure (stars, cloud shapes, a horizon
    glow band) instead of a large flat near-black gradient, and keep the darkest sky tone at or above about 0.06.

### A4. Colour scripts and lighting keys

19. **A colour script is a map of the film's colour and light against its emotional beats.** Ralph Eggleston made
    the first Pixar one in pastel for Toy Story and called it a map of the colour [S46, search summary]. Lou Romano:
    "The color script is part inspiration and part continuity"; he starts from "tent-pole images" (the themes at
    their purest), then draws long mural-like tableaux per sequence and maps the colour progressions; on Up the
    storybook prologue contrasts with the subdued, isolated reality after it [S45]. Klaus had a colour bible for the
    whole film and a colour script covering roughly one shot in every four [S31].
20. **Colour keys drive lighting, and lighting is last.** On Inside Out the production designer and DP reviewed the
    sequence unlit, then made colour keys for the director; the master lighter worked from the keys [S44]. Disney
    describes colour keys as paintings that lighting, layout and other departments reference, and a "foundation
    lighting" pass that fixes the ambient conditions of a sequence before key and shot lighting [S46, search summary].
    For us: write the colour script as a table BEFORE building scenes (phase, lighting recipe, 3 palette anchors,
    mean luma target, saturation target) and keep it in the project file next to the beat sheet.
21. **Contrast between sequences is a storytelling tool.** A Bug's Life: saturated sunset light on the grasshoppers
    made the grey, fogged ant island feel greyer when the two were cut together [S44]. Finding Nemo's script mutes
    colour in the dark beats and brightens it in the happy ones [S46, search summary]. Coco: the Land of the Dead has
    every colour in every frame, so the lighters direct attention by taking colour (or brightness) away [S46, search
    summary]. Rule: save your most saturated, highest-contrast setup for one beat; make the beat before it the
    plainest.
22. **Our measured reference does exactly this in 62 s** (case study, section 4): bright day with a deep blue sky
    (#1b80d9, display luma 0.49) for hook, rule and reward; dusk with a violet sky (#6e54d3, luma 0.41; darkest tone
    #170e33) and headlights for the escalation; night (#011d68, luma 0.16) with warm practicals for the peak; cool
    office daylight (#7297aa wall, #994f2c wood) for authority; rain, overcast, desaturated teal-grey (#314e5f luma
    0.30, #87adbe luma 0.65) for the turn and reveal. Whole-short mean luma 0.40, saturation 0.44, warmth -0.07.
    The turn is announced by weather and light, not by a word.
23. **Warm/cool is the cheapest contrast.** Warm key with cool fill gives warm lights and cool shadows (day, golden
    hour). Cool ambient with warm practicals gives the night look. A scene that is all warm or all cool is a
    statement (heat, nostalgia; cold, grief, rain). Gooch's technical-illustration model formalises warm-to-cool
    shading: k_cool = (0, 0, b) + alpha x albedo, k_warm = (y, y, 0) + beta x albedo, with b = 0.4, y = 0.4,
    alpha = 0.2, beta = 0.6 in the paper's figures, and shading kept in the mid-tones so edge lines and highlights
    stay visible [S22]. That is the same structure as our `shadeMul` + `litTint`.
24. **Saturation and value structure by beat** [design, anchored on 21, 22 and the engine's measured looks]:

    | beat | mean luma | saturation (grade) | contrast | warm/cool |
    |---|---|---|---|---|
    | set-up / hook | 0.50 to 0.58 | 1.25 | medium (4:1) | warm key, cool shadow |
    | reward / stakes | 0.45 to 0.52 | 1.25 to 1.3 | medium-high (6:1) | warm dominant |
    | escalation | 0.32 to 0.40 | 1.3 | medium, pools of light | violet ambient + warm points |
    | peak | 0.22 to 0.30 | 1.35 | high (8:1), deepest vignette | cool ambient + warm practicals |
    | authority / pushback | 0.42 to 0.50 | 1.1 to 1.2 | medium-low (3:1) | cool, neutral |
    | turn | 0.36 to 0.42 | 0.8 to 0.9 | low (1.5:1), true blacks allowed | cool teal-grey, almost no warm |
    | payoff / tag | hold the turn's look, or lift +0.05 | as turn or +0.1 | as turn | one small warm accent |

### A5. Time of day and weather (physical anchors)

25. **Colour temperature anchors** [S7] with sRGB tints of a black body [S8]:

    | source | Kelvin | tint (white balanced to D65) |
    |---|---|---|
    | candle, match, sunrise/sunset sun at the horizon | 1,850 to 2,000 | #FF8300 to #FF8A12 |
    | household incandescent | 2,400 to 2,700 | #FF9D3F to #FFA957 |
    | warm-white LED, studio tungsten | 3,000 to 3,200 | #FFB46B to #FFBB78 |
    | golden hour sun | about 3,500 | #FFC489 |
    | moonlight (reported 4,100 to 4,150 K, see 31) | 4,100 | #FFD3A8 |
    | horizon daylight, cool-white tube | 5,000 | #FFE4CE |
    | midday sun, flash | 5,500 to 6,000 | #FFECE0 to #FFF3EF |
    | overcast sky, D65 | 6,500 | #FFF9FD |
    | shade / hazy sky | 7,000 to 8,000 | #F5F3FF to #E3E9FF |
    | clear blue sky as a light source | 10,000 to 27,000 | #CFDAFF and bluer |

    Our `day` sun #fff1d6 sits near 5,200 K and `golden` #ffbd7a near 3,200 K, both physically plausible [derived].
    Stylised work pushes the tints further than this table; keep the ORDER right (sun warmer than sky, tungsten
    warmer than sun, moon ambience cooler than everything).
26. **Golden hour** is the sun within about 6 degrees of the horizon (definitions run from -4 to +6 and 0 to 10
    degrees); the light is about 3,500 K, dropping to about 2,000 K at the horizon; it is softer and lower in
    contrast because a larger share of the light is skylight; shadows are long [S9]. Facing away from the sun, lit
    forms are golden and shadows relatively blue; overhead the sky is a richer blue while the horizon goes through
    soft yellow to dull red; after sunset a violet glow can remain and artificial lights begin to stand out [S15].
27. **Blue hour / dusk:** sun 4 to 8 degrees below the horizon (tools use 3 to 10), lasting 20 to 30 minutes at
    mid latitudes; the deep blue comes from ozone absorption (Chappuis), not from Rayleigh scattering; photographers
    favour it because the blue sky contrasts with the glow of artificial lights [S10]. This is the "escalation,
    headlights on" look of the reference. There is no direct sun: the key is the sky itself plus practicals.
28. **Shadow length = height / tan(elevation)** [derived]: 60 degrees 0.58 h; 45 degrees 1.0 h; 30 degrees 1.73 h;
    20 degrees 2.75 h; 15 degrees 3.7 h; 10 degrees 5.7 h; 5 degrees 11.4 h. Below about 12 degrees the shadows of a
    two-storey house (57 m at 10 degrees) leave our default 80 m shadow frustum. Cheat: keep the shadow-casting key
    at 15 to 20 degrees and tell "low sun" with colour, sky and long-but-not-absurd shadows (our `golden` is at 19.7
    degrees, which is already the right cheat).
29. **Overcast:** the sky is one big soft source at about 6,500 K; contrast collapses (1.5:1), cast shadows vanish and
    only contact/occlusion shadows remain; local colour is at its most readable in the foreground [S7][S11; the
    local-colour point is from a secondary summary, unverified]. Use it for neutrality, bureaucracy, deflation.
30. **Rain look:** wet rough surfaces look darker and more specular, with a slight saturation increase and hue shift;
    smooth materials (glass, metal, paint, plastic) barely change; puddles act as near-mirrors, especially over dark
    albedo; under an overcast sky the reflection is a faint white tint, at night bright sources give long stretched
    highlights [S28]. Lagarde's recipe: diffuse x lerp(1, 0.2, porosity) at full wetness (asphalt in an older
    simulator: diffuse x 0.1 to 0.3 with specular x 5 to 10); gloss pushed toward 1; no darkening on metals [S27].
    Cinematography: streets are wetted down at night because the water gives specular reflections of the lights and
    contrast, and "front light snow, backlight rain": rain only reads when lit from behind [S30, search summary;
    S29 for the wet-down]. Atmospherically: grey sky, low ratio, lifted and cool mid-tones, headlights and tail
    lights on.
31. **Moonlight myths.** Moonlight is sunlight reflected off a grey-brown surface; it is slightly REDDER than
    sunlight, not blue, and about 380,000 to 400,000 times weaker [S12][S14]. It looks blue or silvery because of
    the eye: the Purkinje shift moves peak sensitivity from 555 nm to 507 nm in the dark, so reds go black and
    blue-greens look lighter [S13]; a further hypothesis (rod signals leaking into blue-cone pathways) is untested;
    and warm lamplight makes the surrounding night look bluer by induced complementary contrast [S14]. Painters
    render moonlight with low chroma, lost detail and soft edges, and shadows that stop short of black [S14].
    Film convention is blue because audiences expect it; the modern trend is a more neutral, desaturated cool
    [S50, forum opinions via search summary].
32. **Day for night:** underexpose about 2 stops (or expose normally and pull down 2 to 3 stops in the grade to keep
    shadow detail), keep the sun out of frame and use it as a three-quarter back or cross light so it reads as a
    moon rim, darken or replace the sky (the day sky is far brighter than the ground, the opposite of real night),
    add fill on faces or lift them in the grade, avoid white clothes and hot highlights, balance for tungsten so
    unlit areas go "moonlight blue" while artificial lights stay white [S17][S18]. It works best when the moon is the
    only source; with lamps or fires in frame shoot at dusk so the practicals expose realistically [S19]. For our
    engine this is literally how a night setup should be built: the same directional light, moved behind the
    subject, cooled, dimmed 1.5 to 2 stops, sky darkened separately, faces protected, practicals added.
33. **Interiors:** window light is a large soft side key that falls off quickly into the room; ratio 4:1 near the
    window; cool (sky, 6,500 to 10,000 K) against warm wood and lamps (2,700 K) [design from 25]. A practical-lit
    evening interior reverses it: warm key from the lamp, cool blue fill from the window. On Inside Out the dinner
    scene is lit from above by a bulb that is never shown, strongly saturated but not harsh, with darker areas
    behind the characters for depth [S44].
34. **Neon:** two saturated, near-complementary coloured practicals (magenta + cyan is the cliche because it keeps
    skin readable between them), a wet ground to double them, haze to give the colour volume, strong bloom
    [unverified craft convention; S29 notes that neon and vapour lights cast strong colour]. Keep one near-neutral
    or warm light on the face.

### A6. Stylised-specific devices

35. **Coloured shadows.** Shadow colour = albedo x ambient colour, pushed in saturation; never black [S21][S15].
    Our measured reference: day shade is the same hue at about half the display value with more saturation; sunset
    shade is replaced toward violet. Rule of thumb: shadow hue moves toward the sky/ambient hue by 20 to 45 %
    (`shadeReplaceAmt`: day 0, golden 0.3, night 0.45 in the engine).
36. **Terminator band.** Saturation rises and the hue warms/reddens where light turns to shadow [S21]. Klaus added
    an automatic warm transition between light and shadow on skin so it would "feel like flesh" [S32]. The engine's
    1.6 shader has this as `uTerm`/`uTermColor`.
37. **Half-Lambert / wrap.** Valve scales and biases N.L by 0.5 so the side away from the light keeps shape instead
    of going flat, then remaps it through an artist-painted 1D ramp with a cool region, a reddish terminator and a
    grey lit region, output range 0 to 2 [S21]. Light wrap in compositing is the 2D cousin: background light bleeds
    over the subject's edge, stronger on the edges that face bright background regions [S48, search summary].
38. **Bounce fakes.** Tint the fill with the environment colour [S3]; Klaus had separate key, bounce, ambient,
    occlusion and rim layers, up to eight layers per shot [S31][S32]. Cheap engine version: sky colour on
    up-facing shade, ground colour on down-facing shade (the engine's 1.6 `uSkyFill`/`uBounce`).
39. **Gradient skies.** Zenith darker and more saturated, horizon lighter and warmer; at golden hour the horizon
    goes yellow to dull red while the zenith stays blue [S15]. Use three stops (zenith, horizon, a below-horizon or
    glow band) and match the fog colour to the horizon stop so distant geometry dissolves into the sky.
40. **Atmospheric perspective.** With distance, contrast against the background drops, internal detail contrast
    drops, colours desaturate and shift toward the atmosphere colour (usually blue; reddish at sunrise/sunset);
    unlike blur it lowers contrast at ALL spatial frequencies [S20]. So fog is a different depth cue from DOF and
    both can be used: fog for scale and layering, DOF for subject isolation.
41. **God rays / shafts.** Screen-space method: for each pixel march toward the light's screen position through an
    occlusion image (occluders black, sky/light bright), summing samples with a per-sample `weight`, a `decay` in
    0..1, a `density` that sets the step length, and a final `exposure`; do it at reduced resolution; fade the
    effect when the light leaves the screen [S24]. Shafts need haze to be motivated: use them in fog, dust, rain,
    through windows and under tree canopies, and with a low backlight they also lead the eye into depth.
42. **Gobos / cookies.** A cucoloris or branch ("branchaloris") between light and set throws a pattern: window
    frames, blinds, foliage dapple [S49, search summary]. Pixar's light model has projected cookies and uses them to
    fake off-screen shadow casters [S23]. They are the standard fix for a large flat lit surface: a ground plane or
    wall with cloud-shadow or leaf-shadow breakup reads as "outdoors" at once and gives the eye a brighter pool to
    land in.
43. **Vignettes and light pools.** Darken the frame edge 0.1 to 0.2 in day setups and 0.3 to 0.45 at night (the
    engine's measured looks use 0.12 day, 0.2 golden, 0.42 night). A world-space pool (brighter ground and wall
    behind the subject) does the same job more convincingly than a screen vignette because it moves with the camera.
44. **Painted light.** Arcane paints highlights and shadows into the textures and adds 2D effects in compositing
    [S35, secondary sources]; Mitchells' brush tool made the lighting itself painterly, with strokes that respond as
    light moves across an object, and bigger strokes for distant characters for clarity [S34]; Spider-Verse drives
    halftone dots and hatching from the lighting, and makes rim-light halftones either track the character or stay
    loose so they read as light, not texture [S33]. For us the equivalent is the cel ramp plus the world-space
    "painted drift" noise; if hatching or halftone is added later it must be driven by the same `key` term.

### A7. Shadows

45. **Penumbra width = (d_receiver - d_blocker) x w_light / d_blocker** (PCSS) [S25]. The sun is 0.52 to 0.54 degrees
    wide [S26], so a sun shadow softens by about 9.3 mm per metre between the casting edge and the receiver
    [derived]: 1.6 cm for a character's head shadow, 4.6 cm for a 5 m tree, 9 cm for a 10 m building edge. Sharp at
    the contact point, softer with distance. A fixed blur radius (ours: `shadow.radius = 3` on a 2 cm texel) is the
    penumbra of a roughly 6 m blocker everywhere [derived].
46. **Softness tells weather.** Clear noon: crisp. Golden hour: longer and softer (more skylight share) [S9].
    Overcast and rain: no cast shadows, only contact darkening. Night under a moon: shadows exist but are low in
    contrast; under practicals they radiate away from the lamp.
47. **Contact shadows are non-negotiable for flat characters.** South Park's software look comes from separating
    the flat pieces "with a small layer of space" so they shadow each other like real paper cut-outs [S36]. HD-2D
    (Octopath Traveler) added a point light specifically so that sprites cast shadows onto the 3D environment
    [S37]. A soft dark ellipse under the feet, offset away from the key, plus a full-silhouette cast shadow, is what
    stops a card from floating.
48. **Direction consistency.** Within one location and time, the key stays on the same side of the SCREEN across
    cuts; continuity guides list colour, brightness, contrast and light direction as the things intercut shots must
    share [S43]. Exceptions are motivated (a character walks to a lamp) or deliberate cheats (the close-up's rim and
    fill are rebuilt for the face). When the camera crosses to the reverse angle the key legitimately changes
    screen side; prefer camera set-ups that keep the hero on the lit-from-the-same-side half of the scene.
49. **When to cheat shadows:** move or remove a cast shadow that crosses the eyes [S6][S44]; shorten low-sun
    shadows (28); drop the set's shadow off the hero by light-linking [S3][S23]; add a fake shadow (cookie) to
    break up an empty wall [S23]; keep shadow density under control separately from fill (Pixar's model has shadow
    colour and density controls) [S23].

### A8. Continuity and transitions

50. **A lighting change is an edit.** In the reference the scene changes 20 times in 62 s (7 cuts, 8 dissolves with
    a median of 11 frames, 2 zoom-throughs, 1 wipe) and each story phase has its own light [case study]. Change the
    lighting setup ON a story turn, at a cut or across a dissolve of 11 to 18 frames (the engine's `lookTimeline`
    default fade is 18).
51. **Animating light inside a shot** is for time passing or a beat landing: lamp switching on (2 to 4 frames, with
    a 1-frame overshoot), cloud shadow crossing (2 to 4 s), sunset time-lapse during a long travel take (the
    reference has 13 to 16 s takes), lightning (2 to 3 frames at 5 to 8 x key, from a new direction). Keep light power
    steady otherwise: unmotivated drift reads as flicker [S6].
52. **Match across cuts inside a phase:** same key side, same key colour, mean luma within about +/-0.05, same fog
    colour. **Contrast across phases:** a mean-luma step of 0.10 to 0.25 and a hue change of the ambient reads as a
    new chapter (22, 24). The single biggest step should be at the turn.
53. **Return of light.** The channel aggregate goes day, golden, night-blue for the explanation, then back to
    day/golden at the payoff (craft.md, look.ts). The case-study short does not return: it ends in the rain. Both are
    valid; decide in the colour script whether the ending is a release (return of warm light) or a verdict (stay
    cold).

---

## B. Recipe tables: 20 lighting setups mapped onto `lights()`, `TOON_SETUPS` and `LOOKS`

All colours, intensities and distances in B are `[design]` starting values unless a source tag is given: they follow
section A and are anchored on the measured palette of the reference short and on the existing, measured engine
presets (rows marked "existing" keep the engine's current numbers). Intensities are in the engine's units (sun
`sunI` around 2.6 = full day). "Ratio" is lit:shadow on a wall facing the key under plain Lambert lighting
(computed for existing presets, targeted for new ones); under `toonifyScene` the ratio is set by `shadeMul` instead
(see D).

Fog is given as linear `[near, far]` in metres for a street-sized set (the projects use [9, 95] to [12, 140]; the
`lights()` default of [60, 320] suits wide landscapes). Equivalent `FogExp2` density is about 0.83 / D50, where D50
is the distance at which you want 50 % fog (from the three.js exp2 fog formula 1 - exp(-(density x d)^2);
formula from the three.js shader source, not re-fetched) [derived].

### B1. Story use, key geometry, contrast

| # | name | story use | key direction (toward sun) | elevation / side | key:fill target | cast shadows |
|---|---|---|---|---|---|---|
| 1 | `day` (existing) | hook, set-up, rule, "normal world" | [-0.55, 0.80, 0.35] | 51 deg, front-left | 3.5:1 (toon 4.3:1) | crisp, 0.8 h long |
| 2 | `noon-hard` | heat, exposure, comedy "caught in the open" | [-0.35, 0.91, 0.24] | 65 deg, front-left | 5:1 | short (0.47 h), hard |
| 3 | `morning` | fresh start, "next week", optimism | [-0.78, 0.42, 0.45] | 25 deg, front-left | 3:1 | long (2.1 h), soft |
| 4 | `golden` (existing) | reward, stakes, nostalgia, greed glow | [-0.80, 0.32, 0.40] | 20 deg, front-left | 6:1 | long (2.8 h), soft, violet |
| 5 | `sunset-back` | emotional peak, exit, silhouette + rim | [-0.48, 0.26, -0.84] | 15 deg, back-left | 8:1 on set, faces protected | toward camera, long |
| 6 | `dawn-payoff` | return of light at the payoff | [-0.88, 0.26, 0.41] | 15 deg, front-left | 4:1 | long, pink-edged |
| 7 | `dusk` (blue hour) | escalation, "headlights on", unease | [-0.85, 0.21, -0.49] | 12 deg, back-left (afterglow side) | 2.5:1 ambient; practicals 6:1 | very faint; practical shadows only |
| 8 | `night-moon` | the explanation, quiet night, secrecy | [0.71, 0.57, -0.41] | 35 deg, back-right | 3:1 to 4:1 | soft, low contrast |
| 9 | `night-practical` | peak greed, garage, party, string lights | moon as 8 at half strength; key = warm point lights | lamp height 2.5 to 4 m | 8:1 inside pools | lamps are shadowless in the engine: use contact blobs, pool decals (E3) |
| 10 | `neon` | temptation, city, tech, nightlife | moon minimal; two coloured practicals from opposite sides | 2 to 4 m high | 6:1, coloured both sides | none or blob only |
| 11 | `overcast` (existing) | neutral, authority, deflation | [-0.30, 0.90, 0.20] | 68 deg | 1.5:1 | none: AO + contact blob |
| 12 | `rain` | THE TURN, comeuppance, sadness | [-0.30, 0.90, 0.20] | 68 deg | 1.3:1 | none; reflections instead |
| 13 | `storm` | danger, climax, chase | [-0.17, 0.97, 0.20]; lightning from [0.6, 0.5, -0.6] | 75 deg; flash from back-right | 1.3:1; flash 16:1 for 2 to 3 f | only in the flash |
| 14 | `fog-mist` | mystery, uncertainty, morning after | [0.31, 0.42, -0.85] | 25 deg, back-right | 2:1 | lost in fog; shafts instead |
| 15 | `interior-window` | cool office daylight, authority, clerk | [-0.85, 0.50, 0.15] | 30 deg, side-left through window | 4:1 near window, 2:1 deep in room | window-frame pattern on floor/wall |
| 16 | `interior-warm` | home evening, counting money, cosy or greedy | sun slot used as dim blue window fill [0.85, 0.40, 0.30]; key = lamp point light | lamp at 1.6 to 2.2 m | 6:1 to 8:1 | lamp is shadowless: blob + pool decal (E3) |
| 17 | `fire-candle` | secret, confession, camp story | point light at 0.5 to 1 m height, flicker | below eye level | 8:1 and more | upward, dancing |
| 18 | `spotlight` | reveal, shame, "caught", the evidence object | [0.00, 0.98, 0.17] | 80 deg, top | 16:1; surround 3 stops down | hard pool edge |
| 19 | `dream-highkey` | memory, fantasy, "imagine if" | [-0.50, 0.71, 0.50] | 45 deg front-left | 1.5:1 | very soft, pale |
| 20 | `studio` / `space` (existing) | diagram inserts / orbit shots | as in engine | 47 deg / 15 deg | 2.6:1 / 100:1 | as in engine |

### B2. Colours

| # | name | key colour (approx K) + `sunI` | hemi sky / ground + `hemiI` | `amb` | shadow tint (`shadeMul`; `shadeReplace` @ amount) | fog colour, [near, far] | sky top / horizon (/ glow band) |
|---|---|---|---|---|---|---|---|
| 1 | `day` | #fff1d6 (5,200 K), 2.6 | #9cc8ff / #7a6a4a, 1.1 | 0.15 | #8a8296; #6a6d92 @ 0 | #bfe0ff, [12, 140] | #3f8ff0 / #bfe6ff (reference sky anchor: #1b80d9; consider #2a86e0 top) |
| 2 | `noon-hard` | #fff6e6 (5,600 K), 3.0 | #8ec0ff / #8a7a56, 0.9 | 0.12 | #7a7890; #5f6a96 @ 0.1 | #cfe6ff, [20, 200] | #1b80d9 / #a9d8ff |
| 3 | `morning` | #ffe4ce (5,000 K), 2.3 | #a9c9f5 / #7d6f58, 1.0 | 0.15 | #8488aa; #6f7aa6 @ 0.15 | #dbe7f2, [8, 90] | #4d9be8 / #ffe9d2 |
| 4 | `golden` | #ffbd7a (3,200 K), 2.8 | #8f86d6 / #7a5236, 0.9 | 0.12 | #5c5578; #5b5173 @ 0.3 | #ffc89a, [10, 110] | #5a63c9 / #ffb98a |
| 5 | `sunset-back` | #ff9d5a (2,600 K), 3.0 | #7a78c8 / #6a4a3a, 1.1 | 0.15 | #4f4a7a; #4a3f78 @ 0.4 | #ffb07a, [8, 90] | #4a4fb0 / #ff9a5c / #ffd08a |
| 6 | `dawn-payoff` | #ffc9a0 (3,800 K, pink-gold), 2.6 | #b7b0ea / #806050, 1.0 | 0.15 | #6f6890; #6a5f8e @ 0.25 | #ffd9c4, [10, 110] | #6f8fe0 / #ffc9b0 |
| 7 | `dusk` | #ff9f8a (afterglow, not a sun), 0.9 | #6e54d3 / #2a1f55, 1.0 | 0.12 | #4a4488; #2a1f5c @ 0.4 | #5a4ab0, [8, 95] | #1f1a5c / #b0589c / #ff9b6a; darkest tone #170e33 |
| 8 | `night-moon` | #a9bcff (stylised; real moon is about 4,100 K), 1.0 | #2a3570 / #151a30, 0.8 | 0.10 | #3d3f86; #26286a @ 0.45 | #1b2448, [6, 80] | #060b2e / #1d2f7a (anchor #011d68) |
| 9 | `night-practical` | moon #a9bcff, 0.5; lamps #ffa957 (2,700 K) or #ff9d3f (2,400 K) | #1f2858 / #10142a, 0.55 | 0.08 | as 8 outside pools; inside pools hue-keeping x0.45 | #141a3c, [5, 60] | #040824 / #15235e |
| 10 | `neon` | moon #8fa0ff, 0.3; practicals #ff3fa4 + #2fe0ff (+ #ffb000 accent) | #1a1440 / #0d0a24, 0.5 | 0.06 | #2a2468; #1c1450 @ 0.5 | #24124a, [4, 50] | #05041c / #2a1456 |
| 11 | `overcast` | #f4f6fa (6,500 K), 1.2 | #c9d3df / #7d7a72, 1.5 | 0.20 | #b4b8c4; #8f9aa8 @ 0.1 | #d4dbe3, [10, 100] | #a7b3c2 / #dfe5ec |
| 12 | `rain` | #dfe9ef (7,000 K), 0.7 | #9fb9c8 / #4a5a62, 1.4 | 0.20 | #9aa6b2; #314e5f @ 0.25 | #87adbe, [5, 55] | #5c7482 / #9fb8c4 |
| 13 | `storm` | #b8c4d0, 0.5; flash #e8f0ff, 6.0 | #56677a / #2c343c, 1.1 | 0.12 | #6a7686; #2e3a48 @ 0.35 | #4a5a68, [4, 60] | #2e3944 / #6f8290 |
| 14 | `fog-mist` | #fff0dc (4,500 K), 1.0 | #cfd8dc / #8a8a84, 1.4 | 0.25 | #c2c6c8; #aab4ba @ 0.3 | #cfd9de, [2, 35] | #b8c6cf / #d6dfe3 (sky = fog) |
| 15 | `interior-window` | #eef4ff (7,500 K sky light), 2.2 | #b8ccd8 / #8a6a52, 0.9 | 0.20 | #6f7890; #4c5670 @ 0.2 | off, or #7297aa, [15, 60] for shafts | n/a: wall #7297aa, wood #994f2c (measured anchors) |
| 16 | `interior-warm` | window fill #7f8fd0, 0.5; lamp #ffa957 (2,700 K) | #4a4470 / #5a3a2a, 0.6 | 0.10 | #7d6f84; #5e5070 @ 0.15 | off | n/a: window shows dusk sky #2b2a7a |
| 17 | `fire-candle` | flame #ff8a12 (2,000 K); sun slot #6f80c0, 0.25 | #1a2248 / #0d1020, 0.4 | 0.05 | #3a2a4a; #201838 @ 0.5 | #0e1226, [3, 40] | #03051a / #101a44 |
| 18 | `spotlight` | #fff6e6 (5,600 K), 3.2 | #20243a / #101220, 0.25 | 0.03 | #2a2c44; #15172c @ 0.5 | #0c0e1c, [6, 60] | #05060f / #0c1024 |
| 19 | `dream-highkey` | #fff6ea, 2.2 | #e6ecff / #d8cfc0, 1.6 | 0.30 | #c8c2d6; #b8b4d8 @ 0.2 | #f2ecff, [4, 60] | #cfd8ff / #fff2f6 |
| 20 | `studio` / `space` | #ffffff, 2.2 / #ffffff, 3.2 | #f0f0ff / #c9c0b0, 1.0 // #1a2040 / #000000, 0.15 | 0.25 / 0.03 | as day / black allowed | #ece6dc / none | #ece6dc / #ece6dc // #02030a / #050816 |

Point-light sizing rule for rows 9, 10, 16, 17 [derived from the three.js distance falloff, where irradiance is about
intensity / d^decay inside the cut-off distance]: to give a subject at distance d the same irradiance as a sun of
`sunI = 2.4`, set intensity = 2.4 x d^decay. With the engine's habitual decay of 1.2 to 1.6 and d = 2 m that is 5.5 to
7.3; with physical decay 2 it is 9.6. The elevator project's `nightKey` (7 at about 2 m, decay 1.2) follows this.
Caveat (see D): the 1.6 toon shader adds non-sun lights back as ONE soft band that switches on at a diffuse
luminance of 0.004 to 0.035 and is capped at 0.5 (then x 1.6). So on toonified surfaces a lamp's intensity mostly
sets how FAR its pool reaches, not how bright it is: with intensity 7, decay 1.2 and albedo 0.5 the band would
extend about 18 m, so the light's `distance` cut-off (9 m in the projects) is what really sets the pool radius
[derived]. Size pools with `distance` (3 to 5 m for a lamp, 1.5 to 2.5 m for a candle, 8 to 12 m for a street
light) and keep intensity at 4 to 8. Cards still ignore these lights.

### B3. Finishing: bloom, haze, exposure, grade

| # | name | LOOK to start from | exposure / mean-luma target | saturation | black floor | vignette | bloom (threshold / strength / radius) | haze and extras |
|---|---|---|---|---|---|---|---|---|
| 1 | `day` | `toonworld-day` | 1.0 / 0.50 to 0.58 | 1.26 | 0.045 | 0.12 | 1.0 / 0.5 / 1.2 (emissives only) | light aerial fog; cloud-shadow cookie on ground |
| 2 | `noon-hard` | `toonworld-day`, contrast 1.28 | 1.0 / 0.55 | 1.2 | 0.03 | 0.10 | 1.0 / 0.4 / 1.0 | heat shimmer optional; no haze |
| 3 | `morning` | `toonworld-day`, contrast 1.12 | 1.0 / 0.52 | 1.15 | 0.06 | 0.12 | 0.95 / 0.5 / 1.4 | ground mist (fog near 8), motes in shafts |
| 4 | `golden` | `toonworld-golden` | 0.97 / 0.45 to 0.52 | 1.25 | 0.06 | 0.20 | 0.95 / 0.55 / 1.3 | warm fog, motes, foliage dapple |
| 5 | `sunset-back` | `toonworld-golden`, vignette 0.25 | 0.95 / 0.42 | 1.3 | 0.05 | 0.25 | 0.90 / 0.7 / 1.5 | god rays from the sun, rim on every card |
| 6 | `dawn-payoff` | `toonworld-golden`, blackPoint 0.07 | 1.0 / 0.50 | 1.2 | 0.07 | 0.15 | 0.95 / 0.55 / 1.4 | soft mist, lifting during the shot |
| 7 | `dusk` | new `toonworld-dusk` (B4) | 0.92 / 0.32 to 0.40 | 1.3 | 0.04 | 0.30 | 0.95 / 0.6 / 1.4 | headlight cones, lit windows, first stars |
| 8 | `night-moon` | `toonworld-night` | 0.9 / 0.24 to 0.30 | 1.35 | 0.03 | 0.42 | 0.95 / 0.6 / 1.4 | stars, moon disc + glow, thin mist |
| 9 | `night-practical` | `toonworld-night`, vignette 0.45 | 0.9 / 0.22 to 0.28 | 1.35 | 0.03 | 0.45 | 0.90 / 0.7 / 1.5 | glow sprite on each bulb, ground pools, motes in pools |
| 10 | `neon` | `toonworld-night` + bloom from `neon-night` | 0.95 / 0.25 | 1.3 | 0.02 | 0.35 | 0.6 / 0.55 / 1.6 | haze tinted by the dominant sign, wet ground, chroma 1.0 |
| 11 | `overcast` | new `toonworld-overcast` (B4) | 1.0 / 0.46 | 1.1 | 0.04 | 0.15 | 1.0 / 0.4 / 1.2 | even fog; no shafts |
| 12 | `rain` | new `toonworld-rain` (B4) | 0.95 / 0.36 to 0.42 | 0.85 | 0.015 (reference short has true blacks, floor 0.008) | 0.25 | 0.90 / 0.55 / 1.5 | rain streaks (backlit), wet ground reflections, headlights, splash rings |
| 13 | `storm` | `toonworld-rain`, contrast 1.2 | 0.85 / 0.28 | 0.75 | 0.01 | 0.35 | 0.85 / 0.6 / 1.6 | heavy rain, lightning flash 2 to 3 f, wind sway x2 |
| 14 | `fog-mist` | new `toonworld-fog` (B4) | 1.0 / 0.55 | 0.9 | 0.08 | 0.10 | 0.85 / 0.5 / 1.8 | god rays if backlit; silhouettes; softness 0.08 |
| 15 | `interior-window` | `toonworld-interior`, cool highs | 1.0 / 0.42 to 0.50 | 1.15 | 0.05 | 0.25 | 0.95 / 0.5 / 1.4 | window cookie on floor, dust motes in the shaft |
| 16 | `interior-warm` | `toonworld-interior` | 0.95 / 0.36 | 1.2 | 0.05 | 0.30 | 0.90 / 0.6 / 1.4 | lamp glow sprite; window shows blue dusk |
| 17 | `fire-candle` | `toonworld-night`, warm highs | 0.9 / 0.22 | 1.3 | 0.03 | 0.45 | 0.85 / 0.7 / 1.5 | flicker +/-15 % (seeded noise, 6 to 10 Hz), sparks |
| 18 | `spotlight` | `toonworld-night`, vignette 0.5 | 0.9 / 0.20 | 1.2 | 0.02 | 0.50 | 0.95 / 0.5 / 1.3 | visible cone (lightBeam), dust in cone |
| 19 | `dream-highkey` | `toonworld-day`, contrast 1.0 | 1.12 / 0.68 | 0.9 | 0.10 | 0.0 (or a white edge fade, not available) | 0.80 / 0.6 / 1.6 | softness 0.15, sparkle FX |
| 20 | `studio` / `space` | `clean-explainer` / `cinematic-film` | as in engine | as in engine | as in engine | as in engine | as in engine | none / stars |

Mapping to the reference short's colour script: hook + rule + reward = 1 (then 4 for the cheque); escalation = 7;
peak greed = 9; authority = 15; turn + reveal = 12; origin tag = stay in 12.

### B4. Paste-ready presets for the NEW setups (proposals; nothing in the repo was edited)

```ts
// world.ts: additions to LIGHTS (same shape as today; fogNF is a NEW optional field, see E1/E7)
dusk:           { sun: "#ff9f8a", sunI: 0.9, sky: "#6e54d3", ground: "#2a1f55", hemiI: 1.0, amb: 0.12, dir: [-0.85, 0.21, -0.49], fog: "#5a4ab0", skyTop: "#1f1a5c", skyHorizon: "#b0589c", fogNF: [8, 95] },
rain:           { sun: "#dfe9ef", sunI: 0.7, sky: "#9fb9c8", ground: "#4a5a62", hemiI: 1.4, amb: 0.20, dir: [-0.30, 0.90, 0.20], fog: "#87adbe", skyTop: "#5c7482", skyHorizon: "#9fb8c4", fogNF: [5, 55] },
storm:          { sun: "#b8c4d0", sunI: 0.5, sky: "#56677a", ground: "#2c343c", hemiI: 1.1, amb: 0.12, dir: [-0.17, 0.97, 0.20], fog: "#4a5a68", skyTop: "#2e3944", skyHorizon: "#6f8290", fogNF: [4, 60] },
fog:            { sun: "#fff0dc", sunI: 1.0, sky: "#cfd8dc", ground: "#8a8a84", hemiI: 1.4, amb: 0.25, dir: [0.31, 0.42, -0.85], fog: "#cfd9de", skyTop: "#b8c6cf", skyHorizon: "#d6dfe3", fogNF: [2, 35] },
morning:        { sun: "#ffe4ce", sunI: 2.3, sky: "#a9c9f5", ground: "#7d6f58", hemiI: 1.0, amb: 0.15, dir: [-0.78, 0.42, 0.45], fog: "#dbe7f2", skyTop: "#4d9be8", skyHorizon: "#ffe9d2", fogNF: [8, 90] },
sunsetBack:     { sun: "#ff9d5a", sunI: 3.0, sky: "#7a78c8", ground: "#6a4a3a", hemiI: 1.1, amb: 0.15, dir: [-0.48, 0.26, -0.84], fog: "#ffb07a", skyTop: "#4a4fb0", skyHorizon: "#ff9a5c", fogNF: [8, 90] },
dawn:           { sun: "#ffc9a0", sunI: 2.6, sky: "#b7b0ea", ground: "#806050", hemiI: 1.0, amb: 0.15, dir: [-0.88, 0.26, 0.41], fog: "#ffd9c4", skyTop: "#6f8fe0", skyHorizon: "#ffc9b0", fogNF: [10, 110] },
nightMoon:      { sun: "#a9bcff", sunI: 1.0, sky: "#2a3570", ground: "#151a30", hemiI: 0.8, amb: 0.10, dir: [0.71, 0.57, -0.41], fog: "#1b2448", skyTop: "#060b2e", skyHorizon: "#1d2f7a", fogNF: [6, 80] },
nightPractical: { sun: "#a9bcff", sunI: 0.5, sky: "#1f2858", ground: "#10142a", hemiI: 0.55, amb: 0.08, dir: [0.71, 0.57, -0.41], fog: "#141a3c", skyTop: "#040824", skyHorizon: "#15235e", fogNF: [5, 60] },
neon:           { sun: "#8fa0ff", sunI: 0.3, sky: "#1a1440", ground: "#0d0a24", hemiI: 0.5, amb: 0.06, dir: [0.71, 0.57, -0.41], fog: "#24124a", skyTop: "#05041c", skyHorizon: "#2a1456", fogNF: [4, 50] },
interiorWindow: { sun: "#eef4ff", sunI: 2.2, sky: "#b8ccd8", ground: "#8a6a52", hemiI: 0.9, amb: 0.20, dir: [-0.85, 0.50, 0.15], fog: "#7297aa", skyTop: "#7297aa", skyHorizon: "#a9c2cf", fogNF: [15, 60] },
interiorWarm:   { sun: "#7f8fd0", sunI: 0.5, sky: "#4a4470", ground: "#5a3a2a", hemiI: 0.6, amb: 0.10, dir: [0.85, 0.40, 0.30], fog: "#2b2a4a", skyTop: "#2b2a7a", skyHorizon: "#6a5aa8", fogNF: [20, 80] },
spotlight:      { sun: "#fff6e6", sunI: 3.2, sky: "#20243a", ground: "#101220", hemiI: 0.25, amb: 0.03, dir: [0.00, 0.98, 0.17], fog: "#0c0e1c", skyTop: "#05060f", skyHorizon: "#0c1024", fogNF: [6, 60] },

// shaders.ts: additions to TOON_SETUPS (existing fields only, plus the optional 1.6 form fields)
overcast:       { cardTint: "#eef2f6", rampLo: 0.10, rampHi: 0.60, shadeMul: "#b4b8c4", shadeSat: 0.05, shadeReplace: "#8f9aa8", shadeReplaceAmt: 0.10, litTint: "#f2f5fa", litGain: 1.00, ambient: 0.30, rim: 0.05, rimColor: "#ffffff", drift: 0.05, term: 0.0 },
rain:           { cardTint: "#cfe0e8", rampLo: 0.10, rampHi: 0.60, shadeMul: "#9aa6b2", shadeSat: -0.15, shadeReplace: "#314e5f", shadeReplaceAmt: 0.25, litTint: "#dce8ee", litGain: 0.92, ambient: 0.28, rim: 0.08, rimColor: "#cfe6f0", drift: 0.05, skyFill: "#7f8c98", bounce: "#6a7480", term: 0.0 },
dusk:           { cardTint: "#d8c2ee", rampLo: 0.12, rampHi: 0.40, shadeMul: "#4a4488", shadeSat: 0.15, shadeReplace: "#2a1f5c", shadeReplaceAmt: 0.40, litTint: "#ffc9c0", litGain: 0.92, ambient: 0.20, rim: 0.30, rimColor: "#ff9a8a", drift: 0.05, term: 0.10, termColor: "#ff6a8a" },
fog:            { cardTint: "#eef0ee", rampLo: 0.05, rampHi: 0.70, shadeMul: "#c2c6c8", shadeSat: -0.10, shadeReplace: "#aab4ba", shadeReplaceAmt: 0.30, litTint: "#fff6ea", litGain: 1.00, ambient: 0.30, rim: 0.20, rimColor: "#fff2dc", drift: 0.04, term: 0.0 },
interiorWindow: { cardTint: "#e8f0f6", rampLo: 0.16, rampHi: 0.40, shadeMul: "#6f7890", shadeSat: 0.15, shadeReplace: "#4c5670", shadeReplaceAmt: 0.20, litTint: "#f0f6ff", litGain: 1.06, ambient: 0.24, rim: 0.12, rimColor: "#e6f2ff", drift: 0.05, bounce: "#a08468" },
sunsetBack:     { cardTint: "#ffc79a", rampLo: 0.10, rampHi: 0.30, shadeMul: "#4f4a7a", shadeSat: 0.15, shadeReplace: "#4a3f78", shadeReplaceAmt: 0.40, litTint: "#ffd2b0", litGain: 1.10, ambient: 0.26, rim: 0.55, rimColor: "#ffa65a", drift: 0.06, term: 0.18, termColor: "#ff6a2a" },

// look.ts: new toonworld looks (deepMerge(toonBase, ...))
"toonworld-dusk":     { grade: { blackPoint: 0.04, whitePoint: 0.97, contrast: 1.18, pivot: 0.47, saturation: 1.30, vibrance: 0.22, shadowTint: [0.0, -0.010, 0.10], highlightTint: [0.02, 0.0, 0.0] }, vignette: { amount: 0.30, softness: 0.45 }, bloom: { threshold: 0.95, strength: 0.6, radius: 1.4 } },
"toonworld-rain":     { grade: { blackPoint: 0.015, whitePoint: 0.94, contrast: 1.12, pivot: 0.45, saturation: 0.85, vibrance: 0.10, shadowTint: [-0.02, 0.008, 0.03], highlightTint: [-0.012, 0.0, 0.014] }, vignette: { amount: 0.25, softness: 0.5 }, bloom: { threshold: 0.90, strength: 0.55, radius: 1.5 } },
"toonworld-overcast": { grade: { blackPoint: 0.04, whitePoint: 0.95, contrast: 1.10, pivot: 0.5, saturation: 1.10, vibrance: 0.10, shadowTint: [0.0, 0.0, 0.02], highlightTint: [0.0, 0.0, 0.0] }, vignette: { amount: 0.15, softness: 0.5 } },
"toonworld-fog":      { grade: { blackPoint: 0.08, whitePoint: 0.95, contrast: 1.00, pivot: 0.5, saturation: 0.90, vibrance: 0.05, shadowTint: [0.0, 0.004, 0.012], highlightTint: [0.012, 0.006, -0.006] }, vignette: { amount: 0.10, softness: 0.6 }, bloom: { threshold: 0.85, strength: 0.5, radius: 1.8 }, softness: 0.08 },
"toonworld-office":   { grade: { blackPoint: 0.05, whitePoint: 0.98, contrast: 1.10, pivot: 0.5, saturation: 1.15, vibrance: 0.12, shadowTint: [0.03, -0.004, 0.02], highlightTint: [-0.01, 0.0, 0.02] }, vignette: { amount: 0.25, softness: 0.45 } },
```

Notes on these numbers:

- `rain` uses a negative `shadeSat` (the shader's `toonSat` mixes toward grey for negative values) and replaces
  25 % of the shade with the measured rain shadow anchor #314e5f; the fog colour is the measured #87adbe.
- `dusk` hemisphere sky is the measured #6e54d3. The "sun" slot is the afterglow: weak, pink, low and BEHIND the
  subject, so it acts as a rim and sky key, not as a sun.
- `nightMoon` differs from the existing `night` in exactly one important way: the key is behind the subject
  (z = -0.41) per day-for-night practice [S17][S18]; the existing `night` is a front-right key at 57 degrees, which
  lights the set flat.
- `overcast`/`rain`/`fog` ramps are wide (0.10 to 0.60) so the cel terminator becomes a soft gradient: a hard cel
  edge under an overcast sky contradicts the weather.

---

## C. Rules for lighting 2D character cards in a 3D world

What the reference studios do, reduced to what transfers:

- **Klaus (SPA Studios):** flat hand-drawn characters lit with tracked painted layers: key light, bounced light,
  ambient, occlusion, rim (up to eight layers per shot, also subsurface and eye specular); a warm transition between
  light and shadow on skin; lit characters must "suit the lighting conditions, sit well within the background and
  remain appealing"; background painters and character lighters work from the same lighting references; lighters
  were held back from over-modelling so it would not look "too 3D"; many ink outlines were removed and replaced by
  shadow shapes [S31][S32].
- **HD-2D (Octopath Traveler):** sprites in a 3D world; a point light was added so the sprites cast shadows on the
  environment; depth of field, bloom, volumetric light, fog and particles do the integration [S37].
- **Guilty Gear Xrd:** each character has its own light that affects that character and nothing else, with the
  light direction adjusted per character and per shot so the cel shapes always look drawn; shadow thresholds biased
  by vertex colour and hand-edited normals [S38: the per-character light is confirmed by secondary summaries of the
  GDC talk; the vertex-colour and normal details are from memory, unverified].
- **Team Fortress 2:** rim highlights instead of outlines for silhouette, cool shadows, reddened terminator,
  half-Lambert so the unlit side keeps shape [S21].
- **Anime-style games (Genshin Impact and its community reconstructions):** the face does not use N.L at all; the
  shadow boundary comes from an authored threshold map indexed by light angle, and the face mesh is often excluded
  from receiving cast shadows, because computed lighting on a simplified face "can be ugly" [S39, community
  sources via search summary].
- **Spider-Verse / Mitchells (Sony):** light is quantised into designed marks (halftone, hatching, brush strokes)
  that follow the lighting; outlines inherit the colour of what they sit on and are themselves lit; rim-light
  patterns track the character so they read as light [S33][S34].
- **South Park:** flat planes in 3D software, paper texture, and a small gap between the pieces so they shadow
  each other [S36].
- **Pixar:** even with full 3D, lights are cheated per shot to keep a face well shaped and appealing [S44].

Rules for our cards (numbers are `[design]` unless tagged; engine names in backticks):

1. **A card takes the key's COLOUR and the set's SHADOW, never the set's SHAPE.** Tint multiply plus a brightness
   floor in cast shadow (`uTint`, and since 1.6 the shade tint `uShadeC`, about 0.86). Do not N.L-shade a flat card: it would flip between fully lit and
   fully dark as it billboards. Keep the luminance-normalised tint the engine already uses, then set the VALUE per
   setup with an exposure factor: day 1.0, golden 0.95, dusk 0.85, rain 0.85, night 0.72 to 0.80, spotlight
   surround 0.5.
2. **Face exemption.** The head region (top 38 % of a bobble card, measured head share) never falls below 0.45
   display luma at night or 0.55 by day (A16). Limit the away-side darkening on the head to half of what the body
   gets, and do not let prop or set cast shadows cut across the eyes: either mask received shadow on the head
   region (floor 0.92 there) or move the caster [S6][S44][S39].
3. **Cast-shadow floor by setup:** day 0.86 (measured), golden 0.80, overcast/rain 0.95 (there are no cast shadows
   to receive), night 0.90 (the card must stay brighter than the set), spotlight: 0.45 outside the pool.
4. **Rim per character, always from the key.** A thin band (1 to 1.5 % of card width) on the edge facing the key and
   on top edges [S21]. Strength: overcast 0.10, day 0.25 to 0.30 (engine `uRimA` 0.28), golden 0.45 to 0.60 in the
   sun colour, dusk/night 0.35 to 0.50 in the moon or practical colour, backlit setups 0.7 on BOTH side edges (wrap).
   The rim colour must be the light colour (`uRimC` should follow the setup; today it is a fixed white).
5. **Value separation before anything else.** Subject vs what is directly behind it: at least 0.30 apart in display
   value (A16). Choose the polarity per setup: light character on dark set (night, interior, spotlight) or dark
   character on light set (fog, backlit sunset, snow). If the costume matches the set value, change the set (move
   the light pool, shift fog) before touching the character palette [S6].
6. **Practicals must touch the cards.** A character next to a lamp, fire, neon sign or screen takes that light's
   colour on the side facing it (30 to 40 % tint, falling off with distance), plus a rim in that colour. Without it
   characters look pasted on in every night and interior scene [S37][S32].
7. **Shadows: three layers, always.** (a) Full-silhouette cast shadow from a proxy that faces the sun (engine has
   it). (b) Contact blob under the feet, offset away from the key by 0.18 x height (engine has it); opacity by
   setup: day 0.35 to 0.45, golden 0.4, overcast/rain 0.55 (it is the only shadow), night 0.5; colour = the setup's
   shade colour, not a fixed violet. (c) Occlusion where the card touches props (sitting, leaning): a soft dark
   gradient on the prop [S36][S37].
8. **Shadow tint equals the world's shade tint.** The card's own "away side" tint (`uSide`) and the blob colour
   should follow `shadeMul`/`shadeReplace` so characters and set share one shadow colour per setup [S32].
9. **Ink reacts to light.** Under strong coloured light move the card's ink colour 20 to 40 % toward the shadow hue
   (violet at dusk, navy at night); lines stay darkest element on the card but never pure black [S34]. On the lit
   rim side, thin or drop the outline where the rim band replaces it [S21][S31].
10. **Atmosphere applies to the cast in layers.** Hero inside the fog `near` distance (unfogged); background
    characters 10 to 15 % lighter/greyer and 15 % less saturated per depth layer, no rim [S20].
11. **Bloom never comes from a card.** Keep card output at or below 0.97 so only emissive props bloom (toonworld
    measured rule). Eye highlights and teeth are the usual offenders.
12. **Reflections sell contact on wet or glossy ground.** A vertically flipped copy of the card at 25 to 40 %
    opacity, stretched 1.2 to 1.5 x vertically and blurred, under the feet [S28 for the look of wet-ground
    reflections; implementation is design].
13. **Light-side continuity.** The drawn light side of a card (`lightSide`) may only flip at a cut, never mid-shot
    (use hysteresis around the flip angle). When the camera orbits past the sun azimuth, hold the previous side
    until the next cut.
14. **Glass and overlays:** reflections drawn over characters behind glass (windscreens, windows) are 10 to 20 %
    opacity streaks that never cross the eyes; the reference shows characters inside cars with glass reflections
    over them [case study].
15. **One hero light per frame.** If two characters share a frame, the one who carries the beat gets the pool, the
    rim and the higher value contrast; the other is 0.5 to 1 stop down. Needs per-card controls (E8).
16. **Check on a phone-sized frame.** After lighting a setup, look at a 360 x 640 downscale: can you see the eyes,
    the mouth shape and the hand gesture? If not, fix value separation (rule 5) and the face floor (rule 2) first.

---

## D. What our engine has vs the gaps

Read from the files on 2026-11-11. `shaders.ts`, `world.ts`, `look.ts` and `post.ts` were being edited during this
session (the changes are labelled "1.6" in their comments). This section describes the state after the last re-read,
which includes the 1.6 additions: non-sun lights as a soft band, terminator band, form-following sky/bounce fill,
stylised AO, card rim, card shade tint and `lightShafts`. Re-check before acting.

### D1. What exists

| area | what the engine has | where |
|---|---|---|
| light rig | one shadow-casting `DirectionalLight` ("sun"), one `HemisphereLight` (sky/ground), one white `AmbientLight`; 6 presets: `day`, `golden`, `night`, `overcast`, `studio`, `space` | `world.ts` `LIGHTS`, `lights()` |
| preset contrast (plain Lambert, computed) | lit:shadow on a sun-facing wall: day 3.7:1, golden 6.3:1, night 2.9:1, overcast 1.5:1, studio 2.6:1, space 100:1 | [derived] |
| preset geometry (computed) | elevation: day 51 deg, golden 20 deg, night 57 deg, overcast 68 deg, studio 47 deg, space 15 deg; all are FRONT lights (z > 0); night comes from front-right | [derived] |
| shadows | 4096 map, PCF with `shadow.radius = 3`, ortho frustum +/-`shadowSize` (default 40 m, about 2 cm per texel), bias -0.0004, normalBias 0.03 | `lights()`, `Stage3D.tsx` |
| fog | linear `THREE.Fog` in the preset's colour, near/far only via `opts.fog` (default [60, 320]) | `lights()` |
| sky | gradient dome with top/horizon/(bottom) uniforms, `stars()`, cloud cards | `sky()`, `skyFor()` |
| cel world | `toonifyScene`: cel ramp on sun N.L, with the cast-shadow edge on its own threshold (`sunVis` 0.32 to 0.68) since 1.6; hue-keeping shade (`shadeMul`, `shadeSat`), replacement shade colour, lit tint/gain, fresnel rim (lit side only), painted drift; 1.6 adds form-following fill (`uSkyFill` up, `uBounce` down) and a saturated terminator band (`uTerm`, `uTermColor`) | `shaders.ts` |
| local lights on the cel world (1.6) | every non-sun light (`directDiffuse` minus the sun's part) is added back as one soft band: on at diffuse luminance 0.004 to 0.035, capped at 0.5, x 1.6. Lamps, windows and fires now make pools of light on toonified surfaces | `shaders.ts` `TOON_FRAG_BODY` |
| stylised AO (1.6) | `look.ao` (toonworld default: strength 0.5, radius 0.55, violet tint #6a5c9c): contact darkening that survives overcast | `look.ts`, `post.ts` |
| light shafts (1.6) | `lightShafts({ from, dir, len, width, color, strength })`: additive crossed cards from hand-placed source points, camera-independent, `setStrength()` to fade with the key | `world.ts` |
| toon contrast (computed) | lit:shade in linear light: day 4.3:1 (2.1 stops; 0.52 in display values, matching the measured "shade is about 0.5 x lit"), golden 8.4:1, night 7.7:1, interior 4.9:1 | [derived] from `TOON_SETUPS` |
| toon setups | `day`, `golden`, `night`, `interior`; `applyToonSetup(u, a, b, t)` blends two per frame | `shaders.ts` |
| cards | Lambert card with `cardShade`: light tint (55 % mix, luminance-normalised), cast-shadow multiply by a shade TINT (`uShadeC`, about 0.86, violet-leaning, 1.6) instead of a grey floor, away-side gradient, 1.6 key-side/top rim (`uRimA` 0.28, `uRimC` white, measured in drawing pixels, never on the ink line, 35 % strength in shadow); sun-facing invisible proxy for a full-silhouette cast shadow; violet contact blob offset from the sun; drawn light side | `cast.ts`, `shaders.ts` |
| looks | grade (black/white point, contrast, saturation, vibrance, split tone, zone tints, fitted tone curve), ink, DOF, bloom with threshold (+ halation), vignette, grain, chroma, softness, motion blur; 1.6 adds an `ao` block (strength 0.5, radius 0.55, violet tint) and ink `hue` | `look.ts`, `post.ts` |
| toonworld looks | `toonworld-day`, `-golden`, `-night`, `-interior`; `lookTimeline` with eased 18-frame cross-fades; `lerpLook` | `look.ts` |
| practical props | `lampPost`, `lantern`, lighthouse lamp (emissive HDR colour + `PointLight` + additive `lightBeam` cones), 2D `shaft` and `aura` FX sprites, `motes()` | `world.ts`, `fx.ts` |
| water | `toonWater` (gradient, crests, glints, no reflections) | `shaders.ts` |
| lighting animation | done by hand in each project: about 12 lines lerping sun colour/intensity/position, hemisphere, sky uniforms, fog colour, then `applyToonSetup` | `projects/elevator`, `projects/manhole` |
| QA | shot audit for occlusion, framing, size, camera-inside-geometry; no luminance checks | `audit.ts` |

### D2. Gaps, most serious first

1. **Local lights reach the set but not the characters.** Since 1.6 the toon world receives lamps, windows and
   fires as a soft band, but `cardShade` still writes `outgoingLight = cardCol` from the sun term, the global tint
   and the shade tint only. A character standing in a lamp pool at night is lit exactly like one standing in the
   dark next to it: no warm side, no local rim. This is the "pasted on" failure of rule C6 and it hits the most
   important beats (night-practical, interior-warm, neon, fire, spotlight: B rows 9, 10, 16, 17, 18). Two smaller
   limits of the new band: it is a single capped level (intensity sets reach, not brightness; no second, hotter
   band near the source, so a lamp and a floodlight look alike), and point lights cast no shadows, so pools ignore
   walls unless the light's `distance` is set by hand.
2. **No recipe for the reference short's turn and escalation.** There is no `dusk`, `rain`, `interior-window` or
   `night-practical` in `LIGHTS`; no `overcast`/`rain`/`dusk` in `TOON_SETUPS`; no `toonworld-rain`,
   `-dusk`, `-overcast` look. The case study's colour script needs five setups; the toon pipeline covers two and a
   half of them.
3. **No rain or wet-street kit.** No rain particles, no wet-ground response, no reflections, no puddles, no
   headlight cones as a standard prop. The case study lists wet roads and rain streaks among the detail we lack.
4. **Lighting is not a first-class, keyframed object.** `lights()` is static; every project re-implements the
   lerp of a dozen values, and it is easy to forget one (fog colour, sky, hemisphere, card tint, toon setup, look).
   There is no single "lighting key" that bundles them and no `lightTimeline`.
5. **The night key is a front light.** `night.dir` = [0.4, 0.7, 0.2] is front-right at 57 degrees. Night reads
   better with the moon three-quarter BEHIND the subject (rim on characters and roofs, dark fronts lifted by fill
   and practicals) [S17][S18][S29].
6. **Rim cannot act as a backlight.** World rim is multiplied by `ramp` (lit side only) and has no direction; card
   rim is on the key side only, in fixed white, shared by all cards. Backlit sunset, moon rim and neon edge light
   are not expressible.
7. **Card lighting is global.** `CARD_U` is one shared uniform object (tint, shade tint, rim): no per-character
   exposure, shade, rim or local light tint; no hero vs crowd difference; no face-region protection; blob colour
   and opacity are fixed (violet 0.55) whatever the weather; `uRimC` and `uShadeC` have to be set by the project
   per setup (they are not part of `TOON_SETUPS`, only `cardTint` is).
8. **Flat lit surfaces.** No cookies: no cloud shadows on the ground, no foliage dapple, no window-frame pattern.
   Large planes are evenly lit, which is the main reason an exterior reads as "CG stage".
9. **Fog is one linear ramp.** No exp2 or height fog, no sun-side glow in the fog (inscatter), near/far not part
   of the preset, fog and sky-horizon colours kept in sync by hand.
10. **Shafts are hand-placed.** `lightShafts` (1.6) gives good, cheap beams, but each source point and the
    direction are authored by hand and are not tied to the sun of the current lighting key, to window/tree
    geometry or to a cookie; they are not occluded by characters walking through them, and there is no dust/mote
    coupling. (Lighthouse cones and the 2D `shaft` sprite also exist.)
11. **Shadows are one size fits all.** Fixed blur radius regardless of weather or sun height, no shadow-strength
    control for overcast (shadows stay crisp unless the ramp is changed), frustum not fitted to the shot (2 cm
    texels are coarse in a 4K close-up; long golden-hour shadows of tall buildings can leave a 40 m frustum).
12. **Sky has no sun or moon.** No disc, no glow toward the sun azimuth, no horizon glow band preset (the shader
    has a `bottom` colour but presets do not use it), stars are not tied to a night factor.
13. **No lighting QA.** Nothing measures face luma, subject/background contrast, mean luma per phase or
    near-black share, and nothing simulates a phone in ambient light.
14. **The white `AmbientLight`** adds neutral light to every shadow and slightly greys the coloured hemisphere fill
    (small; relevant only on un-toonified materials).
15. **No specular anywhere in the toon world** (`outgoingLight` is diffuse + emissive), so "reflective car paint"
    and wet highlights, which the case study counts among the reference's detail, are unavailable.
16. **Vignette is screen-centred and can only darken.** No off-centre vignette toward the subject, no white vignette
    for dream/flashback.

---

## E. The 12 most valuable lighting upgrades for OUR engine

Ordered by value for the toonworld Shorts pipeline. "Cost" = implementation effort (S about half a day, M one to
two days, L three or more); "risk" = chance of regressions or render-time cost.

### E1. Lighting keys and a light timeline (`LIGHT_KEYS`, `lightRig.at(frame)`)

- **Effect:** one named object per story phase sets sun, hemisphere, fog (colour + near/far), sky stops, toon
  setup, card uniforms and look together; a timeline cross-fades them on cuts/dissolves (11 to 18 frames) or over
  a long take. Makes the colour script executable and removes the hand-written lerps from every project.
- **Sketch:** `type LightKey = { lights: LIGHTS-entry & { fogNF }, toon: ToonSetup, look: string | Look, card?: {...} }`;
  `lightTimeline(keys: [frame, LightKey | name][], fade)` returns `at(frame)` that (a) lerps colours in linear
  space, (b) slerps the sun direction around the target, (c) calls `applyToonSetup`, (d) writes sky and fog,
  (e) returns the `Look` for `Stage3D look=`. Ship the 20 rows of section B as presets and a
  `colourScript([{ beat, key }])` helper that takes beat frames from the timeline.
- **Cost / risk:** S to M / low. Pure refactor of what the projects already do. Watch that the shadow camera follows
  the slerped sun and that `CharacterCard.place` keeps its light-side hysteresis (C13).

### E2. Let local lights reach the cards, and give the world band a second step (fixes gap 1)

- **Effect:** a character next to a lamp, window, fire, neon sign or headlight takes that light's colour on the
  side facing it and gets a rim in that colour, like the set around it already does since 1.6. Unlocks the
  night-practical, interior-warm, neon, fire and spotlight recipes for the CAST, i.e. the "peak" beat of the
  reference, and is the biggest single step against "pasted on" characters at night.
- **Sketch:** cards are Lambert materials, so three.js already computes `reflectedLight.directDiffuse` for them.
  In `cardShade`, do what the world shader now does: `extra = max(directDiffuse - sunPart, 0)`, take its colour
  (normalise by luminance) and a banded amount `smoothstep(0.004, 0.035, eL)`, then (a) tint the card
  `cardCol *= mix(vec3(1), 1 + localColor * 0.6, band)` capped so faces stay at or below 0.97, and (b) reuse the
  alpha-edge rim with `uRimC = localColor` on the edge facing the light. Because a card's normal faces the camera,
  N.L is unreliable for it: compute the local light's direction in the card's plane from the light position
  uniforms (nearest 2 lights) or simply use the light's irradiance at the card centre without N.L. For the world
  band add an optional second step (a hotter core within about 30 % of the pool radius) so lamp pools have a
  centre.
- **Cost / risk:** S to M / low to medium. Same shader-patch pattern the engine already uses (`addPatch`,
  `sunVisChunk()` guard). Check that the card tint does not double-count the global `uTint` in night setups.

### E3. Practical-light prop kit

- **Effect:** one call makes a motivated source that reads on a phone: visible bulb, glow, pool on the ground,
  light on nearby characters. Night frames get the required 5 to 10 % of bright pixels (A16) from story-relevant
  objects.
- **Sketch:** `practical({ kind: "bulb" | "window" | "headlight" | "neon" | "fire" | "screen", color | kelvin,
  power, radius })` returns a group with: emissive mesh in HDR colour (above the bloom threshold, as the lighthouse
  lamp does), a camera-facing additive glow sprite (so the halo exists even when bloom is off), a ground "pool"
  decal (additive radial gradient, squashed by perspective for headlights), an optional `lightBeam` cone, a
  `PointLight` with its `distance` set to the pool radius (the 1.6 band lights the set; E2 extends it to cards),
  and `set(k)` for switching/flicker with seeded noise. Include `kelvin()` using the table
  in A25, `stringLights(a, b, n)`, `carLights()`.
- **Cost / risk:** M / low. All building blocks exist (`lampPost`, `lantern`, `lightBeam`, `aura`).

### E4. Rain and wet-street kit plus `toonworld-rain`

- **Effect:** the reference's turn ("one rainy morning") becomes a one-line setup: grey sky, cool desaturated
  grade, streaks, shiny road with stretched reflections of headlights and tail lights, splash rings.
- **Sketch:** (a) rain: instanced camera-facing streak quads in a box that follows the camera, alpha 0.25 to 0.5,
  brighter where they pass in front of emissives or toward the key (backlight rule, A30), deterministic positions
  from frame; near layer with motion-blur-length streaks, far layer as a scrolling texture card. (b) wet ground
  uniform in the toon shader for up-facing surfaces: albedo x lerp(1, 0.55, wet) on porous ground (asphalt,
  stone; Lagarde uses down to 0.2), plus a sky-coloured Fresnel term rising at grazing angles, plus fake
  reflections: for each practical, a vertical streak sprite under it on the ground (length 2 to 6 x its height,
  wobbling with noise); puddle masks from low-frequency noise with a flat, brighter sky reflection. (c) splash
  ring FX and a windscreen-drops overlay for POV shots. (d) the `rain` rows of B4.
- **Cost / risk:** M to L / medium (particle count at 4K; keep streaks under about 3,000 instances and fog them).

### E5. Sun cookies: cloud shadows, foliage dapple, window pattern

- **Effect:** breaks up flat ground and walls, gives the eye a brighter pool to land on, sells "outdoors" and
  "there is a window", and gives cheap in-shot light animation (drifting clouds, moving leaves).
- **Sketch:** multiply `key` in the toon shader (and `sunVis` for cards) by a cookie value sampled in light space:
  project the world position onto the plane perpendicular to the sun direction, then sample (a) low-frequency
  noise thresholded softly for clouds (scale 20 to 60 m, drift 0.5 to 2 m/s, darkening 30 to 45 %), (b) a higher
  frequency two-octave blob noise masked to areas near trees for dapple (scale 0.3 to 1 m, wind-driven), or (c) a
  rectangular window grid for interiors (hard edges softened 2 to 5 cm). Because it multiplies `key`, the cel ramp
  quantises it into drawn-looking shapes for free.
- **Cost / risk:** S to M / low. Procedural, no textures, deterministic from frame.

### E6. Directional rim and backlight for world and cards

- **Effect:** backlit sunset, moon rim, neon edge light; characters separate from busy or dark sets; makes
  `sunset-back`, `night-moon`, `dusk` work.
- **Sketch:** world: second rim term not gated by `ramp`, weighted by how much the surface faces away from the
  camera AND toward the light: `pow(1 - N.V, 3..4) * saturate(dot(N, L_rim))`, optionally x N.up as in TF2 [S21],
  colour and strength per setup (`rim2`, `rim2Color`, `rimDir`). Cards: when the key is behind (sun z opposite the
  camera), draw the alpha-edge rim on both side edges and the top (the existing offset-alpha trick with two more
  taps), in `uRimC` = light colour, strength 0.5 to 0.7; add a faint wrap gradient 3 to 5 % of card width inside
  the edge.
- **Cost / risk:** S / low.

### E7. Fog upgrade: per-key distance, exp2/height option, sun-side glow

- **Effect:** correct aerial perspective per recipe, ground mist, the warm "glow toward the sun" that makes golden
  hour and fog shots look lit, and fog/sky that cannot drift apart.
- **Sketch:** move `[near, far]` into the lighting key (B4 `fogNF`). Override the fog shader chunk once
  (`THREE.ShaderChunk.fog_fragment`) to add: height falloff `exp(-max(0, y - y0) / h)` (h 3 to 8 m for mist),
  and inscatter colour `mix(fogColor, sunColor, pow(saturate(dot(viewDir, sunDir)), 8) * k)` with k 0.3 to 0.6.
  Tie fog colour to the sky horizon stop inside the light timeline.
- **Cost / risk:** S to M / low to medium (global chunk override touches every fogged material; guard like
  `sunVisChunk`).

### E8. Per-card light controls and face protection

- **Effect:** hero brighter than the crowd, one character in the pool and one out of it, faces that never go
  muddy, rim and blob that follow the setup. Directly improves phone readability.
- **Sketch:** give each `CharacterCard` its own uniform set cloned from `CARD_U` (`uExposure`, `uShadeC`, `uRimA`,
  `uRimC`, `uLocalTint`, `uFaceTop`, `uFaceFloor`) with setters; default them from the lighting key. In the
  shader, lift the floor and halve the away-side gradient where `vMapUv.y > uFaceTop`. Blob colour/opacity from
  the key. Crowd cards get -12 % value, -15 % saturation, rim 0.
- **Cost / risk:** S / low (program cache key stays the same; only uniform objects differ).

### E9. Shafts tied to the lighting key (auto-placed `lightShafts`, optional screen-space pass)

- **Effect:** visible beams through trees, windows, fog and rain without hand placement; a strong depth and mood
  cue for golden, fog, interior-window and sunset-back; guides the eye along the beam.
- **Sketch, step 1 (cheap):** build on the 1.6 `lightShafts`: take `dir` from the current lighting key's sun
  (negated), strength from the key (0 in overcast/rain/night-moon, 0.15 to 0.3 in golden/fog/window), colour from
  the sun colour; helpers `shaftsFromWindow(mesh)` and `shaftsFromCanopy(tree, n)` that pick the `from` points;
  spawn `motes()` inside each shaft volume; soft-fade a shaft where a card stands in it (depth fade).
- **Sketch, step 2 (when the sun is in frame):** GPU Gems 3 method [S24]: half-resolution occlusion buffer (sky and emissives bright, geometry black;
  the depth buffer already exists for ink/DOF), 48 to 64 radial samples toward the sun's screen position with
  decay about 0.96 to 0.97, density about 0.9, weight about 0.5, exposure 0.2 to 0.35 (community defaults,
  unverified against the chapter, which gives none), colour = sun colour, added before bloom; fade to zero as the
  sun's screen position leaves a guard band of 0.2 screen heights. For windows indoors use world-space quads
  (`lightBeam`-style) instead.
- **Cost / risk:** step 1 S / low; step 2 M / medium (one more post pass; flicker when occluders cross the frame
  edge, per the chapter's own caveat).

### E10. Lighting QA in the audit loop

- **Effect:** the engine catches unreadable lighting before a full render, the same way it catches occluded
  subjects today; makes "reads on a phone" a measured property.
- **Sketch:** on audit frames, read back a 180 x 320 downscale of the final frame and compute: (a) mean display luma
  of each audited subject's head box and of a ring around it; flag face < 0.45 (night) / 0.55 (day) or
  |subject - surround| < 0.30; (b) the same contrast after adding a veil (15 nits on a 500-nit white, i.e. +0.03
  linear) and flag < 3:1 [S42]; (c) mean luma per colour-script phase vs its target (A24), and the step between
  phases; (d) share of pixels below 0.05 and above 0.98; (e) key side per location (sign of sun x in camera space)
  changing between cuts inside one phase. Log as `[video-forge][light-audit]`.
- **Cost / risk:** M / low (read-back cost only on audit frames).

### E11. Shadow quality controls per lighting key

- **Effect:** crisp noon, soft long golden-hour shadows, no cast shadows in overcast/rain, clean close-ups.
- **Sketch:** add to the key: `shadowSoft` (maps to `shadow.radius` 1.5 to 8), `shadowStrength` 0..1 (blend
  `sunVis` toward 1 for overcast/rain/fog), `minElevation` clamp of 15 degrees for the shadow-casting direction
  (A28). Fit the ortho frustum to the camera's view of the ground each shot (snap to texel increments to avoid
  shimmer) so close-ups get millimetre texels. Optional distance-based softness: blur radius proportional to
  (receiver depth - blocker depth) as in PCSS [S25], 8 to 12 blocker samples.
- **Cost / risk:** S for the first three, M for PCSS / low to medium (shadow acne at low angles; keep `normalBias`).

### E12. Sky kit: sun/moon, glow, three-stop presets, lit clouds

- **Effect:** the sky tells the time of day on its own; night skies get structure (helps compression, A18); fog
  and sky stay consistent.
- **Sketch:** extend the sky shader with a sun/moon disc (0.5 degrees is too small to read on a phone; draw it
  2 to 4 degrees), a glow lobe `pow(saturate(dot(dir, sunDir)), 6..64)`, a horizon glow band (use the existing
  `bottom` uniform and add a fourth stop for dusk: zenith, upper, horizon, glow), stars multiplied by a night
  factor; cloud cards tinted by the key colour on their sun side and by the sky colour below. Drive everything
  from the lighting key.
- **Cost / risk:** S to M / low.

Smaller follow-ups worth listing: an off-centre "subject vignette" and a white vignette option for
dream/flashback; a lightning helper (2 to 3 frame key spike from a second direction with a matching sky flash);
card reflections on wet ground (C12); a simple toon specular for car paint and wet highlights (gap 15).

Suggested order: E1, E2, E3, E6, E8 (these five make night and dusk beats work and readable), then E4 (the
turn), E5, E7, E10, then E11, E12, E9.

---

## F. Sources

Fetched and read in this session unless marked. "Search summary only" means the page itself could not be fetched
(blocked or binary) and the claim rests on the search tool's summary of it; treat those as weaker.

| # | Source | URL | What it supports here |
|---|---|---|---|
| S1 | Sharon Calahan, "Storytelling through Lighting, a Computer Graphics Perspective", ch. 13 of *Advanced RenderMan* (Apodaca, Gritz), from SIGGRAPH 96 course 30 "Pixel Cinematography" | https://shop.elsevier.com/books/advanced-renderman/apodaca/978-0-08-049882-9 ; course contents: https://history.siggraph.org/wp-content/uploads/2021/08/1996-30-Contents-Pixel-Cinematography-A-Lighting-Approach-for-Computer-Graphics.pdf | The objectives of lighting (section titles 13.3 to 13.8: directing the viewer's eye, creating depth, time of day and season, mood/atmosphere/drama, character personality and situation, continuity). Only the table of contents and the course introduction were readable; the chapter body was not (403 on the full-text copies). |
| S2 | Wikipedia, "Lighting ratio" | https://en.wikipedia.org/wiki/Lighting_ratio | Stops to ratio (2^n), ASC (key + fill):fill convention, 2:1 sources = 3:1 additive. |
| S3 | Jeremy Birn, 3dRender.com, "Three-Point Lighting for 3D Renderings" | https://3drender.com/light/3point.html | Key 15 to 45 degrees side and up; fill at most half the key (2:1) down to one-eighth (8:1); tint fill with environment colour; rim behind/above, light-linked to the subject. |
| S4 | Wikipedia, "Three-point lighting" | https://en.wikipedia.org/wiki/Three-point_lighting | Key and fill at 30 to 45 degrees; fill up to half the key; back light vs kicker; background light. |
| S5 | Wikipedia, "Low-key lighting" | https://en.wikipedia.org/wiki/Low-key_lighting | Low key about 8:1, high key approaching 1:1; uses. |
| S6 | Cursa, "Blender Basics for Animation: Lights for Readable Animation" | https://cursa.app/en/page/blender-basics-for-animation-lights-for-readable-animation-and-simple-materials | Readability rules: fill 25 to 50 % of key, rim 0.5 to 1.2, squint and outline tests, change values before adding lights, keep shadows off the eyes. Tutorial-grade source. |
| S7 | Wikipedia, "Color temperature" | https://en.wikipedia.org/wiki/Color_temperature | Kelvin table of sources; daylight 5,500 to 6,500 K; blue sky 15,000 to 27,000 K; D65. |
| S8 | Andi Siess, Kelvin to RGB table | https://andi-siess.de/rgb-to-color-temperature/ | Hex values per Kelvin used in A25 and B2. |
| S9 | Wikipedia, "Golden hour (photography)" | https://en.wikipedia.org/wiki/Golden_hour_(photography) | Sun elevation ranges, about 3,500 K (2,000 K at the horizon), softer and lower contrast, long shadows. |
| S10 | Wikipedia, "Blue hour" | https://en.wikipedia.org/wiki/Blue_hour | Sun 4 to 8 degrees below horizon, 20 to 30 minutes, ozone (Chappuis) cause, pairs with artificial light. |
| S11 | Wikipedia, "Daylight" | https://en.wikipedia.org/wiki/Daylight | Illuminance table: sun 111,000 to 120,000 lux, blue-sky shade 20,000, overcast 1,000 to 2,000, sunset 400, full moon 0.25. |
| S12 | Wikipedia, "Moonlight" | https://en.wikipedia.org/wiki/Moonlight | Full moon 0.05 to 0.1 lux (up to 0.32), slightly redder than sunlight, 1/380,000 of the sun, Purkinje explanation of "blue". |
| S13 | Wikipedia, "Purkinje effect" | https://en.wikipedia.org/wiki/Purkinje_effect | Photopic peak 555 nm, scotopic 507 nm; reds darken in dim light. |
| S14 | James Gurney, "Is Moonlight Blue?" | https://gurneyjourney.blogspot.com/2008/01/is-moonlight-blue.html | Moonlight is not blue; rod/cone hypothesis (untested); induced blue from warm lamps; how painters render moonlight (low chroma, lost detail, no black). |
| S15 | James Gurney, "Golden Hour" | https://gurneyjourney.blogspot.com/2008/01/golden-hour.html | Golden lit forms, bluish shadows, zenith vs horizon sky colours, violet afterglow, lights standing out at dusk. |
| S16 | James Gurney, "Painting Smog: Six Secrets for Creating Atmosphere" | https://gurneyjourney.blogspot.com/2019/02/painting-smog-six-secrets-for-creating.html | Two value families, darkest darks small and in the foreground, raised distant darks, warm-to-cool darks, detail-free silhouettes. |
| S17 | Wikipedia, "Day for night" | https://en.wikipedia.org/wiki/Day_for_night | About 2 stops under, tungsten balance for "moonlight blue", sun as back light, sky darkening, dusk-for-night, Purkinje rationale. |
| S18 | Definition magazine, "Technique: Day for night" | https://definitionmagazine.com/features/technique-day-for-night/ | Overexpose then pull down 2 to 3 stops, three-quarter back/cross light, separate sky, fill or lift faces, avoid whites. |
| S19 | rogerdeakins.com forum, "Shooting DAY FOR NIGHT" (reply by David Mullen, ASC) | https://www.rogerdeakins.com/?p=219226 | DFN works best when the moon is the only source; with practicals use dusk-for-night. No statement by Deakins himself was found. |
| S20 | Wikipedia, "Aerial perspective" | https://en.wikipedia.org/wiki/Aerial_perspective | Contrast, saturation and hue changes with distance; contrast loss at all spatial frequencies (unlike blur). |
| S21 | Mitchell, Francke, Eng (Valve), "Illustrative Rendering in Team Fortress 2", NPAR 2007 | https://www.cs.princeton.edu/courses/archive/fall07/cos597B/papers/mitchell-team-fortress.pdf | Illustration rules (cool shadows not black, reddened saturated terminator, rim instead of outline), half-Lambert 0.5/0.5, painted 1D warp ramp with 0..2 output, rim Fresnel (1 - N.V)^4 and N.up mask. Read from the PDF text. |
| S22 | Gooch, Gooch, Shirley, Cohen, "A Non-Photorealistic Lighting Model for Automatic Technical Illustration", SIGGRAPH 1998 | https://users.cs.northwestern.edu/~bgooch/PDFs/gooch98.pdf | Cool-to-warm shading equations and parameter values b = 0.4, y = 0.4, alpha = 0.2, beta = 0.6; shading in mid-tones. Read from the PDF text. |
| S23 | Pellacini, Vidimce (Pixar), "Cinematic Lighting", GPU Gems ch. 10 | https://developer.nvidia.com/gpugems/gpugems/part-ii-lighting-and-shadows/chapter-10-cinematic-lighting | Art-directed light model: per-object selection, barn doors, cut-on/off, blockers, shadow colour/density, fake shadows, cookies; "cheat the physics of light". |
| S24 | Kenny Mitchell, "Volumetric Light Scattering as a Post-Process", GPU Gems 3 ch. 13 | https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process | God-ray method, exposure/decay/density/weight, occlusion pre-pass, limitations. The chapter gives no default values. |
| S25 | Randima Fernando (NVIDIA), "Percentage-Closer Soft Shadows" | https://developer.download.nvidia.com/shaderlibrary/docs/shadow_PCSS.pdf | Penumbra width formula. Search summary only (formula quoted there and in a matching patent). |
| S26 | Wikipedia, "Angular diameter" | https://en.wikipedia.org/wiki/Angular_diameter | Sun 31'27" to 32'32" (0.52 to 0.54 degrees). |
| S27 | Sébastien Lagarde, "Water drop 3b: Physically based wet surfaces" | https://seblagarde.wordpress.com/2013/04/14/water-drop-3b-physically-based-wet-surfaces/ | Wet recipe: diffuse x lerp(1, 0.2, porosity), gloss toward 1, no darkening on metals, puddle handling. |
| S28 | fxguide, "Game environments, Part C: making wet environments" | https://www.fxguide.com/?p=43362 | Wet look: darker, more specular, slight saturation rise; mirrors over dark albedo; asphalt x 0.1 to 0.3 with specular x 5 to 10; overcast gives a faint white tint; stretched highlights at night. |
| S29 | Sony Cine, "Night lighting, part 2: lighting the city at night" | https://sony-cinematography.com/articles/night-lighting---part-2---lighting-the-city-at-night/ | Supplement existing light at low level, backlight to separate from dark backgrounds, keep fill, wet-downs for highlights. |
| S30 | RedShark News "Shooting with physical effects, part two: water"; Melies "wet down" | https://www.redsharknews.com/post-vfx/item/4417-shooting-with-physical-effects-part-two-water ; https://melies.co/cinematic-techniques/atmosphere/wet-down | "Front light snow and backlight rain"; why streets are wetted at night. Search summary only. |
| S31 | befores & afters, "Here's what made the 2D animation in Klaus look 3D" | https://beforesandafters.com/2019/11/14/heres-what-made-the-2d-animation-in-klaus-look-3d/ | Klaus Light and Shadow tool, up to eight lighting layers (AO, subsurface, rim, eye specular, bounce), tracking, outlines replaced by shadows, colour bible, colour script about 1 shot in 4, M.O.E. texture pass. |
| S32 | Cartoon Brew, "How Klaus draws on centuries-old artistic principles" | https://cartoonbrew.com/feature-film/how-klaus-draws-on-centuries-old-artistic-principles-to-push-2d-animation-forward-182325.html | Named layers (key, bounced, ambient, occlusion, rim), warm skin terminator, simplify so it is not "too 3D", characters embedded in backgrounds. |
| S33 | Foundry, "Creating the graphic look in comp for Spider-Verse" | https://www.foundry.com/insights/film-tv/graphic-look-in-comp-spiderman | Halftones and hatching driven by lighting, rim-light halftones tracking the character, colour offset as depth of field. |
| S34 | SIGGRAPH blog, "The Handmade Look of The Mitchells vs. The Machines" (plus CGW "Dual Approach", search summary) | https://blog.siggraph.org/?p=13404 | Painterly brush tool responding to light, key lighting per sequence then per shot, bigger strokes for distant characters; outlines inherit colour and are lit (CGW, search summary only). |
| S35 | Arcane (Fortiche) coverage | https://redsharknews.com/why-netflixs-arcane-looks-so-good-how-fortiche-ramped-up-the-animation-pipeline ; https://80.lv/articles/arcane-artists-show-how-they-combine-traditional-art-3d-for-backgrounds | Light painted into textures, 2D FX in comp. Search summary only; secondary. |
| S36 | AWN, "Using computers to simulate cut-out animation: South Park and Blue's Clues" | https://www.awn.com/animationworld/dig-using-computers-simulate-cut-out-animation-techniques-south-park-and-blues-clues | Flat characters on planes in 3D software, paper texture, shadows from a small gap between the pieces. |
| S37 | Wikipedia, "HD-2D" (Unreal Engine spotlight article was blocked) | https://en.wikipedia.org/wiki/HD-2D | Sprites in 3D worlds; point light added so sprites cast shadows; DOF, bloom, volumetric light, fog. |
| S38 | Junya C. Motomura, "GuiltyGearXrd's Art Style: The X Factor Between 2D and 3D", GDC 2015 | https://gdcvault.com/play/1022031/GuiltyGearXrd-s-Art-Style-The ; handout https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf | Per-character lights independent of the environment (confirmed by secondary summaries). The handout could not be fetched; vertex-colour thresholds and edited normals are from memory. |
| S39 | Community reconstructions of anime face shading | https://github.com/NoiRC256/URPSimpleGenshinShaders ; https://sydianandrewchen.github.io/projects/3-stylized-facial-shadow-workflow | Face shadow from an authored threshold (SDF) map instead of N.L; face excluded from cast shadows. Search summary only; not studio sources. |
| S40 | DisplayMate, "Smartphone Displays Under Bright Ambient Lighting Shoot-Out" | https://displaymate.com/Smartphone_Brightness_ShootOut_1.htm | Reflected light exceeds black level at 300 lux; barely visible at 20,000 lux; reflectance 4.4 to 15.5 % (2010-era phones). |
| S41 | "Brighter, and Brighter Still" (display reflectance blog) | https://jacksblog-1j5.pages.dev/en/posts/display-reflectance | Veil luminance = illuminance x reflectance / pi; about 5 % for uncoated glass. Search summary only. |
| S42 | W3C, "Understanding SC 1.4.11 Non-text Contrast" | https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html | 3:1 minimum for graphics; contrast formula with the 0.05 flare term. |
| S43 | No Film School, "Shedding light on continuity lighting" | https://nofilmschool.com/shedding-light-continuity-lighting-tips | Light the master first, keep direction/colour/quality consistent, motivated changes, cheating is legitimate. |
| S44 | fxguide, "Inside a scene in Inside Out" | https://www.fxguide.com/?p=183623 | Colour keys before lighting, master lighting 1 to 4 weeks, cheated lights for an appealing face, A Bug's Life saturated-vs-grey cut. |
| S45 | ThunderChunky, "Pixar, colour and tent poles with Lou Romano" | https://www.thunderchunky.co.uk/articles/pixar-colour-and-tent-poles-with-lou-romano/ | "Part inspiration and part continuity", tent-pole images, mural tableaux per sequence, Up prologue vs reality. |
| S46 | Colour-script background: Hyperallergic on *The Art of Pixar*; MoMA Eggleston interview; CGW "A Night to Remember: Coco"; Disney colour-key pieces | https://hyperallergic.com/610771/the-art-of-pixar-chronicle-books/ ; https://www.moma.org/interactives/redstudio/interviews/behind/content/eggleston/assets/transcripts.php ; https://www.cgw.com/Press-Center/In-Focus/2018/A-Night-to-Remember-Coco.aspx ; https://fonzieland.substack.com/p/lighting-in-animation-how-does-that | Eggleston's first colour script, Nemo muting colour on dark beats, Coco taking colour/brightness away to direct attention, Disney colour keys and foundation lighting. Search summary only. |
| S47 | three.js docs and forum | https://threejs.org/docs/pages/FogExp2.html ; https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733 | FogExp2 (default density 0.00025); physically based light decay since r155. The exp2 formula is from the three.js shader source, not fetched. |
| S48 | Light wrap node documentation (Nuke, Natron) | https://learn.foundry.com/nuke/14.1/content/reference_guide/draw_nodes/lightwrap.html | What a light wrap is. Search summary only. |
| S49 | Videomaker, "What is a cucoloris"; Wikipedia "Gobo (lighting)" | https://www.videomaker.com/how-to/lighting/lighting-equipment-lighting/what-is-a-cucoloris-and-how-is-it-used-on-professional-film-sets/ | Cookies, gobos, branchaloris. Search summary only. |
| S50 | PremiumBeat, "Why color grade moonlight blue"; DVinfo "Shooting the moonlight look" | https://www.premiumbeat.com/blog/why-color-grade-moonlight-blue/ ; https://www.dvinfo.net/forum/techniques-independent-production/14111-shooting-moonlight-look.html | Moonlight about 4,100 K (reported); blue is a convention; trend to neutral cool. Search summary only; forum opinions. |
| S51 | Imagen, "Common video color grading mistakes for social clips" | https://imagen-ai.com/valuable-tips/common-video-color-grading-mistakes-for-social-clips/ | Shadow gradations band and block up after platform compression; test on a real phone. Search summary only; vendor blog. |
| S52 | SIGGRAPH history archive, "Practical Lighting on Toy Story 4" | https://history.siggraph.org/?p=82795 | Practical sources tagged on assets and converted to lights per shot (background for E3). Abstract only. |
| -- | Engine files read | `engine\src\lib\three\world.ts`, `shaders.ts`, `cast.ts`, `fx.ts`, `post.ts`, `Stage3D.tsx`, `..\look.ts`, `projects\elevator\index.tsx`; `references\craft.md`, `references\styles\toonworld-explainer.casestudy.md` | Section D and all "existing" numbers. |

### Claims to treat as unverified

- The exact wording of Calahan's guidance on what attracts the eye (A13): only her chapter's section titles could
  be read.
- Guilty Gear Xrd's vertex-colour shadow thresholds and edited normals (C, S38): from memory of the GDC talk.
- Genshin-style face shadow maps (C, S39): community reconstructions, not a studio publication.
- Arcane's pipeline details (A44, S35): secondary and fan sources.
- Moonlight at 4,100 to 4,150 K (A25, A31): repeated by blogs; Wikipedia only says "slightly redder than sunlight".
- "Overcast light shows local colour best" (A29) and the neon conventions (A34): craft conventions, no primary
  source fetched.
- The phone table (A15) is my model: 5 % reflectance, gamma 2.2, the listed nit levels. Modern phones may reflect
  less and get brighter; the direction of the conclusion (dark separations vanish first) is supported by S40.
- Compression behaviour of dark gradients on Shorts (A18): general experience plus one vendor blog.
- God-ray parameter values in E9: common community defaults; the GPU Gems chapter gives none.
- All `[design]` values in B and C: starting points derived from the principles and the measured reference
  palette, to be tuned by rendering and measuring with `vfa`.
- Gap D2.1 (local lights reach the toon world since 1.6 but not the cards) is read from the shader source, which
  was being edited during this session; confirm with a test frame (a strong red point light next to a toonified
  wall and a card) before planning around it.
