/**
 * PostPipeline: deterministic, resolution-independent finishing for three.js scenes.
 *
 *   scene (MSAA x4, half-float, depth)
 *     -> INK   world-only normals+depth -> edge mask -> composite      (before blur!)
 *     -> DOF   depth-aware gather blur (thin-lens CoC from focus distance)
 *     -> BLOOM soft-knee bright pass + dual-filter down/up chain (+ red halation)
 *     -> FINAL chroma aberration, lens softness, exposure, tonemap, sRGB,
 *              display-space grade (S-curve, saturation/vibrance, split tone,
 *              black/white floor), vignette, deterministic grain, dither
 *
 * Ordering lesson from the reference study: running blur in the same step as the
 * outline pass wiped the outlines out. Ink is its own pass and is blurred WITH the
 * background afterwards, as in the reference.
 *
 * Every length is in u (1 u = 1 px at a 1080 px short side): renders match at
 * preview, 2K and 4K. Ink technique (2nd difference of 1/z: exactly 0 on planes,
 * so no grazing-angle false lines; normal creases) adapted from the MIT-licensed
 * claude-animated-shorts ink pass (c) 2026 Mr omi.
 */
import * as THREE from "three";
import { Look } from "../look";

/** Objects on this layer are never outlined (character cards, sky, clouds, particles). */
export const NOINK = 3;
/** Objects on this layer only exist for shadow maps (invisible to the camera). */
export const SHADOW_ONLY = 5;

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const NORMAL_VERT = /* glsl */ `
#include <common>
varying vec3 vN;
void main(){
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  vN = transformedNormal;
  #include <begin_vertex>
  #include <project_vertex>
}`;
const NORMAL_FRAG = /* glsl */ `
varying vec3 vN;
void main(){ vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0); gl_FragColor = vec4(n, 1.0); }`;

const INK_MASK = /* glsl */ `
#include <packing>
uniform sampler2D tNormal; uniform sampler2D tDepth; uniform sampler2D tMainDepth;
uniform vec2 texel; uniform float cNear; uniform float cFar;
uniform float wNear; uniform float wFar; uniform float dNear; uniform float dFar; uniform float creases;
uniform float strength;
varying vec2 vUv;
const vec2 STEP[4] = vec2[4](vec2(1.,0.), vec2(0.,1.), vec2(1.,1.), vec2(1.,-1.));
const float SLEN[4] = float[4](1., 1., 1.41421, 1.41421);
float dist(sampler2D t, vec2 uv){ return -perspectiveDepthToViewZ(textureLod(t, uv, 0.0).x, cNear, cFar); }
void main(){
  vec4 nc = textureLod(tNormal, vUv, 0.0);
  if (nc.a < 0.5) { gl_FragColor = vec4(0.0); return; }
  float zc = dist(tDepth, vUv);
  // something not in the world buffer (character card) is in front: no world ink over it
  float zm = dist(tMainDepth, vUv);
  if (zm < zc * 0.985 - 0.03) { gl_FragColor = vec4(0.0); return; }
  float t = clamp(log(zc / dNear) / log(dFar / dNear), 0.0, 1.0);
  float w = mix(wNear, wFar, t);
  float hc = 0.5 * w * creases;
  float Wc = 1.0 / zc;
  vec3 n0 = nc.xyz;
  float eD = 0.0, eN = 0.0;
  for (int a = 0; a < 4; a++) {
    for (int r = 1; r <= 16; r++) {
      float d = (float(r) - 0.5) * SLEN[a];
      float cw = clamp(w + 0.5 - d, 0.0, 1.0);
      float ch = clamp(hc + 0.5 - d, 0.0, 1.0);
      if (cw <= 0.0 && ch <= 0.0) break;
      vec2 o = STEP[a] * texel * float(r);
      float z1 = dist(tDepth, vUv - o), z2 = dist(tDepth, vUv + o);
      float s = (1.0 / z1 + 1.0 / z2 - 2.0 * Wc) / Wc;      // 2nd difference of 1/z: 0 on planes
      eD = max(eD, smoothstep(0.012, 0.035, -s) * cw);      // near side of depth jumps only
      if (ch > 0.0) {
        vec4 n1 = textureLod(tNormal, vUv - o, 0.0), n2 = textureLod(tNormal, vUv + o, 0.0);
        float k1 = (n1.a > 0.5 && abs(z1 - zc) < zc * 0.02) ? 1.0 - smoothstep(0.64, 0.82, dot(n0, n1.xyz)) : 0.0;
        float k2 = (n2.a > 0.5 && abs(z2 - zc) < zc * 0.02) ? 1.0 - smoothstep(0.64, 0.82, dot(n0, n2.xyz)) : 0.0;
        eN = max(eN, max(k1, k2) * ch);
      }
    }
  }
  float fade = 1.0 - smoothstep(dFar * 2.0, dFar * 6.0, zc);
  gl_FragColor = vec4(max(eD, eN) * strength * fade, 0.0, 0.0, 1.0);
}`;

