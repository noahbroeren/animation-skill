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
import { cardShade } from "./shaders";

export class CharacterCard {
  spec: CharacterSpec;
  mesh: THREE.Mesh;
  shadowCaster: THREE.Mesh;
  blob: THREE.Mesh;
  private pose: Pose = {};
  private sun?: THREE.DirectionalLight;
  private lightSide = -1;
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
    const mat = cardShade(new THREE.MeshLambertMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.layers.set(NOINK);
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.tex, alphaTest: 0.5 });
    this.shadowCaster = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
    this.shadowCaster.customDepthMaterial = depth;
    this.shadowCaster.castShadow = true;
    this.shadowCaster.layers.set(SHADOW_ONLY);
    // contact blob: soft dark ellipse under the feet, offset away from the sun (reads as "standing ON the ground")
    const blobTex = new THREE.CanvasTexture((() => { const c = document.createElement("canvas"); c.width = c.height = 128;
      const g = c.getContext("2d")!; const gr = g.createRadialGradient(64, 64, 8, 64, 64, 62);
      gr.addColorStop(0, "rgba(40,20,60,0.55)"); gr.addColorStop(1, "rgba(40,20,60,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c; })());
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(heightM * 0.45, heightM * 0.3), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, toneMapped: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.012;
    this.blob.layers.set(NOINK);
    this.blob.renderOrder = 0.5;
    this.group.add(this.mesh, this.shadowCaster, this.blob);
    if (sun) this.setSun(sun);
  }

  setSun(sun: THREE.DirectionalLight) {
    this.sun = sun;
    const d = sun.position.clone().sub(sun.target.position);
    this.sunYaw = Math.atan2(d.x, d.z);
  }

  /** Store the pose; drawn in place() once the light side relative to the camera is known. */
  setPose(p: Pose) {
    this.pose = p;
    this.draw();
  }

  private draw() {
    const p: Pose = { light: this.lightSide, ...this.pose };
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
    if (this.sun) { // which side of the card faces the sun, seen from the camera -> drawn crescent side
      const sd = this.sun.position.clone().sub(this.sun.target.position);
      this.sunYaw = Math.atan2(sd.x, sd.z); // the sun moves in lighting changes: keep the shadow caster facing it
      const toSun = sd.setY(0).normalize();
      const fwd = new THREE.Vector3(x - cp.x, 0, z - cp.z).normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const side = toSun.dot(right) >= 0 ? 1 : -1;
      if (side !== this.lightSide) { this.lightSide = side; this.draw(); }
      const off = toSun.clone().multiplyScalar(-0.18 * this.heightM);
      this.blob.position.set(off.x, 0.012, off.z);
    }
    this.mesh.rotation.set(0, Math.atan2(cp.x - x, cp.z - z), 0);
    this.shadowCaster.rotation.set(0, this.sunYaw, 0);
  }
}
