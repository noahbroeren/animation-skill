/**
 * Camera grammar as data. Keys say where the camera ARRIVES at frame `f`; the move
 * toward it starts `glide` frames earlier (default from the look/reference: ~24 f)
 * with C2 smootherstep easing, so velocity and acceleration are 0 at both ends
 * (measured references glide 18-40 frames; snapping in 3 frames reads "cheap").
 *
 * On top of the key path:
 *  - creep: slow push-in on every hold (references move in ~65% of frames)
 *  - handheld: deterministic fbm micro-shake
 *  - kicks: impact shake that flips sign every frame and decays
 *  - cut: true on a key = hard cut (instant jump) -> recorded for QA
 */
import { clamp, ease as E, EaseName, fbm1, lerp } from "./time";

export type V3 = [number, number, number];
/** Join styles measured on the reference (frame study, 1.9): `fade` cross-dissolve (81 % of joins); `through` the camera
 *  pushes into the old picture and comes out of the new one (a window, a lens, a photo, a pupil); `flash` the mix passes
 *  through white (a glow, a lightning flash, a muzzle flash); `iris` a circle opens from the centre in a few frames. */
export type JoinStyle = "fade" | "through" | "flash" | "iris";
export type CamKey = {
  f: number;
  pos: V3;
  look: V3;
  fov?: number;
  roll?: number; // degrees
  focus?: number; // focus distance override (m); default = distance to look target
  glide?: number; // frames the move takes (ending at f). default: rig default
  ease?: EaseName;
  /** arc the travel through a Bezier control point (quadratic): long lateral travels lift over the set instead of
   *  skimming past near objects (pops/flicker); same smoother timing, still C2 in time */
  via?: V3;
  cut?: boolean; // jump here instantly
  /** cross-dissolve INTO this key over n frames (two camera views blended; Stage3D dissolveAt) */
  dissolve?: number;
  /** how the two views are joined during the dissolve (default a plain cross-fade) */
  join?: JoinStyle;
};
export type Kick = { f: number; amp: number; frames?: number };
export type CamState = { pos: V3; look: V3; fov: number; roll: number; focus: number };

