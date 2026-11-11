/**
 * PROOF SHORT 2 (1.7, storyboard as data) -- "Why You Can't Shave a Coin" (9:16, ~57 s, ElevenLabs VO).
 *
 * Everything the 1.7 kit adds is used here: one `Board` (lib/board.tsx), ready-made sets with marks, one light plan,
 * shot grammar with orbit / crane / whip / point-of-view, a gag per sentence, a reacting crowd, a coach with a
 * passenger arriving in the rain on a wet street, a car with a driver, and the sound cue sheet for audio/score.py.
 * Story: story/examples/coins.txt (formula B, scheme and comeuppance; lint 98/100). Facts: public/coins/claims.md.
 * The fact that matters most: Newton did NOT invent the marked edge (machine-struck coins with marked edges date from
 * 1662; he became Warden in 1696 and hunted the coiners), and the script says exactly that.
 */
import React from "react";
import * as THREE from "three";
import { Beat, Board, BoardApi, boardProject } from "../../lib/board";
import { LIGHT_KEYS, LightKey, tweak } from "../../lib/three/lightplan";
import { BobbleSpec, KPose } from "../../lib/characters/kinds";
import { canvasTexture } from "../../lib/three/textures";
import { PROPS } from "../../lib/three/sets";
import { clamp, ease, rng, springAt } from "../../lib/time";
import { LowerThird } from "../../lib/two/text";
import WORDS from "./words.json";

// ------------------------------------------------------------------------------------------------ cast (1690s wardrobe)
const clipper: BobbleSpec = { id: "clipper", kind: "bobble", skin: "#f3c9a4", hat: { style: "beanie", color: "#5a4a3a", accent: "#3a2f26" }, hair: { style: "long", color: "#4a3020" }, stache: "#4a3020",
  top: { color: "#6b5a3e", style: "vest", accent: "#e9dcc6", sleeves: "long" }, neck: { style: "scarf", color: "#a8423a" }, legs: "#4a3f36", shoes: "#2b2230", build: "slim" };
const keeper: BobbleSpec = { id: "keeper", kind: "bobble", skin: "#fbe3d0", hair: { style: "bun", color: "#8a5a34" }, top: { color: "#4f8a6a", style: "apron", accent: "#f4efe6" }, legs: "#5a4a3a", shoes: "#3a2a1e", cheeks: true };
const smith: BobbleSpec = { id: "smith", kind: "bobble", skin: "#e9b58c", hair: { style: "buzz", color: "#2a2228" }, beard: "#2a2228", top: { color: "#7a4a2a", style: "apron", accent: "#d9c7a0" }, legs: "#4a4f5c", shoes: "#3a2a1e", build: "stout" };
const baker: BobbleSpec = { id: "baker", kind: "bobble", skin: "#f6cfae", hat: { style: "chef", color: "#fbfaf6" }, stache: "#6a3d22", top: { color: "#e9dcc6", style: "apron", accent: "#c0392b" }, legs: "#6b5a44", shoes: "#3a2a1e", build: "stout" };
const barber: BobbleSpec = { id: "barber", kind: "bobble", skin: "#e9b58c", hair: { style: "side", color: "#1f1a22" }, stache: "#1f1a22", top: { color: "#3d6b8a", style: "vest", accent: "#f4efe6", sleeves: "long" }, neck: { style: "bow", color: "#c0392b" }, legs: "#3a3f5c", shoes: "#16131a" };
const officer: BobbleSpec = { id: "officer", kind: "bobble", skin: "#f3c9a4", hat: { style: "ranger", color: "#2b2f3a", accent: "#d8b04a" }, hair: { style: "curly", color: "#d9d4cc" }, glasses: "#2b2230",
  top: { color: "#26355e", style: "coat", accent: "#d8b04a" }, neck: { style: "tie", color: "#f4efe6" }, legs: "#1f2b4d", shoes: "#16131a", build: "stout" };
const newton: BobbleSpec = { id: "newton", kind: "bobble", skin: "#fbe3d0", hair: { style: "long", color: "#e6e1d8" }, top: { color: "#7a2f3a", style: "coat", accent: "#d8b04a" }, neck: { style: "tie", color: "#f4efe6" }, legs: "#3a2f36", shoes: "#16131a", build: "slim" };
const driver: BobbleSpec = { id: "driver", kind: "bobble", skin: "#c98e66", hair: { style: "pony", color: "#2a2228" }, top: { color: "#f39a2b", style: "hoodie" }, legs: "#3a3f5c", shoes: "#f4f6fa", cheeks: true };

