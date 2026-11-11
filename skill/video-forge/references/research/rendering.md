# Rendering quality for offline-style frames in three.js r187 / WebGL2 (video-forge engine)

> **Status note (video-forge 1.6, 2026-11-11).** This is a research report written against the engine as it was on
> 2026-11-11 before / during the 1.6 work. Its "what our engine has vs gaps" and "upgrades" sections are a backlog, not
> the current state: see `references/shading-lighting.md` section 5 for what has been applied since. Evidence labels
> in the text say which claims were read in a source, summarised from search, measured, or left unverified.


Research date: 2026-11-11. Target: three.js 0.187.0 (verified in `engine/node_modules/three/package.json`),
Remotion 4.0.542, headless Chromium + ANGLE (D3D11), RTX-class GPU, deterministic per-frame rendering.

How to read the confidence marks:

- **[src]** = verified by reading the three.js 0.187 source installed in
  `engine\node_modules\three` (the most reliable evidence here,
  because it is the exact code we run).
- **[web]** = verified on a page fetched during this research (see section E).
- **[calc]** = derived by me from our code or from a formula; the arithmetic is shown.
- **[unverified]** = from memory or inference; not checked this session. Treat as a hypothesis to test.
- **[sketch]** = code I wrote for this report. None of the sketches were compiled or run.

Important note on the engine state: `post.ts`, `shaders.ts`, `look.ts` and `world.ts` were edited by someone else
WHILE this research ran (file times 10:02-10:08 on 2026-11-11). The "1.6" features I found and took into account:
stylised AO pass on the world buffer (`look.ao`), hue-following ink (`look.ink.hue`), composable shader patches
(`addPatch`), a split form x cast cel ramp, secondary (non-sun) lights in the toon shader (`toon-v4`), form-following
sky fill / bounce / terminator band, a card rim light (`vfcard-v4`) and `lightShafts()` crossed cards in `world.ts`.
Section C describes the files as they were at 10:08. Line numbers are approximate; I refer to constants and
functions by name. `Stage3D.tsx`, `cast.ts` and `textures.ts` did not change during the research.

---

## (A) Key principles

1. **We are an offline renderer that happens to use a rasteriser.** Every classic "real-time hack" has a ground-truth
   version that is just "render the frame N times with something jittered and average": sub-pixel camera jitter =
   anti-aliasing, light-position jitter = soft shadows with correct contact hardening, lens-position jitter = depth of
   field, time jitter = motion blur. This is the accumulation buffer (Haeberli and Akeley, SIGGRAPH 1990) [web]. One
   loop gives all four at once, with no screen-space artefacts. three.js ships it for AA only (`SSAARenderPass`,
   `TAARenderPass`) [src]; the other three are a few lines each.

2. **Budget.** Measured today: about 17 fps at 1440x2560 with 4 tabs (engine.md), so one tab spends about 235 ms per
   frame [calc: 4 / 17]. A 50 s, 30 fps short is 1500 frames = about 88 s. "Minutes" means we can spend roughly 3x
   more per frame (about 700 ms per tab-frame for a 4.5 minute render) [calc]. How much of the 235 ms is GPU work
   versus screenshot capture, JPEG encode and Canvas2D character drawing is NOT measured; measure before choosing
   sample counts (see B11.7).

3. **Never accumulate across frames.** Remotion renders frames out of order in several tabs [web: remotion
   flickering doc]. Anything with history (TAA history buffers, `AfterimagePass`, `N8AOPass.accumulate`,
   `TAARenderPass.accumulate`, `ProgressiveLightMap` over time, auto-exposure with adaptation) breaks determinism.
   Accumulate INSIDE one frame only, or bake once in `build()` as a pure function of the scene.

4. **Fixed sample patterns beat random ones for video.** A fixed Halton or Vogel pattern gives a structured error that
   is identical on every frame (invisible in motion). A per-frame random pattern gives noise that flickers and that
   the H.264 encoder has to pay for. Use per-pixel rotation (interleaved gradient noise) only where a blur follows.

5. **Order of operations is quality.** Linear HDR for everything that models light (shading, AO, fog, DOF, motion
   blur, bloom); then exposure, tone map, sRGB OETF; then display-referred grade; then grain; then dither as the very
   last step before 8-bit. Anti-alias before grain. Blend ink in display gamma (the engine already does this
   deliberately).

6. **Stylisation amplifies artefacts.** A cel ramp (now `smoothstep(uRampLo, uRampHi, N.L) * smoothstep(0.32, 0.68,
   sunVis)` in `TOON_FRAG_BODY`) is a contrast amplifier: the cast term maps a third of the shadow map's filtered
   range to the full lit/shade transition, so it
   turns shadow-map noise, low shadow resolution and banding into hard, visible edges. Shadow quality matters MORE in
   the toon looks than in the realistic ones.

7. **Resolution of the cheapest thing sets the look.** One shadow-map texel, one alpha-tested card edge or one
   unfiltered texture can be the only "cheap" pixel in a frame and it is what the eye finds. Fix the worst sample
   first (section D is ranked this way).

8. **The delivered picture is 8-bit 4:2:0 BT.709 limited range, re-encoded by YouTube.** Fine dither does not
   survive that chain; real texture, grain at 1 percent or more, and avoiding large flat gradients do.

---

## (B) Technique catalogue

Each entry: what / when / API or sketch / parameters / cost / pitfalls.

### B1. Shadows

#### B1.1 Shadow map filtering types in r187

- **What.** `renderer.shadowMap.type` is one of `BasicShadowMap`, `PCFShadowMap`, `VSMShadowMap`.
  `PCFSoftShadowMap` still exists as a constant but is replaced at run time with a warning:
  "PCFSoftShadowMap has been removed. Using PCFShadowMap instead." [src: `src/renderers/webgl/WebGLShadowMap.js`].
  The migration guide dates the deprecation to r182 for WebGLRenderer [web].
- **How PCF works in r187** [src: `ShaderChunk/shadowmap_pars_fragment.glsl.js`]: the shadow map is a native depth
  texture sampled through `sampler2DShadow` (hardware comparison + bilinear = 4 taps per fetch). `getShadow()` takes
  **5 fetches on a Vogel disc**, rotated per pixel by interleaved gradient noise of `gl_FragCoord.xy`, with disc radius
  `shadow.radius` texels. So `shadow.radius` IS honoured by PCF now (it used to be VSM-only in old releases), and the
  penumbra is screen-space dithered.
- **VSM** [src]: two-pass separable blur with `shadow.blurSamples` (default 8) taps over `shadow.radius` texels (default
  material radius 4), Chebyshev upper bound with a light-bleed remap `(p_max - 0.3) / 0.65`. Not supported for
  PointLights. All receivers also cast.
- **Parameters** (`LightShadow` defaults [src]): `bias 0`, `normalBias 0`, `radius 1`, `blurSamples 8`,
  `mapSize 512x512`, `intensity 1`, `autoUpdate true`.
- **When.** PCF for crisp cartoon shadows; VSM when a large, smooth, noise-free blur is wanted and light bleeding where
  shadows overlap is acceptable (toon ramps hide bleeding poorly) [unverified judgement].
- **Cost.** PCF: 5 comparison fetches per shaded pixel. VSM: 2 extra full shadow-map-size passes.
- **Pitfalls.**
  - PCF's IGN rotation produces a stippled penumbra when `radius` is large relative to 5 taps. Under a cel ramp the
    stipple is thresholded into speckle [unverified for our scenes: check a 400 percent crop of a shadow edge].
  - Because PCF uses `sampler2DShadow`, shaders that need raw depth (PCSS blocker search, volumetric raymarch) cannot
    read it. The official PCSS example therefore runs on `BasicShadowMap` [web: webgl_shadowmap_pcss source at r187].
  - Reports of pixelated shadows after upgrading to r182 exist on the forum; no confirmed cause [web: search result].

#### B1.2 Bias and normalBias tuning

- **What.** `bias` is added to the receiver depth in the shadow camera's normalised depth (0..1 over near..far).
  `normalBias` offsets the lookup position along the surface normal in WORLD units [src].
- **Rule.** Tighten the shadow camera `near`/`far` to the scene first; then `normalBias` = 1 to 2 shadow texels in
  metres; then `bias` = 0 or a tiny negative value (-0.00002 to -0.0001).
- **Convert bias to metres** for an orthographic shadow camera: `metres = |bias| * (far - near)` [calc].
- **Back-face trick.** For PCF and Basic, three renders `BackSide` into the shadow map for `FrontSide` materials
  (`shadowSide` map in WebGLShadowMap.js) [src]. Closed meshes therefore need almost no bias on lit faces; acne
  appears mainly on `DoubleSide` materials and thin single-sided cards.
- **Pitfalls.** Large bias = "peter-panning": the shadow starts a visible distance away from the contact point, and
  objects look like they float. Thin objects lose their contact shadow first.

#### B1.3 Resolution versus frustum fitting

- **What.** Shadow sharpness = world size of one texel = `frustumWidth / mapSize`. A bigger map is the expensive fix;
  a tighter frustum is the free one.
- **How.** Per frame, fit the orthographic shadow camera to the part of the view frustum that the shot can see (clamped
  to a maximum shadow distance), extend it toward the light to keep off-screen casters, and **snap the centre to whole
  texels in light space** so the texel grid is world-stable (no crawling when the camera drifts).
- **Sketch** [sketch]:
  ```ts
  // light-space basis from the sun direction; corners = 8 view-frustum corners cut at shadowFar
  const r = boundingSphereRadius(corners);                 // rotation-invariant: size never changes while the fov is fixed
  const texel = (2 * r) / sun.shadow.mapSize.x;
  centreLS.x = Math.round(centreLS.x / texel) * texel;     // snap in light space
  centreLS.y = Math.round(centreLS.y / texel) * texel;
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: casterRange });
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.copy(centreWorld); sun.position.copy(centreWorld).addScaledVector(dirToSun, casterRange * 0.5);
  sun.shadow.normalBias = 1.5 * texel;
  ```
- **Parameters.** `shadowFar` = 3 to 5 x focus distance, clamped to 15..120 m. `mapSize` 4096 (max texture size on
  D3D11 is 16384; 8192 costs 256 MB at 32-bit depth [calc]).
- **Cost.** Zero GPU; a few matrix operations per frame.
- **Pitfalls.** The frustum must be a pure function of the frame's camera (it is). During a zoom the texel size
  changes continuously, so edges breathe slightly; quantise `r` to powers of 2^(1/4) if that shows [unverified].

#### B1.4 Cascaded shadow maps

- **r187 built-in: `SunLight`** [src: `examples/jsm/lights/SunLight.js`, `SunLightShadow.js`; official example
  `webgl_lights_sunlight` [web]]. A light type for WebGLRenderer with **exactly 2 cascades** in one atlas
  (`_cascadeCount = 2`, 10 percent cross-fade band, "practical" split = mean of uniform and logarithmic). Default
  `mapSize` 1024 per cascade; `shadow.camera.far` is the maximum shadow distance; left/right/top/bottom are ignored.
  The direction comes from the light's position toward the origin (no target). The official example uses
  `mapSize 2048`, `normalBias 0.05`, far 1000. The class comment warns it is "not a good fit for small, bounded
  scenes like dioramas".
- **Older addon: `CSM`** [src: `examples/jsm/csm/CSM.js`]: `cascades 3`, `maxFar 100000`, `mode 'practical'`
  (also uniform / logarithmic / custom), `shadowMapSize 2048`, `shadowBias 0.000001`, `lightNear 1`, `lightFar 2000`,
  `lightMargin 200`. It creates N DirectionalLights and patches material shaders (`csm.setupMaterial(material)`), and
  needs `csm.update()` every frame.
- **When.** Wide establishing shots with detail both at 3 m and at 150 m in the same frame. For our mostly bounded sets
  B1.3 gives the same benefit with one map.
