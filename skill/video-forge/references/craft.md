# Craft: how good videos are built, with numbers

The defaults below come from measured references:
- the reference tutorial's own measurements of 20 viral story shorts (2D-in-3D style) and of 50 realistic 3D shorts
- our own `vfa` runs
- conventions shared across the studied skills

When you have a reference, **its measurements override these defaults.**

## Story, hooks, retention

- **Hook = sentence 1 and frame 1.** No intro, no logo, no "in this video". Speech starts within 0.1-0.5 s, and frame 1 is a strong image (never black).
- **Hook forms:**
  - Paradox: "74 soldiers knocked down an iron bridge just by walking across it."
  - Second-person hypothetical: "If you pulled out every blood vessel..."
  - Impossible-sounding fact, or a stakes question.
- **Formula for story/explainer shorts** (measured in 20 of 20 viral shorts of one style):
  1. hook (paradox)
  2. setting
  3. escalation
  4. the snap / problem
  5. pivot phrase: "You see," (14 of 20 used the exact same words)
  6. explanation by analogy
  7. consequence
  8. payoff or twist line, plus a callback
- **Pace:**
  - Story shorts: 3.7-4.0 words/s with almost zero dead air (median pause about 0.1 s).
  - Calm explainers: about 2.8 words/s.
  - Long-form narration: 2.5-3.0 words/s with deliberate pauses before reveals.
- **Fact density:** every claim is checked and sourced. The best joke is often a checked detail ("the river was only 2 ft deep").
- **Avoid topics the reference channel already covered.** Search its catalogue first.
- **Long-form:**
  - A cold open (the most interesting 10-20 s) before the title.
  - Chapters every 1.5-3 min, each opening with a mini-hook.
  - A re-hook at the midpoint.
  - Open loops ("we'll see why in a minute") that you close later.
  - End on the payoff, not on a goodbye. Put the call to action in the last 5 s or skip it.

## Cinematography and camera

- **Camera grammar** (measured, 2D-in-3D story shorts):
  - The camera is moving in about 65 % of frames, mostly slow push-ins.
  - Moves glide about 23 frames with slow-in/slow-out; ours snapped in 3 frames and read cheap.
  - 12 of 20 shorts had at most 1 hard cut: the camera travels into the next moment.
- **Realistic 3D explainers** (measured): one continuous dolly axis, no orbit drift, about 1 cut in 7 transitions. The rest are motion transitions (whips, zoom-throughs).
- **Defaults:**
  - Glide 18-40 f (`smoother`).
  - Creep on every hold (1-1.5 % of distance per second).
  - At most one new camera idea per 2.5-3 s.
  - Push-in range 1.25x-2.3x per beat.
  - Kick the camera (a decaying sign-flip shake, ≤7 f) on impacts.
  - Rack focus to redirect attention.
- **Lenses:**
  - Wide (fov 40-50°) for establishing shots and scale.
  - 28-35° for characters (vertical shorts).
  - Longer lens with shallow DOF for intimacy.
  - Keep the subject at least 1/3 of frame height at key moments.
- **Composition:**
  - Rule of thirds or centre for vertical shorts (the subject in the middle 60 %, clear of caption and UI zones).
  - Leading lines, foreground framing for depth.
  - Avoid tangents (an object edge touching the frame edge or the subject).

## Lighting and colour

- **Lighting follows the story:** warm and bright while setting up, a deep night-blue when the explanation begins (measured), and a return of light at the payoff.
- **Warm key + cool fill:**
  - Highlights lean warm; shadows lean cool, violet at sunset (measured: theirs purple, ours brown).
  - The engine's `lights()` presets do this; check `shadow_tint_name` in the report.
- **No pure black:** the reference had no 0-luma pixels (p1 ≈ 0.06-0.08). Use `grade.blackPoint` 0.02-0.05 and keep highlights under clipping.
- **Saturation:** bold for cartoons (`saturation` 1.15-1.3) but stop before neon. Greens and skies clip first. Film and documentary sit near 0.95-1.05.
- **Depth:**
  - Atmospheric fog tinted to the sky.
  - Background blur (DOF) so the eye lands on the subject.
  - Foreground elements.
  - The values of distant layers get lighter and lower in contrast.
