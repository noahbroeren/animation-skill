#!/usr/bin/env node
/**
 * Scaffold a new production:  node tools/new-project.mjs <id> [--format short|long] [--look cartoon-ink] [--fps 30]
 * Creates src/projects/<id>/index.tsx (one 3D scene + captions wired to words.json),
 * public/<id>/, registers the project, and prints the next steps.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const a = process.argv.slice(2);
const id = a[0];
if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) { console.error("usage: node tools/new-project.mjs <id: lowercase-kebab> [--format short|long] [--look NAME] [--fps 30]"); process.exit(2); }
const opt = (k, d) => { const i = a.indexOf(`--${k}`); return i > 0 ? a[i + 1] : d; };
const format = opt("format", "short"), look = opt("look", "cartoon-ink"), fps = Number(opt("fps", 30));
const camel = id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const dir = path.join(ROOT, "src", "projects", id);
if (fs.existsSync(dir)) { console.error(`project exists: ${dir}`); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(path.join(ROOT, "public", id), { recursive: true });
fs.writeFileSync(path.join(dir, "words.json"), "[]\n");
fs.writeFileSync(path.join(dir, "index.tsx"), `/** ${id}: scaffolded by new-project.mjs. Replace the placeholder world with the real shots. */
import React from "react";
import { useVideoConfig } from "remotion";
import { cameraRig } from "../../lib/camera";
import { blinkAt, CharacterSpec, idlePose, mergePose, mouthAt } from "../../lib/characters/toon";
import { resolveLook } from "../../lib/look";
import { ProjectDef } from "../../lib/project";
import { CharacterCard } from "../../lib/three/cast";
import { Stage3D } from "../../lib/three/Stage3D";
import { ground, house, lights, skyFor, tree } from "../../lib/three/world";
import { Captions } from "../../lib/two/text";
import WORDS from "./words.json";

const VO_OFFSET = 0.15;
const words = (WORDS as { word: string; start: number; end: number }[]).map((w) => ({ ...w, start: w.start + VO_OFFSET, end: w.end + VO_OFFSET }));
const hero: CharacterSpec = { id: "hero", skin: "#f1c6a2", hair: { color: "#3a2618", style: "short" }, top: { color: "#3f7dd6" }, bottom: { color: "#2d3550" } };

const Shot: React.FC = () => {
  const { fps } = useVideoConfig();
  const rig = cameraRig([
    { f: 0, pos: [5, 2, 9], look: [0, 1.1, 0], fov: 32 },
    { f: 4 * fps, pos: [2.6, 1.6, 5.5], look: [0, 1.0, 0], fov: 30, glide: 3 * fps },
  ], { creep: 0.012 });
  return (
    <Stage3D look={resolveLook("${look}")}
      build={({ scene }) => {
        skyFor(scene, "day");
        const L = lights(scene, "day", { shadowSize: 30 });
        ground(scene, 300);
        const h = house({ seed: "h1" }); h.position.set(-4, 0, -6); scene.add(h);
        const t = tree({ seed: "t1" }); t.position.set(4, 0, -8); scene.add(t);
        const card = new CharacterCard(hero, 1.6, 1400, L.sun); scene.add(card.group);
        return { card };
      }}
      update={(w, f, { fps: FPS }) => {
        const cam = rig.at(f, FPS);
        w.card.setPose(mergePose(idlePose(f, FPS), { blink: blinkAt(f, FPS, "hero"), mouth: mouthAt(f, FPS, words) }));
        w.card.place(0, 0, 0, cam.pos);
        return cam;
      }}
    />
  );
};

export const ${camel}: ProjectDef = {
  id: "${id}", title: "${id}", defaultFormat: "${format}", fps: ${fps},
  // audio: "${id}/master.wav",   // enable after mixing (studio preview plays it)
  scenes: ({ fps }) => [{ id: "main", frames: Math.round(Math.max(6, (words.at(-1)?.end ?? 5) + 1.2) * fps), render: () => <><Shot /><Captions words={words} style="${format.startsWith("long") ? "subtitle" : "pop"}" /></> }],
};
`);
const reg = path.join(ROOT, "src", "projects", "index.ts");
let s = fs.readFileSync(reg, "utf8");
s = s.replace(/(import \{ ProjectDef \} from "..\/lib\/project";\r?\n)/, `$1import { ${camel} } from "./${id}";\n`);
s = s.replace(/export const PROJECTS: ProjectDef\[\] = \[([^\]]*)\];/, (m, list) => `export const PROJECTS: ProjectDef[] = [${list.trim()}${list.trim() ? ", " : ""}${camel}];`);
fs.writeFileSync(reg, s);
console.log(`created ${dir}
next:
  1. write public/${id}/script.txt, make the voice, then:  py ../audio/tts.py align public/${id}/vo.wav --out src/projects/${id}/words.json
  2. stills:   node tools/render.mjs --project ${id} --format ${format} --stills 0,60,120 --scale 0.5
  3. render:   node tools/render.mjs --project ${id} --format ${format} --fps ${fps}
  4. mix:      py ../audio/mix.py public/${id}/audio_plan.json --out public/${id}/master.wav  (then re-run 3 with --audio)
  5. QA:       py ../analyzer/vfa.py qa out/${id}/.../*.mp4 --plan out/${id}/.../timeline.json`);
