#!/usr/bin/env node
/**
 * video-forge doctor: checks every dependency and prints exact fixes.
 *   node scripts/doctor.mjs [--gpu]     (--gpu also launches headless Chrome to report the WebGL renderer)
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = path.join(SKILL, "engine");
const isWin = process.platform === "win32";
const PY = isWin ? "py" : "python3";
let bad = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const fail = (m, fix) => { bad++; console.log(`  FAIL  ${m}\n        fix: ${fix}`); };
const warn = (m, fix) => console.log(`  WARN  ${m}${fix ? `\n        tip: ${fix}` : ""}`);
const ver = (cmd, args = ["-version"]) => { const r = spawnSync(cmd, args, { encoding: "utf8", shell: isWin }); return r.status === 0 ? (r.stdout || r.stderr).split("\n")[0].trim() : null; };

console.log("video-forge doctor\n");
const nodeMajor = Number(process.versions.node.split(".")[0]);
nodeMajor >= 18 ? ok(`node ${process.versions.node}`) : fail(`node ${process.versions.node}`, "install Node.js >= 18 (https://nodejs.org)");
const ff = ver("ffmpeg"); ff ? ok(ff.slice(0, 60)) : fail("ffmpeg missing", isWin ? "winget install Gyan.FFmpeg" : "brew install ffmpeg / apt install ffmpeg");
const fp = ver("ffprobe"); fp ? ok("ffprobe") : fail("ffprobe missing", "comes with ffmpeg");
if (ff) {
  const filters = spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" }).stdout || "";
  for (const f of ["ebur128", "loudnorm", "blackdetect", "freezedetect"]) filters.includes(` ${f} `) ? ok(`ffmpeg filter ${f}`) : fail(`ffmpeg filter ${f} missing`, "install a full ffmpeg build");
}
const yt = ver("yt-dlp", ["--version"]); yt ? ok(`yt-dlp ${yt}`) : warn("yt-dlp missing (needed only for URLs/channels)", "pip install -U yt-dlp");
const py = ver(PY, ["--version"]); py ? ok(py) : fail("python missing", "install Python >= 3.10");
if (py) {
  for (const m of ["numpy", "cv2", "scipy", "PIL"]) {
    const r = spawnSync(PY, ["-c", `import ${m}`], { encoding: "utf8" });
    r.status === 0 ? ok(`python: ${m}`) : fail(`python: ${m} missing`, `${PY} -m pip install -r "${path.join(SKILL, "analyzer", "requirements.txt")}"`);
  }
  const r = spawnSync(PY, ["-c", "import faster_whisper"], { encoding: "utf8" });
  r.status === 0 ? ok("python: faster_whisper (speech transcription/alignment)") : warn("faster_whisper missing: no word timings/transcripts", `${PY} -m pip install faster-whisper`);
}
fs.existsSync(path.join(ENGINE, "node_modules", "remotion")) ? ok("engine node_modules installed") : fail("engine dependencies not installed", `cd "${ENGINE}" && npm install`);

if (process.argv.includes("--gpu") && fs.existsSync(path.join(ENGINE, "node_modules", "remotion"))) {
  console.log("\n  probing WebGL renderer via a still render (first run downloads Chrome Headless Shell)...");
  try {
    const out = execFileSync("node", [path.join(ENGINE, "tools", "render.mjs"), "--project", "smoke", "--format", "preview-short", "--stills", "0", "--out", path.join(ENGINE, "out", "_doctor")], { cwd: ENGINE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const line = out.split("\n").find((l) => l.includes("WebGL renderer"));
    if (!line) warn("could not read the WebGL renderer line");
    else if (/SwiftShader|llvmpipe|Software/i.test(line)) warn(line.trim(), "software WebGL: renders work but are slow; try --gl angle|egl|vulkan in render.mjs");
    else ok(line.replace(/.*WebGL renderer:/, "GPU WebGL:").trim());
  } catch (e) { fail("test render failed", String(e.stderr || e).slice(0, 400)); }
}
console.log(bad ? `\n${bad} problem(s) found.` : "\nAll required dependencies present.");
process.exit(bad ? 1 : 0);
