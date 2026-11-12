# Textures (craft sheet)

Materials in this style are flat colour fields with thin painted lines. The detail lives in the lines (plank gaps,
mortar, tile and paving joints) and in small value steps between elements, not in noise: a flat patch of any material
varies by only σL* 0.5-3.8. The single most important rule: no speckle, no photographic noise, no cobble dots; paint
one thin line where a real joint would be and keep every fill quiet.

Units: u = 1 px at a 1080 px short side; σL* = robust spread of CIE L* in a 96 x 96 px patch at 1080 (IQR / 1.35);
"high-frequency share" = how much of a patch's variation sits in fine detail (0 = smooth gradient, 1 = all fine detail).

## At a glance

| rule | target (median, range) | how to check |
|---|---|---|
| noise inside a material patch | σL* 0.5-3.8 (median ≈ 1.7); limit ≤ 4 | patch snippet below |
| fine grain / image noise | none: σ 0.02 (8-bit) in flat areas | `vfa analyze` `grain_sigma` (≈ 1 or less = clean) |
| sky | smooth gradient, σL* 1.3, high-frequency share 0.01 | patch on a still |
| water | broad gradient band σL* 3.8 + sparse dash crests and glints | still |
| sand, dirt, paths | broad gradient only, σL* 3.1, no specks | patch |
| wood | flat planks, soft grain strokes (σL* 1.4, high-frequency 0.11), dark gaps | patch + line profile |
| brick | flat fill σL* 0.5 + thin mortar lines (the lines carry the detail: high-frequency 0.51) | patch |
| grass | flat fill with broad patches 16-40 u + sparse flowers; never blades | still |
| fabric | flat per face, soft mottling σL* ≈ 2 | patch |
| painted lines | 0.7-0.9 x the ink width at viewing distance, ΔL* 15-25 (half the ink contrast) | line profile (`craft/ink.md`) |
| element-to-element steps (planks, bricks, tiles) | small: ±3-6 % in value | means of neighbouring elements |
| exception | stock 3D grass measured σL* 10.8: avoid it, it reads as a different film | patch |

### Per material

| material | what the reference shows | target for us |
|---|---|---|
| sky | a smooth two- or three-stop gradient; flat cumulus with blue or lavender undersides, sometimes outlined; night: cobalt with stars and a moon halo | gradient dome; flat cloud cards with a cool underside; no cloud texture noise |
| water | a vertical far-to-near gradient band, short dash waves or crest marks with darker troughs, a few glints; no mirror reflection | shader water (gradient + crests + glints) |
| grass | one flat green with broad soft patches (16-40 u across) and a few flowers; stock-asset grass is the one noisy exception | flat green, 20-30 broad patches, ≤ 20 flowers per texture |
| wood | one tone per plank with small steps between planks, a few soft grain strokes, dark gaps; low-poly staves show one tone per facet | per-plank ±3-6 %, ≤ 6 faint grain strokes per plank, gap at half the ink contrast |
| brick | flat brick colour with thin mortar lines; almost no variation inside a brick | ±3 % per brick, no blotches, mortar at half the ink contrast (dark joints only where a dark backdrop must separate a light face) |
| stone, paving | flat slabs with thin joints; no rounded cobbles, no dots | flat slabs + 3 u joints at half the ink contrast |
| plaster, painted walls | flat with a very gentle drift; a grime band at the foot is fine | flat fill + shader drift (±3 %); no speckle |
| tiles | flat tiles with thin dark joints (floor tiles: about 2 u, core L* ≈ 9) | flat tiles + joints, ±3-6 % per tile |
| fabric | flat per face (chroma kept), soft mottling σL* ≈ 2; prints are flat shapes | flat colour; a print as flat shapes, not a photo |
| metal | no texture: a gradient and a specular band from shading (`craft/shading.md`) | flat colour; shading does the work |
| sand, dirt | broad gradient only (σL* 3.1) | a low-contrast gradient; no specks |
| snow | cream with lilac shading, falling flakes as soft dots | flat cream; shade carries the lilac |

## How it is built

1. **Pick a flat base colour per material** (the palette of `craft/grade.md`): the fill is the colour the viewer reads.
2. **Add element steps, not noise.** Planks, bricks, tiles and slabs differ from each other by ±3-6 % in value; inside
   an element the fill is flat.
3. **Paint the joints.** One thin line per real joint, 0.7-0.9 x the ink width at the distance the surface is usually
   seen from, and about half the ink's contrast (ΔL* 15-25): a texture line must read lighter than an ink line.
4. **Keep it big.** Patches on grass and sand are broad (16-40 u at 1080 and larger); anything smaller than ~4 u
   becomes noise after compression and changes with the camera.
