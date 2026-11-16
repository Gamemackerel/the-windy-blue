// The giant's body as ONE continuous skin.
//
// The body is described once, in a rest pose with the arms held out and down,
// as a smooth blend of simple volumes. That description is turned into a single
// closed surface (surface nets), and every point of the surface is tied to the
// nearest bones so the head, arms, hands and fingers can move without any part
// being a separate shape.
import * as THREE from 'three';
import { smooth } from './noise';

export const G_HEAD = new THREE.Vector3(0, 0.215, 0.02);
export const G_SH = [new THREE.Vector3(0.205, -0.045, 0), new THREE.Vector3(-0.205, -0.045, 0)];
export const G_UARM = 0.42, G_FARM = 0.4;
const HR = 0.115;
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export interface GiantArmBones { upper: THREE.Bone; fore: THREE.Bone; hand: THREE.Bone; fingers: { base: THREE.Bone; kn: THREE.Bone }[]; bindDir: THREE.Vector3; armQ: THREE.Quaternion; handQ: THREE.Quaternion }

interface Prim { bone: number; k: number; cx: number; cy: number; cz: number; br: number; f: (x: number, y: number, z: number) => number }

/** radius as a function of height for a turned profile, with its slope */
function profile(pts: [number, number][]) {
  const sp = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y))).getPoints(240);
  const y1 = pts[0][1], y0 = pts[pts.length - 1][1], N = 256;
  const R = new Float32Array(N + 1), D = new Float32Array(N + 1);
  let j = 0;
  for (let i = 0; i <= N; i++) {
    const y = y1 + ((y0 - y1) * i) / N;
    while (j < sp.length - 2 && sp[j + 1].y > y) j++;
    const a = sp[j], b = sp[j + 1], t = Math.abs(a.y - b.y) < 1e-9 ? 0 : THREE.MathUtils.clamp((a.y - y) / (a.y - b.y), 0, 1);
    R[i] = a.x + (b.x - a.x) * t;
  }
  const dy = (y1 - y0) / N;
  for (let i = 0; i <= N; i++) D[i] = (R[Math.min(N, i + 1)] - R[Math.max(0, i - 1)]) / (dy * (i === 0 || i === N ? 1 : 2));
  return { y0, y1, at(y: number, out: { r: number; d: number }) {
    const u = THREE.MathUtils.clamp(((y1 - y) / (y1 - y0)) * N, 0, N), i = Math.min(N - 1, Math.floor(u)), t = u - i;
    out.r = R[i] + (R[i + 1] - R[i]) * t; out.d = D[i] + (D[i + 1] - D[i]) * t;
  } };
}

/** the face: applied to the finished surface, fading out below the jaw so the neck runs on unbroken */
function shapeHead(v: THREE.Vector3) {
  const px = (v.x - G_HEAD.x) / HR, py = (v.y - G_HEAD.y) / HR, pz = (v.z - G_HEAD.z) / HR;
  const w = smooth(-1.3, -1.0, py) * smooth(1.9, 1.4, Math.hypot(px, pz));
  if (w <= 0) return;
  const G = (a: number, s: number) => Math.exp(-(a * a) / s);
  let x = px, y = py, z = pz;
  const jaw = Math.min(0.85, Math.max(0, -y - 0.15));
  x *= (1 - jaw * 0.55) * 0.86;
  x *= 1 - G(y - 0.05, 0.05) * 0.05 * smooth(-0.4, 0.0, z);
  y *= y < 0 ? 1.22 : 1.08;
  z *= 1.04 + (z < 0 ? 0.16 * Math.max(0, 1 - Math.abs(y)) : 0);
  const front = smooth(0.0, 0.4, pz);
  if (front > 0) {
    const ax = Math.abs(x);
    let dz = -jaw * 0.12;
    dz += G(y - 0.24, 0.012) * 0.05 * (0.6 + 0.4 * Math.min(1, ax * 3));
    dz -= G(ax - 0.36, 0.022) * G(y - 0.04, 0.02) * 0.17;
    dz += G(x, 0.005) * G(y + 0.1, 0.06) * 0.13 * (y > -0.26 ? 1 : 0.4);
    dz += G(ax - 0.07, 0.0025) * G(y + 0.27, 0.003) * 0.03;
    dz -= G(ax - 0.05, 0.0012) * G(y + 0.3, 0.0012) * 0.035;
    dz += G(ax - 0.45, 0.03) * G(y + 0.12, 0.03) * 0.035;
    dz -= G(ax - 0.3, 0.02) * G(y + 0.45, 0.03) * 0.03;
    dz += G(x, 0.04) * G(y + 0.47, 0.004) * 0.035;
    dz += G(x, 0.035) * G(y + 0.58, 0.004) * 0.03;
    dz -= G(x, 0.07) * G(y + 0.525, 0.0006) * 0.045;
    dz -= G(x, 0.002) * G(y + 0.38, 0.004) * 0.012;
    dz += G(x, 0.03) * G(y + 0.86, 0.02) * 0.05;
    z += dz * front;
  }
  v.x += (x - px) * HR * w; v.y += (y - py) * HR * w; v.z += (z - pz) * HR * w;
}

