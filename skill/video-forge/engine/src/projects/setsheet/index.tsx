/**
 * Set sheet (1.7): every ready-made set (lib/three/sets.ts) from its establishing camera, by day and by night, with
 * bobble characters on a few marks for scale. One world, sets 160 m apart, one light plan (lib/three/lightplan.ts).
 *   node tools/render.mjs --project setsheet --format short --stills 0,30,60,90,120,150,180,210,240,270,300,330,360,390,420,450 --scale 0.5
 * Pages of 30 frames: 0-7 day (street, alley, road, yard, shop, workshop, office, hall), 8-15 the same at night,
 * 16-17 rain with the wet-ground reflection (street by day, alley at night): stills 480, 510.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BOBBLE_POSES, bobbleScale, BobbleSpec, KIND_PRESETS, KPose } from "../../lib/characters/kinds";
import { ProjectDef } from "../../lib/project";
import { CharacterCard } from "../../lib/three/cast";
import { lightPlan } from "../../lib/three/lightplan";
import { buildSet, SetInstance, SetName, SetOpts } from "../../lib/three/sets";
import { Stage3D } from "../../lib/three/Stage3D";
import { rain, wetGround } from "../../lib/three/weather";
import { FONTS, useU } from "../../lib/two/text";

const PAGE = 30;
const SHEET: { set: SetName; opts: SetOpts; day: string; night: string; who: [string, string, string][] }[] = [
  { set: "street", opts: { era: "old" }, day: "day", night: "night", who: [["bbGent", "center", "hips"], ["bbFarmer", "shop2", "wave"], ["bbGrandma", "left", "think"]] },
  { set: "alley", opts: { era: "old" }, day: "overcast", night: "nightPractical", who: [["bbGent", "center", "point"], ["bbHero", "door", "shock"]] },
  { set: "road", opts: { era: "modern" }, day: "morning", night: "dusk", who: [["bbHero", "roadside", "wave"], ["bbFarmer", "verge", "hips"]] },
  { set: "yard", opts: { pool: true }, day: "day", night: "golden", who: [["bbHero", "poolside", "cheer"], ["bbGrandma", "lawn", "wave"], ["bbGent", "pool", "shock"]] },
  { set: "shop", opts: { era: "old", title: "GOLDSMITH" }, day: "interiorWarm", night: "nightPractical", who: [["bbGent", "keeper", "hips"], ["bbFarmer", "customer", "point"]] },
  { set: "workshop", opts: { era: "old" }, day: "interiorWarm", night: "nightPractical", who: [["bbFarmer", "bench", "think"], ["bbGent", "visitor", "shrug"]] },
  { set: "office", opts: { era: "modern" }, day: "office", night: "nightPractical", who: [["bbGent", "desk", "think"], ["bbHero", "guest", "shrug"]] },
  { set: "hall", opts: { era: "old" }, day: "interiorWarm", night: "dusk", who: [["bbGent", "stage", "cheer"], ["bbHero", "left", "wave"], ["bbGrandma", "right", "shock"]] },
];
const N = SHEET.length;
const PAGES = 2 * N + 2;
const LP = lightPlan([...SHEET.map((s, i) => [i * PAGE, s.day] as [number, string]), ...SHEET.map((s, i) => [(N + i) * PAGE, s.night] as [number, string]), [2 * N * PAGE, "rain"], [(2 * N + 1) * PAGE, "nightPractical"]], { fade: 1 });

const Sheet: React.FC = () => (
  <Stage3D look={LP.look}
    build={({ scene }) => {
      const L = LP.build(scene, { shadowSize: 46 });
      const sets: SetInstance[] = SHEET.map((s, i) => { const inst = buildSet(s.set, s.opts, [i * 160, 0, 0]); scene.add(inst.group); return inst; });
      const cards = SHEET.map((s, i) => s.who.map(([preset, mark, pose]) => {
        const spec = KIND_PRESETS[preset as keyof typeof KIND_PRESETS] as BobbleSpec;
        const c = new CharacterCard(spec, 1.72 * bobbleScale(spec), 1100, L.sun, undefined, { top: 0.3, x: 0.4 }); scene.add(c.group);
        return { c, at: sets[i].marks[mark], pose: BOBBLE_POSES[pose] as KPose };
      }));
      LP.toonify(scene);
      const R = rain(scene), wet = [0, 1].map((i) => { const w = wetGround(i ? 8 : 70, i ? 30 : 16, { puddles: 0.45 }); w.mesh.position.set(i * 160, i ? 0.02 : 0.03, i ? -3 : 0); scene.add(w.mesh); return w; });
      return { sets, cards, R, wet };
    }}
    update={(w, f, { fps }) => {
      const page = Math.min(PAGES - 1, Math.floor(f / PAGE)), wetPage = page >= 2 * N, i = wetPage ? page - 2 * N : page % N, s = w.sets[i];
      const u = LP.update(f, fps, { target: [i * 160, 0, 0] });
      w.sets.forEach((x) => { x.setNight(u.practicals); x.setSky(u.skyTop, u.skyHorizon); x.update(f, fps); });
      const cam = { pos: s.wide.pos, look: s.wide.look, fov: s.wide.fov, roll: 0, focus: 9 };
      w.R.update(f, fps, s.marks.center, wetPage ? 1 : 0); w.wet.forEach((x, k) => x.update(f, fps, wetPage && k === i ? 1 : 0));
      w.cards.forEach((row, k) => row.forEach(({ c, at, pose }) => { c.group.visible = k === i; if (k === i) { c.setPose(pose, f, fps); c.place(at[0], at[1], at[2], cam.pos); } }));
      return cam;
    }} />
);
const Label: React.FC = () => {
  const f = useCurrentFrame(), { u } = useU(), page = Math.min(PAGES - 1, Math.floor(f / PAGE)), s = SHEET[page >= 2 * N ? page - 2 * N : page % N];
  return <AbsoluteFill><div style={{ position: "absolute", left: 30 * u, top: 30 * u, padding: `${8 * u}px ${18 * u}px`, background: "rgba(20,12,16,0.78)", color: "#fff", fontFamily: FONTS.heavy, fontSize: 34 * u, borderRadius: 12 * u }}>
    {s.set} · {page >= 2 * N ? (page === 2 * N ? "rain" : "nightPractical + rain") : page < N ? s.day : s.night}</div></AbsoluteFill>;
};
export const setsheet: ProjectDef = {
  id: "setsheet", title: "Set sheet", defaultFormat: "short", fps: 30,
  scenes: () => [{ id: "sets", frames: PAGES * PAGE, innerCuts: Array.from({ length: PAGES - 1 }, (_, i) => (i + 1) * PAGE), render: () => <><Sheet /><Label /></> }],
};