// ------------------------------------------------------------------------------------------------ custom props: coins and the tools
const lam = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(o);
const SILVER = "#d9dde6", EDGE = "#9aa2b4";
const faceTex = (key: string, txt?: string) => canvasTexture(`coinface|${key}|${txt}`, 256, 256, (g) => {
  g.clearRect(0, 0, 256, 256); g.strokeStyle = "#8d96aa"; g.lineWidth = 7; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.stroke();
  g.fillStyle = "#b4bccb";
  if (txt) { g.font = "900 110px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, 128, 136); }
  else { g.beginPath(); g.arc(134, 104, 40, 0, 7); g.fill(); g.beginPath(); g.moveTo(96, 96); g.lineTo(78, 112); g.lineTo(98, 118); g.fill(); g.beginPath(); g.ellipse(128, 206, 66, 46, 0, Math.PI, 0); g.fill(); }
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; g.beginPath(); g.arc(128 + Math.cos(a) * 98, 128 + Math.sin(a) * 98, 3.2, 0, 7); g.fill(); }
});
/** A coin facing +z. `teeth` = a marked (reeded) edge, `rough` = a hand-hammered outline, `cut` = a shaved flat at that angle. */
function coin(r: number, o: { teeth?: number; rough?: string; cut?: number; text?: string; color?: string; t?: number } = {}) {
  const N = o.teeth ? o.teeth * 2 : 72, rr = o.rough ? rng(o.rough) : null, ph = rr ? [rr() * 7, rr() * 7, rr() * 7] : [0, 0, 0], sh = new THREE.Shape(), t = o.t ?? r * 0.16;
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; let k = 1;
    if (o.teeth) k = i % 2 ? 1 : 0.945;
    if (rr) k = 0.93 + 0.05 * Math.sin(a * 3 + ph[0]) + 0.04 * Math.sin(a * 5 + ph[1]) + 0.025 * Math.sin(a * 9 + ph[2]);
    let x = Math.cos(a) * r * k, y = Math.sin(a) * r * k;
    if (o.cut !== undefined) { const nx = Math.cos(o.cut), ny = Math.sin(o.cut), d = x * nx + y * ny - r * 0.78; if (d > 0) { x -= nx * d; y -= ny * d; } }
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y); }
  const geo = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false }); geo.translate(0, 0, -t / 2);
  const glow = (c: string, k: number) => ({ color: c, emissive: new THREE.Color(c), emissiveIntensity: k }); // silver must read in shade: a little self-light
  const g = new THREE.Group(), body = new THREE.Mesh(geo, [lam(glow(o.color ?? SILVER, 0.3)), lam(glow(EDGE, 0.22))]); body.castShadow = true; g.add(body);
  for (const s of [1, -1]) { const f = new THREE.Mesh(new THREE.CircleGeometry(r * (rr ? 0.74 : 0.84), 40), new THREE.MeshLambertMaterial({ map: faceTex(o.text ? "t" : "h", o.text), transparent: true, emissive: new THREE.Color("#8d96aa"), emissiveIntensity: 0.25 })); f.position.z = s * (t / 2 + 0.002); if (s < 0) f.rotation.y = Math.PI; g.add(f); }
  return g;
}
/** Shears + a hammered coin; a sliver flies off on every cue in `snips`; a file rasps from `file` on. */
const clipProp = (snips: string[], file?: string, fileEnd?: string) => (api: BoardApi) => {
  const g = new THREE.Group(), c = coin(0.15, { rough: "clipA" }); g.add(c);
  const steel = lam({ color: "#8d96a6" }), dark = lam({ color: "#3b3f4c" }), blades = [0, 1].map((i) => { const b = new THREE.Group(), bl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.012), steel); bl.position.x = 0.13; b.add(bl);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 14), dark); ring.position.set(-0.11, i ? 0.03 : -0.03, 0); b.add(ring); b.position.set(-0.34, 0.2, 0.03 + i * 0.014); g.add(b); return b; });
  const slivers = snips.map((_, i) => { const s = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.02), lam({ color: "#f4f6fa" })); s.visible = false; s.userData.i = i; g.add(s); return s; });
  const rasp = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.05), lam({ color: "#5c6678" })); rasp.visible = false; g.add(rasp);
  return { group: g, update(f: number, fps: number) {
    let open = 0.42; const T = api.T;
    snips.forEach((cue, i) => { const d = (f - T[cue]) * (30 / fps); if (d > -5 && d < 9) open = Math.min(open, d < 0 ? 0.42 * (-d / 5) : 0.42 * clamp(d / 9));
      const s = slivers[i], t = (f - T[cue]) / fps; s.visible = t >= 0 && t < 0.8; if (s.visible) { s.position.set(-0.12 - t * 0.5 - i * 0.03, 0.17 + t * 0.9 - 2.6 * t * t, 0.05); s.rotation.z = t * 9; } });
    blades[0].rotation.z = -0.5 + open; blades[1].rotation.z = -0.5 - open;
    c.rotation.y = 0.25 * Math.sin((f / fps) * 1.3);
    const fOn = !!file && f >= T[file] && (!fileEnd || f < T[fileEnd]); rasp.visible = fOn; for (const b of blades) b.visible = !fOn;
    if (fOn) { rasp.position.set(0.13 + 0.07 * Math.sin((f / fps) * 16), 0.12, 0.04); rasp.rotation.z = 0.6; }
  } };
};
const oddCoins = () => { const g = new THREE.Group(), cs = ["a", "b", "c"].map((k, i) => { const c = coin(0.3, { rough: "odd" + k }); c.position.set(i === 1 ? 0.12 : -0.08, (1 - i) * 0.7, 0); g.add(c); return c; }); // 9:16: stack them
  return { group: g, update(f: number, fps: number) { cs.forEach((c, i) => { c.rotation.y = 0.35 * Math.sin((f / fps) * 1.6 + i * 2); c.rotation.z = 0.2 * Math.sin((f / fps) * 0.9 + i); }); } }; };
