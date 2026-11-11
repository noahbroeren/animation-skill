/**
 * Character-kinds model sheet (lib/characters/kinds.ts): look-dev + consistency check for every new kind.
 *   node tools/render.mjs --project charsheet --format long --stills 0,40,70,100,130
 * Pages (30 frames each): 0 main kinds x expressions/visemes/side/walk, 1 style passes + walk cycles,
 * 2-3 more presets, 4 chibi 16 expressions, stick pose library + x-ray, microbes, blobs, objects.
 */
import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { CharacterSpec, Pose, walkPose } from "../../lib/characters/toon";
import { BOBBLE_POSES, BobbleSpec, Cue, drawAnyStyled, hopPose, hopWalkPose, KEXPRS, KExpr, KIND_PRESETS, KindSpec, KPose, PassSpec, STICK_POSES, walk4Pose, withSecondary } from "../../lib/characters/kinds";
import { ProjectDef } from "../../lib/project";
import { FONTS } from "../../lib/two/text";

type Spec = KindSpec | CharacterSpec;
type CellDef = { spec: Spec; pose: KPose; label: string; pass?: PassSpec; w?: number };
type RowDef = { title: string; cells: CellDef[] };
const K = KIND_PRESETS;
const BB = (Object.keys(K) as (keyof typeof K)[]).filter((k) => k.startsWith("bb"));
const BASE: BobbleSpec = { id: "base", kind: "bobble", skin: "#f6cfae", hair: { style: "cap", color: "#6a3d22" }, top: { color: "#e2483a", style: "jacket", accent: "#ffd23f" }, legs: "#2f4a7a", shoes: "#2b2230" };
const OUTFITS = ["jacket", "hoodie", "shirt", "suit", "tee", "dress", "overall", "uniform", "coat", "vest", "apron"] as const;
const HAIRS = ["cap", "side", "spiky", "curly", "long", "bob", "bun", "pony", "buzz", "bald"] as const;
const HATS = ["cap", "top", "bowler", "beanie", "hardhat", "chef", "ranger", "crown", "boater", "beret"] as const;
const HATCOL: Record<string, string> = { hardhat: "#f5c21b", chef: "#fbfaf6", ranger: "#b08a4e", crown: "#f5c21b", boater: "#f0d58a", top: "#22252e", beret: "#2b2230", bowler: "#3b2f2a" };
const PACK_POSES: KPose[] = ["wave", "cheer", "shock", "think", "hips", "point", "shrug", "phone", "neck", "carry"].map((n) => BOBBLE_POSES[n]);
const TOON: CharacterSpec = { id: "worker", style: "toonworld", skin: "#fef4ee", hair: { color: "#5b3a24", style: "short" }, top: { color: "#f08a24" }, bottom: { color: "#3a4a78" }, hat: { style: "cap", color: "#e8b923" } };

const kindOf = (s: Spec) => ("kind" in s ? s.kind : "toon");
const heads = (s: Spec) => s.heightHeads;
const wide = (s: Spec) => "kind" in s && s.kind === "critter" && s.stance === "quadruped";

/** Locomotion per kind (characters.md 4.1 table): human walk, chibi hop-walk, 4-beat quadruped, hop for objects/blobs/birds. */
function motion(s: Spec, f: number, fps: number): KPose {
  const k = kindOf(s);
  if (wide(s)) return walk4Pose(f, fps);
  if (k === "chibi") return hopWalkPose(f, fps);
  if (k === "object" || k === "blob" || (k === "flatvec" && (s as KindSpec & { form: string }).form === "bird")) return hopPose(f, fps, 2, k === "flatvec" ? 0.25 : 0.32);
  if (k === "microbe") return { lean: 6 * Math.sin((f / fps) * 4), squash: 1 + 0.06 * Math.sin((f / fps) * 8) };
  return walkPose(f, fps, k === "stick" ? 2.2 : 2.6, 1, k === "critter" ? 2.7 : 3.5) as KPose;
}
const walkAt = (s: Spec, f: number, fps: number, side: boolean): KPose => withSecondary((ff) => ({ ...motion(s, ff, fps), view: side ? "side" : "front" }), f, fps);

