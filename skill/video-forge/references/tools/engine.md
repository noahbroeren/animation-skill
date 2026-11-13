# Engine reference (Remotion 4 + three.js r187, TypeScript)

`SKILL/engine` is a Remotion project. Run `npm install` once (it installs remotion, @remotion/{cli,renderer,bundler}, react 19 and three). Chrome Headless Shell downloads on the first render.

```
engine/
  src/Root.tsx                 registers every project as a Composition (format/fps from input props)
  src/projects/index.ts        registry: add your project here (new-project.mjs does it for you)
  src/projects/<id>/index.tsx  a production
  src/lib/
    formats.ts   FORMATS (short, long, short4k, long4k, square, preview-*), unit(), SAFE zones
    time.ts      clamp/lerp/remap, ease.*, bezier(), tween(), springAt(), ring(), monotone(), rng(), noise1/fbm1, follow()
    camera.ts    cameraRig(keys, {glide, creep, handheld, kicks}) -> rig.at(frame, fps)
    look.ts      Look type, LOOKS presets, resolveLook(name, overrides), lookFromSuggestion(vfa json)
    timeline.tsx SceneDef, Timeline, plan(), transitions
    project.tsx  ProjectDef, ProjectView, metadataFor()
    three/       Stage3D, PostPipeline (ink/DOF/bloom/grade/grain), world kit, textures, CharacterCard
    characters/  toon.ts: parametric 2D characters + blink/mouth/walk/idle helpers
    two/text.tsx Captions, KineticTitle, LowerThird, ChapterCard, Counter, BarChart, FilmOverlay, GradientBg
  tools/render.mjs        stills / chunked resumable renders / audio mux / timeline.json
  tools/new-project.mjs   scaffold
```

## Map by subsystem

The sections below were written release by release; this table finds the current state of each subsystem. The newest
section about a subsystem wins where two disagree. The measured targets behind the defaults are in `references/craft/`.

| subsystem | files | sections here | craft sheet |
|---|---|---|---|
| formats, projects, timeline | `formats.ts`, `project.tsx`, `timeline.tsx` | Formats, ProjectDef / SceneDef / Timeline | - |
| storyboard | `board.tsx`, `tools/make.mjs` | Added in 1.7, 1.8, 1.9; and `references/pipeline/board.md` | `edit.md`, `script.md` |
| camera, shots, joins | `camera.ts`, `shots.ts`, `three/Stage3D.tsx` | Camera rig, Added in 1.7, 1.9 | `camera.md`, `edit.md` |
| characters | `characters/kinds.ts`, `characters/toon.ts`, `three/cast.ts`; modules `characters/hair.ts`, `faces.ts`, `wardrobe.ts` (hooks typed in `kit.ts`); our cast `characters/ours.ts` | Characters, Added in 1.4, 1.8, 1.9, 1.10 | `characters.md`, `character-design.md`, `acting.md`, `references/cast/ours-v1.md` |
| shading, light, look, post | `three/shaders.ts`, `three/lightplan.ts`, `three/world.ts`, `look.ts`, `three/post.ts` | Looks and post, Added in 1.1, 1.6, 1.8.1, 1.9 | `shading.md`, `lighting.md`, `grade.md`, `ink.md`, `depth.md` |
| world, sets, textures | `three/sets.ts`, `three/world.ts`, `three/textures.ts` | World kit, Added in 1.5, 1.7, 1.8 | `textures.md` |
| effects, weather, vehicles | `three/fx.ts`, `three/weather.ts`, `three/vehicles.ts` | Added in 1.2, 1.7 | `effects.md` |
| 2D, captions | `two/text.tsx` | 2D, typography and motion graphics, Added in 1.9 | `captions.md` |
| render, tools | `tools/*.mjs` | Rendering, Troubleshooting | - |

## Formats (all finals render NATIVELY; nothing is upscaled)

| id | size | use |
|---|---|---|
| `short` | 1440x2560 | Shorts / TikTok / Reels (2K vertical) |
| `long` | 2560x1440 | YouTube 16:9 QHD |
| `short4k` | 2160x3840 | 4K vertical |
| `long4k` | 3840x2160 | UHD |
| `square` | 2160x2160 | feeds |
| `preview-short`, `preview-long` | 720p | iteration only, never delivered |

**fps:** 30 for story and explainers. 60 for fast motion graphics, gameplay-like motion or sports. All engine timing is in frames derived from seconds × fps, so switching fps keeps the timing.

**Sizes:** use `u = unit(w,h)` (1 u = 1 px at a 1080 px short side) for every pixel size, in DOM and in post. A design then looks identical at 2K and 4K.

## ProjectDef / SceneDef / Timeline

```tsx
export const myVideo: ProjectDef = {
  id: "my-video", title: "...", defaultFormat: "long", fps: 30, audio: "my-video/master.wav",
  scenes: ({ fps, vertical, width, height }) => [
    { id: "intro", frames: 4 * fps, render: () => <Intro /> },
    { id: "ch1", frames: 20 * fps, transition: { type: "dip", frames: 18 }, chapter: "1 Why",
      innerCuts: [6 * fps], events: [9 * fps], render: () => <Ch1 /> },
  ],
  overlay: () => <Captions words={words} style="subtitle" />,   // spans the whole video
};
```

