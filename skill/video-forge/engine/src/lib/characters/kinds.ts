/**
 * New 2D character KINDS (references/characters.md section 5, build order 1-8), all Canvas2D,
 * all pure functions of (spec, pose, size, frame): no Math.random, no clocks.
 *
 *   object   face on any shape (box/can/ball/blob/rounded/house/tooth/custom path), rigidity-limited squash (5.3 A)
 *   critter  species presets, biped or quadruped with a 4-beat walk, solid black eyes, thin lines (5.3 B)
 *   blob     superellipse mascot, spring-driven attachments, strong squash & stretch (5.3 C)
 *   stick    two-bone IK limbs, pose-target library, smear ghosts, optional x-ray skeleton (5.3 D, 2.17)
 *   chibi    ~2.3 heads, 16 expressions, "caricature" (OverSimplified-ish) preset (5.3 E, 2.24)
 *   flatvec  Kurzgesagt-like: no outline, two-tone fills, rim light; bird + person (5.3 F)
 *   microbe  cell / bacterium / virus / rbc / wbc / heart / brain with a wobbling membrane (5.3 G)
 *   passes   sketch (vector, jittered double line), cutout, silhouette, pixelize on ANY 2D canvas (5.3 H)
 *   bobble   big round head, pill torso, rubber-hose IK limbs with fists/shoes, 11 outfits, 10 hairs, 10 hats (5.3 I)
 *
 * Every kind consumes the shared toon.ts `Pose` (expr, blink, look, mouth, viseme, armL/armR, legL/legR,
 * lean, bob, squash, facing, view, light) plus the optional extras in `KPose`. One shared FaceRig draws
 * every face, so viseme tracks (toon letters A E I O U M F L W rest, or Rhubarb A-H/X via `cue`) work on all kinds.
 *
 * Canvas contract = toon.ts drawCharacter: canvas W x H with H = 1.08 x character height, feet on the same
 * ground line CharacterCard (lib/three/cast.ts) assumes, so `drawAny` is a drop-in for drawCharacter.
 */
import { clamp, hash32, lerp, rng } from "../time";
import { CharacterSpec, drawCharacter, Expression, Pose, Viseme } from "./toon";

const TAU = Math.PI * 2;
const rad = (d: number) => (d * Math.PI) / 180;
/** characters.md 3.6: one ink for every inked kind. */
export const INK = "#140c10";
type V2 = [number, number];

// ================================================================ colour
const rgb = (h: string): [number, number, number] => { const n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
export const mix = (a: string, b: string, t: number) => { const A = rgb(a), B = rgb(b); return hex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); };
/** Cool-shifted shadow (characters.md 5.4 "shadows cool-shifted"; same violet bias as toon.ts darken). */
export const shade = (h: string, k = 0.26) => { const [r, g, b] = rgb(h); return hex(r * (1 - k) + 60 * k * 0.35, g * (1 - k) + 50 * k * 0.35, b * (1 - k) + 140 * k * 0.35); };
const tint = (h: string, k: number) => mix(h, "#ffffff", k);
/** Warm skin crescent (toon.ts measured x[.96,.86,.84]). */
const skinShade = (h: string) => { const [r, g, b] = rgb(h); return hex(r * 0.95, g * 0.85, b * 0.84); };
function toHsl(h: string): [number, number, number] {
  const [r, g, b] = rgb(h).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const H = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [H * 60, s, l];
}
function fromHsl(H: number, s: number, l: number) {
  const C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs(((H / 60) % 2) - 1)), m = l - C / 2;
  const [r, g, b] = H < 60 ? [C, X, 0] : H < 120 ? [X, C, 0] : H < 180 ? [0, C, X] : H < 240 ? [0, X, C] : H < 300 ? [X, 0, C] : [C, 0, X];
  return hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
/** characters.md 5.3 F: shade = base x0.78 luminance, hue shifted 8 deg toward blue. */
export const flatShade = (h: string) => {
  const [H, S, L] = toHsl(h), d = ((230 - H + 540) % 360) - 180;
  return fromHsl((H + Math.sign(d) * Math.min(8, Math.abs(d)) + 360) % 360, clamp(S * 1.06), L * 0.78);
};
/** Parse "#rgb[a]" / "rgb(a)(...)" for the sketch pass. */
function parseCss(s: unknown): [number, number, number, number] | null {
  if (typeof s !== "string") return null;
  if (s[0] === "#") { const [r, g, b] = rgb(s.length === 4 ? "#" + [...s.slice(1)].map((c) => c + c).join("") : s); return [r, g, b, 1]; }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const v = m[1].split(",").map(Number);
  return [v[0], v[1], v[2], v[3] ?? 1];
}

// ================================================================ path helpers
const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0) => { const p = new Path2D(); p.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); return p; };
function rrect(x: number, y: number, w: number, h: number, r: number, p = new Path2D()) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r); p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath();
  return p;
}
/** Superellipse (2 = ellipse, 4+ = squircle; characters.md 3.1 shape language as numbers). egg > 0 widens the bottom. */
function sePath(cx: number, cy: number, rx: number, ry: number, n = 2, egg = 0, nb = n, wob?: (a: number) => number, steps = 88) {
  const p = new Path2D();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * TAU, c = Math.cos(t), s = Math.sin(t), e = 2 / (s < 0 ? n : nb);
    const Y = Math.sign(s) * Math.abs(s) ** e, X = Math.sign(c) * Math.abs(c) ** e * (1 + egg * Y), k = wob ? wob(t) : 1;
    const x = cx + rx * X * k, y = cy + ry * Y * k;
    i ? p.lineTo(x, y) : p.moveTo(x, y);
  }
  p.closePath();
  return p;
}
const moved = (p: Path2D, dx: number, dy: number, sx = 1, sy = 1) => { const q = new Path2D(); q.addPath(p, new DOMMatrix([sx, 0, 0, sy, dx, dy])); return q; };
const poly = (pts: V2[], close = true) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); if (close) p.closePath(); return p; };
/** Vertical bean (toon.ts toonworld torso): widest at ~62 %, round bottom. */
function bean(top: number, bot: number, r: number, topK = 0.72, cx = 0) {
  const p = new Path2D(), h = bot - top, wy = top + h * 0.62;
  p.moveTo(cx, top);
  p.bezierCurveTo(cx + r * topK, top, cx + r * 1.04, wy - h * 0.3, cx + r, wy);
  p.bezierCurveTo(cx + r * 0.98, bot + h * 0.06, cx - r * 0.98, bot + h * 0.06, cx - r, wy);
  p.bezierCurveTo(cx - r * 1.04, wy - h * 0.3, cx - r * topK, top, cx, top);
  p.closePath();
  return p;
}
/** Seamless deterministic loop noise in [-1, 1] over an angle (membranes, fur fringe). */
function loopNoise(seed: string, ks = [2, 3, 5, 7]) {
  const r = rng(seed), ph = ks.map(() => r() * TAU), am = ks.map((_, i) => (0.6 + 0.4 * r()) / (i + 1)), sp = ks.map(() => 0.5 + r());
  const norm = am.reduce((a, b) => a + b, 0);
  return (a: number, t = 0) => ks.reduce((s, k, i) => s + am[i] * Math.sin(k * a + ph[i] + t * sp[i] * TAU), 0) / norm;
}

/** Two-bone IK (characters.md 2.2 / 5.3 D): joint position for root A, target T, bone lengths, bending toward `pole`. */
export function ik2(A: V2, T: V2, l1: number, l2: number, pole: V2): { joint: V2; end: V2 } {
  const dx = T[0] - A[0], dy = T[1] - A[1], d = Math.hypot(dx, dy) || 1e-6;
  const dc = clamp(d, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const a = Math.acos(clamp((l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc), -1, 1)), base = Math.atan2(dy, dx);
  const j1: V2 = [A[0] + l1 * Math.cos(base + a), A[1] + l1 * Math.sin(base + a)], j2: V2 = [A[0] + l1 * Math.cos(base - a), A[1] + l1 * Math.sin(base - a)];
  const mx = (A[0] + T[0]) / 2, my = (A[1] + T[1]) / 2;
  const joint = (j1[0] - mx) * pole[0] + (j1[1] - my) * pole[1] >= (j2[0] - mx) * pole[0] + (j2[1] - my) * pole[1] ? j1 : j2;
  const ex = T[0] - joint[0], ey = T[1] - joint[1], el = Math.hypot(ex, ey) || 1e-6;
  return { joint, end: [joint[0] + (ex / el) * l2, joint[1] + (ey / el) * l2] };
}

// ================================================================ drawing context
type Ctx = { g: CanvasRenderingContext2D; u: number; lw: number; ink: string; light: number; side: boolean; t: number; frame: number; three?: boolean };

/** Cel part (toon.ts trick): shade everywhere, base re-filled from a copy shifted toward the key => form crescent. */
function part(c: Ctx, path: Path2D, fill: string, o: { sh?: string; off?: number; stroke?: boolean; thick?: boolean; lw?: number } = {}) {
  const g = c.g, off = o.off ?? c.u * 0.03;
  g.fillStyle = fill; g.fill(path);
  if (off > 0) { g.save(); g.clip(path); g.fillStyle = o.sh ?? shade(fill); g.fill(path); g.translate(c.light * off, -off * 0.35); g.fillStyle = fill; g.fill(path); g.restore(); }
  if (o.stroke !== false) {
    const lw = o.lw ?? c.lw;
    g.strokeStyle = c.ink; g.lineWidth = lw; g.stroke(path);
    // characters.md 3.6 thick-thin: heavier on the shadow side and toward the ground
    if (o.thick) { g.save(); g.clip(path); g.lineWidth = lw * 1.9; g.translate(c.light * lw * 0.55, -lw * 0.45); g.stroke(path); g.restore(); }
  }
}
/** Flat-vector part (characters.md 2.7 / 5.3 F): no outline, hard two-tone crescent + rim sliver on the key side. */
function flat2(c: Ctx, path: Path2D, base: string, o: { sh?: string; rim?: string; off?: number; rimW?: number } = {}) {
  const g = c.g, off = o.off ?? c.u * 0.03, rw = o.rimW ?? c.u * 0.008;
  g.fillStyle = base; g.fill(path);
  g.save(); g.clip(path);
  g.fillStyle = o.sh ?? flatShade(base); g.fill(path);
  g.translate(c.light * off, -off * 0.4); g.fillStyle = base; g.fill(path);
  g.setTransform(g.getTransform().translate(-c.light * off, off * 0.4));
  if (o.rim !== "none" && rw > 0) {
    const cut = new Path2D(); cut.rect(-1e4, -1e4, 2e4, 2e4); cut.addPath(path, new DOMMatrix([1, 0, 0, 1, -c.light * rw, rw * 0.9]));
    g.clip(cut, "evenodd"); g.fillStyle = o.rim ?? tint(base, 0.38); g.fill(path);
  }
  g.restore();
}
/** Ink-outlined stroke limb (polyline, or quadratic when `curve`). */
function limb(c: Ctx, pts: V2[], w: number, col: string, o: { ink?: boolean; curve?: boolean } = {}) {
  const g = c.g, p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  if (o.curve && pts.length === 3) p.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
  else for (const q of pts.slice(1)) p.lineTo(q[0], q[1]);
  g.lineCap = "round"; g.lineJoin = "round";
  if (o.ink !== false) { g.strokeStyle = c.ink; g.lineWidth = w + 2 * c.lw; g.stroke(p); }
  g.strokeStyle = col; g.lineWidth = w; g.stroke(p);
}
const dot = (g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, Math.max(0.3, r), 0, TAU); g.fill(); };

// ================================================================ poses, expressions, visemes
/** Extended expression set (characters.md 3.8 storytime tier: 16). */
export type KExpr = Expression | "disgust" | "determined" | "embarrassed" | "cry" | "deadpan" | "scheming";
export const KEXPRS: KExpr[] = ["neutral", "happy", "laugh", "shock", "nervous", "sad", "angry", "whistle", "smug", "think", "disgust", "determined", "embarrassed", "cry", "deadpan", "scheming"];
/** Rhubarb Lip Sync canonical cues (characters.md 4.2 recommendation). */
export type Cue = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "X";
/** toon.ts viseme letters -> Rhubarb cue (4.3 table). */
export const VISEME_TO_CUE: Record<Viseme, Cue> = { M: "A", I: "B", E: "C", A: "D", O: "E", U: "F", W: "F", F: "G", L: "H", rest: "X" };
/** Rhubarb cue -> toon.ts viseme letter (so Rhubarb output drives toon.ts characters too). */
export const CUE_TO_VISEME: Record<Cue, Viseme> = { A: "M", B: "I", C: "E", D: "A", E: "O", F: "W", G: "F", H: "L", X: "rest" };
export type MouthCue = { start: number; end: number; value: string };
/** Rhubarb mouth cue at a frame (audio/lipsync.py -> cues.json "mouthCues"). Leads the audio by `lead` frames and
 *  holds every shape >= 2 frames (characters.md 4.x timing rules). Works for toon.ts via CUE_TO_VISEME[cueAt(...)]. */
export function cueAt(frame: number, fps: number, cues: MouthCue[], lead = 2): Cue {
  const t = (frame + lead) / fps, minHold = 2 / fps;
  let lo = 0, hi = cues.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (cues[m].start <= t) { k = m; lo = m + 1; } else hi = m - 1; }
  if (k < 0) return "X";
  if (t - cues[k].start < minHold && k > 0 && cues[k].end - cues[k].start < minHold) k--; // too-short flicker shape
  return (cues[k].value as Cue) ?? "X";
}
/** Oculus/Meta 15 -> Rhubarb (4.3). */
export const OCULUS_TO_CUE: Record<string, Cue> = { sil: "X", PP: "A", FF: "G", TH: "H", DD: "B", kk: "B", CH: "B", SS: "B", nn: "H", RR: "E", aa: "D", E: "C", I: "B", O: "E", U: "F" };

/**
 * Pose = toon.ts Pose plus optional extras. Every toon Pose is a valid KPose.
 * gait: quadruped 4-beat phase in cycles (walk4Pose). jiggle: secondary-motion offset in deg (springFollow / withSecondary).
 * limbs: stick IK targets in head units relative to the hip (x outward/forward, y up). prev: the pose 1-2 frames ago (smears).
 */
export type KPose = Omit<Pose, "expr" | "view"> & {
  /** "three" = three-quarter view (bobble kind only; every other kind draws its front view). `facing` picks the side. */
  view?: "front" | "side" | "three";
  expr?: KExpr; cue?: Cue; gait?: number; jiggle?: number; tail?: number; headDip?: number;
  limbs?: { handL?: V2; handR?: V2; footL?: V2; footR?: V2 }; prev?: KPose;
  /** stick extras: held prop, hat lifted off the head (head units) and tilted (deg; hat tip / doff). */
  hold?: StickHold; hold2?: StickHold; hatLift?: number; hatTilt?: number;
  /** bobble extras: head turn -1 (toward -x) .. 1 (toward +x) in the front view; hand shapes (default fist). */
  turn?: number; hands?: { L?: HandShape; R?: HandShape };
  /** head tilt in degrees around the neck (+ = toward +x / the facing side). Unset: a small tilt that fits the expression. */
  headTilt?: number;
  /** three-quarter view: which view the `limbs` targets were written for. Default "front" (x = outward: the R hand reaches
   *  toward the facing side, the L hand away from it); "side" = profile targets (x = forward for both hands and feet). */
  targets?: "front" | "side";
  /** smear frame (set by poseTrack on fast pops; bobble): the hand's travel this frame in limb-target units, the head's in head units. */
  smear?: { handL?: { from: V2; to: V2 }; handR?: { from: V2; to: V2 }; head?: V2 };
  /** secondary overshoot in degrees (set by poseTrack for ~8 frames after a pop): hair, hat, held prop and coat hem lag, overshoot, settle. */
  settle?: number;
};
/** Fallback for styles with only the 10 toon.ts drawings (characters.md 5.2). */
export const EXPR_FALLBACK: Record<KExpr, Expression> = { neutral: "neutral", happy: "happy", laugh: "laugh", shock: "shock", nervous: "nervous", sad: "sad", angry: "angry", whistle: "whistle", smug: "smug", think: "think", disgust: "angry", determined: "angry", embarrassed: "nervous", cry: "sad", deadpan: "neutral", scheming: "smug" };
export const toToonPose = (p: KPose): Pose => { const { view, ...q } = p; return { ...q, ...(view ? { view: view === "three" ? "front" as const : view } : {}), expr: p.expr ? EXPR_FALLBACK[p.expr] : undefined, viseme: p.cue ? CUE_TO_VISEME[p.cue] : p.viseme }; };

export type FaceSpec = {
  eyes: "solid" | "dot" | "whites" | "none";
  eyeSize: number; // eye width / face width
  eyeSpacing: number; // centre-to-centre / face width
  eyeY: number; // 0 top .. 1 bottom of the face box
  brows: "line" | "thick" | "none";
  browScale: number;
  mouthTier: 2 | 3 | 5 | 9; // characters.md 4.4 reductions
  mouthWidth: number; mouthY: number; mouthScale: number;
  catchlight: boolean; blush: boolean; iris?: string;
};
const FACE0: FaceSpec = { eyes: "whites", eyeSize: 0.2, eyeSpacing: 0.4, eyeY: 0.42, brows: "line", browScale: 1, mouthTier: 9, mouthWidth: 0.3, mouthY: 0.74, mouthScale: 1, catchlight: true, blush: false };

type EyeSt = { lid: number; tilt: number; bot: number; size: number; pupil: number; shape: "open" | "happy" | "tight" };
type Mouth = "neutral" | "smile" | "grin" | "O" | "frown" | "wavy" | "grit" | "whistle" | "smirk" | "side" | "bleh" | "firm" | "wavySmall" | "wail" | "flat" | "evil"
  | "closed" | "half" | "teeth" | "open" | "wide" | "round" | "pucker" | "lipbite" | "tongue";
type FX = "sweat" | "blush" | "tears" | "vein" | "lines";
/** brow: deg, + = inner end up (worry), - = inner down (anger). up: brow raise in eye heights. tilt: lid slant, + = inner side lower. */
type ExprDef = { brow: number; up: number; asym?: number; eye?: Partial<EyeSt>; mouth: Mouth; look?: V2; fx?: FX[]; act?: { squash?: number; scale?: number } };
const EX: Record<KExpr, ExprDef> = {
  neutral: { brow: 0, up: 0, mouth: "neutral" },
  happy: { brow: -4, up: 0.15, eye: { bot: 0.22 }, mouth: "smile" },
  laugh: { brow: -6, up: 0.3, eye: { shape: "happy" }, mouth: "grin", fx: ["blush"], act: { squash: 0.95 } },
  shock: { brow: 8, up: 0.75, eye: { size: 1.15, pupil: 0.5 }, mouth: "O", act: { squash: 1.08 } },
  nervous: { brow: 16, up: 0.2, eye: { pupil: 0.8 }, look: [0.6, 0.1], mouth: "wavy", fx: ["sweat"] },
  sad: { brow: 22, up: 0.1, eye: { lid: 0.35, tilt: -14, pupil: 0.9 }, look: [0, 0.45], mouth: "frown", act: { squash: 0.9 } },
  angry: { brow: -26, up: -0.2, eye: { lid: 0.32, tilt: 20, bot: 0.12 }, mouth: "grit", fx: ["vein"], act: { scale: 1.05 } },
  whistle: { brow: -4, up: 0.3, asym: 0.3, eye: { lid: 0.18 }, look: [0.5, -0.6], mouth: "whistle" },
  smug: { brow: -10, up: 0, asym: 0.4, eye: { lid: 0.45, bot: 0.12 }, look: [0.45, 0], mouth: "smirk" },
  think: { brow: 8, up: 0.1, asym: 0.45, look: [0.6, -0.75], mouth: "side" },
  disgust: { brow: -16, up: -0.05, asym: 0.35, eye: { lid: 0.3, bot: 0.3 }, mouth: "bleh" },
  determined: { brow: -20, up: -0.1, eye: { lid: 0.16, tilt: 12 }, mouth: "firm" },
  embarrassed: { brow: 16, up: 0.15, eye: { lid: 0.2, pupil: 0.85 }, look: [-0.6, 0.45], mouth: "wavySmall", fx: ["blush", "lines"] },
  cry: { brow: 26, up: 0.1, eye: { shape: "tight" }, mouth: "wail", fx: ["tears"], act: { squash: 0.92 } },
  deadpan: { brow: 0, up: -0.12, eye: { lid: 0.5, bot: 0.1 }, mouth: "flat" },
  scheming: { brow: -22, up: -0.1, eye: { lid: 0.42, tilt: 10, bot: 0.22 }, look: [0.5, 0], mouth: "evil" },
};

/** Viseme reductions per mouth tier (characters.md 4.4). Returns null for rest (the expression mouth shows). */
export function reduceCue(cue: Cue, tier: 2 | 3 | 5 | 9): Mouth | null {
  if (cue === "X") return null;
  if (tier === 9) return ({ A: "closed", B: "teeth", C: "open", D: "wide", E: "round", F: "pucker", G: "lipbite", H: "tongue" } as const)[cue];
  if (tier === 5) return ({ A: "closed", B: "teeth", G: "teeth", C: "open", H: "open", D: "wide", E: "round", F: "round" } as const)[cue];
  if (tier === 3) return cue === "A" ? "closed" : "BGEF".includes(cue) ? "half" : "open";
  return cue === "A" ? "closed" : "open";
}
/** Active cue for a pose: Rhubarb cue > toon viseme > float openness (0 closed, .5 half, .9 open = 3-state, 4.4). */
function cueOf(p: KPose): Cue | null {
  if (p.cue && p.cue !== "X") return p.cue;
  if (p.viseme && p.viseme !== "rest") return VISEME_TO_CUE[p.viseme];
  const m = p.mouth ?? 0;
  return m <= 0.05 ? null : m < 0.35 ? "B" : m < 0.7 ? "C" : "D";
}

// ================================================================ FaceRig (characters.md 5.2, shared by every kind)
export type FaceBox = { x: number; y: number; w: number; h: number };
export type FaceOpts = {
  ink: string; lw: number; skin: string; side?: boolean;
  beak?: string; cat?: boolean; flat?: boolean; eyeColor?: string;
  eyeAt?: V2[]; mouthAt?: V2; beakSize?: number; noBrows?: boolean;
  /** per-eye width factor (three-quarter view: the far eye is narrower); x shift of sweat / vein in face widths */
  eyeSx?: number[]; fxDx?: number;
};
const MDARK = "#4a1a22", TONGUE = "#e0707a";

export function drawFace(g: CanvasRenderingContext2D, f0: Partial<FaceSpec>, p: KPose, b: FaceBox, o: FaceOpts) {
  const f = { ...FACE0, ...f0 }, E = EX[p.expr ?? "neutral"] ?? EX.neutral;
  const st: EyeSt = { lid: 0, tilt: 0, bot: 0, size: 1, pupil: 1, shape: "open", ...E.eye };
  const lk = p.look ?? [0, 0], look: V2 = [clamp(lk[0] + (E.look?.[0] ?? 0), -1, 1), clamp(lk[1] + (E.look?.[1] ?? 0), -1, 1)];
  const blink = clamp(p.blink ?? 0), side = !!o.side, W = b.w, top = b.y - b.h / 2, lw = o.lw;
  const rx = (f.eyeSize * W) / 2, ry = rx * (f.eyes === "whites" ? 1.22 : f.eyes === "solid" ? 1.32 : 1.05);
  const ey = top + f.eyeY * b.h, dx = (f.eyeSpacing * W) / 2;
  // profile: one eye, its inner corner faces forward (sgn -1 = inner side toward +x)
  const eyes: [number, number, number][] = o.eyeAt
    ? o.eyeAt.map(([x, y], i, a) => [x, y, a.length === 1 || side ? -1 : i === 0 ? -1 : 1])
    : side ? [[b.x + W * 0.2, ey, -1]] : [[b.x - dx, ey, -1], [b.x + dx, ey, 1]];
  const dark = o.eyeColor ?? (o.flat ? o.ink : "#0d0a10");
  const fx = new Set(E.fx ?? []);
  if (f.blush) fx.add("blush");
  g.save(); g.lineCap = "round"; g.lineJoin = "round";
  if (fx.has("blush") && f.eyes !== "none") for (const [x, y, s] of eyes) {
    g.fillStyle = p.expr === "embarrassed" ? "rgba(255,84,108,0.55)" : "rgba(255,110,125,0.36)";
    g.beginPath(); g.ellipse(x + (side ? -rx * 0.2 : s * rx * 0.35), y + ry * 1.5, rx * 0.95, rx * 0.46, 0, 0, TAU); g.fill();
    if (fx.has("lines")) { g.strokeStyle = "#d8344e"; g.lineWidth = lw * 0.7; for (let k = -1; k <= 1; k++) { const xx = x + s * rx * 0.35 + k * rx * 0.5; g.beginPath(); g.moveTo(xx + rx * 0.15, y + ry * 1.25); g.lineTo(xx - rx * 0.15, y + ry * 1.75); g.stroke(); } }
  }
  eyes.forEach(([x, y, s], i) => drawEye(g, f, o, x, y, rx * (o.eyeSx?.[i] ?? 1), ry, st, blink, s, look, dark));
  // brows carry ~half the emotion on simple faces: always on, even on dot eyes (characters.md 3.4)
  if (f.brows !== "none" && !o.noBrows) {
    const bl0 = rx * (f.eyes === "whites" ? 1.05 : 1.5) * f.browScale;
    g.strokeStyle = o.flat ? o.ink : o.ink; g.lineWidth = f.brows === "thick" ? lw * 2.5 * f.browScale : lw * 1.25;
    for (const [i, [x, y, s]] of eyes.entries()) {
      const asym = !side && s > 0 ? E.asym ?? 0 : 0, a = rad(E.brow - asym * 26), bl = bl0 * (o.eyeSx?.[i] ?? 1);
      const gap = Math.max(ry, W * 0.075), by = y - ry * st.size - gap * (0.5 + (E.up + asym) * 0.9) - (f.brows === "thick" ? lw * f.browScale : 0);
      const ix = x - s * bl * 0.9, iy = by - Math.sin(a) * bl, ox = x + s * bl * 1.05, oy = by + Math.sin(a) * bl;
      g.beginPath(); g.moveTo(ix, iy); g.quadraticCurveTo(x, by - bl * 0.22, ox, oy); g.stroke();
    }
  }
  // mouth: viseme > talking float > expression
  const mw = ((f.mouthWidth * W) / 2) * (side ? 0.62 : 1) * f.mouthScale;
  const [mx, my] = o.mouthAt ?? [b.x + (side ? W * 0.27 : 0), top + f.mouthY * b.h];
  const cue = cueOf(p), shape: Mouth = (cue && reduceCue(cue, f.mouthTier)) || E.mouth;
  if (o.beak) drawBeak(g, o, shape, mx, my, o.beakSize ?? mw, side);
  else drawMouth(g, shape, mx, my, mw, o, !!o.cat && !cue, side);
  // effects
  if (fx.has("sweat")) {
    const x = b.x + W * (side ? -0.05 : 0.44 + (o.fxDx ?? 0)), y = top + b.h * 0.22, r = W * 0.045;
    const d = new Path2D(); d.moveTo(x, y - r * 1.9); d.quadraticCurveTo(x + r * 1.15, y - r * 0.2, x + r * 0.95, y + r * 0.3); d.arc(x, y + r * 0.3, r * 0.95, 0, Math.PI); d.quadraticCurveTo(x - r * 1.15, y - r * 0.2, x, y - r * 1.9);
    g.fillStyle = "#a8dcff"; g.fill(d); g.strokeStyle = o.ink; g.lineWidth = lw * 0.7; g.stroke(d);
  }
  if (fx.has("tears")) for (const [x, y] of eyes) {
    const tw = rx * 0.3, t = rrect(x - tw, y + ry * 0.35, tw * 2, b.h * 0.3, tw);
    g.fillStyle = "rgba(140,205,255,0.92)"; g.fill(t); g.strokeStyle = o.ink; g.lineWidth = lw * 0.6; g.stroke(t);
  }
  if (fx.has("vein")) {
    const x = b.x + W * (side ? 0.0 : 0.3 + (o.fxDx ?? 0) * 0.7), y = top + b.h * 0.13, d = W * 0.035;
    g.strokeStyle = "#e2333f"; g.lineWidth = lw * 1.2;
    for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2 + Math.PI / 4; g.beginPath(); g.arc(x + Math.cos(a) * d * 1.5, y + Math.sin(a) * d * 1.5, d, a + Math.PI * 0.6, a + Math.PI * 1.4); g.stroke(); }
  }
  g.restore();
}

function drawEye(g: CanvasRenderingContext2D, f: FaceSpec, o: FaceOpts, x: number, y: number, rx: number, ry: number, st: EyeSt, blink: number, s: number, look: V2, dark: string) {
  const lw = o.lw;
  if (f.eyes === "none") return;
  if (st.shape === "happy") { g.strokeStyle = dark; g.lineWidth = lw * (f.eyes === "whites" ? 1.45 : 1.6); g.beginPath(); g.ellipse(x, y + ry * 0.35, rx, ry * 0.7, 0, Math.PI * 1.12, Math.PI * 1.88); g.stroke(); return; }
  if (st.shape === "tight") { g.strokeStyle = dark; g.lineWidth = lw * 1.45; g.beginPath(); g.moveTo(x + s * rx, y - ry * 0.55); g.lineTo(x - s * rx * 0.7, y); g.lineTo(x + s * rx, y + ry * 0.55); g.stroke(); return; }
  const lid = Math.max(st.lid, blink);
  // squash-blink for dot/solid, lid-blink for whites (characters.md 4.7)
  if (lid > 0.86) { g.strokeStyle = dark; g.lineWidth = lw * 1.35; g.beginPath(); g.ellipse(x, y, rx * 1.02, ry * 0.32, 0, Math.PI * 0.05, Math.PI * 0.95); g.stroke(); return; }
  const whites = f.eyes === "whites", RX = rx * st.size, RY = ry * st.size;
  const cx = x + (whites ? 0 : look[0] * rx * 0.3), cy = y + (whites ? 0 : look[1] * ry * 0.22);
  const E = ell(cx, cy, RX, RY);
  g.fillStyle = whites ? "#ffffff" : dark; g.fill(E);
  g.save(); g.clip(E);
  if (whites) {
    const pr = RX * 0.6 * st.pupil, px = cx + look[0] * RX * 0.38, py = cy + look[1] * RY * 0.3 + RY * 0.06;
    if (f.iris) { dot(g, px, py, pr, f.iris); dot(g, px, py, pr * 0.55, dark); }
    else { g.fillStyle = dark; g.beginPath(); g.ellipse(px, py, pr, pr * 1.12, 0, 0, TAU); g.fill(); }
    if (f.catchlight) { dot(g, px + pr * 0.32, py - pr * 0.42, pr * 0.34, "#ffffff"); dot(g, px - pr * 0.36, py + pr * 0.42, pr * 0.14, "#ffffff"); }
  } else if (f.catchlight && RX > 2) dot(g, cx + RX * 0.3, cy - RY * 0.38, RX * 0.3, "#ffffff");
  const yl = (xx: number) => cy - RY + 2 * RY * lid + Math.tan(rad(st.tilt)) * (xx - cx) * -s;
  const L = cx - RX - 2, R = cx + RX + 2;
  if (lid > 0.02) {
    g.fillStyle = o.skin; g.fill(poly([[L, cy - RY - 2], [R, cy - RY - 2], [R, yl(R)], [L, yl(L)]]));
    if (whites) { g.strokeStyle = o.ink; g.lineWidth = lw * 1.3; g.beginPath(); g.moveTo(L, yl(L)); g.lineTo(R, yl(R)); g.stroke(); }
  }
  if (st.bot > 0.02) {
    const yb = cy + RY - 2 * RY * st.bot, bp = new Path2D();
    bp.moveTo(L, cy + RY + 2); bp.lineTo(L, yb + RY * 0.3); bp.quadraticCurveTo(cx, yb - RY * 0.3, R, yb + RY * 0.3); bp.lineTo(R, cy + RY + 2); bp.closePath();
    g.fillStyle = o.skin; g.fill(bp);
    if (whites) { g.strokeStyle = o.ink; g.lineWidth = lw; g.beginPath(); g.moveTo(L, yb + RY * 0.3); g.quadraticCurveTo(cx, yb - RY * 0.3, R, yb + RY * 0.3); g.stroke(); }
  }
  g.restore();
  if (whites) { g.strokeStyle = o.ink; g.lineWidth = lw; g.stroke(E); }
}

