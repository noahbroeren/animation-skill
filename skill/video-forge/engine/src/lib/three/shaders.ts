/**
 * Stylisation shaders (GLSL) for the 3D world. All are deterministic: time comes from the frame.
 *
 * toonifyScene(scene, opts)  painted cel lighting on every world material (Lambert/Standard), via onBeforeCompile:
 *   - soft cel ramp on the KEY light (incl. its shadow map) instead of a smooth Lambert falloff
 *   - shade = the surface's own hue x shadeMul with a saturation boost (measured day rule: shade ~0.5 x lit,
 *     same hue, +sat), optionally pulled toward a replacement colour (measured sunset rule: violet shadows)
 *   - rim light, world-space low-frequency "painted drift" (flat colour fields that gently vary)
 *   Returns shared uniforms -> animate them per frame for lighting-setup changes (see TOON_SETUPS).
 * windSway(object, amp)      vertex-shader sway for foliage (height-weighted, world-phase, gusts).
 * toonWater(w, h, colors)    stylised water: far->near gradient, drifting crest marks with dark troughs, glints.
 * (camera motion blur lives in post.ts: depth-reprojected, shutter-angle based.)
 */
import * as THREE from "three";
import { NOINK } from "./post";

/**
 * lights_fragment_begin with the SUN's shadow term exposed as `sunVis` (directional light 0 = the sun created by
 * lights()). Throws if three.js changes the chunk, so a silent mismatch can't ship (technique: claude-animated-shorts
 * shade.ts, MIT).
 */
export function sunVisChunk(): string {
  const src = THREE.ShaderChunk.lights_fragment_begin;
  const a = "directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]";
  const b = "vDirectionalShadowCoord[ i ] ) : 1.0;";
  if (!src.includes(a) || !src.includes(b)) throw new Error("three.js lights_fragment_begin changed: update sunVisChunk()");
  // three unrolls this loop and only substitutes "[ i ]", so take the FIRST shadowed directional light via a flag
  return "float sunVis = 1.0; float _svSet = 0.0;\n" + src.replace(a, "float _sv = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]")
    .replace(b, b + "\n\t\tif ( _svSet < 0.5 ) { sunVis = _sv; _svSet = 1.0; }\n\t\tdirectLight.color *= _sv;");
}

/**
 * Composable shader patches (1.6). Every material patch goes through here, so patches STACK: `windSway()` followed by
 * `toonifyScene()` used to lose the wind (the second `onBeforeCompile` replaced the first; found by code review, the
 * foliage of both demo shorts had not moved since 1.1). Order only matters when two patches replace the same chunk.
 */
type PatchFn = (sh: THREE.WebGLProgramParametersWithUniforms) => void;
export function addPatch(m: THREE.Material, key: string, fn: PatchFn) {
  const list: [string, PatchFn][] = (m.userData.patches ??= []);
  if (list.some(([k]) => k === key)) return;
  list.push([key, fn]);
  m.onBeforeCompile = (sh) => { for (const [, f] of m.userData.patches as [string, PatchFn][]) f(sh); };
  m.customProgramCacheKey = () => (m.userData.patches as [string, PatchFn][]).map(([k]) => k).join("+");
  m.needsUpdate = true;
}

export type ToonUniforms = {
  uKeyRef: { value: number }; // sun intensity / PI  (normalises direct light to 0..1)
  uRampLo: { value: number }; uRampHi: { value: number };
  uShadeMul: { value: THREE.Color }; uShadeSat: { value: number };
  uShadeReplace: { value: THREE.Color }; uShadeReplaceAmt: { value: number };
  uLitTint: { value: THREE.Color }; uLitGain: { value: number };
  uAmbient: { value: number }; uRim: { value: number }; uRimColor: { value: THREE.Color };
  uDrift: { value: number }; uDriftScale: { value: number };
  /** 1.6: shade follows the form (sky fill on up-facing shade, ground bounce on down-facing; colours are x2 multipliers
   *  around mid-grey) and a thin saturated band sits on the terminator (the painterly "bounce in the core shadow") */
  uSkyFill: { value: THREE.Color }; uBounce: { value: THREE.Color }; uTerm: { value: number }; uTermColor: { value: THREE.Color };
  /** 1.6 sun cookie: drifting cloud shadows break up big lit planes (0 = off, 0.25-0.45 for an open exterior).
   *  Animate uCookieOff (world metres) with time for drift: `u.uCookieOff.value.set(t * 0.6, t * 0.25)` */
  uCookie: { value: number }; uCookieOff: { value: THREE.Vector2 };
};

