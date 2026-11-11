/**
 * Stage3D: a three.js scene rendered deterministically inside Remotion.
 *
 *  - The world is built ONCE per browser tab (`build`), then `update(frame)` poses
 *    everything as a pure function of the frame and returns the camera state.
 *  - Rendering happens synchronously in useLayoutEffect, so when Remotion takes its
 *    screenshot the canvas already holds this exact frame (preserveDrawingBuffer).
 *  - Native resolution: the canvas is exactly the composition size (pixel ratio 1).
 *  - Async assets (images/GLTF) use delayRender via ctx.wait(promise).
 */
import React, { createContext, useContext, useLayoutEffect, useMemo, useRef } from "react";
import { continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { CamState } from "../camera";
import { Look } from "../look";
import { PostPipeline, SHADOW_ONLY } from "./post";

export type StageCtx = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  width: number; height: number; fps: number;
  /** register an async asset load; rendering waits for it */
  wait: (p: Promise<unknown>) => void;
};

export type Stage3DProps<W> = {
  build: (ctx: StageCtx) => W;
  update: (world: W, frame: number, ctx: StageCtx) => CamState;
  /** a fixed Look, or a function of the absolute frame (per-shot setups, see lookTimeline()) */
  look: Look | ((frame: number) => Look);
  /** frame offset when this stage is used inside a <Sequence> but must read absolute time */
  frameOffset?: number;
  shadowMapSize?: number;
  /** camera as a pure function of frame (e.g. rig.at) -> enables camera motion blur (look.motionBlur) */
  camAt?: (frame: number, fps: number) => CamState;
  /** cross-dissolve between two camera views inside ONE world (rig.dissolveAt) */
  dissolveAt?: (frame: number, fps: number) => { a: CamState; b: CamState; t: number } | null;
  /** hard-cut frames (rig.cuts): no camera motion blur across a cut (the incoming frame must be clean) */
  cuts?: number[];
};

type Inst<W> = { ctx: StageCtx; world: W; post: PostPipeline };

/** Camera override (thumbnails, inserts): when provided, replaces the camera that `update()` returns; motion blur
 *  and dissolves are off for that frame. Receives the project camera so overrides can be relative. */
export const CamOverride = createContext<((cam: CamState, frame: number) => CamState) | null>(null);

function applyCam(c: THREE.PerspectiveCamera, cam: CamState, aspect: number) {
  c.position.set(...cam.pos);
  c.up.set(0, 1, 0);
  c.lookAt(...cam.look);
  if (cam.roll) c.rotateZ((cam.roll * Math.PI) / 180);
  c.fov = cam.fov;
  c.aspect = aspect;
  c.updateProjectionMatrix();
  c.updateMatrixWorld(true);
}

export function Stage3D<W>({ build, update, look, frameOffset = 0, shadowMapSize = 4096, camAt, dissolveAt, cuts }: Stage3DProps<W>) {
  const frame = useCurrentFrame() + frameOffset;
  const { width, height, fps } = useVideoConfig();
  const camOverride = useContext(CamOverride);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inst = useRef<Inst<W> | null>(null);
  const pending = useRef<Promise<unknown>[]>([]);
  const readyHandle = useMemo(() => delayRender("Stage3D init"), []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance", alpha: false });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; // r187: PCFSoft removed; PCF + shadow.radius gives soft edges
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1500);
    const ctx: StageCtx = { scene, camera, renderer, width, height, fps, wait: (p) => pending.current.push(p) };
    const world = build(ctx);
    scene.traverse((o) => {
      const l = o as THREE.DirectionalLight;
      if (l.isDirectionalLight && l.castShadow) {
        l.shadow.mapSize.set(shadowMapSize, shadowMapSize);
        l.shadow.camera.layers.enable(SHADOW_ONLY); // invisible shadow-caster cards
      }
    });
    const post = new PostPipeline(renderer, width, height);
    inst.current = { ctx, world, post };
    const gl = renderer.getContext();
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    // eslint-disable-next-line no-console
    console.log("[video-forge] WebGL renderer:", dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown", `${width}x${height}`);
    const done = () => { drawRef.current(); continueRender(readyHandle); };
    Promise.all(pending.current).then(done, (e) => { console.error(e); done(); });
    return () => {
      post.dispose();
      renderer.dispose();
      inst.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawRef = useRef<() => void>(() => {});
  drawRef.current = () => {
    const it = inst.current;
    if (!it) return;
    const cam0 = update(it.world, frame, it.ctx);
    const cam = camOverride ? camOverride(cam0, frame) : cam0;
    if (camOverride) { // billboards (character cards, FX sprites) must face the OVERRIDE camera, not the video camera
      it.ctx.scene.updateMatrixWorld(true);
      const wp = new THREE.Vector3();
      it.ctx.scene.traverse((o) => {
        if (!o.userData.faceCamera) return;
        o.getWorldPosition(wp);
        o.rotation.set(0, Math.atan2(cam.pos[0] - wp.x, cam.pos[2] - wp.z), 0);
      });
    }
    const c = it.ctx.camera;
    c.position.set(...cam.pos);
    c.up.set(0, 1, 0);
    c.lookAt(...cam.look);
    if (cam.roll) c.rotateZ((cam.roll * Math.PI) / 180);
    c.fov = cam.fov;
    c.aspect = width / height;
    c.updateProjectionMatrix();
    it.ctx.scene.updateMatrixWorld(true);
    const lk = typeof look === "function" ? look(frame) : look;
    let prevViewProj: THREE.Matrix4 | undefined;
    const prev = camAt && frame > 0 && !camOverride ? camAt(frame - 1, fps) : null;
    const jump = prev ? Math.hypot(prev.pos[0] - cam.pos[0], prev.pos[1] - cam.pos[1], prev.pos[2] - cam.pos[2]) > 0.35 * cam.focus : false; // undeclared cut
    if (prev && lk.motionBlur > 0 && !cuts?.includes(frame) && !jump) {
      const pc = (it as any).prevCam ?? ((it as any).prevCam = new THREE.PerspectiveCamera(35, width / height, c.near, c.far));
      applyCam(pc, prev, width / height);
      prevViewProj = new THREE.Matrix4().multiplyMatrices(pc.projectionMatrix, pc.matrixWorldInverse);
    }
    const dz = dissolveAt && !camOverride ? dissolveAt(frame, fps) : null;
    if (dz) {
      const ca = (it as any).dzA ?? ((it as any).dzA = new THREE.PerspectiveCamera(35, width / height, c.near, c.far));
      const cb = (it as any).dzB ?? ((it as any).dzB = new THREE.PerspectiveCamera(35, width / height, c.near, c.far));
      applyCam(ca, dz.a, width / height); applyCam(cb, dz.b, width / height);
      it.post.dissolve(it.ctx.scene, ca, cb, lk, { focusA: dz.a.focus, focusB: dz.b.focus, frame, t: dz.t });
    } else it.post.render(it.ctx.scene, c, lk, { focus: cam.focus, frame, prevViewProj });
    it.ctx.renderer.getContext().finish();
  };
  useLayoutEffect(() => drawRef.current());

  return <canvas ref={canvasRef} width={width} height={height} style={{ width: "100%", height: "100%", display: "block" }} />;
}
