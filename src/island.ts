// The starting island: terrain, the abandoned boatyard and the three-part
// puzzle that gets the boat rigged and launched.
import * as THREE from 'three';
import { Ctx } from './ctx';
import { Builder } from './build';
import { MAT, patch } from './materials';
import { fbm, ridge, smooth, rng } from './noise';
import { calmZones } from './waves';
import { makeItem, addPickup } from './items';

export const ISLAND = { x: -700, z: -600 };
const IX = ISLAND.x, IZ = ISLAND.z;
const DECK = 1.6; // height of the yard and dock

/** terrain height in island-local coordinates */
function localHeight(lx: number, lz: number) {
  const d = Math.hypot(lx, lz);
  const rr = 150 + 75 * (fbm(lx * 0.012 + 5.2, lz * 0.012 + 9.1) - 0.5) + 14 * (fbm(lx * 0.05, lz * 0.05 + 40) - 0.5);
  const t = 1 - d / rr;
  let h: number;
  if (t > 0) {
    const west = 0.3 + 0.7 * smooth(80, -60, lx);
    // sea cliffs on the weather side, shelving shore toward the cove
    const cliff = smooth(0.38, 0.62, fbm(lx * 0.016 + 31, lz * 0.016 + 7)) * smooth(95, 40, lx);
    h = smooth(0, 0.2, t) * 3 + smooth(0.015, 0.075, t) * 13 * cliff;
    h += Math.pow(t, 1.35) * 34 * west;
    h += (ridge(lx * 0.019, lz * 0.019) - 0.55) * 18 * smooth(0.08, 0.4, t) * west;
    h += (fbm(lx * 0.09, lz * 0.09) - 0.5) * 2.2 * smooth(0.02, 0.2, t);
  } else h = t * 42;
  // the cove bites into the east shore
  const c = Math.exp(-(((lx - 128) ** 2) / (40 * 40) + ((lz - 10) ** 2) / (27 * 27)));
  h -= c * 17;
  // flat yard cut into the slope
  const ym = smooth(46, 30, Math.hypot(lx - 70, lz - 10));
  h += (DECK - h) * ym;
  // the ground stops just short of the dock's concrete, so the two surfaces never lie in the same plane
  h -= 0.09 * smooth(96.8, 98.2, lx) * smooth(22.5, 20.5, Math.abs(lz - 10));
  // a levelled crown on the summit, where the telescope stands
  const sm = smooth(11, 4.5, Math.hypot(lx + 44, lz + 6));
  h += (40.6 - h) * sm;
  // terrace for the house
  const pm = smooth(15, 8, Math.hypot(lx - 28, lz + 50));
  h += (9.5 - h) * pm;
  return h;
}
export const islandHeight = (x: number, z: number) => localHeight(x - IX, z - IZ);

export const WATCHER_SEAT = new THREE.Vector3(IX + 33.2, 9.5 + 0.35, IZ - 47.2);

