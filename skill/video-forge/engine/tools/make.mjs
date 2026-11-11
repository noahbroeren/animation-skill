#!/usr/bin/env node
/**
 * make: ONE command from a script to a verified video (1.7).
 *
 *   node tools/make.mjs --project ID [--script FILE] [--voice-id ELEVEN_VOICE --yes-voice | --scratch-voice]
 *        [--ref FINGERPRINT] [--style toonworld-explainer] [--from STAGE] [--to STAGE] [--allow-audit] [--format short] [--fps 30]
 *
 * It runs every stage it can, checks the result, and STOPS with one clear instruction when a stage needs a person
 * or the agent (writing the script, the fact check, a paid voice, editing the storyboard). Run it again and it
 * carries on from where it stopped: finished stages are skipped when their output is newer than their input.
 *
 *   stage     needs                         does                                              gate
 *   script    public/ID/script.txt          story.py lint                                     no FAIL in the lint
 *   claims    script                        story.py claims -> public/ID/claims.md            story.py verify (every claim OK + sourced)
 *   voice     script                        public/ID/vo_raw.wav or vo.wav (ElevenLabs API    the file exists
 *                                           with --voice-id --yes-voice, offline scratch
 *                                           voice with --scratch-voice, or made by hand)
 *   words     voice                         tts.py align, tighten.py (pauses capped), words   words.json has the script's words
 *                                           copied into the project, voice calibrated
 *   board     words                         story.py board -> src/projects/ID/index.tsx       the project compiles (tsc)
 *                                           (draft, registered) when none exists
 *   stills    board                         one still per beat -> stills_sheet.jpg            (look at it)
 *   audit     board                         1/8-size full render                              shot_audit.log is empty
 *   produce   all of the above              produce.mjs: native render, sound (score.py for   vfa qa has no FAIL
 *                                           boards), mux, QA, per-key colour table, report
 *
 * After `produce`: thumbnails (tools/thumbs.mjs, every board has them), title variants (story.py titles --auto) and,
 * with `--also long`, the 16:9 version from the same storyboard. `--no-extras` skips the three.
 * `--to stills` is the fast authoring loop; `--from audit` re-renders after edits. Paid steps never run without
 * their flag: --yes-voice prints the credit estimate first (tts.py estimate) and then generates one take.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = path.resolve(ENGINE, "..");
const PY = process.platform === "win32" ? "py" : "python3";
const A = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith("--")) { const k = process.argv[i].slice(2), v = process.argv[i + 1]; A[k] = v && !v.startsWith("--") ? (i++, v) : true; }
if (!A.project || !/^[a-z][a-z0-9-]*$/.test(A.project)) { console.error("usage: node tools/make.mjs --project ID [--script FILE] [--voice-id ID --yes-voice | --scratch-voice] [--ref FP] [--from STAGE] [--to STAGE]"); process.exit(2); }
const id = A.project, fmt = A.format ?? "short", fps = String(A.fps ?? 30);
const pub = path.join(ENGINE, "public", id), src = path.join(ENGINE, "src", "projects", id), out = path.resolve(A.out ?? path.join(ENGINE, "out", id, `${fmt}_${fps}`));
const STAGES = ["script", "claims", "voice", "words", "board", "stills", "audit", "produce"];
const from = STAGES.indexOf(A.from ?? "script"), to = STAGES.indexOf(A.to ?? "produce");
if (from < 0 || to < 0) { console.error(`stages: ${STAGES.join(", ")}`); process.exit(2); }
fs.mkdirSync(pub, { recursive: true }); fs.mkdirSync(out, { recursive: true });
const log = (s, m) => console.log(`[make:${s}] ${m}`);
const run = (cmd, args, o = {}) => spawnSync(cmd, args, { cwd: ENGINE, encoding: "utf8", maxBuffer: 1 << 26, ...o });
const need = (s, msg) => { console.log(`\n[make] STOPPED at "${s}". Next step:\n  ${msg.split("\n").join("\n  ")}\nThen run the same command again.`); process.exit(3); };
const newer = (a, b) => fs.existsSync(a) && (!fs.existsSync(b) || fs.statSync(a).mtimeMs >= fs.statSync(b).mtimeMs);
const P = (f) => path.join(pub, f);
const state = [];
const done = (s, m) => { state.push(`- ${s}: ${m}`); log(s, m); };
const on = (s) => STAGES.indexOf(s) >= from && STAGES.indexOf(s) <= to;
const story = (args) => run(PY, [path.join(SKILL, "story", "story.py"), ...args]);

// ---- script
const script = P("script.txt");
if (A.script) fs.copyFileSync(path.resolve(A.script), script);
if (on("script")) {
  if (!fs.existsSync(script)) need("script", `write the script to ${script}\n(format and formulas: references/story-engine.md; examples: story/examples/*.txt)`);
  const r = story(["lint", script, ...(A.style ? ["--style", A.style] : [])]);
  process.stdout.write(r.stdout);
  if (r.status !== 0) need("script", "fix the FAIL lines of the lint above");
  done("script", (r.stdout.split("\n")[0] || "lint ok").trim());
}
// ---- claims
if (on("claims")) {
  const claims = P("claims.md");
  if (!fs.existsSync(claims)) { story(["claims", script, "--out", claims]); need("claims", `fact-check every row of ${claims} (two independent sources, mark each OK with its source; references/story-engine.md "Fact check")`); }
  const r = story(["verify", claims]);
  if (r.status !== 0) { process.stdout.write(r.stdout); need("claims", `finish the open rows in ${claims}`); }
  done("claims", "fact-check gate PASS");
}
// ---- voice
if (on("voice")) {
  if (!fs.existsSync(P("vo_raw.wav")) && !fs.existsSync(P("vo.wav"))) {
    story(["export", script, "--out", P("vo.txt")]);
    if (A["voice-id"] && A["yes-voice"]) {
      const est = run(PY, [path.join(SKILL, "audio", "tts.py"), "estimate", "--text-file", P("vo.txt")]); process.stdout.write(est.stdout);
      const r = run(PY, [path.join(SKILL, "audio", "tts.py"), "eleven", "--text-file", P("vo.txt"), "--voice-id", A["voice-id"], "--out", P("vo_raw.wav"), "--words-out", P("words_raw.json"), "--yes"]);
      if (r.status !== 0) { process.stdout.write(r.stdout + r.stderr); need("voice", "the ElevenLabs call failed (is ELEVENLABS_API_KEY set?); or save a take as " + P("vo_raw.wav")); }
    } else if (A["scratch-voice"]) run(PY, [path.join(SKILL, "audio", "tts.py"), "say", "--text-file", P("vo.txt"), "--out", P("vo_raw.wav")]);
    else need("voice", `make the narration from ${P("vo.txt")} and save it as ${P("vo_raw.wav")} (48 kHz wav).\nElevenLabs connector (the agent), or --voice-id ID --yes-voice with ELEVENLABS_API_KEY, or --scratch-voice for an offline placeholder.`);
  }
  done("voice", fs.existsSync(P("vo_raw.wav")) ? "vo_raw.wav" : "vo.wav");
}
// ---- words
const words = P("words.json");
if (on("words")) {
  const raw = P("vo_raw.wav");
  if (fs.existsSync(raw) && !newer(P("vo.wav"), raw)) {
    if (!newer(P("words_raw.json"), raw)) { const r = run(PY, [path.join(SKILL, "audio", "tts.py"), "align", raw, "--out", P("words_raw.json"), "--text-file", P("vo.txt")]); if (r.status !== 0) { process.stdout.write(r.stdout + r.stderr); process.exit(1); } }
    const t = run(PY, [path.join(SKILL, "audio", "tighten.py"), raw, "--words", P("words_raw.json"), "--out", P("vo.wav"), "--words-out", words]); process.stdout.write(t.stdout);
    if (t.status !== 0) { process.stdout.write(t.stderr); process.exit(1); }
  } else if (!newer(words, P("vo.wav"))) {
    const r = run(PY, [path.join(SKILL, "audio", "tts.py"), "align", P("vo.wav"), "--out", words, ...(fs.existsSync(P("vo.txt")) ? ["--text-file", P("vo.txt")] : [])]);
    if (r.status !== 0) { process.stdout.write(r.stdout + r.stderr); process.exit(1); }
  }
  fs.mkdirSync(src, { recursive: true });
  fs.copyFileSync(words, path.join(src, "words.json"));
  const n = JSON.parse(fs.readFileSync(words, "utf8")).length;
  done("words", `${n} words -> ${path.join(src, "words.json")}`);
}
// ---- board
const index = path.join(src, "index.tsx");
if (on("board")) {
  if (!fs.existsSync(index)) {
    const r = story(["board", script, "--words", words, "--id", id, "--out", src]); process.stdout.write(r.stdout + r.stderr);
    const reg = path.join(ENGINE, "src", "projects", "index.ts"), camel = id.replace(/[^A-Za-z0-9]/g, "") + "Short";
    let s = fs.readFileSync(reg, "utf8");
    if (!s.includes(`"./${id}"`)) { s = s.replace(/\n\nexport const PROJECTS/, `\nimport { ${camel} } from "./${id}";\n\nexport const PROJECTS`).replace(/\];\s*$/, `, ${camel}];\n`); fs.writeFileSync(reg, s); }
    need("board", `the DRAFT storyboard is in ${index} and the gag table in ${path.join(src, "board.md")}.\nGive every sentence its own picture (custom props, real marks, the cast's wardrobe), see references/board.md,\nthen check the pictures with:  node tools/make.mjs --project ${id} --from board --to stills`);
  }
  const t = run(process.platform === "win32" ? "npx.cmd" : "npx", ["tsc", "--noEmit", "-p", "."], { shell: process.platform === "win32" });
  if (t.status !== 0) { process.stdout.write(t.stdout.slice(0, 4000)); need("board", "fix the TypeScript errors above"); }
  done("board", "project compiles");
}
const render = (extra, o = out) => run("node", [path.join(ENGINE, "tools", "render.mjs"), "--project", id, "--format", fmt, "--fps", fps, "--out", o, ...extra]);
// ---- stills
if (on("stills")) {
  const r = render(["--stills", "cues+10", "--scale", "0.3"], path.join(out, "preview"));
  if (r.status !== 0) { process.stdout.write((r.stdout + r.stderr).slice(-3000)); need("stills", "the board failed to render: fix the error above (unknown mark, actor, prop or word anchor)"); }
  const sheet = run(PY, [path.join(ENGINE, "tools", "sheet.py"), path.join(out, "preview", "stills"), path.join(out, "preview", "stills_sheet.jpg")]);
  const lint = ((r.stdout ?? "") + (r.stderr ?? "")).split(/\r?\n/).filter((l) => l.startsWith("[board lint]"));
  if (lint.length) console.log(lint.join("\n"));
  done("stills", (sheet.stdout.trim() || "stills rendered") + (lint.length ? `; ${lint.length} storyboard remark(s) above` : "; storyboard lint clean"));
}
// ---- audit
if (on("audit")) {
  const ad = path.join(out, "audit");
  const r = render(["--scale", "0.125", "--crf", "34"], ad);
  if (r.status !== 0) { process.stdout.write((r.stdout + r.stderr).slice(-3000)); process.exit(1); }
  const logf = path.join(ad, "shot_audit.log"), lines = fs.existsSync(logf) ? fs.readFileSync(logf, "utf8").split("\n").filter(Boolean) : [];
  if (lines.length && !A["allow-audit"]) { console.log(lines.slice(0, 30).join("\n")); need("audit", `${lines.length} shot problem(s) above (${logf}): a subject is hidden, out of frame or the camera is inside something.\nFix the shot, or pass --allow-audit when each one is intended.`); }
  done("audit", lines.length ? `${lines.length} shot problems allowed` : "shot audit clean");
}
// ---- produce
if (on("produce")) {
  const args = [path.join(ENGINE, "tools", "produce.mjs"), "--project", id, "--format", fmt, "--fps", fps, "--out", out, "--skip-stills", ...(A.ref ? ["--ref", A.ref] : []), ...(A.style ? ["--style", A.style] : []), ...(A.change ? ["--change", A.change] : [])];
  const r = spawnSync("node", args, { cwd: ENGINE, stdio: "inherit" });
  state.push(`- produce: exit ${r.status} (report: ${path.join(out, "report.md")})`);
  // ---- 1.8: the same storyboard also gives the thumbnails, the title variants and (with --also long) the 16:9 version
  if (r.status === 0 && !A["no-extras"]) {
    const th = spawnSync("node", [path.join(ENGINE, "tools", "thumbs.mjs"), "--project", id, "--kind", "all", "--out", path.join(out, "thumbs")], { cwd: ENGINE, stdio: "inherit" });
    state.push(`- thumbnails: exit ${th.status} (${path.join(out, "thumbs", "thumbs_sheet.jpg")}, ranked in thumbs_report.md)`);
    if (fs.existsSync(script)) { const t = story(["titles", script, "--auto", "--out", path.join(out, "titles.md"), ...(A.style ? ["--style", A.style] : [])]); state.push(`- titles: exit ${t.status} (${path.join(out, "titles.md")})`); }
    const also = A.also ? String(A.also).split(",").filter((f) => f && f !== fmt) : [];
    for (const f2 of also) { // the board re-frames every shot for the other aspect; QA runs, the style comparison does not (the reference is 9:16)
      const o2 = path.join(out, f2), r2 = spawnSync("node", [path.join(ENGINE, "tools", "produce.mjs"), "--project", id, "--format", f2, "--fps", fps, "--out", o2, "--skip-stills"], { cwd: ENGINE, stdio: "inherit" });
      state.push(`- ${f2} version: exit ${r2.status} (${o2})`);
    }
  }
  fs.writeFileSync(path.join(out, "make.md"), `# make ${id}\n\n${state.join("\n")}\n`);
  process.exit(r.status ?? 1);
}
fs.writeFileSync(path.join(out, "make.md"), `# make ${id}\n\n${state.join("\n")}\n`);
console.log(`[make] done up to "${STAGES[to]}"`);
