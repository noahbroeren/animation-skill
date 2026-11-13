/**
 * A vehicle modelled in Blender (tools/blender/build_set.py --set van): a GLB with the body and four wheel objects
 * named WHEEL_FL / WHEEL_FR / WHEEL_RL / WHEEL_RR (origin at the hub, axle along engine z, forward = +x).
 * It behaves like the engine's own vehicles (drive(), seats, setLights), so a board uses it as
 *   vehicles: { van: { kind: "glb", opts: VAN_SPEC, path: [...], from: "...", to: "..." } }
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { NOINK } from "./post";
import { staticFile } from "remotion";
import type { StageCtx } from "./Stage3D";
import type { Seat, Vehicle } from "./vehicles";
import { toonifyMaterial, ToonUniforms } from "./shaders";

export type GlbVehicleSpec = {
  /** public-relative path of the GLB */
  url: string; length: number; width: number; height: number; wheelR: number; wheelBase: number;
  seats: Record<string, Seat>;
  /** ambient occlusion baked in Blender per object (UV1), public-relative to the GLB's folder */
  ao?: Record<string, string>;
  /** "toon" (default on a board): cel-shaded and inked like the world, so a detailed model blends in with the
   *  engine's style; "pbr": physically shaded with a room reflection and no ink (for baked, realistic sets) */
  look?: "toon" | "pbr";
  /** filled by the board with the light plan's toon uniforms once the world is built */
  toonRef?: { toon?: ToonUniforms };
};
let envTex: THREE.Texture | null = null;
const envOf = (r: THREE.WebGLRenderer) => { if (!envTex) { const pm = new THREE.PMREMGenerator(r); envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture; } return envTex; };
const texLoader = new THREE.TextureLoader();
const loader = new GLTFLoader(), cache = new Map<string, Promise<THREE.Group>>();
const load = (u: string) => { let p = cache.get(u); if (!p) { p = new Promise<THREE.Group>((res, rej) => loader.load(u, (g) => res(g.scene as unknown as THREE.Group), undefined, rej)); cache.set(u, p); } return p; };

export function glbVehicle(ctx: StageCtx, s: GlbVehicleSpec): Vehicle {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const wheels: { o: THREE.Object3D; front: boolean; base: THREE.Quaternion }[] = [], lenses: THREE.MeshStandardMaterial[] = [];
  let steer = 0, dist = 0;
  const pose = () => { for (const w of wheels) { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -dist / s.wheelR);
    if (w.front) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), steer)); w.o.quaternion.copy(w.base).premultiply(q); } };
  const dir = s.url.replace(/[^/]+$/, "");
  const aoP = Promise.all(Object.entries(s.ao ?? {}).map(([k, f]) => new Promise<[string, THREE.Texture]>((res, rej) => texLoader.load(staticFile(dir + f), (t) => { t.flipY = false; t.channel = 1; t.colorSpace = THREE.NoColorSpace; res([k, t]); }, undefined, rej))));
  ctx.wait(Promise.all([load(staticFile(s.url)), aoP]).then(([src, aos]) => {
    const m = src.clone(true), ao = new Map(aos), env = envOf(ctx.renderer), toon = (s.look ?? "toon") === "toon";
    m.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (/^WHEEL_/.test(c.name)) wheels.push({ o: c, front: /^WHEEL_F/.test(c.name), base: c.quaternion.clone() });
      if (!mesh.isMesh) return;
      mesh.castShadow = true; mesh.receiveShadow = true;
      const mt0 = mesh.material as THREE.MeshStandardMaterial, mt = mt0.clone(); mesh.material = mt;
      if (toon) { mt.metalness = 0; mt.roughness = 1; if (s.toonRef?.toon) toonifyMaterial(mt, s.toonRef.toon); }
      else { mesh.layers.set(NOINK); mt.envMap = env; mt.envMapIntensity = 0.55; } /* pbr: modelled like the baked sets, no screen-space ink */
      const a = ao.get(c.name) ?? ao.get(c.parent?.name ?? ""); if (a) { mt.aoMap = a; mt.aoMapIntensity = 1; }
      if (mt && /lens|lamp|light/i.test(mt.name)) { /* cloned from the untouched material: a clone of a patched one loses its shader patch */
        const k = mt0.clone(); if (toon) { k.metalness = 0; k.roughness = 1; } else { k.envMap = env; k.envMapIntensity = 0.55; } k.aoMap = mt.aoMap;
        k.emissive = k.color.clone(); k.emissiveIntensity = 0; if (toon && s.toonRef?.toon) toonifyMaterial(k, s.toonRef.toon); mesh.material = k; lenses.push(k); }
    });
    body.add(m); pose();
  }));
  return {
    group: root, body, seats: s.seats, length: s.length, width: s.width, height: s.height, wheelR: s.wheelR, kind: "glb", wheelBase: s.wheelBase,
    setDistance(d) { dist = d; pose(); },
    setLights(k) { for (const l of lenses) l.emissiveIntensity = 2.2 * Math.max(0, Math.min(1, k)); },
    setBody(b, p = 0, r = 0) { body.position.y = b; body.rotation.set(r, 0, p); },
    setSteer(a) { steer = a; pose(); },
  };
}
