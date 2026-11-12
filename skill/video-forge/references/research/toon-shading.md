# Toon / NPR shading and ink outlines for stylized 3D

> **Status note (video-forge 1.6, 2026-11-11).** This is a research report written against the engine as it was on
> 2026-11-11 before / during the 1.6 work. Its "what our engine has vs gaps" and "upgrades" sections are a backlog, not
> the current state: see `references/research/shading-lighting.md` section 5 for what has been applied since. Evidence labels
> in the text say which claims were read in a source, summarised from search, measured, or left unverified.


Research report for the video-forge engine (Remotion 4 + three.js 0.187, WebGL2, headless Chromium/ANGLE,
deterministic per-frame rendering at 1440x2560). Target style: flat 2D cut-out character cards standing in an
inked, cel-shaded 3D world.

Researched 2026-11-11. Evidence labels used throughout:

- **[V]** read directly in a primary or first-hand source during this research (page fetched, PDF text extracted,
  or installed three.js source read).
- **[S]** seen only in a search-result summary or a third-party write-up of the primary source. Probably right,
  not confirmed against the original.
- **[U]** unverified: from general knowledge, could not be confirmed in a source this session.
- **[E]** my own engineering judgement or derivation for this engine. Not from a source. None of the GLSL in
  this file has been compiled or rendered; treat every sketch as a starting point.

Sources that could NOT be read (blocked or down), so anything attributed to them is [S] or [U]: the Guilty Gear
Xrd GDC 2015 slide PDF (ggxrd.com refused the connection), Ben Golus's Medium article (403; his code gist was
read instead), Omar Shehata's two Medium articles (403; repo README read instead), the Hi-Fi RUSH GDC slide PDF
(over the fetch size limit; third-party notes read instead), the Valve Half-Lambert wiki page (403; the TF2 paper
covers the same formula and was read).

---

## A. Key principles (rules with numbers)

### A1. Light and shadow bands

1. **Shadows are a colour decision, not a darkness decision.** Valve's TF2 study of Leyendecker/Cornwell/Rockwell
   lists the rules: shading shifts warm to cool, saturation rises at the terminator, the terminator is often
   reddened, high-frequency detail is dropped, silhouettes are stressed with rim highlights. In the paper's words:
   "Shadows go to cool, not black." [V]
2. **Two or three bands is the whole vocabulary.** Two (lit / shade) is the anime and Wind Waker default [S]; a
   third band is either a narrow terminator band or a specular/rim accent, not a second gradient. [E]
3. **Where the band edge sits.** three.js's built-in toon fallback puts the edge at half-Lambert 0.7 (N.L = 0.4)
   with the dark side at 0.7x the lit side [V, installed source]. Roystan's reference shader puts it at N.L = 0
   with a 0.01-wide smoothstep and a 0.4 grey ambient [V]. Our measured style rule is shade ~ 0.5x lit at the same
   hue with more saturation (style profile). Putting the edge at N.L 0.2-0.4 rather than 0 keeps more of a round
   form in shade, which reads as "designed"; 0 reads as "lit by a lamp". [E]
4. **Edge softness is a pixel-space quantity.** A hard `step` aliases; a fixed-width smoothstep in N.L units is
   razor thin on a big flat-ish surface and wide on a small sphere. Use `fwidth()` of the ramp input for a
   1-1.5 px anti-aliased edge (three.js does exactly this in its toon fallback [V]), then add any deliberate
   softness on top. [E]
5. **Half-Lambert** = `(0.5 * N.L + 0.5) ^ gamma`. Valve used gamma 2 from Half-Life onward; TF2 keeps scale and
   bias at 0.5, sets gamma to 1 and moves all shaping into a 1D artist-painted warp texture. The warp texture is
   stored at half brightness and multiplied by 2 in the shader so artists can paint up to 2x overbright; it has
   three regions: grey gradient (lit), a small reddish terminator, a cool gradient (shade). [V]
6. **Gooch cool-to-warm** is the formula version of rule 1: `k_cool = blue + alpha * k_d`,
   `k_warm = yellow + beta * k_d`, colour = lerp(k_cool, k_warm, (1 + N.L) / 2), with the paper's example values
   blue 0.4, yellow 0.4, alpha 0.2, beta 0.6 (second example: 0.55, 0.3, 0.25, 0.5). [S]
7. **Separate "form shadow" from "cast shadow".** N.L decides the form shadow, the shadow map decides the cast
   shadow. Threshold them separately and multiply, otherwise the cast-shadow edge moves and changes width with
   the surface's angle to the sun (see C, gap 3). [E]
8. **Characters are lit by rules, not by the scene.** Guilty Gear Xrd edits vertex normals and paints
   per-vertex shadow bias instead of trusting geometry [S/V-translation]; Genshin and Hi-Fi RUSH replace face
   normals with a painted SDF threshold map [V for the lookup formula, V-notes for Hi-Fi RUSH]; Hi-Fi RUSH
   characters ignore environment lights entirely [V-notes]. For flat cards this is good news: a card needs a
   small, rule-based response to the scene (tint, floor, side gradient), not real lighting.

### A2. Outlines

9. **Two families.** Inverted hull (per-object, vertex-shader, width paintable per vertex, no crease lines) and
   screen-space edge detection (whole frame, constant cost, finds creases, needs threshold tuning). Arc System
   Works uses hull for characters; Gravity Rush/Daze is cited as post-effect lines for backgrounds, hull for
   characters; Honkai 3rd ships both. [V-translation, V-slides]
10. **Edge sources and what each finds.** Depth: silhouettes and occlusion edges. Normals: creases. Colour /
    object-ID / "section map": boundaries that share depth and normal (decal on a wall, window in a hull). IDs
    are the robust one because they do not change with the camera. [V Ameye, S Shehata]
11. **Depth thresholds must scale with depth and with grazing angle.** Roystan: threshold x depth, then x
    (1 + 7 x saturate((1 - N.V - 0.5) / 0.5)); defaults depth 1.5, normal 0.4. [V] Our ink uses a better
    formulation (second difference of 1/z, exactly 0 on any plane), so it needs no grazing-angle hack.
12. **Line weight carries meaning.** Xrd paints it per vertex (A channel, 0.5 = standard, 1 = thickest, 0 = no
    line) with a separate channel for how much the line scales with camera distance. [V-translation] Honkai:
    vertex colour controls width and width is perspective-corrected. [V-slides] The drawing convention is
    silhouette > crease, shadow side > lit side, near > far. [E]
13. **A constant screen-space width needs the clip-space trick** for hulls: offset `xy` by
    `normalize(n_clip.xy) / resolution * w_clip * widthPx * 2`. [V Ameye] three.js's `OutlineEffect` and TSL
    `toonOutlinePass` use the same idea with a default thickness of 0.003 (clip-space fraction, not pixels).
    [V, installed source]
14. **Wide lines: jump flood.** Passes = ceil(log2(width + 1)); AA from the distance field is
    `saturate(width - dist + 1)`; sub-pixel edge recovery from an anti-aliased mask in the init pass. Brute
    force is fine at 1-4 px and becomes expensive quickly (reported: about 10 ms at 20 px at 1080p). [V gist; the
    10 ms figure is S]
15. **Our measured target:** about 3 px at a 1080 px short side, near-black or plum, on about 74 % of geometry
    edges, no lines on wall/floor seams, drawn before DOF (style profile).

### A3. Stability (the part that decides whether it survives video compression)

16. **Anything anchored to the screen swims when the camera moves** (the "shower door" effect, named in Meier
    1996, whose fix was to anchor strokes to particles on the surface). [S] Our camera moves on 99 % of frames,
    so screen-anchored halftone, hatching, paper grain or line wobble is the wrong default.
17. **Anchoring options, from cheap to correct:** world-space / triplanar coordinates (Hi-Fi RUSH maps halftone
    by world normal and world UV so dots sit on models [V-notes]); sphere-mapped pattern around the camera
    (Obra Dinn: stable under rotation, not under translation) [V runevision]; surface-stable fractal dithering
    (UV-anchored dots that split/merge to keep constant screen size) [V]; tracking the pattern to the character
    (Spider-Verse rim-light dots were tracked to Miles in fast motion so he did not swim through them) [V].
18. **Deliberate instability must be quantised in time.** Spider-Verse: animation mostly on twos (12 images/s),
    some ones and threes, no motion blur. [V] Line "boil" and wobble should change on twos or threes, never
    every frame; per-frame noise reads as codec noise and inflates bitrate. [E]
19. **Thin lines shimmer.** Keep rendered line width >= about 1.5 output pixels and fade opacity instead of
    thinning below that. [E] (Our far width 2.6 u = 3.5 px at 1440 is safe.)

### A4. Integration of 2D cards

20. Five cues make a flat card belong to a lit 3D set, in order of payoff: **ground contact** (blob + cast
    shadow), **shared light colour** (tint), **shared shadow colour** (the card's shadowed state uses the scene's
    shade tint, not grey), **directional accent** (rim or gradient on the key-light side), **shared atmosphere
    and lens** (fog, DOF, bloom, grain, light wrap applied after the card is in the frame). [E, consistent with
    compositing practice: light wrap = blurred background screened/added through a blurred inverted matte edge,
    S]

---

## B. Technique catalogue