export function buildGiantBody(material: THREE.Material) {
  const skel = new THREE.Group();
  const bones: THREE.Bone[] = [], blend: number[] = [];
  const bone = (parent: THREE.Object3D, bl: number) => { const b = new THREE.Bone(); parent.add(b); bones.push(b); blend.push(bl); return b; };
  const idx = (b: THREE.Bone) => bones.indexOf(b);
  const body = bone(skel, 0.09);
  const head = bone(skel, 0.08);   // wide blends: the neck bends over its whole length instead of creasing under the jaw
  head.position.copy(G_HEAD);

  const arms: GiantArmBones[] = G_SH.map((sh, i) => {
    const s = i === 0 ? 1 : -1;
    const bindDir = new THREE.Vector3(s * 0.8, -0.6, 0).normalize();
    const armQ = new THREE.Quaternion().setFromUnitVectors(Y, bindDir), handQ = new THREE.Quaternion().setFromUnitVectors(Z, bindDir);
    const upper = bone(skel, 0.05), fore = bone(skel, 0.04), hand = bone(skel, 0.02);
    upper.position.copy(sh); upper.quaternion.copy(armQ);
    fore.position.copy(sh).addScaledVector(bindDir, G_UARM); fore.quaternion.copy(armQ);
    hand.position.copy(sh).addScaledVector(bindDir, G_UARM + G_FARM); hand.quaternion.copy(handQ);
    const fingers = [0, 1, 2, 3, 4].map((f) => {
      const thumb = f === 0;
      const base = bone(hand, 0.008), kn = bone(base, 0.008);
      base.position.set(thumb ? s * -0.043 : s * (-0.034 + (f - 1) * 0.0225), 0, thumb ? 0.03 : 0.094);
      base.rotation.y = thumb ? s * -1.0 : (f - 2.5) * 0.11 * s;
      const len = thumb ? 0.052 : 0.078 - Math.abs(f - 2.4) * 0.008;
      kn.position.z = len * 0.62;
      base.userData.len = len;
      return { base, kn };
    });
    return { upper, fore, hand, fingers, bindDir, armQ, handQ };
  });
  skel.updateMatrixWorld(true);

  // ---------------------------------------------------------- the volumes
  const prims: Prim[] = [];
  const o = { r: 0, d: 0 };
  const torsoP = profile([[0.001, 0.075], [0.06, 0.07], [0.12, 0.05], [0.2, 0.024], [0.25, -0.012], [0.265, -0.055], [0.25, -0.12], [0.215, -0.2], [0.176, -0.32], [0.155, -0.42], [0.172, -0.55], [0.15, -0.8]]);
  prims.push({ bone: idx(body), k: 0.02, cx: 0, cy: 0, cz: 0, br: 99, f: (x, y, z) => {
    let zz = z;
    if (z > 0) {
      const ax = Math.abs(x);
      zz -= Math.exp(-(((y + 0.012 + ax * 0.12) / 0.014) ** 2)) * 0.011 * smooth(0.02, 0.06, ax) * smooth(0.2, 0.14, ax);   // collarbones
      zz += Math.exp(-(x * x) / 0.0008 - (y * y) / 0.001) * 0.011;                                                             // throat notch
      zz -= Math.exp(-((ax - 0.09) ** 2) / 0.005 - ((y + 0.13) ** 2) / 0.006) * 0.012;                                         // chest
      zz += Math.exp(-(x * x) / 0.001 - ((y + 0.2) ** 2) / 0.03) * 0.007;                                                      // sternum line
    } else zz -= Math.exp(-(x * x) / 0.0008) * 0.006 * smooth(0.0, -0.1, y);                                                   // spine furrow
    const rho = Math.hypot(x, zz / 0.6);
    if (y > torsoP.y1) return ((rho + (y - torsoP.y1) * 2) * 0.6) / 2.24;
    torsoP.at(y, o);
    return Math.max(((rho - o.r) * 0.6) / Math.sqrt(1 + o.d * o.d), torsoP.y0 - y);
  } });
  const neckP = profile([[0.064, 0.21], [0.064, 0.13], [0.067, 0.09], [0.076, 0.062], [0.095, 0.04], [0.14, 0.018], [0.17, 0.0]]);
  prims.push({ bone: idx(body), k: 0.025, cx: 0, cy: 0.1, cz: 0, br: 0.25, f: (x, y, z) => {
    neckP.at(y, o);
    const rho = Math.hypot(x, (z - 0.005) / 0.8);
    return Math.max(((rho - o.r) * 0.8) / Math.sqrt(1 + o.d * o.d), y - 0.21, -0.03 - y);
  } });
  prims.push({ bone: idx(head), k: 0.014, cx: G_HEAD.x, cy: G_HEAD.y, cz: G_HEAD.z, br: HR, f: (x, y, z) => Math.hypot(x - G_HEAD.x, y - G_HEAD.y, z - G_HEAD.z) - HR });
  for (const s of [-1, 1]) {
    const ex = G_HEAD.x + s * 0.112, ey = G_HEAD.y, ez = G_HEAD.z - 0.012;
    prims.push({ bone: idx(head), k: 0.008, cx: ex, cy: ey, cz: ez, br: 0.04, f: (x, y, z) => (Math.hypot((x - ex) / 0.011, (y - ey) / 0.03, (z - ez) / 0.021) - 1) * 0.011 });
  }
  const cone = (b: THREE.Bone, a: THREE.Vector3, c: THREE.Vector3, r0: number, r1: number, k: number) => {
    const bx = c.x - a.x, by = c.y - a.y, bz = c.z - a.z, bb = bx * bx + by * by + bz * bz;
    prims.push({ bone: idx(b), k, cx: (a.x + c.x) / 2, cy: (a.y + c.y) / 2, cz: (a.z + c.z) / 2, br: Math.sqrt(bb) / 2 + Math.max(r0, r1), f: (x, y, z) => {
      const px = x - a.x, py = y - a.y, pz = z - a.z;
      const t = THREE.MathUtils.clamp((px * bx + py * by + pz * bz) / bb, 0, 1);
      return Math.hypot(px - bx * t, py - by * t, pz - bz * t) - (r0 + (r1 - r0) * t);
    } });
  };
  const _p = new THREE.Vector3(), _q = new THREE.Vector3();
  arms.forEach((a, i) => {
    const sh = G_SH[i], el = a.fore.position, wr = a.hand.position;
    cone(a.upper, sh, sh.clone().addScaledVector(a.bindDir, 0.02), 0.064, 0.064, 0.03);          // the round of the shoulder
    cone(a.upper, sh, el, 0.057, 0.043, 0.03);
    cone(a.fore, el, wr, 0.043, 0.027, 0.02);
    // palm: a flattened pad in the hand's own frame
    const inv = a.hand.matrixWorld.clone().invert().elements;
    const pc = a.hand.localToWorld(new THREE.Vector3(0, 0, 0.05));
    prims.push({ bone: idx(a.hand), k: 0.016, cx: pc.x, cy: pc.y, cz: pc.z, br: 0.06, f: (x, y, z) => {
      const lx = inv[0] * x + inv[4] * y + inv[8] * z + inv[12], ly = inv[1] * x + inv[5] * y + inv[9] * z + inv[13], lz = inv[2] * x + inv[6] * y + inv[10] * z + inv[14];
      return (Math.hypot(lx / 0.046, ly / 0.019, (lz - 0.05) / 0.054) - 1) * 0.019;
    } });
    a.fingers.forEach((fg, f) => {
      const len = fg.base.userData.len as number, r = f === 0 ? 0.0118 : 0.0108;
      fg.base.getWorldPosition(_p); fg.kn.getWorldPosition(_q);
      cone(fg.base, _p.clone(), _q.clone(), r, r * 0.94, 0.006);
      const tip = fg.kn.localToWorld(new THREE.Vector3(0, 0, len * 0.5));
      cone(fg.kn, _q.clone(), tip, r * 0.94, r * 0.82, 0.004);
    });
  });

  const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  const field = (x: number, y: number, z: number) => {
    let d = 1;
    for (const p of prims) {
      const dx = x - p.cx, dy = y - p.cy, dz = z - p.cz, lim = p.br + 0.09;
      if (dx * dx + dy * dy + dz * dz > lim * lim) continue;
      d = smin(d, p.f(x, y, z), p.k);
    }
    return d;
  };

  // ---------------------------------------------------------- surface nets
  const H = 0.005, B = 4;
  const x0 = -1.07, y0 = -0.83, z0 = -0.2;
  const nbx = Math.ceil(2.14 / (H * B)), nby = Math.ceil(1.2 / (H * B)), nbz = Math.ceil(0.4 / (H * B));
  const nx = nbx * B + 1, ny = nby * B + 1, nz = nbz * B + 1;
  const vals = new Float32Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
  const active: number[] = [];
  for (let bz = 0; bz < nbz; bz++) for (let by = 0; by < nby; by++) for (let bx = 0; bx < nbx; bx++) {
    const d = field(x0 + (bx + 0.5) * B * H, y0 + (by + 0.5) * B * H, z0 + (bz + 0.5) * B * H);
    if (Math.abs(d) < B * H * 0.87 + 0.012) { active.push(bx, by, bz); continue; }
    for (let k = bz * B; k <= bz * B + B; k++) for (let j = by * B; j <= by * B + B; j++) for (let i = bx * B; i <= bx * B + B; i++) vals[at(i, j, k)] = d;
  }
  for (let n = 0; n < active.length; n += 3) {
    const bx = active[n], by = active[n + 1], bz = active[n + 2];
    for (let k = bz * B; k <= bz * B + B; k++) for (let j = by * B; j <= by * B + B; j++) for (let i = bx * B; i <= bx * B + B; i++) vals[at(i, j, k)] = field(x0 + i * H, y0 + j * H, z0 + k * H);
  }
  const cx = nx - 1, cy = ny - 1;
  const cellV = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const cat = (i: number, j: number, k: number) => (k * cy + j) * cx + i;
  const pos: number[] = [];
  const corner = new Float32Array(8);
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let n = 0; n < active.length; n += 3) {
    const bx = active[n], by = active[n + 1], bz = active[n + 2];
    for (let k = bz * B; k < bz * B + B; k++) for (let j = by * B; j < by * B + B; j++) for (let i = bx * B; i < bx * B + B; i++) {
      let neg = 0;
      for (let c = 0; c < 8; c++) { const v = vals[at(i + (c & 1), j + ((c >> 1) & 1), k + (c >> 2))]; corner[c] = v; if (v < 0) neg++; }
      if (neg === 0 || neg === 8) continue;
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      for (const [a, b] of EDGES) {
        const va = corner[a], vb = corner[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t;
        cnt++;
      }
      cellV[cat(i, j, k)] = pos.length / 3;
      pos.push(x0 + (i + sx / cnt) * H, y0 + (j + sy / cnt) * H, z0 + (k + sz / cnt) * H);
    }
  }
  const index: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) index.push(a, c, b, a, d, c); else index.push(a, b, c, a, c, d);
  };
  for (let n = 0; n < active.length; n += 3) {
    const bx = active[n], by = active[n + 1], bz = active[n + 2];
    for (let k = bz * B; k < bz * B + B; k++) for (let j = by * B; j < by * B + B; j++) for (let i = bx * B; i < bx * B + B; i++) {
      const v0 = vals[at(i, j, k)];
      if (j > 0 && k > 0 && (v0 < 0) !== (vals[at(i + 1, j, k)] < 0)) quad(cellV[cat(i, j - 1, k - 1)], cellV[cat(i, j, k - 1)], cellV[cat(i, j, k)], cellV[cat(i, j - 1, k)], v0 > 0);
      if (i > 0 && k > 0 && (v0 < 0) !== (vals[at(i, j + 1, k)] < 0)) quad(cellV[cat(i - 1, j, k - 1)], cellV[cat(i - 1, j, k)], cellV[cat(i, j, k)], cellV[cat(i, j, k - 1)], v0 > 0);
      if (i > 0 && j > 0 && (v0 < 0) !== (vals[at(i, j, k + 1)] < 0)) quad(cellV[cat(i - 1, j - 1, k)], cellV[cat(i, j - 1, k)], cellV[cat(i, j, k)], cellV[cat(i - 1, j, k)], v0 > 0);
    }
  }

  // ---------------------------------------------------------- ties to the bones
  const nv = pos.length / 3;
  const skinIndex = new Uint16Array(nv * 4), skinWeight = new Float32Array(nv * 4);
  const dist = new Float32Array(bones.length);
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    dist.fill(9);
    let dmin = 9;
    for (const p of prims) {
      const dx = x - p.cx, dy = y - p.cy, dz = z - p.cz, lim = p.br + 0.09;
      if (dx * dx + dy * dy + dz * dz > lim * lim) continue;
      const d = p.f(x, y, z);
      if (d < dist[p.bone]) dist[p.bone] = d;
      if (d < dmin) dmin = d;
    }
    let total = 0;
    for (let s = 0; s < 4; s++) {
      let best = -1, bw = 0;
      for (let b = 0; b < bones.length; b++) {
        if (dist[b] > 8) continue;
        const w = Math.max(0, 1 - (dist[b] - dmin) / blend[b]);
        if (w * w > bw) { bw = w * w; best = b; }
      }
      if (best < 0) break;
      skinIndex[v * 4 + s] = best; skinWeight[v * 4 + s] = bw; total += bw;
      dist[best] = 9;
    }
    if (total <= 0) { skinWeight[v * 4] = 1; total = 1; }
    for (let s = 0; s < 4; s++) skinWeight[v * 4 + s] /= total;
  }

  // ---------------------------------------------------------- the face, and the finished surface
  const P = new Float32Array(pos);
  const tv = new THREE.Vector3();
  for (let v = 0; v < nv; v++) { tv.set(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); shapeHead(tv); P[v * 3] = tv.x; P[v * 3 + 1] = tv.y; P[v * 3 + 2] = tv.z; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('lp', new THREE.BufferAttribute(P.slice(), 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1));
  g.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(g, material);
  mesh.frustumCulled = false;
  mesh.bind(new THREE.Skeleton(bones), new THREE.Matrix4());
  return { mesh, skel, body, head, arms, vertices: nv };
}
