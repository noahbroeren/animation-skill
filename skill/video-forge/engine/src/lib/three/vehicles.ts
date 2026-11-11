/**
 * Vehicle kit (toon world): chunky friendly cars (sedan / hatch / pickup / van / taxi / police), a bus, a box truck,
 * a 17th-19th century coach (closed or open) with low-poly horses, and a bicycle. Built from creased, bevelled
 * primitives (door seams, bumpers, pillars are real geometry) so the ink pass outlines every panel. Metres; origin on
 * the ground at the vehicle's centre; faces +X; everything animated is a pure function of distance / phase.
 *   const v = car({ body: "taxi" }); scene.add(v.group);                       // or bus(), truck(), carriage(), bicycle()
 *   const card = new CharacterCard(spec, 1.7 * bobbleScale(spec), 900, L.sun); card.blob.visible = false; scene.add(card.group);
 *   update: drive(v, PATH, u); v.setLights(nightK);                            // or place v.group by hand + v.setDistance(d)
 *           card.setPose(seatPose(v, "driver", cam.pos)); card.place(...seatWorld(v, "driver", 1.7, cam.pos), cam.pos);
 * Cabins are an opaque tub up to the window sill (+ a dark interior deck), so a seated card shows head and shoulders
 * only, from any angle. Hats taller than a cap/boater (top hat, chef, crown) poke through car roofs: use the open coach.
 */
import * as THREE from "three";
import { BOBBLE_POSES, KPose } from "../characters/kinds";
import { NOINK } from "./post";
import { canvasTexture } from "./textures";
import { crate, lantern, shadowed, spokedWheel, textTexture } from "./world";

type V3 = [number, number, number];
export type Seat = {
  /** local position where a character card's FEET go so that head and shoulders show in the window (1.7 m bobble) */
  pos: V3; pose?: "sit" | "stand";
  /** open seats (bicycle): push the card this many metres toward the camera so it draws over the frame */
  nudge?: number;
};
export type Vehicle = {
  group: THREE.Group; seats: Record<string, Seat>; length: number; width: number; height: number; wheelR: number;
  /** distance travelled in metres -> wheel rotation (pure function, no accumulated state) */
  setDistance(d: number): void;
  /** 0..1 headlight / lamp glow (emissive lenses; no real light unless asked for) */
  setLights(k: number): void;
  /** small body bounce / suspension lean for this frame: bounce in metres, pitch and roll in radians */
  setBody(bounce: number, pitch?: number, roll?: number): void;
  /** the sprung part (cabin + seats); wheels stay on the root group */
  body: THREE.Group;
  kind: string;
  /** axle distance (drive() derives the front-wheel steer angle from it) */
  wheelBase: number;
  /** front-wheel steer angle in radians (cars, bus, truck, bicycle) */
  setSteer?(a: number): void;
};

// ------------------------------------------------------------------ helpers
const lam = (color: THREE.ColorRepresentation, o: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const shade = (hex: string, dl: number, ds = 0) => { const c = new THREE.Color(hex), h = { h: 0, s: 0, l: 0 }; c.getHSL(h); c.setHSL(h.h, Math.min(1, Math.max(0, h.s + ds)), Math.min(1, Math.max(0, h.l + dl))); return `#${c.getHexString()}`; };
const glassMat = (tint = "#d4ecff", opacity = 0.17) => new THREE.MeshLambertMaterial({ color: tint, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (t: number) => t * t * (3 - 2 * t);
const frac = (x: number) => x - Math.floor(x);

function add<T extends THREE.Object3D>(parent: THREE.Object3D, o: T, x = 0, y = 0, z = 0): T { o.position.set(x, y, z); parent.add(o); return o; }
const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[]) => new THREE.Mesh(geo, mat);
const box = (p: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number) => add(p, mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z);
/** round rod from a to b (radius r1 at a, r2 at b) */
function rod(p: THREE.Object3D, a: V3, b: V3, r1: number, mat: THREE.Material, r2 = r1, seg = 8) {
  const A = new THREE.Vector3(...a), D = new THREE.Vector3(...b).sub(A), L = D.length();
  const m = mesh(new THREE.CylinderGeometry(r2, r1, L, seg), mat);
  m.position.copy(A).addScaledVector(D, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), D.normalize());
  p.add(m); return m;
}
/** square beam from a to b (crisp creases for the ink pass) */
function beam(p: THREE.Object3D, a: V3, b: V3, t: number, mat: THREE.Material, t2 = t) {
  const A = new THREE.Vector3(...a), D = new THREE.Vector3(...b).sub(A), L = D.length();
  const m = mesh(new THREE.BoxGeometry(t, L, t2), mat);
  m.position.copy(A).addScaledVector(D, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), D.normalize());
  p.add(m); return m;
}
/** side profile (XY) extruded across the width (Z), bevelled edges, exact outer size */
function slab(shape: THREE.Shape, width: number, mat: THREE.Material | THREE.Material[], bevel = 0.05, curveSegments = 14) {
  const depth = Math.max(0.01, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments });
  g.translate(0, 0, -depth / 2);
  return mesh(g, mat);
}
function roundRect(x0: number, y0: number, x1: number, y1: number, r: number) {
  const s = new THREE.Shape(), q = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  s.moveTo(x0 + q, y0); s.lineTo(x1 - q, y0); s.quadraticCurveTo(x1, y0, x1, y0 + q); s.lineTo(x1, y1 - q); s.quadraticCurveTo(x1, y1, x1 - q, y1);
  s.lineTo(x0 + q, y1); s.quadraticCurveTo(x0, y1, x0, y1 - q); s.lineTo(x0, y0 + q); s.quadraticCurveTo(x0, y0, x0 + q, y0);
  return s;
}
/** flat quad through 4 points (glass) */
function quad(a: V3, b: V3, c: V3, d: V3) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.computeVertexNormals();
  return g;
}
function glassMesh(geo: THREE.BufferGeometry, mat: THREE.Material) {
  const m = mesh(geo, mat);
  m.layers.set(NOINK); m.renderOrder = 2; m.userData.auditIgnore = true; m.userData.noShadow = true;
  return m;
}
/** after shadowed(): glass and lenses must not cast shadows */
function finishShadows(g: THREE.Object3D) {
  shadowed(g);
  g.traverse((o) => { if (o.userData.noShadow) { (o as THREE.Mesh).castShadow = false; } });
  return g;
}

// ------------------------------------------------------------------ wheels
type WheelRig = { steer: THREE.Group; spin: THREE.Group; r: number };
/** Chunky car wheel: rounded tyre, light rim, dark hub cap and 5 spokes on both faces (the spin reads in a still). */
function carWheel(R: number, w: number, o: { tire?: string; rim?: string; hub?: string } = {}): WheelRig {
  const steer = new THREE.Group(), spin = new THREE.Group(), inner = new THREE.Group();
  steer.add(spin); spin.add(inner); inner.rotation.x = Math.PI / 2; // build with the axle on Y, then lay it on Z
  const tire = lam(o.tire ?? "#2b2730"), rim = lam(o.rim ?? "#d9dde4"), hub = lam(o.hub ?? "#5a5f6e");
  const prof = [[R * 0.6, -w / 2], [R * 0.9, -w / 2], [R, -w * 0.28], [R, w * 0.28], [R * 0.9, w / 2], [R * 0.6, w / 2]].map(([x, y]) => new THREE.Vector2(x, y));
  inner.add(mesh(new THREE.LatheGeometry(prof, 24), tire));
  inner.add(mesh(new THREE.CylinderGeometry(R * 0.62, R * 0.62, w * 0.86, 20), rim));
  inner.add(mesh(new THREE.CylinderGeometry(R * 0.22, R * 0.24, w * 1.02, 12), hub));
  for (const sy of [-1, 1]) for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, sp = mesh(new THREE.BoxGeometry(R * 0.11, w * 0.08, R * 0.34), hub);
    sp.position.set(Math.sin(a) * R * 0.38, sy * w * 0.44, Math.cos(a) * R * 0.38); sp.rotation.y = a; inner.add(sp);
  }
  return { steer, spin, r: R };
}

