// Life in the open sea. Nothing lives out here all the time: every so often,
// while the boat is under way far from anywhere, something turns up for a
// while and then goes. Fish leap; gulls or dolphins keep company; a seal puts
// its head up and barks; rarely sharks circle and one rams the hull; very
// rarely indeed a whale breaches.
import * as THREE from 'three';
import { Ctx } from './ctx';
import { waveHeight } from './waves';
import { softDot } from './npc';
import { Figure, J } from './figure';
import { MAT } from './materials';
import { PLACES } from './rigs';
import { ISLAND } from './island';
import { ATOLL } from './giant';
import { TOWER } from './tower';
import { WINDMILL } from './windmill';
import { LAB } from './lab';

export type FaunaKind = 'fish' | 'gulls' | 'dolphins' | 'seal' | 'sharks' | 'whale' | 'driftwood' | 'kelp' | 'body';
const WEIGHTS: [FaunaKind, number][] = [['fish', 30], ['gulls', 15], ['driftwood', 14], ['dolphins', 12], ['seal', 11], ['kelp', 10], ['sharks', 5], ['whale', 2], ['body', 1]];
const Z = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

/** a smooth one-piece body lying along +Z, head forward */
function spindle(len: number, r: number, flat = 1, seg = 14) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(Math.max(0.0005, r * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.75)), (t - 0.5) * len)); }
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateX(Math.PI / 2);
  g.scale(flat, 1, 1);
  return g;
}
function fin(a: number[], b: number[], c: number[], mat: THREE.Material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
/** point a head-forward body along a direction, rolled about its own length */
function aim(o: THREE.Object3D, dir: THREE.Vector3, roll = 0) {
  _d.copy(dir).normalize();
  o.quaternion.setFromUnitVectors(Z, _d);
  if (roll) o.quaternion.multiply(_q2.setFromAxisAngle(Z, roll));
}

export function buildFauna(ctx: Ctx, hooks: { push: (ax: number, az: number) => void; use: () => boolean; bullet: () => void }) {
  const { scene, world, boat } = ctx;
  const skin = (c: string, rough = 0.32, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, side: THREE.DoubleSide });

  // ------------------------------------------------------------ spray
  const NP = 700, pPos = new Float32Array(NP * 3).fill(-500), pVel = new Float32Array(NP * 3), pLife = new Float32Array(NP);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const spray = new THREE.Points(pGeo, new THREE.PointsMaterial({ map: softDot(), color: '#e4ecec', size: 0.22, transparent: true, opacity: 0.6, depthWrite: false }));
  spray.frustumCulled = false; spray.visible = false;
  scene.add(spray);
  let pNext = 0, pLive = 0, now = 0;
  const splash = (x: number, z: number, n: number, power: number) => {
    const y = waveHeight(x, z, now);
    for (let i = 0; i < n; i++) {
      const k = pNext++ % NP, a = Math.random() * 6.283, sp = Math.random() * power;
      pPos[k * 3] = x + Math.cos(a) * power * 0.12 * Math.random(); pPos[k * 3 + 1] = y + 0.05; pPos[k * 3 + 2] = z + Math.sin(a) * power * 0.12 * Math.random();
      pVel[k * 3] = Math.cos(a) * sp * 0.5; pVel[k * 3 + 1] = (0.6 + Math.random()) * power; pVel[k * 3 + 2] = Math.sin(a) * sp * 0.5;
      pLife[k] = 1.6 + power * 0.12;
    }
    pLive = 4;
  };

  // ------------------------------------------------------------ the cast
  const hide = (o: THREE.Object3D) => { o.visible = false; o.userData.noCull = true; scene.add(o); return o; };
  // fish: slim, bright, a forked tail
  const fishMat = skin('#aeb9bd', 0.25, 0.7);
  const fish = Array.from({ length: 7 }, () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(spindle(0.42, 0.055, 0.45, 8), fishMat));
    g.add(fin([0, 0, -0.19], [0, 0.09, -0.3], [0, -0.09, -0.3], fishMat));
    for (const s of [-1, 1]) g.add(fin([s * 0.02, 0, 0.05], [s * 0.2, 0.02, -0.04], [s * 0.02, 0, -0.03], fishMat));   // the long fins it glides on
    return { g: hide(g), t0: 0, x: 0, z: 0, dx: 0, dz: 0, v: 0, up: 0, wet: true };
  });
  // dolphins
  const dolMat = skin('#4f5c66');
  const dolphins = Array.from({ length: 3 }, (_, i) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(spindle(2.3, 0.25, 0.86), dolMat));
    g.add(fin([0, 0.2, 0.15], [0, 0.2, -0.3], [0, 0.52, -0.32], dolMat));
    g.add(fin([0, 0, -1.05], [0.34, 0, -1.3], [-0.34, 0, -1.3], dolMat));
    for (const s of [-1, 1]) g.add(fin([s * 0.2, -0.08, 0.45], [s * 0.55, -0.2, 0.15], [s * 0.2, -0.08, 0.2], dolMat));
    const beak = new THREE.Mesh(spindle(0.5, 0.07, 1, 8), dolMat); beak.position.z = 1.1; g.add(beak);
    return { g: hide(g), side: i === 1 ? -1 : 1, lat: 5 + i * 2.6, along: 3 - i * 3.2, ph: i * 1.3 };
  });
  // sharks: only ever a fin and a shadow of back, until one comes in
  const shMat = skin('#3b4246', 0.4);
  const sharks = Array.from({ length: 2 }, (_, i) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(spindle(3.2, 0.36, 0.85), shMat));
    g.add(fin([0, 0.28, 0.35], [0, 0.28, -0.45], [0, 0.95, -0.5], shMat));
    g.add(fin([0, 0.1, -1.45], [0, 0.75, -1.95], [0, -0.3, -1.8], shMat));
    return { g: hide(g), a: i * Math.PI, r: 11 + i * 2.5 };
  });
  // seal: a sleek dark head, whiskered muzzle, big eyes
  const seal = new THREE.Group();
  {
    const m = skin('#2e2823', 0.22);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), m); head.scale.set(0.9, 1, 1.12);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.26, 0.7, 14), m); neck.position.y = -0.4;
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), m); muzzle.position.set(0, -0.04, 0.19); muzzle.scale.set(1.1, 0.8, 1);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), skin('#0b0a0a', 0.2)); nose.position.set(0, 0, 0.285);
    seal.add(head, neck, muzzle, nose);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), skin('#050505', 0.05)); e.position.set(s * 0.1, 0.05, 0.16); seal.add(e); }
    hide(seal);
  }
  // whale
  const whale = new THREE.Group();
  {
    const m = skin('#23282d', 0.38), pale = skin('#8d949a', 0.5);
    const body = new THREE.Mesh(spindle(15, 2.0, 0.9, 24), m);
    const belly = new THREE.Mesh(spindle(11, 1.75, 0.8, 18), pale); belly.position.set(0, -0.5, 1.4);
    whale.add(body, belly);
    whale.add(fin([0, 0, -6.9], [2.6, 0, -8.6], [0, 0, -7.9], m), fin([0, 0, -6.9], [-2.6, 0, -8.6], [0, 0, -7.9], m));
    for (const s of [-1, 1]) whale.add(fin([s * 1.5, -0.6, 2.6], [s * 4.6, -1.6, 0.4], [s * 1.5, -0.6, 1.2], m));
    whale.add(fin([0, 1.75, -2.2], [0, 1.75, -3.2], [0, 2.3, -3.3], m));
    hide(whale);
  }
  // gulls
  const gullMat = skin('#e8e8e2', 0.8), tipMat = skin('#2a2a2a', 0.8);
  const gulls = Array.from({ length: 3 }, (_, i) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(spindle(0.42, 0.065, 1, 8), gullMat));
    const wings = [-1, 1].map((s) => {
      const w = new THREE.Group();
      w.add(fin([0, 0, 0.09], [s * 0.42, 0, 0.04], [0, 0, -0.07], gullMat), fin([s * 0.42, 0, 0.04], [s * 0.72, 0, -0.08], [s * 0.4, 0, -0.06], tipMat));
      g.add(w);
      return w;
    });
    return { g: hide(g), wings, a: i * 2.1, r: 9 + i * 2.5, h: 9 + i * 1.6, sp: 0.55 + i * 0.09, fl: i * 2 };
  });

  // ------------------------------------------------------------ the schedule
  let kind: FaunaKind | null = null, tau = 0, next = 35 + Math.random() * 50, struck = false, barks = 0;
  const at = new THREE.Vector3(), heading = new THREE.Vector3();
  const openSea = () => {
    const x = boat.position.x, z = boat.position.z;
    if (Math.hypot(x - ISLAND.x, z - ISLAND.z) < 270 || Math.hypot(x - ATOLL.x, z - ATOLL.z) < 330) return false;
    for (const p of [...Object.values(PLACES), TOWER, WINDMILL, LAB]) if (Math.hypot(x - p.x, z - p.z) < 130) return false;
    return true;
  };
  // ------------------------------------------------------------ things adrift
  // driftwood: a few logs and planks, long in the water
  const wood = Array.from({ length: 6 }, (_, i) => {
    const log = i % 3 !== 2;
    const m = new THREE.Mesh(log ? new THREE.CylinderGeometry(0.13 + (i % 2) * 0.05, 0.16 + (i % 2) * 0.05, 2.2 + i * 0.5, 9) : new THREE.BoxGeometry(0.34, 0.06, 2.6), log ? MAT.bone : MAT.paleWood);
    if (log) m.geometry.rotateX(Math.PI / 2);
    m.castShadow = true;
    return { g: hide(m), x: 0, z: 0, yaw: 0, ph: i * 1.9, sink: log ? 0.04 : 0.0 };
  });
  // kelp: a raft of long brown blades lying in the surface, with their floats
  const kelpMat = new THREE.MeshStandardMaterial({ color: '#4a3d18', roughness: 0.35, side: THREE.DoubleSide });
  const bladeGeo = new THREE.PlaneGeometry(0.3, 3.4, 1, 6);
  bladeGeo.rotateX(-Math.PI / 2);
  { const bp = bladeGeo.attributes.position; for (let i = 0; i < bp.count; i++) { const z = bp.getZ(i); bp.setX(i, bp.getX(i) * (1 - Math.abs(z) / 2.2) + Math.sin(z * 2.3) * 0.12); } bladeGeo.computeVertexNormals(); }
  const kelp = Array.from({ length: 46 }, (_, i) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(bladeGeo, kelpMat));
    if (i % 3 === 0) { const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), kelpMat); bulb.position.set(0, 0.03, 1.6); g.add(bulb); }
    return { g: hide(g), x: 0, z: 0, yaw: 0, ph: i * 0.83 };
  });
  // someone, face down, a long time in the sea
  const corpse = new Figure({ coat: '#2e3a3c', trousers: '#1f2224', skin: '#8c9488', hood: false, hair: '#1c1a18' });
  {
    const p = corpse.joints;
    p[J.hips].set(0, 0.95, 0); p[J.chest].set(0, 1.4, 0.03); p[J.head].set(0.03, 1.6, 0.1);
    p[J.shL].set(0.2, 1.37, 0.03); p[J.shR].set(-0.2, 1.37, 0.03);
    p[J.elL].set(0.46, 1.42, 0.12); p[J.haL].set(0.56, 1.68, 0.2); p[J.elR].set(-0.44, 1.2, 0.12); p[J.haR].set(-0.62, 1.0, 0.2);
    p[J.hipL].set(0.1, 0.93, 0); p[J.hipR].set(-0.1, 0.93, 0);
    p[J.knL].set(0.16, 0.5, 0.1); p[J.ftL].set(0.2, 0.06, 0.24); p[J.knR].set(-0.13, 0.5, 0.06); p[J.ftR].set(-0.22, 0.08, 0.3);
    corpse.skirtAmount = 0.6; corpse.headPitch = 0.4;
    corpse.refresh(0);
  }
  const body = new THREE.Group();
  corpse.group.position.set(0, -1.15, 0);
  { const lay = new THREE.Group(); lay.rotation.x = Math.PI / 2; lay.add(corpse.group); body.add(lay); }     // laid on its face
  hide(body);
  const prompt = new THREE.Vector3();
  let promptOn = false;

  const start = (k: FaunaKind) => {
    kind = k; tau = 0; struck = false; barks = 0;
    const s = boat.state, sn = Math.sin(s.psi), cs = Math.cos(s.psi);
    heading.set(sn, 0, cs);
    if (k === 'fish') {
      const side = Math.random() < 0.5 ? -1 : 1, ang = s.psi + side * (0.5 + Math.random() * 0.6);
      fish.forEach((f, i) => {
        const d = 14 + Math.random() * 22;
        f.x = boat.position.x + Math.sin(ang) * d + (Math.random() - 0.5) * 8; f.z = boat.position.z + Math.cos(ang) * d + (Math.random() - 0.5) * 8;
        const dir = s.psi + side * 1.2 + (Math.random() - 0.5) * 0.5;
        f.dx = Math.sin(dir); f.dz = Math.cos(dir); f.v = 6 + Math.random() * 3; f.up = 3.6 + Math.random() * 1.6; f.t0 = 0.3 + i * (0.12 + Math.random() * 0.25); f.wet = true;
      });
    } else if (k === 'seal') {
      const side = Math.random() < 0.5 ? -1 : 1;
      at.set(boat.position.x + sn * 22 + cs * side * 13, 0, boat.position.z + cs * 22 - sn * side * 13);
    } else if (k === 'driftwood' || k === 'kelp' || k === 'body') {
      // somewhere ahead and a little off the bow, so the boat comes up on it
      const side = Math.random() < 0.5 ? -1 : 1, d = k === 'body' ? 70 : 60 + Math.random() * 40, off = side * (k === 'body' ? 5 : 6 + Math.random() * 14);
      at.set(boat.position.x + sn * d + cs * off, 0, boat.position.z + cs * d - sn * off);
      const scatter = (list: { x: number; z: number; yaw: number }[], rad: number) => list.forEach((o) => { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * rad; o.x = at.x + Math.cos(a) * r; o.z = at.z + Math.sin(a) * r; o.yaw = Math.random() * 6.283; });
      if (k === 'driftwood') scatter(wood, 9);
      if (k === 'kelp') scatter(kelp, 8);
      if (k === 'body') body.rotation.y = Math.random() * 6.283;
    } else if (k === 'whale') {
      const side = Math.random() < 0.5 ? -1 : 1, d = 110 + Math.random() * 60;
      at.set(boat.position.x + sn * d * 0.8 + cs * side * d * 0.6, 0, boat.position.z + cs * d * 0.8 - sn * side * d * 0.6);
      heading.set(Math.sin(s.psi + side * 1.9), 0, Math.cos(s.psi + side * 1.9));
    }
  };
  const stop = () => {
    kind = null; next = 40 + Math.random() * 80;
    for (const o of [...fish.map((f) => f.g), ...dolphins.map((d) => d.g), ...sharks.map((d) => d.g), ...gulls.map((d) => d.g), ...wood.map((d) => d.g), ...kelp.map((d) => d.g), body, seal, whale]) o.visible = false;
    promptOn = false;
  };

  world.updaters.push((dt, t) => {
    now = t;
    // spray always finishes falling
    if (pLive > 0) {
      pLive -= dt; spray.visible = true;
      for (let i = 0; i < NP; i++) {
        if (pLife[i] <= 0) continue;
        pLife[i] -= dt;
        if (pLife[i] <= 0) { pPos[i * 3 + 1] = -500; continue; }
        pVel[i * 3 + 1] -= 9.8 * dt;
        pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      }
      pGeo.attributes.position.needsUpdate = true;
    } else spray.visible = false;

    const sailing = boat.mode === 'sailing';
    if (!kind) {
      if (sailing && openSea()) { next -= dt; if (next <= 0) { let r = Math.random() * 100; for (const [k, w] of WEIGHTS) { if ((r -= w) < 0) { start(k === 'body' && ctx.state.flag('seaBody') ? 'driftwood' : k); break; } } } }
      return;
    }
    tau += dt;
    const bx = boat.position.x, bz = boat.position.z, s = boat.state, sn = Math.sin(s.psi), cs = Math.cos(s.psi);
    const sea = (x: number, z: number) => waveHeight(x, z, t);

    if (kind === 'fish') {
      let done = true;
      for (const f of fish) {
        const u = tau - f.t0;
        const y = f.up * u - 4.9 * u * u;
        if (u < 0) { done = false; continue; }
        if (y < -0.2) { if (!f.wet) { f.wet = true; splash(f.x + f.dx * f.v * u, f.z + f.dz * f.v * u, 6, 1.4); } f.g.visible = false; continue; }
        done = false;
        if (f.wet) { f.wet = false; splash(f.x, f.z, 6, 1.6); }
        const x = f.x + f.dx * f.v * u, z = f.z + f.dz * f.v * u;
        f.g.visible = true;
        f.g.position.set(x, sea(x, z) + y, z);
        aim(f.g, _v.set(f.dx * f.v, f.up - 9.8 * u, f.dz * f.v), Math.sin(u * 30) * 0.3);
      }
      if (done && tau > 2) stop();
    } else if (kind === 'dolphins') {
      const leave = Math.max(0, tau - 38) * 2.2;
      for (const d of dolphins) {
        d.ph += dt * (0.34 + Math.min(1.2, Math.abs(s.u) * 0.05));
        const u = d.ph % 1, lat = d.side * (d.lat + leave * 3), along = d.along + Math.sin(tau * 0.31 + d.lat) * 2 + leave;
        const x = bx + sn * along + cs * lat, z = bz + cs * along - sn * lat;
        const air = u < 0.38, k = u / 0.38;
        const y = air ? Math.sin(k * Math.PI) * 1.25 - 0.3 : -0.9;
        if (air && k < 0.08 && d.g.userData.wet) { d.g.userData.wet = false; splash(x, z, 10, 2.2); }
        if (!air && !d.g.userData.wet) { d.g.userData.wet = true; splash(x + sn * 1.2, z + cs * 1.2, 14, 2.6); }
        d.g.visible = y > -0.85;
        d.g.position.set(x, sea(x, z) + y, z);
        aim(d.g, _v.set(sn, air ? Math.cos(k * Math.PI) * 0.75 : 0, cs));
      }
      if (tau > 46 || !sailing) stop();
    } else if (kind === 'gulls') {
      const far = Math.max(0, 6 - tau) * 14 + Math.max(0, tau - 50) * 9;
      for (const g of gulls) {
        g.a += dt * g.sp;
        const r = g.r + far, x = bx + Math.cos(g.a) * r, z = bz + Math.sin(g.a) * r;
        g.g.visible = true;
        g.g.position.set(x, g.h + Math.sin(tau * 0.7 + g.fl) * 1.2 + far * 0.12, z);
        aim(g.g, _v.set(-Math.sin(g.a), 0, Math.cos(g.a)), -0.35);
        // a few beats, then a glide
        const beat = Math.sin(tau * 0.9 + g.fl) > 0.2 ? Math.sin(tau * 9 + g.fl) * 0.55 : 0.12;
        g.wings[0].rotation.z = -beat; g.wings[1].rotation.z = beat;
      }
      if (Math.random() < dt * 0.22) ctx.sfx('gull', gulls[0].g.position, 0.7);
      if (tau > 60) stop();
    } else if (kind === 'seal') {
      const up = Math.min(1, tau / 0.8) * (1 - THREE.MathUtils.clamp((tau - 8.5) / 0.9, 0, 1));
      const barking = tau > 2 && tau < 6.5 && (tau - 2) % 1.5 < 0.45;
      seal.visible = up > 0.01;
      seal.position.set(at.x, sea(at.x, at.z) - 0.75 + up * 0.72 + Math.sin(tau * 2.2) * 0.03, at.z);
      seal.rotation.set(barking ? -0.5 : -0.12, Math.atan2(bx - at.x, bz - at.z), 0, 'YXZ');
      if (tau < 0.1 && !struck) { struck = true; splash(at.x, at.z, 10, 1.6); }
      if (barking && barks < Math.floor((tau - 2) / 1.5) + 1) { barks++; ctx.sfx('bark', seal.position, 1.3); }
      if (tau > 9.6) stop();
    } else if (kind === 'sharks') {
      // circling, closing a little each turn; then one turns in
      const charge = tau > 22, k = charge ? Math.min(1, (tau - 22) / 1.6) : 0;
      sharks.forEach((sh, i) => {
        sh.a += dt * (0.42 - i * 0.07);
        let r = sh.r - Math.min(3, tau * 0.12) + Math.max(0, tau - 26) * 6;
        if (i === 0 && charge && tau < 26) r = (sh.r - 3) * (1 - k * k) + 0.9;
        const x = bx + Math.cos(sh.a) * r, z = bz + Math.sin(sh.a) * r;
        sh.g.visible = true;
        sh.g.position.set(x, sea(x, z) - 0.55 + (i === 0 ? k * 0.25 : 0), z);
        if (i === 0 && charge && tau < 26) aim(sh.g, _v.set(bx - x, 0, bz - z)); else aim(sh.g, _v.set(-Math.sin(sh.a), 0, Math.cos(sh.a)));
        if (i === 0 && charge && !struck && k >= 1) {
          struck = true;
          ctx.sfx('thump', boat.position, 1.6);
          splash(x, z, 40, 3.5);
          s.heel += (Math.cos(sh.a) * cs - Math.sin(sh.a) * sn > 0 ? 1 : -1) * 0.3;
          s.u *= 0.5;
        }
        if (i === 0 && struck && tau < 23.9) hooks.push(-Math.cos(sh.a) * 16, -Math.sin(sh.a) * 16);
      });
      if (tau > 34 || !sailing) stop();
    } else if (kind === 'whale') {
      // up and out at a steep angle, a slow roll, and down on its side in a wall of spray
      const T = 5.2, k = Math.min(1, tau / T), rise = Math.sin(Math.min(1, k / 0.55) * Math.PI * 0.5), fall = Math.max(0, (k - 0.55) / 0.45);
      const pitch = 1.1 * rise - 1.25 * fall * fall, y = -9 + 13.5 * rise - 12 * fall * fall, fwd = k * 14;
      const x = at.x + heading.x * fwd, z = at.z + heading.z * fwd;
      whale.visible = tau < T + 0.3;
      whale.position.set(x, sea(x, z) + y, z);
      aim(whale, _v.set(heading.x * Math.cos(pitch), Math.sin(pitch), heading.z * Math.cos(pitch)), fall * 1.4);
      if (tau < 0.15 && !struck) { struck = true; ctx.sfx('whale', whale.position, 2.5); }
      if (k > 0.08 && k < 0.5) splash(x - heading.x * 4, z - heading.z * 4, 5, 7);
      if (k > 0.86 && barks === 0) { barks = 1; ctx.sfx('giant-slap', whale.position, 1.3); for (let i = 0; i < 8; i++) splash(x + (Math.random() - 0.5) * 12, z + (Math.random() - 0.5) * 12, 60, 11); }
      if (tau > T + 4) stop();
    } else if (kind === 'driftwood' || kind === 'kelp' || kind === 'body') {
      // these just lie in the sea and ride it; they are left behind when the boat has gone on
      const slope = (x: number, z: number, yaw: number, o: THREE.Object3D, len: number) => {
        const sn2 = Math.sin(yaw), cs2 = Math.cos(yaw), a = sea(x + sn2 * len, z + cs2 * len), b = sea(x - sn2 * len, z - cs2 * len);
        o.rotation.set(-Math.atan2(a - b, len * 2), yaw, 0, 'YXZ');
        return (a + b) / 2;
      };
      if (kind === 'driftwood') for (const w of wood) {
        w.x += Math.sin(t * 0.05 + w.ph) * dt * 0.05; w.yaw += Math.sin(t * 0.07 + w.ph) * dt * 0.02;
        w.g.visible = true;
        w.g.position.set(w.x, slope(w.x, w.z, w.yaw, w.g, 1.1) + 0.02 - w.sink + Math.sin(t * 0.9 + w.ph) * 0.02, w.z);
        w.g.rotation.z = Math.sin(t * 0.6 + w.ph) * 0.12;
      }
      if (kind === 'kelp') for (const q of kelp) {
        q.g.visible = true;
        q.g.position.set(q.x, slope(q.x, q.z, q.yaw + Math.sin(t * 0.4 + q.ph) * 0.18, q.g, 1.4) + 0.015, q.z);
      }
      let d = Math.hypot(bx - at.x, bz - at.z);
      if (kind === 'body') {
        body.visible = true;
        const yaw = body.rotation.y;
        body.position.set(at.x, slope(at.x, at.z, yaw, body, 0.8) - 0.07 + Math.sin(t * 0.8) * 0.015, at.z);
        const pp = ctx.playerPos();
        d = Math.min(d, Math.hypot(pp.x - at.x, pp.z - at.z));
        promptOn = d < 5.5 && !ctx.state.flag('seaBody');
        prompt.set(at.x, body.position.y + 0.25, at.z);
        if (promptOn && hooks.use()) { ctx.state.set('seaBody'); hooks.bullet(); ctx.sfx('take', prompt); promptOn = false; }
      }
      if (d > 260) stop();
    }
  });

  return {
    get active() { return kind; },
    /** something in the sea that E would act on right now, if anything */
    get prompt() { return promptOn ? prompt : null; },
    /** testing: bring something on now */
    trigger(k: FaunaKind) { stop(); start(k); },
  };
}
