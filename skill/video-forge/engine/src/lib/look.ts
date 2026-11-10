/**
 * A Look = every finishing parameter of the image. Lengths are in "u" (1 u = 1 px at a
 * 1080 px short side) so a look renders identically at preview, 2K and 4K.
 *
 * Analyzer bridge: `vfa analyze` writes look_suggestion.json. lookFromSuggestion()
 * turns it into a Look so a production starts from the MEASURED reference grade.
 */
export type Tonemap = "aces" | "neutral" | "agxish" | "none";

export type Look = {
  name: string;
  exposure: number; // linear multiplier before tonemap
  tonemap: Tonemap;
  grade: {
    blackPoint: number; // output floor (0..0.2). >0 = no pure black (premium cartoon/film look)
    whitePoint: number; // output ceiling
    contrast: number; // 1 = neutral S-curve strength around pivot
    pivot: number;
    saturation: number; // 1 = unchanged
    vibrance: number; // boosts low-saturation colours more
    shadowTint: [number, number, number]; // additive RGB offset weighted to shadows (display space)
    highlightTint: [number, number, number];
    gamma: number;
    /** optional fitted 7-knot tone curve at x = 0,.1,.25,.5,.75,.9,1 (replaces the contrast/pivot S-curve) */
    knots?: number[];
    zoneSat?: [number, number, number]; // shadow / mid / highlight saturation (used with knots)
    tintS?: [number, number]; tintM?: [number, number]; tintH?: [number, number]; // luma-neutral [Cb, Cr] offsets
  };
  ink: { enabled: boolean; strength: number; widthNear: number; widthFar: number; distNear: number; distFar: number; color: string; creases: number };
  /** maxBlur = blur-disc radius (u) for objects at infinity (cInf); maxCoC caps it (default 2x); nearScale boosts foreground */
  dof: { enabled: boolean; maxBlur: number; aperture: number; maxCoC?: number; nearScale?: number };
  bloom: { enabled: boolean; threshold: number; strength: number; radius: number };
  vignette: { amount: number; softness: number };
  grain: { amount: number; size: number }; // amount ~ sigma in 8-bit units / 255
  chroma: number; // chromatic aberration at the corners, in u
  softness: number; // lens softness mix 0..1
  halation: number; // red glow around bright edges (film)
  motionBlur: number; // shutter fraction 0..1 (0.5 = 180 deg). Needs Stage3D camAt. Measured: whips always blurred
};

const base: Look = {
  name: "neutral",
  exposure: 1,
  tonemap: "neutral",
  grade: { blackPoint: 0, whitePoint: 1, contrast: 1, pivot: 0.45, saturation: 1, vibrance: 0, shadowTint: [0, 0, 0], highlightTint: [0, 0, 0], gamma: 1 },
  ink: { enabled: false, strength: 1, widthNear: 3.2, widthFar: 1.6, distNear: 6, distFar: 90, color: "#0b0710", creases: 0.8 },
  dof: { enabled: false, maxBlur: 10, aperture: 1 },
  bloom: { enabled: false, threshold: 0.85, strength: 0.25, radius: 1 },
  vignette: { amount: 0, softness: 0.6 },
  grain: { amount: 0, size: 1 },
  chroma: 0,
  softness: 0,
  halation: 0,
  motionBlur: 0,
};

export const deepMerge = <T,>(a: T, b: any): T => {
  if (b === undefined || b === null) return a;
  if (Array.isArray(a) || typeof a !== "object" || a === null) return b as T;
  const out: any = { ...a };
  for (const k of Object.keys(b)) out[k] = deepMerge((a as any)[k], b[k]);
  return out;
};

