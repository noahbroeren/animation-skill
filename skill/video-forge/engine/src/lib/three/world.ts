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

export type LightPreset = "day" | "golden" | "night" | "overcast" | "studio" | "space";

const LIGHTS: Record<LightPreset, { sun: string; sunI: number; sky: string; ground: string; hemiI: number; amb: number; dir: [number, number, number]; fog: string; skyTop: string; skyHorizon: string }> = {
  // warm key + cool sky fill => warm highlights, cool/violet shadows (the measured cartoon look)
  day: { sun: "#fff1d6", sunI: 2.6, sky: "#9cc8ff", ground: "#7a6a4a", hemiI: 1.1, amb: 0.15, dir: [-0.55, 0.8, 0.35], fog: "#bfe0ff", skyTop: "#3f8ff0", skyHorizon: "#bfe6ff" },
  golden: { sun: "#ffbd7a", sunI: 2.8, sky: "#8f86d6", ground: "#7a5236", hemiI: 0.9, amb: 0.12, dir: [-0.8, 0.32, 0.4], fog: "#ffc89a", skyTop: "#5a63c9", skyHorizon: "#ffb98a" },
  night: { sun: "#9bb4ff", sunI: 0.9, sky: "#2a3570", ground: "#151a30", hemiI: 0.7, amb: 0.1, dir: [0.4, 0.7, 0.2], fog: "#1b2448", skyTop: "#0b1030", skyHorizon: "#2c3d7a" },
  overcast: { sun: "#f4f6fa", sunI: 1.2, sky: "#c9d3df", ground: "#7d7a72", hemiI: 1.5, amb: 0.2, dir: [-0.3, 0.9, 0.2], fog: "#d4dbe3", skyTop: "#a7b3c2", skyHorizon: "#dfe5ec" },
  studio: { sun: "#ffffff", sunI: 2.2, sky: "#f0f0ff", ground: "#c9c0b0", hemiI: 1.0, amb: 0.25, dir: [-0.5, 0.85, 0.6], fog: "#ece6dc", skyTop: "#ece6dc", skyHorizon: "#ece6dc" },
  space: { sun: "#ffffff", sunI: 3.2, sky: "#1a2040", ground: "#000000", hemiI: 0.15, amb: 0.03, dir: [-1, 0.3, 0.5], fog: "#000000", skyTop: "#02030a", skyHorizon: "#050816" },
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
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(L.sky, L.ground, L.hemiI);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight("#ffffff", L.amb));
  if (opts.fog !== false && preset !== "space") {
    const [n, f] = opts.fog ?? [60, 320];
    scene.fog = new THREE.Fog(L.fog, n, f);
  }
  return { sun, hemi, preset: L };
}

export function sky(scene: THREE.Scene, top: string, horizon: string, bottom?: string, radius = 900) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) }, bottom: { value: new THREE.Color(bottom ?? horizon) } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.85, h), 0.7)) : mix(horizon, bottom, smoothstep(0.0, -0.2, h)); gl_FragColor = vec4(c, 1.0); }`,
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
