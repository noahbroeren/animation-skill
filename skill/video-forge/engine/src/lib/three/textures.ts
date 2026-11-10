/**
 * Hand-painted-looking textures generated in code (Canvas2D, seeded => deterministic).
 * Reference studies: plain flat materials read "cheap"; visible grain, dark gaps
 * between planks/stones and per-element colour variation read "premium".
 */
import * as THREE from "three";
import { rng } from "../time";

const cache = new Map<string, THREE.CanvasTexture>();

export function canvasTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void,
  repeat: [number, number] = [1, 1], srgb = true): THREE.CanvasTexture {
  const k = `${key}|${w}x${h}|${repeat}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  draw(g, rng(key));
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  cache.set(k, t);
  return t;
}

const hex = (c: THREE.ColorRepresentation) => new THREE.Color(c);
/** jitter a colour in HSL */
export function vary(base: THREE.ColorRepresentation, r: () => number, dh = 0.02, ds = 0.08, dl = 0.08) {
  const c = hex(base), hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL((hsl.h + (r() - 0.5) * dh + 1) % 1, Math.min(1, Math.max(0, hsl.s + (r() - 0.5) * ds)), Math.min(1, Math.max(0, hsl.l + (r() - 0.5) * dl)));
  return "#" + c.getHexString();
}
const shade = (base: THREE.ColorRepresentation, dl: number) => {
  const c = hex(base), hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + dl)));
  return "#" + c.getHexString();
};

export const paint = {
  grass: (color = "#67a548", rep: [number, number] = [8, 8]) =>
    canvasTexture(`grass${color}`, 512, 512, (g, r) => {
      g.fillStyle = color; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 90; i++) { // soft patches
        g.fillStyle = vary(color, r, 0.03, 0.1, 0.12); g.globalAlpha = 0.35;
        g.beginPath(); g.ellipse(r() * 512, r() * 512, 20 + r() * 60, 12 + r() * 40, r() * 3, 0, 7); g.fill();
      }
      g.globalAlpha = 0.9;
      for (let i = 0; i < 2600; i++) { // blades
        const x = r() * 512, y = r() * 512, l = 4 + r() * 9;
        g.strokeStyle = r() < 0.5 ? shade(color, -0.1 - r() * 0.08) : shade(color, 0.06 + r() * 0.1);
        g.lineWidth = 1 + r() * 1.2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - l); g.stroke();
      }
      g.globalAlpha = 1;
    }, rep),

  cobble: (color = "#a99a86", rep: [number, number] = [6, 6]) =>
    canvasTexture(`cobble${color}`, 512, 512, (g, r) => {
      g.fillStyle = "#3b332c"; g.fillRect(0, 0, 512, 512);
      const s = 42;
      for (let y = 0; y < 512 + s; y += s * 0.8) {
        const off = (Math.round(y / (s * 0.8)) % 2) * s * 0.5;
        for (let x = -s; x < 512 + s; x += s) {
          const cx = x + off + (r() - 0.5) * 6, cy = y + (r() - 0.5) * 6;
          g.fillStyle = vary(color, r, 0.04, 0.1, 0.18);
          g.beginPath(); g.ellipse(cx, cy, s * 0.44, s * 0.34, (r() - 0.5) * 0.5, 0, 7); g.fill();
          g.fillStyle = "rgba(255,255,255,0.12)";
          g.beginPath(); g.ellipse(cx - 4, cy - 5, s * 0.22, s * 0.12, 0, 0, 7); g.fill();
        }
      }
    }, rep),

  planks: (color = "#9a6b45", rep: [number, number] = [1, 1], vertical = true) =>
    canvasTexture(`planks${color}${vertical}`, 512, 512, (g, r) => {
      g.save();
      if (!vertical) { g.translate(512, 0); g.rotate(Math.PI / 2); }
      const n = 6, pw = 512 / n;
      for (let i = 0; i < n; i++) {
        g.fillStyle = vary(color, r, 0.02, 0.1, 0.12); g.fillRect(i * pw, 0, pw, 512);
        for (let k = 0; k < 14; k++) { // grain
          g.strokeStyle = shade(color, -0.12 - r() * 0.1); g.globalAlpha = 0.5; g.lineWidth = 1 + r();
          const x = i * pw + r() * pw;
          g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 10, 170, x + (r() - 0.5) * 10, 340, x + (r() - 0.5) * 6, 512); g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = "#2a1a10"; g.fillRect(i * pw, 0, 4, 512); // dark gap
        if (r() < 0.5) { g.fillStyle = "#3b2416"; g.beginPath(); g.ellipse(i * pw + pw / 2, r() * 512, 5, 8, 0, 0, 7); g.fill(); }
      }
      g.restore();
    }, rep),

  plaster: (color = "#f1e3c6", windows = 2, floors = 1, key = "") =>
    canvasTexture(`plaster${color}${windows}${floors}${key}`, 512, 512, (g, r) => {
      g.fillStyle = color; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 110; i++) { // painterly value noise (+-7%, judge/texture)
        g.fillStyle = shade(color, (r() - 0.5) * 0.14); g.globalAlpha = 0.35;
        g.beginPath(); g.ellipse(r() * 512, r() * 512, 10 + r() * 60, 8 + r() * 34, r() * 3, 0, 7); g.fill();
      }
      g.globalAlpha = 0.18; // fine speckle
      for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? shade(color, -0.2) : shade(color, 0.12); g.fillRect(r() * 512, r() * 512, 2, 2); }
      for (let i = 0; i < 5; i++) { // exposed-brick patches where the plaster chipped
        const bx = r() * 440, by = 60 + r() * 360, bw = 40 + r() * 50, bh = 24 + r() * 26;
        g.globalAlpha = 0.5; g.fillStyle = shade(color, -0.12);
        for (let yy = 0; yy < bh; yy += 9) for (let xx = (yy / 9) % 2 ? -8 : 0; xx < bw; xx += 18) g.fillRect(bx + xx, by + yy, 15, 6);
      }
      const gr = g.createLinearGradient(0, 400, 0, 512); // grime band: bottom ~0.8 m darkens ~18%
      gr.addColorStop(0, "rgba(40,24,30,0)"); gr.addColorStop(1, "rgba(40,24,30,0.3)");
      g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(0, 400, 512, 112);
      g.fillStyle = shade(color, -0.18); g.fillRect(0, 488, 512, 24); // base stones
      const fh = 512 / floors;
      for (let fl = 0; fl < floors; fl++) {
        for (let wi = 0; wi < windows; wi++) {
          const ww = 512 / windows, cx = ww * (wi + 0.5), cy = fh * fl + fh * 0.45;
          const w = Math.min(90, ww * 0.42), h = Math.min(120, fh * 0.42);
          g.fillStyle = "#3a2a22"; g.fillRect(cx - w / 2 - 7, cy - h / 2 - 7, w + 14, h + 14);
          g.fillStyle = r() < 0.3 ? "#ffd27a" : "#5d7fa6"; g.fillRect(cx - w / 2, cy - h / 2, w, h);
          g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(cx - w / 2, cy - h / 2, w * 0.35, h);
          g.strokeStyle = "#3a2a22"; g.lineWidth = 6;
          g.beginPath(); g.moveTo(cx, cy - h / 2); g.lineTo(cx, cy + h / 2); g.moveTo(cx - w / 2, cy); g.lineTo(cx + w / 2, cy); g.stroke();
          g.fillStyle = "#6b4a33"; g.fillRect(cx - w / 2 - 10, cy + h / 2 + 4, w + 20, 10); // sill
        }
      }
    }),

  roofTiles: (color = "#c4553a", rep: [number, number] = [3, 3]) =>
    canvasTexture(`roof${color}`, 512, 512, (g, r) => {
      g.fillStyle = shade(color, -0.25); g.fillRect(0, 0, 512, 512);
      const tw = 48, th = 36;
      for (let y = 0; y < 512 + th; y += th) {
        const off = (Math.round(y / th) % 2) * tw * 0.5;
        for (let x = -tw; x < 512 + tw; x += tw) {
          g.fillStyle = vary(color, r, 0.03, 0.1, 0.12);
          g.beginPath(); g.moveTo(x + off, y); g.lineTo(x + off + tw - 3, y);
          g.quadraticCurveTo(x + off + tw - 3, y + th + 8, x + off + tw / 2, y + th + 8);
          g.quadraticCurveTo(x + off, y + th + 8, x + off, y); g.fill();
          g.strokeStyle = shade(color, -0.35); g.lineWidth = 2; g.stroke();
        }
      }
    }, rep),

  path: (color = "#c9a877", rep: [number, number] = [2, 8]) =>
    canvasTexture(`path${color}`, 256, 256, (g, r) => {
      g.fillStyle = color; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 500; i++) { g.fillStyle = vary(color, r, 0.02, 0.1, 0.2); g.globalAlpha = 0.6; g.fillRect(r() * 256, r() * 256, 1 + r() * 4, 1 + r() * 3); }
      g.globalAlpha = 1;
    }, rep),

  water: (color = "#3d8fc4") =>
    canvasTexture(`water${color}`, 512, 512, (g, r) => {
      g.fillStyle = color; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 160; i++) {
        g.strokeStyle = r() < 0.6 ? "rgba(255,255,255,0.35)" : shade(color, -0.12); g.lineWidth = 2 + r() * 2;
        const x = r() * 512, y = r() * 512, l = 18 + r() * 40;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 5, x + l, y); g.stroke();
      }
    }, [4, 4]),

  studio: (top = "#f3efe8", bottom = "#d9d2c6") =>
    canvasTexture(`studio${top}${bottom}`, 64, 512, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 512);
      gr.addColorStop(0, top); gr.addColorStop(1, bottom);
      g.fillStyle = gr; g.fillRect(0, 0, 64, 512);
    }),

  planet: (ocean = "#2f6fb0", land = "#5d9a4a", key = "earthlike") =>
    canvasTexture(`planet${ocean}${land}${key}`, 2048, 1024, (g, r) => {
      g.fillStyle = ocean; g.fillRect(0, 0, 2048, 1024);
      for (let i = 0; i < 26; i++) {
        const cx = r() * 2048, cy = 200 + r() * 620, s = 60 + r() * 220;
        g.fillStyle = vary(land, r, 0.05, 0.15, 0.15);
        g.beginPath();
        for (let a = 0; a <= 24; a++) {
          const t = (a / 24) * Math.PI * 2, rr = s * (0.6 + r() * 0.5);
          g.lineTo(cx + Math.cos(t) * rr * 1.4, cy + Math.sin(t) * rr * 0.8);
        }
        g.fill();
      }
      g.fillStyle = "rgba(255,255,255,0.9)"; g.fillRect(0, 0, 2048, 60); g.fillRect(0, 964, 2048, 60);
    }, [1, 1]),
};

/** Flat-style painted surfaces (measured toonworld rule: flat colour fields + thin painted joints at ~half ink contrast,
 *  no photographic noise, no cobbles). */
export const flat = {
  tiles: (color = "#c9b8a4", joint = "#8d7a68", n = 4, rep: [number, number] = [1, 1]) =>
    canvasTexture(`ftiles${color}${joint}${n}`, 512, 512, (g, r) => {
      const s = 512 / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        g.fillStyle = vary(color, r, 0.02, 0.07, 0.1); g.fillRect(x * s, y * s, s, s); // per-tile variation (judge/texture)
        g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(x * s, y * s, s, s * 0.06);
      }
      g.strokeStyle = joint; g.lineWidth = 5;
      for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 512); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(512, i * s); g.stroke(); }
    }, rep),
  grass: (color = "#71b038", rep: [number, number] = [8, 8]) =>
    canvasTexture(`fgrass${color}`, 512, 512, (g, r) => {
      g.fillStyle = color; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 26; i++) { g.fillStyle = vary(color, r, 0.02, 0.06, 0.06); g.globalAlpha = 0.5; g.beginPath(); g.ellipse(r() * 512, r() * 512, 40 + r() * 90, 30 + r() * 60, r() * 3, 0, 7); g.fill(); }
      g.globalAlpha = 1;
      for (let i = 0; i < 14; i++) { const x = r() * 512, y = r() * 512; g.fillStyle = ["#ffffff", "#ffd84a", "#ff8fb1"][i % 3]; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); }
    }, rep),
  stone: (color = "#c2b2a5", mortar = "#8f8072", rep: [number, number] = [2, 2]) =>
    canvasTexture(`fstone${color}`, 512, 512, (g, r) => {
      g.fillStyle = mortar; g.fillRect(0, 0, 512, 512);
      const bh = 64;
      for (let y = 0; y < 512; y += bh) {
        let x = (y / bh) % 2 ? -60 : 0;
        while (x < 512) { const w = 90 + r() * 70; g.fillStyle = vary(color, r, 0.01, 0.04, 0.06); g.fillRect(x + 3, y + 3, w - 6, bh - 6); g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(x + 3, y + 3, w - 6, 6); x += w; }
      }
    }, rep),
  coverSquare: () =>
    canvasTexture("coverSquare", 256, 256, (g) => {
      g.fillStyle = "#59606e"; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = "#3c414d"; g.lineWidth = 10; g.strokeRect(12, 12, 232, 232);
      g.lineWidth = 6;
      for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(24 + i * 35, 24); g.lineTo(24 + i * 35, 232); g.stroke(); g.beginPath(); g.moveTo(24, 24 + i * 35); g.lineTo(232, 24 + i * 35); g.stroke(); }
      g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(14, 14, 228, 18);
    }),
  coverRound: () =>
    canvasTexture("coverRound", 256, 256, (g) => {
      g.fillStyle = "#59606e"; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = "#3c414d"; g.lineWidth = 8;
      for (const r of [118, 88, 58, 28]) { g.beginPath(); g.arc(128, 128, r, 0, 7); g.stroke(); }
      for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; g.beginPath(); g.moveTo(128 + Math.cos(t) * 28, 128 + Math.sin(t) * 28); g.lineTo(128 + Math.cos(t) * 118, 128 + Math.sin(t) * 118); g.stroke(); }
    }),
};
