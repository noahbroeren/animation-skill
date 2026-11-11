/**
 * PROOF SHORT (toonworld style, STICK cast) -- "Why Elevators Don't Fall" (9:16, ~60 s, ElevenLabs VO).
 *
 * Story engine: story/examples/elevator.txt (lint 100/100, title 63 = x1.28 on the measured title data, hook 63.2).
 * Formula (references/styles/toonworld-explainer.md): absurd act as the hook ("ordered the only rope holding him cut")
 * -> stakes (flashback: ropes snapped, platforms fell) -> setting (5-6 floors of stairs) -> mocker ("He's finished.")
 * -> the act (hat tip, axe) -> incident (drop... and stop) -> "Wait, what?" -> "You see," mechanism (night-blue
 * diagram) -> ironic payoff (he died decades before the skyscrapers his cut rope made possible), ends on the last word.
 * Cast: the new stick kinds with accessories (lib/characters/kinds.ts StickSpec: hat/hair/facial hair/coat/neckwear,
 * held props, hat tip). Every timing comes from words.json (one source of truth for picture, captions and sound).
 * Facts (public/elevator/claims.md): Otis, New York Crystal Palace, 1854, hoisting rope cut with an axe, platform
 * dropped a few inches and stopped; wagon spring on top, bowed by the rope's tension, straightens when the rope
 * goes slack and its ends engage ratchet teeth on the guide rails; first passenger elevator 23 Mar 1857 in the
 * five-storey E. V. Haughwout store; Otis died 1861; first skyscraper 1885.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { cameraRig, CamKey, V3 } from "../../lib/camera";
import { blinkAt, idlePose } from "../../lib/characters/toon";
import { cueAt, KIND_PRESETS, KPose, StickSpec } from "../../lib/characters/kinds";
import { deepMerge, LOOKS, lookTimeline } from "../../lib/look";
import { ProjectDef } from "../../lib/project";
import { CharacterCard, CrowdPool } from "../../lib/three/cast";
import { FxLayer } from "../../lib/three/fx";
import { NOINK } from "../../lib/three/post";
import { Stage3D } from "../../lib/three/Stage3D";
import type { ShotSubject } from "../../lib/three/audit";
import { canvasTexture, flat, paint } from "../../lib/three/textures";
import { applyToonSetup, makeToonUniforms, TOON_SETUPS, toonifyScene, windSway, windUniforms } from "../../lib/three/shaders";
import { bird, blocksShot, cloudCard, fence, house, lampPost, lights, motes, sky, tree } from "../../lib/three/world";
import { FONTS, LowerThird, useU, WordCaptions } from "../../lib/two/text";
import { clamp, ease, lerp, springAt } from "../../lib/time";
import WORDS from "./words.json";
import CUES from "./cues.json";
import { elevatorThumbs } from "./thumbs";

const OFF = 0.1; // VO starts 0.1 s into the mix
const words = WORDS.map((w) => ({ ...w, start: w.start + OFF, end: w.end + OFF }));
const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const W = (txt: string, from = 0) => { const i = words.findIndex((w, k) => k >= from && clean(w.word).startsWith(txt)); if (i < 0) throw new Error("word " + txt); return i; };
const at = (i: number) => words[i].start;
const HECK = [W("hes"), W("finished")];
const HECK_CUES = CUES.mouthCues.map((c) => ({ ...c, start: c.start + OFF, end: c.end + OFF }))
  .filter((c) => c.end > words[HECK[0]].start && c.start < words[HECK[1]].end)
  .concat([{ start: words[HECK[1]].end, end: 1e9, value: "X" }]);

export const timing = (fps: number) => {
  const F = (s: number) => Math.round(s * fps);
  return {
    F,
    total: F(words[words.length - 1].end + 0.9),
    rope1: F(at(W("rope"))), cut1: F(at(W("cut"))),
    back: F(at(W("back")) - 0.1), snap0: F(at(W("snapped"))), fell: F(at(W("fell"))), everyone: F(at(W("everyone"))),
    nobody: F(at(W("nobody")) - 0.25), five: F(at(W("five"))), stairs: F(at(W("stairs"))),
    heck: F(at(HECK[0]) - 0.12), his: F(at(W("his", 50)) - 0.08), elisha: F(at(W("elisha"))),
    tipped: F(at(W("tipped"))), helper: F(at(W("the", 60)) - 0.04), swung: F(at(W("swung"))), axe: F(at(W("axe"))),
    snapped: F(at(W("snapped", 60))), platform2: F(at(W("the", 68)) - 0.06), dropped: F(at(W("dropped"))), stopped: F(at(W("stopped", 70))),
    few: F(at(W("just"))), wait: F(at(W("wait"))), nothing: F(at(W("nothing"))),
    yousee: F(at(W("you", 80)) - 0.05), wagon: F(at(W("wagon"))), spring: F(at(W("spring"))), bent: F(at(W("bent"))), pull: F(at(W("pull"))),
    moment: F(at(W("moment"))), slack: F(at(W("slack"))), snapFlat: F(at(W("snapped", 100))), flat: F(at(W("flat"))),
    jammed: F(at(W("jammed"))), teeth: F(at(W("teeth"))), so2: F(at(W("so", 120))), exactly: F(at(W("exactly"))), stop: F(at(W("stop", 125))),
    three: F(at(W("three")) - 0.08), first: F(at(W("first", 140))), elevator2: F(at(W("elevator", 140))),
    andOtis: F(at(W("and", 145)) - 0.08), died: F(at(W("died"))), y1861: F(at(W("1861"))), decades: F(at(W("decades"))),
    sky: F(at(W("skyscraper"))), possible: F(at(W("possible"))),
  };
};
type TT = ReturnType<typeof timing>;
const mp = (a: object, b: KPose): KPose => ({ ...(a as KPose), ...b });

// ------------------------------------------------------------------------------------------------ cast (new stick kinds)
const K = KIND_PRESETS;
const otis: StickSpec = { ...(K.stickGent as StickSpec), id: "otis", stache: "#5a3a26", hair: { style: "side", color: "#5a3a26" } };
const helper: StickSpec = { ...(K.stickWorker as StickSpec), id: "helper", hat: { style: "cap", color: "#3d6fb0" }, neckwear: { style: "scarf", color: "#e2a33a" } };
const heckler: StickSpec = { id: "heckler", kind: "stick", color: "#4a3a2e", head: "#fbf6ee", hat: { style: "bowler", color: "#3b2f2a" }, beard: "#6b4a30", coat: { color: "#6b8a5a", buttons: "#2b2230" }, build: "stout" };
const lady: StickSpec = { ...(K.stickLady as StickSpec), id: "lady" };
const kid: StickSpec = { ...(K.stickKid as StickSpec), id: "kid" };
const prof: StickSpec = { ...(K.stickProf as StickSpec), id: "prof" };
const hoistMan: StickSpec = { id: "hoistMan", kind: "stick", color: "#3a3a44", head: "#fbf6ee", hat: { style: "cap", color: "#c0392b" }, hair: { style: "tuft", color: "#2a2228" } };
const EXTRA: StickSpec[] = [
  { id: "e1", kind: "stick", color: "#2f4a6a", head: "#fbf6ee", hat: { style: "top", color: "#2a2a33", band: "#4a6fa5" }, coat: { color: "#556b8a" } },
  { id: "e2", kind: "stick", color: "#5a2f3f", head: "#fbf6ee", hair: { style: "long", color: "#3a2418" }, skirt: "#d0607a", cheeks: true },
  { id: "e3", kind: "stick", color: "#3a3a3a", head: "#fbf6ee", hat: { style: "boater", color: "#e9d48a" }, stache: "#2a2228", neckwear: { style: "tie", color: "#2f8f6a" } },
  { id: "e4", kind: "stick", color: "#6a4a2a", head: "#fbf6ee", hat: { style: "bowler", color: "#4a3a2a" }, coat: { color: "#8a6a3a" } },
  { id: "e5", kind: "stick", color: "#2a5a5a", head: "#fbf6ee", hair: { style: "curly", color: "#2a2228" }, skirt: "#3fa0a0" },
  { id: "e6", kind: "stick", color: "#3b3340", head: "#fbf6ee", hat: { style: "top", color: "#5a2f2f" }, beard: "#d9d4cc", coat: { color: "#4a4a52", tails: true } },
];

// ------------------------------------------------------------------------------------------------ geometry constants
const POST_X = 1.15, POST_W = 0.26, TOWER_H = 9.6, PULLEY: V3 = [0, 9.2, 0], PULLEY_R = 0.34, WINCH: V3 = [2.7, 0.55, 0.0];
const PY_HIGH = 5.0, DROP = 0.2, FRAME_H = 2.55; // platform height, drop on the stop, crosshead above the deck
const TOOTH_TIP = POST_X - POST_W / 2 - 0.085;
const SX = 80; // the street (another place in the same world)
const WH: V3 = [SX - 9, 0, -9], STORE: V3 = [SX + 9, 0, -9.5], SKY_Z = -150;
const lam = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(o);

/** Platform height as a pure function of frame (hook: high; drop on "dropped", hard stop + small bounce). */
function platformY(f: number, T: TT) {
  if (f < T.dropped - 3) return PY_HIGH;
  const t = (f - (T.dropped - 3)) / 30;
  const fall = 0.5 * 9.81 * t * t;
  if (fall < DROP) return PY_HIGH - fall;
  const tb = (f - (T.dropped - 3)) / 30 - Math.sqrt((2 * DROP) / 9.81);
  return PY_HIGH - DROP + 0.035 * Math.exp(-tb * 9) * Math.abs(Math.sin(tb * 30)); // jolt bounce on the teeth
}
/** Spring state 0 = bowed under rope tension (ends clear of the teeth), 1 = flat (ends in the teeth). */
const springFlat = (f: number, T: TT) => ease.outBack(clamp((f - (T.dropped - 3)) / 5));
/** Rope state: 0 intact, 1 cut. */
const ropeCut = (f: number, T: TT) => (f >= T.snapped ? 1 : 0);

