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

export type ToonUniforms = {
  uKeyRef: { value: number }; // sun intensity / PI  (normalises direct light to 0..1)
  uRampLo: { value: number }; uRampHi: { value: number };
  uShadeMul: { value: THREE.Color }; uShadeSat: { value: number };
  uShadeReplace: { value: THREE.Color }; uShadeReplaceAmt: { value: number };
  uLitTint: { value: THREE.Color }; uLitGain: { value: number };
  uAmbient: { value: number }; uRim: { value: number }; uRimColor: { value: THREE.Color };
  uDrift: { value: number }; uDriftScale: { value: number };
};

export type ToonSetup = { cardTint?: string; rampLo: number; rampHi: number; shadeMul: string; shadeSat: number; shadeReplace: string; shadeReplaceAmt: number;
  litTint: string; litGain: number; ambient: number; rim: number; rimColor: string; drift: number };

/** Measured per lighting setup (references/styles/toonworld-explainer.md). */
export const TOON_SETUPS: Record<"day" | "golden" | "night" | "interior", ToonSetup> = {
  day: { cardTint: "#ffffff", rampLo: 0.18, rampHi: 0.42, shadeMul: "#8a8296", shadeSat: 0.25, shadeReplace: "#6a6d92", shadeReplaceAmt: 0.0, litTint: "#f6f8ff", litGain: 1.08, ambient: 0.22, rim: 0.12, rimColor: "#ffffff", drift: 0.06 },
  golden: { cardTint: "#ffd2a0", rampLo: 0.12, rampHi: 0.34, shadeMul: "#5c5578", shadeSat: 0.15, shadeReplace: "#5b5173", shadeReplaceAmt: 0.3, litTint: "#ffe0cf", litGain: 1.08, ambient: 0.22, rim: 0.3, rimColor: "#ffb36b", drift: 0.06 },
  night: { cardTint: "#bdb6f0", rampLo: 0.15, rampHi: 0.4, shadeMul: "#3d3f86", shadeSat: 0.1, shadeReplace: "#26286a", shadeReplaceAmt: 0.45, litTint: "#b9c4ff", litGain: 0.85, ambient: 0.16, rim: 0.22, rimColor: "#8d8cff", drift: 0.05 },
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
  float key = 0.0;
  #if NUM_DIR_LIGHTS > 0
    key = sunVis * max(dot(normalize(normal), directionalLights[0].direction), 0.0);   // sun only: shadow x N.L
  #endif
  float ramp = smoothstep(uRampLo, uRampHi, key);
  vec3 lit = albedo * uLitTint * uLitGain;
  vec3 shade = toonSat(albedo * uShadeMul, uShadeSat);
  shade = mix(shade, uShadeReplace * (0.6 + 0.8 * aL), uShadeReplaceAmt);
  vec3 col = mix(shade, lit, ramp) + reflectedLight.indirectDiffuse * uAmbient;
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
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>\n${TOON_VERT_HEAD}`)
      .replace("#include <worldpos_vertex>", TOON_VERT_BODY);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\n${TOON_FRAG_HEAD}`)
      .replace("#include <lights_fragment_begin>", sunVisChunk())
      .replace("#include <opaque_fragment>", TOON_FRAG_BODY);
  };
  m.customProgramCacheKey = () => "toon-v2";
  m.needsUpdate = true;
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
};

export function cardShade(mat: THREE.MeshLambertMaterial) {
  mat.emissive = new THREE.Color(0x000000);
  mat.emissiveIntensity = 0;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, CARD_U);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uTint; uniform float uFloor; uniform float uGrad; uniform vec3 uSide;")
      .replace("#include <lights_fragment_begin>", sunVisChunk())
      .replace("#include <opaque_fragment>", `
  {
    vec3 tk = mix(vec3(1.0), uTint, 0.55);
    tk /= pow(max(dot(tk, vec3(0.2126, 0.7152, 0.0722)), 0.2), 0.7);
    vec3 cardCol = diffuseColor.rgb * tk * mix(uFloor, 1.0, sunVis);
    #if NUM_DIR_LIGHTS > 0
      vec3 sv = directionalLights[0].direction;
      float side = sign(sv.x) * smoothstep(0.0, 0.35, abs(sv.x));
      float uu = clamp((vMapUv.x - 0.5) / 0.2, -1.0, 1.0) * sign(dFdx(vMapUv.x) + 1e-7);
      float dark = smoothstep(-0.15, 0.9, -uu * side);
      cardCol *= (1.0 - uGrad * dark * 0.5) * mix(vec3(1.0), uSide, dark * 0.5);
    #endif
    outgoingLight = cardCol;
  }
  #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => "vfcard-v1";
  mat.needsUpdate = true;
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
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        prev?.call(m, sh, r);
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
      };
      m.customProgramCacheKey = () => `${(m as any).customProgramCacheKey?.() ?? ""}+wind`;
      m.needsUpdate = true;
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
        gl_Position = projectionMatrix * mvPosition; #include <fog_vertex> }`,
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
