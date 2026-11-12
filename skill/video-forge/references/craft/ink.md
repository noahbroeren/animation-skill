# Ink (craft sheet)

World ink is what makes the 3D set read as drawn: thin, dark (not black) lines on silhouettes, depth jumps and
creases, a little thicker near the camera, thinner and lighter far away, drawn before the depth of field so they blur
with the background. The characters carry their own, heavier line (about twice the world line). The single most
important rule: coverage matters as much as width; the world line has to be on about a third of all edges and on
roughly 3 % of the pixels, not just the right number of pixels wide.

Units: u = 1 px at a 1080 px short side (0.093 % of the frame width W in 9:16); widths are FWHM (full width at half
depth of the line) measured on 1080-wide frames.

## At a glance

| rule | target (median, range) | how to check |
|---|---|---|
| near world line (a few metres from the camera) | 5.8 u (region IQR 3.8-7.2) ≈ 0.54 % W; rule 4-6 u | FWHM snippet below |
| mid distance | 4.1 u (3.7-4.3); rule 3-4 u | same |
| far | 3.9 u (2.8-6.0); rule 2-3 u; aerial distances 0.9-1.8 u | same |
| macro insert (a small prop filling the frame) | 12.1 u (11.8-12.9); rule 10-12 u ≈ 1 % W | same |
| world line : character outline | about 1 : 2 (character outlines 9-14 u) | same, on a medium shot |
| line core | L* 17.7 (IQR 13.9-22.3); far cores lift to L* ≈ 40; never pure black | Lab at the line centre |
| ink pixels per frame | 2.8 % (IQR 1.6-4.5 %) | `vfa analyze` `ink_density` |
| edges carrying a dark line | 0.35 | `vfa analyze` `ink_on_edges` |
| painted texture lines (plank gaps, mortar, joints) | 0.7-0.9 x the ink width at their usual distance, half the contrast (ΔL* 15-25) | FWHM + core L* |
| what is inked | silhouettes, the near side of depth jumps, convex creases | stills at native size |
| what is not | the characters (own line), sky, effects, light shafts; often the stock photoreal assets | stills |
| ink and depth of field | lines blur with the background (ink before DOF) | close-shot still |

## How it is built

1. **Edges from geometry, not from colour.** Silhouettes and occlusion edges come from jumps in depth; only the NEAR
   side of a jump is drawn, so the line sits on the object in front. Creases come from a change of surface normal
   between neighbouring pixels at the same depth.
2. **Width follows distance.** About 4-6 u near, 3-4 u at mid distance, 2-3 u far, thinning to 1-2 u on aerial views;
   far lines also lighten toward the surface colour (core L* ≈ 40) and finally fade out.
3. **Dark, coloured, not black.** The line core sits around L* 18. At night lines take the local hue (a navy line on a
   night wall). A dark violet-black ink mixed a little toward a dark version of the surface colour does this.
4. **Painted lines are a separate layer.** Plank gaps, mortar, tile joints and paving joints are painted into the
   textures, thinner and at about half the contrast of the ink (`craft/textures.md`). A wall-to-floor seam inside a
   room is usually such a painted or shaded change, not a heavy ink line.
5. **Characters keep their own line.** The card's drawn outline is about twice the world line and thicker on the side
   away from the key; the world pass never draws over or around a card.
6. **Inserts draw heavier.** A small prop shot to fill the frame gets about 12 u lines, so it reads as the same drawing
   at a larger scale.
7. **Ink before blur.** The lines are composited before the depth of field, so a blurred background has blurred lines
   and a sharp subject has sharp ones.
8. **Photoreal stock assets are the exception, and the variation is real.** In at least 11 of 20 shorts the whole world
   is an inked, flat-painted set; in 4 of 20 some stock assets (a physically shaded vehicle, a photo road texture, 3D
   grass, a fabric-textured prop) carry few or no lines next to inked sets and inked characters. When it happens it is
   all-or-nothing per object: an asset is either fully inked or deliberately left as a contrast object.

## Rules

1. World ink FWHM: 4-6 u near, 3-4 u mid, 2-3 u far (1-2 u on aerials); macro inserts 10-12 u.
2. World line ≈ 0.5 x the character outline in the same shot (0.4-0.6).
3. Line core L* 10-25 near, lifting with distance (far ≤ L* 45); never pure black (L* < 5) and never the caption
   outline's black.
4. Ink pixels 2-4 % of the frame (captions masked); `ink_on_edges` 0.30-0.40.
5. Silhouettes and the near side of depth jumps always; convex creases sharper than about 15-30°; concave room seams
   only when they matter for the read.
6. Painted texture lines: 0.7-0.9 x the ink width at viewing distance, ΔL* 15-25 against the fill.
7. No world ink on or around character cards, sky, effects, light shafts, contact blobs or particles.
8. A stock asset is either inked like the set or left un-inked on purpose; never half-inked.
9. Ink is composited before the depth of field and blurs with it.
10. Line width never animates inside a shot except with distance.

## In our engine