/** Helper (axe) pose: idle -> wind-up on "swung" -> strike on "snapped" -> recoil. */
function helperPose(f: number, T: TT): KPose {
  const wind = ease.smoother(clamp((f - T.swung) / 14));
  const strike = ease.inCubic(clamp((f - (T.snapped - 5)) / 5));
  const handR: [number, number] = [lerp(lerp(1.0, -0.3, wind), 1.9, strike), lerp(lerp(1.6, 3.3, wind), 1.45, strike)];
  const handL: [number, number] = [lerp(lerp(0.7, -0.5, wind), 1.6, strike), lerp(lerp(1.5, 3.0, wind), 1.4, strike)];
  const prevF = f - 2;
  const pw = ease.smoother(clamp((prevF - T.swung) / 14)), ps = ease.inCubic(clamp((prevF - (T.snapped - 5)) / 5));
  const prev: KPose = { view: "side", limbs: { handR: [lerp(lerp(1.0, -0.3, pw), 1.9, ps), lerp(lerp(1.6, 3.3, pw), 1.45, ps)], handL: [lerp(lerp(0.7, -0.5, pw), 1.6, ps), lerp(lerp(1.5, 3.0, pw), 1.4, ps)] } };
  return {
    view: "side", facing: 1, limbs: { handR, handL }, hold: { item: "axe", angle: lerp(-20, 25, strike), len: 2.3 },
    lean: lerp(lerp(0, -10, wind), 14, strike), expr: f >= T.snapped + 6 ? "shock" : f >= T.swung ? "determined" : "neutral",
    prev: strike > 0 && strike < 1 ? prev : undefined,
  };
}

