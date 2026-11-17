// Inside the black tower.
//
// It is a cold store. Two hundred people sleep in tanks set into the wall
// beside a stair that winds five and a half times up an open well to a ring
// gallery under the roof. On the roof, one man is still on watch. Below the
// sea, a reactor cooled by the sea keeps it all cold.
//
// With the keeper's card, the desk on the gallery can do two things, each in
// three deliberate steps and neither undoable: let the sea into the reactor,
// and let the sleepers go.
import * as THREE from 'three';
import { Ctx } from './ctx';
import { MAT } from './materials';
import { Figure, J } from './figure';
import { Npc } from './npc';
import { addPickup } from './items';
import { rng } from './noise';

export interface TowerHooks {
  /** draw the world from a fixed camera into a small picture, for the security screens */
  feed: (cam: THREE.Camera, target: THREE.WebGLRenderTarget) => void;
  /** the keeper has shot the player */
  kill: () => void;
}

const WR = 24.5;             // inside radius of the wall
const SW = 11.0, SR = 24.5 - SW / 2;   // the stair: width, and centre radius - broad, from the wall well out toward the middle
const TURNS = 11, PER = 24; // turns of stair, and ramp sections to a turn
const TANKS = 200;

export const TOWER_JOURNALS = [
  'Intake strainers cleared again. Weed, and worse than weed.\n\nFour pumps of six still turn. The plant does not care about us. It cares that the sea is cold, and the sea is still cold.\n\nWhile it runs, they sleep.',
  'Two hundred when the doors were shut. They paid for a later, better year.\n\nThe contract says: wake them when the water goes down.\n\nNobody wrote what to do if it does not go down.',
  'For whoever is last.\n\nThe plant can only be stopped by letting the sea into it. Three actions at the upper desk, in order. It cannot be undone, and the tanks hold their cold a day without it, perhaps two.\n\nThe other three actions at that desk I will not write down. You can see what they are for.\n\nCount the years first. I have.',
];

