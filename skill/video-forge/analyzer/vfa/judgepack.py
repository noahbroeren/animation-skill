"""Judge packs: everything a fresh-context reviewer agent needs to score ONE area, on disk.

  py analyzer/vfa_loop.py judgepack --ours QA_DIR/analysis --ref REF_ANALYSIS_DIR_OR_AGGREGATE --out PACK_DIR [--gap gap.json] [--qa qa.json]

For each area (color, ink, light, texture, characters, depth, camera, edit, typography, sound, story) it writes
PACK_DIR/<area>/ with:
  prompt.md   the rubric for that area, the measured rows that belong to it (ours vs reference + gap), what to look at,
              and the REQUIRED JSON answer schema (score 0-10, evidence frames, fixes routed to file owners)
  sbs.jpg     reference keyframes beside ours at matching relative times (when a reference analysis dir is given)
  sheets.txt  which contact sheets / frames to open
The director spawns one reviewer per area with prompt.md + the images, collects their JSON into PACK_DIR/scores.json
(`vfa_loop.py collect`), and routes fixes to fixer agents by file ownership (references/pipeline/director-loop.md).
"""
from __future__ import annotations

import glob
import json
import os

AREAS: dict[str, dict] = {
    "color": {"metrics": ["luma_mean", "luma_std", "luma_p1", "luma_p99", "sat_mean", "colorfulness", "warmth", "clip_"],
              "rubric": "Grade matches the reference: black floor, white ceiling, contrast, saturation, warmth, no clipping.",
              "owners": ["look.ts (grade presets / lookTimeline)", "shaders.ts (TOON_SETUPS litTint/shade)"]},
    "light": {"metrics": ["shadow_", "high_", "warmth"],
              "rubric": "Key/fill direction and colour, shadow hue (violet/blue vs brown), light follows the story beats.",
              "owners": ["project lights()/sun per beat", "shaders.ts TOON_SETUPS", "look.ts tints"]},
    "ink": {"metrics": ["ink_on_edges", "ink_density"],
            "rubric": "Outline coverage and weight on geometry edges, no lines on cards/sky, lines blur with DOF.",
            "owners": ["look.ts ink widths/creases", "post.ts ink thresholds"]},
    "texture": {"metrics": ["edge_density", "grain_sigma"],
                "rubric": "Materials read painted/premium: colour variation, dark joints, props density; no plastic flatness.",
                "owners": ["textures.ts", "world.ts props", "project world build"]},
    "characters": {"metrics": ["activity", "fg_motion"],
                   "rubric": "Design consistency, proportions, expressions readable at phone size, acting lands before words, lit by the scene.",
                   "owners": ["characters/toon.ts", "three/cast.ts", "project poses"]},
    "depth": {"metrics": ["dof_ratio"],
              "rubric": "Subject separation: DOF on close-ups only, foreground framing, fog/aerial perspective, layering.",
              "owners": ["look.ts dof", "project camera focus", "world fog"]},
    "camera": {"metrics": ["frac_", "glide_frames", "attack_frames", "release_frames", "jerk", "push_in"],
               "rubric": "Glides ~reference length with soft ease, constant push on holds, motion blur on fast travels, no snaps.",
               "owners": ["project cameraRig keys / push / follow", "look.motionBlur"]},
    "edit": {"metrics": ["asl_seconds", "cuts_per_minute", "first_cut"],
             "rubric": "Cut count/ASL near reference, cuts on word onsets, transitions match grammar, no glitches.",
             "owners": ["project SceneDefs / innerCuts / transitions"]},
    "typography": {"metrics": ["caption", "text"],
                   "rubric": "Caption style/position/size like reference, synced to words, inside safe zones, readable.",
                   "owners": ["two/text.tsx (Captions/WordCaptions)", "project overlay"]},
    "sound": {"metrics": ["integrated_lufs", "lra_lu", "true_peak", "silence_frac", "onset_rate", "music"],
              "rubric": "Loudness/LRA like reference, voice always clear, SFX on every visible event, music arranged per section.",
              "owners": ["project make_audio.py", "audio/mix.py", "audio/music.py", "audio/sfx.py"]},
    "story": {"metrics": ["wps", "speech_start", "hook"],
              "rubric": "Hook in sentence 1 / frame 1, formula beats present, pacing (words/s), payoff lands on the last word.",
              "owners": ["script.txt", "project timing()"]},
}

SCHEMA = """Answer with ONLY this JSON (no prose before/after):
{"area": "<area>", "score": <0-10 number>, "verdict": "<one sentence>",
 "evidence": [{"frame": <int>, "observation": "<what you see/measure>"}],
 "fixes": [{"priority": 1, "owner": "<file from the owners list>", "change": "<concrete change with numbers>", "why": "<metric/frame it fixes>"}]}
Score anchors: 10 = indistinguishable from the reference in this area; 8 = professional, minor nits; 6 = clearly weaker;
4 = obvious problems; 2 = broken. Every claim needs a frame number or a metric. Max 5 fixes, most impactful first."""


