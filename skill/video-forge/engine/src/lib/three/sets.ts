/**
 * Ready-made SETS with MARKS (1.7). A set is a dressed place built like a stage: the audience (camera) side is +z, the
 * back wall or facade row is at -z, x runs left to right. Every set returns named marks (where people stand, where a
 * prop goes), a suggested establishing camera, practical lamps and windows that follow the lighting key, and free
 * floor spots for a background crowd. The storyboard runtime (lib/board.tsx) places sets 160 m apart in one world, so
 * a change of place is a cut or a dissolve inside one scene.
 *
 *   const s = buildSet("shop", { era: "old", title: "GOLDSMITH" }, [160, 0, 0]);
 *   scene.add(s.group);   card.place(...s.marks.keeper, cam.pos);   s.setNight(0.8);
 *
 * Sets: street, alley, road, yard (exteriors), shop, workshop, office, hall (interiors: three walls, no ceiling).
 * `era: "old"` = timber, brick, cobbles, lanterns; `"modern"` = asphalt, lane lines, signs, electric light.
 * Small PROPS for gags (coin stacks, a money bag, scales, a chest, a parking meter, ...) are in `PROPS`.
 * Why sets exist: measured edge density of our hand-dressed shots was 6.4 % against 8.7 % in the reference, and every
 * new video paid for its dressing again. A set is dressed once, to the reference density, and reused.
 */
import * as THREE from "three";
import { rng } from "../time";
import type { V3 } from "../camera";
import { NOINK } from "./post";
import { toonWater, windSway, windUniforms } from "./shaders";
import { canvasTexture, flat, paint } from "./textures";
import { awning, barrel, bench, brickTexture, cart, crate, fence, flowerBox, house, lampPost, lantern, rowFacade, shadowed, signBoard, textTexture, tree } from "./world";

export type SetName = "street" | "alley" | "road" | "yard" | "shop" | "workshop" | "office" | "hall";
export type SetOpts = {
  era?: "old" | "modern"; seed?: string;
  /** text on the main sign / title board */
  title?: string;
  /** shop names along a street, wall signs in an alley */
  signs?: string[];
  /** wall / accent colours */
  wall?: string; accent?: string;
  /** yard: add a pool. workshop: make it a garage. hall: add a stage */
  pool?: boolean; garage?: boolean; stage?: boolean;
};
export type SetInstance = {
  name: SetName; group: THREE.Group; marks: Record<string, V3>;
  wide: { pos: V3; look: V3; fov: number };
  /** where a camera may be (world space): interiors have three walls, a camera outside them looks at the back of a wall */
  camBox: { min: V3; max: V3 };
  /** radius that the sun's shadow frustum must cover */
  radius: number; interior: boolean;
  crowdSpots: V3[];
  /** 0 day .. 1 night: practical lamps, lit windows, forge glow */
  setNight(n: number): void;
  /** window panes that show the sky outside (interiors) */
  setSky(top: THREE.ColorRepresentation, horizon: THREE.ColorRepresentation): void;
  update(f: number, fps: number): void;
};

// ------------------------------------------------------------------------------------------------ helpers
const lam = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(o);
const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, shadow = true) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = shadow; b.receiveShadow = true; return b;
};
const cyl = (r1: number, r2: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 14) => {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); c.position.set(x, y, z); c.castShadow = c.receiveShadow = true; return c;
};
const floorPlane = (w: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true; return p;
};
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; return o; };

const asphalt = (rep: [number, number]) => canvasTexture(`asphalt`, 256, 256, (g, r) => {
  g.fillStyle = "#5a5d68"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)"; g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 2); }
  for (let i = 0; i < 5; i++) { g.strokeStyle = "rgba(30,30,40,0.25)"; g.lineWidth = 1.5; g.beginPath(); let x = r() * 256, y = r() * 256; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 70; g.lineTo(x, y); } g.stroke(); }
}, rep);
const wallpaper = (color: string, stripe: string, key: string, rep: [number, number]) => canvasTexture(`wallp|${color}|${stripe}|${key}`, 256, 256, (g, r) => {
  g.fillStyle = color; g.fillRect(0, 0, 256, 256);
  g.fillStyle = stripe; for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 10, 256);
  for (let i = 0; i < 200; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"; g.fillRect(r() * 256, r() * 256, 3, 3); }
}, rep);
const books = (key: string) => canvasTexture(`books|${key}`, 512, 128, (g, r) => {
  g.fillStyle = "#3a2618"; g.fillRect(0, 0, 512, 128);
  const cols = ["#b23a32", "#2f6fb0", "#2f8f6a", "#d8a53a", "#7a4a8a", "#e8e0cf", "#3b4a6a", "#c46a2a"];
  for (let x = 4; x < 508;) { const w = 14 + r() * 22, h = 84 + r() * 36; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x, 124 - h, w - 2, h);
    g.fillStyle = "rgba(255,230,160,0.7)"; g.fillRect(x + 2, 124 - h + 12, w - 6, 4); g.strokeStyle = "#1c1216"; g.lineWidth = 2; g.strokeRect(x, 124 - h, w - 2, h); x += w; }
});
const goods = (key: string) => canvasTexture(`goods|${key}`, 512, 128, (g, r) => {
  g.fillStyle = "#4a321f"; g.fillRect(0, 0, 512, 128);
  const cols = ["#e9dcc6", "#c0392b", "#d8a53a", "#5b8fd6", "#6aa84f", "#b07a4a", "#f4efe6", "#8e5bb5"];
  for (let x = 6; x < 500;) { const w = 26 + r() * 30, h = 50 + r() * 60, c = cols[Math.floor(r() * cols.length)]; g.fillStyle = c; const jar = r() < 0.45;
    if (jar) { g.beginPath(); g.roundRect(x, 124 - h, w - 6, h, 10); g.fill(); g.strokeStyle = "#1c1216"; g.lineWidth = 3; g.stroke(); g.fillStyle = "#3a2618"; g.fillRect(x + 4, 124 - h - 6, w - 14, 8); }
    else { g.fillRect(x, 124 - h, w - 6, h); g.strokeStyle = "#1c1216"; g.lineWidth = 3; g.strokeRect(x, 124 - h, w - 6, h); g.fillStyle = "rgba(255,255,255,0.75)"; g.fillRect(x + 4, 124 - h * 0.62, w - 14, h * 0.26); }
    x += w; }
});
const skylineTex = (key: string, old: boolean) => canvasTexture(`skyl|${key}|${old}`, 512, 256, (g, r) => {
  g.clearRect(0, 0, 512, 256);
  for (let x = 0; x < 512;) { const w = 26 + r() * 46, h = (old ? 40 : 60) + r() * (old ? 70 : 150); g.fillStyle = ["#6f7fa8", "#8793b8", "#5d6c96"][Math.floor(r() * 3)];
    g.fillRect(x, 256 - h, w, h); if (old) { g.beginPath(); g.moveTo(x - 2, 256 - h); g.lineTo(x + w / 2, 256 - h - 16 - r() * 14); g.lineTo(x + w + 2, 256 - h); g.fill(); }
    g.fillStyle = "rgba(255,240,200,0.55)"; for (let yy = 256 - h + 8; yy < 250; yy += 14) for (let xx = x + 5; xx < x + w - 6; xx += 11) if (r() < 0.6) g.fillRect(xx, yy, 5, 7);
    x += w + 2; }
});

/** A back / side wall with a wainscot and skirting (real geometry: the ink pass finds the lines). */
function wallPanel(w: number, h: number, tex: THREE.Texture | string, trim = "#6b4a30") {
  const g = new THREE.Group();
  g.add(box(w, h, 0.3, lam(typeof tex === "string" ? { color: tex } : { map: tex }), 0, h / 2, 0));
  g.add(box(w, 0.95, 0.06, lam({ map: paint.planks(trim, [Math.max(2, w / 1.2), 1], true) }), 0, 0.5, 0.18, false));
  g.add(box(w, 0.09, 0.1, lam({ color: trim }), 0, 1.0, 0.2, false), box(w, 0.14, 0.1, lam({ color: trim }), 0, 0.07, 0.2, false), box(w, 0.16, 0.14, lam({ color: trim }), 0, h - 0.08, 0.2, false));
  return g;
}
/** A window on a wall (faces +z): frame, cross bars, sill, and a pane that glows with the sky. Returns the pane material. */
function windowOn(w: number, h: number, pane: THREE.MeshBasicMaterial, frame = "#f4efe6", arch = false) {
  const g = new THREE.Group(), fm = lam({ color: frame });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), pane); p.position.z = 0.02; g.add(p);
  g.add(box(w + 0.24, 0.12, 0.12, fm, 0, h / 2 + 0.06, 0.06, false), box(w + 0.36, 0.12, 0.26, fm, 0, -h / 2 - 0.06, 0.1, false), box(0.12, h, 0.12, fm, -w / 2 - 0.06, 0, 0.06, false), box(0.12, h, 0.12, fm, w / 2 + 0.06, 0, 0.06, false));
  g.add(box(0.06, h, 0.06, fm, 0, 0, 0.06, false), box(w, 0.06, 0.06, fm, 0, h * 0.12, 0.06, false));
  if (arch) { const a = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 20, 0, Math.PI), pane); a.position.set(0, h / 2 + 0.1, 0.02); g.add(a); const ar = new THREE.Mesh(new THREE.TorusGeometry(w / 2 + 0.06, 0.06, 6, 20, Math.PI), fm); ar.position.set(0, h / 2 + 0.1, 0.06); g.add(ar); }
  return g;
}
/** A door leaf with a frame and a knob (faces +z). */
function doorOn(color = "#6b3f26", w = 1.15, h = 2.2) {
  const g = new THREE.Group();
  g.add(box(w, h, 0.08, lam({ map: paint.planks(color, [3, 1], true) }), 0, h / 2, 0.05, false));
  const fm = lam({ color: "#3a2618" });
  g.add(box(w + 0.24, 0.14, 0.14, fm, 0, h + 0.07, 0.06, false), box(0.12, h, 0.14, fm, -w / 2 - 0.06, h / 2, 0.06, false), box(0.12, h, 0.14, fm, w / 2 + 0.06, h / 2, 0.06, false));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), lam({ color: "#d8b04a" })); knob.position.set(w / 2 - 0.16, h * 0.47, 0.12); g.add(knob);
  for (const y of [h * 0.3, h * 0.72]) g.add(box(w * 0.7, h * 0.3, 0.03, lam({ color }), 0, y, 0.1, false));
  return g;
}
/** A shelf unit: uprights, boards and rows of goods or books as textured strips with a few real boxes on top. */
function shelfUnit(w: number, h: number, kind: "goods" | "books", seed: string, wood = "#7a5234") {
  const g = new THREE.Group(), wm = lam({ color: wood }), rows = Math.max(2, Math.floor(h / 0.62));
  g.add(box(w, h, 0.08, lam({ color: "#3a2618" }), 0, h / 2, -0.18, false), box(0.08, h, 0.42, wm, -w / 2, h / 2, 0), box(0.08, h, 0.42, wm, w / 2, h / 2, 0), box(w + 0.12, 0.1, 0.48, wm, 0, h, 0));
  for (let i = 0; i < rows; i++) { const y = 0.08 + (i * (h - 0.1)) / rows;
    g.add(box(w, 0.06, 0.42, wm, 0, y, 0, false));
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.12, (h - 0.1) / rows - 0.12), lam({ map: (kind === "books" ? books : goods)(seed + i) })); strip.position.set(0, y + ((h - 0.1) / rows) / 2, 0.14); g.add(strip); }
  return g;
}
const table = (w = 1.4, d = 0.8, h = 0.78, color = "#8a5a34") => { const g = new THREE.Group(), m = lam({ map: paint.planks(color, [2, 1], false) });
  g.add(box(w, 0.08, d, m, 0, h - 0.04, 0)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.09, h - 0.08, 0.09, lam({ color }), sx * (w / 2 - 0.1), (h - 0.08) / 2, sz * (d / 2 - 0.1))); return g; };
const chair = (color = "#7a4a2a") => { const g = new THREE.Group(), m = lam({ color });
  g.add(box(0.5, 0.06, 0.5, m, 0, 0.47, 0), box(0.5, 0.6, 0.06, m, 0, 0.8, -0.22)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.06, 0.47, 0.06, m, sx * 0.21, 0.235, sz * 0.21)); return g; };
