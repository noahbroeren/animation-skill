/**
 * Shot grammar (1.7): name the shot, get the camera. Built on `frameDistance()` (lib/camera.ts) so a "close" is the
 * same size in 9:16 and 16:9 and never cuts a head off.
 *
 *   const k = frameShot({ size: "medium", on: { at: [0, 0, 0], h: 1.8 }, angle: 25 }, 9 / 16);   // -> { pos, look, fov, focus }
 *   const keys = shotKeys({ size: "close", on, move: "orbit" }, { f0: 120, f1: 210, aspect: 9 / 16, via: "cut" });
 *
 * Sizes: wide (the place, figure about a quarter of the frame), full (head to toe), medium (waist up), close (head and
 * shoulders), xclose (the face), two / group (pass several subjects), insert (a prop: h = its size), low (hero angle
 * from the ground), high (looking down), top (overhead), pov (through `from`'s eyes at `on`).
 * Moves, run over the whole beat so the camera never stands still (measured: 34 % fast-motion frames against 55 % in
 * the reference when shots only held and pushed): push, pull, orbit, crane, track, tilt, rise.
 * Ways in (`via`): cut (with a small 16-frame settle, `settle: 0` to switch it off), soft (a cut softened by a 4-frame
 * cross-dissolve), dissolve, glide (a travel that starts before the cue and lands just after it), whip (a 6-frame swing).
 *
 * Rules that are built in:
 *  - the subject's height region for the size decides the distance, the frame's NARROW side wins (9:16: the width);
 *  - eyes sit on the upper third; `side` shifts the subject off-centre to leave look-room;
 *  - a pov shot starts at eye height, a little in front of the eyes, and the caller hides `from`'s card;
 *  - 9:16 is NARROW: two subjects 2.7 m apart need a 16 m camera. Stand people within about 1.3 m of each other
 *    (and at the same depth) for a two-shot, or cut between singles;
 *  - cameras stay inside `box` when one is given (interiors).
 * There is no over-the-shoulder size: character cards always face the camera, so a foreground card shows its face.
 */
import { CamKey, frameDistance, V3 } from "./camera";

export type ShotSize = "wide" | "full" | "medium" | "close" | "xclose" | "two" | "group" | "insert" | "low" | "high" | "top" | "pov";
export type ShotMove = "hold" | "push" | "pull" | "orbit" | "crane" | "track" | "tilt" | "rise";
export type Subject = { at: V3; h: number; /** world height of the eyes */ eye?: number; /** world height of the head (characters): single-character shots frame by it */ head?: number };
export type ShotSpec = {
  size: ShotSize;
  on: Subject | Subject[];
  /** pov: whose eyes */
  from?: Subject;
  /** degrees around the subject: 0 = from the front (+z), positive = camera to the subject's left (screen right side) */
  angle?: number;
  /** camera height above the subject's feet in metres; default depends on the size */
  height?: number;
  fov?: number;
  /** fraction of the frame the height region fills (default per size) */
  fill?: number;
  /** -1..1: put the subject left / right of centre (look-room) */
  side?: number;
  move?: ShotMove;
  /** size of the move: push / pull = fraction of the distance (0.26), orbit = degrees (28), crane / rise / track = metres, tilt = metres of aim */
  amount?: number;
};
export type Framed = { pos: V3; look: V3; fov: number; focus: number };

/** [low, high] fraction of the subject's height that the size keeps in frame, default fill, default fov, camera height factor */
const SIZES: Record<ShotSize, { lo: number; hi: number; fill: number; fov: number; camH: number }> = {
  wide: { lo: 0, hi: 1.05, fill: 0.3, fov: 46, camH: 0.9 },
  full: { lo: 0, hi: 1.06, fill: 0.7, fov: 40, camH: 0.62 },
  medium: { lo: 0.42, hi: 1.08, fill: 0.72, fov: 36, camH: 0.8 },
  close: { lo: 0.52, hi: 1.12, fill: 0.62, fov: 32, camH: 0.82 }, // bobble heads are wide: a tighter close fills a 9:16 frame edge to edge
  xclose: { lo: 0.64, hi: 1.08, fill: 0.74, fov: 28, camH: 0.86 },
  two: { lo: 0.3, hi: 1.08, fill: 0.62, fov: 38, camH: 0.78 },
  group: { lo: 0, hi: 1.08, fill: 0.6, fov: 42, camH: 0.8 },
  insert: { lo: 0, hi: 1, fill: 0.6, fov: 30, camH: 0.5 }, // the prop fills 60 % of the frame's narrow side
  low: { lo: 0, hi: 1.08, fill: 0.74, fov: 44, camH: 0.14 },
  high: { lo: 0, hi: 1.05, fill: 0.62, fov: 40, camH: 2.3 },
  top: { lo: 0, hi: 1, fill: 0.34, fov: 40, camH: 5.5 },
  pov: { lo: 0.5, hi: 1.08, fill: 0.6, fov: 44, camH: 0.86 },
};
/** Single-character framing measured on 20 reference shorts (1.9): head height as a share of the frame height and the eye
 *  line from the top, per size (CU 20 % / 37 %, MCU 13 % / 44 %, FS 6 % / 45 %; ECU crops the crown at >= 30 %). Before,
 *  our medium put the head at 22 % with the eyes at 30 % from the top: crowns cut off, faces too big. */