export function buildIsland(ctx: Ctx) {
  const { scene, world, state, boat } = ctx;
  const b = new Builder(scene, world, IX, 0, IZ);
  const P = (lx: number, y: number, lz: number) => new THREE.Vector3(IX + lx, y, IZ + lz);
  world.addTerrain(islandHeight, IX, IZ, 240);
  calmZones.push({ x: IX, z: IZ, r0: 150, r1: 380 });

  // walls throw their shadow from the sunlit face, so no sliver of light creeps in along the foot of a wall indoors
  MAT.concrete.shadowSide = THREE.DoubleSide;
  // ---------- terrain ----------
  {
    const N = 240, SIZE = 460;
    const pos = new Float32Array((N + 1) * (N + 1) * 3);
    const hs = new Float32Array((N + 1) * (N + 1));
    for (let j = 0; j <= N; j++)
      for (let i = 0; i <= N; i++) {
        const lx = (i / N - 0.5) * SIZE, lz = (j / N - 0.5) * SIZE;
        const h = localHeight(lx, lz);
        const k = j * (N + 1) + i;
        hs[k] = h;
        pos[k * 3] = IX + lx; pos[k * 3 + 1] = h; pos[k * 3 + 2] = IZ + lz;
      }
    const idx: number[] = [];
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, c = a + 1, d = a + N + 1, e = d + 1;
        if (Math.max(hs[a], hs[c], hs[d], hs[e]) < -9) continue;
        idx.push(a, d, c, c, d, e);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }), /* glsl */ `
      float slope = 1.0 - wn.y;
      float n = tri(wp, wn, 0.35); float n2 = fbm(wp.xz * 1.7); float n3 = fbm(wp.xz * 0.06);
      // detail finer than a pixel is averaged away, or it beats against the screen into a checker
      float px = length(fwidth(wp.xz));
      float fine = mix(0.5, fbm(mat2(0.6, 0.8, -0.8, 0.6) * wp.xz * 9.0), smoothstep(0.05, 0.012, px));
      n2 = mix(0.5, n2, smoothstep(0.3, 0.07, px));
      // columnar basalt: dark, with vertical jointing on the steep faces
      vec3 rock = mix(vec3(0.022, 0.022, 0.024), vec3(0.085, 0.082, 0.08), n);
      vec2 q = abs(wn.x) > abs(wn.z) ? wp.zy : wp.xy;
      float joints = smoothstep(0.42, 0.5, abs(fract(q.x * 0.55 + fbm(q * 0.3) * 1.5) - 0.5));
      rock *= mix(1.0, 0.45, joints * smoothstep(0.25, 0.6, slope));
      rock *= mix(1.0, 0.7 + 0.6 * streaks(wp, wn, 0.8), smoothstep(0.3, 0.6, slope));   // run-off streaks belong on steep faces; on gentle ground they read as combing
      // the ground itself: bare earth, with dry grass thatch thinning out toward paths and steep places
      float db;
      vec3 earth = dirt(wp.xz, vd, vec3(0.235, 0.175, 0.11), vec3(0.1, 0.073, 0.05), db);
      vec3 straw = mix(vec3(0.24, 0.2, 0.11), vec3(0.42, 0.36, 0.2), n2) * (0.75 + 0.5 * fine);
      float thatch = smoothstep(0.38, 0.62, fbm(wp.xz * 0.16 + 3.0) + (fine - 0.5) * 0.35 * smoothstep(40.0, 8.0, vd));
      float grassy = smoothstep(0.22, 0.07, slope) * smoothstep(3.0, 5.5, wp.y + n * 2.5);
      vec3 soil = mix(earth, straw, thatch * 0.8 * grassy);
      // the yard and the tide line: trodden grit and shingle
      vec3 shingle = dirt(wp.xz * 1.6 + 40.0, vd, vec3(0.2, 0.185, 0.16), vec3(0.085, 0.078, 0.07), n3);
      float low = smoothstep(3.0, 1.3, wp.y + n) * smoothstep(0.4, 0.12, slope);
      float soft = smoothstep(0.34, 0.12, slope);
      col = mix(rock, mix(soil, shingle, low), max(soft * smoothstep(1.2, 2.2, wp.y + n * 2.0), low));
      float wet = smoothstep(0.9, -0.1, wp.y);
      col *= mix(1.0, 0.4, wet);
      rough = mix(0.96, 0.35, wet);
      bump = mix(tri3(wp, wn, 2.2) * 0.09 - joints * smoothstep(0.25, 0.6, slope) * 0.05, db, soft);`, 'terrain');
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);

    // dry grass: each tuft is a spray of thin blades, lit like the ground it grows from
    const r = rng(7);
    const tp: number[] = [], tn: number[] = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * 6.283 + r() * 0.6, lean = 0.12 + r() * 0.28, h = 0.32 + r() * 0.35, w = 0.022;
      const bx = Math.cos(a) * 0.05, bz = Math.sin(a) * 0.05;
      const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      tp.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean);
      for (let v = 0; v < 3; v++) tn.push(0, 1, 0);
    }
    const tuft = new THREE.BufferGeometry();
    tuft.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    tuft.setAttribute('normal', new THREE.Float32BufferAttribute(tn, 3));
    // Grown in patches of about 45 m. Each patch is one draw, and patches far from the player are not drawn at all.
    const COUNT = 30000, CELL = 45;
    const grassMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, side: THREE.DoubleSide });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
    const colr = new THREE.Color();
    const cells = new Map<string, { m: number[]; c: number[]; x: number; z: number }>();
    let n = 0;
    for (let tries = 0; tries < COUNT * 6 && n < COUNT; tries++) {
      const lx = (r() - 0.5) * 340, lz = (r() - 0.5) * 340;
      const h = localHeight(lx, lz);
      if (h < 5.2) continue;
      if (Math.hypot(lx - 28, lz + 50) < 16) continue; // the terrace round the house is bare
      if (Math.hypot(lx + 44, lz + 6) < 4.4) continue;  // nothing grows through the summit's concrete
      const sl = Math.abs(localHeight(lx + 1, lz) - h) + Math.abs(localHeight(lx, lz + 1) - h);
      if (sl > 0.45) continue;
      if (fbm(lx * 0.05 + 3, lz * 0.05) < 0.4) continue;
      pv.set(IX + lx, h - 0.04 - sl * 0.3, IZ + lz);   // set into the slope, so no tuft hangs in the air on its downhill side
      q.setFromEuler(new THREE.Euler(0, r() * 6.283, 0));
      const s = 0.7 + r() * 1.1;
      sc.set(s, s * (0.7 + r() * 0.8), s);
      const cxi = Math.floor(lx / CELL), czi = Math.floor(lz / CELL), key = cxi + ',' + czi;
      let cell = cells.get(key);
      if (!cell) cells.set(key, (cell = { m: [], c: [], x: IX + (cxi + 0.5) * CELL, z: IZ + (czi + 0.5) * CELL }));
      m4.compose(pv, q, sc);
      for (let k = 0; k < 16; k++) cell.m.push(m4.elements[k]);
      colr.setHSL(0.12 + r() * 0.02, 0.2 + r() * 0.12, 0.3 + r() * 0.16);
      cell.c.push(colr.r, colr.g, colr.b);
      n++;
    }
    const patches: { mesh: THREE.InstancedMesh; x: number; z: number }[] = [];
    for (const cell of cells.values()) {
      const inst = new THREE.InstancedMesh(tuft, grassMat, cell.m.length / 16);
      (inst.instanceMatrix.array as Float32Array).set(cell.m);
      inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cell.c), 3);
      inst.computeBoundingSphere();
      scene.add(inst);
      patches.push({ mesh: inst, x: cell.x, z: cell.z });
    }
    let grassT = 0;
    world.updaters.push((dt) => {
      if ((grassT -= dt) > 0) return;
      grassT = 0.3;
      const p = ctx.view.position;
      for (const k of patches) k.mesh.visible = Math.hypot(p.x - k.x, p.z - k.z) < 230;
    });

    // loose boulders along the shore and slopes
    const rockMat = patch(new THREE.MeshStandardMaterial({ color: '#2a2826', roughness: 0.9, flatShading: true }), /* glsl */ `
      col *= 0.6 + 0.9 * tri(wp, wn, 0.9); float wet = smoothstep(0.7, -0.2, wp.y); col *= mix(1.0, 0.45, wet); rough = mix(rough, 0.3, wet); bump = tri3(wp, wn, 3.0) * 0.06 + tri3(wp, wn, 14.0) * 0.01;`, 'boulder');
    const rg = new THREE.IcosahedronGeometry(1, 1);
    const rp = rg.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const k = 0.75 + 0.5 * fbm(rp.getX(i) * 2 + 4, rp.getY(i) * 2 + rp.getZ(i) * 3);
      rp.setXYZ(i, rp.getX(i) * k, rp.getY(i) * k * 0.75, rp.getZ(i) * k);
    }
    rg.computeVertexNormals();
    for (let i = 0; i < 90; i++) {
      const a = r() * 6.28, d = 105 + r() * 55;
      const lx = Math.cos(a) * d, lz = Math.sin(a) * d;
      const h = localHeight(lx, lz);
      if (h < -2.5 || h > 14 || Math.hypot(lx - 100, lz - 10) < 50) continue;
      const s = 0.6 + r() * r() * 3.2;
      const m = new THREE.Mesh(rg, rockMat);
      m.position.set(IX + lx, h + s * 0.15, IZ + lz);
      m.scale.setScalar(s);
      m.rotation.set(r() * 3, r() * 6, r() * 3);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      if (s > 0.9) world.addCyl(IX + lx, IZ + lz, s * 0.8, h - 1, h + s * 0.7);
    }
  }

  // ---------- sea stacks off the weather shore ----------
  {
    const mat = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), /* glsl */ `
      float n = tri(wp, wn, 0.35);
      vec2 q = abs(wn.x) > abs(wn.z) ? wp.zy : wp.xy;
      float joints = smoothstep(0.42, 0.5, abs(fract(q.x * 0.5 + fbm(q * 0.25) * 1.2) - 0.5));
      col = mix(vec3(0.02, 0.02, 0.022), vec3(0.085, 0.082, 0.08), n) * mix(1.0, 0.45, joints * (1.0 - abs(wn.y)));
      col *= 0.7 + 0.6 * streaks(wp, wn, 0.7);
      col = mix(col, vec3(0.33, 0.3, 0.2), smoothstep(0.75, 0.95, wn.y) * smoothstep(8.0, 14.0, wp.y) * 0.6);   // guano and dry grass on top
      float wet = smoothstep(1.4, -0.2, wp.y); col *= mix(1.0, 0.4, wet); rough = mix(0.92, 0.3, wet);
      bump = tri3(wp, wn, 1.4) * 0.12 - joints * 0.06;`, 'stack');
    for (const [lx, lz, rad, h] of [[-205, -60, 9, 34], [-222, -22, 6, 22], [-196, 28, 12, 27], [-150, 150, 8, 30], [-178, 118, 5, 16], [40, -205, 10, 26], [72, -196, 5, 14]] as const) {
      const g = new THREE.CylinderGeometry(rad * 0.55, rad, h + 14, 22, 14);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const ang = Math.atan2(z, x), up = Math.max(0, y / h + 0.5);
        // lumpy in plan, stepped in height, and broken off unevenly at the top
        const k = 1 + (fbm(Math.cos(ang) * 1.6 + lx, Math.sin(ang) * 1.6 + y * 0.05) - 0.5) * 1.5 + (ridge(y * 0.11 + lx, ang * 0.9) - 0.5) * 0.5;
        const lean = up * up * rad * 0.5;
        const crown = (fbm(x * 0.25 + lz, z * 0.25) - 0.35) * h * 0.55 * up * up * up;
        p.setXYZ(i, x * k + lean, y + crown, z * k + lean * 0.4);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.position.set(IX + lx, h / 2 - 7, IZ + lz);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      world.addCyl(IX + lx, IZ + lz, rad * 0.95, -20, h);
    }
  }

  // ---------- dock and dry dock basin ----------
  const SLAB_Y = -0.9, SLAB_H = 5; // top at DECK
  b.box(104, SLAB_Y, 10, 12, SLAB_H, 20, MAT.concrete);         // west apron
  b.box(120, SLAB_Y, 16.5, 20, SLAB_H, 7, MAT.concrete);        // north arm
  b.box(120, SLAB_Y, 3.5, 20, SLAB_H, 7, MAT.concrete);         // south arm
  b.box(119, -2.0, 10, 18, 1.4, 6, MAT.concrete);               // basin floor (top at -1.3)
  // kerbs so nobody walks into the basin
  b.rail(110, 13, 118.2, 13, DECK, MAT.rust, 0.9);
  b.rail(119.8, 13, 130, 13, DECK, MAT.rust, 0.9);
  world.addBox(IX + 119, DECK + 0.45, IZ + 13, 0.8, 0.45, 0.06);                        // the gap is for the gangway, not for walking off the edge
  {
    // gangway: a boarded ramp with rope rails from the dock side down toward the boat
    const g0 = new THREE.Vector3(119, DECK + 0.03, 13.25), g1 = new THREE.Vector3(119, DECK - 0.75, 11.5);
    const plank = b.box(119, (g0.y + g1.y) / 2, (g0.z + g1.z) / 2, 0.8, 0.05, g0.distanceTo(g1), MAT.paleWood, 0, false);
    plank.rotation.x = -Math.atan2(g0.y - g1.y, g0.z - g1.z);
    for (let i = 1; i < 6; i++) { const c = b.box(119, g0.y + (g1.y - g0.y) * (i / 6) + 0.035, g0.z + (g1.z - g0.z) * (i / 6), 0.8, 0.025, 0.05, MAT.wood, 0, false); c.rotation.x = plank.rotation.x; }
    for (const sx of [-0.4, 0.4]) {
      b.bar(119 + sx, DECK, 13.1, 119 + sx, DECK + 0.9, 13.1, 0.03, MAT.rust, 6);
      b.bar(119 + sx, DECK + 0.85, 13.1, 119 + sx, DECK + 0.05, 11.5, 0.012, MAT.rope, 4);
    }
  }
  b.rail(110, 7, 130, 7, DECK, MAT.rust, 0.9);
  // the dock-head gate across the slip: two barred leaves on heavy posts, one standing a little open
  {
    const gy = DECK, H = 1.25;
    for (const z of [7.0, 13.0]) { b.box(110, gy + 0.75, z, 0.22, 1.5, 0.22, MAT.dark, 0, false); b.mesh(new THREE.SphereGeometry(0.1, 10, 8), MAT.dark, 110, gy + 1.56, z, false); }
    const leaf = (hingeZ: number, dir: number, open: number) => {
      const g = new THREE.Group();
      g.position.set(IX + 110, gy + 0.08, IZ + hingeZ);
      g.rotation.y = open;
      const W = 2.85, add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0) => { const m = new THREE.Mesh(geo, MAT.rust); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); };
      for (const y of [0.04, H]) add(new THREE.BoxGeometry(0.05, 0.06, W), 0, y, dir * W / 2);
      for (const z of [0.03, W - 0.03]) add(new THREE.BoxGeometry(0.05, H, 0.06), 0, H / 2, dir * z);
      for (let i = 1; i < 9; i++) add(new THREE.CylinderGeometry(0.012, 0.012, H, 6), 0, H / 2, dir * (W * i) / 9);
      add(new THREE.BoxGeometry(0.035, 0.05, Math.hypot(W, H)), 0, H / 2, dir * W / 2, -dir * Math.atan2(H, W));       // the brace that keeps it from sagging
      b.flatten(g);
    };
    leaf(7.12, 1, 0); leaf(12.88, -1, 0.42);
    world.addBox(IX + 110, DECK + 0.45, IZ + 10, 0.06, 0.45, 3);
  }
  // bollards and fenders
  for (const x of [112, 118, 124, 129]) { b.cyl(x, 19.3, 0.16, DECK, DECK + 0.45, MAT.dark, false); b.cyl(x, 0.7, 0.16, DECK, DECK + 0.45, MAT.dark, false); }
  // cradle blocks under the hull
  for (const x of [117.2, 119, 120.8]) b.box(x, -1.05, 10, 0.3, 0.5, 1.5, MAT.wood, 0, false);

  // sea gate
  const gate = b.box(130.2, -0.6, 10, 0.45, 4.4, 6.6, MAT.rust, 0, false);
  gate.userData.static = false;
  let gateCol = world.addBox(IX + 130.2, -0.6, IZ + 10, 0.3, 2.2, 3.3);
  for (const z of [6.6, 13.4]) b.box(130.2, 0.6, z, 0.9, 3.4, 0.5, MAT.steel, 0, false);

  // depth mask that keeps the sea out of the dry basin, and the water that fills it
  const lid = new THREE.Mesh(new THREE.PlaneGeometry(20, 6), new THREE.MeshBasicMaterial({ colorWrite: false }));
  lid.rotation.x = -Math.PI / 2;
  lid.position.set(IX + 120, 0.95, IZ + 10);
  lid.renderOrder = 1;
  scene.add(lid);
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(20, 6), new THREE.MeshStandardMaterial({ color: '#0d1c26', roughness: 0.12, metalness: 0.2 }));
  fill.rotation.x = -Math.PI / 2;
  fill.position.set(IX + 120, -1.28, IZ + 10);
  fill.visible = false;
  scene.add(fill);

  const mooring = { name: 'drydock', x: IX + 119, z: IZ + 10, psi: Math.PI / 2, dock: P(119, DECK, 14.4) };
  world.moorings.push(mooring);
  boat.cradle = { x: IX + 119, y: -0.72, z: IZ + 10, psi: Math.PI / 2 };

  // ---------- crane and mast ----------
  const CR = { x: 119.85, z: 16.6, h: 8.6, arm: 6.6, counter: 3.0 };
  const crane = new THREE.Group();
  crane.position.set(IX + CR.x, DECK, IZ + CR.z);
  scene.add(crane);
  const cb = new Builder(crane, world);
  b.cyl(CR.x, CR.z, 0.32, DECK, DECK + 0.6, MAT.concrete, true, 0.32, 12);
  cb.cyl(0, 0, 0.14, 0, CR.h, MAT.rust, false, 0.11, 10);
  world.addCyl(IX + CR.x, IZ + CR.z, 0.3, DECK, DECK + 4);
  const beam = new THREE.Group();
  beam.position.y = CR.h;
  crane.add(beam);
  const bb = new Builder(beam, world);
  bb.box(0, 0, (CR.arm - CR.counter) / 2, 0.16, 0.22, CR.arm + CR.counter, MAT.rust, 0, false);
  bb.bar(0, 0.9, 0, 0, 0.1, CR.arm - 0.3, 0.02, MAT.dark);
  bb.bar(0, 0.9, 0, 0, 0.1, -CR.counter + 0.2, 0.02, MAT.dark);
  cb.bar(0, CR.h, 0, 0, CR.h + 0.9, 0, 0.06, MAT.rust);
  // the hand winch: on its own stand beside the crane's foot, so it stays put while the jib swings
  const WX = CR.x + 0.75, WZ = CR.z + 0.55;
  b.box(WX, DECK + 0.05, WZ, 0.9, 0.1, 0.6, MAT.steel, 0, false);
  for (const sx of [-0.3, 0.3]) {
    for (const sz of [-1, 1]) b.bar(WX + sx, DECK + 0.1, WZ + sz * 0.22, WX + sx, DECK + 0.95, WZ, 0.028, MAT.rust, 6);   // A-frame cheeks
    b.mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), MAT.dark, WX + sx, DECK + 0.95, WZ, false).rotation.z = Math.PI / 2;
  }
  world.addBox(IX + WX, DECK + 0.5, IZ + WZ, 0.42, 0.5, 0.28);
  const winch = new THREE.Group();
  winch.position.set(IX + WX, DECK + 0.95, IZ + WZ);
  scene.add(winch);
  {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.46, 16), MAT.rope);
    drum.rotation.z = Math.PI / 2;
    winch.add(drum);
    for (const sx of [-0.25, 0.25]) { const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 20), MAT.steel); fl.rotation.z = Math.PI / 2; fl.position.x = sx; winch.add(fl); }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.96, 8), MAT.dark); axle.rotation.z = Math.PI / 2; axle.position.x = 0.06; winch.add(axle);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.34, 0.05), MAT.dark); arm.position.set(0.5, 0.15, 0); winch.add(arm);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.2, 8), MAT.wood); grip.rotation.z = Math.PI / 2; grip.position.set(0.6, 0.31, 0); winch.add(grip);
    winch.traverse((m) => { m.castShadow = true; });
  }
  // its line runs to a block at the head of the post
  b.bar(WX - 0.1, DECK + 1.05, WZ - 0.05, CR.x + 0.1, DECK + CR.h - 0.3, CR.z, 0.012, MAT.dark, 4);
  const crank = new THREE.Object3D();
  // hook cable and the mast hanging from it
  const cable = cb.bar(0, 0, 0, 0, 1, 0, 0.012, MAT.dark);
  const hungMast = new THREE.Group();
  crane.add(hungMast);
  const MAST_H = 6.4;
  {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, MAST_H, 10), MAT.wood);
    m.position.y = -MAST_H / 2;
    m.castShadow = true;
    hungMast.add(m);
    // four pale bands: the weight the crane must balance
    for (let i = 0; i < 4; i++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.068, 0.09, 10), MAT.bone);
      band.position.y = -MAST_H + 1.0 + i * 0.22;
      hungMast.add(band);
    }
  }
  // counterweight pan
  const pan = new THREE.Group();
  crane.add(pan);
  {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), MAT.steel);
    plate.castShadow = true;
    pan.add(plate);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1, 4), MAT.dark);
      ch.name = 'chain' + i;
      pan.add(ch);
      ch.userData.a = a;
    }
  }
  let craneYaw = -Math.PI / 2; // arm points west over the yard
  let drop = 1.2;               // cable length
  let tilt = 0, tiltVel = 0;
  const weights: { units: number; mesh: THREE.Mesh; home: THREE.Vector3; on: boolean; it: any }[] = [];
  const load = () => weights.reduce((s, w) => s + (w.on ? w.units : 0), 0);
  const panWorld = new THREE.Vector3();

  function layoutCrane() {
    crane.rotation.y = craneYaw;
    beam.rotation.x = tilt;
    const tipY = CR.h - Math.sin(tilt) * CR.arm;
    const tipZ = Math.cos(tilt) * CR.arm;
    cable.position.set(0, tipY - drop / 2, tipZ);
    cable.scale.y = drop;
    hungMast.position.set(0, tipY - drop, tipZ);
    const cy = CR.h + Math.sin(tilt) * CR.counter, cz = -Math.cos(tilt) * CR.counter;
    const panY = 1.0;
    pan.position.set(0, panY, cz);
    for (const ch of pan.children) {
      if (!ch.name.startsWith('chain')) continue;
      const a = ch.userData.a as number;
      const from = new THREE.Vector3(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5), to = new THREE.Vector3(0, cy - panY, 0);
      ch.position.copy(from).lerp(to, 0.5);
      ch.scale.y = from.distanceTo(to);
      ch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize());
    }
    pan.getWorldPosition(panWorld);
    // stack the loaded weights on the pan
    let y = 0.03;
    for (const w of weights) {
      if (!w.on || w.mesh.userData.moving) continue;
      const s = w.mesh.userData.size as number;
      w.mesh.position.set(panWorld.x, panWorld.y + y + s / 2, panWorld.z);
      w.it.pos.copy(w.mesh.position);
      y += s;
    }
  }

  const spots: [number, number, number][] = [[1, 93, 13], [2, 85, 25], [3, 101, 2.5], [1, 77, 3], [3, 96, 27.5], [2, 71, 20]];
  spots.forEach(([units, lx, lz], i) => {
    const size = 0.24 + units * 0.08;
    const mesh = b.box(lx, DECK + size / 2, lz, size, size, size, MAT.steel, i * 0.7, false);
    mesh.userData.size = size;
    mesh.userData.static = false;
    for (let k = 0; k < units; k++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(size * 1.02, 0.035, size * 1.02), MAT.bone);
      stripe.position.y = -size / 2 + (size / (units + 1)) * (k + 1);
      mesh.add(stripe);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12), MAT.dark);
    ring.position.y = size / 2 + 0.05;
    mesh.add(ring);
    const home = mesh.position.clone();
    const w = { units, mesh, home, on: false, it: null as any };
    w.it = {
      pos: home.clone(), radius: 1.9,
      enabled: () => !state.flag('mast') && !mesh.userData.moving && !carried,
      use: () => {
        // lift it: it comes off the pan or the ground and into both hands
        carried = w;
        w.on = false;
        ctx.sfx('lift', mesh.position);
        ctx.setCarry({ obj: mesh, size, drop: () => {
          // set down on the ground a step ahead
          const p = ctx.playerPos(), d = ctx.view.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
          const x = p.x + d.x * 0.9, z = p.z + d.z * 0.9;
          settle(w, new THREE.Vector3(x, world.groundAt(x, z, p.y + 0.3) + size / 2, z), true);
        } });
        saveWeights();
      },
    };
    world.interactables.push(w.it);
    weights.push(w);
  });
  let carried: (typeof weights)[number] | null = null;
  /** let go of the carried weight and move it to where it is going */
  function settle(w: (typeof weights)[number], to: THREE.Vector3, ground: boolean) {
    carried = null;
    ctx.setCarry(null);
    const mesh = w.mesh, from = mesh.position.clone();
    mesh.userData.moving = true;
    world.tween(0.32, (k) => { mesh.position.lerpVectors(from, to, k); mesh.rotation.x *= 1 - k; mesh.rotation.z *= 1 - k; }, () => {
      mesh.userData.moving = false;
      if (ground) w.home.copy(to);
      w.it.pos.copy(mesh.position);
      ctx.sfx(ground ? 'thud' : 'clank', to, 0.6);
      saveWeights();
    });
  }
  // the pan: somewhere to put what you are carrying
  world.interactables.push({
    pos: panWorld, radius: 2.3,
    enabled: () => !!carried && !state.flag('mast'),
    use: () => { const w = carried!; w.on = true; settle(w, panWorld.clone().add(new THREE.Vector3(0, 0.3, 0)), false); },
  });
  const saveWeights = () => state.set('weights', weights.reduce((s, w, i) => s | (w.on ? 1 << i : 0), 0));

  function stepMast(instant: boolean) {
    const finish = () => {
      hungMast.visible = false;
      boat.hasMast = true;
      drop = 1.2;
      layoutCrane();
    };
    if (instant) { craneYaw = -Math.PI; finish(); return; }
    ctx.sfx('winch', crane.position);
    world.tween(7, (k) => { craneYaw = -Math.PI / 2 - (Math.PI / 2) * k; winch.rotation.x = k * 30; crank.rotation.x = k * 30; }, () => {
      ctx.sfx('winch', crane.position);
      world.tween(5, (k) => { drop = 1.2 + 3.35 * k; winch.rotation.x = 30 + k * 30; }, () => { ctx.sfx('thud', crane.position); finish(); });
    });
  }
  world.interactables.push({
    pos: P(WX, DECK + 1.0, WZ), radius: 1.9,
    enabled: () => !state.flag('mast') && !carried,
    use: () => {
      if (load() === 4) { state.set('mast'); stepMast(false); }
      else { tiltVel += load() < 4 ? 0.5 : -0.5; ctx.sfx('groan', crane.position); }
    },
  });
  world.updaters.push((dt) => {
    // the beam settles toward balance like a scale
    const target = state.flag('mast') ? 0 : THREE.MathUtils.clamp((4 - load()) * 0.045, -0.2, 0.2);
    tiltVel += ((target - tilt) * 14 - tiltVel * 3.2) * dt;
    tilt += tiltVel * dt;
    layoutCrane();
  });

  // ---------- sail loft with the light lock ----------
  const LF = { x: 64, z: -15, w: 12, d: 8, h: 4.6 };
  const wy = DECK + LF.h / 2;
  b.box(LF.x, wy, LF.z - LF.d / 2 + 0.2, LF.w, LF.h, 0.4, MAT.concrete);                    // back
  b.box(LF.x - LF.w / 2 + 0.2, wy, LF.z, 0.4, LF.h, LF.d, MAT.concrete);                    // west
  b.box(LF.x + LF.w / 2 - 0.2, wy, LF.z, 0.4, LF.h, LF.d, MAT.concrete);                    // east
  b.box(LF.x - 3.5, wy, LF.z + LF.d / 2 - 0.2, 5, LF.h, 0.4, MAT.concrete);                 // front left
  b.box(LF.x + 3.5, wy, LF.z + LF.d / 2 - 0.2, 5, LF.h, 0.4, MAT.concrete);                 // front right
  b.box(LF.x, DECK + 2.5 + (LF.h - 2.5) / 2, LF.z + LF.d / 2 - 0.2, 2, LF.h - 2.5, 0.4, MAT.concrete, 0, false); // lintel
  b.box(LF.x, DECK + LF.h + 0.15, LF.z, LF.w + 0.8, 0.3, LF.d + 0.8, MAT.concrete);                     // roof
  b.box(LF.x, DECK - 0.02, LF.z, LF.w, 0.1, LF.d, MAT.concrete, 0, false);                                         // floor
  b.trim(LF.x, DECK, LF.z, LF.w, LF.h, LF.d, MAT.dark, 0.2);
  const door = b.box(LF.x, DECK + 1.25, LF.z + LF.d / 2 - 0.2, 2, 2.5, 0.16, MAT.rust, 0, false);
  door.userData.static = false;
  const doorCol = world.addBox(IX + LF.x, DECK + 1.25, IZ + LF.z + LF.d / 2 - 0.2, 1, 1.25, 0.2);
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.2, emissive: '#ffd9a0', emissiveIntensity: 0 });
  const eye = b.mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 20), eyeMat, LF.x, DECK + 3.2, LF.z + LF.d / 2 + 0.02, false);
  eye.rotation.x = Math.PI / 2;
  const eyeRing = b.mesh(new THREE.TorusGeometry(0.26, 0.04, 8, 24), MAT.brass, LF.x, DECK + 3.2, LF.z + LF.d / 2 + 0.03, false);
  // sail bundle on a trestle inside
  b.box(LF.x, DECK + 0.77, LF.z - 2.4, 2.6, 0.06, 0.7, MAT.wood, 0, false);
  for (const tx of [-1.05, 1.05]) {
    for (const tz of [-1, 1]) b.box(LF.x + tx, DECK + 0.37, LF.z - 2.4 + tz * 0.22, 0.07, 0.78, 0.07, MAT.wood, 0, false).rotation.x = tz * 0.26;
    b.box(LF.x + tx, DECK + 0.3, LF.z - 2.4, 0.05, 0.05, 0.5, MAT.paleWood, 0, false);
  }
  b.box(LF.x, DECK + 0.3, LF.z - 2.4, 2.1, 0.05, 0.05, MAT.paleWood, 0, false);
  world.addBox(IX + LF.x, DECK + 0.4, IZ + LF.z - 2.4, 1.3, 0.4, 0.35);
  const bundle = b.mesh(new THREE.CapsuleGeometry(0.22, 2.2, 6, 12), new THREE.MeshStandardMaterial({ color: '#c9c0aa', roughness: 0.95 }), LF.x, DECK + 1.0, LF.z - 2.4);
  bundle.rotation.z = Math.PI / 2;
  bundle.userData.static = false;
  for (const dx of [-0.7, 0, 0.7]) {
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 14), MAT.rope);
    tie.rotation.x = Math.PI / 2; tie.position.y = dx;
    bundle.add(tie);
  }
  world.interactables.push({
    pos: P(LF.x, DECK + 1, LF.z - 2.0), radius: 2.0,
    enabled: () => !state.flag('sailTaken'),
    use: () => { state.set('sailTaken'); state.give('sail'); bundle.visible = false; ctx.sfx('cloth', bundle.position); },
  });
  // crates left where they were dropped, some stacked, none square to the walls
  for (const [x, z, sz, yaw, y] of [
    [-4.75, -2.6, 1.1, 0.22, 0], [-4.7, -2.5, 0.7, 0.75, 1.1], [-4.55, -1.15, 0.9, -0.38, 0], [-4.85, 0.25, 0.7, 0.95, 0], [-4.3, 1.5, 0.55, 0.3, 0],
    [4.5, -2.45, 1.2, 0.16, 0], [4.6, -2.35, 0.75, 0.85, 1.2], [4.35, -0.85, 0.8, -0.5, 0], [4.75, 0.75, 1.0, 0.33, 0], [3.55, -2.95, 0.6, 1.1, 0], [4.7, 0.7, 0.5, -0.2, 1.0],
  ] as const) b.crate(LF.x + x, DECK + y, LF.z + z, sz, MAT.wood, MAT.paleWood, yaw);

  // the mirror on a post in the yard
  const MR = { x: 64, z: 4, y: DECK + 1.7 };
  b.cyl(MR.x, MR.z, 0.08, DECK, MR.y - 0.1, MAT.rust, false, 0.06, 8);
  world.addCyl(IX + MR.x, IZ + MR.z, 0.25, DECK, DECK + 1.5);
  const mirror = new THREE.Group();
  mirror.position.set(IX + MR.x, MR.y, IZ + MR.z);
  scene.add(mirror);
  const glassMat = new THREE.MeshStandardMaterial({ color: '#dfe6e8', roughness: 0.05, metalness: 1, emissive: '#fff2d6', emissiveIntensity: 0 });
  {
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.42, 28), glassMat);
    face.position.z = 0.03;
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 28), MAT.brass);
    back.rotation.x = Math.PI / 2;
    back.castShadow = true;
    mirror.add(face, back);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.04), MAT.dark);
    handle.position.set(0, -0.5, -0.05);
    mirror.add(handle);
    // the collector: a brass dish open to the sky that gathers the sun and drops it down a tube onto the mirror
    const dishPts = [[0.02, 0], [0.16, 0.03], [0.32, 0.11], [0.46, 0.24], [0.52, 0.33]].map(([r, y]) => new THREE.Vector2(r, y));
    const dishMat = MAT.brass.clone(); dishMat.side = THREE.DoubleSide;
    const dish = new THREE.Mesh(new THREE.LatheGeometry(dishPts, 28), dishMat);
    dish.position.set(0, 1.0, -0.12); dish.castShadow = true;
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10), glassMat);
    lens.position.set(0, 1.07, -0.12); lens.scale.y = 0.5;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.56, 10), MAT.brass);
    tube.position.set(0, 0.72, -0.12); tube.castShadow = true;
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.14), MAT.brass);
    yoke.position.set(0, 0.45, -0.07);
    for (let i = 0; i < 3; i++) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 5), MAT.dark);
      const a = (i / 3) * Math.PI * 2 + 0.5;
      strut.position.set(Math.cos(a) * 0.2, 1.2, -0.12 + Math.sin(a) * 0.2); strut.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
      mirror.add(strut);
    }
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), MAT.dark);
    cap.position.set(0, 1.36, -0.12);
    mirror.add(dish, lens, tube, yoke, cap);
  }
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffe6b8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1, 12, 1, true), beamMat);
  ray.geometry.rotateX(Math.PI / 2);
  ray.geometry.translate(0, 0, 0.5);
  mirror.add(ray);
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), beamMat);
  scene.add(spot);
  const STEPS = 16;
  let mStep = state.flag('mirror') || 3;
  let mYaw = (mStep / STEPS) * Math.PI * 2;
  world.interactables.push({
    pos: P(MR.x, MR.y - 0.6, MR.z), radius: 1.8,
    enabled: () => !state.flag('loft'),
    use: () => { mStep = (mStep + 1) % STEPS; state.set('mirror', mStep); ctx.sfx('ratchet', mirror.position); },
  });
  world.interactables.push({
    pos: P(LF.x, DECK + 1.2, LF.z + LF.d / 2 + 0.1), radius: 1.5,
    enabled: () => !state.flag('loft'),
    use: () => { ctx.sfx('clank', door.position); world.tween(0.45, (k) => { door.position.x = IX + LF.x + Math.sin(k * Math.PI * 4) * 0.015 * (1 - k); }); },
  });
  const openLoft = (instant: boolean) => {
    world.remove(doorCol);
    if (instant) { door.position.y = DECK + 3.9; return; }
    ctx.sfx('door', door.position);
    world.tween(4, (k) => { door.position.y = DECK + 1.25 + 2.65 * k; });
  };
  world.updaters.push((dt) => {
    const target = (mStep / STEPS) * Math.PI * 2;
    let d = target - mYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    mYaw += d * Math.min(1, dt * 6);
    mirror.rotation.y = mYaw;
    const lit = smooth(0.12, 0.3, ctx.env.daylight);
    glassMat.emissiveIntensity = lit * 2.5;
    // where does the thrown light land?
    const dx = Math.sin(mYaw), dz = Math.cos(mYaw);
    let len = 26, onWall = false;
    const wallZ = LF.z + LF.d / 2 + 0.01;
    if (dz < -0.2) {
      const k = (wallZ - MR.z) / dz;
      const hx = MR.x + dx * k;
      if (Math.abs(hx - LF.x) < LF.w / 2) { len = k; onWall = true; spot.position.set(IX + hx, DECK + 3.2, IZ + wallZ + 0.02); }
    }
    // the beam climbs from the mirror to the height of the receiver, so it meets the wall exactly where the spot is
    const rise = onWall ? DECK + 3.2 - MR.y : 1.5 * (len / 15);
    ray.scale.set(1, 1, Math.hypot(len, rise));
    ray.rotation.x = -Math.atan2(rise, len);
    beamMat.opacity = lit * 0.05;
    spot.visible = onWall && lit > 0.02;
    const onEye = mStep === STEPS / 2 && Math.abs(d) < 0.05;
    const aligned = onEye && lit > 0.5;
    if (aligned && !state.flag('loft')) { state.set('loft'); openLoft(false); }
    // the receiver only shines while light is actually falling on it: dark at night, dark when the mirror is turned away
    eyeMat.emissiveIntensity += ((onEye ? 3 * lit : 0) - eyeMat.emissiveIntensity) * Math.min(1, dt * 6);
  });

  // ---------- sluice valves ----------
  const VX = [121, 123, 125];
  const MARKS = [2, 3, 1];            // pale bars above each wheel
  const ORDER = [2, 0, 1];            // so the wheels are opened 1, 2, 3
  b.box(123, DECK + 1.0, 1.0, 6.4, 2.0, 0.3, MAT.concrete);
  b.bar(119.6, DECK + 0.45, 1.35, 126.4, DECK + 0.45, 1.35, 0.14, MAT.rust, 10);
  b.bar(126.4, DECK + 0.45, 1.35, 126.4, DECK + 0.45, 6.6, 0.14, MAT.rust, 10);
  b.bar(119.6, DECK + 0.45, 1.35, 119.6, -1, 1.35, 0.14, MAT.rust, 10);
  const wheels: THREE.Group[] = [];
  let opened = 0;
  VX.forEach((x, i) => {
    const w = new THREE.Group();
    w.position.set(IX + x, DECK + 1.15, IZ + 1.55);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 8, 22), MAT.red);
    rim.castShadow = true;
    w.add(rim);
    for (let k = 0; k < 3; k++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), MAT.red);
      sp.rotation.z = (k / 3) * Math.PI;
      w.add(sp);
    }
    scene.add(w);
    wheels.push(w);
    b.bar(x, DECK + 1.15, 1.2, x, DECK + 1.15, 1.55, 0.035, MAT.dark);
    b.bar(x, DECK + 0.45, 1.35, x, DECK + 1.15, 1.35, 0.07, MAT.rust, 8);
    for (let k = 0; k < MARKS[i]; k++) b.box(x - (MARKS[i] - 1) * 0.09 + k * 0.18, DECK + 1.75, 1.17, 0.07, 0.28, 0.03, MAT.bone, 0, false);
    world.interactables.push({
      pos: P(x, DECK + 1.1, 1.9), radius: 1.3,
      enabled: () => !state.flag('flooded') && w.userData.open !== true,
      use: () => {
        if (ORDER[opened] === i) {
          w.userData.open = true;
          opened++;
          ctx.sfx('valve', w.position);
          world.tween(1.6, (k) => { w.rotation.z = k * 9; });
          if (opened === 3) { state.set('flooded'); flood(false); }
        } else {
          // wrong wheel: everything spins shut again
          ctx.sfx('clank', w.position);
          opened = 0;
          for (const o of wheels) {
            const from = o.rotation.z;
            o.userData.open = false;
            world.tween(0.9, (k) => { o.rotation.z = from * (1 - k) + Math.sin(k * 20) * 0.05 * (1 - k); });
          }
        }
      },
    });
  });

  function flood(instant: boolean) {
    const finish = () => {
      lid.visible = false; fill.visible = false;
      gate.position.y = -5.2;
      world.remove(gateCol);
      if (boat.mode === 'cradle') { boat.mode = 'moored'; boat.mooring = mooring; }
    };
    if (instant) { finish(); return; }
    fill.visible = true;
    ctx.sfx('flood', fill.position);
    world.tween(16, (k) => {
      fill.position.y = -1.28 + 1.3 * k;
      // the hull lifts off its blocks as the water reaches it
      boat.cradle.y = -0.72 + Math.max(0, k - 0.42) * 1.3;
    }, () => {
      ctx.sfx('gate', gate.position);
      world.tween(6, (k) => { gate.position.y = -0.6 - 4.6 * k; }, finish);
    });
  }

  // ---------- the pump: a long lever by the valve wall that shuts the gate and empties the dock again ----------
  {
    const LX = 128.2, LZ = 1.9;
    b.box(LX, DECK + 0.25, LZ, 0.5, 0.5, 0.5, MAT.rust);
    b.bar(LX, DECK + 0.3, LZ, 126.4, DECK + 0.45, 1.35, 0.07, MAT.rust, 8);
    const lever = new THREE.Group();
    lever.position.set(IX + LX, DECK + 0.5, IZ + LZ);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.3, 8), MAT.dark); rod.position.y = 0.65; rod.castShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), MAT.red); knob.position.y = 1.32;
    lever.add(rod, knob);
    lever.rotation.x = -0.45;
    scene.add(lever);
    let draining = false;
    world.interactables.push({
      pos: P(LX, DECK + 1.0, LZ + 0.4), radius: 1.5,
      enabled: () => !!state.flag('flooded') && !draining && boat.mode !== 'sailing',
      use: () => {
        // only with the boat on its blocks in the dock, or away from the dock altogether
        const inDock = boat.mode === 'moored' && boat.mooring === mooring;
        const near = Math.hypot(boat.position.x - IX - 119, boat.position.z - IZ - 10) < 14;
        if (!inDock && near) { ctx.sfx('clank', lever.position); return; }
        draining = true;
        ctx.sfx('ratchet', lever.position);
        world.tween(0.8, (k) => { lever.rotation.x = -0.45 + 0.9 * k; });
        ctx.sfx('gate', gate.position);
        world.tween(6, (k) => { gate.position.y = -5.2 + 4.6 * k; }, () => {
          gateCol = world.addBox(IX + 130.2, -0.6, IZ + 10, 0.3, 2.2, 3.3);
          lid.visible = true; fill.visible = true; fill.position.y = 0.02;
          if (inDock) { boat.mode = 'cradle'; boat.mooring = null; boat.cradle.y = 0.034; }
          ctx.sfx('flood', fill.position);
          world.tween(14, (k) => {
            fill.position.y = 0.02 - 1.3 * k;
            if (inDock) boat.cradle.y = Math.max(-0.72, 0.034 - 1.3 * k);
          }, () => {
            fill.visible = false;
            state.set('flooded', 0);
            opened = 0;
            for (const o of wheels) { o.userData.open = false; o.rotation.z = 0; }
            world.tween(0.8, (k) => { lever.rotation.x = 0.45 - 0.9 * k; });
            draining = false;
          });
        });
      },
    });
  }

  // rigging the sail onto the stepped mast
  world.interactables.push({
    pos: P(119, DECK + 0.6, 13.6), radius: 2.2,
    enabled: () => state.has('sail') && !!state.flag('mast') && !state.flag('sailRigged'),
    use: () => { state.take('sail'); state.set('sailRigged'); boat.hasSail = true; ctx.sfx('cloth', boat.position); },
  });

  // ---------- restore saved progress ----------
  boat.hasMast = !!state.flag('mast');
  boat.hasSail = !!state.flag('sailRigged');
  if (state.flag('mast')) stepMast(true);
  if (state.flag('sailTaken')) bundle.visible = false;
  if (state.flag('loft')) openLoft(true);
  const wbits = state.flag('weights');
  weights.forEach((w, i) => { w.on = !!(wbits & (1 << i)); });
  if (state.flag('flooded')) { opened = 3; wheels.forEach((w) => { w.userData.open = true; w.rotation.z = 9; }); flood(true); }
  layoutCrane();

  // ---------- the storehouse: a windowless block where things were put and forgotten ----------
  {
    const X = 50, Z = 10.5, W = 9, D = 7, H = 3.6, T = 0.35, wy = DECK + H / 2;
    b.box(X - W / 2 + T / 2, wy, Z, T, H, D, MAT.concrete);                              // west
    b.box(X, wy, Z - D / 2 + T / 2, W, H, T, MAT.concrete);                              // south
    b.box(X, wy, Z + D / 2 - T / 2, W, H, T, MAT.concrete);                              // north
    b.box(X + W / 2 - T / 2, wy, Z - 2.25, T, H, 2.5, MAT.concrete);                     // east, either side of the doorway
    b.box(X + W / 2 - T / 2, wy, Z + 2.25, T, H, 2.5, MAT.concrete);
    b.box(X + W / 2 - T / 2, DECK + 2.3 + (H - 2.3) / 2, Z, T, H - 2.3, 2.0, MAT.concrete, 0, false);
    b.box(X, DECK - 0.02, Z, W, 0.1, D, MAT.concrete, 0, false);
    // the roof has lost a strip of sheeting: daylight falls in through the gap
    b.box(X - 2.9, DECK + H + 0.1, Z, 3.6, 0.16, D + 0.8, MAT.corrugated);
    b.box(X + 2.9, DECK + H + 0.1, Z, 3.6, 0.16, D + 0.8, MAT.corrugated);
    for (const z of [-2.6, 0, 2.6]) b.box(X, DECK + H - 0.1, Z + z, W - 0.4, 0.14, 0.14, MAT.rust, 0, false);
    b.trim(X, DECK, Z, W, H, D, MAT.dark, 0.2);
    // a door hanging off one hinge
    b.box(X + W / 2 + 0.25, DECK + 1.1, Z + 1.35, 0.07, 2.2, 1.0, MAT.rust, 0.5, false).rotation.z = 0.06;
    // shelving down the west wall and a long bench on the north
    for (const y of [0.5, 1.2, 1.9]) b.box(X - W / 2 + T + 0.3, DECK + y, Z, 0.55, 0.05, D - 1.2, MAT.paleWood, 0, false);
    for (const z of [-2.7, 0, 2.7]) b.box(X - W / 2 + T + 0.3, DECK + 1.0, Z + z, 0.6, 2.0, 0.07, MAT.wood, 0, false);
    world.addBox(IX + X - W / 2 + T + 0.3, DECK + 1, IZ + Z, 0.32, 1, D / 2 - 0.6);
    {
      // a long work table on the north wall: top, apron, six legs and a low stretcher shelf
      const tx = X + 0.6, tz = Z + D / 2 - T - 0.4, L = 5.0, Wd = 0.75;
      b.box(tx, DECK + 0.805, tz, L, 0.07, Wd, MAT.wood, 0, false);
      b.box(tx, DECK + 0.72, tz - Wd / 2 + 0.05, L - 0.16, 0.1, 0.03, MAT.paleWood, 0, false);
      b.box(tx, DECK + 0.72, tz + Wd / 2 - 0.05, L - 0.16, 0.1, 0.03, MAT.paleWood, 0, false);
      for (const lx of [-L / 2 + 0.1, 0, L / 2 - 0.1]) for (const lz of [-Wd / 2 + 0.07, Wd / 2 - 0.07]) b.box(tx + lx, DECK + 0.385, tz + lz, 0.08, 0.77, 0.08, MAT.wood, 0, false);
      for (const lx of [-L / 2 + 0.1, 0, L / 2 - 0.1]) b.box(tx + lx, DECK + 0.2, tz, 0.05, 0.05, Wd - 0.14, MAT.wood, 0, false);
      b.box(tx, DECK + 0.24, tz, L - 0.2, 0.03, 0.34, MAT.paleWood, 0, false);
      world.addBox(IX + tx, DECK + 0.42, IZ + tz, L / 2, 0.42, Wd / 2);
    }
  }

  // ---------- the yard: sheds, wrecks and clutter ----------
  // an open-sided boat shed
  for (const [x, z] of [[78, 30], [90, 30], [78, 38], [90, 38]] as const) b.box(x, DECK + 2.2, z, 0.4, 4.4, 0.4, MAT.concrete);
  b.box(84, DECK + 4.55, 34, 14, 0.3, 10, MAT.corrugated, 0, false);
  // the ribs of a hull that was never finished
  for (let i = 0; i < 9; i++) {
    const k = i / 8, w = 0.4 + Math.sin(k * Math.PI) * 0.9;
    const rib = new THREE.Mesh(new THREE.TorusGeometry(w, 0.045, 6, 14, Math.PI), MAT.paleWood);
    rib.rotation.set(Math.PI, 0.5, 0);
    rib.position.set(IX + 82 + Math.sin(0.5) * (i - 4) * 0.7 + 0, DECK + w + 0.25, IZ + 33 + Math.cos(0.5) * (i - 4) * 0.7);
    rib.castShadow = true;
    scene.add(rib);
  }
  b.box(82, DECK + 0.14, 33, 0.22, 0.28, 6.4, MAT.wood, 0.5);
  // drums, crates, a rail slip
  const rr = rng(21);
  for (let i = 0; i < 20; i++) {
    const x = 60 + rr() * 38, z = -6 + rr() * 36;
    if (Math.hypot(x - 64, z - 4) < 4 || Math.hypot(x - 82, z - 33) < 6) continue;
    if (Math.abs(x - 50) < 7 && Math.abs(z - 10.5) < 6) continue; // the storehouse
    if (rr() < 0.5) b.drum(x, z, DECK, rr() < 0.5 ? MAT.rust : MAT.red, MAT.dark, 0.29, 0.88, true, rr() < 0.2 ? rr() * 3 : 0);
    else { const s = 0.6 + rr() * 0.6; b.crate(x, DECK, z, s, MAT.wood, MAT.paleWood, rr() * 3); }
  }
  // the slip: rails from the yard to the dock head, and on along the dock floor under the cradle
  for (const z of [8.6, 11.4]) {
    b.box(103, DECK + 0.05, z, 14, 0.1, 0.12, MAT.steel, 0, false);
    b.box(119.6, -1.25, z, 19, 0.1, 0.12, MAT.steel, 0, false);
    b.box(95.8, DECK + 0.2, z, 0.25, 0.4, 0.3, MAT.rust, 0, false);                     // buffer stop
  }
  for (let x = 96.6; x < 110; x += 1.1) b.box(x, DECK + 0.02, 10, 0.22, 0.05, 3.4, MAT.wood, 0, false);   // sleepers

  // dock lamp
  b.cyl(129.2, 18.8, 0.07, DECK, DECK + 3.4, MAT.dark, false, 0.05, 8);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#2a2622', emissive: '#ffb86a', emissiveIntensity: 0 });
  b.mesh(new THREE.SphereGeometry(0.16, 12, 8), lampMat, 129.2, DECK + 3.5, 18.8, false);
  const lamp = new THREE.PointLight('#ffb070', 0, 26, 1.6);
  lamp.position.set(IX + 129.2, DECK + 3.5, IZ + 18.8);
  scene.add(lamp);

  // ---------- the house on the terrace ----------
  const HX = 26, HZ = -51, HY = 9.5;
  // a one-room home: walls you can walk between, a bed, a table, a stove, and a lamp that is never put out
  {
    const T = 0.25, H = 3, wy = HY + H / 2;
    b.box(HX - 3 + T / 2, wy, HZ, T, H, 5, MAT.concrete);                                   // west
    b.box(HX, wy, HZ - 2.5 + T / 2, 6, H, T, MAT.concrete);                                 // south
    b.box(HX, wy, HZ + 2.5 - T / 2, 6, H, T, MAT.concrete);                                 // north
    // east wall south of the door, built round a window opening (z -2.2..-1.3, y 1.2..1.95)
    b.box(HX + 3 - T / 2, HY + 0.6, HZ - 1.0, T, 1.2, 3.0, MAT.concrete);
    b.box(HX + 3 - T / 2, HY + 1.95 + (H - 1.95) / 2, HZ - 1.0, T, H - 1.95, 3.0, MAT.concrete);
    b.box(HX + 3 - T / 2, HY + 1.575, HZ - 2.35, T, 0.75, 0.3, MAT.concrete);
    b.box(HX + 3 - T / 2, HY + 1.575, HZ - 0.4, T, 0.75, 1.8, MAT.concrete);
    {
      const wx = HX + 3 - T / 2, wz = HZ - 1.75;
      const paneMat = new THREE.MeshPhysicalMaterial({ color: '#c9d6d2', roughness: 0.08, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
      const pane = b.mesh(new THREE.BoxGeometry(0.012, 0.75, 0.9), paneMat, wx, HY + 1.575, wz, false);
      pane.userData.static = false; pane.renderOrder = 5;
      for (const dz of [-0.45, 0.45]) b.box(wx, HY + 1.575, wz + dz, T + 0.04, 0.79, 0.045, MAT.wood, 0, false);
      for (const dy of [-0.375, 0.375]) b.box(wx, HY + 1.575 + dy, wz, T + 0.04, 0.045, 0.94, MAT.wood, 0, false);
      b.box(wx, HY + 1.575, wz, 0.03, 0.75, 0.025, MAT.wood, 0, false); b.box(wx, HY + 1.575, wz, 0.03, 0.025, 0.9, MAT.wood, 0, false);   // glazing bars
      b.box(wx + 0.02, HY + 1.19, wz, T + 0.14, 0.04, 1.0, MAT.wood, 0, false);                                                             // sill
      world.addBox(IX + wx, HY + 1.575, IZ + wz, T / 2, 0.4, 0.45);
    }
    b.box(HX + 3 - T / 2, wy, HZ + 2.0, T, H, 1.0, MAT.concrete);                           // east, north of the door
    b.box(HX + 3 - T / 2, HY + 2.1 + (H - 2.1) / 2, HZ + 1.0, T, H - 2.1, 1.0, MAT.concrete, 0, false);
    for (const ax of [-1, 1]) for (const az of [-1, 1]) b.box(HX + ax * 3, HY + H / 2, HZ + az * 2.5, 0.2, H + 0.02, 0.2, MAT.dark, 0, false);
    for (const az of [-1, 1]) b.box(HX, HY + H - 0.09, HZ + az * 2.5, 6.2, 0.18, 0.15, MAT.dark, 0, false);
    for (const ax of [-1, 1]) b.box(HX + ax * 3, HY + H - 0.09, HZ, 0.15, 0.18, 5.2, MAT.dark, 0, false);
    b.box(HX - 3, HY + 0.11, HZ, 0.15, 0.22, 5.2, MAT.dark, 0, false);
    for (const az of [-1, 1]) b.box(HX, HY + 0.11, HZ + az * 2.5, 6.2, 0.22, 0.15, MAT.dark, 0, false);
    b.box(HX, HY + 0.035, HZ, 5.5, 0.07, 4.5, MAT.wood, 0, false);                          // floor boards
    b.box(HX, HY + H - 0.06, HZ, 5.5, 0.06, 4.5, MAT.paleWood);                             // ceiling
    b.box(HX + 2.55, HY + 1.05, HZ + 0.42, 0.9, 2.0, 0.05, MAT.wood, 0, false);             // the door, standing open inward
    // bed: turned posts, a slatted head and foot, side rails, a mattress and bedding with some give in it
    {
      const BX = HX - 2.15, BZ = HZ - 1.25, quilt = new THREE.MeshStandardMaterial({ color: '#7d2a22', roughness: 0.95 }), linen = new THREE.MeshStandardMaterial({ color: '#cfc7b3', roughness: 0.95 });
      for (const sx of [-0.47, 0.47]) {
        b.bar(BX + sx, HY + 0.07, BZ - 0.98, BX + sx, HY + 1.12, BZ - 0.98, 0.035, MAT.wood, 8);     // head posts
        b.bar(BX + sx, HY + 0.07, BZ + 0.98, BX + sx, HY + 0.72, BZ + 0.98, 0.035, MAT.wood, 8);     // foot posts
        b.mesh(new THREE.SphereGeometry(0.05, 10, 8), MAT.wood, BX + sx, HY + 1.15, BZ - 0.98, false);
        b.mesh(new THREE.SphereGeometry(0.05, 10, 8), MAT.wood, BX + sx, HY + 0.75, BZ + 0.98, false);
        b.box(BX + sx, HY + 0.36, BZ, 0.035, 0.14, 1.96, MAT.wood, 0, false);                        // side rails
      }
      for (const y of [0.55, 0.78, 1.0]) b.box(BX, HY + y, BZ - 0.98, 0.9, 0.11, 0.028, MAT.wood, 0, false);
      for (const y of [0.4, 0.6]) b.box(BX, HY + y, BZ + 0.98, 0.9, 0.1, 0.028, MAT.wood, 0, false);
      for (let i = 0; i < 7; i++) b.box(BX, HY + 0.33, BZ - 0.84 + i * 0.28, 0.9, 0.022, 0.1, MAT.paleWood, 0, false);
      // mattress with softened edges: a slab, and a slightly smaller, slightly higher crown on it
      b.box(BX, HY + 0.43, BZ, 0.9, 0.14, 1.9, linen, 0, false);
      const crown = b.mesh(new THREE.SphereGeometry(0.5, 16, 10), linen, BX, HY + 0.47, BZ, false); crown.scale.set(0.9, 0.09, 1.9);
      // quilt: over the lower two thirds, hanging down both sides, turned back at the top
      b.box(BX, HY + 0.515, BZ + 0.33, 0.95, 0.04, 1.24, quilt, 0, false);
      for (let i = 0; i < 4; i++) b.box(BX, HY + 0.54, BZ - 0.1 + i * 0.3, 0.93, 0.012, 0.012, new THREE.MeshStandardMaterial({ color: '#5e1f19', roughness: 1 }), 0, false);   // quilting lines
      for (const sx of [-0.465, 0.465]) b.box(BX + sx, HY + 0.4, BZ + 0.33, 0.02, 0.22, 1.24, quilt, 0, false);
      b.box(BX, HY + 0.535, BZ - 0.28, 0.9, 0.035, 0.16, linen, 0, false);
      const pillow = b.mesh(new THREE.SphereGeometry(0.5, 14, 10), linen, BX, HY + 0.56, BZ - 0.72, false); pillow.scale.set(0.62, 0.11, 0.36); pillow.rotation.y = 0.08;
      world.addBox(IX + BX, HY + 0.3, IZ + BZ, 0.5, 0.3, 1.02);
    }
    // table and chair under the window
    b.box(HX + 1.6, HY + 0.74, HZ - 1.75, 1.2, 0.05, 0.75, MAT.wood, 0, false);
    for (const [x, z] of [[1.08, -2.05], [2.12, -2.05], [1.08, -1.45], [2.12, -1.45]] as const) b.box(HX + x, HY + 0.37, HZ + z, 0.06, 0.72, 0.06, MAT.wood, 0, false);
    world.addBox(IX + HX + 1.6, HY + 0.4, IZ + HZ - 1.75, 0.6, 0.4, 0.38);
    b.box(HX + 1.5, HY + 0.44, HZ - 0.95, 0.42, 0.04, 0.42, MAT.wood, 0, false); b.box(HX + 1.5, HY + 0.72, HZ - 0.76, 0.42, 0.5, 0.04, MAT.wood, 0, false);
    for (const [x, z] of [[1.32, -1.13], [1.68, -1.13], [1.32, -0.77], [1.68, -0.77]] as const) b.box(HX + x, HY + 0.22, HZ + z, 0.04, 0.44, 0.04, MAT.wood, 0, false);
    // stove in the corner, its pipe going up through the roof
    b.cyl(HX - 2.2, HZ + 1.75, 0.34, HY, HY + 0.85, MAT.dark, true, 0.34, 14);
    b.cyl(HX - 2.36, HZ + 1.91, 0.07, HY + 0.85, HY + 3.9, MAT.dark, false, 0.07, 10);
    b.cyl(HX - 2.36, HZ + 1.91, 0.1, HY + 0.85, HY + 0.9, MAT.dark, false, 0.1, 10);
    b.cyl(HX - 2.2, HZ + 1.75, 0.36, HY + 0.85, HY + 0.88, MAT.dark, false, 0.36, 18);      // hob plate
    const coal = new THREE.MeshStandardMaterial({ color: '#1a0a04', emissive: '#ff5a1a', emissiveIntensity: 2.5 });
    b.box(HX - 1.86, HY + 0.4, HZ + 1.75, 0.02, 0.18, 0.26, coal, 0, false);
    // shelf, rug, coat on a peg
    b.box(HX + 0.4, HY + 1.55, HZ + 2.12, 2.2, 0.04, 0.26, MAT.wood, 0, false);
    b.box(HX - 0.3, HY + 0.075, HZ + 0.2, 2.0, 0.012, 1.3, MAT.red, 0.15, false);
    {
      // an oilskin on a peg by the door: shoulders, a hanging body that widens to the hem, and sleeves
      const oil = new THREE.MeshStandardMaterial({ color: '#4a4226', roughness: 0.7 }), cx = HX + 2.64, cz = HZ - 0.25;
      b.box(HX + 2.72, HY + 1.78, cz, 0.08, 0.04, 0.04, MAT.dark, 0, false);
      const coatBody = b.mesh(new THREE.CylinderGeometry(0.17, 0.26, 1.0, 14, 4), oil, cx, HY + 1.2, cz, false); coatBody.scale.set(0.3, 1, 1);
      const yoke = b.mesh(new THREE.SphereGeometry(0.2, 12, 8), oil, cx, HY + 1.68, cz, false); yoke.scale.set(0.3, 0.45, 1.05);
      for (const dz of [-0.24, 0.24]) { const sl = b.mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.75, 8), oil, cx, HY + 1.3, cz + dz, false); sl.scale.x = 0.6; sl.rotation.x = dz * 0.35; }
    }
    // the lamp
    const shade = new THREE.MeshStandardMaterial({ color: '#3a2a18', emissive: '#ffb46a', emissiveIntensity: 3, side: THREE.DoubleSide });
    b.bar(HX, HY + H - 0.06, HZ - 0.2, HX, HY + 2.35, HZ - 0.2, 0.008, MAT.dark, 4);
    b.mesh(new THREE.ConeGeometry(0.2, 0.16, 16, 1, true), shade, HX, HY + 2.3, HZ - 0.2, false);
    b.mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffd9a0', emissiveIntensity: 9 }), HX, HY + 2.22, HZ - 0.2, false);
    const lampIn = new THREE.PointLight('#ffb070', 15, 9, 1.5);
    lampIn.position.set(IX + HX, HY + 2.15, IZ + HZ - 0.2);
    scene.add(lampIn);
    const stoveGlow = new THREE.PointLight('#ff6a2a', 5, 4, 1.8);
    stoveGlow.position.set(IX + HX - 1.7, HY + 0.45, IZ + HZ + 1.75);
    scene.add(stoveGlow);
    world.updaters.push((_, t) => {
      const fl = 0.92 + Math.sin(t * 7.3) * 0.04 + Math.sin(t * 17.1) * 0.03;
      lampIn.intensity = 15 * fl; stoveGlow.intensity = 5 * (0.8 + Math.sin(t * 11) * 0.2); coal.emissiveIntensity = 2.5 * fl;
    });
  }
  b.box(HX + 5.2, HY + 0.1, HZ + 1.5, 4.6, 0.2, 6, MAT.paleWood);           // porch
  b.box(HX + 5.2, HY + 2.9, HZ + 1.5, 4.8, 0.12, 6.2, MAT.corrugated, 0, false);  // porch roof
  for (const [x, z] of [[7.3, -1.3], [7.3, 4.3]] as const) b.bar(HX + x, HY + 0.2, HZ + z, HX + x, HY + 2.9, HZ + z, 0.05, MAT.wood);
  // chair
  b.box(HX + 7.2, HY + 0.42, HZ + 3.8, 0.5, 0.06, 0.5, MAT.wood, 0, false);
  b.box(HX + 6.95, HY + 0.75, HZ + 3.8, 0.06, 0.7, 0.5, MAT.wood, 0, false);
  for (const [x, z] of [[7.0, 3.6], [7.4, 3.6], [7.0, 4.0], [7.4, 4.0]] as const) b.bar(HX + x, HY + 0.2, HZ + z, HX + x, HY + 0.42, HZ + z, 0.02, MAT.wood);
  world.addCyl(IX + HX + 7.2, IZ + HZ + 3.8, 0.45, HY, HY + 1.2);
  const houseLight = new THREE.PointLight('#ff9c4a', 0, 14, 1.8);
  houseLight.position.set(IX + HX + 4.5, HY + 2.2, IZ + HZ + 1);
  scene.add(houseLight);

  world.updaters.push(() => {
    const night = 1 - ctx.env.daylight;
    lampMat.emissiveIntensity = night * 4;
    lamp.intensity = night * 60;
    houseLight.intensity = night * 18;
  });

  // ---------- the summit: a telescope someone took the eyepiece from ----------
  {
    const SX = -44, SZ = -6, SY = 40.6;
    b.cyl(SX, SZ, 3.4, SY - 1.2, SY + 0.25, MAT.concrete, true, 3.4, 28);
    // what is left of a ring wall
    for (let i = 0; i < 14; i++) {
      if (i === 3 || i === 4 || i === 9) continue;                    // gaps: the way in, and where it has fallen
      const a = (i / 14) * Math.PI * 2, hh = 0.5 + ((i * 7) % 5) * 0.22;
      b.box(SX + Math.sin(a) * 3.1, SY + 0.25 + hh / 2, SZ + Math.cos(a) * 3.1, 1.3, hh, 0.4, MAT.concrete, a);
    }
    b.cyl(SX, SZ, 0.34, SY + 0.25, SY + 1.15, MAT.concrete, true, 0.28, 14);
    world.addCyl(IX + SX, IZ + SZ, 0.7, SY, SY + 2);
    const mount = new THREE.Group();
    mount.position.set(IX + SX, SY + 1.3, IZ + SZ);
    scene.add(mount);
    const fork = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.18), MAT.dark);
    fork.position.y = -0.12;
    mount.add(fork);
    for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.14), MAT.dark); arm.position.set(s * 0.23, 0.05, 0); mount.add(arm); }
    const tube = new THREE.Group();
    tube.position.y = 0.16;
    mount.add(tube);
    {
      const brass2 = MAT.brass.clone(); brass2.side = THREE.DoubleSide;
      const dark2 = MAT.dark.clone(); dark2.side = THREE.DoubleSide;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 2.3, 20, 1, true), brass2);
      body.rotation.x = Math.PI / 2; body.position.z = -0.45;                 // looks along -Z
      const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.35, 20, 1, true), dark2);
      hood.rotation.x = Math.PI / 2; hood.position.z = -1.72;
      const draw = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 14, 1, true), brass2);
      draw.rotation.x = Math.PI / 2; draw.position.z = 0.86;
      const glassM = new THREE.MeshStandardMaterial({ color: '#0b1014', roughness: 0.05, metalness: 0.6 });
      const front = new THREE.Mesh(new THREE.CircleGeometry(0.145, 20), glassM);
      front.rotation.y = Math.PI; front.position.z = -1.55;
      for (const z of [-1.2, -0.3, 0.55]) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 6, 22), MAT.dark); band.position.z = z; band.scale.setScalar(z > 0 ? 0.86 : 1); tube.add(band); }
      const finder = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), MAT.dark);
      finder.rotation.x = Math.PI / 2; finder.position.set(0.12, 0.17, 0.1);
      tube.add(body, hood, draw, front, finder);
      tube.traverse((m) => { m.castShadow = true; });
    }
    // the eyepiece: missing until the lens is brought up
    const eyepiece = makeItem('lens');
    eyepiece.scale.setScalar(1.15); eyepiece.rotation.x = Math.PI / 2; eyepiece.position.z = 1.07;
    eyepiece.visible = !!state.flag('scope');
    tube.add(eyepiece);
    addPickup(ctx, 'lens', 'lens', P(HX + 1.2, HY + 0.83, HZ - 1.55), { scale: 1.2 });   // it has been on the table in the house all along
    let yawT = 2.2, pitchT = 0.3, using = false;
    tube.rotation.order = 'YXZ';
    world.interactables.push({
      pos: P(SX, SY + 1.45, SZ), radius: 2.3,
      enabled: () => !using,
      use: () => {
        if (!state.flag('scope')) {
          if (state.take('lens')) { state.set('scope'); eyepiece.visible = true; ctx.sfx('unlock', mount.position); if (ctx.held() === 'lens') ctx.setHeld(null); }
          else { ctx.sfx('clank', mount.position); world.tween(0.5, (k) => { tube.rotation.z = Math.sin(k * Math.PI * 3) * 0.03 * (1 - k); }); }
          return;
        }
        using = true;
        ctx.scope(true, mount.position, () => { using = false; });
      },
    });
    world.updaters.push((dt) => {
      // while someone is at the eyepiece the tube follows their eye; otherwise it sags toward the horizon
      const v = ctx.scopeView();
      if (using && v) { yawT = v.yaw; pitchT = -v.pitch; }
      mount.visible = !using;                                   // the eye is inside the instrument
      mount.rotation.y += Math.atan2(Math.sin(yawT - mount.rotation.y), Math.cos(yawT - mount.rotation.y)) * Math.min(1, dt * 8);
      tube.rotation.x += (pitchT - tube.rotation.x) * Math.min(1, dt * 8);
    });
  }

  /** under a roof with walls round it: the house, the storehouse or the sail loft */
  const indoors = (p: THREE.Vector3) => {
    const lx = p.x - IX, lz = p.z - IZ;
    return (Math.abs(lx - HX) < 2.9 && Math.abs(lz - HZ) < 2.4 && p.y > HY - 0.5 && p.y < HY + 3)
      || (Math.abs(lx - 50) < 4.3 && Math.abs(lz - 10.5) < 3.3 && p.y < 5.5)
      || (Math.abs(lx - 64) < 5.8 && Math.abs(lz + 15) < 3.8 && p.y < 6.5);
  };
  return { mooring, start: P(74, DECK, 20), indoors };
}
