# What the reference style does now (craft sheet, measured 2026-11-13)

A frame-by-frame study (1832 frames, 30 fps, every frame measured) of the newest short of the reference channel in this
style showed a clear step up from the 20-short study of 2026-11-12. The single most important change: **the world is
rendered, only the characters are drawn.** Materials, bounce light, practical lights, glass and metal reflections carry
the picture; the 2D cards keep their ink. Everything below is numbers and rules in our own words.

## At a glance
| rule | target (median, range) | how to check |
|---|---|---|
| world ink | none on the world; creases read as engraved grooves (dark core ~2 px, light lip 1-2 px) | crop a set edge at 100 % |
| character ink | warm near-black (#170a0b-#200f10), 2-2.4 % of head width on the lit side, 5-8 % on the shadow side | crop a head |
| palette | one hue family per set: >= 85 % of chromatic pixels inside 30-90 deg hue for a warm interior; accents <= 5 % | hue histogram |
| grade (warm interior) | luma p50 0.30-0.38, saturation 0.47-0.55, warm shadows (a +8..+10, b +4..+6) | `vfa analyze` grade |
| grade (day exterior) | luma p50 0.47-0.57, saturation 0.27-0.44, cooler | same |
| light | 2-4 visible practicals per interior set; the subject stands in a pool ~2.3x the ambient; corners/centre ~0.6 | luminance map |
| card light | a card takes the local light: 0.33-0.45 in a dark corner up to ~1.0 in a pool, eased over ~9 frames | sample a face per shot |
| depth of field | practically off (background edges 1.0-1.4 px at 1080), subject separated by light | edge width behind the subject |
| sharpness | crisp, 1 px sharpening halo; no grain | edge profile |
| framing | solo characters centred (median 0.504 W, 21 of 22 inside 0.40-0.60) unless acting, entering, in a two-shot (heads ~0.33-0.41 / 0.63-0.76 W) or beside a hero object (0.32) | measure head centre |
| head size | medium shots: head ~32 % of the frame width (~0.18 of the height), eye line ~40 % from the top; close-ups 0.45-0.50 | measure |
| object close-ups | ~14 % of the runtime, centred above the caption line | shot list |
| joins | hard cuts on the onset of the word that names the new picture are now the default (16 of 23), dissolves 5-7 frames, joins hidden in motion; sentence ends cut 2-5 frames after the word dies away | shot list |
| camera | ~6x faster moves than ours; every shot pushes (net x1.25-1.45); crash zooms ~15 per minute on named nouns | motion analysis |
| captions | always at 0.706 H, 1-2 words per page | OCR |
| narration | ~3.8 words/s, sentence pauses ~0.14 s, no word tail ever clipped | alignment + energy |
| mix | music ~17 dB under the voice to the last frame; ~46 SFX a minute, ~12 of them real hits on visible actions | loudness |

## World and objects (how the premium look is built)
1. Every set and every held prop is a 3D object with real materials; only characters, captions and a few chalk overlays
   are 2D. Props in hands carry no outline.
2. Surfaces have texture amplitude (rock sigma L* ~4, rough wood 1-2, plaster 2-3); hero objects are spotless (paint
   sigma L* ~0.1). Every visible edge is bevelled (2-4 % of the panel size).
3. Sets are dressed densely: 10-17 prop types per interior shot, a foreground layer in most shots.
4. Metals and clearcoat reflect a sky / horizon / ground environment (a blue band over a warm ground line).
5. A premium vehicle has no outline: 30+ parts, 5 materials at least 20 L* apart, panel seams as thin mid-grey grooves
   (never near-black), a warm vertical paint gradient (L* ~100 at the top to ~93 at the sills), soft contact shadow.
6. Effects are simulated with motion blur: dust, debris, sparks, smoke; a full-frame dust veil can serve as a join.

## Characters
1. **Views follow the action.** Talking and reacting: front (about 70 % of character frames). Working on an object:
   three-quarter or looking down. Walking away, throwing: back. True profile is rare. Each main character has 5-9
   distinct view drawings, including three-quarter-back entrances, sitting and lying.
2. A three-quarter turn turns the body, not only the face: features shift ~0.11-0.17 face widths toward the facing side,
   closures move ~0.2-0.3 torso widths, the torso narrows to ~0.9x, the far hair mass shows behind the face. When a
   character turns to camera, the head leads the body by one frame.
3. Back views: a plain head with the hair cover, the hat unchanged, a plain torso with one vent line.
4. Cloth is matte with a textile layer (plaid grid, pinstripe, knit ribs, stitched straps) and a soft 16-20 L* gradient;
   highlights only on hats and shiny accessories.
5. Held props are lit 3D objects, at least ~0.25 head widths, readable side to the camera; layer order arm, prop, hand.
   Neck accessories sit within +-0.25 head widths under the chin, never on the shoulders.
6. Speech mouths change 12-14 times a second with the head still; blinks 2 frames; walks step every 3-5 frames.

## In our engine (1.11.2)
| what | where | status |
|---|---|---|
| rendered world: baked sets with practicals, no world ink | `tools/blender/build_set.py`, `lib/three/baked.ts`, `set: "baked"` | built |
| premium vehicle: clearcoat white gradient, painted-grey seams, horizon env, no outline | `build_set.py --set van`, `glbvehicle.ts` `look: "pbr"`, `horizonEnv` | built |
| every side of a character: continuous `yaw` (16+ drawings), back and three-quarter-back views | `kinds.ts` `viewOfYaw`, `view: "back" / "threeBack"` | built |
| world facing picks the view from the camera | board `act.face` / `act.yaw` | built |
| card takes the local light | board `act.light`, `CharacterCard.setExposure` | built (authored per beat) |
| matte cloth (no torso highlight bar), no drawn face shine | brand `torsoShine: false`, `shine: false` | built (per film) |
| framing: bigger heads, eyes at 40 %, centred solos | `shots.ts` `HEAD_FRAMING` | built |
| DOF nearly off, bloom knee 0.1, sharpening (`look.softness < 0`), ordered AO noise | `board.tsx` `DOF_BY_SIZE`, `post.ts` | built |
| tail-safe narration tightening (acoustic word ends) | `audio/tighten.py` | built |
| music ~17 dB under the voice | `audio/score.py --music-lu` | built |
| hard cuts on word onsets as default join | `board.tsx` join planner | not built (the user prefers soft joins: keep 5-7 frame dissolves) |
| crash zooms on named nouns, volumetric light cones, dust-veil joins | `shots.ts`, `fx.ts` | not built |

Sources: one short of the reference channel in this style, 1832 frames at 30 fps, measured 2026-11-13 (world, light,
characters, camera and audio passes).