Conventions for all GLSL below: three.js built-in material context. `normal` and
`directionalLights[0].direction` are in **view space**; `vViewPosition` is `-mvPosition.xyz`, so
`normalize(vViewPosition)` points at the camera; `viewMatrix` is available in fragment shaders of built-in
materials. `sunVis` is our engine's exposed sun shadow term. [V for our code, U for the three.js conventions:
long-standing behaviour, not re-read this session]

### B1. Hard / soft band ramp (the core)

- **What:** replace Lambert's smooth falloff with a thresholded one.
- **When:** always; this is the cel look.
- **Parameters:** threshold (N.L 0-0.4), softness (0 = 1 px AA only; 0.05-0.25 = painted soft edge), shade
  multiplier (0.5-0.7).
- **Sketch:**

```glsl
float ndl  = dot(normalize(normal), directionalLights[0].direction);
float x    = uHalfLambert > 0.5 ? ndl * 0.5 + 0.5 : max(ndl, 0.0);
float aa   = fwidth(x) * 0.75;                                   // ~1.5 px edge at any scale
float form = smoothstep(uRampLo - aa, uRampHi + aa, x);          // uRampLo == uRampHi -> hard cel edge
```

- **Pitfalls:** `fwidth` on a flat-shaded face is 0 (constant normal), so flat faces flip band all at once,
  which is what you want. On low-poly smooth meshes the band edge follows the vertex-normal interpolation and
  zig-zags along triangles: fix with more segments, edited normals (B13) or a perturbed normal (B16).

### B2. Ramp / LUT texture (1D warp)

- **What:** look the band up in a 1D texture: `colour = ramp(halfLambert)`. TF2's warp texture, three.js
  `gradientMap`, Honkai's "multi-channel 2D ramp" (separate diffuse and specular ramps, 1-3 stacked layers).
  [V, V, V-slides]
- **When:** you want an art-directed terminator colour (the reddish or saturated band), per-setup shadow
  palettes, or more than two bands without more uniforms.
- **Parameters:** texture width 64-256; row count if 2D (row = material class or time of day).
- **three.js facts [V]:** `MeshToonMaterial.gradientMap` is sampled at `u = N.L * 0.5 + 0.5`, only the red
  channel is used (so it is a brightness ramp, not a colour ramp), and the texture must use `NearestFilter` for
  hard steps. With no map the fallback is `mix(0.7, 1.0, smoothstep(0.7 - fw, 0.7 + fw, u))`.
- **Sketch (colour ramp, built on the CPU so two setups can be lerped texel by texel):**

```ts
function rampTex(stops: [number, string][], w = 256) {            // [[0,"#5c5578"],[0.46,"#6a4a70"],[0.5,"#ffe0cf"],[1,"#fff"]]
  const d = new Uint8Array(w * 4), c = new THREE.Color(), c2 = new THREE.Color();
  for (let i = 0; i < w; i++) { const t = i / (w - 1); let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, a] = stops[k], [t1, b] = stops[k + 1]; c.set(a).lerp(c2.set(b), THREE.MathUtils.clamp((t - t0) / (t1 - t0), 0, 1));
    d.set([c.r * 255, c.g * 255, c.b * 255, 255], i * 4); }   // Color is linear-sRGB internally: this stores LINEAR values
  const t = new THREE.DataTexture(d, w, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.ClampToEdgeWrapping; t.needsUpdate = true; return t;   // leave colorSpace = NoColorSpace (data is linear)
}
```

```glsl
vec3 w = texture2D(uRamp, vec2(clamp(x, 0.004, 0.996), 0.5)).rgb * 2.0;   // x2: TF2 overbright convention
vec3 col = albedo * w;                                                     // ramp carries shade tint AND terminator
```

- **Pitfalls:** 8-bit linear storage bands in dark shade colours: use `HalfFloatType` data or store sRGB and
  mark the texture `SRGBColorSpace`. A ramp that multiplies albedo cannot do "replacement" shadows (violet
  regardless of surface hue): keep our `uShadeReplace` path for that.

### B3. Shadow colour selection

Three models, all valid, pick per lighting setup:

| model | formula | look | source |
|---|---|---|---|
| multiply by cool tint | `shade = albedo * tint` (+ saturation boost) | keeps local hue; our "day" rule | ours; TF2 warp |
| per-material shadow texture | `shade = sssTex * ambientColour` | artist picks every shadow colour (skin goes reddish, cloth keeps hue) | Guilty Gear Xrd "SSS texture" [V-translation] |
| replacement / palette | `shade = mix(shade, replaceColour * f(luma), amt)` | sunset and night: one shadow hue for the whole frame | ours; Hi-Fi RUSH colours shadows from a 3D texture mapped to world position [V-notes] |

- **Hue-shift recipe [E, consistent with A1 rule 1]:** in HSV terms, shade = rotate hue 10-30 degrees toward
  the ambient/sky hue, saturation x1.1-1.3, value x0.5-0.7. Warm key -> cool shade; cool key (night) -> shade
  goes deeper blue-violet and lamps provide the warm accents.
- **Pitfall:** a saturation boost on an already saturated albedo clips a channel to 0 and the shade goes
  neon. Clamp, or boost in a perceptual space, or cap `uShadeSat` by `1 - saturation(albedo)`.

### B4. Terminator band (saturated / reddened edge)

- **What:** a narrow third band exactly at the light/shade boundary, more saturated and slightly warm.
- **When:** skin-like and organic forms, golden-hour setups. Skip on architecture.
- **Sketch:**

```glsl
float term = 4.0 * ramp * (1.0 - ramp);                     // 0 in full light and full shade, 1 mid-edge
col = mix(col, toonSat(col, uTermSat) * uTermTint, term * uTermAmt);   // uTermSat 0.3, tint (1.06,0.97,0.94), amt 0.5
```

- **Pitfall:** only visible if the ramp has width. With a hard edge it is a 1 px fringe; widen the ramp input
  for this term only (`smoothstep(lo - 0.06, hi + 0.06, x)`).

### B5. Stylised specular

- **What:** Blinn-Phong highlight, thresholded to a flat shape.
- **Parameters:** Roystan: exponent = glossiness^2 with glossiness 32, edge `smoothstep(0.005, 0.01, s)`,
  highlight multiplied by the lit band so it never appears in shade. [V] Heckel's Moebius pass: shininess 600,
  pure white where the term >= 0.25, and the highlight is written into the normal buffer so the outline pass
  draws a line around it. [V] Xrd stores highlight strength and "highlight propensity" per texel in the ILM
  texture (R and B channels) so highlights only appear where an artist allowed them. [V-translation]
- **Sketch:**

```glsl
vec3 V = normalize(vViewPosition), L = directionalLights[0].direction, N = normalize(normal);
float s = pow(max(dot(N, normalize(L + V)), 0.0) * ramp, uGloss * uGloss);      // uGloss 8 (broad) .. 32 (tight)
col += uSpecColor * smoothstep(0.005, 0.01, s) * uSpec;                          // uSpec 0 for matte materials
```

- **When for us:** glass, water, metal props, wet cobbles at night. Off by default: flat painted worlds have
  almost no specular.
- **Pitfall:** on flat-shaded low-poly props a highlight is a whole triangle flashing on for a few frames
  during a camera move. Restrict to smooth-shaded meshes.

### B6. Rim / Fresnel light

- **What:** brighten grazing-angle pixels. `rim = (1 - N.V)^p`.
- **Parameters and variants:**
  - TF2: Fresnel mask `(1 - N.V)^4`; the dedicated rim term is multiplied by `max(N.up, 0)` and by the ambient
    colour seen along the view vector, so it reads as sky light from above; plus an artist mask. [V]
  - Roystan: threshold the rim (`smoothstep(0.716 - 0.01, 0.716 + 0.01, 1 - N.V)`) and multiply by a power of
    N.L (threshold 0.1) so it only appears on the lit side. [V]
  - Breath of the Wild is described as two bands plus rim and specular, with the rim only on surfaces lit by the
    main light. [S]
  - Genshin-style "screen-space rim": compare depth at the pixel with depth offset a few pixels along the
    view-space normal; a big difference means silhouette. Gives a constant-width rim that ignores normals. [U]
- **Sketch (hard, lit-side, sky-weighted):**

```glsl
vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
float fr = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
float rim = smoothstep(uRimLo, uRimHi, fr) * (uRimKey * ramp + uRimSky * max(dot(N, upV), 0.0));
col += uRimColor * rim * aL;
```

- **Pitfall (Ameye) [V]:** Fresnel rims are uneven on anything that is not round: a cube face is all-rim or
  no-rim. That is why it is an accent, not an outline technique.

### B7. Matcap

- **What:** shade = texture lookup by view-space normal: `uv = N_view.xy * 0.5 + 0.5`. All lighting is painted
  into one sphere image; three.js has `MeshMatcapMaterial`. [U for exact formula; long-standing]
