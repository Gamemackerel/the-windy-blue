// Things left behind. Every object here is defunct: built in code from a few
// shared materials, then scattered through the world, mostly indoors.
import * as THREE from 'three';
import { MAT, patch } from './materials';
import { rng } from './noise';
import { Ctx } from './ctx';
import { headGeometry } from './figure';
import { ISLAND, islandHeight } from './island';
import { PLACES, HOME } from './rigs';
import { LAB } from './lab';
import { WINDMILL } from './windmill';
import { ATOLL, atollHeight } from './giant';

const std = (color: string, roughness: number, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const JM = {
  // weathered stone: pitted, stained, lichen in the hollows
  stone: patch(std('#a9a393', 0.92), /* glsl */ `
    float n = tri(wp, wn, 1.3); float pit = tri3(wp, wn, 9.0); float st = streaks(wp, wn, 2.5);
    col *= (0.72 + 0.4 * n) * (0.85 + 0.25 * pit);
    col = mix(col, col * vec3(0.5, 0.48, 0.42), smoothstep(0.45, 0.75, st) * 0.6);
    col = mix(col, vec3(0.28, 0.27, 0.2), smoothstep(0.6, 0.78, tri(wp, wn, 3.3)) * 0.5);
    bump = pit * 0.006 + n * 0.004;`, 'jstone'),
  plastic: patch(std('#a39781', 0.55), /* glsl */ `
    float g = tri(wp, wn, 2.0); col *= 0.75 + 0.35 * g; col = mix(col, vec3(0.2, 0.17, 0.12), smoothstep(0.55, 0.8, streaks(wp, wn, 4.0)) * 0.5);
    rough += (g - 0.5) * 0.3;`, 'jplastic'),
  board: patch(std('#5b3c20', 0.5), /* glsl */ `
    vec2 q = faceUV(wp, wn); float tr = step(0.6, fract(q.x * 90.0)) * step(0.4, vnoise(q * 30.0)); col = mix(col, vec3(0.45, 0.33, 0.14), tr * 0.6);`, 'jboard'),
  paper: patch(std('#c9c0a8', 0.95), /* glsl */ `col *= 0.75 + 0.35 * tri(wp, wn, 4.0); col = mix(col, vec3(0.35, 0.28, 0.18), smoothstep(0.55, 0.8, tri(wp, wn, 1.5)) * 0.5);`, 'jpaper'),
  screen: std('#0b0e10', 0.12, 0.3),
  bottle: std('#18221c', 0.1, 0.2),
  rubber: patch(std('#101010', 0.9), /* glsl */ `col *= 0.6 + 0.8 * tri3(wp, wn, 8.0);`, 'jrubber'),
  shade: std('#8f8266', 0.9),
  covers: [std('#4a1f1a', 0.8), std('#1f2a33', 0.8), std('#3a3424', 0.8), std('#2a2622', 0.8)],
};

type Piece = { big?: number; tall?: number };
type Maker = (g: THREE.Group, r: () => number) => Piece | void;
const add = (g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
};
const box = (g: THREE.Group, mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => add(g, new THREE.BoxGeometry(sx, sy, sz), mat, x, y, z, rx, ry, rz);
const cyl = (g: THREE.Group, mat: THREE.Material, r0: number, r1: number, h: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 14, open = false) => add(g, new THREE.CylinderGeometry(r1, r0, h, seg, 1, open), mat, x, y, z, rx, ry, rz);
const lathe = (pts: [number, number][], seg = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const old = (r: () => number) => (r() < 0.5 ? MAT.rust : MAT.steel);

export const JUNK: Record<string, Maker> = {
  kettle: (g, r) => {
    const m = old(r);
    add(g, lathe([[0.001, 0], [0.09, 0], [0.108, 0.04], [0.102, 0.11], [0.072, 0.15], [0.03, 0.162], [0.001, 0.165]]), m);
    cyl(g, m, 0.021, 0.011, 0.13, 0.125, 0.105, 0, 0, 0, -0.95, 8);
    add(g, new THREE.TorusGeometry(0.075, 0.008, 5, 14, Math.PI), MAT.dark, 0, 0.16, 0);
    add(g, new THREE.SphereGeometry(0.016, 8, 6), MAT.dark, 0, 0.172, 0);
  },
  can: (g, r) => {
    const m = old(r), h = 0.11;
    cyl(g, m, 0.033, 0.033, h, 0, h / 2, 0, 0, 0, 0, 12);
    for (const y of [0.004, h - 0.004]) add(g, new THREE.TorusGeometry(0.033, 0.004, 4, 12), m, 0, y, 0, Math.PI / 2);
    if (r() < 0.5) { g.rotation.z = Math.PI / 2; g.position.y += 0.033; }
    if (r() < 0.4) g.scale.set(1, 0.6 + r() * 0.3, 1);
  },
  bottle: (g, r) => {
    add(g, lathe([[0.001, 0], [0.035, 0], [0.038, 0.02], [0.038, 0.16], [0.015, 0.225], [0.013, 0.28], [0.017, 0.286], [0.012, 0.29]], 14), JM.bottle);
    if (r() < 0.45) { g.rotation.z = Math.PI / 2; g.position.y += 0.038; }
  },
  board: (g, r) => {
    box(g, JM.board, 0.22, 0.004, 0.15, 0, 0.002, 0);
    for (let i = 0; i < 7; i++) box(g, MAT.black, 0.02 + r() * 0.03, 0.008, 0.012 + r() * 0.02, (r() - 0.5) * 0.17, 0.008, (r() - 0.5) * 0.1);
    for (let i = 0; i < 4; i++) cyl(g, MAT.steel, 0.008, 0.008, 0.022, (r() - 0.5) * 0.17, 0.015, (r() - 0.5) * 0.1, 0, 0, 0, 8);
    box(g, MAT.brass, 0.14, 0.005, 0.012, 0, 0.003, 0.074);
  },
  monitor: (g, r) => {
    box(g, JM.plastic, 0.42, 0.36, 0.14, 0, 0.23, 0.1);
    box(g, JM.plastic, 0.3, 0.27, 0.24, 0, 0.22, -0.08);
    box(g, JM.screen, 0.33, 0.26, 0.012, 0, 0.24, 0.172);
    box(g, JM.plastic, 0.26, 0.05, 0.24, 0, 0.025, 0.02);
    box(g, MAT.black, 0.02, 0.012, 0.004, 0.17, 0.07, 0.172);
    if (r() < 0.35) { g.rotation.x = -Math.PI / 2; g.position.y += 0.2; }   // on its back, screen to the sky
    return { big: 0.3 };
  },
  tower: (g) => {
    box(g, JM.plastic, 0.2, 0.43, 0.45, 0, 0.215, 0);
    for (let i = 0; i < 3; i++) box(g, MAT.black, 0.15, 0.035, 0.006, 0, 0.36 - i * 0.055, 0.226);
    box(g, MAT.steel, 0.17, 0.4, 0.004, 0, 0.215, -0.227);
    return { big: 0.28 };
  },
  keyboard: (g) => {
    box(g, JM.plastic, 0.44, 0.022, 0.16, 0, 0.011, 0);
    for (let i = 0; i < 4; i++) box(g, JM.shade, 0.4, 0.012, 0.026, 0, 0.028, -0.055 + i * 0.036);
  },
  fridge: (g) => {
    const W = 0.7, H = 1.7, D = 0.62, T = 0.045, e = MAT.whiteSteel;
    box(g, e, W, H, T, 0, H / 2, -D / 2 + T / 2);
    for (const s of [-1, 1]) box(g, e, T, H, D, s * (W / 2 - T / 2), H / 2, 0);
    box(g, e, W, T, D, 0, T / 2, 0); box(g, e, W, T, D, 0, H - T / 2, 0); box(g, e, W, T, D, 0, H * 0.72, 0);
    for (const y of [0.4, 0.75, 1.0]) box(g, MAT.steel, W - 0.1, 0.012, D - 0.12, 0, y, 0);
    box(g, MAT.bone, W - 0.1, H - 0.1, 0.01, 0, H / 2, -D / 2 + T + 0.006);
    // the door stands open, the smaller freezer door hangs wider
    const door = new THREE.Group(); door.position.set(-W / 2, 0, D / 2); door.rotation.y = -1.9;
    box(door, e, W, H * 0.7, 0.05, W / 2, H * 0.36, 0.025); box(door, MAT.dark, 0.03, 0.4, 0.04, W - 0.06, H * 0.45, 0.07);
    box(door, MAT.bone, W - 0.12, 0.05, 0.1, W / 2, 0.4, -0.04); box(door, MAT.bone, W - 0.12, 0.05, 0.1, W / 2, 0.8, -0.04);
    const fz = new THREE.Group(); fz.position.set(-W / 2, 0, D / 2); fz.rotation.y = -2.4;
    box(fz, e, W, H * 0.26, 0.05, W / 2, H * 0.86, 0.025);
    g.add(door, fz);
    return { big: 0.55, tall: H };
  },
  book: (g, r) => {
    const c = JM.covers[(r() * JM.covers.length) | 0];
    box(g, c, 0.15, 0.034, 0.21, 0, 0.017, 0); box(g, JM.paper, 0.14, 0.026, 0.2, 0.006, 0.017, 0);
  },
  bookstack: (g, r) => {
    let y = 0;
    for (let i = 0; i < 3 + ((r() * 3) | 0); i++) {
      const c = JM.covers[(r() * JM.covers.length) | 0], t = 0.025 + r() * 0.025, a = (r() - 0.5) * 0.5;
      box(g, c, 0.15, t, 0.21, 0, y + t / 2, 0, 0, a); box(g, JM.paper, 0.14, t * 0.75, 0.2, 0.006, y + t / 2, 0, 0, a);
      y += t;
    }
  },
  bookopen: (g, r) => {
    const c = JM.covers[(r() * JM.covers.length) | 0];
    box(g, c, 0.31, 0.006, 0.21, 0, 0.003, 0);
    for (const s of [-1, 1]) box(g, JM.paper, 0.145, 0.02, 0.2, s * 0.074, 0.018, 0, 0, 0, s * 0.1);
    box(g, JM.paper, 0.14, 0.002, 0.2, 0.05, 0.04, 0, 0, 0, 0.5);                       // a page lifting
  },
  pages: (g, r) => {
    for (let i = 0; i < 6; i++) box(g, JM.paper, 0.14, 0.0015, 0.2, (r() - 0.5) * 0.5, 0.002 + i * 0.002, (r() - 0.5) * 0.5, (r() - 0.5) * 0.15, r() * 6, (r() - 0.5) * 0.15);
  },
  bust: (g, r) => {
    const h = add(g, headGeometry(0.14), JM.stone, 0, 0.52, 0.01);
    h.rotation.y = (r() - 0.5) * 0.4;
    const sh = add(g, lathe([[0.001, 0.14], [0.19, 0.14], [0.215, 0.2], [0.17, 0.27], [0.075, 0.34], [0.062, 0.42], [0.001, 0.42]], 20), JM.stone);
    sh.scale.z = 0.62;
    box(g, JM.stone, 0.3, 0.14, 0.24, 0, 0.07, 0);
    return { big: 0.3, tall: 0.7 };
  },
  stonehead: (g) => {   // a head alone, larger than life
    add(g, headGeometry(0.3), JM.stone, 0, 0.24, 0, 0.5, 0.3, 0.9);
    return { big: 0.4, tall: 0.5 };
  },
  torso: (g) => {
    const t = add(g, lathe([[0.001, 0.62], [0.06, 0.62], [0.075, 0.55], [0.18, 0.5], [0.2, 0.4], [0.16, 0.25], [0.165, 0.1], [0.15, 0.0], [0.001, 0.0]], 22), JM.stone);
    t.scale.z = 0.62;
    for (const s of [-1, 1]) add(g, new THREE.SphereGeometry(0.06, 10, 8), JM.stone, s * 0.19, 0.46, 0);   // the stumps of arms
    return { big: 0.3, tall: 0.62 };
  },
  column: (g) => {
    const geo = new THREE.CylinderGeometry(0.2, 0.22, 0.8, 32, 4);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 - 0.07 * Math.pow(Math.abs(Math.sin(a * 8)), 0.6); if (Math.abs(p.getY(i)) < 0.39) p.setXYZ(i, x * k, p.getY(i), z * k); }
    geo.computeVertexNormals();
    add(g, geo, JM.stone, 0, 0.4, 0);
    return { big: 0.3, tall: 0.8 };
  },
  capital: (g) => {
    box(g, JM.stone, 0.56, 0.1, 0.56, 0, 0.27, 0);
    add(g, new THREE.TorusGeometry(0.2, 0.05, 8, 20), JM.stone, 0, 0.17, 0, Math.PI / 2);
    cyl(g, JM.stone, 0.2, 0.2, 0.14, 0, 0.07, 0, 0, 0, 0, 20);
    for (const s of [-1, 1]) for (const t of [-1, 1]) add(g, new THREE.TorusGeometry(0.06, 0.025, 6, 12), JM.stone, s * 0.25, 0.2, t * 0.25, 0, Math.PI / 4);
    return { big: 0.35, tall: 0.32 };
  },
  stonehand: (g) => {
    box(g, JM.stone, 0.26, 0.09, 0.3, 0, 0.06, 0);
    for (let i = 0; i < 4; i++) add(g, new THREE.CapsuleGeometry(0.032, 0.2, 3, 8), JM.stone, -0.095 + i * 0.063, 0.08 + i * 0.01, 0.26, Math.PI / 2 - 0.25 - i * 0.05);
    add(g, new THREE.CapsuleGeometry(0.036, 0.14, 3, 8), JM.stone, 0.17, 0.06, 0.05, Math.PI / 2, 0, -0.8);
    return { big: 0.3 };
  },
  engine: (g) => {
    const s = MAT.steel, ru = MAT.rust, d = MAT.dark;
    box(g, ru, 0.62, 0.34, 0.42, 0, 0.3, 0);                                    // block
    box(g, s, 0.6, 0.12, 0.34, 0, 0.53, 0);                                     // head
    box(g, d, 0.56, 0.07, 0.24, 0, 0.625, 0);                                   // rocker cover
    box(g, d, 0.56, 0.12, 0.36, 0, 0.08, 0);                                    // sump
    for (let i = 0; i < 4; i++) {
      const x = -0.21 + i * 0.14;
      cyl(g, ru, 0.028, 0.028, 0.2, x, 0.5, 0.26, Math.PI / 2 - 0.5, 0, 0, 8);  // exhaust stubs
      cyl(g, d, 0.014, 0.014, 0.08, x, 0.69, 0, 0, 0, 0, 6);                    // plugs
    }
    cyl(g, ru, 0.035, 0.035, 0.6, 0, 0.42, 0.36, 0, 0, Math.PI / 2, 8);         // manifold
    cyl(g, s, 0.2, 0.2, 0.05, 0.34, 0.3, 0, 0, 0, Math.PI / 2, 20);             // flywheel
    for (const [y, rr] of [[0.2, 0.09], [0.42, 0.06], [0.33, 0.045]] as const) cyl(g, d, rr, rr, 0.035, -0.335, y, y === 0.33 ? 0.14 : 0, 0, 0, Math.PI / 2, 14);
    cyl(g, s, 0.065, 0.065, 0.16, -0.2, 0.46, -0.27, 0, 0, Math.PI / 2, 12);    // generator
    add(g, new THREE.TorusGeometry(0.07, 0.01, 4, 16), JM.rubber, -0.36, 0.38, 0.06, 0, Math.PI / 2);
    return { big: 0.5, tall: 0.66 };
  },
  gear: (g, r) => {
    const n = 12 + ((r() * 8) | 0), R = 0.1 + r() * 0.12, sh = new THREE.Shape();
    for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, rr = i % 2 ? R : R * 0.84; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
    const hole = new THREE.Path(); hole.absarc(0, 0, R * 0.25, 0, Math.PI * 2, true); sh.holes.push(hole);
    add(g, new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: false, curveSegments: 10 }), old(r), 0, 0.035, 0, Math.PI / 2);
  },
  piston: (g, r) => {
    const m = old(r);
    cyl(g, m, 0.045, 0.045, 0.07, 0, 0.045, 0, 0, 0, Math.PI / 2, 14);
    box(g, m, 0.2, 0.03, 0.02, 0.13, 0.045, 0);
    add(g, new THREE.TorusGeometry(0.03, 0.012, 5, 12), m, 0.25, 0.045, 0);
  },
  spring: (g, r) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) pts.push(new THREE.Vector3(Math.cos(i * 0.63) * 0.04, 0.045 + Math.sin(i * 0.63) * 0.04, i * 0.0045 - 0.13));
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.006, 5), old(r));
  },
  pipe: (g, r) => {
    const pts = [new THREE.Vector3(-0.4, 0.06, 0), new THREE.Vector3(0.1, 0.06, 0), new THREE.Vector3(0.2, 0.08, 0.02), new THREE.Vector3(0.24, 0.3, 0.03)];
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.055, 10), MAT.rust);
    cyl(g, old(r), 0.09, 0.09, 0.02, -0.4, 0.06, 0, 0, 0, Math.PI / 2, 12); cyl(g, old(r), 0.09, 0.09, 0.02, 0.24, 0.3, 0.03, 0, 0, 0, 12);
  },
  valve: (g) => {
    add(g, new THREE.TorusGeometry(0.13, 0.014, 6, 18), MAT.red, 0, 0.02, 0, Math.PI / 2);
    for (let k = 0; k < 3; k++) box(g, MAT.red, 0.25, 0.014, 0.014, 0, 0.02, 0, 0, (k / 3) * Math.PI);
  },
  mannequin: (g, r) => {
    const m = JM.plastic;
    const t = add(g, lathe([[0.001, 1.5], [0.045, 1.5], [0.05, 1.44], [0.17, 1.4], [0.18, 1.28], [0.13, 1.1], [0.15, 0.95], [0.13, 0.9], [0.001, 0.9]], 18), m);
    t.scale.z = 0.6;
    const head = add(g, new THREE.SphereGeometry(0.095, 16, 12), m, 0, 1.6, 0); head.scale.set(0.85, 1.15, 1);   // no face
    for (const s of [-1, 1]) {
      add(g, new THREE.CapsuleGeometry(0.062, 0.36, 3, 10), m, s * 0.085, 0.68, 0);
      add(g, new THREE.CapsuleGeometry(0.048, 0.38, 3, 10), m, s * 0.085, 0.24, 0);
      add(g, new THREE.SphereGeometry(0.05, 10, 8), m, s * 0.19, 1.38, 0);
    }
    // one arm is still attached
    add(g, new THREE.CapsuleGeometry(0.04, 0.26, 3, 8), m, 0.215, 1.2, 0.02, 0.1, 0, 0.08); add(g, new THREE.CapsuleGeometry(0.034, 0.24, 3, 8), m, 0.23, 0.9, 0.08, 0.35);
    if (r() < 0.5) { cyl(g, MAT.dark, 0.18, 0.18, 0.02, 0, 0.01, 0, 0, 0, 0, 16); cyl(g, MAT.steel, 0.012, 0.012, 0.9, 0, 0.45, -0.07, 0, 0, 0, 6); return { big: 0.3, tall: 1.7 }; }
    g.rotation.set(-Math.PI / 2 + 0.05, 0, 0.3); g.position.y += 0.1;       // toppled
    return { big: 0 };
  },
  lampfloor: (g, r) => {
    cyl(g, MAT.dark, 0.14, 0.13, 0.03, 0, 0.015, 0);
    cyl(g, MAT.brass, 0.012, 0.012, 1.45, 0, 0.74, 0, 0, 0, 0, 6);
    cyl(g, JM.shade, 0.2, 0.09, 0.24, 0.02, 1.52, 0, 0.25, 0, 0.2, 16, true).material = JM.shade;
    if (r() < 0.4) { g.rotation.z = Math.PI / 2 - 0.12; g.position.y += 0.14; return; }
    return { big: 0.18, tall: 1.6 };
  },
  lampdesk: (g) => {
    cyl(g, MAT.dark, 0.08, 0.075, 0.025, 0, 0.012, 0);
    cyl(g, MAT.steel, 0.007, 0.007, 0.26, 0.04, 0.14, 0, 0, 0, -0.35, 5); cyl(g, MAT.steel, 0.007, 0.007, 0.24, 0.02, 0.33, 0, 0, 0, 0.9, 5);
    cyl(g, MAT.dark, 0.075, 0.03, 0.1, -0.1, 0.36, 0, 0, 0, 0.9, 12, true);
  },
  tyre: (g, r) => {
    add(g, new THREE.TorusGeometry(0.27, 0.105, 10, 22), JM.rubber, 0, 0.105, 0, Math.PI / 2);
    if (r() < 0.3) { g.rotation.x = Math.PI / 2 - 0.2; g.position.y += 0.26; }
    return { big: 0.3 };
  },
  radio: (g) => {
    box(g, MAT.wood, 0.32, 0.2, 0.13, 0, 0.1, 0); box(g, JM.shade, 0.15, 0.13, 0.006, -0.065, 0.105, 0.066); box(g, JM.screen, 0.1, 0.04, 0.006, 0.09, 0.14, 0.066);
    for (const x of [0.06, 0.12]) cyl(g, MAT.brass, 0.014, 0.014, 0.014, x, 0.06, 0.07, Math.PI / 2, 0, 0, 10);
  },
  chair: (g, r) => {
    const w = MAT.wood;
    box(g, w, 0.42, 0.035, 0.42, 0, 0.45, 0); box(g, w, 0.42, 0.45, 0.035, 0, 0.72, -0.19);
    for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]] as const) box(g, w, 0.035, 0.45, 0.035, x, 0.225, z);
    if (r() < 0.6) { g.rotation.set(0, 0, Math.PI / 2 - 0.05); g.position.y += 0.2; return; }
    return { big: 0.3, tall: 0.9 };
  },
  suitcase: (g) => {
    box(g, JM.covers[2], 0.52, 0.17, 0.36, 0, 0.085, 0); box(g, JM.covers[3], 0.53, 0.012, 0.37, 0, 0.1, 0);
    add(g, new THREE.TorusGeometry(0.05, 0.01, 5, 10, Math.PI), MAT.dark, 0, 0.1, 0.185, 0, 0, 0);
    for (const x of [-0.16, 0.16]) box(g, MAT.brass, 0.03, 0.03, 0.01, x, 0.1, 0.185);
  },
  clock: (g) => {
    cyl(g, MAT.bone, 0.13, 0.13, 0.03, 0, 0.015, 0, 0, 0, 0, 20); add(g, new THREE.TorusGeometry(0.13, 0.012, 5, 22), MAT.brass, 0, 0.03, 0, Math.PI / 2);
    box(g, MAT.black, 0.008, 0.004, 0.09, 0, 0.033, -0.04); box(g, MAT.black, 0.06, 0.004, 0.008, 0.03, 0.033, 0);
  },
  typewriter: (g) => {
    box(g, MAT.dark, 0.32, 0.08, 0.3, 0, 0.04, 0); box(g, MAT.dark, 0.32, 0.07, 0.1, 0, 0.115, -0.09);
    cyl(g, JM.rubber, 0.025, 0.025, 0.34, 0, 0.16, -0.1, 0, 0, Math.PI / 2, 10);
    for (let i = 0; i < 3; i++) box(g, MAT.bone, 0.26, 0.014, 0.022, 0, 0.088 - i * 0.004, 0.03 + i * 0.035);
  },
  telephone: (g) => {
    box(g, MAT.black, 0.2, 0.06, 0.16, 0, 0.03, 0); cyl(g, MAT.bone, 0.045, 0.045, 0.006, 0, 0.063, 0.01, 0, 0, 0, 14);
    add(g, new THREE.CapsuleGeometry(0.02, 0.16, 3, 8), MAT.black, 0.18, 0.025, 0.05, 0, 0.4, Math.PI / 2);
  },
};

