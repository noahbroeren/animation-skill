/**
 * 2D character cards living in the 3D world: drawn in code, yaw-billboarded toward
 * the camera, lit by the scene (Lambert + emissive floor so they stay readable),
 * never ink-outlined by the world pass (NOINK).
 *
 * Shadows: a camera-facing card is often edge-on to the sun and casts a sliver. A
 * second, invisible card on the SHADOW_ONLY layer always faces the sun and casts the
 * full silhouette shadow ("lit like they physically exist in the world").
 */
import * as THREE from "three";
import { CharacterSpec, charCanvasSize, drawCharacter, Pose } from "../characters/toon";
import { NOINK, SHADOW_ONLY } from "./post";

export class CharacterCard {
  spec: CharacterSpec;
  mesh: THREE.Mesh;
  shadowCaster: THREE.Mesh;
  group = new THREE.Group();
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private lastKey = "";
  heightM: number;
  /** horizontal direction TOWARD the sun (set from the scene's key light) */
  sunYaw = 0;

  /** heightM: character height in metres; texPx: drawing resolution (>= 1400 for 2K, 2048 for 4K close-ups). */
  constructor(spec: CharacterSpec, heightM = 1.7, texPx = 1400, sun?: THREE.DirectionalLight) {
    this.spec = spec;
    this.heightM = heightM;
    const { w, h } = charCanvasSize(texPx);
    this.canvas = document.createElement("canvas");
    this.canvas.width = w; this.canvas.height = h;
    this.g = this.canvas.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    const hm = heightM * 1.08, wm = hm * (w / h);
    const geo = new THREE.PlaneGeometry(wm, hm);
    geo.translate(0, hm / 2 - heightM * (0.08 / (spec.heightHeads ?? 3.5)), 0); // feet exactly at y = 0
    const mat = new THREE.MeshLambertMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: new THREE.Color("#ffffff"), emissiveMap: this.tex, emissiveIntensity: 0.38 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.layers.set(NOINK);
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.tex, alphaTest: 0.5 });
    this.shadowCaster = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
    this.shadowCaster.customDepthMaterial = depth;
    this.shadowCaster.castShadow = true;
    this.shadowCaster.layers.set(SHADOW_ONLY);
    this.group.add(this.mesh, this.shadowCaster);
    if (sun) this.setSun(sun);
  }

  setSun(sun: THREE.DirectionalLight) {
    const d = sun.position.clone().sub(sun.target.position);
    this.sunYaw = Math.atan2(d.x, d.z);
  }

  /** Redraws only when the pose changed (quantised) -> cheap holds. */
  setPose(p: Pose) {
    const q = (v: number | undefined) => (v === undefined ? "" : Math.round(v * 200) / 200);
    const key = JSON.stringify(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Array.isArray(v) ? v.map(q) : typeof v === "number" ? q(v) : v])));
    if (key === this.lastKey) return;
    this.lastKey = key;
    drawCharacter(this.g, this.spec, p, this.canvas.width, this.canvas.height);
    this.tex.needsUpdate = true;
  }

  /** Place feet at (x, y, z), face the camera around Y; shadow caster faces the sun. */
  place(x: number, y: number, z: number, camPos: [number, number, number] | THREE.Vector3) {
    const cp = Array.isArray(camPos) ? new THREE.Vector3(...camPos) : camPos;
    this.group.position.set(x, y, z);
    this.mesh.rotation.set(0, Math.atan2(cp.x - x, cp.z - z), 0);
    this.shadowCaster.rotation.set(0, this.sunYaw, 0);
  }
}