const stool = (color = "#8a5a34") => { const g = new THREE.Group(); g.add(cyl(0.2, 0.2, 0.06, lam({ color }), 0, 0.5, 0)); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; g.add(box(0.05, 0.5, 0.05, lam({ color }), Math.cos(a) * 0.14, 0.25, Math.sin(a) * 0.14)); } return g; };
const rug = (w: number, d: number, a = "#a8423a", b = "#e9d7a8") => { const t = canvasTexture(`rug|${a}|${b}`, 256, 160, (g) => { g.fillStyle = a; g.fillRect(0, 0, 256, 160); g.strokeStyle = b; g.lineWidth = 8; g.strokeRect(14, 14, 228, 132); g.lineWidth = 3; g.strokeRect(30, 30, 196, 100);
  g.fillStyle = b; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(52 + i * 38, 80, 10, 22, 0, 0, 7); g.fill(); } }); return floorPlane(w, d, lam({ map: t }), 0, 0.012, 0); };
function hangingLamp(drop = 1.2, modern = false) {
  const g = new THREE.Group(), iron = lam({ color: "#2b2f3a" });
  g.add(cyl(0.012, 0.012, drop, iron, 0, -drop / 2, 0, 6));
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.22, 16, 1, true), lam({ color: modern ? "#e9e2d2" : "#2f5d4a", side: THREE.DoubleSide })); shade.position.y = -drop; g.add(shade);
  const bulbM = new THREE.MeshLambertMaterial({ color: "#fff1c8", emissive: new THREE.Color("#ffc860"), emissiveIntensity: 0.6 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), bulbM); bulb.position.y = -drop - 0.1; g.add(bulb);
  return { group: g, bulb: bulbM };
}

// ------------------------------------------------------------------------------------------------ small props for gags
export const PROPS: Record<string, (o?: { color?: string; n?: number; text?: string; seed?: string }) => THREE.Object3D> = {
  table: (o) => shadowed(table(1.4, 0.8, 0.78, o?.color)), chair: (o) => shadowed(chair(o?.color)), stool: (o) => shadowed(stool(o?.color)),
  crate: (o) => crate(0.6, { seed: o?.seed, label: o?.text }), barrel: () => barrel(),
  /** a stack (n <= 12) or a small heap (n > 12) of coins */
  coins: (o) => { const g = new THREE.Group(), n = o?.n ?? 8, r = rng(o?.seed ?? "coins"), m = lam({ color: o?.color ?? "#d9dde6" }), rim = lam({ color: "#9aa2b4" });
    for (let i = 0; i < n; i++) { const stack = n <= 12; const c = cyl(0.11, 0.11, 0.022, i % 2 ? rim : m, stack ? (r() - 0.5) * 0.012 : (r() - 0.5) * 0.5, stack ? 0.011 + i * 0.022 : 0.011 + Math.floor(i / 9) * 0.022, stack ? (r() - 0.5) * 0.012 : (r() - 0.5) * 0.36, 20);
      if (!stack) c.rotation.y = r() * 3; g.add(c); } return g; },
  moneyBag: (o) => { const g = new THREE.Group(), m = lam({ color: o?.color ?? "#b89a62" }); const b = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), m); b.scale.set(1, 0.9, 1); b.position.y = 0.2; b.castShadow = true; g.add(b);
    g.add(cyl(0.07, 0.12, 0.16, m, 0, 0.46, 0, 10), cyl(0.085, 0.085, 0.03, lam({ color: "#6b3f26" }), 0, 0.4, 0, 10));
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshLambertMaterial({ map: textTexture(o?.text ?? "$", { w: 128, h: 128, transparent: true, fg: "#3a2618" }), transparent: true })); t.position.set(0, 0.2, 0.235); g.add(t); return g; },
  chest: (o) => { const g = new THREE.Group(), wood = lam({ map: paint.planks(o?.color ?? "#7a4a2a", [3, 1], false) }), iron = lam({ color: "#3b3f4c" });
    g.add(box(0.9, 0.42, 0.55, wood, 0, 0.21, 0)); const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.9, 14, 1, false, 0, Math.PI), wood); lid.rotation.z = Math.PI / 2; lid.position.y = 0.42; lid.castShadow = true; g.add(lid);
    for (const x of [-0.3, 0.3]) g.add(box(0.07, 0.44, 0.58, iron, x, 0.21, 0)); g.add(box(0.12, 0.14, 0.05, lam({ color: "#d8b04a" }), 0, 0.36, 0.29)); return g; },
  sack: (o) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), lam({ color: o?.color ?? "#c9b48a" })); b.scale.set(1, 1.25, 0.8); b.position.y = 0.34; b.castShadow = true; const g = new THREE.Group(); g.add(b, cyl(0.08, 0.14, 0.14, lam({ color: "#c9b48a" }), 0, 0.74, 0, 8)); return g; },
  scales: () => { const g = new THREE.Group(), br = lam({ color: "#c9a23a" }); g.add(cyl(0.14, 0.18, 0.05, br, 0, 0.025, 0), cyl(0.02, 0.02, 0.5, br, 0, 0.3, 0, 8), box(0.7, 0.03, 0.03, br, 0, 0.55, 0));
    for (const sx of [-1, 1]) { g.add(cyl(0.004, 0.004, 0.24, br, sx * 0.33, 0.43, 0, 4)); const pan = cyl(0.13, 0.09, 0.03, br, sx * 0.33, 0.3, 0, 14); g.add(pan); } return g; },
  candle: () => { const g = new THREE.Group(); g.add(cyl(0.07, 0.09, 0.03, lam({ color: "#c9a23a" }), 0, 0.015, 0), cyl(0.028, 0.028, 0.2, lam({ color: "#f4efe6" }), 0, 0.13, 0, 8));
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1.0) })); fl.scale.y = 1.7; fl.position.y = 0.28; g.add(fl); return g; },
  book: (o) => { const g = new THREE.Group(); g.add(box(0.32, 0.07, 0.24, lam({ color: o?.color ?? "#8a2f2a" }), 0, 0.035, 0), box(0.3, 0.05, 0.22, lam({ color: "#f4efe6" }), 0.012, 0.035, 0, false)); return g; },
  papers: () => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const p = box(0.3, 0.006, 0.4, lam({ color: "#f8f4ea" }), i * 0.03, 0.004 + i * 0.007, i * 0.02, false); p.rotation.y = i * 0.17 - 0.2; g.add(p); } return g; },
  trashBin: (o) => { const g = new THREE.Group(); g.add(cyl(0.26, 0.22, 0.8, lam({ color: o?.color ?? "#3d6b4a" }), 0, 0.4, 0, 14), cyl(0.29, 0.29, 0.06, lam({ color: "#2b3a30" }), 0, 0.83, 0, 14)); return g; },
  mailbox: (o) => { const g = new THREE.Group(), m = lam({ color: o?.color ?? "#c0392b" }); g.add(box(0.5, 0.9, 0.42, m, 0, 0.75, 0), cyl(0.21, 0.21, 0.5, m, 0, 1.2, 0, 14).rotateZ(Math.PI / 2), box(0.3, 0.04, 0.02, lam({ color: "#1c1216" }), 0, 1.02, 0.22), box(0.12, 0.3, 0.12, lam({ color: "#2b2f3a" }), 0, 0.15, 0)); return g; },
  hydrant: (o) => { const g = new THREE.Group(), m = lam({ color: o?.color ?? "#d0392b" }); g.add(cyl(0.11, 0.13, 0.5, m, 0, 0.25, 0, 12), cyl(0.14, 0.14, 0.05, m, 0, 0.5, 0, 12)); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8, 0, 7, 0, 1.6), m); cap.position.y = 0.52; g.add(cap);
    for (const sx of [-1, 1]) g.add(cyl(0.05, 0.05, 0.1, m, sx * 0.14, 0.34, 0, 8).rotateZ(Math.PI / 2)); return g; },
  parkingMeter: () => { const g = new THREE.Group(), gr = lam({ color: "#6f7888" }); g.add(cyl(0.035, 0.045, 1.05, gr, 0, 0.52, 0, 8)); const head = box(0.2, 0.3, 0.14, lam({ color: "#39404e" }), 0, 1.2, 0); g.add(head);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, 7, 0, 1.6), lam({ color: "#39404e" })); dome.position.y = 1.35; g.add(dome); g.add(box(0.13, 0.1, 0.01, lam({ color: "#dfe9d0" }), 0, 1.25, 0.075, false), box(0.05, 0.012, 0.02, lam({ color: "#1c1216" }), 0.05, 1.13, 0.075, false)); return g; },
  vendingMachine: (o) => { const g = new THREE.Group(); g.add(box(1.0, 1.9, 0.75, lam({ color: o?.color ?? "#c0392b" }), 0, 0.95, 0));
    g.add(box(0.62, 1.1, 0.02, lam({ map: goods(o?.seed ?? "vend") }), -0.13, 1.2, 0.38, false), box(0.2, 0.4, 0.02, lam({ color: "#2b2f3a" }), 0.33, 1.3, 0.38, false), box(0.62, 0.2, 0.03, lam({ color: "#1c1216" }), -0.13, 0.32, 0.38, false), box(0.04, 0.012, 0.03, lam({ color: "#d9dde6" }), 0.33, 1.02, 0.385, false)); return g; },
  ladder: () => { const g = new THREE.Group(), m = lam({ color: "#b98a52" }); for (const sx of [-1, 1]) g.add(box(0.06, 3, 0.06, m, sx * 0.25, 1.5, 0)); for (let i = 0; i < 9; i++) g.add(box(0.5, 0.04, 0.04, m, 0, 0.3 + i * 0.3, 0)); g.rotation.x = -0.18; return g; },
  plant: () => { const g = new THREE.Group(); g.add(cyl(0.2, 0.15, 0.3, lam({ color: "#b0603a" }), 0, 0.15, 0, 12)); const r = rng("plant"); for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + r() * 0.08, 0), lam({ color: i % 2 ? "#4f9a35" : "#3d8a3a", flatShading: true })); l.position.set((r() - 0.5) * 0.3, 0.45 + r() * 0.4, (r() - 0.5) * 0.3); l.castShadow = true; g.add(l); } return g; },
  sign: (o) => { const g = new THREE.Group(); const s = signBoard(o?.text ?? "SIGN", { w: 1.6, h: 0.6, bg: o?.color ?? "#f4efe6", fg: "#1c1216", border: "#1c1216" }); s.position.y = 1.5; g.add(s, box(0.08, 1.3, 0.08, lam({ color: "#7a5234" }), 0, 0.65, -0.02)); return g; },
};

// ------------------------------------------------------------------------------------------------ the sets
type Ctx = { wind: ReturnType<typeof windUniforms>; g: THREE.Group; lamps: { l: THREE.PointLight; i: number }[]; glows: { m: THREE.MeshLambertMaterial | THREE.MeshBasicMaterial; day: number; night: number; col?: THREE.Color; k?: number }[]; panes: THREE.MeshBasicMaterial[]; upd: ((f: number, fps: number) => void)[] };
const lampAt = (c: Ctx, x: number, y: number, z: number, i = 2.2, color = "#ffd9a0", dist = 9) => { const l = new THREE.PointLight(color, 0, dist, 1.3); l.position.set(x, y, z); c.g.add(l); c.lamps.push({ l, i }); return l; };
const litWindow = (c: Ctx, w: number, h: number, x: number, y: number, z: number, ry = 0, color = "#ffd27a") => {
  const m = new THREE.MeshBasicMaterial({ color: "#3d4660" }); c.glows.push({ m, day: 0, night: 1, col: new THREE.Color(color) });
  const g = windowOn(w, h, m, "#3a2618"); c.g.add(at(g, x, y, z, ry)); return g;
};


// ------------------------------------------------------------------------------------------------ life + dressing kit (1.8)
/**
 * LIFE: things that move in every set, all pure functions of the frame. Measured on the coin short: micro-animation
 * 0.012 against 0.020 in the reference; a held shot of a room had nothing moving but the characters' idle.
 * DRESSING: real geometry on the walls (the ink pass draws what has edges). Measured edge density 3.7 % against 6.1 %.
 */
