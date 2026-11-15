// Ocean swell as a sum of Gerstner waves. The same table drives the GPU
// displacement (via generated GLSL) and the CPU height queries used for
// buoyancy, so the boat sits exactly on the visible surface.

export interface Wave {
  dx: number; dz: number; // unit travel direction
  L: number;              // wavelength (m)
  k: number;              // wavenumber
  a: number;              // amplitude (m)
  qa: number;             // horizontal displacement amplitude (Q * a)
  w: number;              // angular speed
  phi: number;            // phase
}

const G = 9.81;

function mk(dirDeg: number, L: number, a: number, steep: number, phi: number, n: number): Wave {
  const d = (dirDeg * Math.PI) / 180;
  const k = (2 * Math.PI) / L;
  return {
    dx: Math.sin(d), dz: Math.cos(d), L, k, a,
    qa: steep / (k * n), // Q*a where Q = steep / (k a n)
    w: Math.sqrt(G * k), phi,
  };
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
  mk(33, 3.1, 0.022, 0.5, 0.4, 6),
  mk(-20, 2.2, 0.016, 0.5, 2.9, 6),
  mk(71, 1.45, 0.011, 0.5, 5.0, 6),
  mk(-64, 0.97, 0.007, 0.5, 1.7, 6),
  mk(7, 0.66, 0.005, 0.5, 3.8, 6),
  mk(-41, 0.43, 0.003, 0.5, 0.9, 6),
];

/** Displacement of the surface point whose rest position is (x, z). */
function displace(x: number, z: number, t: number, out: { x: number; y: number; z: number }) {
  let ox = 0, oy = 0, oz = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const wv = WAVES[i];
    const th = (wv.dx * x + wv.dz * z) * wv.k - wv.w * t + wv.phi;
    const c = Math.cos(th);
    ox += wv.dx * wv.qa * c;
    oz += wv.dz * wv.qa * c;
    oy += wv.a * Math.sin(th);
  }
  out.x = ox; out.y = oy; out.z = oz;
}

const _d = { x: 0, y: 0, z: 0 };

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
  return _d.y * calmAt(x, z) + extraHeight(x, z, t);
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

// Hook for local disturbances (wakes, the giant). Returns added height.
type Disturbance = (x: number, z: number, t: number) => number;
const disturbances: Disturbance[] = [];
export function addDisturbance(fn: Disturbance) { disturbances.push(fn); }
function extraHeight(x: number, z: number, t: number) {
  let h = 0;
  for (const fn of disturbances) h += fn(x, z, t);
  return h;
}

const f = (n: number) => {
  const s = n.toFixed(6);
  return s.includes('.') ? s : s + '.0';
};

/** GLSL with the wave tables baked in as constants. */
export function waveGLSL(): string {
  let disp = '';
  let nrm = '';
  for (const w of WAVES) {
    // amplitude is faded when the mesh is too coarse to carry the wave
    disp += `
  th = dot(vec2(${f(w.dx)}, ${f(w.dz)}), p) * ${f(w.k)} - ${f(w.w)} * t + ${f(w.phi)};
  at = clamp((${f(w.L)} / cell - 2.5) / 3.0, 0.0, 1.0);
  d.xz += vec2(${f(w.dx)}, ${f(w.dz)}) * (${f(w.qa)} * at * cos(th));
  d.y += ${f(w.a)} * at * sin(th);`;
    nrm += `
  th = dot(vec2(${f(w.dx)}, ${f(w.dz)}), p) * ${f(w.k)} - ${f(w.w)} * t + ${f(w.phi)};
  at = clamp((${f(w.L)} / px - 2.0) / 4.0, 0.0, 1.0);
  c = cos(th); s = sin(th);
  n.xz -= vec2(${f(w.dx)}, ${f(w.dz)}) * (${f(w.k * w.a)} * c * at);
  fold += ${f(w.k * w.qa)} * s * at;
  h += ${f(w.a)} * s;`;
  }
  let rip = '';
  for (const w of RIPPLES) {
    rip += `
  th = dot(vec2(${f(w.dx)}, ${f(w.dz)}), p) * ${f(w.k)} - ${f(w.w)} * t + ${f(w.phi)};
  n.xz -= vec2(${f(w.dx)}, ${f(w.dz)}) * (${f(w.k * w.a)} * cos(th)) * clamp((${f(w.L)} / px - 2.0) / 4.0, 0.0, 1.0);`;
  }
  return /* glsl */ `
uniform vec4 uCalm[${MAX_CALM}];
float calmAt(vec2 p) {
  float c = 1.0;
  for (int i = 0; i < ${MAX_CALM}; i++) {
    float t = smoothstep(uCalm[i].z, uCalm[i].w, distance(p, uCalm[i].xy));
    c *= ${f(CALM_MIN)} + ${f(1 - CALM_MIN)} * t;
  }
  return c;
}
vec3 waveDisp(vec2 p, float t, float cell) {
  vec3 d = vec3(0.0); float th; float at;${disp}
  return d * calmAt(p);
}
// returns xyz = unnormalised normal, sets fold (crest pinch) and h (height).
// px is the size of a pixel on the water in metres; waves finer than that fade out.
vec3 waveNormal(vec2 p, float t, float px, out float fold, out float h) {
  vec3 n = vec3(0.0, 1.0, 0.0); float th; float c; float s; float at; fold = 0.0; h = 0.0;${nrm}
  float calm = calmAt(p);
  n.xz *= calm; fold *= calm; h *= calm;
  n.y = 1.0 - fold;
  return n;
}
vec2 rippleSlope(vec2 p, float t, float px) {
  vec3 n = vec3(0.0); float th;${rip}
  return n.xz;
}
`;
}
