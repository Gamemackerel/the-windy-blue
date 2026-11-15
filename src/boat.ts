// The sailboat: generated geometry, buoyancy on the wave surface, and the
// glue between the sailing model and what is drawn.
//
// Local frame: +Z forward, +Y up, +X port.
import * as THREE from 'three';
import { createSailState, stepSailing, SailState, SailInput } from './sailing';
import { waveHeight } from './waves';
import { Wind } from './wind';
import { World, Mooring } from './world';
import { MAT } from './materials';

const LEN = 5.2;
const BEAM = 1.9;
const DRAFT = 0.42;
const MAST_Z = 0.85;
const MAST_H = 6.4;
const BOOM_Y = 1.25;
const BOOM_LEN = 2.9;

const halfBeam = (s: number) => (BEAM / 2) * Math.pow(Math.sin(Math.PI * (0.2 + 0.8 * s)), 0.75);
const sheer = (s: number) => 0.52 + 0.3 * s * s + 0.05 * (1 - s) * (1 - s);
const keel = (s: number) => DRAFT * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, s * 0.85 + 0.15)));
const stationZ = (s: number) => -LEN / 2 + s * LEN;
const _v = new THREE.Vector3();
/** hull surface point: s along the length (0 stern, 1 bow), u across (-1 starboard, 1 port) */
function hullPoint(s: number, u: number, out: THREE.Vector3) {
  const au = Math.abs(u);
  const sh = sheer(s), kd = keel(s);
  out.set(Math.sign(u) * halfBeam(s) * Math.pow(au, 0.8), sh - (sh + kd) * (1 - Math.pow(au, 2.3)), stationZ(s));
  return out;
}
/** |u| at which the hull section reaches height y */
function uAtHeight(s: number, y: number) {
  const sh = sheer(s), kd = keel(s);
  return Math.pow(Math.max(0, 1 - (sh - y) / (sh + kd)), 1 / 2.3);
}

