/**
 * PROOF SHORT 2 (storyboard as data) -- "Why You Can't Shave a Coin" (9:16, ~56 s, ElevenLabs VO).
 *
 * BOARD v2 (1.8). The first board (1.7) was reviewed by three independent reviewers (camera 4, edit 3, depth 3,
 * characters 4, story 4.5, typography 5.5, colour 5, light 5, ink 4, texture 4). Their verdict in one line: "the
 * person is shown, not the act". So this version follows their 13-shot list:
 *   - 13 shots instead of 34 setups (average 4.3 s); beats change the acting, the prop and the focus INSIDE a shot;
 *   - tools are in the hands (shears in the right, the coin in the left: `hold` / `hold2`); nothing floats beside an
 *     empty hand; the blades close on the word;
 *   - the camera travels slowly (20-40 frames) or creeps, never whips; a rack focus points at the new subject;
 *   - the climax is one shot held for 44 frames; the taxi detour is gone and the video ends on the quarter's edge;
 *   - one text on screen at a time, and never a number the narrator is saying twice.
 * Story: story/examples/coins.txt (formula B, lint 98/100). Facts: public/coins/claims.md. The fact that matters most:
 * Newton did NOT invent the marked edge (machine-struck coins with marked edges date from 1662; he became Warden in
 * 1696 and hunted the coiners), and the script says exactly that.
 */
import * as THREE from "three";
import { Beat, Board, BoardApi, boardProject } from "../../lib/board";
import { BobbleSpec, KPose, StickHold } from "../../lib/characters/kinds";
import { LIGHT_KEYS, LightKey, tweak } from "../../lib/three/lightplan";
import { canvasTexture } from "../../lib/three/textures";
import { PROPS } from "../../lib/three/sets";
import { clamp, ease, rng, springAt } from "../../lib/time";
import WORDS from "./words.json";

// ------------------------------------------------------------------------------------------------ cast (1690s wardrobe)
// reviewer (colour): a brown man on a brown wall has no value separation -> the hero wears blue, the walls go darker
const clipper: BobbleSpec = { id: "clipper", kind: "bobble", skin: "#f6d3b4", hat: { style: "beanie", color: "#3b4a6a", accent: "#2a3550" }, hair: { style: "long", color: "#4a3020" }, stache: "#4a3020",
  top: { color: "#2f5a7a", style: "vest", accent: "#f1e7d2", sleeves: "long" }, neck: { style: "scarf", color: "#d8483a" }, legs: "#3a3f4c", shoes: "#2b2230", build: "slim" };
const keeper: BobbleSpec = { id: "keeper", kind: "bobble", skin: "#fbe3d0", hair: { style: "bun", color: "#8a5a34" }, top: { color: "#4f8a6a", style: "apron", accent: "#f4efe6" }, legs: "#5a4a3a", shoes: "#3a2a1e", cheeks: true };
const smith: BobbleSpec = { id: "smith", kind: "bobble", skin: "#e9b58c", hair: { style: "buzz", color: "#2a2228" }, beard: "#2a2228", top: { color: "#7a4a2a", style: "apron", accent: "#e9dcc6" }, legs: "#4a4f5c", shoes: "#3a2a1e", build: "stout" };
const baker: BobbleSpec = { id: "baker", kind: "bobble", skin: "#f6cfae", hat: { style: "chef", color: "#fbfaf6" }, stache: "#6a3d22", top: { color: "#e9dcc6", style: "apron", accent: "#c0392b" }, legs: "#6b5a44", shoes: "#3a2a1e", build: "stout" };
const barber: BobbleSpec = { id: "barber", kind: "bobble", skin: "#e9b58c", hair: { style: "side", color: "#1f1a22" }, stache: "#1f1a22", top: { color: "#3d8a6a", style: "vest", accent: "#f4efe6", sleeves: "long" }, neck: { style: "bow", color: "#c0392b" }, legs: "#3a3f5c", shoes: "#16131a" };
const officer: BobbleSpec = { id: "officer", kind: "bobble", skin: "#f3c9a4", hat: { style: "ranger", color: "#2b2f3a", accent: "#d8b04a" }, hair: { style: "curly", color: "#d9d4cc" }, glasses: "#2b2230",
  top: { color: "#7a2f3a", style: "coat", accent: "#d8b04a" }, neck: { style: "tie", color: "#f4efe6" }, legs: "#3a2f36", shoes: "#16131a", build: "stout" };
const newton: BobbleSpec = { id: "newton", kind: "bobble", skin: "#fbe3d0", hair: { style: "long", color: "#e6e1d8" }, top: { color: "#26355e", style: "coat", accent: "#d8b04a" }, neck: { style: "tie", color: "#f4efe6" }, legs: "#1f2b4d", shoes: "#16131a", build: "slim" };
const girl: BobbleSpec = { id: "girl", kind: "bobble", skin: "#c98e66", hair: { style: "pony", color: "#2a2228" }, top: { color: "#f39a2b", style: "hoodie" }, legs: "#3a3f5c", shoes: "#f4f6fa", cheeks: true };

