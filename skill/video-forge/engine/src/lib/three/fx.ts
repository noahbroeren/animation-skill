/**
 * Flat 2D cartoon effects composited into the 3D world (measured on 2D-in-3D story shorts:
 * sparkles on impact, dust puffs, speed lines, splashes, music notes, stars, glow/aura
 * bursts, light shafts -- "all flat 2D cartoon sprites composited into the 3D scene").
 *
 * Every effect is a camera-facing card on NOINK, drawn procedurally per frame from
 * (frame - startFrame) => fully deterministic. Usage:
 *   const fx = new FxLayer(scene);  fx.add("sparkle", { at: [x,y,z], f0: 120, size: 1.2 });
 *   // in update(): fx.update(frame, fps, cam.pos)
 */
import * as THREE from "three";
import { clamp, ease, rng } from "../time";
import { NOINK } from "./post";

export type FxKind = "sparkle" | "impact" | "dust" | "speedlines" | "splash" | "notes" | "stars" | "aura" | "shaft" | "smoke" | "sweat" | "question" | "exclaim";
export type FxSpec = { at: [number, number, number]; f0: number; size?: number; dur?: number; color?: string; seed?: string; dir?: number };

const DUR: Record<FxKind, number> = { sparkle: 20, impact: 12, dust: 26, speedlines: 18, splash: 24, notes: 60, stars: 40, aura: 30, shaft: 90, smoke: 45, sweat: 30, question: 40, exclaim: 22 };
const INK = "#120c18";

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, pts = 4, inner = 0.38) {
  g.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * inner : r;
    i ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

/** Draw effect `kind` at normalized time u (0..1) into a square canvas of size S. */
export function drawFx(g: CanvasRenderingContext2D, kind: FxKind, u: number, S: number, color: string, seed: string, dir = 0) {
  const r = rng(seed);
  const c = S / 2, lw = S * 0.012;
  g.clearRect(0, 0, S, S);
  g.lineJoin = "round"; g.lineCap = "round";
  const pop = ease.outBack(clamp(u * 3)), fade = 1 - ease.inCubic(clamp((u - 0.55) / 0.45));
  g.globalAlpha = fade;
  switch (kind) {
    case "sparkle": case "stars": {
      const n = kind === "stars" ? 5 : 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.6, d = S * (0.12 + 0.3 * ease.outCubic(u)) * (0.7 + r() * 0.5);
        const x = c + Math.cos(a) * d, y = c + Math.sin(a) * d - (kind === "stars" ? S * 0.15 * u : 0);
        const rr = S * (0.035 + r() * 0.04) * pop * (1 - u * 0.4);
        star(g, x, y, rr, kind === "stars" ? 5 : 4, kind === "stars" ? 0.45 : 0.3);
        g.fillStyle = i % 2 ? color : "#ffffff"; g.fill(); g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
      }
      break;
    }
    case "impact": {
      star(g, c, c, S * 0.36 * pop, 9, 0.55);
      g.fillStyle = "#fff3b0"; g.fill(); g.strokeStyle = INK; g.lineWidth = lw * 1.2; g.stroke();
      star(g, c, c, S * 0.2 * pop, 9, 0.55); g.fillStyle = color; g.fill();
      break;
    }
    case "dust": case "smoke": {
      const n = kind === "dust" ? 6 : 5;
      for (let i = 0; i < n; i++) {
        const a = (kind === "dust" ? Math.PI : Math.PI * 1.5) + (r() - 0.5) * (kind === "dust" ? 3 : 1.2);
        const d = S * 0.28 * ease.outCubic(u) * (0.6 + r() * 0.6);
        const x = c + Math.cos(a) * d * (kind === "dust" ? 1.3 : 0.5), y = (kind === "dust" ? S * 0.8 : c) + Math.sin(a) * d * (kind === "dust" ? 0.35 : 1);
        const rr = S * (0.06 + r() * 0.05) * (0.5 + u);
        g.beginPath(); g.arc(x, y, rr, 0, 7);
        g.fillStyle = kind === "dust" ? "#e8dcc4" : "#d9dbe3"; g.fill(); g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
      }
      break;
    }
    case "speedlines": {
      g.strokeStyle = "#ffffff"; g.lineWidth = lw * 1.6;
      for (let i = 0; i < 9; i++) {
        const y = S * (0.15 + 0.7 * r()), len = S * (0.25 + 0.35 * r()), x0 = S * (0.05 + 0.3 * r()) + u * S * 0.3;
        g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + len, y); g.stroke();
      }
      break;
    }
    case "splash": {
      for (let i = 0; i < 8; i++) {
        const a = Math.PI * (1.1 + 0.8 * (i / 7)), d = S * 0.32 * ease.outCubic(u);
        const x = c + Math.cos(a) * d, y = S * 0.7 + Math.sin(a) * d + S * 0.3 * u * u;
        g.beginPath(); g.ellipse(x, y, S * 0.035, S * 0.055, a + Math.PI / 2, 0, 7);
        g.fillStyle = color; g.fill(); g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
      }
      break;
    }
    case "notes": {
      for (let i = 0; i < 3; i++) {
        const t = clamp(u * 1.3 - i * 0.15);
        const x = c + Math.sin(t * 6 + i) * S * 0.12 + (i - 1) * S * 0.12, y = S * 0.8 - t * S * 0.6;
        g.globalAlpha = fade * clamp(t * 5);
        g.fillStyle = INK; g.beginPath(); g.ellipse(x, y, S * 0.045, S * 0.032, -0.4, 0, 7); g.fill();
        g.fillRect(x + S * 0.035, y - S * 0.14, lw * 1.5, S * 0.14);
        g.fillRect(x + S * 0.035, y - S * 0.14, S * 0.06, lw * 2.5);
      }
      break;
    }
    case "aura": {
      const R = S * (0.25 + 0.2 * ease.outCubic(u));
      const gr = g.createRadialGradient(c, c, R * 0.2, c, c, R);
      gr.addColorStop(0, color); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, 7); g.fill();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + u; g.strokeStyle = color; g.lineWidth = lw * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * R * 0.6, c + Math.sin(a) * R * 0.6); g.lineTo(c + Math.cos(a) * R * 1.1, c + Math.sin(a) * R * 1.1); g.stroke(); }
      break;
    }
    case "shaft": {
      g.globalAlpha = 0.35 * Math.sin(Math.PI * clamp(u));
      const gr = g.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, color); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      for (let i = 0; i < 3; i++) { const x = S * (0.2 + 0.25 * i); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + S * 0.12, 0); g.lineTo(x + S * 0.3, S); g.lineTo(x + S * 0.1, S); g.fill(); }
      break;
    }
    case "sweat": {
      const y = S * 0.3 + ease.inCubic(u) * S * 0.4;
      g.beginPath(); g.moveTo(c, y - S * 0.1); g.quadraticCurveTo(c + S * 0.07, y, c, y + S * 0.05); g.quadraticCurveTo(c - S * 0.07, y, c, y - S * 0.1);
      g.fillStyle = "#9fd4ff"; g.fill(); g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
      break;
    }
    case "question": case "exclaim": {
      g.font = `900 ${S * 0.5 * pop}px Arial Black, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = lw * 3; g.strokeStyle = INK; const ch = kind === "question" ? "?" : "!";
      g.strokeText(ch, c, c - u * S * 0.05); g.fillStyle = color; g.fillText(ch, c, c - u * S * 0.05);
      break;
    }
  }
  if (dir) { /* reserved for directional variants */ }
  g.globalAlpha = 1;
}

type Live = { kind: FxKind; spec: FxSpec; mesh: THREE.Mesh; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; S: number; dur: number };

export class FxLayer {
  private items: Live[] = [];
  constructor(private scene: THREE.Scene, private texPx = 512) {}

  add(kind: FxKind, spec: FxSpec) {
    const S = this.texPx;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d")!;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const size = spec.size ?? 1;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    mesh.layers.set(NOINK);
    mesh.position.set(...spec.at);
    mesh.visible = false;
    mesh.renderOrder = 5;
    this.scene.add(mesh);
    this.items.push({ kind, spec, mesh, g, tex, S, dur: spec.dur ?? DUR[kind] });
    return this;
  }

  /** Call every frame (pure: depends only on frame). */
  update(frame: number, camPos: [number, number, number], fps = 30) {
    for (const it of this.items) {
      const u = (frame - it.spec.f0) / (it.dur * fps / 30); // durations are authored in frames @30
      const on = u >= 0 && u <= 1;
      it.mesh.visible = on;
      if (!on) continue;
      drawFx(it.g, it.kind, u, it.S, it.spec.color ?? "#ffd23f", it.spec.seed ?? `${it.kind}${it.spec.f0}`, it.spec.dir);
      it.tex.needsUpdate = true;
      it.mesh.lookAt(...camPos);
    }
  }
}
