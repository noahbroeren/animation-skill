# References: where to look

Everything the skill knows, in four layers. Read the row that matches the task; do not read the whole tree.

| layer | folder | what is in it | read it when |
|---|---|---|---|
| **pipeline** | `pipeline/` | how a video gets made, step by step | you are making or fixing a video |
| **craft** | `craft/` | measured reference sheets: what good looks and sounds like, as numbers and rules, mapped to engine parameters | you are deciding how something should look, move, read or sound |
| **tools** | `tools/` | the analyzer (`vfa`), the engine API, external tools | you need a command, a parameter or a file |
| **styles** | `styles/` | style packs: one measured channel style each (fingerprint data in `styles/data/`) | you match or compare against a style |
| research | `research/` | long background reports the craft sheets were distilled from | a craft sheet is not enough |
| sheets | `sheets/` | our own rendered reference sheets (characters, brands) | you want to SEE a rule |

## Pipeline (`pipeline/`)

| file | covers |
|---|---|
| `workflow.md` | the modes (analyse, clone a style, make a short, make a long video) and their steps |
| `story-engine.md` | script formulas, lint, claims gate, voice, words |
| `board.md` | the storyboard as data: beats on words, places, shots, acting, gags, joins, light plan, sound cues |
| `director-loop.md` | reviewer agents, judge packs, fixing in rounds |
| `quality.md` | QA gates, what PASS / WARN / FAIL mean |
| `longform.md` | 16:9 long videos |

## Craft sheets (`craft/`)

Each sheet has the same parts: at a glance (the numbers), how it is built, rules, in our engine (file, field, value,
status), how to check it, common mistakes from our own renders, sources. Index: `craft/README.md`.

| area | sheets |
|---|---|
| characters | `characters.md` (how a cast is built and measured), `character-design.md` (designing OUR branded cast), `acting.md` (views, turns, expressions, blinks, gestures, walks, framing per shot size), `character-types.md` (25 character types, background) |
| picture | `camera.md`, `edit.md` (joins and transition recipes), `captions.md` |
| look | `lighting.md`, `shading.md`, `grade.md`, `ink.md`, `textures.md`, `depth.md`, `effects.md` |
| words and sound | `script.md`, `sound.md`, `hooks-titles.md` (measured hook / topic / title data) |
| everything else | `general.md` (cross-style craft notes and the anti-"AI look" checklist) |

## Tools (`tools/`)

| file | covers |
|---|---|
| `analyzer.md` | `vfa` commands: fetch, analyze, batch, compare, qa, strips, keygap, ocr, transitions, topics |
| `engine.md` | the Remotion + three.js engine by subsystem |
| `external.md` | other tools (Blender bridge, ElevenLabs, yt-dlp) |

## Rules that apply to all of it

- Study other channels for TECHNIQUE and NUMBERS only. Reference footage, frames and transcripts stay in a private
  study folder outside this repository; the repository gets numbers, rules in our own words and our own renders.
- Never recreate another channel's characters, stories or shots. `craft/character-design.md` says which combinations of
  construction choices would read as a copy.
