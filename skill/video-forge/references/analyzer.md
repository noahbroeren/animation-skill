# Analyzer (`vfa`): what is measured, and what to do with it

One streaming pass decodes **every frame** at native fps (no sampling) at 512 px wide. Memory is constant, so 60-minute videos are fine. Throughput is about 70 fps on a modern CPU: a 12-minute 1440p video takes about 5 minutes. Full-resolution checks (keyframes, palette, native-detail estimate) use stills grabbed per shot.

## Commands

| command | does |
|---|---|
| `vfa probe V` | ffprobe summary (size, fps, codec, bitrate, audio) |
| `vfa fetch URL [--max-height 2160]` | yt-dlp: best video plus the ORIGINAL audio track (YouTube may serve auto-dubs) and subtitles, merged to mkv |
| `vfa analyze V [--out D] [--width 512] [--sheets auto\|all\|sampled\|none] [--speech auto\|whisper\|subs\|off] [--start s --duration s]` | full measurement |
| `vfa channel URL [--top 20] [--sort views\|recent] [--tab shorts\|videos] [--download] [--analyze]` | list, download and analyze a channel, then aggregate |
| `vfa aggregate DIRS... --out D` | median/IQR fingerprint across videos, plus hooks and openers |
| `vfa compare REF OURS [--out gap.md]` | gap table: metric, ref, ours, gap = \|delta\|/tolerance, and the action to take |
| `vfa sbs --ref a,b --ours c,d --out s.jpg` | side-by-side judge sheet |
| `vfa qa V [--plan timeline.json] [--ref FP] [--fps] [--duration] [--min-class 2k\|4k]` | delivery gate (see quality.md) |

## Outputs of `analyze`

- `fingerprint.json`: everything numeric (schema `vfa.fingerprint/1`). Feed it to compare and qa.
- `report.md`: a human/Claude-readable summary plus the shot list and the suggested engine look.
- `look_suggestion.json`: measurements mapped to engine parameters: grade black/white point, contrast, saturation, shadow/highlight tint, ink strength, DOF on/off, grain, camera glide/attack/release frames, ASL, LUFS, words/s.
- `timeline.png`: all per-frame series on one image. Look at this first.
- `sheets/sheet_*.jpg`: labelled contact sheets (frame numbers burned in; likely cuts boxed red).
- `keyframes/shotNNN_fXXXXXX.jpg`: a full-resolution mid-frame per shot. `palettes.png` shows the per-shot k-means palettes.
- `frames.npz`: raw per-frame arrays (for custom plots).
- `transcript.json`, `onsets.json`, `audio_env_db.npy`.

## Metric glossary

### Editing
- **cuts**: HSV-histogram Bhattacharyya distance plus luma change, both relative to their rolling median. A cut is vetoed when the camera model explains the change (a fast pan is not a cut). `flash_frames` are 1-3 frame cut-backs (flash/white frames, glitches).
- **ASL**, shot length percentiles, cuts/min, first cut. Shorts styles vary widely: some have 0-1 cuts in 60 s (the camera travels instead); explainers often run 1-3 s per shot.
- **Limit:** cross-dissolves and morphs are not counted as cuts. Look at the sheets around big luma/hue ramps.

### Camera (estimated from content motion)
- **Method:**
  1. LK optical flow on Shi-Tomasi corners, then a RANSAC similarity fit (pan, tilt, zoom, roll). Moving characters become outliers, so they don't pollute the camera estimate.
  2. Fourier-Mellin phase correlation as the fallback for flat, feature-poor art. It handles translation and log-polar scale/rotation.
- **Units:** `dx`/`dy` are content shift in frame widths per frame (content moves right means the camera pans left). `dlogs` is log zoom per frame (positive means push-in).
- **Integration:** the path is integrated per shot and differentiated with a Savitzky-Golay filter, so speed is in frame-widths/s plus |log-zoom|/s.
- **Speed bands:** `frac_creep` (>0.5 %w/s, "never dead-still"), `frac_move` (>3 %), `frac_fast` (>15 %), `frac_whip` (>60 %), `frac_still`.

  The reference author's first tool said "still 80 % of the time"; frame-accurate tracking showed 65 % moving. Slow creeps matter. Our integration over the path catches sub-pixel creeps, validated on synthetic 0.15 px/frame motion.
