// Things that float ride the swell: the houseboat, the raft, the barge and the
// floating home each heave and rock a little with the sea coming in under them.
//
// Everything built on a float is gathered into one group after the world is
// assembled, and that group is moved. What stands on a float (its people, and
// the player's eyes) is carried by the same motion.
import * as THREE from 'three';
import { swell } from './waves';
import { mergeStatic } from './build';
import { localOf } from './materials';

export interface FloatDef { name: string; x: number; z: number; hx: number; hz: number; /** how lively: 1 for a raft, less for something heavy */ live: number }
interface Float extends FloatDef { group: THREE.Group; y: number; vy: number; rx: number; rz: number; riders: { o: THREE.Object3D; base: number; skip?: () => boolean }[] }

const _box = new THREE.Box3(), _c = new THREE.Vector3();

export class Floats {
  private list: Float[] = [];

  /** gather what was built on each float. Call after everything is in the scene and before static parts are merged. */
  constructor(scene: THREE.Scene, defs: FloatDef[], skip: Set<THREE.Object3D>) {
    for (const d of defs) {
      const group = new THREE.Group();
      group.position.set(d.x, 0, d.z);
      group.rotation.order = 'XZY';
      scene.add(group);
      this.list.push({ ...d, group, y: 0, vy: 0, rx: 0, rz: 0, riders: [] });
    }
    scene.updateMatrixWorld(true);
    for (const o of [...scene.children]) {
      if (skip.has(o) || (o as any).isScene || (o as any).isCamera) continue;
      if ((o as any).isInstancedMesh && !o.userData.float) continue;
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        _box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld).getCenter(_c);
        // something much larger than a float (the sea bed, a rig) is never part of one
        if (_box.max.x - _box.min.x > 40 || _box.max.z - _box.min.z > 40) continue;
      } else if (o.type === 'Group' || (o as any).isLight || (o as any).isPoints) _c.copy(o.position);
      else continue;
      const f = o.userData.float ? this.list.find((k) => k.name === o.userData.float) : this.list.find((k) => Math.abs(_c.x - k.x) < k.hx && Math.abs(_c.z - k.z) < k.hz && _c.y > -3 && _c.y < 9);
      if (f && o !== f.group) f.group.attach(o);
    }
    for (const f of this.list) {
      mergeStatic(f.group, 1e6);
      // surface patterns travel with the hull instead of staying put in the world while it moves through them
      f.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !Array.isArray(m.material)) m.material = localOf(m.material); });
    }
  }

  /** something that stands on a float but keeps its own place in the world (a person): it is lifted with the deck */
  ride(o: THREE.Object3D, skip?: () => boolean) {
    const f = this.at(o.position.x, o.position.z);
    if (f) f.riders.push({ o, base: o.position.y, skip });
  }

  private at(x: number, z: number) { return this.list.find((k) => Math.abs(x - k.x) < k.hx && Math.abs(z - k.z) < k.hz) ?? null; }

  /** how far the deck under this spot has risen or fallen */
  lift(x: number, z: number): number {
    const f = this.at(x, z);
    return f ? this.liftOn(f, x, z) : 0;
  }
  private liftOn(f: Float, x: number, z: number) { return f.y + (z - f.z) * Math.sin(f.rx) + (x - f.x) * Math.sin(f.rz); }
  /** the tilt of the deck under this spot, as pitch about X and roll about Z (0, 0 on fixed ground) */
  tilt(x: number, z: number, out: { rx: number; rz: number }) {
    const f = this.at(x, z);
    out.rx = f ? f.rx : 0; out.rz = f ? f.rz : 0;
    return out;
  }

  update(dt: number, t: number) {
    const h = Math.min(dt, 1 / 20);
    for (const f of this.list) {
      // the swell at the ends and sides of the hull sets where it wants to lie
      const a = swell(f.x, f.z + f.hz * 0.7, t), b = swell(f.x, f.z - f.hz * 0.7, t), c = swell(f.x + f.hx * 0.7, f.z, t), d = swell(f.x - f.hx * 0.7, f.z, t);
      const wantY = THREE.MathUtils.clamp(((a + b + c + d) / 4) * 0.3 * f.live, -0.45, 0.45);
      const wantRx = THREE.MathUtils.clamp(Math.atan2(a - b, f.hz * 1.4) * 0.45 * f.live, -0.07, 0.07);
      const wantRz = THREE.MathUtils.clamp(Math.atan2(c - d, f.hx * 1.4) * 0.45 * f.live, -0.07, 0.07);
      // a heavy thing: it follows with a lag and a little overshoot
      f.vy += ((wantY - f.y) * 9 - f.vy * 3.2) * h;
      f.y += f.vy * h;
      f.rx += (wantRx - f.rx) * Math.min(1, h * 2.2);
      f.rz += (wantRz - f.rz) * Math.min(1, h * 2.2);
      f.group.position.y = f.y;
      f.group.rotation.x = -f.rx; f.group.rotation.z = f.rz;   // rx is bow-up, rz is +x side up
      for (const r of f.riders) if (!r.skip?.()) r.o.position.y = r.base + this.liftOn(f, r.o.position.x, r.o.position.z);
    }
  }
}
