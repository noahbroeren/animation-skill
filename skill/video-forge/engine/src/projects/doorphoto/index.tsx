/**
 * TEST SHORT -- "Why Delivery Drivers Started Photographing Your Door" (9:16, 2K, 60 fps, our cast ours-v1).
 *
 * Story (scheme and comeuppance, lint 100/100): a man claims every parcel "never came" and gets free replacements;
 * his street copies him; the driver gets the blame; then the scanners get a camera, and the photo (time + GPS) on his
 * own doormat, next to his own gnome, ends it. Facts: public/doorphoto/claims.md (photo proof of delivery: Amazon
 * drivers from about 2018, FedEx from 2022; the photo is stored with the time and the GPS spot).
 * Cast: Vex (the schemer), Dex (the driver), Mr. Bigsby (the shop), Hank (the neighbour) + extras, all BRANDS.ours.
 */
import * as THREE from "three";
import { Beat, Board, BoardApi, boardProject } from "../../lib/board";
import { BRANDS, KPose, StickHold } from "../../lib/characters/kinds";
import { castEntry, extra } from "../../lib/characters/ours";
import { LightKey, tweak } from "../../lib/three/lightplan";
import { canvasTexture } from "../../lib/three/textures";
import { clamp, ease } from "../../lib/time";
import WORDS from "./words.json";

// ------------------------------------------------------------------------------------------------ materials and drawings
const lam = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(o);
const INK = "#15171f", CARD = "#c8935a", TAPE = "#e9cf96";
const shadowed = <T extends THREE.Object3D>(o: T) => { o.traverse((m) => { (m as THREE.Mesh).castShadow = true; }); return o; };

