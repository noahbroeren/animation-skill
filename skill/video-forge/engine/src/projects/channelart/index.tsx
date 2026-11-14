/**
 * CHANNEL ART: a YouTube profile picture and banner for a channel, drawn with our cast house style (1.11.5).
 * The texts come from input props (never from this file), so a channel's name stays out of the repository:
 *
 *   props.json: { "name": "Channel Name", "accent": "Name", "handle": "@handle", "tagline": "...", "bg": "art/banner_bg.png" }
 *   node tools/render.mjs --project channelart --format square --stills 10 --clean --props props.json  -> logo (2160 px; scale to 800)
 *   node tools/render.mjs --project channelart --format long   --stills 10 --clean --props props.json  -> banner 2560x1440
 *
 * Banner rules (YouTube): the whole 2560x1440 shows on TVs, a 2560x423 band in the middle on desktop, and only the
 * 1546x423 centre on phones: the host and the name sit inside that centre band. The profile picture is shown as a
 * circle, as small as 98 px: one big face, one colour field, no small text.
 * The host is a bobble in BRANDS.ours (props.host can override any BobbleSpec field).
 */
import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, getInputProps, Img, staticFile, useVideoConfig } from "remotion";
import { BobbleSpec, BRANDS, drawAnyStyled, KPose } from "../../lib/characters/kinds";
import { ProjectDef } from "../../lib/project";
import { FONTS } from "../../lib/two/text";

type Art = { name?: string; accent?: string; handle?: string; tagline?: string; bg?: string; host?: Partial<BobbleSpec>; colors?: { a: string; b: string } };
const HOST: BobbleSpec = { id: "host", kind: "bobble", skin: "#ffffff", brand: { ...BRANDS.ours, shine: false, torsoShine: false }, legs: "#2f3442", shoes: "#1c1a20",
  hair: { style: "messy", color: "#6a3d22" }, glasses: "#2b2230", top: { color: "#2c5aa0", style: "hoodie" } } as BobbleSpec;
const INK = "#15171f";

/** the host drawn on a canvas: `w` x `h` pixels, the figure scaled so its head is `head` px wide; `top` shifts it up */
const Figure: React.FC<{ spec: BobbleSpec; pose: KPose; w: number; h: number; x: number; y: number }> = ({ spec, pose, w, h, x, y }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => { const g = ref.current!.getContext("2d")!; g.clearRect(0, 0, w, h); drawAnyStyled(g, spec, pose, w, h, 0); }, [spec, pose, w, h]);
  return <canvas ref={ref} width={w} height={h} style={{ position: "absolute", left: x, top: y, width: w, height: h }} />;
};

/** a fat cartoon question mark with an ink outline */
const Quest: React.FC<{ x: number; y: number; s: number; rot?: number; color?: string }> = ({ x, y, s, rot = 12, color = "#ffffff" }) => (
  <div style={{ position: "absolute", left: x, top: y, fontFamily: FONTS.heavy, fontSize: s, lineHeight: 1, color, transform: `rotate(${rot}deg)`,
    WebkitTextStroke: `${s * 0.075}px ${INK}`, paintOrder: "stroke fill", textShadow: `0 ${s * 0.05}px 0 rgba(0,0,0,0.25)` }}>?</div>
);

const Title: React.FC<{ name: string; accent?: string; size: number }> = ({ name, accent, size }) => {
  const words = name.split(" ");
  return (
    <div style={{ fontFamily: FONTS.heavy, fontSize: size, lineHeight: 1.0, letterSpacing: size * 0.01, whiteSpace: "nowrap" }}>
      {words.map((w, i) => (
        <span key={i} style={{ color: accent && w === accent ? "#ffd23f" : "#ffffff", WebkitTextStroke: `${size * 0.11}px ${INK}`, paintOrder: "stroke fill",
          textShadow: `0 ${size * 0.06}px 0 rgba(10,8,16,0.45)` }}>{w}{i < words.length - 1 ? " " : ""}</span>
      ))}
    </div>
  );
};

