// The sea surface. A sum of Gerstner waves whose heights are scaled by the
// current sea state, plus local disturbances and, rarely, one very large
// travelling wave. The same numbers drive the GPU surface (via generated
// GLSL) and the CPU height queries used for buoyancy, so the boat sits
// exactly on the water that is drawn.

export interface Wave {
  dx: number; dz: number; // unit travel direction
  L: number;              // wavelength (m)
  k: number;              // wavenumber
  a: number;              // amplitude (m) in a moderate sea
  qa: number;             // horizontal displacement amplitude (Q * a)
  w: number;              // angular speed
  phi: number;            // phase
}

const G = 9.81;

function mk(dirDeg: number, L: number, a: number, steep: number, phi: number, n: number): Wave {
  const d = (dirDeg * Math.PI) / 180;
  const k = (2 * Math.PI) / L;
  return { dx: Math.sin(d), dz: Math.cos(d), L, k, a, qa: steep / (k * n), w: Math.sqrt(G * k), phi };
}

const N = 7;
const STEEP = 0.62;
// Travel direction is degrees clockwise from +Z. Swell runs roughly with the prevailing wind.
export const WAVES: Wave[] = [
  mk(18, 74, 0.62, STEEP, 0.0, N),
  mk(41, 47, 0.38, STEEP, 1.3, N),
  mk(-9, 31, 0.26, STEEP, 4.1, N),
  mk(58, 19, 0.15, STEEP, 2.2, N),
  mk(-31, 12.5, 0.10, STEEP, 5.6, N),
  mk(24, 8.1, 0.062, STEEP, 0.7, N),
  mk(-52, 5.3, 0.04, STEEP, 3.3, N),
];
// Small ripples used for shading normals only.
export const RIPPLES: Wave[] = [
  mk(33, 3.1, 0.013, 0.5, 0.4, 6),
  mk(-20, 2.2, 0.01, 0.5, 2.9, 6),
  mk(71, 1.45, 0.007, 0.5, 5.0, 6),
  mk(-64, 0.97, 0.0045, 0.5, 1.7, 6),
  mk(7, 0.66, 0.003, 0.5, 3.8, 6),
  mk(-41, 0.43, 0.002, 0.5, 0.9, 6),
];

// ---- sea state: written by the weather, read here and by the ocean shader
/** how tall each wave is relative to the table above, and how sharply it peaks */
export const ampScale = new Float32Array(N).fill(1);
export const steepScale = new Float32Array(N).fill(1);
export const sea = { chop: 1, white: 0 };

/** set the wave heights for a sea level from 0 (glass) to 1 (the worst storm) */
export function setSeaLevel(level: number) {
  for (let i = 0; i < N; i++) {
    const s = i < 2 ? 0.2 + 3.4 * Math.pow(level, 1.5) : i < 4 ? 0.14 + 2.7 * Math.pow(level, 1.2) : 0.1 + 2.1 * level;
    ampScale[i] = s;
    steepScale[i] = Math.min(s, 1.42);     // never so steep that the surface folds through itself
  }
  sea.chop = 0.22 + 1.6 * level;
  sea.white = Math.max(0, Math.min(1, (level - 0.32) / 0.45));
}

/** one enormous travelling ridge: height amp / cosh^2((dir . p - off) / width) */
export const rogue = { dx: 0, dz: 1, off: -1e7, amp: 0, width: 30 };
export function rogueHeight(x: number, z: number) {
  if (rogue.amp === 0) return 0;
  const u = (rogue.dx * x + rogue.dz * z - rogue.off) / rogue.width;
  if (u > 6 || u < -6) return 0;
  const c = Math.cosh(u);
  return rogue.amp / (c * c);
}

/** Displacement of the surface point whose rest position is (x, z). */
function displace(x: number, z: number, t: number, out: { x: number; y: number; z: number }) {
  let ox = 0, oy = 0, oz = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const wv = WAVES[i];
    const th = (wv.dx * x + wv.dz * z) * wv.k - wv.w * t + wv.phi;
    const c = Math.cos(th), q = wv.qa * steepScale[i];
    ox += wv.dx * q * c;
    oz += wv.dz * q * c;
    oy += wv.a * ampScale[i] * Math.sin(th);
  }
  out.x = ox; out.y = oy; out.z = oz;
}

const _d = { x: 0, y: 0, z: 0 };

/** the open-sea swell at a point, ignoring any shelter: what a moored hull feels coming in under it */
export function swell(x: number, z: number, t: number): number { displace(x, z, t, _d); return _d.y; }

/** Height of the visible water surface at world position (x, z). */
export function waveHeight(x: number, z: number, t: number): number {
  // Gerstner waves move points sideways, so invert with a few fixed-point steps.
  let px = x, pz = z;
  for (let i = 0; i < 3; i++) {
    displace(px, pz, t, _d);
    px = x - _d.x;
    pz = z - _d.z;
  }
  displace(px, pz, t, _d);
  const calm = calmAt(x, z);
  return (_d.y + rogueHeight(x, z)) * calm + bumpHeight(x, z);
}

