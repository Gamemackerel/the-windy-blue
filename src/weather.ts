// Weather: one number, the sea level, wandering slowly between glass calm and
// a full storm. Everything else follows from it: wave height, whitecaps, wind
// strength, how dark the sky is, and whether a great wave might come.
import * as THREE from 'three';
import { setSeaLevel, rogue } from './waves';
import { Wind } from './wind';
import { Environment } from './env';
import { rng } from './noise';

export class Weather {
  /** 0 glass, about 0.35 a pleasant sailing breeze, 1 the worst storm */
  level = 0.32;
  target = 0.32;
  /** seconds until the weather next makes up its mind */
  hold = 240;
  /** if set, the weather stays exactly here (testing) */
  fixed: number | null = null;
  private r = rng((Date.now() & 0xffff) + 7);
  private rogueIn = 120;
  private rogueSpeed = 17;
  /** called once when a great wave has been raised */
  onRogue: (() => void) | null = null;

  /** choose what the weather will do next: mostly fair, sometimes rough, seldom a storm */
  private decide() {
    const k = this.r();
    this.target = k < 0.18 ? 0.02 + this.r() * 0.08       // glass
      : k < 0.48 ? 0.14 + this.r() * 0.14                  // light airs
      : k < 0.8 ? 0.3 + this.r() * 0.16                    // a good breeze
      : k < 0.94 ? 0.52 + this.r() * 0.2                   // rough
      : 0.86 + this.r() * 0.14;                            // storm
    this.hold = 200 + this.r() * 320;
  }

  /** raise a great wave that will pass through (x, z), travelling down the wind */
  raise(x: number, z: number, wind: Wind, amp = 9 + this.r() * 5) {
    rogue.dx = Math.sin(wind.dir); rogue.dz = Math.cos(wind.dir);
    rogue.off = rogue.dx * x + rogue.dz * z - 520;        // starts half a kilometre upwind
    rogue.amp = amp;
    this.onRogue?.();
  }

  update(dt: number, wind: Wind, env: Environment, focus: THREE.Vector3) {
    if (this.fixed !== null) this.level = this.target = this.fixed;
    else {
      this.hold -= dt;
      if (this.hold <= 0) this.decide();
      // weather builds over a few minutes and eases off about as slowly
      const d = this.target - this.level;
      this.level += Math.sign(d) * Math.min(Math.abs(d), dt * 0.0045);
    }
    const L = this.level;
    setSeaLevel(L);
    wind.base = 3 + 20 * Math.pow(L, 1.2);
    wind.gustiness = 0.12 + 0.3 * L;
    env.gloom = THREE.MathUtils.smoothstep(L, 0.5, 0.95);

    // the great wave: only in a real storm, and not often
    if (rogue.amp > 0) {
      rogue.off += this.rogueSpeed * dt;
      const past = rogue.off - (rogue.dx * focus.x + rogue.dz * focus.z);
      if (past > 700) { rogue.amp = 0; rogue.off = -1e7; }
    } else if (L > 0.82 && this.fixed === null) {
      this.rogueIn -= dt;
      if (this.rogueIn <= 0) { this.rogueIn = 100 + this.r() * 200; this.raise(focus.x, focus.z, wind); }
    }
  }
}
