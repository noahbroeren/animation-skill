/**
 * Baked sets (1.11): worlds built in Blender by tools/blender/build_set.py, their light baked with Cycles.
 *
 *   places: { home: { set: "baked", baked: { dir: "sets/home", manifest: HOME } } }   // import HOME from "../../../public/sets/home/set.json"
 *
 * Every baked mesh is drawn as albedo x lightmap (MeshBasicMaterial with the lightmap on UV1): direct sun, sky and
 * bounce light, soft shadows and contact AO exactly as Cycles computed them, at no cost per frame. RT_* meshes (grass,
 * things that move) keep their PBR material and the engine's lights; FLOOR_* meshes get a shadow catcher so the
 * cards' and props' real-time shadows land on them. Marks, the establishing camera and the camera box come from the
 * manifest, synchronously, so the storyboard can plan before the GLB has loaded.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { staticFile } from "remotion";
import type { StageCtx } from "./Stage3D";
import { NOINK } from "./post";
import type { SetInstance } from "./sets";

type V3 = [number, number, number];
export type BakedManifest = {
  set: string; glb: string; lmScale: number; lightmaps: Record<string, string>; marks: Record<string, number[]>;
  floors: string[]; realtime: string[]; wide: { pos: number[]; look: number[]; fov: number };
  camBox: { min: number[]; max: number[] }; interior: boolean; radius: number;
  sun?: { dir: number[]; color: string; energy: number };
  /** "agx": the lightmaps hold raw Cycles irradiance and each baked material applies Blender's AgX view transform itself
   *  (the cards keep their own flat colours: no global tone map) */
  tonemap?: "agx";
};
export type BakedOpts = {
  /** folder under public/ that holds set.glb, set.json and lm/ */
  dir: string; manifest: BakedManifest;
  /** brightness of the baked light (1 = as Cycles rendered it) */
  exposure?: number;
  /** shadow-catcher opacity on FLOOR_* meshes (0 = off) */
  shadow?: number;
  /** the world-space ink outline on this set (default false: the baked look has its own contact shading) */
  ink?: boolean;
};

/** Blender's AgX view transform (the Filament fit three.js uses), returning linear values: the baked world gets the
 *  same tone curve as its Cycles preview while the cards keep their flat colours. */
const AGX = `
vec3 bakedAgxContrast( vec3 x ) { vec3 x2 = x * x; vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; }
vec3 bakedAgX( vec3 c ) {
  const mat3 ins = mat3( vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ), vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ), vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 ) );
  const mat3 outs = mat3( vec3( 1.1271005818144368, -0.1413297634984383, -0.14132976349843826 ), vec3( -0.11060664309660323, 1.157823702216272, -0.11060664309660294 ), vec3( -0.016493938717834573, -0.016493938717834257, 1.2519364065950405 ) );
  c = ins * c; c = max( c, 1e-10 ); c = log2( c ); c = clamp( ( c + 12.47393 ) / ( 4.026069 + 12.47393 ), 0.0, 1.0 );
  c = bakedAgxContrast( c ); c = outs * c; c = pow( max( vec3( 0.0 ), c ), vec3( 2.2 ) ); return clamp( c, 0.0, 1.0 ); }
`;
const gltf = new GLTFLoader(), texLoader = new THREE.TextureLoader();
const cache = new Map<string, Promise<THREE.Group>>();
const loadGlb = (url: string) => { let p = cache.get(url); if (!p) { p = new Promise<THREE.Group>((res, rej) => gltf.load(url, (g) => res(g.scene as unknown as THREE.Group), undefined, rej)); cache.set(url, p); } return p; };
const lmCache = new Map<string, Promise<THREE.Texture>>();
const loadLm = (url: string) => { let p = lmCache.get(url); if (!p) { p = new Promise<THREE.Texture>((res, rej) => texLoader.load(url, (t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.channel = 1; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; res(t); } /* no mipmaps: a mip mixes the lit islands with the empty atlas and darkens floors seen at a grazing angle */, undefined, rej)); lmCache.set(url, p); } return p; };

export function bakedSet(ctx: StageCtx, o: BakedOpts, origin: V3 = [0, 0, 0]): SetInstance {
  const m = o.manifest, g = new THREE.Group(), off = (p: number[]): V3 => [p[0] + origin[0], p[1] + origin[1], p[2] + origin[2]];
  g.position.set(...origin);
  const intensity = m.lmScale * (o.exposure ?? 1), basics: THREE.MeshBasicMaterial[] = [];
  ctx.wait((async () => {
    const [src, lms] = await Promise.all([loadGlb(staticFile(`${o.dir}/${m.glb}`)), Promise.all(Object.entries(m.lightmaps).map(async ([k, f]) => [k, await loadLm(staticFile(`${o.dir}/${f}`))] as const))]);
    const lm = new Map(lms), scene = src.clone(true), floors: THREE.Mesh[] = [];
    scene.traverse((c) => {
      const mesh = c as THREE.Mesh; if (!mesh.isMesh) return;
      const name = mesh.name, map = lm.get(name) ?? lm.get(mesh.parent?.name ?? "");
      const std = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      if (map) {
        const b = new THREE.MeshBasicMaterial({ map: std.map ?? null, color: std.color ?? new THREE.Color(1, 1, 1), lightMap: map, lightMapIntensity: intensity,
          transparent: std.transparent, alphaTest: std.alphaTest || (std.transparent ? 0.5 : 0), side: std.side, fog: true });
        if (std.emissive && std.emissiveIntensity > 0 && (std.emissive.r + std.emissive.g + std.emissive.b) > 0.01) { b.color.copy(std.emissive).multiplyScalar(std.emissiveIntensity * 2); b.lightMap = null; }
        if (m.tonemap === "agx") { b.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("void main() {", AGX + "void main() {").replace("#include <opaque_fragment>", "outgoingLight = bakedAgX( outgoingLight );\n#include <opaque_fragment>"); }; b.customProgramCacheKey = () => "bakedAgx"; }
        mesh.material = b; basics.push(b);
        mesh.castShadow = false; mesh.receiveShadow = false;
      } else { mesh.castShadow = true; mesh.receiveShadow = true; }
      if (!o.ink) mesh.layers.set(NOINK); /* the baked look carries its own contact shading: no screen-space ink or AO */
      if (name.startsWith("FLOOR_")) floors.push(mesh);
    });
    // shadow catchers: the cards' and props' real-time shadows on the baked floors
    const sh = o.shadow ?? 0.32;
    if (sh > 0) for (const f of floors) { const c = new THREE.Mesh(f.geometry, new THREE.ShadowMaterial({ opacity: sh, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      c.receiveShadow = true; c.castShadow = false; c.userData.auditIgnore = true; c.layers.set(NOINK); c.position.copy(f.position); c.quaternion.copy(f.quaternion); c.scale.copy(f.scale); f.parent?.add(c); }
    g.add(scene);
  })());
  let night = 0;
  return {
    name: "street", group: g, marks: Object.fromEntries(Object.entries(m.marks).map(([k, v]) => [k, off(v)])),
    wide: { pos: off(m.wide.pos), look: off(m.wide.look), fov: m.wide.fov }, camBox: { min: off(m.camBox.min), max: off(m.camBox.max) },
    radius: m.radius, interior: m.interior, crowdSpots: [],
    setNight(n) { night = n; for (const b of basics) b.lightMapIntensity = intensity * (1 - 0.72 * n); },
    setSky() { /* the sky is baked into the lightmaps */ },
    update() { void night; },
  };
}
