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
(`words.slice(first, last + 1)`). See `references/characters.md` section 4 for the full phoneme/viseme tables.

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
report.md. See `references/director-loop.md`.

**Character kinds (`lib/characters/kinds.ts`, build specs in `references/characters.md`).** Seven kinds beyond the
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