// ------------------------------------------------------------------------------------------------ custom 3D props (only what is NOT held in a hand)
const lam = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(o);
const SILVER = "#d9dde6", EDGE = "#9aa2b4";
const faceTex = (key: string, txt?: string) => canvasTexture(`coinface2|${key}|${txt}`, 256, 256, (g) => {
  g.clearRect(0, 0, 256, 256); g.strokeStyle = "#8d96aa"; g.lineWidth = 7; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.stroke();
  g.fillStyle = "#b4bccb";
  if (txt) { g.font = "900 110px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, 128, 136); }
  else { // a crowned profile (the first version read as a "user icon")
    g.beginPath(); g.arc(128, 122, 42, 0, 7); g.fill(); g.beginPath(); g.moveTo(166, 112); g.lineTo(190, 128); g.lineTo(164, 136); g.fill(); g.beginPath(); g.ellipse(124, 216, 68, 42, 0, Math.PI, 0); g.fill();
    g.beginPath(); g.moveTo(92, 90); g.lineTo(98, 54); g.lineTo(114, 78); g.lineTo(128, 48); g.lineTo(142, 78); g.lineTo(158, 54); g.lineTo(164, 90); g.closePath(); g.fill(); }
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; g.beginPath(); g.arc(128 + Math.cos(a) * 98, 128 + Math.sin(a) * 98, 3.2, 0, 7); g.fill(); }
});
/** A coin facing +z. `teeth` = a marked (reeded) edge, `rough` = a hand-hammered outline, `cut` = a shaved flat at that angle. */
/** `lit` = self-light 0..1: a coin that TURNS in the shot needs about 0.6, or its face steps from lit to shade in one frame (QA read that as a cut). */
function coin(r: number, o: { teeth?: number; rough?: string; cut?: number; text?: string; color?: string; t?: number; lit?: number; tooth?: number } = {}) {
  const N = o.teeth ? o.teeth * 2 : 72, rr = o.rough ? rng(o.rough) : null, ph = rr ? [rr() * 7, rr() * 7, rr() * 7] : [0, 0, 0], sh = new THREE.Shape(), t = o.t ?? r * 0.16;
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; let k = 1;
    if (o.teeth) k = i % 2 ? 1 : o.tooth ?? 0.945;
    if (rr) k = 0.93 + 0.05 * Math.sin(a * 3 + ph[0]) + 0.04 * Math.sin(a * 5 + ph[1]) + 0.025 * Math.sin(a * 9 + ph[2]);
    let x = Math.cos(a) * r * k, y = Math.sin(a) * r * k;
    if (o.cut !== undefined) { const nx = Math.cos(o.cut), ny = Math.sin(o.cut), d = x * nx + y * ny - r * 0.78; if (d > 0) { x -= nx * d; y -= ny * d; } }
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y); }
  const geo = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false }); geo.translate(0, 0, -t / 2);
  const dim = (o.lit ?? 0.3) > 0.3 ? 0.7 : 1; // more self-light, less reflected light: the same white when lit, a smaller step into shade
  const glow = (c: string, k: number) => ({ color: new THREE.Color(c).multiplyScalar(dim), emissive: new THREE.Color(c), emissiveIntensity: k }); // silver must read in shade: a little self-light
  const g = new THREE.Group(), body = new THREE.Mesh(geo, [lam(glow(o.color ?? SILVER, o.lit ?? 0.3)), lam(glow(EDGE, (o.lit ?? 0.3) * 0.75))]); body.castShadow = true; g.add(body);
  for (const s of [1, -1]) { const f = new THREE.Mesh(new THREE.CircleGeometry(r * (rr ? 0.74 : 0.84), 40), new THREE.MeshLambertMaterial({ map: faceTex(o.text ? "t" : "h", o.text), transparent: true, emissive: new THREE.Color("#8d96aa"), emissiveIntensity: (o.lit ?? 0.3) * 0.85 })); f.position.z = s * (t / 2 + 0.002); if (s < 0) f.rotation.y = Math.PI; g.add(f); }
  return g;
}
const anvilCoin = () => { const c = coin(0.2, { rough: "ham" }); c.rotation.x = -Math.PI / 2; c.position.y = 0.03; const g = new THREE.Group(); g.add(c); return g; };
const oddCoins = (api: BoardApi) => { const row = api.aspect > 1, g = new THREE.Group(), cs = ["a", "b", "c"].map((k, i) => { const c = coin(0.3, { rough: "odd" + k }); if (row) c.position.set((i - 1) * 0.72, i === 1 ? 0.08 : -0.05, 0); else c.position.set(i === 1 ? 0.12 : -0.08, (1 - i) * 0.7, 0); g.add(c); return c; }); // 9:16: stack them
  return { group: g, update(f: number, fps: number) { cs.forEach((c, i) => { c.rotation.y = 0.35 * Math.sin((f / fps) * 1.6 + i * 2); c.rotation.z = 0.2 * Math.sin((f / fps) * 0.9 + i); }); } }; };
/** A tin cup on the bench: the heap of clippings grows with every snip and stroke of the file. */
const cup = (api: BoardApi) => { const g = new THREE.Group(); const tin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.26, 16, 1, true), lam({ color: "#8d96a6", side: THREE.DoubleSide })); tin.position.y = 0.13; tin.castShadow = true; g.add(tin);
  const heap = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8, 0, 7, 0, 1.6), lam({ color: "#f4f6fa", emissive: new THREE.Color("#f4f6fa"), emissiveIntensity: 0.25 })); heap.position.y = 0.2; g.add(heap);
  return { group: g, update(f: number) { const T = api.T, k = clamp((f - T.snip) / Math.max(1, T.friday - T.snip)); heap.scale.set(1, 0.1 + 0.95 * k, 1); heap.position.y = 0.14 + 0.08 * k; } }; };
/** The balance: the sack lands on its pan on "sack" and that side flies UP on "half" (it is too light). */
const weigh = (api: BoardApi) => { const g = new THREE.Group(), br = lam({ color: "#c9a23a" });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.8, 10), br); post.position.y = 0.4; const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 16), br); base.position.y = 0.03; g.add(post, base);
  const beam = new THREE.Group(); beam.position.y = 0.8; g.add(beam); beam.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.04), br));
  const pans = [-1, 1].map((sx) => { const p = new THREE.Group(); p.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.04, 18), br)); for (const dz of [-0.14, 0.14]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.42, 4), br); st.position.set(0, 0.21, dz); p.add(st); } g.add(p); return { p, sx }; });
  const sack = PROPS.moneyBag({ text: "£" }); sack.scale.setScalar(0.72); pans[0].p.add(sack); sack.position.y = 0.02;
  for (let i = 0; i < 3; i++) { const wt = new THREE.Mesh(new THREE.CylinderGeometry(0.08 - i * 0.015, 0.09 - i * 0.015, 0.09, 12), lam({ color: "#3b3f4c" })); wt.position.set((i - 1) * 0.12, 0.065, i === 1 ? 0.06 : -0.04); pans[1].p.add(wt); }
  return { group: g, update(f: number, fps: number) { const T = api.T; sack.visible = f >= T.sack;
    const land = f >= T.sack ? 0.26 * Math.exp(-(f - T.sack) / 5) * Math.cos((f - T.sack) * 0.9) : 0.26; // the empty pan sits high, the sack lands, the beam settles level
    const k = f >= T.half ? springAt((f - T.half) / fps, 2.2, 0.35) : 0, a = land * (1 - k) + 0.3 * k + 0.012 * Math.sin((f / fps) * 2.4); // ... and on "half" the sack side flies up
    beam.rotation.z = -a; for (const { p, sx } of pans) p.position.set(sx * 0.6 * Math.cos(a), 0.8 - sx * 0.6 * Math.sin(a) - 0.44, 0); } }; };
