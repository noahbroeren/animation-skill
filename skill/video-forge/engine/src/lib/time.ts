/**
 * Timing math. Everything is a pure function of the frame number: frames render in
 * any order on any worker and are identical across runs (no Math.random, no Date).
 */
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => (b === a ? 0 : (x - a) / (b - a));
export const remap = (x: number, a: number, b: number, c: number, d: number, clampIt = true) => {
  const t = invLerp(a, b, x);
  return lerp(c, d, clampIt ? clamp(t) : t);
};

// ---- easing (u in 0..1)
export const ease = {
  linear: (u: number) => u,
  smooth: (u: number) => u * u * (3 - 2 * u),
  /** C2-continuous: zero velocity AND acceleration at both ends -> no jerk spikes. Default camera glide. */
  smoother: (u: number) => u * u * u * (u * (6 * u - 15) + 10),
  inOutCubic: (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  inOutSine: (u: number) => -(Math.cos(Math.PI * u) - 1) / 2,
  outCubic: (u: number) => 1 - Math.pow(1 - u, 3),
  outExpo: (u: number) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u)),
  inCubic: (u: number) => u * u * u,
  outBack: (u: number) => 1 + 2.70158 * Math.pow(u - 1, 3) + 1.70158 * Math.pow(u - 1, 2),
};
export type EaseName = keyof typeof ease;

/** CSS-style cubic-bezier easing. */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dsx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x, d = dsx(t);
      if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    return sy(clamp(t));
  };
}

/** Eased value between frames [f0, f1]. */
export const tween = (f: number, f0: number, f1: number, a: number, b: number, e: (u: number) => number = ease.smoother) =>
  lerp(a, b, e(clamp(invLerp(f0, f1, f))));

/** Closed-form damped spring step response (0 -> 1). zeta < 1 overshoots. */
export function springAt(tSec: number, freq = 2.2, zeta = 0.55) {
  if (tSec <= 0) return 0;
  const w = 2 * Math.PI * freq;
  if (zeta >= 1) return 1 - (1 + w * tSec) * Math.exp(-w * tSec);
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * tSec) * (Math.cos(wd * tSec) + ((zeta * w) / wd) * Math.sin(wd * tSec));
}

/** Decaying oscillation impulse (impact kicks, wobble). */
export const ring = (tSec: number, k = 6, w = 18) => (tSec < 0 ? 0 : Math.exp(-k * tSec) * Math.sin(w * tSec));

/**
 * Monotone cubic (Fritsch-Carlson) interpolation through keys [[x, y], ...].
 * Continuous speed through keys, never overshoots: key poses without the robotic
 * stop-at-every-key look of segment-wise easing.
 */
export function monotone(keys: [number, number][]) {
  const n = keys.length;
  const xs = keys.map((k) => k[0]), ys = keys.map((k) => k[1]);
  const d: number[] = [];
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1e-9));
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i];
      const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
      m[i] = (w0 + w1) / (w0 / d[i - 1] + w1 / d[i]);
    }
  }
  return (x: number) => {
    if (n === 1 || x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// ---- deterministic randomness
export function hash32(s: string | number) {
  let h = 2166136261 >>> 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** mulberry32 PRNG seeded by any key. */
export function rng(seed: string | number) {
  let a = hash32(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Smooth 1D value noise in [-1, 1]. */
export function noise1(x: number, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const h = (k: number) => (hash32(k * 374761393 + seed * 668265263) / 4294967295) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u);
}
/** Fractal noise (handheld camera, idle sway). */
export function fbm1(x: number, seed = 0, oct = 3) {
  let s = 0, a = 0.5, fq = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    s += a * noise1(x * fq, seed + o * 17);
    norm += a;
    a *= 0.5;
    fq *= 2.03;
  }
  return s / norm;
}

/** Delayed follow-through: a child channel lags its parent by delayF frames. */
export const follow = (fn: (f: number) => number, f: number, delayF: number, gain = 0.45) => gain * (fn(f - delayF) - fn(f));