- **Moves:** segments above 3 %w/s, extended to where speed falls under 25 % of that threshold. Each move gets:
  - `frames` (glide length) and `attack_frames`/`release_frames` (10→90 % of peak speed), plus the plateau
  - `ease`: one of snap (≤6 f), ease-in-out, ease-out (fast start), ease-in (hard stop), linear-ish, asymmetric
- **jerk_rms:** RMS of the third derivative of the path. Lower is smoother. A human-judged "cheap camera" often had about 8x the jerk of the reference.
- **push_in_shot_frac / pull_out_shot_frac**, and per-shot `camera` labels (push-in x1.08, pan-left 0.12w, handheld/shake, locked/still).

### Colour and grade
- **Luma** (Rec.709) mean, std (contrast), percentiles: **p1 = black floor** (premium cartoon and film looks rarely hit 0), p99 = white ceiling, `clip_black`/`clip_white` %.
- **Saturation**: HSV mean and p90. **Colorfulness**: Hasler-Süsstrunk. **Warmth**: mean R−B.
- **Tonal tints** in CIELAB:
  - `shadow_a`/`shadow_b` are the mean a*/b* of the darkest 20 %; `highlight_*` are the brightest 20 %.
  - The hue names (`shadow_tint_name`: blue-violet, teal-cyan, ...) are what the eye calls "purple shadows" or "warm highlights". Lab a+ is magenta and a− is green; b+ is yellow and b− is blue.
- **palette**: k-means (k=6) in Lab on each shot's keyframe, weighted.

### Texture and lens
- **ink_on_edges:** the share of Canny edges with a dark thin line (morphological black-hat) within 1 px. "Black lines on ~3 of 4 edges" is about 0.75. `ink_density` is the share of pixels that are ink.
- **edge_density:** detail and texture amount. Plain flat materials read cheap; painted grain raises it.
- **grain_sigma:** Immerkær noise estimate in 8-bit units. About 1 means clean digital; 3-6 means visible film grain. Grain inflates bitrate.
- **dof_ratio:** Laplacian sharpness of the centre over the border ring. Above 1.4 suggests a blurred background or subject isolation; about 1 means everything is sharp.

### Motion inside the frame
- **activity:** motion-compensated residual, i.e. what moves after removing the camera move: characters, micro-animation, particles. A near-zero median means "dead" frames.
- **fg_motion:** outlier (non-camera) feature motion.

### Resolution honesty
- **native_scale_estimate:** spectral cliff detection. An image upscaled by k has almost no energy above 1/k of Nyquist.
  - It reliably flags 2x and 3x upscales. It often misses ~1.33x upscales and upscales hidden under grain or noise.
  - It is a WARN signal, never proof. A container of 2560x1440 does not mean 1440p of detail.

### Audio
- **EBU R128 via ffmpeg:** `integrated_lufs` (platforms normalise near -14), `lra_lu` (loudness range: 3 = very compressed, voice-forward; 8-12 = dynamic film mix), `true_peak_dbtp` (should be ≤ -1).
- **rms envelope** at 50 ms; **silences** (< -45 dBFS for ≥ 0.25 s) and `silence_frac` (dead air).
- **Onsets** (spectral flux) and `onset_rate`: SFX and music hit density. **BPM** by autocorrelation with a 120 BPM prior; `bpm=None` means no steady pulse (voice-only).

### Speech and script
- Sources: sidecar `.vtt` (fast; YouTube auto-subs) or faster-whisper (word timestamps; GPU if CUDA works, else CPU int8).
- Metrics:
  - `wps_speaking` (≈3.7-4.0 for relentless story shorts, ≈2.8 for calm explainers)
  - `speech_start_s` (how fast the hook starts)
  - `words_first_3s`
  - pause median and p90, and `long_pauses`
  - `hook` (first sentence)
  - `sentence_words_median`
  - `repeated_openers` (signature phrases like "You see")

## Reading strategy (keep context small)

