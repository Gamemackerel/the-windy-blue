// The underwater laboratory: glass rooms on the seabed, dark until the
// windmill turns, then lit, with the drowned city outside the windows.
import * as THREE from 'three';
import { Ctx } from './ctx';
import { Builder } from './build';
import { MAT } from './materials';
import { rng, fbm } from './noise';
import { addPickup, makeItem } from './items';
import { Figure, J } from './figure';

export const LAB = { x: 720, z: 220 };
const FLOOR = -14, CEIL = -10;
const _bm = new THREE.Matrix4();

import { numeralsJournalHtml } from './glyphs';
export const JOURNALS = [
  'Subject has outgrown the third tank. We have stopped pretending the growth curve means anything.\n\nMoving it to the sea pen tonight.',
  'We do not say "the break" aloud.\n\nThe pen was not forced. It was opened, from the inside, the way one opens a door one has been watching others use.',
  'It arranged the marker buoys again. Not a pattern we set.\n\nI have looked at the photograph for two days. I think it is a question, and I think it is a simple one, and I cannot read it.',
  'Acuity tests abandoned. We cannot build a target small enough or far enough.\n\nIt followed a single gull from the horizon. I believe it sees us far better than we will ever see it.',
  'It no longer answers the lights.\n\nFor a year it tried everything it had and we gave it back nothing it could use. I think it has concluded there is nobody here to talk to.\n\nI think it is right.',
  'Clear night. It has been at the surface since dusk with its face turned up, not moving. Four hours.\n\nI do not know what it sees up there. I know what it looks like, from here.\n\nIt looks like someone waiting.',
];