The ink pass lives in `lib/three/post.ts` (`INK_MASK`, `INK_COMP`); its parameters are `look.ink` in `lib/look.ts`
(toonBase). Pass order: MSAA scene → INK → DOF → BLOOM → FINAL.

| what | where (file / field) | 1.9 value | status |
|---|---|---|---|
| near / far width | `look.ink.widthNear` / `widthFar` at `distNear` / `distFar` | 5.2 u at 6 m, 2.8 u at 60 m; log-distance blend (≈ 4.0 u at 19 m) | built |
| far fade | `INK_MASK` | fades out between 2 x and 6 x `distFar` (120-360 m) | built |
| depth-jump test | `INK_MASK` 2nd difference of 1/z | smoothstep(0.004, 0.014), near side only | built (1.9) |
| crease test | `INK_MASK` normals at equal depth (within 2 %) | 1 − smoothstep(0.86, 0.96, N1·N2); width = `creases` x line width | built; partly: convex and concave creases are treated alike |
| crease width | `look.ink.creases` | 1.0 (crease lines as wide as silhouettes) | built |
| ink colour | `look.ink.color`, `hue` | #140c10 (L* ≈ 4), hue 0.2 (lines lean toward a dark version of the surface) | built |
| line shape | `INK_COMP` | 3 x 3 tent on the mask, blended in display gamma | built |
| never inked | layer `NOINK` (3) | cards, sky, FX, `sunPatch`, `lightShafts`, set smoke, `motes`, contact blobs | built |
| no ink over cards | `INK_MASK` main-depth test | a card in front (depth < 98.5 % of the world's) blocks the line | built |
| ink before DOF | `PostPipeline` order | INK → DOF | built |
| per-shot width (macro inserts) | — | — | not built: no shot-size ink on boards |
| object-ID edges, painted line weights | — | — | not built (`research/toon-shading.md` D5) |

How to use it. A non-board project can set the width per frame; on a board the place look is the only lever today:

```ts
// non-board project: heavier lines during a macro insert
<Stage3D look={(f) => (f >= T.insert && f < T.insertEnd ? deepMerge(LP.look(f), { ink: { widthNear: 11, widthFar: 6 } }) : LP.look(f))} ... />
// board: a place used only for the insert (its look replaces the interior lift, so add the gamma back if needed)
places: { benchMacro: { set: "workshop", opts: { era: "old" }, look: { ink: { widthNear: 11, widthFar: 6 } } } },
// a stock asset left un-inked on purpose (NOINK also skips the toon block: it keeps its own shading)
car.traverse((o) => o.layers.set(NOINK));
```

## Check

- `vfa analyze FINAL.mp4 --out QA`: `ink_density` ≈ 0.028 and `ink_on_edges` ≈ 0.35; `vfa compare` lists both
  against the reference fingerprint.
- Width on a full-resolution still (PNG): take a short luminance profile across one world line.

```python
import numpy as np, PIL.Image as I
im = np.asarray(I.open("still.png").convert("L"), float)
row = im[1200, 400:440]                      # a horizontal profile across one vertical line
bg, core = np.median(row), row.min()
half = (bg + core) / 2
fwhm_px = (row < half).sum()
print("FWHM", round(fwhm_px * 1080 / im.shape[1], 1), "u")   # scale to a 1080-wide frame
```

- Compare a world line with a character outline in the same still (ratio about 0.5), and a near line with a far one.
- **Failure looks like:** a set that reads as an unlit CG render (coverage < 1.5 %), lines that look like a filter
  (black, even width near and far), heavy lines on every room corner, a grey sticker edge around a character, or an
  insert whose lines are thinner than the hand holding the prop.

## Common mistakes

1. **Too little coverage.** The coin short drew ink on 1.5 % of the pixels (IQR 0.7-2.9 %) against 2.8 %, and
   `ink_on_edges` rose only from 0.18 to 0.21 over the review rounds (reference 0.35). 1.9 lowered both thresholds
   (depth 0.007 → 0.004, crease 0.80 → 0.86) to catch more silhouettes and creases; measure it again on the next render.
2. **A world line far thinner than the character line.** In 1.8 the world line was 3.0 u with hue 0.22: about six times
   thinner than the character outline (the reference is about 1 : 2). It went to 4.2 u, then 5.2 u.
3. **Props without lines.** Props held next to inked characters looked pasted until 1.8.1 raised the near width.
4. **A wrong rule from an older study.** "Near-constant ~3 px" came from an outside study; region-by-region FWHM gives
   5.8 u near, 4.1 u mid, 3.9 u far and 12 u on inserts. This sheet replaces that line in
   `styles/toonworld-explainer.md`.
5. **Blur everywhere.** On an earlier short, the round that turned depth of field on for every day shot also dropped
   `ink_on_edges` from 0.35 to 0.30: blurred backgrounds blur their lines. Keep DOF to close shots (`craft/depth.md`).

## Sources

Private frame study of the 20 newest shorts of a reference channel in this style (35,987 frames at 30 fps; 692,000 line
width samples; 14 hand-picked regions), 2026-11-12; cross-checked against an outside study of the same channel;
background: `references/research/toon-shading.md` (A2, A3, B9, B10, D5), `references/research/rendering.md` (B5).
