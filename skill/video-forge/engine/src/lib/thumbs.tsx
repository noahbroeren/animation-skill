/**
 * Thumbnails rendered FROM THE 3D WORLD (not screenshots of the video): each variant freezes the project at
 * one frame, optionally re-frames the camera (absolute or relative to the shot's camera), grades it, and lays
 * a few huge words + simple accents on top. Everything is a pure function of the props (no randomness).
 *
 * Kinds (verified against YouTube Help "Add video thumbnails", support.google.com/youtube/answer/72431, 2026-11):
 *  - long  1280x720  : the classic 16:9 upload size (min width 640). Saved as JPG < 2 MB = the mobile upload cap.
 *  - hires 2560x1440 : sharper 16:9 master (YouTube now recommends up to 3840x2160; desktop cap 50 MB).
 *  - short 1080x1920 : 9:16 Shorts cover (custom Shorts thumbnails are set in YouTube Studio on desktop).
 *
 * Feed reality: the long thumbnail is seen at ~168x94 (sidebar/search on phones) to ~360x202 (home grid), with
 * the duration stamp over the bottom-right corner. So: one focal point, a big face/object, <= 3-4 words,
 * thick outline, nothing important in the bottom-right ~20 % x 15 %. `tools/thumbs.mjs` renders + checks.
 *
 * Projects opt in with `thumbnails: (fps) => ThumbVariant[]` on their ProjectDef; Root.tsx registers
 * `<project>-thumb` with props { project, variant, kind }.
 */
import React from "react";
import { AbsoluteFill, Freeze, useVideoConfig } from "remotion";
import { CamState, V3 } from "./camera";
import { FormatId } from "./formats";
import { ProjectCtx, ProjectDef } from "./project";
import { CamOverride } from "./three/Stage3D";
import { Timeline } from "./timeline";
import { FONTS } from "./two/text";
import { clamp, rng } from "./time";

export type ThumbKind = "long" | "short" | "hires";
export const THUMB_KINDS: Record<ThumbKind, { width: number; height: number; label: string }> = {
  long: { width: 1280, height: 720, label: "YouTube 16:9 thumbnail 1280x720" },
  short: { width: 1080, height: 1920, label: "Shorts 9:16 cover 1080x1920" },
  hires: { width: 2560, height: 1440, label: "YouTube 16:9 thumbnail 2560x1440 (hi-res master)" },
};
export type ThumbProps = { project: string; variant: string; kind: ThumbKind; fps?: number; variants?: { id: string; note: string; frame: number; text: string }[] };

/** normalized frame point: [0..1 of width, 0..1 of height] */
export type Pt = [number, number];

/**
 * Camera for the still. `pos`/`look` replace the shot camera; the relative tweaks then apply on top:
 *  dolly  : distance-to-target multiplier (0.6 = 40 % closer)
 *  orbit  : yaw around the target (deg, + = camera moves right/counter-clockwise seen from above)
 *  lift   : elevation change around the target (deg, + = higher)
 *  dutch  : extra roll (deg)
 *  shift  : truck so the target lands off-centre: [x, y] in frame fractions (+x = target moves right, +y = up)
 *  pan    : same placement by turning the camera instead of moving it (keeps the line of sight, e.g. down a shaft)
 * Keep orbits small (< ~25 deg): 2D character cards face the SHOT camera, not the override.
 */
export type CamSpec = { pos?: V3; look?: V3; fov?: number; roll?: number; focus?: number; dolly?: number; orbit?: number; lift?: number; dutch?: number; shift?: [number, number]; pan?: [number, number] };

export type Accent =
  | { type: "arrow"; from: Pt; to: Pt; bend?: number; color?: string; width?: number }
  | { type: "circle"; at: Pt; r: number; ry?: number; color?: string; rot?: number }
  | { type: "burst"; at: Pt; r: number; glyph?: "?" | "!" | string; color?: string; ink?: string; rot?: number }
  | { type: "x"; at: Pt; r: number; color?: string }
  | { type: "check"; at: Pt; r: number; color?: string }
  /** custom vector: inner SVG markup in a viewBox, centred at `at`, `size` = width as a fraction of the short side */
  | { type: "svg"; at: Pt; size: number; viewBox: string; markup: string };