- **Pitfall for us.** Both CSM routes change the shader path. `sunVisChunk()` in `shaders.ts` string-matches
  `getShadow( directionalShadowMap[ i ]` inside `lights_fragment_begin`; `SunLight` uses `getSunShadow()` and separate
  uniforms (`NUM_SUN_LIGHT_SHADOWS`) [src], and the `CSM` addon rewrites the same chunk. Either would need a rewrite of
  the toon and card patches.

#### B1.5 PCSS (contact-hardening soft shadows)

- **What.** Blocker search, then penumbra width = `(zReceiver - zBlocker) / zBlocker * lightSize`, then PCF with that
  radius (Fernando, NVIDIA 2005 [unverified this session]).
- **three.js.** Example `webgl_shadowmap_pcss` patches `ShaderChunk.shadowmap_pars_fragment` by string replacement and
  sets `renderer.shadowMap.type = THREE.BasicShadowMap` because "PCSS requires reading raw depth values" [web]. Its
  constants are hand-tuned to its scene (`LIGHT_WORLD_SIZE 0.005`, `LIGHT_FRUSTUM_WIDTH 3.75`, `NEAR_PLANE 9.5`,
  `NUM_SAMPLES 17`, `NUM_RINGS 11`). drei's `SoftShadows` (`size`, `samples`, `focus`) is the same idea [web: search].
- **Cost.** 17 + 34 raw fetches per pixel in the example. Offline we could use 32 + 64.
- **Pitfalls.** Blocker search fails where two occluders at different depths overlap (average blocker depth is wrong);
  noise needs many taps; the replace strings are whitespace-exact and break on three upgrades. Accumulation (B1.7)
  gives the same look without any of this.

#### B1.6 Contact shadows

- **Planar "blob from below"** (three example `webgl_shadow_contact`) [web]: an orthographic camera looks UP from the
  ground over a thin slab (`far = 0.3`), renders the scene with a depth override material whose alpha is
  `(1 - depth) * darkness`, into a 512 px target, blurred horizontally + vertically twice (`blur 3.5`, then x0.4), and
  a transparent ground plane shows it. Good for studio / product shots on flat floors.
- **Screen-space contact shadows** [unverified, standard technique]: per pixel, march 8 to 16 steps toward the sun in
  view space over 0.1 to 0.4 m and test against the depth buffer; multiply into the sun visibility. Fills the gap
  that shadow bias leaves at contact points.
- **Baked blob.** A radial-gradient quad under each character (the engine has this in `CharacterCard`).
- **Pitfalls.** Screen-space marching misses off-screen and occluded casters and treats depth as infinitely thick.

#### B1.7 Soft shadows by accumulation (offline)

- **What.** Render the frame N times; each time move the sun to a different point of a disc with angular radius theta
  as seen from the scene. Average. Penumbra width = `2 * tan(theta) * distance(occluder, receiver)` [calc], so shadows
  are sharp at the feet and soft far away, with no blocker-search artefacts.
- **How.** Sun positions from a low-discrepancy sequence mapped to a disc:
  ```ts
  const halton = (i: number, b: number) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
  // sample i of N: polar disc (sqrt for uniform area)
  const a = 2 * Math.PI * halton(i + 1, 5), rad = Math.sqrt(halton(i + 1, 7)) * Math.tan(theta);
  sun.position.copy(target).add(dir.clone().addScaledVector(T, Math.cos(a) * rad).addScaledVector(B, Math.sin(a) * rad).multiplyScalar(80));
  ```
- **Parameters.** Real sun: theta = 0.27 degrees. Stylised: 0.5 to 2 degrees. Overcast: 5+ degrees (then N must rise).
  N = 8 for theta <= 1 degree, 16 to 32 beyond. Keep a small PCF `radius` (1 to 1.5) so the N discrete shadow copies
  fuse: rule of thumb `PCF blur >= penumbra / N` [calc].
- **Cost.** N shadow-map renders + N scene renders. Shares the loop with AA / DOF / motion blur (B5.4).
- **Pitfalls.** Under a cel ramp each copy is re-sharpened, so wide penumbrae can show N visible steps; raise N or
  reduce theta. drei's `AccumulativeShadows` + `RandomizedLight` is the same idea restricted to a ground plane,
  accumulated over time (`frames 40`, `alphaTest 0.65`) [web], so its temporal mode is not usable for us but the
  "instant" idea is.

#### B1.8 Baked shadows / lightmaps

- **What.** `ProgressiveLightMap` (WebGL) accumulates jittered-light renders into a lightmap in UV space, needs `uv1`
  and is designed to converge over many frames [src: `examples/jsm/misc/ProgressiveLightMap.js`; example
  `webgl_shadowmap_progressive` [web]]. The new `LightMapper` in `examples/jsm/lighting/` is WebGPU-only [src].
- **When.** Static interiors with many soft lights. For us: only if baked inside `build()` with a fixed sample count,
  and it costs time in every tab.
- **Pitfalls.** Needs lightmap UVs for every mesh (our procedural boxes have overlapping UVs).

### B2. Ambient occlusion

#### B2.1 The family

| pass | idea | three.js r187 | defaults [src] |
|---|---|---|---|
| SSAO | hemisphere kernel + noise + blur (Crytek style) | `SSAOPass` | `kernelRadius 8`, `minDistance 0.005`, `maxDistance 0.1` |
| SAO | scalable obscurance estimator (McGuire 2012) | `SAOPass` | `saoBias 0.5`, `saoIntensity 0.18`, `saoScale 1`, `saoKernelRadius 100`, blur radius 8, stdDev 4, depth cutoff 0.01 |
| HBAO | horizon angles per direction (Bavoil 2008) | none | - |
| GTAO | horizon integral with cosine weight, matches ray-traced AO (Jimenez et al. 2016) | `GTAOPass` | `radius 0.25`, `distanceExponent 1`, `thickness 1`, `distanceFallOff 1`, `scale 1`, `SAMPLES 16`; denoise `lumaPhi 10`, `depthPhi 2`, `normalPhi 3`, `radius 8`, `rings 2`, `samples 16` |
| N8AO | tuned SSAO with good defaults, colour tint, half-res, accumulation | external `n8ao` | Medium = 16 AO samples, 8 denoise samples, radius 12 [web] |

- **GTAO paper claims** [web: search summary]: radiometrically correct (cosine foreshortening inside the integral),
  includes a multi-bounce approximation and a specular-occlusion variant (GTSO), has a thin-object heuristic.
- **`GTAOPass` details** [src]: `new GTAOPass(scene, camera, width, height, parameters, aoParameters, pdParameters)`;
  `updateGtaoMaterial({ radius, distanceExponent, thickness, distanceFallOff, scale, samples, screenSpaceRadius })`;
  `updatePdMaterial({ lumaPhi, depthPhi, normalPhi, radius, radiusExponent, rings, samples })`; `blendIntensity`;
  `output` = `GTAOPass.OUTPUT.{Default, Diffuse, AO, Denoise, Depth, Normal}`; in the shader `DIRECTIONS = SAMPLES < 30
  ? 3 : 5` slices.
- **Reusing our G-buffer.** `gtao.setGBuffer(depthTexture, normalTexture)` skips its own normal pass, but it then sets
  `NORMAL_VECTOR_TYPE = 1`, which expects normals PACKED as `rgb * 0.5 + 0.5`. Our `worldRT` stores raw view-space
  normals in half float, which is type 2. After `setGBuffer` set
  `gtao.gtaoMaterial.defines.NORMAL_VECTOR_TYPE = 2; gtao.pdMaterial.defines.NORMAL_VECTOR_TYPE = 2;` and
  `needsUpdate = true` [src: `GTAOShader.js` lines around 142].
- **N8AO** [web: README]: `new N8AOPass(scene, camera, w, h)` or `N8AOPostPass`; `configuration.aoRadius` (world
  units), `distanceFalloff` (default 1.0), `intensity` (pow), `color` (tint, default black; "keep it fairly dark"),
  `halfRes`, `screenSpaceRadius`, `aoTones` (quantised AO, relevant to toon looks), `accumulate` (do NOT use: it is
  temporal). Requires WebGL2; three r161+ recommended. Not installed in our engine.

#### B2.2 Parameters that matter

- **Radius in world units**, 0.3 to 1.0 m for human-scale sets. Screen-space radius makes AO swim on zooms.
- **Samples.** 16 with a spatial denoise is the real-time norm. Offline: 32 to 64, or 16 x N accumulated sub-samples
  with a different rotation per sub-sample and NO blur.
- **Falloff / range check.** Without it, foreground objects get a dark halo on the far background behind them.
- **Bias** 2 to 5 percent of the radius against self-occlusion on flat surfaces.

#### B2.3 Artefacts

- Halo around silhouettes (missing range check or a blur that ignores depth).
- Banding or grain from too few samples; "dirty corners" when AO multiplies direct light too.
- Flat walls darkening at grazing angles (depth precision; use view-space positions and a normal buffer, not
  depth-derived normals).
- Disocclusion: nothing behind the camera or off screen occludes.

#### B2.4 Stylising AO

- **Tint, do not darken.** Multiply by `mix(vec3(1), tint, ao * strength)` with a saturated shade colour (violet for
  day, deep blue for night). This is what the engine's new `AO_COMP` does.
- **Apply to the shade only.** Physically AO attenuates ambient light, not direct sun. Weight it by `(1 - ramp)` or by
  luminance so sunlit ground stays clean except in the tight contact band [unverified as a style rule].
- **Quantise** (N8AO `aoTones`) for a cel look, or remap with `smoothstep` to get a deliberate "contact line".
- **Feed it to ink.** A thin dark AO core next to a contact reads as a line weight variation.

#### B2.5 Ground truth by accumulation

- Render N frames lit by N different lights distributed over the sky hemisphere (shadow-mapped, weak, no cel ramp) and
  average: that IS sky occlusion, including off-screen casters. 32 to 64 lights. This is what drei's
  `RandomizedLight` `ambient` term does [web]. Expensive per frame; attractive only as a build-time vertex or lightmap
  bake for static sets.
- Path tracing: `three-gpu-pathtracer` current README describes a **WebGPU** renderer (`WebGPUPathTracer`,
  `renderSample()`), MeshStandard / MeshPhysical only [web]. Older releases had a WebGL2 `WebGLPathTracer`
  [unverified]. Not compatible with our Lambert + `onBeforeCompile` toon materials.

### B3. Reflections and environment

#### B3.1 Environment maps and PMREM

- **What.** `PMREMGenerator` prefilters an environment into roughness mips. `scene.environment = pmrem.fromScene(...)`
  feeds diffuse + specular IBL to `MeshStandardMaterial` / `MeshPhysicalMaterial`.
- **API** [src]: `fromScene(scene, sigma = 0, near = 0.1, far = 100, options)`, `fromEquirectangular(tex)`,
  `fromCubemap(tex)`. r187 changed PMREMs to cube render targets and removed `CubeUVReflectionMapping`; "materials
  look slightly different" [web: migration guide 186 -> 187].
- **RoomEnvironment** [src]: `new RoomEnvironment()`; `pmrem.fromScene(environment).texture`. Its scene position
  changed in r183, so lighting from it changed [web].
- **From our own sky** [sketch]: build a tiny scene with only the gradient dome (and an emissive sun disc), then
  `scene.environment = pmrem.fromScene(skyScene, 0.02).texture; scene.environmentIntensity = 0.6;`. Rebuild only when
  the lighting setup changes (it is a pure function of the look, so it is deterministic).
- **HDRIs.** r187 ships `HDRLoader`, `RGBELoader`, `EXRLoader`, `UltraHDRLoader` [src: loaders directory]. Poly Haven
  1k or 2k HDRIs are enough for lighting.
- **Lambert caveat.** `MeshLambertMaterial` supports `envMap`, `combine`, `reflectivity`, `envMapIntensity`,
  `lightMap`, `aoMap`, `normalMap`, `bumpMap` [src]. In its fragment shader `envmap_fragment` runs BEFORE
  `opaque_fragment` [src: `ShaderLib/meshlambert.glsl.js`]. Our toon patch replaces `opaque_fragment` with a block that
  overwrites `outgoingLight`, so any envMap contribution is discarded on toonified materials.