export type ToonSetup = { cardTint?: string; rampLo: number; rampHi: number; shadeMul: string; shadeSat: number; shadeReplace: string; shadeReplaceAmt: number;
  litTint: string; litGain: number; ambient: number; rim: number; rimColor: string; drift: number;
  skyFill?: string; bounce?: string; term?: number; termColor?: string };
const FORM0 = { skyFill: "#80869c", bounce: "#8c7c6c", term: 0.1, termColor: "#ff8a5a" };
const FORM: Record<string, Partial<typeof FORM0>> = { golden: { skyFill: "#7a78a8", bounce: "#96785e", term: 0.16, termColor: "#ff7a3a" },
  night: { skyFill: "#7078b0", bounce: "#74708c", term: 0.05, termColor: "#7a86ff" }, interior: { skyFill: "#84849a", bounce: "#8e7c68", term: 0.08, termColor: "#ffa066" } };
const formOf = (s: ToonSetup) => { const k = (Object.keys(TOON_SETUPS) as (keyof typeof TOON_SETUPS)[]).find((n) => TOON_SETUPS[n] === s); return { ...FORM0, ...(k ? FORM[k] : {}), ...(s.skyFill ? { skyFill: s.skyFill } : {}), ...(s.bounce ? { bounce: s.bounce } : {}), ...(s.term !== undefined ? { term: s.term } : {}), ...(s.termColor ? { termColor: s.termColor } : {}) }; };