export type RigOptions = {
  /** frame-unit parameters (glide, kick frames, push rate, punch n, follow blend) are authored at this fps and
   *  rescaled at render time -> the same project renders identically at 30 and 60 fps. */
  refFps?: number;
  glide?: number;
  creep?: number; // fraction of distance-to-target per second pushed in during holds (0.01 = 1%/s)
  handheld?: number; // amplitude in metres
  handheldSpeed?: number;
  kicks?: Kick[];
  fovDefault?: number;
  /**
   * Exponential push-in (measured: constant slow push on holds ~0.15-0.35 %/frame, "punch" pushes ~0.6 %/frame
   * for ~35 frames on key words, any push stops at a hit). rate/punch are per frame. Overrides `creep`.
   */
  push?: { rate: number; punches?: { f: number; rate?: number; n?: number }[] };
  /**
   * Follow-object transitions (measured grammar: the camera follows a bullet / ball / oil stream
   * from one subject to the next instead of cutting). During [f0, f1] the camera rides with
   * target(f) + offset and looks `lookAhead` frames ahead along the object's path; it blends in
   * and out over `blend` frames so the hand-off to the key path is seamless.
   */
  follow?: { f0: number; f1: number; target: (f: number) => V3; offset: V3; lookAhead?: number; blend?: number;
    /** frames to blend back out (default = blend). Use 0 when the follow ends on a cut (e.g. inside a shaft). */
    blendOut?: number }[];
};

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const mix3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function cameraRig(keys: CamKey[], opts: RigOptions = {}) {
  const ks = [...keys].sort((a, b) => a.f - b.f);
  const G = opts.glide ?? 24;
  const fov0 = opts.fovDefault ?? 35;
  const cuts = ks.filter((k, i) => i > 0 && k.cut).map((k) => k.f);
  let K = 1; // fps scale for frame-unit parameters (set per at() call)

  // glide = { u, start frame, frames held on k0 before the glide began, k0 } so the push offset can be carried into the move
  type Glide = { u: number; s: number; held: number; k0: CamKey };
  function base(f: number): CamState & { holdFrames: number; glide?: Glide } {
    let i = 0;
    while (i < ks.length - 1 && ks[i + 1].f <= f) i++; // last key that has fully arrived (dissolve keys act like cuts)
    const k0 = ks[i];
    const k1 = ks[i + 1];
    let st: CamState = { pos: k0.pos, look: k0.look, fov: k0.fov ?? fov0, roll: k0.roll ?? 0, focus: k0.focus ?? len(sub(k0.look, k0.pos)) };
    let holdFrames = Math.max(0, f - k0.f);
    let glide: Glide | undefined;
    if (k1 && !k1.cut && !k1.dissolve) {
      const g = (k1.glide ?? G) * K;
      const s = k1.f - g;
      if (f >= s) {
        const u = (E[k1.ease ?? "smoother"] ?? E.smoother)(clamp((f - s) / g));
        const fA = k0.focus ?? len(sub(k0.look, k0.pos));
        const fB = k1.focus ?? len(sub(k1.look, k1.pos));
        st = {
          pos: k1.via ? mix3(mix3(k0.pos, k1.via, u), mix3(k1.via, k1.pos, u), u) : mix3(k0.pos, k1.pos, u), look: mix3(k0.look, k1.look, u),
          fov: lerp(k0.fov ?? fov0, k1.fov ?? fov0, u), roll: lerp(k0.roll ?? 0, k1.roll ?? 0, u), focus: lerp(fA, fB, u),
        };
        holdFrames = 0;
        glide = { u, s, held: Math.max(0, s - k0.f), k0 };
      }
    }
    return { ...st, holdFrames, glide };
  }

  return {
    keys: ks,
    cuts,
    at(f: number, fps = 30): CamState {
      K = opts.refFps ? fps / opts.refFps : 1;
      const b = base(f);
      let pos = b.pos;
      // push: ease into a slow exponential push toward the target during holds (never a dead-still frame)
      const pushK = (hold: number, at: number) => {
        let s = (opts.push!.rate / K) * hold * E.smooth(clamp(hold / (12 * K)));
        for (const pu of opts.push!.punches ?? []) {
          const n = (pu.n ?? 35) * K, x = at - pu.f, r = ((pu.rate ?? 0.006) - opts.push!.rate) / K;
          // only the punch frames that fall INSIDE this hold (i = frames since the punch; the hold began at at - hold).
          // Bug fixed 1.3: the loop used to start at i = 0, so every earlier punch re-applied on every later hold and
          // shots drifted in by up to ~40 % after a few punches (found by measuring the elevator proof short).
          if (x > 0) for (let i = Math.max(0, Math.ceil(x - hold)); i < Math.min(x, n); i++) s += r * Math.max(0, Math.min(1, (i + 0.5) / (8 * K), (n - i - 0.5) / (8 * K)));
        }
        return Math.exp(-s);
      };
      if (opts.push && b.holdFrames > 0) {
        pos = add(b.look, mul(sub(pos, b.look), pushK(b.holdFrames, f)));
      } else if (opts.push && b.glide && b.glide.held > 0) {
        // carry the push accumulated during the hold into the move and let it fade out (it used to snap back: a
        // visible jump at the start of every glide that followed a long hold)
        const g = b.glide, k0 = g.k0, k = pushK(g.held, g.s);
        const delta = sub(add(k0.look, mul(sub(k0.pos, k0.look), k)), k0.pos);
        pos = add(pos, mul(delta, 1 - g.u));
      } else if (opts.creep && b.holdFrames > 0) {
        const dir = sub(b.look, pos);
        const t = b.holdFrames / fps;
        const ramp = E.smooth(clamp(b.holdFrames / 20));
        pos = add(pos, mul(dir, opts.creep * t * ramp));
      }
      if (opts.handheld) {
        const sp = opts.handheldSpeed ?? 0.35;
        const t = (f / fps) * sp;
        pos = add(pos, [fbm1(t, 11) * opts.handheld, fbm1(t, 23) * opts.handheld * 0.7, fbm1(t, 37) * opts.handheld * 0.4]);
      }
      let roll = b.roll;
      let look = b.look;
      for (const k of opts.kicks ?? []) {
        const n = Math.floor((f - k.f) / K), N = k.frames ?? 7;
        if (n >= 0 && n < N) {
          // screen-space: ~3 px at 720p per unit amp, independent of distance/fov (measured kick: 6-8 f, sign flip)
          const L = len(sub(look, pos));
          const m = (3 / 640) * Math.tan((b.fov * Math.PI) / 360) * L * 2 * k.amp * 10;
          const a = (n % 2 ? -1 : 1) * Math.pow(1 - n / N, 1.5);
          look = add(look, [a * m, a * m * 0.6, 0]);
          roll += a * k.amp * 2.3;
        }
      }
      for (const fo of opts.follow ?? []) {
        if (f < fo.f0 || f > fo.f1) continue;
        const bl = (fo.blend ?? 8) * K;
        const bo = (fo.blendOut ?? fo.blend ?? 8) * K;
        const w = E.smoother(clamp(Math.min((f - fo.f0) / bl, bo > 0 ? (fo.f1 - f) / bo : 1)));
        const tp = fo.target(f), ta = fo.target(f + (fo.lookAhead ?? 6));
        pos = mix3(pos, add(tp, fo.offset), w);
        look = mix3(look, ta, w);
      }
      return { pos, look, fov: b.fov, roll, focus: b.focus };
    },
    /** During a dissolve key: both camera states, the mix (0 = old view, 1 = new view), the frame whose WORLD the old view
     *  shows (`fa`, the last frame before the key) and the join style; null otherwise.
     *  1.9 (frame study of 20 reference shorts): the mix starts ON the key and runs `dissolve` frames with a curve halfway
     *  between linear and smoothstep (no frame carries more than ~0.14 of the mix); both cameras keep moving. Before, the
     *  window was centred on the key, the new camera was frozen until the key and both halves rendered the same world, so
     *  the change of actors, props and light at the key put half the mix into one frame and read as a cut. */
    dissolveAt(f: number, fps = 30): { a: CamState; b: CamState; t: number; fa: number; style?: JoinStyle } | null {
      const k = ks.find((x) => x.dissolve && f >= x.f && f < x.f + x.dissolve);
      if (!k) return null;
      const before = cameraRig(ks.filter((x) => x !== k && x.f < k.f), opts);
      const after = this as unknown as { at: (f: number, fps: number) => CamState };
      const u = clamp((f - k.f + 1) / (k.dissolve! + 1)), t = 0.5 * u + 0.5 * E.smooth(u);
      let a = before.at(f, fps), b = after.at(f, fps);
      if (k.join === "through") { // push INTO the old picture (accelerating) and come out of the new one (decelerating)
        const pa = 1 - 0.55 * E.inCubic(clamp(t * 1.25)), pb = 0.45 + 0.55 * E.outCubic(clamp(t * 1.1));
        a = { ...a, pos: mix3(a.look, a.pos, pa) }; b = { ...b, pos: mix3(b.look, b.pos, pb) };
      }
      return { a, b, t, fa: k.f - 1, style: k.join };
    },
  };
}
export type CameraRig = ReturnType<typeof cameraRig>;

