/**
 * STORYBOARD AS DATA (1.7): a whole short from one `Board` object.
 *
 * A board lists the cast, the places (ready-made sets, lib/three/sets.ts) and the BEATS. A beat is one sentence or
 * clause of the narration, anchored on a spoken word, and says: where we are, which lighting key, which shot and how
 * we get to it, what every character does, and the visual gag (a prop, an effect, a stamp, a counter). From that the
 * runtime derives the camera path (lib/shots.ts), the light plan (lib/three/lightplan.ts), pose-to-pose acting,
 * crowd reactions, the shot audit subjects, the QA edit plan (cuts, dissolves, events, cues) and the sound cue sheet.
 *
 *   export const coinShort = boardProject({ id: "coins", title: "...", words, cast, places, beats });
 *
 * One source of truth: change a word time and picture, captions and sound move together. What a board cannot say in
 * data goes into `props` (custom 3D pieces with their own update) and `overlay` (custom 2D layers).
 * Start one with `node tools/make.mjs --project <id>` (it drafts the board from the script); guide: references/board.md.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { cameraRig, CameraRig, CamKey, CamState, V3 } from "./camera";
import { blinkAt, idlePose, walkPose } from "./characters/toon";
import { BOBBLE_POSES, bobbleScale, BobbleSpec, Cue, KExpr, KIND_PRESETS, KPose, PoseKey, poseTrack, StickHold } from "./characters/kinds";
import { ProjectDef } from "./project";
import { frameShot, shotKeys, ShotSpec, Subject, Via } from "./shots";
import type { ShotSubject } from "./three/audit";
import { CharacterCard, CrowdEvent, CrowdPool } from "./three/cast";
import { FxKind, FxLayer } from "./three/fx";
import { LightKey, lightPlan } from "./three/lightplan";
import { buildSet, PROPS, SetInstance, SetName, SetOpts } from "./three/sets";
import { Stage3D, StageCtx } from "./three/Stage3D";
import { bicycle, bus, car, carriage, drive, seatPose, seatWorld, truck, Vehicle } from "./three/vehicles";
import { rain, wetGround } from "./three/weather";
import { blocksShot, motes } from "./three/world";
import { clamp, ease, hash32, lerp, springAt } from "./time";
import type { SceneDef } from "./timeline";
import { FONTS, useU, Word, WordCaptions } from "./two/text";
import type { ThumbVariant } from "./thumbs";

// ------------------------------------------------------------------------------------------------ the data model
/** A mark of the beat's place ("counter"), of another place ("shop:counter"), or coordinates relative to the place. */
export type Mark = string | V3;
export type Act = {
  /** appear / jump here */
  at?: Mark;
  /** walk here during the beat (metres per second, default 1.5) */
  walk?: Mark; speed?: number;
  /** a BOBBLE_POSES name or a pose object; held until the next beat that sets one */
  pose?: string | KPose;
  expr?: KExpr; turn?: number; view?: "front" | "side" | "three"; facing?: 1 | -1; hold?: StickHold | null;
  /** a second prop, in the other hand (a coin in the left, shears in the right) */
  hold2?: StickHold | null;
  /** look toward another actor or a mark (sets the head turn) */
  look?: string;
  /** mouth flaps over the words of this beat */
  talk?: boolean;
  hide?: boolean;
  /** sit in a vehicle of the place */
  seat?: { vehicle: string; seat: string } | null;
  /** frames the pose pops before the word (default 3) */
  lead?: number;
};
export type Gag =
  | { prop: string; at: Mark; id?: string; /** where the prop's own origin is: its base (default) or its centre (floating coins) */ origin?: "base" | "center"; opts?: { color?: string; n?: number; text?: string; seed?: string }; scale?: number; ry?: number; in?: "pop" | "drop" | "none"; until?: string }
  | { fx: FxKind; on: string | V3; size?: number; color?: string; dy?: number }
  | { stamp: string; side?: "left" | "right"; color?: string; until?: string }
  | { label: string; y?: number; color?: string; until?: string }
  | { counter: { from?: number; to: number; prefix?: string; suffix?: string; decimals?: number }; y?: number; color?: string; until?: string }
  | { big: string; color?: string; y?: number; until?: string };
export type BoardShot = Omit<ShotSpec, "on" | "from"> & {
  /** actor ids, prop ids, marks or coordinates; omitted on a `wide` = the set's establishing camera */
  on?: string | string[] | V3; from?: string;
  /** height of a mark / coordinate subject in metres (default 1) */
  h?: number;
  /** keep following this actor or vehicle while it moves */
  follow?: string;
};
export type SoundCue = { f: number; name: string; lu?: number; pan?: number; anchor?: number; on_word?: boolean };
export type Beat = {
  /** a spoken word ("coin", "coin#2" = second occurrence, "coin>40" = first after word 40) or a time in seconds */
  at: string | number;
  /** seconds added to the anchor (default -0.06: the picture leads the word a little) */
  off?: number;
  id?: string;
  place?: string; key?: string | LightKey; via?: Via;
  shot?: BoardShot;
  act?: Record<string, Act>;
  gag?: Gag | Gag[];
  crowd?: CrowdEvent["kind"];
  /** sound effect names at this beat (levels from audio/score.py defaults) or full cues */
  sfx?: (string | Omit<SoundCue, "f"> & { df?: number })[];
  /** music arrangement from this beat on */
  music?: "calm" | "build" | "full" | "stop" | "thin";
  /** rack the focus to this actor / prop / mark from this beat on (until the next shot) */
  focus?: string;
  kick?: number; punch?: boolean;
  /** frames (relative to the beat) where a prop changes the picture on purpose (it turns, breaks, flips): QA then reads a
   *  detected jump there as intended and lists it for a look instead of failing the edit plan. A gag, crowd or kick does this by itself. */
  event?: number[];
  /** rain amount from this beat on (0 = dry) */
  rain?: number;
  /** caption height (fraction of the frame) from this beat on */
  caption?: number;
};
export type BoardVehicle = { kind: "car" | "bus" | "truck" | "carriage" | "bicycle"; opts?: Record<string, unknown>; path: Mark[]; from?: string; to?: string; ease?: "linear" | "stop" | "start"; lights?: boolean };
export type BoardPlace = { set: SetName; opts?: SetOpts; crowd?: number; walkers?: number; wet?: boolean; dust?: boolean; vehicles?: Record<string, BoardVehicle>;
  /** look tweak while the story is in this place, e.g. { exposure: 1.1, grade: { gamma: 1.2 } }. Interiors get INTERIOR_LIFT unless this is set. */
  look?: Record<string, unknown>;
  /** who fills the background (presets or specs); default: period dress for `era: "old"` sets, modern otherwise */
  extras?: (BobbleSpec | keyof typeof KIND_PRESETS)[] };
export type BoardApi = { T: Record<string, number>; fps: number; /** width / height of the frame: a prop laid out for 9:16 can re-arrange itself for 16:9 */ aspect: number; sets: Record<string, SetInstance>; mark: (m: Mark, place?: string) => V3; actorPos: (id: string, f: number) => V3 | null; scene: THREE.Scene };
export type BoardProp = THREE.Object3D | { group: THREE.Object3D; update?: (f: number, fps: number, api: BoardApi) => void };
export type Board = {
  id: string; title: string; fps?: number;
  words: Word[];
  /** seconds the narration starts into the mix (default 0.1) and seconds held after the last word (default 0.9) */
  voOffset?: number; tail?: number;
  cast: Record<string, { spec: BobbleSpec | keyof typeof KIND_PRESETS; height?: number; tex?: number }>;
  places: Record<string, BoardPlace>;
  props?: Record<string, (api: BoardApi) => BoardProp>;
  beats: Beat[];
  /** project-wide tweak of every look, e.g. { grade: { saturation: 1.1 } } */
  look?: Record<string, unknown>;
  overlay?: (T: Record<string, number>, fps: number) => React.ReactNode;
  thumbnails?: (T: Record<string, number>, World: React.FC) => ThumbVariant[];
  audio?: string;
  rig?: { handheld?: number; push?: number };
  /** frames of cross-dissolve on every `via: "cut"` (default 4: a soft cut; 0 = hard cuts) */
  softCut?: number;
};

