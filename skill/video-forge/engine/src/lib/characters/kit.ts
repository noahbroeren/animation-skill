/**
 * Drawing toolkit and hook contexts shared by the character modules `hair.ts`, `faces.ts` and `wardrobe.ts`.
 * `kinds.ts` builds the contexts per draw call and calls the modules; the modules never import `kinds.ts` at runtime
 * (type-only imports are fine). Canvas units: y grows DOWN; a bobble's head centre is (cx, cy), radius r, d = 2 r.
 */
export type V2 = [number, number];
export type PartOpts = { sh?: string; off?: number; stroke?: boolean; thick?: boolean; lw?: number };

/** The kinds.ts drawing helpers, bound to the current character (ink, line width, key light side). */
export type Kit = {
  g: CanvasRenderingContext2D;
  ink: string;
  /** outline width in px */
  lw: number;
  /** key light side: -1 = light from the left, +1 = from the right */
  light: number;
  /** character height unit in px */
  u: number;
  side: boolean;
  three: boolean;
  /** a cel part: fill + soft/hard crescent shade toward the shadow side + ink outline (the house way to draw a shape) */
  part(path: Path2D, fill: string, o?: PartOpts): void;
  /** an ink-outlined stroke limb through 2-3 points */
  limb(pts: V2[], w: number, col: string, o?: { ink?: boolean; curve?: boolean }): void;
  dot(x: number, y: number, r: number, col: string): void;
  ell(cx: number, cy: number, rx: number, ry: number, rot?: number): Path2D;
  rrect(x: number, y: number, w: number, h: number, r: number): Path2D;
  poly(pts: V2[], close?: boolean): Path2D;
  /** superellipse (n = 2 ellipse, n > 2 squircle) */
  sePath(cx: number, cy: number, rx: number, ry: number, n?: number): Path2D;
  moved(p: Path2D, dx: number, dy: number, sx?: number, sy?: number): Path2D;
  /** cool-shifted darker colour (k 0..1, default 0.26) */
  shade(col: string, k?: number): string;
  /** toward white (k 0..1) */
  tint(col: string, k: number): string;
  mix(a: string, b: string, t: number): string;
};

// ---------------------------------------------------------------- hair (hair.ts)
/** front = facing the camera; three = three-quarter facing +x (the face side is +x, the back of the skull -x);
 *  side = profile facing +x. `lift` raises the hairline (head radii), `n` is the head superellipse exponent (front and
 *  profile crowns should follow it), `vol` the hair mass radius in head radii (1.045 default). */
export type HairCtx = { view: "front" | "three" | "side"; cx: number; cy: number; r: number; lift: number; n: number; vol: number };
/** `front` paths are drawn over the head (ink-unioned, then strands / sheen clipped to front[0]); `back` behind it. */
export type HairOut = { front: Path2D[]; back: Path2D[] };

// ---------------------------------------------------------------- faces (faces.ts)
export type FaceBoxX = { x: number; y: number; w: number; h: number };
/** One expression. brow: degrees, + = inner end up (worry), - = inner down (anger); up: brow raise in eye heights;
 *  asym: one brow higher; eye: lid 0..1, tilt deg, bot 0..1 lower lid, size, pupil, shape ("open" | "happy" | "tight"
 *  or a faces.ts eye kind); eyeX: an eye kind for both eyes; eyeLR: per-eye kinds [screen-left, screen-right] (null =
 *  the normal eye); mouth: a kinds.ts mouth or a faces.ts mouth; fx: kinds.ts effects ("sweat", "blush", "tears",
 *  "vein", "lines") or faces.ts effects; skin: skin conditions turned on by this expression; act: body squash/scale. */