- **Realism** (when going photoreal): real cameras aren't perfect. Add softness, bloom/halation on highlights, vignette, grain and motion blur on fast moves. Use a tonemap that keeps highlights from burning out (ACES or neutral), not a plain clamp.

## Animation and motion

- **Never a dead frame:** idle breathing (±1-2 % squash), sway, eye darts, blinks every 1.6-4.2 s (5-frame lid curve), cloth and foliage drift, particles.
  - `activity` near 0 in your render where the reference is above 0 means "add secondary motion".
- **Principles:**
  - Anticipation before big actions.
  - Overlapping action by **time delay** (child = parent delayed 3-4 f × 0.45), not springs.
  - Slow in / slow out.
  - Arcs (thrown objects follow parabolas).
  - Squash and stretch with volume preserved (w = 1/sy^0.6).
  - A blink on every expression change, to hide the swap.
- **Timing:**
  - Reactions land 0-3 frames BEFORE their word.
  - A beat change every 2-4 s in shorts.
  - Fast action, slow meaning: hold the result 0.5-1 s before moving on.
- **Physics:** when the story is physical (pendulums, falls, orbits), compute it (θ = θ0 cos(2πt/T)). Viewers feel wrong timing.
- **Eases:**
  - UI and graphics: outExpo `bezier(0.16,1,0.3,1)` in, inCubic out.
  - Pops: outBack with about 10 % overshoot.
  - Camera: `smoother`.
  - Key poses: `monotone()` cubic (no overshoot, continuous speed).

## Editing and pacing

- **Cut on action or on a stressed word;** match cuts on shape or motion; J/L cuts (audio leads or trails the picture).
- **Transition grammar:**
  - Hard cut: punchy, use sparingly.
  - Camera travel: the premium default.
  - Whip, 8-10 f: energy.
  - Zoom-through, 12-16 f: into a detail.
  - Dip to black, 12-18 f: time passes or a chapter changes.
  - Flash, 4-8 f: impact.
  - Crossfade: avoid except for dreams and memories.
- **Shot length:**
  - Story shorts: 2-6 s, or long travelling takes.
  - Explainers: 1.5-4 s.
  - Documentary: 4-8 s.
  - Measure the reference's ASL.
- **Silence:** at least one real breath of silence before the big reveal; then the loudest moment lands ON the reveal.

## Typography and captions

- **Shorts:**
  - 2-3 words per page, heavy sans, uppercase, thick dark stroke, active word highlighted (yellow or brand colour) with a small spring pop.
  - Sit at 60-68 % of height: above the bottom UI band (bottom 20 %) and clear of the right action column (14 %).
- **Long-form:** sentence chunks of ≤42 characters at the bottom, on a soft dark box. Each page holds for at least the time it's spoken plus 0.2 s, and never under 0.8 s.
- **Titles:** at most 2 typefaces. Kinetic in-moves 12-20 f, staggered 3 f per word. Exits faster than entrances.
- **Readability:** contrast ≥ 4.5:1 against the picture. If not, add a stroke or box. Check every caption page in the sheets.

## Sound

- **Layers:**
  - voice
  - music bed (ducked about 8-10 dB under the voice, 80 ms attack / 400 ms release)
  - room tone or ambience on EVERY scene (never digital silence)
  - SFX on exact frames: whooshes under camera travels, pops under graphics, impacts on hits, risers into reveals
- **Levels:**
  - Master to -14 LUFS integrated, true peak ≤ -1 dBTP.
  - Shorts are voice-forward: LRA about 3-6.
  - Film and long-form: LRA 6-11.
  - The measured realistic-3D reference mix: music +3 dB relative to default, effects at half; when an effect sounds too loud, measure it and drop it ~10 LU.
- **SFX density** follows personality: calm 0-3 per 10 s, energetic 6-9 per 10 s. Cut 30 % of the cues you first planned.
- **Sync:** every cue is computed from the same timing source as the picture (`make_audio.py` pattern). Nothing is hand-placed by ear.

## Anti-"AI-look" checklist (run it on stills and sheets)

