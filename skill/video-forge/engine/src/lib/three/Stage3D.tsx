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
import React, { useLayoutEffect, useMemo, useRef } from "react";
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
  look: Look;
  /** frame offset when this stage is used inside a <Sequence> but must read absolute time */
  frameOffset?: number;
  shadowMapSize?: number;
};

type Inst<W> = { ctx: StageCtx; world: W; post: PostPipeline };

export function Stage3D<W>({ build, update, look, frameOffset = 0, shadowMapSize = 4096 }: Stage3DProps<W>) {
  const frame = useCurrentFrame() + frameOffset;
  const { width, height, fps } = useVideoConfig();
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
    const cam = update(it.world, frame, it.ctx);
    const c = it.ctx.camera;
    c.position.set(...cam.pos);
    c.up.set(0, 1, 0);
    c.lookAt(...cam.look);
    if (cam.roll) c.rotateZ((cam.roll * Math.PI) / 180);
    c.fov = cam.fov;
    c.aspect = width / height;
    c.updateProjectionMatrix();
    it.ctx.scene.updateMatrixWorld(true);
    it.post.render(it.ctx.scene, c, look, { focus: cam.focus, frame });
    it.ctx.renderer.getContext().finish();
  };
  useLayoutEffect(() => drawRef.current());

  return <canvas ref={canvasRef} width={width} height={height} style={{ width: "100%", height: "100%", display: "block" }} />;
}
