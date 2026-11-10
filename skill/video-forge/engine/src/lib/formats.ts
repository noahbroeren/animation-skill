/**
 * Delivery formats. Every final export is >= 2K class. Rendering is NATIVE at the
 * target resolution (WebGL + DOM vector text): nothing is upscaled unless a format
 * explicitly says so. Preview formats are labelled and never delivered.
 */
export type FormatId = "short" | "long" | "short4k" | "long4k" | "square" | "preview-short" | "preview-long";

export type Format = { id: FormatId; width: number; height: number; label: string; final: boolean };

export const FORMATS: Record<FormatId, Format> = {
  short: { id: "short", width: 1440, height: 2560, label: "Shorts/TikTok/Reels 9:16 2K (1440x2560)", final: true },
  long: { id: "long", width: 2560, height: 1440, label: "YouTube 16:9 2K/QHD (2560x1440)", final: true },
  short4k: { id: "short4k", width: 2160, height: 3840, label: "Vertical 4K (2160x3840)", final: true },
  long4k: { id: "long4k", width: 3840, height: 2160, label: "UHD 4K (3840x2160)", final: true },
  square: { id: "square", width: 2160, height: 2160, label: "Square 2160", final: true },
  "preview-short": { id: "preview-short", width: 720, height: 1280, label: "PREVIEW ONLY 720x1280", final: false },
  "preview-long": { id: "preview-long", width: 1280, height: 720, label: "PREVIEW ONLY 1280x720", final: false },
};

export const isVertical = (w: number, h: number) => h > w;

/** Resolution-independent pixel unit: 1 u = 1 px at a 1080 px short side. Use for ALL sizes. */
export const unit = (w: number, h: number) => Math.min(w, h) / 1080;

/** Platform UI safe zones (fractions of height/width). Vertical: right column = like/comment buttons. */
export const SAFE = {
  vertical: { top: 0.09, bottom: 0.2, left: 0.06, right: 0.14 },
  horizontal: { top: 0.06, bottom: 0.08, left: 0.05, right: 0.05 },
};
