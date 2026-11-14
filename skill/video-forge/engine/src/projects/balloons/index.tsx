/**
 * SHORT -- "Why Hot Air Balloons Only Fly at Sunrise" (9:16, 2K, 60 fps, our cast ours-v1, no names in the narration).
 *
 * A tourist wants to fly at lunchtime; at noon the pilot's test balloon is thrown around; at sunrise their balloon floats
 * smooth as glass and steers by picking wind layers. Why: the sun heats the ground into thermals that scramble the layers;
 * overnight the ground cools and the air lies still, and cold air even lifts better. Facts: public/balloons/claims.md.
 *
 * World: a Cappadocia-like valley built and lit in Blender (tools/blender/build_set.py --set valley --time dawn|noon),
 * the balloon modelled in Blender (--set balloon) and flown as a vehicle with two people in its basket; the story props
 * (test balloon, thermals, wind layers, the dawn fleet) are in ./props.ts.
 */
import * as THREE from "three";
import { Beat, Board, BoardApi, boardProject } from "../../lib/board";
import { BRANDS, KPose, StickHold } from "../../lib/characters/kinds";
import { castEntry } from "../../lib/characters/ours";
import type { BakedManifest } from "../../lib/three/baked";
import { LightKey, tweak } from "../../lib/three/lightplan";
import { NOINK } from "../../lib/three/post";
import { canvasTexture } from "../../lib/three/textures";
import { clamp } from "../../lib/time";
import DAWN0 from "../../../public/sets/valley_dawn/set.json";
import NOON0 from "../../../public/sets/valley_noon/set.json";
import BALLOON from "../../../public/sets/balloon/balloon.json";
import WORDS from "./words.json";
import { fleet, testBalloon, thermals, windLayers } from "./props";

type V3 = [number, number, number];
const DAWN = DAWN0 as unknown as BakedManifest, NOON = NOON0 as unknown as BakedManifest;
const mk = (M: BakedManifest, k: string, d: V3 = [0, 0, 0]): V3 => { const v = M.marks[k] as number[]; return [v[0] + d[0], v[1] + d[1], v[2] + d[2]]; };
const keyOf = (M: BakedManifest, base: LightKey): LightKey => ({ ...base, sunDir: M.sun!.dir as V3, cookie: 0 });
const VFOG: [number, number] = [140, 3200]; // a 3 km valley: the default 60-320 m fog would swallow it
const KPRE = { ...keyOf(DAWN, tweak("night", { exposure: 1.15, grade: { saturation: 1.1 } })), fog: VFOG }, KDAWN = { ...keyOf(DAWN, tweak("golden", { grade: { saturation: 1.12 } })), fog: VFOG }, KNOON = { ...keyOf(NOON, tweak("day", { exposure: 1.04, grade: { saturation: 1.0 } })), fog: [220, 4200] as [number, number] };
const FIELD = mk(DAWN, "field"), PILOT = mk(DAWN, "pilot"), TOURIST = mk(DAWN, "tourist"), LINE = mk(DAWN, "powerline");
const NFIELD = mk(NOON, "field"), NPILOT = mk(NOON, "pilot"), NTOURIST = mk(NOON, "tourist");
const SOUTH: V3 = [0, 0, 40]; // facing the camera's side of the field
const P0: V3 = [FIELD[0], FIELD[1], FIELD[2]]; // the hero balloon: standing on the field, lifting off at sunrise, drifting toward the river

// ------------------------------------------------------------------------------------------------ acting
const H = (item: StickHold["item"], more: Partial<StickHold> = {}): StickHold => ({ item, hand: "R", ...more });
const burn: KPose = { limbs: { handR: [0.35, 2.0] }, hands: { R: "fist" }, expr: "focused" }; // a hand up on the burner valve
const talk = (expr: KPose["expr"]): KPose => ({ limbs: { handR: [0.85, 1.05] }, hands: { R: "open" }, expr });

