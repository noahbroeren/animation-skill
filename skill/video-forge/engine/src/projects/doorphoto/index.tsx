/**
 * TEST SHORT v3 -- "Why Delivery Drivers Started Photographing Your Door" (9:16, 2K, 60 fps, our cast ours-v1).
 *
 * Story (script v2, approved 2026-11-13): a driver leaves the last box on a doormat and taps "delivered"; the customer
 * calls: "never arrived". The shop can't see a doormat, so the customer always wins; he comes back for more, the street
 * copies him and the driver collects red marks. Then the scanners get a camera: time + GPS. The shop sends one photo:
 * his box, on his own doormat, next to his own gnome. Facts: public/doorphoto/claims.md.
 *
 * v3 (1.11.2), after a frame-by-frame study of the reference's newest short: every place is a Blender set with its light
 * baked (practicals, pools, bounce, no world ink); hero objects are Blender models with real materials (the van in
 * clearcoat white with a gradient, no branding and no outline; the parcel; the scanner); the cards keep their ink, take
 * the local light, face a direction in the world and draw any side of themselves (16+ views, `face`), and sit centred
 * in frame unless an action happens.
 * Cast: Dex (the driver), Vex (the customer), Mr. Bigsby (the shop), Hank (the neighbour) + extras, all BRANDS.ours.
 */
import * as THREE from "three";
import { Beat, Board, BoardApi, boardProject } from "../../lib/board";
import { BRANDS, KPose, StickHold } from "../../lib/characters/kinds";
import { castEntry, extra } from "../../lib/characters/ours";
import { LightKey, tweak } from "../../lib/three/lightplan";
import { canvasTexture } from "../../lib/three/textures";
import { NOINK } from "../../lib/three/post";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { clamp, ease } from "../../lib/time";
import type { BakedManifest } from "../../lib/three/baked";
import HOME0 from "../../../public/sets/home/set.json";
import OFFICE0 from "../../../public/sets/office/set.json";
import DEPOT0 from "../../../public/sets/depot/set.json";
import VAN from "../../../public/sets/van/van.json";
import WORDS from "./words.json";

// ------------------------------------------------------------------------------------------------ materials and drawings
const lam = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(o);
const INK = "#15171f", CARD = "#c8935a", TAPE = "#e9cf96";
const shadowed = <T extends THREE.Object3D>(o: T) => { o.traverse((m) => { (m as THREE.Mesh).castShadow = true; }); return o; };

