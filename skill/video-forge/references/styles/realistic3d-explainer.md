# Style profile: "realistic 3D explainer" (photoreal CG micro-documentary shorts)

How this profile was built:
- Measured from the Shorts channel @zackdfilms on 2026-11-10 (4,161 shorts listed). I downloaded 25: the 20 most-viewed (98 M-255 M views each) plus 5 recent ones (3.6 M-8.1 M), at native 1296x2304 or 1440x2560, 29.97/30 fps, and analysed every frame with `vfa batch`.
- From contact strips I classified them by medium: **22 are fully CG ("cg3d")**, 2 mix live-action phone footage with CG inserts, 1 is pure live-action TV footage. All numbers below are the 22 CG shorts unless marked.
- Every CG short also got `vfa transitions`, `vfa ocr` and `vfa stems` (Demucs). Three hero shorts (255 M, 216 M, 157 M views) got word-level Whisper breakdowns (`vfa breakdown`).
- Footage is not redistributed. Numbers and paraphrase only. Aggregate: `data/realistic3d-explainer_fingerprint.json`.

Use it for any "how does X work / what happens if" topic. The style is the *system* below, not the channel's topics.

## 1. Two eras

| | classic hits (top 20, n=17 CG) | recent (n=5) |
|---|---|---|
| format | 26-45 s (median 30.7 s) "how / why / what if" mechanism explainers | 24-81 s, more narrative mini-stories ("He watched...", "(fiction)") |
| views | 98 M-255 M | 3.6 M-8.1 M (young uploads, not comparable) |
| world | studio-like: saturated sky-blue gradient void, macro body parts, cross-section cutaways | lit sets: night streets, interiors, underwater; moodier |
| grade | mean luma **0.52**, black floor p1 **0.098**, shadows warm (Lab a +6.0, b +4.9) | darker: luma 0.31, p1 0.043, shadows neutral, highlights warm (b +7.6) |
| camera | glide 23 f, fast frames 49 %, jerk 19 | glide 35 f, fast 66 %, jerk 46, push-in share 0.75 |
| render | 1296x2304 | 1440x2560 |

Lesson: the formula that produced the 100 M+ hits is the bright "object on a blue void + cutaway" explainer. The recent era leans cinematic (stylised-real humans, dark sets). Learn the classic system first.

## 2. Script formula

Measured over the 17 classic CG hooks (sentence 1, voice on frame 0-4: speech starts at a median **0.10 s**):

1. **Hook = second-person conditional or "when" scenario, 10-20 words**:
   - "If you <ordinary or odd act>, <consequence>" (9/17)
   - "When <everyday procedure> ..." (3/17)
   - "Have you ever wondered/noticed ..." or "Imagine ..." (2/17)
   - a bare surprising statement (3/17)
2. **Misconception set-up** in about 1 in 3 (5-6/17): "most people / you might / some people think X, **but** ...". The reveal sits in sentence 2-3.
3. **Mechanism, step by step**, chained with "then / once / as / after / which": one physical step per sentence, each one shown literally on screen.
4. **"You see,"** appears as the pivot in 4/17 classic transcripts (it introduces the hidden reason); "but" appears in 13/22.
5. **Payoff = the end state** ("...and the stitches are removed", "...float to safety"). No outro, no call to action. The last word ends the video.

**Pacing:** **2.67 words/s while speaking** (IQR 2.52-2.78), calmer than story shorts; almost no dead air (silence 0 %, pause p90 ≈ 0.14 s). Median 81 words per short (71-124). The 216 M splinter short runs 2.5-3.0 words/s per sentence with 0.2-0.4 s gaps between sentences.

## 3. Camera and editing grammar

- **One continuous camera, almost no cuts.** Median **2.0 hard cuts/min**, ASL 15 s; **13/22 shorts have at most 1 hard cut**, and the #1 short (255 M) is a single 31 s take.
- **But a new view every ~2.4 s.** Content-change events (any transition, `changes.py` on 0.5 s windows) run at a median **23 per minute**: the picture is renewed by camera travel, not by cutting.
- **Transitions are camera moves.** `vfa transitions` over the 22 CG shorts classified 133 scene changes: **90 % soft** (median 9.4 soft transitions/min). Mix: **whip-pans 31 %**, **zoom-throughs 26 %**, dissolves 13 %, dips to black 9 % (white 2 %), hard cuts 10 %, match cuts 2 %, wipes 2 %. Median soft length 22-31 frames on the heroes (armor short: 5 zoom-throughs + 1 dip in 29 s).
- **The camera never stops:** moving on **99.4 %** of frames, fast (>15 % of width/s) on **54 %**, median speed 0.14 frame widths/s.
- **Glides about 24 frames** (IQR 14-37) with short **5-frame** ease-in and ease-out: quick, decisive moves, then a slow drift. Jerk RMS 21.8 (classic 19), i.e. smooth CG camera paths, no handheld.
- **Push-ins dominate** (63 % of shots). Hero grammar, one move per sentence:
  - stitches (255 M): sentence 1 push x2.18 into the wound; 2 push x1.78; 3 push x1.39 while tilting down into the tissue; last sentence pulls back out x0.10 to the whole leg ("healed"). A 14.7 s ease-in-out macro dolly carries the middle.
  - splinter (216 M): push x1.05, then a fast pull/tilt up (whip) to reveal the cutaway, push x1.48 into the swelling, then two pulls (x0.97, x0.71) back to the skin surface for the payoff.
  - armor (157 M): one 29 s take; push x13 from the shooter to the plate, then a fast push x4.8 / pan 1.4 widths to the arrow.
