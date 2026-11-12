/**
 * FACES reference sheet (stills: page N at frame N*30 + 10). Bust crops: each cell draws the full character into a
 * window from 1.2 head diameters above the head centre to the shoulders, so faces read at their real on-screen size.
 * Pages: phone size (head 110 px), close-ups (head 160 px), three-quarter view, skin marks and conditions, the default
 * bobble without the brand (dot and whites eyes), and an extra-close detail page.
 */
import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BobbleSpec, BRANDS, drawKind, KEXPRS_ALL, KExpr, KPose } from "../../lib/characters/kinds";
import { SKIN_X } from "../../lib/characters/faces";
import { ProjectDef } from "../../lib/project";
import { FONTS } from "../../lib/two/text";

const BASE: BobbleSpec = { id: "base", kind: "bobble", skin: "#ffffff", brand: BRANDS.ours, hair: { style: "cap", color: "#6a3d22" }, top: { color: "#3d6b8a", style: "jacket", accent: "#f4efe6" }, legs: "#2f4a7a", shoes: "#2b2230" };
const PLAIN: BobbleSpec = (() => { const { brand, ...rest } = BASE; void brand; return { ...rest, id: "plain" }; })();
const PLAIN_WHITES: BobbleSpec = { ...PLAIN, id: "plainW", face: { eyes: "whites" } };
const BALD: BobbleSpec = { ...BASE, id: "bald", hair: { style: "bald", color: "#6a3d22" } };

type Cell = { spec: BobbleSpec; pose: KPose; label: string };
type Page = { title: string; d: number; cells: Cell[] };

const PAD_TOP = 1.12, PAD_BOT = 0.74, CW = 1.85; // window in head diameters around the head centre

const BustCell: React.FC<{ c: Cell; d: number; frame: number }> = ({ c, d, frame }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const heads = c.spec.heightHeads ?? c.spec.brand?.heads ?? 3.4;
  const hx = 0.08 + Math.max(0, (c.spec.brand?.head?.hw ?? 1) - 1) * 0.5 + Math.max(0, (c.spec.brand?.hairVolume ?? 1.045) - 1.045) * 0.5;
  const H = d * 1.08 * (heads + hx), u = H / 1.08, cy = H - (u * 0.08) / heads - u + hx * d + d / 2;
  const cw = Math.round(d * CW), vh = Math.round(d * (PAD_TOP + PAD_BOT)), y0 = cy - d * PAD_TOP;
  useLayoutEffect(() => {
    const g = ref.current!.getContext("2d")!;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, vh);
    g.translate(0, -y0); drawKind(g, c.spec, c.pose, cw, H, frame); g.setTransform(1, 0, 0, 1, 0, 0);
  }, [c, cw, vh, H, y0, frame]);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: cw }}>
      <div style={{ position: "relative", width: cw, height: vh, background: "#f6f1e8", borderRadius: 6, overflow: "hidden" }}>
        <canvas ref={ref} width={cw} height={vh} style={{ position: "absolute", left: 0, top: 0, width: cw, height: vh }} />
      </div>
      <div style={{ fontFamily: FONTS.mono, fontSize: Math.max(11, Math.min(18, d * 0.13)), color: "#333", whiteSpace: "nowrap", overflow: "hidden", maxWidth: cw, lineHeight: 1.3 }}>{c.label}</div>
    </div>
  );
};

const exprCells = (spec: BobbleSpec, list: readonly KExpr[], extra: KPose = {}): Cell[] => list.map((e) => ({ spec, pose: { ...extra, expr: e }, label: e }));
const perPage = (d: number) => { const cw = Math.round(d * CW) + 6, rh = Math.round(d * (PAD_TOP + PAD_BOT)) + Math.max(11, Math.min(18, d * 0.13)) * 1.3 + 6; return Math.floor((2560 - 32) / cw) * Math.floor((1440 - 56) / rh); };
function chunk(title: string, d: number, cells: Cell[]): Page[] {
  const n = perPage(d), out: Page[] = [];
  for (let i = 0; i < cells.length; i += n) out.push({ title: `${title} ${Math.floor(i / n) + 1}/${Math.ceil(cells.length / n)}`, d, cells: cells.slice(i, i + n) });
  return out;
}

const DETAIL: KExpr[] = ["dizzy", "love", "starstruck", "money", "vomit", "scream", "evilLaugh", "rage"];
function buildPages(): Page[] {
  const all = KEXPRS_ALL;
  const skinCells: Cell[] = [
    ...SKIN_X.map((m) => ({ spec: { ...BASE, marks: [m] }, pose: {}, label: m })),
    { spec: { ...BASE, marks: ["freckles", "rosy"] }, pose: { view: "three" }, label: "freckles+rosy 3/4" },
    { spec: { ...BASE, marks: ["blackeye", "bandaid"] }, pose: { view: "three" }, label: "blackeye 3/4" },
    { spec: BASE, pose: { skin: ["sick"], view: "side" }, label: "sick side" },
    { spec: { ...BALD, marks: ["wrinkles", "bump"] }, pose: {}, label: "bald wrinkles" },
  ];
  return [
    ...chunk("brand front, phone size (head 110 px)", 110, exprCells(BASE, all)),
    ...chunk("brand front close-up", 160, exprCells(BASE, all)),
    ...chunk("brand three-quarter", 110, exprCells(BASE, all, { view: "three" })),
    ...chunk("brand profile (side view)", 84, exprCells(BASE, all, { view: "side" })),
    ...chunk("skin marks + conditions", 120, skinCells),
    ...chunk("default bobble, dot eyes", 76, exprCells(PLAIN, all)),
    ...chunk("default bobble, whites eyes", 76, exprCells(PLAIN_WHITES, all)),
    { title: "detail", d: 280, cells: exprCells(BASE, DETAIL) },
  ];
}
const PAGES = buildPages();

const FaceSheet: React.FC = () => {
  const frame = useCurrentFrame(), pg = PAGES[Math.min(PAGES.length - 1, Math.floor(frame / 30))];
  return (
    <AbsoluteFill style={{ background: "#e9e2d6", padding: 16, gap: 6 }}>
      <div style={{ fontFamily: FONTS.display, fontSize: 26, color: "#222" }}>FACES · {pg.title} · {KEXPRS_ALL.length} expressions</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignContent: "flex-start" }}>
        {pg.cells.map((c, i) => <BustCell key={i} c={c} d={pg.d} frame={frame} />)}
      </div>
    </AbsoluteFill>
  );
};

/** page count (stills at N * 30 + 10 for N < N_PAGES) */
export const N_PAGES = PAGES.length;
export const facesheet: ProjectDef = {
  id: "facesheet", title: "FACES sheet", defaultFormat: "long", fps: 30,
  scenes: ({ fps }) => [{ id: "sheet", frames: N_PAGES * 30 * (fps / 30), render: () => <FaceSheet /> }],
};
