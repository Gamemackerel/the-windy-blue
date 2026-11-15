import * as THREE from 'three';
import { Input } from './input';

/**
 * First-person view. yaw/pitch describe where the eye looks:
 * direction = (-sin yaw cos pitch, -sin pitch, -cos yaw cos pitch).
 * On the boat the view turns with the hull, so you keep facing the same way relative to it.
 */
export class ViewRig {
  yaw = 0;
  pitch = 0;
  /** narrowed view while aiming */
  aim = false;
  private aimK = 0;
  private lastHeading: number | null = null;
  private eye = new THREE.Vector3();
  private ready = false;
  private bobT = 0;
  private bobAmt = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  snap() { this.ready = false; this.lastHeading = null; }

  /** eye: where the head is. heading: the boat's heading while sailing, else null. speed: walking speed, for head bob. */
  update(dt: number, input: Input, eye: THREE.Vector3, heading: number | null, speed: number) {
    const sens = this.aim ? 0.0016 : 0.0026;
    this.yaw -= input.lookX * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.lookY * sens, -1.45, 1.45);

    if (heading !== null) {
      if (this.lastHeading !== null) this.yaw += Math.atan2(Math.sin(heading - this.lastHeading), Math.cos(heading - this.lastHeading));
      this.lastHeading = heading;
    } else this.lastHeading = null;

    this.aimK += ((this.aim ? 1 : 0) - this.aimK) * Math.min(1, dt * 9);
    const fov = 62 - 24 * this.aimK;
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }

    // the head follows the body closely but not rigidly, which takes the edge off steps and swell
    if (!this.ready) { this.eye.copy(eye); this.ready = true; }
    this.eye.x = eye.x; this.eye.z = eye.z;
    this.eye.y += (eye.y - this.eye.y) * Math.min(1, dt * 14);

    // a little bob with each step
    this.bobAmt += ((speed > 0.2 ? Math.min(1, speed / 2.2) : 0) - this.bobAmt) * Math.min(1, dt * 6);
    this.bobT += dt * (5.2 + speed * 1.5);
    const bobY = Math.sin(this.bobT * 2) * 0.022 * this.bobAmt, bobX = Math.sin(this.bobT) * 0.012 * this.bobAmt;

    const cp = Math.cos(this.pitch);
    const dx = -Math.sin(this.yaw) * cp, dy = -Math.sin(this.pitch), dz = -Math.cos(this.yaw) * cp;
    const cam = this.camera;
    cam.position.set(this.eye.x + Math.cos(this.yaw) * bobX, this.eye.y + bobY, this.eye.z - Math.sin(this.yaw) * bobX);
    cam.lookAt(cam.position.x + dx, cam.position.y + dy, cam.position.z + dz);
  }
}