5. **Let the shader add the life.** A world-space drift of about ±3 % (the toon shader's `drift`) and the lighting
   (cloud shadows, window patches) break up large planes; the texture stays calm.
6. **Leave detail to geometry.** Real edges (a plank end, a step, a shelf) get ink from the ink pass; a texture never
   imitates an ink line.
7. **Stock assets are kept separate.** A photoreal asset is either repainted flat or used as a deliberate contrast
   object (`craft/ink.md`).

## Rules

1. σL* ≤ 4 in any 96 px patch of a single material at 1080 (stock grass excepted, and avoid it).
2. No speckle or dots smaller than 4 u at the usual viewing distance.
3. Element-to-element value steps ±3-6 %; inside an element ≤ ±2 %.
4. Painted lines 0.7-0.9 x the ink width at viewing distance and ΔL* 15-25 against the fill.
5. No cobbles, no blade grass, no photo textures on painted sets.
6. Sky σL* ≤ 1.5; water and sand ≤ 4 with broad bands, not grain.
7. Frame grain σ < 0.3 (8-bit) in flat areas; the dither is the only noise.

## In our engine

Painted textures are canvas drawings in `lib/three/textures.ts` (`paint.*`, `flat.*`) and `lib/three/world.ts`
(`brickTexture`, `asphalt`, `cloudCard`); the sets in `lib/three/sets.ts` pick them per set. The toon shader adds
`drift` (0.03 at scale 0.12).

| what | where (file / field) | 1.9 value | status |
|---|---|---|---|
| flat grass | `flat.grass` | 26 broad patches (alpha 0.5) + 14 flowers r 3.5 px | built; the ground around the `street` and `road` sets |
| blade grass | `paint.grass` | 90 patches + 2,600 blades | mismatch: reads as noise; used by the `yard` set and `ground()`'s default |
| flat tiles | `flat.tiles` | per-tile variation, 5 px joints | built |
| flat stone slabs | `flat.stone` | slabs ±3 % value, 6 px mortar, lit top strip | built |
| cobbles | `paint.cobble` | ellipse cobbles with highlights on a dark ground | mismatch: not in the reference; the old `street` and `alley` sets use it (a flat slab floor is not built) |
| planks | `paint.planks` | 6 planks, 14 grain strokes each (alpha 0.5), 4 px gap #2a1a10, knots | partly: grain is busy and the gap is near ink black (ΔL* ≈ 39 on mid wood) |
| bricks | `brickTexture` | per-brick lightness ±9 %, 12 % burnt bricks, blotches on 30 %, lit top / shaded bottom edge, dark mortar #3e2c28 | partly: more variation than measured (σL* 0.5); dark joints are a deliberate value choice behind faces |
| plaster | `paint.plaster` | 110 value blobs ±7 % (alpha 0.35), 900 speckles, chipped-brick patches, grime band | partly: speckle and blob noise above the rules |
| path / dirt | `paint.path` | 500 specks ±10 % (alpha 0.6) | mismatch: specks instead of a broad gradient; the old-era `road` uses it |
| water | `toonWater()` (shaders.ts); `paint.water` | gradient + crests + glints; 160 strokes | built (shader); partly (`paint.water`, busy) |
| sky and clouds | `sky()`, `cloudCard()` | gradient dome; flat puffs with a cool underside (alpha 0.25) | built; outlined or moonlit clouds not built |
| roof tiles | `paint.roofTiles` | rows of tiles with darker edges | not measured |
| set floor choice | `SetOpts` | no floor option | not built: a board cannot swap a set's floor texture |
| flat planks, flat plaster, sand gradient, fabric prints, snow | — | — | not built |
| texture noise QA (σL* per material) | — | — | not built: use the snippet |

How to use it: build your own props and floors from the `flat.*` textures (board props are toonified and inked like
the set).

```ts
import { flat } from "../../lib/three/textures";
props: {
  slabs: () => {                                   // a flat slab floor laid over a set's cobbles
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshLambertMaterial({ map: flat.stone("#c2b2a5", "#9d8f82", [4, 4]) }));
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
    return m;
  },
},
beats: [{ at: 0, place: "street", gag: { prop: "slabs", at: [0, 0.012, 0], in: "none" } }, /* ... */],
```

## Check

Measure a 96 px patch of one material on a full-resolution still (PNG, scaled to 1080 wide, away from lines):

```python
import cv2, numpy as np
img = cv2.imread("still.png"); img = cv2.resize(img, (1080, int(img.shape[0] * 1080 / img.shape[1])))
L = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)[..., 0].astype(float) * 100 / 255
p = L[1300:1396, 500:596]                        # one material, no ink or joints inside
q75, q25 = np.percentile(p, [75, 25]); print("sigma L*", round((q75 - q25) / 1.35, 2))
```

- Each material ≤ 4, sky ≤ 1.5. A joint: profile it like an ink line (`craft/ink.md`): about 0.8 x the ink width and
  a core ΔL* of 15-25 against the fill.
- `vfa analyze`: `grain_sigma` about 1 or less; `edge_density` rises with painted lines and dressing, not with noise.
- **Failure looks like:** sparkly or dotted floors after compression, grass that shimmers when the camera moves, wood
  that reads like a photo, joints as dark as the ink, or a wall with blotches that compete with the face in front of it.

## Common mistakes

1. **Cobble dots on the street and the alley.** The coin short's old-town floors used `paint.cobble`, a texture the
   reference never shows. Use flat slabs with thin joints.
2. **Warm wood and brick everywhere.** Five of the coin short's eight places were old-era rooms of wood, brick and
   terracotta walls: red-orange and orange took 48.7 % of the chroma (reference 28.8 %) and yellow + grass green 0.8 %
   (11.4 %). Choose materials with the hue budget in mind: plaster, tiles, painted walls, sky and grass.
3. **"Flat reads cheap" was half right.** The texture kit was first built on the idea that visible grain reads as
   quality. Measured: the fills are flat (σL* 0.5-3.8); what reads as quality is the painted joint, the per-element
   step and real geometry with ink. Plaster speckle (900 dots) and blade grass go the other way.
4. **Dark joints as a fix for value.** Dark mortar (#3e2c28) was made the default so light faces separate from brick
   walls. That works as a backdrop choice; on a wall seen up close it doubles the ink. Use it on purpose.

## Sources

Private frame study of the 20 newest shorts of a reference channel in this style (35,987 frames at 30 fps; texture
patches and line profiles on native-resolution frames), 2026-11-12; background: `references/research/toon-shading.md`
(B17, B18), `references/research/colour.md` (D3, D4), `references/research/rendering.md` (B9).
