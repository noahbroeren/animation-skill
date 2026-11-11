/**
 * World kit: procedural, deterministic building blocks for 3D scenes.
 * Rule from the reference studies: "if a real asset exists, use it" -- load CC0
 * models/HDRIs (Poly Haven, Kenney, NASA imagery) with loadGLTF()/loadTexture()
 * when you have them; these procedural pieces are the always-available baseline.
 */
import * as THREE from "three";
import { rng } from "../time";
import { NOINK } from "./post";
import { canvasTexture, paint, vary } from "./textures";

export type LightPreset = "day" | "golden" | "night" | "overcast" | "studio" | "space"
  | "dusk" | "rain" | "storm" | "fog" | "morning" | "sunsetBack" | "dawn" | "nightMoon" | "nightPractical" | "neon" | "interiorWindow" | "interiorWarm" | "spotlight";

const LIGHTS: Record<LightPreset, { sun: string; sunI: number; sky: string; ground: string; hemiI: number; amb: number; dir: [number, number, number]; fog: string; skyTop: string; skyHorizon: string; fogNF?: [number, number] }> = {
  // warm key + cool sky fill => warm highlights, cool/violet shadows (the measured cartoon look)
  day: { sun: "#fff1d6", sunI: 2.6, sky: "#9cc8ff", ground: "#7a6a4a", hemiI: 1.1, amb: 0.15, dir: [-0.55, 0.8, 0.35], fog: "#bfe0ff", skyTop: "#3f8ff0", skyHorizon: "#bfe6ff" },
  golden: { sun: "#ffbd7a", sunI: 2.8, sky: "#8f86d6", ground: "#7a5236", hemiI: 0.9, amb: 0.12, dir: [-0.8, 0.32, 0.4], fog: "#ffc89a", skyTop: "#5a63c9", skyHorizon: "#ffb98a" },
  night: { sun: "#9bb4ff", sunI: 0.9, sky: "#2a3570", ground: "#151a30", hemiI: 0.7, amb: 0.1, dir: [0.4, 0.7, 0.2], fog: "#1b2448", skyTop: "#0b1030", skyHorizon: "#2c3d7a" },
  overcast: { sun: "#f4f6fa", sunI: 1.2, sky: "#c9d3df", ground: "#7d7a72", hemiI: 1.5, amb: 0.2, dir: [-0.3, 0.9, 0.2], fog: "#d4dbe3", skyTop: "#a7b3c2", skyHorizon: "#dfe5ec" },
  studio: { sun: "#ffffff", sunI: 2.2, sky: "#f0f0ff", ground: "#c9c0b0", hemiI: 1.0, amb: 0.25, dir: [-0.5, 0.85, 0.6], fog: "#ece6dc", skyTop: "#ece6dc", skyHorizon: "#ece6dc" },
  space: { sun: "#ffffff", sunI: 3.2, sky: "#1a2040", ground: "#000000", hemiI: 0.15, amb: 0.03, dir: [-1, 0.3, 0.5], fog: "#000000", skyTop: "#02030a", skyHorizon: "#050816" },
  // 1.6 lighting keys (references/research/lighting.md B4: design values, hero-short palette anchors). fogNF = linear fog [near, far] for a street-sized set
  dusk:           { sun: "#ff9f8a", sunI: 0.9, sky: "#6e54d3", ground: "#2a1f55", hemiI: 1.0, amb: 0.12, dir: [-0.85, 0.21, -0.49], fog: "#5a4ab0", skyTop: "#1f1a5c", skyHorizon: "#b0589c", fogNF: [8, 95] },
  rain:           { sun: "#dfe9ef", sunI: 0.7, sky: "#9fb9c8", ground: "#4a5a62", hemiI: 1.4, amb: 0.20, dir: [-0.30, 0.90, 0.20], fog: "#87adbe", skyTop: "#5c7482", skyHorizon: "#9fb8c4", fogNF: [5, 55] },
  storm:          { sun: "#b8c4d0", sunI: 0.5, sky: "#56677a", ground: "#2c343c", hemiI: 1.1, amb: 0.12, dir: [-0.17, 0.97, 0.20], fog: "#4a5a68", skyTop: "#2e3944", skyHorizon: "#6f8290", fogNF: [4, 60] },
  fog:            { sun: "#fff0dc", sunI: 1.0, sky: "#cfd8dc", ground: "#8a8a84", hemiI: 1.4, amb: 0.25, dir: [0.31, 0.42, -0.85], fog: "#cfd9de", skyTop: "#b8c6cf", skyHorizon: "#d6dfe3", fogNF: [2, 35] },
  morning:        { sun: "#ffe4ce", sunI: 2.3, sky: "#a9c9f5", ground: "#7d6f58", hemiI: 1.0, amb: 0.15, dir: [-0.78, 0.42, 0.45], fog: "#dbe7f2", skyTop: "#4d9be8", skyHorizon: "#ffe9d2", fogNF: [8, 90] },
  sunsetBack:     { sun: "#ff9d5a", sunI: 3.0, sky: "#7a78c8", ground: "#6a4a3a", hemiI: 1.1, amb: 0.15, dir: [-0.48, 0.26, -0.84], fog: "#ffb07a", skyTop: "#4a4fb0", skyHorizon: "#ff9a5c", fogNF: [8, 90] },
  dawn:           { sun: "#ffc9a0", sunI: 2.6, sky: "#b7b0ea", ground: "#806050", hemiI: 1.0, amb: 0.15, dir: [-0.88, 0.26, 0.41], fog: "#ffd9c4", skyTop: "#6f8fe0", skyHorizon: "#ffc9b0", fogNF: [10, 110] },
  nightMoon:      { sun: "#a9bcff", sunI: 1.0, sky: "#2a3570", ground: "#151a30", hemiI: 0.8, amb: 0.10, dir: [0.71, 0.57, -0.41], fog: "#1b2448", skyTop: "#060b2e", skyHorizon: "#1d2f7a", fogNF: [6, 80] },
  nightPractical: { sun: "#a9bcff", sunI: 0.5, sky: "#1f2858", ground: "#10142a", hemiI: 0.55, amb: 0.08, dir: [0.71, 0.57, -0.41], fog: "#141a3c", skyTop: "#040824", skyHorizon: "#15235e", fogNF: [5, 60] },
  neon:           { sun: "#8fa0ff", sunI: 0.3, sky: "#1a1440", ground: "#0d0a24", hemiI: 0.5, amb: 0.06, dir: [0.71, 0.57, -0.41], fog: "#24124a", skyTop: "#05041c", skyHorizon: "#2a1456", fogNF: [4, 50] },
  interiorWindow: { sun: "#eef4ff", sunI: 2.2, sky: "#b8ccd8", ground: "#8a6a52", hemiI: 0.9, amb: 0.20, dir: [-0.85, 0.50, 0.15], fog: "#7297aa", skyTop: "#7297aa", skyHorizon: "#a9c2cf", fogNF: [15, 60] },
  interiorWarm:   { sun: "#7f8fd0", sunI: 0.5, sky: "#4a4470", ground: "#5a3a2a", hemiI: 0.6, amb: 0.10, dir: [0.85, 0.40, 0.30], fog: "#2b2a4a", skyTop: "#2b2a7a", skyHorizon: "#6a5aa8", fogNF: [20, 80] },
  spotlight:      { sun: "#fff6e6", sunI: 3.2, sky: "#20243a", ground: "#101220", hemiI: 0.25, amb: 0.03, dir: [0.00, 0.98, 0.17], fog: "#0c0e1c", skyTop: "#05060f", skyHorizon: "#0c1024", fogNF: [6, 60] },
};