export type TextLayout = "left" | "right" | "top" | "bottom";
export type ThumbText = {
  /** 1-4 words. "|" forces a line break. */
  text: string;
  /** word (case-insensitive, without punctuation) to colour or put in a pill */
  highlight?: string;
  color?: string;
  highlightColor?: string;
  /** colour of a pill behind the highlighted word (text turns `pillText`) */
  pill?: string;
  pillText?: string;
  outline?: string;
  /** max cap height as a fraction of the frame height (auto-fit shrinks it to the box) */
  size?: number;
  /** degrees, a slight tilt reads as energy */
  tilt?: number;
};

export type ThumbCore = {
  /** project frame to freeze (absolute) */
  frame: number;
  cam?: CamSpec;
  text?: ThumbText;
  layout?: TextLayout;
  accents?: Accent[];
  /** 0..1 "pop" grade: +contrast +saturation, darker edges around `focus` */
  pop?: number;
  /** focal point for the vignette/spot light */
  focus?: Pt;
  /** 0..1 darkening gradient behind the text side; blur = px (at 1080) of backdrop blur under the text side */
  scrim?: number;
  blur?: number;
  /** optional second panel (A vs B): the frame splits in two halves (long: left|right, short: top/bottom) */
  split?: { frame: number; cam?: CamSpec; scene?: (ctx: ProjectCtx) => React.ReactNode; vs?: boolean;
    /** colour wash per half (e.g. red = wrong, green = right), soft-light blended */
    tint?: [string, string] };
  /** what to freeze; default = the whole project timeline (incl. its overlays/captions) */
  scene?: (ctx: ProjectCtx) => React.ReactNode;
};
export type ThumbVariant = ThumbCore & {
  id: string;
  /** one line: what the picture promises (goes into the report) */
  note?: string;
  /** per-kind overrides (hires uses `long`) */
  byKind?: Partial<Record<"long" | "short", Partial<ThumbCore>>>;
};

export function resolveVariant(v: ThumbVariant, kind: ThumbKind): ThumbVariant {
  const o = v.byKind?.[kind === "short" ? "short" : "long"] ?? {};
  return { ...v, ...o }; // a key present in the override wins, even when undefined (e.g. cam: undefined = shot camera)
}

// ------------------------------------------------------------------ camera override math
type Vec = [number, number, number];
const vsub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vadd = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vmul = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const vlen = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
const vnorm = (a: Vec): Vec => vmul(a, 1 / (vlen(a) || 1));
const vcross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function applyCamSpec(cam: CamState, s: CamSpec, aspect: number): CamState {
  let pos = (s.pos ?? cam.pos) as Vec;
  const look = (s.look ?? cam.look) as Vec;
  const fov = s.fov ?? cam.fov;
  const d = vsub(pos, look);
  let r = vlen(d);
  if (s.orbit || s.lift || s.dolly) {
    const D = Math.PI / 180;
    const yaw = Math.atan2(d[0], d[2]) + (s.orbit ?? 0) * D;
    const pitch = clamp(Math.asin(clamp(d[1] / (r || 1), -1, 1)) + (s.lift ?? 0) * D, -1.55, 1.55);
    r *= s.dolly ?? 1;
    pos = vadd(look, [r * Math.cos(pitch) * Math.sin(yaw), r * Math.sin(pitch), r * Math.cos(pitch) * Math.cos(yaw)]);
  }
  let lk = look;
  const off = s.shift ?? s.pan;
  if (off) {
    const f = vnorm(vsub(look, pos));
    let right = vcross(f, [0, 1, 0]);
    if (vlen(right) < 1e-4) right = [1, 0, 0]; // looking straight down
    right = vnorm(right);
    const up = vnorm(vcross(right, f));
    const th = Math.tan((fov * Math.PI) / 360) * r;
    // the target's NDC moves by 2*shift (NDC spans 2 per frame width/height) at distance r
    const delta = vadd(vmul(right, -2 * off[0] * th * aspect), vmul(up, -2 * off[1] * th));
    if (s.shift) pos = vadd(pos, delta);
    lk = vadd(look, delta);
  }
  const moved = !!(s.pos || s.look || s.dolly || s.orbit || s.lift);
  return { pos: pos as V3, look: lk as V3, fov, roll: (s.roll ?? cam.roll) + (s.dutch ?? 0), focus: s.focus ?? (moved ? r : cam.focus) };
}

