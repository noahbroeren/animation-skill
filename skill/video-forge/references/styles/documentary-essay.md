# Style profile: "cinematic documentary essay" (dark, monochrome, archive-on-a-void mystery documentary)

How this profile was built:
- Channel choice: **LEMMiNO** (@LEMMiNO, long-form, 171 uploads listed on 2026-11-10). Why this one: it has the most *distinct and consistent* cinematic system among popular essay channels. Every documentary uses the same near-monochrome dark grade, archive material floating as cards in a black 3D void, condensed caps typography, a heavy vignette, long atmospheric cold opens and an original ambient score. It is the opposite pole to the bright 3D-explainer and flat-vector profiles. (Alternatives considered: Johnny Harris is map/handheld/vlog-driven and changes look per video, so it is a weaker template for a reusable style.)
- Sample: the documentary era only (the old "Top 10 Facts" lists were skipped). **9 documentaries**, 4.8 M-43 M views, 18-147 min long (dated ones: 2018, 2019, 2021, 2024), including the newest upload. Per video I measured the **first 90 s** and **one 120 s window from the middle** (cut-out clips, every frame at native 60 fps, 1080p/1440p): 18 clips, 31.5 minutes.
- Every clip got `vfa transitions` and `vfa stems` (Demucs). Hero breakdowns with Whisper word timing: the 43 M and 30 M views documentaries, intro and middle.
- Footage is not redistributed. Numbers and paraphrase only. Aggregate: `data/documentary-essay_fingerprint.json`.

## 1. Eras

| | older documentaries (n=8) | newest upload (n=1) |
|---|---|---|
| colour | near-monochrome: saturation **0.0-0.15** (median 0.04), neutral tints | one strong theme colour per video (purple/violet), saturation 0.84 |
| everything else | same grammar | same grammar, plus glowing card borders and HUD-like data text |

The system is stable across the catalogue (2018-2024 dated samples); only the accent colour changed in the newest film. Treat "monochrome + one accent" as the rule and the full-colour theme as a per-film variation.

## 2. Script formula

- **Cold open before any narration.** The logo sting comes first (about 3 s), then **10-35 s of atmosphere** (archival audio, cockpit/radio recordings, ambient score, on-screen text) before the narrator speaks. Narration start in the intro windows: 11, 12, 18, 25, 30, 35, 36 s (two films start almost at once). Median ≈ **18 s**.
- **Hook = a scene-setter, never a question** (8/9): 6 open with a date in past tense ("On <date>, <a person> did <odd thing>", "In <year>, a <who> at <where> ..."), 2 with a place in present tense ("At <airport>, a <plane> is preparing for departure", "Right outside <capital> lies ..."). One film opens first-person. No "you", no rhetorical questions in sentence 1.
- **Then the mystery is stated as an open question** and the film proceeds chronologically, chapter by chapter (chapter title cards in condensed caps), ending on unresolved theories.
- **Long, formal sentences:** median **18-20 words** in the hero intros, 12-18.5 mid-video; connectors "Nevertheless", "Even so", "However", "Unbeknownst to ...". Dry, precise, no jokes.
- **Pacing:** **2.29 words/s** overall (intro windows 1.92 because of the cold opens; mid-video **2.57**). Silence 2.4 % in intros, 0.8 % mid-video: speech is continuous once it starts, the breathing room is in the music.

## 3. Camera and editing grammar

- **Almost no hard cuts:** 0.67 cuts/min (ASL 45 s); **10/18 windows have at most 1 hard cut.** One window (a UFO film with dense found footage) is the exception at 33 cuts in 90 s.
- **The picture still changes every ~5 s:** content-change events every 4.3 s in intros (13.3/min) and 5.5 s mid-video (10.5/min), by soft means. `vfa transitions` classifies 123 scene changes (3.9/min): **card slides/wipes 26 %, dissolves 22 %**, hard cuts 15 %, whip-pans 13 %, zoom-throughs 10 %, dips to black 8 %. In the cold opens hard cuts nearly vanish (4 %) and **dips to black (16 %) and zoom-throughs (18 %)** carry the mood. The remaining content changes are cards and text entering a held frame.
- **Every frame drifts:** camera moving on 67 % of frames (intro 73 %, mid 63 %), fast only 13 %. **Push-in dominates (70 % of shots)**. Glides 34 frames at 60 fps (**0.57 s**), symmetric 9 f eases; a typical move is a slow push on a document card plus a lateral drift of 0.1-0.5 widths per sentence.
- Hero (43 M, middle): one continuous take for 90 s, a push or pull per sentence (push x1.23, push x1.83 + pan 1.06 w, pull x0.20 to reveal the book, then x0.85-0.95 pulls), cuts land on word onsets (+0.01 s and -0.10 s).
- Hero (30 M, middle): 2 cuts in 120 s; slow pushes (x1.04-1.30) on archival photos and maps; long holds (creep) while the narrator lists facts; jerk 3.9 (very smooth).
- **Depth:** cards (photos, documents, book pages, newspaper clippings) sit at different depths in a black void; DOF ratio **2.30** (the highest of the three profiles): background cards are heavily blurred, the active card is sharp.

