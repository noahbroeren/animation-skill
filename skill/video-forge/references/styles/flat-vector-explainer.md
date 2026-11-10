# Style profile: "flat vector explainer" (saturated flat-shape science animation)

How this profile was built:
- Measured from the long-form channel @kurzgesagt ("Kurzgesagt – In a Nutshell") on 2026-11-10 (256 videos, 142 shorts listed).
- Long-form: 10 videos = 9 popular ones (30 M-89 M views, uploaded 2014-2021) plus the newest upload. Per video I measured the **first 90 s** (hook, cold open, title) and **one 120 s window from the middle** (`vfa analyze` on cut-out clips, every frame at native 25 or 60 fps; 1080p/1440p). That is 20 clips, 35 minutes.
- Shorts: 7 (5 most-viewed, 13 M-20 M, plus 2 recent, 0.9-1.0 M), analysed in full.
- Every clip also got `vfa transitions` and `vfa stems` (Demucs); shorts also got `vfa ocr`. Hero breakdowns: the 89 M, 54 M and 35 M videos (`vfa breakdown`).
- Footage is not redistributed. Numbers and paraphrase only. Aggregates: `data/flat-vector-explainer_fingerprint.json` (modern long-form, 16:9) and `data/flat-vector-explainer-shorts_fingerprint.json` (9:16).

The style is the *system* below (flat shapes, saturated palette on deep navy, a continuous camera across an illustrated world), not the channel's topics or characters.

## 1. Eras

| | classic (2014-2015, n=4 clips) | modern (2016-2026, n=15 clips) | shorts (n=7, median 57 s) |
|---|---|---|---|
| frame | 2560x1440 @ 25 fps | 1920x1080/2560x1440 @ **60 fps** (true 60: 89-94 % unique frames) | 1080x1920 @ 60 (older 720x1280 @ 30) |
| background | light grey/white, flat | **deep navy / violet fields**, saturated colour cards | same art as modern |
| grade | luma 0.54, p1 0.17, sat 0.50, neutral shadows | luma **0.30**, p1 **0.10**, sat **0.86**, shadows magenta-blue (Lab a +22, b -31) | luma 0.22, p1 0.047, sat 0.77 |
| camera | moving 52 %, glide 10 f (0.4 s), snappy | moving **79 %**, glide **38 f (0.63 s)**, ease 9 f in / 12 f out | moving 78 %, glide 19 f (0.32 s), 6 f eases |
| edit | 0.25 hard cuts/min | **2.0 hard cuts/min**, ASL 24 s; 6/15 clips have ≤ 1 cut | **11.5 cuts/min**, ASL 4.8 s; 0/7 with ≤ 1 cut |
| audio | -13.3 LUFS | **-15.7 LUFS**, LRA 2.5, TP -2.6 | -13.1 LUFS, LRA 1.7 |
| speech | 2.70 w/s | **2.60 w/s** (IQR 2.51-2.79) | **3.24 w/s** (IQR 2.99-3.38) |

The modern look (navy field, neon-saturated shapes, slow eased camera, 60 fps) is the one to learn. Shorts are the same art compressed: 4x the cut rate, 25 % faster speech.

## 2. Script formula

Hooks (first narrated sentence of the 10 long-form intros):
- **big question** (3/10): "What is the largest X in the universe?", "What would happen if we ...?", "Are we the only ...?"
- **dramatic claim, second person** (3/10): "Every second of your life you are under attack.", "A war has been raging for billions of years ..."
- **imagine / you-story** (2/10): "Imagine you were alive in the 1980s ...", "You were on your way home when you died."
- **news cold open** (1/10, the 89 M video): date + event in two sentences
- (the newest upload opens on a 15 s sponsor/merch spot before the topic)