// ------------------------------------------------------------------------------------------------ small props
const clean = <T extends THREE.Object3D>(o: T) => { o.traverse((m) => m.layers.set(NOINK)); return o; };
/** "4:30" on a glowing alarm-clock face that floats beside the sleepy tourist */
const clock430 = () => { const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.4), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTexture("clock430", 720, 400, (c) => {
    c.fillStyle = "#1b1d24"; c.beginPath(); c.roundRect(10, 10, 700, 380, 60); c.fill(); c.strokeStyle = "#f4efe6"; c.lineWidth = 14; c.stroke();
    c.fillStyle = "#ff5a4a"; c.font = "900 230px Arial Black, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("4:30", 360, 190);
    c.fillStyle = "#f4efe6"; c.font = "800 56px Arial, sans-serif"; c.fillText("AM", 600, 320); }) }));
  g.add(m); return { group: clean(g), update(f: number, fps: number) { m.rotation.z = 0.06 * Math.sin(f / fps * 9) * (Math.sin(f / fps * 2) > 0.3 ? 1 : 0.2); } }; };
/** the burner's flame burst (a bright cone) above the basket, attached to the hero balloon each frame */
const flame = (api: BoardApi) => { const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.5, 0.5), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.2, 20, 1, true), mat); core.position.y = 1.1; g.add(core);
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.5, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); inner.position.y = 0.8; g.add(inner);
  const bursts = ["burned", "cold"];
  return { group: clean(g), update(f: number, fps: number) {
    let k = 0; for (const b of bursts) { const a = api.T[b]; if (a !== undefined) { const u = (f - a) / fps; if (u > -0.05 && u < 1.6) k = Math.max(k, Math.min(1, u * 8) * (u > 1.2 ? (1.6 - u) / 0.4 : 1)); } }
    const fl = 1 + 0.12 * Math.sin(f / fps * 37) + 0.08 * Math.sin(f / fps * 61);
    mat.opacity = 0.85 * k; (inner.material as THREE.MeshBasicMaterial).opacity = k; g.scale.set(1, (0.6 + 0.6 * k) * fl, 1);
    const v = api.scene.getObjectByName("vehicle:balloon"); if (v) { v.updateMatrixWorld(); g.position.copy(new THREE.Vector3(...(BALLOON.burner as V3)).applyMatrix4(v.matrixWorld)); } } }; };

// ------------------------------------------------------------------------------------------------ the dawn fleet (spots along the wide view)
const FLEET: V3[] = (() => { const out: V3[] = []; let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) { const z = -40 - Math.pow(r(), 0.8) * 520, x = (r() - 0.5) * (120 + -z * 0.9), y = 18 + r() * (60 + -z * 0.35); out.push([x, y, z]); }
  out.push([-26, 6, -20], [22, 9, -34], [-40, 14, -60]); return out; })();

