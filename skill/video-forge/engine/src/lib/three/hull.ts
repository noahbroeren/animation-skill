/**
 * Clean outlines for detailed models (1.11.2): an inverted hull (the back faces of a slightly fattened copy, drawn in ink)
 * instead of the screen-space ink pass. The ink pass finds edges in the depth / normal buffers; on a model with fine
 * geometry (seams, bevels, 5 mm strips) at video distance it breaks into dashes and shimmers from frame to frame, which
 * reads as "blurry and grainy" lines. The hull gives one solid, constant-width line round the silhouette and round every
 * part that sticks out, the way a cel-shaded render does. The model itself goes on the NOINK layer so the ink pass skips it
 * (the ink pass still masks world ink behind it by depth).
 *
 *   addHull(model, { px: 2.4 })   // after the model has loaded; px = line width in output pixels at 1440 wide
 */
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { NOINK } from "./post";

const VERT = /* glsl */ `
uniform vec2 uRes; uniform float uPx;
attribute vec3 hullNormal;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * hullNormal);
  vec4 cn = projectionMatrix * vec4(n, 0.0);
  vec2 d = cn.xy; float L = length(d); d = L > 1e-5 ? d / L : vec2(0.0);
  clip.xy += d * uPx * (uRes.x / 1440.0) * 2.0 / uRes * clip.w;
  gl_Position = clip;
}`;
const FRAG = /* glsl */ `uniform vec3 uColor; void main() { gl_FragColor = vec4(uColor, 1.0); }`;

const smoothCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
/** the same geometry with one averaged normal per position (hard edges would crack the hull open at every corner) */
function hullGeometry(src: THREE.BufferGeometry) {
  let g = smoothCache.get(src); if (g) return g;
  const pos = new THREE.BufferGeometry(); pos.setAttribute("position", src.getAttribute("position")); if (src.index) pos.setIndex(src.index);
  const merged = mergeVertices(pos, 1e-4); merged.computeVertexNormals();
  // map the merged normals back onto the original vertices (by position) so the hull shares the source's buffers
  const key = (x: number, y: number, z: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
  const mp = merged.getAttribute("position"), mn = merged.getAttribute("normal"), map = new Map<string, number>();
  for (let i = 0; i < mp.count; i++) map.set(key(mp.getX(i), mp.getY(i), mp.getZ(i)), i);
  const sp = src.getAttribute("position"), hn = new Float32Array(sp.count * 3);
  for (let i = 0; i < sp.count; i++) { const j = map.get(key(sp.getX(i), sp.getY(i), sp.getZ(i))) ?? 0; hn[i * 3] = mn.getX(j); hn[i * 3 + 1] = mn.getY(j); hn[i * 3 + 2] = mn.getZ(j); }
  g = new THREE.BufferGeometry(); g.setAttribute("position", sp); g.setAttribute("hullNormal", new THREE.BufferAttribute(hn, 3)); if (src.index) g.setIndex(src.index);
  smoothCache.set(src, g); return g;
}

export type HullOpts = { /** line width in output pixels at 1440 wide (scales with the frame) */ px?: number; color?: THREE.ColorRepresentation; /** skip meshes whose material name matches (glass, glows) */ skip?: RegExp };
const res = new THREE.Vector2();
/** give every mesh under `root` an ink hull and take it off the screen-space ink pass */
export function addHull(root: THREE.Object3D, o: HullOpts = {}) {
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide,
    uniforms: { uRes: { value: new THREE.Vector2(1440, 2560) }, uPx: { value: o.px ?? 2.4 }, uColor: { value: new THREE.Color(o.color ?? "#15171f") } } });
  const meshes: THREE.Mesh[] = []; root.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && !m.userData.hull) meshes.push(m); });
  for (const m of meshes) {
    m.layers.set(NOINK);
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (o.skip && mats.every((x) => o.skip!.test(x.name))) continue;
    const h = new THREE.Mesh(hullGeometry(m.geometry as THREE.BufferGeometry), mat); h.userData.hull = true; h.layers.set(NOINK);
    h.castShadow = false; h.receiveShadow = false; h.frustumCulled = m.frustumCulled;
    h.onBeforeRender = (r) => { r.getDrawingBufferSize(res); (mat.uniforms.uRes.value as THREE.Vector2).copy(res); };
    m.add(h);
  }
}