function drawMouth(g: CanvasRenderingContext2D, shape: Mouth, mx: number, my: number, m: number, o: FaceOpts, cat: boolean, side: boolean) {
  const lw = o.lw, flat = !!o.flat;
  g.save(); g.translate(mx, my); if (side) g.scale(1, 1);
  g.strokeStyle = o.ink; g.lineWidth = lw * 1.25; g.lineCap = "round"; g.lineJoin = "round";
  const line = (pts: V2[], w = 1.25) => { g.lineWidth = lw * w; g.beginPath(); g.moveTo(pts[0][0] * m, pts[0][1] * m); for (let i = 1; i + 1 < pts.length; i += 2) g.quadraticCurveTo(pts[i][0] * m, pts[i][1] * m, pts[i + 1][0] * m, pts[i + 1][1] * m); g.stroke(); };
  const wave = (w: number, n: number, a: number) => { g.lineWidth = lw * 1.2; g.beginPath(); for (let i = 0; i <= n; i++) { const x = -w * m + (2 * w * m * i) / n, y = (i % 2 ? -a : a) * m; i ? g.quadraticCurveTo(x - (w * m) / n, (i % 2 ? -a : a) * m * 1.6, x, y) : g.moveTo(x, y); } g.stroke(); };
  /** D-shape (flat-ish top, round bottom), dark interior, tongue, optional top teeth. */
  const open = (w: number, h: number, topY = -0.1, o2: { tongue?: number; teeth?: number; inv?: boolean } = {}) => {
    const p = new Path2D();
    if (o2.inv) { p.moveTo(-w * m, h * 0.3 * m); p.quadraticCurveTo(0, -h * 0.55 * m, w * m, h * 0.3 * m); p.quadraticCurveTo(0, h * 1.05 * m, -w * m, h * 0.3 * m); }
    else { p.moveTo(-w * m, topY * m); p.quadraticCurveTo(0, (topY - 0.08) * m, w * m, topY * m); p.quadraticCurveTo(0, (topY + h * 1.3) * m, -w * m, topY * m); }
    g.fillStyle = flat ? o.ink : MDARK; g.fill(p);
    g.save(); g.clip(p);
    if (o2.teeth) { g.fillStyle = "#ffffff"; g.fillRect(-w * m, (topY - 0.2) * m, 2 * w * m, (0.2 + o2.teeth) * m); }
    if ((o2.tongue ?? 1) > 0) { g.fillStyle = TONGUE; g.beginPath(); g.ellipse(0, (o2.inv ? h * 0.85 : topY + h * 1.05) * m, w * 0.55 * m, h * 0.42 * m * (o2.tongue ?? 1), 0, 0, TAU); g.fill(); }
    g.restore();
    if (!flat) { g.lineWidth = lw * 1.15; g.stroke(p); }
  };
  const oval = (rx: number, ry: number, cy = 0, tongue = true) => {
    const p = ell(0, cy * m, rx * m, ry * m); g.fillStyle = flat ? o.ink : MDARK; g.fill(p);
    if (tongue) { g.save(); g.clip(p); g.fillStyle = TONGUE; g.beginPath(); g.ellipse(0, (cy + ry * 0.75) * m, rx * 0.7 * m, ry * 0.45 * m, 0, 0, TAU); g.fill(); g.restore(); }
    if (!flat) { g.lineWidth = lw * 1.15; g.stroke(p); }
  };
  if (cat && ["neutral", "smile", "flat", "firm"].includes(shape)) { // ":3" muzzle mouth
    const k = shape === "smile" ? 1.25 : 1;
    g.lineWidth = lw * 1.1; g.beginPath(); g.moveTo(0, -0.42 * m); g.lineTo(0, 0);
    g.quadraticCurveTo(-0.22 * m, 0.42 * m * k, -0.5 * m, 0.05 * m); g.moveTo(0, 0); g.quadraticCurveTo(0.22 * m, 0.42 * m * k, 0.5 * m, 0.05 * m); g.stroke();
    g.restore(); return;
  }
  switch (shape) {
    case "neutral": line([[-0.5, 0], [0, 0.18], [0.5, 0]]); break;
    case "smile": line([[-0.85, -0.14], [0, 0.78], [0.85, -0.14]], 1.35); break;
    case "flat": line([[-0.5, 0.02], [0, 0.02], [0.5, 0.02]]); break;
    case "firm": line([[-0.55, 0.08], [0, -0.06], [0.55, 0.08]], 1.35); break;
    case "frown": line([[-0.6, 0.22], [0, -0.38], [0.6, 0.22]], 1.3); break;
    case "side": line([[0.0, 0.02], [0.32, 0.06], [0.62, -0.06]]); break;
    case "smirk": line([[-0.55, 0.02], [0.25, 0.3], [0.75, -0.24]], 1.3); line([[0.66, -0.36], [0.76, -0.25], [0.86, -0.14]], 1.0); break;
    case "wavy": wave(0.62, 5, 0.09); break;
    case "wavySmall": wave(0.38, 4, 0.08); break;
    case "closed": line([[-0.48, 0], [0, 0.06], [0.48, 0]], 1.6); break;
    case "whistle": g.translate(0.26 * m, 0); oval(0.17, 0.2, 0, false); break;
    case "O": oval(0.36, 0.48, 0.1); break;
    case "round": oval(0.34, 0.42, 0.1); break;
    case "pucker": oval(0.19, 0.23, 0.04, false); g.lineWidth = lw * 1.5; g.stroke(ell(0, 0.04 * m, 0.27 * m, 0.31 * m)); break;
    case "half": open(0.55, 0.42, -0.06, { tongue: 0.7 }); break;
    case "open": open(0.72, 0.72, -0.1); break;
    case "wide": open(0.82, 1.1, -0.14, { teeth: 0.06 }); break;
    case "grin": open(0.86, 1.0, -0.14, { teeth: 0.1 }); break;
    case "tongue": open(0.68, 0.7, -0.1, { tongue: 0 }); g.save(); g.fillStyle = TONGUE; g.beginPath(); g.ellipse(0, 0.08 * m, 0.3 * m, 0.16 * m, 0, 0, TAU); g.fill(); g.restore(); break;
    case "lipbite": open(0.58, 0.32, -0.06, { tongue: 0, teeth: 0.1 }); line([[-0.42, 0.34], [0, 0.48], [0.42, 0.34]], 1.1); break;
    case "teeth": {
      const p = rrect(-0.6 * m, -0.18 * m, 1.2 * m, 0.36 * m, 0.15 * m);
      g.fillStyle = flat ? o.ink : MDARK; g.fill(p); g.save(); g.clip(p); g.fillStyle = "#ffffff"; g.fillRect(-m, -0.3 * m, 2 * m, 0.24 * m); g.fillRect(-m, 0.1 * m, 2 * m, 0.2 * m); g.restore();
      if (!flat) { g.lineWidth = lw * 1.1; g.stroke(p); } break;
    }
    case "grit": {
      const p = rrect(-0.68 * m, -0.2 * m, 1.36 * m, 0.42 * m, 0.13 * m);
      g.fillStyle = "#ffffff"; g.fill(p); g.lineWidth = lw * 1.1; g.stroke(p);
      g.lineWidth = lw * 0.75; g.beginPath(); g.moveTo(-0.68 * m, 0.01 * m); g.lineTo(0.68 * m, 0.01 * m);
      for (const k of [-0.34, 0, 0.34]) { g.moveTo(k * m, -0.2 * m); g.lineTo(k * m, 0.22 * m); } g.stroke(); break;
    }
    case "evil": {
      const p = new Path2D(); p.moveTo(-0.95 * m, -0.24 * m); p.quadraticCurveTo(0, 0.28 * m, 0.95 * m, -0.4 * m); p.quadraticCurveTo(0.15 * m, 0.95 * m, -0.95 * m, -0.24 * m);
      g.fillStyle = "#ffffff"; g.fill(p); g.lineWidth = lw * 1.1; g.stroke(p);
      g.save(); g.clip(p); g.lineWidth = lw * 0.7; g.beginPath(); for (const k of [-0.5, -0.15, 0.2, 0.55]) { g.moveTo(k * m, -0.5 * m); g.lineTo(k * m, 0.8 * m); } g.stroke(); g.restore(); break;
    }
    case "wail": open(0.72, 0.9, 0, { inv: true }); break;
    case "bleh": {
      line([[-0.55, 0.16], [0, -0.16], [0.55, 0.16]], 1.25);
      const t = new Path2D(); t.moveTo(0.05 * m, 0.04 * m); t.lineTo(0.05 * m, 0.3 * m); t.arc(0.22 * m, 0.3 * m, 0.17 * m, Math.PI, 0, true); t.lineTo(0.39 * m, 0.1 * m);
      g.fillStyle = TONGUE; g.fill(t); g.lineWidth = lw; g.stroke(t); break;
    }
  }
  g.restore();
}
/** Beak = the mouth for birds (characters.md 5.3 B: beak opening as the 5-state mouth). */
const BEAK_OPEN: Partial<Record<Mouth, number>> = { teeth: 0.25, half: 0.35, open: 0.6, wide: 0.9, round: 0.5, pucker: 0.25, lipbite: 0.2, tongue: 0.6, grin: 0.7, O: 0.8, wail: 0.85, evil: 0.4 };
function drawBeak(g: CanvasRenderingContext2D, o: FaceOpts, shape: Mouth, x: number, y: number, w: number, side: boolean) {
  const open = BEAK_OPEN[shape] ?? 0, col = o.beak!, dk = flatOr(o, shade(col, 0.22));
  const fillStroke = (p: Path2D, c: string) => { g.fillStyle = c; g.fill(p); if (!o.flat) { g.strokeStyle = o.ink; g.lineWidth = o.lw; g.stroke(p); } };
  g.save(); g.translate(x, y); g.lineJoin = "round";
  if (!side) {
    if (open > 0.02) fillStroke(poly([[-w * 0.7, 0], [w * 0.7, 0], [0, w * (0.5 + open * 0.9)]]), o.flat ? o.ink : MDARK);
    fillStroke(poly([[-w * 0.62, w * open * 0.25], [w * 0.62, w * open * 0.25], [0, w * (0.55 + open * 0.9)]]), dk);
    const up = new Path2D(); up.moveTo(-w, -w * 0.12); up.quadraticCurveTo(0, -w * 0.3, w, -w * 0.12); up.quadraticCurveTo(w * 0.3, w * 0.3, 0, w * 0.75); up.quadraticCurveTo(-w * 0.3, w * 0.3, -w, -w * 0.12); up.closePath();
    fillStroke(up, col);
    if (shape === "smile" || shape === "smirk") { g.strokeStyle = o.ink; g.lineWidth = o.lw * 0.8; g.beginPath(); g.moveTo(-w * 0.95, -w * 0.05); g.quadraticCurveTo(-w * 1.1, w * 0.12, -w * 0.9, w * 0.2); g.moveTo(w * 0.95, -w * 0.05); g.quadraticCurveTo(w * 1.1, w * 0.12, w * 0.9, w * 0.2); g.stroke(); }
  } else {
    const L = w * 1.5;
    g.save(); g.rotate(rad(open * 26)); fillStroke(poly([[0, w * 0.05], [L * 0.85, w * 0.12], [0, w * 0.42]]), dk); g.restore();
    const up = new Path2D(); up.moveTo(0, -w * 0.38); up.quadraticCurveTo(L * 0.6, -w * 0.32, L, w * 0.08); up.quadraticCurveTo(L * 0.5, w * 0.12, 0, w * 0.12); up.closePath();
    fillStroke(up, col);
  }
  g.restore();
}
const flatOr = (o: FaceOpts, c: string) => c;

// ================================================================ motion helpers (frame-based, pure)
/**
 * Damped-spring follow-through (characters.md 4.7: stiffness ~120, damping ~14, 60 fps-equivalent; lag 2-4 f).
 * Integrates from rest over the last `windowF` frames, so the result is a pure function of `frame`.
 * Returns the lag offset (spring - source) in the source's units.
 */
export function springFollow(src: (f: number) => number, frame: number, fps = 30, k = 120, c = 14, windowF = 48) {
  const sub = Math.max(1, Math.round(60 / fps)), dt = 1 / (fps * sub);
  let f0 = frame - windowF, x = src(f0), v = 0;
  for (let f = f0; f < frame; f++) {
    const a0 = src(f), a1 = src(f + 1);
    for (let i = 0; i < sub; i++) { const tgt = lerp(a0, a1, (i + 1) / sub); v += (-k * (x - tgt) - c * v) * dt; x += v * dt; }
  }
  return x - src(frame);
}
/** Pose with `jiggle` filled from the pose history (lean + bob + squash drive ears/antennae/tails). */
export function withSecondary(poseAt: (f: number) => KPose, frame: number, fps = 30): KPose {
  const sig = (f: number) => { const q = poseAt(f); return (q.lean ?? 0) * 1.2 - (q.bob ?? 0) * 70 + ((q.squash ?? 1) - 1) * 90; };
  return { ...poseAt(frame), jiggle: springFollow(sig, frame, fps) * 1.6 };
}
/** Quadruped 4-beat walk (characters.md 5.3 B: LH-LF-RH-RF, duty 0.65, bob 2 %, ~1.5-2 strides/s). */
export function walk4Pose(frame: number, fps: number, stridesPerSec = 1.6): KPose {
  const gait = (frame / fps) * stridesPerSec;
  return { gait, tail: Math.sin(gait * TAU + 1.2) };
}
/** Hop (characters.md 5.3 A: anticipation 3 f, air 7 f, land 2 f, settle) - objects, blobs, birds, chibi. bob in head/body units. */
export function hopPose(frame: number, fps: number, hopsPerSec = 2, height = 0.35): KPose {
  const T = fps / hopsPerSec, ph = (((frame % T) + T) % T) / T;
  const a = 3 / T, air = Math.min(0.75, 7 / T + a), land = Math.min(0.9, air + 2 / T);
  if (ph < a) return { squash: 1 - 0.18 * Math.sin((ph / a) * Math.PI * 0.5), bob: 0 };
  if (ph < air) { const u = (ph - a) / (air - a); return { bob: -height * Math.sin(u * Math.PI), squash: 1 + 0.14 * Math.cos(u * Math.PI) * (u < 0.5 ? 1 : 0.6) }; }
  if (ph < land) return { squash: 0.8, bob: 0 };
  const u = (ph - land) / (1 - land);
  return { squash: 1 + 0.06 * Math.sin(u * Math.PI) * (1 - u), bob: 0 };
}
/** Chibi hop-walk (characters.md 5.3 E: bob 9 %, 2.4 steps/s). */
export function hopWalkPose(frame: number, fps: number, stepsPerSec = 2.4, heads = 2.3): KPose {
  const ph = (frame / fps) * stepsPerSec * Math.PI, sn = Math.sin(ph);
  return { legL: 22 * sn, legR: -22 * sn, armL: -26 * sn + 10, armR: 26 * sn + 10, bob: -0.09 * heads * Math.abs(Math.sin(ph)), squash: 1 + 0.05 * Math.cos(2 * ph), lean: 3 };
}
/** Species idles (characters.md 5.3 B): bird peck, cat tail flick, dog pant, generic ear twitch. */
export function critterIdle(species: Species, frame: number, fps: number): KPose {
  const t = frame / fps;
  if (species === "bird") { const k = (t * 0.8) % 1; return { headDip: k < 0.2 ? Math.sin((k / 0.2) * Math.PI) : 0 }; }
  if (species === "cat" || species === "fox") return { tail: Math.sin(t * 1.4) * 0.6 + (((t * 0.5) % 1) < 0.1 ? 1 : 0) };
  if (species === "dog") return { mouth: 0.5 + 0.3 * Math.sin(t * 4 * TAU), tail: Math.sin(t * 9) };
  return { tail: Math.sin(t * 1.2) * 0.4 };
}

// ================================================================ specs
type KBase = { id: string; ink?: string; lineW?: number; heightHeads?: number };
export type ObjectSpec = KBase & {
  kind: "object"; shape: "box" | "can" | "ball" | "blob" | "rounded" | "house" | "tooth" | "custom";
  path?: string; // custom: SVG path data in a 0..1 box
  color: string; color2?: string;
  rigidity?: number; // 0 jelly .. 1 steel: maxSquash = 0.3 * (1 - rigidity)
  limbs?: "none" | "bfdi"; face?: Partial<FaceSpec>; faceBox?: [number, number, number, number];
};
export type Species = "cat" | "dog" | "bird" | "frog" | "bear" | "mouse" | "rabbit" | "fox" | "pig";
export type CritterSpec = KBase & { kind: "critter"; species: Species; stance?: "biped" | "quadruped"; color?: string; belly?: string; accent?: string; face?: Partial<FaceSpec>; scarf?: string };
export type Attach = { kind: "ear" | "antenna" | "horn" | "tuft" | "leaf"; at: number; len: number; color?: string };
export type BlobSpec = KBase & {
  kind: "blob"; color: string; belly?: string; accent?: string;
  shape?: { n?: number; egg?: number; aspect?: number }; fur?: number;
  attachments?: Attach[]; nubs?: { arms?: boolean; feet?: boolean }; face?: Partial<FaceSpec>; maxSquash?: number;
};
export type StickHat = { style: "top" | "bowler" | "cap" | "boater" | "hardhat" | "beanie"; color: string; band?: string };
/**
 * Stick figure (characters.md 2.2 / 5.3 D). Accessories give each stick character its own silhouette at feed size
 * (characters.md 3.2: identity has to survive at 120 px): a hat, hair, facial hair, neckwear, a coat (frock tails),
 * a skirt, glasses, a head fill that differs from the limbs (classic white-head stickman) and a body build.
 */
export type StickSpec = KBase & {
  kind: "stick"; color: string; face?: Partial<FaceSpec> | null; hands?: "none" | "dot"; skeleton?: boolean; outline?: boolean;
  head?: string; hat?: StickHat; hair?: { style: "tuft" | "side" | "spikes" | "bun" | "long" | "curly"; color: string };
  stache?: string; beard?: string; neckwear?: { style: "bow" | "tie" | "scarf"; color: string };
  coat?: { color: string; tails?: boolean; buttons?: string; collar?: string }; skirt?: string; glasses?: string;
  build?: "slim" | "regular" | "stout"; cheeks?: boolean;
};
/** Held props for stick figures: drawn along the forearm of the holding hand (angle = extra rotation in deg). */
export type HandShape = "fist" | "point" | "open";
/** 1.8: `shears` (`open` 0..1), `coin` (`len` = radius in head units, `cut` = a shaved flat), `file`, `hammer`, `sack`, `quill`: tools belong IN the hand.
 *  A prop floating next to an empty hand reads as clip art (reviewer, coin short). A second prop goes in `KPose.hold2`. */
export type StickHold = { item: "axe" | "cane" | "hat" | "flag" | "lever" | "bag" | "phone" | "cup" | "paper" | "shears" | "coin" | "file" | "hammer" | "sack" | "quill" | "bar"; open?: number; cut?: boolean; hand?: "L" | "R"; angle?: number; len?: number; color?: string; hat?: StickHat | BobbleHat; as?: "bobble" };
export type ChibiSpec = KBase & {
  kind: "chibi"; skin: string;
  hair?: { color: string; style: "short" | "bob" | "spiky" | "long" | "bun" | "curly" | "bald" | "side" };
  top: { color: string; style?: "hoodie" | "shirt" | "dress" | "coat" | "costume"; accent?: string };
  bottom?: string; shoes?: string;
  hat?: { style: "cap" | "top" | "beanie" | "helmet" | "bicorne" | "crown"; color: string; accent?: string };
  caricature?: boolean; glasses?: boolean; blush?: boolean; face?: Partial<FaceSpec>;
};
export type FlatvecSpec = KBase & {
  kind: "flatvec"; form: "person" | "bird";
  palette: { base: string; shade?: string; rim?: string; accent?: string; skin?: string; hair?: string; legs?: string; beak?: string; eye?: string };
  face?: Partial<FaceSpec>;
};
export type MicrobeSpec = KBase & {
  kind: "microbe"; form: "cell" | "bacterium" | "virus" | "rbc" | "wbc" | "heart" | "brain";
  color: string; inner?: string; accent?: string; noise?: number; wobbleHz?: number; organelles?: number; face?: Partial<FaceSpec>;
};
export type KindSpec = ObjectSpec | CritterSpec | BlobSpec | StickSpec | ChibiSpec | FlatvecSpec | MicrobeSpec | BobbleSpec;

// ================================================================ dispatcher
/** Same ground line as toon.ts / CharacterCard: feet at H - (H/1.08) * 0.08 / heightHeads. */
const groundOf = (H: number, heads?: number) => H - ((H / 1.08) * 0.08) / (heads ?? 3.5);

/**
 * Draw any KindSpec into a W x H canvas (H = 1.08 x character height, like toon.ts charCanvasSize).
 * `frame`/`fps` only feed style-intrinsic idles (membrane wobble, antenna idle) - characters.md 4.7.
 */
export function drawKind(g: CanvasRenderingContext2D, s: KindSpec, p: KPose, W: number, H: number, frame = 0, fps = 30) {
  const u = H / 1.08, facing = p.facing ?? 1;
  const c: Ctx = { g, u, lw: Math.max(1.5, u * 0.012), ink: s.ink ?? INK, light: (p.light ?? -1) * facing, side: p.view === "side", t: frame / fps, frame, three: s.kind === "bobble" && p.view === "three" };
  const E = EX[p.expr ?? "neutral"] ?? EX.neutral;
  // squash limit per kind (characters.md 4.1 table / 5.3 A rigidity rule)
  const maxSq = s.kind === "object" ? 0.3 * (1 - (s.rigidity ?? 0.4)) : s.kind === "blob" ? s.maxSquash ?? 0.35 : s.kind === "microbe" ? 0.3
    : s.kind === "chibi" ? 0.2 : s.kind === "bobble" ? 0.18 : s.kind === "critter" ? 0.12 : s.kind === "stick" ? 0.1 : 0.06;
  const actSq = s.kind === "blob" || s.kind === "microbe" || s.kind === "object" ? E.act?.squash ?? 1 : 1;
  const sq = clamp((p.squash ?? 1) * actSq, 1 - maxSq, 1 + maxSq), sc = s.kind === "blob" || s.kind === "microbe" ? E.act?.scale ?? 1 : 1;
  g.clearRect(0, 0, W, H);
  g.save();
  g.translate(W / 2, groundOf(H, s.heightHeads));
  if (facing < 0) g.scale(-1, 1);
  g.scale(sc / Math.sqrt(sq), sc * sq); // volume-preserving (characters.md 4.7)
  // a front-view bobble walk keeps the body upright (the lean of the shared walk cycle is tuned for profiles)
  g.rotate(rad((p.lean ?? 0) * (s.kind === "bobble" && p.view !== "side" && (p.legL !== undefined || p.legR !== undefined) ? (c.three ? 0.6 : 0.3) : 1)));
  g.lineJoin = "round"; g.lineCap = "round";
  const bobUnit = s.kind === "bobble" ? u / (s.heightHeads ?? 3.4) : s.kind === "stick" ? u / (s.heightHeads ?? 5.5) : s.kind === "chibi" ? u / (s.heightHeads ?? 2.3) : s.kind === "critter" ? u / 2.7 : s.kind === "flatvec" ? u / 3.2 : u * 0.66;
  g.translate(0, (p.bob ?? 0) * bobUnit);
  switch (s.kind) {
    case "object": drawObject(c, s, p); break;
    case "critter": (s.stance === "quadruped" ? drawQuad : drawBiped)(c, s, p, W); break;
    case "blob": drawBlob(c, s, p); break;
    case "stick": drawStick(c, s, p); break;
    case "bobble": drawBobble(c, s, p); break;
    case "chibi": drawChibi(c, s, p); break;
    case "flatvec": drawFlat(c, s, p); break;
    case "microbe": drawMicrobe(c, s, p); break;
  }
  g.restore();
}
/** Drop-in for toon.ts drawCharacter: dispatches KindSpec (has `kind`) vs CharacterSpec. */
export function drawAny(g: CanvasRenderingContext2D, spec: CharacterSpec | KindSpec, pose: Pose | KPose, W: number, H: number, frame = 0, fps = 30) {
  if ("kind" in spec) drawKind(g, spec, pose as KPose, W, H, frame, fps);
  else drawCharacter(g, spec, toToonPose(pose as KPose), W, H);
}

// ================================================================ 1. OBJECT (characters.md 2.6 / 5.3 A)
const OBJ: Record<ObjectSpec["shape"], { w: number; h: number; face: [number, number, number, number] }> = {
  box: { w: 0.7, h: 0.58, face: [0.5, 0.57, 0.84, 0.72] },
  can: { w: 0.5, h: 0.84, face: [0.5, 0.53, 0.9, 0.5] },
  ball: { w: 0.68, h: 0.68, face: [0.5, 0.52, 0.72, 0.56] },
  blob: { w: 0.62, h: 0.72, face: [0.5, 0.52, 0.76, 0.56] },
  rounded: { w: 0.52, h: 0.86, face: [0.5, 0.44, 0.78, 0.5] },
  house: { w: 0.66, h: 0.84, face: [0.5, 0.635, 0.72, 0.4] },
  tooth: { w: 0.6, h: 0.74, face: [0.5, 0.38, 0.74, 0.5] },
  custom: { w: 0.62, h: 0.72, face: [0.5, 0.52, 0.66, 0.5] },
};
function drawObject(c: Ctx, s: ObjectSpec, p: KPose) {
  const g = c.g, d = OBJ[s.shape], limbs = s.limbs === "bfdi", k = limbs ? 0.78 : 1;
  const legH = limbs ? c.u * 0.2 : 0, narrow = c.side && ["box", "rounded", "house"].includes(s.shape) ? 0.78 : 1;
  const bw = c.u * d.w * k * narrow, bh = c.u * d.h * k, bot = -legH, top = bot - bh;
  c.lw = Math.max(1.5, c.u * k * (s.lineW ?? 0.022));
  const col = s.color, col2 = s.color2 ?? shade(col, 0.35);
  if (limbs) for (const sg of [-1, 1]) { // BFDI: thin ink limbs, stroke feet
    const a = rad(sg < 0 ? p.legL ?? 0 : p.legR ?? 0), x0 = sg * bw * (c.side ? 0.13 : 0.2), y0 = bot - c.lw;
    const ex = x0 + Math.sin(a) * legH, ey = y0 + Math.cos(a) * legH;
    g.strokeStyle = c.ink; g.lineWidth = c.lw * 1.4;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + Math.sin(a) * legH * 0.5 + sg * c.lw, y0 + legH * 0.5, ex, ey); g.stroke();
    g.lineWidth = c.lw * 2.4; g.beginPath(); g.moveTo(ex, ey - c.lw); g.lineTo(ex + (c.side ? 1 : sg) * bw * 0.11, ey - c.lw); g.stroke();
  }
  let body: Path2D, skin = col;
  const sheen = (x: number, y: number, rx: number, ry: number) => { g.save(); g.clip(body); g.fillStyle = "rgba(255,255,255,0.55)"; g.fill(ell(x, y, rx, ry, rad(-25 * c.light))); g.restore(); };
  switch (s.shape) {
    case "box": { // open flaps = the silhouette hook
      for (const sg of [-1, 1]) part(c, poly([[sg * bw * 0.5, top + c.lw], [sg * bw * 0.64, top - bh * 0.2], [sg * bw * 0.1, top - bh * 0.15], [sg * bw * 0.04, top + c.lw]]), shade(col, 0.14), { off: 0 });
      body = rrect(-bw / 2, top, bw, bh, bw * 0.05);
      part(c, body, col, { thick: true, off: bw * 0.07 });
      g.fillStyle = col2; g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.7;
      const tp = rrect(-bw * 0.07, top, bw * 0.14, bh * 0.16, bw * 0.01); g.fill(tp); g.stroke(tp);
      g.lineWidth = c.lw * 0.65; g.beginPath(); g.moveTo(-bw * 0.46, top + bh * 0.08); g.lineTo(bw * 0.46, top + bh * 0.08); g.stroke();
      break;
    }
    case "can": {
      const e = bw * 0.15;
      body = new Path2D(); body.moveTo(-bw / 2, top + e); body.lineTo(-bw / 2, bot - e); body.ellipse(0, bot - e, bw / 2, e, 0, Math.PI, 0, true); body.lineTo(bw / 2, top + e); body.ellipse(0, top + e, bw / 2, e, 0, 0, Math.PI, true); body.closePath();
      part(c, body, col, { thick: true, off: bw * 0.12 });
      const y1 = top + bh * 0.25, y2 = bot - bh * 0.17, band = new Path2D();
      band.moveTo(-bw / 2, y1); band.ellipse(0, y1, bw / 2, e, 0, Math.PI, 0, true); band.lineTo(bw / 2, y2); band.ellipse(0, y2, bw / 2, e, 0, 0, Math.PI); band.closePath();
      g.save(); g.clip(body); part(c, band, col2, { off: bw * 0.12, lw: c.lw * 0.8 }); g.restore();
      skin = col2;
      part(c, ell(0, top + e, bw / 2, e), tint(col, 0.35), { off: 0 });
      g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.7; g.stroke(ell(0, top + e * 1.08, bw * 0.4, e * 0.66));
      part(c, rrect(-bw * 0.08, top + e * 0.55, bw * 0.16, e * 0.5, e * 0.25), tint(col, 0.15), { off: 0, lw: c.lw * 0.6 });
      sheen(c.light * bw * 0.32, top + bh * 0.5, bw * 0.035, bh * 0.3);
      break;
    }
    case "ball": {
      const r = bw / 2, cy = bot - r;
      body = ell(0, cy, r, r);
      part(c, body, col, { off: 0 });
      g.save(); g.clip(body);
      for (const sg of [-1, 1]) { const pn = new Path2D(); pn.moveTo(sg * r * 0.12, cy - r * 1.02); pn.quadraticCurveTo(sg * r * 1.45, cy, sg * r * 0.12, cy + r * 1.02); pn.quadraticCurveTo(sg * r * 0.62, cy, sg * r * 0.12, cy - r * 1.02); part(c, pn, col2, { off: 0, lw: c.lw * 0.8 }); }
      g.restore();
      // re-shade the whole ball once (crescent across panels)
      g.save(); g.clip(body); g.fillStyle = "rgba(40,30,90,0.2)"; g.fill(body); g.globalCompositeOperation = "destination-out"; g.restore();
      g.save(); g.clip(body); g.fillStyle = "rgba(60,40,120,0.22)"; const cr = new Path2D(); cr.rect(-r * 2, cy - r * 2, r * 4, r * 4); cr.addPath(ell(c.light * r * 0.2, cy - r * 0.07, r, r)); g.fill(cr, "evenodd"); g.restore();
      g.strokeStyle = c.ink; g.lineWidth = c.lw; g.stroke(body);
      g.save(); g.clip(body); g.lineWidth = c.lw * 1.9; g.translate(c.light * c.lw * 0.55, -c.lw * 0.45); g.stroke(body); g.restore();
      sheen(c.light * r * 0.5, cy - r * 0.55, r * 0.16, r * 0.09);
      break;
    }
    case "blob": body = sePath(0, bot - bh / 2, bw / 2, bh / 2, 2.4, 0.16, 2.1); part(c, body, col, { thick: true, off: bw * 0.1 }); sheen(c.light * bw * 0.22, top + bh * 0.2, bw * 0.08, bh * 0.05); break;
    case "rounded": {
      body = rrect(-bw / 2, top, bw, bh, bw * 0.24);
      part(c, body, col, { thick: true, off: bw * 0.08 });
      const sc = rrect(-bw * 0.4, top + bw * 0.14, bw * 0.8, bh - bw * 0.42, bw * 0.12);
      g.fillStyle = col2; g.fill(sc); g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.8; g.stroke(sc); skin = col2;
      g.stroke(ell(0, bot - bw * 0.14, bw * 0.06, bw * 0.06));
      break;
    }
    case "house": {
      const wallTop = top + bh * 0.4, roofCol = col2;
      part(c, rrect(bw * 0.17, top + bh * 0.06, bw * 0.12, bh * 0.24, 1), shade(roofCol, 0.15), { off: 0 });
      body = rrect(-bw * 0.42, wallTop, bw * 0.84, bot - wallTop, bw * 0.02);
      part(c, body, col, { thick: true, off: bw * 0.08 });
      const roof = new Path2D(); roof.moveTo(-bw * 0.54, wallTop + bh * 0.05); roof.lineTo(0, top); roof.lineTo(bw * 0.54, wallTop + bh * 0.05); roof.closePath();
      part(c, roof, roofCol, { thick: true, off: bw * 0.06 });
      const door = new Path2D(); door.moveTo(-bw * 0.1, bot); door.lineTo(-bw * 0.1, bot - bh * 0.15); door.arc(0, bot - bh * 0.15, bw * 0.1, Math.PI, 0); door.lineTo(bw * 0.1, bot); door.closePath();
      part(c, door, shade(roofCol, 0.25), { off: 0, lw: c.lw * 0.9 }); dot(g, bw * 0.055, bot - bh * 0.1, c.lw * 0.9, "#f2c14e");
      break;
    }
    case "tooth": {
      const P = (x: number, y: number): V2 => [-bw / 2 + x * bw, top + y * bh];
      body = new Path2D(); const m0 = P(0.5, 0.12); body.moveTo(m0[0], m0[1]);
      const segs: [number, number, number, number, number, number][] = [[0.62, 0.0, 0.92, -0.02, 0.96, 0.24], [1.0, 0.46, 0.88, 0.6, 0.85, 0.76], [0.82, 0.92, 0.78, 1.0, 0.7, 1.0], [0.62, 1.0, 0.6, 0.78, 0.5, 0.72], [0.4, 0.78, 0.38, 1.0, 0.3, 1.0], [0.22, 1.0, 0.18, 0.92, 0.15, 0.76], [0.12, 0.6, 0.0, 0.46, 0.04, 0.24], [0.08, -0.02, 0.38, 0.0, 0.5, 0.12]];
      for (const sgm of segs) { const a = P(sgm[0], sgm[1]), b = P(sgm[2], sgm[3]), e = P(sgm[4], sgm[5]); body.bezierCurveTo(a[0], a[1], b[0], b[1], e[0], e[1]); }
      body.closePath();
      part(c, body, col, { thick: true, off: bw * 0.09, sh: mix(col, "#a9b6d6", 0.45) });
      sheen(c.light * bw * 0.26, top + bh * 0.16, bw * 0.07, bh * 0.045);
      break;
    }
    default: {
      body = new Path2D(); body.addPath(new Path2D(s.path ?? "M0.5 0 L1 1 L0 1 Z"), new DOMMatrix([bw, 0, 0, bh, -bw / 2, top]));
      part(c, body, col, { thick: true, off: bw * 0.08 });
    }
  }
  const [fx, fy, fw, fh] = s.faceBox ?? d.face;
  const box: FaceBox = { x: -bw / 2 + fx * bw + (c.side ? bw * 0.08 : 0), y: top + fy * bh, w: fw * bw, h: fh * bh };
  drawFace(g, { eyes: "whites", eyeSize: 0.22, eyeSpacing: 0.42, eyeY: 0.36, mouthY: 0.8, mouthWidth: 0.36, mouthTier: 9, ...s.face }, p, box, { ink: c.ink, lw: c.lw, skin, side: c.side });
  if (limbs) for (const sg of c.side ? [1] : [-1, 1]) { // noodle arms + ink-dot hands (toonworld vocabulary)
    const a = rad(sg < 0 ? p.armL ?? 10 : p.armR ?? 10) * (c.side ? 1 : sg), L = c.u * 0.3;
    const x0 = c.side ? -bw * 0.12 : sg * bw * 0.48, y0 = top + bh * 0.58, ex = x0 + Math.sin(a) * L, ey = y0 + Math.cos(a) * L;
    g.strokeStyle = c.ink; g.lineWidth = c.lw * 1.4;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + Math.sin(a) * L * 0.5 + sg * L * 0.12, y0 + Math.cos(a) * L * 0.5, ex, ey); g.stroke();
    dot(g, ex, ey, c.lw * 2, c.ink);
  }
}

