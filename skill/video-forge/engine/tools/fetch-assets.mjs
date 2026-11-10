#!/usr/bin/env node
/**
 * Real assets: "if a real one exists, download it" (reference-study rule). Poly Haven (CC0) via its public API.
 *
 *   node tools/fetch-assets.mjs search  --type models|hdris|textures --q barrel
 *   node tools/fetch-assets.mjs get     --type models --id <asset_id> [--res 1k] [--project ID]
 *   node tools/fetch-assets.mjs kenney  --zip <downloaded kenney_*.zip> [--name pack] [--project ID]
 *
 * Kenney (kenney.nl, CC0) has no download API: the user downloads a pack zip in the browser (e.g. "City Kit
 * (Suburban)", "Nature Kit", "Car Kit", "Food Kit"), then `kenney --zip` unpacks it to public/assets/kenney/<pack>/,
 * lists its glTF/GLB models and credits it. Kenney packs share one colormap texture -> use loadModel's `recolor`
 * or `toon` option to match the world palette.
 *
 * Files land in public/assets/polyhaven/<type>/<id>/ (glTF + its textures, or the .hdr), and every download is
 * appended to public/assets/CREDITS.json (asset, author(s), licence CC0, source URL). Load models in a scene with
 * loadModel(ctx, staticFile("assets/polyhaven/models/<id>/<id>_1k.gltf"), { height, toon }) from src/lib/three/assets.ts.
 * Ask the user before downloading large packs; individual 1k assets are typically 1-15 MB.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = { "User-Agent": "video-forge-asset-fetcher/1.1" };
const A = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith("--")) { const k = process.argv[i].slice(2); A[k] = process.argv[i + 1]; i++; } else A._ = process.argv[i];
const cmd = A._;
const type = A.type ?? "models";
const api = (u) => fetch(`https://api.polyhaven.com${u}`, { headers: UA }).then((r) => { if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); });

async function download(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  return fs.statSync(dest).size;
}

if (cmd === "search") {
  const all = await api(`/assets?t=${type}`);
  const q = (A.q ?? "").toLowerCase();
  const hits = Object.entries(all).filter(([id, a]) => !q || id.includes(q) || (a.name ?? "").toLowerCase().includes(q) || (a.tags ?? []).some((t) => t.includes(q)) || Object.keys(a.categories ?? {}).some((c) => c.includes(q)));
  for (const [id, a] of hits.slice(0, 40)) console.log(`${id.padEnd(32)} ${a.name}  [${(a.categories ?? []).join(", ")}]  downloads ${a.download_count}`);
  console.log(`${hits.length} matches (showing ${Math.min(40, hits.length)})`);
} else if (cmd === "get") {
  const id = A.id, res = A.res ?? "1k";
  if (!id) throw new Error("--id required");
  const info = (await api(`/assets?t=${type}`))[id];
  const files = await api(`/files/${id}`);
  const dir = path.join(ENGINE, "public", "assets", "polyhaven", type, id);
  let bytes = 0;
  let main = null;
  if (type === "models") {
    const g = files.gltf?.[res]?.gltf;
    if (!g) throw new Error(`no gltf at ${res}; available: ${Object.keys(files.gltf ?? {})}`);
    main = path.join(dir, path.basename(new URL(g.url).pathname));
    bytes += await download(g.url, main);
    for (const [rel, inc] of Object.entries(g.include ?? {})) bytes += await download(inc.url, path.join(dir, rel));
  } else if (type === "hdris") {
    const h = files.hdri?.[res]?.hdr;
    main = path.join(dir, path.basename(new URL(h.url).pathname));
    bytes += await download(h.url, main);
  } else {
    const blend = files.gltf?.[res]?.gltf ?? null;
    if (!blend) throw new Error("textures: use the per-map files from the API (Diffuse/nor_gl/arm) manually");
  }
  const credPath = path.join(ENGINE, "public", "assets", "CREDITS.json");
  const cred = fs.existsSync(credPath) ? JSON.parse(fs.readFileSync(credPath, "utf8")) : [];
  if (!cred.find((c) => c.id === id)) cred.push({ id, type, name: info?.name, authors: Object.keys(info?.authors ?? {}), license: "CC0", source: `https://polyhaven.com/a/${id}`, project: A.project ?? null });
  fs.writeFileSync(credPath, JSON.stringify(cred, null, 1));
  console.log(`${id}: ${(bytes / 1e6).toFixed(1)} MB -> ${path.relative(path.join(ENGINE, "public"), main).replace(/\\/g, "/")} (CC0, credited)`);
} else if (cmd === "kenney") {
  const zip = A.zip;
  if (!zip || !fs.existsSync(zip)) throw new Error("--zip <path to a kenney_*.zip you downloaded> required");
  const name = A.name ?? path.basename(zip, ".zip").replace(/^kenney_/, "");
  const dir = path.join(ENGINE, "public", "assets", "kenney", name);
  fs.mkdirSync(dir, { recursive: true });
  const { execFileSync } = await import("node:child_process");
  execFileSync("tar", ["-xf", path.resolve(zip), "-C", dir]); // bsdtar (Windows 10+, macOS, most Linux) reads zip
  const models = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(glb|gltf)$/i.test(e.name)) models.push(p); } };
  walk(dir);
  const credPath = path.join(ENGINE, "public", "assets", "CREDITS.json");
  const cred = fs.existsSync(credPath) ? JSON.parse(fs.readFileSync(credPath, "utf8")) : [];
  if (!cred.find((c) => c.id === "kenney:" + name)) cred.push({ id: "kenney:" + name, type: "models", name, authors: ["Kenney (kenney.nl)"], license: "CC0", source: "https://kenney.nl/assets", project: A.project ?? null });
  fs.writeFileSync(credPath, JSON.stringify(cred, null, 1));
  for (const m of models.slice(0, 60)) console.log("  " + path.relative(path.join(ENGINE, "public"), m).split(path.sep).join("/"));
  console.log(`${name}: ${models.length} glTF/GLB models (CC0, credited)${models.length ? "" : " -- this pack has no glTF; export from its FBX/OBJ in Blender"}`);
} else {
  console.log("usage: fetch-assets.mjs search --type models --q crate | get --type models --id <id> [--res 1k] | kenney --zip <file.zip> [--name pack]");
}
