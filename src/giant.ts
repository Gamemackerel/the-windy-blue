// The atoll and the giant that lives in its blue hole.
//
// The giant is modelled at human scale inside a group scaled up by S, so its
// proportions can be reasoned about in ordinary metres. All motion is
// procedural: springs on the hands and head driven by a small behaviour
// machine, so it always has follow-through and weight.
import * as THREE from 'three';
import { Ctx } from './ctx';
import { Builder } from './build';
import { MAT, patch } from './materials';
import { fbm, smooth, rng } from './noise';
import { calmZones, bumps } from './waves';
import { NOISE_GLSL } from './env';
import { CHART_GAPS } from './items';
import { solveIK } from './figure';
import { softDot } from './npc';
import { CylCollider } from './world';

export const ATOLL = { x: -100, z: 800, r: 200, hole: 78 };
const S = 250;                 // metres per model unit
const DEATH_BEARING = 3.55;    // where on the reef it comes to rest
const UARM = 0.42, FARM = 0.4;

const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function atollLocal(lx: number, lz: number) {
  const d = Math.hypot(lx, lz), a = Math.atan2(lx, lz);
  const R = ATOLL.r, W = 24;
  let gap = 0;
  for (const g of CHART_GAPS) gap = Math.max(gap, 1 - smooth(0.085, 0.2, Math.abs(angDiff(a, g))));
  const ring = Math.exp(-(((d - R) / W) ** 2));
  let base = d > R ? -9 - (d - R) * 0.14 : -7;
  base -= (1 - smooth(ATOLL.hole * 0.72, ATOLL.hole * 1.1, d)) * 60;
  const crest = 11.6 + (fbm(lx * 0.03 + 3, lz * 0.03 + 8) - 0.5) * 5 + (fbm(lx * 0.11, lz * 0.11) - 0.5) * 1.6;
  return base + ring * crest * (1 - gap);
}
export const atollHeight = (x: number, z: number) => atollLocal(x - ATOLL.x, z - ATOLL.z);

type Phase = 'asleep' | 'emerge' | 'watch' | 'peer' | 'scoop' | 'slap' | 'blow' | 'bored' | 'stargaze' | 'dying' | 'dead';