const T2 = (f: number, fps: number) => f / fps;
/** rising puffs: chimney smoke, forge fumes, steam */
function smoke(c: Ctx, x: number, y: number, z: number, o: { n?: number; color?: string; rise?: number; size?: number; drift?: number; speed?: number } = {}) {
  const n = o.n ?? 6, puffs = Array.from({ length: n }, (_, i) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: o.color ?? "#e9e6ee", transparent: true, opacity: 0, depthWrite: false }));
    m.layers.set(NOINK); m.userData.auditIgnore = true; c.g.add(m); return { m, i }; });
  c.upd.push((f, fps) => { for (const { m, i } of puffs) { const ph = (T2(f, fps) * (o.speed ?? 0.22) + i / n) % 1, sz = (o.size ?? 0.5) * (0.35 + ph * 1.3);
    m.position.set(x + Math.sin(ph * 5 + i * 1.7) * 0.3 * ph + (o.drift ?? 0.5) * ph * ph, y + ph * (o.rise ?? 3.2), z + Math.cos(ph * 4 + i) * 0.2 * ph); m.scale.setScalar(sz);
    (m.material as THREE.MeshLambertMaterial).opacity = 0.62 * (1 - ph) * Math.min(1, ph * 7); } });
}
/** embers rising from a fire */
function sparks(c: Ctx, x: number, y: number, z: number, n = 9) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.7, 0.5) }), ps = Array.from({ length: n }, (_, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), mat); m.layers.set(NOINK); m.userData.auditIgnore = true; c.g.add(m); return m; });
  c.upd.push((f, fps) => ps.forEach((m, i) => { const ph = (T2(f, fps) * (0.7 + (i % 3) * 0.2) + i * 0.37) % 1; m.position.set(x + Math.sin(i * 2.4 + ph * 6) * 0.25, y + ph * 1.5, z + Math.cos(i * 1.3 + ph * 5) * 0.2); m.visible = ph < 0.85; m.scale.setScalar(1.4 * (1 - ph)); }));
}
/** anything that hangs sways: `pivot` is rotated around the given axis */
const sway = (c: Ctx, pivot: THREE.Object3D, axis: "x" | "z" | "y", amp: number, speed: number, phase = 0) => { c.upd.push((f, fps) => { pivot.rotation[axis] = amp * Math.sin(T2(f, fps) * speed + phase) + amp * 0.35 * Math.sin(T2(f, fps) * speed * 2.3 + phase * 1.7); }); return pivot; };
/** a sign on an iron bracket that swings (faces +z and -z); the wall is at x = 0 on its left */
function hangSign(c: Ctx, text: string, x: number, y: number, z: number, ry = 0, o: { w?: number; bg?: string; fg?: string } = {}) {
  const g = new THREE.Group(), iron = lam({ color: "#2b2f3a" }), w = o.w ?? 1.3;
  g.add(box(w + 0.3, 0.05, 0.05, iron, w / 2, 0, 0, false), box(0.05, 0.5, 0.05, iron, 0.05, -0.2, 0, false));
  const piv = new THREE.Group(); piv.position.set(w / 2 + 0.05, -0.05, 0); g.add(piv);
  const sg = signBoard(text, { w, h: 0.5, bg: o.bg ?? "#2b2230", fg: o.fg ?? "#f1c94a" }); sg.position.y = -0.42; piv.add(sg);
  for (const sx of [-1, 1]) piv.add(box(0.02, 0.2, 0.02, iron, sx * (w / 2 - 0.12), -0.1, 0, false));
  sway(c, piv, "x", 0.09, 1.9, x * 1.3 + z); c.g.add(at(g, x, y, z, ry)); return g;
}
/** a line of pennants between two points, sagging, each one fluttering */
function bunting(c: Ctx, a: V3, b: V3, n = 12, cols = ["#e04a3a", "#f2c94c", "#3a7fd0", "#f4efe6"]) {
  const ry = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
  for (let k = 0; k <= n; k++) { const u = k / n, sag = 0.5 * Math.sin(u * Math.PI); const piv = new THREE.Group(); piv.position.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag, a[2] + (b[2] - a[2]) * u); piv.rotation.y = ry;
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.46, 3), lam({ color: cols[k % cols.length] })); tri.rotation.x = Math.PI; tri.position.y = -0.25; tri.scale.z = 0.2; piv.add(tri); c.g.add(piv); sway(c, piv, "x", 0.2, 2.3, k * 0.7); }
}
/** two curtains at a window (faces +z), breathing a little */
function curtains(c: Ctx, w: number, h: number, x: number, y: number, z: number, color = "#a8423a", ry = 0) {
  const g = new THREE.Group(), m = lam({ color, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) { const piv = new THREE.Group(); piv.position.set(sx * (w / 2 + 0.12), h / 2, 0.1); const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.46, h + 0.3, 3, 1), m); cl.position.set(-sx * 0.2, -h / 2, 0); piv.add(cl);
    for (let k = 0; k < 3; k++) piv.add(box(0.03, h + 0.3, 0.03, lam({ color: "#000000", transparent: true, opacity: 0.18 }), -sx * (0.06 + k * 0.14), -h / 2, 0.012, false)); // fold lines
    g.add(piv); sway(c, piv, "y", 0.07, 1.1, sx + x); }
  g.add(box(w + 0.9, 0.06, 0.06, lam({ color: "#3a2618" }), 0, h / 2 + 0.16, 0.1, false)); c.g.add(at(g, x, y, z, ry)); return g;
}
const picture = (w: number, h: number, col: string, frame = "#c9a23a") => { const g = new THREE.Group(); g.add(box(w, h, 0.05, lam({ color: frame }), 0, 0, 0, false), box(w - 0.14, h - 0.14, 0.02, lam({ color: col }), 0, 0, 0.03, false), box((w - 0.14) * 0.5, (h - 0.14) * 0.35, 0.02, lam({ color: "#f4efe6" }), -w * 0.1, -h * 0.12, 0.04, false)); return g; };
const poster = (text: string, w = 0.8, h = 1.0, bg = "#f1e7d2", fg = "#3a2618") => { const g = new THREE.Group(); const lines = text.split("|");
  g.add(box(w, h, 0.02, lam({ color: bg }), 0, 0, 0, false)); lines.forEach((t, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, (h * 0.8) / lines.length), new THREE.MeshLambertMaterial({ map: textTexture(t, { w: 256, h: 96, bg, fg }) })); m.position.set(0, h * 0.4 - ((i + 0.5) * h * 0.8) / lines.length, 0.012); g.add(m); });
  for (const sx of [-1, 1]) g.add(box(0.03, 0.03, 0.03, lam({ color: "#3b3f4c" }), sx * (w / 2 - 0.05), h / 2 - 0.05, 0.02, false)); return g; };
/** a board on brackets with real jars, boxes and bottles on it (faces +z) */
function wallShelf(w: number, seed: string, wood = "#7a5234") {
  const g = new THREE.Group(), r = rng(seed), wm = lam({ color: wood }), cols = ["#e9dcc6", "#c0392b", "#d8a53a", "#5b8fd6", "#6aa84f", "#8e5bb5", "#f4efe6", "#b07a4a"];
  g.add(box(w, 0.05, 0.28, wm, 0, 0, 0.14, false)); for (const sx of [-1, 1]) g.add(box(0.05, 0.22, 0.22, wm, sx * (w / 2 - 0.12), -0.12, 0.11, false));
  for (let x = -w / 2 + 0.14; x < w / 2 - 0.1;) { const k = r(), ww = 0.1 + r() * 0.1, hh = 0.14 + r() * 0.22, col = lam({ color: cols[Math.floor(r() * cols.length)] });
    if (k < 0.4) g.add(cyl(ww / 2, ww / 2, hh, col, x + ww / 2, hh / 2 + 0.03, 0.14, 10), cyl(ww * 0.35, ww * 0.35, 0.04, lam({ color: "#3a2618" }), x + ww / 2, hh + 0.05, 0.14, 8));
    else if (k < 0.75) g.add(box(ww, hh, 0.16, col, x + ww / 2, hh / 2 + 0.03, 0.14, false));
    else { g.add(cyl(ww * 0.45, ww * 0.5, hh * 0.7, col, x + ww / 2, hh * 0.35 + 0.03, 0.14, 10), cyl(ww * 0.16, ww * 0.2, hh * 0.4, col, x + ww / 2, hh * 0.9 + 0.03, 0.14, 8)); }
    x += ww + 0.05 + r() * 0.06; }
  return g;
}
const pilaster = (h: number, color: string, w = 0.2) => { const g = new THREE.Group(), m = lam({ color }); g.add(box(w, h, 0.1, m, 0, h / 2, 0.05, false), box(w + 0.1, 0.16, 0.14, m, 0, 0.08, 0.07, false), box(w + 0.1, 0.16, 0.14, m, 0, h - 0.08, 0.07, false)); return g; };
function cabinet(w: number, h: number, d: number, color = "#7a5234", rows = 3, cols = 2) {
  const g = new THREE.Group(), m = lam({ map: paint.planks(color, [2, 1], false) }), dk = lam({ color: "#4a2f1c" }), br = lam({ color: "#d8b04a" });
  g.add(box(w, h, d, m, 0, h / 2, 0), box(w + 0.08, 0.06, d + 0.06, dk, 0, h + 0.03, 0));
  for (let r0 = 0; r0 < rows; r0++) for (let c0 = 0; c0 < cols; c0++) { const dw = w / cols - 0.1, dh = (h - 0.12) / rows - 0.08, x = -w / 2 + (c0 + 0.5) * (w / cols), y = 0.08 + (r0 + 0.5) * ((h - 0.12) / rows);
    g.add(box(dw, dh, 0.03, dk, x, y, d / 2 + 0.012, false), cyl(0.03, 0.03, 0.04, br, x, y, d / 2 + 0.04, 8).rotateX(Math.PI / 2)); }
  return shadowed(g);
}
/** a rail with things hanging from it (pots, herbs, sausages, tools), each swinging a little */
function hangingRow(c: Ctx, w: number, kind: "pots" | "herbs" | "sausages" | "tools", x: number, y: number, z: number, ry = 0) {
  const g = new THREE.Group(), iron = lam({ color: "#2b2f3a" }), n = Math.max(3, Math.round(w / 0.42));
  g.add(cyl(0.02, 0.02, w, iron, 0, 0, 0, 6).rotateZ(Math.PI / 2));
  for (let i = 0; i < n; i++) { const piv = new THREE.Group(); piv.position.set(-w / 2 + ((i + 0.5) * w) / n, 0, 0); piv.add(box(0.012, 0.16, 0.012, iron, 0, -0.08, 0, false));
    if (kind === "pots") { piv.add(cyl(0.11, 0.08, 0.14, lam({ color: i % 2 ? "#b0603a" : "#c9823a" }), 0, -0.24, 0, 12)); }
    else if (kind === "herbs") { const h = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 6), lam({ color: i % 2 ? "#4f9a35" : "#6aa84f", flatShading: true })); h.rotation.x = Math.PI; h.position.y = -0.32; piv.add(h); }
    else if (kind === "sausages") { for (let k = 0; k < 3; k++) { const sg = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), lam({ color: "#a8423a" })); sg.scale.set(1, 1.7, 1); sg.position.y = -0.22 - k * 0.15; piv.add(sg); } }
    else { piv.add(box(0.05, 0.36, 0.03, lam({ color: "#b0603a" }), 0, -0.3, 0, false), i % 2 ? box(0.2, 0.1, 0.05, lam({ color: "#8d96a6" }), 0, -0.5, 0, false) : cyl(0.09, 0.09, 0.03, lam({ color: "#8d96a6" }), 0, -0.52, 0, 10).rotateX(Math.PI / 2)); }
    g.add(piv); sway(c, piv, "z", 0.05, 1.5, i * 1.1 + x); }
  c.g.add(at(g, x, y, z, ry)); return g;
}
/** a wall light that flickers (a glow, not a light source: the lamp pools come from the set's own lamps) */
function sconce(c: Ctx, x: number, y: number, z: number, ry = 0) {
  const g = new THREE.Group(), iron = lam({ color: "#2b2f3a" }); g.add(box(0.06, 0.3, 0.06, iron, 0, 0, 0.03, false), box(0.06, 0.06, 0.22, iron, 0, -0.1, 0.12, false));
  const fm = new THREE.MeshLambertMaterial({ color: "#fff1c8", emissive: new THREE.Color("#ffc860"), emissiveIntensity: 1 }); const fl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), fm); fl.scale.y = 1.6; fl.position.set(0, 0.04, 0.22); g.add(fl);
  g.add(cyl(0.05, 0.06, 0.05, iron, 0, -0.06, 0.22, 8)); const gl = { m: fm, day: 0.7, night: 2.0, k: 1 }; c.glows.push(gl);
  c.upd.push((f, fps) => { gl.k = 0.82 + 0.18 * Math.sin(T2(f, fps) * 9.3 + x * 3) * Math.sin(T2(f, fps) * 5.1 + z); fl.scale.y = 1.5 + 0.25 * Math.sin(T2(f, fps) * 11 + x); });
  c.g.add(at(g, x, y, z, ry)); return g;
}
const flickerGlow = (c: Ctx, gl: { k?: number }, seed: number) => c.upd.push((f, fps) => { gl.k = 0.86 + 0.14 * Math.sin(T2(f, fps) * 8.7 + seed) * Math.sin(T2(f, fps) * 4.9 + seed * 2.1); });
const chandelier = (c: Ctx, x: number, y: number, z: number, drop = 2.2) => { const piv = new THREE.Group(), iron = lam({ color: "#2b2f3a" }); piv.position.set(x, y, z); piv.add(cyl(0.015, 0.015, drop, iron, 0, -drop / 2, 0, 6));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 6, 20), iron); ring.rotation.x = Math.PI / 2; ring.position.y = -drop; piv.add(ring);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, fm = new THREE.MeshLambertMaterial({ color: "#fff1c8", emissive: new THREE.Color("#ffc860"), emissiveIntensity: 1 }); piv.add(cyl(0.025, 0.025, 0.14, lam({ color: "#f4efe6" }), Math.cos(a) * 0.55, -drop + 0.09, Math.sin(a) * 0.55, 6));
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), fm); fl.scale.y = 1.6; fl.position.set(Math.cos(a) * 0.55, -drop + 0.2, Math.sin(a) * 0.55); piv.add(fl); const gl = { m: fm, day: 0.8, night: 2.0, k: 1 }; c.glows.push(gl); flickerGlow(c, gl, i + x); }
  c.g.add(piv); sway(c, piv, "z", 0.025, 0.9, x); return piv; };