- **Transitions** (INTO a scene; they overlap the previous scene's tail): `cut`, `crossfade`, `dip` (to a colour), `whip` (directional blur slide), `zoom` (zoom-through), `wipe`, `flash` (white pop, cut at the midpoint), `slide-up`.
- **`plan()`** produces the edit decision list: scene starts, `cuts` (hard cuts incl. `innerCuts`), `soft` (soft transitions), `events`. render.mjs writes it to `timeline.json` and `vfa qa --plan` uses it.
- **Long-form:** one SceneDef per chapter or sequence, each with its own components. Shared assets come from the series bible.

## Stage3D (deterministic three.js inside Remotion)

```tsx
<Stage3D look={resolveLook("cartoon-ink", { dof: { maxBlur: 10 } })}
  build={({ scene, camera, renderer, width, height, fps, wait }) => { /* build ONCE; return handles */ return world; }}
  update={(world, frame, ctx) => { /* pose everything as a pure function of frame */ return rig.at(frame, ctx.fps); }} />
```

- The world is built once per browser tab. `update()` must not depend on previous frames, because frames render out of order across tabs.
- Async loads go through `wait(promise)` (GLTF, images, HDRIs). Rendering waits for them, then re-draws the frame.
- The canvas is exactly the composition size (pixelRatio 1, native). Each tab logs its WebGL renderer; check that it says GPU, not SwiftShader.
- **Layers:**
  - `NOINK` (3): never outlined. Use it for cards, sky, clouds, particles and beams.
  - `SHADOW_ONLY` (5): visible only to shadow maps, e.g. the invisible sun-facing shadow caster of character cards.
- **Real assets** (CC0 models, HDRIs, scans): load them with three's loaders (`GLTFLoader` from `three/examples/jsm/loaders/GLTFLoader.js`) inside `build` with `wait(...)`. Put files under `engine/public/<id>/` and use `staticFile()`. Rule from the reference study: if a real asset exists, use it instead of hand-building it.

## Camera rig

```ts
const rig = cameraRig([
  { f: 0,   pos: [10, 3, 24], look: [0, 15, 0], fov: 36 },
  { f: 90,  pos: [8, 5, 17],  look: [0, 16, 0], glide: 60 },               // arrives at f=90 after a 60 f glide
  { f: 140, pos: [35, 2, 68], look: [30, 1.6, 60], glide: 26, focus: 8 },  // camera TRAVELS to the next moment
  { f: 300, pos: [...], look: [...], cut: true },                          // hard cut (also list it in innerCuts)
], { glide: 24, creep: 0.012, handheld: 0.02, kicks: [{ f: 400, amp: 0.25 }] });
```

- Easing defaults to `smoother` (C2 quintic), which gives zero velocity and acceleration at both ends. Other options are `ease` names per key.
- `creep` pushes slowly toward the look target during holds (fraction of distance per second). `handheld` is deterministic fbm shake in metres. `kicks` are an impact shake that flips sign every frame and decays over about 7 frames.
- `focus` is the DOF focus distance; by default it is the distance to the look target. Rack focus by changing `focus` between keys.

## Looks and post (PostPipeline)

The pass order is fixed and deliberate:

**MSAA scene → INK → DOF → BLOOM → FINAL** (chromatic aberration, softness, exposure, tonemap, sRGB, S-curve contrast, saturation/vibrance, split-tone, black/white floor, vignette, grain, dither).

- Ink is its own pass BEFORE DOF, so the lines blur with the background, as in the reference. A blur in the same step erased them.
- Presets in `LOOKS`: `cartoon-ink`, `cinematic-film`, `documentary`, `clean-explainer`, `neon-night`, `noir`, `neutral`. Override any field with `resolveLook(name, {...})`.
- To start from a measured reference: `lookFromSuggestion(require("look_suggestion.json"), "cartoon-ink")`.
- Key fields:
  - `grade.blackPoint` (no-pure-black floor)
  - `grade.shadowTint` / `highlightTint` (display-space RGB offsets weighted by tone)
  - `ink.widthNear/Far` (u at 6 m / 90 m)
  - `dof.maxBlur` (u) and `aperture`
  - `bloom.threshold/strength/radius`
  - `grain.amount` (about sigma/255)
  - `chroma` (u at the corners), `halation`, `vignette`
- **Grain cost:** grain makes files much bigger (each frame is noise). Keep `amount` ≤ 0.02 for shorts. Consider `0` plus ffmpeg grain at master time for very long videos.

## World kit (`lib/three/world.ts`, `textures.ts`)

- **Environment:** `lights(scene, "day"|"golden"|"night"|"overcast"|"studio"|"space", {shadowSize, target, fog})` gives a warm key and a cool sky fill; `sky(scene, top, horizon)`; `skyFor(scene, preset)`; `stars()`; `studio(scene, top, bottom)`.
- **Ground and nature:** `ground(scene, size, tex)`, `hill()`, `rock()`, `tree({kind:"round"|"pine"})`, `water(size)` (call `.update(f)` each frame), `cloudCard()`.
- **Buildings and props:** `house({w,d,h,wall,roof,floors,seed})`, `lighthouse()` (has `.set(k, yaw)` for flashing), `lightBeam()`, `boat()`, `planet()`, `scatter(n, seed, area, keepOut)`.
- **Painted textures** (`paint.*`): grass, cobble, planks, plaster (with windows), roofTiles, path, water, studio, planet. All are seeded and deterministic, with visible grain and dark gaps.
- Animate lighting as a function of the frame (see lighthouse: dusk to night). Lighting should follow the story beat.

## Characters (`lib/characters/toon.ts`, `lib/three/cast.ts`)

- **`CharacterSpec`** (put it in the series bible): skin, hair{style,color}, top{color,style,accent}, bottom, shoes, `heightHeads` (3.5), `headRatio`, `build`, `limb`, hat, glasses, beard, blush, ink.
- **`Pose`:** `expr` (neutral, happy, laugh, shock, nervous, sad, angry, whistle, smug, think), `mouth` 0..1, `blink` 0..1, `armL/armR/elbow*`, `legL/legR`, `lean`, `look[x,y]`, `bob`, `squash` (volume-preserving), `facing`, `light` (side of the key light), `prop` ("book", "sign", "lantern"; arms auto-pose), `propText`.
- **Helpers:**
  - `blinkAt(f, fps, seed, forcedFrames)`: blink on every expression swap, which hides the swap
  - `mouthAt(f, fps, words, lead=2)`
  - `walkPose`, `idlePose` (breathing squash, sway, eye drift), `mergePose`, `lerpPose`
- **`new CharacterCard(spec, heightM, texPx, sun)`:**
  - `scene.add(card.group)`, then `card.setPose(pose)` and `card.place(x, y, z, camPos)` every frame.
  - The card yaw-billboards to the camera. Its shadow comes from a hidden sun-facing caster, so the shadow is always full-size.
  - `texPx`: 1400 for 2K mid shots, 2048 for 4K close-ups.
- **Pure 2D scenes:** call `drawCharacter(ctx, spec, pose, w, h)` on your own canvas (wrap it in a component with useCurrentFrame plus a canvas ref).

## 2D, typography and motion graphics (`lib/two/text.tsx`)

- **`Captions`:**
  - `words`, `style="pop"` (shorts: heavy uppercase, stroke, active-word highlight and spring) or `"subtitle"` (long-form)
  - `maxWords` per page; pages break on sentence ends and pauses
  - positioned above the platform UI safe zone
- **`KineticTitle`:** per-word rise and de-blur with stagger, a subtitle, and exit.
- **`LowerThird`**, **`ChapterCard`**, **`Counter`** (outExpo count-up), **`BarChart`** (spring bars, `decimals`), **`GradientBg`**, **`FilmOverlay`** (vignette plus deterministic SVG grain for DOM scenes).
- **Fonts:** system stacks in `FONTS`. For a brand font, put the `.woff2` in `public/fonts/`, load it with `FontFace` plus `delayRender`, and add it to the stack.

## Rendering (`tools/render.mjs`)

```
node tools/render.mjs --project ID --format short|long|short4k|long4k --fps 30|60
     [--stills 0,90,180 --scale 0.5]   look-test stills (PNG)
     [--frames 0-299]                  partial render
     [--chunk 20]                      seconds per chunk (resumable; finished chunks reused if settings+source match)
     [--audio public/ID/master.wav]    mux mastered audio (AAC 320k)
     [--codec h264|h265|prores] [--crf 16] [--image-format jpeg|png] [--concurrency N] [--gl angle|egl|vulkan|swangle] [--clean]
```

- **Output:** `out/<id>/<format>_<fps>/` (or `--out`) contains `<id>_<WxH>_<fps>fps.mp4`, `timeline.json` and `render_report.json` (native/preview, timings).
- **Measured speed** on an RTX 5070 / 16 threads:
  - inked 3D at 1440x2560: about 17 fps (23 s short in about 45 s)
  - 2560x1440 mixed: about 15 fps
  - 3840x2160: about 7 fps
- Lower `--concurrency` for 4K if VRAM is short (each tab holds about 8 full-resolution float targets).
- **Encode:** H.264 high, CRF 16 by default (YouTube re-encodes anyway, so feed it more bits than it needs). `h265` gives smaller archives; `prores` (422 HQ, 10-bit) is the master for an editor.
- **Temp bloat:** Remotion bundles into the OS temp dir, and render.mjs deletes its bundle afterwards. If renders crash repeatedly, clear old `remotion-*` folders in temp.

## Troubleshooting

| symptom | cause / fix |
|---|---|
| black frame or missing 3D | an exception in `build`; read the `[browser]` lines. A GLTF path 404s: use `staticFile()` |
| frames differ between runs | something reads time or randomness; use `rng(seed)`, never `Math.random`/`Date` |
| "SwiftShader" in the renderer log | software GL (slow); try `--gl angle` or `--gl vulkan`, and update GPU drivers |
| character floats or sinks | `place()` y must be the ground height at (x,z) |
| card has no shadow | pass the sun to `CharacterCard` (4th argument), and the light must `castShadow` |
| outlines on characters/sky | put them on `NOINK` (cards already are) |
| captions overlap the platform UI | use the default y, or keep within `SAFE` |
| huge files | grain; lower `grain.amount` or CRF 18-20 |

## Added in 1.1 (toonworld / shader upgrade)

| feature | where | use |
|---|---|---|
| per-frame looks | `Stage3D look={fn}`, `lookTimeline([[f, look], ...], fade)`, `lerpLook` | lighting setups that follow the story (day -> golden -> night -> day) |
| toonworld presets | `LOOKS["toonworld-day/golden/night/interior"]` | measured grade per lighting setup, no grain, bloom on emissive only |
| knot grade | `grade.knots[7]`, `zoneSat`, `tintS/M/H` [Cb, Cr] | fitted 7-knot monotone tone curve + 3-zone saturation + luma-neutral tints |
| DOF v2 | `dof.maxBlur` (= cInf), `maxCoC`, `nearScale` | thin-lens CoC, "sample reaches us" test, near-field gather (soft foreground) |
| camera motion blur | `look.motionBlur` (shutter 0..1) + `<Stage3D camAt={rig.at}>` | depth-reprojected; whips/travels always blurred |
| painted cel world | `toonifyScene(scene, makeToonUniforms(TOON_SETUPS.day))`, `applyToonSetup(u, a, b, t)` | sun-visibility x N.L cel ramp, hue-keeping shade, violet replacement shadows, rim, world-space colour drift |
| wind | `windSway(obj, windUniforms())`; set `uWindTime` per frame | foliage sway in the vertex shader |
| toon water | `toonWater(w, h, colors)` | gradient + crest marks + glints |
| card shading | automatic in `CharacterCard` (`cardShade`, `CARD_U`) | no emissive; scene tint, bright shadow floor, side gradient, contact blob, auto light side |
| toonworld characters | `CharacterSpec.style = "toonworld"` | bean head, thick-thin plum ink, stroke limbs, dot hands, lidded eyes, soft crescents |
| FX | `new FxLayer(scene).add(kind, {at, f0, size})`, `fx.update(f, camPos)` | sparkle, impact, dust, speedlines, splash, notes, stars, aura, shaft, smoke, sweat, ?, ! |
| captions | `<WordCaptions words={words} />` | one word at a time, hard swaps |
| camera | `push {rate, punches}`, `follow [{f0, f1, target(f), offset, blendOut}]`, screen-space kicks, `glideOrCut()` | measured camera grammar |
| props | `lampPost`, `bench`, `fence`, `flowerBox`, `bird`, `blocksShot(p, r, rig.keys)` | detail density; sight-line culling |
| cues | `SceneDef.cues {name: frame}` -> `timeline.json.cues` | sound design reads story beats from the picture (`make_audio.py`) |
| model sheet | `--project modelsheet --stills 0` | all expressions/poses of a cast for look-dev |

## Added in 1.2 (production upgrades)

**Frame-rate independence.** `cameraRig(keys, { refFps: 30 })` authors every frame-unit parameter (glide, push rate,
punch length, kick frames, follow blend) at 30 fps and rescales at render time, so `--fps 60` keeps the same timing.
Key frames (`f`) are real frames (they come from `timing(fps)`). A glide computed from real frames must be converted:
`R = (n) => n * 30 / fps`. `FxLayer.update(frame, camPos, fps)` scales effect durations the same way.

**Glide hygiene.** A glide longer than the gap since the previous key starts *before* that key arrives and jumps.
Clamp it: `seq(keys)` in `projects/manhole/index.tsx` sets `glide = min(glide, gap)`. Channel grammar: every travel
is 44 f centred on its cue (`f: cue + 22`, glide 44), and long holds get one small push/pull per sentence.

**In-world dissolves.** A key with `dissolve: n` cross-dissolves from the previous camera to this one over n frames
inside ONE world (two renders of the same scene, mixed in post; both get DOF/ink/grade). Wire it with
`<Stage3D dissolveAt={(f, fps) => rig.dissolveAt(f, fps)} ...>` and declare it as `innerSoft: [f]` in the SceneDef so
QA treats it as a soft transition. Use it for time jumps ("One morning...") instead of a hard cut.

**Clean cuts.** Pass `cuts={rig.cuts}` to Stage3D: camera motion blur is skipped on a cut frame (it used to smear the
first incoming frame). A camera jump of more than 35 % of the focus distance is treated as an undeclared cut too.

**Lip-sync (visemes).** `Pose.viseme` takes `rest|A|E|I|O|U|M|F|L|W`; `visemeAt(frame, fps, words, lead = 2)` maps
word timings (Whisper or ElevenLabs `/with-timestamps` -> `tts.py eleven` writes words.json) to mouth shapes by
grapheme rules, leading the audio by 2 frames. Give each speaking character only ITS words
(`words.slice(first, last + 1)`). See `references/craft/character-types.md` section 4 for the full phoneme/viseme tables.

**Side view.** `Pose.view = "side"` draws a profile: features slide to the facing side, one eye, a nose tick, slimmer
torso. CrowdPool uses it automatically for walking extras.

**Crowds.** `new CrowdPool(scene, sun).add({ spec, path: { from, to, t0, t1 } | pos, expr, cueWindows }, camDist)`;
`crowd.update(frame, fps, camPos)` every frame. Texture resolution by distance tier (1200/700/420/240 px), poses on
twos, side-view walks, optional cue-gated acting (frozen outside `cueWindows`, as measured on story channels). Keep
extras off the pavement the camera stands on (a cropped giant head is the classic failure).

**Real assets.** `node tools/fetch-assets.mjs search --type models --q barrel`, `get --type models --id wine_barrel_01`
(Poly Haven, CC0, credited in `public/assets/CREDITS.json`), `kenney --zip <downloaded pack.zip>` (Kenney has no
API: the user downloads the zip). In a scene: `loadModel(ctx, staticFile(".../x_1k.gltf"), { height: 1.0, toon,
recolor })` returns a Group at once; Stage3D waits for the file (ctx.wait) before the frame is captured.

**Blender bridge (tested: Blender 5.3 on Windows, EEVEE and Cycles with the OptiX GPU device requested).** For the realistic-3D style:
`blender -b -P tools/blender_bridge.py -- --scene a.gltf,b.gltf --offsets "0,0,0;1.2,0,-0.8" --cam cam.json --out frames
--res 1440x2560 --engine EEVEE|CYCLES --samples 64 --hdri <polyhaven .hdr> [--ground "#7a8a52" --catcher] [--fstop 2.8]
[--look toon] [--frames 0-299 --step 1]`. cam.json uses the same key grammar as `cameraRig` (pos/look/fov, glide with
smootherstep, cut, `via` arcs), in engine axes (+Y up; converted to Blender +Z up). `--look toon` adds Freestyle ink;
`--catcher` makes the ground a Cycles shadow catcher so the HDRI horizon stays (a flat plane against an HDRI reads
fake). Measured at 540x960 (GPU shared with another render): EEVEE ~0.3 s/frame after ~17 s startup; Cycles 48 spp +
denoise: one frame in 7 s including startup. Benchmark at full size before planning a long render.
Mux with ffmpeg (`-framerate 30 -i f%06d.png`) and run `vfa qa` like any render; label it "Blender path".

**Director loop.** `node tools/produce.mjs --project ID --ref REF_fingerprint.json --ref-dir REF_ANALYSIS --style
STYLE --change "what changed"` runs stills -> render -> audio -> mux -> QA -> gap -> judge pack -> learning log ->
report.md. See `references/pipeline/director-loop.md`.

**Character kinds (`lib/characters/kinds.ts`, build specs in `references/craft/character-types.md`).** Seven kinds beyond the
toon.ts humans, all frame-pure Canvas2D sharing one face module (16 expressions, Rhubarb mouth cues A-H/X plus the
toon visemes): `object` (face on any shape: box, can, ball, jelly, phone, house, tooth, custom SVG path; `rigidity`
limits squash), `critter` (cat, dog, bird, frog, bear, mouse, rabbit, fox, pig; `cat4`/`dog4` quadrupeds with a
4-beat walk), `blob` (spring-driven antennae/ears), `stick` (two-bone IK, x-ray skeleton, smears, `STICK_POSES`),
`chibi` (2.3 heads; storyteller, kid, scientist, OverSimplified-style caricature), `flatvec` (Kurzgesagt-like, no
outline), `microbe` (virus, bacterium, cell, rbc, wbc, heart, brain). Presets: `KIND_PRESETS`. Motion helpers:
`walk4Pose`, `hopPose`, `hopWalkPose`, `critterIdle`, `springFollow`, `withSecondary`, `ik2`.
Style passes on ANY 2D character (toon.ts included): `sketch`, `cutout`, `silhouette`, `pixelize`
(`drawAnyStyled`, `applyPass`). In 3D: `new CharacterCard(KIND_PRESETS.cat, 0.6, 900, sun, { pass: "cutout" })` and
`card.setPose(pose, frame, fps)` (the frame drives idles and pass boil). CrowdPool members accept kinds and `pass`.
Look-dev: `node tools/render.mjs --project charsheet --format long --stills 0,40,70,100,130`.
Known weak spots (measured on the sheet): object side views are plain, the cat face is busy at small sizes, solid
critter eyes make sad/smug subtle, the flatvec bird's visemes are small, the sketch pass is clean rather than rough.

**Render defaults (1.2, measured with `tools/bench.mjs`).** On one GPU, Chromium WebGL tabs contend: concurrency 4 beat 8 by
about 1.4x on the full manhole short (78-128 s vs 141-145 s, Ryzen 7 9800X3D + RTX 5070); x264 `medium` instead of `slow`; CRF 14
(about 15 Mbps at 1440p30, meeting YouTube's upload recommendation; CRF 16 gave about 10 Mbps). Re-run the benchmark on a new
machine before changing these: `node tools/bench.mjs --project ID --frames 0-299 --variants old,default,old,default`.

**Thumbnails (`lib/thumbs.tsx`, `tools/thumbs.mjs`, `analyzer/vfa/thumbcheck.py`).** A project opts in with
`thumbnails: (fps) => ThumbVariant[]` (see `projects/manhole/thumbs.ts`, 7 variants). Each variant freezes a frame of
the real world.
- **Camera:** an override, absolute pos/look/fov or relative dolly/orbit/lift/dutch/shift/pan. Character cards and other
  `userData.faceCamera` billboards are re-aimed at the override camera.
- **Overlay:** 1-4 auto-fitted heavy words with a highlight word or colour pill, placed left/right/top/bottom and never in the
  bottom-right timestamp zone.
- **Accents and pop:** arrow, circle, ?/! burst, X/check, and a "pop" grade with a focal vignette and scrim.
- **Sizes:** `long` 1280x720, `short` 1080x1920 cover, `hires` 2560x1440, each kept under 2 MB.

`thumbs.mjs` writes a sheet that shows every variant at real feed sizes on light and dark UI. `thumbcheck` scores it
(0-100):
- OCR readability at 168x94 (25)
- text size (10)
- word count (8)
- WCAG contrast (12)
- focal clarity (15)
- subject size (10)
- timestamp zone (5)
- colour pop (10)
- diversity of the set (5)

Scores rank a set; they are not absolute quality. LOOK at the sheet. Known weak spots: the OCR is flaky on single huge
words, and cartoon-face subject size is underestimated.

YouTube specs, checked 2026-11-10: recommended 3840x2160 for videos and 2160x3840 for Shorts; minimum 640 px; 2 MB on
mobile and 50 MB on desktop. Custom Shorts thumbnails can only be set in YouTube Studio on desktop.

## Added in 1.3 (learned from the elevator proof short)

**Camera push fix.** `cameraRig` punches used to re-apply on every LATER hold (the loop counted from the punch even when
it lay before the hold), so shots crept in by up to ~40 % once a few punches had happened. Fixed in `lib/camera.ts`:
only punch frames inside the current hold count. Re-check older projects' framing after upgrading (visual baselines
for manhole changed for this reason).

**Framing in 9:16.** The horizontal FOV of a vertical short is only ~0.56x the vertical FOV (`hfov(vfov, aspect)`).
Plan close-ups with `frameDistance({ width, height, vfov, aspect: 9 / 16, fill: 0.8 })`: a 3-person group (~2 m wide)
at vfov 34 needs ~6.8 m, not the ~3 m that "feels" right; guessed distances came out 2x too tight and hid subjects
behind foreground posts. Keep posts and pillars off the camera-to-subject line (or use `blocksShot` on set dressing).

**CharacterCard `pad`.** `new CharacterCard(spec, heightM, texPx, sun, pass, { top, x })` adds canvas room above the
head and on both sides (fractions of the base card). Feet stay at y = 0; the drawing scale does not change. Use it for
props (axe, flag), hat tips and pointing so nothing is clipped at the card edge.

**Stick accessories.** See characters.md "Stick cast with accessories" (`hat`, `hair`, `stache`, `beard`, `coat`,
`neckwear`, `skirt`, `glasses`, `build`, pose `hold`, `hatLift`/`hatTilt`).

**Ghost silhouettes.** Things that should read as flat shapes (a future skyline, a memory) use `MeshBasicMaterial`,
`fog: false` and the NOINK layer so `toonifyScene` and the ink pass skip them; lit + fogged they vanish into the sky.

**Reference fingerprint for the toonworld style.** `references/styles/data/toonworld-explainer_fingerprint.json`
(27 explainer Shorts, numbers only): `vfa qa FINAL --ref` it directly; the profile no longer needs the original
analysis folder.

**Shot audit (`lib/three/audit.ts`).** `Stage3D audit={(frame, world) => ShotSubject[] | null}`: on the frames where the
callback returns subjects (`{ name, at, r, minFrac?, maxFrac?, edge? }`), the camera checks each one: out of frame,
at the frame edge (< 6 % from it), too small / too big, and OCCLUDED (rays to the centre and top; character cards and
FX sprites only block where their texture is opaque, so a card's empty corners never count). Problems are logged as
`[video-forge][shot-audit] f=N ...`; `render.mjs` prints them and writes `<out>/shot_audit.log` (one line per problem).
Typical callback: subjects per story section, checked on every key arrival, every mid-hold and every 10th frame.
On the elevator short it found the hook's helper pushed out of frame by the hold push + punches, and (with the old
crowd placement restored as a negative test) a background card in front of the hero crowd.

**`render.mjs --stills cues`.** One still per named cue in the plan (the story beats from `timing()`), plus
`stills/index.json` (cue -> frame). At `--scale 0.25` a 60 s short takes ~1 min: the review sheet + shot audit pass
to run after every camera change.

**Holds push from their LAST key.** A 6 s hold with the default push (0.0028/frame) plus two punches ends ~38 % closer.
Either aim the first key wider, or put a slow mid-hold key in (holds restart their push at each key).

**`motes()` (world kit).** Deterministic drifting dust / pollen / snow (`THREE.Points`, NOINK, audit-ignored):
`const m = motes(scene, { center, size, n, px, color, seed }); ... m.update(frame, fps)`. Held shots are never
dead-still (measured micro-animation gap on the elevator short).

## Added in 1.4 (bobble cast + lessons from the hero-short case study)

- **`kind: "bobble"`** (characters.md 5.3 I): `new CharacterCard(KIND_PRESETS.bbHero, 1.75, 1600, sun, undefined,
  { top: 0.3, x: 0.4 })`. Any kind works in `CrowdPool`.
- **`poseTrack(keys, frame, fps)`**: `keys = [{ f, pose, blend? }]`; holds each pose and pops into the next (outBack,
  default 5 frames). Numbers and IK targets blend, `expr` / `cue` / `view` / `hold` switch at the pop. Typical use:
  `card.setPose({ ...idlePose(f, fps, seed), ...poseTrack(keys, f, fps), cue: cueAt(...) })`.
- **Handheld life:** `cameraRig(keys, { handheld: 0.012, handheldSpeed: 0.4 })` (the reference has a little handheld
  motion in every shot).
- **Hook cut:** open on a close-up of the actor and hard-cut to the wide on the second clause (`cut: true` on a word
  cue, listed in `innerCuts`).
- **Narration tempo:** `ffmpeg -af "silenceremove=stop_periods=-1:stop_duration=0.24:stop_threshold=-36dB:stop_silence=0.2,atempo=1.12"`
  caps pauses at 0.2 s and speeds the read ~12 % without re-generating the voice; re-run `tts.py align` and
  `lipsync.py` afterwards (word indices stay the same, so `timing()` keeps working).
- **Music level:** `music_sections` at -18..-21 (the measured reference keeps music ~20 dB under the voice).

## Added in 1.5 (world detail: the set-dressing kit)

Measured gap that started this: edge density 4.9 % on our frames vs 8.7 % on the reference hero short. Its worlds
have textured surfaces, signage, props and a FILLED horizon in every shot; ours had sky and grass behind the action.
After dressing the elevator short with the kit below, the median over the 48 cue stills went 4.95 % -> 6.6 %.

`lib/three/world.ts` (all procedural, deterministic, base on y = 0 unless noted):

| piece | call | use |
|---|---|---|
| text on a board | `textTexture(text, { w, h, bg, fg, border })` | any sign, poster, label (auto-fits the text) |
| shop / station sign | `signBoard("BAKERY", { w, h, bg, fg })` | one per shopfront; tells the viewer where we are |
| hanging banner | `banner("NEW|YORK", { w, h, color })` | hangs down from y = 0; `|` = line break; swallow-tail, cloth folds |
| iron-and-glass wall | `lattice(w, h, { cell, color, arch, glass })` | exhibition halls, stations, greenhouses, railings (`glass: false`, small `cell`) |
| brick | `brickTexture(color, mortar, rep)` | plinths, piles, factory walls |
| cargo | `crate(size, { label })`, `barrel()` | stack in twos and threes next to doors, stalls, machines |
| cart | `cart({ load: "crates" | "barrels" | "none" })`, `spokedWheel(r)` | streets and yards |
| awning | `awning(w, { a, b, depth })` | striped, slopes toward +z; put it under the sign |
| exhibit machine | `const e = steamEngine(); e.wheel.rotation.z = t * 2.4` | background life that moves |
| building site | `scaffold(w, h, { levels })` | empty lots, "the city is growing" |
| far facade | `rowFacade(w, h, { color, floors, seed })` | a flat block with windows and chimneys: fills horizons cheaply |
| lantern | `lantern()` | emissive glass (blooms at night) |

Rules learned while dressing:
- **Close the room.** An interior needs walls on all four sides (the hall had columns and a roof but an open grass
  horizon). Put `rowFacade`s OUTSIDE glass walls so the glass has something to show.
- **Fill both horizons of a street** with a far row behind the near row, but leave a gap wherever a later shot needs a
  long sight line (the far row hid the future skyline until two segments were removed).
- **Sight-line cull every prop**: `const keep = (x, z, r, y) => !blocksShot([x, y, z], r, rig.keys)`, then run
  `render.mjs --stills cues` and read `shot_audit.log`.
- **Signage is story.** A sign names the place in one glance ("WAREHOUSE", the store's name, "LOT FOR SALE").
- **Check that a counted thing is really there**: the "floors 1-6" crane was climbing a 4-floor building; it now climbs
  a 6-floor front. A review sheet per cue catches this, a metric does not.
- **Geometry gives ink lines, textures give texture.** Pilasters and floor cornices as thin boxes put real ink outlines
  on a facade; window grids in a texture do not. Use both.
- Measure detail on the cue stills (Canny 60/160 on a 512-px-wide grey frame, the analyzer's `edge_density`):
  aim for a median of 6.5 % or more; shots under 3 % are usually sky or a blurred, empty background.

**Camera collision check + the audit pass.** `cameraInside()` (lib/three/audit.ts) runs on every frame when Stage3D has
an `audit` callback and logs `camera is INSIDE Box @ ...` when the camera sits in a solid box (house, wall, slab). Back
faces are culled, so a camera that drifts into a building looks fine on key frames, then a roof or floor sweeps through
a few frames (the elevator v3 crane did exactly that and `vfa qa` failed it as an unexpected cut).
Run the **audit pass** before every native render: `node tools/render.mjs --project ID --scale 0.125 --crf 34 --out DIR_audit`
(about 2 minutes for a 50 s short; 0.125 and 0.25 keep integer frame sizes, 0.12 does not), read `DIR_audit/shot_audit.log`,
and run `vfa qa DIR_audit/video.mp4 --plan DIR_audit/timeline.json --min-class none` for cuts, pops and flicker.

## Added in 1.6 (shading, lighting and colour, from the four research reports)

Rules and sources: `references/research/shading-lighting.md` and `references/research/`. What changed in code:

**Shader patches compose (`addPatch`).** `addPatch(material, key, fn)` in `lib/three/shaders.ts` stacks patches and
builds the program cache key from all of them. `windSway()` + `toonifyScene()` used to lose the wind (the later
`onBeforeCompile` replaced the earlier one); foliage moves again. Always patch through `addPatch`.

**Toon model (`toon-v5`).**
- Split ramp: `band(N.L) x band(sunVis)`. The cast-shadow edge no longer moves with the surface angle.
- Form-following fill: up-facing shade x `uSkyFill`, down-facing x `uBounce` (colours are x2 multipliers around mid-grey).
- Terminator band: `uTerm` x `uTermColor` on the light / shade boundary (off in overcast, rain and fog setups).
- Secondary lights: every non-sun light (`PointLight`, `SpotLight`, extra directionals) now lights toon materials as one
  soft, capped band. A lamp's `distance` sets the size of its pool; intensity mostly sets how fast the band saturates.
- Cloud-shadow cookie: `toon.uCookie` (0 off, 0.25-0.45 exterior) with `toon.uCookieOff` in world metres for drift.
- `ToonSetup` gained optional `skyFill`, `bounce`, `term`, `termColor`; `TOON_SETUPS` gained `overcast`, `rain`, `dusk`,
  `fog`, `interiorWindow`, `sunsetBack`.

**Cards (`vfcard-v5`).** In cast shadow a card takes the scene's shade TINT (`CARD_U.uShadeC`, set by
`applyToonSetup`), not a grey 0.86; a thin rim of key-light colour on the lit upper edge (`uRimC`, `uRimA`; it never
lightens the ink line); lamps light cards too; `alphaToCoverage` smooths the silhouette on the MSAA target.

**Post (`lib/three/post.ts`, `lib/look.ts`).**
- `look.ao = { enabled, strength, radius, tint }`: stylised SSAO on the world buffer (cards excluded), 16 samples,
  radius grows with distance, composited as a multiply toward `tint` BEFORE the ink. toonBase: 0.5 / 0.55 m / `#6a5c9c`.
- `look.ink.hue` (0..1): lines take a dark version of the colour they outline. toonBase: 0.4.
- Zone tints / zone saturation (`tintS/M/H`, `zoneSat`) now work without `knots` (they were silently ignored).
- `tonemap: "none"` keeps the hue of over-range colours (peak-channel scale instead of a per-channel clamp).
- Dither: triangular, +-1 LSB, re-drawn every frame, uniform at the rails.
- `lerpLook` cross-fades hex colours in OKLab.
- New looks: `toonworld-dusk`, `-rain`, `-overcast`, `-fog`, `-office`.

**World (`lib/three/world.ts`).**
- `lights()` presets: + `dusk`, `rain`, `storm`, `fog`, `morning`, `sunsetBack`, `dawn`, `nightMoon`, `nightPractical`,
  `neon`, `interiorWindow`, `interiorWarm`, `spotlight`; presets may carry `fogNF` (linear fog near / far).
- Shadow bias -0.00015 (was -0.0004 = a 9 cm gap under feet and props).
- `lightShafts({ from, dir, len, width, color, strength })`: additive crossed cards from roof lights / windows along the
  light's direction; `shafts.setStrength(k)` to fade with the key.
- `sky()` uniforms `sunDir`, `sunCol`, `sunGlow`: a disc, a halo and a horizon-side glow toward the key light.
- `banner()` and `lattice()` use alpha-to-coverage.

**Colour (`lib/color.ts`).** OKLab / OKLCH conversion, `mixOklab`, `gradientOklab`, `rampStep`, `shadeOf`, `lightOf`,
`deltaEOK` (JND about 0.02), WCAG `contrastRatio`.

**Dark shots:** render intermediates as PNG (`render.mjs --image-format png`): JPEG frames erase the dither.

Measured on the elevator short (cue stills and QA) in the CHANGELOG entry for 1.6.0.

## Added in 1.7 (storyboard as data, sets, shot grammar, weather, vehicles, sound from the picture)

Full guide: `references/pipeline/board.md`. The pieces, bottom up:

| piece | file | what it gives |
|---|---|---|
| light plan | `lib/three/lightplan.ts` | `lightPlan([[frame, key], ...], { fade })` -> `look(frame)`, `build(scene)`, `toonify(scene)`, `update(frame, fps, { target, cookieMul })`. A `LightKey` bundles `lights()` preset, toon setup, look, sun glow, cloud shadows, fog and `practicals` (how far lamps and lit windows are on). 14 keys in `LIGHT_KEYS`; `tweak(key, lookOverride)`. |
| sets | `lib/three/sets.ts` | `buildSet(name, opts, origin)` -> `{ group, marks, wide, camBox, crowdSpots, setNight(n), setSky(top, horizon), update(f, fps) }`. Eight sets, `era: "old" | "modern"`, composed for 9:16 (narrow and tall). `PROPS`: table, chair, stool, crate, barrel, coins, moneyBag, chest, sack, scales, candle, book, papers, trashBin, mailbox, hydrant, parkingMeter, vendingMachine, ladder, plant, sign. |
| shot grammar | `lib/shots.ts` | `frameShot(spec, aspect, box)` and `shotKeys(spec, { f0, f1, aspect, via })` on top of `frameDistance()`. Sizes wide / full / medium / close / xclose / two / group / insert / low / high / top / pov; moves push / pull / orbit (true arc through a Bezier control point) / crane / track / tilt / rise; ways in cut / dissolve / glide / whip. |
| vehicles | `lib/three/vehicles.ts` | `car` (sedan, hatch, pickup, van, taxi, police), `bus`, `truck`, `carriage` (+ `horse` with walk / trot), `bicycle`; `drive(v, path, u)` (arc-length Catmull-Rom, steering, bounce, lean), `seatWorld`, `seatPose`. Cabins are solid up to the sill so a seated card shows head and shoulders and nothing else. |
| weather | `lib/three/weather.ts` | `rain(scene)` (world-anchored streaks + splash rings that follow the camera) and `wetGround(w, d)` (planar reflection by a second render from the mirrored camera, smeared and broken by puddle noise and drop ripples; skipped in the normal / depth pass; costs nothing at amount 0). |
| crowd reactions | `lib/three/cast.ts` | `pool.react([{ f, kind, at, dur }])`: gasp, cheer, laugh, boo, look, clap, point, sad; each member 1-8 frames late with their own variant, turning toward `at`; idle breathing when a pool has events. `pool.setVisible(v)`. |
| characters | `lib/characters/kinds.ts` | `view: "three"` (three-quarter, `facing` picks the side, front-view IK targets are remapped), smear frames and settle emitted by `poseTrack` (`PoseKey.smear: false` to switch off). |
| the board | `lib/board.tsx` | `boardProject(board)` -> `ProjectDef`. `planBoard(board, fps)` (pure: cue frames, cuts, dissolves) and `boardSounds(board, fps)` (cue sheet). Only the current place (and the one a dissolve touches) is drawn. |
| timeline | `lib/timeline.tsx` | `SceneDef.sounds / music / rain / places` pass through `plan()` into `timeline.json`. |
| audit | `lib/three/audit.ts` | hidden objects (any invisible ancestor) are no longer occluders. |
| tools | `tools/make.mjs`, `tools/sheet.py`, `render.mjs --stills cues+N`, `produce.mjs` | one command with gates; named contact sheet; stills N frames after each cue; produce runs `score.py` for boards and adds the per-key colour table to the report. |
| audio | `audio/score.py`, `audio/tighten.py`, `audio/soundlib.json` | the mix from the picture's cue sheet (real samples first); pause-capped narration with shifted word times; the prompts of the starter sound library. |

Bugs found on the way (both were silent):
- `toonWater()` never compiled: `#include <fog_vertex>` sat in the middle of a line and three.js only resolves includes at
  line start. No project used it, so nothing failed until the yard set's pool rendered as grass.
- `Raycaster` hits invisible meshes; the shot audit reported a hidden prop as an occluder.

Measured lessons (coin short, first board): see the nine rules in `references/pipeline/board.md` section 3.

## Added in 1.8 (hold the shot, tools in the hand, life in the set, thumbnails and 16:9 from the board)

Rules and the authoring table: `references/pipeline/board.md` section 8. The pieces:

- **Held props** (`lib/characters/kinds.ts`): `StickHold.item` adds `shears` (`open` 0..1), `coin` (`len` = radius in
  head units, `cut` = a shaved flat), `file`, `hammer`, `sack`, `quill`, `bar`; `KPose.hold2` is the other hand; `aim`
  is an absolute screen direction (0 right, 90 up, 180 left). Bobble outlines are 18 % lighter (`lineW` on a spec
  overrides it).
- **Board** (`lib/board.tsx`): `Beat.focus` (rack focus), `Act.hold2`, gag `big.y` / `counter.color`, fx `on` accepts
  coordinates, travels 20-40 frames, a slow roll drift on every shot (`driftCam`), stronger depth of field per shot size
  (`DOF_BY_SIZE`), word-onset nods and eye darts, captions 110 px at 70 %, `lintBoard` (in `timeline.json` as `lint`),
  `autoThumbs` + `thumbWords`. Eye line: `Subject.eye` puts the eyes 38 % from the top in medium, close and two-shots
  (`lib/shots.ts`); the settle after a cut is off by default.
- **Sets** (`lib/three/sets.ts`): a life and dressing kit used by every set: `smoke`, `sparks`, `sway`, `hangSign`,
  `bunting`, `curtains`, `picture`, `poster`, `wallShelf`, `pilaster`, `cabinet`, `hangingRow`, `sconce`,
  `flickerGlow`, `chandelier`; wind on trees; the old office has a dark wainscot under the wall colour. Crowd spots of
  the street are on the far pavement only (an extra on the camera side stood in front of the lens).
- **Textures and look**: `brickTexture` has dark joints by default (`#3e2c28`), a lit top edge and a shaded bottom edge
  per brick and a few burnt bricks. World ink `widthNear` 4.2, `hue` 0.1, `creases` 0.9 (was 3.0 / 0.22 / 0.75: the
  world line was six times thinner than the character line). Golden shade is less violet (`shadowTint` b 0.045, shade
  replace `#6a5d70` at 0.16); night is less blue (saturation 1.15, `shadowTint` b 0.06).
- **Crowd** (`lib/three/cast.ts`): reaction `snip`. The contact blob under a character is neutral (it was violet).
- **After the second review**: travels take 30-60 frames with an `inOutSine` ease, or become a soft cut when the
  framing before them is under 32 frames (`planBoard`); depth of field blends over the travel and motion blur is
  halved during it; a pose on a cut starts on the cut frame; the shot audit also checks `focus` targets and speakers
  (`mustSee`); `lintBoard` counts framings and flags text that repeats the caption; the modern street has warmer,
  more saturated facades; the old office has one pair of drapes, so the wall colour shows behind the desk.
- **Tools**: `make.mjs` runs thumbnails, `titles.md` and (`--also long`) the 16:9 version after `produce`
  (`--no-extras` skips them); `render.mjs` prints `[board lint]` lines; `story.py titles --auto --out FILE`;
  `story.py board` drafts one shot per sentence.

## Added in 1.8.1 (motivated light, heavier prop ink)

- **Window light** (`lib/three/sets.ts` `sunPatch`): a window-shaped patch of sunlight on the floor, the stage or a
  desk (additive, with mullion bars, fades out as the lamps come up). The office, the workshop and the hall have them.
  The workshop also has a flickering lantern beside the tool rack and the old office a candle pool and a dressed desk
  (ledgers, coin stacks); the hall a rope barrier in front of the stage.
- **Rim light on cards** (`TOON_SETUPS`): interior 0.10 -> 0.32, window interior 0.12 -> 0.36, golden 0.30 -> 0.38,
  night 0.22 -> 0.42 with a warm rim colour (night scenes in this style are lit by lamps).
- **Shade colour**: golden shade is cool blue-grey (`#4c5268` at 0.14, `shadowTint` b 0.034). Violet read as mud on warm
  floors, neutral measured too warm against the reference's cool shadows.
- **Ink**: `widthNear` 5.2 and creases from shallower folds (`smoothstep(0.80, 0.94)`), so props carry a visible line
  next to the character outlines.
- **Board**: place dissolves take 14 frames (10 read as cuts to the detector); `BoardApi.aspect` lets a prop laid out
  for 9:16 re-arrange itself for 16:9.

## Added in 1.9 (a frame-by-frame study of 20 reference shorts)

Targets and reasons: `references/craft/` (one sheet per area). What changed in the engine:

- **Joins** (`camera.ts dissolveAt`, `three/Stage3D.tsx`, `three/post.ts dissolve`): a dissolve starts ON its key and
  runs `dissolve` frames (board default 9) with a curve halfway between linear and smoothstep, so no frame carries more
  than ~0.14 of the mix. The outgoing half renders the WORLD of the frame before the key (`fa`): actors, props, place
  and light that switch at the key no longer jump inside the mix. Both cameras keep moving. Join styles (`JoinStyle`,
  `Via`): `through` (push into the old picture, out of the new one), `flash` (through white), `iris` (a circle opens);
  `cut` is a 6-frame soft dissolve by default (`Board.softCut`).
- **Board joins** (`board.tsx viaOf`): a shot beat on the first word of a new sentence dissolves; inside a sentence the
  camera travels (`glideLen` 14-26 f, `inOutSine`); a framing shorter than 20 frames cuts. `Beat.event` declares an
  intended picture change (a prop that turns or breaks) so QA lists it instead of failing the edit plan.
- **Framing** (`shots.ts HEAD_FRAMING`, `Subject.head`): one character is framed by head height and eye line per size
  (close 20 % / 37 %, medium 13 % / 44 %, full 6.5 % / 45 %, xclose 32 % / 47 %); two-shots put the eyes at 44 %.
- **Depth of field** (`board.tsx DOF_BY_SIZE`): on for close, medium, xclose and inserts (insert 24), off for full and
  wide; blended across travels; motion blur x0.45 while travelling.
- **Captions** (`two/text.tsx WordCaptions center`): the board sets size 75 (at 1080 w), outline 0.17 em, lead 0.03 s,
  centre at 70.4 % of the height, the last word stays up through pauses, a soft shadow down-right.
- **Shading** (`three/shaders.ts`): cast and form shadow are separate terms. `ToonSetup.castMul` (linear) keeps ~45 % of
  the light and the surface hue in a cast shadow; the form shadow keeps ~22 %; golden and sunset cast shadows mix toward
  a blue-violet replacement. Terminator 0.02-0.60 (soft). Cards take `cardTint` per key with `cardTintMix` (0.85 at
  night and under lamps), and rim light is down to a trace.
- **Grade, ink, sky** (`look.ts`, `three/post.ts`, `three/world.ts`): darker blacks, near-white highs and more
  saturation by day, plum darks at golden hour, saturated cobalt nights (sky #163c9e -> #3a5cc8); world ink 5.2 / 2.8,
  `distFar` 60, `hue` 0.2, more silhouettes and creases inked.
- **Cast house style** (`characters/kinds.ts CastBrand`, `BRANDS`, `Board.brand`): one choice per layer for the whole
  cast: face fill, ink, head superellipse, line law (`taper`: an ink copy shifted away from the key light under the
  fill), limbs (`sleeve`, `ink`, `tint`), hands (`fist`, `disc`, `ball`), eyes (`pill`, `baseLid`), torso (`bean`),
  ears / nose / shine, face shading (`gradient`). `BRANDS.calibration` is the measured reference family for engine
  tests only; `BRANDS.example` is an example house style. Sheet: `render.mjs --project charsheet --format long --stills 340`.
- **Sound and narration** (`audio/tighten.py`, `audio/score.py`): pauses capped at 0.08 s (0.14 s at sentence ends), no
  lead silence; quieter SFX defaults, flatter music sections, -2 dBTP; no swish on dissolves; the board passes its
  narration offset (`voOffset`) to the mix through `timeline.json`.

## Added in 1.10 (our cast: hair, faces, wardrobe modules)

- **Character modules** (`lib/characters/`): `kinds.ts` stays the drawing core and calls three modules first, so each
  can grow without touching it. `kit.ts` types the hooks and the helper kit (`part`, `limb`, `ell`, `rrect`, `poly`,
  `sePath`, `moved`, `shade`, `tint`, `mix`, bound to the character's ink, line and light).
  - `hair.ts`: `hairX(style, { view, cx, cy, r, lift, n, vol })` returns the front / back hair paths per view (front,
    three-quarter, profile); `HAIR_X_HX` makes room in the card for tall styles; `HAIR_X_TALL` swaps them for the cap
    under a hat.
  - `faces.ts`: `FACE_X_EXPRS` + `EX_X` extend the expression table (`KEXPRS_ALL`); `drawEyeX`, `drawMouthX` add eye
    kinds and mouths; `drawFaceFx` adds effects around the head; `drawSkinFx` draws skin marks
    (`BobbleSpec.marks`: freckles, stubble, wrinkles, ...) and conditions (`KPose.skin` or an expression's `skin`:
    sunburn, sick, pale, frozen, soot, ...) inside the head, under the features; `WIDE_X` opens the eyes wide.
  - `wardrobe.ts`: hats (`drawHatX`, `HAT_X_HX`), tops (`drawTopX`, `TOP_X_HEM`, `TOP_X_FLARE`, `TOP_X_SHORT`),
    prints (`top.pattern`, `top.patternColor`, `drawTopPattern`), garments behind the body (`drawTopBackX`),
    neckwear (`drawNeckX`) and held props (`StickHold.item`, `drawPropX`).
- **Our cast** (`lib/characters/ours.ts`): `OUR_CAST` (core ensemble + role library, each with name, role,
  personality, resting face, signature pose and prop, height and voice direction), `castEntry(id, more?)` for a board,
  `signaturePose(id)`, `extra(seed)` for deterministic background people. `node tools/castbible.mjs` writes
  `references/cast/ours-v1.md` and `.json` from the data.
- **Sheets** (`lib/sheetgrid.tsx`, a shared grid; page N at frame N*30+10; `SheetCell.scale` for true heights):
  `castsheet` (line-ups, heights, core turnarounds, silhouettes, extras), `hairsheet`, `facesheet`, `wardrobesheet`.
- **Frame rate (1.10.1).** Boards keep their timing in seconds at any fps: render a short at 60 fps with
  `make.mjs --fps 60` (`render.mjs --fps 60`); demo `doorphoto` is one.
