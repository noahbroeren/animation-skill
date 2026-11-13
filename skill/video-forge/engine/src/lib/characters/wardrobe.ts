/**
 * Extra wardrobe for bobbles: hats, tops, print patterns, neckwear, behind-the-body garments and held props.
 * kinds.ts calls these hooks first; each returns false for names it does not know so the old drawing runs.
 * House look: every shape is a cel part (fill + soft crescent + ink line), mid-saturation colours, no detail thinner
 * than about half the outline (a head is ~110 px on a phone). Deterministic: no Math.random anywhere.
 */
import type { HatCtx, Kit, NeckCtx, PropCtx, TopBackCtx, TopCtx, V2 } from "./kit";

export const HAT_X = [
  "pirate", "helmet", "knight", "astronaut", "cowboy", "wizard", "nurse", "firefighter", "grad", "headband", "hood",
  "viking", "party", "sombrero", "flowers", "headphones", "bandana", "turban", "hijab", "fez", "tiara", "propeller",
  "police", "captain", "sunhat", "bucket", "earmuffs", "horns", "halo",
  "toque", "chefcap", "beaniePom", "flatcap", "derby", "jester", "crownSmall", "miner", "safari", "santa", "witch", "elf",
  "nemes", "roman", "kabuto", "ushanka", "deerstalker", "paperhat", "beekeeper", "divemask", "goggles", "bunny", "catears",
  "antlers", "mortarboard", "fedora", "backcap", "visor", "nightcap", "bow", "laurel", "bonnet", "tricorn", "sailorcap",
] as const;
export type HatX = (typeof HAT_X)[number];
export const TOP_X = [
  "armor", "robe", "scrubs", "tank", "sweater", "cardigan", "kimono", "spacesuit", "tux", "hawaiian", "jersey",
  "labcoat", "trench", "puffer", "poncho", "cape", "toga", "sailor", "chefcoat", "turtleneck",
  "polo", "blazer", "tunic", "supersuit", "varsity", "waistcoat", "bathrobe", "pajamas", "hazmat", "wetsuit", "judge",
  "monk", "pharaoh", "chainmail", "barista", "coverall", "raincoat", "suspenders", "gown", "hivis", "pilot", "caveman",
  "royal", "cloak",
] as const;
export type TopX = (typeof TOP_X)[number];
export const PATTERN_X = ["stripes", "hstripes", "dots", "plaid", "check", "flowers", "camo", "stars", "number",
  "zigzag", "hearts", "argyle", "pinstripe", "diagonal", "spots", "waves", "leaves", "ringer"] as const;
export type PatternX = (typeof PATTERN_X)[number];
export const NECK_X = ["necklace", "pearls", "medal", "lanyard", "bandanaNeck", "collar",
  "ruff", "chain", "whistle", "stethoscope", "ascot", "bolo", "lei", "neckerchief", "scarfLong", "headphonesNeck", "amulet", "key"] as const;
export type NeckX = (typeof NECK_X)[number];
export const PROP_X = [
  "book", "wrench", "sword", "shield", "umbrella", "briefcase", "camera", "magnifier", "guitar", "mic", "broom",
  "pizza", "ball", "torch", "pen", "map", "money", "trophy", "bouquet", "laptop", "clipboard", "baguette", "wand",
  "selfie", "coffee", "shopping", "newspaper", "scroll", "crystalball", "potion", "bone", "fish", "carrot", "apple",
  "icecream", "balloon", "flashlight", "pickaxe", "shovel", "rake", "fishingrod", "paintbrush", "palette", "megaphone",
  "gavel", "medkit", "calculator", "tablet", "remote", "gift", "lantern", "oar", "spatula", "rollingpin", "pan", "ladle",
  "whisk", "mug", "sign", "letter", "key", "candle", "hourglass", "lightbulb", "magnet", "flask", "testtube", "globe",
  "telescope", "binoculars", "suitcase", "toolbox", "racket", "lollipop", "rose", "tray", "bell", "net", "stopwatch",
  "banana", "donut", "teddy", "basket", "wateringcan", "plant", "ticket", "parcel", "scanner",
] as const;
export type PropX = (typeof PROP_X)[number];

/** Extra card height for hats, in head diameters above the head (default 0.2). */
export const HAT_X_HX: Partial<Record<string, number>> = {
  pirate: 0.3, helmet: 0.2, knight: 0.45, astronaut: 0.25, cowboy: 0.3, wizard: 0.66, nurse: 0.12, firefighter: 0.26, grad: 0.2,
  headband: 0.04, hood: 0.16, viking: 0.36, party: 0.55, sombrero: 0.4, flowers: 0.12, headphones: 0.12, bandana: 0.08, turban: 0.32,
  hijab: 0.1, fez: 0.24, tiara: 0.22, propeller: 0.34, police: 0.24, captain: 0.24, sunhat: 0.2, bucket: 0.12, earmuffs: 0.1,
  horns: 0.3, halo: 0.34, toque: 0.72, chefcap: 0.14, beaniePom: 0.3, flatcap: 0.1, derby: 0.3, jester: 0.44, crownSmall: 0.3,
  miner: 0.14, safari: 0.3, santa: 0.3, witch: 0.66, elf: 0.4, nemes: 0.14, roman: 0.5, kabuto: 0.48, ushanka: 0.28, deerstalker: 0.18,
  paperhat: 0.34, beekeeper: 0.24, divemask: 0.3, goggles: 0.1, bunny: 0.66, catears: 0.3, antlers: 0.46, mortarboard: 0.2, fedora: 0.26,
  backcap: 0.08, visor: 0.04, nightcap: 0.24, bow: 0.2, laurel: 0.08, bonnet: 0.14, tricorn: 0.26, sailorcap: 0.16,
};
/** Tops with a hem below the hips (in head diameters) and a flared skirt (x the torso half-width). */
export const TOP_X_HEM: Partial<Record<string, number>> = {
  robe: 0.72, kimono: 0.5, toga: 0.3, labcoat: 0.28, trench: 0.32, poncho: 0.12, cloak: 0.55, judge: 0.62, monk: 0.72, bathrobe: 0.4,
  royal: 0.62, gown: 0.85, tunic: 0.22, pharaoh: 0.25, raincoat: 0.22, chainmail: 0.15, caveman: 0.18,
};
export const TOP_X_FLARE: Partial<Record<string, number>> = {
  robe: 1.28, kimono: 1.08, toga: 1.1, poncho: 1.38, cloak: 1.18, judge: 1.22, monk: 1.25, bathrobe: 1.12, royal: 1.25, gown: 1.5,
  puffer: 1.1, tunic: 1.08, pharaoh: 1.05, trench: 1.08, labcoat: 1.04, raincoat: 1.08,
};
/** Tops with short sleeves (sleeve mode shows skin forearms). */
export const TOP_X_SHORT: string[] = ["scrubs", "tank", "hawaiian", "jersey", "toga", "pharaoh", "caveman", "polo", "supersuit"];

// ================================================================ drawing helpers
const TAU = Math.PI * 2;
type PO = { close?: boolean; dx?: number; dy?: number; sx?: number; sy?: number };
/** A path from a compact list (units x s): first = moveTo, [x,y] lineTo, [cx,cy,x,y] quadratic, [c1x,c1y,c2x,c2y,x,y] bezier.
 *  sx / sy scale and dx / dy shift the points (in list units) before s. */