// ------------------------------------------------------------------ lights
type LightRig = { head: THREE.MeshLambertMaterial[]; tail: THREE.MeshLambertMaterial[]; glow: THREE.MeshLambertMaterial[]; spots: THREE.SpotLight[] };
const newLights = (): LightRig => ({ head: [], tail: [], glow: [], spots: [] });
function setLightRig(L: LightRig, k: number) {
  L.head.forEach((m) => (m.emissiveIntensity = 0.12 + 2.6 * k));
  L.tail.forEach((m) => (m.emissiveIntensity = 0.12 + 1.7 * k));
  L.glow.forEach((m) => (m.emissiveIntensity = 0.2 + 1.6 * k));
  L.spots.forEach((s) => (s.intensity = 28 * k));
}
const lensMat = (L: LightRig, kind: "head" | "tail" | "glow", color: string, emissive: string) => { const m = lam(color, { emissive: new THREE.Color(emissive), emissiveIntensity: 0.12 }); L[kind].push(m); return m; };
function headSpot(root: THREE.Object3D, L: LightRig, at: V3) {
  const s = new THREE.SpotLight("#ffe9c2", 0, 26, 0.48, 0.65, 1.4);
  s.position.set(...at); s.castShadow = false;
  s.target.position.set(at[0] + 9, 0, at[2] * 1.6);
  root.add(s, s.target); L.spots.push(s);
}

// ------------------------------------------------------------------ cars
export type CarBody = "sedan" | "hatch" | "pickup" | "van" | "taxi" | "police";
type Rear = "trunk" | "hatch" | "box" | "bed";
type CarDims = {
  L: number; W: number; R: number; xw: [number, number]; yb: number; ys: number; yr: number; rt: number;
  /** cabin glass corners: rear at sill, rear at roof, front at roof, front at sill */
  cab: [number, number, number, number]; hoodY: number; deckY: number; rear: Rear; bedY?: number;
  bPillars: number[]; doorSeams: number[]; hip: number; seats: Record<string, [number, number]>;
};
const DIMS: Record<"sedan" | "hatch" | "pickup" | "van" | "bus" | "truck", CarDims> = {
  sedan: { L: 3.9, W: 1.78, R: 0.4, xw: [-1.25, 1.28], yb: 0.22, ys: 0.92, yr: 1.67, rt: 0.1, cab: [-1.3, -0.92, 0.48, 1.0], hoodY: 0.92, deckY: 0.9, rear: "trunk",
    bPillars: [-0.36], doorSeams: [0.92, -0.36, -1.18], hip: 0.64, seats: { driver: [0.14, -0.34], passenger: [0.14, 0.34], back: [-0.72, -0.04] } },
  hatch: { L: 3.45, W: 1.74, R: 0.4, xw: [-1.08, 1.1], yb: 0.22, ys: 0.92, yr: 1.67, rt: 0.1, cab: [-1.6, -1.42, 0.38, 0.85], hoodY: 0.92, deckY: 0.92, rear: "hatch",
    bPillars: [-0.42], doorSeams: [0.78, -0.42], hip: 0.64, seats: { driver: [0.06, -0.33], passenger: [0.06, 0.33], back: [-0.86, 0.0] } },
  pickup: { L: 4.7, W: 1.86, R: 0.46, xw: [-1.5, 1.45], yb: 0.3, ys: 1.05, yr: 1.83, rt: 0.11, cab: [-0.45, -0.4, 0.55, 1.08], hoodY: 1.05, deckY: 1.05, rear: "bed", bedY: 1.03,
    bPillars: [], doorSeams: [1.0, -0.38], hip: 0.78, seats: { driver: [0.06, -0.36], passenger: [0.06, 0.36] } },
  van: { L: 4.5, W: 1.9, R: 0.42, xw: [-1.45, 1.5], yb: 0.26, ys: 1.02, yr: 1.98, rt: 0.1, cab: [-2.12, -2.06, 1.05, 1.62], hoodY: 1.0, deckY: 1.02, rear: "box",
    bPillars: [0.36, -0.78], doorSeams: [1.54, 0.36, -0.6, -1.95], hip: 0.8, seats: { driver: [0.95, -0.4], passenger: [0.95, 0.4], back: [-0.24, -0.34], back2: [-1.32, 0.3] } },
  bus: { L: 8.6, W: 2.45, R: 0.5, xw: [-2.6, 2.75], yb: 0.32, ys: 1.42, yr: 2.48, rt: 0.18, cab: [-4.12, -4.1, 4.14, 4.28], hoodY: 1.42, deckY: 1.42, rear: "box",
    bPillars: [2.85, 1.45, 0.05, -1.35, -2.75], doorSeams: [3.95, 3.15, -3.9], hip: 1.2,
    seats: { driver: [3.55, -0.62], p1: [2.15, -0.55], p2: [0.75, 0.55], p3: [-0.65, -0.55], p4: [-2.05, 0.55], p5: [-3.45, -0.55] } },
  truck: { L: 6.6, W: 2.3, R: 0.5, xw: [-2.1, 2.35], yb: 0.42, ys: 1.38, yr: 2.28, rt: 0.14, cab: [1.2, 1.22, 3.0, 3.22], hoodY: 1.3, deckY: 1.38, rear: "bed", bedY: 1.14,
    bPillars: [], doorSeams: [3.12, 1.3], hip: 1.1, seats: { driver: [2.35, -0.52], passenger: [2.35, 0.52] } },
};

/** wheel-arch clearance over the tyre (arch top = R + (R + ARCH): keep it below the hood / deck / bed line) */
const ARCH = 0.06;
const archTop = (D: CarDims, x: number) => {
  const ra = D.R + ARCH;
  for (const xw of D.xw) if (Math.abs(x - xw) < ra) return D.R + Math.sqrt(ra * ra - (x - xw) ** 2);
  return D.yb;
};

/** The lower body as one solid: wheel arches cut out, bumper corners rounded, top at the sill (the opaque tub). */
function tubShape(D: CarDims) {
  const { L, yb, ys, R } = D, ra = R + ARCH, cb = 0.14, ct = 0.2;
  const [xr0, , , xf0] = D.cab;
  const s = new THREE.Shape();
  s.moveTo(-L / 2 + cb, yb);
  for (const xw of D.xw) { const t0 = Math.asin(clamp((yb - R) / ra, -1, 1)); s.absarc(xw, R, ra, Math.PI - t0, t0, true); }
  s.lineTo(L / 2 - cb, yb); s.quadraticCurveTo(L / 2, yb, L / 2, yb + cb);
  if (xf0 + 0.18 < L / 2 - ct) { // bonnet: front corner, hood line, cowl ramp up to the windscreen base
    s.lineTo(L / 2, D.hoodY - ct); s.quadraticCurveTo(L / 2, D.hoodY, L / 2 - ct, D.hoodY);
    s.lineTo(xf0 + 0.18, D.hoodY); s.lineTo(xf0, ys);
  } else { // flat front (bus, truck cab): the face rises to the sill, glass starts right there
    const c2 = Math.max(0.02, Math.min(ct, L / 2 - xf0));
    s.lineTo(L / 2, ys - c2); s.quadraticCurveTo(L / 2, ys, L / 2 - c2, ys);
    if (L / 2 - c2 > xf0 + 1e-3) s.lineTo(xf0, ys);
  }
  s.lineTo(xr0, ys);
  if (D.rear === "trunk") { s.lineTo(xr0 - 0.16, D.deckY); s.lineTo(-L / 2 + ct, D.deckY); s.quadraticCurveTo(-L / 2, D.deckY, -L / 2, D.deckY - ct); }
  else if (D.rear === "bed") { s.lineTo(xr0, D.bedY!); s.lineTo(-L / 2 + 0.06, D.bedY!); s.quadraticCurveTo(-L / 2, D.bedY!, -L / 2, D.bedY! - 0.06); }
  else { s.lineTo(-L / 2 + ct * 0.6, ys); s.quadraticCurveTo(-L / 2, ys, -L / 2, ys - ct * 0.6); }
  s.lineTo(-L / 2, yb + cb); s.quadraticCurveTo(-L / 2, yb, -L / 2 + cb, yb);
  return s;
}

type BuildOut = { root: THREE.Group; body: THREE.Group; wheels: WheelRig[]; front: WheelRig[]; lights: LightRig; seats: Record<string, Seat> };

