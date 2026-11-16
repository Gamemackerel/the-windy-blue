// The sailboat: generated geometry, buoyancy on the wave surface, and the
// glue between the sailing model and what is drawn.
//
// Local frame: +Z forward, +Y up, +X port.
import * as THREE from 'three';
import { createSailState, stepSailing, SailState, SailInput } from './sailing';
import { waveHeight, rogue, rogueHeight } from './waves';
import { Wind } from './wind';
import { World, Mooring } from './world';
import { MAT, patch } from './materials';
import { bodyMaterial, Tube } from './figure';

const LEN = 5.2;
const _w3 = new THREE.Vector3(), _up3 = new THREE.Vector3(0, 1, 0);
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
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _xAxis = new THREE.Vector3(1, 0, 0);
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
  pos.push(0, sheer(0), stationZ(0));     // fan from the top centre, so the whole of the stern is closed
  col.push(bone.r, bone.g, bone.b);
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
  /** set when the boat has been rolled by a great wave; the main loop decides what follows */
  capsized = false;
  /** driven hard onto a reef and broken there: lies heeled over where it struck, and cannot be sailed */
  stranded = false;
  /** 0 stowed in the bow .. 1 on the bottom, for the anchor's throw and recovery */
  anchorK = 0;
  private anchor = new THREE.Group();
  private anchorLine!: THREE.Mesh;
  /** above zero while the boat is going down */
  sinking = 0;
  /** speed lost in the last grounding, for sound and feel */
  bump = 0;
  private mastParts: THREE.Object3D[] = [];
  private sheetLine!: THREE.Mesh;
  private sheet!: Tube;
  private yarns: THREE.Mesh[] = [];
  private sheetPts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  /** where the helm's hand holds the sheet, in the boat's own frame (null when nobody is aboard) */
  sheetHand: THREE.Vector3 | null = null;
  private tail = new THREE.Vector3(0.2, 0.05, -0.95);
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

    const wood = MAT.woodL, paleWood = MAT.paleWoodL, metal = MAT.dark;

    const hull = new THREE.Mesh(
      buildHull(),
      hullMaterial(),
    );
    hull.castShadow = hull.receiveShadow = true;
    this.group.add(hull);

    // ribs inside the hull, a keelson, and the knees at the thwarts
    for (let i = 1; i < 12; i++) {
      const st = 0.06 + i * 0.075;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 12; k++) { const p = hullPoint(st, -0.97 + (1.94 * k) / 12, new THREE.Vector3()); p.x *= 0.965; p.y += 0.012; pts.push(p); }
      const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.016, 5), paleWood);
      rib.scale.set(1, 1, 1);
      this.group.add(rib);
    }
    {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 10; k++) { const p = hullPoint(0.03 + 0.9 * (k / 10), 0.0001, new THREE.Vector3()); p.x = 0; p.y += 0.03; pts.push(p); }
      this.group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.03, 5), wood));
    }
    // oarlocks, a coil of rope and a bailer
    for (const side of [1, -1]) {
      const p = hullPoint(0.42, side, new THREE.Vector3());
      const lock = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 5, 12, Math.PI), metal);
      lock.position.set(p.x, p.y + 0.035, p.z);
      lock.rotation.y = Math.PI / 2;
      this.group.add(lock);
    }
    for (let k = 0; k < 4; k++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.15 - k * 0.012, 0.014, 6, 20), MAT.rope);
      coil.rotation.x = Math.PI / 2; coil.position.set(0.3, -0.08 + k * 0.024, 1.25);
      this.group.add(coil);
    }
    const bailer = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.16, 12, 1, true), new THREE.MeshStandardMaterial({ color: '#5a2a1e', roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }));
    bailer.position.set(-0.32, -0.02, 0.5); bailer.rotation.z = 0.2;
    this.group.add(bailer);
    // the mainsheet, from the boom down to a block on the floor
    {
      const c = new THREE.Color('#fff');
      this.sheet = new Tube(this.group, MAT.rope, [{ t: 0, rx: 0.008, rz: 0.008, c }, { t: 1, rx: 0.008, rz: 0.008, c }], 26, 5, 2);
      this.sheetLine = this.sheet.mesh;
    }
    // telltales: three lengths of red yarn on the sail that show how the air is flowing over it
    for (let i = 0; i < 3; i++) {
      const g = new THREE.BoxGeometry(0.006, 0.012, 0.24);
      g.translate(0, 0, -0.12);
      const y = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#a8281a', roughness: 0.9 }));
      this.boomPivot.add(y);
      this.yarns.push(y);
    }

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
    this.mastParts.push(mast, this.boomPivot, this.sheetLine);
    // the four pale bands it was weighed by, still on it
    for (let i = 0; i < 4; i++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.068, 0.09, 10), MAT.bone);
      band.position.set(0, 0.48 + i * 0.18, MAST_Z);   // below the boom
      this.group.add(band); this.mastParts.push(band);
    }
    // the sheet's turning block, on a short post between the thwarts
    {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.44, 8), wood); post.position.set(0, 0.16, -0.72);
      const blk = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), metal); blk.position.set(0, 0.4, -0.72); blk.scale.set(0.6, 1, 1);
      this.group.add(post, blk);
    }

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
      sailMaterial(),
    );
    sg.setAttribute('tuv', new THREE.BufferAttribute(new Float32Array(uv.count * 2).map((_, i) => (i % 2 === 0 ? uv.getX(i >> 1) * 2.8 : uv.getY(i >> 1) * 5)), 2));
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

    // the hull's fixed parts (ribs, rails, thwarts, coils...) become one mesh per material
    {
      const keep = new Set<THREE.Object3D>([lid, this.sail, this.sheetLine, this.pennant, mast, ...this.mastParts]);
      const byMat = new Map<THREE.Material, THREE.Mesh[]>();
      for (const o of [...this.group.children]) {
        const m = o as THREE.Mesh;
        if (!m.isMesh || keep.has(m) || m.children.length || Array.isArray(m.material) || !m.geometry.attributes.normal) continue;
        let l = byMat.get(m.material as THREE.Material);
        if (!l) byMat.set(m.material as THREE.Material, (l = []));
        l.push(m);
      }
      for (const [mat, list] of byMat) {
        if (list.length < 2) continue;
        const pos: number[] = [], nrm: number[] = [], col: number[] = [];
        const hasCol = list.every((m) => !!m.geometry.attributes.color);
        for (const m of list) {
          m.updateMatrix();
          const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
          pos.push(...(g.attributes.position.array as Float32Array)); nrm.push(...(g.attributes.normal.array as Float32Array));
          if (hasCol) col.push(...(g.attributes.color.array as Float32Array));
          this.group.remove(m);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        if (hasCol) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        const merged = new THREE.Mesh(g, mat);
        merged.castShadow = merged.receiveShadow = true;
        this.group.add(merged);
      }
    }
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

  /** a small grapnel stowed in the bow, and the line it goes over the side on */
  private buildAnchor() {
    const iron = new THREE.MeshStandardMaterial({ color: '#1c1b1a', roughness: 0.6, metalness: 0.6 });
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.5, 8), iron); shank.position.y = 0.25;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 6, 12), iron); ring.position.y = 0.53;
    this.anchor.add(shank, ring);
    for (let i = 0; i < 4; i++) {
      const fl = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 6, 10, Math.PI * 0.55), iron);
      fl.rotation.set(0, (i / 4) * Math.PI * 2, Math.PI * 1.0); fl.position.set(Math.cos((i / 4) * Math.PI * 2) * -0.13, 0.02, Math.sin((i / 4) * Math.PI * 2) * 0.13);
      this.anchor.add(fl);
    }
    this.anchor.traverse((m) => { m.castShadow = true; });
    this.anchorLine = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), new THREE.MeshStandardMaterial({ color: '#8a7b5e', roughness: 1 }));
    this.anchorLine.geometry.translate(0, 0.5, 0);
    this.group.add(this.anchor, this.anchorLine);
  }
  /** the anchor goes over in an arc, takes its line down after it, and comes back the same way */
  private syncAnchor(dt: number) {
    if (!this.anchorLine) this.buildAnchor();
    const down = this.mode === 'moored' && this.mooring?.name === 'anchor';
    if (dt < 1) this.anchorK = THREE.MathUtils.clamp(this.anchorK + (down ? dt / 1.5 : -dt / 1.3), 0, 1); else this.anchorK = down ? 1 : 0;
    const k = this.anchorK, a = this.anchor;
    const toss = Math.min(1, k / 0.42), e = toss * toss * (3 - 2 * toss), sink = Math.max(0, (k - 0.42) / 0.58);
    // stowed on the bow boards -> out over the gunwale in an arc -> down through the water
    a.position.set(0.15 + 0.95 * e, 0.34 + Math.sin(e * Math.PI) * 0.75 - e * 0.5 - sink * sink * 3.2, LEN / 2 - 1.15 + 0.35 * e);
    a.rotation.set(e * 2.6 + sink * 0.5, 0, -e * 1.2);
    a.visible = k < 0.98;
    const l = this.anchorLine;
    l.visible = k > 0.03;
    if (l.visible) {
      _v.set(0.05, 0.52, LEN / 2 - 0.75);                     // made fast at the bow
      l.position.copy(_v);
      _w3.copy(a.position).sub(_v);
      const len = Math.max(0.05, _w3.length());
      l.quaternion.setFromUnitVectors(_up3, _w3.multiplyScalar(1 / len));
      l.scale.set(1, len, 1);
    }
  }

  /** keep the hull out of land and structures; grounding scrapes rather than sinks */
  private collide(world: World, px: number, pz: number) {
    const s = this.state;
    this.bump = 0;
    const sn = Math.sin(s.psi), cs = Math.cos(s.psi);
    for (const off of [2.2, 0, -2.0]) {
      const x = s.x + sn * off, z = s.z + cs * off;
      if (world.terrainHeight(x, z) > -0.5) {
        // aground: back off to where we were
        this.bump = Math.abs(s.u);
        s.x = px; s.z = pz;
        s.u *= -0.25; s.v = 0;
        return;
      }
      _v.set(x, -0.3, z);
      world.resolve(_v, 1.0, 1.0);
      const dx = _v.x - x, dz = _v.z - z;
      if (Math.abs(dx) + Math.abs(dz) > 1e-4) {
        // against something solid: slide along it, losing way
        this.bump = Math.abs(s.u);
        s.x += dx; s.z += dz;
        s.u *= 0.9; s.v = 0;
      }
    }
  }

  private patches: THREE.Mesh[] = [];
  /** rough repairs from each time the boat has been lost */
  setPatches(n: number) {
    const spots: [number, number, number][] = [[0.35, 0.6, 0.2], [0.6, -0.7, 0.35], [0.22, -0.55, 0.1], [0.75, 0.75, 0.3], [0.48, 0.3, -0.05], [0.12, 0.8, 0.25], [0.66, -0.35, 0.05], [0.3, -0.85, 0.3]];
    while (this.patches.length < Math.min(n, spots.length)) {
      const [s, u, tilt] = spots[this.patches.length];
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.03), MAT.paleWood);
      hullPoint(s, u, m.position);
      m.position.x *= 1.03;
      m.rotation.set(tilt, Math.PI / 2 - u * 0.25, tilt * 2);
      m.castShadow = true;
      this.group.add(m);
      this.patches.push(m);
    }
  }

  /** world position of a point given in the boat's local frame */
  local(x: number, y: number, z: number, out: THREE.Vector3) {
    return this.group.localToWorld(out.set(x, y, z));
  }
  /** where the helm sits: on the windward side, aft */
  seat(out: THREE.Vector3, side: number) { return this.local(-0.42 * side, 0.36, -1.22, out); }   // forward of the tiller's sweep
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
    // only a great wave taken on the beam, near its crest, rolls the boat; no ordinary sea or wind can
    if (this.mode === 'sailing' && dt < 1) {
      const beamOn = 1 - Math.abs(sn * rogue.dx + cs * rogue.dz);
      if (rogueHeight(s.x, s.z) > 6.5 && beamOn > 0.5) this.capsized = true;
    }

    if (this.sinking > 0) this.sinking += dt;
    const down = this.sinking > 0 ? (this.sinking - 1) : 0;
    this.group.position.set(s.x, this.y + 0.06 - down * 1.6, s.z);
    this.group.rotation.set(-this.pitch - down * 0.5, s.psi, this.roll - s.heel + down * 0.9);
    if (this.stranded) { this.group.position.y = 0.25; this.group.rotation.set(0.08, s.psi, 0.5); }
    this.syncAnchor(dt);
    this.boomPivot.rotation.y = -s.boom;
    this.rudderPivot.rotation.y = -s.rudder * 0.5;
    // mainsheet: from the boom to its block, taut when the sail is drawing, hanging in a slack curve when it is not
    const P = this.sheetPts, slack = 0.06 + (1 - this.sailFill) * 0.3 * Math.min(1, s.sheet);
    P[0].set(Math.sin(s.boom) * 1.7, BOOM_Y - 0.03, MAST_Z - Math.cos(s.boom) * 1.7);
    // boom -> block on its post (high enough that the line clears the gunwale) -> the hand that holds it
    P[3].set(0, 0.41, -0.72);
    const sway = Math.sin(t * 2.7) * slack * 0.35;
    P[1].copy(P[0]).lerp(P[3], 0.33); P[1].y -= slack * 0.5; P[1].x += sway;
    P[2].copy(P[0]).lerp(P[3], 0.66); P[2].y -= slack * 0.55; P[2].x += sway * 0.7;
    this.tail.lerp(this.sheetHand ?? _v.set(0.2, 0.05, -0.95), Math.min(1, dt * 14));      // let go, the end lies on the boards
    P[5].copy(this.tail);
    P[4].copy(P[3]).lerp(P[5], 0.5); P[4].y -= 0.04;
    this.sheet.update(P, _xAxis, _xAxis);
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
    const blow = Math.min(1.7, s.aws / 9);
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
      // the leech (the free edge) never stops trembling in a breeze, and the whole sail breathes with the gusts
      x += Math.sin(v * 21 - t * (14 + blow * 9)) * 0.02 * blow * u * u * u * (0.35 + this.sailFill);
      x += Math.sin(u * 3.2 - t * 1.7 + v * 2.0) * 0.03 * blow * this.sailFill * Math.sin(Math.PI * u) * this.sailSide;
      pos.setXYZ(i, x * this.sailUp, 0.06 + v * H * (0.06 + 0.94 * this.sailUp), -along);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    // yarns: streaming straight aft when the trim is right, lifting and flicking when the sail luffs, hanging when it stalls
    const SU1 = 13;
    this.yarns.forEach((y, i) => {
      const row = [5, 8, 11][i], col = 3, vi = (16 - row) * SU1 + col;      // rows run top to bottom in the plane
      y.position.set(pos.getX(vi) + this.sailSide * 0.015, pos.getY(vi), pos.getZ(vi));
      y.visible = this.sailUp > 0.9;
      const trim = s.alpha / 0.33;
      if (this.sailFill < 0.4) y.rotation.set(Math.sin(t * 23 + i * 2) * 0.9, Math.sin(t * 17 + i) * 0.7, 0);
      else if (trim > 1.9) y.rotation.set(-1.15 + Math.sin(t * 9 + i) * 0.3, Math.sin(t * 6 + i) * 0.4, 0);
      else y.rotation.set(Math.sin(t * 31 + i) * 0.07, Math.sin(t * 27 + i * 2) * 0.07, 0);
    });
  }
}