/** A rope with a loop that drops into frame on "death" (the picture says what the narration says; no word on screen). */
const noose = (api: BoardApi) => { const g = new THREE.Group(), r = new THREE.Group(), rope = lam({ color: "#e0c080", emissive: new THREE.Color("#e0c080"), emissiveIntensity: 0.25 }); g.add(r);
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4, 6), rope); line.position.y = 2.16; r.add(line);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.024, 8, 20), rope); loop.scale.y = 1.3; r.add(loop); const knot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8), rope); knot.position.y = 0.26; r.add(knot);
  return { group: g, update(f: number, fps: number) { const t = (f - api.T.death) / fps, d = t < 0 ? 3.2 : 3.2 * Math.max(0, 1 - t / 0.2) ** 2; r.visible = t > -0.02;
    r.position.y = d + (t > 0.2 ? 0.07 * Math.exp(-(t - 0.2) * 6) * Math.sin((t - 0.2) * 22) : 0); r.rotation.z = t > 0.2 ? 0.14 * Math.exp(-(t - 0.2) * 1.6) * Math.sin((t - 0.2) * 5) : 0; } }; };
const crucible = () => { const g = new THREE.Group(), iron = lam({ color: "#3b3f4c" });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.42, 0.8, 20, 1, true), lam({ color: "#3b3f4c", side: THREE.DoubleSide })); pot.position.y = 0.72; pot.castShadow = true; g.add(pot);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.58, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.5, 0.4) })); glow.rotation.x = -Math.PI / 2; glow.position.y = 1.02; g.add(glow);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.32, 16), lam({ color: "#7a4a3a" })); foot.position.y = 0.16; g.add(foot);
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), iron); l.position.set(sx * 0.72, 0.5, 0); g.add(l); }
  const coins = Array.from({ length: 16 }, (_, i) => { const c = coin(0.11, { rough: "melt" + (i % 4) }); g.add(c); return c; }), r = rng("melt"), off = coins.map(() => [r() - 0.5, r(), r() * 6]);
  return { group: g, update(f: number, fps: number) { const t = f / fps; coins.forEach((c, i) => { const ph = (t * 0.95 + off[i][1]) % 1; c.position.set(off[i][0] * 0.7, 3.4 - ph * 2.5, 0.1 * Math.sin(i)); c.rotation.set(t * 5 + off[i][2], t * 3 + i, 0); c.visible = c.position.y > 1.05; });
    (glow.material as THREE.MeshBasicMaterial).color.setRGB(3.2 + 0.5 * Math.sin(t * 7), 1.5 + 0.2 * Math.sin(t * 9), 0.4); } }; };
/** The screw press: the weighted arm swings, the screw comes down, a new coin drops on the stack. */
const press = () => { const g = new THREE.Group(), iron = lam({ color: "#39404e" }), brass = lam({ color: "#c9a23a" }), wood = lam({ color: "#7a5234" });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.0), wood); bed.position.y = 0.25; g.add(bed);
  for (const sx of [-1, 1]) { const u = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 0.3), iron); u.position.set(sx * 0.55, 1.35, 0); g.add(u); }
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.36), iron); top.position.y = 2.2; g.add(top);
  const screw = new THREE.Group(); g.add(screw); const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 12), brass); sc.position.y = 0.3; screw.add(sc);
  const die = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 16), iron); die.position.y = -0.4; screw.add(die);
  const arm = new THREE.Group(); arm.position.y = 0.98; screw.add(arm); arm.add(new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.07, 0.07), iron));
  for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), iron); b.position.x = sx * 1.15; arm.add(b); }
  const anvil = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.16, 16), iron); anvil.position.y = 0.58; g.add(anvil);
  const stack = Array.from({ length: 9 }, (_, i) => { const c = coin(0.14, { teeth: 30 }); c.rotation.x = -Math.PI / 2; c.position.set(0.52, 0.53 + i * 0.03, 0.34); g.add(c); return c; });
  const fresh = coin(0.14, { teeth: 30 }); fresh.rotation.x = -Math.PI / 2; g.add(fresh);
  g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  return { group: g, update(f: number, fps: number) { const t = (f / fps) * 1.1, n = Math.floor(t), ph = t - n, down = ph < 0.3 ? ease.inCubic(ph / 0.3) : 1 - ease.outCubic(clamp((ph - 0.3) / 0.5));
    screw.position.y = 1.55 - 0.42 * down; arm.rotation.y = down * 2.6 + n * 0.4; stack.forEach((c, i) => { c.visible = i < n % 10; });
    const out = clamp((ph - 0.34) / 0.3); fresh.visible = ph > 0.3; fresh.position.set(0.52 * ease.outCubic(out), 0.68 + 0.25 * Math.sin(out * Math.PI) - 0.15 * out + 0.03 * (n % 10), 0.34 * out); } }; };
