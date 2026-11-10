/**
 * DEMO SHORT -- "Each lighthouse blinks its own name" (9:16, ~23 s, cartoon-ink look).
 *
 * Built with the measured reference grammar:
 *  - hook = paradox in sentence 1, "You see," pivot, payoff line last (script.txt)
 *  - ONE persistent world, camera TRAVELS between moments (dusk hero -> boat -> crane
 *    to aerial), a single hard cut; glides 22-40 frames with C2 easing; creep on holds
 *  - lighting arc: warm dusk set-up -> deep night blue for the explanation
 *  - the flash pattern is ONE function driving the 3D lamp, the 2D diagram and the SFX
 *    plan (audio_plan.json) => picture, graphics and sound can't drift apart.
 * Facts: lighthouses have distinct "light characteristics" (e.g. Fl(2)) so sailors can
 * identify them; these are published in "List of Lights" books (US NGA/USCG, UK Admiralty).
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { cameraRig } from "../../lib/camera";
import { blinkAt, CharacterSpec, idlePose, mergePose, mouthAt } from "../../lib/characters/toon";
import { resolveLook } from "../../lib/look";
import { ProjectDef } from "../../lib/project";
import { CharacterCard } from "../../lib/three/cast";
import { NOINK } from "../../lib/three/post";
import { Stage3D } from "../../lib/three/Stage3D";
import { boat, cloudCard, hill, lighthouse, lights, rock, sky, stars, tree, water } from "../../lib/three/world";
import { Captions, FONTS, useU } from "../../lib/two/text";
import { clamp, ease, lerp, springAt, tween } from "../../lib/time";
import WORDS from "./words.json";

export const VO_OFFSET = 0.15; // s
const words = WORDS.map((w) => ({ ...w, start: w.start + VO_OFFSET, end: w.end + VO_OFFSET }));
const at = (i: number) => words[i].start; // word index -> seconds
const W = (txt: string, from = 0) => words.findIndex((w, i) => i >= from && w.word.toLowerCase().startsWith(txt.toLowerCase()));

/** Light characteristic "Fl(2) L 6s": two quick flashes, pause, one long flash, dark. Phase-locked to the words. */
export const PERIOD = 6.0;
export const PATTERN: [number, number][] = [[0, 0.3], [0.45, 0.75], [2.2, 3.7]];
export const PATTERN_T0 = 0; // set below from the word "Two"
const flashK = (t: number, t0: number, pattern = PATTERN, period = PERIOD) => {
  const ph = ((((t - t0) % period) + period) % period);
  let k = 0;
  for (const [a, b] of pattern) {
    const up = clamp((ph - a) / 0.06), down = clamp((b - ph) / 0.08);
    k = Math.max(k, Math.min(up, down));
  }
  return k;
};

const sailor: CharacterSpec = {
  id: "sailor", skin: "#e9b892", hair: { color: "#3b2a20", style: "short" }, beard: "#4a3426",
  top: { color: "#f2c230", style: "coat", accent: "#c79a12" }, bottom: { color: "#2d3c5c" }, shoes: "#2a2320",
  hat: { style: "beanie", color: "#24365e" }, heightHeads: 3.5,
};

export const timing = (fps: number) => {
  const F = (s: number) => Math.round(s * fps);
  const tTwo = at(W("Two"));
  return {
    F, tTwo,
    total: F(words[words.length - 1].end + 1.5),
    travel1: F(at(W("At")) + 0.15), // dusk hero -> boat
    rack: F(at(W("tiny")) + 0.25), // pan/rack to the distant light
    crane: F(at(W("You")) + 0.75), // "You see" -> crane up to aerial
    cut: F(at(W("Sailors")) - 0.2), // the one hard cut
    book: F(at(W("book"))),
    happy: F(at(W("exactly"))),
    travel2: F(at(W("So", 60)) + 0.1),
    here: F(at(W("here"))),
  };
};

const BOAT: [number, number, number] = [30, 0, 60];

