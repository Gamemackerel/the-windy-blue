// Kit-of-parts helpers: every structure in the game is assembled from these,
// with collision added at the same time as the visible mesh.
import * as THREE from 'three';
import { World } from './world';

export class Builder {
  constructor(readonly scene: THREE.Object3D, readonly world: World, readonly ox = 0, readonly oy = 0, readonly oz = 0) {}

  /** child builder that adds into a group (no automatic collision offset change) */
  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(this.ox + x, this.oy + y, this.oz + z);
    m.castShadow = shadow; m.receiveShadow = true;
    m.userData.static = true; // may be merged with its neighbours; set false on anything that will move
    this.scene.add(m);
    return m;
  }
  /** box given by centre and full size; solid unless noCollide */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: THREE.Material, yaw = 0, collide = true) {
    const m = this.mesh(new THREE.BoxGeometry(sx, sy, sz), mat, x, y, z);
    m.rotation.y = yaw;
    if (collide) this.world.addBox(this.ox + x, this.oy + y, this.oz + z, sx / 2, sy / 2, sz / 2, yaw);
    return m;
  }
  /** vertical cylinder from y0 to y1 */
  cyl(x: number, z: number, r: number, y0: number, y1: number, mat: THREE.Material, collide = true, rTop = r, seg = 20) {
    const m = this.mesh(new THREE.CylinderGeometry(rTop, r, y1 - y0, seg), mat, x, (y0 + y1) / 2, z);
    if (collide) this.world.addCyl(this.ox + x, this.oz + z, Math.max(r, rTop), this.oy + y0, this.oy + y1);
    return m;
  }
  /** thin bar between two points (pipes, rails, cables) */
  bar(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, mat: THREE.Material, seg = 6) {
    const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
    const m = this.mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg), mat, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    // pipework: a rounded knuckle at each end, so runs that meet at a corner join as elbows instead of open cut ends
    if (r >= 0.05) for (const [x, y, z] of [[ax, ay, az], [bx, by, bz]]) this.mesh(new THREE.SphereGeometry(r * 1.02, Math.max(seg, 8), 6), mat, x, y, z);
    return m;
  }
  /** wooden crate: a box with battens along every edge and a brace across each side */
  crate(x: number, y0: number, z: number, s: number, mat: THREE.Material, trim: THREE.Material, yaw = 0, collide = true) {
    const g = new THREE.Group();
    g.position.set(this.ox + x, this.oy + y0 + s / 2, this.oz + z);
    g.rotation.y = yaw;
    const add = (sx: number, sy: number, sz: number, px: number, py: number, pz: number, m: THREE.Material, rz = 0, rx = 0) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
      o.position.set(px, py, pz); o.rotation.set(rx, 0, rz);
      g.add(o);
    };
    const t = Math.max(0.035, s * 0.075), h = s / 2, e = h - t / 2 + 0.006, L = s + 0.012;
    add(s, s, s, 0, 0, 0, mat);
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      add(L, t, t, 0, a * e, b * e, trim); add(t, L, t, a * e, 0, b * e, trim); add(t, t, L, a * e, b * e, 0, trim);
    }
    // diagonal braces on the four sides
    const d = (s - t * 2) * 1.38;
    for (const a of [-1, 1]) { add(d, t * 0.8, t * 0.5, 0, 0, a * (h + 0.004), trim, a * 0.785); add(t * 0.5, t * 0.8, d, a * (h + 0.004), 0, 0, trim, 0, a * 0.785); }
    this.flatten(g);
    if (collide) this.world.addBox(this.ox + x, this.oy + y0 + s / 2, this.oz + z, s / 2, s / 2, s / 2, yaw);
  }
  /** oil drum: rolled rims top and bottom, two ribs, a recessed lid and a bung */
  drum(x: number, z: number, y0: number, mat: THREE.Material, trim: THREE.Material, r = 0.29, h = 0.88, collide = true, tilt = 0) {
    const g = new THREE.Group();
    g.position.set(this.ox + x, this.oy + y0, this.oz + z);
    if (tilt) { g.rotation.set(Math.PI / 2, 0, tilt); g.position.y += r; }
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20, 1, true), mat);
    body.position.y = h / 2;
    g.add(body);
    for (const [y, rr] of [[0.012, 0.018], [h - 0.012, 0.018], [h * 0.34, 0.012], [h * 0.66, 0.012]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r + rr * 0.3, rr, 6, 22), trim);
      ring.rotation.x = Math.PI / 2; ring.position.y = y;
      g.add(ring);
    }
    for (const y of [h - 0.03, 0.0]) { const lid = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.012, r - 0.012, 0.012, 20), trim); lid.position.y = y; g.add(lid); }
    const bung = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 8), trim);
    bung.position.set(r * 0.55, h - 0.018, 0);
    g.add(bung);
    this.flatten(g);
    if (collide) this.world.addCyl(this.ox + x, this.oz + z, tilt ? h / 2 : r, this.oy + y0, this.oy + y0 + (tilt ? r * 2 : h));
  }
  /** edge trim for a building: corner posts, a plinth and an eaves band round a box footprint */
  trim(x: number, y0: number, z: number, sx: number, sy: number, sz: number, mat: THREE.Material, t = 0.14) {
    const hx = sx / 2, hz = sz / 2;
    for (const a of [-1, 1]) for (const c of [-1, 1]) this.box(x + a * hx, y0 + sy / 2, z + c * hz, t, sy + 0.02, t, mat, 0, false);
    for (const [y, th] of [[y0 + 0.11, 0.22], [y0 + sy - 0.09, 0.18]] as const) {
      for (const a of [-1, 1]) {
        this.box(x, y, z + a * hz, sx + t, th, t * 0.75, mat, 0, false);
        this.box(x + a * hx, y, z, t * 0.75, th, sz + t, mat, 0, false);
      }
    }
  }
  /** turn a built-up group into loose fixed meshes so they can be merged with their neighbours */
  flatten(g: THREE.Object3D) {
    g.updateMatrixWorld(true);
    const list: THREE.Mesh[] = [];
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) list.push(o as THREE.Mesh); });
    for (const m of list) {
      const geo = m.geometry.clone();
      geo.applyMatrix4(m.matrixWorld);
      const out = new THREE.Mesh(geo, m.material);
      out.castShadow = true; out.receiveShadow = true;
      out.userData.static = true;
      this.scene.add(out);
    }
  }
  /** staircase rising along local +Z from (x, y0, z) : visible steps plus one ramp collider */
  stairs(x: number, y0: number, z: number, width: number, rise: number, run: number, yaw: number, mat: THREE.Material, steps = Math.max(2, Math.round(rise / 0.19))) {
    const g = new THREE.Group();
    g.position.set(this.ox + x, this.oy + y0, this.oz + z);
    g.rotation.y = yaw;
    const sh = rise / steps, sd = run / steps;
    for (let i = 0; i < steps; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(width, sh * (i + 1), sd), mat);
      s.position.set(0, (sh * (i + 1)) / 2, sd * (i + 0.5));
      s.castShadow = s.receiveShadow = true;
      g.add(s);
    }
    this.scene.add(g);
    // ramp collider centred on the flight
    const cx = this.ox + x + Math.sin(yaw) * (run / 2), cz = this.oz + z + Math.cos(yaw) * (run / 2);
    this.world.addBox(cx, this.oy + y0 - 0.25, cz, width / 2, 0.25, run / 2, yaw, rise);
    return g;
  }
  /** handrail along a straight edge */
  rail(ax: number, az: number, bx: number, bz: number, y: number, mat: THREE.Material, h = 1.05) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 1.6));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      this.bar(ax + (bx - ax) * k, y, az + (bz - az) * k, ax + (bx - ax) * k, y + h, az + (bz - az) * k, 0.025, mat, 5);
    }
    this.bar(ax, y + h, az, bx, y + h, bz, 0.03, mat, 5);
    this.bar(ax, y + h * 0.5, az, bx, y + h * 0.5, bz, 0.02, mat, 5);
    const yaw = Math.atan2(bx - ax, bz - az);
    this.world.addBox(this.ox + (ax + bx) / 2, this.oy + y + h / 2, this.oz + (az + bz) / 2, 0.06, h / 2, len / 2, yaw);
  }
}