/** Measured per lighting setup (references/styles/toonworld-explainer.md). */
export const TOON_SETUPS: Record<"day" | "golden" | "night" | "interior" | "overcast" | "rain" | "dusk" | "fog" | "interiorWindow" | "sunsetBack", ToonSetup> = {
  // 1.6 lighting keys (references/research/lighting.md B4)
  overcast:       { cardTint: "#eef2f6", rampLo: 0.10, rampHi: 0.60, shadeMul: "#b4b8c4", shadeSat: 0.05, shadeReplace: "#8f9aa8", shadeReplaceAmt: 0.10, litTint: "#f2f5fa", litGain: 1.00, ambient: 0.30, rim: 0.05, rimColor: "#ffffff", drift: 0.05, term: 0.0 },
  rain:           { cardTint: "#cfe0e8", rampLo: 0.10, rampHi: 0.60, shadeMul: "#9aa6b2", shadeSat: -0.15, shadeReplace: "#314e5f", shadeReplaceAmt: 0.25, litTint: "#dce8ee", litGain: 0.92, ambient: 0.28, rim: 0.08, rimColor: "#cfe6f0", drift: 0.05, skyFill: "#7f8c98", bounce: "#6a7480", term: 0.0 },
  dusk:           { cardTint: "#d8c2ee", rampLo: 0.12, rampHi: 0.40, shadeMul: "#4a4488", shadeSat: 0.15, shadeReplace: "#2a1f5c", shadeReplaceAmt: 0.40, litTint: "#ffc9c0", litGain: 0.92, ambient: 0.20, rim: 0.30, rimColor: "#ff9a8a", drift: 0.05, term: 0.10, termColor: "#ff6a8a" },
  fog:            { cardTint: "#eef0ee", rampLo: 0.05, rampHi: 0.70, shadeMul: "#c2c6c8", shadeSat: -0.10, shadeReplace: "#aab4ba", shadeReplaceAmt: 0.30, litTint: "#fff6ea", litGain: 1.00, ambient: 0.30, rim: 0.20, rimColor: "#fff2dc", drift: 0.04, term: 0.0 },
  interiorWindow: { cardTint: "#e8f0f6", rampLo: 0.16, rampHi: 0.40, shadeMul: "#6f7890", shadeSat: 0.15, shadeReplace: "#4c5670", shadeReplaceAmt: 0.20, litTint: "#f0f6ff", litGain: 1.06, ambient: 0.24, rim: 0.12, rimColor: "#e6f2ff", drift: 0.05, bounce: "#a08468" },
  sunsetBack:     { cardTint: "#ffc79a", rampLo: 0.10, rampHi: 0.30, shadeMul: "#4f4a7a", shadeSat: 0.15, shadeReplace: "#4a3f78", shadeReplaceAmt: 0.40, litTint: "#ffd2b0", litGain: 1.10, ambient: 0.26, rim: 0.55, rimColor: "#ffa65a", drift: 0.06, term: 0.18, termColor: "#ff6a2a" },
  day: { cardTint: "#ffffff", rampLo: 0.18, rampHi: 0.42, shadeMul: "#8a8296", shadeSat: 0.25, shadeReplace: "#6a6d92", shadeReplaceAmt: 0.0, litTint: "#f6f8ff", litGain: 1.08, ambient: 0.22, rim: 0.12, rimColor: "#ffffff", drift: 0.06 },
  golden: { cardTint: "#ffd2a0", rampLo: 0.12, rampHi: 0.34, shadeMul: "#655c78", shadeSat: 0.15, shadeReplace: "#6a5d70", shadeReplaceAmt: 0.16, litTint: "#ffe0cf", litGain: 1.08, ambient: 0.22, rim: 0.3, rimColor: "#ffb36b", drift: 0.06 },
  night: { cardTint: "#bdb6f0", rampLo: 0.15, rampHi: 0.4, shadeMul: "#3d4078", shadeSat: 0.1, shadeReplace: "#232a52", shadeReplaceAmt: 0.42, litTint: "#b9c4ff", litGain: 0.85, ambient: 0.16, rim: 0.22, rimColor: "#8d8cff", drift: 0.05 },
  interior: { cardTint: "#ffe6cc", rampLo: 0.16, rampHi: 0.4, shadeMul: "#7d6f84", shadeSat: 0.2, shadeReplace: "#5e5070", shadeReplaceAmt: 0.15, litTint: "#ffe6c4", litGain: 1.05, ambient: 0.24, rim: 0.1, rimColor: "#ffe2b8", drift: 0.05 },
};

export function makeToonUniforms(setup: ToonSetup = TOON_SETUPS.day, sunIntensity = 2.4): ToonUniforms {
  return {
    uKeyRef: { value: sunIntensity / Math.PI }, uRampLo: { value: setup.rampLo }, uRampHi: { value: setup.rampHi },
    uShadeMul: { value: new THREE.Color(setup.shadeMul) }, uShadeSat: { value: setup.shadeSat },
    uShadeReplace: { value: new THREE.Color(setup.shadeReplace) }, uShadeReplaceAmt: { value: setup.shadeReplaceAmt },
    uLitTint: { value: new THREE.Color(setup.litTint) }, uLitGain: { value: setup.litGain },
    uAmbient: { value: setup.ambient }, uRim: { value: setup.rim }, uRimColor: { value: new THREE.Color(setup.rimColor) },
    uDrift: { value: setup.drift }, uDriftScale: { value: 0.12 },
    uSkyFill: { value: new THREE.Color(formOf(setup).skyFill) }, uBounce: { value: new THREE.Color(formOf(setup).bounce) },
    uTerm: { value: formOf(setup).term }, uTermColor: { value: new THREE.Color(formOf(setup).termColor) },
    uCookie: { value: 0 }, uCookieOff: { value: new THREE.Vector2() },
  };
}