const World: React.FC = () => {
  const { fps } = useVideoConfig();
  const T = timing(fps);
  // measured against the channel aggregate (vfa qa gap.md, iteration 1): highlights were green (a -9.4 vs +1.9),
  // shadows too magenta (a 14.7 vs 10.6), saturation .54 vs .48, background too sharp (DOF ratio 1.13 vs 1.95)
  const fix = { grade: { highlightTint: [0.03, -0.004, -0.03], shadowTint: [0.022, 0.01, 0.0], saturation: 1.14 }, dof: { enabled: true, maxBlur: 9, aperture: 0.9 } }; // iter 3: warmer highs, more DOF
  const day = deepMerge(LOOKS["toonworld-day"], fix), golden = deepMerge(LOOKS["toonworld-golden"], { ...fix, grade: { saturation: 1.14, highlightTint: [0.02, -0.01, 0.01] } });
  const night = LOOKS["toonworld-night"];
  const cu = (l: typeof day, focusBlur = 12) => deepMerge(l, { dof: { enabled: true, maxBlur: focusBlur, aperture: 1.2 } });
  const look = lookTimeline([
    [0, day], [T.back, golden], [T.nobody, golden], [T.heck, cu(day)], [T.his, day], [T.few, cu(day)], [T.wait, cu(day)], [T.nothing, day],
    [T.yousee, night], [T.three, day], [T.andOtis, cu(golden, 9)], [T.decades, golden],
  ], 14);
  const DZ = 10, PRE = 5, TRAVEL = 44, HOLD = 1e6, H = 22;
  const seq = (ks: CamKey[]) => ks.map((k, i) => (i && !k.cut && !k.dissolve ? { ...k, glide: Math.min(k.glide ?? TRAVEL, k.f - ks[i - 1].f) } : k));
  const PH = PY_HIGH, PL = PY_HIGH - DROP;
  const keys = seq([
    // HOOK: low wide angle, the man high on the platform + the helper by the rope with the axe (first frame = the act)
    // audit: on a 6 s hold the constant push + two punches moved ~38 % closer and the helper fell out at the bottom;
    // a mid-hold key re-starts the push (holds push from their last key) and the lower aim keeps the ground in
    { f: 0, pos: [6.4, 1.5, 12.0], look: [1.1, 3.6, 0], fov: 46 },
    { f: 100, pos: [5.9, 1.5, 11.0], look: [1.1, 3.7, 0], glide: HOLD },
    { f: T.back - PRE, pos: [5.6, 1.6, 10.3], look: [1.05, 3.8, 0], glide: HOLD },
    // flashback: an old warehouse hoist, the rope snaps, the platform falls (golden)
    { f: T.back, pos: [WH[0] + 4.2, 6.2, 2.2], look: [WH[0], 7.4, -5.6], fov: 40, dissolve: DZ },
    { f: T.snap0 + 4, pos: [WH[0] + 4.0, 6.0, 1.8], look: [WH[0], 7.2, -5.6], glide: HOLD },
    { f: T.fell + 2, pos: [WH[0] + 4.6, 2.6, 2.6], look: [WH[0], 1.2, -5.6], glide: 34 }, // tilt down WITH the fall (audit: a 16 f tilt let him fall out of frame first)
    { f: T.nobody - PRE, pos: [WH[0] + 4.0, 2.3, 2.0], look: [WH[0], 1.0, -5.6], glide: HOLD },
    // the street of 5-6 floor buildings: crane up the facade while the floors count
    { f: T.nobody, pos: [SX - 5.6, 1.6, 4.4], look: [SX - 6.4, 2.6, -6], fov: 42, dissolve: DZ }, // the 6-floor house at i = 3
    { f: T.stairs + 4, pos: [SX - 5.6, 17.0, 7.4], look: [SX - 6.4, 16.2, -6], glide: T.stairs + 4 - T.nobody - 6 },
    // "He's finished." - the mocker in the crowd, tower soft behind him
    { f: T.heck, pos: [-2.9, 1.7, 7.3], look: [-1.6, 1.75, 4.3], fov: 34, focus: 3.2, dissolve: DZ },
    { f: T.his - 2, pos: [-2.8, 1.7, 7.0], look: [-1.6, 1.75, 4.3], glide: HOLD },
    // "His name was Elisha Otis." travel up to the man on the platform
    { f: T.his + H, pos: [2.0, PH + 1.6, 4.2], look: [-0.2, PH + 1.15, 0], fov: 36, glide: TRAVEL },
    { f: T.helper - 1, pos: [1.7, PH + 1.5, 3.7], look: [-0.2, PH + 1.15, 0], glide: HOLD },
    // CUT on "the helper": low angle on the axe and the rope
    { f: T.helper, pos: [5.6, 1.5, 6.8], look: [2.25, 1.75, 0.3], fov: 48, cut: true }, // 9:16: hfov is only ~0.56x the vfov; keep the post off the line of sight
    { f: T.snapped - 2, pos: [5.4, 1.5, 6.5], look: [2.25, 1.75, 0.3], glide: HOLD },
    // the drop: medium on the platform, watch it fall and stop
    { f: T.platform2 + 10, pos: [3.3, PH + 0.7, 5.6], look: [0, PH + 1.0, 0], fov: 40, glide: 20 }, // whip-crane up from the axe to the platform (motion blur)
    { f: T.few - 18, pos: [3.0, PH + 0.6, 5.0], look: [0, PL + 1.0, 0], glide: HOLD },
    // "Just a few inches down": close on the platform edge in the rail teeth
    { f: T.few + 18, pos: [POST_X - 0.1, PL + FRAME_H + 0.55, 1.55], look: [POST_X - 0.25, PL + FRAME_H + 0.15, 0], fov: 38, focus: 1.6, glide: 36 },
    { f: T.wait - 1, pos: [POST_X - 0.1, PL + FRAME_H + 0.5, 1.35], look: [POST_X - 0.25, PL + FRAME_H + 0.15, 0], glide: HOLD },
    // CUT on "Wait": the crowd's faces
    { f: T.wait, pos: [0.55, 1.5, 10.6], look: [0.5, 1.3, 4.4], fov: 32, focus: 6.2, cut: true },
    // "Nothing was holding it up": look up from the deck past the slack rope to the pulley
    { f: T.nothing - 16, pos: [0.55, 1.5, 10.2], look: [0.5, 1.3, 4.4], glide: HOLD },
    { f: T.nothing + 18, pos: [1.6, PL + 1.0, 2.2], look: [0, PULLEY[1] - 0.4, 0], fov: 46, glide: 34 }, // crane up past the crowd to the slack rope
    { f: T.yousee - PRE, pos: [1.4, PL + 1.1, 1.9], look: [0, PULLEY[1] - 0.6, 0], glide: HOLD },
    // "You see," night-blue explanation: close on the real spring on the crosshead (diagram overlay above)
    { f: T.yousee, pos: [3.0, PL + 1.2, 7.5], look: [0, PL + 2.6, 0], fov: 44, dissolve: DZ }, // the stopped platform + Otis in the lower half, diagram above
    { f: T.slack + H, pos: [1.9, PL + 1.35, 7.9], look: [0, PL + 2.6, 0], glide: TRAVEL },
    { f: T.teeth + H, pos: [3.8, PL + 1.1, 6.9], look: [0.2, PL + 2.5, 0], glide: TRAVEL },
    { f: T.three - PRE, pos: [3.6, PL + 1.15, 7.1], look: [0.2, PL + 2.5, 0], glide: HOLD },
    // 1857: the five-floor store and the first passenger elevator rising in its glass shaft
    { f: T.three, pos: [STORE[0] - 3.5, 2.0, 9.5], look: [STORE[0], 4.5, -5], fov: 40, dissolve: DZ },
    { f: T.andOtis - PRE, pos: [STORE[0] - 2.4, 9.0, 7.0], look: [STORE[0], 11.0, -5], glide: T.andOtis - PRE - T.three - 4 },
    // "And Otis?" golden; hat to his chest; crane up to the skyline he never saw
    { f: T.andOtis, pos: [SX + 2.9, 1.55, 7.9], look: [SX + 2.2, 1.4, 4.4], fov: 34, focus: 3.6, dissolve: DZ },
    { f: T.decades - 4, pos: [SX + 2.85, 1.5, 7.5], look: [SX + 2.2, 1.4, 4.4], glide: HOLD },
    { f: T.sky + 24, pos: [SX + 3.3, 1.2, 10.4], look: [SX + 1.0, 9.5, -40], fov: 50, focus: 6.5, glide: T.sky + 24 - T.decades }, // keep Otis sharp
    { f: T.total + 10, pos: [SX + 3.3, 1.15, 10.8], look: [SX + 1.0, 10, -40], focus: 6.8, glide: HOLD },
  ]);
  const rig = cameraRig(keys, {
    push: { rate: 0.0028, punches: [T.rope1, T.cut1, T.fell, T.five, T.stopped, T.wait + 2, T.jammed, T.y1861].map((p) => ({ f: p - 2, rate: 0.0065, n: 30 })) },
    kicks: [{ f: T.fell + 1, amp: 0.05 }, { f: T.snapped, amp: 0.035 }, { f: T.dropped + 2, amp: 0.06 }, { f: T.jammed + 2, amp: 0.02 }],
    refFps: 30,
  });

  // shot audit (lib/three/audit.ts): what must read in each shot, checked at every key arrival and mid-hold
  const AUD = new Set(rig.keys.flatMap((k, i) => [k.f + 1, Math.round((k.f + (rig.keys[i + 1]?.f ?? k.f + 60)) / 2)]));
  const C = (name: string, x: number, y: number, z: number, h = 1.75): ShotSubject => ({ name, at: [x, y + h * 0.7, z], r: h / 2 }); // upper body: what a CU must keep
  const subjectsAt = (f: number): ShotSubject[] => {
    const py = platformY(f, T);
    if (f < T.back) return [C("otis", -0.25, py + 0.16, 0.25, 1.78), C("helper", WINCH[0] - 0.75, 0, 0.55)];
    if (f < T.nobody) { const hy = f < T.snap0 ? 6.6 : f < T.fell ? 6.6 * (1 - ((f - T.snap0) / (T.fell - T.snap0)) ** 2) : 0; return [C("hoist man", WH[0] - 0.25, hy + 0.14, WH[2] + 5.25, 1.72)]; }
    if (f < T.heck) return [{ name: "6-floor facade", at: [SX - 6.4, Math.min(16, 3 + (f - T.nobody) * 0.1), -6], r: 2.5, maxFrac: 2 }];
    if (f < T.his) return [C("heckler", -1.9, 0, 4.3, 1.72)];
    if (f < T.his + 22) return [];
    if (f < T.helper) return [C("otis", -0.25, py + 0.16, 0.25, 1.78)];
    if (f < T.platform2) return [C("helper", WINCH[0] - 0.75, 0, 0.55), { name: "rope cut point", at: [WINCH[0] - 0.2, 1.55, 0], r: 0.3, minFrac: 0.02 }];
    if (f < T.few) return [C("otis", -0.25, py + 0.16, 0.25, 1.78)];
    if (f < T.wait) return [{ name: "spring shoe in the teeth", at: [POST_X - 0.15, py + FRAME_H + 0.2, 0], r: 0.25, minFrac: 0.03 }];
    if (f < T.nothing) return [C("lady", -0.15, 0, 4.4, 1.62), C("kid", 0.55, 0, 4.65, 1.2), C("prof", 1.2, 0, 4.3, 1.74)];
    if (f < T.yousee) return [{ name: "pulley + slack rope", at: [PULLEY[0], PULLEY[1] - 0.5, 0], r: 0.6, minFrac: 0.03 }];
    if (f < T.three) return [C("otis (night)", -0.25, py + 0.16, 0.25, 1.78)];
    if (f < T.andOtis) return [{ name: "1857 car", at: [STORE[0] - 1.5, 0.1 + 12.6 * ease.smoother(clamp((f - T.three - 20) / (T.andOtis - T.three - 30))) + 1.0, STORE[2] + 5.1], r: 1.1, minFrac: 0.04 }];
    return [C("old otis", SX + 2.2, 0, 4.4, 1.76), ...(f > T.sky ? [{ name: "skyline", at: [SX, 40, SKY_Z] as V3, r: 30, maxFrac: 3 }] : [])];
  };

  return (
    <Stage3D look={look} camAt={(fr, fp) => rig.at(fr, fp)} dissolveAt={(fr, fp) => rig.dissolveAt(fr, fp)} cuts={rig.cuts}
      audit={(fr) => (AUD.has(fr) || fr % 10 === 0 ? subjectsAt(fr) : null)}
      build={(ctx) => {
        const { scene } = ctx;
        const skyM = sky(scene, "#3f8ff0", "#bfe6ff");
        const L = lights(scene, "day", { shadowSize: 40, target: [0, 0, 0], fog: [12, 140] });
        const nightKey = new THREE.PointLight("#ffcf8a", 0, 9, 1.2); scene.add(nightKey);
        const wind = windUniforms();
        // ============ HALL (1854 exhibition: iron columns, glass barrel roof, bunting, plank floor)
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 44), lam({ map: paint.planks("#b08458", [10, 7], false) }));
        floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
        const outside = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), lam({ map: flat.grass("#71b038", [60, 60]) }));
        outside.rotation.x = -Math.PI / 2; outside.position.y = -0.01; scene.add(outside);
        const iron = lam({ color: "#2f4a6a" }), glass = new THREE.MeshLambertMaterial({ color: "#cfe8ff", transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
        for (let i = 0; i < 7; i++) {
          const z = -18 + i * 6;
          for (const sx of [-1, 1]) {
            const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 11, 10), iron); col.position.set(sx * 13, 5.5, z); col.castShadow = true; scene.add(col);
          }
          const arch = new THREE.Mesh(new THREE.TorusGeometry(13, 0.16, 6, 40, Math.PI), iron); arch.position.set(0, 11, z); scene.add(arch);
        }
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 36, 40, 1, true, -Math.PI / 2, Math.PI), glass);
        roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.position.set(0, 11, 0); scene.add(roof);
        const bunt = ["#e04a3a", "#f2c94c", "#3a7fd0", "#f4efe6"], flags: THREE.Mesh[] = [];
        for (let i = 0; i < 6; i++) for (let k = 0; k < 14; k++) {
          const tri = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 3), lam({ color: bunt[(i + k) % 4] }));
          const x = -11 + k * 1.7, z = -15 + i * 6; tri.position.set(x, 9.6 - 0.6 * Math.sin((k / 13) * Math.PI), z); tri.rotation.x = Math.PI; scene.add(tri); flags.push(tri);
        }
        // exhibition stands around the hall (flat booths with awnings)
        for (const [x, z, c] of [[-8, -8, "#c0392b"], [8, -9, "#2f7fb0"], [-9, 3, "#2f8f6a"], [9, 2, "#d08a2a"], [-7, -14, "#8e5bb5"], [7, -15, "#c0392b"]] as const) {
          const b = new THREE.Group();
          const base = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 1.4), lam({ color: "#e9dcc6" })); base.position.y = 0.55; b.add(base);
          const aw = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 1.8), lam({ map: flat.tiles(c, "#f4efe6", 6, [1, 1]) })); aw.position.y = 2.4; aw.rotation.x = -0.25; b.add(aw);
          for (const sx of [-1.45, 1.45]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.1), lam({ color: "#7a5a3a" })); p.position.set(sx, 1.2, 0.6); b.add(p); }
          b.position.set(x, 0, z); b.rotation.y = x > 0 ? -0.5 : 0.5; b.traverse((o) => { (o as THREE.Mesh).castShadow = true; }); scene.add(b);
        }
        // ============ THE TOWER: two guide posts with ratchet teeth, top beam + pulley, winch, the rope
        const wood = lam({ map: paint.planks("#a5703f", [1, 4], true) }), dark = lam({ color: "#4b3a2e" }), steel = lam({ color: "#8d96a6" });
        for (const sx of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(POST_W, TOWER_H, POST_W * 1.6), wood); post.position.set(sx * POST_X, TOWER_H / 2, 0); post.castShadow = post.receiveShadow = true; scene.add(post);
          for (let y = 0.6; y < TOWER_H - 0.6; y += 0.22) { // ratchet teeth on the inner face (saw profile)
            const t = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), steel);
            t.rotation.z = sx * Math.PI / 2; t.rotation.y = Math.PI / 4; t.position.set(sx * (POST_X - POST_W / 2 - 0.05), y, 0); scene.add(t);
          }
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(POST_X * 2 + 0.7, 0.3, 0.5), wood); beam.position.set(0, TOWER_H, 0); beam.castShadow = true; scene.add(beam);
        const pulley = new THREE.Mesh(new THREE.CylinderGeometry(PULLEY_R, PULLEY_R, 0.14, 24), dark); pulley.rotation.x = Math.PI / 2; pulley.position.set(...PULLEY); scene.add(pulley);
        const winch = new THREE.Group();
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 20), dark); drum.rotation.x = Math.PI / 2; winch.add(drum);
        for (const z of [-0.5, 0.5]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.1), wood); leg.position.set(0, -0.35, z); leg.rotation.z = 0.0; winch.add(leg); const up = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.1), wood); up.position.set(0, -0.2, z); winch.add(up); }
        const crank = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), steel); crank.position.set(0.2, 0.15, 0.52); winch.add(crank);
        winch.position.set(...WINCH); winch.traverse((o) => { (o as THREE.Mesh).castShadow = true; }); scene.add(winch);
        // the platform: deck, rails, side uprights, crosshead, the wagon spring (segments), crates and a barrel
        const plat = new THREE.Group();
        const deck = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.16, 1.6), lam({ map: paint.planks("#c48a4e", [3, 1], false) })); deck.position.y = 0.08; plat.add(deck);
        for (const sx of [-1, 1]) {
          const up = new THREE.Mesh(new THREE.BoxGeometry(0.12, FRAME_H, 0.14), wood); up.position.set(sx * 0.86, FRAME_H / 2 + 0.1, 0); plat.add(up);
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.5), wood); rail.position.set(sx * 0.95, 0.75, 0); plat.add(rail);
        }
        const backRail = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.06), wood); backRail.position.set(0, 0.75, -0.75); plat.add(backRail);
        const cross = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.16, 0.2), wood); cross.position.set(0, FRAME_H + 0.08, 0); plat.add(cross);
        const SEG = 11, springSegs: THREE.Mesh[] = [];
        const springMat = lam({ color: "#5c6678" });
        for (let i = 0; i < SEG; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.16), springMat); plat.add(m); springSegs.push(m); }
        const shoe = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.2), steel); plat.add(m); return m; });
        const crateMat = lam({ map: paint.planks("#b98a52", [1, 1], true) });
        for (const [x, y, z, s] of [[0.5, 0.16, -0.35, 0.55], [0.55, 0.71, -0.35, 0.4], [0.62, 0.16, 0.3, 0.45]] as const) {
          const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat); c.position.set(x, y + s / 2, z); c.rotation.y = x * 0.4; plat.add(c);
        }
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 14), lam({ color: "#8a5a34" })); barrel.position.set(-0.62, 0.44, -0.45); plat.add(barrel);
        plat.traverse((o) => { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; });
        scene.add(plat);
        // ropes: rebuilt as tubes when their shape changes
        const ropeMat = lam({ color: "#c9a46a" });
        const tube = () => { const m = new THREE.Mesh(new THREE.BufferGeometry(), ropeMat); m.castShadow = true; scene.add(m); return m; };
        const ropes = { lift: tube(), winchSide: tube(), stub: tube() };
        // ============ STREET (New York, 1850s): 5-6 floor buildings, the warehouse hoist, the 1857 store, the future skyline
        const road = new THREE.Mesh(new THREE.PlaneGeometry(90, 14), lam({ map: paint.cobble("#a99a86", [22, 4]) })); road.rotation.x = -Math.PI / 2; road.position.set(SX, 0.005, -1); road.receiveShadow = true; scene.add(road);
        const walls = ["#c97a5a", "#e9dcc6", "#b8664a", "#d9c09a", "#9a5a44", "#e6d2b0"];
        for (let i = 0; i < 8; i++) {
          const x = SX - 28 + i * 7.2; if (Math.abs(x - STORE[0]) < 6 || Math.abs(x - WH[0]) < 4) continue;
          if (Math.abs(x - SX - 0.8) < 1) { const fc = fence(6, { h: 1.0 }); fc.position.set(x - 3, 0, -6.4); scene.add(fc); continue; } // empty lot: the sight line to the future skyline
          const h = house({ w: 6.6, d: 7, h: 15.5 + (i % 2) * 2.8, floors: 5 + (i % 2), wall: walls[i % walls.length], roof: "#5a4a4a", seed: "ny" + i });
          h.position.set(x, 0, -9.5); scene.add(h);
          const h2 = house({ w: 6.6, d: 7, h: 13 + (i % 3) * 2.4, floors: 4 + (i % 3), wall: walls[(i + 3) % walls.length], roof: "#4a3f46", seed: "nyb" + i });
          h2.position.set(x + 2, 0, 9.5); h2.rotation.y = Math.PI; scene.add(h2);
        }
        const whB = house({ w: 7, d: 7, h: 12.5, floors: 4, wall: "#8a5a44", roof: "#4b3f46", seed: "warehouse" }); whB.position.set(...WH); scene.add(whB);
        const hoistBeam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 3.2), wood); hoistBeam.position.set(WH[0], 10.4, WH[2] + 3.5 + 1.4); scene.add(hoistBeam);
        const hoistPlat = new THREE.Group();
        const hp = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 1.4), lam({ map: paint.planks("#b98a52", [2, 1], false) })); hp.position.y = 0.07; hoistPlat.add(hp);
        for (const [x, z, s] of [[0.45, -0.2, 0.5], [0.4, 0.3, 0.4], [0.5, 0.0, 0.35]] as const) { const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat); c.position.set(x, 0.14 + s / 2 + (z > 0.2 ? 0 : z === 0 ? 0.5 : 0), z); hoistPlat.add(c); }
        hoistPlat.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
        scene.add(hoistPlat);
        const hoistRope = tube();
        // the 1857 store: white five-floor facade with a glass shaft and the car
        const store = house({ w: 10, d: 8, h: 17.5, floors: 5, wall: "#efe7d6", roof: "#6a6a72", seed: "store1857" }); store.position.set(...STORE); scene.add(store);
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(2.2, 17, 2.0), new THREE.MeshLambertMaterial({ color: "#bfe0ff", transparent: true, opacity: 0.22, depthWrite: false }));
        shaft.position.set(STORE[0] - 1.5, 8.5, STORE[2] + 5.1); scene.add(shaft);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 17.2, 0.12), iron); p.position.set(STORE[0] - 1.5 + sx * 1.1, 8.6, STORE[2] + 5.1 + sz * 1.0); scene.add(p); }
        const car = new THREE.Group();
        const carBox = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 1.6), lam({ color: "#8a3a2a" })); car.add(carBox);
        const carTop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 1.6), lam({ color: "#8a3a2a" })); carTop.position.y = 2.1; car.add(carTop);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.1, 0.08), lam({ color: "#d8b04a" })); p.position.set(sx * 0.85, 1.05, sz * 0.75); car.add(p); }
        car.position.set(STORE[0] - 1.5, 0.1, STORE[2] + 5.1); scene.add(car);
        const lamps = [SX - 20, SX - 6, SX + 4, SX + 18].map((x) => { const lp = lampPost(); lp.position.set(x, 0, -4.2); scene.add(lp); return lp; });
        for (let i = 0; i < 6; i++) { if (blocksShot([SX - 25 + i * 10, 2, 6.2], 2.2, rig.keys)) continue; const t = tree({ seed: "nt" + i, h: 4.2 }); t.position.set(SX - 25 + i * 10, 0, 6.2); windSway(t, wind, 2); scene.add(t); }
        // the future skyline (ghost silhouettes that rise on "skyscraper")
        // flat dark silhouettes with lit windows (NOINK: skipped by toonify). Thumbnail review: a plain dark-blue silhouette
        // vanished into the dusk sky even at full size, so the windows carry the read ("a future city")
        const winTex = canvasTexture("sky-windows", 128, 256, (g, r) => { g.fillStyle = "#2c3a6e"; g.fillRect(0, 0, 128, 256);
          for (let y = 6; y < 256; y += 14) for (let x = 6; x < 128; x += 14) { g.fillStyle = r() < 0.55 ? "#ffd27a" : "#3d4c84"; g.fillRect(x, y, 7, 8); } }, [1, 4]);
        const ghost = new THREE.MeshBasicMaterial({ map: winTex, transparent: true, opacity: 0.95, fog: false });
        const towers = [[-30, 62, 10], [-16, 84, 12], [-4, 104, 13], [9, 76, 11], [22, 58, 10], [-44, 46, 9], [36, 50, 9], [52, 40, 8], [-58, 36, 8]].map(([dx, h, w]) => { // far skyline: thin towers, sky above
          const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), ghost); b.position.y = h / 2; g.add(b);
          const sp = new THREE.Mesh(new THREE.ConeGeometry(w * 0.25, h * 0.15, 4), ghost); sp.position.y = h + h * 0.075; g.add(sp);
          g.position.set(SX + dx, 0, SKY_Z - Math.abs(dx) * 0.4); g.scale.y = 0.001; g.traverse((o) => o.layers.set(NOINK)); scene.add(g); return g;
        });
        const clouds = [0, 1, 2, 3].map((i) => { const c = cloudCard({ seed: "ec" + i, w: 42 }); c.position.set(-80 + i * 70, 55 + i * 5, -190); scene.add(c); return c; });
        const birds = [0, 1, 2].map(() => { const b = bird(); b.group.scale.setScalar(1.5); scene.add(b.group); return b; });
        // ============ CAST (new stick kinds) + crowd
        const cast = {
          // pad = canvas room for props/gestures (raised axe, hat tip, pointing) so nothing is clipped at the card edge
          otis: new CharacterCard(otis, 1.78, 1500, L.sun, undefined, { top: 0.3, x: 0.25 }), helper: new CharacterCard(helper, 1.75, 1500, L.sun, undefined, { top: 0.55, x: 0.45 }),
          heckler: new CharacterCard(heckler, 1.72, 1500, L.sun, undefined, { x: 0.35 }),
          lady: new CharacterCard(lady, 1.62, 1300, L.sun, undefined, { top: 0.15 }), kid: new CharacterCard(kid, 1.2, 1100, L.sun, undefined, { top: 0.25, x: 0.2 }), prof: new CharacterCard(prof, 1.74, 1300, L.sun),
          hoistMan: new CharacterCard(hoistMan, 1.72, 1300, L.sun, undefined, { top: 0.25, x: 0.2 }), rider1: new CharacterCard(lady, 1.6, 900, L.sun), rider2: new CharacterCard(kid, 1.2, 800, L.sun),
          otisOld: new CharacterCard({ ...otis, id: "otisOld", hat: undefined, hair: { style: "side", color: "#bdb6ac" }, stache: "#bdb6ac" }, 1.76, 1500, L.sun),
        };
        Object.values(cast).forEach((c) => scene.add(c.group));
        const crowd = new CrowdPool(scene, L.sun);
        const ring: [number, number][] = [[-4.5, 3.2], [-3.4, 5.2], [-5.6, 1.4], [3.8, 4.6], [5.4, 2.6], [1.2, 6.6], [-1.0, 7.4], [6.2, 5.6], [-6.6, 4.6], [4.4, 7.4], [-3.0, 8.6], [2.6, 8.8]];
        ring.filter(([x, z]) => !blocksShot([x, 0, z], 0.7, rig.keys)).forEach(([x, z], i) => crowd.add({ spec: { ...EXTRA[i % EXTRA.length], id: "c" + i } as StickSpec, pos: [x, 0, z], expr: i % 3 ? "neutral" : "happy", seed: i + 1 }, 9));
        // street walkers
        [[SX - 30, SX + 20, 1.6], [SX + 24, SX - 26, -2.8], [SX - 18, SX + 30, 3.4]].forEach(([a, b, z], i) =>
          crowd.add({ spec: { ...EXTRA[(i + 2) % EXTRA.length], id: "w" + i } as StickSpec, seed: 20 + i, path: { from: [a, 0, z], to: [b, 0, z], t0: 0, t1: T.total / fps } }, 12));
        // FX
        const fx = new FxLayer(scene);
        fx.add("exclaim", { at: [1.0, PY_HIGH + 2.3, 0.4], f0: T.cut1 - 2, size: 0.55, color: "#ffd23f" });
        fx.add("impact", { at: [WH[0] + 0.3, 7.6, WH[2] + 4.9], f0: T.snap0, size: 1.0 });
        fx.add("dust", { at: [WH[0], 0.2, WH[2] + 4.9], f0: T.fell, size: 2.6 });
        fx.add("stars", { at: [WH[0] - 0.4, 2.1, WH[2] + 5.4], f0: T.everyone, size: 1.0 });
        fx.add("question", { at: [-1.7, 2.35, 4.2], f0: T.heck + 4, size: 0.45, color: "#ffffff" });
        fx.add("impact", { at: [WINCH[0] - 0.25, 1.6, 0.25], f0: T.snapped - 1, size: 0.9 });
        fx.add("speedlines", { at: [0, PY_HIGH + 1.0, 0.6], f0: T.dropped - 2, size: 1.6 });
        fx.add("impact", { at: [POST_X - 0.2, PY_HIGH - DROP + FRAME_H + 0.1, 0.2], f0: T.dropped + 2, size: 0.7, color: "#ffd23f" });
        fx.add("exclaim", { at: [0.9, 2.2, 4.4], f0: T.wait, size: 0.5, color: "#ffd23f" });
        fx.add("sparkle", { at: [POST_X - 0.2, PL + FRAME_H + 0.1, 0.2], f0: T.jammed, size: 0.7 });
        fx.add("sparkle", { at: [STORE[0] - 1.5, 13.5, STORE[2] + 6.0], f0: T.elevator2, size: 1.8 });
        const dust = [motes(scene, { center: [0, 4, 3], size: [16, 8, 14], n: 520, seed: "hall", px: 0.045 }), motes(scene, { center: [SX, 4, 0], size: [40, 8, 18], n: 420, seed: "street", px: 0.06, color: "#ffe7c4" })];
        const toon = toonifyScene(scene, makeToonUniforms(TOON_SETUPS.day, 2.4));
        return { dust, flags, skyM, L, nightKey, wind, plat, springSegs, shoe, ropes, hoistPlat, hoistRope, car, towers, clouds, birds, cast, crowd, fx, toon, lamps };
      }}
      update={(w, f, { fps: FPS }) => {
        const cam = rig.at(f, FPS);
        // ---- lighting per beat: golden (flashback + ending), night (explanation), day otherwise
        const win = (a: number, b: number) => clamp((f - a + 6) / 12) * (1 - clamp((f - b + 6) / 12));
        const g = Math.max(win(T.back, T.heck), win(T.andOtis, 1e9)), n = win(T.yousee, T.three);
        const u = (w.skyM.material as THREE.ShaderMaterial).uniforms;
        (u.top.value as THREE.Color).set("#3f8ff0").lerp(new THREE.Color("#8c78c4"), g).lerp(new THREE.Color("#0f1648"), n);
        (u.horizon.value as THREE.Color).set("#bfe6ff").lerp(new THREE.Color("#ffd08a"), g).lerp(new THREE.Color("#3a3f8f"), n);
        (u.bottom.value as THREE.Color).copy(u.horizon.value);
        w.L.sun.color.set("#fffaf4").lerp(new THREE.Color("#ffc890"), g).lerp(new THREE.Color("#9fb0ff"), n);
        w.L.sun.intensity = lerp(lerp(2.4, 3.0, g), 0.9, n);
        const sx = f >= T.back && f < T.heck || f >= T.three ? SX : 0;
        w.L.sun.position.set(sx + lerp(lerp(-30, 35, g), 20, n), lerp(lerp(55, 26, g), 50, n), lerp(lerp(30, 30, g), 30, n));
        w.L.sun.target.position.set(sx, 0, 0); w.L.sun.target.updateMatrixWorld();
        w.L.hemi.color.set("#b9d7ff").lerp(new THREE.Color("#d8b4d8"), g).lerp(new THREE.Color("#3b44a8"), n);
        w.L.hemi.intensity = lerp(lerp(1.15, 1.0, g), 0.5, n);
        w.nightKey.intensity = 7 * n; w.nightKey.position.set(1.3, PY_HIGH - DROP + FRAME_H + 1.2, 1.6);
        (w.L.sun.parent as THREE.Scene).fog!.color.copy(u.horizon.value);
        if (n > 0) applyToonSetup(w.toon, TOON_SETUPS.day, TOON_SETUPS.night, n, w.L.sun.intensity);
        else applyToonSetup(w.toon, TOON_SETUPS.day, TOON_SETUPS.golden, g, w.L.sun.intensity);
        w.wind.uWindTime.value = f / FPS;
        // ---- platform + wagon spring (bowed under tension, flat once the rope is cut)
        const py = platformY(f, T), sf = springFlat(f, T);
        w.plat.position.set(0, py, 0);
        const half = lerp(0.82, 1.0, clamp(sf)), bow = lerp(0.32, 0.0, clamp(sf)), sy = FRAME_H + 0.2;
        const pts: [number, number][] = [];
        for (let i = 0; i <= w.springSegs.length; i++) { const t = i / w.springSegs.length * 2 - 1; pts.push([t * half, sy + bow * (1 - t * t)]); }
        w.springSegs.forEach((m, i) => { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); m.rotation.z = Math.atan2(y1 - y0, x1 - x0); m.scale.x = Math.hypot(x1 - x0, y1 - y0) / 0.22 * 1.08; });
        w.shoe.forEach((m, i) => m.position.set((i ? 1 : -1) * (half + 0.04), sy, 0));
        // ---- ropes
        const springTop: V3 = [0, py + sy + bow, 0];
        const cut = ropeCut(f, T), cutPt: V3 = [WINCH[0] - 0.2, 1.55, 0.0];
        const setTube = (m: THREE.Mesh, P: V3[], r = 0.035) => { m.geometry.dispose(); m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P.map((p) => new THREE.Vector3(...p))), 48, r, 6, false); };
        const pl: V3 = [-PULLEY_R * 0.2, PULLEY[1] - PULLEY_R * 0.95, 0], pr: V3 = [PULLEY_R * 0.95, PULLEY[1] - 0.1, 0];
        if (!cut) {
          setTube(w.ropes.lift, [springTop, [0, (springTop[1] + pl[1]) / 2, 0], pl, [0, PULLEY[1] + PULLEY_R, 0], pr]);
          setTube(w.ropes.winchSide, [pr, [(pr[0] + WINCH[0]) / 2, (pr[1] + WINCH[1]) / 2, 0], [WINCH[0], WINCH[1] + 0.3, 0]]);
          w.ropes.stub.visible = false;
        } else {
          const t = (f - T.snapped) / FPS, whip = Math.exp(-t * 3) * Math.sin(t * 18) * 0.5;
          const slack = ease.outCubic(clamp(t * 1.5)); // the freed end flies up to the pulley and hangs; the lift side goes slack
          const endY = lerp(cutPt[1], PULLEY[1] - 2.4, slack);
          setTube(w.ropes.winchSide, [pr, [pr[0] + 0.15 + whip * 0.3, (pr[1] + endY) / 2, 0.05], [pr[0] + 0.25 + whip, endY, 0.1]]);
          const mid = (springTop[1] + pl[1]) / 2;
          setTube(w.ropes.lift, [springTop, [0.35 * slack, mid + 0.2, 0.2 * slack], [0.1, pl[1] - 0.6, 0.1], pl, [0, PULLEY[1] + PULLEY_R, 0], pr]);
          w.ropes.stub.visible = true;
          setTube(w.ropes.stub, [[WINCH[0], WINCH[1] + 0.3, 0], [WINCH[0] - 0.35, 1.0, 0.0], [cutPt[0] + 0.1, 0.06 + 0.4 * Math.exp(-t * 4), 0.1]]);
        }
        // ---- flashback hoist: rope snaps on "snapped", platform free-falls, lands on "fell"
        const hx = WH[0], hz = WH[2] + 4.9, hTop = 10.25, hy0 = 6.6;
        const tf = (f - T.snap0) / FPS, fallDur = (T.fell - T.snap0) / FPS;
        const hy = f < T.snap0 ? hy0 : Math.max(0, hy0 - hy0 * Math.pow(clamp(tf / fallDur), 2));
        w.hoistPlat.position.set(hx, hy, hz); w.hoistPlat.rotation.z = f > T.fell ? 0.06 * Math.exp(-(f - T.fell) / 6) * Math.sin((f - T.fell) * 1.3) : 0;
        setTube(w.hoistRope, f < T.snap0 ? [[hx, hTop, hz], [hx, (hTop + hy + 0.1) / 2, hz], [hx, hy + 0.1, hz]] : [[hx, hTop, hz], [hx + 0.2, hTop - 1.0, hz], [hx + 0.35 + 0.2 * Math.sin(tf * 9) * Math.exp(-tf * 2), hTop - 2.0, hz]], 0.04);
        // ---- 1857 car rises through the five floors
        const ct = ease.smoother(clamp((f - T.three - 20) / (T.andOtis - T.three - 30)));
        w.car.position.y = 0.1 + ct * 12.6;
        w.towers.forEach((tw, i) => { tw.scale.y = Math.max(0.001, ease.outBack(clamp((f - T.decades - i * 4) / 34))); });
        // ---- cast
        const lead = 2;
        // Otis: calm on the platform; hat tip on "tipped"; braced on the drop; arms out "see?" after
        const tip = ease.smoother(clamp((f - T.tipped + 4) / 10)) * (1 - ease.smoother(clamp((f - T.tipped - 30) / 10)));
        const brace = f >= T.dropped - 2 && f < T.dropped + 30;
        const otisPose: KPose = mp(idlePose(f, FPS, 7), {
          expr: brace ? "shock" : f >= T.dropped + 30 ? "smug" : f >= T.tipped - lead ? "happy" : "smug",
          blink: blinkAt(f, FPS, "otis", [T.tipped - lead, T.dropped]),
        });
        otisPose.hatLift = 0.55 * tip; otisPose.hatTilt = -22 * tip;
        if (tip > 0.01) otisPose.limbs = { handR: [lerp(1.0, 0.55, tip), lerp(1.6, 3.35, tip)] };
        if (brace) { otisPose.limbs = { handL: [1.5, 2.1], handR: [1.5, 2.1] }; otisPose.squash = 0.93; }
        if (f >= T.dropped + 30 && f < T.yousee) otisPose.limbs = { handL: [1.7, 1.6], handR: [1.7, 1.6] };
        w.cast.otis.setPose(otisPose);
        w.cast.otis.place(-0.25, py + 0.16, 0.25, cam.pos);
        w.cast.otis.group.visible = f < T.three;
        w.cast.helper.setPose(helperPose(f, T));
        w.cast.helper.place(WINCH[0] - 0.75, 0, 0.55, cam.pos); // left of the rope, swings toward +x into it
        // heckler: smug, says "He's finished." (Rhubarb cues), shocked on the stop
        w.cast.heckler.setPose(mp(idlePose(f, FPS, 3), {
          expr: f >= T.dropped ? "shock" : "smug", blink: blinkAt(f, FPS, "heckler", [T.heck, T.dropped]),
          cue: cueAt(f, FPS, HECK_CUES, lead), limbs: f >= T.heck - lead && f < T.his + 10 ? { handR: [2.0, 2.4] } : undefined, facing: 1,
        }));
        w.cast.heckler.place(-1.9, 0, 4.3, cam.pos);
        const crowdExpr = (base: KPose["expr"]) => (f >= T.dropped - 2 && f < T.nothing ? "shock" : f >= T.cut1 && f < T.heck ? "nervous" : base);
        w.cast.lady.setPose(mp(idlePose(f, FPS, 4), { expr: crowdExpr("happy"), limbs: f >= T.dropped && f < T.nothing ? { handL: [0.3, 2.6], handR: [0.3, 2.6] } : undefined }));
        w.cast.lady.place(-0.15, 0, 4.4, cam.pos);
        w.cast.kid.setPose(mp(idlePose(f, FPS, 5), { expr: f >= T.wait ? "laugh" : crowdExpr("happy"), limbs: f >= T.wait ? { handL: [1.1, 3.0], handR: [1.1, 3.0] } : undefined }));
        w.cast.kid.place(0.55, 0, 4.65, cam.pos);
        w.cast.prof.setPose(mp(idlePose(f, FPS, 6), { expr: f >= T.nothing ? "think" : crowdExpr("neutral"), limbs: f >= T.nothing ? { handR: [0.25, 2.55] } : undefined }));
        w.cast.prof.place(1.2, 0, 4.3, cam.pos);
        // flashback worker rides the hoist down and sits up dizzy
        const fallen = f >= T.fell;
        w.cast.hoistMan.setPose(mp(idlePose(f, FPS, 8), { expr: fallen ? "cry" : f >= T.snap0 ? "shock" : "whistle",
          limbs: f >= T.snap0 && !fallen ? { handL: [1.2, 3.1], handR: [1.2, 3.1] } : undefined, squash: fallen ? 0.9 : 1 }));
        w.cast.hoistMan.place(hx - 0.25, hy + 0.14, hz + 0.35, cam.pos);
        w.cast.hoistMan.group.visible = f < T.nobody + 10;
        // 1857 riders wave from the car
        const cy = 0.1 + ct * 12.6 + 0.07;
        w.cast.rider1.setPose({ expr: "laugh", limbs: { handR: [1.1, 2.9 + 0.2 * Math.sin(f * 0.5)] } } as KPose); w.cast.rider1.place(STORE[0] - 1.9, cy, STORE[2] + 5.4, cam.pos);
        w.cast.rider2.setPose({ expr: "happy", limbs: { handL: [1.1, 2.9 + 0.2 * Math.cos(f * 0.5)] } } as KPose); w.cast.rider2.place(STORE[0] - 1.0, cy, STORE[2] + 5.4, cam.pos);
        w.cast.rider1.group.visible = w.cast.rider2.group.visible = f >= T.three - 12 && f < T.andOtis + 12;
        // old Otis: hat held to the chest on "died", looks up to the skyline on "skyscraper"
        const up = f >= T.sky - lead;
        w.cast.otisOld.setPose(mp(idlePose(f, FPS, 9), { expr: up ? "happy" : f >= T.died - lead ? "sad" : "neutral", look: up ? [0.2, -0.9] : undefined,
          blink: blinkAt(f, FPS, "otisOld", [T.died - lead, T.sky - lead]), hold: { item: "hat", hat: otis.hat, hand: "R" }, limbs: { handR: [0.55, 0.95] } }));
        w.cast.otisOld.place(SX + 2.2, 0, 4.4, cam.pos);
        w.cast.otisOld.group.visible = f >= T.andOtis - 12;
        w.crowd.update(f, FPS, cam.pos);
        w.birds.forEach((b, i) => { const tt = f / FPS + i * 4.1, x = SX - 40 + ((tt * 3.2) % 80), y = 18 + i * 1.5 + Math.sin(tt * 0.8 + i) * 0.8; b.group.position.set(x, y, -14 - i * 3); b.group.rotation.y = Math.PI / 2; b.flap(f + i * 5); });
        w.clouds.forEach((cl, i) => { cl.position.x = -80 + i * 70 + (f / FPS) * 1.2; cl.lookAt(cam.pos[0], cl.position.y, cam.pos[2]); });
        w.flags.forEach((fl, i) => { fl.rotation.z = 0.22 * Math.sin(f / FPS * 2.3 + i * 0.7) + 0.08 * Math.sin(f / FPS * 5.1 + i); }); // micro-animation (measured gap: .0065 vs .020)
        w.fx.update(f, cam.pos, FPS);
        w.dust.forEach((d) => d.update(f, FPS));
        return cam;
      }}
    />
  );
};

