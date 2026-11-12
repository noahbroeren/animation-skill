/**
 * WARDROBE reference sheet (stills: page N at frame N*30 + 10). Pages are built in pages() below:
 *   0-3   hats (front / 3/4 / side per hat)          4-6   tops (front / 3/4 / side, fitting colour and accent)
 *   7     print patterns on a tee, a dress and a sweater   8-9 neckwear (front / 3/4 / side)
 *   10    garments behind the body (capes, hoods) and long hems walking
 *   11-12 held props in a pose (needs the drawPropX call in stickProp)
 *   13    the default bobble (no brand, round head, sleeve limbs): hats, tops and props still fit
 *   14    prop close-ups drawn straight in hand space (black disc = the hand), every prop at a glance
 */
import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BOBBLE_POSES, BobbleSpec, BRANDS, KindSpec, KPose, mix, shade, type StickHold } from "../../lib/characters/kinds";
import type { Kit, V2 } from "../../lib/characters/kit";
import { drawPropX, HAT_X, NECK_X, PATTERN_X, PROP_X, TOP_X, type HatX, type NeckX, type PropX, type TopX } from "../../lib/characters/wardrobe";
import { ProjectDef } from "../../lib/project";
import { SheetGrid, SheetPage } from "../../lib/sheetgrid";
import { FONTS } from "../../lib/two/text";

