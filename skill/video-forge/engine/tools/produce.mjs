#!/usr/bin/env node
/**
 * produce: one command from project to verified video, and one ITERATION of the improvement loop.
 *
 *   node tools/produce.mjs --project manhole --format short --fps 30
 *        [--ref <reference analysis dir | fingerprint/aggregate json>] [--ref-dir <reference analysis dir with keyframes>]
 *        [--style toonworld-explainer] [--change "what changed since last iteration"] [--skip-stills] [--out DIR]
 *
 * Steps (each logged, each re-usable from cache):
 *   1. look-test stills at story beats (timeline.json cues / scene starts)  -> stills/ + stills_sheet.jpg
 *   2. full native render (chunked, resumable)
 *   3. sound: src/projects/<id>/make_audio.py <timeline.json>  (or public/<id>/audio_plan.json -> audio/mix.py)
 *   4. mux (cached chunks are only concatenated)
 *   5. vfa qa (plan + mixreport + optional reference)  -> qa/qa.md, qa/gap.md
 *   6. judge pack for reviewer agents (references/director-loop.md)  -> judge/<area>/prompt.md
 *   7. iteration log + learning: if a previous iteration exists, record metric moves (vfa_loop learn)
 *   8. report.md: verdict, failing checks, gap score, worst gaps, what to do next
 * Exit code: 0 = QA PASS/WARN, 1 = QA FAIL (blocks delivery).
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = path.resolve(ENGINE, "..");
const PY = process.platform === "win32" ? "py" : "python3";
const A = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith("--")) { const k = process.argv[i].slice(2); const v = process.argv[i + 1]; A[k] = v && !v.startsWith("--") ? (i++, v) : true; }
if (!A.project) { console.error("usage: node tools/produce.mjs --project ID [--format short] [--fps 30] [--ref REF] [--ref-dir DIR] [--style S] [--change TEXT]"); process.exit(2); }
const fmt = A.format ?? "short", fps = Number(A.fps ?? 30);
const out = path.resolve(A.out ?? path.join(ENGINE, "out", A.project, `${fmt}_${fps}`));
fs.mkdirSync(out, { recursive: true });
const log = (m) => console.log(`[produce] ${m}`);
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: ENGINE, encoding: "utf8", maxBuffer: 1 << 26, ...opts });
  if (r.status !== 0 && !opts.allowFail) { console.error(r.stdout?.slice(-2000), r.stderr?.slice(-2000)); throw new Error(`${cmd} ${args[0]} failed (${r.status})`); }
  return r;
};
const render = (extra) => run("node", [path.join(ENGINE, "tools", "render.mjs"), "--project", A.project, "--format", fmt, "--fps", String(fps), "--out", out, ...extra]);
const t0 = Date.now();

// 1. stills at story beats
const tl = () => JSON.parse(fs.readFileSync(path.join(out, "timeline.json"), "utf8"));
if (!A["skip-stills"]) {
  render(["--stills", "0", "--scale", "0.5"]); // writes timeline.json
  const T = tl();
  const beats = new Set([0, Math.round(T.durationInFrames * 0.5), T.durationInFrames - 1]);
  for (const v of Object.values(T.cues ?? {})) beats.add(Math.min(T.durationInFrames - 1, Number(v) + 4));
  for (const s of T.scenes ?? []) beats.add(s.start + Math.round(Math.min(s.frames - 1, 0.5 * s.frames)));
  const frames = [...beats].sort((a, b) => a - b).filter((f, i, arr) => i === 0 || f - arr[i - 1] > 8).slice(0, 16);
  render(["--stills", frames.join(","), "--scale", "0.5"]);
  const ims = frames.map((f) => path.join(out, "stills", `f${String(f).padStart(6, "0")}.png`)).filter(fs.existsSync);
  if (ims.length) {
    const cols = Math.min(8, ims.length), rows = Math.ceil(ims.length / cols);
    const inputs = ims.flatMap((p) => ["-i", p]);
    const pad = Array.from({ length: cols * rows - ims.length }, () => ["-i", ims[0]]).flat();
    const n = cols * rows;
    const filt = Array.from({ length: n }, (_, i) => `[${i}]scale=-1:420[s${i}]`).join(";") + ";" +
      Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => `[s${r * cols + c}]`).join("") + `hstack=${cols}[r${r}]`).join(";") +
      (rows > 1 ? ";" + Array.from({ length: rows }, (_, r) => `[r${r}]`).join("") + `vstack=${rows}[o]` : "");
    run("ffmpeg", ["-v", "error", "-y", ...inputs, ...pad, "-filter_complex", filt, "-map", rows > 1 ? "[o]" : "[r0]", "-q:v", "3", path.join(out, "stills_sheet.jpg")], { allowFail: true });
    log(`stills: ${ims.length} beats -> ${path.join(out, "stills_sheet.jpg")}`);
  }
}

// 2. full render
render([]);
const T = tl();
const dur = T.durationInFrames / T.fps;
log(`rendered ${T.width}x${T.height} @ ${T.fps} fps, ${dur.toFixed(2)} s`);

// 3. sound
const projAudio = path.join(ENGINE, "src", "projects", A.project, "make_audio.py");
const plan = path.join(ENGINE, "public", A.project, "audio_plan.json");
const master = path.join(ENGINE, "public", A.project, "master.wav");
if (fs.existsSync(projAudio)) { run(PY, [projAudio, path.join(out, "timeline.json")]); log("sound: make_audio.py"); }
else if (T.sounds) { // a storyboard project (lib/board.tsx) carries its own cue sheet: real samples first, synthesis as the fallback
  const r = run(PY, [path.join(SKILL, "audio", "score.py"), path.join(out, "timeline.json"), "--project-dir", path.join(ENGINE, "public", A.project)]); log("sound: " + (r.stdout.trim().split("\n").pop() ?? "score.py")); }
else if (fs.existsSync(plan)) { run(PY, [path.join(SKILL, "audio", "mix.py"), plan, "--out", master]); log("sound: audio_plan.json"); }
else log("sound: none found (video will be silent)");

// 4. mux
if (fs.existsSync(master)) render(["--audio", master]);
const files = fs.readdirSync(out).filter((f) => f.startsWith(`${A.project}_`) && f.endsWith(".mp4"));
const final = files.length ? path.join(out, files[0]) : path.join(out, "video.mp4");

// 5. QA
const qaDir = path.join(out, "qa");
const prevGap = path.join(out, "qa", "gap.json");
const keepPrev = fs.existsSync(prevGap) ? path.join(out, `gap_prev_${Date.now()}.json`) : null;
if (keepPrev) fs.copyFileSync(prevGap, keepPrev);
const qaArgs = [path.join(SKILL, "analyzer", "vfa.py"), "qa", final, "--fps", String(T.fps), "--duration", dur.toFixed(3), "--plan", path.join(out, "timeline.json"), "--out", qaDir,
  "--min-class", T.width >= 3840 || T.height >= 3840 ? "4k" : "2k"];
const mixrep = master.replace(/\.wav$/, "_mixreport.json");
if (fs.existsSync(mixrep)) qaArgs.push("--mixreport", mixrep);
if (A.ref) qaArgs.push("--ref", path.resolve(A.ref));
const qa = run(PY, qaArgs, { allowFail: true });
const qaJson = JSON.parse(fs.readFileSync(path.join(qaDir, "qa.json"), "utf8"));
let gapRows = [], matchScore = null;
if (A.ref) {
  run(PY, [path.join(SKILL, "analyzer", "vfa.py"), "compare", path.resolve(A.ref), path.join(qaDir, "analysis"), "--out", path.join(qaDir, "gap.md")], { allowFail: true });
  if (fs.existsSync(prevGap)) { const g = JSON.parse(fs.readFileSync(prevGap, "utf8")); gapRows = g.rows; matchScore = g.match_score; }
}

// 5b. colour per lighting key (the video-wide medians hide what each section does)
let keygap = "";
if (A.ref) { const k = run(PY, [path.join(SKILL, "analyzer", "vfa.py"), "keygap", path.join(qaDir, "analysis"), "--plan", path.join(out, "timeline.json"), "--ref", path.resolve(A.ref)], { allowFail: true }); keygap = k.stdout ?? ""; fs.writeFileSync(path.join(qaDir, "keygap.md"), keygap); }

// 6. judge pack
const pack = path.join(out, "judge");
run(PY, [path.join(SKILL, "analyzer", "vfa_loop.py"), "judgepack", "--ours", path.join(qaDir, "analysis"), "--out", pack,
  ...(A["ref-dir"] ? ["--ref", path.resolve(A["ref-dir"])] : []), ...(fs.existsSync(prevGap) ? ["--gap", prevGap] : []), "--qa", path.join(qaDir, "qa.json")], { allowFail: true });

// 7. iteration log + learning
const itPath = path.join(out, "iterations.json");
const its = fs.existsSync(itPath) ? JSON.parse(fs.readFileSync(itPath, "utf8")) : [];
its.push({ n: its.length + 1, at: new Date().toISOString(), verdict: qaJson.verdict, match_score: matchScore, change: A.change ?? "", file: final });
fs.writeFileSync(itPath, JSON.stringify(its, null, 1));
if (A.style && keepPrev && fs.existsSync(prevGap)) {
  run(PY, [path.join(SKILL, "analyzer", "vfa_loop.py"), "learn", "--style", A.style, "--project", A.project, "--before", keepPrev, "--after", prevGap,
    "--change", A.change ?? `iteration ${its.length}`], { allowFail: true });
  log(`learning recorded for style ${A.style}`);
}

// 8. report
const fails = qaJson.checks.filter((c) => c.status === "FAIL"), warns = qaJson.checks.filter((c) => c.status === "WARN");
const worst = gapRows.filter((r) => r.status !== "OK").slice(0, 8);
const R = [`# Produce report: ${A.project} (iteration ${its.length})`, "",
  `- file: \`${final}\` (${T.width}x${T.height}, ${T.fps} fps, ${dur.toFixed(2)} s, native)`,
  `- QA verdict: **${qaJson.verdict}** (${fails.length} FAIL, ${warns.length} WARN)` + (matchScore !== null ? `; reference match ${matchScore}` : ""),
  `- time: ${((Date.now() - t0) / 1000).toFixed(0)} s`, "",
  ...(fails.length ? ["## Blocking (FAIL)", ...fails.map((c) => `- ${c.check}: ${c.detail}`), ""] : []),
  ...(warns.length ? ["## Warnings", ...warns.map((c) => `- ${c.check}: ${c.detail}`), ""] : []),
  ...(worst.length ? ["## Biggest gaps vs reference", ...worst.map((r) => `- ${r.label}: ref ${r.ref.toFixed(3)} / ours ${r.ours.toFixed(3)} (gap ${r.gap}) -> ${r.advice}`), ""] : []),
  ...(keygap ? ["## Colour per lighting key", keygap.split("\n").filter((l) => l.startsWith("|")).join("\n"), ""] : []),
  "## Next (director loop, references/director-loop.md)",
  `1. Look at \`${path.join(out, "stills_sheet.jpg")}\` and the QA contact sheets.`,
  `2. Spawn one reviewer agent per folder in \`${pack}\` (prompt.md); save answers as <area>/answer.json; run \`py analyzer/vfa_loop.py collect ${pack}\`.`,
  "3. Route fixes by owner (fixes.md) to fixer agents with file ownership; merge; re-run produce with --change \"...\" --style <style>.",
  "4. Stop when QA has no FAIL, judge min score >= 8 (or target), or after 4 iterations with residuals listed."];
fs.writeFileSync(path.join(out, "report.md"), R.join("\n") + "\n");
console.log(R.join("\n"));
process.exit(qaJson.verdict === "FAIL" ? 1 : 0);