export const HEAD_FRAMING: Partial<Record<ShotSize, { head: number; eye: number }>> = {
  /* 1.11.2 (the reference's newest short): bigger heads, eyes higher: medium head 32 % of the width (= 0.18 of the height) with the eyes at 40 %, close-ups 0.45-0.50 */
  xclose: { head: 0.34, eye: 0.48 }, close: { head: 0.25, eye: 0.46 }, medium: { head: 0.17, eye: 0.40 }, full: { head: 0.075, eye: 0.42 }, low: { head: 0.09, eye: 0.42 },
};
const rad = (d: number) => (d * Math.PI) / 180;
const clampBox = (p: V3, box?: { min: V3; max: V3 }): V3 => (box ? [Math.min(box.max[0], Math.max(box.min[0], p[0])), Math.min(box.max[1], Math.max(box.min[1], p[1])), Math.min(box.max[2], Math.max(box.min[2], p[2]))] : p);

/** The camera for a named shot. `aspect` = width / height of the frame. */
export function frameShot(spec: ShotSpec, aspect: number, box?: { min: V3; max: V3 }): Framed {
  const subs = Array.isArray(spec.on) ? spec.on : [spec.on];
  const S = SIZES[spec.size], fov = spec.fov ?? S.fov;
  const cx = subs.reduce((a, s) => a + s.at[0], 0) / subs.length, cz = subs.reduce((a, s) => a + s.at[2], 0) / subs.length;
  const base = Math.min(...subs.map((s) => s.at[1])), H = Math.max(...subs.map((s) => s.at[1] + s.h)) - base;
  const ang = rad(spec.angle ?? 0), dir: V3 = [Math.sin(ang), 0, Math.cos(ang)], right: V3 = [Math.cos(ang), 0, -Math.sin(ang)];
  if (spec.size === "pov" && spec.from) {
    const f = spec.from, eye: V3 = [f.at[0], f.at[1] + f.h * 0.86, f.at[2]], tgt: V3 = [cx, base + H * 0.8, cz];
    const d = Math.hypot(tgt[0] - eye[0], tgt[2] - eye[2]) || 1, fw: V3 = [(tgt[0] - eye[0]) / d, 0, (tgt[2] - eye[2]) / d];
    const pos = clampBox([eye[0] + fw[0] * 0.2, eye[1], eye[2] + fw[2] * 0.2], box);
    // the target fills about half of the frame's narrow side; put small evidence 2.5-3.5 m from the eyes (closer needs a fish-eye)
    const auto = (2 * Math.atan(H / (0.5 * 2 * Math.max(0.5, d - 0.2) * Math.min(1, aspect))) * 180) / Math.PI;
    return { pos, look: [cx, base + H * 0.5, cz], fov: spec.fov ?? Math.min(50, Math.max(22, auto)), focus: Math.max(0.6, d - 0.2) };
  }
  // spread of the subjects across the view direction (+ shoulder room): the narrow side of the frame usually decides
  const across = subs.map((s) => (s.at[0] - cx) * right[0] + (s.at[2] - cz) * right[2]);
  const width = Math.max(...across) - Math.min(...across) + (spec.size === "insert" ? H : 0.75 * Math.max(...subs.map((s) => s.h)) * (subs.length > 1 ? 0.62 : 0.5));
  const lo = base + H * S.lo, hi = base + H * S.hi, fill = spec.fill ?? S.fill;
  let dist = frameDistance({ height: hi - lo, width: spec.size === "wide" ? undefined : width, vfov: fov, aspect, fill });
  if (spec.size === "wide") dist = Math.max(dist, frameDistance({ width: width * 2.2, vfov: fov, aspect, fill: 0.9 }));
  const HF = HEAD_FRAMING[spec.size], one = subs.length === 1 && subs[0].head && subs[0].eye !== undefined && HF && spec.fill === undefined ? subs[0] : null;
  if (one) dist = one.head! / (HF!.head * 2 * Math.tan(rad(fov) / 2));
  const mid = (lo + hi) / 2, eyeLine = lo + (hi - lo) * 0.56; // aim a little above the middle: eyes on the upper third
  const camY = base + (spec.height ?? S.camH * (spec.size === "top" || spec.size === "high" ? 1 : H)) + (spec.size === "high" ? H * 0.6 : 0);
  const horiz = spec.size === "top" ? dist * 0.18 : spec.size === "high" ? dist * 0.78 : dist;
  const side = (spec.side ?? 0) * Math.tan(rad(fov) / 2) * aspect * dist * 0.42;
  let pos: V3 = [cx + dir[0] * horiz - right[0] * side, spec.size === "top" ? base + dist : camY, cz + dir[2] * horiz - right[2] * side];
  const look: V3 = [cx - right[0] * side, spec.size === "low" ? mid + H * 0.12 : spec.size === "top" ? base + H * 0.4 : eyeLine, cz - right[2] * side];
  // eye line: reviewers measured our eyes at 58 % from the top (40 % of dead headroom) against about 40 % in the reference
  const eyes = subs.map((s) => s.eye).filter((e): e is number => e !== undefined);
  if (one && spec.size !== "low") look[1] = one.eye! - (0.5 - HF!.eye) * 2 * dist * Math.tan(rad(fov) / 2);
  else if (eyes.length && (spec.size === "medium" || spec.size === "close" || spec.size === "xclose" || spec.size === "two")) look[1] = Math.max(...eyes) - 0.06 * 2 * dist * Math.tan(rad(fov) / 2); // eyes 44 % from the top
  pos = clampBox(pos, box);
  return { pos, look, fov, focus: Math.hypot(pos[0] - look[0], pos[1] - look[1], pos[2] - look[2]) };
}