export const LOOKS: Record<string, Look> = {
  neutral: base,
  /** Measured-style: 2D cards in an inked 3D world (saturated, warm key, cool-violet shadows, no pure black, DOF). */
  "cartoon-ink": deepMerge(base, {
    name: "cartoon-ink", tonemap: "neutral", exposure: 1.05,
    grade: { blackPoint: 0.035, whitePoint: 0.985, contrast: 1.16, saturation: 1.2, vibrance: 0.2,
      shadowTint: [0.012, -0.006, 0.05], highlightTint: [0.03, 0.012, -0.02] },
    ink: { enabled: true, strength: 1, widthNear: 3.4, widthFar: 1.8 },
    dof: { enabled: true, maxBlur: 9, aperture: 1 },
    bloom: { enabled: true, threshold: 0.9, strength: 0.18, radius: 1 },
    vignette: { amount: 0.18, softness: 0.65 }, grain: { amount: 0.012, size: 1 },
  }),
  /** Filmic live-action/CG: soft roll-off, teal shadows, warm highlights, grain, halation, gentle vignette. */
  "cinematic-film": deepMerge(base, {
    name: "cinematic-film", tonemap: "aces", exposure: 1.0,
    grade: { blackPoint: 0.02, whitePoint: 0.97, contrast: 1.12, saturation: 0.95, vibrance: 0.1,
      shadowTint: [-0.012, 0.01, 0.03], highlightTint: [0.035, 0.015, -0.025] },
    dof: { enabled: true, maxBlur: 12, aperture: 1 },
    bloom: { enabled: true, threshold: 0.8, strength: 0.22, radius: 1.3 },
    vignette: { amount: 0.3, softness: 0.55 }, grain: { amount: 0.022, size: 1.2 }, chroma: 0.8, softness: 0.15, halation: 0.12, motionBlur: 0.5,
  }),
  /** Crisp explainer / motion graphics: clean, no grain, slight lift. */
  "clean-explainer": deepMerge(base, {
    name: "clean-explainer", tonemap: "none",
    grade: { blackPoint: 0.015, contrast: 1.05, saturation: 1.08 },
    vignette: { amount: 0.08, softness: 0.7 },
  }),
  /** Natural documentary: honest colour, mild filmic roll-off, fine grain. */
  documentary: deepMerge(base, {
    name: "documentary", tonemap: "aces",
    grade: { blackPoint: 0.012, contrast: 1.06, saturation: 1.0, shadowTint: [0, 0.004, 0.012], highlightTint: [0.01, 0.006, -0.006] },
    bloom: { enabled: true, threshold: 0.88, strength: 0.12, radius: 1 },
    dof: { enabled: true, maxBlur: 8, aperture: 1 },
    vignette: { amount: 0.18, softness: 0.6 }, grain: { amount: 0.014, size: 1 },
  }),
  /** Night / neon: deep blue-violet shadows, strong bloom. */
  "neon-night": deepMerge(base, {
    name: "neon-night", tonemap: "aces", exposure: 1.1,
    grade: { blackPoint: 0.02, contrast: 1.2, saturation: 1.25, shadowTint: [0.01, -0.01, 0.06], highlightTint: [0.04, -0.01, 0.03] },
    bloom: { enabled: true, threshold: 0.6, strength: 0.55, radius: 1.6 },
    dof: { enabled: true, maxBlur: 12, aperture: 1.2 },
    vignette: { amount: 0.35, softness: 0.5 }, grain: { amount: 0.02, size: 1.2 }, chroma: 1.2, halation: 0.2,
  }),
  noir: deepMerge(base, {
    name: "noir", tonemap: "aces",
    grade: { blackPoint: 0.01, contrast: 1.35, saturation: 0.0 },
    vignette: { amount: 0.45, softness: 0.45 }, grain: { amount: 0.035, size: 1.3 }, bloom: { enabled: true, threshold: 0.8, strength: 0.2, radius: 1 },
  }),
};

/**
 * "toonworld" = 2D characters in an inked 3D world, one preset per LIGHTING SETUP (measured per setup on the
 * reference channel, see references/styles/toonworld-explainer.md). Lighting/grade follows the story beat:
 * day (set-up) -> golden (stakes) -> night-blue (the "You see," explanation) -> back to day/golden (payoff).
 * Measured: whites reach 0.97-1.0 (no tonemap roll-off), lifted & coloured blacks, NO grain, near-constant
 * ~3 px ink at 1080, bloom ONLY on emissive sources (threshold 1.0, scene albedo stays < 1), DOF only on
 * chosen close-up/insert beats (enable per shot with lookAt-frame functions / lerpLook).
 */