// ================================================================ 2. CRITTER (characters.md 2.5 / 5.3 B)
type Ear = "pointed" | "round" | "floppy" | "long" | "biground" | "none" | "crest" | "pig";
type Tail = "long" | "wag" | "stub" | "puff" | "thin" | "fluffy" | "curl" | "fan" | "none";
type SpeciesDef = {
  body: string; belly: string; accent: string; nose: string; ear: Ear; tail: Tail; snout: Species | "beak";
  head: [number, number, number]; // width/height, superellipse n, egg
  eyeSp: number; eyeY: number; mouthY: number; earTop: number; whisk?: boolean; beak?: string; leg?: string;
};
/** Species presets: identity must pass the silhouette test from ears / beak-snout / tail alone (characters.md 5.3 B). */
export const SPECIES: Record<Species, SpeciesDef> = {
  cat: { body: "#f2a24e", belly: "#fde8cc", accent: "#f597a6", nose: "#ef7d92", ear: "pointed", tail: "long", snout: "cat", head: [1.2, 2.5, 0.12], eyeSp: 0.4, eyeY: 0.47, mouthY: 0.72, earTop: 0.09, whisk: true },
  dog: { body: "#c98b52", belly: "#f6e3c8", accent: "#6e4227", nose: "#2a1a14", ear: "floppy", tail: "wag", snout: "dog", head: [1.1, 2.2, 0.06], eyeSp: 0.38, eyeY: 0.42, mouthY: 0.79, earTop: 0.02 },
  bird: { body: "#5aa9e6", belly: "#fff1d2", accent: "#2f6fb8", nose: "#2f6fb8", ear: "crest", tail: "fan", snout: "beak", head: [1.0, 2.0, 0.12], eyeSp: 0.4, eyeY: 0.44, mouthY: 0.6, earTop: 0.07, beak: "#f6a93c", leg: "#e9963a" },
  frog: { body: "#7cc35a", belly: "#eaf3b4", accent: "#4e9a3b", nose: "#4e9a3b", ear: "none", tail: "none", snout: "frog", head: [1.5, 2.7, 0.12], eyeSp: 0.56, eyeY: 0.1, mouthY: 0.66, earTop: 0.1 },
  bear: { body: "#9a6a45", belly: "#e3c6a0", accent: "#6e4a30", nose: "#2a1a14", ear: "round", tail: "stub", snout: "bear", head: [1.12, 2.15, 0.08], eyeSp: 0.38, eyeY: 0.44, mouthY: 0.78, earTop: 0.05 },
  mouse: { body: "#b8b5c6", belly: "#f3eaf0", accent: "#f4a3b4", nose: "#ef7d92", ear: "biground", tail: "thin", snout: "mouse", head: [1.06, 2.0, -0.08], eyeSp: 0.36, eyeY: 0.46, mouthY: 0.74, earTop: 0.1, whisk: true },
  rabbit: { body: "#f1ece6", belly: "#ffffff", accent: "#f4a3b4", nose: "#ef7d92", ear: "long", tail: "puff", snout: "rabbit", head: [1.04, 2.1, 0.08], eyeSp: 0.4, eyeY: 0.47, mouthY: 0.72, earTop: 0.26, whisk: true },
  fox: { body: "#ec7a32", belly: "#fff6ec", accent: "#3a2a2a", nose: "#2a1a14", ear: "pointed", tail: "fluffy", snout: "fox", head: [1.22, 2.3, -0.22], eyeSp: 0.38, eyeY: 0.45, mouthY: 0.76, earTop: 0.1 },
  pig: { body: "#f6b2bf", belly: "#ffd4dc", accent: "#e98a9d", nose: "#c9607a", ear: "pig", tail: "curl", snout: "pig", head: [1.16, 2.3, 0.1], eyeSp: 0.42, eyeY: 0.42, mouthY: 0.84, earTop: 0.05 },
};
const critterFace = (sp: SpeciesDef, s: CritterSpec): Partial<FaceSpec> => ({ eyes: "solid", eyeSize: sp.snout === "frog" ? 0.15 : 0.12, eyeSpacing: sp.eyeSp, eyeY: sp.eyeY, mouthY: sp.mouthY, mouthWidth: sp.snout === "frog" ? 0.46 : 0.3, mouthTier: 5, catchlight: false, brows: "line", ...s.face });

function ear(c: Ctx, kind: Ear, x: number, y: number, size: number, ang: number, col: string, inner: string, tip?: string) {
  const g = c.g; g.save(); g.translate(x, y); g.rotate(ang);
  const off = size * 0.12;
  if (kind === "pointed") {
    const w = size * 0.5, p = new Path2D(); p.moveTo(-w, size * 0.15); p.quadraticCurveTo(-w * 0.75, -size * 0.6, -w * 0.05, -size); p.quadraticCurveTo(w * 0.9, -size * 0.55, w, size * 0.15); p.closePath();
    part(c, p, col, { off });
    if (tip) { g.save(); g.clip(p); g.fillStyle = tip; g.fillRect(-w * 2, -size * 1.2, w * 4, size * 0.5); g.restore(); g.strokeStyle = c.ink; g.lineWidth = c.lw; g.stroke(p); }
    g.fillStyle = inner; g.fill(moved(p, 0, size * 0.12, 0.55, 0.62));
  } else if (kind === "round" || kind === "biground") {
    const r = size * 0.5; part(c, ell(0, -r * 0.7, r, r), col, { off }); g.fillStyle = inner; g.fill(ell(0, -r * 0.62, r * 0.6, r * 0.6));
  } else if (kind === "long") {
    const p = ell(0, -size * 0.5, size * 0.2, size * 0.52); part(c, p, col, { off }); g.fillStyle = inner; g.fill(ell(0, -size * 0.46, size * 0.1, size * 0.38));
  } else if (kind === "pig") {
    const p = new Path2D(); p.moveTo(-size * 0.4, 0); p.quadraticCurveTo(-size * 0.2, -size * 0.8, size * 0.15, -size * 0.9); p.quadraticCurveTo(size * 0.25, -size * 0.4, size * 0.4, 0); p.closePath();
    part(c, p, col, { off }); g.fillStyle = inner; g.fill(moved(p, 0, size * 0.08, 0.5, 0.6));
  } else if (kind === "floppy") {
    const p = new Path2D(); p.moveTo(-size * 0.18, 0); p.bezierCurveTo(-size * 0.5, size * 0.3, -size * 0.38, size * 0.95, -size * 0.05, size * 1.0); p.bezierCurveTo(size * 0.25, size * 1.02, size * 0.3, size * 0.4, size * 0.2, 0); p.closePath();
    part(c, p, col, { off });
  }
  g.restore();
}
function tail(c: Ctx, kind: Tail, x: number, y: number, dir: number, ang: number, col: string, acc: string, belly: string, u: number) {
  const g = c.g; if (kind === "none") return;
  g.save(); g.translate(x, y); g.scale(dir, 1); g.rotate(ang);
  const w = u * 0.045;
  switch (kind) {
    case "long": limb(c, [[0, 0], [u * 0.26, -u * 0.02], [u * 0.2, -u * 0.3]], w, col, { curve: true }); dot(g, u * 0.2, -u * 0.3, w * 0.5, col); break;
    case "thin": g.strokeStyle = c.ink; g.lineWidth = c.lw * 1.3; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(u * 0.2, u * 0.06, u * 0.3, -u * 0.2, u * 0.18, -u * 0.26); g.stroke(); break;
    case "wag": limb(c, [[0, 0], [u * 0.14, -u * 0.04], [u * 0.16, -u * 0.18]], w * 1.2, col, { curve: true }); break;
    case "stub": part(c, ell(u * 0.02, -u * 0.01, u * 0.045, u * 0.04), col, { off: 0 }); break;
    case "puff": { const p = sePath(u * 0.03, 0, u * 0.06, u * 0.055, 2, 0, 2, (a) => 1 + 0.08 * Math.sin(a * 7)); part(c, p, belly, { off: 0 }); break; }
    case "curl": g.strokeStyle = c.ink; g.lineWidth = c.lw * 1.4; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(u * 0.1, -u * 0.02, u * 0.12, -u * 0.12, u * 0.06, -u * 0.12); g.bezierCurveTo(u * 0.01, -u * 0.12, u * 0.03, -u * 0.06, u * 0.08, -u * 0.07); g.stroke(); break;
    case "fluffy": {
      const p = new Path2D(); p.moveTo(0, -u * 0.02); p.bezierCurveTo(u * 0.15, -u * 0.12, u * 0.36, -u * 0.08, u * 0.42, -u * 0.3); p.bezierCurveTo(u * 0.3, -u * 0.32, u * 0.12, -u * 0.18, 0, u * 0.04); p.closePath();
      part(c, p, col, { off: u * 0.02 });
      g.save(); g.clip(p); g.fillStyle = belly; g.fill(ell(u * 0.42, -u * 0.3, u * 0.11, u * 0.1)); g.restore(); g.strokeStyle = c.ink; g.lineWidth = c.lw; g.stroke(p);
      break;
    }
    case "fan": for (const a of [-0.5, -0.1, 0.3]) { g.save(); g.rotate(a); part(c, ell(u * 0.02, -u * 0.12, u * 0.05, u * 0.13), mix(col, acc, 0.0), { off: u * 0.01 }); g.restore(); } break;
  }
  g.restore();
}

/** Front or profile critter head, each a separate drawing (characters.md 5.3 B: views are separate drawings, never mirrored/rotated). */
function critterHead(c: Ctx, sp: SpeciesDef, s: CritterSpec, p: KPose, cx: number, cy: number, hh: number) {
  const g = c.g, side = c.side, hw = hh * sp.head[0], rx = hw / 2, ry = hh / 2;
  const body = s.color ?? sp.body, belly = s.belly ?? sp.belly, acc = s.accent ?? sp.accent;
  const jig = rad((p.jiggle ?? 0) * 0.7), lw = (c.lw = Math.max(1.2, hw * (s.lineW ?? 0.034)));
  const earIn = sp.ear === "round" ? belly : sp.ear === "biground" || sp.ear === "long" || sp.ear === "pointed" ? acc : shade(body, 0.12);
  const tip = sp.snout === "fox" ? acc : undefined, earInner = sp.snout === "fox" ? "#3a2a2a" : earIn;
  const hx = side ? cx - hw * 0.06 : cx;
  // --- behind the head
  if (sp.ear === "crest") for (let i = 0; i < 3; i++) { g.save(); g.translate(side ? hx - rx * 0.1 : cx, cy - ry * 0.9); g.rotate((i - 1) * 0.42 + (side ? -0.35 : 0) + jig); part(c, ell(0, -hh * 0.13, hh * 0.045, hh * 0.15), sp.accent, { off: 0 }); g.restore(); }
  const earDefs: Record<Ear, { pos: V2; ang: number; size: number }> = {
    pointed: { pos: [rx * 0.56, -ry * 0.62], ang: 0.36, size: hh * 0.5 }, round: { pos: [rx * 0.72, -ry * 0.66], ang: 0.4, size: hh * 0.36 },
    biground: { pos: [rx * 0.78, -ry * 0.55], ang: 0.5, size: hh * 0.62 }, long: { pos: [rx * 0.3, -ry * 0.8], ang: 0.12, size: hh * 0.92 },
    pig: { pos: [rx * 0.55, -ry * 0.7], ang: 0.5, size: hh * 0.34 }, floppy: { pos: [rx * 0.84, -ry * 0.6], ang: -0.1, size: hh * 0.62 }, none: { pos: [0, 0], ang: 0, size: 0 }, crest: { pos: [0, 0], ang: 0, size: 0 },
  };
  const ed = earDefs[sp.ear], behind = !["floppy", "none", "crest"].includes(sp.ear);
  if (behind) {
    if (side) { ear(c, sp.ear, hx + rx * 0.25, cy + ed.pos[1], ed.size * 0.95, -0.05 + jig, shade(body, 0.14), shade(earInner, 0.14), tip); ear(c, sp.ear, hx - rx * 0.28, cy + ed.pos[1] * 1.02, ed.size, -0.32 + jig, body, earInner, tip); }
    else for (const sg of [-1, 1]) ear(c, sp.ear, cx + sg * ed.pos[0], cy + ed.pos[1], ed.size, sg * ed.ang + jig, body, earInner, tip);
  }
  // --- head
  const head = side ? sePath(hx, cy, rx * 0.9, ry, sp.head[1], sp.head[2]) : sePath(cx, cy, rx, ry, sp.head[1], sp.head[2]);
  part(c, head, body, { thick: true, off: hw * 0.09 });
  const clipFill = (path: Path2D, col: string) => { g.save(); g.clip(head); g.fillStyle = col; g.fill(path); g.restore(); };
  // markings (identity at a glance)
  if (sp.snout === "cat") for (const k of [-1, 0, 1]) clipFill(poly([[cx + (side ? -rx * 0.1 : 0) + k * rx * 0.2 - rx * 0.05, cy - ry * 1.02], [cx + (side ? -rx * 0.1 : 0) + k * rx * 0.2 + rx * 0.05, cy - ry * 1.02], [cx + (side ? -rx * 0.1 : 0) + k * rx * 0.16, cy - ry * (k ? 0.68 : 0.58)]]), shade(body, 0.2));
  if (sp.snout === "dog" && !side) clipFill(ell(cx + rx * 0.42, cy - ry * 0.18, rx * 0.36, ry * 0.36, 0.3), sp.accent);
  if (sp.snout === "frog") for (const [a, b2, r] of [[-0.5, -0.3, 0.07], [0.3, -0.45, 0.05], [0.55, 0.0, 0.06]]) clipFill(ell(cx + a * rx, cy + b2 * ry, r * hw, r * hw), sp.accent);
  if (sp.snout === "fox") { const ch = new Path2D(); ch.moveTo(hx - rx * 1.2, cy + ry * 0.05); ch.quadraticCurveTo(hx - rx * 0.35, cy + ry * 0.0, hx + (side ? rx * 0.3 : 0), cy + ry * 0.35); ch.quadraticCurveTo(hx + (side ? rx * 0.6 : rx * 0.35), cy, hx + rx * 1.2, cy + ry * 0.05); ch.lineTo(hx + rx * 1.2, cy + ry * 1.2); ch.lineTo(hx - rx * 1.2, cy + ry * 1.2); clipFill(ch, belly); g.strokeStyle = c.ink; g.lineWidth = lw; g.stroke(head); }
  // --- snout / muzzle
  const nose = (x: number, y: number, w: number, col: string) => { const n = new Path2D(); n.moveTo(x - w, y - w * 0.35); n.quadraticCurveTo(x, y - w * 0.7, x + w, y - w * 0.35); n.quadraticCurveTo(x + w * 0.5, y + w * 0.55, x, y + w * 0.6); n.quadraticCurveTo(x - w * 0.5, y + w * 0.55, x - w, y - w * 0.35); part(c, n, col, { off: 0, lw: lw * 0.8 }); dot(g, x - w * 0.3, y - w * 0.25, w * 0.22, "rgba(255,255,255,0.7)"); };
  let mouthAt: V2, eyeAt: V2[] | undefined, beakAt: V2 | undefined;
  const fs = critterFace(sp, s), top = cy - ry;
  const eyeY = top + (fs.eyeY ?? 0.45) * hh, mY = top + (fs.mouthY ?? 0.75) * hh;
  if (!side) {
    mouthAt = [cx, mY];
    switch (sp.snout) {
      case "cat": case "rabbit": for (const sg of [-1, 1]) part(c, ell(cx + sg * hw * 0.08, cy + hh * 0.2, hw * 0.1, hh * 0.085), belly, { off: 0, lw: lw * 0.7 }); mouthAt = [cx, cy + hh * 0.18]; break;
      case "dog": part(c, ell(cx, cy + hh * 0.2, hw * 0.26, hh * 0.19), belly, { off: hw * 0.03, lw: lw * 0.8 }); mouthAt = [cx, cy + hh * 0.3]; break;
      case "bear": part(c, ell(cx, cy + hh * 0.21, hw * 0.22, hh * 0.17), belly, { off: hw * 0.03, lw: lw * 0.8 }); mouthAt = [cx, cy + hh * 0.3]; break;
      case "pig": part(c, ell(cx, cy + hh * 0.13, hw * 0.17, hh * 0.11), sp.accent, { off: hw * 0.02, lw: lw * 0.8 }); for (const sg of [-1, 1]) g.fill(ell(cx + sg * hw * 0.06, cy + hh * 0.13, hw * 0.025, hh * 0.04)); mouthAt = [cx, cy + hh * 0.31]; break;
      case "mouse": mouthAt = [cx, cy + hh * 0.26]; break;
      case "fox": mouthAt = [cx, cy + hh * 0.28]; break;
      case "frog": eyeAt = [[cx - hw * 0.28, cy - ry * 0.78], [cx + hw * 0.28, cy - ry * 0.78]]; mouthAt = [cx, cy + hh * 0.14]; break;
      case "beak": beakAt = [cx, cy + hh * 0.06]; break;
    }
  } else {
    const fx = hx + rx * 0.9; // front edge of the profile
    eyeAt = [[hx + rx * 0.3, eyeY]];
    mouthAt = [fx - rx * 0.05, mY];
    switch (sp.snout) {
      case "cat": case "rabbit": part(c, ell(fx - rx * 0.08, cy + hh * 0.17, rx * 0.26, hh * 0.12), belly, { off: 0, lw: lw * 0.8 }); mouthAt = [fx - rx * 0.12, cy + hh * 0.27]; break;
      case "dog": { const sn = rrect(fx - rx * 0.5, cy - hh * 0.02, rx * 0.95, hh * 0.34, hh * 0.15); part(c, sn, belly, { off: 0, lw: lw * 0.9 }); mouthAt = [fx + rx * 0.08, cy + hh * 0.27]; break; }
      case "bear": part(c, ell(fx + rx * 0.02, cy + hh * 0.17, rx * 0.36, hh * 0.15), belly, { off: 0, lw: lw * 0.9 }); mouthAt = [fx + rx * 0.0, cy + hh * 0.28]; break;
      case "mouse": { const sn = new Path2D(); sn.moveTo(fx - rx * 0.4, cy - hh * 0.06); sn.quadraticCurveTo(fx + rx * 0.3, cy + hh * 0.02, fx + rx * 0.62, cy + hh * 0.16); sn.quadraticCurveTo(fx + rx * 0.2, cy + hh * 0.3, fx - rx * 0.4, cy + hh * 0.32); part(c, sn, body, { off: 0 }); mouthAt = [fx + rx * 0.1, cy + hh * 0.26]; break; }
      case "fox": { const sn = new Path2D(); sn.moveTo(fx - rx * 0.5, cy - hh * 0.08); sn.lineTo(fx + rx * 0.72, cy + hh * 0.15); sn.quadraticCurveTo(fx + rx * 0.76, cy + hh * 0.25, fx + rx * 0.6, cy + hh * 0.27); sn.lineTo(fx - rx * 0.5, cy + hh * 0.36); sn.closePath(); part(c, sn, body, { off: 0 }); g.save(); g.clip(sn); g.fillStyle = belly; g.fillRect(fx - rx, cy + hh * 0.19, rx * 2, hh * 0.3); g.restore(); g.strokeStyle = c.ink; g.lineWidth = lw; g.stroke(sn); mouthAt = [fx + rx * 0.25, cy + hh * 0.25]; break; }
      case "pig": part(c, rrect(fx - rx * 0.3, cy + hh * 0.0, rx * 0.55, hh * 0.28, hh * 0.06), body, { off: 0 }); part(c, ell(fx + rx * 0.25, cy + hh * 0.14, rx * 0.1, hh * 0.14), sp.accent, { off: 0 }); dot(g, fx + rx * 0.26, cy + hh * 0.12, rx * 0.04, shade(sp.accent, 0.4)); mouthAt = [fx - rx * 0.05, cy + hh * 0.33]; break;
      case "frog": eyeAt = [[hx + rx * 0.4, cy - ry * 0.8]]; mouthAt = [fx - rx * 0.2, cy + hh * 0.14]; break;
      case "beak": beakAt = [fx - rx * 0.12, cy + hh * 0.02]; break;
    }
  }
  if (sp.ear === "floppy") { // in front of the head
    if (side) ear(c, "floppy", hx - rx * 0.2, cy - ry * 0.62, ed.size, -0.25 + jig * 1.5, sp.accent, sp.accent);
    else for (const sg of [-1, 1]) { g.save(); g.translate(cx + sg * ed.pos[0], 0); g.scale(sg, 1); ear(c, "floppy", 0, cy + ed.pos[1], ed.size, -0.25 + jig * 1.5 * sg, sp.accent, sp.accent); g.restore(); }
  }
  if (sp.snout === "frog" && eyeAt) for (const [ex2, ey2] of eyeAt) part(c, ell(ex2, ey2, hh * 0.21, hh * 0.19), body, { off: hh * 0.035 }); // bulging eye bumps in front
  const box: FaceBox = { x: hx, y: cy, w: hw, h: hh };
  const isFrogMouth = sp.snout === "frog";
  drawFace(g, { ...fs, mouthWidth: isFrogMouth ? 0.5 : side ? 0.3 : fs.mouthWidth }, p, box, {
    ink: c.ink, lw, skin: body, side, eyeAt, mouthAt: beakAt ?? mouthAt, beak: beakAt ? sp.beak : undefined, beakSize: hw * 0.13,
    cat: sp.snout === "cat" || sp.snout === "rabbit" || sp.snout === "mouse" || sp.snout === "bear" || sp.snout === "dog",
  });
  // noses + whiskers on top
  if (!side) {
    if (sp.snout === "cat" || sp.snout === "rabbit") nose(cx, cy + hh * 0.11, hw * 0.05, sp.nose);
    if (sp.snout === "mouse") nose(cx, cy + hh * 0.15, hw * 0.06, sp.nose);
    if (sp.snout === "dog") nose(cx, cy + hh * 0.12, hw * 0.1, sp.nose);
    if (sp.snout === "bear") nose(cx, cy + hh * 0.13, hw * 0.08, sp.nose);
    if (sp.snout === "fox") nose(cx, cy + hh * 0.16, hw * 0.06, sp.nose);
    if (sp.snout === "rabbit" && !cueOf(p)) { g.fillStyle = "#ffffff"; g.strokeStyle = c.ink; g.lineWidth = lw * 0.7; const t = rrect(cx - hw * 0.04, cy + hh * 0.2, hw * 0.08, hh * 0.07, hw * 0.01); g.fill(t); g.stroke(t); g.beginPath(); g.moveTo(cx, cy + hh * 0.2); g.lineTo(cx, cy + hh * 0.27); g.stroke(); }
    if (sp.whisk) { g.strokeStyle = c.ink; g.lineWidth = lw * 0.6; for (const sg of [-1, 1]) for (const k of [-1, 1]) { g.beginPath(); g.moveTo(cx + sg * hw * 0.16, cy + hh * 0.2 + k * hh * 0.02); g.quadraticCurveTo(cx + sg * hw * 0.38, cy + hh * (0.17 + k * 0.05), cx + sg * hw * 0.56, cy + hh * (0.15 + k * 0.08)); g.stroke(); } }
  } else {
    const fx = hx + rx * 0.9;
    if (sp.snout === "cat" || sp.snout === "rabbit") nose(fx + rx * 0.14, cy + hh * 0.09, hw * 0.035, sp.nose);
    if (sp.snout === "mouse") dot(g, fx + rx * 0.62, cy + hh * 0.16, hw * 0.045, sp.nose);
    if (sp.snout === "dog") part(c, ell(fx + rx * 0.42, cy + hh * 0.04, rx * 0.12, hh * 0.07), sp.nose, { off: 0, lw: lw * 0.8 });
    if (sp.snout === "bear") part(c, ell(fx + rx * 0.33, cy + hh * 0.12, rx * 0.1, hh * 0.06), sp.nose, { off: 0, lw: lw * 0.8 });
    if (sp.snout === "fox") dot(g, fx + rx * 0.72, cy + hh * 0.17, hw * 0.035, sp.nose);
    if (sp.whisk) { g.strokeStyle = c.ink; g.lineWidth = lw * 0.6; for (const k of [-1, 1]) { g.beginPath(); g.moveTo(fx + rx * 0.05, cy + hh * 0.19); g.quadraticCurveTo(fx + rx * 0.4, cy + hh * (0.16 + k * 0.05), fx + rx * 0.75, cy + hh * (0.14 + k * 0.09)); g.stroke(); } }
  }
  if (s.scarf) { // optional identity prop under the chin
    const sc = rrect(cx - hw * 0.34, cy + ry * 0.82, hw * 0.68, hh * 0.13, hh * 0.06); part(c, sc, s.scarf, { off: 0 });
  }
}

function drawBiped(c: Ctx, s: CritterSpec, p: KPose) {
  const g = c.g, sp = SPECIES[s.species], u = c.u, side = c.side;
  const HH = s.heightHeads ?? 2.7, hh = (u / HH) * (sp.ear === "long" ? 0.86 : 1), hw = hh * sp.head[0];
  const col = s.color ?? sp.body, belly = s.belly ?? sp.belly, bird = sp.snout === "beak";
  const legLen = u * (bird ? 0.17 : 0.15), hipY = -legLen;
  const headCY = -u + sp.earTop * u + hh / 2 + (p.headDip ?? 0) * hh * 0.3;
  const bTop = headCY + hh * 0.32, bBot = hipY + u * 0.05;
  const bw = Math.min(hw * 0.86, u * 0.36) * (side ? 0.8 : 1) * (bird ? 1.25 : 1);
  c.lw = Math.max(1.2, hw * (s.lineW ?? 0.034));
  const limbW = u * 0.075, sideK = (a?: number) => (a ?? 6) - 6;
  // tail (behind)
  const tw = rad((p.tail ?? 0) * 18 + (p.jiggle ?? 0) * 0.6);
  if (side) tail(c, sp.tail, -bw * 0.42, bBot - (bBot - bTop) * 0.25, -1, tw, col, sp.accent, belly, u);
  else tail(c, sp.tail, bw * 0.36, bBot - (bBot - bTop) * 0.18, 1, tw - 0.15, col, sp.accent, belly, u);
  // legs
  const legs: [number, number, boolean][] = side ? [[sideK(-(p.legL ?? 0)) + 6, 0, true], [p.legR ?? 0, 0, false]] : [[p.legL ?? 0, -1, false], [p.legR ?? 0, 1, false]];
  for (const [a0, sg, far] of side ? [[p.legL ?? 0, 0, true], [p.legR ?? 0, 0, false]] as [number, number, boolean][] : legs) {
    const a = rad(a0), x0 = sg * bw * 0.28, y0 = hipY - u * 0.02, L = legLen + u * 0.02;
    const ex = x0 + Math.sin(a) * L * (side ? 1 : 0.5), ey = y0 + Math.cos(a) * L;
    const lc = far ? shade(bird ? sp.leg! : col, 0.18) : bird ? sp.leg! : col;
    if (bird) {
      g.strokeStyle = lc; g.lineWidth = c.lw * 1.8; g.beginPath(); g.moveTo(x0, y0 - u * 0.03); g.lineTo(ex, ey - c.lw); g.stroke();
      for (const t of [-0.6, 0, 0.6]) { g.beginPath(); g.moveTo(ex, ey - c.lw); g.lineTo(ex + Math.sin(t + (side ? 0.9 : 0)) * u * 0.05 * (side ? 1 : 1), ey - c.lw + Math.cos(t) * 0.0); g.stroke(); }
    } else {
      limb(c, [[x0, y0], [ex, ey - limbW * 0.45]], limbW, lc);
      part(c, ell(ex + (side ? limbW * 0.35 : sg * limbW * 0.15), ey - limbW * 0.42, limbW * 0.72, limbW * 0.48), far ? shade(belly, 0.15) : belly, { off: 0 });
    }
  }
  // far arm (profile)
  const arm = (a: number, sg: number, far: boolean) => {
    const sx = side ? 0 : sg * bw * 0.4, sy = bTop + (bBot - bTop) * 0.2, L = u * 0.2;
    const dx = side ? Math.sin(a) : sg * Math.sin(a), dy = Math.cos(a);
    if (bird) { g.save(); g.translate(sx, sy); g.rotate(side ? -a * 0.6 : -sg * (a - rad(10)) * 0.8); if (!side) g.scale(sg, 1); const w = new Path2D(); w.moveTo(0, -u * 0.02); w.quadraticCurveTo(u * 0.1, u * 0.02, u * 0.05, u * 0.17); w.quadraticCurveTo(-u * 0.03, u * 0.1, 0, -u * 0.02); part(c, w, far ? shade(col, 0.15) : col, { off: u * 0.015 }); g.restore(); return; }
    const ex = sx + dx * L, ey = sy + dy * L;
    limb(c, [[sx, sy], [ex, ey]], limbW * 0.92, far ? shade(col, 0.15) : col);
    part(c, ell(ex, ey, limbW * 0.62, limbW * 0.6), far ? shade(col, 0.15) : col, { off: 0 });
  };
  if (side) arm(rad(sideK(p.armL)), 1, true);
  // body + belly
  const bodyP = bean(bTop, bBot, bw / 2, bird ? 0.9 : 0.7);
  part(c, bodyP, col, { thick: true, off: bw * 0.1 });
  g.save(); g.clip(bodyP); g.fillStyle = belly; g.fill(ell(side ? bw * 0.18 : 0, bTop + (bBot - bTop) * 0.64, bw * 0.32, (bBot - bTop) * 0.36)); g.restore();
  if (!side) { arm(rad(p.armL ?? 8), -1, false); arm(rad(p.armR ?? 8), 1, false); }
  critterHead(c, sp, s, p, side ? bw * 0.1 : 0, headCY, hh);
  if (side) arm(rad(sideK(p.armR)), 1, false);
}

/** Quadruped: body always in profile, head front (Simon's Cat convention) or profile per view; 4-beat walk with 2-bone IK legs. */
function drawQuad(c: Ctx, s: CritterSpec, p: KPose, W: number) {
  const g = c.g, sp = SPECIES[s.species], col = s.color ?? sp.body, belly = s.belly ?? sp.belly;
  const u0 = c.u, sf = Math.min(1, (W * 0.94) / (u0 * 1.25)), u = u0 * sf;
  const legH = u * 0.3, bh = u * 0.3, bodyCY = -legH - bh * 0.42, bx0 = -u * 0.38, bx1 = u * 0.3;
  const hh = u * 0.4, hw = hh * sp.head[0];
  c.lw = Math.max(1.2, hw * (s.lineW ?? 0.034));
  const ph = p.gait, bob = ph === undefined ? 0 : -u * 0.02 * (0.5 + 0.5 * Math.cos(ph * TAU * 2));
  g.save(); g.translate(0, bob);
  const stride = u * 0.26, lift = u * 0.075, duty = 0.65, l1 = (legH + bh * 0.2) * 0.52, l2 = l1;
  const foot = (hipX: number, off: number, a: number): V2 => {
    if (ph === undefined) return [hipX + Math.sin(rad(a)) * legH * 0.6, -bob];
    const q = (((ph + off) % 1) + 1) % 1;
    if (q < duty) return [hipX + stride * (0.5 - q / duty), -bob];
    const k = (q - duty) / (1 - duty);
    return [hipX + stride * (-0.5 + k), -bob - lift * Math.sin(k * Math.PI)];
  };
  const hipY = bodyCY + bh * 0.1, hindX = bx0 + u * 0.12, foreX = bx1 - u * 0.06;
  // LH 0, LF .25, RH .5, RF .75 (characters.md 5.3 B); L = near side when facing right
  const legsDef: { x: number; off: number; front: boolean; near: boolean; a: number }[] = [
    { x: hindX + u * 0.03, off: 0.5, front: false, near: false, a: -(p.legL ?? 0) }, { x: foreX + u * 0.03, off: 0.75, front: true, near: false, a: p.legR ?? 0 },
    { x: hindX, off: 0, front: false, near: true, a: p.legL ?? 0 }, { x: foreX, off: 0.25, front: true, near: true, a: -(p.legR ?? 0) },
  ];
  const drawLeg = (L: (typeof legsDef)[number]) => {
    const A: V2 = [L.x, hipY], T = foot(L.x, L.off, L.a);
    const { joint, end } = ik2(A, T, l1, l2, L.front ? [-1, 0] : [1, 0]);
    const lc = L.near ? col : shade(col, 0.2);
    limb(c, [A, joint, end], u * 0.075, lc);
    part(c, ell(end[0] + u * 0.02, end[1] - u * 0.03, u * 0.05, u * 0.032), L.near ? belly : shade(belly, 0.18), { off: 0 });
  };
  legsDef.filter((l) => !l.near).forEach(drawLeg);
  const tsway = rad((p.tail ?? 0) * 14 + (ph !== undefined ? -Math.sin(ph * TAU) * 10 : 0) + (p.jiggle ?? 0) * 0.6);
  tail(c, sp.tail, bx0 + u * 0.04, bodyCY - bh * 0.2, -1, tsway, col, sp.accent, belly, u * 1.2);
  const torso = new Path2D(); // horizontal bean, chest higher than rump
  torso.moveTo(bx0 + u * 0.05, bodyCY - bh * 0.48);
  torso.bezierCurveTo(bx0 + u * 0.3, bodyCY - bh * 0.62, bx1 - u * 0.1, bodyCY - bh * 0.6, bx1 + u * 0.02, bodyCY - bh * 0.32);
  torso.bezierCurveTo(bx1 + u * 0.1, bodyCY + bh * 0.1, bx1 - u * 0.05, bodyCY + bh * 0.55, bx1 - u * 0.2, bodyCY + bh * 0.5);
  torso.bezierCurveTo(bx0 + u * 0.3, bodyCY + bh * 0.48, bx0 - u * 0.02, bodyCY + bh * 0.62, bx0 - u * 0.04, bodyCY + bh * 0.05);
  torso.bezierCurveTo(bx0 - u * 0.05, bodyCY - bh * 0.3, bx0, bodyCY - bh * 0.45, bx0 + u * 0.05, bodyCY - bh * 0.48);
  torso.closePath();
  part(c, torso, col, { thick: true, off: u * 0.03 });
  g.save(); g.clip(torso); g.fillStyle = belly; g.fill(ell((bx0 + bx1) / 2 + u * 0.04, bodyCY + bh * 0.55, u * 0.26, bh * 0.28)); g.restore();
  if (sp.snout === "cat") { g.save(); g.clip(torso); g.fillStyle = shade(col, 0.2); for (const x of [-0.18, -0.08, 0.02]) g.fill(poly([[x * u - u * 0.025, bodyCY - bh * 0.7], [x * u + u * 0.025, bodyCY - bh * 0.7], [x * u, bodyCY - bh * 0.15]])); g.restore(); }
  legsDef.filter((l) => l.near).forEach(drawLeg);
  const hbob = ph === undefined ? 0 : u * 0.01 * Math.sin(ph * TAU * 2 + 0.6);
  critterHead(c, sp, s, p, bx1 + u * (c.side ? 0.02 : -0.02), bodyCY - bh * 0.5 - hh * 0.3 + hbob + (p.headDip ?? 0) * hh * 0.5, hh);
  g.restore();
}