/** Blend two setups into the uniforms (call every frame for smooth light changes). */
export function applyToonSetup(u: ToonUniforms, a: ToonSetup, b: ToonSetup = a, t = 0, sunIntensity?: number) {
  const n = (x: number, y: number) => x + (y - x) * t;
  const c = (x: string, y: string, out: THREE.Color) => out.set(x).lerp(new THREE.Color(y), t);
  u.uRampLo.value = n(a.rampLo, b.rampLo); u.uRampHi.value = n(a.rampHi, b.rampHi);
  c(a.shadeMul, b.shadeMul, u.uShadeMul.value); u.uShadeSat.value = n(a.shadeSat, b.shadeSat);
  c(a.shadeReplace, b.shadeReplace, u.uShadeReplace.value); u.uShadeReplaceAmt.value = n(a.shadeReplaceAmt, b.shadeReplaceAmt);
  c(a.litTint, b.litTint, u.uLitTint.value); u.uLitGain.value = n(a.litGain, b.litGain);
  u.uAmbient.value = n(a.ambient, b.ambient); u.uRim.value = n(a.rim, b.rim); c(a.rimColor, b.rimColor, u.uRimColor.value);
  u.uDrift.value = n(a.drift, b.drift);
  const fa = formOf(a), fb = formOf(b);
  c(fa.skyFill, fb.skyFill, u.uSkyFill.value); c(fa.bounce, fb.bounce, u.uBounce.value); u.uTerm.value = n(fa.term, fb.term); c(fa.termColor, fb.termColor, u.uTermColor.value);
  CARD_U.uRimC.value.set(a.rimColor).lerp(new THREE.Color(b.rimColor), t); CARD_U.uRimA.value = 0.18 + n(a.rim, b.rim) * 0.8;
  // shade tint for cards: the world's shade colour, lifted most of the way to white (faces must stay readable)
  CARD_U.uShadeC.value.set(a.shadeMul).lerp(new THREE.Color(b.shadeMul), t).lerp(new THREE.Color("#ffffff"), 0.62);
  if (sunIntensity !== undefined) u.uKeyRef.value = sunIntensity / Math.PI;
  CARD_U.uTint.value.set(a.cardTint ?? "#ffffff").lerp(new THREE.Color(b.cardTint ?? "#ffffff"), t);
}

