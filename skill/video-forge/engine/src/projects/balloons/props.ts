/**
 * Story props for "Why Hot Air Balloons Only Fly at Sunrise": the noon test balloon, the thermal bubbles, the wind
 * layers and the dawn fleet. All of them stay off the screen-space ink (the world is baked and ink-free).
 */
import * as THREE from "three";
import type { BoardApi } from "../../lib/board";
import { NOINK } from "../../lib/three/post";
import { canvasTexture } from "../../lib/three/textures";
import { horizonEnv } from "../../lib/three/glbvehicle";
import { clamp, ease, lerp } from "../../lib/time";

type V3 = [number, number, number];
const clean = <T extends THREE.Object3D>(o: T) => { o.traverse((m) => { m.layers.set(NOINK); }); return o; };
const smooth = (a: number, b: number, t: number) => { const u = clamp((t - a) / Math.max(1e-6, b - a)); return u * u * (3 - 2 * u); };

/** the tiny test balloon (a pilot balloon): released at T.let, shoots up at T.shot, drops at T.dropped, zigzags from
 *  T.zigzagged toward `toLine` (the power line, relative to the prop origin) and ends caught near the cables */
/** where the balloon floats on its string before it is let go, and the pilot's fist (relative to the prop origin = the pilot's mark) */
const REST: V3 = [0.85, 2.3, 0.2], HAND: V3 = [0.57, 1.32, 0.26];
export const testBalloon = (api: BoardApi, toLine: V3) => {
  const g = new THREE.Group(), red = new THREE.MeshStandardMaterial({ color: "#e2333f", roughness: 0.35 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 24), red); ball.scale.set(1, 1.18, 1); ball.castShadow = true; g.add(ball);
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.1, 12), red); knot.position.y = -0.52; knot.rotation.x = Math.PI; ball.add(knot);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7 })); shine.position.set(-0.16, 0.19, 0.3); ball.add(shine);
  const strM = new THREE.LineBasicMaterial({ color: "#f4efe6" }), strG = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 12 }, () => new THREE.Vector3()));
  const str = new THREE.Line(strG, strM); g.add(str);
  const pos = (f: number, fps: number): V3 => {
    const T = api.T, t = f / fps;
    const y0 = REST[1], a = T.let ?? 0, b = T.shot ?? a + 30, c = T.dropped ?? b + 30, d = T.zigzagged ?? c + 30, e = T.power ?? d + 30;
    if (f < a) return [REST[0], y0, REST[2]];
    let y = lerp(y0, 3.2, smooth(a, b, f)); let x = REST[0], z = REST[2];
    if (f >= b) y = lerp(3.2, 15, ease.outCubic(clamp((f - b) / Math.max(1, c - b))));
    if (f >= c) y = lerp(15, 4.5, ease.inCubic(clamp((f - c) / Math.max(1, (d - c) * 0.8))));
    if (f >= d) { const u = clamp((f - d) / Math.max(1, e - d + fps)); x = 0.35 + toLine[0] * ease.inOutCubic(u) + 3.2 * Math.sin(u * Math.PI * 5) * (1 - u * 0.6); z = 0.1 + toLine[2] * ease.inOutCubic(u); y = lerp(4.5, toLine[1] + 0.4, u) + 1.4 * Math.sin(u * Math.PI * 7); }
    return [x + 0.15 * Math.sin(t * 3.1), y + 0.08 * Math.sin(t * 4.3), z];
  };
  return { group: clean(g), update(f: number, fps: number) {
    const p = pos(f, fps), q = pos(f - 2, fps); ball.position.set(...p); ball.rotation.z = clamp((q[0] - p[0]) * 0.6, -0.5, 0.5);
    /* until T.let the string ends in the pilot's fist (HAND); after it, it trails free under the balloon */
    const free = smooth((api.T.let ?? 0) - 2, (api.T.let ?? 0) + 10, f);
    const top = new THREE.Vector3(p[0], p[1] - 0.56, p[2]), trail = new THREE.Vector3(q[0] * 0.6 + p[0] * 0.4, p[1] - 1.6, p[2]);
    const bottom = new THREE.Vector3(...HAND).lerp(trail, free);
    const pts = (strG.getAttribute("position") as THREE.BufferAttribute);
    for (let i = 0; i < 12; i++) { const k = i / 11, w = Math.sin(k * Math.PI) * 0.12 * Math.sin(f / fps * 6 + k * 4); pts.setXYZ(i, lerp(top.x, bottom.x, k) + w, lerp(top.y, bottom.y, k), lerp(top.z, bottom.z, k)); }
    pts.needsUpdate = true; } };
};

