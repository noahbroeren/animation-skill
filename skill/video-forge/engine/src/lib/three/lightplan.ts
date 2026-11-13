/**
 * Light plan (1.7): ONE timeline of lighting keys per video.
 *
 * A lighting key bundles everything that has to change together when the story changes phase: the sun (colour,
 * strength, direction), the hemisphere fill, the fog (colour and distances), the sky stops and sun glow, the toon setup
 * (shade colours, ramp, rim, card tint) and the look (grade, vignette, bloom). Projects used to cross-fade a dozen of
 * these by hand in `update()`; forgetting one (fog colour, card tint, the look) was the usual bug, and tuning "the
 * grade" globally instead of per key cost three render rounds on the elevator short.
 *
 *   const LP = lightPlan([[0, "day"], [T.back, "golden"], [T.yousee, "night"], [T.three, "day"]], { fade: 14 });
 *   <Stage3D look={LP.look} ...
 *     build={(ctx) => { const L = LP.build(ctx.scene, { shadowSize: 40 }); ... LP.toonify(ctx.scene); return { ... }; }}
 *     update={(w, f, { fps }) => { LP.update(f, fps, { target: [x, 0, z] }); ... }} />
 *
 * Keys are names from LIGHT_KEYS or objects (`{ ...LIGHT_KEYS.day, look: myLook, cookie: 0.3 }`). A change of key is an
 * edit: put it on a cut, a dissolve or a story turn. Recipes: references/research/lighting.md section B.
 */
import * as THREE from "three";
import { deepMerge, Look, LOOKS, lerpLook } from "../look";
import { applyToonSetup, makeToonUniforms, TOON_SETUPS, toonifyScene, ToonSetup, ToonUniforms } from "./shaders";
import { LIGHTS, LightPreset, lights, sky } from "./world";

export type LightKey = {
  /** `lights()` preset: sun, hemisphere, ambient, fog colour and distances, sky stops */
  lights: LightPreset;
  /** toon setup name or object */
  toon: keyof typeof TOON_SETUPS | ToonSetup;
  /** look name or object */
  look: string | Look;
  /** sun / moon glow in the sky (0 off) */
  sunGlow?: number;
  /** drifting cloud shadows on lit planes (0 off, 0.25-0.45 open exterior) */
  cookie?: number;
  /** linear fog override [near, far] */
  fog?: [number, number];
  /** where the sun comes FROM (overrides the preset; a baked set passes the direction it was baked with) */
  sunDir?: [number, number, number];
  /** multiply the preset's sun strength (e.g. 0.8 for a softer key) */
  sunGain?: number;
  /** how far practical lamps and lit windows are on, 0..1 (sets follow it: `set.setNight(u.practicals)`) */
  practicals?: number;
};

/** Ready-made keys, one per story use (lighting.md B1). The rain / dusk / fog / office numbers are design values. */
export const LIGHT_KEYS: Record<string, LightKey> = {
  day: { lights: "day", toon: "day", look: "toonworld-day", sunGlow: 0.3, cookie: 0.3, practicals: 0 },
  morning: { lights: "morning", toon: "day", look: "toonworld-day", sunGlow: 0.5, cookie: 0.2, practicals: 0 },
  golden: { lights: "golden", toon: "golden", look: "toonworld-golden", sunGlow: 0.8, cookie: 0.15, practicals: 0.15 },
  sunsetBack: { lights: "sunsetBack", toon: "sunsetBack", look: "toonworld-golden", sunGlow: 1.0, practicals: 0.4 },
  dusk: { lights: "dusk", toon: "dusk", look: "toonworld-dusk", sunGlow: 0.5, practicals: 0.7 },
  night: { lights: "night", toon: "night", look: "toonworld-night", sunGlow: 0.25, practicals: 1 },
  nightMoon: { lights: "nightMoon", toon: "night", look: "toonworld-night", sunGlow: 0.35, practicals: 0.8 },
  nightPractical: { lights: "nightPractical", toon: "night", look: "toonworld-night", sunGlow: 0.15, practicals: 1 },
  overcast: { lights: "overcast", toon: "overcast", look: "toonworld-overcast", practicals: 0.2 },
  rain: { lights: "rain", toon: "rain", look: "toonworld-rain", practicals: 0.6 },
  fog: { lights: "fog", toon: "fog", look: "toonworld-fog", sunGlow: 0.4, practicals: 0.4 },
  office: { lights: "interiorWindow", toon: "interiorWindow", look: "toonworld-office", practicals: 0.3 },
  interiorWarm: { lights: "interiorWarm", toon: "interior", look: "toonworld-interior", practicals: 0.8 },
  spotlight: { lights: "spotlight", toon: "night", look: "toonworld-night", practicals: 0.2 },
};