type SetCore = Omit<SetInstance, "group" | "setNight" | "setSky" | "update" | "name" | "camBox"> & { camBox?: { min: V3; max: V3 } };
function street(o: SetOpts, c: Ctx): SetCore {
  const old = (o.era ?? "old") === "old", seed = o.seed ?? "street", r = rng(seed);
  c.g.add(floorPlane(120, 9.4, lam({ map: old ? paint.cobble("#a99a86", [30, 3]) : asphalt([24, 2]) }), 0, 0.005, 0));
  c.g.add(floorPlane(400, 400, lam({ map: flat.grass("#71b038", [50, 50]) }), 0, -0.02, 0));
  const curb = lam({ map: flat.tiles(old ? "#b7ab9c" : "#c9c5bd", old ? "#7d7265" : "#8c8a86", 8, [40, 1]) });
  for (const z of [-6.2, 6.2]) c.g.add(box(120, 0.16, 3.0, curb, 0, 0.08, z));
  if (!old) { for (let x = -57; x < 58; x += 4) c.g.add(floorPlane(2, 0.16, new THREE.MeshLambertMaterial({ color: "#f1ede2" }), x, 0.012, 0)); for (const z of [-4.55, 4.55]) c.g.add(floorPlane(120, 0.12, lam({ color: "#e9c63a" }), 0, 0.012, z)); }
  const walls = old ? ["#c97a5a", "#e9dcc6", "#b8664a", "#d9c09a", "#9a5a44", "#e6d2b0"] : ["#e8b04a", "#f4efe6", "#5f9a84", "#e6c9b0", "#d98a5a", "#bcd3e6"] /* 1.8: the pastel row measured saturation 0.30 and read washed out */;
  const AW = [["#c0392b", "#f4efe6"], ["#2f6fb0", "#f4efe6"], ["#2f8f6a", "#f6e7b0"], ["#d08a2a", "#f4efe6"]];
  const signs = o.signs ?? (old ? ["BAKER", "GOLDSMITH", "TAVERN", "DRAPER", "CHANDLER", "INN"] : ["BAKERY", "COFFEE", "BOOKS", "PHARMACY", "PIZZA", "BANK"]);
  const marks: Record<string, V3> = { center: [0, 0, 0.6], left: [-3, 0, 0.8], right: [3, 0, 0.8], pavement: [0, 0.16, -5.4], across: [0, 0.16, 5.6], far: [18, 0, 0.4], roadL: [-46, 0, 1.6], roadR: [46, 0, 1.6], roadL2: [-46, 0, -1.8], roadR2: [46, 0, -1.8], corner: [-14.4, 0.16, -5.3] };
  for (let i = 0; i < 10; i++) {
    const x = -32.4 + i * 7.2, h = (old ? 8.5 : 10) + ((i * 5) % 4) * (old ? 1.7 : 2.6), fl = Math.round(h / 3.1);
    const hs = house({ w: 6.9, d: 7, h, floors: fl, wall: walls[i % walls.length], roof: old ? ["#5a4a4a", "#7a4a3a", "#4b3f46"][i % 3] : "#5a5d68", seed: seed + i }); c.g.add(at(hs, x, 0, -11.2));
    const far = rowFacade(7.2, h + 3 + (i % 3) * 2.5, { color: walls[(i + 2) % walls.length], seed: seed + "far" + i }); c.g.add(at(far, x, 0, -23));
    const behind = rowFacade(7.2, 9 + ((i * 3) % 4) * 2, { color: walls[(i + 4) % walls.length], seed: seed + "bh" + i }); c.g.add(at(behind, x, 0, 16.5, Math.PI));
    const name = signs[(i + 4) % signs.length];
    if (i % 5 !== 2) { const sg = signBoard(name, { w: 3.6, h: 0.66, bg: old ? "#2b2230" : ["#1f2b4d", "#7a2a2a", "#1f4d3a"][i % 3], fg: old ? "#f1c94a" : "#f4efe6" }); c.g.add(at(sg, x, 3.45, -7.6));
      c.g.add(at(awning(4.2, { a: AW[i % 4][0], b: AW[i % 4][1] }), x, 3.0, -7.65));
      litWindow(c, 1.5, 1.2, x + 1.5, 1.75, -7.68); litWindow(c, 1.0, 1.0, x - 1.9, 6.4, -7.68);
      if (i >= 3 && i <= 6) marks[`shop${i - 2}`] = [x, 0.16, -5.6]; }
    if (r() < 0.55) c.g.add(at(old ? barrel() : PROPS.trashBin(), x + 2.6, 0.16, -5.2));
    if (r() < 0.5) c.g.add(at(old ? crate(0.6, { seed: seed + "c" + i }) : flowerBox({ seed: seed + "f" + i }), x - 2.5, 0.16, -5.3));
  }
  for (let i = 0; i < 6; i++) { const x = -27 + i * 10.8; const lp = old ? lampPost({ color: "#2b2f3a" }) : lampPost({ h: 4.2 }); c.g.add(at(lp, x, 0.16, -4.9, -Math.PI / 2)); if (i >= 2 && i <= 3) lampAt(c, x, 3.1, -4.4, 2.6);
    c.glows.push({ m: (lp.children[3] as THREE.Mesh).material as THREE.MeshBasicMaterial, day: 0.35, night: 1, col: new THREE.Color(3, 2.4, 1.4) }); }
  if (old) { c.g.add(at(cart({ load: "barrels", seed }), -9.5, 0, 3.4, 0.3), at(cart({ load: "crates", seed: seed + "2" }), 14, 0, -3.3, 2.9)); c.g.add(at(bench(), 6.4, 0.16, -5.9)); }
  else { for (let i = 0; i < 5; i++) { const tr = tree({ seed: seed + "t" + i, h: 4.4 }); windSway(tr, c.wind, 2); c.g.add(at(tr, -24 + i * 12, 0.16, 6.3)); } c.g.add(at(PROPS.mailbox(), -5.4, 0.16, -5.5), at(PROPS.hydrant(), 4.6, 0.16, -5.0), at(bench(), 9.2, 0.16, -6.1), at(PROPS.parkingMeter(), 1.6, 0.16, -4.95));
    marks.meter = [1.6, 0.16, -4.95]; marks.parking = [1.8, 0, -3.2]; }
  for (const [x, y] of [[-9.6, 13.2], [4.9, 14.6], [12.2, 12.4], [-17, 15.2]] as [number, number][]) smoke(c, x, y, -11.2, { size: 0.7, rise: 4.5, drift: 1.4 });
  [["ALES", -3.4], ["BREAD", 3.6], ["BOOTS", 10.8]].forEach(([t, x], i) => hangSign(c, t as string, (x as number) - 0.7, 4.6, -7.4, 0, { bg: ["#7a2a2a", "#1f4d3a", "#1f2b4d"][i] }));
  if (old) { bunting(c, [-9, 7.2, -7.6], [9, 6.4, 7.0], 16); bunting(c, [12, 7.0, -7.6], [-2, 6.8, 7.0], 14); }
  const crowdSpots: V3[] = [[-6, 0.16, -5.6], [7.5, 0.16, -5.5], [-11, 0.16, -5.9], [12.6, 0.16, -5.7], [16, 0.16, -5.6], [-17, 0.16, -5.5], [-2.6, 0.16, -5.5], [3.4, 0.16, -5.7], [-8.6, 0.16, -5.4], [9.8, 0.16, -5.4]]; // far pavement only: an extra on the camera side stands in front of the lens
  return { marks, wide: { pos: [4.2, 2.1, 12.5], look: [0, 3.2, -6], fov: 44 }, radius: 46, interior: false, crowdSpots };
}