/** Shared builder: tub + greenhouse (pillars, roof, glass) + interior deck + seams, bumpers, lights, mirrors, wheels. */
function buildBody(D: CarDims, o: { color: string; trim: string; seed: string; glassTint?: string; realLights?: boolean; roofColor?: string; plate?: string; tireW?: number }): BuildOut {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const paintM = lam(o.color), seamM = lam(shade(o.color, -0.2)), trimM = lam(o.trim), dark = lam("#2b2730"), interior = lam("#3b3346"), well = lam("#1d1922");
  const glass = glassMat(o.glassTint);
  const lights = newLights();
  const { L, W, R, ys, yr, rt } = D, [xr0, xr1, xf1, xf0] = D.cab, zc = W / 2 - 0.07, ra = R + ARCH;
  // tub (opaque up to the sill on every side: hides a seated card's legs from every angle)
  body.add(slab(tubShape(D), W, paintM, 0.06));
  const wellTop = Math.min(R + ra, D.hoodY, D.deckY, D.bedY ?? 99) - 0.03;
  for (const xw of D.xw) box(body, 2 * ra - 0.12, wellTop - D.yb - 0.02, W - 0.64, well, xw, (D.yb + wellTop) / 2, 0); // wheel wells: no see-through
  // interior deck at the sill (dark: reads as dashboard / door trim from above)
  box(body, xf0 - xr0 - 0.06, 0.03, 2 * zc - 0.04, interior, (xf0 + xr0) / 2, ys + 0.008, 0);
  box(body, 0.32, 0.12, 2 * zc - 0.1, interior, xf0 - 0.22, ys + 0.06, 0); // dashboard
  // greenhouse
  const P = 0.085;
  for (const sz of [-1, 1]) {
    const z = sz * zc;
    beam(body, [xf0, ys, z], [xf1, yr, z], P, paintM);
    beam(body, [xr0, ys, z], [xr1, yr, z], P * 1.3, paintM);
    for (const xb of D.bPillars) beam(body, [xb, ys, z], [xb, yr, z], P, paintM);
    beam(body, [xr1, yr - 0.02, z], [xf1, yr - 0.02, z], 0.07, paintM); // roof rail (crease under the roof)
    beam(body, [xr0, ys + 0.02, z], [xf0, ys + 0.02, z], 0.05, trimM); // window rubber / chrome sill
    const gs = new THREE.Shape(); gs.moveTo(xr0, ys); gs.lineTo(xf0, ys); gs.lineTo(xf1, yr); gs.lineTo(xr1, yr); gs.closePath();
    const sg = glassMesh(new THREE.ShapeGeometry(gs), glass); sg.position.z = z; body.add(sg);
  }
  body.add(glassMesh(quad([xf0, ys, -zc], [xf0, ys, zc], [xf1, yr, zc], [xf1, yr, -zc]), glass));
  body.add(glassMesh(quad([xr0, ys, zc], [xr0, ys, -zc], [xr1, yr, -zc], [xr1, yr, zc]), glass));
  beam(body, [xf0, ys + 0.02, -zc], [xf0, ys + 0.02, zc], 0.06, trimM); // cowl
  const roof = slab(roundRect(xr1 - 0.06, yr, xf1 + 0.05, yr + rt, rt * 0.7), 2 * zc + 0.1, lam(o.roofColor ?? o.color), 0.035);
  body.add(roof);
  // door seams (raised grooves: the ink pass draws them), handles, belt trim, rocker
  for (const sz of [-1, 1]) {
    const z = sz * (W / 2 + 0.004);
    for (const xs of D.doorSeams) { const y0 = archTop(D, xs) + 0.04, y1 = ys - 0.03; if (y1 - y0 > 0.12) box(body, 0.024, y1 - y0, 0.02, seamM, xs, (y0 + y1) / 2, z); }
    for (let i = 0; i < D.doorSeams.length - 1; i++) box(body, 0.15, 0.04, 0.05, trimM, D.doorSeams[i] - 0.2, ys - 0.13, sz * (W / 2 + 0.01));
    const rx0 = D.xw[0] + ra + 0.04, rx1 = D.xw[1] - ra - 0.04;
    if (rx1 > rx0) box(body, rx1 - rx0, 0.11, 0.04, dark, (rx0 + rx1) / 2, D.yb + 0.07, sz * (W / 2 + 0.005));
    // mirror on a stalk
    const mz = sz * (zc + 0.16);
    beam(body, [xf0 - 0.06, ys + 0.05, sz * zc], [xf0 - 0.08, ys + 0.1, mz], 0.03, dark);
    box(body, 0.08, 0.1, 0.16, paintM, xf0 - 0.1, ys + 0.12, mz);
  }
  // hood seam and trunk seam (lines across the top)
  if (xf0 < L / 2 - 0.4) box(body, 0.02, 0.014, W - 0.3, seamM, xf0 + 0.24, D.hoodY + 0.006, 0);
  if (D.rear === "trunk") box(body, 0.02, 0.014, W - 0.3, seamM, xr0 - 0.22, D.deckY + 0.006, 0);
  // bumpers
  const yb = D.yb;
  body.add(slab(roundRect(L / 2 - 0.14, yb - 0.02, L / 2 + 0.07, yb + 0.22, 0.08), W + 0.04, dark, 0.04));
  body.add(slab(roundRect(-L / 2 - 0.07, yb - 0.02, -L / 2 + 0.14, yb + 0.22, 0.08), W + 0.04, dark, 0.04));
  // face: headlights with bezels, grille, plate
  const hy = Math.min(D.hoodY - 0.16, yb + 0.42), hz = W / 2 - 0.27, headM = lensMat(lights, "head", "#fff7dc", "#ffe7a6");
  for (const sz of [-1, 1]) {
    const lens = mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.05, 18), headM); lens.rotation.z = Math.PI / 2; lens.userData.noShadow = true; add(body, lens, L / 2 + 0.012, hy, sz * hz);
    const bez = mesh(new THREE.TorusGeometry(0.12, 0.022, 6, 20), trimM); bez.rotation.y = Math.PI / 2; add(body, bez, L / 2 + 0.03, hy, sz * hz);
    if (o.realLights) headSpot(root, lights, [L / 2 + 0.1, hy, sz * hz]);
  }
  box(body, 0.03, 0.15, W * 0.34, dark, L / 2 + 0.008, hy - 0.02, 0);
  for (const dy of [-0.05, 0.02]) box(body, 0.035, 0.022, W * 0.34, trimM, L / 2 + 0.014, hy - 0.02 + dy, 0);
  const plateTex = textTexture(o.plate ?? o.seed.toUpperCase().slice(0, 6), { w: 256, h: 80, bg: "#f4f2ea", fg: "#22305a", border: "#22305a", font: "Arial Black, sans-serif" });
  const plateM = lam("#f4f2ea", { map: plateTex }), plateSide = lam("#f4f2ea");
  const fp = box(body, 0.02, 0.11, 0.34, [plateM, plateSide, plateSide, plateSide, plateSide, plateSide], L / 2 + 0.08, yb + 0.1, 0);
  const rp = box(body, 0.02, 0.11, 0.34, [plateSide, plateM, plateSide, plateSide, plateSide, plateSide], -L / 2 - 0.08, yb + 0.1, 0);
  void fp; void rp;
  // tail lights
  const tailM = lensMat(lights, "tail", "#e2483a", "#ff2a1a"), ty = Math.min(D.deckY - 0.14, yb + 0.48);
  for (const sz of [-1, 1]) { const t = box(body, 0.05, 0.13, 0.24, tailM, -L / 2 - 0.006, ty, sz * (W / 2 - 0.2)); t.userData.noShadow = true; }
  // wheels on the root (the body bounces over them)
  const tw = o.tireW ?? R * 0.62;
  const wheels: WheelRig[] = [], front: WheelRig[] = [];
  for (const xw of D.xw) for (const sz of [-1, 1]) {
    const wr = carWheel(R, tw);
    wr.steer.position.set(xw, R, sz * (W / 2 - tw / 2 + 0.02));
    if (sz < 0) wr.spin.rotation.y = Math.PI; // outer face out on both sides
    root.add(wr.steer); wheels.push(wr); if (xw === D.xw[1]) front.push(wr);
  }
  const seats: Record<string, Seat> = {};
  for (const [k, [x, z]] of Object.entries(D.seats)) seats[k] = { pos: [x, D.hip - 0.68, z], pose: "sit" };
  // steering wheel in front of the driver
  if (D.seats.driver) {
    const [dx, dz] = D.seats.driver, sw = mesh(new THREE.TorusGeometry(0.15, 0.028, 6, 18), dark);
    sw.rotation.set(0, Math.PI / 2, 0); sw.rotateX(-0.45); add(body, sw, dx + 0.5, ys + 0.1, dz);
  }
  return { root, body, wheels, front, lights, seats };
}