/** warm-air bubbles rising from hot spots (`spots`, relative to the prop origin): soft glowing domes, visible from T.each to T.whats */
export const thermals = (api: BoardApi, spots: V3[]) => {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uA: { value: 0 } },
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader: "uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float r = 1.0 - abs(dot(vN, vV)); float rim = pow(r, 2.2); vec3 c = mix(vec3(1.0,0.55,0.18), vec3(1.0,0.92,0.7), rim); gl_FragColor = vec4(c * (0.18 + 0.9 * rim) * uA, 1.0); }" });
  const bubbles = spots.flatMap((s, i) => [0, 1, 2].map((k) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat); m.userData = { s, ph: (i * 0.37 + k / 3) % 1 }; g.add(m); return m; }));
  const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.45, 0.12), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const glows = spots.map((s) => { const d = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40), glowM); d.rotation.x = -Math.PI / 2; d.position.set(s[0], s[1] + 0.06, s[2]); g.add(d); return d; });
  void glows;
  return { group: clean(g), update(f: number, fps: number) {
    const T = api.T, a = (T.dark ?? T.you ?? 0) - 6, end = 1 - smooth((T.whats ?? 1e9) - 6, (T.whats ?? 1e9) + 10, f), A = smooth(a, a + 18, f) * end;
    const e = (T.each ?? a) - 4, B = smooth(e, e + 14, f) * end;
    (mat.uniforms.uA as { value: number }).value = 0.7 * B; glowM.opacity = 0.45 * A * (0.8 + 0.2 * Math.sin(f / fps * 5));
    const t = f / fps;
    for (const m of bubbles) { const { s, ph } = m.userData as { s: V3; ph: number }, u = (t / 2.6 + ph) % 1;
      m.position.set(s[0] + 0.8 * Math.sin(u * 9 + ph * 7), s[1] + 1 + u * 24, s[2]); m.scale.setScalar(0.6 + u * 1.8); m.visible = B > 0.01; } } };
};

/** three wind layers as soft ribbons at different heights, each flowing its own way; `scramble` 0..1 bends and breaks them;
 *  `ride`: the layers travel with a named object (the climbing hero balloon) at `offset`, so a following camera keeps them in view */