// ------------------------------------------------------------------------------------------------ the storyboard
const beats: Beat[] = [
  // ---- 1 HOOK: 4:30 in the dark, the balloon glowing on the field, the tourist yawning
  { at: 0, id: "open", place: "dawn", key: KPRE, music: "build", shot: { size: "medium", on: "tourist", angle: 0, move: "push", amount: 0.12 },
    act: { tourist: { at: TOURIST, pose: { expr: "yawn" }, face: SOUTH, light: 0.75 }, pilot: { at: PILOT, pose: { expr: "happy" }, face: SOUTH, light: 0.75 } },
    gag: { prop: "clock", id: "clock", origin: "center", at: [TOURIST[0] + 0.05, 1.95, TOURIST[2] + 0.35], in: "pop", until: "he" } },
  // ---- 2 he wanted warm and sunny: noon, sunglasses, the sun overhead
  { at: "he", id: "he", place: "noon", key: KNOON, shot: { size: "medium", on: "tourist", angle: 0, move: "push", amount: 0.26 },
    act: { tourist: { at: NTOURIST, pose: { limbs: { handR: [0.6, 1.8] }, hands: { R: "point" }, expr: "hopeful" }, face: SOUTH, light: 1 }, pilot: { at: NPILOT, pose: { expr: "smug" }, face: SOUTH, light: 1 } } },
  // ---- 3 the pilot: "At lunch, this balloon goes wherever the sun wants."
  { at: "at#3", id: "lunch", shot: { size: "close", on: "pilot", angle: 0, move: "push", amount: 0.2 }, act: { pilot: { pose: { limbs: { handR: [0.58, 1.32] }, hands: { R: "open" }, expr: "confident" }, talk: true } } },
  // ---- 4 at noon he lets go of a tiny test balloon
  { at: "so#2", id: "so2", shot: { size: "full", on: "pilot", angle: 15, move: "push", amount: 0.26 },
    act: { pilot: { pose: { limbs: { handL: [0.8, 0.9] }, hands: { L: "fist" }, expr: "focused" }, face: SOUTH }, tourist: { face: LINE } },
    gag: { prop: "test", id: "test", at: [NPILOT[0], 0, NPILOT[2]], in: "none" } },
  { at: "let", id: "let", act: { pilot: { pose: { limbs: { handL: [0.85, 1.25] }, hands: { L: "open" }, expr: "happy" } } } },
  // ---- 5 shot up, dropped like a stone, zigzagged toward the power lines
  { at: "it#2", id: "shot0", shot: { size: "full", on: [NPILOT[0] + 3, 6.5, NPILOT[2] - 1], h: 12, angle: -105, move: "push", amount: 0.14 } },
  { at: "shot", id: "shot" }, { at: "dropped", id: "dropped" }, { at: "zigzagged", id: "zigzagged" }, { at: "power", id: "power" },
  // ---- 6 the tourist: "Okay. That looked terrible."
  { at: "okay", id: "okay", shot: { size: "close", on: "tourist", angle: 0, move: "push", amount: 0.26 }, act: { tourist: { pose: { expr: "shock" }, face: SOUTH, talk: true } } },
  // ---- 7 the next morning: lift-off at sunrise, the valley, the other balloons rising
  { at: "the#7", id: "took", place: "dawn", key: KDAWN, music: "full", shot: { size: "wide", move: "push", amount: 0.18 },
    act: { tourist: { seat: { vehicle: "balloon", seat: "passenger" }, pose: { expr: "amazed" }, light: 1 }, pilot: { seat: { vehicle: "balloon", seat: "pilot" }, pose: { expr: "happy" }, light: 1 } },
    gag: [{ prop: "fleetA", id: "fleetA", at: [0, 0, 0], in: "none", until: "whats" }, { prop: "flame", id: "flame", at: [0, 0, 0], in: "none" }] },
  { at: "glass", id: "glass" },
  // ---- 8 in the basket: no wheel, no rudder
  { at: "the#9", id: "never", shot: { size: "two", on: ["pilot", "tourist"], follow: "pilot", angle: 0, move: "push", amount: 0.2 }, act: { pilot: { pose: { limbs: { handR: [0.6, 0.9], handL: [0.6, 0.9] }, hands: { R: "open", L: "open" }, expr: "smug" } } } },
  // ---- 9 he burns a little higher, the balloon swings toward the river
  { at: "he#3", id: "burned", shot: { size: "medium", on: "pilot", follow: "pilot", angle: -10, move: "push", amount: 0.2 }, act: { pilot: { pose: burn } } },
  { at: "and#5", id: "swing", shot: { size: "full", on: "tourist", follow: "tourist", h: 30, angle: 8, move: "push", amount: 0.1 }, act: { pilot: { pose: { expr: "happy" } } } },
  // ---- 10 the tourist: "Wait, how did we just turn?"
  { at: "wait", id: "turn", shot: { size: "medium", on: ["pilot", "tourist"], follow: "tourist", angle: 0, move: "push", amount: 0.22 }, act: { tourist: { pose: { limbs: { handL: [0.55, 1.95] }, hands: { L: "open" }, expr: "amazed" }, talk: true }, pilot: { pose: { expr: "smug" } } } },
  // ---- 11 every layer of wind blows a different way: the ribbons
  { at: "every", id: "layers", shot: { size: "full", on: "tourist", follow: "tourist", h: 34, angle: 20, move: "push", amount: 0.1 }, gag: { prop: "windDawn", id: "windDawn", at: [P0[0] - 6, 0, P0[2] - 72], in: "none" } },
  // ---- 12 same valley, same balloon: why was noon so wild? (the test balloon caught at the line)
  { at: "same", id: "same", place: "noon", key: KNOON, music: "thin", shot: { size: "full", on: [LINE[0] - 3, 7, LINE[2]], h: 12, angle: -60, move: "push", amount: 0.2 } },
  // ---- 13 the sun bakes the ground; dark rocks heat up faster than grass
  { at: "you", id: "you", music: "calm", shot: { size: "full", on: [NFIELD[0] - 2, 1, NFIELD[2] - 10], h: 14, angle: 0, move: "push", amount: 0.14 },
    act: { tourist: { at: NTOURIST, face: [NTOURIST[0] - 2, 0, NTOURIST[2] - 10] }, pilot: { at: NPILOT, face: [NPILOT[0] - 2, 0, NPILOT[2] - 10] } },
    gag: [{ prop: "thermals", id: "thermals", at: [0, 0, 0], in: "none" }, { prop: "windNoon", id: "windNoon", at: [NFIELD[0] - 2, 0, NFIELD[2] - 16], in: "none" }] },
  { at: "dark", id: "dark" },
  // ---- 14 each hot spot shoots a bubble upward and scrambles the layers
  { at: "each", id: "each", shot: { size: "full", on: [NFIELD[0] - 2, 12, NFIELD[2] - 12], h: 32, angle: 6, move: "push", amount: 0.12 } },
  { at: "scrambles", id: "scrambles" },
  // ---- 15 so what's different at 4:30?
  { at: "so#5", id: "whats", place: "dawn", key: KPRE, shot: { size: "wide", move: "push", amount: 0.12 },
    act: { tourist: { seat: { vehicle: "balloon", seat: "passenger" }, pose: { expr: "happy" } }, pilot: { seat: { vehicle: "balloon", seat: "pilot" }, pose: { expr: "happy" } } } },
  // ---- 16 overnight the ground cools: the air lies flat and still, like a lake
  { at: "overnight", id: "overnight", key: KDAWN, shot: { size: "full", on: "tourist", follow: "tourist", h: 40, angle: 14, move: "push", amount: 0.1 }, gag: { prop: "windCalm", id: "windCalm", at: [P0[0] - 18, 0, P0[2] - 92], in: "none" } },
  // ---- 17 cold air even gives it extra lift
  { at: "cold", id: "cold", shot: { size: "medium", on: "pilot", follow: "pilot", angle: -12, move: "push", amount: 0.2 }, act: { pilot: { pose: burn } } },
  // ---- 18 a hundred balloons at first light
  { at: "thats", id: "fleet", shot: { size: "wide", move: "crane", amount: 0.3 }, gag: { prop: "fleetB", id: "fleetB", at: [0, 0, 0], in: "none" }, act: { pilot: { pose: { expr: "happy" } }, tourist: { pose: { expr: "amazed" } } } },
  // ---- 19 he's racing the sun
  { at: "so#7", id: "end", music: "full", shot: { size: "two", on: ["pilot", "tourist"], follow: "pilot", angle: 0, move: "push", amount: 0.2 }, act: { pilot: { pose: { limbs: { handR: [0.9, 1.2] }, hands: { R: "point" }, expr: "wink" } }, tourist: { pose: { expr: "happy" } } } },
];

