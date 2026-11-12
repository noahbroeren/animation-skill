# Lighting (craft sheet)

Light is the story's clock and its mood: before a word lands the viewer reads where we are, what time it is and whether
this is good or bad news. A 60 s short changes its lighting key about five times, and every change is an edit (it lands
on a dissolve, inside a camera travel, or as a visible relight). The single most important rule: one key per story
phase, day to open, night in the middle, golden late, and a visible source for every pool of light.

Units: frames at 30 fps; W = frame width (1080 px in 9:16); u = 1 px at a 1080 px short side (0.093 % of W).

## At a glance

| rule | target (median, range) | how to check |
|---|---|---|
| distinct lighting keys per short | 4 (2-6) | board `key` values / `timeline.json` |
| key changes per short | 5 (IQR 4-6, range 1-12) | same |
| lighting set-ups at frame level (keys plus in-shot light events) | 14 per short (IQR 12.5-15.5, range 10-20) | one still per beat (`render.mjs --stills cues+10`) |
| order | day fills 51 % of the first quarter; night peaks in quarters 2-3 (23 % / 29 % of their frames); golden sits in the back half (12 % / 11 %); day is back in the last quarter (34 %) | key list against runtime quarters |
| night / blue key used | 17 of 20 shorts, 20 % of all frames | key list |
| golden / sunset / dawn used | 12 of 20 shorts, 8 % of all frames | key list |
| day key | elevation 40-60°, side or front-top | `LIGHTS.<preset>.dir`; shadow length 0.6-1.2 x object height |
| golden key | elevation 3-15°, sun within ±40° of the view axis (backlight) in ≥ 2/3 of golden shots | sun azimuth against camera forward |
| night practical pool | warm core radius ≈ 0.09 W, neutral by ≈ 0.24 W, blue ambient by 0.26-0.31 W | Lab b* profile from the lamp outward |
| visible light shafts | 15 of 20 shorts (one more has a lamp beam); ≈ 24 % white over the surface; on screen 75 f (11-350) | still: beam vs surface beside it |
| relight inside a shot | 14 of 20 shorts; 5-44 f, median ≈ 17 f | `vfa strips`, stills every 4 f |
| lightning | 1 of 20 shorts; 8-12 f per flash, +0.05 to +0.13 frame luma, lavender | per-frame mean luma |

### Keys per scene type

Share of frames over 590 labelled stills (one every 2 s across all 20 shorts); shadow ratio = linear luminance of a cast
shadow over the same lit surface (see `craft/shading.md`); luma p50 = median Rec.709 luma (see `craft/grade.md`).

| scene type | share | key and fill | cast shadow | practicals | luma p50 |
|---|---|---|---|---|---|
| day exterior | 31.5 % | sun 40-60° up, side or front-top; blue-sky fill; cloud shadows on big planes | 0.49 x lit, near-neutral, short | none | .548 |
| golden / sunset / dawn | 8.0 % | sun 3-15° up and BEHIND the subject; sun disc and glow in frame; rim on silhouettes | long, toward the camera, blue-violet replacement colour | lamps begin to show | .425 |
| night exterior | 8.0 % | saturated cobalt sky (L* 25-34, C* 43-70) and ambient; moon with halo | 0.39 x lit, blue x 1.23 | 1-2 warm pools per shot | .297 |
| storm night | 3.9 % | violet-blue near-monochrome; rain; lightning | 0.43 | lanterns with halos | .268 |
| rain / storm / overcast day | 3.4 % | teal-grey, soft, mist | soft or none | headlights, lit windows | .356 |
| interior day | 21.7 % | window light (patches on the floor, beams) or flat overhead office light | 0.48 | — | .551 |
| interior, warm practical | 5.3 % | one lamp from one side is the key; violet ambient; vignette | 0.36 | the lamp | .233 |
| interior night | 8.5 % | blue ambient with a warm lamp pool; moon cones through windows | 0.36 | 1-2 | .237 |
| special (cutaway, insert, diagram) | 9.8 % | one saturated wash, or a diagram light | — | — | .409 |