def _keyframes(adir: str) -> list[str]:
    return sorted(glob.glob(os.path.join(adir, "keyframes", "*.jpg")))


def build(ours: str, ref: str | None, out: str, gap_path: str | None = None, qa_path: str | None = None) -> str:
    os.makedirs(out, exist_ok=True)
    gap = json.load(open(gap_path, encoding="utf-8")) if gap_path and os.path.exists(gap_path) else {"rows": []}
    qa = json.load(open(qa_path, encoding="utf-8")) if qa_path and os.path.exists(qa_path) else {"checks": []}
    ok, rk = _keyframes(ours), (_keyframes(ref) if ref and os.path.isdir(ref) else [])
    sheets = sorted(glob.glob(os.path.join(ours, "sheets", "*.jpg")))
    for area, spec in AREAS.items():
        d = os.path.join(out, area)
        os.makedirs(d, exist_ok=True)
        rows = [r for r in gap.get("rows", []) if any(m in r["metric"] for m in spec["metrics"])]
        checks = [c for c in qa.get("checks", []) if any(m.split("_")[0] in c["check"] for m in spec["metrics"])] if area in ("sound", "edit") else []
        sbs = None
        if ok and rk:
            from .visuals import side_by_side
            n = min(6, len(ok))
            pairs = [(rk[min(len(rk) - 1, round(i * (len(rk) - 1) / max(1, n - 1)))], ok[min(len(ok) - 1, round(i * (len(ok) - 1) / max(1, n - 1)))]) for i in range(n)]
            sbs = side_by_side(os.path.join(d, "sbs.jpg"), pairs, width=420)
        L = [f"# Review area: {area}", "", f"**Rubric:** {spec['rubric']}", "",
             f"**File owners for fixes:** {', '.join(spec['owners'])}", "",
             "## Measured (ours vs reference)", "", "| metric | reference | ours | gap | status |", "|---|---|---|---|---|"]
        L += [f"| {r['label']} | {r['ref']:.4g} | {r['ours']:.4g} | {r['gap']} | {r['status']} |" for r in rows] or ["| (no reference metrics for this area) | | | | |"]
        if checks:
            L += ["", "## QA checks", ""] + [f"- {c['check']}: {c['status']} ({c['detail']})" for c in checks]
        L += ["", "## Look at", f"- side-by-side: `{sbs}`" if sbs else "- (no reference keyframes given)",
              f"- our contact sheets (frame numbers burned in): {len(sheets)} in `{os.path.join(ours, 'sheets')}`",
              f"- timeline: `{os.path.join(ours, 'timeline.png')}`", "", "## Your answer", "", SCHEMA.replace("<area>", area)]
        open(os.path.join(d, "prompt.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
        open(os.path.join(d, "sheets.txt"), "w", encoding="utf-8").write("\n".join(sheets) + "\n")
    open(os.path.join(out, "README.md"), "w", encoding="utf-8").write(
        "# Judge pack\n\nSpawn one fresh-context reviewer per area folder with its prompt.md (+ sbs.jpg/sheets). Save each JSON answer as "
        "<area>/answer.json, then run `py analyzer/vfa_loop.py collect PACK_DIR`.\n")
    return out


def collect(pack: str) -> dict:
    """Merge <area>/answer.json files -> scores.json + fixes.md grouped by owner."""
    res = {"areas": {}, "fixes": []}
    for area in AREAS:
        p = os.path.join(pack, area, "answer.json")
        if not os.path.exists(p):
            continue
        try:
            a = json.load(open(p, encoding="utf-8"))
        except json.JSONDecodeError:
            txt = open(p, encoding="utf-8").read()
            a = json.loads(txt[txt.find("{"): txt.rfind("}") + 1])
        res["areas"][area] = {"score": a.get("score"), "verdict": a.get("verdict")}
        for fx in a.get("fixes", []):
            res["fixes"].append({"area": area, **fx})
    sc = [v["score"] for v in res["areas"].values() if isinstance(v.get("score"), (int, float))]
    res["mean_score"] = round(sum(sc) / len(sc), 2) if sc else None
    res["min_score"] = min(sc) if sc else None
    json.dump(res, open(os.path.join(pack, "scores.json"), "w", encoding="utf-8"), indent=1)
    by_owner: dict[str, list] = {}
    for fx in sorted(res["fixes"], key=lambda f: f.get("priority", 9)):
        by_owner.setdefault(fx.get("owner", "?"), []).append(fx)
    L = [f"# Fix list (mean score {res['mean_score']}, min {res['min_score']})", ""]
    for owner, fxs in by_owner.items():
        L += [f"## {owner}", ""] + [f"- [{f['area']}] {f.get('change')} -- {f.get('why')}" for f in fxs] + [""]
    open(os.path.join(pack, "fixes.md"), "w", encoding="utf-8").write("\n".join(L))
    return res