const toonBase = deepMerge(base, {
  tonemap: "none", exposure: 1.0,
  ink: { enabled: true, strength: 1, widthNear: 3.0, widthFar: 2.6, distNear: 6, distFar: 90, color: "#140c10", creases: 0.75 },
  dof: { enabled: false, maxBlur: 12, aperture: 1 },
  bloom: { enabled: true, threshold: 1.0, strength: 0.5, radius: 1.2 },
  grain: { amount: 0, size: 1 },
  motionBlur: 0.5,
});
LOOKS["toonworld-day"] = deepMerge(toonBase, {
  name: "toonworld-day",
  grade: { blackPoint: 0.06, whitePoint: 0.97, contrast: 1.22, pivot: 0.5, saturation: 1.22, vibrance: 0.15,
    shadowTint: [0.05, -0.008, 0.0], highlightTint: [-0.006, 0.004, 0.022] }, // lifted magenta-violet blacks; whites ~0.95-0.97, cool-neutral highs
  vignette: { amount: 0.12, softness: 0.5 },
});
LOOKS["toonworld-golden"] = deepMerge(toonBase, {
  name: "toonworld-golden",
  grade: { blackPoint: 0.06, whitePoint: 0.97, contrast: 1.2, pivot: 0.5, saturation: 1.25, vibrance: 0.2,
    shadowTint: [0.0, -0.012, 0.1], highlightTint: [0.035, 0.0, -0.01] }, // violet replacement shadows, pink (not yellow) highs
  vignette: { amount: 0.2, softness: 0.45 },
});
LOOKS["toonworld-night"] = deepMerge(toonBase, {
  name: "toonworld-night",
  grade: { blackPoint: 0.03, whitePoint: 0.96, contrast: 1.15, pivot: 0.45, saturation: 1.35, vibrance: 0.25,
    shadowTint: [-0.01, 0.0, 0.11], highlightTint: [0.02, 0.0, 0.01] }, // blue-violet ambient (~9,10,38 blacks)
  vignette: { amount: 0.42, softness: 0.45 },
  bloom: { threshold: 0.95, strength: 0.6, radius: 1.4 },
});
LOOKS["toonworld-interior"] = deepMerge(toonBase, {
  name: "toonworld-interior",
  grade: { blackPoint: 0.05, whitePoint: 0.99, contrast: 1.1, pivot: 0.5, saturation: 1.2, vibrance: 0.15,
    shadowTint: [0.04, -0.005, 0.02], highlightTint: [0.02, 0.01, -0.03] },
  vignette: { amount: 0.3, softness: 0.45 },
});

/** Interpolate two looks (numbers lerp, booleans/strings switch at t = 0.5). Use for lighting-setup changes. */
export function lerpLook(a: Look, b: Look, t: number): Look {
  const mix = (x: any, y: any): any => {
    if (typeof x === "number" && typeof y === "number") return x + (y - x) * t;
    if (Array.isArray(x) && Array.isArray(y)) return x.map((v, i) => mix(v, y[i]));
    if (x && y && typeof x === "object") { const o: any = {}; for (const k of Object.keys(x)) o[k] = mix(x[k], y[k]); return o; }
    return t < 0.5 ? x : y;
  };
  return mix(a, b);
}

/** Look timeline: [[frame, look], ...] -> function(frame) with eased cross-fades of `fade` frames between setups. */
export function lookTimeline(keys: [number, Look | string][], fade = 18) {
  const ks = keys.map(([f, l]) => [f, typeof l === "string" ? LOOKS[l] ?? base : l] as [number, Look]).sort((a, b) => a[0] - b[0]);
  return (frame: number): Look => {
    let i = 0;
    while (i < ks.length - 1 && ks[i + 1][0] <= frame) i++;
    const next = ks[i + 1];
    if (next && frame > next[0] - fade) {
      const u = Math.min(1, Math.max(0, (frame - (next[0] - fade)) / fade));
      return lerpLook(ks[i][1], next[1], u * u * (3 - 2 * u));
    }
    return ks[i][1];
  };
}

export type LookSuggestion = {
  grade: { blackPoint: number; whitePoint: number; contrast: number; saturation: number; shadowTint: number[]; highlightTint: number[] };
  ink: { strength: number };
  dof: { enabled: boolean };
  grain: { sigma_8bit: number };
};

/** Start from a preset and overwrite it with the reference's measured grade (vfa look_suggestion.json). */
export function lookFromSuggestion(s: LookSuggestion, preset = "neutral"): Look {
  const p = LOOKS[preset] ?? base;
  return deepMerge(p, {
    name: `${p.name}+measured`,
    grade: {
      blackPoint: s.grade.blackPoint, whitePoint: s.grade.whitePoint,
      contrast: Math.max(0.6, Math.min(1.8, s.grade.contrast)), saturation: Math.max(0, Math.min(2, s.grade.saturation)),
      shadowTint: s.grade.shadowTint as [number, number, number], highlightTint: s.grade.highlightTint as [number, number, number],
    },
    ink: { enabled: s.ink.strength > 0.15, strength: Math.min(1, s.ink.strength) },
    dof: { enabled: s.dof.enabled },
    grain: { amount: Math.max(0, (s.grain.sigma_8bit - 0.8) / 255) },
  });
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends any[] ? T[K] : DeepPartial<T[K]>) : T[K] };
export const resolveLook = (l: string | Look | undefined, overrides?: DeepPartial<Look>): Look =>
  deepMerge(typeof l === "string" ? LOOKS[l] ?? base : l ?? base, overrides);
