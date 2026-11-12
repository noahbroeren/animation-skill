/**
 * Extra bobble hair styles (front, three-quarter and profile). kinds.ts asks `hairX` first and falls back to its own
 * ten styles (cap, side, spiky, curly, long, bob, bun, pony, buzz, bald) when this returns null.
 *
 * Geometry is authored in HEAD UNITS: (0, 0) = the head centre, 1 = the head radius, y grows DOWN (the head top is at
 * y = -1). kinds.ts y-scales the result by the brand head's height / width afterwards. Views: "front"; "three" =
 * three-quarter facing +x (the back of the skull at -x, the near ear at about x = -0.64); "side" = profile facing +x.
 * The near side in "three" / "side" is the character's right = the screen-LEFT in the front view, so one-sided styles
 * (side pony, side braid, side bun, side cut) put their feature on the screen-left in front.
 *
 * Drawing contract (kinds.ts drawBobble): `front` paths are ink-unioned over the head (every path stroked at 2x the
 * line width, then all filled), so overlapping paths merge into one outlined mass and a GAP narrower than the line
 * width reads as an ink seam; the strands / ramp are clipped to front[0] (the main mass goes first). `back` paths are
 * drawn behind the head and the body, one shade darker.
 */
import type { HairCtx, HairOut } from "./kit";

export const HAIR_X = [
  "afro", "puffs", "mohawk", "pigtails", "braids", "mullet", "pompadour", "undercut", "curtains", "emo", "topknot",
  "dreads", "combover", "flattop", "spacebuns", "bangs", "wavy", "messy", "curl", "slick", "beehive", "pixie",
  "horseshoe", "ringlets", "highpony", "shag",
  // more silhouettes
  "bowl", "sidebun", "twintails", "fauxhawk", "quiff", "punk", "hime", "sidepony", "sidebraid", "minifro", "perm",
  "sidecut", "ahoge", "manbun", "baldtuft", "receding", "babycurl", "mane", "cornrows", "bantu", "frohawk", "tonsure",
  "afropuff", "crew", "halfup", "flame",
] as const;
export type HairX = (typeof HAIR_X)[number];

/** Extra height above the round head, in head diameters, so the card makes room (default 0.04). */
export const HAIR_X_HX: Partial<Record<string, number>> = {
  afro: 0.34, puffs: 0.26, mohawk: 0.37, topknot: 0.3, spacebuns: 0.24, highpony: 0.26, pompadour: 0.3, beehive: 0.45,
  flattop: 0.16, curl: 0.27, messy: 0.1, punk: 0.34, mane: 0.3, frohawk: 0.28, quiff: 0.22, ahoge: 0.24, baldtuft: 0.14,
  babycurl: 0.12, fauxhawk: 0.16, minifro: 0.16, manbun: 0.1, perm: 0.16, bantu: 0.14, twintails: 0.06, shag: 0.06,
  afropuff: 0.38, crew: 0.06, halfup: 0.1, flame: 0.36,
};
/** Styles too tall to sit under a hat: a hat swaps them for the plain cap. */
export const HAIR_X_TALL: string[] = [
  "afro", "puffs", "mohawk", "topknot", "spacebuns", "highpony", "pompadour", "beehive", "flattop", "curl", "punk", "mane",
  "frohawk", "quiff", "ahoge", "baldtuft", "babycurl", "fauxhawk", "minifro", "manbun", "perm", "bantu", "messy",
  "afropuff", "halfup", "flame",
];

/** Hair paths for one view, or null when the style is not one of these. */
export function hairX(style: string, h: HairCtx): HairOut | null {
  const f = (STYLES as Record<string, ((k: K) => void) | undefined>)[style];
  if (!f) return null;
  const k = new K(h);
  f(k);
  return { front: k.front, back: k.back };
}

// ------------------------------------------------------------------------------------------------ toolkit
type V2 = [number, number];
type RF = number | ((t: number) => number);
const P = Math.PI;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rfAt = (rr: RF, t: number) => (typeof rr === "number" ? rr : rr(t));
const sinp = (t: number) => Math.max(0, Math.sin(P * clamp(t)));