function P(pts: number[][], s = 1, o: PO = {}): Path2D {
  const p = new Path2D(), sx = o.sx ?? 1, sy = o.sy ?? 1, dx = o.dx ?? 0, dy = o.dy ?? 0;
  const X = (v: number) => (v * sx + dx) * s, Y = (v: number) => (v * sy + dy) * s;
  pts.forEach((q, i) => {
    if (i === 0) p.moveTo(X(q[0]), Y(q[1]));
    else if (q.length === 2) p.lineTo(X(q[0]), Y(q[1]));
    else if (q.length === 4) p.quadraticCurveTo(X(q[0]), Y(q[1]), X(q[2]), Y(q[3]));
    else p.bezierCurveTo(X(q[0]), Y(q[1]), X(q[2]), Y(q[3]), X(q[4]), Y(q[5]));
  });
  if (o.close !== false) p.closePath();
  return p;
}
/** translate + rotate (radians) + scale a path */
const xf = (p: Path2D, dx: number, dy: number, s = 1, rot = 0, sy = s) => { const q = new Path2D(); q.addPath(p, new DOMMatrix().translate(dx, dy).rotate((rot * 180) / Math.PI).scale(s, sy)); return q; };
function stroke(k: Kit, p: Path2D, col: string, w: number) { const g = k.g; g.save(); g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = col; g.lineWidth = Math.max(0.5, w); g.stroke(p); g.restore(); }
/** an inked band: ink underlay (ik x the outline width per side), colour on top */
function inkStroke(k: Kit, p: Path2D, w: number, col: string, ik = 1) { stroke(k, p, k.ink, w + 2 * k.lw * ik); stroke(k, p, col, w); }
function fillP(k: Kit, p: Path2D, col: string) { k.g.fillStyle = col; k.g.fill(p); }
function fs(k: Kit, p: Path2D, col: string, lk = 0.75) { fillP(k, p, col); stroke(k, p, k.ink, k.lw * lk); }
function clip(k: Kit, p: Path2D, fn: () => void) { k.g.save(); k.g.clip(p); fn(); k.g.restore(); }
/** union of shapes with one outer ink line */
function union(k: Kit, ps: Path2D[], col: string, lk = 1) { const g = k.g; g.save(); g.lineJoin = "round"; g.strokeStyle = k.ink; g.lineWidth = k.lw * 2 * lk; for (const q of ps) g.stroke(q); g.fillStyle = col; for (const q of ps) g.fill(q); g.restore(); }
function starP(cx: number, cy: number, ro: number, ri: number, n = 5, rot = -Math.PI / 2, sx = 1): Path2D {
  const p = new Path2D();
  for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, q = i % 2 ? ri : ro; const x = cx + Math.cos(a) * q * sx, y = cy + Math.sin(a) * q; if (i) p.lineTo(x, y); else p.moveTo(x, y); }
  p.closePath(); return p;
}
/** an elliptical ring (outer clockwise, inner hole anticlockwise) */
function ringP(cx: number, cy: number, rx: number, ry: number, ix: number, iy: number): Path2D {
  const p = new Path2D(); p.ellipse(cx, cy, rx, ry, 0, 0, TAU); p.moveTo(cx + ix, cy); p.ellipse(cx, cy, ix, iy, 0, TAU, 0, true); return p;
}
/** a scalloped (fur / ruff / cloud) ellipse */
function fuzzP(cx: number, cy: number, rx: number, ry: number, n = 12, amp = 0.16, rot = 0): Path2D {
  const p = new Path2D();
  for (let i = 0; i <= n; i++) {
    const a = rot + (i / n) * TAU, x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    if (!i) { p.moveTo(x, y); continue; }
    const m = rot + ((i - 0.5) / n) * TAU; p.quadraticCurveTo(cx + Math.cos(m) * rx * (1 + amp * 2), cy + Math.sin(m) * ry * (1 + amp * 2), x, y);
  }
  p.closePath(); return p;
}
function heartP(cx: number, cy: number, s: number): Path2D {
  return P([[0, 0.35], [-0.55, -0.05, -0.5, -0.32], [-0.42, -0.58, 0, -0.38], [0.42, -0.58, 0.5, -0.32], [0.55, -0.05, 0, 0.35]], s, { dx: cx / s, dy: cy / s });
}
/** five round petals around a centre */
function flower(k: Kit, x: number, y: number, rr: number, col: string, mid = "#f2c94c", lk = 0.7) {
  const ps: Path2D[] = []; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * TAU) / 5; ps.push(k.ell(x + Math.cos(a) * rr * 0.55, y + Math.sin(a) * rr * 0.55, rr * 0.48, rr * 0.48)); }
  union(k, ps, col, lk); k.dot(x, y, rr * 0.3, mid);
}
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** deterministic pseudo-random sequence (LCG) */
const seq = (seed: number) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const lum = (hex: string) => { const h = hex.replace("#", ""), n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const contrast = (k: Kit, c: string) => (lum(c) < 0.5 ? k.tint(c, 0.62) : k.shade(c, 0.42));
/** text that never reads mirrored (the canvas is flipped for characters facing left) */
function label(k: Kit, s: string, x: number, y: number, size: number, col: string, outline = true, sx = 1) {
  const g = k.g; g.save(); g.translate(x, y); const m = g.getTransform(); if (m.a * m.d - m.b * m.c < 0) g.scale(-1, 1); g.scale(sx, 1);
  g.font = `900 ${Math.max(4, size).toFixed(1)}px "Arial Black", Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  if (outline) { g.lineJoin = "round"; g.strokeStyle = k.ink; g.lineWidth = k.lw * 1.5; g.strokeText(s, 0, size * 0.04); }
  g.fillStyle = col; g.fillText(s, 0, size * 0.04); g.restore();
}
/** rotate the context so local y points straight down on screen (props that stay upright whatever the forearm does) */
function up(k: Kit) { const m = k.g.getTransform(), det = m.a * m.d - m.b * m.c || 1; k.g.rotate(Math.atan2(m.c / det, m.a / det)); }
const GOLD = "#e6b84a", STEEL = "#b9c1cc", WOOD = "#9a6a3c", CREAM = "#f4efe6", PAPER = "#fbfaf6", INKD = "#2b2f3a";

// ================================================================ hats (hat space, units of r)
type HE = {
  k: Kit; g: CanvasRenderingContext2D; r: number; c: string; a?: string; side: boolean; three: boolean; hw: number;
  /** head centre y and head top y (units of r); fc = x of the hat's front centre for badges (0 / 0.32 / 0.62) */
  hc: number; ht: number; fc: number; off: number;
  Q(pts: number[][], o?: PO): Path2D; E(x: number, y: number, rx: number, ry: number, rot?: number): Path2D; R(x: number, y: number, w: number, h: number, rr: number): Path2D;
  D(rx: number, ry: number, y?: number, x?: number): Path2D; pt(p: Path2D, col: string, o?: number, thick?: boolean): void;
  fs(p: Path2D, col: string, lk?: number): void; sk(p: Path2D, col: string, wk: number): void; dot(x: number, y: number, rr: number, col: string): void;
};
/** a band over the head (headphones, alice bands): superellipse arc `lift` above the head, ends `cut` rad above the head centre */
function overBand(e: HE, lift: number, cut = 0.2): Path2D {
  const p = new Path2D(), N = 30, n = 2.6, rx = (1 + lift) * e.r, ry = (e.hw + lift) * e.r;
  if (e.side) { p.moveTo(-0.3 * e.r, (e.hc - 0.26) * e.r); p.quadraticCurveTo(-0.36 * e.r, (e.ht + 0.05) * e.r, -0.2 * e.r, (e.ht - lift) * e.r); return p; }
  if (e.three) { p.moveTo(-0.62 * e.r, (e.hc - 0.24) * e.r); p.quadraticCurveTo(0.12 * e.r, (e.ht - 0.95 - lift) * e.r, 0.98 * e.r, (e.hc - 0.22) * e.r); return p; }
  for (let i = 0; i <= N; i++) { const a = Math.PI + cut + (i / N) * (Math.PI - 2 * cut), cs = Math.cos(a), sn = Math.sin(a); const x = Math.sign(cs) * Math.abs(cs) ** (2 / n) * rx, y = e.hc * e.r + Math.sign(sn) * Math.abs(sn) ** (2 / n) * ry; if (i) p.lineTo(x, y); else p.moveTo(x, y); }
  return p;
}
/** where an alice band carries ears / antlers: [x, y, tilt, scale] per side (front, three-quarter, profile) */
const bandSpots = (e: HE): [number, number, number, number][] => e.side ? [[-0.38, e.ht - 0.02, -0.2, 0.86], [-0.1, e.ht - 0.08, 0.05, 1]] : e.three ? [[-0.42, e.ht + 0.04, -0.32, 1], [0.52, e.ht + 0.0, 0.25, 0.84]] : [[-0.5, e.ht + 0.06, -0.3, 1], [0.5, e.ht + 0.06, 0.3, 1]];
function skull(e: HE, x: number, y: number, s = 1) {
  const { k, r } = e, bone = (x0: number, y0: number, x1: number, y1: number) => inkStroke(k, P([[x0, y0], [x1, y1]], r, { close: false }), r * 0.075 * s, CREAM, 0.55);
  bone(x - 0.24 * s, y + 0.2 * s, x + 0.24 * s, y - 0.12 * s); bone(x + 0.24 * s, y + 0.2 * s, x - 0.24 * s, y - 0.12 * s);
  e.pt(e.E(x, y, 0.15 * s, 0.14 * s), CREAM, 0); e.pt(e.R(x - 0.08 * s, y + 0.07 * s, 0.16 * s, 0.08 * s, 0.03 * s), CREAM, 0);
  for (const sg of [-1, 1]) e.dot(x + sg * 0.055 * s, y - 0.01 * s, 0.042 * s, e.k.ink);
}
/** peaked caps (police, captain): crown, dark band, glossy visor, badge */
function peaked(e: HE, crownC: string, bandC: string, badge: string, cord?: string) {
  const { side, three, Q, pt, fs, k, r } = e, vis = "#1d2028";
  const crown = side ? Q([[-0.86, 0.04], [-0.88, -0.22], [-1.22, -0.38, -1.02, -0.6], [0.2, -0.86, 0.98, -0.56], [1.02, -0.4, 0.76, -0.22], [0.76, 0.04]])
    : Q([[-0.82, 0.04], [-0.82, -0.22], [-1.16, -0.4, -1.06, -0.6], [0, -0.86, 1.06, -0.6], [1.16, -0.4, 0.82, -0.22], [0.82, 0.04]], { dx: three ? 0.04 : 0 });
  pt(crown, crownC, 1, true);
  const band = side ? Q([[-0.88, -0.26], [0.78, -0.26], [0.76, 0.04], [-0.86, 0.04]]) : e.R(-0.84 + (three ? 0.04 : 0), -0.26, 1.68, 0.3, 0.04);
  pt(band, bandC, 0);
  if (cord) stroke(k, side ? Q([[-0.6, -0.16], [0.7, -0.16]], { close: false }) : Q([[-0.7, -0.16], [0, -0.1, 0.7, -0.16]], { close: false, dx: three ? 0.1 : 0 }), cord, r * 0.06);
  const visor = side ? Q([[0.5, -0.02], [1.15, -0.02, 1.34, 0.17], [0.9, 0.16, 0.5, 0.1]]) : three ? Q([[-0.42, 0.02], [0.4, 0.3, 1.06, 0.0], [0.4, 0.13, -0.42, 0.02]]) : Q([[-0.82, 0.02], [0, 0.3, 0.82, 0.02], [0, 0.13, -0.82, 0.02]]);
  pt(visor, vis, 0); stroke(k, side ? Q([[0.7, 0.04], [1.05, 0.06, 1.2, 0.13]], { close: false }) : Q([[-0.4, 0.08], [0, 0.17, 0.4, 0.08]], { close: false, dx: three ? 0.3 : 0 }), "rgba(255,255,255,0.45)", r * 0.05);
  const bx = e.fc * (side ? 1.1 : 1), sx = side ? 0.5 : three ? 0.82 : 1;
  fs(P([[-0.15, -0.16], [0.15, -0.16], [0.15, 0.02], [0.13, 0.13, 0, 0.18], [-0.13, 0.13, -0.15, 0.02]], r, { dx: bx, dy: -0.42, sx }), badge, 0.7);
}

const HATS: Record<HatX, (e: HE) => void> = {
  pirate: (e) => {
    const { r, c, side, three, Q, pt, sk, k } = e, gold = e.a ?? "#e0b24a", o = { sx: side ? 0.8 : three ? 0.94 : 1, dx: side ? -0.06 : three ? 0.08 : 0 };
    const hat = Q([[-1.35, -0.3], [-0.7, 0.2, 0, 0.14], [0.7, 0.2, 1.35, -0.3], [1.0, -1.18, 0, -0.92], [-1.0, -1.18, -1.35, -0.3]], o);
    pt(hat, c, 1, true);
    clip(k, hat, () => stroke(k, Q([[-1.42, -0.3], [-0.7, 0.26, 0, 0.2], [0.7, 0.26, 1.42, -0.3]], { ...o, close: false }), gold, r * 0.2));
    sk(Q([[-1.3, -0.28], [-0.7, 0.13, 0, 0.07], [0.7, 0.13, 1.3, -0.28]], { ...o, close: false }), k.ink, 0.7);
    if (!side) skull(e, three ? 0.32 : 0, -0.5, 1.05);
  },
  helmet: (e) => {
    const { c, side, three, Q, E, R, D, pt, fs, k } = e, a = e.a ?? CREAM;
    const shell = side ? Q([[-1.18, 0.16], [-1.3, -0.8, -0.1, -0.82], [0.9, -0.82, 1.06, 0.06], [0.7, 0.16]]) : D(1.05, 0.92, 0.14, three ? 0.03 : 0);
    pt(shell, c, 1, true);
    clip(k, shell, () => {
      if (side) fillP(k, Q([[-1.3, -0.3], [-0.2, -1.05, 1.15, -0.32], [1.15, -0.12], [-0.2, -0.8, -1.3, -0.08]]), a);
      else { const sx = three ? 0.32 : 0; fillP(k, Q([[sx - 0.14, 0.2], [sx - 0.14, -0.95], [sx + 0.14, -0.95], [sx + 0.14, 0.2]]), a); }
      for (const vx of side ? [-0.62, -0.05] : three ? [-0.42, 0.72] : [-0.55, 0.55]) fs(R(vx - 0.1, -0.62, 0.2, 0.3, 0.09), k.shade(c, 0.45), 0.6);
    });
    pt(side ? E(1.02, 0.1, 0.38, 0.08, 0.15) : three ? E(0.42, 0.13, 0.66, 0.09) : E(0, 0.13, 0.74, 0.09), k.shade(c, 0.25), 0);
  },
  knight: (e) => {
    const { c, side, three, hc, Q, pt, sk, dot, k } = e, a = e.a ?? "#c8372d", B = hc + 0.42;
    const plume = side ? Q([[-0.1, -0.58], [-0.1, -1.22, -0.75, -1.18], [-1.25, -1.08, -1.45, -0.55], [-0.95, -0.86, -0.3, -0.5]])
      : Q([[0.08, -0.6], [0.32, -1.22, -0.25, -1.3], [-0.72, -1.26, -0.98, -0.86], [-0.56, -0.98, -0.12, -0.6]], { dx: three ? 0.12 : 0 });
    pt(plume, a, 1);
    sk(side ? Q([[-0.2, -0.65], [-0.5, -1.0, -1.15, -0.85]], { close: false }) : Q([[0, -0.68], [-0.15, -1.05, -0.7, -1.02]], { close: false, dx: three ? 0.12 : 0 }), k.shade(a, 0.35), 0.8);
    const shell = side ? Q([[-1.12, B], [-1.14, -0.1], [-1.14, -0.7, -0.1, -0.7], [0.92, -0.7, 1.04, 0.08], [0.2, 0.08], [0.16, B]])
      : three ? Q([[-1.1, B], [-1.12, -0.1], [-1.12, -0.68, 0.02, -0.68], [1.12, -0.68, 1.12, -0.1], [1.1, B], [0.95, B], [0.95, 0.28], [0.95, 0.08, 0.7, 0.08], [-0.2, 0.08], [-0.44, 0.08, -0.44, 0.28], [-0.44, B]])
      : Q([[-1.1, B], [-1.12, -0.1], [-1.12, -0.68, 0, -0.68], [1.12, -0.68, 1.12, -0.1], [1.1, B], [0.72, B], [0.72, 0.3], [0.72, 0.08, 0.45, 0.08], [-0.45, 0.08], [-0.72, 0.08, -0.72, 0.3], [-0.72, B]]);
    pt(shell, c, 1, true);
    clip(k, shell, () => sk(side ? Q([[-1.0, -0.4], [-0.1, -0.9, 0.9, -0.3]], { close: false }) : Q([[e.fc, -0.7], [e.fc, 0.06]], { close: false }), k.tint(c, 0.5), 1.6));
    for (const [x, y] of side ? [[0.3, 0.2], [0.26, 0.55]] : three ? [[-0.34, 0.25], [-0.34, 0.6], [0.88, 0.25]] : [[-0.62, 0.25], [-0.62, 0.6], [0.62, 0.25], [0.62, 0.6]]) dot(x, y + (hc - 0.6) * 0.5, 0.045, k.shade(c, 0.4));
  },
  astronaut: (e) => {
    const { r, c, hc, k, g, pt, R } = e, y0 = (hc + 0.06) * r, RR = 1.36 * r, gl = k.ell(0, y0, RR, RR);
    fillP(k, gl, "rgba(168,212,255,0.22)");
    clip(k, gl, () => {
      const q = new Path2D(); q.arc(0, y0, RR * 0.8, Math.PI * 1.1, Math.PI * 1.38); stroke(k, q, "rgba(255,255,255,0.8)", r * 0.11);
      k.dot(Math.cos(Math.PI * 1.47) * RR * 0.8, y0 + Math.sin(Math.PI * 1.47) * RR * 0.8, r * 0.06, "rgba(255,255,255,0.8)");
      g.fillStyle = "rgba(255,255,255,0.14)"; g.fill(k.ell(RR * 0.5, y0 + RR * 0.45, RR * 0.6, RR * 0.4, -0.6));
    });
    stroke(k, gl, k.ink, k.lw * 1.15);
    pt(R(-1.04, hc + 1.06, 2.08, 0.38, 0.17), c, 0.6, true);
    stroke(k, P([[-0.9, hc + 1.25], [0.9, hc + 1.25]], r, { close: false }), k.shade(c, 0.3), k.lw * 0.7);
  },
  cowboy: (e) => {
    const { c, side, three, Q, pt, k } = e, band = e.a ?? k.shade(c, 0.5), dx = side ? -0.05 : three ? 0.05 : 0;
    pt(Q([[-0.7, 0.02], [-0.6, -0.78], [-0.55, -1.0, -0.25, -0.95], [0, -0.8, 0.25, -0.95], [0.55, -1.0, 0.6, -0.78], [0.7, 0.02]], { dx }), c, 1, true);
    pt(Q([[-0.67, -0.1], [0.67, -0.1], [0.65, -0.28], [-0.65, -0.28]], { dx }), band, 0);
    pt(side ? Q([[-1.5, -0.2], [-1.0, 0.02, 0, 0.02], [1.0, 0.02, 1.55, -0.12], [1.0, 0.17, 0, 0.17], [-1.0, 0.17, -1.5, -0.2]])
      : Q([[-1.6, -0.38], [-1.25, -0.02, 0, -0.02], [1.25, -0.02, 1.6, -0.38], [1.35, 0.18, 0, 0.16], [-1.35, 0.18, -1.6, -0.38]], { dx: three ? 0.06 : 0 }), c, 0.6, true);
  },
  wizard: (e) => {
    const { c, side, Q, E, pt, k, r } = e, a = e.a ?? "#f2c94c", sx = side ? -1 : 1;
    const cone = Q([[-0.8, 0.02], [-0.45, -0.7, -0.12, -1.35], [0.05, -1.62, 0.5, -1.72], [0.25, -1.45, 0.22, -1.25], [0.4, -0.6, 0.8, 0.02]], { sx });
    pt(cone, c, 1, true);
    clip(k, cone, () => { fillP(k, Q([[-0.9, -0.08], [0.9, -0.08], [0.9, -0.3], [-0.9, -0.3]]), a); stroke(k, Q([[-0.9, -0.08], [0.9, -0.08]], { close: false }), k.ink, k.lw * 0.7); stroke(k, Q([[-0.9, -0.3], [0.9, -0.3]], { close: false }), k.ink, k.lw * 0.7); });
    e.fs(starP(0.05 * r * sx, -0.72 * r, 0.17 * r, 0.075 * r), a, 0.7); e.fs(starP(-0.3 * r * sx, -0.5 * r, 0.09 * r, 0.04 * r), a, 0.6); e.fs(starP(0.12 * r * sx, -1.1 * r, 0.1 * r, 0.045 * r), a, 0.6);
    pt(E(0, 0.05, 1.4, 0.19), c, 0.5, true);
  },
  nurse: (e) => {
    const { c, side, three, Q, pt, fs, k, r } = e, a = e.a ?? "#2f8fbf", o = side ? { sx: 0.7, dx: 0.12 } : { dx: three ? 0.12 : 0 };
    const cap = Q([[-0.74, 0.02], [0.74, 0.02], [0.6, -0.52], [-0.6, -0.52]], o);
    pt(cap, c, 0.6, true);
    clip(k, cap, () => fillP(k, Q([[-0.8, -0.12], [0.8, -0.12], [0.8, 0.05], [-0.8, 0.05]]), k.shade(c, 0.1)));
    stroke(k, Q([[-0.74, -0.12], [0.74, -0.12]], { ...o, close: false }), k.ink, k.lw * 0.7);
    if (!side) { const x = (three ? 0.18 : 0) * r, y = -0.33 * r, s = r * 0.1; fs(P([[-1, -0.35], [-0.35, -0.35], [-0.35, -1], [0.35, -1], [0.35, -0.35], [1, -0.35], [1, 0.35], [0.35, 0.35], [0.35, 1], [-0.35, 1], [-0.35, 0.35], [-1, 0.35]], s, { dx: x / s, dy: y / s }), a, 0.6); }
  },
  firefighter: (e) => {
    const { c, side, three, Q, E, D, pt, fs, k, r } = e, a = e.a ?? GOLD;
    const shield = (o: PO) => fs(Q([[-0.3, -0.12], [-0.32, -0.6], [-0.32, -0.86, 0, -0.88], [0.32, -0.86, 0.32, -0.6], [0.3, -0.12], [0, 0.0]], o), a);
    if (side) {
      pt(Q([[-1.6, 0.36], [-1.2, 0.04, -0.4, 0.05], [0.8, 0.05], [1.06, 0.06, 1.06, 0.14], [-0.3, 0.2], [-1.1, 0.22, -1.6, 0.36]]), c, 0.6, true);
      pt(D(1.0, 0.84, 0.06, -0.08), c, 1, true);
      clip(k, D(1.0, 0.84, 0.06, -0.08), () => stroke(k, Q([[-1.05, -0.2], [-0.3, -1.05, 0.9, -0.3]], { close: false }), k.tint(c, 0.3), r * 0.12));
      shield({ sx: 0.42, dx: 0.74 });
      return;
    }
    const dx = three ? 0.05 : 0;
    pt(E(dx, 0.07, 1.36, 0.17), c, 0.5, true);
    pt(D(1.0, 0.84, 0.06, dx), c, 1, true);
    clip(k, D(1.0, 0.84, 0.06, dx), () => stroke(k, Q([[dx, -0.85], [dx, 0.1]], { close: false }), k.tint(c, 0.3), r * 0.12));
    pt(Q([[-1.36, 0.07], [0, 0.42, 1.36, 0.07], [0, 0.18, -1.36, 0.07]], { dx }), c, 0, false);
    const sx = three ? 0.82 : 1;
    shield({ sx, dx: e.fc });
    fs(E(e.fc, -0.48, 0.13 * sx, 0.13), k.shade(c, 0.05), 0.6);
  },
  grad: (e) => HATS.mortarboard(e),
  mortarboard: (e) => {
    const { c, side, three, Q, D, pt, k, r } = e, a = e.a ?? GOLD;
    pt(D(0.9, 0.52, 0.06), c, 0.6, true);
    if (side) {
      pt(Q([[-0.95, -0.5], [0.98, -0.62], [0.98, -0.52], [-0.95, -0.4]]), c, 0, true);
      inkStroke(k, Q([[0.1, -0.56], [0.9, -0.54], [0.95, -0.1]], { close: false }), r * 0.05, a, 0.5);
    } else {
      const o = { dx: three ? 0.08 : 0, sx: three ? 0.95 : 1 };
      pt(Q([[-1.3, -0.44], [-0.05, -0.2], [1.3, -0.44], [1.3, -0.36], [-0.05, -0.12], [-1.3, -0.36]], o), k.shade(c, 0.25), 0);
      pt(Q([[-1.3, -0.44], [0.05, -0.68], [1.3, -0.44], [-0.05, -0.2]], o), c, 0.4, true);
      e.dot(o.dx, -0.44, 0.07, a);
      inkStroke(k, Q([[0, -0.44], [0.9, -0.36], [0.98, 0.0]], { close: false, dx: o.dx }), r * 0.05, a, 0.5);
    }
    const tx = side ? 0.95 : (three ? 0.08 : 0) + 0.98;
    pt(e.R(tx - 0.08, -0.06, 0.16, 0.3, 0.06), a, 0);
  },
  headband: (e) => {
    const { c, side, three, Q, pt, k, r } = e, a = e.a ?? CREAM;
    const b = side ? Q([[-1.02, 0.02], [0, -0.14, 1.0, -0.04], [1.0, 0.18], [0, 0.06, -1.02, 0.24]]) : Q([[-1.0, 0.0], [0, -0.24, 1.0, 0.0], [1.0, 0.22], [0, 0.0, -1.0, 0.22]], { dx: three ? 0.03 : 0 });
    pt(b, c, 0.3);
    clip(k, b, () => stroke(k, side ? Q([[-1.02, 0.12], [0, -0.03, 1.0, 0.07]], { close: false }) : Q([[-1.0, 0.11], [0, -0.12, 1.0, 0.11]], { close: false }), a, r * 0.07));
  },
  hood: (e) => {
    const { c, side, three, hc, ht, r, k, pt } = e, Q = (pts: number[][]) => P(pts, r);
    if (side) {
      pt(Q([[0.66, ht - 0.04], [-0.2, ht - 0.4, -1.32, hc - 0.7, -1.3, hc + 0.2], [-1.26, hc + 0.95, -0.95, hc + 1.36, -0.45, hc + 1.55], [0.55, hc + 1.45], [0.0, hc + 1.0, -0.02, hc + 0.4], [-0.02, ht + 0.18, 0.66, ht - 0.04]]), c, 1, true);
      stroke(k, P([[0.5, hc + 1.4], [0.04, hc + 0.98, 0.04, hc + 0.4], [0.04, ht + 0.25, 0.6, ht + 0.02]], r, { close: false }), k.shade(c, 0.3), k.lw * 0.9);
      return;
    }
    const ox = three ? 0.3 : 0, rw = three ? 0.92 : 1;
    const outer = Q([[0, ht - 0.28], [0.85 * rw, ht - 0.28, 1.25, hc - 0.55, 1.25, hc + 0.15], [1.25, hc + 0.85, 1.2, hc + 1.2, 1.05, hc + 1.5], [-1.05, hc + 1.5], [-1.2, hc + 1.2, -1.25, hc + 0.85, -1.25, hc + 0.15], [-1.25, hc - 0.55, -0.85, ht - 0.28, 0, ht - 0.28]]);
    outer.moveTo((ox + 0.8) * r, (hc + 0.18) * r); outer.ellipse(ox * r, (hc + 0.18) * r, 0.8 * r, 0.93 * r, 0, TAU, 0, true);
    pt(outer, c, 1, true);
    pt(ringP(ox * r, (hc + 0.18) * r, 0.9 * r, 1.02 * r, 0.8 * r, 0.93 * r), k.shade(c, 0.28), 0);
  },
  viking: (e) => {
    const { c, side, three, Q, R, D, pt, dot, k } = e, a = e.a ?? "#efe4c8";
    const horn = Q([[0.82, -0.1], [1.5, -0.25, 1.52, -1.1], [1.3, -0.55, 0.8, -0.5]]);
    if (side) { const h = Q([[-0.32, -0.28], [0.6, -0.36, 0.62, -1.25], [0.32, -0.66, -0.2, -0.68]]); pt(xf(h, -0.34 * e.r, 0.06 * e.r), k.shade(a, 0.2), 0.6); pt(h, a, 1); }
    else if (three) { pt(xf(horn, -0.1 * e.r, 0.04 * e.r, 0.82), k.shade(a, 0.15), 0.8); pt(xf(horn, -0.05 * e.r, 0, -1, 0, 1), a, 1); }
    else for (const s of [-1, 1]) pt(xf(horn, 0, 0, s, 0, 1), a, 1);
    pt(D(0.98, 0.86, 0.1), c, 1, true);
    clip(k, D(0.98, 0.86, 0.1), () => fillP(k, R(e.fc - 0.07, -0.8, 0.14, 0.8, 0), k.tint(c, 0.3)));
    pt(R(-0.99, -0.12, 1.98, 0.22, 0.06), k.shade(c, 0.22), 0);
    for (const x of side ? [-0.7, -0.2, 0.3, 0.75] : three ? [-0.65, -0.15, 0.35, 0.8] : [-0.6, -0.2, 0.2, 0.6]) dot(x, -0.01, 0.045, k.tint(c, 0.4));
  },
  party: (e) => {
    const { c, Q, pt, k, r } = e, a = e.a ?? "#f2c94c";
    const cone = Q([[-0.46, 0.02], [0.46, 0.02], [0.1, -1.3], [0.0, -1.36, -0.08, -1.3]], { dx: e.three ? 0.06 : 0 });
    pt(cone, c, 0.7, true);
    clip(k, cone, () => { for (const y of [-0.12, -0.52, -0.92]) fillP(k, Q([[-0.6, y + 0.12], [0.6, y - 0.08], [0.6, y - 0.24], [-0.6, y - 0.04]]), a); });
    stroke(k, cone, k.ink, k.lw);
    pt(fuzzP(0.03 * r, -1.38 * r, 0.16 * r, 0.15 * r, 9, 0.12), CREAM, 0);
  },
  sombrero: (e) => {
    const { c, side, Q, E, pt, k, r } = e, a = e.a ?? "#c8372d", brim = E(0, 0.06, side ? 1.75 : 1.9, 0.27);
    pt(brim, c, 0.5, true);
    clip(k, brim, () => stroke(k, brim, a, r * 0.16));
    stroke(k, brim, k.ink, k.lw);
    const crown = Q([[-0.6, 0.02], [-0.62, -0.85, -0.25, -1.08], [0, -1.18, 0.25, -1.08], [0.62, -0.85, 0.6, 0.02]]);
    pt(crown, c, 1, true);
    clip(k, crown, () => { fillP(k, Q([[-0.9, -0.12], [0.9, -0.12], [0.9, -0.34], [-0.9, -0.34]]), a); const z: number[][] = [[-0.7, -0.17]]; for (let i = 1; i <= 10; i++) z.push([-0.7 + i * 0.14, i % 2 ? -0.29 : -0.17]); stroke(k, Q(z, { close: false }), CREAM, r * 0.05); });
    stroke(k, crown, k.ink, k.lw);
    pt(Q([[-1.9, 0.06], [0, 0.56, 1.9, 0.06], [0, 0.22, -1.9, 0.06]], { sx: side ? 0.92 : 1 }), c, 0, false);
  },
  flowers: (e) => {
    const { c, side, three, k, r } = e, cols = [c, e.a ?? "#f6d04d", CREAM, "#b07ad8"];
    const pts: V2[] = []; for (let i = 0; i < 7; i++) { const t = i / 6; pts.push(side ? [-0.95 + t * 1.75, -0.02 - Math.sin(Math.PI * t) * 0.34] : [(-0.96 + t * 1.92) * (three ? 0.94 : 1) + (three ? 0.08 : 0), 0.02 - Math.sin(Math.PI * t) * 0.3]); }
    for (let i = 0; i < 6; i++) { const x = (pts[i][0] + pts[i + 1][0]) / 2, y = (pts[i][1] + pts[i + 1][1]) / 2; k.part(k.ell(x * r, (y + 0.05) * r, 0.15 * r, 0.07 * r, i % 2 ? 0.6 : -0.6), "#6aa84f", { off: 0, lw: k.lw * 0.7 }); }
    pts.forEach(([x, y], i) => flower(k, x * r, y * r, (i % 2 ? 0.17 : 0.21) * r, cols[i % cols.length], i % 4 === 1 ? "#e07a3a" : "#f2c94c"));
  },
  headphones: (e) => {
    const { c, side, three, hc, k, r } = e, a = e.a ?? "#e04a3a", cup = (x: number, s = 1) => { e.pt(e.R(x - 0.2 * s, hc - 0.22 * s, 0.4 * s, 0.62 * s, 0.18 * s), c, 0.4, true); e.pt(e.R(x - 0.11 * s, hc - 0.08 * s, 0.22 * s, 0.34 * s, 0.1 * s), a, 0); };
    if (three) cup(0.98, 0.8);
    inkStroke(k, overBand(e, 0.12), r * 0.13, c);
    if (side) { e.pt(e.E(-0.3, hc + 0.12, 0.36, 0.42), c, 0.5, true); e.pt(e.E(-0.3, hc + 0.12, 0.2, 0.24), a, 0); }
    else if (three) cup(-0.66);
    else { cup(-1.04); cup(1.04); }
  },
  earmuffs: (e) => {
    const { c, side, three, hc, k, r } = e, a = e.a ?? "#8a8f9c", muff = (x: number, s = 1) => e.pt(fuzzP(x * r, (hc + 0.12) * r, 0.3 * r * s, 0.32 * r * s, 11, 0.1), c, 0.5);
    if (three) muff(0.98, 0.8);
    inkStroke(k, overBand(e, 0.1), r * 0.08, a);
    if (side) muff(-0.3, 1.1); else if (three) muff(-0.66); else { muff(-1.02); muff(1.02); }
  },
  bandana: (e) => {
    const { c, side, three, Q, E, pt, k, r } = e, a = e.a ?? CREAM;
    const kx = side ? -1.0 : three ? -0.95 : 1.0, ks = side || three ? -1 : 1;
    const tail = (y0: number, ex: number, ey: number) => pt(Q([[kx, y0], [kx + ks * ex, ey], [kx + ks * (ex - 0.14), ey + 0.12]]), c, 0.3);
    tail(0.0, 0.42, 0.28); tail(0.04, 0.3, 0.4);
    const cap = side ? Q([[-1.06, 0.12], [-1.1, -0.72, 0.0, -0.66], [0.95, -0.62, 1.02, 0.06], [0.4, 0.04, 0.2, 0.14], [-0.5, 0.06, -1.06, 0.12]])
      : Q([[-1.04, 0.1], [-1.04, -0.62, 0, -0.64], [1.04, -0.62, 1.04, 0.1], [0.5, 0.04, 0, 0.18], [-0.5, 0.04, -1.04, 0.1]], { dx: three ? 0.04 : 0 });
    pt(cap, c, 1, true);
    clip(k, cap, () => { let row = 0; for (let y = -0.55; y < 0.2; y += 0.24, row++) for (let x = -1.1; x < 1.2; x += 0.3) k.dot((x + (row % 2 ? 0.15 : 0)) * r, y * r, 0.055 * r, a); });
    stroke(k, cap, k.ink, k.lw);
    pt(E(kx, 0.02, 0.12, 0.1), k.shade(c, 0.12), 0);
  },
  turban: (e) => {
    const { c, side, three, Q, pt, sk, k } = e, f = k.shade(c, 0.32), dx = three ? 0.06 : 0;
    const body = side ? Q([[-1.08, 0.12], [-1.25, -0.7, -0.6, -1.0, 0.15, -0.95], [0.8, -0.9, 1.02, -0.5, 0.95, 0.05], [0, -0.05, -1.08, 0.12]])
      : Q([[-1.0, 0.1], [-1.12, -0.55, -0.75, -0.98, 0, -0.98], [0.75, -0.98, 1.12, -0.55, 1.0, 0.1], [0, -0.08, -1.0, 0.1]], { dx });
    pt(body, c, 1, true);
    clip(k, body, () => {
      if (side) for (const [y0, y1] of [[0.0, -0.55], [-0.3, -0.85], [-0.6, -1.1]]) sk(Q([[0.95, y0 + 0.05], [0.0, y0 - 0.15, -1.2, y1]], { close: false }), f, 0.9);
      else { const vx = e.fc; for (const [y0, y1] of [[-0.3, -0.04], [-0.7, -0.34]]) for (const s of [-1, 1]) sk(Q([[vx + s * 1.1, y0], [vx + s * 0.45, y0 + 0.08, vx, y1]], { close: false }), f, 0.9); }
    });
  },
  hijab: (e) => {
    const { c, side, three, hc, ht, r, k, pt, sk } = e, Q = (pts: number[][]) => P(pts, r);
    if (side) {
      pt(Q([[0.66, ht - 0.03], [0.1, ht + 0.1, 0.0, hc - 0.3, 0.0, hc + 0.3], [0.0, hc + 0.85, 0.35, hc + 1.05, 0.72, hc + 1.02], [0.62, hc + 1.75], [-0.1, hc + 1.9, -0.75, hc + 1.78], [-1.1, hc + 1.3, -1.16, hc + 0.8, -1.16, hc + 0.1], [-1.18, hc - 0.72, -0.2, ht - 0.34, 0.66, ht - 0.03]]), c, 1, true);
      sk(P([[0.62, hc + 1.12], [0.2, hc + 1.35, -0.4, hc + 1.4]], r, { close: false }), k.shade(c, 0.25), 0.8);
      return;
    }
    const ox = three ? 0.3 : 0, w = three ? 0.7 : 0.74;
    const o = Q([[0.05, ht - 0.14], [0.8, ht - 0.14, 1.12, hc - 0.62, 1.12, hc + 0.05], [1.12, hc + 0.75, 1.3, hc + 1.25, 1.18, hc + 1.75], [0, hc + 2.0, -1.18, hc + 1.75], [-1.3, hc + 1.25, -1.12, hc + 0.75, -1.12, hc + 0.05], [-1.12, hc - 0.62, -0.7, ht - 0.14, 0.05, ht - 0.14]]);
    o.moveTo((ox + w) * r, (hc + 0.14) * r); o.ellipse(ox * r, (hc + 0.14) * r, w * r, 0.9 * r, 0, TAU, 0, true);
    pt(o, c, 1, true);
    stroke(k, P([[ox - 0.55, hc + 1.22], [ox, hc + 1.42, ox + 0.55, hc + 1.22]], r, { close: false }), k.shade(c, 0.25), k.lw * 0.8);
    stroke(k, P([[ox - w * 1.12, hc - 0.2], [ox - w * 1.2, hc + 0.6, ox - 0.5, hc + 1.12]], r, { close: false }), k.shade(c, 0.18), k.lw * 0.7);
  },
  fez: (e) => {
    const { c, side, Q, E, pt, k, r } = e, a = e.a ?? "#2b2230", sx = side ? -1 : 1;
    pt(Q([[-0.6, 0.04], [0.6, 0.04], [0.47, -0.72], [-0.47, -0.72]]), c, 1, true);
    pt(E(0, -0.72, 0.47, 0.08), k.tint(c, 0.15), 0);
    inkStroke(k, Q([[0, -0.74], [0.42, -0.84, 0.56, -0.5]], { close: false, sx }), r * 0.045, a, 0.5);
    pt(Q([[0.56, -0.54], [0.68, -0.3, 0.62, -0.22], [0.5, -0.22], [0.44, -0.3, 0.56, -0.54]], { sx }), a, 0);
  },
  tiara: (e) => {
    const { c, side, three, Q, pt, dot, k } = e, a = e.a ?? "#e05a8a";
    const o: PO = side ? { sx: 0.55, sy: 1.25, dx: 0.38, dy: -0.14 } : three ? { sx: 1.0, sy: 1.25, dx: 0.18, dy: -0.06 } : { sx: 1.22, sy: 1.25, dy: -0.06 };
    pt(Q([[-0.78, 0.0], [-0.66, -0.22], [-0.48, -0.14], [-0.3, -0.38], [-0.15, -0.22], [0, -0.6], [0.15, -0.22], [0.3, -0.38], [0.48, -0.14], [0.66, -0.22], [0.78, 0.0], [0, -0.24, -0.78, 0.0]], o), c, 0.4, true);
    const X = (x: number) => x * (o.sx ?? 1) + (o.dx ?? 0), Y = (y: number) => y * (o.sy ?? 1) + (o.dy ?? 0);
    dot(X(0), Y(-0.24), 0.1, a); for (const s of [-1, 1]) dot(X(s * 0.3), Y(-0.16), 0.06, k.tint(a, 0.3));
    dot(X(-0.03), Y(-0.27), 0.035, "rgba(255,255,255,0.8)");
  },
  propeller: (e) => {
    const { c, Q, E, R, D, pt, k } = e, a = e.a ?? "#3d7fd0", dome = D(1.03, 0.78, 0.1);
    pt(dome, c, 1, true);
    clip(k, dome, () => { fillP(k, Q([[0, -0.7], [-0.45, -0.5, -0.5, 0.2], [-1.2, 0.2], [-1.2, -0.7]]), a); fillP(k, Q([[0, -0.7], [0.45, -0.5, 0.5, 0.2], [1.2, 0.2], [1.2, -0.7]]), "#f2c94c"); });
    stroke(k, dome, k.ink, k.lw); stroke(k, Q([[0, -0.7], [-0.45, -0.5, -0.5, 0.1]], { close: false }), k.ink, k.lw * 0.7); stroke(k, Q([[0, -0.7], [0.45, -0.5, 0.5, 0.1]], { close: false }), k.ink, k.lw * 0.7);
    pt(R(-0.04, -1.0, 0.08, 0.32, 0.03), "#8a8f9c", 0);
    pt(E(-0.38, -1.0, 0.38, 0.1, 0.08), "#e04a3a", 0.3); pt(E(0.38, -1.0, 0.38, 0.1, 0.08), "#e04a3a", 0.3);
    e.dot(0, -1.0, 0.07, "#f2c94c");
  },
  police: (e) => peaked(e, e.c, "#22252e", e.a ?? GOLD),
  captain: (e) => peaked(e, e.c, "#1d2028", e.a ?? GOLD, e.a ?? GOLD),
  sunhat: (e) => {
    const { c, side, three, Q, D, pt, k } = e, a = e.a ?? "#e05a8a", sx = side ? 0.92 : 1;
    pt(Q([[-1.75, 0.22], [-1.55, -0.1, -0.8, -0.08], [0, -0.06, 0.8, -0.08], [1.55, -0.1, 1.75, 0.22], [1.0, 0.32, 0, 0.3], [-1.0, 0.32, -1.75, 0.22]], { sx }), c, 0.5, true);
    pt(D(0.72, 0.6, -0.02), c, 1, true);
    clip(k, D(0.72, 0.6, -0.02), () => fillP(k, Q([[-0.8, -0.04], [0.8, -0.04], [0.8, -0.22], [-0.8, -0.22]]), a));
    stroke(k, D(0.72, 0.6, -0.02), k.ink, k.lw);
    const bx = side ? -0.62 : three ? -0.6 : 0.62;
    for (const s of [-1, 1]) pt(e.E(bx + s * 0.13, -0.14, 0.14, 0.08, s * 0.5), a, 0);
    pt(Q([[bx, -0.12], [bx - 0.05, 0.2], [bx + 0.05, 0.16]]), a, 0); e.dot(bx, -0.13, 0.05, k.shade(a, 0.2));
  },
  bucket: (e) => {
    const { c, Q, pt, k } = e, a = e.a;
    const crown = Q([[-0.86, -0.04], [-0.72, -0.54], [-0.7, -0.66, -0.55, -0.66], [0.55, -0.66], [0.7, -0.66, 0.72, -0.54], [0.86, -0.04]]);
    pt(crown, c, 1, true);
    if (a) clip(k, crown, () => fillP(k, Q([[-1, -0.04], [1, -0.04], [1, -0.18], [-1, -0.18]]), a));
    const brim = Q([[-0.88, -0.1], [0.88, -0.1], [1.2, -0.02, 1.3, 0.18], [0, 0.3, -1.3, 0.18], [-1.2, -0.02, -0.88, -0.1]]);
    pt(brim, c, 0.4, true);
    stroke(k, Q([[-1.16, 0.12], [0, 0.22, 1.16, 0.12]], { close: false }), k.shade(c, 0.3), k.lw * 0.6);
  },
  horns: (e) => {
    const { c, side, three, Q, pt, k, r } = e, h = Q([[0.26, -0.2], [0.35, -0.7, 0.74, -0.96], [0.6, -0.6, 0.66, -0.14]]);
    if (side) { const s = Q([[-0.1, -0.28], [0.0, -0.9, -0.55, -1.05], [-0.18, -0.66, 0.36, -0.24]]); pt(xf(s, -0.34 * r, 0.06 * r), k.shade(c, 0.2), 0.6); pt(s, c, 1); }
    else if (three) { pt(xf(h, 0.26 * r, 0, 0.82), k.shade(c, 0.12), 0.8); pt(xf(h, 0.04 * r, 0, -1, 0, 1), c, 1); }
    else for (const s of [-1, 1]) pt(xf(h, 0, 0, s, 0, 1), c, 1);
  },
  halo: (e) => {
    const { c, r, k, g } = e, x = e.three ? 0.06 * r : 0, y = -0.9 * r;
    g.fillStyle = "rgba(255,228,120,0.3)"; g.fill(k.ell(x, y, 0.86 * r, 0.3 * r));
    k.part(ringP(x, y, 0.64 * r, 0.18 * r, 0.46 * r, 0.09 * r), c, { off: 0.04 * r });
  },
  toque: (e) => {
    const { c, Q, R, pt, k, r } = e, body = R(-0.8, -1.16, 1.6, 1.22, 0.08);
    pt(body, c, 1, true);
    clip(k, body, () => { for (const x of [-0.45, -0.15, 0.15, 0.45]) stroke(k, Q([[x, -1.08], [x - 0.02, -0.25]], { close: false }), k.shade(c, 0.18), k.lw * 0.7); });
    union(k, [k.ell(-0.5 * r, -1.24 * r, 0.5 * r, 0.36 * r), k.ell(0.5 * r, -1.24 * r, 0.5 * r, 0.36 * r), k.ell(0, -1.42 * r, 0.6 * r, 0.38 * r)], c);
    fillP(k, k.ell(-0.18 * r, -1.5 * r, 0.28 * r, 0.13 * r), "rgba(255,255,255,0.6)");
    pt(R(-0.84, -0.24, 1.68, 0.28, 0.06), k.shade(c, 0.06), 0);
  },
  chefcap: (e) => { const { c, R, D, pt, k } = e; pt(D(0.98, 0.66, 0.06), c, 1, true); pt(R(-1.0, -0.12, 2.0, 0.22, 0.08), k.shade(c, 0.08), 0); },
  beaniePom: (e) => {
    const { c, Q, R, D, pt, k, r } = e, a = e.a ?? CREAM, dome = D(1.06, 0.84, 0.16);
    pt(fuzzP(0, -0.78 * r, 0.3 * r, 0.28 * r, 10, 0.12), a, 0.4);
    pt(dome, c, 1, true);
    clip(k, dome, () => { for (const y of [-0.3, -0.52]) fillP(k, Q([[-1.2, y], [1.2, y], [1.2, y - 0.11], [-1.2, y - 0.11]]), a); });
    stroke(k, dome, k.ink, k.lw);
    const cuff = R(-1.08, -0.08, 2.16, 0.34, 0.14); pt(cuff, k.shade(c, 0.12), 0);
    clip(k, cuff, () => { for (let x = -1.0; x < 1.05; x += 0.16) stroke(k, Q([[x, -0.05], [x, 0.24]], { close: false }), k.shade(c, 0.35), k.lw * 0.6); });
  },
  flatcap: (e) => {
    const { c, side, three, Q, pt, sk, k } = e;
    if (side) {
      pt(Q([[-1.0, 0.1], [-1.1, -0.42, -0.35, -0.5], [0.6, -0.5, 1.12, -0.06], [1.2, 0.08], [0.6, 0.1, -1.0, 0.1]]), c, 1, true);
      pt(Q([[0.5, 0.02], [1.05, -0.04, 1.28, 0.1], [0.9, 0.15, 0.5, 0.12]]), k.shade(c, 0.15), 0);
      sk(Q([[-0.2, -0.48], [0.35, -0.3, 0.8, -0.04]], { close: false }), k.shade(c, 0.3), 0.7);
      return;
    }
    const dx = three ? 0.06 : 0;
    pt(Q([[-1.0, 0.06], [-1.05, -0.48, -0.3, -0.56], [0.55, -0.62, 1.02, -0.22], [1.06, 0.0, 1.0, 0.06]], { dx }), c, 1, true);
    sk(Q([[-0.7, -0.42], [0, -0.2, 0.7, -0.4]], { close: false, dx }), k.shade(c, 0.3), 0.7);
    pt(Q([[-0.76, 0.04], [0, 0.26, 0.76, 0.04], [0, 0.11, -0.76, 0.04]], { dx: three ? 0.3 : 0, sx: three ? 0.85 : 1 }), k.shade(c, 0.15), 0);
  },
  derby: (e) => {
    const { c, side, three, E, R, D, pt, k } = e, band = e.a ?? k.shade(c, 0.5);
    pt(D(0.72, 0.74, -0.08), c, 1, true); pt(R(-0.71, -0.3, 1.42, 0.17, 0), band, 0);
    pt(E(side ? 0.06 : three ? 0.04 : 0, -0.08, 1.0, 0.13), c, 0.3);
  },
  jester: (e) => {
    const { c, side, three, Q, R, pt, dot, k } = e, a = e.a ?? "#f2c94c", o = { sx: side ? 0.86 : 1, dx: three ? 0.05 : 0 }, X = (x: number) => x * o.sx + o.dx;
    pt(Q([[-0.95, 0.06], [-1.15, -0.85, -1.5, -0.05], [-1.15, -0.45, -0.3, -0.25]], o), a, 0.8);
    pt(Q([[0.95, 0.06], [1.15, -0.85, 1.5, -0.05], [1.15, -0.45, 0.3, -0.25]], o), a, 0.8);
    pt(Q([[-0.42, -0.1], [-0.35, -0.9, 0.15, -1.2], [0.0, -0.75, 0.42, -0.1]], o), c, 0.8, true);
    pt(Q([[-1.0, 0.1], [-0.5, -0.32, 0, -0.34], [0.5, -0.32, 1.0, 0.1], [0, -0.12, -1.0, 0.1]], o), c, 0.3);
    pt(R(X(-1.02), -0.06, 2.04 * o.sx, 0.2, 0.08), k.shade(c, 0.3), 0);
    for (const [x, y] of [[-1.5, 0.0], [1.5, 0.0], [0.15, -1.22]]) { dot(X(x), y, 0.12, k.ink); dot(X(x), y, 0.1, GOLD); }
  },
  crownSmall: (e) => {
    const { c, r, k } = e, a = e.a ?? "#d8344e", x0 = (e.side ? 0.1 : e.three ? 0.18 : 0.14) * r, y0 = -0.34 * r, s = 0.74, ro = 0.16;
    const cr = xf(P([[-0.72, 0.08], [-0.8, -0.6], [-0.4, -0.22], [0, -0.74], [0.4, -0.22], [0.8, -0.6], [0.72, 0.08]], r), x0, y0, s, ro);
    k.part(cr, c, { off: 0.04 * r, thick: true });
    for (const x of [-0.4, 0, 0.4]) k.dot(x0 + (Math.cos(ro) * x - Math.sin(ro) * -0.1) * r * s, y0 + (Math.sin(ro) * x + Math.cos(ro) * -0.1) * r * s, 0.08 * r, a);
  },
  miner: (e) => {
    const { c, side, three, E, R, D, pt, k, r, g } = e;
    pt(side ? E(0.6, 0.08, 0.7, 0.12) : E(three ? 0.24 : 0, 0.08, 1.2, 0.15), c, 0, true);
    pt(D(1.02, 0.82, 0.06), c, 1, true);
    const lx = side ? 0.78 : e.fc, sx = side ? 0.45 : three ? 0.8 : 1;
    pt(R(lx - 0.22 * sx, -0.5, 0.44 * sx, 0.34, 0.08), "#3a3d48", 0);
    g.fillStyle = "rgba(255,226,120,0.35)"; g.fill(k.ell(lx * r, -0.33 * r, 0.36 * r * sx, 0.3 * r));
    e.fs(E(lx, -0.33, 0.15 * sx, 0.14), "#ffe27a", 0.7); e.dot(lx - 0.04 * sx, -0.37, 0.04, "#ffffff");
  },
  safari: (e) => {
    const { c, side, three, Q, pt, k } = e, a = e.a ?? k.shade(c, 0.35), sx = side ? 1.08 : 1;
    const dome = Q([[-0.85, 0.0], [-0.88, -0.75, -0.45, -0.95, 0, -0.95], [0.45, -0.95, 0.88, -0.75, 0.85, 0.0]]);
    pt(dome, c, 1, true);
    clip(k, dome, () => fillP(k, Q([[-1, -0.04], [1, -0.04], [1, -0.18], [-1, -0.18]]), a));
    e.dot(0, -0.95, 0.07, k.shade(c, 0.25));
    pt(Q([[-0.9, -0.08], [0.9, -0.08], [1.25, 0.0, 1.32, 0.18], [0, 0.32, -1.32, 0.18], [-1.25, 0.0, -0.9, -0.08]], { sx, dx: three ? 0.04 : 0 }), c, 0.4, true);
  },
  santa: (e) => {
    const { c, side, Q, R, pt, r } = e, sx = side ? -1 : 1, fur = e.a ?? "#f7f5f0";
    pt(Q([[-0.95, 0.02], [-1.0, -0.9, 0.2, -1.15, 0.85, -0.7], [1.15, -0.45, 1.25, -0.05], [1.0, -0.35, 0.78, -0.45], [0.95, -0.2, 0.95, 0.02]], { sx }), c, 1, true);
    pt(fuzzP(1.25 * r * sx, 0.0, 0.19 * r, 0.18 * r, 9, 0.12), fur, 0.3);
    pt(R(-1.06, -0.14, 2.12, 0.32, 0.15), fur, 0.25);
  },
  witch: (e) => {
    const { c, side, Q, E, R, pt, k } = e, a = e.a ?? "#7a4a9a", sx = side ? -1 : 1;
    const cone = Q([[-0.62, 0.02], [-0.35, -0.8, 0.05, -1.5], [0.25, -1.72, 0.62, -1.62], [0.35, -1.5, 0.28, -1.25], [0.35, -0.6, 0.62, 0.02]], { sx });
    pt(cone, c, 1, true);
    clip(k, cone, () => fillP(k, Q([[-0.8, -0.06], [0.8, -0.06], [0.8, -0.28], [-0.8, -0.28]]), a));
    stroke(k, cone, k.ink, k.lw);
    k.part(R(-0.16, -0.3, 0.32, 0.26, 0.03), GOLD, { off: 0 }); fs(k, R(-0.08, -0.23, 0.16, 0.12, 0.02), a, 0.6);
    pt(E(0, 0.05, 1.45, 0.17), c, 0.4, true);
  },
  elf: (e) => {
    const { c, side, Q, pt, k, r } = e, a = e.a ?? "#c8372d", sx = side ? -1 : 1;
    pt(Q([[-0.9, 0.04], [-0.9, -0.7, -0.2, -0.95, 0.35, -1.1], [0.9, -1.25, 1.2, -1.0], [0.85, -0.85, 0.7, -0.6], [0.92, -0.3, 0.9, 0.04]], { sx }), c, 1, true);
    const z: number[][] = [[-1.0, -0.14], [1.0, -0.14], [1.0, 0.06]]; for (let i = 1; i <= 9; i++) z.push([1.0 - i * (2 / 9) + (i % 2 ? 2 / 18 : 0), i % 2 ? 0.2 : 0.06]); z.push([-1.0, 0.06]);
    pt(Q(z), a, 0.3);
    k.dot(1.2 * r * sx, -1.0 * r, 0.12 * r, k.ink); k.dot(1.2 * r * sx, -1.0 * r, 0.1 * r, GOLD);
  },
  nemes: (e) => {
    const { c, side, three, hc, ht, r, k, pt } = e, a = e.a ?? "#2f5fa8", Q = (pts: number[][]) => P(pts, r), ox = three ? 0.28 : 0, iw = three ? 0.7 : 0.74;
    const p = side ? Q([[0.7, ht + 0.05], [0.1, ht - 0.35, -1.12, hc - 0.8, -1.12, hc + 0.05], [-1.12, hc + 0.55, -0.95, hc + 0.85, -0.7, hc + 1.2], [0.22, hc + 1.2], [0.16, hc + 0.05], [0.25, ht + 0.25, 0.7, ht + 0.05]])
      : Q([[-0.88, 0.12], [-0.96, -0.62, -0.5, ht - 0.16, 0.05, ht - 0.16], [0.6, ht - 0.16, 0.96, -0.62, 0.88, 0.12], [1.22, hc + 1.18], [ox + iw, hc + 1.18], [ox + iw, 0.2], [ox, 0.02, ox - iw, 0.2], [ox - iw, hc + 1.18], [-1.22, hc + 1.18]]);
    pt(p, c, 1, true);
    clip(k, p, () => { for (let y = ht - 0.25; y < hc + 1.3; y += 0.2) fillP(k, Q([[-1.4, y], [1.4, y], [1.4, y + 0.09], [-1.4, y + 0.09]]), a); });
    stroke(k, p, k.ink, k.lw);
    if (!side) { inkStroke(k, P([[ox - iw, 0.13], [ox, -0.04, ox + iw, 0.13]], r, { close: false }), r * 0.1, c, 0.5); fs(k, e.E(ox, -0.1, 0.09, 0.09), "#d8344e", 0.6); }
  },
  roman: (e) => {
    const { c, side, three, hc, Q, R, D, pt, sk, k } = e, a = e.a ?? "#c8372d";
    if (side) {
      const crest = Q([[-0.85, -0.55], [-0.6, -1.38, 0.15, -1.32], [0.75, -1.22, 0.85, -0.55], [0, -0.8, -0.85, -0.55]]);
      pt(crest, a, 0.8); clip(k, crest, () => { for (let i = 0; i < 7; i++) { const x = -0.75 + (i / 6) * 1.5; sk(Q([[x * 0.8, -0.72], [x, -1.35]], { close: false }), k.shade(a, 0.3), 0.6); } });
      pt(Q([[-1.0, -0.1], [-1.45, 0.25], [-1.3, 0.4], [-0.9, 0.2]]), c, 0.4);
      pt(D(1.0, 0.82, 0.08, -0.05), c, 1, true);
      pt(Q([[-0.35, 0.0], [0.15, 0.0], [0.2, hc + 0.4], [-0.1, hc + 0.5], [-0.35, hc + 0.3]]), k.shade(c, 0.08), 0.5);
      return;
    }
    const cx = three ? 0.16 : 0;
    const crest = R(cx - 0.15, -1.32, 0.3, 0.7, 0.12); pt(crest, a, 0.6);
    clip(k, crest, () => { for (const x of [-0.06, 0.04]) sk(Q([[cx + x, -1.28], [cx + x, -0.7]], { close: false }), k.shade(a, 0.3), 0.6); });
    for (const s of three ? [-1] : [-1, 1]) pt(Q([[s * 0.7, 0.05], [s * 1.04, 0.05], [s * 1.04, hc + 0.45], [s * 0.86, hc + 0.62], [s * 0.72, hc + 0.4]], { dx: three ? 0.32 : 0 }), k.shade(c, 0.08), 0.5);
    if (three) pt(Q([[0.98, 0.05], [1.1, 0.05], [1.1, hc + 0.4], [1.0, hc + 0.5]]), k.shade(c, 0.12), 0);
    pt(D(1.0, 0.84, 0.1, three ? 0.03 : 0), c, 1, true);
    pt(R(-1.02, -0.06, 2.04, 0.16, 0.06), k.shade(c, 0.18), 0);
  },
  kabuto: (e) => {
    const { c, side, three, hc, Q, D, pt, sk, k } = e, a = e.a ?? GOLD, lace = k.tint(c, 0.4);
    const skirt = side ? Q([[-0.95, -0.1], [0.3, -0.1], [0.2, hc + 0.1], [-1.25, hc + 0.4], [-1.4, hc + 0.25]]) : Q([[-0.92, -0.08], [0.92, -0.08], [1.38, hc + 0.3], [0.98, hc + 0.42], [0.86, 0.15], [-0.86, 0.15], [-0.98, hc + 0.42], [-1.38, hc + 0.3]], { dx: three ? -0.04 : 0 });
    pt(skirt, k.shade(c, 0.1), 0.5);
    clip(k, skirt, () => { for (const y of [0.2, 0.45, 0.7]) sk(side ? Q([[-1.4, y + 0.1], [0.3, y - 0.12]], { close: false }) : Q([[-1.5, y + 0.25], [0, y - 0.15, 1.5, y + 0.25]], { close: false }), lace, 0.9); });
    stroke(k, skirt, k.ink, k.lw);
    pt(D(0.96, 0.86, 0.02, side ? -0.05 : three ? 0.03 : 0), c, 1, true);
    pt(e.R(-0.98, -0.12, 1.96, 0.16, 0.05), k.shade(c, 0.25), 0);
    const blade = Q([[-0.06, -0.3], [-0.55, -0.62, -0.55, -1.25], [-0.38, -0.72, 0.02, -0.42]]);
    if (side) pt(xf(blade, 0.72 * e.r, 0, -0.5, -0.2, 1), a, 0.4);
    else for (const s of [-1, 1]) pt(xf(blade, e.fc * e.r, 0, s * (three ? 0.82 : 1), 0, 1), a, 0.4);
    e.fs(e.E(side ? 0.72 : e.fc, -0.32, 0.1, 0.1), a, 0.7);
  },
  ushanka: (e) => {
    const { c, side, three, hc, R, D, pt, r } = e, fur = e.a ?? "#d9c7a8";
    const flap = (x: number, s = 1) => pt(R(x - 0.17 * s, -0.12, 0.34 * s, hc + 0.72, 0.16 * s), fur, 0.3);
    if (side) flap(-0.3, 1.1); else if (three) { flap(0.96, 0.8); flap(-0.66); } else { flap(-0.98); flap(0.98); }
    pt(D(0.98, 0.8, -0.04), c, 1, true);
    pt(side ? fuzzP(0.4 * r, -0.12 * r, 0.75 * r, 0.24 * r, 12, 0.07) : fuzzP((three ? 0.08 : 0) * r, -0.12 * r, 1.08 * r, 0.24 * r, 14, 0.06), fur, 0.3);
  },
  deerstalker: (e) => {
    const { c, side, three, Q, D, pt, sk, k } = e, line = k.shade(c, 0.3);
    const dome = D(0.98, 0.78, 0.06, side ? -0.04 : 0);
    if (side) pt(Q([[-0.6, 0.0], [-1.1, 0.02, -1.32, 0.18], [-0.85, 0.16, -0.5, 0.1]]), k.shade(c, 0.1), 0);
    else if (three) pt(Q([[-0.8, 0.0], [-1.15, 0.05, -1.2, 0.16], [-0.9, 0.16, -0.72, 0.1]]), k.shade(c, 0.1), 0);
    pt(dome, c, 1, true);
    clip(k, dome, () => { for (let x = -1.0; x <= 1.0; x += 0.26) sk(Q([[x, -0.9], [x, 0.1]], { close: false }), line, 0.6); for (let y = -0.66; y <= 0.1; y += 0.24) sk(Q([[-1.1, y], [1.1, y]], { close: false }), line, 0.6); });
    stroke(k, dome, k.ink, k.lw);
    pt(side ? Q([[0.6, 0.0], [1.1, 0.02, 1.32, 0.18], [0.85, 0.16, 0.5, 0.1]]) : Q([[-0.78, 0.04], [0, 0.26, 0.78, 0.04], [0, 0.12, -0.78, 0.04]], { dx: three ? 0.3 : 0, sx: three ? 0.85 : 1 }), k.shade(c, 0.1), 0);
    for (const s of side ? [-1] : [-1, 1]) e.fs(e.E(s * 0.18 + (three ? 0.1 : 0), -0.78, 0.12, 0.07, s * 0.4), k.shade(c, 0.15), 0.6);
  },
  paperhat: (e) => {
    const { c, side, three, Q, pt, sk, k } = e, o = { sx: side ? 0.62 : three ? 0.9 : 1, dx: three ? 0.06 : 0 };
    const hat = Q([[-1.05, 0.08], [1.05, 0.08], [0.0, -1.0]], o);
    pt(hat, c, 0.6, true);
    clip(k, hat, () => { for (const [y, w] of [[-0.52, 0.32], [-0.4, 0.46], [-0.28, 0.6]]) sk(Q([[-w, y], [w * 0.7, y]], { close: false, sx: o.sx, dx: o.dx }), "rgba(60,60,70,0.5)", 0.8); });
    pt(Q([[-1.08, -0.1], [1.08, -0.1], [1.08, 0.14], [-1.08, 0.14]], o), k.shade(c, 0.08), 0);
    sk(Q([[-0.85, 0.02], [0.85, 0.02]], { close: false, sx: o.sx, dx: o.dx }), "rgba(60,60,70,0.5)", 0.8);
  },
  beekeeper: (e) => {
    const { c, side, hc, Q, E, D, pt, k } = e, veil = Q([[-1.3, 0.1], [1.3, 0.1], [1.25, hc + 1.0, 1.15, hc + 1.45], [0, hc + 1.62, -1.15, hc + 1.45], [-1.25, hc + 1.0, -1.3, 0.1]], { sx: side ? 0.95 : 1 });
    fillP(k, veil, "rgba(40,44,56,0.16)");
    clip(k, veil, () => { for (let x = -1.3; x <= 1.3; x += 0.13) stroke(k, Q([[x, 0], [x, hc + 1.7]], { close: false }), "rgba(40,44,56,0.22)", k.lw * 0.45); for (let y = 0.1; y <= hc + 1.7; y += 0.13) stroke(k, Q([[-1.4, y], [1.4, y]], { close: false }), "rgba(40,44,56,0.22)", k.lw * 0.45); });
    stroke(k, veil, k.ink, k.lw * 0.9);
    pt(E(0, 0.08, 1.4, 0.18), c, 0.4, true);
    pt(D(0.74, 0.62, 0.0), c, 1, true);
  },
  divemask: (e) => {
    const { c, side, three, hc, Q, R, pt, k, r, g } = e, ey = hc + 0.05;
    stroke(k, side ? Q([[0.3, ey - 0.02], [-0.3, ey - 0.1, -1.0, ey]], { close: false }) : Q([[-1.02, ey - 0.02], [1.02, ey - 0.02]], { close: false }), "#2b2f3a", r * 0.14);
    const tx = side ? -0.45 : three ? -0.75 : 0.96;
    inkStroke(k, Q([[tx, ey - 0.1], [tx + 0.06, -0.85]], { close: false }), r * 0.12, "#f2c94c", 0.6); pt(R(tx - 0.07, -1.05, 0.26, 0.18, 0.06), "#e04a3a", 0);
    const mx = side ? 0.66 : e.fc, sx = side ? 0.45 : three ? 0.86 : 1, frame = R(mx - 0.62 * sx, ey - 0.3, 1.24 * sx, 0.6, 0.24), glass = R(mx - 0.5 * sx, ey - 0.2, 1.0 * sx, 0.42, 0.18);
    const ring = new Path2D(); ring.addPath(frame); ring.addPath(glass);
    g.fillStyle = c; g.fill(ring, "evenodd"); fillP(k, glass, "rgba(150,215,255,0.3)");
    stroke(k, frame, k.ink, k.lw); stroke(k, glass, k.ink, k.lw * 0.8);
    clip(k, glass, () => stroke(k, Q([[mx - 0.42 * sx, ey + 0.1], [mx - 0.2 * sx, ey - 0.25]], { close: false }), "rgba(255,255,255,0.7)", r * 0.07));
  },
  goggles: (e) => {
    const { c, side, three, Q, E, pt, k, r } = e, glass = e.a ?? "#9fd4f0";
    stroke(k, side ? Q([[0.7, -0.06], [-0.1, -0.2, -1.0, -0.02]], { close: false }) : Q([[-1.0, 0.0], [0, -0.26, 1.0, 0.0]], { close: false }), "#4a3a2e", r * 0.13);
    const lens = (x: number, s = 1, sx = 1) => { pt(E(x, -0.12, 0.26 * s * sx, 0.24 * s), c, 0.3, true); k.part(E(x, -0.12, 0.17 * s * sx, 0.16 * s), glass, { off: 0, lw: k.lw * 0.7 }); stroke(k, P([[x - 0.08 * s * sx, -0.06], [x + 0.03 * s * sx, -0.2]], r, { close: false }), "rgba(255,255,255,0.85)", r * 0.05); };
    if (side) lens(0.62, 1, 0.55); else if (three) { lens(0.62, 0.86, 0.8); lens(0.04, 1); } else { lens(-0.33, 1); lens(0.33, 1); }
  },
  bunny: (e) => {
    const { c, k, r } = e, inner = e.a ?? "#f2a7b8";
    for (const [x, y, rot, s] of bandSpots(e)) { k.part(k.ell(x * r, (y - 0.62 * s) * r, 0.21 * r * s, 0.66 * r * s, rot), c, { off: 0.05 * r }); k.part(k.ell(x * r, (y - 0.58 * s) * r, 0.1 * r * s, 0.48 * r * s, rot), inner, { off: 0, lw: k.lw * 0.6 }); }
    inkStroke(k, overBand(e, 0.08), r * 0.08, c);
  },
  catears: (e) => {
    const { c, k, r } = e, inner = e.a ?? "#f2a7b8";
    for (const [x, y, rot, s] of bandSpots(e)) { k.part(xf(P([[-0.26, 0.06], [0.0, -0.55], [0.26, 0.06]], r * s), x * r, y * r, 1, rot * 0.6), c, { off: 0.04 * r }); k.part(xf(P([[-0.13, 0.02], [0.0, -0.35], [0.13, 0.02]], r * s), x * r, y * r, 1, rot * 0.6), inner, { off: 0, lw: k.lw * 0.6 }); }
    inkStroke(k, overBand(e, 0.06), r * 0.08, c);
  },
  antlers: (e) => {
    const { c, k, r, side } = e, w = r * 0.12, br = (pts: number[][]) => inkStroke(k, P(pts, r, { close: false }), w, c, 0.7);
    for (const [x, y, , s] of bandSpots(e)) { const d = (side ? -1 : Math.sign(x) || 1) * s; br([[x, y + 0.04], [x + d * 0.1, y - 0.55, x + d * 0.55, y - 0.95]]); br([[x + d * 0.15, y - 0.45], [x - d * 0.12, y - 0.75]]); br([[x + d * 0.36, y - 0.76], [x + d * 0.72, y - 0.72]]); }
    inkStroke(k, overBand(e, 0.06), r * 0.08, k.shade(c, 0.2));
  },
  fedora: (e) => {
    const { c, side, three, Q, pt, k } = e, band = e.a ?? "#22252e", dx = three ? 0.04 : 0;
    const crown = Q([[-0.72, 0.0], [-0.66, -0.62], [-0.6, -0.88, -0.3, -0.86], [-0.08, -0.72, 0, -0.68], [0.08, -0.72, 0.3, -0.86], [0.6, -0.88, 0.66, -0.62], [0.72, 0.0]], { dx, sx: side ? 1.04 : 1 });
    pt(crown, c, 1, true);
    clip(k, crown, () => fillP(k, Q([[-1, -0.08], [1, -0.08], [1, -0.28], [-1, -0.28]]), band));
    stroke(k, crown, k.ink, k.lw);
    pt(side ? Q([[-1.2, -0.12], [-0.6, 0.0, 0.4, 0.02], [1.0, 0.04, 1.3, 0.2], [0.9, 0.2, 0.3, 0.14], [-0.6, 0.12, -1.2, -0.12]])
      : Q([[-1.32, -0.06], [-1.1, -0.12, 0, -0.08], [1.1, -0.12, 1.32, -0.06], [1.2, 0.12, 0, 0.17], [-1.2, 0.12, -1.32, -0.06]], { dx }), c, 0.4, true);
  },
  backcap: (e) => {
    const { c, side, three, E, D, pt, k, r } = e, band = e.a ?? k.shade(c, 0.5);
    if (side) pt(E(-1.1, 0.04, 0.62, 0.11, -0.1), band, 0); else if (three) pt(E(-0.8, 0.06, 0.55, 0.12, -0.15), band, 0);
    pt(D(1.04, 0.72, 0.06), c, 1, true);
    if (!side) { const x = three ? 0.3 : 0; fillP(k, P([[x - 0.22, 0.07], [x - 0.22, -0.12, x, -0.14], [x + 0.22, -0.12, x + 0.22, 0.07]], r), k.shade(c, 0.45)); stroke(k, P([[x - 0.26, -0.02], [x + 0.26, -0.02]], r, { close: false }), band, r * 0.07); }
    e.dot(three ? 0.1 : 0, -0.66, 0.07, band);
  },
  visor: (e) => {
    const { c, side, three, Q, E, pt, k } = e, a = e.a ?? k.shade(c, 0.2);
    pt(side ? Q([[-1.02, 0.02], [0, -0.14, 1.0, -0.04], [1.0, 0.14], [0, 0.04, -1.02, 0.2]]) : Q([[-1.0, 0.0], [0, -0.22, 1.0, 0.0], [1.0, 0.16], [0, -0.04, -1.0, 0.16]]), c, 0.2);
    pt(side ? E(1.08, 0.06, 0.62, 0.11, 0.1) : three ? Q([[-0.45, 0.06], [0.4, 0.46, 1.1, 0.02], [0.4, 0.18, -0.45, 0.06]]) : Q([[-0.92, 0.06], [0, 0.5, 0.92, 0.06], [0, 0.18, -0.92, 0.06]]), a, 0);
  },
  nightcap: (e) => {
    const { c, side, Q, R, pt, k, r } = e, a = e.a ?? CREAM, sx = side ? -1 : 1;
    const cap = Q([[-0.95, 0.04], [-1.0, -0.8, 0.1, -1.0, 0.65, -0.75], [1.15, -0.5, 1.3, 0.25], [1.05, -0.2, 0.8, -0.3], [0.98, -0.12, 0.95, 0.04]], { sx });
    pt(cap, c, 1, true);
    clip(k, cap, () => { for (let i = -2; i < 6; i++) fillP(k, Q([[-1.4 + i * 0.42, 0.3], [-1.2 + i * 0.42, 0.3], [-0.2 + i * 0.42, -1.2], [-0.4 + i * 0.42, -1.2]], { sx }), a); });
    stroke(k, cap, k.ink, k.lw);
    pt(R(-1.02, -0.1, 2.04, 0.24, 0.1), k.shade(c, 0.1), 0);
    pt(fuzzP(1.32 * r * sx, 0.3 * r, 0.15 * r, 0.14 * r, 9, 0.12), a, 0.2);
  },
  bow: (e) => {
    const { c, side, three, k, r } = e, x0 = (side ? -0.15 : three ? -0.05 : 0.48) * r, y0 = (side ? -0.32 : -0.28) * r, rot = side ? 0 : 0.35;
    const loop = (s: number) => xf(P([[0, 0], [-0.3 * s, -0.42, -0.5 * s, -0.22], [-0.56 * s, 0.0, -0.5 * s, 0.2], [-0.3 * s, 0.38, 0, 0]], r), x0, y0, 1.05, rot);
    for (const s of [-1, 1]) k.part(xf(P([[0, 0], [-0.2 * s, 0.4], [0.02 * s, 0.36]], r), x0, y0, 1.05, rot), k.shade(c, 0.1), { off: 0 });
    for (const s of [-1, 1]) k.part(loop(s), c, { off: 0.04 * r });
    k.part(k.ell(x0, y0, 0.14 * r, 0.13 * r), k.shade(c, 0.15), { off: 0 });
  },
  laurel: (e) => {
    const { c, side, three, k, r } = e;
    const arcs: [V2, V2, V2][] = side ? [[[-1.0, 0.0], [-0.2, -0.55], [0.78, -0.22]]] : [[[-1.0, 0.1], [-0.7, -0.35], [-0.08, -0.36]], [[1.0, 0.1], [0.7, -0.35], [0.08, -0.36]]];
    const sh = three ? 0.08 : 0;
    for (const [p0, p1, p2] of arcs) {
      stroke(k, P([[p0[0] + sh, p0[1]], [p1[0] + sh, p1[1], p2[0] + sh, p2[1]]], r, { close: false }), k.shade(c, 0.4), r * 0.05);
      for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6, x = (1 - t) ** 2 * p0[0] + 2 * t * (1 - t) * p1[0] + t * t * p2[0] + sh, y = (1 - t) ** 2 * p0[1] + 2 * t * (1 - t) * p1[1] + t * t * p2[1];
        for (const s of [-1, 1]) k.part(k.ell((x + s * 0.03) * r, (y + s * 0.07) * r, 0.14 * r, 0.065 * r, (s > 0 ? 0.5 : -0.5) + (p2[0] > p0[0] ? -0.6 : 0.6)), c, { off: 0, lw: k.lw * 0.7 }); }
    }
  },
  bonnet: (e) => {
    const { c, side, three, hc, ht, r, k, pt } = e, a = e.a ?? "#e05a8a", Q = (pts: number[][]) => P(pts, r);
    if (side) {
      pt(Q([[0.95, ht + 0.12], [0.5, ht - 0.42, -0.5, ht - 0.25], [-1.18, -0.4, -1.22, hc + 0.2, -0.85, hc + 0.6], [-0.25, hc + 0.45], [0.1, -0.05, 0.95, ht + 0.12]]), c, 1, true);
      inkStroke(k, P([[-0.15, hc + 0.42], [0.2, hc + 0.8, 0.5, hc + 1.0]], r, { close: false }), r * 0.07, a, 0.5);
      return;
    }
    const ox = three ? 0.25 : 0;
    pt(Q([[-1.15, hc + 0.35], [-1.25, -0.6, -0.6, ht - 0.36, ox, ht - 0.36], [0.6 + ox, ht - 0.36, 1.25, -0.6, 1.15, hc + 0.35], [0.88, hc + 0.35], [0.92, -0.25, 0.5 + ox, ht - 0.08, ox, ht - 0.08], [-0.5 + ox, ht - 0.08, -0.92, -0.25, -0.88, hc + 0.35]]), c, 1, true);
    for (const s of [-1, 1]) inkStroke(k, P([[ox + s * 0.86, hc + 0.3], [ox + s * 0.6, hc + 0.85, ox + s * 0.1, hc + 1.05]], r, { close: false }), r * 0.07, a, 0.5);
    for (const s of [-1, 1]) k.part(k.ell((ox + s * 0.13) * r, (hc + 1.06) * r, 0.13 * r, 0.08 * r, s * 0.4), a, { off: 0 });
    k.dot(ox * r, (hc + 1.06) * r, 0.06 * r, k.shade(a, 0.25));
  },
  tricorn: (e) => {
    const { c, side, three, Q, pt, sk, k } = e, a = e.a ?? GOLD, o = { dx: three ? 0.06 : 0, sx: three ? 0.95 : 1 };
    const hat = side ? Q([[-1.05, -0.5], [-0.7, -0.1, 0.0, -0.05], [1.15, 0.02], [0.6, -0.55, 0.05, -0.8], [-0.6, -0.9, -1.05, -0.5]])
      : Q([[-1.3, -0.35], [-0.6, -0.2, 0, 0.12], [0.6, -0.2, 1.3, -0.35], [0.8, -0.9, 0, -0.85], [-0.8, -0.9, -1.3, -0.35]], o);
    pt(hat, c, 1, true);
    clip(k, hat, () => sk(side ? Q([[-1.05, -0.5], [-0.7, -0.1, 0.0, -0.05], [1.15, 0.02]], { close: false }) : Q([[-1.3, -0.35], [-0.6, -0.2, 0, 0.12], [0.6, -0.2, 1.3, -0.35]], { ...o, close: false }), a, 2.4));
    stroke(k, hat, k.ink, k.lw);
  },
  sailorcap: (e) => {
    const { c, Q, R, D, pt, sk, k } = e;
    pt(D(0.78, 0.62, -0.1), c, 1, true);
    pt(R(-0.98, -0.24, 1.96, 0.32, 0.15), c, 0.3, true);
    sk(Q([[-0.9, -0.08], [0.9, -0.08]], { close: false }), k.shade(c, 0.18), 0.7);
  },
};

export function drawHatX(k: Kit, h: HatCtx): boolean {
  const fn = (HATS as Record<string, ((e: HE) => void) | undefined>)[h.style];
  if (!fn) return false;
  const r = h.r, hw = h.hw ?? 1, side = h.side, three = h.three;
  const e: HE = {
    k, g: k.g, r, c: h.color, a: h.accent, side, three, hw, hc: 0.6 * hw, ht: -0.4 * hw, fc: side ? 0.62 : three ? 0.32 : 0, off: r * 0.1,
    Q: (pts, o) => P(pts, r, o), E: (x, y, rx, ry, rot = 0) => k.ell(x * r, y * r, rx * r, ry * r, rot), R: (x, y, w, hh, rr) => k.rrect(x * r, y * r, w * r, hh * r, rr * r),
    D: (rx, ry, y = 0, x = 0) => { const q = new Path2D(); q.ellipse(x * r, y * r, rx * r, ry * r, 0, Math.PI, 0); q.closePath(); return q; },
    pt: (p, col, o = 1, thick = false) => k.part(p, col, { off: r * 0.1 * o, thick }), fs: (p, col, lk = 0.75) => fs(k, p, col, lk),
    sk: (p, col, wk) => stroke(k, p, col, k.lw * wk), dot: (x, y, rr, col) => k.dot(x * r, y * r, rr * r, col),
  };
  k.g.save(); fn(e); k.g.restore();
  return true;
}

// ================================================================ tops (torso space, clipped to the torso)
const skinOf = (t: TopCtx) => (t as TopCtx & { skin?: string }).skin ?? "#FCF8F3";
type TE = { k: Kit; t: TopCtx; c: string; a?: string; d: number; hw: number; tw: number; ox: number; yT: number; yB: number; bot: number; chest: number; th: number; side: boolean; three: boolean; near: number;
  WK(sg: number): number; X(u: number, sg: number): number; big(y: number, h: number): Path2D; ln(pts: V2[], col?: string, wk?: number): void; F(p: Path2D, col: string, st?: boolean): void };

/** a print in wrapped torso coordinates: u = half widths from the chest line (foreshortened on the far side) */
function patternCore(k: Kit, t: TopCtx, name: string, pc: string) {
  const { d, hw, ox, yT, yB, hem, wL, wR, side } = t, bot = Math.max(yB, hem) + d * 0.1, top = yT - d * 0.1, g = k.g;
  const Bw = Math.max(hw, hw * (t.flare / hw > 0.5 ? t.flare / hw : 1)) * 1.25, uL = (-Bw - ox) / (hw * wL), uR = (Bw - ox) / (hw * wR);
  const M = (u: number) => ox + u * hw * (u < 0 ? wL : wR), S = (u: number) => (u < 0 ? wL : wR) / (side ? 0.5 : 1);
  const us: number[] = [];
  const stepU = (pitch: number) => { us.length = 0; const p = pitch / hw; for (let u = Math.floor(uL / p) * p; u <= uR + p; u += p) us.push(u); return p; };
  const rows = (pitch: number, fn: (y: number, i: number) => void) => { let i = 0; for (let y = top; y <= bot; y += pitch) fn(y, i++); };
  g.save(); g.lineCap = "round"; g.lineJoin = "round";
  switch (name) {
    case "stripes": { const p = stepU(d * 0.15); for (const u of us) fillP(k, k.poly([[M(u), top], [M(u + p * 0.5), top], [M(u + p * 0.5), bot], [M(u), bot]]), pc); break; }
    case "pinstripe": { stepU(d * 0.085); for (const u of us) stroke(k, k.poly([[M(u), top], [M(u), bot]], false), pc, k.lw * 0.5); break; }
    case "hstripes": rows(d * 0.15, (y) => fillP(k, k.rrect(-hw * 4, y, hw * 8, d * 0.075, 0), pc)); break;
    case "ringer": rows(d * 0.3, (y, i) => { if (i % 2) fillP(k, k.rrect(-hw * 4, y, hw * 8, d * 0.06, 0), pc); }); break;
    case "dots": case "stars": case "hearts": case "flowers": {
      const pitch = name === "dots" ? d * 0.13 : d * 0.17, p = stepU(pitch);
      rows(pitch * 0.9, (y, i) => { for (const u0 of us) { const u = u0 + (i % 2 ? p / 2 : 0), x = M(u), s = S(u), q = pitch;
        if (name === "dots") fillP(k, k.ell(x, y, q * 0.24 * s, q * 0.24), pc);
        else if (name === "stars") fillP(k, starP(x, y, q * 0.3, q * 0.13, 5, -Math.PI / 2, s), pc);
        else if (name === "hearts") fillP(k, xf(heartP(0, 0, q * 0.5), x, y, 1, 0, 1), pc);
        else { for (let j = 0; j < 5; j++) { const a = -Math.PI / 2 + (j * TAU) / 5; fillP(k, k.ell(x + Math.cos(a) * q * 0.13 * s, y + Math.sin(a) * q * 0.13, q * 0.1 * s, q * 0.1), pc); } k.dot(x, y, q * 0.07, "#f2c94c"); } } });
      break; }
    case "plaid": {
      const p = stepU(d * 0.26); g.globalAlpha = 0.42;
      for (const u of us) fillP(k, k.poly([[M(u), top], [M(u + p * 0.35), top], [M(u + p * 0.35), bot], [M(u), bot]]), pc);
      rows(d * 0.26, (y) => fillP(k, k.rrect(-hw * 4, y, hw * 8, d * 0.09, 0), pc));
      g.globalAlpha = 0.8; const dk = k.shade(pc, 0.3);
      for (const u of us) stroke(k, k.poly([[M(u + p * 0.68), top], [M(u + p * 0.68), bot]], false), dk, k.lw * 0.45);
      rows(d * 0.26, (y) => stroke(k, k.poly([[-hw * 4, y + d * 0.17], [hw * 4, y + d * 0.17]], false), dk, k.lw * 0.45));
      break; }
    case "check": { const p = stepU(d * 0.11); rows(d * 0.11, (y, i) => { us.forEach((u, j) => { if ((i + j) % 2) fillP(k, k.poly([[M(u), y], [M(u + p), y], [M(u + p), y + d * 0.11], [M(u), y + d * 0.11]]), pc); }); }); break; }
    case "argyle": { const p = stepU(d * 0.22); rows(d * 0.28, (y, i) => { us.forEach((u, j) => { if ((i + j) % 2 === 0) { const x0 = M(u), x1 = M(u + p / 2), x2 = M(u + p); fillP(k, k.poly([[x1, y], [x2, y + d * 0.14], [x1, y + d * 0.28], [x0, y + d * 0.14]]), pc); } }); }); break; }
    case "diagonal": { for (let x = -hw * 4 - (bot - top); x < hw * 4; x += d * 0.16) fillP(k, k.poly([[x, bot], [x + d * 0.075, bot], [x + d * 0.075 + (bot - top), top], [x + (bot - top), top]]), pc); break; }
    case "zigzag": rows(d * 0.18, (y) => { const pts: V2[] = []; let i = 0; for (let x = -hw * 3; x <= hw * 3; x += d * 0.07) pts.push([x, y + (i++ % 2 ? d * 0.06 : 0)]); stroke(k, k.poly(pts, false), pc, d * 0.035); }); break;
    case "waves": rows(d * 0.16, (y) => { const q = new Path2D(); q.moveTo(-hw * 3, y); for (let x = -hw * 3; x < hw * 3; x += d * 0.16) { q.quadraticCurveTo(x + d * 0.04, y - d * 0.05, x + d * 0.08, y); q.quadraticCurveTo(x + d * 0.12, y + d * 0.05, x + d * 0.16, y); } stroke(k, q, pc, d * 0.03); }); break;
    case "camo": case "spots": case "leaves": {
      const rnd = seq(hash(name + t.color)), n = name === "camo" ? 46 : 34, cols = name === "camo" ? [pc, k.shade(t.color, 0.32), k.mix(t.color, "#3a3324", 0.55)] : [pc];
      for (let i = 0; i < n; i++) { const u = uL + rnd() * (uR - uL), y = top + rnd() * (bot - top), x = M(u), s = S(u), rr = d * (0.06 + rnd() * 0.06), rot = rnd() * Math.PI;
        if (name === "camo") fillP(k, fuzzP(x, y, rr * 1.4 * s, rr, 6, 0.18, rot), cols[i % 3]);
        else if (name === "spots") { stroke(k, fuzzP(x, y, rr * 0.8 * s, rr * 0.65, 5, 0.12, rot), pc, d * 0.025); k.dot(x, y, rr * 0.25, k.shade(t.color, 0.15)); }
        else fillP(k, xf(P([[0, -1], [0.7, -0.4, 0, 1], [-0.7, -0.4, 0, -1]], rr * 1.4), x, y, 1, rot, 1), pc); }
      break; }
    case "number": numberOn(k, t, pc); break;
  }
  g.restore();
}
function numberOn(k: Kit, t: TopCtx, col: string) {
  const n = String(1 + (hash(t.color + (t.accent ?? "") + (t.patternColor ?? "")) % 23)), sx = t.side ? 0.45 : t.three ? 0.82 : 1;
  label(k, n, t.ox + (t.three ? t.hw * 0.05 : 0), t.chest + t.d * 0.32, t.d * 0.4, col, true, sx);
}

export function drawTopPattern(k: Kit, t: TopCtx): void {
  if (!t.pattern) return;
  patternCore(k, t, t.pattern, t.patternColor ?? contrast(k, t.color));
}

/** a band of width w on the lower-right side of the segment p0 -> p1 */
const bandQ = (k: Kit, p0: V2, p1: V2, w: number) => { const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * w, ny = (dx / l) * w, s = ny < 0 ? -1 : 1; return k.poly([p0, p1, [p1[0] + nx * s, p1[1] + ny * s], [p0[0] + nx * s, p0[1] + ny * s]]); };

const TOPS: Record<TopX, (e: TE) => void> = {
  armor: ({ k, t, c, a, d, hw, ox, yT, yB, chest, side, near, X, WK, big, ln, F }) => {
    F(big(yB - d * 0.36, d * 0.08), a ?? "#6b4a2e");
    for (const y of [yB - d * 0.2, yB - d * 0.06]) ln([[-hw * 3, y], [hw * 3, y]], k.ink, 0.7);
    ln([[ox, yT + d * 0.12], [ox, yB - d * 0.38]], k.tint(c, 0.55), 1.6); ln([[ox + d * 0.025, yT + d * 0.14], [ox + d * 0.025, yB - d * 0.38]], k.shade(c, 0.3), 0.6);
    ln([[X(0.55, near), chest - d * 0.02], [X(0.4, near), chest + d * 0.2]], "rgba(255,255,255,0.7)", 1.6);
    if (side) k.part(k.ell(-hw * 0.1, yT + d * 0.12, hw * 0.75, d * 0.2), k.tint(c, 0.12), { off: d * 0.03 });
    else for (const sg of t.sgs) k.part(k.ell(X(1.0, sg), yT + d * 0.1, hw * 0.62 * WK(sg), d * 0.2), k.tint(c, 0.12), { off: d * 0.03 });
  },
  robe: ({ k, t, c, a, d, ox, chest, yB, bot, X, big, ln, F }) => {
    t.collar(k.shade(c, 0.15), 0.28, 0.26);
    F(k.poly([[ox - d * 0.05, chest + d * 0.2], [ox + d * 0.05, chest + d * 0.2], [ox + d * 0.06, bot + d * 0.1], [ox - d * 0.06, bot + d * 0.1]]), a ?? k.tint(c, 0.45));
    const belt = a ? k.shade(a, 0.1) : "#d9b54a";
    F(big(yB - d * 0.2, d * 0.07), belt);
    ln([[ox + d * 0.06, yB - d * 0.15], [ox + d * 0.1, yB + d * 0.18]], k.ink, 2.6); ln([[ox + d * 0.06, yB - d * 0.15], [ox + d * 0.1, yB + d * 0.18]], belt, 1.4);
    for (const sg of t.sgs) ln([[X(0.62, sg), yB], [X(0.82, sg), bot]], k.shade(c, 0.22), 0.8);
  },
  scrubs: ({ k, c, a, d, ox, yT, chest, near, X, WK, ln, F }) => {
    F(k.poly([[ox - d * 0.13 * WK(-1), yT - d * 0.02], [ox + d * 0.13 * WK(1), yT - d * 0.02], [ox, chest + d * 0.1]]), k.shade(c, 0.32));
    const px = X(0.62, near), pw = d * 0.17 * WK(near);
    F(k.rrect(px - pw / 2, chest + d * 0.08, pw, d * 0.15, d * 0.02), k.shade(c, 0.08));
    ln([[px - pw * 0.2, chest + d * 0.02], [px - pw * 0.2, chest + d * 0.12]], a ?? "#2f5fa8", 1.8);
  },
  tank: ({ k, t, a, d, hw, ox, yT, chest, side, three, X, WK, big, F }) => {
    const sk = skinOf(t);
    if (side) { F(k.ell(ox + hw * 0.2, yT - d * 0.02, hw * 0.5, d * 0.28), sk); F(k.ell(-hw * 0.3, yT + d * 0.02, hw * 0.6, d * 0.36), sk); }
    else { for (const sg of t.sgs) F(k.ell(X(1.3, sg), yT + d * 0.06, hw * 0.66 * WK(sg), d * 0.4), sk); F(k.ell(ox, yT - d * 0.02, hw * 0.48 * (three ? 0.85 : 1), d * 0.3), sk); }
    if (a) F(big(chest + d * 0.25, d * 0.08), a, false);
  },
  sweater: ({ k, t, c, a, d, hw, ox, yT, yB, chest, side, three, X, big, ln, F }) => {
    const rib = k.shade(c, 0.22), rl = k.shade(c, 0.42);
    F(big(yB - d * 0.2, d * 0.45), rib);
    for (let x = -hw * 2; x < hw * 2; x += d * 0.07) ln([[x, yB - d * 0.17], [x, yB + d * 0.25]], rl, 0.8);
    if (a) { F(big(chest + d * 0.04, d * 0.13), a); for (let x = -hw * 2; x < hw * 2; x += d * 0.12) k.dot(x, chest + d * 0.105, d * 0.025, CREAM); }
    else for (const sg of t.sgs) { const pts: V2[] = []; let i = 0; for (let y = chest; y < yB - d * 0.16; y += d * 0.06) pts.push([X(0.45, sg) + (i++ % 2 ? d * 0.03 : -d * 0.03), y]); ln(pts, rl, 0.9); }
    F(k.ell(ox, yT - d * 0.01, hw * 0.62 * (three ? 0.85 : side ? 0.7 : 1), d * 0.14), rib);
  },
  cardigan: ({ k, t, c, a, d, ox, yT, yB, bot, chest, X, WK, big, F }) => {
    F(big(yB - d * 0.1, d * 0.4), k.shade(c, 0.12));
    for (const sg of t.sgs) F(k.rrect(X(0.56, sg) - d * 0.08 * WK(sg), yB - d * 0.32, d * 0.16 * WK(sg), d * 0.13, d * 0.02), k.shade(c, 0.08));
    F(k.poly([[ox - d * 0.15 * WK(-1), yT - d * 0.03], [ox + d * 0.15 * WK(1), yT - d * 0.03], [ox + d * 0.035, bot + d * 0.1], [ox - d * 0.035, bot + d * 0.1]]), a ?? CREAM);
    for (let i = 0; i < 4; i++) k.part(k.ell(ox - d * 0.065, chest + d * (0.06 + i * 0.16), d * 0.024, d * 0.024), k.shade(c, 0.4), { off: 0, lw: k.lw * 0.6 });
  },
  kimono: ({ k, c, a, d, yT, yB, X, big, ln, F }) => {
    const col = a ?? "#f1e3c6", obi = a ? k.shade(a, 0.25) : "#b8322f", P0: V2 = [X(0.34, -1), yT - d * 0.05], P1: V2 = [X(0.34, 1), yT - d * 0.05], low: V2 = [X(0.7, -1), yB - d * 0.25];
    const cx: V2 = [P1[0] + (low[0] - P1[0]) * 0.42, P1[1] + (low[1] - P1[1]) * 0.42];
    F(k.poly([P0, P1, cx]), CREAM);
    F(bandQ(k, P0, cx, d * 0.075), col);
    F(k.poly([P1, [X(2.4, 1), P1[1]], [X(2.4, 1), yB + d], low]), c, false);
    F(bandQ(k, [P1[0] - d * 0.075, P1[1]], [low[0] - d * 0.075, low[1]], d * 0.075), col);
    F(big(yB - d * 0.44, d * 0.22), obi); ln([[-d * 2, yB - d * 0.33], [d * 2, yB - d * 0.33]], k.tint(obi, 0.4), 1.1);
  },
  spacesuit: ({ k, t, a, d, hw, ox, yT, yB, chest, th, side, three, near, X, big, F }) => {
    const s = side ? 0.5 : three ? 0.85 : 1;
    F(big(yB - d * 0.24, d * 0.08), "#9aa1ad");
    for (const sg of t.sgs) F(k.rrect(X(0.95, sg) - d * 0.03, chest - d * 0.05, d * 0.06, th, 0), a ?? "#e0663a", false);
    F(k.rrect(ox - d * 0.15 * s, chest + d * 0.03, d * 0.3 * s, d * 0.2, d * 0.03), "#d4d8e0");
    ["#e04a3a", "#f2c94c", "#4aa3df"].forEach((col, i) => k.part(k.ell(ox + (i - 1) * d * 0.08 * s, chest + d * 0.09, d * 0.028 * s, d * 0.028), col, { off: 0, lw: k.lw * 0.6 }));
    F(k.rrect(ox - d * 0.1 * s, chest + d * 0.15, d * 0.2 * s, d * 0.04, d * 0.02), "#7d8696", false);
    if (!side) { const px = X(0.66, near), py = yT + d * 0.18; F(k.ell(px, py, d * 0.06 * s, d * 0.06), a ?? "#2f5fa8"); fillP(k, starP(px, py, d * 0.04, d * 0.016, 5, -Math.PI / 2, s), CREAM); }
    F(k.ell(ox, yT - d * 0.01, hw * 0.7 * (side ? 0.6 : 1), d * 0.15), "#aeb4c0");
  },
  tux: ({ k, t, c, d, tw, ox, yT, chest, bot, near, X, WK, ln, F }) => {
    F(k.poly([[ox - tw * 0.3 * WK(-1), yT - d * 0.04], [ox + tw * 0.3 * WK(1), yT - d * 0.04], [ox, chest + d * 0.4]]), "#f7f5f0");
    for (const sg of t.sgs) F(k.poly([[ox + sg * tw * 0.3 * WK(sg), yT - d * 0.04], [ox + sg * tw * 0.54 * WK(sg), yT + d * 0.06], [ox + sg * tw * 0.26 * WK(sg), chest + d * 0.16], [ox + sg * d * 0.01, chest + d * 0.4]]), k.tint(c, 0.2));
    ln([[ox, chest + d * 0.4], [ox, bot]], k.ink, 0.7);
    for (const y of [chest + d * 0.1, chest + d * 0.22]) k.dot(ox, y, d * 0.017, k.ink);
    const by = yT + d * 0.25; for (const sg of t.sgs) k.part(k.poly([[ox, by], [ox + sg * d * 0.13 * WK(sg), by - d * 0.07], [ox + sg * d * 0.13 * WK(sg), by + d * 0.07]]), "#1b1d24", { off: 0, lw: k.lw * 0.7 }); k.dot(ox, by, d * 0.035, "#3a3d48");
    if (!t.side) { const px = X(0.6, near); F(k.poly([[px - d * 0.06 * WK(near), chest + d * 0.08], [px + d * 0.06 * WK(near), chest + d * 0.08], [px + d * 0.02, chest + d * 0.02]]), "#f7f5f0"); }
  },
  hawaiian: ({ k, t, c, a, d, hw, ox, yT, chest, bot, ln }) => {
    if (!t.pattern) { const flw = a ?? CREAM, leaf = k.mix(c, "#2f7a4f", 0.6);
      for (const [u, v] of [[-0.6, 0.28], [0.6, 0.22], [-0.1, 0.6], [0.8, 0.7], [-0.8, 0.9], [0.3, 1.0]]) { const x = ox + u * hw * (u < 0 ? t.wL : t.wR) * 1.05, y = yT + v * (bot - yT), s = (u < 0 ? t.wL : t.wR) / (t.side ? 0.5 : 1);
        for (const rot of [0.5, 2.4]) fs(k, xf(P([[0, 0], [0.5, -0.3, 1, 0], [0.5, 0.3, 0, 0]], d * 0.17), x, y, 1, rot, 1), leaf, 0.55);
        flower(k, x, y, d * 0.11 * Math.min(1, s), flw, k.shade(flw, 0.3), 0.6); } }
    t.collar(k.tint(c, 0.22), 0.28, 0.22);
    ln([[ox, chest + d * 0.06], [ox, bot]], k.ink, 0.7);
    for (let i = 0; i < 3; i++) k.dot(ox + d * 0.03, chest + d * (0.16 + i * 0.18), d * 0.02, CREAM);
  },
  jersey: ({ k, t, c, a, d, hw, ox, yT, chest, th, side, X, WK, F }) => {
    const ac = a ?? CREAM;
    if (side) F(k.rrect(-hw * 0.2, chest - d * 0.05, hw * 0.35, th, 0), ac, false);
    else for (const sg of [-1, 1]) F(k.rrect(X(1.0, sg) - hw * 0.12 * WK(sg), chest - d * 0.05, hw * 0.24 * WK(sg), th, 0), ac, false);
    F(k.poly([[ox - d * 0.15 * WK(-1), yT - d * 0.03], [ox + d * 0.15 * WK(1), yT - d * 0.03], [ox, chest + d * 0.07]]), ac);
    F(k.poly([[ox - d * 0.09 * WK(-1), yT - d * 0.03], [ox + d * 0.09 * WK(1), yT - d * 0.03], [ox, chest - d * 0.04]]), k.shade(c, 0.3), false);
    if (t.pattern !== "number") numberOn(k, t, ac);
  },
  labcoat: ({ k, t, c, a, d, tw, ox, yT, yB, chest, bot, near, X, WK, ln, F }) => {
    F(k.poly([[ox - tw * 0.2 * WK(-1), yT], [ox + tw * 0.2 * WK(1), yT], [ox, chest + d * 0.32]]), a ?? "#8fb3d9");
    t.collar(k.shade(c, 0.07), 0.26, 0.36);
    ln([[ox, chest + d * 0.32], [ox, bot]], k.ink, 0.7);
    for (let i = 0; i < 3; i++) k.part(k.ell(ox + d * 0.04, chest + d * (0.42 + i * 0.17), d * 0.022, d * 0.022), "#c4cad4", { off: 0, lw: k.lw * 0.6 });
    for (const sg of t.sgs) F(k.rrect(X(0.6, sg) - d * 0.09 * WK(sg), yB - d * 0.1, d * 0.18 * WK(sg), d * 0.15, d * 0.02), k.shade(c, 0.05));
    if (!t.side) { const px = X(0.62, near), pw = d * 0.16 * WK(near); ln([[px - pw * 0.15, chest + d * 0.0], [px - pw * 0.15, chest + d * 0.12]], "#2f5fa8", 1.8); F(k.rrect(px - pw / 2, chest + d * 0.06, pw, d * 0.12, d * 0.02), k.shade(c, 0.05)); }
  },
  trench: ({ k, t, c, a, d, ox, yB, chest, bot, WK, big, ln, F }) => {
    t.collar(k.shade(c, 0.12), 0.32, 0.3);
    ln([[ox + d * 0.17 * WK(1), chest + d * 0.05], [ox + d * 0.13 * WK(1), bot]], k.shade(c, 0.4), 0.8);
    for (let row = 0; row < 3; row++) for (const col of t.side ? [1] : [-1, 1]) k.part(k.ell(ox + col * d * 0.1 * WK(col) + d * 0.02, chest + d * (0.18 + row * 0.16), d * 0.024, d * 0.024), k.shade(c, 0.45), { off: 0, lw: k.lw * 0.6 });
    const belt = k.shade(c, 0.18); F(big(yB - d * 0.24, d * 0.09), belt);
    F(k.rrect(ox - d * 0.055, yB - d * 0.255, d * 0.11, d * 0.12, d * 0.015), a ?? "#5a4632"); F(k.rrect(ox - d * 0.025, yB - d * 0.225, d * 0.05, d * 0.06, d * 0.01), belt, false);
  },
  puffer: ({ k, c, d, hw, ox, yT, bot, X, F }) => {
    const ln = k.shade(c, 0.28), hi = k.tint(c, 0.28);
    for (let y = yT + d * 0.18; y < bot; y += d * 0.2) { const q = new Path2D(); q.moveTo(-hw * 3, y); q.quadraticCurveTo(ox, y + d * 0.07, hw * 3, y); stroke(k, q, ln, k.lw * 0.8); stroke(k, xf(q, 0, -d * 0.09), hi, k.lw * 1.3); }
    stroke(k, k.poly([[ox, yT], [ox, bot]], false), k.shade(c, 0.4), k.lw * 1.1);
    F(k.rrect(ox - d * 0.016, yT + d * 0.26, d * 0.032, d * 0.08, d * 0.01), "#c8ccd4");
    F(k.rrect(X(0.62, -1), yT - d * 0.07, X(0.62, 1) - X(0.62, -1), d * 0.2, d * 0.07), k.shade(c, 0.06));
  },
  poncho: ({ k, c, a, d, hw, ox, yT, chest, yB, bot, side, big, ln, F }) => {
    const b1 = a ?? "#f2c94c";
    for (const y of [chest + d * 0.25, yB - d * 0.05]) { F(big(y, d * 0.07), b1, false); const pts: V2[] = []; let i = 0; for (let x = -hw * 3; x <= hw * 3; x += d * 0.06) pts.push([x, y + d * (i++ % 2 ? 0.14 : 0.1)]); ln(pts, CREAM, 1.1); }
    for (let x = -hw * 3; x < hw * 3; x += d * 0.045) ln([[x, bot - d * 0.16], [x, bot]], k.shade(c, 0.3), 0.7);
    F(k.ell(ox, yT - d * 0.02, hw * 0.5 * (side ? 0.6 : 1), d * 0.13), k.shade(c, 0.35));
  },
  cape: ({ k, t, a, d, hw, ox, yT, yB, side, X, F }) => {
    const cc = a ?? "#b8322f";
    if (side) F(k.poly([[-hw * 2, yT - d * 0.05], [ox - hw * 0.45, yT - d * 0.05], [ox - hw * 0.8, yT + d * 0.3], [-hw * 2, yB]]), cc);
    else { for (const sg of t.sgs) F(k.poly([[X(0.42, sg), yT - d * 0.06], [X(1.6, sg), yT - d * 0.06], [X(1.6, sg), yT + d * 0.36], [X(0.98, sg), yT + d * 0.24]]), cc);
      stroke(k, k.poly([[X(0.5, -1), yT + d * 0.13], [ox, yT + d * 0.16], [X(0.5, 1), yT + d * 0.13]], false), GOLD, k.lw * 0.9); k.part(k.ell(ox, yT + d * 0.16, d * 0.045, d * 0.045), GOLD, { off: 0 }); }
  },
  toga: ({ k, t, c, a, d, yT, chest, bot, side, X, ln, F }) => {
    const bd = a ?? "#7a4a9a";
    if (side) { for (let i = 0; i < 3; i++) ln([[X(-1.6, 1), yT + d * (0.1 + i * 0.25)], [X(1.4, 1), chest + d * (0.45 + i * 0.25)]], k.shade(c, 0.2), 0.8); F(bandQ(k, [X(-1.6, 1), yT - d * 0.05], [X(1.4, 1), chest + d * 0.3], d * 0.07), bd); return; }
    const p0: V2 = [X(0.12, 1), yT - d * 0.08], p1: V2 = [X(1.8, -1), chest + d * 0.32];
    F(k.poly([[X(2.2, -1), yT - d * 0.12], p0, p1]), skinOf(t), false);
    F(bandQ(k, p0, p1, d * 0.07), bd);
    for (let i = 1; i <= 3; i++) ln([[p0[0] + d * 0.06 * i, p0[1] + d * 0.16 * i], [p1[0] + d * 0.05 * i, Math.min(bot, p1[1] + d * 0.24 * i)]], k.shade(c, 0.2), 0.8);
  },
  sailor: ({ k, t, a, d, hw, ox, yT, chest, side, X, WK, ln, F }) => {
    const nv = a ?? "#28457a", kr = "#c8372d";
    if (side) F(k.poly([[-hw * 2, yT - d * 0.05], [ox - hw * 0.1, yT - d * 0.05], [ox + hw * 0.2, chest + d * 0.1], [-hw * 2, chest + d * 0.15]]), nv);
    else for (const sg of t.sgs) { F(k.poly([[ox, chest + d * 0.12], [X(0.26, sg), yT - d * 0.05], [X(1.8, sg), yT - d * 0.05], [X(1.8, sg), yT + d * 0.2], [X(0.85, sg), chest + d * 0.02]]), nv); ln([[X(0.8, sg), chest - d * 0.04], [X(1.8, sg), yT + d * 0.14]], CREAM, 1.0); ln([[ox + sg * d * 0.03, chest + d * 0.06], [X(0.8, sg), chest - d * 0.04]], CREAM, 1.0); }
    k.part(k.ell(ox, chest + d * 0.1, d * 0.05, d * 0.04), kr, { off: 0 });
    for (const sg of t.sgs) k.part(k.poly([[ox, chest + d * 0.1], [ox + sg * d * 0.09 * WK(sg), chest + d * 0.3], [ox + sg * d * 0.02, chest + d * 0.3]]), kr, { off: 0, lw: k.lw * 0.8 });
  },
  chefcoat: ({ k, t, c, a, d, yT, chest, bot, ox, X, WK, ln, F }) => {
    ln([[X(0.55, -1), yT + d * 0.08], [X(0.6, -1), bot]], k.shade(c, 0.25), 0.8);
    for (const col of t.side ? [1] : [-1, 1]) for (let row = 0; row < 4; row++) k.part(k.ell(ox + col * d * 0.11 * WK(col), chest + d * (0.02 + row * 0.16), d * 0.026, d * 0.026), a ?? "#e8e4dc", { off: 0, lw: k.lw * 0.65 });
    F(k.rrect(X(0.5, -1), yT - d * 0.05, X(0.5, 1) - X(0.5, -1), d * 0.16, d * 0.05), k.shade(c, 0.06));
  },
  turtleneck: ({ k, c, d, hw, yT, yB, side, X, big, ln, F }) => {
    const nk = lum(c) < 0.3 ? k.tint(c, 0.16) : k.shade(c, 0.1), x0 = side ? X(1.4, -1) : X(0.62, -1), x1 = side ? X(0.75, 1) : X(0.62, 1);
    F(big(yB - d * 0.12, d * 0.4), nk);
    for (let x = -hw * 2; x < hw * 2; x += d * 0.07) ln([[x, yB - d * 0.1], [x, yB + d * 0.25]], k.shade(nk, 0.3), 0.7);
    F(k.rrect(x0, yT - d * 0.07, x1 - x0, d * 0.29, d * 0.1), nk);
    for (let x = x0 + d * 0.035; x < x1 - d * 0.01; x += d * 0.055) ln([[x, yT + d * 0.08], [x, yT + d * 0.2]], k.shade(nk, 0.3), 0.7);
  },
  polo: ({ k, t, c, a, d, ox, yT, chest, F }) => {
    F(k.rrect(ox - d * 0.035, yT, d * 0.07, chest + d * 0.14 - yT, d * 0.01), k.shade(c, 0.08));
    for (const y of [chest + d * 0.0, chest + d * 0.09]) k.dot(ox, y, d * 0.018, CREAM);
    t.collar(a ?? k.tint(c, 0.2), 0.27, 0.17);
  },
  blazer: ({ k, t, c, a, d, tw, ox, yT, yB, chest, bot, near, X, WK, ln, F }) => {
    F(k.poly([[ox - tw * 0.22 * WK(-1), yT], [ox + tw * 0.22 * WK(1), yT], [ox, chest + d * 0.36]]), "#f7f5f0");
    t.collar(k.shade(c, 0.16), 0.28, 0.38);
    ln([[ox, chest + d * 0.36], [ox, bot]], k.ink, 0.7);
    for (let i = 0; i < 2; i++) k.dot(ox + d * 0.035, chest + d * (0.46 + i * 0.15), d * 0.022, k.shade(c, 0.5));
    for (const sg of t.sgs) ln([[X(0.45, sg), yB - d * 0.2], [X(0.85, sg), yB - d * 0.2]], k.shade(c, 0.4), 0.9);
    if (!t.side) { const px = X(0.62, near); F(k.poly([[px - d * 0.06 * WK(near), chest + d * 0.09], [px + d * 0.06 * WK(near), chest + d * 0.09], [px + d * 0.04, chest + d * 0.02], [px - d * 0.01, chest + d * 0.04]]), a ?? "#d9534f"); ln([[px - d * 0.08 * WK(near), chest + d * 0.09], [px + d * 0.08 * WK(near), chest + d * 0.09]], k.ink, 0.8); }
  },
  tunic: ({ k, c, a, d, ox, yT, yB, chest, bot, WK, big, ln, F }) => {
    F(k.poly([[ox - d * 0.1 * WK(-1), yT - d * 0.02], [ox + d * 0.1 * WK(1), yT - d * 0.02], [ox, chest + d * 0.14]]), k.shade(c, 0.42));
    for (let i = 0; i < 3; i++) { const y = yT + d * (0.12 + i * 0.07), w = d * 0.07 * (1 - i * 0.25); ln([[ox - w, y], [ox + w, y + d * 0.04]], CREAM, 0.8); ln([[ox + w, y], [ox - w, y + d * 0.04]], CREAM, 0.8); }
    F(big(bot - d * 0.06, d * 0.2), k.shade(c, 0.15), false);
    F(big(yB - d * 0.28, d * 0.08), a ?? "#6b4a2e");
    F(k.rrect(ox - d * 0.05, yB - d * 0.295, d * 0.1, d * 0.11, d * 0.015), GOLD);
  },
  supersuit: ({ k, t, a, d, hw, ox, yT, yB, chest, side, three, X, big, F }) => {
    const cc = a ?? "#c8372d", yel = "#f6d04d", s = side ? 0.45 : three ? 0.85 : 1, ey = chest + d * 0.14;
    if (side) F(k.poly([[-hw * 2, yT - d * 0.05], [ox - hw * 0.5, yT - d * 0.05], [ox - hw * 0.8, yT + d * 0.22], [-hw * 2, yT + d * 0.4]]), cc);
    else for (const sg of t.sgs) F(k.poly([[X(0.62, sg), yT - d * 0.06], [X(1.6, sg), yT - d * 0.06], [X(1.6, sg), yT + d * 0.24], [X(1.0, sg), yT + d * 0.16]]), cc);
    F(big(yB - d * 0.3, d * 0.08), yel); F(k.rrect(ox - d * 0.05 * s, yB - d * 0.315, d * 0.1 * s, d * 0.11, d * 0.02), k.shade(yel, 0.2));
    k.part(k.poly([[ox, ey - d * 0.15], [ox + d * 0.16 * s, ey], [ox, ey + d * 0.15], [ox - d * 0.16 * s, ey]]), yel, { off: d * 0.02, lw: k.lw * 0.9 });
    fs(k, starP(ox, ey, d * 0.1, d * 0.032, 4, -Math.PI / 2, s), cc, 0.6);
  },
  varsity: ({ k, t, c, a, d, ox, yT, yB, chest, near, X, big, F }) => {
    const ac = a ?? CREAM;
    F(big(yB - d * 0.16, d * 0.4), k.shade(c, 0.1));
    for (const y of [yB - d * 0.12, yB - d * 0.04]) F(big(y, d * 0.03), ac, false);
    for (let i = 0; i < 4; i++) k.part(k.ell(ox, chest + d * (0.04 + i * 0.16), d * 0.022, d * 0.022), ac, { off: 0, lw: k.lw * 0.6 });
    stroke(k, k.poly([[X(0.4, -1), yT - d * 0.02], [ox, chest + d * 0.02], [X(0.4, 1), yT - d * 0.02]], false), ac, d * 0.05);
    if (!t.side) { const px = X(0.6, near), py = chest + d * 0.12, s = t.three ? 0.9 : 1; k.part(k.ell(px, py, d * 0.09 * s, d * 0.09), ac, { off: 0 }); fs(k, starP(px, py, d * 0.065, d * 0.026, 5, -Math.PI / 2, s), c, 0.6); }
  },
  waistcoat: ({ k, t, c, a, d, ox, yT, yB, chest, X, ln, F }) => {
    F(k.poly([[X(0.32, -1), yT - d * 0.03], [X(0.32, 1), yT - d * 0.03], [ox, chest + d * 0.28]]), a ?? CREAM);
    ln([[ox, chest + d * 0.28], [ox, yB + d * 0.1]], k.ink, 0.7);
    for (let i = 0; i < 4; i++) k.dot(ox + d * 0.03, chest + d * (0.34 + i * 0.12), d * 0.018, k.shade(c, 0.5));
    for (const sg of t.sgs) ln([[X(0.45, sg), chest + d * 0.42], [X(0.85, sg), chest + d * 0.4]], k.shade(c, 0.4), 1.0);
  },
  bathrobe: ({ k, t, c, d, ox, yT, yB, chest, X, big, ln, F }) => {
    F(k.poly([[X(0.2, -1), yT - d * 0.05], [X(0.2, 1), yT - d * 0.05], [ox, chest + d * 0.38]]), skinOf(t), false);
    for (const sg of t.sgs) F(k.poly([[X(0.18, sg), yT - d * 0.06], [X(0.58, sg), yT - d * 0.06], [ox + sg * d * 0.04, chest + d * 0.46], [ox, chest + d * 0.4]]), k.tint(c, 0.18));
    F(big(yB - d * 0.32, d * 0.08), k.shade(c, 0.1));
    k.part(k.ell(ox + d * 0.06, yB - d * 0.28, d * 0.05, d * 0.04), k.shade(c, 0.1), { off: 0 });
    for (const dx of [0.03, 0.1]) { ln([[ox + d * 0.06, yB - d * 0.26], [ox + d * dx, yB + d * 0.12]], k.ink, 2.4); ln([[ox + d * 0.06, yB - d * 0.26], [ox + d * dx, yB + d * 0.12]], k.shade(c, 0.1), 1.2); }
  },
  pajamas: ({ k, t, c, a, d, ox, yT, chest, bot, ln }) => {
    const pip = a ?? k.tint(c, 0.6);
    if (!t.pattern) patternCore(k, t, "stripes", k.tint(c, 0.32));
    t.collar(c, 0.27, 0.2);
    stroke(k, k.poly([[ox - t.tw * 0.27 * t.wL, yT], [ox, chest - d * 0.02], [ox + t.tw * 0.27 * t.wR, yT]], false), pip, k.lw * 1.1);
    ln([[ox, chest + d * 0.04], [ox, bot]], pip, 1.4);
    for (let i = 0; i < 3; i++) k.part(k.ell(ox + d * 0.04, chest + d * (0.14 + i * 0.18), d * 0.022, d * 0.022), CREAM, { off: 0, lw: k.lw * 0.6 });
  },
  hazmat: ({ k, t, c, d, ox, yT, yB, chest, bot, near, X, big, ln, F }) => {
    F(big(yB - d * 0.22, d * 0.1), "#3a3d45");
    ln([[ox, yT], [ox, bot]], k.shade(c, 0.4), 1.2);
    for (const sg of t.sgs) ln([[X(0.95, sg), yT + d * 0.08], [X(0.7, sg), yT + d * 0.3]], k.shade(c, 0.3), 0.8);
    if (!t.side) { const px = X(0.58, near); F(k.rrect(px - d * 0.09, chest + d * 0.05, d * 0.18, d * 0.12, d * 0.01), "#f7f5f0"); ln([[px - d * 0.06, chest + d * 0.09], [px + d * 0.06, chest + d * 0.09]], "#5a5f6a", 1.0); ln([[px - d * 0.06, chest + d * 0.13], [px + d * 0.02, chest + d * 0.13]], "#5a5f6a", 1.0); }
  },
  wetsuit: ({ k, a, d, hw, ox, yT, chest, bot, side, X, WK, F }) => {
    const ac = a ?? "#2f8fbf";
    F(k.poly([[-hw * 3, yT - d * 0.1], [hw * 3, yT - d * 0.1], [hw * 3, yT + d * 0.16], [ox, chest + d * 0.0], [-hw * 3, yT + d * 0.16]]), ac, false);
    if (side) F(k.rrect(-hw * 0.3, chest, hw * 0.4, bot - chest, hw * 0.2), ac, false);
    else for (const sg of [-1, 1]) F(k.rrect(X(1.05, sg) - hw * 0.14 * WK(sg), chest, hw * 0.28 * WK(sg), bot - chest, hw * 0.1), ac, false);
  },
  judge: ({ k, t, c, d, ox, yT, chest, bot, X, WK, ln, F }) => {
    const yoke = new Path2D(); yoke.moveTo(X(1.6, -1), chest + d * 0.1); yoke.quadraticCurveTo(ox, chest + d * 0.22, X(1.6, 1), chest + d * 0.1); stroke(k, yoke, k.tint(c, 0.25), k.lw * 0.9);
    for (const sg of t.sgs) for (const u of [0.3, 0.68]) ln([[X(u, sg), chest + d * 0.2], [X(u * 1.25, sg), bot]], k.tint(c, 0.18), 0.8);
    if (!t.side) for (const sg of [-1, 1]) F(k.rrect(ox + (sg < 0 ? -d * 0.075 * WK(-1) : d * 0.005), yT + d * 0.13, d * 0.07 * WK(sg), d * 0.15, d * 0.012), "#f7f5f0");
    else F(k.rrect(ox, yT + d * 0.13, d * 0.05, d * 0.15, d * 0.012), "#f7f5f0");
  },
  monk: ({ k, t, c, a, d, hw, ox, yT, yB, bot, side, X, big, ln, F }) => {
    const rope = a ?? "#e3d2a8";
    for (const sg of t.sgs) ln([[X(0.5, sg), yT + d * 0.3], [X(0.7, sg), bot]], k.shade(c, 0.22), 0.8);
    F(big(yB - d * 0.22, d * 0.06), rope);
    ln([[ox + d * 0.05, yB - d * 0.18], [ox + d * 0.08, yB + d * 0.3]], k.ink, 2.4); ln([[ox + d * 0.05, yB - d * 0.18], [ox + d * 0.08, yB + d * 0.3]], rope, 1.2);
    for (const y of [yB + d * 0.05, yB + d * 0.18]) k.part(k.ell(ox + d * 0.07, y, d * 0.022, d * 0.018), rope, { off: 0, lw: k.lw * 0.6 });
    F(k.ell(ox, yT + d * 0.02, hw * 0.95 * (side ? 0.7 : 1), d * 0.2), k.shade(c, 0.12));
    F(k.ell(ox, yT - d * 0.02, hw * 0.6 * (side ? 0.6 : 1), d * 0.13), k.shade(c, 0.35), false);
  },
  pharaoh: ({ k, c, a, d, hw, ox, yT, yB, bot, side, three, big, ln, F }) => {
    const blue = a ?? "#2f5fa8", s = side ? 0.7 : three ? 0.9 : 1;
    F(big(yB - d * 0.3, d * 0.09), GOLD);
    F(k.poly([[ox - d * 0.1 * s, yB - d * 0.22], [ox + d * 0.1 * s, yB - d * 0.22], [ox + d * 0.14 * s, bot], [ox - d * 0.14 * s, bot]]), GOLD);
    for (const y of [yB - d * 0.1, yB + d * 0.02]) ln([[ox - d * 0.12 * s, y], [ox + d * 0.12 * s, y]], blue, 1.6);
    for (let x = -hw * 2; x < hw * 2; x += d * 0.07) if (Math.abs(x - ox) > d * 0.14 * s) ln([[x, yB - d * 0.2], [x, bot]], k.shade(c, 0.15), 0.6);
    [GOLD, blue, GOLD, "#c8372d"].forEach((col, i) => F(k.ell(ox, yT - d * 0.04, hw * (1.3 - i * 0.17) * s, d * (0.5 - i * 0.08)), col));
  },
  chainmail: ({ k, c, a, d, hw, yT, yB, bot, X, big, F }) => {
    const ml = k.shade(c, 0.35);
    let row = 0; for (let y = yT + d * 0.04; y < bot + d * 0.05; y += d * 0.08, row++) for (let x = -hw * 3 + (row % 2 ? d * 0.05 : 0); x < hw * 3; x += d * 0.1) { const q = new Path2D(); q.arc(x, y, d * 0.05, 0.15 * Math.PI, 0.85 * Math.PI); stroke(k, q, ml, k.lw * 0.6); }
    if (a) { F(k.rrect(X(0.55, -1), yT - d * 0.05, X(0.55, 1) - X(0.55, -1), bot - yT + d * 0.2, d * 0.02), a); F(big(yB - d * 0.3, d * 0.07), "#6b4a2e"); }
  },
  barista: ({ k, t, a, d, ox, yT, chest, bot, near, X, WK, ln, F }) => {
    const ap = a ?? "#2f6b4f", x0 = X(0.66, -1), x1 = X(0.66, 1);
    for (const x of [x0 + d * 0.03, x1 - d * 0.03]) { ln([[x, chest + d * 0.04], [x + (ox - x) * 0.4, yT - d * 0.05]], k.ink, 2.6); ln([[x, chest + d * 0.04], [x + (ox - x) * 0.4, yT - d * 0.05]], ap, 1.3); }
    F(k.rrect(x0, chest + d * 0.02, x1 - x0, bot - chest + d * 0.1, d * 0.04), ap);
    F(k.rrect(ox - d * 0.12, chest + d * 0.42, d * 0.24, d * 0.14, d * 0.02), k.shade(ap, 0.12));
    if (!t.side) F(k.rrect(X(0.42, near) - d * 0.065 * WK(near), chest + d * 0.12, d * 0.13 * WK(near), d * 0.06, d * 0.01), "#f7f5f0");
  },
  coverall: ({ k, t, c, d, ox, yB, chest, bot, near, X, WK, big, ln, F }) => {
    t.collar(k.shade(c, 0.15), 0.26, 0.18);
    ln([[ox, chest + d * 0.02], [ox, bot]], k.shade(c, 0.45), 1.1);
    F(big(yB - d * 0.24, d * 0.08), k.shade(c, 0.18));
    if (!t.side) { const far = -near, px = X(0.58, far); F(k.rrect(px - d * 0.08 * WK(far), chest + d * 0.08, d * 0.16 * WK(far), d * 0.15, d * 0.02), k.shade(c, 0.08)); F(k.ell(X(0.58, near), chest + d * 0.1, d * 0.085 * WK(near), d * 0.045), "#f7f5f0"); }
  },
  raincoat: ({ k, c, d, hw, ox, yT, yB, chest, X, ln, F }) => {
    for (let i = 0; i < 3; i++) { const y = chest + d * (0.08 + i * 0.17); ln([[ox - d * 0.07, y + d * 0.017], [ox + d * 0.07, y + d * 0.017]], k.shade(c, 0.5), 0.9); F(k.rrect(ox - d * 0.05, y, d * 0.1, d * 0.035, d * 0.015), CREAM); }
    for (const sg of [-1, 1]) ln([[X(0.5, sg) - d * 0.07, yB - d * 0.2], [X(0.5, sg) + d * 0.07, yB - d * 0.2]], k.shade(c, 0.4), 1.0);
    F(k.rrect(X(0.65, -1), yT - d * 0.08, X(0.65, 1) - X(0.65, -1), d * 0.2, d * 0.07), k.shade(c, 0.08));
    ln([[-hw * 0.75, chest], [-hw * 0.7, yB - d * 0.3]], "rgba(255,255,255,0.45)", 2.2);
  },
  suspenders: ({ k, t, c, a, d, ox, yT, chest, bot, X, ln }) => {
    const sp = a ?? "#7a3b2e";
    t.collar(k.tint(c, 0.3), 0.24, 0.16);
    ln([[ox, chest + d * 0.04], [ox, bot]], k.shade(c, 0.3), 0.7);
    for (let i = 0; i < 3; i++) k.dot(ox + d * 0.03, chest + d * (0.12 + i * 0.17), d * 0.018, k.shade(c, 0.4));
    for (const sg of t.sgs) { inkStroke(k, k.poly([[X(0.5, sg), yT - d * 0.05], [X(0.42, sg), bot]], false), d * 0.05, sp, 0.6); k.dot(X(0.43, sg), bot - d * 0.12, d * 0.022, GOLD); }
  },
  gown: ({ k, t, c, a, d, ox, yT, bot, three, side, X, big, F }) => {
    const sash = a ?? k.tint(c, 0.4), wy = yT + d * 0.55;
    for (const sg of t.sgs) for (const u of [0.25, 0.65, 1.05]) { const q = new Path2D(); q.moveTo(X(u * 0.6, sg), wy + d * 0.1); q.quadraticCurveTo(X(u * 0.8, sg), wy + d * 0.5, X(u * 1.3, sg), bot); stroke(k, q, k.shade(c, 0.2), k.lw * 0.8); }
    F(big(wy, d * 0.08), sash);
    k.part(k.ell(X(0.55, side ? 1 : -1), wy + d * 0.04, d * 0.07, d * 0.05), sash, { off: 0 });
    F(k.ell(ox, yT - d * 0.02, t.hw * 0.75 * (three ? 0.85 : side ? 0.6 : 1), d * 0.16), k.tint(c, 0.25));
  },
  hivis: ({ k, t, c, d, ox, yT, yB, chest, X, big, ln, F }) => {
    const sil = "#dfe3ea";
    for (const sg of t.sgs) F(k.rrect(X(0.45, sg) - d * 0.035, yT - d * 0.05, d * 0.07, chest + d * 0.16 - yT, 0), sil);
    for (const y of [chest + d * 0.12, yB - d * 0.28]) F(big(y, d * 0.07), sil);
    ln([[ox, yT + d * 0.1], [ox, yB + d * 0.1]], k.shade(c, 0.35), 0.9);
  },
  pilot: ({ k, t, c, d, tw, ox, yT, chest, bot, near, X, WK, ln, F }) => {
    F(k.poly([[ox - tw * 0.2 * WK(-1), yT], [ox + tw * 0.2 * WK(1), yT], [ox, chest + d * 0.32]]), "#f7f5f0");
    F(k.poly([[ox - d * 0.03, yT + d * 0.12], [ox + d * 0.03, yT + d * 0.12], [ox + d * 0.04, chest + d * 0.26], [ox, chest + d * 0.31], [ox - d * 0.04, chest + d * 0.26]]), "#22252e", false);
    t.collar(k.shade(c, 0.16), 0.26, 0.36);
    ln([[ox, chest + d * 0.32], [ox, bot]], k.ink, 0.7);
    for (let i = 0; i < 2; i++) k.part(k.ell(ox + d * 0.04, chest + d * (0.42 + i * 0.16), d * 0.024, d * 0.024), GOLD, { off: 0, lw: k.lw * 0.6 });
    if (!t.side) { const px = X(0.62, near), py = chest + d * 0.04, s = WK(near); for (const sg of [-1, 1]) fs(k, k.poly([[px, py - d * 0.015], [px + sg * d * 0.11 * s, py - d * 0.04], [px + sg * d * 0.07 * s, py + d * 0.02], [px, py + d * 0.02]]), GOLD, 0.5); k.dot(px, py, d * 0.025, GOLD); }
    for (const sg of t.sgs) { F(k.rrect(X(0.98, sg) - d * 0.1 * WK(sg), yT + d * 0.04, d * 0.2 * WK(sg), d * 0.06, d * 0.01), "#22252e"); ln([[X(0.98, sg) - d * 0.07 * WK(sg), yT + d * 0.07], [X(0.98, sg) + d * 0.07 * WK(sg), yT + d * 0.07]], GOLD, 0.9); }
  },
  caveman: ({ k, t, c, a, d, yT, chest, bot, side, X, F }) => {
    const rnd = seq(hash("cave" + c)), sp = a ?? k.shade(c, 0.45);
    for (let i = 0; i < 9; i++) { const x = X(-1.4 + rnd() * 2.8, 1), y = yT + d * 0.2 + rnd() * (bot - yT - d * 0.2); fillP(k, k.ell(x, y, d * (0.04 + rnd() * 0.03), d * (0.03 + rnd() * 0.02), rnd() * 3), sp); }
    if (side) return;
    const pts: V2[] = [[X(2.2, -1), yT - d * 0.12], [X(0.12, 1), yT - d * 0.08]], p1: V2 = [X(1.8, -1), chest + d * 0.3], n = 6;
    for (let i = 1; i <= n; i++) { const tt = i / n, x = pts[1][0] + (p1[0] - pts[1][0]) * tt, y = pts[1][1] + (p1[1] - pts[1][1]) * tt; pts.push([x + (i % 2 ? d * 0.04 : 0), y + (i % 2 ? d * 0.05 : 0)]); }
    F(k.poly(pts), skinOf(t));
  },
  royal: ({ k, d, hw, ox, yT, chest, bot, side, three, big, F }) => {
    const fur = "#f7f5f0", tails = (p: Path2D, n: number, seed: string) => { const rnd = seq(hash(seed)); clip(k, p, () => { for (let i = 0; i < n; i++) { const x = ox - hw * 2 + rnd() * hw * 4, y = yT - d * 0.1 + rnd() * (bot - yT + d * 0.2); fillP(k, k.ell(x, y, d * 0.022, d * 0.04), "#22252e"); } }); };
    const trim = k.rrect(ox - d * 0.07, chest, d * 0.14, bot - chest + d * 0.1, 0); F(trim, fur); tails(trim, 40, "t1");
    const hemB = big(bot - d * 0.1, d * 0.2); F(hemB, fur, false); tails(hemB, 40, "t2");
    const col = fuzzP(ox, yT, hw * 1.45 * (side ? 0.8 : three ? 0.92 : 1), d * 0.46, 16, 0.04); F(col, fur); tails(col, 34, "t3");
    stroke(k, k.poly([[ox - d * 0.12, yT + d * 0.28], [ox, yT + d * 0.32], [ox + d * 0.12, yT + d * 0.28]], false), GOLD, k.lw * 1.2);
  },
  cloak: ({ k, c, a, d, ox, yT, chest, bot, X, ln, F }) => {
    const inner = a ?? "#6b4a2e";
    F(k.poly([[X(0.15, -1), yT], [X(0.15, 1), yT], [X(0.32, 1), bot + d * 0.1], [X(0.32, -1), bot + d * 0.1]]), inner);
    for (const sg of [-1, 1]) ln([[X(0.15, sg), yT], [X(0.32, sg), bot]], k.shade(c, 0.4), 0.9);
    stroke(k, k.poly([[X(0.3, -1), chest - d * 0.08], [ox, chest - d * 0.04], [X(0.3, 1), chest - d * 0.08]], false), GOLD, k.lw * 0.9);
    k.part(k.ell(ox, chest - d * 0.04, d * 0.045, d * 0.045), GOLD, { off: 0 });
  },
};

export function drawTopX(k: Kit, t: TopCtx): boolean {
  const fn = (TOPS as Record<string, ((e: TE) => void) | undefined>)[t.st];
  if (!fn) return false;
  const { d, hw, tw, ox, yT, yB, hem, chest, wL, wR, side, three } = t, WK = (sg: number) => (sg < 0 ? wL : wR);
  k.g.save(); k.g.lineCap = "round"; k.g.lineJoin = "round";
  fn({ k, t, c: t.color, a: t.accent, d, hw, tw, ox, yT, yB, bot: Math.max(yB, hem), chest, th: yB - yT, side, three, near: side ? 1 : -1, WK,
    X: (u, sg) => ox + sg * u * hw * WK(sg), big: (y, h) => k.rrect(-hw * 4, y, hw * 8, h, 0),
    ln: (pts, col = k.ink, wk = 0.7) => stroke(k, k.poly(pts, false), col, k.lw * wk), F: (p, col, st = true) => t.fill(p, col, st) });
  k.g.restore();
  return true;
}

/** Garments behind the body: capes (cape, supersuit: accent; cloak, royal: the top colour) and resting hoods (monk, raincoat). */
export function drawTopBackX(k: Kit, t: TopBackCtx): void {
  const { st, d, tw, yT, yB, hem, side, three } = t;
  const cape = (col: string, bottom: number, ermine = false) => {
    const p = side ? P([[tw * 0.15, yT], [-tw * 0.5, yT + d * 0.1, -tw * 1.05, bottom], [-tw * 0.15, bottom + d * 0.04], [-tw * 0.1, yB, tw * 0.15, yT]])
      : three ? P([[-tw * 0.5, yT + d * 0.02], [-tw * 0.95, yT + d * 0.3, -tw * 1.0, bottom], [-tw * 0.4, bottom + d * 0.06, tw * 0.2, bottom], [tw * 0.65, yT + d * 0.3, tw * 0.42, yT + d * 0.02]])
      : P([[-tw * 0.45, yT + d * 0.02], [-tw * 0.8, yT + d * 0.3, -tw * 0.92, bottom], [-tw * 0.45, bottom + d * 0.06, 0, bottom], [tw * 0.45, bottom + d * 0.06, tw * 0.92, bottom], [tw * 0.8, yT + d * 0.3, tw * 0.45, yT + d * 0.02]]);
    k.part(p, k.shade(col, 0.1), { off: d * 0.05, thick: true });
    clip(k, p, () => {
      for (const x of side ? [-0.5, -0.8] : [-0.6, -0.25, 0.25, 0.6]) stroke(k, k.poly([[x * 0.6 * tw, yT + 0.4 * tw], [x * tw, bottom - 0.05 * tw]], false), k.shade(col, 0.32), k.lw * 0.8);
      if (ermine) { const rnd = seq(7); fillP(k, k.rrect(-tw * 2, bottom - d * 0.14, tw * 4, d * 0.3, 0), "#f7f5f0"); for (let i = 0; i < 14; i++) fillP(k, k.ell(-tw * 1.1 + rnd() * tw * 2.2, bottom - d * 0.1 + rnd() * d * 0.12, d * 0.016, d * 0.032), "#22252e"); }
    });
    if (ermine) stroke(k, p, k.ink, k.lw);
  };
  if (st === "cape" || st === "supersuit") cape(t.accent ?? "#b8322f", yB + d * 0.85);
  else if (st === "cloak") cape(t.color, Math.max(hem, yB) + d * 0.38);
  else if (st === "royal") cape(t.color, Math.max(hem, yB) + d * 0.3, true);
  else if (st === "monk" || st === "raincoat") {
    const col = k.shade(t.color, 0.12);
    if (side) k.part(k.ell(-tw * 0.42, yT + d * 0.06, d * 0.26, d * 0.22), col, { off: d * 0.03 });
    else if (three) k.part(k.ell(-tw * 0.36, yT + d * 0.04, d * 0.3, d * 0.2), col, { off: d * 0.03 });
    else k.part(k.ell(0, yT + d * 0.02, d * 0.44, d * 0.2), col, { off: d * 0.03 });
  }
}

// ================================================================ neckwear (at the collar point)
type NE = { k: Kit; n: NeckCtx; c: string; x: number; y: number; d: number; side: boolean; three: boolean; wl: number; wr: number;
  /** a hanging arc from the neck sides down to depth `dep` below the collar point; pts(dep, m) = m points along it */
  arc(dep: number, w?: number): Path2D; pts(dep: number, m: number, w?: number): V2[] };
const NECKS: Record<NeckX, (e: NE) => void> = {
  necklace: ({ k, c, x, y, d, side, arc }) => { inkStroke(k, arc(d * 0.1), d * 0.028, c, 0.5); const px = side ? x + d * 0.08 : x, py = y + d * (side ? 0.07 : 0.11), s = d * 0.055; k.part(P([[0, -1], [0.75, 0, 0, 1.2], [-0.75, 0, 0, -1]], s, { dx: px / s, dy: py / s }), "#d8344e", { off: d * 0.015, lw: k.lw * 0.8 }); },
  pearls: ({ k, d, pts }) => { for (const [px, py] of pts(d * 0.09, 11)) k.part(k.ell(px, py, d * 0.03, d * 0.03), "#f6f3ea", { off: d * 0.008, lw: k.lw * 0.6 }); },
  medal: ({ k, c, x, y, d, side, wl, wr }) => {
    const bx = side ? x + d * 0.06 : x, by = y + d * 0.12;
    for (const [sx, ex] of side ? [[x - d * 0.22, bx]] : [[x - d * 0.13 * wl, bx - d * 0.02], [x + d * 0.13 * wr, bx + d * 0.02]]) k.part(k.poly([[sx - d * 0.035, y - d * 0.24], [sx + d * 0.035, y - d * 0.24], [ex + d * 0.03, by], [ex - d * 0.03, by]]), c, { off: 0, lw: k.lw * 0.8 });
    k.part(k.ell(bx, by + d * 0.07, d * 0.08, d * 0.08), GOLD, { off: d * 0.02, thick: true }); fs(k, starP(bx, by + d * 0.07, d * 0.045, d * 0.02), k.shade(GOLD, 0.2), 0.5);
  },
  lanyard: ({ k, c, x, y, d, side, arc }) => {
    inkStroke(k, arc(d * 0.12), d * 0.025, c, 0.5);
    const cx = side ? x + d * 0.06 : x, cy = y + d * (side ? 0.1 : 0.14), w = d * (side ? 0.07 : 0.15);
    const card = k.rrect(cx - w / 2, cy, w, d * 0.2, d * 0.02); k.part(card, "#f7f5f0", { off: 0, lw: k.lw * 0.8 });
    clip(k, card, () => { fillP(k, k.rrect(cx - w, cy, w * 2, d * 0.05, 0), c); if (!side) { fillP(k, k.rrect(cx - w * 0.36, cy + d * 0.07, w * 0.32, d * 0.08, 0), "#b9c1cc"); stroke(k, k.poly([[cx + w * 0.06, cy + d * 0.09], [cx + w * 0.36, cy + d * 0.09]], false), "#7d8696", k.lw * 0.7); stroke(k, k.poly([[cx + w * 0.06, cy + d * 0.13], [cx + w * 0.3, cy + d * 0.13]], false), "#7d8696", k.lw * 0.7); } });
    stroke(k, card, k.ink, k.lw * 0.8); k.dot(cx, cy, d * 0.02, "#8a8f9c");
  },
  bandanaNeck: ({ k, c, x, y, d, side, wl, wr }) => {
    const L = side ? x - d * 0.3 : x - d * 0.26 * wl, R = side ? x + d * 0.14 : x + d * 0.26 * wr;
    k.part(k.rrect(L, y - d * 0.22, R - L, d * 0.1, d * 0.05), k.shade(c, 0.1), { off: 0 });
    const tri = side ? k.poly([[x - d * 0.02, y - d * 0.15], [x + d * 0.15, y - d * 0.15], [x + d * 0.1, y + d * 0.12]]) : k.poly([[x - d * 0.17 * wl, y - d * 0.15], [x + d * 0.17 * wr, y - d * 0.15], [x, y + d * 0.14]]);
    k.part(tri, c, { off: d * 0.02 });
    clip(k, tri, () => { for (let yy = y - d * 0.12; yy < y + d * 0.15; yy += d * 0.07) for (let xx = x - d * 0.2; xx < x + d * 0.2; xx += d * 0.07) k.dot(xx, yy, d * 0.015, CREAM); });
  },
  collar: ({ k, n, x, y, d, side, wl, wr }) => { for (const sg of side ? [1] : n.sgs) k.part(k.ell(x + sg * d * 0.1 * (sg < 0 ? wl : wr) + (side ? d * 0.02 : 0), y - d * 0.13, d * 0.13 * (sg < 0 ? wl : wr), d * 0.08, sg * 0.35), "#f7f5f0", { off: d * 0.01 }); },
  ruff: ({ k, x, y, d, side }) => { const cx = side ? x - d * 0.08 : x, p = fuzzP(cx, y - d * 0.17, d * (side ? 0.3 : 0.38), d * 0.12, 18, 0.12); k.part(p, "#f7f5f0", { off: d * 0.02 }); clip(k, p, () => { for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; stroke(k, k.poly([[cx + Math.cos(a) * d * 0.15, y - d * 0.17 + Math.sin(a) * d * 0.05], [cx + Math.cos(a) * d * 0.42, y - d * 0.17 + Math.sin(a) * d * 0.14]], false), "#c9cdd6", k.lw * 0.6); } }); },
  chain: ({ k, c, d, pts }) => { pts(d * 0.1, 12).forEach(([px, py], i) => k.part(i % 2 ? k.ell(px, py, d * 0.026, d * 0.016) : k.ell(px, py, d * 0.016, d * 0.026), c, { off: 0, lw: k.lw * 0.6 })); },
  whistle: ({ k, c, x, y, d, side, arc }) => { inkStroke(k, arc(d * 0.08), d * 0.016, c, 0.45); const wx = side ? x + d * 0.06 : x + d * 0.02, wy = y + d * 0.1; k.part(k.rrect(wx - d * 0.03, wy - d * 0.02, d * 0.12, d * 0.05, d * 0.015), STEEL, { off: 0, lw: k.lw * 0.7 }); k.part(k.ell(wx, wy + d * 0.02, d * 0.045, d * 0.045), STEEL, { off: d * 0.01, lw: k.lw * 0.7 }); },
  stethoscope: ({ k, c, x, y, d, side, wl, wr }) => {
    const tube = (pts: number[][]) => inkStroke(k, P(pts, 1, { close: false }), d * 0.032, c, 0.5);
    if (side) { tube([[x - d * 0.25, y - d * 0.24], [x - d * 0.05, y - d * 0.05, x + d * 0.08, y + d * 0.2]]); k.part(k.ell(x + d * 0.08, y + d * 0.24, d * 0.05, d * 0.05), STEEL, { off: d * 0.01 }); return; }
    tube([[x - d * 0.2 * wl, y - d * 0.24], [x - d * 0.18 * wl, y + d * 0.05, x - d * 0.1 * wl, y + d * 0.22]]); tube([[x + d * 0.2 * wr, y - d * 0.24], [x + d * 0.17 * wr, y + d * 0.0, x + d * 0.12 * wr, y + d * 0.1]]);
    k.part(k.ell(x - d * 0.1 * wl, y + d * 0.26, d * 0.055, d * 0.055), STEEL, { off: d * 0.012 }); k.dot(x - d * 0.1 * wl, y + d * 0.26, d * 0.025, "#8a8f9c");
    for (const sg of [-1, 1]) k.dot(x + d * 0.12 * wr + sg * d * 0.025, y + d * 0.12, d * 0.02, "#22252e");
  },
  ascot: ({ k, c, x, y, d, side }) => {
    const ax = side ? x + d * 0.05 : x, sx = side ? 0.6 : 1, sh = k.shade(c, 0.3);
    k.part(P([[-0.07, -0.2], [0.07, -0.2], [0.17, 0.0, 0.1, 0.15], [0.04, 0.21, 0, 0.13], [-0.04, 0.21, -0.1, 0.15], [-0.17, 0.0, -0.07, -0.2]], d, { sx, dx: ax / d, dy: y / d }), c, { off: d * 0.03 });
    for (const s2 of [-1, 1]) stroke(k, P([[s2 * 0.03, -0.12], [s2 * 0.09, 0.0, s2 * 0.06, 0.13]], d, { close: false, sx, dx: ax / d, dy: y / d }), sh, k.lw * 0.7);
    k.part(k.ell(ax, y - d * 0.15, d * 0.075 * sx, d * 0.055), k.shade(c, 0.12), { off: 0 }); k.dot(ax, y + d * 0.03, d * 0.026, GOLD);
  },
  bolo: ({ k, c, x, y, d, side, wl, wr }) => {
    const sx = side ? x + d * 0.06 : x, sy = y - d * 0.02;
    for (const px of side ? [x - d * 0.25] : [x - d * 0.15 * wl, x + d * 0.15 * wr]) stroke(k, k.poly([[px, y - d * 0.24], [sx, sy]], false), c, k.lw * 0.9);
    for (const dx of side ? [0.01] : [-0.025, 0.025]) { stroke(k, k.poly([[sx + dx * d, sy], [sx + dx * d * 1.4, y + d * 0.26]], false), c, k.lw * 0.9); k.part(k.rrect(sx + dx * d * 1.4 - d * 0.012, y + d * 0.24, d * 0.024, d * 0.05, d * 0.01), STEEL, { off: 0, lw: k.lw * 0.5 }); }
    k.part(k.ell(sx, sy, d * 0.06 * (side ? 0.6 : 1), d * 0.07), STEEL, { off: d * 0.01 }); k.dot(sx, sy, d * 0.035, "#3fb6a8");
  },
  lei: ({ k, c, d, pts }) => { const cols = [c, "#f6d04d", CREAM, "#f28fb0"]; pts(d * 0.2, 11, 1.55).forEach(([px, py], i) => flower(k, px, py, d * 0.06, cols[i % cols.length], "#e07a3a", 0.6)); },
  neckerchief: ({ k, c, x, y, d, side, wl, wr }) => {
    const L = side ? x - d * 0.3 : x - d * 0.24 * wl, R = side ? x + d * 0.12 : x + d * 0.24 * wr, nx = side ? x + d * 0.06 : x;
    k.part(k.rrect(L, y - d * 0.24, R - L, d * 0.12, d * 0.06), c, { off: 0 });
    for (const dx of side ? [0.02] : [-0.032, 0.032]) k.part(k.poly([[nx + dx * d - d * 0.03, y - d * 0.04], [nx + dx * d + d * 0.03, y - d * 0.04], [nx + dx * d * 2.4 + d * 0.045, y + d * 0.24], [nx + dx * d * 2.4 - d * 0.045, y + d * 0.24]]), c, { off: 0, lw: k.lw * 0.8 });
    k.part(k.rrect(nx - d * 0.045, y - d * 0.06, d * 0.09, d * 0.06, d * 0.02), "#c8a24a", { off: 0, lw: k.lw * 0.8 });
  },
  scarfLong: ({ k, n, c, x, y, d, side }) => {
    const st = n.hw, wrap = k.rrect(side ? x - d * 0.3 : -st * 0.98, y - d * 0.13, side ? d * 0.44 : st * 1.96, d * 0.2, d * 0.09);
    const tx = side ? x + d * 0.02 : x + st * 0.25, tail = k.poly([[tx - d * 0.07, y + d * 0.02], [tx + d * 0.07, y + d * 0.02], [tx + d * 0.09, y + d * 0.72], [tx - d * 0.05, y + d * 0.72]]);
    k.part(tail, c, { off: d * 0.02 }); clip(k, tail, () => { for (const yy of [y + d * 0.3, y + d * 0.42, y + d * 0.54]) fillP(k, k.rrect(tx - d * 0.2, yy, d * 0.4, d * 0.05, 0), CREAM); });
    stroke(k, tail, k.ink, k.lw);
    for (let i = 0; i < 4; i++) stroke(k, k.poly([[tx - d * 0.04 + i * d * 0.04, y + d * 0.72], [tx - d * 0.04 + i * d * 0.042, y + d * 0.8]], false), c, k.lw * 1.0);
    k.part(wrap, c, { off: d * 0.03 }); clip(k, wrap, () => fillP(k, k.rrect(-d, y - d * 0.06, d * 2, d * 0.05, 0), CREAM)); stroke(k, wrap, k.ink, k.lw);
  },
  headphonesNeck: ({ k, c, x, y, d, side, wl, wr }) => {
    const cups: V2[] = side ? [[x - d * 0.05, y - d * 0.14]] : [[x - d * 0.2 * wl, y - d * 0.13], [x + d * 0.2 * wr, y - d * 0.13]];
    inkStroke(k, side ? P([[x - d * 0.3, y - d * 0.2], [x - d * 0.15, y - d * 0.05, x - d * 0.05, y - d * 0.1]], 1, { close: false }) : P([[cups[0][0], y - d * 0.13], [x, y - d * 0.0, cups[1][0], y - d * 0.13]], 1, { close: false }), d * 0.045, c, 0.6);
    for (const [cx, cy] of cups) { k.part(k.ell(cx, cy, d * 0.1, d * 0.075), c, { off: d * 0.015 }); k.part(k.ell(cx, cy - d * 0.01, d * 0.06, d * 0.04), "#e04a3a", { off: 0, lw: k.lw * 0.6 }); }
  },
  amulet: ({ k, c, x, y, d, side, arc }) => { inkStroke(k, arc(d * 0.1), d * 0.018, "#6b4a2e", 0.45); const px = side ? x + d * 0.07 : x, py = y + d * 0.15; k.part(k.ell(px, py, d * 0.075, d * 0.075), GOLD, { off: d * 0.015, thick: true }); k.part(k.ell(px, py, d * 0.045, d * 0.045), c, { off: d * 0.01, lw: k.lw * 0.6 }); k.dot(px - d * 0.015, py - d * 0.015, d * 0.012, "#ffffff"); },
  key: ({ k, c, x, y, d, side, arc }) => {
    inkStroke(k, arc(d * 0.08), d * 0.016, "#6b4a2e", 0.45);
    const kx = side ? x + d * 0.07 : x, ky = y + d * 0.13;
    k.part(ringP(kx, ky, d * 0.05, d * 0.05, d * 0.022, d * 0.022), c, { off: 0, lw: k.lw * 0.7 });
    k.part(k.poly([[kx - d * 0.016, ky + d * 0.045], [kx + d * 0.016, ky + d * 0.045], [kx + d * 0.016, ky + d * 0.22], [kx + d * 0.06, ky + d * 0.22], [kx + d * 0.06, ky + d * 0.18], [kx + d * 0.016, ky + d * 0.18], [kx + d * 0.016, ky + d * 0.16], [kx + d * 0.05, ky + d * 0.16], [kx + d * 0.05, ky + d * 0.12], [kx + d * 0.016, ky + d * 0.12], [kx + d * 0.016, ky + d * 0.1], [kx - d * 0.016, ky + d * 0.1]]), c, { off: 0, lw: k.lw * 0.6 });
  },
};

export function drawNeckX(k: Kit, n: NeckCtx): boolean {
  const fn = (NECKS as Record<string, ((e: NE) => void) | undefined>)[n.style];
  if (!fn) return false;
  const { x, y, side, three } = n, d = n.d * 1.2, wl = 1, wr = three ? 0.62 : 1; /* neckwear reads 20 % larger than life: the torso is small next to the big head */
  const ends = (dep: number, w = 1): [V2, V2, V2] => {
    const L: V2 = side ? [x - d * 0.28, y - d * 0.25] : [x - d * 0.17 * wl * w, y - d * 0.24], R: V2 = side ? [x + d * 0.1, y + dep * 0.55] : [x + d * 0.17 * wr * w, y - d * 0.24];
    const C: V2 = side ? [x - d * 0.08, y + dep * 1.2] : [x + (three ? -d * 0.02 : 0), 2 * (y + dep) - 0.5 * (L[1] + R[1])]; return [L, C, R]; };
  const e: NE = { k, n, c: n.color, x, y, d, side, three, wl, wr,
    arc: (dep, w = 1) => { const [L, C, R] = ends(dep, w), q = new Path2D(); q.moveTo(L[0], L[1]); q.quadraticCurveTo(C[0], C[1], R[0], R[1]); return q; },
    pts: (dep, m, w = 1) => { const [L, C, R] = ends(dep, w), out: V2[] = []; for (let i = 0; i < m; i++) { const t = (side ? 0.25 : 0.06) + (i / (m - 1)) * (side ? 0.75 : 0.88); out.push([(1 - t) ** 2 * L[0] + 2 * t * (1 - t) * C[0] + t * t * R[0], (1 - t) ** 2 * L[1] + 2 * t * (1 - t) * C[1] + t * t * R[1]]); } return out; } };
  k.g.save(); fn(e); k.g.restore();
  return true;
}

// ================================================================ held props (hand space; u = prop unit, one head diameter at len 1.7)
type PE = { k: Kit; g: CanvasRenderingContext2D; u: number; w: number; c?: string; open?: number;
  Q(pts: number[][], o?: PO): Path2D; E(x: number, y: number, rx: number, ry: number, rot?: number): Path2D; R(x: number, y: number, w: number, h: number, rr: number): Path2D;
  pt(p: Path2D, col: string, o?: number, thick?: boolean): void; fs(p: Path2D, col: string, lk?: number): void; sk(p: Path2D, col: string, wk: number): void;
  ln(pts: number[][], col: string, wk: number): void; dot(x: number, y: number, rr: number, col: string): void; up(): void;
  /** go to (x, y) and turn upright there (flames, dangling lines at the end of a tool) */
  at(x: number, y: number): void };
/** a straight wooden / plastic handle along +x from x0 to x1 (units), width wk x the limb width */
const handle = (e: PE, x0: number, x1: number, col: string, wk = 0.7) => e.pt(e.k.rrect(x0 * e.u, -e.w * wk * 0.5, (x1 - x0) * e.u, e.w * wk, e.w * wk * 0.45), col, 0);
/** a stem / stick going straight up from the hand (upright space) */
const stem = (e: PE, y0: number, y1: number, col: string, wk = 0.6) => e.pt(e.k.rrect(-e.w * wk * 0.5, y1 * e.u, e.w * wk, (y0 - y1) * e.u, e.w * wk * 0.45), col, 0);
const flame = (e: PE, x: number, y: number, s = 1) => { e.pt(e.Q([[0, -0.36], [0.2, -0.12, 0.13, 0.02], [0.06, 0.12, 0, 0.12], [-0.06, 0.12, -0.13, 0.02], [-0.2, -0.12, 0, -0.36]], { sx: s, sy: s, dx: x, dy: y }), "#f08a2b", 0); e.pt(e.Q([[0, -0.2], [0.1, -0.05, 0.06, 0.04], [0, 0.1, -0.06, 0.04], [-0.1, -0.05, 0, -0.2]], { sx: s, sy: s, dx: x, dy: y + 0.02 }), "#ffd24a", 0); };
const hangHandle = (e: PE, col: string, hw = 0.1) => inkStroke(e.k, P([[-hw, 0.1], [-hw, -0.03, 0, -0.03], [hw, -0.03, hw, 0.1]], e.u, { close: false }), e.w * 0.35, col, 0.6);
const PROPS: Record<PropX, (e: PE) => void> = {
  book: (e) => { e.up(); const { R, pt, fs, k, c } = e, col = c ?? "#3d6fb0";
    if ((e.open ?? 0) >= 0.5) { pt(e.Q([[-0.36, -0.42], [0, -0.36], [0.36, -0.42], [0.36, 0.0], [0, 0.04], [-0.36, 0.0]]), col, 0); fs(e.Q([[-0.33, -0.44], [-0.15, -0.46, 0, -0.38], [0, 0.0], [-0.15, -0.06, -0.33, -0.04]]), PAPER); fs(e.Q([[0.33, -0.44], [0.15, -0.46, 0, -0.38], [0, 0.0], [0.15, -0.06, 0.33, -0.04]]), PAPER); for (const s of [-1, 1]) for (let i = 0; i < 4; i++) e.ln([[s * 0.07, -0.32 + i * 0.07], [s * 0.27, -0.33 + i * 0.07]], "#9aa1ad", 0.6); return; }
    pt(R(-0.16, -0.5, 0.34, 0.48, 0.03), col, 1, true); fs(R(0.13, -0.47, 0.04, 0.42, 0.01), PAPER, 0.5); fillP(k, R(-0.16, -0.5, 0.05, 0.48, 0.02), k.shade(col, 0.25)); fs(R(-0.07, -0.4, 0.18, 0.08, 0.01), CREAM, 0.5); },
  wrench: (e) => { const { pt, u } = e; handle(e, -0.12, 0.42, STEEL, 0.75); const p = new Path2D(); p.arc(0.52 * u, 0, 0.13 * u, 0.7, TAU - 0.7); p.arc(0.52 * u, 0, 0.055 * u, TAU - 0.7, 0.7, true); p.closePath(); pt(p, STEEL, 0.4, true); },
  sword: (e) => { const { Q, R, pt, ln, dot, c } = e; handle(e, -0.14, 0.1, "#6b3f26", 0.85); dot(-0.16, 0, 0.05, GOLD); pt(Q([[0.14, -0.065], [1.05, -0.05], [1.2, 0], [1.05, 0.05], [0.14, 0.065]]), c ?? "#d3dae6", 0.4, true); ln([[0.2, 0], [1.02, 0]], "rgba(255,255,255,0.75)", 1.2); pt(R(0.08, -0.2, 0.08, 0.4, 0.03), GOLD, 0); },
  shield: (e) => { e.up(); const { Q, pt, k, c } = e, col = c ?? "#2f5fa8", s = Q([[-0.32, -0.42], [0.32, -0.42], [0.32, -0.05], [0.3, 0.3, 0, 0.45], [-0.3, 0.3, -0.32, -0.05]], { dx: 0.16 });
    pt(s, col, 0.6, true); clip(k, s, () => { fillP(k, e.R(-0.3, -0.12, 1.0, 0.16, 0), "#f2c94c"); stroke(k, s, "#c4cad4", e.u * 0.08); }); stroke(k, s, k.ink, k.lw); e.dot(0.16, -0.04, 0.06, "#c4cad4"); },
  umbrella: (e) => { e.up(); const { Q, pt, sk, k, u, c } = e, col = c ?? "#d9534f";
    if (e.open === 0) { k.g.rotate(-Math.PI / 2); handle(e, -0.05, 1.0, INKD, 0.5); pt(Q([[0.25, -0.08], [0.95, 0], [0.25, 0.08]]), col, 0); return; }
    stroke(k, P([[0, 0.12], [0, 0.22, -0.1, 0.22]], u, { close: false }), INKD, k.lw * 1.6); inkStroke(k, P([[0, 0.12], [0, -1.25]], u, { close: false }), e.w * 0.35, INKD, 0.5);
    const can = Q([[-0.78, -1.0], [-0.72, -1.58, 0, -1.62], [0.72, -1.58, 0.78, -1.0], [0.58, -1.1, 0.39, -1.0], [0.2, -1.1, 0, -1.0], [-0.2, -1.1, -0.39, -1.0], [-0.58, -1.1, -0.78, -1.0]]);
    pt(can, col, 0.8, true); clip(k, can, () => { fillP(k, Q([[-0.39, -1.0], [-0.05, -1.62], [0.0, -1.62], [-0.2, -0.95]]), k.tint(col, 0.3)); fillP(k, Q([[0.39, -1.0], [0.05, -1.62], [0.22, -1.62], [0.6, -1.0]]), k.tint(col, 0.3)); });
    for (const x of [-0.39, 0, 0.39]) sk(Q([[x, -1.0], [0, -1.6]], { close: false }), k.shade(col, 0.35), 0.7); stroke(k, can, k.ink, k.lw); e.dot(0, -1.66, 0.04, INKD); },
  briefcase: (e) => { e.up(); const { R, pt, sk, dot, k, u, c } = e, col = c ?? "#7a4a2a"; hangHandle(e, k.shade(col, 0.2)); pt(R(-0.32, 0.08, 0.64, 0.44, 0.06), col, 1, true); sk(P([[-0.32, 0.22], [0.32, 0.22]], u, { close: false }), k.shade(col, 0.35), 0.8); dot(-0.18, 0.22, 0.035, GOLD); dot(0.18, 0.22, 0.035, GOLD); },
  camera: (e) => { e.up(); const { R, E, pt, fs, dot, c } = e, col = c ?? INKD; pt(R(-0.12, -0.38, 0.14, 0.08, 0.02), col, 0); pt(R(-0.25, -0.32, 0.5, 0.3, 0.05), col, 0.6, true); fs(R(0.12, -0.29, 0.08, 0.05, 0.01), "#f7f5f0", 0.5); pt(E(0, -0.17, 0.12, 0.12), "#7d8696", 0.4); fs(E(0, -0.17, 0.075, 0.075), "#1c2a3e", 0.5); dot(-0.025, -0.2, 0.025, "#ffffff"); },
  magnifier: (e) => { const { E, pt, k, u, g } = e; handle(e, -0.12, 0.34, INKD, 0.85); pt(e.R(0.3, -0.04, 0.08, 0.08, 0.02), "#8a8f9c", 0); g.fillStyle = "rgba(170,220,255,0.35)"; g.fill(E(0.56, 0, 0.18, 0.18)); k.part(ringP(0.56 * u, 0, 0.21 * u, 0.21 * u, 0.16 * u, 0.16 * u), "#c4cad4", { off: 0.02 * u }); stroke(k, P([[0.46, -0.06], [0.52, -0.12]], u, { close: false }), "rgba(255,255,255,0.85)", u * 0.035); },
  guitar: (e) => { e.up(); const { R, E, pt, sk, dot, k, u, c } = e, col = c ?? "#d98a3a"; pt(R(-0.06, -0.48, 0.12, 0.16, 0.03), "#3a2a20", 0); for (const y of [-0.44, -0.38]) for (const s of [-1, 1]) dot(s * 0.08, y, 0.022, STEEL); pt(R(-0.04, -0.34, 0.08, 0.86, 0.02), "#6b3f26", 0);
    union(k, [E(0, 0.62, 0.21, 0.19), E(0, 0.94, 0.28, 0.24)], col); fillP(k, E(0.05, 0.62, 0.12, 0.1), "rgba(255,255,255,0.15)"); dot(0, 0.66, 0.08, "#2b1d14"); pt(R(-0.1, 0.98, 0.2, 0.05, 0.01), "#3a2a20", 0); for (const x of [-0.012, 0.012]) sk(P([[x, -0.32], [x, 0.98]], u, { close: false }), CREAM, 0.4); },
  mic: (e) => { e.up(); const { Q, E, pt, k, u, c } = e; pt(Q([[-0.045, 0.12], [0.045, 0.12], [0.06, -0.22], [-0.06, -0.22]]), INKD, 0); const head = E(0, -0.32, 0.11, 0.12); pt(head, c ?? "#9aa1ad", 0.4, true); clip(k, head, () => { for (let i = -2; i <= 2; i++) { stroke(k, P([[i * 0.045, -0.46], [i * 0.045, -0.18]], u, { close: false }), "rgba(40,40,50,0.4)", k.lw * 0.45); stroke(k, P([[-0.15, -0.32 + i * 0.045], [0.15, -0.32 + i * 0.045]], u, { close: false }), "rgba(40,40,50,0.4)", k.lw * 0.45); } }); pt(e.R(-0.075, -0.24, 0.15, 0.04, 0.01), "#5d6470", 0); },
  broom: (e) => { const { Q, pt, sk, k } = e; handle(e, -0.3, 1.22, WOOD, 0.6); const b = Q([[1.18, -0.07], [1.62, -0.2], [1.66, 0.2], [1.18, 0.07]]); pt(b, "#e2c27a", 0.4, true); clip(k, b, () => { for (const y of [-0.12, -0.04, 0.04, 0.12]) sk(Q([[1.25, y * 0.5], [1.66, y * 1.5]], { close: false }), k.shade("#e2c27a", 0.3), 0.6); }); pt(e.R(1.14, -0.09, 0.08, 0.18, 0.02), "#c8372d", 0); },
  pizza: (e) => { e.up(); const { Q, R, pt, dot } = e; pt(Q([[-0.2, -0.02], [0.2, -0.02], [0.02, -0.56]]), "#f6c75a", 0.5); for (const [x, y] of [[-0.04, -0.14], [0.07, -0.25], [0.0, -0.38]]) dot(x, y, 0.045, "#c8372d"); pt(R(-0.24, -0.08, 0.48, 0.11, 0.05), "#c98a4a", 0.4); },
  ball: (e) => { e.up(); const { E, pt, sk, k, u, c } = e, col = c ?? "#e8833a", b = E(0, -0.2, 0.2, 0.2); pt(b, col, 0.6, true); clip(k, b, () => { sk(P([[0, -0.4], [0, 0.0]], u, { close: false }), INKD, 0.8); sk(P([[-0.2, -0.2], [0.2, -0.2]], u, { close: false }), INKD, 0.8); sk(P([[-0.13, -0.36], [-0.04, -0.2, -0.13, -0.04]], u, { close: false }), INKD, 0.8); sk(P([[0.13, -0.36], [0.04, -0.2, 0.13, -0.04]], u, { close: false }), INKD, 0.8); }); stroke(k, b, k.ink, k.lw); fillP(k, E(-0.07, -0.29, 0.05, 0.035, -0.6), "rgba(255,255,255,0.45)"); },
  torch: (e) => { const { Q, pt } = e; pt(Q([[-0.1, -0.045], [0.5, -0.07], [0.5, 0.07], [-0.1, 0.045]]), WOOD, 0); pt(e.R(0.46, -0.09, 0.14, 0.18, 0.04), "#c9b48a", 0); e.at(0.6, 0); flame(e, 0, -0.06, 1.25); },
  pen: (e) => { const { Q, R, pt, c } = e, col = c ?? "#2f5fa8"; pt(R(-0.06, -0.035, 0.34, 0.07, 0.03), col, 0); pt(Q([[0.28, -0.03], [0.38, 0], [0.28, 0.03]]), "#d8dde6", 0); pt(R(-0.02, -0.055, 0.12, 0.02, 0.01), "#d8dde6", 0); },
  map: (e) => { e.up(); e.g.translate(0, e.u * 0.12); const { Q, R, pt, sk, k, u } = e, m = R(-0.12, -0.6, 0.62, 0.48, 0.02); pt(m, "#efe0b8", 0.4); clip(k, m, () => { fillP(k, e.E(0.32, -0.46, 0.14, 0.08), "#8fc1df"); for (const x of [0.09, 0.29]) sk(Q([[x, -0.6], [x, -0.12]], { close: false }), "rgba(120,90,50,0.35)", 0.8); }); stroke(k, m, k.ink, k.lw * 0.9); const q = Q([[-0.04, -0.2], [0.1, -0.36, 0.2, -0.26], [0.3, -0.18, 0.34, -0.34]], { close: false }); k.g.save(); k.g.setLineDash([u * 0.04, u * 0.035]); stroke(k, q, "#c8372d", k.lw * 0.9); k.g.restore(); for (const s of [-1, 1]) sk(Q([[0.29, -0.36 - 0.05 * s], [0.39, -0.36 + 0.05 * s]], { close: false }), "#c8372d", 1.2); },
  money: (e) => { e.up(); const { k, u, c } = e, col = c ?? "#7cbf7a"; for (const a of [-0.38, 0, 0.38]) { k.g.save(); k.g.rotate(a); k.part(k.rrect(-0.11 * u, -0.48 * u, 0.22 * u, 0.42 * u, 0.02 * u), col, { off: 0.01 * u, lw: k.lw * 0.8 }); stroke(k, k.ell(0, -0.27 * u, 0.06 * u, 0.1 * u), k.shade(col, 0.35), k.lw * 0.7); label(k, "$", 0, -0.27 * u, 0.12 * u, k.shade(col, 0.4), false); k.g.restore(); } },
  trophy: (e) => { e.up(); const { Q, R, pt, sk, k, u, c } = e, col = c ?? GOLD; for (const s of [-1, 1]) inkStroke(k, P([[s * 0.2, -0.58], [s * 0.36, -0.58, s * 0.3, -0.42], [s * 0.25, -0.34, s * 0.12, -0.36]], u, { close: false }), u * 0.04, col, 0.6); pt(Q([[-0.22, -0.64], [0.22, -0.64], [0.22, -0.3, 0, -0.27], [-0.22, -0.3, -0.22, -0.64]]), col, 0.6, true); pt(R(-0.04, -0.3, 0.08, 0.12, 0.01), col, 0); pt(R(-0.16, -0.19, 0.32, 0.14, 0.03), "#5a3a26", 0.3); pt(R(-0.08, -0.15, 0.16, 0.06, 0.01), col, 0); sk(Q([[-0.12, -0.58], [-0.1, -0.4]], { close: false }), "rgba(255,255,255,0.7)", 1.4); },
  bouquet: (e) => { e.up(); const { Q, pt, k, u, c } = e; for (const [x, y, rot] of [[-0.2, -0.36, -0.7], [0.2, -0.38, 0.7]]) pt(e.E(x, y, 0.12, 0.05, rot), "#5f9e4a", 0); const cols = [c ?? "#d9534f", "#f6d04d", CREAM, "#b07ad8", "#f28fb0"]; [[-0.13, -0.45], [0.13, -0.46], [0, -0.6], [-0.06, -0.38], [0.08, -0.36]].forEach(([x, y], i) => flower(k, x * u, y * u, 0.1 * u, cols[i], "#e07a3a", 0.7)); pt(Q([[-0.2, -0.34], [0.2, -0.34], [0.04, 0.16], [-0.04, 0.16]]), "#f3d9e2", 0.4); },
  laptop: (e) => { e.up(); const { Q, R, pt, fs, c } = e; pt(R(-0.29, -0.5, 0.58, 0.42, 0.03), c ?? "#5d6470", 0.4); fs(R(-0.24, -0.45, 0.48, 0.32, 0.02), "#9fd8ff", 0.5); fs(R(-0.18, -0.38, 0.14, 0.05, 0.01), "#ffffff", 0); pt(Q([[-0.34, 0.0], [0.34, 0.0], [0.29, -0.08], [-0.29, -0.08]]), "#8a929e", 0); },
  clipboard: (e) => { e.up(); const { R, pt, fs, ln, c } = e; pt(R(-0.2, -0.58, 0.4, 0.56, 0.03), c ?? "#a8763e", 0.4); fs(R(-0.16, -0.5, 0.32, 0.44, 0.01), PAPER, 0.5); pt(R(-0.08, -0.62, 0.16, 0.08, 0.02), "#8a8f9c", 0); for (let i = 0; i < 4; i++) { ln([[-0.04, -0.4 + i * 0.08], [0.11, -0.4 + i * 0.08]], "#9aa1ad", 0.7); ln([[-0.12, -0.4 + i * 0.08], [-0.1, -0.38 + i * 0.08], [-0.07, -0.43 + i * 0.08]], "#3f9a5a", 0.9); } },
  baguette: (e) => { const { Q, pt, sk } = e; e.g.rotate(-0.35); pt(Q([[-0.28, 0], [-0.26, -0.08, -0.1, -0.08], [0.9, -0.07], [1.02, -0.06, 1.04, 0], [1.02, 0.07, 0.9, 0.07], [-0.1, 0.08], [-0.26, 0.08, -0.28, 0]]), "#d9a05b", 0.4, true); for (const x of [0.15, 0.4, 0.65]) sk(Q([[x, 0.03], [x + 0.14, -0.04]], { close: false }), "#f2d49a", 1.6); },
  wand: (e) => { const { pt } = e; pt(e.R(-0.05, -0.025, 0.62, 0.05, 0.02), "#3a2a24", 0); pt(e.R(0.5, -0.03, 0.12, 0.06, 0.02), "#f7f5f0", 0); e.at(0.66, 0); e.fs(starP(0, 0, 0.13 * e.u, 0.055 * e.u), e.c ?? "#f6d04d", 0.8); for (const [x, y] of [[0.16, -0.14], [-0.14, -0.18], [0.12, 0.14]]) e.dot(x, y, 0.025, "#fff2a8"); },
  selfie: (e) => { e.up(); const { R, pt, dot, c } = e; pt(R(-0.1, -0.38, 0.2, 0.38, 0.04), c ?? "#3a3f4b", 0.4); pt(R(-0.07, -0.35, 0.08, 0.08, 0.025), "#22252e", 0); dot(-0.05, -0.33, 0.02, "#7d8696"); dot(-0.03, -0.3, 0.012, "#f2c94c"); },
  coffee: (e) => { e.up(); const { Q, R, pt, k, c } = e, cup = Q([[-0.11, -0.36], [0.11, -0.36], [0.085, 0.02], [-0.085, 0.02]]); pt(cup, "#f7f5f0", 0.4); clip(k, cup, () => fillP(k, R(-0.2, -0.25, 0.4, 0.13, 0), c ?? "#a8763e")); stroke(k, cup, k.ink, k.lw * 0.9); pt(R(-0.13, -0.43, 0.26, 0.08, 0.03), "#3a3d48", 0); pt(R(-0.04, -0.47, 0.08, 0.05, 0.02), "#3a3d48", 0); },
  shopping: (e) => { e.up(); const { Q, pt, k, u, c } = e, col = c ?? "#c9a46e"; for (const s of [-1, 1]) inkStroke(k, P([[s * 0.12, 0.14], [s * 0.1, -0.04, 0, -0.04], [-s * 0.1, -0.04, -s * 0.12, 0.14]], u, { close: false }), u * 0.03, k.shade(col, 0.3), 0.5); pt(Q([[-0.24, 0.1], [0.24, 0.1], [0.27, 0.62], [-0.27, 0.62]]), col, 0.8, true); e.sk(Q([[-0.24, 0.18], [0.24, 0.18]], { close: false }), k.shade(col, 0.25), 0.7); },
  newspaper: (e) => { e.up(); const { R, pt, ln, fs } = e; pt(R(-0.22, -0.54, 0.42, 0.52, 0.02), "#ecebe4", 0.4); ln([[-0.17, -0.46], [0.15, -0.46]], INKD, 2.2); fs(R(-0.17, -0.38, 0.14, 0.12, 0.01), "#b9c1cc", 0.5); for (let i = 0; i < 5; i++) ln([[i < 2 ? 0.0 : -0.17, -0.36 + i * 0.06], [0.15, -0.36 + i * 0.06]], "#8a8f9c", 0.7); },
  scroll: (e) => { e.up(); const { R, pt, ln } = e, p = "#efe0b8"; pt(R(-0.17, -0.54, 0.34, 0.46, 0.0), p, 0.4); for (let i = 0; i < 5; i++) ln([[-0.11, -0.46 + i * 0.07], [0.11, -0.46 + i * 0.07]], "#a08a6a", 0.7); for (const y of [-0.6, -0.12]) pt(R(-0.22, y, 0.44, 0.09, 0.045), e.k.shade(p, 0.12), 0.2); },
  crystalball: (e) => { e.up(); const { E, R, pt, k, u, g } = e, b = E(0, -0.32, 0.22, 0.22); pt(R(-0.17, -0.12, 0.34, 0.12, 0.04), "#5a3a26", 0.3); g.fillStyle = e.c ?? "rgba(150,120,230,0.55)"; g.fill(b); clip(k, b, () => { stroke(k, P([[-0.12, -0.3], [-0.02, -0.46, 0.1, -0.34], [0.18, -0.22, 0.04, -0.2]], u, { close: false }), "rgba(255,255,255,0.55)", u * 0.03); fillP(k, E(-0.08, -0.42, 0.05, 0.035, -0.6), "rgba(255,255,255,0.85)"); }); stroke(k, b, k.ink, k.lw); },
  potion: (e) => { e.up(); const { E, R, pt, k, g, c } = e, b = E(0, -0.2, 0.16, 0.16); g.fillStyle = "rgba(220,240,255,0.5)"; g.fill(b); clip(k, b, () => { fillP(k, R(-0.2, -0.22, 0.4, 0.3, 0), c ?? "#7ad36b"); e.dot(-0.04, -0.12, 0.025, "rgba(255,255,255,0.7)"); e.dot(0.05, -0.17, 0.018, "rgba(255,255,255,0.7)"); }); stroke(k, b, k.ink, k.lw); pt(R(-0.05, -0.43, 0.1, 0.1, 0.02), "rgba(220,240,255,0.8)", 0); pt(R(-0.055, -0.5, 0.11, 0.08, 0.02), "#a8763e", 0); fillP(k, E(-0.07, -0.26, 0.03, 0.05, 0.4), "rgba(255,255,255,0.7)"); },
  bone: (e) => { const { E, R, k } = e; union(k, [R(-0.12, -0.04, 0.5, 0.08, 0.03), E(-0.14, -0.05, 0.06, 0.06), E(-0.14, 0.05, 0.06, 0.06), E(0.4, -0.05, 0.06, 0.06), E(0.4, 0.05, 0.06, 0.06)], "#f1ead8"); },
  fish: (e) => { e.up(); const { Q, E, pt, dot, sk, c } = e, col = c ?? "#7aa7c9"; pt(Q([[0, 0.06], [-0.14, -0.08], [0.14, -0.08]]), e.k.shade(col, 0.15), 0); pt(E(0, 0.34, 0.12, 0.28), col, 0.6, true); pt(Q([[0.1, 0.3], [0.2, 0.36], [0.1, 0.42]]), e.k.shade(col, 0.15), 0); dot(0.03, 0.5, 0.025, INKD); sk(Q([[-0.06, 0.56], [0, 0.6, 0.06, 0.56]], { close: false }), INKD, 0.7); },
  carrot: (e) => { const { Q, pt, sk } = e; for (const a of [-0.35, 0, 0.35]) pt(e.E(-0.14 - Math.cos(a) * 0.04, Math.sin(a) * 0.1, 0.1, 0.035, a), "#5f9e4a", 0); pt(Q([[-0.05, -0.08], [0.55, 0], [-0.05, 0.08]]), "#ec8a2e", 0.3); for (const x of [0.1, 0.25, 0.38]) sk(Q([[x, -0.05 * (1 - x)], [x + 0.02, 0.0]], { close: false }), "#b8611c", 0.7); },
  apple: (e) => { e.up(); const { Q, pt, k, u, c } = e; pt(Q([[0, -0.29], [0.1, -0.36, 0.17, -0.25], [0.24, -0.1, 0.12, 0.0], [0.05, 0.03, 0, 0.0], [-0.05, 0.03, -0.12, 0.0], [-0.24, -0.1, -0.17, -0.25], [-0.1, -0.36, 0, -0.29]]), c ?? "#d9433f", 0.5, true); stroke(k, P([[0, -0.29], [0.02, -0.38]], u, { close: false }), "#5a3a26", k.lw * 1.2); pt(e.E(0.07, -0.38, 0.06, 0.03, -0.4), "#5f9e4a", 0); fillP(k, e.E(-0.09, -0.2, 0.035, 0.05, 0.4), "rgba(255,255,255,0.5)"); },
  icecream: (e) => { e.up(); const { Q, E, pt, sk, k, c } = e, cone = Q([[-0.11, -0.3], [0.11, -0.3], [0, 0.08]]); pt(cone, "#d9a05b", 0.3); clip(k, cone, () => { for (const x of [-0.12, 0, 0.12]) { sk(Q([[x - 0.1, -0.3], [x + 0.1, 0.0]], { close: false }), "#b07a3a", 0.6); sk(Q([[x + 0.1, -0.3], [x - 0.1, 0.0]], { close: false }), "#b07a3a", 0.6); } }); stroke(k, cone, k.ink, k.lw * 0.9); pt(E(0, -0.35, 0.13, 0.1), c ?? "#f2a7b8", 0.4); pt(E(0, -0.5, 0.11, 0.09), "#b8e2c8", 0.4); e.dot(0.02, -0.61, 0.04, "#d9433f"); },
  balloon: (e) => { e.up(); const { Q, E, pt, k, u, c } = e; stroke(k, P([[0, 0], [-0.06, -0.4, 0.04, -0.82]], u, { close: false }), INKD, k.lw * 0.7); pt(Q([[0.04, -0.84], [-0.02, -0.78], [0.1, -0.78]]), c ?? "#d9433f", 0); pt(E(0.04, -1.12, 0.24, 0.29), c ?? "#d9433f", 0.6, true); fillP(k, E(-0.05, -1.24, 0.05, 0.08, 0.4), "rgba(255,255,255,0.55)"); },
  flashlight: (e) => { const { Q, R, pt, g } = e; g.fillStyle = "rgba(255,236,150,0.35)"; g.fill(Q([[0.42, -0.08], [1.2, -0.32], [1.2, 0.32], [0.42, 0.08]])); pt(R(-0.12, -0.065, 0.4, 0.13, 0.04), e.c ?? INKD, 0); pt(Q([[0.26, -0.08], [0.42, -0.11], [0.42, 0.11], [0.26, 0.08]]), "#5d6470", 0); pt(R(0.41, -0.1, 0.03, 0.2, 0.01), "#ffe27a", 0); },
  pickaxe: (e) => { const { Q, pt } = e; handle(e, -0.2, 0.92, WOOD, 0.7); pt(Q([[0.8, -0.46], [1.12, 0, 0.8, 0.46], [0.98, 0, 0.8, -0.46]]), "#9aa3b0", 0.4, true); pt(e.R(0.86, -0.07, 0.12, 0.14, 0.03), "#5d6470", 0); },
  shovel: (e) => { const { Q, pt } = e; handle(e, -0.22, 1.05, WOOD, 0.62); pt(e.R(-0.3, -0.09, 0.08, 0.18, 0.03), INKD, 0); pt(Q([[1.0, -0.15], [1.3, -0.17], [1.5, -0.1, 1.54, 0], [1.5, 0.1, 1.3, 0.17], [1.0, 0.15]]), "#9aa3b0", 0.4, true); },
  rake: (e) => { const { R, pt, ln } = e; handle(e, -0.25, 1.42, WOOD, 0.6); pt(R(1.38, -0.32, 0.07, 0.64, 0.02), "#7d8696", 0); for (let i = 0; i < 7; i++) ln([[1.45, -0.28 + i * 0.093], [1.56, -0.28 + i * 0.093]], INKD, 1.2); },
  fishingrod: (e) => { const { Q, pt, k, u } = e; pt(Q([[-0.25, -0.03], [1.6, -0.008], [1.6, 0.008], [-0.25, 0.03]]), "#5a3a26", 0); pt(e.E(0.16, 0.08, 0.06, 0.06), "#9aa3b0", 0); e.at(1.6, 0); stroke(k, P([[0, 0], [0, 0.65]], u, { close: false }), "#2b2f3a", k.lw * 0.6); const bob = e.E(0, 0.7, 0.05, 0.06); k.part(bob, "#f7f5f0", { off: 0, lw: k.lw * 0.7 }); clip(k, bob, () => fillP(k, e.R(-0.1, 0.64, 0.2, 0.06, 0), "#d9433f")); stroke(k, bob, k.ink, k.lw * 0.7); },
  paintbrush: (e) => { const { Q, pt } = e; handle(e, -0.2, 0.42, e.k.shade(WOOD, 0.1), 0.6); pt(e.R(0.4, -0.045, 0.1, 0.09, 0.01), "#c4cad4", 0); pt(Q([[0.5, -0.05], [0.62, -0.05, 0.7, 0], [0.62, 0.05, 0.5, 0.05]]), e.c ?? "#e04a5a", 0); },
  palette: (e) => { e.up(); const { Q, pt, dot, k } = e, p = Q([[-0.1, -0.02], [-0.32, -0.04, -0.3, -0.24], [-0.26, -0.44, 0.1, -0.42], [0.42, -0.38, 0.4, -0.16], [0.38, 0.04, 0.14, 0.0], [0.04, -0.02, 0.02, -0.08], [0, -0.14, -0.1, -0.02]]); pt(p, "#d8b07a", 0.4, true); fillP(k, e.E(-0.05, -0.12, 0.05, 0.04), "rgba(40,30,30,0.6)"); ([["#d9433f", -0.18, -0.25], ["#f2c94c", -0.05, -0.33], ["#4aa3df", 0.1, -0.33], ["#5f9e4a", 0.24, -0.25], ["#f7f5f0", 0.26, -0.12]] as [string, number, number][]).forEach(([col, x, y]) => dot(x, y, 0.05, col)); },
  megaphone: (e) => { e.up(); const { Q, E, pt, c } = e, col = c ?? "#e8e4dc"; pt(e.R(-0.03, -0.12, 0.06, 0.16, 0.02), INKD, 0); pt(Q([[-0.16, -0.18], [0.4, -0.34], [0.4, 0.08], [-0.16, -0.08]]), col, 0.5, true); pt(E(0.4, -0.13, 0.06, 0.21), e.k.shade(col, 0.15), 0); pt(Q([[0.12, -0.27], [0.24, -0.3], [0.24, 0.04], [0.12, 0.01]]), "#d9433f", 0); },
  gavel: (e) => { const { R, pt, sk } = e; handle(e, -0.1, 0.5, "#7a4a2a", 0.6); pt(R(0.42, -0.2, 0.2, 0.4, 0.05), "#8a5432", 0.4, true); for (const y of [-0.12, 0.08]) sk(e.Q([[0.42, y + 0.02], [0.62, y + 0.02]], { close: false }), GOLD, 1.2); },
  medkit: (e) => { e.up(); const { R, pt, fs, u, c } = e, col = c ?? "#3c9a5f"; hangHandle(e, INKD); pt(R(-0.28, 0.08, 0.56, 0.38, 0.05), col, 0.8, true); fs(P([[-1, -0.33], [-0.33, -0.33], [-0.33, -1], [0.33, -1], [0.33, -0.33], [1, -0.33], [1, 0.33], [0.33, 0.33], [0.33, 1], [-0.33, 1], [-0.33, 0.33], [-1, 0.33]], u * 0.11, { dy: 0.27 / 0.11 }), "#ffffff", 0.5); },
  calculator: (e) => { e.up(); const { R, pt, fs, k } = e; pt(R(-0.16, -0.46, 0.32, 0.46, 0.04), "#4a505c", 0.4); fs(R(-0.12, -0.42, 0.24, 0.09, 0.01), "#b9d9a8", 0.5); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) fillP(k, R(-0.11 + j * 0.08, -0.29 + i * 0.08, 0.06, 0.055, 0.012), i === 2 && j === 2 ? "#e8833a" : "#d4d8e0"); },
  tablet: (e) => { e.up(); const { R, pt, k } = e; pt(R(-0.3, -0.5, 0.6, 0.42, 0.04), e.c ?? "#2b2f3a", 0.3); const s = R(-0.26, -0.46, 0.52, 0.34, 0.02); fillP(k, s, "#e8f2fb"); ([["#4aa3df", 0.14], ["#e8833a", 0.22], ["#5f9e4a", 0.3]] as [string, number][]).forEach(([col, h], i) => fs(k, R(-0.18 + i * 0.14, -0.15 - h, 0.09, h, 0.01), col, 0.5)); stroke(k, s, k.ink, k.lw * 0.6); },
  remote: (e) => { e.up(); const { R, pt, dot } = e; pt(R(-0.08, -0.07, 0.4, 0.13, 0.05), e.c ?? INKD, 0); dot(0.24, -0.005, 0.03, "#d9433f"); dot(0.13, -0.005, 0.022, "#c4cad4"); dot(0.05, -0.005, 0.022, "#c4cad4"); },
  gift: (e) => { e.up(); const { R, E, pt, k, c } = e, col = c ?? "#d9534f", rb = "#f6d04d"; const box = R(-0.2, -0.36, 0.4, 0.32, 0.02); pt(box, col, 0.6, true); clip(k, box, () => fillP(k, R(-0.04, -0.4, 0.08, 0.4, 0), rb)); stroke(k, box, k.ink, k.lw); const lid = R(-0.23, -0.43, 0.46, 0.1, 0.02); pt(lid, col, 0.3); clip(k, lid, () => fillP(k, R(-0.04, -0.45, 0.08, 0.14, 0), rb)); stroke(k, lid, k.ink, k.lw); for (const s of [-1, 1]) pt(E(s * 0.08, -0.48, 0.09, 0.05, s * 0.4), rb, 0); e.dot(0, -0.47, 0.035, k.shade(rb, 0.2)); },
  lantern: (e) => { e.up(); const { R, E, pt, k, u, g } = e; stroke(k, P([[-0.08, 0.06], [-0.08, -0.04, 0, -0.04], [0.08, -0.04, 0.08, 0.06]], u, { close: false }), INKD, k.lw * 1.3); g.fillStyle = "rgba(255,210,100,0.3)"; g.fill(E(0, 0.3, 0.3, 0.3)); pt(R(-0.12, 0.06, 0.24, 0.08, 0.03), INKD, 0); const gl = R(-0.1, 0.14, 0.2, 0.28, 0.03); fillP(k, gl, "#ffe9a8"); flame(e, 0, 0.3, 0.45); stroke(k, gl, k.ink, k.lw * 0.8); pt(R(-0.13, 0.42, 0.26, 0.07, 0.02), INKD, 0); },
  oar: (e) => { const { E, pt } = e; handle(e, -0.35, 1.3, WOOD, 0.6); pt(E(1.55, 0, 0.32, 0.12), "#c98a4a", 0.4, true); },
  spatula: (e) => { const { R, pt, sk } = e; handle(e, -0.08, 0.45, INKD, 0.7); pt(R(0.44, -0.025, 0.16, 0.05, 0.01), "#9aa3b0", 0); pt(R(0.58, -0.11, 0.26, 0.22, 0.03), "#c4cad4", 0.3); for (const y of [-0.04, 0.04]) sk(e.Q([[0.63, y], [0.79, y]], { close: false }), "#7d8696", 0.9); },
  rollingpin: (e) => { const { R, pt } = e; pt(R(-0.12, -0.045, 0.26, 0.09, 0.04), "#b07a3a", 0); pt(R(0.12, -0.085, 0.5, 0.17, 0.05), "#e2b47a", 0.3); pt(R(0.6, -0.045, 0.22, 0.09, 0.04), "#b07a3a", 0); },
  pan: (e) => { const { E, pt } = e; handle(e, -0.1, 0.52, INKD, 0.75); pt(E(0.8, 0, 0.3, 0.3), "#3a3d48", 0.4, true); pt(E(0.8, 0, 0.23, 0.23), "#5d6470", 0); },
  ladle: (e) => { const { E, pt } = e; handle(e, -0.1, 0.62, "#c4cad4", 0.45); pt(E(0.74, 0, 0.14, 0.14), "#c4cad4", 0.3, true); pt(E(0.74, -0.02, 0.09, 0.08), "#7d8696", 0); },
  whisk: (e) => { const { k, u } = e; handle(e, -0.1, 0.34, INKD, 0.75); for (const s of [0.05, 0.11, 0.16]) stroke(k, k.ell(0.56 * u, 0, 0.23 * u, s * u), "#9aa3b0", k.lw * 0.9); },
  mug: (e) => { e.up(); const { R, pt, k, u, c } = e, col = c ?? "#d9534f"; inkStroke(k, P([[0.1, -0.24], [0.24, -0.24, 0.24, -0.15], [0.24, -0.06, 0.1, -0.07]], u, { close: false }), u * 0.04, col, 0.6); pt(R(-0.12, -0.3, 0.24, 0.3, 0.04), col, 0.5, true); for (const x of [-0.04, 0.05]) stroke(k, P([[x, -0.38], [x + 0.03, -0.44, x, -0.5]], u, { close: false }), "rgba(160,160,170,0.6)", k.lw * 0.8); },
  sign: (e) => { e.up(); const { R, pt, ln, c } = e; stem(e, 0.15, -0.95, WOOD); pt(R(-0.48, -1.42, 0.96, 0.56, 0.04), c ?? "#f7f5f0", 0.4, true); for (let i = 0; i < 3; i++) ln([[-0.34, -1.28 + i * 0.13], [i === 2 ? 0.1 : 0.34, -1.28 + i * 0.13]], "#9aa1ad", 1.6); },
  letter: (e) => { e.up(); const { R, pt, sk, dot, c } = e; pt(R(-0.24, -0.32, 0.46, 0.3, 0.02), c ?? "#f7f5f0", 0.3); sk(e.Q([[-0.24, -0.32], [-0.01, -0.14], [0.22, -0.32]], { close: false }), INKD, 0.7); dot(-0.01, -0.15, 0.045, "#c8372d"); },
  key: (e) => { const { pt, k, u, c } = e, col = c ?? GOLD; k.part(ringP(-0.04 * u, 0, 0.1 * u, 0.1 * u, 0.045 * u, 0.045 * u), col, { off: 0, lw: k.lw * 0.8 }); pt(e.R(0.05, -0.025, 0.4, 0.05, 0.01), col, 0); pt(e.R(0.33, 0.02, 0.04, 0.07, 0.005), col, 0); pt(e.R(0.4, 0.02, 0.04, 0.1, 0.005), col, 0); },
  candle: (e) => { e.up(); const { R, E, pt, k, g } = e; g.fillStyle = "rgba(255,210,100,0.28)"; g.fill(E(0, -0.42, 0.18, 0.2)); pt(E(0, 0.0, 0.18, 0.05), "#c4cad4", 0); pt(R(-0.06, -0.34, 0.12, 0.33, 0.02), e.c ?? CREAM, 0.3); stroke(k, P([[0, -0.34], [0, -0.38]], e.u, { close: false }), INKD, k.lw * 0.8); flame(e, 0, -0.42, 0.5); },
  hourglass: (e) => { e.up(); const { Q, R, pt, k, g } = e; const gl = Q([[-0.13, -0.5], [0.13, -0.5], [0.02, -0.28], [0.13, -0.06], [-0.13, -0.06], [-0.02, -0.28]]); g.fillStyle = "rgba(220,240,255,0.55)"; g.fill(gl); clip(k, gl, () => { fillP(k, Q([[-0.13, -0.06], [0.13, -0.06], [0.07, -0.16], [-0.07, -0.16]]), "#f2c94c"); fillP(k, Q([[-0.06, -0.38], [0.06, -0.38], [0.0, -0.3]]), "#f2c94c"); }); stroke(k, gl, k.ink, k.lw * 0.8); for (const y of [-0.56, -0.06]) pt(R(-0.17, y, 0.34, 0.06, 0.02), "#7a4a2a", 0); },
  lightbulb: (e) => { e.up(); const { E, R, pt, k, u } = e; if (e.open !== 0) for (let i = 0; i < 7; i++) { const a = Math.PI * (1.05 + i * 0.15); stroke(k, P([[Math.cos(a) * 0.26, -0.36 + Math.sin(a) * 0.26], [Math.cos(a) * 0.36, -0.36 + Math.sin(a) * 0.36]], u, { close: false }), "#f2c94c", k.lw * 1.4); } pt(E(0, -0.36, 0.17, 0.17), e.c ?? "#ffe27a", 0.3, true); pt(R(-0.08, -0.22, 0.16, 0.1, 0.02), "#ffe27a", 0); pt(R(-0.08, -0.13, 0.16, 0.12, 0.03), "#9aa3b0", 0); fillP(k, E(-0.06, -0.42, 0.04, 0.06, 0.4), "rgba(255,255,255,0.7)"); },
  magnet: (e) => { e.up(); const { k, u } = e, q = new Path2D(); q.moveTo(-0.14 * u, -0.5 * u); q.lineTo(-0.14 * u, -0.2 * u); q.arc(0, -0.2 * u, 0.14 * u, Math.PI, 0, true); q.lineTo(0.14 * u, -0.5 * u); inkStroke(k, q, 0.11 * u, e.c ?? "#d9433f", 0.6); for (const s of [-1, 1]) k.part(k.rrect((s * 0.14 - 0.055) * u, -0.6 * u, 0.11 * u, 0.1 * u, 0.01 * u), "#d4d8e0", { off: 0, lw: k.lw * 0.8 }); },
  flask: (e) => { e.up(); const { Q, R, pt, k, g, c } = e, b = Q([[-0.05, -0.5], [0.05, -0.5], [0.05, -0.36], [0.2, -0.06], [0.2, 0.0, 0.14, 0.0], [-0.14, 0.0], [-0.2, 0.0, -0.2, -0.06], [-0.05, -0.36]]); g.fillStyle = "rgba(220,240,255,0.55)"; g.fill(b); clip(k, b, () => { fillP(k, R(-0.3, -0.16, 0.6, 0.2, 0), c ?? "#4aa3df"); e.dot(0.03, -0.1, 0.022, "rgba(255,255,255,0.75)"); e.dot(-0.06, -0.07, 0.016, "rgba(255,255,255,0.75)"); }); stroke(k, b, k.ink, k.lw); pt(R(-0.07, -0.54, 0.14, 0.05, 0.02), "rgba(220,240,255,0.8)", 0); },
  testtube: (e) => { e.up(); const { R, k, g, c } = e, t = R(-0.055, -0.5, 0.11, 0.52, 0.055); g.fillStyle = "rgba(220,240,255,0.55)"; g.fill(t); clip(k, t, () => fillP(k, R(-0.1, -0.2, 0.2, 0.3, 0), c ?? "#b07ad8")); stroke(k, t, k.ink, k.lw); e.pt(R(-0.075, -0.53, 0.15, 0.05, 0.02), "#d4d8e0", 0); },
  globe: (e) => { e.up(); const { E, R, pt, k, u } = e, arm = new Path2D(); arm.arc(0, -0.34 * u, 0.24 * u, Math.PI * 0.6, Math.PI * 1.6); stroke(k, arm, "#9aa3b0", u * 0.04); pt(R(-0.04, -0.12, 0.08, 0.1, 0.02), "#7a4a2a", 0); pt(R(-0.14, -0.04, 0.28, 0.06, 0.03), "#7a4a2a", 0); const b = E(0, -0.34, 0.2, 0.2); pt(b, "#4aa3df", 0.4); clip(k, b, () => { fillP(k, fuzzP(-0.06 * u, -0.4 * u, 0.09 * u, 0.07 * u, 6, 0.15), "#5f9e4a"); fillP(k, fuzzP(0.1 * u, -0.27 * u, 0.06 * u, 0.08 * u, 6, 0.15), "#5f9e4a"); }); stroke(k, b, k.ink, k.lw); },
  telescope: (e) => { const { R, pt } = e; pt(R(-0.15, -0.06, 0.3, 0.12, 0.03), "#c8a24a", 0); pt(R(0.14, -0.08, 0.3, 0.16, 0.03), "#7a4a2a", 0); pt(R(0.42, -0.1, 0.3, 0.2, 0.04), "#c8a24a", 0.2); },
  binoculars: (e) => { e.up(); const { R, E, pt, fs, dot } = e; for (const x of [-0.2, 0.03]) pt(R(x, -0.36, 0.17, 0.32, 0.05), INKD, 0.2); pt(R(-0.04, -0.3, 0.08, 0.1, 0.02), "#5d6470", 0); for (const x of [-0.115, 0.115]) { fs(E(x, -0.34, 0.085, 0.06), "#3a5a7a", 0.6); dot(x - 0.03, -0.355, 0.02, "#ffffff"); } },
  suitcase: (e) => { e.up(); const { R, pt, k, c } = e, col = c ?? "#4f7fb5"; hangHandle(e, INKD); const s = R(-0.32, 0.08, 0.64, 0.52, 0.06); pt(s, col, 1, true); clip(k, s, () => { for (const x of [-0.16, 0.12]) fillP(k, R(x, 0.0, 0.05, 0.7, 0), k.shade(col, 0.3)); fillP(k, R(-0.26, 0.34, 0.14, 0.1, 0.01), "#f2c94c"); fillP(k, R(0.18, 0.16, 0.1, 0.08, 0.01), "#e04a3a"); }); stroke(k, s, k.ink, k.lw); },
  toolbox: (e) => { e.up(); const { R, pt, sk, k, u, c } = e, col = c ?? "#d9433f"; inkStroke(k, P([[-0.18, 0.1], [-0.18, -0.02], [0.18, -0.02], [0.18, 0.1]], u, { close: false }), e.w * 0.32, "#5d6470", 0.6); pt(R(-0.32, 0.08, 0.64, 0.32, 0.03), col, 0.8, true); sk(P([[-0.32, 0.17], [0.32, 0.17]], u, { close: false }), k.shade(col, 0.35), 0.9); pt(R(-0.05, 0.14, 0.1, 0.06, 0.01), "#d4d8e0", 0); },
  racket: (e) => { const { E, k, u } = e; handle(e, -0.1, 0.32, e.c ?? "#3d6fb0", 0.85); const h = E(0.62, 0, 0.27, 0.2); clip(k, h, () => { for (let x = 0.38; x < 0.9; x += 0.07) stroke(k, P([[x, -0.25], [x, 0.25]], u, { close: false }), "rgba(255,255,255,0.75)", k.lw * 0.45); for (let y = -0.18; y < 0.2; y += 0.07) stroke(k, P([[0.3, y], [0.95, y]], u, { close: false }), "rgba(255,255,255,0.75)", k.lw * 0.45); }); inkStroke(k, h, u * 0.05, e.c ?? "#3d6fb0", 0.6); },
  lollipop: (e) => { e.up(); const { E, pt, k, u } = e; pt(e.R(-0.02, -0.42, 0.04, 0.46, 0.02), "#f7f5f0", 0); pt(E(0, -0.54, 0.16, 0.16), e.c ?? "#e05a8a", 0.4); const q = new Path2D(); for (let i = 0; i <= 40; i++) { const a = i * 0.32, rr = 0.012 + i * 0.0034; const x = Math.cos(a) * rr * u, y = -0.54 * u + Math.sin(a) * rr * u; if (i) q.lineTo(x, y); else q.moveTo(x, y); } stroke(k, q, "#ffffff", k.lw * 0.9); },
  rose: (e) => { e.up(); const { Q, E, pt, k, u, c } = e, col = c ?? "#c8372d"; stroke(k, P([[0, 0.1], [0.03, -0.25, 0, -0.42]], u, { close: false }), "#4f8a3e", k.lw * 1.6); pt(E(0.08, -0.22, 0.08, 0.035, -0.5), "#5f9e4a", 0); pt(Q([[-0.11, -0.46], [-0.12, -0.6, 0, -0.6], [0.12, -0.6, 0.11, -0.46], [0.08, -0.38, 0, -0.38], [-0.08, -0.38, -0.11, -0.46]]), col, 0.3, true); stroke(k, P([[-0.04, -0.52], [0.04, -0.56, 0.05, -0.48]], u, { close: false }), k.shade(col, 0.35), k.lw * 0.7); },
  tray: (e) => { e.up(); const { E, R, pt, k, g } = e; const gl = R(-0.22, -0.34, 0.12, 0.24, 0.02); g.fillStyle = "rgba(220,240,255,0.6)"; g.fill(gl); clip(k, gl, () => fillP(k, R(-0.25, -0.24, 0.2, 0.2, 0), "#e8833a")); stroke(k, gl, k.ink, k.lw * 0.8); pt(R(0.04, -0.22, 0.16, 0.13, 0.03), "#f7f5f0", 0.2); pt(E(0, -0.08, 0.42, 0.06), "#c4cad4", 0.2); },
  bell: (e) => { e.up(); const { Q, pt, dot } = e; pt(e.R(-0.04, -0.02, 0.08, 0.14, 0.02), "#7a4a2a", 0); pt(Q([[-0.06, 0.12], [-0.16, 0.14, -0.16, 0.3], [-0.2, 0.38], [0.2, 0.38], [0.16, 0.3], [0.16, 0.14, 0.06, 0.12]]), e.c ?? GOLD, 0.4, true); dot(0, 0.42, 0.045, "#7a5a2a"); },
  net: (e) => { const { E, k, u, g } = e; handle(e, -0.15, 0.95, WOOD, 0.55); const bag = P([[1.0, -0.2], [1.45, -0.15, 1.5, 0.3], [1.3, 0.32, 1.0, 0.2]], u); g.fillStyle = "rgba(255,255,255,0.4)"; g.fill(bag); stroke(k, bag, "rgba(80,80,90,0.6)", k.lw * 0.6); stroke(k, E(1.06, 0, 0.08, 0.21), "#7d8696", k.lw * 1.6); },
  stopwatch: (e) => { e.up(); const { E, R, pt, fs, ln } = e; pt(R(-0.03, -0.42, 0.06, 0.06, 0.01), "#9aa3b0", 0); pt(E(0, -0.22, 0.17, 0.17), "#c4cad4", 0.3, true); fs(E(0, -0.22, 0.13, 0.13), "#ffffff", 0.5); ln([[0, -0.22], [0.06, -0.3]], "#d9433f", 1.2); e.dot(0, -0.22, 0.02, INKD); },
  banana: (e) => { e.up(); const { Q, pt } = e; pt(Q([[0.0, 0.02], [-0.22, -0.2, -0.12, -0.5], [-0.06, -0.48], [-0.12, -0.2, 0.06, -0.02]]), e.c ?? "#f2d24a", 0.3, true); pt(e.R(-0.14, -0.55, 0.06, 0.07, 0.02), "#6b4a2e", 0); },
  donut: (e) => { e.up(); const { k, u } = e; k.part(ringP(0, -0.2 * u, 0.2 * u, 0.2 * u, 0.07 * u, 0.07 * u), "#d9a05b", { off: 0.02 * u }); const f = fuzzP(0, -0.2 * u, 0.17 * u, 0.17 * u, 9, 0.06); f.moveTo(0.09 * u, -0.2 * u); f.ellipse(0, -0.2 * u, 0.09 * u, 0.09 * u, 0, TAU, 0, true); fs(k, f, e.c ?? "#f2a7b8", 0.6); const rnd = seq(5); for (let i = 0; i < 9; i++) { const a = rnd() * TAU, rr = (0.11 + rnd() * 0.04) * u, x = Math.cos(a) * rr, y = -0.2 * u + Math.sin(a) * rr; stroke(k, k.poly([[x, y], [x + 0.03 * u, y + 0.01 * u]], false), ["#4aa3df", "#f6d04d", "#5f9e4a"][i % 3], k.lw * 0.8); } },
  teddy: (e) => { e.up(); const { E, pt, dot, k } = e, col = e.c ?? "#b07a4a"; for (const s of [-1, 1]) pt(E(s * 0.11, -0.56, 0.06, 0.06), col, 0); pt(E(0, -0.18, 0.15, 0.17), col, 0.4); for (const s of [-1, 1]) pt(E(s * 0.15, -0.14, 0.05, 0.08, s * 0.3), col, 0); pt(E(0, -0.44, 0.14, 0.13), col, 0.4); pt(E(0, -0.4, 0.06, 0.045), k.tint(col, 0.4), 0); dot(0, -0.415, 0.02, INKD); for (const s of [-1, 1]) dot(s * 0.055, -0.47, 0.02, INKD); },
  basket: (e) => { e.up(); const { Q, pt, sk, k, u } = e, col = e.c ?? "#c9a46e"; inkStroke(k, P([[-0.26, 0.2], [-0.24, -0.06, 0, -0.06], [0.24, -0.06, 0.26, 0.2]], u, { close: false }), u * 0.03, col, 0.6); pt(Q([[-0.3, 0.18], [0.3, 0.18], [0.24, 0.48], [-0.24, 0.48]]), col, 0.6, true); for (const y of [0.26, 0.34, 0.42]) sk(Q([[-0.3, y], [0.3, y]], { close: false }), k.shade(col, 0.3), 0.6); pt(Q([[-0.2, 0.18], [-0.1, 0.08, 0.05, 0.18]]), "#d9534f", 0); },
  wateringcan: (e) => { e.up(); const { Q, R, pt, k, u, c } = e, col = c ?? "#5f9e4a"; inkStroke(k, P([[-0.14, 0.1], [-0.12, -0.04, 0.08, -0.04], [0.16, -0.02, 0.16, 0.1]], u, { close: false }), u * 0.035, k.shade(col, 0.2), 0.5); pt(Q([[0.14, 0.24], [0.48, 0.02], [0.52, 0.06], [0.2, 0.34]]), col, 0); pt(R(-0.2, 0.08, 0.38, 0.34, 0.06), col, 0.6, true); pt(R(0.46, -0.01, 0.06, 0.1, 0.02), k.shade(col, 0.2), 0); },
  plant: (e) => { e.up(); const { Q, pt } = e, pot = e.c ?? "#c9673a"; for (const a of [-0.9, -0.35, 0.2, 0.75]) pt(xf(P([[0, 0], [0.12, -0.08, 0, -0.32], [-0.12, -0.08, 0, 0]], e.u), 0, -0.18 * e.u, 1, a), "#5f9e4a", 0); pt(Q([[-0.16, -0.2], [0.16, -0.2], [0.12, 0.04], [-0.12, 0.04]]), pot, 0.4); pt(e.R(-0.18, -0.24, 0.36, 0.06, 0.02), e.k.shade(pot, 0.1), 0); },
  ticket: (e) => { e.up(); const { R, pt, k, u, c } = e, col = c ?? "#f2c94c"; pt(R(-0.24, -0.24, 0.48, 0.2, 0.02), col, 0.2); k.g.save(); k.g.setLineDash([u * 0.02, u * 0.02]); stroke(k, P([[0.1, -0.24], [0.1, -0.04]], u, { close: false }), k.shade(col, 0.45), k.lw * 0.7); k.g.restore(); e.ln([[-0.18, -0.17], [0.04, -0.17]], k.shade(col, 0.45), 1.0); e.ln([[-0.18, -0.11], [0.0, -0.11]], k.shade(col, 0.45), 1.0); },
  /** a cardboard parcel held from below: tape across the top, a white label (color = the cardboard) */
  parcel: (e) => { e.up(); const { R, pt, fs, k, ln, c } = e, col = c ?? "#c8935a"; pt(R(-0.34, -0.5, 0.68, 0.5, 0.03), col, 0.6, true); fs(R(-0.34, -0.5, 0.68, 0.07, 0.01), k.tint(col, 0.35), 0.4); fs(R(-0.06, -0.5, 0.12, 0.5, 0.01), "#e9cf96", 0.5);
    fs(R(0.1, -0.36, 0.18, 0.12, 0.01), "#f6f4ee", 0.3); ln([[0.13, -0.32], [0.25, -0.32]], k.shade("#f6f4ee", 0.5), 0.6); ln([[0.13, -0.28], [0.22, -0.28]], k.shade("#f6f4ee", 0.5), 0.6); },
  /** a handheld delivery scanner: grip, screen, camera lens; open >= 0.5 fires the flash */
  scanner: (e) => { e.up(); const { R, E, pt, fs, k, dot, u, open, c } = e, col = c ?? "#2b2f3a"; pt(R(-0.07, -0.18, 0.14, 0.3, 0.05), k.shade(col, 0.1), 0.3); pt(R(-0.16, -0.66, 0.32, 0.5, 0.06), col, 0.5, true);
    fs(R(-0.12, -0.61, 0.24, 0.26, 0.03), "#9fd8ff", 0.4); fs(R(-0.12, -0.61, 0.24, 0.05, 0.01), "#e8833a", 0.2); dot(0, -0.27, 0.045, "#e8833a"); dot(-0.08, -0.27, 0.025, k.tint(col, 0.4)); dot(0.08, -0.27, 0.025, k.tint(col, 0.4));
    pt(E(0.1, -0.7, 0.07, 0.05), "#1b1d24", 0.2); dot(0.1, -0.7, 0.025, "#9fd8ff");
    if ((open ?? 0) >= 0.5) { const g = k.g; g.save(); g.globalAlpha = 0.9; g.fillStyle = "#fffbe6"; g.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = (i % 2 ? 0.12 : 0.34) * u; const x = 0.1 * u + Math.cos(a) * r, y = -0.7 * u + Math.sin(a) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); g.fill(); g.restore(); } },
};

/** Hand props drawn larger than life so they read next to the big head (x the prop unit). */
const PSIZE: Partial<Record<PropX, number>> = {
  book: 1.3, camera: 1.35, mic: 1.3, pizza: 1.3, ball: 1.3, pen: 1.5, map: 1.25, money: 1.3, trophy: 1.3, bouquet: 1.25, laptop: 1.25, clipboard: 1.3,
  selfie: 1.35, coffee: 1.35, newspaper: 1.3, scroll: 1.3, crystalball: 1.3, potion: 1.35, apple: 1.4, icecream: 1.35, calculator: 1.3, tablet: 1.25,
  remote: 1.35, gift: 1.3, letter: 1.3, candle: 1.3, hourglass: 1.3, lightbulb: 1.3, magnet: 1.3, flask: 1.3, testtube: 1.35, globe: 1.3, binoculars: 1.35,
  lollipop: 1.3, rose: 1.3, stopwatch: 1.4, banana: 1.35, donut: 1.35, teddy: 1.3, plant: 1.3, ticket: 1.35, mug: 1.35, palette: 1.25, key: 1.35, bone: 1.35,
  carrot: 1.3, wrench: 1.2, briefcase: 1.15, shopping: 1.15, medkit: 1.15, lantern: 1.25, bell: 1.35, tray: 1.2, fish: 1.2, baguette: 1.1, whisk: 1.15,
  ladle: 1.15, spatula: 1.15, rollingpin: 1.15, telescope: 1.2, megaphone: 1.25, flashlight: 1.2, paintbrush: 1.2, gavel: 1.2, magnifier: 1.15,
};
export function drawPropX(k: Kit, p: PropCtx): boolean {
  const fn = (PROPS as Record<string, ((e: PE) => void) | undefined>)[p.item];
  if (!fn) return false;
  const u = (p.L / 1.7) * (PSIZE[p.item as PropX] ?? 1), g = k.g;
  const e: PE = { k, g, u, w: p.w, c: p.color, open: p.open,
    Q: (pts, o) => P(pts, u, o), E: (x, y, rx, ry, rot = 0) => k.ell(x * u, y * u, rx * u, ry * u, rot), R: (x, y, w, h, rr) => k.rrect(x * u, y * u, w * u, h * u, rr * u),
    pt: (pp, col, o = 1, thick = false) => k.part(pp, col, { off: u * 0.03 * o, thick, lw: k.lw * 0.9 }), fs: (pp, col, lk = 0.75) => fs(k, pp, col, lk),
    sk: (pp, col, wk) => stroke(k, pp, col, k.lw * wk), ln: (pts, col, wk) => stroke(k, P(pts, u, { close: false }), col, k.lw * wk), dot: (x, y, rr, col) => k.dot(x * u, y * u, rr * u, col),
    up: () => up(k), at: (x, y) => { g.translate(x * u, y * u); up(k); } };
  g.save(); g.lineCap = "round"; g.lineJoin = "round"; fn(e); g.restore();
  return true;
}
