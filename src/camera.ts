import * as THREE from 'three';
import { Input } from './input';
import { waveHeight } from './waves';

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
  /** eye to a telescope: a very narrow view that moves slowly */
  scope = false;
  /** the telescope's field of view in degrees (mouse wheel), and the eased value actually shown */
  scopeFov = 4.2;
  private scopeNow = 4.2;
  private aimK = 0;
  private lastHeading: number | null = null;
  private eye = new THREE.Vector3();
  private ready = false;
  private bobT = 0;
  private bobAmt = 0;
  /** 0 behind the eyes, 1 pulled back behind the boat */
  third = 0;
  /** how far back the camera sits when pulled out (mouse wheel) */
  dist = 11;
  private tgt = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  snap() { this.ready = false; this.lastHeading = null; }

  /** eye: where the head is. heading: the boat's heading while sailing, else null. speed: walking speed, for head bob. */
  /** follow: when given, the camera pulls back and orbits this point (the boat) instead of sitting at the eye */
  update(dt: number, t: number, input: Input, eye: THREE.Vector3, heading: number | null, speed: number, follow: THREE.Vector3 | null = null) {
    if (this.scope) this.scopeFov = THREE.MathUtils.clamp(this.scopeFov * Math.exp(input.wheel * 0.0015), 1.2, 22);
    this.scopeNow += (this.scopeFov - this.scopeNow) * Math.min(1, dt * 10);
    const sens = this.scope ? 0.000052 * this.scopeNow : this.aim ? 0.0016 : 0.0026;
    this.yaw -= input.lookX * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.lookY * sens, -1.45, 1.45);
    if (follow) this.dist = THREE.MathUtils.clamp(this.dist * Math.exp(input.wheel * 0.001), 4.5, 45);
    this.third += ((follow ? 1 : 0) - this.third) * Math.min(1, dt * 2.6);
    if (this.third < 0.002) this.third = 0;

    if (heading !== null) {
      if (this.lastHeading !== null) this.yaw += Math.atan2(Math.sin(heading - this.lastHeading), Math.cos(heading - this.lastHeading));
      this.lastHeading = heading;
    } else this.lastHeading = null;

    this.aimK += ((this.aim ? 1 : 0) - this.aimK) * Math.min(1, dt * 9);
    const fov = this.scope ? this.scopeNow : 62 - 24 * this.aimK - 8 * this.third;
    if (Math.abs(this.camera.fov - fov) > 0.005 * fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }

    // the head follows the body closely but not rigidly, which takes the edge off steps and swell
    if (!this.ready) { this.eye.copy(eye); this.ready = true; }
    this.eye.x = eye.x; this.eye.z = eye.z;
    this.eye.y += (eye.y - this.eye.y) * Math.min(1, dt * 14);

    // a little bob with each step
    if (this.scope) this.bobAmt = 0;
    this.bobAmt += ((speed > 0.2 ? Math.min(1, speed / 2.2) : 0) - this.bobAmt) * Math.min(1, dt * 6);
    this.bobT += dt * (5.2 + speed * 1.5);
    const bobY = Math.sin(this.bobT * 2) * 0.022 * this.bobAmt, bobX = Math.sin(this.bobT) * 0.012 * this.bobAmt;

    const cp = Math.cos(this.pitch);
    const dx = -Math.sin(this.yaw) * cp, dy = -Math.sin(this.pitch), dz = -Math.cos(this.yaw) * cp;
    const cam = this.camera;
    cam.position.set(this.eye.x + Math.cos(this.yaw) * bobX, this.eye.y + bobY, this.eye.z - Math.sin(this.yaw) * bobX);
    if (this.third > 0) {
      // out behind the boat, looking along the same line, so it stays in the middle of the view
      if (follow) this.tgt.lerp(follow, this.third < 0.05 ? 1 : Math.min(1, dt * 9));
      const k = this.third * this.third * (3 - 2 * this.third);
      const px = this.tgt.x - dx * this.dist, pz = this.tgt.z - dz * this.dist;
      const py = Math.max(this.tgt.y + 1.9 - dy * this.dist, waveHeight(px, pz, t) + 0.6);
      cam.position.x += (px - cam.position.x) * k; cam.position.y += (py - cam.position.y) * k; cam.position.z += (pz - cam.position.z) * k;
    }
    cam.lookAt(cam.position.x + dx, cam.position.y + dy, cam.position.z + dz);
  }
}
