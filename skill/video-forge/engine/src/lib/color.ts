/**
 * OKLab toolkit (1.6): perceptual colour maths for palettes, look cross-fades, gradients and checks.
 * Why: mixing in sRGB goes muddy and dark through the middle (blue -> yellow passes grey-green); OKLab keeps lightness
 * and hue steps even, and its distance (deltaEOK, JND about 0.02) is what "these two colours separate" means.
 * Formulas: Bjorn Ottosson, "A perceptual color space for image processing" (2020). See references/research/colour.md.
 */
export type RGB = [number, number, number];                    // sRGB 0..1, gamma-encoded
export const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export function oklab([r, g, b]: RGB): RGB {
  r = toLinear(r); g = toLinear(g); b = toLinear(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function linearFromOklab([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
        s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
export const oklch = (c: RGB): RGB => { const [L, a, b] = oklab(c); return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360]; };
/** constant-L, constant-h chroma reduction (CSS Color 4 style binary search) */
export function fromOklch(L: number, C: number, h: number): RGB {
  const at = (c: number) => linearFromOklab([L, c * Math.cos(h * Math.PI / 180), c * Math.sin(h * Math.PI / 180)]);
  const ok = (v: RGB) => v.every((x) => x >= -1e-4 && x <= 1 + 1e-4);
  if (L >= 1) return [1, 1, 1]; if (L <= 0) return [0, 0, 0];
  let lo = 0, hi = C, v = at(C);
  if (!ok(v)) { while (hi - lo > 1e-4) { const mid = (lo + hi) / 2; ok(at(mid)) ? (lo = mid) : (hi = mid); } v = at(lo); }
  return v.map((x) => toSrgb(Math.min(1, Math.max(0, x)))) as RGB;
}
export const mixOklab = (a: RGB, b: RGB, t: number): RGB => { const A = oklab(a), B = oklab(b);
  const [L, C, h] = (([l, x, y]) => [l, Math.hypot(x, y), (Math.atan2(y, x) * 180 / Math.PI + 360) % 360])(A.map((v, i) => v + (B[i] - v) * t) as RGB);
  return fromOklch(L, C, h); };
export const deltaEOK = (a: RGB, b: RGB) => Math.hypot(...oklab(a).map((v, i) => v - oklab(b)[i]));   // JND about 0.02
/** hue-shifted ramp: steps < 0 are shadows, > 0 lights */
export function rampStep(base: RGB, i: number, o = { dL: 0.11, shadowHue: 285, lightHue: 95, shadowDeg: 12, lightDeg: 8 }): RGB {
  const [L, C, h] = oklch(base); const target = i < 0 ? o.shadowHue : o.lightHue;
  const d = ((target - h + 540) % 360) - 180, step = (i < 0 ? o.shadowDeg : o.lightDeg) * Math.abs(i);
  const hh = h + Math.sign(d) * Math.min(Math.abs(d), step);
  const cc = i < 0 ? C * (i === -1 ? 1.1 : 1.05) : C * (1 - 0.18 * i);
  return fromOklch(Math.min(0.97, Math.max(0.05, L + o.dL * i)), cc, (hh + 360) % 360);
}

export const rgbOf = (hex: string): RGB => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
export const hexOf = (c: RGB) => "#" + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
/** WCAG 2 relative luminance and contrast ratio (captions: aim >= 4.5, or always stroke the text). */
export const luminance = (c: RGB) => 0.2126 * toLinear(c[0]) + 0.7152 * toLinear(c[1]) + 0.0722 * toLinear(c[2]);
export const contrastRatio = (a: RGB, b: RGB) => { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
/** n-stop gradient in OKLab (sky domes, fog ramps, UI): t in 0..1 across the stops. */
export function gradientOklab(stops: string[], t: number): string {
  const x = Math.min(0.99999, Math.max(0, t)) * (stops.length - 1), i = Math.floor(x);
  return hexOf(mixOklab(rgbOf(stops[i]), rgbOf(stops[i + 1]), x - i));
}
/** Hue-shifted shade and light of a base colour (cartoon rule: shadows toward violet-blue and a little MORE saturated,
 *  lights toward yellow and less saturated). */
export const shadeOf = (hex: string, steps = 1) => hexOf(rampStep(rgbOf(hex), -steps));
export const lightOf = (hex: string, steps = 1) => hexOf(rampStep(rgbOf(hex), steps));