const INK_COMP = /* glsl */ `
uniform sampler2D tColor; uniform sampler2D tMask; uniform vec2 texel; uniform vec3 inkColor;
varying vec2 vUv;
float m(float x, float y){ return texture2D(tMask, vUv + vec2(x, y) * texel).r; }
void main(){
  float a = (4.0*m(0.,0.) + 2.0*(m(1.,0.)+m(-1.,0.)+m(0.,1.)+m(0.,-1.)) + m(1.,1.)+m(-1.,1.)+m(1.,-1.)+m(-1.,-1.)) / 16.0;
  vec4 c = texture2D(tColor, vUv);
  // blend in display gamma like a drawn line (linear-light blending reads ~30% thinner)
  vec3 g = pow(max(c.rgb, 0.0), vec3(1.0/2.2));
  gl_FragColor = vec4(pow(mix(g, pow(inkColor, vec3(1.0/2.2)), a), vec3(2.2)), c.a);
}`;

const DOF = /* glsl */ `
#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel;
uniform float cNear; uniform float cFar; uniform float focus; uniform float aperture; uniform float maxBlur;
varying vec2 vUv;
float dist(vec2 uv){ return -perspectiveDepthToViewZ(textureLod(tDepth, uv, 0.0).x, cNear, cFar); }
float coc(float z){ return clamp(aperture * abs(z - focus) / max(z, 1e-3), 0.0, 1.0) * maxBlur; }
void main(){
  float zc = dist(vUv);
  float c0 = coc(zc);
  vec4 base = texture2D(tColor, vUv);
  if (c0 < 0.5) { gl_FragColor = base; return; }
  vec3 acc = base.rgb; float wsum = 1.0;
  const int N = 48;
  for (int i = 0; i < N; i++) {
    float r = sqrt((float(i) + 0.5) / float(N));
    float th = float(i) * 2.39996323;                     // golden angle (Vogel disc): fixed => no flicker
    vec2 o = vec2(cos(th), sin(th)) * r * c0;
    vec2 uv = vUv + o * texel;
    float zs = dist(uv);
    float cs = coc(zs);
    float dpx = length(o);
    // samples in front only contribute if their own blur reaches us (keeps sharp subjects crisp)
    float w = zs >= zc * 0.98 ? 1.0 : clamp(cs / (dpx + 0.5), 0.0, 1.0);
    acc += textureLod(tColor, uv, 0.0).rgb * w; wsum += w;
  }
  gl_FragColor = vec4(acc / wsum, base.a);
}`;

