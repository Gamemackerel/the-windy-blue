// Prevailing wind with slow drift and gusts.
export class Wind {
  /** direction the wind blows toward, radians clockwise from +Z */
  dir = 0.35;
  speed = 9;
  /** mean strength in m/s, and how much it gusts (both set by the weather) */
  base = 8.5;
  gustiness = 0.2;
  x = 0;
  z = 0;
  private t = 0;
  private baseDir = 0.35;

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    // slow wander of a few tens of degrees, plus gusts and lulls
    this.dir = this.baseDir + Math.sin(t * 0.011) * 0.35 + Math.sin(t * 0.047 + 1.3) * 0.08;
    this.speed = this.base * (1 + this.gustiness * (Math.sin(t * 0.09) * 0.55 + Math.sin(t * 0.31 + 2.0) * 0.32 + Math.sin(t * 0.83) * 0.13));
    this.x = Math.sin(this.dir) * this.speed;
    this.z = Math.cos(this.dir) * this.speed;
  }
}
