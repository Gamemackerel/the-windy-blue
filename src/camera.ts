import * as THREE from 'three';
import { Input } from './input';
import { waveHeight } from './waves';

/** Third-person orbit camera that trails its subject's heading. */
export class OrbitRig {
  yawOffset = 0.35;
  pitch = 0.2;
  dist = 13;
  private heading = 0;
  private target = new THREE.Vector3();
  private ready = false;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  update(dt: number, t: number, input: Input, focus: THREE.Vector3, heading: number, height = 1.7) {
    this.yawOffset -= input.lookX * 0.0032;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.lookY * 0.0026, -0.12, 1.25);
    this.dist = THREE.MathUtils.clamp(this.dist * Math.exp(input.wheel * 0.001), 4, 60);

    if (!this.ready) { this.heading = heading; this.target.copy(focus); this.ready = true; }
    // trail the heading with some lag so turns are felt
    let dh = heading - this.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += dh * Math.min(1, dt * 1.6);
    this.target.lerp(focus, Math.min(1, dt * 8));

    const yaw = this.heading + Math.PI + this.yawOffset;
    const cp = Math.cos(this.pitch);
    const cam = this.camera;
    cam.position.set(
      this.target.x + Math.sin(yaw) * cp * this.dist,
      this.target.y + height + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(yaw) * cp * this.dist,
    );
    const floor = waveHeight(cam.position.x, cam.position.z, t) + 0.5;
    if (cam.position.y < floor) cam.position.y = floor;
    cam.lookAt(this.target.x, this.target.y + height, this.target.z);
  }
}