## How it is built

1. **Write the colour script before the sets.** One row per story phase: key, three palette anchors, mean luma target,
   where the change lands. Four keys and five changes cover a 60 s short; places inside one phase share its key.
2. **Open on day.** A high sun (40-60°) from the side or front-top, a blue sky, short soft-edged shadows that keep the
   surface hue, drifting cloud shadows on large lit planes. Interiors in the set-up are window-lit and bright.
3. **Go blue in the middle.** Night is not dark: the sky is a saturated cobalt gradient, the ambient is blue-violet, and
   one or two warm practicals (a window, a lantern, a lamp) make pools that fall off warm, then lilac, then blue. The
   warm practicals are the only red-orange in a night frame; faces turn pink-lilac, not blue.
4. **Bring the low sun late.** Golden light is a BACKLIGHT: the sun sits low (3-15°) near the view axis, often in frame
   with a glow; shadows run long toward the camera in a blue-violet replacement colour; silhouettes get a key-coloured
   rim. Most golden frames sit in the back half (72 % of them).
5. **Return or stay.** About a third of the last-quarter frames are day again (a release); a short can also end in its
   last key (a verdict). Decide it in the colour script.
6. **Light interiors with a visible source.** By day: a window patch on the floor or the desk, window-bar or blind
   stripes, or a volumetric beam with dust. By night: one lamp is the key, the window is a cold blue panel or a moon cone.
   7 of 20 shorts throw window patterns on floors and walls.
7. **Make every change an edit.** Hide the key change inside a dissolve, run it inside a camera travel (about 25 f), or
   show it as a relight in the shot (5-44 f): a lamp that goes out, a lantern that walks into frame, sunrise on blinds.
8. **Animate light for events only.** Practicals pop on or off in 1-4 f with bloom; time passes by a grade ramp with
   sun or moon props over 35-44 f, or by warm/cool flips every ~15 f; lightning is a double pulse; a storm sky can be
   revealed behind a still-sunlit foreground by a crane move as foreshadowing.
9. **Let the short set its own light code and keep it.** Typical: warm = value, memory, relief; blue = loss, threat,
   the hidden mechanism. In one short the comedy beats sat at frame luma 0.56-0.71 and the dread beats at 0.28-0.41
   with one warm source. Saturation rises as light falls (in one short luma 0.59 → 0.17 while saturation went
   0.37 → 0.76).

## Rules

1. 4 ± 1 distinct keys and 5 ± 1 key changes per 60 s short; more than 7 changes is a defect.
2. Day keys fill ≥ 50 % of the first quarter's frames.
3. When night is used, ≥ 60 % of its frames fall between 25 % and 75 % of the runtime.
4. When golden is used, ≥ 2/3 of its frames fall in the back half.
5. Day key: elevation 40-60°, from the side or three-quarter front (over the camera's left or right shoulder is
   fine); never dead front, which flattens the forms; cast shadows 0.6-1.2 x the object's height.
6. Golden key: elevation 3-15° (15-20° is an acceptable cheat when long shadows leave the shadow map), sun within
   ±40° of the camera's view axis in ≥ 2/3 of golden shots; cast shadows use the replacement colour (`craft/shading.md`).