const TOON_VERT_HEAD = /* glsl */ `varying vec3 vToonWPos;`;
const TOON_VERT_BODY = /* glsl */ `
#include <worldpos_vertex>
vToonWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`;
const TOON_FRAG_HEAD = /* glsl */ `
varying vec3 vToonWPos;
uniform float uKeyRef; uniform float uRampLo; uniform float uRampHi;
uniform vec3 uShadeMul; uniform float uShadeSat; uniform vec3 uShadeReplace; uniform float uShadeReplaceAmt;
uniform vec3 uLitTint; uniform float uLitGain; uniform float uAmbient; uniform float uRim; uniform vec3 uRimColor;
uniform float uDrift; uniform float uDriftScale;
uniform vec3 uSkyFill; uniform vec3 uBounce; uniform float uTerm; uniform vec3 uTermColor; uniform float uCookie; uniform vec2 uCookieOff;
float toonHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float toonNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(toonHash(i), toonHash(i+vec3(1,0,0)), f.x), mix(toonHash(i+vec3(0,1,0)), toonHash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(toonHash(i+vec3(0,0,1)), toonHash(i+vec3(1,0,1)), f.x), mix(toonHash(i+vec3(0,1,1)), toonHash(i+vec3(1,1,1)), f.x), f.y), f.z); }
vec3 toonSat(vec3 c, float s){ float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); return mix(vec3(l), c, 1.0 + s); }`;
const TOON_FRAG_BODY = /* glsl */ `
{
  vec3 albedo = diffuseColor.rgb;
  float drift = (toonNoise(vToonWPos * uDriftScale) - 0.5) * 2.0;
  albedo *= 1.0 + uDrift * drift;
  float aL = max(dot(albedo, vec3(0.3333)), 1e-3);
  float key = 0.0; vec3 sunPart = vec3(0.0);
  #if NUM_DIR_LIGHTS > 0
    key = max(dot(normalize(normal), directionalLights[0].direction), 0.0);          // FORM term: N.L only
    sunPart = directionalLights[0].color * sunVis * key * diffuseColor.rgb * RECIPROCAL_PI;
  #endif
  // form x cast with separate thresholds: the cast-shadow edge no longer moves with the surface angle (it used to sit
  // at sunVis .18-.42 on the ground and .36-.84 on walls because the product N.L x shadow shared one threshold)
  float cookie = 1.0 - uCookie * smoothstep(0.48, 0.66, toonNoise(vec3((vToonWPos.xz + uCookieOff) * 0.055, 3.7)) * 0.65 + toonNoise(vec3((vToonWPos.xz + uCookieOff) * 0.16, 9.1)) * 0.35);
  float ramp = smoothstep(uRampLo, uRampHi, key) * smoothstep(0.32, 0.68, sunVis * cookie);
  vec3 lit = albedo * uLitTint * uLitGain;
  vec3 shade = toonSat(albedo * uShadeMul, uShadeSat);
  shade = mix(shade, uShadeReplace * (0.6 + 0.8 * aL), uShadeReplaceAmt);
  vec3 wN = inverseTransformDirection(normalize(normal), viewMatrix);
  shade *= 2.0 * mix(uBounce, uSkyFill, wN.y * 0.5 + 0.5);                       // form-following fill: sky from above, bounce from below
  float mid = 0.5 * (uRampLo + uRampHi);
  float term = smoothstep(uRampLo - 0.03, mid, key) * (1.0 - smoothstep(mid, uRampHi + 0.08, key));
  // every light that is NOT the sun (lamps, windows, fires) used to be thrown away: add it back as one soft band
  vec3 extra = max(reflectedLight.directDiffuse - sunPart, vec3(0.0));
  float eL = dot(extra, vec3(0.2126, 0.7152, 0.0722));
  extra *= smoothstep(0.004, 0.035, eL) * min(1.0, 0.32 / max(eL, 1e-4));          // banded and capped: a pool of light, not a blow-out
  vec3 col = mix(shade, lit, ramp) + reflectedLight.indirectDiffuse * uAmbient + albedo * uTermColor * term * uTerm * smoothstep(0.32, 0.68, sunVis) + extra * 1.0; // (1.6 / cap 0.5 measured too hot: night highlights b 15.5 -> 21.9)
  vec3 V = normalize(vViewPosition);
  float rim = pow(1.0 - clamp(abs(dot(normalize(normal), V)), 0.0, 1.0), 3.0) * uRim * ramp;
  col += uRimColor * rim * aL;
  outgoingLight = col + totalEmissiveRadiance;
}
#include <opaque_fragment>`;

/** Patch one material (Lambert or Standard) to the painted cel model. Idempotent. */
export function toonifyMaterial(m: THREE.Material, u: ToonUniforms) {
  const mm = m as THREE.MeshLambertMaterial;
  if (!(mm.isMeshLambertMaterial || (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) || m.userData.toon) return;
  m.userData.toon = true;
  addPatch(m, "toon-v6", (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>\n${TOON_VERT_HEAD}`)
      .replace("#include <worldpos_vertex>", TOON_VERT_BODY);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\n${TOON_FRAG_HEAD}`)
      .replace("#include <lights_fragment_begin>", sunVisChunk())
      .replace("#include <opaque_fragment>", TOON_FRAG_BODY);
  });
}