function wrap(kind: string, B: BuildOut, D: { L: number; W: number; R: number; H: number; wb: number }, extra?: { onDistance?: (d: number) => void; onLights?: (k: number) => void }): Vehicle {
  const flip = (w: WheelRig) => (w.spin.rotation.y !== 0 ? -1 : 1);
  return {
    group: finishShadows(B.root) as THREE.Group, seats: B.seats, length: D.L, width: D.W, height: D.H, wheelR: D.R, body: B.body, kind, wheelBase: D.wb,
    setDistance(d) { for (const w of B.wheels) w.spin.rotation.z = (-d / w.r) * flip(w); extra?.onDistance?.(d); },
    setLights(k) { setLightRig(B.lights, clamp(k)); extra?.onLights?.(k); },
    setBody(b, p = 0, r = 0) { B.body.position.y = b; B.body.rotation.set(r, 0, p); },
    setSteer(a) { for (const w of B.front) w.steer.rotation.y = a; },
  };
}

const checker = (a: string, b: string) => canvasTexture(`checker|${a}|${b}`, 256, 32, (g) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * 16, j * 16, 16, 16); } }, [3, 1]);

/** Modern toon car. body: sedan | hatch | pickup | van | taxi | police. Seats: driver, passenger (+ back; van: back, back2). */
export function car(o: { body?: CarBody; color?: string; trim?: string; seed?: string; realLights?: boolean; plate?: string } = {}): Vehicle {
  const kind = o.body ?? "sedan";
  const base = kind === "taxi" || kind === "police" ? "sedan" : kind;
  const D = DIMS[base];
  const color = o.color ?? { sedan: "#3f7fd6", hatch: "#e2483a", pickup: "#3f9a6a", van: "#f1e7d2", taxi: "#f5c21b", police: "#f4f6fa" }[kind];
  const trim = o.trim ?? (kind === "police" ? "#1f2a4a" : "#d9dde4");
  const B = buildBody(D, { color, trim, seed: o.seed ?? kind, realLights: o.realLights, plate: o.plate, roofColor: kind === "police" ? "#f4f6fa" : undefined });
  const { body, lights } = B, [xr0, xr1, xf1, xf0] = D.cab, zc = D.W / 2 - 0.07;
  void xr0; void xf0;
  if (kind === "taxi") {
    const signTex = textTexture("TAXI", { w: 256, h: 96, bg: "#ffe680", fg: "#1c1216", font: "Arial Black, sans-serif" });
    const signM = lam("#ffe680", { map: signTex, emissive: new THREE.Color("#ffd23f"), emissiveIntensity: 0.2 }), signSide = lam("#ffe680", { emissive: new THREE.Color("#ffd23f"), emissiveIntensity: 0.2 });
    lights.glow.push(signM, signSide);
    box(body, 0.62, 0.2, 0.26, [signSide, signSide, signSide, signSide, signM, signM], (xr1 + xf1) / 2, D.yr + D.rt + 0.1, 0);
    const chk = lam("#ffffff", { map: checker("#1c1216", "#f4efe6") });
    for (const sz of [-1, 1]) box(body, D.xw[1] - D.xw[0] - 1.1, 0.09, 0.02, chk, (D.xw[0] + D.xw[1]) / 2, D.ys - 0.12, sz * (D.W / 2 + 0.012));
  }
  if (kind === "police") {
    const tx = textTexture("POLICE", { w: 512, h: 96, bg: "#1f3f8a", fg: "#ffffff", font: "Arial Black, sans-serif" });
    const band = lam("#ffffff", { map: tx }), bandSide = lam("#1f3f8a");
    const x0 = D.xw[0] + D.R + 0.12, x1 = D.xw[1] - D.R - 0.12;
    box(body, x1 - x0, 0.2, D.W + 0.024, [bandSide, bandSide, bandSide, bandSide, band, band], (x0 + x1) / 2, D.yb + 0.42, 0);
    const red = lensMat(lights, "glow", "#ff5a4a", "#ff2a1a"), blue = lensMat(lights, "glow", "#5a8aff", "#2a5aff");
    const by = D.yr + D.rt + 0.06, bx = (xr1 + xf1) / 2 + 0.1;
    box(body, 0.26, 0.06, 1.12, lam("#2b2730"), bx, by - 0.02, 0);
    box(body, 0.24, 0.1, 0.46, red, bx, by + 0.04, -0.3).userData.noShadow = true;
    box(body, 0.24, 0.1, 0.46, blue, bx, by + 0.04, 0.3).userData.noShadow = true;
  }
  if (kind === "pickup") {
    const bedM = lam(shade(color, -0.06)), x0 = -D.L / 2 + 0.02, x1 = D.cab[0] - 0.08, top = D.ys + 0.22, by = D.bedY!;
    for (const sz of [-1, 1]) box(body, x1 - x0, top - by, 0.1, bedM, (x0 + x1) / 2, (top + by) / 2, sz * (D.W / 2 - 0.05));
    box(body, 0.1, top - by, D.W - 0.04, bedM, x0 + 0.05, (top + by) / 2, 0); // tailgate
    box(body, 0.08, top - by, D.W - 0.04, bedM, x1, (top + by) / 2, 0);
    for (const sz of [-1, 1]) box(body, x1 - x0, 0.03, 0.14, lam(o.trim ?? "#d9dde4"), (x0 + x1) / 2, top + 0.01, sz * (D.W / 2 - 0.05)); // rail caps
    const c1 = crate(0.62, { seed: (o.seed ?? "pk") + "a" }); c1.position.set(-1.5, by, -0.3); body.add(c1);
    const c2 = crate(0.5, { seed: (o.seed ?? "pk") + "b" }); c2.position.set(-0.95, by, 0.35); body.add(c2);
  }
  if (kind === "van") {
    const stripe = lam(o.trim ?? "#e2483a");
    for (const sz of [-1, 1]) box(body, D.L - 0.5, 0.12, 0.02, stripe, -0.05, D.ys - 0.2, sz * (D.W / 2 + 0.012));
    box(body, (xf1 - xr1) * 0.7, 0.05, 0.08, lam("#2b2730"), (xr1 + xf1) / 2, D.yr + D.rt + 0.04, -zc + 0.1);
    box(body, (xf1 - xr1) * 0.7, 0.05, 0.08, lam("#2b2730"), (xr1 + xf1) / 2, D.yr + D.rt + 0.04, zc - 0.1);
  }
  const H = D.yr + D.rt + (kind === "taxi" ? 0.2 : kind === "police" ? 0.12 : 0);
  return wrap(kind, B, { L: D.L, W: D.W, R: D.R, H, wb: D.xw[1] - D.xw[0] });
}

/** City bus. Seats: driver, p1..p5 (window seats alternating sides). */
export function bus(o: { color?: string; trim?: string; seed?: string; route?: string; realLights?: boolean } = {}): Vehicle {
  const D = DIMS.bus, color = o.color ?? "#f2b430";
  const B = buildBody(D, { color, trim: o.trim ?? "#d9dde4", seed: o.seed ?? "bus", realLights: o.realLights, roofColor: "#f4f2ea", tireW: 0.34 });
  const { body, lights } = B;
  const tx = textTexture(o.route ?? "12 CITY", { w: 512, h: 96, bg: "#1c1820", fg: "#ffb43a", font: "Arial Black, sans-serif" });
  const sign = lam("#ffffff", { map: tx, emissive: new THREE.Color("#ffb43a"), emissiveMap: tx, emissiveIntensity: 0.2 });
  lights.glow.push(sign);
  const side = lam("#1c1820");
  box(body, 0.06, 0.22, 1.7, [sign, side, side, side, side, side], D.cab[2] + 0.1, D.yr + D.rt * 0.5, 0);
  const stripe = lam(o.trim ?? "#e2483a");
  for (const sz of [-1, 1]) box(body, D.L - 0.6, 0.14, 0.02, stripe, 0, D.ys - 0.22, sz * (D.W / 2 + 0.012));
  return wrap("bus", B, { L: D.L, W: D.W, R: D.R, H: D.yr + D.rt, wb: D.xw[1] - D.xw[0] });
}

