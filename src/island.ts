// The starting island: terrain, the abandoned boatyard and the three-part
// puzzle that gets the boat rigged and launched.
import * as THREE from 'three';
import { Ctx } from './ctx';
import { Builder } from './build';
import { MAT, patch } from './materials';
import { fbm, ridge, smooth, rng } from './noise';
import { calmZones } from './waves';

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
      float fine = fbm(wp.xz * 9.0);
      // columnar basalt: dark, with vertical jointing on the steep faces
      vec3 rock = mix(vec3(0.022, 0.022, 0.024), vec3(0.085, 0.082, 0.08), n);
      vec2 q = abs(wn.x) > abs(wn.z) ? wp.zy : wp.xy;
      float joints = smoothstep(0.42, 0.5, abs(fract(q.x * 0.55 + fbm(q * 0.3) * 1.5) - 0.5));
      rock *= mix(1.0, 0.45, joints * smoothstep(0.25, 0.6, slope));
      rock *= 0.7 + 0.6 * streaks(wp, wn, 0.8);
      vec3 straw = mix(vec3(0.2, 0.17, 0.095), vec3(0.4, 0.35, 0.21), n2);
      straw = mix(straw, vec3(0.13, 0.115, 0.08), smoothstep(0.45, 0.75, n3) * 0.7);
      straw *= 0.8 + 0.4 * fine;
      vec3 shingle = mix(vec3(0.07, 0.068, 0.066), vec3(0.2, 0.19, 0.175), fbm(wp.xz * 3.0)) * (0.7 + 0.6 * fine);
      float grassy = smoothstep(0.22, 0.07, slope) * smoothstep(3.0, 5.5, wp.y + n * 2.5);
      col = mix(rock, straw, grassy);
      col = mix(col, shingle, smoothstep(3.0, 1.3, wp.y + n) * smoothstep(0.4, 0.12, slope));
      float wet = smoothstep(0.9, -0.1, wp.y);
      col *= mix(1.0, 0.4, wet);
      rough = mix(0.96, 0.35, wet);`, 'terrain');
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
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
    const COUNT = 30000;
    const inst = new THREE.InstancedMesh(tuft, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, side: THREE.DoubleSide }), COUNT);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
    const colr = new THREE.Color();
    let n = 0;
    for (let tries = 0; tries < COUNT * 6 && n < COUNT; tries++) {
      const lx = (r() - 0.5) * 340, lz = (r() - 0.5) * 340;
      const h = localHeight(lx, lz);
      if (h < 5.2) continue;
      if (Math.hypot(lx - 28, lz + 50) < 16) continue; // the terrace round the house is bare
      const sl = Math.abs(localHeight(lx + 1, lz) - h) + Math.abs(localHeight(lx, lz + 1) - h);
      if (sl > 0.45) continue;
      if (fbm(lx * 0.05 + 3, lz * 0.05) < 0.4) continue;
      pv.set(IX + lx, h - 0.03, IZ + lz);
      q.setFromEuler(new THREE.Euler(0, r() * 6.283, 0));
      const s = 0.7 + r() * 1.1;
      sc.set(s, s * (0.7 + r() * 0.8), s);
      inst.setMatrixAt(n, m4.compose(pv, q, sc));
      inst.setColorAt(n, colr.setHSL(0.12 + r() * 0.02, 0.2 + r() * 0.12, 0.3 + r() * 0.16));
      n++;
    }
    inst.count = n;
    scene.add(inst);

    // loose boulders along the shore and slopes
    const rockMat = patch(new THREE.MeshStandardMaterial({ color: '#2a2826', roughness: 0.9, flatShading: true }), /* glsl */ `
      col *= 0.6 + 0.9 * tri(wp, wn, 0.9); float wet = smoothstep(0.7, -0.2, wp.y); col *= mix(1.0, 0.45, wet); rough = mix(rough, 0.3, wet);`, 'boulder');
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

  // ---------- dock and dry dock basin ----------
  const SLAB_Y = -0.9, SLAB_H = 5; // top at DECK
  b.box(104, SLAB_Y, 10, 12, SLAB_H, 20, MAT.concrete);         // west apron
  b.box(120, SLAB_Y, 16.5, 20, SLAB_H, 7, MAT.concrete);        // north arm
  b.box(120, SLAB_Y, 3.5, 20, SLAB_H, 7, MAT.concrete);         // south arm
  b.box(119, -2.0, 10, 18, 1.4, 6, MAT.concrete);               // basin floor (top at -1.3)
  // kerbs so nobody walks into the basin
  b.rail(110, 13, 130, 13, DECK, MAT.rust, 0.9);
  b.rail(110, 7, 130, 7, DECK, MAT.rust, 0.9);
  b.rail(110, 7, 110, 13, DECK, MAT.rust, 0.9);
  // bollards and fenders
  for (const x of [112, 118, 124, 129]) { b.cyl(x, 19.3, 0.16, DECK, DECK + 0.45, MAT.dark, false); b.cyl(x, 0.7, 0.16, DECK, DECK + 0.45, MAT.dark, false); }
  // cradle blocks under the hull
  for (const x of [117.2, 119, 120.8]) b.box(x, -1.05, 10, 0.3, 0.5, 1.5, MAT.wood, 0, false);

  // sea gate
  const gate = b.box(130.2, -0.6, 10, 0.45, 4.4, 6.6, MAT.rust, 0, false);
  gate.userData.static = false;
  const gateCol = world.addBox(IX + 130.2, -0.6, IZ + 10, 0.3, 2.2, 3.3);
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
  // winch drum on the post
  const winch = cb.mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 12), MAT.steel, 0.3, 1.1, 0);
  winch.rotation.z = Math.PI / 2;
  const crank = cb.box(0.55, 1.1, 0.14, 0.04, 0.04, 0.3, MAT.dark, 0, false);
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
      enabled: () => !state.flag('mast') && !mesh.userData.moving,
      use: () => {
        w.on = !w.on;
        mesh.userData.moving = true;
        const from = mesh.position.clone();
        const to = w.on ? panWorld.clone().add(new THREE.Vector3(0, 0.6, 0)) : home.clone();
        ctx.sfx('lift', from);
        world.tween(0.7, (k) => {
          mesh.position.lerpVectors(from, to, k);
          mesh.position.y += Math.sin(k * Math.PI) * 0.8;
        }, () => { mesh.userData.moving = false; w.it.pos.copy(mesh.position); ctx.sfx('clank', to); saveWeights(); });
      },
    };
    world.interactables.push(w.it);
    weights.push(w);
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
    pos: P(CR.x + 0.4, DECK + 1.1, CR.z + 0.5), radius: 2.0,
    enabled: () => !state.flag('mast'),
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
  b.box(LF.x, DECK + LF.h + 0.15, LF.z, LF.w + 0.8, 0.3, LF.d + 0.8, MAT.concrete, 0, false);                     // roof
  b.box(LF.x, DECK - 0.02, LF.z, LF.w, 0.1, LF.d, MAT.concrete, 0, false);                                         // floor
  const door = b.box(LF.x, DECK + 1.25, LF.z + LF.d / 2 - 0.2, 2, 2.5, 0.16, MAT.rust, 0, false);
  door.userData.static = false;
  const doorCol = world.addBox(IX + LF.x, DECK + 1.25, IZ + LF.z + LF.d / 2 - 0.2, 1, 1.25, 0.2);
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.2, emissive: '#ffd9a0', emissiveIntensity: 0 });
  const eye = b.mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 20), eyeMat, LF.x, DECK + 3.2, LF.z + LF.d / 2 + 0.02, false);
  eye.rotation.x = Math.PI / 2;
  const eyeRing = b.mesh(new THREE.TorusGeometry(0.26, 0.04, 8, 24), MAT.brass, LF.x, DECK + 3.2, LF.z + LF.d / 2 + 0.03, false);
  // sail bundle on a trestle inside
  b.box(LF.x, DECK + 0.4, LF.z - 2.4, 2.6, 0.8, 0.7, MAT.wood);
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
  // shelves and clutter so the loft reads as a loft
  b.box(LF.x - 4.6, DECK + 1.0, LF.z - 1, 1.2, 2.0, 4.5, MAT.wood);
  b.box(LF.x + 4.4, DECK + 0.45, LF.z - 2.2, 1.6, 0.9, 1.6, MAT.paleWood);
  b.box(LF.x + 4.4, DECK + 0.3, LF.z + 0.6, 1.2, 0.6, 1.2, MAT.wood);

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
  const openLoft = (instant: boolean) => {
    world.remove(doorCol);
    eyeMat.emissiveIntensity = 3;
    if (instant) { door.position.y = DECK + 3.9; return; }
    ctx.sfx('door', door.position);
    world.tween(4, (k) => { door.position.y = DECK + 1.25 + 2.65 * k; });
  };
  world.updaters.push((dt) => {
    const target = (mStep / STEPS) * Math.PI * 2;
    let d = target - mYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    mYaw += d * Math.min(1, dt * 6);
    mirror.rotation.y = mYaw;
    const lit = ctx.env.daylight > 0.25 ? 1 : 0;
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
    ray.scale.set(1, 1, len);
    ray.rotation.x = -Math.atan2(DECK + 3.2 - MR.y, 19);
    beamMat.opacity = lit * 0.05;
    spot.visible = onWall && lit > 0;
    const aligned = mStep === STEPS / 2 && Math.abs(d) < 0.05 && lit > 0;
    if (aligned && !state.flag('loft')) { state.set('loft'); openLoft(false); }
    if (!state.flag('loft')) eyeMat.emissiveIntensity = aligned ? 3 : 0;
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

  // ---------- the yard: sheds, wrecks and clutter ----------
  // an open-sided boat shed
  for (const [x, z] of [[78, 30], [90, 30], [78, 38], [90, 38]] as const) b.box(x, DECK + 2.2, z, 0.4, 4.4, 0.4, MAT.concrete);
  b.box(84, DECK + 4.55, 34, 14, 0.3, 10, MAT.rust, 0, false);
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
  for (let i = 0; i < 14; i++) {
    const x = 60 + rr() * 38, z = -6 + rr() * 36;
    if (Math.hypot(x - 64, z - 4) < 4 || Math.hypot(x - 82, z - 33) < 6) continue;
    if (rr() < 0.5) b.cyl(x, z, 0.3, DECK, DECK + 0.9, rr() < 0.5 ? MAT.rust : MAT.red, true, 0.3, 12);
    else { const s = 0.6 + rr() * 0.6; b.box(x, DECK + s / 2, z, s, s, s, MAT.wood, rr() * 3); }
  }
  for (const z of [8.6, 11.4]) b.box(102, DECK + 0.05, z, 12, 0.1, 0.12, MAT.steel, 0, false);

  // dock lamp
  b.cyl(129.2, 18.8, 0.07, DECK, DECK + 3.4, MAT.dark, false, 0.05, 8);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#2a2622', emissive: '#ffb86a', emissiveIntensity: 0 });
  b.mesh(new THREE.SphereGeometry(0.16, 12, 8), lampMat, 129.2, DECK + 3.5, 18.8, false);
  const lamp = new THREE.PointLight('#ffb070', 0, 26, 1.6);
  lamp.position.set(IX + 129.2, DECK + 3.5, IZ + 18.8);
  scene.add(lamp);

  // ---------- the house on the terrace ----------
  const HX = 26, HZ = -51, HY = 9.5;
  b.box(HX, HY + 1.5, HZ, 6, 3, 5, MAT.concrete);
  b.box(HX, HY + 3.1, HZ, 6.8, 0.25, 5.8, MAT.rust, 0, false);
  b.box(HX + 5.2, HY + 0.1, HZ + 1.5, 4.6, 0.2, 6, MAT.paleWood);           // porch
  b.box(HX + 5.2, HY + 2.9, HZ + 1.5, 4.8, 0.12, 6.2, MAT.rust, 0, false);  // porch roof
  for (const [x, z] of [[7.3, -1.3], [7.3, 4.3]] as const) b.bar(HX + x, HY + 0.2, HZ + z, HX + x, HY + 2.9, HZ + z, 0.05, MAT.wood);
  b.box(HX + 3.01, HY + 1.1, HZ + 1.0, 0.06, 2.0, 0.9, MAT.dark, 0, false);  // door
  const winMat = new THREE.MeshStandardMaterial({ color: '#191510', emissive: '#ff9c4a', emissiveIntensity: 0 });
  b.box(HX + 3.01, HY + 1.7, HZ - 1.2, 0.06, 0.7, 0.9, winMat, 0, false);
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
    winMat.emissiveIntensity = night * 2.5;
    houseLight.intensity = night * 18;
  });

  return { mooring, start: P(74, DECK, 20) };
}