1. `report.md` sections: Editing, Camera, Color, Texture, Audio, then the hook.
2. `timeline.png`: one image, the whole video.
3. Sheets: only the hook, the cuts and the climax (sheet index = frame / 60).
4. Keyframes: 3-6 representative shots.
5. Never paste whole JSON into the conversation; quote the fields you need.

## Known limits (state them to the user when relevant)

- Global camera motion assumes one dominant plane. Heavy parallax or full-frame character motion confuses it; the shot is then labelled from a mixed signal. Check sheets.
- 2D animation "camera moves" are often layer moves; the estimator reports the dominant layer.
- Dissolves, morph transitions and on-screen text are not classified automatically. Read them from the sheets.
- The speech engine falls back to subtitle timing, which is approximate word-level.
- No OCR or font identification. Identify fonts visually and pick the closest licensed or system font.

## Channel-scale and script-x-picture tools (1.1)

- `vfa batch VIDEO_DIR --out D --workers 4 [--meta selection.json --group-key era]`: parallel full analysis of many videos (cached). It writes:
  - `index.md`: one row per video with views, duration, cuts, ASL, words/s, moving %, glide, black floor, saturation, ink, shadow tint, LUFS and hook
  - `group_<g>/` aggregates per group (e.g. per era)
  - `all/`
  - `views_correlation.md`: Spearman rank correlation with log(views); indicative only
- `vfa breakdown ANALYSIS_DIR`: one row per sentence with:
  - time, words/s and the text
  - the camera move WITHIN that sentence (push/pull x, pan, tilt, WHIP)
  - cuts inside it, and the light shift (brighter/darker, more/less saturated)
  - the contact-sheet index to inspect

  It also lists every cut against the nearest word onset (cut-on-word offsets). Run the analysis with `--speech whisper` for exact word times.
- Rate limits: YouTube may answer HTTP 429 on subtitle requests during bulk downloads. Re-run video-only with `--sleep-interval 4` and reuse the subtitles you already have.

## Deep extras (1.2): captions, transitions, stems, style embeddings, acting

These lift two "Known limits" above: transitions are now classified, and on-screen text is now read (OCR plus a heuristic font class).

**Conventions:**
- Each extra is its own command and writes `<name>.json` + `<name>.md` into the analysis dir.
- `T` is a video or an analysis dir. Given a bare video, a light `analyze` runs first (into `<video>_analysis/`).
- Optional packages are imported lazily. A missing one gives `"available": false` with an install hint, or a fallback that is clearly labelled HEURISTIC. Nothing here can crash `vfa analyze`.

| command | needs | does |
|---|---|---|
| `vfa ocr T [--every 0.5]` | rapidocr-onnxruntime | caption track, words/page, frame-accurate page timing, size in u, colours, highlight, box, font class, sync vs transcript, static text |
| `vfa transitions T` | nothing extra | classifies every scene change and finds the soft ones the cut detector missed |
| `vfa stems T` | demucs + torch (CUDA if present) | vocals/drums/bass/other stems: music presence, voice-over-music margin, hit density, music stops |
| `vfa embed T [--every 1]` | open_clip_torch + torch | CLIP zero-shot tags (render style, lighting, shot type); cached `embeddings.npz` |
| `vfa similar REF OURS [--out P]` | open_clip_torch + torch | per-shot nearest reference frame, centroid cosine, style similarity 0-100 |
| `vfa pose T [--stride 1]` | mediapipe (Tasks API) | face/body coverage, lip-sync r + lag, blink rate, gesture speed |
| `vfa analyze V --deep [--deep-skip stems,pose]` | whatever is installed | runs the five extras and stores their summaries in `fingerprint["deep"]`; appends their sections to `report.md`. Full-length analyses only. |

### Install (Windows, Python 3.14 tested)

1. `py -m pip install rapidocr-onnxruntime demucs open_clip_torch mediapipe`
2. A CUDA torch: `py -m pip install torch torchaudio torchvision --index-url https://download.pytorch.org/whl/cu130`. RTX 50-series GPUs need a CUDA ≥ 12.8 build. Without it, demucs and CLIP run on CPU (slower).