// ================================================================ 3. BLOB mascot (characters.md 2.4 / 5.3 C)
function drawBlob(c: Ctx, s: BlobSpec, p: KPose) {
  const g = c.g, u = c.u, n = s.shape?.n ?? 2.3, egg = s.shape?.egg ?? 0.1, aspect = s.shape?.aspect ?? 1.05;
  const feet = s.nubs?.feet !== false, bh = u * 0.64, bw = Math.min(bh / aspect, u * 0.62), bot = feet ? -u * 0.035 : 0, cy = bot - bh / 2, top = bot - bh;
  c.lw = Math.max(1.5, bw * (s.lineW ?? 0.04));
  const acc = s.accent ?? "#ffcf4a", belly = s.belly ?? tint(s.color, 0.45);
  const fz = s.fur ?? 0, furN = loopNoise(s.id + ":fur", [11, 17, 23]);
  const body = sePath(0, cy, bw / 2, bh / 2, n, egg, n * 0.95, fz ? (a) => 1 + fz * 0.035 * furN(a) : undefined, fz ? 160 : 88);
  const jig = (p.jiggle ?? 0) + Math.sin(c.t * TAU * 0.7) * 2.5; // blob jiggle idle is part of the style (4.7)
  // attachments behind the body
  (s.attachments ?? []).forEach((a, i) => {
    const th = rad(a.at), bx = Math.sin(th) * bw * 0.44, by = cy - Math.cos(th) * bh * 0.47, L = a.len * u;
    const ang = th + rad(jig * (a.kind === "antenna" ? 1.1 : 0.6) + Math.sin(c.t * TAU * 0.9 + i) * (a.kind === "antenna" ? 3 : 1));
    g.save(); g.translate(bx, by); g.rotate(ang);
    const ac = a.color ?? (a.kind === "horn" ? "#f3e6c4" : a.kind === "leaf" ? "#5cbf5a" : a.kind === "antenna" ? acc : s.color);
    if (a.kind === "antenna") {
      const bend = rad(jig) * L * 0.6;
      g.strokeStyle = c.ink; g.lineWidth = c.lw * 1.3; g.beginPath(); g.moveTo(0, bh * 0.04); g.quadraticCurveTo(bend, -L * 0.55, bend * 1.4, -L); g.stroke();
      part(c, ell(bend * 1.4, -L, u * 0.04, u * 0.04), ac, { off: u * 0.012 });
    } else if (a.kind === "ear") {
      const e = new Path2D(); e.moveTo(-u * 0.075, bh * 0.06); e.quadraticCurveTo(-u * 0.06, -L * 0.7, 0, -L); e.quadraticCurveTo(u * 0.06, -L * 0.7, u * 0.075, bh * 0.06); e.closePath();
      part(c, e, ac, { off: u * 0.02 }); g.fillStyle = acc; g.fill(moved(e, 0, L * 0.1, 0.5, 0.7));
    } else if (a.kind === "horn") {
      const h = new Path2D(); h.moveTo(-u * 0.04, bh * 0.05); h.quadraticCurveTo(-u * 0.02, -L * 0.6, u * 0.04, -L); h.quadraticCurveTo(u * 0.03, -L * 0.4, u * 0.045, bh * 0.05); h.closePath(); part(c, h, ac, { off: u * 0.012 });
    } else if (a.kind === "tuft") {
      for (const k of [-1, 0, 1]) { g.save(); g.rotate(k * 0.45); const t = new Path2D(); t.moveTo(-u * 0.03, bh * 0.04); t.quadraticCurveTo(-u * 0.02, -L * 0.6, u * 0.012 * k, -L * (k ? 0.75 : 1)); t.quadraticCurveTo(u * 0.035, -L * 0.4, u * 0.03, bh * 0.04); t.closePath(); part(c, t, ac, { off: 0 }); g.restore(); }
    } else {
      g.strokeStyle = c.ink; g.lineWidth = c.lw * 1.2; g.beginPath(); g.moveTo(0, bh * 0.03); g.quadraticCurveTo(u * 0.01, -L * 0.3, u * 0.02, -L * 0.45); g.stroke();
      g.save(); g.translate(u * 0.02, -L * 0.45); g.rotate(0.7); const lf = ell(0, -L * 0.28, L * 0.17, L * 0.32); part(c, lf, ac, { off: L * 0.05 }); g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.6; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -L * 0.5); g.stroke(); g.restore();
    }
    g.restore();
  });
  if (feet) for (const sg of [-1, 1]) { // stub feet under the body, lift with the leg angle
    const lift = Math.max(0, (sg < 0 ? p.legL ?? 0 : p.legR ?? 0) * sg) / 24;
    part(c, ell(sg * bw * (c.side ? 0.08 : 0.2) + (c.side ? sg * bw * 0.05 : 0), -u * 0.04 - lift * u * 0.05, u * 0.085, u * 0.045), shade(s.color, 0.12), { off: 0 });
  }
  part(c, body, s.color, { thick: true, off: bw * 0.1 });
  g.save(); g.clip(body); g.fillStyle = belly; g.fill(ell(c.side ? bw * 0.12 : 0, cy + bh * 0.3, bw * 0.33, bh * 0.28)); g.restore();
  g.save(); g.clip(body); g.fillStyle = "rgba(255,255,255,0.45)"; g.fill(ell(c.light * bw * 0.24, top + bh * 0.17, bw * 0.09, bh * 0.05, rad(-25 * c.light))); g.restore();
  if (fz) { g.strokeStyle = c.ink; g.lineWidth = c.lw; g.stroke(body); }
  const fbox: FaceBox = { x: c.side ? bw * 0.1 : 0, y: cy - bh * 0.06, w: bw * 0.8, h: bh * 0.66 };
  drawFace(g, { eyes: "whites", eyeSize: 0.24, eyeSpacing: 0.42, eyeY: 0.4, mouthTier: 5, mouthWidth: 0.3, mouthY: 0.74, blush: true, ...s.face }, p, fbox, { ink: c.ink, lw: c.lw, skin: s.color, side: c.side });
  if (s.nubs?.arms !== false) for (const sg of c.side ? [1] : [-1, 1]) {
    const a = rad(sg < 0 ? p.armL ?? 15 : p.armR ?? 15), sx = c.side ? -bw * 0.12 : sg * bw * 0.47, sy = cy + bh * 0.1;
    const as = c.side ? a + rad(25) : a, dx = c.side ? Math.sin(as) : sg * Math.sin(as), dy = Math.cos(as); // profile nub angled forward so it reads as a limb
    part(c, ell(sx + dx * u * 0.06, sy + dy * u * 0.06, u * 0.085, u * 0.045, Math.atan2(dy, dx)), c.side ? shade(s.color, 0.08) : s.color, { off: u * 0.01 });
  }
}

// ================================================================ 4. STICK (characters.md 2.2 / 5.3 D)
/** Pose-target library (hand/foot targets in head units relative to the hip; x outward or forward, y up). */
export const STICK_POSES: Record<string, KPose> = {
  idle: {},
  point: { limbs: { handR: [2.0, 1.75] }, expr: "happy" },
  shrug: { limbs: { handL: [1.2, 1.9], handR: [1.2, 1.9] }, expr: "smug" },
  facepalm: { limbs: { handR: [0.15, 2.85] }, expr: "sad", lean: 4 },
  cheer: { limbs: { handL: [1.15, 3.0], handR: [1.15, 3.0] }, expr: "laugh" },
  think: { limbs: { handR: [0.25, 2.55], handL: [0.4, 1.3] }, expr: "think" },
  punch: { limbs: { handR: [2.3, 1.85], handL: [0.6, 1.5], footL: [-0.75, -2.45], footR: [0.85, -2.5] }, expr: "angry", lean: 8, view: "side" },
  run: { limbs: { handR: [1.0, 1.25], handL: [-0.8, 1.0], footL: [1.0, -2.0], footR: [-1.1, -2.2] }, lean: 14, expr: "determined", view: "side" },
  jump: { limbs: { handL: [1.2, 3.2], handR: [1.2, 3.2], footL: [0.7, -1.9], footR: [0.75, -1.8] }, bob: -0.35, expr: "laugh" },
};
type StickRig = { head: V2; neck: V2; sh: V2; hip: V2; arms: { j: V2; e: V2; far: boolean }[]; legs: { j: V2; e: V2; far: boolean }[] };
function stickRig(c: Ctx, s: StickSpec, p: KPose): StickRig {
  const d = c.u / (s.heightHeads ?? 5.5), side = c.side;
  const head: V2 = [0, -c.u + d / 2], neck: V2 = [0, -c.u + d * 1.02], sh: V2 = [0, -c.u + d * 1.25], hip: V2 = [0, -c.u + d * 2.95];
  const legLen = -hip[1] - d * 0.04, l1 = legLen * 0.5, a1 = d * 0.98;
  const T = (t: V2 | undefined, sg: number): V2 | null => (t ? [hip[0] + (side ? 1 : sg) * t[0] * d, hip[1] - t[1] * d] : null);
  const arms = ([-1, 1] as const).map((sg) => {
    const ang = sg < 0 ? p.armL ?? 20 : p.armR ?? 20, el = sg < 0 ? p.elbowL ?? 8 : p.elbowR ?? 8;
    const a = rad(side ? ang - 20 + (sg < 0 ? -10 : 12) : ang), dir: V2 = side ? [Math.sin(a), Math.cos(a)] : [sg * Math.sin(a), Math.cos(a)];
    const reach = 2 * a1 * (0.95 - 0.3 * clamp(el / 90));
    const tgt = T(sg < 0 ? p.limbs?.handL : p.limbs?.handR, sg) ?? [sh[0] + dir[0] * reach, sh[1] + dir[1] * reach];
    const { joint, end } = ik2(sh, tgt, a1, a1, side ? [-1, 0.3] : [sg, 0.5]);
    return { j: joint, e: end, far: side && sg < 0 };
  });
  const legs = ([-1, 1] as const).map((sg) => {
    const a = rad(sg < 0 ? p.legL ?? 0 : p.legR ?? 0);
    const tgt = T(sg < 0 ? p.limbs?.footL : p.limbs?.footR, sg) ??
      (side ? [hip[0] + Math.sin(a) * legLen * 0.98, hip[1] + Math.cos(a) * legLen * (0.98 - 0.08 * Math.max(0, Math.sin(a)))]
        : [hip[0] + sg * d * 0.35 + Math.sin(a) * legLen * 0.3, hip[1] + legLen * 0.985 * (1 - 0.1 * Math.max(0, sg * Math.sin(a) * 2))]);
    const { joint, end } = ik2(hip, tgt as V2, l1, l1, side ? [1, 0] : [sg, -0.15]);
    return { j: joint, e: end, far: side && sg < 0 };
  });
  return { head, neck, sh, hip, arms, legs };
}
function drawStick(c: Ctx, s: StickSpec, p: KPose) {
  const g = c.g, d = c.u / (s.heightHeads ?? 5.5), w = d * (s.lineW ?? 0.2), R = stickRig(c, s, p);
  c.lw = Math.max(1.5, d * 0.06);
  const col = s.color, far = shade(col, 0.22), xray = !!s.skeleton, outline = s.outline !== false;
  const segs: { pts: V2[]; far: boolean }[] = [
    ...R.arms.filter((a) => a.far).map((a) => ({ pts: [R.sh, a.j, a.e], far: true })), ...R.legs.filter((a) => a.far).map((a) => ({ pts: [R.hip, a.j, a.e], far: true })),
    { pts: [R.hip, R.neck], far: false },
    ...R.legs.filter((a) => !a.far).map((a) => ({ pts: [R.hip, a.j, a.e], far: false })), ...R.arms.filter((a) => !a.far).map((a) => ({ pts: [R.sh, a.j, a.e], far: false })),
  ];
  const path = (pts: V2[]) => { const q = new Path2D(); pts.forEach(([x, y], i) => (i ? q.lineTo(x, y) : q.moveTo(x, y))); return q; };
  // smear: on fast motion draw the limb sweep from the previous pose at 35 % alpha (characters.md 5.3 D)
  if (p.prev) {
    const P = stickRig(c, s, { ...p.prev, view: p.view });
    g.save(); g.globalAlpha = 0.35; g.fillStyle = col; g.strokeStyle = col; g.lineWidth = w * 0.9;
    const pairs: [{ j: V2; e: V2 }, { j: V2; e: V2 }][] = [...R.arms.map((a, i) => [P.arms[i], a] as [{ j: V2; e: V2 }, { j: V2; e: V2 }]), ...R.legs.map((a, i) => [P.legs[i], a] as [{ j: V2; e: V2 }, { j: V2; e: V2 }])];
    for (const [a, b] of pairs) {
      if (Math.hypot(a.e[0] - b.e[0], a.e[1] - b.e[1]) < d * 0.5) continue;
      g.fill(poly([a.j, a.e, b.e, b.j]));
      for (const k of [0.33, 0.66]) g.stroke(path([[lerp(a.j[0], b.j[0], k), lerp(a.j[1], b.j[1], k)], [lerp(a.e[0], b.e[0], k), lerp(a.e[1], b.e[1], k)]]));
    }
    g.restore();
  }
  g.lineCap = "round"; g.lineJoin = "round";
  if (xray) { // x-ray: translucent flesh shell, white capsule bones, big-socket skull (characters.md 2.17 2D)
    const shell = "rgba(150,210,255,0.35)";
    for (const sg of segs) { g.strokeStyle = shell; g.lineWidth = w * 2.4; g.stroke(path(sg.pts)); }
    dot(g, R.head[0], R.head[1], d * 0.62, shell);
    const bone = (a: V2, b: V2, bw: number) => {
      g.strokeStyle = c.ink; g.lineWidth = bw + c.lw * 2; g.stroke(path([a, b])); g.strokeStyle = "#f6f2e6"; g.lineWidth = bw; g.stroke(path([a, b]));
      for (const q of [a, b]) { g.fillStyle = "#f6f2e6"; g.strokeStyle = c.ink; g.lineWidth = c.lw; g.beginPath(); g.arc(q[0], q[1], bw * 0.85, 0, TAU); g.fill(); g.stroke(); }
    };
    for (const sg of segs.filter((x) => x.pts.length === 3)) { bone(sg.pts[0], sg.pts[1], w * 0.42); bone(sg.pts[1], sg.pts[2], w * 0.42); }
    for (let i = 0; i < 6; i++) { const y = lerp(R.neck[1], R.hip[1], i / 5); g.fillStyle = "#f6f2e6"; g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.8; const v = rrect(-w * 0.35, y - w * 0.18, w * 0.7, w * 0.36, w * 0.12); g.fill(v); g.stroke(v); }
    g.strokeStyle = c.ink; g.lineWidth = c.lw * 2.6;
    for (let i = 0; i < 4; i++) { const y = R.sh[1] + d * (0.15 + i * 0.22), rw = d * (0.55 - i * 0.04); g.beginPath(); g.ellipse(0, y, rw, d * 0.12, 0, Math.PI * 1.05, Math.PI * 1.95, true); g.stroke(); }
    g.strokeStyle = "#f6f2e6"; g.lineWidth = c.lw * 1.2;
    for (let i = 0; i < 4; i++) { const y = R.sh[1] + d * (0.15 + i * 0.22), rw = d * (0.55 - i * 0.04); g.beginPath(); g.ellipse(0, y, rw, d * 0.12, 0, Math.PI * 1.05, Math.PI * 1.95, true); g.stroke(); }
    const pel = new Path2D(); pel.moveTo(-d * 0.42, R.hip[1] - d * 0.25); pel.quadraticCurveTo(0, R.hip[1] - d * 0.05, d * 0.42, R.hip[1] - d * 0.25); pel.quadraticCurveTo(d * 0.3, R.hip[1] + d * 0.2, 0, R.hip[1] + d * 0.12); pel.quadraticCurveTo(-d * 0.3, R.hip[1] + d * 0.2, -d * 0.42, R.hip[1] - d * 0.25);
    g.fillStyle = "#f6f2e6"; g.fill(pel); g.strokeStyle = c.ink; g.lineWidth = c.lw; g.stroke(pel);
    const sk = sePath(R.head[0] + (c.side ? d * 0.05 : 0), R.head[1] - d * 0.03, d * 0.5, d * 0.48, 2.2, -0.15);
    g.fillStyle = "#f6f2e6"; g.fill(sk); g.lineWidth = c.lw * 1.2; g.stroke(sk);
    const so = c.side ? [d * 0.2] : [-d * 0.19, d * 0.19];
    for (const x of so) g.fill(ell(R.head[0] + x, R.head[1] - d * 0.02, d * 0.13, d * 0.15)), g.fillStyle = c.ink, g.fill(ell(R.head[0] + x, R.head[1] - d * 0.02, d * 0.13, d * 0.15)), g.fillStyle = "#f6f2e6";
    const open = cueOf(p) ? 0.08 : 0;
    g.fillStyle = c.ink; g.fill(poly([[R.head[0] + (c.side ? d * 0.38 : 0), R.head[1] + d * 0.1], [R.head[0] + (c.side ? d * 0.42 : -d * 0.05), R.head[1] + d * 0.18], [R.head[0] + (c.side ? d * 0.34 : d * 0.05), R.head[1] + d * 0.18]]));
    g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.9; g.beginPath();
    const mx0 = R.head[0] + (c.side ? d * 0.12 : -d * 0.2), mx1 = R.head[0] + (c.side ? d * 0.45 : d * 0.2), my = R.head[1] + d * 0.3 + open * d;
    g.moveTo(mx0, my); g.lineTo(mx1, my); for (let i = 0; i <= 4; i++) { const x = lerp(mx0, mx1, i / 4); g.moveTo(x, my - d * 0.06); g.lineTo(x, my + d * 0.06); } g.stroke();
    return;
  }
  // layered draw: far limbs + spine + near legs (one silhouette) -> skirt/coat -> head -> near arms + prop -> hands
  const bw = s.build === "stout" ? 1.35 : s.build === "slim" ? 0.8 : 1;
  const nArm = R.arms.filter((a) => !a.far).length, body = segs.slice(0, segs.length - nArm), arms = segs.slice(segs.length - nArm);
  const strokeSet = (set: typeof segs) => {
    if (outline) for (const sg of set) { g.strokeStyle = c.ink; g.lineWidth = (sg.pts.length === 2 ? w * bw : w) + c.lw * 2; g.stroke(path(sg.pts)); }
    for (const sg of set) { g.strokeStyle = sg.far ? far : col; g.lineWidth = sg.pts.length === 2 ? w * bw : w; g.stroke(path(sg.pts)); }
  };
  strokeSet(body);
  stickClothes(c, s, R, d, w);
  const hc = s.head ?? col;
  if (s.hair && (s.hair.style === "long" || s.hair.style === "bun")) stickHair(c, s.hair, R.head, d, true);
  if (outline) dot(g, R.head[0], R.head[1], d / 2 + c.lw, c.ink);
  dot(g, R.head[0], R.head[1], d / 2, hc);
  g.save(); g.clip(ell(R.head[0], R.head[1], d / 2, d / 2)); g.fillStyle = shade(hc, 0.2); g.fill(ell(R.head[0] - c.light * d * 0.12, R.head[1] + d * 0.05, d / 2, d / 2)); g.fillStyle = hc; g.fill(ell(R.head[0] + c.light * d * 0.02, R.head[1] - d * 0.03, d * 0.47, d * 0.47)); g.restore();
  if (s.cheeks) for (const x of c.side ? [d * 0.12] : [-d * 0.26, d * 0.26]) { g.save(); g.globalAlpha = 0.35; dot(g, R.head[0] + x, R.head[1] + d * 0.1, d * 0.09, "#ff7a8a"); g.restore(); }
  if (s.face !== null) drawFace(g, { eyes: "dot", eyeSize: 0.13, eyeSpacing: 0.36, eyeY: 0.45, mouthTier: 2, mouthWidth: 0.36, mouthY: 0.72, brows: "line", catchlight: false, ...s.face }, p, { x: R.head[0], y: R.head[1], w: d, h: d }, { ink: c.ink, lw: c.lw * 0.9, skin: hc, side: c.side });
  stickFace(c, s, R.head, d);
  if (s.hair && s.hair.style !== "long" && s.hair.style !== "bun") stickHair(c, s.hair, R.head, d, false);
  if (s.hat) stickHat(c, s.hat, [R.head[0], R.head[1] - (p.hatLift ?? 0) * d], d, p.hatTilt ?? 0);
  const held = p.hold ? R.arms[p.hold.hand === "L" ? 0 : 1] : null;
  if (held && held.far) stickProp(c, p.hold!, held, d, w);
  strokeSet(arms);
  if (held && !held.far) stickProp(c, p.hold!, held, d, w);
  if (s.hands !== "none") for (const a of R.arms) dot(g, a.e[0], a.e[1], w * 0.72, a.far ? far : col);
}

/** Coat (frock tails, collar, buttons), skirt and neckwear over the spine (stick accessories). */
function stickClothes(c: Ctx, s: StickSpec, R: StickRig, d: number, w: number) {
  const g = c.g, side = c.side, top = R.sh[1] - d * 0.1, hip = R.hip[1];
  if (s.skirt) {
    const tw = side ? d * 0.3 : d * 0.32, bw = side ? d * 0.62 : d * 0.78, y0 = hip - d * 0.55, y1 = hip + d * 0.75;
    part(c, poly([[-tw, y0], [tw, y0], [bw, y1], [-bw, y1]]), s.skirt, { off: d * 0.06 });
  }
  if (s.coat) {
    const k = s.build === "stout" ? 1.3 : s.build === "slim" ? 0.85 : 1, sw = (side ? d * 0.34 : d * 0.42) * k, hw = (side ? d * 0.38 : d * 0.5) * k;
    const y1 = hip + d * 0.28, tail = s.coat.tails ? d * 0.95 : 0;
    const pts: V2[] = side
      ? [[-sw, top], [sw * 0.9, top], [hw * 0.75, y1], [-hw * 0.6, y1], ...(tail ? ([[-hw * 0.55, y1 + tail], [-hw * 1.05, y1 + tail * 0.92]] as V2[]) : []), [-hw, y1 - d * 0.05]]
      : [[-sw, top], [sw, top], [hw, y1], ...(tail ? ([[hw * 1.02, y1 + tail], [hw * 0.55, y1 + tail * 0.9], [hw * 0.3, y1]] as V2[]) : []),
        ...(tail ? ([[-hw * 0.3, y1], [-hw * 0.55, y1 + tail * 0.9], [-hw * 1.02, y1 + tail]] as V2[]) : []), [-hw, y1]];
    part(c, poly(pts), s.coat.color, { off: d * 0.07, thick: true });
    if (!side) { // open front: a V of shirt + lapels
      const vy = top + d * 0.85;
      part(c, poly([[-sw * 0.42, top], [sw * 0.42, top], [0, vy]]), s.coat.collar ?? "#f4efe6", { off: 0 });
      g.strokeStyle = c.ink; g.lineWidth = c.lw; g.beginPath(); g.moveTo(0, vy); g.lineTo(0, y1); g.stroke();
      if (s.coat.buttons) for (let i = 0; i < 3; i++) dot(g, -d * 0.07, vy + (i + 0.5) * ((y1 - vy) / 3.2), d * 0.035, s.coat.buttons);
    } else if (s.coat.buttons) for (let i = 0; i < 3; i++) dot(g, sw * 0.62, top + d * (0.45 + i * 0.32), d * 0.035, s.coat.buttons);
  }
  if (s.neckwear) {
    const n = s.neckwear, y = R.neck[1] + d * 0.12, x = side ? d * 0.12 : 0;
    if (n.style === "bow") {
      const a = d * 0.2, b = d * 0.11;
      part(c, poly(side ? [[x, y], [x + a * 0.7, y - b], [x + a * 0.7, y + b]] : [[0, y], [-a, y - b], [-a, y + b]]), n.color, { off: 0 });
      if (!side) part(c, poly([[0, y], [a, y - b], [a, y + b]]), n.color, { off: 0 });
      dot(g, x, y, d * 0.05, shade(n.color, 0.3));
    } else if (n.style === "tie") {
      part(c, poly([[x - d * 0.06, y - d * 0.04], [x + d * 0.06, y - d * 0.04], [x + d * 0.1, y + d * 0.75], [x, y + d * 0.88], [x - d * 0.1, y + d * 0.75]]), n.color, { off: 0 });
    } else {
      part(c, rrect(-d * 0.36, y - d * 0.12, d * 0.72, d * 0.22, d * 0.1), n.color, { off: d * 0.04 });
      part(c, poly([[d * 0.12, y], [d * 0.3, y], [d * 0.36, y + d * 0.7], [d * 0.16, y + d * 0.66]]), n.color, { off: 0 });
    }
  }
  void w;
}

/** Facial hair + glasses on a stick head (centre `h`, diameter d). Side view faces +x. */
function stickFace(c: Ctx, s: StickSpec, h: V2, d: number) {
  const g = c.g, side = c.side;
  if (s.beard) {
    const bx = h[0] + (side ? d * 0.12 : 0), by = h[1] + d * 0.24;
    part(c, side ? poly([[bx - d * 0.25, by - d * 0.1], [bx + d * 0.36, by - d * 0.06], [bx + d * 0.18, by + d * 0.32], [bx - d * 0.1, by + d * 0.22]])
      : sePath(bx, by + d * 0.04, d * 0.36, d * 0.24, 2.2, 0.3), s.beard, { off: d * 0.04 });
  }
  if (s.stache) {
    const y = h[1] + d * 0.13, x = h[0] + (side ? d * 0.3 : 0), r = d * 0.17;
    const wing = (sg: number) => { const q = new Path2D(); q.moveTo(x, y - r * 0.15); q.quadraticCurveTo(x + sg * r * 0.9, y - r * 0.7, x + sg * r * 1.45, y - r * 0.05);
      q.quadraticCurveTo(x + sg * r * 0.9, y + r * 0.25, x, y + r * 0.2); q.closePath(); return q; };
    for (const sg of side ? [1, -0.55] : [-1, 1]) part(c, wing(sg), s.stache, { off: 0, lw: c.lw * 0.8 });
  }
  if (s.glasses) {
    const y = h[1] - d * 0.05, xs = side ? [d * 0.2] : [-d * 0.18, d * 0.18];
    g.strokeStyle = s.glasses; g.lineWidth = c.lw * 1.1;
    for (const x of xs) { g.beginPath(); g.arc(h[0] + x, y, d * 0.12, 0, TAU); g.stroke(); }
    g.beginPath(); if (side) { g.moveTo(h[0] + d * 0.08, y); g.lineTo(h[0] - d * 0.22, y - d * 0.02); } else { g.moveTo(h[0] - d * 0.06, y); g.lineTo(h[0] + d * 0.06, y); } g.stroke();
  }
}

/** Hair on a stick head. back=true draws the parts that sit behind the head (long, bun). */
function stickHair(c: Ctx, hr: NonNullable<StickSpec["hair"]>, h: V2, d: number, back: boolean) {
  const g = c.g, r = d / 2, side = c.side;
  if (back) {
    if (hr.style === "long") part(c, poly([[h[0] - r * 1.05, h[1] - r * 0.2], [h[0] + r * 1.05, h[1] - r * 0.2], [h[0] + r * (side ? 0.5 : 1.15), h[1] + r * 1.7], [h[0] - r * 1.2, h[1] + r * 1.75]]), hr.color, { off: d * 0.05 });
    else part(c, ell(h[0] - (side ? r * 0.75 : 0), h[1] - r * (side ? 0.55 : 0.95), r * 0.42, r * 0.38), hr.color, { off: d * 0.03 });
    // a fringe cap on the front too
    return;
  }
  if (hr.style === "side" || hr.style === "curly") {
    const q = new Path2D(); q.ellipse(h[0], h[1], r * 1.03, r * 1.03, 0, Math.PI * 1.02, Math.PI * 1.98);
    q.quadraticCurveTo(h[0] + r * 0.4, h[1] - r * 0.25, h[0] - r * (side ? 0.2 : 0.5), h[1] - r * 0.45); q.closePath();
    part(c, q, hr.color, { off: d * 0.03 });
    if (hr.style === "curly") for (let i = 0; i < 5; i++) { const a = Math.PI * (1.1 + i * 0.2); part(c, ell(h[0] + Math.cos(a) * r, h[1] + Math.sin(a) * r, r * 0.26, r * 0.26), hr.color, { off: 0 }); }
  } else if (hr.style === "spikes") {
    const pts: V2[] = []; for (let i = 0; i <= 6; i++) { const a = Math.PI * (1.05 + i * 0.15); const rr = i % 2 ? r * 1.45 : r * 0.98; pts.push([h[0] + Math.cos(a) * rr, h[1] + Math.sin(a) * rr]); }
    part(c, poly([...pts, [h[0] + r * 0.9, h[1] - r * 0.25], [h[0] - r * 0.9, h[1] - r * 0.25]]), hr.color, { off: d * 0.03 });
  } else { // tuft: three ink curls
    g.strokeStyle = hr.color; g.lineWidth = c.lw * 1.6;
    for (const k of [-1, 0, 1]) { g.beginPath(); g.moveTo(h[0] + k * r * 0.18, h[1] - r * 0.95); g.quadraticCurveTo(h[0] + k * r * 0.45, h[1] - r * 1.45, h[0] + k * r * 0.1 + r * 0.25, h[1] - r * 1.35); g.stroke(); }
  }
}

/** Hat on a stick head; `h` is where the head centre would be (lifted for a hat tip), tilt in deg. */
function stickHat(c: Ctx, hat: StickHat, h: V2, d: number, tilt = 0) {
  const g = c.g, r = d / 2, side = c.side;
  g.save(); g.translate(h[0], h[1] - r * 0.62); g.rotate(rad(tilt + (side ? -4 : -6)));
  const band = hat.band ?? shade(hat.color, 0.45);
  if (hat.style === "top") {
    part(c, poly([[-r * 0.62, 0], [r * 0.62, 0], [r * 0.7, -d * 0.95], [-r * 0.7, -d * 0.95]]), hat.color, { off: d * 0.06, thick: true });
    part(c, rrect(-r * 0.62, -d * 0.24, r * 1.24, d * 0.16, 0), band, { off: 0 });
    part(c, ell(0, 0, r * 1.15, d * 0.08), hat.color, { off: d * 0.02 });
  } else if (hat.style === "bowler") {
    const q = new Path2D(); q.ellipse(0, 0, r * 0.82, d * 0.5, 0, Math.PI, 0); q.closePath();
    part(c, q, hat.color, { off: d * 0.06, thick: true });
    part(c, rrect(-r * 0.8, -d * 0.14, r * 1.6, d * 0.12, 0), band, { off: 0 });
    part(c, ell(side ? r * 0.08 : 0, 0, r * 1.12, d * 0.08), hat.color, { off: d * 0.02 });
  } else if (hat.style === "boater") {
    part(c, ell(0, 0, r * 1.35, d * 0.1), hat.color, { off: d * 0.02 });
    part(c, rrect(-r * 0.72, -d * 0.36, r * 1.44, d * 0.36, d * 0.04), hat.color, { off: d * 0.05 });
    part(c, rrect(-r * 0.72, -d * 0.18, r * 1.44, d * 0.11, 0), hat.band ?? "#c0392b", { off: 0 });
  } else if (hat.style === "cap" || hat.style === "hardhat") {
    const q = new Path2D(); q.ellipse(0, d * 0.04, r * 1.0, d * 0.48, 0, Math.PI, 0); q.closePath();
    part(c, q, hat.color, { off: d * 0.05, thick: true });
    part(c, side ? ell(r * 0.95, d * 0.03, r * 0.6, d * 0.07) : ell(0, d * 0.05, r * (hat.style === "hardhat" ? 1.25 : 0.95), d * 0.08), hat.style === "hardhat" ? hat.color : band, { off: 0 });
  } else { // beanie
    const q = new Path2D(); q.ellipse(0, d * 0.1, r * 1.02, d * 0.52, 0, Math.PI, 0); q.closePath();
    part(c, q, hat.color, { off: d * 0.05 });
    part(c, rrect(-r * 1.02, -d * 0.02, r * 2.04, d * 0.16, d * 0.05), band, { off: 0 });
    part(c, ell(0, -d * 0.45, d * 0.12, d * 0.12), band, { off: 0 });
  }
  g.restore();
}