const keyOf = (k: string | LightKey): LightKey => {
  if (typeof k !== "string") return k;
  const v = LIGHT_KEYS[k];
  if (!v) throw new Error(`lightPlan: unknown lighting key "${k}" (have: ${Object.keys(LIGHT_KEYS).join(", ")})`);
  return v;
};
const toonOf = (k: LightKey): ToonSetup => (typeof k.toon === "string" ? TOON_SETUPS[k.toon] : k.toon);
const lookOf = (k: LightKey): Look => (typeof k.look === "string" ? LOOKS[k.look] ?? LOOKS["toonworld-day"] : k.look);
const smooth = (u: number) => u * u * (3 - 2 * u);

export type LightHandles = { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; amb: THREE.AmbientLight; skyM: THREE.Mesh; toon?: ToonUniforms };

export function lightPlan(keys: ([number, string | LightKey] | [number, string | LightKey, number])[], o: { fade?: number } = {}) {
  const fade = o.fade ?? 14;
  // optional third element = this change's own fade in frames (0 = switch exactly on the frame, for a key change on a hard cut:
  // a fade that starts 14 frames before the cut showed up as a luminance zig-zag in QA)
  const ks = keys.map(([f, k, fd]) => [f, keyOf(k), fd ?? fade] as [number, LightKey, number]).sort((a, b) => a[0] - b[0]);
  let H: LightHandles | null = null;
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();
  /** the two keys around a frame and the eased mix between them (0 = a) */
  const at = (frame: number) => {
    let i = 0;
    while (i < ks.length - 1 && ks[i + 1][0] <= frame) i++;
    const next = ks[i + 1];
    if (next && next[2] > 0 && frame > next[0] - next[2]) return { a: ks[i][1], b: next[1], t: smooth(Math.min(1, Math.max(0, (frame - (next[0] - next[2])) / next[2]))) };
    return { a: ks[i][1], b: ks[i][1], t: 0 };
  };
  const mixC = (x: string, y: string, t: number, out: THREE.Color) => out.copy(tmpA.set(x)).lerp(tmpB.set(y), t);
  const mixN = (x: number, y: number, t: number) => x + (y - x) * t;
  return {
    keys: ks, at,
    /** frame -> Look, for `<Stage3D look=...>` */
    look: (frame: number): Look => { const { a, b, t } = at(frame); return t <= 0 ? lookOf(a) : t >= 1 ? lookOf(b) : lerpLook(lookOf(a), lookOf(b), t); },
    /** create sky + sun + hemisphere + ambient + fog from the first key */
    build(scene: THREE.Scene, opts: { shadowSize?: number; target?: [number, number, number] } = {}): LightHandles {
      const k = ks[0][1], L = LIGHTS[k.lights];
      const skyM = sky(scene, L.skyTop, L.skyHorizon);
      const l = lights(scene, k.lights, { shadowSize: opts.shadowSize, target: opts.target, fog: k.fog ?? L.fogNF ?? [12, 140] });
      H = { sun: l.sun, hemi: l.hemi, amb: l.amb, skyM };
      return H;
    },
    /** cel-shade the finished world with uniforms that follow the plan (call once at the end of build) */
    toonify(scene: THREE.Scene): ToonUniforms {
      if (!H) throw new Error("lightPlan.toonify: call build() first");
      const k = ks[0][1];
      H.toon = toonifyScene(scene, makeToonUniforms(toonOf(k), LIGHTS[k.lights].sunI * (k.sunGain ?? 1)));
      return H.toon;
    },
    /** cross-fade every light value for this frame; `target` = what the shadow frustum centres on (the current place) */
    update(frame: number, fps: number, u: { target?: [number, number, number]; cookieMul?: number } = {}) {
      if (!H) throw new Error("lightPlan.update: call build() first");
      const { a, b, t } = at(frame), A = LIGHTS[a.lights], B = LIGHTS[b.lights];
      const sunI = mixN(A.sunI * (a.sunGain ?? 1), B.sunI * (b.sunGain ?? 1), t);
      mixC(A.sun, B.sun, t, H.sun.color); H.sun.intensity = sunI;
      const d = new THREE.Vector3(...(a.sunDir ?? A.dir)).normalize().lerp(new THREE.Vector3(...(b.sunDir ?? B.dir)).normalize(), t).normalize();
      const tg = u.target ? new THREE.Vector3(...u.target) : H.sun.target.position.clone();
      H.sun.target.position.copy(tg); H.sun.target.updateMatrixWorld();
      H.sun.position.copy(tg).addScaledVector(d, 80);
      mixC(A.sky, B.sky, t, H.hemi.color); mixC(A.ground, B.ground, t, H.hemi.groundColor); H.hemi.intensity = mixN(A.hemiI, B.hemiI, t);
      H.amb.intensity = mixN(A.amb, B.amb, t);
      const su = (H.skyM.material as THREE.ShaderMaterial).uniforms;
      mixC(A.skyTop, B.skyTop, t, su.top.value as THREE.Color); mixC(A.skyHorizon, B.skyHorizon, t, su.horizon.value as THREE.Color);
      (su.bottom.value as THREE.Color).copy(su.horizon.value as THREE.Color);
      (su.sunDir.value as THREE.Vector3).copy(d); (su.sunCol.value as THREE.Color).copy(H.sun.color); su.sunGlow.value = mixN(a.sunGlow ?? 0, b.sunGlow ?? 0, t);
      const fog = (H.sun.parent as THREE.Scene | null)?.fog as THREE.Fog | undefined;
      if (fog) {
        mixC(A.fog, B.fog, t, fog.color);
        const fa = a.fog ?? A.fogNF ?? [12, 140], fb = b.fog ?? B.fogNF ?? [12, 140];
        fog.near = mixN(fa[0], fb[0], t); fog.far = mixN(fa[1], fb[1], t);
      }
      if (H.toon) {
        applyToonSetup(H.toon, toonOf(a), toonOf(b), t, sunI);
        H.toon.uCookie.value = mixN(a.cookie ?? 0, b.cookie ?? 0, t) * (u.cookieMul ?? 1); // no cloud shadows indoors
        H.toon.uCookieOff.value.set((frame / fps) * 0.7, (frame / fps) * 0.3);
      }
      return { key: t < 0.5 ? a : b, mix: t, sunDir: d, night: Math.max(0, 1 - sunI / 1.6), practicals: mixN(a.practicals ?? 0, b.practicals ?? 0, t),
        skyTop: su.top.value as THREE.Color, skyHorizon: su.horizon.value as THREE.Color };
    },
  };
}
export type LightPlan = ReturnType<typeof lightPlan>;
/** A key with a project-specific grade tweak: `tweak("day", { grade: { saturation: 1.14 } })`. */
export const tweak = (k: string | LightKey, lookOverride: Record<string, unknown>, more: Partial<LightKey> = {}): LightKey => {
  const base = keyOf(k);
  return { ...base, ...more, look: deepMerge(lookOf(base), lookOverride) };
};