const SMALL = ['can', 'can', 'bottle', 'bottle', 'book', 'bookopen', 'pages', 'kettle', 'board', 'gear', 'spring', 'piston', 'valve', 'clock', 'telephone'];
const MEDIUM = ['monitor', 'tower', 'keyboard', 'bookstack', 'radio', 'suitcase', 'typewriter', 'lampdesk', 'chair', 'tyre', 'pipe', 'stonehand', 'capital'];
const LARGE = ['fridge', 'engine', 'mannequin', 'lampfloor', 'bust', 'torso', 'column', 'stonehead'];
const STONE = ['bust', 'torso', 'column', 'capital', 'stonehand', 'stonehead', 'column'];
const MACHINE = ['gear', 'gear', 'piston', 'spring', 'pipe', 'valve', 'engine', 'tyre', 'can'];

export function scatterJunk(ctx: Ctx) {
  const { scene, world } = ctx;
  let count = 0;
  /** put one object down. y: explicit height, or omitted to rest on whatever is under it near yHint */
  const put = (kind: string, x: number, z: number, o: { y?: number; hint?: number; yaw?: number; sink?: number; tip?: number; scale?: number; r?: () => number } = {}) => {
    const g = new THREE.Group(), r = o.r ?? rng(count * 7919 + 13);
    const info = JUNK[kind](g, r) || {};
    const inner = new THREE.Group();          // keeps the object's own pose separate from where it is put
    inner.add(g);
    const y = o.y ?? world.groundAt(x, z, o.hint ?? 1000);
    inner.position.set(x, y - (o.sink ?? 0), z);
    inner.rotation.set(o.tip ?? 0, o.yaw ?? r() * 6.283, 0, 'YXZ');
    if (o.scale) inner.scale.setScalar(o.scale);
    inner.updateMatrixWorld(true);
    g.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      const out = new THREE.Mesh(geo, mesh.material);
      out.castShadow = out.receiveShadow = true;
      out.userData.static = true;
      scene.add(out);
    });
    if (info.big && !o.tip) world.addCyl(x, z, info.big * (o.scale ?? 1), y - 0.2, y + (info.tall ?? 0.5) * (o.scale ?? 1));
    count++;
  };
  /** n objects from a list at random spots inside a rectangle, skipping anywhere `skip` says is taken */
  const strew = (seed: number, n: number, kinds: string[], x0: number, x1: number, z0: number, z1: number, hint: number, skip?: (x: number, z: number) => boolean) => {
    const r = rng(seed);
    for (let i = 0, tries = 0; i < n && tries < n * 12; tries++) {
      const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
      if (skip?.(x, z)) continue;
      put(kinds[(r() * kinds.length) | 0], x, z, { hint, r });
      i++;
    }
  };
  const IX = ISLAND.x, IZ = ISLAND.z, D = 1.7;

  // ---- the storehouse: the densest pile, with the museum pieces
  strew(11, 18, [...STONE, ...MEDIUM, 'fridge', 'mannequin', 'lampfloor'], IX + 47.6, IX + 53.4, IZ + 7.8, IZ + 12.4, D, (x, z) => x > IX + 52.2 && Math.abs(z - IZ - 10.5) < 1.3);
  strew(12, 14, SMALL, IX + 47.4, IX + 53.6, IZ + 7.6, IZ + 13.2, D);
  put('bust', IX + 50.4, IZ + 10.2, { hint: D, yaw: 1.2 });                           // under the gap in the roof
  for (const [k, z, y] of [['bookstack', -2.2, 0.53], ['clock', -1.2, 0.53], ['radio', 0.4, 1.23], ['bottle', 1.5, 1.23], ['monitor', 2.3, 0.53], ['typewriter', -0.7, 1.23], ['can', 2.0, 1.93], ['kettle', -1.8, 1.93], ['telephone', 1.0, 0.53]] as const)
    put(k, IX + 46.15, IZ + 10.5 + z, { y: 1.6 + y, yaw: Math.PI / 2 + (z % 1) });
  for (const [k, x] of [['lampdesk', -1.4], ['board', -0.6], ['board', 0.1], ['keyboard', 0.9], ['bookopen', 1.9], ['tower', 2.6]] as const) put(k, IX + 50.6 + x, IZ + 13.25, { y: 1.6 + 0.84, yaw: Math.PI + x * 0.2 });
  // ---- the sail loft
  strew(21, 9, [...SMALL, ...MEDIUM], IX + 59.6, IX + 68.4, IZ - 18.2, IZ - 12.4, D, (x, z) => (Math.abs(x - IX - 64) < 1.8 && z < IZ - 15.8) || (Math.abs(x - IX - 64) < 1.2 && z > IZ - 13.4) || x < IX + 60.3 || x > IX + 67.3);
  put('mannequin', IX + 66.6, IZ - 17.6, { hint: D, yaw: -0.6 });
  // ---- the boat shed and the yard
  strew(31, 9, [...MACHINE, 'chair', 'tyre', 'lampfloor'], IX + 78.5, IX + 89.5, IZ + 30.5, IZ + 37.5, D, (x, z) => Math.hypot(x - IX - 82, z - IZ - 33) < 3.6);
  put('engine', IX + 87.5, IZ + 31.6, { hint: D, yaw: 0.4 });
  strew(32, 12, [...SMALL, 'tyre', 'pipe', 'column', 'stonehand', 'chair'], IX + 58, IX + 100, IZ - 8, IZ + 30, D,
    (x, z) => Math.hypot(x - IX - 64, z - IZ - 4) < 2 || (Math.abs(x - IX - 50) < 6 && Math.abs(z - IZ - 10.5) < 5) || (Math.abs(x - IX - 64) < 7.5 && Math.abs(z - IZ + 15) < 5.5) || Math.hypot(x - IX - 74, z - IZ - 20) < 3 || (x > IX + 108 && Math.abs(z - IZ - 10) < 4));
  // ---- the porch of the house
  for (const [k, x, z] of [['bottle', 6.6, 2.6], ['bottle', 6.3, 3.0], ['kettle', 3.9, 0.2], ['bookopen', 4.4, 3.4], ['radio', 3.7, 2.6]] as const) put(k, IX + 26 + x, IZ - 51 + z, { hint: 9.9 });
  // ---- washed up round the island: stone and rubbish at the tide line
  {
    const r = rng(41);
    for (let i = 0, tries = 0; i < 20 && tries < 600; tries++) {
      const a = r() * 6.283, d = 110 + r() * 80, x = IX + Math.cos(a) * d, z = IZ + Math.sin(a) * d, h = islandHeight(x, z);
      if (h < 0.5 || h > 2.8 || Math.hypot(x - IX - 115, z - IZ - 10) < 30) continue;
      const k = r() < 0.5 ? STONE[(r() * STONE.length) | 0] : ['tyre', 'bottle', 'can', 'pipe', 'chair', 'monitor', 'suitcase'][(r() * 7) | 0];
      put(k, x, z, { y: h, sink: STONE.includes(k) ? 0.08 + r() * 0.18 : 0.02, tip: STONE.includes(k) ? (r() - 0.5) * 1.6 : 0, r });
      i++;
    }
  }
  // ---- the atoll: statuary sinking into the coral sand
  {
    const r = rng(51);
    for (let i = 0, tries = 0; i < 22 && tries < 600; tries++) {
      const a = r() * 6.283, d = ATOLL.r + (r() - 0.5) * 22, x = ATOLL.x + Math.sin(a) * d, z = ATOLL.z + Math.cos(a) * d, h = atollHeight(x, z);
      if (h < 0.9 || Math.abs(Math.atan2(Math.sin(a - 1.55), Math.cos(a - 1.55))) < 0.12) continue;
      const k = r() < 0.65 ? STONE[(r() * STONE.length) | 0] : ['bottle', 'can', 'tyre', 'mannequin', 'bookopen'][(r() * 5) | 0];
      put(k, x, z, { y: h, sink: STONE.includes(k) ? 0.1 + r() * 0.25 : 0.02, tip: STONE.includes(k) ? (r() - 0.5) * 1.8 : 0, scale: STONE.includes(k) ? 1 + r() * 1.2 : 1, r });
      i++;
    }
  }
  // ---- the houseboat: what the dead man lived among
  {
    const cx = PLACES.houseboat.x, cz = PLACES.houseboat.z, F = 0.76;
    for (const [k, x, z, y] of [['bottle', 0.3, -2.3, F], ['bottle', -0.7, -0.9, F], ['bottle', 0.1, -2.0, F], ['bookopen', 0.4, -0.2, F], ['kettle', 1.3, -2.5, F], ['can', 1.2, 0.4, F], ['can', 0.9, 0.2, F],
      ['suitcase', -0.2, -3.95, F], ['pages', 0.6, -1.9, F], ['lampdesk', 1.4, -3.35, F + 0.95], ['radio', -1.25, -3.9, F + 0.59], ['bookstack', -1.3, -0.7, F], ['clock', 1.55, -1.2, F]] as const) put(k, cx + x, cz + z, { y });
  }
  // ---- the floating home: someone's whole life, left mid-meal
  strew(61, 12, [...SMALL, 'bookstack', 'chair', 'suitcase', 'radio', 'lampfloor'], HOME.x - 1.4, HOME.x + 3.2, HOME.z - 1.7, HOME.z + 1.7, 0.7,
    (x, z) => (x > HOME.x + 2.0 && z > HOME.z + 0.3) || (Math.abs(x - HOME.x - 1.1) < 1 && z < HOME.z - 0.9) || Math.hypot(x - HOME.x - 2.7, z - HOME.z + 1.2) < 0.6);
  for (const [k, x] of [['kettle', -0.5], ['can', -0.1], ['bookopen', 0.3], ['bottle', 0.62]] as const) put(k, HOME.x + 1.1 + x, HOME.z - 1.45, { y: 0.55 + 0.75 });
  put('typewriter', HOME.x + 2.8, HOME.z + 1.2, { y: 0.55 + 0.53 });
  for (const [k, x, z] of [['tyre', -3.2, 2.6], ['can', -3.0, -2.2], ['bottle', -3.4, -1.2], ['pipe', 0.5, 3.0]] as const) put(k, HOME.x + x, HOME.z + z, { y: 0.55 });
  // ---- the jungle rig: things the growth has taken
  for (const [k, x, z] of [['fridge', 3.2, -6.3], ['monitor', -8.6, 1.2], ['bust', 0.4, 0.9], ['column', -4.3, -1.2], ['tyre', 8.6, 2.5]] as const) put(k, PLACES.jungle.x + x, PLACES.jungle.z + z, { y: 4.2 });
  // ---- the greenhouse
  for (const [k, x, z] of [['can', 0.5, 0.3], ['can', 0.2, 0.9], ['kettle', -1.1, 1.6], ['bookopen', 1.4, -1.2], ['lampfloor', 2.4, 1.6], ['bottle', -2.2, -1.7]] as const) put(k, PLACES.greenhouse.x + x, PLACES.greenhouse.z + z, { y: 3.4 });
  // ---- the barge: a breaker's deck
  {
    const cx = PLACES.barge.x, cz = PLACES.barge.z;
    for (const [k, x, z] of [['engine', -1.75, -4.6], ['tyre', -2.0, -2.2], ['tyre', -1.9, -6.4], ['gear', -2.1, -0.9], ['pipe', -1.9, 6.4], ['spring', 0.3, 6.5], ['piston', 0.9, 6.2], ['can', 0.4, 2.9], ['can', -1.0, 1.3], ['bottle', 2.3, 1.9], ['gear', 2.3, -0.4], ['valve', 2.2, 6.6]] as const) put(k, cx + x, cz + z, { y: 1.04 });
  }
  // ---- the raft
  put('bottle', PLACES.raft.x - 0.9, PLACES.raft.z + 0.9, { y: 0.36 }); put('kettle', PLACES.raft.x - 1.5, PLACES.raft.z - 0.7, { y: 0.36 }); put('can', PLACES.raft.x + 0.9, PLACES.raft.z - 0.6, { y: 0.36 });
  // ---- the laboratory: dead equipment on the benches and the floor
  {
    const cx = LAB.x, cz = LAB.z, F = -14, B = F + 0.9;
    for (const [k, x, z, y, yaw] of [['monitor', -5.9, 4.05, B, Math.PI], ['keyboard', -5.9, 3.6, B, Math.PI], ['board', -6.7, 3.65, B, 0.3], ['monitor', 3.3, 4.05, B, Math.PI], ['board', 1.4, 3.7, B, 1.1], ['tower', 3.9, 4.0, B, Math.PI],
      ['monitor', 14.7, 3.75, B, Math.PI], ['keyboard', 14.7, 3.3, B, Math.PI], ['bookstack', 5.9, 0.1, B, 0.2], ['tower', -8.6, 2.4, F, 0.4], ['pages', 0, 1, F, 0], ['pages', 9, -1, F, 0], ['chair', 8, 2.6, F, 1], ['chair', -3, 1.5, F, 2],
      ['mannequin', 19.3, 2.7, F, -2.2], ['lampfloor', 11, 3.6, F, 0], ['can', 2.5, -1.2, F, 0], ['bookopen', 17.5, -3.2, F, 0.5], ['telephone', 19.6, -3.3, F + 2.0, -1.5], ['board', 13.2, 3.5, B, 2]] as const) put(k, cx + x, cz + z, { y, yaw });
  }
  // ---- the windmill: parts round the foot of the tower
  {
    const cx = WINDMILL.x, cz = WINDMILL.z;
    for (const [k, x, z] of [['gear', 1.3, 1.0], ['pipe', -1.3, 0.9], ['piston', 0.6, 1.7], ['valve', -0.8, -0.4], ['spring', 1.5, -0.6]] as const) put(k, cx + x, cz + z, { y: 6.03 });
    for (const [k, x, z] of [['tyre', 4.4, 1.6], ['gear', -4.2, 2.4], ['can', 3.6, -3.2], ['engine', -4.0, -1.8]] as const) put(k, cx + x, cz + z, { y: 6.0 });
  }
  return count;
}
