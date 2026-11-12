# Effects (craft sheet)

Effects make the claim of a sentence visible and give every beat a little event: a glint on the object that matters,
a puff when something lands, a ring on a hit, a beam of light through a window, a white-out on the big turn. A short
uses about 20 different effect types (one new type every ~3 s), most of them small and brief. The single most important
rule: effects carry information, so what glows is what the narration is about, and every effect lives in the scene's
light (smoke and dust are shaded, glows bloom only where light is made).

Units: frames at 30 fps; W = frame width; u = 1 px at a 1080 px short side; head sizes as a fraction of the
character's head width. "Shorts" = how many of the 20 studied shorts show the effect at least once.

## At a glance

| rule | target (median, range) | how to check |
|---|---|---|
| distinct effect types per short | 20 (14-30) | list the board's `gag.fx`, props and light events |
| information glow on the object that matters | 17 of 20 shorts; on in 6-11 f; halo 1.3-3 x the object | stills on the word |
| sweat drop | 17 of 20; 4-12 % of the head width (≈ 6 %); pops in 1 f and holds | still |
| light shafts | 15 of 20; ≈ 24 % white over the surface; 11-350 f | still (`craft/lighting.md`) |
| 4-point star glint | 15 of 20; 15-60 u (1.4-5.6 % W); 6-11 f typical | stills every 2 f |
| dust, smoke, steam | 14 of 20; shaded, never flat white | still: lit side vs shade side |
| full-frame flash or white-out | 11 of 20; 1 f on a hit, 5-10 f flash-through, 16-28 f white-out | per-frame luma |
| impact ring, ticks, star | 10 of 20; star 2 f, ring 3-10 f | stills every frame |
| sparks | 9 of 20; 10-60 specks or streaks per hit, 6-12 f | stills |
| explosion | 5 of 20; fireball 0.03 → 0.70 W in 8 f, 18-42 f | stills |
| heat ramp on hot metal | 4 of 20; 7 colour steps over ~100 f (quick ramps 10-15 f) | stills |
| lightning | 1 of 20 (9 flashes); 8-12 f per flash | per-frame luma |

### Catalogue

