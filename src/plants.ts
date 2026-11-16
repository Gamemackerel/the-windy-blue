// Plants, grown rather than scattered. Every plant is built the way the real
// thing is put together: stems that arch and droop under their own weight,
// leaves set alternately along them and turned to the light, fronds made of
// pinnae, big blades springing from a crown. All of it is instanced, moves in
// the wind, and lets the sun through.
import * as THREE from 'three';
import { rng } from './noise';

export type PlantKind = 'canopy' | 'bush' | 'vine' | 'fern' | 'broad' | 'tomato' | 'squash' | 'greens';
export interface Clump { x: number; y: number; z: number; r: number; n: number; kind?: PlantKind; /** height of the ground it grows from */ g?: number }

const sway = { t: { value: 0 }, w: { value: 0.4 } };
/** call every frame: time, and the wind's strength in m/s */
export function floraTick(t: number, wind: number) { sway.t.value = t; sway.w.value = 0.3 + Math.min(1.8, wind / 8); }

// ------------------------------------------------------------------ leaves
function grid(nw: number, nl: number, f: (u: number, v: number, out: THREE.Vector3) => void) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [], p = new THREE.Vector3();
  for (let j = 0; j <= nl; j++) for (let i = 0; i <= nw; i++) { f(i / nw, j / nl, p); pos.push(p.x, p.y, p.z); uv.push(i / nw, j / nl); }
  for (let j = 0; j < nl; j++) for (let i = 0; i < nw; i++) { const a = j * (nw + 1) + i, b = a + 1, c = a + nw + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** a pointed leaf lying along +Z, one unit long, folded a little along its midrib and bowing toward the tip */
const bladeGeo = () => grid(4, 7, (u, v, o) => {
  const half = 0.27 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.72)), 0.8) + 0.004, x = (u - 0.5) * 2 * half;
  o.set(x, Math.abs(x) * 0.38 - v * v * 0.22, v);
});
/** a long arching blade with a rippled edge, torn here and there: banana, bird of paradise */
const broadGeo = () => grid(4, 14, (u, v, o) => {
  const half = 0.16 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.55)), 0.6) * (1 + 0.07 * Math.sin(v * 43)) + 0.004, x = (u - 0.5) * 2 * half;
  o.set(x, Math.sin(v * 2.8) * 0.13 - v * v * 0.5 + Math.abs(x) * 0.3 + Math.sin(v * 31 + u * 4) * 0.012 * Math.abs(u - 0.5), v);
});
/** a round, lobed, cupped leaf on the end of its stalk: squash, nasturtium */
const roundGeo = () => grid(14, 4, (u, v, o) => {
  const th = (u - 0.5) * Math.PI * 2, rho = v;
  const R = 0.5 * (1 + 0.12 * Math.cos(5 * th)) * (1 - 0.4 * Math.exp(-(Math.PI - Math.abs(th)) * (Math.PI - Math.abs(th)) * 6));
  o.set(Math.sin(th) * rho * R, rho * rho * 0.14 + Math.sin(th * 5) * 0.02 * rho, 0.5 + Math.cos(th) * rho * R);
});
/** a fern frond: a drooping midrib carrying two rows of leaflets that shorten toward the tip */
function frondGeo() {
  const pos: number[] = [], uv: number[] = [];
  const y = (v: number) => Math.sin(v * 2.4) * 0.16 - v * v * 0.52;
  const N = 20;
  for (let k = 0; k < N; k++) {
    const v0 = k / N, v1 = (k + 1) / N;
    pos.push(-0.006, y(v0), v0, 0.006, y(v0), v0, 0.006, y(v1), v1, -0.006, y(v0), v0, 0.006, y(v1), v1, -0.006, y(v1), v1);
    uv.push(0.5, v0, 0.5, v0, 0.5, v1, 0.5, v0, 0.5, v1, 0.5, v1);
    const v = (k + 0.6) / N, len = 0.3 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.7)), 0.8) + 0.015, w = 0.5 / N;
    for (const s of [-1, 1]) {
      const tx = s * len * 0.86, tz = v + len * 0.34, ty = y(v) - len * 0.3;
      if (s > 0) pos.push(0, y(v - w), v - w, 0, y(v + w), v + w, tx, ty, tz); else pos.push(0, y(v + w), v + w, 0, y(v - w), v - w, tx, ty, tz);
      uv.push(0.5, v, 0.5, v, 0.5 + s * 0.5, v);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

let mat: THREE.MeshStandardMaterial | null = null, stemMat: THREE.MeshStandardMaterial | null = null;
function leafMaterial() {
  if (mat) return mat;
  mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFloraT = sway.t; sh.uniforms.uFloraW = sway.w;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uFloraT;\nuniform float uFloraW;\nvarying vec2 vLeaf;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLeaf = uv;
        #ifdef USE_INSTANCING
          // each leaf nods and twists on its own stalk, more toward the tip, and all of them lean together in the gusts
          vec3 ip = vec3(instanceMatrix[3]);
          float ph = dot(ip, vec3(1.31, 0.73, 1.87)), tip = uv.y * uv.y;
          float gust = sin(uFloraT * 0.6 + ip.x * 0.11 + ip.z * 0.07) * 0.5 + 0.5;
          transformed.y += (sin(uFloraT * 1.9 + ph) * 0.045 + sin(uFloraT * 4.3 + ph * 1.7) * 0.012) * tip * uFloraW * (0.5 + gust);
          transformed.x += sin(uFloraT * 2.6 + ph * 2.3) * 0.03 * tip * uFloraW * (0.4 + gust);
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vLeaf;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float ax = abs(vLeaf.x - 0.5);
          float midrib = 1.0 - smoothstep(0.0, 0.03, ax);
          float veins = (1.0 - smoothstep(0.0, 0.16, abs(fract(vLeaf.y * 7.0 - ax * 3.2) - 0.5))) * smoothstep(0.02, 0.1, ax);
          diffuseColor.rgb *= 0.86 + 0.34 * vLeaf.y;                                                   // younger and paler toward the tip
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.35, 1.3, 0.75), midrib * 0.55);
          diffuseColor.rgb *= 1.0 - veins * 0.16;
          diffuseColor.rgb *= 0.92 + 0.16 * smoothstep(0.0, 0.45, ax);
          if (!gl_FrontFacing) diffuseColor.rgb *= vec3(0.8, 0.9, 0.78);                               // the dull underside
        }`)
      .replace('#include <opaque_fragment>', `
        #if NUM_DIR_LIGHTS > 0
          // sunlight coming through the leaf from behind
          outgoingLight += diffuseColor.rgb * vec3(1.15, 1.2, 0.45) * directionalLights[0].color * max(dot(-normal, directionalLights[0].direction), 0.0) * 0.22;
        #endif
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'flora-leaf';
  return mat;
}