const World: React.FC = () => {
  const { fps } = useVideoConfig();
  const T = timing(fps);
  const lh: [number, number, number] = [0, 4.2, 0];
  const rig = cameraRig([
    { f: 0, pos: [11, 3.2, 24], look: [0, 15, 0], fov: 36 },
    { f: T.travel1 - 22, pos: [8, 5.5, 17], look: [0, 16, 0], fov: 34, glide: T.travel1 - 22 },
    { f: T.travel1 + 4, pos: [37.2, 3.4, 71.2], look: [30, 1.7, 60], fov: 32, glide: 26 },
    { f: T.rack + 34, pos: [35.5, 3.0, 69.5], look: [6, 17, 6], fov: 28, glide: 34, focus: 72 },
    { f: T.crane + 30, pos: [34, 125, 150], look: [-2, 0, -120], fov: 42, glide: 32, focus: 220 },
    { f: T.cut - 1, pos: [24, 112, 128], look: [-2, 0, -125], fov: 42, glide: T.cut - T.crane - 31, focus: 210 },
    { f: T.cut, pos: [33.9, 2.1, 66.1], look: [30.2, 1.35, 60.2], fov: 30, cut: true },
    { f: T.travel2 + 26, pos: [15, 3.2, 27], look: [0, 16, 0], fov: 36, glide: 28, focus: 30 },
    { f: T.total + 10, pos: [26, 11, 44], look: [0, 18, 0], fov: 38, glide: T.total + 10 - (T.travel2 + 26) },
  ], { creep: 0.012, handheld: 0.03, kicks: [{ f: T.here, amp: 0.25 }] });

  return (
    <Stage3D
      look={resolveLook("cartoon-ink", { dof: { enabled: true, maxBlur: 10, aperture: 1.1 }, bloom: { enabled: true, threshold: 0.75, strength: 0.6, radius: 1.4 }, ink: { distFar: 160 } })}
      build={({ scene }) => {
        const skyMesh = sky(scene, "#f08a5d", "#ffd2a1");
        const L = lights(scene, "night", { shadowSize: 70, target: [15, 0, 30], fog: [90, 700] });
        L.sun.color.set("#aebfff"); L.sun.intensity = 1.2;
        stars(scene, 2500);
        const sea = water(3000);
        scene.add(sea.mesh);
        // headland
        const hd = hill({ r: 26, h: 4.6, color: "#5f9a48" }); scene.add(hd);
        for (let i = 0; i < 14; i++) { const r = rock({ s: 1.6 + (i % 4), seed: "hr" + i }); const a = (i / 14) * Math.PI * 2; r.position.set(Math.cos(a) * 24, 0.2, Math.sin(a) * 24); r.rotation.y = a * 3; scene.add(r); }
        for (let i = 0; i < 5; i++) { const t = tree({ kind: "pine", seed: "ht" + i, h: 5 + i * 0.6 }); t.position.set(-9 + i * 3.5, 3.2, -8 - (i % 2) * 3); scene.add(t); }
        const L1 = lighthouse({ h: 16, seed: "main" }); L1.group.position.set(...lh); scene.add(L1.group);
        // the coast with neighbouring lights (different characteristics)
        const coast: { x: number; z: number }[] = [{ x: -38, z: -150 }, { x: 34, z: -290 }]; // stacked in depth: reads in a 9:16 aerial
        const others = coast.map((c, i) => {
          const hl = hill({ r: 60, h: 9, color: "#4f8a3e" }); hl.position.set(c.x, 0, c.z - 30); scene.add(hl);
          const lt = lighthouse({ h: 14, stripe: i ? "#2f5fa8" : "#2b2b33", seed: "o" + i }); lt.group.position.set(c.x, 8, c.z); scene.add(lt.group);
          return lt;
        });
        const bt = boat(); bt.position.set(...BOAT); bt.rotation.y = 0.6; scene.add(bt);
        const lantern = new THREE.PointLight("#ffb35c", 6, 9, 1.5); scene.add(lantern);
        const moon = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.0), fog: false }));
        moon.position.set(-160, 230, -620); moon.layers.set(NOINK); scene.add(moon);
        const clouds = [0, 1, 2, 3].map((i) => { const c = cloudCard({ seed: "nc" + i, w: 90, color: "#4b5a92" }); c.position.set(-220 + i * 150, 150 + (i % 2) * 40, -560); scene.add(c); return c; });
        const card = new CharacterCard(sailor, 1.75, 1600, L.sun);
        scene.add(card.group);
        return { skyMesh, L, sea, L1, others, bt, card, lantern, clouds };
      }}
      update={(w, f, { fps: FPS }) => {
        const t = f / FPS;
        const cam = rig.at(f, FPS);
        // lighting arc: dusk -> night blue by the explanation
        const night = ease.smoother(clamp((f - T.travel1 + 20) / (T.crane - T.travel1 + 20)));
        const u = (w.skyMesh.material as THREE.ShaderMaterial).uniforms;
        (u.top.value as THREE.Color).set("#f08a5d").lerp(new THREE.Color("#0c1440"), night);
        (u.horizon.value as THREE.Color).set("#ffd2a1").lerp(new THREE.Color("#2c3f86"), night);
        (u.bottom.value as THREE.Color).copy(u.horizon.value);
        w.L.hemi.color.set("#ffc9a0").lerp(new THREE.Color("#3a4a9a"), night);
        w.L.hemi.groundColor.set("#6a4a3a").lerp(new THREE.Color("#141a36"), night);
        w.L.hemi.intensity = lerp(1.3, 0.75, night);
        w.L.sun.color.set("#ffb784").lerp(new THREE.Color("#9fb3ff"), night);
        w.L.sun.intensity = lerp(2.0, 1.1, night);
        (w.L.sun.parent as THREE.Scene).fog!.color.set("#f3a77a").lerp(new THREE.Color("#18224f"), night);
        // lights
        let k = flashK(t, T.tTwo);
        if (f >= T.here - 2) k = Math.max(k, 1.4 * Math.exp(-(f - T.here + 2) / 20)); // payoff flash
        w.L1.set(k, t * 0.9);
        w.others[0].set(flashK(t, 0.4, [[0, 0.35]], 3.0), -t * 0.8 + 1);
        w.others[1].set(flashK(t, 0.2, [[0, 2.4]], 3.0), t * 0.7 + 2); // occulting: mostly on
        w.sea.update(f);
        // boat bob + sailor
        const bob = Math.sin(t * 1.3) * 0.08, roll = Math.sin(t * 1.05) * 0.05;
        w.bt.position.y = bob - 0.05; w.bt.rotation.z = roll;
        const sx = BOAT[0] + 0.3, sz = BOAT[2] + 0.2;
        w.card.place(sx, bob + 0.42, sz, cam.pos);
        w.lantern.position.set(sx - 0.7, bob + 1.5, sz + 0.5);
        const expr = f >= T.happy ? "happy" : f >= T.cut ? "think" : f >= T.rack ? "nervous" : "neutral";
        const lookDir: [number, number] = f >= T.rack && f < T.crane ? [-0.8, -0.6] : f >= T.cut && f < T.happy ? [0.6, 0.5] : [0, 0];
        w.card.setPose(mergePose(idlePose(f, FPS, 3), {
          expr, look: lookDir, blink: blinkAt(f, FPS, "sailor", [T.rack, T.cut, T.happy]),
          lean: roll * 20, prop: f >= T.cut && f < T.travel2 + 10 ? "book" : undefined,
        }));
        for (const c of w.clouds) c.lookAt(cam.pos[0], c.position.y, cam.pos[2]);
        return cam;
      }}
    />
  );
};