| effect | shorts | size | duration | colour | how to build |
|---|---|---|---|---|---|
| sweat drop, tear | 17 | 4-12 % of head width | pops in 1 f, held 15-60+ f; a tear slides ~23 f | light blue, white highlight, ink outline | a face-layer sprite at the upper side of the head |
| information glow | 17 | the object; halo 1.3-3 x | on in 6-11 f, held; pulses of 10-15 f | gold, orange, red, cyan | emissive colour ramp on that object only + bloom |
| light shafts, beams | 15 (+1 lamp beam) | one beam 0.18-0.37 W or 3-6 shafts of 0.06-0.14 W; radial wedges from a low sun | 11-350 f (median ≈ 75) | white, warm gold, white-lavender, purple-gold | additive gradient quads or cones, soft 20-50 u edges, faint streaks, motes of 2-4 u |
| 4-point star glint | 15 | 15-60 u | 2-25 f (6-11 typical: grows 3-4 f, holds, shrinks 3-4 f) | white or gold, soft glow, no outline | additive star sprite on a specular hotspot |
| dust, smoke, steam | 14 | landing puffs: 4-6 balls of 0.03-0.08 W; dust clouds 0.14-0.32 W; smoke columns 0.14-0.46 W | landing 4-5 f; dust 15-25 f; smoke 45 f to several seconds | white, beige, grey; lit side takes the key, shade side lilac-grey | outlined lobes with a shade crescent, or toon-shaded 3D puffs |
| debris, money, papers | 12 | pieces 0.04-0.19 W, 25-100+ of them | 25-60 f in the air; piles stay | the objects' own colours, shaded and inked | 3D pieces or instanced cards with gravity and spin |
| full-frame flash, white-out | 11 | full frame; starbursts 0.24-0.37 W | 1 f (hit), 5-10 f (starburst, flash-through), 16-28 f (white-out) | white, cream, pink-white | exposure + bloom ramp; often hides a join |
| impact ring, ticks, impact star | 10 | ring grows to ~2 x in 3-10 f (the largest to 1.0 W in 4 f), line 1-2 % W; 8-12 dashes; 8-point star 0.06-0.10 W | star 2 f; dashes 2-3 f; ring 3-10 f | white, dark ink, pink-red | expanding ring + radial dashes; star on the hit frame |
| smears and speed marks | 10 | 3-6 smear copies; ~20 radial lines 0.3 of the frame long; streaks 2-6 u x 60-250 u | smears 2-4 f; radial lines 14-16 f; streaks while moving | white (scribbles red or magenta) | re-drawn every frame; radial lines thin out over their last 4 f |
| sparks, embers | 9 | specks 2-15 u, streaks 60-200 u; 10-60 per hit | 6-12 f | orange, gold, white | additive particle burst |
| cartoon symbols | 9 | 0.03-0.14 W | 3-40 f | white, blue, green, red, inked | sprites: Z glyphs, dizzy curls, circling dots, stink lines, an anger mark, blush discs |
| motes, foreground discs | 8 | motes 2-4 u inside beams; soft discs 0.02-0.06 W near the lens | held | warm white | particles; the near ones blurred into discs |
| colour wash, relight in the shot | 7 | one character card, or the whole frame | 1-4 f on a card; 10-15 f (alarm, red flood); 17-44 f (relight) | gold, green, red, blue | light colour + grade animation; a tint multiply on the card including its line |
| splash, water | 6 | crown 0.25-0.54 W, droplets 10-30 u | 4-15 f | white fill, pale-blue strokes, ink outline | 2D frame animation, ripple rings, scrolling caustics |
| lens flare, glare, specular sweep | 6 | a streak or band 0.1-0.3 W | 10-30 f | white | a streak sprite or a moving highlight band |
| explosion | 5 | fireball 0.03 → 0.70 W in 8 f | 18-42 f (one 90 f); mushroom cloud 40+ f | white core → orange → brown or lilac smoke | 3-4 flat tones with stepped shading (outlined or not) + debris |
| cutaway, x-ray | 5 | from a prop of 0.23 x 0.42 of the frame to the full frame | 75-450 f | warm inside, saturated strata | a real cut-section model with glowing crack lines |
| heat ramp | 4 | the object | 7 steps over ~100 f; quick 10-15 f; cools to red then off in ~10 f | grey → blue-violet → purple → magenta → pink → peach → yellow → white | emissive colour steps |
| rain | 4 | streaks 1-3 u x 30-200 u, 15° from vertical | continuous | white, mixed opacity | streak layer + splash rings + wet reflections |
| iris, lens mask | 4 | a circle up to 1.2 W, rim 0.5 % W | ~60 f held | outside near-black (#120a14), gold rim | circular mask |
| flames | 4 | 0.05-0.3 W | shapes swap every 2-3 f | yellow and orange tongues, white core | stepped vector flames on twos |
| anger, power-up | 4 | head to full frame | 23-80 f | dark red, black, purple, gold | dark aura card + crackle strokes re-grown every few frames; a glow capsule ~1.6 x the body |
| snow | 2 | dots 5-25 u; near ones 20-60 u soft discs | continuous | white | particle layer |
| lightning | 1 | full frame, sky first | 8-12 f per flash | lavender; frame luma +0.05..+0.13 | exposure pulse: flash, dip, smaller flash, decay |

## How it is built

1. **One effect per claim.** For each sentence ask what event proves it with the sound off; the effect lands on the
   word (0-3 f before it) and is gone before the next one.
2. **Information glows.** The object the line is about lights up (emissive + bloom) while everything else stays matte;
   a value can be colour-coded (one hue per item), a pulse can run along a wire or a tube (a 0.01 W core with a
   0.05 W glow, 6-7 f per pass), a row can light as a highlight bar over 10 f.
3. **Heat is a ramp.** Hot metal walks through cold-to-hot colours over ~100 f in 7 steps (our design values, about
   14 f each: #6e6a78, #5b52d6, #8f45d8, #d6409e, #ff6f96, #ffad7a, #ffe36b, #fffbea); a quick hit-and-cool takes
   10-15 f up and ~10 f down through red.
4. **Flashes hide joins.** A 1-frame white on a hit; a 5-10 f flash-through or a 16-28 f white-out carries a place
   or time change.
5. **Glints are single stars.** One 4-point star, no outline, on a real highlight, 6-11 f; a cluster of stars is for
   payoff moments only.
6. **Hits are rings and dashes.** A 2-frame star on the contact frame, 8-12 short dashes, an expanding thin ring for
   3-10 f; a big hit adds a 1-frame flash and sparks.
7. **Smoke is shaded.** Puffs take the key light on their lit side (peach at golden hour, cream by day) and the scene's
   shade colour on the other (lilac-grey); outlined lobes with a shade crescent or toon-shaded spheres. Flat white
   discs read as pasted on.
8. **Speed is drawn.** Smears (3-6 copies for 2-4 f), radial lines re-drawn every frame, wind streaks; never a long
   static overlay.
9. **3D for objects, 2D for marks.** Debris, money, papers, plates are 3D and shaded like the set; glints, rings,
   symbols, sweat and splash crowns are 2D marks in the world.

## Rules

1. 15-25 distinct effect types per 60 s short; no single type on more than 5 beats (sweat drops and glints recur 4-5
   times in the reference, nothing else does).
2. Every named key object gets an information glow or a glint on its word in at least one beat.
3. Glints: one 4-point star of 15-60 u, no outline, 6-11 f, on a highlight.
4. Impact: star 2 f, dashes 2-3 f, ring 3-10 f; never a 12 f star.
5. Sweat: 4-12 % of the head width, pops in within 1 f, holds; does not fall.
6. Smoke and dust are two-tone shaded with the scene's light and shade colours.
7. Flashes: 1 f on hits; 5-10 f or 16-28 f only on a join or a turn; lightning aside, at most 3 full-frame flashes per
   short.
8. Bloom only on emissive effects (glows, sparks, flashes); never on faces.
9. Sizes in frame terms: plan each effect as a fraction of W or of the head, then convert to metres for its distance.

## In our engine

2D effects are camera-facing canvas cards on the `NOINK` layer, redrawn every frame from (frame − start): `lib/three/fx.ts`
(`FxKind`, `drawFx`, `FxLayer`, durations in `DUR`). A board places one with a gag on a beat:
`{ fx: FxKind, on: actor | prop | [x, y, z], size?: metres (0.55), color?: (#ffd23f), dy?: metres above the subject's top (0.3) }`;
it starts on the beat's frame and runs its kind's duration.

| what | where (file / field) | 1.9 value | status |
|---|---|---|---|
| `sparkle` | `fx.ts` | 7 inked 4-point stars bursting outward, 20 f | partly: the reference glint is ONE unlined additive star, 6-11 f |
| `stars` | `fx.ts` | 5 inked 5-point stars rising, 40 f | partly: dazed stars are small dots circling a head (~42 f) |
| `impact` | `fx.ts` | 9-point yellow star burst with ink, 12 f | partly: no ring or dashes; the star should last 2 f |
| `dust` | `fx.ts` | 6 flat beige inked circles, 26 f | partly: flat, unshaded |
| `smoke` | `fx.ts` | 5 flat grey inked circles rising, 45 f | partly: flat, unshaded |
| set smoke and embers | `sets.ts` `smoke()`, `sparks()` | Lambert puffs on `NOINK` (skipped by the toon block); HDR embers | partly: puffs have a soft Lambert falloff, not two tones |
| `speedlines` | `fx.ts` | 9 parallel white lines sliding, 18 f | partly: no radial mode |
| `splash` | `fx.ts` | 8 inked drops in an arc, 24 f | partly: no crown |
| `sweat` | `fx.ts` | blue drop that falls over 30 f, no highlight | partly: should pop and hold; ideally on the face layer |
| `aura` | `fx.ts` | radial gradient + 12 rays, 30 f | partly |
| `shaft` | `fx.ts`; world `lightShafts()` | 3 gradient wedges (alpha ≤ 0.35), 90 f; crossed additive cards | built |
| `notes`, `question`, `exclaim` | `fx.ts` | 60 f, 40 f, 22 f | built (not seen in the study) |
| motes | `world.ts` `motes()` | drifting points | partly: not tied to shafts |
| rain, wet ground | `weather.ts` `rain()`, `wetGround()`; `Beat.rain` | streaks, splash rings, planar reflection | built |
| flash and iris joins | `camera.ts` `JoinStyle`, `post.ts` dissolve | `flash` 10 f through white (peak 0.92 mid-way); `iris` 6 f | built |
| emissive glow of a prop | custom board prop: emissive material driven from `api.T` | — | partly: no `glow` gag |
| heat ramp, in-shot flash or white-out, lightning, snow, explosion, debris burst, flames, card tint wash, Z / dizzy / stink symbols, splash crown, caustics, held lens mask, lens flare | — | — | not built |

How to use it on a board, sizing from the frame: the frame is about 2 · tan(fov / 2) · 9/16 · distance wide (0.45 x
the distance at fov 44, 0.37 x at the medium shot's 36, 0.28 x at the extra-close 28). An FX card is larger than what
it draws (a sparkle's stars are 7-15 % of the card).

```ts
{ at: "shines", gag: { fx: "sparkle", on: [0.3, 1.04, -0.2], size: 0.25, dy: 0, color: "#ffffff" } },  // glint on the coin's rim
{ at: "hits", kick: 0.03, gag: { fx: "impact", on: [0.3, 1.0, -0.2], size: 0.4, dy: 0 } },
{ at: "nervous", gag: { fx: "sweat", on: "hero", size: 0.12, dy: -0.25 } },                             // beside the temple
// an information glow: a custom prop that ramps its own emissive over 8 frames from its cue
props: { lamp: (api) => { const m = new THREE.MeshLambertMaterial({ color: "#c9a23a", emissive: "#ffb000", emissiveIntensity: 0 });
  const g = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), m);
  return { group: g, update: (f) => { m.emissiveIntensity = 1.6 * Math.min(1, Math.max(0, (f - api.T.glows) / 8)); } }; } },
```

## Check

- Count the effect types on the board (gags with `fx`, props that animate, light events) and compare with rule 1.
- Stills at the effect's own frames, not 10 f after the cue: `node tools/render.mjs --project ID --format short
  --stills 412,414,416,420,424` around a hit; check the star's 2 f, the ring's growth, the glint's 6-11 f.
- Measure sizes on a full-resolution still against W or the head width.
- Smoke: a lit-side patch and a shade-side patch must differ in hue (warm vs lilac), not only in value.
- Flashes: per-frame mean luma; `vfa strips VIDEO --plan timeline.json` shows flashes that sit on joins.
- **Failure looks like:** the same burst on every beat, effects with heavy ink outlines next to soft lighting, flat
  white smoke, a sparkle that floats beside the object instead of on its highlight, a 12-frame star on a hit, or a glow
  on a face.

## Common mistakes

From our coin short (57 s):

1. **One effect for everything.** 11 effect gags of 4 kinds; 8 of them were the same `sparkle` (on each snip of the
   shears). The reference uses about 20 different types per short.
2. **The wrong sparkle.** Ours bursts 7 inked stars outward over 20 f; the reference glint is one unlined 4-point star
   on a highlight for 6-11 f. On a small prop the burst read as confetti.
3. **Flat smoke and dust.** Our `smoke` and `dust` are flat inked circles; the reference shades every puff with the
   key. The set's chimney smoke is Lambert-lit and closer.
4. **A long hit.** The `impact` star stays 12 f; the measured hit star is 2 f, followed by a ring and dashes.
5. **No information glow.** The coin short had no object that lit up on its word; 17 of 20 reference shorts do.
6. **Sizes in metres only.** The default card is 0.55 m whatever the distance; at fov 28 and 2.5 m that card is 0.8 W.
   Plan in frame terms first.

## Sources

Private frame study of the 20 newest shorts of a reference channel in this style (35,987 frames at 30 fps; effects
inventories of 20 frame logs, about 400 effect entries), 2026-11-12; background: `references/research/lighting.md`
(A6 rule 41, A8 rule 51), `references/research/toon-shading.md` (B24), `references/research/rendering.md` (B8.2).