| package | install | weights fetched on first use |
|---|---|---|
| torch 2.14 cu130 | 2.0 GB wheel, about 5 min | |
| rapidocr-onnxruntime | 12 MB, seconds | bundled |
| demucs | small | htdemucs, about 80 MB (Hugging Face hub) |
| open_clip_torch | small | ViT-B-32 laion2b, about 600 MB (Hugging Face hub) |
| mediapipe | about 60 MB (pulls opencv-contrib) | face/pose `.task` files, about 9 MB, into `~/.cache/vfa` (`VFA_CACHE` moves it) |

### `vfa ocr` (captions)
- **Coarse pass:** OCR runs on a frame every 0.5 s (1 s for videos over 3 min, 2 s over 15 min), plus 2 frames after each cut, at 720 px wide.
  - Boxes cluster into horizontal bands. The caption track is the centred band whose text keeps changing.
  - Bands of unchanged text are reported as `static_text` (titles, watermarks).
- **Fine pass:** gives frame-accurate page timing.
  - Every frame, the caption band is reduced to a fill-colour mask signature. A signature change starts a new page.
  - Each page is OCR'd once. Identical consecutive pages merge; `highlight_steps` counts these same-text restyles.
- **Style:** k-means (Lab, k=3) inside each padded box separates background, outline (the cluster that rings the fill) and fill (the cluster deepest inside the glyphs). Reported fields:
  - colours: `fill_hex`, `outline_hex`, `outline_rel_em`
  - `highlight_hex`: a second, saturated fill colour, i.e. the active word
  - `background_box`: a uniform ring around the text that stays constant while the picture changes
  - sizes, in engine u (1 u = 1 px at a 1080 px short side): `text_height_u` (ink), `core_height_u` (cap height for uppercase captions, x-height otherwise), `font_size_u_est`
  - `uppercase_ratio`, `center_y_rel`, `on_screen_frac`
- **Sync:** pages are fuzzy-matched to the words in `transcript.json`.
  - `sync_offset_s` = page start minus word start. Negative means the caption leads the voice.
  - Analyze with whisper for exact word times.
- **Font (HEURISTIC):**
  - Measures: stroke weight in em (Arial Regular ≈ 0.09, Bold ≈ 0.15, Black ≈ 0.2), stroke contrast, advance width in em (condensed below 0.45), and advance uniformity (mono).
  - Classes: heavy sans (condensed), regular/light sans, serif, mono, handwritten. Each comes with suggested families.
  - It is a starting point: confirm visually.
- **Limits:**
  - RapidOCR misreads stylised or small text (e.g. "puta" for "put a"); words/page counts OCR tokens.
  - On low-contrast boxed designs, the fill and box roles can swap.
  - Only one caption track is followed.

### `vfa transitions`
- **Pass 1** runs at 160 px and records, per frame:
  - frame difference, luma, contrast, gradient energy in x and y, sharpness
  - a sliding blend fit: is frame t ≈ (1−a)·frame(t−K) + a·frame(t+K)? A phase-correlation veto stops slow pans posing as blends.
- **Candidates:** analyzer cuts, own spikes, sustained elevated-difference runs, blend runs, and dark/bright excursions. Each grows into a span [s, e]; A = frame s−1 and B = frame e.
- **Types:**
  - `hard_cut`: a one-frame change
  - `match_cut`: a hard cut with SSIM(A,B) > 0.55 and edge-map correlation > 0.5
  - `flash`, `dip_black`, `dip_white`: luma excursions
  - `dissolve`: a monotonic alpha ramp with median residual below 0.2 (below 0.3 counts as weak)
  - `wipe`, with direction: every changed pixel equals A or B (partition fit below 0.2), the A|B mask is spatially coherent, and the B share grows
  - `whip_pan`: camera speed above 1.5 w/s from `frames.npz`, or directional blur
  - `zoom_through`: accumulated |log zoom| above 0.35
  - `other`: an analyzer cut that fits nothing above