/** A held prop along the forearm (elbow -> hand) of arm `a`. */
function stickProp(c: Ctx, h: StickHold, a: { j: V2; e: V2 }, d: number, w: number) {
  const g = c.g, ang = Math.atan2(a.e[1] - a.j[1], a.e[0] - a.j[0]) + rad(h.angle ?? 0), L = (h.len ?? (h.item === "axe" ? 2.2 : 1.7)) * d;
  g.save(); g.translate(a.e[0], a.e[1]); g.rotate(ang);
  const wood = h.color ?? "#9a6a3c";
  if (h.item === "axe") {
    part(c, rrect(-L * 0.22, -w * 0.38, L, w * 0.76, w * 0.3), wood, { off: 0 });
    // head reads at feed size: ~0.9 head-heights tall, bright steel with a highlight on the edge
    part(c, poly([[L * 0.68, -w * 0.45], [L * 0.94, -w * 0.45], [L * 1.04, -d * 0.95], [L * 0.6, -d * 0.82]]), "#b7c0ce", { off: d * 0.05, thick: true });
    g.strokeStyle = "#f3f6fa"; g.lineWidth = c.lw * 1.8; g.beginPath(); g.moveTo(L * 0.63, -d * 0.8); g.lineTo(L * 1.02, -d * 0.93); g.stroke();
  } else if (h.item === "cane") {
    part(c, rrect(-L * 0.08, -w * 0.3, L, w * 0.6, w * 0.3), wood, { off: 0 });
    g.strokeStyle = c.ink; g.lineWidth = w * 0.6 + c.lw * 2; g.beginPath(); g.arc(-L * 0.08, -d * 0.18, d * 0.18, Math.PI * 0.5, Math.PI * 1.6); g.stroke();
    g.strokeStyle = wood; g.lineWidth = w * 0.6; g.stroke();
  } else if (h.item === "flag" || h.item === "lever") {
    part(c, rrect(-L * 0.15, -w * 0.3, L, w * 0.6, w * 0.3), h.item === "lever" ? "#5d6470" : wood, { off: 0 });
    if (h.item === "flag") part(c, poly([[L * 0.85, 0], [L * 0.85, -d * 0.9], [L * 0.2, -d * 0.6]]), h.color ?? "#e04a3a", { off: d * 0.04 });
    else part(c, ell(L * 0.85, 0, d * 0.16, d * 0.16), "#e04a3a", { off: d * 0.03 });
  } else if (h.item === "phone" || h.item === "cup" || h.item === "paper") {
    g.rotate(-ang); // small hand props stay upright whatever the forearm does
    if (h.item === "phone") { part(c, rrect(-d * 0.085, -d * 0.3, d * 0.17, d * 0.32, d * 0.035), h.color ?? "#23262e", { off: 0 }); g.fillStyle = "#9fd8ff"; g.fill(rrect(-d * 0.06, -d * 0.27, d * 0.12, d * 0.22, d * 0.015)); }
    else if (h.item === "cup") { part(c, poly([[-d * 0.1, -d * 0.24], [d * 0.1, -d * 0.24], [d * 0.075, 0], [-d * 0.075, 0]]), h.color ?? "#f4efe6", { off: d * 0.02 }); part(c, rrect(-d * 0.115, -d * 0.28, d * 0.23, d * 0.06, d * 0.02), "#7a4a2a", { off: 0 }); }
    else { part(c, rrect(-d * 0.16, -d * 0.42, d * 0.32, d * 0.42, d * 0.02), h.color ?? "#fbfaf6", { off: d * 0.02 }); g.strokeStyle = "rgba(40,30,50,0.55)"; g.lineWidth = c.lw * 0.6; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-d * 0.11, -d * (0.34 - i * 0.075)); g.lineTo(d * (i === 3 ? 0.02 : 0.11), -d * (0.34 - i * 0.075)); g.stroke(); } }
  } else if (h.item === "coin") {
    g.rotate(-ang); const r = (h.len ?? 0.3) * d, cx = d * 0.05, cy = -r * 0.75; // held between finger and thumb, above the fist
    const pth = new Path2D(); const N = 28; for (let i = 0; i <= N; i++) { const a2 = (i / N) * Math.PI * 2; let x = Math.cos(a2) * r, y = Math.sin(a2) * r; if (h.cut) { const dd = x * 0.8 - y * 0.6 - r * 0.72; if (dd > 0) { x -= 0.8 * dd; y += 0.6 * dd; } } if (i) pth.lineTo(cx + x, cy + y); else pth.moveTo(cx + x, cy + y); }
    pth.closePath(); part(c, pth, h.color ?? "#dfe3ec", { off: d * 0.02, thick: true });
    g.strokeStyle = "#9aa2b4"; g.lineWidth = c.lw * 0.9; g.beginPath(); g.arc(cx, cy, r * 0.72, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#b4bccb"; g.beginPath(); g.arc(cx + r * 0.05, cy - r * 0.12, r * 0.26, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(cx, cy + r * 0.46, r * 0.4, r * 0.24, 0, Math.PI, 0); g.fill();
  } else if (h.item === "shears") {
    const o = 0.1 + 0.5 * (h.open ?? 0.6), Lb = (h.len ?? 0.95) * d;
    for (const sgn of [1, -1]) { g.save(); g.rotate(sgn * o * 0.5);
      part(c, poly([[d * 0.02, -w * 0.16], [Lb, -w * 0.04], [Lb, w * 0.1], [d * 0.02, w * 0.16]]), "#c3cbd8", { off: 0 });
      g.strokeStyle = c.ink; g.lineWidth = c.lw * 1.6; g.beginPath(); g.ellipse(-d * 0.14, sgn * d * 0.1, d * 0.12, d * 0.09, 0, 0, Math.PI * 2); g.stroke(); g.restore(); }
    part(c, ell(d * 0.03, 0, w * 0.2, w * 0.2), "#5c6678", { off: 0 });
  } else if (h.item === "file" || h.item === "quill") {
    const Lf = (h.len ?? 0.9) * d;
    if (h.item === "file") { part(c, rrect(-d * 0.1, -w * 0.3, d * 0.3, w * 0.6, w * 0.2), wood, { off: 0 }); part(c, rrect(d * 0.2, -w * 0.2, Lf, w * 0.4, w * 0.08), "#8d96a6", { off: 0 }); }
    else { part(c, poly([[-d * 0.05, 0], [Lf, -w * 0.5], [Lf * 0.92, w * 0.15]]), h.color ?? "#f8f4ea", { off: 0 }); }
  } else if (h.item === "hammer") {
    const Lh = (h.len ?? 1.0) * d; part(c, rrect(-Lh * 0.18, -w * 0.3, Lh, w * 0.6, w * 0.25), wood, { off: 0 });
    part(c, rrect(Lh * 0.66, -d * 0.24, d * 0.3, d * 0.48, d * 0.05), "#7d8696", { off: d * 0.04, thick: true });
  } else if (h.item === "bar") {
    g.rotate(-ang); part(c, poly([[-d * 0.34, d * 0.02], [d * 0.34, d * 0.02], [d * 0.26, -d * 0.2], [-d * 0.26, -d * 0.2]]), h.color ?? "#e4e8f0", { off: d * 0.03, thick: true });
    g.strokeStyle = "#ffffff"; g.lineWidth = c.lw * 1.4; g.beginPath(); g.moveTo(-d * 0.18, -d * 0.14); g.lineTo(d * 0.1, -d * 0.14); g.stroke();
  } else if (h.item === "sack") {
    g.rotate(-ang); const pth = new Path2D(); pth.moveTo(-d * 0.28, d * 0.55); pth.quadraticCurveTo(-d * 0.42, d * 0.1, -d * 0.1, -d * 0.02); pth.lineTo(d * 0.1, -d * 0.02); pth.quadraticCurveTo(d * 0.42, d * 0.1, d * 0.28, d * 0.55); pth.closePath();
    part(c, pth, h.color ?? "#c9b48a", { off: d * 0.04, thick: true }); part(c, rrect(-d * 0.12, -d * 0.08, d * 0.24, d * 0.08, d * 0.03), "#6b3f26", { off: 0 });
  } else if (h.item === "bag") {
    part(c, rrect(-d * 0.35, d * 0.05, d * 0.7, d * 0.55, d * 0.1), h.color ?? "#7a4a2a", { off: d * 0.05 });
  } else if (h.item === "hat" && h.hat) {
    g.rotate(-ang); // brim at the hand: hat held to the chest
    if (h.as === "bobble") { g.rotate(Math.PI * 0.94); bobbleHat(c, h.hat as BobbleHat, 0, d * 0.3, d / 2, false, 0); g.rotate(-Math.PI * 0.94); } // held by the brim, crown down: never covers the face
    else stickHat(c, h.hat as StickHat, [0, d * 0.35], d, -8);
  }
  g.restore();
}

// ================================================================ 5. CHIBI (characters.md 2.3 / 2.24 / 5.3 E)
function drawChibi(c: Ctx, s: ChibiSpec, p: KPose) {
  const g = c.g, u = c.u, side = c.side, car = !!s.caricature;
  const HH = s.heightHeads ?? (car ? 2.7 : 2.3), hh = (u / HH) * (s.hat ? 0.92 : 1), hw = hh * (car ? 1.0 : 1.08);
  const rx = hw / 2, ry = hh / 2;
  c.lw = Math.max(1.5, hw * (s.lineW ?? 0.045)); // uniform storytime outline (5.3 E)
  const hatH = s.hat ? (s.hat.style === "top" ? hh * 0.62 : s.hat.style === "bicorne" ? hh * 0.36 : hh * 0.18) : hair(s) === "spiky" ? hh * 0.12 : hair(s) === "bun" ? hh * 0.14 : hh * 0.03;
  const cy = -u + hatH + ry + u * 0.01;
  const legH = car ? u * 0.19 : u * 0.14, hipY = -legH, shY = cy + ry * 0.86;
  const tw = hw * (car ? 0.52 : 0.46) * (side ? 0.8 : 1), bwid = hw * (car ? 0.56 : 0.54) * (side ? 0.8 : 1);
  const topC = s.top.color, st = s.top.style ?? "hoodie", pants = s.bottom ?? "#3a4466", shoes = s.shoes ?? "#2b2230";
  const limbW = hw * 0.15, armL = car ? u * 0.24 : u * 0.17;
  // legs
  for (const sg of [-1, 1]) {
    const a = rad(sg < 0 ? p.legL ?? 0 : p.legR ?? 0), farL = side && sg < 0;
    const x0 = side ? 0 : sg * bwid * 0.24, y0 = hipY - u * 0.03, ex = x0 + Math.sin(a) * legH * (side ? 1 : 0.5), ey = y0 + Math.cos(a) * (legH + u * 0.03);
    limb(c, [[x0, y0], [ex, ey - limbW * 0.5]], limbW, farL ? shade(pants, 0.2) : pants);
    part(c, ell(ex + (side ? limbW * 0.3 : sg * limbW * 0.12), ey - limbW * 0.42, limbW * 0.72, limbW * 0.46), farL ? shade(shoes, 0.2) : shoes, { off: 0 });
  }
  const arm = (sg: number, far: boolean) => {
    const ang = sg < 0 ? p.armL ?? 8 : p.armR ?? 8, a = rad(side ? ang - 6 : ang);
    const sx = side ? 0 : sg * tw * 0.47, sy = shY + u * 0.035, dx = side ? Math.sin(a) : sg * Math.sin(a), dy = Math.cos(a);
    const ex = sx + dx * armL, ey = sy + dy * armL, ccol = far ? shade(topC, 0.18) : topC;
    limb(c, [[sx, sy], [ex, ey]], limbW * 1.05, ccol);
    part(c, ell(ex + dx * limbW * 0.15, ey + dy * limbW * 0.15, limbW * 0.55, limbW * 0.55), far ? skinShade(s.skin) : s.skin, { off: 0, sh: skinShade(s.skin) });
  };
  if (side) arm(-1, true);
  // torso
  const tp = new Path2D(), bot = hipY + u * 0.025, dress = st === "dress", hemW = dress ? bwid * 0.78 : bwid / 2;
  tp.moveTo(-tw * 0.4, shY); tp.quadraticCurveTo(0, shY - hh * 0.04, tw * 0.4, shY);
  tp.quadraticCurveTo(tw * 0.56, shY + hh * 0.02, tw * 0.52, shY + hh * 0.12);
  tp.lineTo(hemW, bot - u * 0.02); tp.quadraticCurveTo(hemW, bot, hemW - u * 0.03, bot); tp.lineTo(-hemW + u * 0.03, bot); tp.quadraticCurveTo(-hemW, bot, -hemW, bot - u * 0.02);
  tp.lineTo(-tw * 0.52, shY + hh * 0.12); tp.quadraticCurveTo(-tw * 0.56, shY + hh * 0.02, -tw * 0.4, shY); tp.closePath();
  part(c, tp, topC, { thick: true, off: hw * 0.08 });
  const acc = s.top.accent ?? shade(topC, 0.22);
  g.save(); g.clip(tp); g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.65;
  if (st === "hoodie") { const pk = rrect(-bwid * 0.3 + (side ? bwid * 0.15 : 0), bot - (bot - shY) * 0.42, bwid * 0.6 * (side ? 0.6 : 1), (bot - shY) * 0.3, hh * 0.05); g.fillStyle = acc; g.fill(pk); g.stroke(pk); }
  if (st === "coat" || st === "costume") { g.beginPath(); g.moveTo(side ? tw * 0.3 : 0, shY + hh * 0.05); g.lineTo(side ? tw * 0.3 : 0, bot); g.stroke(); for (let i = 0; i < 3; i++) dot(g, (side ? tw * 0.3 : 0) + hw * 0.035, shY + (bot - shY) * (0.3 + i * 0.22), hw * 0.018, st === "costume" ? "#f1c94a" : c.ink); }
  if (st === "costume") { g.fillStyle = s.top.accent ?? "#f2f0ea"; g.fillRect(-hemW, bot - (bot - shY) * 0.3, hemW * 2, (bot - shY) * 0.1); }
  if (st === "shirt" && !side) { g.fillStyle = "#ffffff"; g.fill(poly([[-tw * 0.16, shY - 1], [tw * 0.16, shY - 1], [0, shY + hh * 0.1]])); }
  g.restore();
  if (st === "costume") for (const sg of side ? [1] : [-1, 1]) { const ep = rrect(sg * tw * 0.42 - hw * 0.09, shY - hh * 0.02, hw * 0.18, hh * 0.06, hh * 0.03); part(c, ep, "#f1c94a", { off: 0, lw: c.lw * 0.8 }); }
  if (st === "hoodie") { // hood roll behind the neck (silhouette)
    const hood = new Path2D(); hood.moveTo(-tw * 0.46, shY + hh * 0.03); hood.quadraticCurveTo(0, shY + hh * 0.2, tw * 0.46, shY + hh * 0.03); hood.quadraticCurveTo(tw * 0.35, shY - hh * 0.1, 0, shY - hh * 0.1); hood.quadraticCurveTo(-tw * 0.35, shY - hh * 0.1, -tw * 0.46, shY + hh * 0.03); hood.closePath();
    part(c, side ? moved(hood, -tw * 0.18, 0, 0.8, 1) : hood, acc, { off: 0 });
    if (!side) for (const sg of [-1, 1]) { g.strokeStyle = "#f4efe6"; g.lineWidth = c.lw * 0.9; g.beginPath(); g.moveTo(sg * tw * 0.12, shY + hh * 0.1); g.lineTo(sg * tw * 0.13, shY + hh * 0.26); g.stroke(); dot(g, sg * tw * 0.13, shY + hh * 0.27, c.lw * 0.9, "#f4efe6"); }
  }
  if (!side) { arm(-1, false); arm(1, false); }
  // hair back layer, ears, head, hair front, hat
  const hcol = s.hair?.color ?? "#3a2a24", hs = hair(s), hx = side ? -rx * 0.04 : 0;
  if (hs === "long" || hs === "bob") part(c, rrect(hx - rx * 1.02 - (side ? rx * 0.08 : 0), cy - ry * 0.4, rx * 2.04, ry * (hs === "long" ? 1.7 : 1.22), rx * 0.5), hcol, { off: hw * 0.06 });
  if (!side) for (const sg of [-1, 1]) part(c, ell(sg * rx * 0.96, cy + ry * 0.12, rx * 0.12, ry * 0.15), s.skin, { off: 0, sh: skinShade(s.skin) });
  const head = sePath(hx, cy, rx * (side ? 0.96 : 1), ry, 2.2, -0.04);
  part(c, head, s.skin, { thick: true, off: hw * 0.08, sh: skinShade(s.skin) });
  if (hs !== "bald") part(c, side && hs !== "curly" ? hairSide(hs, hx, cy, rx, ry) : hairFront(hs, hx, cy, rx, ry, side, car ? 0.66 : 0.3), hcol, { off: hw * 0.06 });
  if (side) { const ex = hx - rx * 0.46, ey = cy + ry * 0.22; part(c, ell(ex, ey, rx * 0.11, ry * 0.15), s.skin, { off: 0, sh: skinShade(s.skin) }); g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.7; g.beginPath(); g.arc(ex + rx * 0.02, ey, rx * 0.05, Math.PI * 0.6, Math.PI * 1.4); g.stroke(); }
  if (hs === "bun") part(c, ell(hx, cy - ry * 1.08, rx * 0.3, ry * 0.24), hcol, { off: hw * 0.04 });
  if (s.hat) hat(c, s.hat, hx, cy, rx, ry, side);
  const face: Partial<FaceSpec> = car
    ? { eyes: "dot", eyeSize: 0.1, eyeSpacing: 0.4, eyeY: 0.55, brows: "thick", browScale: 1.45, mouthScale: 1.3, mouthWidth: 0.3, mouthY: 0.76, mouthTier: 9, catchlight: false, blush: !!s.blush }
    : { eyes: "whites", eyeSize: 0.2, eyeSpacing: 0.4, eyeY: 0.56, brows: "thick", browScale: 0.7, mouthTier: 9, mouthWidth: 0.26, mouthY: 0.79, catchlight: true, blush: s.blush ?? true };
  if (side) { const nb = new Path2D(); nb.moveTo(hx + rx * 0.9, cy + ry * 0.0); nb.quadraticCurveTo(hx + rx * 1.06, cy + ry * 0.12, hx + rx * 0.9, cy + ry * 0.2); g.fillStyle = s.skin; g.fill(nb); g.strokeStyle = c.ink; g.lineWidth = c.lw; g.stroke(nb); }
  drawFace(g, { ...face, ...s.face }, p, { x: hx, y: cy, w: hw, h: hh }, { ink: c.ink, lw: c.lw, skin: s.skin, side });
  if (s.glasses) { g.strokeStyle = c.ink; g.lineWidth = c.lw * 1.1; const ey = cy - ry + hh * (face.eyeY ?? 0.5), r = hw * 0.12; for (const x of side ? [hx + hw * 0.2] : [-hw * 0.2, hw * 0.2]) g.stroke(ell(x, ey, r, r * 0.9)); if (!side) { g.beginPath(); g.moveTo(-hw * 0.08, ey); g.lineTo(hw * 0.08, ey); g.stroke(); } }
  if (side) arm(1, false);
}
const hair = (s: ChibiSpec) => s.hair?.style ?? "bald";
/** Profile hair is its own drawing (mass toward the back, short fringe in front), never the front shape squeezed. */
function hairSide(hs: string, cx: number, cy: number, rx: number, ry: number) {
  const p = new Path2D(), nape = hs === "long" || hs === "bob" ? ry * 0.85 : ry * 0.3;
  p.moveTo(cx + rx * 0.62, cy - ry * 0.3);
  if (hs === "spiky") { for (let i = 0; i <= 6; i++) { const a = -Math.PI * (0.25 + (i / 6) * 0.75), r = i % 2 ? 1.28 : 1.04; p.lineTo(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r); } p.lineTo(cx - rx * 1.04, cy + nape); }
  else { p.quadraticCurveTo(cx + rx * 0.8, cy - ry * 1.05, cx - rx * 0.05, cy - ry * 1.13); p.quadraticCurveTo(cx - rx * 1.15, cy - ry * 1.05, cx - rx * 1.06, cy + nape); }
  p.lineTo(cx - rx * 0.6, cy + nape);
  p.quadraticCurveTo(cx - rx * 0.48, cy - ry * 0.08, cx - rx * 0.08, cy - ry * 0.34);
  p.quadraticCurveTo(cx + rx * 0.22, cy - ry * 0.18, cx + rx * 0.4, cy - ry * 0.12);
  p.quadraticCurveTo(cx + rx * 0.45, cy - ry * 0.26, cx + rx * 0.62, cy - ry * 0.3);
  p.closePath();
  return p;
}
function hairFront(hs: string, cx: number, cy: number, rx: number, ry: number, side: boolean, fringe = 0.3) {
  const p = new Path2D(), ex = hs === "long" || hs === "bob" ? ry * 0.45 : ry * 0.1;
  if (hs === "curly") { for (let i = 0; i < 9; i++) { const a = Math.PI * (1.02 + (i / 8) * 0.96); p.ellipse(cx + Math.cos(a) * rx * 0.92, cy + Math.sin(a) * ry * 0.86, rx * 0.24, ry * 0.22, 0, 0, TAU); } return p; }
  p.moveTo(cx + rx * 1.04, cy + ex);
  if (hs === "spiky") { const n = 7; for (let i = 0; i <= n; i++) { const a = -Math.PI * (i / n), r = i % 2 ? 1.3 : 1.04; p.lineTo(cx + Math.cos(a) * rx * r * 1.0, cy + Math.sin(a) * ry * r * 1.02); } }
  else p.bezierCurveTo(cx + rx * 1.12, cy - ry * 1.42, cx - rx * 1.12, cy - ry * 1.42, cx - rx * 1.04, cy + ex);
  p.lineTo(cx - rx * 0.96, cy - ry * 0.1);
  // fringe: locks that dip to points, side-swept (asymmetry = appeal, characters.md 3.10)
  const locks = side ? 3 : 4, y0 = cy - ry * fringe, sw = side ? 0.25 : 0;
  for (let i = 0; i < locks; i++) {
    const xa = cx + rx * (-0.96 + (1.92 * i) / locks + sw), xb = cx + rx * (-0.96 + (1.92 * (i + 1)) / locks + sw), tipX = lerp(xa, xb, 0.72);
    p.quadraticCurveTo(lerp(xa, xb, 0.3), y0 - ry * 0.02, tipX, y0 + ry * (0.2 + 0.06 * (i % 2)));
    p.quadraticCurveTo(lerp(xa, xb, 0.85), y0 - ry * 0.05, xb, y0 - ry * 0.12);
  }
  p.lineTo(cx + rx * 0.96, cy - ry * 0.1); p.closePath();
  return p;
}
function hat(c: Ctx, h: NonNullable<ChibiSpec["hat"]>, cx: number, cy: number, rx: number, ry: number, side: boolean) {
  const g = c.g, top = cy - ry * (h.style === "bicorne" ? 0.9 : 0.72), off = rx * 0.1;
  switch (h.style) {
    case "cap": { part(c, sePath(cx, top + ry * 0.12, rx * 1.02, ry * 0.52, 2.3, 0, 8), h.color, { off }); const br = side ? ell(cx + rx * 0.95, top + ry * 0.38, rx * 0.5, ry * 0.08) : ell(cx, top + ry * 0.42, rx * 0.95, ry * 0.14); part(c, br, shade(h.color, 0.15), { off: 0 }); break; }
    case "beanie": { part(c, sePath(cx, top + ry * 0.15, rx * 1.04, ry * 0.6, 2.2, 0, 9), h.color, { off }); part(c, rrect(cx - rx * 1.06, top + ry * 0.24, rx * 2.12, ry * 0.3, ry * 0.12), h.accent ?? shade(h.color, 0.15), { off: 0 }); part(c, ell(cx, top - ry * 0.48, rx * 0.2, rx * 0.2), h.accent ?? "#f4efe6", { off: 0 }); break; }
    case "top": { part(c, rrect(cx - rx * 0.62, top - ry * 1.15, rx * 1.24, ry * 1.4, rx * 0.06), h.color, { off }); part(c, rrect(cx - rx * 0.62, top - ry * 0.05, rx * 1.24, ry * 0.18, 1), h.accent ?? "#b23a3a", { off: 0 }); part(c, ell(cx, top + ry * 0.24, rx * 1.12, ry * 0.12), h.color, { off: 0 }); break; }
    case "helmet": part(c, sePath(cx, top + ry * 0.25, rx * 1.1, ry * 0.68, 2.2, 0, 12), h.color, { off }); break;
    case "crown": { const p = poly([[cx - rx * 0.7, top + ry * 0.2], [cx - rx * 0.75, top - ry * 0.5], [cx - rx * 0.38, top - ry * 0.12], [cx, top - ry * 0.62], [cx + rx * 0.38, top - ry * 0.12], [cx + rx * 0.75, top - ry * 0.5], [cx + rx * 0.7, top + ry * 0.2]]); part(c, p, h.color, { off: 0 }); break; }
    case "bicorne": { // caricature costume: wide crescent hat + cockade (silhouette identity, 2.24)
      const w = side ? rx * 1.0 : rx * 1.6, p = new Path2D();
      p.moveTo(cx - w, top + ry * 0.3); p.bezierCurveTo(cx - w * 0.75, top - ry * 0.75, cx + w * 0.75, top - ry * 0.75, cx + w, top + ry * 0.3); p.quadraticCurveTo(cx, top + ry * 0.02, cx - w, top + ry * 0.3); p.closePath();
      part(c, p, h.color, { off: rx * 0.06 });
      g.save(); g.clip(p); g.strokeStyle = h.accent ?? "#d8b04a"; g.lineWidth = c.lw * 1.8; g.stroke(moved(p, 0, c.lw * 1.2)); g.restore(); g.strokeStyle = c.ink; g.lineWidth = c.lw; g.stroke(p);
      const kx = side ? cx + rx * 0.25 : cx + w * 0.42, ky = top + ry * 0.0; dot(g, kx, ky, rx * 0.12, "#2f4fa3"); dot(g, kx, ky, rx * 0.08, "#f4efe6"); dot(g, kx, ky, rx * 0.04, "#c8323a");
      break;
    }
  }
}

// ================================================================ 8. BOBBLE (characters.md 2.26 / 5.3 I)
/**
 * Bobble: big round head (~38 % of the height), pill torso, thin rubber-hose limbs with fists and shoes.
 * Built for full-body ACTING in a 3D world (two-bone IK on all four limbs, pose-target library, held props, hat tip),
 * which is what the measured toonworld reference does in every shot: characters sit, limp, clutch, cheer, point.
 * Identity = hair/hat silhouette + one outfit shape + one accent colour; polish = thick-thin ink, cel crescents,
 * the fringe's drop shadow on the forehead, the head's shadow on the collar, a soft key highlight.
 */
export type BobbleHat = { style: "cap" | "top" | "bowler" | "beanie" | "hardhat" | "chef" | "ranger" | "crown" | "boater" | "beret"; color: string; accent?: string };
export type BobbleSpec = KBase & {
  kind: "bobble"; skin: string;
  hair?: { style: "cap" | "side" | "spiky" | "curly" | "long" | "bob" | "bun" | "pony" | "buzz" | "bald"; color: string };
  hat?: BobbleHat;
  top: { color: string; style?: "jacket" | "hoodie" | "shirt" | "suit" | "tee" | "dress" | "overall" | "uniform" | "coat" | "vest" | "apron"; accent?: string; sleeves?: "long" | "short" };
  legs?: string; shoes?: string;
  beard?: string; stache?: string; glasses?: string; shades?: string;
  neck?: { style: "tie" | "bow" | "scarf"; color: string };
  face?: Partial<FaceSpec>; cheeks?: boolean; build?: "slim" | "regular" | "stout";
};
/** Pose targets for bobbles: hand/foot targets in head units relative to the hip centre (x outward or forward, y up).
 *  Landmarks: shoulder ~0.7 up, chin ~0.95, head centre ~1.45, head top ~1.95; resting hand ~[0.5, 0.0]. */
export const BOBBLE_POSES: Record<string, KPose> = {
  idle: {},
  wave: { limbs: { handR: [0.95, 1.55] }, hands: { R: "open" }, expr: "happy" },
  point: { limbs: { handR: [1.2, 0.85] }, hands: { R: "point" }, turn: 0.6, expr: "happy" },
  shrug: { limbs: { handL: [0.8, 0.85], handR: [0.8, 0.85] }, hands: { L: "open", R: "open" }, expr: "smug" },
  cheer: { limbs: { handL: [0.7, 1.9], handR: [0.7, 1.9] }, hands: { L: "open", R: "open" }, expr: "laugh", bob: -0.06 },
  think: { limbs: { handR: [0.18, 0.98], handL: [0.3, 0.3] }, expr: "think" },
  facepalm: { limbs: { handR: [0.05, 1.5] }, expr: "sad", lean: 3 },
  neck: { limbs: { handR: [0.3, 0.86] }, expr: "cry", lean: -5 },
  hips: { limbs: { handL: [0.36, 0.22], handR: [0.36, 0.22] }, expr: "determined" },
  phone: { limbs: { handR: [0.46, 1.28] }, hold: { item: "phone" }, turn: -0.35, cue: "D", expr: "neutral" },
  shock: { limbs: { handL: [0.75, 1.25], handR: [0.75, 1.25] }, hands: { L: "open", R: "open" }, expr: "shock", squash: 1.06 },
  carry: { limbs: { handL: [0.3, 0.42], handR: [0.3, 0.42] }, expr: "determined" },
  sit: { view: "side", targets: "side", limbs: { footL: [0.44, -0.47], footR: [0.52, -0.45], handR: [0.62, 0.42], handL: [0.58, 0.38] } }, // thigh forward, shin down: put the card on a seat
  run: { view: "side", targets: "side", limbs: { handR: [0.6, 0.55], handL: [-0.5, 0.35], footL: [0.62, -0.5], footR: [-0.6, -0.55] }, lean: 12, expr: "determined" },
  limp: { view: "side", targets: "side", limbs: { handR: [0.25, 0.86], footL: [0.32, -0.6], footR: [-0.2, -0.8] }, lean: -8, expr: "cry" },
};
type BobbleLimb = { r: V2; j: V2; e: V2; far: boolean; sg: number; sm?: V2 };
type BobbleRig = { d: number; r: number; cx: number; cy: number; tw: number; yT: number; yB: number; hem: number; hip: V2; sh: V2; arms: BobbleLimb[]; legs: BobbleLimb[]; hatAt: V2 | null };
const BOBBLE_HATX: Record<BobbleHat["style"], number> = { top: 0.5, chef: 0.52, crown: 0.24, ranger: 0.2, bowler: 0.22, boater: 0.14, hardhat: 0.12, cap: 0.08, beanie: 0.16, beret: 0.1 };
/** Hats and tall hair shrink a bobble to fit its card. Multiply the card height by this so every body has the same
 *  real size (a man with a top hat is taller than the same man bare-headed): `new CharacterCard(spec, 1.7 * bobbleScale(spec), ...)`. */