- **When:** hero props that must look hand-painted from every angle (a gem, a trophy, a character's 3D prop),
  or a cheap painted-metal look. Not for the set: a matcap ignores the scene's sun, so shadows and lighting
  changes (day -> golden -> night) do not affect it.
- **Pitfalls:** flat faces sample one texel; the light is glued to the camera, which shows on orbiting shots.
  Mitigate by blending: `col = mix(toonCol, toonCol * matcap * 2.0, 0.3)`.

### B8. Inverted hull outline

- **What:** draw the mesh a second time, back faces only, pushed out along normals, in ink colour.
- **Parameters [V-translation of the Xrd article]:** vertex colour A = thickness (0.5 standard), G = how much
  thickness follows camera distance, B = Z offset pushing the hull away so the line can be hidden in crevices
  (very large values bury it), R = shadow threshold bias for the shading pass. Inner lines are NOT hull lines:
  they are drawn in the texture using only axis-aligned strokes on straightened UVs so bilinear filtering keeps
  them sharp at any zoom, with width set by how much UV area a region gets.
- **Sketch (constant pixel width, three.js `ShaderMaterial`, `side: BackSide`):**

```glsl
attribute float inkW;                                  // per-vertex 0..1 (0.5 = standard), optional
uniform vec2 uRes; uniform float uPx;
void main(){
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec3 nc = mat3(projectionMatrix) * (normalMatrix * normal);
  p.xy += normalize(nc.xy + 1e-6) / uRes * p.w * uPx * 2.0 * (inkW * 2.0);
  gl_Position = p;
}
```

- **When for us:** hero props that need a guaranteed, art-directed silhouette line (thicker than world ink),
  or objects on the NOINK layer that still need a line. Not as the world solution: it gives no crease lines and
  doubles vertex work.
- **Pitfalls [V Ameye]:** hard-edged meshes split at corners (normals diverge) leaving gaps: needs smoothed
  normals stored in a spare attribute. Our kit is mostly `flatShading` boxes and cones, i.e. the worst case.

### B9. Screen-space edge detection

- **What:** post pass over depth / normal / ID buffers.
- **Operators:** Roberts cross (4 diagonal taps, `sqrt(d0^2 + d1^2)`) [V Roystan]; Sobel 3x3 (9 taps, smoother)
  [V Ameye, Heckel]. Heckel combines `outline = depthGradient * 25 + normalGradient` at a 3-texel step. [V]
- **Our variant (already better for planes):** second difference of 1/z along 4 directions, near side only.
- **Depth-aware thickness:** sample offset scaled by a width that is a function of view distance (ours:
  log-interpolated between `widthNear` at 6 m and `widthFar` at 90 m).
- **ID buffer (the missing source):** per-object or per-surface integer rendered to a buffer; edge wherever
  IDs differ. Shehata's v2 replaces normals with per-surface IDs computed per mesh at load, stored as a vertex
  attribute; IDs must not be interpolated across a triangle or the rasteriser corrupts them. [S]
- **Pitfalls:** every writer to the buffer gets outlined [V Ameye] (we solve this with the NOINK layer);
  vertex-displaced or alpha-tested geometry must be displaced / tested identically in the buffer pass or the
  lines detach from the picture [V Heckel: he had to give the displaced ground its own normal material].

### B10. Line anti-aliasing

- Options seen: FXAA after the outline composite (Shehata's repo) [V README]; analytical coverage from a
  distance (`saturate(width - dist + 1)`, Golus) [V gist]; smoothstep + alpha blend on SDF edges (Hi-Fi RUSH)
  [V-notes]; MSAA on the silhouette buffer then sub-pixel edge estimate `offset = dir * (1 - coverage)`
  (Golus init pass) [V gist].
- **For us [E]:** our mask already uses analytical coverage (`clamp(w + 0.5 - d)`) plus a 3x3 tent filter, and
  blends in display gamma. The remaining aliasing source is that the edge *position* comes from a non-MSAA
  nearest-filtered depth buffer, so a near-horizontal edge still steps by whole pixels. Fix by rendering the
  world G-buffer at 2x and computing the mask there (4x cost of a cheap pass), or by estimating the sub-pixel
  edge from the main MSAA colour target.

### B11. Jump flood (JFA) for wide outlines and glows

- **What:** seed pixels store their own position; each pass with step 2^i propagates the nearest seed; result
  is a distance field in pixels. [V gist]
- **Numbers:** passes = ceil(log2(widthPx + 1)) (the gist does one fewer loop iteration and splits each into a
  horizontal and a vertical 3-tap pass); buffers RG16 SNorm (RG32F on some mobile GPUs); outline alpha =
  `saturate(width - dist + 1)`; mesh render cost under 0.1 ms for a 10k-vertex character.
- **When for us:** only for effects beyond about 16 px: selection halos, thumbnail "sticker" outlines around a
  character card (card alpha is a perfect seed), glow rings. World ink at 3-4 px does not need it.
- **Pitfall:** JFA is approximate (rare wrong-seed pixels); invisible at outline scale.

### B12. Stepped shadow maps and shadow terminator

- **What:** threshold the PCF shadow term so the cast-shadow edge is as crisp as the form-shadow edge, but
  still anti-aliased.
- **Sketch:**

```glsl
float cast = smoothstep(0.5 - uCastSoft, 0.5 + uCastSoft, sunVis);   // uCastSoft 0.06 (crisp) .. 0.25 (painted)
float ramp = form * cast;
```

- **Numbers:** Hi-Fi RUSH uses 4x4 PCF on pre-baked static shadow maps and separates player/boss shadows from
  environment cascades with shadow-only lights. [V-notes] Honkai 3rd uses PCSS. [V-slides]
- **Pitfalls [E]:** thresholding a PCF term at 0.5 keeps the edge where the unfiltered edge was, but turns PCF
  noise/banding into a wobbly line if the shadow map is too coarse: PCF radius must cover >= 2 shadow texels
  and the smoothstep must be narrower than the PCF ramp. A shadow frustum that follows the camera makes the
  edge crawl; snap the shadow camera to texel increments or keep it fixed per shot (ours is fixed per scene).

### B13. Normal editing / proxy normals

- **What:** shade with normals that are not the geometric normals: hand-edited (Xrd) [S], transferred from a
  sphere or simple proxy (Ghibli-style trees: foliage cards take normals from an enclosing sphere so a whole
  crown shades as one ball) [S], or replaced by a painted threshold map (B14).
- **Sketch (spherical normals for a tree crown, vertex shader, object space):**

```glsl
vec3 sphN = normalize(position - uCrownCenter);
objectNormal = normalize(mix(objectNormal, sphN, uSphNormal));   // insert after #include <beginnormal_vertex>; 0.7-1.0
```

- **When for us:** tree crowns, bushes, clouds, rocks: anything built from several intersecting primitives
  that should read as one painted mass. Note `flatShading: true` discards vertex normals in the fragment
  shader (derivative normals), so this needs smooth shading on those meshes.

### B14. SDF face-shadow threshold map (Genshin, Hi-Fi RUSH)

- **What:** a greyscale texture where each texel stores the light angle at which it flips to shadow, built by
  painting about 9 binary masks for key light angles, converting each to an SDF and blending [S]. Lookup [V,
  community Unity shader]: `lit = step((1 - F.L) / 2, map)` where F is the head's forward direction projected
  on the ground plane and L the light direction; sample the mirrored texture when the light is on the other
  side (sign of R.L).
- **Transferable idea for flat cards:** a card can have the same thing: a second texture (or the alpha of an
  extra canvas layer) drawn by the character generator that stores "side-ness" per pixel, so the shade side of
  a face/torso is a designed shape rather than a UV-x gradient. See D, upgrade 2.

### B15. Ambient occlusion in toon looks

- **Evidence:** Honkai 3rd: "anime-style AO" based on HBAO with a toggleable colour shift (AO is tinted, not
  black). [V-slides] Hi-Fi RUSH's comic shader explicitly removes "dirty" GI and SSAO gradation. [V-notes] Xrd
  uses artist-painted per-vertex occlusion that biases the shadow threshold rather than darkening. [S/V]
- **Rules [E]:** AO in a cel image should (1) push pixels over the shade threshold or multiply by the shade
  *tint*, never by grey; (2) be posterised to one or two steps or kept under about 20 % strength; (3) be wide
  and low-frequency (contact grounding under eaves, at wall/ground joins), never fine crevice noise.
- **Sketch (AO as threshold bias, the Xrd way):**

```glsl
float x = max(ndl, 0.0) * sunVis - (1.0 - ao) * uAoBias;      // uAoBias 0.3: occluded areas fall into shade sooner
```

### B16. Painterly normal perturbation

- **What:** before the ramp, bend the normal with a low-frequency noise or a brush-stroke normal texture so
  the band edge becomes a dabbed, irregular line instead of a perfect curve. Commercial "painterly shader"
  packs for C4D/Houdini/Blender are built on this (stylised normals driving colour). [S]
- **Sketch (world-anchored, no texture):**

```glsl
vec3 q = vToonWPos * uBrushScale;                                   // 1.5-4.0 per metre
vec3 jitter = vec3(toonNoise(q), toonNoise(q + 31.7), toonNoise(q + 77.1)) - 0.5;
vec3 Np = normalize(N + mat3(viewMatrix) * jitter * uBrushAmt);     // uBrushAmt 0.15-0.5
```

- **Pitfalls:** noise must be world/object anchored (A3). On flat-shaded faces it makes each face break into
  blotches: use only on smooth organic meshes or keep `uBrushAmt` <= 0.15.

### B17. Triplanar hand-painted noise / colour drift

- **What:** project a tiling brush texture (or procedural noise) along the three world axes and blend by
  `abs(normal)^k`; multiply albedo by `1 +/- 4-8 %`. Removes the "vector flat" look without UVs.
- **Parameters:** blend sharpness k = 4-8; two scales (about 8 m and about 0.8 m); amplitude 3-8 %.
- **Ours:** single-octave world value noise at scale 0.12 (about 8 m features), amplitude 5-6 %.

### B18. Gradient maps and object-space vertical gradients

- **Object-space vertical gradient:** multiply albedo by a ramp over the object's height: base slightly darker
  and cooler, top slightly lighter and warmer (10-20 %). It fakes ground occlusion and sky light, grounds
  objects, and is fully stable. Standard in low-poly stylised work. [E]

```glsl
float h = clamp((vToonWPos.y - uBaseY) / uHeight, 0.0, 1.0);
albedo *= mix(uGradBottom, uGradTop, smoothstep(0.0, 1.0, h));       // e.g. (0.86,0.84,0.92) -> (1.04,1.03,1.0)
```

- **Gradient map (post):** remap luminance through a colour ramp. We already have a stronger tool (7-knot
  curve + zone tints); a gradient map is only worth adding as a duotone/poster "look".

### B19. Kuwahara / oil-paint filter

- **What:** for each pixel, compute mean and variance in several sectors around it and output the mean of the
  lowest-variance sector: flattens texture, keeps edges. [V Heckel]
- **Numbers [V]:** basic = 4 square sectors; generalised (Papari) = 8 circular sectors; Gaussian weights with
  sigma = radius / 3; cheaper polynomial weight `max(0, (x + 0.1) - 0.5 * y^2)^2` (Kang et al.); anisotropic
  version = 3 passes (Sobel structure tensor -> oriented elliptical Kuwahara -> tone map / finish). Variance is
  reduced to one number with luma weights (0.299, 0.587, 0.114).
- **Sketch (basic 4-sector, radius R):**

```glsl
vec3 m[4]; vec3 s[4]; for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); }
for (int j = -R; j <= R; j++) for (int i = -R; i <= R; i++) {
  vec3 c = texture2D(tColor, vUv + vec2(i, j) * texel).rgb;
  if (i <= 0 && j <= 0) { m[0] += c; s[0] += c * c; } if (i >= 0 && j <= 0) { m[1] += c; s[1] += c * c; }
  if (i <= 0 && j >= 0) { m[2] += c; s[2] += c * c; } if (i >= 0 && j >= 0) { m[3] += c; s[3] += c * c; } }
float n = float((R + 1) * (R + 1)), best = 1e9; vec3 outC = vec3(0.0);
for (int k = 0; k < 4; k++) { vec3 mu = m[k] / n; float v = dot(abs(s[k] / n - mu * mu), vec3(0.299, 0.587, 0.114));
  if (v < best) { best = v; outC = mu; } }
```

- **When for us:** an optional "painted backdrop" look on the WORLD only (before ink, masked off cards).
  Already-flat cel colour gains little from it; it pays off on photo-textured Poly Haven models.
- **Pitfalls:** it is a screen-space filter: brush "cells" are re-decided every frame, so slow camera pushes
  make the shapes crawl. Tolerable at small radius (3-5 px at 1440), bad at large radius. Cost at radius 5:
  121 taps/pixel.

### B20. Halftone and hatching

- **Evidence:** Spider-Verse: smooth gradients are replaced by dot patterns, shadows by hatch lines that go
  thin to thick with the lighting; dot size, angle and spacing are per-shot controls; built almost entirely in
  comp (Nuke "Hatcher"/"Thresher" tools). [V] Hi-Fi RUSH: halftone dots in lit areas, hatching in shadow,
  mapped by world normal + world UV; dot size follows luminance; edges anti-aliased with smoothstep. [V-notes]
  Heckel (three.js): luma thresholds 0.35 / 0.55 / 0.80 choose horizontal, vertical, diagonal 1 px lines every
  8 px; the same wobble is applied to hatch coordinates as to the outlines. [V] Real-time hatching research
  (Praun 2001) keeps strokes on the surface with mip-mapped "tonal art maps" whose strokes are nested across
  tones and scales. [S]
- **Sketch (world-anchored halftone that roughly keeps its screen size):**

```glsl
vec3 an = abs(Nw);                                                     // world normal, world pos Pw
vec2 huv = an.y > max(an.x, an.z) ? Pw.xz : (an.x > an.z ? Pw.zy : Pw.xy);
float lvl = exp2(floor(log2(length(fwidth(huv)) * uCellPx)));          // snap cell size to powers of two; uCellPx 7-10
vec2 g = fract(mat2(0.7071, -0.7071, 0.7071, 0.7071) * huv / lvl) - 0.5;   // 45 degree screen
float r = 0.5 * sqrt(clamp(1.0 - tone, 0.0, 1.0));                     // darker tone -> bigger dot
float d = length(g), aa = fwidth(d);
float dotMask = 1.0 - smoothstep(r - aa, r + aa, d);
```

- **Pitfalls:** the power-of-two snap pops when a surface crosses a level (cross-fade two levels, or use
  surface-stable fractal dithering, which solves exactly this with a 3D pattern texture [V]); `fwidth` of a
  `fract` seam makes a 1 px line (compute derivatives before `fract`); halftone fights bloom (Hi-Fi RUSH
  notes) and H.264 (fine dots cost bitrate: keep cells >= 7 px at output resolution).

### B21. Misregistration ("misprint") instead of blur

- **What:** Spider-Verse replaces lens defocus with offset colour passes, like an off-register print; the
  ChromaShifter tool was built for this colour-offset depth of field and, fed motion vectors instead of depth,
  produced motion trails. [V Foundry, fxguide, fxphd]
- **Sketch (driven by our signed CoC):**

```glsl
float c = cocS(zc) / maxCoC;                                  // -1..1, 0 in focus
vec2 off = uMisDir * c * uMis * texel;                        // uMis 3-8 u, uMisDir e.g. (1.0, 0.35)
col.r = textureLod(tColor, vUv + off, 0.0).r; col.b = textureLod(tColor, vUv - off, 0.0).b;
```

- **When:** a "comic print" look, or mixed at 20-30 % with a reduced blur to keep ink lines legible in the
  background (blur erases lines; offset keeps them as doubled coloured lines).

### B22. Light wrap (post)

- **What:** let the blurred background bleed a few pixels into the foreground element's edge. Recipe from
  compositing packages: blur the background, mask it by a blurred inverted foreground matte restricted to the
  inside of the foreground, add or screen it over the foreground; width follows the blur radius. [S]
- **Sketch:** see D, upgrade 2e.

### B23. Sprite rim from the scene light without normals

- **What:** sample the sprite's own alpha at a UV offset toward the light; where the offset sample is
  transparent, the pixel is on the light-facing silhouette. [V, Godot community shader]
- **Sketch:** see D, upgrade 2c.

### B24. Stylised motion: smears, on-twos, no blur

- Spider-Verse: no motion blur, smears and stretched geometry, streaked backgrounds on fast pans, 2D
  hand-animated FX libraries instead of simulation. [V] Arcane is described as painted lighting inside the
  textures plus hand-drawn 2D FX on cards. [S, weak sources]
- **For us:** our reference channel uses heavy camera motion blur on travels (measured), so keep it for the
  camera; but character pose changes on cards should stay unblurred and can use "on twos" holds
  (the crowd already poses on twos).

---

## C. What our engine already does vs gaps

Read: `engine/src/lib/three/shaders.ts`, `engine/src/lib/three/post.ts`, `references/tools/engine.md` (looks/post,
"Added in 1.1"), plus `cast.ts`, `world.ts`, `Stage3D.tsx`, `look.ts` and the two projects for call order.

### C1. Already in place (and done well)

| area | what the code does | note |
|---|---|---|
| cel ramp | `key = sunVis * max(N.L, 0)` on directional light 0, `smoothstep(rampLo, rampHi, key)`; day 0.18-0.42 | soft painted edge, measured per setup |
| shadow colour | `shade = sat(albedo * shadeMul, shadeSat)`, then `mix(.., shadeReplace * (0.6 + 0.8 luma), amt)` | both "multiply by cool tint" and "palette replacement" models, lerpable (`applyToonSetup`) |
| ambient | `reflectedLight.indirectDiffuse * uAmbient` (hemisphere + ambient) | keeps sky/ground colour in shade |
| rim | `(1 - abs(N.V))^3 * uRim * ramp`, scaled by albedo luma | lit-side only, like BotW/Roystan |
| colour drift | world-space value noise, scale 0.12, +/- 5-6 % | world-anchored: no swimming |
| ink | separate world-only normal+depth pass (NOINK layer excluded), second difference of 1/z in 4 directions (0 on planes, near side only), normal creases with a depth-similarity guard, width log-interpolated 6 m -> 90 m, distance fade, analytical coverage AA + 3x3 tent, gamma-space blend, suppressed where a card is in front | more robust than Roberts/Sobel-on-depth tutorials; no grazing-angle artefacts by construction |
| order | ink before DOF, so lines blur with the background | matches the reference |
| cards | scene tint (55 %, luma-normalised), 0.86 floor in cast shadow, side gradient away from the sun, contact blob offset from the sun, hidden sun-facing shadow caster, fog (Lambert fog chunk still runs), DOF and grade shared with the world | most of A4 |
| resolution independence | every length in u (1 px at 1080 short side) | 2K/4K match |
| determinism | Vogel-disc DOF, hash grain keyed by frame, no temporal accumulation | safe for per-frame rendering |

### C2. Gaps and defects found by reading the code

Numbered for reference from section D. "Defect" = likely wrong behaviour; "gap" = missing capability. None of
these were confirmed by rendering; each needs one test frame.

1. **Defect (likely): wind sway is dropped on toonified materials.** `windSway()` wraps `onBeforeCompile`, but
   both projects call `toonifyScene()` afterwards (manhole: sway at line 227, toonify at 279; elevator: 344 then
   418), and `toonifyMaterial()` assigns `m.onBeforeCompile = ...` without chaining the previous hook and
   replaces `customProgramCacheKey` with `"toon-v2"`. The tree materials are Lambert, so they are toonified and
   the wind patch never compiles. Separately, `windSway`'s
   `m.customProgramCacheKey = () => \`${m.customProgramCacheKey?.()}+wind\`` refers to itself and would recurse
   forever if it were ever the last one assigned (i.e. if the order were toonify -> sway).
2. **Defect (latent, appears once 1 is fixed): the ink pass ignores vertex displacement and alpha test.** The
   normal/depth pass uses one `overrideMaterial` (`NORMAL_VERT`) with no wind code and no `alphaTest`, so
   swaying foliage would get lines at its rest position, and alpha-tested world quads (`world.ts` lines 486 and
   502) are outlined as full rectangles in the ink buffers. Same class of bug Heckel hit with displaced ground.
3. **Gap: form shadow and cast shadow share one threshold.** The ramp is applied to the product
   `sunVis * N.L`. On a surface with N.L = 1 the cast-shadow edge sits at sunVis 0.18-0.42; at N.L = 0.5 it sits
   at 0.36-0.84. So the cast-shadow edge is biased toward the lit side, and its softness and position change
   with surface orientation (ground vs walls).
4. **Gap: only the sun is toon-lit; other direct lights are discarded.** `outgoingLight` is built from the
   ramp, `indirectDiffuse` and emissive; `reflectedLight.directDiffuse` (which holds point/spot lights and
   directional lights 1..n) is never used. Lamp posts at night light nothing unless a surface is emissive. The
   style profile asks for "night is blue-violet ambient with warm lamps".
5. **Gap: no band-edge anti-aliasing term.** The ramp is a fixed-width smoothstep in N.L units (0.22-0.24
   wide). It cannot be made crisp without aliasing because there is no `fwidth` term, so the look is locked to
   "soft cel".
6. **Gap: no terminator band, no ramp texture.** Two colours and a blend; no saturated/warm edge, no way to
   author a 3-band palette per setup.
7. **Gap: no specular at all** (water has its own glints). Glass, metal and wet surfaces read the same as
   plaster.
8. **Gap: rim has one mode.** No sky-weighted rim (`N.up`), no hard-edged option, exponent 3 fixed.
9. **Gap: no occlusion term.** Nothing darkens wall/ground joins, under eaves, between crowded props; the
   only grounding is cast shadows and the card blob.
10. **Gap: ink has two sources (depth, normal) and one colour.** No object-ID edges (two different props at
    the same depth and facing are not separated; an alpha-cut sign on a wall has no line), no light-dependent
    line weight, no coloured ink (line colour derived from the local colour), no wobble/boil option.
11. **Gap: ink edge position is pixel-quantised** (non-MSAA nearest G-buffer). Coverage AA and the tent blur
    hide most of it; slow push-ins on near-horizontal edges can still show stepping.
12. **Gap: card shadow state is a grey scalar.** In cast shadow the card is multiplied by 0.86 (neutral). The
    world's shade is violet-tinted and saturated. Cards in shadow therefore look slightly "pasted".
13. **Gap: card has no key-light accent on its silhouette** and no bounce from the ground colour; the side
    gradient is a function of UV x only (a straight vertical band regardless of the drawing).
14. **Gap: contact shadow is a single black-ish ellipse** (MeshBasic, not fogged by distance tint, not tinted
    like scene shade, does not react to feet leaving the ground).
15. **Gap: no light wrap / edge integration in post.** Cards have alpha-tested hard edges against bright sky
    or sunset; nothing softens or tints the edge.
16. **Gap: no texture-stylisation options** beyond drift: no vertical gradient, no painterly normals, no
    halftone/hatching, no Kuwahara, no misregistration DOF.
17. **Minor:** drift is applied to `albedo` for the ramp but `indirectDiffuse` was computed from the undrifted
    `diffuseColor`, so the ambient part does not drift (harmless, slightly reduces drift contrast in shade).

---

## D. Prioritised upgrades for our engine

Ordered by (visual payoff for the cards-in-inked-world style) / (cost + risk). Cost is implementation effort
plus render-time impact at 1440x2560; all render-time figures are tap-count estimates [E], not measurements.

### 1. Make shader patches composable; give the ink pass displacement and alpha parity

- **Fixes:** C2 defects 1 and 2. Prerequisite for every other material upgrade (more patches will stack).
- **Visual effect:** foliage actually sways; lines stay glued to swaying foliage; alpha-cut world props get
  their true outline instead of a rectangle.
- **Sketch (`shaders.ts`):** one helper that all patches use.

```ts
export function addPatch(m: THREE.Material, key: string, fn: (sh: THREE.WebGLProgramParametersWithUniforms) => void) {
  const list: [string, typeof fn][] = (m.userData.patches ??= []);
  if (list.some(([k]) => k === key)) return;
  list.push([key, fn]);
  m.onBeforeCompile = (sh) => { for (const [, f] of m.userData.patches) f(sh); };
  m.customProgramCacheKey = () => m.userData.patches.map(([k]: [string]) => k).join("+");
  m.needsUpdate = true;
}
```

  Order matters only where two patches replace the same chunk: wind replaces `<begin_vertex>`, toon replaces
  `<worldpos_vertex>`, `<lights_fragment_begin>`, `<opaque_fragment>`: no overlap.
- **Ink parity (`post.ts`):** keep the single override material but feed it per-object state through
  `Object3D.onBeforeRender`. In the installed r187 `WebGLRenderer.renderObjects` swaps in the override
  material first and then calls `object.onBeforeRender(renderer, scene, camera, geometry, material, group)`
  with it [V, source lines 2152-2171], so the hook does fire in the ink pass. Add
  `uWindAmp/uWindTime/uWindMinY` (0 for non-wind objects) and `map + uAlphaTest` uniforms to
  `NORMAL_VERT/FRAG`, and copy the same displacement block into `NORMAL_VERT`. Because one ShaderMaterial is
  shared by every object, set `material.uniformsNeedUpdate = true` in the hook, or three will not re-upload
  the changed uniforms between objects [U: standard three.js behaviour, test it]. Fallback: swap materials
  in a traverse before the pass (cache one normal-material variant per wind/alpha combination). Also seen in
  the same source: materials have an `allowOverride` flag; a material with `allowOverride = false` keeps its
  own shader during an override pass.
- **Cost:** small (about 60 lines). Render cost: none. **Risk:** low; a shader-compile error shows on frame 0.
  Verify with one still of a tree at `uWindTime` 0 and 1.

### 2. Card integration pack (the highest-value look upgrade)

Five small changes in `cardShade` / `cast.ts` / `post.ts`. Each is independent; ship a-d first.

- **a. Shadow state uses the scene's shade tint (gap 12).** Share `uShadeMul` with the card uniforms.

```glsl
vec3 sh = mix(vec3(1.0), uShadeMul, uCardShade);                 // uCardShade 0.30: day #8a8296 -> (0.86,0.85,0.88)
float cast = smoothstep(0.35, 0.65, sunVis);
vec3 cardCol = diffuseColor.rgb * tk * mix(sh, vec3(1.0), cast);
```

  Luminance floor stays about 0.86 (the measured value) but now leans violet in day and blue at night.
- **b. Ground bounce (gap 13).** `cardCol = mix(cardCol, cardCol * uGroundTint, (1.0 - smoothstep(0.0, 0.22, vMapUv.y)) * 0.25);`
  with `uGroundTint` set from the hemisphere ground colour of the lighting preset.
- **c. Key-light rim on the silhouette (gap 13, technique B23).**

```glsl
vec3 sv = directionalLights[0].direction;                                    // view space
vec2 dir = normalize(vec2(sv.x * sign(dFdx(vMapUv.x) + 1e-7), sv.y) + 1e-5); // toward the sun in card UV
float aOut = texture2D(map, vMapUv + dir * uRimW).a;                         // uRimW 0.008-0.015 (card UV)
float rimK = (1.0 - smoothstep(0.3, 0.7, aOut)) * cast * uCardRim;           // uCardRim: day 0.12, golden 0.35, night 0.25
cardCol = mix(cardCol, cardCol + uRimColor * 0.6, rimK);
```

  Pitfall: the card art has a plum outline at its edge, so the rim lands on the ink line and lightens it on
  the sun side. That is a legitimate drawn look (the line "burns out" toward the light) but must be judged on
  a model sheet; if it reads wrong, apply the rim only where the texel is not ink (luma test) or offset
  inward by the line width. Use `textureLod(map, uv, 1.0)` to keep the alpha edge smooth.
- **d. Contact shadow (gap 14).** Two layers: a tight core (0.25 x card width, alpha 0.45) and a wide soft
  ellipse (0.6 x width, alpha 0.18); colour = scene shade tint x ground albedo estimate rather than black
  (`MeshBasicMaterial.color` set from `uShadeMul` each frame, `fog: true`); scale the core by
  `1 / (1 + 3 * heightAboveGround)` and fade alpha the same way so jumps and hops read. Keep the existing
  offset away from the sun.
- **e. Light wrap in post (gap 15, technique B22).** The ink mask pass already computes "a card is in front
  here" (`zm < zc * 0.985 - 0.03`); write it to the mask target's G channel (also mark pixels where the world
  buffer is empty but the main depth is not). In `INK_COMP`:

```glsl
float cm  = texture2D(tMask, vUv).g;                              // 1 on cards
float cmB = blur9(tMask, vUv, 4.0 * uU).g;                        // blurred card mask
vec3  bgB = blur9(tColor, vUv, 6.0 * uU).rgb;                     // blurred frame (cheap: 9 taps on a half-res copy)
float wrap = cm * (1.0 - cmB) * uWrap;                            // only the inner edge of the card; uWrap 0.2-0.35
g = 1.0 - (1.0 - g) * (1.0 - pow(bgB, vec3(1.0 / 2.2)) * wrap);   // screen blend in display space
```

- **Visual effect:** cards stop looking pasted in shadow and at sunset; feet sit on the ground; a thin warm
  edge ties the card to the sun direction.
- **Cost:** a-d about 40 lines, 1 extra texture tap per card pixel. e: one half-res blur target + about 18
  taps. **Risk:** low for a, b, d; medium for c (interaction with the drawn outline) and e (halo if `uWrap`
  is too high against a dark background: scale wrap by background luma).

### 3. Split the ramp: form x cast, with fwidth AA and an optional terminator band

- **Fixes:** gaps 3, 5, 6. **File:** `TOON_FRAG_BODY` in `shaders.ts`; new uniforms `uCastSoft`, `uTermAmt`,
  `uTermSat`, `uTermTint` in `ToonSetup`.

```glsl
float ndl  = max(dot(normalize(normal), directionalLights[0].direction), 0.0);
float aa   = fwidth(ndl) * 0.75;
float form = smoothstep(uRampLo - aa, uRampHi + aa, ndl);
float cast = smoothstep(0.5 - uCastSoft, 0.5 + uCastSoft, sunVis);          // 0.12 day, 0.2 golden
float ramp = form * cast;
vec3 col = mix(shade, lit, ramp) + reflectedLight.indirectDiffuse * uAmbient;
float term = 4.0 * ramp * (1.0 - ramp);
col = mix(col, toonSat(col, uTermSat) * uTermTint, term * uTermAmt);        // amt 0 keeps today's look
```

- **Visual effect:** cast shadows get one consistent, designed edge on ground and walls; ramps can be made
  crisp (rampLo = rampHi) without aliasing; golden hour gains the warm saturated shadow edge that painted
  backgrounds have.
- **Cost:** about 15 lines, no extra taps. **Risk:** medium: this changes the measured look. Shadow area
  grows slightly on walls (edge moves back to sunVis 0.5). Re-fit `rampLo/Hi` against the reference stills and
  bump the cache key to `toon-v3`. With `PCFShadowMap`, radius 3 and a 4096 map the PCF ramp is a few texels
  wide; `uCastSoft` below about 0.08 will expose shadow-map stair-steps (B12).

### 4. Toon response to secondary lights (lamps, windows, fires)

- **Fixes:** gap 4. **File:** `TOON_FRAG_BODY` (it runs after `lights_fragment_end`, so
  `reflectedLight.directDiffuse` is complete).

```glsl
vec3 sunD  = directionalLights[0].color * (sunVis * ndl) * BRDF_Lambert(diffuseColor.rgb);
vec3 extra = max(reflectedLight.directDiffuse - sunD, vec3(0.0));            // point/spot/other directional lights
float e    = dot(extra, vec3(0.3333)) / max(aL * RECIPROCAL_PI, 1e-3);       // ~irradiance, albedo divided out
float band = 0.55 * smoothstep(uL2a - 0.02, uL2a + 0.02, e) + 0.45 * smoothstep(uL2b - 0.03, uL2b + 0.03, e);
vec3 hue   = extra / max(dot(extra, vec3(0.3333)), 1e-4);                    // light colour x albedo hue, normalised
col += albedo * hue * band * uL2Gain * aL;                                   // two flat pools of lamp light
```

  Start with `uL2a` 0.15, `uL2b` 0.6, `uL2Gain` 0.8 and tune on the night setup. [E: the subtraction assumes
  three's Lambert/Standard direct-diffuse form `N.L * colour * albedo / PI`; verify in the r187 chunks.]
- **Visual effect:** night scenes get stepped warm pools under lamp posts and from windows: the "warm lamps in
  blue-violet night" rule of the style profile, currently only approximated by emissive bulbs and bloom.
- **Cost:** about 15 lines; shader cost is the lights themselves (keep to <= 4 point lights, no point-light
  shadows). **Risk:** medium: the bands of two overlapping lamps add; clamp `band`. Light distance falloff
  decides pool radius, so lamp `distance`/`decay` become art parameters.

### 5. Ink v2: ID edges, light-aware weight, coloured ink

- **Fixes:** gap 10. **File:** `post.ts` (`NORMAL_FRAG`, `INK_MASK`, `INK_COMP`), `look.ts` (new `ink` fields).
- **a. Object-ID edges.** Write an ID into the alpha of the world buffer instead of constant 1:
  `gl_FragColor = vec4(n, (uInkId + 1.0) / 255.0)` with `uInkId` set per object in `onBeforeRender` from
  `userData.inkId` (auto-assign per top-level kit object; 0 = "merge with neighbours", so walls and floors
  that must not get seam lines share an ID). The buffer is half-float, so the value is exact; the existing
  `nc.a < 0.5` empty test becomes `nc.a <= 0.0`. In the mask loop add
  `eI = max(eI, (abs(a1 - a0) > 0.002 && abs(z1 - zc) < zc * 0.05 ? 1.0 : 0.0) * ch);`, restricted to the
  crease width so ID lines are thin.
- **b. Light-aware weight.** Pass the sun direction in view space; normals in the buffer are view-space:
  `w *= mix(1.2, 0.75, smoothstep(-0.2, 0.7, dot(n0, uSunV)));` gives thicker lines in shade, thinner toward
  the light (A2 rule 12). Silhouette vs crease weighting already exists (`creases` 0.75-0.8 => creases at about
  40 % of silhouette width).
- **c. Coloured ink.** In `INK_COMP`: `vec3 ink = mix(inkColor_g, g * g * 0.35, uInkTint);` (darkened,
  saturated local colour; `uInkTint` 0.25-0.4) so lines on foliage lean green-black and on brick lean
  maroon, which is how the reference's "near-black or plum" lines behave on coloured fields. [E]
- **d. Optional wobble (off by default).** Displace the mask lookup in `INK_COMP` by a low-frequency,
  world-anchored offset (reconstruct world position from depth; noise input = world position x 0.6, amplitude
  0.6-1.2 u), re-seeded every 3 frames for boil. Heckel's screen-space version uses frequency 0.08 per pixel;
  ours must be world-anchored because the camera never stops (A3).
- **Visual effect:** props separate cleanly from what they stand in front of even when depth and normal agree;
  line weight starts to look drawn rather than computed.
- **Cost:** about 50 lines; +0 passes; +2 alpha reads already fetched with the normals. **Risk:** medium: ID
  assignment policy is the hard part (too many IDs brings back wall/floor seam lines the reference does not
  have). Ship with IDs only on props and characters' held objects first.

### 6. Grounding without AO buffers: vertical gradient + threshold-bias occlusion

- **Fixes:** gaps 9, 16 (partly). **File:** `TOON_FRAG_BODY`; per-object `uBaseY/uHeight` via `onBeforeRender`
  or baked into a vertex attribute at kit-build time (`world.ts`).
- **Sketch:** B18 for the gradient; for occlusion, bake a 0..1 `ao` vertex attribute in the kit builders
  (1 everywhere, 0.4-0.7 on vertices under eaves, at wall bases, inside porches) and use it Xrd-style as a
  threshold bias: `ndl' = ndl - (1.0 - ao) * 0.3`, plus `albedo *= mix(uShadeMul * 1.2, vec3(1.0), ao)` at low
  strength.
- **Visual effect:** buildings and props sit on the ground; eaves and porches get a designed shade shape; no
  screen-space noise, fully stable.
- **Cost:** gradient 10 lines; baked AO needs touching each kit builder (house, lampPost, bench, fence...).
  Render cost none. **Risk:** low. Flat-shaded faces take per-face constant values only if the attribute is
  constant per face; otherwise it interpolates (fine, it is low frequency).
- **Why not SSAO first:** it adds gradients into flat fields (the thing Hi-Fi RUSH's comic shader removes) and
  screen-space AO under a card would need the card excluded. If wanted later: compute it from the existing
  world normal/depth targets at half res (12-16 taps, radius about 0.6 m), posterise to 2 steps, multiply by
  shade tint at <= 20 %, and apply before ink.

### 7. Stylised specular + rim modes

- **Fixes:** gaps 7, 8. **File:** `TOON_FRAG_BODY`; `uSpec`, `uGloss`, `uSpecColor` per material via
  `userData.toonSpec` (set as a per-material uniform object merged in `toonifyMaterial`, so matte stays 0).
- **Sketch:** B5 and B6. Defaults: glass `uSpec 1, uGloss 24`; metal `0.7, 14`; everything else 0. Rim: add
  `uRimSky` (0.1 day, 0.25 night with the sky colour) and switch the exponent to 4.
- **Visual effect:** windows, lamp glass, bottles, tools and water-adjacent props get one clean highlight
  shape; night scenes get a cool top rim that separates roofs from the sky.
- **Cost:** about 20 lines; no taps. **Risk:** low (off by default). Per-material uniforms mean those
  materials no longer share one uniform object: keep the shared set and add a small per-material set.

### 8. Soften the ink edge position (sub-pixel) for slow push-ins

- **Fixes:** gap 11. **File:** `post.ts` constructor + ink section.
- **Sketch:** render the world normal/depth target at 2x (2880x5120, still one cheap override pass) and run
  `INK_MASK` at 2x into a 2x mask, then let `INK_COMP`'s tent filter downsample (sample with linear filtering
  at the 4 sub-texel centres). All `u`-based widths double in that pass.
- **Visual effect:** near-horizontal and near-vertical lines stop stepping during the constant exponential
  push-in; lines look closer to vector strokes.
- **Cost:** the ink passes get 4x pixels (mask shader is the heaviest loop in the pipeline: at w about 4 px it
  is about 40 depth + 16 normal taps per pixel, so this roughly adds one more full-res DOF pass worth of
  work). VRAM: +2 half-float 2x targets (about 235 MB at 2K-vertical; too much at 4K: gate on resolution).
  **Risk:** medium (memory on concurrency-4 renders). Measure with `tools/bench.mjs` before making it default.

### 9. Painterly band edges for organic shapes (spherical + perturbed normals)

- **Fixes:** gap 16 (partly). **Files:** `world.ts` (`tree`, `rock`, `hill`, bushes: smooth-shade the crown
  meshes and tag `userData.toonOrganic = { center, sph: 0.8, brush: 0.3 }`), `shaders.ts` (vertex patch from
  B13, fragment patch from B16).
- **Visual effect:** tree crowns shade as one painted mass with a dabbed, irregular light/shade boundary
  instead of faceted cones; the world reads less "low-poly", more "background painting".
- **Cost:** about 40 lines + geometry changes. 3 extra noise evaluations per pixel on tagged meshes only.
  **Risk:** medium: changing crowns from flat to smooth shading changes the crease lines the ink pass finds
  (fewer facet lines on trees, which is probably also closer to the reference). Compare on stills.

### 10. Misregistration DOF option (print-style defocus)

- **Fixes:** gap 16 (partly). **File:** `DOF` shader in `post.ts`, new `look.dof.misprint` (0..1) and
  `misprintDir`.
- **Sketch:** B21, applied after the gather; blend `col = mix(col, misCol, misprint)` and scale the blur
  radius by `1 - 0.6 * misprint`.
- **Visual effect:** background ink lines stay readable as doubled red/blue lines instead of dissolving;
  a distinct comic-print signature for a "Spider-Verse-ish" preset.
- **Cost:** 10 lines, 2 taps. **Risk:** low; stylistically it departs from the measured reference, so it is a
  new look preset, not a default.

### 11. World-anchored halftone / hatch in shade ("comic" preset)

- **Fixes:** gap 16 (partly). **File:** `TOON_FRAG_BODY` (needs world normal: `inverseTransformDirection(normal, viewMatrix)`).
- **Sketch:** B20. Apply only in shade: `shade = mix(shade, shade * uHatchTint, dotMask * (1.0 - ramp) * uHatch)`.
  Cells >= 7 output pixels; cross-fade two power-of-two levels to hide popping.
- **Visual effect:** a comic-book variant of the world for specific series; shadows gain print texture that
  sticks to surfaces during glides.
- **Cost:** about 35 lines, no taps. **Risk:** medium-high: level pops, moire on distant ground at grazing
  angles (fade the pattern out beyond `dFar`), bitrate (fine dots cost bits; test at CRF 14).

### 12. Kuwahara "painted backdrop" pass for photo-textured assets

- **Fixes:** gap 16 (partly). **File:** new pass in `post.ts` between scene and INK, masked to non-card
  pixels (card mask from upgrade 2e), `look.paint = { radius, amount }`.
- **Sketch:** B19, radius 3-4 u, generalised 8-sector version if the 4-sector boxiness shows.
- **Visual effect:** Poly Haven models and noisy textures collapse into flat painted patches that match the
  kit's flat colour fields; ink is drawn on top afterwards and stays crisp.
- **Cost:** 49-121 taps per pixel (radius 3-5) at full res: comparable to the DOF pass. **Risk:** medium:
  patch shapes crawl under slow camera moves (B19); keep radius small, and prefer fixing textures at load
  time (posterise/blur the texture once on the CPU: stable, free per frame) where possible.

### Not recommended now

- **Moving to TSL / node materials.** `MeshToonNodeMaterial` and `toonOutlinePass` exist in the installed
  r187 (the outline pass is an inverted hull, back-side, default thickness 0.003, and only applies to
  MeshToon materials) [V], but they target `WebGPURenderer`. The installed `WebGLRenderer` does contain a
  `_nodesHandler` hook for node materials [V], whose completeness I did not verify, and headless
  Chromium/ANGLE WebGPU availability on the render machine is unknown [U]. Our whole post pipeline is raw
  GLSL `ShaderMaterial`s. The `onBeforeCompile` route is the low-risk path on r187; revisit when a patch
  breaks on a three.js upgrade (the `sunVisChunk()` guard already throws loudly when the chunk text changes).
- **Jump flood ink.** Not needed below about 16 px line width.
- **Inverted hull for the world.** Flat-shaded kit geometry is the worst case for it (B8).

---

## Appendix 1 (to B). three.js specifics (r187) collected in one place

- **`onBeforeCompile` patching.** The hook receives shader source with `#include <chunk>` lines still
  unresolved, so chunk replacement is string replacement on include lines (what our code does). Every patched
  material needs a `customProgramCacheKey` that changes whenever the patch set changes, or three reuses a
  cached program compiled without the patch. Multiple patches must be chained explicitly (upgrade 1). three
  unrolls light loops and only substitutes `[ i ]`, which is why `sunVisChunk()` uses a first-light flag. [V,
  our code and comments; U for cache behaviour: long-standing]
- **`MeshToonMaterial`.** Diffuse = `gradientMap(N.L * 0.5 + 0.5).r * lightColour * albedo / PI` per light;
  no specular; indirect diffuse unchanged; default two-tone 0.7 / 1.0 with `fwidth` AA; `gradientMap` needs
  `NearestFilter` and no colour space. [V] It bands every light separately and cannot tint shade, so our
  Lambert patch remains the better base.
- **Shadows.** `PCFSoftShadowMap` is deprecated since r186; `PCFShadowMap` + `light.shadow.radius` is the soft
  path; `VSMShadowMap` makes all receivers also cast. [V, constants.js] Ours: PCF, radius 3, 4096 map, bias
  -0.0004, normalBias 0.03.
- **Render targets.** `WebGLRenderTarget` supports `count > 1` (MRT) and `samples` (MSAA) [V]. A future
  single-pass G-buffer (colour + normal/ID from the main pass via `layout(location = 1)`) would remove the
  second geometry pass, but every material (including cards, sky, FX) would need to write the second output
  and NOINK would become "write zero"; with MSAA resolve of normals/IDs being wrong at edges. Not worth it at
  our scene sizes. [E]
- **Stock passes available in the install [V]:** `OutlinePass` (selected-object glow outline), `HalftonePass`
  (screen-space CMYK-style dots: swims under camera motion), `SobelOperatorNode`, `OutlineEffect` (inverted
  hull for `WebGLRenderer`, default thickness 0.003, per-material `userData.outlineParameters`), `GTAOPass`,
  `SSAOPass`, `RenderPixelatedPass`. None anchor patterns to the world.
- **Performance model for our offline render [E].** Fill-rate dominated: 1440x2560 = 3.7 M pixels. Per pixel
  today: DOF 64 + up to 32 taps, ink mask about 56 taps at 4 px width (worst case 128 depth + 128 normal at
  16 px), motion blur 14, bloom chain small. Any new full-screen pass under about 30 taps is in the noise;
  material-shader additions without texture taps are free. The measured bottleneck is GPU contention between
  concurrent Chromium tabs (engine.md 1.2), so VRAM-heavy upgrades (8) need a benchmark.

---

## Appendix 2 (to B). How the named productions do it: transferable techniques

| production | what they do | evidence | transfer to our engine |
|---|---|---|---|
| Guilty Gear Xrd (Arc System Works, UE3) | Hard two-tone threshold; no normal maps, data lives in vertex normals/colours/UVs; vertex colour R = shadow threshold bias (painted occlusion), G = outline distance scaling, B = outline Z offset, A = outline width (0.5 standard); "SSS" texture = per-texel shadow colour x ambient; ILM texture = highlight strength/propensity + inner lines; inner lines drawn axis-aligned on straightened UVs; hull outlines in 3 passes | [V] machine translation of Nishikawa's 4Gamer article; [S] for edited normals, limited animation; polygon/bone counts not found [U] | AO as threshold bias (D6); per-vertex/per-object ink width (D5); author shadow colour per material class, not one global multiply |
| Spider-Verse (Imageworks) | Look built in comp: halftone for gradients/light, hatching for shadow with width driven by lighting, lines as 3D geometry, misregistered colour passes instead of defocus, no motion blur, on twos (12 img/s), patterns tracked to characters in fast motion, 25+ comp tools | [V] Foundry, fxphd, fxguide | D10 misprint DOF, D11 anchored halftone, on-twos holds for card acting, never screen-anchor a pattern on a moving subject |
| Hi-Fi RUSH (Tango, UE4 deferred) | Toon as post-process on deferred lighting, per-volume toon parameters; stepped decal lights; characters ignore environment lights; shadow colour from a world-mapped 3D texture; halftone (lit) / hatching (shade) mapped by world normal + world UV; static shadow maps with 4x4 PCF; capsule and decal shadows for enemies; SDF face shadows after miHoYo; comic shader removes GI/SSAO gradation; bloom avoided with halftone | [V] third-party notes on the GDC 2024 talk; [V] 80.lv summary | D4 stepped secondary lights, shadow colour by region (our per-setup replacement colour is the same idea), cards lit by rules, blob/decal shadows are legitimate even in a AAA toon game |
| Genshin Impact / Honkai 3rd (miHoYo, Unity) | Face shading from an SDF threshold map: `lit = step((1 - F.L) / 2, map)`, mirrored by light side; multi-channel 2D ramp textures (diffuse + specular, 1-3 layers); backface outline with vertex-colour width and perspective correction, plus an image-space normal+depth outline; HBAO-based AO with colour shift; PCSS | [V] community shader README for the formula; [V] sparse Unite 2018 slide text; ramp/lightmap channel layout [U] | B14 designed shade shapes for cards; ramp LUT per setup (B2); tinted AO only |
| Team Fortress 2 (Valve) | Half-Lambert into a painted 1D warp (x2 overbright, cool shade, red terminator); ambient cube; rim = Fresnel^4 x up-facing x ambient; rim instead of outlines | [V] paper text | D3 terminator band, D7 sky rim; the five illustration rules in A1 |
| Zelda: BotW / Wind Waker | BotW: two bands + rim only on lit surfaces + specular, applied as a deferred step. Wind Waker characters: two colours (highlight/shadow), single light, unquantised additive rim | [S] secondary write-ups only | confirms our lit-side rim; no new technique |
| Arcane (Fortiche) | Lighting painted into textures, custom shaders for brush-stroke look, hand-drawn 2D FX | [S] weak, non-studio sources | our FxLayer (2D sprites in 3D) is the same idea; bake light into kit textures where a prop never moves |
| Obra Dinn / Dither3D | Dither mapped to a sphere around the camera (stable in rotation only) / UV-anchored fractal dots at constant screen size | [V] runevision, GitHub | A3 anchoring ladder |

---

## E. Sources

Read directly (fetched page, extracted PDF text, or installed source):

- https://www.cs.princeton.edu/courses/archive/fall07/cos597B/papers/mitchell-team-fortress.pdf : Mitchell,
  Francke, Eng, "Illustrative Rendering in Team Fortress 2" (NPAR 2007). Half-Lambert constants, warp texture,
  rim formula, illustration rules.
- https://roystan.net/articles/toon-shader/ : reference toon shader: band, ambient 0.4, specular and rim
  constants.
- https://roystan.net/articles/outline-shader/ : Roberts-cross depth/normal outlines, depth threshold
  modulation, default thresholds.
- https://ameye.dev/notes/rendering-outlines/ : five outline techniques, clip-space extrusion formula, edge
  sources, pitfalls.
- https://gist.github.com/bgolus/a18c1a3fc9af2d73cc19169a809eb195 : Ben Golus's jump-flood outline code: pass
  count, formats, sub-pixel init, AA expression, mesh cost.
- https://blog.maximeheckel.com/posts/moebius-style-post-processing/ : three.js Sobel outlines (depth x 25 +
  normal), wobble (frequency 0.08), specular in the normal buffer, hatch thresholds, displaced-geometry pitfall.
- https://blog.maximeheckel.com/posts/on-crafting-painterly-shaders/ : Kuwahara variants and constants (the
  anisotropic section was truncated in the fetch; structure-tensor details not captured).
