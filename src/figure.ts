// A procedural human figure. A pose is a set of joint positions; the body is
// drawn as capsules stretched between them. Animation writes joint positions
// with gait cycles and two-bone IK, and the same joints can be handed to a
// ragdoll simulation, so there are no authored clips anywhere.
import * as THREE from 'three';
import { NOISE_GLSL } from './env';
import { MAT, BUMP_GLSL } from './materials';

export const J = {
  hips: 0, chest: 1, head: 2,
  shL: 3, elL: 4, haL: 5,
  shR: 6, elR: 7, haR: 8,
  hipL: 9, knL: 10, ftL: 11,
  hipR: 12, knR: 13, ftR: 14,
  COUNT: 15,
} as const;

// proportions (m)
const HIP_Y = 0.96, CHEST_Y = 1.44, HEAD_Y = 1.66;
const SH_W = 0.178, HIP_W = 0.095;
const UARM = 0.3, FARM = 0.28, THIGH = 0.445, SHIN = 0.45;
export const LIMB = { UARM, FARM, THIGH, SHIN, HIP_Y, CHEST_Y, HEAD_Y, SH_W, HIP_W };

export interface FigureLook {
  coat: string; trousers: string; skin: string; hood: boolean; hat?: boolean; scale?: number;
  hair?: string; beard?: string;
  /** no clothes: one colour all over (the thing in the tank) */
  bare?: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Vector3(), _eul = new THREE.Euler();

/** Two-bone IK: returns the middle joint for a chain from root to target, bent toward pole. */
export function solveIK(root: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, outMid: THREE.Vector3, outEnd?: THREE.Vector3) {
  _a.subVectors(target, root);
  let d = _a.length();
  const max = (l1 + l2) * 0.999;
  if (d > max) { _a.multiplyScalar(max / d); d = max; }
  if (d < 1e-4) { _a.set(0, -1e-4, 0); d = 1e-4; }
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  _b.copy(_a).multiplyScalar(1 / d);
  // pole direction orthogonal to the chain axis
  _c.copy(pole).addScaledVector(_b, -pole.dot(_b));
  if (_c.lengthSq() < 1e-8) _c.set(0, 0, 1).addScaledVector(_b, -_b.z);
  _c.normalize();
  outMid.copy(root).addScaledVector(_b, along).addScaledVector(_c, h);
  if (outEnd) outEnd.copy(root).add(_a);
}

// ---------------------------------------------------------------- materials
/** cloth and skin: the pattern is tied to the surface so it moves with the body */
export function bodyMaterial(kind: 'cloth' | 'skin' | 'leather', side: THREE.Side = THREE.FrontSide) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: kind === 'skin' ? 0.62 : kind === 'leather' ? 0.5 : 0.84, vertexColors: true, side });
  const detail = kind === 'cloth'
    ? `float fold = vnoise(q * vec2(7.0, 24.0)); float weave = vnoise(q * 300.0) * 0.6 + vnoise(q * vec2(40.0, 600.0)) * 0.4; float worn = vnoise(q * 4.0 + 3.0);
       diffuseColor.rgb *= (0.78 + 0.34 * fold) * (0.9 + 0.2 * weave) * (0.82 + 0.34 * worn);
       roughnessFactor = clamp(roughnessFactor + (weave - 0.5) * 0.25, 0.05, 1.0);
       wwBump = fold * 0.007 + weave * 0.0009;`
    : kind === 'leather'
      ? `float cr = vnoise(q * 90.0); float sc = vnoise(q * 12.0); diffuseColor.rgb *= (0.75 + 0.4 * sc) * (0.9 + 0.2 * cr);
         roughnessFactor = clamp(roughnessFactor + (sc - 0.5) * 0.4, 0.05, 1.0); wwBump = cr * 0.0012 + sc * 0.002;`
      : `float p = vnoise(q * 220.0); float bl = vnoise(q * 9.0); diffuseColor.rgb *= (0.9 + 0.16 * bl) * (0.96 + 0.08 * p);
         wwBump = p * 0.0005;`;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 tuv;\nvarying vec2 vTuv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTuv = tuv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vTuv;\n${NOISE_GLSL}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nfloat wwBump = 0.0;\n{ vec2 q = vTuv; ${detail} }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${BUMP_GLSL}`);
  };
  m.customProgramCacheKey = () => 'body-' + kind + side;
  return m;
}

// ------------------------------------------------------------------- tubes
// A limb or trunk is one continuous skin swept along a smooth curve through
// its joints, so elbows, knees and the waist bend without seams.
interface ProfKey { t: number; rx: number; rz: number; c: THREE.Color }
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _tan = new THREE.Vector3(), _sx = new THREE.Vector3(), _sz = new THREE.Vector3();

class Tube {
  readonly mesh: THREE.Mesh;
  private rx: Float32Array; private rz: Float32Array;
  constructor(parent: THREE.Object3D, mat: THREE.Material, prof: ProfKey[], private N: number, private M = 12, length = 0.6) {
    const count = N * (M + 1);
    this.rx = new Float32Array(N); this.rz = new Float32Array(N);
    const col = new Float32Array(count * 3), tuv = new Float32Array(count * 2), idx: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      let k = 0;
      while (k < prof.length - 2 && prof[k + 1].t < t) k++;
      const a = prof[k], b = prof[k + 1], f = THREE.MathUtils.clamp((t - a.t) / Math.max(1e-5, b.t - a.t), 0, 1);
      this.rx[i] = a.rx + (b.rx - a.rx) * f; this.rz[i] = a.rz + (b.rz - a.rz) * f;
      // colour changes are hard edges (cuffs, belts, boot tops), not blends
      c.copy(f < 0.5 ? a.c : b.c);
      for (let j = 0; j <= M; j++) {
        const v = i * (M + 1) + j;
        col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
        tuv[v * 2] = (j / M) * 0.4; tuv[v * 2 + 1] = t * length;
      }
    }
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + M + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('tuv', new THREE.BufferAttribute(tuv, 2));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  /** ctrl: joints the skin passes through. sideA/sideB: the cross-section's X axis at each end. */
  update(ctrl: THREE.Vector3[], sideA: THREE.Vector3, sideB: THREE.Vector3 = sideA, zScale = 1, flare = 0) {
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute, nrm = this.mesh.geometry.attributes.normal as THREE.BufferAttribute;
    const P = pos.array as Float32Array, Nn = nrm.array as Float32Array;
    const n = ctrl.length, N = this.N, M = this.M;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), u = t * (n - 1);
      const k = Math.min(n - 2, Math.floor(u)), f = u - k;
      const a = ctrl[Math.max(k - 1, 0)], b = ctrl[k], c = ctrl[k + 1], d = ctrl[Math.min(k + 2, n - 1)];
      const f2 = f * f, f3 = f2 * f;
      // Catmull-Rom position and tangent
      for (let ax = 0; ax < 3; ax++) {
        const A = a.getComponent(ax), B = b.getComponent(ax), C = c.getComponent(ax), D = d.getComponent(ax);
        _p0.setComponent(ax, 0.5 * (2 * B + (-A + C) * f + (2 * A - 5 * B + 4 * C - D) * f2 + (-A + 3 * B - 3 * C + D) * f3));
        _tan.setComponent(ax, 0.5 * ((-A + C) + 2 * (2 * A - 5 * B + 4 * C - D) * f + 3 * (-A + 3 * B - 3 * C + D) * f2));
      }
      if (_tan.lengthSq() < 1e-10) _tan.subVectors(c, b);
      _tan.normalize();
      _sx.copy(sideA).lerp(sideB, t);
      _sx.addScaledVector(_tan, -_sx.dot(_tan));
      if (_sx.lengthSq() < 1e-8) _sx.set(1, 0, 0).addScaledVector(_tan, -_tan.x);
      _sx.normalize();
      _sz.crossVectors(_sx, _tan);
      const rx = this.rx[i], rz = this.rz[i] * (1 + (zScale - 1) * t) + flare * t * t;
      for (let j = 0; j <= M; j++) {
        const ang = (j / M) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
        const v = (i * (M + 1) + j) * 3;
        P[v] = _p0.x + _sx.x * ca * rx + _sz.x * sa * rz;
        P[v + 1] = _p0.y + _sx.y * ca * rx + _sz.y * sa * rz;
        P[v + 2] = _p0.z + _sx.z * ca * rx + _sz.z * sa * rz;
        let nx = _sx.x * ca * rz + _sz.x * sa * rx, ny = _sx.y * ca * rz + _sz.y * sa * rx, nz = _sx.z * ca * rz + _sz.z * sa * rx;
        const l = Math.hypot(nx, ny, nz) || 1;
        Nn[v] = nx / l; Nn[v + 1] = ny / l; Nn[v + 2] = nz / l;
      }
    }
    pos.needsUpdate = true; nrm.needsUpdate = true;
  }
}

// --------------------------------------------------------------- sculpture
/** a head with a brow, eye sockets, nose, cheeks, lips and jaw, pushed out of a sphere */
export function headGeometry(r = 0.1) {
  const g = new THREE.SphereGeometry(r, 40, 30);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) / r, y = p.getY(i) / r, z = p.getZ(i) / r;
    const jaw = Math.max(0, -y - 0.1);
    x *= (1 - jaw * 0.42) * 0.84;
    y *= y < 0 ? 1.2 : 1.04;
    z *= 1.02 + (z < 0 ? 0.12 * (1 - Math.abs(y)) : 0);
    if (z > 0) {
      z -= jaw * 0.1;
      z += Math.exp(-(((y - 0.22) / 0.09) ** 2)) * 0.07 * (0.5 + 0.5 * Math.min(1, Math.abs(x) * 3.5));     // brow
      z -= Math.exp(-((Math.abs(x) - 0.36) ** 2) / 0.018 - ((y - 0.07) ** 2) / 0.014) * 0.13;                // sockets
      z += Math.exp(-(x * x) / 0.0045 - ((y + 0.08) ** 2) / 0.05) * 0.2 * (y > -0.3 ? 1 : 0.3);              // nose
      z += Math.exp(-((Math.abs(x) - 0.48) ** 2) / 0.03 - ((y + 0.1) ** 2) / 0.03) * 0.04;                   // cheekbones
      z += Math.exp(-(x * x) / 0.035 - ((y + 0.52) ** 2) / 0.004) * 0.045;                                   // lips
      z -= Math.exp(-(x * x) / 0.05 - ((y + 0.64) ** 2) / 0.003) * 0.03;                                     // under the lip
      z += Math.exp(-(x * x) / 0.03 - ((y + 0.86) ** 2) / 0.02) * 0.06;                                      // chin
    }
    p.setXYZ(i, x * r, y * r, z * r);
  }
  g.computeVertexNormals();
  return g;
}
let _head: THREE.BufferGeometry | null = null;
const sharedHead = () => (_head ??= headGeometry()).clone();

function paint(g: THREE.BufferGeometry, c: THREE.Color) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const part = (g: THREE.BufferGeometry, mat: THREE.Material, c: THREE.Color, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(paint(g, c), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};

export class Figure {
  readonly group = new THREE.Group();
  /** joint positions in the figure's local space (or world space when ragdolled) */
  readonly joints: THREE.Vector3[] = [];
  private armL: Tube; private armR: Tube; private legL: Tube; private legR: Tube; private trunk: Tube; private skirt: Tube | null = null;
  private frame = new THREE.Group();   // rides the hips, oriented with the torso: belts, bags, buttons
  private head = new THREE.Group();
  private handL = new THREE.Group(); private handR = new THREE.Group();
  private footL = new THREE.Group(); private footR = new THREE.Group();
  /** radians the head is turned relative to the body */
  headYaw = 0; headPitch = 0;
  readonly rightHandSlot = new THREE.Group();
  readonly mouthSlot = new THREE.Group();
  /** length of the coat below the belt, 0 hides it */
  skirtAmount = 1;
  private spine = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private hem = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  constructor(look: FigureLook) {
    for (let i = 0; i < J.COUNT; i++) this.joints.push(new THREE.Vector3());
    const bare = !!look.bare;
    const cloth = bodyMaterial(bare ? 'skin' : 'cloth'), clothTwo = bodyMaterial('cloth', THREE.DoubleSide);
    const skinMat = bodyMaterial('skin'), leather = bodyMaterial('leather');
    const coat = new THREE.Color(look.coat), dim = coat.clone().multiplyScalar(0.55), trousers = new THREE.Color(look.trousers);
    const skin = new THREE.Color(look.skin), boot = new THREE.Color('#1c1916'), strap = new THREE.Color('#2a2119'), accent = new THREE.Color('#6e2f20');
    const g = this.group;
    const K = (t: number, rx: number, rz: number, c: THREE.Color): ProfKey => ({ t, rx, rz, c });

    const arm = [K(0, 0.035, 0.04, coat), K(0.07, 0.051, 0.058, coat), K(0.25, 0.054, 0.058, coat), K(0.48, 0.05, 0.053, coat), K(0.56, 0.05, 0.05, coat),
      K(0.86, 0.043, 0.041, coat), K(0.9, 0.05, 0.048, bare ? coat : dim), K(0.97, 0.049, 0.047, bare ? coat : dim), K(1, 0.028, 0.026, bare ? coat : dim)];
    const leg = [K(0, 0.07, 0.075, trousers), K(0.06, 0.092, 0.097, trousers), K(0.3, 0.08, 0.086, trousers), K(0.47, 0.064, 0.067, trousers), K(0.55, 0.066, 0.071, trousers),
      K(0.63, 0.059, 0.061, trousers), K(0.645, 0.069, 0.071, bare ? trousers : boot), K(0.9, 0.056, 0.058, bare ? trousers : boot), K(1, 0.05, 0.056, bare ? trousers : boot)];
    const trunk = [K(0, 0.05, 0.045, trousers), K(0.08, 0.15, 0.105, trousers), K(0.2, 0.166, 0.116, bare ? coat : trousers), K(0.25, 0.17, 0.118, coat),
      K(0.31, 0.166, 0.115, bare ? coat : strap), K(0.35, 0.166, 0.115, bare ? coat : strap), K(0.36, 0.16, 0.112, coat), K(0.5, 0.15, 0.106, coat), K(0.66, 0.178, 0.12, coat),
      K(0.735, 0.186, 0.114, coat), K(0.79, 0.165, 0.1, coat), K(0.84, 0.09, 0.08, bare ? coat : dim), K(0.88, 0.058, 0.06, skin), K(1, 0.052, 0.056, skin)];
    this.armL = new Tube(g, cloth, arm, 22, 12, 0.6); this.armR = new Tube(g, cloth, arm, 22, 12, 0.6);
    this.legL = new Tube(g, cloth, leg, 24, 12, 0.95); this.legR = new Tube(g, cloth, leg, 24, 12, 0.95);
    this.trunk = new Tube(g, cloth, trunk, 30, 16, 0.75);
    if (!bare) this.skirt = new Tube(g, clothTwo, [K(0, 0.168, 0.122, coat), K(0.5, 0.215, 0.185, coat), K(0.97, 0.262, 0.235, coat), K(1, 0.265, 0.238, dim)], 12, 18, 0.62);

    // things worn on the torso
    g.add(this.frame);
    if (!bare) {
      const fr = this.frame;
      fr.add(part(new THREE.BoxGeometry(0.05, 0.04, 0.012), MAT.brass, new THREE.Color('#fff'), 0, 0.165, 0.118));
      for (let i = 0; i < 4; i++) fr.add(part(new THREE.SphereGeometry(0.009, 8, 6), leather, strap, 0.012, 0.23 + i * 0.065, 0.107 + Math.sin(i * 1.1) * 0.006 + (i > 1 ? 0.008 : 0)));
      const st = part(new THREE.TorusGeometry(0.205, 0.012, 6, 28), leather, strap, 0, 0.27, 0);
      st.scale.set(1, 1.25, 0.66); st.rotation.z = 0.62;
      fr.add(st);
      const bag = new THREE.Group();
      bag.position.set(0.2, 0.0, -0.02);
      bag.add(part(new THREE.BoxGeometry(0.085, 0.19, 0.23, 2, 2, 2), leather, new THREE.Color('#4b3b2a')));
      bag.add(part(new THREE.BoxGeometry(0.092, 0.09, 0.24), leather, new THREE.Color('#3e3022'), 0.002, 0.055, 0));
      bag.add(part(new THREE.BoxGeometry(0.01, 0.03, 0.03), MAT.brass, new THREE.Color('#fff'), 0.05, 0.015, 0));
      fr.add(bag);
      // scarf wound twice round the neck, with a tail down the back
      for (const [y, s, tilt] of [[0.565, 1, 0.1], [0.535, 1.12, -0.12]] as const) {
        const sc = part(new THREE.TorusGeometry(0.078, 0.036, 10, 22), cloth, accent, 0, y, 0.004);
        sc.rotation.set(Math.PI / 2 + tilt, 0, 0); sc.scale.set(s, s * 0.9, 1.1);
        fr.add(sc);
      }
      const tail = part(new THREE.BoxGeometry(0.07, 0.22, 0.02, 1, 4, 1), cloth, accent, -0.05, 0.45, -0.1);
      tail.rotation.set(0.12, 0, 0.1);
      fr.add(tail);
      // collar standing up round the neck
      const collar = part(new THREE.CylinderGeometry(0.085, 0.1, 0.07, 18, 1, true), clothTwo, dim, 0, 0.5, 0.0);
      collar.scale.z = 0.85;
      fr.add(collar);
    }

    // head
    const h = this.head;
    h.add(part(sharedHead(), skinMat, skin));
    for (const s of [-1, 1]) {
      const eye = part(new THREE.SphereGeometry(0.0115, 10, 8), MAT.black, new THREE.Color('#fff'), s * 0.031, 0.008, 0.079);
      eye.castShadow = false;
      const ear = part(new THREE.SphereGeometry(0.022, 10, 8), skinMat, skin, s * 0.083, -0.004, -0.005);
      ear.scale.set(0.35, 1, 0.65);
      h.add(eye, ear);
    }
    if (look.hair && !look.hood) {
      const hg = new THREE.SphereGeometry(0.106, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56);
      hg.rotateX(-0.42);
      const hair = part(hg, cloth, new THREE.Color(look.hair), 0, 0.006, -0.008);
      hair.scale.set(0.9, 1.08, 1.08);
      h.add(hair);
    }
    if (look.beard) {
      const bg = new THREE.SphereGeometry(0.07, 16, 12, 0, Math.PI, 0.9, 1.6);
      const beard = part(bg, cloth, new THREE.Color(look.beard), 0, -0.035, 0.012);
      beard.scale.set(1.05, 1.25, 1.25);
      h.add(beard);
    }
    if (look.hood) {
      // deep hood with a peak, its opening shading the face
      const hg = new THREE.SphereGeometry(0.13, 28, 18, 0, Math.PI * 2, 0.62, Math.PI - 0.62);
      hg.rotateX(Math.PI / 2);
      const hp = hg.attributes.position;
      for (let i = 0; i < hp.count; i++) {
        const z = hp.getZ(i), y = hp.getY(i);
        if (z < 0) hp.setY(i, y + (-z) * 0.28 * Math.max(0, y / 0.13 + 0.3));     // peak at the back
        if (y < -0.05) hp.setXYZ(i, hp.getX(i) * 1.12, y * 1.25, z * 0.95);       // drape toward the shoulders
      }
      hg.computeVertexNormals();
      const hood = part(hg, clothTwo, coat, 0, 0.012, -0.004);
      hood.scale.set(0.98, 1.16, 1.1);
      // the inside of the hood is in shadow
      const lining = part(hg.clone(), bodyMaterial('cloth', THREE.BackSide), coat.clone().multiplyScalar(0.25), 0, 0.012, -0.004);
      lining.scale.set(0.96, 1.12, 1.06); lining.castShadow = false;
      h.add(hood, lining);
    }
    if (look.hat) {
      const felt = new THREE.Color('#1d1b19');
      const bg = new THREE.CylinderGeometry(0.2, 0.205, 0.012, 28, 1);
      const bp = bg.attributes.position;
      for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i); bp.setY(i, bp.getY(i) + (x * x - z * z * 0.4) * 0.9 - Math.hypot(x, z) * 0.06); }
      bg.computeVertexNormals();
      h.add(part(bg, cloth, felt, 0, 0.078, 0));
      const crown = part(new THREE.CylinderGeometry(0.092, 0.108, 0.1, 22, 2), cloth, felt, 0, 0.122, 0);
      crown.scale.z = 1.1;
      h.add(crown, part(new THREE.CylinderGeometry(0.11, 0.11, 0.022, 22, 1, true), leather, strap, 0, 0.084, 0));
    }
    this.mouthSlot.position.set(0.012, -0.052, 0.1);
    h.add(this.mouthSlot);
    g.add(h);

    // hands: palm, four fingers, thumb. Local +Y runs out along the forearm.
    for (const [hand, s] of [[this.handL, 1], [this.handR, -1]] as const) {
      const palm = part(new THREE.SphereGeometry(0.04, 12, 10), skinMat, skin, 0, 0.04, 0);
      palm.scale.set(0.95, 1.2, 0.42);
      hand.add(palm);
      for (let f = 0; f < 4; f++) {
        const fg = new THREE.Group();
        fg.position.set((f - 1.5) * 0.019, 0.082, 0.002);
        fg.rotation.set(0.5, 0, (f - 1.5) * -0.07);
        const len = 0.036 - Math.abs(f - 1.4) * 0.005;
        fg.add(part(new THREE.CapsuleGeometry(0.0088, len, 3, 8), skinMat, skin, 0, len / 2, 0));
        const tip = part(new THREE.CapsuleGeometry(0.008, len * 0.8, 3, 8), skinMat, skin, 0, len * 0.4, 0);
        const kn = new THREE.Group(); kn.position.y = len + 0.008; kn.rotation.x = 0.7; kn.add(tip);
        fg.add(kn);
        hand.add(fg);
      }
      const th = new THREE.Group();
      th.position.set(s * 0.036, 0.03, 0.01); th.rotation.set(0.5, 0, s * -0.9);
      th.add(part(new THREE.CapsuleGeometry(0.0105, 0.035, 3, 8), skinMat, skin, 0, 0.02, 0));
      hand.add(th);
      g.add(hand);
    }
    this.handR.add(this.rightHandSlot);

    // boots (or bare feet)
    for (const foot of [this.footL, this.footR]) {
      const c = bare ? skin : boot, m = bare ? skinMat : leather;
      const toe = part(new THREE.SphereGeometry(0.05, 14, 10), m, c, 0, 0.048, 0.105);
      toe.scale.set(0.96, 0.82, 1.9);
      const heel = part(new THREE.SphereGeometry(0.052, 12, 10), m, c, 0, 0.055, -0.012);
      heel.scale.set(0.98, 1.1, 1.15);
      foot.add(toe, heel);
      if (!bare) {
        foot.add(part(new THREE.BoxGeometry(0.104, 0.022, 0.285, 1, 1, 3), leather, new THREE.Color('#0d0c0b'), 0, 0.011, 0.06));
        foot.add(part(new THREE.BoxGeometry(0.108, 0.03, 0.08), leather, new THREE.Color('#0d0c0b'), 0, 0.015, -0.035));
      }
      g.add(foot);
    }
    if (look.scale) g.scale.setScalar(look.scale);
    this.setStanding();
    this.refresh(0);
  }

  /** neutral standing pose */
  setStanding() {
    const p = this.joints;
    p[J.hips].set(0, HIP_Y, 0); p[J.chest].set(0, CHEST_Y, 0); p[J.head].set(0, HEAD_Y, 0.01);
    p[J.shL].set(SH_W, CHEST_Y - 0.03, 0); p[J.shR].set(-SH_W, CHEST_Y - 0.03, 0);
    p[J.elL].set(SH_W + 0.04, CHEST_Y - 0.32, -0.02); p[J.elR].set(-SH_W - 0.04, CHEST_Y - 0.32, -0.02);
    p[J.haL].set(SH_W + 0.05, CHEST_Y - 0.6, 0.04); p[J.haR].set(-SH_W - 0.05, CHEST_Y - 0.6, 0.04);
    p[J.hipL].set(HIP_W, HIP_Y - 0.04, 0); p[J.hipR].set(-HIP_W, HIP_Y - 0.04, 0);
    p[J.knL].set(HIP_W, 0.5, 0.02); p[J.knR].set(-HIP_W, 0.5, 0.02);
    p[J.ftL].set(HIP_W, 0.03, 0); p[J.ftR].set(-HIP_W, 0.03, 0);
  }

  /** Rebuild the body from the current joints. footYaw is the feet's heading in joint space. */
  refresh(footYaw: number) {
    const p = this.joints;
    const hips = p[J.hips], chest = p[J.chest];
    // torso basis: up along the spine, side along the shoulder line
    _a.subVectors(chest, hips);
    const len = _a.length() || 1e-4;
    _a.multiplyScalar(1 / len);                                 // up
    _b.subVectors(p[J.shL], p[J.shR]).normalize();              // shoulder line
    _c.crossVectors(_b, _a).normalize();                        // forward
    _b.crossVectors(_a, _c).normalize();
    _m.makeBasis(_b, _a, _c);
    this.frame.quaternion.setFromRotationMatrix(_m);
    this.frame.position.copy(hips);
    this.frame.scale.set(1, len / (CHEST_Y - HIP_Y), 1);

    // trunk: crotch, hips, waist, chest, neck
    const sp = this.spine;
    sp[0].copy(hips).addScaledVector(_a, -0.12);
    sp[1].copy(hips);
    sp[2].copy(hips).lerp(chest, 0.5).addScaledVector(_c, -0.012);
    sp[3].copy(chest);
    sp[4].copy(p[J.head]).lerp(chest, 0.28);
    _d.subVectors(p[J.hipL], p[J.hipR]).normalize();
    this.trunk.update(sp, _d, _b);

    // arms hang from the shoulders; legs from the hips
    this.armL.update([p[J.shL], p[J.elL], p[J.haL]], _c, _c);
    this.armR.update([p[J.shR], p[J.elR], p[J.haR]], _c, _c);
    this.legL.update([p[J.hipL], p[J.knL], p[J.ftL]], _d, _d);
    this.legR.update([p[J.hipR], p[J.knR], p[J.ftR]], _d, _d);

    // the coat hangs from the hips, drawn toward the knees and widened by the stride
    if (this.skirt) {
      this.skirt.mesh.visible = this.skirtAmount > 0.01;
      if (this.skirt.mesh.visible) {
        _e.addVectors(p[J.knL], p[J.knR]).multiplyScalar(0.5).sub(hips).normalize();
        _e.lerp(_tmp.copy(_a).negate(), 0.55).normalize();      // direction the hem hangs
        const L = 0.62 * this.skirtAmount;
        this.hem[0].copy(hips).addScaledVector(_a, 0.03);
        this.hem[1].copy(hips).addScaledVector(_a, -L * 0.45).addScaledVector(_e, L * 0.06);
        this.hem[2].copy(hips).addScaledVector(_e, L);
        const spread = Math.abs(p[J.knL].z - p[J.knR].z) + Math.abs(p[J.ftL].z - p[J.ftR].z) * 0.5;
        this.skirt.update(this.hem, _d, _d, 1, spread * 0.22);
      }
    }

    // head sits on the spine with its own look rotation
    this.head.position.copy(p[J.head]);
    this.head.quaternion.copy(this.frame.quaternion);
    _q.setFromEuler(_eul.set(this.headPitch, this.headYaw, 0, 'YXZ'));
    this.head.quaternion.multiply(_q);

    // hands continue the forearms, palms turned in toward the body
    for (const [hand, el, ha, s] of [[this.handL, J.elL, J.haL, 1], [this.handR, J.elR, J.haR, -1]] as const) {
      _e.subVectors(p[ha], p[el]).normalize();                   // along the forearm
      _tmp.copy(_b).multiplyScalar(-s);                          // palm normal: toward the body's midline
      _tmp.addScaledVector(_e, -_tmp.dot(_e));
      if (_tmp.lengthSq() < 1e-6) _tmp.copy(_c);
      _tmp.normalize();
      _tmp2.crossVectors(_e, _tmp);
      _m.makeBasis(_tmp2, _e, _tmp);
      hand.quaternion.setFromRotationMatrix(_m);
      hand.position.copy(p[ha]).addScaledVector(_e, -0.02);
    }
    for (const [m, ft, kn] of [[this.footL, J.ftL, J.knL], [this.footR, J.ftR, J.knR]] as const) {
      m.position.copy(p[ft]).y -= 0.03;
      // toe pitches with the shin when the foot is off the ground
      const pitch = Math.max(0, Math.min(0.9, (p[ft].y - 0.03) * 2.2)) + Math.max(-0.5, Math.min(0.5, (p[ft].z - p[kn].z) * -0.6));
      m.rotation.set(pitch, footYaw, 0, 'YXZ');
    }
  }
}
const _tmp = new THREE.Vector3(), _tmp2 = new THREE.Vector3();

export interface GaitState {
  phase: number;    // 0..1 stride cycle
  speed: number;    // smoothed ground speed
  bob: number;
  leanF: number; leanS: number;
  idleT: number;
}
export const newGait = (): GaitState => ({ phase: 0, speed: 0, bob: 0, leanF: 0, leanS: 0, idleT: Math.random() * 10 });

const _hipL = new THREE.Vector3(), _hipR = new THREE.Vector3(), _t = new THREE.Vector3();
const POLE_KNEE = new THREE.Vector3(0, 0, 1), POLE_ELBOW = new THREE.Vector3(0, -0.3, -1);

/**
 * Walking / running / idle, written straight into the figure's joints.
 * speed is ground speed in m/s; turn is yaw rate; slopeY(dx, dz) returns the
 * ground height offset under a foot placed at local (dx, dz).
 */
export function animateGait(f: Figure, g: GaitState, dt: number, speed: number, turn: number, slopeY?: (lx: number, lz: number) => number) {
  const p = f.joints;
  g.speed += (speed - g.speed) * Math.min(1, dt * 8);
  g.idleT += dt;
  const v = g.speed;
  const moving = Math.min(1, v / 0.6);
  const run = THREE.MathUtils.smoothstep(v, 2.6, 4.4);
  const stride = 0.62 + 0.42 * Math.min(1, v / 4.5) + run * 0.25; // half-cycle step length
  if (v > 0.05) g.phase = (g.phase + (v * dt) / (2 * stride)) % 1;
  else g.phase += (Math.round(g.phase * 2) / 2 - g.phase) * Math.min(1, dt * 6);

  const breathe = Math.sin(g.idleT * 1.5) * 0.006 * (1 - moving);
  const sway = Math.sin(g.idleT * 0.6) * 0.012 * (1 - moving);
  const bob = (Math.cos(g.phase * Math.PI * 4) * 0.5 + 0.5) * (0.035 + run * 0.035) * moving;
  const crouch = 0.004 + run * 0.05 + moving * 0.05;
  g.leanF += ((0.03 + run * 0.16) * moving - g.leanF) * Math.min(1, dt * 5);
  g.leanS += (THREE.MathUtils.clamp(-turn * 0.06 * moving, -0.15, 0.15) - g.leanS) * Math.min(1, dt * 5);

  const hipY = HIP_Y - crouch + bob;
  const twist = Math.sin(g.phase * Math.PI * 2) * 0.16 * moving;
  p[J.hips].set(sway + Math.sin(g.phase * Math.PI * 2) * 0.018 * moving, hipY, 0);
  const spine = CHEST_Y - HIP_Y;
  p[J.chest].set(p[J.hips].x * 0.5 + g.leanS * spine, hipY + spine * Math.cos(g.leanF) + breathe, Math.sin(g.leanF) * spine);
  p[J.head].set(p[J.chest].x, p[J.chest].y + (HEAD_Y - CHEST_Y), p[J.chest].z + 0.01 + g.leanF * 0.06);

  const ct = Math.cos(twist), st = Math.sin(twist);
  // shoulders counter-rotate against the hips
  p[J.shL].set(p[J.chest].x + SH_W * ct, p[J.chest].y - 0.03, p[J.chest].z + SH_W * st);
  p[J.shR].set(p[J.chest].x - SH_W * ct, p[J.chest].y - 0.03, p[J.chest].z - SH_W * st);
  _hipL.set(p[J.hips].x + HIP_W * ct, hipY - 0.04, -HIP_W * st);
  _hipR.set(p[J.hips].x - HIP_W * ct, hipY - 0.04, HIP_W * st);
  p[J.hipL].copy(_hipL); p[J.hipR].copy(_hipR);

  // feet: stance slides back under the body, swing lifts and reaches forward
  for (let side = 0; side < 2; side++) {
    const ph = (g.phase + side * 0.5) % 1;
    const x = (side === 0 ? HIP_W : -HIP_W) * (1 - run * 0.3) + p[J.hips].x * 0.3;
    let z: number, y: number;
    const stanceShare = 0.6 - run * 0.2;
    if (ph < stanceShare) {
      const k = ph / stanceShare;
      z = stride * (0.5 - k);
      y = 0;
    } else {
      const k = (ph - stanceShare) / (1 - stanceShare);
      const e = k * k * (3 - 2 * k);
      z = stride * (-0.5 + e);
      y = Math.sin(k * Math.PI) * (0.1 + run * 0.14);
    }
    z *= moving;
    y *= moving;
    const ground = slopeY ? slopeY(x, z) : 0;
    _t.set(x, 0.03 + y + ground, z);
    const hip = side === 0 ? _hipL : _hipR;
    solveIK(hip, _t, THIGH, SHIN, POLE_KNEE, p[side === 0 ? J.knL : J.knR], p[side === 0 ? J.ftL : J.ftR]);
  }

  // arms swing opposite to the legs
  for (let side = 0; side < 2; side++) {
    const sgn = side === 0 ? 1 : -1;
    const sw = Math.sin(g.phase * Math.PI * 2 + (side === 0 ? Math.PI : 0)) * (0.2 + run * 0.25) * moving;
    const sh = p[side === 0 ? J.shL : J.shR];
    const bend = 0.12 + run * 0.55 + moving * 0.1;
    _t.set(sh.x + sgn * 0.06, sh.y - (UARM + FARM) * (0.97 - bend * 0.25), sh.z + sw * 0.75 + bend * 0.22 + 0.03);
    solveIK(sh, _t, UARM, FARM, POLE_ELBOW, p[side === 0 ? J.elL : J.elR], p[side === 0 ? J.haL : J.haR]);
  }
  f.refresh(0);
}
