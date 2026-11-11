/**
 * Weather kit (1.7): rain streaks, splash rings and a WET GROUND with a real planar reflection.
 *
 *   const R = rain(scene, { n: 1400 });                       // streaks + splashes, world-anchored, follows the camera
 *   const wet = wetGround(60, 40, { y: 0.02, puddles: 0.45 }); wet.mesh.position.set(x, 0, z); scene.add(wet.mesh);
 *   update: R.update(f, fps, cam.look, amount);  wet.update(f, fps, amount);     // amount 0..1 fades both
 *
 * Rules (references/research/lighting.md, "night and rain"): rain reads by BACKLIGHT and by the wet ground, not by
 * grey. So: use the `rain` lighting key (or night with practicals), keep a lamp or a lit window behind the streaks,
 * and let the ground mirror the lights. The reflection is a second render of the scene from the mirrored camera
 * (the three.js Reflector method), smeared downward and broken by puddle noise and drop ripples, so it stays a
 * stylised wet look instead of a mirror. Cost: one extra scene render per frame while it is visible; set
 * `amount` to 0 outside the rain beats and it costs nothing.
 * Everything is a pure function of the frame (hashes of the cycle number, no accumulated state).
 */
import * as THREE from "three";
import { rng } from "../time";
import type { V3 } from "../camera";
import { NOINK } from "./post";

const HASH = /* glsl */ `
  float h1(float n){ return fract(sin(n * 91.3458) * 47453.5453); }
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }`;

export function rain(scene: THREE.Scene, o: { size?: V3; n?: number; speed?: number; slant?: [number, number]; color?: string; opacity?: number; len?: number; width?: number; splashes?: number; ground?: number; seed?: string } = {}) {
  const size = o.size ?? [16, 11, 16], n = o.n ?? 1400, r = rng(o.seed ?? "rain");
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry(); geo.index = quad.index; geo.setAttribute("position", quad.getAttribute("position"));
  const aP = new Float32Array(n * 4); for (let i = 0; i < n; i++) { aP[i * 4] = r(); aP[i * 4 + 1] = r(); aP[i * 4 + 2] = r(); aP[i * 4 + 3] = 0.7 + r() * 0.6; }
  geo.setAttribute("aP", new THREE.InstancedBufferAttribute(aP, 4)); geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uCenter: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector3(...size) }, uTime: { value: 0 }, uSpeed: { value: o.speed ?? 15 }, uLen: { value: o.len ?? 0.55 }, uWidth: { value: o.width ?? 0.02 },
      uSlant: { value: new THREE.Vector2(...(o.slant ?? [0.12, 0.04])) }, uColor: { value: new THREE.Color(o.color ?? "#cfe0ff") }, uOpacity: { value: o.opacity ?? 0.42 }, uGround: { value: o.ground ?? 0 } },
    vertexShader: /* glsl */ `
      attribute vec4 aP; uniform vec3 uCenter, uSize; uniform float uTime, uSpeed, uLen, uWidth, uGround; uniform vec2 uSlant; varying float vA; varying float vV; varying float vY;
      void main(){
        // world-anchored wrap: the volume follows the camera, the drops stay put in the world
        vec3 p; p.x = uCenter.x + (fract(aP.x - uCenter.x / uSize.x) - 0.5) * uSize.x; p.z = uCenter.z + (fract(aP.z - uCenter.z / uSize.z) - 0.5) * uSize.z;
        float fall = fract(aP.y - uTime * uSpeed * aP.w / uSize.y); p.y = uGround + (1.0 - fall) * uSize.y;
        vec3 dir = normalize(vec3(uSlant.x, -1.0, uSlant.y));
        p.xz += vec2(uSlant.x, uSlant.y) * (uSize.y - p.y) ;
        vec3 wp = p - dir * (position.y + 0.5) * uLen * aP.w;
        vec4 mv = viewMatrix * vec4(wp, 1.0); mv.x += position.x * uWidth * (0.7 + 0.6 * aP.w);
        vA = smoothstep(0.0, 0.08, 1.0 - fall) * smoothstep(1.4, 4.0, -mv.z); vY = position.y; vV = aP.w; // no fat streaks right in front of the lens
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uOpacity; varying float vA; varying float vV; varying float vY;
      void main(){ gl_FragColor = vec4(uColor, uOpacity * vA * smoothstep(0.5, 0.15, abs(vY)) * (0.6 + 0.4 * vV)); }`,
  });
  const streaks = new THREE.Mesh(geo, mat); streaks.frustumCulled = false; streaks.layers.set(NOINK); streaks.userData.auditIgnore = true; streaks.renderOrder = 6;
  // splash rings where drops land
  const ns = o.splashes ?? 150, ring = new THREE.RingGeometry(0.72, 1, 20); ring.rotateX(-Math.PI / 2);
  const g2 = new THREE.InstancedBufferGeometry(); g2.index = ring.index; g2.setAttribute("position", ring.getAttribute("position"));
  const aS = new Float32Array(ns); for (let i = 0; i < ns; i++) aS[i] = i + r(); g2.setAttribute("aS", new THREE.InstancedBufferAttribute(aS, 1)); g2.instanceCount = ns;
  const smat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    uniforms: { uCenter: mat.uniforms.uCenter, uSize: mat.uniforms.uSize, uTime: mat.uniforms.uTime, uColor: mat.uniforms.uColor, uOpacity: mat.uniforms.uOpacity, uGround: mat.uniforms.uGround },
    vertexShader: /* glsl */ `${HASH}
      attribute float aS; uniform vec3 uCenter, uSize; uniform float uTime, uGround; varying float vA;
      void main(){ float t = uTime * 2.6 + h1(aS) * 7.0, cyc = floor(t), ph = fract(t);
        vec2 q = vec2(h2(vec2(aS, cyc)), h2(vec2(cyc, aS * 1.7))) - 0.5;
        vec3 c = vec3(uCenter.x + q.x * uSize.x * 0.8, uGround + 0.03, uCenter.z + q.y * uSize.z * 0.8);
        vec3 wp = c + position * (0.02 + 0.15 * ph); vA = (1.0 - ph) * (1.0 - ph);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(uColor, uOpacity * 1.2 * vA); }`,
  });
  const splashes = new THREE.Mesh(g2, smat); splashes.frustumCulled = false; splashes.layers.set(NOINK); splashes.userData.auditIgnore = true; splashes.renderOrder = 5;
  const group = new THREE.Group(); group.add(streaks, splashes); scene.add(group);
  const op = o.opacity ?? 0.42;
  return { group,
    /** `center` = where the camera looks (the volume follows it); `amount` 0..1 fades the rain in and out */
    update(frame: number, fps: number, center: V3, amount = 1, ground?: number) {
      mat.uniforms.uTime.value = frame / fps; (mat.uniforms.uCenter.value as THREE.Vector3).set(center[0], 0, center[2]);
      if (ground !== undefined) mat.uniforms.uGround.value = ground;
      mat.uniforms.uOpacity.value = op * amount; group.visible = amount > 0.01; } };
}