function alley(o: SetOpts, c: Ctx): SetCore {
  const old = (o.era ?? "old") === "old", seed = o.seed ?? "alley", r = rng(seed);
  c.g.add(floorPlane(60, 60, lam({ map: old ? paint.cobble("#8f8474", [16, 16]) : asphalt([10, 10]) }), 0, 0.004, -4));
  const brick = (col: string, rep: [number, number]) => lam({ map: brickTexture(col, "#3e2c28", rep) });
  c.g.add(box(0.6, 10, 26, brick(o.wall ?? "#8a4f3c", [9, 4]), -3.3, 5, -4), box(0.6, 8.5, 26, brick("#7a5a48", [9, 3]), 3.3, 4.25, -4), box(7.2, 9, 0.6, brick("#94604a", [3, 4]), 0, 4.5, -15.3));
  c.g.add(at(rowFacade(9, 15, { color: "#6f5a52", seed: seed + "b" }), 0, 0, -20), at(rowFacade(10, 12, { color: "#7a665c", seed: seed + "f" }), -1, 0, 12.5, Math.PI));
  // doorway + lit window on the left wall, arch and a small window at the back
  c.g.add(at(doorOn("#5a3a26"), -2.98, 0, -3.2, Math.PI / 2)); litWindow(c, 1.1, 1.0, -2.98, 2.0, -5.4, Math.PI / 2); litWindow(c, 0.9, 1.1, -2.98, 5.2, -1.2, Math.PI / 2);
  litWindow(c, 0.9, 1.1, 2.98, 4.6, -7.5, -Math.PI / 2, "#ffc27a"); litWindow(c, 1.2, 1.3, 0.9, 5.4, -14.98, 0, "#ffd9a0");
  c.g.add(at(doorOn("#3f2c20", 1.3, 2.3), -1.1, 0, -14.98));
  const title = o.title ?? o.signs?.[0] ?? (old ? "THE DOG & DUCK" : "BAR"); hangSign(c, title, -3.0, 3.9, -2.2, 0, { w: 1.5 });
  smoke(c, 1.4, 9.2, -16.5, { size: 0.8, rise: 4, drift: 1.2 }); smoke(c, -2.4, 0.3, -12.5, { size: 0.3, rise: 1.6, drift: 0.2, n: 4, color: "#cfd6e6" });
  c.g.add(at(poster("REWARD|FOR|CLIPPERS", 0.8, 1.0), 3.0, 1.9, -3.4, -Math.PI / 2), at(poster("NO|LOITERING", 0.7, 0.7), -3.0, 1.9, 0.6, Math.PI / 2), at(wallShelf(1.4, seed + "ws"), 3.0, 1.5, -10.6, -Math.PI / 2));
  const ln = lantern(); c.g.add(at(ln, -2.55, 2.75, -4.3)); { const gl = { m: (ln.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial, day: 0.5, night: 1.6, k: 1 }; c.glows.push(gl); flickerGlow(c, gl, 3); } lampAt(c, -2.0, 2.7, -4.0, 3.0, "#ffcf8a", 8);
  const ln2 = lantern(); c.g.add(at(ln2, 2.55, 3.0, -9.5)); { const gl = { m: (ln2.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial, day: 0.5, night: 1.6, k: 1 }; c.glows.push(gl); flickerGlow(c, gl, 7); } lampAt(c, 2.0, 2.9, -9.3, 2.2, "#ffcf8a", 7);
  for (const [x, z, k] of [[2.4, -1.6, "b"], [2.5, -2.5, "c"], [2.2, -3.3, "c2"], [-2.5, -8.5, "b"], [2.4, -12.4, "c"], [-2.4, 1.8, "b"], [-2.3, -11.2, "s"]] as [number, number, string][]) {
    const it = k === "b" ? barrel() : k === "s" ? PROPS.sack() : crate(k === "c2" ? 0.46 : 0.66, { seed: seed + x + z }); c.g.add(at(it, x, k === "c2" ? 0.66 : 0, z, r() * 0.6)); }
  c.g.add(cyl(0.07, 0.07, 9, lam({ color: "#3b3f4c" }), 2.9, 4.5, 0.8, 8), box(1.6, 0.05, 0.9, lam({ color: "#6b4a30" }), 2.5, 2.6, -6.2), box(2.2, 0.06, 0.06, lam({ color: "#2b2f3a" }), 0, 6.4, -6));
  for (let i = 0; i < 5; i++) { const cl = box(0.42, 0.55, 0.02, lam({ color: ["#e9dcc6", "#c0392b", "#5b8fd6", "#f4efe6", "#d8a53a"][i] }), -2.2 + i * 1.1, 6.05, -6, false); c.g.add(cl); c.upd.push((f, fps) => { cl.rotation.x = 0.12 * Math.sin((f / fps) * 2.1 + i); }); }
  const marks: Record<string, V3> = { center: [0, 0, 0], left: [-1.2, 0, -0.4], right: [1.2, 0, -0.2], door: [-2.1, 0, -3.2], back: [0, 0, -9.5], corner: [1.7, 0, -6.4], front: [0.5, 0, 3.4], barrelTop: [2.4, 0.95, -1.6] };
  return { marks, wide: { pos: [0.7, 1.7, 8.6], look: [-0.2, 2.6, -6], fov: 42 }, radius: 24, interior: false, crowdSpots: [[1.5, 0, -8], [-1.4, 0, -10.5], [0.4, 0, -12]] as V3[] };
}

function road(o: SetOpts, c: Ctx): SetCore {
  const old = (o.era ?? "modern") === "old", seed = o.seed ?? "road", r = rng(seed);
  c.g.add(floorPlane(500, 500, lam({ map: flat.grass("#74b23c", [60, 60]) }), 0, -0.02, 0));
  c.g.add(floorPlane(220, 7.4, lam({ map: old ? paint.path("#c9a877", [30, 2]) : asphalt([44, 2]) }), 0, 0.006, 0));
  if (!old) { for (let x = -108; x < 110; x += 5) c.g.add(floorPlane(2.4, 0.16, lam({ color: "#f1ede2" }), x, 0.014, 0)); for (const z of [-3.4, 3.4]) c.g.add(floorPlane(220, 0.12, lam({ color: "#f1ede2" }), 0, 0.014, z)); }
  // 9:16: the frame is narrow, so the dressing sits close to the axis and stacks into the distance
  const TR: [number, number, number, boolean][] = [[-4.6, -8.4, 5.4, false], [4.4, -10.5, 4.6, true], [-1.2, -15, 6.2, false], [6.8, -17, 5.2, false], [-8.2, -13, 4.8, true], [2.2, -24, 6.6, false], [-6, -27, 7.2, true], [9.5, -8.5, 4.2, false], [-10, -7.4, 4.4, false], [-3.6, 6.6, 4.6, false], [5.2, 7.4, 5.0, true]];
  TR.forEach(([x, z, h, pine], i) => c.g.add(at(tree({ seed: seed + i, h, kind: pine ? "pine" : "round" }), x, 0, z)));
  for (let i = 0; i < 22; i++) { const x = -100 + i * 9.5 + r() * 3; if (Math.abs(x) < 12) continue; const z = (i % 2 ? -1 : 1) * (7 + r() * 9); c.g.add(at(tree({ seed: seed + "f" + i, h: 3.6 + r() * 2.4, kind: i % 5 === 0 ? "pine" : "round" }), x, 0, z)); }
  for (let i = 0; i < 9; i++) c.g.add(at(fence(8, { color: old ? "#9a7a52" : "#f2ece0", h: 0.8 }), -36 + i * 9, 0, -5.6));
  for (let i = 0; i < 6; i++) { const hl = new THREE.Mesh(new THREE.SphereGeometry(26 + r() * 14, 24, 12), lam({ color: ["#5fa63c", "#6cb044", "#4f9636"][i % 3] })); hl.scale.y = 0.42; hl.receiveShadow = true; c.g.add(at(hl, -60 + i * 26, -4, -58 - (i % 2) * 22)); }
  c.g.add(at(house({ w: 6, d: 6, h: 4.6, seed: seed + "farm", wall: "#e9dcc6", roof: "#a8553c" }), 1.6, 0, -20), at(house({ w: 8, d: 7, h: 6, seed: seed + "barn", wall: "#a8453a", roof: "#5a4a4a" }), -9, 0, -24, 0.3));
  for (const [x, z] of [[3.4, -7.2], [-2.8, -9.6], [7.2, -12.4]] as [number, number][]) { const hay = cyl(0.7, 0.7, 1.1, lam({ map: paint.planks("#d8b04a", [6, 1], true) }), 0, 0.7, 0, 16); hay.rotation.z = Math.PI / 2; hay.rotation.y = x; c.g.add(at(hay, x, 0.7, z)); }
  const sign = PROPS.sign({ text: o.title ?? (old ? "LONDON 12" : "NEXT EXIT"), color: old ? "#f4efe6" : "#2f8f6a" }); c.g.add(at(sign, 2.6, 0, -4.5));
  if (!old) for (let i = 0; i < 6; i++) c.g.add(at(lampPost({ h: 5 }), -47 + i * 20, 0, -4.4, -Math.PI / 2));
  const marks: Record<string, V3> = { center: [0, 0, 0], roadL: [-60, 0, 1.7], roadR: [60, 0, 1.7], roadL2: [-60, 0, -1.7], roadR2: [60, 0, -1.7], roadside: [-1.4, 0, -4.4], sign: [2.6, 0, -4.5], verge: [-1.8, 0, 4.4], stop: [0.6, 0, 1.7] };
  return { marks, wide: { pos: [3.4, 2.2, 12.5], look: [0, 2.6, -6], fov: 46 }, radius: 50, interior: false, crowdSpots: [[-4, 0, -4.6], [5.4, 0, -4.7], [-6, 0, 4.8]] as V3[] };
}

function yard(o: SetOpts, c: Ctx): SetCore {
  const seed = o.seed ?? "yard";
  c.g.add(floorPlane(300, 300, lam({ map: paint.grass("#67a548", [50, 50]) }), 0, -0.01, 0));
  c.g.add(at(house({ w: 11, d: 7, h: 6.4, floors: 2, wall: o.wall ?? "#f0dfbd", roof: "#a8553c", seed }), 0, 0, -11.5));
  c.g.add(at(doorOn("#3d6b8a"), -2.6, 0, -7.96)); litWindow(c, 1.5, 1.3, 0.6, 1.8, -7.97, 0, "#ffe2a0"); litWindow(c, 1.3, 1.2, 2.8, 4.8, -7.97, 0, "#ffe2a0"); litWindow(c, 1.3, 1.2, -2.2, 4.8, -7.97, 0, "#ffe2a0");
  c.g.add(floorPlane(4.4, 2.4, lam({ map: flat.tiles("#c9b8a4", "#8d7a68", 6, [4, 2]) }), -2.2, 0.01, -6.6));
  for (const [x, z, ry, len] of [[-7.5, -1, Math.PI / 2, 20], [7.5, -1, Math.PI / 2, 20], [0, 9, 0, 15]] as [number, number, number, number][]) c.g.add(at(fence(len, { h: 1.1 }), x, 0, z, ry));
  c.g.add(at(tree({ seed: seed + "a", h: 5.8 }), -5.4, 0, -4.6), at(tree({ seed: seed + "b", h: 4.6 }), 5.8, 0, -5.6), at(tree({ seed: seed + "c", h: 6.4, kind: "pine" }), -9.5, 0, -7), at(tree({ seed: seed + "d", h: 5, kind: "pine" }), 9.2, 0, -9));
  for (let i = 0; i < 6; i++) c.g.add(at(rowFacade(9, 8 + (i % 3) * 2.5, { color: ["#e6d2b0", "#d5c0c8", "#c9d6e4"][i % 3], seed: seed + "n" + i }), -26 + i * 10.5, 0, -26));
  c.g.add(at(flowerBox({ w: 2, seed }), 1.2, 0, -7.6), at(flowerBox({ w: 1.6, seed: seed + "2" }), -4.6, 0, -7.6));
  const bbq = new THREE.Group(); const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 8, 0, 7, 1.6, 1.6), lam({ color: "#2b2f3a", side: THREE.DoubleSide })); bowl.position.y = 0.95; bbq.add(bowl);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const l = box(0.04, 0.8, 0.04, lam({ color: "#2b2f3a" }), Math.cos(a) * 0.2, 0.4, Math.sin(a) * 0.2); l.rotation.set(Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18); bbq.add(l); }
  c.g.add(at(bbq, -4.2, 0, -3.4));
  const marks: Record<string, V3> = { center: [0, 0, 1.6], lawn: [-1.4, 0, 1.8], left: [-2.2, 0, 1.4], right: [1.6, 0, 1.9], door: [-2.6, 0, -7.1], bbq: [-3.3, 0, -3.0], fence: [6.4, 0, 2] };
  if (o.pool) {
    const W = 4.6, D = 3.0, px = 0.9, pz = -1.9, rim = lam({ map: flat.tiles("#e9e2d2", "#b8ae9c", 6, [8, 1]) });
    c.g.add(box(W + 0.9, 0.12, 0.45, rim, px, 0.06, pz - D / 2 - 0.22), box(W + 0.9, 0.12, 0.45, rim, px, 0.06, pz + D / 2 + 0.22), box(0.45, 0.12, D, rim, px - W / 2 - 0.22, 0.06, pz), box(0.45, 0.12, D, rim, px + W / 2 + 0.22, 0.06, pz));
    const wtr = toonWater(W, D, { far: "#49c3e6", near: "#2aa9d8", crest: "#bdf0ff" }); wtr.mesh.position.set(px, 0.04, pz); c.g.add(wtr.mesh); c.upd.push((f, fps) => wtr.update(f, fps));
    const lad = new THREE.Group(); for (const sx of [-1, 1]) { const rr = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 12, Math.PI), lam({ color: "#d9dde6" })); rr.position.set(sx * 0.22, 0.12, 0); rr.rotation.y = Math.PI / 2; lad.add(rr); } c.g.add(at(lad, px - W / 2 - 0.1, 0, pz + 0.7));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.15, 10, 20), lam({ color: "#ff7a59" })); ring.rotation.x = Math.PI / 2; ring.position.set(px + 1.3, 0.12, pz - 0.5); c.g.add(ring); c.upd.push((f, fps) => { ring.position.y = 0.12 + 0.02 * Math.sin((f / fps) * 1.7); ring.rotation.z = (f / fps) * 0.2; });
    const par = new THREE.Group(); par.add(cyl(0.03, 0.03, 2.4, lam({ color: "#e9e2d2" }), 0, 1.2, 0, 8)); const top = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.5, 8), lam({ map: flat.tiles("#e2483a", "#f4efe6", 4, [4, 1]) })); top.position.y = 2.5; top.castShadow = true; par.add(top); c.g.add(at(par, px + 2.2, 0, pz - D / 2 - 1.3));
    const ch = new THREE.Group(); ch.add(box(0.7, 0.08, 1.7, lam({ color: "#f4efe6" }), 0, 0.3, 0)); const bk = box(0.7, 0.08, 0.7, lam({ color: "#f4efe6" }), 0, 0.55, -0.9); bk.rotation.x = 0.7; ch.add(bk); for (const z of [-0.6, 0.6]) ch.add(box(0.6, 0.3, 0.05, lam({ color: "#8a8f9a" }), 0, 0.15, z)); c.g.add(at(ch, px + 3.0, 0, pz + 1.3, 0.3));
    Object.assign(marks, { poolside: [px - W / 2 - 0.9, 0, pz + 0.9] as V3, pool: [px - 0.7, -0.75, pz + 0.5] as V3, pool2: [px + 0.9, -0.75, pz - 0.2] as V3, deckChair: [px + 3.0, 0, pz + 1.3] as V3 });
  } else { c.g.add(at(shadowed(table(1.5, 0.9)), 1.6, 0, -1.6), at(shadowed(stool()), 0.5, 0, -1.5), at(shadowed(stool()), 2.7, 0, -1.7)); Object.assign(marks, { table: [1.6, 0, -0.8] as V3, tableTop: [1.6, 0.78, -1.6] as V3 }); }
  return { marks, wide: { pos: [1.2, 2.5, 11.5], look: [0.4, 2.2, -4], fov: 46 }, radius: 30, interior: false, crowdSpots: [[-4.4, 0, 3.6], [3.6, 0, 4.2], [5.4, 0, 1.2], [-5.4, 0, -0.5]] as V3[] };
}