export function bobbleScale(s: BobbleSpec) {
  const hs = s.hair?.style, hx = s.hat ? BOBBLE_HATX[s.hat.style] : hs === "spiky" ? 0.14 : hs === "bun" ? 0.2 : hs === "curly" ? 0.1 : 0.04, heads = s.heightHeads ?? 3.4;
  return (heads + hx) / (heads + 0.04);
}
function bobbleRig(c: Ctx, s: BobbleSpec, p: KPose): BobbleRig {
  const hs = s.hair?.style, hx = s.hat ? BOBBLE_HATX[s.hat.style] : hs === "spiky" ? 0.14 : hs === "bun" ? 0.2 : hs === "curly" ? 0.1 : 0.04;
  // default = the tall, slim figure (3.4 heads: long jacket, straight legs); heightHeads 2.6 gives the short chibi-like build
  const heads = s.heightHeads ?? 3.4, tk = clamp((heads - 2.6) / 0.8, 0, 1.3), TL = 0.92 + 0.36 * tk;
  const d = c.u / (heads + hx), r = d / 2, side = c.side, three = !!c.three;
  const k = s.build === "stout" ? 1.24 : s.build === "slim" ? 0.86 : 1;
  const cx = side ? d * 0.03 : three ? d * 0.045 : 0, cy = -c.u + hx * d + r;
  const tw = d * 0.66 * k * (side ? 0.8 : three ? 0.9 : 1), yT = cy + r * 0.78, yB = yT + d * TL;
  const st = s.top.style ?? "tee", hem = st === "dress" ? yB + d * 0.2 : st === "coat" ? yB + d * 0.24 : yB;
  const hip: V2 = [0, yB - d * 0.1], sh: V2 = [0, yT + d * 0.22];
  const legLen = -hip[1] - d * 0.06, l1 = legLen * 0.52, l2 = legLen * 0.5, a1 = d * (0.44 + 0.13 * tk);
  const ks = (0.29 + TL) / 1.21; // pose targets are authored on the 2.6-head build and scale with the torso
  // three-quarter view (facing +x, the R side is the far / facing side): a front-view target turns with the body
  // (x' = outward * 0.8, hands sit 0.1 further forward where the chest and the face went); profile targets keep x = forward.
  const prof = p.targets === "side";
  const T = (t: V2 | undefined, sg: number, fwd = 0): V2 | null => (t ? [hip[0] + (three ? (prof ? t[0] * 0.8 : sg * t[0] * 0.8 + fwd) : (side ? 1 : sg) * t[0]) * d * ks, hip[1] - t[1] * d * ks] : null);
  const lift = s.hat ? p.hatLift ?? 0 : 0;
  const arms = ([-1, 1] as const).map((sg): BobbleLimb => {
    // three-quarter: the near (L) shoulder sits forward on the body, the far (R) shoulder is tucked behind it; arm angles swing forward / back as in the profile
    const root: V2 = side ? [sg * d * 0.03, sh[1]] : three ? [sg < 0 ? -tw * 0.4 : tw * 0.37, sh[1]] : [sg * tw * 0.42, sh[1]];
    const ang = sg < 0 ? p.armL ?? 12 : p.armR ?? 12, el = sg < 0 ? p.elbowL ?? 6 : p.elbowR ?? 6;
    const a = rad(side ? ang - 6 + (sg < 0 ? -8 : 10) : three ? (ang - 12) * 0.8 + (sg < 0 ? -3 : 9) : ang), dir: V2 = side || three ? [Math.sin(a), Math.cos(a)] : [sg * Math.sin(a), Math.cos(a)];
    const reach = 2 * a1 * (0.97 - 0.3 * clamp(el / 90));
    // hat tip: with no explicit target the right hand goes for the brim (the hat then follows the hand, see hatAt)
    const tip: V2 | null = lift > 0.02 && sg > 0 && !p.limbs?.handR ? [cx + r * (side ? 1.35 : three ? 1.35 : 0.92), cy - r * (side ? 0.2 : three ? 0.5 : 0.62) - lift * d] : null;
    const aim = T(sg < 0 ? p.limbs?.handL : p.limbs?.handR, sg, 0.1) ?? tip;
    const tgt = aim ?? ([root[0] + dir[0] * reach, root[1] + dir[1] * reach] as V2);
    const pole: V2 = side || (three && (!aim || prof)) ? [-1, 0.5] : [sg, 0.7];
    const { joint, end } = ik2(root, tgt, a1, a1, pole);
    // smear frame: where the hand came from, pulled onto the arm's reach so the smear stays attached at the shoulder
    const sm = sg < 0 ? p.smear?.handL : p.smear?.handR, smFrom = sm ? ik2(root, T(sm.from, sg, 0.1)!, a1, a1, pole).end : undefined;
    return { r: root, j: joint, e: end, far: side ? sg < 0 : three && sg > 0, sg, sm: smFrom };
  });
  const legs = ([-1, 1] as const).map((sg): BobbleLimb => {
    const up = three && sg > 0 ? d * 0.025 : 0; // three-quarter: the far foot stands a little higher on the ground plane
    const root: V2 = side ? [sg * d * 0.04, hip[1]] : three ? [sg < 0 ? -tw * 0.14 : tw * 0.1, hip[1] - up] : [sg * tw * 0.21, hip[1]];
    const still = p.legL === undefined && p.legR === undefined; // profile at rest: a small scissor so two legs read
    const a = rad((sg < 0 ? p.legL ?? 0 : p.legR ?? 0) + (side && still ? sg * 5 : 0));
    const tgt = T(sg < 0 ? p.limbs?.footL : p.limbs?.footR, sg) ?? ((side
      ? [root[0] + Math.sin(a) * legLen, root[1] + Math.cos(a) * legLen * (1 - 0.1 * Math.max(0, Math.sin(a)))]
      : three ? [root[0] + Math.sin(a) * legLen * 0.8, root[1] + Math.cos(a) * legLen * (1 - 0.1 * Math.max(0, Math.sin(a)))]
      : [root[0] + sg * d * 0.03 + Math.sin(a) * legLen * 0.05, root[1] + legLen * (1 - 0.2 * Math.max(0, sg * Math.sin(a) * 2))]) as V2); // front view: feet lift, they do not swing sideways
    const { joint, end } = ik2(root, tgt, l1, l2, side || three ? [1, -0.1] : [sg, -0.2]);
    return { r: root, j: joint, e: end, far: side ? sg < 0 : three && sg > 0, sg };
  });
  // the lifted hat sits IN the right hand: brim edge on the fist, wherever the arm could actually reach
  const hatAt: V2 | null = lift > 0.02 ? [arms[1].e[0] - r * (side ? 0.95 : three ? 1.0 : 0.86), arms[1].e[1] + r * 0.62] : null;
  return { d, r, cx, cy, tw, yT, yB, hem, hip, sh, arms, legs, hatAt };
}
/** Union of shapes with ONE outer ink outline (stroke everything thick, then fill everything). */
function inkUnion(c: Ctx, paths: Path2D[], fill: string, lw = c.lw) {
  const g = c.g;
  g.strokeStyle = c.ink; g.lineWidth = lw * 2; g.lineJoin = "round";
  for (const q of paths) g.stroke(q);
  g.fillStyle = fill;
  for (const q of paths) g.fill(q);
}
/** Hair for a round head: `front` sits on the head, `back` behind it (long / bob / pony), `extra` on top (bun). */
function bobbleHair(st: NonNullable<BobbleSpec["hair"]>["style"], cx: number, cy: number, r: number, side: boolean): { front: Path2D[]; back: Path2D[] } {
  const R = r * 1.045, front: Path2D[] = [], back: Path2D[] = [], P = Math.PI;
  if (st === "bald") return { front, back };
  const q = new Path2D();
  if (side) { // profile facing +x: mass over the top and down the back, open face
    const nape = st === "long" || st === "bob" || st === "pony" ? 0.8 : st === "buzz" ? 0.9 : 0.84, fr = st === "buzz" ? -0.36 : st === "side" ? -0.2 : -0.27;
    if (st === "spiky") { for (let i = 0; i <= 8; i++) { const a = P * (fr - (i / 8) * (2 + fr - nape)), rr = i % 2 ? R * 1.3 : R; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) q.lineTo(x, y); else q.moveTo(x, y); } }
    else q.arc(cx, cy, R, P * fr, P * nape, true);
    q.quadraticCurveTo(cx - r * 0.42, cy + r * 0.22, cx - r * 0.12, cy - r * (st === "buzz" ? 0.5 : 0.3));
    if (st === "cap") { q.quadraticCurveTo(cx + r * 0.15, cy - r * 0.12, cx + r * 0.35, cy - r * 0.34); q.quadraticCurveTo(cx + r * 0.5, cy - r * 0.2, cx + r * 0.66, cy - r * 0.5); }
    else if (st === "side") q.quadraticCurveTo(cx + r * 0.5, cy - r * 0.2, cx + r * 0.84, cy - r * 0.42);
    else q.quadraticCurveTo(cx + r * 0.35, cy - r * 0.42, cx + R * Math.cos(P * fr), cy + R * Math.sin(P * fr));
    q.closePath(); front.push(q);
    if (st === "curly") for (let i = 0; i < 7; i++) { const a = P * (fr - (i / 6) * (2 + fr - nape)); front.push(ell(cx + Math.cos(a) * R * 0.98, cy + Math.sin(a) * R * 0.98, r * 0.27, r * 0.25)); }
    if (st === "long") back.push(rrect(cx - r * 1.12, cy - r * 0.3, r * 1.1, r * 2.0, r * 0.45));
    if (st === "bob") back.push(rrect(cx - r * 1.1, cy - r * 0.3, r * 1.0, r * 1.45, r * 0.45));
    if (st === "pony") { const t = new Path2D(); t.moveTo(cx - r * 0.85, cy - r * 0.45); t.quadraticCurveTo(cx - r * 1.9, cy - r * 0.35, cx - r * 1.55, cy + r * 0.85); t.quadraticCurveTo(cx - r * 1.25, cy + r * 0.2, cx - r * 0.8, cy + r * 0.05); t.closePath(); back.push(t); }
    if (st === "bun") front.push(ell(cx - r * 0.35, cy - r * 1.12, r * 0.36, r * 0.3));
    return { front, back };
  }
  const low = st === "long" || st === "bob" ? 0.1 : st === "buzz" ? -0.08 : 0.0, a0 = P * low;
  const xr = cx + R * Math.cos(a0), yr = cy + R * Math.sin(a0), xl = cx - R * Math.cos(a0);
  if (st === "spiky") { for (let i = 0; i <= 8; i++) { const a = a0 - (i / 8) * (P + 2 * a0), rr = i % 2 ? R * 1.32 : R; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) q.lineTo(x, y); else q.moveTo(x, y); } }
  else { q.moveTo(xr, yr); q.arc(cx, cy, R, a0, P - a0, true); }
  // fringe, left -> right
  if (st === "cap" || st === "spiky") { const n = st === "spiky" ? 4 : 5, y0 = cy - r * (st === "spiky" ? 0.34 : 0.26), amp = r * (st === "spiky" ? 0.26 : 0.13);
    q.lineTo(xl + r * 0.05, y0); for (let i = 0; i < n; i++) { const xa = lerp(xl + r * 0.05, xr - r * 0.05, i / n), xb = lerp(xl + r * 0.05, xr - r * 0.05, (i + 1) / n); q.quadraticCurveTo(lerp(xa, xb, 0.35), y0 + amp * 0.2, lerp(xa, xb, 0.7), y0 + amp * (i % 2 ? 0.7 : 1)); q.quadraticCurveTo(lerp(xa, xb, 0.9), y0 + amp * 0.2, xb, y0); } }
  else if (st === "side" || st === "pony") { q.lineTo(xl + r * 0.04, cy - r * 0.02); q.quadraticCurveTo(cx - r * 0.2, cy - r * 0.1, cx + r * 0.3, cy - r * 0.52); q.quadraticCurveTo(cx + r * 0.55, cy - r * 0.72, cx + r * 0.62, cy - r * 0.84); q.quadraticCurveTo(cx + r * 0.9, cy - r * 0.5, xr - r * 0.03, cy - r * 0.12); }
  else if (st === "long") { q.lineTo(xl + r * 0.1, cy + r * 0.2); q.quadraticCurveTo(cx - r * 0.75, cy - r * 0.55, cx - r * 0.05, cy - r * 0.86); q.quadraticCurveTo(cx + r * 0.75, cy - r * 0.55, xr - r * 0.1, cy + r * 0.2); }
  else if (st === "bob") { q.lineTo(xl + r * 0.12, cy + r * 0.22); q.lineTo(xl + r * 0.2, cy - r * 0.3); q.quadraticCurveTo(cx, cy - r * 0.2, xr - r * 0.2, cy - r * 0.3); q.lineTo(xr - r * 0.12, cy + r * 0.22); }
  else if (st === "buzz") q.quadraticCurveTo(cx, cy - r * 0.62, xr, yr);
  else q.quadraticCurveTo(cx, cy - r * 0.42, xr, yr); // bun / curly: soft hairline
  q.closePath(); front.push(q);
  if (st === "curly") for (let i = 0; i < 9; i++) { const a = -P * (0.02 + (i / 8) * 0.96); front.push(ell(cx + Math.cos(a) * R * 0.98, cy + Math.sin(a) * R * 0.98, r * 0.28, r * 0.26)); }
  if (st === "bun") front.push(ell(cx, cy - r * 1.2, r * 0.38, r * 0.32));
  if (st === "long") back.push(rrect(cx - r * 1.14, cy - r * 0.4, r * 2.28, r * 2.1, r * 0.55));
  if (st === "bob") back.push(rrect(cx - r * 1.12, cy - r * 0.4, r * 2.24, r * 1.5, r * 0.5));
  if (st === "pony") { const t = new Path2D(); t.moveTo(cx + r * 0.7, cy - r * 0.75); t.quadraticCurveTo(cx + r * 1.75, cy - r * 0.9, cx + r * 1.5, cy + r * 0.55); t.quadraticCurveTo(cx + r * 1.2, cy - r * 0.05, cx + r * 0.85, cy - r * 0.2); t.closePath(); back.push(t); }
  return { front, back };
}
/** Three-quarter hair (facing +x): the mass wraps the top and the back of the skull (-x side), the hairline and the fringe
 *  slide toward the face side, the near ear stays free (long / bob curtains cover it). Same silhouettes as the front view. */
function bobbleHair3(st: NonNullable<BobbleSpec["hair"]>["style"], cx: number, cy: number, r: number): { front: Path2D[]; back: Path2D[] } {
  const R = r * 1.045, front: Path2D[] = [], back: Path2D[] = [], P = Math.PI;
  if (st === "bald") return { front, back };
  const q = new Path2D(), X = (k: number) => cx + r * k, Y = (k: number) => cy + r * k;
  const curtain = st === "long" || st === "bob";
  const aF = P * (st === "long" ? 0.1 : st === "bob" ? 0.03 : st === "buzz" ? -0.2 : -0.13), aB = P * (st === "long" ? 0.76 : st === "bob" ? 0.9 : st === "buzz" ? 0.93 : 0.87), sweep = 2 * P + aF - aB; // face-side end, nape end
  if (st === "spiky") { for (let i = 0; i <= 8; i++) { const a = aF - (i / 8) * sweep, rr = i % 2 ? R * 1.32 : R; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) q.lineTo(x, y); else q.moveTo(x, y); } }
  else { q.moveTo(cx + R * Math.cos(aF), cy + R * Math.sin(aF)); q.arc(cx, cy, R, aF, aB, true); }
  // hairline, nape -> past the near ear -> temple -> fringe -> face-side end
  const burn = (tx: number, ty: number) => q.quadraticCurveTo(X(-0.8), Y(0.12), X(tx), Y(ty));
  if (st === "cap" || st === "spiky") { const n = st === "spiky" ? 3 : 4, y0 = cy - r * (st === "spiky" ? 0.34 : 0.26), amp = r * (st === "spiky" ? 0.26 : 0.13), x0 = X(-0.5), x1 = X(0.88);
    burn(-0.5, st === "spiky" ? -0.34 : -0.26);
    for (let i = 0; i < n; i++) { const k0 = Math.pow(i / n, 0.9), k1 = Math.pow((i + 1) / n, 0.9), xa = lerp(x0, x1, k0), xb = lerp(x0, x1, k1); q.quadraticCurveTo(lerp(xa, xb, 0.35), y0 + amp * 0.2, lerp(xa, xb, 0.7), y0 + amp * (i % 2 ? 0.7 : 1)); q.quadraticCurveTo(lerp(xa, xb, 0.9), y0 + amp * 0.2, xb, y0); } }
  else if (st === "side" || st === "pony") { burn(-0.55, -0.06); q.quadraticCurveTo(X(-0.1), Y(-0.14), X(0.48), Y(-0.56)); q.quadraticCurveTo(X(0.68), Y(-0.7), X(0.74), Y(-0.76)); q.quadraticCurveTo(X(0.95), Y(-0.55), X(0.95), Y(-0.36)); }
  else if (st === "long") { q.lineTo(X(-0.44), Y(0.66)); q.quadraticCurveTo(X(-0.52), Y(-0.42), X(0.34), Y(-0.86)); q.quadraticCurveTo(X(0.9), Y(-0.5), X(0.9), Y(0.34)); }
  else if (st === "bob") { q.lineTo(X(-0.42), Y(0.3)); q.lineTo(X(-0.36), Y(-0.3)); q.quadraticCurveTo(X(0.28), Y(-0.2), X(0.84), Y(-0.3)); q.lineTo(X(0.93), Y(0.16)); }
  else if (st === "buzz") { burn(-0.6, -0.3); q.quadraticCurveTo(X(0.2), Y(-0.7), cx + R * Math.cos(aF), cy + R * Math.sin(aF)); }
  else { burn(-0.52, -0.24); q.quadraticCurveTo(X(0.26), Y(-0.52), cx + R * Math.cos(aF), cy + R * Math.sin(aF)); } // bun / curly: soft hairline
  q.closePath(); front.push(q);
  if (st === "curly") for (let i = 0; i < 8; i++) { const a = aF + P * 0.03 - (i / 7) * (sweep + P * 0.04); front.push(ell(cx + Math.cos(a) * R * 0.98, cy + Math.sin(a) * R * 0.98, r * 0.28, r * 0.26)); }
  if (st === "bun") front.push(ell(X(-0.24), Y(-1.17), r * 0.38, r * 0.32));
  if (st === "long") back.push(rrect(X(-1.14), Y(-0.4), r * 1.6, r * 2.1, r * 0.55));
  if (st === "bob") back.push(rrect(X(-1.12), Y(-0.4), r * 1.5, r * 1.5, r * 0.5));
  if (st === "pony") { const t = new Path2D(); t.moveTo(X(-0.78), Y(-0.55)); t.quadraticCurveTo(X(-1.85), Y(-0.45), X(-1.5), Y(0.8)); t.quadraticCurveTo(X(-1.2), Y(0.15), X(-0.75), Y(0.0)); t.closePath(); back.push(t); }
  return { front, back };
}
/** Three-quarter skull (facing +x): the round head with a soft cheek on the face side - a silhouette cue, not a new shape. */
function bobbleHead3(cx: number, cy: number, r: number) {
  const q = new Path2D(), N = 96;
  for (let i = 0; i <= N; i++) { const a = (i / N) * TAU, dc = Math.atan2(Math.sin(a - 0.52), Math.cos(a - 0.52)), k = r * (1 + 0.05 * Math.exp(-(dc * dc) / 0.11));
    if (i) q.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k); else q.moveTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k); }
  q.closePath(); return q;
}
function bobbleHat(c: Ctx, h: BobbleHat, cx: number, cy: number, r: number, side: boolean, tilt: number, three = false) {
  const g = c.g, d = r * 2, band = h.accent ?? shade(h.color, 0.5), off = d * 0.05;
  const dome = (rx: number, ry: number, y = 0) => { const q = new Path2D(); q.ellipse(0, y, rx, ry, 0, Math.PI, 0); q.closePath(); return q; };
  g.save(); g.translate(cx, cy - r * 0.6); g.rotate(rad(tilt + (side ? -3 : three ? -4 : -5)));
  switch (h.style) {
    case "cap": part(c, dome(r * 1.04, r * 0.72, r * 0.06), h.color, { off, thick: true }); part(c, side ? ell(r * 1.1, r * 0.05, r * 0.62, r * 0.11) : three ? ell(r * 0.52, r * 0.1, r * 0.84, r * 0.15) : ell(0, r * 0.1, r * 1.0, r * 0.16), band, { off: 0 }); dot(g, three ? r * 0.1 : 0, -r * 0.66, r * 0.07, band); break;
    case "beanie": part(c, dome(r * 1.06, r * 0.8, r * 0.16), h.color, { off }); part(c, rrect(-r * 1.08, -r * 0.04, r * 2.16, r * 0.32, r * 0.14), band, { off: 0 }); part(c, ell(0, -r * 0.72, r * 0.2, r * 0.2), h.accent ?? "#f4efe6", { off: 0 }); break;
    case "top": part(c, poly([[-r * 0.66, 0], [r * 0.66, 0], [r * 0.74, -d * 0.86], [-r * 0.74, -d * 0.86]]), h.color, { off, thick: true }); part(c, rrect(-r * 0.67, -d * 0.2, r * 1.34, d * 0.14, 0), h.accent ?? "#b23a3a", { off: 0 }); part(c, ell(0, 0, r * 1.22, r * 0.17), h.color, { off: d * 0.02 }); break;
    case "bowler": part(c, dome(r * 0.86, r * 0.92), h.color, { off, thick: true }); part(c, rrect(-r * 0.85, -r * 0.24, r * 1.7, r * 0.2, 0), band, { off: 0 }); part(c, ell(side ? r * 0.08 : three ? r * 0.05 : 0, 0, r * 1.2, r * 0.16), h.color, { off: d * 0.02 }); break;
    case "hardhat": part(c, dome(r * 1.02, r * 0.8, r * 0.04), h.color, { off, thick: true }); part(c, three ? rrect(r * 0.14, -r * 0.73, r * 0.24, r * 0.75, r * 0.1) : rrect(-r * 0.12, -r * 0.8, r * 0.24, r * 0.82, r * 0.1), tint(h.color, 0.25), { off: 0 }); part(c, side ? ell(r * 0.7, r * 0.06, r * 0.7, r * 0.12) : three ? ell(r * 0.28, r * 0.08, r * 1.1, r * 0.15) : ell(0, r * 0.08, r * 1.24, r * 0.15), h.color, { off: 0 }); break;
    case "chef": { part(c, rrect(-r * 0.72, -r * 0.5, r * 1.44, r * 0.6, r * 0.06), h.color, { off }); inkUnion(c, [ell(-r * 0.5, -r * 0.82, r * 0.46, r * 0.42), ell(r * 0.5, -r * 0.82, r * 0.46, r * 0.42), ell(0, -r * 1.0, r * 0.56, r * 0.5)], h.color); g.strokeStyle = shade(h.color, 0.22); g.lineWidth = c.lw * 0.8; for (const x of [-0.3, 0, 0.3]) { g.beginPath(); g.moveTo(x * r, -r * 0.42); g.lineTo(x * r, -r * 0.08); g.stroke(); } break; }
    case "ranger": part(c, ell(0, 0, r * 1.62, r * 0.2), h.color, { off: d * 0.03 }); { const q = new Path2D(); q.moveTo(-r * 0.7, -r * 0.02); q.quadraticCurveTo(-r * 0.62, -r * 0.9, -r * 0.2, -r * 0.74); q.quadraticCurveTo(0, -r * 0.6, r * 0.2, -r * 0.74); q.quadraticCurveTo(r * 0.62, -r * 0.9, r * 0.7, -r * 0.02); q.closePath(); part(c, q, h.color, { off, thick: true }); } part(c, rrect(-r * 0.7, -r * 0.2, r * 1.4, r * 0.16, 0), band, { off: 0 }); break;
    case "crown": part(c, poly([[-r * 0.72, r * 0.08], [-r * 0.8, -r * 0.6], [-r * 0.4, -r * 0.22], [0, -r * 0.74], [r * 0.4, -r * 0.22], [r * 0.8, -r * 0.6], [r * 0.72, r * 0.08]]), h.color, { off: d * 0.03, thick: true }); for (const x of three ? [-0.3, 0.14, 0.52] : [-0.4, 0, 0.4]) dot(g, x * r, -r * 0.08, r * 0.07, h.accent ?? "#d8344e"); break;
    case "boater": part(c, ell(0, 0, r * 1.42, r * 0.17), h.color, { off: d * 0.02 }); part(c, rrect(-r * 0.76, -r * 0.5, r * 1.52, r * 0.5, r * 0.06), h.color, { off }); part(c, rrect(-r * 0.76, -r * 0.24, r * 1.52, r * 0.16, 0), h.accent ?? "#c0392b", { off: 0 }); break;
    case "beret": part(c, ell(r * 0.12, -r * 0.2, r * 1.08, r * 0.46, -0.12), h.color, { off, thick: true }); part(c, rrect(-r * 0.03, -r * 0.82, r * 0.08, r * 0.22, r * 0.03), h.color, { off: 0 }); break;
  }
  g.restore();
}
function drawBobble(c: Ctx, s: BobbleSpec, p: KPose) {
  const g = c.g, side = c.side, three = !!c.three, R = bobbleRig(c, s, p), { d, r, cx, cy, tw, yT, yB, hem } = R;
  const sv = p.settle ?? 0; // secondary overshoot in degrees (poseTrack): hair, hat, prop and hem; 0 = a plain pose
  c.lw = Math.max(1.6, d * (s.lineW ?? 0.042));
  const st = s.top.style ?? "tee", topC = s.top.color, acc = s.top.accent, legC = s.legs ?? "#33415f", shoeC = s.shoes ?? "#2b2230";
  const short = s.top.sleeves === "short" || (!s.top.sleeves && (st === "tee" || st === "dress" || st === "overall" || st === "apron"));
  const armW = d * 0.105, legW = d * 0.125, skinSh = skinShade(s.skin), hs = s.hair?.style ?? "bald", hcol = s.hair?.color ?? "#3a2a24";
  const hst = s.hat && (hs === "bun" || hs === "spiky" || hs === "curly") ? "cap" : hs; // tall hair would poke through a hat
  const hair = three ? bobbleHair3(hst, cx, cy, r) : bobbleHair(hst, cx, cy, r, side);
  const drawLeg = (L: BobbleLimb) => {
    const col = L.far ? shade(legC, 0.2) : legC, sc = L.far ? shade(shoeC, 0.2) : shoeC;
    limb(c, [L.r, L.j, L.e], legW, st === "dress" && legC === s.skin ? (L.far ? skinSh : s.skin) : col, { curve: true });
    const fx = side ? d * 0.11 : three ? d * 0.085 : L.sg * d * 0.06, shoe = ell(L.e[0] + fx, L.e[1] - d * 0.035, d * (side ? 0.17 : three ? 0.155 : 0.13), d * 0.085);
    part(c, shoe, sc, { off: d * 0.02 });
    g.save(); g.clip(shoe); g.fillStyle = "rgba(255,255,255,0.75)"; g.fillRect(L.e[0] + fx - d * 0.3, L.e[1] + d * 0.012, d * 0.6, d * 0.05); g.restore(); g.strokeStyle = c.ink; g.lineWidth = c.lw; g.stroke(shoe);
  };
  // smear frame (classic animation smear, not a blur): the hand stretched back along its arc around the shoulder into
  // one tapered, inked shape (about three hands long), with a faint dry-brush tail further back. The arm stays attached and sharp.
  const smearHand = (A: BobbleLimb, col: string) => {
    const F = A.sm!, a0 = Math.atan2(F[1] - A.r[1], F[0] - A.r[0]), a1 = Math.atan2(A.e[1] - A.r[1], A.e[0] - A.r[0]), da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
    const r0 = Math.hypot(F[0] - A.r[0], F[1] - A.r[1]), r1 = Math.hypot(A.e[0] - A.r[0], A.e[1] - A.r[1]), len = Math.hypot(A.e[0] - F[0], A.e[1] - F[1]);
    if (len < d * 0.3) return;
    const at = (k: number): V2 => { const a = a0 + da * k, rr = lerp(r0, r1, k) * (1 + 0.04 * Math.sin(Math.PI * k) * Math.min(1, Math.abs(da))); return [A.r[0] + Math.cos(a) * rr, A.r[1] + Math.sin(a) * rr]; };
    const strip = (ka: number, kb: number, wa: number, wb: number, pw: number) => { const lf: V2[] = [], rt: V2[] = [], N = 12;
      for (let i = 0; i <= N; i++) { const u = i / N, k = lerp(ka, kb, u), q = at(k), q2 = at(Math.min(1, k + 0.02)), q1 = at(k - 0.02), tx = q2[0] - q1[0], ty = q2[1] - q1[1], tl = Math.hypot(tx, ty) || 1, w = d * lerp(wa, wb, Math.pow(u, pw));
        lf.push([q[0] - (ty / tl) * w, q[1] + (tx / tl) * w]); rt.push([q[0] + (ty / tl) * w, q[1] - (tx / tl) * w]); }
      return poly([...lf, ...rt.reverse()]); };
    const k0 = Math.max(0.2, 1 - (d * 0.52) / len), k1 = Math.max(0.05, k0 - (d * 0.4) / len);
    g.save(); g.lineJoin = "round";
    g.globalAlpha = 0.3; g.fillStyle = c.ink; g.fill(strip(k1, k0 + 0.02, 0.003, 0.024, 1)); // dry-brush tail
    g.globalAlpha = 1; const sp = strip(k0, 1, 0.026, 0.088, 0.8); g.strokeStyle = c.ink; g.lineWidth = c.lw * 2; g.stroke(sp); g.fillStyle = col; g.fill(sp);
    g.restore();
  };
  const drawArm = (A: BobbleLimb, hold0?: StickHold) => {
    const col = short ? s.skin : topC, cc = A.far ? (short ? skinSh : shade(col, three ? 0.1 : 0.18)) : col;
    const hold = hold0 && sv ? { ...hold0, angle: (hold0.angle ?? 0) + sv * 1.5 } : hold0; // a held prop lags and overshoots
    if (hold && A.far) stickProp(c, { ...hold, as: "bobble" }, A, d, armW);
    limb(c, [A.r, A.j, A.e], armW, cc, { curve: true });
    if (short) limb(c, [A.r, [lerp(A.r[0], A.j[0], 0.55), lerp(A.r[1], A.j[1], 0.55)]], armW * 1.5, A.far ? shade(topC, 0.18) : topC);
    else { const k = 0.8, q: V2 = [lerp(A.j[0], A.e[0], k), lerp(A.j[1], A.e[1], k)]; limb(c, [q, A.e], armW * 1.12, st === "suit" || st === "coat" ? "#f4efe6" : shade(topC, 0.16)); } // cuff
    if (hold && !A.far) stickProp(c, { ...hold, as: "bobble" }, A, d, armW);
    const hsh = (A.sg < 0 ? p.hands?.L : p.hands?.R) ?? "fist", hcol2 = A.far ? skinSh : s.skin;
    const fa = Math.atan2(A.e[1] - A.j[1], A.e[0] - A.j[0]), fx2 = Math.cos(fa), fy2 = Math.sin(fa);
    if (A.sm) smearHand(A, hcol2);
    if (hsh === "point") limb(c, [[A.e[0] + fx2 * d * 0.04, A.e[1] + fy2 * d * 0.04], [A.e[0] + fx2 * d * 0.27, A.e[1] + fy2 * d * 0.27]], d * 0.07, hcol2);
    if (hsh === "open") for (const k of [-0.75, -0.25, 0.25, 0.75]) { const a2 = fa + k * 0.62; limb(c, [[A.e[0] + Math.cos(a2) * d * 0.05, A.e[1] + Math.sin(a2) * d * 0.05], [A.e[0] + Math.cos(a2) * d * (0.185 - Math.abs(k) * 0.04), A.e[1] + Math.sin(a2) * d * (0.185 - Math.abs(k) * 0.04)]], d * 0.05, hcol2); }
    part(c, ell(A.e[0], A.e[1], d * 0.085, d * 0.085), hcol2, { off: d * 0.015, sh: skinSh });
  };
  const holdArm = p.hold ? (p.hold.hand === "L" ? 0 : 1) : -1;
  const hold2Arm = p.hold2 ? (p.hold2.hand === "L" ? 0 : 1) : -1;
  const holdOf = (arm: number) => (holdArm === arm ? p.hold : hold2Arm === arm ? p.hold2 : undefined);
  // head tilt around the neck: the cheapest big acting cue (curious, sad, smug); expressions bring a small default
  const TILT: Partial<Record<KExpr, number>> = { sad: 5, cry: 6, think: -7, smug: -4, laugh: -5, embarrassed: 5, scheming: 4, whistle: -4, disgust: -3, nervous: 2 };
  const tiltDeg = p.headTilt ?? TILT[p.expr ?? "neutral"] ?? 0, neckY = cy + r * 0.86;
  const headXf = () => { g.translate(cx, neckY); g.rotate(rad(tiltDeg)); g.translate(-cx, -neckY); };
  // ---- back hair, far limbs
  if (hair.back.length) { g.save(); headXf(); if (sv) { g.translate(cx, cy - r * 0.3); g.rotate(rad(sv * 0.9)); g.translate(-cx, -(cy - r * 0.3)); } inkUnion(c, hair.back, shade(hcol, 0.12)); g.restore(); }
  // three-quarter: the far (R) arm hangs behind the body; it comes in front only when its hand lands on the head or the chest
  const farE = R.arms[1].e, farFront = three && (!!R.hatAt || Math.hypot(farE[0] - cx, farE[1] - cy) < r * 1.2 || (Math.abs(farE[0]) < tw * 0.42 && farE[1] > yT && farE[1] < hem));
  if (side) { drawLeg(R.legs[0]); drawArm(R.arms[0], holdOf(0)); }
  else if (three) { if (!farFront) drawArm(R.arms[1], holdOf(1)); drawLeg(R.legs[1]); }
  // ---- legs under the torso
  if (side) drawLeg(R.legs[1]); else if (three) drawLeg(R.legs[0]); else { drawLeg(R.legs[0]); drawLeg(R.legs[1]); }
  // ---- torso
  const tp = new Path2D(), hw = tw / 2, flare = st === "dress" ? hw * 1.5 : st === "coat" ? hw * 1.12 : hw, rr = hw * 0.78;
  tp.moveTo(-hw + rr, yT); tp.lineTo(hw - rr, yT); tp.quadraticCurveTo(hw, yT, hw, yT + rr);
  if (hem > yB && sv) { const hx = -sv * d * 0.014; tp.lineTo(flare + hx, hem - d * 0.03); tp.quadraticCurveTo(flare + hx, hem, flare - d * 0.04 + hx, hem); tp.lineTo(-flare + d * 0.04 + hx, hem); tp.quadraticCurveTo(-flare + hx, hem, -flare + hx, hem - d * 0.03); } // coat / dress hem swings behind the pop
  else if (hem > yB) { tp.lineTo(flare, hem - d * 0.03); tp.quadraticCurveTo(flare, hem, flare - d * 0.04, hem); tp.lineTo(-flare + d * 0.04, hem); tp.quadraticCurveTo(-flare, hem, -flare, hem - d * 0.03); }
  else { tp.lineTo(hw, yB - rr); tp.quadraticCurveTo(hw, yB, hw - rr, yB); tp.lineTo(-hw + rr, yB); tp.quadraticCurveTo(-hw, yB, -hw, yB - rr); }
  tp.lineTo(-hw, yT + rr); tp.quadraticCurveTo(-hw, yT, -hw + rr, yT); tp.closePath();
  const base = st === "overall" || st === "vest" ? acc ?? "#f4efe6" : topC;
  part(c, tp, base, { thick: true, off: d * 0.07 });
  // clothes details, clipped to the torso; ox = the chest's centre line (toward +x in profile)
  // three-quarter: the centre line slides to the facing side; the near half of the chest stays wide, the far half is foreshortened
  const ox = side ? tw * 0.3 : three ? tw * 0.2 : 0, wk = side ? 0.5 : three ? 0.8 : 1, th = yB - yT, chest = yT + d * 0.3;
  const sgs = side ? [1] : [-1, 1], WK = (sg: number) => (three ? (sg > 0 ? 0.56 : 0.98) : wk), wL = WK(-1), wR = WK(1);
  g.save(); g.clip(tp); g.lineCap = "round"; g.lineJoin = "round";
  const line = (pts: V2[], col = c.ink, w = c.lw * 0.7) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  const fill = (path: Path2D, col: string, stroke = true) => { g.fillStyle = col; g.fill(path); if (stroke) { g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.7; g.stroke(path); } };
  const collar = (col: string, wdt = 0.3, dep = 0.26) => { for (const sg of sgs) fill(poly([[ox, chest - d * 0.02], [ox + sg * tw * wdt * WK(sg), yT - d * 0.02], [ox + sg * tw * (wdt + 0.16) * WK(sg), chest + d * dep * 0.4], [ox + sg * tw * 0.06 * WK(sg), chest + d * dep]]), col); };
  if (st === "jacket") { const zw = d * 0.085 * wk; fill(rrect(ox - zw / 2, yT, zw, th + d * 0.1, 0), acc ?? "#ffd23f"); collar(shade(topC, 0.2), 0.3, 0.2); fill(rrect(-hw * 1.2, yB - d * 0.1, tw * 1.2, d * 0.12, 0), shade(topC, 0.2), false); line([[-hw, yB - d * 0.1], [hw, yB - d * 0.1]]); }
  if (st === "hoodie") { fill(three ? rrect(ox - tw * 0.3 * wL, yB - th * 0.4, tw * 0.3 * (wL + wR), th * 0.26, d * 0.05) : rrect(ox - tw * 0.3 * wk, yB - th * 0.4, tw * 0.6 * wk, th * 0.26, d * 0.05), shade(topC, 0.16)); for (const sg of sgs) { line([[ox + sg * tw * 0.1 * WK(sg), chest - d * 0.04], [ox + sg * tw * 0.11 * WK(sg), chest + d * 0.2]], "#f4efe6", c.lw * 0.9); dot(g, ox + sg * tw * 0.11 * WK(sg), chest + d * 0.21, c.lw * 0.8, "#f4efe6"); } }
  if (st === "shirt") { collar(tint(topC, 0.55), 0.26, 0.2); line([[ox, chest + d * 0.05], [ox, yB]]); for (let i = 0; i < 3; i++) dot(g, ox + d * 0.03, chest + d * (0.14 + i * 0.17), d * 0.022, c.ink); }
  if (st === "suit" || st === "coat") { fill(poly([[ox - tw * 0.24 * wL, yT], [ox + tw * 0.24 * wR, yT], [ox, chest + d * 0.3]]), "#f4efe6"); collar(shade(topC, 0.14), 0.26, 0.34); line([[ox, chest + d * 0.3], [ox, hem]]); for (let i = 0; i < (st === "coat" ? 3 : 1); i++) dot(g, ox + d * 0.035, chest + d * (0.42 + i * 0.16), d * 0.022, acc && st === "coat" ? acc : c.ink); }
  if (st === "tee" && acc) fill(rrect(-hw * 1.2, chest + d * 0.08, tw * 1.2, d * 0.16, 0), acc, false);
  if (st === "dress") { fill(rrect(-flare * 1.2, hem - d * 0.1, flare * 2.4, d * 0.12, 0), acc ?? tint(topC, 0.4), false); fill(poly([[ox - tw * 0.2 * wL, yT], [ox + tw * 0.2 * wR, yT], [ox, chest + d * 0.04]]), acc ?? tint(topC, 0.4)); }
  if (st === "overall") { fill(rrect(-hw * 1.2, chest + d * 0.12, tw * 1.2, th, 0), topC); for (const sg of sgs) { fill(rrect(ox + sg * tw * 0.2 * WK(sg) - d * 0.035, yT - d * 0.05, d * 0.07, d * 0.5, 0), topC); dot(g, ox + sg * tw * 0.2 * WK(sg), chest + d * 0.17, d * 0.03, "#f1c94a"); } fill(rrect(ox - tw * 0.14 * wk, chest + d * 0.28, tw * 0.28 * wk, d * 0.16, d * 0.02), shade(topC, 0.16)); }
  if (st === "vest") { for (const sg of sgs) { const ex = three ? sg * hw * 1.3 : ox + sg * hw * 1.3; fill(poly([[ox + sg * tw * 0.1 * WK(sg), yT - d * 0.02], [ex, yT - d * 0.02], [ex, yB + d * 0.02], [ox + sg * tw * 0.16 * WK(sg), yB + d * 0.02], [ox + sg * tw * 0.06 * WK(sg), chest + d * 0.25]]), topC); } }
  if (st === "uniform") { collar(shade(topC, 0.2), 0.26, 0.18); line([[ox, chest + d * 0.05], [ox, yB]]); for (let i = 0; i < 2; i++) dot(g, ox + d * 0.03, chest + d * (0.14 + i * 0.16), d * 0.024, "#f1c94a"); fill(rrect(-hw * 1.2, yB - d * 0.26, tw * 1.2, d * 0.1, 0), "#2b2230", false); fill(rrect(ox - d * 0.045, yB - d * 0.27, d * 0.09, d * 0.12, d * 0.01), "#f1c94a"); const bx = ox + (side ? -tw * 0.05 : three ? -tw * 0.28 : -tw * 0.24), by = chest + d * 0.14, star = new Path2D(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, q2 = d * (i % 2 ? 0.035 : 0.075); if (i) star.lineTo(bx + Math.cos(a) * q2, by + Math.sin(a) * q2); else star.moveTo(bx + Math.cos(a) * q2, by + Math.sin(a) * q2); } star.closePath(); fill(star, acc ?? "#f1c94a"); }
  if (st === "apron") { fill(three ? rrect(ox - tw * 0.33 * wL, chest + d * 0.06, tw * 0.33 * (wL + wR), th, d * 0.03) : rrect(ox - tw * 0.33 * wk, chest + d * 0.06, tw * 0.66 * wk, th, d * 0.03), acc ?? "#f4efe6"); for (const sg of sgs) line([[ox + sg * tw * 0.3 * WK(sg), chest + d * 0.08], [ox + sg * tw * 0.16 * WK(sg), yT - d * 0.03]], acc ?? "#f4efe6", c.lw * 1.3); fill(rrect(ox - tw * 0.14 * wk, chest + d * 0.3, tw * 0.28 * wk, d * 0.15, d * 0.02), shade(acc ?? "#f4efe6", 0.12)); }
  // the head's shadow on the collar + a soft key highlight down the lit side (polish)
  g.fillStyle = "rgba(30,14,50,0.26)"; g.beginPath(); g.ellipse(cx + (side ? 0 : -c.light * d * 0.03), cy + r * 0.12, r * 0.99, r * 1.0, 0, 0, TAU); g.fill();
  g.fillStyle = "rgba(255,255,255,0.16)"; g.fill(rrect(c.light * hw * 0.5 - hw * 0.14, chest, hw * 0.28, th * 0.5, hw * 0.14));
  g.restore();
  g.strokeStyle = c.ink; g.lineWidth = c.lw; g.stroke(tp);
  if (st === "hoodie") { const hood = new Path2D(); hood.moveTo(-hw * 0.95, yT + d * 0.16); hood.quadraticCurveTo(0, yT + d * 0.44, hw * 0.95, yT + d * 0.16); hood.quadraticCurveTo(hw * 1.1, yT - d * 0.12, 0, yT - d * 0.12); hood.quadraticCurveTo(-hw * 1.1, yT - d * 0.12, -hw * 0.95, yT + d * 0.16); hood.closePath(); part(c, side ? moved(hood, -tw * 0.22, 0, 0.8, 1) : three ? moved(hood, -tw * 0.1, 0, 0.92, 1) : hood, shade(topC, 0.14), { off: 0 }); }
  if (s.neck) { const n = s.neck, y = yT + d * 0.3, x = ox;
    if (n.style === "tie") part(c, poly([[x - d * 0.05, y - d * 0.06], [x + d * 0.05, y - d * 0.06], [x + d * 0.08, y + d * 0.36], [x, y + d * 0.46], [x - d * 0.08, y + d * 0.36]]), n.color, { off: d * 0.02 });
    else if (n.style === "bow") { for (const sg of sgs) { const bw = d * (three && sg > 0 ? 0.11 : 0.17); part(c, poly([[x, y], [x + sg * bw, y - d * 0.1], [x + sg * bw, y + d * 0.1]]), n.color, { off: 0 }); } dot(g, x, y, d * 0.05, shade(n.color, 0.3)); }
    else { part(c, rrect(-hw * 0.98, y - d * 0.12, tw * 0.98, d * 0.2, d * 0.09), n.color, { off: d * 0.03 }); part(c, poly([[hw * 0.2, y + d * 0.02], [hw * 0.62, y + d * 0.02], [hw * 0.7, y + d * 0.5], [hw * 0.3, y + d * 0.46]]), n.color, { off: d * 0.02 }); } }
  // ---- head (everything up to the hat rotates with the tilt)
  g.save(); headXf();
  const head = three ? bobbleHead3(cx, cy, r) : ell(cx, cy, r, r);
  if (p.smear?.head) { const [hx, hy] = p.smear.head; g.save(); g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.9; for (const [k, al] of [[0.4, 0.1], [0.2, 0.22]]) { g.globalAlpha = al; g.stroke(moved(head, -hx * d * k, -hy * d * k)); } g.restore(); } // head smear: two faint multiples trailing behind
  if (!side && !three) for (const sg of [-1, 1]) if (sg * (p.turn ?? 0) < 0.3) part(c, ell(cx + sg * r * 0.98, cy + r * 0.14, r * 0.13, r * 0.17), s.skin, { off: 0, sh: skinSh }); // the ear on the turned-to side hides
  part(c, head, s.skin, { thick: true, off: d * 0.075, sh: skinSh });
  g.save(); g.clip(head);
  if (hair.front.length) { g.fillStyle = "rgba(60,24,40,0.2)"; for (const q of hair.front) g.fill(moved(q, 0, d * 0.05)); } // fringe drop shadow
  g.fillStyle = "rgba(255,255,255,0.3)"; g.beginPath(); g.ellipse(cx + c.light * r * 0.42, cy + r * 0.05, r * 0.3, r * 0.42, c.light * 0.35, 0, TAU); g.fill();
  if (s.beard) { const b = ell(cx + (side ? r * 0.22 : three ? r * 0.2 : 0), cy + r * 0.82, r * (side ? 0.72 : three ? 0.86 : 0.92), r * 0.6); g.fillStyle = s.beard; g.fill(b); g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.8; g.stroke(b); }
  g.restore();
  g.strokeStyle = c.ink; g.lineWidth = c.lw; g.stroke(head);
  const turn = side ? 0 : three ? clamp(1 + 0.45 * (p.turn ?? 0), 0.5, 1.3) : clamp(p.turn ?? 0, -1, 1); // three-quarter = the head turn carried through, plus the pose's own turn
  if (side || three) { const ex = cx - r * (three ? 0.98 - 0.34 * turn : 0.3), ey = cy + r * 0.16; part(c, ell(ex, ey, r * 0.14, r * 0.18), s.skin, { off: 0, sh: skinSh }); g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.7; g.beginPath(); g.arc(ex + r * 0.03, ey, r * 0.07, Math.PI * 0.6, Math.PI * 1.4); g.stroke(); }
  if (s.cheeks && three) for (const [x, cr] of [[turn * r * 0.3 - r * 0.46, 0.17], [turn * r * 0.3 + r * 0.4, 0.13]]) { g.save(); g.globalAlpha = 0.32; dot(g, cx + x, cy + r * 0.34, r * cr, "#ff6f86"); g.restore(); }
  else if (s.cheeks) for (const x of side ? [r * 0.42] : [-r * 0.52 + (p.turn ?? 0) * r * 0.26, r * 0.52 + (p.turn ?? 0) * r * 0.26]) { g.save(); g.globalAlpha = 0.32; dot(g, cx + x, cy + r * 0.34, r * 0.17, "#ff6f86"); g.restore(); }
  const wide = (p.expr === "shock" || p.expr === "nervous") && !s.glasses && !s.shades; // ring eyes inside lenses read as double circles
  const face: Partial<FaceSpec> = { eyes: wide ? "whites" : "dot", eyeSize: wide ? 0.21 : 0.12, eyeSpacing: 0.37, eyeY: 0.5, brows: "line", browScale: wide ? 0.9 : 1.25, mouthTier: 9, mouthWidth: 0.25, mouthY: s.beard ? 0.7 : 0.72, mouthScale: 1, catchlight: true, blush: false };
  const fb: FaceBox = { x: cx + (side ? r * 0.06 : turn * r * (three ? 0.3 : 0.26)), y: cy + r * 0.08, w: d * 0.94, h: d * 0.94 };
  face.eyeSpacing = 0.37 * (1 - 0.22 * Math.abs(turn));
  const fs3 = { ...face, ...s.face }, far3 = clamp(1.02 - 0.22 * turn, 0.7, 1); // far eye / lens width in the three-quarter view
  if (Math.abs(turn) > 0.3) { const sgn = Math.sign(turn); g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.75; g.beginPath(); g.arc(fb.x + sgn * r * 0.02, cy + r * 0.27, r * 0.09, sgn > 0 ? -Math.PI * 0.4 : Math.PI * 0.6, sgn > 0 ? Math.PI * 0.5 : Math.PI * 1.4, false); g.stroke(); }
  if (three) drawFace(g, { ...fs3, mouthWidth: (fs3.mouthWidth ?? 0.25) * 0.93 }, p, fb, { ink: c.ink, lw: c.lw * 0.92, skin: s.skin, side, eyeSx: [1, far3], fxDx: -0.16, mouthAt: [fb.x + r * 0.05, fb.y - fb.h / 2 + (fs3.mouthY ?? 0.72) * fb.h] });
  else drawFace(g, { ...face, ...s.face }, p, fb, { ink: c.ink, lw: c.lw * 0.92, skin: s.skin, side });
  if (s.stache) { const y = cy + r * 0.3, x = side ? cx + r * 0.62 : three ? fb.x + r * 0.05 : fb.x, q = r * 0.34; const wing = (sg: number) => { const w = new Path2D(); w.moveTo(x, y - q * 0.15); w.quadraticCurveTo(x + sg * q * 0.9, y - q * 0.7, x + sg * q * 1.45, y - q * 0.02); w.quadraticCurveTo(x + sg * q * 0.9, y + q * 0.28, x, y + q * 0.2); w.closePath(); return w; }; for (const sg of side ? [1, -0.5] : three ? [-1, 0.74] : [-1, 1]) part(c, wing(sg), s.stache, { off: 0, lw: c.lw * 0.8 }); }
  if (side && !s.beard) { g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.8; g.beginPath(); g.arc(cx + r * 0.9, cy + r * 0.22, r * 0.12, -Math.PI * 0.45, Math.PI * 0.5); g.stroke(); } // nose tick
  if (hair.front.length) { if (sv) { g.save(); g.translate(cx, cy); g.rotate(rad(sv * 0.45)); g.translate(-cx, -cy); } // the hair mass drags behind the head, then overshoots
    inkUnion(c, hair.front, hcol);
    g.save(); for (const q of hair.front) g.clip(q); g.strokeStyle = tint(hcol, 0.28); g.lineWidth = d * 0.05; g.lineCap = "round"; g.beginPath(); g.arc(cx, cy, r * 0.8, -Math.PI * (c.light < 0 ? 0.78 : 0.42), -Math.PI * (c.light < 0 ? 0.58 : 0.22)); g.stroke(); g.restore(); if (sv) g.restore(); }
  const ey = fb.y - fb.h / 2 + 0.5 * fb.h;
  if ((s.glasses || s.shades) && three) { // near lens round, far lens narrower, a temple arm back to the near ear
    const dx = ((fs3.eyeSpacing ?? 0.3) * fb.w) / 2, gn = d * 0.125, L3: [number, number][] = [[fb.x - dx, gn], [fb.x + dx, gn * (0.2 + 0.8 * far3)]];
    for (const [x, gx] of L3) { const L = ell(x, ey, gx, gn * 0.94); if (s.shades) { g.fillStyle = s.shades; g.fill(L); g.save(); g.clip(L); g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(x - gx, ey - gn, gx * 0.9, gn * 0.7); g.restore(); } g.strokeStyle = s.glasses ?? c.ink; g.lineWidth = c.lw * 1.05; g.stroke(L); }
    g.strokeStyle = s.glasses ?? c.ink; g.lineWidth = c.lw * 1.05; g.beginPath(); g.moveTo(L3[0][0] + L3[0][1], ey); g.lineTo(L3[1][0] - L3[1][1], ey); g.moveTo(L3[0][0] - L3[0][1], ey); g.lineTo(cx - r * (0.98 - 0.34 * turn), ey - gn * 0.1); g.stroke(); }
  else if (s.glasses || s.shades) { const gr = d * 0.14, xs = side ? [fb.x + fb.w * 0.2] : [fb.x - fb.w * 0.18, fb.x + fb.w * 0.18];
    for (const x of xs) { const L = ell(x, ey, gr, gr * 0.92); if (s.shades) { g.fillStyle = s.shades; g.fill(L); g.save(); g.clip(L); g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(x - gr, ey - gr, gr * 0.9, gr * 0.7); g.restore(); } g.strokeStyle = s.glasses ?? c.ink; g.lineWidth = c.lw * 1.05; g.stroke(L); }
    g.strokeStyle = s.glasses ?? c.ink; g.lineWidth = c.lw * 1.05; g.beginPath(); if (side) { g.moveTo(xs[0] - gr, ey); g.lineTo(cx - r * 0.3, ey - gr * 0.1); } else { g.moveTo(xs[0] + gr, ey); g.lineTo(xs[1] - gr, ey); } g.stroke(); }
  if (s.hat && !R.hatAt) bobbleHat(c, s.hat, cx, cy, r, side, (p.hatTilt ?? 0) + sv, three);
  g.restore();
  if (s.hat && R.hatAt) bobbleHat(c, s.hat, R.hatAt[0], R.hatAt[1], r, side, p.hatTilt ?? 0, three); // a lifted hat follows the hand, not the head
  // ---- near arms last: they may cross the torso and the head
  if (side) drawArm(R.arms[1], holdOf(1));
  else if (three) { if (farFront) drawArm(R.arms[1], holdOf(1)); drawArm(R.arms[0], holdOf(0)); }
  else { drawArm(R.arms[0], holdOf(0)); drawArm(R.arms[1], holdOf(1)); }
}