/** 2D diagram of the light characteristic, phase-locked to the same flashK() as the 3D lamp. */
const PatternStrip: React.FC<{ from: number; to: number }> = ({ from, to }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, width, height } = useU();
  const T = timing(fps);
  if (f < from || f > to) return null;
  const t = f / fps;
  const inn = ease.outExpo(clamp((f - from) / 16)), out = clamp((f - to + 12) / 12);
  const appear = [at(W("Two")), at(W("quick")) + 0.1, at(W("One", 40))];
  const bw = width * 0.78, x0 = (width - bw) / 2, y0 = height * 0.12, bh = 120 * u;
  const ph = ((t - T.tTwo) % PERIOD + PERIOD) % PERIOD;
  return (
    <AbsoluteFill style={{ opacity: inn * (1 - out) }}>
      <div style={{ position: "absolute", left: x0, top: y0, width: bw, height: bh * 2.1, background: "rgba(8,12,34,0.72)", borderRadius: 26 * u, border: `${2 * u}px solid rgba(255,226,160,0.35)` }}>
        <div style={{ position: "absolute", left: 30 * u, top: 18 * u, fontFamily: FONTS.mono, fontSize: 30 * u, color: "#ffe2a0", letterSpacing: "0.12em" }}>Fl(2) L &nbsp;·&nbsp; 6 s</div>
        <svg width={bw} height={bh * 1.4} style={{ position: "absolute", left: 0, top: bh * 0.62 }} viewBox={`0 0 ${bw} ${bh * 1.4}`}>
          <line x1={30 * u} y1={bh * 0.7} x2={bw - 30 * u} y2={bh * 0.7} stroke="rgba(255,255,255,0.25)" strokeWidth={3 * u} />
          {PATTERN.map(([a, b], i) => {
            const s = springAt(t - appear[i], 3, 0.5);
            const xa = 30 * u + (a / PERIOD) * (bw - 60 * u), xb = 30 * u + (b / PERIOD) * (bw - 60 * u);
            const lit = ph >= a && ph <= b && t > appear[i];
            return <rect key={i} x={xa} y={bh * 0.7 - 28 * u * s} width={Math.max(8 * u, xb - xa)} height={56 * u * s} rx={28 * u} fill={lit ? "#fff3c4" : "#ffcf6a"} style={{ filter: lit ? `drop-shadow(0 0 ${18 * u}px #ffd46a)` : undefined }} opacity={clamp(s)} />;
          })}
          {t > appear[0] && <rect x={30 * u + (ph / PERIOD) * (bw - 60 * u)} y={bh * 0.2} width={4 * u} height={bh} fill="rgba(255,255,255,0.8)" />}
        </svg>
      </div>
    </AbsoluteFill>
  );
};