// ------------------------------------------------------------------ text fitting
let mctx: CanvasRenderingContext2D | null = null;
const FALLBACK_W: Record<string, number> = { I: 0.39, M: 0.94, W: 1.0, " ": 0.33, "!": 0.33, "?": 0.61, ".": 0.33, ",": 0.33 };
/** width of `t` in em at the thumbnail font (canvas measureText; table fallback outside a browser) */
function emWidth(t: string): number {
  if (typeof document !== "undefined") {
    mctx = mctx ?? document.createElement("canvas").getContext("2d");
    if (mctx) { mctx.font = `900 100px ${FONTS.heavy}`; return mctx.measureText(t).width / 100; }
  }
  return [...t].reduce((s, c) => s + (FALLBACK_W[c] ?? (/[0-9]/.test(c) ? 0.67 : 0.78)), 0);
}

function splitLines(text: string, maxChars: number): string[] {
  if (text.includes("|")) return text.split("|").map((s) => s.trim()).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + " " + w).length <= maxChars) lines[lines.length - 1] = last + " " + w;
    else lines.push(w);
  }
  return lines;
}
const bare = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Text box per layout, in frame fractions [x0, y0, x1, y1]. Long-form keeps clear of the bottom-right timestamp. */
function textBox(layout: TextLayout, vertical: boolean): [number, number, number, number] {
  if (vertical) return layout === "bottom" ? [0.06, 0.6, 0.94, 0.78] : [0.06, 0.06, 0.94, 0.3];
  switch (layout) {
    case "left": return [0.04, 0.07, 0.5, 0.8];
    case "right": return [0.5, 0.06, 0.96, 0.72];
    case "top": return [0.05, 0.05, 0.95, 0.38];
    case "bottom": return [0.04, 0.56, 0.76, 0.92];
  }
}