const hammer = () => { const g = new THREE.Group(), piv = new THREE.Group(); piv.position.set(-0.32, 0.26, 0.05); g.add(piv);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), lam({ color: "#8a5a34" })); h.position.x = 0.18; piv.add(h); const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), lam({ color: "#5c6678" })); head.position.set(0.37, -0.02, 0); piv.add(head);
  const c = coin(0.2, { rough: "ham" }); c.rotation.x = -Math.PI / 2; c.position.y = 0.03; g.add(c);
  return { group: g, update(f: number, fps: number) { const t = ((f / fps) * 2.2) % 1; piv.rotation.z = 0.9 - (t < 0.25 ? ease.inCubic(t / 0.25) * 1.5 : 1.5 * (1 - ease.outCubic((t - 0.25) / 0.75))); c.scale.y = t > 0.25 && t < 0.4 ? 0.85 : 1; } }; };
const bar = () => { const g = new THREE.Group(), sh = new THREE.Shape(); sh.moveTo(-0.2, 0); sh.lineTo(0.2, 0); sh.lineTo(0.15, 0.1); sh.lineTo(-0.15, 0.1); sh.lineTo(-0.2, 0);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false }); geo.translate(0, 0, -0.1); const m = new THREE.Mesh(geo, lam({ color: "#e4e8f0" })); m.castShadow = true; m.rotation.y = 0.5; g.add(m); return g; };
const weigh = (api: BoardApi) => { const g = new THREE.Group(), br = lam({ color: "#c9a23a" });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.8, 10), br); post.position.y = 0.4; const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 16), br); base.position.y = 0.03; g.add(post, base);
  const beam = new THREE.Group(); beam.position.y = 0.8; g.add(beam); beam.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.04), br));
  const pans = [-1, 1].map((sx) => { const p = new THREE.Group(); p.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.04, 18), br)); for (const dz of [-0.14, 0.14]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.42, 4), br); st.position.set(0, 0.21, dz); p.add(st); } g.add(p); return { p, sx }; });
  const sack = PROPS.moneyBag({ text: "£" }); sack.scale.setScalar(0.72); pans[0].p.add(sack); sack.position.y = 0.02;
  for (let i = 0; i < 3; i++) { const wt = new THREE.Mesh(new THREE.CylinderGeometry(0.08 - i * 0.015, 0.09 - i * 0.015, 0.09, 12), lam({ color: "#3b3f4c" })); wt.position.set((i - 1) * 0.12, 0.065, i === 1 ? 0.06 : -0.04); pans[1].p.add(wt); }
  return { group: g, update(f: number, fps: number) { const k = f >= api.T.half ? springAt((f - api.T.half) / fps, 2.2, 0.35) : 0, a = -0.26 * k + 0.015 * Math.sin((f / fps) * 2.4); // the sack side goes UP: it is too light
    beam.rotation.z = a; for (const { p, sx } of pans) p.position.set(sx * 0.6 * Math.cos(a), 0.8 + sx * 0.6 * Math.sin(a) - 0.44, 0); } }; };
