/**
 * DEMO LONG-FORM -- "Why pendulums ignore weight" (16:9, cinematic-film look, chaptered).
 * Exercises the long-form machinery: several independent 3D scenes + 2D motion-graphics
 * chapters, transitions (dip/whip/zoom/crossfade), chapter labels, subtitle captions,
 * chunked/resumable rendering. Physics is exact: theta(t) = theta0 * cos(2*pi*t/T),
 * T = 2*pi*sqrt(L/g)  => 1 m: 2.006 s; 4 m: 4.012 s; Moon (g = 1.62): x2.46.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { cameraRig } from "../../lib/camera";
import { resolveLook } from "../../lib/look";
import { ProjectDef } from "../../lib/project";
import { NOINK } from "../../lib/three/post";
import { Stage3D } from "../../lib/three/Stage3D";
import { canvasTexture } from "../../lib/three/textures";
import { lights, planet, stars, studio } from "../../lib/three/world";
import { BarChart, Captions, Counter, FilmOverlay, FONTS, GradientBg, KineticTitle, LowerThird, useU } from "../../lib/two/text";
import { clamp, ease, rng, springAt } from "../../lib/time";
import WORDS from "./words.json";

const TITLE = 3.5; // s before the voice starts
const words = WORDS.map((w) => ({ ...w, start: w.start + TITLE, end: w.end + TITLE }));
const at = (i: number) => words[i].start;
const G = 9.81, GM = 1.62;
const period = (L: number, g = G) => 2 * Math.PI * Math.sqrt(L / g);
const theta = (t: number, L: number, g = G, a0 = 0.32, ph = 0) => a0 * Math.cos((2 * Math.PI * t) / period(L, g) + ph);

const LOOK = resolveLook("cinematic-film", { exposure: 1.45, dof: { maxBlur: 14, aperture: 1.4 }, grade: { blackPoint: 0.03 } });

function pendulum(L: number, bobR: number, color = "#c9a24a") {
  const pivot = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, L, 8), new THREE.MeshStandardMaterial({ color: "#d8d8de", metalness: 0.9, roughness: 0.25 }));
  rod.position.y = -L / 2;
  const bob = new THREE.Mesh(new THREE.SphereGeometry(bobR, 48, 32), new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.22 }));
  bob.position.y = -L;
  rod.castShadow = bob.castShadow = true;
  pivot.add(rod, bob);
  return { pivot, bob };
}

function frame(L: number) { // the stand the pendulum hangs from
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: "#2c2f38", metalness: 0.6, roughness: 0.4 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.12), m); top.position.y = L + 0.3;
  for (const x of [-0.78, 0.78]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, L + 0.3, 0.12), m); leg.position.set(x, (L + 0.3) / 2, 0); g.add(leg); }
  g.add(top);
  g.traverse((o) => { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; });
  return g;
}

/** Scene B: same length, very different masses, swinging in perfect sync. */
const MassScene: React.FC = () => {
  const { fps } = useVideoConfig();
  const rack = Math.round((at(14) - TITLE + 0.2) * fps); // "how heavy"
  const rig = cameraRig([
    { f: 0, pos: [3.2, 1.6, 5.2], look: [0, 0.9, 0], fov: 30, focus: 6 },
    { f: rack, pos: [2.2, 1.3, 3.6], look: [0, 0.75, 0], fov: 28, glide: rack, focus: 4.3 },
    { f: rack + 60, pos: [1.2, 0.9, 2.2], look: [-0.38, 0.62, 0], fov: 26, glide: 40, focus: 2.3 },
  ], { creep: 0.01, handheld: 0.004 });
  return (
    <Stage3D look={LOOK}
      build={({ scene }) => {
        studio(scene, "#4a5568", "#2c3340");
        const L = lights(scene, "studio", { shadowSize: 6, fog: false });
        L.sun.position.set(-3, 6, 4); L.sun.intensity = 4.2; L.hemi.intensity = 1.0;
        const fill = new THREE.PointLight("#ffd9b0", 6, 8, 1.5); fill.position.set(2.5, 2, 3); scene.add(fill);
        const rim = new THREE.DirectionalLight("#9fc4ff", 2.2); rim.position.set(3, 3, -4); scene.add(rim);
        const st = frame(1.0); scene.add(st);
        const a = pendulum(1.0, 0.05, "#c9a24a"), b = pendulum(1.0, 0.14, "#b5552f");
        a.pivot.position.set(-0.38, 1.3, 0); b.pivot.position.set(0.38, 1.3, 0);
        scene.add(a.pivot, b.pivot);
        return { a, b };
      }}
      update={(w, f, { fps: FPS }) => {
        const t = f / FPS;
        w.a.pivot.rotation.z = theta(t, 1.0); w.b.pivot.rotation.z = theta(t, 1.0);
        return rig.at(f, FPS);
      }}
    />
  );
};