// (P0, the hero balloon's field spot, is defined with the marks above)
const board: Board = {
  id: "balloons", title: "Why Hot Air Balloons Only Fly at Sunrise", words: WORDS, brand: { ...BRANDS.ours, shine: false, torsoShine: false, ink: "#1a1012" }, voOffset: 0, tail: 0.6,
  walkRate: 3.6, placeSpacing: 6000,
  cast: {
    tourist: castEntry("tourist", { hat: { style: "cap", color: "#f0d58a", accent: "#e07aa8" }, hair: { style: "messy", color: "#6a3d22" }, marks: [] }),
    pilot: castEntry("pilot", { hat: { style: "beanie", color: "#c0392b", accent: "#f4efe6" }, top: { color: "#2f6f4a", style: "jacket", accent: "#f5c21b" }, shades: undefined, stache: "#4a3020" }),
  },
  places: {
    dawn: { set: "baked", baked: { dir: "sets/valley_dawn", manifest: DAWN },
      vehicles: { balloon: { kind: "glb", opts: { url: "sets/balloon/balloon.glb", ...BALLOON, look: "pbr" }, lights: true, heading: 0, path: [P0, [P0[0], P0[1] + 0.01, P0[2]]], from: "open", to: "took",
        then: [{ path: [P0, [P0[0] + 1, 14, P0[2] - 6], [P0[0] + 3, 30, P0[2] - 16]], from: "took", to: "never", ease: "start" },
          { path: [[P0[0] + 3, 30, P0[2] - 16], [P0[0] + 2, 38, P0[2] - 34], [P0[0] - 8, 46, P0[2] - 60]], from: "burned", to: "layers" },
          { path: [[P0[0] - 8, 46, P0[2] - 60], [P0[0] - 14, 54, P0[2] - 80]], from: "layers", to: "same" },
          { path: [P0, [P0[0], P0[1] + 0.01, P0[2]]], from: "whats", to: "overnight" },
          { path: [[P0[0] - 14, 54, P0[2] - 80], [P0[0] - 20, 64, P0[2] - 100], [P0[0] - 24, 80, P0[2] - 118]], from: "overnight", to: "end" },
          { path: [[P0[0] - 24, 80, P0[2] - 118], [P0[0] - 26, 86, P0[2] - 126]], from: "end", to: "end" }] } } },
    noon: { set: "baked", baked: { dir: "sets/valley_noon", manifest: NOON } },
  },
  props: {
    clock: clock430,
    flame,
    test: (api) => testBalloon(api, [LINE[0] - NPILOT[0] - 3, 7.5, LINE[2] - NPILOT[2]]),
    thermals: (api) => thermals(api, [[NFIELD[0] - 9, NFIELD[1], NFIELD[2] - 14], [NFIELD[0] + 7, NFIELD[1], NFIELD[2] - 20], [NFIELD[0] - 18, NFIELD[1], NFIELD[2] - 26], [NFIELD[0] + 16, NFIELD[1], NFIELD[2] - 10]]),
    windNoon: (api) => windLayers(api, { show: ["you", "whats"], heights: [NFIELD[1] + 10, NFIELD[1] + 19, NFIELD[1] + 28], scrambleFrom: "each" }),
    windDawn: (api) => windLayers(api, { show: ["layers", "same"], width: 140, heights: [40, 49, 58], dirs: [1, -1, 1] }),
    windCalm: (api) => windLayers(api, { show: ["overnight", "cold"], width: 160, heights: [0, -4.6, -9.2], dirs: [1, -1, 1], ride: { name: "vehicle:balloon", offset: [0, -3.6, -10] } }),
    fleetA: (api) => fleet(api, { spots: FLEET, from: "took" }),
    fleetB: (api) => fleet(api, { spots: FLEET, from: "fleet", seed: 3 }),
  },
  beats,
};
void clamp;
export const balloonsShort = boardProject(board);
export const balloonsBoard = board;

