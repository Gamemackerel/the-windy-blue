// The floating places: greenhouse rig, jungle rig, houseboat, the Fisher's
// raft and the Smoker's barge, plus the people who live on them.
import * as THREE from 'three';
import { Ctx } from './ctx';
import { growPlants, Clump } from './plants';
import { Builder } from './build';
import { MAT, patch } from './materials';
import { rng } from './noise';
import { calmZones } from './waves';
import { addPickup } from './items';
import { Npc } from './npc';
import { Figure, J } from './figure';
import { buildHull } from './boat';
import { ISLAND } from './island';

/** the floating home tied up to the jungle rig */
export const HOME = { x: 150 + 14.3, z: -750 + 2 };

export const PLACES = {
  greenhouse: { x: -250, z: -150 },
  jungle: { x: 150, z: -750 },
  raft: { x: 228, z: -690 },
  houseboat: { x: -650, z: 350 },
  barge: { x: 350, z: 250 },
};


/** a ladder with visible rails and rungs, registered for climbing */
function ladder(b: Builder, x: number, z: number, y0: number, y1: number, face: number, mat: THREE.Material) {
  const sx = Math.cos(face) * 0.24, sz = -Math.sin(face) * 0.24;
  b.bar(x + sx, y0, z + sz, x + sx, y1 + 1.0, z + sz, 0.025, mat, 6);
  b.bar(x - sx, y0, z - sz, x - sx, y1 + 1.0, z - sz, 0.025, mat, 6);
  for (let y = y0 + 0.3; y < y1 + 0.05; y += 0.3) b.bar(x + sx, y, z + sz, x - sx, y, z - sz, 0.016, mat, 5);
  const fx = Math.sin(face), fz = Math.cos(face);
  b.world.ladders.push({
    x: b.ox + x, z: b.oz + z, y0: b.oy + y0, y1: b.oy + y1, face,
    topExit: new THREE.Vector3(b.ox + x + fx * 0.9, b.oy + y1, b.oz + z + fz * 0.9),
    bottomExit: new THREE.Vector3(b.ox + x - fx * 0.7, b.oy + y0, b.oz + z - fz * 0.7),
  });
}

/** steel deck on legs with a floating landing, a ladder up, and a berth */
function platform(ctx: Ctx, name: string, cx: number, cz: number, w: number, d: number, deckY: number, deckMat: THREE.Material) {
  const b = new Builder(ctx.scene, ctx.world, cx, 0, cz);
  calmZones.push({ x: cx, z: cz, r0: 14, r1: 70 });
  b.box(0, deckY - 0.2, 0, w, 0.4, d, deckMat);
  const lx = w / 2 - 1.2, lz = d / 2 - 1.2;
  for (const [x, z] of [[lx, lz], [-lx, lz], [lx, -lz], [-lx, -lz]] as const) {
    b.cyl(x, z, 0.45, -14, deckY - 0.4, MAT.rust, true, 0.45, 12);
  }
  // cross bracing under the deck
  b.bar(lx, deckY - 0.6, lz, -lx, 0.3, lz, 0.09, MAT.rust); b.bar(-lx, deckY - 0.6, lz, lx, 0.3, lz, 0.09, MAT.rust);
  b.bar(lx, deckY - 0.6, -lz, -lx, 0.3, -lz, 0.09, MAT.rust); b.bar(-lx, deckY - 0.6, -lz, lx, 0.3, -lz, 0.09, MAT.rust);
  b.bar(lx, deckY - 0.6, lz, lx, 0.3, -lz, 0.09, MAT.rust); b.bar(-lx, deckY - 0.6, -lz, -lx, 0.3, lz, 0.09, MAT.rust);
  // landing on the south side, with the ladder up to a gap in the rail
  const ax = -w / 2 + 3;
  b.box(ax, 0.15, -d / 2 - 1.5, 3.4, 0.6, 2.6, MAT.rust);
  for (const dx of [-1.5, 1.5]) b.cyl(ax + dx, -d / 2 - 2.6, 0.14, 0.4, 1.1, MAT.dark, false, 0.14, 8);
  ladder(b, ax, -d / 2 - 0.12, 0.45, deckY, 0, MAT.steel);
  const hw = w / 2 - 0.1, hd = d / 2 - 0.1;
  b.rail(-hw, -hd, ax - 0.8, -hd, deckY, MAT.rust); b.rail(ax + 0.8, -hd, hw, -hd, deckY, MAT.rust);
  b.rail(hw, -hd, hw, hd, deckY, MAT.rust); b.rail(hw, hd, -hw, hd, deckY, MAT.rust); b.rail(-hw, hd, -hw, -hd, deckY, MAT.rust);
  ctx.world.moorings.push({ name, x: cx + ax, z: cz - d / 2 - 4.4, psi: Math.PI / 2, dock: new THREE.Vector3(cx + ax, 0.45, cz - d / 2 - 1.7) });
  return b;
}

/** grow a set of plants (see plants.ts) */
function leaves(ctx: Ctx, pts: Clump[], seed: number, size = 0.5) { growPlants(ctx.scene, pts, seed, size); }

