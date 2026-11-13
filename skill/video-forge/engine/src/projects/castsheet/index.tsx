/**
 * OUR CAST reference sheet (brand ours-v1). Stills: page N at frame N*30 + 10.
 *   0-1  line-up of every character (signature pose, prop, resting face), grouped
 *   2    the core ensemble at true relative heights
 *   3-6  core turnarounds: front, 3/4, side, signature pose and six faces each
 *   7    silhouettes of the core
 *   8    extras: 30 generated background people
 */
import React from "react";
import { bobbleScale, KExpr, KindSpec, KPose } from "../../lib/characters/kinds";
import { CORE_IDS, extra, OUR_CAST, signaturePose } from "../../lib/characters/ours";
import { ProjectDef } from "../../lib/project";
import { SheetCell, SheetGrid, SheetPage, SheetRow } from "../../lib/sheetgrid";

const ALL = Object.keys(OUR_CAST);
const spec = (id: string) => OUR_CAST[id].spec as KindSpec;
const chunk = <T,>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

function lineup(ids: string[], title: string): SheetPage {
  const rows: SheetRow[] = chunk(ids, 15).map((part, i) => ({ title: i ? "" : "cast", cells: part.map((id) => ({ spec: spec(id), pose: signaturePose(id), label: OUR_CAST[id].name, w: 150 })) }));
  return { title, h: 300, rows };
}
function heights(): SheetPage {
  const hs = CORE_IDS.map((id) => OUR_CAST[id].height * bobbleScale(OUR_CAST[id].spec)), mx = Math.max(...hs);
  return { title: "the core ensemble at true heights", h: 560, rows: [{ title: "core", cells: CORE_IDS.map((id, i) => ({ spec: spec(id), pose: { expr: OUR_CAST[id].rest } as KPose, label: OUR_CAST[id].name + " " + OUR_CAST[id].height.toFixed(2), w: 166, scale: hs[i] / mx })) }] };
}
const FACES: KExpr[] = ["happy", "angry", "shock", "sad", "laugh", "think", "nervous", "confused", "wink", "love", "sick", "dizzy", "panic", "asleep", "proud"];
function turnRow(id: string): SheetRow {
  const m = OUR_CAST[id], s = spec(id);
  const cells: SheetCell[] = [
    { spec: s, pose: { expr: m.rest }, label: "front", w: 118 }, { spec: s, pose: { view: "three", expr: m.rest }, label: "3/4", w: 118 }, { spec: s, pose: { view: "side", expr: m.rest }, label: "side", w: 104 },
    { spec: s, pose: signaturePose(id), label: m.pose, w: 160 },
    ...FACES.map((e) => ({ spec: s, pose: { expr: e } as KPose, label: e, w: 104 })),
    { spec: s, pose: { view: "three", expr: "smug" } as KPose, label: "3/4 smug", w: 118 },
  ];
  return { title: m.name, note: m.role + "\n" + m.traits + "\nvoice: " + m.voice, cells };
}
function silhouettes(): SheetPage {
  return { title: "core silhouettes (solid, no inner lines): every head top, torso and prop must differ", h: 300,
    rows: chunk(CORE_IDS, 14).map((part) => ({ title: "front", cells: part.map((id) => ({ spec: spec(id), pose: signaturePose(id), label: OUR_CAST[id].name, w: 150, pass: { pass: "silhouette", fill: "#1c1a20" } as SheetCell["pass"] })) })) };
}
function extras(): SheetPage {
  const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
  return { title: "extras: extra(seed) gives endless background people (same seed = same person)", h: 300,
    rows: chunk(seeds, 15).map((part, i) => ({ title: i ? "" : "extras", cells: part.map((n) => ({ spec: extra(n) as KindSpec, pose: {}, label: "extra(" + n + ")", w: 150 })) })) };
}

/** 1.11.2: eight views round each core character (the camera can stand anywhere: a card must read from every side) */
const VIEWS8: [string, KPose][] = [["front", {}], ["3/4 R", { view: "three", facing: 1 }], ["side R", { view: "side", facing: 1 }], ["back 3/4 R", { view: "threeBack", facing: 1 }],
  ["back", { view: "back" }], ["back 3/4 L", { view: "threeBack", facing: -1 }], ["side L", { view: "side", facing: -1 }], ["3/4 L", { view: "three", facing: -1 }]];
function turnaround8(ids: string[], title: string): SheetPage {
  return { title, h: 330, rows: ids.map((id) => ({ title: OUR_CAST[id].name, cells: VIEWS8.map(([lab, v]) => ({ spec: spec(id), pose: { ...v, expr: OUR_CAST[id].rest } as KPose, label: lab, w: 132 })) })) };
}
/** continuous turnaround: 16 headings every 22.5 degrees (`yaw`), the board picks any angle in between */
function turnaround16(ids: string[], title: string): SheetPage {
  return { title, h: 300, rows: ids.map((id) => ({ title: OUR_CAST[id].name, cells: Array.from({ length: 16 }, (_, i) => { const y = i * 22.5 > 180 ? i * 22.5 - 360 : i * 22.5;
    return { spec: spec(id), pose: { yaw: y, expr: OUR_CAST[id].rest } as KPose, label: `${Math.round(y)}`, w: 92 }; }) })) };
}

function pages(): SheetPage[] {
  const core = CORE_IDS, rest = ALL.filter((id) => !core.includes(id));
  return [
    lineup([...core, ...rest.slice(0, 46)], "LINE-UP 1: the core ensemble, then the role library"),
    lineup(rest.slice(46), "LINE-UP 2: the role library (continued)"),
    heights(),
    ...chunk(core, 4).map((part, i) => ({ title: "core turnarounds " + (i + 1), h: 300, rows: part.map(turnRow) })),
    silhouettes(),
    extras(),
    ...chunk(core, 4).map((part, i) => turnaround16(part, "16-way turnarounds " + (i + 1) + " (yaw every 22.5 deg; any angle in between is drawn too)")),
  ];
}

const N_PAGES = 13;
export const castsheet: ProjectDef = {
  id: "castsheet", title: "OUR CAST sheet", defaultFormat: "long", fps: 30,
  scenes: ({ fps }) => [{ id: "sheet", frames: N_PAGES * 30 * (fps / 30), render: () => <SheetGrid name="OUR CAST" pages={pages} /> }],
};