/** the photo the scanner takes: his blue door, the tiled porch, the doormat with a parcel on it and the gnome */
function drawDoorPhoto(g: CanvasRenderingContext2D, W: number, H: number, o: { box?: boolean } = {}) {
  const ln = (w: number) => { g.strokeStyle = INK; g.lineWidth = w; g.lineJoin = "round"; };
  g.fillStyle = "#f0dfbd"; g.fillRect(0, 0, W, H); // house wall
  g.fillStyle = "#e3cfa6"; for (let y = 0; y < H * 0.62; y += H * 0.07) g.fillRect(0, y, W, H * 0.008);
  const fy = H * 0.66; g.fillStyle = "#c9b8a4"; g.fillRect(0, fy, W, H - fy); // porch tiles
  g.strokeStyle = "#8d7a68"; g.lineWidth = W * 0.006; for (let x = 0; x < W; x += W * 0.16) { g.beginPath(); g.moveTo(x, fy); g.lineTo(x - W * 0.08, H); g.stroke(); } for (let y = fy; y < H; y += H * 0.08) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  const dx = W * 0.28, dw = W * 0.36, dy = H * 0.12, dh = fy - dy; // the door
  g.fillStyle = "#f4efe6"; g.fillRect(dx - W * 0.03, dy - H * 0.03, dw + W * 0.06, dh + H * 0.03); ln(W * 0.008); g.strokeRect(dx - W * 0.03, dy - H * 0.03, dw + W * 0.06, dh + H * 0.03);
  g.fillStyle = "#3d6b8a"; g.fillRect(dx, dy, dw, dh); g.strokeRect(dx, dy, dw, dh);
  g.strokeStyle = "#2c5470"; g.lineWidth = W * 0.008; g.strokeRect(dx + dw * 0.14, dy + dh * 0.1, dw * 0.72, dh * 0.34); g.strokeRect(dx + dw * 0.14, dy + dh * 0.52, dw * 0.72, dh * 0.38);
  g.fillStyle = "#f1c94a"; g.beginPath(); g.arc(dx + dw * 0.86, dy + dh * 0.55, W * 0.018, 0, 7); g.fill(); ln(W * 0.005); g.stroke();
  const my = fy + H * 0.04, mw = W * 0.5, mh = H * 0.16, mx = W * 0.21; // the doormat
  g.fillStyle = "#8a5a34"; g.beginPath(); g.roundRect(mx, my, mw, mh, W * 0.02); g.fill(); ln(W * 0.008); g.stroke();
  g.fillStyle = "#5a3a20"; g.font = `900 ${Math.round(H * 0.05)}px Arial Black, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("WELCOME", mx + mw / 2, my + mh * 0.72);
  if (o.box !== false) { const bx = mx + mw * 0.3, bw = mw * 0.4, bh = H * 0.13, by = my + mh * 0.45 - bh; // the parcel on the mat
    g.fillStyle = CARD; g.fillRect(bx, by, bw, bh); g.fillStyle = TAPE; g.fillRect(bx + bw * 0.42, by, bw * 0.16, bh); ln(W * 0.008); g.strokeRect(bx, by, bw, bh);
    g.fillStyle = "#f6f4ee"; g.fillRect(bx + bw * 0.62, by + bh * 0.2, bw * 0.28, bh * 0.3); }
  const gx = W * 0.83, gy = fy + H * 0.2; // the gnome
  g.fillStyle = "#3f6fd6"; g.beginPath(); g.moveTo(gx - W * 0.07, gy); g.lineTo(gx + W * 0.07, gy); g.lineTo(gx + W * 0.04, gy - H * 0.12); g.lineTo(gx - W * 0.04, gy - H * 0.12); g.closePath(); g.fill(); ln(W * 0.007); g.stroke();
  g.fillStyle = "#ffffff"; g.beginPath(); g.moveTo(gx - W * 0.045, gy - H * 0.15); g.lineTo(gx + W * 0.045, gy - H * 0.15); g.lineTo(gx, gy - H * 0.05); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "#f2c9a6"; g.beginPath(); g.arc(gx, gy - H * 0.16, W * 0.03, 0, 7); g.fill(); g.stroke();
  g.fillStyle = "#d8344e"; g.beginPath(); g.moveTo(gx - W * 0.045, gy - H * 0.175); g.lineTo(gx + W * 0.045, gy - H * 0.175); g.lineTo(gx + W * 0.01, gy - H * 0.29); g.closePath(); g.fill(); g.stroke();
}
const photoTex = (key: string, box = true) => canvasTexture(`doorphoto|${key}|${box}`, 512, 512, (g) => drawDoorPhoto(g, 512, 512, { box }));

/** a cardboard box, base at y = 0; `icon` prints what is inside on the front */
function cardboard(w: number, h: number, d: number, o: { color?: string; icon?: "tv" | "blender" | "phone" | "none" } = {}) {
  const col = o.color ?? CARD, ic = o.icon ?? "none";
  const front = canvasTexture(`cbox|${ic}|${col}`, 256, 256, (g) => {
    g.fillStyle = col; g.fillRect(0, 0, 256, 256); g.fillStyle = ic === "phone" ? "#e8edf3" : TAPE; g.fillRect(108, 0, 40, 26);
    g.strokeStyle = INK; g.lineWidth = 9; g.lineJoin = "round"; g.fillStyle = "#2b2f3a";
    if (ic === "tv") { g.beginPath(); g.roundRect(48, 62, 160, 108, 12); g.fill(); g.stroke(); g.fillStyle = "#9fd8ff"; g.fillRect(64, 78, 128, 76); g.fillStyle = "#2b2f3a"; g.fillRect(118, 170, 20, 26); g.fillRect(90, 192, 76, 12); }
    if (ic === "blender") { g.fillStyle = "#cfe8f7"; g.beginPath(); g.moveTo(86, 48); g.lineTo(170, 48); g.lineTo(156, 160); g.lineTo(100, 160); g.closePath(); g.fill(); g.stroke(); g.fillStyle = "#e2483a"; g.beginPath(); g.roundRect(82, 160, 92, 50, 10); g.fill(); g.stroke(); g.fillStyle = "#2b2f3a"; g.fillRect(84, 36, 88, 16); }
    if (ic === "phone") { g.fillStyle = "#2b2f3a"; g.beginPath(); g.roundRect(92, 50, 72, 150, 16); g.fill(); g.stroke(); g.fillStyle = "#6fb6e8"; g.fillRect(100, 66, 56, 112); }
  });
  const side = lam({ color: col }), top = lam({ map: canvasTexture(`cboxtop|${col}|${ic}`, 128, 128, (g) => { g.fillStyle = col; g.fillRect(0, 0, 128, 128); g.fillStyle = ic === "phone" ? "#e8edf3" : TAPE; g.fillRect(50, 0, 28, 128); g.strokeStyle = "rgba(60,40,20,0.35)"; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke(); }) });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, side, lam({ map: front }), side]); m.position.y = h / 2;
  const grp = new THREE.Group(); grp.add(m); return shadowed(grp);
}
const doormat = () => { const g = new THREE.Group(), tex = canvasTexture("doormat2", 512, 256, (c) => { c.fillStyle = "#8a5a34"; c.fillRect(0, 0, 512, 256); c.fillStyle = "#7a4e2c"; for (let i = 0; i < 40; i++) c.fillRect((i * 37) % 512, 0, 6, 256); c.strokeStyle = "#5a3a20"; c.lineWidth = 14; c.strokeRect(14, 14, 484, 228); c.fillStyle = "#4a2e18"; c.font = "900 92px Arial Black, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("WELCOME", 256, 132); });
  const brown = lam({ color: "#6b4426" }), m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.035, 0.66), [brown, brown, lam({ map: tex }), brown, brown, brown]); m.position.y = 0.018; m.receiveShadow = true; g.add(m); return g; };
/** a garden gnome, about 0.6 m: red hat, white beard, blue coat */
const gnome = () => { const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 0.28, 16), lam({ color: "#3f6fd6" })); body.position.y = 0.16; g.add(body);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.14, 0.04, 16), lam({ color: "#2b2230" })); belt.position.y = 0.2; g.add(belt);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), lam({ color: "#f2c9a6" })); head.position.y = 0.38; g.add(head);
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 14), lam({ color: "#ffffff" })); beard.rotation.x = Math.PI; beard.position.set(0, 0.29, 0.05); g.add(beard);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), lam({ color: "#ef8a8a" })); nose.position.set(0, 0.37, 0.1); g.add(nose);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 16), lam({ color: "#d8344e" })); hat.position.y = 0.58; hat.rotation.z = 0.15; g.add(hat);
  for (const sx of [-1, 1]) { const boot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), lam({ color: "#5a3a20" })); boot.scale.set(1, 0.6, 1.4); boot.position.set(sx * 0.07, 0.03, 0.04); g.add(boot); }
  return shadowed(g); };
/** four opened phone boxes stacked by the door: the 5th is in his hands */
const oldBoxes = () => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = cardboard(0.3, 0.09, 0.2, { color: "#f4f6fa", icon: "phone" }); b.position.set((i % 2) * 0.03 - 0.015, i * 0.092, 0); b.rotation.y = (i % 2 ? 0.12 : -0.08); g.add(b); } return g; };
const tvBox = () => cardboard(0.95, 0.66, 0.2, { icon: "tv" });
const blenderBox = () => cardboard(0.4, 0.55, 0.36, { icon: "blender" });
const parcelOnMat = () => cardboard(0.42, 0.28, 0.32);
/** the neighbours' parcels: stacks along the pavement */
const streetBoxes = () => { const g = new THREE.Group(); const spots: [number, number, number][] = [[-3.4, 0.16, -4.7], [-1.9, 0.16, -4.9], [1.5, 0.16, -4.8], [3.1, 0.16, -4.6], [4.6, 0.16, -4.9], [-5.0, 0.16, -4.8]];
  spots.forEach(([x, y, z], i) => { for (let k = 0; k < 2 + (i % 3); k++) { const b = cardboard(0.5 - k * 0.06, 0.34, 0.4 - k * 0.04, { color: k % 2 ? "#b98250" : CARD }); b.position.set(x + (k % 2) * 0.05, y + k * 0.34, z); b.rotation.y = 0.2 * Math.sin(i + k); g.add(b); } }); return g; };
/** the refund pile: boxes stack up from "winter" until it is taller than the van on "taller" */
const refundPile = (api: BoardApi) => { const g = new THREE.Group(), boxes: THREE.Object3D[] = []; let y = 0;
  for (let i = 0; i < 16; i++) { const w = 0.9 - (i % 3) * 0.12, h = 0.24 + (i % 4) * 0.03, b = cardboard(w, h, 0.7 - (i % 2) * 0.1, { color: i % 3 ? CARD : "#b98250", icon: i % 5 === 2 ? "tv" : i % 7 === 3 ? "blender" : "none" }); b.position.set(0.08 * Math.sin(i * 1.7), y, 0.06 * Math.cos(i * 2.1)); b.rotation.y = 0.25 * Math.sin(i * 1.3); y += h; g.add(b); boxes.push(b); }
  return { group: g, update(f: number) { const T = api.T, k = ease.outCubic(clamp((f - T.winter + 6) / Math.max(1, T.taller - T.winter + 12))), n = Math.round(4 + 12 * k); boxes.forEach((b, i) => { b.visible = i < n; }); } }; };
/** the driver's record: a board on a stand; red crosses appear one at a time between "every" and "time" */
const recordBoard = (api: BoardApi) => { const g = new THREE.Group(), steel = lam({ color: "#8d96a6" });
  const face = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.05, 0.05), [steel, steel, steel, steel, lam({ map: canvasTexture("record4", 512, 360, (c) => { c.fillStyle = "#f6f4ee"; c.fillRect(0, 0, 512, 360); c.strokeStyle = "#8d96a6"; c.lineWidth = 10; c.strokeRect(5, 5, 502, 350);
    c.fillStyle = "#f5a524"; c.beginPath(); c.arc(70, 64, 34, Math.PI, 0); c.fill(); c.fillStyle = "#fcf8f3"; c.beginPath(); c.arc(70, 78, 30, 0, 7); c.fill(); c.strokeStyle = INK; c.lineWidth = 6; c.stroke(); c.fillStyle = INK; c.fillRect(56, 74, 8, 10); c.fillRect(78, 74, 8, 10);
    c.strokeStyle = "#c9ced8"; c.lineWidth = 4; for (let r = 0; r < 3; r++) { c.beginPath(); c.moveTo(130, 60 + r * 26); c.lineTo(470, 60 + r * 26); c.stroke(); } for (let r = 0; r < 4; r++) { c.beginPath(); c.moveTo(30, 150 + r * 52); c.lineTo(482, 150 + r * 52); c.stroke(); } }) }), steel]);
  face.position.y = 1.55; g.add(face);
  for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), steel); leg.position.set(sx * 0.6, 0.55, 0); g.add(leg); }
  const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.18, 0.16) }), X: THREE.Group[] = [];
  for (let i = 0; i < 18; i++) { const x = new THREE.Group(); for (const s of [1, -1]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.028, 0.01), red); bar.rotation.z = s * 0.8; x.add(bar); } x.position.set(-0.6 + (i % 7) * 0.2, 1.33 - Math.floor(i / 7) * 0.2, 0.035); g.add(x); X.push(x); }
  return { group: shadowed(g), update(f: number) { const T = api.T, k = clamp((f - T.every2) / Math.max(1, T.atime - T.every2)), n = Math.floor(k * 18 + 0.0001);
    X.forEach((x, i) => { x.visible = i < n; x.scale.setScalar(n - i === 1 ? 1.25 : 1); }); } }; };
/** the computer on the shop's desk: a big green tick and a little van (the scan that said "delivered") */
const monitor = () => { const g = new THREE.Group(), dark = lam({ color: "#2b2f3a" });
  const scr = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.46, 0.04), [dark, dark, dark, dark, new THREE.MeshBasicMaterial({ map: canvasTexture("tickscreen", 320, 200, (c) => { c.fillStyle = "#e8f2fb"; c.fillRect(0, 0, 320, 200); c.strokeStyle = "#2f9a5a"; c.lineWidth = 26; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath(); c.moveTo(70, 104); c.lineTo(128, 156); c.lineTo(240, 46); c.stroke();
    c.fillStyle = "#f1e7d2"; c.strokeStyle = INK; c.lineWidth = 5; c.beginPath(); c.roundRect(214, 132, 80, 44, 8); c.fill(); c.stroke(); c.fillStyle = "#2b2f3a"; c.beginPath(); c.arc(232, 178, 9, 0, 7); c.arc(278, 178, 9, 0, 7); c.fill(); }) }), dark]);
  scr.position.y = 0.36; g.add(scr); const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), dark); st.position.y = 0.08; g.add(st); const ft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.18), dark); ft.position.y = 0.01; g.add(ft); return shadowed(g); };
/** a parcel thrown out of the shop on "mailed": it arcs out of frame to the right */
const flyBox = (api: BoardApi) => { const g = new THREE.Group(), b = cardboard(0.36, 0.24, 0.28); g.add(b);
  return { group: g, update(f: number, fps: number) { const u = (f - api.T.mailed) / fps; b.visible = u > -0.1 && u < 0.9; const k = clamp(u / 0.8); b.position.set(2.2 * k, 1.2 * Math.sin(k * Math.PI) * 0.8 - 0.4 * k, 0.4 * k); b.rotation.set(u * 5, u * 3, u * 2); } }; };
/** the depot's charging rack: six scanners; on "camera" each one gets a lens and flashes */
const scannerRack = (api: BoardApi) => { const g = new THREE.Group(), dark = lam({ color: "#2b2f3a" }), wood = lam({ color: "#9aa2b4" });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.6), wood); desk.position.y = 0.92; g.add(desk); for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.5), wood); l.position.set(sx * 0.88, 0.45, 0); g.add(l); }
  const flashes: THREE.Mesh[] = [], lenses: THREE.Mesh[] = [], flashM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.6), transparent: true });
  for (let i = 0; i < 6; i++) { const s = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.06), dark); body.position.y = 0.15; s.add(body);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.14), new THREE.MeshBasicMaterial({ color: "#9fd8ff" })); scr.position.set(0, 0.19, 0.031); s.add(scr);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), lam({ color: "#11131a" })); lens.rotation.x = Math.PI / 2; lens.position.set(0.045, 0.27, 0.04); s.add(lens); lenses.push(lens);
    const fl = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), flashM); fl.position.set(0.045, 0.27, 0.06); s.add(fl); flashes.push(fl);
    s.position.set(-0.75 + i * 0.3, 0.96, 0.05); s.rotation.x = -0.25; g.add(s); }
  return { group: shadowed(g), update(f: number, fps: number) { const T = api.T; lenses.forEach((l, i) => { l.visible = f >= T.camera + i * 2; }); flashes.forEach((fl, i) => { const u = (f - T.camera - i * 2) / fps; fl.visible = u >= 0 && u < 0.25; fl.scale.setScalar(1 + u * 6); }); } }; };
/** the scanner screen up close (the change of picture for the "how"): the door photo, then the time, then the map pin;
 *  rings close around the door, the mat and the box on the words */
const bigScanner = (api: BoardApi) => { const g = new THREE.Group(), dark = lam({ color: "#2b2f3a" });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.08), dark); g.add(body);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 0.1), dark); grip.position.y = -0.62; grip.rotation.x = 0.15; g.add(grip);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.54), new THREE.MeshBasicMaterial({ map: photoTex("scanner") })); scr.position.set(0, 0.11, 0.041); g.add(scr);
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.1), new THREE.MeshBasicMaterial({ color: "#e8833a" })); bar.position.set(0, -0.27, 0.041); g.add(bar);
  const clock = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.09), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTexture("clock214", 300, 90, (c) => { c.fillStyle = "rgba(21,23,31,0.86)"; c.beginPath(); c.roundRect(0, 0, 300, 90, 20); c.fill(); c.fillStyle = "#ffffff"; c.font = "900 54px Arial Black, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("2:14 PM", 150, 48); }) }));
  clock.position.set(0.1, 0.32, 0.045); g.add(clock);
  const pin = new THREE.Group(), pinM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.2, 0.2) }); const ph = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), pinM); ph.position.y = 0.06; pin.add(ph); const pt = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 10), pinM); pt.rotation.x = Math.PI; pt.position.y = 0.015; pin.add(pt);
  const map = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.16), new THREE.MeshBasicMaterial({ map: canvasTexture("minimap", 200, 160, (c) => { c.fillStyle = "#dfeedd"; c.fillRect(0, 0, 200, 160); c.fillStyle = "#ffffff"; c.fillRect(0, 70, 200, 22); c.fillRect(90, 0, 22, 160); c.fillStyle = "#b9d4ef"; c.fillRect(140, 10, 50, 40); c.strokeStyle = INK; c.lineWidth = 6; c.strokeRect(3, 3, 194, 154); }) }));
  map.position.set(-0.15, -0.13, 0.046); g.add(map); pin.position.set(-0.15, -0.16, 0.06); g.add(pin);
  const ringM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, 0.2) });
  const ring = (x: number, y: number, r: number) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 40), ringM); m.position.set(x, y, 0.05); g.add(m); return m; };
  const rDoor = ring(-0.005, 0.2, 0.15), rMat = ring(-0.005, -0.03, 0.15), rBox = ring(-0.005, 0.0, 0.07);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true })); flash.position.z = 0.05; g.add(flash);
  return { group: shadowed(g), update(f: number, fps: number) { const T = api.T, t = f / fps;
    g.rotation.y = 0.12 * Math.sin(t * 0.9); g.rotation.z = 0.03 * Math.sin(t * 0.7);
    const fu = (f - T.photo1) / fps; (flash.material as THREE.MeshBasicMaterial).opacity = fu >= 0 && fu < 0.3 ? 0.9 * (1 - fu / 0.3) : 0; flash.visible = fu >= 0 && fu < 0.3;
    clock.visible = f >= T.time4; clock.scale.setScalar(f >= T.time4 ? Math.min(1, 0.6 + (f - T.time4) / 8) : 1);
    map.visible = f >= T.gps; const pu = (f - T.gps) / fps; pin.visible = pu >= 0.05; pin.position.y = -0.16 + (pu < 0.3 ? 0.25 * (1 - pu / 0.3) ** 2 : 0);
    const on = (m: THREE.Mesh, a: number, b: number, sy = 1) => { m.visible = f >= a && f < b; if (m.visible) { const s = Math.min(1, 0.4 + (f - a) / 6); m.scale.set(s, s * sy, 1); } };
    on(rDoor, T.door, T.mat); on(rMat, T.mat, T.box2, 0.42); on(rBox, T.box2, T.total); } }; };
/** the printed photo the shop sends back (a polaroid) */
const photoCard = () => { const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.01), lam({ color: "#fbfaf6", emissive: new THREE.Color("#fbfaf6"), emissiveIntensity: 0.25 })); g.add(frame);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.54), new THREE.MeshBasicMaterial({ map: photoTex("card") })); pic.position.set(0, 0.05, 0.006); g.add(pic);
  const stamp = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.08), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTexture("cardstamp", 400, 80, (c) => { c.fillStyle = "#2b2f3a"; c.font = "700 44px Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("2:14 PM", 150, 42); c.fillStyle = "#e2333f"; c.beginPath(); c.arc(330, 30, 16, 0, 7); c.fill(); c.beginPath(); c.moveTo(316, 38); c.lineTo(344, 38); c.lineTo(330, 66); c.closePath(); c.fill(); }) }));
  stamp.position.set(0, -0.28, 0.006); g.add(stamp);
  return { group: g, update(f: number, fps: number) { const t = f / fps; g.rotation.set(0.05 * Math.sin(t * 1.1), 0.25 * Math.sin(t * 0.8), 0.06 * Math.sin(t * 0.9)); } }; };

// ------------------------------------------------------------------------------------------------ light
const HOME: LightKey = tweak("day", { grade: { saturation: 1.12 } });
const SHOP: LightKey = tweak("office", { exposure: 1.06, grade: { saturation: 1.3, vibrance: 0.2 } });
const GREY: LightKey = tweak("overcast", { exposure: 1.08, grade: { saturation: 1.05 } });
const DUSK: LightKey = tweak("golden", { grade: { saturation: 1.12 } });

// ------------------------------------------------------------------------------------------------ acting vocabulary
const H = (item: StickHold["item"], more: Partial<StickHold> = {}): StickHold => ({ item, hand: "R", ...more });
const boxHold = (expr: KPose["expr"] = "giddy"): KPose => ({ limbs: { handR: [0.22, 0.62], handL: [0.22, 0.6] }, hold: H("parcel", { color: "#f4f6fa", len: 0.9 }), expr });
const phoneUp = (expr: KPose["expr"] = "smug"): KPose => ({ limbs: { handR: [0.55, 1.32] }, hold: H("phone", { len: 0.8 }), expr });
const onPhone = (expr: KPose["expr"]): KPose => ({ limbs: { handR: [0.42, 1.3] }, hold: H("phone"), turn: -0.2, expr });
const scan = (open: number, expr: KPose["expr"] = "focused"): KPose => ({ limbs: { handR: [0.78, 1.0] }, hold: H("scanner", { open, len: 0.95, aim: 90 }), expr });
const point = (x: number, y: number, expr: KPose["expr"]): KPose => ({ limbs: { handR: [x, y] }, hands: { R: "point" }, expr });
const T3 = (facing: 1 | -1) => ({ view: "three" as const, facing });

// marks
const PORCH: [number, number, number] = [-2.6, 0, -6.15];
const BIGSBY: [number, number, number] = [-0.95, 0, -0.55]; /* beside the desk, not behind the set's own monitor */

// ------------------------------------------------------------------------------------------------ the storyboard
const beats: Beat[] = [
  // ---- 1 HOOK: on his porch, he unboxes the fifth phone (four empty boxes by the door), lifts it, then calls: "never came"
  { at: 0, id: "hook", place: "home", key: HOME, music: "build",
    shot: { size: "medium", on: "vex", angle: 14, side: 0.18, move: "push", amount: 0.16 },
    act: { vex: { at: PORCH, pose: boxHold("giddy"), ...T3(1) }, vexg: { hide: true, at: PORCH } },
    gag: [{ prop: "doormat", id: "mat", at: [-2.6, 0, -6.72], in: "none" }, { prop: "gnome", id: "gnome", at: [-1.9, 0, -6.95], ry: -0.4, in: "none" }, { prop: "oldBoxes", id: "oldBoxes", at: [-3.5, 0, -7.0], in: "none" }],
    sfx: [{ name: "rustle", lu: -12 }] },
  { at: "phone", id: "phone", act: { vex: { pose: phoneUp("smug"), ...T3(1) } }, gag: { fx: "sparkle", on: "vex", size: 0.45, dy: -0.15 }, sfx: ["ding"] },
  { at: "swore", id: "swore", act: { vex: { pose: onPhone("innocent"), ...T3(1) } } },
  // ---- 2 SETUP: the shop only had a scan (the tick on the screen) and his word (the phone)
  { at: "you", id: "you", place: "shop", key: SHOP, shot: { size: "medium", on: "bigsby", angle: 16, side: 0.12, move: "push", amount: 0.14 },
    act: { bigsby: { at: BIGSBY, pose: point(0.75, 1.0, "think"), ...T3(1) } }, gag: { prop: "monitor", id: "monitor", at: [-0.3, 0.85, -1.05], ry: -0.55, in: "none" }, focus: "monitor" },
  { at: "word", id: "word", focus: "bigsby", act: { bigsby: { pose: onPhone("confused"), ...T3(1) } } },
  // ---- 3 he says "missing": the shop sighs and posts a new one
  { at: "so", id: "so", shot: { size: "medium", on: "bigsby", angle: 10, side: 0.15, move: "push", amount: 0.12 }, act: { bigsby: { pose: onPhone("sighing"), ...T3(1) } } },
  { at: "sighed", id: "sighed", act: { bigsby: { pose: { limbs: { handR: [0.45, 0.6] }, hold: H("parcel"), expr: "sighing" }, ...T3(1) } } },
  { at: "mailed", id: "mailed", act: { bigsby: { pose: { limbs: { handR: [1.0, 1.25] }, hands: { R: "open" }, expr: "deadpan" }, hold: null, ...T3(1) } }, gag: { prop: "flyBox", id: "flyBox", at: [-0.4, 1.3, -0.2], in: "none", until: "refund" }, sfx: [{ name: "whoosh", lu: -12 }] },
  // ---- 4 the boss: "Refund him."
  { at: "refund", id: "refund", shot: { size: "close", on: "bigsby", angle: -6, move: "push", amount: 0.1 }, act: { bigsby: { pose: { limbs: { handR: [0.8, 1.05] }, hands: { R: "open" }, expr: "smug" }, talk: true, ...T3(1) } } },
  { at: "happy", id: "happyW", act: { bigsby: { pose: point(0.8, 1.1, "confident"), talk: true, ...T3(1) } } },
  // ---- 5 he comes back for more: a TV, a blender, golden headphones (one composition, one more thing each word)
  { at: "did", id: "did", place: "home", key: HOME, shot: { size: "full", on: [-2.95, 0, -6.45], h: 2.35, angle: 8, move: "push", amount: 0.1 },
    act: { vex: { at: PORCH, pose: phoneUp("smug"), ...T3(1) }, vexg: { hide: true } } },
  { at: "tv", id: "tv", gag: { prop: "tvBox", id: "tvBox", at: [-4.05, 0, -6.6], ry: 0.35, in: "drop" }, sfx: [{ name: "thud", lu: -10 }] },
  { at: "blender", id: "blender", gag: { prop: "blenderBox", id: "blenderBox", at: [-3.2, 0, -6.25], ry: 0.3, in: "drop" }, sfx: [{ name: "thud", lu: -10 }] },
  { at: "golden", id: "golden", act: { vex: { hide: true }, vexg: { hide: false, at: PORCH, pose: { limbs: { handR: [0.4, 1.05], handL: [0.35, 1.05] }, hands: { R: "open", L: "open" }, expr: "proud" }, ...T3(1) } }, gag: { fx: "sparkle", on: "vexg", size: 0.7, dy: -0.2 }, sfx: ["ding"], event: [0, 4] },
  // ---- 6 the neighbours copy him: a whisper, then the street full of parcels
  { at: "then#3", id: "neigh", place: "street", key: HOME, shot: { size: "full", on: [-1.6, 0, -4.4], h: 1.95, angle: 8, move: "push", amount: 0.12 },
    act: { vexg: { at: [-2.05, 0.16, -4.4], pose: { limbs: { handR: [0.85, 1.25] }, hands: { R: "open" }, expr: "sneaky" }, ...T3(1) }, hank: { at: [-1.05, 0.16, -4.3], pose: { limbs: { handR: [0.3, 1.45] }, hands: { R: "open" }, expr: "amazed" }, ...T3(-1) } } },
  { at: "soon", id: "soon", shot: { size: "full", on: [-1.4, 0.16, -4.6], h: 3.0, angle: 4, move: "crane", amount: 0.6 }, crowd: "laugh",
    act: { hank: { pose: { limbs: { handR: [0.25, 0.62], handL: [0.25, 0.6] }, hold: H("parcel", { len: 0.9 }), expr: "mischief" }, view: "front" }, vexg: { pose: phoneUp("mischief"), view: "front" },
      ex1: { at: [-3.6, 0.16, -4.1], pose: onPhone("innocent"), view: "front" }, ex2: { at: [0.7, 0.16, -4.0], pose: { limbs: { handR: [0.25, 0.62], handL: [0.25, 0.6] }, hold: H("parcel", { len: 0.9 }), expr: "smug" }, view: "front" } },
    gag: { prop: "streetBoxes", id: "streetBoxes", at: [0, 0, 0], in: "none", until: "every2" } },
  // ---- 7 every missing box is a red mark on the driver's record
  { at: "every#2", id: "every2", place: "depot", key: SHOP, music: "thin", shot: { size: "full", on: [0.35, 0, 0.6], h: 2.35, angle: -14, move: "push", amount: 0.14 },
    act: { dex: { at: [0.8, 0, 0.95], pose: { limbs: { handR: [0.3, 0.3] }, hold: H("parcel", { len: 0.85 }), expr: "worried" }, ...T3(-1) } },
    gag: { prop: "recordBoard", id: "record", at: [-0.25, 0, 0.2], ry: 0.2, in: "none", until: "monday" } },
  { at: "red", id: "red", focus: "record", act: { dex: { pose: { limbs: { handR: [0.3, 0.3] }, hold: H("parcel", { len: 0.85 }), expr: "sad" }, ...T3(-1) } }, sfx: [{ name: "error", lu: -12 }] },
  { at: "time#2", id: "atime", off: 0.2 },
  // ---- 8 the driver: "I left it on his mat. I swear."
  { at: "i", id: "iLeft", shot: { size: "close", on: "dex", angle: -10, side: -0.1, move: "push", amount: 0.1 }, focus: "dex", act: { dex: { pose: point(0.85, 0.75, "pleading"), hold: null, talk: true, ...T3(-1) } } },
  { at: "swear", id: "swear", act: { dex: { pose: { limbs: { handR: [0.12, 1.0] }, hands: { R: "open" }, expr: "pleading" }, talk: true, ...T3(-1) } } },
  // ---- 9 who wins? the tired driver at the desk loses to a sad voice on the phone
  { at: "who", id: "who", place: "shop", key: SHOP, shot: { size: "full", on: [-0.3, 0, -0.45], h: 2.45, angle: 8, move: "push", amount: 0.12 },
    act: { bigsby: { at: BIGSBY, pose: onPhone("skeptical"), ...T3(1) }, dex: { at: [0.35, 0, -0.3], pose: { limbs: { handR: [0.35, 0.2] }, expr: "exhausted" }, hold: null, ...T3(-1) } } },
  { at: "customer#2", id: "theCustomer", act: { bigsby: { pose: onPhone("touched"), ...T3(1) }, dex: { pose: { limbs: { handR: [0.2, 0.15] }, expr: "heartbroken" }, ...T3(-1) } }, sfx: [{ name: "sad_trombone", lu: -14 }] },
  // ---- 10 by winter, a tower of refunds taller than the van
  { at: "winter", id: "winter", place: "street", key: GREY, music: "build", shot: { size: "full", on: [2.5, 0, -2.9], h: 3.1, angle: -8, move: "push", amount: 0.1 },
    act: { vexg: { hide: true }, hank: { hide: true }, ex1: { hide: true }, ex2: { hide: true }, bigsby: { at: [-0.1, 0.16, -4.1], pose: { limbs: { handR: [0.4, 0.4] }, expr: "worried" }, ...T3(1) } },
    gag: { prop: "refundPile", id: "pile", at: [1.0, 0.16, -3.6], in: "none", until: "monday" } },
  { at: "taller", id: "taller", shot: { size: "full", on: [1.9, 0.9, -3.2], h: 3.9, angle: -6, move: "crane", amount: 0.8 }, act: { bigsby: { pose: "shock", expr: "mindblown" } }, kick: 0.03, sfx: [{ name: "impact", lu: -7 }] },
  // ---- 11 the turn: one grey Monday, the scanners get a camera
  { at: "then#4", id: "monday", place: "depot", key: GREY, music: "calm", shot: { size: "medium", on: "dex", angle: 14, side: 0.2, move: "push", amount: 0.14 },
    act: { dex: { at: [0.3, 0, 0.9], pose: { limbs: { handR: [0.3, 0.3] }, expr: "exhausted" }, hold: null, ...T3(1) }, bigsby: { hide: true } },
    gag: { prop: "scannerRack", id: "rack", at: [-0.6, 0, -0.3], in: "none" } },
  { at: "scanner", id: "scannerW", act: { dex: { pose: scan(0, "confused"), ...T3(1) } } },
  { at: "camera", id: "camera", act: { dex: { pose: scan(0.9, "amazed"), ...T3(1) } }, gag: { fx: "sparkle", on: "dex", size: 0.6, dy: -0.35 }, sfx: [{ name: "shutter", lu: -6, on_word: true }], event: [0, 4, 8, 12] },
  // ---- 12 the mystery, on his face
  { at: "why", id: "why", place: "home", key: HOME, shot: { size: "medium", on: "vexg", angle: -12, side: 0, move: "push", amount: 0.12 },
    act: { vexg: { hide: false, at: PORCH, pose: phoneUp("smug"), ...T3(1) }, dex: { hide: true } }, gag: { fx: "question", on: "vexg", size: 0.8 } },
  // ---- 13-14 the HOW (a change of picture): the scanner screen: photo, time, GPS pin; rings on door, mat, box
  { at: "you#2", id: "how", place: "depot", key: SHOP, music: "calm", caption: 0.84, shot: { size: "insert", on: "big", h: 0.82, angle: 0, move: "push", amount: 0.1 },
    act: { vexg: { hide: true } }, gag: { prop: "bigScanner", id: "big", origin: "center", at: [0.2, 2.5, 2.2], in: "none", until: "so2" } },
  { at: "photo", id: "photo1", event: [0, 6] },
  { at: "time#4", id: "time4", sfx: [{ name: "tick", lu: -10 }] },
  { at: "gps", id: "gps", sfx: [{ name: "pop", lu: -9 }] },
  { at: "receipt", id: "receipt", shot: { size: "insert", on: "big", h: 0.7, angle: 4, move: "push", amount: 0.08 } },
  { at: "door", id: "door", sfx: [{ name: "pop", lu: -12 }] },
  { at: "mat#2", id: "mat", sfx: [{ name: "pop", lu: -12 }] },
  { at: "box#2", id: "box2", sfx: [{ name: "pop", lu: -12 }] },
  // ---- 15 the reveal: the shop sends the photo back; his own mat, his own gnome
  { at: "so#2", id: "so2", place: "shop", key: SHOP, music: "build", caption: 0.704, shot: { size: "medium", on: "bigsby", angle: 14, side: 0.2, move: "push", amount: 0.14 },
    act: { bigsby: { at: BIGSBY, hide: false, pose: onPhone("smug"), ...T3(1) } } },
  { at: "photo#2", id: "sendPhoto", act: { bigsby: { pose: { limbs: { handR: [0.42, 1.3], handL: [0.85, 1.15] }, hands: { L: "open" }, hold: H("phone"), expr: "mischief" }, ...T3(1) } },
    gag: { prop: "photoCard", id: "card", origin: "center", at: [-0.42, 1.72, -0.15], in: "pop", until: "own" } },
  { at: "on#3", id: "own", place: "home", key: HOME, shot: { size: "full", on: [-2.5, 0, -6.6], h: 2.2, angle: -6, move: "push", amount: 0.05 }, focus: "mat",
    act: { vexg: { hide: false, at: [-3.05, 0, -6.35], pose: onPhone("horrified"), ...T3(1) } }, gag: { prop: "parcelOnMat", id: "matBox", at: [-2.6, 0.035, -6.72], in: "none" } },
  { at: "gnome", id: "gnomeW", focus: "gnome", kick: 0.04, act: { vexg: { pose: { limbs: { handR: [0.45, 1.45] }, hands: { R: "open" }, expr: "mortified" }, hold: null, ...T3(1) } }, gag: { fx: "sparkle", on: [-1.9, 0.55, -6.95], size: 0.45 }, sfx: [{ name: "impact", lu: -3, on_word: true }] },
  // ---- 16 payoff: the driver snaps the door, drives off; he is left with no free phone
  { at: "that's", id: "thats", place: "street", key: DUSK, music: "full", shot: { size: "full", on: [-2.85, 0.16, -4.8], h: 2.0, angle: 12, move: "push", amount: 0.12 },
    act: { dex: { hide: false, at: [-2.6, 0.16, -4.55], pose: scan(0, "focused"), ...T3(-1) }, bigsby: { hide: true } },
    gag: { prop: "parcelOnMat", id: "drop", at: [-3.25, 0.16, -5.1], in: "none" } },
  { at: "snaps", id: "snaps", act: { dex: { pose: scan(0.9, "focused"), ...T3(-1), lead: 1 } }, gag: { fx: "sparkle", on: "dex", size: 0.5, dy: -0.4 }, sfx: [{ name: "shutter", lu: -4, on_word: true }], event: [0, 4] },
  { at: "driving", id: "driving", act: { dex: { walk: [-0.4, 0.16, -4.2], speed: 2.6, pose: { limbs: { handR: [0.85, 1.35] }, hands: { R: "open" }, expr: "happy" }, hold: null, ...T3(1) } }, sfx: [{ name: "car", lu: -12, df: 10 }] },
  { at: "one#4", id: "onePhoto", place: "home", key: DUSK, shot: { size: "close", on: "vexg", angle: 10, side: 0.1, move: "push", amount: 0.12 },
    act: { vexg: { at: PORCH, pose: { limbs: { handR: [0.35, 0.3] }, expr: "sulky" }, hold: null, ...T3(1) }, dex: { hide: true } } },
  { at: "free#2", id: "end", act: { vexg: { pose: { limbs: { handR: [0.55, 0.85], handL: [0.55, 0.85] }, hands: { R: "open", L: "open" }, expr: "sulky" }, ...T3(1) } } },
];

const board: Board = {
  id: "doorphoto", title: "Why Delivery Drivers Started Photographing Your Door", words: WORDS, brand: BRANDS.ours, voOffset: 0, tail: 0.4,
  cast: {
    vex: castEntry("vex"),
    vexg: castEntry("vex", { neck: { style: "headphonesNeck", color: "#f5c21b" } }),
    dex: castEntry("courier"),
    bigsby: castEntry("bigsby"),
    hank: castEntry("neighbor"),
    ex1: { spec: extra(7), height: 1.66 }, ex2: { spec: extra(12), height: 1.72 },
  },
  places: {
    home: { set: "yard", opts: { era: "modern" } },
    shop: { set: "office", opts: { era: "modern" } },
    street: { set: "street", opts: { era: "modern" }, walkers: 2,
      vehicles: { van: { kind: "car", opts: { body: "van", color: "#f1e7d2", trim: "#e8862e" }, path: [[5.5, 0, -1.8], [46, 0, -1.8]] } } },
    depot: { set: "hall", opts: { era: "modern", title: "DEPOT" } },
  },
  props: { doormat, gnome, oldBoxes, tvBox, blenderBox, parcelOnMat, streetBoxes, refundPile, recordBoard, monitor, flyBox, scannerRack, bigScanner, photoCard },
  beats,
};
export const doorphotoShort = boardProject(board);
export const doorphotoBoard = board;