export function buildLab(ctx: Ctx) {
  const { scene, world, state } = ctx;
  const cx = LAB.x, cz = LAB.z;
  const b = new Builder(scene, world, cx, 0, cz);
  const P = (x: number, y: number, z: number) => new THREE.Vector3(cx + x, y, cz + z);
  const powered = () => !!state.flag('power');
  const pp = ctx.playerPos();

  // ---------- surface pontoon and hatch ----------
  // The pontoon floats directly over the entry shaft, so the way down is under its dome and nothing stands alone in the sea.
  const PX = -9.2, PZ = -0.6, pcx = cx + PX, pcz = cz + PZ;
  const pb = new Builder(scene, world, pcx, 0, pcz);
  const PP = (x: number, y: number, z: number) => new THREE.Vector3(pcx + x, y, pcz + z);
  pb.box(0, 0.1, 0, 9, 0.8, 9, MAT.rust);
  pb.box(0, 0.52, 0, 8.8, 0.04, 8.8, MAT.steel, 0, false);
  for (const [x, z] of [[-4.6, -4.6], [4.6, -4.6], [-4.6, 4.6], [4.6, 4.6]] as const) pb.cyl(x, z, 0.5, -0.6, 0.9, MAT.whiteSteel, false, 0.5, 12);
  pb.cyl(0, 0.6, 1.5, 0.5, 3.0, MAT.whiteSteel, true, 1.5, 20);
  pb.mesh(new THREE.SphereGeometry(1.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.whiteSteel, 0, 3.0, 0.6).scale.y = 0.45;
  pb.box(0, 1.55, -0.93, 0.95, 1.9, 0.08, MAT.dark, 0, false);
  // the hub where the valve wheel belongs
  pb.cyl(0, -1.0, 0.05, 1.45, 1.55, MAT.dark, false, 0.05, 8).rotation.x = Math.PI / 2;
  const wheel = makeItem('wheel');
  wheel.scale.setScalar(2.2);
  wheel.position.set(pcx, 1.5, pcz - 1.02);
  wheel.visible = !!state.flag('hatch');
  scene.add(wheel);
  pb.rail(-4.3, 4.3, 4.3, 4.3, 0.54, MAT.rust); pb.rail(4.3, 4.3, 4.3, -4.3, 0.54, MAT.rust); pb.rail(-4.3, -4.3, -4.3, 4.3, 0.54, MAT.rust);
  world.moorings.push({ name: 'lab', x: pcx, z: pcz - 7.6, psi: Math.PI / 2, dock: PP(0, 0.54, -3.6) });
  world.interactables.push({
    pos: PP(0, 1.5, -1.5), radius: 1.7,
    enabled: () => !!state.flag('hatch') || state.has('wheel'),
    use: () => {
      if (!state.flag('hatch')) {
        state.take('wheel'); state.set('hatch'); wheel.visible = true;
        ctx.sfx('valve', wheel.position);
        world.tween(2.2, (k) => { wheel.rotation.z = k * 10; });
        return;
      }
      ctx.fade(() => { pp.set(cx - 9.2, FLOOR, cz + 0.9); ctx.sfx('door', pp); }, 0.9);
    },
  });

  // ---------- the rooms ----------
  const glass = new THREE.MeshPhysicalMaterial({ color: '#1c2a30', roughness: 0.04, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.4 });
  const rib = MAT.steel, deck = new THREE.MeshStandardMaterial({ color: '#23272a', roughness: 0.6, metalness: 0.5 });
  const H = CEIL - FLOOR, MY = FLOOR + H / 2;
  const pane = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const m = b.mesh(new THREE.BoxGeometry(sx, sy, sz), glass, x, y, z, false);
    m.renderOrder = 6;
    world.addBox(cx + x, y, cz + z, sx / 2 + 0.05, sy / 2, sz / 2 + 0.05);
  };
  // hall: x -12..12, z -5..5
  b.box(0, FLOOR - 0.15, 0, 24.4, 0.3, 10.4, deck);
  pane(0, MY, 5, 24, H, 0.08); pane(0, MY, -5, 24, H, 0.08);
  b.box(-12, MY, 0, 0.3, H, 10.4, rib);
  b.box(12, MY, -3.1, 0.3, H, 4.2, rib); b.box(12, MY, 3.1, 0.3, H, 4.2, rib); b.box(12, CEIL - 0.6, 0, 0.3, 1.2, 2.0, rib, 0, false);
  world.addBox(cx, CEIL + 0.5, cz, 12.4, 0.5, 5.4); world.addBox(cx + 16.5, CEIL + 0.5, cz, 4.7, 0.5, 4.7);
  const roofG = b.mesh(new THREE.BoxGeometry(24, 0.08, 10), glass, 0, CEIL, 0, false);
  roofG.renderOrder = 6;
  for (let x = -12; x <= 12.01; x += 3) {
    b.bar(x, FLOOR, 5, x, CEIL, 5, 0.07, rib); b.bar(x, FLOOR, -5, x, CEIL, -5, 0.07, rib); b.bar(x, CEIL, -5, x, CEIL, 5, 0.07, rib);
  }
  for (const z of [-5, 5]) { b.bar(-12, CEIL, z, 12, CEIL, z, 0.08, rib); b.bar(-12, FLOOR + 1.1, z, 12, FLOOR + 1.1, z, 0.04, rib); }
  // annex: x 12..21, z -4.5..4.5
  b.box(16.5, FLOOR - 0.15, 0, 9.3, 0.3, 9.4, deck);
  pane(16.5, MY, 4.5, 9, H, 0.08); pane(16.5, MY, -4.5, 9, H, 0.08); pane(21, MY, 0, 0.08, H, 9);
  const roofA = b.mesh(new THREE.BoxGeometry(9, 0.08, 9), glass, 16.5, CEIL, 0, false);
  roofA.renderOrder = 6;
  for (const [x, z] of [[21, 4.5], [21, -4.5], [16.5, 4.5], [16.5, -4.5]] as const) b.bar(x, FLOOR, z, x, CEIL, z, 0.07, rib);
  for (const z of [-4.5, 4.5]) b.bar(12, CEIL, z, 21, CEIL, z, 0.08, rib);
  b.bar(21, CEIL, -4.5, 21, CEIL, 4.5, 0.08, rib);
  // entry shaft and its ladder (the way back up): glass panes in a steel frame, rising to the underside of the pontoon
  {
    const SX = -9.2, top = -0.3, hgt = top - CEIL;
    b.mesh(new THREE.CylinderGeometry(1.1, 1.1, hgt, 12, 1, true), glass, SX, CEIL + hgt / 2, 0).renderOrder = 6;
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; b.bar(SX + Math.cos(a) * 1.1, CEIL, Math.sin(a) * 1.1, SX + Math.cos(a) * 1.1, top, Math.sin(a) * 1.1, 0.035, rib, 5); }   // mullions
    for (let y = CEIL; y <= top + 0.01; y += hgt / 5) { const ring = b.mesh(new THREE.TorusGeometry(1.1, 0.05, 6, 24), rib, SX, y, 0); ring.rotation.x = Math.PI / 2; }
    { const collar = b.mesh(new THREE.TorusGeometry(1.1, 0.11, 8, 24), rib, SX, CEIL, 0); collar.rotation.x = Math.PI / 2; }   // where it comes through the roof
    world.addCyl(cx + SX, cz, 1.18, CEIL + 0.3, top);
    b.bar(SX - 0.24, FLOOR, 0, SX - 0.24, 0.5, 0, 0.025, MAT.steel); b.bar(SX + 0.24, FLOOR, 0, SX + 0.24, 0.5, 0, 0.025, MAT.steel);
    for (let y = FLOOR + 0.3; y < 0.5; y += 0.3) b.bar(SX - 0.24, y, 0, SX + 0.24, y, 0, 0.016, MAT.steel, 5);
    // small lamps up the shaft: it is air in there, not sea
    const lampM = new THREE.MeshStandardMaterial({ color: '#2a2218', emissive: '#ffcf9a', emissiveIntensity: 1.6 });
    for (let y = CEIL + 1.5; y < top - 0.5; y += 2.4) b.mesh(new THREE.SphereGeometry(0.06, 8, 6), lampM, SX, y, -1.0, false);
  }
  world.interactables.push({ pos: P(-9.2, FLOOR + 1.2, 0.3), radius: 1.3, use: () => ctx.fade(() => { pp.set(pcx, 0.54, pcz - 2.4); }, 0.9) });

  // ---------- lights ----------
  const red = new THREE.MeshStandardMaterial({ color: '#200', emissive: '#ff1a0a', emissiveIntensity: 3 });
  const white = new THREE.MeshStandardMaterial({ color: '#ddd', emissive: '#e8f2ff', emissiveIntensity: 0 });
  const reds: THREE.PointLight[] = [], whites: THREE.PointLight[] = [];
  const stripMats: THREE.MeshStandardMaterial[] = [];
  const zones = [-6, 0, 6, 16.5];       // each on a cross beam
  b.bar(16.5, CEIL, -4.5, 16.5, CEIL, 4.5, 0.07, rib);
  zones.forEach((x) => {
    b.box(x, FLOOR + 2.6, -4.85, 0.25, 0.12, 0.12, red, 0, false);
    const r = new THREE.PointLight('#ff2010', 0, 14, 1.4);
    r.position.set(cx + x, FLOOR + 2.4, cz - 4.2);
    scene.add(r); reds.push(r);
    const sm = white.clone();
    stripMats.push(sm);
    b.box(x, CEIL - 0.13, 0, 0.26, 0.07, 3.4, sm, 0, false);
    for (const z of [-1.5, 1.5]) b.box(x, CEIL - 0.07, z, 0.05, 0.08, 0.05, rib, 0, false);
    const w = new THREE.PointLight('#e4f0ff', 0, 16, 1.3);
    w.position.set(cx + x, CEIL - 0.5, cz);
    scene.add(w); whites.push(w);
  });
  let lit = [0, 0, 0, 0], flood = 0;
  const litTarget = [0, 0, 0, 0];
  let floodTarget = 0;

  // ---------- furnishings ----------
  const fluidOff = new THREE.Color('#06140c'), fluidOn = new THREE.Color('#3dff7a');
  const fluids: THREE.MeshStandardMaterial[] = [];
  const tank = (x: number, z: number, r: number, h: number, inside: (g: THREE.Group) => void) => {
    b.cyl(x, z, r + 0.12, FLOOR, FLOOR + 0.5, rib, true, r + 0.12, 16);
    world.addCyl(cx + x, cz + z, r + 0.05, FLOOR, FLOOR + 0.5 + h);
    b.mesh(new THREE.CylinderGeometry(r + 0.12, r + 0.12, 0.25, 16), rib, x, FLOOR + 0.5 + h + 0.12, z);
    const fm = new THREE.MeshStandardMaterial({ color: '#0a2a16', roughness: 0.2, transparent: true, opacity: 0.38, emissive: '#3dff7a', emissiveIntensity: 0, depthWrite: false });
    fluids.push(fm);
    const f = b.mesh(new THREE.CylinderGeometry(r, r, h, 20), fm, x, FLOOR + 0.5 + h / 2, z, false);
    f.renderOrder = 4;
    const g = new THREE.Group();
    g.position.set(cx + x, FLOOR + 0.5 + h / 2, cz + z);
    scene.add(g);
    inside(g);
    return g;
  };
  const flesh = new THREE.MeshStandardMaterial({ color: '#8f9a8c', roughness: 0.5 });
  const blob = (g: THREE.Group, s: number, seed: number) => {
    const geo = new THREE.IcosahedronGeometry(s, 3);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 0.7 + 0.6 * fbm(p.getX(i) * 4 + seed, p.getY(i) * 4 + p.getZ(i) * 3); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 1.3, p.getZ(i) * k); }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, flesh);
    g.add(m);
    return m;
  };
  const floaters: THREE.Group[] = [];
  // row of specimens along the south wall
  floaters.push(tank(-7.5, -3.9, 0.5, 2.0, (g) => blob(g, 0.26, 1)));
  floaters.push(tank(-5.2, -3.9, 0.5, 2.0, (g) => { // an eye
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), new THREE.MeshStandardMaterial({ color: '#d8d6cc', roughness: 0.25 }));
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10), new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 0.2 }));
    iris.position.z = 0.19; iris.scale.z = 0.5;
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshStandardMaterial({ color: '#000' }));
    pupil.position.z = 0.26; pupil.scale.z = 0.4;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, 0.7, 6), flesh);
    stalk.rotation.x = Math.PI / 2; stalk.position.z = -0.6;
    g.add(eye, iris, pupil, stalk);
    g.userData.eye = true;
  }));
  floaters.push(tank(-2.9, -3.9, 0.5, 2.0, (g) => { // a hand, too long in the fingers
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.07), flesh);
    g.add(palm);
    for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.42 - Math.abs(i - 2) * 0.05, 3, 6), flesh); f.position.set(-0.09 + i * 0.045, 0.36, 0); f.rotation.z = (i - 2) * -0.07; g.add(f); }
  }));
  floaters.push(tank(-0.6, -3.9, 0.5, 2.0, (g) => { blob(g, 0.18, 7).position.y = 0.3; blob(g, 0.14, 9).position.y = -0.3; }));
  floaters.push(tank(1.7, -3.9, 0.5, 2.0, (g) => { // a length of spine
    for (let i = 0; i < 9; i++) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8), new THREE.MeshStandardMaterial({ color: '#c9c4b4', roughness: 0.6 })); v.position.set(Math.sin(i * 0.5) * 0.06, -0.6 + i * 0.15, 0); g.add(v); }
  }));
  // the centrepiece: something with the giant's proportions, the size of a child
  const CS = 2.35;
  const child = new Figure({ coat: '#8f9a8c', trousers: '#8f9a8c', skin: '#9aa597', hood: false, scale: CS, bare: true });
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: '#cfe8dc', transparent: true, opacity: 0.45, depthWrite: false }), 26);
  const bub = Array.from({ length: 26 }, (_, i) => ({ a: i * 2.4, r: 0.25 + ((i * 37) % 80) / 100, y: ((i * 53) % 100) / 100, v: 0.16 + ((i * 17) % 10) * 0.02, s: 0.012 + ((i * 29) % 10) * 0.003 }));
  floaters.push(tank(16.5, 0, 1.3, 3.2, (g) => {
    const p = child.joints;
    // knees drawn up to the chest, arms wrapped round the shins, the head bowed onto the knees
    p[J.hips].set(0, 0.55, 0); p[J.chest].set(0, 0.94, 0.17); p[J.head].set(0, 1.06, 0.36);
    p[J.shL].set(0.19, 0.9, 0.2); p[J.shR].set(-0.19, 0.9, 0.2);
    p[J.elL].set(0.3, 0.68, 0.34); p[J.haL].set(0.05, 0.6, 0.52); p[J.elR].set(-0.3, 0.68, 0.34); p[J.haR].set(-0.07, 0.56, 0.53);
    p[J.hipL].set(0.1, 0.52, 0.02); p[J.hipR].set(-0.1, 0.52, 0.02);
    p[J.knL].set(0.12, 0.88, 0.4); p[J.ftL].set(0.1, 0.44, 0.34); p[J.knR].set(-0.12, 0.86, 0.4); p[J.ftR].set(-0.1, 0.43, 0.36);
    child.skirtAmount = 0; child.headPitch = 0.95;
    child.refresh(0);
    child.group.position.set(0, -0.74 * CS, -0.24 * CS);
    const curl = new THREE.Group();
    curl.rotation.set(0.42, 0.5, 0.12);
    curl.add(child.group);
    g.add(curl);
    for (const off of [0.5, -0.4]) { const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 5), MAT.dark); tube.position.set(off, 1.1, -0.5); tube.rotation.z = off * 0.5; g.add(tube); }
  }));
  bubbles.position.set(cx + 16.5, FLOOR + 0.5, cz);
  bubbles.renderOrder = 5; bubbles.frustumCulled = false;
  scene.add(bubbles);
  // benches, an operating table, cabinets
  b.box(-6, FLOOR + 0.45, 3.9, 5, 0.9, 1.0, rib); b.box(3, FLOOR + 0.45, 3.9, 4, 0.9, 1.0, rib);
  b.box(6.5, FLOOR + 0.45, 0, 2.2, 0.9, 1.0, MAT.whiteSteel);
  b.cyl(6.5, 0, 0.05, FLOOR + 0.9, FLOOR + 2.6, MAT.dark, false, 0.05, 6);
  b.mesh(new THREE.CylinderGeometry(0.45, 0.3, 0.14, 16), MAT.whiteSteel, 6.5, FLOOR + 2.6, 0, false);
  for (const s of [-1, 1]) b.box(6.5 + s * 0.7, FLOOR + 0.96, 0, 0.3, 0.03, 0.12, MAT.dark, 0, false); // straps
  b.box(14.4, FLOOR + 0.45, 3.6, 3.4, 0.9, 0.9, rib); b.box(19.6, FLOOR + 1.0, -3.3, 1.2, 2.0, 1.4, rib);
  for (const x of [-4.5, 2.0, 15.2]) { b.cyl(x, 2.7, 0.2, FLOOR, FLOOR + 0.5, MAT.dark, true, 0.2, 10); }
  // pipes overhead and cables on the floor
  for (const z of [-3.2, 3.4]) b.bar(-12, CEIL - 0.5, z, 12, CEIL - 0.5, z, 0.09, MAT.rust, 8);
  b.bar(12, CEIL - 0.5, 3.4, 21, CEIL - 0.5, 3.4, 0.09, MAT.rust, 8);
  // switch cabinet, doors open, with the two parts the windmill needs
  b.box(-10.5, FLOOR + 1.1, -4.3, 1.6, 2.2, 0.6, rib);
  b.box(-11.35, FLOOR + 1.1, -3.75, 0.05, 2.1, 0.75, rib, 0.5, false); b.box(-9.65, FLOOR + 1.1, -3.75, 0.05, 2.1, 0.75, rib, -0.5, false);
  b.box(-10.5, FLOOR + 1.1, -3.98, 1.4, 2.0, 0.03, new THREE.MeshStandardMaterial({ color: '#0c0c0c' }), 0, false);
  addPickup(ctx, 'contactor', 'contactor', P(-10.85, FLOOR + 1.25, -3.9), { scale: 1.4 });
  addPickup(ctx, 'card', 'card', P(-10.15, FLOOR + 1.25, -3.9), { scale: 1.4, rot: 0.3 });
  // the locked cabinet: its door only releases with power
  b.box(9.6, FLOOR + 0.8, -4.3, 1.2, 1.6, 0.6, MAT.whiteSteel);
  const cabDoor = new THREE.Group();
  cabDoor.position.set(cx + 9.0, FLOOR + 0.8, cz - 3.98);
  const cd = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 0.04), MAT.whiteSteel);
  cd.position.x = 0.6;
  cabDoor.add(cd);
  scene.add(cabDoor);
  const lockLamp = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ff2010', emissiveIntensity: 2 });
  b.box(10.35, FLOOR + 1.75, -3.98, 0.08, 0.08, 0.03, lockLamp, 0, false);
  addPickup(ctx, 'bullet', 'bullet2', P(9.6, FLOOR + 0.95, -4.15), {
    scale: 1.3, enabled: () => !!state.flag('cabOpen'),
    onTake: () => { state.take('bullet'); state.set('ammo', state.flag('ammo') + 1); },
  });
  b.box(9.6, FLOOR + 0.85, -4.25, 1.0, 0.03, 0.4, rib, 0, false);

  // journals on the desks: seen in the dark, readable only in the light
  JOURNALS[6] ??= numeralsJournalHtml();
  const jSpots: [number, number, number, number][] = [[6.6, 0.15, 1.3, 6], [-7.6, 3.75, 0.2, 0], [-4.6, 3.8, -0.4, 1], [2.2, 3.8, 0.3, 2], [4.2, 3.7, -0.2, 3], [13.6, 3.5, 0.5, 4], [15.3, 3.6, -0.3, 5]];
  for (const [x, z, rot, i] of jSpots) {
    const g = new THREE.Group();
    g.position.set(cx + x, FLOOR + 0.93, cz + z);
    g.rotation.y = rot;
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.03, 0.3), new THREE.MeshStandardMaterial({ color: '#2a1f18', roughness: 0.8 }));
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.27), new THREE.MeshStandardMaterial({ color: '#cfc7b0', roughness: 0.95 }));
    pages.position.y = 0.022;
    g.add(cover, pages);
    for (let k = 0; k < 6; k++) { const line = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.002, 0.008), MAT.dark); line.position.set(-0.1, 0.034, -0.09 + k * 0.035); g.add(line); const l2 = line.clone(); l2.position.x = 0.1; g.add(l2); }
    scene.add(g);
    world.interactables.push({
      pos: P(x, FLOOR + 1.0, z - 0.3), radius: 1.5,
      enabled: () => powered() && lit[Math.min(3, Math.round((x + 8) / 8))] > 0.5,
      use: () => { state.set('read' + i); ctx.read(JOURNALS[i]); },
    });
  }

  // ---------- the sea outside ----------
  const out = new THREE.Group();
  out.visible = false;
  scene.add(out);
  {
    // seabed
    const N = 90, S = 620;
    const g = new THREE.PlaneGeometry(S, S, N, N);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const near = Math.max(0, 1 - Math.hypot(x, z) / 40);
      p.setY(i, -17 - (1 - near) * (5 + Math.max(0, z) * 0.11) + (fbm(x * 0.03 + 9, z * 0.03) - 0.5) * 9 * (1 - near));
    }
    g.computeVertexNormals();
    const bed = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#23261f', roughness: 1 }));
    bed.position.set(cx, 0, cz);
    out.add(bed);
    // supports under the lab
    for (const x of [-10, 0, 10, 18]) for (const z of [-4, 4]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 6, 8), MAT.rust); leg.position.set(cx + x, FLOOR - 3.2, cz + z); out.add(leg); }
    // the surface seen from beneath
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshBasicMaterial({ color: '#7fa6b4', side: THREE.BackSide }));
    surf.rotation.x = -Math.PI / 2;
    surf.position.set(cx, 0, cz);
    out.add(surf);
    out.userData.surf = surf;

    // kelp
    const r = rng(77);
    const kg = new THREE.PlaneGeometry(0.22, 1, 1, 12);
    kg.translate(0, 0.5, 0);
    const kelpMat = new THREE.MeshStandardMaterial({ color: '#10160a', roughness: 0.7, side: THREE.DoubleSide });
    const sway = { value: 0 };
    kelpMat.onBeforeCompile = (sh) => {
      sh.uniforms.uSway = sway;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uSway;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float k = position.y;
          transformed.x += sin(uSway * 0.7 + ip.x * 0.4 + k * 3.0) * 0.5 * k * k + sin(k * 9.0 + ip.z) * 0.12;
          transformed.z += cos(uSway * 0.5 + ip.z * 0.3 + k * 2.0) * 0.3 * k * k;`);
    };
    const KN = 700;
    const kelp = new THREE.InstancedMesh(kg, kelpMat, KN);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
    for (let i = 0; i < KN; i++) {
      // clustered near the glass, thinning with distance
      const a = r() * 6.283, d = 9 + r() * r() * 60;
      const x = Math.cos(a) * d * 1.6 + 4, z = Math.sin(a) * d;
      if (Math.abs(x - 4) < 17.5 && Math.abs(z) < 6.2) { i--; continue; }
      const near = Math.max(0, 1 - Math.hypot(x, z) / 40);
      const y = -17 - (1 - near) * (5 + Math.max(0, z) * 0.11) + (fbm(x * 0.03 + 9, z * 0.03) - 0.5) * 9 * (1 - near);
      pv.set(cx + x, y - 0.2, cz + z);
      q.setFromEuler(new THREE.Euler(0, r() * 6.283, 0));
      const h = 4 + r() * 9;
      sc.set(0.7 + r() * 0.9, h, 1);
      kelp.setMatrixAt(i, m4.compose(pv, q, sc));
    }
    kelp.frustumCulled = false;
    out.add(kelp);
    out.userData.sway = sway;

    // the drowned city, down the slope to the north
    const cityMat = new THREE.MeshStandardMaterial({ color: '#161b1c', roughness: 0.95 });
    const winMat = new THREE.MeshStandardMaterial({ color: '#040506', roughness: 0.4 });
    for (let i = 0; i < 70; i++) {
      const x = (r() - 0.5) * 420, z = 34 + r() * 250;
      const w = 9 + r() * 16, d = 9 + r() * 16, h = 16 + r() * r() * 95;
      const base = -22 - z * 0.11 - 6;
      const g2 = new THREE.Group();
      g2.position.set(cx + x, base, cz + z);
      g2.rotation.set((r() - 0.5) * 0.16, r() * 0.5, (r() - 0.5) * 0.16);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat);
      tower.position.y = h / 2;
      g2.add(tower);
      // rows of dead windows
      for (let fy = 4; fy < h - 3; fy += 4.5) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 1.6, d + 0.1), winMat);
        band.position.y = fy;
        g2.add(band);
      }
      // a broken crown
      if (r() < 0.6) { const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, h * 0.14, d * 0.5), cityMat); top.position.set(w * 0.15, h + h * 0.05, 0); top.rotation.z = (r() - 0.5) * 0.7; g2.add(top); }
      out.add(g2);
    }
    // a fallen span between two of them
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(90, 2.2, 7), cityMat);
    bridge.position.set(cx - 20, -30, cz + 70);
    bridge.rotation.set(0.05, 0.3, -0.12);
    out.add(bridge);

    // fish
    const fg = new THREE.ConeGeometry(0.05, 0.26, 5);
    fg.rotateX(Math.PI / 2); fg.scale(0.5, 1, 1);
    const FN = 160;
    const fish = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ color: '#5d6c72', roughness: 0.45, metalness: 0.2 }), FN);
    fish.frustumCulled = false;
    out.add(fish);
    const fd = Array.from({ length: FN }, (_, i) => ({ school: i % 4, a: r() * 6.283, rad: 2 + r() * 5, y: (r() - 0.5) * 3, sp: 0.25 + r() * 0.2 }));
    const schools = [{ x: 2, y: -11, z: 16, r: 9 }, { x: -9, y: -12.5, z: -16, r: 7 }, { x: 15, y: -9, z: 15, r: 6 }, { x: 4, y: -6.5, z: 0, r: 19 }];
    out.userData.fish = (t: number) => {
      for (let i = 0; i < FN; i++) {
        const f = fd[i], s = schools[f.school];
        const a = f.a + t * f.sp * (f.school % 2 ? 1 : -1);
        const rad = s.r + f.rad;
        pv.set(cx + s.x + Math.cos(a) * rad, s.y + f.y + Math.sin(a * 3 + i) * 0.4, cz + s.z + Math.sin(a) * rad * 0.7);
        q.setFromEuler(new THREE.Euler(0, -a + (f.school % 2 ? 0 : Math.PI), 0));
        sc.setScalar(0.8 + (i % 5) * 0.12);
        fish.setMatrixAt(i, m4.compose(pv, q, sc));
      }
      fish.instanceMatrix.needsUpdate = true;
    };
    // drifting particles give the water depth
    const SN = 900;
    const sp = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) {
      let x = (r() - 0.5) * 80, z = (r() - 0.5) * 60;
      const y = -22 + r() * 20;
      // nothing drifts inside the rooms or the shaft: it is pushed out to the nearer side
      if (x > -13 && x < 22 && Math.abs(z) < 6) z = (z < 0 ? -1 : 1) * (6.2 + r() * 8);
      sp[i * 3] = cx + x; sp[i * 3 + 1] = y; sp[i * 3 + 2] = cz + z;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#9fb4b8', size: 0.06, transparent: true, opacity: 0.5, depthWrite: false }));
    out.add(snow);
    out.userData.snow = snow;
    // floodlights on the hull
    const floodMat = new THREE.MeshStandardMaterial({ color: '#222', emissive: '#d8f0ff', emissiveIntensity: 0 });
    for (const x of [-9, 0, 9, 18]) { const fl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.3), floodMat); fl.position.set(cx + x, CEIL + 0.3, cz + 5.3); out.add(fl); }
    out.userData.floodMat = floodMat;
  }

  // ---------- behaviour ----------
  const inside = () => pp.y < -4 && Math.hypot(pp.x - cx - 4, pp.z - cz) < 40;
  let wasInside = false;
  const fogDark = new THREE.Color('#010306'), fogLit = new THREE.Color('#2a6578');
  const ambDark = new THREE.Color('#2a1010'), ambLit = new THREE.Color('#9fb8c4');

  world.updaters.push((dt, t) => {
    const here = inside();
    const un = ctx.env.under;
    un.amount += ((here ? 1 : 0) - un.amount) * Math.min(1, dt * 6);
    if (here !== wasInside) { out.visible = here; wasInside = here; if (here) un.amount = 1; }
    if (!here) { for (const l of [...reds, ...whites]) l.intensity = 0; return; }

    // the lights come up room by room the first time someone is here to see it
    if (powered()) {
      if (!state.flag('labLit')) {
        state.set('labLit', 1);
        [0, 1, 2, 3].forEach((i) => world.after(1.5 + i * 1.7, () => { litTarget[i] = 1; ctx.sfx('relay', whites[i].position, 1.2); }));
        world.after(10.5, () => { floodTarget = 1; ctx.sfx('flood-lights', pp, 1.4); state.set('labLit', 2); });
      } else if (state.flag('labLit') === 2 || litTarget[0] === 0) {
        if (state.flag('labLit') === 2) { for (let i = 0; i < 4; i++) litTarget[i] = 1; floodTarget = 1; }
      }
    }
    for (let i = 0; i < 4; i++) {
      lit[i] += (litTarget[i] - lit[i]) * Math.min(1, dt * 5);
      // fluorescent stutter on the way up
      const flick = lit[i] > 0.02 && lit[i] < 0.9 ? (Math.sin(t * 60 + i) > 0 ? 1 : 0.35) : 1;
      whites[i].intensity = lit[i] * 42 * flick;
      stripMats[i].emissiveIntensity = lit[i] * 5 * flick;
      reds[i].intensity = (1 - lit[i]) * 26 * (0.85 + 0.15 * Math.sin(t * 2 + i));
    }
    red.emissiveIntensity = 3;
    flood += (floodTarget - flood) * Math.min(1, dt * 0.6);
    const avg = (lit[0] + lit[1] + lit[2] + lit[3]) / 4;
    const day = 0.35 + 0.65 * ctx.env.daylight;
    un.fog.copy(fogDark).lerp(fogLit, flood * day);
    un.density = 0.075 - 0.054 * flood;
    un.ambient.copy(ambDark).lerp(ambLit, avg);
    un.intensity = 0.55 + avg * 0.6 + flood * 0.5;
    (out.userData.floodMat as THREE.MeshStandardMaterial).emissiveIntensity = flood * 2.2;
    (out.userData.surf as THREE.Mesh).visible = flood > 0.05;
    const glowK = avg;
    for (const fm of fluids) { fm.emissiveIntensity = glowK * 0.55; fm.color.copy(fluidOff).lerp(fluidOn, glowK * 0.25); }
    lockLamp.emissive.set(powered() && lit[2] > 0.5 ? '#30ff60' : '#ff2010');
    if (powered() && lit[2] > 0.9 && !state.flag('cabOpen')) { state.set('cabOpen'); ctx.sfx('unlock', cabDoor.position); world.tween(1.4, (k) => { cabDoor.rotation.y = -1.9 * k; }); }

    // things drift in their tanks; the eye follows you
    floaters.forEach((g, i) => {
      const o = (g.userData.home ??= g.position.clone()) as THREE.Vector3, k = i * 1.7;
      // adrift: a slow wander in all three directions, each on its own time, and a lazy turning
      g.position.set(o.x + Math.sin(t * 0.17 + k) * 0.03 + Math.sin(t * 0.41 + k * 2.1) * 0.012,
        o.y + Math.sin(t * 0.23 + k * 1.3) * 0.035 + Math.sin(t * 0.61 + k * 0.7) * 0.015,
        o.z + Math.sin(t * 0.19 + k * 3.1) * 0.03);
      if (g.userData.eye) { g.lookAt(pp.x, pp.y + 1.5, pp.z); }
      else g.rotation.set(Math.sin(t * 0.13 + k) * 0.09, Math.sin(t * 0.07 + i) * 0.7 + Math.sin(t * 0.29 + k) * 0.08, Math.sin(t * 0.11 + k * 2.0) * 0.07);
    });
    for (let i = 0; i < bub.length; i++) {
      const q = bub[i], y = ((q.y + t * q.v * 0.1) % 1) * 3.2, wob = Math.sin(t * 1.7 + i) * 0.03;
      _bm.makeScale(q.s, q.s * 1.15, q.s).setPosition(Math.cos(q.a) * q.r + wob, y, Math.sin(q.a) * q.r + Math.cos(t * 1.3 + i) * 0.03);
      bubbles.setMatrixAt(i, _bm);
    }
    bubbles.instanceMatrix.needsUpdate = true;
    (out.userData.sway as { value: number }).value = t;
    (out.userData.fish as (t: number) => void)(t);
    (out.userData.snow as THREE.Points).position.y = Math.sin(t * 0.05) * 0.6;
  });
  if (state.flag('cabOpen')) cabDoor.rotation.y = -1.9;

  return { inside };
}