const crucible = () => { const g = new THREE.Group(), iron = lam({ color: "#3b3f4c" });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.42, 0.8, 20, 1, true), lam({ color: "#3b3f4c", side: THREE.DoubleSide })); pot.position.y = 0.72; pot.castShadow = true; g.add(pot);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.58, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.5, 0.4) })); glow.rotation.x = -Math.PI / 2; glow.position.y = 1.02; g.add(glow);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.32, 16), lam({ color: "#7a4a3a" }))); g.children[2].position.y = 0.16;
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), iron); l.position.set(sx * 0.72, 0.5, 0); g.add(l); }
  const coins = Array.from({ length: 16 }, (_, i) => { const c = coin(0.11, { rough: "melt" + (i % 4) }); g.add(c); return c; }), r = rng("melt"), off = coins.map(() => [r() - 0.5, r(), r() * 6]);
  return { group: g, update(f: number, fps: number) { const t = f / fps; coins.forEach((c, i) => { const ph = (t * 0.95 + off[i][1]) % 1; c.position.set(off[i][0] * 0.7, 3.4 - ph * 2.5, 0.1 * Math.sin(i)); c.rotation.set(t * 5 + off[i][2], t * 3 + i, 0); c.visible = c.position.y > 1.05; });
    (glow.material as THREE.MeshBasicMaterial).color.setRGB(3.2 + 0.5 * Math.sin(t * 7), 1.5 + 0.2 * Math.sin(t * 9), 0.4); } }; };
/** The screw press: the weighted arm swings, the screw comes down, a new coin drops on the stack. */
const press = () => { const g = new THREE.Group(), iron = lam({ color: "#39404e" }), brass = lam({ color: "#c9a23a" }), wood = lam({ color: "#7a5234" });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.0), wood)); g.children[0].position.y = 0.25;
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
const milled = () => { const c = coin(0.26, { teeth: 44, t: 0.07 }); return { group: c, update(f: number, fps: number) { c.rotation.y = 1.15 * Math.sin((f / fps) * 1.5); c.position.y += 0; } }; };
const shaved = (api: BoardApi) => { const g = new THREE.Group(), c = coin(0.26, { teeth: 44, cut: 0.6, t: 0.07 }); g.add(c);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.014, 6, 24, 1.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.5, 0.4) })); arc.rotation.z = 0.6 - 0.65; arc.position.z = 0.05; g.add(arc);
  return { group: g, update(f: number, fps: number) { g.rotation.y = 0.3 * Math.sin((f / fps) * 1.2); const k = clamp((f - api.T.cut) / 4); arc.visible = k > 0; arc.scale.setScalar(1 + 0.06 * Math.sin((f / fps) * 12)); } }; };
const quarter = () => { const c = coin(0.26, { teeth: 60, text: "25", t: 0.06 }); return { group: c, update(f: number, fps: number) { c.rotation.y = (f / fps) * 2.4; } }; };