const BRIGHT = /* glsl */ `
uniform sampler2D tColor; uniform float threshold; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tColor, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float knee = threshold * 0.5;
  float soft = clamp(l - threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float k = max(soft, l - threshold) / max(l, 1e-4);
  gl_FragColor = vec4(c * k, 1.0);
}`;
const DOWN = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 texel; varying vec2 vUv;
void main(){
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv + vec2(-1.,-1.) * texel).rgb; s += texture2D(tSrc, vUv + vec2(1.,-1.) * texel).rgb;
  s += texture2D(tSrc, vUv + vec2(-1.,1.) * texel).rgb;  s += texture2D(tSrc, vUv + vec2(1.,1.) * texel).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0);
}`;
const UP = /* glsl */ `
uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 texel; uniform float radius; varying vec2 vUv;
void main(){
  vec2 o = texel * radius;
  vec3 s = texture2D(tSrc, vUv + vec2(-2.,0.)*o).rgb + texture2D(tSrc, vUv + vec2(2.,0.)*o).rgb
         + texture2D(tSrc, vUv + vec2(0.,-2.)*o).rgb + texture2D(tSrc, vUv + vec2(0.,2.)*o).rgb;
  s += 2.0 * (texture2D(tSrc, vUv + vec2(-1.,-1.)*o).rgb + texture2D(tSrc, vUv + vec2(1.,-1.)*o).rgb
            + texture2D(tSrc, vUv + vec2(-1.,1.)*o).rgb + texture2D(tSrc, vUv + vec2(1.,1.)*o).rgb);
  gl_FragColor = vec4(s / 12.0 + texture2D(tBase, vUv).rgb, 1.0);
}`;

const FINAL = /* glsl */ `
uniform sampler2D tColor; uniform sampler2D tBloom; uniform vec2 texel; uniform vec2 res; uniform float u;
uniform float exposure; uniform int tonemap; uniform float bloomStrength; uniform float halation;
uniform float chroma; uniform float softness;
uniform float blackPoint; uniform float whitePoint; uniform float contrast; uniform float pivot; uniform float gammaV;
uniform float saturation; uniform float vibrance; uniform vec3 shadowTint; uniform vec3 highlightTint;
uniform float vigAmount; uniform float vigSoft; uniform float grain; uniform float grainSize; uniform float frame;
varying vec2 vUv;
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
vec3 neutral(vec3 c){
  float sc = 0.76; float de = 0.15;
  float x = min(c.r, min(c.g, c.b));
  float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= off;
  float pk = max(c.r, max(c.g, c.b));
  if (pk < sc) return c;
  float d = 1.0 - sc; float np = 1.0 - d * d / (pk + d - sc);
  c *= np / pk;
  float g = 1.0 - 1.0 / (de * (pk - np) + 1.0);
  return mix(c, vec3(np), g);
}
vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
float scurve(float v){ v = clamp(v, 0.0, 1.0);
  return v < pivot ? pivot * pow(v / pivot, contrast) : 1.0 - (1.0 - pivot) * pow((1.0 - v) / (1.0 - pivot), contrast); }