/** Toonify every world mesh (skips NOINK cards/sky/FX and ShaderMaterials). */
export function toonifyScene(scene: THREE.Object3D, u: ToonUniforms) {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.layers.mask === 1 << NOINK) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => m && !(m as THREE.ShaderMaterial).isShaderMaterial && toonifyMaterial(m, u));
  });
  return u;
}

// ------------------------------------------------------------------ character card shading
/**
 * Shared uniforms for every CharacterCard (measured: characters are NOT emissive; they take the light's colour,
 * keep a bright floor in cast shadow (x0.86), darken toward the side away from the sun, faces stay ~0.93).
 */
export const CARD_U = {
  uTint: { value: new THREE.Color("#fff2ec") }, uFloor: { value: 0.86 }, uGrad: { value: 0.32 },
  uSide: { value: new THREE.Color(0.92, 0.9, 0.96) },
  /** 1.6 rim: a thin band of key-light colour on the lit, upper edge of every card (separates flat characters from busy sets) */
  uRimC: { value: new THREE.Color("#ffffff") }, uRimA: { value: 0.28 },
  /** 1.6: a card in cast shadow is multiplied by this tint (derived from the scene's shade colour), not by a grey 0.86 */
  uShadeC: { value: new THREE.Color(0.86, 0.84, 0.92) },
};

export function cardShade(mat: THREE.MeshLambertMaterial) {
  mat.emissive = new THREE.Color(0x000000);
  mat.emissiveIntensity = 0;
  addPatch(mat, "vfcard-v6", (sh) => {
    Object.assign(sh.uniforms, CARD_U);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uTint; uniform float uFloor; uniform float uGrad; uniform vec3 uSide; uniform vec3 uRimC; uniform float uRimA; uniform vec3 uShadeC;")
      .replace("#include <lights_fragment_begin>", sunVisChunk())
      .replace("#include <opaque_fragment>", `
  {
    vec3 tk = mix(vec3(1.0), uTint, 0.55);
    tk /= pow(max(dot(tk, vec3(0.2126, 0.7152, 0.0722)), 0.2), 0.7);
    vec3 cardCol = diffuseColor.rgb * tk * mix(uShadeC, vec3(1.0), smoothstep(0.32, 0.68, sunVis));
    #if NUM_DIR_LIGHTS > 0
      vec3 sv = directionalLights[0].direction;
      float side = sign(sv.x) * smoothstep(0.0, 0.35, abs(sv.x));
      float uu = clamp((vMapUv.x - 0.5) / 0.2, -1.0, 1.0) * sign(dFdx(vMapUv.x) + 1e-7);
      float dark = smoothstep(-0.15, 0.9, -uu * side);
      cardCol *= (1.0 - uGrad * dark * 0.5) * mix(vec3(1.0), uSide, dark * 0.5);
      #ifdef USE_MAP
        float su = sign(dFdx(vMapUv.x) + 1e-7);                                      // mirrored cards flip u
        vec2 tpx = 1.0 / vec2(textureSize(map, 0));                                  // rim width in drawing pixels, whatever the card padding
        float aRim = texture2D(map, vMapUv + vec2(side * su * 26.0, 22.0) * tpx).a;    // toward the key light and up, past the ink line
        float fillL = dot(diffuseColor.rgb, vec3(0.3333));                           // never lighten the ink outline itself (it read as a grey sticker edge)
        cardCol += uRimC * (1.0 - smoothstep(0.2, 0.6, aRim)) * uRimA * smoothstep(0.16, 0.34, fillL) * mix(0.35, 1.0, sunVis);
      #endif
      // local lights (lamps, fires, windows): everything in directDiffuse that is not the sun, as one soft capped band
      vec3 sunP = directionalLights[0].color * sunVis * max(dot(normalize(normal), sv), 0.0) * diffuseColor.rgb * RECIPROCAL_PI;
      vec3 ex = max(reflectedLight.directDiffuse - sunP, vec3(0.0)); float exL = dot(ex, vec3(0.2126, 0.7152, 0.0722));
      cardCol += ex * smoothstep(0.004, 0.035, exL) * min(1.0, 0.3 / max(exL, 1e-4)) * 1.0;
    #endif
    outgoingLight = cardCol;
  }
  #include <opaque_fragment>`);
  });
  return mat;
}