## 4. Look

- **Low-key:** luma mean **0.14** (intro 0.10), contrast 0.13; black floor p1 **0.063** (a lifted charcoal, not pure black: clip black 0 %); white ceiling p99 only **0.76** (intro 0.67): highlights are held back, white text and paper are the brightest things.
- **Monochrome:** saturation 0.05, colorfulness 0.04, neutral shadow and highlight tints (Lab a/b ≈ 0). Archival photos and footage are desaturated to match; **one accent colour** carries meaning (red flight path on a dark map, red runes, a single highlighted word; the newest film: violet).
- **Heavy vignette:** corner/centre luma ratio **0.63** on keyframes (flat-vector 0.79, 3D explainer 0.85).
- **Texture:** grain sigma 0.85 (fine, digital-clean overlays on noisy archive), slight **chromatic aberration** on footage edges (seen on sheets), soft halation on white text.
- **Resolution honesty:** archival inserts are low-detail (one middle window measured an effective 172 px of detail inside a 1080p frame); the graphics around them stay crisp. Mixing soft archive with sharp type is part of the look.

## 5. "Characters"

There are no animated characters. People appear as:
- archival **portrait photos in white-bordered cards** (often with a name label in condensed caps and a role line in small italic caps)
- silhouettes and grey placeholder avatars when no photo exists
- desaturated **re-enactment footage** in the cold open (airport, cockpit, hands on a keyboard), graded dark with crushed highlights
- quoted voices as **subtitle-style text**: a small italic caps speaker label above a white line of dialogue, centred.

## 6. Typography

- **Condensed sans in caps** (DIN Condensed/Bebas-like), tracked wide for place/date stamps ("KUALA LUMPUR, MALAYSIA" + a small date line), bold condensed caps for chapter/title cards.
- Dialogue/quote lines: small italic caps label + white regular line, lower-middle of the frame.
- Monospace (typewriter) text for documents and ciphers in the code-themed films; glowing accent on the active word.
- Data graphics: thin white lines, dotted routes, hairline scales with tick labels, an audio-waveform bar strip for recordings. No captions burned in.

## 7. Sound

- **Film-like dynamics:** **-16.8 LUFS**, LRA **6.9** (intros 8.7, up to 15.2 in one cold open; mid-video 4.4), TP -1.55. This is the most dynamic of the three profiles: quiet atmospheres, loud stings.
- **Ambient score almost always on:** music presence **93 %** (intro 95 %, mid 90 %), music stem about -25 LUFS; the score sits further under the voice than in the flat-vector profile: margin **15.8 dB** (cold open 13.5 dB, the score leads; mid-video 18.4 dB).
- **Music drops before revelations:** 6 deliberate stops in 18 windows (about one per 5 min). Non-vocal hit rate is the lowest of the three profiles (**1.1/s**): sparse, deliberate sound design.
- Onset rate 3.7/s: score pulses, typewriter/UI ticks, archival sound effects. The logo sting opens every film.
- Voice: calm, low, measured, close-miked; no music-driven energy changes in the delivery.

## 8. Engine recipe (video-forge)