/** Catmull-Rom samples through pts (per samples per segment, the last point included). */
function spline(pts: V2[], per = 8): V2[] {
  const out: V2[] = [], n = pts.length;
  if (n < 2) return pts.slice();
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      const c = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}
/** Arc-length sampler along a smooth curve through pts: u in 0..1 -> point + tangent angle. */
function along(pts: V2[]) {
  const s = spline(pts, 12), L = [0];
  for (let i = 1; i < s.length; i++) L.push(L[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
  const tot = L[L.length - 1] || 1;
  return {
    len: tot,
    at(u: number): { p: V2; a: number } {
      const d = clamp(u) * tot;
      let i = 1;
      while (i < L.length - 1 && L[i] < d) i++;
      const t = (d - L[i - 1]) / Math.max(1e-9, L[i] - L[i - 1]), a = s[i - 1], b = s[i];
      return { p: [lerp(a[0], b[0], t), lerp(a[1], b[1], t)], a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    },
  };
}
/** A spiral (curl) polyline: centre (x, y), start radius r0, `turns` turns from angle a0 (dir +1 = clockwise on screen). */
function spiral(x: number, y: number, r0: number, turns: number, a0: number, dir = 1, shrink = 0.72): V2[] {
  const out: V2[] = [], N = Math.max(6, Math.round(turns * 16));
  for (let i = 0; i <= N; i++) { const u = i / N, a = a0 + dir * u * turns * 2 * P, rr = r0 * (1 - shrink * u); out.push([x + rr * Math.cos(a), y + rr * Math.sin(a)]); }
  return out;
}
/** Points rotated by a (rad) around (ox, oy). */
function rot(pts: V2[], ox: number, oy: number, a: number): V2[] {
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c] as V2);
}
/** Deterministic pseudo-random numbers in 0..1 from a string seed (no Math.random). */
function rng(seed: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
}

/** A path builder in head units. */
class Pen {
  readonly q = new Path2D();
  private on = false;
  private cur: V2 = [0, 0];
  constructor(private k: K) {}
  to(x: number, y: number): this {
    const X = this.k.X(x), Y = this.k.Y(y);
    if (this.on) this.q.lineTo(X, Y); else { this.q.moveTo(X, Y); this.on = true; }
    this.cur = [x, y]; return this;
  }
  lines(pts: V2[]): this { for (const p of pts) this.to(p[0], p[1]); return this; }
  /** a smooth curve from the current point through pts */
  curve(pts: V2[], per = 8): this { for (const p of spline(this.on ? [this.cur, ...pts] : pts, per)) this.to(p[0], p[1]); return this; }
  qto(x1: number, y1: number, x: number, y: number): this { this.q.quadraticCurveTo(this.k.X(x1), this.k.Y(y1), this.k.X(x), this.k.Y(y)); this.cur = [x, y]; return this; }
  /** the crown: points on the head's own superellipse at radius R * rr from angle a0 to a1 (t = 0..1 along the way) */
  crown(a0: number, a1: number, rr: RF = 1, steps = 40): this {
    for (let i = 0; i <= steps; i++) { const t = i / steps, p = this.k.se(lerp(a0, a1, t), rfAt(rr, t)); this.to(p[0], p[1]); }
    return this;
  }
  /** spikes along the crown: n tips between a0 and a1, valleys at rin, tip i at rout(i), leaning by lean(i) rad */
  spikes(a0: number, a1: number, n: number, rin: number, rout: (i: number) => number, lean: (i: number) => number = () => 0): this {
    for (let i = 0; i <= 2 * n; i++) {
      const tip = i % 2 === 1, j = (i - 1) / 2, a = lerp(a0, a1, i / (2 * n)) + (tip ? lean(j) : 0), p = this.k.se(a, tip ? rout(j) : rin);
      this.to(p[0], p[1]);
    }
    return this;
  }
  /** a scalloped (cloud) arc of the ellipse (x0, y0, rx, ry) from angle a0 to a1 in nb bumps */
  cloud(x0: number, y0: number, rx: number, ry: number, a0: number, a1: number, nb: number, puff = 0.07): this {
    const da = (a1 - a0) / nb, f = 2 + 2 * puff - Math.cos(da / 2);
    this.to(x0 + rx * Math.cos(a0), y0 + ry * Math.sin(a0));
    for (let i = 0; i < nb; i++) { const am = a0 + da * (i + 0.5), ae = a0 + da * (i + 1); this.qto(x0 + rx * f * Math.cos(am), y0 + ry * f * Math.sin(am), x0 + rx * Math.cos(ae), y0 + ry * Math.sin(ae)); }
    return this;
  }
  /** a smooth curve through pts made of nb bumps of height amp, bulging to the RIGHT of the travel direction on screen
   *  (moving +x they bulge down, moving up the right side they bulge outward) */
  bumps(pts: V2[], nb: number, amp: number): this {
    const A = along(this.on ? [this.cur, ...pts] : pts);
    if (!this.on) { const p = A.at(0).p; this.to(p[0], p[1]); }
    for (let i = 0; i < nb; i++) {
      const a = A.at(i / nb).p, b = A.at((i + 1) / nb).p, dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      this.qto((a[0] + b[0]) / 2 - (dy / l) * amp * 2, (a[1] + b[1]) / 2 + (dx / l) * amp * 2, b[0], b[1]);
    }
    return this;
  }
  /** fringe teeth from the current point (x0, yv) to (x1, yv): tooth i reaches down to yt(i); skew = where the tip sits */
  teeth(x0: number, x1: number, yv: number, n: number, yt: (i: number) => number, skew = 0.55, round = false): this {
    for (let i = 0; i < n; i++) {
      const xa = lerp(x0, x1, i / n), xb = lerp(x0, x1, (i + 1) / n), xt = lerp(xa, xb, skew), y = yt(i);
      if (round) { this.qto(lerp(xa, xb, 0.3), lerp(yv, y, 0.2), xt, y); this.qto(lerp(xa, xb, 0.9), lerp(yv, y, 0.2), xb, yv); }
      else this.to(xt, y).to(xb, yv);
    }
    return this;
  }
  done(): Path2D { this.q.closePath(); return this.q; }
}

/** The per-call kit: the view, the head frame and the output lists. */
class K {
  readonly F: boolean; readonly T: boolean; readonly S: boolean;
  /** hair mass radius in head radii */
  readonly R: number;
  /** size factor vs the brand's full hair (vol 1.13) */
  readonly s: number;
  readonly front: Path2D[] = [];
  readonly back: Path2D[] = [];
  constructor(readonly h: HairCtx) {
    this.F = h.view === "front"; this.T = h.view === "three"; this.S = h.view === "side";
    this.R = h.vol; this.s = h.vol / 1.13;
  }
  X(x: number) { return this.h.cx + this.h.r * x; }
  Y(y: number) { return this.h.cy + this.h.r * y; }
  /** a FRINGE point at k (head radii) moved up by the lift, as kinds.ts H(): fringe tips at H(-0.13) clear the brows */
  H(k: number) { return k - this.h.lift * clamp((k + 1) / 0.7) * clamp((0.05 - k) / 0.15); }
  /** a soft (no fringe) hairline point, lifted about half as much */
  Hs(k: number) { return k - 0.45 * this.h.lift * clamp((k + 1) / 0.5) * clamp((0.3 - k) / 0.3); }
  /** the lowest edge for brow-length bangs (just above the brows) */
  get Yb() { return -0.3 - 0.15 * this.h.lift; }
  /** a crown point at angle a, radius R * rr, on the head's own superellipse (|cos|^(2/n), |sin|^(2/n)) */
  se(a: number, rr = 1): V2 {
    const n = this.h.n, c = Math.cos(a), s = Math.sin(a), m = this.R * rr;
    return [Math.sign(c) * Math.abs(c) ** (2 / n) * m, Math.sign(s) * Math.abs(s) ** (2 / n) * m];
  }
  /** a 3-D scalp point (x3 = screen-right in front, y3 down, z3 toward the camera in front) seen in this view: [x, y, depth] */
  prj(x3: number, y3: number, z3: number): [number, number, number] {
    const psi = this.F ? 0 : this.T ? 0.62 : P / 2, kx = this.T ? 0.88 : 1;
    return [(x3 * Math.cos(psi) + z3 * Math.sin(psi)) * kx, y3, -x3 * Math.sin(psi) + z3 * Math.cos(psi)];
  }
  /** longitude (0 = the face, + = screen-right in front) / latitude (0 = eye level, P/2 = the top) on a sphere of radius rr */
  sph(lon: number, lat: number, rr = 1): [number, number, number] {
    const [x, y, d] = this.prj(Math.cos(lat) * Math.sin(lon), -Math.sin(lat), Math.cos(lat) * Math.cos(lon));
    return [x * rr, y * rr, d];
  }
  pen() { return new Pen(this); }
  ell(x: number, y: number, rx: number, ry: number, a = 0): Path2D { const q = new Path2D(); q.ellipse(this.X(x), this.Y(y), rx * this.h.r, ry * this.h.r, a, 0, 2 * P); return q; }
  poly(pts: V2[]): Path2D { return this.pen().lines(pts).done(); }
  rrect(x: number, y: number, w: number, h: number, rad: number): Path2D {
    const p = this.pen(), r = Math.min(rad, w / 2, h / 2), c = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * (P / 2); p.to(cx + r * Math.cos(a), cy + r * Math.sin(a)); } };
    c(x + w - r, y + r, -P / 2); c(x + w - r, y + h - r, 0); c(x + r, y + h - r, P / 2); c(x + r, y + r, P);
    return p.done();
  }
  /** a closed cloud blob */
  cloud(x: number, y: number, rx: number, ry: number, nb: number, puff = 0.07, a0 = -P / 2): Path2D { return this.pen().cloud(x, y, rx, ry, a0, a0 + 2 * P, nb, puff).done(); }
  /** a tapered tube (lock, tail, strand) along a smooth curve through pts; w(t) = full width at t = 0..1; round caps */
  tube(pts: V2[], w: (t: number) => number): Path2D {
    const s = spline(pts, 10), n = s.length, L = [0];
    for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
    const tot = L[n - 1] || 1, lf: V2[] = [], rt: V2[] = [], tg: V2[] = [], hw: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = s[Math.max(0, i - 1)], b = s[Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l, w2 = w(L[i] / tot) / 2;
      tg.push([tx, ty]); hw.push(w2); lf.push([s[i][0] - ty * w2, s[i][1] + tx * w2]); rt.push([s[i][0] + ty * w2, s[i][1] - tx * w2]);
    }
    const p = this.pen().lines(lf), cap = (c: V2, t: V2, r: number, back: boolean) => {
      for (let j = 1; j < 8; j++) { const th = (j / 8) * P, ux = back ? t[1] : -t[1], uy = back ? -t[0] : t[0], fx = back ? -t[0] : t[0], fy = back ? -t[1] : t[1]; p.to(c[0] + (ux * Math.cos(th) + fx * Math.sin(th)) * r, c[1] + (uy * Math.cos(th) + fy * Math.sin(th)) * r); }
    };
    cap(s[n - 1], tg[n - 1], hw[n - 1], false);
    p.lines(rt.slice().reverse());
    cap(s[0], tg[0], hw[0], true);
    return p.done();
  }
  /** a braid / ringlet: n ellipses along a smooth curve (rx along it, ry across), tilted alternately by +-tilt */
  beads(pts: V2[], n: number, rx: number, ry: number, tilt = 0.5, taper = 0): Path2D[] {
    const A = along(pts), out: Path2D[] = [];
    for (let i = 0; i < n; i++) { const { p, a } = A.at((i + 0.5) / n), kk = 1 - taper * (i / Math.max(1, n - 1)); out.push(this.ell(p[0], p[1], rx * kk, ry * kk, a + (i % 2 ? tilt : -tilt))); }
    return out;
  }
  /** a small brush tip at the end of a downward braid */
  tuft(x: number, y: number, a = P / 2, sz = 1): Path2D {
    return this.poly(rot([[x - 0.1 * sz, y - 0.02], [x - 0.13 * sz, y + 0.2 * sz], [x, y + 0.12 * sz], [x + 0.13 * sz, y + 0.2 * sz], [x + 0.1 * sz, y - 0.02]], x, y, a - P / 2));
  }

  // ---- standard soft (slicked, no fringe) hairlines, from the left / nape end toward the right / face end
  softF(yc = -0.46, part = false): V2[] {
    const H = (y: number) => this.Hs(y);
    const mid: V2[] = part ? [[-0.12, H(yc + 0.03)], [0, H(yc - 0.1)], [0.12, H(yc + 0.03)]] : [[0, H(yc)]];
    return [[-0.94, H(-0.2)], [-0.56, H(yc + 0.07)], ...mid, [0.56, H(yc + 0.07)], [0.94, H(-0.2)]];
  }
  softS(): V2[] { return [[-0.68, 0.32], [-0.5, -0.02], [-0.24, -0.3], [0.3, this.Hs(-0.48)], [0.68, this.Hs(-0.6)]]; }
  softT(part = false): V2[] {
    const H = (y: number) => this.Hs(y), mid: V2[] = part ? [[0.2, H(-0.48)], [0.3, H(-0.6)], [0.4, H(-0.48)]] : [];
    return [[-0.86, 0.14], [-0.66, -0.14], [-0.4, H(-0.32)], [0.08, H(-0.5)], ...mid, [0.62, H(-0.46)], [0.92, H(-0.26)]];
  }
  /** the plain mass for this view (a0 = the front-view side end angle, below horizontal when > 0) with a soft or custom hairline */
  base(o: { a0?: number; part?: boolean; yc?: number; rr?: RF; hl?: V2[]; fr?: number; nape?: number } = {}): Path2D {
    const p = this.pen(), rr = o.rr ?? 1;
    if (this.F) { const a0 = o.a0 ?? 0; p.crown(a0, -P - a0, rr).curve([...(o.hl ?? this.softF(o.yc, o.part)), this.se(a0, rfAt(rr, 0))]); }
    else if (this.S) { const fr = o.fr ?? -0.24 * P, nape = o.nape ?? 0.8 * P; p.crown(fr, nape - 2 * P, rr).curve([...(o.hl ?? this.softS()), this.se(fr, rfAt(rr, 0))]); }
    else { const aF = o.fr ?? -0.12 * P, aB = o.nape ?? 0.86 * P; p.crown(aF, aB - 2 * P, rr).curve([...(o.hl ?? this.softT(o.part)), this.se(aF, rfAt(rr, 0))]); }
    const q = p.done();
    this.front.push(q);
    return q;
  }
}

// ------------------------------------------------------------------------------------------------ the styles
const W_PIG = (t: number) => lerp(0.18, 0.03, t) + 0.3 * sinp(t) ** 0.8;
const W_PONY = (t: number) => lerp(0.24, 0.03, t) + 0.22 * sinp(t) ** 0.8;
const W_LOC = (t: number) => 0.17 - 0.03 * t;

