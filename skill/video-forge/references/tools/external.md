# External services and optional integrations

Everything in the core pipeline runs locally and free: analysis, rendering, SFX, score, offline TTS, mixing and QA. The integrations below are optional upgrades. **Anything that costs money or credits: show the estimated cost and get an explicit yes first.** Never assume a budget.

| need | options | notes |
|---|---|---|
| premium voice | ElevenLabs (MCP connector or API), other neural TTS, a human recording | Estimate characters × the credit rate and confirm before generating. Then run `tts.py align`. Offline fallback: OS voices (SAPI/`say`/espeak), which work but sound robotic. Label it as such. |
| AI video plates (photoreal shots, b-roll) | Veo, Kling, Runway, Sora-class models via their APIs or connectors | Generated clips are typically 720p-1080p and **must be labelled upscaled** if delivered at 2K/4K. Prefer them for backgrounds or plates composited under native-resolution typography and graphics. Check identity drift between clips. |
| photoreal 3D | Blender (Cycles/EEVEE) via `engine/tools/blender_bridge.py` | Bundled bridge (glTF scenes, HDRI, shadow catcher, DOF, Freestyle ink, same camera grammar as the engine; see engine.md). Blender itself is a free install. Render natively at 2K, or render lower and upscale **and say so**. |
| upscaling | ffmpeg `libplacebo` (GPU, ewa_lanczossharp), `zscale`/lanczos, Real-ESRGAN-class models | Upscaling adds sharpness, not real detail. `vfa qa` estimates effective detail; report "rendered at X, upscaled to Y". |
| licensed music | the user's library, Epidemic/Artlist-type services, CC0 | The procedural `music.py` is a placeholder bed. A licensed track is usually better for hero pieces; `mix.py` ducks it under the voice. |
| real SFX | Freesound (CC0/CC-BY with attribution), own foley | Use for realism; keep the synthetic SFX for frame-exact sync hits. |
| stock and scanned assets | Poly Haven (CC0 HDRIs/models/textures), Kenney (CC0), NASA imagery (public domain), Smithsonian 3D | "If a real one exists, download it." Record licences in `work/<id>/CREDITS.md`. Ask before downloading large packs. |
| fonts | Google Fonts (OFL), the user's brand fonts | Put files in `engine/public/fonts`; load them with FontFace. |

## Downloads and accounts

- `vfa fetch`/`channel` download only what the user asked to analyze. Respect platform terms and copyright: analysis is fine, but never re-publish reference footage.
- Never create accounts or enter credentials for a service. If something needs a login or API key, ask the user to set it up.

## Honest labelling template (put it in the delivery message)

> Rendered natively at 2560x1440, 30 fps, H.264 CRF 16, -14.0 LUFS. All visuals are procedural/real-time 3D (no AI video generation, no upscaling). Voice: offline Windows SAPI (robotic; swap for a premium voice with your OK). QA: WARN (2 advisories: ...).