/** The proof, in one prop: a perfect milled coin turns to show its edge ("marked"), shears bite it ("shave"), a sliver flies and a red arc marks the flat ("cut"). */
const proofCoin = (api: BoardApi) => { const g = new THREE.Group(), r = new THREE.Group(), whole = coin(0.26, { teeth: 56, tooth: 0.972, t: 0.07, lit: 0.62 }), cutC = coin(0.26, { teeth: 56, tooth: 0.972, cut: 0.6, t: 0.07, lit: 0.62 }); g.add(r); r.add(whole, cutC);
  const steel = lam({ color: "#c3cbd8", emissive: new THREE.Color("#c3cbd8"), emissiveIntensity: 0.2 }), sh = new THREE.Group(); sh.rotation.z = 0.6 + Math.PI; g.add(sh);
  const blades = [1, -1].map((s) => { const b = new THREE.Group(); const bl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.014), steel); bl.position.x = 0.2; b.add(bl); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 14), lam({ color: "#3b3f4c" })); ring.position.set(-0.1, s * 0.05, 0); b.add(ring); sh.add(b); return { b, s }; });
  const sliver = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.03), lam({ color: "#ffffff", emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.4 })); g.add(sliver);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.016, 6, 24, 1.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.5, 0.4) })); arc.rotation.z = 0.6 - 0.65; arc.position.z = 0.05; r.add(arc);
  return { group: g, update(f: number, fps: number) { const T = api.T, t = f / fps, tb = (f - T.shave) / fps;
    const show = clamp((f - T.marked + 4) / 16) * (1 - clamp((f - T.shave + 16) / 14)); r.rotation.y = 1.05 * ease.smooth(show) + 0.12 * Math.sin(t * 1.3); // edge-on for "a marked edge", face-on for the bite
    const bitten = tb > 0.34; whole.visible = !bitten; cutC.visible = bitten;
    sh.visible = tb > -0.25 && tb < 1.0; const inn = ease.outCubic(clamp((tb + 0.25) / 0.3)), open = tb < 0.3 ? 0.5 : 0.5 * (1 - clamp((tb - 0.3) / 0.05)); sh.position.set(0.9 - 0.42 * inn, 0.62 - 0.28 * inn, 0.06);
    for (const { b, s } of blades) b.rotation.z = s * open * 0.5;
    sliver.visible = tb > 0.34 && tb < 1.1; if (sliver.visible) { const u = tb - 0.34; sliver.position.set(0.26 + u * 0.7, 0.2 + u * 0.9 - 2.4 * u * u, 0.06); sliver.rotation.z = u * 9; }
    arc.visible = f >= T.cut; arc.scale.setScalar(1 + 0.06 * Math.sin(t * 12));; } }; };
/** The quarter turns edge-on on "119 ridges": the picture shows what is counted (no counter: the caption already says the number). */
/** A white chip that flies off on a snip (`key` = the beat it leaves on). */
const chip = (key: string, dir: 1 | -1 = 1) => (api: BoardApi) => { const g = new THREE.Group(), c = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.016, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.7) })); g.add(c);
  return { group: g, update(f: number, fps: number) { const u = (f - api.T[key]) / fps; c.visible = u >= 0 && u < 0.6; if (c.visible) { c.position.set(dir * (0.03 + u * 0.55), 0.02 + u * 0.55 - 2.2 * u * u, 0.02); c.rotation.z = u * 14; } } }; };
const quarter = (api: BoardApi) => { const g = new THREE.Group(), c = coin(0.26, { teeth: 72, tooth: 0.972, text: "25", t: 0.06, lit: 0.62 }); g.add(c);
  return { group: g, update(f: number, fps: number) { const k = ease.smooth(clamp((f - api.T.n119 + 4) / 18)); c.rotation.y = (1 - k) * 0.5 * Math.sin((f / fps) * 1.4) + k * (1.2 + 0.1 * Math.sin((f / fps) * 1.1)); } }; };

// ------------------------------------------------------------------------------------------------ lighting keys (tuned per key with `vfa keygap`)
/** warm room light with a HIGH sun: a low golden sun throws the forge chimney's shadow across the whole back wall */
const WARM: LightKey = tweak({ ...LIGHT_KEYS.golden, lights: "day", sunGlow: 0, cookie: 0 }, { grade: { highlightTint: [-0.012, 0.0, 0.02], shadowTint: [0.03, 0.01, 0.02] } }); // measured warmth 0.15-0.17 against 0.05: keep the room warm, cool the highlights
const OFFICE: LightKey = tweak("office", { exposure: 1.08, grade: { saturation: 1.5, vibrance: 0.25, highlightTint: [0.03, 0.012, -0.035] } });
const FORGE: LightKey = tweak("interiorWarm", { grade: { highlightTint: [0.0, 0.0, 0.01] } });
// reviewer (colour): the night read electric blue (ground #131979) -> less saturation, a calmer shadow tint
const NIGHT: LightKey = tweak("night", { exposure: 1.28, grade: { gamma: 1.26, saturation: 1.12, shadowTint: [0.0, 0.0, 0.05] } });
const ALLEY: LightKey = tweak("nightPractical", { exposure: 1.55, grade: { gamma: 1.34, saturation: 0.95, shadowTint: [0.0, 0.0, 0.0] } }); // second review: still a blue filter at 1.1 / 0.05

// ------------------------------------------------------------------------------------------------ acting vocabulary
const SH = (open: number): StickHold => ({ item: "shears", hand: "R", open, len: 0.7, aim: 180 });
const CN = (more: Partial<StickHold> = {}): StickHold => ({ item: "coin", hand: "L", len: 0.15, ...more });
/** shears in the right hand, the coin in the left, blades open / shut */
const clip = (open: number, more: KPose = {}): KPose => ({ limbs: { handR: [0.6, 0.66], handL: [0.07, 0.56] }, hold: SH(open), hold2: CN(open < 0.5 ? { cut: true } : {}), expr: "scheming", ...more });
/** the same act, not the same pose: the baker works low and close, the barber high with a flourish */
const LOW = { limbs: { handR: [0.52, 0.5] as [number, number], handL: [0.05, 0.4] as [number, number] } }, HIGH = { limbs: { handR: [0.64, 0.9] as [number, number], handL: [0.1, 0.8] as [number, number] } };
const hand = (x: number, y: number, more: KPose = {}): KPose => ({ limbs: { handR: [x, y] }, hands: { R: "open" }, ...more });
const HAM = (up: boolean): KPose => ({ limbs: { handR: up ? [0.5, 1.75] : [0.8, 0.78] }, hold: { item: "hammer", hand: "R", len: up ? 1.0 : 0.8, angle: up ? 20 : 78 }, lean: up ? -4 : 9, expr: "determined" }); // the head must land on the anvil IN view
const FILE = (x: number): KPose => ({ limbs: { handR: [x, 0.7], handL: [0.07, 0.56] }, hold: { item: "file", hand: "R", len: 0.7, aim: 172 }, hold2: CN({ cut: true }), expr: "determined" });
const DEN: [number, number, number] = [-1.9, 0, -1.9];
const T3 = (facing: 1 | -1) => ({ view: "three" as const, facing });

