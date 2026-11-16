// Procedural materials: standard PBR materials with world-space noise patched
// in, so surfaces get stains, streaks, wear and relief without any textures.
import * as THREE from 'three';
import { NOISE_GLSL } from './env';

const HELPERS = /* glsl */ `
${NOISE_GLSL}
// cheaper three-octave noise for relief and fine grain
float fbm3(vec2 p) { return vnoise(p) * 0.5 + vnoise(mat2(1.624, 1.218, -1.218, 1.624) * p + 17.1) * 0.25 + vnoise(mat2(-1.15, 3.94, -3.94, -1.15) * p + 3.7) * 0.25; }
// noise projected along the dominant axis blend (triplanar)
float tri(vec3 p, vec3 n, float s) {
  vec3 w = abs(n); w = w * w; w /= (w.x + w.y + w.z);
  return fbm(p.yz * s) * w.x + fbm(p.xz * s) * w.y + fbm(p.xy * s) * w.z;
}
float tri3(vec3 p, vec3 n, float s) {
  vec3 w = abs(n); w = w * w; w /= (w.x + w.y + w.z);
  return fbm3(p.yz * s) * w.x + fbm3(p.xz * s) * w.y + fbm3(p.xy * s) * w.z;
}
// the two in-surface axes for the face a fragment is on
vec2 faceUV(vec3 p, vec3 n) { return abs(n.y) > 0.6 ? p.xz : (abs(n.x) > abs(n.z) ? p.zy : p.xy); }
// vertical streaks on walls
float streaks(vec3 p, vec3 n, float s) {
  float side = 1.0 - abs(n.y);
  vec2 q = abs(n.x) > abs(n.z) ? p.zy : p.xy;
  return fbm(vec2(q.x * s, q.y * s * 0.12)) * side;
}
// Earth underfoot: clods, pebbles, grit, damp patches and drying cracks. q is the ground plane in metres,
// vd the distance from the eye (fine detail fades with it). Writes relief into bump.
vec3 dirt(vec2 q, float vd, vec3 dry, vec3 damp, out float bump) {
  float near = smoothstep(26.0, 4.0, vd), mid = smoothstep(90.0, 20.0, vd);
  // every layer gets its own turn and a gentle warp, so none of them follows the world's axes or each other
  vec2 q0 = q;
  vec2 warp = vec2(fbm3(q0 * 0.31 + 3.0), fbm3(q0 * 0.31 + 41.0)) - 0.5;
  q = mat2(0.94, 0.342, -0.342, 0.94) * q0 + warp * 1.4;
  vec2 qc = mat2(0.5, 0.866, -0.866, 0.5) * q0 + warp * 0.7, qg = mat2(-0.616, 0.788, -0.788, -0.616) * q0 + warp.yx * 0.5;
  float big = fbm(q * 0.11), patchy = fbm(q * 0.45 + 31.0);
  float clod = fbm3(qc * 2.3), grit = fbm3(qg * 17.0);
  // grain finer than a pixel is averaged away rather than left to shimmer into a pattern
  float px = length(fwidth(q0));
  grit = mix(0.5, grit, smoothstep(0.035, 0.008, px));
  clod = mix(0.5, clod, smoothstep(0.3, 0.07, px));
  vec3 c = mix(dry, damp, smoothstep(0.35, 0.7, big));
  c *= 0.6 + 0.78 * patchy;
  c = mix(c, c * vec3(0.5, 0.46, 0.42), smoothstep(0.52, 0.72, fbm3(q * 0.23 + 60.0)) * 0.6);   // dark, humus-stained ground
  c = mix(c, c * vec3(1.16, 1.07, 0.9), smoothstep(0.55, 0.8, fbm3(q * 0.9 + 9.0)) * 0.5);   // paler, sandier drifts
  c *= mix(1.0, 0.55 + 0.9 * clod, mid);
  c *= mix(1.0, 0.82 + 0.36 * grit, near);
  // stones: few, small, irregular, mostly darker than the earth they lie in, gathered in drifts
  vec2 pc = qg * 9.0 + vec2(fbm3(qc * 3.0), fbm3(qc * 3.0 + 9.0)) * 1.6, id = floor(pc), fr = fract(pc) - 0.5;
  float rnd = hash21(id), rr = 0.12 + 0.3 * fract(rnd * 7.3);
  vec2 off = (vec2(fract(rnd * 13.7), fract(rnd * 29.1)) - 0.5) * 0.5;
  float shape = length((fr - off) * vec2(1.0, 0.65 + 0.7 * fract(rnd * 5.1))) + (grit - 0.5) * 0.12;
  float peb = step(0.9 - 0.12 * smoothstep(0.5, 0.75, patchy), rnd) * smoothstep(rr, rr * 0.6, shape) * near * smoothstep(0.05, 0.015, px);
  c = mix(c, mix(vec3(0.075, 0.07, 0.066), vec3(0.3, 0.28, 0.25), fract(rnd * 3.1)) * (0.8 + 0.4 * grit), peb * 0.85);
  // cracks where the ground has dried hard
  float crack = (1.0 - smoothstep(0.0, 0.06, abs(fbm3(q * 1.25 + 5.0) - 0.5))) * smoothstep(0.45, 0.25, big) * near;
  c *= 1.0 - crack * 0.55;
  bump = (clod * 0.06 + grit * 0.008 * near + peb * 0.014 - crack * 0.02) * mid;
  return c;
}
// 1 on a thin line every 'period', 0 elsewhere
float seam(float x, float period, float width) {
  float f = abs(fract(x / period) - 0.5) * period;
  return 1.0 - smoothstep(0.0, width, f);
}
`;