// ------------------------------------------------------------------------------------------------ 2D overlays
const Panel: React.FC<{ children: React.ReactNode; top: number; box: number; o: number; dy: number }> = ({ children, top, box, o, dy }) => {
  const { u, width } = useU();
  return (
    <div style={{ position: "absolute", left: (width - box) / 2, top: top + dy, width: box, height: box, opacity: o, background: "rgba(10,14,48,0.74)", borderRadius: 34 * u, border: `${3 * u}px solid rgba(160,190,255,0.35)` }}>{children}</div>
  );
};

/** Floors counter while the camera cranes up the facade (one source: the crane keys use the same cues). */
const Floors: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, width, height } = useU();
  const T = timing(fps);
  if (f < T.nobody + 6 || f >= T.heck + 4) return null;
  const n = Math.min(6, 1 + Math.floor(((f - T.nobody - 6) / (T.stairs - T.nobody - 6)) * 6));
  const pop = springAt(((f - T.nobody - 6) % Math.max(1, Math.round((T.stairs - T.nobody - 6) / 6))) / fps, 4, 0.5);
  const stamp = f >= T.five - 2 ? springAt((f - T.five + 2) / fps, 3, 0.45) : 0;
  const o = clamp((f - T.nobody - 6) / 6) * (1 - clamp((f - T.heck + 4) / 6));
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <div style={{ position: "absolute", right: width * 0.07, top: height * 0.16, textAlign: "center", fontFamily: FONTS.heavy, color: "#fff", WebkitTextStroke: `${3 * u}px #140c10`, paintOrder: "stroke fill" }}>
        <div style={{ fontSize: 46 * u }}>FLOOR</div>
        <div style={{ fontSize: 190 * u, lineHeight: 1, transform: `scale(${0.85 + 0.15 * pop})` }}>{n}</div>
      </div>
      {stamp > 0 && <div style={{ position: "absolute", left: width * 0.07, top: height * 0.17, transform: `rotate(-8deg) scale(${stamp})`, padding: `${10 * u}px ${24 * u}px`, background: "#ff3b3b",
        border: `${6 * u}px solid #140c10`, borderRadius: 18 * u, fontFamily: FONTS.heavy, fontSize: 58 * u, color: "#fff" }}>STAIRS ONLY</div>}
    </AbsoluteFill>
  );
};