const STYLES: Record<HairX, (k: K) => void> = {
  // a big round cloud around the head
  afro(k) {
    const s = k.s, p = k.pen(), H = (y: number) => k.Hs(y);
    if (k.F) p.cloud(0, -0.3, 1.47 * s, 1.33 * s, 0.17 * P, -1.17 * P, 15).curve([[-1.0, 0.32], [-0.93, 0.0], [-0.84, H(-0.3)], [-0.4, H(-0.5)], [0, H(-0.54)], [0.4, H(-0.5)], [0.84, H(-0.3)], [0.93, 0.0], [1.0, 0.32]]);
    else if (k.S) p.cloud(-0.3, -0.32, 1.5 * s, 1.33 * s, -0.1 * P, -1.38 * P, 14).curve([[-0.62, 0.62], [-0.47, 0.1], [-0.22, -0.28], [0.35, H(-0.48)], [0.85, H(-0.5)]]);
    else p.cloud(-0.12, -0.32, 1.5 * s, 1.33 * s, 0.1 * P, -1.18 * P, 15).curve([[-1.0, 0.36], [-0.82, 0.05], [-0.62, -0.18], [-0.42, H(-0.34)], [0.15, H(-0.5)], [0.62, H(-0.46)], [0.95, H(-0.22)], [1.03, 0.05]]);
    k.front.push(p.done());
  },
  // two cloud puffs on the upper sides of a slicked, centre-parted head
  puffs(k) {
    k.base({ part: true });
    const pf = (x: number, y: number, r: number, back = false) => (back ? k.back : k.front).push(k.cloud(x, y, r, r * 0.94, 10, 0.07));
    if (k.F) { pf(-0.9, -0.95, 0.5); pf(0.9, -0.95, 0.5); }
    else if (k.S) { pf(-0.22, -1.18, 0.5); pf(0.14, -1.3, 0.46, true); }
    else { pf(-0.6, -1.02, 0.5); pf(0.6, -1.18, 0.46, true); }
  },
  // shaved sides, a tall spiked crest down the middle
  mohawk(k) {
    const s = k.s, p = k.pen();
    if (k.F) p.lines([[-0.2, k.Hs(-0.62)], [-0.26, -0.98], [-0.36, -1.3 * s], [-0.2, -1.32 * s], [-0.28, -1.6 * s], [-0.1, -1.56 * s], [0, -1.88 * s], [0.1, -1.56 * s], [0.28, -1.6 * s], [0.2, -1.32 * s], [0.36, -1.3 * s], [0.26, -0.98], [0.2, k.Hs(-0.62)]]).curve([[0, k.Hs(-0.66)], [-0.2, k.Hs(-0.62)]]);
    else if (k.S) p.spikes(-0.3 * P, -1.02 * P, 6, 0.98, (i) => (i === 1 || i === 2 ? 1.55 : 1.45) * s, () => -0.02 * P).crown(-1.02 * P, -0.3 * P, 0.74);
    else p.spikes(-0.34 * P, -1.02 * P, 5, 0.98, (i) => (i === 1 || i === 2 ? 1.55 : 1.45) * s, () => -0.02 * P).curve([[-0.8, -0.5], [-0.38, -0.7], [0.1, -0.7], [0.36, k.Hs(-0.56)]]);
    k.front.push(p.done());
  },
  // short bunches tied at the sides, flaring out
  pigtails(k) {
    k.base({ part: true, a0: 0.02 * P });
    const tail = (pts: V2[], back = false) => (back ? k.back : k.front).push(k.tube(pts, W_PIG), k.ell(pts[0][0], pts[0][1], 0.15, 0.13));
    if (k.F) for (const s of [-1, 1]) tail([[s * 1.02, -0.22], [s * 1.38, 0.05], [s * 1.48, 0.55], [s * 1.32, 1.02]]);
    else if (k.S) { tail([[-0.42, -0.12], [-0.78, 0.18], [-0.86, 0.68], [-0.72, 1.05]]); tail([[-0.6, -0.32], [-1.05, -0.02], [-1.18, 0.5], [-1.08, 0.92]], true); }
    else { tail([[-0.82, -0.2], [-1.2, 0.1], [-1.3, 0.62], [-1.15, 1.02]]); tail([[0.88, -0.42], [1.25, -0.15], [1.36, 0.42], [1.22, 0.85]], true); }
  },
  // two long braids over the shoulders
  braids(k) {
    k.base({ part: true, a0: 0.12 * P, hl: k.F ? [[-0.96, 0.32], ...k.softF(-0.46, true), [0.96, 0.32]] : undefined, nape: k.S ? 0.74 * P : undefined });
    const br = (pts: V2[], back = false) => { const L = back ? k.back : k.front, e = pts[pts.length - 1]; L.push(...k.beads(pts, 8, 0.13, 0.17, 0.5), k.tuft(e[0], e[1] - 0.04)); };
    if (k.F) for (const s of [-1, 1]) br([[s * 1.0, 0.42], [s * 0.98, 1.1], [s * 0.9, 1.75]]);
    else if (k.S) { br([[-0.5, 0.45], [-0.42, 1.1], [-0.3, 1.75]]); br([[-0.78, 0.4], [-0.74, 1.05], [-0.64, 1.7]], true); }
    else { br([[-0.82, 0.42], [-0.78, 1.1], [-0.68, 1.75]]); br([[0.88, 0.32], [0.86, 1.0], [0.78, 1.65]], true); }
  },
  // short spiky top, long flicked back
  mullet(k) {
    const H = (y: number) => k.H(y);
    if (k.F) {
      const a0 = -Math.asin(Math.min(0.9, k.h.lift * 0.8)) * 0.6, y0 = H(-0.3), xr = k.se(a0)[0], p = k.pen().crown(a0, -P - a0);
      p.to(-xr + 0.06, y0).teeth(-xr + 0.06, xr - 0.06, y0, 5, (i) => y0 + (i % 2 ? 0.12 : 0.17));
      k.front.push(p.done());
      k.back.push(k.pen().to(-1.0, -0.35).curve([[-1.12, 0.4], [-1.2, 0.98]]).lines([[-0.95, 0.82], [-0.82, 1.06], [-0.55, 0.86], [-0.3, 1.0], [0, 0.88], [0.3, 1.0], [0.55, 0.86], [0.82, 1.06], [0.95, 0.82], [1.2, 0.98]]).curve([[1.12, 0.4], [1.0, -0.35]]).done());
    } else if (k.S) {
      k.front.push(k.pen().crown(-0.24 * P, -0.98 * P).curve([[-1.15, 0.45], [-1.22, 1.0]]).lines([[-0.98, 0.86], [-0.88, 1.08], [-0.68, 0.88], [-0.5, 1.0], [-0.42, 0.72]])
        .curve([[-0.46, 0.25], [-0.4, -0.08], [-0.2, -0.3], [0.3, H(-0.42)]]).lines([[0.45, H(-0.13)], [0.6, H(-0.36)], [0.78, H(-0.13)], [0.86, H(-0.4)]]).done());
    } else {
      const y0 = H(-0.3), p = k.pen().crown(-0.12 * P, -1.0 * P).curve([[-1.15, 0.45], [-1.22, 1.0]]).lines([[-1.0, 0.86], [-0.92, 1.08], [-0.74, 0.88], [-0.62, 1.0], [-0.56, 0.7]])
        .curve([[-0.82, 0.38], [-0.84, 0.05], [-0.62, -0.16], [-0.45, y0]]);
      p.teeth(-0.45, 0.88, y0, 4, (i) => y0 + (i % 2 ? 0.12 : 0.17)).curve([[0.95, k.Hs(-0.3)]]);
      k.front.push(p.done());
    }
  },
  // a big rounded roll swept up and back from the forehead
  pompadour(k) {
    const H = (y: number) => k.Hs(y), s = k.s;
    if (k.F) { const rr = (t: number) => 0.95 + 0.5 * s * Math.exp(-(((t - 0.52) / 0.19) ** 2)); k.base({ a0: -0.1 * P, rr, hl: [[-0.86, H(-0.3)], [-0.5, H(-0.56)], [0, H(-0.66)], [0.5, H(-0.56)], [0.86, H(-0.3)]] }); }
    /* profile: the roll rises steeply from the brow, curls forward at the front tip, the back slopes down tight to the skull */
    else if (k.S) k.front.push(k.pen().to(0.86, -0.72).curve([[0.98, -1.05], [1.06, -1.45 * s], [1.1, -1.72 * s], [0.84, -1.8 * s], [0.42, -1.62 * s], [-0.05, -1.4 * s], [-0.55, -1.12], k.se(-0.8 * P, 0.97)]).crown(-0.8 * P, -1.22 * P, 0.97).curve([[-0.62, 0.26], [-0.48, -0.08], [-0.24, -0.36], [0.3, H(-0.52)], [0.66, H(-0.6)], [0.9, -0.74]]).done());
    else k.front.push(k.pen().to(0.8, -0.7).curve([[0.9, -1.05], [0.96, -1.45 * s], [0.98, -1.72 * s], [0.7, -1.8 * s], [0.28, -1.62 * s], [-0.18, -1.4 * s], [-0.66, -1.06], k.se(-0.82 * P, 0.97)]).crown(-0.82 * P, -1.16 * P, 0.97).curve([[-0.86, 0.1], [-0.66, -0.18], [-0.4, H(-0.38)], [0.15, H(-0.54)], [0.55, H(-0.58)], [0.84, -0.7]]).done());
  },
  // long top flopped to one side over very short sides
  undercut(k) {
    const H = (y: number) => k.H(y);
    const s = k.s, top = (t: number) => 1.0 + 0.12 * s * Math.sin(P * t);
    if (k.F) k.front.push(k.pen().to(0.92, -0.04).curve([[1.12, -0.38]]).crown(-0.1 * P, -0.9 * P, top).curve([[-0.95, -0.42], [-0.6, k.Hs(-0.62)], [-0.15, k.Hs(-0.68)], [0.3, H(-0.46)], [0.62, H(-0.26)], [0.92, -0.04]]).done());
    else if (k.S) k.front.push(k.pen().to(0.94, -0.7).curve([[0.95, -1.12 * s], [0.4, -1.4 * s], [-0.4, -1.32 * s], [-0.96, -0.86], [-1.16, -0.4]]).curve([[-0.85, -0.48], [-0.3, -0.6], [0.3, k.Hs(-0.62)], [0.74, -0.66]]).done());
    else k.front.push(k.pen().to(0.94, -0.05).curve([[1.04, -0.5], [0.98, -1.0 * s], [0.55, -1.36 * s], [-0.15, -1.38 * s], [-0.75, -1.1], [-1.14, -0.42]]).curve([[-0.9, -0.46], [-0.5, -0.6], [0.0, k.Hs(-0.64)], [0.42, H(-0.44)], [0.74, H(-0.24)], [0.94, -0.05]]).done());
  },
  // centre-parted 90s curtains framing the forehead
  curtains(k) {
    const yb = k.Yb, yp = k.H(-0.75), ym = lerp(yb, yp, 0.32);
    if (k.F) { const a0 = 0.06 * P; k.front.push(k.pen().crown(a0, -P - a0).curve([[-0.98, 0.1], [-0.86, yb]]).curve([[-0.42, ym], [0, yp]]).curve([[0.42, ym], [0.86, yb]]).curve([[0.98, 0.1], k.se(a0)]).done()); }
    else if (k.S) k.front.push(k.pen().crown(-0.2 * P, -1.2 * P).curve([[-0.66, 0.34], [-0.48, -0.02], [-0.22, -0.28], [0.3, -0.42]]).curve([[0.7, yb + 0.04]]).curve([[0.95, yb - 0.05]]).curve([[1.02, -0.55], k.se(-0.2 * P)]).done());
    else k.front.push(k.pen().crown(-0.04 * P, -1.14 * P).curve([[-0.86, 0.14], [-0.66, -0.12], [-0.42, yb + 0.02]]).curve([[-0.05, ym - 0.04], [0.28, yp]]).curve([[0.6, ym], [0.86, yb + 0.02]]).curve([[0.98, -0.05], k.se(-0.04 * P)]).done());
  },
  // long choppy side fringe over one eye, choppy ends at the jaw
  emo(k) {
    const H = (y: number) => k.H(y);
    if (k.F) { const a0 = 0.14 * P; k.front.push(k.pen().crown(a0, -P - a0).lines([[-0.86, 0.48], [-0.9, 0.2]]).curve([[-0.84, H(-0.18)], [-0.45, H(-0.4)], [-0.08, H(-0.34)]]).curve([[0.22, -0.12]]).lines([[0.36, 0.2], [0.46, -0.02], [0.62, 0.3], [0.74, 0.05], [0.88, 0.42], [0.92, 0.25]]).done()); }
    else if (k.S) k.front.push(k.pen().crown(-0.12 * P, -1.18 * P).lines([[-0.88, 0.75], [-0.72, 0.5], [-0.6, 0.68], [-0.48, 0.38]]).curve([[-0.38, 0.05], [-0.2, -0.26], [0.25, H(-0.32)]]).curve([[0.5, -0.1]]).lines([[0.6, 0.18], [0.72, 0.0], [0.86, 0.22], [0.95, 0.0], [1.06, 0.12]]).done());
    else k.front.push(k.pen().crown(0.1 * P, -1.16 * P).lines([[-0.95, 0.72], [-0.82, 0.46], [-0.7, 0.62], [-0.66, 0.3]]).curve([[-0.7, 0.0], [-0.55, H(-0.22)], [-0.2, H(-0.38)], [0.18, H(-0.3)]]).curve([[0.4, -0.08]]).lines([[0.5, 0.2], [0.6, 0.0], [0.76, 0.3], [0.86, 0.05], [1.0, 0.42]]).done());
  },
  // slicked back into a knot on the very top with a little sprout
  topknot(k) {
    k.base({ yc: -0.5 });
    const [x, a] = k.F ? [0, 0] : k.S ? [-0.15, -0.25] : [-0.08, -0.12];
    k.front.push(k.ell(x, -1.24, 0.28, 0.23, a), k.poly(rot([[-0.12, -1.34], [-0.3, -1.62], [-0.08, -1.5], [0, -1.7], [0.08, -1.5], [0.3, -1.62], [0.12, -1.34]].map(([px, py]) => [px + x, py] as V2), x, -1.24, a)));
  },
  // locs hanging from the crown to the shoulders
  dreads(k) {
    k.base({ a0: 0.03 * P, yc: -0.48 });
    const loc = (pts: V2[], back = false) => (back ? k.back : k.front).push(k.tube(pts, W_LOC));
    if (k.F) for (const s of [-1, 1]) {
      loc([[s * 0.86, -0.55], [s * 1.1, -0.1], [s * 1.14, 0.55], [s * 1.06, 1.05]]);
      loc([[s * 1.0, -0.25], [s * 1.3, 0.25], [s * 1.34, 0.95]]);
      loc([[s * 0.96, 0.05], [s * 0.94, 0.6], [s * 0.88, 1.12]]);
      loc([[s * 0.78, 0.0], [s * 0.74, 0.7], [s * 0.72, 1.25]], true);
    }
    else if (k.S) {
      loc([[-0.5, -0.85], [-0.95, -0.3], [-1.08, 0.5], [-1.0, 1.15]]); loc([[-0.8, -0.55], [-1.25, 0.05], [-1.32, 0.9]]);
      loc([[-0.6, -0.2], [-0.72, 0.5], [-0.68, 1.2]]); loc([[-0.35, 0.0], [-0.42, 0.6], [-0.35, 1.15]]);
      loc([[-0.95, -0.6], [-1.45, -0.1], [-1.5, 0.75]], true);
    } else {
      loc([[-0.6, -0.75], [-1.0, -0.2], [-1.1, 0.55], [-1.02, 1.15]]); loc([[-0.85, -0.45], [-1.32, 0.1], [-1.36, 0.92]]);
      loc([[-0.68, 0.0], [-0.78, 0.6], [-0.72, 1.18]]);
      loc([[0.85, -0.4], [1.15, 0.2], [1.12, 0.95]], true); loc([[0.95, -0.1], [0.92, 1.0]], true);
    }
  },
  // thin strands combed over a bald top from a low side part
  combover(k) {
    const strand = (a0: number, a1: number, rho: number, dy = 0) => {
      const pts: V2[] = []; for (let i = 0; i <= 6; i++) { const t = i / 6, [x, y] = k.se(lerp(a0, a1, t), rho / k.R); pts.push([x, y + dy * t]); }
      k.front.push(k.tube(pts, (t) => 0.09 - 0.03 * t));
    };
    if (k.F) {
      k.front.push(k.pen().crown(-1.04 * P, -0.84 * P).curve([[-0.86, -0.52], [-0.9, -0.1], [-0.98, 0.2]]).done());
      k.front.push(k.pen().crown(0.04 * P, -0.16 * P).curve([[0.86, -0.52], [0.9, -0.1], [0.98, 0.2]]).done());
      strand(-0.84 * P, -0.18 * P, 1.0, 0.06); strand(-0.82 * P, -0.24 * P, 0.78, 0.1);
    } else {
      const S = k.S, a0 = S ? -0.88 * P : -0.9 * P;
      k.front.push(k.pen().crown(a0, (S ? 0.8 : 0.86) * P - 2 * P, 1.02).curve(S ? [[-0.66, 0.38], [-0.48, 0.02], [-0.18, -0.18], [0.08, -0.32], [-0.3, -0.55], [-0.8, -0.6]] : [[-0.86, 0.14], [-0.7, -0.14], [-0.45, -0.22], [-0.28, -0.36], [-0.5, -0.56], [-0.9, -0.6]]).done());
      const e = S ? -0.28 * P : -0.2 * P;
      strand(a0 + 0.02 * P, e, 1.0, 0.06); strand(a0 + 0.06 * P, e - 0.04 * P, 0.8, 0.1);
    }
  },
  // a tall level box on top
  flattop(k) {
    const R = k.R, top = -1.2 * R, H = (y: number) => k.Hs(y);
    if (k.F) k.front.push(k.pen().lines([[0.94 * R, -0.12], [0.97 * R, top + 0.14], [0.86 * R, top], [-0.86 * R, top], [-0.97 * R, top + 0.14], [-0.94 * R, -0.12]]).curve([[-0.92, -0.22], [-0.86, H(-0.42)], [0, H(-0.48)], [0.86, H(-0.42)], [0.92, -0.22], [0.94 * R, -0.12]]).done());
    else if (k.S) k.front.push(k.pen().lines([[0.84 * R, -0.66], [0.88 * R, top + 0.12], [0.78 * R, top], [-0.86 * R, top], [-0.98 * R, top + 0.15], [-1.0 * R, -0.2], [-0.95, 0.5]]).curve([[-0.68, 0.32], [-0.5, -0.02], [-0.24, -0.3], [0.3, H(-0.48)], [0.7, H(-0.56)], [0.84 * R, -0.66]]).done());
    else k.front.push(k.pen().lines([[0.9 * R, -0.45], [0.92 * R, top + 0.12], [0.82 * R, top], [-0.86 * R, top], [-0.98 * R, top + 0.15], [-1.0 * R, -0.1], [-0.95, 0.42]]).curve([...k.softT(), [0.9 * R, -0.45]]).done());
  },
  // two smooth round buns on top, the rest hanging straight to the shoulders
  spacebuns(k) {
    k.base({ part: true, a0: 0.05 * P });
    if (k.F) { k.front.push(k.ell(-0.66, -1.1, 0.36, 0.33), k.ell(0.66, -1.1, 0.36, 0.33)); k.back.push(k.rrect(-1.12, -0.4, 2.24, 1.5, 0.45)); }
    else if (k.S) { k.front.push(k.ell(-0.2, -1.2, 0.36, 0.33)); k.back.push(k.ell(0.15, -1.26, 0.34, 0.31), k.rrect(-1.12, -0.3, 1.0, 1.4, 0.4)); }
    else { k.front.push(k.ell(-0.52, -1.1, 0.36, 0.33)); k.back.push(k.ell(0.58, -1.15, 0.34, 0.31), k.rrect(-1.14, -0.4, 1.55, 1.5, 0.45)); }
  },
  // blunt straight-cut bangs, straight hair to the shoulders
  bangs(k) {
    const yb = k.Yb;
    if (k.F) { k.front.push(k.pen().to(1.12, 0.62).crown(0.04 * P, -1.04 * P).lines([[-1.12, 0.62], [-0.84, 0.62], [-0.86, yb]]).curve([[0, yb - 0.04], [0.86, yb]]).lines([[0.84, 0.62]]).done()); k.back.push(k.rrect(-1.13, -0.2, 2.26, 1.32, 0.12)); }
    else if (k.S) { k.front.push(k.pen().to(0.96, yb).curve([[1.0, -0.6], k.se(-0.22 * P)]).crown(-0.22 * P, -0.97 * P).lines([[-1.13, 0.5], [-1.04, 0.96]]).curve([[-0.5, 0.8], [0.25, 0.64]]).lines([[0.3, 0.0], [0.42, yb + 0.02]]).done()); k.back.push(k.rrect(-1.13, -0.1, 0.85, 1.22, 0.12)); }
    else { k.front.push(k.pen().to(0.93, yb).lines([[0.92, 0.62], [1.08, 0.62]]).crown(0.04 * P, -1.0 * P).lines([[-1.14, 0.62], [-0.42, 0.62], [-0.38, yb]]).curve([[0.3, yb - 0.04], [0.93, yb]]).done()); k.back.push(k.rrect(-1.14, -0.2, 1.6, 1.32, 0.12)); }
  },
  // long wavy hair with a side part
  wavy(k) {
    const H = (y: number) => k.H(y);
    const wav = (x0: number, x1: number) => k.back.push(k.pen().to(x0 + 0.12, -0.4).curve([[x0 - 0.02, 0.0], [x0 - 0.12, 0.35], [x0, 0.7], [x0 - 0.12, 1.05], [x0 - 0.05, 1.4]]).bumps([[x1 + 0.05, 1.4]], Math.max(3, Math.round((x1 - x0) * 2.6)), 0.07).curve([[x1 + 0.12, 1.05], [x1, 0.7], [x1 + 0.12, 0.35], [x1 + 0.02, 0.0], [x1 - 0.12, -0.4]]).done());
    if (k.F) { const a0 = 0.1 * P; k.base({ a0, hl: [[-0.94, 0.3], [-0.92, k.Hs(-0.1)], [-0.55, H(-0.24)], [0.1, H(-0.5)], [0.4, H(-0.8)], [0.72, H(-0.55)], [0.93, k.Hs(-0.12)], [0.94, 0.3]] }); wav(-1.12, 1.12); }
    else if (k.S) { k.base({ nape: 0.74 * P }); wav(-1.12, -0.28); }
    else { k.base({ part: true, nape: 0.8 * P }); wav(-1.14, 0.5); }
  },
  // bed head: uneven spikes all round, a ragged fringe
  messy(k) {
    const rnd = rng("messy:" + k.h.view), J = () => rnd(), H = (y: number) => k.H(y), p = k.pen();
    const tip = () => H(-0.13) - 0.06 * J(), val = () => H(-0.38);
    if (k.F) p.spikes(0.02 * P, -1.02 * P, 11, 0.98, () => 1.1 + 0.2 * J(), () => (J() - 0.5) * 0.05 * P).lines([[-1.22, 0.24], [-0.94, 0.0], [-0.86, H(-0.3)], [-0.62, tip()], [-0.45, val()], [-0.28, tip()], [-0.1, val()], [0.08, tip()], [0.25, val()], [0.42, tip()], [0.56, val()], [0.72, tip()], [0.86, H(-0.3)], [0.94, 0.0], [1.22, 0.24]]);
    else if (k.S) p.spikes(-0.2 * P, -1.2 * P, 9, 0.98, () => 1.1 + 0.2 * J(), () => (J() - 0.5) * 0.05 * P).lines([[-1.2, 0.82], [-0.85, 0.62]]).curve([[-0.6, 0.3], [-0.48, -0.02], [-0.24, -0.3]]).lines([[0.3, H(-0.35)], [0.46, tip()], [0.6, val()], [0.78, tip()], [0.9, -0.65]]);
    else p.spikes(-0.1 * P, -1.14 * P, 10, 0.98, () => 1.1 + 0.2 * J(), () => (J() - 0.5) * 0.05 * P).lines([[-1.2, 0.6], [-0.92, 0.32]]).curve([[-0.66, -0.14], [-0.42, H(-0.3)]]).lines([[-0.2, tip()], [-0.02, val()], [0.22, tip()], [0.38, val()], [0.6, tip()], [0.72, val()], [0.92, tip()]]);
    k.front.push(p.done());
  },
  // neat short hair with one springy curl standing on the crown
  curl(k) {
    k.base({ yc: -0.48 });
    const x = k.F ? 0.02 : k.S ? -0.12 : -0.04;
    k.front.push(k.tube([[x, -1.0], [x - 0.08, -1.22], ...spiral(x + 0.12, -1.36, 0.22, 1.15, P, 1, 0.7)], (t) => lerp(0.16, 0.05, t)));
  },
  // slicked straight back, a small widow's peak, a flip at the nape
  slick(k) {
    const H = (y: number) => k.Hs(y), rr = 0.97;
    if (k.F) k.base({ a0: -0.02 * P, rr, hl: [[-0.92, H(-0.28)], [-0.5, H(-0.55)], [-0.14, H(-0.6)], [0, H(-0.47)], [0.14, H(-0.6)], [0.5, H(-0.55)], [0.92, H(-0.28)]] });
    else if (k.S) k.front.push(k.pen().crown(-0.2 * P, 0.8 * P - 2 * P, rr).curve([[-0.98, 0.72], [-0.7, 0.5], [-0.56, 0.2], [-0.48, -0.04], [-0.24, -0.32], [0.3, H(-0.52)], [0.72, H(-0.62)]]).done());
    else k.front.push(k.pen().crown(-0.1 * P, 0.86 * P - 2 * P, rr).curve([[-1.0, 0.56], [-0.88, 0.3], ...k.softT()]).done());
  },
  // a tall rounded hive on top, flipped ends
  beehive(k) {
    const s = k.s, flip = (pts: V2[], back = false) => (back ? k.back : k.front).push(k.tube(pts, (t) => lerp(0.24, 0.06, t)));
    k.base({ a0: 0.03 * P, yc: -0.5 });
    if (k.F) { k.front.push(k.ell(0, -1.32 * s, 0.82 * s, 0.66 * s)); for (const g of [-1, 1]) flip([[g * 1.02, 0.08], [g * 1.2, 0.26], [g * 1.38, 0.12]]); }
    else if (k.S) { k.front.push(k.ell(-0.22, -1.3 * s, 0.9 * s, 0.64 * s, -0.12)); flip([[-0.95, 0.5], [-1.2, 0.68], [-1.36, 0.5]]); }
    else { k.front.push(k.ell(-0.12, -1.31 * s, 0.86 * s, 0.65 * s, -0.08)); flip([[-1.0, 0.4], [-1.25, 0.58], [-1.4, 0.42]]); flip([[1.0, 0.1], [1.22, 0.3], [1.36, 0.15]], true); }
  },
  // short cropped cut, wispy side-swept fringe, pointed sideburns and nape
  pixie(k) {
    const H = (y: number) => k.H(y), Hs = (y: number) => k.Hs(y), rr = 0.98;
    if (k.F) k.front.push(k.pen().to(1.0, 0.28).to(1.08, -0.05).crown(-0.03 * P, -0.97 * P, rr).lines([[-1.08, -0.05], [-1.0, 0.28], [-0.92, -0.02]]).curve([[-0.84, Hs(-0.3)]])
      .lines([[-0.55, H(-0.4)], [-0.3, H(-0.13)], [-0.18, H(-0.38)], [0.1, H(-0.13)], [0.22, H(-0.38)], [0.5, H(-0.15)], [0.62, H(-0.38)]]).curve([[0.86, Hs(-0.3)], [0.92, -0.02]]).done());
    else if (k.S) k.front.push(k.pen().crown(-0.22 * P, -1.16 * P, rr).lines([[-0.78, 0.82], [-0.66, 0.42]]).curve([[-0.5, 0.0]]).lines([[-0.26, -0.22], [-0.15, 0.08], [-0.04, -0.3], [0.3, H(-0.4)], [0.55, H(-0.15)], [0.62, H(-0.38)], [0.86, H(-0.18)]]).done());
    else k.front.push(k.pen().crown(-0.1 * P, -1.16 * P, rr).lines([[-0.86, 0.7], [-0.82, 0.3]]).curve([[-0.62, -0.12]]).lines([[-0.46, 0.22], [-0.38, -0.2], [-0.1, H(-0.4)], [0.18, H(-0.13)], [0.28, H(-0.38)], [0.55, H(-0.13)], [0.66, H(-0.38)], [0.9, H(-0.15)], [0.96, -0.3]]).done());
  },
  // bald on top, a ring of hair round the sides and the back
  horseshoe(k) {
    /* fluffy tufts: bumps bulge to the right of the travel direction, so the left side runs down, the right side runs up */
    const w = 0.04 + 0.5 * (k.R - 1);
    if (k.F) {
      k.front.push(k.pen().to(-0.86, -0.42).lines([[-0.92, -0.6]]).bumps([[-1.0 - w, -0.48], [-1.04 - w, -0.15], [-1.0 - w, 0.15], [-0.96, 0.26]], 5, 0.035).curve([[-0.9, 0.0], [-0.86, -0.25]]).done());
      k.front.push(k.pen().to(0.96, 0.26).bumps([[1.0 + w, 0.15], [1.04 + w, -0.15], [1.0 + w, -0.48], [0.92, -0.6]], 5, 0.035).lines([[0.86, -0.42]]).curve([[0.86, -0.25], [0.9, 0.0]]).done());
    } else if (k.S) k.front.push(k.pen().to(-0.2, -0.14).curve([[-0.28, -0.26], [-0.6, -0.36], [-0.95, -0.42]]).bumps([[-1.04 - w, -0.2], [-1.06 - w, 0.1], [-0.98 - w, 0.42], [-0.84, 0.64]], 6, 0.035).curve([[-0.66, 0.36], [-0.52, 0.12], [-0.44, -0.04], [-0.3, -0.06]]).done());
    else {
      k.front.push(k.pen().to(-0.52, -0.16).curve([[-0.6, -0.28], [-0.8, -0.38], [-1.0, -0.42]]).bumps([[-1.05 - w, -0.2], [-1.07 - w, 0.1], [-0.98 - w, 0.42], [-0.84, 0.62]], 6, 0.035).curve([[-0.88, 0.35], [-0.84, 0.08], [-0.74, -0.08], [-0.6, -0.1]]).done());
      k.back.push(k.pen().to(0.86, 0.22).bumps([[1.06, 0.12], [1.12, -0.2], [0.98, -0.5], [0.8, -0.52]], 4, 0.04).done());
    }
  },
  // long spiral ringlets hanging round the face
  ringlets(k) {
    k.base({ part: true, a0: 0.08 * P });
    const rl = (pts: V2[], back = false) => (back ? k.back : k.front).push(...k.beads(pts, 7, 0.12, 0.14, 0.7, 0.2));
    if (k.F) for (const s of [-1, 1]) { rl([[s * 1.0, 0.0], [s * 1.06, 0.6], [s * 1.02, 1.15]]); rl([[s * 1.2, -0.25], [s * 1.32, 0.35], [s * 1.3, 0.95]]); rl([[s * 0.75, 0.3], [s * 0.78, 1.25]], true); }
    else if (k.S) { rl([[-0.45, 0.2], [-0.5, 0.7], [-0.45, 1.2]]); rl([[-0.8, 0.0], [-0.92, 0.55], [-0.9, 1.1]]); rl([[-1.1, -0.2], [-1.25, 0.4], [-1.2, 0.95]], true); }
    else { rl([[-0.75, 0.15], [-0.82, 0.68], [-0.78, 1.2]]); rl([[-1.05, -0.1], [-1.18, 0.45], [-1.15, 1.0]]); rl([[0.9, 0.0], [1.05, 0.5], [1.0, 1.05]], true); }
  },
  // a ponytail tied high on the crown, arcing up and falling behind
  highpony(k) {
    k.base({ yc: -0.5 });
    if (k.F) { k.front.push(k.ell(0, -1.15, 0.2, 0.14)); k.back.push(k.tube([[0, -1.15], [0.32, -1.55], [0.85, -1.4], [1.18, -0.6], [1.25, 0.3]], W_PONY)); }
    else if (k.S) { k.front.push(k.ell(-0.55, -1.02, 0.2, 0.15, 0.6)); k.back.push(k.tube([[-0.58, -1.05], [-1.0, -1.45], [-1.45, -1.1], [-1.58, -0.25], [-1.42, 0.55]], W_PONY)); }
    else { k.front.push(k.ell(-0.45, -1.05, 0.2, 0.15, 0.5)); k.back.push(k.tube([[-0.48, -1.08], [-0.92, -1.45], [-1.42, -1.12], [-1.56, -0.28], [-1.4, 0.52]], W_PONY)); }
  },
  // layered and choppy, flicked out at the sides, wispy fringe
  shag(k) {
    const H = (y: number) => k.H(y), y0 = H(-0.38), tips = (x0: number, x1: number, n: number, p: Pen) => p.teeth(x0, x1, y0, n, (i) => H(-0.13) - (i % 2 ? 0.05 : 0), 0.6);
    if (k.F) { const p = k.pen().to(0.9, 0.42).lines([[1.25, 0.56]]).curve([[1.12, 0.3]]).lines([[1.3, 0.16]]).curve([[1.14, -0.08]]).crown(-0.06 * P, -0.94 * P).lines([[-1.3, 0.16]]).curve([[-1.12, 0.3]]).lines([[-1.25, 0.56], [-0.9, 0.42]]).curve([[-0.88, 0.1], [-0.8, y0]]); tips(-0.8, 0.8, 5, p); k.front.push(p.curve([[0.88, 0.1], [0.9, 0.42]]).done()); }
    else if (k.S) { const p = k.pen().crown(-0.22 * P, -0.97 * P).lines([[-1.3, 0.12]]).curve([[-1.12, 0.3]]).lines([[-1.28, 0.58]]).curve([[-1.0, 0.55]]).lines([[-1.1, 0.88]]).curve([[-0.78, 0.7], [-0.5, 0.3], [-0.4, -0.05], [-0.2, -0.28], [0.3, y0]]); tips(0.3, 0.9, 2, p); k.front.push(p.done()); }
    else { const p = k.pen().crown(-0.1 * P, -1.0 * P).lines([[-1.3, 0.14]]).curve([[-1.12, 0.32]]).lines([[-1.28, 0.6]]).curve([[-1.0, 0.56]]).lines([[-1.08, 0.86]]).curve([[-0.8, 0.6], [-0.82, 0.2], [-0.64, -0.14], [-0.42, y0]]); tips(-0.42, 0.9, 4, p); k.front.push(p.curve([[0.98, -0.2]]).done()); }
  },

  // ---------------------------------------------------------------- more silhouettes
  // a round helmet with a straight rim at brow height
  bowl(k) {
    const yb = k.Yb + 0.04, rr = 1.03;
    if (k.F) k.front.push(k.pen().crown(0, -P, rr).curve([[-0.95, yb + 0.02], [0, yb], [0.95, yb + 0.02], k.se(0, rr)]).done());
    else if (k.S) k.front.push(k.pen().to(0.98, yb).curve([[1.06, -0.62]]).crown(-0.17 * P, -1.0 * P, rr).lines([[-1.12, 0.1]]).curve([[-0.4, 0.0], [0.2, yb + 0.08], [0.98, yb]]).done());
    else k.front.push(k.pen().to(1.0, yb).curve([[1.08, -0.6]]).crown(-0.16 * P, -1.02 * P, rr).lines([[-1.14, 0.07]]).curve([[-0.7, 0.0], [-0.38, yb + 0.06], [0.4, yb + 0.02], [1.0, yb]]).done());
  },
  // a low bun at the side of the nape (screen-left in front = the near side)
  sidebun(k) {
    k.base({ a0: 0.02 * P });
    if (k.F) k.back.push(k.ell(-1.0, 0.4, 0.4, 0.36));
    else if (k.S) k.front.push(k.ell(-0.9, 0.35, 0.4, 0.37));
    else k.front.push(k.ell(-0.98, 0.32, 0.4, 0.37));
  },
  // long twin tails tied high on the sides
  twintails(k) {
    k.base({ part: true, a0: 0.02 * P });
    const W = (t: number) => lerp(0.28, 0.04, t) + 0.24 * sinp(t) ** 0.7;
    if (k.F) for (const s of [-1, 1]) { k.front.push(k.ell(s * 0.82, -0.9, 0.17, 0.15)); k.back.push(k.tube([[s * 0.85, -0.92], [s * 1.28, -0.8], [s * 1.42, 0.1], [s * 1.36, 1.2], [s * 1.18, 2.1]], W)); }
    else if (k.S) { k.front.push(k.ell(-0.3, -1.02, 0.17, 0.15)); k.back.push(k.tube([[-0.38, -1.05], [-1.0, -0.95], [-1.38, 0.0], [-1.32, 1.2], [-1.12, 2.15]], W)); }
    else { k.front.push(k.ell(-0.55, -0.98, 0.17, 0.15)); k.back.push(k.ell(0.66, -1.02, 0.15, 0.13), k.tube([[-0.6, -1.0], [-1.2, -0.85], [-1.5, 0.1], [-1.42, 1.25], [-1.2, 2.15]], W), k.tube([[0.7, -1.04], [1.22, -0.9], [1.42, 0.1], [1.32, 1.2], [1.12, 2.1]], W)); }
  },
  // short sides rising to a ridge of short spikes down the middle
  fauxhawk(k) {
    const H = (y: number) => k.Hs(y), s = k.s, p = k.pen(), up = (i: number, n: number) => ((i - (n - 1) / 2) / n) * 0.06 * P;
    if (k.F) p.crown(-0.08 * P, -0.36 * P).spikes(-0.36 * P, -0.64 * P, 4, 1.04, (i) => (i === 1 || i === 2 ? 1.42 : 1.3) * s, (i) => -up(i, 4) * 2).crown(-0.64 * P, -0.92 * P)
      .curve([[-0.9, H(-0.32)], [-0.45, H(-0.52)], [-0.12, H(-0.56)]]).lines([[0, k.H(-0.2)], [0.12, H(-0.56)]]).curve([[0.45, H(-0.52)], [0.9, H(-0.32)], k.se(-0.08 * P)]);
    else if (k.S) p.crown(-0.22 * P, -0.3 * P).spikes(-0.3 * P, -0.78 * P, 5, 1.04, (i) => (i < 3 ? 1.38 : 1.3) * s, () => -0.03 * P).crown(-0.78 * P, 0.8 * P - 2 * P).curve([...k.softS(), k.se(-0.22 * P)]);
    else p.crown(-0.1 * P, -0.34 * P).spikes(-0.34 * P, -0.8 * P, 5, 1.04, (i) => (i < 3 ? 1.38 : 1.3) * s, () => -0.03 * P).crown(-0.8 * P, 0.86 * P - 2 * P).curve([...k.softT(), k.se(-0.1 * P)]);
    k.front.push(p.done());
  },
  // short sides, one upswept wave at the front with a pointed tip
  quiff(k) {
    k.base({ a0: -0.06 * P, yc: -0.5 });
    const s = k.s;
    if (k.F) k.front.push(k.pen().to(-0.28, -0.8).curve([[-0.06, -1.3 * s], [0.24, -1.55 * s]]).lines([[0.44, -1.64 * s]]).curve([[0.5, -1.3 * s], [0.42, -0.9]]).done());
    else if (k.S) k.front.push(k.pen().to(0.2, -0.88).curve([[0.52, -1.36 * s], [0.95, -1.52 * s]]).lines([[1.14, -1.5 * s]]).curve([[1.02, -1.2 * s], [0.9, -0.8]]).done());
    else k.front.push(k.pen().to(0.02, -0.88).curve([[0.34, -1.38 * s], [0.75, -1.55 * s]]).lines([[0.94, -1.52 * s]]).curve([[0.88, -1.2 * s], [0.8, -0.78]]).done());
  },
  // long separate spikes radiating round the crown
  punk(k) {
    k.base({ a0: -0.08 * P, yc: -0.5 });
    const angs = k.F ? [-0.1, -0.25, -0.38, -0.5, -0.62, -0.75, -0.9] : k.S ? [-0.22, -0.38, -0.54, -0.7, -0.86, -1.02] : [-0.2, -0.36, -0.52, -0.68, -0.84, -1.0];
    for (const a of angs) k.front.push(k.poly([k.se((a - 0.065) * P, 0.86), k.se(a * P, 1.55 * k.s), k.se((a + 0.065) * P, 0.86)]));
  },
  // blunt bangs, chin-length side locks, very long straight back
  hime(k) {
    const yb = k.Yb;
    if (k.F) { k.front.push(k.pen().to(1.08, 0.75).to(1.12, 0.1).crown(0.03 * P, -1.03 * P).lines([[-1.12, 0.1], [-1.08, 0.75], [-0.8, 0.75], [-0.8, yb], [0.8, yb], [0.8, 0.75]]).done()); k.back.push(k.rrect(-1.16, -0.3, 2.32, 2.5, 0.25)); }
    else if (k.S) { k.front.push(k.pen().to(0.96, yb).curve([[1.0, -0.6], k.se(-0.2 * P)]).crown(-0.2 * P, -1.0 * P).lines([[-1.13, 0.4], [-1.02, 0.96], [-0.26, 0.96], [-0.2, 0.75], [0.16, 0.75], [0.18, -0.12]]).curve([[0.45, yb]]).done()); k.back.push(k.rrect(-1.16, -0.2, 0.95, 2.4, 0.2)); }
    else { k.front.push(k.pen().to(0.9, yb).lines([[0.9, 0.75], [1.06, 0.75], [1.1, 0.1]]).crown(0.03 * P, -1.0 * P).lines([[-1.13, 0.75], [-0.38, 0.75], [-0.38, yb]]).done()); k.back.push(k.rrect(-1.16, -0.3, 1.7, 2.5, 0.25)); }
  },
  // a low ponytail tied at the side and draped over the near shoulder
  sidepony(k) {
    k.base({ a0: 0.04 * P });
    const W = (t: number) => lerp(0.22, 0.02, t) + 0.3 * sinp(t) ** 0.6;
    const pony = (pts: V2[]) => k.front.push(k.tube(pts, W), k.ell(pts[0][0], pts[0][1], 0.16, 0.14));
    if (k.F) pony([[-0.92, 0.3], [-1.04, 0.72], [-0.98, 1.2], [-0.8, 1.64]]);
    else if (k.S) pony([[-0.45, 0.45], [-0.4, 0.95], [-0.14, 1.4], [0.08, 1.75]]);
    else pony([[-0.72, 0.42], [-0.68, 0.95], [-0.46, 1.42], [-0.26, 1.75]]);
  },
  // one long braid over the near shoulder
  sidebraid(k) {
    k.base({ a0: 0.04 * P });
    const br = (pts: V2[]) => { const e = pts[pts.length - 1]; k.front.push(...k.beads(pts, 9, 0.12, 0.16, 0.5, 0.15), k.tuft(e[0], e[1] - 0.04, P / 2, 0.85)); };
    if (k.F) br([[-0.95, 0.4], [-1.05, 1.0], [-0.85, 1.7]]);
    else if (k.S) br([[-0.42, 0.5], [-0.2, 1.1], [0.1, 1.72]]);
    else br([[-0.68, 0.48], [-0.55, 1.1], [-0.3, 1.72]]);
  },
  // a short, close cloud
  minifro(k) {
    const s = k.s, p = k.pen(), H = (y: number) => k.Hs(y);
    if (k.F) p.cloud(0, -0.18, 1.3 * s, 1.14 * s, 0.12 * P, -1.12 * P, 13).curve([[-0.96, 0.16], [-0.92, -0.05], [-0.84, H(-0.3)], [0, H(-0.52)], [0.84, H(-0.3)], [0.92, -0.05], [0.96, 0.16]]);
    else if (k.S) p.cloud(-0.15, -0.2, 1.3 * s, 1.14 * s, -0.12 * P, -1.32 * P, 12).curve([[-0.6, 0.45], [-0.46, 0.05], [-0.22, -0.28], [0.35, H(-0.48)], [0.82, H(-0.52)]]);
    else p.cloud(-0.06, -0.2, 1.3 * s, 1.14 * s, 0.04 * P, -1.2 * P, 13).curve([[-0.86, 0.3], [-0.68, -0.12], [-0.4, H(-0.32)], [0.1, H(-0.5)], [0.62, H(-0.46)], [0.94, H(-0.24)]]);
    k.front.push(p.done());
  },
  // big permed curls flaring out to the shoulders
  perm(k) {
    const s = k.s, H = (y: number) => k.Hs(y), p = k.pen(), S = (pts: V2[]) => pts.map(([x, y]) => [x * s, y * s] as V2);
    if (k.F) p.to(1.55 * s, 0.95).bumps(S([[1.4, 0.25], [1.22, -0.55], [0.75, -1.22], [0, -1.38], [-0.75, -1.22], [-1.22, -0.55], [-1.4, 0.25], [-1.55, 0.95 / s]]), 18, 0.06).bumps([[-0.95, 0.95]], 3, 0.06)
      .curve([[-0.98, 0.45], [-0.95, 0.0], [-0.86, H(-0.28)]]).bumps([[-0.4, H(-0.42)], [0, H(-0.46)], [0.4, H(-0.42)], [0.86, H(-0.28)]], 6, 0.04).curve([[0.95, 0.0], [0.98, 0.45], [0.95, 0.95]]).bumps([[1.55 * s, 0.95]], 3, 0.06);
    else if (k.S) p.to(0.85, -0.9).bumps(S([[0.55, -1.3], [-0.2, -1.4], [-0.95, -1.15], [-1.4, -0.45], [-1.6, 0.35], [-1.65, 0.95 / s]]), 16, 0.06).bumps([[-0.5, 0.95]], 5, 0.06).curve([[-0.42, 0.45], [-0.3, 0.0], [-0.1, -0.3], [0.35, H(-0.48)], [0.75, H(-0.55)]]);
    else p.to(1.35 * s, 0.9).bumps(S([[1.25, 0.2], [1.08, -0.6], [0.6, -1.25], [-0.15, -1.4], [-0.9, -1.2], [-1.38, -0.5], [-1.58, 0.3], [-1.62, 0.95 / s]]), 18, 0.06).bumps([[-0.7, 0.95]], 4, 0.06)
      .curve([[-0.72, 0.45], [-0.68, 0.0], [-0.45, H(-0.3)]]).bumps([[0.1, H(-0.46)], [0.6, H(-0.44)], [0.92, H(-0.22)]], 5, 0.04).curve([[0.98, 0.3], [0.95, 0.9]]).bumps([[1.35 * s, 0.9]], 2, 0.06);
    k.front.push(p.done());
  },
  // the near (screen-left) side shaved, the rest swept over and hanging to the jaw on the far side
  sidecut(k) {
    const H = (y: number) => k.H(y);
    if (k.F) k.front.push(k.pen().crown(-0.72 * P, 0.1 * P).lines([[1.1, 0.72], [0.86, 0.66]]).curve([[0.84, 0.15], [0.78, H(-0.25)]]).curve([[0.3, H(-0.4)], [-0.2, k.Hs(-0.58)], [-0.55, -0.82]]).done());
    else if (k.S) k.front.push(k.pen().crown(-0.24 * P, -0.9 * P).curve([[-0.88, -0.5], [-0.35, -0.75], [0.3, k.Hs(-0.62)], [0.7, k.Hs(-0.66)]]).done());
    else k.front.push(k.pen().crown(-0.8 * P, 0.12 * P).lines([[1.06, 0.68], [0.92, 0.6]]).curve([[0.95, 0.1], [0.85, H(-0.25)]]).curve([[0.4, H(-0.42)], [-0.1, k.Hs(-0.6)], [-0.55, -0.78]]).done());
  },
  // neat short hair with one antenna strand curling up from the crown
  ahoge(k) {
    k.base({ yc: -0.46 });
    const x = k.F ? 0.04 : k.S ? -0.1 : 0;
    k.front.push(k.tube([[x, -1.02], [x + 0.06, -1.38], [x - 0.06, -1.62], [x - 0.24, -1.56]], (t) => lerp(0.15, 0.02, t)));
  },
  // pulled back into a bun at the back of the crown
  manbun(k) {
    k.base({ yc: -0.5 });
    if (k.F) k.back.push(k.ell(0, -1.12, 0.34, 0.27));
    else if (k.S) k.front.push(k.ell(-0.92, -0.82, 0.3, 0.26, 0.5));
    else k.front.push(k.ell(-0.86, -0.88, 0.3, 0.26, 0.5));
  },
  // bald with three hairs on top
  baldtuft(k) {
    const x = k.F ? 0 : k.S ? -0.1 : -0.05, W = (t: number) => lerp(0.07, 0.02, t);
    k.front.push(k.tube([[x, -0.98], [x + 0.02, -1.2], [x - 0.02, -1.4]], W), k.tube([[x - 0.06, -0.97], [x - 0.14, -1.18], [x - 0.27, -1.3]], W), k.tube([[x + 0.06, -0.97], [x + 0.14, -1.16], [x + 0.25, -1.26]], W));
  },
  // an M-shaped receding hairline, short
  receding(k) {
    const H = (y: number) => k.Hs(y);
    if (k.F) k.base({ a0: -0.03 * P, hl: [[-0.96, -0.32], [-0.66, -0.84], [-0.36, -0.8], [-0.12, H(-0.56)], [0, H(-0.5)], [0.12, H(-0.56)], [0.36, -0.8], [0.66, -0.84], [0.96, -0.32]] });
    else if (k.S) k.base({ fr: -0.33 * P, hl: [[-0.66, 0.34], [-0.48, -0.02], [-0.24, -0.3], [0.05, -0.58], [0.3, -0.86]] });
    else k.base({ fr: -0.3 * P, hl: [[-0.86, 0.14], [-0.66, -0.14], [-0.42, -0.4], [-0.15, -0.78], [0.2, H(-0.56)], [0.38, H(-0.5)], [0.5, -0.86]] });
  },
  // bald with one little curl on top
  babycurl(k) {
    const x = k.F ? 0 : k.S ? -0.1 : -0.04;
    k.front.push(k.tube([[x, -0.97], [x - 0.06, -1.12], ...spiral(x + 0.09, -1.2, 0.16, 1.1, P, 1, 0.7)], (t) => lerp(0.11, 0.04, t)));
  },
  // a lion's mane of flame spikes all round the face
  mane(k) {
    const rnd = rng("mane:" + k.h.view), H = (y: number) => k.Hs(y), p = k.pen(), out = () => 1.36 + 0.12 * rnd(), lean = () => (rnd() - 0.5) * 0.04 * P;
    if (k.F) p.spikes(0.4 * P, -1.4 * P, 16, 1.16, out, lean).lines([[-0.55, 0.98]]).curve([[-0.98, 0.35], [-0.92, H(-0.22)], [-0.45, H(-0.46)], [0, H(-0.5)], [0.45, H(-0.46)], [0.92, H(-0.22)], [0.98, 0.35], [0.55, 0.98]]);
    else if (k.S) p.spikes(-0.2 * P, -1.32 * P, 12, 1.14, out, lean).lines([[-0.4, 1.1]]).curve([[-0.25, 0.5], [-0.15, 0.0], [0.0, -0.32], [0.4, H(-0.5)], [0.78, H(-0.58)]]);
    else p.spikes(0.3 * P, -1.38 * P, 15, 1.14, out, lean).lines([[-0.6, 1.05]]).curve([[-0.75, 0.4], [-0.6, -0.1], [-0.4, H(-0.34)], [0.15, H(-0.5)], [0.62, H(-0.46)], [0.95, H(-0.2)], [1.02, 0.35], [0.7, 0.95]]);
    k.front.push(p.done());
  },
  // braided rows from the hairline straight back over the scalp
  cornrows(k) {
    const R = k.R * 0.94, rows = k.F ? [-0.8, -0.48, -0.16, 0.16, 0.48, 0.8] : [-0.78, -0.47, -0.16, 0.16, 0.47];
    for (const u of rows) {
      const rho = Math.sqrt(1 - u * u), pts: V2[] = [], b0 = (k.F ? 0.48 : 0.62) + 0.25 * Math.abs(u), b1 = k.S && u < -0.6 ? 2.4 : 3.5;
      for (let i = 0; i <= 24; i++) { const b = lerp(b0, b1, i / 24), [x, y, d] = k.prj(u, -rho * Math.sin(b), rho * Math.cos(b)); if (d > -0.06) pts.push([x * R, y * R]); }
      if (pts.length < 3) continue;
      const len = along(pts).len;
      k.front.push(...k.beads(pts, Math.max(2, Math.round(len / 0.14)), 0.1, 0.11, 0.45));
    }
  },
  // small twisted knots all over the head
  bantu(k) {
    const knots: V2[] = [[0, 1.42], [-0.8, 0.95], [0.8, 0.95], [-1.65, 0.75], [1.65, 0.75], [0, 0.7], [-2.4, 0.95], [2.4, 0.95], [P, 0.72], [-1.2, 0.35], [1.2, 0.35]];
    const list = knots.map(([lon, lat]) => k.sph(lon, lat, k.R * 0.98)).filter((q) => q[2] > -0.8).sort((a, b) => a[2] - b[2]);
    for (const [x, y, d] of list) {
      const l = Math.hypot(x, y) || 1, ux = x / l, uy = y / l, L = d < -0.05 ? k.back : k.front;
      L.push(k.ell(x, y, 0.2, 0.19), k.poly([[x - uy * 0.16, y + ux * 0.16], [x + ux * 0.36, y + uy * 0.36], [x + uy * 0.16, y - ux * 0.16]]));
    }
  },
  // shaved sides, a cloud crest down the middle
  frohawk(k) {
    const s = k.s, p = k.pen();
    if (k.F) { k.front.push(k.cloud(0, -1.2 * s, 0.36 * s, 0.68 * s, 11, 0.09)); k.front.push(k.poly([[-0.22, k.Hs(-0.6)], [-0.28, -0.95], [0.28, -0.95], [0.22, k.Hs(-0.6)]])); return; }
    if (k.S) p.cloud(0, 0, 1.46 * s, 1.46 * s, -0.28 * P, -1.02 * P, 9, 0.08).crown(-1.02 * P, -0.28 * P, 0.74);
    else p.cloud(0, 0.02, 1.44 * s, 1.44 * s, -0.34 * P, -1.02 * P, 8, 0.08).curve([[-0.8, -0.5], [-0.38, -0.7], [0.1, -0.7], [0.36, k.Hs(-0.56)]]);
    k.front.push(p.done());
  },
  // a monk's ring: bald crown, a band of hair round the head at forehead height
  tonsure(k) {
    const H = (y: number) => k.Hs(y), yt = -0.74;
    /* the top edge runs right to left (or front to back), so its bumps bulge up */
    if (k.F) k.front.push(k.pen().crown(0.02 * P, -0.17 * P).bumps([[0.6, yt + 0.02], [0, yt - 0.04], [-0.6, yt + 0.02], k.se(-0.83 * P)], 9, 0.05).crown(-0.83 * P, -1.02 * P).curve([[-0.95, -0.15], [-0.82, H(-0.3)], [0, H(-0.36)], [0.82, H(-0.3)], [0.95, -0.15], k.se(0.02 * P)]).done());
    else if (k.S) k.front.push(k.pen().to(...k.se(-0.17 * P)).bumps([[0.3, yt], [-0.5, yt + 0.02], k.se(-0.86 * P)], 9, 0.05).crown(-0.86 * P, 0.8 * P - 2 * P).curve([[-0.66, 0.34], [-0.48, -0.02], [-0.24, -0.3], [0.3, -0.44], [0.82, H(-0.3)]]).done());
    else k.front.push(k.pen().to(...k.se(-0.14 * P)).bumps([[0.5, yt], [-0.3, yt - 0.02], k.se(-0.86 * P)], 9, 0.05).crown(-0.86 * P, 0.86 * P - 2 * P).curve([[-0.86, 0.14], [-0.66, -0.14], [-0.4, H(-0.3)], [0.15, H(-0.38)], [0.62, H(-0.36)], [0.92, H(-0.22)]]).done());
  },
  // slicked back into one big cloud puff on top
  afropuff(k) {
    const H = (y: number) => k.Hs(y);
    k.base({ a0: -0.04 * P, hl: k.F ? [[-0.92, H(-0.3)], [-0.5, H(-0.58)], [-0.14, H(-0.62)], [0, H(-0.5)], [0.14, H(-0.62)], [0.5, H(-0.58)], [0.92, H(-0.3)]] : undefined });
    const s = k.s, x = k.F ? 0 : k.S ? -0.16 : -0.08;
    k.front.push(k.cloud(x, -1.32 * s, 0.64 * s, 0.54 * s, 13, 0.09));
  },
  // a short bristly crew cut: brushed-up texture on top, a straight short front
  crew(k) {
    const H = (y: number) => k.Hs(y), p = k.pen(), b = (i: number) => (i % 2 ? 1.07 : 1.1);
    if (k.F) p.crown(-0.06 * P, -0.2 * P, 1.0).spikes(-0.2 * P, -0.8 * P, 9, 1.01, b).crown(-0.8 * P, -0.94 * P, 1.0).curve([[-0.92, H(-0.3)], [-0.7, H(-0.5)], [0, H(-0.56)], [0.7, H(-0.5)], [0.92, H(-0.3)], k.se(-0.06 * P)]);
    else if (k.S) p.crown(-0.24 * P, -0.3 * P, 1.0).spikes(-0.3 * P, -0.86 * P, 8, 1.01, b, () => -0.01 * P).crown(-0.86 * P, 0.8 * P - 2 * P, 1.0).curve([...k.softS(), k.se(-0.24 * P)]);
    else p.crown(-0.12 * P, -0.3 * P, 1.0).spikes(-0.3 * P, -0.86 * P, 8, 1.01, b, () => -0.01 * P).crown(-0.86 * P, 0.86 * P - 2 * P, 1.0).curve([...k.softT(), k.se(-0.12 * P)]);
    k.front.push(p.done());
  },
  // long straight hair down the back with the top section tied into a small bun
  halfup(k) {
    k.base({ part: true, a0: 0.1 * P, hl: k.F ? [[-0.95, 0.3], ...k.softF(-0.46, true), [0.95, 0.3]] : undefined, nape: k.S ? 0.74 * P : undefined });
    if (k.F) k.back.push(k.ell(0, -1.12, 0.3, 0.24), k.rrect(-1.13, -0.4, 2.26, 2.0, 0.4));
    else if (k.S) { k.front.push(k.ell(-0.86, -0.86, 0.26, 0.22, 0.5)); k.back.push(k.rrect(-1.13, -0.3, 0.9, 1.9, 0.35)); }
    else { k.front.push(k.ell(-0.8, -0.92, 0.26, 0.22, 0.5)); k.back.push(k.rrect(-1.14, -0.4, 1.5, 2.0, 0.4)); }
  },
  // hair rising in curling flame tongues
  flame(k) {
    k.base({ a0: -0.06 * P, yc: -0.5 });
    const s = k.s, W = (t: number) => 0.4 * (1 - t) ** 0.85 + 0.01;
    const tongue = (x0: number, y0: number, h: number, lean: number) => k.front.push(k.tube([[x0, y0], [x0 + lean * 0.5, y0 - h * 0.45], [x0 + lean * 1.3, y0 - h * 0.8], [x0 + lean * 0.7, y0 - h]], W));
    if (k.F) { tongue(-0.62, -0.72, 0.62 * s, -0.12); tongue(0.62, -0.72, 0.62 * s, 0.12); tongue(-0.3, -0.92, 0.78 * s, -0.08); tongue(0.3, -0.92, 0.78 * s, 0.08); tongue(0, -1.0, 0.92 * s, 0.05); }
    else if (k.S) { tongue(0.62, -0.7, 0.66 * s, -0.12); tongue(0.25, -0.95, 0.85 * s, -0.12); tongue(-0.2, -0.98, 0.8 * s, -0.16); tongue(-0.6, -0.8, 0.62 * s, -0.18); }
    else { tongue(0.66, -0.66, 0.62 * s, 0.06); tongue(0.3, -0.92, 0.82 * s, 0.02); tongue(-0.12, -1.0, 0.88 * s, -0.08); tongue(-0.55, -0.85, 0.66 * s, -0.14); }
  },
};