/** turns the height a material wrote into wwBump into surface relief, fading with distance */
export const BUMP_GLSL = /* glsl */ `
        {
          float wwFade = clamp(1.0 - length(vViewPosition) / 70.0, 0.0, 1.0);
          if (wwFade > 0.0) {
            vec3 dpdx = dFdx(vViewPosition), dpdy = dFdy(vViewPosition);
            float dhx = dFdx(wwBump), dhy = dFdy(wwBump);
            vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
            float det = dot(dpdx, r1);
            vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
            vec3 wwN = abs(det) * normal - grad * wwFade;
            if (dot(wwN, wwN) > 1e-20) normal = normalize(wwN);
          }
        }`;

/**
 * Patch a standard material. `colour` is GLSL that may modify `col` (vec3,
 * linear albedo), `rough` (float) and `bump` (float, surface height in
 * metres) using `wp` (world position) and `wn` (world normal).
 */
export function patch<T extends THREE.MeshStandardMaterial>(mat: T, colour: string, key: string, local = false): T {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        ${local
          // things that move carry their pattern with them
          ? 'vWPos = transformed; vWNrm = normalize(objectNormal);'
          : 'vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);'}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n${HELPERS}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float wwBump = 0.0;
        {
          vec3 wp = vWPos; vec3 wn = normalize(vWNrm);
          vec3 col = diffuseColor.rgb; float rough = roughnessFactor; float bump = 0.0;
          float vd = length(vViewPosition);            // distance from the eye, for fading fine detail
          ${colour}
          diffuseColor.rgb = col; roughnessFactor = clamp(rough, 0.04, 1.0); wwBump = bump;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${BUMP_GLSL}`);
  };
  mat.customProgramCacheKey = () => key + (local ? '-local' : '');
  return mat;
}

const std = (color: string, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

const WOOD = (grainScale: number) => /* glsl */ `
    vec2 q = faceUV(wp, wn);
    float g = fbm(vec2(q.x * 16.0, q.y * 1.2) * ${grainScale.toFixed(1)});
    float fine = fbm3(vec2(q.x * 90.0, q.y * 5.0));
    float plank = seam(q.x + 0.03 * vnoise(vec2(q.y * 0.7, 3.0)), 0.16, 0.006);
    float board = hash21(vec2(floor(q.x / 0.16), 7.0));
    col *= (0.55 + 0.75 * g) * (0.82 + 0.3 * board) * (0.9 + 0.2 * fine);
    col = mix(col, vec3(0.5, 0.48, 0.44), smoothstep(0.55, 0.8, fbm(q * 0.8)) * 0.3);
    col *= 1.0 - plank * 0.75;
    rough = mix(rough, 1.0, plank);
    bump = g * 0.004 + fine * 0.0015 - plank * 0.012;`;

const WOOD_L = (grainScale: number) => WOOD(grainScale).replace('vec2 q = faceUV(wp, wn);', 'vec2 q = faceUV(wp, wn).yx;');

export const MAT = {
  concrete: patch(std('#8d897f', 0.92), /* glsl */ `
    vec2 q = faceUV(wp, wn);
    float n = tri(wp, wn, 0.7); float s = streaks(wp, wn, 2.2); float pores = tri3(wp, wn, 14.0);
    float joint = max(seam(q.x, 2.4, 0.012), seam(q.y, 1.2, 0.012) * (1.0 - step(0.6, abs(wn.y))));
    float form = fbm3(vec2(q.x * 0.6, q.y * 22.0));
    col *= (0.72 + 0.5 * n) * (0.88 + 0.24 * pores);
    col = mix(col, col * vec3(0.45, 0.43, 0.4), smoothstep(0.45, 0.75, s) * 0.7);
    col = mix(col, vec3(0.05, 0.05, 0.045), smoothstep(1.2, -0.3, wp.y) * 0.6);
    col *= 1.0 - joint * 0.55;
    float chip = smoothstep(0.62, 0.7, tri3(wp, wn, 1.7));
    col = mix(col, col * 1.25, chip * 0.4);
    rough = mix(rough, 0.6, smoothstep(1.0, -0.2, wp.y) * 0.5);
    bump = pores * 0.004 + form * 0.002 - joint * 0.01 - chip * 0.006;`, 'concrete'),
  rust: patch(std('#6a3a26', 0.85, 0.25), /* glsl */ `
    float n = tri(wp, wn, 1.6); float m = tri(wp, wn, 0.35); float flake = tri3(wp, wn, 9.0);
    vec3 dark = vec3(0.06, 0.045, 0.04); vec3 orange = vec3(0.42, 0.17, 0.07);
    col = mix(col, orange, smoothstep(0.45, 0.7, n) * 0.7); col = mix(col, dark, smoothstep(0.5, 0.75, m) * 0.75);
    col *= (0.8 + 0.4 * streaks(wp, wn, 3.0)) * (0.85 + 0.3 * flake);
    rough = mix(rough, 0.55, smoothstep(0.5, 0.75, m));
    bump = flake * 0.005 + smoothstep(0.45, 0.7, n) * 0.004;`, 'rust'),
  steel: patch(std('#43474b', 0.5, 0.55), /* glsl */ `
    vec2 q = faceUV(wp, wn);
    float n = tri(wp, wn, 1.2); float fine = tri3(wp, wn, 20.0);
    float rustK = smoothstep(0.58, 0.8, tri(wp, wn, 2.7));
    // raised tread pattern on anything you can stand on
    float tread = 0.0;
    if (wn.y > 0.7) { vec2 d = fract(q * 6.0 + vec2(0.0, floor(q.x * 6.0) * 0.5)) - 0.5; tread = smoothstep(0.34, 0.26, length(d * vec2(1.0, 2.6))); }
    col *= (0.7 + 0.6 * n) * (0.92 + 0.16 * fine) * (1.0 + tread * 0.12);
    col = mix(col, vec3(0.3, 0.13, 0.07), rustK * 0.65);
    rough += (n - 0.5) * 0.3 + rustK * 0.3;
    bump = tread * 0.006 + fine * 0.001 + rustK * 0.003;`, 'steel'),
  whiteSteel: patch(std('#c8c6bd', 0.5, 0.2), /* glsl */ `
    vec2 q = faceUV(wp, wn);
    float s = streaks(wp, wn, 1.4); float fine = tri3(wp, wn, 16.0);
    float seams = max(seam(q.y, 3.0, 0.01), seam(q.x, 2.2, 0.008) * 0.6);
    col *= (0.82 + 0.25 * tri(wp, wn, 0.4)) * (0.95 + 0.1 * fine);
    col = mix(col, vec3(0.33, 0.2, 0.13), smoothstep(0.5, 0.8, s) * 0.5);
    col *= 1.0 - seams * 0.35;
    bump = fine * 0.001 - seams * 0.006;`, 'whiteSteel'),
  wood: patch(std('#6b5a48', 0.86), WOOD(1.0), 'wood'),
  paleWood: patch(std('#978c77', 0.9), WOOD(0.8), 'paleWood'),
  bone: patch(std('#b9b2a0', 0.8), /* glsl */ `
    float fine = tri3(wp, wn, 12.0);
    col *= (0.8 + 0.3 * tri(wp, wn, 1.1)) * (0.92 + 0.16 * fine); col = mix(col, col * 0.5, smoothstep(0.5, 0.8, streaks(wp, wn, 2.0)) * 0.6);
    bump = fine * 0.002;`, 'bone'),
  dark: patch(std('#191817', 0.6, 0.35), /* glsl */ `
    float fine = tri3(wp, wn, 18.0); col *= 0.8 + 0.5 * fine; rough += (fine - 0.5) * 0.3; bump = fine * 0.0015;`, 'dark'),
  black: std('#08080a', 0.35, 0.4),
  rope: patch(std('#8a7b5e', 1), /* glsl */ `
    vec2 q = faceUV(wp, wn); float tw = sin((q.x + q.y) * 140.0) * 0.5 + 0.5; col *= 0.7 + 0.45 * tw; bump = tw * 0.003;`, 'rope'),
  brass: patch(std('#8a6a2c', 0.4, 0.85), /* glsl */ `
    float n = tri3(wp, wn, 6.0); col = mix(col, vec3(0.1, 0.16, 0.12), smoothstep(0.55, 0.8, n) * 0.5); rough += smoothstep(0.5, 0.8, n) * 0.4;`, 'brass'),
  red: patch(std('#7a2a1c', 0.7, 0.1), /* glsl */ `
    float chip = smoothstep(0.55, 0.8, tri(wp, wn, 3.1)); float fine = tri3(wp, wn, 15.0);
    col *= (0.75 + 0.4 * tri(wp, wn, 1.3)) * (0.93 + 0.14 * fine); col = mix(col, vec3(0.1, 0.07, 0.06), chip * 0.6);
    rough += chip * 0.25; bump = fine * 0.001 - chip * 0.003;`, 'red'),
  // sheet roofing: ribs, rust creeping in from the edges and the fixings
  corrugated: patch(std('#5b3a2c', 0.75, 0.35), /* glsl */ `
    vec2 q = faceUV(wp, wn);
    // ribs finer than a pixel are averaged away instead of beating against the screen into rings
    float rib = mix(0.5, sin(q.x * 44.0) * 0.5 + 0.5, smoothstep(0.07, 0.02, fwidth(q.x)));
    float n = tri(wp, wn, 0.9); float m = tri(wp, wn, 0.3);
    float sheet = seam(q.y, 1.9, 0.02);
    col = mix(col, vec3(0.36, 0.15, 0.07), smoothstep(0.4, 0.7, n) * 0.7);
    col = mix(col, vec3(0.05, 0.04, 0.035), smoothstep(0.55, 0.8, m) * 0.7);
    col *= (0.7 + 0.4 * rib) * (1.0 - sheet * 0.5);
    rough = mix(0.55, 0.95, smoothstep(0.4, 0.7, n));
    bump = rib * 0.018 - sheet * 0.01 + tri3(wp, wn, 9.0) * 0.003;`, 'corrugated'),
  // versions whose pattern is fixed to the object, for anything that moves (the boat)
  woodL: patch(std('#6b5a48', 0.86), WOOD(1.0), 'wood', true),
  paleWoodL: patch(std('#978c77', 0.9), WOOD(0.8), 'paleWood', true),
  glass: new THREE.MeshPhysicalMaterial({ color: '#9fb6bd', roughness: 0.08, metalness: 0, transmission: 0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
};
