// Static collision world and interactable registry.
//
// Characters are vertical capsules treated as circles in XZ. Colliders are
// boxes (optionally with a sloped top, for stairs and ramps) and vertical
// cylinders. Tops are walkable; sides block.
import * as THREE from 'three';

export interface BoxCollider {
  kind: 'box';
  x: number; y: number; z: number; // centre
  hx: number; hy: number; hz: number;
  yaw: number;
  /** extra height of the top at local +Z relative to local -Z (ramp) */
  rise: number;
  sin: number; cos: number;
}
export interface CylCollider {
  kind: 'cyl';
  x: number; z: number; r: number; y0: number; y1: number;
  /** hollow cylinders block from the inside too (tower walls) */
  inner?: number;
}
export type Collider = BoxCollider | CylCollider;

export type HeightFn = (x: number, z: number) => number;

export interface Interactable {
  pos: THREE.Vector3;
  radius: number;
  enabled?: () => boolean;
  use: () => void;
  /** optional: called when the player offers a held item here */
  offer?: (item: string) => boolean;
}

export interface Ladder {
  x: number; z: number; y0: number; y1: number;
  /** direction the climber faces (radians, clockwise from +Z) */
  face: number;
  /** where the climber steps off at the top / bottom */
  topExit: THREE.Vector3;
  bottomExit: THREE.Vector3;
  /** leave the top onto this ladder's own top rung height instead of y1 - 0.9 */
  through?: boolean;
}

export interface Mooring {
  x: number; z: number; psi: number;
  /** where the sailor stands after stepping off */
  dock: THREE.Vector3;
  name: string;
}

const STEP = 0.5;
const SEA_FLOOR = -40;

export class World {
  colliders: Collider[] = [];
  terrains: { fn: HeightFn; x: number; z: number; r: number }[] = [];
  interactables: Interactable[] = [];
  ladders: Ladder[] = [];
  moorings: Mooring[] = [];
  updaters: ((dt: number, t: number) => void)[] = [];

  addBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw = 0, rise = 0) {
    const c: BoxCollider = { kind: 'box', x, y, z, hx, hy, hz, yaw, rise, sin: Math.sin(yaw), cos: Math.cos(yaw) };
    this.colliders.push(c);
    return c;
  }
  addCyl(x: number, z: number, r: number, y0: number, y1: number, inner?: number) {
    const c: CylCollider = { kind: 'cyl', x, z, r, y0, y1, inner };
    this.colliders.push(c);
    return c;
  }
  remove(c: Collider) {
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
  }
  addTerrain(fn: HeightFn, x: number, z: number, r: number) {
    this.terrains.push({ fn, x, z, r });
  }

  terrainHeight(x: number, z: number) {
    let h = SEA_FLOOR;
    for (const t of this.terrains) {
      const dx = x - t.x, dz = z - t.z;
      if (dx * dx + dz * dz < t.r * t.r) h = Math.max(h, t.fn(x, z));
    }
    return h;
  }

  private boxTop(c: BoxCollider, lz: number) {
    return c.y + c.hy + (c.rise ? c.rise * (lz / (2 * c.hz) + 0.5) : 0);
  }

  /** Highest walkable surface at (x, z) that is no more than a step above feetY. */
  groundAt(x: number, z: number, feetY: number): number {
    let g = this.terrainHeight(x, z);
    const lim = feetY + STEP;
    for (const c of this.colliders) {
      if (c.kind === 'box') {
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
        if (Math.abs(lx) > c.hx || Math.abs(lz) > c.hz) continue;
        const top = this.boxTop(c, lz);
        if (top <= lim && top > g) g = top;
      } else {
        const dx = x - c.x, dz = z - c.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > c.r * c.r) continue;
        if (c.inner !== undefined && d2 < c.inner * c.inner) continue;
        if (c.y1 <= lim && c.y1 > g) g = c.y1;
      }
    }
    return g;
  }

  /** the underside of the lowest solid thing over this spot that is above chest height (Infinity under open sky) */
  ceilingAt(x: number, z: number, feetY: number): number {
    let low = Infinity;
    for (const c of this.colliders) {
      if (c.kind !== 'box' || c.rise) continue;
      const dx = x - c.x, dz = z - c.z;
      const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
      if (Math.abs(lx) > c.hx + 0.15 || Math.abs(lz) > c.hz + 0.15) continue;
      const bottom = c.y - c.hy;
      if (bottom > feetY + 1.2 && bottom < low) low = bottom;
    }
    return low;
  }

  /** Push a circle of radius r at height feetY out of anything that blocks it. Mutates p. */
  resolve(p: THREE.Vector3, r: number, height = 1.7) {
    const feet = p.y, head = p.y + height;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        if (c.kind === 'box') {
          const dx = p.x - c.x, dz = p.z - c.z;
          const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
          if (Math.abs(lx) > c.hx + r || Math.abs(lz) > c.hz + r) continue;
          const top = this.boxTop(c, Math.max(-c.hz, Math.min(c.hz, lz)));
          if (top <= feet + STEP || c.y - c.hy >= head) continue;
          // closest point on the rectangle
          const cx = Math.max(-c.hx, Math.min(c.hx, lx)), cz = Math.max(-c.hz, Math.min(c.hz, lz));
          let ox = lx - cx, oz = lz - cz;
          let d = Math.hypot(ox, oz);
          let nlx = lx, nlz = lz;
          if (d > 1e-6) {
            if (d >= r) continue;
            nlx = cx + (ox / d) * r; nlz = cz + (oz / d) * r;
          } else {
            // inside: leave by the nearest face
            const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
            if (px < pz) nlx = Math.sign(lx || 1) * (c.hx + r);
            else nlz = Math.sign(lz || 1) * (c.hz + r);
          }
          p.x = c.x + nlx * c.cos + nlz * c.sin;
          p.z = c.z - nlx * c.sin + nlz * c.cos;
        } else {
          if (c.y1 <= feet + STEP || c.y0 >= head) continue;
          const dx = p.x - c.x, dz = p.z - c.z;
          const d = Math.hypot(dx, dz);
          if (c.inner !== undefined) {
            // a wall ring: keep the circle either inside or outside
            const mid = (c.inner + c.r) / 2;
            if (d < mid) {
              if (d > c.inner - r && d > 1e-6) { const k = (c.inner - r) / d; p.x = c.x + dx * k; p.z = c.z + dz * k; }
            } else if (d < c.r + r) { const k = (c.r + r) / d; p.x = c.x + dx * k; p.z = c.z + dz * k; }
          } else if (d < c.r + r) {
            if (d < 1e-6) { p.x += c.r + r; continue; }
            const k = (c.r + r) / d;
            p.x = c.x + dx * k; p.z = c.z + dz * k;
          }
        }
      }
    }
  }

  /** is this point inside the ground or a solid collider? (camera obstruction) */
  blocked(x: number, y: number, z: number) {
    if (this.terrainHeight(x, z) > y - 0.25) return true;
    for (const c of this.colliders) {
      if (c.kind === 'box') {
        if (c.hy < 0.6 && c.hx < 0.2) continue; // rails and thin posts do not block the view
        if (y > c.y + c.hy + c.rise || y < c.y - c.hy) continue;
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
        if (Math.abs(lx) < c.hx + 0.15 && Math.abs(lz) < c.hz + 0.15) return true;
      } else {
        if (y > c.y1 || y < c.y0 || c.r < 0.5) continue;
        const d = Math.hypot(x - c.x, z - c.z);
        if (d < c.r + 0.15 && (c.inner === undefined || d > c.inner - 0.15)) return true;
      }
    }
    return false;
  }

  /** nearest enabled interactable within reach of pos, preferring those in front */
  nearestInteractable(pos: THREE.Vector3, facing: number): Interactable | null {
    let best: Interactable | null = null, bestScore = Infinity;
    const fx = Math.sin(facing), fz = Math.cos(facing);
    for (const it of this.interactables) {
      if (it.enabled && !it.enabled()) continue;
      const dx = it.pos.x - pos.x, dz = it.pos.z - pos.z, dy = it.pos.y - (pos.y + 1);
      const d = Math.hypot(dx, dz);
      if (d > it.radius || Math.abs(dy) > 2.2) continue;
      const front = d > 0.4 ? (dx * fx + dz * fz) / d : 1;
      if (front < -0.2) continue;
      const score = d - front * 0.8;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    return best;
  }

  nearestLadder(pos: THREE.Vector3): { ladder: Ladder; atTop: boolean } | null {
    let best: { ladder: Ladder; atTop: boolean } | null = null, bd = Infinity;
    for (const l of this.ladders) {
      const d = Math.hypot(pos.x - l.x, pos.z - l.z);
      if (d < 1.3 && pos.y > l.y0 - 1 && pos.y < l.y0 + 1.2 && d < bd) { bd = d; best = { ladder: l, atTop: false }; }
      const dt = pos.distanceTo(l.topExit);
      if (dt < 1.4 && dt < bd) { bd = dt; best = { ladder: l, atTop: true }; }
    }
    return best;
  }

  private tweens: { t: number; dur: number; fn: (k: number) => void; done?: () => void }[] = [];
  /** run fn with k going 0..1 (eased) over dur seconds */
  tween(dur: number, fn: (k: number) => void, done?: () => void) {
    this.tweens.push({ t: 0, dur, fn, done });
  }
  /** call fn after a delay */
  after(delay: number, fn: () => void) { this.tween(delay, () => {}, fn); }

  update(dt: number, t: number) {
    for (const u of this.updaters) u(dt, t);
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k * k * (3 - 2 * k));
      if (k >= 1) { this.tweens.splice(i, 1); tw.done?.(); }
    }
  }
}
