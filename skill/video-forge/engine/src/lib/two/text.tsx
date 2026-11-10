/**
 * Typography & motion-graphics primitives (DOM/SVG => razor-sharp at any resolution).
 * Sizes are in u (1 u = 1 px at a 1080 px short side).
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { isVertical, SAFE, unit } from "../formats";
import { clamp, ease, springAt, tween } from "../time";

export const FONTS = {
  display: "'Bahnschrift', 'Arial Black', 'Helvetica Neue', Arial, sans-serif",
  heavy: "'Arial Black', 'Segoe UI Black', 'Helvetica Neue', Arial, sans-serif",
  body: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Cascadia Code', Consolas, Menlo, monospace",
};

export const useU = () => {
  const { width, height } = useVideoConfig();
  return { u: unit(width, height), width, height, vertical: isVertical(width, height) };
};

export type Word = { word: string; start: number; end: number };

/** Group words into caption pages. Shorts: <= maxWords per page; long-form: <= maxChars per line. */
export function pages(words: Word[], maxWords = 3, maxChars = 42, gap = 0.45) {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const text = [...cur, w].map((x) => x.word).join(" ");
    const pause = cur.length ? w.start - cur[cur.length - 1].end : 0;
    const endsSentence = cur.length && /[.!?]$/.test(cur[cur.length - 1].word);
    if (cur.length && (cur.length >= maxWords || text.length > maxChars || pause > gap || endsSentence)) { out.push(cur); cur = []; }
    cur.push(w);
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Captions synced to word timings.
 *  style "pop": shorts/reels -- big heavy uppercase, active word highlighted + spring pop
 *  style "subtitle": long-form -- clean sentence chunks at the bottom
 */
export const Captions: React.FC<{ words: Word[]; style?: "pop" | "subtitle"; highlight?: string; color?: string; offsetSec?: number; y?: number; size?: number; maxWords?: number }> = ({
  words, style = "pop", highlight = "#ffd23f", color = "#ffffff", offsetSec = 0, y, size, maxWords,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, vertical, height } = useU();
  const t = frame / fps - offsetSec;
  const pg = pages(words, maxWords ?? (style === "pop" ? 3 : 12), style === "pop" ? 24 : 42);
  const idx = pg.findIndex((p, i) => t >= p[0].start - 0.08 && t < (pg[i + 1]?.[0].start ?? p[p.length - 1].end + 0.6) - 0.08);
  if (idx < 0) return null;
  const page = pg[idx];
  const since = t - (page[0].start - 0.08);
  const fs = (size ?? (style === "pop" ? (vertical ? 78 : 64) : vertical ? 44 : 40)) * u;
  const safe = vertical ? SAFE.vertical : SAFE.horizontal;
  const top = y ?? (style === "pop" ? (vertical ? 0.64 : 0.74) : 1 - safe.bottom - 0.06);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: top * height, left: 0, right: 0, display: "flex", justifyContent: "center", padding: `0 ${(vertical ? safe.right : safe.left) * 100}%` }}>
        <div style={{
          display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `${0.12 * fs}px ${0.36 * fs}px`, maxWidth: "100%",
          fontFamily: style === "pop" ? FONTS.heavy : FONTS.body, fontWeight: style === "pop" ? 900 : 600, fontSize: fs,
          textTransform: style === "pop" ? "uppercase" : "none", lineHeight: 1.08, letterSpacing: style === "pop" ? "0.01em" : "0",
          transform: style === "pop" ? `scale(${0.9 + 0.1 * springAt(since, 3.2, 0.5)})` : undefined,
          background: style === "subtitle" ? "rgba(10,10,14,0.55)" : undefined, padding: style === "subtitle" ? `${0.25 * fs}px ${0.5 * fs}px` : 0, borderRadius: 0.2 * fs,
        }}>
          {page.map((w, i) => {
            const active = t >= w.start - 0.03 && t < w.end + 0.05;
            const k = active ? springAt(t - w.start + 0.03, 4, 0.45) : 0;
            return (
              <span key={i} style={{
                color: style === "pop" && active ? highlight : color,
                WebkitTextStroke: style === "pop" ? `${0.09 * fs}px #0b0b10` : undefined, paintOrder: "stroke fill",
                textShadow: style === "pop" ? `0 ${0.06 * fs}px ${0.08 * fs}px rgba(0,0,0,0.45)` : "0 2px 6px rgba(0,0,0,0.5)",
                transform: style === "pop" && active ? `scale(${1 + 0.06 * k}) translateY(${-0.05 * fs * k}px)` : undefined, display: "inline-block",
                transformOrigin: "50% 80%",
              }}>{w.word}</span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Kinetic title: words rise + de-blur in with stagger, optional subtitle, exits by fading/rising. */
export const KineticTitle: React.FC<{ text: string; sub?: string; start?: number; hold?: number; size?: number; color?: string; align?: "center" | "left"; y?: number; font?: string; accent?: string }> = ({
  text, sub, start = 0, hold = 9999, size = 120, color = "#ffffff", align = "center", y = 0.42, font = FONTS.display, accent = "#ffd23f",
}) => {
  const f = useCurrentFrame() - start;
  const { fps } = useVideoConfig();
  const { u, height, width } = useU();
  if (f < 0) return null;
  const words = text.split(" ");
  const out = clamp((f - hold) / 12);
  return (
    <div style={{ position: "absolute", top: y * height, left: align === "left" ? 0.08 * width : 0, right: align === "left" ? undefined : 0, textAlign: align, opacity: 1 - out, transform: `translateY(${-30 * u * ease.inCubic(out)}px)` }}>
      <div style={{ fontFamily: font, fontWeight: 800, fontSize: size * u, color, lineHeight: 1.02, letterSpacing: "-0.015em", textShadow: `0 ${4 * u}px ${18 * u}px rgba(0,0,0,0.35)` }}>
        {words.map((w, i) => {
          const s = springAt((f - i * 3) / fps, 2.4, 0.7);
          return <span key={i} style={{ display: "inline-block", marginRight: "0.28em", opacity: clamp(s * 1.4), transform: `translateY(${(1 - s) * 60 * u}px)`, filter: `blur(${(1 - clamp(s)) * 8 * u}px)` }}>{w}</span>;
        })}
      </div>
      {sub && (
        <div style={{ marginTop: 18 * u, fontFamily: FONTS.body, fontWeight: 600, fontSize: size * 0.32 * u, color: accent, letterSpacing: "0.08em", textTransform: "uppercase", opacity: clamp((f - words.length * 3 - 6) / 10) }}>{sub}</div>
      )}
    </div>
  );
};

export const LowerThird: React.FC<{ title: string; sub?: string; start?: number; dur?: number; accent?: string }> = ({ title, sub, start = 0, dur = 120, accent = "#ffb347" }) => {
  const f = useCurrentFrame() - start;
  const { u, height, width, vertical } = useU();
  if (f < 0 || f > dur) return null;
  const inn = ease.outExpo(clamp(f / 18)), out = ease.inCubic(clamp((f - dur + 14) / 14));
  const p = inn * (1 - out);
  return (
    <div style={{ position: "absolute", left: (vertical ? 0.07 : 0.06) * width, top: (vertical ? 0.7 : 0.76) * height, transform: `translateX(${(1 - p) * -40 * u}px)`, opacity: p }}>
      <div style={{ display: "flex", alignItems: "stretch", gap: 14 * u }}>
        <div style={{ width: 8 * u, background: accent, borderRadius: 4 * u, transform: `scaleY(${inn})`, transformOrigin: "top" }} />
        <div>
          <div style={{ fontFamily: FONTS.display, fontWeight: 700, fontSize: 46 * u, color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,.5)" }}>{title}</div>
          {sub && <div style={{ fontFamily: FONTS.body, fontSize: 28 * u, color: "rgba(255,255,255,.85)", marginTop: 4 * u }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
};

export const ChapterCard: React.FC<{ index: number; title: string; bg?: string; accent?: string }> = ({ index, title, bg = "#0f1220", accent = "#ffb347" }) => {
  const f = useCurrentFrame();
  const { u } = useU();
  const line = ease.outExpo(clamp(f / 24));
  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: FONTS.mono, color: accent, fontSize: 30 * u, letterSpacing: "0.4em", opacity: clamp(f / 12) }}>CHAPTER {String(index).padStart(2, "0")}</div>
        <div style={{ height: 3 * u, width: 520 * u * line, background: accent, margin: `${22 * u}px auto` }} />
        <KineticTitle text={title} start={6} size={96} y={0} />
      </div>
    </AbsoluteFill>
  );
};

export const Counter: React.FC<{ from?: number; to: number; start?: number; dur?: number; decimals?: number; prefix?: string; suffix?: string; size?: number; color?: string }> = ({
  from = 0, to, start = 0, dur = 45, decimals = 0, prefix = "", suffix = "", size = 160, color = "#fff",
}) => {
  const f = useCurrentFrame();
  const { u } = useU();
  const v = tween(f, start, start + dur, from, to, ease.outExpo);
  return <span style={{ fontFamily: FONTS.display, fontWeight: 800, fontSize: size * u, color, fontVariantNumeric: "tabular-nums" }}>{prefix}{v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
};

export const BarChart: React.FC<{ data: { label: string; value: number; color?: string }[]; start?: number; stagger?: number; max?: number; width?: number; height?: number; unitLabel?: string; decimals?: number }> = ({
  data, start = 0, stagger = 6, max, width = 900, height = 520, unitLabel = "", decimals = 0,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useU();
  const m = max ?? Math.max(...data.map((d) => d.value)) * 1.1;
  const bw = (width / data.length) * 0.62;
  return (
    <svg width={width * u} height={(height + 90) * u} viewBox={`0 0 ${width} ${height + 90}`}>
      <line x1={0} y1={height} x2={width} y2={height} stroke="rgba(255,255,255,.5)" strokeWidth={2} />
      {data.map((d, i) => {
        const s = springAt((f - start - i * stagger) / fps, 1.6, 0.8);
        const h = (d.value / m) * height * clamp(s, 0, 1.2);
        const x = (i + 0.5) * (width / data.length) - bw / 2;
        return (
          <g key={i}>
            <rect x={x} y={height - h} width={bw} height={h} rx={8} fill={d.color ?? "#ffb347"} />
            <text x={x + bw / 2} y={height - h - 14} textAnchor="middle" fill="#fff" fontFamily={FONTS.display} fontWeight={700} fontSize={34} opacity={clamp(s)}>{(d.value * clamp(s)).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{unitLabel}</text>
            <text x={x + bw / 2} y={height + 48} textAnchor="middle" fill="rgba(255,255,255,.85)" fontFamily={FONTS.body} fontSize={28}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
};

/** Film finish for DOM/2D scenes (3D scenes get this from the PostPipeline). Deterministic grain. */
export const FilmOverlay: React.FC<{ vignette?: number; grain?: number }> = ({ vignette = 0.25, grain = 0.06 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {vignette > 0 && <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,${vignette}) 100%)` }} />}
      {grain > 0 && (
        <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: grain, mixBlendMode: "overlay" }}>
          <filter id={`g${frame % 7}`}><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={frame % 97} stitchTiles="stitch" /></filter>
          <rect width="100%" height="100%" filter={`url(#g${frame % 7})`} />
        </svg>
      )}
    </AbsoluteFill>
  );
};

export const GradientBg: React.FC<{ a: string; b: string; angle?: number; drift?: number }> = ({ a, b, angle = 160, drift = 8 }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ background: `linear-gradient(${angle + Math.sin(f / 90) * drift}deg, ${a}, ${b})` }} />;
};

/**
 * One word at a time, hard swap on each word (measured on 2D-in-3D story shorts: white bold sans,
 * thin black outline, lower-middle). Words shorter than minFrames are merged with the next word
 * so nothing flashes for 1-2 frames.
 */
export const WordCaptions: React.FC<{ words: Word[]; y?: number; yAt?: (frame: number) => number | undefined; size?: number; color?: string; outline?: number; minFrames?: number; uppercase?: boolean; lead?: number }> = ({
  words, y, yAt, size, color = "#ffffff", outline = 0.06, minFrames = 3, /* outline 0.06 em measured (vfa ocr) */ uppercase = false, lead = 0.12,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, vertical, height } = useU();
  const t = frame / fps;
  // merge very short words into chunks lasting >= minFrames
  const chunks: { text: string; start: number; end: number }[] = [];
  for (const w of words) {
    const last = chunks[chunks.length - 1];
    if (last && (last.end - last.start) * fps < minFrames && w.start - last.end < 0.15) { last.text += " " + w.word; last.end = w.end; }
    else chunks.push({ text: w.word, start: w.start, end: w.end });
  }
  const i = chunks.findIndex((c, k) => t >= c.start - lead && t < (chunks[k + 1]?.start ?? c.end + 0.35) - lead); // appear ON the onset
  if (i < 0) return null;
  const fs = (size ?? (vertical ? 92 : 72)) * u;
  return (
    <div style={{ position: "absolute", top: (yAt?.(frame) ?? y ?? (vertical ? 0.66 : 0.78)) * height, left: 0, right: 0, textAlign: "center",
      fontFamily: FONTS.heavy, fontWeight: 900, fontSize: fs, color, textTransform: uppercase ? "uppercase" : "none",
      WebkitTextStroke: `${outline * fs}px #0b0b10`, paintOrder: "stroke fill", textShadow: `0 ${0.04 * fs}px ${0.1 * fs}px rgba(0,0,0,0.5)` }}>
      {chunks[i].text.replace(/[,.;:!?]+$/, (m) => (m.includes("?") || m.includes("!") ? m.slice(-1) : ""))}
    </div>
  );
};