- https://topic.alibabacloud.com/a/quottranslationquot-nishikawa-quotexperiment-made-by-the-game-graphicsquotquotguilty-gear-xrd-font-colorredsignfont-quot-in-the_8_8_31556834.html
  : machine translation of Zenji Nishikawa's 4Gamer article on Guilty Gear Xrd, part 2: vertex colour channels,
  ILM and SSS textures, hull outline passes, inner lines. Wording is rough; channel meanings are consistent
  with community accounts.
- https://www.foth.top/article/gdc-2024-hifirush-toonrendering-notes/ : third-party notes on "3D Toon Rendering
  in Hi-Fi RUSH" (GDC 2024).
- https://80.lv/articles/the-making-of-hi-fi-rush-s-3d-toon-rendering-style : talk summary (topics, speakers,
  60 fps target).
- https://www.foundry.com/insights/film-tv/graphic-look-in-comp-spiderman : Spider-Verse comp toolset
  (Hatcher, Thresher, ChromaShifter), halftone controls, tracked rim dots.
- https://www.fxphd.com/fxblog/spider-verse-at-siggraph/ : Spider-Verse line work as geometry, hatching,
  misregistration as defocus, on twos, no motion blur.
- https://www.fxguide.com/fxfeatured/why-spider-verse-has-the-most-inventive-visuals-youll-see-this-year/ :
  halftone/hatching, offset colour channels for defocus, 12 images per second.
