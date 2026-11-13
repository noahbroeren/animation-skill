#!/usr/bin/env node
/**
 * video-forge render orchestrator.
 *
 *   node tools/render.mjs --project demo-short --format short --fps 30 [--out DIR]
 *        [--chunk 20] [--concurrency 4] [--codec h264|h265|prores] [--crf 14] [--x264-preset medium]
 *        [--image-format jpeg|png] [--frames 0-299] [--audio master.wav] [--scale 1] [--clean]
 *   node tools/render.mjs --project X --stills 0,45,120 [--scale 0.5]
 *   node tools/render.mjs --project X --stills cues [--scale 0.5]   # one still per named cue (story beats) + index.json
 *   node tools/render.mjs --project X --stills cues+10              # the same, 10 frames after each cue (past the cut / pop-in)
 * - Shot audit: `[video-forge][shot-audit]` browser warnings (Stage3D `audit`) are printed and collected in
 *   <out>/shot_audit.log (one line per problem, deduplicated).
 *
 * - Native resolution: frames are rendered at the format's size (no upscaling). --scale < 1
 *   is for PREVIEWS only and the report says so.
 * - Long-form: the frame range is split into chunks (default 20 s). Finished chunks are
 *   skipped on re-run if their settings hash matches => resumable, crash-safe renders.
 * - Video is rendered muted; mastered audio (audio/mix.py) is muxed at the end.
 * - Writes timeline.json (edit plan: scene starts + planned cuts) for `vfa qa --plan`.
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

function args() {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith("--")) continue;
    const k = a[i].slice(2), v = a[i + 1] && !a[i + 1].startsWith("--") ? a[++i] : true;
    o[k] = v;
  }
  return o;
}
const A = args();
if (!A.project) { console.error("usage: node tools/render.mjs --project <id> [--format short|long|short4k|long4k] [--fps 30|60]"); process.exit(2); }

const fps = Number(A.fps ?? 30);
const format = A.format ?? undefined;
const out = path.resolve(A.out ?? path.join(ROOT, "out", A.project, `${format ?? "default"}_${fps}`));
fs.mkdirSync(out, { recursive: true });
const codec = A.codec ?? "h264";
const crf = Number(A.crf ?? (codec === "h265" ? 16 : Number(A.fps ?? 30) >= 50 ? 12 : 14)); // 14: ~YouTube-recommended upload bitrate for 1440p (crf 16 gave ~10 Mbps); 60 fps needs 12 (crf 14 measured 16 Mbps against the recommended ~24)
const imageFormat = A["image-format"] ?? "jpeg";
const scale = Number(A.scale ?? 1);
// one GPU: more Chromium tabs contend for WebGL. tools/bench.mjs on a Ryzen 9800X3D + RTX 5070: 4 tabs 1.2-1.4x faster than 8
const conc = Number(A.concurrency ?? Math.max(2, Math.min(4, Math.floor(os.cpus().length / 4))));

const t0 = Date.now();
console.log(`[render] bundling ${ROOT}/src ...`);
const serveUrl = await bundle({ entryPoint: path.join(ROOT, "src", "index.ts"), publicDir: path.join(ROOT, "public"), onProgress: () => {} });
const inputProps = { project: A.project, fps, preview: false, ...(format ? { format } : {}), ...(A.clean ? { clean: true } : {}) }; // --clean: no burned-in captions (thumbnails, covers)
const chromiumOptions = { gl: A.gl ?? "angle", enableMultiProcessOnLinux: true };
const comp = await selectComposition({ serveUrl, id: A.project, inputProps, chromiumOptions });
const planFile = path.join(out, "timeline.json");
fs.writeFileSync(planFile, JSON.stringify({ project: A.project, width: comp.width, height: comp.height, fps: comp.fps, durationInFrames: comp.durationInFrames, ...comp.props.plan }, null, 1));
for (const l of comp.props.plan?.lint ?? []) console.log(`[board lint] ${l}`);
console.log(`[render] ${comp.id}: ${comp.width}x${comp.height} @ ${comp.fps} fps, ${comp.durationInFrames} frames (${(comp.durationInFrames / comp.fps).toFixed(2)} s), scale ${scale}${scale < 1 ? " (PREVIEW, not native)" : " (native)"}`);

const auditLog = path.join(out, "shot_audit.log"), auditSeen = new Set();
if (fs.existsSync(auditLog)) fs.unlinkSync(auditLog);
const onBrowserLog = (l) => {
  if (l.text.includes("[shot-audit]")) { // dedupe per problem (frame stripped): the first frame it appears on is logged
    const key = l.text.replace(/f=\d+ /, "").replace(/\(.*?\)|-?[\d.]+( m| %)?/g, "#"); // one line per subject + problem type
    if (!auditSeen.has(key)) { auditSeen.add(key); fs.appendFileSync(auditLog, l.text.replace("[video-forge][shot-audit] ", "") + "\n"); }
    return;
  }
  if (l.text.includes("[video-forge]") || l.type === "error") console.log("  [browser]", l.text.slice(0, 300));
};

if (A.stills) {
  const cueMap = comp.props.plan?.cues ?? {};
  const cm = /^cues(?:\+(\d+))?$/.exec(String(A.stills)), plus = cm?.[1] ? Number(cm[1]) : 0;
  const named = cm ? Object.entries(cueMap).filter(([, v]) => typeof v === "number" && v < comp.durationInFrames).map(([k, v]) => [k, Math.min(comp.durationInFrames - 1, v + plus)]).sort((a, b) => a[1] - b[1]) : null;
  const frames = named ? [...new Set(named.map(([, v]) => v))] : String(A.stills).split(",").map(Number);
  const dir = path.join(out, "stills");
  fs.mkdirSync(dir, { recursive: true });
  if (named) fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(Object.fromEntries(named), null, 1));
  for (const f of frames) {
    const p = path.join(dir, `f${String(f).padStart(6, "0")}.png`);
    await renderStill({ composition: comp, serveUrl, output: p, frame: f, inputProps, scale, chromiumOptions, onBrowserLog, imageFormat: "png" });
    console.log(`[still] ${p}`);
  }
  if (auditSeen.size) console.log(`[audit] ${auditSeen.size} shot problem(s) -> ${auditLog}`);
  cleanup();
  process.exit(0);
}

let [fa, fb] = A.frames ? String(A.frames).split("-").map(Number) : [0, comp.durationInFrames - 1];
fb = Math.min(fb, comp.durationInFrames - 1);
const chunkF = Math.max(30, Math.round(Number(A.chunk ?? 20) * comp.fps));
const chunks = [];
for (let s = fa; s <= fb; s += chunkF) chunks.push([s, Math.min(fb, s + chunkF - 1)]);
const ext = codec === "prores" ? "mov" : "mp4";
const srcHash = hashDir(path.join(ROOT, "src"));
const settings = { codec, crf, x264: A["x264-preset"] ?? "medium", imageFormat, scale, w: comp.width, h: comp.height, fps: comp.fps, srcHash, props: inputProps };
const chunkDir = path.join(out, "chunks");
fs.mkdirSync(chunkDir, { recursive: true });
const done = [];
let rendered = 0;
for (const [s, e] of chunks) {
  const key = createHash("sha1").update(JSON.stringify({ ...settings, s, e })).digest("hex").slice(0, 12);
  const file = path.join(chunkDir, `c_${String(s).padStart(6, "0")}_${String(e).padStart(6, "0")}_${key}.${ext}`);
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) { console.log(`[chunk] ${s}-${e} cached`); done.push(file); continue; }
  const ts = Date.now();
  await renderMedia({
    composition: comp, serveUrl, codec, outputLocation: file + ".part." + ext, inputProps, frameRange: [s, e], muted: true,
    crf: codec === "prores" ? undefined : crf, proResProfile: codec === "prores" ? "hq" : undefined,
    x264Preset: codec === "h264" ? (A["x264-preset"] ?? "medium") : undefined, imageFormat, jpegQuality: imageFormat === "jpeg" ? 95 : undefined,
    pixelFormat: codec === "prores" ? "yuv422p10le" : "yuv420p", colorSpace: "bt709", scale, concurrency: conc, chromiumOptions, onBrowserLog,
    onProgress: ({ progress }) => process.stdout.write(`\r[chunk] ${s}-${e} ${(progress * 100).toFixed(0)}%   `),
  });
  fs.renameSync(file + ".part." + ext, file);
  const secs = (Date.now() - ts) / 1000;
  rendered += e - s + 1;
  console.log(`\n[chunk] ${s}-${e} done in ${secs.toFixed(1)}s (${((e - s + 1) / secs).toFixed(1)} fps)`);
  done.push(file);
}

const list = path.join(chunkDir, "concat.txt");
fs.writeFileSync(list, done.map((f) => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
const video = path.join(out, `video.${ext}`);
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", video], { stdio: "inherit" });
let final = video;
if (A.audio) {
  final = path.join(out, `${A.project}_${comp.width}x${comp.height}_${comp.fps}fps.${ext}`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", video, "-i", path.resolve(A.audio), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
    "-c:a", codec === "prores" ? "pcm_s24le" : "aac", ...(codec === "prores" ? [] : ["-b:a", "320k"]), "-shortest", "-movflags", "+faststart", final], { stdio: "inherit" });
  fs.rmSync(video, { force: true }); // silent intermediate no longer needed
}
if (A.clean) fs.rmSync(chunkDir, { recursive: true, force: true }); // chunk cache (keep it to resume/iterate)
const report = {
  file: final, timeline: planFile, width: comp.width * scale, height: comp.height * scale, fps: comp.fps, frames: fb - fa + 1,
  native: scale >= 1, resolution_note: scale >= 1 ? "Rendered natively at delivery resolution (no upscaling)." : `PREVIEW at scale ${scale}: NOT a deliverable.`,
  codec, crf, imageFormat, concurrency: conc, chunks: done.length, framesRenderedThisRun: rendered, seconds: (Date.now() - t0) / 1000,
};
fs.writeFileSync(path.join(out, "render_report.json"), JSON.stringify(report, null, 1));
console.log(`[render] -> ${final}\n[render] total ${report.seconds.toFixed(1)}s`);
cleanup();

function cleanup() {
  // Remotion copies bundles into the OS temp dir; long sessions can pile up many GB. Remove ours.
  try { if (serveUrl && serveUrl.startsWith(os.tmpdir())) fs.rmSync(serveUrl, { recursive: true, force: true }); } catch {}
}
function hashDir(d) {
  const h = createHash("sha1");
  const walk = (p) => { for (const f of fs.readdirSync(p).sort()) { const q = path.join(p, f); const st = fs.statSync(q); if (st.isDirectory()) walk(q); else h.update(f + st.size + st.mtimeMs); } };
  walk(d);
  return h.digest("hex").slice(0, 10);
}