/** Scene D: 1 m vs 4 m -- the long one takes twice as long. */
const LengthScene: React.FC = () => {
  const rig = cameraRig([
    { f: 0, pos: [0.8, 2.6, 9.5], look: [0.3, 2.4, 0], fov: 32, focus: 9 },
    { f: 120, pos: [0.3, 2.2, 8.2], look: [0.3, 2.2, 0], fov: 32, glide: 120, focus: 8 },
  ], { creep: 0.008 });
  return (
    <Stage3D look={LOOK}
      build={({ scene }) => {
        studio(scene, "#4a5568", "#2c3340");
        const L = lights(scene, "studio", { shadowSize: 8, fog: false }); L.sun.position.set(-3, 8, 5); L.sun.intensity = 4.2; L.hemi.intensity = 1.0;
        const s1 = frame(4.0); s1.scale.x = 2.2; s1.position.x = 0.6; scene.add(s1);
        const short = pendulum(1.0, 0.09), long = pendulum(4.0, 0.12, "#b5552f");
        short.pivot.position.set(-0.6, 4.3, 0); long.pivot.position.set(1.4, 4.3, 0);
        scene.add(short.pivot, long.pivot);
        return { short, long };
      }}
      update={(w, f, { fps: FPS }) => {
        const t = f / FPS;
        w.short.pivot.rotation.z = theta(t, 1.0, G, 0.3); w.long.pivot.rotation.z = theta(t, 4.0, G, 0.16);
        return rig.at(f, FPS);
      }}
    />
  );
};