/** Box truck with a cab; `load` is painted on both sides of the box. Seats: driver, passenger. */
export function truck(o: { color?: string; boxColor?: string; load?: string; loadColor?: string; trim?: string; seed?: string; realLights?: boolean } = {}): Vehicle {
  const D = DIMS.truck, color = o.color ?? "#d9534f";
  const B = buildBody(D, { color, trim: o.trim ?? "#d9dde4", seed: o.seed ?? "truck", realLights: o.realLights, tireW: 0.34 });
  const { body } = B, x0 = -D.L / 2 + 0.02, x1 = D.cab[0] - 0.1, y0 = D.bedY! + 0.02, y1 = 3.35, bc = o.boxColor ?? "#f4efe6";
  const tex = textTexture(o.load ?? "FRESH BREAD", { w: 1024, h: Math.round((1024 * (y1 - y0)) / (x1 - x0)), bg: bc, fg: o.loadColor ?? "#c0392b", border: o.loadColor ?? "#c0392b", font: "Arial Black, sans-serif" });
  const face = lam("#ffffff", { map: tex }), plain = lam(bc), edge = lam(shade(bc, -0.25));
  box(body, x1 - x0, y1 - y0, D.W, [plain, plain, plain, plain, face, face], (x0 + x1) / 2, (y0 + y1) / 2, 0);
  for (const x of [x0, x1]) for (const sz of [-1, 1]) box(body, 0.08, y1 - y0 + 0.02, 0.08, edge, x, (y0 + y1) / 2, sz * D.W / 2); // corner posts
  for (const sz of [-1, 1]) for (const y of [y0, y1]) box(body, x1 - x0, 0.07, 0.08, edge, (x0 + x1) / 2, y, sz * D.W / 2); // rails
  box(body, 0.02, y1 - y0 - 0.2, 0.025, edge, x0 - 0.01, (y0 + y1) / 2, 0); // rear door split
  for (const sz of [-1, 1]) box(body, 0.04, 0.5, 0.05, lam("#5a5f6e"), x0 - 0.03, (y0 + y1) / 2, sz * 0.3); // latch bars
  box(body, 0.6, 0.35, D.W - 0.2, lam(color), D.cab[0] + 0.25, D.yr + D.rt + 0.17, 0); // air deflector over the cab
  return wrap("truck", B, { L: D.L, W: D.W, R: D.R, H: y1, wb: D.xw[1] - D.xw[0] });
}

// ------------------------------------------------------------------ horse
export type Gait = "walk" | "trot" | "stand";
export type Horse = { group: THREE.Group; /** stride phase (1 = one full stride); gait default from the options */ setGait(phase: number, gait?: Gait): void; stride: Record<Gait, number> };
const GAITS: Record<Gait, { duty: number; off: [number, number, number, number]; stride: number; knee: number; nod: number }> = {
  // offsets for LF, RF, LH, RH (walk = lateral 4-beat, trot = diagonal pairs)
  walk: { duty: 0.62, off: [0.25, 0.75, 0, 0.5], stride: 1.35, knee: 0.95, nod: 0.06 },
  trot: { duty: 0.45, off: [0, 0.5, 0.5, 0], stride: 2.5, knee: 1.35, nod: 0.03 },
  stand: { duty: 1, off: [0, 0, 0, 0], stride: 1, knee: 0, nod: 0 },
};
/** Low-poly toon horse (bay by default): barrel, haunch, chest, neck + mane fin, big-eyed head with ears and muzzle,
 *  tail, 4 two-segment legs. setGait(phase) poses the legs (walk / trot) and keeps the lowest hoof on the ground. */
export function horse(o: { color?: string; mane?: string; socks?: boolean; blaze?: boolean; harness?: boolean; gait?: Gait } = {}): Horse {
  const coatC = o.color ?? "#a5653c", coat = lam(coatC), maneM = lam(o.mane ?? "#2e211c"), hoofM = lam("#3a3036"), muzzleM = lam(shade(coatC, -0.1, -0.05));
  const white = lam("#f6f1e8"), pupil = lam("#1c1216"), leather = lam("#4a2e22"), brass = lam("#d8b04a");
  const g = new THREE.Group(), torso = new THREE.Group(); g.add(torso);
  const barrel = mesh(new THREE.CapsuleGeometry(0.36, 0.95, 6, 16), coat); barrel.rotation.z = Math.PI / 2; barrel.scale.set(1.04, 1, 0.9); add(torso, barrel, 0, 1.22, 0);
  const rump = mesh(new THREE.SphereGeometry(0.39, 16, 12), coat); rump.scale.set(1, 0.98, 0.9); add(torso, rump, -0.5, 1.28, 0);
  const chest = mesh(new THREE.SphereGeometry(0.35, 16, 12), coat); chest.scale.set(1, 1, 0.88); add(torso, chest, 0.52, 1.22, 0);
  // neck (pivot at the withers) -> head (pivot at the poll)
  const neck = add(torso, new THREE.Group(), 0.6, 1.36, 0);
  rod(neck, [0, 0, 0], [0.36, 0.58, 0], 0.25, coat, 0.15, 12);
  const crest = (t: number, out: number): [number, number] => { const ax = 0.36 * t, ay = 0.58 * t, r = 0.25 + (0.15 - 0.25) * t; const px = -0.85, py = 0.53; return [ax + px * (r + out), ay + py * (r + out)]; };
  const ms = new THREE.Shape(); { const n = 6; ms.moveTo(...crest(1.05, -0.06)); for (let i = n; i >= 0; i--) { const t = i / n; ms.lineTo(...crest(t + 0.04, 0.13)); ms.lineTo(...crest(t - 0.05, 0.03)); } ms.lineTo(...crest(-0.05, -0.06)); ms.closePath(); }
  const maneMesh = slab(ms, 0.12, maneM, 0.025, 4); neck.add(maneMesh);
  const head = add(neck, new THREE.Group(), 0.38, 0.62, 0); head.scale.setScalar(1.12);
  rod(head, [0, 0, 0], [0.34, -0.36, 0], 0.155, coat, 0.115, 12);
  const jowl = mesh(new THREE.SphereGeometry(0.15, 14, 10), coat); jowl.scale.set(1, 1, 0.85); add(head, jowl, 0.05, -0.08, 0);
  const muzzle = mesh(new THREE.SphereGeometry(0.13, 14, 10), muzzleM); muzzle.scale.set(1.05, 0.92, 0.95); add(head, muzzle, 0.36, -0.38, 0);
  for (const sz of [-1, 1]) {
    add(head, mesh(new THREE.SphereGeometry(0.022, 8, 6), pupil), 0.44, -0.37, sz * 0.06); // nostril
    const eye = add(head, mesh(new THREE.SphereGeometry(0.05, 12, 10), white), 0.08, -0.03, sz * 0.115);
    add(eye, mesh(new THREE.SphereGeometry(0.034, 10, 8), pupil), 0.016, 0, sz * 0.024);
    const ear = mesh(new THREE.ConeGeometry(0.05, 0.17, 6), coat); ear.rotation.set(sz * -0.25, 0, -0.2); add(head, ear, -0.03, 0.15, sz * 0.07);
  }
  const fore = mesh(new THREE.ConeGeometry(0.05, 0.16, 6), maneM); fore.rotation.z = -2.2; add(head, fore, 0.06, 0.08, 0);
  if (o.blaze) { const bl = mesh(new THREE.BoxGeometry(0.36, 0.05, 0.07), white); bl.rotation.z = -0.81; add(head, bl, 0.27, -0.08, 0); } // white stripe down the face
  // tail
  const tail = add(torso, new THREE.Group(), -0.86, 1.42, 0);
  rod(tail, [0, 0, 0], [-0.13, -0.28, 0], 0.06, maneM, 0.11, 8);
  rod(tail, [-0.13, -0.28, 0], [-0.1, -0.8, 0], 0.11, maneM, 0.04, 8);
  // legs: [hip/shoulder group, knee/hock group, front?]
  type Leg = { top: THREE.Group; knee: THREE.Group; front: boolean; y: number; L1: [number, number]; L2: [number, number] };
  const legs: Leg[] = [];
  const mkLeg = (front: boolean, z: number): Leg => {
    const y = front ? 1.1 : 1.2, L1: [number, number] = front ? [0, -0.5] : [-0.08, -0.55], L2: [number, number] = front ? [0, -0.5] : [0.08, -0.55];
    const top = add(torso, new THREE.Group(), front ? 0.55 : -0.58, y, z);
    rod(top, [0, 0.08, 0], [L1[0], L1[1], 0], front ? 0.12 : 0.17, coat, front ? 0.075 : 0.085, 10);
    const knee = add(top, new THREE.Group(), L1[0], L1[1], 0);
    add(knee, mesh(new THREE.SphereGeometry(front ? 0.078 : 0.088, 10, 8), coat), 0, 0, 0);
    rod(knee, [0, 0, 0], [L2[0], L2[1], 0], 0.062, o.socks ? white : coat, 0.06, 8);
    add(knee, mesh(new THREE.SphereGeometry(0.072, 10, 8), o.socks ? white : coat), L2[0], L2[1], 0);
    rod(knee, [L2[0], L2[1] - 0.02, 0], [L2[0], L2[1] - 0.1, 0], 0.075, hoofM, 0.092, 10);
    return { top, knee, front, y, L1, L2 };
  };
  legs.push(mkLeg(true, -0.17), mkLeg(true, 0.17), mkLeg(false, -0.18), mkLeg(false, 0.18)); // LF, RF, LH, RH (left = -Z)
  if (o.harness) {
    const collar = mesh(new THREE.TorusGeometry(0.27, 0.06, 8, 20), leather); collar.rotation.set(0, Math.PI / 2, -0.55); add(neck, collar, 0.06, 0.1, 0);
    for (const sz of [-1, 1]) add(neck, mesh(new THREE.SphereGeometry(0.035, 8, 6), brass), 0.02, 0.32, sz * 0.18);
    const girth = mesh(new THREE.TorusGeometry(0.38, 0.035, 6, 24), leather); girth.rotation.y = Math.PI / 2; girth.scale.set(0.92, 1.04, 1); add(torso, girth, 0.28, 1.22, 0);
    box(torso, 0.4, 0.06, 0.5, leather, 0.28, 1.6, 0); // saddle pad
    const nose = mesh(new THREE.TorusGeometry(0.135, 0.022, 6, 16), leather); nose.rotation.set(0, Math.PI / 2, 0.8); add(head, nose, 0.26, -0.27, 0);
  }
  const gait0 = o.gait ?? "walk";
  const legY = (l: Leg, a: number, b: number) => {
    const [ux, uy] = l.L1, [vx, vy] = l.L2;
    return l.y + (ux * Math.sin(a) + uy * Math.cos(a)) + (vx * Math.sin(a + b) + vy * Math.cos(a + b)) - 0.1 * Math.cos(a + b);
  };
  return {
    group: shadowed(g), stride: { walk: GAITS.walk.stride, trot: GAITS.trot.stride, stand: 1 },
    setGait(phase, gait = gait0) {
      const G = GAITS[gait], A = gait === "stand" ? 0 : Math.asin(clamp((G.stride * G.duty) / 2.2, 0, 0.9));
      let low = Infinity;
      legs.forEach((l, i) => {
        const p = frac(phase + G.off[i]);
        let a = 0, b = 0;
        if (gait !== "stand") {
          if (p < G.duty) a = A * (1 - (2 * p) / G.duty);
          else { const s = (p - G.duty) / (1 - G.duty); a = -A + 2 * A * smooth(s); b = (l.front ? -1 : 0.8) * G.knee * Math.sin(Math.PI * s); }
        }
        l.top.rotation.z = a; l.knee.rotation.z = b;
        low = Math.min(low, legY(l, a, b));
      });
      torso.position.y = -low;
      neck.rotation.z = G.nod * Math.sin(Math.PI * 4 * phase);
      tail.rotation.x = 0.12 * Math.sin(Math.PI * 2 * phase);
    },
  };
}