/**
 * A wet street: lay it 1-3 cm above the existing ground. It darkens what is under it and adds the mirrored scene,
 * strongest in puddles (world-space noise, `puddles` = coverage 0..1) and at grazing angles.
 */
export function wetGround(w: number, d: number, o: { y?: number; tint?: string; strength?: number; puddles?: number; dark?: number; res?: number; smear?: number } = {}) {
  const res = o.res ?? 1024;
  const rt = new THREE.WebGLRenderTarget(res, res, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const vcam = new THREE.PerspectiveCamera(), texM = new THREE.Matrix4();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: { tRefl: { value: rt.texture }, uTexM: { value: texM }, uTint: { value: new THREE.Color(o.tint ?? "#bcd0ff") }, uStrength: { value: o.strength ?? 0.6 }, uPuddle: { value: o.puddles ?? 0.4 },
      uDark: { value: o.dark ?? 0.3 }, uSmear: { value: o.smear ?? 0.012 }, uTime: { value: 0 }, uAmount: { value: 1 } },
    vertexShader: /* glsl */ `uniform mat4 uTexM; varying vec4 vUv; varying vec3 vW;
      void main(){ vUv = uTexM * vec4(position, 1.0); vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `${HASH}
      uniform sampler2D tRefl; uniform vec3 uTint; uniform float uStrength, uPuddle, uDark, uSmear, uTime, uAmount; varying vec4 vUv; varying vec3 vW;
      vec2 ripple(vec2 p, float sc, float sp){ vec2 q = p * sc, c = floor(q), l = fract(q) - 0.5; float t = uTime * sp + h2(c) * 9.0, ph = fract(t);
        vec2 o = (vec2(h2(c + floor(t)), h2(c.yx + floor(t) + 3.1)) - 0.5) * 0.5; l -= o; float rr = length(l), w = ph * 0.42;
        return normalize(l + 1e-4) * sin((rr - w) * 46.0) * smoothstep(0.07, 0.0, abs(rr - w)) * (1.0 - ph); }
      void main(){
        float m = n2(vW.xz * 0.33) * 0.62 + n2(vW.xz * 1.15 + 7.3) * 0.38;
        float pud = smoothstep(1.0 - uPuddle - 0.07, 1.0 - uPuddle + 0.05, m);
        vec2 rp = (ripple(vW.xz, 1.3, 1.4) + ripple(vW.xz + 3.7, 2.1, 1.9)) * pud;
        vec2 uv = vUv.xy / vUv.w + rp * 0.006 + (n2(vW.xz * 3.0 + uTime * 0.2) - 0.5) * 0.003 * (1.0 - pud);
        vec3 refl = vec3(0.0); float ws = 0.0;
        for (int i = 0; i < 6; i++) { float k = float(i), wt = 1.0 - k * 0.14; refl += texture2D(tRefl, uv + vec2(0.0, k * uSmear * (1.0 - 0.7 * pud))).rgb * wt; ws += wt; }
        refl /= ws;
        float fres = pow(1.0 - clamp(normalize(cameraPosition - vW).y, 0.0, 1.0), 2.0);
        float k = uAmount * uStrength * (0.22 + 0.78 * pud) * (0.45 + 0.55 * fres);
        float dark = uAmount * uDark * (0.7 + 0.3 * pud);
        gl_FragColor = vec4(refl * mix(vec3(1.0), uTint, 0.3) * k, 1.0 - (1.0 - dark) * (1.0 - k));
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = o.y ?? 0.02; mesh.layers.set(NOINK); mesh.userData.auditIgnore = true; mesh.renderOrder = 0.4;
  const P = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), V = new THREE.Vector3(), LA = new THREE.Vector3(), T = new THREE.Vector3(), R = new THREE.Matrix4(), plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  let busy = false;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    if (busy || scene.overrideMaterial || mat.uniforms.uAmount.value <= 0.01) return; // not during the normal / depth pass, not nested
    P.setFromMatrixPosition(mesh.matrixWorld); C.setFromMatrixPosition(camera.matrixWorld);
    R.extractRotation(mesh.matrixWorld); N.set(0, 0, 1).applyMatrix4(R);
    V.subVectors(P, C); if (V.dot(N) > 0) return;
    V.reflect(N).negate().add(P);
    R.extractRotation(camera.matrixWorld); LA.set(0, 0, -1).applyMatrix4(R).add(C);
    T.subVectors(P, LA).reflect(N).negate().add(P);
    vcam.position.copy(V); vcam.up.set(0, 1, 0).applyMatrix4(R).reflect(N); vcam.lookAt(T);
    const pc = camera as THREE.PerspectiveCamera; vcam.far = pc.far; vcam.near = pc.near; vcam.updateMatrixWorld(); vcam.projectionMatrix.copy(pc.projectionMatrix); vcam.layers.mask = camera.layers.mask;
    texM.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse).multiply(mesh.matrixWorld);
    // oblique near plane = the ground: nothing below it leaks into the mirror
    plane.setFromNormalAndCoplanarPoint(N, P).applyMatrix4(vcam.matrixWorldInverse); clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = vcam.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + pm[8]) / pm[0], (Math.sign(clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]); clip.multiplyScalar(2 / clip.dot(q));
    pm[2] = clip.x; pm[6] = clip.y; pm[10] = clip.z + 1 - 0.003; pm[14] = clip.w;
    busy = true; mesh.visible = false;
    const tgt = renderer.getRenderTarget(), sa = renderer.shadowMap.autoUpdate, ac = renderer.autoClear;
    renderer.shadowMap.autoUpdate = false; renderer.autoClear = true;
    renderer.setRenderTarget(rt); renderer.state.buffers.depth.setMask(true); renderer.clear(); renderer.render(scene, vcam);
    renderer.shadowMap.autoUpdate = sa; renderer.autoClear = ac; renderer.setRenderTarget(tgt);
    mesh.visible = true; busy = false;
  };
  return { mesh, target: rt,
    update(frame: number, fps = 30, amount = 1) { mat.uniforms.uTime.value = frame / fps; mat.uniforms.uAmount.value = amount; mesh.visible = amount > 0.01; },
    dispose() { rt.dispose(); mat.dispose(); } };
}