// ------------------------------------------------------------------------------------------------ timing (pure, no three.js)
const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function planBoard(b: Board, fps: number) {
  const off = b.voOffset ?? 0.1, words = b.words.map((w) => ({ ...w, start: w.start + off, end: w.end + off }));
  const wordIdx = (a: string): number => {
    const m = /^(.*?)(?:#(\d+)|>(\d+))?$/.exec(a)!, txt = clean(m[1]), nth = m[2] ? Number(m[2]) : 1, from = m[3] ? Number(m[3]) : 0;
    // exact word first ("so" must not match "soon"), then a prefix ("clip" finds "clips")
    for (const exact of [true, false]) { let n = 0; for (let i = from; i < words.length; i++) { const w = clean(words[i].word); if ((exact ? w === txt : w.startsWith(txt)) && ++n === nth) return i; } }
    throw new Error(`board "${b.id}": beat anchor "${a}" not found in the narration`);
  };
  const F = (s: number) => Math.max(0, Math.round(s * fps));
  const total = F(words[words.length - 1].end + (b.tail ?? 0.9));
  const seen: Record<string, number> = {};
  let place = "", key: string | LightKey = "day";
  const beats = b.beats.map((bt, i) => {
    const wi = typeof bt.at === "number" ? words.findIndex((w) => w.end + 1e-6 >= (bt.at as number) + off) : wordIdx(bt.at);
    const f = typeof bt.at === "number" ? F(bt.at + off + (bt.off ?? 0)) : F(words[wi].start + (bt.off ?? -0.06));
    let id = bt.id ?? (typeof bt.at === "number" ? `t${i}` : clean(String(bt.at).replace(/[#>]\d+$/, "")));
    if (seen[id] !== undefined) id = `${id}${++seen[id]}`; else seen[id] = 1;
    const newPlace = !!bt.place && bt.place !== place; if (bt.place) place = bt.place; if (bt.key) key = bt.key;
    if (!place) throw new Error(`board "${b.id}": the first beat needs a place`);
    return { ...bt, i, f: i === 0 ? 0 : f, id, wi: Math.max(0, wi), placeNow: place, keyNow: key, newPlace: newPlace && i > 0 };
  });
  for (let i = 1; i < beats.length; i++) if (beats[i].f <= beats[i - 1].f) throw new Error(`board "${b.id}": beat "${beats[i].id}" (f ${beats[i].f}) is not after "${beats[i - 1].id}" (f ${beats[i - 1].f})`);
  const T: Record<string, number> = { total }; beats.forEach((x) => { T[x.id] = x.f; });
  const end = (i: number) => beats[i + 1]?.f ?? total;
  // Default way into a shot: a new place dissolves; inside a place the camera TRAVELS to the next setup (up to 28 frames, motion
  // blur). Measured on the first board: 23 hard cuts a minute against 8.7 in the hero short and 2.7 on the channel, and
  // 20 % fast-motion frames against 39-55 %. Write `via: "cut"` where a cut is the point (on a word, shot / reverse shot).
  const shotBeats = beats.filter((x) => x.i === 0 || x.shot || x.newPlace);
  // 1.8 (second review): a travel shorter than about 24 felt frames reads as a whip. The eased travel does most of its way in
  // the middle 40 %, so it now takes 30-60 frames with a gentler ease; when the framing before it is shorter than 32 frames
  // there is no room for one and the default becomes a soft cut.
  const prevLen = new Map<number, number>(); shotBeats.forEach((x, k) => { if (k > 0) prevLen.set(x.i, x.f - shotBeats[k - 1].f); });
  const viaOf = (x: (typeof beats)[number]): Via => x.via ?? (x.newPlace ? "dissolve" : (prevLen.get(x.i) ?? 99) < 32 ? "cut" : "glide");
  const cuts = shotBeats.filter((x) => x.i > 0 && viaOf(x) === "cut").map((x) => x.f), soft = shotBeats.filter((x) => x.i > 0 && (viaOf(x) === "dissolve" || viaOf(x) === "whip")).map((x) => (viaOf(x) === "whip" ? x.f - 3 : x.f)); // a whip is a planned soft transition (it starts 3 frames before its cue)
  // travel windows (pure: the same arithmetic the camera uses): length follows the shot before, 12-28 frames, 60 % before the cue
  // 1.8: 20-40 frames. Reviewers called the 12-28 frame re-framings "teleports between keyframes" (reference glide: 44 f)
  const glideLen = (k: number) => { if (k <= 0) return 0; const len = shotBeats[k].f - shotBeats[k - 1].f; return Math.max(12, Math.min(len - 2, Math.max(30, Math.min(60, Math.round(len * 0.6))))); };
  const travels = shotBeats.map((x, k) => (k > 0 && viaOf(x) === "glide" ? ([x.f + Math.round(glideLen(k) * 0.4) - glideLen(k), x.f + Math.round(glideLen(k) * 0.4)] as [number, number]) : null)).filter((t): t is [number, number] => !!t);
  return { words, beats, T, total, end, viaOf, shotBeats, cuts, soft, F, travels, glideLen };
}
export type BoardPlan = ReturnType<typeof planBoard>;
const gagsOf = (bt: Beat): Gag[] => (bt.gag ? (Array.isArray(bt.gag) ? bt.gag : [bt.gag]) : []);

/** Default sound for what the picture does (audio/score.py turns names into samples or synthesis). */
export function boardSounds(b: Board, fps: number): { sounds: SoundCue[]; music: { f: number; mode: string }[]; rain: { f: number; amount: number }[]; places: { f: number; set: string; interior: boolean }[] } {
  const P = planBoard(b, fps), sounds: SoundCue[] = [], music: { f: number; mode: string }[] = [], rainC: { f: number; amount: number }[] = [], places: { f: number; set: string; interior: boolean }[] = [];
  const INTERIOR = new Set(["shop", "workshop", "office", "hall"]);
  for (const bt of P.beats) {
    const via = P.viaOf(bt), isShot = bt.i > 0 && (bt.shot || bt.newPlace);
    if (bt.i === 0 || bt.newPlace) places.push({ f: bt.f, set: b.places[bt.placeNow].set, interior: INTERIOR.has(b.places[bt.placeNow].set) });
    if (isShot && via === "dissolve") sounds.push({ f: bt.f, name: "swish", lu: -15, anchor: 0.135, pan: bt.i % 2 ? -0.3 : 0.3 });
    if (isShot && via === "whip") sounds.push({ f: bt.f + 3, name: "whoosh", lu: -12, anchor: 0.27 });
    for (const g of gagsOf(bt)) {
      if ("fx" in g) sounds.push({ f: bt.f, name: g.fx === "impact" ? "impact" : g.fx === "dust" ? "thud" : g.fx === "sparkle" || g.fx === "stars" ? "sparkle" : g.fx === "speedlines" ? "whoosh" : "pop", lu: g.fx === "impact" ? -8 : -15 });
      else if ("stamp" in g) sounds.push({ f: bt.f, name: "thud", lu: -13 });
      else if ("prop" in g && (g.in ?? "pop") !== "none") sounds.push({ f: bt.f, name: g.in === "drop" ? "thud" : "pop", lu: -15 });
      else if ("counter" in g) sounds.push({ f: bt.f, name: "tick", lu: -17 }, { f: bt.f + 6, name: "tick", lu: -17 }, { f: bt.f + 12, name: "ding", lu: -15 });
      else if ("big" in g) sounds.push({ f: bt.f, name: "impact", lu: -10 });
    }
    if (bt.crowd) sounds.push({ f: bt.f + 4, name: `crowd_${bt.crowd}`, lu: -12 });
    if (bt.kick) sounds.push({ f: bt.f, name: "thud", lu: -6, on_word: true });
    for (const s of bt.sfx ?? []) sounds.push(typeof s === "string" ? { f: bt.f, name: s } : { ...s, f: bt.f + (s.df ?? 0) });
    if (bt.music) music.push({ f: bt.f, mode: bt.music });
    if (bt.rain !== undefined) rainC.push({ f: bt.f, amount: bt.rain });
  }
  return { sounds: sounds.sort((a, c) => a.f - c.f), music, rain: rainC, places };
}

// ------------------------------------------------------------------------------------------------ the world
const EXTRAS = (Object.keys(KIND_PRESETS) as (keyof typeof KIND_PRESETS)[]).filter((k) => String(k).startsWith("bb"));
const EXTRAS_OLD = ["bbGent", "bbFarmer", "bbGrandma", "bbLady", "bbGrandpa", "bbChef", "bbArtist"] as (keyof typeof KIND_PRESETS)[]; // no hoodies or hard hats in 1695
const MODERN_SETS = new Set(["road", "office"]);
/** Rooms measured dark (mean luma 0.29-0.33 against 0.47 in the reference): wood and brick under a toon ramp. A gamma lift keeps the whites. */
export const INTERIOR_LIFT = { grade: { gamma: 1.22 } };
/** Depth of field by shot size [maxBlur, aperture]: the closer the shot, the softer the background (measured centre / border sharpness 1.06 without it, 1.95 in the reference). */
const DOF_BY_SIZE: Record<string, [number, number]> = { xclose: [15, 1.4], close: [14, 1.35], medium: [11, 1.15], insert: [16, 1.5], pov: [9, 1.0], two: [9, 1.05], full: [6, 0.85], low: [6, 0.85], wide: [3, 0.6], high: [4, 0.75], group: [4, 0.75] }; // wides stay sharp: the set is the picture
const specOf = (s: BobbleSpec | keyof typeof KIND_PRESETS): BobbleSpec => (typeof s === "string" ? (KIND_PRESETS[s] as BobbleSpec) : s);
const VEH = { car, bus, truck, carriage, bicycle } as Record<string, (o?: Record<string, unknown>) => Vehicle>;
const TALK: Cue[] = ["D", "C", "B", "E", "C", "F", "B", "D"];
type Seg = { f: number; f1: number; from: V3 | null; to: V3; place: string; hide: boolean; seat?: { vehicle: string; seat: string } | null };

function makeWorld(b: Board, P: BoardPlan, ctx: StageCtx) {
  const { scene, fps } = ctx, aspect = ctx.width / ctx.height;
  const placeIds = Object.keys(b.places), origin = (id: string): V3 => [placeIds.indexOf(id) * 160, 0, 0];
  // light plan from the beats' keys
  // a key change is an edit: on a cut it switches on the frame, on a dissolve it fades with the dissolve, inside a shot it fades over 14 frames
  const lpKeys: [number, string | LightKey, number][] = []; { let last: unknown; for (const bt of P.beats) if (bt.i === 0 || (bt.key && bt.key !== last)) { const sh = bt.i > 0 && (bt.shot || bt.newPlace), via = P.viaOf(bt);
    const sc = b.softCut ?? 4;
    lpKeys.push(!sh ? [bt.f, bt.keyNow, 14] : via === "dissolve" ? [bt.f + 5, bt.keyNow, 10] : via === "whip" ? [bt.f + 3, bt.keyNow, 0] : via === "glide" ? [bt.f + 6, bt.keyNow, 14] : [bt.f + Math.ceil(sc / 2), bt.keyNow, sc]); last = bt.keyNow; } }
  const LP = lightPlan(lpKeys, { fade: 14 });
  const L = LP.build(scene, { shadowSize: 46, target: origin(P.beats[0].placeNow) });
  const sets: Record<string, SetInstance> = {};
  for (const id of placeIds) { sets[id] = buildSet(b.places[id].set, { seed: `${b.id}-${id}`, ...b.places[id].opts }, origin(id)); scene.add(sets[id].group); }
  const mark = (m: Mark, place?: string): V3 => {
    if (Array.isArray(m)) { const o = origin(place ?? placeIds[0]); return [m[0] + o[0], m[1] + o[1], m[2] + o[2]]; }
    const [a, c] = m.includes(":") ? m.split(":") : [place ?? placeIds[0], m];
    const v = sets[a]?.marks[c]; if (!v) throw new Error(`board "${b.id}": no mark "${c}" in place "${a}" (${Object.keys(sets[a]?.marks ?? {}).join(", ")})`);
    return v;
  };
  // vehicles
  const vehicles: Record<string, { v: Vehicle; def: BoardVehicle; place: string; path: V3[] }> = {};
  for (const pid of placeIds) for (const [vid, def] of Object.entries(b.places[pid].vehicles ?? {})) { const v = VEH[def.kind](def.opts); scene.add(v.group); vehicles[vid] = { v, def, place: pid, path: def.path.map((m) => mark(m, pid)) }; }
  const vehU = (vid: string, f: number) => { const { def } = vehicles[vid], f0 = def.from ? P.T[def.from] : 0, f1 = def.to ? P.T[def.to] : P.total, u = clamp((f - f0) / Math.max(1, f1 - f0));
    return def.ease === "stop" ? ease.outCubic(u) : def.ease === "start" ? ease.inCubic(u) : u; };
  const placeVehicle = (vid: string, f: number) => { const x = vehicles[vid]; drive(x.v, x.path, vehU(vid, f)); x.v.group.updateMatrixWorld(true); };
  // actors: where everybody is, beat by beat
  const cast = Object.fromEntries(Object.entries(b.cast).map(([id, c]) => { const spec = { ...specOf(c.spec), id }, h = (c.height ?? 1.72);
    const card = new CharacterCard(spec, h * bobbleScale(spec), c.tex ?? 1500, L.sun, undefined, { top: 0.45, x: 0.6 }); card.group.visible = false; scene.add(card.group);
    return [id, { card, h, spec, segs: [] as Seg[], keys: [] as PoseKey[], talk: [] as [number, number, number, number][], looks: [] as { f: number; look?: string }[] }]; }));
  for (const bt of P.beats) for (const [id, a] of Object.entries(bt.act ?? {})) {
    const A = cast[id]; if (!A) throw new Error(`board "${b.id}": beat "${bt.id}" uses unknown actor "${id}"`);
    const last = A.segs[A.segs.length - 1], prev = last ? last.to : null;
    if (a.at !== undefined || a.walk !== undefined || a.hide !== undefined || a.seat !== undefined) {
      const to = a.walk !== undefined ? mark(a.walk, bt.placeNow) : a.at !== undefined ? mark(a.at, bt.placeNow) : prev ?? mark("center", bt.placeNow);
      const walking = a.walk !== undefined && !!prev && last.place === bt.placeNow && !last.hide;
      const dur = walking ? Math.max(6, Math.round((Math.hypot(to[0] - prev![0], to[2] - prev![2]) / (a.speed ?? 1.5)) * fps)) : 0;
      A.segs.push({ f: bt.f, f1: bt.f + dur, from: walking ? prev : null, to, place: bt.placeNow, hide: !!a.hide, seat: a.seat === undefined ? (last?.seat && a.at === undefined && a.walk === undefined ? last.seat : null) : a.seat });
    }
    if (a.pose !== undefined || a.expr || a.turn !== undefined || a.view || a.facing || a.hold !== undefined || a.hold2 !== undefined) {
      const base = typeof a.pose === "string" ? BOBBLE_POSES[a.pose] : a.pose;
      if (typeof a.pose === "string" && !base) throw new Error(`board "${b.id}": unknown pose "${a.pose}" (${Object.keys(BOBBLE_POSES).join(", ")})`);
      const prevPose = A.keys.length ? A.keys[A.keys.length - 1].pose : {};
      const pose: KPose = { ...(a.pose !== undefined ? base : prevPose) };
      if (a.expr) pose.expr = a.expr; if (a.turn !== undefined) pose.turn = a.turn; if (a.view) (pose as { view?: string }).view = a.view; if (a.facing) pose.facing = a.facing;
      if (a.hold !== undefined) pose.hold = a.hold ?? undefined; else if (a.pose !== undefined && prevPose.hold && !pose.hold) pose.hold = prevPose.hold; // a prop stays in the hand until put down
      if (a.hold2 !== undefined) pose.hold2 = a.hold2 ?? undefined; else if (a.pose !== undefined && prevPose.hold2 && !pose.hold2) pose.hold2 = prevPose.hold2;
      const hard = bt.newPlace || (!!bt.shot && P.viaOf(bt) !== "glide"); // on a cut the new pose starts ON the cut frame, not 3 frames before it
      A.keys.push({ f: Math.max(0, bt.f - (a.lead ?? (hard ? 0 : 3))), pose, blend: bt.i === 0 || hard ? 1 : 5 });
    }
    if (a.talk) A.talk.push([bt.f, P.end(bt.i), bt.wi, P.beats[bt.i + 1]?.wi ?? P.words.length]);
    if (a.look !== undefined) A.looks.push({ f: bt.f, look: a.look || undefined });
  }
  const actorState = (id: string, f: number): { pos: V3; walking: number; dir: V3; seg: Seg } | null => {
    const A = cast[id]; let s: Seg | null = null; for (const x of A.segs) if (x.f <= f) s = x; else break;
    if (!s || s.hide) return null;
    if (s.seat) { placeVehicle(s.seat.vehicle, f); return { pos: seatWorld(vehicles[s.seat.vehicle].v, s.seat.seat, A.h), walking: 0, dir: [1, 0, 0], seg: s }; }
    if (!s.from || f >= s.f1) return { pos: s.to, walking: 0, dir: [0, 0, 1], seg: s };
    const u = (f - s.f) / (s.f1 - s.f), dir: V3 = [s.to[0] - s.from[0], 0, s.to[2] - s.from[2]];
    return { pos: [lerp(s.from[0], s.to[0], u), lerp(s.from[1], s.to[1], u), lerp(s.from[2], s.to[2], u)], walking: 1, dir, seg: s };
  };
  const actorPos = (id: string, f: number) => actorState(id, f)?.pos ?? null;
  // props (gags)
  const api: BoardApi = { T: P.T, fps, aspect, sets, mark, actorPos, scene };
  const props: { id: string; obj: THREE.Object3D; upd?: (f: number, fps: number, api: BoardApi) => void; f0: number; f1: number; mode: string; scale: number; at: V3; center: boolean }[] = [];
  for (const bt of P.beats) for (const g of gagsOf(bt)) if ("prop" in g) {
    const made: BoardProp = b.props?.[g.prop] ? b.props[g.prop](api) : PROPS[g.prop] ? PROPS[g.prop](g.opts) : (() => { throw new Error(`board "${b.id}": unknown prop "${g.prop}" (${[...Object.keys(b.props ?? {}), ...Object.keys(PROPS)].join(", ")})`); })();
    const obj = (made as { group?: THREE.Object3D }).group ?? (made as THREE.Object3D), at = mark(g.at, bt.placeNow);
    obj.position.set(...at); if (g.ry) obj.rotation.y = g.ry; obj.traverse((o) => { (o as THREE.Mesh).castShadow = true; }); scene.add(obj);
    props.push({ id: g.id ?? g.prop, obj, upd: (made as { update?: (f: number, fps: number, api: BoardApi) => void }).update, f0: bt.f, f1: g.until ? P.T[g.until] ?? P.total : 1e9, mode: g.in ?? "pop", scale: g.scale ?? 1, at, center: g.origin === "center" });
  }
  const subjectOf = (name: string | V3, f: number, place: string, h = 1): Subject => {
    if (Array.isArray(name)) return { at: mark(name, place), h };
    if (cast[name]) { const p = actorPos(name, f) ?? mark("center", place); return { at: p, h: cast[name].h * (cast[name].spec.hat ? 1.12 : 1), eye: p[1] + cast[name].h * 0.8 }; }
    const pr = props.find((x) => x.id === name); if (pr) { const hh = h === 1 ? 0.5 : h; return { at: pr.center ? [pr.at[0], pr.at[1] - hh / 2, pr.at[2]] : pr.at, h: hh }; }
    if (vehicles[name]) { placeVehicle(name, f); const p = vehicles[name].v.group.position; return { at: [p.x, p.y, p.z], h: vehicles[name].v.height }; }
    return { at: mark(name, place), h };
  };
  // camera: shot grammar per beat
  const keys: CamKey[] = [], povHide: { f0: number; f1: number; id: string }[] = [], follows: NonNullable<Parameters<typeof cameraRig>[1]>["follow"] = [], audit: { f0: number; f1: number; subs: string[]; place: string }[] = [];
  // A travel (glide) starts BEFORE its cue and lands just after it, so the shot before it must END where the travel starts.
  // 1.7.0 ended every shot 2 frames before the next cue: the two moves overlapped, the rig handed over mid-travel and the
  // picture jumped half the way in one frame (12 of 23 detected cuts in the first board were these jumps).
  const soft = b.softCut ?? 4, GL = 28;
  const glideOf = (k: number) => P.glideLen(k); void GL;
  const leadOf = (k: number) => { const x = P.shotBeats[k]; if (!x) return 0; const v = P.viaOf(x); if (v === "glide") { const g = glideOf(k); return g - Math.round(g * 0.4) + 2; } return v === "whip" ? 5 : 0; };
  let lastSide = 0;
  P.shotBeats.forEach((bt, k) => {
    const ld = leadOf(k + 1), f1 = (P.shotBeats[k + 1]?.f ?? P.total + 12) - ld + (ld ? 4 : 0), // the shot's last key sits exactly where the next travel starts
       set = sets[bt.placeNow], sh0: BoardShot = bt.shot ?? { size: "wide" }, via0 = P.viaOf(bt), via: Via = via0 === "cut" && soft > 0 ? "soft" : via0, fAct = bt.f + 1;
    // eye trace: unless the board says otherwise, the new subject sits on the same side of the frame as the last one,
    // so the eye does not have to jump across the picture on a cut
    const sh: BoardShot = sh0.side === undefined && sh0.on !== undefined && !["two", "group", "wide", "pov"].includes(sh0.size) ? { ...sh0, side: lastSide } : sh0;
    if (sh.on !== undefined && typeof sh.side === "number") lastSide = sh.side;
    const names = sh.on === undefined ? [] : Array.isArray(sh.on) && typeof sh.on[0] === "string" ? (sh.on as string[]) : [sh.on as string | V3];
    let ks: CamKey[];
    if (!names.length) { const w = set.wide; ks = shotKeys({ ...sh, size: sh.size, on: { at: w.look, h: 0 } } as ShotSpec, { f0: bt.f, f1, aspect, via, box: set.camBox, first: bt.i === 0, glide: glideOf(k) || 26, settle: 0, soft, dissolve: 14 });
      const d: V3 = [w.pos[0] - w.look[0], w.pos[1] - w.look[1], w.pos[2] - w.look[2]]; // re-base the framing on the set's own establishing camera
      const p0 = ks[0].pos, l0 = ks[0].look; ks = ks.map((q) => ({ ...q, pos: [w.look[0] + d[0] + (q.pos[0] - p0[0]), w.look[1] + d[1] + (q.pos[1] - p0[1]), w.look[2] + d[2] + (q.pos[2] - p0[2])] as V3,
        look: [w.look[0] + (q.look[0] - l0[0]), w.look[1] + (q.look[1] - l0[1]), w.look[2] + (q.look[2] - l0[2])] as V3, fov: sh.fov ?? w.fov, via: undefined, focus: undefined })); }
    else { const subs = names.map((n) => subjectOf(n, fAct, bt.placeNow, sh.h)), from = sh.from ? subjectOf(sh.from, fAct, bt.placeNow) : undefined;
      ks = shotKeys({ ...sh, on: subs, from } as ShotSpec, { f0: bt.f, f1, aspect, via, box: set.camBox, first: bt.i === 0, glide: glideOf(k) || 24, soft, dissolve: 14 });
      if (sh.from && sh.size === "pov") povHide.push({ f0: bt.f, f1, id: sh.from });
      audit.push({ f0: ks[0].f + 2, f1, subs: names.filter((n): n is string => typeof n === "string" && !!cast[n]), place: bt.placeNow });
      if (sh.follow) { const s0 = subjectOf(sh.follow, fAct, bt.placeNow), a = frameShot({ ...sh, on: subs, from } as ShotSpec, aspect, set.camBox), id = sh.follow, hh = s0.h * 0.6;
        // the key path must END where the follow ends (the subject has moved): otherwise the camera jumps back to where the
        // subject started the moment the follow is over (an unplanned cut at the end of the car shot)
        const sE = subjectOf(id, f1 - 2, bt.placeNow), dE: V3 = [sE.at[0] - s0.at[0], sE.at[1] - s0.at[1], sE.at[2] - s0.at[2]], sh3 = (p: V3): V3 => [p[0] + dE[0], p[1] + dE[1], p[2] + dE[2]];
        const lastK = ks[ks.length - 1];
        if (ks.length > 1 && lastK.f > ks[0].f + 4) ks[ks.length - 1] = { ...lastK, pos: sh3(lastK.pos), look: sh3(lastK.look), via: undefined, glide: Math.max(2, lastK.f - ks[0].f), ease: "linear" };
        else ks.push({ f: f1 - 2, pos: sh3(a.pos), look: sh3(a.look), fov: a.fov, focus: a.focus, glide: Math.max(2, f1 - 2 - ks[ks.length - 1].f), ease: "linear" });
        follows.push({ f0: bt.f + 1, f1: f1 - 2, blend: 6, blendOut: 4, lookAhead: 0, target: (f) => { const s = subjectOf(id, f, bt.placeNow); return [s.at[0], s.at[1] + hh, s.at[2]]; }, offset: [a.pos[0] - s0.at[0], a.pos[1] - s0.at[1] - hh, a.pos[2] - s0.at[2]] }); } }
    keys.push(...ks);
  });
  const rig = cameraRig(keys, { refFps: 30, handheld: b.rig?.handheld ?? 0.012, handheldSpeed: 0.4, follow: follows,
    push: { rate: b.rig?.push ?? 0.0024, punches: P.beats.filter((x) => x.punch).map((x) => ({ f: x.f - 2, rate: 0.0065, n: 28 })) },
    kicks: P.beats.filter((x) => x.kick).map((x) => ({ f: x.f, amp: x.kick! })) });
  // crowds, walkers, dust
  const crowds: Record<string, CrowdPool> = {};
  const marksUsed = (pid: string) => Object.values(cast).flatMap((A) => A.segs.filter((s) => s.place === pid).map((s) => s.to));
  for (const pid of placeIds) { const pl = b.places[pid], set = sets[pid]; if (!pl.crowd && !pl.walkers) continue;
    const pool = (crowds[pid] = new CrowdPool(scene, L.sun)), used = marksUsed(pid), camKeys = rig.keys;
    const old = (pl.opts?.era ?? (MODERN_SETS.has(pl.set) ? "modern" : "old")) === "old", ex = (pl.extras ?? (old ? EXTRAS_OLD : EXTRAS)).map(specOf), extra = (k: number) => ex[k % ex.length];
    set.crowdSpots.filter((s) => !used.some((u) => Math.hypot(u[0] - s[0], u[2] - s[2]) < 1.0) && !blocksShot([s[0], s[1], s[2]], 0.6, camKeys)).slice(0, pl.crowd ?? 0)
      .forEach((s, i) => { const spec = { ...extra(i * 3 + (hash32(pid) % 7)), id: `${pid}c${i}` }; pool.add({ spec, heightM: 1.68 * bobbleScale(spec), pos: s, expr: i % 3 ? "neutral" : "happy", seed: i + 1 + (hash32(pid) % 50) }, 8); });
    // walkers keep to the far pavement: one on the camera side fills a 9:16 frame
    for (let i = 0; i < (pl.walkers ?? 0); i++) { const z = -5.9 + (i % 3) * 0.3, o = origin(pid), a = i % 2 ? 26 : -26, spec = { ...extra(i * 2 + 4), id: `${pid}w${i}` };
      pool.add({ spec, heightM: 1.68 * bobbleScale(spec), seed: 30 + i, path: { from: [o[0] + a, 0.16, o[2] + z], to: [o[0] - a, 0.16, o[2] + z], t0: -i * 7, t1: P.total / fps + 6 + i * 5 } }, 14); }
    pool.react(P.beats.filter((x) => x.crowd && x.placeNow === pid).map((x) => { const on = x.shot?.on, n = Array.isArray(on) ? on[0] : on; return { f: x.f, kind: x.crowd!, at: typeof n === "string" ? subjectOf(n, x.f + 1, pid).at : undefined, dur: Math.min(70, P.end(x.i) - x.f) }; })); }
  const dust = placeIds.filter((pid) => b.places[pid].dust ?? sets[pid].interior).map((pid) => { const o = origin(pid); return motes(scene, { center: [o[0], 2.6, o[2] + 1], size: [9, 5, 10], n: 260, seed: pid, px: 0.04 }); });
  // rain and wet ground
  const wetIds = placeIds.filter((pid) => b.places[pid].wet), wet = wetIds.map((pid) => { const o = origin(pid), big = b.places[pid].set !== "alley", w = wetGround(big ? 80 : 6.0, big ? 17 : 30, { puddles: 0.45 }); w.mesh.position.set(o[0], big ? 0.03 : 0.02, o[2] + (big ? 0 : -3)); scene.add(w.mesh); return w; });
  const R = wetIds.length || P.beats.some((x) => x.rain) ? rain(scene) : null;
  const rainAt = (f: number) => { let a = 0, b0 = 0, fa = 0; for (const x of P.beats) if (x.rain !== undefined && x.f <= f + 12) { b0 = a; a = x.rain; fa = x.f; } return lerp(b0, a, clamp((f - fa + 12) / 12)); };
  // effects
  const fx = new FxLayer(scene);
  for (const bt of P.beats) for (const g of gagsOf(bt)) if ("fx" in g) { const s = subjectOf(g.on, bt.f + 1, bt.placeNow); fx.add(g.fx, { at: [s.at[0], s.at[1] + s.h + (g.dy ?? 0.3), s.at[2] + 0.1], f0: bt.f, size: g.size ?? 0.55, color: g.color ?? "#ffd23f" }); }
  LP.toonify(scene);
  const placeAt = (f: number) => { let p = P.beats[0].placeNow; for (const x of P.beats) if (x.f <= f) p = x.placeNow; else break; return p; };
  const focusEv = P.beats.filter((x) => x.focus || x.i === 0 || x.shot || x.newPlace).map((x) => ({ f: x.f, name: x.focus ?? null }));
  // 1.8: the shot audit also checks what a beat points at (`focus`) and who speaks (`talk`): a shot framed on a point has no
  // named subjects, and the first review round missed a noose, a cup and two heads at the frame edge that way
  const mustSee: { f0: number; f1: number; name: string; place: string }[] = [];
  P.beats.forEach((x) => { const nxt = P.shotBeats.find((y) => y.f > x.f)?.f ?? P.total, f1 = Math.min(nxt - 2, x.f + 26);
    for (const n of [x.focus, ...Object.entries(x.act ?? {}).filter(([, a]) => a.talk).map(([k]) => k)]) if (n && f1 > x.f + 8) mustSee.push({ f0: x.f + 8, f1, name: n, place: x.placeNow }); });
  return { LP, L, sets, cast, rig, props, crowds, dust, wet, wetIds, R, rainAt, fx, vehicles, placeVehicle, actorState, povHide, audit, placeAt, origin, api, mark, subjectOf, follows, focusEv, mustSee };
}
type BoardWorld = ReturnType<typeof makeWorld>;

function updateWorld(w: BoardWorld, P: BoardPlan, f: number, fps: number): CamState {
  const cam = w.rig.at(f, fps), pid = w.placeAt(f), set = w.sets[pid];
  const u = w.LP.update(f, fps, { target: w.origin(pid), cookieMul: set.interior ? 0 : 1 });
  void set;
  // only the place we are in (and the one a dissolve is coming from / going to) is drawn: 8 dressed sets in one world
  const near = new Set([pid, w.placeAt(f - 14), w.placeAt(f + 14)]);
  for (const [id, s] of Object.entries(w.sets)) { s.group.visible = near.has(id); if (!s.group.visible) continue; s.setNight(u.practicals); s.setSky(u.skyTop, u.skyHorizon); s.update(f, fps); }
  for (const [id, c] of Object.entries(w.crowds)) c.setVisible(near.has(id));
  for (const x of Object.values(w.vehicles)) x.v.group.visible = near.has(x.place);
  for (const vid of Object.keys(w.vehicles)) { w.placeVehicle(vid, f); w.vehicles[vid].v.setLights(w.vehicles[vid].def.lights ? 1 : u.practicals > 0.5 ? 1 : 0); }
  const right: V3 = [cam.look[2] - cam.pos[2], 0, -(cam.look[0] - cam.pos[0])]; // screen-right direction is -right; see `side`
  const side = (from: V3, to: V3) => ((to[0] - from[0]) * -right[0] + (to[2] - from[2]) * -right[2] >= 0 ? 1 : -1);
  for (const [id, A] of Object.entries(w.cast)) {
    const st = w.actorState(id, f), hidden = !st || w.povHide.some((h) => h.id === id && f >= h.f0 && f < h.f1);
    A.card.group.visible = !hidden; if (hidden || !st) continue;
    const seed = hash32(id) % 97;
    let pose: KPose = { ...(idlePose(f, fps, seed) as KPose), ...(A.keys.length ? poseTrack(A.keys, f, fps) : {}) };
    let lk: string | undefined; for (const l of A.looks) if (l.f <= f) lk = l.look;
    if (lk && pose.turn === undefined) { const t = w.cast[lk] ? w.actorState(lk, f)?.pos : w.mark(lk, pid); if (t) pose.turn = 0.65 * side(st.pos, t); }
    if (st.walking) { const wp = walkPose(f + seed * 3, fps, 2.7) as KPose; pose = { ...pose, ...wp, view: "side", facing: side([0, 0, 0], st.dir) as 1 | -1, limbs: undefined, turn: 0, hold: pose.hold }; }
    if (st.seg.seat) pose = { ...pose, ...seatPose(w.vehicles[st.seg.seat.vehicle].v, st.seg.seat.seat, cam.pos, { expr: pose.expr }) };
    const tk = A.talk.find((t) => f >= t[0] && f < t[1]);
    if (tk) { const t = f / fps; pose.cue = "X"; for (let i = tk[2]; i < tk[3]; i++) { const wd = P.words[i]; if (t >= wd.start - 0.03 && t < wd.end) { pose.cue = TALK[(Math.floor((t - wd.start) / 0.08) + wd.word.length) % TALK.length]; break; } } }
    // micro-animation where the eye is: posed hands breathe and the head sways a little (measured 0.010 against 0.020-0.027)
    if (!st.walking && !st.seg.seat) { const t = f / fps, ph = seed * 1.7;
      if (pose.limbs) { const L = { ...pose.limbs } as Record<string, [number, number] | undefined>;
        for (const [k, i] of [["handL", 0], ["handR", 1]] as [string, number][]) if (L[k]) L[k] = [L[k]![0] + 0.034 * Math.sin(t * 2.3 + ph + i * 2.1), L[k]![1] + 0.046 * Math.sin(t * 1.7 + ph * 1.3 + i)];
        pose.limbs = L as KPose["limbs"]; }
      pose.headTilt = (pose.headTilt ?? 0) + 2.6 * Math.sin(t * 1.3 + ph) + 1.2 * Math.sin(t * 2.9 + ph * 2);
      pose.lean = (pose.lean ?? 0) + 1.4 * Math.sin(t * 1.1 + ph * 0.7);
      pose.bob = (pose.bob ?? 0) + 0.012 * Math.sin(t * 2.2 + ph * 1.9);
      // eyes are never parked: a slow drift plus a quick glance every ~3 s; hair, hat and coat hem keep swaying a little
      if (pose.look === undefined) { const cyc = (t * 0.31 + seed * 0.37) % 1, dart = cyc < 0.07 ? (seed % 2 ? 0.55 : -0.55) : 0; pose.look = [0.22 * Math.sin(t * 0.8 + ph) + dart, 0.1 * Math.sin(t * 0.6 + ph * 1.4)]; }
      pose.settle = (pose.settle ?? 0) + 1.5 * Math.sin(t * 1.9 + ph) + 0.6 * Math.sin(t * 4.1 + ph * 2.3); }
    // a small nod on every spoken word: the acting breathes with the narration
    if (!st.walking) { const t = f / fps; for (const wd of P.words) { if (wd.start > t) break; const dt = t - wd.start; if (dt < 0.2 && wd.word.length > 3) { const pu = Math.sin((dt / 0.2) * Math.PI); pose.bob = (pose.bob ?? 0) - 0.02 * pu; pose.headTilt = (pose.headTilt ?? 0) + 1.6 * pu * (seed % 2 ? 1 : -1); } } }
    pose.blink = blinkAt(f, fps, id, A.keys.map((k) => k.f));
    A.card.blob.visible = !st.seg.seat; // a seated card has no contact shadow on the ground
    A.card.setPose(pose, f, fps); A.card.place(st.pos[0], st.pos[1], st.pos[2], cam.pos);
  }
  for (const p of w.props) { const on = f >= p.f0 && f < p.f1; p.obj.visible = on; if (!on) continue;
    const t = (f - p.f0) / fps, k = p.mode === "pop" ? springAt(t, 3.4, 0.5) : 1; p.obj.scale.setScalar(Math.max(0.001, p.scale * k));
    p.obj.position.y = p.at[1] + (p.mode === "drop" ? Math.max(0, 2.2 - 0.5 * 30 * t * t) * (t < 0.4 ? 1 : 0) + (t >= 0.38 ? 0.05 * Math.exp(-(t - 0.38) * 10) * Math.abs(Math.sin((t - 0.38) * 26)) : 0) : 0);
    p.upd?.(f, fps, w.api); }
  for (const [id, c] of Object.entries(w.crowds)) if (near.has(id)) c.update(f, fps, cam.pos);
  for (const d of w.dust) d.update(f, fps);
  const ra = w.rainAt(f);
  w.R?.update(f, fps, cam.look, ra, w.origin(pid)[1]);
  w.wet.forEach((x, i) => x.update(f, fps, w.wetIds[i] === pid ? ra : 0));
  w.fx.update(f, cam.pos, fps);
  // rack focus: `focus` on a beat pulls the focal plane to that subject over 10 frames
  { type FE = { f: number; name: string | null }; let cur = null as FE | null, prev = null as FE | null; for (const e of w.focusEv) { if (e.f > f) break; prev = cur; cur = e; }
    const dist = (n: string | null) => { if (!n) return cam.focus; const s = w.subjectOf(n, f, pid); return Math.hypot(cam.pos[0] - s.at[0], cam.pos[1] - (s.at[1] + s.h * 0.7), cam.pos[2] - s.at[2]); };
    if (cur) { const t = clamp((f - cur.f) / 10), e = t * t * (3 - 2 * t); cam.focus = lerp(prev && cur.name ? dist(prev.name) : dist(cur.name), dist(cur.name), e); } }
  return driftCam(cam, f, fps);
}

/** The camera is never perfectly level or still: a slow roll drift on top of the rig (reference: a long roll over a 13 s take). */
const driftCam = (c: CamState, f: number, fps: number): CamState => ({ ...c, roll: c.roll + 1.1 * Math.sin((f / fps) * 0.42 + 1) + 0.45 * Math.sin((f / fps) * 0.97) });

// ------------------------------------------------------------------------------------------------ 2D overlays from the gags
const Overlays: React.FC<{ P: BoardPlan }> = ({ P }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig(), { u, width, height } = useU();
  const out: React.ReactNode[] = [];
  const stroke = (px: number) => ({ WebkitTextStroke: `${px * u}px #140c10`, paintOrder: "stroke fill" as const });
  for (const bt of P.beats) gagsOf(bt).forEach((g, gi) => {
    if ("prop" in g || "fx" in g) return;
    const f1 = g.until ? P.T[g.until] ?? P.total : P.end(bt.i); if (f < bt.f || f >= f1) return;
    const t = (f - bt.f) / fps, k = springAt(t, 3.2, 0.5), o = 1 - clamp((f - f1 + 6) / 6), key = `${bt.id}${gi}`;
    if ("stamp" in g) out.push(<div key={key} style={{ position: "absolute", [g.side === "right" ? "right" : "left"]: width * 0.07, top: height * 0.13, opacity: o, transform: `rotate(${g.side === "right" ? 6 : -6}deg) scale(${k})`,
      padding: `${8 * u}px ${26 * u}px`, background: g.color ?? "#f4efe6", border: `${6 * u}px solid #140c10`, borderRadius: 16 * u, fontFamily: FONTS.heavy, fontSize: 70 * u, color: "#140c10" }}>{g.stamp}</div>);
    else if ("label" in g) out.push(<div key={key} style={{ position: "absolute", left: 0, right: 0, top: height * (g.y ?? 0.2), textAlign: "center", opacity: o, transform: `scale(${k})`, fontFamily: FONTS.heavy, fontSize: 78 * u, color: g.color ?? "#ffd23f", ...stroke(4) }}>{g.label}</div>);
    else if ("counter" in g) { const c = g.counter, v = lerp(c.from ?? 0, c.to, ease.outCubic(clamp(t / Math.min(1.1, Math.max(0.3, (f1 - bt.f) / fps * 0.6)))));
      out.push(<div key={key} style={{ position: "absolute", left: 0, right: 0, top: height * (g.y ?? 0.16), textAlign: "center", opacity: o, transform: `scale(${0.85 + 0.15 * k})`, fontFamily: FONTS.heavy, fontSize: 150 * u, color: g.color ?? "#ffd23f", ...stroke(7) }}>
        {c.prefix ?? ""}{v.toFixed(c.decimals ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}{c.suffix ?? ""}</div>); }
    else if ("big" in g) out.push(<div key={key} style={{ position: "absolute", left: 0, right: 0, top: height * (g.y ?? 0.3), textAlign: "center", opacity: o, transform: `rotate(-4deg) scale(${k * (1 + 0.04 * Math.sin(t * 9))})`, fontFamily: FONTS.heavy, fontSize: 170 * u, color: g.color ?? "#ff3b3b", ...stroke(8) }}>{g.big}</div>);
  });
  return <AbsoluteFill style={{ pointerEvents: "none" }}>{out}</AbsoluteFill>;
};

// ------------------------------------------------------------------------------------------------ the project
export function boardProject(b: Board): ProjectDef {
  const plans = new Map<number, BoardPlan>(), planFor = (fps: number) => { if (!plans.has(fps)) plans.set(fps, planBoard(b, fps)); return plans.get(fps)!; };
  const World: React.FC = () => {
    const { fps } = useVideoConfig(), P = planFor(fps), ref = React.useRef<BoardWorld | null>(null);
    return (
      <Stage3D<BoardWorld> look={(f) => { const w = ref.current!, pid = w.placeAt(f), pl = b.places[pid]; let l = w.LP.look(f);
        if (b.look) l = deepMergeLook(l, b.look);
        const pk = pl.look ?? (w.sets[pid].interior ? INTERIOR_LIFT : null); if (pk) l = deepMergeLook(l, pk);
        let k = 0; for (let i = 0; i < P.shotBeats.length; i++) if (P.shotBeats[i].f <= f) k = i; else break;
        const dofOf = (i: number) => DOF_BY_SIZE[P.shotBeats[i].shot?.size ?? "wide"] ?? DOF_BY_SIZE.wide, win = (i: number) => { const g = P.glideLen(i), s = P.shotBeats[i].f + Math.round(g * 0.4) - g; return [s, g] as const; };
        let d = dofOf(k), travelling = false;
        const nx = P.shotBeats[k + 1];
        if (nx && P.viaOf(nx) === "glide") { const [s, g] = win(k + 1); if (f >= s) { const t = ease.smooth(clamp((f - s) / g)), e = dofOf(k + 1); d = [lerp(d[0], e[0], t), lerp(d[1], e[1], t)]; travelling = true; } }
        if (!travelling && k > 0 && P.viaOf(P.shotBeats[k]) === "glide") { const [s, g] = win(k); if (f < s + g) { const t = ease.smooth(clamp((f - s) / g)), a0 = dofOf(k - 1); d = [lerp(a0[0], d[0], t), lerp(a0[1], d[1], t)]; travelling = true; } }
        l = { ...l, dof: { ...l.dof, enabled: true, maxBlur: d[0], aperture: d[1] }, ...(travelling ? { motionBlur: l.motionBlur * 0.45 } : {}) }; // (blur stripes on a travel: fewer, shorter streaks)
        // camera motion blur smears a subject the camera is following (it is still on screen): keep only a trace of it
        return w.follows!.some((x) => f >= x.f0 && f <= x.f1) ? { ...l, motionBlur: l.motionBlur * 0.15 } : l; }}
        camAt={(f, fp) => driftCam(ref.current!.rig.at(f, fp), f, fp)} cuts={P.cuts}
        dissolveAt={(f, fp) => { const d = ref.current!.rig.dissolveAt(f, fp); return d ? { a: driftCam(d.a, f, fp), b: driftCam(d.b, f, fp), t: d.t } : null; }}
        audit={(f, w) => { if (f % 6) return null; const a = w.audit.find((x) => f >= x.f0 && f < x.f1), ms = w.mustSee.filter((x) => f >= x.f0 && f < x.f1); if (!a && !ms.length) return null;
          const names = [...new Set([...(a?.subs ?? []), ...ms.map((x) => x.name)])], place = a?.place ?? ms[0].place;
          return names.map((n): ShotSubject | null => { const s = w.subjectOf(n, f, place), isCard = !!w.cast[n]; return isCard && !w.actorState(n, f) ? null : { name: n, at: [s.at[0], s.at[1] + s.h * (isCard ? 0.72 : 0.5), s.at[2]], r: s.h * 0.3 }; }).filter((x): x is ShotSubject => !!x); }}
        build={(ctx) => { const w = makeWorld(b, P, ctx); ref.current = w; return w; }}
        update={(w, f, { fps: fp }) => updateWorld(w, P, f, fp)} />
    );
  };
  return {
    id: b.id, title: b.title, defaultFormat: "short", fps: b.fps ?? 30, audio: b.audio ?? `${b.id}/master.wav`,
    thumbnails: (fps) => (b.thumbnails ? b.thumbnails(planFor(fps).T, World) : autoThumbs(b, planFor(fps), World)), // 1.8: every board has thumbnails
    scenes: ({ fps }) => {
      const P = planFor(fps), S = boardSounds(b, fps);
      const scene: SceneDef = {
        id: "board", frames: P.total, innerCuts: P.cuts, innerSoft: P.soft, cues: Object.fromEntries(P.beats.map((x) => [x.id, x.f])),
        events: [...new Set([...P.beats.flatMap((x) => [...(gagsOf(x).length || x.crowd || x.kick ? [x.f, x.f + 2] : []), ...(x.event ?? []).map((d) => x.f + d), ...(P.viaOf(x) === "whip" && x.shot ? [x.f, x.f + 3, x.f + 6] : []), ...(P.viaOf(x) === "dissolve" && (x.shot || x.newPlace) ? [x.f - 7, x.f, x.f + 7] : [])])])].filter((x) => x > 0 && x < P.total).sort((a, c) => a - c),
        sounds: S.sounds, music: S.music, rain: S.rain, places: S.places, travels: P.travels, lint: lintBoard(b, fps),
        render: () => { let y: number | undefined; const ys = P.beats.filter((x) => x.caption !== undefined).map((x) => [x.f, x.caption!] as [number, number]);
          return (<><World /><Overlays P={P} />{b.overlay?.(P.T, fps)}<WordCaptions words={P.words} size={110} yAt={(fr) => { y = 0.7; for (const [f0, v] of ys) if (f0 <= fr) y = v; return y; }} /></>); },
      };
      return [scene];
    },
  };
}
/**
 * What a reviewer would say about the edit, before anything is rendered (1.8). Printed by `tools/render.mjs --stills`
 * and written to timeline.json (`lint`); `make.mjs` shows it after the stills.
 */
export function lintBoard(b: Board, fps: number): string[] {
  const P = planBoard(b, fps), out: string[] = [], sec = (f: number) => (f / fps).toFixed(1);
  // a SHOT starts on a cut or a dissolve; a travel (`glide`) re-frames inside the running shot
  const starts = P.shotBeats.filter((x) => x.i === 0 || P.viaOf(x) !== "glide"), shots = starts.map((x, k) => ({ x, len: (starts[k + 1]?.f ?? P.total) - x.f }));
  const asl = P.total / fps / shots.length;
  if (asl < 3) out.push(`average shot ${asl.toFixed(1)} s (${shots.length} shots in ${sec(P.total)} s): hold shots 4-6 s and let beats change the acting, the gag and the \`focus\` inside a shot`);
  for (const { x, len } of shots) if (len < 1.2 * fps && x.i > 0) out.push(`shot "${x.id}" lasts ${sec(len)} s (f ${x.f}): too short to read; make it a beat inside the shot before it, or give it 1.5 s`);
  P.shotBeats.forEach((x, k) => { const len = (P.shotBeats[k + 1]?.f ?? P.total) - x.f; if (x.i > 0 && P.viaOf(x) === "glide" && len < 0.9 * fps) out.push(`the camera re-frames on "${x.id}" for only ${sec(len)} s (f ${x.f}): start the travel a beat earlier or drop it`); });
  for (const x of P.shotBeats) if (x.i > 0 && P.viaOf(x) === "whip") out.push(`shot "${x.id}" comes in on a whip: use a slow travel inside a place, a dissolve to a new one`);
  // the viewer counts FRAMINGS, not takes: every travel is a new picture
  const fr = P.shotBeats.map((x, k) => (P.shotBeats[k + 1]?.f ?? P.total) - x.f), shortest = Math.min(...fr);
  if (P.shotBeats.length > shots.length * 2.2) out.push(`${P.shotBeats.length} framings in ${shots.length} takes (shortest ${sec(shortest)} s): more than two re-framings per take read as restless; let a beat act inside the framing instead`);
  // a stamp, label or counter that shows the word the caption is showing in the same frames is the same text twice
  const said = (f0: number, f1: number) => new Set(P.words.filter((w) => w.start * fps < f1 && w.end * fps > f0).map((w) => clean(w.word)));
  for (const x of P.beats) for (const g of gagsOf(x)) { const txt = "stamp" in g ? g.stamp : "label" in g ? g.label : "counter" in g ? String(g.counter.to) : null; if (!txt) continue;
    const until = (g as { until?: string }).until, f1 = Math.min(until ? P.T[until] ?? P.total : P.total, x.f + 3 * fps), sp = said(x.f, f1), hit = txt.split(/\s+/).map(clean).filter((t) => (t.length > 3 || /^\d+$/.test(t)) && sp.has(t));
    if (hit.length) out.push(`the ${"stamp" in g ? "stamp" : "label" in g ? "label" : "counter"} "${txt}" (${x.id}) repeats the caption word${hit.length > 1 ? "s" : ""} "${hit.join(", ")}": show something the narrator does not say, or drop it`); }
  const texts: { id: string; f0: number; f1: number; kind: string }[] = [];
  for (const x of P.beats) for (const g of gagsOf(x)) { const kind = "label" in g ? "label" : "counter" in g ? "counter" : "big" in g ? "big" : null; if (!kind) continue;
    const until = (g as { until?: string }).until, f1 = until ? P.T[until] ?? P.total : Math.min(P.total, P.shotBeats.find((y) => y.f > x.f)?.f ?? P.total); texts.push({ id: x.id, f0: x.f, f1, kind });
    if (kind === "big" && f1 - x.f < fps) out.push(`"${g && "big" in g ? g.big : ""}" (${x.id}) is on screen ${sec(f1 - x.f)} s: hold the climax at least 1 s (\`until\`)`); }
  for (let i = 1; i < texts.length; i++) if (texts[i].f0 < texts[i - 1].f1 - 2) out.push(`two texts at once: ${texts[i - 1].kind} of "${texts[i - 1].id}" is still up when the ${texts[i].kind} of "${texts[i].id}" appears (f ${texts[i].f0}); end the first with \`until\``);
  const acts = P.beats.filter((x) => x.act && Object.values(x.act).some((a) => a.pose !== undefined || a.walk !== undefined)).length;
  if (acts < P.beats.length * 0.5) out.push(`only ${acts} of ${P.beats.length} beats change a pose or move someone: the people must DO the thing the narrator says (tools in the hand: \`hold\`, \`hold2\`)`);
  return out;
}

// ------------------------------------------------------------------------------------------------ thumbnails from the storyboard (1.8)
const TH_STOP = new Set(["why", "how", "what", "the", "real", "reason", "you", "we", "they", "your"]);
/** 2-4 words from the title, on two lines: "Why You Can't Shave a Coin" -> "CAN'T SHAVE|A COIN". */
export function thumbWords(title: string): { text: string; highlight?: string } {
  let w = title.replace(/[^A-Za-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);
  while (w.length > 2 && TH_STOP.has(w[0].toLowerCase())) w = w.slice(1);
  if (w.length > 4) w = w.filter((x) => x.length > 3 || /^\d/.test(x)).slice(0, 3);
  const cut = Math.ceil(w.length / 2), neg = w.find((x) => /n't$|^(no|not|never|nobody)$/i.test(x));
  return { text: (w.length > 2 ? `${w.slice(0, cut).join(" ")}|${w.slice(cut).join(" ")}` : w.join(" ")).toUpperCase(), highlight: (neg ?? [...w].sort((a, c) => c.length - a.length)[0])?.toLowerCase().replace(/[^a-z0-9]/g, "") };
}
/**
 * A board without its own `thumbnails` gets these: the hook, the big word, the number, the evidence and the payoff, each
 * frozen from the 3D world (no captions) with 1-3 huge words. `tools/thumbs.mjs` renders them at 1280x720, 2560x1440 and
 * 1080x1920 and ranks them; a board that wants other moments declares `thumbnails` itself.
 */
export function autoThumbs(b: Board, P: BoardPlan, World: React.FC): ThumbVariant[] {
  const scene = () => React.createElement(World), tw = thumbWords(b.title), out: ThumbVariant[] = [];
  const two = (s: string) => { const w = s.toUpperCase().split(/\s+/); return w.length > 2 ? `${w.slice(0, Math.ceil(w.length / 2)).join(" ")}|${w.slice(Math.ceil(w.length / 2)).join(" ")}` : w.join(" "); };
  const shotEnd = (i: number) => { const nx = P.shotBeats.find((x) => x.f > P.beats[i].f); return (nx?.f ?? P.total) - 8; };
  const add = (id: string, note: string, frame: number, text: ThumbVariant["text"], more: Partial<ThumbVariant> = {}) => {
    frame = Math.round(clamp(frame, 2, P.total - 2)); if (out.some((v) => Math.abs(v.frame - frame) < 12 || v.text?.text === text?.text)) return;
    out.push({ id, note, frame, scene, text, layout: "top", focus: [0.5, 0.6], pop: 0.65, scrim: 0.35, cam: { dolly: 0.92 },
      byKind: { long: { layout: "left", cam: { dolly: 0.92, shift: [0.2, 0] }, focus: [0.68, 0.52] } }, ...more }); };
  // 1. the hook: the first thing that happens (the second beat), with the title's words
  // (the END of the first shot: by then the camera has reached the person; words at the bottom so they do not cover the face)
  add("hook", `the hook (end of the first shot) with the title's words`, shotEnd(0), tw, { layout: "bottom", focus: [0.5, 0.4], cam: { dolly: 0.95 }, byKind: {} });
  // 2. the big word of the story (a `big` gag is the climax)
  for (const x of P.beats) for (const g of gagsOf(x)) if ("big" in g) add("climax", `the climax "${g.big}" (${x.id})`, x.f + 14, { text: `${g.big.toUpperCase()}!`, highlight: g.big.toLowerCase().split(/\s+/)[0], pill: "#ff2d2d" });
  // 3. the number (a counter gag): numbers pull clicks when the picture shows what is counted
  for (const x of P.beats) for (const g of gagsOf(x)) if ("counter" in g) add(`n${g.counter.to}`, `the number ${g.counter.to} (${x.id})`, x.f + 20, { text: `${g.counter.prefix ?? ""}${g.counter.to}${(g.counter.suffix ?? "").toUpperCase()}`.trim().replace(/\s+(?=\S+$)/, "|"), highlight: String(g.counter.to) });
  // 4. the evidence: an insert on a prop, with its label when it has one
  for (const x of P.beats) { if (x.shot?.size !== "insert" || x.i === 0) continue; const end = shotEnd(x.i);
    const lab = P.beats.filter((y) => y.f >= x.f && y.f <= end).flatMap((y) => gagsOf(y)).filter((g): g is Extract<Gag, { label: string }> => "label" in g).pop();
    add(`proof${x.i}`, `the evidence (${x.id})`, end, lab ? { text: two(lab.label), highlight: lab.label.toLowerCase().split(/\s+/).sort((a, c) => c.length - a.length)[0] } : { text: tw.text + "?", highlight: tw.highlight }); }
  // 5. the hardest hit that is not one of the above
  const hit = [...P.beats].filter((x) => x.kick).sort((a, c) => (c.kick ?? 0) - (a.kick ?? 0))[0];
  if (hit) add("hit", `the hardest hit (${hit.id})`, hit.f + 6, { text: tw.text + "?", highlight: tw.highlight });
  return out.slice(0, 6);
}
function deepMergeLook<T>(a: T, o: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
  for (const [k, v] of Object.entries(o)) out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" ? deepMergeLook(out[k], v as Record<string, unknown>) : v;
  return out as T;
}
