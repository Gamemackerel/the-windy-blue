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

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R, TOWER.h + 40, 96, 1, true), obsidian);   // its top is laid by the interior, with the hatch cut in it
  tower.position.set(cx, TOWER.h / 2 - 20, cz);
  scene.add(tower);
  // a shell: there is a great deal of room inside. It narrows as it rises, so the upper part is the thinner ring.
  world.addCyl(cx, cz, R, -40, 200, 24.5);
  world.addCyl(cx, cz, 26.2, 200, TOWER.h, 24.5);

  // the stair: one and a quarter turns up to the door
  const RISE = 62, TURNS = 1.25, SEG = 84, W = 3.0;
  // the tower narrows as it rises: the stair keeps tight to it all the way
  const towerR = (y: number) => R - (0.14 * R * (y + 40)) / (TOWER.h + 40);
  const rsAt = (y: number) => towerR(y) + W / 2 - 0.02;
  const rs = rsAt(0);
  const a0 = Math.PI;                          // starts on the south-west, at the quay
  const UNDER = 6;                          // a few more turns of stair go on down into the sea, out of sight
  for (let i = -UNDER; i < SEG; i++) {
    const k0 = i / SEG, k1 = (i + 1) / SEG;
    const am = a0 + (k0 + k1) * 0.5 * TURNS * Math.PI * 2;
    const y0 = 1.2 + k0 * RISE, y1 = 1.2 + k1 * RISE;
    const rr = rsAt((y0 + y1) / 2);
    const len = rr * (TURNS * Math.PI * 2) / SEG + 0.25;
    const x = Math.sin(am) * rr, z = Math.cos(am) * rr;
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
  // no quay: a boat comes alongside the stair where it goes into the sea, and one steps off onto it
  {
    const am = a0 + (2 / SEG) * TURNS * Math.PI * 2, rr = rsAt(1.5), out = rr + W / 2 + 3.2;
    world.moorings.push({ name: 'tower', x: cx + Math.sin(am) * out, z: cz + Math.cos(am) * out, psi: am + Math.PI / 2, dock: new THREE.Vector3(cx + Math.sin(am) * rr, 1.2 + (2.5 / SEG) * RISE, cz + Math.cos(am) * rr) });
  }
  const aEnd = a0 + TURNS * Math.PI * 2, top = 1.2 + RISE;
  const tR = towerR(top);
  // the head of the stair: the stair simply stops climbing and runs on level, the same width and tight to the wall,
  // past the door and the keypad
  {
    // the landing is broad: it starts at the wall and reaches well out beyond the line of the stair, room to stand back and face the door
    const LW = 6.0, rr = towerR(top) - 0.02 + LW / 2, span = 0.42, N = 10;
    for (let i = 0; i < N; i++) {
      const am = aEnd + ((i + 0.5) / N) * span, len = ((rr + LW / 2) * span) / N + 0.1, yaw = am + Math.PI / 2;   // long enough at the outer edge that neighbours overlap
      const tread = new THREE.Mesh(new THREE.BoxGeometry(LW, 0.5, len), matte);
      tread.position.set(cx + Math.sin(am) * rr, top - 0.25, cz + Math.cos(am) * rr);
      tread.rotation.y = yaw; tread.receiveShadow = true; tread.userData.static = true;
      scene.add(tread);
      world.addBox(cx + Math.sin(am) * rr, top - 0.25, cz + Math.cos(am) * rr, LW / 2, 0.25, len / 2, yaw);
    }
    // a lip at the far end, so it does not just stop in the air
    const ae = aEnd + span;
    const end = new THREE.Mesh(new THREE.BoxGeometry(LW, 1.1, 0.25), matte);
    end.position.set(cx + Math.sin(ae) * rr, top + 0.3, cz + Math.cos(ae) * rr); end.rotation.y = ae + Math.PI / 2; scene.add(end);
    world.addBox(end.position.x, top + 0.3, end.position.z, LW / 2, 0.55, 0.13, ae + Math.PI / 2);
  }
  // the door: a seam in the stone and a slab a shade less reflective
  const da = aEnd + 0.12;
  const reveals: THREE.Mesh[] = [];
  const door = new THREE.Mesh(new THREE.BoxGeometry(7, 15, 0.5), new THREE.MeshStandardMaterial({ color: '#030304', roughness: 0.03, metalness: 0.8 }));
  // the door is a great block set into the tower and standing a little proud of it: it starts well inside the wall
  // and comes out past the face, so it reads as a door, and it sinks into the landing when it opens
  door.geometry = new THREE.BoxGeometry(7, 15, 1.4);
  door.position.set(cx + Math.sin(da) * (tR - 0.4), top + 7.5, cz + Math.cos(da) * (tR - 0.4));
  door.rotation.y = da;
  door.castShadow = true;
  scene.add(door);
  // once it has gone, the doorway looks into the store
  const openingM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.36, 1.42) });
  const opening = new THREE.Mesh(new THREE.PlaneGeometry(7, 15), openingM);
  opening.position.set(cx + Math.sin(da) * (tR + 0.04), top + 7.5, cz + Math.cos(da) * (tR + 0.04));   // on the face: the tower itself is solid behind it
  opening.rotation.y = da; opening.visible = false;
  scene.add(opening);
  // the reveal of the doorway: the thickness of the wall either side and over the top
  for (const [w, h, x, y] of [[0.05, 15, -3.5, 7.5], [0.05, 15, 3.5, 7.5], [7, 0.05, 0, 15]] as const) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(w < 1 ? 0.08 : w, h < 1 ? 0.08 : h, 1.1), matte);
    side.position.set(cx + Math.sin(da) * (tR - 0.5) + Math.cos(da) * x, top + y, cz + Math.cos(da) * (tR - 0.5) - Math.sin(da) * x);
    side.rotation.y = da; side.visible = false; scene.add(side); reveals.push(side);
  }
  // the pad: twelve glyphs on a plinth beside the door
  const pad = new THREE.Group();
  pad.position.set(cx + Math.sin(da) * (tR + 0.9) + Math.cos(da) * 5.2, top + 1.35, cz + Math.cos(da) * (tR + 0.9) - Math.sin(da) * 5.2);
  pad.rotation.y = da;
  scene.add(pad);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.9, 0.5), matte);
  plinth.position.y = -0.3;
  pad.add(plinth);
  world.addBox(pad.position.x, top + 1, pad.position.z, 0.6, 1.4, 0.4, da);
  const keys: THREE.MeshStandardMaterial[] = [];
  const keyMeshes: THREE.Mesh[] = [];
  const _rc = new THREE.Raycaster(), _ndc = new THREE.Vector2();
  // keys: the ten numerals read down the columns (1-4, 5-8, 9 0), then the key that wipes what has been entered
  const KEYMAP = [1, 5, 9, 2, 6, 0, 3, 7, -1, 4, 8, -2];      // by row: -1 wipe, -2 blank
  const mark = new THREE.MeshStandardMaterial({ color: '#8a8f96', roughness: 0.35, metalness: 0.7, emissive: '#9fb6c8', emissiveIntensity: 0 });
  // eight small lamps over the keys: one lights for each figure entered
  const tally = Array.from({ length: 8 }, (_, i) => { const m = new THREE.MeshStandardMaterial({ color: '#0a0a0b', emissive: '#9fb6c8', emissiveIntensity: 0 }); const d = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.02), m); d.position.set(-0.385 + i * 0.11, 1.0, 0.26); pad.add(d); return m; });
  for (let i = 0; i < 12; i++) {
    const km = new THREE.MeshStandardMaterial({ color: '#0a0a0b', roughness: 0.2, metalness: 0.5, emissive: '#9fb6c8', emissiveIntensity: 0 });
    keys.push(km);
    const key = new THREE.Group();
    key.position.set(-0.3 + (i % 3) * 0.3, 0.75 - Math.floor(i / 3) * 0.3, 0.26);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.04), km); key.add(face); keyMeshes.push(face);
    { const k = KEYMAP[i]; if (k !== -2) { const gm = glyphMesh(k === -1 ? WIPE : NUMERALS[k], 0.085, mark); gm.position.z = 0.026; key.add(gm); } }
    pad.add(key);
  }

  // using the pad: move across the keys and press eight figures. The right eight open the door.
  let active = false, sel = 0, cool = 0;
  const entered: number[] = [];
  const flash = new Float32Array(12);
  const isOpen = () => !!state.flag('towerOpen');
  const openDoor = (instant: boolean) => {
    opening.visible = true; for (const r of reveals) r.visible = true;
    if (instant) { door.visible = false; return; }
    ctx.sfx('gate', door.position, 1.6);
    world.tween(7, (k) => { door.position.y = top + 7.5 - 15.7 * k * k * (3 - 2 * k); }, () => { door.visible = false; });   // gone down into the stair
  };
  if (isOpen()) openDoor(true);
  world.interactables.push({
    pos: new THREE.Vector3(pad.position.x + Math.sin(da) * 0.9, top + 1.2, pad.position.z + Math.cos(da) * 0.9), radius: 1.6,
    enabled: () => !active && cool <= 0 && !isOpen(),
    use: () => { active = true; entered.length = 0; sel = -1; cool = 0.3; ctx.input.release(true); },
  });
  world.updaters.push((dt) => {
    cool = Math.max(0, cool - dt);
    const night = 1 - ctx.env.daylight;
    mark.emissiveIntensity = night * 0.3;                       // after dark the marks on the keys glow, very slightly
    for (let i = 0; i < 12; i++) {
      flash[i] = Math.max(0, flash[i] - dt * 2.5);
      keys[i].emissiveIntensity = flash[i] * 2.5 + (active && i === sel ? 0.5 : 0) + night * 0.05;   // and so do the keys themselves
    }
    tally.forEach((m, i) => { m.emissiveIntensity = isOpen() ? 1.2 : i < entered.length ? 2.2 : 0; });
    if (!active) return;
    const inp = ctx.input;
    ctx.hold(0.2);
    // whichever key is under the pointer is lit; a click presses it
    _rc.setFromCamera(_ndc.set(inp.pointer.x, inp.pointer.y), ctx.view);
    const hit = _rc.intersectObjects(keyMeshes, false)[0];
    sel = hit ? keyMeshes.indexOf(hit.object as THREE.Mesh) : -1;
    const leave = inp.hit('Escape') || inp.hit('Tab') || inp.hit('KeyQ') || ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].some((k) => inp.hit(k));
    if (cool <= 0 && sel >= 0 && inp.mouseHit(0)) {
      const k = KEYMAP[sel];
      flash[sel] = 1;
      ctx.sfx('key', pad.position);
      if (k === -1) entered.length = 0;
      else if (k >= 0) entered.push(k);
      if (entered.length >= 8) {
        const right = entered.every((d, i) => d === code[i]);
        entered.length = 0;
        if (right) { active = false; ctx.input.release(false); state.set('towerOpen'); world.after(0.6, () => openDoor(false)); }
        else world.after(0.5, () => { ctx.sfx('deny', pad.position, 1.5); for (let i = 0; i < 12; i++) flash[i] = 0.6; });
      }
    }
    if (leave) { active = false; cool = 0.4; ctx.input.release(false); }
    if (!active) ctx.input.release(false);
  });

  // through the door
  const outside = new THREE.Vector3(cx + Math.sin(da) * (tR + 2.5), top, cz + Math.cos(da) * (tR + 2.5));
  const inner = buildTowerInterior(ctx, { cx, cz, floor: top, top: TOWER.h, doorAngle: da, hooks, exit: outside, topR: R * 0.86, roofMat: obsidian });
  openingM.map = inner.portal; openingM.needsUpdate = true;
  world.interactables.push({
    pos: new THREE.Vector3(cx + Math.sin(da) * (tR + 0.8), top + 1.2, cz + Math.cos(da) * (tR + 0.8)), radius: 2.6,
    enabled: () => isOpen() && (!door.visible || door.position.y < top - 6),
    use: () => ctx.fade(() => { ctx.playerPos().copy(inner.enter); ctx.sfx('door', inner.enter); }, 0.9),
  });

  return { near: (p: THREE.Vector3) => Math.hypot(p.x - cx, p.z - cz) < 120, padActive: () => active, code, ...inner };
}