| AI tell | fix |
|---|---|
| everything sharp and evenly lit | DOF, a key/fill ratio of at least 2:1, rim light, fog depth |
| pastel and flat or neon and clipped | measured grade: black floor, shadow tint, saturation 1.1-1.3 |
| plain untextured materials | painted textures with grain, dark gaps and per-element colour variation |
| no line work (in an inked style) | ink pass ON, `ink_on_edges` matched to the reference |
| floaty or robotic motion | glides 18-40 f, creep, follow-through by delay, anticipation |
| dead holds | idle breathing, blinks, particles, camera creep |
| characters pasted on | cast shadows, lit by the scene, cel shade on the side away from the key, contact with the ground |
| chunky clip-art proportions | heads ≈ 1/3.5 of height, thin limbs; measure the reference |
| generic stock music wall | ducked bed with structure (hits on beats), ambience, real silences |
| captions covering the action or UI | safe zones, 2-3 words per page, highlight |
| inconsistent characters/colours across scenes | one CharacterSpec and one Look per series (bible); per-chapter fingerprint drift check |
| upscaled mush sold as 4K | native render; label any upscale; `vfa qa` native-detail check |

## Learned from frame-level channel studies (2026-11, 42 shorts + an independent 20-short study)

These refine the defaults above. Style-specific details are in `styles/`.

**Camera**
- One camera move per sentence; alternate push and pull. Fast travels sit on sentence boundaries, always with motion blur (`look.motionBlur 0.5`).
- **Cut or glide** (`glideOrCut()`): glide frames >= 0.075 x screen travel (px @720) + 55 x |zoom|.
  - Over half a frame width or 40 % zoom: CUT on a word onset. Measured cut offsets vs word starts: -0.01 s and +0.02 s.
- Exponential push on holds (`push.rate` 0.0015-0.003/frame) with punches on key words (0.006-0.007/frame for ~30 f). Any push stops at an impact.
- Kicks are screen-space (~3 px @720 per unit), flip sign every frame, last 6-8 f.
- Dissolves: 6-8 f, only for place or time jumps. White flash: 4 f.

**Characters**
- Blinks every 0.5-2.3 s with a 4-frame lid (half/shut/shut/half), plus a blink hiding every expression swap.
- Reactions land 2 f (0-3 f) before the word.
- Walk: ~2.6 steps/s (a step every 9-12 f), bob ~5 % of height lowest at contact, lean 1 deg at passing to 7 deg at contact.
- Measured stylised characters have NO breathing or idle loops. The never-still feeling comes from:
  - camera creep
  - walking background extras
  - FX
  - gestures on key words
- Do not add idle sway there. The `activity` metric should still reach about 0.02.

**Sound**
- Shorts in this space are very compressed: LRA ~2.2 LU, bed only 5-10 LU under the voice. Duck from `words.json` at only -3 dB; per-section music levels do the rest.
- Music: arrange per section.
  - Hard stop (12 ms) before the big moment, so there is silence under the hit.
  - Calm under the explanation.
  - Button hit AFTER the last word, never on it.
- SFX levels by loudness relative to the voice: beds -26..-32, hits 0..-6, details -12..-20.
  - Events get a further -6 dB.
  - Anchor each sound's peak to its frame.
  - One shared reverb send.

**Readability traps** (each one cost a re-render somewhere)
- Props closer than ~2 m to the lens become cut-off blobs. A frame-cut bush reads as a "green ball". Use `blocksShot()` when placing props.
- Railings or ropes crossing a face or torso.
- Signs lit by a side sun go grey-blue: make painted signs unlit or bright.
- A flat hold of 0.4 s already reads as a freeze in a short (QA flags it).
- Never describe on screen what the viewer already sees.

**Ops gotchas**
- Remotion copies `public/` into TEMP on every bundle (tens of GB over a session). render.mjs deletes its own bundle; still point TEMP/TMP at a big drive for long sessions.
- Grain multiplies file size x3-4.
- Two independent loudness meters must agree. `mix.py` aborts if ours and ffmpeg's differ by > 0.5 LU. This caught a real 48 dB WAV-scaling bug.