// ------------------------------------------------------------------------------------------------ the storyboard
/** warm room light with a HIGH sun: a low golden sun throws the forge chimney's shadow across the whole back wall */
const WARM: LightKey = tweak({ ...LIGHT_KEYS.golden, lights: "day", sunGlow: 0, cookie: 0 }, { grade: { highlightTint: [0.012, 0.0, -0.01] } });
// measured per key (vfa keygap, iteration 1): the office key read cool and grey (highlight b -6, saturation 0.33 against
// +5.8 and 0.48 in the reference) and it covers 39 % of the runtime, so it decided the video-wide medians
const OFFICE: LightKey = tweak("office", { exposure: 1.08, grade: { saturation: 1.5, vibrance: 0.25, highlightTint: [0.03, 0.012, -0.035] } });
const NIGHT: LightKey = tweak("night", { exposure: 1.22, grade: { gamma: 1.14 } });
const ALLEY: LightKey = tweak("nightPractical", { exposure: 1.32, grade: { gamma: 1.18 } });
const FORGE: LightKey = tweak("interiorWarm", { grade: { highlightTint: [0.0, 0.0, 0.01] } });
const hand = (x: number, y: number, more: KPose = {}): KPose => ({ limbs: { handR: [x, y] }, hands: { R: "open" }, ...more });
const beats: Beat[] = [
  // 1. HOOK: the act in progress, three setups inside the first sentence
  { at: 0, id: "hook", place: "den", key: WARM, music: "build", caption: 0.74,
    shot: { size: "medium", on: "clipper", angle: -14, side: 0.35, move: "orbit", amount: 18 },
    act: { clipper: { at: [-1.1, 0, -1.9], pose: { limbs: { handR: [0.5, 0.9], handL: [0.9, 0.8] }, expr: "scheming", turn: -0.5 } } },
    gag: { prop: "clipA", id: "clipA", origin: "center", at: [-1.95, 1.12, -1.5], in: "none", until: "spends" } },
  { at: "sliver", id: "sliver", via: "cut", shot: { size: "insert", on: "clipA", h: 0.6, angle: -4, height: 1.75, move: "push", amount: 0.16 }, sfx: [{ name: "snip", lu: -7, on_word: true }], gag: { fx: "sparkle", on: "clipA", size: 0.5, dy: -0.2 } },
  { at: "coin", id: "grin", shot: { size: "close", on: "clipper", angle: 24, move: "push" }, act: { clipper: { expr: "smug", turn: 0.4 } }, punch: true },
  { at: "spends", id: "spends", place: "shop", key: "day", via: "cut", shot: { size: "two", on: ["clipper", "keeper"], angle: -10, move: "track", amount: 0.4 },
    act: { clipper: { at: [-0.75, 0, 0.3], pose: hand(1.05, 0.95, { expr: "smug" }), view: "three", facing: 1 }, keeper: { at: [0.75, 0, -2.1], pose: "wave", expr: "happy", view: "three", facing: -1 } },
    gag: { prop: "coins", id: "paid", at: "counterTop", opts: { n: 5 }, scale: 1.5 }, sfx: ["coin"] },
  { at: "anyway", id: "anyway", shot: { size: "close", on: "keeper", angle: 16, move: "push" }, act: { keeper: { pose: hand(0.5, 1.2, { expr: "happy" }) } }, gag: { fx: "sparkle", on: "keeper", size: 0.5 } },
  // 2. THE RULE: hammered by hand
  { at: "1600s", id: "y1600", place: "mintOld", key: FORGE, shot: { size: "full", on: "smith", angle: 24, side: -0.3, move: "orbit", amount: -20 },
    act: { smith: { at: [0.45, 0, -0.75], pose: { limbs: { handR: [0.6, 0.85] }, expr: "determined" }, view: "three", facing: 1 } },
    gag: [{ stamp: "ENGLAND, 1600s", until: "no" }, { prop: "hammer", id: "hammer", at: "anvilTop", scale: 1.25, in: "none", until: "snip" }], sfx: [{ name: "hammer", lu: -9, df: 8 }, { name: "hammer", lu: -9, df: 22 }, { name: "hammer", lu: -9, df: 36 }] },
  { at: "hammered", id: "hammered", via: "cut", shot: { size: "insert", on: "hammer", h: 0.95, angle: -16, height: 0.9, move: "push" }, kick: 0.03, sfx: [{ name: "hammer", lu: -5, df: 4 }] },
  { at: "no", id: "no", act: { smith: { hide: true } }, shot: { size: "insert", on: "odd", h: 2.3, fill: 0.9, angle: -8, move: "orbit", amount: 14 }, gag: [{ prop: "oddCoins", id: "odd", origin: "center", at: [0.3, 1.75, 0.2] }, { label: "no two match", y: 0.2 }] },
  // 3. THE REWARD
  { at: "snip", id: "snip", place: "den", key: WARM, via: "cut", shot: { size: "insert", on: "clipB", h: 0.6, angle: -4, height: 1.75, move: "push", amount: 0.12 },
    act: { clipper: { at: [-1.1, 0, -1.9], pose: { limbs: { handR: [0.5, 0.9], handL: [0.9, 0.8] }, expr: "scheming", turn: -0.5 } } },
    gag: { prop: "clipB", id: "clipB", origin: "center", at: [-1.95, 1.12, -1.5], in: "none", until: "pile" }, sfx: [{ name: "snip", lu: -7, on_word: true }] },
  { at: "file", id: "file", sfx: [{ name: "rasp", lu: -9 }] },
  { at: "pile", id: "pile", shot: { size: "insert", on: "pileP", h: 0.7, angle: -14, height: 1.1, move: "push" }, gag: { prop: "coins", id: "pileP", at: [-2.1, 0.97, -2.75], opts: { n: 34, color: "#f4f6fa", seed: "clippings" }, scale: 0.6, in: "drop" } },
  { at: "friday", id: "friday", shot: { size: "medium", on: "clipper", angle: -20, side: 0.3, move: "orbit", amount: 16 }, act: { clipper: { pose: "cheer", expr: "laugh" } },
    gag: [{ stamp: "FRIDAY", side: "right", until: "baker" }, { prop: "bar", id: "bar", at: [-1.85, 1.4, -1.55], scale: 1.3, until: "baker" }, { fx: "sparkle", on: "bar", size: 0.8, dy: 0 }], sfx: ["ding"] },
  // 4. ESCALATION: everybody clips
  { at: "then#2", id: "baker", place: "street", key: "day", shot: { size: "medium", on: "baker", angle: 18, move: "push" },
    act: { baker: { at: [-2.4, 0, 0.4], pose: hand(0.7, 1.15, { expr: "scheming", turn: 0.4 }) }, barber: { at: [2.5, 0, 0.6], pose: hand(0.7, 1.15, { expr: "scheming", turn: -0.4 }) }, clipper: { hide: true } },   // (he stood between the baker and the barber: the whip swung through his face)
    gag: { fx: "sparkle", on: "baker", size: 0.5 }, sfx: [{ name: "snip", lu: -9, df: 12 }], music: "full" },
  { at: "barber", id: "barber", via: "whip", shot: { size: "medium", on: "barber", angle: -18, move: "push" }, gag: { fx: "sparkle", on: "barber", size: 0.5 }, sfx: [{ name: "snip", lu: -9, df: 8 }] },
  { at: "everybody", id: "everybody", shot: { size: "wide", move: "crane", amount: 3.4 }, crowd: "cheer", act: { clipper: { hide: false, at: [0.1, 0, 1.6], pose: "cheer", expr: "laugh" }, baker: { pose: "cheer" }, barber: { pose: "cheer" } },
    gag: { label: "clip · clip · clip", y: 0.17 }, sfx: [{ name: "snip", lu: -10, df: 4 }, { name: "snip", lu: -11, df: 10 }, { name: "snip", lu: -10, df: 17 }] },
  // 5. HOW BAD: the weighing
  { at: "1695", id: "y1695", place: "exchequer", key: OFFICE, music: "thin", shot: { size: "medium", on: "officer", angle: -16, side: -0.3, move: "push" },
    act: { officer: { at: "desk", pose: "think", expr: "think", turn: 0.5 }, clipper: { at: [-1.5, 0, 0.5], pose: "idle", expr: "nervous", turn: 0.5 } },
    gag: [{ stamp: "1695", until: "half" }, { prop: "weigh", id: "weigh", at: [1.45, 0.85, -1.2], scale: 1.0, in: "none" }] },
  { at: "half", id: "half", shot: { size: "insert", on: "weigh", h: 1.25, angle: -6, height: 0.7, move: "push" }, kick: 0.035, act: { officer: { pose: "shock" } }, gag: { counter: { from: 100, to: 52, suffix: " %" }, y: 0.17 }, sfx: ["creak"] },
  // 6. AUTHORITY PUSHES BACK: two spoken lines
  { at: "this#2", id: "tooSmall", off: -0.1, via: "cut", shot: { size: "close", on: "officer", angle: -18, move: "push" }, act: { officer: { pose: hand(0.9, 1.25, { expr: "angry", hands: { R: "point" } }), view: "three", facing: -1, talk: true } } },
  { at: "it#2", id: "shrank", off: -0.1, via: "cut", shot: { size: "close", on: "clipper", angle: 16, move: "push" }, act: { clipper: { pose: "shrug", expr: "embarrassed", view: "three", facing: 1, talk: true } }, gag: { fx: "sweat", on: "clipper", size: 0.6 } },
  // 7. STAKES
  { at: "the>79", id: "punish", shot: { size: "close", on: "officer", angle: -24, move: "push", amount: 0.22 }, act: { officer: { pose: "hips", expr: "angry", turn: 0 } }, gag: { big: "TREASON", until: "people" }, kick: 0.04 },
  { at: "people", id: "people", place: "street", key: "golden", via: "cut", shot: { size: "wide", move: "track", amount: 2.6 }, crowd: "clap", act: { clipper: { at: [0.1, 0, 1.6], pose: hand(0.7, 1.15, { expr: "scheming" }) } },
    sfx: [{ name: "snip", lu: -10, df: 5 }, { name: "snip", lu: -11, df: 13 }, { name: "snip", lu: -10, df: 21 }] },
  { at: "so", id: "question", shot: { size: "high", on: "clipper", angle: 12, move: "crane", amount: 2.2 }, gag: { fx: "question", on: "clipper", size: 0.9, color: "#ffffff" }, music: "stop" },
  // 8. THE TURN: night, rain, a coach
  { at: "1696", id: "y1696", key: NIGHT, via: "dissolve", rain: 1, music: "calm", shot: { size: "full", on: "coach", angle: 28, follow: "coach", fill: 0.42, height: 1.5 },
    act: { clipper: { hide: true }, baker: { hide: true }, barber: { hide: true }, newton: { seat: { vehicle: "coach", seat: "inside" }, expr: "determined" } }, gag: { stamp: "1696", until: "isaac" }, sfx: [{ name: "hooves", lu: -9 }, { name: "thunder", lu: -9, df: 6 }] },
  { at: "isaac", id: "isaac", via: "cut", shot: { size: "medium", on: "newton", angle: -20, move: "push", amount: 0.2 }, act: { newton: { seat: null, at: [-1.4, 0, 3.4], pose: "hips", expr: "determined" } }, punch: true },
  // 9. THE RECALL
  { at: "that", id: "recall", place: "mint", key: FORGE, rain: 0, music: "build", shot: { size: "wide", move: "push", amount: 0.3 }, crowd: "look",
    act: { newton: { at: [-1.6, 0, 0.2], pose: hand(1.0, 1.3, { hands: { R: "point" }, turn: 0.6, expr: "determined" }) } }, gag: { prop: "crucible", id: "crucible", at: "stage", in: "none", until: "see" }, sfx: [{ name: "coins", lu: -9 }] },
  { at: "melted", id: "melted", shot: { size: "full", on: "crucible", h: 3.0, angle: 14, move: "push", amount: 0.25 }, kick: 0.04, sfx: [{ name: "sizzle", lu: -7 }] },
  // 10. PIVOT: the machine and its coin
  { at: "you#2", id: "see", key: OFFICE, via: "dissolve", music: "calm", shot: { size: "medium", on: "newton", angle: -24, side: -0.35, move: "push" },
    act: { newton: { at: [-1.0, 0.6, -4.3], pose: hand(1.1, 1.0, { hands: { R: "point" }, expr: "happy" }), view: "three", facing: 1 } }, gag: { prop: "press", id: "press", at: [0.7, 0.6, -5.0], in: "none" }, sfx: ["chime"] },
  { at: "machine", id: "machine", shot: { size: "full", on: "press", h: 2.5, angle: 20, move: "orbit", amount: -26 }, sfx: [{ name: "press", lu: -8, df: 6 }, { name: "press", lu: -8, df: 33 }] },
  { at: "1662", id: "y1662", gag: { stamp: "since 1662", side: "right", until: "shave" } },
  { at: "perfectly", id: "round", shot: { size: "insert", on: "milled", h: 0.62, move: "push", amount: 0.1 }, gag: { prop: "milled", id: "milled", origin: "center", at: [-0.2, 2.0, -1.6], until: "shave" }, sfx: ["sparkle"] },
  { at: "marked", id: "marked", gag: { label: "a marked edge", y: 0.2 } },
  // 11. REVERSAL: the evidence, as Newton sees it
  { at: "shave", id: "shave", via: "cut", shot: { size: "pov", on: "shavedC", from: "newton", h: 0.56, move: "push", amount: 0.12 }, act: { newton: { at: [-1.2, 0, 1.8], pose: "think" } }, gag: { prop: "shaved", id: "shavedC", origin: "center", at: [-0.8, 1.6, -1.3], in: "none", until: "first" } },
  { at: "cut", id: "cut", gag: [{ label: "the cut shows", y: 0.2, color: "#ff6a5a" }, { fx: "exclaim", on: "shavedC", size: 0.5, dy: 0.1 }], sfx: ["ding"], punch: true },
  // 12. COMEUPPANCE
  { at: "first", id: "first", place: "alley", key: ALLEY, rain: 0.8, shot: { size: "medium", on: "clipper", angle: 14, move: "push" },
    act: { clipper: { at: [0.6, 0, -0.3], pose: { limbs: { handL: [0.5, 0.9], handR: [0.72, 1.0] }, expr: "scheming", turn: 0.4 } }, newton: { at: [-0.75, 0, 0.0], hide: true } }, sfx: [{ name: "snip", lu: -8, df: 14 }] },
  { at: "caught", id: "caught", via: "cut", shot: { size: "two", on: ["newton", "clipper"], angle: 6, move: "push" }, crowd: "gasp", kick: 0.05,
    act: { clipper: { pose: "shock", view: "three", facing: -1 }, newton: { hide: false, at: [-0.75, 0, 0.0], pose: hand(1.1, 1.1, { hands: { R: "point" }, expr: "smug" }), view: "three", facing: 1 } }, gag: [{ fx: "exclaim", on: "clipper", size: 0.6 }, { big: "CAUGHT", until: "today" }], sfx: [{ name: "impact", lu: -4, on_word: true }] },
  // 13. TAG: today
  { at: "and>150", id: "today", place: "modern", key: "day", rain: 0, music: "full", shot: { size: "full", on: "taxi", angle: 30, follow: "taxi", fill: 0.5 }, act: { driver: { seat: { vehicle: "taxi", seat: "driver" }, expr: "happy" } }, sfx: [{ name: "car", lu: -10 }] },
  { at: "quarter", id: "quarterB", shot: { size: "insert", on: "quarterP", h: 0.62, move: "push", amount: 0.1 }, gag: { prop: "quarter", id: "quarterP", origin: "center", at: [1.6, 2.3, -4.7] }, sfx: ["coin"] },
  { at: "119", id: "n119", gag: { counter: { from: 0, to: 119, suffix: " ridges" }, y: 0.17, until: "guarding" } },
  { at: "guarding", id: "guarding", via: "cut", shot: { size: "full", on: "taxi", angle: 12, fill: 0.5, move: "push", amount: 0.2 }, act: { driver: { expr: "laugh" } } },
  { at: "1965", id: "y1965", gag: { stamp: "no silver since 1965" }, punch: true, sfx: ["ding"], music: "stop" },
];