// ------------------------------------------------------------------ growing
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const GREENS = ['#3f9a3a', '#2f7a2a', '#6fb04a', '#1f5c2a', '#57a83c', '#3a8a44'];

class Batch {
  m: number[] = []; c: number[] = [];
  constructor(readonly geo: THREE.BufferGeometry, readonly material: THREE.Material, readonly shadow: boolean) {}
  /** set down with local +Z along dir and local +Y as near to up as that allows */
  put(o: THREE.Vector3, dir: THREE.Vector3, up: THREE.Vector3, sx: number, sy: number, sz: number, col: THREE.Color) {
    _z.copy(dir).normalize();
    _x.crossVectors(up, _z);
    if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
    _x.normalize();
    _y.crossVectors(_z, _x);
    _m.makeBasis(_x, _y, _z).scale(_s.set(sx, sy, sz)).setPosition(o);
    for (let k = 0; k < 16; k++) this.m.push(_m.elements[k]);
    this.c.push(col.r, col.g, col.b);
  }
  build(scene: THREE.Object3D) {
    const n = this.c.length / 3;
    if (!n) return;
    const inst = new THREE.InstancedMesh(this.geo, this.material, n);
    (inst.instanceMatrix.array as Float32Array).set(this.m);
    inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.c), 3);
    inst.castShadow = this.shadow; inst.receiveShadow = true;
    inst.frustumCulled = false;
    scene.add(inst);
  }
}