const BASE: BobbleSpec = { id: "base", kind: "bobble", skin: "#ffffff", brand: BRANDS.ours, hair: { style: "cap", color: "#6a3d22" }, top: { color: "#3d6b8a", style: "jacket", accent: "#f4efe6" }, legs: "#2f4a7a", shoes: "#2b2230" };
const PLAIN: BobbleSpec = (() => { const s: BobbleSpec = { ...BASE, id: "plain", skin: "#f3d2b8" }; delete s.brand; return s; })();
const chunk = <T,>(a: readonly T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

const HATC: Record<HatX, [string, string?]> = {
  pirate: ["#2b2a33", "#e0b24a"], helmet: ["#e04a3a", "#f4efe6"], knight: ["#aab4c3", "#c8372d"], astronaut: ["#e8eaef"], cowboy: ["#a0703f", "#4a2e1c"],
  wizard: ["#3c4a9a", "#f2c94c"], nurse: ["#f7f7f4", "#2f8fbf"], firefighter: ["#c8372d", "#e6b84a"], grad: ["#22252e", "#e6b84a"], headband: ["#e04a3a", "#f4efe6"],
  hood: ["#4f6b3a"], viking: ["#9aa3b0", "#efe4c8"], party: ["#4aa3df", "#f2c94c"], sombrero: ["#e2c27a", "#c8372d"], flowers: ["#f28fb0", "#f6d04d"],
  headphones: ["#2b2f3a", "#e04a3a"], bandana: ["#c8372d", "#f4efe6"], turban: ["#e8a33c"], hijab: ["#5a7fa8"], fez: ["#b8322f", "#2b2230"], tiara: ["#d8dde6", "#e05a8a"],
  propeller: ["#e04a3a", "#3d7fd0"], police: ["#23324f", "#e6b84a"], captain: ["#f7f7f4", "#e6b84a"], sunhat: ["#efd9a0", "#e05a8a"], bucket: ["#7a9a5a"],
  earmuffs: ["#e05a8a", "#8a8f9c"], horns: ["#c83a3a"], halo: ["#f5cf4a"], toque: ["#f7f7f4"], chefcap: ["#f7f7f4"], beaniePom: ["#3d7fd0", "#f4efe6"],
  flatcap: ["#6b6355"], derby: ["#2b2a33"], jester: ["#7a4a9a", "#f2c94c"], crownSmall: ["#e6b84a", "#d8344e"], miner: ["#f2b134"], safari: ["#d9c79a", "#7a5a3a"],
  santa: ["#c8372d"], witch: ["#2b2a33", "#7a4a9a"], elf: ["#3f8a4a", "#c8372d"], nemes: ["#e3b744", "#2f5fa8"], roman: ["#c4a050", "#c8372d"], kabuto: ["#2b2f3a", "#e6b84a"],
  ushanka: ["#5a4636", "#d9c7a8"], deerstalker: ["#9a7a5a"], paperhat: ["#ecebe4"], beekeeper: ["#efe9d8"], divemask: ["#f2b134"], goggles: ["#a8763e", "#9fd4f0"],
  bunny: ["#f4efe6", "#f2a7b8"], catears: ["#2b2a33", "#f2a7b8"], antlers: ["#9a6a3c"], mortarboard: ["#3c4a9a", "#e6b84a"], fedora: ["#5a5f6a", "#22252e"],
  backcap: ["#3d7fd0", "#f4efe6"], visor: ["#f4efe6", "#3d7fd0"], nightcap: ["#4aa3df", "#f4efe6"], bow: ["#e05a8a"], laurel: ["#d9b54a"], bonnet: ["#f2d9a8", "#e05a8a"],
  tricorn: ["#2b2a33", "#e6b84a"], sailorcap: ["#f7f7f4"],
};
const TOPC: Record<TopX, [string, string?]> = {
  armor: ["#aab4c3", "#6b4a2e"], robe: ["#3c4a9a", "#f2c94c"], scrubs: ["#4fa3a5"], tank: ["#e04a3a"], sweater: ["#c8553d", "#f2c94c"], cardigan: ["#8a6a9a", "#f4efe6"],
  kimono: ["#3d6b8a", "#f1e3c6"], spacesuit: ["#eef0f4", "#e0663a"], tux: ["#22252e"], hawaiian: ["#2f8fbf", "#f4efe6"], jersey: ["#c8372d", "#f4efe6"],
  labcoat: ["#f7f7f4", "#8fb3d9"], trench: ["#c9a97a"], puffer: ["#e8833a"], poncho: ["#b8322f", "#f2c94c"], cape: ["#3d6b8a", "#b8322f"], toga: ["#f1ead8", "#7a4a9a"],
  sailor: ["#f7f7f4", "#28457a"], chefcoat: ["#f7f7f4"], turtleneck: ["#2b2f3a"], polo: ["#3f8a4a", "#f4efe6"], blazer: ["#2f4a7a", "#d9534f"], tunic: ["#5f7d3a", "#6b4a2e"],
  supersuit: ["#2f5fa8", "#c8372d"], varsity: ["#7a2a3a", "#f4efe6"], waistcoat: ["#5a4636", "#f4efe6"], bathrobe: ["#8fb3d9"], pajamas: ["#7aa7c9", "#f4efe6"],
  hazmat: ["#f2c94c"], wetsuit: ["#22252e", "#2f8fbf"], judge: ["#22252e"], monk: ["#7a5a3a", "#e3d2a8"], pharaoh: ["#f4efe6", "#2f5fa8"], chainmail: ["#9aa3b0", "#3d6b8a"],
  barista: ["#f4efe6", "#2f6b4f"], coverall: ["#4f6f8f"], raincoat: ["#f2c94c"], suspenders: ["#dfe8f2", "#7a3b2e"], gown: ["#b0507a", "#f2c94c"], hivis: ["#f08a2b"],
  pilot: ["#22324f"], caveman: ["#c98a4a", "#7a4a2a"], royal: ["#7a2a4a"], cloak: ["#3a3f4b", "#6b4a2e"],
};
/** hats that go with a top on the tops pages (a costume reads as one) */
const TOP_HAT: Partial<Record<TopX, HatX>> = { armor: "knight", robe: "wizard", spacesuit: "astronaut", chefcoat: "toque", pharaoh: "nemes", toga: "laurel", royal: "crownSmall", pilot: "captain", hazmat: "hood", raincoat: "bucket", sailor: "sailorcap" };
const NECKC: Record<NeckX, string> = {
  necklace: "#e6b84a", pearls: "#f6f3ea", medal: "#c8372d", lanyard: "#2f8fbf", bandanaNeck: "#c8372d", collar: "#f7f5f0", ruff: "#f7f5f0", chain: "#e6b84a", whistle: "#e04a3a",
  stethoscope: "#2b2f3a", ascot: "#7a2a4a", bolo: "#3a2a24", lei: "#f28fb0", neckerchief: "#e8833a", scarfLong: "#c8372d", headphonesNeck: "#2b2f3a", amulet: "#7a4a9a", key: "#e6b84a",
};
const PAT_COL: Record<string, [string, string]> = {
  stripes: ["#f4efe6", "#22252e"], hstripes: ["#f4efe6", "#28457a"], dots: ["#d9534f", "#f4efe6"], plaid: ["#b8322f", "#22324f"], check: ["#f4efe6", "#4a90c8"], flowers: ["#3d6b8a", "#f4efe6"],
  camo: ["#6b7a4a", "#4a3a26"], stars: ["#22324f", "#f2c94c"], number: ["#3f8a4a", "#f4efe6"], zigzag: ["#e8833a", "#f4efe6"], hearts: ["#f2a7b8", "#c8372d"], argyle: ["#5a7fa8", "#f2c94c"],
  pinstripe: ["#3a3f4b", "#c4cad4"], diagonal: ["#f2c94c", "#22252e"], spots: ["#e2b56a", "#5a3a20"], waves: ["#4aa3df", "#f4efe6"], leaves: ["#2f8fbf", "#7fd18a"], ringer: ["#f4efe6", "#c8372d"],
};

const hatSpec = (st: HatX, base: BobbleSpec = BASE): KindSpec => { const [color, accent] = HATC[st]; return { ...base, id: "h-" + st, hair: { style: st === "hijab" || st === "nemes" ? "bald" : "cap", color: "#6a3d22" }, hat: { style: st, color, ...(accent ? { accent } : {}) } } as KindSpec; };
const topSpec = (st: TopX, base: BobbleSpec = BASE, hat = true): KindSpec => { const [color, accent] = TOPC[st], h = hat ? TOP_HAT[st] : undefined;
  return { ...base, id: "t-" + st, top: { style: st, color, ...(accent ? { accent } : {}) }, ...(h ? { hat: { style: h, color: st === "hazmat" ? color : HATC[h][0], ...(HATC[h][1] ? { accent: HATC[h][1] } : {}) } } : {}), ...(st === "judge" ? { hair: { style: "bob", color: "#d9d9d9" } } : {}) } as KindSpec; };
const VIEWS: [KPose, string][] = [[{}, ""], [{ view: "three" }, "3/4"], [{ view: "side" }, "side"]];

/** the pose that shows a prop best: hanging at the side, shown in front of the chest, raised, or held high */
const PROP_POSE: Partial<Record<PropX, "hang" | "show" | "raise" | "high" | "low" | "face">> = {
  briefcase: "hang", shopping: "hang", suitcase: "hang", toolbox: "hang", medkit: "hang", lantern: "hang", basket: "hang", wateringcan: "hang", bell: "hang", fish: "hang", guitar: "hang", balloon: "hang",
  broom: "low", rake: "low", shovel: "low", oar: "low", pickaxe: "raise",
  sword: "raise", torch: "raise", wand: "raise", magnifier: "raise", flashlight: "raise", net: "raise", racket: "raise", fishingrod: "raise", telescope: "raise", key: "raise", pen: "raise",
  paintbrush: "raise", gavel: "raise", spatula: "raise", whisk: "raise", ladle: "raise", pan: "raise", rollingpin: "raise", baguette: "raise", carrot: "raise", bone: "raise", wrench: "raise",
  trophy: "high", sign: "high", umbrella: "high", tray: "high",
  selfie: "face", mic: "face", megaphone: "face",
};
const holdPose = (item: PropX): KPose => {
  const hold: StickHold = { item };
  switch (PROP_POSE[item] ?? "show") {
    case "hang": return { hold };
    case "low": return { limbs: { handR: [0.62, 0.3] }, hold };
    case "raise": return { limbs: { handR: [0.9, 0.9] }, hold, expr: "determined" };
    case "high": return { limbs: { handR: [0.5, 1.0] }, hold, expr: "happy" };
    case "face": return { ...BOBBLE_POSES.phone, hold };
    default: return { limbs: { handR: [0.55, 0.62] }, hold, expr: "happy" };
  }
};

function pages(): SheetPage[] {
  const out: SheetPage[] = [];
  const W = 168;
  chunk(chunk(HAT_X, 4), 4).forEach((rowsOf, pi) => out.push({ title: `hats ${pi + 1}/4 (front, 3/4, side)`, h: 300, rows: rowsOf.map((hs) => ({ title: "", cells: hs.flatMap((st) => VIEWS.map(([p, l]) => ({ spec: hatSpec(st), pose: p, label: l ? l : st, w: W }))) })) }));
  chunk(chunk(TOP_X, 4), 4).forEach((rowsOf, pi) => out.push({ title: `tops ${pi + 1}/3 (front, 3/4, side)`, h: 300, rows: rowsOf.map((ts) => ({ title: "", cells: ts.flatMap((st) => VIEWS.map(([p, l]) => ({ spec: topSpec(st), pose: p, label: l ? l : st, w: W }))) })) }));
  out.push({ title: "print patterns (tee front, dress 3/4, sweater side)", h: 300, rows: chunk(PATTERN_X.flatMap((pn) => { const [color, pc] = PAT_COL[pn];
    return [{ spec: { ...BASE, id: "p" + pn, top: { style: "tee", color, pattern: pn, patternColor: pc } } as KindSpec, pose: {}, label: pn, w: W },
      { spec: { ...BASE, id: "pd" + pn, hair: { style: "bob", color: "#3a2a24" }, top: { style: "dress", color, pattern: pn, patternColor: pc } } as KindSpec, pose: { view: "three" } as KPose, label: "dress", w: W },
      { spec: { ...BASE, id: "ps" + pn, top: { style: "sweater", color, pattern: pn, patternColor: pc } } as KindSpec, pose: { view: "side" } as KPose, label: "side", w: W }]; }), 14).map((cells) => ({ title: "", cells })) });
  const neckSpec = (st: NeckX): KindSpec => ({ ...BASE, id: "n" + st, top: { style: "tee", color: "#5a7fa8" }, neck: { style: st, color: NECKC[st] } }) as KindSpec;
  chunk(chunk(NECK_X, 4), 3).forEach((rowsOf, pi) => out.push({ title: `neckwear ${pi + 1}/2 (front, 3/4, side)`, h: 330, rows: rowsOf.map((ns) => ({ title: "", cells: ns.flatMap((st) => VIEWS.map(([p, l]) => ({ spec: neckSpec(st), pose: p, label: l ? l : st, w: W }))) })) }));
  const backs: TopX[] = ["cape", "supersuit", "cloak", "royal", "monk", "raincoat"];
  const walk = { view: "side", legL: 18, legR: -18, armL: -20, armR: 25 } as KPose;
  out.push({ title: "garments behind the body (capes, resting hoods) + long hems walking", h: 330, rows: [
    ...chunk(backs, 3).map((bs) => ({ title: "", cells: bs.flatMap((st) => [...VIEWS, [walk, "walk"] as [KPose, string]].map(([p, l]) => ({ spec: topSpec(st, BASE, false), pose: p, label: l ? l : st, w: 150 }))) })),
    { title: "", cells: (["robe", "kimono", "gown", "judge", "poncho", "toga", "bathrobe", "trench", "labcoat", "royal"] as TopX[]).map((st) => ({ spec: topSpec(st), pose: { view: "side", legL: 16, legR: -16 } as KPose, label: st + " walk", w: 150 })) },
  ] });
  chunk(chunk(PROP_X, 11), 4).forEach((rowsOf, pi) => out.push({ title: `held props ${pi + 1}/2 (posed)`, h: 300, rows: rowsOf.map((ps) => ({ title: "", cells: ps.map((it) => ({ spec: { ...BASE, id: "pr" + it, top: { style: "tee", color: "#7a9ab8" } } as KindSpec, pose: holdPose(it), label: it, w: 210 })) })) }));
  const plainHats: HatX[] = ["wizard", "cowboy", "knight", "hijab", "astronaut", "police", "pirate", "viking", "sombrero", "headphones", "nemes", "santa", "bunny", "flatcap"];
  const plainTops: TopX[] = ["robe", "labcoat", "hawaiian", "tank", "supersuit", "kimono", "armor", "puffer", "toga", "sailor", "tux", "cape", "gown", "varsity"];
  const plainProps: PropX[] = ["sword", "umbrella", "book", "briefcase", "torch", "mic", "trophy", "broom", "laptop", "balloon", "sign", "camera", "coffee", "shield"];
  const vw = (i: number): KPose => (i % 3 === 1 ? { view: "three" } : i % 3 === 2 ? { view: "side" } : {});
  out.push({ title: "default bobble (no brand): round head, sleeves, fists", h: 300, rows: [
    { title: "hats", cells: plainHats.map((st, i) => ({ spec: hatSpec(st, PLAIN), pose: vw(i), label: st, w: 160 })) },
    { title: "tops", cells: plainTops.map((st, i) => ({ spec: topSpec(st, PLAIN), pose: vw(i), label: st, w: 160 })) },
    { title: "props", cells: plainProps.map((it) => ({ spec: { ...PLAIN, id: "pp" + it, top: { style: "shirt", color: "#7a9ab8" } } as KindSpec, pose: holdPose(it), label: it, w: 160 })) },
    { title: "tops 3/4", cells: plainTops.map((st) => ({ spec: topSpec(st, PLAIN, false), pose: { view: "three" } as KPose, label: st, w: 160 })) },
  ] });
  return out;
}

// ---------------------------------------------------------------- prop close-ups (a stand-alone kit, hand space)
const TAU = Math.PI * 2;
function miniKit(g: CanvasRenderingContext2D, d: number): Kit {
  const ink = "#15171F", lw = Math.max(1, d * 0.038);
  const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0) => { const p = new Path2D(); p.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), rot, 0, TAU); return p; };
  const rrect = (x: number, y: number, w: number, h: number, r: number) => { const p = new Path2D(), rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)); p.moveTo(x + rr, y); p.arcTo(x + w, y, x + w, y + h, rr); p.arcTo(x + w, y + h, x, y + h, rr); p.arcTo(x, y + h, x, y, rr); p.arcTo(x, y, x + w, y, rr); p.closePath(); return p; };
  const poly = (pts: V2[], close = true) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); if (close) p.closePath(); return p; };
  const moved = (p: Path2D, dx: number, dy: number, sx = 1, sy = 1) => { const q = new Path2D(); q.addPath(p, new DOMMatrix([sx, 0, 0, sy, dx, dy])); return q; };
  return { g, ink, lw, light: -1, u: d * 3.6, side: false, three: false,
    part: (path, fill, o = {}) => { const off = o.off ?? d * 0.1; g.fillStyle = fill; g.fill(path); if (off > 0) { g.save(); g.clip(path); g.fillStyle = o.sh ?? shade(fill); g.fill(path); g.translate(-off, -off * 0.35); g.fillStyle = fill; g.fill(path); g.restore(); } if (o.stroke !== false) { g.strokeStyle = ink; g.lineWidth = o.lw ?? lw; g.stroke(path); } },
    limb: (pts, w, col) => { const p = poly(pts, false); g.lineCap = "round"; g.strokeStyle = ink; g.lineWidth = w + 2 * lw; g.stroke(p); g.strokeStyle = col; g.lineWidth = w; g.stroke(p); },
    dot: (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, Math.max(0.3, r), 0, TAU); g.fill(); },
    ell, rrect, poly, sePath: (cx, cy, rx, ry) => ell(cx, cy, rx, ry), moved, shade: (c, k) => shade(c, k), tint: (c, k) => mix(c, "#ffffff", k), mix };
}
const CloseCell: React.FC<{ item: PropX }> = ({ item }) => {
  const ref = useRef<HTMLCanvasElement>(null), S = 148, d = 54;
  useLayoutEffect(() => {
    const g = ref.current!.getContext("2d")!; g.clearRect(0, 0, S, S);
    const k = miniKit(g, d);
    g.save(); g.translate(S * 0.36, S * 0.68); g.rotate(-0.85); /* the forearm points up and to the right */
    drawPropX(k, { item, L: 1.7 * d, w: d * 0.09, d });
    g.restore();
    k.dot(S * 0.36, S * 0.68, d * 0.065, k.ink);
  }, [item]);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: S }}>
      <canvas ref={ref} width={S} height={S} style={{ width: S, height: S, background: "#f6f1e8", borderRadius: 6 }} />
      <div style={{ fontFamily: FONTS.mono, fontSize: 12, color: "#444" }}>{item}</div>
    </div>
  );
};
const PropCloseups: React.FC = () => (
  <AbsoluteFill style={{ background: "#e9e2d6", padding: 16, gap: 6 }}>
    <div style={{ fontFamily: FONTS.display, fontSize: 26, color: "#222" }}>WARDROBE · prop close-ups in hand space (forearm up-right, black disc = hand)</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{PROP_X.map((it) => <CloseCell key={it} item={it} />)}</div>
  </AbsoluteFill>
);

const N_SHEET = pages().length;
const N_PAGES = N_SHEET + 1;
const Wardrobe: React.FC = () => {
  const frame = useCurrentFrame();
  return Math.floor(frame / 30) >= N_SHEET ? <PropCloseups /> : <SheetGrid name="WARDROBE" pages={pages} />;
};
export const wardrobesheet: ProjectDef = {
  id: "wardrobesheet", title: "WARDROBE sheet", defaultFormat: "long", fps: 30,
  scenes: ({ fps }) => [{ id: "sheet", frames: N_PAGES * 30 * (fps / 30), render: () => <Wardrobe /> }],
};
