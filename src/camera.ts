import * as THREE from 'three';
import { Input } from './input';
import { waveHeight } from './waves';
import { World } from './world';

/** Third-person orbit camera. On the boat it trails the heading; on foot it is free. */
export class OrbitRig {
  yaw = 0;
  pitch = 0.2;
  dist = 13;
  /** distance the current situation wants (the wheel still adjusts it) */
  wantDist = 13;
  height = 1.7;
  private lastHeading: number | null = null;
  private target = new THREE.Vector3();
  private ready = false;
  private h = 1.7;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  snap() { this.ready = false; this.lastHeading = null; }

  update(dt: number, t: number, input: Input, focus: THREE.Vector3, heading: number | null, world: World) {
    this.yaw -= input.lookX * 0.0032;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.lookY * 0.0026, -0.35, 1.3);
    this.wantDist = THREE.MathUtils.clamp(this.wantDist * Math.exp(input.wheel * 0.001), 2.2, 60);
    this.dist += (this.wantDist - this.dist) * Math.min(1, dt * 3);
    this.h += (this.height - this.h) * Math.min(1, dt * 3);

    if (heading !== null) {
      if (this.lastHeading !== null) {
        const dh = Math.atan2(Math.sin(heading - this.lastHeading), Math.cos(heading - this.lastHeading));
        this.yaw += dh * 0.85; // turns are felt, but the view mostly stays behind the boat
      }
      this.lastHeading = heading;
    } else this.lastHeading = null;

    if (!this.ready) { this.target.copy(focus); this.ready = true; }
    this.target.lerp(focus, Math.min(1, dt * 9));

    const cp = Math.cos(this.pitch);
    const cam = this.camera;
    const tx = this.target.x, ty = this.target.y + this.h, tz = this.target.z;
    const dx = Math.sin(this.yaw) * cp, dy = Math.sin(this.pitch), dz = Math.cos(this.yaw) * cp;
    // pull in if the ground or a wall is in the way
    let d = this.dist;
    for (let i = 1; i <= 8; i++) {
      const k = (this.dist * i) / 8;
      const x = tx + dx * k, y = ty + dy * k, z = tz + dz * k;
      if (world.blocked(x, y, z)) { d = Math.max(0.6, k - this.dist / 8 - 0.15); break; }
    }
    cam.position.set(tx + dx * d, ty + dy * d, tz + dz * d);
    const floor = Math.max(waveHeight(cam.position.x, cam.position.z, t) + 0.45, world.terrainHeight(cam.position.x, cam.position.z) + 0.4);
    if (cam.position.y < floor) cam.position.y = floor;
    cam.lookAt(tx, ty, tz);
  }
}