/** Three walls of a room (no ceiling, open toward +z). */
/** Three walls of a room, open toward +z, with a beamed ceiling. Composed for 9:16: at fov 44 the frame is only about
 *  0.45 x distance wide, so rooms are narrow and TALL and the dressing stacks upward (shelves, signs, lamps, beams).
 *  Walls and ceiling do not cast sun shadows: the key light acts as soft room light, props and people still shadow. */
function room(c: Ctx, W: number, D: number, H: number, wall: THREE.Texture | string, floor: THREE.Material, trim?: string, ceil = "#e9e2d2") {
  c.g.add(floorPlane(W + 0.6, D + 8.6, floor, 0, 0.003, 4)); c.g.add(floorPlane(160, 160, lam({ color: "#3a3540" }), 0, -0.03, 0));
  const walls = [at(wallPanel(W + 0.6, H, wall, trim), 0, 0, -D / 2 - 0.15), at(wallPanel(D + 8, H, wall, trim), -W / 2 - 0.15, 0, 4, Math.PI / 2), at(wallPanel(D + 8, H, wall, trim), W / 2 + 0.15, 0, 4, -Math.PI / 2)];
  const cl = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, D + 8.6), lam({ color: ceil })); cl.rotation.x = Math.PI / 2; cl.position.set(0, H, 4); walls.push(cl as unknown as THREE.Group);
  for (let z = -D / 2 + 0.8; z < D / 2 + 8; z += 1.9) walls.push(box(W + 0.6, 0.22, 0.24, lam({ color: trim ?? "#6b4a30" }), 0, H - 0.11, z, false) as unknown as THREE.Group);
  for (const w of walls) { w.traverse((o) => { o.castShadow = false; }); c.g.add(w); }
  return { camBox: { min: [-W / 2 + 0.5, 0.3, -D / 2 + 1.2] as V3, max: [W / 2 - 0.5, H - 0.5, D / 2 + 7.2] as V3 } };
}
const paneMat = (c: Ctx) => { const m = new THREE.MeshBasicMaterial({ color: "#bfe6ff" }); c.panes.push(m); return m; };
function viewWindow(c: Ctx, w: number, h: number, x: number, y: number, z: number, old: boolean, seed: string, arch = false) {
  const g = windowOn(w, h, paneMat(c), old ? "#5a3a26" : "#f4efe6", arch);
  const sk = new THREE.Mesh(new THREE.PlaneGeometry(w, h * 0.55), new THREE.MeshBasicMaterial({ map: skylineTex(seed, old), transparent: true })); sk.position.set(0, -h * 0.225, 0.03); g.add(sk);
  c.g.add(at(g, x, y, z)); return g;
}

function shop(o: SetOpts, c: Ctx): SetCore {
  const old = (o.era ?? "old") === "old", seed = o.seed ?? "shop", W = 7.6, D = 7, H = 5.4;
  const rm = room(c, W, D, H, old ? wallpaper(o.wall ?? "#d9c7a0", "#cdb98e", seed, [4, 2]) : wallpaper(o.wall ?? "#e8e4da", "#dedad0", seed, [4, 2]), lam({ map: paint.planks(old ? "#9a6b45" : "#c9a877", [6, 9], false) }), old ? "#6b4a30" : "#b8a88e");
  c.g.add(at(shelfUnit(2.3, 3.9, "goods", seed + "a"), -2.45, 0, -D / 2 + 0.26), at(shelfUnit(2.3, 3.9, "goods", seed + "b"), 2.45, 0, -D / 2 + 0.26), at(shelfUnit(2.6, 3.2, "goods", seed + "c"), W / 2 - 0.24, 0, -0.6, -Math.PI / 2), at(shelfUnit(2.2, 2.6, "goods", seed + "d"), -W / 2 + 0.24, 0, -1.4, Math.PI / 2));
  viewWindow(c, 1.6, 1.6, 0, 2.3, -D / 2 + 0.02, old, seed);
  c.g.add(at(doorOn(old ? "#5a3a26" : "#3d6b8a"), -W / 2 + 0.02, 0, 1.6, Math.PI / 2));
  const cw = 3.4, cx = 0.5, cz = -1.2; const wood = lam({ map: paint.planks(old ? "#7a4a2a" : "#8a6a4a", [4, 1], true) });
  c.g.add(box(cw, 0.96, 0.8, wood, cx, 0.48, cz), box(cw + 0.2, 0.08, 0.96, lam({ color: old ? "#4a2f1c" : "#e9e2d2" }), cx, 1.0, cz));
  for (let i = 0; i < 4; i++) c.g.add(box(cw / 4 - 0.16, 0.6, 0.03, lam({ color: old ? "#8a5a34" : "#9a7a5a" }), cx - cw / 2 + (i + 0.5) * (cw / 4), 0.48, cz + 0.41, false));
  c.g.add(at(old ? PROPS.scales() : box(0.5, 0.32, 0.4, lam({ color: "#39404e" }), 0, 0.16, 0), cx + 1.25, 1.04, cz));
  const title = signBoard(o.title ?? (old ? "GOLDSMITH" : "SHOP"), { w: 4.2, h: 0.72, bg: old ? "#2b2230" : "#1f2b4d", fg: "#f1c94a" }); c.g.add(at(title, 0, H - 0.62, -D / 2 + 0.1));
  const hl = hangingLamp(1.3, !old); c.g.add(at(hl.group, 0.3, H, 0.2)); c.glows.push({ m: hl.bulb, day: 0.6, night: 1.8 }); lampAt(c, 0.3, H - 1.5, 0.4, 3.2, "#ffdcae", 10);
  c.g.add(at(rug(3.0, 2.0), 0.2, 0, 1.5), at(barrel(), -3.1, 0, 0.2), at(PROPS.sack(), -2.9, 0, 0.9), at(crate(0.7, { seed }), 3.0, 0, 1.8, 0.3), at(PROPS.plant(), 3.1, 0, 3.0));
  const marks: Record<string, V3> = { keeper: [cx + 0.55, 0, cz - 0.9], customer: [-0.8, 0, 0.6], customer2: [1.5, 0, 1.0], door: [-W / 2 + 1.0, 0, 1.6], shelf: [2.4, 0, -D / 2 + 1.1], counterTop: [cx - 0.7, 1.04, cz + 0.05], counterTop2: [cx + 0.2, 1.04, cz + 0.1], center: [0.2, 0, 0.8] };
  // 1.8 dressing + life: the walls above head height carry the detail, the floor edges the clutter, the middle stays clear
  const trimC = old ? "#6b4a30" : "#b8a88e";
  hangingRow(c, 2.4, old ? "sausages" : "pots", cx, 3.72, cz - 0.15); // below the title board, above every head
  curtains(c, 1.6, 1.6, 0, 2.3, -D / 2 + 0.05, old ? "#a8423a" : "#3d6b8a");
  c.g.add(at(wallShelf(2.0, seed + "w1"), -W / 2 + 0.02, 3.5, -1.4, Math.PI / 2), at(wallShelf(1.6, seed + "w2"), -W / 2 + 0.02, 4.2, -1.4, Math.PI / 2),
    at(poster(old ? "FRESH|BREAD|1d" : "SALE|TODAY", 0.8, 1.0), W / 2 - 0.02, 4.15, -0.6, -Math.PI / 2), at(picture(0.9, 0.7, "#5b8fd6"), -W / 2 + 0.02, 2.7, 3.0, Math.PI / 2),
    at(poster("OPEN", 0.7, 0.4, "#2f8f6a", "#f4efe6"), W / 2 - 0.02, 2.3, 2.7, -Math.PI / 2), at(pilaster(H, trimC), -1.17, 0, -D / 2 + 0.02), at(pilaster(H, trimC), 1.17, 0, -D / 2 + 0.02),
    at(shadowed(stool()), 2.3, 0, -0.1), at(crate(0.5, { seed: seed + "c2" }), 3.05, 0.7, 1.85, 0.6), at(PROPS.sack(), -3.3, 0, 2.2, 0.4));
  for (let i = 0; i < 3; i++) c.g.add(cyl(0.07, 0.07, 0.2 - i * 0.03, lam({ color: ["#d8a53a", "#c0392b", "#6aa84f"][i] }), cx - 1.55 + i * 0.17, 1.14 - i * 0.015, cz - 0.2, 10));
  c.g.add(cyl(0.06, 0.09, 0.07, lam({ color: "#d8b04a" }), cx + 0.78, 1.075, cz + 0.22, 10));
  const broom = new THREE.Group(); broom.add(box(0.04, 1.5, 0.04, lam({ color: "#b98a52" }), 0, 0.75, 0, false), box(0.3, 0.22, 0.08, lam({ color: "#d8b04a" }), 0, 0.11, 0, false)); broom.rotation.z = 0.16; c.g.add(at(broom, -3.55, 0, -2.3));
  sway(c, hl.group, "z", 0.03, 1.1, 1);
  return { marks, wide: { pos: [0.3, 1.8, 8.6], look: [0.1, 2.3, -2], fov: 46 }, radius: 14, interior: true, crowdSpots: [[-2.4, 0, 2.2], [2.6, 0, 0.4]] as V3[], ...rm };
}