- **Cost.** One-off: 6 faces + blur passes. Per frame: one cube lookup.

#### B3.2 Planar reflections: `Reflector`

- **API** [src: `examples/jsm/objects/Reflector.js`]: `new Reflector(geometry, { color, textureWidth = 512,
  textureHeight = 512, clipBias = 0, shader, multisample = 4 })`. Renders the scene from a mirrored camera into a
  half-float target in `onBeforeRender`. The reflection camera is `camera.clone()` cached per source camera, so it
  inherits the layer mask the camera had at first use.
- **When.** Water, wet streets, polished floors, mirrors: exact for a flat plane, includes sky, cards and off-screen
  objects (which SSR cannot).
- **Parameters.** `textureWidth/Height` = output size for sharp mirrors, half size for blurred wet looks;
  `clipBias 0.003`.
- **Cost.** One extra scene render per reflector per camera render.
- **Pitfalls for us.**
  - `onBeforeRender` fires on EVERY render with that camera, including our world normal pass (with
    `scene.overrideMaterial` set). Guard it, or the reflection is rendered twice and the second time with the normal
    material [calc from reading both files].
  - Custom look: pass `shader` to add Fresnel (`F0 = 0.02` for water), roughness blur (sample a mip or a small Vogel
    disc), ripple distortion and a puddle mask.
  - Billboards re-aimed at the main camera look acceptable in the mirror because they only yaw [unverified].

#### B3.3 Screen-space reflections: `SSRPass`

- **API** [src]: `new SSRPass({ renderer, scene, camera, width, height, selects, groundReflector })`; `opacity 0.5`,
  `maxDistance 180`, `thickness 0.018`, `blur true`, `fresnel`, `distanceAttenuation`, `bouncing`, `infiniteThick`,
  `resolutionScale 1`, `output`. `MAX_STEP` = screen diagonal in pixels. It renders its own normal and metalness
  buffers with override materials.
- **When.** Glossy non-planar surfaces in realistic looks.
- **Pitfalls.** Misses anything off screen or hidden; needs `ReflectorForSSRPass` for a ground plane anyway; fights
  with our own depth / normal passes and layers. For flat wet ground, B3.2 is simpler and better.

#### B3.4 Cube cameras

- `CubeCamera(near, far, WebGLCubeRenderTarget)` renders 6 faces from a point; use for one hero reflective prop
  (a kettle, a helmet) or as the input of `LightProbeGenerator.fromCubeRenderTarget()` [src]. Six scene renders per
  update; update once in `build()` for static sets.

#### B3.5 The wet-road look (recipe)

Numbers from Lagarde's "Water drop 2b" [web]:

- Wet diffuse = dry diffuse x `lerp(1.0, 0.3, wetLevel)`.
- Gloss x `lerp(1.0, 2.5, wetLevel)` (clamped), normals unchanged on merely wet surfaces.
- Puddles: gloss 1.0, specular F0 0.02 (IOR 1.33), normal blended toward flat by accumulated water; puddle edge
  margin 0.4 on the height mask.
- Ripples: an animated ring normal texture, up to 4 time-shifted layers as rain gets heavier.

For a stylised night street: darken the ground albedo by 0.5 to 0.7, add a planar reflection x Schlick Fresnel x a
low-frequency puddle noise mask, stretch reflections vertically (anisotropic blur along the view direction), and let
emissive lamps and signs bloom in the reflection.

### B4. Global illumination fakes

#### B4.1 Hemisphere + bounce

- `HemisphereLight(sky, ground, intensity)` is a 2-colour irradiance gradient on the normal's Y. Add a weak, shadowless
  `DirectionalLight` from below-opposite the sun with the ground's colour for bounce onto vertical walls
  [unverified, standard practice].
- "Sky colour in shadows": the shade colour should move toward the sky colour on up-facing surfaces and toward the
  ground colour on down-facing ones. The engine's new `uSkyFill` / `uBounce` terms in `TOON_FRAG_BODY` do exactly
  this.

#### B4.2 Light probes (L2 spherical harmonics)

- `LightProbe` holds 9 SH coefficients; `LightProbeGenerator.fromCubeTexture(cube)` /
  `await fromCubeRenderTarget(renderer, target)` [src]. One probe = one irradiance for the whole scene
  (direction-dependent, position-independent). Lambert and Standard materials consume it through
  `getLightProbeIrradiance` [src: `lights_fragment_begin`].

#### B4.3 Irradiance volumes: `LightProbeGridWebGL` (new, in our installed version)

- **What** [src: `examples/jsm/lighting/LightProbeGridWebGL.js`; example `webgl_lightprobes` [web]]: a 3D grid of L2 SH
  probes giving position-dependent diffuse GI, for WebGLRenderer.
- **API.** `const probes = new LightProbeGridWebGL(width, height, depth, nx, ny, nz); probes.position.set(...);
  probes.bake(renderer, scene, { cubemapSize: 32, near: 0.05, far: 20 }); scene.add(probes);` (`cubemapSize` default
  8; optional `start` / `count` to bake in ranges). Core lighting chunks read it
  (`getLightProbeGridIrradiance` in `lights_fragment_begin`) [src].
- **When.** Interiors and street canyons where bounce colour should change with position (warm near a lit wall, cool
  under an awning).
- **Cost.** Bake = `nx*ny*nz` cube renders (6 faces each) at build time in every tab. A 6x5x6 grid = 180 probes =
  1080 small renders [calc].
- **Pitfalls.** New API (renamed in r186 [web]); diffuse only; our toon patch uses only
  `reflectedLight.indirectDiffuse * uAmbient`, so the grid's contribution arrives scaled by `uAmbient` (about 0.2) and
  through the albedo. Light leaking through thin walls unless probes are placed with care [unverified].

#### B4.4 Lightmaps and vertex-baked AO

- `material.lightMap` + `uv1`, `material.aoMap`. For procedural kits, bake **per-vertex** AO or sky visibility at
  build time (raycast against the set with the scene's BVH or plain `Raycaster`, 16 to 32 rays per vertex) and store
  it in vertex colours. Deterministic, free at render time, immune to screen-space artefacts
  [unverified for build-time cost in our scenes].

#### B4.5 Emissive bleed

- Cheap: a `PointLight` at every emissive source (range 3 to 9 m, decay 1 to 2), no shadows.
- Post: bloom with a low threshold tints neighbours (already in the engine).
- GI-correct: bake the probe grid with emissives on.

### B5. Anti-aliasing and supersampling

#### B5.1 MSAA render targets

- `new WebGLRenderTarget(w, h, { samples: 4 })`; three clamps to `capabilities.maxSamples`
  (`gl.getParameter(gl.MAX_SAMPLES)`) [src]. Resolves happen automatically when the target is sampled.
- Only geometric edges are anti-aliased. NOT anti-aliased: `alphaTest` cut-outs, shader discontinuities (cel ramp,
  specular), post passes.
- **HDR resolve problem**: averaging linear HDR samples and tone mapping afterwards leaves very bright edges aliased
  (one sample at 20.0 dominates) [unverified this session; Karis 2014 discusses it]. Low impact in toon looks where
  albedo stays below 1; visible on emissive lamps.

#### B5.2 Alpha to coverage (the fix for cut-out edges)

- **What.** `material.alphaToCoverage = true` converts alpha into an MSAA coverage mask. three then compiles
  `diffuseColor.a = smoothstep(alphaTest, alphaTest + fwidth(diffuseColor.a), diffuseColor.a)` instead of a hard
  `discard`, and enables `gl.SAMPLE_ALPHA_TO_COVERAGE` [src: `alphatest_fragment.glsl.js`, `WebGLState.js`].
- **When.** Every alpha-tested texture drawn into an MSAA target: character cards, banners, lattices, foliage cards.
- **Cost.** None measurable.
- **Pitfalls.** Gives `samples + 1` coverage levels (5 at 4x). The doc comment says it needs an antialiased context;
  the state code enables it per material regardless of the target, and a multisampled render target is what the
  GL feature actually needs [src for the code path; the behaviour on our MSAA `sceneRT` should be confirmed on a
  still]. Mipmapped alpha shrinks cut-outs with distance; Golus's fix is to scale alpha by mip level [unverified:
  the article returned HTTP 403 this session].

#### B5.3 Post-process AA

- **FXAA** (`FXAAPass` / `FXAAShader`): 1 pass, needs gamma-space luma, softens thin ink lines.
- **SMAA** (`SMAAPass`): 3 passes with area / search textures, sharper than FXAA, still a reconstruction.
- **TAA** (`TAARenderPass`): accumulates jittered frames over TIME when the scene is static (`accumulate`,
  `sampleLevel`) [src]. Its `accumulate` mode is temporal and therefore off-limits; with `accumulate = false` it is
  just SSAA.
- Use post AA only as a fallback for shader aliasing that survives everything else, and always before grain and
  dither.

#### B5.4 Supersampling for final frames

- **Brute force (SSAA by resolution).** Render all targets at k x size and downsample in the final pass. k = 1.5 is
  2.25x the pixels, k = 2 is 4x. Memory: RGBA16F at 1440x2560 is 29.5 MB per target [calc: 3,686,400 px x 8 B]; our
  roughly 450 MB per tab becomes about 1.8 GB at k = 2 [calc, approximate]. Remotion's `scale` option only raises
  the browser's device scale factor (up to 16) [web]; our canvas is fixed at pixel ratio 1, so `--scale 2` would
  upscale, not supersample, unless Stage3D multiplies its buffer size.
- **Jittered accumulation (SSAA by samples).** `SSAARenderPass` [src]: renders the scene `2^sampleLevel` times
  (level 0..5 = 1, 2, 4, 8, 16, 32) with `camera.setViewOffset(fullW, fullH, jx, jy, w, h)` sub-pixel offsets from
  fixed D3D-style patterns (integers on a [-8, 8) grid x 1/16 px), and adds them with weight 1/N into a half-float
  target. `unbiased = true` varies the weights slightly so rounding errors cancel. No extra memory beyond one target.