function Logo({ a }: { a: Art }) {
  const { width: W } = useVideoConfig(), spec = { ...HOST, ...(a.host ?? {}) } as BobbleSpec, c = a.colors ?? { a: "#ffd23f", b: "#f08a24" };
  const pose: KPose = { expr: "think", look: [0.55, -0.75], turn: 0.15 };
  const fw = W * 0.92, fh = W * 1.98; // the figure canvas: the head fills ~55 % of the width, the chest ends at the circle's bottom
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 42%, ${c.a} 0%, ${c.b} 72%, #c75a1a 100%)`, overflow: "hidden" }}>
      {/* soft rays behind the head */}
      <AbsoluteFill style={{ background: `repeating-conic-gradient(from 0deg at 50% 40%, rgba(255,255,255,0.11) 0deg 9deg, rgba(255,255,255,0) 9deg 22deg)` }} />
      <Figure spec={spec} pose={pose} w={fw} h={fh} x={(W - fw) / 2 - W * 0.04} y={W * 0.02} />
      <Quest x={W * 0.63} y={W * 0.1} s={W * 0.24} />
    </AbsoluteFill>
  );
}

function Banner({ a }: { a: Art }) {
  const { width: W, height: H } = useVideoConfig(), spec = { ...HOST, ...(a.host ?? {}) } as BobbleSpec;
  const bandY = (H - 423 * (W / 2560)) / 2, bandH = 423 * (W / 2560), safeX = (W - 1546 * (W / 2560)) / 2, safeW = 1546 * (W / 2560);
  const pose: KPose = { limbs: { handR: [0.95, 1.55] }, hands: { R: "open" }, expr: "happy", turn: 0.35 };
  const fh = bandH * 1.75, fw = fh * 0.62;
  return (
    <AbsoluteFill style={{ background: "#7fb6e6" }}>
      {a.bg ? <Img src={staticFile(a.bg)} style={{ position: "absolute", width: W, height: H, objectFit: "cover" }} /> : null}
      {/* a darker band so the name reads on any background; it fades out above and below the desktop strip */}
      <div style={{ position: "absolute", left: 0, top: bandY - bandH * 0.35, width: W, height: bandH * 1.7,
        background: "linear-gradient(180deg, rgba(14,10,20,0) 0%, rgba(14,10,20,0.52) 24%, rgba(14,10,20,0.52) 76%, rgba(14,10,20,0) 100%)" }} />
      {/* the host waves from the left edge of the phone-safe area */}
      <Figure spec={spec} pose={pose} w={fw} h={fh} x={safeX + fw * 0.02} y={bandY + bandH * 0.04} />
      <div style={{ position: "absolute", left: safeX + fw * 1.0, top: bandY, width: safeW - fw * 1.0, height: bandH, display: "flex", flexDirection: "column", justifyContent: "center", gap: bandH * 0.05 }}>
        <Title name={a.name ?? "Channel Name"} accent={a.accent} size={bandH * 0.3} />
        {a.tagline ? <div style={{ fontFamily: FONTS.heavy, fontSize: bandH * 0.095, color: "#ffffff", WebkitTextStroke: `${bandH * 0.012}px ${INK}`, paintOrder: "stroke fill", whiteSpace: "nowrap" }}>{a.tagline}</div> : null}
        {a.handle ? <div style={{ alignSelf: "flex-start", fontFamily: FONTS.heavy, fontSize: bandH * 0.08, color: INK, background: "#ffd23f", padding: `${bandH * 0.012}px ${bandH * 0.05}px`, borderRadius: bandH, border: `${bandH * 0.01}px solid ${INK}` }}>{a.handle}</div> : null}
      </div>
      <Quest x={safeX + fw * 0.66} y={bandY + bandH * 0.02} s={bandH * 0.3} />
    </AbsoluteFill>
  );
}

function Art() {
  const { width, height } = useVideoConfig(), a = getInputProps() as Art;
  return width / height < 1.2 ? <Logo a={a} /> : <Banner a={a} />;
}

export const channelart: ProjectDef = {
  id: "channelart", title: "channel art (logo + banner)", defaultFormat: "long", formats: ["long", "square"], fps: 30,
  scenes: () => [{ id: "art", frames: 30, render: () => <Art /> }],
};