- **Outputs:** the list with frames and confidence, counts, `per_minute`, `dissolves_per_minute`, `soft_per_minute`, `missed_by_cut_detector`.
- **Validation:** synthetic hard cut, 12-frame dissolve, dip to black and 10-frame wipe, all found within ±3 frames, with nothing spurious in the creeping shots.
- **Limits:**
  - `whip_pan`/`zoom_through` also fire on fast camera moves inside one continuous 3D scene. They are "camera transitions", not necessarily scene changes.
  - Morphs and soft-edged shape wipes come out as dissolves or are dropped.
  - Analyzer cuts that are really fast motion show up as `other`.

### `vfa stems`
- **Separation:** Demucs htdemucs splits the mix. The WAVs are cached in `stems/`, plus `music.wav` = drums + bass + other.
- **Metrics:**
  - `loudness_lufs` per stem (ffmpeg R128)
  - `music_presence`: the share of 100 ms hops where the music stem's 400 ms RMS is above −48 dBFS
  - `voice_music_margin_db` per transcript sentence: unweighted RMS of vocals minus music (≈ LU). Aim for ≥ 6 dB on every sentence.
  - `onset_rate`: drums / other / non-vocal hits per second (SFX density)
  - `music_stops`: music drops ≥ 15 dB under its 3 s median, or below −55 dBFS, for ≥ 0.3 s after at least 1 s of music
- **Fallback without demucs (HEURISTIC):** the bed level is measured in speech pauses (transcript word gaps), and onsets come from the HPSS percussive part.
- **Limits:** separation bleeds. Sung vocals and voice-made SFX land in `vocals`, and synthetic tones can land in any stem.

### `vfa embed` / `vfa similar`
- **Model:** open_clip ViT-B-32 laion2b by default (`VFA_CLIP_MODEL=ARCH:TAG` to change). It embeds a frame every 1 s plus each shot keyframe, cached per model.
- **Tags** are softmax probabilities over fixed prompt lists:
  - style: 2D cartoon, 3D render, flat vector, photoreal, anime, pixel art, low poly, clay, paper cutout, live action, whiteboard
  - lighting: day, golden hour, night, interior
  - shot: close-up, medium, wide, aerial

  They are good for comparing videos, not ground truth: CLIP B/32 often calls western cartoons "anime".
- **`similar`** reports:
  - the per-shot nearest-neighbour cosine of our shot mean against every reference frame
  - the centroid cosine and the tag-distribution overlap
  - `style_similarity` = 100·clip((centroid cos − 0.6)/0.35), a heuristic. The same video scores 100. Two shorts from the same cartoon channel scored 65-79 (centroid 0.83-0.88). Their frame NN cosine was only about 0.55-0.6, because NN measures shared scenes rather than style.
- **In compare and aggregate:** `fingerprint.deep.embed.centroid` lets `vfa compare` add an "art-style similarity" row, and `aggregate` averages the centroids.

### `vfa pose`
- **Engine:** MediaPipe FaceLandmarker (blendshapes `jawOpen`, `eyeBlink*`) plus PoseLandmarker lite, in VIDEO mode. Every frame is used (stride 2-4 for long videos).
- **Outputs:**
  - `coverage`: any / face / body
  - `lip_sync`: Pearson r between mouth openness and the speech envelope (the vocals stem if `stems` ran), with the best lag in frames (+ = mouth late)
  - `blink_rate_per_min`
  - `gesture_activity`: upper-body landmark speed in shoulder-widths/s
  - per-shot values
- **`animation_vs_speech`:** the analyzer's camera-compensated activity against the speech envelope. It is style-agnostic.
- **Fallback without MediaPipe:** Haar face boxes plus motion energy in the lower third of the face.
- **Honesty rules:**
  - Detectors are trained on real people, so cartoon characters are often missed or tracked unstably.
  - A gesture median above 3 shoulder-widths/s raises a `warning` (jittering landmarks).
  - Low coverage means "not measurable", never "no character".

### Comparable deep metrics in `vfa compare`
Rows appear only when both fingerprints carry them (`analyze --deep`):

| group | metrics |
|---|---|
| captions | words/page, font size (u), uppercase share, vertical position, sync offset |
| transitions | dissolves/min, soft transitions/min |
| sound | music presence, voice-over-music margin, non-vocal hit rate |
| look | art-style similarity: CLIP centroid cosine, OK at ≥ 0.83 |