export function buildAtoll(ctx: Ctx, hooks: { wreck: () => void; push: (ax: number, az: number) => void }) {
  const { scene, world, state, boat } = ctx;
  const cx = ATOLL.x, cz = ATOLL.z;
  world.addTerrain(atollHeight, cx, cz, 320);
  calmZones.push({ x: cx, z: cz, r0: 215, r1: 400 });

  // ------------------------------------------------------------ the reef
  {
    const N = 190, SIZE = 560;
    const pos = new Float32Array((N + 1) * (N + 1) * 3), hs = new Float32Array((N + 1) * (N + 1));
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const lx = (i / N - 0.5) * SIZE, lz = (j / N - 0.5) * SIZE, k = j * (N + 1) + i;
      hs[k] = atollLocal(lx, lz);
      pos[k * 3] = cx + lx; pos[k * 3 + 1] = hs[k]; pos[k * 3 + 2] = cz + lz;
    }
    const idx: number[] = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, c = a + 1, d = a + N + 1, e = d + 1;
      if (Math.max(hs[a], hs[c], hs[d], hs[e]) < -5) continue;
      idx.push(a, d, c, c, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = patch(new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.95 }), /* glsl */ `
      float n = tri(wp, wn, 0.5); float f = fbm(wp.xz * 6.0);
      vec3 sand = mix(vec3(0.42, 0.4, 0.34), vec3(0.62, 0.6, 0.53), fbm(wp.xz * 0.6)) * (0.85 + 0.3 * f);
      vec3 coral = mix(vec3(0.03, 0.03, 0.032), vec3(0.13, 0.12, 0.11), n) * (0.7 + 0.6 * f);
      col = mix(coral, sand, smoothstep(0.9, 2.0, wp.y + n * 1.2) * smoothstep(0.5, 0.2, 1.0 - wn.y));
      float wet = smoothstep(0.7, -0.1, wp.y); col *= mix(1.0, 0.45, wet); rough = mix(0.95, 0.3, wet);
      bump = tri3(wp, wn, 2.5) * 0.05 + tri3(wp, wn, 13.0) * 0.01;`, 'reef');
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);

    // bleached trees and a broken jetty with somewhere to tie up
    const r = rng(404);
    for (let i = 0; i < 26; i++) {
      const a = r() * 6.283, d = ATOLL.r + (r() - 0.5) * 16;
      const lx = Math.sin(a) * d, lz = Math.cos(a) * d, h = atollLocal(lx, lz);
      if (h < 1.2) continue;
      const hgt = 3 + r() * 5;
      const pts = [0, 1, 2, 3].map((k) => new THREE.Vector3(cx + lx + Math.sin(k + i) * 0.4 * k, h - 0.3 + (hgt * k) / 3, cz + lz + Math.cos(k * 2 + i) * 0.3 * k));
      const tree = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.13 + r() * 0.1, 6), MAT.bone);
      tree.castShadow = true;
      scene.add(tree);
      world.addCyl(cx + lx, cz + lz, 0.3, h - 1, h + 2);
    }
    const ja = 1.55, b = new Builder(scene, world, cx, 0, cz);
    const jx = Math.sin(ja), jz = Math.cos(ja);
    for (let k = 0; k < 7; k++) {
      const d = ATOLL.r - 6 - k * 2.2;
      b.box(jx * d, 0.85, jz * d, 2.4, 0.14, 2.0, MAT.paleWood, ja);
      if (k % 2 === 0) for (const s of [-1, 1]) b.cyl(jx * d + jz * s * 1.1, jz * d - jx * s * 1.1, 0.12, -3, 1.3, MAT.wood, false, 0.12, 6);
    }
    world.moorings.push({ name: 'atoll', x: cx + jx * (ATOLL.r - 26), z: cz + jz * (ATOLL.r - 26), psi: ja + Math.PI / 2, dock: new THREE.Vector3(cx + jx * (ATOLL.r - 19), 0.93, cz + jz * (ATOLL.r - 19)) });
  }

  // ----------------------------------------------------------- the giant
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const lean = new THREE.Group();
  lean.position.y = -0.4 * S;
  const rig = new THREE.Group();
  rig.position.y = 0.4 * S;
  rig.scale.setScalar(S);
  root.add(lean); lean.add(rig);
  scene.add(root);
  const flesh = new THREE.Group(), bones = new THREE.Group();
  rig.add(flesh, bones);

  const rot = { value: 0 };
  // Skin: the pattern is baked to the body (attribute lp) so it never slides as
  // the giant moves. Wet, faintly translucent at the edges, veined and mottled.
  const skin = new THREE.MeshPhysicalMaterial({ color: '#8b999c', roughness: 0.5, clearcoat: 0.55, clearcoatRoughness: 0.28 });
  skin.onBeforeCompile = (sh) => {
    sh.uniforms.uRot = rot;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 lp;\nvarying vec3 vLp;\nvarying float vWY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLp = lp * 250.0;\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vLp;\nvarying float vWY;\nuniform float uRot;\n${NOISE_GLSL}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float wwBump = 0.0;
        {
          vec3 p = vLp;
          float big = fbm(p.xz * 0.02 + p.y * 0.017), mid = fbm(p.xy * 0.09 + p.z * 0.05), fine = fbm(p.yz * 0.5 + p.x * 0.4);
          float pore = vnoise(p.xy * 0.9 + p.z * 0.7);
          // branching veins: thin dark lines where two noise fields cross
          float vein = 1.0 - smoothstep(0.0, 0.035, abs(fbm(p.xy * 0.035 + p.z * 0.02 + 7.0) - 0.5));
          vein *= smoothstep(0.35, 0.6, mid);
          vec3 col = diffuseColor.rgb * (0.7 + 0.42 * big) * (0.86 + 0.28 * fine) * (0.95 + 0.1 * pore);
          col = mix(col, col * vec3(0.5, 0.58, 0.7), smoothstep(0.5, 0.7, mid) * 0.45);     // bruised mottling
          col = mix(col, vec3(0.16, 0.2, 0.27), vein * 0.5);
          float wet = smoothstep(14.0, -2.0, vWY);
          col *= mix(1.0, 0.55, wet);                                                        // dark and wet toward the waterline
          vec3 rotCol = mix(vec3(0.07, 0.11, 0.04), vec3(0.3, 0.36, 0.14), mid);
          rotCol = mix(rotCol, vec3(0.42, 0.4, 0.33), smoothstep(0.62, 0.75, big) * 0.7);    // sloughed pale patches
          rotCol = mix(rotCol, vec3(0.03, 0.02, 0.02), smoothstep(0.6, 0.8, fine) * 0.5);
          diffuseColor.rgb = mix(col, rotCol, uRot);
          roughnessFactor = mix(0.3 + 0.25 * fine - wet * 0.12, 0.85, uRot);
          wwBump = (fine * 0.5 + pore * 0.12 - vein * 0.25 + smoothstep(0.55, 0.8, big) * uRot * 2.0);
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 dpdx = dFdx(vViewPosition), dpdy = dFdy(vViewPosition);
          float dhx = dFdx(wwBump), dhy = dFdy(wwBump);
          vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          vec3 wwN = abs(det) * normal - sign(det) * (dhx * r1 + dhy * r2) * 0.22;
          if (dot(wwN, wwN) > 1e-20) normal = normalize(wwN);
        }`)
      .replace('#include <opaque_fragment>', `
        {
          // light bleeding round the edges of something this large and soft
          float rim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
          #if NUM_DIR_LIGHTS > 0
            float back = pow(clamp(dot(normalize(-vViewPosition), -directionalLights[0].direction) * 0.5 + 0.5, 0.0, 1.0), 2.0);
            outgoingLight += vec3(0.5, 0.36, 0.3) * directionalLights[0].color * rim * back * 0.16 * (1.0 - uRot);
          #endif
          outgoingLight += diffuseColor.rgb * rim * 0.1 * (1.0 - uRot);
        }
        #include <opaque_fragment>`);
  };
  skin.customProgramCacheKey = () => 'giantskin';
  /** bake the body-fixed pattern coordinates onto a piece of skin */
  const tag = <G extends THREE.BufferGeometry>(g: G, sy = 1, ox = 0, oy = 0, oz = 0) => {
    const p = g.attributes.position, a = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { a[i * 3] = p.getX(i) + ox; a[i * 3 + 1] = p.getY(i) * sy + oy; a[i * 3 + 2] = p.getZ(i) + oz; }
    g.setAttribute('lp', new THREE.BufferAttribute(a, 3));
    return g;
  };
  const boneMat = patch(new THREE.MeshStandardMaterial({ color: '#cfc8b4', roughness: 0.85 }), /* glsl */ `
    col *= 0.7 + 0.45 * tri(wp, wn, 0.06); col = mix(col, vec3(0.2, 0.19, 0.15), smoothstep(0.55, 0.8, tri(wp, wn, 0.3)) * 0.5);
    col *= mix(0.45, 1.0, smoothstep(-1.0, 5.0, wp.y));`, 'giantbone');
  const dark = new THREE.MeshStandardMaterial({ color: '#070707', roughness: 0.9 });

  // turned profiles are smoothed through a spline so the body has no facets
  const lathe = (pts: [number, number][], seg = 40) =>
    new THREE.LatheGeometry(new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(48).map((v) => (v.x = Math.max(v.x, 0.0005), v)), seg);
  // torso: shoulders that run into the neck, with collarbones and a hollow at the throat
  const torsoG = lathe([[0.001, 0.075], [0.06, 0.07], [0.12, 0.05], [0.2, 0.024], [0.25, -0.012], [0.265, -0.055], [0.25, -0.12], [0.215, -0.2], [0.176, -0.32], [0.155, -0.42], [0.172, -0.55], [0.15, -0.8]], 56);
  torsoG.scale(1, 1, 0.6);
  {
    const p = torsoG.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i); let z = p.getZ(i);
      if (z > 0) {
        z += Math.exp(-(((y + 0.012 + Math.abs(x) * 0.12) / 0.012) ** 2)) * 0.012 * smooth(0.02, 0.06, Math.abs(x)) * smooth(0.2, 0.14, Math.abs(x)); // collarbones
        z -= Math.exp(-(x * x) / 0.0006 - ((y - 0.0) ** 2) / 0.0008) * 0.012;                                                                          // throat notch
        z += Math.exp(-((Math.abs(x) - 0.09) ** 2) / 0.005 - ((y + 0.13) ** 2) / 0.006) * 0.012;                                                       // chest
        z -= Math.exp(-(x * x) / 0.0008 - ((y + 0.2) ** 2) / 0.03) * 0.008;                                                                            // sternum line
      } else z -= Math.exp(-(x * x) / 0.0006) * 0.006 * smooth(0.0, -0.1, y);                                                                         // spine furrow
      p.setZ(i, z);
    }
    torsoG.computeVertexNormals();
  }
  const torso = new THREE.Mesh(tag(torsoG), skin);
  flesh.add(torso);
  // the neck flares into the shoulders, so there is no collar edge
  const neckG = lathe([[0.046, 0.21], [0.047, 0.13], [0.051, 0.09], [0.064, 0.062], [0.095, 0.04], [0.14, 0.018], [0.17, 0.0]], 40);
  neckG.scale(1, 1, 0.8);
  const neck = new THREE.Mesh(tag(neckG, 1, 0, 0, 0.005), skin);
  neck.position.set(0, 0, 0.005);
  flesh.add(neck);
  // head
  const HEAD = new THREE.Vector3(0, 0.215, 0.02);
  const headPivot = new THREE.Group();
  headPivot.position.copy(HEAD);
  rig.add(headPivot);
  const headFlesh = new THREE.Group();
  headPivot.add(headFlesh);
  const skullGeo = () => {
    const g = new THREE.SphereGeometry(0.115, 96, 72);
    const p = g.attributes.position;
    const G = (a: number, w: number) => Math.exp(-(a * a) / w);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) / 0.115, y = p.getY(i) / 0.115, z = p.getZ(i) / 0.115;
      const jaw = Math.max(0, -y - 0.15);
      x *= (1 - jaw * 0.55) * 0.86;                         // narrow toward the chin
      x *= 1 - G(y - 0.05, 0.05) * 0.05 * (z > -0.2 ? 1 : 0); // temples
      y *= y < 0 ? 1.22 : 1.08;                             // long face
      z *= 1.04 + (z < 0 ? 0.16 * (1 - Math.abs(y)) : 0);   // long skull behind
      if (z > 0) {
        const ax = Math.abs(x);
        z -= jaw * 0.12;                                    // receding chin
        z += G(y - 0.24, 0.012) * 0.05 * (0.6 + 0.4 * Math.min(1, ax * 3));                  // brow ridge
        z -= G(ax - 0.36, 0.022) * G(y - 0.04, 0.02) * 0.17;                                 // sockets
        z += G(x, 0.005) * G(y + 0.1, 0.06) * 0.13 * (y > -0.26 ? 1 : 0.4);                  // nose
        z += G(ax - 0.07, 0.0025) * G(y + 0.27, 0.003) * 0.03;                               // nostril wings
        z -= G(ax - 0.05, 0.0008) * G(y + 0.3, 0.0008) * 0.04;                               // nostrils
        z += G(ax - 0.45, 0.03) * G(y + 0.12, 0.03) * 0.035;                                 // cheekbones
        z -= G(ax - 0.3, 0.02) * G(y + 0.45, 0.03) * 0.03;                                   // hollow cheeks
        z += G(x, 0.04) * G(y + 0.47, 0.004) * 0.035;                                        // upper lip
        z += G(x, 0.035) * G(y + 0.58, 0.004) * 0.03;                                        // lower lip
        z -= G(x, 0.07) * G(y + 0.525, 0.00035) * 0.05;                                      // the line of the mouth
        z -= G(x, 0.002) * G(y + 0.38, 0.004) * 0.012;                                       // philtrum
        z += G(x, 0.03) * G(y + 0.86, 0.02) * 0.05;                                          // chin
      }
      p.setXYZ(i, x * 0.115, y * 0.115, z * 0.115);
    }
    g.computeVertexNormals();
    return tag(g, 1, 0, 0.215, 0.02);
  };
  const sg = skullGeo();
  headFlesh.add(new THREE.Mesh(sg, skin));
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), skin); ear.scale.set(0.3, 1.1, 0.7); ear.position.set(s * 0.098, 0.0, -0.01); headFlesh.add(ear); }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0035, 6, 16, Math.PI), dark);
  mouth.rotation.set(0.5, 0, 0); mouth.position.set(0, -0.07, 0.097); mouth.scale.set(1.0, 0.1, 1); mouth.visible = false;
  headFlesh.add(mouth);
  // eyes
  const EYE_R = 0.027;
  const eyes: THREE.Group[] = [], lids: THREE.Mesh[] = [];
  const sclera = new THREE.MeshStandardMaterial({ color: '#b9c1bd', roughness: 0.12 });
  const iris = patch(new THREE.MeshStandardMaterial({ color: '#4a3418', roughness: 0.15, emissive: '#5a3a14', emissiveIntensity: 0.18 }), /* glsl */ `
    float a = atan(wp.y, wp.x); float r = length(wp.xy) / 0.02;
    col *= 0.45 + 0.9 * vnoise(vec2(a * 14.0, r * 3.0)); col = mix(col, vec3(0.02, 0.015, 0.01), smoothstep(0.72, 1.0, r) * 0.8);`, 'iris', true);
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.0415, 0.006, 0.082);
    eye.add(new THREE.Mesh(new THREE.SphereGeometry(EYE_R, 24, 18), sclera));
    const ir = new THREE.Mesh(new THREE.SphereGeometry(EYE_R * 0.66, 20, 14), iris); ir.position.z = EYE_R * 0.58; ir.scale.z = 0.7; eye.add(ir);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(EYE_R * 0.4, 16, 10), new THREE.MeshStandardMaterial({ color: '#000', roughness: 0.05 })); pu.position.z = EYE_R * 0.93; pu.scale.z = 0.36; eye.add(pu);
    const cornea = new THREE.Mesh(new THREE.SphereGeometry(EYE_R * 1.03, 24, 18), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.02, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false }));
    eye.add(cornea);
    headFlesh.add(eye); eyes.push(eye);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(EYE_R * 1.08, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), skin);
    lid.position.copy(eye.position);
    headFlesh.add(lid); lids.push(lid);
  }
  // arms and hands
  const SH = [new THREE.Vector3(0.205, -0.045, 0), new THREE.Vector3(-0.205, -0.045, 0)];
  const UPV = new THREE.Vector3(0, 1, 0);
  const limb = (r0: number, r1: number, parent: THREE.Object3D, mat: THREE.Material) => {
    const g = new THREE.CylinderGeometry(r1, r0, 1, 28, 6);
    g.translate(0, 0.5, 0);
    tag(g, 0.42, r0 * 7.0, 0, 0);
    const m = new THREE.Mesh(g, mat);
    const c0 = new THREE.Mesh(tag(new THREE.SphereGeometry(r0, 24, 16), 1, r0 * 7.0, 0, 0), mat), c1 = new THREE.Mesh(tag(new THREE.SphereGeometry(r1, 24, 16), 1, r0 * 7.0, 0.42, 0), mat);
    c1.position.y = 1;
    m.add(c0, c1);
    m.userData.caps = [c0, c1];
    parent.add(m);
    return m;
  };
  const place = (m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) => {
    _a.subVectors(b, a);
    const len = Math.max(_a.length(), 1e-4);
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(UPV, _a.multiplyScalar(1 / len));
    m.scale.set(1, len, 1);
    for (const c of m.userData.caps as THREE.Mesh[]) c.scale.set(1, 1 / len, 1);
  };
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
  interface Arm { upper: THREE.Mesh; fore: THREE.Mesh; hand: THREE.Group; fingers: THREE.Group[]; elbow: THREE.Vector3; wrist: THREE.Vector3; pos: THREE.Vector3; vel: THREE.Vector3; target: THREE.Vector3; flat: number; flatT: number; curl: number; curlT: number; k: number; c: number; bUpper: THREE.Mesh; bFore: THREE.Mesh }
  const arms: Arm[] = SH.map((sh, i) => {
    const s = i === 0 ? 1 : -1;
    const hand = new THREE.Group();
    const pg = new THREE.SphereGeometry(0.05, 24, 16);
    pg.scale(0.9, 0.3, 1.05);
    const palm = new THREE.Mesh(tag(pg, 1, 0.3, 0.2, 0.1), skin);
    palm.position.z = 0.048;
    hand.add(palm);
    const fingers: THREE.Group[] = [];
    for (let f = 0; f < 5; f++) {
      const thumb = f === 0;
      const fg = new THREE.Group();
      fg.position.set(thumb ? s * -0.045 : s * (-0.032 + (f - 1) * 0.0215), 0, thumb ? 0.03 : 0.098);
      fg.rotation.y = thumb ? s * -1.0 : (f - 2.5) * 0.06 * s;
      const len = thumb ? 0.05 : 0.075 - Math.abs(f - 2.4) * 0.008;
      const p1 = new THREE.Mesh(tag(new THREE.CapsuleGeometry(0.0095, len * 0.55, 4, 12), 1, 0.1 * f, 0.3, 0.2), skin); p1.rotation.x = Math.PI / 2; p1.position.z = len * 0.3;
      const kn = new THREE.Group(); kn.position.z = len * 0.62;
      const p2 = new THREE.Mesh(tag(new THREE.CapsuleGeometry(0.0085, len * 0.45, 4, 12), 1, 0.1 * f, 0.35, 0.2), skin); p2.rotation.x = Math.PI / 2; p2.position.z = len * 0.25;
      kn.add(p2); fg.add(p1, kn); fg.userData.kn = kn;
      hand.add(fg); fingers.push(fg);
    }
    flesh.add(hand);
    const rest = new THREE.Vector3(s * 0.3, -0.76, 0.06);
    return {
      upper: limb(0.056, 0.042, flesh, skin), fore: limb(0.042, 0.03, flesh, skin), hand, fingers,
      elbow: new THREE.Vector3(), wrist: new THREE.Vector3(), pos: rest.clone(), vel: new THREE.Vector3(), target: rest.clone(),
      flat: 0, flatT: 0, curl: 0.5, curlT: 0.5, k: 6, c: 4.2,
      bUpper: limb(0.016, 0.013, bones, boneMat), bFore: limb(0.013, 0.01, bones, boneMat),
    };
  });
  const REST = arms.map((a) => a.target.clone());

  // skeleton
  {
    const skull = new THREE.Group();
    skull.add(new THREE.Mesh(sg, boneMat));
    for (const s of [-1, 1]) { const so = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), dark); so.position.set(s * 0.0415, 0.006, 0.083); skull.add(so); }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.03, 3), dark); nose.position.set(0, -0.022, 0.118); nose.rotation.x = 0.1; skull.add(nose);
    const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 8, 20, Math.PI), boneMat); jaw.rotation.set(Math.PI / 2 + 0.5, 0, 0); jaw.position.set(0, -0.11, 0.03); skull.add(jaw);
    for (let t = 0; t < 12; t++) { const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.004), boneMat); const a = (t / 11 - 0.5) * 1.6; tooth.position.set(Math.sin(a) * 0.045, -0.083, 0.06 + Math.cos(a) * 0.04); skull.add(tooth); }
    headPivot.add(skull);
    bones.userData.skull = skull;
    for (let v = 0; v < 26; v++) {
      const y = 0.1 - v * 0.034;
      const vert = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.022, 10), boneMat);
      vert.position.set(0, y, -0.08);
      const spur = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.012, 0.022), boneMat); spur.position.set(0, y - 0.004, -0.1); spur.rotation.x = 0.5;
      bones.add(vert, spur);
    }
    for (let k = 0; k < 11; k++) {
      const y = -0.035 - k * 0.036;
      const size = 0.8 + 0.3 * Math.sin((k / 10) * Math.PI * 0.9 + 0.3);
      const a = 0.175 * size, bz = 0.105 * size;
      for (const s of [-1, 1]) {
        const pts: THREE.Vector3[] = [];
        const end = k > 7 ? 0.72 : 0.93; // the lowest ribs float free
        for (let j = 0; j <= 14; j++) { const ph = (j / 14) * Math.PI * end; pts.push(new THREE.Vector3(s * a * Math.sin(ph), y - 0.035 * Math.sin(ph * 0.5), -0.08 + bz * (1 - Math.cos(ph)))); }
        const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.0075, 7), boneMat);
        bones.add(rib);
      }
    }
    const sternum = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.012), boneMat); sternum.position.set(0, -0.14, 0.125); bones.add(sternum);
    for (const s of [-1, 1]) {
      const scap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), boneMat); scap.scale.set(0.9, 1.2, 0.12); scap.position.set(s * 0.12, -0.06, -0.1); bones.add(scap);
      const clav = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6), boneMat); clav.rotation.z = Math.PI / 2 + s * 0.15; clav.position.set(s * 0.11, 0.0, 0.03); bones.add(clav);
    }
  }
  bones.visible = false;
  (bones.userData.skull as THREE.Group).visible = false;

  // birds over the carcass
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 0, 0, 0.35, 0, 0.12, -0.2, 1, 0, 0, 0, 0, 0.35, 0, 0.12, -0.2], 3));
  const birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ color: '#0c0c0c', side: THREE.DoubleSide }), 70);
  birds.frustumCulled = false; birds.visible = false;
  scene.add(birds);
  const birdD = Array.from({ length: 70 }, (_, i) => ({ a: i * 2.4, r: 20 + (i * 37) % 90, h: 50 + (i * 53) % 70, sp: 0.12 + ((i * 17) % 10) * 0.012 }));

  // spray
  const NP = 5000;
  const pPos = new Float32Array(NP * 3), pVel = new Float32Array(NP * 3), pLife = new Float32Array(NP);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const spray = new THREE.Points(pGeo, new THREE.PointsMaterial({ map: softDot(), color: '#dfe6e6', size: 1.1, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true }));
  spray.frustumCulled = false;
  scene.add(spray);
  let pNext = 0;
  const emit = (x: number, y: number, z: number, vx: number, vy: number, vz: number) => {
    const i = pNext++ % NP;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
    pLife[i] = 5;
  };

  // ----------------------------------------------------------- behaviour
  let phase: Phase = 'asleep';
  let tau = 0;                   // time in the current phase
  let yaw = 0, leanA = 0, leanT = 0, sink = -0.78, sinkT = -0.78;
  const headQ = new THREE.Quaternion(), headT = new THREE.Quaternion();
  let blink = 0, blinkAt = 4, lidOpen = 1;
  let acting = 0;                // which hand is busy
  const strike = new THREE.Vector3();
  let struck = false, away = 0, idle = 3, attention = 0, provoked = 0;
  let sheet = 0;                 // water still pouring off after surfacing
  let body: CylCollider | null = null;
  const bodyCols: CylCollider[] = [];
  const rings: { slot: number; age: number; a: number; speed: number; x: number; z: number }[] = [];
  const boatW = new THREE.Vector3(), boatL = new THREE.Vector3(), eyeW = new THREE.Vector3();
  const deadPos = new THREE.Vector3(cx + Math.sin(DEATH_BEARING) * 118, 15, cz + Math.cos(DEATH_BEARING) * 118);
  const fromPos = new THREE.Vector3(), fromQ = new THREE.Quaternion(), deadQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.07, DEATH_BEARING, 0, 'YXZ'));
  const DEAD_ARMS = [new THREE.Vector3(0.25, 0.66, 0.045), new THREE.Vector3(-0.4, 0.05, 0.06)];

  const setPhase = (p: Phase) => { phase = p; tau = 0; struck = false; };
  const sfx = (name: string, gain = 1) => ctx.sfx(name, root.position, gain);

  function ring(x: number, z: number, a: number, speed = 16) {
    const used = new Set(rings.map((r) => r.slot));
    const slot = [3, 4, 5].find((s) => !used.has(s));
    if (slot === undefined) return;
    rings.push({ slot, age: 0, a, speed, x, z });
  }
  function splash(x: number, z: number, power: number) {
    for (let i = 0; i < 900; i++) {
      const a = Math.random() * 6.283, sp = (6 + Math.random() * 26) * power;
      emit(x + Math.cos(a) * 14 * Math.random(), 1, z + Math.sin(a) * 14 * Math.random(), Math.cos(a) * sp * 0.6, (14 + Math.random() * 30) * power, Math.sin(a) * sp * 0.6);
    }
  }

  function setVisual() {
    const ph = state.flag('giantPhase');
    flesh.visible = ph < 3; headFlesh.visible = ph < 3;
    bones.visible = ph === 3; (bones.userData.skull as THREE.Group).visible = ph === 3;
    rot.value = ph === 2 ? 1 : 0;
    torso.scale.set(ph === 2 ? 1.12 : 1, 1, ph === 2 ? 1.25 : 1);
    birds.visible = ph === 2;
    for (const e of eyes) e.visible = ph < 2;
    for (const c of bodyCols) world.remove(c);
    bodyCols.length = 0;
    if (ph > 0) {
      const dx = Math.sin(DEATH_BEARING), dz = Math.cos(DEATH_BEARING);
      if (ph < 3) for (const d of [-62, -18, 30, 75, 120, 165]) bodyCols.push(world.addCyl(cx + dx * d, cz + dz * d, d > 150 ? 30 : 44, -5, 30));
      else {
        bodyCols.push(world.addCyl(cx + dx * 172, cz + dz * 172, 27, -5, 30));
        // the feet of the ribs, either side of the spine: the nave between them stays open
        for (let k = 0; k < 11; k++) {
          const along = 118 - (-0.035 - k * 0.036) * -S - 0, size = 0.8 + 0.3 * Math.sin((k / 10) * Math.PI * 0.9 + 0.3);
          const d = 118 + (-0.035 - k * 0.036) * S;
          void along;
          for (const s of [-1, 1]) bodyCols.push(world.addCyl(cx + dx * d + dz * s * 0.17 * size * S, cz + dz * d - dx * s * 0.17 * size * S, 3.2, -5, 12));
        }
      }
    }
  }

  function poseDead(k: number) {
    root.position.lerpVectors(fromPos, deadPos, k);
    root.quaternion.slerpQuaternions(fromQ, deadQ, k);
    leanA *= 1 - k;
    lean.rotation.x = leanA;
  }

  // restore
  if (state.flag('giantDead')) {
    phase = 'dead';
    fromPos.copy(deadPos); fromQ.copy(deadQ);
    poseDead(1);
    arms.forEach((a, i) => { a.pos.copy(DEAD_ARMS[i]); a.target.copy(DEAD_ARMS[i]); a.flat = a.flatT = 1; a.curl = a.curlT = 0.25; });
    headQ.setFromEuler(new THREE.Euler(0.1, 0.85, 0.2));
    lidOpen = 0.12;
  } else { root.position.set(cx, sink * S, cz); root.visible = false; }
  setVisual();
  solveArms(0.016);

  world.updaters.push((dt, t) => {
    tau += dt;
    boatW.copy(boat.position);
    const bd = Math.hypot(boatW.x - cx, boatW.z - cz);
    const pp = ctx.playerPos();
    const pd = Math.hypot(pp.x - cx, pp.z - cz);
    const alive = phase !== 'dead' && phase !== 'dying';
    const sailing = boat.mode === 'sailing';

    // decay moves on only while nobody is there to watch, one stage per dawn
    if (state.flag('giantDead') && pd > 420 && state.flag('giantPhase') < 3 && state.data.day > state.flag('giantStamp')) {
      state.set('giantPhase', state.flag('giantPhase') + 1);
      state.set('giantStamp', state.data.day);
      setVisual();
    }
    if (pd > 900 && phase !== 'asleep' && alive) { setPhase('asleep'); sinkT = -0.78; sink = -0.78; }
    if (pd > 900) { spray.visible = false; return; }
    spray.visible = true;

    // ---- particles and rings (always, so splashes finish)
    for (let i = 0; i < NP; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      pVel[i * 3 + 1] -= 16 * dt;
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      if (pPos[i * 3 + 1] < -1) { pLife[i] = 0; pPos[i * 3 + 1] = -500; }
    }
    pGeo.attributes.position.needsUpdate = true;
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i], b = bumps[r.slot];
      r.age += dt;
      const life = 11;
      b.x = r.x; b.z = r.z; b.r = r.age * r.speed; b.w = 7 + r.age * 1.6;
      b.a = r.a * Math.max(0, 1 - r.age / life) / (1 + r.age * 0.35);
      if (r.age > life) { b.a = 0; rings.splice(i, 1); }
    }

    if (phase === 'dead') {
      bumps[0].a = bumps[1].a = bumps[2].a = 0;
      if (birds.visible) {
        birdD.forEach((b, i) => {
          const a = b.a + t * b.sp;
          _a.set(deadPos.x + Math.cos(a) * b.r, b.h + Math.sin(t * 0.7 + i) * 4, deadPos.z + Math.sin(a) * b.r);
          _q.setFromEuler(new THREE.Euler(0, -a, Math.sin(t * 5 + i) * 0.4));
          birds.setMatrixAt(i, _m.compose(_a, _q, _b.setScalar(1.6)));
        });
        birds.instanceMatrix.needsUpdate = true;
      }
      solveArms(dt);
      headPivot.quaternion.copy(headQ);
      for (const l of lids) l.rotation.x = 1.45 - 1.7 * Math.min(1, lidOpen);
      return;
    }

    // ---- where it is and what it wants
    const toBoat = Math.atan2(boatW.x - cx, boatW.z - cz);
    if (phase === 'asleep') {
      bumps[0].a = bumps[1].a = bumps[2].a = 0;
      root.position.set(cx, sink * S, cz);
      if (body) { world.remove(body); body = null; }
      if (sailing && bd < 62) { setPhase('emerge'); yaw = toBoat; sfx('giant-rise', 1.6); }
      root.visible = false;
      return;
    }
    root.visible = true;
    if (!body) body = world.addCyl(cx, cz, 50, -20, 60);

    if (alive) {
      const dy = angDiff(toBoat, yaw);
      yaw += THREE.MathUtils.clamp(dy, -0.11 * dt, 0.11 * dt) * (phase === 'stargaze' ? 0 : 1);
      away = bd > 235 ? away + dt : 0;
      if (away > 45 && phase === 'watch') { setPhase('asleep'); sinkT = sink = -0.78; sfx('giant-sink'); return; }
    }
    root.updateMatrixWorld(true);
    rig.worldToLocal(boatL.copy(boatW));

    const nightSky = ctx.env.daylight < 0.15;
    switch (phase) {
      case 'emerge': {
        const k = Math.min(1, tau / 14);
        const e = k * k * (3 - 2 * k);
        sinkT = sink = -0.78 * (1 - e);
        // the sea domes over the rising head, then runs off as a wave
        const b = bumps[0];
        b.x = cx; b.z = cz;
        if (k < 0.45) { b.r = 0; b.w = 70; b.a = 13 * Math.sin((k / 0.45) * Math.PI * 0.5); }
        else { b.r = (k - 0.45) * 420; b.w = 60; b.a = 13 * Math.max(0, 1 - (k - 0.45) / 0.55); }
        if (k > 0.3) for (let i = 0; i < 40; i++) { const a = Math.random() * 6.283, r = 20 + Math.random() * 45; emit(cx + Math.cos(a) * r, 2 + Math.random() * 50 * e, cz + Math.sin(a) * r, Math.cos(a) * 6, 4 + Math.random() * 8, Math.sin(a) * 6); }
        if (k >= 1) { setPhase(nightSky ? 'stargaze' : 'watch'); idle = 4; sheet = 22; sfx('giant-hum'); }
        break;
      }
      case 'watch': {
        leanT = 0; sinkT = 0;
        if (nightSky && provoked <= 0 && tau > 6) { setPhase('stargaze'); break; }
        idle -= dt;
        if (idle <= 0 && sailing && bd < 215) {
          const r = Math.random();
          acting = angDiff(toBoat, yaw) > 0 ? 0 : 1;   // the hand on the boat's side
          if (provoked > 0 || r < 0.3) { setPhase('slap'); pickStrike(provoked > 0 ? 24 : 34 + Math.random() * 22); provoked = 0; sfx('giant-amused'); }
          else if (r < 0.58) { setPhase('scoop'); sfx('giant-amused'); }
          else if (r < 0.82) { setPhase('peer'); sfx('giant-curious'); }
          else if (r < 0.92) { setPhase('blow'); }
          else { setPhase('bored'); sfx('giant-sigh'); }
        }
        break;
      }
      case 'stargaze': {
        leanT = -0.06; sinkT = -0.02;
        attention = bd < 110 && sailing ? attention + dt : Math.max(0, attention - dt);
        if (!nightSky || attention > 26 || provoked > 0) { setPhase('watch'); idle = 5; attention = 0; }
        break;
      }
      case 'peer': {
        leanT = THREE.MathUtils.clamp(0.25 + (boatL.z - 0.2) * 0.9, 0.25, 0.62) * (tau < 9 ? 1 : 0);
        sinkT = -0.03;
        if (tau > 11.5) { setPhase('watch'); idle = 3 + Math.random() * 4; }
        break;
      }
      case 'bored': {
        leanT = 0; sinkT = tau < 12 ? -0.215 : 0;
        if (tau > 15) { setPhase('watch'); idle = 2 + Math.random() * 3; }
        break;
      }
      case 'blow': {
        leanT = 0.22;
        if (tau > 2.2 && tau < 5.2) {
          eyeW.setFromMatrixPosition(headPivot.matrixWorld);
          const dx = boatW.x - eyeW.x, dz = boatW.z - eyeW.z, d = Math.hypot(dx, dz) || 1;
          hooks.push((dx / d) * 5.5, (dz / d) * 5.5);
          if (!struck) { struck = true; sfx('giant-blow', 1.4); }
          for (let i = 0; i < 6; i++) emit(eyeW.x + (dx / d) * 30, eyeW.y - 22, eyeW.z + (dz / d) * 30, (dx / d) * 60 + (Math.random() - 0.5) * 20, -10 + (Math.random() - 0.5) * 12, (dz / d) * 60 + (Math.random() - 0.5) * 20);
        }
        if (tau > 6.5) { setPhase('watch'); idle = 3 + Math.random() * 4; }
        break;
      }
      case 'slap': {
        const a = arms[acting];
        a.flatT = 1; a.curlT = 0.05;
        rig.worldToLocal(_a.copy(strike));
        if (tau < 3.0) { a.target.set(_a.x, 0.4, _a.z); a.k = 5; a.c = 4; }
        else if (tau < 4.6) {
          a.target.set(_a.x, -0.035, _a.z); a.k = 34; a.c = 7;
          rig.localToWorld(_b.copy(a.pos));
          if (!struck && _b.y < 4) {
            struck = true;
            splash(_b.x, _b.z, 1); ring(_b.x, _b.z, 6.5, 17); sfx('giant-slap', 2);
            if (sailing && Math.hypot(boatW.x - _b.x, boatW.z - _b.z) < 23) hooks.wreck();
          }
        } else { a.target.copy(REST[acting]); a.k = 3; a.c = 3.4; a.flatT = 0; a.curlT = 0.5; }
        if (tau > 8) { setPhase('watch'); idle = 3 + Math.random() * 5; if (Math.random() < 0.5) sfx('giant-amused'); }
        break;
      }
      case 'scoop': {
        // a slow bat past the boat, cupped hand pushing a hill of water
        const a = arms[acting], s = acting === 0 ? 1 : -1;
        a.flatT = 0.7; a.curlT = 0.35;
        if (tau < 0.05 || !struck) { strike.copy(boatW); struck = true; }
        rig.worldToLocal(_a.copy(strike));
        const k = THREE.MathUtils.clamp((tau - 2.2) / 5, 0, 1);
        if (tau < 2.2) { a.target.set(_a.x + s * 0.3, -0.02, _a.z - 0.02); a.k = 5; a.c = 4.2; }
        else if (tau < 7.2) {
          a.target.set(_a.x + s * (0.3 - 0.55 * k), -0.03, _a.z + 0.14 + 0.1 * Math.sin(k * Math.PI)); a.k = 12; a.c = 6;
          rig.localToWorld(_b.copy(a.pos));
          const b = bumps[1 + acting];
          b.x = _b.x; b.z = _b.z; b.r = 0; b.w = 24; b.a = 4.2 * Math.sin(k * Math.PI);
          if (Math.random() < 0.6) emit(_b.x + (Math.random() - 0.5) * 30, 1, _b.z + (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 10, 8 + Math.random() * 10, (Math.random() - 0.5) * 10);
          if (sailing && Math.hypot(boatW.x - _b.x, boatW.z - _b.z) < 15) hooks.wreck();
        } else { a.target.copy(REST[acting]); a.k = 3; a.c = 3.4; a.flatT = 0; a.curlT = 0.5; bumps[1 + acting].a *= Math.max(0, 1 - dt * 2); }
        if (tau > 10) { bumps[1 + acting].a = 0; setPhase('watch'); idle = 3 + Math.random() * 4; }
        break;
      }
      case 'dying': {
        // the head snaps back, the hands start toward the face, and then everything lets go
        if (tau < 1.6) {
          leanA += (-0.22 - leanA) * Math.min(1, dt * 4); lean.rotation.x = leanA;
          headT.setFromEuler(new THREE.Euler(-0.7, 0.2, 0.1, 'YXZ')); headQ.slerp(headT, Math.min(1, dt * 6));
          arms.forEach((a, i) => { a.target.set((i ? -1 : 1) * 0.1, 0.24, 0.16); a.k = 9; a.c = 5; });
          fromPos.copy(root.position); fromQ.copy(root.quaternion);
        }
        else {
          const k = Math.min(1, (tau - 1.6) / 15);
          const e = k * k * (3 - 2 * k);
          poseDead(e);
          arms.forEach((a, i) => { a.target.copy(DEAD_ARMS[i]); a.k = 1.6; a.c = 2.6; a.flatT = 1; a.curlT = 0.25; });
          lidOpen += (0.12 - lidOpen) * Math.min(1, dt * 0.4);
          headT.setFromEuler(new THREE.Euler(0.1, 0.85, 0.2)); headQ.slerp(headT, Math.min(1, dt * 0.5));
          if (!struck && k > 0.62) { struck = true; ring(deadPos.x, deadPos.z, 5, 14); splash(deadPos.x, deadPos.z, 1.3); sfx('giant-fall', 2); }
          if (k >= 1) { setPhase('dead'); if (body) { world.remove(body); body = null; } setVisual(); }
        }
        break;
      }
    }

    if (alive) {
      provoked = Math.max(0, provoked - dt);
      // slow breath, and the foam line where its shoulders meet the sea
      sink += (sinkT - sink) * Math.min(1, dt * 0.45);
      leanA += (leanT - leanA) * Math.min(1, dt * 0.55);
      root.position.set(cx, sink * S + 17 + Math.sin(t * 0.55) * 1.3, cz);
      root.rotation.set(0, yaw, 0);
      lean.rotation.x = leanA;
      if (phase !== 'emerge') { const b = bumps[0]; b.x = cx; b.z = cz; b.r = 50 + leanA * 20; b.w = 7; b.a = 0.7 + Math.sin(t * 0.55) * 0.35; }
      // water keeps pouring off for a while after it surfaces
      sheet = Math.max(0, sheet - dt);
      if (sheet > 0) for (let i = 0; i < 16; i++) { const a = Math.random() * 6.283; emit(cx + Math.cos(a) * (18 + Math.random() * 34), 20 + Math.random() * 55, cz + Math.sin(a) * (10 + Math.random() * 20), 0, -2, 0); }

      // head and eyes
      const up = phase === 'stargaze';
      let hy = THREE.MathUtils.clamp(Math.atan2(boatL.x, boatL.z), -0.95, 0.95);
      let hp = THREE.MathUtils.clamp(Math.atan2(HEAD.y - boatL.y, Math.hypot(boatL.x, boatL.z)) - leanA, -0.2, 0.95);
      if (up) { hy = Math.sin(t * 0.05) * 0.3; hp = -0.85; }
      if (phase === 'emerge') { hp = 0.35; }
      if (phase === 'bored') { hy *= 0.3; hp = 0.1; }
      headT.setFromEuler(new THREE.Euler(hp, hy, Math.sin(t * 0.21) * 0.05 + (phase === 'peer' ? 0.18 * Math.sin(tau * 0.6) : 0), 'YXZ'));
      headQ.slerp(headT, Math.min(1, dt * (phase === 'dying' ? 5 : 0.9)));
      blink -= dt; blinkAt -= dt;
      if (blinkAt <= 0) { blink = 0.5; blinkAt = 3.5 + Math.random() * 7; }
      const wide = phase === 'peer' ? 1.15 : phase === 'bored' ? 0.55 : up ? 0.9 : 1;
      lidOpen += ((blink > 0 ? 0.05 : wide) - lidOpen) * Math.min(1, dt * (blink > 0 ? 14 : 5));
    }
    headPivot.quaternion.copy(headQ);
    for (const l of lids) l.rotation.x = 1.45 - 1.7 * Math.min(1, lidOpen);
    // the eyes finish the look that the head begins
    root.updateMatrixWorld(true);
    if (alive) for (const e of eyes) {
      headFlesh.worldToLocal(_a.copy(phase === 'stargaze' ? _b.set(cx, 4000, cz + 2000) : boatW));
      _a.sub(e.position);
      e.rotation.set(THREE.MathUtils.clamp(-Math.atan2(_a.y, Math.hypot(_a.x, _a.z)), -0.45, 0.45), THREE.MathUtils.clamp(Math.atan2(_a.x, _a.z), -0.5, 0.5), 0, 'YXZ');
    }
    solveArms(dt);
  });

  function pickStrike(dist: number) {
    // somewhere near the boat, led a little along its course: close enough to soak it
    const s = boat.state, a = Math.random() * 6.283;
    strike.set(boat.position.x + Math.sin(s.psi) * s.u * 3.5 + Math.cos(a) * dist, 0, boat.position.z + Math.cos(s.psi) * s.u * 3.5 + Math.sin(a) * dist);
    // never reach outside the lagoon
    const d = Math.hypot(strike.x - cx, strike.z - cz);
    if (d > 175) { strike.x = cx + ((strike.x - cx) / d) * 175; strike.z = cz + ((strike.z - cz) / d) * 175; }
  }

  function solveArms(dt: number) {
    arms.forEach((a, i) => {
      const s = i === 0 ? 1 : -1;
      // heavy spring: the hand lags, overshoots a little, and settles
      const h = Math.min(dt, 1 / 30);
      a.vel.x += ((a.target.x - a.pos.x) * a.k - a.vel.x * a.c) * h;
      a.vel.y += ((a.target.y - a.pos.y) * a.k - a.vel.y * a.c) * h;
      a.vel.z += ((a.target.z - a.pos.z) * a.k - a.vel.z * a.c) * h;
      a.pos.addScaledVector(a.vel, h);
      a.flat += (a.flatT - a.flat) * Math.min(1, dt * 1.6);
      a.curl += (a.curlT - a.curl) * Math.min(1, dt * 1.6);
      _c.set(s * 0.7, -0.5, -0.6);
      solveIK(SH[i], a.pos, UARM, FARM, _c, a.elbow, a.wrist);
      place(a.upper, SH[i], a.elbow); place(a.fore, a.elbow, a.wrist);
      place(a.bUpper, SH[i], a.elbow); place(a.bFore, a.elbow, a.wrist);
      // hand: in line with the forearm at rest, flat to the water when it strikes
      _a.subVectors(a.wrist, a.elbow).normalize();
      const qArm = _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _a).clone();
      _b.copy(_a).setY(0);
      if (_b.lengthSq() < 1e-6) _b.set(0, 0, 1);
      _b.normalize();
      _m.makeBasis(_c.crossVectors(UPV, _b).normalize(), UPV, _b);
      const qFlat = new THREE.Quaternion().setFromRotationMatrix(_m);
      a.hand.position.copy(a.wrist);
      a.hand.quaternion.copy(qArm).slerp(qFlat, a.flat);
      for (const f of a.fingers) { f.rotation.x = a.curl * 0.9; (f.userData.kn as THREE.Group).rotation.x = a.curl * 1.3; }
    });
  }

  return {
    get phase() { return phase; },
    /** testing: bring it up without sailing in */
    wake() { if (phase === 'asleep') { setPhase('emerge'); yaw = Math.atan2(boat.position.x - cx, boat.position.z - cz); } },
    /** is the giant up and able to be shot? returns true if this ray strikes an eye */
    shoot(origin: THREE.Vector3, dir: THREE.Vector3): boolean {
      if (phase === 'asleep' || phase === 'dead' || phase === 'dying') return false;
      root.updateMatrixWorld(true);
      let headHit = false;
      for (const e of eyes) {
        e.getWorldPosition(eyeW);
        _a.subVectors(eyeW, origin);
        const along = _a.dot(dir);
        if (along < 0) continue;
        const miss = Math.sqrt(Math.max(0, _a.lengthSq() - along * along));
        if (miss < EYE_R * S * 1.25 && lidOpen > 0.35) {
          state.set('giantDead'); state.set('giantPhase', 1); state.set('giantStamp', state.data.day);
          fromPos.copy(root.position); fromQ.copy(root.quaternion);
          setPhase('dying'); sfx('giant-death', 2.2);
          setVisual(); // the body's resting place becomes solid now, easing the boat out from under it
          bumps[1].a = bumps[2].a = 0;
          return true;
        }
        if (miss < 0.13 * S) headHit = true;
      }
      if (headHit) { provoked = 12; idle = 0.5; blink = 0.9; sfx('giant-annoyed', 1.5); if (phase !== 'slap' && phase !== 'scoop') setPhase('watch'); }
      return false;
    },
  };
}