/**
 * Pose-to-pose acting (measured on the toonworld reference: one HELD pose per clause, popped into over ~4-6 frames,
 * landing 0-3 frames before its word; nothing drifts between poses except the idle breathing you add on top).
 *   poseTrack([{ f: 0, pose: BOBBLE_POSES.idle }, { f: T.tipped - 3, pose: {...} }, ...], frame, fps)
 * Numbers and limb targets blend with a small overshoot; expr / cue / view / hold / facing switch when the pop starts.
 *
 * Smear frames (bobble): on the frame(s) of a pop where a hand target travels more than ~0.45 head units, the pose gets
 * `smear.handL / handR = { from, to }` (at most 2 frames per pop) and drawBobble draws that hand as one stretched, inked
 * shape; `smear.head` does the same for a head thrown far by lean / bob. Settle: for ~8 frames after a key the pose
 * carries `settle` (degrees, a damped drag-then-overshoot) that only hair, hat, held prop and coat hem follow - the
 * limbs already overshoot through the outBack blend. Both are pure functions of the frame; `smear: false` on a key
 * switches both off for the pop INTO that key. A pose that never went through poseTrack has neither field.
 */
export type PoseKey = { f: number; pose: KPose; blend?: number; smear?: false };
const POSE_NUM = ["armL", "armR", "elbowL", "elbowR", "legL", "legR", "lean", "bob", "squash", "hatLift", "hatTilt", "turn", "headTilt", "mouth", "blink"] as const;
const POSE_NUM0: Record<string, number> = { squash: 1 };
const POSE_REST: V2 = [0.5, 0]; // where a hand hangs when a pose gives it no target (bobble landmarks)
export function poseTrack(keys: PoseKey[], f: number, fps = 30): KPose {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].f <= f) i++;
  const B = keys[i].pose, A = i > 0 ? keys[i - 1].pose : B;
  const n = ((keys[i].blend ?? 5) * fps) / 30, t = i > 0 ? clamp((f - keys[i].f) / n) : 1;
  const c1 = 1.9, back = (tt: number) => 1 + (c1 + 1) * Math.pow(tt - 1, 3) + c1 * Math.pow(tt - 1, 2); // outBack: a little overshoot = the "pop"
  // ---- smear + settle: only inside / just after a pop, so a held pose stays exactly the keyed pose
  const extra: Pick<KPose, "smear" | "settle"> = {};
  if (i > 0 && keys[i].smear !== false) {
    const k30 = ((f - keys[i].f) * 30) / fps, step = fps / 30; // per-frame speeds are measured in 30 fps frames
    const hand = (k: "handL" | "handR", ff: number): V2 | null => { // hand target at frame ff of this pop (a missing target = the resting hand)
      const va = A.limbs?.[k], vb = B.limbs?.[k], tt = clamp((ff - keys[i].f) / n);
      if (!va && !vb) return null;
      if (va && vb) { const uu = tt >= 1 ? 1 : back(tt); return [lerp(va[0], vb[0], uu), lerp(va[1], vb[1], uu)]; }
      return (tt >= 1 ? vb : tt <= 0 ? va : tt > 0.45 ? vb : va) ?? POSE_REST;
    };
    const head = (ff: number): V2 => { const tt = clamp((ff - keys[i].f) / n), uu = tt >= 1 ? 1 : back(tt); return [2.9 * Math.sin(rad(lerp(A.lean ?? 0, B.lean ?? 0, uu))), lerp(A.bob ?? 0, B.bob ?? 0, uu)]; };
    const fast = (k: "handL" | "handR" | "head", ff: number): { from: V2; to: V2 } | null => {
      const a = k === "head" ? head(ff - step) : hand(k, ff - step), b = k === "head" ? head(ff) : hand(k, ff);
      return a && b && Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.45 ? { from: a, to: b } : null;
    };
    if (k30 > 0 && k30 <= n * (30 / fps) + 1) {
      const sm: NonNullable<KPose["smear"]> = {};
      for (const k of ["handL", "handR", "head"] as const) {
        const now = fast(k, f);
        if (!now) continue;
        let before = 0; for (let ff = f - step; ff > keys[i].f + 1e-6; ff -= step) if (fast(k, ff)) before++; // at most 2 smear frames per pop
        if (before >= 2) continue;
        if (k === "head") sm.head = [now.to[0] - now.from[0], now.to[1] - now.from[1]]; else sm[k] = now;
      }
      if (sm.handL || sm.handR || sm.head) extra.smear = sm;
    }
    if (k30 > 0 && k30 < 9) { // secondary motion: drag behind the pop, overshoot, settle (hair, hat, prop, hem)
      const hd = (k: "handL" | "handR") => { const a = A.limbs?.[k] ?? (B.limbs?.[k] ? POSE_REST : null), b = B.limbs?.[k] ?? (A.limbs?.[k] ? POSE_REST : null); return a && b ? [b[0] - a[0], b[1] - a[1]] : [0, 0]; };
      const dl = hd("handL"), dr = hd("handR"), dTurn = (B.turn ?? 0) - (A.turn ?? 0), dLean = (B.lean ?? 0) - (A.lean ?? 0), dTilt = (B.headTilt ?? 0) - (A.headTilt ?? 0), dBob = (B.bob ?? 0) - (A.bob ?? 0);
      const mag = Math.max(Math.hypot(dl[0], dl[1]), Math.hypot(dr[0], dr[1])) + Math.abs(dTurn) * 0.8 + Math.abs(dLean) / 8 + Math.abs(dTilt) / 8 + Math.abs(dBob) * 4;
      const dir = dTurn * 2 + dLean / 6 + dTilt / 8 + dr[0] - dl[0] >= 0 ? 1 : -1;
      const amp = mag > 0.08 ? clamp(1.5 + 2.6 * mag, 0, 6) : 0;
      const v = -dir * amp * 1.6 * Math.exp(-0.33 * k30) * Math.sin((Math.PI * k30) / 3.5) * (1 - k30 / 9);
      if (Math.abs(v) > 0.02) extra.settle = v;
    }
  }
  if (t >= 1) return { ...B, ...extra };
  const u = back(t);
  const out: KPose = { ...B, ...extra };
  const o = out as Record<string, unknown>, a = A as Record<string, unknown>, b = B as Record<string, unknown>;
  for (const k of POSE_NUM) { const va = a[k] as number | undefined, vb = b[k] as number | undefined; if (va !== undefined || vb !== undefined) o[k] = lerp(va ?? POSE_NUM0[k] ?? 0, vb ?? POSE_NUM0[k] ?? 0, u); }
  if (A.look || B.look) out.look = [lerp(A.look?.[0] ?? 0, B.look?.[0] ?? 0, u), lerp(A.look?.[1] ?? 0, B.look?.[1] ?? 0, u)];
  if (A.limbs || B.limbs) {
    const L: NonNullable<KPose["limbs"]> = {};
    for (const k of ["handL", "handR", "footL", "footR"] as const) {
      const va = A.limbs?.[k], vb = B.limbs?.[k];
      if (va && vb) L[k] = [lerp(va[0], vb[0], u), lerp(va[1], vb[1], u)];
      else if (t > 0.45 ? vb : va) L[k] = (t > 0.45 ? vb : va)!; // IK target <-> angle pose: switch mid-pop
    }
    out.limbs = L;
  }
  return out;
}

// ================================================================ 6. FLATVEC (characters.md 2.7 / 5.3 F)
function drawFlat(c: Ctx, s: FlatvecSpec, p: KPose) {
  const g = c.g, u = c.u, side = c.side, P = s.palette;
  const feat = P.eye ?? "#1b1830", fo: FaceOpts = { ink: feat, lw: Math.max(1.2, u * 0.008), skin: P.skin ?? "#f3c7a6", side, flat: true, eyeColor: feat };
  const F = (path: Path2D, col: string, off?: number) => flat2(c, path, col, { sh: col === P.base ? P.shade : undefined, rim: col === P.base ? P.rim : undefined, off });
  if (s.form === "bird") {
    const legH = u * 0.13, bh = u * 0.62, bw = u * 0.58, cy = -legH - bh / 2 + u * 0.02, beak = P.beak ?? "#f39a2b";
    fo.skin = P.base;
    for (const sg of [-1, 1]) { // legs
      const a = rad(sg < 0 ? p.legL ?? 0 : p.legR ?? 0), x0 = side ? sg * bw * 0.05 : sg * bw * 0.16, ex = x0 + Math.sin(a) * legH * 0.6;
      g.strokeStyle = sg < 0 && side ? flatShade(beak) : beak; g.lineWidth = u * 0.018;
      g.beginPath(); g.moveTo(x0, cy + bh * 0.4); g.lineTo(ex, -u * 0.01); g.lineTo(ex + (side ? u * 0.05 : sg * u * 0.035), -u * 0.01); g.stroke();
    }
    if (side) F(poly([[-bw * 0.42, cy + bh * 0.05], [-bw * 0.66, cy - bh * 0.08], [-bw * 0.6, cy + bh * 0.16]]), flatShade(P.base), 0);
    for (const k of [-1, 0, 1]) F(ell((side ? -bw * 0.05 : 0) + k * bw * 0.06, cy - bh * 0.5, u * 0.02, u * 0.055, k * 0.4), P.accent ?? flatShade(P.base), 0); // head tuft
    const body = side ? sePath(0, cy, bw * 0.5, bh * 0.5, 2.1, 0.12) : sePath(0, cy, bw * 0.5, bh * 0.5, 2.1, 0.12);
    F(body, P.base, u * 0.05);
    g.save(); g.clip(body); g.fillStyle = tint(P.base, 0.5); g.fill(ell(side ? bw * 0.18 : 0, cy + bh * 0.28, bw * 0.3, bh * 0.26)); g.restore();
    const wing = (sg: number, a: number) => { g.save(); g.translate(side ? -bw * 0.05 : sg * bw * 0.42, cy + bh * 0.02); g.rotate(side ? -a * 0.7 : sg * -(a - rad(15)) * 0.8); const w = new Path2D(); w.moveTo(0, -bh * 0.08); w.quadraticCurveTo(sg * bw * 0.22 * (side ? -1 : 1), bh * 0.05, side ? -bw * 0.3 : sg * bw * 0.12, bh * 0.28); w.quadraticCurveTo(side ? -bw * 0.05 : -sg * bw * 0.02, bh * 0.1, 0, -bh * 0.08); F(w, flatShade(P.base), u * 0.012); g.restore(); };
    if (side) wing(1, rad(p.armR ?? 8)); else { wing(-1, rad(p.armL ?? 8)); wing(1, rad(p.armR ?? 8)); }
    drawFace(g, { eyes: "dot", eyeSize: 0.12, eyeSpacing: 0.44, eyeY: 0.32, brows: "line", mouthTier: 3, catchlight: true, ...s.face }, p,
      { x: side ? bw * 0.12 : 0, y: cy - bh * 0.12, w: bw * 0.8, h: bh * 0.6 }, { ...fo, beak, beakSize: bw * 0.11, mouthAt: side ? [bw * 0.4, cy - bh * 0.12] : [0, cy - bh * 0.1] });
    return;
  }
  // person: capsule body, round head, no neck, thin capsule limbs, dot eyes, mouth mostly hidden
  const d = u / (s.heightHeads ?? 3.2), headC: V2 = [side ? d * 0.04 : 0, -u + d / 2], tw = d * 0.8 * (side ? 0.75 : 1);
  const tTop = -u + d * 1.02, tBot = -u + d * 2.15, legs = P.legs ?? "#2c3350", skin = P.skin ?? "#f3c7a6";
  for (const sg of [-1, 1]) {
    const a = rad(sg < 0 ? p.legL ?? 0 : p.legR ?? 0), x0 = side ? 0 : sg * tw * 0.22, L = -tBot + d * 0.1;
    const ex = x0 + Math.sin(a) * L * (side ? 1 : 0.4), ey = tBot - d * 0.1 + Math.cos(a) * L;
    g.lineCap = "round"; g.strokeStyle = side && sg < 0 ? flatShade(legs) : legs; g.lineWidth = d * 0.22;
    g.beginPath(); g.moveTo(x0, tBot - d * 0.1); g.lineTo(ex, ey - d * 0.11); g.stroke();
  }
  const arm = (sg: number, far: boolean) => {
    const ang = sg < 0 ? p.armL ?? 6 : p.armR ?? 6, a = rad(side ? ang - 6 : ang), sx = side ? 0 : sg * tw * 0.4, sy = tTop + d * 0.2;
    const ex = sx + (side ? Math.sin(a) : sg * Math.sin(a)) * d * 0.95, ey = sy + Math.cos(a) * d * 0.95;
    g.strokeStyle = far ? flatShade(P.base) : P.shade ?? flatShade(P.base); g.lineWidth = d * 0.18; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
    dot(g, ex, ey, d * 0.1, far ? flatShade(skin) : skin);
  };
  if (side) arm(-1, true);
  F(rrect(-tw / 2, tTop, tw, tBot - tTop, tw * 0.42), P.base, d * 0.12);
  if (!side) { arm(-1, false); arm(1, false); }
  const head = ell(headC[0], headC[1], d / 2, d / 2);
  flat2(c, head, skin, { off: d * 0.1, rim: tint(skin, 0.3) });
  const hp = new Path2D(); hp.moveTo(headC[0] - d * 0.52, headC[1] + d * 0.02); hp.bezierCurveTo(headC[0] - d * 0.55, headC[1] - d * 0.66, headC[0] + d * 0.55, headC[1] - d * 0.66, headC[0] + d * 0.52, headC[1] - d * 0.02);
  hp.quadraticCurveTo(headC[0] + d * 0.1, headC[1] - d * 0.32, headC[0] - d * (side ? 0.1 : 0.3), headC[1] - d * 0.22); hp.quadraticCurveTo(headC[0] - d * 0.45, headC[1] - d * 0.2, headC[0] - d * 0.52, headC[1] + d * 0.02);
  flat2(c, hp, P.hair ?? "#2d2440", { off: d * 0.06, rim: "none" });
  drawFace(g, { eyes: "dot", eyeSize: 0.1, eyeSpacing: 0.34, eyeY: 0.56, brows: "line", mouthTier: 3, mouthWidth: 0.24, mouthY: 0.8, catchlight: false, ...s.face }, p, { x: headC[0], y: headC[1], w: d, h: d }, { ...fo, skin });
  if (side) arm(1, false);
}