/** "a few inches" bracket on the close-up. */
const Inches: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, width, height } = useU();
  const T = timing(fps);
  if (f < T.few + 4 || f >= T.wait) return null;
  const k = springAt((f - T.few - 4) / fps, 4, 0.5);
  return (
    <div style={{ position: "absolute", left: width * 0.16, top: height * 0.2, transform: `scale(${k})`, transformOrigin: "left center", fontFamily: FONTS.heavy, fontSize: 84 * u, color: "#ffd23f",
      WebkitTextStroke: `${4 * u}px #140c10`, paintOrder: "stroke fill" }}>↓ a few inches</div>
  );
};

/** Night-blue mechanism diagram: rails + teeth, platform, crosshead, the wagon spring bowed by the rope, then flat into the teeth. */
const Diagram: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width, height } = useU();
  const T = timing(fps);
  if (f < T.yousee || f >= T.three) return null;
  const inn = ease.outBack(clamp((f - T.yousee) / 10)), out = clamp((f - T.three + 10) / 10);
  const glowSpring = clamp((f - T.wagon + 2) / 6) * (1 - clamp((f - T.bent) / 8));
  const tension = 1 - ease.outBack(clamp((f - T.snapFlat) / 6)); // 1 bowed, 0 flat
  const pulled = clamp((f - T.bent) / 10);
  const slack = clamp((f - T.slack + 2) / 6);
  const engaged = f >= T.jammed - 1;
  const drop = engaged ? 0 : f >= T.snapFlat ? 10 * clamp((f - T.snapFlat) / 4) : 0;
  const ok = f >= T.so2 ? springAt((f - T.so2) / fps, 3, 0.5) : 0;
  const RX = 190, deckY = 120 + drop, crossY = deckY - 200, half = 150 + 32 * (1 - tension), bow = 70 * tension;
  const ropeTop = -250, sTopY = crossY - 18 - bow;
  const teeth = (sx: number) => Array.from({ length: 22 }, (_, i) => { const y = -230 + i * 24; const x = sx * RX; return `M${x} ${y} L${x - sx * 22} ${y + 12} L${x} ${y + 24}`; }).join(" ");
  const box = width * 0.84;
  const ropePath = slack > 0 ? `M0 ${sTopY} C ${60 * slack} ${sTopY - 60}, ${-50 * slack} ${ropeTop + 80}, 0 ${ropeTop}` : `M0 ${sTopY} L0 ${ropeTop}`;
  const label = (x: number, y: number, txt: string, col: string, o: number) => <text x={x} y={y} textAnchor="middle" fill={col} opacity={o} fontFamily={FONTS.heavy} fontSize={40}>{txt}</text>;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <Panel top={height * 0.07} box={box} o={Math.min(1, inn * 3) * (1 - out)} dy={(1 - inn) * -0.3 * height}>
        <svg width={box} height={box} viewBox="-280 -280 560 560">
          {/* rails with teeth */}
          {[-1, 1].map((sx) => <g key={sx}><rect x={sx > 0 ? RX : -RX - 34} y={-260} width={34} height={540} fill="#a5703f" stroke="#140c10" strokeWidth={5} /><path d={teeth(sx)} fill="#c9d2e0" stroke="#140c10" strokeWidth={3} /></g>)}
          {/* platform + frame */}
          <rect x={-150} y={deckY} width={300} height={26} fill="#c48a4e" stroke="#140c10" strokeWidth={5} />
          {[-1, 1].map((sx) => <rect key={sx} x={sx * 130 - 8} y={crossY} width={16} height={deckY - crossY} fill="#a5703f" stroke="#140c10" strokeWidth={4} />)}
          <rect x={-140} y={crossY - 14} width={280} height={18} fill="#a5703f" stroke="#140c10" strokeWidth={4} />
          {/* rope */}
          <path d={ropePath} stroke="#140c10" strokeWidth={13} fill="none" strokeLinecap="round" />
          <path d={ropePath} stroke="#e2c08a" strokeWidth={7} fill="none" strokeLinecap="round" />
          {pulled > 0 && slack === 0 && <path d={`M-48 ${ropeTop + 60} L0 ${ropeTop + 10} L48 ${ropeTop + 60}`} stroke="#9dffb0" strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={pulled} />}
          {slack > 0 && f < T.snapFlat + 8 && <g opacity={slack}><path d={`M-30 ${ropeTop + 40} L30 ${ropeTop + 80} M30 ${ropeTop + 40} L-30 ${ropeTop + 80}`} stroke="#ff5a5a" strokeWidth={10} strokeLinecap="round" /></g>}
          {/* the wagon spring */}
          {glowSpring > 0 && <path d={`M${-half} ${crossY - 18} Q0 ${crossY - 18 - 2 * bow} ${half} ${crossY - 18}`} stroke="#ffd23f" strokeWidth={34} fill="none" opacity={0.45 * glowSpring} strokeLinecap="round" />}
          <path d={`M${-half} ${crossY - 18} Q0 ${crossY - 18 - 2 * bow} ${half} ${crossY - 18}`} stroke="#140c10" strokeWidth={20} fill="none" strokeLinecap="round" />
          <path d={`M${-half} ${crossY - 18} Q0 ${crossY - 18 - 2 * bow} ${half} ${crossY - 18}`} stroke="#8d96a6" strokeWidth={11} fill="none" strokeLinecap="round" />
          {engaged && [-1, 1].map((sx) => <circle key={sx} cx={sx * (half - 4)} cy={crossY - 18} r={20 * springAt((f - T.jammed + 1) / fps, 4, 0.5)} fill="none" stroke="#ffd23f" strokeWidth={7} />)}
          {/* labels */}
          {label(0, 236, "wagon spring", "#ffd23f", glowSpring)}
          {f >= T.bent && f < T.moment && label(0, 236, "rope pulls → spring bent", "#9dffb0", pulled)}
          {f >= T.moment && f < T.jammed && label(0, 236, "rope slack → spring flat", "#ffffff", clamp((f - T.moment) / 6))}
          {f >= T.jammed && f < T.so2 && label(0, 236, "ends lock in the teeth", "#ffd23f", clamp((f - T.jammed) / 6))}
          {ok > 0 && <g transform={`scale(${ok})`}><rect x={-230} y={196} width={460} height={64} rx={20} fill="#2fbf6a" stroke="#140c10" strokeWidth={5} />{label(0, 242, "rope breaks = brake ON", "#ffffff", 1)}</g>}
        </svg>
      </Panel>
    </AbsoluteFill>
  );
};