7. Night sky L* 25-34 with C* 43-70 (for example #0a309b, #1545b6, #243e98, #2c478a); never a near-black sky.
8. Night shots have 1-2 warm practicals with a visible emissive source; pool: warm core (b* ≈ +34) to r ≈ 0.09 W,
   neutral by 0.24 W, blue (b* −20 to −29) by 0.26-0.31 W; a lilac contact ring where the lamp meets the ground.
9. Every local pool of light in a night or interior shot has a visible source in or near the frame.
10. Window-lit rooms show the light where it lands: a patch on the floor or desk, or a beam. Beam: ≈ 24 % ± 6 % white
    added in linear light, chroma inside the beam drops to about 15 % of the wall's, width 0.18-0.37 W (one beam) or
    3-6 shafts of 0.06-0.14 W, soft edges of 20-50 u, faint streaks of ±5 L*, dust motes of 2-4 u.
11. A key change sits inside a dissolve, inside a camera travel (~25 f), or is a deliberate relight of 5-44 f with a
    visible cause. No unmotivated fade inside a held shot.
12. Practicals switch on or off in 1-4 f each (a 1-frame overshoot is fine).
13. Lightning (storms only): per flash 8-12 f as flash, dip, smaller flash, decay; frame luma +0.05 to +0.13 at the
    peak, lavender; the sky brightens most; through a window it throws a lavender glow on the wall.
14. At least one beat per short has a visible light shaft; typical screen time 30-130 f.
15. One place keeps one time of day inside a phase: panes, sky and fog follow the key.

## In our engine

| what | where (file / field) | 1.9 value | status |
|---|---|---|---|
| lighting keys | `lib/three/lightplan.ts` `LIGHT_KEYS` | day, morning, golden, sunsetBack, dusk, night, nightMoon, nightPractical, overcast, rain, fog, office, interiorWarm, spotlight | partly: no storm-night, interior-night or dawn key (`LIGHTS` has `storm` and `dawn` presets) |
| one plan per video | `lightPlan(keys, { fade })` | default fade 14 f; per change `[frame, key, fade]` | built |
| key change timing on boards | `lib/board.tsx` `makeWorld` (a change at frame F with fade n blends from F − n to F) | dissolve: 10 f from beat − 5 to beat + 5; glide: 14 f ending at beat + 6; inside a shot: the 14 f before the beat; whip: switch at beat + 3; soft cut: `softCut` (6) f centred on the cut | built |
| day sun | `lib/three/world.ts` `LIGHTS.day` | dir [-0.55, 0.8, 0.35] = 51° up, #fff1d6, sunI 2.6 | built |
| golden sun | `LIGHTS.golden` | dir [-0.8, 0.32, 0.4] = 20° up, world-fixed | partly: 5° above the range, not tied to the camera |
| low backlight | `LIGHTS.sunsetBack` / key `sunsetBack` | dir [-0.48, 0.26, -0.84] = 15° up, sun toward −z | partly: backlight only when the camera looks toward −z; camera-relative sun not built |
| night | `LIGHTS.night` | sky #163c9e → #3a5cc8, fog #2a3a8a, moon #9bb4ff at 0.9, 57° up | built |
| other night skies | `LIGHTS.nightMoon`, `.nightPractical` | #060b2e → #1d2f7a; #040824 → #15235e | partly: near-black, measured night skies are cobalt |
| practicals per key | `LightKey.practicals` → `SetInstance.setNight(n)` | day 0, golden 0.15, sunsetBack 0.4, dusk 0.7, night 1, office 0.3, interiorWarm 0.8 | built |
| lamp pools | `lib/three/sets.ts` `lampAt`; toon shader band | PointLight #ffd9a0, distance 4.5-9 m, decay 1.3; banded and capped at 0.32 in the toon shader | partly: warm → lilac → blue falloff not calibrated |
| window patches | `sets.ts` `sunPatch` | additive #ffe6b8, gain 0.45-0.55, mullion bars, fades as practicals rise | partly: adds light; the reference also REPLACES the wall colour toward pale warm yellow |
| cloud shadows | `LightKey.cookie` → `toon.uCookie` | day 0.3, morning 0.2, golden 0.15; off indoors | built |
| light shafts | `world.ts` `lightShafts()`; FX `shaft` | additive crossed cards, strength 0.22, #fff1c8 | partly: no streaks or motes inside (`motes()` exists separately) |
| sun / moon glow | `sky()` `sunGlow` via the key | day 0.3, golden 0.8, sunsetBack 1.0, night 0.25 | built |
| lightning helper | — | — | not built |
| relight as a join style | — | — | not built: use a key change with its own fade |
| lighting-arc lint (keys, changes, order) | — | — | not built: count by hand |

How to use it on a board (keys persist until changed; the light change rides the join):

```ts
beats: [
  { at: 0, place: "street", key: "day", shot: { size: "wide" } },              // set-up in day
  { at: "but", place: "alley", key: "night", via: "dissolve" },               // ~35 %: changes inside the dissolve
  { at: "finally", place: "street", key: "sunsetBack", via: "dissolve",       // ~70 %: low sun behind the subject
    shot: { size: "medium", on: "hero", angle: 20 } },                        // pick the angle whose still shows the sun glow behind the head
  { at: "today", key: "day", via: "dissolve" },                               // last quarter: release
]
// outside a board: a dusk change inside a 25 f travel, an in-shot relight of 17 f, a hard key on a cut (fade 0)
const LP = lightPlan([[0, "day"], [T.dusk, "dusk", 25], [T.lampOut, { ...LIGHT_KEYS.night, practicals: 1 }, 17], [T.cut, "day", 0]]);
```

The sun direction is a world direction, not a camera one: check on the set's stills which `angle` puts the sun glow
behind the subject (the `sunsetBack` sun sits toward −z, 15° up).

## Check

- **Arc:** list the board's keys with their frames and runtime share; compare with rules 1-4. One still per beat
  (`node tools/render.mjs --project ID --format short --stills cues+10 --scale 0.5`) laid out in order must read
  day, then blue, then low sun or day.
- **Per key:** `vfa keygap QA_DIR/analysis --plan timeline.json --ref FINGERPRINT` gives luma, saturation and tints per
  section; night sections should sit near luma p50 0.30 with saturation ≥ 0.5 (`craft/grade.md`).
- **Changes:** `vfa strips VIDEO --plan timeline.json` shows nine frames around every join; a key change must not
  jump in one frame outside a cut.
- **Pools and beams:** on a full-resolution still, sample Lab b* outward from a lamp (warm core, neutral, blue) and
  compare a beam's luminance with the wall next to it (+24 % ± 6 % in linear light).
- **Failure looks like:** a lamp with no pool, a window with no patch, night as a dark-blue filter (mean luma < 0.2,
  saturation < 0.4), a golden key from the front with short shadows, or the key fading in the middle of a held shot.

## Common mistakes

From our coin short (57 s, 8 places) and the shorts before it:

1. **A key per place.** 10 key changes and 7 distinct keys (a warm room key, day, forge, office, golden, night, a
   night alley) against 5 and 4. Fix: one key per story phase; places inside a phase share it.
2. **Rooms lit by the grade.** Interior places needed exposure 1.10-1.24 and gamma 1.38-1.46 because the rooms measured
   mean luma 0.29-0.34 against 0.47; the lift raised the black floor to p1 0.116 (reference 0.076). Fix: window
   patches and lamp pools first, grade second.
3. **Night as an exposure push.** The night alley needed exposure 1.55, gamma 1.34 and saturation 0.95 and still read
   as a blue filter. The reference night is a saturated cobalt (HSV saturation 0.54) with warm pools. Fix: the night
   key, practicals at 1, two warm sources in frame, no gamma lift.
4. **A low sun indoors.** A golden key threw a chimney shadow across a whole back wall. Indoors use a high sun with
   the warm look (`{ ...LIGHT_KEYS.golden, lights: "day", cookie: 0 }`, `pipeline/board.md` rule 7).
5. **A window that lights nothing.** Reviewers scored the light 5/10 twice for a big window with no light on the floor;
   `sunPatch` (1.8.1) fixed it.
6. **A lamp band that was too hot.** With the non-sun light capped at 0.5 the night highlights went from b* +15.5 to
   +21.9; the cap is 0.32 now. Measure the highlights of every night key after adding lamps.
7. **Two times of day in one place.** A hall kept night-violet window panes under a sun key for two review rounds.

## Sources

Private frame study of the 20 newest shorts of a reference channel in this style (35,987 frames at 30 fps, 590
labelled stills, 20 frame logs), 2026-11-12; background: `references/research/lighting.md` (A4-A8, B, E1-E9),
`references/research/shading-lighting.md`.