// ------------------------------------------------------------------ carriage
/**
 * Horse-drawn coach (17th-19th c.): spoked wheels (big rear, small front), curved body on springs, coachman's box.
 * closed: roof, corner + door posts, glass; seats driver, insideL, inside (door window), insideR.
 * open (barouche): no roof, folded hood; seats driver, inside, insideR -- top hats fit here.
 * horses: 0 | 1 (shafts) | 2 (pole, side by side); the horses walk with setDistance (no extra state).
 */
export function carriage(o: { color?: string; trim?: string; open?: boolean; horses?: 0 | 1 | 2; horseColor?: string | string[]; gait?: Gait; seed?: string; realLights?: boolean } = {}): Vehicle & { horses: Horse[] } {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const col = o.color ?? "#7a2a35", trimC = o.trim ?? "#d8b04a", open = !!o.open;
  const paintM = lam(col), trimM = lam(trimC), dark = lam("#2b2228"), wood = lam("#5a3c2e"), velvet = lam("#5a2440"), roofM = lam("#2b2730");
  const lights = newLights();
  const W = 1.45, X = 1.15, ys = open ? 1.46 : 1.56, hip = ys - 0.36, yBot = hip - 0.4, yEnd = yBot + 0.26, zc = W / 2 - 0.05;
  // body: flat belly between the seats, curving up to the ends, bulged front/back panels
  const s = new THREE.Shape();
  s.moveTo(-X, yEnd); s.quadraticCurveTo(-X + 0.06, yBot, -X + 0.34, yBot); s.lineTo(X - 0.34, yBot); s.quadraticCurveTo(X - 0.06, yBot, X, yEnd);
  s.quadraticCurveTo(X + 0.13, (yEnd + ys) / 2, X + 0.03, ys); s.lineTo(-X - 0.03, ys); s.quadraticCurveTo(-X - 0.13, (yEnd + ys) / 2, -X, yEnd);
  body.add(slab(s, W, paintM, 0.05));
  box(body, 2 * X - 0.1, 0.03, 2 * zc - 0.04, velvet, 0, ys + 0.008, 0); // interior deck
  for (const sz of [-1, 1]) {
    const z = sz * (W / 2 + 0.006);
    beam(body, [-X - 0.04, ys - 0.02, z], [X + 0.04, ys - 0.02, z], 0.05, trimM); // waist moulding
    for (const xs of [-0.36, 0.36]) box(body, 0.03, ys - yBot - 0.12, 0.02, trimM, xs, (ys + yBot + 0.06) / 2, z); // door outline
    box(body, 0.72, 0.03, 0.02, trimM, 0, yBot + 0.08, z);
    const crest = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), trimM); crest.rotation.x = Math.PI / 2; add(body, crest, 0, (ys + yBot) / 2 + 0.02, z);
    box(body, 0.12, 0.035, 0.05, trimM, 0.24, ys - 0.15, sz * (W / 2 + 0.015)); // handle
    const step = box(body, 0.34, 0.03, 0.18, dark, 0, yBot - 0.16, sz * (W / 2 + 0.12)); void step;
    beam(body, [0, yBot, sz * W / 2], [0, yBot - 0.16, sz * (W / 2 + 0.12)], 0.03, dark);
  }
  const yr = 2.28, glass = glassMat("#e2f0ff", 0.15);
  if (!open) {
    for (const sz of [-1, 1]) {
      const z = sz * zc;
      for (const x of [-X + 0.05, X - 0.05]) beam(body, [x, ys, z], [x, yr, z], 0.09, paintM);
      for (const x of [-0.36, 0.36]) beam(body, [x, ys, z], [x, yr, z], 0.07, paintM);
      beam(body, [-X, yr - 0.03, z], [X, yr - 0.03, z], 0.07, paintM);
      const gs = new THREE.Shape(); gs.moveTo(-X, ys); gs.lineTo(X, ys); gs.lineTo(X, yr); gs.lineTo(-X, yr); gs.closePath();
      const sg = glassMesh(new THREE.ShapeGeometry(gs), glass); sg.position.z = z; body.add(sg);
    }
    box(body, 0.06, yr - ys, 2 * zc, paintM, -X + 0.02, (ys + yr) / 2, 0); // solid back wall
    body.add(glassMesh(quad([X - 0.02, ys, -zc], [X - 0.02, ys, zc], [X - 0.02, yr, zc], [X - 0.02, yr, -zc]), glass));
    body.add(slab(roundRect(-X - 0.12, yr, X + 0.12, yr + 0.13, 0.08), W + 0.16, roofM, 0.04));
    for (const sz of [-1, 1]) beam(body, [-X + 0.05, yr + 0.22, sz * 0.62], [X - 0.05, yr + 0.22, sz * 0.62], 0.035, trimM); // luggage rail
    for (const x of [-X + 0.06, 0, X - 0.06]) for (const sz of [-1, 1]) beam(body, [x, yr + 0.13, sz * 0.62], [x, yr + 0.22, sz * 0.62], 0.03, trimM);
    const tr = crate(0.42, { color: "#8a5a34", seed: (o.seed ?? "co") + "t" }); tr.position.set(-0.4, yr + 0.13, 0); body.add(tr);
  } else {
    // folded leather hood at the back (bellows)
    const hood = mesh(new THREE.CylinderGeometry(0.42, 0.42, W - 0.04, 16, 1, false, 0, Math.PI / 2), roofM); hood.rotation.x = Math.PI / 2; hood.rotation.z = Math.PI / 2;
    add(body, hood, -X + 0.04, ys, 0);
    for (const sz of [-1, 1]) beam(body, [-X + 0.1, ys + 0.02, sz * zc], [X - 0.05, ys + 0.02, sz * zc], 0.06, wood); // top rail
    box(body, 0.06, 0.3, 2 * zc, paintM, -X + 0.15, ys + 0.15, 0); // seat back
  }
  // coachman's box (boot) + seat + footboard
  const bx = X + 0.28;
  box(body, 0.56, 0.62, 1.12, paintM, bx, 1.27, 0);
  box(body, 0.6, 0.08, 1.18, velvet, bx - 0.02, 1.62, 0);
  box(body, 0.06, 0.16, 1.1, paintM, bx - 0.28, 1.72, 0); // low seat back: never covers the front passenger
  beam(body, [bx + 0.3, 1.0, 0], [bx + 0.62, 1.32, 0], 0.05, wood, 1.0); // footboard
  for (const sz of [-1, 1]) beam(body, [bx + 0.3, 0.98, sz * 0.48], [bx + 0.3, 1.58, sz * 0.48], 0.05, dark);
  // lamps on brackets at the sides of the coachman's box (below every passenger's face)
  for (const sz of [-1, 1]) {
    const lx = bx + 0.12, ly = 1.4, lz = sz * 0.7;
    const lp = lantern({ color: "#2b2730" }); add(body, lp, lx, ly, lz);
    const m = (lp.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial; m.emissiveIntensity = 0.2; lights.glow.push(m);
    beam(body, [lx, ly - 0.2, sz * 0.56], [lx, ly - 0.2, lz], 0.03, dark);
    if (o.realLights) { const pl = new THREE.PointLight("#ffd79a", 0, 6, 1.5); pl.position.set(lx, ly, sz * 0.75); root.add(pl); lights.spots.push(pl as unknown as THREE.SpotLight); }
  }
  // running gear on the root: wheels, axles, perch, springs
  const rr = 0.7, rf = 0.5, xr = -0.82, xf = X + 0.24, wz = W / 2 + 0.14;
  const wheels: { g: THREE.Group; r: number }[] = [];
  for (const [x, r] of [[xr, rr], [xf, rf]] as [number, number][]) {
    for (const sz of [-1, 1]) { const wh = spokedWheel(r, { color: "#3b2a24", spokes: 12, tube: 0.045 }); wh.position.set(x, r, sz * wz); root.add(wh); wheels.push({ g: wh, r }); }
    const ax = mesh(new THREE.CylinderGeometry(0.04, 0.04, 2 * wz + 0.1, 8), dark); ax.rotation.x = Math.PI / 2; add(root, ax, x, r, 0);
    for (const sz of [-1, 1]) { const sp = mesh(new THREE.TorusGeometry(0.2, 0.028, 6, 16), dark); sp.scale.set(1, 0.38, 1); add(root, sp, x, (r + (x < 0 ? yBot : 0.96)) / 2 + 0.04, sz * 0.5); }
  }
  beam(root, [xr, 0.58, 0], [xf + 0.1, 0.58, 0], 0.09, wood);
  const seats: Record<string, Seat> = { driver: { pos: [bx - 0.02, 1.66 + 0.04 - 0.68, 0], pose: "sit" } };
  if (open) { seats.inside = { pos: [-0.55, hip - 0.68, 0], pose: "sit" }; seats.insideR = { pos: [0.55, hip - 0.68, 0], pose: "sit" }; }
  else { seats.insideL = { pos: [-0.74, hip - 0.68, 0.08], pose: "sit" }; seats.inside = { pos: [0, hip - 0.68, -0.05], pose: "sit" }; seats.insideR = { pos: [0.74, hip - 0.68, 0.08], pose: "sit" }; }
  // horses + shafts / pole + traces + reins
  const nH = o.horses ?? 1, horses: Horse[] = [], hx = bx + 1.75;
  const cols = Array.isArray(o.horseColor) ? o.horseColor : [o.horseColor ?? "#a5653c", o.horseColor ?? "#5a3a2a"];
  for (let i = 0; i < nH; i++) {
    const h = horse({ color: cols[i % cols.length], harness: true, gait: o.gait, socks: i === 1, blaze: i === 0 });
    h.group.position.set(hx, 0, nH === 2 ? (i ? 0.5 : -0.5) : 0); root.add(h.group); horses.push(h);
  }
  if (nH === 1) for (const sz of [-1, 1]) { beam(root, [bx + 0.15, 0.95, sz * 0.47], [hx + 0.75, 1.3, sz * 0.47], 0.05, wood); }
  if (nH === 2) { beam(root, [bx + 0.1, 0.8, 0], [hx + 1.0, 1.15, 0], 0.07, wood); beam(root, [bx + 0.45, 0.95, -0.85], [bx + 0.45, 0.95, 0.85], 0.06, wood); }
  for (const h of horses) for (const sz of [-1, 1]) {
    const hz = h.group.position.z;
    beam(root, [hx + 0.55, 1.32, hz + sz * 0.37], [bx + 0.45, 0.95, hz + sz * (nH === 2 ? 0.3 : 0.4)], 0.025, lam("#3b2a22"));
    const a = new THREE.Vector3(bx + 0.35, 1.95, sz * 0.12), b = new THREE.Vector3(hx + 1.32, 1.62, hz + sz * 0.14);
    const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.28, 0));
    root.add(mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 20, 0.012, 5), lam("#3b2a22")));
  }
  finishShadows(root);
  const stride = horses[0]?.stride[o.gait ?? "walk"] ?? 1.35;
  const v: Vehicle & { horses: Horse[] } = {
    group: root, seats, length: nH ? hx + 1.6 + X : 2 * X + 0.9, width: nH === 2 ? 1.9 : W + 0.4, height: open ? 2.0 : yr + 0.35, wheelR: rr, body, kind: open ? "carriage-open" : "carriage", wheelBase: xf - xr, horses,
    setDistance(d) { for (const w of wheels) w.g.rotation.z = -d / w.r; horses.forEach((h, i) => h.setGait(d / stride + i * 0.08)); },
    setLights(k) { setLightRig(lights, clamp(k)); lights.spots.forEach((s2) => (s2.intensity = 6 * clamp(k))); },
    setBody(b, p = 0, r = 0) { body.position.y = b; body.rotation.set(r, 0, p); },
  };
  v.setDistance(0);
  return v;
}