- https://github.com/NoiRC256/URPSimpleGenshinShaders : face shadow map lookup formula (community
  reconstruction, not miHoYo).
- https://sydianandrewchen.github.io/projects/3-stylized-facial-shadow-workflow : SDF face-shadow map
  generation workflow (high level).
- https://docswell.com/s/UnityJapan/KWLQP5-unite-tokyo-20183rd : miHoYo Unite Tokyo 2018 slides (Honkai
  Impact 3rd): ramps, outlines, AO, PCSS, bloom mips. Slide text is an outline only.
- https://threejs.org/docs/pages/MeshToonMaterial.html : `gradientMap` requirements.
- Installed `three@0.187.0` source: `gradientmap_pars_fragment.glsl.js`, `lights_toon_pars_fragment.glsl.js`,
  `nodes/display/ToonOutlinePassNode.js`, `examples/jsm/effects/OutlineEffect.js`, `constants.js`,
  `core/RenderTarget.js`, `renderers/WebGLRenderer.js`.
- https://runevision.com/tech/dither3d/ and https://github.com/runevision/Dither3D : surface-stable fractal
  dithering; description of Obra Dinn's sphere-mapped dither.
- https://godotshaders.com/shader/3d-sprite-edge-lighting/ : rim light on a 2D sprite from the world light
  using an alpha-offset sample.