export function buildRigs(ctx: Ctx) {
  const { scene, world, state } = ctx;
  const npcs: Npc[] = [];
  const npc = (spec: ConstructorParameters<typeof Npc>[1]) => {
    const n = new Npc(ctx, spec, ctx.playerHand, ctx.playerPos);
    n.onUse = () => n.offer(ctx.held(), ctx.takeHeld);
    npcs.push(n);
    return n;
  };
  const night = () => 1 - ctx.env.daylight;

  // ============================================================ greenhouse
  {
    const { x: cx, z: cz } = PLACES.greenhouse;
    const DY = 3.4;
    const b = platform(ctx, 'greenhouse', cx, cz, 14, 10, DY, MAT.steel);
    const X0 = -5, X1 = 5, Z0 = -2.6, Z1 = 4, WH = 2.4, RIDGE = 3.5;
    const fog = new THREE.MeshPhysicalMaterial({ color: '#cfd8d4', roughness: 0.55, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, emissive: '#ffe2b0', emissiveIntensity: 0 });
    const frame = MAT.whiteSteel;
    const pane = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const m = b.mesh(new THREE.BoxGeometry(sx, sy, sz), fog, x, y, z, false);
      m.renderOrder = 5;
      return m;
    };
    // walls: glass with a door gap in the south wall
    pane(0, DY + WH / 2, Z1, X1 - X0, WH, 0.03);
    pane(X0, DY + WH / 2, (Z0 + Z1) / 2, 0.03, WH, Z1 - Z0);
    pane(X1, DY + WH / 2, (Z0 + Z1) / 2, 0.03, WH, Z1 - Z0);
    pane(-2.9, DY + WH / 2, Z0, 4.2, WH, 0.03); pane(2.9, DY + WH / 2, Z0, 4.2, WH, 0.03);
    world.addBox(cx, DY + WH / 2, cz + Z1, 5, WH / 2, 0.08);
    world.addBox(cx + X0, DY + WH / 2, cz + (Z0 + Z1) / 2, 0.08, WH / 2, (Z1 - Z0) / 2);
    world.addBox(cx + X1, DY + WH / 2, cz + (Z0 + Z1) / 2, 0.08, WH / 2, (Z1 - Z0) / 2);
    world.addBox(cx - 2.9, DY + WH / 2, cz + Z0, 2.1, WH / 2, 0.08); world.addBox(cx + 2.9, DY + WH / 2, cz + Z0, 2.1, WH / 2, 0.08);
    // pitched roof
    const zm = (Z0 + Z1) / 2, half = (Z1 - Z0) / 2, slope = Math.atan2(RIDGE - WH, half), rl = Math.hypot(half, RIDGE - WH);
    for (const s of [-1, 1]) {
      const m = pane(0, DY + (WH + RIDGE) / 2, zm + s * half / 2, X1 - X0, 0.03, rl);
      m.rotation.x = s * slope;
    }
    // frame
    for (let x = X0; x <= X1 + 0.01; x += 1.25) {
      b.bar(x, DY, Z0, x, DY + WH, Z0, 0.03, frame); b.bar(x, DY, Z1, x, DY + WH, Z1, 0.03, frame);
      b.bar(x, DY + WH, Z0, x, DY + RIDGE, zm, 0.025, frame); b.bar(x, DY + WH, Z1, x, DY + RIDGE, zm, 0.025, frame);
    }
    for (let z = Z0; z <= Z1 + 0.01; z += 1.32) { b.bar(X0, DY, z, X0, DY + WH, z, 0.03, frame); b.bar(X1, DY, z, X1, DY + WH, z, 0.03, frame); }
    for (const z of [Z0, Z1]) b.bar(X0, DY + WH, z, X1, DY + WH, z, 0.035, frame);
    b.bar(X0, DY + RIDGE, zm, X1, DY + RIDGE, zm, 0.035, frame);
    for (const x of [X0, X1]) { b.bar(x, DY + WH, Z0, x, DY + WH, Z1, 0.035, frame); }
    b.bar(-0.8, DY, Z0, -0.8, DY + 2.1, Z0, 0.04, frame); b.bar(0.8, DY, Z0, 0.8, DY + 2.1, Z0, 0.04, frame); b.bar(-0.8, DY + 2.1, Z0, 0.8, DY + 2.1, Z0, 0.04, frame);

    // planter beds
    const soil = new THREE.MeshStandardMaterial({ color: '#1c1410', roughness: 1 });
    const beds: [number, number, number, number][] = [[-3.9, 0.7, 1.6, 5.6], [3.9, 0.7, 1.6, 5.6], [0, 3.1, 5.4, 1.3]];
    for (const [x, z, sx, sz] of beds) {
      b.box(x, DY + 0.35, z, sx, 0.7, sz, MAT.paleWood);
      b.box(x, DY + 0.71, z, sx - 0.15, 0.04, sz - 0.15, soil, 0, false);
    }
    const r = rng(11);
    const clumps: Clump[] = [];
    // tomato vines on stakes (west bed): the fruit
    const fruits: THREE.Mesh[] = [];
    const fruitMat = new THREE.MeshStandardMaterial({ color: '#b3261a', roughness: 0.35 });
    for (let i = 0; i < 6; i++) {
      const z = -1.6 + i * 0.9, x = -3.9 + (r() - 0.5) * 0.5;
      b.bar(x, DY + 0.7, z, x, DY + 2.2, z, 0.012, MAT.wood, 5);
      clumps.push({ x: cx + x, y: DY + 1.45, z: cz + z, r: 0.5, n: 70, kind: 'tomato', g: DY + 0.72 });
      for (let k = 0; k < 4; k++) {
        const f = b.mesh(new THREE.SphereGeometry(0.042 + r() * 0.016, 12, 10), fruitMat, x + 0.22 + r() * 0.2, DY + 1.0 + r() * 0.8, z + (r() - 0.5) * 0.5);   // hanging on the aisle side, clear of the leaves
        f.userData.static = false;
        fruits.push(f);
      }
    }
    // squash and greens (east bed), a small tree (north bed)
    const squash = new THREE.MeshStandardMaterial({ color: '#c98a1e', roughness: 0.5 });
    for (let i = 0; i < 7; i++) {
      const z = -1.8 + i * 0.8, x = 3.9 + (r() - 0.5) * 0.7;
      clumps.push({ x: cx + x, y: DY + 0.95, z: cz + z, r: 0.42, n: 50, kind: 'squash', g: DY + 0.72 });
      if (i % 2 === 0) { const s = b.mesh(new THREE.SphereGeometry(0.13, 10, 8), squash, x + 0.25, DY + 0.82, z); s.scale.set(1, 0.7, 1.3); }
    }
    b.bar(0, DY + 0.7, 3.1, 0.15, DY + 2.0, 3.2, 0.05, MAT.wood, 6);
    clumps.push({ x: cx + 0.15, y: DY + 2.25, z: cz + 3.2, r: 0.85, n: 330 });
    for (let i = 0; i < 12; i++) if (Math.abs(-2.3 + i * 0.42 - 0.1) > 0.45) clumps.push({ x: cx - 2.3 + i * 0.42, y: DY + 0.9, z: cz + 2.85 + (i % 2) * 0.45, r: 0.3, n: 30, kind: 'greens', g: DY + 0.73 });
    leaves(ctx, clumps, 5, 0.28);

    // harvest: any vine along the west bed gives up a tomato, which comes off the plant into the hand.
    // One a day; the plant has more by the next morning.
    const canPick = () => !state.has('fruit') && state.flag('fruitDay') !== state.data.day + 1;
    let pickedDay = -1;
    for (let i = 0; i < 6; i++) {
      const z = -1.6 + i * 0.9;
      world.interactables.push({
        pos: new THREE.Vector3(cx - 3.45, DY + 1.35, cz + z), radius: 1.5,
        enabled: canPick,
        use: () => {
          const pp = ctx.playerPos();
          let best: THREE.Mesh | null = null, bd = 1e9;
          for (const f of fruits) { if (!f.visible) continue; const d = f.position.distanceTo(pp); if (d < bd) { bd = d; best = f; } }
          if (best) best.visible = false;
          pickedDay = state.data.day;
          state.give('fruit'); ctx.setHeld('fruit'); state.set('fruitDay', state.data.day + 1);
          ctx.sfx('take', new THREE.Vector3(cx, DY, cz));
        },
      });
    }
    world.updaters.push(() => { if (pickedDay >= 0 && state.data.day > pickedDay) { pickedDay = -1; for (const f of fruits) f.visible = true; } });
    // grow lamps: the greenhouse glows at night and can be seen from far away
    const lampMat = new THREE.MeshStandardMaterial({ color: '#f4e6d0', emissive: '#ffd9a0', emissiveIntensity: 0.6 });
    for (const x of [-3.2, 0, 3.2]) b.box(x, DY + RIDGE - 0.35, zm, 1.4, 0.06, 0.12, lampMat, 0, false);
    const glow = new THREE.PointLight('#ffd9a0', 0, 40, 1.5);
    glow.position.set(cx, DY + 2.6, cz + zm);
    scene.add(glow);
    // tanks and pipes outside
    b.cyl(5.6, -3.2, 0.7, DY, DY + 1.7, MAT.whiteSteel, true, 0.7, 16);
    b.bar(5.6, DY + 1.5, -3.2, 5.0, DY + 1.5, -1.0, 0.05, MAT.rust);
    b.box(-5.9, DY + 0.4, 3.6, 1.0, 0.8, 1.6, MAT.wood);
    world.updaters.push(() => {
      const picked = state.flag('fruitDay') === state.data.day + 1;
      for (let i = 0; i < fruits.length; i++) fruits[i].visible = !picked || i % 3 !== 0;
      const n = night();
      lampMat.emissiveIntensity = 0.6 + n * 5;
      fog.emissiveIntensity = n * 0.55;
      glow.intensity = n * 140 + 6;
    });
  }

  // ================================================================ jungle
  {
    const { x: cx, z: cz } = PLACES.jungle;
    const DY = 4.2;
    // the deck has long since vanished under leaf litter and dark, damp earth; steel shows only on the sides
    const mossy = patch(new THREE.MeshStandardMaterial({ color: '#3c4044', roughness: 0.7, metalness: 0.1 }), /* glsl */ `
      float n = tri(wp, wn, 0.9); float db;
      vec3 steelC = col * (0.6 + 0.6 * n);
      vec3 earth = dirt(wp.xz * 1.4, vd, vec3(0.2, 0.17, 0.09), vec3(0.085, 0.075, 0.04), db);
      float moss = smoothstep(0.45, 0.72, fbm(wp.xz * 0.55 + 7.0));
      earth = mix(earth, mix(vec3(0.09, 0.14, 0.045), vec3(0.16, 0.2, 0.07), fbm3(wp.xz * 6.0)), moss * 0.65);            // moss and rot
      float litter = step(0.72, hash21(floor(wp.xz * 9.0))) * smoothstep(20.0, 5.0, vd);
      earth = mix(earth, vec3(0.22, 0.14, 0.05) * (0.6 + 0.8 * hash21(floor(wp.xz * 9.0) + 3.0)), litter * 0.6);         // fallen leaves
      float top = smoothstep(0.5, 0.85, wn.y);
      float creep = smoothstep(0.42, 0.62, tri(wp, wn, 0.33)) * (1.0 - top);
      col = mix(mix(steelC, vec3(0.08, 0.13, 0.04), creep * 0.8), earth, top);
      rough = mix(rough, 0.97, max(top, creep));
      bump = db * top;`, 'mossy');
    const b = platform(ctx, 'jungle', cx, cz, 20, 16, DY, mossy);
    const r = rng(33);
    const bark = patch(new THREE.MeshStandardMaterial({ color: '#3a2e22', roughness: 0.95 }), /* glsl */ `
      col *= 0.55 + 0.9 * tri(wp, wn, 2.4); col = mix(col, vec3(0.08, 0.2, 0.05), smoothstep(0.5, 0.75, tri(wp, wn, 0.8)) * 0.6);`, 'bark');
    const clumps: Clump[] = [];
    // an upper deck in the canopy, reached by a second ladder
    const UY = 9.4, UX = 4.5, UZ = 2.5;
    b.box(UX, UY - 0.15, UZ, 7, 0.3, 5, mossy);
    for (const [x, z] of [[UX - 3.1, UZ - 2.1], [UX + 3.1, UZ - 2.1], [UX - 3.1, UZ + 2.1], [UX + 3.1, UZ + 2.1]] as const) b.cyl(x, z, 0.16, DY, UY - 0.3, MAT.rust, true, 0.16, 8);
    ladder(b, UX - 1.5, UZ - 2.62, DY, UY, 0, MAT.rust);
    b.rail(UX - 0.6, UZ - 2.4, UX + 3.4, UZ - 2.4, UY, MAT.rust); b.rail(UX + 3.4, UZ - 2.4, UX + 3.4, UZ + 2.4, UY, MAT.rust);
    b.rail(UX + 3.4, UZ + 2.4, UX - 3.4, UZ + 2.4, UY, MAT.rust); b.rail(UX - 3.4, UZ + 2.4, UX - 3.4, UZ - 2.4, UY, MAT.rust);
    b.rail(UX - 3.4, UZ - 2.4, UX - 2.4, UZ - 2.4, UY, MAT.rust);
    // trees
    const trunks: [number, number, number, number][] = [[-6, 3, 11, 0.42], [-2, -4, 13, 0.5], [7, -5, 10, 0.38], [8, 6, 14, 0.5], [-7.5, -5.5, 8, 0.3], [1.5, 5.5, 12.5, 0.45], [-3, 6.5, 9, 0.3], [6.2, 0.5, 15, 0.4]];
    for (const [x, z, h, rad] of trunks) {
      const pts: THREE.Vector3[] = [];
      const lean = new THREE.Vector2((r() - 0.5) * 3, (r() - 0.5) * 3);
      for (let i = 0; i <= 5; i++) { const k = i / 5; pts.push(new THREE.Vector3(x + lean.x * k * k + Math.sin(k * 5 + x) * 0.25, DY + h * k, z + lean.y * k * k)); }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, rad, 8), bark);
      tube.position.set(cx, 0, cz);
      tube.castShadow = tube.receiveShadow = true;
      scene.add(tube);
      world.addCyl(cx + x, cz + z, rad + 0.1, DY, DY + 3);
      const top = pts[5];
      clumps.push({ x: cx + top.x, y: top.y, z: cz + top.z, r: 2.6 + r() * 1.6, n: 520 });
      clumps.push({ x: cx + top.x + (r() - 0.5) * 3, y: top.y - 1.8, z: cz + top.z + (r() - 0.5) * 3, r: 2 + r(), n: 300 });
      // roots spreading over the deck
      for (let k = 0; k < 4; k++) { const a = r() * 6.28, l = 1 + r() * 1.8; b.bar(x, DY + 0.5, z, x + Math.cos(a) * l, DY + 0.02, z + Math.sin(a) * l, rad * 0.3, bark); }
    }
    // undergrowth and ferns on the deck
    for (let i = 0; i < 46; i++) {
      const x = (r() - 0.5) * 18, z = (r() - 0.5) * 14;
      if (Math.abs(x + 7) < 1.6 && z < -5.5) continue; // keep the ladder head clear
      const pick = r();
      clumps.push({ x: cx + x, y: DY + 0.3 + r() * 0.5, z: cz + z, r: 0.5 + r() * 0.8, n: 55, g: DY, kind: pick < 0.42 ? 'fern' : pick < 0.68 ? 'broad' : 'bush' });
    }
    // growth spilling over the edges
    const vine = new THREE.MeshStandardMaterial({ color: '#2f6a2a', roughness: 0.8 });
    for (let i = 0; i < 70; i++) {
      const side = (r() * 4) | 0, k = (r() - 0.5) * 2;
      const x = side < 2 ? k * 10 : side === 2 ? 10.05 : -10.05, z = side < 2 ? (side === 0 ? 8.05 : -8.05) : k * 8;
      if (side === 1 && Math.abs(x + 7) < 2.2) continue;
      const len = 1.2 + r() * r() * 4.4;
      const sway = (r() - 0.5) * 0.5;
      b.bar(x, DY, z, x + sway, DY - len, z + sway, 0.02 + r() * 0.02, vine, 4);
      const n = Math.ceil(len / 0.8);
      for (let j = 0; j < n; j++) clumps.push({ x: cx + x + sway * (j / n), y: DY - (j + 0.4) * 0.8, z: cz + z + sway * (j / n), r: 0.3, n: 14, kind: 'vine' });
      clumps.push({ x: cx + x, y: DY + 0.1, z: cz + z, r: 0.5, n: 30, g: DY, kind: r() < 0.5 ? 'fern' : 'bush' });
    }
    // the orchid, alone on the high deck
    b.bar(UX + 2.2, UY, UZ + 1.4, UX + 2.4, UY + 1.3, UZ + 1.5, 0.12, bark);
    addPickup(ctx, 'orchid', 'orchid', new THREE.Vector3(cx + UX + 2.25, UY + 1.25, cz + UZ + 1.25), { scale: 1.8, rot: 3.6, radius: 2 });
    // a floating home, tied up alongside and half claimed by the growth
    {
      const hx = 14.3, hz = 2, FY = 0.55;
      b.box(hx, FY - 0.45, hz, 8, 0.9, 7, MAT.paleWood);
      for (const [x, z] of [[-3.4, -3], [3.4, -3], [-3.4, 3], [3.4, 3], [0, -3], [0, 3]] as const) {
        const fl = b.mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.5, 12), MAT.rust, hx + x, FY - 0.75, hz + z);
        fl.rotation.z = Math.PI / 2;
      }
      const CW = 5.4, CD = 4.2, CH = 2.3, T = 0.12, wy = FY + CH / 2, cxh = hx + 0.9;
      b.box(cxh, wy, hz - CD / 2, CW, CH, T, MAT.wood); b.box(cxh, wy, hz + CD / 2, CW, CH, T, MAT.wood);
      b.box(cxh + CW / 2, wy, hz, T, CH, CD, MAT.wood);
      b.box(cxh - CW / 2, wy, hz - 1.3, T, CH, 1.6, MAT.wood); b.box(cxh - CW / 2, wy, hz + 1.3, T, CH, 1.6, MAT.wood);
      b.box(cxh - CW / 2, FY + 2.05 + (CH - 2.05) / 2, hz, T, CH - 2.05, 1.0, MAT.wood, 0, false);
      b.box(cxh, FY + CH + 0.07, hz, CW + 0.7, 0.12, CD + 0.7, MAT.corrugated);
      b.box(cxh, FY + 0.03, hz, CW - 0.2, 0.03, CD - 0.2, MAT.wood, 0, false);
      b.trim(cxh, FY, hz, CW, CH, CD, MAT.dark, 0.13);
      for (const z of [hz - 1.3, hz + 1.3]) b.box(cxh + CW / 2 + 0.07, FY + 1.4, z, 0.03, 0.6, 0.8, MAT.black, 0, false);  // shuttered windows
      b.cyl(cxh + 1.8, hz - 1.2, 0.07, FY + CH, FY + CH + 0.8, MAT.dark, false, 0.07, 8);                                   // stove pipe
      // bunk, table and a stove inside
      b.box(cxh + 1.9, FY + 0.28, hz + 1.2, 1.4, 0.5, 1.5, MAT.paleWood);
      b.box(cxh + 0.2, FY + 0.72, hz - 1.45, 1.5, 0.06, 0.8, MAT.wood, 0, false);
      for (const dx of [-0.6, 0.6]) b.box(cxh + 0.2 + dx, FY + 0.36, hz - 1.45, 0.07, 0.7, 0.7, MAT.wood, 0, false);
      world.addBox(cx + cxh + 0.2, FY + 0.4, cz + hz - 1.45, 0.75, 0.4, 0.4);
      b.cyl(cxh + 1.8, hz - 1.2, 0.3, FY, FY + 0.8, MAT.dark, true, 0.3, 12);
      const lampM = new THREE.MeshStandardMaterial({ color: '#2a2622', emissive: '#ffb86a', emissiveIntensity: 0 });
      b.mesh(new THREE.SphereGeometry(0.09, 10, 8), lampM, cxh - 0.6, FY + 1.95, hz, false);
      const lampL = new THREE.PointLight('#ffb070', 0, 12, 1.6);
      lampL.position.set(cx + cxh - 0.6, FY + 1.9, cz + hz);
      scene.add(lampL);
      world.updaters.push(() => { lampM.emissiveIntensity = 0.5 + night() * 4; lampL.intensity = 4 + night() * 22; });
      // mooring lines and a ladder up to the rig
      b.bar(hx - 3.9, FY + 0.1, hz - 3, 9.6, DY - 0.5, -2, 0.02, MAT.rope, 4); b.bar(hx - 3.9, FY + 0.1, hz + 3, 9.6, DY - 0.5, 6, 0.02, MAT.rope, 4);
      ladder(b, 10.15, hz, FY, DY, -Math.PI / 2, MAT.rust);
      world.moorings.push({ name: 'home', x: cx + hx, z: cz + hz - 6.2, psi: Math.PI / 2, dock: new THREE.Vector3(cx + hx - 2.6, FY, cz + hz - 2.7) });
      // the jungle has started on the roof
      for (let i = 0; i < 16; i++) clumps.push({ x: cx + cxh - 2.6 + r() * 3, y: FY + CH + 0.55 + r() * 0.3, z: cz + hz - 2 + r() * 4, r: 0.35 + r() * 0.25, n: 40 });
      for (let i = 0; i < 10; i++) { const z = hz - 2.1 + r() * 4.2, len = 0.6 + r() * 1.5; b.bar(cxh - CW / 2 - 0.1, FY + CH, z, cxh - CW / 2 - 0.15, FY + CH - len, z, 0.02, vine, 4); clumps.push({ x: cx + cxh - CW / 2 - 0.15, y: FY + CH - len * 0.6, z: cz + z, r: 0.3, n: 16 }); }
    }
    leaves(ctx, clumps, 9, 0.5);
    // grasses pushing up through the litter: thin blades in tufts, greener in the open, yellowing in the shade
    {
      const tp: number[] = [], tn: number[] = [];
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * 6.283 + r() * 0.7, lean = 0.1 + r() * 0.3, h = 0.16 + r() * 0.3, w = 0.016;
        const bx = Math.cos(a) * 0.05, bz = Math.sin(a) * 0.05, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
        tp.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean);
        for (let v = 0; v < 3; v++) tn.push(0, 1, 0);
      }
      const tuft = new THREE.BufferGeometry();
      tuft.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
      tuft.setAttribute('normal', new THREE.Float32BufferAttribute(tn, 3));
      const COUNT = 1900;
      const grass = new THREE.InstancedMesh(tuft, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide }), COUNT);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3(), c = new THREE.Color();
      let n = 0;
      const place = (x: number, y: number, z: number, s: number) => {
        pv.set(cx + x, y, cz + z);
        q.setFromEuler(new THREE.Euler(0, r() * 6.283, 0));
        sc.set(s, s * (0.7 + r() * 0.9), s);
        grass.setMatrixAt(n, m4.compose(pv, q, sc));
        grass.setColorAt(n, c.setHSL(0.2 + r() * 0.09, 0.3 + r() * 0.3, 0.14 + r() * 0.16));
        n++;
      };
      while (n < COUNT - 320) {
        const x = (r() - 0.5) * 19.4, z = (r() - 0.5) * 15.4;
        if (Math.abs(x + 7) < 1.1 && z < -6.2) continue;              // the ladder head
        place(x, DY, z, 0.7 + r() * 1.3);
      }
      while (n < COUNT) place(UX + (r() - 0.5) * 6.6, UY, UZ + (r() - 0.5) * 4.6, 0.6 + r());
      grass.count = n;
      grass.receiveShadow = true;
      scene.add(grass);
    }
  }

  // ========================================================== fisher's raft
  {
    const { x: cx, z: cz } = PLACES.raft;
    calmZones.push({ x: cx, z: cz, r0: 10, r1: 55 });
    const b = new Builder(scene, world, cx, 0, cz);
    world.addBox(cx, 0.1, cz, 2.3, 0.25, 2.3);
    for (let i = 0; i < 9; i++) {
      const log = b.mesh(new THREE.CylinderGeometry(0.26, 0.26, 4.6, 8), MAT.wood, -2.1 + i * 0.52, 0.1, 0);
      log.rotation.x = Math.PI / 2;
    }
    for (const z of [-1.6, 1.6]) { const l = b.mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.7, 6), MAT.paleWood, 0, 0.38, z); l.rotation.z = Math.PI / 2; }
    for (const [x, z] of [[-2.5, -2.4], [2.5, -2.4], [-2.5, 2.4], [2.5, 2.4]] as const) b.cyl(x, z, 0.34, -0.5, 0.2, MAT.rust, false, 0.34, 10);
    b.cyl(-1.6, 1.5, 0.06, 0.35, 3.0, MAT.wood, false, 0.05, 6);
    const lampMat = new THREE.MeshStandardMaterial({ color: '#2a2622', emissive: '#ffb86a', emissiveIntensity: 0 });
    b.mesh(new THREE.SphereGeometry(0.13, 10, 8), lampMat, -1.6, 3.0, 1.5, false);
    const lamp = new THREE.PointLight('#ffb070', 0, 22, 1.6);
    lamp.position.set(cx - 1.6, 3.0, cz + 1.5);
    scene.add(lamp);
    world.updaters.push(() => { lampMat.emissiveIntensity = night() * 4; lamp.intensity = night() * 40; });
    b.crate(1.5, 0.36, 0.2, 0.5, MAT.wood, MAT.paleWood);     // the crate they sit on
    b.box(-0.2, 0.52, -1.5, 0.9, 0.35, 0.6, MAT.paleWood);
    b.drum(0.4, 1.6, 0.36, MAT.rust, MAT.dark, 0.24, 0.5);
    // their skiff, tied alongside
    const skiff = new THREE.Mesh(buildHull(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }));
    skiff.scale.setScalar(0.72);
    skiff.position.set(cx + 0.6, 0.02, cz + 3.6);
    skiff.rotation.set(0.02, Math.PI / 2 + 0.1, 0.04);
    skiff.castShadow = true;
    scene.add(skiff);
    world.addBox(cx + 0.6, 0, cz + 3.6, 2, 0.5, 0.75);
    b.bar(-1, 0.4, 2.3, -0.6, 0.35, 3.3, 0.012, MAT.rope, 4);
    // fishing rod and line
    b.bar(1.9, 1.05, 0.3, 4.6, 2.4, 0.5, 0.012, MAT.dark, 4);
    b.bar(4.6, 2.4, 0.5, 4.8, -0.2, 0.55, 0.003, MAT.bone, 3);
    world.moorings.push({ name: 'raft', x: cx - 4.4, z: cz, psi: 0, dock: new THREE.Vector3(cx - 1.4, 0.36, cz - 0.2) });
    npc({
      key: 'fisher', pose: 'sit', seat: 0.5, yaw: Math.PI / 2,
      look: { coat: '#3d4a52', trousers: '#2a2622', skin: '#8f6f58', hood: false, hat: true, beard: '#8a8780' },
      pos: new THREE.Vector3(cx + 1.5, 0.36, cz + 0.2),
      wants: 'fruit', gives: 'key', giveSpot: new THREE.Vector3(cx + 0.3, 0.75, cz - 1.5),
    });
  }

  // ============================================================= houseboat
  {
    const { x: cx, z: cz } = PLACES.houseboat;
    calmZones.push({ x: cx, z: cz, r0: 12, r1: 60 });
    const b = new Builder(scene, world, cx, 0, cz);
    const DY = 0.7;
    const shape = new THREE.Shape();
    shape.moveTo(-2.2, -5); shape.lineTo(2.2, -5); shape.lineTo(2.2, 2.6); shape.lineTo(0, 6); shape.lineTo(-2.2, 2.6); shape.closePath();
    const hg = new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: false });
    hg.rotateX(-Math.PI / 2);                 // extrusion now runs up; shape y becomes -z
    hg.scale(1, 1, -1);                       // so the bow points toward +z again
    const hull = new THREE.Mesh(hg, patch(new THREE.MeshStandardMaterial({ color: '#201e1c', roughness: 0.8, side: THREE.DoubleSide }), /* glsl */ `
      col *= 0.6 + 0.8 * tri(wp, wn, 0.9); col = mix(col, vec3(0.3, 0.12, 0.06), smoothstep(0.5, 0.2, wp.y) * 0.5 * streaks(wp, wn, 1.5));`, 'tarhull'));
    hull.position.set(cx, DY - 1.5, cz);
    hull.castShadow = hull.receiveShadow = true;
    scene.add(hull);
    world.addBox(cx, DY - 0.75, cz - 1.2, 2.2, 0.75, 3.8);
    world.addBox(cx, DY - 0.75, cz + 3.4, 1.4, 0.75, 0.9);
    world.addBox(cx, DY - 0.75, cz + 4.8, 0.6, 0.75, 0.6);
    b.box(0, DY + 0.02, -1.2, 4.3, 0.04, 7.6, MAT.paleWood, 0, false);
    // cabin
    const CX0 = -1.8, CX1 = 1.8, CZ0 = -4.4, CZ1 = 1.0, CH = 2.25;
    const wall = MAT.wood, inner = new THREE.MeshStandardMaterial({ color: '#2b241d', roughness: 0.95 });
    b.box(0, DY + CH / 2, CZ0, CX1 - CX0, CH, 0.12, wall);
    b.box(CX0, DY + CH / 2, (CZ0 + CZ1) / 2, 0.12, CH, CZ1 - CZ0, wall);
    b.box(CX1, DY + CH / 2, (CZ0 + CZ1) / 2, 0.12, CH, CZ1 - CZ0, wall);
    b.box(-1.15, DY + CH / 2, CZ1, 1.3, CH, 0.12, wall); b.box(1.15, DY + CH / 2, CZ1, 1.3, CH, 0.12, wall);
    b.box(0, DY + CH - 0.15, CZ1, 1.0, 0.3, 0.12, wall, 0, false);
    b.box(0, DY + CH + 0.06, (CZ0 + CZ1) / 2, CX1 - CX0 + 0.5, 0.12, CZ1 - CZ0 + 0.5, MAT.corrugated);
    b.box(0, DY + 0.05, (CZ0 + CZ1) / 2, CX1 - CX0 - 0.1, 0.03, CZ1 - CZ0 - 0.1, inner, 0, false);
    b.cyl(1.2, -3.6, 0.08, DY + CH, DY + CH + 0.9, MAT.dark, false, 0.08, 8);
    const door = b.box(0.45, DY + 1.0, CZ1 + 0.42, 0.06, 2.0, 0.95, MAT.paleWood, 0.25, false); // hanging open
    void door;
    for (const z of [-3.2, -0.6]) for (const x of [CX0 - 0.07, CX1 + 0.07]) b.box(x, DY + 1.45, z, 0.03, 0.5, 0.8, MAT.black, 0, false);
    // a storm lantern turned right down in the far corner: just enough to make out the room at night
    {
      const lx = CX1 - 0.32, lz = CZ0 + 0.34;
      b.cyl(lx, lz, 0.06, DY + 0.06, DY + 0.1, MAT.dark, false, 0.06, 10);
      b.mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.12, 10), new THREE.MeshStandardMaterial({ color: '#3a2412', emissive: '#ff8a3a', emissiveIntensity: 1.6, transparent: true, opacity: 0.85 }), lx, DY + 0.16, lz, false);
      b.cyl(lx, lz, 0.04, DY + 0.22, DY + 0.26, MAT.dark, false, 0.02, 10);
      const glim = new THREE.PointLight('#ff8a3a', 0.9, 6, 1.6);
      glim.position.set(cx + lx - 0.1, DY + 0.3, cz + lz + 0.1);
      scene.add(glim);
    }
    // inside: bunk, strongbox, drawers, the overturned table, the man in the chair
    b.box(-1.25, DY + 0.28, -3.0, 0.9, 0.5, 2.4, MAT.paleWood);
    b.box(-1.25, DY + 0.58, -3.0, 0.86, 0.1, 2.36, new THREE.MeshStandardMaterial({ color: '#5a5548', roughness: 1 }), 0, false);
    b.box(1.35, DY + 0.5, -3.7, 0.7, 1.0, 1.0, MAT.wood);
    b.box(1.05, DY + 0.72, -3.7, 0.5, 0.16, 0.8, MAT.paleWood, 0, false);       // the open drawer
    addPickup(ctx, 'cigarettes', 'cigs', new THREE.Vector3(cx + 0.98, DY + 0.86, cz - 3.7), { rot: 0.4 });
    const tbl = b.box(0.9, DY + 0.42, -1.1, 0.9, 0.06, 1.3, MAT.wood, 0.5, false);
    tbl.rotation.z = 1.25;
    world.addBox(cx + 0.9, DY + 0.4, cz - 1.1, 0.35, 0.4, 0.6, 0.5);
    for (const dz of [-0.5, 0.5]) { const leg = b.bar(1.0, DY + 0.5, -1.1 + dz, 1.55, DY + 0.75, -0.9 + dz, 0.03, MAT.wood); void leg; }
    // chair and body
    b.box(-0.3, DY + 0.42, -1.6, 0.48, 0.05, 0.48, MAT.wood, 0.3, false);
    b.box(-0.37, DY + 0.75, -1.83, 0.48, 0.7, 0.05, MAT.wood, 0.3, false);
    world.addCyl(cx - 0.3, cz - 1.6, 0.42, DY, DY + 1.3);
    const dead = new Figure({ coat: '#4a4f48', trousers: '#2a2824', skin: '#8d8b80', hood: false, hair: '#2a2622' });
    dead.group.position.set(cx - 0.3, DY + 0.03, cz - 1.6);
    dead.group.rotation.y = 0.3;
    dead.skirtAmount = 0.5;
    {
      const p = dead.joints;
      p[J.hips].set(0.03, 0.5, 0.06); p[J.chest].set(0.1, 0.94, -0.1); p[J.head].set(0.2, 1.1, -0.22);
      p[J.shL].set(0.3, 0.9, -0.08); p[J.shR].set(-0.1, 0.93, -0.12);
      p[J.elL].set(0.36, 0.6, -0.05); p[J.haL].set(0.4, 0.34, 0.02);
      p[J.elR].set(-0.24, 0.66, 0.0); p[J.haR].set(-0.2, 0.52, 0.22);
      p[J.hipL].set(0.13, 0.47, 0.06); p[J.hipR].set(-0.07, 0.47, 0.06);
      p[J.knL].set(0.2, 0.5, 0.5); p[J.ftL].set(0.28, 0.03, 0.72);
      p[J.knR].set(-0.14, 0.5, 0.5); p[J.ftR].set(-0.2, 0.03, 0.62);
      dead.headYaw = 0.5; dead.headPitch = -0.55;
      dead.refresh(0.3);
    }
    scene.add(dead.group);
    // blood, long dried
    const blood = new THREE.MeshStandardMaterial({ color: '#2a0806', roughness: 0.6 });
    const stain = (x: number, y: number, z: number, s: number, wallX = false) => {
      const m = b.mesh(new THREE.CircleGeometry(s, 14), blood, x, y, z, false);
      if (wallX) m.rotation.y = Math.PI / 2; else m.rotation.x = -Math.PI / 2;
      m.scale.set(1, 0.6 + Math.random() * 0.6, 1);
    };
    stain(-0.25, DY + 0.075, -1.75, 0.55); stain(0.2, DY + 0.075, -1.2, 0.2); stain(-0.6, DY + 0.075, -2.1, 0.14);
    for (let i = 0; i < 9; i++) stain(CX0 + 0.07, DY + 1.0 + Math.random() * 0.9, -2.4 + Math.random() * 1.2, 0.03 + Math.random() * 0.07, true);
    for (const [x, z] of [[0.5, -0.4], [0.75, -0.25], [0.2, 0.3]] as const) {
      const cs = b.mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6), MAT.brass, x, DY + 0.075, z, false);
      cs.rotation.set(Math.PI / 2, 0, x * 3);
    }
    // strongbox at the foot of the bunk: needs the brass key
    b.box(-1.25, DY + 0.22, -1.45, 0.6, 0.4, 0.45, MAT.steel);
    const lidG = new THREE.Group();
    lidG.position.set(cx - 1.25, DY + 0.42, cz - 1.675);
    const lidM = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.47), MAT.steel);
    lidM.position.z = 0.235;
    lidG.add(lidM);
    scene.add(lidG);
    b.box(-1.25, DY + 0.3, -1.21, 0.1, 0.1, 0.03, MAT.brass, 0, false);
    const openBox = (instant: boolean) => {
      if (instant) lidG.rotation.x = -1.9; else world.tween(1.2, (k) => { lidG.rotation.x = -1.9 * k; });
      addPickup(ctx, 'revolver', 'revolver', new THREE.Vector3(cx - 1.25, DY + 0.5, cz - 1.45), { rot: 1.2, scale: 1.3, onTake: () => state.set('ammo', state.flag('ammo') + 1) });
    };
    world.interactables.push({
      pos: new THREE.Vector3(cx - 1.0, DY + 0.4, cz - 1.3), radius: 1.5,
      enabled: () => !state.flag('strongbox') && state.has('key'),
      use: () => { state.take('key'); state.set('strongbox'); ctx.sfx('unlock', lidG.position); openBox(false); },
    });
    if (state.flag('strongbox')) openBox(true);
    // a cold lantern, and the sea anchor line
    b.cyl(-1.2, 0.5, 0.07, DY + 1.9, DY + 2.2, MAT.brass, false, 0.05, 8);
    b.bar(0, DY, 5.9, 0.5, -1.5, 9, 0.02, MAT.rope, 4);
    world.moorings.push({ name: 'houseboat', x: cx + 4.3, z: cz + 1.5, psi: 0, dock: new THREE.Vector3(cx + 1.3, DY + 0.04, cz + 2.0) });
  }

  // ========================================================= smoker's barge
  {
    const { x: cx, z: cz } = PLACES.barge;
    calmZones.push({ x: cx, z: cz, r0: 14, r1: 65 });
    const b = new Builder(scene, world, cx, 0, cz);
    const DY = 1.0;
    b.box(0, DY - 0.9, 0, 6, 1.8, 15, MAT.rust);
    b.box(0, DY + 0.02, 0, 5.9, 0.04, 14.9, MAT.steel, 0, false);
    for (const z of [-7.6, 7.6]) b.box(0, DY - 0.3, z, 6.2, 0.9, 0.4, MAT.dark, 0, false);
    // container cabin
    const corr = patch(new THREE.MeshStandardMaterial({ color: '#3c5560', roughness: 0.75, metalness: 0.3 }), /* glsl */ `
      float ribs = 0.75 + 0.25 * sin((abs(wn.x) > abs(wn.z) ? wp.z : wp.x) * 18.0);
      col *= ribs * (0.7 + 0.5 * tri(wp, wn, 0.6)); col = mix(col, vec3(0.3, 0.13, 0.07), smoothstep(0.5, 0.78, tri(wp, wn, 1.6)) * 0.7);`, 'container');
    b.box(0.6, DY + 1.3, -4.2, 2.5, 2.6, 6, corr);
    b.trim(0.6, DY, -4.2, 2.5, 2.6, 6, MAT.dark, 0.12);
    b.box(0.6, DY + 1.0, -1.18, 1.0, 2.0, 0.05, MAT.dark, 0, false);
    // deck clutter
    b.drum(-1.8, 3.6, DY, MAT.red, MAT.dark); b.drum(-1.2, 4.3, DY, MAT.rust, MAT.dark);
    b.crate(1.8, DY, 5.2, 0.78, MAT.wood, MAT.paleWood, 0.2);
    const coil = b.mesh(new THREE.TorusGeometry(0.4, 0.09, 6, 18), MAT.rope, -1.9, DY + 0.1, 0.2);
    coil.rotation.x = Math.PI / 2;
    for (const z of [-6.6, -2, 2, 6.6]) for (const x of [-2.75, 2.75]) b.cyl(x, z, 0.1, DY, DY + 0.4, MAT.dark, false, 0.1, 8);
    b.rail(-2.9, -7.3, -2.9, 7.3, DY, MAT.rust); b.rail(2.9, -7.3, 2.9, -1.2, DY, MAT.rust); b.rail(2.9, 1.4, 2.9, 7.3, DY, MAT.rust);
    // a drum fire
    b.cyl(-0.4, 2.2, 0.32, DY, DY + 0.85, MAT.dark, true, 0.32, 12);
    const emberMat = new THREE.MeshStandardMaterial({ color: '#1a0a04', emissive: '#ff5a1a', emissiveIntensity: 2 });
    b.mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 12), emberMat, -0.4, DY + 0.8, 2.2, false);
    const fire = new THREE.PointLight('#ff7a30', 0, 14, 1.8);
    fire.position.set(cx - 0.4, DY + 1.3, cz + 2.2);
    scene.add(fire);
    world.updaters.push((_, t) => {
      const fl = 0.8 + Math.sin(t * 9) * 0.1 + Math.sin(t * 23) * 0.08;
      emberMat.emissiveIntensity = 2.5 * fl;
      fire.intensity = (6 + night() * 30) * fl;
    });
    world.moorings.push({ name: 'barge', x: cx + 5.0, z: cz + 0.1, psi: 0, dock: new THREE.Vector3(cx + 2.3, DY + 0.04, cz + 0.1) });
    npc({
      key: 'smoker', pose: 'stand', yaw: Math.PI / 2 - 0.5, smokes: true,
      look: { coat: '#4b3f3a', trousers: '#1f2226', skin: '#9a7a66', hood: false, hat: false, hair: '#1c1815' },
      pos: new THREE.Vector3(cx + 1.4, DY + 0.04, cz + 2.6),
      wants: 'cigarettes', gives: 'wheel', giveSpot: new THREE.Vector3(cx + 1.8, DY + 0.82, cz + 5.2),
    });
  }

  // ============================================================ the watcher
  npc({
    key: 'watcher', pose: 'sit', seat: 0.42, yaw: Math.PI / 2, smokes: true,
    look: { coat: '#5a5148', trousers: '#2b2a2c', skin: '#a08672', hood: false, hat: false, hair: '#b9b4a8' },
    pos: new THREE.Vector3(ISLAND.x + 33.2, 9.5 + 0.2, ISLAND.z - 47.2),
    wants: 'orchid', gives: 'chart', giveSpot: new THREE.Vector3(ISLAND.x + 33.9, 9.5 + 0.26, ISLAND.z - 46.0),
  });

  return npcs;
}