/** Scene E: the Moon. */
const MoonScene: React.FC = () => {
  const rig = cameraRig([
    { f: 0, pos: [0, 4, 46], look: [0, 0, 0], fov: 30, focus: 46 },
    { f: 200, pos: [-14, 6, 34], look: [0, 0, 0], fov: 30, glide: 200, focus: 36 },
  ]);
  return (
    <Stage3D look={resolveLook("cinematic-film", { dof: { enabled: false }, bloom: { threshold: 0.7, strength: 0.35 } })}
      build={({ scene }) => {
        scene.background = new THREE.Color("#02030a");
        stars(scene, 4000, "moonstars");
        lights(scene, "space", { fog: false }).sun.position.set(-60, 20, 40);
        const moonTex = canvasTexture("moon", 2048, 1024, (g, r) => {
          g.fillStyle = "#9c9a94"; g.fillRect(0, 0, 2048, 1024);
          g.filter = "blur(28px)";
          for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(70,70,72,${0.15 + r() * 0.25})`; g.beginPath(); g.ellipse(r() * 2048, 150 + r() * 700, 60 + r() * 200, 40 + r() * 120, r() * 3, 0, 7); g.fill(); }
          g.filter = "none";
          for (let i = 0; i < 1400; i++) { const x = r() * 2048, y = r() * 1024, s = 1.5 + Math.pow(r(), 6) * 46;
            g.fillStyle = `rgba(55,55,58,${0.18 + r() * 0.22})`; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); g.strokeStyle = "rgba(230,228,220,0.22)"; g.lineWidth = Math.max(1, s * 0.15); g.beginPath(); g.arc(x - s * 0.15, y - s * 0.15, s, 3.5, 5.6); g.stroke(); }
        });
        const moon = new THREE.Mesh(new THREE.SphereGeometry(10, 128, 64), new THREE.MeshStandardMaterial({ map: moonTex, roughness: 1 }));
        scene.add(moon);
        const earth = planet(3, {}); earth.group.position.set(40, 14, -140); scene.add(earth.group);
        earth.group.traverse((o) => o.layers.set(NOINK));
        return { moon, earth };
      }}
      update={(w, f, { fps: FPS }) => { w.moon.rotation.y = f / FPS * 0.03; w.earth.group.rotation.y = f / FPS * 0.05; return rig.at(f, FPS); }}
    />
  );
};

const PendulumIcon: React.FC<{ L?: number; g?: number; size?: number; color?: string }> = ({ L = 1, g = G, size = 260, color = "#ffd27a" }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useU();
  const a = theta(f / fps, L, g, 0.35);
  const len = size * u;
  return (
    <svg width={len * 1.2} height={len * 1.15} viewBox={`${-len * 0.6} 0 ${len * 1.2} ${len * 1.15}`}>
      <line x1={-len * 0.25} y1={2 * u} x2={len * 0.25} y2={2 * u} stroke="#fff" strokeWidth={4 * u} />
      <g transform={`rotate(${(-a * 180) / Math.PI})`}>
        <line x1={0} y1={0} x2={0} y2={len} stroke="rgba(255,255,255,0.8)" strokeWidth={3 * u} />
        <circle cx={0} cy={len} r={len * 0.08} fill={color} />
      </g>
    </svg>
  );
};

const TitleScene: React.FC = () => {
  const { u } = useU();
  return (
    <AbsoluteFill>
      <GradientBg a="#141826" b="#2b2234" />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 140 * u }}><PendulumIcon size={300} /></AbsoluteFill>
      <KineticTitle text="Why Pendulums Ignore Weight" sub="A video-forge long-form demo" y={0.56} size={104} start={6} />
      <FilmOverlay vignette={0.35} grain={0.05} />
    </AbsoluteFill>
  );
};

const ChartScene: React.FC<{ start: number }> = ({ start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useU();
  const lf = (i: number) => Math.round((at(i) - start) * fps);
  const show4 = f >= lf(42) - 4;
  const formula = clamp((f - 8) / 18);
  return (
    <AbsoluteFill>
      <GradientBg a="#10141f" b="#1d2433" angle={135} />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-around", padding: `0 ${120 * u}px` }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: FONTS.mono, color: "#9fb4d8", fontSize: 34 * u, letterSpacing: "0.2em", marginBottom: 36 * u, opacity: formula }}>T = 2π √(L / g)</div>
          <div style={{ display: "flex", gap: 60 * u, alignItems: "flex-start", justifyContent: "center", height: 420 * u }}>
            <PendulumIcon L={1} size={180} />
            {show4 && <div style={{ opacity: clamp((f - lf(42) + 4) / 10) }}><PendulumIcon L={4} size={360} color="#e07a4f" /></div>}
          </div>
          <div style={{ marginTop: 18 * u }}>
            {f >= lf(33) - 3 && <Counter from={0} to={period(1)} decimals={2} suffix=" s" start={lf(33) - 3} dur={24} size={120} />}
          </div>
        </div>
        <div style={{ opacity: clamp((f - lf(40) + 6) / 10) }}>
          <BarChart start={lf(40)} stagger={Math.round(0.8 * fps)} max={4.6} width={820} height={560} unitLabel=" s" decimals={2}
            data={[{ label: "L = 1 m", value: Math.round(period(1) * 100) / 100, color: "#ffd27a" }, { label: "L = 4 m", value: Math.round(period(4) * 100) / 100, color: "#e07a4f" }]} />
        </div>
      </AbsoluteFill>
      <FilmOverlay vignette={0.3} grain={0.04} />
    </AbsoluteFill>
  );
};

const EndCard: React.FC = () => {
  const { u } = useU();
  return (
    <AbsoluteFill>
      <GradientBg a="#141826" b="#2b2234" />
      <KineticTitle text="T = 2π √(L / g)" sub="mass is not in the equation" y={0.4} size={120} font={FONTS.serif} />
      <FilmOverlay vignette={0.35} grain={0.05} />
      <div style={{ position: "absolute", bottom: 60 * u, width: "100%", textAlign: "center", fontFamily: FONTS.body, color: "rgba(255,255,255,0.6)", fontSize: 26 * u }}>Rendered natively at 2560×1440 with video-forge</div>
    </AbsoluteFill>
  );
};

const Labels: React.FC<{ items: { f: number; dur: number; title: string; sub?: string }[] }> = ({ items }) => <>{items.map((it, i) => <LowerThird key={i} start={it.f} dur={it.dur} title={it.title} sub={it.sub} />)}</>;

export const pendulumLong: ProjectDef = {
  id: "pendulum", title: "Why pendulums ignore weight", defaultFormat: "long", fps: 30, audio: "pendulum/master.wav",
  scenes: ({ fps }) => {
    const F = (s: number) => Math.round(s * fps);
    const bStart = TITLE - 0.3, cStart = at(27) - 0.35, dStart = at(51) - 0.3, eStart = at(59) - 0.3, endStart = words[80].end + 0.6;
    return [
      { id: "title", frames: F(TITLE + 0.3), render: () => <TitleScene /> },
      { id: "mass", frames: F(cStart - bStart) + 10, transition: { type: "dip", frames: 18 }, chapter: "1 Mass",
        render: () => <><MassScene /><Labels items={[{ f: F(at(17) - bStart), dur: F(3.2), title: "Same length · 50 g vs 2 kg", sub: "they never drift apart" }]} /></> },
      { id: "chart", frames: F(dStart - cStart) + 10, transition: { type: "whip", frames: 10 }, chapter: "2 Length", render: () => <ChartScene start={cStart} /> },
      { id: "length", frames: F(eStart - dStart) + 14, transition: { type: "zoom", frames: 14 }, chapter: "3 Clocks",
        render: () => <><LengthScene /><Labels items={[{ f: 8, dur: F(2.6), title: "1 m  vs  4 m", sub: "2.0 s  vs  4.0 s per swing" }]} /></> },
      { id: "moon", frames: F(endStart - eStart) + 14, transition: { type: "crossfade", frames: 14 }, chapter: "4 Moon",
        render: () => <><MoonScene /><Labels items={[{ f: F(at(66) - eStart), dur: F(3.2), title: `g = ${GM} m/s²`, sub: `period × ${Math.sqrt(G / GM).toFixed(2)}` }]} /></> },
      { id: "end", frames: F(3.0), transition: { type: "crossfade", frames: 16 }, render: () => <EndCard /> },
    ];
  },
  overlay: () => <Captions words={words} style="subtitle" />,
};
export const _ = { rng, springAt, ease };
