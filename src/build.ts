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
    return m;
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