- https://github.com/OmarShehata/webgl-outlines : three.js post-process outlines (depth + normals, FXAA),
  README only.

Seen only through search summaries (treat as leads):

- https://bgolus.medium.com/the-quest-for-very-wide-outlines-ba82ed442cd9 : Golus's article (403). The "about
  10 ms at 20 px" brute-force figure is quoted second-hand.
- https://omar-shehata.medium.com/how-to-render-outlines-in-webgl-8253c14724f9 and
  https://omar-shehata.medium.com/better-outline-rendering-using-surface-ids-with-webgl-e13cdab1fd94 : surface-ID
  outlines in three.js (403).
- https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf : Motomura's GDC 2015 slides (host refused the
  connection). https://gdcvault.com/play/1022031/GuiltyGearXrd-s-Art-Style-The is the talk listing.
- https://gdcvault.com/play/1034330/3D-Toon-Rendering-in-Hi and
  https://media.gdcvault.com/gdc2024/Slides/GDC+slide+presentations/Tanaka_Kosuke_3D_Toon_Rendering.pdf :
  Hi-Fi RUSH talk and slides (PDF too large to fetch).
- https://en.wikipedia.org/wiki/Gooch_shading and https://users.cs.northwestern.edu/~bgooch/PDFs/gooch98.pdf :
  Gooch cool-to-warm constants.
