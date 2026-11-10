/**
 * Parametric 2D cartoon characters drawn in code (Canvas2D).
 *
 * Consistency across a whole series comes from the CharacterSpec: the same spec
 * draws the same person in every shot and episode (put specs in the series bible).
 * Defaults follow the reference measurements: bodies ~3.5 heads tall, thin limbs,
 * round heads, solid black eyes, thin ink lines, cel shadow on the side away from
 * the key light so cards look lit by the 3D world.
 */
import { clamp, hash32, lerp, noise1 } from "../time";

export type Expression = "neutral" | "happy" | "laugh" | "shock" | "nervous" | "sad" | "angry" | "whistle" | "smug" | "think";

export type CharacterSpec = {
  id: string;
  skin: string;
  hair?: { color: string; style: "short" | "bob" | "spiky" | "bald" | "long" | "bun" | "curly" };
  top: { color: string; style?: "shirt" | "coat" | "uniform" | "dress"; accent?: string };
  bottom?: { color: string };
  shoes?: string;
  heightHeads?: number; // 3.5
  headRatio?: number; // height/width of head, 1.0 = round
  build?: "slim" | "average" | "stout";
  limb?: number; // limb thickness in head widths (0.1)
  hat?: { style: "cap" | "top" | "helmet" | "shako" | "beanie"; color: string };
  glasses?: boolean;
  beard?: string;
  blush?: boolean;
  ink?: string; // outline colour
  /**
   * "classic" (default): filled limbs, oval eyes with catchlight.
   * "toonworld": measured 2D-in-3D story-short design: 3.5 heads, head H/W 0.93, bean torso 0.8 W,
   * legs/arms = single ink strokes (~0.055 W, no knees/elbows), ink-dot hands, stroke feet,
   * lidded half-disc eyes (shock = white circles + small pupils), no blush, no catchlights,
   * plum outline ~5 % of head width.
   */
  style?: "classic" | "toonworld";
};

export type Pose = {
  expr?: Expression;
  mouth?: number; // 0..1 talking openness (overrides expression mouth when > 0.05)
  blink?: number; // 0 open .. 1 closed
  armL?: number; armR?: number; // degrees from straight down; + = forward/up toward the viewer's right side
  elbowL?: number; elbowR?: number;
  legL?: number; legR?: number;
  lean?: number; // degrees
  look?: [number, number]; // pupil offset -1..1
  bob?: number; // vertical offset in head heights (negative = up)
  squash?: number; // 1 = none; <1 squash, >1 stretch (volume preserved)
  facing?: 1 | -1;
  light?: number; // -1 = key light from the left, +1 from the right
  prop?: "book" | "sign" | "lantern"; // held in both hands in front of the chest (arms are posed automatically)
  propText?: string; // for "sign"
};