export type ExprDefX = {
  brow: number; up: number; asym?: number;
  eye?: { lid?: number; tilt?: number; bot?: number; size?: number; pupil?: number; shape?: string };
  eyeX?: string; eyeLR?: [string | null, string | null];
  mouth: string; look?: V2; fx?: string[]; skin?: string[];
  act?: { squash?: number; scale?: number };
  /** head tilt in degrees for this face (bobbles; + = toward screen right) */
  tilt?: number;
};
/** An eye drawn by faces.ts. s = -1 for the screen-left eye, +1 for the screen-right eye (the inner corner is toward the
 *  face centre); look in -1..1; dark = the eye colour; blink 0..1. */
export type EyeCtx = { x: number; y: number; rx: number; ry: number; s: number; look: V2; dark: string; ink: string; lw: number; skin: string; catchlight: boolean; blink: number; lid: number; tilt: number };
/** A mouth drawn by faces.ts at (x, y), half-width m. */
export type MouthCtx = { x: number; y: number; m: number; ink: string; lw: number; skin: string; side: boolean };
/** Face effects drawn over the face (and around the head): eyes = [x, y, s] per eye. */
export type FaceFxCtx = { box: FaceBoxX; eyes: [number, number, number][]; rx: number; ry: number; ink: string; lw: number; skin: string; side: boolean; fxDx: number; mouth: V2; mw: number; expr: string;
  /** bobbles: the head itself (centre, radius, height / width, face turn). Effects are drawn AFTER the hair and hat. */
  head?: { cx: number; cy: number; r: number; hw: number; turn: number } };
/** Skin marks and conditions, drawn INSIDE the head clip after the face fill and before eyes / brows / mouth.
 *  hw = head height / width; turn = -1..1 face turn; eyes / mouth = approximate feature centres. */
export type SkinCtx = { cx: number; cy: number; r: number; d: number; hw: number; light: number; side: boolean; three: boolean; turn: number; box: FaceBoxX; skin: string; ink: string; lw: number; eyes: V2[]; mouth: V2; head: Path2D };

// ---------------------------------------------------------------- wardrobe (wardrobe.ts)
/** Hats are drawn in hat space: origin 0.6 r above the head centre, already rotated by the hat tilt. A hat sits on
 *  the crown: the head top is at y = -0.4 r * hw (hw = head height / width, 1 for a round head). */
export type HatCtx = { style: string; color: string; accent?: string; r: number; side: boolean; three: boolean; hw: number };
/** Tops: the torso path is filled with the base colour and clipped when the hook runs. ox = the chest centre line
 *  (toward +x in profile and three-quarter), wk / wL / wR = width factors per side, sgs = the sides to draw ([1] in
 *  profile), chest = y of the chest line, hem = y of the lowest edge. line / fill / collar are the kinds.ts detail helpers. */
export type TopCtx = {
  /** the face / skin colour (for bare arms, necks and chests) */
  skin?: string;
  st: string; color: string; accent?: string; pattern?: string; patternColor?: string;
  d: number; tw: number; hw: number; yT: number; yB: number; hem: number; chest: number; ox: number; wk: number;
  sgs: number[]; wL: number; wR: number; side: boolean; three: boolean; flare: number; torso: Path2D;
  line(pts: V2[], col?: string, w?: number): void; fill(path: Path2D, col: string, stroke?: boolean): void; collar(col: string, wdt?: number, dep?: number): void;
};
/** Behind-the-body garments (capes, back packs, long robes' back panel): drawn before the far arm and the legs. */
export type TopBackCtx = { st: string; color: string; accent?: string; d: number; tw: number; yT: number; yB: number; hem: number; side: boolean; three: boolean; cx: number; cy: number; r: number };
/** Neckwear at the collar point (x, y). */
export type NeckCtx = { style: string; color: string; x: number; y: number; d: number; hw: number; tw: number; sgs: number[]; side: boolean; three: boolean };
/** Held props in hand space: origin at the hand, +x along the forearm (rotated); L = default prop length, w = limb width. */
export type PropCtx = { item: string; color?: string; L: number; w: number; d: number; open?: number };