// ------------------------------------------------------------------ bicycle
/** Pose for the bicycle's `rider` seat (hands on the bar, feet on the pedals); seatPose() uses it. */
export const RIDE_POSE: KPose = { view: "side", lean: 10, limbs: { footL: [0.42, -0.98], footR: [0.02, -0.82], handR: [0.8, 0.12], handL: [0.76, 0.1] } };
/** Upright city bicycle with a basket. Seat: rider (nudged toward the camera so the near leg draws over the frame). */
export function bicycle(o: { color?: string; seed?: string; basket?: boolean } = {}): Vehicle {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const frame = lam(o.color ?? "#2fb3a6"), dark = lam("#2b2730"), metal = lam("#c9ced8"), leather = lam("#5a3a26");
  const lights = newLights(), R = 0.34;
  const wheels: THREE.Group[] = [];
  for (const x of [-0.52, 0.52]) { const steer = add(root, new THREE.Group(), x, R, 0); const w = spokedWheel(R, { color: "#2b2730", spokes: 16, tube: 0.034 }); steer.add(w); wheels.push(w); }
  const rA: V3 = [-0.52, R, 0], bb: V3 = [-0.02, 0.3, 0], st: V3 = [-0.16, 0.84, 0], ht: V3 = [0.36, 0.92, 0], hb: V3 = [0.41, 0.74, 0], fA: V3 = [0.52, R, 0];
  const t = 0.026;
  rod(body, st, ht, t, frame); rod(body, bb, hb, t * 1.15, frame); rod(body, bb, st, t, frame); rod(body, ht, hb, t * 1.3, frame);
  for (const sz of [-1, 1]) { rod(body, bb, [rA[0], rA[1], sz * 0.05], t * 0.8, frame); rod(body, st, [rA[0], rA[1], sz * 0.05], t * 0.8, frame); rod(body, hb, [fA[0], fA[1], sz * 0.05], t * 0.9, frame); }
  rod(body, st, [-0.19, 0.97, 0], 0.016, metal);
  const saddle = mesh(new THREE.CapsuleGeometry(0.06, 0.14, 4, 8), leather); saddle.rotation.z = Math.PI / 2; saddle.scale.set(0.6, 1, 1.15); add(body, saddle, -0.18, 0.99, 0);
  rod(body, ht, [0.32, 1.06, 0], 0.018, metal);
  rod(body, [0.32, 1.06, -0.27], [0.32, 1.06, 0.27], 0.016, metal);
  for (const sz of [-1, 1]) rod(body, [0.3, 1.06, sz * 0.2], [0.27, 1.06, sz * 0.3], 0.024, dark);
  for (const x of [-0.52, 0.52]) { const f = mesh(new THREE.TorusGeometry(R + 0.06, 0.02, 4, 20, 2.0), frame); f.rotation.z = 0.5; add(body, f, x, R, 0); } // fenders
  const crank = add(body, new THREE.Group(), bb[0], bb[1], 0);
  const ring = mesh(new THREE.TorusGeometry(0.09, 0.016, 6, 18), metal); add(crank, ring, 0, 0, 0.06);
  for (const s2 of [-1, 1]) { rod(crank, [0, 0, s2 * 0.07], [0, s2 * 0.16, s2 * 0.07], 0.014, metal); box(crank, 0.1, 0.025, 0.08, dark, 0, s2 * 0.16, s2 * 0.12); }
  if (o.basket !== false) { const bk = box(body, 0.26, 0.2, 0.32, lam("#b98a52"), 0.55, 0.98, 0); void bk; box(body, 0.27, 0.03, 0.33, lam("#8a5a34"), 0.55, 1.08, 0); }
  const lamp = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.06, 12), lensMat(lights, "head", "#fff7dc", "#ffe7a6")); lamp.rotation.z = Math.PI / 2; lamp.userData.noShadow = true; add(body, lamp, 0.42, 0.95, 0);
  box(body, 0.02, 0.05, 0.06, lensMat(lights, "tail", "#e2483a", "#ff2a1a"), -0.68, 0.62, 0).userData.noShadow = true;
  finishShadows(root);
  const seats: Record<string, Seat> = { rider: { pos: [-0.17, 1.01 - 0.68, 0], pose: "sit", nudge: 0.14 } };
  return {
    group: root, seats, length: 1.8, width: 0.6, height: 1.1, wheelR: R, body, kind: "bicycle", wheelBase: 1.04,
    setDistance(d) { for (const w of wheels) w.rotation.z = -d / R; crank.rotation.z = -d / R / 2.2; },
    setLights(k) { setLightRig(lights, clamp(k)); },
    setBody(b, p = 0, r = 0) { body.position.y = b; body.rotation.set(r, 0, p); },
    setSteer(a) { (wheels[1].parent as THREE.Group).rotation.y = a; },
  };
}