function workshop(o: SetOpts, c: Ctx): SetCore {
  const old = (o.era ?? "old") === "old" && !o.garage, seed = o.seed ?? "workshop", W = o.garage ? 9 : 8, D = 7.4, H = 5.2;
  const rm = room(c, W, D, H, old ? brickTexture(o.wall ?? "#8f6a58", "#3e2c28", [4, 3]) : wallpaper(o.wall ?? "#cfd4d8", "#c4c9ce", seed, [4, 2]), old ? lam({ map: flat.stone("#9a8f85", "#6f665e", [5, 8]) }) : lam({ map: asphalt([3, 5]), color: "#b9bcc6" }), old ? "#4a3626" : "#8a8f9a", old ? "#8a7a6a" : "#e9e6de");
  const bx = -2.1, bz = -D / 2 + 0.75; c.g.add(at(shadowed(table(2.8, 0.9, 0.95, "#7a5234")), bx, 0, bz));
  c.g.add(box(3.0, 1.6, 0.06, lam({ map: paint.planks(old ? "#7a5640" : "#b9a27a", [5, 1], true) }), bx, 2.3, -D / 2 + 0.2, false)); // 1.8: a plank rack (a flat #a8875e board filled half of every close-up with one orange plane; a very dark one read as one mass with the brick)
  const tool = lam({ color: "#8d96a6" }), grip = lam({ color: "#b0603a" });
  for (let i = 0; i < 6; i++) { const tx = bx - 1.2 + i * 0.48, t = new THREE.Group(); t.add(box(0.06, 0.5, 0.04, grip, 0, -0.1, 0, false));
    if (i % 3 === 0) t.add(box(0.3, 0.14, 0.08, tool, 0, 0.2, 0, false)); else if (i % 3 === 1) t.add(box(0.05, 0.5, 0.03, tool, 0, 0.36, 0, false)); else { const d = cyl(0.12, 0.12, 0.03, tool, 0, 0.26, 0, 10); d.rotation.x = Math.PI / 2; t.add(d); }
    c.g.add(at(t, tx, 2.3, -D / 2 + 0.26)); }
  c.g.add(box(0.3, 0.22, 0.24, tool, bx + 1.05, 1.06, bz + 0.2), at(PROPS.candle(), bx - 1.05, 0.95, bz + 0.1));
  viewWindow(c, 1.4, 1.5, old ? 0.3 : -0.2, 3.3, -D / 2 + 0.02, old, seed);
  c.g.add(at(doorOn("#4a3626", 1.3, 2.3), -W / 2 + 0.02, 0, 1.8, Math.PI / 2), at(shelfUnit(2.0, 1.4, "goods", seed + "s"), bx, 3.25, -D / 2 + 0.26));
  const marks: Record<string, V3> = { bench: [bx + 0.3, 0, bz + 1.05], benchTop: [bx - 0.35, 0.97, bz + 0.1], benchTop2: [bx + 0.45, 0.97, bz + 0.12], visitor: [0.9, 0, 1.4], door: [-W / 2 + 1.0, 0, 1.8], center: [0, 0, 0.8] };
  if (o.garage) {
    c.g.add(box(4.2, 3.4, 0.1, lam({ map: flat.tiles("#d9dde6", "#9aa2b4", 1, [1, 10]) }), 2.1, 1.7, -D / 2 + 0.06, false), box(1.0, 1.2, 0.6, lam({ color: "#c0392b" }), W / 2 - 0.7, 0.6, -2.2), box(1.04, 0.06, 0.64, lam({ color: "#2b2f3a" }), W / 2 - 0.7, 1.23, -2.2));
    for (let i = 0; i < 4; i++) { const ty = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.13, 8, 16), lam({ color: "#23252e" })); ty.rotation.x = Math.PI / 2; ty.position.set(W / 2 - 0.9, 0.13 + i * 0.26, 1.4); ty.castShadow = true; c.g.add(ty); }
    c.g.add(at(shelfUnit(2.0, 2.8, "goods", seed + "g"), W / 2 - 0.24, 0, -0.2, -Math.PI / 2)); marks.bay = [1.9, 0, -0.4]; marks.visitor = [-1.2, 0, 1.9];
    const hl = hangingLamp(1.2, true); c.g.add(at(hl.group, 1.2, H, -0.3)); c.glows.push({ m: hl.bulb, day: 0.8, night: 1.8 }); lampAt(c, 1.2, H - 1.5, -0.1, 3.4, "#f4f0e6", 11);
  } else {
    const fx = 2.7, fz = -D / 2 + 0.9; c.g.add(box(1.9, 1.2, 1.4, lam({ map: brickTexture("#7a4a3a", "#3e2c28", [2, 1]) }), fx, 0.6, fz), box(1.3, 3.9, 1.0, lam({ map: brickTexture("#6f4436", "#3e2c28", [1, 4]) }), fx, 3.15, fz - 0.2));
    const fire = new THREE.MeshLambertMaterial({ color: "#ff8a3a", emissive: new THREE.Color("#ff6a1a"), emissiveIntensity: 1.6 }); c.g.add(box(1.15, 0.3, 0.9, fire, fx, 1.3, fz + 0.1, false)); { const gl = { m: fire, day: 1.2, night: 2.2, k: 1 }; c.glows.push(gl); flickerGlow(c, gl, 11); }
    smoke(c, fx, 1.6, fz + 0.25, { size: 0.32, rise: 2.4, drift: 0.05, n: 5, color: "#bfb6c6" }); sparks(c, fx, 1.45, fz + 0.3);
    for (let i = 0; i < 4; i++) { const lg = cyl(0.11, 0.11, 0.7, lam({ map: paint.planks("#6b4a30", [1, 1], true) }), fx + 1.0, 0.11 + (i > 1 ? 0.2 : 0), fz + 0.9 + (i % 2) * 0.24 + (i > 1 ? 0.12 : 0), 8); lg.rotation.z = Math.PI / 2; c.g.add(lg); }
    const fl = lampAt(c, fx - 0.2, 1.7, fz + 0.9, 2.6, "#ff9a4a", 7); c.upd.push((f, fps) => { fl.userData.flick = 0.85 + 0.15 * Math.sin((f / fps) * 9.1) * Math.sin((f / fps) * 5.3 + 1.2); });
    c.g.add(cyl(0.3, 0.34, 0.6, lam({ map: paint.planks("#6b4a30", [2, 1], true) }), 1.2, 0.3, -0.9)); const anvil = new THREE.Group(); anvil.add(box(0.7, 0.14, 0.26, tool, 0, 0.3, 0), box(0.3, 0.2, 0.2, tool, 0, 0.14, 0), box(0.5, 0.08, 0.3, tool, 0, 0.04, 0)); const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 8), tool); horn.rotation.z = -Math.PI / 2; horn.position.set(0.5, 0.3, 0); anvil.add(horn); c.g.add(at(shadowed(anvil), 1.2, 0.6, -0.9));
    c.g.add(at(barrel(), 3.3, 0, 0.8), at(crate(0.7, { seed }), -3.3, 0, -0.6), at(PROPS.sack(), 3.2, 0, 2.6));
    const hl = hangingLamp(1.4); c.g.add(at(hl.group, -0.8, H, -0.4)); c.glows.push({ m: hl.bulb, day: 0.6, night: 1.8 }); lampAt(c, -0.8, H - 1.6, -0.2, 2.8, "#ffd9a0", 9);
    Object.assign(marks, { anvil: [0.3, 0, -0.4] as V3, anvilTop: [1.2, 0.98, -0.9] as V3, forge: [2.0, 0, -1.6] as V3 });
  }
  // 1.8 dressing + life
  c.g.add(at(wallShelf(1.8, seed + "w1"), W / 2 - 0.02, 2.3, 1.0, -Math.PI / 2), at(wallShelf(1.5, seed + "w2"), W / 2 - 0.02, 3.1, 1.0, -Math.PI / 2), at(cabinet(1.3, 1.1, 0.5), -W / 2 + 0.3, 0, 0.1, Math.PI / 2),
    at(poster(old ? "KING'S|WEIGHTS" : "SAFETY|FIRST", 0.8, 1.0), -W / 2 + 0.02, 2.7, -1.5, Math.PI / 2), at(picture(0.7, 0.9, "#2f8f6a", "#6b4a30"), -W / 2 + 0.02, 3.2, 2.6, Math.PI / 2),
    at(pilaster(H, old ? "#4a3626" : "#8a8f9a"), -0.55, 0, -D / 2 + 0.02), cyl(0.2, 0.16, 0.34, lam({ color: "#6f7888" }), bx + 1.95, 0.17, bz + 1.0, 12));
  hangingRow(c, 2.0, "tools", old ? -0.2 : -0.4, H - 1.25, -D / 2 + 0.7);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.06, 8, 18), lam({ color: "#c9a46a" })); c.g.add(at(coil, W / 2 - 0.08, 1.7, -1.7, -Math.PI / 2));
  const chain = new THREE.Group(); for (let i = 0; i < 9; i++) { const ln = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 5, 8), lam({ color: "#3b3f4c" })); ln.position.y = -i * 0.085; ln.rotation.y = i % 2 ? Math.PI / 2 : 0; chain.add(ln); }
  chain.add(box(0.1, 0.16, 0.04, lam({ color: "#3b3f4c" }), 0, -0.86, 0, false)); c.g.add(at(chain, old ? 0.6 : 3.0, H - 0.2, 1.6)); sway(c, chain, "z", 0.06, 1.3, 2);
  return { marks, wide: { pos: [0.3, 1.8, 8.8], look: [0.1, 2.2, -2], fov: 46 }, radius: 15, interior: true, crowdSpots: [[2.6, 0, 2.2], [-2.8, 0, 2.8]] as V3[], ...rm };
}

function office(o: SetOpts, c: Ctx): SetCore {
  const old = (o.era ?? "modern") === "old", seed = o.seed ?? "office", W = 7.8, D = 7.2, H = 5.2;
  const rm = room(c, W, D, H, wallpaper(o.wall ?? (old ? "#6f8a7a" : "#dfe6ee"), o.wall ? "#" + new THREE.Color(o.wall).multiplyScalar(0.9).getHexString() : old ? "#64806f" : "#d3dce6", seed, [4, 2]), lam({ map: paint.planks(old ? "#7a5234" : "#b9905e", [6, 9], false) }), old ? "#4a3626" : "#f4efe6");
  // 1.8: a dark wainscot under a light wall, so a dark coat and hat silhouette against the upper wall (reviewer: one teal plane)
  if (old) { const wm = lam({ map: paint.planks("#2f4a3e", [8, 1], true) }); c.g.add(box(W, 1.15, 0.08, wm, 0, 0.575, -D / 2 + 0.05, false), box(0.08, 1.15, D + 6, wm, -W / 2 + 0.05, 0.575, 3, false), box(W, 0.07, 0.12, lam({ color: "#c9a23a" }), 0, 1.18, -D / 2 + 0.07, false)); }
  viewWindow(c, 2.2, 2.3, -1.3, 2.7, -D / 2 + 0.02, old, seed, old); viewWindow(c, 1.2, 2.3, 1.3, 2.7, -D / 2 + 0.02, old, seed + "2", old);
  c.g.add(at(shelfUnit(2.6, 3.9, "books", seed), -W / 2 + 0.24, 0, -0.9, Math.PI / 2), at(shelfUnit(1.3, 3.9, "books", seed + "b"), 3.0, 0, -D / 2 + 0.26));
  const dx = 0.5, dz = -1.3; const wood = lam({ map: paint.planks(old ? "#6b3f26" : "#a57a4e", [3, 1], false) });
  c.g.add(box(2.5, 0.09, 1.1, wood, dx, 0.8, dz), box(0.7, 0.72, 1.0, wood, dx - 0.85, 0.38, dz), box(0.7, 0.72, 1.0, wood, dx + 0.85, 0.38, dz), box(2.3, 0.5, 0.04, wood, dx, 0.5, dz + 0.5, false));
  c.g.add(at(shadowed(chair(old ? "#5a2f2a" : "#39404e")), dx, 0, dz - 0.95), at(PROPS.papers(), dx - 0.6, 0.845, dz + 0.05), at(PROPS.book(), dx + 0.75, 0.845, dz - 0.15, 0.3));
  if (old) { c.g.add(at(PROPS.candle(), dx + 0.95, 0.845, dz + 0.3)); const quill = box(0.02, 0.34, 0.06, lam({ color: "#f4efe6" }), dx + 0.2, 1.0, dz + 0.2, false); quill.rotation.z = -0.5; c.g.add(quill, cyl(0.05, 0.06, 0.08, lam({ color: "#23252e" }), dx + 0.28, 0.885, dz + 0.2, 8)); }
  else { c.g.add(box(0.7, 0.44, 0.04, lam({ color: "#23252e" }), dx + 0.1, 1.2, dz - 0.2), box(0.08, 0.2, 0.08, lam({ color: "#6f7888" }), dx + 0.1, 0.94, dz - 0.2), box(0.5, 0.02, 0.18, lam({ color: "#d9dde6" }), dx + 0.1, 0.855, dz + 0.2, false)); }
  const globe = new THREE.Group(); globe.add(cyl(0.12, 0.16, 0.06, lam({ color: "#6b3f26" }), 0, 0.03, 0)); const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), lam({ map: paint.planet() })); ball.position.y = 0.3; ball.castShadow = true; globe.add(ball); c.g.add(at(globe, -W / 2 + 0.8, 0.9, 2.2), box(0.5, 0.9, 0.5, lam({ color: old ? "#5a3a26" : "#f4efe6" }), -W / 2 + 0.8, 0.45, 2.2));
  const pic = (x: number, y: number, col: string) => { const g = new THREE.Group(); g.add(box(0.9, 0.7, 0.05, lam({ color: "#c9a23a" }), 0, 0, 0, false), box(0.74, 0.54, 0.02, lam({ color: col }), 0, 0, 0.03, false)); c.g.add(at(g, x, y, -D / 2 + 0.2)); };
  pic(0.35, 4.35, "#5b8fd6"); pic(3.0, 4.45, "#c0392b"); pic(-2.4, 4.4, "#2f8f6a");
  const clock = new THREE.Group(); clock.add(cyl(0.3, 0.3, 0.06, lam({ color: "#3a2618" }), 0, 0, 0, 20).rotateX(Math.PI / 2), cyl(0.25, 0.25, 0.062, lam({ color: "#f4efe6" }), 0, 0, 0.005, 20).rotateX(Math.PI / 2)); const hand = box(0.02, 0.2, 0.01, lam({ color: "#1c1216" }), 0, 0.09, 0.04, false); clock.add(hand); c.g.add(at(clock, W / 2 - 0.2, 3.3, -1.2, -Math.PI / 2), at(shelfUnit(2.2, 2.2, "books", seed + "c"), W / 2 - 0.24, 0, -1.2, -Math.PI / 2));
  c.upd.push((f, fps) => { hand.position.set(Math.sin(f / fps * 0.4) * 0.09, Math.cos(f / fps * 0.4) * 0.09, 0.04); hand.rotation.z = -(f / fps) * 0.4; });
  c.g.add(at(doorOn(old ? "#5a3a26" : "#f4efe6"), W / 2 - 0.02, 0, 1.6, -Math.PI / 2), at(rug(3.6, 2.4, old ? "#7a2f3a" : "#3b5a8a"), 0.3, 0, 1.0), at(PROPS.plant(), 3.2, 0, 3.0), at(shadowed(chair(old ? "#5a2f2a" : "#6f7888")), -1.6, 0, 0.7, 2.6));
  const hl = hangingLamp(1.3, !old); c.g.add(at(hl.group, 0.3, H, 0.2)); c.glows.push({ m: hl.bulb, day: 0.6, night: 1.8 }); lampAt(c, 0.3, H - 1.5, 0.4, 3.0, old ? "#ffd9a0" : "#fff3dc", 10);
  const marks: Record<string, V3> = { desk: [dx + 0.05, 0, dz - 0.75], deskTop: [dx - 0.1, 0.85, dz + 0.1], deskTop2: [dx + 0.6, 0.85, dz + 0.2], guest: [-0.8, 0, 0.9], guest2: [1.7, 0, 1.1], window: [-1.3, 0, -D / 2 + 1.0], door: [W / 2 - 1.0, 0, 1.6], books: [-W / 2 + 1.1, 0, -0.9], center: [0.3, 0, 0.8] };
  // 1.8 dressing + life
  const cur = old ? "#7a2f3a" : "#3b5a8a";
  curtains(c, 2.2, 2.3, -1.3, 2.7, -D / 2 + 0.05, cur); // (the small window has none: two pairs of drapes hid the whole wall behind the desk)
  c.g.add(at(cabinet(1.2, 1.3, 0.5, old ? "#6b3f26" : "#b9905e"), -W / 2 + 0.3, 0, 2.4, Math.PI / 2), at(poster(old ? "MAP OF|LONDON" : "PLAN|2026", 1.1, 0.9, "#e9dcc6"), W / 2 - 0.02, 2.5, 3.0, -Math.PI / 2),
    at(picture(0.8, 1.0, "#7a4a8a"), -W / 2 + 0.02, 4.4, 1.4, Math.PI / 2), at(wallShelf(1.6, seed + "w"), W / 2 - 0.02, 4.25, -1.2, -Math.PI / 2), at(PROPS.chest(), -W / 2 + 0.75, 0, 3.6, Math.PI / 2),
    at(pilaster(H, old ? "#4a3626" : "#f4efe6"), 0.2, 0, -D / 2 + 0.02), at(PROPS.candle(), -W / 2 + 0.3, 1.36, 2.2));
  for (let i = 0; i < 4; i++) c.g.add(at(PROPS.book({ color: ["#8a2f2a", "#2f6fb0", "#2f8f6a", "#c9a23a"][i] }), 2.2 + (i % 2) * 0.03, i * 0.075, -2.6, i * 0.25));
  sconce(c, -W / 2 + 0.04, 3.0, 0.4, Math.PI / 2); sconce(c, W / 2 - 0.04, 3.0, 0.3, -Math.PI / 2);
  const rack = new THREE.Group(); rack.add(cyl(0.03, 0.03, 1.8, lam({ color: "#4a2f1c" }), 0, 0.9, 0, 8), cyl(0.22, 0.26, 0.05, lam({ color: "#4a2f1c" }), 0, 0.025, 0, 12));
  for (let i = 0; i < 3; i++) { const pg = box(0.24, 0.03, 0.03, lam({ color: "#4a2f1c" }), 0.1, 1.7, 0, false); const pv = new THREE.Group(); pv.rotation.y = (i / 3) * Math.PI * 2; pv.add(pg); rack.add(pv); }
  rack.add(box(0.34, 0.7, 0.1, lam({ color: old ? "#3a2f36" : "#6f7888" }), 0.2, 1.3, 0, false)); c.g.add(at(shadowed(rack), W / 2 - 0.55, 0, 3.3));
  const pend = new THREE.Group(); pend.position.set(W / 2 - 0.2, 3.02, -1.2); pend.add(box(0.015, 0.5, 0.015, lam({ color: "#c9a23a" }), 0, -0.25, 0, false), cyl(0.07, 0.07, 0.02, lam({ color: "#c9a23a" }), 0, -0.52, 0, 12).rotateZ(Math.PI / 2)); c.g.add(pend); sway(c, pend, "x", 0.28, 3.1, 0);
  sway(c, hl.group, "z", 0.03, 1.0, 2);
  return { marks, wide: { pos: [0.3, 1.8, 8.6], look: [0.2, 2.3, -2], fov: 46 }, radius: 14, interior: true, crowdSpots: [[2.7, 0, 2.4]] as V3[], ...rm };
}