// ------------------------------------------------------------------ wind sway

export const windUniforms = () => ({ uWindTime: { value: 0 }, uWindAmp: { value: 0.06 } });
export type WindUniforms = ReturnType<typeof windUniforms>;

/** Foliage sway: displacement grows with height above the object's base; phase from world position; slow gusts. */
export function windSway(root: THREE.Object3D, u: WindUniforms, minY = 0.6) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m || m.userData.wind) continue;
      m.userData.wind = true;
      addPatch(m, "wind-v1", (sh) => {
        Object.assign(sh.uniforms, u, { uWindMinY: { value: minY } });
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uWindTime; uniform float uWindAmp; uniform float uWindMinY;")
          .replace("#include <begin_vertex>", `#include <begin_vertex>
{
  vec4 wp0 = modelMatrix * vec4(transformed, 1.0);
  float h = max(0.0, wp0.y - uWindMinY);
  float ph = wp0.x * 0.35 + wp0.z * 0.27;
  float gust = 0.6 + 0.4 * sin(uWindTime * 0.37 + ph * 0.2);
  float s = sin(uWindTime * 1.6 + ph) * 0.7 + sin(uWindTime * 2.9 + ph * 1.7) * 0.3;
  transformed.x += s * uWindAmp * h * gust;
  transformed.z += cos(uWindTime * 1.3 + ph) * uWindAmp * 0.5 * h * gust;
}`);
      });
    }
  });
}

// ------------------------------------------------------------------ water

/** Stylised water plane (measured: vertical gradient far->near, sparse horizontal crest marks with dark troughs,
 *  thin glints, no mirrored reflections). Call .update(frame, fps). */
export function toonWater(w = 200, h = 200, o: { far?: string; near?: string; crest?: string; glint?: string } = {}) {
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uFar: { value: new THREE.Color(o.far ?? "#1194b6") }, uNear: { value: new THREE.Color(o.near ?? "#035077") },
      uCrest: { value: new THREE.Color(o.crest ?? "#7fd3ea") }, uGlint: { value: new THREE.Color(o.glint ?? "#ffffff") },
    }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vW; varying float vDist;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; vDist = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`, // 1.7: the include sat mid-line, three only resolves includes at line start, so the shader never compiled
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec3 uFar; uniform vec3 uNear; uniform vec3 uCrest; uniform vec3 uGlint;
      varying vec3 vW; varying float vDist;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float d = clamp(vDist / 120.0, 0.0, 1.0);
        vec3 c = mix(uNear, uFar, pow(d, 0.6));
        vec2 p = vW.xz * vec2(0.22, 0.9) + vec2(uTime * 0.12, uTime * 0.05);
        float m = n2(p) * 0.65 + n2(p * 2.3 + 7.0) * 0.35;
        float crest = smoothstep(0.78, 0.86, m) * (1.0 - smoothstep(0.86, 0.95, m));
        float trough = smoothstep(0.70, 0.78, m) * (1.0 - smoothstep(0.78, 0.8, m));
        float density = mix(0.4, 1.0, d);
        c = mix(c, uCrest, crest * density * 0.9);
        c *= 1.0 - trough * 0.18 * density;
        float g = step(0.985, n2(vW.xz * vec2(0.6, 3.0) + uTime * vec2(0.3, 0.0))) * (1.0 - d * 0.5);
        c = mix(c, uGlint, g * 0.8);
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  return { mesh, update: (frame: number, fps = 30) => { mat.uniforms.uTime.value = frame / fps; } };
}
