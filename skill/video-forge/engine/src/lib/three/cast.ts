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
import { CharacterSpec, charCanvasSize, Pose } from "../characters/toon";
import { drawAnyStyled, KindSpec, KPose, PassSpec } from "../characters/kinds";
import { NOINK, SHADOW_ONLY } from "./post";
import { cardShade } from "./shaders";

/** Any 2D character: toon.ts specs (classic/toonworld) or kinds.ts specs (object, critter, blob, stick, chibi, flatvec,
 *  microbe), optionally through a style pass (sketch/cutout/silhouette/pixelize). */
export type AnySpec = CharacterSpec | KindSpec;

export class CharacterCard {
  spec: AnySpec;
  /** optional 2D style pass applied to the card drawing */
  pass?: PassSpec;
  mesh: THREE.Mesh;
  shadowCaster: THREE.Mesh;
  blob: THREE.Mesh;
  private pose: Pose | KPose = {};
  private frame = 0;
  private fps = 30;
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

  /** extra canvas room (fractions of the base canvas): `top` above the head, `x` on each side. Props and big gestures
   *  (a raised axe, a hat tip, a flag) otherwise get clipped by the 1.08 x height card. Feet stay at y = 0. */
  private padPx = { x: 0, top: 0 };
  private base = { w: 0, h: 0 };

  /** heightM: character height in metres; texPx: drawing resolution (>= 1400 for 2K, 2048 for 4K close-ups). */
  constructor(spec: AnySpec, heightM = 1.7, texPx = 1400, sun?: THREE.DirectionalLight, pass?: PassSpec, pad?: { x?: number; top?: number }) {
    this.pass = pass;
    this.spec = spec;
    this.heightM = heightM;
    const { w, h } = charCanvasSize(texPx);
    this.base = { w, h };
    this.padPx = { x: Math.round(w * (pad?.x ?? 0)), top: Math.round(h * (pad?.top ?? 0)) };
    const CW = w + 2 * this.padPx.x, CH = h + this.padPx.top;
    this.canvas = document.createElement("canvas");
    this.canvas.width = CW; this.canvas.height = CH;
    this.g = this.canvas.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    const hm = heightM * 1.08 * (CH / h), wm = heightM * 1.08 * (CW / h);
    const geo = new THREE.PlaneGeometry(wm, hm);
    geo.translate(0, hm / 2 - heightM * (0.08 / ((spec as { heightHeads?: number }).heightHeads ?? 3.5)), 0); // feet exactly at y = 0 (padding only grows up and sideways)
    const mat = cardShade(new THREE.MeshLambertMaterial({ map: this.tex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide })); // 1.6: MSAA-smoothed silhouettes
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.layers.set(NOINK);
    this.mesh.userData.faceCamera = true; // Stage3D re-aims it under a camera override (thumbnails)
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

  /** Store the pose; drawn in place() once the light side relative to the camera is known. Pass the frame for kinds
   *  with frame-driven idle (blob antennae, microbe wobble, spring follow-through) and for boiling style passes. */
  setPose(p: Pose | KPose, frame?: number, fps = 30) {
    this.pose = p;
    if (frame !== undefined) { this.frame = frame; this.fps = fps; }
    this.draw();
  }

  private draw() {
    const p = { light: this.lightSide, ...this.pose } as Pose;
    const q = (v: number | undefined) => (v === undefined ? "" : Math.round(v * 200) / 200);
    const animated = "kind" in this.spec || !!this.pass; // kinds idle per frame, passes boil per frame
    const key = JSON.stringify(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Array.isArray(v) ? v.map(q) : typeof v === "number" ? q(v) : v]))) + (animated ? `@${this.frame}` : "");
    if (key === this.lastKey) return;
    this.lastKey = key;
    const g = this.g, { x: px, top: pt } = this.padPx;
    if (px || pt) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.canvas.width, this.canvas.height); g.save(); g.translate(px, pt); }
    drawAnyStyled(g, this.spec, p, this.base.w, this.base.h, this.frame, this.pass, this.fps);
    if (px || pt) g.restore();
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

// ------------------------------------------------------------------ crowds
import { walkPose as _walk, blinkAt as _blink, mergePose as _merge, idlePose as _idle, Expression as _Ex } from "../characters/toon";
import { BOBBLE_POSES as _BP, poseTrack as _track, PoseKey as _PoseKey } from "../characters/kinds";
import { hash32 as _hash } from "../time";

/**
 * Crowd reactions (1.7): the background reacts to what happens, a few frames late and each in their own way
 * (measured: micro-animation 0.010 against 0.020 in the reference; a crowd that pops on the same frame reads as one
 * object). `pool.react([{ f: T.dropped, kind: "gasp", at: [0, 5, 0] }, { f: T.stopped, kind: "cheer" }])`.
 */
export type CrowdEvent = { f: number; kind: "gasp" | "cheer" | "laugh" | "boo" | "look" | "clap" | "point" | "sad"; at?: [number, number, number]; dur?: number };
const REACT: Record<CrowdEvent["kind"], KPose[]> = {
  gasp: [_BP.shock, { limbs: { handL: [0.4, 1.8], handR: [0.4, 1.8] }, expr: "shock" }, { limbs: { handR: [0.28, 1.72] }, hands: { R: "open" }, expr: "shock", squash: 0.96 }],
  cheer: [_BP.cheer, _BP.wave, { limbs: { handR: [0.7, 2.0] }, hands: { R: "fist" }, expr: "laugh" }],
  laugh: [{ expr: "laugh", lean: -5 }, { expr: "laugh", limbs: { handR: [0.3, 1.2] }, hands: { R: "open" } }, { expr: "laugh", limbs: { handR: [1.0, 1.3] }, hands: { R: "point" } }],
  boo: [{ expr: "angry", limbs: { handR: [0.9, 1.75] }, hands: { R: "fist" } }, { expr: "disgust", limbs: { handL: [0.5, 1.0], handR: [0.5, 1.0] } }, { expr: "angry", lean: 6 }],
  look: [{ expr: "neutral" }, { expr: "think" }, { expr: "nervous" }],
  clap: [{ expr: "happy", limbs: { handL: [0.16, 1.3], handR: [0.16, 1.3] }, hands: { L: "open", R: "open" } }],
  point: [_BP.point, { limbs: { handR: [1.1, 1.3] }, hands: { R: "point" }, expr: "shock" }],
  sad: [{ expr: "sad", lean: 5 }, { expr: "sad", limbs: { handR: [0.25, 1.65] }, hands: { R: "open" } }, { expr: "cry" }],
};