export function buildTowerInterior(ctx: Ctx, o: { cx: number; cz: number; floor: number; top: number; doorAngle: number; hooks: TowerHooks; exit: THREE.Vector3 }) {
  const { scene, world, state } = ctx, { cx, cz, hooks } = o;
  const F0 = o.floor, ROOF = o.top, GAL = ROOF - 12;         // atrium floor, roof, and the gallery under it
  const da = o.doorAngle, N = Math.round(TURNS * PER), RISE = (GAL - F0) / N;
  const A0 = da + 0.42, DA = (Math.PI * 2) / PER, SLEN = SR * DA;
  const pp = ctx.playerPos();
  const inside = (p: THREE.Vector3) => Math.hypot(p.x - cx, p.z - cz) < WR + 0.4 && p.y > F0 - 1.5 && p.y < ROOF - 0.6;
  const BY = -26, BR = 21;                                   // the plant, under the sea
  const inPlant = (p: THREE.Vector3) => p.y < -10 && Math.hypot(p.x - cx, p.z - cz) < BR + 2;
  const onRoof = (p: THREE.Vector3) => p.y > ROOF - 0.5 && Math.hypot(p.x - cx, p.z - cz) < 27;
  const at = (a: number, r: number, y: number) => new THREE.Vector3(cx + Math.sin(a) * r, y, cz + Math.cos(a) * r);

  const room = new THREE.Group();          // everything that is only ever seen from inside
  scene.add(room);
  room.visible = false;
  const add = <T extends THREE.Object3D>(m: T) => { room.add(m); return m; };
  const wallM = new THREE.MeshStandardMaterial({ color: '#232a30', roughness: 0.6, metalness: 0.25, side: THREE.BackSide });
  const steel = new THREE.MeshStandardMaterial({ color: '#30363c', roughness: 0.5, metalness: 0.35 });
  const pale = new THREE.MeshStandardMaterial({ color: '#59626a', roughness: 0.55, metalness: 0.3 });

  // ------------------------------------------------------------ shell, floors
  {
    const wall = add(new THREE.Mesh(new THREE.CylinderGeometry(WR, WR, ROOF - F0, 72, 1, true), wallM));
    wall.position.set(cx, (F0 + ROOF) / 2, cz);
    const disc = (y: number, r: number, mat: THREE.Material, up: boolean, r0 = 0) => {
      const m = add(new THREE.Mesh(r0 ? new THREE.RingGeometry(r0, r, 64) : new THREE.CircleGeometry(r, 64), mat));
      m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2; m.position.set(cx, y, cz); m.receiveShadow = true;
      return m;
    };
    disc(F0, WR, steel, true);
    disc(ROOF - 0.4, WR, steel, false);
    disc(GAL, WR, steel, true, 12); disc(GAL - 0.3, WR, steel, false, 12);
    // walkable: the atrium floor and the roof as overlapping strips, the gallery as a ring of plates
    for (let k = 0; k < 6; k++) { world.addBox(cx, F0 - 0.5, cz, 24.4, 0.5, 6.5, (k * Math.PI) / 6); world.addBox(cx, ROOF - 0.5, cz, 24.4, 0.5, 6.5, (k * Math.PI) / 6); }
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; world.addBox(cx + Math.sin(a) * 18.3, GAL - 0.25, cz + Math.cos(a) * 18.3, 4.6, 0.25, 6.3, a); }
    // the gallery's inner rail
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2, x = cx + Math.sin(a) * 12.1, z = cz + Math.cos(a) * 12.1;
      const post = add(new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.06, 0.06), steel)); post.position.set(x, GAL + 1.05, z); post.rotation.y = a + Math.PI / 2;
      const mid = post.clone(); mid.position.y = GAL + 0.55; add(mid);
      const up = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 0.06), steel)); up.position.set(x, GAL + 0.52, z);
      world.addBox(x, GAL + 0.6, z, 0.06, 0.6, 1.4, a);
    }
  }

  // ------------------------------------------------------------ the stair
  const stairY = (u: number) => F0 + u * (GAL - F0);
  const ST = Math.max(4, Math.round(RISE / 0.16)), HALF = RISE / (2 * ST), HALF_T = HALF;   // shallow steps, about a quarter of a metre each
  {
    // each tread a true wedge of the ring between the inner edge and the wall, so the stair bends with the tower instead of
    // going round it in straight pieces. Built once, about the tower's axis, and turned into place for every step.
    const dT = DA / ST, TH = 0.32;
    const wedge = (() => {
      const r0 = SR - SW / 2, r1 = SR + SW / 2, n = 4, sh = new THREE.Shape(), a1 = dT * 1.04;
      for (let k = 0; k <= n; k++) { const a = (k / n) * a1; const px = Math.sin(a) * r1, py = -Math.cos(a) * r1; if (k === 0) sh.moveTo(px, py); else sh.lineTo(px, py); }
      for (let k = n; k >= 0; k--) { const a = (k / n) * a1; sh.lineTo(Math.sin(a) * r0, -Math.cos(a) * r0); }
      const g = new THREE.ExtrudeGeometry(sh, { depth: TH, bevelEnabled: false });
      g.rotateX(-Math.PI / 2); g.translate(0, -TH, 0);           // lying flat, its top at 0
      return g;
    })();
    const treads = new THREE.InstancedMesh(wedge, steel, N * ST);
    const ri0 = SR - SW / 2 + 0.05;
    for (const hh of [1.05, 0.55]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= N * 2; i++) { const f = i / (N * 2), a = A0 + f * N * DA; pts.push(new THREE.Vector3(cx + Math.sin(a) * ri0, F0 + f * (GAL - F0) + HALF + hh, cz + Math.cos(a) * ri0)); }
      const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N * 8, hh > 1 ? 0.035 : 0.025, 6), steel);
      rail.frustumCulled = false; add(rail);
    }
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 1.1, 0.05), steel, N * ST);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
    const slope = Math.atan2(RISE, SLEN), rlen = Math.hypot(RISE, SLEN) + 0.05;
    for (let i = 0; i < N; i++) {
      const am = A0 + (i + 0.5) * DA, y0 = F0 + i * RISE, yaw = am + Math.PI / 2;
      const x = Math.sin(am) * SR, z = Math.cos(am) * SR;
      for (let s = 0; s < ST; s++) {
        v.set(cx, y0 + RISE * ((s + 1) / ST), cz);
        treads.setMatrixAt(i * ST + s, m4.compose(v, q.setFromEuler(e.set(0, A0 + i * DA + s * dT, 0)), s1));
      }
      world.addBox(cx + x, y0 - 0.25 + HALF, cz + z, SW / 2, 0.25, SLEN / 2 + 0.12, yaw, RISE);   // through the middle of each tread's top, so the foot stands on the steps rather than sinking into them
      // the well side: a rail, and something solid behind it
      const ri = SR - SW / 2 + 0.05, rx = cx + Math.sin(am) * ri, rz = cz + Math.cos(am) * ri;
      q.setFromEuler(e.set(-slope, yaw, 0, 'YXZ'));
      // a post on every tread, from the tread itself up to the handrail
      for (let k = 0; k < ST; k++) {
        const f = (k + 0.5) / ST, top = y0 + RISE * (k + 1) / ST, railY = y0 + RISE * f + HALF + 1.05, pa = am + (f - 0.5) * DA;
        posts.setMatrixAt(i * ST + k, m4.compose(v.set(cx + Math.sin(pa) * ri, (top + railY) / 2, cz + Math.cos(pa) * ri), q.setFromEuler(e.set(0, yaw, 0)), s1.set(1, (railY - top) / 1.1, 1)));
      }
      s1.set(1, 1, 1);
      world.addBox(rx, y0 + RISE / 2 + HALF + 0.9, rz, 0.07, 1.9, SLEN / 2 + 0.1, yaw);
    }
    void slope; void rlen;
    for (const m of [treads, posts]) { m.frustumCulled = false; m.receiveShadow = true; add(m); }
  }

  // ------------------------------------------------------------ the sleepers
  // One body, modelled once and stamped two hundred times: hanging in the fluid, arms loose, head sunk.
  const bodyGeo = (() => {
    const f = new Figure({ coat: '#9aa3a0', trousers: '#9aa3a0', skin: '#a9b0aa', hood: false, bare: true });
    const p = f.joints;
    p[J.hips].set(0, 0.98, 0); p[J.chest].set(0, 1.44, 0.03); p[J.head].set(0, 1.64, 0.07);
    p[J.shL].set(0.19, 1.4, 0.03); p[J.shR].set(-0.19, 1.4, 0.03);
    p[J.elL].set(0.24, 1.12, 0.06); p[J.haL].set(0.25, 0.86, 0.12); p[J.elR].set(-0.24, 1.12, 0.06); p[J.haR].set(-0.25, 0.86, 0.12);
    p[J.hipL].set(0.1, 0.96, 0); p[J.hipR].set(-0.1, 0.96, 0);
    p[J.knL].set(0.11, 0.52, 0.07); p[J.ftL].set(0.11, 0.1, -0.02); p[J.knR].set(-0.11, 0.52, 0.07); p[J.ftR].set(-0.11, 0.1, -0.02);
    f.skirtAmount = 0; f.headPitch = 0.55;
    f.refresh(0);
    f.group.updateMatrixWorld(true);
    const pos: number[] = [], nrm: number[] = [], v = new THREE.Vector3(), nm = new THREE.Matrix3();
    f.group.traverse((ob) => {
      const m = ob as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry, pa = g.attributes.position, na = g.attributes.normal;
      if (!na) return;
      nm.getNormalMatrix(m.matrixWorld);
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld); pos.push(v.x, v.y - 0.95, v.z);       // about the hips, so they tumble about their middle
        v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nrm.push(v.x, v.y, v.z);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    return g;
  })();
  const bodyM = new THREE.MeshStandardMaterial({ color: '#9aa39f', roughness: 0.6, emissive: '#2c4a56', emissiveIntensity: 1.3 });
  const bodies = add(new THREE.InstancedMesh(bodyGeo, bodyM, TANKS));
  const glass = add(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.62, 2.5, 14, 1, true), new THREE.MeshStandardMaterial({ color: '#6fa3b4', roughness: 0.08, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, emissive: '#2f7088', emissiveIntensity: 0.9 }), TANKS));
  const capGeo = (() => {
    const a = new THREE.CylinderGeometry(0.7, 0.74, 0.3, 14).toNonIndexed(), b = new THREE.CylinderGeometry(0.72, 0.68, 0.34, 14).toNonIndexed();
    a.translate(0, -1.4, 0); b.translate(0, 1.42, 0);
    const pos = new Float32Array(a.attributes.position.count * 3 + b.attributes.position.count * 3), nr = new Float32Array(pos.length);
    pos.set(a.attributes.position.array as Float32Array); pos.set(b.attributes.position.array as Float32Array, a.attributes.position.count * 3);
    nr.set(a.attributes.normal.array as Float32Array); nr.set(b.attributes.normal.array as Float32Array, a.attributes.normal.count * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
    return g;
  })();
  const caps = add(new THREE.InstancedMesh(capGeo, steel, TANKS));
  const lampM = new THREE.MeshStandardMaterial({ color: '#0a1418', emissive: '#9fd8ee', emissiveIntensity: 3.2 });
  const tlamps = add(new THREE.InstancedMesh(new THREE.TorusGeometry(0.62, 0.025, 5, 20), lampM, TANKS));
  glass.renderOrder = 5;
  for (const m of [bodies, glass, caps, tlamps]) m.frustumCulled = false;
  interface Sleeper { home: THREE.Vector3; yaw: number; to: THREE.Vector3; t0: number; fall: number; spin: THREE.Vector3; rest: THREE.Euler }
  const sleepers: Sleeper[] = [];
  const tankQ: THREE.Quaternion[] = [];
  const doorDir = new THREE.Vector3(Math.sin(da), 0, Math.cos(da));
  const heapC = new THREE.Vector3(cx + doorDir.x * 13.5, F0, cz + doorDir.z * 13.5), HEAP_R = 12.5;
  {
    const r = rng(733), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s1 = new THREE.Vector3(1, 1, 1), lq = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const tX = new THREE.Vector3(), tY = new THREE.Vector3(), tZ = new THREE.Vector3(), tB = new THREE.Matrix4();
    for (let i = 0; i < TANKS; i++) {
      // a single row round the wall, every tank lying on the steps with its head end against the wall
      const u = (i + 0.5) / TANKS, a = A0 + u * TURNS * Math.PI * 2;
      const tr = WR - 1.36;                                      // the head end against the wall
      const tilt0 = 0.2 + ((i * 7) % 3 - 1) * 0.04;
      const home = at(a, tr, stairY(u) + HALF_T + 0.64 + Math.sin(tilt0) * 1.22);      // the low inner end of the tank resting on the tread
      world.addBox(home.x, home.y, home.z, 0.66, 0.66 + Math.sin(tilt0) * 1.25, 1.28, a);
      const yaw = a + Math.PI;
      // run out from the wall toward the middle, the inner end dipped: the sleeper's head at the wall, lying on their back
      const tilt = tilt0;
      tY.set(Math.sin(a), 0, Math.cos(a)).multiplyScalar(Math.cos(tilt)); tY.y = Math.sin(tilt); tY.normalize();   // toward the wall, and up
      tZ.set(0, 1, 0); tX.crossVectors(tY, tZ).normalize(); tZ.crossVectors(tX, tY).normalize();
      q.setFromRotationMatrix(tB.makeBasis(tX, tY, tZ));
      glass.setMatrixAt(i, m4.compose(home, q, s1)); caps.setMatrixAt(i, m4);
      tlamps.setMatrixAt(i, m4.compose(home.clone().addScaledVector(tY, 1.24), q.clone().multiply(lq), s1));
      tankQ.push(q.clone());
      // where each will lie when it is over: a mound against the way out, deepest at the door
      const ra = r() * Math.PI * 2, rr = Math.sqrt(r()) * HEAP_R, hx = heapC.x + Math.cos(ra) * rr, hz = heapC.z + Math.sin(ra) * rr;
      const dc = Math.hypot(hx - cx, hz - cz);
      const px = dc > WR - 0.8 ? cx + ((hx - cx) * (WR - 0.8)) / dc : hx, pz = dc > WR - 0.8 ? cz + ((hz - cz) * (WR - 0.8)) / dc : hz;
      const depth = Math.max(0, 1 - rr / HEAP_R) * 3.6 + 0.25;
      sleepers.push({ home, yaw, to: new THREE.Vector3(px, F0 + 0.2 + r() * depth, pz), t0: r() * 26 + (1 - u) * 3, fall: 0, spin: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(5), rest: new THREE.Euler(Math.PI / 2 + (r() - 0.5) * 0.9, r() * 6.283, (r() - 0.5) * 0.9) });
    }
  }
  const _sq = new THREE.Quaternion();
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
  /** place every sleeper for a moment T seconds into the jettison (T < 0: all still in their tanks; large T: all at rest) */
  function layBodies(T: number) {
    for (let i = 0; i < TANKS; i++) {
      const s = sleepers[i], t = T - s.t0;
      if (t <= 0) { _v.copy(s.home); _v.y += 0.02 + Math.sin(tNow * 0.4 + i) * 0.015; _q.copy(tankQ[i]); }
      else {
        // out of the tank and over the rail, then nothing but the fall
        const H = s.home.y - s.to.y, tf = Math.sqrt((2 * H) / 9.8);
        if (t >= tf) { _v.copy(s.to); _q.setFromEuler(s.rest); }
        else {
          const k = t / tf, out = Math.min(1, t / 1.1);
          _v.lerpVectors(s.home, s.to, k * k * 0.35 + k * 0.65); _v.y = s.home.y + 0.4 * Math.sin(out * Math.PI) - 4.9 * t * t;
          _q.copy(tankQ[i]).multiply(_sq.setFromEuler(_e.set(s.spin.x * t, s.spin.y * t, s.spin.z * t)));
        }
      }
      bodies.setMatrixAt(i, _m4.compose(_v, _q, _one));
    }
    bodies.instanceMatrix.needsUpdate = true;
  }
  let tNow = 0, jetT = state.flag('jettisoned') ? 1e4 : -1;
  let heapCol: ReturnType<typeof world.addCyl> | null = null;
  const makeHeap = () => { heapCol ??= world.addCyl(heapC.x, heapC.z, HEAP_R - 2.5, F0 - 1, F0 + 3.4); };
  if (jetT > 0) makeHeap();
  layBodies(jetT);

  // ------------------------------------------------------------ light
  const lamps: THREE.PointLight[] = [];
  for (let i = 0; i < N; i += 11) {
    const u = (i + 0.5) / N, l = new THREE.PointLight('#bfe6f5', 0, 30, 1.5);
    l.position.copy(at(A0 + u * TURNS * Math.PI * 2, 17.5, stairY(u) + 4.2));
    scene.add(l); lamps.push(l);
  }
  const galLamp = new THREE.PointLight('#cfe8f2', 0, 34, 1.4); galLamp.position.copy(at(da + Math.PI, 16, GAL + 4)); scene.add(galLamp); lamps.push(galLamp);
  const floorLamp = new THREE.PointLight('#bfe6f5', 0, 40, 1.3); floorLamp.position.set(cx, F0 + 9, cz); scene.add(floorLamp); lamps.push(floorLamp);
  // alarm beacons
  const beaconM = new THREE.MeshStandardMaterial({ color: '#300', emissive: '#ff1a0a', emissiveIntensity: 0 });
  const beacons: THREE.PointLight[] = [];
  for (const [a, y] of [[da + 2.2, GAL + 3.4], [da + 4.6, GAL + 3.4], [da + 1.2, F0 + 6]] as const) {
    const m = add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), beaconM)); m.position.copy(at(a, WR - 0.5, y));
    const l = new THREE.PointLight('#ff2010', 0, 46, 1.3); l.position.copy(at(a, WR - 2.5, y)); scene.add(l); beacons.push(l);
  }

  // ------------------------------------------------------------ doors: out, and down to the plant
  world.interactables.push({ pos: at(da, WR - 1.4, F0 + 1.2), radius: 2.2, enabled: () => !heapCol, use: () => ctx.fade(() => { pp.copy(o.exit); ctx.sfx('door', pp); }, 0.9) });
  { const fr = add(new THREE.Mesh(new THREE.BoxGeometry(6.6, 14, 0.4), new THREE.MeshStandardMaterial({ color: '#05070a', roughness: 0.1, metalness: 0.8 }))); fr.position.copy(at(da, WR - 0.25, F0 + 7)); fr.rotation.y = da; }
  const pa = da + Math.PI;                                    // the plant door is across the floor from the way in
  const cardSlot = (a: number, r: number, y: number) => {
    const m = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.44, 0.1), pale)); m.position.copy(at(a, r, y)); m.rotation.y = a;
    const led = new THREE.MeshStandardMaterial({ color: '#200', emissive: '#ff2a1a', emissiveIntensity: 1.5 });
    const d = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.03), led)); d.position.copy(at(a, r - 0.06, y + 0.12)); d.rotation.y = a;
    return led;
  };
  {
    const fr = add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 0.3), pale)); fr.position.copy(at(pa, WR - 0.2, F0 + 1.6)); fr.rotation.y = pa;
    const leaf = add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.7, 0.12), steel)); leaf.position.copy(at(pa, WR - 0.42, F0 + 1.4)); leaf.rotation.y = pa;
    const led = cardSlot(pa + 0.075, WR - 0.3, F0 + 1.3);
    world.interactables.push({
      pos: at(pa, WR - 1.5, F0 + 1.2), radius: 2.0,
      use: () => {
        if (!state.has('keycard') || state.flag('reactorFlooded')) { ctx.sfx('deny', at(pa, WR - 1, F0 + 1)); return; }
        led.emissive.set('#3dff7a');
        ctx.fade(() => { pp.copy(at(pa, BR - 3, BY)); ctx.sfx('door', pp); }, 1.1);
      },
    });
  }

  // ------------------------------------------------------------ the plant
  const plant = new THREE.Group(); scene.add(plant); plant.visible = false;
  const plasmaM = new THREE.MeshStandardMaterial({ color: '#1a1030', emissive: '#b89cff', emissiveIntensity: 3.2 });
  const plantLights: THREE.PointLight[] = [];
  {
    const padd = <T extends THREE.Object3D>(m: T) => { plant.add(m); return m; };
    const shell = padd(new THREE.Mesh(new THREE.CylinderGeometry(BR, BR, 12, 48, 1, true), wallM)); shell.position.set(cx, BY + 6, cz);
    const fl = padd(new THREE.Mesh(new THREE.CircleGeometry(BR, 48), steel)); fl.rotation.x = -Math.PI / 2; fl.position.set(cx, BY, cz);
    const ce = padd(new THREE.Mesh(new THREE.CircleGeometry(BR, 48), steel)); ce.rotation.x = Math.PI / 2; ce.position.set(cx, BY + 12, cz);
    for (let k = 0; k < 6; k++) world.addBox(cx, BY - 0.5, cz, BR - 0.1, 0.5, 5.6, (k * Math.PI) / 6);
    world.addCyl(cx, cz, BR + 3, BY - 1, BY + 12, BR);
    // the machine: a ring of bright stuff in a segmented steel jacket, seen through the gaps between the coils
    const core = padd(new THREE.Mesh(new THREE.TorusGeometry(7, 1.5, 14, 64), plasmaM)); core.rotation.x = Math.PI / 2; core.position.set(cx, BY + 3.2, cz);
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const coil = padd(new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.42, 8, 20), steel)); coil.position.set(cx + Math.sin(a) * 7, BY + 3.2, cz + Math.cos(a) * 7); coil.rotation.y = a;
    }
    const stack = padd(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.0, 12, 20), steel)); stack.position.set(cx, BY + 6, cz);
    world.addCyl(cx, cz, 10.2, BY - 1, BY + 7);
    // sea water in, sea water out: six fat pipes from the wall, a pump on each
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.5;
      const pipe = padd(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, BR - 9.5, 12), k < 4 ? MAT.rust : MAT.dark)); pipe.rotation.z = Math.PI / 2; pipe.rotation.y = a + Math.PI / 2; pipe.position.copy(at(a, (BR + 9.5) / 2, BY + 4.6));
      const pump = padd(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.5, 14), pale)); pump.rotation.z = Math.PI / 2; pump.rotation.y = a + Math.PI / 2; pump.position.copy(at(a, BR - 3.2, BY + 4.6));
    }
    // a desk by the door with the plant's books on it
    const desk = padd(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.9), pale)); desk.position.copy(at(pa + 0.42, BR - 3.4, BY + 0.45)); desk.rotation.y = pa + 0.42;
    world.addCyl(desk.position.x, desk.position.z, 1.1, BY, BY + 0.95);
    TOWER_JOURNALS.forEach((text, i) => {
      const g = new THREE.Group();
      const where = at(pa + 0.42 + (i - 1) * 0.036, BR - 3.4, BY + 0.93);
      g.position.copy(where); g.rotation.y = pa + (i - 1) * 0.5;
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.03, 0.3), new THREE.MeshStandardMaterial({ color: '#1c2a30', roughness: 0.8 }));
      const pages = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.27), new THREE.MeshStandardMaterial({ color: '#cfc7b0', roughness: 0.95 })); pages.position.y = 0.022;
      g.add(cover, pages); plant.add(g);
      world.interactables.push({ pos: where.clone().setY(BY + 1.0), radius: 1.5, enabled: () => inPlant(pp), use: () => { state.set('tread' + i); ctx.read(text); } });
    });
    for (const a of [0.4, 2.5, 4.6]) { const l = new THREE.PointLight('#cdb8ff', 0, 30, 1.3); l.position.copy(at(a, 13, BY + 8)); scene.add(l); plantLights.push(l); }
    world.interactables.push({ pos: at(pa, BR - 1.4, BY + 1.2), radius: 2.0, enabled: () => inPlant(pp), use: () => ctx.fade(() => { pp.copy(at(pa, WR - 3, F0)); ctx.sfx('door', pp); }, 1.1) });
  }

  // ------------------------------------------------------------ the gallery: control room, the way to the roof
  const ca = da + Math.PI;                                   // the desk faces the well from the far side
  const roomOpen = () => !!state.flag('ctrlOpen');
  const feeds: { cam: THREE.PerspectiveCamera; rt: THREE.WebGLRenderTarget; outside: boolean }[] = [];
  const lampMat = (c: string) => new THREE.MeshStandardMaterial({ color: '#111', emissive: c, emissiveIntensity: 0 });
  const stageLamps = { flood: [lampMat('#ffb020'), lampMat('#ffb020'), lampMat('#ff2a1a')], jet: [lampMat('#ffb020'), lampMat('#ffb020'), lampMat('#ff2a1a')] };
  let floodStage = state.flag('reactorFlooded') ? 3 : 0, jetStage = state.flag('jettisoned') ? 3 : 0;
  {
    // a partition across the gallery with a card door; behind it the desk and four screens
    const W0 = ca - 0.52, W1 = ca + 0.52;
    for (const a of [W0, W1]) {
      const wall = add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.4, WR - 12.4), pale)); wall.position.copy(at(a, (WR + 12.4) / 2, GAL + 1.7)); wall.rotation.y = a;
      if (a === W1) world.addBox(wall.position.x, GAL + 1.7, wall.position.z, 0.14, 1.7, (WR - 12.4) / 2, a);
    }
    // the door is in the W0 partition, toward the wall
    const doorPos = at(W0, WR - 3.2, GAL + 1.25), led = cardSlot(W0, WR - 5.2, GAL + 1.3);
    const leaf = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 1.9), steel)); leaf.position.copy(doorPos); leaf.rotation.y = W0;
    let leafCol: ReturnType<typeof world.addBox> | null = world.addBox(doorPos.x, GAL + 1.7, doorPos.z, 0.16, 1.7, 1.0, W0);
    world.addBox(...at(W0, (12.4 + WR - 4.2) / 2, GAL + 1.7).toArray() as [number, number, number], 0.14, 1.7, (WR - 4.2 - 12.4) / 2, W0);
    const openRoom = (instant: boolean) => {
      if (leafCol) { world.remove(leafCol); leafCol = null; }
      led.emissive.set('#3dff7a');
      if (instant) leaf.position.y = GAL + 4.2; else { ctx.sfx('door', doorPos); world.tween(1.6, (k) => { leaf.position.y = GAL + 1.25 + 2.95 * k; }); }
    };
    if (roomOpen()) openRoom(true);
    world.interactables.push({
      pos: at(W0 - 0.06, WR - 3.2, GAL + 1.2), radius: 1.9, enabled: () => !roomOpen(),
      use: () => { if (!state.has('keycard')) { ctx.sfx('deny', doorPos); return; } state.set('ctrlOpen'); openRoom(false); },
    });
    // the desk
    const desk = add(new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.95, 1.1), pale)); desk.position.copy(at(ca, 14.2, GAL + 0.47)); desk.rotation.y = ca;
    world.addBox(desk.position.x, GAL + 0.5, desk.position.z, 2.6, 0.5, 0.55, ca);
    const onDesk = (dx: number, dy: number, dz = 0) => { const p = at(ca, 14.2 + dz, GAL + 0.95 + dy); p.x += Math.cos(ca) * dx; p.z -= Math.sin(ca) * dx; return p; };
    // four screens above it, hung from the ceiling over the well side
    const views: [THREE.Vector3, THREE.Vector3, boolean][] = [
      [at(da + 0.9, 9, F0 + 13), at(da, 17, F0 + 1.5), false],                 // the way in, from above
      [at(da + 2.5, 6, GAL - 6), new THREE.Vector3(cx, F0, cz), false],        // down the well
      [at(da - 0.5, 75, F0 + 30), at(da, 30, F0 + 6), true],                   // the quay stair and the door, from outside
      [at(pa + 1.2, 16, BY + 9), new THREE.Vector3(cx, BY + 3, cz), false],    // the plant
    ];
    views.forEach(([from, to, outside], i) => {
      const rt = new THREE.WebGLRenderTarget(320, 200, { type: THREE.HalfFloatType });      // the scene's light is far brighter than a screen: keep the range, and turn it down on the glass
      const cam = new THREE.PerspectiveCamera(i === 1 ? 70 : 58, 1.6, 0.3, 4000);
      cam.position.copy(from); cam.lookAt(to); cam.updateMatrixWorld();
      feeds.push({ cam, rt, outside });
      const scr = add(new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.72), new THREE.MeshBasicMaterial({ map: rt.texture, color: new THREE.Color(0.2, 0.25, 0.27) })));
      scr.position.copy(onDesk(-1.95 + i * 1.3, 1.25, -0.35)); scr.rotation.y = ca + Math.PI; scr.rotation.x = 0.0;
      const bez = add(new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.82, 0.1), steel)); bez.position.copy(onDesk(-1.95 + i * 1.3, 1.25, -0.42)); bez.rotation.y = ca;
    });
    // the two procedures, each a row of three controls with its three lamps and a mark to say what it is for
    const row = (dx: number, kind: 'flood' | 'jet') => {
      const lamps3 = stageLamps[kind];
      lamps3.forEach((m, i) => { const l = add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), m)); l.position.copy(onDesk(dx + (i - 1) * 0.34, 0.2, -0.3)); });
      // the mark: a wave for the sea, a falling figure for the sleepers
      const mark = new THREE.Group(); mark.position.copy(onDesk(dx, 0.02, 0.32)); mark.rotation.set(-Math.PI / 2, 0, -ca + Math.PI); add(mark);
      const ink = new THREE.MeshStandardMaterial({ color: '#0a0a0a', roughness: 0.6 });
      const stroke = (x1: number, y1: number, x2: number, y2: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x2 - x1, y2 - y1) + 0.012, 0.012, 0.004), ink); m.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0); m.rotation.z = Math.atan2(y2 - y1, x2 - x1); mark.add(m); };
      if (kind === 'flood') { for (const y of [0.04, -0.04]) for (let k = 0; k < 4; k++) stroke(-0.12 + k * 0.06, y + (k % 2 ? 0.02 : -0.02), -0.06 + k * 0.06, y + (k % 2 ? -0.02 : 0.02)); }
      else { stroke(0, 0.1, 0, 0.0); stroke(-0.05, 0.07, 0.05, 0.07); stroke(0, 0, -0.04, -0.07); stroke(0, 0, 0.04, -0.07); stroke(0.1, 0.1, 0.1, -0.08); stroke(0.1, -0.08, 0.07, -0.04); stroke(0.1, -0.08, 0.13, -0.04); }
      // controls: a lever, a key switch, and a guarded handle
      const lever = new THREE.Group(); lever.position.copy(onDesk(dx - 0.34, 0.0, 0)); add(lever);
      { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 6), steel); rod.position.y = 0.13; const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), MAT.red); knob.position.y = 0.27; lever.add(rod, knob); lever.rotation.x = -0.5; }
      const sw = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12), MAT.brass)); sw.position.copy(onDesk(dx, 0.025, 0));
      const tab = add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.09), MAT.dark)); tab.position.copy(onDesk(dx, 0.07, 0));
      const guard = add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: '#a01a12', roughness: 0.4, transparent: true, opacity: 0.55 }))); guard.position.copy(onDesk(dx + 0.34, 0.06, 0));
      const handle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14), MAT.red)); handle.position.copy(onDesk(dx + 0.34, 0.03, 0));
      const stage = () => (kind === 'flood' ? floodStage : jetStage);
      const setStage = (n: number) => { if (kind === 'flood') floodStage = n; else jetStage = n; };
      const show = () => { const n = stage(); lever.rotation.x = n >= 1 ? 0.5 : -0.5; tab.rotation.y = n >= 2 ? Math.PI / 2 : 0; guard.visible = n < 3; handle.position.y = onDesk(0, 0.03).y - (n >= 3 ? 0.025 : 0); };
      show();
      const act = (i: number, m: THREE.Object3D) => world.interactables.push({
        pos: m.position.clone().setY(GAL + 1.15), radius: 0.55,
        enabled: () => roomOpen() && stage() === i,
        use: () => {
          setStage(i + 1); show();
          ctx.sfx(i === 2 ? 'gate' : i === 1 ? 'unlock' : 'ratchet', m.position);
          if (i === 2) { if (kind === 'flood') { state.set('reactorFlooded'); floodT = 0; } else { state.set('jettisoned'); jetT = 0; ctx.sfx('giant-fall', new THREE.Vector3(cx, F0, cz), 1.5); } }
        },
      });
      act(0, lever); act(1, sw); act(2, handle);
    };
    row(-1.3, 'flood'); row(1.3, 'jet');
  }
  // up to the roof: a ladder on the wall of the gallery, through a hatch
  {
    const la = da + 0.9, lr = WR - 0.5, lp = at(la, lr, GAL), sx = Math.cos(la) * 0.24, sz = -Math.sin(la) * 0.24;
    for (const s of [-1, 1]) { const rail = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, ROOF - GAL + 1.1, 6), pale)); rail.position.set(lp.x + sx * s, (GAL + ROOF + 1.1) / 2, lp.z + sz * s); }
    for (let y = GAL + 0.3; y < ROOF + 0.05; y += 0.3) { const rung = add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5), pale)); rung.rotation.z = Math.PI / 2; rung.rotation.y = la; rung.position.set(lp.x, y, lp.z); }
    world.ladders.push({ x: lp.x, z: lp.z, y0: GAL, y1: ROOF, face: la, topExit: at(la, lr - 2.2, ROOF), bottomExit: at(la, lr - 1.2, GAL) });
    // on the roof, the hatch it comes out of
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 1.4), steel); hatch.position.copy(at(la, lr - 0.2, ROOF + 0.06)); hatch.rotation.y = la; scene.add(hatch);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 1.3), pale); lid.position.copy(at(la, lr + 0.35, ROOF + 0.62)); lid.rotation.set(0, la, 0); lid.rotateX(-1.15); scene.add(lid);
    world.ladders.push({ x: at(la, lr - 0.9, 0).x, z: at(la, lr - 0.9, 0).z, y0: ROOF - 3, y1: ROOF, face: la + Math.PI, topExit: at(la, lr - 2.2, ROOF), bottomExit: at(la, lr - 1.2, GAL) });
  }

  // ------------------------------------------------------------ the keeper
  const ka = da + Math.PI + 0.9;
  const keeper = new Npc(ctx, {
    key: 'keeper', pose: 'stand', aims: true, frail: true, yaw: ka + Math.PI,
    look: { coat: '#23262b', trousers: '#16181b', skin: '#a08a78', hood: false, hair: '#8a8880' },
    pos: at(ka, 9, ROOF), gives: 'keycard', giveSpot: at(ka + 0.14, 8.2, ROOF + 0.04),
  }, ctx.playerHand, ctx.playerPos);
  const _to = new THREE.Vector3();
  world.updaters.push(() => {
    // he turns to keep whoever is up here in front of him
    if (keeper.condition !== 0 || !onRoof(pp)) return;
    _to.subVectors(pp, keeper.pos);
    const want = Math.atan2(_to.x, _to.z), cur = keeper.figure.group.rotation.y;
    keeper.figure.group.rotation.y = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * 0.08;
  });

  // ------------------------------------------------------------ running it
  let floodT = state.flag('reactorFlooded') ? 1e4 : -1, feedI = 0, frame = 0, sirenT = 0, nudge = 0;
  // moving the heap: it does not move
  world.interactables.push({
    pos: new THREE.Vector3(), radius: 2.6,
    enabled: () => { if (!heapCol || !inside(pp) || pp.y > F0 + 6) return false; const d = Math.hypot(pp.x - heapC.x, pp.z - heapC.z); return d < HEAP_R + 0.6; },
    use: () => { nudge = 1; ctx.sfx('scrape', pp, 0.8); ctx.sfx('grunt', pp, 0.5); },
  });
  const heapPrompt = world.interactables[world.interactables.length - 1];
  const amb = new THREE.Color(), fog = new THREE.Color();
  world.updaters.push((dt, t) => {
    tNow = t;
    const here = inside(pp), down = inPlant(pp), any = here || down;
    room.visible = here || (feeds.length > 0 && atDesk());
    plant.visible = down || atDesk();
    heapPrompt.pos.set(pp.x, F0 + 1, pp.z);
    const alarm = floodT >= 0;
    for (const l of lamps) l.intensity = here ? (alarm ? 10 : l === galLamp ? 70 : 220) : 0;
    for (const l of plantLights) l.intensity = down && !alarm ? 260 : 0;
    plasmaM.emissiveIntensity = alarm ? Math.max(0, 3.2 - floodT * 0.6) : 3.2 + Math.sin(t * 7) * 0.3;
    const pulse = alarm ? 0.5 + 0.5 * Math.sin(t * 5.2) : 0;
    beaconM.emissiveIntensity = pulse * 5;
    for (const b of beacons) b.intensity = here ? pulse * 900 : 0;
    lampM.emissiveIntensity = alarm ? 0.4 : 3.2;
    stageLamps.flood.forEach((m, i) => { m.emissiveIntensity = floodStage > i ? 3 : 0; });
    stageLamps.jet.forEach((m, i) => { m.emissiveIntensity = jetStage > i ? 3 : 0; });
    if (any) {
      // sealed and windowless: nothing of the day gets in
      const un = ctx.env.under;
      un.amount = 1; un.density = 0.004; un.intensity = alarm ? 0.9 : 1.9;
      un.fog.copy(fog.set(alarm ? '#120303' : '#04080b')); un.ambient.copy(amb.set(alarm ? '#5a1c16' : down ? '#5a5080' : '#56747f'));
    }
    if (alarm) {
      floodT += dt;
      if (any && (sirenT -= dt) <= 0) { sirenT = 2.6; ctx.sfx('siren', pp, 0.55); }
    }
    if (jetT >= 0 && jetT < 60) {
      jetT += dt; layBodies(jetT);
      if (jetT > 9 && !heapCol) makeHeap();
      if (here && Math.random() < dt * 5) ctx.sfx('thud', new THREE.Vector3(cx, F0, cz), 0.5);
    } else if (jetT < 0 && here) layBodies(-1);
    if (nudge > 0) { nudge = Math.max(0, nudge - dt * 1.5); const s = sleepers[7]; bodies.setMatrixAt(7, _m4.compose(_v.copy(s.to).setY(s.to.y + Math.sin(nudge * Math.PI) * 0.06), _q.setFromEuler(s.rest), _one)); bodies.instanceMatrix.needsUpdate = true; }
    // the screens: one picture refreshed every few frames, in turn, while someone is at the desk to look
    if (atDesk() && (frame++ % 3) === 0) {
      const f = feeds[feedI++ % feeds.length];
      room.visible = true; plant.visible = true;
      hooks.feed(f.cam, f.rt);
    }
  });
  const atDesk = () => roomOpen() && pp.y > GAL - 1 && pp.y < ROOF - 1 && Math.hypot(pp.x - at(ca, 15, 0).x, pp.z - at(ca, 15, 0).z) < 9;

  return {
    inside: (p: THREE.Vector3) => inside(p) || inPlant(p),
    onRoof, keeper,
    enter: at(da, WR - 3.2, F0),
    /** the sleepers are gone and whoever did it is standing on the roof */
    over: () => jetT > 20 && onRoof(pp),
    roofY: ROOF,
    /** a shot was fired on the roof and did not hit the keeper: he answers it */
    answer() {
      if (keeper.condition !== 0 || !onRoof(pp)) return;
      world.after(0.45, () => { if (keeper.condition !== 0) return; ctx.sfx('shot', keeper.pos, 2.5); hooks.kill(); });
    },
  };
}