/** The cover (no text): the basket high over the valley at sunrise, the fleet around it.
 *  `node tools/render.mjs --project balloonsthumb --stills 20 --scale 1 --clean` */
const AIR: V3 = [P0[0] - 6, 72, P0[2] - 100]; /* clear of the fleet balloon under (-20, 33, -107) */
/* a dense crowd of balloons for the cover only, placed by viewing angle from the basket: in the sky round and above
   the two heads (never behind a face), 70-450 m away so they read as many balloons, not one giant */
const COVER_FLEET: V3[] = (() => { const out: V3[] = []; let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  while (out.length < 30) { const d = 70 + r() * 380, a = (r() - 0.5) * 0.46, e = -0.04 + r() * 0.34;
    if (Math.abs(a) < 0.13 && e < 0.14) continue;
    out.push([AIR[0] + a * d, AIR[1] + 1.5 + e * d - 16, AIR[2] + 4 - d]); }
  return out; })();
export const balloonsThumbBoard: Board = { ...board, id: "balloonsthumb", title: "balloons cover",
  words: [{ word: "cover", start: 0, end: 0.4 }, { word: "end", start: 1.2, end: 1.6 }], tail: 0.4,
  places: { dawn: { set: "baked", baked: { dir: "sets/valley_dawn", manifest: DAWN },
    vehicles: { balloon: { kind: "glb", opts: { url: "sets/balloon/balloon.glb", ...BALLOON, look: "pbr" }, lights: true, heading: 0, path: [AIR, [AIR[0], AIR[1] + 0.01, AIR[2]]] } } } },
  beats: [{ at: 0, id: "cover", place: "dawn", key: KDAWN, shot: { size: "close", on: ["pilot", "tourist"], angle: 0, move: "push", amount: 0.01 },
    act: { tourist: { seat: { vehicle: "balloon", seat: "passenger" }, pose: { limbs: { handR: [0.9, 1.5] }, hands: { R: "point" }, expr: "amazed" } },
      pilot: { seat: { vehicle: "balloon", seat: "pilot" }, pose: { expr: "happy" } } },
    gag: [{ prop: "fleetA", id: "fleetA", at: [0, 0, 0], in: "none" }, { prop: "fleetC", id: "fleetC", at: [0, 0, 0], in: "none" }] }],
  props: { ...board.props, fleetC: (api) => fleet(api, { spots: COVER_FLEET, from: "cover", seed: 5 }) },
};
export const balloonsThumb = boardProject(balloonsThumbBoard);
