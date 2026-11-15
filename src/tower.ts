// The black tower: a windowless monolith with a stair wound round it and a
// door that does not open. Not in this version.
import * as THREE from 'three';
import { Ctx } from './ctx';
import { Builder } from './build';
import { calmZones } from './waves';

export const TOWER = { x: 950, z: -850, r: 30, h: 460 };

export function buildTower(ctx: Ctx) {
  const { scene, world } = ctx;
  const cx = TOWER.x, cz = TOWER.z, R = TOWER.r;
  calmZones.push({ x: cx, z: cz, r0: 40, r1: 150 });
  const b = new Builder(scene, world, cx, 0, cz);
  const obsidian = new THREE.MeshStandardMaterial({ color: '#040405', roughness: 0.1, metalness: 0.55 });
  const matte = new THREE.MeshStandardMaterial({ color: '#070708', roughness: 0.45, metalness: 0.3 });

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R, TOWER.h + 40, 96, 1), obsidian);
  tower.position.set(cx, TOWER.h / 2 - 20, cz);
  scene.add(tower);
  world.addCyl(cx, cz, R, -40, TOWER.h);

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
  const glyph = (i: number, g: THREE.Group, m: THREE.Material) => {
    const bar = (w: number, h: number, x: number, y: number, r = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.012), m); o.position.set(x, y, 0.03); o.rotation.z = r; g.add(o); };
    const ringG = (r: number, arc = Math.PI * 2, rot = 0) => { const o = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 4, 20, arc), m); o.position.z = 0.03; o.rotation.z = rot; g.add(o); };
    // marks built from a small vocabulary of strokes, no two alike
    if (i % 3 === 0) ringG(0.06, Math.PI * (1 + (i % 4) * 0.25), i);
    if (i % 2 === 0) bar(0.014, 0.13, ((i % 5) - 2) * 0.012, 0);
    if (i % 4 === 1) bar(0.12, 0.014, 0, ((i % 3) - 1) * 0.03);
    if (i % 5 < 2) bar(0.014, 0.1, 0.035, -0.01, 0.7 + i);
    if (i > 6) bar(0.05, 0.014, -0.03, 0.045, -0.5 * i);
    if (i % 6 === 5) ringG(0.03);
  };
  const mark = new THREE.MeshStandardMaterial({ color: '#4a4c50', roughness: 0.4, metalness: 0.6 });
  for (let i = 0; i < 12; i++) {
    const km = new THREE.MeshStandardMaterial({ color: '#0a0a0b', roughness: 0.2, metalness: 0.5, emissive: '#9fb6c8', emissiveIntensity: 0 });
    keys.push(km);
    const key = new THREE.Group();
    key.position.set(-0.3 + (i % 3) * 0.3, 0.75 - Math.floor(i / 3) * 0.3, 0.26);
    key.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.04), km));
    glyph(i, key, mark);
    pad.add(key);
  }

  // using the pad: move across the glyphs, press four, and it answers the same way every time
  let active = false, sel = 0, entered = 0, cool = 0;
  const flash = new Float32Array(12);
  world.interactables.push({
    pos: new THREE.Vector3(pad.position.x + Math.sin(da) * 0.9, top + 1.2, pad.position.z + Math.cos(da) * 0.9), radius: 1.6,
    enabled: () => !active && cool <= 0,
    use: () => { active = true; entered = 0; sel = 4; cool = 0.3; },
  });
  world.updaters.push((dt) => {
    cool = Math.max(0, cool - dt);
    for (let i = 0; i < 12; i++) {
      flash[i] = Math.max(0, flash[i] - dt * 2.5);
      keys[i].emissiveIntensity = flash[i] * 2.5 + (active && i === sel ? 0.5 : 0);
    }
    if (!active) return;
    const inp = ctx.input;
    ctx.hold(0.2);
    if (inp.hit('KeyA') || inp.hit('ArrowLeft')) sel = Math.floor(sel / 3) * 3 + ((sel % 3) + 2) % 3;
    if (inp.hit('KeyD') || inp.hit('ArrowRight')) sel = Math.floor(sel / 3) * 3 + ((sel % 3) + 1) % 3;
    if (inp.hit('KeyW') || inp.hit('ArrowUp')) sel = (sel + 9) % 12;
    if (inp.hit('KeyS') || inp.hit('ArrowDown')) sel = (sel + 3) % 12;
    if (cool <= 0 && inp.hit('KeyE')) {
      flash[sel] = 1;
      ctx.sfx('key', pad.position);
      if (++entered >= 4) {
        entered = 0;
        ctx.world.after(0.5, () => { ctx.sfx('deny', pad.position, 1.5); for (let i = 0; i < 12; i++) flash[i] = 0.6; });
      }
    }
    if (inp.hit('Escape') || inp.hit('Tab') || inp.hit('KeyQ')) { active = false; cool = 0.4; }
  });

  return { near: (p: THREE.Vector3) => Math.hypot(p.x - cx, p.z - cz) < 120, padActive: () => active };
}
