/**
 * A reusable reference-sheet grid (the charsheet look): pages of rows of character cells, one page per second
 * (still N*30 + 10 shows page N). Used by hairsheet, facesheet, wardrobesheet and castsheet.
 */
import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { drawAnyStyled, KindSpec, KPose, PassSpec } from "./characters/kinds";
import { FONTS } from "./two/text";

/** scale < 1 draws the figure smaller, standing on the same ground line (true relative heights in a line-up) */
export type SheetCell = { spec: KindSpec; pose: KPose; label: string; pass?: PassSpec; w?: number; scale?: number };
export type SheetRow = { title: string; note?: string; cells: SheetCell[] };
export type SheetPage = { title: string; rows: SheetRow[]; h: number };

const Cell: React.FC<SheetCell & { h: number; frame: number }> = ({ spec, pose, label, pass, w, h, frame, scale = 1 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const cw = w ?? Math.round(h * 0.72), ch = Math.round(h * scale);
  useLayoutEffect(() => { const g = ref.current!.getContext("2d")!; drawAnyStyled(g, spec, pose, cw, ch, frame, pass); }, [spec, pose, cw, ch, frame, pass]);
  const gy = h - ((h / 1.08) * 0.08) / (spec.heightHeads ?? 3.5);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: cw }}>
      <div style={{ position: "relative", width: cw, height: h, background: "#f6f1e8", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: cw * 0.18, width: cw * 0.64, top: gy - h * 0.02, height: h * 0.04, borderRadius: "50%", background: "rgba(60,40,80,0.16)" }} />
        <canvas ref={ref} width={cw} height={ch} style={{ position: "absolute", left: 0, top: h - ch, width: cw, height: ch }} />
      </div>
      <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: "#444", whiteSpace: "nowrap", overflow: "hidden", maxWidth: cw }}>{label}</div>
    </div>
  );
};

/** Renders page floor(frame / 30) of `pages(frame)`. */
export const SheetGrid: React.FC<{ name: string; pages: (frame: number) => SheetPage[] }> = ({ name, pages }) => {
  const frame = useCurrentFrame();
  const all = pages(frame), pg = all[Math.min(all.length - 1, Math.floor(frame / 30))];
  return (
    <AbsoluteFill style={{ background: "#e9e2d6", padding: 16, gap: 6 }}>
      <div style={{ fontFamily: FONTS.display, fontSize: 26, color: "#222" }}>{name} · {pg.title}</div>
      {pg.rows.map((r, ri) => (
        <div key={ri} style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "nowrap" }}>
          <div style={{ width: r.note ? 136 : 92, fontFamily: FONTS.mono, fontSize: 13, color: "#333", paddingTop: 8, wordBreak: "break-all" }}>{r.title}
            {r.note ? <div style={{ fontSize: 11, color: "#355", whiteSpace: "pre-line", marginTop: 4, lineHeight: 1.25 }}>{r.note}</div> : null}</div>
          {r.cells.map((c, i) => <Cell key={i} {...c} h={pg.h} frame={frame} />)}
        </div>
      ))}
    </AbsoluteFill>
  );
};