/** multiply a #hex colour by per-channel factors (measured soft crescents: skin x[.96,.86,.84], cloth x[.64,.66,.74]) */
const mulHex = (hex: string, f: [number, number, number]) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * f[0])},${Math.round(((n >> 8) & 255) * f[1])},${Math.round((n & 255) * f[2])})`;
};

/** Bean head (superellipse crown 1.75 / jaw 2.3, egg -0.12 = narrower chin, seeded asymmetry + tilt). */
export function beanHead(cx: number, cy: number, halfW: number, halfH: number, seed: number, n = 72) {
  const rnd = (k: number) => { const x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  const nT = 1.75 + 0.3 * (rnd(2) - 0.5), nB = 2.3 + 0.3 * (rnd(3) - 0.5), egg = -0.12 + 0.06 * (rnd(4) - 0.5);
  const asym = (0.06 + 0.04 * rnd(5)) * (rnd(6) < 0.5 ? -1 : 1), r = ((8 * (rnd(7) - 0.5)) * Math.PI) / 180;
  const p = new Path2D();
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t), e = 2 / (s < 0 ? nT : nB);
    let X = Math.sign(c) * Math.abs(c) ** e;
    const Y = Math.sign(s) * Math.abs(s) ** e;
    X *= (1 + egg * Y) * (1 + asym * Math.sign(X) * 0.5);
    const x = cx + halfW * X * Math.cos(r) - halfH * Y * Math.sin(r), y = cy + halfW * X * Math.sin(r) + halfH * Y * Math.cos(r);
    i ? p.lineTo(x, y) : p.moveTo(x, y);
  }
  p.closePath();
  return p;
}

const darken = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // shadows shift toward cool violet instead of just darker (measured look)
  const f = (v: number, cool: number) => Math.round(clamp(v * (1 - k) + cool * k * 0.35, 0, 255));
  return `rgb(${f(r, 60)},${f(g, 50)},${f(b, 140)})`;
};

/** Canvas size the character needs for a given drawing height in px. */
export const charCanvasSize = (heightPx: number) => ({ w: Math.round(heightPx * 0.72), h: Math.round(heightPx * 1.08) });

export function drawCharacter(g: CanvasRenderingContext2D, s: CharacterSpec, p: Pose, W: number, H: number) {
  const HH = s.heightHeads ?? 3.5;
  const total = H / 1.08;
  const hw = total / HH; // head height in px
  const headW = hw / (s.headRatio ?? (s.style === "toonworld" ? 0.93 : 1.0));
  const TW = s.style === "toonworld";
  const lw = Math.max(1.5, hw * (TW ? 0.045 : 0.035)); // thin ink
  const ink = s.ink ?? (TW ? "#24182a" : "#141018");
  const limbW = TW ? hw * (s.limb ?? 0.055) : hw * (s.limb ?? 0.1) * (s.build === "stout" ? 1.25 : s.build === "slim" ? 0.85 : 1);
  const light = p.light ?? -1;
  const sq = p.squash ?? 1;
  const sx = 1 / Math.pow(sq, 0.6);
  g.clearRect(0, 0, W, H);
  g.save();
  const footY = H - hw * 0.08;
  g.translate(W / 2, footY);
  if ((p.facing ?? 1) < 0) g.scale(-1, 1);
  g.scale(sx, sq);
  g.rotate(((p.lean ?? 0) * Math.PI) / 180);
  g.translate(0, (p.bob ?? 0) * hw);
  g.lineJoin = "round"; g.lineCap = "round";

  const legLen = hw * (TW ? 1.4 : 1.25), torsoH = hw * (TW ? 1.1 : 1.15), hipY = -legLen, shoulderY = hipY - torsoH * 0.92;
  const torsoW = headW * (TW ? (s.build === "stout" ? 0.95 : s.build === "slim" ? 0.7 : 0.8) : s.build === "stout" ? 0.95 : s.build === "slim" ? 0.6 : 0.75);

  // cel shading: shadow colour everywhere, then the base colour re-filled from a copy of the
  // shape shifted toward the light => a crescent shadow that follows each part's form.
  const part = (path: Path2D, fill: string, shadowSide = true, skin = false) => {
    g.fillStyle = fill; g.fill(path);
    if (shadowSide) {
      g.save(); g.clip(path);
      g.fillStyle = TW ? mulHex(fill, skin ? [0.96, 0.86, 0.84] : [0.64, 0.66, 0.74]) : darken(fill, 0.3); g.fill(path);
      g.translate(light * hw * 0.16, -hw * 0.05); // base colour shifted TOWARD the light => crescent on the far side
      g.fillStyle = fill; g.fill(path);
      g.restore();
    }
    g.strokeStyle = ink; g.lineWidth = lw; g.stroke(path);
  };
  const limb = (x0: number, y0: number, a1: number, bend: number, len: number, col: string, end: "hand" | "shoe", w: number) => {
    if (TW) { // single ink stroke, no joints; ink-dot hand / stroke foot
      const r = (a1 * Math.PI) / 180, rb = ((a1 + bend * 0.3) * Math.PI) / 180;
      const xm = x0 + Math.sin(r) * len * 0.5, ym = y0 + Math.cos(r) * len * 0.5;
      const xe = xm + Math.sin(rb) * len * 0.5, ye = ym + Math.cos(rb) * len * 0.5;
      g.strokeStyle = ink; g.lineWidth = w;
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(xm, ym, xe, ye); g.stroke();
      if (end === "hand") { g.fillStyle = ink; g.beginPath(); g.arc(xe, ye, headW * 0.055, 0, 7); g.fill(); }
      else { g.lineWidth = headW * 0.07; g.beginPath(); g.moveTo(xe - headW * 0.03, ye); g.lineTo(xe + headW * 0.17, ye); g.stroke(); }
      return;
    }
    const r1 = (a1 * Math.PI) / 180, r2 = ((a1 + bend) * Math.PI) / 180;
    const x1 = x0 + Math.sin(r1) * len * 0.5, y1 = y0 + Math.cos(r1) * len * 0.5;
    const x2 = x1 + Math.sin(r2) * len * 0.5, y2 = y1 + Math.cos(r2) * len * 0.5;
    g.strokeStyle = ink; g.lineWidth = w + lw * 2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    const e = new Path2D();
    if (end === "hand") e.arc(x2, y2, w * 0.75, 0, 7);
    else e.ellipse(x2 + w * 0.5, y2 + w * 0.15, w * 1.2, w * 0.7, 0, 0, 7);
    part(e, end === "hand" ? s.skin : s.shoes ?? "#3a2a20", false);
  };

  // legs (behind torso)
  const pants = s.bottom?.color ?? "#3d4a6b";
  limb(-torsoW * 0.22, hipY, p.legL ?? 0, Math.max(0, -(p.legL ?? 0)) * 0.6, legLen, pants, "shoe", limbW * 1.1);
  limb(torsoW * 0.22, hipY, p.legR ?? 0, Math.max(0, -(p.legR ?? 0)) * 0.6, legLen, pants, "shoe", limbW * 1.1);
  const holding = !!p.prop;
  // back arm
  if (!holding) limb(-torsoW * (TW ? 0.4 : 0.48), shoulderY + hw * (TW ? 0.28 : 0.08), -(p.armL ?? 6), -(p.elbowL ?? 8), hw * 1.15, s.top.color, "hand", limbW);

  // torso
  const t = new Path2D();
  const tw2 = torsoW / 2, hb = s.top.style === "dress" ? torsoW * 0.75 : tw2 * 1.05;
  if (TW) { // vertical bean, widest at ~65 % of its height, round bottom, no neck
    const top = shoulderY - hw * 0.04, bot = hipY + hw * 0.12, wy = top + (bot - top) * 0.65;
    t.moveTo(0, top);
    t.bezierCurveTo(tw2 * 0.75, top, tw2 * 1.05, wy - (bot - top) * 0.25, tw2, wy);
    t.bezierCurveTo(tw2 * 0.98, bot, -tw2 * 0.98, bot, -tw2, wy);
    t.bezierCurveTo(-tw2 * 1.05, wy - (bot - top) * 0.25, -tw2 * 0.75, top, 0, top);
  } else {
  t.moveTo(-tw2 * 0.9, shoulderY);
  t.quadraticCurveTo(0, shoulderY - hw * 0.08, tw2 * 0.9, shoulderY);
  t.quadraticCurveTo(tw2 * 1.15, shoulderY + torsoH * 0.5, hb, hipY + hw * 0.05);
  t.lineTo(-hb, hipY + hw * 0.05);
  t.quadraticCurveTo(-tw2 * 1.15, shoulderY + torsoH * 0.5, -tw2 * 0.9, shoulderY);
  }
  part(t, s.top.color);
  if (s.top.accent) {
    g.strokeStyle = s.top.accent; g.lineWidth = lw * 2.2;
    g.beginPath(); g.moveTo(0, shoulderY + hw * 0.05); g.lineTo(0, hipY); g.stroke();
    if (s.top.style === "uniform") { g.beginPath(); g.moveTo(-tw2, shoulderY + torsoH * 0.35); g.lineTo(tw2, shoulderY + torsoH * 0.6); g.stroke(); }
  }
  // front arm
  if (!holding) limb(torsoW * (TW ? 0.4 : 0.48), shoulderY + hw * (TW ? 0.28 : 0.08), p.armR ?? 6, p.elbowR ?? 8, hw * 1.15, s.top.color, "hand", limbW);
  else {
    const py = shoulderY + torsoH * 0.42, pw = headW * (p.prop === "sign" ? 1.5 : 1.15), ph = hw * (p.prop === "sign" ? 0.8 : 0.6);
    // upper arms down-out to the elbow, forearms in to the prop's edges
    for (const sgn of [-1, 1]) {
      const sx0 = sgn * torsoW * (TW ? 0.4 : 0.48), sy0 = shoulderY + hw * (TW ? 0.28 : 0.08), ex0 = sgn * torsoW * 0.72, ey0 = shoulderY + torsoH * 0.55;
      const hx = sgn * pw * 0.46, hy = py + ph * 0.1;
      g.strokeStyle = ink; g.lineWidth = limbW + lw * 2; g.beginPath(); g.moveTo(sx0, sy0); g.lineTo(ex0, ey0); g.lineTo(hx, hy); g.stroke();
      if (!TW) { g.strokeStyle = s.top.color; g.lineWidth = limbW; g.beginPath(); g.moveTo(sx0, sy0); g.lineTo(ex0, ey0); g.lineTo(hx, hy); g.stroke(); }
    }
    const pr = new Path2D();
    if (p.prop === "book") {
      pr.moveTo(-pw / 2, py - ph / 2 + ph * 0.08); pr.quadraticCurveTo(-pw / 4, py - ph / 2 - ph * 0.04, 0, py - ph / 2 + ph * 0.06);
      pr.quadraticCurveTo(pw / 4, py - ph / 2 - ph * 0.04, pw / 2, py - ph / 2 + ph * 0.08); pr.lineTo(pw / 2, py + ph / 2); pr.quadraticCurveTo(pw / 4, py + ph / 2 - ph * 0.1, 0, py + ph / 2); pr.quadraticCurveTo(-pw / 4, py + ph / 2 - ph * 0.1, -pw / 2, py + ph / 2); pr.closePath();
      part(pr, "#f6ecd2", false);
      g.strokeStyle = ink; g.lineWidth = lw; g.beginPath(); g.moveTo(0, py - ph / 2 + ph * 0.06); g.lineTo(0, py + ph / 2); g.stroke();
      g.strokeStyle = "rgba(60,45,30,0.55)"; g.lineWidth = lw * 0.8;
      for (let i = 0; i < 4; i++) for (const sgn of [-1, 1]) { const yy = py - ph * 0.25 + i * ph * 0.15; g.beginPath(); g.moveTo(sgn * pw * 0.08, yy); g.lineTo(sgn * pw * 0.4, yy); g.stroke(); }
    } else if (p.prop === "sign") {
      pr.rect(-pw / 2, py - ph / 2, pw, ph); part(pr, "#ffffff", false);
      if (p.propText) { g.fillStyle = ink; g.font = `900 ${ph * 0.32}px Arial Black, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(p.propText, 0, py); }
    } else {
      pr.rect(-pw * 0.18, py - ph * 0.4, pw * 0.36, ph * 0.7); part(pr, "#ffcc66", false);
    }
    for (const sgn of [-1, 1]) { const hnd = new Path2D(); hnd.arc(sgn * pw * 0.46, py + ph * 0.1, TW ? headW * 0.055 : limbW * 0.8, 0, 7); if (TW) { g.fillStyle = ink; g.fill(hnd); } else part(hnd, s.skin, false); }
  }

  // head
  const headCY = shoulderY - hw * (TW ? 0.47 : 0.52);
  const head = TW ? beanHead(0, headCY, headW / 2, hw / 2, hash32(s.id)) : new Path2D();
  if (!TW) head.ellipse(0, headCY, headW / 2, hw / 2, 0, 0, 7);
  // hair behind
  const hair = s.hair;
  if (hair && (hair.style === "long" || hair.style === "bob")) {
    const hb2 = new Path2D();
    hb2.ellipse(0, headCY + hw * 0.08, headW * 0.56, hw * (hair.style === "long" ? 0.68 : 0.55), 0, 0, 7);
    part(hb2, hair.color);
  }
  part(head, s.skin, true, true);
  if (TW) { // thick-thin ink: thicker on the shadow side and toward the ground
    g.save(); g.clip(head);
    g.strokeStyle = ink; g.lineWidth = lw * 1.9;
    g.translate(-light * lw * 0.55, lw * 0.35); g.stroke(head);
    g.restore();
  }
  // hair on top
  if (hair && hair.style !== "bald") {
    const hp = new Path2D();
    if (hair.style === "spiky") {
      hp.moveTo(-headW * 0.5, headCY - hw * 0.05);
      for (let i = 0; i <= 6; i++) hp.lineTo(-headW * 0.5 + (headW * i) / 6, headCY - hw * (i % 2 ? 0.62 : 0.4));
      hp.lineTo(headW * 0.5, headCY - hw * 0.05);
      hp.quadraticCurveTo(0, headCY - hw * 0.3, -headW * 0.5, headCY - hw * 0.05);
    } else if (hair.style === "curly") {
      for (let i = 0; i < 7; i++) hp.ellipse(-headW * 0.42 + (headW * 0.84 * i) / 6, headCY - hw * 0.36 - (i % 2) * hw * 0.05, headW * 0.13, hw * 0.13, 0, 0, 7);
    } else {
      hp.moveTo(-headW * 0.52, headCY + hw * 0.02);
      hp.quadraticCurveTo(-headW * 0.55, headCY - hw * 0.58, 0, headCY - hw * 0.54);
      hp.quadraticCurveTo(headW * 0.55, headCY - hw * 0.58, headW * 0.52, headCY + hw * 0.02);
      hp.quadraticCurveTo(headW * 0.2, headCY - hw * 0.25, -headW * 0.52, headCY + hw * 0.02);
    }
    if (hair.style === "bun") hp.ellipse(0, headCY - hw * 0.62, headW * 0.18, hw * 0.15, 0, 0, 7);
    part(hp, hair.color);
  }

  if (s.beard) { // chin beard: hugs the jaw below the mouth, never covers it
    const bd = new Path2D();
    bd.moveTo(-headW * 0.44, headCY + hw * 0.12);
    bd.quadraticCurveTo(-headW * 0.3, headCY + hw * 0.62, 0, headCY + hw * 0.6);
    bd.quadraticCurveTo(headW * 0.3, headCY + hw * 0.62, headW * 0.44, headCY + hw * 0.12);
    bd.quadraticCurveTo(headW * 0.25, headCY + hw * 0.33, 0, headCY + hw * 0.34);
    bd.quadraticCurveTo(-headW * 0.25, headCY + hw * 0.33, -headW * 0.44, headCY + hw * 0.12);
    part(bd, s.beard, false);
  }
  // face
  const ex = p.expr ?? "neutral";
  const look = p.look ?? [0, 0];
  const eyeY = headCY + hw * 0.02, eyeDX = headW * (TW ? 0.13 : 0.17); // measured: eyes 26 % of head width apart
  const blink = clamp(p.blink ?? 0);
  const eyeH = hw * (ex === "shock" ? 0.15 : ex === "laugh" ? 0.04 : ex === "happy" ? 0.09 : 0.11) * (1 - blink * 0.92);
  const eyeW = hw * (ex === "shock" ? 0.1 : 0.075);
  g.fillStyle = "#0d0a10";
  for (const sgn of [-1, 1]) {
    const x = sgn * eyeDX + look[0] * headW * 0.05, y = eyeY + look[1] * hw * 0.04;
    if (TW && ex === "shock" && blink < 0.5) { // white circles, small pupils
      g.fillStyle = "#fef9f6"; g.strokeStyle = ink; g.lineWidth = lw * 0.8;
      g.beginPath(); g.arc(sgn * headW * 0.12, y, headW * 0.11, 0, 7); g.fill(); g.stroke();
      g.fillStyle = "#0d0a10"; g.beginPath(); g.arc(sgn * headW * 0.12 + look[0] * headW * 0.03, y + look[1] * headW * 0.03, headW * 0.03, 0, 7); g.fill();
      continue;
    }
    if (TW && !(ex === "laugh" || (ex === "happy" && blink > 0.5))) { // lidded half-disc eye
      const ew = headW * 0.09, eh = headW * (0.06 - 0.05 * blink);
      g.fillStyle = "#0d0a10";
      g.beginPath(); g.moveTo(x - ew, y); g.lineTo(x + ew, y); g.ellipse(x, y, ew, Math.max(lw * 0.5, eh), 0, 0, Math.PI); g.fill();
      g.strokeStyle = ink; g.lineWidth = lw * 0.9; g.beginPath(); g.moveTo(x - ew * 1.05, y - lw * 0.3); g.lineTo(x + ew * 1.05, y - lw * 0.3); g.stroke();
      continue;
    }
    if (ex === "laugh" || ex === "happy" && blink > 0.5) {
      g.strokeStyle = "#0d0a10"; g.lineWidth = lw * 1.4;
      g.beginPath(); g.arc(x, y + hw * 0.03, eyeW, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    } else {
      g.beginPath(); g.ellipse(x, y, eyeW, Math.max(lw * 0.6, eyeH), 0, 0, 7); g.fill();
      if (blink < 0.5 && !TW) { g.fillStyle = "#ffffff"; g.beginPath(); g.arc(x + eyeW * 0.3, y - eyeH * 0.4, eyeW * 0.28, 0, 7); g.fill(); g.fillStyle = "#0d0a10"; }
    }
  }
  // brows
  const browA: Record<Expression, number> = { neutral: 0, happy: -4, laugh: -6, shock: -10, nervous: 14, sad: 18, angry: -22, whistle: -6, smug: -12, think: 10 };
  g.strokeStyle = ink; g.lineWidth = lw * 1.3;
  for (const sgn of [-1, 1]) {
    const a = ((browA[ex] ?? 0) * Math.PI) / 180 * sgn;
    const bx = sgn * eyeDX, by = eyeY - hw * (ex === "shock" ? 0.24 : 0.18);
    g.beginPath(); g.moveTo(bx - Math.cos(a) * eyeW * 1.3, by - Math.sin(a) * eyeW * 1.3); g.lineTo(bx + Math.cos(a) * eyeW * 1.3, by + Math.sin(a) * eyeW * 1.3); g.stroke();
  }
  // mouth
  const my = headCY + hw * 0.24, mw = headW * 0.17;
  const talk = p.mouth ?? 0;
  g.lineWidth = lw * 1.3; g.strokeStyle = ink;
  if (talk > 0.05 || ex === "laugh" || ex === "shock") {
    const open = ex === "shock" ? 0.9 : ex === "laugh" ? 0.8 : talk;
    const mp = new Path2D();
    if (ex === "shock") mp.ellipse(0, my, mw * 0.55, hw * 0.1 * open + lw, 0, 0, 7);
    else { mp.moveTo(-mw, my - hw * 0.02); mp.quadraticCurveTo(0, my - hw * 0.05, mw, my - hw * 0.02); mp.quadraticCurveTo(0, my + hw * 0.16 * open + lw, -mw, my - hw * 0.02); }
    g.fillStyle = "#4a1a22"; g.fill(mp); g.stroke(mp);
    g.save(); g.clip(mp); g.fillStyle = "#e0707a"; g.beginPath(); g.ellipse(0, my + hw * 0.12 * open, mw * 0.5, hw * 0.06, 0, 0, 7); g.fill(); g.restore();
  } else {
    g.beginPath();
    if (ex === "happy" || ex === "smug") g.arc(ex === "smug" ? mw * 0.3 : 0, my - hw * 0.06, mw, Math.PI * 0.2, Math.PI * 0.8);
    else if (ex === "sad") g.arc(0, my + hw * 0.08, mw * 0.8, Math.PI * 1.2, Math.PI * 1.8);
    else if (ex === "whistle") { g.ellipse(mw * 0.2, my, mw * 0.25, mw * 0.25, 0, 0, 7); }
    else if (ex === "nervous") { for (let i = 0; i <= 6; i++) { const x = -mw + (2 * mw * i) / 6; i ? g.lineTo(x, my + (i % 2 ? -1 : 1) * hw * 0.02) : g.moveTo(x, my); } }
    else if (ex === "angry") { g.moveTo(-mw * 0.8, my + hw * 0.02); g.lineTo(mw * 0.8, my - hw * 0.01); }
    else { g.moveTo(-mw * 0.6, my); g.quadraticCurveTo(0, my + hw * 0.025, mw * 0.6, my); }
    g.stroke();
  }
  if (s.blush || (!TW && (ex === "happy" || ex === "laugh"))) {
    g.fillStyle = "rgba(240,110,110,0.35)";
    for (const sgn of [-1, 1]) { g.beginPath(); g.ellipse(sgn * headW * 0.3, headCY + hw * 0.15, headW * 0.08, hw * 0.045, 0, 0, 7); g.fill(); }
  }
  if (ex === "nervous") { g.fillStyle = "#9fd4ff"; g.beginPath(); g.ellipse(headW * 0.42, headCY - hw * 0.15, lw * 2, lw * 3.2, 0, 0, 7); g.fill(); g.strokeStyle = ink; g.lineWidth = lw * 0.7; g.stroke(); }
  if (s.glasses) {
    g.strokeStyle = ink; g.lineWidth = lw * 1.2;
    for (const sgn of [-1, 1]) { g.beginPath(); g.arc(sgn * eyeDX, eyeY, eyeW * 2, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(-eyeDX + eyeW * 2, eyeY); g.lineTo(eyeDX - eyeW * 2, eyeY); g.stroke();
  }
  if (s.hat) {
    const hp = new Path2D(), top = headCY - hw * 0.42;
    if (s.hat.style === "top") { hp.rect(-headW * 0.34, top - hw * 0.62, headW * 0.68, hw * 0.62); hp.rect(-headW * 0.55, top - hw * 0.05, headW * 1.1, hw * 0.1); }
    else if (s.hat.style === "shako") { hp.moveTo(-headW * 0.36, top + hw * 0.02); hp.lineTo(-headW * 0.3, top - hw * 0.55); hp.lineTo(headW * 0.3, top - hw * 0.55); hp.lineTo(headW * 0.36, top + hw * 0.02); hp.closePath(); }
    else if (s.hat.style === "helmet") hp.ellipse(0, top + hw * 0.05, headW * 0.56, hw * 0.34, 0, Math.PI, 0);
    else if (s.hat.style === "beanie") hp.ellipse(0, top + hw * 0.04, headW * 0.5, hw * 0.3, 0, Math.PI, 0);
    else { hp.ellipse(0, top + hw * 0.06, headW * 0.5, hw * 0.24, 0, Math.PI, 0); hp.rect(0, top + hw * 0.0, headW * 0.6, hw * 0.08); }
    part(hp, s.hat.color);
  }
  g.restore();
}

// ---------------------------------------------------------------- animation helpers

/**
 * Deterministic blinks (measured reference: gaps 0.5-2.3 s, 4-frame lid curve half/shut/shut/half) plus a
 * forced blink on every expression swap whose shut frames cover the swap (pass the swap frames in `forced`).
 */
const LID = [0.5, 1, 1, 0.5];
export function blinkAt(frame: number, fps: number, seed: string, forced: number[] = []) {
  for (const f0 of forced) { const k = frame - f0 + 1; if (k >= 0 && k < 4) return LID[k]; }
  let t = -Math.round((2 * fps * (hash32(seed) % 1000)) / 1000);
  for (let i = 0; t <= frame && i < 4000; i++) {
    const k = frame - t;
    if (k >= 0 && k < 4) return LID[k];
    t += Math.round(fps * (0.5 + (1.8 * (hash32(seed + ":" + i) % 1000)) / 1000));
  }
  return 0;
}

export type Word = { word: string; start: number; end: number };
/** Mouth openness from word timings (syllable-rate flapping inside each word, closed between words). */
export function mouthAt(frame: number, fps: number, words: Word[], lead = 2) {
  const t = (frame + lead) / fps;
  for (const w of words) {
    if (t >= w.start && t <= w.end) {
      const syl = Math.max(1, Math.round(w.word.replace(/[^aeiouy]/gi, "").length));
      const ph = ((t - w.start) / Math.max(0.05, w.end - w.start)) * syl * Math.PI;
      return 0.25 + 0.65 * Math.abs(Math.sin(ph));
    }
  }
  return 0;
}

/**
 * Walk cycle (measured reference: a step every 9-12 frames => ~2.6 steps/s, bob ~5 % of height lowest at contact,
 * lean 1 deg at passing -> 7 deg at contact, arms counter-swing).
 */
export function walkPose(frame: number, fps: number, stepsPerSec = 2.6, amp = 1, heads = 3.5): Pose {
  const ph = (frame / fps) * stepsPerSec * Math.PI, sn = Math.sin(ph), c = -Math.cos(2 * ph); // c = 1 at contact
  return { legL: 24 * sn * amp, legR: -24 * sn * amp, armL: -20 * sn * amp + 6, armR: 20 * sn * amp + 6, elbowL: 10, elbowR: 10,
    bob: 0.05 * heads * ((1 + c) / 2) * amp * 0.5, lean: (4 + 3 * c) * amp };
}

/** Idle life: breathing squash, slight sway, arm drift. Never fully still. */
export function idlePose(frame: number, fps: number, seed = 0): Pose {
  const t = frame / fps;
  return {
    squash: 1 + Math.sin(t * 2 * Math.PI * 0.28 + seed) * 0.012,
    lean: noise1(t * 0.35, seed) * 2.2,
    armL: 6 + noise1(t * 0.4, seed + 3) * 4, armR: 6 + noise1(t * 0.4, seed + 7) * 4,
    look: [noise1(t * 0.25, seed + 11) * 0.5, noise1(t * 0.2, seed + 13) * 0.3],
  };
}

export const mergePose = (...ps: Pose[]): Pose => {
  const out: Pose = {};
  for (const p of ps) for (const [k, v] of Object.entries(p)) {
    const cur = (out as any)[k];
    if (typeof v === "number" && typeof cur === "number" && !["blink", "mouth", "squash"].includes(k)) (out as any)[k] = cur + v;
    else (out as any)[k] = v;
  }
  return out;
};

export const lerpPose = (a: Pose, b: Pose, t: number): Pose => {
  const out: any = { ...a, ...b };
  for (const k of Object.keys(out)) {
    const va = (a as any)[k], vb = (b as any)[k];
    if (typeof va === "number" && typeof vb === "number") out[k] = lerp(va, vb, t);
  }
  return out;
};
