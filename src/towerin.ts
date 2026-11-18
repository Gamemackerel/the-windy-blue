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
import { softDot } from './npc';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glyphMesh, NUMERALS } from './glyphs';

export interface TowerHooks {
  /** draw the world from a fixed camera into a small picture, for the security screens */
  feed: (cam: THREE.Camera, target: THREE.WebGLRenderTarget) => void;
  /** the keeper has shot the player */
  kill: () => void;
}

const WR = 24.5;             // inside radius of the wall
const TANK_R = 2.75;                  // the band along the wall where the tanks lie
const SW = 24.5 - TANK_R - 13.0, SR = 13.0 + SW / 2;   // the stair: from 13 m out to the inner ends of the tanks
const TURNS = 11, PER = 24; // turns of stair, and ramp sections to a turn
const TANKS = 200;

export const TOWER_JOURNALS = [
  'Intake strainers cleared again. Weed, and worse than weed.\n\nFour pumps of six still turn. The plant does not care about us. It cares that the sea is cold, and the sea is still cold.\n\nWhile it runs, they sleep.',
  'Two hundred when the doors were shut. They paid for a later, better year.\n\nThe contract says: wake them when the water goes down.\n\nNobody wrote what to do if it does not go down.',
  'For whoever is last.\n\nThe plant can only be stopped by letting the sea into it. Three actions at the upper desk, in order. It cannot be undone, and the tanks hold their cold a day without it, perhaps two.\n\nThe other three actions at that desk I will not write down. You can see what they are for.\n\nCount the years first. I have.',
];