/** Year stamps on the time jumps. */
const Years: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, width, height } = useU();
  const T = timing(fps);
  const stamp = (y: string, f0: number, f1: number) => {
    if (f < f0 || f >= f1) return null;
    const k = springAt((f - f0) / fps, 3, 0.5), o = 1 - clamp((f - f1 + 8) / 8);
    return <div key={y} style={{ position: "absolute", left: width * 0.08, top: height * 0.14, opacity: o, transform: `rotate(-6deg) scale(${k})`, padding: `${8 * u}px ${26 * u}px`,
      background: "#f4efe6", border: `${6 * u}px solid #140c10`, borderRadius: 16 * u, fontFamily: FONTS.heavy, fontSize: 72 * u, color: "#140c10" }}>{y}</div>;
  };
  return <AbsoluteFill style={{ pointerEvents: "none" }}>{stamp("1854", 4, T.back)}{stamp("1857", T.three + 6, T.andOtis)}{stamp("1861", T.y1861, T.decades + 6)}</AbsoluteFill>;
};

export const elevatorShort: ProjectDef = {
  id: "elevator", title: "Why Elevators Don't Fall", defaultFormat: "short", fps: 30, audio: "elevator/master.wav",
  thumbnails: (fps) => elevatorThumbs(timing(fps), { World }),
  scenes: ({ fps }) => {
    const T = timing(fps);
    const travels = [T.his, T.slack, T.teeth];
    return [{
      id: "otis", frames: T.total,
      innerCuts: [T.helper, T.wait],
      innerSoft: [T.back, T.nobody, T.heck, T.yousee, T.three, T.andOtis],
      cues: Object.fromEntries(Object.entries(T).filter(([, v]) => typeof v === "number")) as Record<string, number>,
      events: [T.rope1, T.cut1, T.snap0, T.fell, T.five, T.snapped, T.dropped, T.dropped + 2, T.stopped, T.wait, T.jammed, T.so2, T.elevator2, T.y1861,
        ...travels.flatMap((x) => [x, x + 22, x + 44]), ...[T.platform2, T.few, T.nothing].flatMap((x) => [x - 8, x, x + 8, x + 16, x + 24]), ...[T.back, T.nobody, T.heck, T.yousee, T.three, T.andOtis].flatMap((x) => [x - 6, x, x + 6]),
        T.fell - 10, T.fell, T.decades, T.decades + 30, T.sky, T.sky + 30],
      render: () => (<><World /><Floors /><Inches /><Diagram /><Years />
        <LowerThird title="Elisha Otis" sub="New York, 1854" start={T.elisha} dur={T.helper - T.elisha - 2} accent="#ffd23f" />
        <WordCaptions words={words} yAt={(fr) => (fr >= T.yousee && fr < T.three ? 0.8 : fr >= T.elisha && fr < T.helper ? 0.6 : undefined)} /></>),
    }];
  },
};
