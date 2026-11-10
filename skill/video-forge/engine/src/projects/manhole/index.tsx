/**
 * DEMO SHORT (toonworld style) -- "Why manhole covers are round" (9:16, ~42 s).
 *
 * Built from the measured channel profile in references/styles/toonworld-explainer.md:
 *  - script formula: paradox hook as fact -> setting -> rival mocks ("Square? Good luck with that.")
 *    -> escalation -> the incident -> "Wait, what?" -> "You see," mechanism -> ironic payoff, ends on last word
 *  - lighting follows the beats: day set-up -> golden morning incident -> NIGHT-BLUE explanation -> day payoff
 *  - camera travels between moments (glides ~24 f, symmetric ease, constant slow push-in), follows the falling
 *    cover down the shaft, one hard cut; DOF only on the close-up; bloom only on emissive; no grain
 *  - toonworld characters, flat painted materials, ~3 px ink, one-word captions, flat 2D FX
 * Fact: a square cover is wider across its diagonal than its sides, so tilted along the hole's diagonal it fits
 * through; a circle has constant width, so a round cover can't fall into its own hole.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { cameraRig, V3 } from "../../lib/camera";
import { blinkAt, CharacterSpec, idlePose, mergePose, Pose, walkPose } from "../../lib/characters/toon";
import { deepMerge, LOOKS, lookTimeline } from "../../lib/look";
import { ProjectDef } from "../../lib/project";
import { CharacterCard } from "../../lib/three/cast";
import { FxLayer } from "../../lib/three/fx";
import { NOINK } from "../../lib/three/post";
import { Stage3D } from "../../lib/three/Stage3D";
import { flat } from "../../lib/three/textures";
import { applyToonSetup, makeToonUniforms, TOON_SETUPS, toonifyScene, windSway, windUniforms } from "../../lib/three/shaders";
import { bench, bird, blocksShot, cloudCard, fence, flowerBox, house, lampPost, lights, sky, tree } from "../../lib/three/world";
import { FONTS, useU, WordCaptions } from "../../lib/two/text";
import { clamp, ease, lerp, springAt } from "../../lib/time";
import WORDS from "./words.json";

const OFF = 0.1;
const words = WORDS.map((w) => ({ ...w, start: w.start + OFF, end: w.end + OFF }));
const W = (txt: string, from = 0) => words.findIndex((w, i) => i >= from && w.word.toLowerCase().replace(/[^a-z]/g, "").startsWith(txt));
const at = (i: number) => words[i].start;

export const timing = (fps: number) => {
  const F = (s: number) => Math.round(s * fps);
  return {
    F,
    total: F(words[words.length - 1].end + 0.35), // ends on the last word
    square1: F(at(W("square"))),
    mayor: F(at(W("you")) + 0.25),
    foundry: F(at(W("the", 20)) - 0.05),
    squareQ: F(at(W("square", 30))),
    cart: F(at(W("but")) - 0.1),
    loves: F(at(W("loves"))),
    spring: F(at(W("so")) - 0.05),
    morning: F(at(W("then")) - 0.05),
    lifts: F(at(W("lifts"))),
    turns: F(at(W("turns"))),
    down: F(at(W("down", 75))),
    slips: F(at(W("slips"))),
    drop: F(at(W("straight"))),
    hole: F(at(W("hole", 80)) + 0.12),
    wait: F(at(W("wait"))),
    explain: F(at(W("you", 95)) - 0.05),
    corner: F(at(W("corner"))),
    turn2: F(at(W("turn", 110))),
    through: F(at(W("slides"))),
    circle: F(at(W("circle"))),
    never: F(at(W("never"))),
    summer: F(at(W("by", 145)) - 0.05),
    oldf: F(at(W("and", 155)) - 0.05),
    doubled: F(at(W("doubled"))),
  };
};

const HOLE = 0.8, COVER = 0.9, DEPTH = 2.7;
const worker: CharacterSpec = { id: "worker", style: "toonworld", skin: "#fef4ee", hair: { color: "#5b3a24", style: "short" }, top: { color: "#f08a24" }, bottom: { color: "#3a4a78" }, hat: { style: "cap", color: "#e8b923" } };
const worker2: CharacterSpec = { ...worker, id: "worker2", top: { color: "#3aa0d8" }, hat: { style: "cap", color: "#f2f2f2" } };
const mayor: CharacterSpec = { id: "mayor", style: "toonworld", skin: "#fef4ee", top: { color: "#2f3a5c", style: "coat", accent: "#d8b04a" }, bottom: { color: "#23293d" }, hat: { style: "top", color: "#1d1f2b" }, build: "stout" };
const founder: CharacterSpec = { id: "founder", style: "toonworld", skin: "#fef4ee", hair: { color: "#d9d4cc", style: "bald" }, beard: "#e6e1d8", top: { color: "#8a4b2e" }, bottom: { color: "#4b3a2e" }, build: "slim" };

const FOUNDRY: V3 = [22, 0, -9];
const extras: CharacterSpec[] = [
  { id: "x1", style: "toonworld", skin: "#fef4ee", hair: { color: "#c46a2e", style: "bob" }, top: { color: "#7bc96f", style: "dress" }, bottom: { color: "#4b5a7a" } },
  { id: "x2", style: "toonworld", skin: "#fef4ee", top: { color: "#e05a6b" }, bottom: { color: "#2e3442" }, hat: { style: "beanie", color: "#3a6fb0" } },
  { id: "x3", style: "toonworld", skin: "#fef4ee", hair: { color: "#2a2228", style: "curly" }, top: { color: "#f2c94c" }, bottom: { color: "#5b4b7a" }, build: "slim" },
];
const EXTRA_PATHS = [ // walking townsfolk on the pavements (x0, x1 over the whole short, z)
  { x0: -30, x1: 26, z: -4.6, seed: 1 }, { x0: 24, x1: -32, z: 4.7, seed: 2 }, { x0: -12, x1: 30, z: 5.0, seed: 3 },
];
const lam = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(o);

/** Ground plane with rectangular holes (ShapeGeometry), lying flat at y. */
function holedPlane(rect: [number, number, number, number], holes: [number, number, number, number][], mat: THREE.Material, y = 0) {
  const [x0, z0, x1, z1] = rect;
  const sh = new THREE.Shape();
  sh.moveTo(x0, -z0); sh.lineTo(x1, -z0); sh.lineTo(x1, -z1); sh.lineTo(x0, -z1); sh.closePath();
  for (const [hx0, hz0, hx1, hz1] of holes) {
    const p = new THREE.Path();
    p.moveTo(hx0, -hz0); p.lineTo(hx0, -hz1); p.lineTo(hx1, -hz1); p.lineTo(hx1, -hz0); p.closePath();
    sh.holes.push(p);
  }
  const g = new THREE.ShapeGeometry(sh);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

function squareCover() {
  const top = new THREE.MeshStandardMaterial({ map: flat.coverSquare(), metalness: 0.4, roughness: 0.55 });
  const side = new THREE.MeshStandardMaterial({ color: "#454b57", metalness: 0.4, roughness: 0.6 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(COVER, 0.06, COVER), [side, side, top, side, side, side]);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function roundCover() {
  const top = new THREE.MeshStandardMaterial({ map: flat.coverRound(), metalness: 0.4, roughness: 0.55 });
  const side = new THREE.MeshStandardMaterial({ color: "#454b57", metalness: 0.4, roughness: 0.6 });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(COVER / 2, COVER / 2, 0.06, 40), [side, top, side]);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Hole-A cover pose as a pure function of frame. Returns position + Euler + visibility. */
function coverAt(f: number, T: ReturnType<typeof timing>) {
  const up = ease.smoother(clamp((f - T.lifts) / 16));
  const turn = ease.smoother(clamp((f - T.turns) / 18));
  const lower = ease.smoother(clamp((f - T.down) / 12));
  let y = 0.03 + up * 0.85 - lower * 0.35;
  const tilt = up * (Math.PI / 2); // stand it on edge
  const yaw = turn * (Math.PI / 4); // align with the hole's diagonal
  let wob = 0;
  if (f >= T.slips && f < T.drop) wob = Math.sin((f - T.slips) * 0.9) * 0.08 * (1 - (f - T.slips) / (T.drop - T.slips + 1));
  if (f >= T.drop) {
    const t = (f - T.drop) / 30;
    y = 0.53 - 0.5 * 9.81 * t * t;
    y = Math.max(y, -DEPTH + 0.15);
  }
  return { pos: [0, y, 0] as V3, rot: [tilt, yaw, wob] as V3, visible: f < T.hole + 20 };
}

const World: React.FC = () => {
  const { fps } = useVideoConfig();
  const T = timing(fps);
  const day = LOOKS["toonworld-day"], golden = LOOKS["toonworld-golden"], night = LOOKS["toonworld-night"];
  const cu = (l: typeof day) => deepMerge(l, { dof: { enabled: true, maxBlur: 12, aperture: 1.2 } });
  const look = lookTimeline([
    [0, cu(day)], [T.mayor, day], [T.morning, golden], [T.wait + 6, cu(golden)], [T.explain, night], [T.summer, day], [T.oldf, cu(day)],
  ], 14);
  const coverTarget = (f: number): V3 => coverAt(f, T).pos;
  const rig = cameraRig([
    { f: 0, pos: [2.9, 1.25, 3.9], look: [0.35, 0.65, 0.1], fov: 34, focus: 4.2 },
    { f: T.mayor - 6, pos: [2.3, 1.1, 3.1], look: [0.4, 0.6, 0.1], glide: T.mayor - 6, focus: 3.3 },
    { f: T.mayor + 28, pos: [-6.6, 1.55, 6.4], look: [-9.4, 1.05, 1.8], fov: 34, glide: 34 },
    { f: T.foundry - 4, pos: [-5.4, 1.5, 5.6], look: [-8.2, 1.0, 1.8], glide: T.foundry - T.mayor - 24 },
    { f: T.foundry + 26, pos: [17.2, 1.7, -1.2], look: [20.5, 1.5, -5.6], fov: 32, glide: 32 },
    { f: T.cart - 4, pos: [18.2, 1.55, -2.6], look: [20.6, 1.45, -5.6], glide: T.cart - T.foundry - 24 },
    { f: T.cart + 26, pos: [-2.6, 2.0, 4.8], look: [-5.4, 0.9, -0.6], fov: 34, glide: 32 },
    { f: T.spring - 2, pos: [-3.0, 1.85, 4.1], look: [-5.4, 0.9, -0.6], glide: T.spring - T.cart - 24 },
    { f: T.spring + 30, pos: [-3, 24, 5.5], look: [-6, 0, -0.6], fov: 46, glide: 36 },
    { f: T.morning - 2, pos: [-1.5, 21, 4.6], look: [-4, 0, -0.4], glide: T.morning - T.spring - 28 },
    { f: T.morning, pos: [2.5, 1.35, 3.4], look: [0.25, 0.75, 0], fov: 33, cut: true }, // >half-frame travel => CUT on "Then"
    { f: T.drop - 4, pos: [2.1, 1.25, 2.8], look: [0.2, 0.7, 0], glide: T.drop - T.morning - 30 },
    { f: T.hole + 8, pos: [2.1, 1.25, 2.8], look: [0.2, 0.7, 0] },
    { f: T.hole + 9, pos: [2.15, 1.38, 2.2], look: [1.15, 1.25, 0.55], fov: 30, cut: true, focus: 1.9 },
    { f: T.explain + 40, pos: [0.6, 4.2, 6.2], look: [0.4, 0.4, 0], fov: 36, glide: 44, focus: 6.5 },
    { f: T.summer - 2, pos: [2.6, 3.8, 5.4], look: [0.4, 0.4, 0], glide: T.summer - T.explain - 32 },
    { f: T.summer + 30, pos: [-2.4, 1.9, 5.6], look: [-0.6, 0.6, 0], fov: 34, glide: 34 },
    { f: T.oldf + 26, pos: [18.2, 1.25, -2.1], look: [20.6, 0.95, -5.6], fov: 34, glide: 30, focus: 4.0 },
    { f: T.total + 10, pos: [18.6, 1.22, -2.7], look: [20.6, 0.95, -5.6], glide: T.total - T.oldf - 12 },
  ], { push: { rate: 0.0028, punches: [T.square1, T.squareQ, T.loves, T.wait, T.corner, T.never, T.doubled].map((p) => ({ f: p - 2, rate: 0.007, n: 30 })) }, kicks: [{ f: T.hole, amp: 0.05 }, { f: T.doubled, amp: 0.03 }],
    follow: [{ f0: T.drop - 2, f1: T.hole + 8, target: coverTarget, offset: [0.1, 1.85, 0.18], lookAhead: 2, blend: 6, blendOut: 0 }] });

  return (
    <Stage3D look={look} camAt={(fr, fp) => rig.at(fr, fp)}
      build={({ scene }) => {
        const skyM = sky(scene, "#3f8ff0", "#bfe6ff");
        const L = lights(scene, "day", { shadowSize: 34, target: [0, 0, 0], fog: [40, 260] });
        // street with the real hole, grass around it, a shaft under the hole
        const roadMat = lam({ map: flat.tiles("#cdbba6", "#6f5848", 4, [0.25, 0.25]) });
        scene.add(holedPlane([-40, -4, 40, 4], [[-HOLE / 2, -HOLE / 2, HOLE / 2, HOLE / 2]], roadMat));
        scene.add(holedPlane([-200, -200, 200, 200], [[-40, -4, 40, 4]], lam({ map: flat.grass("#71b038", [40, 40]) }), -0.005));
        const shaftMat = lam({ map: flat.stone("#8a7a86", "#4a3e4c", [0.5, 1.5]), side: THREE.DoubleSide });
        const shaftLamp = new THREE.PointLight("#ffd9a0", 3.5, 3.2, 1.4); scene.add(shaftLamp);
        for (const [x, z, ry] of [[0, -HOLE / 2, 0], [0, HOLE / 2, 0], [-HOLE / 2, 0, Math.PI / 2], [HOLE / 2, 0, Math.PI / 2]] as const) {
          const w = new THREE.Mesh(new THREE.PlaneGeometry(HOLE, DEPTH), shaftMat); w.position.set(x, -DEPTH / 2, z); w.rotation.y = ry; scene.add(w);
        }
        const water = new THREE.Mesh(new THREE.PlaneGeometry(HOLE, HOLE), lam({ color: "#2b7fb0", emissive: new THREE.Color("#0e3550") }));
        water.rotation.x = -Math.PI / 2; water.position.y = -DEPTH + 0.1; scene.add(water);
        // houses both sides + the foundry
        const walls = ["#f3e6d2", "#e58e6e", "#df585d", "#f2d48a", "#bfd9c9", "#f3e6d2"], roofs = ["#dc8872", "#c87563", "#bdbfc6"];
        for (let i = 0; i < 9; i++) for (const side of [-1, 1]) {
          if (side < 0 && i === 7) continue; // foundry slot
          const h = house({ w: 5.4, d: 4.6, h: 4 + (i % 3) * 1.4, wall: walls[(i + (side > 0 ? 2 : 0)) % walls.length], roof: roofs[i % 3], seed: `h${i}${side}`, floors: 1 + (i % 2) });
          h.position.set(-34 + i * 7.5, 0, side * 9); h.rotation.y = side > 0 ? Math.PI : 0; scene.add(h);
        }
        const fdy = house({ w: 7, d: 6, h: 5.2, wall: "#9c5a44", roof: "#4b3f46", seed: "foundry", floors: 1 });
        fdy.position.set(...FOUNDRY); scene.add(fdy);
        const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 3.2, 12), lam({ color: "#6b4b44" }));
        chim.position.set(FOUNDRY[0] + 2.2, 7.4, FOUNDRY[2] - 0.5); chim.castShadow = true; scene.add(chim);
        const wind = windUniforms();
        for (let i = 0; i < 10; i++) { const t = tree({ seed: "st" + i, h: 4.5 + (i % 3) }); t.position.set(-36 + i * 8, 0, i % 2 ? -15 : 15); windSway(t, wind, 2.2); scene.add(t); }
        for (let i = 0; i < 12; i++) for (const side of [-1, 1]) {
          const x = -36 + i * 6.5 + (side > 0 ? 3 : 0);
          if (Math.abs(x) < 3 || (side < 0 && Math.abs(x - FOUNDRY[0]) < 4)) continue;
          if (blocksShot([x, 0, side * 5], 0.9, rig.keys)) continue; // sight-line culling: never block a shot
          if (i % 2 === 0) { const lp = lampPost(); lp.position.set(x, 0, side * 4.4); lp.rotation.y = side > 0 ? Math.PI : 0; scene.add(lp); }
          else if (i % 4 === 1) { const b = bench(); b.position.set(x, 0, side * 5.2); b.rotation.y = side > 0 ? Math.PI : 0; scene.add(b); }
          else { const fb = flowerBox({ seed: `fb${i}${side}` }); fb.position.set(x, 0, side * 6.4); scene.add(fb); }
          if (i % 3 === 0) { const fc = fence(3.2); fc.position.set(x + 2.5, 0, side * 6.7); scene.add(fc); }
        }
        const people = extras.map((sp) => { const c = new CharacterCard(sp, 1.5, 900, L.sun); scene.add(c.group); return c; });
        const birds = [0, 1, 2].map(() => { const b = bird(); b.group.scale.setScalar(1.6); scene.add(b.group); return b; });
        const clouds = [0, 1, 2].map((i) => { const c = cloudCard({ seed: "mc" + i, w: 40 }); c.position.set(-60 + i * 60, 45 + i * 6, -170); scene.add(c); return c; });
        // covers: hole A (square, later round) + street covers
        const coverA = squareCover(); scene.add(coverA);
        const roundA = roundCover(); roundA.position.set(0, 0.03, 0); scene.add(roundA);
        const street: { sq: THREE.Mesh; rd: THREE.Mesh }[] = [];
        for (const x of [-24, -16, -8, 8, 16]) {
          const sq = squareCover(), rd = roundCover();
          sq.position.set(x, 0.03, (x / 8) % 2 ? 1.6 : -1.6); rd.position.copy(sq.position);
          scene.add(sq, rd); street.push({ sq, rd });
        }
        // cart with stacked covers
        const cart = new THREE.Group();
        const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 1.2), lam({ color: "#8a5a3a" })); bed.position.y = 0.55; cart.add(bed);
        for (let k = 0; k < 6; k++) { const c = squareCover(); c.position.set(0, 0.72 + k * 0.065, 0); c.rotation.y = (k % 2) * 0.03; cart.add(c); }
        for (const [x, z] of [[-0.8, 0.65], [0.8, 0.65], [-0.8, -0.65], [0.8, -0.65]]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 20), lam({ color: "#4b3f46" })); wh.rotation.x = Math.PI / 2; wh.position.set(x, 0.32, z); cart.add(wh); }
        cart.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
        scene.add(cart);
        const cast = {
          worker: new CharacterCard(worker, 1.55, 1500, L.sun), worker2: new CharacterCard(worker2, 1.55, 1300, L.sun),
          mayor: new CharacterCard(mayor, 1.6, 1300, L.sun), founder: new CharacterCard(founder, 1.6, 1500, L.sun),
        };
        Object.values(cast).forEach((c) => scene.add(c.group));
        // FX
        const fx = new FxLayer(scene);
        fx.add("sparkle", { at: [0, 0.35, 0.25], f0: T.square1, size: 1.2 });
        fx.add("question", { at: [FOUNDRY[0] - 1.6, 2.35, -5.2], f0: T.squareQ, size: 0.8, color: "#ffffff" });
        fx.add("sparkle", { at: [-6.6, 1.9, 0.6], f0: T.loves, size: 1.4, color: "#ff8fb1" });
        fx.add("splash", { at: [0, -DEPTH + 0.3, 0], f0: T.hole - 2, size: 0.55, color: "#9fd8ff" });
        fx.add("exclaim", { at: [1.15, 1.95, 0.55], f0: T.wait, size: 0.6, color: "#ffd23f" });
        fx.add("stars", { at: [FOUNDRY[0] - 1.4, 2.0, -5.0], f0: T.doubled, size: 1.4 });
        for (let f0 = 0; f0 < T.total; f0 += 16) fx.add("smoke", { at: [FOUNDRY[0] + 2.2, 9.6 + (f0 % 32) * 0.02, FOUNDRY[2] - 0.5], f0, size: 2.4, dur: 60, seed: "sm" + f0 });
        const toon = toonifyScene(scene, makeToonUniforms(TOON_SETUPS.day, 2.4)); // painted cel shading on the whole world
        return { skyM, L, coverA, roundA, street, cart, cast, fx, clouds, shaftLamp, toon, wind, people, birds };
      }}
      update={(w, f, { fps: FPS }) => {
        const cam = rig.at(f, FPS);
        const t = f / FPS;
        // lighting per beat (key colour/intensity + sky follow the look timeline)
        const g = clamp((f - T.morning + 10) / 20) * (1 - clamp((f - T.explain + 10) / 20)), n = clamp((f - T.explain + 10) / 20) * (1 - clamp((f - T.summer + 10) / 20));
        const u = (w.skyM.material as THREE.ShaderMaterial).uniforms;
        (u.top.value as THREE.Color).set("#3f8ff0").lerp(new THREE.Color("#8c78c4"), g).lerp(new THREE.Color("#0f1648"), n);
        (u.horizon.value as THREE.Color).set("#bfe6ff").lerp(new THREE.Color("#ffd08a"), g).lerp(new THREE.Color("#3a3f8f"), n);
        (u.bottom.value as THREE.Color).copy(u.horizon.value);
        w.L.sun.color.set("#fff3e0").lerp(new THREE.Color("#ffab5e"), g).lerp(new THREE.Color("#9fb0ff"), n);
        w.L.sun.intensity = lerp(lerp(2.4, 3.0, g), 0.9, n);
        w.L.sun.position.set(lerp(lerp(-30, 60, g), 20, n), lerp(lerp(55, 14, g), 50, n), lerp(lerp(30, -25, g), 30, n));
        w.L.hemi.color.set("#b9d7ff").lerp(new THREE.Color("#c39ad8"), g).lerp(new THREE.Color("#3b44a8"), n);
        w.L.hemi.intensity = lerp(1.15, 0.7, n);
        (w.L.sun.parent as THREE.Scene).fog!.color.copy(u.horizon.value);
        if (n > 0) applyToonSetup(w.toon, f < T.summer - 10 ? TOON_SETUPS.golden : TOON_SETUPS.day, TOON_SETUPS.night, n, w.L.sun.intensity);
        else applyToonSetup(w.toon, TOON_SETUPS.day, TOON_SETUPS.golden, g, w.L.sun.intensity);
        w.wind.uWindTime.value = f / FPS;
        // hole-A cover
        const c = coverAt(f, T);
        const roundPhase = f >= T.summer;
        w.coverA.visible = !roundPhase && c.visible;
        w.coverA.position.set(...c.pos); w.coverA.rotation.set(...c.rot);
        w.shaftLamp.position.set(0.15, c.pos[1] + 0.9, 0.2);
        w.shaftLamp.intensity = f >= T.drop - 2 && f < T.hole + 9 ? 3.5 : 0;
        w.roundA.visible = roundPhase;
        for (const s of w.street) { s.sq.visible = !roundPhase; s.rd.visible = roundPhase; }
        // cart rolls in during the "cheaper / stack" beat
        const cx = lerp(-14, -6, ease.smoother(clamp((f - T.cart + 10) / 60)));
        w.cart.position.set(cx, 0, -1.6);
        // characters
        const lead = 2;
        const workerPose: Pose = f >= T.lifts && f < T.hole ? { armL: 150, armR: 150, elbowL: -10, elbowR: -10, expr: f >= T.slips ? "shock" : "neutral" }
          : f >= T.hole && f < T.explain ? { expr: "shock", look: [-0.3, 0.8], armL: f >= T.wait + 20 ? 70 : 20, armR: f >= T.wait + 20 ? 70 : 20 }
          : f < T.mayor ? { expr: "smug", armR: f >= T.square1 - 2 ? 60 : 8 } : { expr: "neutral" };
        w.cast.worker.setPose(mergePose(idlePose(f, FPS, 1), workerPose, { blink: blinkAt(f, FPS, "worker", [T.slips - lead, T.wait - lead]) }));
        w.cast.worker.place(1.15, 0, 0.55, cam.pos);
        const mx = lerp(-10.6, -8.0, clamp((f - T.mayor + 4) / (T.foundry - T.mayor)));
        const walking = f > T.mayor && f < T.foundry - 6;
        const mayorPos: V3 = f < T.cart - 10 ? [mx, 0, 1.8] : f < T.summer ? [-4.6, 0, 0.5] : [-1.9, 0, 1.4];
        w.cast.mayor.setPose(mergePose(walking ? walkPose(f, FPS, 2.4) : idlePose(f, FPS, 2), { expr: f >= T.loves - lead && f < T.summer ? "happy" : "neutral",
          armR: f >= T.loves - lead && f < T.loves + 40 ? 95 : 8, blink: blinkAt(f, FPS, "mayor", [T.loves - lead]) }));
        w.cast.mayor.place(...mayorPos, cam.pos);
        w.cast.founder.setPose(mergePose(idlePose(f, FPS, 3), {
          expr: f >= T.squareQ - lead && f < T.cart ? "laugh" : f >= T.oldf ? "smug" : "neutral",
          armL: f >= T.squareQ - lead && f < T.cart ? 40 + 15 * Math.sin(f * 0.5) : 6, armR: f >= T.squareQ - lead && f < T.cart ? 40 + 15 * Math.cos(f * 0.5) : 6,
          prop: f >= T.oldf ? "sign" : undefined, propText: "PRICES ×2", blink: blinkAt(f, FPS, "founder", [T.squareQ - lead, T.oldf]),
        }));
        w.cast.founder.place(FOUNDRY[0] - 1.6, 0, -5.4, cam.pos);
        w.cast.worker2.group.visible = f >= T.summer;
        w.cast.worker2.setPose(mergePose(walkPose(f, FPS, 1.8), { expr: "happy" }));
        w.cast.worker2.place(lerp(-5.2, -2.6, clamp((f - T.summer) / 70)), 0, -0.9, cam.pos);
        w.people.forEach((c, i) => { // background townsfolk: never-still world (measured micro-animation)
          const P = EXTRA_PATHS[i], u = f / T.total;
          c.setPose(mergePose(walkPose(f + P.seed * 7, FPS, 2.6), { expr: "neutral", blink: blinkAt(f, FPS, "x" + i), facing: P.x1 > P.x0 ? 1 : -1 }));
          c.place(lerp(P.x0, P.x1, u), 0, P.z, cam.pos);
        });
        w.birds.forEach((b, i) => {
          const tt = f / FPS + i * 4.1, x = -40 + ((tt * 3.2) % 80), y = 9 + i * 1.5 + Math.sin(tt * 0.8 + i) * 0.8;
          b.group.position.set(x, y, -6 - i * 3); b.group.rotation.y = Math.PI / 2; b.flap(f + i * 5);
        });
        for (const cl of w.clouds) { cl.position.x += 0; cl.lookAt(cam.pos[0], cl.position.y, cam.pos[2]); }
        w.fx.update(f, cam.pos);
        void t;
        return cam;
      }}
    />
  );
};