export type CrowdMember = {
  spec: AnySpec; heightM?: number; pass?: PassSpec;
  /** static position, or a path walked between t0..t1 (seconds) */
  pos?: [number, number, number]; path?: { from: [number, number, number]; to: [number, number, number]; t0: number; t1: number };
  expr?: _Ex; seed?: number;
  /** if set, the member only moves/acts inside these [start, end] frame windows (measured: background crowds are
   *  frozen except on cue) */
  cueWindows?: [number, number][];
};

/**
 * Many background characters cheaply: texture resolution by distance tier, poses updated on twos, optional cue-gated
 * acting. update(frame, fps, camPos) every frame.
 */
export class CrowdPool {
  members: { m: CrowdMember; card: CharacterCard }[] = [];
  private events: CrowdEvent[] = [];
  /** scene events the crowd reacts to (each member a few frames late, with their own variant, turning toward `at`) */
  react(events: CrowdEvent[]) { this.events = [...events].sort((a, b) => a.f - b.f); return this; }
  /** hide / show a member group (e.g. a crowd that belongs to one place) */
  setVisible(v: boolean) { for (const { card } of this.members) card.group.visible = v; }
  constructor(private scene: THREE.Scene, private sun?: THREE.DirectionalLight, private tierFor = (d: number) => (d < 6 ? 1200 : d < 14 ? 700 : d < 30 ? 420 : 240)) {}
  add(m: CrowdMember, camDistanceHint = 10) {
    const card = new CharacterCard(m.spec, m.heightM ?? 1.5, this.tierFor(camDistanceHint), this.sun, m.pass);
    this.scene.add(card.group);
    this.members.push({ m, card });
    return this;
  }
  update(frame: number, fps: number, camPos: [number, number, number]) {
    const f2 = frame - (frame % 2); // on twos
    for (const { m, card } of this.members) {
      const active = !m.cueWindows || m.cueWindows.some(([a, b]) => frame >= a && frame <= b);
      const t = frame / fps;
      let p = m.pos ?? [0, 0, 0];
      let moving = false;
      let dir = 1;
      if (m.path) {
        const u = Math.min(1, Math.max(0, (t - m.path.t0) / Math.max(0.01, m.path.t1 - m.path.t0)));
        p = [m.path.from[0] + (m.path.to[0] - m.path.from[0]) * u, 0, m.path.from[2] + (m.path.to[2] - m.path.from[2]) * u];
        moving = u > 0 && u < 1;
        // facing on screen: compare movement direction with the camera's right vector
        const fx = p[0] - camPos[0], fz = p[2] - camPos[2], rx = -fz, rz = fx;
        dir = (m.path.to[0] - m.path.from[0]) * rx + (m.path.to[2] - m.path.from[2]) * rz >= 0 ? 1 : -1;
      }
      const fr = active ? f2 : (m.cueWindows?.[0]?.[0] ?? 0);
      let pose = _merge(moving ? _walk(fr + (m.seed ?? 0) * 5, fps, 2.6) : (this.events.length ? _idle(fr, fps, (m.seed ?? 0) + 3) : {}), { expr: m.expr ?? "neutral", facing: dir as 1 | -1,
        blink: _blink(fr, fps, m.spec.id + (m.seed ?? 0)), view: moving ? "side" : "front" }) as KPose;
      if (this.events.length && !moving) {
        const sd = m.seed ?? 0, delay = Math.round(((1 + (_hash("crowd" + sd) % 8)) * fps) / 30);
        const base: KPose = { expr: (m.expr ?? "neutral") as KPose["expr"] }, keys: _PoseKey[] = [{ f: -1e6, pose: base }];
        let clap = false;
        for (let i = 0; i < this.events.length; i++) {
          const ev = this.events[i], f0 = ev.f + delay, v = REACT[ev.kind], dur = Math.round(((ev.dur ?? 50) * fps) / 30);
          let turn = 0;
          if (ev.at) { const fx = p[0] - camPos[0], fz = p[2] - camPos[2]; turn = ((ev.at[0] - p[0]) * -fz + (ev.at[2] - p[2]) * fx >= 0 ? 1 : -1) * 0.7; }
          keys.push({ f: f0, pose: { ...v[(sd + i) % v.length], turn }, blend: 4 }, { f: f0 + dur + delay * 2, pose: { ...base, turn: turn * 0.5 }, blend: 8 });
          if (ev.kind === "clap" && frame >= f0 && frame < f0 + dur) clap = true;
        }
        keys.sort((a, b) => a.f - b.f);
        pose = { ...pose, ..._track(keys, frame, fps) };
        if (clap) { const o = 0.07 * (0.5 + 0.5 * Math.sin((frame / fps) * 34 + sd)); pose.limbs = { handL: [0.08 + o, 1.3], handR: [0.08 + o, 1.3] }; }
      }
      card.setPose(pose, fr, fps);
      card.place(p[0], p[1], p[2], camPos);
    }
  }
}
