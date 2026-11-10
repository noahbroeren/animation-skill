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
  };
  ink: { enabled: boolean; strength: number; widthNear: number; widthFar: number; distNear: number; distFar: number; color: string; creases: number };
  dof: { enabled: boolean; maxBlur: number; aperture: number }; // maxBlur in u (px radius @1080)
  bloom: { enabled: boolean; threshold: number; strength: number; radius: number };
  vignette: { amount: number; softness: number };
  grain: { amount: number; size: number }; // amount ~ sigma in 8-bit units / 255
  chroma: number; // chromatic aberration at the corners, in u
  softness: number; // lens softness mix 0..1
  halation: number; // red glow around bright edges (film)
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
    vignette: { amount: 0.3, softness: 0.55 }, grain: { amount: 0.022, size: 1.2 }, chroma: 0.8, softness: 0.15, halation: 0.12,
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
