// The offshore wind turbine: a long climb, and a puzzle in the nacelle that
// brings the power back.
import * as THREE from 'three';
import { Ctx } from './ctx';
import { Builder } from './build';
import { MAT } from './materials';
import { calmZones } from './waves';
import { makeItem } from './items';
import { BoxCollider, Interactable, Ladder } from './world';

export const WINDMILL = { x: 600, z: 100 };
const BASE = 6;          // deck height
const TOP = 118.6;       // nacelle floor
const R_IN = 2.6, R_OUT = 3.0;

export function buildWindmill(ctx: Ctx) {
  const { scene, world, state } = ctx;
  const cx = WINDMILL.x, cz = WINDMILL.z;
  calmZones.push({ x: cx + 60, z: cz + 60, r0: 60, r1: 190 });
  const b = new Builder(scene, world, cx, 0, cz);
  const P = (x: number, y: number, z: number) => new THREE.Vector3(cx + x, y, cz + z);

  // ---------- foundation and base deck ----------
  b.cyl(0, 0, 3.3, -30, BASE - 0.4, MAT.rust, true, 3.3, 24);
  b.mesh(new THREE.CylinderGeometry(6.2, 6.2, 0.4, 32), MAT.steel, 0, BASE - 0.2, 0);
  world.addCyl(cx, cz, 6.2, BASE - 0.4, BASE);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, a2 = ((i + 1) / 24) * Math.PI * 2;
    if (i === 18) continue; // gap at the ladder head (south)
    b.bar(Math.cos(a) * 6, BASE, Math.sin(a) * 6, Math.cos(a) * 6, BASE + 1.05, Math.sin(a) * 6, 0.03, MAT.rust, 5);
    b.bar(Math.cos(a) * 6, BASE + 1.05, Math.sin(a) * 6, Math.cos(a2) * 6, BASE + 1.05, Math.sin(a2) * 6, 0.03, MAT.rust, 5);
    b.bar(Math.cos(a) * 6, BASE + 0.55, Math.sin(a) * 6, Math.cos(a2) * 6, BASE + 0.55, Math.sin(a2) * 6, 0.02, MAT.rust, 5);
  }
  world.addCyl(cx, cz, 6.3, BASE, BASE + 1.05, 5.9);
  // landing and ladder on the south side
  b.box(0, 0.15, -8.4, 3.6, 0.6, 2.8, MAT.rust);
  b.bar(-0.24, 0.45, -6.2, -0.24, BASE + 1, -6.2, 0.03, MAT.steel); b.bar(0.24, 0.45, -6.2, 0.24, BASE + 1, -6.2, 0.03, MAT.steel);
  for (let y = 0.75; y < BASE; y += 0.3) b.bar(-0.24, y, -6.2, 0.24, y, -6.2, 0.018, MAT.steel, 5);
  world.ladders.push({ x: cx, z: cz - 6.2, y0: 0.45, y1: BASE, face: 0, topExit: P(0, BASE, -5.2), bottomExit: P(0, 0.45, -7.4) });
  world.moorings.push({ name: 'windmill', x: cx, z: cz - 12, psi: Math.PI / 2, dock: P(0, 0.45, -8.8) });

  // ---------- tower ----------
  const towerH = TOP - 0.6 - BASE;
  const tower = b.mesh(new THREE.CylinderGeometry(2.1, R_OUT, towerH, 40, 12), MAT.whiteSteel, 0, BASE + towerH / 2, 0);
  tower.castShadow = true;
  const insideMat = new THREE.MeshStandardMaterial({ color: '#2a2d30', roughness: 0.8, metalness: 0.3, side: THREE.BackSide });
  b.mesh(new THREE.CylinderGeometry(R_IN, R_IN, towerH, 28, 1, true), insideMat, 0, BASE + towerH / 2, 0, false);
  world.addCyl(cx, cz, R_OUT, BASE - 0.4, TOP - 0.6, R_IN);
  // door: stepping through is a short blackout rather than a gap in the wall
  b.box(0, BASE + 1.05, -R_OUT - 0.02, 1.1, 2.1, 0.1, MAT.dark, 0, false);
  b.box(0, BASE + 1.05, -R_IN + 0.04, 1.1, 2.1, 0.06, MAT.dark, 0, false);
  const pp = ctx.playerPos();
  world.interactables.push({ pos: P(0, BASE + 1, -R_OUT - 0.5), radius: 1.6, use: () => ctx.fade(() => { pp.set(cx, BASE, cz - 1.4); ctx.sfx('door', pp); }) });
  world.interactables.push({ pos: P(0, BASE + 1, -R_IN + 0.5), radius: 1.3, use: () => ctx.fade(() => { pp.set(cx, BASE, cz - R_OUT - 1.2); ctx.sfx('door', pp); }) });
  b.mesh(new THREE.CylinderGeometry(R_IN, R_IN, 0.1, 24), MAT.steel, 0, BASE - 0.02, 0, false);

  // landings every ten metres, ladders alternating north and south
  const lampMat = new THREE.MeshStandardMaterial({ color: '#1c1c1c', emissive: '#ffcf9a', emissiveIntensity: 0 });
  const slitMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const levels: number[] = [];
  for (let y = BASE; y < TOP - 5; y += 10) levels.push(y);
  levels.forEach((y0, i) => {
    const last = i === levels.length - 1;
    const y1 = last ? TOP : y0 + 10;
    const s = i % 2 === 0 ? 1 : -1;
    if (i > 0) {
      b.box(0, y0 - 0.05, 0, 2.0, 0.1, 3.4, MAT.steel);
      b.rail(-1.0, -1.7, -1.0, 1.7, y0, MAT.rust, 1.0); b.rail(1.0, -1.7, 1.0, 1.7, y0, MAT.rust, 1.0);
      // a brace back to the wall on each side
      b.bar(-1, y0 - 0.1, 0, -R_IN, y0 - 0.9, 0, 0.04, MAT.rust); b.bar(1, y0 - 0.1, 0, R_IN, y0 - 0.9, 0, 0.04, MAT.rust);
    }
    if (last) {
      // the final ladder rises through the centre of the nacelle floor
      b.bar(-0.24, y0, 0.3, -0.24, TOP + 1.0, 0.3, 0.025, MAT.steel); b.bar(0.24, y0, 0.3, 0.24, TOP + 1.0, 0.3, 0.025, MAT.steel);
      for (let y = y0 + 0.3; y < TOP; y += 0.3) b.bar(-0.24, y, 0.3, 0.24, y, 0.3, 0.016, MAT.steel, 5);
      world.ladders.push({ x: cx, z: cz + 0.3, y0, y1: TOP, face: 0, topExit: P(0, TOP, 1.35), bottomExit: P(0, y0, -0.5) });
    } else {
      const z = s * 2.15;
      b.bar(-0.24, y0, z, -0.24, y1 + 1.0, z, 0.025, MAT.steel); b.bar(0.24, y0, z, 0.24, y1 + 1.0, z, 0.025, MAT.steel);
      for (let y = y0 + 0.3; y < y1 + 0.05; y += 0.3) b.bar(-0.24, y, z, 0.24, y, z, 0.016, MAT.steel, 5);
      // safety hoops
      for (let y = y0 + 2.4; y < y1; y += 1.5) {
        const hoop = b.mesh(new THREE.TorusGeometry(0.42, 0.012, 4, 14, Math.PI), MAT.rust, 0, y, z - s * 0.02, false);
        hoop.rotation.set(Math.PI / 2, 0, s > 0 ? Math.PI : 0);
      }
      world.ladders.push({ x: cx, z: cz + z, y0, y1, face: s > 0 ? 0 : Math.PI, topExit: P(0, y1, s * 1.15), bottomExit: P(0, y0, s * 1.15) });
    }
    // a work lamp and a slot of daylight on each level
    b.box(-R_IN + 0.12, y0 + 2.3, 0, 0.1, 0.35, 0.2, lampMat, 0, false);
    const slit = b.mesh(new THREE.PlaneGeometry(0.16, 1.5), slitMat, R_IN - 0.03, y0 + 1.7, 0, false);
    slit.rotation.y = -Math.PI / 2;
    // symbols instead of numbers: one more bar on each landing
    for (let k = 0; k <= i % 6; k++) b.box(-R_IN + 0.06, y0 + 1.5, -0.5 + k * 0.2, 0.02, 0.3, 0.07, MAT.bone, 0, false);
  });
  const towerLight = new THREE.PointLight('#ffcf9a', 0, 26, 1.4);
  scene.add(towerLight);

  // ---------- nacelle (turns to face the wind) ----------
  const nac = new THREE.Group();
  nac.position.set(cx, 0, cz);
  scene.add(nac);
  const nb = new Builder(nac, world);
  const FL = TOP, ROOF = TOP + 3.2;
  const shell = MAT.whiteSteel, innerMat = new THREE.MeshStandardMaterial({ color: '#34383b', roughness: 0.85, metalness: 0.2 });
  // local colliders, rebuilt in world space whenever the nacelle turns
  const localBoxes: [number, number, number, number, number, number][] = [];
  const lb = (x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: THREE.Material | null) => {
    if (mat) nb.box(x, y, z, sx, sy, sz, mat, 0, false);
    localBoxes.push([x, y, z, sx / 2, sy / 2, sz / 2]);
  };
  // floor in four pieces around the central hatch
  lb(-1.35, FL - 0.1, 1, 1.5, 0.2, 9, innerMat); lb(1.35, FL - 0.1, 1, 1.5, 0.2, 9, innerMat);
  lb(0, FL - 0.1, 3.2, 1.2, 0.2, 4.6, innerMat); lb(0, FL - 0.1, -2.0, 1.2, 0.2, 3.0, innerMat);
  // walls
  lb(-2.05, FL + 1.6, 1, 0.12, 3.2, 9.2, shell); lb(2.05, FL + 1.6, 1, 0.12, 3.2, 9.2, shell);
  lb(0, FL + 1.6, -3.55, 4.2, 3.2, 0.12, shell); lb(0, FL + 1.6, 5.55, 4.2, 3.2, 0.12, shell);
  // roof in pieces around the roof hatch
  lb(-0.75, ROOF + 0.06, 1, 2.7, 0.12, 9.2, shell); lb(1.4, ROOF + 0.06, 2.0, 1.4, 0.12, 7.2, shell); lb(1.4, ROOF + 0.06, -3.25, 1.4, 0.12, 0.7, shell);
  nb.box(0, FL - 0.75, 1, 4.2, 1.1, 9.2, shell, 0, false); // belly fairing
  // generator and gearbox
  lb(0, FL + 0.9, 3.9, 1.7, 1.8, 2.6, MAT.steel);
  const shaft = nb.mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.2, 14), MAT.dark, 0, FL + 1.6, 5.6);
  shaft.rotation.x = Math.PI / 2;
  // roof rails
  for (const [ax, az, bx, bz] of [[-2, -3.5, -2, 5.5], [2, -3.5, 2, 5.5], [-2, -3.5, 2, -3.5], [-2, 5.5, 2, 5.5]] as const) {
    nb.bar(ax, ROOF + 1.0, az, bx, ROOF + 1.0, bz, 0.03, MAT.rust, 5);
    nb.bar(ax, ROOF + 0.12, az, ax, ROOF + 1.0, az, 0.03, MAT.rust, 5);
    localBoxes.push([(ax + bx) / 2, ROOF + 0.6, (az + bz) / 2, Math.abs(bx - ax) / 2 + 0.05, 0.5, Math.abs(bz - az) / 2 + 0.05]);
  }
  // roof ladder
  const RLX = 1.4, RLZ = -2.75;
  nb.bar(RLX - 0.24, FL, RLZ, RLX - 0.24, ROOF + 1.1, RLZ, 0.025, MAT.steel); nb.bar(RLX + 0.24, FL, RLZ, RLX + 0.24, ROOF + 1.1, RLZ, 0.025, MAT.steel);
  for (let y = FL + 0.3; y < ROOF + 0.1; y += 0.3) nb.bar(RLX - 0.24, y, RLZ, RLX + 0.24, y, RLZ, 0.016, MAT.steel, 5);
  const roofLadder: Ladder = { x: 0, z: 0, y0: FL, y1: ROOF + 0.12, face: 0, topExit: new THREE.Vector3(), bottomExit: new THREE.Vector3() };
  world.ladders.push(roofLadder);
  // wind vane on the roof
  const vane = new THREE.Group();
  vane.position.set(-1.2, ROOF + 1.6, -2.6);
  nac.add(vane);
  nb.bar(-1.2, ROOF + 0.12, -2.6, -1.2, ROOF + 1.6, -2.6, 0.025, MAT.dark);
  { const tail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.7), MAT.red); tail.position.z = 0.55; const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 8), MAT.red); nose.rotation.x = -Math.PI / 2; nose.position.z = -0.5; const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 5), MAT.dark); rod.rotation.x = Math.PI / 2; vane.add(tail, nose, rod); }
  // warning light
  const beaconMat = new THREE.MeshStandardMaterial({ color: '#200', emissive: '#ff2a1a', emissiveIntensity: 0 });
  nb.mesh(new THREE.SphereGeometry(0.16, 10, 8), beaconMat, 0, ROOF + 0.3, -3.2, false);

  // ---------- controls ----------
  // cabinet with two empty sockets
  nb.box(-1.8, FL + 1.1, -1.6, 0.35, 2.0, 1.5, MAT.steel, 0, false);
  localBoxes.push([-1.8, FL + 1.1, -1.6, 0.2, 1.0, 0.75]);
  const socketMat = new THREE.MeshStandardMaterial({ color: '#050505', roughness: 1 });
  nb.box(-1.61, FL + 1.45, -1.95, 0.02, 0.2, 0.3, socketMat, 0, false);
  nb.box(-1.61, FL + 1.45, -1.25, 0.02, 0.06, 0.34, socketMat, 0, false);
  const fitted: Record<string, THREE.Object3D> = {};
  for (const [id, z] of [['contactor', -1.95], ['card', -1.25]] as const) {
    const o = makeItem(id);
    o.scale.multiplyScalar(1.5);
    o.rotation.set(0, 0, id === 'card' ? Math.PI / 2 : 0);
    o.position.set(-1.56, FL + 1.45, z);
    o.visible = false;
    nac.add(o);
    fitted[id] = o;
  }
  const pilot = new THREE.MeshStandardMaterial({ color: '#1a1205', emissive: '#ffa02a', emissiveIntensity: 0 });
  for (let i = 0; i < 3; i++) nb.box(-1.61, FL + 1.9, -2.0 + i * 0.3, 0.02, 0.06, 0.06, pilot, 0, false);

  // brake lever
  const brake = new THREE.Group();
  brake.position.set(-1.9, FL + 0.9, 1.0);
  nac.add(brake);
  { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), MAT.dark); arm.position.y = 0.45; const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), MAT.red); knob.position.y = 0.9; brake.add(arm, knob); }
  nb.box(-1.9, FL + 0.6, 1.0, 0.25, 0.9, 0.5, MAT.steel, 0, false);
  // pitch lever
  const pitchL = new THREE.Group();
  pitchL.position.set(1.9, FL + 0.9, 2.2);
  nac.add(pitchL);
  { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), MAT.dark); arm.position.y = 0.45; const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), MAT.bone); knob.position.y = 0.9; pitchL.add(arm, knob); }
  nb.box(1.9, FL + 0.6, 2.2, 0.25, 0.9, 0.5, MAT.steel, 0, false);
  // yaw hand wheel with a wind gauge above it
  const yawWheel = new THREE.Group();
  yawWheel.position.set(1.85, FL + 1.1, 0.3);
  nac.add(yawWheel);
  { const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 22), MAT.dark); rim.rotation.y = Math.PI / 2; yawWheel.add(rim); for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.58, 0.03), MAT.dark); sp.rotation.x = (k / 3) * Math.PI; yawWheel.add(sp); } }
  const gauge = nb.mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 24), MAT.bone, 1.96, FL + 1.95, 0.3, false);
  gauge.rotation.z = Math.PI / 2;
  nb.box(1.93, FL + 2.17, 0.3, 0.02, 0.08, 0.035, MAT.red, 0, false); // the mark the needle must meet
  const needle = new THREE.Group();
  needle.position.set(1.93, FL + 1.95, 0.3);
  nac.add(needle);
  { const n = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.22, 0.02), MAT.dark); n.position.y = 0.1; needle.add(n); }

  // ---------- rotor ----------
  const rotor = new THREE.Group();
  rotor.position.set(0, FL + 1.6, 7.0);
  nac.add(rotor);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 14), shell);
  hub.scale.set(1, 1, 1.5);
  hub.castShadow = true;
  rotor.add(hub);
  const blades: THREE.Group[] = [];
  {
    // a blade as a tapered, twisted loft
    const L = 54, N = 18;
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const k = i / N, y = 1.2 + k * L;
      const chord = (k < 0.12 ? 1.6 + (k / 0.12) * 2.6 : 4.2 * Math.pow(1 - (k - 0.12) / 0.88, 0.75) + 0.35);
      const thick = Math.max(0.12, chord * (0.32 - k * 0.2));
      const tw = (1 - k) * 0.5;
      const ring: [number, number][] = [[-0.3 * chord, 0], [0, thick / 2], [0.7 * chord, 0], [0, -thick / 2]];
      for (const [x, z] of ring) pos.push(x * Math.cos(tw) - z * Math.sin(tw), y, x * Math.sin(tw) + z * Math.cos(tw));
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < 4; j++) {
      const a = i * 4 + j, c = i * 4 + ((j + 1) % 4), d = a + 4, e = c + 4;
      idx.push(a, c, d, c, e, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i / 3) * Math.PI * 2;
      const blade = new THREE.Group();
      const mesh = new THREE.Mesh(g, shell);
      mesh.castShadow = true;
      blade.add(mesh);
      arm.add(blade);
      rotor.add(arm);
      blades.push(blade);
    }
  }

  // ---------- state ----------
  let yaw = state.flag('wmYaw') ? (state.flag('wmYaw') - 1) * (Math.PI / 6) : 2.4;
  let spin = 0, spinSpeed = 0, feather = 1, shudder = 0;
  const powered = () => !!state.flag('power');
  const colliders: BoxCollider[] = [];
  const its: { it: Interactable; lx: number; ly: number; lz: number }[] = [];
  const addIt = (lx: number, ly: number, lz: number, radius: number, enabled: () => boolean, use: () => void) => {
    const it: Interactable = { pos: new THREE.Vector3(), radius, enabled, use };
    world.interactables.push(it);
    its.push({ it, lx, ly, lz });
  };
  function place() {
    nac.rotation.y = yaw;
    const s = Math.sin(yaw), c = Math.cos(yaw);
    const toW = (x: number, z: number) => [cx + x * c + z * s, cz - x * s + z * c] as const;
    for (const col of colliders) world.remove(col);
    colliders.length = 0;
    for (const [x, y, z, hx, hy, hz] of localBoxes) { const [wx, wz] = toW(x, z); colliders.push(world.addBox(wx, y, wz, hx, hy, hz, yaw)); }
    for (const k of its) { const [wx, wz] = toW(k.lx, k.lz); k.it.pos.set(wx, k.ly, wz); }
    const [lx, lz] = toW(RLX, RLZ);
    roofLadder.x = lx; roofLadder.z = lz; roofLadder.face = yaw + Math.PI;
    const [tx, tz] = toW(RLX - 1.1, RLZ + 0.2); roofLadder.topExit.set(tx, ROOF + 0.12, tz);
    const [bx, bz] = toW(RLX, RLZ + 0.9); roofLadder.bottomExit.set(bx, FL, bz);
  }
  /** angle between the rotor axis and the direction the wind is coming from */
  const offWind = () => { const d = yaw - (ctx.wind.dir + Math.PI); return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); };

  addIt(-1.45, FL + 1.4, -1.6, 1.7, () => !state.flag('wmParts') && (state.has('contactor') || state.has('card')), () => {
    for (const id of ['contactor', 'card'] as const) if (state.take(id)) { state.set('wm_' + id); fitted[id].visible = true; ctx.sfx('clank', its[0].it.pos); }
    if (state.flag('wm_contactor') && state.flag('wm_card')) { state.set('wmParts'); ctx.sfx('hum', its[0].it.pos); }
  });
  addIt(-1.6, FL + 1.2, 1.0, 1.4, () => !powered(), () => {
    if (!state.flag('wmParts')) { world.tween(0.5, (k) => { brake.rotation.x = Math.sin(k * Math.PI) * 0.3; }); ctx.sfx('clank', its[1].it.pos); return; }
    const on = !state.flag('wmBrake');
    state.set('wmBrake', on ? 1 : 0);
    ctx.sfx('lever', its[1].it.pos);
  });
  addIt(1.5, FL + 1.1, 0.3, 1.4, () => !powered() && !turning, () => {
    turning = true;
    const from = yaw, pp2 = ctx.playerPos();
    let prev = 0;
    ctx.sfx('yaw', its[2].it.pos);
    world.tween(3.2, (k) => {
      const d = (Math.PI / 6) * (k - prev);
      prev = k;
      yaw = from + (Math.PI / 6) * k;
      yawWheel.rotation.x = k * 12;
      // carry the player round with the floor
      const dx = pp2.x - cx, dz = pp2.z - cz, s = Math.sin(d), c = Math.cos(d);
      pp2.x = cx + dx * c + dz * s; pp2.z = cz - dx * s + dz * c;
      ctx.turnView(d);
      place();
    }, () => { turning = false; state.set('wmYaw', Math.round(((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 6)) + 1); });
  });
  let turning = false;
  addIt(1.6, FL + 1.2, 2.2, 1.4, () => !powered(), () => {
    ctx.sfx('lever', its[3].it.pos);
    const ok = state.flag('wmParts') && state.flag('wmBrake') && offWind() < 0.42;
    world.tween(1.4, (k) => { feather = 1 - k; pitchL.rotation.x = -0.7 * k; }, () => {
      if (ok) { state.set('power'); ctx.sfx('spinup', its[3].it.pos, 1.5); }
      else {
        // the machine refuses: it shudders and feathers itself again
        shudder = 1.6; ctx.sfx('groan', its[3].it.pos, 1.3);
        world.after(1.2, () => world.tween(1.6, (k) => { feather = k; pitchL.rotation.x = -0.7 * (1 - k); }));
      }
    });
  });
  if (powered()) { feather = 0; spinSpeed = 0.85; pitchL.rotation.x = -0.7; }
  for (const id of ['contactor', 'card']) if (state.flag('wm_' + id)) fitted[id].visible = true;
  place();

  world.updaters.push((dt, t) => {
    const on = powered();
    // once running it tracks the wind by itself
    if (on && !turning) {
      const want = ctx.wind.dir + Math.PI;
      const d = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
      if (Math.abs(d) > 0.02) { yaw += Math.sign(d) * Math.min(Math.abs(d), dt * 0.02); nac.rotation.y = yaw; }
    }
    brake.rotation.x += ((state.flag('wmBrake') ? -0.75 : 0) - brake.rotation.x) * Math.min(1, dt * 6);
    spinSpeed += ((on ? 0.85 : 0) - spinSpeed) * Math.min(1, dt * 0.12);
    shudder = Math.max(0, shudder - dt);
    spin += spinSpeed * dt;
    rotor.rotation.z = spin + Math.sin(t * 31) * 0.012 * shudder;
    nac.position.y = Math.sin(t * 27) * 0.02 * shudder;
    for (const bl of blades) bl.rotation.y = feather * 1.45;
    // gauge needle: straight up means the rotor faces the wind
    const d = yaw - (ctx.wind.dir + Math.PI);
    needle.rotation.x = Math.atan2(Math.sin(d), Math.cos(d));
    vane.rotation.y = ctx.wind.dir + Math.PI - yaw + Math.sin(t * 2.3) * 0.06;
    pilot.emissiveIntensity = state.flag('wmParts') ? 2.5 + Math.sin(t * 4) * 0.4 : 0;
    lampMat.emissiveIntensity = on ? 3 : 0;
    beaconMat.emissiveIntensity = on ? (Math.sin(t * 2.2) > 0.6 ? 8 : 0.3) : 0;
    slitMat.color.copy(ctx.env.uniforms.uHorizon.value).multiplyScalar(1.4);
    // one moving light keeps the climber company once the power is on
    const p = ctx.playerPos();
    const inside = Math.hypot(p.x - cx, p.z - cz) < R_OUT + 3 && p.y > BASE - 1;
    towerLight.intensity = on && inside ? 30 : 0;
    towerLight.position.set(cx - 1.6, Math.round((p.y - BASE) / 10) * 10 + BASE + 2.3, cz);
  });

  return { powered, inside: (p: THREE.Vector3) => Math.hypot(p.x - cx, p.z - cz) < R_IN + 0.1 && p.y > BASE - 0.5 && p.y < TOP - 1 };
}
