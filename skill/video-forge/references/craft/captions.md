# Captions (craft sheet)

In this style the captions are a metronome, not a design element: one or two words, always in the same place and the
same size, switched on the spoken word, never animated and never coloured. They let a viewer with the sound off follow
every word without pulling the eye away from the picture. The one rule: same spot (centre at 70.4 % of the height), same
size (x-height 2.05 % of the height), on the word (+-1 frame), never blank.

## At a glance

| rule | target (median, range) | how to check |
|---|---|---|
| words per caption | 1.33 mean (IQR across films 1.31-1.36): one word on most pages, two on ~30 % | words / `pages` (`vfa ocr`) |
| caption changes | 2.76 /s (IQR 2.72-2.90) at a read of ~3.7 words/s | `pages` / duration |
| time on screen | 10 f median (IQR 6-14); the longest page per film 22-54 f | `page_seconds` |
| vertical position | centre at 0.704 H (all 20 films 0.701-0.705); x centre 0.496 W; one line | `center_y_rel` |
| size | x-height 2.05 % H = 39-40 px at 1080x1920 (3.6 % W) | `core_height_u` 38-41 |
| outline | black, 6-7 px at 1080 w = 0.6 % W (~17 % of the x-height), outside the glyph | `outline_px_u` 5.5-7.5 |
| shadow | soft and dark, down-right, ~3-4 px at 1080 w (read by eye) | 3x crop of a still |
| timing | on the word onset: -0.4 f median (pooled IQR about -1.2 to +0.8 f) | `sync_offset_frames` |
| pauses | never blank: text on 100 % of frames; the last word stays up | `on_screen_frac` >= 0.97 |
| animation, colour | none: first-frame height = settled height (1.00); 0 of 62 sampled pages coloured | `highlight_hex` none |
| type | heavy black-weight grotesque (Arial Black class), pure white fill | `vfa ocr` font class |
| case and signs | as spoken: lowercase, capitals for sentence starts and names, punctuation kept, numbers as digits | stills |

## How it is built

1. Start from the word timings of the final voice (`words.json`). Captions are timed from the same clock as the picture.
2. Group words into pages: a word on its own, or two when the first is so short it would flash (a short function word);
   never group across a pause. About 30 % of pages have two words; three are rare. (The reference's own grouping rule
   was not measured; merging words shorter than ~6 f reproduces its mean on our narration.)
3. Show each page from its word's onset (at most 1 frame early) until the next page starts. In a pause the last word
   simply stays; at the end it stays into the tail.
4. Set one centred line with its centre at 70.4 % of the height. One short word is ~13 % W wide, three words up to
   ~83 % W.
5. Type: a heavy black-weight grotesque (slanted cut on the t, round o, tight spacing), white fill, a black outline
   outside the glyph with rounded corners, and a soft dark shadow offset down and to the right.
6. No entrance and no exit: the page is simply there at full size on its first frame and gone when the next arrives. No
   scale, bounce, fade, slide, box or highlighted active word.
7. Keep the band clear: the caption line (about 0.67-0.74 H) crossed a face in 0 of 39 sampled frames with a face;
   faces sit at 0.35-0.47 H and the line lies over the body, a table or the ground.
8. One text at a time: labels, stamps, counters and big words never show the word the caption is showing.

