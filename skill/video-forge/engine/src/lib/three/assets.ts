/**
 * Real assets in the world (CC0 Poly Haven / Kenney / your own GLTFs), deterministic and render-safe.
 *
 *   const barrel = await-free: loadModel(ctx, staticFile("assets/polyhaven/models/wine_barrel_01/wine_barrel_01_1k.gltf"),
 *                              { height: 1.1, toon: world.toonUniforms, castShadow: true })
 *   // loadModel returns a Group immediately; the mesh is filled in when the file arrives. Stage3D waits
 *   // (ctx.wait) and re-draws the frame before Remotion captures it.
 *
 * Download assets with tools/fetch-assets.mjs (credits recorded in public/assets/CREDITS.json).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { StageCtx } from "./Stage3D";
import { toonifyMaterial, ToonUniforms } from "./shaders";

const cache = new Map<string, Promise<THREE.Group>>();
const loader = new GLTFLoader();

function loadOnce(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = new Promise<THREE.Group>((res, rej) => loader.load(url, (g) => res(g.scene as unknown as THREE.Group), undefined, rej));
    cache.set(url, p);
  }
  return p;
}

export type ModelOpts = {
  height?: number; // normalise the model's bounding-box height to this (metres)
  toon?: ToonUniforms; // give it the painted cel shading of the world (and ink, which applies to all world meshes)
  castShadow?: boolean; receiveShadow?: boolean;
  recolor?: Record<string, string>; // material name -> colour (Kenney-style palettes)
  groundAlign?: boolean; // put the bottom at y = 0 (default true)
};

export function loadModel(ctx: StageCtx, url: string, o: ModelOpts = {}): THREE.Group {
  const holder = new THREE.Group();
  ctx.wait(loadOnce(url).then((src) => {
    const m = src.clone(true);
    m.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = o.castShadow ?? true;
      mesh.receiveShadow = o.receiveShadow ?? true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mt, i) => {
        let mat = mt as THREE.MeshStandardMaterial;
        if (o.recolor?.[mat.name]) { mat = mat.clone(); mat.color.set(o.recolor[mat.name]); if (Array.isArray(mesh.material)) mesh.material[i] = mat; else mesh.material = mat; }
        if (o.toon) toonifyMaterial(mat, o.toon);
      });
    });
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    if (o.height && size.y > 0) m.scale.multiplyScalar(o.height / size.y);
    if (o.groundAlign !== false) { const b2 = new THREE.Box3().setFromObject(m); m.position.y -= b2.min.y; }
    holder.add(m);
  }));
  return holder;
}