/**
 * Fold the thousands of small fixed parts (rails, rungs, bars, crates) into a
 * few meshes per material and neighbourhood. Call once, after everything is built.
 */
export function mergeStatic(scene: THREE.Scene, cell = 120) {
  const groups = new Map<string, THREE.Mesh[]>();
  for (const o of scene.children) {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.userData.static || m.children.length || (m as any).isInstancedMesh) continue;
    const mat = m.material as THREE.Material;
    if (Array.isArray(m.material) || mat.transparent || !m.visible || m.renderOrder !== 0) continue;
    const g = m.geometry;
    if (!g.attributes.normal || !g.attributes.uv) continue;
    const key = `${mat.uuid}|${m.castShadow}|${Math.round(m.position.x / cell)}|${Math.round(m.position.z / cell)}`;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(m);
  }
  let before = 0, after = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrixWorld();
      let g = m.geometry.clone();
      if (g.index) g = g.toNonIndexed();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      g.applyMatrix4(m.matrixWorld);
      return g;
    });
    const merged = concat(geos);
    const mesh = new THREE.Mesh(merged, list[0].material);
    mesh.castShadow = list[0].castShadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    for (const m of list) scene.remove(m);
    before += list.length; after++;
  }
  return { before, after };
}

function concat(geos: THREE.BufferGeometry[]) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nrm.set(g.attributes.normal.array as Float32Array, o * 3);
    uv.set(g.attributes.uv.array as Float32Array, o * 2);
    o += c;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