- **Halton jitter.** For arbitrary N use `(halton(i+1, 2) - 0.5, halton(i+1, 3) - 0.5)` pixels. The UE4 TAA talk
  (Karis 2014) uses Halton(2,3) [unverified detail; the talk's existence and topic are confirmed [web]].
- **How many samples** [unverified rules of thumb, to be checked on stills]:
  - AA only: 4 to 8 jittered samples on top of 4x MSAA is visually converged for edges (16 to 32 effective).
  - Soft shadows: 8 to 16 (B1.7).
  - Motion blur: N >= streak length in px / 3, otherwise strobing; combine with a per-sample post blur of
    `shutter / N` to fuse the copies (B6.3).
  - DOF by lens jitter: 32 to 128 for a 10 px blur radius; ghost copies are the failure mode.
- **Filter.** Equal weights = box filter over one pixel. For a slightly sharper result jitter over 1.25 px and weight
  with a Blackman-Harris or Gaussian window [unverified].
- **Temporal stability.** Use the SAME pattern on every frame. Do not rotate the pattern per frame unless N >= 32.

### B6. Depth of field, motion blur, bloom

#### B6.1 Circle of confusion

- Thin lens: `c = A * f * |S2 - S1| / (S2 * (S1 - f))` with aperture diameter `A = f / N`, focus distance `S1`,
  object distance `S2` [unverified citation; standard optics]. As `S2 -> infinity`, `c -> A f / (S1 - f) = cInf`, so
  `coc(z) = cInf * (1 - focus / z)`: this is exactly the form the engine's `cocS()` uses, with `cInf` given directly
  in pixels (art-directable, physically shaped).
- Near field grows without bound as z -> 0; clamp (`maxCoC`).

#### B6.2 DOF implementations

- **`BokehPass`** [src]: `{ focus, aperture = 0.025, maxblur = 1.0 }`, a single-pass gather with a fixed kernel in UV
  units (not resolution independent), no near/far separation, no "sample reaches us" test: backgrounds bleed over
  sharp foregrounds. `BokehShader2` (example `webgl_postprocessing_dof2`) adds `fstop`, `focalLength`, rings/samples,
  `threshold`/`gain` highlights, `fringe`, pentagon shape [src uniforms].
- **Custom gather (what we have)**: Vogel disc, per-sample CoC test, separate near-field spill. Remaining issues of
  any single-layer gather: (1) nothing to show behind a blurred foreground edge (no background reconstruction);
  (2) fixed tap count undersamples large discs: 64 taps over a 32 px radius disc is one tap per 50 px^2
  [calc: pi * 32^2 / 64]; (3) highlights do not form crisp bokeh discs unless weighted by luminance.
- **Scatter-as-you-gather** (Jimenez 2014) [web: abstract]: gather, but weight each sample by whether ITS CoC covers
  the centre pixel and build an alpha for foreground layers; this is the reference design for real-time DOF and
  motion blur. Our DOF already has the first half.
- **Ground truth: lens accumulation** [sketch]. For aperture sample `(dx, dy)` (metres, on a disc of radius
  `R_ap`), translate the camera by `dx * right + dy * up` and shear the projection so the focus plane stays put:
  ```ts
  cam.position.addScaledVector(right, dx).addScaledVector(up, dy); cam.updateMatrixWorld();
  const P = cam.projectionMatrix.elements;            // after updateProjectionMatrix()/setViewOffset()
  P[8] += -P[0] * dx / focus;  P[9] += -P[5] * dy / focus;
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  ```
  Relation to our parameter: `R_ap = cInf_px * 2 * focus * tan(fov / 2) / heightPx` [calc: a point at infinity
  shifts by `(h/2) * dy / (focus * tan(fov/2))` pixels]. Everything (ink lines, transparency, cards, reflections)
  blurs correctly, including what is hidden behind foreground objects.
- **Hybrid.** Lens accumulation with N = 16 plus the existing gather at `maxBlur / sqrt(N)` to fuse ghost copies
  [unverified idea].

#### B6.3 Motion blur

- **Camera reprojection (what we have)**: reconstruct world position from depth, reproject with the previous
  view-projection, blur along the difference. Static-world only; wrong at depth edges (foreground smears into
  background and vice versa).
- **Velocity buffer + reconstruction filter** (McGuire et al. 2012): per-object velocities, tile-max / neighbour-max,
  depth-aware gather [unverified this session: the page returned no text]. three has a `VelocityShader.js` in addons
  [src: file exists] but no WebGL motion-blur pass; `webgpu_postprocessing_motion_blur` is WebGPU only [web].
- **Accumulation over the shutter** [sketch]: for sample i, evaluate the camera (and optionally the world) at
  `frame + (i + 0.5) / N * shutter - shutter / 2` and average. Correct for parallax, rotation, zoom, objects,
  shadows. With `camAt(frame, fps)` being pure, camera-only sub-frame sampling is free of side effects.
- **Parameters.** Shutter 0.5 (180 degrees) is the film default. N as in B5.4.
- **Pitfalls.** Character drawings posed "on twos" should NOT be re-posed per sub-sample (cost and style): blur the
  camera and rigid props only.

#### B6.4 Bloom done right

From the "physically based bloom" write-up of the Call of Duty: AW method [web], plus Jimenez's talk abstract [web]:

- **No threshold** in a physically motivated pipeline: bloom the whole HDR image and `mix(hdr, bloom, 0.04)` (useful
  range 0.03 to 0.15). Energy conserving: `mix`, not `add`.
- **Downsample** with the 13-tap filter: centre 0.125; four inner-diagonal 2x2 box centres 0.125 each (sum 0.5);
  four axis neighbours 0.0625 each; four far corners 0.03125 each.
- **Karis average on the first downsample only**: weight each 2x2 group by `1 / (1 + luma)` to stop one very bright
  sub-pixel from flickering ("fireflies"); it darkens bloom slightly.
- **Upsample** with a 3x3 tent (1-2-1 / 16), radius about 0.005 in UV, adding each level into the next; 5 to 6 mips.
- **Before tone mapping**, in linear HDR.
- **Dual Kawase / "dual filter"** (Bjorge, ARM, SIGGRAPH 2015) [web: search summary]: 5-tap downsample (centre x4 +
  4 diagonals) and 8-tap upsample at constant sampling distance; fewer fetches for the same blur. This is the family
  the engine's `DOWN` / `UP` shaders belong to.
- **three's `UnrealBloomPass`** [src]: `(resolution, strength = 1, radius, threshold)`, 5 mips, separable Gaussian
  kernels `[6, 10, 14, 18, 22]`, factors `[1.0, 0.8, 0.6, 0.4, 0.2]`, half-float targets, hard luminance high-pass.
- **Stylised use.** For toon looks a threshold at 1.0 with only emissives above 1 (the engine's toonworld rule) is the
  right art direction; the no-threshold mix suits the realistic looks.

### B7. Tone mapping and colour management

#### B7.1 Linear workflow in three.js

- Working space is Linear-sRGB; colour textures must be tagged `texture.colorSpace = SRGBColorSpace`; hex and CSS
  colours are converted from sRGB automatically; `Color.setRGB` components are linear by default; data textures
  (normal, roughness, AO) stay `NoColorSpace` [web: search summary of the manual and the r152 notes; the manual page
  itself returned 404 to my fetcher].
- When rendering to a render target, no output transform or tone mapping is applied; `OutputPass` (or our `FINAL`)
  must do tone mapping + OETF [web: forum summary; consistent with [src] `OutputShader.js`]. A `ShaderMaterial`
  only gets the output conversion if it includes `<colorspace_fragment>`; ours does not, so there is no double
  encoding.

#### B7.2 Tone mappers in r187 [src: `tonemapping_pars_fragment.glsl.js`]

| constant | behaviour | use |
|---|---|---|
| `NoToneMapping` | clamp | toon / flat looks with albedo-range values, exact brand colours |
| `ACESFilmicToneMapping` | RRT+ODT fit with `exposure / 0.6` pre-scale; strong contrast, desaturates and hue-shifts bright saturated colours | "cinematic", fire, neon |
| `AgXToneMapping` | Filament/Blender AgX: inset matrix, log2 encoding over -12.47..+4.03 EV, sigmoid, outset; no built-in "look" | realistic renders with strong coloured lights; gentle, slightly flat (add contrast in the grade) |
| `NeutralToneMapping` | Khronos PBR Neutral: `StartCompression = 0.8 - 0.04`, `Desaturation = 0.15`; identity below the knee | product-true colours, bright cartoon worlds |
| `Reinhard`, `Cineon`, `Linear`, `Custom` | legacy | - |

- Khronos spec goals [web]: base colours with channels between 0.08 and 0.8 are reproduced exactly (minus F90 =
  0.04), no hue shift, highlights compress toward white, analytically invertible, Rec.709 input assumed.
- For toon looks: `none` (or Neutral if emissives must roll off instead of clipping). ACES shifts painted hues; avoid.
- Exposure is a linear multiply BEFORE the tone map.

#### B7.3 Dithering and banding

- three's built-in `dithering: true` adds +-0.5/255-ish white noise per channel [src: `dithering_pars_fragment`].
- Best practice (Gjoel, "Banding in Games", GDC 2016 [unverified: the PDF could not be decoded here]; Peters's blue
  noise notes [web]):
  - Dither right before every quantisation, in the SAME space as the quantisation (sRGB-encoded values for an 8-bit
    sRGB output).
  - Triangular PDF, amplitude 1 LSB peak each side (sum of two uniforms minus 1), not uniform +-0.5: TPDF removes
    noise modulation with signal level.
  - Blue noise instead of white: no low-frequency energy, so the eye's own blur leaves a flat field; a tiled 64x64
    texture is enough, CC0 textures exist (16^2 to 1024^2, 1 to 4 channels) [web].
  - Animate the pattern per frame as an independent sample (different texture / offset), not as a slide of the same
    pattern.
- Dither does not survive lossy intermediates or delivery compression (B7.4). Grain of 1 percent or more does.

#### B7.4 Video encoding colour pitfalls

- **Matrix.** ffmpeg's swscale converts RGB to YUV with BT.601 unless told otherwise; the file must also be TAGGED
  BT.709 (primaries, transfer, matrix) [web: search summary of ffmpeg tickets and wiki]. Remotion: pass
  `colorSpace: "bt709"` (available since 4.0.28; "will become the default in Remotion 5.0") [web]. Our `render.mjs`
  already does.
- **Range.** yuv420p H.264 is limited range (16..235 luma): only 220 luma codes, so a gradient that was clean in
  8-bit RGB can band after encoding [calc]. Players that guess the range wrong give washed-out or crushed pictures;
  correct tagging prevents it.
- **Chroma.** 4:2:0 halves colour resolution: thin saturated lines (red on blue) smear by one pixel. Rendering at
  1440p or 4K is itself the mitigation.
- **Intermediates.** Remotion captures JPEG frames by default at quality 80; PNG is "slower" [web]. JPEG quantises
  8x8 blocks and typically subsamples chroma [unverified for Chrome's encoder at quality 95], which erases +-1 LSB
  dither before x264 ever sees it.
- **YouTube** [web]: H.264 High profile, progressive, 4:2:0, closed GOP of half the frame rate, 2 B-frames, CABAC,
  variable bitrate; YouTube expects BT.709 for SDR and re-tags unsupported colour metadata to BT.709.
- **Masters.** ProRes 422 HQ 10-bit (`yuv422p10le`) or H.265 10-bit keep gradients; let YouTube do the 8-bit step.

### B8. Atmosphere

#### B8.1 Fog models

- `Fog(color, near, far)`: linear. `FogExp2(color, density)`: `1 - exp(-(density * d)^2)` [unverified exact form].
  Both are applied per material in `fog_fragment`, AFTER our toon block, to every material with `fog: true`.
- **Height fog + sun tint** (Quilez, "better fog") [unverified: the page returned 404 to my fetcher; formula from
  memory]:
  ```glsl
  // density(y) = a * exp(-b * y); ro = camera position, rd = view ray, t = distance
  float fogAmount = (a / b) * exp(-ro.y * b) * (1.0 - exp(-t * rd.y * b)) / rd.y;
  float sunAmount = max(dot(rd, sunDir), 0.0);
  vec3  fogColor  = mix(vec3(0.5, 0.6, 0.7), vec3(1.0, 0.9, 0.7), pow(sunAmount, 8.0));
  col = mix(col, fogColor, clamp(fogAmount, 0.0, 1.0));
  ```
  Separate extinction and in-scattering colours per channel give the blue-distance / warm-sun look.
- **Where.** Doing fog as a POST pass from the depth buffer makes it uniform across every material (cards,
  ShaderMaterials, GLTF) and art-directable per look. It must come after ink (so distant lines fade) and before DOF.
- **Pitfalls.** Guard `rd.y` near 0. Transparent objects that do not write depth get the fog of what is behind them.

#### B8.2 Light shafts

- **Screen-space radial blur** (Mitchell, GPU Gems 3 ch. 13) [web]: render an occlusion image (bright sky / sun,
  black occluders), then per pixel step toward the sun's screen position:
  ```
  delta = (uv - sunUv) * Density / NUM_SAMPLES; color = src(uv); decay = 1
  repeat NUM_SAMPLES: uv -= delta; color += src(uv) * decay * Weight; decay *= Decay
  return color * Exposure
  ```
  Add the result to the scene. The chapter gives no numeric defaults [web]; common starting values are 64 to 100
  samples, Density 0.9, Weight 0.5 / N-scaled, Decay 0.95 to 0.97 [unverified]. Limits: sun must be on or near the
  screen; occluders crossing the frame edge flicker; shafts draw over foreground objects.
- **Shadow-map raymarch** (`three-good-godrays`, used by `webgl_postprocessing_godrays`) [web]: marches view rays and
  samples the light's shadow map; `raymarchSteps 60`, `density 1/128`, `maxDensity 0.5`, `edgeStrength 2`,
  `distanceAttenuation 2`, `blur true`. Needs pmndrs `postprocessing`; supports three `>= 0.125 < 0.188`; with
  `PCFShadowMap` it copies the depth each frame because of comparison sampling. Works when the sun is off screen.
- **Geometry cones and crossed cards** (what the engine has: `lightBeam()` for the lighthouse and the new
  `lightShafts({ from, dir, len, width, strength })` additive crossed quads): cheap, art-directed, camera-independent,
  but no occlusion (a character walking through a shaft does not cut it) and hard intersections with geometry unless
  softened by depth.

#### B8.3 Sky models

- **`Sky` addon** (Preetham) [src]: uniforms `turbidity 2`, `rayleigh 1`, `mieCoefficient 0.005`,
  `mieDirectionalG 0.8`, `sunPosition`, `showSunDisc 1`, and, in our version, a procedural cloud layer:
  `cloudScale 0.0002`, `cloudSpeed 0.00002`, `cloudCoverage 0.4`, `cloudDensity 0.4`, `cloudElevation 0.5`, `time`
  (uses a "sinless hash so every GPU produces the same clouds"). `sky.scale.setScalar(10000)`. r183 removed a legacy
  gamma step (look changed), r186 removed the `up` uniform [web]. Hide the sun disc when baking an environment map.
- **Gradient dome** (what we have): fully art-directable; add a sun disc + glow lobe (`pow(dot(v, sunDir), n)`), a
  horizon haze band and optional fbm clouds for depth.
- **`GroundedSkybox(map, height, radius)`** [src]: projects an HDRI onto a ground disc so objects sit IN the
  panorama. The Blender bridge note in engine.md ("a flat plane against an HDRI reads fake") is the same problem.

#### B8.4 Clouds

- Billboards (what we have), 2 to 3 parallax layers moving at different speeds.
- Layered fbm on the dome (the Sky addon's approach): coverage threshold + soft edge + horizon fade.
- Volumetric raymarch (`webgl_volume_cloud` example exists [web]): beautiful, slow, hard to stylise.
- For ink looks keep clouds flat with a cool underside (already done) and add a second darker contour layer.

### B9. Scale and detail

- **`InstancedMesh(geometry, material, count)`**: one draw call; `setMatrixAt`, `setColorAt`,
  `instanceMatrix.needsUpdate`, `computeBoundingSphere()` for correct culling [unverified API details, standard].
  Grass tufts, cobbles, crowd props, windows, fence pickets, leaves. Wind in the vertex shader via
  `instanceMatrix` + world phase. Examples: `webgl_instancing_scatter`, `webgl_instancing_performance` [web].
- **`BatchedMesh`** [unverified in r187]: many different geometries, one material, one draw call.
- **`LOD`** [src]: `lod.addLevel(object, distance, hysteresis)`; `autoUpdate`. Offline we rarely need it for speed;
  use it to REMOVE sub-pixel detail that would alias (far fences, tiles).
- **Texture filtering.** `texture.anisotropy = renderer.capabilities.getMaxAnisotropy()` (typically 16 on desktop
  GPUs) [src for the API; the value is hardware-dependent]; `LinearMipmapLinearFilter` + mipmaps on everything that
  recedes; sRGB tagging for colour maps. Ground planes at grazing angles are the test case.
- **Procedural detail.** World-space value / fbm noise for colour drift (the engine has `uDrift`), dirt at wall
  bases (height gradient), edge wear from vertex AO.
- **Triplanar mapping** (Golus, "Normal Mapping for a Triplanar Shader") [unverified this session]: sample a
  tiling texture along world X, Y, Z and blend by `pow(abs(normal), k)`; removes UV seams on procedural meshes and
  keeps texel density constant across the whole set.
- **Normal maps on toon materials.** Lambert supports `normalMap` and `bumpMap` [src]. A normal map moves the cel
  terminator and adds painted-looking breakup in the shade; keep the scale low (0.3 to 0.6) and the map
  low-frequency, otherwise the ramp turns it into noise. Our ink pass uses geometric normals from its own override
  material, so normal maps do not create ink lines (good).

### B10. Water and rain

- **Animated normals.** Two normal maps scrolling in different directions and scales, summed and renormalised; drives
  reflection distortion and specular glints. three: `Water` (`waterNormals`, `sunDirection`, `sunColor`,
  `waterColor`, `distortionScale`, `textureWidth/Height`, planar reflection) and `Water2` (`flowDirection`,
  `flowSpeed`, `reflectivity`, `scale`, `flowMap`, `normalMap0/1`, reflection + refraction) [src option names].
  Both drive time from a uniform we must set from the frame.
- **Ripples.** Ring function per drop: `sin(31 * (t - d)) * falloff` in a tiled cell with a hashed centre and phase;
  Lagarde blends up to 4 time-shifted layers by rain intensity and applies them only where water has accumulated
  [web].
- **Rain streaks.** Instanced camera-facing quads (or `LineSegments`) stretched along velocity:
  `length = fallSpeed * shutter / fps` (about 9 m/s x 1/60 s = 15 cm at 30 fps, 180 degrees) [calc]; low alpha,
  additive or alpha-blended, NOINK, depth-tested, nearer layers larger and faster. Position =
  `fract(seed + t * speed)` wrapped in a box around the camera (pure function of the frame).
- **Splashes.** Small ring / crown sprites at hashed ground positions; Lagarde's counts: 20 / 40 / 60 per intensity
  level [web].
- **Wet surfaces.** B3.5. Also darken only up-facing surfaces (`normal.y`), keep undersides of awnings dry.
- **Toon water.** Flat gradient + crest marks + glints (the engine has `toonWater`); add a faint planar reflection
  (10 to 25 percent) and a shoreline foam band from depth difference [unverified as style advice].

### B11. Performance and determinism in headless Chromium

1. **GPU selection.** Remotion 4 defaults to `gl: null`; for WebGL content on a desktop use `angle` (Windows:
   D3D11) [web]. "Memory leaks are a known problem with angle": split long renders into parts [web]. Our render.mjs
   already renders in chunks.
2. **Determinism rules** [web: remotion flickering doc]: same frame number = same image; no dependence on render
   order; no animation outside `useCurrentFrame()`; no randomness except seeded; wait for assets with `delayRender`.
3. **Shader-level determinism.** `sin`-based hashes differ between GPUs (three's Sky comment says so [src]); use
   integer or `fract`-multiply hashes. `fwidth`, MSAA sample positions and A2C dither are implementation-defined but
   stable on one machine. Do not mix machines or `--gl` backends inside one video.
4. **readPixels.** Without a pixel-pack buffer it forces "finish + round-trip"; `getError`, `getParameter`,
   `checkFramebufferStatus` can also stall for up to a frame [web: MDN]. Our render path does not read pixels
   (Remotion screenshots the canvas). If a pass ever needs CPU feedback (auto-focus, auto-exposure, audits), read a
   1x1 or 16x16 target, synchronously, once per frame: correctness matters more than the stall.
5. **`preserveDrawingBuffer: true` + `gl.finish()`** guarantee the screenshot sees the finished frame. Cost: one
   extra full-resolution copy per present [unverified magnitude]. `alpha: false` can be emulated at a cost on some
   platforms [web: MDN]; irrelevant on D3D11 [unverified].
6. **WebGL context limit.** Chrome caps active contexts per renderer process at 16 (or a cumulative pixel budget) and
   forcibly loses the oldest; a `--max-active-webgl-contexts` switch exists [web: Chromium code review and
   graphics-dev thread, 2013 and 2021; current value not re-verified]. `renderer.dispose()` does not free the
   context; `renderer.forceContextLoss()` does [src: both methods exist]. A long video that mounts a new Stage3D per
   scene can exhaust the limit inside one tab if garbage collection lags. A lost context produces black frames
   silently unless `webglcontextlost` is handled.
7. **Measure.** `performance.now()` around the draw + `gl.finish()` gives per-frame GPU-inclusive time; log the
   median per chunk. Without this split, sample counts are guesses.
8. **Shader compile stalls.** ANGLE translates GLSL to HLSL and compiles with the D3D compiler; loops containing
   gradient-based texture fetches force unrolling and very long compiles; explicit-LOD fetches (`textureLod`) avoid
   it [web: ANGLE / Mozilla threads 2011-2017; not re-verified for current ANGLE]. Our post shaders already use
   `textureLod` in their loops. Offline, a stall only costs time in the first frame of each tab; warm up inside the
   `delayRender` window with `await renderer.compileAsync(scene, camera)` (uses `KHR_parallel_shader_compile`)
   [src] if first-frame time matters.
9. **Canvas texture uploads.** `CanvasTexture.needsUpdate = true` uploads the whole canvas and regenerates mipmaps.
   DOM-source uploads can flush the pipeline; do them before drawing, not between passes [web: MDN]. Keep the
   existing pose-key cache; size card canvases to what the shot needs.
10. **Tabs versus GPU.** One GPU is shared by all tabs; the engine's own benchmark found concurrency 4 faster than 8.
    Heavier per-frame GPU work (accumulation) shifts the optimum lower: re-run `tools/bench.mjs` after any upgrade.
11. **VRAM.** Per tab at 1440x2560, approximately: MSAA x4 colour 118 MB + its resolve 29.5 MB + MSAA depth 59 MB,
    `worldRT` 44 MB, `A` + `B` 59 MB, mask + AO 29 MB, shadow map 4096^2 x 4 B = 67 MB, bloom chain about 10 MB,
    canvas buffers about 30 MB: roughly 450 MB [calc; driver overheads not included]. At 4K multiply the
    screen-sized part by 2.25.

---

## (C) What our engine already does versus gaps

Paths are under `engine\src\lib\`.

### C1. Already in place (and good)

| area | where | what |
|---|---|---|
| deterministic frame | `three/Stage3D.tsx` `drawRef.current` | world built once, `update(world, frame)` pure, synchronous draw in `useLayoutEffect`, `gl.finish()`, `preserveDrawingBuffer`, `delayRender` for assets |
| linear HDR pipeline | `three/post.ts` `PostPipeline` | half-float targets end to end, `NoToneMapping` on the renderer, tone map + sRGB OETF + grade in `FINAL` |
| geometric AA | `post.ts` constructor | `sceneRT` with `samples: 4` |
| ink | `INK_MASK`, `INK_COMP` | second difference of 1/z + normal creases, explicit-LOD loops, display-gamma blend, coloured lines (`ink.hue`, new) |
| AO (new, 1.6) | `AO`, `AO_COMP` | 16 cosine-weighted hemisphere samples on a Vogel spiral, IGN rotation, range check, distance-scaled radius, 4x4 box blur, `smoothstep(0.1, 0.7)` remap, TINT multiply (`look.ao.tint`, default "#6a5c9c"), world buffer only |
| DOF | `DOF` | thin-lens signed CoC, 64-tap Vogel gather with "sample reaches us" test, 32-tap near-field spill |
| motion blur | `MBLUR`, Stage3D `prevViewProj` | camera reprojection from depth, 14 taps, shutter fraction, skipped on cuts |
| bloom | `BRIGHT`, `DOWN`, `UP` | soft-knee threshold, 6-level dual-filter chain sized in `u` (resolution independent), halation |
| finish | `FINAL` | chromatic aberration, softness, exposure, tone map (none / ACES fit / Khronos Neutral, identical constants to three's [src] / "agxish"), 7-knot monotone curve, zone saturation, luma-neutral tints, vignette, grain, dither |
| lighting | `three/world.ts` `lights()` | warm key with shadows, hemisphere fill, ambient, linear fog, six presets |
| toon shading (`toon-v4`) | `three/shaders.ts` `TOON_FRAG_BODY` | split ramp: FORM `smoothstep(uRampLo, uRampHi, N.L)` x CAST `smoothstep(0.32, 0.68, sunVis)` (the cast edge no longer moves with surface angle), hue-keeping shade, replacement colour, rim, world-space drift, sky fill / ground bounce by normal.y, terminator band, and SECONDARY LIGHTS: `extra = directDiffuse - sunPart`, banded (`smoothstep(0.004, 0.035)`), capped at 0.5, x1.6 |
| patch system | `shaders.ts` `addPatch(m, key, fn)` | `onBeforeCompile` patches stack (wind + toon), cache key = joined patch keys |
| card shading (`vfcard-v4`) | `shaders.ts` `cardShade()` | cast-shadow tint via `smoothstep(0.32, 0.68, sunVis)`, side gradient, texture-space rim light toward the key |
| light shafts | `three/world.ts` `lightShafts()`, `lightBeam()` | additive crossed cards / cones, NOINK, strength animatable |
| textures | `three/textures.ts` `canvasTexture()` | sRGB tag, mipmaps, trilinear, anisotropy 8, cache by key |
| characters | `three/cast.ts` `CharacterCard` | sun-facing hidden shadow caster on `SHADOW_ONLY`, contact blob, pose-key cache before re-upload |
| encode | `tools/render.mjs` | `colorSpace: "bt709"`, JPEG quality 95 intermediates, CRF 14, chunked |

### C2. Gaps, specific

**Shadows** (`world.ts` `lights()`, `Stage3D.tsx`)

- G1. **Fixed shadow frustum.** `S = 40` gives an 80 m wide map: 80 / 4096 = **1.95 cm per texel** in every shot
  [calc]. In a vertical close-up (vfov 34 degrees, 6.8 m away, the example in engine.md) the frame is about 2.3 m
  wide over 1440 px = 1.6 mm per pixel, so **one shadow texel covers about 12 screen pixels** and the PCF disc of
  `radius = 3` spans roughly 70 px [calc]. Close-up shadows are therefore soft and low-resolution regardless of art
  intent; wide shots are fine.
- G2. **Bias is large in world terms.** `bias = -0.0004` with `near 1, far 220` = 0.0004 x 219 m = **8.8 cm** of
  depth offset [calc]. Because three renders back faces into the map for front-side materials [src], shadows begin
  about 9 cm (along the light) behind an occluder's far side: contact gaps under props, fence pickets (5 cm deep),
  lamp posts and feet. `normalBias = 0.03` (1.5 texels) is reasonable.
- G3. **5-tap dithered PCF under a cel ramp.** r187 PCF = 5 Vogel taps + IGN [src]; the cast ramp
  `smoothstep(0.32, 0.68, sunVis)` (toon and card shaders) re-sharpens it by roughly 3x. With 5 taps `sunVis` has few
  distinct levels per pixel before bilinear weighting, and the per-pixel rotation decides which side of the
  threshold a pixel falls on. Expect speckle or a ragged edge on cast shadows in close-ups
  [unverified: inspect a still at 400 percent]. The split ramp (new) fixed the edge POSITION; it does not fix this.
- G4. No contact hardening; no shadows from point lights (lamp pools); no cascades for deep vistas.
- G5. `Stage3D` applies `shadowMapSize` to EVERY shadow-casting directional light and renders the shadow map again
  for each `r.render` of the scene (twice in `dissolve()`); harmless but wasted.

**Ambient occlusion** (`post.ts` `AO`, `AO_COMP`)

- G6. The blur in `AO_COMP` is a plain 4x4 box: it is not depth-aware, so occlusion can leak a couple of pixels
  across silhouettes (onto cards and across depth edges). The `smoothstep(0.1, ...)` hides most of it.
- G7. AO multiplies the final colour everywhere, including sunlit surfaces; it is not weighted toward shade.
- G8. 16 samples with one fixed per-pixel rotation; cards neither receive nor cast AO (by design; the blob covers
  feet). Off-screen and hidden occluders are missed (inherent).

**Reflections / environment**

- G9. `scene.environment` is never set and there is no PMREM anywhere in `src/lib` (grep). Every
  `MeshStandardMaterial` (the `planet()` surface, all GLTF props loaded through `assets.ts` without `toon`) gets no
  image-based light: metals render near black and rough surfaces are lit only by sun + hemisphere.
- G10. No planar or screen-space reflections; `water()` is a Lambert plane with a scrolling texture and `toonWater`
  has no reflection term.
- G11. The toon patch overwrites `outgoingLight` after `envmap_fragment`, so an `envMap` on a toonified Lambert
  material would be ignored [src order + our patch].

**Global illumination**

- G12. **Secondary lights reach the world but not the characters.** `toon-v4` now adds non-sun direct light back
  (`extra`), which closes the gap I first found in the 10:03 version (lamps did nothing on toonified meshes).
  Remaining: (a) `cardShade()` still sets `outgoingLight = cardCol` from the sun term only, so a character standing
  in a lamp pool at night stays unlit while the ground under it glows; (b) the band, cap and gain of `extra` are
  literals (0.004 / 0.035, 0.5, 1.6), not `ToonUniforms`, so they cannot follow a lighting setup; (c) point lights
  cast no shadows, so pools pass through walls; (d) projects tuned lamp intensities while the term did not exist
  (for example 40 on the lighthouse): re-check their night stills.
- G13. No light probes or irradiance volume; bounce is the two constants `uSkyFill` / `uBounce`.

**Anti-aliasing**

- G14. **Alpha-tested edges are not anti-aliased.** `CharacterCard` uses `alphaTest: 0.5` without
  `alphaToCoverage`; same for `banner()` and `lattice()` in `world.ts`. MSAA does nothing for them. Characters are
  the subject of every shot.
- G15. No supersampling or accumulation; all post passes run at 1 sample; `worldRT` (ink + AO input) is not
  multisampled (softened by 3x3 / 4x4 blurs).
- G16. `samples: 4` is hard-coded; `maxSamples` is not queried.

**DOF / motion blur / bloom**

- G17. DOF tap count is fixed (64 + 32) while `maxCoC` can reach 24u = 32 px at 1440 (one tap per 50 px^2): large
  blurs show the spiral pattern [calc; visibility unverified]. No luminance-weighted bokeh.
- G18. Motion blur is camera-only, uses the post-DOF image and a single depth layer: moving props, walking crowds and
  vehicles are never blurred; foreground / background smear at depth edges during fast pans.
- G19. `DOWN` samples its four diagonals at a full source texel; the dual filter uses half-pixel offsets
  [unverified against the original slides], and there is no firefly guard on the first downsample, so a sub-pixel
  emissive bulb can make the glow shimmer during camera moves.

**Tone / colour / encode**

- G20. Dither is uniform white noise of +-0.5 LSB, and `h12(gl_FragCoord.xy + frame)` slides the same pattern
  diagonally one pixel per frame instead of drawing an independent pattern.
- G21. JPEG-95 intermediates sit between our dither and x264; whether sky gradients band in the delivered file is
  not measured.
- G22. `"agxish"` is a luminance Reinhard with a saturation tweak, not AgX; three's real AgX is 30 lines of GLSL.

**Atmosphere**

- G23. Fog is three's linear `Fog` applied per material: no height falloff, no sun tint, and `ShaderMaterial`s must
  opt in individually.
- G24. Sky is a 3-colour gradient: no sun disc or glow, no horizon haze, no procedural cloud layer. Light shafts
  exist only as geometry (`lightShafts()`, `lightBeam()`, an FX sprite): nothing occludes them and they have no
  soft-particle fade where they cut through walls or the ground.

**Scale / detail**

- G25. No `InstancedMesh` in `src/lib` (grep): `fence()` builds one mesh per picket, `scatter()` returns positions
  for individual groups. Fine for speed today, but it caps how much set dressing (grass, cobbles, leaves, windows)
  a scene can carry, and the measured "edge density" gap is a detail-count problem.
- G26. Anisotropy fixed at 8; no normal / bump maps; no triplanar.

**Water / rain**

- G27. No rain system, no wetness, no ripples.

**Robustness**

- G28. Stage3D cleanup calls `renderer.dispose()` but not `forceContextLoss()`, and there is no
  `webglcontextlost` handler: a lost context would yield black frames without an error.
- G29. No per-frame GPU timing in the render report.

---

## (D) The most valuable upgrades for our engine, ranked by visual gain per effort

Effort: S = under an hour, M = half a day, L = one to two days. All code is [sketch].

### D1. Alpha-to-coverage on every cut-out (S, high gain)

- **Why.** G14: the characters' silhouettes are the most-watched edges and currently the only hard-aliased ones.
- **Change.** `three/cast.ts` constructor: `new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, alphaToCoverage: true,
  side: DoubleSide })`. Same in `world.ts` `banner()` and `lattice()`, and in `fx.ts` for any alpha-tested sprite.
- **Check.** One close-up still before / after at 400 percent. If edges look unchanged, A2C is not active on the MSAA
  render target on this driver: fall back to D3 (accumulation anti-aliases cut-outs too).
- **Risk.** Slightly thinner or fatter silhouettes (the threshold becomes a 1-pixel ramp). Distant cards may thin
  out because mipmapped alpha averages down; if so raise coverage with `alphaTest: 0.4` for crowd tiers.

### D2. Fit the shadow frustum to the shot, fix bias (M, high gain)

- **Why.** G1 + G2: 12 px per texel in close-ups and a 9 cm contact gap.
- **Change.** New helper in `three/world.ts`, called from `Stage3D.tsx` right after the camera is posed (before
  `it.post.render`):
  ```ts
  export function fitSunToView(sun: THREE.DirectionalLight, cam: THREE.PerspectiveCamera, o: { far: number; casterRange?: number }) {
    // 1. 8 corners of the view frustum cut at o.far (unproject NDC corners at near, lerp to o.far along each edge)
    // 2. bounding sphere of the corners -> centre c, radius r (stable under rotation)
    // 3. light basis: z = direction to sun (sun.position - sun.target, normalised), x, y orthogonal
    // 4. snap c in light space to multiples of texel = 2r / mapSize
    // 5. camera left/right/top/bottom = -r..r, near = 1, far = 2 * casterRange; position = c + z * casterRange
    // 6. sun.shadow.normalBias = 1.5 * texel; sun.shadow.bias = -0.00003;
  }
  ```
  Call with `far = clamp(4 * cam.focus, 15, 120)`; keep `lights({ shadowSize })` as the fallback when no camera is
  given. `CharacterCard.place()` reads only the direction `sun.position - sun.target.position` (cast.ts), so cards are
  unaffected as long as the fit derives its direction from that same difference BEFORE moving the light (projects
  animate `sun.position` for lighting changes; the fit must preserve the direction they set).
- **Also.** In `lights()` set `bias` to about -0.00005 and shrink `far` to the scene (the fit does it per frame).
  In `PostPipeline.dissolve()` set `shadowMap.autoUpdate = false` for the second render only if both cameras share
  the fit; otherwise leave it (each view gets its own fit).
- **Check.** A close-up of feet / a fence base (contact gap gone), a wide shot (no acne on roofs at grazing sun), and
  a slow push (no crawling edges).
- **Risk.** Acne on `DoubleSide` thin geometry (awnings, banners) once bias is small: raise `normalBias` for those
  or set `material.shadowSide = THREE.FrontSide/BackSide` explicitly.

### D3. Sub-frame accumulation: AA + soft sun + true camera motion blur (L, highest gain)

- **Why.** One mechanism removes G3, G4 (contact hardening), G15, G18 (camera part) and the reprojection artefacts,
  and anti-aliases everything MSAA cannot (cut-outs, cel-ramp edges, ink, AO noise).
- **Design.** Add `look.samples` (default 1 = today's path; 8 for finals) and `look.sunSize` (degrees, default 0.5).
  In `PostPipeline.render()` wrap "scene -> world pass -> AO -> ink" in a loop and add each result into a new
  half-float `accRT`; then run DOF, bloom and FINAL once on `accRT`.
  ```ts
  for (let i = 0; i < N; i++) {
    opts.subframe?.(i, N);                                   // Stage3D: re-pose camera at frame + ((i + .5) / N - .5) * shutter, jitter the sun
    cam.setViewOffset(w, h, halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5, w, h);
    // ... existing: render sceneRT, worldRT, AO, ink -> src
    r.autoClear = false;                                     // IMPORTANT: PostPipeline.pass() relies on autoClear; accumulation must not clear
    r.setRenderTarget(this.accRT); if (i === 0) r.clear(true, false, false);
    this.mats.acc.uniforms.t.value = src; this.mats.acc.uniforms.k.value = 1 / N;   // additive: CustomBlending, One, One
    this.quad.material = this.mats.acc; r.render(this.fsScene, this.fsCam);
    r.autoClear = true;
  }
  cam.clearViewOffset();
  ```
  `Stage3D.tsx` supplies `subframe(i, N)`: `applyCam(c, camAt(frame + dt, fps))` when `camAt` exists and the frame is
  not a cut, and the sun jitter of B1.7 around the direction that `fitSunToView` produced.
- **Depth for DOF.** Keep the depth of the LAST sub-sample (or render sample 0 unjittered) as `tDepth` for the DOF
  pass; depth edges are then 1-sample while colour is N-sample, which is what the current pipeline has anyway.
- **Motion blur.** With camera time-jitter, set the `MBLUR` pass shutter to `look.motionBlur / N` and run it per
  sub-sample before accumulation (fuses the N copies on fast whips), or drop it for N >= 16.
- **MSAA.** Keep `samples: 4` at N <= 8; consider 0 at N >= 16 (saves about 180 MB per tab [calc]).
- **Cost.** N x (shadow map + scene + world normal pass + AO + ink mask). Unknown until measured; budget principle
  A2 allows about 3x today's frame time. Add the timing of B11.7 first.
- **Risk.** (1) Stepped penumbrae under the cel ramp (raise N or lower `sunSize`). (2) Ink line weight changes
  slightly because lines are averaged over sub-pixel offsets: they become smoother and about 0.5 px softer; retune
  `ink.widthNear` by +5 to 10 percent if needed. (3) Anything in `update()` that is not pure in fractional frames;
  the camera-only variant avoids this. (4) The `dissolve()` path must loop too.

### D4. Lamp light on characters, and art-directable secondary lights (S to M, high gain for night scenes)

- **Why.** G12. `toon-v4` already lights the WORLD with non-sun lights; the characters (the subject) still ignore
  them, and the pool's band / cap / gain are literals.
- **Change 1, cards.** `three/shaders.ts` `cardShade()` patch, before `outgoingLight = cardCol;`. A billboard has no
  meaningful normal, so use distance attenuation only (no N.L):
  ```glsl
  #if NUM_POINT_LIGHTS > 0
    vec3 lamp = vec3(0.0); vec3 vp = -vViewPosition;                                  // view-space position
    for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
      float d = length(pointLights[i].position - vp);
      lamp += pointLights[i].color * getDistanceAttenuation(d, pointLights[i].distance, pointLights[i].decay);
    }
    float lL = dot(lamp, vec3(0.2126, 0.7152, 0.0722)) * RECIPROCAL_PI;
    cardCol += diffuseColor.rgb * (lamp * RECIPROCAL_PI) * smoothstep(0.004, 0.035, lL) * min(1.0, 0.5 / max(lL, 1e-4)) * uLampGain;
  #endif
  ```
  `pointLights[]` and `getDistanceAttenuation()` come from `lights_pars_begin` [src: the function exists; the loop
  over the uniform array is untested]. Add `uLampGain` (about 1.2) to `CARD_U`; bump the patch key to `vfcard-v5`.
  Use the same band and cap as the world so a character and the ground under it agree.
- **Change 2, uniforms.** Promote the literals in `TOON_FRAG_BODY` (`0.004`, `0.035`, `0.5`, `1.6`) to
  `uExtraLo`, `uExtraHi`, `uExtraMax`, `uExtraGain` in `ToonUniforms` / `ToonSetup` so night can have strong warm
  pools and day almost none; patch key `toon-v5`.
- **Optional.** Shadows for ONE hero lamp per scene: `PointLight.castShadow = true` with `shadow.mapSize 1024`
  (6 cube faces per frame). three's point-light PCF uses `samplerCubeShadow` in r187 [src]; the toon shader already
  receives it through `directDiffuse`.
- **Check.** Night street still: a character under a lamp versus 4 m away; lamp intensity 0 versus on.
- **Risk.** Old projects tuned lamp intensities when lamps had no effect; expect to retune. A card far in front of a
  lamp is lit as if facing it (no N.L); acceptable for flat drawings.

### D5. Image-based light for non-toon materials (S to M, high gain for realistic3d looks)

- **Why.** G9: GLTF props and `MeshStandardMaterial` have no environment.
- **Change.** `three/world.ts` new `environment(ctx, preset | hdrUrl)`:
  ```ts
  const pmrem = new THREE.PMREMGenerator(ctx.renderer);
  const skyScene = new THREE.Scene(); skyFor(skyScene, preset);            // our gradient dome (+ an emissive sun disc mesh)
  ctx.scene.environment = pmrem.fromScene(skyScene, 0.03, 1, 2000).texture;
  ctx.scene.environmentIntensity = 0.7; pmrem.dispose();
  ```
  or `new HDRLoader().load(staticFile(...))` -> `pmrem.fromEquirectangular(tex)` inside `ctx.wait(...)` for Poly
  Haven HDRIs. Toonified materials ignore it (G11), which is what we want.
- **Risk.** Double-counting with `HemisphereLight` on Standard materials: lower `hemiI` for realistic looks.
  r187's PMREM rewrite changed appearance slightly versus older references [web].

### D6. Shade-weighted, edge-aware AO (S, medium gain)

- **Why.** G6, G7.
- **Change.** `post.ts` `AO_COMP`: (1) make the 4x4 blur bilateral with the world depth
  (`w = step(abs(z_i - z_c), 0.05 * z_c)`), binding `worldRT.depthTexture`; (2) weight by scene luminance so lit
  areas keep only the tight contact band:
  `float k = a * strength * mix(1.0, 0.45, smoothstep(0.25, 0.7, luma(c.rgb)));`. With D3, rotate the AO spiral per
  sub-sample (`rot += float(i) * 2.399`) and reduce the blur to 2x2.
- **Risk.** None structural; retune `look.ao.strength`.

### D7. Post fog with height falloff and sun tint (M, medium to high gain for depth)

- **Why.** G23: depth separation is the cheapest "premium" cue in wide shots, and per-material fog cannot be
  art-directed per shot.
- **Change.** New `FOG` pass in `post.ts` between ink and DOF, using `sceneRT.depthTexture`, `uInvProj`, `uInvView`
  (already computed for `MBLUR`), camera position, `sunDir`; formula B8.1. New `look.fog = { enabled, density,
  heightFalloff, base, color, sunColor, sunPower, max }`. Skip pixels with depth = 1 (sky) or apply a horizon-only
  haze there. Set `scene.fog = null` in `lights()` when the look uses post fog.
- **Risk.** Emissive lamps in fog lose punch: apply fog before bloom (it is) and cap `max` at about 0.85.
  Transparent FX sprites that do not write depth get the background's fog.

### D8. Dither and intermediate-format hygiene (S, medium gain on skies and studio gradients)

- **Why.** G20, G21.
- **Change.** `post.ts` `FINAL` last lines:
  ```glsl
  vec2 dp = gl_FragCoord.xy + vec2(frame * 37.0, frame * 91.0);                 // independent pattern per frame
  float tri = h12(dp) + h12(dp + 19.19) - 1.0;                                   // triangular, +-1 LSB peak
  v += tri / 255.0;
  ```
  Better: bind a 64x64 CC0 blue-noise texture (RepeatWrapping, NearestFilter), offset per frame by a hash of the
  frame, remap to triangular.
- **Measure.** Render one sky-heavy 3 s clip three ways (JPEG 95, PNG, PNG + grain 0.01), encode as usual, and run
  the analyzer's banding metric (a `band_test.py` already sits in the scratchpad `research` folder, not mine). If
  JPEG shows more banding, make `--image-format png` the default for finals and accept the slower capture.
- **Risk.** Bigger files with stronger dither; negligible at +-1 LSB.

### D9. Planar reflection for water and wet streets (M, high gain in the scenes that have them)

- **Why.** G10, G27 (the wet half).
- **Change.** `three/world.ts` `reflectivePlane(w, h, { strength, roughness, puddles, tint })` built on `Reflector`
  with a custom `shader` (Schlick Fresnel from F0 0.02, 9-tap Vogel blur scaled by roughness, ripple normal offset
  from two scrolling noise fields driven by a `uTime` we set from the frame, fbm puddle mask). `textureWidth/Height`
  = stage size / 2. Guard the reflection render during the world normal pass:
  ```ts
  const orig = refl.onBeforeRender;
  refl.onBeforeRender = function (r, s, c, ...rest) { if (s.overrideMaterial) return; orig.call(this, r, s, c, ...rest); };
  ```
  Put the plane on the normal layer (it should get ink at its border) and make sure the first main render happens
  with the full layer mask so the cloned reflection camera sees NOINK objects (it does: `cam.layers.enableAll()`
  precedes the first render).
- **Cost.** +1 scene render per frame (x N with D3).
- **Risk.** The reflector's own material is a `ShaderMaterial`: `toonifyScene` skips it, so do the colour treatment
  in its shader.

### D10. Better sky: sun glow, horizon haze, procedural cloud layer (S to M, medium gain)

- **Why.** G24; sky fills 20 to 50 percent of many frames.
- **Change.** `world.ts` `sky()` fragment shader: add `uSunDir`, a glow lobe
  `pow(max(dot(vP, uSunDir), 0.0), 64.0) * discGain + pow(..., 6.0) * hazeGain`, a horizon band
  `exp(-abs(h) * 9.0)` tinted toward the fog colour, and an optional fbm cloud layer projected on a plane
  (`uv = vP.xz / max(vP.y, 0.05)`), thresholded with a soft edge, scrolled by a frame-driven uniform. Use a sinless
  hash. For realistic looks offer `Sky` from addons with its cloud uniforms.
- **Risk.** A bright sun disc above 1.0 will bloom: intended in golden hour, cap it for day.

### D11. Screen-space light shafts (M, medium gain, scene-dependent)

- **Why.** G24; golden-hour and interior window shots. The new `lightShafts()` cards cover placed, camera-independent
  beams; this pass is the complement for "sun in frame behind trees / roofs", where occluders must cut the rays.
  Cheaper first step: give `lightShafts()` and `lightBeam()` a soft-particle fade against `sceneRT` depth so they stop
  showing a hard line where they meet walls and ground.
- **Change.** `post.ts` `SHAFTS` pass after fog, before DOF: occlusion source = `depth == 1.0 ? skyColor : 0`
  (plus emissives), 64 to 96 samples toward `sunUv` (project the sun direction with the camera matrices; fade out
  when the sun is more than about 20 percent outside the frame), parameters `density`, `decay`, `weight`,
  `exposure`; composite additively with a tint. Jitter the start offset per pixel with IGN to hide banding.
- **Risk.** Limits listed in B8.2; keep strength low and treat it as a lens effect.

### D12. Bloom polish: firefly guard and correct dual-filter taps (S, low to medium gain)

- **Why.** G19.
- **Change.** `post.ts`: in `BRIGHT` (it is the first downsample) take 4 bilinear taps at +-0.5 source texels and
  weight each by `1 / (1 + max3(c))` (Karis average); in `DOWN` use half-texel diagonal offsets
  (`vec2(+-0.5, +-0.5) * texel` of the SOURCE) [check against the ARM slides before changing]. Optional: a
  no-threshold "veil" mode `mix(scene, bloom, 0.04)` for the realistic looks.
- **Risk.** Slightly dimmer glow; raise `bloom.strength` by about 10 percent.

### D13. Instanced set dressing (M, medium gain via detail density)

- **Why.** G25 and the measured edge-density gap (4.9 to 6.6 percent versus 8.7 percent in the reference).
- **Change.** `world.ts` `instanced(geometry, material, placements)` helper (one `InstancedMesh`, per-instance colour
  via `setColorAt`, `castShadow`/`receiveShadow`, `computeBoundingSphere()`), then `grassTufts()`, `cobbleField()`,
  `leafLitter()`, `windowRow()` on top of it; make `fence()` instanced. Toonify works on the shared material
  (instancing chunks are standard). Wind: reuse `windSway` on the instanced material.
- **Risk.** Ink on thousands of tiny instances turns into noise: put grass and litter on NOINK, keep ink for
  architecture and props.

### D14. Robustness and measurement (S, no visual gain, protects every render)

- **Change.** `Stage3D.tsx` cleanup: `post.dispose(); renderer.dispose(); renderer.forceContextLoss();`. On mount:
  `canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); cancelRender(new Error("WebGL context lost at frame " + frame)); })`
  (`cancelRender` from remotion). Log `performance.now()` around `drawRef.current()` (which already ends in
  `gl.finish()`) every 30th frame as `[video-forge][gpu-ms]` and have `render.mjs` write the median to
  `render_report.json`. Query `renderer.capabilities.maxSamples` and log it once.
- **Why first in practice.** D3's sample count, D2's map size and the concurrency setting all need this number.

### Suggested order

D14 (measure) -> D1 -> D2 -> D8 -> D6 -> D4 -> D3 -> D5 -> D7 -> D10 -> D9 -> D12 -> D11 -> D13.
D1 + D2 + D8 are an afternoon and fix the three cheapest-looking pixels (card edges, close-up shadows, gradients).
D3 is the step change, but only once D14 says what it costs.

### What I would NOT do

- three's `SSAOPass` / `SAOPass` / `GTAOPass` / `SSRPass` / `BokehPass` / `UnrealBloomPass` as drop-ins: each
  brings its own G-buffer renders, override materials and pipeline assumptions, and our own passes already cover
  them with layer-aware, resolution-independent versions.
- `SunLight` or the `CSM` addon now: both invalidate `sunVisChunk()` and the card shader for a problem that D2
  solves for our set sizes.
- Any temporal accumulation (TAA history, N8AO `accumulate`, progressive lightmaps over frames).
- Path tracing in the browser: the maintained path tracer is WebGPU and PBR-only [web].

---

## (E) Sources

### Local source (three.js 0.187.0 as installed; highest confidence)

Root: `engine\node_modules\three\`

| file | supports |
|---|---|
| `src/constants.js` | shadow map types (PCFSoft deprecated), tone mapping constants |
| `src/renderers/webgl/WebGLShadowMap.js` | PCFSoft -> PCF warning, VSM blur uniforms, back-face `shadowSide` map, VSM not for point lights |
| `src/renderers/shaders/ShaderChunk/shadowmap_pars_fragment.glsl.js` | 5-tap Vogel + IGN PCF with `sampler2DShadow`, VSM Chebyshev, SunLight cascades |
| `src/renderers/shaders/ShaderLib/vsm.glsl.js` | VSM blur |
| `src/lights/LightShadow.js` | defaults: bias, normalBias, radius, blurSamples, mapSize |
| `examples/jsm/lights/SunLight.js`, `SunLightShadow.js` | built-in 2-cascade sun light |
| `examples/jsm/csm/CSM.js` | CSM addon options and defaults |
| `examples/jsm/postprocessing/GTAOPass.js`, `shaders/GTAOShader.js` | GTAO parameters, `setGBuffer`, `NORMAL_VECTOR_TYPE` |
| `examples/jsm/postprocessing/SSAOPass.js`, `SAOPass.js`, `SSRPass.js`, `shaders/SSRShader.js` | defaults |
| `examples/jsm/postprocessing/SSAARenderPass.js`, `TAARenderPass.js` | jitter tables, `setViewOffset` use, weights |
| `examples/jsm/postprocessing/BokehPass.js`, `shaders/BokehShader2.js`, `UnrealBloomPass.js` | parameters |
| `examples/jsm/objects/Reflector.js`, `Sky.js`, `Water.js`, `Water2.js`, `GroundedSkybox.js` | options, Sky cloud uniforms |
| `src/extras/PMREMGenerator.js`, `examples/jsm/environments/RoomEnvironment.js` | PMREM API |
| `examples/jsm/lighting/LightProbeGridWebGL.js`, `LightMapper.js`, `misc/ProgressiveLightMap.js`, `lights/LightProbeGenerator.js` | GI helpers and their renderer support |
| `src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js`, `dithering_pars_fragment.glsl.js`, `alphatest_fragment.glsl.js` | tone mappers, dither, alpha-to-coverage |
| `src/renderers/shaders/ShaderLib/meshlambert.glsl.js`, `src/materials/MeshLambertMaterial.js` | chunk order (envmap before opaque), supported maps |
| `src/renderers/WebGLRenderer.js`, `webgl/WebGLCapabilities.js`, `webgl/WebGLState.js`, `src/objects/LOD.js` | `compileAsync`, `forceContextLoss`, `maxSamples`, A2C state, `addLevel` |

### Web pages fetched this session

| URL | supports |
|---|---|
| https://github.com/mrdoob/three.js/wiki/Migration-Guide | r180-r188 notes: PCFSoft deprecated (r182), RoomEnvironment and Sky changes (r183), GTAONode changes, LightProbeGrid rename and Sky `up` removal (r186), PMREM cube targets (r187) |
| https://threejs.org/examples/files.json | which official examples exist (`webgl_lights_sunlight`, `webgl_shadowmap_csm`, `_pcss`, `_progressive`, `webgl_shadow_contact`, `webgl_lightprobes*`, `webgl_postprocessing_gtao/ssaa/taa/ssr/godrays`, `webgl_volume_cloud`, instancing examples) |
| https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgl_shadowmap_pcss.html | PCSS via chunk patch on `BasicShadowMap`, constants |
| https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgl_shadow_contact.html | contact-shadow construction and numbers |
| https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgl_lights_sunlight.html | SunLight usage (mapSize 2048, normalBias 0.05, far 1000) |
| https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgl_lightprobes.html | `LightProbeGridWebGL` usage and bake options |
| https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/webgl_postprocessing_godrays.html | example uses `three-good-godrays` 0.12.0 + pmndrs postprocessing |
| https://github.com/Ameobea/three-good-godrays | shadow-map raymarched god rays: parameters, three version range, PCF caveat |
| https://github.com/N8python/n8ao | N8AO API, quality presets, tint advice, accumulation caveats |
| https://github.com/gkjohnson/three-gpu-pathtracer | current project is WebGPU (`WebGPUPathTracer`), PBR materials only |
| https://drei.docs.pmnd.rs/staging/accumulative-shadows | accumulated jittered-light shadows: props and defaults |
| https://learnopengl.com/Guest-Articles/2022/Phys.-Based-Bloom | 13-tap downsample weights, tent upsample, Karis average, no threshold, mix 0.04 |
| https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/ | Jimenez 2014 abstract: scatter-as-you-gather DOF / motion blur, pyramidal bloom, IGN shadow sampling; slide link |
| https://advances.realtimerendering.com/s2014/index.html | course listing: Jimenez talk, Karis "High-Quality Temporal Supersampling" |
| https://github.com/KhronosGroup/ToneMapping/blob/main/PBR_Neutral/README.md | PBR Neutral design goals and constants |
| https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process | radial-blur light shafts: algorithm, parameters, limitations |
| https://seblagarde.wordpress.com/2013/01/03/water-drop-2b-dynamic-rain-and-its-effects/ | wet-surface numbers, puddles, ripples, splash counts |
| http://momentsingraphics.de/BlueNoise.html | CC0 blue-noise textures, dithering advice (triangular remap, same colour space) |
| https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices | blocking calls, readPixels, context loss, shader compile, texture uploads, `alpha: false` |
| https://www.remotion.dev/docs/gl-options | `--gl` values, defaults, ANGLE memory-leak warning |
| https://www.remotion.dev/docs/three | three.js needs `gl: angle`; config file does not apply to SSR APIs |
| https://www.remotion.dev/docs/gpu | what content is GPU-accelerated; headless disables GPU by default |
| https://www.remotion.dev/docs/quality | JPEG default quality 80, PNG slower, bt709 advice, CRF |
| https://www.remotion.dev/docs/renderer/render-media | option list and version notes (`colorSpace` since 4.0.28, etc.) |
| https://www.remotion.dev/docs/cli/render | `--scale` up to 16, `--jpeg-quality` |
| https://www.remotion.dev/docs/flickering | determinism rules for multi-tab rendering |

### Found by search, summaries only (medium confidence)

| URL | supports |
|---|---|
| https://www.activision.com/cdn/research/Practical_Real_Time_Strategies_for_Accurate_Indirect_Occlusion_NEW%20VERSION_COLOR.pdf and https://www.iryoku.com/downloads/Practical-Realtime-Strategies-for-Accurate-Indirect-Occlusion.pdf | GTAO paper (Jimenez, Wu, Pesce, Jarabo) |
| https://github.com/GameTechDev/XeGTAO | open GTAO implementation with spatial-only denoise |
| https://codereview.chromium.org/14217005/ and https://groups.google.com/a/chromium.org/g/graphics-dev/c/fmNedEEAYpA | 16 active WebGL contexts per renderer process; `max-active-webgl-contexts` switch |
| https://community.arm.com/cfs-file/__key/communityserver-blogs-components-weblogfiles/00-00-00-20-66/siggraph2015_2D00_mmg_2D00_marius_2D00_notes.pdf | dual (Kawase-derived) filter, Bjorge 2015 |
| https://www.microsoft.com/en-us/research/publication/the-accumulation-buffer-hardware-support-for-high-quality-rendering/ | Haeberli and Akeley 1990: accumulation for AA, motion blur, DOF, soft shadows |
| https://support.google.com/youtube/answer/1722171 | YouTube upload encoding recommendations |
| https://trac.ffmpeg.org/wiki/colorspace and https://trac.ffmpeg.org/ticket/979 | swscale BT.601 default, tagging, `accurate_rnd` |
| https://groups.google.com/g/angleproject/c/0zfeMdGzzyQ and https://bugzilla.mozilla.org/show_bug.cgi?id=785848 | ANGLE / HLSL loop unrolling with gradient texture fetches (2011-2017) |
| https://discourse.threejs.org/t/shadow-pixelation-issue-in-three-js-0-182-0/88746 | reports of shadow changes after r182 |
| https://threejs.org/manual/en/color-management and https://discourse.threejs.org/t/updates-to-color-management-in-three-js-r152/50791 | colour management rules (manual page itself returned 404 to my fetcher) |

### Cited from memory, NOT fetched this session (lowest confidence; verify before relying on details)

| reference | used for |
|---|---|
| https://iquilezles.org/articles/fog/ (returned 404 to my fetcher) | height fog and sun-tinted fog formulas |
| https://loopit.dk/banding_in_games.pdf (PDF could not be decoded) | Gjoel, banding and TPDF dither |
| https://bgolus.medium.com/anti-aliased-alpha-test-the-esoteric-alpha-to-coverage-8b177335ae4f (HTTP 403) | alpha-to-coverage sharpening and mip coverage fix |
| https://casual-effects.com/research/McGuire2012Blur/index.html (empty response) | reconstruction-filter motion blur |
| Fernando, "Percentage-Closer Soft Shadows", NVIDIA 2005 | PCSS |
| Karis, "High Quality Temporal Supersampling", SIGGRAPH 2014 slides | Halton jitter, HDR resolve weighting |
| Golus, "Normal Mapping for a Triplanar Shader" | triplanar mapping |
| Narkowicz, "ACES Filmic Tone Mapping Curve" | origin of the fit used in our `aces()` |
| Donnelly and Lauritzen, "Variance Shadow Maps", 2006; Bavoil et al., HBAO, 2008; McGuire et al., SAO, 2012 | background for B1, B2 |