/** grow every clump into a plant of its kind and add the lot to the scene */
export function growPlants(scene: THREE.Object3D, clumps: Clump[], seed: number, size = 0.5) {
  const r = rng(seed);
  const lm = leafMaterial();
  stemMat ??= new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 });
  const stemGeo = new THREE.CylinderGeometry(0.7, 1, 1, 5, 1, true); stemGeo.translate(0, 0.5, 0); stemGeo.rotateX(Math.PI / 2);   // along +Z, like the leaves
  const blade = new Batch(bladeGeo(), lm, true), broad = new Batch(broadGeo(), lm, true), round = new Batch(roundGeo(), lm, true), frond = new Batch(frondGeo(), lm, true);
  const stems = new Batch(stemGeo, stemMat, false);
  const o = new THREE.Vector3(), d = new THREE.Vector3(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), side = new THREE.Vector3(), ld = new THREE.Vector3(), up = new THREE.Vector3();
  const green = (k = 1, warm = 0) => _c.set(GREENS[(r() * GREENS.length) | 0]).multiplyScalar((0.5 + r() * 0.6) * k).offsetHSL(-warm * 0.04, 0, 0).clone();
  const woody = () => new THREE.Color().setRGB(0.16 + r() * 0.06, 0.2 + r() * 0.08, 0.07);
  const dirFrom = (az: number, el: number, out: THREE.Vector3) => out.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));

  /** a stem from o along dir that sags with its length, with leaves set alternately along it */
  const spray = (from: THREE.Vector3, dir: THREE.Vector3, len: number, sag: number, thick: number, nLeaves: number, leaf: number, col: THREE.Color, b: Batch = blade) => {
    const SEG = 4;
    p0.copy(from);
    side.crossVectors(dir, UP); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
    for (let k = 1; k <= SEG; k++) {
      const u = k / SEG;
      p1.copy(from).addScaledVector(dir, len * u); p1.y -= sag * u * u;
      d.subVectors(p1, p0);
      const sl = d.length();
      stems.put(p0, d, UP, thick * (1.15 - u * 0.7), thick * (1.15 - u * 0.7), sl, woody());
      // leaves on this stretch
      const per = Math.max(1, Math.round(nLeaves / SEG));
      for (let j = 0; j < per; j++) {
        const w = (j + 0.5 + (r() - 0.5) * 0.4) / per, sgn = ((k * per + j) & 1) ? 1 : -1;
        o.copy(p0).addScaledVector(d, w);
        ld.copy(d).normalize().multiplyScalar(0.55).addScaledVector(side, sgn * (0.7 + r() * 0.4)); ld.y += 0.1 + r() * 0.25 - u * 0.2;
        up.copy(UP).addScaledVector(side, sgn * 0.35);
        const s = leaf * (0.65 + r() * 0.6) * (1.05 - u * 0.25);
        b.put(o, ld, up, s, s, s, col.clone().multiplyScalar(0.8 + r() * 0.4));
      }
      p0.copy(p1);
    }
    // one at the very end, pointing on along the stem
    b.put(p1, d, UP, leaf * 0.8, leaf * 0.8, leaf * 0.8, col.clone().multiplyScalar(1.15));
  };

  for (const c of clumps) {
    const kind: PlantKind = c.kind ?? (c.r > 1.2 ? 'canopy' : 'bush');
    const ground = c.g ?? c.y - c.r * 0.6;
    if (kind === 'canopy') {
      // boughs out from the middle of the crown in every direction, more up and out than down
      const T = THREE.MathUtils.clamp(Math.round(c.n / 5.5), 8, 110), col = green();
      for (let i = 0; i < T; i++) {
        const az = r() * 6.283, el = Math.asin(THREE.MathUtils.clamp(r() * 1.5 - 0.45, -0.9, 0.95));
        dirFrom(az, el, d);
        o.set(c.x + d.x * c.r * 0.15, c.y + d.y * c.r * 0.1, c.z + d.z * c.r * 0.15);
        const L = c.r * (0.7 + r() * 0.5);
        spray(o.clone(), d.clone(), L, L * (0.22 + r() * 0.2), 0.018 + c.r * 0.008, 12, size * 1.5, col.clone().multiplyScalar(0.8 + r() * 0.45));
      }
    } else if (kind === 'bush') {
      const T = THREE.MathUtils.clamp(Math.round(c.n / 8), 3, 12), col = green();
      for (let i = 0; i < T; i++) {
        const az = (i / T) * 6.283 + r() * 0.8, el = 0.55 + r() * 0.75;
        dirFrom(az, el, d);
        o.set(c.x + (r() - 0.5) * c.r * 0.3, ground, c.z + (r() - 0.5) * c.r * 0.3);
        const L = c.r * (1.1 + r() * 0.6);
        spray(o.clone(), d.clone(), L, L * (0.3 + r() * 0.3), 0.014, 9, size * 1.0, col.clone().multiplyScalar(0.8 + r() * 0.45));
      }
    } else if (kind === 'vine') {
      // a few trailing shoots that hang and curl outward
      const col = green(0.95);
      for (let i = 0; i < 3; i++) {
        dirFrom(r() * 6.283, -0.5 - r() * 0.7, d);
        o.set(c.x, c.y + c.r * 0.5, c.z);
        const L = c.r * (1.6 + r() * 1.2);
        spray(o.clone(), d.clone(), L, L * 0.25, 0.008, 6, size * 0.5, col.clone().multiplyScalar(0.8 + r() * 0.4));
      }
    } else if (kind === 'fern') {
      // a shuttlecock of fronds from one crown
      const N = 8 + ((r() * 6) | 0), col = green(0.9), L0 = c.r * 1.7;
      o.set(c.x, ground, c.z);
      for (let i = 0; i < N; i++) {
        dirFrom((i / N) * 6.283 + r() * 0.5, 0.45 + r() * 0.65, d);
        const L = L0 * (0.75 + r() * 0.5);
        frond.put(o, d, UP, L, L, L, col.clone().multiplyScalar(0.75 + r() * 0.5));
      }
    } else if (kind === 'broad') {
      // great blades unfurling from a short thick stalk
      const N = 6 + ((r() * 4) | 0), col = green(1.0), h = c.r * (0.5 + r() * 0.5);
      o.set(c.x, ground, c.z);
      stems.put(o, UP, new THREE.Vector3(1, 0, 0), 0.07 + c.r * 0.03, 0.07 + c.r * 0.03, h, new THREE.Color(0.22, 0.3, 0.1));
      o.y += h;
      for (let i = 0; i < N; i++) {
        dirFrom((i / N) * 6.283 + r() * 0.6, 0.6 + r() * 0.7, d);
        const L = c.r * (1.9 + r() * 1.3);
        broad.put(o, d, UP, L, L, L, col.clone().multiplyScalar(0.8 + r() * 0.4));
      }
    } else if (kind === 'tomato') {
      // one stem tied up a stake, with side shoots of five leaflets all the way up
      const h = Math.max(0.8, (c.y - ground) * 1.75), col = green(0.9), SEG = 6;
      p0.set(c.x, ground, c.z);
      for (let k = 1; k <= SEG; k++) {
        p1.set(c.x + Math.sin(k * 1.7) * 0.03, ground + (h * k) / SEG, c.z + Math.cos(k * 2.3) * 0.03);
        d.subVectors(p1, p0);
        stems.put(p0.clone(), d, new THREE.Vector3(1, 0, 0), 0.014, 0.014, d.length(), new THREE.Color(0.2, 0.34, 0.1));
        p0.copy(p1);
      }
      const shoots = Math.round(h / 0.07);
      for (let i = 0; i < shoots; i++) {
        const u = (i + 0.5) / shoots;
        dirFrom(i * 2.4 + r() * 0.5, 0.15 + r() * 0.5, d);
        o.set(c.x, ground + 0.15 + (h - 0.15) * u, c.z);
        const L = (0.3 + r() * 0.24) * (1.1 - u * 0.4);
        spray(o.clone(), d.clone(), L, L * 0.35, 0.006, 6, size * 0.75, col.clone().multiplyScalar(0.8 + r() * 0.4));
      }
    } else if (kind === 'squash') {
      // big round leaves held up on hollow stalks, sprawling outward
      const N = 7 + ((r() * 4) | 0), col = green(0.95);
      for (let i = 0; i < N; i++) {
        const az = (i / N) * 6.283 + r() * 0.7, reach = 0.12 + r() * c.r * 1.1, hgt = 0.16 + r() * 0.3;
        o.set(c.x, ground, c.z);
        p1.set(c.x + Math.cos(az) * reach, ground + hgt, c.z + Math.sin(az) * reach);
        d.subVectors(p1, o);
        stems.put(o.clone(), d, UP, 0.011, 0.011, d.length(), new THREE.Color(0.24, 0.38, 0.12));
        dirFrom(az, 0.25 + r() * 0.3, ld);
        const s = size * (1.25 + r() * 0.7);
        round.put(p1, ld, UP, s, s, s, col.clone().multiplyScalar(0.8 + r() * 0.4));
      }
    } else if (kind === 'greens') {
      // a head of salad: broad soft leaves in a rosette
      const N = 11, col = green(1.15);
      o.set(c.x, ground, c.z);
      for (let i = 0; i < N; i++) {
        dirFrom(i * 2.4, 0.35 + (i / N) * 0.9, d);
        const s = size * (0.75 + r() * 0.35) * (1.1 - (i / N) * 0.4);
        blade.put(o, d, UP, s * 2.0, s, s, col.clone().multiplyScalar(0.8 + r() * 0.4));
      }
    }
  }
  for (const b of [blade, broad, round, frond, stems]) b.build(scene);
}