/** clinker planking: overlapping strakes, worn paint, grime at the waterline */
function hullMaterial() {
  return patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }), /* glsl */ `
    float girth = wp.y * 1.0 + abs(wp.x) * 0.55;
    float st = fract(girth / 0.1);
    float lap = smoothstep(0.0, 0.08, st) * (1.0 - smoothstep(0.92, 1.0, st));
    float board = hash21(vec2(floor(girth / 0.1), 3.0));
    float grain = fbm(vec2(wp.z * 1.5, girth * 40.0));
    float flake = smoothstep(0.56, 0.7, fbm(vec2(wp.z * 2.2 + board * 9.0, girth * 9.0)));
    vec3 bare = vec3(0.23, 0.18, 0.13) * (0.6 + 0.7 * grain);
    col *= (0.8 + 0.3 * board) * (0.85 + 0.3 * grain);
    col = mix(col, bare, flake * 0.75);
    col *= mix(0.45, 1.0, lap);
    float weed = smoothstep(0.16, 0.0, abs(wp.y - 0.02)) * (0.5 + 0.5 * fbm(vec2(wp.z * 6.0, 1.0)));
    col = mix(col, vec3(0.07, 0.085, 0.05), weed * 0.6);
    rough = mix(rough, 0.95, flake) - weed * 0.3;
    bump = st * 0.014 + grain * 0.002 - flake * 0.002;`, 'hull', true);
}

/** canvas: woven, seamed, stained, and glowing a little when the sun is behind it */
function sailMaterial() {
  const m = bodyMaterial('cloth', THREE.DoubleSide);
  m.roughness = 0.95;
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      // light coming through the cloth from the far side
      #if NUM_DIR_LIGHTS > 0
        float through = max(dot(-normal, directionalLights[0].direction), 0.0);
        outgoingLight += diffuseColor.rgb * directionalLights[0].color * through * 0.22;
      #endif
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'sail';
  return m;
}