const BookCard: React.FC<{ from: number; to: number }> = ({ from, to }) => {
  const f = useCurrentFrame();
  const { u, width, height } = useU();
  if (f < from || f > to) return null;
  const s = springAt((f - from) / 30, 1.8, 0.62), out = ease.inCubic(clamp((f - to + 10) / 10));
  const rows = [["Cape Wren", "Fl 3s", "31 m"], ["Grey Point", "Fl(2) L 6s", "42 m"], ["North Holm", "Oc 3s", "27 m"]];
  return (
    <div style={{ position: "absolute", left: width * 0.1, top: height * 0.1, width: width * 0.8, transform: `translateY(${(1 - s) * 200 * u + out * -80 * u}px) rotate(${(1 - s) * -6}deg)`, opacity: clamp(s * 1.5) * (1 - out),
      background: "#f6ecd2", borderRadius: 18 * u, padding: 36 * u, boxShadow: `0 ${20 * u}px ${50 * u}px rgba(0,0,0,0.45)`, border: `${3 * u}px solid #2b2118` }}>
      <div style={{ fontFamily: FONTS.serif, fontWeight: 700, fontSize: 52 * u, color: "#2b2118", letterSpacing: "0.06em", textAlign: "center" }}>LIST OF LIGHTS</div>
      <div style={{ height: 3 * u, background: "#2b2118", margin: `${16 * u}px 0 ${18 * u}px` }} />
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: FONTS.mono, fontSize: 34 * u, color: "#2b2118", padding: `${10 * u}px ${14 * u}px`, borderRadius: 10 * u,
          background: i === 1 && f > from + 20 ? `rgba(255,196,64,${0.55 * clamp((f - from - 20) / 10)})` : "transparent" }}>
          <span>{r[0]}</span><span>{r[1]}</span><span>{r[2]}</span>
        </div>
      ))}
      <div style={{ fontFamily: FONTS.body, fontSize: 22 * u, color: "#6b5a44", marginTop: 14 * u, textAlign: "center" }}>illustrative entries</div>
    </div>
  );
};

export const lighthouseShort: ProjectDef = {
  id: "lighthouse", title: "Each lighthouse blinks its own name", defaultFormat: "short", fps: 30,
  audio: "lighthouse/master.wav",
  scenes: ({ fps }) => {
    const T = timing(fps);
    return [{
      id: "world", frames: T.total, innerCuts: [T.cut], events: [T.book - 6, T.here, T.F(at(W("Two")) - 0.3)],
      render: () => (
        <>
          <World />
          <PatternStrip from={T.F(at(W("Two")) - 0.3)} to={T.cut - 2} />
          <BookCard from={T.book - 6} to={T.travel2 - 4} />
          <Captions words={words} style="pop" />
        </>
      ),
    }];
  },
};

export { words as lighthouseWords };
export const _unused = { tween, mouthAt };