/** Night-blue explanation diagram (top-down view of hole + cover), synced to the words. */
const Diagram: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, width, height } = useU();
  const T = timing(fps);
  if (f < T.explain - 4 || f >= T.summer) return null;
  const inn = ease.outExpo(clamp((f - T.explain + 4) / 14)), out = clamp((f - T.summer + 10) / 10);
  const S = 300; // cover side in svg units
  const cx = 0, cy = 0;
  const diag = clamp((f - T.corner) / 16);
  const sq = f < T.circle - 6;
  // phase: square tilts onto its diagonal and slides through
  const tilt = ease.smoother(clamp((f - T.turn2) / 20)), slide = ease.inCubic(clamp((f - T.through) / 16));
  const ang = 45 * ease.smoother(clamp((f - T.turn2 + 4) / 16));
  // circle phase: tilted cover (a line of length S) spins but always hits the rim
  const spin = (f - T.circle) / fps;
  const hit = f >= T.never - 2;
  const lineLen = S, holeD = S * (HOLE / COVER);
  const box = width * 0.82, sc = box / 560;
  return (
    <AbsoluteFill style={{ opacity: inn * (1 - out), pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: (width - box) / 2, top: height * 0.1, width: box, height: box, background: "rgba(10,14,48,0.72)", borderRadius: 34 * u, border: `${3 * u}px solid rgba(160,190,255,0.35)` }}>
        <svg width={box} height={box} viewBox="-280 -280 560 560">
          {sq ? (
            <g>
              {/* the hole */}
              <rect x={-holeD / 2} y={-holeD / 2} width={holeD} height={holeD} fill="#05060f" stroke="#7d8cff" strokeWidth={4} strokeDasharray="14 10" />
              {/* the cover: tilting = projection thins, rotate to the diagonal, then slides through */}
              <g transform={`rotate(${ang}) scale(1 ${1 - 0.93 * tilt}) scale(${1 - 0.5 * slide})`} opacity={1 - slide}>
                <rect x={-S / 2} y={-S / 2} width={S} height={S} fill="#7a8394" stroke="#140c10" strokeWidth={6} rx={6} />
              </g>
              {/* side vs diagonal */}
              {f < T.turn2 + 4 && <>
                <line x1={-S / 2} y1={S / 2 + 34} x2={S / 2} y2={S / 2 + 34} stroke="#ffffff" strokeWidth={8} strokeLinecap="round" />
                <text x={0} y={S / 2 + 82} textAnchor="middle" fill="#fff" fontFamily={FONTS.heavy} fontSize={34}>side = 1</text>
                <line x1={-S / 2} y1={S / 2} x2={-S / 2 + S * diag} y2={S / 2 - S * diag} stroke="#ffd23f" strokeWidth={9} strokeLinecap="round" />
                {diag > 0.6 && <text x={-40} y={-30} fill="#ffd23f" fontFamily={FONTS.heavy} fontSize={40} opacity={clamp((diag - 0.6) * 3)}>corner = 1.41</text>}
              </>}
              {tilt > 0.9 && slide < 1 && <text x={0} y={-holeD / 2 - 24} textAnchor="middle" fill="#9dffb0" fontFamily={FONTS.heavy} fontSize={36}>fits!</text>}
            </g>
          ) : (
            <g opacity={clamp((f - T.circle + 6) / 10)}>
              <circle r={holeD / 2} fill="#05060f" stroke="#7d8cff" strokeWidth={4} strokeDasharray="14 10" />
              <g transform={`rotate(${spin * 140})`}>
                <line x1={-lineLen / 2} y1={0} x2={lineLen / 2} y2={0} stroke="#7a8394" strokeWidth={26} strokeLinecap="round" />
                <line x1={-lineLen / 2} y1={0} x2={lineLen / 2} y2={0} stroke="#140c10" strokeWidth={4} />
              </g>
              <text x={0} y={holeD / 2 + 70} textAnchor="middle" fill="#fff" fontFamily={FONTS.heavy} fontSize={34}>same width every way</text>
              {hit && <g transform={`scale(${springAt((f - T.never + 2) / fps, 3, 0.5)})`}><path d="M-60 -60 L60 60 M60 -60 L-60 60" stroke="#ff5a5a" strokeWidth={20} strokeLinecap="round" /></g>}
            </g>
          )}
        </svg>
      </div>
    </AbsoluteFill>
  );
};

export const manholeShort: ProjectDef = {
  id: "manhole", title: "Why manhole covers are round", defaultFormat: "short", fps: 30, audio: "manhole/master.wav",
  scenes: ({ fps }) => {
    const T = timing(fps);
    return [{
      id: "street", frames: T.total, innerCuts: [T.morning, T.hole + 9],
      cues: Object.fromEntries(Object.entries(T).filter(([, v]) => typeof v === "number")) as Record<string, number>,
      // big intended changes: FX slams + every camera TRAVEL (start/mid/end) so QA doesn't call fast travels glitches
      events: [T.square1, T.squareQ, T.loves, T.hole - 2, T.wait, T.explain - 4, T.circle - 6, T.never - 2, T.summer - 10, T.doubled, T.oldf,
        ...[T.mayor, T.foundry, T.cart, T.spring, T.morning, T.explain, T.summer, T.oldf].flatMap((x) => [x - 4, x + 6, x + 16]), T.drop, T.drop + 10],
      render: () => (<><World /><Diagram /><WordCaptions words={words} /></>),
    }];
  },
};
export const _m = { NOINK };