export function buildTowerInterior(ctx: Ctx, o: { cx: number; cz: number; floor: number; top: number; doorAngle: number; hooks: TowerHooks; exit: THREE.Vector3; topR: number; roofMat: THREE.Material }) {
  const { scene, world, state } = ctx, { cx, cz, hooks } = o;
  const F0 = o.floor, ROOF = o.top, GAL = ROOF - 12;         // atrium floor, roof, and the gallery under it
  const da = o.doorAngle, N = Math.round(TURNS * PER), RISE = (GAL - F0) / N;
  const A0 = da + 0.42, DA = (Math.PI * 2) / PER, SLEN = SR * DA;
  const pp = ctx.playerPos();
  const inside = (p: THREE.Vector3) => Math.hypot(p.x - cx, p.z - cz) < WR + 0.4 && p.y > F0 - 1.5 && p.y < ROOF - 0.6;
  const inShaft = (p: THREE.Vector3) => Math.hypot(p.x - cx, p.z - cz) < 2.6 && p.y > -27 && p.y <= F0 - 1.5;
  const BY = -26, BR = 21;                                   // the plant, under the sea
  const inPlant = (p: THREE.Vector3) => p.y < -10 && Math.hypot(p.x - cx, p.z - cz) < BR + 2;
  const onRoof = (p: THREE.Vector3) => p.y > ROOF - 0.5 && Math.hypot(p.x - cx, p.z - cz) < 27;
  const at = (a: number, r: number, y: number) => new THREE.Vector3(cx + Math.sin(a) * r, y, cz + Math.cos(a) * r);

  // the stair arrives at the gallery at A0 (it turns a whole number of times); the gallery is open over its last stretch
  const A0_ = da + 0.42, GAP0 = A0_ - 0.5, GAP1 = A0_ + 0.02;
  const angGap = (a: number, pad = 0) => { const m = (GAP0 + GAP1) / 2, h = (GAP1 - GAP0) / 2 + pad; return Math.abs(Math.atan2(Math.sin(a - m), Math.cos(a - m))) < h; };
  const HATCH_A = da + 0.9, HATCH_R = WR - 0.65;               // the hatch to the roof, beside the ladder
  const room = new THREE.Group();          // everything that is only ever seen from inside
  scene.add(room);
  room.visible = false; room.userData.noCull = true;
  const add = <T extends THREE.Object3D>(m: T) => { room.add(m); return m; };
  const wallM = new THREE.MeshStandardMaterial({ color: '#232a30', roughness: 0.6, metalness: 0.25, side: THREE.BackSide, emissive: '#3c505b', emissiveIntensity: 1 });
  const steel = new THREE.MeshStandardMaterial({ color: '#30363c', roughness: 0.5, metalness: 0.35, emissive: '#2a363e', emissiveIntensity: 1 });
  const pale = new THREE.MeshStandardMaterial({ color: '#59626a', roughness: 0.55, metalness: 0.3 });

  // ------------------------------------------------------------ shell, floors
  {
    const wall = add(new THREE.Mesh(new THREE.CylinderGeometry(WR, WR, ROOF - F0, 200, 1, true), wallM));
    wall.position.set(cx, (F0 + ROOF) / 2, cz);
    const disc = (y: number, r: number, mat: THREE.Material, up: boolean, r0 = 0) => {
      const m = add(new THREE.Mesh(r0 ? new THREE.RingGeometry(r0, r, 64) : new THREE.CircleGeometry(r, 64), mat));
      m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2; m.position.set(cx, y, cz); m.receiveShadow = true;
      return m;
    };
    // the floor, with the lift shaft through its middle
    const floorM = add(new THREE.Mesh(new THREE.RingGeometry(2.25, WR, 96, 1), steel)); floorM.rotation.x = -Math.PI / 2; floorM.position.set(cx, F0, cz); floorM.receiveShadow = true;
    for (let k = 0; k < 48; k++) { const a = ((k + 0.5) / 48) * Math.PI * 2, rm = (2.25 + 24.4) / 2; world.addBox(cx + Math.sin(a) * rm, F0 - 0.5, cz + Math.cos(a) * rm, 1.65, 0.5, (24.4 - 2.25) / 2, a); }
    // the gallery: a ring under the roof, open over the last stretch of the stair so the stair comes up through it
    const gw = GAP1 - GAP0;
    const gTop = add(new THREE.Mesh(new THREE.RingGeometry(12, WR, 96, 1, GAP1 - Math.PI / 2, Math.PI * 2 - gw), steel)); gTop.rotation.x = -Math.PI / 2; gTop.position.set(cx, GAL, cz);
    const gBot = add(new THREE.Mesh(new THREE.RingGeometry(12, WR, 96, 1, Math.PI / 2 - GAP0 - Math.PI * 2, Math.PI * 2 - gw), steel)); gBot.rotation.x = Math.PI / 2; gBot.position.set(cx, GAL - 0.3, cz);
    for (let k = 0; k < 96; k++) {
      const a = ((k + 0.5) / 96) * Math.PI * 2;
      if (angGap(a)) continue;
      world.addBox(cx + Math.sin(a) * 18.2, GAL - 0.25, cz + Math.cos(a) * 18.2, 0.85, 0.25, 6.2, a);
    }
    // a rail across the high edge of the opening
    {
      const ra = GAP0 - 0.012;
      for (const hh of [1.05, 0.55]) { const b = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, WR - 12.2), steel)); b.position.copy(at(ra, (WR + 12.2) / 2, GAL + hh)); b.rotation.y = ra; }
      for (let r = 12.2; r < WR; r += 1.4) { const up = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 0.06), steel)); up.position.copy(at(ra, r, GAL + 0.52)); }
      const c = at(ra, (WR + 12.2) / 2, GAL + 0.6); world.addBox(c.x, c.y, c.z, 0.06, 0.6, (WR - 12.2) / 2, ra);
    }
    // the gallery's inner rail
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2, x = cx + Math.sin(a) * 12.1, z = cz + Math.cos(a) * 12.1;
      if (Math.abs(Math.atan2(Math.sin(a - (da + Math.PI * 0.5)), Math.cos(a - (da + Math.PI * 0.5)))) < 0.16) continue;   // the opening onto the lift bridge
      if (angGap(a, 0.1)) continue;                                                                                           // and none over the stair's opening
      const post = add(new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.06, 0.06), steel)); post.position.set(x, GAL + 1.05, z); post.rotation.y = a;   // along the edge
      const mid = post.clone(); mid.position.y = GAL + 0.55; add(mid);
      const up = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 0.06), steel)); up.position.set(x, GAL + 0.52, z);
      world.addBox(x, GAL + 0.6, z, 1.4, 0.6, 0.06, a);
    }
    // the ceiling, with the hatch to the roof cut through it, and the roof above it
    const hatchAt = (dr: number, dt: number, y: number) => { const p = at(HATCH_A, HATCH_R + dr, y); p.x += Math.cos(HATCH_A) * dt; p.z -= Math.sin(HATCH_A) * dt; return p; };
    const holeShape = (R: number, flip: number) => {
      const sh = new THREE.Shape(); sh.absarc(0, 0, R, 0, Math.PI * 2, false);
      const hole = new THREE.Path(), pts = [[-0.62, -0.6], [0.62, -0.6], [0.62, 0.6], [-0.62, 0.6]].map(([dr, dt]) => hatchAt(dr, dt, 0));
      pts.forEach((p, i) => { const x = p.x - cx, y = (p.z - cz) * flip; if (i) hole.lineTo(x, y); else hole.moveTo(x, y); });
      hole.closePath(); sh.holes.push(hole);
      return new THREE.ShapeGeometry(sh, 64);
    };
    const ceil = add(new THREE.Mesh(holeShape(WR, 1), steel)); ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, ROOF - 0.4, cz);
    const roofTop = new THREE.Mesh(holeShape(o.topR, -1), o.roofMat); roofTop.rotation.x = -Math.PI / 2; roofTop.position.set(cx, ROOF, cz); roofTop.receiveShadow = true; scene.add(roofTop);
    // the roof's walking surface, open at the hatch
    for (let k = 0; k < 48; k++) { const a = ((k + 0.5) / 48) * Math.PI * 2; world.addBox(cx + Math.sin(a) * 11.6, ROOF - 0.5, cz + Math.cos(a) * 11.6, 1.55, 0.5, 11.6, a); }
    for (let k = 0; k < 120; k++) {
      const a = ((k + 0.5) / 120) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - HATCH_A), Math.cos(a - HATCH_A))) < 0.052) continue;
      world.addBox(cx + Math.sin(a) * 23.83, ROOF - 0.5, cz + Math.cos(a) * 23.83, 0.66, 0.5, 0.63, a);
    }
  }

  // ------------------------------------------------------------ the stair
  // The stair climbs evenly, except at the three lift landings, where it runs level for a few steps so the bridge out
  // to the lift meets it flat.
  const TH_ALL = TURNS * Math.PI * 2, LAND_W = 0.15;
  const LAND = [50, 100, 150].map((i) => ((i + 0.5) / TANKS) * TH_ALL);
  const flatBefore = (th: number) => LAND.reduce((acc, c) => acc + Math.min(2 * LAND_W, Math.max(0, th - (c - LAND_W))), 0);
  const stairY = (u: number) => { const th = u * TH_ALL; return F0 + ((GAL - F0) * (th - flatBefore(th))) / (TH_ALL - LAND.length * 2 * LAND_W); };
  const ST = Math.max(4, Math.round(RISE / 0.16)), HALF = RISE / (2 * ST), HALF_T = HALF;   // shallow steps, about a quarter of a metre each
  // the lift's stops: the floor, a landing beside every fiftieth tank, and the gallery. Bridges run out to the stair at each landing.
  const tankAng = (i: number) => A0 + ((i + 0.5) / TANKS) * TURNS * Math.PI * 2;
  const GAL_A = da + Math.PI * 0.5;
  const STOPS: { y: number; a: number; bridge: number; card?: boolean }[] = [
    { y: BY, a: da + Math.PI + 0.42, bridge: 0, card: true },     // down to the plant: only with the keeper's card
    { y: F0, a: da, bridge: 0 },                         // on the floor its door faces the way in
    ...LAND.map((c) => ({ y: stairY(c / TH_ALL) + HALF, a: A0 + c, bridge: SR - SW / 2 })),
    { y: GAL, a: GAL_A, bridge: 12.05 },
  ];
  void tankAng;
  const nearBridge = (a: number, wide = 0.11) => STOPS.some((s) => s.bridge && Math.abs(Math.atan2(Math.sin(a - s.a), Math.cos(a - s.a))) < wide);
  {
    // each tread a true wedge of the ring between the inner edge and the wall, so the stair bends with the tower instead of
    // going round it in straight pieces. Built once, about the tower's axis, and turned into place for every step.
    const dT = DA / ST, TH = 0.07;
    const wedge = (() => {
      const r0 = SR - SW / 2, r1 = SR + SW / 2, n = 4, sh = new THREE.Shape(), a1 = dT * 0.93;   // a narrow gap between each plate and the next
      for (let k = 0; k <= n; k++) { const a = (k / n) * a1; const px = Math.sin(a) * r1, py = -Math.cos(a) * r1; if (k === 0) sh.moveTo(px, py); else sh.lineTo(px, py); }
      for (let k = n; k >= 0; k--) { const a = (k / n) * a1; sh.lineTo(Math.sin(a) * r0, -Math.cos(a) * r0); }
      const g = new THREE.ExtrudeGeometry(sh, { depth: TH, bevelEnabled: false });
      g.rotateX(-Math.PI / 2); g.translate(0, -TH, 0);           // lying flat, its top at 0
      return g;
    })();
    const treads = new THREE.InstancedMesh(wedge, steel, N * ST);
    const ri0 = SR - SW / 2 + 0.05;
    // handrail and mid rail on the open side; and along both edges a bar at the foot that ties the floating plates into one stair
    for (const [hh, rr] of [[1.05, ri0], [0.55, ri0], [-0.06, ri0], [-0.06, SR + SW / 2 - 0.05]] as const) {
      const pts: THREE.Vector3[] = [];
      // in runs: on the inner edge the rails stop either side of each bridge out to the lift
      const runs: THREE.Vector3[][] = [[]];
      void pts;
      for (let i = 0; i <= N * 6; i++) {
        const f = i / (N * 6), a = A0 + f * N * DA, inner = rr === ri0;
        const y = stairY(f) + HALF + hh, sameY = STOPS.some((s) => s.bridge && Math.abs(s.y - (stairY(f) + HALF)) < 3);
        if (inner && sameY && nearBridge(a)) { if (runs[runs.length - 1].length) runs.push([]); continue; }
        runs[runs.length - 1].push(new THREE.Vector3(cx + Math.sin(a) * rr, y, cz + Math.cos(a) * rr));
      }
      for (const run of runs) {
        if (run.length < 2) continue;
        const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(run), run.length * 2, hh > 1 ? 0.035 : hh < 0 ? 0.06 : 0.025, 6), steel);
        rail.frustumCulled = false; add(rail);
      }
    }
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 1.1, 0.05), steel, N * ST);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
    const slope = Math.atan2(RISE, SLEN), rlen = Math.hypot(RISE, SLEN) + 0.05;
    for (let i = 0; i < N; i++) {
      const am = A0 + (i + 0.5) * DA, y0 = F0 + i * RISE, yaw = am + Math.PI / 2;
      const x = Math.sin(am) * SR, z = Math.cos(am) * SR;
      for (let s = 0; s < ST; s++) {
        v.set(cx, stairY((i * DA + (s + 1) * dT) / TH_ALL), cz);
        treads.setMatrixAt(i * ST + s, m4.compose(v, q.setFromEuler(e.set(0, A0 + i * DA + s * dT, 0)), s1));
      }
      {
        // one ramp per stretch of even slope: a section that holds the edge of a landing is cut there
        const rIn = SR - SW / 2, rOut = WR - 0.1, rm = (rIn + rOut) / 2, w2 = (rOut - rIn) / 2;
        const t0 = i * DA, t1 = (i + 1) * DA, cuts = [t0];
        for (const c of LAND) for (const e2 of [c - LAND_W, c + LAND_W]) if (e2 > t0 + 1e-4 && e2 < t1 - 1e-4) cuts.push(e2);
        cuts.push(t1); cuts.sort((p1, p2) => p1 - p2);
        for (let k = 0; k + 1 < cuts.length; k++) {
          const ta = cuts[k], tb = cuts[k + 1], h0 = stairY(ta / TH_ALL), h1 = stairY(tb / TH_ALL), ap = A0 + (ta + tb) / 2;
          world.addBox(cx + Math.sin(ap) * rm, h0 - 0.25 + HALF, cz + Math.cos(ap) * rm, w2, 0.25, (rm * (tb - ta)) / 2 + 0.12, ap + Math.PI / 2, h1 - h0);
        }
      }   // the stair and the tank band under one floor: no gap to fall through   // through the middle of each tread's top, so the foot stands on the steps rather than sinking into them
      // the well side: a rail, and something solid behind it
      const ri = SR - SW / 2 + 0.05, rx = cx + Math.sin(am) * ri, rz = cz + Math.cos(am) * ri;
      q.setFromEuler(e.set(-slope, yaw, 0, 'YXZ'));
      // a post on every tread, from the tread itself up to the handrail
      for (let k = 0; k < ST; k++) {
        const f = (k + 0.5) / ST, top = stairY((i * DA + (k + 1) * dT) / TH_ALL), railY = stairY((i + f) * DA / TH_ALL) + HALF + 1.05, pa = am + (f - 0.5) * DA;
        if (nearBridge(pa) && STOPS.some((s) => s.bridge && Math.abs(s.y - top) < 3)) { posts.setMatrixAt(i * ST + k, m4.makeScale(0, 0, 0)); continue; }
        posts.setMatrixAt(i * ST + k, m4.compose(v.set(cx + Math.sin(pa) * ri, (top + railY) / 2, cz + Math.cos(pa) * ri), q.setFromEuler(e.set(0, yaw, 0)), s1.set(1, (railY - top) / 1.1, 1)));
      }
      s1.set(1, 1, 1);
      // the rail's solid line, broken where a bridge leaves the stair
      const ym = stairY((i + 0.5) * DA / TH_ALL);
      if (!(nearBridge(am, 0.11 + DA / 2) && STOPS.some((s) => s.bridge && Math.abs(s.y - ym) < 3))) world.addBox(rx, ym + HALF + 0.9, rz, 0.07, 1.9, SLEN / 2 + 0.1, yaw);
      else for (const half of [-1, 1]) {
        const ha = am + half * DA * 0.36, hy = stairY((i + 0.5 + half * 0.36) * DA / TH_ALL);
        if (!nearBridge(ha)) world.addBox(cx + Math.sin(ha) * ri, hy + HALF + 0.9, cz + Math.cos(ha) * ri, 0.07, 1.9, SLEN * 0.14, ha + Math.PI / 2);
      }
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
  const glass = add(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.62, 2.5, 14, 1, true), new THREE.MeshStandardMaterial({ color: '#6fa3b4', roughness: 0.08, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, emissive: '#3f93b2', emissiveIntensity: 1.6 }), TANKS));
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
  const tankQ: THREE.Quaternion[] = [], tankA: number[] = [], keyPos = new THREE.Vector3();
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
      const home = at(a, tr, stairY(u) + HALF_T + 0.12);                 // sunk down among the steps, its upper half standing above the walk
      world.addBox(home.x, home.y, home.z, 0.66, 0.66 + Math.sin(tilt0) * 1.25, 1.28, a);
      tankA.push(a);
      const yaw = a + Math.PI;
      // run out from the wall toward the middle, the inner end dipped: the sleeper's head at the wall, lying on their back
      const tilt = tilt0;
      tY.set(Math.sin(a), 0, Math.cos(a)).multiplyScalar(Math.cos(tilt)); tY.y = Math.sin(tilt); tY.normalize();   // toward the wall, and up
      tZ.set(0, 1, 0); tX.crossVectors(tY, tZ).normalize(); tZ.crossVectors(tX, tY).normalize();
      q.setFromRotationMatrix(tB.makeBasis(tX, tY, tZ));
      glass.setMatrixAt(i, m4.compose(home, q, s1)); caps.setMatrixAt(i, m4);
      tlamps.setMatrixAt(i, m4.compose(home.clone().addScaledVector(tY, 1.24), q.clone().multiply(lq), s1));
      if (i === 4) {
        // this one is open: its glass hinged up at the wall end like a canopy, its light red, and the lift key lying in it
        glass.setMatrixAt(i, m4.makeScale(0, 0, 0)); tlamps.setMatrixAt(i, m4.makeScale(0, 0, 0));
        const hinge = new THREE.Group(); hinge.position.copy(home).addScaledVector(tY, 1.25); hinge.quaternion.copy(q); add(hinge);
        const lift = new THREE.Group(); lift.rotation.x = -0.95; hinge.add(lift);
        const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.5, 14, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: '#b46a6a', roughness: 0.08, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, emissive: '#7a1d14', emissiveIntensity: 0.6 }));
        canopy.position.y = -1.25; canopy.renderOrder = 5; lift.add(canopy);
        const redM = new THREE.MeshStandardMaterial({ color: '#200', emissive: '#ff2a18', emissiveIntensity: 3.2 });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 5, 20), redM); ring.position.copy(home).addScaledVector(tY, 1.24); ring.quaternion.copy(q).multiply(lq); add(ring);
        const red = new THREE.PointLight('#ff2a18', 6, 5, 1.8); red.position.copy(home).add(new THREE.Vector3(0, 0.9, 0)); scene.add(red);
        // the lower half of the tank stays where it was
        const trough = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.5, 14, 1, true, Math.PI / 2, Math.PI), glass.material as THREE.Material);
        trough.position.copy(home); trough.quaternion.copy(q); trough.renderOrder = 5; add(trough);
        // and its sleeper has come halfway out: kneeling in it, slumped forward over the side, arms hanging down the outside
        {
          const f = new Figure({ coat: '#9aa3a0', trousers: '#9aa3a0', skin: '#a9b0aa', hood: false, bare: true }), p = f.joints;
          p[J.hips].set(0, -0.28, 0.12); p[J.chest].set(0, 0.1, 0.42); p[J.head].set(0, -0.02, 0.66);
          p[J.shL].set(0.19, 0.08, 0.46); p[J.shR].set(-0.19, 0.08, 0.46);
          p[J.elL].set(0.22, -0.16, 0.66); p[J.haL].set(0.23, -0.42, 0.72); p[J.elR].set(-0.22, -0.16, 0.66); p[J.haR].set(-0.24, -0.43, 0.7);
          p[J.hipL].set(0.1, -0.3, 0.12); p[J.hipR].set(-0.1, -0.3, 0.12);
          p[J.knL].set(0.11, -0.48, 0.32); p[J.ftL].set(0.11, -0.5, -0.2); p[J.knR].set(-0.11, -0.48, 0.3); p[J.ftR].set(-0.11, -0.5, -0.22);
          f.skirtAmount = 0; f.headPitch = 1.1;
          f.refresh(0);
          // facing down the stair: its side is the tank's lower side
          const zf = new THREE.Vector3(-Math.cos(a), 0, Math.sin(a)), yu = new THREE.Vector3(0, 1, 0), xl = new THREE.Vector3().crossVectors(yu, zf);
          f.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xl, yu, zf));
          f.group.position.copy(home);
          f.group.traverse((ob) => { (ob as THREE.Mesh).frustumCulled = false; });
          add(f.group);
        }
        // the lift key has fallen out onto the step below the tank's open end
        keyPos.copy(at(a, WR - 3.3, stairY(u) + HALF + 0.03));
        addPickup(ctx, 'elevkey', 'elevkey', keyPos.clone(), { scale: 1.7, rot: 0.6, radius: 2.2 });
      }
      tankQ.push(q.clone());
      // where each will lie when it is over: a mound against the way out, deepest at the door
      const ra = r() * Math.PI * 2, rr = Math.sqrt(r()) * HEAP_R, hx = heapC.x + Math.cos(ra) * rr, hz = heapC.z + Math.sin(ra) * rr;
      const dc = Math.hypot(hx - cx, hz - cz);
      const px = dc > WR - 0.8 ? cx + ((hx - cx) * (WR - 0.8)) / dc : hx, pz = dc > WR - 0.8 ? cz + ((hz - cz) * (WR - 0.8)) / dc : hz;
      const depth = Math.max(0, 1 - rr / HEAP_R) * 3.6 + 0.25;
      sleepers.push({ home, yaw, to: new THREE.Vector3(px, F0 + 0.2 + r() * depth, pz), t0: r() * 26 + (1 - u) * 3, fall: 0, spin: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(5), rest: new THREE.Euler(Math.PI / 2 + (r() - 0.5) * 0.9, r() * 6.283, (r() - 0.5) * 0.9) });
    }
  }
  {
    const ro = SR + SW / 2 - 0.05, gap = (0.66 + 0.35) / ro, parts: THREE.BufferGeometry[] = [];
    const yAt = (a: number) => stairY((a - A0) / (TURNS * Math.PI * 2)) + HALF_T;
    for (let i = 0; i + 1 < tankA.length; i++) {
      const a0 = tankA[i] + gap, a1 = tankA[i + 1] - gap;
      if (a1 <= a0) continue;
      for (const hh of [1.05, 0.55]) {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 6; k++) { const a = a0 + ((a1 - a0) * k) / 6; pts.push(new THREE.Vector3(cx + Math.sin(a) * ro, yAt(a) + hh, cz + Math.cos(a) * ro)); }
        parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, hh > 1 ? 0.035 : 0.025, 6));
      }
      // posts at both ends of the run, and in between
      const runs = Math.max(2, Math.round(((a1 - a0) * ro) / 1.4));
      for (let k = 0; k <= runs; k++) {
        const a = a0 + ((a1 - a0) * k) / runs, y = yAt(a);
        const post = new THREE.BoxGeometry(0.05, 1.05, 0.05); post.translate(cx + Math.sin(a) * ro, y + 0.525, cz + Math.cos(a) * ro);
        parts.push(post.toNonIndexed().index ? post : post);
      }
      // and something solid along it, so nobody walks off into the space between the tanks
      const am = (a0 + a1) / 2, len = (a1 - a0) * ro;
      world.addBox(cx + Math.sin(am) * ro, yAt(am) + 0.9, cz + Math.cos(am) * ro, 0.07, 1.9, len / 2, am + Math.PI / 2);
    }
    // the stair hangs from the wall: a bracket every third tank, a beam out under the plates and a strut down to the wall
    for (let i = 1; i < tankA.length; i += 3) {
      const a = (tankA[i] + tankA[i - 1]) / 2, y = yAt(a) - 0.12;
      const rIn = SR - SW / 2 + 0.4, rW = WR - 0.05, ca = Math.sin(a), sa = Math.cos(a);
      const beam = new THREE.BoxGeometry(0.22, 0.24, rW - rIn); beam.rotateY(a); beam.translate(cx + ca * (rIn + rW) / 2, y - 0.12, cz + sa * (rIn + rW) / 2); parts.push(beam);
      const dx = rW - (rIn + 2.5), drop = 2.4, sl = Math.hypot(dx, drop);
      const strut = new THREE.BoxGeometry(0.16, 0.16, sl); strut.rotateX(Math.atan2(drop, dx)); strut.rotateY(a);
      strut.translate(cx + ca * (rIn + 2.5 + dx / 2), y - 0.24 - drop / 2, cz + sa * (rIn + 2.5 + dx / 2)); parts.push(strut);
      const plate = new THREE.BoxGeometry(0.5, 2.9, 0.06); plate.rotateY(a); plate.translate(cx + ca * (rW - 0.02), y - 1.4, cz + sa * (rW - 0.02)); parts.push(plate);
    }
    const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; }));
    if (merged) { const rail = new THREE.Mesh(merged, steel); rail.frustumCulled = false; add(rail); }
  }
  const _sq = new THREE.Quaternion();
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
  /** place every sleeper for a moment T seconds into the jettison (T < 0: all still in their tanks; large T: all at rest) */
  function layBodies(T: number) {
    for (let i = 0; i < TANKS; i++) {
      const s = sleepers[i], t = T - s.t0;
      if (i === 4) { bodies.setMatrixAt(i, _m4.makeScale(0, 0, 0)); continue; }   // out of the open tank already
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
  // a white lamp on the wall above every bracket, lighting the stair below it
  const fixM = new THREE.MeshStandardMaterial({ color: '#222', emissive: '#f4f8fa', emissiveIntensity: 6 });
  const glowM = new THREE.SpriteMaterial({ map: softDot(), color: '#cfdde6', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 1; i < tankA.length; i += 3) {
    const a = (tankA[i] + tankA[i - 1]) / 2, y = stairY((a - A0) / (TURNS * Math.PI * 2)) + 4.4;
    if (y > GAL - 0.6) continue;                               // none poking up through the gallery
    const fix = add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.3), fixM)); fix.position.copy(at(a, WR - 0.2, y)); fix.rotation.y = a;
    const glow = new THREE.Sprite(glowM); glow.visible = false; glow.position.copy(at(a, WR - 0.6, y - 0.2)); glow.scale.set(9, 7, 1); add(glow);
    const l = new THREE.PointLight('#eef4f8', 0, 26, 1.3);
    l.position.copy(at(a, WR - 2.2, y - 0.3));
    scene.add(l); lamps.push(l);
  }
  const galLamp = lamps[lamps.length - 1];
  // alarm beacons
  const beaconM = new THREE.MeshStandardMaterial({ color: '#300', emissive: '#ff1a0a', emissiveIntensity: 0 });
  const beacons: THREE.PointLight[] = [];
  for (const [a, y] of [[da + 2.2, GAL + 3.4], [da + 4.6, GAL + 3.4], [da + 1.2, F0 + 6], ...[1, 2, 3, 4, 5].map((k) => [A0 + k * 4 * Math.PI + 1.6, stairY((k * 4 * Math.PI + 1.6) / TH_ALL) + 5.5] as const)]) {
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
  // ------------------------------------------------------------ the plant
  const plant = new THREE.Group(); scene.add(plant); plant.visible = false; plant.userData.noCull = true;
  const plasmaM = new THREE.MeshStandardMaterial({ color: '#1a1030', emissive: '#b89cff', emissiveIntensity: 3.2 });
  const plantLights: THREE.PointLight[] = [];
  {
    const padd = <T extends THREE.Object3D>(m: T) => { plant.add(m); return m; };
    const shell = padd(new THREE.Mesh(new THREE.CylinderGeometry(BR, BR, 12, 48, 1, true), wallM)); shell.position.set(cx, BY + 6, cz);
    const fl = padd(new THREE.Mesh(new THREE.CircleGeometry(BR, 48), steel)); fl.rotation.x = -Math.PI / 2; fl.position.set(cx, BY, cz);
    const ce = padd(new THREE.Mesh(new THREE.RingGeometry(2.4, BR, 48, 1), steel)); ce.rotation.x = Math.PI / 2; ce.position.set(cx, BY + 12, cz);
    for (let k = 0; k < 6; k++) world.addBox(cx, BY - 0.5, cz, BR - 0.1, 0.5, 5.6, (k * Math.PI) / 6);
    world.addCyl(cx, cz, BR + 3, BY - 1, BY + 12, BR);
    // the machine: a ring of bright stuff in a segmented steel jacket, seen through the gaps between the coils
    const core = padd(new THREE.Mesh(new THREE.TorusGeometry(7, 1.5, 14, 64), plasmaM)); core.rotation.x = Math.PI / 2; core.position.set(cx, BY + 6.2, cz);
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const coil = padd(new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.42, 8, 20), steel)); coil.position.set(cx + Math.sin(a) * 7, BY + 6.2, cz + Math.cos(a) * 7); coil.rotation.y = a;
    }
    // the machine hangs at head height and over: the lift comes down through its middle
    world.addCyl(cx, cz, 9.8, BY + 3.4, BY + 9, 4.2);
    // sea water in, sea water out: six fat pipes from the wall, a pump on each
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.5;
      const pipe = padd(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, BR - 9.5, 12), k < 4 ? MAT.rust : MAT.dark)); pipe.rotation.z = Math.PI / 2; pipe.rotation.y = a + Math.PI / 2; pipe.position.copy(at(a, (BR + 9.5) / 2, BY + 6.2));
      const pump = padd(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.5, 14), pale)); pump.rotation.z = Math.PI / 2; pump.rotation.y = a + Math.PI / 2; pump.position.copy(at(a, BR - 3.2, BY + 6.2));
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
    // the two side walls; the near one has the doorway in it, between 4.15 and 2.25 m in from the outer wall
    const wallSeg = (a: number, r0: number, r1: number, y0 = GAL, y1 = GAL + 3.4) => {
      const w = add(new THREE.Mesh(new THREE.BoxGeometry(0.25, y1 - y0, r1 - r0), pale)); w.position.copy(at(a, (r0 + r1) / 2, (y0 + y1) / 2)); w.rotation.y = a;
      world.addBox(w.position.x, (y0 + y1) / 2, w.position.z, 0.14, (y1 - y0) / 2, (r1 - r0) / 2, a);
    };
    wallSeg(W1, 12.4, WR);
    wallSeg(W0, 12.4, WR - 4.15); wallSeg(W0, WR - 2.25, WR);
    { const lintel = add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 1.9), pale)); lintel.position.copy(at(W0, WR - 3.2, GAL + 3.0)); lintel.rotation.y = W0; }
    // the front, over the well: a wall to waist height, a long window, and a ceiling over it all
    const winM = new THREE.MeshStandardMaterial({ color: '#9fc4d2', roughness: 0.05, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide });
    const arc = (y0: number, y1: number, m: THREE.Material) => { const g = add(new THREE.Mesh(new THREE.CylinderGeometry(12.4, 12.4, y1 - y0, 24, 1, true, W0, W1 - W0), m)); g.position.set(cx, (y0 + y1) / 2, cz); if (m === winM) g.renderOrder = 5; return g; };
    const paleD = pale.clone(); paleD.side = THREE.DoubleSide;
    arc(GAL, GAL + 1.0, paleD); arc(GAL + 1.0, GAL + 2.9, winM); arc(GAL + 2.9, GAL + 3.4, paleD);
    for (let k = 0; k < 10; k++) { const a = W0 + ((k + 0.5) / 10) * (W1 - W0), p = at(a, 12.4, GAL + 1.7); world.addBox(p.x, p.y, p.z, (12.4 * (W1 - W0)) / 20 + 0.05, 1.7, 0.1, a); }
    const cl = add(new THREE.Mesh(new THREE.RingGeometry(12.4, WR, 24, 1, Math.PI / 2 - W1, W1 - W0), paleD)); cl.rotation.x = Math.PI / 2; cl.position.set(cx, GAL + 3.4, cz);
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
    // security cameras: the floor by the way in, each landing, the quay door from outside, and the plant
    const landCam = (s2: { a: number; y: number }): [THREE.Vector3, THREE.Vector3, boolean] => [at(s2.a + 0.32, WR - 1.4, s2.y + 4.2), at(s2.a - 0.05, 7, s2.y + 0.4), false];
    const views: [THREE.Vector3, THREE.Vector3, boolean][] = [
      [at(da + 0.9, 9, F0 + 13), at(da, 17, F0 + 1.5), false],                 // the way in, from above
      landCam(STOPS[2]), landCam(STOPS[3]), landCam(STOPS[4]),
      [at(da - 0.5, 75, F0 + 30), at(da, 30, F0 + 6), true],                   // the quay stair and the door, from outside
      [at(da + Math.PI + 1.2, 16, BY + 10), new THREE.Vector3(cx, BY + 4, cz), false],    // the plant
    ];
    views.forEach(([from, to, outside], i) => {
      const rt = new THREE.WebGLRenderTarget(320, 200, { type: THREE.HalfFloatType });      // the scene's light is far brighter than a screen: keep the range, and turn it down on the glass
      const cam = new THREE.PerspectiveCamera(i === 1 ? 70 : 58, 1.6, 0.3, 4000);
      cam.position.copy(from); cam.lookAt(to); cam.updateMatrixWorld();
      feeds.push({ cam, rt, outside });
      const sx2 = -1.3 + (i % 3) * 1.3, sy2 = i < 3 ? 2.05 : 1.2;
      const scr = add(new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.72), new THREE.MeshBasicMaterial({ map: rt.texture, color: new THREE.Color(0.22, 0.27, 0.25) })));
      scr.position.copy(onDesk(sx2, sy2, -0.35)); scr.rotation.y = ca;              // facing whoever sits at the desk
      const bez = add(new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.82, 0.1), steel)); bez.position.copy(onDesk(sx2, sy2, -0.42)); bez.rotation.y = ca;
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
  // up to the roof: a ladder on the wall of the gallery, up through the open hatch
  const hatchPos = at(HATCH_A, HATCH_R, ROOF);
  {
    const la = HATCH_A, lr = WR - 0.5, lp = at(la, lr, GAL), sx = Math.cos(la) * 0.24, sz = -Math.sin(la) * 0.24;
    for (const s2 of [-1, 1]) { const rail = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, ROOF - GAL + 1.1, 6), pale)); rail.position.set(lp.x + sx * s2, (GAL + ROOF + 1.1) / 2, lp.z + sz * s2); scene.attach(rail); }
    for (let y = GAL + 0.3; y < ROOF + 0.05; y += 0.3) { const rung = add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5), pale)); rung.rotation.z = Math.PI / 2; rung.rotation.y = la; rung.position.set(lp.x, y, lp.z); if (y > ROOF - 3) scene.attach(rung); }
    world.ladders.push({ x: lp.x, z: lp.z, y0: GAL, y1: ROOF, face: la, topExit: at(la, lr - 2.2, ROOF), bottomExit: at(la, lr - 1.2, GAL) });
    // the hatchway: its four sides through the thickness of the roof and a low coaming above it, and the lid thrown back
    const hp = (dr: number, dt: number, y: number) => { const p = at(HATCH_A, HATCH_R + dr, y); p.x += Math.cos(HATCH_A) * dt; p.z -= Math.sin(HATCH_A) * dt; return p; };
    const side = (dr: number, dt: number, w: number, d: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.85, d), steel); m.position.copy(hp(dr, dt, ROOF + 0.025)); m.rotation.y = HATCH_A; scene.add(m);
      world.addBox(m.position.x, ROOF + 0.225, m.position.z, w / 2, 0.225, d / 2, HATCH_A);
    };
    side(-0.67, 0, 1.34, 0.1); side(0.67, 0, 1.34, 0.1); side(0, -0.65, 0.1, 1.44); side(0, 0.65, 0.1, 1.44);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 1.3), pale); lid.position.copy(hp(0.95, 0, ROOF + 0.95)); lid.rotation.set(0, HATCH_A, 0); lid.rotateX(-1.25); scene.add(lid);
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
  const portalRT = new THREE.WebGLRenderTarget(280, 600, { type: THREE.HalfFloatType });
  const portalCam = new THREE.PerspectiveCamera(78, 7 / 15, 0.3, 200);
  portalCam.position.copy(at(da, WR - 0.6, F0 + 1.8)); portalCam.lookAt(at(da + 0.5, 12, F0 + 10)); portalCam.updateMatrixWorld();
  let portalFrame = 0;
  world.updaters.push((dt, t) => {
    tNow = t;
    const shaftNow = inShaft(pp), nearHatch = onRoof(pp) && pp.distanceTo(hatchPos) < 8;
    const here = inside(pp) || nearHatch, down = inPlant(pp) || shaftNow, any = inside(pp) || down;
    room.visible = here || shaftNow || (feeds.length > 0 && atDesk());
    plant.visible = down || atDesk();
    car.visible = room.visible || down; shaft.visible = any;
    heapPrompt.pos.set(pp.x, F0 + 1, pp.z);
    const alarm = floodT >= 0;
    for (const l of lamps) l.intensity = here ? (alarm ? 6 : 90) : 0;
    fixM.emissiveIntensity = alarm ? 0.3 : 6; glowM.opacity = alarm ? 0.05 : 0.55; wallM.emissiveIntensity = steel.emissiveIntensity = alarm ? 0.25 : 1;
    void galLamp;
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
      un.amount = 1; un.density = 0.004; un.intensity = alarm ? 4 : 20;   // the whole height of the well softly lit, so looking up it shows the stair winding away, not darkness   // a faint cold fill, so the stair can always just be made out
      un.fog.copy(fog.set(alarm ? '#120303' : '#3c4f5a'));      // far up the well fades to the grey of the walls, not to black un.ambient.copy(amb.set(alarm ? '#5a1c16' : down ? '#5a5080' : '#7792a0'));
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
    // through the open door from outside: a picture of the room taken from just inside the doorway, so the opening shows the stair and the tanks
    if (!any && state.flag('towerOpen') && pp.distanceTo(portalCam.position) < 60 && (portalFrame++ % 3) === 0) {
      room.visible = true; car.visible = true;
      // lit as it is when you are inside: the lamps on, and the cold fill through the whole well
      const un = ctx.env.under, keep = [un.amount, un.intensity];
      for (const l of lamps) l.intensity = 90;              // (never change which lights exist: that rebuilds every shader)
      hooks.feed(portalCam, portalRT);
      for (const l of lamps) l.intensity = 0;
      un.amount = keep[0]; un.intensity = keep[1];
      room.visible = false; car.visible = false;
    }
    if (atDesk() && (frame++ % 3) === 0) {
      const f = feeds[feedI++ % feeds.length];
      room.visible = true; plant.visible = true; car.visible = true; shaft.visible = true;
      hooks.feed(f.cam, f.rt);
    }
  });
  const atDesk = () => roomOpen() && pp.y > GAL - 1 && pp.y < ROOF - 1 && Math.hypot(pp.x - at(ca, 15, 0).x, pp.z - at(ca, 15, 0).z) < 9;

  // ------------------------------------------------------------ the lift
  // A glass car on four guides up the middle of the well, stopping at the floor, at the three landings and at the gallery.
  // It answers only to the lift key: a call post at every stop, and a panel of buttons in the car.
  const R_CAR = 2.0, CAR_H = 2.7, SIDES = 8, APO = R_CAR, SIDE = 2 * APO * Math.tan(Math.PI / SIDES);
  const car = new THREE.Group(); scene.add(car); car.visible = false; car.userData.noCull = true;   // shown with the room, the plant or the shaft, in the same frame as they are
  const glassM = new THREE.MeshStandardMaterial({ color: '#9fc4d2', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const frameM = steel;
  let doorPane: THREE.Mesh;
  {
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(R_CAR / Math.cos(Math.PI / SIDES), R_CAR / Math.cos(Math.PI / SIDES), 0.2, SIDES), frameM);
    floor.rotation.y = Math.PI / SIDES; floor.position.y = -0.1; car.add(floor);
    const roof = floor.clone(); roof.position.y = CAR_H + 0.1; car.add(roof);
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2;
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(SIDE - 0.08, CAR_H - 0.1), glassM);
      pane.position.set(Math.sin(a) * APO, CAR_H / 2, Math.cos(a) * APO); pane.rotation.y = a; pane.renderOrder = 5; car.add(pane);
      if (k === 0) doorPane = pane;
      // mullions at the corners, and a rail round at hand height
      const ca2 = a + Math.PI / SIDES, rc = R_CAR / Math.cos(Math.PI / SIDES);
      const mul = new THREE.Mesh(new THREE.BoxGeometry(0.07, CAR_H, 0.07), frameM); mul.position.set(Math.sin(ca2) * rc, CAR_H / 2, Math.cos(ca2) * rc); car.add(mul);
      if (k) { const hr = new THREE.Mesh(new THREE.BoxGeometry(SIDE, 0.05, 0.05), frameM); hr.position.set(Math.sin(a) * (APO - 0.06), 1.0, Math.cos(a) * (APO - 0.06)); hr.rotation.y = a; car.add(hr); }
    }
  }
  // the guides and the cable, the whole height of the well
  // below the floor, a shaft down to the plant
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, F0 - (BY + 12), 32, 1, true), new THREE.MeshStandardMaterial({ color: '#2a3238', roughness: 0.6, metalness: 0.3, side: THREE.BackSide, emissive: '#26343c' }));
  shaft.position.set(cx, (F0 + BY + 12) / 2, cz); scene.add(shaft); shaft.visible = false; shaft.userData.noCull = true;
  const plug = world.addCyl(cx, cz, 2.3, -1000, -999);         // the hole in the floor is closed while the car is down
  const cable = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), steel));
  // the panel in the car, opposite the door: one button for each stop, the lowest at the bottom
  const panel = new THREE.Group(); panel.position.set(0, 1.25, -APO + 0.06); car.add(panel);
  panel.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.92, 0.04), frameM));
  const btnM = STOPS.map(() => new THREE.MeshStandardMaterial({ color: '#111', emissive: '#bfe6f5', emissiveIntensity: 0.25 }));
  const markM = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#e8f4fa', emissiveIntensity: 1.6 });
  const btns = STOPS.map((_, i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.03), btnM[i]); b.position.set(0, -0.36 + i * 0.145, 0.035); panel.add(b);
    const g = glyphMesh(NUMERALS[i], 0.04, markM); g.position.z = 0.017; b.add(g);           // the sea people's figures, nought at the bottom
    return b;
  });
  // bridges from the stair to the lift at each landing, and from the gallery
  const gates: ReturnType<typeof world.addBox>[] = [];
  STOPS.forEach((s, i) => {
    if (!s.bridge) { gates.push(world.addBox(0, -1000, 0, 0.1, 0.1, 0.1)); return; }
    const r0 = R_CAR + 0.08, r1 = s.bridge + 0.3, rm = (r0 + r1) / 2, L = r1 - r0, pa = s.a;
    const deck = add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, L), steel)); deck.position.copy(at(pa, rm, s.y - 0.06)); deck.rotation.y = pa;
    world.addBox(cx + Math.sin(pa) * rm, s.y - 0.25, cz + Math.cos(pa) * rm, 1.2, 0.25, L / 2, pa);
    for (const side of [-1, 1]) {
      const ox = Math.cos(pa) * side * 1.18, oz = -Math.sin(pa) * side * 1.18;
      for (const hh of [1.05, 0.55, 0.02]) { const r = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, L), steel)); r.position.set(cx + Math.sin(pa) * rm + ox, s.y + hh, cz + Math.cos(pa) * rm + oz); r.rotation.y = pa; }
      for (let k = 0; k <= 3; k++) { const pr = r0 + (L * k) / 3; const p2 = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.05), steel)); p2.position.set(cx + Math.sin(pa) * pr + ox, s.y + 0.52, cz + Math.cos(pa) * pr + oz); }
      world.addBox(cx + Math.sin(pa) * rm + ox, s.y + 0.6, cz + Math.cos(pa) * rm + oz, 0.06, 0.6, L / 2, pa);
    }
    // the end of the bridge is barred while the car is elsewhere
    gates.push(world.addBox(cx + Math.sin(pa) * (r0 + 0.2), s.y + 0.6, cz + Math.cos(pa) * (r0 + 0.2), 1.2, 0.6, 0.06, pa));
    void i;
  });
  // the car's own solid parts: a floor, and walls on every side but the door
  const carFloor = world.addCyl(cx, cz, R_CAR, -1000, -999);
  const walls = Array.from({ length: SIDES }, () => world.addBox(0, -1000, 0, SIDE / 2, CAR_H / 2, 0.06));
  let carY = STOPS[1].y, carYaw = STOPS[1].a, at0 = 1, target = 1, doorOpen = 1, carV = 0;
  const callPosts: THREE.Vector3[] = STOPS.map((s) => { const p = at(s.a, R_CAR + 0.85, s.y + 1.1); p.x += Math.cos(s.a) * 0.9; p.z -= Math.sin(s.a) * 0.9; return p; });
  STOPS.forEach((s, i) => {
    const post = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), steel)); post.position.copy(callPosts[i]).setY(s.y + 0.55);
    const b = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshStandardMaterial({ color: '#111', emissive: '#bfe6f5', emissiveIntensity: 0.6 }))); b.position.copy(callPosts[i]).setY(s.y + 1.15);
    world.interactables.push({
      pos: callPosts[i].clone(), radius: 1.6, enabled: () => inside(pp) || inPlant(pp),
      use: () => { if (!state.has('elevkey')) { ctx.sfx('deny', callPosts[i]); return; } if (s.card && (!state.has('keycard') || state.flag('reactorFlooded'))) { ctx.sfx('deny', callPosts[i]); return; } if (target !== i || Math.abs(carY - s.y) > 0.01) { target = i; ctx.sfx('key', callPosts[i]); } },
    });
  });
  const inCar = () => Math.hypot(pp.x - cx, pp.z - cz) < R_CAR - 0.15 && Math.abs(pp.y - carY) < 1.2;
  let panelOn = false;
  const panelPos = new THREE.Vector3();
  world.interactables.push({
    pos: panelPos, radius: 1.4, enabled: () => inCar() && !panelOn,
    use: () => { if (!state.has('elevkey')) { ctx.sfx('deny', panelPos); return; } panelOn = true; ctx.input.release(true); },
  });
  const _rc = new THREE.Raycaster(), _nd = new THREE.Vector2(), _w = new THREE.Vector3();
  world.updaters.push((dt) => {
    const near = inside(pp);
    void near;
    // move toward the chosen stop, the door shut on the way
    const ty = STOPS[target].y, moving = Math.abs(carY - ty) > 0.005;
    doorOpen += ((moving ? 0 : 1) - doorOpen) * Math.min(1, dt * 3);
    if (moving && doorOpen < 0.05) {
      const ACC = 3, VMAX = 10, d = ty - carY, want = Math.sign(d) * Math.min(VMAX, Math.sqrt(Math.abs(d) * 2 * ACC));
      carV += THREE.MathUtils.clamp(want - carV, -ACC * dt, ACC * dt);              // speeds up and slows down evenly
      const step = carV * dt;
      const riding = inCar();
      carY = Math.abs(step) >= Math.abs(d) ? ty : carY + step;
      if (riding) { pp.y = carY; }
      const ya = STOPS[target].a, dy = Math.atan2(Math.sin(ya - carYaw), Math.cos(ya - carYaw));
      carYaw += dy * Math.min(1, dt * 0.8);
    } else if (!moving) { carV = 0; at0 = target; }
    car.position.set(cx, carY, cz); car.rotation.y = carYaw;
    doorPane.position.x = -SIDE * 0.95 * doorOpen;            // the door pane slides aside
    cable.position.set(cx, (carY + CAR_H + GAL + 6) / 2, cz); cable.scale.y = Math.max(0.1, GAL + 6 - carY - CAR_H);
    // its solid parts follow it
    carFloor.y0 = carY - 0.3; carFloor.y1 = carY;
    if (Math.abs(carY - F0) > 0.05) { plug.y0 = F0 - 0.5; plug.y1 = F0; } else { plug.y0 = -1000; plug.y1 = -999; }
    for (let k = 0; k < SIDES; k++) {
      const a = carYaw + (k / SIDES) * Math.PI * 2, w = walls[k];
      const shut = k !== 0 || doorOpen < 0.6;
      w.x = cx + Math.sin(a) * APO; w.z = cz + Math.cos(a) * APO; w.y = shut ? carY + CAR_H / 2 : -1000;
      w.yaw = a; w.sin = Math.sin(a); w.cos = Math.cos(a);
    }
    STOPS.forEach((s, i) => { gates[i].y = s.bridge && !(i === target && !moving && doorOpen > 0.6) ? s.y + 0.6 : -1000; });
    // the panel
    car.updateMatrixWorld(); panel.getWorldPosition(panelPos);
    btnM.forEach((m, i) => { m.emissiveIntensity = i === target ? 2.6 : i === at0 && !moving ? 1.2 : 0.25; });
    if (panelOn) {
      ctx.hold(0.2);
      _rc.setFromCamera(_nd.set(ctx.input.pointer.x, ctx.input.pointer.y), ctx.view);
      const hit = _rc.intersectObjects(btns, true)[0];
      
      let hob: THREE.Object3D | null = hit ? hit.object : null;
      while (hob && !(btns as THREE.Object3D[]).includes(hob)) hob = hob.parent;     // a numeral's stroke belongs to its button
      const hb = hob ? (btns as THREE.Object3D[]).indexOf(hob) : -1;
      btns.forEach((b, i) => b.scale.setScalar(i === hb ? 1.2 : 1));
      if (hb >= 0 && ctx.input.mouseHit(0)) {
        // the plant is down there only for the keeper's card, and not once the sea is in it
        if (STOPS[hb].card && (!state.has('keycard') || state.flag('reactorFlooded'))) ctx.sfx('deny', panelPos);
        else if (hb !== target || moving) { target = hb; ctx.sfx('key', panelPos); }
        panelOn = false; ctx.input.release(false);
      }
      if (ctx.input.hit('Escape') || ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].some((k) => ctx.input.hit(k)) || !inCar()) { panelOn = false; ctx.input.release(false); }
    }
    void _w;
  });

  return {
    lift: { stops: STOPS, gap: [GAP0, GAP1], hatch: hatchPos, get y() { return carY; }, get target() { return target; }, get panel() { return panelOn; }, go: (i: number) => { target = i; }, keyAt: keyPos },
    portal: portalRT.texture,
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