// Sheltered water: swell is damped inside these circles (islands, reefs, rigs).
export interface CalmZone { x: number; z: number; r0: number; r1: number }
export const MAX_CALM = 12;
export const calmZones: CalmZone[] = [];
const CALM_MIN = 0.1;
export function calmAt(x: number, z: number) {
  let c = 1;
  for (const k of calmZones) {
    const d = Math.hypot(x - k.x, z - k.z);
    const t = Math.max(0, Math.min(1, (d - k.r0) / (k.r1 - k.r0)));
    c *= CALM_MIN + (1 - CALM_MIN) * t * t * (3 - 2 * t);
  }
  return c;
}
// Local disturbances (the giant's hands, splashes, the dome of water when it
// rises). Each is a ring or mound: height a * exp(-((d - r) / w)^2).
export interface Bump { x: number; z: number; r: number; w: number; a: number }
export const MAX_BUMPS = 6;
export const bumps: Bump[] = Array.from({ length: MAX_BUMPS }, () => ({ x: 0, z: 0, r: 0, w: 1, a: 0 }));
export function bumpHeight(x: number, z: number) {
  let h = 0;
  for (const b of bumps) {
    if (b.a === 0) continue;
    const d = Math.hypot(x - b.x, z - b.z);
    const k = (d - b.r) / b.w;
    if (k > 3 || k < -3) continue;
    h += b.a * Math.exp(-k * k);
  }
  return h;
}

const f = (n: number) => {
  const s = n.toFixed(6);
  return s.includes('.') ? s : s + '.0';
};

/**
 * GLSL with the wave table baked in. The vertex stage calls seaField() once to get the
 * sheltering factor and the local disturbances, and passes them on, so the fragment stage
 * never loops over them.
 */
export function waveGLSL(): string {
  let disp = '', nrm = '', rip = '';
  WAVES.forEach((w, i) => {
    // amplitude is faded when the mesh is too coarse to carry the wave
    disp += `
  th = dot(vec2(${f(w.dx)}, ${f(w.dz)}), p) * ${f(w.k)} - ${f(w.w)} * t + ${f(w.phi)};
  at = clamp((${f(w.L)} / cell - 2.5) / 3.0, 0.0, 1.0);
  d.xz += vec2(${f(w.dx)}, ${f(w.dz)}) * (${f(w.qa)} * uSteep[${i}] * at * cos(th));
  d.y += ${f(w.a)} * uAmp[${i}] * at * sin(th);`;
    nrm += `
  th = dot(vec2(${f(w.dx)}, ${f(w.dz)}), p) * ${f(w.k)} - ${f(w.w)} * t + ${f(w.phi)};
  at = clamp((${f(w.L)} / px - 2.0) / 4.0, 0.0, 1.0);
  c = cos(th); s = sin(th);
  n.xz -= vec2(${f(w.dx)}, ${f(w.dz)}) * (${f(w.k * w.a)} * uAmp[${i}] * c * at);
  fold += ${f(w.k * w.qa)} * uSteep[${i}] * s * at;
  h += ${f(w.a)} * uAmp[${i}] * s;`;
  });
  for (const w of RIPPLES) {
    rip += `
  th = dot(vec2(${f(w.dx)}, ${f(w.dz)}), p) * ${f(w.k)} - ${f(w.w)} * t + ${f(w.phi)};
  n.xz -= vec2(${f(w.dx)}, ${f(w.dz)}) * (${f(w.k * w.a)} * cos(th)) * clamp((${f(w.L)} / px - 2.0) / 4.0, 0.0, 1.0);`;
  }
  return /* glsl */ `
uniform float uAmp[${N}];
uniform float uSteep[${N}];
uniform vec4 uRogue;                // direction x, z, offset along it, height
uniform vec4 uCalm[${MAX_CALM}];
uniform vec4 uBump[${MAX_BUMPS}];   // x, z, ring radius, width
uniform float uBumpA[${MAX_BUMPS}]; // amplitude
float calmAt(vec2 p) {
  float c = 1.0;
  for (int i = 0; i < ${MAX_CALM}; i++) {
    float t = smoothstep(uCalm[i].z, uCalm[i].w, distance(p, uCalm[i].xy));
    c *= ${f(CALM_MIN)} + ${f(1 - CALM_MIN)} * t;
  }
  return c;
}
// everything that is not the regular swell: x = added height, yz = its horizontal gradient
vec3 seaField(vec2 p, float calm) {
  vec3 o = vec3(0.0);
  for (int i = 0; i < ${MAX_BUMPS}; i++) {
    vec2 dv = p - uBump[i].xy;
    float d = length(dv);
    float k = (d - uBump[i].z) / uBump[i].w;
    float e = uBumpA[i] * exp(-k * k);
    o.x += e;
    o.yz += (dv / max(d, 0.001)) * (e * -2.0 * k / uBump[i].w);
  }
  float u = (dot(uRogue.xy, p) - uRogue.z) / ${f(rogue.width)};
  if (abs(u) < 6.0 && uRogue.w > 0.0) {
    float ch = cosh(u), e = uRogue.w * calm / (ch * ch);
    o.x += e;
    o.yz += uRogue.xy * (e * -2.0 * tanh(u) / ${f(rogue.width)});
  }
  return o;
}
vec3 waveDisp(vec2 p, float t, float cell, float calm) {
  vec3 d = vec3(0.0); float th; float at;${disp}
  return d * calm;
}
// returns the slope (in xz; the caller completes the normal), the crest pinch and the height.
// px is the size of a pixel on the water in metres; waves finer than that fade out.
vec3 waveNormal(vec2 p, float t, float px, float calm, out float fold, out float h) {
  vec3 n = vec3(0.0, 1.0, 0.0); float th; float c; float s; float at; fold = 0.0; h = 0.0;${nrm}
  n.xz *= calm; fold *= calm; h *= calm;
  return n;
}
vec2 rippleSlope(vec2 p, float t, float px) {
  vec3 n = vec3(0.0); float th;${rip}
  return n.xz;
}
`;
}
