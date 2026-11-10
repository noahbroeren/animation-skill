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