// ------------------------------------------------------------------ driving + seats
const CURVES = new WeakMap<V3[], THREE.Curve<THREE.Vector3>>();
function pathCurve(path: V3[]) {
  let c = CURVES.get(path);
  if (!c) {
    const pts = path.map((p) => new THREE.Vector3(...p));
    c = pts.length < 3 ? new THREE.LineCurve3(pts[0], pts[1]) : new THREE.CatmullRomCurve3(pts, false, "centripetal");
    c.arcLengthDivisions = 600;
    CURVES.set(path, c);
  }
  return c;
}
const headingOf = (t: THREE.Vector3) => Math.atan2(-t.z, t.x);
/**
 * Place `v` at fraction u (0..1, by arc length) along a smooth curve through `path`, heading along the tangent; sets
 * wheel spin from the distance travelled, front-wheel steer from the curvature, a small deterministic suspension
 * bounce and a lean out of turns. `offset` adds metres to the distance (desyncs two cars on one path).
 */
export function drive(v: Vehicle, path: V3[], u: number, o: { bounce?: number; lean?: number; offset?: number } = {}) {
  const c = pathCurve(path), U = clamp(u), L = c.getLength();
  const p = c.getPointAt(U), t = c.getTangentAt(U), heading = headingOf(t);
  v.group.position.copy(p); v.group.rotation.set(0, heading, 0);
  const d = U * L + (o.offset ?? 0);
  v.setDistance(d);
  const e = Math.min(0.02, 1 / Math.max(L, 1e-3)), ua = clamp(U - e), ub = clamp(U + e);
  let dh = headingOf(c.getTangentAt(ub)) - headingOf(c.getTangentAt(ua));
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const ds = (ub - ua) * L, curv = ds > 1e-6 ? dh / ds : 0;
  v.setSteer?.(clamp(Math.atan(curv * v.wheelBase), -0.55, 0.55));
  const k = o.bounce ?? 1;
  const bounce = k * 0.018 * (0.6 * Math.sin(d * 2.3) + 0.4 * Math.sin(d * 5.1 + 1.3));
  const pitch = k * 0.012 * Math.sin(d * 1.7 + 0.4);
  const roll = clamp(curv * (o.lean ?? 0.4), -0.08, 0.08) + k * 0.006 * Math.sin(d * 3.1);
  v.setBody(bounce, pitch, roll);
  v.group.updateMatrixWorld(true);
  return { pos: [p.x, p.y, p.z] as V3, heading, distance: d, curvature: curv };
}

/** World-space feet position for a seat (follows the body's bounce/lean). heightM = the character's body height
 *  (without bobbleScale): shorter riders sit on the same seat, so their feet go up. Pass camPos for nudged seats. */
export function seatWorld(v: Vehicle, name: string, heightM = 1.7, camPos?: V3 | THREE.Vector3): V3 {
  const s = v.seats[name];
  if (!s) throw new Error(`vehicle ${v.kind} has no seat "${name}" (has ${Object.keys(v.seats).join(", ")})`);
  const p = new THREE.Vector3(s.pos[0], s.pos[1] + (s.pose === "stand" ? 0 : 0.4 * (1.7 - heightM)), s.pos[2]);
  v.body.updateWorldMatrix(true, false);
  v.body.localToWorld(p);
  if (camPos && s.nudge) {
    const c = Array.isArray(camPos) ? new THREE.Vector3(...camPos) : camPos;
    p.addScaledVector(c.clone().sub(p).setY(0).normalize(), s.nudge);
  }
  return [p.x, p.y, p.z];
}

/** The seat's pose (sit / ride) facing the way the vehicle points on screen; merge expressions etc. via `extra`. */
export function seatPose(v: Vehicle, name: string, camPos: V3 | THREE.Vector3, extra: KPose = {}): KPose {
  const s = v.seats[name], w = seatWorld(v, name), c = Array.isArray(camPos) ? camPos : [camPos.x, camPos.y, camPos.z];
  const q = new THREE.Quaternion(); v.group.getWorldQuaternion(q);
  const f = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const dx = w[0] - c[0], dz = w[2] - c[2];
  const facing: 1 | -1 = f.x * -dz + f.z * dx >= 0 ? 1 : -1;
  const base = s?.pose === "stand" ? {} : v.kind === "bicycle" ? RIDE_POSE : BOBBLE_POSES.sit;
  return { ...base, facing, ...extra } as KPose;
}