const Cell: React.FC<CellDef & { h: number; frame: number }> = ({ spec, pose, label, pass, w, h, frame }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const cw = w ?? Math.round(h * 0.72);
  useLayoutEffect(() => { const g = ref.current!.getContext("2d")!; drawAnyStyled(g, spec, pose, cw, h, frame, pass); }, [spec, pose, cw, h, frame, pass]);
  const k = kindOf(spec), dark = k === "flatvec", gy = h - ((h / 1.08) * 0.08) / (heads(spec) ?? 3.5);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: cw }}>
      <div style={{ position: "relative", width: cw, height: h, background: dark ? "#16213d" : "#f6f1e8", borderRadius: 6, overflow: "hidden" }}>
        {k !== "microbe" ? <div style={{ position: "absolute", left: cw * 0.18, width: cw * 0.64, top: gy - h * 0.02, height: h * 0.04, borderRadius: "50%", background: dark ? "rgba(0,0,0,0.35)" : "rgba(60,40,80,0.16)" }} /> : null}
        <canvas ref={ref} width={cw} height={h} style={{ position: "absolute", left: 0, top: 0, width: cw, height: h }} />
      </div>
      <div style={{ fontFamily: FONTS.mono, fontSize: 13, color: "#444", whiteSpace: "nowrap", overflow: "hidden", maxWidth: cw }}>{label}</div>
    </div>
  );
};

const EXPR_COLS: KExpr[] = ["neutral", "happy", "laugh", "shock", "nervous", "sad", "angry", "smug", "think", "whistle", "cry", "deadpan"];
const CUE_COLS: [Cue, string][] = [["A", "MBP"], ["B", "teeth"], ["C", "open"], ["D", "wide"], ["E", "round"], ["F", "oo/w"], ["G", "f/v"], ["H", "L/th"]];
function matrixRow(name: string, s: Spec, frame: number, fps: number): RowDef {
  const w = wide(s) ? 170 : undefined;
  const cells: CellDef[] = [
    ...EXPR_COLS.map((e) => ({ spec: s, pose: { expr: e } as KPose, label: e, w })),
    ...CUE_COLS.map(([c, l]) => ({ spec: s, pose: { cue: c } as KPose, label: `${c} ${l}`, w })),
    { spec: s, pose: { view: "side" }, label: "side", w },
    { spec: s, pose: { view: "side", cue: "D", expr: "happy" }, label: "side talk", w },
    { spec: s, pose: walkAt(s, frame + 7, fps, false), label: "walk", w },
    { spec: s, pose: walkAt(s, frame + 7, fps, true), label: "side walk", w },
  ];
  return { title: name, cells: wide(s) ? cells.filter((_, i) => i % 2 === 0 || i >= 20) : cells };
}