export function lights(scene: THREE.Scene, preset: LightPreset = "day", opts: { shadowSize?: number; target?: [number, number, number]; fog?: [number, number] | false } = {}) {
  const L = LIGHTS[preset];
  const sun = new THREE.DirectionalLight(L.sun, L.sunI);
  const d = new THREE.Vector3(...L.dir).normalize();
  const t = new THREE.Vector3(...(opts.target ?? [0, 0, 0]));
  sun.position.copy(t.clone().add(d.multiplyScalar(80)));
  sun.target.position.copy(t);
  sun.castShadow = true;
  const S = opts.shadowSize ?? 40;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 220 });
  sun.shadow.bias = -0.00015; // 1.6: -0.0004 over near 1 / far 220 was an ~9 cm depth offset: contact shadows detached from feet and props
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(L.sky, L.ground, L.hemiI);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight("#ffffff", L.amb));
  if (opts.fog !== false && preset !== "space") {
    const [n, f] = opts.fog ?? L.fogNF ?? [60, 320];
    scene.fog = new THREE.Fog(L.fog, n, f);
  }
  return { sun, hemi, preset: L };
}

export function sky(scene: THREE.Scene, top: string, horizon: string, bottom?: string, radius = 900) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) }, bottom: { value: new THREE.Color(bottom ?? horizon) },
      // 1.6 sun / moon glow: set sunDir (toward the light, normalised), sunCol and sunGlow (0 = off, ~0.6 day, ~1 sunset)
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color("#fff2d0") }, sunGlow: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunGlow; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.85, h), 0.7)) : mix(horizon, bottom, smoothstep(0.0, -0.2, h));
        float sd = max(dot(normalize(vP), sunDir), 0.0);
        c += sunCol * sunGlow * (0.55 * pow(sd, 220.0) + 0.3 * pow(sd, 24.0) + 0.12 * pow(sd, 4.0) * smoothstep(-0.1, 0.25, 1.0 - abs(h)));   // disc, halo, horizon-side glow
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  m.layers.set(NOINK);
  m.renderOrder = -10;
  scene.add(m);
  return m;
}

export function skyFor(scene: THREE.Scene, preset: LightPreset) {
  const L = LIGHTS[preset];
  return sky(scene, L.skyTop, L.skyHorizon);
}

const lambert = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(o);
const shadowed = <T extends THREE.Object3D>(o: T, cast = true, receive = true) => {
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } });
  return o;
};

export function ground(scene: THREE.Scene, size = 400, tex: THREE.Texture = paint.grass("#67a548", [size / 6, size / 6])) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(size, size), lambert({ map: tex }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  scene.add(g);
  return g;
}

export type HouseOpts = { w?: number; d?: number; h?: number; wall?: string; roof?: string; floors?: number; seed?: string; door?: string };
export function house(o: HouseOpts = {}) {
  const w = o.w ?? 6, d = o.d ?? 5, h = o.h ?? 4.5, seed = o.seed ?? `${w}${d}${h}`;
  const r = rng(seed);
  const wall = o.wall ?? vary("#f0dfbd", r, 0.08, 0.2, 0.1);
  const roof = o.roof ?? vary("#c4553a", r, 0.05, 0.15, 0.12);
  const grp = new THREE.Group();
  const wallTex = paint.plaster(wall, Math.max(1, Math.round(w / 2.6)), o.floors ?? Math.max(1, Math.round(h / 3.2)), seed);
  const sideTex = paint.plaster(wall, Math.max(1, Math.round(d / 2.6)), o.floors ?? Math.max(1, Math.round(h / 3.2)), seed + "s");
  const mats = [lambert({ map: sideTex }), lambert({ map: sideTex }), lambert({ color: wall }), lambert({ color: wall }), lambert({ map: wallTex }), lambert({ map: wallTex })];
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  body.position.y = h / 2;
  grp.add(body);
  // gable roof as an extruded triangle with overhang
  const rh = Math.min(w, d) * 0.45, ov = 0.45;
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2 - ov, 0); sh.lineTo(w / 2 + ov, 0); sh.lineTo(0, rh); sh.lineTo(-w / 2 - ov, 0);
  const rg = new THREE.ExtrudeGeometry(sh, { depth: d + ov * 2, bevelEnabled: false });
  rg.translate(0, 0, -(d + ov * 2) / 2);
  const rt = paint.roofTiles(roof, [Math.max(1, w / 3), Math.max(1, d / 3)]);
  const rm = new THREE.Mesh(rg, [lambert({ color: roof }), lambert({ map: rt })]);
  rm.position.y = h;
  grp.add(rm);
  // door
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.12), lambert({ map: paint.planks(o.door ?? "#6b3f26") }));
  door.position.set((r() - 0.5) * (w - 2), 1.05, d / 2 + 0.05);
  grp.add(door);
  if (r() < 0.6) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), lambert({ color: vary("#8a5a44", r) }));
    ch.position.set(w * 0.25, h + rh * 0.7, 0);
    grp.add(ch);
  }
  return shadowed(grp);
}