export const windLayers = (api: BoardApi, o: { width?: number; heights?: number[]; dirs?: number[]; show: [string, string]; scrambleFrom?: string; calmFrom?: string; ride?: { name: string; offset: V3 } }) => {
  const g = new THREE.Group(), inner = new THREE.Group(), W = o.width ?? 90, hs = o.heights ?? [18, 34, 52], dirs = o.dirs ?? [1, -1, 1];
  const cols = ["#9fd3ff", "#b6f0c8", "#ffd6a6"];
  const ribbons = hs.map((h, i) => {
    const tex = canvasTexture(`windribbon${i}`, 1024, 128, (c) => {
      c.clearRect(0, 0, 1024, 128);
      const gr = c.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = gr; c.fillRect(0, 0, 1024, 128);
      c.strokeStyle = "rgba(255,255,255,0.95)"; c.lineWidth = 7; c.lineCap = "round"; c.lineJoin = "round";
      for (let k = 0; k < 6; k++) { const x = 60 + k * 170, y = 64 + (k % 2 ? 12 : -12); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 90, y); c.moveTo(x + 70, y - 16); c.lineTo(x + 92, y); c.lineTo(x + 70, y + 16); c.stroke(); }
    });
    tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(W / 30, 1);
    const geo = new THREE.PlaneGeometry(W, 4.5, 96, 1), mat = new THREE.MeshBasicMaterial({ map: tex, color: cols[i % 3], transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat); m.position.y = h; if (dirs[i] < 0) m.rotation.y = Math.PI; inner.add(m);
    return { m, mat, tex, geo, base: (geo.getAttribute("position") as THREE.BufferAttribute).array.slice(), i };
  });
  g.add(inner);
  return { group: clean(g), update(f: number, fps: number) {
    const T = api.T, a = T[o.show[0]] ?? 0, b = T[o.show[1]] ?? 1e9, A = smooth(a - 6, a + 10, f) * (1 - smooth(b - 8, b + 6, f));
    const rider = o.ride && A > 0.01 ? api.scene.getObjectByName(o.ride.name) : undefined;
    if (rider && o.ride) { const w = rider.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(...o.ride.offset)); g.updateMatrixWorld(true); inner.position.copy(g.worldToLocal(w)); }
    const sc = o.scrambleFrom ? smooth(T[o.scrambleFrom] - 4, T[o.scrambleFrom] + 20, f) * (o.calmFrom ? 1 - smooth(T[o.calmFrom] - 4, T[o.calmFrom] + 24, f) : 1) : 0;
    const t = f / fps;
    for (const r of ribbons) {
      r.mat.opacity = 0.85 * A; r.m.visible = A > 0.01; r.tex.offset.x = -t * (0.22 + 0.06 * r.i) * (1 + sc * 2.5);
      const p = r.geo.getAttribute("position") as THREE.BufferAttribute;
      for (let v = 0; v < p.count; v++) { const x = r.base[v * 3], y = r.base[v * 3 + 1];
        p.setY(v, y + sc * (3.2 * Math.sin(x * 0.11 + t * 2.4 + r.i * 2) + 1.6 * Math.sin(x * 0.31 - t * 3.1))); p.setZ(v, sc * 2.5 * Math.sin(x * 0.07 + t * 1.7 + r.i)); }
      p.needsUpdate = true; } } };
};

/** dozens of balloons over the valley at dawn, slowly rising and drifting; each pair of gore colours is its own */
export const fleet = (api: BoardApi, o: { spots: V3[]; from: string; seed?: number }) => {
  const g = new THREE.Group();
  const PAIRS: [string, string][] = [["#e23b3b", "#f5c21b"], ["#2f6fb0", "#f4efe6"], ["#2f9a5a", "#f5c21b"], ["#8e3b9e", "#ec8a2c"], ["#ec8a2c", "#2f6fb0"], ["#f4efe6", "#e23b3b"],
    ["#1f9fb0", "#f4efe6"], ["#f5c21b", "#2f3f8f"], ["#d8344e", "#f4efe6"], ["#5aa83a", "#2f6fb0"], ["#f08a24", "#f4efe6"], ["#3f5fd6", "#f5c21b"]];
  const items = o.spots.map((s, i) => {
    const [a, b] = PAIRS[(i * 5 + (o.seed ?? 0)) % PAIRS.length];
    const m = api.model("sets/balloon/balloon.glb", { toon: false, groundAlign: false, recolor: { env_a: a, env_b: b },
      onLoad: (mm) => mm.traverse((c) => { const ms = c as THREE.Mesh; if (!ms.isMesh) return; ms.castShadow = false; const mt = ms.material as THREE.MeshStandardMaterial; if (mt?.isMeshStandardMaterial) { mt.envMap = horizonEnv(api.renderer); mt.envMapIntensity = 0.6; } }) });
    m.position.set(...s); m.rotation.y = (i * 1.37) % (Math.PI * 2); g.add(m);
    return { m, s, ph: i * 0.61 };
  });
  return { group: clean(g), update(f: number, fps: number) {
    const t0 = api.T[o.from] ?? 0, t = Math.max(0, f - t0) / fps;
    for (const it of items) it.m.position.set(it.s[0] + t * 0.35 * Math.sin(it.ph), it.s[1] + t * (0.6 + 0.25 * Math.sin(it.ph * 3)), it.s[2] + t * 0.3 * Math.cos(it.ph)); } };
};
