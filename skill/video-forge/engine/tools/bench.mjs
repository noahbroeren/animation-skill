#!/usr/bin/env node
/**
 * Render-speed benchmark: same frame range, several settings, measured wall time + bitrate. Use it before changing
 * render defaults, and claim only measured speedups.
 *
 *   node tools/bench.mjs --project manhole --format short --frames 180-299 [--out DIR] [--variants default,c4,c12,c16,medium,veryfast,crf12]
 *
 * Every variant renders into its own empty folder (no chunk cache), so the numbers are cold renders.
 * Writes <out>/bench.json and bench.md. Close other GPU work first (a parallel render halves the numbers).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const A = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith("--")) { A[process.argv[i].slice(2)] = process.argv[i + 1]; i++; }
const out = path.resolve(A.out ?? path.join(ENGINE, "out", "bench"));
const VARIANTS = {
  default: [], c4: ["--concurrency", "4"], c12: ["--concurrency", "12"], c16: ["--concurrency", "16"],
  medium: ["--x264-preset", "medium"], veryfast: ["--x264-preset", "veryfast"], crf12: ["--crf", "12"], png: ["--image-format", "png"],
  c4fast: ["--concurrency", "4", "--x264-preset", "veryfast"], c4med: ["--concurrency", "4", "--x264-preset", "medium"],
  c6: ["--concurrency", "6"], c2: ["--concurrency", "2"], c4crf12: ["--concurrency", "4", "--crf", "12"],
  old: ["--concurrency", "8", "--x264-preset", "slow", "--crf", "16"], // pre-1.2 defaults
};
const pick = (A.variants ?? "default,c4,c12,c16,medium,veryfast,crf12").split(",");
const rows = [];
// warm-up render first (bundle, shader compile, asset cache), not measured; repeat a variant to check drift
execFileSync("node", [path.join(ENGINE, "tools", "render.mjs"), "--project", A.project, "--format", A.format ?? "short", "--frames", "0-29", "--out", path.join(out, "_warmup")], { stdio: "ignore" });
for (const [i, v] of pick.entries()) {
  const dir = path.join(out, `${i}_${v}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const t = Date.now();
  execFileSync("node", [path.join(ENGINE, "tools", "render.mjs"), "--project", A.project, "--format", A.format ?? "short", "--fps", A.fps ?? "30",
    "--frames", A.frames ?? "180-299", "--out", dir, ...VARIANTS[v]], { stdio: "ignore" });
  const secs = (Date.now() - t) / 1000;
  const rep = JSON.parse(fs.readFileSync(path.join(dir, "render_report.json"), "utf8"));
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=bit_rate,duration", "-of", "json", rep.file]).toString()).format;
  const row = { variant: v, wall_s: +secs.toFixed(1), render_s: +rep.seconds.toFixed(1), fps: +(rep.frames / rep.seconds).toFixed(2), mbps: +(probe.bit_rate / 1e6).toFixed(1), concurrency: rep.concurrency };
  rows.push(row);
  console.log(JSON.stringify(row));
}
const defs = rows.filter((r) => r.variant === "default");
const base = defs.length ? { fps: defs.reduce((a, r) => a + r.fps, 0) / defs.length } : rows[0]; // mean of repeated defaults
const md = ["| variant | concurrency | render s | frames/s | vs default | Mbps |", "|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.variant} | ${r.concurrency} | ${r.render_s} | ${r.fps} | ${(r.fps / base.fps).toFixed(2)}x | ${r.mbps} |`)].join("\n");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "bench.json"), JSON.stringify(rows, null, 1));
fs.writeFileSync(path.join(out, "bench.md"), md + "\n");
console.log("\n" + md);
