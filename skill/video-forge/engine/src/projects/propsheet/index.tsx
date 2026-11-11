/**
 * Prop sheet: look-dev for the vehicle kit (lib/three/vehicles.ts) with bobble passengers, in the real toon look.
 *   node tools/render.mjs --project propsheet --format long --stills 0,30,60,90,120,150,180 --scale 0.5
 * Pages (30 frames each): 0 all modern vehicles, front 3/4 (angle parked) | 1 the same row nose to tail, side view |
 * 2 coach + 2 horses, open carriage + 1 horse, bicycle | 3 night drive, frozen mid-turn, lights on |
 * 4 close side check (faces in windows) | 5 close front 3/4 check | 6 bus + truck close side.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import * as THREE from "three";
import { CamState, V3 } from "../../lib/camera";
import { bobbleScale, BobbleSpec, KIND_PRESETS, KPose } from "../../lib/characters/kinds";
import { resolveLook } from "../../lib/look";
import { ProjectDef } from "../../lib/project";
import { CharacterCard } from "../../lib/three/cast";
import { Stage3D, StageCtx } from "../../lib/three/Stage3D";
import { makeToonUniforms, TOON_SETUPS, toonifyScene } from "../../lib/three/shaders";
import { canvasTexture, flat } from "../../lib/three/textures";
import { bicycle, bus, car, CarBody, carriage, drive, seatPose, seatWorld, truck, Vehicle } from "../../lib/three/vehicles";
import { cloudCard, house, lampPost, lights, skyFor, stars, tree } from "../../lib/three/world";
import { FONTS } from "../../lib/two/text";

type Lights = ReturnType<typeof lights>;
type Rider = { card: CharacterCard; v: Vehicle; seat: string; h: number; expr: KPose["expr"]; extra?: KPose };
type World = { riders: Rider[]; cam: (vertical: boolean) => CamState; tick?: (f: number) => void };
const P = KIND_PRESETS as unknown as Record<string, BobbleSpec>;
const C = (pos: V3, look: V3, fov: number): CamState => ({ pos, look, fov, roll: 0, focus: Math.hypot(pos[0] - look[0], pos[1] - look[1], pos[2] - look[2]) });

function seat(scene: THREE.Scene, L: Lights, riders: Rider[], v: Vehicle, name: string, spec: string, o: { h?: number; expr?: KPose["expr"]; tex?: number; extra?: KPose } = {}) {
  const s = P[spec], h = o.h ?? (s.heightHeads && s.heightHeads < 3 ? 1.2 : 1.7);
  const card = new CharacterCard(s, h * bobbleScale(s), o.tex ?? 800, L.sun, undefined, { top: 0.1, x: 0.3 });
  card.blob.visible = false; // the contact blob would float at seat height
  scene.add(card.group);
  riders.push({ card, v, seat: name, h, expr: o.expr ?? "happy", extra: o.extra });
}

const asphalt = (len: number) => canvasTexture("propsheet-road", 512, 256, (g, r) => {
  g.fillStyle = "#5d5a66"; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 260; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"; g.fillRect(r() * 512, r() * 256, 3 + r() * 8, 2 + r() * 4); }
  g.fillStyle = "#f4efe6"; for (let x = 0; x < 512; x += 128) g.fillRect(x + 20, 122, 72, 12); // dashed centre line
  g.fillStyle = "#e8e2d6"; g.fillRect(0, 8, 512, 6); g.fillRect(0, 242, 512, 6); // edge lines
}, [len / 8, 1]);

function setDressing(scene: THREE.Scene, x0: number, x1: number, zRoad: number, night = false) {
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ map: flat.grass(night ? "#3f6a3a" : "#71b038", [50, 50]) }));
  grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; scene.add(grass);
  const len = x1 - x0 + 40;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(len, 8), new THREE.MeshLambertMaterial({ map: asphalt(len) }));
  road.rotation.x = -Math.PI / 2; road.position.set((x0 + x1) / 2, 0.01, zRoad); road.receiveShadow = true; scene.add(road);
  const walk = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 2.4), new THREE.MeshLambertMaterial({ map: flat.tiles("#d9cfc0", "#a8998a", 4, [len / 2.4, 1]) }));
  walk.position.set((x0 + x1) / 2, 0.07, zRoad - 5.2); walk.receiveShadow = true; walk.castShadow = true; scene.add(walk);
  let i = 0;
  for (let x = x0 - 6; x < x1 + 6; x += 7.5, i++) {
    const h = house({ w: 6 + (i % 3), d: 5, h: 4.5 + (i % 2) * 2.5, floors: 1 + (i % 2), seed: "ps" + i }); h.position.set(x, 0, zRoad - 11.5 - (i % 2)); scene.add(h);
    if (i % 2) { const t = tree({ seed: "pt" + i, h: 5.5 }); t.position.set(x + 3.6, 0, zRoad - 7.5); scene.add(t); }
    if (i % 3 === 0) { const lp = lampPost({ lit: night }); lp.position.set(x + 1.5, 0.14, zRoad - 4.4); lp.rotation.y = Math.PI / 2; scene.add(lp); }
  }
  if (!night) [0, 1, 2].forEach((k) => { const c = cloudCard({ seed: "psc" + k, w: 40 }); c.position.set(x0 + k * 30, 45 + k * 6, -160); scene.add(c); });
}

const LINEUP = (): [string, Vehicle, [string, string, { expr?: KPose["expr"]; h?: number }?][]][] => [
  ["bus", bus({ seed: "bus12" }), [["driver", "bbAthlete"], ["p1", "bbGirl"], ["p2", "bbGrandma"], ["p3", "bbNerd"], ["p4", "bbKid"], ["p5", "bbLady"]]],
  ["truck", truck({ load: "FRESH BREAD", seed: "trk" }), [["driver", "bbWorker"], ["passenger", "bbFarmer", { expr: "laugh" }]]],
  ["van", car({ body: "van", seed: "van" }), [["driver", "bbDoctor"], ["passenger", "bbArtist"], ["back", "bbKid"], ["back2", "bbGrandpa"]]],
  ["pickup", car({ body: "pickup", seed: "pick" }), [["driver", "bbFarmer"], ["passenger", "bbTeen"]]],
  ["sedan", car({ body: "sedan", seed: "sed" }), [["driver", "bbHero"], ["passenger", "bbGirl", { expr: "laugh" }], ["back", "bbGrandpa"]]],
  ["hatch", car({ body: "hatch", seed: "hat" }), [["driver", "bbLady"], ["passenger", "bbNerd"], ["back", "bbKid"]]],
  ["taxi", car({ body: "taxi", seed: "taxi" }), [["driver", "bbAthlete"], ["back", "bbScientist"]]],
  ["police", car({ body: "police", seed: "pol" }), [["driver", "bbCop"], ["passenger", "bbBoss", { expr: "smug" }]]],
];
function boardAll(scene: THREE.Scene, L: Lights, riders: Rider[], list: ReturnType<typeof LINEUP>, tex = 800) {
  for (const [, v, people] of list) { scene.add(v.group); for (const [s, spec, o] of people) seat(scene, L, riders, v, s, spec, { ...o, tex }); }
}

const day = (scene: THREE.Scene, target: V3, size = 40) => { skyFor(scene, "day"); return lights(scene, "day", { shadowSize: size, target, fog: [40, 260] }); };
const toon = (scene: THREE.Scene, night = false) => toonifyScene(scene, makeToonUniforms(night ? TOON_SETUPS.night : TOON_SETUPS.day, night ? 0.9 : 2.4));

const PAGES: { label: string; look: string; build: (ctx: StageCtx) => World }[] = [
  { label: "0 · modern vehicles · front 3/4", look: "toonworld-day", build: ({ scene }) => {
    const list = LINEUP(); let x = 0; const xs: number[] = [];
    list.forEach(([, v], i) => { if (i) x += (list[i - 1][1].width + v.width) / 2 / Math.SQRT1_2 + 1.0 + (v.length > 5 || list[i - 1][1].length > 5 ? 1.6 : 0); xs.push(x); });
    const cx = x / 2;
    const L = day(scene, [cx, 0, 0], 45); const riders: Rider[] = [];
    setDressing(scene, -6, x + 6, 0.5);
    list.forEach(([, v], i) => { v.group.position.set(xs[i], 0, 0); v.group.rotation.y = -Math.PI / 4; v.setDistance(i * 0.37); v.setLights(0); });
    boardAll(scene, L, riders, list);
    toon(scene);
    const hx = xs[5];
    return { riders, cam: (vert) => (vert ? C([hx + 4.5, 3.6, 10.5], [hx - 0.6, 1.15, 0], 38) : C([cx + 2, 5.5, 27.5], [cx, 1.3, -1.5], 34)) };
  } },
  { label: "1 · modern vehicles · side view", look: "toonworld-day", build: ({ scene }) => {
    const list = LINEUP(); let x = 0; const xs: number[] = [];
    list.forEach(([, v], i) => { if (i) x += (list[i - 1][1].length + v.length) / 2 + 1.3; xs.push(x); });
    const cx = x / 2, L = day(scene, [cx, 0, 0], 45), riders: Rider[] = [];
    setDressing(scene, -6, x + 6, 0.5);
    list.forEach(([, v], i) => { v.group.position.set(xs[i], 0, 1.4); v.setDistance(i * 0.37); });
    boardAll(scene, L, riders, list);
    toon(scene);
    return { riders, cam: (vert) => (vert ? C([xs[4], 1.8, 13], [xs[4], 1.3, 0], 34) : C([cx, 2.6, 50], [cx, 1.6, 0], 30)) };
  } },
  { label: "2 · coach + horses · open carriage · bicycle", look: "toonworld-day", build: ({ scene }) => {
    const L = day(scene, [0, 0, 0], 25), riders: Rider[] = [];
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ map: flat.grass("#71b038", [50, 50]) }));
    grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; scene.add(grass);
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(60, 10), new THREE.MeshLambertMaterial({ map: flat.stone("#c9b79a", "#9a8a70", [20, 3]) }));
    lane.rotation.x = -Math.PI / 2; lane.position.set(0, 0.01, -1.2); lane.receiveShadow = true; scene.add(lane);
    for (let i = 0; i < 6; i++) { const h = house({ w: 6, d: 5, h: 5 + (i % 2) * 2, floors: 1 + (i % 2), seed: "pc" + i, roof: "#4a5a7a" }); h.position.set(-16 + i * 7.5, 0, -12); scene.add(h); }
    for (let i = 0; i < 5; i++) { const t = tree({ seed: "pct" + i, h: 6 }); t.position.set(-13 + i * 7.5, 0, -7.5); scene.add(t); }
    const coach = carriage({ horses: 2, seed: "coach" }); coach.group.position.set(0, 0, 0); coach.setDistance(0.9); scene.add(coach.group);
    const open = carriage({ open: true, horses: 1, color: "#2f4a6a", horseColor: "#e9e2d6", gait: "trot", seed: "open" }); open.group.position.set(-8, 0, -1.5); open.setDistance(1.4); scene.add(open.group);
    const bike = bicycle({ color: "#e2483a" }); bike.group.position.set(-3.4, 0, 3.4); bike.setDistance(1.1); scene.add(bike.group);
    seat(scene, L, riders, coach, "driver", "bbFarmer", { tex: 1100, extra: { limbs: { handR: [0.78, 0.5], handL: [0.74, 0.46] } } as KPose });
    seat(scene, L, riders, coach, "insideL", "bbGrandma", { tex: 1100 });
    seat(scene, L, riders, coach, "inside", "bbLady", { tex: 1100, expr: "laugh" });
    seat(scene, L, riders, coach, "insideR", "bbKing", { tex: 1100 });
    seat(scene, L, riders, open, "driver", "bbRanger", { tex: 1000 });
    seat(scene, L, riders, open, "inside", "bbGent", { tex: 1000, expr: "smug" });
    seat(scene, L, riders, open, "insideR", "bbArtist", { tex: 1000 });
    seat(scene, L, riders, bike, "rider", "bbGirl", { tex: 1000, expr: "laugh" });
    toon(scene);
    return { riders, cam: (vert) => (vert ? C([6.5, 2.8, 9.5], [0.6, 1.4, -0.5], 44) : C([8.0, 3.0, 9.5], [-2.2, 1.3, -0.6], 46)) };
  } },
  { label: "3 · night drive · mid-turn", look: "toonworld-night", build: ({ scene }) => {
    skyFor(scene, "night"); stars(scene, 1500, "ps-stars");
    const L = lights(scene, "night", { shadowSize: 30, target: [0, 0, -4], fog: [20, 140] }), riders: Rider[] = [];
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ map: flat.grass("#3f6a3a", [50, 50]) }));
    grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; scene.add(grass);
    const PATH: V3[] = [[-24, 0, 6], [-10, 0, 5], [-1, 0, 1.5], [4.5, 0, -5], [6.5, 0, -14], [6, 0, -28]];
    const curve = new THREE.CatmullRomCurve3(PATH.map((p) => new THREE.Vector3(...p)), false, "centripetal");
    // road ribbon along the curve
    const N = 160, pos: number[] = [], uv: number[] = [], idx: number[] = [], Lc = curve.getLength();
    for (let i = 0; i <= N; i++) {
      const u = i / N, p = curve.getPointAt(u), t = curve.getTangentAt(u), n = new THREE.Vector3(-t.z, 0, t.x).normalize();
      for (const s of [-1, 1]) { pos.push(p.x + n.x * s * 4, 0.012, p.z + n.z * s * 4); uv.push((u * Lc) / 8, s < 0 ? 0 : 1); }
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); rg.setIndex(idx); rg.computeVertexNormals();
    const tex = asphalt(8).clone(); tex.repeat.set(1, 1); tex.needsUpdate = true;
    const road = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })); road.receiveShadow = true; scene.add(road);
    for (const [i, u] of [0.18, 0.36, 0.52, 0.7, 0.86].entries()) {
      const p = curve.getPointAt(u), t = curve.getTangentAt(u), n = new THREE.Vector3(-t.z, 0, t.x).normalize(), s = i % 2 ? 1 : -1;
      const lp = lampPost({ lit: true }); lp.position.set(p.x + n.x * s * 5, 0, p.z + n.z * s * 5); lp.rotation.y = Math.atan2(n.x * s, n.z * s) + Math.PI / 2; scene.add(lp);
      const pl = new THREE.PointLight("#ffd79a", 9, 9, 1.6); pl.position.set(p.x + n.x * s * 4.6, 3.1, p.z + n.z * s * 4.6); scene.add(pl);
    }
    for (let i = 0; i < 6; i++) { const h = house({ w: 6, d: 5, h: 5 + (i % 2) * 2.5, floors: 1 + (i % 2), seed: "pn" + i }); h.position.set(-22 + i * 7, 0, -9 - (i % 2) * 2); scene.add(h); }
    for (let i = 0; i < 5; i++) { const t = tree({ seed: "pnt" + i, h: 6 }); t.position.set(14 + (i % 2) * 3, 0, -2 - i * 6); scene.add(t); }
    const v = car({ body: "sedan", color: "#e2483a", seed: "night", realLights: true }); scene.add(v.group);
    const st = drive(v, PATH, 0.5); v.setLights(1);
    const parked = car({ body: "hatch", color: "#2fb3a6", seed: "park" }); parked.group.position.set(-9, 0, 10.3); scene.add(parked.group); parked.setLights(0);
    seat(scene, L, riders, v, "driver", "bbHero", { tex: 1100, expr: "determined" });
    seat(scene, L, riders, v, "passenger", "bbGirl", { tex: 1100, expr: "laugh" });
    seat(scene, L, riders, v, "back", "bbKid", { tex: 1000 });
    toon(scene, true);
    const f = new THREE.Vector3(Math.cos(st.heading), 0, -Math.sin(st.heading)), r = new THREE.Vector3(-f.z, 0, f.x), p0 = new THREE.Vector3(...st.pos);
    const at = (fw: number, rt: number, up: number): V3 => { const q = p0.clone().addScaledVector(f, fw).addScaledVector(r, rt); return [q.x, up, q.z]; };
    return { riders, cam: (vert) => (vert ? C(at(6.5, 4.5, 2.2), at(0, 0, 1.0), 42) : C(at(7.5, 5.5, 2.4), at(-0.5, 0, 0.95), 36)) };
  } },
  { label: "4 · close side check", look: "toonworld-day", build: ({ scene }) => {
    const list = LINEUP().filter(([k]) => ["sedan", "hatch", "taxi", "police"].includes(k)); let x = 0; const xs: number[] = [];
    list.forEach(([, v], i) => { if (i) x += (list[i - 1][1].length + v.length) / 2 + 1.0; xs.push(x); });
    const cx = x / 2, L = day(scene, [cx, 0, 0], 25), riders: Rider[] = [];
    setDressing(scene, -6, x + 6, 0.5);
    list.forEach(([, v], i) => { v.group.position.set(xs[i], 0, 1.4); v.setDistance(i * 0.5); });
    boardAll(scene, L, riders, list, 1200);
    toon(scene);
    return { riders, cam: (vert) => (vert ? C([xs[0], 1.6, 8], [xs[0], 1.15, 1.4], 36) : C([cx, 1.7, 21], [cx, 1.05, 1.4], 30)) };
  } },
  { label: "5 · close front 3/4 check", look: "toonworld-day", build: ({ scene }) => {
    const kinds: CarBody[] = ["sedan", "van", "pickup"], L = day(scene, [0, 0, -3], 25), riders: Rider[] = [];
    setDressing(scene, -15, 15, -2.5);
    const people: Record<string, [string, string][]> = { sedan: [["driver", "bbHero"], ["passenger", "bbGirl"], ["back", "bbGrandpa"]], van: [["driver", "bbDoctor"], ["passenger", "bbArtist"], ["back", "bbKid"], ["back2", "bbGrandma"]], pickup: [["driver", "bbFarmer"], ["passenger", "bbTeen"]] };
    kinds.forEach((k, i) => { const v = car({ body: k, seed: "f" + k }); v.group.position.set(-i * 1.2, 0, -i * 3.1); v.setDistance(i * 0.4); scene.add(v.group); for (const [s, spec] of people[k]) seat(scene, L, riders, v, s, spec, { tex: 1200 }); });
    toon(scene);
    return { riders, cam: (vert) => (vert ? C([7.5, 2.6, 6.5], [0, 1.15, -2.0], 46) : C([8.2, 2.7, 6.8], [-0.6, 1.1, -2.8], 40)) };
  } },
  { label: "6 · bus + truck close side", look: "toonworld-day", build: ({ scene }) => {
    const list = LINEUP().filter(([k]) => k === "bus" || k === "truck"); const xs = [0, (list[0][1].length + list[1][1].length) / 2 + 1.4];
    const cx = xs[1] / 2, L = day(scene, [cx, 0, 0], 25), riders: Rider[] = [];
    setDressing(scene, -8, xs[1] + 8, 0.5);
    list.forEach(([, v], i) => { v.group.position.set(xs[i], 0, 1.4); v.setDistance(i * 0.5); v.setLights(0); });
    boardAll(scene, L, riders, list, 1100);
    toon(scene);
    return { riders, cam: (vert) => (vert ? C([xs[0], 2.0, 11], [xs[0], 1.7, 1.4], 40) : C([cx, 2.1, 21.5], [cx, 1.6, 1.4], 32)) };
  } },
];

const Page: React.FC<{ n: number }> = ({ n }) => {
  const def = PAGES[n];
  return (
    <AbsoluteFill>
      <Stage3D look={resolveLook(def.look)} build={(ctx) => def.build(ctx)}
        update={(w, f, ctx) => {
          const cam = w.cam(ctx.height > ctx.width);
          w.tick?.(f);
          for (const r of w.riders) {
            r.card.setPose(seatPose(r.v, r.seat, cam.pos, { expr: r.expr, ...(r.extra ?? {}) }), f, ctx.fps);
            r.card.place(...seatWorld(r.v, r.seat, r.h, cam.pos), cam.pos);
          }
          return cam;
        }} />
      <div style={{ position: "absolute", left: 28, top: 22, fontFamily: FONTS.mono, fontSize: 30, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,0.7)" }}>PROP SHEET · {def.label}</div>
    </AbsoluteFill>
  );
};

export const propsheet: ProjectDef = {
  id: "propsheet", title: "Prop sheet (vehicle kit)", defaultFormat: "long", fps: 30,
  scenes: ({ fps }) => PAGES.map((_, i) => ({ id: `page${i}`, frames: Math.round(fps), render: () => <Page n={i} /> })),
};