const TextBlock: React.FC<{ t: ThumbText; layout: TextLayout; vertical: boolean }> = ({ t, layout, vertical }) => {
  const { width, height } = useVideoConfig();
  const [x0, y0, x1, y1] = textBox(layout, vertical);
  const bw = (x1 - x0) * width, bh = (y1 - y0) * height;
  const side = layout === "left" || layout === "right";
  const lines = splitLines(t.text.toUpperCase(), side && !vertical ? 7 : 12);
  const hl = t.highlight ? bare(t.highlight) : "";
  const LH = 1.0, PAD = t.pill ? 0.32 : 0.1; // pill padding + outline in em
  const widest = Math.max(...lines.map((l) => emWidth(l) + PAD + 0.12));
  let fs = Math.min(bw / widest, bh / (lines.length * LH));
  fs = Math.min(fs, (t.size ?? (vertical ? 0.11 : 0.3)) * height / 0.72); // cap height ~0.72 em
  const ink = t.outline ?? "#0b0b10";
  const align = layout === "left" || (vertical && layout !== "right") ? (vertical ? "center" : "left") : layout === "right" ? "right" : "center";
  return (
    <div style={{ position: "absolute", left: x0 * width, top: y0 * height, width: bw, height: bh, display: "flex", flexDirection: "column",
      justifyContent: "center", alignItems: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center" }}>
      <div style={{ transform: `rotate(${t.tilt ?? 0}deg)`, filter: `drop-shadow(0 ${0.05 * fs}px 0 ${ink}) drop-shadow(0 ${0.06 * fs}px ${0.16 * fs}px rgba(0,0,0,0.55))`, textAlign: align }}>
        {lines.map((line, i) => (
          <div key={i} style={{ fontFamily: FONTS.heavy, fontWeight: 900, fontSize: fs, lineHeight: LH, whiteSpace: "nowrap", letterSpacing: "-0.01em",
            color: t.color ?? "#ffffff", WebkitTextStroke: `${0.13 * fs}px ${ink}`, paintOrder: "stroke fill" }}>
            {line.split(" ").map((w, k) => {
              const on = hl && bare(w) === hl;
              const sp = k ? " " : "";
              if (on && t.pill) return (
                <React.Fragment key={k}>{sp}<span style={{ display: "inline-block", background: t.pill, color: t.pillText ?? "#ffffff", borderRadius: 0.16 * fs,
                  padding: `0 ${0.12 * fs}px`, margin: `${0.04 * fs}px 0`, lineHeight: 1.04, border: `${0.06 * fs}px solid ${ink}`, transform: "rotate(-2deg)" }}>{w}</span></React.Fragment>
              );
              return <React.Fragment key={k}>{sp}<span style={{ color: on ? t.highlightColor ?? "#ffd23f" : undefined }}>{w}</span></React.Fragment>;
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ accents (one SVG over the frame)
const RED = "#ff2d2d", INK = "#0b0b10";
function AccentSvg({ a, w, h, i }: { a: Accent; w: number; h: number; i: number }) {
  const s = Math.min(w, h);
  const P = (p: Pt): [number, number] => [p[0] * w, p[1] * h];
  switch (a.type) {
    case "arrow": {
      const [ax, ay] = P(a.from), [bx, by] = P(a.to);
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
      const bend = (a.bend ?? 0.2) * L;
      const cx = (ax + bx) / 2 - (dy / L) * bend, cy = (ay + by) / 2 + (dx / L) * bend;
      const sw = (a.width ?? 0.032) * s, hl = sw * 2.6;
      const tx = bx - cx, ty = by - cy, tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
      const ex = bx - ux * hl * 0.8, ey = by - uy * hl * 0.8; // shaft stops inside the head
      const head = `M${bx},${by} L${bx - ux * hl - uy * hl * 0.75},${by - uy * hl + ux * hl * 0.75} L${bx - ux * hl + uy * hl * 0.75},${by - uy * hl - ux * hl * 0.75} Z`;
      const d = `M${ax},${ay} Q${cx},${cy} ${ex},${ey}`;
      return (<g>
        <path d={d} fill="none" stroke={INK} strokeWidth={sw * 1.7} strokeLinecap="round" />
        <path d={head} fill={INK} stroke={INK} strokeWidth={sw * 0.7} strokeLinejoin="round" />
        <path d={d} fill="none" stroke={a.color ?? RED} strokeWidth={sw} strokeLinecap="round" />
        <path d={head} fill={a.color ?? RED} />
      </g>);
    }
    case "circle": {
      const [x, y] = P(a.at), rx = a.r * s, ry = (a.ry ?? a.r) * s, sw = 0.022 * s;
      return (<g transform={`rotate(${a.rot ?? -8} ${x} ${y})`}>
        <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="none" stroke={INK} strokeWidth={sw * 1.8} />
        <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="none" stroke={a.color ?? RED} strokeWidth={sw} />
      </g>);
    }
    case "burst": {
      const [x, y] = P(a.at), r = a.r * s, n = 14, R = rng(`burst${i}${a.glyph}`);
      const pts = Array.from({ length: n * 2 }, (_, k) => {
        const ang = (k / (n * 2)) * Math.PI * 2, rr = (k % 2 ? 0.7 : 1) * r * (0.92 + 0.16 * R());
        return `${x + Math.cos(ang) * rr},${y + Math.sin(ang) * rr}`;
      }).join(" ");
      return (<g transform={`rotate(${a.rot ?? 10} ${x} ${y})`}>
        <polygon points={pts} fill={a.color ?? "#ffd23f"} stroke={INK} strokeWidth={0.018 * s} strokeLinejoin="round" />
        <text x={x} y={y + r * 0.36} textAnchor="middle" fontFamily={FONTS.heavy} fontWeight={900} fontSize={r * 1.05} fill={a.ink ?? RED}
          stroke={INK} strokeWidth={r * 0.07} paintOrder="stroke fill">{a.glyph ?? "!"}</text>
      </g>);
    }
    case "x": {
      const [x, y] = P(a.at), r = a.r * s, sw = r * 0.34;
      const d = `M${x - r},${y - r} L${x + r},${y + r} M${x + r},${y - r} L${x - r},${y + r}`;
      return (<g><path d={d} stroke={INK} strokeWidth={sw * 1.45} strokeLinecap="round" /><path d={d} stroke={a.color ?? RED} strokeWidth={sw} strokeLinecap="round" /></g>);
    }
    case "check": {
      const [x, y] = P(a.at), r = a.r * s, sw = r * 0.34;
      const d = `M${x - r},${y} L${x - r * 0.25},${y + r * 0.75} L${x + r},${y - r * 0.8}`;
      return (<g><path d={d} fill="none" stroke={INK} strokeWidth={sw * 1.45} strokeLinecap="round" strokeLinejoin="round" />
        <path d={d} fill="none" stroke={a.color ?? "#36d96b"} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" /></g>);
    }
    case "svg": {
      const [x, y] = P(a.at), [, , vw, vh] = a.viewBox.split(/[ ,]+/).map(Number), W = a.size * s, H = (W * vh) / vw;
      return <svg x={x - W / 2} y={y - H / 2} width={W} height={H} viewBox={a.viewBox} dangerouslySetInnerHTML={{ __html: a.markup }} />;
    }
  }
}

// ------------------------------------------------------------------ the composition
const Frozen: React.FC<{ def: ProjectDef; ctx: ProjectCtx; frame: number; cam?: CamSpec; scene?: (ctx: ProjectCtx) => React.ReactNode }> = ({ def, ctx, frame, cam, scene }) => {
  const aspect = ctx.width / ctx.height;
  const fn = React.useMemo(() => (cam ? (c: CamState) => applyCamSpec(c, cam, aspect) : (c: CamState) => c), [cam, aspect]);
  return (
    <CamOverride.Provider value={fn}>
      <Freeze frame={frame}>{scene ? scene(ctx) : <Timeline scenes={def.scenes(ctx)} />}</Freeze>
    </CamOverride.Provider>
  );
};

export const ThumbView: React.FC<{ def: ProjectDef; props: ThumbProps }> = ({ def, props }) => {
  const { width, height, fps } = useVideoConfig();
  const list = def.thumbnails?.(fps) ?? [];
  const base = list.find((v) => v.id === props.variant) ?? list[0];
  if (!base) return <AbsoluteFill style={{ background: "#300", color: "#fff", fontSize: 40 }}>no thumbnails for {def.id}</AbsoluteFill>;
  const kind = props.kind ?? "long";
  const v = resolveVariant(base, kind);
  const vertical = height > width;
  const format: FormatId = vertical ? "short" : "long";
  const ctx: ProjectCtx = { fps, width, height, format, vertical };
  const pop = v.pop ?? 0.6;
  const layout = v.layout ?? (vertical ? "top" : "left");
  const focus = v.focus ?? [layout === "left" ? 0.68 : layout === "right" ? 0.32 : 0.5, layout === "top" ? 0.62 : 0.45];
  const sc = v.scrim ?? 0.45;
  const s = Math.min(width, height) / 1080;
  const scrimDir = vertical ? (layout === "bottom" ? "to top" : "to bottom") : layout === "left" ? "to right" : layout === "right" ? "to left" : layout === "top" ? "to bottom" : "to top";
  const maskStop = vertical ? "38%" : layout === "left" || layout === "right" ? "52%" : "45%";
  const grade = `contrast(${1 + 0.16 * pop}) saturate(${1 + 0.4 * pop}) brightness(${1 + 0.03 * pop})`;
  const half = v.split ? (vertical ? ["inset(0 0 50% 0)", "inset(50% 0 0 0)"] : ["inset(0 50% 0 0)", "inset(0 0 0 50%)"]) : null;
  const off = (k: number) => (vertical ? `translateY(${(k ? 1 : -1) * 25}%)` : `translateX(${(k ? 1 : -1) * 25}%)`);
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <AbsoluteFill style={{ filter: grade }}>
        {half ? (
          <>
            <AbsoluteFill style={{ clipPath: half[0] }}><AbsoluteFill style={{ transform: off(0) }}><Frozen def={def} ctx={ctx} frame={v.frame} cam={v.cam} scene={v.scene} /></AbsoluteFill></AbsoluteFill>
            <AbsoluteFill style={{ clipPath: half[1] }}><AbsoluteFill style={{ transform: off(1) }}><Frozen def={def} ctx={ctx} frame={v.split!.frame} cam={v.split!.cam} scene={v.split!.scene ?? v.scene} /></AbsoluteFill></AbsoluteFill>
          </>
        ) : <Frozen def={def} ctx={ctx} frame={v.frame} cam={v.cam} scene={v.scene} />}
      </AbsoluteFill>
      {half && v.split!.tint && v.split!.tint.map((c, k) => (
        <AbsoluteFill key={k} style={{ clipPath: half[k], background: c, mixBlendMode: "soft-light", opacity: 0.85 }} />
      ))}
      {/* focal vignette: darker edges, the subject stays bright */}
      {pop > 0 && <AbsoluteFill style={{ background: `radial-gradient(ellipse ${vertical ? "80% 55%" : "60% 75%"} at ${focus[0] * 100}% ${focus[1] * 100}%, rgba(0,0,0,0) 45%, rgba(10,6,24,${0.5 * pop}) 100%)` }} />}
      {/* backdrop blur + darkening behind the words */}
      {v.text && (v.blur ?? 0) > 0 && <AbsoluteFill style={{ backdropFilter: `blur(${(v.blur ?? 0) * s}px)`, WebkitMaskImage: `linear-gradient(${scrimDir}, #000 0%, #000 calc(${maskStop} - 12%), transparent ${maskStop})` }} />}
      {v.text && sc > 0 && <AbsoluteFill style={{ background: `linear-gradient(${scrimDir}, rgba(8,6,20,${sc}) 0%, rgba(8,6,20,${sc * 0.6}) calc(${maskStop} - 14%), rgba(8,6,20,0) ${maskStop})` }} />}
      {half && <AbsoluteFill>
        <div style={{ position: "absolute", background: "#ffffff", boxShadow: `0 0 ${12 * s}px rgba(0,0,0,0.6)`, ...(vertical ? { left: 0, right: 0, top: height / 2 - 5 * s, height: 10 * s } : { top: 0, bottom: 0, left: width / 2 - 5 * s, width: 10 * s }) }} />
        {v.split!.vs !== false && <div style={{ position: "absolute", left: width / 2 - 70 * s, top: height / 2 - 70 * s, width: 140 * s, height: 140 * s, borderRadius: "50%", background: "#ff2d2d",
          border: `${8 * s}px solid #0b0b10`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONTS.heavy, fontWeight: 900, fontSize: 62 * s, color: "#fff",
          WebkitTextStroke: `${6 * s}px #0b0b10`, paintOrder: "stroke fill", boxSizing: "border-box" }}>VS</div>}
      </AbsoluteFill>}
      {v.accents?.length ? (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0 }}>
          {v.accents.map((a, i) => <AccentSvg key={i} a={a} w={width} h={height} i={i} />)}
        </svg>
      ) : null}
      {v.text && <TextBlock t={v.text} layout={layout} vertical={vertical} />}
    </AbsoluteFill>
  );
};

/** calculateMetadata for `<project>-thumb`: size per kind + the variant list (id/note/text) for tools/thumbs.mjs */
export function thumbMetadata(def: ProjectDef, props: ThumbProps) {
  const kind = props.kind ?? "long";
  const k = THUMB_KINDS[kind] ?? THUMB_KINDS.long;
  const fps = props.fps || def.fps;
  const list = def.thumbnails?.(fps) ?? [];
  // Remotion clamps every frame (also inside <Freeze>) to the composition range: make it span the latest frozen frame
  const last = Math.max(0, ...list.flatMap((v) => [v, ...Object.values(v.byKind ?? {})]).flatMap((c) => [c?.frame ?? 0, c?.split?.frame ?? 0]));
  const variants = list.map((v) => {
    const r = resolveVariant(v, kind);
    return { id: v.id, note: v.note ?? "", frame: r.frame, text: r.text?.text.replace(/\|/g, " ") ?? "" };
  });
  return { width: k.width, height: k.height, fps, durationInFrames: last + 1, props: { ...props, variants } as ThumbProps };
}
