// Procedural materials: standard PBR materials with world-space noise patched
// in, so surfaces get stains, streaks and wear without any textures.
import * as THREE from 'three';
import { NOISE_GLSL } from './env';

const HELPERS = /* glsl */ `
${NOISE_GLSL}
// noise projected along the dominant axis blend (triplanar)
float tri(vec3 p, vec3 n, float s) {
  vec3 w = abs(n); w = w * w; w /= (w.x + w.y + w.z);
  return fbm(p.yz * s) * w.x + fbm(p.xz * s) * w.y + fbm(p.xy * s) * w.z;
}
// vertical streaks on walls
float streaks(vec3 p, vec3 n, float s) {
  float side = 1.0 - abs(n.y);
  vec2 q = abs(n.x) > abs(n.z) ? p.zy : p.xy;
  return fbm(vec2(q.x * s, q.y * s * 0.12)) * side;
}
`;

/**
 * Patch a standard material. `colour` is GLSL that may modify `col` (vec3,
 * linear albedo) and `rough` (float) using `wp` (world position) and `wn`
 * (world normal).
 */
export function patch<T extends THREE.MeshStandardMaterial>(mat: T, colour: string, key: string): T {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n${HELPERS}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        {
          vec3 wp = vWPos; vec3 wn = normalize(vWNrm);
          vec3 col = diffuseColor.rgb; float rough = roughnessFactor;
          ${colour}
          diffuseColor.rgb = col; roughnessFactor = clamp(rough, 0.04, 1.0);
        }`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

const std = (color: string, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export const MAT = {
  concrete: patch(std('#8d897f', 0.92), /* glsl */ `
    float n = tri(wp, wn, 0.7); float s = streaks(wp, wn, 2.2);
    col *= 0.72 + 0.5 * n; col = mix(col, col * vec3(0.45, 0.43, 0.4), smoothstep(0.45, 0.75, s) * 0.7);
    col = mix(col, vec3(0.05, 0.05, 0.045), smoothstep(1.2, -0.3, wp.y) * 0.6);`, 'concrete'),
  rust: patch(std('#6a3a26', 0.85, 0.25), /* glsl */ `
    float n = tri(wp, wn, 1.6); float m = tri(wp, wn, 0.35);
    vec3 dark = vec3(0.06, 0.045, 0.04); vec3 orange = vec3(0.42, 0.17, 0.07);
    col = mix(col, orange, smoothstep(0.45, 0.7, n) * 0.7); col = mix(col, dark, smoothstep(0.5, 0.75, m) * 0.75);
    col *= 0.8 + 0.4 * streaks(wp, wn, 3.0); rough = mix(rough, 0.55, smoothstep(0.5, 0.75, m));`, 'rust'),
  steel: patch(std('#3c4044', 0.55, 0.75), /* glsl */ `
    float n = tri(wp, wn, 1.2); col *= 0.7 + 0.6 * n;
    col = mix(col, vec3(0.3, 0.13, 0.07), smoothstep(0.58, 0.8, tri(wp, wn, 2.7)) * 0.6); rough += (n - 0.5) * 0.3;`, 'steel'),
  whiteSteel: patch(std('#c8c6bd', 0.5, 0.2), /* glsl */ `
    float s = streaks(wp, wn, 1.4); col *= 0.82 + 0.25 * tri(wp, wn, 0.4);
    col = mix(col, vec3(0.33, 0.2, 0.13), smoothstep(0.5, 0.8, s) * 0.5);`, 'whiteSteel'),
  wood: patch(std('#6b5a48', 0.86), /* glsl */ `
    vec2 q = abs(wn.y) > 0.6 ? wp.xz : (abs(wn.x) > abs(wn.z) ? wp.zy : wp.xy);
    float g = fbm(vec2(q.x * 14.0, q.y * 1.3)) ; col *= 0.6 + 0.75 * g;
    col = mix(col, vec3(0.5, 0.48, 0.44), smoothstep(0.55, 0.8, fbm(q * 0.8)) * 0.35);`, 'wood'),
  paleWood: patch(std('#978c77', 0.9), /* glsl */ `
    vec2 q = abs(wn.y) > 0.6 ? wp.xz : (abs(wn.x) > abs(wn.z) ? wp.zy : wp.xy);
    col *= 0.65 + 0.6 * fbm(vec2(q.x * 12.0, q.y * 1.5));`, 'paleWood'),
  bone: patch(std('#b9b2a0', 0.8), /* glsl */ `
    col *= 0.8 + 0.3 * tri(wp, wn, 1.1); col = mix(col, col * 0.5, smoothstep(0.5, 0.8, streaks(wp, wn, 2.0)) * 0.6);`, 'bone'),
  dark: std('#161514', 0.7, 0.3),
  black: std('#08080a', 0.35, 0.4),
  rope: std('#8a7b5e', 1),
  brass: std('#8a6a2c', 0.4, 0.9),
  red: patch(std('#7a2a1c', 0.7, 0.1), /* glsl */ `col *= 0.75 + 0.4 * tri(wp, wn, 1.3); col = mix(col, vec3(0.1, 0.07, 0.06), smoothstep(0.55, 0.8, tri(wp, wn, 3.1)) * 0.6);`, 'red'),
  glass: new THREE.MeshPhysicalMaterial({ color: '#9fb6bd', roughness: 0.08, metalness: 0, transmission: 0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
};