- **Structure = push in to explain, pull out to resolve.** Cutaways happen INSIDE the move: the camera flies into the body and the outer layer is sliced away.

## 4. Look

**Grade (classic CG):**
- bright, clean, high-key: luma mean **0.52**, contrast (luma std) **0.19**
- **lifted black floor p1 0.096** (IQR 0.045-0.119), white ceiling p99 **0.89** (soft highlight roll-off, clip white 0.4 %)
- saturated: HSV mean **0.48**, colorfulness 0.25
- shadows slightly **warm red-orange** (Lab a +3.7, b +2.7 overall; +6.0/+4.9 in the classic set): skin and flesh warm the darks
- background = **saturated sky-blue gradient void** (sampled #0073a4-#0e92b9 at the edges, #4293ca-#44aee0 in the centre: a radial falloff, no horizon), complementary to the warm skin/flesh subject

**Lens:**
- DOF ratio median **1.22** (IQR 0.93-1.47); 36 % of shorts clearly isolate the subject. Macro shots get a strong blur, wide shots stay sharp.
- **No grain** (sigma 0.59, i.e. clean digital), no ink (ink_on_edges 0.18 = natural edge darkening only)
- soft contact shadows, glossy wet speculars on organic surfaces (subsurface look)

**Materials and staging (from frames):**
- PBR photoreal objects: skin with pores and hair, glossy flesh, bone, metal tools, wood
- **cross-section cutaways**: skin layers, fat globules, veins and arteries colour-coded (red/blue), nerves as white lines
- glowing particle swarms for cells and bacteria (yellow-green emissive spheres), white glowing arrows as in-world annotations
- the channel brand appears as a logo on in-world props (shirts, armor plates, car doors): branding without an end card
- micro-animation is high (activity median **0.0195**): the process itself animates (tissue grows, fluid fills, pus swells)

## 5. Characters

- **Photoreal rigged humans** (game-asset / character-creator quality), shown mostly as **body parts in macro** (leg, finger, mouth, arm) or mid shots. Faces appear in about a third of shorts; expressions are broad (pain, surprise).
- Proportions are real-world (7-7.5 heads). Clothing is plain (t-shirt, shorts), often carrying the channel logo.
- Recent era: stylised-real faces (slightly enlarged eyes, smooth skin), multi-character scenes, warm practical lighting with dark vignettes.

## 6. Captions (`vfa ocr`; 21/22 CG shorts have burned-in captions)

- **2-3 words per page** (median 2, IQR 2-3; page 0.8-0.9 s), hard swaps, sentence case (uppercase share 2 %)
- **white heavy sans** (Montserrat Black/ExtraBold-like; stroke 0.17 em) with a **thin dark outline** (about 0.04 em) and no box
- centred at **78.2 % of height** (band 0.76-0.81), font size about **79 u** (1 u = 1 px at a 1080 short side), ink height 4.1-4.4 % of H
- sync: page appears about **+0.05 s** after the word starts
- the oldest top hit has no burned-in captions at all; safety notes ("DO NOT ATTEMPT") sit in italic caps at the top

## 7. Sound

- **Master: loud.** -11.65 LUFS (IQR -12.1 to -8.9), LRA **1.8** (very compressed), and the reference **overshoots true peak (+0.95 dBTP median)**. Do not copy that: master at -12 to -13 LUFS with TP ≤ -1 for headroom against platform normalisation.
- **Music bed under everything**: Demucs music presence median **99 %** (IQR 97-100 %), soft (music stem -21 to -32 LUFS) and **17 dB under the voice** (median per-sentence margin, IQR 14.8-20.6 dB); no deliberate music stops.
- **SFX are literal and dense:** onset rate 3.26/s overall, **2.1 non-vocal onsets/s** (IQR 1.1-2.8): squelches, stabs, whooshes on each whip or zoom-through.
- Voice: calm, neutral male narrator, close-miked, dry.

## 8. Engine recipe (video-forge)

```
format  = short (1440x2560 @ 30), 26-40 s, voice from frame 0, 2.6-2.8 words/s
look    = LOOKS["realistic3d-bright"] (suggested below) ; lookTimeline([[0,"realistic3d-bright"],[cutaway,"realistic3d-bright"+dof]])
world   = Stage3D: studio-style void = sky(scene, "#0e7fb0", "#44aee0")  // sampled: #0073a4-#0e92b9 edges, #4293ca-#44aee0 centre + hemisphere light + warm key + soft shadows
          real assets via GLTFLoader (CC0 / licensed human, organs, tools), PBR materials, env map
camera  = cameraRig(one key per sentence, glide 24 f, ease 5 f in/out; push-in default; final key = pull-out)
          rig.push { rate: 0.002-0.003 } between keys so frac_creep ≈ 0.99; NO handheld
          transitions = whip-pan keys (6-10 f, motionBlur 0.5) and follow-object / zoom-through keys (camera flies INTO
          the next subject) instead of cuts; a new composition every ~2.4 s;
          real cuts only on a word onset, ≤ 2/min
fx      = FxLayer for arrows/sparkles is too cartoony: use emissive instanced spheres (cells) + 3D arrow meshes
captions= <Captions style="pop" maxWords={3} y={0.78} />  (white heavy sans, thin dark outline, no highlight colour)
audio   = music.py calm bed for the whole runtime at -14..-18 LU under voice (no stops); sfx on every zoom-through
          and on each physical step; master -12.5 LUFS, TP -1 (better than the reference's +0.95 dBTP)
QA      = vfa qa FINAL --ref references/styles/data/realistic3d-explainer_fingerprint.json
```

Suggested Look preset (measured medians mapped to the `Look` type; do not paste blindly, test-render first):

```ts
LOOKS["realistic3d-bright"] = deepMerge(base, {
  name: "realistic3d-bright", tonemap: "aces", exposure: 1.05,
  grade: { blackPoint: 0.09, whitePoint: 0.90, contrast: 1.0, pivot: 0.45, saturation: 1.2, vibrance: 0.15,
    shadowTint: [0.015, -0.004, -0.012],   // warm red-orange shadows (Lab a +3.7, b +2.7)
    highlightTint: [0.0, -0.002, -0.004] }, // neutral highlights
  ink: { enabled: false },
  dof: { enabled: true, maxBlur: 10, aperture: 1.2 },   // DOF ratio 1.22 median; strong on macro, off on wides
  bloom: { enabled: true, threshold: 0.9, strength: 0.15, radius: 1.0 }, // emissive cells/particles only
  vignette: { amount: 0.08, softness: 0.7 }, grain: { amount: 0, size: 1 }, motionBlur: 0.5,
});
// recent "cinematic story" variant: blackPoint 0.04, luma ~0.31, vignette 0.35, warm highlights (+b): start from "cinematic-film".
```

## 9. Missing in the engine for this style

| missing | why it matters here | suggested implementation |
|---|---|---|
| **Rigged realistic humans with deterministic animation** | every short has a photoreal person or body part | `GLTFLoader` + `THREE.AnimationMixer`; in `update(f)` call `mixer.setTime(f / fps)` (never `update(delta)`) so frames are deterministic. Ship a `loadRigged(url)` helper that returns `{root, clips, setTime}`. Source CC0/licensed rigs (Mixamo-style) and retargeted clips. |
| **PBR + image-based lighting helpers** | photoreal skin, metal, wet tissue | `RGBELoader`/`EXRLoader` + `PMREMGenerator` env map; `MeshPhysicalMaterial` with `sheen`, `clearcoat`, `transmission`; add `lights(scene, "studio-blue")` preset = sky-blue void + warm key. |
| **Skin / flesh subsurface look** | glossy translucent tissue is the visual signature | cheap SSS: wrap-lighting term + red-shifted back-light in an `onBeforeCompile` chunk (same hook style as `toonifyMaterial`), plus thickness map. |
| **Cross-section cutaways** | the reveal of most hits | `material.clippingPlanes` driven per frame + a cap mesh (stencil-capped section) and a `cutaway(object, plane, f0, f1)` animator. |
| **Procedural growth / morph-target animation** | wounds closing, pus swelling, tissue filling | `morphTargetInfluences` keyed per frame from the beat table; a `grow(mesh, f0, f1, ease)` helper; displacement-map animation for swelling. |
| **Instanced particle swarms (cells, bacteria, fluids)** | glowing cell swarms are in most cutaways | `InstancedMesh` of emissive spheres with seeded flow-field motion (deterministic per frame), bloom-only on them. |
| **Zoom-through transition between scenes** | whip-pans + zoom-throughs = 57 % of all scene changes | a scene transition that keeps flying the outgoing camera forward through a surface and hands off to the incoming scene's first key (match the forward velocity), 22-31 frames. |
| **Heavy-sans caption preset with thin outline** | 2-3 word pages at 78 % height | add `style:"outline-heavy"` to `Captions` (Montserrat Black via FontFace, 0.04 em dark stroke, sentence case). |
| **Loud short master preset** | -11.65 LUFS / LRA 1.8 measured | `mix.py --target -12.5 --tp -1` preset "short-loud"; never exceed TP -1. |
