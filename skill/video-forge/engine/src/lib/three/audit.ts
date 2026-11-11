/**
 * Shot audit (1.3): catches framing errors from the camera's own point of view, at render time.
 *
 * Learned on the elevator proof short, where every one of these slipped through until a human looked at the stills:
 *   - a foreground post hid the axe helper (occlusion)
 *   - background crowd cards stood between the camera and the hero crowd (occlusion by a CARD: alpha-tested)
 *   - a street tree filled the first frame of a place change (occlusion)
 *   - a crane shot aimed at an empty lot instead of the building (subject out of frame)
 *   - a 9:16 close-up was framed 2x too tight (subject at the frame edge / too big)
 *
 * Usage: give Stage3D an `audit={(f, world) => subjects | null}` callback (return subjects only on the frames you want
 * checked, e.g. each camera key's arrival). Problems are logged as `[video-forge][shot-audit] ...`; tools/render.mjs
 * prints them and appends them to <out>/shot_audit.log.
 */
import * as THREE from "three";
import { SHADOW_ONLY } from "./post";

export type ShotSubject = {
  name: string;
  /** a point on the subject (e.g. a character's chest), world metres */
  at: [number, number, number];
  /** subject radius in metres (half its height for a character); used for size + the occlusion margin */
  r?: number;
  /** min / max share of the frame height the subject should fill (default 0.06 .. 0.95) */
  minFrac?: number; maxFrac?: number;
  /** fraction of the frame kept clear at each edge (default 0.06): closer than that = "at the frame edge" */
  edge?: number;
};

const ray = new THREE.Raycaster();
const tmp = new THREE.Vector3();

/** True when the hit lands on a transparent texel of a canvas-textured card (CharacterCard / FX sprite). */
function transparentTexel(hit: THREE.Intersection): boolean {
  const m = (hit.object as THREE.Mesh).material as THREE.MeshBasicMaterial | THREE.MeshBasicMaterial[];
  const mat = Array.isArray(m) ? m[0] : m;
  if (!mat) return false;
  if (mat.transparent && (mat.opacity ?? 1) < 0.5) return true;
  const img = mat.map?.image as HTMLCanvasElement | undefined;
  if (!img || !hit.uv || typeof (img as HTMLCanvasElement).getContext !== "function") return false;
  const g = img.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings);
  if (!g) return false;
  const x = Math.min(img.width - 1, Math.max(0, Math.floor(hit.uv.x * img.width)));
  const y = Math.min(img.height - 1, Math.max(0, Math.floor((1 - hit.uv.y) * img.height)));
  return g.getImageData(x, y, 1, 1).data[3] < 128;
}

const describe = (o: THREE.Object3D) => {
  const p = o.getWorldPosition(tmp);
  const geo = (o as THREE.Mesh).geometry?.type?.replace("Geometry", "") ?? o.type;
  return `${o.name || (o.userData.faceCamera ? "card" : geo)} @ [${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}]`;
};

/** Check each subject against the current camera: in frame, not at the edge, sensible size, and not occluded. */
/** visible including every ancestor (1.7: a hidden prop group, or a set that is switched off, is not an occluder) */
const shown = (o: THREE.Object3D | null): boolean => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };

export function auditView(scene: THREE.Scene, camera: THREE.PerspectiveCamera, subjects: ShotSubject[]): string[] {
  const out: string[] = [];
  camera.updateMatrixWorld(true);
  const tanV = Math.tan((camera.fov * Math.PI) / 360);
  for (const s of subjects) {
    const P = new THREE.Vector3(...s.at), r = s.r ?? 0.8;
    const ndc = P.clone().project(camera);
    const toP = P.clone().sub(camera.position), dist = toP.length();
    const forward = new THREE.Vector3(); camera.getWorldDirection(forward);
    if (toP.dot(forward) <= 0 || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) { out.push(`"${s.name}" is OUT OF FRAME (ndc ${ndc.x.toFixed(2)}, ${ndc.y.toFixed(2)})`); continue; }
    const edge = 1 - 2 * (s.edge ?? 0.06);
    if (Math.abs(ndc.x) > edge || Math.abs(ndc.y) > edge) out.push(`"${s.name}" sits at the frame edge (ndc ${ndc.x.toFixed(2)}, ${ndc.y.toFixed(2)})`);
    const frac = (2 * r) / (2 * dist * tanV);
    if (frac < (s.minFrac ?? 0.06)) out.push(`"${s.name}" is tiny: ${(frac * 100).toFixed(0)} % of the frame height`);
    if (frac > (s.maxFrac ?? 0.95)) out.push(`"${s.name}" overfills the frame: ${(frac * 100).toFixed(0)} % of its height`);
    // occlusion: rays to the centre and to the top of the subject; ignore the subject's own card (hits near the subject)
    for (const pt of [P, P.clone().add(new THREE.Vector3(0, r * 0.8, 0))]) {
      const dir = pt.clone().sub(camera.position), d = dir.length();
      ray.set(camera.position, dir.normalize());
      ray.near = camera.near; ray.far = Math.max(0, d - Math.max(0.25, r * 0.5));
      ray.layers.enableAll(); ray.layers.disable(SHADOW_ONLY);
      const hits = ray.intersectObjects(scene.children, true).filter((h) => (h.object as THREE.Mesh).isMesh && shown(h.object)
        && !h.object.userData.auditIgnore && !transparentTexel(h));
      if (hits.length) { out.push(`"${s.name}" is OCCLUDED by ${describe(hits[0].object)} at ${hits[0].distance.toFixed(1)} m (subject at ${d.toFixed(1)} m)`); break; }
    }
  }
  return out;
}

const _inv = new THREE.Matrix4(), _p = new THREE.Vector3();
/**
 * Camera collision check (1.5): is the camera INSIDE a solid box (a house, a wall, a slab)? Learned on the elevator
 * short: a crane move drifted 1.6 m backwards into the house across the street; back faces are culled, so nothing
 * looked wrong on the key frames, but its roof and floors swept through 4 frames as flat slabs and `vfa qa` flagged an
 * unexpected cut. Runs on EVERY frame (also during travels). Boxes smaller than 0.6 m and `auditIgnore` meshes are skipped.
 */
export function cameraInside(scene: THREE.Scene, camera: THREE.PerspectiveCamera, margin = 0.05): string[] {
  const out: string[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !shown(m) || m.userData.auditIgnore || m.geometry?.type !== "BoxGeometry") return;
    const g = m.geometry as THREE.BoxGeometry, P = g.parameters;
    if (Math.max(P.width, P.height, P.depth) < 0.6 || Math.min(P.width, P.height, P.depth) < 0.25) return;
    _p.copy(camera.position).applyMatrix4(_inv.copy(m.matrixWorld).invert());
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox!;
    if (_p.x > b.min.x - margin && _p.x < b.max.x + margin && _p.y > b.min.y - margin && _p.y < b.max.y + margin && _p.z > b.min.z - margin && _p.z < b.max.z + margin)
      out.push(`camera is INSIDE ${describe(m)} (a ${P.width.toFixed(1)} x ${P.height.toFixed(1)} x ${P.depth.toFixed(1)} m box)`);
  });
  return out;
}