Voice starts within **0-3 s** (median 1.3 s in modern intros). Structure inside the first 90 s:
1. hook, then 2-4 sentences of **scale** (numbers stacked: "100 billion galaxies, each with 100 to 1000 billion stars")
2. a **rhetorical turn** ("But where is it?", "So what happens ...?")
3. a **meta-guide** with "let's": "Let's take a step back", "So, let's focus on ...", "Now, let's make this understandable" (repeated "let's"/"now" openers are the channel's signature)
4. a **title card** (channel logo + topic) after the cold open: at about 28-34 s in the 89 M video, music only
5. mid-video: one mechanism per 2-4 sentences, each illustrated by a new panel; humour beats are visual (a bird mascot reacting, tiny side jokes in labels)

Sentences are short: median **9-12 words** (whisper heroes). Pacing **2.6 words/s**, with sentence gaps of 0.1-0.35 s (p90) and occasional music-only breaths.

## 3. Camera and editing grammar

- **Few hard cuts, constant visual change.** Hard cuts 2.0/min (ASL 24 s), but content changes (any transition, `changes.py`) every **4.4 s** (13.0/min in intros, 12.5/min mid-video). The world is one long illustrated strip; the camera travels across it.
- **Transition mix** (`vfa transitions`): **wipes / panel slides are the signature** (32 % of scene changes), then whip-pans, dissolves and zoom-throughs; see 3a.
- **Camera:** moving on 79 % of frames, fast on 18 %; glides **38 frames at 60 fps (0.63 s)** with ease-in 9 f and a longer ease-out 12 f: quick lateral slides that settle softly. Jerk 24 (intros 29, mid 8.6: the body of the video moves more smoothly than the cold open).
- **Hero grammar** (89 M video): hold or slow creep while a panel is explained (creep/hold on about half the phrases), then a **lateral whip-slide of 0.4-1.3 frame widths** on the phrase boundary to the next panel ("pan-L 1.33w", "pan-L 1.05w"); a **giant zoom-through** (push x17 into the title, music only) carries the cold open into the title card.
- **Pull-outs reveal scale** (size-comparison videos): push-in shots only 33 %, pull-outs dominate when the story widens.
- **DOF on layers:** DOF ratio 1.64 (80 % of clips): foreground/background shapes are blurred to fake depth in a flat world.

### 3a. Transition mix (measured)

`vfa transitions` (heuristic classifier; spot-checked on the sheets). Share of all scene changes:

| type | modern long-form (15 clips, 207 changes = 7.8/min) | classic (4 clips, 7.1/min) | shorts (7, 16.1/min) |
|---|---|---|---|
| wipe / panel slide | **32 %** | 48 % | 18 % |
| whip-pan (lateral slide with blur) | 19 % | 18 % | 6 % |
| dissolve | 14 % (1.0/min) | 16 % | 11 % (1.5/min) |
| hard cut | 14 % | 0 % | **56 %** |
| zoom-through | 13 % | 12 % | 6 % |
| dip to black / white | 5 % / 3 % | 2 % / 2 % | 0 % / 2 % |

Soft transitions run at a median 8.0/min in modern long-form. In frames, a "wipe" is usually one panel sliding in over another (split-screen slides) or a big shape sweeping across the frame.

## 4. Look

**Palette and grade (modern):**
- deep, saturated backgrounds: luma mean **0.30**, contrast 0.18, **black floor p1 0.10** (navy, never pure black: clip black 0 %), white ceiling p99 0.87 (whites are used only for labels and highlights)
- **saturation 0.86** (HSV mean; p90 near 1.0), colorfulness 0.37, cool overall (warmth R-B **-0.19**)
- shadow/dark tint **magenta-blue** (Lab a +22, b -31): the "dark" colour is a navy-violet, not grey; highlights also lean magenta (a +17, b -14)
- palette per scene: one dark field colour (navy #252c7a, indigo #2c0075) + 2-3 neon accents (magenta #ef046b, mint #82fbd8, cyan #3ce7f9, violet #8474f5) + cream/white (sampled from keyframes)
- **no ink** (ink_on_edges 0.085: shapes separate by colour, never by outline), **no grain** (sigma 0.62), DOF on depth layers, soft glows on light sources (newest uploads add gradients and glow)
- classic era: flat white/grey backgrounds, low saturation (0.50), no DOF

**Shapes (from frames):** geometric primitives with rounded corners; a **lighter inner rim** on one side of each shape as the only shading; tiny bright sparkles and particles; consistent 2D "lighting" from the top-left.

## 5. Characters

- **Flat shape-built humans and mascots:** big round heads, small bodies (about 3-4 heads tall), dot eyes with one white catch-light (modern), no outlines, limbs as rounded strokes; skin and cloth in flat colours with one rim highlight.
- A recurring **bird mascot** (comic relief, speech bubbles with tiny jokes).
- Cells, viruses and animals are characterised the same way: a blob + two big eyes.
- Acting is pose-to-pose with small secondary motion (micro-animation activity 0.0015: mostly static shapes, the camera does the moving).

## 6. Typography and captions

- Long-form: **no burned-in captions**. On-screen text is labels: white bold geometric sans (rounded, Gilroy/Nunito-like) with thin leader lines (elbow lines with a dot), **section tags** as small saturated rectangles with white text at top centre (e.g. a magenta tag naming the subject), counters and simple charts on the navy field.
- Shorts (`vfa ocr`, 7 shorts): **2 words per page**, page 0.53-0.76 s, white heavy sans with a dark outline (0.07-0.08 em), sentence case, **no highlight colour**, centred at **73 % of height** (IQR 72-77 %), font size about **51 u** (smaller than the 79 u of 3D-explainer shorts), caption appears about +0.10 s after the word (IQR +0.02 to +0.19).

## 7. Sound

- **Master:** modern long-form **-15.7 LUFS**, LRA 2.5, TP -2.6 (quiet, safe headroom); shorts -13.1 LUFS, LRA 1.7.
- **Score under everything:** Demucs music presence **99.5 %** (IQR 98-99.9 %) and the music sits close to the voice: voice-over-music margin **9.2 dB** (IQR 7.4-11; the 3D-explainer shorts sit at 17 dB). Music stem about -25 LUFS.
- **Music stops are a device:** 8 deliberate music drops in 15 modern windows (about one per 3.5 min), before reveals and the title card. Shorts: presence 99 %, margin 15.8 dB, 3 stops in 7 shorts.
- Onset rate 3.3/s (long) and 3.6/s (shorts); non-vocal hits 1.7/s (long) and 2.75/s (shorts): soft UI-like pops on every label, whooshes on every slide.
- Voice: warm, clear, mid-tempo, slightly playful; never shouted.

## 8. Engine recipe (video-forge)

```
format  = long (2560x1440 @ 60) or short (1440x2560 @ 60); 60 fps matters: the camera slides are the motion
look    = LOOKS["flat-vector"] (below); no ink pass, no grain; DOF/bloom only on layered shapes and lights
world   = a 2D illustrated strip: React/SVG shapes in a Remotion composition, OR a Stage3D scene of flat
          planes (MeshBasicMaterial, no lights) at different z to get real parallax + DOF for free
camera  = cameraRig over the strip: one key per panel; glide 38 f, ease 9 f in / 12 f out; holds with
          rig.push { rate: 0.0005 } creep; lateral slides of 0.5-1.3 widths on phrase boundaries;
          zoom-through (push x10+) into the title card; pull-outs for scale reveals
edit    = 2 hard cuts/min max (long), 11/min (shorts); every cut on a word onset
type    = labels via KineticTitle/LowerThird restyled: white bold rounded sans, leader lines, coloured tags
          shorts: <Captions style="pop" maxWords={2} y={0.75} size≈51u /> white, dark 0.07 em outline
charts  = BarChart / Counter (restyle: flat fills, no gradients, white labels)
audio   = music.py pad+pluck bed under the whole runtime; pops on labels, swish on slides; master -15.5 LUFS
          (long) / -13.5 (short), TP -1.5
QA      = vfa qa FINAL --ref references/styles/data/flat-vector-explainer_fingerprint.json
```

The fingerprints are medians over 90 s / 120 s windows: compare a full render or its first 90 s. `speech_start_s` (1.3 s) was taken from the intro windows only. Use the `-shorts` fingerprint for 9:16 work.

Suggested Look preset (measured medians; colour saturation lives in the palette, so the grade stays near neutral):

```ts
LOOKS["flat-vector"] = deepMerge(base, {
  name: "flat-vector", tonemap: "none", exposure: 1.0,
  grade: { blackPoint: 0.0, whitePoint: 1.0, contrast: 1.0, saturation: 1.05, vibrance: 0.1,
    shadowTint: [0.01, -0.01, 0.03], highlightTint: [0.0, 0.0, 0.0] },  // darks lean navy-violet (Lab a +22, b -31 are mostly palette)
  ink: { enabled: false },
  dof: { enabled: true, maxBlur: 8, aperture: 1.0 },       // DOF ratio 1.64: blur foreground/background layers
  bloom: { enabled: true, threshold: 0.85, strength: 0.25, radius: 1.2 }, // glowing stars, lamps, sparkles
  vignette: { amount: 0.1, softness: 0.7 }, grain: { amount: 0, size: 1 }, motionBlur: 0.35,
});
// palette tokens sampled from keyframes: field #252c7a (navy) / #2c0075 (indigo) / #363785, magenta #ef046b, mint #82fbd8,
// cyan #3ce7f9 / #59d9dc, sky #43a4f8, violet #8474f5, cream #f0e1be, white #ffffff
```

## 9. Missing in the engine for this style

| missing | why it matters here | suggested implementation |
|---|---|---|
| **Vector shape primitives with the "rim highlight" style** | every object is flat shapes + one lighter inner rim | a `two/shapes.tsx` kit: rounded rect, blob, circle, star, with `rim={{side, width, lighten}}` rendered as an inset clip-path copy; or a three.js `flatRimMaterial` (MeshBasic + screen-space rim term). |
| **Vector shape morphing** | cells divide, blobs turn into icons, one panel morphs into the next | SVG path interpolation (normalize point counts, then lerp; e.g. a flubber-style resampler written in-house), driven per frame; `MorphPath` component with an ease. |
| **2.5D layered camera over a long illustrated strip** | the main "transition" is a lateral slide across one world | a `Strip` scene: panels laid out on x, each a group of layers at z in [-3, 3]; reuse `cameraRig` (orthographic or long-lens perspective) so parallax and DOF come for free. |
| **Flat-shape character rig** | simple big-head humans and blob creatures | a `CharacterSpec.style = "flatvector"` drawer in `characters/toon.ts`: no outline, dot eyes with catch-light, rounded stroke limbs, rim highlight, pose-to-pose with 2-frame overshoot. |
| **Label/callout system** | leader-line labels and coloured section tags on almost every panel | `Callout` (anchor point, elbow line, dot, label, draw-on) and `SectionTag` components with the rounded sans; stagger 4-6 f. |
| **Logarithmic scale zoom** | size-comparison videos fly through orders of magnitude | camera zoom in log space (`fov` or ortho zoom = exp(t)), with object LOD swaps per decade. |
| **2D particles and glow** | sparkles, stars, cell swarms | an instanced flat-sprite system (deterministic seed) plus bloom; `FxLayer` sprites are too cartoony/inked. |
| **Rounded geometric font preset** | labels and shorts captions | load a licensed rounded geometric sans (e.g. Nunito/Quicksand Bold, or a licensed Gilroy-like face) through `FontFace` and add it to `FONTS`. |