```
format  = long (2560x1440 @ 60, or 30), chapters as separate scenes (longform.md)
look    = LOOKS["doc-noir"] (below): monochrome grade + 1 accent, strong vignette, fine grain, slight CA
world   = Stage3D void (black/charcoal background, no sky), archive as textured planes ("cards") at z = -2..-12
          with a thin white border, soft shadow, DOF on; maps as dark planes with emissive accent routes
camera  = cameraRig: one slow push (x1.05-1.3) per sentence, lateral drift 0.1-0.5 w, glide 34 f (0.57 s),
          eases 9 f; rig.push { rate: 0.0006-0.001 } creep on holds; handheld 0; pull-outs to reveal a card stack
edit    = ≤ 1 hard cut/min; scene changes by dissolve / dip to black / camera travel to the next card;
          cuts on word onsets; chapter cards (ChapterCard restyled: condensed caps, charcoal, no accent bar)
type    = LowerThird restyled to condensed caps + small italic role line; quote lines as centred subtitles
cold open = 10-35 s of atmosphere (sting, room tone, archival audio, place/date stamp) before the first narrated line
audio   = ambient score bed (music.py "pad" layers, slow), stings on chapter cards, music drops before key reveals;
          master -16.5 LUFS, LRA 6-9 (do NOT over-compress), TP -1.5
QA      = vfa qa FINAL --ref references/styles/data/documentary-essay_fingerprint.json
```

The fingerprint is a median over 90 s / 120 s windows; its `speech_start_s` is set to the measured narration start of the intros (18 s), so compare the opening of a render against it, and expect mid-video windows to show a "speech start" gap by construction.

Suggested Look preset:

```ts
LOOKS["doc-noir"] = deepMerge(base, {
  name: "doc-noir", tonemap: "aces", exposure: 0.9,
  grade: { blackPoint: 0.055, whitePoint: 0.80, contrast: 1.1, pivot: 0.3, saturation: 0.08, vibrance: 0.0,
    shadowTint: [0, 0, 0], highlightTint: [0, 0, 0] },   // p1 0.063, p99 0.76, sat 0.05, neutral tints
  ink: { enabled: false },
  dof: { enabled: true, maxBlur: 14, aperture: 1.4 },     // DOF ratio 2.30: background cards very soft
  bloom: { enabled: true, threshold: 0.75, strength: 0.2, radius: 1.2 }, // halation on white type/paper
  vignette: { amount: 0.45, softness: 0.5 },               // corner/centre luma 0.63
  grain: { amount: 0.01, size: 1.1 }, chroma: 0.8, softness: 0.1, halation: 0.08, motionBlur: 0.4,
});
// accent: keep ONE saturated hue (e.g. red #d01c1c for routes/highlights) by rendering accent elements
// on a layer that skips the saturation grade, or set saturation 0.08 and draw accents with emissive colour.
```

## 9. Missing in the engine for this style

| missing | why it matters here | suggested implementation |
|---|---|---|
| **Archive "card" system** (photo/document planes with border, shadow, paper texture, stacking) | the main visual unit of every scene | `Card3D(texture, {border, shadow, curl})` in `three/`; load stills via `TextureLoader` + `staticFile`; `stack(cards, spread)` layout helper; draw-on borders. |
| **Video textures inside Stage3D (archival footage on cards)** | footage clips play inside cards and full frame | `THREE.VideoTexture` is not frame-accurate in Remotion; pre-extract frames (ffmpeg to an image sequence) and swap textures per frame, or use Remotion `<OffthreadVideo>` layered under a transparent Stage3D. |
| **Selective colour (monochrome grade + one accent)** | the red route / highlighted word on a grey world | a mask pass in `PostPipeline`: render accent objects on a layer, composite after the desaturating grade (like the existing NOINK layer trick). |
| **Map toolkit** | flight paths, locations, dotted routes | dark world/region geometry from GeoJSON (Natural Earth, public domain) extruded or flat, with animated dashed polylines, pins and labels in condensed caps. |
| **Documentary typography presets** | place/date stamps, chapter cards, quote subtitles, waveform strips | `PlaceStamp`, `QuoteLine` (italic caps label + line), `Waveform` (bars driven by the audio envelope) components; condensed font (e.g. a licensed DIN-Condensed-like or Oswald/Bebas Neue under OFL). |
| **Dissolve / dip-to-black between camera setups inside one scene** | the dominant soft transitions | timeline `crossfade` and `dip` exist between scenes; add an in-scene `dissolveTo(keyB, f, len)` on the camera rig that renders both setups and mixes them. |
| **Film-dynamics master preset** | LRA 6-9 measured; the short-form mix model would crush it | `mix.py` preset "doc": -16.5 LUFS target, gentle limiter only, no bus compression, music sections with drops before reveals. |
| **Chromatic aberration only at the edges + halation on type** | the "lens" feel of footage and text | already partly in `Look.chroma`/`halation`; expose per-layer strength so UI text is not fringed. |