/** the photo the scanner takes: the blue door with its fanlight and canopy, the coir mat, the parcel, the gnome */
function drawDoorPhoto(g: CanvasRenderingContext2D, W: number, H: number, o: { box?: boolean } = {}) {
  const ln = (w: number) => { g.strokeStyle = INK; g.lineWidth = w; g.lineJoin = "round"; };
  g.fillStyle = "#f4efe6"; g.fillRect(0, 0, W, H); // house wall
  g.fillStyle = "#e6dfd2"; for (let y = 0; y < H * 0.7; y += H * 0.06) g.fillRect(0, y, W, H * 0.006);
  const fy = H * 0.7; g.fillStyle = "#c9c5bd"; g.fillRect(0, fy, W, H - fy); // pavement
  g.strokeStyle = "#8c8a86"; g.lineWidth = W * 0.005; for (let x = 0; x < W; x += W * 0.2) { g.beginPath(); g.moveTo(x, fy); g.lineTo(x - W * 0.1, H); g.stroke(); }
  const dx = W * 0.33, dw = W * 0.34, dy = H * 0.2, dh = fy - dy - H * 0.04; // door, fanlight, frame, canopy
  g.fillStyle = "#f4efe6"; g.fillRect(dx - W * 0.05, dy - H * 0.12, dw + W * 0.1, dh + H * 0.12); ln(W * 0.007); g.strokeRect(dx - W * 0.05, dy - H * 0.12, dw + W * 0.1, dh + H * 0.12);
  g.fillStyle = "#2c3e52"; g.fillRect(dx, dy - H * 0.1, dw, H * 0.08); g.strokeRect(dx, dy - H * 0.1, dw, H * 0.08);
  g.fillStyle = "#a8553c"; g.beginPath(); g.moveTo(dx - W * 0.12, dy - H * 0.13); g.lineTo(dx + dw / 2, dy - H * 0.24); g.lineTo(dx + dw + W * 0.12, dy - H * 0.13); g.closePath(); g.fill(); ln(W * 0.008); g.stroke();
  g.fillStyle = "#3d6b8a"; g.fillRect(dx, dy, dw, dh); ln(W * 0.007); g.strokeRect(dx, dy, dw, dh);
  g.strokeStyle = "#2c5470"; g.lineWidth = W * 0.007; g.strokeRect(dx + dw * 0.12, dy + dh * 0.36, dw * 0.33, dh * 0.24); g.strokeRect(dx + dw * 0.55, dy + dh * 0.36, dw * 0.33, dh * 0.24); g.strokeRect(dx + dw * 0.12, dy + dh * 0.66, dw * 0.33, dh * 0.26); g.strokeRect(dx + dw * 0.55, dy + dh * 0.66, dw * 0.33, dh * 0.26);
  g.fillStyle = "#d6a94a"; g.font = `900 ${Math.round(H * 0.05)}px Arial Black, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("14", dx + dw / 2, dy + dh * 0.22);
  g.beginPath(); g.arc(dx + dw * 0.86, dy + dh * 0.5, W * 0.016, 0, 7); g.fill();
  for (const sx of [-1, 1]) { const px = sx < 0 ? dx - W * 0.2 : dx + dw + W * 0.06; g.fillStyle = "#4a5260"; g.fillRect(px, fy - H * 0.1, W * 0.14, H * 0.1); ln(W * 0.006); g.strokeRect(px, fy - H * 0.1, W * 0.14, H * 0.1);
    g.fillStyle = "#4f8a3a"; g.beginPath(); g.arc(px + W * 0.07, fy - H * 0.15, W * 0.08, 0, 7); g.fill(); g.stroke(); }
  const my = fy + H * 0.05, mw = W * 0.42, mh = H * 0.13, mx = W * 0.29; // the coir mat
  g.fillStyle = "#9e6c3a"; g.beginPath(); g.roundRect(mx, my, mw, mh, W * 0.015); g.fill(); ln(W * 0.007); g.stroke();
  g.fillStyle = "#3a2414"; g.font = `900 ${Math.round(H * 0.04)}px Arial Black, sans-serif`; g.fillText("WELCOME", mx + mw / 2, my + mh * 0.72);
  if (o.box !== false) { const bx = mx + mw * 0.28, bw = mw * 0.44, bh = H * 0.14, by = my + mh * 0.5 - bh; // the parcel on the mat
    g.fillStyle = CARD; g.fillRect(bx, by, bw, bh); g.fillStyle = TAPE; g.fillRect(bx + bw * 0.42, by, bw * 0.16, bh); ln(W * 0.007); g.strokeRect(bx, by, bw, bh);
    g.fillStyle = "#f7f5ef"; g.fillRect(bx + bw * 0.08, by + bh * 0.3, bw * 0.28, bh * 0.4); g.fillStyle = "#ec8a2c"; g.fillRect(bx + bw * 0.08, by + bh * 0.3, bw * 0.28, bh * 0.1); }
  const gx = W * 0.86, gy = fy + H * 0.2; // the gnome
  g.fillStyle = "#3f6fd6"; g.beginPath(); g.moveTo(gx - W * 0.06, gy); g.lineTo(gx + W * 0.06, gy); g.lineTo(gx + W * 0.035, gy - H * 0.1); g.lineTo(gx - W * 0.035, gy - H * 0.1); g.closePath(); g.fill(); ln(W * 0.006); g.stroke();
  g.fillStyle = "#ffffff"; g.beginPath(); g.moveTo(gx - W * 0.04, gy - H * 0.13); g.lineTo(gx + W * 0.04, gy - H * 0.13); g.lineTo(gx, gy - H * 0.04); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "#f2c9a6"; g.beginPath(); g.arc(gx, gy - H * 0.14, W * 0.026, 0, 7); g.fill(); g.stroke();
  g.fillStyle = "#d8344e"; g.beginPath(); g.moveTo(gx - W * 0.04, gy - H * 0.155); g.lineTo(gx + W * 0.04, gy - H * 0.155); g.lineTo(gx + W * 0.01, gy - H * 0.26); g.closePath(); g.fill(); g.stroke();
}
const photoTex = (key: string, box = true) => canvasTexture(`doorphoto2|${key}|${box}`, 512, 512, (g) => drawDoorPhoto(g, 512, 512, { box }));
/** the scanner after one tap: a green tick and DELIVERED (no photo: back then a delivery was just one tap) */
const tickTex = () => canvasTexture("scantick2", 512, 512, (c) => { c.fillStyle = "#e8f2fb"; c.fillRect(0, 0, 512, 512); c.fillStyle = "#1f3a5f"; c.fillRect(0, 0, 512, 70);
  c.fillStyle = "#f4efe6"; c.font = "900 40px Arial Black, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("SWIFT PARCEL", 256, 37);
  c.strokeStyle = "#2f9a5a"; c.lineWidth = 46; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath(); c.moveTo(130, 250); c.lineTo(220, 340); c.lineTo(390, 160); c.stroke();
  c.fillStyle = "#2f9a5a"; c.font = "900 62px Arial Black, sans-serif"; c.fillText("DELIVERED", 256, 440); });

/** a cardboard box, base at y = 0; `icon` prints what is inside on the front */
const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0, ...o });
/** keep a prop out of the screen-space ink and the toon pass: it sits in a baked, ink-free world (1.11.3) */
const clean = <T extends THREE.Object3D>(o: T) => { o.traverse((m) => { m.layers.set(NOINK); (m as THREE.Mesh).castShadow = true; (m as THREE.Mesh).receiveShadow = true; }); return o; };
/** a cardboard box, base at y = 0, rounded edges; `icon` prints what is inside on the front (1024 px: sharp in close-ups) */
function cardboard(w: number, h: number, d: number, o: { color?: string; icon?: "tv" | "blender" | "headphones" | "none" } = {}) {
  const col = o.color ?? CARD, ic = o.icon ?? "none", S = 4; // drawn at 4x the old 256 px
  const front = canvasTexture(`cbox3|${ic}|${col}`, 256 * S, 256 * S, (g) => {
    g.scale(S, S);
    g.fillStyle = col; g.fillRect(0, 0, 256, 256);
    g.fillStyle = "rgba(90,55,25,0.08)"; for (let i = 0; i < 18; i++) g.fillRect(0, 8 + i * 14, 256, 2); // corrugation hint
    g.fillStyle = TAPE; g.fillRect(108, 0, 40, 34);
    g.strokeStyle = INK; g.lineWidth = 7; g.lineJoin = "round"; g.lineCap = "round"; g.fillStyle = "#2b2f3a";
    if (ic === "tv") { g.beginPath(); g.roundRect(48, 66, 160, 104, 12); g.fill(); g.stroke(); g.fillStyle = "#9fd8ff"; g.beginPath(); g.roundRect(62, 80, 132, 76, 6); g.fill(); g.fillStyle = "#2b2f3a"; g.fillRect(118, 170, 20, 22); g.beginPath(); g.roundRect(88, 190, 80, 12, 6); g.fill(); }
    if (ic === "blender") { g.fillStyle = "#cfe8f7"; g.beginPath(); g.moveTo(88, 52); g.lineTo(168, 52); g.lineTo(154, 160); g.lineTo(102, 160); g.closePath(); g.fill(); g.stroke(); g.fillStyle = "#e2483a"; g.beginPath(); g.roundRect(84, 160, 88, 48, 10); g.fill(); g.stroke(); g.fillStyle = "#2b2f3a"; g.beginPath(); g.roundRect(86, 40, 84, 16, 5); g.fill(); }
    if (ic === "headphones") { g.strokeStyle = "#d9a520"; g.lineWidth = 16; g.beginPath(); g.arc(128, 130, 60, Math.PI, 0); g.stroke(); g.fillStyle = "#f5c21b"; g.strokeStyle = INK; g.lineWidth = 7; for (const x of [68, 188]) { g.beginPath(); g.roundRect(x - 22, 120, 44, 70, 14); g.fill(); g.stroke(); } }
    g.fillStyle = "#f7f5ef"; g.fillRect(16, 214, 70, 30); g.fillStyle = "#2b2f3a"; for (let i = 0; i < 9; i++) g.fillRect(20 + i * 7, 220, 2 + (i % 3), 18); // shipping label
  });
  front.anisotropy = 8;
  const topT = canvasTexture(`cboxtop3|${col}`, 512, 512, (g) => { g.fillStyle = col; g.fillRect(0, 0, 512, 512); g.fillStyle = TAPE; g.fillRect(200, 0, 112, 512); g.strokeStyle = "rgba(60,40,20,0.3)"; g.lineWidth = 6; g.beginPath(); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke(); });
  const side = std({ color: col }), top = std({ map: topT });
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.06), [side, side, top, side, std({ map: front }), side]); m.position.y = h / 2;
  const grp = new THREE.Group(); grp.add(m); return clean(grp);
}

// ------------------------------------------------------------------------------------------------ hero objects (Blender, cel-shaded on load)
/** the Swift Parcel box (Blender: tape, label, barcode), 0.42 x 0.28 x 0.32 m */
const parcel = (api: BoardApi) => api.model("sets/props/parcel.glb");
/** the scanner up close: the Blender body with an engine screen on it. `screen: "tick"` = one tap (no camera yet);
 *  "photo" = the photo, then the time, the GPS pin and rings on the words */
const bigScanner = (api: BoardApi, screen: "tick" | "photo") => {
  const g = new THREE.Group(), body = api.model("sets/props/scanner.glb", { groundAlign: false }); g.add(body);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.54), new THREE.MeshBasicMaterial({ map: screen === "tick" ? tickTex() : photoTex("scanner") })); scr.position.set(0, 0.11, 0.041); g.add(scr);
  const clock = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.09), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTexture("clock214b", 300, 90, (c) => { c.fillStyle = "rgba(21,23,31,0.86)"; c.beginPath(); c.roundRect(0, 0, 300, 90, 20); c.fill(); c.fillStyle = "#ffffff"; c.font = "900 54px Arial Black, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("2:14 PM", 150, 48); }) }));
  clock.position.set(0.1, 0.32, 0.045); g.add(clock);
  const pin = new THREE.Group(), pinM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.2, 0.2) }); const ph = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), pinM); ph.position.y = 0.06; pin.add(ph); const pt = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 10), pinM); pt.rotation.x = Math.PI; pt.position.y = 0.015; pin.add(pt);
  const map = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.16), new THREE.MeshBasicMaterial({ map: canvasTexture("minimap2", 200, 160, (c) => { c.fillStyle = "#dfeedd"; c.fillRect(0, 0, 200, 160); c.fillStyle = "#ffffff"; c.fillRect(0, 70, 200, 22); c.fillRect(90, 0, 22, 160); c.fillStyle = "#b9d4ef"; c.fillRect(140, 10, 50, 40); c.strokeStyle = INK; c.lineWidth = 6; c.strokeRect(3, 3, 194, 154); }) }));
  map.position.set(-0.15, -0.06, 0.046); g.add(map); pin.position.set(-0.15, -0.09, 0.06); g.add(pin);
  const ringM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, 0.2) });
  const ring = (x: number, y: number, r: number) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 40), ringM); m.position.set(x, y, 0.05); g.add(m); return m; };
  const P = (u: number, v: number): [number, number] => [(u - 0.5) * 0.54, 0.11 + (0.5 - v) * 0.54]; // canvas fraction -> screen plane
  const rDoor = ring(...P(0.5, 0.43), 0.14), rMat = ring(...P(0.5, 0.815), 0.13), rBox = ring(...P(0.5, 0.745), 0.065);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true })); flash.position.set(0, 0.11, 0.05); g.add(flash);
  const tap = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.045, 32), new THREE.MeshBasicMaterial({ color: "#2f9a5a", transparent: true })); tap.position.set(0, 0.06, 0.05); g.add(tap);
  let cam: THREE.Object3D | null = null;
  return { group: shadowed(g), update(f: number, fps: number) { const T = api.T, t = f / fps;
    g.rotation.y = 0.12 * Math.sin(t * 0.9); g.rotation.z = 0.03 * Math.sin(t * 0.7);
    cam ??= body.getObjectByName("RT_camera") ?? null; if (cam) cam.visible = screen === "photo";
    const hide = (m: THREE.Object3D) => { m.visible = false; };
    if (screen === "tick") { [clock, map, pin, rDoor, rMat, rBox, flash].forEach(hide);
      const u = (f - T.delivered) / fps; scr.visible = u >= 0; tap.visible = u >= 0 && u < 0.5; tap.scale.setScalar(1 + u * 8); (tap.material as THREE.MeshBasicMaterial).opacity = 1 - u * 2; return; }
    tap.visible = false;
    const fu = (f - T.photo1) / fps; (flash.material as THREE.MeshBasicMaterial).opacity = fu >= 0 && fu < 0.3 ? 0.9 * (1 - fu / 0.3) : 0; flash.visible = fu >= 0 && fu < 0.3;
    clock.visible = f >= T.time1; clock.scale.setScalar(f >= T.time1 ? Math.min(1, 0.6 + (f - T.time1) / 8) * (f >= T.t214 && f < T.t214 + 10 ? 1.15 : 1) : 1);
    map.visible = f >= T.gps; const pu = (f - T.gps) / fps; pin.visible = pu >= 0.05; pin.position.y = -0.09 + (pu < 0.3 ? 0.25 * (1 - pu / 0.3) ** 2 : 0);
    const on = (m: THREE.Mesh, a: number, b: number, sy = 1) => { m.visible = f >= a && f < b; if (m.visible) { const s = Math.min(1, 0.4 + (f - a) / 6); m.scale.set(s * (sy > 1 ? 0.62 : 1), s * (sy > 1 ? 1 : sy), 1); } };
    on(rDoor, T.ydoor, T.ymat, 1.6); on(rMat, T.ymat, T.ybox, 0.45); on(rBox, T.ybox, T.total); } };
};
/** the depot's charging rack: six Blender scanners; on "camera" each one gets its camera module and flashes */
const scannerRack = (api: BoardApi) => { const g = new THREE.Group(); /* stands on the depot's bench (top at y 0.96): no desk of its own */
  const units: THREE.Group[] = [], flashes: THREE.Mesh[] = [], flashM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.6), transparent: true });
  for (let i = 0; i < 6; i++) { const s = api.model("sets/props/scanner.glb", { groundAlign: false }); s.scale.setScalar(0.3); s.position.set(-0.8 + i * 0.32, 0.96 + 0.24, 0.02); s.rotation.x = -0.22; g.add(s); units.push(s);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.86, 1.0) })); scr.position.set(-0.8 + i * 0.32, 0.96 + 0.24 + 0.033 * 0.3 * 10 * 0.1 + 0.03, 0.02 + 0.0125); scr.rotation.x = -0.22; g.add(scr);
    const fl = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), flashM); fl.position.set(-0.8 + i * 0.32 + 0.04, 1.34, 0.08); g.add(fl); flashes.push(fl); }
  return { group: shadowed(g), update(f: number, fps: number) { const T = api.T;
    units.forEach((u, i) => { const c = u.getObjectByName("RT_camera"); if (c) c.visible = f >= T.camera + i * 3; });
    flashes.forEach((fl, i) => { const u = (f - T.camera - i * 3) / fps; fl.visible = u >= 0 && u < 0.25; fl.scale.setScalar(1 + u * 6); }); } }; };

// ------------------------------------------------------------------------------------------------ story props (engine style)
const tvBox = () => cardboard(0.95, 0.66, 0.2, { icon: "tv" });
const blenderBox = () => cardboard(0.4, 0.55, 0.36, { icon: "blender" });
const phonesBox = () => cardboard(0.36, 0.3, 0.3, { icon: "headphones", color: "#f4f6fa" });
/** the refund pile: boxes stack up from "winter" until it is taller than the van on "taller" */
const refundPile = (api: BoardApi) => { const g = new THREE.Group(), boxes: THREE.Object3D[] = []; let y = 0;
  for (let i = 0; i < 17; i++) { const w = 0.9 - (i % 3) * 0.12, h = 0.24 + (i % 4) * 0.03, b = cardboard(w, h, 0.7 - (i % 2) * 0.1, { color: i % 3 ? CARD : "#b98250", icon: i % 5 === 2 ? "tv" : i % 7 === 3 ? "blender" : "none" }); b.position.set(0.08 * Math.sin(i * 1.7), y, 0.06 * Math.cos(i * 2.1)); b.rotation.y = 0.25 * Math.sin(i * 1.3); y += h; g.add(b); boxes.push(b); }
  return { group: g, update(f: number) { const T = api.T, k = ease.outCubic(clamp((f - T.winter + 6) / Math.max(1, T.taller - T.winter + 12))), n = Math.round(4 + 13 * k); boxes.forEach((b, i) => { b.visible = i < n; }); } }; };
/** the driver's record: red crosses appear one at a time between "every" and "name", and vanish between "red#2" and "boxes#2" */
const recordBoard = (api: BoardApi) => { const g = new THREE.Group(), steel = std({ color: "#8d96a6", roughness: 0.5, metalness: 0.4 });
  const W = 1024, H = 720, cv = document.createElement("canvas"); cv.width = W; cv.height = H; const c = cv.getContext("2d")!;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const cell = (i: number): [number, number] => [150 + (i % 6) * 150, 330 + Math.floor(i / 6) * 104]; // 3 rows of 6 between the ruled lines
  let drawn = -1;
  const paint = (n: number, pop: number) => {
    c.fillStyle = "#f6f4ee"; c.fillRect(0, 0, W, H); c.strokeStyle = "#8d96a6"; c.lineWidth = 16; c.strokeRect(8, 8, W - 16, H - 16);
    c.fillStyle = "#f5a524"; c.beginPath(); c.arc(130, 120, 64, Math.PI, 0); c.fill(); c.fillStyle = "#fcf8f3"; c.beginPath(); c.arc(130, 146, 56, 0, 7); c.fill(); c.strokeStyle = INK; c.lineWidth = 10; c.stroke();
    c.fillStyle = INK; c.fillRect(104, 136, 14, 18); c.fillRect(142, 136, 14, 18);
    c.fillStyle = "#1f3a5f"; c.font = "900 112px Arial Black, sans-serif"; c.textBaseline = "middle"; c.fillText("DEX", 240, 126); c.fillStyle = "#8d96a6"; c.font = "700 52px Arial, sans-serif"; c.fillText("DRIVER  #214", 600, 132);
    c.strokeStyle = "#c9ced8"; c.lineWidth = 6; for (let r = 0; r < 4; r++) { c.beginPath(); c.moveTo(60, 278 + r * 104); c.lineTo(W - 60, 278 + r * 104); c.stroke(); }
    c.lineCap = "round"; c.lineJoin = "round";
    for (let i = 0; i < n; i++) { const [x, y] = cell(i), k = 30 * (i === n - 1 ? pop : 1), j = (i * 37) % 7 - 3; // a marker cross, a little hand-drawn
      for (const [w, col] of [[22, "rgba(120,10,10,0.35)"], [16, "#e23b3b"]] as [number, string][]) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x - k, y - k + j); c.lineTo(x + k, y + k); c.moveTo(x + k + j, y - k); c.lineTo(x - k, y + k - j); c.stroke(); } }
    tex.needsUpdate = true; };
  paint(0, 1);
  const face = new THREE.Mesh(new RoundedBoxGeometry(1.5, 1.05, 0.05, 2, 0.012), [steel, steel, steel, steel, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }), steel]);
  face.position.y = 1.55; g.add(face);
  for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.02, 12), steel); leg.position.set(sx * 0.6, 0.51, -0.045); g.add(leg); } // the stand ends under the board, behind it
  return { group: clean(g), update(f: number) { const T = api.T, up = clamp((f - T.every) / Math.max(1, T.name - T.every)), down = clamp((f - T.red2) / Math.max(1, T.fast - T.red2)); /* gone by "faster", while the board is still in close-up */
    const v = up * 18 * (1 - down), n = Math.floor(v + 0.0001), pop = down > 0 ? 1 : Math.min(1.25, 0.4 + (v - n) * 3);
    const key = n * 100 + Math.round(pop * 20); if (key !== drawn) { drawn = key; paint(n, pop); } } }; };

/** the computer on the shop's desk: one green tick (the tap that said "delivered") and a little van */
/** the green tick on the office's own monitor (a screen-sized plane in front of its screen) */
const screenTick = () => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.28), new THREE.MeshBasicMaterial({ map: canvasTexture("tickscreen3", 320, 200, (c) => { c.fillStyle = "#e8f2fb"; c.fillRect(0, 0, 320, 200); c.strokeStyle = "#2f9a5a"; c.lineWidth = 26; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath(); c.moveTo(80, 104); c.lineTo(138, 156); c.lineTo(250, 46); c.stroke(); }) }));
  g.add(m); return g; };
const monitor = () => { const g = new THREE.Group(), dark = lam({ color: "#2b2f3a" });
  const scr = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.46, 0.04), [dark, dark, dark, dark, new THREE.MeshBasicMaterial({ map: canvasTexture("tickscreen2", 320, 200, (c) => { c.fillStyle = "#e8f2fb"; c.fillRect(0, 0, 320, 200); c.strokeStyle = "#2f9a5a"; c.lineWidth = 26; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath(); c.moveTo(70, 104); c.lineTo(128, 156); c.lineTo(240, 46); c.stroke();
    c.fillStyle = "#f3efe6"; c.strokeStyle = INK; c.lineWidth = 5; c.beginPath(); c.roundRect(214, 132, 80, 44, 8); c.fill(); c.stroke(); c.fillStyle = "#ec8a2c"; c.fillRect(218, 150, 72, 8); c.fillStyle = "#2b2f3a"; c.beginPath(); c.arc(232, 178, 9, 0, 7); c.arc(278, 178, 9, 0, 7); c.fill(); }) }), dark]);
  scr.position.y = 0.36; g.add(scr); const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), dark); st.position.y = 0.08; g.add(st); const ft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.18), dark); ft.position.y = 0.01; g.add(ft); return shadowed(g); };
/** the printed photo the shop sends back (a polaroid) */
const photoCard = () => { const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.01), lam({ color: "#fbfaf6", emissive: new THREE.Color("#fbfaf6"), emissiveIntensity: 0.25 })); g.add(frame);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.54), new THREE.MeshBasicMaterial({ map: photoTex("card") })); pic.position.set(0, 0.05, 0.006); g.add(pic);
  const stamp = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.08), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTexture("cardstamp2", 400, 80, (c) => { c.fillStyle = "#2b2f3a"; c.font = "700 44px Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("2:14 PM", 150, 42); c.fillStyle = "#e2333f"; c.beginPath(); c.arc(330, 30, 16, 0, 7); c.fill(); c.beginPath(); c.moveTo(316, 38); c.lineTo(344, 38); c.lineTo(330, 66); c.closePath(); c.fill(); }) }));
  stamp.position.set(0, -0.28, 0.006); g.add(stamp);
  return { group: g, update(f: number, fps: number) { const t = f / fps; g.rotation.set(0.05 * Math.sin(t * 1.1), 0.25 * Math.sin(t * 0.8), 0.06 * Math.sin(t * 0.9)); } }; };

// ------------------------------------------------------------------------------------------------ light
const DAY: LightKey = tweak("day", { grade: { saturation: 1.12 } });
const SHOP: LightKey = tweak("office", { exposure: 1.06, grade: { saturation: 1.3, vibrance: 0.2 } });
const GREY: LightKey = tweak("overcast", { exposure: 1.08, grade: { saturation: 1.05 } });
const DUSK: LightKey = tweak("golden", { grade: { saturation: 1.12 } });

// ------------------------------------------------------------------------------------------------ acting vocabulary
const H = (item: StickHold["item"], more: Partial<StickHold> = {}): StickHold => ({ item, hand: "R", ...more });
const carry = (expr: KPose["expr"] = "focused"): KPose => ({ limbs: { handR: [0.25, 0.62], handL: [0.25, 0.6] }, hold: H("parcel", { len: 0.9 }), expr });
const onPhone = (expr: KPose["expr"]): KPose => ({ limbs: { handR: [0.42, 1.3] }, hold: H("phone"), turn: -0.2, expr });
const phoneUp = (expr: KPose["expr"] = "smug"): KPose => ({ limbs: { handR: [0.55, 1.32] }, hold: H("phone", { len: 0.8 }), expr });
const scan = (open: number, expr: KPose["expr"] = "focused"): KPose => ({ limbs: { handR: [0.78, 1.0] }, hold: H("scanner", { open, len: 0.95, aim: 90 }), expr });
const point = (x: number, y: number, expr: KPose["expr"]): KPose => ({ limbs: { handR: [x, y] }, hands: { R: "point" }, expr });
const shrug = (expr: KPose["expr"]): KPose => ({ limbs: { handR: [0.55, 0.85], handL: [0.55, 0.85] }, hands: { R: "open", L: "open" }, expr });
const T3 = (facing: 1 | -1) => ({ view: "three" as const, facing });

// ------------------------------------------------------------------------------------------------ the places (v3: Blender sets, light baked with Cycles)
// The reference renders its whole world (materials, bounce light, practicals, no ink on the world) and only draws the
// characters. So every place here is a baked set; the hero objects (van, parcel, scanner) are Blender models with real
// materials, and the cards keep their ink. Marks come from the set manifests (tools/blender/build_set.py).
const HOME = HOME0 as unknown as BakedManifest, OFFICE = OFFICE0 as unknown as BakedManifest, DEPOT = DEPOT0 as unknown as BakedManifest;
const mk = (M: BakedManifest, k: string, d: [number, number, number] = [0, 0, 0]): [number, number, number] => { const v = M.marks[k] as number[]; return [v[0] + d[0], v[1] + d[1], v[2] + d[2]]; };
const keyOf = (M: BakedManifest, base: LightKey): LightKey => ({ ...base, sunDir: M.sun!.dir as [number, number, number], cookie: 0 });
const KDAY = keyOf(HOME, DAY), KGREY = keyOf(HOME, GREY), KDUSK = keyOf(HOME, DUSK), KSHOP = keyOf(OFFICE, SHOP), KDEPOT = keyOf(DEPOT, SHOP), KDEPOTG = keyOf(DEPOT, GREY);
const MAT = mk(HOME, "mat"), DOOR = mk(HOME, "door"), PORCH = mk(HOME, "porch"), PORCHL = mk(HOME, "porchL"), GNOME = mk(HOME, "gnome");
const IN_DOOR = mk(HOME, "door", [0, 0, 0.32]); // standing in his doorway, behind the mat
const BESIDE = mk(HOME, "porchL", [0.25, 0, -0.1]); // the driver beside the mat
const VAN_Z = mk(HOME, "vanStop")[2] + 0.2, VAN_X = mk(HOME, "vanStop")[0];
const DESK = mk(OFFICE, "desk"), DESKTOP = mk(OFFICE, "deskTop");
const BIGSBY = mk(OFFICE, "desk", [-0.55, 0, 0.45]); // beside the desk, facing the room

/** a sky with soft clouds all round the street (equirectangular canvas on an inside-out sphere, unlit, no ink) */
const skyDome = (api: BoardApi) => {
  const W = 4096, H = 2048, cv = document.createElement("canvas"); cv.width = W; cv.height = H; const c = cv.getContext("2d")!;
  const gr = c.createLinearGradient(0, 0, 0, H * 0.5); gr.addColorStop(0, "#2a63a8"); gr.addColorStop(0.7, "#5b9ad6"); gr.addColorStop(1, "#93c3ea");
  c.fillStyle = gr; c.fillRect(0, 0, W, H * 0.5); c.fillStyle = "#c4dbea"; c.fillRect(0, H * 0.5, W, H * 0.5);
  let sd = 11; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const puff = (x: number, y: number, r: number) => { for (const dx of [0, W, -W]) {
    const sh = c.createRadialGradient(x + dx, y + r * 0.28, r * 0.15, x + dx, y + r * 0.28, r); sh.addColorStop(0, "rgba(128,150,186,0.75)"); sh.addColorStop(0.75, "rgba(128,150,186,0.35)"); sh.addColorStop(1, "rgba(128,150,186,0)");
    c.fillStyle = sh; c.beginPath(); c.arc(x + dx, y + r * 0.28, r, 0, 7); c.fill();
    const wh = c.createRadialGradient(x + dx - r * 0.12, y - r * 0.12, r * 0.05, x + dx, y, r * 0.92); wh.addColorStop(0, "rgba(255,255,255,1)"); wh.addColorStop(0.7, "rgba(250,252,255,0.92)"); wh.addColorStop(1, "rgba(240,246,252,0)");
    c.fillStyle = wh; c.beginPath(); c.arc(x + dx, y, r * 0.92, 0, 7); c.fill(); } };
  for (let k = 0; k < 34; k++) { // separate cumulus with blue between them, in the band a street camera sees (5-25 degrees up)
    const cy = H * (0.355 + rnd() * 0.11), sz = 26 + rnd() * 38 + (cy / H - 0.355) * 260, cx = rnd() * W, n = 5 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) puff(cx + (rnd() - 0.5) * sz * 3.0, cy - Math.abs(rnd() - 0.5) * sz * 0.8, sz * (0.5 + rnd() * 0.5)); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: true, fog: false, toneMapped: false }); /* writes depth: the haze pass treats an empty depth buffer as infinitely far and washed the clouds out */
  const m = new THREE.Mesh(new THREE.SphereGeometry(150, 64, 32), mat); m.renderOrder = -9; m.frustumCulled = false; /* after the engine's sky (-10), before the world */
  const g = clean(new THREE.Group()); g.add(m); m.layers.set(NOINK); m.castShadow = false; m.receiveShadow = false;
  return { group: g, update(f: number) { const T = api.T, winter = f >= T.winter - 8 && f < T.monday, dusk = f >= T.and8 - 8;
    mat.color.set(winter ? "#b4bcc6" : dusk ? "#ffd2b0" : "#ffffff"); } };
};
/** the neighbours' parcels on their porches and on the pavement: they vanish one after another from "vanishing" */
const streetBoxes2 = (api: BoardApi) => { const g = new THREE.Group(), boxes: THREE.Object3D[] = [];
  const spots: [number, number, number][] = [mk(HOME, "porch1", [0.3, 0, -0.35]), mk(HOME, "porch1", [-0.4, 0, -0.3]), mk(HOME, "porch2", [0.2, 0, -0.35]), mk(HOME, "porch2", [-0.5, 0, -0.2]), mk(HOME, "pavement", [3.2, 0, -0.2]), mk(HOME, "pavement", [-4.6, 0, -0.1]), mk(HOME, "pavement", [5.8, 0, 0])];
  spots.forEach(([x, y, z], i) => { const b = api.model("sets/props/parcel.glb", { height: 0.3 + (i % 3) * 0.06 }); b.position.set(x, y, z); b.rotation.y = 0.4 * Math.sin(i * 1.7); g.add(b); boxes.push(b); });
  return { group: g, update(f: number, fps: number) { boxes.forEach((b, i) => { const u = (f - api.T.vanish - i * 0.13 * fps) / fps, k = u < 0 ? 1 : Math.max(0, 1 - u / 0.18); b.visible = k > 0.01; b.scale.setScalar(k < 1 ? 1.15 * k : 1); }); } }; };

// ------------------------------------------------------------------------------------------------ the storyboard
// Framing rule (user, 2026-11-13): the character is centred in frame unless an action is happening; every actor has a
// world facing (`face`), so the card draws the right side of itself from wherever the camera stands.
const beats: Beat[] = [
  // ---- 1 the van pulls up at the blue door
  { at: 0, id: "open", place: "street", key: KDAY, music: "build", shot: { size: "wide", move: "push", amount: 0.1 },
    act: { dex: { seat: { vehicle: "van", seat: "driver" }, light: 1 }, vex: { hide: true }, vexg: { hide: true }, bigsby: { hide: true }, hank: { hide: true } },
    gag: { prop: "skyDome", id: "sky", at: [0, 0, 0], in: "none" }, sfx: [{ name: "car", lu: -10 }] },
  // ---- his last box: we follow him up the path (his back to us, the blue door ahead)
  { at: "blue", id: "last", via: "dissolve", shot: { size: "medium", on: "dex", angle: 22, move: "push", amount: 0.26 },
    act: { dex: { seat: null, at: mk(HOME, "gate", [0, 0, 0.6]), pose: carry("focused"), face: DOOR } } },
  { at: "with", id: "walkUp", act: { dex: { walk: mk(HOME, "steps", [0, 0, 0.4]), speed: 1.5, pose: carry("focused") } } },
  // ---- the mat, one tap, gone
  { at: "he", id: "he", via: "dissolve", shot: { size: "full", on: [MAT[0] - 0.35, MAT[1], MAT[2] + 0.2], h: 2.2, angle: 16, move: "push", amount: 0.1 },
    act: { dex: { at: BESIDE, pose: carry("focused"), face: MAT } } },
  { at: "doormat", id: "doormat", act: { dex: { pose: { limbs: { handR: [0.45, 0.35], handL: [0.4, 0.35] }, hands: { R: "open", L: "open" }, expr: "happy" }, hold: null } },
    gag: { prop: "parcel", id: "box", at: MAT, ry: 0.15, in: "pop", until: "ten" }, sfx: [{ name: "thud", lu: -10 }] },
  { at: "tapped", id: "tapped", music: "thin", shot: { size: "insert", on: "tapScan", h: 0.82, angle: 0, move: "push", amount: 0.1 },
    gag: { prop: "tapScanner", id: "tapScan", origin: "center", at: mk(HOME, "path", [1.1, 1.55, 0.2]), in: "none", until: "drove" } },
  { at: "delivered", id: "delivered", sfx: [{ name: "ding", lu: -8 }] },
  { at: "and", id: "drove", music: "build", shot: { size: "full", on: [VAN_X, 0, VAN_Z], h: 4.6, angle: 26, move: "push", amount: 0.26 },
    act: { dex: { seat: { vehicle: "van", seat: "driver" } } }, sfx: [{ name: "car", lu: -9 }] },
  // ---- ten minutes later: the box is gone, he calls the shop
  { at: "the#2", id: "ten", via: "dissolve", shot: { size: "medium", on: "vex", angle: 0, move: "push", amount: 0.26 },
    act: { vex: { hide: false, at: IN_DOOR, pose: onPhone("sneaky"), face: [IN_DOOR[0], 0, IN_DOOR[2] + 5] } } },
  { at: "the#4", id: "neverArrived", place: "shop", key: KSHOP, shot: { size: "medium", on: "bigsby", angle: 0, move: "push", amount: 0.26 },
    act: { bigsby: { hide: false, at: BIGSBY, pose: onPhone("confused"), face: [BIGSBY[0] + 0.6, 0, BIGSBY[2] + 4] } },
    gag: { prop: "nothing", id: "monitor", origin: "center", at: mk(OFFICE, "monitor", [0, 0.06, 0.035]), in: "none" } },
  // ---- the customer: "Nothing on my mat. Nothing at all."
  { at: "nothing", id: "nothing", place: "street", key: KDAY, shot: { size: "close", on: "vex", angle: 0, move: "push", amount: 0.1 },
    act: { vex: { at: IN_DOOR, pose: point(0.55, 0.25, "innocent"), hold: H("phone", { hand: "L" }), talk: true, face: [IN_DOOR[0], 0, IN_DOOR[2] + 5] } } },
  { at: "nothing#2", id: "nothing2", act: { vex: { pose: shrug("innocent"), talk: true } } },
  // ---- back then: one tap, and the shop can't see a doormat
  { at: "back", id: "back", place: "shop", key: KSHOP, shot: { size: "two", on: ["bigsby", "monitor"], move: "push", amount: 0.26 }, focus: "monitor",
    act: { bigsby: { at: BIGSBY, pose: point(0.75, 1.0, "think"), hold: null, face: DESKTOP } } },
  { at: "couldnt", id: "couldnt", act: { bigsby: { pose: { limbs: { handR: [0.3, 1.45] }, expr: "skeptical" } } }, gag: { fx: "question", on: "bigsby", size: 0.7 } },
  // ---- the driver's word against the customer's; the customer always won
  { at: "so", id: "so", shot: { size: "two", on: ["bigsby", "dex"], move: "push", amount: 0.1 },
    act: { bigsby: { pose: onPhone("skeptical"), face: "dex" }, dex: { seat: null, at: [BIGSBY[0] + 1.05, 0, BIGSBY[2] + 0.1], pose: { limbs: { handR: [0.35, 0.2] }, expr: "exhausted" }, hold: null, face: "bigsby" } } },
  { at: "always", id: "always", act: { bigsby: { pose: onPhone("touched") }, dex: { pose: { limbs: { handR: [0.2, 0.15] }, expr: "heartbroken" } } }, sfx: [{ name: "sad_trombone", lu: -14 }] },
  // ---- the boss: "Refund him."
  { at: "refund", id: "refund", shot: { size: "close", on: "bigsby", angle: 0, move: "push", amount: 0.1 },
    act: { dex: { hide: true }, bigsby: { pose: { limbs: { handR: [0.8, 1.05] }, hands: { R: "open" }, expr: "smug" }, hold: null, talk: true, face: [BIGSBY[0], 0, BIGSBY[2] + 5] } } },
  { at: "happy", id: "happyW", act: { bigsby: { pose: point(0.8, 1.1, "confident"), talk: true } } },
  // ---- he comes back for more: a TV, a blender, golden headphones
  { at: "and#4", id: "more", place: "street", key: KDAY, shot: { size: "full", on: [DOOR[0], DOOR[1], DOOR[2] + 0.6], h: 2.4, angle: 0, move: "push", amount: 0.1 },
    act: { vex: { at: IN_DOOR, pose: phoneUp("smug"), face: [IN_DOOR[0], 0, IN_DOOR[2] + 5] } } },
  { at: "tv", id: "tv", gag: { prop: "tvBox", id: "tvBox", at: mk(HOME, "porchL", [0.05, 0, 0.1]), ry: 0.35, in: "drop", until: "by" }, sfx: [{ name: "thud", lu: -10 }] },
  { at: "blender", id: "blender", gag: { prop: "blenderBox", id: "blenderBox", at: mk(HOME, "mat", [0.7, 0, 0.35]), ry: 0.3, in: "drop", until: "by" }, sfx: [{ name: "thud", lu: -10 }] },
  { at: "golden", id: "golden", act: { vex: { hide: true }, vexg: { hide: false, at: IN_DOOR, pose: { limbs: { handR: [0.4, 1.05], handL: [0.35, 1.05] }, hands: { R: "open", L: "open" }, expr: "proud" }, hold: null, face: [IN_DOOR[0], 0, IN_DOOR[2] + 5] } },
    gag: { fx: "sparkle", on: "vexg", size: 0.7, dy: -0.2 }, sfx: ["ding"], event: [0, 4] },
  { at: "either", id: "either", act: { vexg: { pose: { limbs: { handR: [0.3, 1.5] }, hands: { R: "point" }, expr: "mischief" } } } },
  // ---- by Friday the neighbours know the trick; the street's boxes vanish
  { at: "by", id: "by", shot: { size: "two", on: ["vexg", "hank"], move: "push", amount: 0.26 },
    act: { vexg: { at: mk(HOME, "pavement", [-0.5, 0, 0]), pose: { limbs: { handR: [0.85, 1.25] }, hands: { R: "open" }, expr: "sneaky" }, face: "hank" }, hank: { hide: false, at: mk(HOME, "pavement", [0.55, 0, 0.05]), pose: { limbs: { handR: [0.3, 1.45] }, hands: { R: "open" }, expr: "amazed" }, face: "vexg" } } },
  { at: "half", id: "half", via: "dissolve", shot: { size: "full", on: mk(HOME, "porch2", [-1.0, 0, 2.2]), h: 4.2, angle: -32, move: "push", amount: 0.26 }, crowd: "laugh",
    act: { vexg: { hide: true }, hank: { at: mk(HOME, "porch2", [-1.25, 0, 0.35]), pose: { limbs: { handR: [0.25, 0.62], handL: [0.25, 0.6] }, hold: H("parcel", { len: 0.9 }), expr: "mischief" }, face: [0, 0, 20] },
      ex1: { hide: false, at: mk(HOME, "porch2", [0.6, 0, 0.3]), pose: onPhone("innocent"), face: [7, 0, 20] }, ex2: { hide: false, at: mk(HOME, "pavement", [-6.5, 0, -0.3]), pose: { limbs: { handR: [0.25, 0.62], handL: [0.25, 0.6] }, hold: H("parcel", { len: 0.9 }), expr: "smug" }, face: [-4, 0, 20] } },
    gag: { prop: "streetBoxes", id: "streetBoxes", at: [0, 0, 0], in: "none", until: "every" } },
  { at: "vanishing", id: "vanish", sfx: [{ name: "pop", lu: -10 }, { name: "pop", lu: -12, df: 8 }, { name: "pop", lu: -12, df: 16 }] },
  // ---- every missing box: a red mark next to the driver's name
  { at: "every", id: "every", place: "depot", key: KDEPOT, music: "thin", shot: { size: "two", on: ["dex", "record"], move: "push", amount: 0.26 },
    act: { ex1: { hide: true }, ex2: { hide: true }, hank: { hide: true }, dex: { hide: false, at: mk(DEPOT, "board", [0.9, 0, 0.9]), pose: { limbs: { handR: [0.3, 0.3] }, hold: H("parcel", { len: 0.85 }), expr: "worried" }, face: mk(DEPOT, "board") } },
    gag: { prop: "recordBoard", id: "record", at: mk(DEPOT, "board"), ry: 0.0, in: "none" } },
  { at: "red", id: "red", shot: { size: "insert", on: "record", h: 1.2, angle: 0, move: "push", amount: 0.26 }, focus: "record", act: { dex: { pose: { limbs: { handR: [0.3, 0.3] }, hold: H("parcel", { len: 0.85 }), expr: "sad" } } }, sfx: [{ name: "error", lu: -12 }] },
  { at: "name", id: "name", off: 0.2 },
  // ---- the driver: "I left it on his mat. I swear."
  { at: "i", id: "iLeft", shot: { size: "close", on: "dex", angle: 0, move: "push", amount: 0.1 }, focus: "dex",
    act: { dex: { pose: point(0.85, 0.75, "pleading"), hold: null, talk: true, face: [0, 0, 30] } } },
  { at: "swear", id: "swear", act: { dex: { pose: { limbs: { handR: [0.12, 1.0] }, hands: { R: "open" }, expr: "pleading" }, talk: true } } },
  // ---- by winter, the refund pile beside the parked van stands taller than it
  { at: "by#2", id: "winter", place: "street", key: KGREY, music: "build", shot: { size: "full", on: [VAN_X + 1.6, 0.6, VAN_Z - 2.2], h: 5.0, angle: -8, move: "push", amount: 0.1 },
    act: { dex: { hide: false, at: mk(HOME, "pavement", [0.9, 0, 0.3]), pose: { limbs: { handR: [0.4, 0.4] }, expr: "worried" }, hold: null, face: mk(HOME, "pavement", [-0.6, 0, 0.2]) } },
    gag: { prop: "refundPile", id: "pile", at: mk(HOME, "pavement", [-0.6, 0, 0.2]), in: "none", until: "monday" } },
  { at: "taller", id: "taller", shot: { size: "full", on: [VAN_X + 1.6, 1.4, VAN_Z - 2.4], h: 5.4, angle: -2, move: "crane", amount: 0.5 }, act: { dex: { pose: "shock", expr: "mindblown" } }, kick: 0.03, sfx: [{ name: "impact", lu: -7 }] },
  // ---- one grey Monday: the scanners get a camera
  { at: "then#2", id: "monday", place: "depot", key: KDEPOTG, music: "calm", shot: { size: "medium", on: "dex", angle: 0, move: "push", amount: 0.26 },
    act: { dex: { at: mk(DEPOT, "benchFront", [-0.7, 0, 0.5]), pose: { limbs: { handR: [0.3, 0.3] }, expr: "exhausted" }, hold: null, face: mk(DEPOT, "bench") } },
    gag: { prop: "scannerRack", id: "rack", at: mk(DEPOT, "bench"), in: "none" } },
  { at: "scanner#2", id: "scannerW", shot: { size: "insert", on: [mk(DEPOT, "bench")[0], 1.2, mk(DEPOT, "bench")[2]], h: 0.8, angle: 0, move: "push", amount: 0.26 }, act: { dex: { pose: scan(0, "confused") } } },
  { at: "camera", id: "camera", act: { dex: { pose: scan(0.9, "amazed"), face: [0, 0, 30] } }, gag: { fx: "sparkle", on: "dex", size: 0.6, dy: -0.35 }, sfx: [{ name: "shutter", lu: -6, on_word: true }], event: [0, 4, 8, 12] },
  // ---- the mystery, on his face
  { at: "why", id: "why", place: "street", key: KDAY, shot: { size: "medium", on: "vexg", angle: 0, move: "push", amount: 0.26 },
    act: { vexg: { hide: false, at: IN_DOOR, pose: phoneUp("smug"), face: [IN_DOOR[0], 0, IN_DOOR[2] + 5] }, dex: { hide: true } }, gag: { fx: "question", on: "vexg", size: 0.8 } },
  // ---- the HOW: the scanner screen: photo, time, GPS pin; rings on door, mat, box
  { at: "you", id: "how", place: "depot", key: KDEPOT, music: "calm", shot: { size: "insert", on: "big", h: 0.82, angle: 0, move: "push", amount: 0.1 },
    act: { vexg: { hide: true } }, gag: { prop: "photoScanner", id: "big", origin: "center", at: mk(DEPOT, "center", [0.2, 1.6, 1.6]), in: "none", until: "so2" } },
  { at: "photo", id: "photo1", event: [0, 6], sfx: [{ name: "shutter", lu: -8, on_word: true }] },
  { at: "time", id: "time1", sfx: [{ name: "tick", lu: -10 }] },
  { at: "gps", id: "gps", sfx: [{ name: "pop", lu: -9 }] },
  { at: "receipt", id: "receipt", shot: { size: "insert", on: "big", h: 0.7, angle: 4, move: "push", amount: 0.26 } },
  { at: "door#2", id: "ydoor", sfx: [{ name: "pop", lu: -12 }] },
  { at: "mat#3", id: "ymat", sfx: [{ name: "pop", lu: -12 }] },
  { at: "box#4", id: "ybox", sfx: [{ name: "pop", lu: -12 }] },
  { at: "214", id: "t214" },
  // ---- the shop sends one photo
  { at: "so#2", id: "so2", place: "shop", key: KSHOP, music: "build", shot: { size: "medium", on: "bigsby", angle: 0, move: "push", amount: 0.26 },
    act: { bigsby: { at: BIGSBY, hide: false, pose: onPhone("smug"), face: [BIGSBY[0], 0, BIGSBY[2] + 5] } } },
  { at: "just#2", id: "cardIn", shot: { size: "insert", on: "card", h: 0.75, angle: 0, move: "push", amount: 0.26 } },
  { at: "photo#2", id: "sendPhoto", act: { bigsby: { pose: { limbs: { handR: [0.42, 1.3], handL: [0.85, 1.15] }, hands: { L: "open" }, hold: H("phone"), expr: "mischief" } } },
    gag: { prop: "photoCard", id: "card", origin: "center", at: [BIGSBY[0] + 0.55, 1.75, BIGSBY[2] + 0.35], in: "pop", until: "his7" } },
  // ---- the reveal: his box, his own mat, his own gnome
  { at: "his#7", id: "his7", place: "street", key: KDAY, shot: { size: "full", on: [MAT[0] - 0.3, MAT[1], MAT[2] + 0.1], h: 2.1, angle: 0, move: "push", amount: 0.26 }, focus: "box2",
    act: { vexg: { at: mk(HOME, "mat", [-0.62, 0, 0.12]), pose: onPhone("horrified"), face: MAT } }, gag: { prop: "parcel", id: "box2", at: MAT, ry: 0.15, in: "none", until: "the19" } },
  { at: "doormat#3", id: "ownMat", focus: "box2", act: { vexg: { pose: { limbs: { handR: [0.5, 0.5] }, hands: { R: "point" }, expr: "shock" }, hold: null } } },
  { at: "right", id: "gnomeIn", shot: { size: "insert", on: "gnome2", h: 0.7, angle: -10, move: "push", amount: 0.26 } },
  { at: "gnome", id: "gnomeW", kick: 0.04, focus: "gnome2", act: { vexg: { pose: { limbs: { handR: [0.45, 1.45] }, hands: { R: "open" }, expr: "mortified" }, face: GNOME } }, gag: [{ prop: "nothing", id: "gnome2", at: GNOME, in: "none" }, { fx: "sparkle", on: [GNOME[0], GNOME[1] + 0.45, GNOME[2]], size: 0.45 }], sfx: [{ name: "impact", lu: -3, on_word: true }] },
  // ---- the red marks vanish
  { at: "the#19", id: "the19", place: "depot", key: KDEPOT, music: "full", shot: { size: "insert", on: "record", h: 1.2, angle: 0, move: "push", amount: 0.26 },
    act: { vexg: { hide: true }, dex: { hide: false, at: mk(DEPOT, "board", [0.9, 0, 0.9]), pose: { limbs: { handR: [0.3, 0.3] }, expr: "relieved" }, hold: null, face: mk(DEPOT, "board") } } },
  { at: "red#2", id: "red2", focus: "record", act: { dex: { pose: { limbs: { handR: [0.85, 1.35], handL: [0.85, 1.35] }, hands: { R: "open", L: "open" }, expr: "happy" }, face: [0, 0, 30] } }, sfx: [{ name: "pop", lu: -10 }] },
  { at: "faster", id: "fast", shot: { size: "medium", on: "dex", angle: 0, move: "push", amount: 0.26 }, act: { dex: { pose: { limbs: { handR: [0.85, 1.35], handL: [0.85, 1.35] }, hands: { R: "open", L: "open" }, expr: "happy" }, face: [0, 0, 30] } } },
  { at: "boxes#2", id: "boxes2", off: 0.1 },
  // ---- the payoff: the photo of the door, then back into the van
  { at: "and#8", id: "and8", place: "street", key: KDUSK, shot: { size: "full", on: [MAT[0] - 0.4, MAT[1], MAT[2] + 0.5], h: 2.2, angle: 14, move: "push", amount: 0.26 },
    act: { dex: { at: BESIDE, pose: scan(0, "focused"), face: DOOR } }, gag: { prop: "parcel", id: "box3", at: MAT, ry: -0.2, in: "none" } },
  { at: "photographs", id: "photographs", act: { dex: { pose: scan(0.9, "focused"), lead: 1 } }, gag: { fx: "sparkle", on: "dex", size: 0.5, dy: -0.4 }, sfx: [{ name: "shutter", lu: -4, on_word: true }], event: [0, 4] },
  { at: "climbing", id: "climbing", act: { dex: { walk: mk(HOME, "porchL", [-3.6, 0, 0.5]), speed: 2.6, pose: { limbs: { handR: [0.85, 1.35] }, hands: { R: "open" }, expr: "happy" }, hold: null } }, sfx: [{ name: "car", lu: -12, df: 10 }] },
];

const BRAND = { ...BRANDS.ours, shine: false, torsoShine: false, ink: "#1a1012" }; // this film: no drawn face shine (it split the face), a warm near-black ink (light study)
const board: Board = {
  id: "doorphoto", title: "Why Delivery Drivers Started Photographing Your Door", words: WORDS, brand: BRAND, voOffset: 0, tail: 0.6, walkRate: 3.6, walkLean: 0.2,
  cast: {
    dex: castEntry("courier"),
    vex: castEntry("vex"),
    vexg: castEntry("vex", { hat: { style: "headphones", color: "#f5c21b", accent: "#d9a520" } }),
    bigsby: castEntry("bigsby"),
    hank: castEntry("neighbor"),
    ex1: { spec: extra(7), height: 1.66 }, ex2: { spec: extra(12), height: 1.72 },
  },
  places: {
    street: { set: "baked", baked: { dir: "sets/home", manifest: HOME },
      vehicles: { van: { kind: "glb", opts: { url: "sets/van/van.glb", ...VAN, look: "pbr" }, path: [[VAN_X - 7, 0, VAN_Z], [VAN_X, 0, VAN_Z]], from: "open", to: "last", ease: "stop",
        then: [{ path: [[VAN_X, 0, VAN_Z], [VAN_X + 26, 0, VAN_Z]], from: "drove", to: "neverArrived", ease: "start" },
          { path: [[VAN_X, 0, VAN_Z], [VAN_X + 0.01, 0, VAN_Z]], from: "winter", to: "taller" },
          { path: [[VAN_X, 0, VAN_Z], [VAN_X + 0.01, 0, VAN_Z]], from: "and8", to: "photographs" }] } } },
    shop: { set: "baked", baked: { dir: "sets/office", manifest: OFFICE } },
    depot: { set: "baked", baked: { dir: "sets/depot", manifest: DEPOT } },
  },
  props: { parcel, skyDome, tapScanner: (api) => bigScanner(api, "tick"), photoScanner: (api) => bigScanner(api, "photo"), scannerRack, tvBox, blenderBox, phonesBox, streetBoxes: streetBoxes2, refundPile, recordBoard, monitor, photoCard, nothing: () => new THREE.Group() },
  beats,
};
export const doorphotoShort = boardProject(board);
export const doorphotoBoard = board;