export function tree(o: { h?: number; kind?: "round" | "pine"; color?: string; seed?: string } = {}) {
  const r = rng(o.seed ?? "tree");
  const h = o.h ?? 5 + r() * 2, kind = o.kind ?? "round";
  const grp = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, h * 0.45, 7), lambert({ color: vary("#6e4a2f", r) }));
  trunk.position.y = h * 0.225;
  grp.add(trunk);
  const col = o.color ?? vary("#3f9a3a", r, 0.04, 0.15, 0.12);
  if (kind === "pine") {
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(h * (0.32 - i * 0.07), h * 0.42, 8), lambert({ color: vary(col, r, 0.02, 0.05, 0.06), flatShading: true }));
      c.position.y = h * (0.42 + i * 0.2);
      grp.add(c);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const g = new THREE.IcosahedronGeometry(h * (0.2 + r() * 0.08), 2);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.9 + r() * 0.2), p.getY(k) * (0.85 + r() * 0.2), p.getZ(k) * (0.9 + r() * 0.2));
      g.computeVertexNormals();
      const b = new THREE.Mesh(g, lambert({ color: vary(col, r, 0.02, 0.06, 0.08) }));
      b.position.set((r() - 0.5) * h * 0.3, h * (0.62 + r() * 0.15), (r() - 0.5) * h * 0.3);
      grp.add(b);
    }
  }
  return shadowed(grp);
}

export function rock(o: { s?: number; color?: string; seed?: string } = {}) {
  const r = rng(o.seed ?? "rock");
  const g = new THREE.DodecahedronGeometry(o.s ?? 0.8, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.8 + r() * 0.4), p.getY(k) * (0.55 + r() * 0.3), p.getZ(k) * (0.8 + r() * 0.4));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, lambert({ color: o.color ?? vary("#9a9488", r, 0.02, 0.05, 0.12), flatShading: true }));
  m.position.y = (o.s ?? 0.8) * 0.3;
  return shadowed(m);
}

export function hill(o: { r?: number; h?: number; color?: string } = {}) {
  const R = o.r ?? 40;
  const m = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), lambert({ map: paint.grass(o.color ?? "#6bb545", [R / 5, R / 5]) }));
  m.scale.y = (o.h ?? 10) / R;
  m.receiveShadow = true;
  return m;
}

export function water(size = 60) {
  const tex = paint.water();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color("#1d5a8a"), emissiveIntensity: 0.25 }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return { mesh: m, update: (f: number) => { tex.offset.set(f * 0.0008, f * 0.0012); } };
}

/** Flat cartoon cloud card (never inked, faces the camera on Y). */
export function cloudCard(o: { w?: number; seed?: string; color?: string } = {}) {
  const r = rng(o.seed ?? "cloud");
  const tex = canvasTexture(`cloud${o.seed}`, 512, 256, (g) => {
    const puffs = 5 + Math.floor(r() * 3);
    g.fillStyle = o.color ?? "#ffffff";
    for (let i = 0; i < puffs; i++) {
      const x = 80 + (i / (puffs - 1)) * 352, rr = 50 + r() * 45;
      g.beginPath(); g.arc(x, 170 - rr * 0.6 - r() * 20, rr, 0, 7); g.fill();
    }
    g.fillRect(70, 150, 372, 60);
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(120,140,200,0.25)"; g.fillRect(0, 175, 512, 81); // cool underside
  });
  const w = o.w ?? 30;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  m.layers.set(NOINK);
  return m;
}

export function studio(scene: THREE.Scene, top = "#f3efe8", bottom = "#d6cfc2", size = 60) {
  // cyclorama look: floor + surrounding gradient wall (never inked), no hard horizon
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size * 2, size * 2), lambert({ color: bottom }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  const wallGeo = new THREE.CylinderGeometry(size, size, size, 48, 1, true, Math.PI * 0.75, Math.PI * 1.5);
  const wall = new THREE.Mesh(wallGeo, new THREE.MeshLambertMaterial({ map: paint.studio(top, bottom), side: THREE.BackSide }));
  wall.position.y = size / 2 - 0.01;
  wall.layers.set(NOINK);
  scene.add(floor, wall);
  scene.background = new THREE.Color(top);
  return { floor, wall };
}

export function stars(scene: THREE.Scene, n = 3000, seed = "stars") {
  const r = rng(seed);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pos.set([s * Math.cos(t) * 800, u * 800, s * Math.sin(t) * 800], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: "#ffffff", size: 1.6, sizeAttenuation: false, fog: false }));
  p.layers.set(NOINK);
  scene.add(p);
  return p;
}