- https://www.cs.princeton.edu/courses/archive/fall00/cs597b/papers/meier96.pdf : Meier, "Painterly Rendering
  for Animation" (1996): the shower-door effect and particle-anchored strokes.
- https://gfx.cs.princeton.edu/proj/hatching/ : Praun et al., "Real-Time Hatching" (2001): tonal art maps.
- https://natron.readthedocs.io/en/rb-2.5/plugins/fr.inria.LightWrap.html and
  https://learn.foundry.com/nuke/14.1/content/reference_guide/draw_nodes/lightwrap.html : light wrap recipe.
- https://www.gamedev.net/tutorials/programming/graphics/toon-shader-using-unity-r5095/ and
  https://github.com/daniel-ilett/shaders-botw-cel-shading : BotW-style two bands + lit-side rim + specular.
- https://en.wikipedia.org/wiki/Cel_shading : Wind Waker's unquantised rim; general definitions.
- https://www.blendernation.com/2020/08/20/creating-ghibli-trees-in-3d/ : normal editing for painted-looking
  foliage.
- https://threejs.org/docs/pages/ToonOutlinePassNode.html : TSL toon outline pass docs.

Not found / still open: Guilty Gear Xrd polygon and bone counts; Genshin's ramp and lightmap channel layout;
any first-party Arcane or BotW rendering breakdown; measured timings for JFA vs brute force; whether a
shared override ShaderMaterial needs `uniformsNeedUpdate` per object (upgrades 1 and 5a); WebGPU availability
in the headless render Chromium. The two code defects in C2 (wind patch overwritten, ink pass without
displacement/alpha parity) come from reading the source, not from a render.