function pages(frame: number, fps: number): { title: string; rows: RowDef[]; h: number }[] {
  const PASSES: [string, PassSpec | undefined][] = [["normal", undefined], ["sketch", { pass: "sketch" }], ["cutout", { pass: "cutout" }], ["silhouette", { pass: "silhouette", rim: { color: "#ffd27a", widthPx: 3 } }], ["pixelize", { pass: "pixelize", heightPx: 48 }]];
  const passRow = (name: string, s: Spec, pose: KPose): CellDef[] => PASSES.map(([l, pass]) => ({ spec: s, pose, label: `${name} ${l}`, pass, w: 170 }));
  const cycle = (name: string, s: Spec, cycleF: number, side: boolean): CellDef[] => Array.from({ length: 8 }, (_, i) => ({ spec: s, pose: walkAt(s, 60 + Math.round((i * cycleF) / 8), fps, side), label: `${name} ${i + 1}/8`, w: 200 }));
  const P2 = (a: RowDef, b: CellDef[]): RowDef => ({ title: a.title, cells: [...a.cells, ...b] });
  return [
    { title: "PAGE 1 · kinds × expressions · Rhubarb cues · side · walk", h: 132, rows: [["object/cardboard", K.cardboard], ["critter/cat", K.cat], ["critter/bird", K.bird], ["blob/mochi", K.mochi], ["stick", K.stick], ["chibi/storyteller", K.storyteller], ["flatvec/bird", K.fvBird], ["microbe/virus", K.virus]].map(([n, s]) => matrixRow(n as string, s as Spec, frame, fps)) },
    { title: "PAGE 2 · style passes on any 2D canvas (incl. toon.ts) · walk / hop cycles", h: 206, rows: [
      P2({ title: "soda", cells: passRow("soda", K.soda, { expr: "happy" }) }, cycle("hop", K.soda, 15, true)),
      P2({ title: "dog", cells: passRow("dog", K.dog, { expr: "laugh" }) }, cycle("biped", K.cat, 23, true)),
      P2({ title: "chibi", cells: passRow("chibi", K.storyteller, { expr: "shock" }) }, cycle("hop-walk", K.storyteller, 25, true)),
      P2({ title: "stick", cells: passRow("stick", K.stick, STICK_POSES.point) }, cycle("stick", K.stick, 27, true)),
      P2({ title: "mochi", cells: passRow("mochi", K.mochi, { expr: "smug" }) }, cycle("4-beat", K.dog4, 19, true)),
      P2({ title: "toon", cells: passRow("toon", TOON, { expr: "happy" }) }, cycle("bird hop", K.fvBird, 15, true)),
    ] },
    { title: "PAGE 3 · more presets", h: 132, rows: [["object/soda", K.soda], ["object/house", K.house], ["object/tooth", K.tooth], ["critter/dog", K.dog], ["critter/frog", K.frog], ["critter/bear", K.bear], ["critter/mouse", K.mouse], ["critter/fox", K.fox]].map(([n, s]) => matrixRow(n as string, s as Spec, frame, fps)) },
    { title: "PAGE 4 · more presets", h: 132, rows: [["critter/rabbit", K.rabbit], ["critter/pig", K.pig], ["critter/cat4", K.cat4], ["critter/dog4", K.dog4], ["chibi/kid", K.kid], ["chibi/scientist", K.scientist], ["chibi/caricature", K.caricature], ["flatvec/person", K.fvPerson]].map(([n, s]) => matrixRow(n as string, s as Spec, frame, fps)) },
    { title: "PAGE 5 · 16 expressions · stick pose library + smear + x-ray · microbes · blobs · objects", h: 196, rows: [
      { title: "storyteller", cells: KEXPRS.map((e) => ({ spec: K.storyteller, pose: { expr: e }, label: e })) },
      { title: "caricature", cells: KEXPRS.map((e) => ({ spec: K.caricature, pose: { expr: e }, label: e })) },
      { title: "stick", cells: [...Object.entries(STICK_POSES).map(([n, p]) => ({ spec: K.stickBlue as Spec, pose: n === "punch" ? { ...p, prev: STICK_POSES.idle } : p, label: n === "punch" ? "punch+smear" : n })),
        ...["idle", "point", "cheer", "run"].map((n) => ({ spec: K.xray as Spec, pose: { ...STICK_POSES[n], view: n === "run" ? "side" : "front" } as KPose, label: `xray ${n}` })), { spec: K.stick, pose: { ...STICK_POSES.run, view: "side" }, label: "run side" }] },
      { title: "microbes", cells: (["bacterium", "cell", "rbc", "wbc", "heart", "brain", "virus"] as const).flatMap((m) => [{ spec: K[m] as Spec, pose: { expr: "happy" } as KPose, label: m }, { spec: K[m] as Spec, pose: { expr: m === "virus" ? "scheming" : "shock", cue: m === "brain" ? "D" : undefined } as KPose, label: m + " 2" }]) },
      { title: "blobs+objects", cells: [...(["sprout", "imp", "fluff"] as const).flatMap((b) => (["happy", "angry", "sad"] as KExpr[]).map((e) => ({ spec: K[b] as Spec, pose: { expr: e } as KPose, label: `${b} ${e}` }))),
        ...(["ball", "jelly", "phone", "star"] as const).flatMap((o) => (["neutral", "laugh"] as KExpr[]).map((e) => ({ spec: K[o] as Spec, pose: { expr: e, squash: e === "laugh" ? 0.8 : 1 } as KPose, label: `${o} ${e}${e === "laugh" ? " sq.8" : ""}` })))] },
    ] },
    { title: "PAGE 6 · stick cast with accessories (hat / hair / facial hair / coat / neckwear) · props · hat tip", h: 150, rows: [
      ...([["stickGent", K.stickGent], ["stickWorker", K.stickWorker], ["stickLady", K.stickLady], ["stickKid", K.stickKid], ["stickProf", K.stickProf]] as [string, Spec][]).map(([n, s]) => matrixRow(n, s, frame, fps)),
      { title: "props", cells: [
        { spec: K.stickWorker, pose: { limbs: { handR: [1.0, 3.1], handL: [0.5, 2.9] }, hold: { item: "axe", angle: -10 }, expr: "determined" }, label: "axe up" },
        { spec: K.stickWorker, pose: { limbs: { handR: [1.6, 1.2], handL: [1.1, 1.3] }, hold: { item: "axe", angle: 30 }, expr: "angry", lean: 10 }, label: "axe swing" },
        { spec: K.stickWorker, pose: { view: "side", limbs: { handR: [1.5, 1.6] }, hold: { item: "axe", angle: 70 }, expr: "determined" }, label: "axe side" },
        { spec: K.stickGent, pose: { hatLift: 0.5, hatTilt: -18, limbs: { handR: [0.6, 3.25] }, expr: "smug" }, label: "hat tip" },
        { spec: K.stickGent, pose: { limbs: { handR: [1.4, 1.0] }, hold: { item: "cane", angle: 80 }, expr: "happy" }, label: "cane" },
        { spec: { ...K.stickGent, hat: undefined } as Spec, pose: { limbs: { handR: [1.3, 2.6] }, hold: { item: "hat", hat: K.stickGent.hat }, expr: "laugh" }, label: "hat in hand" },
        { spec: K.stickKid, pose: { limbs: { handR: [1.0, 2.9] }, hold: { item: "flag", angle: -80 }, expr: "laugh" }, label: "flag" },
        { spec: K.stickProf, pose: { limbs: { handR: [1.2, 1.4] }, hold: { item: "lever", angle: -60 }, expr: "think" }, label: "lever" },
        { spec: K.stickLady, pose: { limbs: { handL: [0.9, 1.1] }, hold: { item: "bag", hand: "L" }, expr: "happy" }, label: "bag" },
        { spec: K.stickGent, pose: { ...STICK_POSES.cheer }, label: "gent cheer" },
        { spec: K.stickLady, pose: { ...STICK_POSES.shrug, view: "side" }, label: "lady side" },
        { spec: K.stickProf, pose: { ...STICK_POSES.point, view: "side" }, label: "prof point" },
      ] },
    ] },
    { title: "PAGE 7 · BOBBLE PACK · 20 characters (hair / hat silhouette + outfit shape + accent) · front · profile · a pose", h: 300, rows: [0, 1, 2, 3].map((ri) => ({ title: `pack ${ri * 5 + 1}-${ri * 5 + 5}`,
      cells: BB.slice(ri * 5, ri * 5 + 5).flatMap((n, i) => [{ spec: K[n] as Spec, pose: { expr: "happy" } as KPose, label: n.slice(2).toLowerCase(), w: 165 }, { spec: K[n] as Spec, pose: { view: "side" } as KPose, label: "side", w: 130 },
        { spec: K[n] as Spec, pose: PACK_POSES[(ri * 5 + i) % PACK_POSES.length], label: "acting", w: 178 }]) })) },
    { title: "PAGE 8 · BOBBLE · expressions · Rhubarb cues · walk · pose library · props · hat tip", h: 150, rows: [
      ...([["hero", K.bbHero], ["girl", K.bbGirl], ["grandpa", K.bbGrandpa]] as [string, Spec][]).map(([n, s]) => matrixRow(n, s, frame, fps)),
      { title: "all 16", cells: KEXPRS.map((e) => ({ spec: K.bbKid as Spec, pose: { expr: e } as KPose, label: e })) },
      { title: "poses", cells: Object.entries(BOBBLE_POSES).map(([n, p], i) => ({ spec: K[BB[(i * 3) % BB.length]] as Spec, pose: p, label: n, w: 150 })) },
      { title: "props", cells: [
        { spec: K.bbWorker, pose: { limbs: { handR: [0.6, 1.9], handL: [0.3, 1.7] }, hold: { item: "axe", angle: -10, len: 1.5 }, expr: "determined" }, label: "axe up", w: 150 },
        { spec: K.bbGent, pose: { hatLift: 0.5, hatTilt: -18, limbs: { handR: [0.5, 2.25] }, expr: "smug" }, label: "hat tip", w: 150 },
        { spec: K.bbGrandpa, pose: { limbs: { handR: [0.75, 0.1] }, hold: { item: "cane", angle: 70, len: 1.0 }, expr: "happy" }, label: "cane", w: 150 },
        { spec: K.bbKid, pose: { limbs: { handR: [1.0, 1.2] }, hold: { item: "flag", angle: -60, len: 1.3 }, expr: "laugh" }, label: "flag", w: 190 },
        { spec: K.bbLady, pose: { limbs: { handL: [0.6, 0.05] }, hold: { item: "bag", hand: "L" }, expr: "happy" }, label: "bag", w: 150 },
        { spec: K.bbHero, pose: { ...BOBBLE_POSES.run }, label: "run", w: 170 },
        { spec: K.bbBoss, pose: { ...BOBBLE_POSES.sit, expr: "smug" }, label: "sit", w: 170 },
        { spec: K.bbCop, pose: { ...BOBBLE_POSES.point, view: "side", expr: "angry" }, label: "side point", w: 170 },
        { spec: K.bbGirl, pose: { ...BOBBLE_POSES.cheer }, label: "cheer", w: 150 },
        { spec: K.bbChef, pose: { ...BOBBLE_POSES.hips, expr: "angry" }, label: "hips", w: 150 },
      ] },
    ] },
    { title: "PAGE 9 · BOBBLE AUDIT · walk cycle · head turn · hands · small props · hat tip · every outfit · every hair", h: 300, rows: [
      { title: "walk", cells: [...Array.from({ length: 8 }, (_, i) => ({ spec: K.bbHero as Spec, pose: walkAt(K.bbHero, 60 + Math.round((i * 23) / 8), fps, true), label: `side ${i + 1}/8`, w: 170 })),
        ...Array.from({ length: 6 }, (_, i) => ({ spec: K.bbGirl as Spec, pose: walkAt(K.bbGirl, 60 + Math.round((i * 23) / 6), fps, false), label: `front ${i + 1}/6`, w: 160 }))] },
      { title: "turn + hands", cells: [
        ...[-1, -0.5, 0, 0.5, 1].map((t) => ({ spec: K.bbGrandpa as Spec, pose: { turn: t, expr: "happy" } as KPose, label: `turn ${t}`, w: 150 })),
        { spec: K.bbHero, pose: { limbs: { handR: [1.15, 0.9] }, hands: { R: "point" }, turn: 0.7, expr: "determined" }, label: "point", w: 190 },
        { spec: K.bbGirl, pose: { limbs: { handR: [0.9, 1.5] }, hands: { R: "open" }, expr: "happy" }, label: "open hand", w: 170 },
        { spec: K.bbBoss, pose: { ...BOBBLE_POSES.phone }, label: "phone", w: 150 },
        { spec: K.bbNerd, pose: { limbs: { handR: [0.55, 0.75] }, hold: { item: "cup" }, expr: "happy" }, label: "cup", w: 150 },
        { spec: K.bbCop, pose: { limbs: { handR: [0.6, 0.8] }, hold: { item: "paper" }, expr: "angry", turn: 0.4 }, label: "paper", w: 150 },
        { spec: K.bbGent, pose: { hatLift: 0.45, hatTilt: -16, expr: "smug" }, label: "hat tip (auto hand)", w: 190 },
        { spec: K.bbGent, pose: { hatLift: 0.45, hatTilt: -16, expr: "smug", view: "side" }, label: "hat tip side", w: 190 },
        { spec: K.bbFarmer, pose: { hatLift: 0.3, hatTilt: -10, expr: "happy" }, label: "boater tip", w: 190 },
        { spec: K.bbKing, pose: { ...BOBBLE_POSES.point, view: "side", hands: { R: "point" }, expr: "angry" }, label: "side point", w: 190 },
      ] },
      { title: "outfits", cells: OUTFITS.flatMap((st) => [{ spec: { ...BASE, top: { ...BASE.top, style: st } } as Spec, pose: {} as KPose, label: st, w: 128 }, { spec: { ...BASE, top: { ...BASE.top, style: st } } as Spec, pose: { view: "side" } as KPose, label: "side", w: 92 }]) },
      { title: "hair", cells: HAIRS.flatMap((st) => [{ spec: { ...BASE, hair: { style: st, color: "#6a3d22" } } as Spec, pose: {} as KPose, label: st, w: 130 }, { spec: { ...BASE, hair: { style: st, color: "#6a3d22" } } as Spec, pose: { view: "side" } as KPose, label: "side", w: 104 }]) },
    ] },
    { title: "PAGE 10 · BOBBLE AUDIT · every hat (front, side, with hair) · builds · facial hair + glasses · action poses in profile", h: 300, rows: [
      { title: "hats", cells: HATS.flatMap((st) => [{ spec: { ...BASE, hat: { style: st, color: HATCOL[st] ?? "#3a3f5c" } } as Spec, pose: {} as KPose, label: st, w: 130 }, { spec: { ...BASE, hat: { style: st, color: HATCOL[st] ?? "#3a3f5c" } } as Spec, pose: { view: "side" } as KPose, label: "side", w: 104 }]) },
      { title: "hat + hair", cells: HATS.flatMap((st, i) => [{ spec: { ...BASE, hair: { style: HAIRS[(i * 3 + 4) % 9], color: "#2a2228" }, hat: { style: st, color: HATCOL[st] ?? "#3a3f5c" } } as Spec, pose: { turn: i % 2 ? 0.5 : -0.5 } as KPose, label: `${st}+${HAIRS[(i * 3 + 4) % 9]}`, w: 130 },
        { spec: { ...BASE, hair: { style: HAIRS[(i * 3 + 4) % 9], color: "#2a2228" }, hat: { style: st, color: HATCOL[st] ?? "#3a3f5c" } } as Spec, pose: { view: "side" } as KPose, label: "side", w: 104 }]) },
      { title: "builds + face", cells: [
        ...(["slim", "regular", "stout"] as const).flatMap((bd) => [{ spec: { ...BASE, build: bd } as Spec, pose: {} as KPose, label: bd, w: 140 }, { spec: { ...BASE, build: bd, heightHeads: 2.6 } as Spec, pose: {} as KPose, label: bd + " 2.6", w: 150 }]),
        { spec: { ...BASE, beard: "#6a3d22" } as Spec, pose: { expr: "laugh" }, label: "beard laugh", w: 140 }, { spec: { ...BASE, beard: "#6a3d22" } as Spec, pose: { view: "side", cue: "D" }, label: "beard side talk", w: 130 },
        { spec: { ...BASE, stache: "#2a2228", glasses: "#2b2230" } as Spec, pose: { expr: "shock" }, label: "stache+glasses shock", w: 140 }, { spec: { ...BASE, shades: "#1c1c26" } as Spec, pose: { expr: "smug" }, label: "shades", w: 140 },
        { spec: { ...BASE, shades: "#1c1c26", stache: "#2a2228" } as Spec, pose: { view: "side" }, label: "shades side", w: 130 }, { spec: { ...BASE, glasses: "#2b2230", cheeks: true } as Spec, pose: { expr: "cry" }, label: "glasses cry", w: 140 },
        { spec: { ...BASE, neck: { style: "scarf", color: "#d8344e" } } as Spec, pose: {}, label: "scarf", w: 140 }, { spec: { ...BASE, neck: { style: "scarf", color: "#d8344e" } } as Spec, pose: { view: "side" }, label: "scarf side", w: 120 },
      ] },
      { title: "profile acting", cells: [
        ...(["sit", "run", "limp"] as const).map((n, i) => ({ spec: K[BB[i * 5]] as Spec, pose: BOBBLE_POSES[n], label: n, w: 200 })),
        { spec: K.bbWorker, pose: { view: "side", limbs: { handR: [-0.35, 1.95], handL: [-0.15, 1.75] }, hold: { item: "axe", angle: -25, len: 1.45 }, lean: -10, expr: "determined" }, label: "axe wind-up", w: 240 },
        { spec: K.bbWorker, pose: { view: "side", limbs: { handR: [1.15, 0.8], handL: [0.95, 0.72] }, hold: { item: "axe", angle: 25, len: 1.45 }, lean: 14, expr: "angry" }, label: "axe strike", w: 240 },
        { spec: K.bbDoctor, pose: { view: "side", limbs: { handR: [0.7, 0.8] }, hold: { item: "paper" }, expr: "think" }, label: "paper side", w: 190 },
        { spec: K.bbTeen, pose: { view: "side", limbs: { handR: [0.35, 1.25] }, hold: { item: "phone" }, cue: "C" }, label: "phone side", w: 180 },
        { spec: K.bbGrandma, pose: { view: "side", limbs: { handR: [0.8, 0.15] }, hold: { item: "cane", angle: 75, len: 1.0 }, lean: 6 }, label: "cane side", w: 190 },
        { spec: K.bbAthlete, pose: { ...BOBBLE_POSES.run, facing: -1 }, label: "run left", w: 200 },
        { spec: K.bbKid, pose: { ...BOBBLE_POSES.cheer, squash: 1.1, bob: -0.25 }, label: "jump", w: 170 },
        { spec: K.bbChef, pose: { ...BOBBLE_POSES.facepalm }, label: "facepalm", w: 160 },
        { spec: K.bbLady, pose: { ...BOBBLE_POSES.think }, label: "think", w: 160 },
      ] },
    ] },
  ];
}

const Sheet: React.FC = () => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const all = pages(frame, fps), pg = all[Math.min(all.length - 1, Math.floor(frame / 30))];
  return (
    <AbsoluteFill style={{ background: "#e9e2d6", padding: 16, gap: 6 }}>
      <div style={{ fontFamily: FONTS.display, fontSize: 26, color: "#222" }}>CHARACTER KINDS · {pg.title}</div>
      {pg.rows.map((r) => (
        <div key={r.title} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <div style={{ width: 92, fontFamily: FONTS.mono, fontSize: 13, color: "#333", paddingTop: 8, wordBreak: "break-all" }}>{r.title}</div>
          {r.cells.map((c, i) => <Cell key={i} {...c} h={pg.h} frame={frame} />)}
        </div>
      ))}
    </AbsoluteFill>
  );
};

export const charsheet: ProjectDef = {
  id: "charsheet", title: "Character kinds sheet", defaultFormat: "long", fps: 30,
  scenes: ({ fps }) => [{ id: "sheet", frames: 10 * 30 * (fps / 30), render: () => <Sheet /> }],
};
void ({} as Pose);