/** Where the camera ends after the move (same subject). */
export function moveEnd(spec: ShotSpec, a: Framed, aspect: number, box?: { min: V3; max: V3 }): Framed & { via?: V3 } {
  const m = spec.move ?? "hold", v: V3 = [a.pos[0] - a.look[0], a.pos[1] - a.look[1], a.pos[2] - a.look[2]];
  const out = (pos: V3, look: V3 = a.look, via?: V3) => { const p = clampBox(pos, box); return { pos: p, look, fov: a.fov, focus: Math.hypot(p[0] - look[0], p[1] - look[1], p[2] - look[2]), via }; };
  if (m === "push" || m === "pull") { const k = 1 + (m === "pull" ? 1 : -1) * (spec.amount ?? 0.26); return out([a.look[0] + v[0] * k, a.look[1] + v[1] * k, a.look[2] + v[2] * k]); }
  if (m === "orbit") { const t = rad(spec.amount ?? 28), c = Math.cos(t), s = Math.sin(t), h = rad((spec.amount ?? 28) / 2), ch = Math.cos(h), sh = Math.sin(h), k = 1 / ch;
    // quadratic Bezier through a control point on the arc's tangent lines: the camera travels the circle, not the chord
    return out([a.look[0] + v[0] * c + v[2] * s, a.pos[1], a.look[2] - v[0] * s + v[2] * c], a.look, clampBox([a.look[0] + (v[0] * ch + v[2] * sh) * k, a.pos[1], a.look[2] + (-v[0] * sh + v[2] * ch) * k], box)); }
  if (m === "crane") { const d = spec.amount ?? 1.4; return out([a.pos[0], a.pos[1] + d, a.pos[2]], [a.look[0], a.look[1] + d * 0.25, a.look[2]]); }
  if (m === "rise") { const d = spec.amount ?? 2; return out([a.pos[0], a.pos[1] + d, a.pos[2]], [a.look[0], a.look[1] + d, a.look[2]]); }
  if (m === "tilt") { const d = spec.amount ?? 2; return out(a.pos, [a.look[0], a.look[1] + d, a.look[2]]); }
  if (m === "track") { const d = spec.amount ?? 1.2, L = Math.hypot(v[0], v[2]) || 1, r: V3 = [v[2] / L, 0, -v[0] / L]; return out([a.pos[0] + r[0] * d, a.pos[1], a.pos[2] + r[2] * d], [a.look[0] + r[0] * d * 0.85, a.look[1], a.look[2] + r[2] * d * 0.85]); }
  return { ...a };
}