const board: Board = {
  id: "coins", title: "Why You Can't Shave a Coin", words: WORDS, voOffset: 0.1, tail: 1.0,
  cast: { clipper: { spec: clipper, height: 1.72 }, keeper: { spec: keeper, height: 1.6 }, smith: { spec: smith, height: 1.74 }, baker: { spec: baker, height: 1.7 }, barber: { spec: barber, height: 1.72 },
    officer: { spec: officer, height: 1.7 }, newton: { spec: newton, height: 1.76 }, driver: { spec: driver, height: 1.66 } },
  places: {
    den: { set: "workshop", opts: { era: "old", wall: "#c98a5e" } },
    shop: { set: "shop", opts: { era: "old", title: "BAKER & SONS" } },
    mintOld: { set: "workshop", opts: { era: "old", wall: "#a89078" } },
    street: { set: "street", opts: { era: "old", signs: ["BAKER", "GOLDSMITH", "TAVERN", "DRAPER", "BARBER", "INN"] }, crowd: 8, walkers: 3, wet: true,
      vehicles: { coach: { kind: "carriage", opts: { horses: 2, color: "#5a1f26" }, path: [[-15, 0, 1.5], [-6, 0, 1.4], [0.6, 0, 1.2]], from: "y1696", to: "isaac", ease: "stop", lights: true } } },
    exchequer: { set: "office", opts: { era: "old", wall: "#6fb596" } },
    mint: { set: "hall", opts: { era: "old", title: "THE ROYAL MINT", wall: "#cf8f62", accent: "#2f6fb0" }, crowd: 7 },
    alley: { set: "alley", opts: { era: "old", title: "THE DOG & DUCK" }, crowd: 2, wet: true },
    modern: { set: "street", opts: { era: "modern" }, walkers: 2, vehicles: { taxi: { kind: "car", opts: { body: "hatch", color: "#2f7fd0" }, path: [[-13, 0, -1.8], [-5, 0, -1.9], [1.2, 0, -2.6]], from: "today", to: "quarterB", ease: "stop" } } },
  },
  props: { clipA: clipProp(["sliver"]), clipB: clipProp(["snip"], "file", "pile"), oddCoins, hammer, bar, weigh, crucible, press, milled, shaved, quarter },
  beats,
  look: { grade: { saturation: 1.2, vibrance: 0.22 } }, // measured colourfulness 0.19-0.20 against 0.29: rooms of wood and brick need the push
  overlay: (T) => <LowerThird title="Isaac Newton" sub="Warden of the Mint, 1696" start={T.isaac + 4} dur={T.recall - T.isaac - 8} accent="#ffd23f" />,
};
export const coinShort = boardProject(board);
export const coinBoard = board;