void main(){
  vec2 cdir = (vUv - 0.5); float r2 = dot(cdir, cdir);
  vec2 ca = cdir * r2 * 4.0 * chroma * u * texel;           // corners shift most
  vec3 c;
  c.r = texture2D(tColor, vUv + ca).r; c.g = texture2D(tColor, vUv).g; c.b = texture2D(tColor, vUv - ca).b;
  if (softness > 0.0) {
    vec2 o = texel * u * 0.9;
    vec3 b = (texture2D(tColor, vUv + vec2(o.x, 0.)).rgb + texture2D(tColor, vUv - vec2(o.x, 0.)).rgb
            + texture2D(tColor, vUv + vec2(0., o.y)).rgb + texture2D(tColor, vUv - vec2(0., o.y)).rgb) * 0.25;
    c = mix(c, b, softness);
  }
  vec3 bl = texture2D(tBloom, vUv).rgb;
  c += bl * bloomStrength + bl * halation * vec3(1.0, 0.25, 0.1);
  c *= exposure;
  if (tonemap == 1) c = aces(c); else if (tonemap == 2) c = neutral(c);
  else if (tonemap == 3) { float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = c / (1.0 + l); c = mix(vec3(dot(c, vec3(0.2126,0.7152,0.0722))), c, 0.92) * 1.15; }
  vec3 v = toSRGB(c);
  v = vec3(scurve(v.r), scurve(v.g), scurve(v.b));
  v = pow(max(v, 0.0), vec3(1.0 / gammaV));
  float l = dot(v, vec3(0.2126, 0.7152, 0.0722));
  float s = max(v.r, max(v.g, v.b)) - min(v.r, min(v.g, v.b));
  v = mix(vec3(l), v, saturation * (1.0 + vibrance * (1.0 - s)));
  v += shadowTint * pow(1.0 - l, 2.0) + highlightTint * pow(l, 2.0);
  vec2 q = (vUv - 0.5) * vec2(res.x / res.y, 1.0);
  float vd = length(q) / length(vec2(res.x / res.y, 1.0) * 0.5);
  v *= 1.0 - vigAmount * smoothstep(1.0 - vigSoft, 1.0 + vigSoft * 0.2, vd);
  v = blackPoint + (whitePoint - blackPoint) * clamp(v, 0.0, 1.0);
  if (grain > 0.0) {
    vec2 gp = floor(gl_FragCoord.xy / max(1.0, grainSize * u));
    float n = h12(gp + frame * vec2(17.31, 41.77)) + h12(gp * 1.7 + frame * vec2(7.13, 3.91)) - 1.0; // ~triangular
    float mid = 1.0 - abs(l - 0.5) * 1.2;
    v += n * grain * 2.2 * clamp(mid, 0.25, 1.0);
  }
  v += (h12(gl_FragCoord.xy + frame) - 0.5) / 255.0;          // dither: no banding in gradients/skies
  gl_FragColor = vec4(clamp(v, 0.0, 1.0), 1.0);
}`;

const TM: Record<string, number> = { none: 0, aces: 1, neutral: 2, agxish: 3 };

export class PostPipeline {
  renderer: THREE.WebGLRenderer;
  w: number; h: number; u: number;
  private sceneRT: THREE.WebGLRenderTarget;
  private worldRT: THREE.WebGLRenderTarget;
  private maskRT: THREE.WebGLRenderTarget;
  private A: THREE.WebGLRenderTarget;
  private B: THREE.WebGLRenderTarget;
  private bloomDown: THREE.WebGLRenderTarget[] = [];
  private bloomUp: THREE.WebGLRenderTarget[] = [];
  private quad: THREE.Mesh;
  private fsScene = new THREE.Scene();
  private fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mats: Record<string, THREE.ShaderMaterial> = {};
  private normalMat: THREE.ShaderMaterial;

  constructor(renderer: THREE.WebGLRenderer, w: number, h: number) {
    this.renderer = renderer;
    this.w = w; this.h = h; this.u = Math.min(w, h) / 1080;
    const hf = THREE.HalfFloatType;
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, { type: hf, samples: 4, depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType) });
    this.worldRT = new THREE.WebGLRenderTarget(w, h, { type: hf, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType) });
    this.maskRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.A = new THREE.WebGLRenderTarget(w, h, { type: hf, depthBuffer: false });
    this.B = new THREE.WebGLRenderTarget(w, h, { type: hf, depthBuffer: false });
    // bloom mip chain sized from the SHORT side so glow size is resolution-independent
    let bw = Math.round(w / 2), bh = Math.round(h / 2);
    for (let i = 0; i < 6; i++) {
      this.bloomDown.push(new THREE.WebGLRenderTarget(bw, bh, { type: hf, depthBuffer: false }));
      this.bloomUp.push(new THREE.WebGLRenderTarget(bw, bh, { type: hf, depthBuffer: false }));
      bw = Math.max(1, Math.round(bw / 2)); bh = Math.max(1, Math.round(bh / 2));
    }
    const fs = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    const tex = new THREE.Vector2(1 / w, 1 / h);
    this.mats.inkMask = fs(INK_MASK, {
      tNormal: { value: this.worldRT.texture }, tDepth: { value: this.worldRT.depthTexture }, tMainDepth: { value: this.sceneRT.depthTexture },
      texel: { value: tex }, cNear: { value: 0.1 }, cFar: { value: 1000 }, wNear: { value: 3 }, wFar: { value: 1.5 },
      dNear: { value: 6 }, dFar: { value: 90 }, creases: { value: 0.8 }, strength: { value: 1 },
    });
    this.mats.inkComp = fs(INK_COMP, { tColor: { value: null }, tMask: { value: this.maskRT.texture }, texel: { value: tex }, inkColor: { value: new THREE.Color() } });
    this.mats.dof = fs(DOF, { tColor: { value: null }, tDepth: { value: this.sceneRT.depthTexture }, texel: { value: tex },
      cNear: { value: 0.1 }, cFar: { value: 1000 }, focus: { value: 10 }, aperture: { value: 1 }, maxBlur: { value: 10 } });
    this.mats.bright = fs(BRIGHT, { tColor: { value: null }, threshold: { value: 0.85 } });
    this.mats.down = fs(DOWN, { tSrc: { value: null }, texel: { value: new THREE.Vector2() } });
    this.mats.up = fs(UP, { tSrc: { value: null }, tBase: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1 } });
    this.mats.final = fs(FINAL, {
      tColor: { value: null }, tBloom: { value: null }, texel: { value: tex }, res: { value: new THREE.Vector2(w, h) }, u: { value: this.u },
      exposure: { value: 1 }, tonemap: { value: 2 }, bloomStrength: { value: 0 }, halation: { value: 0 }, chroma: { value: 0 }, softness: { value: 0 },
      blackPoint: { value: 0 }, whitePoint: { value: 1 }, contrast: { value: 1 }, pivot: { value: 0.45 }, gammaV: { value: 1 },
      saturation: { value: 1 }, vibrance: { value: 0 }, shadowTint: { value: new THREE.Vector3() }, highlightTint: { value: new THREE.Vector3() },
      vigAmount: { value: 0 }, vigSoft: { value: 0.6 }, grain: { value: 0 }, grainSize: { value: 1 }, frame: { value: 0 },
    });
    this.normalMat = new THREE.ShaderMaterial({ vertexShader: NORMAL_VERT, fragmentShader: NORMAL_FRAG, side: THREE.DoubleSide });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mats.final);
    this.quad.frustumCulled = false;
    this.fsScene.add(this.quad);
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.fsScene, this.fsCam);
  }

  render(scene: THREE.Scene, cam: THREE.PerspectiveCamera, look: Look, opts: { focus: number; frame: number }) {
    const r = this.renderer, u = this.u;
    r.toneMapping = THREE.NoToneMapping;
    cam.layers.enableAll();
    cam.layers.disable(SHADOW_ONLY);
    r.setRenderTarget(this.sceneRT);
    r.clear(true, true, true);
    r.render(scene, cam);
    let src: THREE.Texture = this.sceneRT.texture;

    if (look.ink.enabled && look.ink.strength > 0) {
      const mask = cam.layers.mask, ov = scene.overrideMaterial, bg = scene.background, sa = r.shadowMap.autoUpdate;
      cam.layers.disable(NOINK);
      scene.overrideMaterial = this.normalMat; scene.background = null; r.shadowMap.autoUpdate = false;
      const cc = new THREE.Color(); r.getClearColor(cc); const ca = r.getClearAlpha();
      r.setClearColor(0x000000, 0);
      r.setRenderTarget(this.worldRT); r.clear(true, true, false); r.render(scene, cam);
      r.setClearColor(cc, ca);
      cam.layers.mask = mask; scene.overrideMaterial = ov; scene.background = bg; r.shadowMap.autoUpdate = sa;
      const m = this.mats.inkMask.uniforms;
      m.cNear.value = cam.near; m.cFar.value = cam.far;
      m.wNear.value = look.ink.widthNear * u; m.wFar.value = look.ink.widthFar * u;
      m.dNear.value = look.ink.distNear; m.dFar.value = look.ink.distFar; m.creases.value = look.ink.creases; m.strength.value = look.ink.strength;
      this.pass(this.mats.inkMask, this.maskRT);
      const c = this.mats.inkComp.uniforms;
      c.tColor.value = src; (c.inkColor.value as THREE.Color).set(look.ink.color);
      this.pass(this.mats.inkComp, this.A);
      src = this.A.texture;
    }

    if (look.dof.enabled && look.dof.maxBlur > 0) {
      const d = this.mats.dof.uniforms;
      d.tColor.value = src; d.cNear.value = cam.near; d.cFar.value = cam.far;
      d.focus.value = opts.focus; d.aperture.value = look.dof.aperture; d.maxBlur.value = look.dof.maxBlur * u;
      const out = src === this.A.texture ? this.B : this.A;
      this.pass(this.mats.dof, out);
      src = out.texture;
    }

    let bloomTex: THREE.Texture = this.bloomUp[0].texture;
    const useBloom = look.bloom.enabled && (look.bloom.strength > 0 || look.halation > 0);
    if (useBloom) {
      this.mats.bright.uniforms.tColor.value = src;
      this.mats.bright.uniforms.threshold.value = look.bloom.threshold;
      this.pass(this.mats.bright, this.bloomDown[0]);
      const n = this.bloomDown.length;
      for (let i = 1; i < n; i++) {
        const p = this.bloomDown[i - 1];
        this.mats.down.uniforms.tSrc.value = p.texture;
        (this.mats.down.uniforms.texel.value as THREE.Vector2).set(1 / p.width, 1 / p.height);
        this.pass(this.mats.down, this.bloomDown[i]);
      }
      let prev = this.bloomDown[n - 1].texture;
      for (let i = n - 2; i >= 0; i--) {
        const t = this.bloomUp[i];
        const s = this.bloomDown[i + 1];
        this.mats.up.uniforms.tSrc.value = prev; this.mats.up.uniforms.tBase.value = this.bloomDown[i].texture;
        (this.mats.up.uniforms.texel.value as THREE.Vector2).set(1 / s.width, 1 / s.height);
        this.mats.up.uniforms.radius.value = look.bloom.radius;
        this.pass(this.mats.up, t);
        prev = t.texture;
      }
      bloomTex = prev;
    } else {
      r.setRenderTarget(this.bloomUp[0]); r.setClearColor(0x000000, 1); r.clear(true, false, false);
    }

    const f = this.mats.final.uniforms, g = look.grade;
    f.tColor.value = src; f.tBloom.value = bloomTex;
    f.exposure.value = look.exposure; f.tonemap.value = TM[look.tonemap] ?? 2;
    f.bloomStrength.value = useBloom ? look.bloom.strength / 6 : 0; f.halation.value = useBloom ? look.halation / 6 : 0;
    f.chroma.value = look.chroma; f.softness.value = look.softness;
    f.blackPoint.value = g.blackPoint; f.whitePoint.value = g.whitePoint; f.contrast.value = g.contrast; f.pivot.value = g.pivot; f.gammaV.value = g.gamma;
    f.saturation.value = g.saturation; f.vibrance.value = g.vibrance;
    (f.shadowTint.value as THREE.Vector3).set(...g.shadowTint); (f.highlightTint.value as THREE.Vector3).set(...g.highlightTint);
    f.vigAmount.value = look.vignette.amount; f.vigSoft.value = look.vignette.softness;
    f.grain.value = look.grain.amount; f.grainSize.value = look.grain.size; f.frame.value = opts.frame % 997;
    this.pass(this.mats.final, null);
  }

  dispose() {
    [this.sceneRT, this.worldRT, this.maskRT, this.A, this.B, ...this.bloomDown, ...this.bloomUp].forEach((t) => t.dispose());
    Object.values(this.mats).forEach((m) => m.dispose());
    this.normalMat.dispose();
  }
}