/**
 * Cut-or-glide planning rule (measured reference): keep glide peak speed <= ~25 px/frame at 720p, i.e.
 * frames >= 0.075 x (screen travel px@720 + 734 x |zoom|). Anything over half a frame width of travel or 40 %
 * zoom should be a CUT (on a word/action), not a fly-through.
 * Returns "cut" or the minimum glide length in frames (>= 18).
 */
export function glideOrCut(screenTravelPx720: number, zoomFrac: number): "cut" | number {
  if (screenTravelPx720 > 360 || Math.abs(zoomFrac) > 0.4) return "cut";
  return Math.max(18, Math.ceil(0.075 * (screenTravelPx720 + Math.abs(zoomFrac) * 734)));
}

/**
 * Framing helpers (learned on the elevator proof short: in 9:16 the horizontal FOV is only ~0.56x the vertical one,
 * so close-ups planned by "feel" came out 2x too tight and cut the subject or hid it behind foreground posts).
 * hfov(): horizontal field of view in degrees. frameDistance(): camera distance at which a subject of width/height
 * (metres) fills `fill` of the frame (default 0.8); the larger of the two constraints wins.
 *   frameDistance({ width: 2, vfov: 34, aspect: 9 / 16 })  -> ~6.8 m for a 3-person group in a vertical short
 */
export const hfov = (vfov: number, aspect: number) => (2 * Math.atan(Math.tan((vfov * Math.PI) / 360) * aspect) * 180) / Math.PI;
export function frameDistance(o: { width?: number; height?: number; vfov: number; aspect: number; fill?: number }) {
  const fill = o.fill ?? 0.8, tv = Math.tan((o.vfov * Math.PI) / 360), th = tv * o.aspect;
  return Math.max(o.width ? o.width / (2 * th * fill) : 0, o.height ? o.height / (2 * tv * fill) : 0);
}