export function planet(radius = 10, o: { ocean?: string; land?: string; atmosphere?: string } = {}) {
  const grp = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), new THREE.MeshStandardMaterial({ map: paint.planet(o.ocean, o.land), roughness: 0.9, metalness: 0 }));
  grp.add(m);
  const atm = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.04, 64, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { c: { value: new THREE.Color(o.atmosphere ?? "#6fb6ff") } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); gl_FragColor = vec4(c * f * 1.6, f); }`,
  }));
  atm.layers.set(NOINK);
  grp.add(atm);
  return { group: grp, surface: m };
}

/** Deterministic scatter: place n objects in a ring/area avoiding a keep-out circle. */
export function scatter(n: number, seed: string, area: { x: [number, number]; z: [number, number] }, keepOut?: { x: number; z: number; r: number }) {
  const r = rng(seed);
  const out: { x: number; z: number; s: number; rot: number; r: () => number }[] = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 30) {
    const x = area.x[0] + r() * (area.x[1] - area.x[0]);
    const z = area.z[0] + r() * (area.z[1] - area.z[0]);
    if (keepOut && Math.hypot(x - keepOut.x, z - keepOut.z) < keepOut.r) continue;
    out.push({ x, z, s: 0.8 + r() * 0.5, rot: r() * Math.PI * 2, r });
  }
  return out;
}

export { shadowed };

// ------------------------------------------------------------------ coastal props

/** Striped lighthouse with gallery, glass lantern room and cap. Returns lamp handles for flashing. */
export function lighthouse(o: { h?: number; stripe?: string; base?: string; seed?: string } = {}) {
  const H = o.h ?? 16;
  const grp = new THREE.Group();
  const stripes = canvasTexture(`lh${o.stripe}${o.base}`, 64, 512, (g) => {
    const n = 6;
    for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? (o.stripe ?? "#c8352b") : (o.base ?? "#f4efe6"); g.fillRect(0, (i * 512) / n, 64, 512 / n); }
  });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.09, H * 0.14, H, 24), lambert({ map: stripes }));
  tower.position.y = H / 2;
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.13, H * 0.13, H * 0.03, 24), lambert({ color: "#2b2b33" }));
  gallery.position.y = H + H * 0.015;
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffe2a0"), toneMapped: false });
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.075, H * 0.075, H * 0.11, 16), lampMat);
  lantern.position.y = H + H * 0.085;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(H * 0.1, H * 0.09, 16), lambert({ color: "#2b2b33" }));
  cap.position.y = H + H * 0.185;
  grp.add(tower, gallery, lantern, cap);
  const keeper = house({ w: H * 0.35, d: H * 0.28, h: H * 0.2, wall: "#efe6d6", roof: "#3b4a63", seed: (o.seed ?? "lh") + "k" });
  keeper.position.set(H * 0.3, 0, H * 0.05);
  grp.add(keeper);
  shadowed(grp);
  lantern.castShadow = false;
  const light = new THREE.PointLight("#ffd79a", 0, H * 5, 1.6);
  light.position.y = lantern.position.y;
  grp.add(light);
  const beam = lightBeam(H * 4.5, H * 0.45);
  beam.position.y = lantern.position.y;
  grp.add(beam);
  return { group: grp, lampMat, light, beam, lanternY: lantern.position.y,
    /** intensity 0..1 drives lamp glow, point light and beam */
    set(k: number, beamYaw: number) {
      lampMat.color.setRGB(0.35 + 4.5 * k, 0.3 + 3.6 * k, 0.18 + 2.2 * k);
      light.intensity = 40 * k;
      beam.rotation.y = beamYaw;
      (beam.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>).material.uniforms.k.value = k;
      (beam.children[1] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>).material.uniforms.k.value = k;
    } };
}

/** Two opposite volumetric-looking light cones (additive, never inked). */
export function lightBeam(len = 70, radius = 7, color = "#ffe6b0") {
  const grp = new THREE.Group();
  for (const s of [1, -1]) {
    const geo = new THREE.ConeGeometry(radius, len, 32, 1, true);
    geo.translate(0, -len / 2, 0);
    geo.rotateZ((s * Math.PI) / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { c: { value: new THREE.Color(color) }, k: { value: 1 }, len: { value: len } },
      vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 c; uniform float k; uniform float len; varying vec3 vP; varying vec3 vN; varying vec3 vV;
        void main(){ float d = clamp(abs(vP.x) / len, 0.0, 1.0); float edge = pow(abs(dot(vN, vV)), 1.5);
          float a = (1.0 - d) * (1.0 - d) * edge * 0.55 * k; gl_FragColor = vec4(c * a, a); }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.layers.set(NOINK);
    grp.add(m);
  }
  return grp;
}

/** Small rowing boat (bow along +x). */
export function boat(o: { color?: string; trim?: string; len?: number } = {}) {
  const L = o.len ?? 4.2;
  const sh = new THREE.Shape();
  sh.moveTo(-L / 2, 0.75); sh.quadraticCurveTo(-L / 2 + 0.2, 0, 0, 0); sh.quadraticCurveTo(L / 2 - 0.3, 0, L / 2 + 0.25, 0.85);
  sh.lineTo(-L / 2, 0.75);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.5, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 });
  geo.translate(0, -0.25, -0.75);
  const hull = new THREE.Mesh(geo, [lambert({ map: paint.planks(o.color ?? "#d9573f", [1, 1], false) }), lambert({ color: o.trim ?? "#f1e6cf" })]);
  const grp = new THREE.Group();
  grp.add(hull);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 1.5), lambert({ color: "#7a5236" }));
  seat.position.set(0.3, 0.45, 0);
  grp.add(seat);
  return shadowed(grp);
}

// ------------------------------------------------------------------ street props (detail density: the measured style
// has ~2x our edge density; small props + painted joints carry it)

export function lampPost(o: { h?: number; color?: string; lit?: boolean } = {}) {
  const h = o.h ?? 3.4, col = o.color ?? "#2e3442";
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, h, 10), lambert({ color: col })); pole.position.y = h / 2;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), lambert({ color: col })); arm.position.set(0.22, h - 0.08, 0);
  const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.28, 10), lambert({ color: col })); lamp.position.set(0.45, h - 0.18, 0);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(o.lit ? 3 : 1, o.lit ? 2.4 : 0.9, o.lit ? 1.4 : 0.6) }));
  bulb.position.set(0.45, h - 0.3, 0);
  g.add(pole, arm, lamp, bulb);
  return shadowed(g);
}

export function bench(o: { color?: string } = {}) {
  const g = new THREE.Group();
  const wood = lambert({ map: paint.planks(o.color ?? "#a8703f", [1, 1], false) }), iron = lambert({ color: "#2e3442" });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, 0.45), wood); seat.position.y = 0.45;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.06), wood); back.position.set(0, 0.75, -0.2);
  g.add(seat, back);
  for (const x of [-0.7, 0.7]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), iron); l.position.set(x, 0.22, 0); g.add(l); }
  return shadowed(g);
}

export function fence(len = 4, o: { color?: string; h?: number } = {}) {
  const g = new THREE.Group(), h = o.h ?? 0.9, m = lambert({ color: o.color ?? "#f2ece0" });
  const n = Math.max(2, Math.round(len / 0.35));
  for (let i = 0; i <= n; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.05), m); p.position.set(-len / 2 + (i * len) / n, h / 2, 0); g.add(p); }
  for (const y of [h * 0.3, h * 0.75]) { const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.04), m); r.position.set(0, y, 0.03); g.add(r); }
  return shadowed(g);
}

export function flowerBox(o: { w?: number; seed?: string } = {}) {
  const r = rng(o.seed ?? "fb"), w = o.w ?? 1.2;
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, 0.4), lambert({ map: paint.planks("#8a5634", [1, 1], false) })); box.position.y = 0.17;
  g.add(box);
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 + r() * 0.05, 0), lambert({ color: ["#ff6f8e", "#ffd84a", "#ffffff", "#c58cff"][i % 4], flatShading: true }));
    f.position.set(-w / 2 + 0.12 + (i / 6) * (w - 0.24), 0.42 + r() * 0.08, (r() - 0.5) * 0.15); g.add(f);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), lambert({ color: "#4f9a35", flatShading: true }));
    leaf.position.set(f.position.x + 0.05, 0.36, f.position.z); g.add(leaf);
  }
  return shadowed(g);
}

/** Flat cartoon bird (NOINK card pair that flaps); call update(frame, fps) with a path function. */
export function bird(color = "#2a2433") {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: true });
  const wing = (s: number) => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(s * 0.25, 0.12, s * 0.5, 0.02); sh.quadraticCurveTo(s * 0.25, 0.04, 0, 0); return new THREE.Mesh(new THREE.ShapeGeometry(sh), mat); };
  const L = wing(-1), R = wing(1);
  g.add(L, R);
  g.traverse((o) => o.layers.set(NOINK));
  return { group: g, flap: (f: number) => { const a = Math.sin(f * 0.9) * 0.6; L.rotation.x = a; R.rotation.x = a; } };
}

/**
 * Sight-line culling (technique: claude-animated-shorts build.ts, MIT): true if a prop at `p` with radius `r` would
 * sit between any camera position and its look target (the shot's subject), i.e. it would block the shot or become a
 * frame-cutting foreground blob. Feed it the rig's keys (camera pos + look). Skip such props when placing.
 */
export function blocksShot(p: [number, number, number], r: number, shots: { pos: [number, number, number]; look: [number, number, number] }[], margin = 0.6) {
  for (const s of shots) {
    const ax = s.look[0] - s.pos[0], az = s.look[2] - s.pos[2];
    const L2 = ax * ax + az * az;
    if (L2 < 1e-6) continue;
    const t = ((p[0] - s.pos[0]) * ax + (p[2] - s.pos[2]) * az) / L2;
    if (t <= 0.02 || t >= 0.98) continue; // behind the camera or behind the subject
    const cx = s.pos[0] + ax * t, cz = s.pos[2] + az * t;
    if (Math.hypot(p[0] - cx, p[2] - cz) < r + margin) return true;
  }
  return false;
}

/**
 * Ambient motes (1.3): floating dust / pollen / snow specks that drift on a deterministic flow, so held shots are never
 * dead-still. Measured gap on the elevator proof short: micro-animation activity 0.007 vs 0.020 on the reference
 * channel even with idle characters and swaying bunting; the reference's interiors and streets always have something
 * drifting. NOINK (no ink outline), soft round sprite, sizes in metres.
 *   const m = motes(scene, { center: [0, 3, 0], size: [20, 6, 20], n: 400 }); ... m.update(frame, fps)
 */
export function motes(scene: THREE.Scene, o: { center: [number, number, number]; size: [number, number, number]; n?: number; color?: string; px?: number; seed?: string; speed?: number; opacity?: number }) {
  const n = o.n ?? 300, r = rng(o.seed ?? "motes"), base = new Float32Array(n * 3), ph = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { base[i * 3 + k] = o.center[k] + (r() - 0.5) * o.size[k]; ph[i * 3 + k] = r() * Math.PI * 2; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(base.slice(), 3));
  const dotTex = canvasTexture("motes-dot", 64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const mat = new THREE.PointsMaterial({ color: o.color ?? "#fff3d6", size: o.px ?? 0.05, map: dotTex, transparent: true, opacity: o.opacity ?? 0.75, depthWrite: false, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.layers.set(NOINK); pts.userData.auditIgnore = true; pts.frustumCulled = false;
  scene.add(pts);
  const sp = o.speed ?? 0.12;
  return {
    points: pts,
    update(frame: number, fps = 30) {
      const t = frame / fps, a = geo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < n; i++) {
        const j = i * 3, w = 0.6 + 0.4 * Math.sin(ph[j + 2]);
        // slow loop drift + a gentle sink, wrapped inside the box (no popping: wrap happens over the full height)
        let y = base[j + 1] + Math.sin(t * 0.7 * w + ph[j + 1]) * 0.25 - ((t * sp * 0.6 * w) % o.size[1]);
        if (y < o.center[1] - o.size[1] / 2) y += o.size[1];
        a.setXYZ(i, base[j] + Math.sin(t * 0.45 * w + ph[j]) * 0.6 * sp * 4, y, base[j + 2] + Math.cos(t * 0.38 * w + ph[j + 2]) * 0.6 * sp * 4);
      }
      a.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ set-dressing kit (1.5)
/**
 * Detail is what separated our worlds from the measured reference (edge density 4.9 % vs 8.7 %): every shot of the
 * reference has textured surfaces, signage, props and a filled horizon. These pieces are procedural, deterministic and
 * cheap; all return a Group with its base on y = 0 unless noted. Dress EVERY background a shot can see, then run the
 * shot audit (`render.mjs --stills cues`) so nothing new stands between the camera and a subject.
 */
const FONT_SIGN = "Georgia, 'Times New Roman', serif";
/** Text on a coloured board (signs, banners, posters). Auto-fits the text to 86 % of the width. */
export function textTexture(text: string, o: { w?: number; h?: number; bg?: string; fg?: string; border?: string; font?: string; transparent?: boolean } = {}) {
  const W = o.w ?? 512, H = o.h ?? 128;
  return canvasTexture(`txt|${text}|${W}|${H}|${o.bg}|${o.fg}|${o.border}|${o.transparent}`, W, H, (g) => {
    if (!o.transparent) { g.fillStyle = o.bg ?? "#f4efe6"; g.fillRect(0, 0, W, H); }
    if (o.border) { g.strokeStyle = o.border; g.lineWidth = H * 0.07; g.strokeRect(H * 0.07, H * 0.07, W - H * 0.14, H - H * 0.14); }
    g.fillStyle = o.fg ?? "#1c1216"; g.textAlign = "center"; g.textBaseline = "middle";
    let size = H * 0.54; g.font = `900 ${size}px ${o.font ?? FONT_SIGN}`;
    const m = g.measureText(text).width; if (m > W * 0.84) { size *= (W * 0.84) / m; g.font = `900 ${size}px ${o.font ?? FONT_SIGN}`; }
    g.fillText(text, W / 2, H / 2 + size * 0.05);
  });
}
/** A shop / station sign: a thin box, text on the +z face. */
export function signBoard(text: string, o: { w?: number; h?: number; bg?: string; fg?: string; border?: string } = {}) {
  const w = o.w ?? 2.6, h = o.h ?? 0.62, bg = o.bg ?? "#2b2230";
  const tex = textTexture(text, { w: 512, h: Math.max(64, Math.round((512 * h) / w)), bg, fg: o.fg ?? "#f1c94a", border: o.border ?? o.fg ?? "#f1c94a" });
  const side = lambert({ color: bg });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.09), [side, side, side, side, lambert({ map: tex }), side]));
  return shadowed(g);
}
/** A hanging cloth banner with a swallow-tail (text optional). Hangs DOWN from y = 0, faces +z and -z. */
export function banner(text: string, o: { w?: number; h?: number; color?: string; fg?: string; trim?: string } = {}) {
  const w = o.w ?? 1.4, h = o.h ?? 3, col = o.color ?? "#c0392b", W = 256, H = Math.round((256 * h) / w);
  const tex = canvasTexture(`banner|${text}|${w}|${h}|${col}|${o.fg}|${o.trim}`, W, H, (g) => {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, H); g.lineTo(W / 2, H - W * 0.38); g.lineTo(0, H); g.closePath();
    g.fillStyle = col; g.fill();
    g.save(); g.clip(); g.fillStyle = "rgba(0,0,0,0.12)"; for (let x = 0; x < W; x += W / 4) g.fillRect(x, 0, W / 12, H); // cloth folds
    g.strokeStyle = o.trim ?? "#f1c94a"; g.lineWidth = W * 0.07; g.stroke(); g.restore();
    g.fillStyle = o.fg ?? "#fff6d8"; g.textAlign = "center"; g.textBaseline = "middle";
    const words = text.split("|"); let size = Math.min(W * 0.34, (H * 0.5) / words.length);
    g.font = `900 ${size}px ${FONT_SIGN}`;
    for (const wd of words) { const m = g.measureText(wd).width; if (m > W * 0.8) size *= (W * 0.8) / m; }
    g.font = `900 ${size}px ${FONT_SIGN}`;
    words.forEach((wd, i) => g.fillText(wd, W / 2, H * 0.36 + (i - (words.length - 1) / 2) * size * 1.15));
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lambert({ map: tex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide }));
  m.position.y = -h / 2;
  const g = new THREE.Group(); g.add(m);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, w * 1.12, 8), lambert({ color: "#5a4326" })); rod.rotation.z = Math.PI / 2; g.add(rod);
  return shadowed(g, false, false);
}
/** Iron-and-glass lattice wall (exhibition halls, stations, greenhouses): alpha-tested bars + a faint glass sheet. Centre at origin, faces +-z. */
export function lattice(w: number, h: number, o: { cell?: number; color?: string; glass?: string | false; arch?: boolean } = {}) {
  const cell = o.cell ?? 1.5, col = o.color ?? "#2f4a6a";
  const tex = canvasTexture(`lattice|${col}|${o.arch}`, 256, 256, (g) => {
    g.strokeStyle = col; g.lineWidth = 26; g.strokeRect(0, 0, 256, 256); // shared frame bars (13 px each side of a seam)
    g.lineWidth = 9; g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke(); // glazing bars
    if (o.arch) { g.lineWidth = 8; g.beginPath(); g.arc(128, 256, 118, Math.PI, 0); g.stroke(); }
    g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 3; g.beginPath(); g.moveTo(15, 15); g.lineTo(15, 241); g.stroke(); // highlight on the bars
  }, [w / cell, h / cell]);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), lambert({ map: tex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide })));
  if (o.glass !== false) { const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color: o.glass ?? "#cfe8ff", transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })); gl.userData.auditIgnore = true; g.add(gl); }
  return g;
}
/** Brick texture (running bond). */
export const brickTexture = (color = "#a8553c", mortar = "#d9c7b0", rep: [number, number] = [2, 2]) =>
  canvasTexture(`brick|${color}|${mortar}`, 512, 512, (g, r) => {
    g.fillStyle = mortar; g.fillRect(0, 0, 512, 512);
    const bh = 512 / 8, bw = 512 / 4;
    for (let y = 0; y < 8; y++) for (let x = -1; x < 4; x++) { g.fillStyle = vary(color, r, 0.03, 0.1, 0.12); g.fillRect(x * bw + (y % 2 ? bw / 2 : 0) + 4, y * bh + 4, bw - 8, bh - 8); }
  }, rep);
/** Wooden crate with a frame and a diagonal brace on every face. */
export function crate(s = 0.6, o: { color?: string; seed?: string; label?: string } = {}) {
  const col = o.color ?? "#b98a52";
  const tex = canvasTexture(`crate|${col}|${o.label}`, 256, 256, (g, r) => {
    for (let i = 0; i < 5; i++) { g.fillStyle = vary(col, r, 0.02, 0.06, 0.1); g.fillRect(0, i * 51.2, 256, 51.2); g.fillStyle = "rgba(60,30,10,0.35)"; g.fillRect(0, i * 51.2, 256, 3); }
    g.strokeStyle = shadeHex(col, -0.22); g.lineWidth = 34; g.strokeRect(17, 17, 222, 222);
    g.lineWidth = 26; g.beginPath(); g.moveTo(30, 226); g.lineTo(226, 30); g.stroke();
    g.fillStyle = "rgba(40,20,10,0.8)"; for (const [x, y] of [[17, 17], [239, 17], [17, 239], [239, 239]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
    if (o.label) { g.fillStyle = "rgba(30,18,22,0.85)"; g.font = "900 44px Arial Black, sans-serif"; g.textAlign = "center"; g.fillText(o.label, 128, 144); }
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), lambert({ map: tex })); m.position.y = s / 2;
  const g = new THREE.Group(); g.add(m); if (o.seed) g.rotation.y = (rng(o.seed)() - 0.5) * 0.8;
  return shadowed(g);
}
const shadeHex = (hex: string, d: number) => { const c = new THREE.Color(hex); const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + d))); return `#${c.getHexString()}`; };
/** Stave barrel with iron hoops. */
export function barrel(o: { h?: number; r?: number; color?: string } = {}) {
  const h = o.h ?? 0.95, r = o.r ?? 0.34, col = o.color ?? "#8a5a34";
  const prof = [[r * 0.8, 0], [r * 0.96, h * 0.22], [r, h * 0.5], [r * 0.96, h * 0.78], [r * 0.8, h]].map(([x, y]) => new THREE.Vector2(x, y));
  const tex = canvasTexture(`staves|${col}`, 256, 64, (g, r2) => { for (let i = 0; i < 12; i++) { g.fillStyle = vary(col, r2, 0.02, 0.08, 0.12); g.fillRect(i * 21.4, 0, 21.4, 64); g.fillStyle = "rgba(40,20,10,0.5)"; g.fillRect(i * 21.4, 0, 2.5, 64); } });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 20), lambert({ map: tex })));
  const lid = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, 20), lambert({ color: shadeHex(col, -0.08) })); lid.rotation.x = -Math.PI / 2; lid.position.y = h; g.add(lid);
  for (const y of [0.16, 0.5, 0.84]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(r * (y === 0.5 ? 1.0 : 0.93), 0.022, 6, 24), lambert({ color: "#3d4450" })); hoop.rotation.x = Math.PI / 2; hoop.position.y = h * y; g.add(hoop); }
  return shadowed(g);
}
/** Spoked wheel in the XY plane (carts, flywheels). */
export function spokedWheel(r = 0.5, o: { color?: string; spokes?: number; tube?: number } = {}) {
  const col = lambert({ color: o.color ?? "#4b3f46" }), g = new THREE.Group(), n = o.spokes ?? 8, t = o.tube ?? r * 0.09;
  g.add(new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 28), col));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.16, t * 3, 12), col); hub.rotation.x = Math.PI / 2; g.add(hub);
  for (let i = 0; i < n / 2; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(r * 2, t * 0.8, t * 0.8), col); s.rotation.z = (i * Math.PI * 2) / n; g.add(s); }
  return shadowed(g);
}
/** Two-wheeled hand cart with an optional load (crates / barrels). */
export function cart(o: { color?: string; load?: "crates" | "barrels" | "none"; seed?: string } = {}) {
  const wood = lambert({ map: paint.planks(o.color ?? "#9a6b45", [2, 1], false) }), g = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 1.1), wood); bed.position.y = 0.7; g.add(bed);
  for (const z of [-0.55, 0.55]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 0.06), wood); rail.position.set(0, 0.9, z); g.add(rail); const wh = spokedWheel(0.55, { color: "#5a3c2e" }); wh.position.set(0.1, 0.55, z * 1.22); g.add(wh); }
  for (const z of [-0.45, 0.45]) { const hd = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 0.07), wood); hd.position.set(-1.6, 0.72, z); hd.rotation.z = -0.12; g.add(hd); }
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.66, 0.08), wood); leg.position.set(-0.85, 0.33, 0); g.add(leg);
  if (o.load !== "none") for (let i = 0; i < 3; i++) { const it = o.load === "barrels" ? barrel({ h: 0.7, r: 0.26 }) : crate(0.5 - i * 0.06, { seed: (o.seed ?? "c") + i }); it.position.set(-0.6 + i * 0.6, 0.76, (i % 2 ? 0.18 : -0.15)); g.add(it); }
  return shadowed(g);
}
/** Striped shop awning: slopes down toward +z, back edge at y = 0. */
export function awning(w = 3, o: { depth?: number; a?: string; b?: string } = {}) {
  const d = o.depth ?? 1.2, a = o.a ?? "#c0392b", b = o.b ?? "#f4efe6";
  const tex = canvasTexture(`awning|${a}|${b}`, 256, 64, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 32, 0, 32, 64); } }, [Math.max(1, Math.round(w / 1.6)), 1]);
  const g = new THREE.Group(), m = lambert({ map: tex, side: THREE.DoubleSide });
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d * 1.08), m); top.position.set(0, -d * 0.2, d / 2); top.rotation.x = 0.38; g.add(top);
  const val = new THREE.Mesh(new THREE.BoxGeometry(w, 0.24, 0.04), m); val.position.set(0, -d * 0.4 - 0.1, d); g.add(val);
  return shadowed(g);
}
/** Exhibit / factory steam engine on a plinth; rotate `.wheel.rotation.z` for life. */
export function steamEngine(o: { color?: string } = {}) {
  const g = new THREE.Group(), body = lambert({ color: o.color ?? "#2f6b55" }), brass = lambert({ color: "#d8b04a" }), iron = lambert({ color: "#3d4450" });
  const pl = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 1.6), lambert({ map: brickTexture("#8a5a44", "#cbb9a0", [3, 0.5]) })); pl.position.y = 0.2; g.add(pl);
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.2, 20), body); boiler.rotation.z = Math.PI / 2; boiler.position.set(-0.3, 1.15, 0); g.add(boiler);
  for (const x of [-1.2, -0.3, 0.6]) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.61, 0.035, 6, 24), brass); band.rotation.y = Math.PI / 2; band.position.set(x, 1.15, 0); g.add(band); }
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.5, 12), iron); stack.position.set(-1.1, 2.3, 0); g.add(stack);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), brass); dome.position.set(0.2, 1.8, 0); g.add(dome);
  const cyl = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.5), iron); cyl.position.set(1.0, 0.7, 0.45); g.add(cyl);
  const wheel = spokedWheel(0.95, { color: "#8a2f2f", spokes: 12, tube: 0.07 }); wheel.position.set(1.25, 1.45, 0.5); g.add(wheel);
  const rod = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.06), brass); rod.position.set(0.7, 1.0, 0.56); rod.rotation.z = 0.5; g.add(rod);
  shadowed(g);
  return Object.assign(g, { wheel });
}
/** Builder's scaffold: poles, plank decks, braces and a ladder. */
export function scaffold(w = 4, h = 6, o: { levels?: number; depth?: number; color?: string } = {}) {
  const g = new THREE.Group(), d = o.depth ?? 1.4, n = o.levels ?? 3, wood = lambert({ color: o.color ?? "#b98a52" }), plank = lambert({ map: paint.planks("#c49a62", [3, 1], false) });
  for (const x of [-w / 2, 0, w / 2]) for (const z of [-d / 2, d / 2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.1), wood); p.position.set(x, h / 2, z); g.add(p); }
  for (let i = 1; i <= n; i++) { const y = (h * i) / (n + 0.3); const dk = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.07, d), plank); dk.position.set(0, y, 0); g.add(dk);
    const br = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(w / 2, h / (n + 0.3)), 0.06, 0.06), wood); br.position.set((i % 2 ? -1 : 1) * w / 4, y - h / (n + 0.3) / 2, d / 2 + 0.06); br.rotation.z = (i % 2 ? 1 : -1) * Math.atan2(h / (n + 0.3), w / 2); g.add(br); }
  const lad = new THREE.Group(); for (const x of [-0.22, 0.22]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, h * 0.8, 0.05), wood); s.position.set(x, h * 0.4, 0); lad.add(s); }
  for (let y = 0.3; y < h * 0.8; y += 0.38) { const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.04), wood); r2.position.y = y; lad.add(r2); }
  lad.position.set(w / 2 + 0.5, 0, d / 2 + 0.4); lad.rotation.x = -0.18; g.add(lad);
  return shadowed(g);
}
/** A flat far facade (fills horizons cheaply): plaster texture with windows + a dark roof line. Base on y = 0, faces +z. */
export function rowFacade(w = 8, h = 12, o: { color?: string; floors?: number; seed?: string; roof?: string } = {}) {
  const g = new THREE.Group(), floors = o.floors ?? Math.max(2, Math.round(h / 3.1));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lambert({ map: paint.plaster(o.color ?? "#c9a48a", Math.max(2, Math.round(w / 2.4)), floors, o.seed ?? `rf${w}${h}`) })); m.position.y = h / 2; g.add(m);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.5, 0.4), lambert({ color: o.roof ?? "#4b3f46" })); roof.position.y = h + 0.2; g.add(roof);
  for (let i = 0; i < 2; i++) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.5), lambert({ color: "#7a4a3a" })); ch.position.set(-w * 0.28 + i * w * 0.5, h + 0.9, -0.3); g.add(ch); }
  return shadowed(g, false, true);
}
/** Gas / oil lantern: hang it or stand it; the glass is emissive (blooms at night). */
export function lantern(o: { color?: string; glow?: string } = {}) {
  const g = new THREE.Group(), iron = lambert({ color: o.color ?? "#2b2f3a" });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), new THREE.MeshLambertMaterial({ color: "#ffe9b0", emissive: new THREE.Color(o.glow ?? "#ffc860"), emissiveIntensity: 1.4 })); g.add(glass);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 4), iron); cap.position.y = 0.23; cap.rotation.y = Math.PI / 4; g.add(cap);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.26), iron); base.position.y = -0.17; g.add(base);
  return g;
}