export function buildHull() {
  const NS = 30, NU = 21;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3();
  const rust = new THREE.Color('#4a2218'), tar = new THREE.Color('#1d1c1b'), bone = new THREE.Color('#a9a290');
  const c = new THREE.Color();
  for (let i = 0; i < NS; i++) {
    const s = i / (NS - 1);
    for (let j = 0; j < NU; j++) {
      hullPoint(s, -1 + (2 * j) / (NU - 1), p);
      pos.push(p.x, p.y, p.z);
      const top = sheer(s);
      if (p.y < 0.06) c.copy(rust);
      else if (p.y > top - 0.12) c.copy(bone);
      else c.copy(tar);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < NS - 1; i++)
    for (let j = 0; j < NU - 1; j++) {
      const a = i * NU + j, b = a + 1, d = a + NU, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  // transom
  const centre = pos.length / 3;
  pos.push(0, 0.1, stationZ(0));
  col.push(tar.r, tar.g, tar.b);
  for (let j = 0; j < NU - 1; j++) idx.push(centre, j, j + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** flat strip across the hull at a given height (floor boards, depth lid) */
function buildDeck(height: (s: number) => number, s0 = 0, s1 = 1, n = 24) {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const y = height(s);
    const x = halfBeam(s) * Math.pow(uAtHeight(s, y), 0.8);
    pos.push(x, y, stationZ(s), -x, y, stationZ(s));
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Boat {
  readonly group = new THREE.Group();
  readonly state: SailState;
  readonly position = this.group.position;

  /** cradle: fixed on blocks; moored: tied up and bobbing; sailing: under way */
  mode: 'cradle' | 'moored' | 'sailing' = 'sailing';
  cradle = { x: 0, y: 0, z: 0, psi: 0 };
  mooring: Mooring | null = null;
  hasMast = true;
  hasSail = true;
  /** 0 = sail lowered, 1 = fully hoisted */
  sailUp = 1;
  /** speed lost in the last grounding, for sound and feel */
  bump = 0;
  private mastParts: THREE.Object3D[] = [];
  private boomPivot = new THREE.Group();
  private rudderPivot = new THREE.Group();
  private pennant: THREE.Mesh;
  private sail: THREE.Mesh;
  private sailSide = 1;
  private sailFill = 0;
  private pitch = 0;
  private roll = 0;
  private y = 0;
  private yVel = 0;

  constructor(scene: THREE.Scene, x = 0, z = 0, psi = 0) {
    this.state = createSailState(x, z, psi);
    this.group.rotation.order = 'YXZ';

    const wood = MAT.wood, paleWood = MAT.paleWood, metal = MAT.dark;

    const hull = new THREE.Mesh(
      buildHull(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, side: THREE.DoubleSide }),
    );
    hull.castShadow = hull.receiveShadow = true;
    this.group.add(hull);

    const floor = new THREE.Mesh(buildDeck(() => -0.1, 0.02, 0.9), paleWood);
    floor.receiveShadow = true;
    this.group.add(floor);

    // gunwale rails
    for (const side of [1, -1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 28; i++) pts.push(hullPoint(i / 28, side, new THREE.Vector3()));
      const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.035, 6), wood);
      rail.castShadow = true;
      this.group.add(rail);
    }
    // thwarts (seats)
    for (const s of [0.2, 0.46]) {
      const y = 0.32;
      const w = 2 * halfBeam(s) * Math.pow(uAtHeight(s, y), 0.8);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.3), wood);
      seat.position.set(0, y, stationZ(s));
      seat.castShadow = seat.receiveShadow = true;
      this.group.add(seat);
    }
    // foredeck
    const fore = new THREE.Mesh(buildDeck((s) => sheer(s) - 0.03, 0.72, 1, 10), wood);
    fore.castShadow = fore.receiveShadow = true;
    this.group.add(fore);

    // depth-only lid so the sea is not drawn inside the hull
    const lid = new THREE.Mesh(buildDeck((s) => sheer(s) - 0.01), new THREE.MeshBasicMaterial({ colorWrite: false }));
    lid.renderOrder = 1;
    this.group.add(lid);

    // mast and boom
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, MAST_H, 10), wood);
    mast.position.set(0, MAST_H / 2 - 0.1, MAST_Z);
    mast.castShadow = true;
    this.group.add(mast);
    this.mastParts.push(mast, this.boomPivot);

    this.boomPivot.position.set(0, BOOM_Y, MAST_Z);
    this.group.add(this.boomPivot);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, BOOM_LEN, 8), wood);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 0, -BOOM_LEN / 2);
    boom.castShadow = true;
    this.boomPivot.add(boom);

    // sail: a grid deformed every frame
    const SU = 12, SV = 16;
    const sg = new THREE.PlaneGeometry(1, 1, SU, SV);
    const sc: number[] = [];
    const cloth = new THREE.Color('#c9c0aa'), seam = new THREE.Color('#9d947f'), patch = new THREE.Color('#8a4a34');
    const uv = sg.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      const row = Math.round(v * SV);
      let c = row % 4 === 0 ? seam : cloth;
      if (u > 0.3 && u < 0.62 && v > 0.18 && v < 0.36) c = patch;
      sc.push(c.r, c.g, c.b);
    }
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    this.sail = new THREE.Mesh(
      sg,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }),
    );
    this.sail.castShadow = true;
    this.sail.frustumCulled = false;
    this.boomPivot.add(this.sail);

    // rudder and tiller
    this.rudderPivot.position.set(0, 0, -LEN / 2 - 0.03);
    this.group.add(this.rudderPivot);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.15, 0.34), wood);
    blade.position.set(0, -0.05, -0.15);
    blade.castShadow = true;
    const tiller = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 1.25, 6), paleWood);
    tiller.rotation.x = Math.PI / 2 - 0.1;
    tiller.position.set(0, 0.56, 0.55);
    this.rudderPivot.add(blade, tiller);

    // masthead pennant
    const pg = new THREE.PlaneGeometry(0.9, 0.16, 8, 1);
    pg.translate(0.45, 0, 0);
    this.pennant = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: '#8a3b28', roughness: 0.9, side: THREE.DoubleSide }));
    this.pennant.position.set(0, MAST_H - 0.2, MAST_Z);
    this.group.add(this.pennant);
    this.mastParts.push(this.pennant);

    // forestay and shrouds
    const wire = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, a.distanceTo(b), 4), metal);
      m.position.copy(a).lerp(b, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      this.group.add(m);
      this.mastParts.push(m);
    };
    wire(0, MAST_H - 0.6, MAST_Z, 0, sheer(1), LEN / 2 - 0.02);
    const sx = halfBeam(0.6);
    wire(0, MAST_H - 1.2, MAST_Z, sx, sheer(0.6), stationZ(0.6) - 0.2);
    wire(0, MAST_H - 1.2, MAST_Z, -sx, sheer(0.6), stationZ(0.6) - 0.2);

    scene.add(this.group);
    this.sync(0, 1);
  }

  update(dt: number, t: number, input: SailInput, wind: Wind, world?: World) {
    for (const m of this.mastParts) m.visible = this.hasMast;
    this.sail.visible = this.hasMast && this.hasSail;
    const s = this.state;

    if (this.mode === 'cradle') {
      const c = this.cradle;
      s.x = c.x; s.z = c.z; s.psi = c.psi; s.u = s.v = s.r = 0; s.boom = 0; s.heel = 0;
      this.group.position.set(c.x, c.y, c.z);
      this.group.rotation.set(0, c.psi, 0.05);
      this.boomPivot.rotation.y = 0;
      this.sailUp = 0;
      this.updateSail(t, dt);
      return;
    }
    if (this.mode === 'moored' && this.mooring) {
      const m = this.mooring;
      const a = Math.min(1, dt * 1.5);
      s.x += (m.x - s.x) * a; s.z += (m.z - s.z) * a;
      let dpsi = m.psi - s.psi; dpsi = Math.atan2(Math.sin(dpsi), Math.cos(dpsi));
      s.psi += dpsi * a;
      s.u = s.v = s.r = 0;
      s.heel *= 1 - a; s.boom *= 1 - a; s.rudder *= 1 - a; s.alpha = 0;
      this.sailUp = Math.max(0, this.sailUp - dt * 0.8);
    } else {
      const px = s.x, pz = s.z;
      this.sailUp = Math.min(1, this.sailUp + dt * 0.7);
      const power = this.hasMast && this.hasSail ? this.sailUp : 0;
      stepSailing(s, input, wind.x * power, wind.z * power, dt);
      if (world) this.collide(world, px, pz);
    }
    this.sync(t, dt);
    this.updateSail(t, dt);

    // pennant streams with the apparent wind
    const sn = Math.sin(s.psi), cs = Math.cos(s.psi);
    const vx = s.u * sn + s.v * cs, vz = s.u * cs - s.v * sn;
    const ax = wind.x - vx, az = wind.z - vz;
    const wf = ax * sn + az * cs, wl = ax * cs - az * sn;
    // plane's +X is rotated to point along the local wind flow
    this.pennant.rotation.y = Math.atan2(wl, wf) - Math.PI / 2;
    const pp = this.pennant.geometry.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i);
      pp.setZ(i, Math.sin(x * 9 - t * 14) * 0.07 * x);
    }
    pp.needsUpdate = true;
  }

  /** keep the hull out of land and structures; grounding scrapes rather than sinks */
  private collide(world: World, px: number, pz: number) {
    const s = this.state;
    this.bump = 0;
    const sn = Math.sin(s.psi), cs = Math.cos(s.psi);
    let hit = false;
    for (const off of [2.2, 0, -2.0]) {
      const x = s.x + sn * off, z = s.z + cs * off;
      if (world.terrainHeight(x, z) > -0.5) { hit = true; break; }
      _v.set(x, -0.3, z);
      world.resolve(_v, 1.0, 1.0);
      if (Math.abs(_v.x - x) + Math.abs(_v.z - z) > 1e-4) { hit = true; break; }
    }
    if (hit) {
      this.bump = Math.abs(s.u);
      s.x = px; s.z = pz;
      s.u *= -0.25; s.v = 0;
    }
  }

  /** world position of a point given in the boat's local frame */
  local(x: number, y: number, z: number, out: THREE.Vector3) {
    return this.group.localToWorld(out.set(x, y, z));
  }
  /** where the helm sits: on the windward side, aft */
  seat(out: THREE.Vector3, side: number) { return this.local(-0.42 * side, 0.36, -1.5, out); }
  tillerGrip(out: THREE.Vector3) {
    const a = -this.state.rudder * 0.5;
    return this.local(Math.sin(a) * 1.05, 0.66, -LEN / 2 - 0.03 + Math.cos(a) * 1.05, out);
  }
  /** a point on the mainsheet between the boom and the helm's hand */
  sheetPoint(out: THREE.Vector3) {
    const b = this.state.boom;
    return this.local(Math.sin(b) * 1.5, BOOM_Y - 0.1, MAST_Z - Math.cos(b) * 1.5, out);
  }

  /** place the hull on the wave surface */
  private sync(t: number, dt: number) {
    const s = this.state;
    const sn = Math.sin(s.psi), cs = Math.cos(s.psi);
    const hb = waveHeight(s.x + sn * 2.1, s.z + cs * 2.1, t);
    const hs = waveHeight(s.x - sn * 2.1, s.z - cs * 2.1, t);
    const hp = waveHeight(s.x + cs * 0.8, s.z - sn * 0.8, t);
    const hq = waveHeight(s.x - cs * 0.8, s.z + sn * 0.8, t);
    const targetY = (hb + hs + hp + hq) / 4;
    const targetPitch = Math.atan2(hb - hs, 4.2) + Math.min(0.06, s.u * 0.006);
    const targetRoll = Math.atan2(hp - hq, 1.6);

    // a light spring gives the hull some weight on the swell
    const k = 38, d = 9;
    this.yVel += ((targetY - this.y) * k - this.yVel * d) * dt;
    this.y += this.yVel * dt;
    if (dt >= 1) { this.y = targetY; this.yVel = 0; }
    const a = Math.min(1, dt * 5);
    this.pitch += (targetPitch - this.pitch) * a;
    this.roll += (targetRoll - this.roll) * a;

    this.group.position.set(s.x, this.y + 0.06, s.z);
    this.group.rotation.set(-this.pitch, s.psi, this.roll - s.heel);
    this.boomPivot.rotation.y = -s.boom;
    this.rudderPivot.rotation.y = -s.rudder * 0.5;
  }

  private updateSail(t: number, dt: number) {
    const s = this.state;
    const side = s.boom >= 0 ? 1 : -1;
    this.sailSide += (side - this.sailSide) * Math.min(1, dt * 4);
    const power = Math.min(1, s.alpha / 0.25) * Math.min(1, s.aws / 5);
    this.sailFill += (power - this.sailFill) * Math.min(1, dt * 3);
    const luff = 1 - this.sailFill;

    const g = this.sail.geometry;
    const pos = g.attributes.position, uv = g.attributes.uv;
    const H = MAST_H - BOOM_Y - 0.35;
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      // triangular outline: full foot along the boom, tapering to the head
      const chord = BOOM_LEN * 0.96 * (1 - v) * (1 + 0.18 * Math.sin(Math.PI * v)) + 0.12 * v;
      const along = u * chord;
      const belly = Math.sin(Math.PI * Math.pow(u, 0.75)) * (0.1 + 0.9 * Math.sin(Math.PI * Math.min(1, v * 0.9 + 0.1)));
      let x = this.sailSide * belly * 0.42 * this.sailFill * (chord / BOOM_LEN + 0.25);
      // luffing: the cloth shakes when it is not drawing
      x += Math.sin(u * 11 - t * 17 + v * 5) * 0.09 * luff * u * (1 - v * 0.5);
      // gentle life when full
      x += Math.sin(u * 5 - t * 3.1 + v * 3) * 0.012 * this.sailFill;
      pos.setXYZ(i, x * this.sailUp, 0.06 + v * H * (0.06 + 0.94 * this.sailUp), -along);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
  }
}
