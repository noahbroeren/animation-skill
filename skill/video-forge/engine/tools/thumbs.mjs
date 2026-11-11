#!/usr/bin/env node
/**
 * Thumbnail variants rendered from the 3D world + feed-size checks.
 *
 *   node tools/thumbs.mjs --project manhole [--kind long|short|hires|all] [--variants a,b] --out DIR
 *        [--fps 30] [--gl angle] [--no-check] [--quality 92]
 *
 * - Renders composition `<project>-thumb` (src/lib/thumbs.tsx) for every variant the project declares in
 *   `ProjectDef.thumbnails` and every requested kind: long 1280x720, short 1080x1920, hires 2560x1440.
 *   JPG; quality is lowered automatically until the file is < 2 MB (YouTube's mobile upload cap).
 * - Deterministic: frozen project frame, no randomness -> identical files on re-run.
 * - Then runs analyzer/vfa/thumbcheck.py (feed-size OCR, contrast, focal point, timestamp zone, pop, diversity)
 *   and writes DIR/thumbs_sheet.jpg (each variant at full size + 360x202 / 168x94 / ~100x178 feed sizes on light and
 *   dark YouTube-like backgrounds), DIR/thumbs_report.json and DIR/thumbs_report.md (ranked).
 */
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const CHECKER = path.resolve(ROOT, "..", "analyzer", "vfa", "thumbcheck.py");
const MAX_BYTES = 2 * 1024 * 1024;

const A = (() => {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith("--")) continue;
    const k = a[i].slice(2), v = a[i + 1] && !a[i + 1].startsWith("--") ? a[++i] : true;
    o[k] = v;
  }
  return o;
})();
if (!A.project) { console.error("usage: node tools/thumbs.mjs --project <id> [--kind long|short|hires|all] [--variants a,b] --out DIR"); process.exit(2); }
const kinds = !A.kind || A.kind === "all" ? ["long", "short", "hires"] : String(A.kind).split(",");
const out = path.resolve(A.out ?? path.join(ROOT, "out", A.project, "thumbs"));
fs.mkdirSync(out, { recursive: true });
const fps = Number(A.fps ?? 30);
const chromiumOptions = { gl: A.gl ?? "angle", enableMultiProcessOnLinux: true };
const t0 = Date.now();

console.log(`[thumbs] bundling ${ROOT}/src ...`);
const serveUrl = await bundle({ entryPoint: path.join(ROOT, "src", "index.ts"), publicDir: path.join(ROOT, "public"), onProgress: () => {} });
const browser = await openBrowser("chrome", { chromiumOptions });
const onBrowserLog = (l) => { if (l.type === "error") console.log("  [browser]", l.text.slice(0, 300)); };
const id = `${A.project}-thumb`;
const meta = [];
try {
  for (const kind of kinds) {
    const probe = await selectComposition({ serveUrl, id, inputProps: { project: A.project, variant: "", kind, fps }, chromiumOptions, puppeteerInstance: browser });
    let variants = probe.props.variants ?? [];
    if (!variants.length) throw new Error(`project ${A.project} declares no thumbnails (ProjectDef.thumbnails)`);
    if (A.variants) { const want = String(A.variants).split(","); variants = variants.filter((v) => want.includes(v.id)); }
    fs.mkdirSync(path.join(out, kind), { recursive: true });
    for (const v of variants) {
      const inputProps = { project: A.project, variant: v.id, kind, fps };
      const comp = await selectComposition({ serveUrl, id, inputProps, chromiumOptions, puppeteerInstance: browser });
      const file = path.join(out, kind, `${v.id}.jpg`);
      let q = Number(A.quality ?? 92);
      const ts = Date.now();
      for (;;) {
        await renderStill({ composition: comp, serveUrl, output: file, frame: 0, inputProps, imageFormat: "jpeg", jpegQuality: q, chromiumOptions, puppeteerInstance: browser, onBrowserLog, overwrite: true });
        if (fs.statSync(file).size < MAX_BYTES || q <= 60) break;
        q -= 8;
      }
      console.log(`[thumbs] ${kind.padEnd(5)} ${v.id.padEnd(14)} ${comp.width}x${comp.height} q${q} ${(fs.statSync(file).size / 1024).toFixed(0)} KB  ${((Date.now() - ts) / 1000).toFixed(1)}s`);
      meta.push({ path: file, variant: v.id, kind, text: v.text, note: v.note, frame: v.frame });
    }
  }
} finally {
  await browser.close({ silent: true }).catch(() => {});
  try { if (serveUrl.startsWith(os.tmpdir())) fs.rmSync(serveUrl, { recursive: true, force: true }); } catch {}
}
const metaFile = path.join(out, "thumbs_meta.json");
fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));

if (!A["no-check"]) {
  const reportJson = path.join(out, "thumbs_report.json");
  const sheet = path.join(out, "thumbs_sheet.jpg");
  const py = process.platform === "win32" ? "py" : "python3";
  execFileSync(py, [CHECKER, "--meta", metaFile, "--out", reportJson, "--sheet", sheet], { stdio: "inherit" });
  const rep = JSON.parse(fs.readFileSync(reportJson, "utf8"));
  fs.writeFileSync(path.join(out, "thumbs_report.md"), reportMd(rep, meta));
  console.log(`[thumbs] sheet  -> ${sheet}\n[thumbs] report -> ${path.join(out, "thumbs_report.md")}`);
}
console.log(`[thumbs] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

function reportMd(rep, meta) {
  const L = [`# Thumbnails: ${A.project}`, "", `Rendered ${meta.length} images (${kinds.join(", ")}). Score 0-100 from analyzer/vfa/thumbcheck.py`,
    `(weights: ${Object.entries(rep.weights).map(([k, v]) => `${k} ${v}`).join(", ")}; Shorts drop the timestamp check and renormalise).`, ""];
  for (const kind of kinds) {
    const rs = rep.results.filter((r) => r.kind === kind).sort((a, b) => b.score - a.score);
    if (!rs.length) continue;
    L.push(`## ${kind} (ranked)`, "", "| # | variant | score | words read at feed size | text h % | contrast | focal conc. | subject % | max sim. |", "|---|---|---|---|---|---|---|---|---|");
    rs.forEach((r, i) => {
      const feeds = Object.entries(r.feed).map(([k, f]) => `${k}: ${f.survived.length}/${r.word_count}`).join(", ");
      L.push(`| ${i + 1} | **${r.variant}** | ${r.score.toFixed(1)} | ${feeds} | ${r.text_height_pct ? r.text_height_pct.min : "-"} | ${r.contrast ? r.contrast.min_ratio + ":1" : "-"} | ${r.focal.concentration} | ${r.focal.subject_pct} | ${r.max_similarity ?? "-"} (${r.most_similar ?? ""}) |`);
    });
    L.push("");
    for (const r of rs) {
      L.push(`- **${r.variant}** (${r.score.toFixed(1)}): ${r.note || ""}  `, `  text "${r.intended || ""}"; ${path.relative(out, r.path).replace(/\\/g, "/")}`);
      for (const f of r.fixes) L.push(`  - fix: ${f}`);
    }
    L.push("");
  }
  return L.join("\n");
}