/**
 * Light shafts ("god rays") as additive crossed cards (1.6): from each `from` point (a roof light, a window, a gap in
 * the trees) along `dir` (the direction the light TRAVELS) for `len` metres. Soft across, brightest at the source.
 * Cheap, deterministic, independent of the camera (screen-space shafts only work when the sun is in view).
 * Fade them with the key light: `shafts.setStrength(0.22 * dayAmount)`.
 */
export function lightShafts(o: { from: [number, number, number][]; dir: [number, number, number]; len: number; width?: number; color?: string; strength?: number }) {
  const g = new THREE.Group(), d = new THREE.Vector3(...o.dir).normalize(), w = o.width ?? 1.6;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { c: { value: new THREE.Color(o.color ?? "#fff1c8") }, k: { value: o.strength ?? 0.22 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 c; uniform float k; varying vec2 vUv;
      void main(){ float x = 1.0 - abs(vUv.x * 2.0 - 1.0); float a = smoothstep(0.0, 0.85, x) * mix(0.18, 1.0, vUv.y * vUv.y) * smoothstep(0.0, 0.06, vUv.y) * k; gl_FragColor = vec4(c * a, a); }`,
  });
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), d);
  o.from.forEach((p, i) => {
    for (const turn of [0, Math.PI / 2]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w * (1 + (i % 3) * 0.25), o.len), mat);
      m.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn));
      m.position.set(p[0], p[1], p[2]).addScaledVector(d, o.len / 2);
      m.layers.set(NOINK); m.userData.auditIgnore = true; m.renderOrder = 4;
      g.add(m);
    }
  });
  return Object.assign(g, { setStrength: (k: number) => { mat.uniforms.k.value = k; } });
}
