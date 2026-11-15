// Prevailing wind with slow drift and gusts.
export class Wind {
  /** direction the wind blows toward, radians clockwise from +Z */
  dir = 0.35;
  speed = 9;
  x = 0;
  z = 0;
  private t = 0;
  private baseDir = 0.35;

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    // slow wander of a few tens of degrees, plus gusts and lulls
    this.dir = this.baseDir + Math.sin(t * 0.011) * 0.35 + Math.sin(t * 0.047 + 1.3) * 0.08;
    this.speed = 8.5 + Math.sin(t * 0.09) * 1.2 + Math.sin(t * 0.31 + 2.0) * 0.7 + Math.sin(t * 0.83) * 0.3;
    this.x = Math.sin(this.dir) * this.speed;
    this.z = Math.cos(this.dir) * this.speed;
  }
}
