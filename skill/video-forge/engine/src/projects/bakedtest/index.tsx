/** Look-dev test for baked (Blender) sets: a few shots in each set with our cast. Stills: cues+10. */
import { Beat, Board, BoardDress, boardProject } from "../../lib/board";
import { BRANDS, StickHold } from "../../lib/characters/kinds";
import { castEntry } from "../../lib/characters/ours";
import type { BakedManifest } from "../../lib/three/baked";
import { LIGHT_KEYS, LightKey } from "../../lib/three/lightplan";
import HOME0 from "../../../public/sets/home/set.json";
import VAN from "../../../public/sets/van/van.json";

const W = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen"];
const words = W.flatMap((w, i) => [0, 1, 2, 3].map((k) => ({ word: k === 0 ? w : "and", start: i * 2 + k * 0.5, end: i * 2 + k * 0.5 + 0.4 })));
const HOME = HOME0 as unknown as BakedManifest;
const mk = (M: BakedManifest, k: string) => M.marks[k] as [number, number, number];
const keyOf = (M: BakedManifest, base: LightKey): LightKey => ({ ...base, sunDir: M.sun!.dir as [number, number, number], cookie: 0 });
const H = (item: StickHold["item"], more: Partial<StickHold> = {}): StickHold => ({ item, hand: "R", ...more });
/** a Poly Haven Shelf_01 (1.0 x 2.08 x 0.26 m, shelves every 0.277 m from 0.347) scaled to 2.3 m, filled with cardboard boxes */
const shelfOfBoxes = (x: number, z: number, seed: number): BoardDress[] => {
  const k = 2.3 / 2.08, out: BoardDress[] = [{ model: "Shelf_01", at: [x, 0, z], height: 2.3 }];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { const r = ((seed * 7 + i * 13 + j * 29) % 17) / 17;
    if (r < 0.18) continue; out.push({ model: "cardboard_box_01", at: [x - 0.36 + j * 0.36 + (r - 0.5) * 0.06, (0.347 + i * 0.277) * k + 0.012, z + 0.15], height: 0.2 + r * 0.05, ry: (r - 0.5) * 0.5 }); }
  return out;
};
const beats: Beat[] = [
  { at: 0, id: "wide", place: "home", key: keyOf(HOME, LIGHT_KEYS.day), shot: { size: "wide" }, act: { vex: { at: mk(HOME, "porch"), pose: "idle", expr: "smug", view: "front" }, dex: { at: mk(HOME, "path"), pose: { limbs: { handR: [0.25, 0.62], handL: [0.25, 0.6] }, hold: H("parcel", { len: 0.9 }) }, expr: "happy", view: "three", facing: -1 } } },
  { at: "two", id: "medium", shot: { size: "medium", on: "vex", angle: 14, side: 0.15 } },
  { at: "four", id: "full", shot: { size: "full", on: "dex", angle: -18, side: -0.2 } },
  { at: "six", id: "close", shot: { size: "close", on: "vex", angle: -10 } },
  { at: "eight", id: "gnome", shot: { size: "insert", on: mk(HOME, "gnome"), h: 0.7, angle: -12 } },
  { at: "ten", id: "street", shot: { size: "full", on: "dex", angle: 160, side: 0.2 } },
  { at: "eleven", id: "across", shot: { size: "full", on: [-1.8, 0, 4.4], angle: 22, h: 4.2 }, act: { dex: { seat: { vehicle: "van", seat: "driver" } } } },
  { at: "twelve", id: "office", place: "office", key: LIGHT_KEYS.office, shot: { size: "wide" }, act: { bigsby: { at: [-0.3, 0, -2.05], pose: { limbs: { handR: [0.42, 1.3] }, hold: H("phone") }, expr: "smug", view: "three", facing: 1 }, dex: { hide: true, seat: null } } },
  { at: "thirteen", id: "officeM", shot: { size: "medium", on: "bigsby", angle: 16, side: 0.12 } },
  { at: "fifteen", id: "depot", place: "depot", key: LIGHT_KEYS.office, shot: { size: "wide" }, act: { dex: { hide: false, at: "center", pose: "idle", expr: "worried", view: "three", facing: -1 }, bigsby: { hide: true } } },
  { at: "sixteen", id: "depotM", shot: { size: "medium", on: "dex", angle: -14, side: -0.15 } },
];
const board: Board = { id: "bakedtest", title: "baked set test", words, brand: BRANDS.ours, voOffset: 0, tail: 0.4,
  cast: { vex: castEntry("vex"), dex: castEntry("courier"), bigsby: castEntry("bigsby") },
  places: {
    home: { set: "baked", baked: { dir: "sets/home", manifest: HOME }, vehicles: { van: { kind: "glb", opts: { url: "sets/van/van.glb", ...VAN }, path: [[-9, 0, 4.4], [-2.4, 0, 4.4]], from: "street", to: "across", ease: "stop" } },
      look: { grade: { saturation: 1.06, contrast: 1.06, vibrance: 0.04 } } },
    // the mix: our own inked engine rooms, dressed with real (Poly Haven CC0) models that take the same cel shading
    office: { set: "office", opts: { era: "modern" }, dress: [
      { model: "potted_plant_02", at: [-2.15, 0, -2.95], height: 1.35 },
      { model: "metal_trash_can", at: [2.05, 0, -1.75], height: 0.5 },
      { model: "cardboard_box_01", at: [2.55, 0, -0.55], height: 0.5, ry: 0.3 },
      { model: "cardboard_box_01", at: [2.5, 0.5, -0.5], height: 0.38, ry: -0.2 },
      { model: "planter_box_01", at: [-1.3, 0, -2.95], height: 0.45 } ] },
    depot: { set: "workshop", opts: { garage: true }, dress: [
      ...shelfOfBoxes(0.9, -3.4, 1), ...shelfOfBoxes(2.1, -3.4, 2), ...shelfOfBoxes(3.3, -3.4, 3),
      { model: "cardboard_box_01", at: [0.6, 0, -2.5], height: 0.55, ry: 0.2 },
      { model: "cardboard_box_01", at: [1.25, 0, -2.45], height: 0.45, ry: -0.3 },
      { model: "cardboard_box_01", at: [0.85, 0.55, -2.5], height: 0.4, ry: 0.5 },
      { model: "hand_truck", at: [2.7, 0, 0.7], height: 1.25, ry: -0.6 },
      { model: "plastic_crate_01", at: [-3.5, 0, 1.2], height: 0.36 },
      { model: "plastic_crate_01", at: [-3.45, 0.36, 1.2], height: 0.36, ry: 0.2 },
      { model: "metal_trash_can", at: [-3.9, 0, -0.9], height: 0.75 } ] },
  }, beats };
export const bakedtest = boardProject(board);