// ------------------------------------------------------------------------------------------------ the storyboard: 13 shots
const beats: Beat[] = [
  // ---- A (0-118). The hook IS the act: hands, shears, coin. Then a slow pull to the man.
  { at: 0, id: "hook", place: "den", key: WARM, music: "build",
    shot: { size: "insert", on: [-1.9, 0.9, -1.9], h: 0.26, angle: -6, move: "push", amount: 0.14 },
    act: { clipper: { at: DEN, pose: clip(0.85) } } },
  { at: "shaves", id: "shaves", off: -0.1, act: { clipper: { pose: clip(0.02), lead: 1 } }, gag: [{ prop: "chipA", id: "chipA", at: [-1.84, 1.04, -1.8], in: "none", until: "sliver" }, { fx: "sparkle", on: [-1.86, 1.04, -1.8], size: 0.22, dy: 0 }], sfx: [{ name: "snip", lu: -6, on_word: true }], kick: 0.02 },
  { at: "sliver", id: "sliver", shot: { size: "medium", on: "clipper", angle: 10, side: 0.15, move: "push", amount: 0.18 }, act: { clipper: { pose: clip(0.85, { limbs: { handR: [0.6, 0.66], handL: [0.38, 1.28] }, hold2: CN({ len: 0.24, cut: true }), expr: "smug" }) } } },
  { at: "coin", id: "grin", act: { clipper: { pose: clip(0.85, { hold2: CN({ cut: true }) }) } }, punch: true },
  { at: "touches", id: "touches", act: { clipper: { pose: clip(0.02, { expr: "smug" }), lead: 1 } }, gag: { fx: "sparkle", on: "clipper", size: 0.4, dy: -0.75 }, sfx: [{ name: "snip", lu: -7 }] },
  // ---- B (118-163). He spends it: the coin goes over the counter, she bites it and smiles.
  { at: "spends", id: "spends", place: "shop", key: "day", via: "cut", shot: { size: "full", on: [0.75, 0, -1.3], h: 1.9, angle: -10, move: "track", amount: 0.3 },
    act: { clipper: { at: [0.4, 0, -0.5], pose: { limbs: { handR: [0.9, 0.5] }, hold: CN({ hand: "R", cut: true }), expr: "smug" }, hold2: null, ...T3(1) }, // (hand low: at 0.8 his arm crossed her face)
      keeper: { at: "keeper", pose: hand(0.75, 0.9, { expr: "happy" }), ...T3(-1) } }, sfx: ["coin"] },
  { at: "anyway", id: "anyway", focus: "keeper", act: { clipper: { pose: "hips", expr: "smug", hold: null, ...T3(1) }, keeper: { pose: { limbs: { handR: [0.3, 1.3] }, hold: CN({ hand: "R", cut: true, len: 0.18 }), expr: "happy" }, ...T3(-1) } },
    gag: { fx: "sparkle", on: "keeper", size: 0.5 } },
  // ---- C (163-291). The rule: hammered by hand. One travelling shot: the smith, the anvil, the three odd coins.
  { at: "1600s", id: "y1600", place: "mintOld", key: FORGE, shot: { size: "full", on: [0.85, 0, -0.7], h: 1.9, angle: 14, move: "push", amount: 0.16 },
    act: { smith: { at: [0.45, 0, -0.5], pose: HAM(true), ...T3(1) } }, gag: [{ stamp: "HAMMERED COINAGE", until: "hammered" }, { prop: "anvilCoin", id: "anvilCoin", at: "anvilTop", in: "none", until: "snip" }] },
  { at: 6.3, id: "bang1", act: { smith: { pose: HAM(false), ...T3(1), lead: 1 } }, sfx: [{ name: "hammer", lu: -8 }], kick: 0.02 },
  { at: 6.58, id: "up1", act: { smith: { pose: HAM(true), ...T3(1) } } },
  { at: "hammered", id: "hammered", act: { smith: { pose: HAM(false), ...T3(1), lead: 1 } }, sfx: [{ name: "hammer", lu: -5, on_word: true }], kick: 0.035 },
  { at: 7.3, id: "up2", act: { smith: { pose: HAM(true), ...T3(1) } } },
  { at: "hand", id: "bang3", act: { smith: { pose: HAM(false), ...T3(1), lead: 1 } }, sfx: [{ name: "hammer", lu: -8 }], kick: 0.02 },
  { at: "no", id: "no", shot: { size: "insert", on: "odd", h: 1.45, fill: 0.9, angle: -6, move: "orbit", amount: 12 }, act: { smith: { pose: "hips", expr: "smug", hold: null } },
    caption: 0.86, gag: { prop: "oddCoins", id: "odd", origin: "center", at: [-0.25, 1.75, 0.3] } },
  // ---- D (291-429). The reward: snip, file, the cup fills, a bar on Friday. One shot, then a pull back for the cheer.
  { at: "snip", id: "snip", place: "den", key: WARM, via: "cut", caption: 0.7, shot: { size: "medium", on: "clipper", angle: 16, side: 0.3, move: "push", amount: 0.16 },
    act: { clipper: { at: DEN, pose: clip(0.02), lead: 1 } }, gag: [{ prop: "cup", id: "cup", at: [-2.38, 0.97, -2.4], scale: 0.85, in: "none", until: "baker" }, { fx: "sparkle", on: "clipper", size: 0.4, dy: -0.75 }], sfx: [{ name: "snip", lu: -7, on_word: true }] },
  { at: 9.92, id: "open2", act: { clipper: { pose: clip(0.85) } } },
  { at: "file", id: "file", act: { clipper: { pose: FILE(0.42) } }, sfx: [{ name: "rasp", lu: -8 }] },
  { at: 10.42, id: "file2", act: { clipper: { pose: FILE(0.66) } } },
  { at: "pile", id: "pile", focus: "cup", act: { clipper: { pose: { limbs: { handR: [0.6, 0.4], handL: [0.85, 0.8] }, hands: { L: "point" }, hold: { item: "file", hand: "R", len: 0.7, aim: -70 }, expr: "smug" }, hold2: null, turn: -0.7 } }, sfx: ["coins"] },
  { at: "friday", id: "friday", shot: { size: "full", on: "clipper", angle: 8, move: "crane", amount: 0.5 }, act: { clipper: { pose: { limbs: { handR: [0.55, 1.9], handL: [0.6, 1.5] }, hands: { L: "open" }, hold: { item: "bar", hand: "R", len: 1.7 }, expr: "laugh", bob: -0.05 }, hold2: null, turn: 0 } },
    gag: { fx: "sparkle", on: "clipper", size: 0.8, dy: 0.1 }, sfx: ["ding"] },
  { at: "lump", id: "lump", act: { clipper: { pose: { limbs: { handR: [0.55, 0.45], handL: [0.4, 0.3] }, hands: { L: "open" }, hold: { item: "bar", hand: "R", len: 1.7 }, expr: "smug" } } } },
  // ---- E (429-548). Escalation: the baker, the barber, everybody. One travelling shot along the street.
  { at: "then#2", id: "baker", place: "street", key: "day", music: "full", shot: { size: "medium", on: "baker", angle: 12, move: "push", amount: 0.16 },
    act: { baker: { at: [-0.95, 0, 0.5], pose: clip(0.85, LOW), ...T3(1) }, barber: { at: [0.98, 0, 0.7], pose: clip(0.85, HIGH), ...T3(-1) }, clipper: { hide: true, hold: null, hold2: null } } },
  { at: "clips", id: "clips1", act: { baker: { pose: clip(0.02, { ...LOW, expr: "smug" }), ...T3(1), lead: 1 } }, gag: { fx: "sparkle", on: "baker", size: 0.4, dy: -0.85 }, sfx: [{ name: "snip", lu: -8 }] },
  { at: "barber", id: "barber", shot: { size: "medium", on: "barber", angle: -10, move: "push", amount: 0.16 } },
  { at: "clips#2", id: "clips2", act: { barber: { pose: clip(0.02, { ...HIGH, expr: "smug" }), ...T3(-1), lead: 1 } }, gag: { fx: "sparkle", on: "barber", size: 0.4, dy: -0.55 }, sfx: [{ name: "snip", lu: -8 }] },
  { at: "everybody", id: "everybody", shot: { size: "full", on: [0.03, -0.45, 1.2], h: 2.7, angle: 5, move: "crane", amount: 0.7 }, crowd: "snip",
    act: { clipper: { hide: false, at: [0.05, 0, 1.6], pose: clip(0.85, { expr: "laugh" }) }, baker: { pose: clip(0.85, LOW), ...T3(1) }, barber: { pose: clip(0.85, HIGH), ...T3(-1) } },
    sfx: [{ name: "snip", lu: -9, df: 3 }, { name: "snip", lu: -10, df: 9 }, { name: "crowd_laugh", lu: -15, df: 6 }] },
  { at: "clips#3", id: "clips3", act: { clipper: { pose: clip(0.02, { expr: "laugh" }), lead: 1 }, baker: { pose: clip(0.02, LOW), ...T3(1) }, barber: { pose: clip(0.02, HIGH), ...T3(-1) } }, sfx: [{ name: "snip", lu: -8 }] },
  // ---- F (548-656). How bad: he puts the sack on the balance; on "half" its pan flies up. The hero watches, in the foreground.
  { at: "1695", id: "y1695", place: "exchequer", key: OFFICE, music: "thin", shot: { size: "full", on: [0.95, 0, -1.5], h: 2.0, angle: -12, height: 2.0, move: "push", amount: 0.08 },
    act: { officer: { at: "desk", pose: { limbs: { handR: [0.7, 0.95], handL: [0.4, 0.5] }, hold: { item: "sack", hand: "R" }, expr: "think" }, ...T3(1) }, clipper: { hide: false, at: [-1.3, 0, -0.5], pose: "idle", expr: "nervous", hold: null, hold2: null, ...T3(1) } },
    gag: { prop: "weigh", id: "weigh", at: [1.15, 0.85, -1.2], scale: 0.85, in: "none" } },
  { at: "sack", id: "sack", act: { officer: { pose: { limbs: { handR: [1.0, 0.8] }, hands: { R: "open" }, expr: "think" }, hold: null, ...T3(1) } }, sfx: [{ name: "coins", lu: -10 }] },
  { at: "half", id: "half", focus: "weigh", kick: 0.035, act: { officer: { pose: "shock", ...T3(1) }, clipper: { pose: { limbs: { handR: [0.2, 1.05] }, expr: "nervous" }, ...T3(1) } },
    gag: { counter: { from: 100, to: 52, suffix: " %" }, y: 0.07 } },
  // ---- G (656-817). Authority pushes back: the two spoken lines in ONE deep two-shot, then the camera goes to the man the sentence is for.
  { at: "this#2", id: "tooSmall", off: -0.1, shot: { size: "full", on: [0.12, 0, -1.3], h: 2.15, angle: -8, height: 1.9, move: "push", amount: 0.14 }, focus: "officer",
    act: { officer: { pose: { limbs: { handR: [0.5, 1.4] }, hold: CN({ hand: "R", len: 0.17, cut: true }), expr: "angry" }, ...T3(-1), talk: true }, clipper: { walk: [-0.3, 0, -0.7], speed: 2.4, pose: "idle", expr: "nervous", ...T3(1) } } },
  { at: "it#2", id: "shrank", off: -0.1, focus: "clipper", act: { clipper: { pose: "shrug", expr: "embarrassed", ...T3(1), talk: true }, officer: { pose: { limbs: { handR: [0.5, 1.4] }, hold: CN({ hand: "R", len: 0.17, cut: true }), expr: "deadpan" }, ...T3(-1) } },
    gag: { fx: "sweat", on: "clipper", size: 0.6 } },
  { at: "the>79", id: "punish", shot: { size: "medium", on: "clipper", angle: -8, side: -0.25, move: "push", amount: 0.14 }, act: { officer: { pose: { limbs: { handR: [1.05, 1.15] }, hands: { R: "point" }, expr: "angry" }, hold: null, ...T3(-1) }, clipper: { pose: "idle", expr: "nervous", ...T3(1) } } },
  { at: "death", id: "death", kick: 0.045, focus: "noose", act: { clipper: { pose: "shock", ...T3(1) } }, gag: { prop: "noose", id: "noose", origin: "center", at: [0.04, 1.6, -0.6], scale: 1.2, in: "none", until: "people" }, sfx: [{ name: "impact", lu: -7, on_word: true }], music: "stop" },
  // ---- H (817-921). People clip anyway, under the warning. The camera climbs to the question.
  { at: "people", id: "people", place: "street", key: "golden", via: "cut", music: "build", shot: { size: "medium", on: "clipper", angle: -10, side: -0.3, move: "push", amount: 0.16 }, crowd: "snip",
    act: { clipper: { at: [0.05, 0, 1.6], pose: clip(0.85), view: "front" }, baker: { pose: clip(0.85), ...T3(1) }, barber: { pose: clip(0.85), ...T3(-1) } },
    gag: { prop: "sign", id: "warn", at: [0.05, 0, -0.7], opts: { text: "DEATH TO CLIPPERS", color: "#f1e7d2" }, scale: 2.1, in: "none", until: "y1696" } },
  { at: "clip", id: "clipAnyway", act: { clipper: { pose: clip(0.02, { expr: "smug" }), lead: 1 } }, gag: { fx: "sparkle", on: "clipper", size: 0.4, dy: -0.75 }, sfx: [{ name: "snip", lu: -7 }, { name: "snip", lu: -11, df: 8 }, { name: "snip", lu: -11, df: 15 }] },
  { at: "so", id: "question", shot: { size: "full", on: [0.03, -0.45, 1.2], h: 3.1, angle: 8, move: "crane", amount: 1.3 }, act: { clipper: { pose: clip(0.85, { expr: "laugh" }) } }, gag: { fx: "question", on: "clipper", size: 0.9, color: "#ffffff" } },
  { at: "stop", id: "stopW", music: "stop" },
  // ---- I (921-1035). The turn: night, rain, a coach. Newton steps out; no cut.
  { at: "1696", id: "y1696", key: NIGHT, via: "dissolve", rain: 1, music: "calm", shot: { size: "full", on: "coach", angle: 26, follow: "coach", fill: 0.42, height: 1.5 },
    act: { clipper: { hide: true, hold: null, hold2: null }, baker: { hide: true }, barber: { hide: true }, newton: { seat: { vehicle: "coach", seat: "inside" }, expr: "determined" } }, sfx: [{ name: "hooves", lu: -9 }, { name: "thunder", lu: -9, df: 6 }] },
  { at: "mint", id: "mint" },
  { at: "isaac", id: "isaac", shot: { size: "medium", on: "newton", angle: -14, side: 0.2, move: "push", amount: 0.16 }, act: { newton: { seat: null, at: [-1.5, 0, 3.3], pose: { limbs: { handR: [0.45, 0.3] }, hold: { item: "cane", hand: "R" }, expr: "determined" }, ...T3(1) } }, punch: true },
  // ---- J (1035-1162). The recall: everyone queues with a sack; the camera ends on the crucible.
  { at: "that", id: "recall", place: "mint", key: WARM, rain: 0, music: "build", shot: { size: "full", on: [-0.45, -0.5, 0.9], h: 3.0, angle: 16, move: "push", amount: 0.18 }, crowd: "look",
    act: { baker: { hide: false, at: [-2.3, 0, 1.9], pose: "carry", hold: { item: "sack", hand: "R" }, hold2: null, expr: "sad", view: "front" }, barber: { hide: false, at: [-1.4, 0, 2.5], pose: "carry", hold: { item: "sack", hand: "R" }, hold2: null, expr: "sad", view: "front" },
      keeper: { at: [-0.5, 0, 3.1], pose: "carry", hold: { item: "sack", hand: "R" }, expr: "sad", view: "front" }, newton: { at: [0.65, 0, 1.5], pose: hand(0.95, 1.0, { hands: { R: "point" }, expr: "determined" }), hold: null, ...T3(-1) },
      officer: { hide: true } },
    gag: [{ prop: "crucible", id: "crucible", at: "stage", in: "none", until: "see" }, { prop: "chest", id: "chest", at: [0.0, 0, -1.6], scale: 1.5, in: "none", until: "see" }] },
  { at: "every#2", id: "every", act: { baker: { walk: [-0.8, 0, -0.9], speed: 1.9 }, barber: { walk: [-1.6, 0, 0.4], speed: 1.7 }, keeper: { walk: [-0.55, 0, 1.6], speed: 1.5 } } },
  { at: "called", id: "called", shot: { size: "full", on: "crucible", h: 3.0, angle: 12, move: "push", amount: 0.2 }, act: { baker: { pose: "idle", hold: null, expr: "sad" } }, sfx: [{ name: "coins", lu: -9 }] },
  { at: "melted", id: "melted", kick: 0.04, sfx: [{ name: "sizzle", lu: -7 }] },
  // ---- K (1162-1458). The pivot, one long travelling shot: Newton, the press, the coin, the bite, the proof.
  { at: "you#2", id: "see", key: WARM, via: "dissolve", music: "calm", shot: { size: "medium", on: "newton", angle: -22, side: -0.3, move: "push", amount: 0.16 },
    act: { newton: { at: [-1.0, 0.6, -4.3], pose: hand(1.1, 1.0, { hands: { R: "point" }, expr: "happy" }), ...T3(1) }, baker: { hide: true }, barber: { hide: true }, keeper: { hide: true } },
    gag: { prop: "press", id: "press", at: [0.7, 0.6, -5.0], in: "none" } },
  { at: "machine", id: "machine", caption: 0.86, shot: { size: "full", on: "press", h: 2.5, angle: 16, move: "orbit", amount: -16 }, sfx: [{ name: "press", lu: -8, df: 6 }, { name: "press", lu: -8, df: 33 }, { name: "press", lu: -9, df: 60 }] },
  { at: "perfectly", id: "round", shot: { size: "insert", on: "proof", h: 0.66, move: "push", amount: 0.18 }, gag: { prop: "proofCoin", id: "proof", origin: "center", at: [0.55, 2.0, -1.6] } }, // (in front of the press, clear of Newton: hiding him on the cue was a one-frame jump)
  { at: "marked", id: "marked", event: [0, 6, 12] },
  { at: "shave", id: "shave", sfx: [{ name: "snip", lu: -6, df: 10 }], kick: 0.02 },
  { at: "cut", id: "cut", punch: true, sfx: ["ding"] },
  // ---- L (1458-1540). Comeuppance in one shot: he tries, the ridges snap, Newton walks in with the proof. CAUGHT holds.
  { at: "first", id: "first", place: "alley", key: ALLEY, rain: 0.8, caption: 0.7, shot: { size: "medium", on: "clipper", angle: 10, side: 0.3, move: "push", amount: 0.14 },
    act: { clipper: { hide: false, at: [0.4, 0, -0.3], pose: clip(0.85), ...T3(-1) }, newton: { hide: true, at: [-1.6, 0, 1.2] } } },
  { at: "tries", id: "tries", act: { clipper: { pose: clip(0.02, { hold2: CN({ cut: true }) }), ...T3(-1), lead: 1 } }, gag: [{ fx: "impact", on: "clipper", size: 0.25, dy: -0.2 }, { prop: "chipB", id: "chipB", at: [0.3, 1.04, -0.2], in: "none", until: "caught" }], sfx: [{ name: "snip", lu: -6, on_word: true }] },
  { at: "caught", id: "caught", shot: { size: "full", on: [-0.05, 0, -0.18], h: 2.3, angle: 4, move: "push", amount: 0.14 }, kick: 0.05,
    act: { newton: { hide: false, walk: [-0.5, 0, -0.05], speed: 3.4, pose: { limbs: { handR: [0.6, 1.45] }, hold: CN({ hand: "R", cut: true, len: 0.2 }), expr: "smug" }, ...T3(1) }, clipper: { pose: "shock", hold: null, hold2: null, ...T3(-1) } },
    gag: { big: "CAUGHT", y: 0.06, until: "quarterB" }, sfx: [{ name: "impact", lu: -4, on_word: true }] },
  // ---- M (1540-end). Today: the quarter, its 119 ridges, and it ends on them.
  { at: "quarter", id: "quarterB", place: "modern", key: "day", rain: 0, music: "full", caption: 0.8, shot: { size: "insert", on: "quarterP", h: 0.62, angle: 6, move: "push", amount: 0.14 },
    act: { girl: { at: [0.95, 0.16, -5.1], pose: hand(0.75, 1.35, { expr: "happy" }), ...T3(1) }, clipper: { hide: true }, newton: { hide: true } },
    gag: { prop: "quarter", id: "quarterP", origin: "center", at: [1.75, 1.75, -3.4] }, sfx: ["coin"] },
  { at: "119", id: "n119", sfx: ["sparkle"] },
  { at: "guarding", id: "guarding", act: { girl: { pose: "shrug", expr: "laugh", ...T3(1) } } },
  { at: "1965", id: "y1965", punch: true, sfx: ["ding"], music: "stop" },
];

