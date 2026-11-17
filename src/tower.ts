// The black tower: a windowless monolith with a stair wound round it and a
// door that opens to eight figures in the sea people's numerals. What is
// inside is in towerin.ts.
import * as THREE from 'three';
import { Ctx } from './ctx';
import { Builder } from './build';
import { calmZones } from './waves';
import { NUMERALS, WIPE, glyphMesh, towerCode } from './glyphs';
import { buildTowerInterior, TowerHooks } from './towerin';

export const TOWER = { x: 950, z: -850, r: 30, h: 460 };

export function buildTower(ctx: Ctx, hooks: TowerHooks) {
  const { scene, world, state } = ctx;
  if (!state.flag('seed')) state.set('seed', 1 + Math.floor(Math.random() * 1e6));     // every game has its own numbers
  const code = towerCode(state.flag('seed'));
  const cx = TOWER.x, cz = TOWER.z, R = TOWER.r;
  calmZones.push({ x: cx, z: cz, r0: 40, r1: 150 });
  const b = new Builder(scene, world, cx, 0, cz);
  const obsidian = new THREE.MeshStandardMaterial({ color: '#040405', roughness: 0.1, metalness: 0.55 });
  const matte = new THREE.MeshStandardMaterial({ color: '#070708', roughness: 0.45, metalness: 0.3 });

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R, TOWER.h + 40, 96, 1), obsidian);
  tower.position.set(cx, TOWER.h / 2 - 20, cz);
  scene.add(tower);
  // a shell: there is a great deal of room inside. It narrows as it rises, so the upper part is the thinner ring.
  world.addCyl(cx, cz, R, -40, 200, 24.5);
  world.addCyl(cx, cz, 26.2, 200, TOWER.h, 24.5);

  // the stair: one and a quarter turns up to the door
  const RISE = 62, TURNS = 1.25, SEG = 84, W = 3.0;
  const rs = R + W / 2 - 0.1;
  const a0 = Math.PI;                          // starts on the south-west, at the quay
  for (let i = 0; i < SEG; i++) {
    const k0 = i / SEG, k1 = (i + 1) / SEG;
    const am = a0 + (k0 + k1) * 0.5 * TURNS * Math.PI * 2;
    const y0 = 1.2 + k0 * RISE, y1 = 1.2 + k1 * RISE;
    const len = rs * (TURNS * Math.PI * 2) / SEG + 0.25;
    const x = Math.sin(am) * rs, z = Math.cos(am) * rs;
    const yaw = am + Math.PI / 2;              // tangent, climbing with increasing angle
    // each segment is three shallow treads over one ramp collider
    for (let s = 0; s < 3; s++) {
      const t = (s + 0.5) / 3 - 0.5;
      const tread = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, len / 3 + 0.02), matte);
      tread.position.set(cx + x + Math.sin(yaw) * t * len, y0 + (y1 - y0) * ((s + 1) / 3) - 0.25, cz + z + Math.cos(yaw) * t * len);
      tread.rotation.y = yaw;
      tread.receiveShadow = true;
      tread.userData.static = true;
      scene.add(tread);
    }
    world.addBox(cx + x, y0 - 0.25, cz + z, W / 2, 0.25, len / 2, yaw, y1 - y0);
  }
  // quay at the foot, and the landing before the door
  const qx = Math.sin(a0) * (rs + 1), qz = Math.cos(a0) * (rs + 1);
  b.box(qx - 2.5, 0.2, qz - 3, 9, 2.0, 9, matte);
  world.moorings.push({ name: 'tower', x: cx + qx - 2.5, z: cz + qz - 11, psi: Math.PI / 2, dock: new THREE.Vector3(cx + qx - 2.5, 1.2, cz + qz - 5.5) });
  const aEnd = a0 + TURNS * Math.PI * 2, top = 1.2 + RISE;
  const lx = Math.sin(aEnd + 0.12) * (R + 3.4), lz = Math.cos(aEnd + 0.12) * (R + 3.4);
  b.box(lx, top - 0.5, lz, 12, 1.0, 12, matte, aEnd + 0.12);
  // the door: a seam in the stone and a slab a shade less reflective
  const da = aEnd + 0.12;
  const door = new THREE.Mesh(new THREE.BoxGeometry(7, 15, 0.5), new THREE.MeshStandardMaterial({ color: '#030304', roughness: 0.03, metalness: 0.8 }));
  door.position.set(cx + Math.sin(da) * (R - 0.6), top + 7.5, cz + Math.cos(da) * (R - 0.6));
  door.rotation.y = da;
  scene.add(door);
  for (const s of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 16, 1.4), matte);
    jamb.position.set(cx + Math.sin(da) * (R - 0.2) + Math.cos(da) * s * 3.9, top + 8, cz + Math.cos(da) * (R - 0.2) - Math.sin(da) * s * 3.9);
    jamb.rotation.y = da;
    scene.add(jamb);
  }
  // the pad: twelve glyphs on a plinth beside the door
  const pad = new THREE.Group();
  pad.position.set(cx + Math.sin(da) * (R + 0.9) + Math.cos(da) * 5.2, top + 1.35, cz + Math.cos(da) * (R + 0.9) - Math.sin(da) * 5.2);
  pad.rotation.y = da;
  scene.add(pad);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.9, 0.5), matte);
  plinth.position.y = -0.3;
  pad.add(plinth);
  world.addBox(pad.position.x, top + 1, pad.position.z, 0.6, 1.4, 0.4, da);
  const keys: THREE.MeshStandardMaterial[] = [];
  // keys: the ten numerals in three rows, nought below, with a key that wipes what has been entered
  const KEYMAP = [1, 2, 3, 4, 5, 6, 7, 8, 9, -1, 0, -2];      // -1: wipe, -2: blank
  const mark = new THREE.MeshStandardMaterial({ color: '#8a8f96', roughness: 0.35, metalness: 0.7 });
  // eight small lamps over the keys: one lights for each figure entered
  const tally = Array.from({ length: 8 }, (_, i) => { const m = new THREE.MeshStandardMaterial({ color: '#0a0a0b', emissive: '#9fb6c8', emissiveIntensity: 0 }); const d = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.02), m); d.position.set(-0.385 + i * 0.11, 1.0, 0.26); pad.add(d); return m; });
  for (let i = 0; i < 12; i++) {
    const km = new THREE.MeshStandardMaterial({ color: '#0a0a0b', roughness: 0.2, metalness: 0.5, emissive: '#9fb6c8', emissiveIntensity: 0 });
    keys.push(km);
    const key = new THREE.Group();
    key.position.set(-0.3 + (i % 3) * 0.3, 0.75 - Math.floor(i / 3) * 0.3, 0.26);
    key.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.04), km));
    { const k = KEYMAP[i]; if (k !== -2) { const gm = glyphMesh(k === -1 ? WIPE : NUMERALS[k], 0.085, mark); gm.position.z = 0.026; key.add(gm); } }
    pad.add(key);
  }

  // using the pad: move across the keys and press eight figures. The right eight open the door.
  let active = false, sel = 0, cool = 0;
  const entered: number[] = [];
  const flash = new Float32Array(12);
  const isOpen = () => !!state.flag('towerOpen');
  const openDoor = (instant: boolean) => {
    if (instant) { door.position.y = top - 8.2; return; }
    ctx.sfx('gate', door.position, 1.6);
    world.tween(7, (k) => { door.position.y = top + 7.5 - 15.7 * k * k * (3 - 2 * k); });
  };
  if (isOpen()) openDoor(true);
  world.interactables.push({
    pos: new THREE.Vector3(pad.position.x + Math.sin(da) * 0.9, top + 1.2, pad.position.z + Math.cos(da) * 0.9), radius: 1.6,
    enabled: () => !active && cool <= 0 && !isOpen(),
    use: () => { active = true; entered.length = 0; sel = 4; cool = 0.3; },
  });
  world.updaters.push((dt) => {
    cool = Math.max(0, cool - dt);
    for (let i = 0; i < 12; i++) {
      flash[i] = Math.max(0, flash[i] - dt * 2.5);
      keys[i].emissiveIntensity = flash[i] * 2.5 + (active && i === sel ? 0.5 : 0);
    }
    tally.forEach((m, i) => { m.emissiveIntensity = isOpen() ? 1.2 : i < entered.length ? 2.2 : 0; });
    if (!active) return;
    const inp = ctx.input;
    ctx.hold(0.2);
    if (inp.hit('KeyA') || inp.hit('ArrowLeft')) sel = Math.floor(sel / 3) * 3 + ((sel % 3) + 2) % 3;
    if (inp.hit('KeyD') || inp.hit('ArrowRight')) sel = Math.floor(sel / 3) * 3 + ((sel % 3) + 1) % 3;
    if (inp.hit('KeyW') || inp.hit('ArrowUp')) sel = (sel + 9) % 12;
    if (inp.hit('KeyS') || inp.hit('ArrowDown')) sel = (sel + 3) % 12;
    if (cool <= 0 && inp.hit('KeyE')) {
      const k = KEYMAP[sel];
      flash[sel] = 1;
      ctx.sfx('key', pad.position);
      if (k === -1) entered.length = 0;
      else if (k >= 0) entered.push(k);
      if (entered.length >= 8) {
        const right = entered.every((d, i) => d === code[i]);
        entered.length = 0;
        if (right) { active = false; state.set('towerOpen'); world.after(0.6, () => openDoor(false)); }
        else world.after(0.5, () => { ctx.sfx('deny', pad.position, 1.5); for (let i = 0; i < 12; i++) flash[i] = 0.6; });
      }
    }
    if (inp.hit('Escape') || inp.hit('Tab') || inp.hit('KeyQ')) { active = false; cool = 0.4; }
  });

  // through the door
  const outside = new THREE.Vector3(cx + Math.sin(da) * (R + 3), top, cz + Math.cos(da) * (R + 3));
  const inner = buildTowerInterior(ctx, { cx, cz, floor: top, top: TOWER.h, doorAngle: da, hooks, exit: outside });
  world.interactables.push({
    pos: new THREE.Vector3(cx + Math.sin(da) * (R + 1.2), top + 1.2, cz + Math.cos(da) * (R + 1.2)), radius: 2.6,
    enabled: () => isOpen() && door.position.y < top - 6,
    use: () => ctx.fade(() => { ctx.playerPos().copy(inner.enter); ctx.sfx('door', inner.enter); }, 0.9),
  });

  return { near: (p: THREE.Vector3) => Math.hypot(p.x - cx, p.z - cz) < 120, padActive: () => active, code, ...inner };
}