/** How a shot arrives. 1.9: `through` (push into the old picture, out of the new one), `flash` (through white), `iris`. */
export type Via = "cut" | "soft" | "dissolve" | "glide" | "whip" | "through" | "flash" | "iris";
/** Camera keys for one beat: arrive at f0 by `via`, then run the move until just before f1. */
export function shotKeys(spec: ShotSpec, o: { f0: number; f1: number; aspect: number; via?: Via; box?: { min: V3; max: V3 }; glide?: number; dissolve?: number; first?: boolean; settle?: number; soft?: number; /** default push-in per frame for shots without a move (0 = locked) */ creep?: number; /** fps / 30: the frame counts here were tuned at 30 fps */ R?: number }): CamKey[] {
  const a = frameShot(spec, o.aspect, o.box), via = o.via ?? "cut";
  const k0: CamKey = { f: o.f0, pos: a.pos, look: a.look, fov: a.fov, focus: a.focus };
  // SETTLE: a shot that arrives by a cut starts a little wide and off to one side and lands on its framing in 11 frames
  // (fast out, soft landing). Fast-cut shorts get their camera energy here: measured fast-motion frames 20 % with plain
  // holds-and-pushes against 55 % in the reference.
  const st = o.settle ?? 0, // off by default since 1.8: with soft cuts and travels a settle only adds a twitch
    settle = via === "cut" && st > 0 && o.f1 - o.f0 > 30 && spec.size !== "pov"; // 0.26 landed like a punch: 0.12 over 16 frames
  let pre: CamKey | null = null;
  if (settle) { const v: V3 = [a.pos[0] - a.look[0], a.pos[1] - a.look[1], a.pos[2] - a.look[2]], L = Math.hypot(v[0], v[2]) || 1, sg = o.f0 % 2 ? 1 : -1, r: V3 = [(v[2] / L) * sg, 0, (-v[0] / L) * sg], d = Math.hypot(...v) * st * 0.55;
    const p = clampBox([a.look[0] + v[0] * (1 + st) + r[0] * d, a.look[1] + v[1] * (1 + st * 0.6), a.look[2] + v[2] * (1 + st) + r[2] * d], o.box);
    pre = { f: o.f0, pos: p, look: a.look, fov: a.fov, focus: a.focus, cut: !o.first }; }
  if (!o.first) { if (via === "cut") k0.cut = true; else if (via === "soft") k0.dissolve = o.soft ?? 4; else if (via === "dissolve") k0.dissolve = o.dissolve ?? 9; else if (via === "through" || via === "flash" || via === "iris") { k0.dissolve = Math.round((via === "iris" ? 6 : via === "flash" ? 10 : 9) * (o.R ?? 1)); k0.join = via; } else if (via === "whip") { k0.glide = 6; k0.f = o.f0 + 3; } else { k0.glide = o.glide ?? 30; k0.f = o.f0 + Math.round((o.glide ?? 30) * 0.4); k0.ease = "inOutSine"; } } // a travel starts before the word and lands just after it
  if (pre) { const g16 = Math.round(16 * (o.R ?? 1)); k0.cut = undefined; k0.f = o.f0 + g16; k0.glide = g16; k0.ease = "outCubic"; }
  const keys = pre ? [pre, k0] : [k0], end = o.f1 - 2, len = end - k0.f;
  // 1.9: a shot without a move still creeps in (measured base push 0.1-0.4 % per frame; the camera is still on < 4 % of
  // frames). Before, a board shot without `move` was locked: the rig's push only acts on holds and a board shot is one glide.
  const creep = o.creep ?? 0.0022, sp: ShotSpec = (spec.move ?? "hold") === "hold" && creep > 0 && len > 12 && spec.size !== "pov" ? { ...spec, move: "push", amount: 1 - Math.exp(-creep * len) } : spec;
  if ((sp.move ?? "hold") !== "hold" && len > 12) { const b = moveEnd(sp, a, o.aspect, o.box); keys.push({ f: end, pos: b.pos, look: b.look, fov: b.fov, focus: b.focus, glide: len, via: b.via, ease: "smooth" }); }
  else if (len > 4) keys.push({ f: end, pos: a.pos, look: a.look, fov: a.fov, focus: a.focus, glide: 1e6 });
  return keys;
}

/** Shot-size ladder for a storyboard draft: never the same size twice in a row, a wide to open every place. */
export function nextSize(prev: ShotSize | undefined, i: number): ShotSize {
  const ladder: ShotSize[] = ["wide", "medium", "close", "full", "medium", "low", "close", "two"];
  let s = ladder[i % ladder.length];
  if (s === prev) s = ladder[(i + 1) % ladder.length];
  return s;
}