const board: Board = {
  id: "coins", title: "Why You Can't Shave a Coin", words: WORDS, voOffset: 0.1, tail: 0.45,
  cast: { clipper: { spec: clipper, height: 1.72, tex: 2400 }, keeper: { spec: keeper, height: 1.6 }, smith: { spec: smith, height: 1.74 }, baker: { spec: baker, height: 1.7 }, barber: { spec: barber, height: 1.72 },
    officer: { spec: officer, height: 1.7 }, newton: { spec: newton, height: 1.76 }, girl: { spec: girl, height: 1.62 } },
  places: {
    den: { set: "workshop", opts: { era: "old", wall: "#8a5a48" }, look: { exposure: 1.14, grade: { gamma: 1.46 } } }, // dark walls behind light faces, then lift the whole room (mean luma 0.34 against 0.47)
    shop: { set: "shop", opts: { era: "old", title: "BAKER & SONS" } },
    mintOld: { set: "workshop", opts: { era: "old", wall: "#7f6a5c" }, look: { exposure: 1.1, grade: { gamma: 1.38 } } },
    street: { set: "street", opts: { era: "old", signs: ["BAKER", "GOLDSMITH", "TAVERN", "DRAPER", "BARBER", "INN"] }, crowd: 8, walkers: 2, wet: true,
      vehicles: { coach: { kind: "carriage", opts: { horses: 2, color: "#5a1f26" }, path: [[-15, 0, 1.5], [-6, 0, 1.4], [0.6, 0, 1.2]], from: "y1696", to: "mint", ease: "stop", lights: true } } },
    exchequer: { set: "office", opts: { era: "old", wall: "#e2d3b0" }, look: { exposure: 1.24, grade: { gamma: 1.46 } } },
    mint: { set: "hall", opts: { era: "old", title: "THE ROYAL MINT", wall: "#a8705a", accent: "#2f6fb0" }, crowd: 6 },
    alley: { set: "alley", opts: { era: "old", title: "THE DOG & DUCK" }, wet: true }, // no extras: one stood between the two heads in the climax
    modern: { set: "street", opts: { era: "modern" }, walkers: 2 },
  },
  props: { anvilCoin, oddCoins, cup, weigh, noose, crucible, press, proofCoin, quarter, chipA: chip("shaves", 1), chipB: chip("tries", -1) },
  beats,
  look: { grade: { saturation: 1.2, vibrance: 0.22 } }, // measured colourfulness 0.19-0.20 against 0.29: rooms of wood and brick need the push
};
export const coinShort = boardProject(board);
export const coinBoard = board;