// ================================================================ 7. MICROBE (characters.md 2.23 / 5.3 G) - blob tech + wobbling membrane
function drawMicrobe(c: Ctx, s: MicrobeSpec, p: KPose) {
  const g = c.g, u = c.u, t = c.t, hz = s.wobbleHz ?? 0.6, R = u * 0.3, cy = -u * 0.46 + Math.sin(t * TAU * 0.5) * u * 0.015;
  c.lw = Math.max(1.5, R * (s.lineW ?? 0.07));
  const inner = s.inner ?? tint(s.color, 0.35), acc = s.accent ?? "#7b4fb8";
  const wob = loopNoise(s.id + ":mem"), nz = s.noise ?? ({ cell: 0.05, wbc: 0.07, virus: 0.015, bacterium: 0.02, rbc: 0.015, heart: 0, brain: 0.01 } as const)[s.form];
  const W = (a: number) => 1 + nz * wob(a, t * hz);
  const r = rng(s.id + ":org");
  let body: Path2D, face: FaceBox = { x: c.side ? R * 0.15 : 0, y: cy, w: R * 1.3, h: R * 1.15 }, skin = inner;
  const organelles = (n: number, rr: number, cols: string[], cx = 0) => {
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = (0.45 + 0.4 * r()) * rr, x = cx + Math.cos(a) * d * 1.05 + Math.sin(t * 0.5 + i) * rr * 0.04, y = cy + Math.sin(a) * d * 0.9 + Math.cos(t * 0.4 + i * 2) * rr * 0.04;
      if (Math.abs(x - face.x) < face.w * 0.42 && Math.abs(y - cy) < face.h * 0.36) continue; // keep the face clear
      const rs = rr * (0.06 + 0.06 * r()); g.fillStyle = cols[i % cols.length]; g.fill(ell(x, y, rs, rs * (0.7 + 0.5 * r()), r() * 3)); g.strokeStyle = shade(cols[i % cols.length], 0.4); g.lineWidth = c.lw * 0.5; g.stroke(ell(x, y, rs, rs * (0.7 + 0.5 * r()), r() * 3));
    }
  };
  switch (s.form) {
    case "virus": {
      const n = 12, spin = t * 0.15;
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU + spin, k = W(a), x0 = Math.cos(a) * R * 0.95, y0 = cy + Math.sin(a) * R * 0.95, x1 = Math.cos(a) * R * (1.32 + 0.03 * Math.sin(t * 3 + i)), y1 = cy + Math.sin(a) * R * (1.32 + 0.03 * Math.sin(t * 3 + i));
        limb(c, [[x0 * k, y0], [x1, y1]], R * 0.07, shade(s.color, 0.15)); part(c, ell(x1, y1, R * 0.11, R * 0.11), acc, { off: R * 0.03 }); }
      body = sePath(0, cy, R, R, 2, 0, 2, W); part(c, body, s.color, { thick: true, off: R * 0.14 });
      g.save(); g.clip(body); for (let i = 0; i < 7; i++) { const a = r() * TAU, d = R * (0.55 + 0.35 * r()); g.fillStyle = shade(s.color, 0.12); g.fill(ell(Math.cos(a + spin) * d, cy + Math.sin(a + spin) * d, R * 0.1, R * 0.08)); } g.restore();
      skin = s.color; break;
    }
    case "bacterium": {
      const bx = R * 0.25, hw = R * 0.92, hh = R * 0.58;
      for (let k = 0; k < 3; k++) { // flagella: travelling sine strokes
        g.strokeStyle = c.ink; g.lineWidth = c.lw * 1.1; g.beginPath();
        for (let i = 0; i <= 24; i++) { const q = i / 24, x = bx - hw * 0.95 - q * R * 0.7, y = cy + (k - 1) * hh * 0.45 + Math.sin(q * 9 - t * 8 + k) * R * 0.07 * q; i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
      const cap = rrect(bx - hw, cy - hh, hw * 2, hh * 2, hh);
      body = moved(cap, 0, 0); g.save(); g.translate(0, Math.sin(t * TAU * hz) * R * 0.01); part(c, body, s.color, { thick: true, off: R * 0.12 }); g.restore();
      g.save(); g.clip(body); g.fillStyle = inner; g.fill(rrect(bx - hw * 0.84, cy - hh * 0.7, hw * 1.68, hh * 1.4, hh * 0.7)); g.restore();
      g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.8; for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, x = bx + Math.cos(a) * hw * 1.0, y = cy + Math.sin(a) * hh * 1.0; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * R * 0.08, y + Math.sin(a) * R * 0.08); g.stroke(); }
      face = { x: bx + (c.side ? hw * 0.3 : hw * 0.15), y: cy, w: hw * 1.25, h: hh * 1.6 };
      break;
    }
    case "rbc": {
      body = sePath(0, cy, R * 1.12, R * 0.98, 2, 0, 2, W); part(c, body, s.color, { thick: true, off: R * 0.12 });
      const gr = g.createRadialGradient(0, cy, R * 0.1, 0, cy, R * 0.75); gr.addColorStop(0, shade(s.color, 0.35)); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.save(); g.clip(body); g.fillStyle = gr; g.fill(ell(0, cy, R * 0.8, R * 0.7)); g.restore(); skin = shade(s.color, 0.2);
      face.y = cy + R * 0.04; break;
    }
    case "heart": {
      const beat = Math.exp(-((t * 1.2) % 1) * 7) * 0.07, k = 1 + beat, hR = R * k;
      for (const [dx, col] of [[-0.28, "#5b8fd8"], [0.22, shade(s.color, 0.18)]] as [number, string][]) { const tb = rrect(dx * hR - hR * 0.13, cy - hR * 1.25, hR * 0.26, hR * 0.6, hR * 0.12); part(c, tb, col, { off: 0 }); part(c, ell(dx * hR, cy - hR * 1.25, hR * 0.13, hR * 0.06), shade(col, 0.3), { off: 0 }); }
      const hp = new Path2D(); hp.moveTo(0, cy - hR * 0.55);
      hp.bezierCurveTo(hR * 0.2, cy - hR * 1.1, hR * 1.2, cy - hR * 0.95, hR * 1.1, cy - hR * 0.15); hp.bezierCurveTo(hR * 1.0, cy + hR * 0.45, hR * 0.35, cy + hR * 0.8, 0, cy + hR * 1.05);
      hp.bezierCurveTo(-hR * 0.35, cy + hR * 0.8, -hR * 1.0, cy + hR * 0.45, -hR * 1.1, cy - hR * 0.15); hp.bezierCurveTo(-hR * 1.2, cy - hR * 0.95, -hR * 0.2, cy - hR * 1.1, 0, cy - hR * 0.55); hp.closePath();
      body = hp; part(c, body, s.color, { thick: true, off: R * 0.14 });
      g.strokeStyle = shade(s.color, 0.3); g.lineWidth = c.lw * 0.8; g.beginPath(); g.moveTo(-hR * 0.2, cy - hR * 0.5); g.quadraticCurveTo(-hR * 0.05, cy + hR * 0.1, hR * 0.35, cy + hR * 0.7); g.stroke();
      skin = s.color; face = { x: c.side ? R * 0.15 : 0, y: cy + R * 0.12, w: R * 1.3, h: R * 1.0 }; break;
    }
    case "brain": {
      body = sePath(0, cy, R * 1.18, R * 0.9, 2.1, 0.08, 2.4, W); part(c, body, s.color, { thick: true, off: R * 0.12 });
      g.save(); g.clip(body); g.strokeStyle = shade(s.color, 0.25); g.lineWidth = c.lw * 0.9;
      const rr = rng(s.id + ":gyri");
      for (let i = 0; i < 9; i++) { const x0 = -R * 1.1 + rr() * R * 2.2, y0 = cy - R * 0.9 + rr() * R * 0.75; g.beginPath(); for (let k = 0; k <= 10; k++) { const q = k / 10, x = x0 + q * R * 0.6, y = y0 + Math.sin(q * 9 + i) * R * 0.07; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
      g.restore(); g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.9; g.beginPath(); g.moveTo(0, cy - R * 0.88); g.quadraticCurveTo(R * 0.04, cy - R * 0.6, 0, cy - R * 0.35); g.stroke();
      skin = s.color; face = { x: c.side ? R * 0.2 : 0, y: cy + R * 0.22, w: R * 1.25, h: R * 0.95 }; break;
    }
    default: { // cell / wbc: membrane + cytoplasm ring + nucleus + organelles
      body = sePath(0, cy, R * 1.1, R * 1.02, 2, 0, 2, W, 120); part(c, body, s.color, { thick: true, off: R * 0.12 });
      const cyto = sePath(0, cy, R * 0.94, R * 0.86, 2, 0, 2, (a) => W(a + 0.2), 120); g.fillStyle = inner; g.fill(cyto);
      if (s.form === "wbc") for (const [dx, dy] of [[-0.45, 0.45], [-0.1, 0.62], [0.28, 0.5]]) { g.fillStyle = mix(acc, inner, 0.45); g.fill(ell(dx * R, cy + dy * R, R * 0.2, R * 0.16)); }
      else { g.fillStyle = mix(acc, inner, 0.25); g.fill(ell(-R * 0.5, cy + R * 0.42, R * 0.24, R * 0.2)); dot(g, -R * 0.46, cy + R * 0.38, R * 0.07, shade(acc, 0.2)); }
      organelles(s.organelles ?? 9, R, ["#ffd36e", "#ff9db0", "#9be7a6"]);
      skin = inner;
    }
  }
  drawFace(g, { eyes: "whites", eyeSize: 0.24, eyeSpacing: 0.44, eyeY: 0.38, mouthTier: 5, mouthWidth: 0.3, mouthY: 0.76, ...s.face }, p, face, { ink: c.ink, lw: c.lw, skin, side: c.side });
}

// ================================================================ 8. STYLE PASSES (characters.md 2.11, 2.12, 2.18, 2.19, 5.3 H)
export type PassSpec =
  | { pass: "sketch"; jitterPx?: number; boilEvery?: number; ink?: string; paper?: string; wash?: number }
  | { pass: "cutout"; edgePx?: number; paper?: string; shadow?: { dx: number; dy: number; blur: number; alpha: number }; stepFrames?: number; jitter?: { px: number; deg: number } }
  | { pass: "silhouette"; fill?: string; rim?: { color: string; widthPx: number }; light?: number }
  | { pass: "pixelize"; heightPx?: number; palette?: string[]; dither?: "none" | "bayer4"; outline1px?: boolean; ink?: string };

const pool = new Map<string, HTMLCanvasElement>();
function scratch(key: string, w: number, h: number) {
  let cv = pool.get(key);
  if (!cv) { cv = document.createElement("canvas"); cv.getContext("2d", { willReadFrequently: key !== "pass" }); pool.set(key, cv); }
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } else cv.getContext("2d")!.clearRect(0, 0, w, h);
  return cv;
}

/**
 * Vector sketch context (2.19): every stroke() is redrawn twice with an independent seeded jitter in pencil
 * colour (jittered double line), fills become a light marker wash offset from the line (misregistration),
 * thick/light strokes are treated as paint. Boil = new seed every `boilEvery` frames. Works on ANY drawing code.
 */
export function sketchContext(g: CanvasRenderingContext2D, o: Extract<PassSpec, { pass: "sketch" }>, frame: number): CanvasRenderingContext2D {
  const boil = Math.floor(frame / (o.boilEvery ?? 3)), jit = (o.jitterPx ?? 1.3) * Math.max(1.6, g.canvas.height / 250), ink = o.ink ?? "#2a2a2e", paper = o.paper ?? "#f7f3ea", wash = o.wash ?? 0.5;
  let k = 0, cur = new Path2D();
  const washed = (st: unknown) => { const c = parseCss(st); if (!c) return st; const L = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; return L < 0.18 ? ink : `rgba(${Math.round(lerp(c[0], 247, wash))},${Math.round(lerp(c[1], 243, wash))},${Math.round(lerp(c[2], 234, wash))},${c[3]})`; };
  const pathCalls = new Set(["moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "arc", "arcTo", "ellipse", "rect", "closePath", "roundRect"]);
  void paper;
  return new Proxy(g, {
    get(t, prop) {
      const v = (t as any)[prop];
      if (prop === "beginPath") return () => { cur = new Path2D(); t.beginPath(); };
      if (typeof prop === "string" && pathCalls.has(prop)) return (...a: unknown[]) => { (cur as any)[prop](...a); (v as Function).apply(t, a); };
      if (prop === "stroke") return (path?: Path2D) => {
        const P = path ?? cur, st = t.strokeStyle, lw = t.lineWidth, c = parseCss(st), L = c ? (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 : 0;
        const tr = t.getTransform(), scale = Math.hypot(tr.a, tr.b) || 1;
        if (c && (L > 0.3 || c[3] < 0.9)) { t.strokeStyle = washed(st) as string; t.stroke(P); t.strokeStyle = st; return; } // paint stroke
        const r = rng(`sk:${boil}:${k++}`);
        t.save();
        for (let i = 0; i < 2; i++) {
          t.save(); t.translate(((r() - 0.5) * 2 * jit) / scale, ((r() - 0.5) * 2 * jit) / scale);
          t.strokeStyle = ink; t.globalAlpha = i ? 0.55 : 0.9; t.lineWidth = Math.max(0.6 / scale, lw * (i ? 0.45 : 0.72));
          t.stroke(P); t.restore();
        }
        t.restore();
      };
      if (prop === "fill") return (a?: unknown, b?: unknown) => {
        const P = a instanceof Path2D ? a : cur, rule = (a instanceof Path2D ? b : a) as CanvasFillRule | undefined;
        const fs = t.fillStyle, tr = t.getTransform(), scale = Math.hypot(tr.a, tr.b) || 1;
        t.save(); t.fillStyle = washed(fs) as string; t.translate((jit * 1.4) / scale, (jit * 1.0) / scale); t.fill(P, rule); t.restore();
      };
      if (prop === "clip") return (a?: unknown, b?: unknown) => (a instanceof Path2D ? t.clip(a, b as CanvasFillRule) : t.clip(cur, a as CanvasFillRule));
      return typeof v === "function" ? v.bind(t) : v;
    },
    set(t, prop, v) { (t as any)[prop] = v; return true; },
  });
}

/**
 * Raster passes on any character canvas (toon cards included): writes the styled result into `dst` at (0,0).
 * sketch here is the raster fallback (dark-line extraction drawn twice, jittered, over a washed fill);
 * prefer drawWithPass for kinds so sketch is vector.
 */
export function applyPass(src: HTMLCanvasElement, pass: PassSpec, frame: number, dst: CanvasRenderingContext2D, light = -1) {
  const W = src.width, H = src.height, u = H / 1.08;
  dst.save();
  if (pass.pass === "silhouette") { // 2.18: ink fill, interior lines gone, optional coloured rim from the backlight
    const m = scratch("sil", W, H), g = m.getContext("2d")!;
    g.drawImage(src, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = pass.fill ?? INK; g.fillRect(0, 0, W, H); g.globalCompositeOperation = "source-over";
    dst.drawImage(m, 0, 0);
    if (pass.rim) {
      const r = scratch("rim", W, H), rg = r.getContext("2d")!, w = pass.rim.widthPx, L = pass.light ?? light;
      rg.drawImage(src, 0, 0); rg.globalCompositeOperation = "source-in"; rg.fillStyle = pass.rim.color; rg.fillRect(0, 0, W, H);
      rg.globalCompositeOperation = "destination-out"; rg.drawImage(src, -L * w, w * 0.6); rg.globalCompositeOperation = "source-over";
      dst.drawImage(r, 0, 0);
    }
  } else if (pass.pass === "cutout") { // 2.12: paper edge, drop shadow, stepped boil on twos
    const step = pass.stepFrames ?? 2, f2 = Math.floor(frame / step), r = rng("cut:" + f2), jp = pass.jitter ?? { px: 0.8, deg: 0.6 }, sc = u / 400;
    const e = (pass.edgePx ?? 3) * Math.max(1, sc), paper = pass.paper ?? "#fbf7ee", sh = pass.shadow ?? { dx: 2.5, dy: 3.5, blur: 4, alpha: 0.35 };
    const edge = scratch("cutE", W, H), eg = edge.getContext("2d")!;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, k = e * (0.7 + 0.6 * r()); eg.drawImage(src, Math.cos(a) * k, Math.sin(a) * k); }
    eg.globalCompositeOperation = "source-in"; eg.fillStyle = paper; eg.fillRect(0, 0, W, H); eg.globalCompositeOperation = "source-over";
    eg.drawImage(src, 0, 0);
    // paper grain, clipped to the cut shape
    eg.globalCompositeOperation = "source-atop"; const gr = rng("grain");
    for (let i = 0; i < (W * H) / 260; i++) { eg.fillStyle = gr() < 0.5 ? "rgba(90,70,40,0.07)" : "rgba(255,255,255,0.09)"; eg.fillRect(gr() * W, gr() * H, 1.5 * Math.max(1, sc), 1.5 * Math.max(1, sc)); }
    eg.globalCompositeOperation = "source-over";
    dst.translate(W / 2, H * 0.97); dst.rotate(rad((r() - 0.5) * 2 * jp.deg)); dst.translate(-W / 2 + (r() - 0.5) * 2 * jp.px * sc, -H * 0.97 + (r() - 0.5) * 2 * jp.px * sc);
    dst.shadowColor = `rgba(20,12,16,${sh.alpha})`; dst.shadowBlur = sh.blur * Math.max(1, sc); dst.shadowOffsetX = sh.dx * Math.max(1, sc); dst.shadowOffsetY = sh.dy * Math.max(1, sc);
    dst.drawImage(edge, 0, 0);
  } else if (pass.pass === "pixelize") { // 2.11: low-res, palette-quantised, 1 px outline, nearest-neighbour upscale
    const ph = pass.heightPx ?? 56, cell = u / ph, sw = Math.ceil(W / cell), shh = Math.ceil(H / cell);
    const sm = scratch("pix", sw, shh), g = sm.getContext("2d")!;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, sw, shh);
    const id = g.getImageData(0, 0, sw, shh), d = id.data, pal = (pass.palette ?? []).map(rgb), ink = rgb(pass.ink ?? INK);
    const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const solid = new Uint8Array(sw * shh);
    for (let i = 0; i < sw * shh; i++) {
      const o = i * 4; if (d[o + 3] < 110) { d[o + 3] = 0; continue; }
      solid[i] = 1; const a = d[o + 3] / 255;
      let cr = d[o], cg = d[o + 1], cb = d[o + 2]; void a;
      if (pass.dither === "bayer4") { const t = (B4[(i % sw) % 4 + ((Math.floor(i / sw) % 4) * 4)] / 16 - 0.5) * 40; cr += t; cg += t; cb += t; }
      if (pal.length) { let best = pal[0], bd = 1e9; for (const q of pal) { const dd = (q[0] - cr) ** 2 * 0.3 + (q[1] - cg) ** 2 * 0.59 + (q[2] - cb) ** 2 * 0.11; if (dd < bd) { bd = dd; best = q; } } [cr, cg, cb] = best; }
      else { const q = (v: number) => Math.round(clamp(v, 0, 255) / 32) * 32; cr = q(cr); cg = q(cg); cb = q(cb); }
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = 255;
    }
    if (pass.outline1px !== false) for (let y = 0; y < shh; y++) for (let x = 0; x < sw; x++) {
      const i = y * sw + x; if (solid[i]) continue;
      if ((x > 0 && solid[i - 1]) || (x < sw - 1 && solid[i + 1]) || (y > 0 && solid[i - sw]) || (y < shh - 1 && solid[i + sw])) { const o = i * 4; d[o] = ink[0]; d[o + 1] = ink[1]; d[o + 2] = ink[2]; d[o + 3] = 255; }
    }
    g.putImageData(id, 0, 0);
    dst.imageSmoothingEnabled = false; dst.drawImage(sm, 0, 0, sw * cell, shh * cell);
  } else { // raster sketch fallback
    const jit = (pass.jitterPx ?? 1.1) * Math.max(1, u / 500), r = rng("rsk:" + Math.floor(frame / (pass.boilEvery ?? 3)));
    dst.globalAlpha = 0.55; dst.filter = "saturate(0.7) brightness(1.18)"; dst.drawImage(src, jit, jit); dst.filter = "none"; dst.globalAlpha = 1;
    const ln = scratch("rskL", W, H), lg = ln.getContext("2d")!; lg.drawImage(src, 0, 0);
    const id = lg.getImageData(0, 0, W, H), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; if (L > 70) d[i + 3] = 0; else { d[i] = 42; d[i + 1] = 42; d[i + 2] = 46; } }
    lg.putImageData(id, 0, 0);
    for (let i = 0; i < 2; i++) { dst.globalAlpha = i ? 0.5 : 0.85; dst.drawImage(ln, (r() - 0.5) * 2 * jit, (r() - 0.5) * 2 * jit); }
  }
  dst.restore();
}

/** Draw with an optional pass: sketch = vector proxy, the rest = offscreen raster + applyPass. */
export function drawWithPass(g: CanvasRenderingContext2D, W: number, H: number, pass: PassSpec | undefined, frame: number, draw: (g: CanvasRenderingContext2D) => void, light = -1) {
  if (!pass) { draw(g); return; }
  if (pass.pass === "sketch") { draw(sketchContext(g, pass, frame)); return; }
  const off = scratch("pass", W, H), og = off.getContext("2d")!;
  draw(og);
  g.clearRect(0, 0, W, H);
  applyPass(off, pass, frame, g, light);
}
/** drawAny + style pass in one call. */
export function drawAnyStyled(g: CanvasRenderingContext2D, spec: CharacterSpec | KindSpec, pose: Pose | KPose, W: number, H: number, frame = 0, pass?: PassSpec, fps = 30) {
  drawWithPass(g, W, H, pass, frame, (gg) => drawAny(gg, spec, pose, W, H, frame, fps), pose.light ?? -1);
}

// ================================================================ presets (series-bible ready, characters.md 3.9)
export const KIND_PRESETS = {
  // object
  cardboard: { id: "cardboard", kind: "object", shape: "box", color: "#d9a066", color2: "#efd9a6", rigidity: 0.55, limbs: "bfdi" },
  soda: { id: "soda", kind: "object", shape: "can", color: "#cfd6de", color2: "#e8413a", rigidity: 0.8, limbs: "bfdi" },
  ball: { id: "ball", kind: "object", shape: "ball", color: "#fbf6ea", color2: "#3f8fe0", rigidity: 0.2 },
  jelly: { id: "jelly", kind: "object", shape: "blob", color: "#ff7aa8", rigidity: 0 },
  phone: { id: "phone", kind: "object", shape: "rounded", color: "#2e3240", color2: "#c6ecff", rigidity: 0.9, limbs: "bfdi" },
  house: { id: "house", kind: "object", shape: "house", color: "#f4e3c1", color2: "#d9533f", rigidity: 0.85 },
  tooth: { id: "tooth", kind: "object", shape: "tooth", color: "#fbfaf4", rigidity: 0.6, limbs: "bfdi" },
  star: { id: "star", kind: "object", shape: "custom", color: "#ffd23f", rigidity: 0.3, path: "M0.5 0 L0.63 0.35 L1 0.38 L0.72 0.6 L0.81 1 L0.5 0.78 L0.19 1 L0.28 0.6 L0 0.38 L0.37 0.35 Z", faceBox: [0.5, 0.56, 0.42, 0.34] },
  // critters
  cat: { id: "cat", kind: "critter", species: "cat" }, dog: { id: "dog", kind: "critter", species: "dog", scarf: "#e04848" }, bird: { id: "bird", kind: "critter", species: "bird" },
  frog: { id: "frog", kind: "critter", species: "frog" }, bear: { id: "bear", kind: "critter", species: "bear" }, mouse: { id: "mouse", kind: "critter", species: "mouse" },
  rabbit: { id: "rabbit", kind: "critter", species: "rabbit" }, fox: { id: "fox", kind: "critter", species: "fox" }, pig: { id: "pig", kind: "critter", species: "pig" },
  cat4: { id: "cat4", kind: "critter", species: "cat", stance: "quadruped" }, dog4: { id: "dog4", kind: "critter", species: "dog", stance: "quadruped" },
  // blobs
  mochi: { id: "mochi", kind: "blob", color: "#6fd0c6", accent: "#ffcf4a", attachments: [{ kind: "antenna", at: -28, len: 0.2 }, { kind: "antenna", at: 28, len: 0.2 }] },
  sprout: { id: "sprout", kind: "blob", color: "#ffb35c", shape: { n: 2.1, egg: 0.16, aspect: 1.1 }, attachments: [{ kind: "leaf", at: 8, len: 0.22 }] },
  imp: { id: "imp", kind: "blob", color: "#8b6cf0", shape: { n: 2.6, egg: 0.22, aspect: 0.95 }, attachments: [{ kind: "horn", at: -36, len: 0.13 }, { kind: "horn", at: 36, len: 0.13 }], fur: 0 },
  fluff: { id: "fluff", kind: "blob", color: "#f2eee6", fur: 1, attachments: [{ kind: "ear", at: -40, len: 0.16 }, { kind: "ear", at: 40, len: 0.16 }], accent: "#f7a8b8" },
  // stick
  stick: { id: "stick", kind: "stick", color: "#f58a1f" }, stickBlue: { id: "stickBlue", kind: "stick", color: "#2f8ee5" },
  xray: { id: "xray", kind: "stick", color: "#2f8ee5", skeleton: true },
  // stick cast with accessories (identity at feed size: hat/hair/facial hair/coat silhouette)
  stickGent: { id: "stickGent", kind: "stick", color: "#2b2f3a", head: "#fbf6ee", hat: { style: "top", color: "#22252e", band: "#8a2f3a" }, stache: "#4a3020", coat: { color: "#3a4a6a", tails: true, buttons: "#d8b04a" }, neckwear: { style: "bow", color: "#c0392b" } },
  stickWorker: { id: "stickWorker", kind: "stick", color: "#3a3a44", head: "#fbf6ee", hat: { style: "cap", color: "#e8a23a" }, hair: { style: "tuft", color: "#5b3a24" }, neckwear: { style: "scarf", color: "#d9534f" }, build: "stout" },
  stickLady: { id: "stickLady", kind: "stick", color: "#3a2f3f", head: "#fbf6ee", hair: { style: "bun", color: "#7a4a2a" }, skirt: "#8e5bb5", hat: { style: "boater", color: "#f0d58a", band: "#5b7fd6" }, cheeks: true, build: "slim" },
  stickKid: { id: "stickKid", kind: "stick", color: "#3d8fd6", head: "#fbf6ee", hair: { style: "spikes", color: "#2a2228" }, hat: { style: "beanie", color: "#e0563b" }, heightHeads: 4.2, cheeks: true },
  stickProf: { id: "stickProf", kind: "stick", color: "#3b3340", head: "#fbf6ee", hair: { style: "side", color: "#d9d4cc" }, beard: "#e6e1d8", glasses: "#2b2230", coat: { color: "#7a5a3a", buttons: "#2b2230" }, neckwear: { style: "tie", color: "#2f6fb0" }, build: "slim" },
  // bobble pack (5.3 I): one silhouette (hair/hat) + one outfit shape + one accent per character
  bbHero: { id: "bbHero", kind: "bobble", skin: "#f6cfae", hair: { style: "cap", color: "#6a3d22" }, top: { color: "#e2483a", style: "jacket", accent: "#ffd23f" }, legs: "#2f4a7a", shoes: "#2b2230" },
  bbGirl: { id: "bbGirl", kind: "bobble", skin: "#f6cfae", hair: { style: "pony", color: "#b5562a" }, top: { color: "#2fb3a6", style: "hoodie" }, legs: "#3a3f5c", shoes: "#e2483a", cheeks: true, build: "slim" },
  bbKid: { id: "bbKid", kind: "bobble", skin: "#e9b58c", hair: { style: "spiky", color: "#2a2228" }, top: { color: "#f39a2b", style: "tee", accent: "#fff3d6" }, legs: "#3d6fb0", shoes: "#d8344e", cheeks: true, heightHeads: 2.7 },
  bbGrandpa: { id: "bbGrandpa", kind: "bobble", skin: "#f3c9a4", hair: { style: "bald", color: "#dddddd" }, stache: "#e9e6ee", glasses: "#2b2230", top: { color: "#7a5a3a", style: "vest", accent: "#f1e7d2" }, legs: "#6b6f7a", shoes: "#4a3528", build: "stout" },
  bbGrandma: { id: "bbGrandma", kind: "bobble", skin: "#fbe3d0", hair: { style: "bun", color: "#cfcad6" }, glasses: "#8a4b6a", top: { color: "#a77bd0", style: "dress", accent: "#f4efe6" }, legs: "#fbe3d0", shoes: "#6a4a8a", cheeks: true },
  bbBoss: { id: "bbBoss", kind: "bobble", skin: "#f6cfae", hair: { style: "side", color: "#1f1a22" }, top: { color: "#26355e", style: "suit" }, neck: { style: "tie", color: "#c8323a" }, legs: "#1f2b4d", shoes: "#16131a" },
  bbWorker: { id: "bbWorker", kind: "bobble", skin: "#c98e66", hat: { style: "hardhat", color: "#f5c21b" }, stache: "#2a2228", top: { color: "#3f6fb5", style: "overall", accent: "#f08a24" }, legs: "#3f6fb5", shoes: "#5a3c2e" },
  bbCop: { id: "bbCop", kind: "bobble", skin: "#f3c9a4", hat: { style: "cap", color: "#22305a", accent: "#11182e" }, hair: { style: "buzz", color: "#4a3020" }, top: { color: "#2c3f78", style: "uniform" }, legs: "#22305a", shoes: "#16131a" },
  bbRanger: { id: "bbRanger", kind: "bobble", skin: "#e9b58c", hat: { style: "ranger", color: "#b08a4e", accent: "#5a4326" }, top: { color: "#7d8a55", style: "uniform", accent: "#f1c94a" }, legs: "#5d6640", shoes: "#3a2a1e", build: "stout" },
  bbDoctor: { id: "bbDoctor", kind: "bobble", skin: "#8d5a3c", hair: { style: "bob", color: "#1f1a22" }, glasses: "#2b2230", top: { color: "#f4f6fa", style: "coat", accent: "#7fb6e8" }, legs: "#4aa3a0", shoes: "#f4f6fa" },
  bbChef: { id: "bbChef", kind: "bobble", skin: "#f6cfae", hat: { style: "chef", color: "#fbfaf6" }, stache: "#2a2228", top: { color: "#d9534f", style: "apron" }, legs: "#3a3f5c", shoes: "#16131a", build: "stout" },
  bbScientist: { id: "bbScientist", kind: "bobble", skin: "#fbe3d0", hair: { style: "curly", color: "#b9b4c4" }, glasses: "#2b2230", top: { color: "#f4f6fa", style: "coat" }, neck: { style: "bow", color: "#2f8f6a" }, legs: "#5a5f6e", shoes: "#2b2230", build: "slim" },
  bbFarmer: { id: "bbFarmer", kind: "bobble", skin: "#e9b58c", hat: { style: "boater", color: "#f0d58a", accent: "#8a5a34" }, beard: "#8a5a34", top: { color: "#4f78b0", style: "overall", accent: "#d9534f" }, legs: "#4f78b0", shoes: "#5a3c2e" },
  bbTeen: { id: "bbTeen", kind: "bobble", skin: "#c98e66", hat: { style: "beanie", color: "#3a3f5c", accent: "#f08a24" }, hair: { style: "long", color: "#2a2228" }, top: { color: "#8e5bd0", style: "hoodie" }, legs: "#2b2f3f", shoes: "#f4f6fa", build: "slim" },
  bbAthlete: { id: "bbAthlete", kind: "bobble", skin: "#8d5a3c", hair: { style: "buzz", color: "#1f1a22" }, top: { color: "#f4f6fa", style: "tee", accent: "#e2483a" }, legs: "#e2483a", shoes: "#f5c21b" },
  bbKing: { id: "bbKing", kind: "bobble", skin: "#f6cfae", hat: { style: "crown", color: "#f5c21b" }, beard: "#6a3d22", top: { color: "#b3263a", style: "coat", accent: "#f5c21b" }, legs: "#3a2f5c", shoes: "#2b2230", build: "stout" },
  bbArtist: { id: "bbArtist", kind: "bobble", skin: "#fbe3d0", hat: { style: "beret", color: "#2b2230" }, hair: { style: "bob", color: "#c0542a" }, top: { color: "#f4f6fa", style: "tee", accent: "#2b2230" }, neck: { style: "scarf", color: "#d8344e" }, legs: "#2b2f3f", shoes: "#2b2230", cheeks: true, build: "slim" },
  bbNerd: { id: "bbNerd", kind: "bobble", skin: "#f3c9a4", hair: { style: "cap", color: "#c9a13a" }, glasses: "#2b2230", top: { color: "#8fc6e8", style: "shirt" }, neck: { style: "bow", color: "#d8344e" }, legs: "#7a6a52", shoes: "#4a3528" },
  bbLady: { id: "bbLady", kind: "bobble", skin: "#e9b58c", hair: { style: "long", color: "#3a2418" }, top: { color: "#8a2f4f", style: "suit" }, legs: "#5a1f36", shoes: "#16131a", cheeks: true, build: "slim" },
  bbGent: { id: "bbGent", kind: "bobble", skin: "#f6cfae", hat: { style: "top", color: "#22252e", accent: "#8a2f3a" }, hair: { style: "side", color: "#5a3a26" }, stache: "#5a3a26", top: { color: "#33466e", style: "coat", accent: "#d8b04a" }, neck: { style: "bow", color: "#c0392b" }, legs: "#23293d", shoes: "#16131a" },
  // chibi
  storyteller: { id: "storyteller", kind: "chibi", skin: "#f6d3b8", hair: { color: "#3b2a2f", style: "short" }, top: { color: "#5f86e8", style: "hoodie" }, bottom: "#30364d" },
  kid: { id: "kid", kind: "chibi", skin: "#c98e66", hair: { color: "#1e1517", style: "bob" }, top: { color: "#f2b72f", style: "dress" }, bottom: "#5a3c2e", shoes: "#c8323a" },
  scientist: { id: "scientist", kind: "chibi", skin: "#8d5a3b", hair: { color: "#e9e4dc", style: "curly" }, top: { color: "#f4f6f8", style: "coat" }, glasses: true, bottom: "#3a4466" },
  caricature: { id: "caricature", kind: "chibi", caricature: true, skin: "#f3d0b4", hair: { color: "#6b4a35", style: "short" }, top: { color: "#2f4b8f", style: "costume", accent: "#f2f0ea" }, bottom: "#f2f0ea", hat: { style: "bicorne", color: "#1d1f2b" } },
  // flat vector
  fvBird: { id: "fvBird", kind: "flatvec", form: "bird", palette: { base: "#ff7e5f", accent: "#e2553e", beak: "#ffb347" } },
  fvPerson: { id: "fvPerson", kind: "flatvec", form: "person", palette: { base: "#3fb6b2", skin: "#f4c6a5", hair: "#2a2238", legs: "#4a5578" } },
  // microbes
  virus: { id: "virus", kind: "microbe", form: "virus", color: "#e85d75", accent: "#ffd166" },
  bacterium: { id: "bacterium", kind: "microbe", form: "bacterium", color: "#8fd16a", inner: "#c9efaa" },
  cell: { id: "cell", kind: "microbe", form: "cell", color: "#69c8d8", inner: "#c8f1f4", accent: "#7a52c7" },
  rbc: { id: "rbc", kind: "microbe", form: "rbc", color: "#e2463f" },
  wbc: { id: "wbc", kind: "microbe", form: "wbc", color: "#e8e3f4", inner: "#f7f4fc", accent: "#8b6cc8" },
  heart: { id: "heart", kind: "microbe", form: "heart", color: "#ec5460" },
  brain: { id: "brain", kind: "microbe", form: "brain", color: "#f5a8b9" },
} satisfies Record<string, KindSpec>;
export type KindPresetId = keyof typeof KIND_PRESETS;
void hash32;
