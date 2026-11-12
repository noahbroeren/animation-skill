/** HAIR STYLES reference sheet (stills: page N at frame N*30 + 10). Pages are built in pages() below: every hair.ts style
 *  in front / three-quarter / profile with the house brand, then a page of styles on the default round head (no brand). */
import React from "react";
import { HAIR_X, type HairX } from "../../lib/characters/hair";
import { BobbleSpec, BRANDS, KindSpec } from "../../lib/characters/kinds";
import { ProjectDef } from "../../lib/project";
import { SheetCell, SheetGrid, SheetPage } from "../../lib/sheetgrid";

const BASE: BobbleSpec = { id: "base", kind: "bobble", skin: "#ffffff", brand: BRANDS.ours, hair: { style: "cap", color: "#6a3d22" }, top: { color: "#3d6b8a", style: "jacket", accent: "#f4efe6" }, legs: "#2f4a7a", shoes: "#2b2230" };
/** realistic hair colours first, a few fun ones mixed in */
const HAIR_COLS = ["#1f1a22", "#3b2a20", "#6a3d22", "#a0482a", "#d9b25a", "#b9b4c4", "#3f6fd6", "#ecebf0", "#e07aa8", "#4caf7a", "#3b2a20", "#1f1a22", "#a0482a", "#6a3d22"];
const TOPS: BobbleSpec["top"][] = [
  { color: "#3d6b8a", style: "jacket", accent: "#f4efe6" }, { color: "#c0563b", style: "tee" }, { color: "#5b7d4a", style: "hoodie" },
  { color: "#7a5a9a", style: "shirt" }, { color: "#e0b040", style: "tee" }, { color: "#2f3a4f", style: "suit" },
];
const PER_ROW = 5, ROWS = 4, CW = 138, CH = 300;

function cells(style: HairX, i: number, brand = true): SheetCell[] {
  const spec: BobbleSpec = { ...BASE, id: `${style}-${brand ? "b" : "r"}`, hair: { style, color: HAIR_COLS[i % HAIR_COLS.length] }, top: TOPS[i % TOPS.length] };
  if (!brand) delete spec.brand;
  const s = spec as KindSpec;
  return [{ spec: s, pose: {}, label: style, w: CW }, { spec: s, pose: { view: "three" }, label: "3/4", w: CW }, { spec: s, pose: { view: "side" }, label: "side", w: CW }];
}

function pages(): SheetPage[] {
  const out: SheetPage[] = [], all = [...HAIR_X], per = PER_ROW * ROWS;
  for (let p = 0; p * per < all.length; p++) {
    const chunk = all.slice(p * per, (p + 1) * per), rows = [];
    for (let r = 0; r * PER_ROW < chunk.length; r++) {
      const st = chunk.slice(r * PER_ROW, (r + 1) * PER_ROW), i0 = p * per + r * PER_ROW;
      rows.push({ title: `${i0 + 1}-${i0 + st.length}`, cells: st.flatMap((s, j) => cells(s, i0 + j)) });
    }
    out.push({ title: `page ${p} · brand ours (front, 3/4, side)`, h: CH, rows });
  }
  // silhouettes (front + profile) at a ~64 px head: the head-top outline is the character's identity
  const SIL = { pass: "silhouette" as const, fill: "#22202a" }, sil = (s: HairX, i: number): SheetCell[] => {
    const spec = { ...BASE, id: `${s}-sil`, hair: { style: s, color: "#555" }, top: TOPS[i % TOPS.length] } as KindSpec;
    return [{ spec, pose: {}, label: s, w: 100, pass: SIL }, { spec, pose: { view: "side" }, label: "", w: 100, pass: SIL }];
  };
  out.push({ title: "silhouettes (front, side)", h: 250, rows: [0, 1, 2, 3, 4].map((r) => ({ title: `sil ${r + 1}`, cells: all.slice(r * 11, (r + 1) * 11).flatMap((s, j) => sil(s, r * 11 + j)) })) });
  // the default round head (no brand): no lift, round crown, thinner hair volume
  const plain: HairX[] = ["afro", "mohawk", "curtains", "emo", "bangs", "pompadour", "pixie", "bowl", "mane", "twintails", "flattop", "cornrows", "messy", "braids", "hime"];
  out.push({ title: "no brand: default round head", h: CH, rows: [0, 1, 2].map((r) => ({ title: `plain ${r + 1}`, cells: plain.slice(r * PER_ROW, (r + 1) * PER_ROW).flatMap((s, j) => cells(s, r * PER_ROW + j + 3, false)) })) });
  return out;
}

const N_PAGES = pages().length;
export const hairsheet: ProjectDef = {
  id: "hairsheet", title: "HAIR STYLES sheet", defaultFormat: "long", fps: 30,
  scenes: ({ fps }) => [{ id: "sheet", frames: N_PAGES * 30 * (fps / 30), render: () => <SheetGrid name="HAIR STYLES" pages={pages} /> }],
};