function hall(o: SetOpts, c: Ctx): SetCore {
  const old = (o.era ?? "old") === "old", seed = o.seed ?? "hall", W = 13, D = 15, H = 9.5;
  const rm = room(c, W, D, H, old ? brickTexture(o.wall ?? "#a8826a", "#3e2c28", [7, 5]) : wallpaper(o.wall ?? "#d8dce4", "#cdd2dc", seed, [7, 4]), lam({ map: old ? flat.stone("#b8ab9c", "#8a7f74", [6, 10]) : flat.tiles("#d9d4c8", "#a8a294", 6, [4, 7]) }), old ? "#5a4636" : "#9aa2b4", old ? "#9a8a78" : "#e9e6de");
  const colM = lam({ color: old ? "#d9cdb8" : "#e9e6de" });
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const z = -5.6 + i * 4.2; c.g.add(cyl(0.3, 0.36, H - 0.6, colM, sx * 4.7, (H - 0.6) / 2, z, 14), box(0.9, 0.3, 0.9, colM, sx * 4.7, 0.15, z), box(0.9, 0.3, 0.9, colM, sx * 4.7, H - 0.45, z)); }
  for (let i = 0; i < 3; i++) viewWindow(c, 1.9, 4.0, -3.6 + i * 3.6, 5.0, -D / 2 + 0.02, old, seed + i, true);
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const g = windowOn(1.6, 3.6, paneMat(c), old ? "#5a3a26" : "#f4efe6", true); c.g.add(at(g, sx * (W / 2 - 0.02), 5.0, -4 + i * 4.4, sx > 0 ? -Math.PI / 2 : Math.PI / 2)); }
  const title = signBoard(o.title ?? (old ? "THE ROYAL MINT" : "MAIN HALL"), { w: 7.4, h: 0.95, bg: "#22305a", fg: "#f1c94a" }); c.g.add(at(title, 0, 2.2, -D / 2 + 0.12));
  const marks: Record<string, V3> = { center: [0, 0, 1.5], left: [-2.2, 0, 1.2], right: [2.2, 0, 1.4], floor: [0, 0, 3], back: [0, 0, -4.6], door: [-W / 2 + 1.2, 0, 4], machine: [0, 0, -3.2] };
  if (o.stage ?? true) { c.g.add(box(8, 0.6, 3.6, lam({ map: paint.planks("#8a5a34", [6, 3], false) }), 0, 0.3, -5.2), box(8.2, 0.12, 0.3, lam({ color: "#5a3a26" }), 0, 0.6, -3.4), box(2.0, 0.3, 0.9, lam({ map: paint.planks("#8a5a34", [2, 1], false) }), -2.4, 0.15, -2.95));
    title.position.y = H - 1.5;
    Object.assign(marks, { stage: [0, 0.6, -4.6] as V3, stageL: [-2.2, 0.6, -4.5] as V3, stageR: [2.2, 0.6, -4.5] as V3, machine: [0, 0.6, -5.4] as V3 }); }
  for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) { const b = new THREE.Group(); b.add(box(1.1, 2.6, 0.04, lam({ color: i ? "#2f5fa8" : (o.accent ?? "#a8322a") }), 0, -1.3, 0, false), box(1.3, 0.08, 0.08, lam({ color: "#c9a23a" }), 0, 0, 0, false)); c.g.add(at(b, sx * (1.8 + i * 3.6), H - 2.4, -D / 2 + 0.24)); }
  for (const [x, z] of [[-5.6, 3.2], [5.6, 2.6], [-5.5, -2], [5.5, -3.0]] as [number, number][]) c.g.add(at(old ? barrel() : PROPS.plant(), x, 0, z));
  c.g.add(at(crate(0.8, { seed, label: old ? "MINT" : undefined }), 5.2, 0, 5.0, 0.3), at(PROPS.chest(), -5.2, 0, 5.2, 0.5));
  for (const [x, z] of [[-2.4, -1], [2.4, -1], [0, 3.4]] as [number, number][]) { const hl = hangingLamp(2.4, !old); c.g.add(at(hl.group, x, H, z)); c.glows.push({ m: hl.bulb, day: 0.6, night: 1.8 }); }
  lampAt(c, 0, H - 3.4, 0.5, 3.4, "#ffe2b8", 16);
  const crowdSpots: V3[] = []; for (let i = 0; i < 12; i++) crowdSpots.push([-3.4 + (i % 6) * 1.35 + ((i * 7) % 3) * 0.2, 0, 2.6 + Math.floor(i / 6) * 1.4 + ((i * 5) % 3) * 0.25]);
  // 1.8 dressing + life
  bunting(c, [-4.7, H - 0.75, -1.4], [4.7, H - 0.75, -1.4], 14); bunting(c, [-4.7, H - 0.9, 2.8], [4.7, H - 0.9, 2.8], 14); // above the title board
  chandelier(c, 0, H, -1.6, 2.8); chandelier(c, -2.7, H, 3.0, 2.3); chandelier(c, 2.7, H, 3.0, 2.3);
  for (const sx of [-1, 1]) { for (const z of [-1.8, 2.6]) sconce(c, sx * (W / 2 - 0.04), 3.0, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    c.g.add(at(poster(old ? "WEIGHTS|AND|MEASURES" : "NOTICE", 1.0, 1.2), sx * 5.5, 2.2, -D / 2 + 0.04), at(bench(), sx * 5.7, 0, 0.6, sx > 0 ? -Math.PI / 2 : Math.PI / 2), at(PROPS.sack(), sx * 5.6, 0, -4.6, sx),
      at(crate(0.7, { seed: seed + "h" + sx }), sx * 5.4, 0, -5.6, 0.2), at(pilaster(H, old ? "#5a4636" : "#9aa2b4", 0.3), sx * 1.8, 0, -D / 2 + 0.02)); }
  return { marks, wide: { pos: [0.8, 2.2, 13.2], look: [0, 3.6, -5], fov: 48 }, radius: 24, interior: true, crowdSpots, ...rm };
}

const BUILDERS: Record<SetName, (o: SetOpts, c: Ctx) => SetCore> = { street, alley, road, yard, shop, workshop, office, hall };
export const SET_NAMES = Object.keys(BUILDERS) as SetName[];

/** Build a set at `origin` (marks, crowd spots and the wide camera come back in WORLD space). */
export function buildSet(name: SetName, o: SetOpts = {}, origin: V3 = [0, 0, 0]): SetInstance {
  const b = BUILDERS[name]; if (!b) throw new Error(`buildSet: unknown set "${name}" (have: ${SET_NAMES.join(", ")})`);
  const c: Ctx = { wind: windUniforms(), g: new THREE.Group(), lamps: [], glows: [], panes: [], upd: [] };
  const s = b(o, c);
  c.g.position.set(...origin);
  const off = (p: V3): V3 => [p[0] + origin[0], p[1] + origin[1], p[2] + origin[2]];
  const marks = Object.fromEntries(Object.entries(s.marks).map(([k, v]) => [k, off(v)]));
  let night = 0;
  const inst: SetInstance = {
    name, group: c.g, marks, wide: { pos: off(s.wide.pos), look: off(s.wide.look), fov: s.wide.fov }, radius: s.radius, interior: s.interior, crowdSpots: s.crowdSpots.map(off),
    camBox: { min: off(s.camBox?.min ?? [-60, 0.3, -30]), max: off(s.camBox?.max ?? [60, 40, 40]) },
    setNight(n) { night = n; const k = s.interior ? 0.35 + 0.65 * n : n; // interiors keep their lamps on by day, dimmer
      for (const { l, i } of c.lamps) l.intensity = i * k * (l.userData.flick ?? 1);
      for (const gl of c.glows) { const v = (gl.day + (gl.night - gl.day) * n) * (gl.k ?? 1); const m = gl.m as THREE.MeshLambertMaterial;
        if ((m as THREE.MeshLambertMaterial).isMeshLambertMaterial) m.emissiveIntensity = v; else if (gl.col) (gl.m as THREE.MeshBasicMaterial).color.set("#3d4660").lerp(gl.col, v); } },
    setSky(top, horizon) { const t = new THREE.Color(top), h = new THREE.Color(horizon); for (const p of c.panes) p.color.copy(h).lerp(t, 0.35); },
    update(f, fps) { c.wind.uWindTime.value = f / fps; for (const u of c.upd) u(f, fps); if (c.upd.length) inst.setNight(night); },
  };
  inst.setNight(0);
  return inst;
}
