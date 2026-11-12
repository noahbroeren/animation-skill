# Research notes

The full study of the reference video and of the 11 supplied skill projects lives in
[`skill/video-forge/references/research/reference-study.md`](../skill/video-forge/references/research/reference-study.md) (it ships with
the skill so Claude can consult it). This page records the technology research and decisions.

## What was accessed and verified

- Reference video `OtbLL6OBNE4` (2560x1440, 30 fps, VP9): downloaded at native quality, transcript (original
  English captions) read in full, every frame measured with `vfa` (21,361 frames).
- Channel uploads list (9 long-form videos, no Shorts tab); transcripts of `_fIoJ_ywGfY` (realistic 3D workflow) and
  `IE4id78LePo` (2D workflow); description of `ZN-Ugd-4HDM` (Blender drone shot).
- The creator's free skill: the `claude-animated-shorts` ZIP (identical to the installed `cartoon-3d-short` skill).
- Not accessed: the creator's paid Skool skill (paywalled), and the 20/50 reference shorts the creator analysed (not named in the videos).
- Reference footage and frames are NOT redistributed in this repository (copyright); only measured numbers and written analysis.

## Technology survey → choice

| area | options weighed | chosen | reason |
|---|---|---|---|
| programmatic rendering | Remotion, Motion Canvas, Revideo, HyperFrames (GSAP), raw Playwright capture, Blender bpy | Remotion 4.0.542 | deterministic frame model, parallel headless Chrome with GPU WebGL (ANGLE/D3D11 verified on RTX 5070), React for typography, programmatic API for chunking |
| 3D | three.js r187, Babylon.js, Blender | three.js | lightweight, full shader control, used by the reference style |
| post-processing | pmndrs/postprocessing, own passes | own passes | pass order + determinism (reference's ink-erased-by-blur bug) |
| video analysis | PySceneDetect, ffmpeg scdet, OpenCV flow, phase correlation, learned (CLIP/LPIPS) | OpenCV + NumPy custom pass | one streaming pass for all metrics; no model downloads; camera estimate tested against ground truth |
| speech | faster-whisper, whisper.cpp, subtitles | faster-whisper (array input) + VTT fallback | word timestamps; GPU when available. PyAV API change broke file input → decode via ffmpeg |
| loudness | pyloudnorm, ffmpeg ebur128/loudnorm | ffmpeg | no extra deps, two-pass linear normalisation + true-peak limiter |
| encoding | x264, x265, NVENC, SVT-AV1, ProRes | x264 CRF 16 slow (default), x265/ProRes optional | quality-first upload masters; YouTube re-encodes (feeding ≥ recommended bitrate) |
| upscaling | libplacebo, Real-ESRGAN, lanczos | none needed (native rendering) | documented as external, always labelled |

## Platform specs used

- YouTube recommended SDR upload bitrates: 1440p30 ≈ 16 Mbps, 1440p60 ≈ 24, 2160p30 ≈ 35-45, 2160p60 ≈ 53-68.
- Loudness normalisation targets around -14 LUFS (YouTube/Spotify-class); true peak ≤ -1 dBTP.
- Vertical UI safe zones: keep text out of the bottom ~20 % and the right ~14 % (action column).
