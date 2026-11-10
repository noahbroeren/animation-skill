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