Sizes at our formats (Arial Black's own x-height is 0.519 em, so 75 u gives 39 u):

| format | target x-height | font size (x-height it gives) | visible outline | shadow offset / blur | caption centre y |
|---|---|---|---|---|---|
| 1080x1920 | 39-40 px | 75 px (39 px) | 6.4 px | (3, 3.5) / 4 px | 1352 px |
| 1440x2560 (`short`) | 52-53 px | 100 px (52 px) | 8.5 px | (4, 4.7) / 5.3 px | 1802 px |
| 2160x3840 | 79-80 px | 150 px (78 px) | 12.8 px | (6, 7) / 8 px | 2703 px |

Other measured sizes: ascender to baseline 2.8 % H, ascender to descender ~3.5 % H, baseline at 71.6 % H.

## Rules

1. Words per page: mean 1.25-1.45, never more than 3; merge a word shorter than ~6 f into the next one unless a pause of
   more than 0.15 s separates them.
2. Changes: 2.6-2.95 pages per second at a 3.6-3.85 words/s read (slower narration gives fewer; judge rule 1 first).
3. Each page appears within +-1 f of its word onset; never more than 1 f late.
4. Never blank from the first word to the last frame; the last word of a sentence holds through the pause.
5. Centre y 0.700-0.708 H, x centre 0.49-0.51 W, one line, width <= 85 % W. The line does not move during the film
   (every reference film sits within 0.701-0.705).
6. x-height 2.0-2.1 % H (39-40 px at 1920 h).
7. Outline 0.55-0.65 % W, black or near-black, outside the glyph, rounded joins.
8. Shadow: soft, ~50 % black, offset ~0.3 % W right and down, blur ~0.37 % W.
9. Fill pure white (every channel > 225); no colour on any word; no box.
10. No motion: the first frame of a page is at its final size and position.
11. Case as spoken, punctuation as written, numbers as digits.
12. No face in the band 0.67-0.74 H; eyes at 0.35-0.47 H.
13. One text on screen at a time; no label, stamp or counter repeats the caption word.

## In our engine

| what | where (file / field) | 1.9 value | status |
|---|---|---|---|
| component | `two/text.tsx WordCaptions` with `center` | `board.tsx` passes size 75, outline 0.17, lead 0.03, center, yAt | built |
| words per page | `minFrames` (merge a word shorter than n frames into the next, gap < 0.15 s) | 3, not set by the board: 1.06 words per page on the coin narration | partly: `minFrames` 6 gives 1.34 on the same words; the board does not pass it |
| font | `FONTS.heavy` (Arial Black, then Segoe UI Black), weight 900 | - | built |
| size | `size` in u (1 u = 1 px at the 1080 short side) | 75 -> x-height 39 u | built |
| position | `center` + `yAt`; `Beat.caption` from a beat on | centre 0.704 H | built |
| outline | `outline` (stroke in em, painted under the fill) | 0.17 em -> ~6.4 u visible, #0b0b10 | built |
| shadow | text-shadow when `center` | (3, 3.5) u, blur 4 u, black 50 % | built (by-eye target) |
| fill | `color` | #ffffff | built |
| timing | `lead` (s before the word; the board's words carry `voOffset`) | 0.03 s, ~1 f early | built |
| pauses | `center`: a page stays until the next page starts | never blank after the first word; the first 2-3 frames are blank | partly |
| case | `uppercase` | false: text as written in `words.json` | built |
| punctuation | trailing `, . ; :` removed, `? !` kept | - | partly: the reference keeps it |
| numbers | text of `words.json` | digits only if the script writes digits | partly: write digits in the script |
| one line, max width | none: a long page wraps at the frame edge | - | not built |
| faces clear of the band | `shots.ts HEAD_FRAMING` eye lines 0.37-0.47 H | single-character shots | partly: no check for two-shots, lows, inserts |
| defaults outside a board | `WordCaptions` without props: top at 0.66 H, size 92, outline 0.06, lead 0.12, no centre | pre-1.9 values | pass the board's props in custom projects |
| other caption styles | `Captions style="pop"` (uppercase, highlighted word, spring pop) | - | not this style |

How to use it:

```tsx
// board.tsx renders this for every board (nothing to set):
<WordCaptions words={P.words} size={75} outline={0.17} lead={0.03} center yAt={/* 0.704 or the last Beat.caption */} />

// on a board: move the line only where something essential sits low, and move it back
{ at: "under", caption: 0.62, shot: { size: "low", on: "cart" } },
{ at: "Then", caption: 0.704 },

// a custom project (no board): pass the same props, plus the page merge rule
<WordCaptions words={words} size={75} outline={0.17} lead={0.03} minFrames={6} center y={0.704} />
```

Moving the line is a last resort: the reference never moves it. Reframe the shot first (eyes at 0.35-0.47 H).

## Check

`vfa ocr OUT.mp4` (or the QA analysis dir) writes `ocr.json` and `ocr.md`. Run the same command on a reference short to
calibrate the reader. Targets:

| field | target |
|---|---|
| `center_y_rel` | 0.700-0.708 |
| `core_height_u` (x-height for lowercase captions) | 38-41 |
| `font_size_u_est` | 72-78 |
| `outline_px_u` | 5.5-7.5 |
| `fill_hex` / `outline_hex` | white / near-black |
| `highlight_hex`, `background_box` | none, false |
| `pages` / video seconds | 2.6-2.95 |
| words in `words.json` / `pages` | 1.25-1.45 |
| `page_seconds` median | 0.25-0.45 s |
| `on_screen_frac` | >= 0.97 |
| `sync_offset_frames` | -1.5 to +0.5 |
| `uppercase_ratio` | low (sentence starts and names only); above 0.5 means capitals |
| font class | heavy sans |

- `words_per_page_median` reads 1 for a one-word track and for a 1.33 track alike: use words / pages.
- `vfa compare` allows 0.06 on the vertical position and 0.6 on words per page; both are wider than the errors we
  shipped. Read the raw numbers.
- OCR misreads small or stylised words and counts OCR tokens; confirm a doubtful page on a still.
- Look at one full-size still per caption length (one short word, the widest page) and a 3x crop: outline even all
  round, shadow down-right, nothing clipped at the frame edge, no face behind the line
  (`render.mjs --project ID --stills cues+10`).

## Common mistakes

From our coin short (1.8 captions, measured with the same scripts as the reference):

1. **Line too low:** centre at 0.743 H against 0.704. The 1.8 board put the TOP of the text at 0.70 H; 1.9 centres the
   line (`center`).
2. **Too big:** x-height 2.9 % H (56 px at the 1080 equivalent), 1.4x the reference; the 1.8 size was 110. Now 75.
3. **Outline too thin, no shadow:** ~0.25 % W against 0.6 %, about 2.5x too thin. Now a 0.17 em stroke under the fill
   (~0.6 % W visible) plus a soft shadow.
4. **One word per page:** the merge rule only joins words under 3 frames: 1.06 words per page on our narration against
   1.33 (`minFrames` 6 gives 1.34). Our read was also slower (3.09 against ~3.7 words/s), so changes per second alone
   would have hidden the gap: judge words per page first.
5. **The generic shorts recipe:** uppercase pages with a highlighted active word and a spring pop (`Captions style="pop"`,
   `general.md`) is a different style; 0 of 62 sampled reference pages had a colour and none moved.

## Sources

Private every-frame study of the 20 newest shorts of @RicksClips3000, a reference channel in this style (35,987 frames at
30 fps; caption timing against auto-caption word times on 15 films, sizes on 8 clean full-resolution frames, colour on
62 sampled pages, 2026-11-12); `vfa ocr` in `references/tools/analyzer.md`.
