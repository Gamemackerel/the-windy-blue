// A procedural human figure. A pose is a set of joint positions; the body is
// drawn as capsules stretched between them. Animation writes joint positions
// with gait cycles and two-bone IK, and the same joints can be handed to a
// ragdoll simulation, so there are no authored clips anywhere.
import * as THREE from 'three';

export const J = {
  hips: 0, chest: 1, head: 2,
  shL: 3, elL: 4, haL: 5,
  shR: 6, elR: 7, haR: 8,
  hipL: 9, knL: 10, ftL: 11,
  hipR: 12, knR: 13, ftR: 14,
  COUNT: 15,
} as const;

// proportions (m)
const HIP_Y = 0.96, CHEST_Y = 1.44, HEAD_Y = 1.66;
const SH_W = 0.2, HIP_W = 0.1;
const UARM = 0.3, FARM = 0.28, THIGH = 0.46, SHIN = 0.48;
export const LIMB = { UARM, FARM, THIGH, SHIN, HIP_Y, CHEST_Y, HEAD_Y, SH_W, HIP_W };

export interface FigureLook {
  coat: string; trousers: string; skin: string; hood: boolean; hat?: boolean; scale?: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Vector3(), _eul = new THREE.Euler();

/** Two-bone IK: returns the middle joint for a chain from root to target, bent toward pole. */
export function solveIK(root: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, outMid: THREE.Vector3, outEnd?: THREE.Vector3) {
  _a.subVectors(target, root);
  let d = _a.length();
  const max = (l1 + l2) * 0.999;
  if (d > max) { _a.multiplyScalar(max / d); d = max; }
  if (d < 1e-4) { _a.set(0, -1e-4, 0); d = 1e-4; }
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  _b.copy(_a).multiplyScalar(1 / d);
  // pole direction orthogonal to the chain axis
  _c.copy(pole).addScaledVector(_b, -pole.dot(_b));
  if (_c.lengthSq() < 1e-8) _c.set(0, 0, 1).addScaledVector(_b, -_b.z);
  _c.normalize();
  outMid.copy(root).addScaledVector(_b, along).addScaledVector(_c, h);
  if (outEnd) outEnd.copy(root).add(_a);
}

class Segment {
  mesh: THREE.Mesh;
  constructor(parent: THREE.Object3D, r0: number, r1: number, mat: THREE.Material, readonly a: number, readonly b: number) {
    // unit-length tapered capsule along +Y, origin at the start joint
    const g = new THREE.CylinderGeometry(r1, r0, 1, 10, 1);
    g.translate(0, 0.5, 0);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.castShadow = true;
    const capA = new THREE.Mesh(new THREE.SphereGeometry(r0, 10, 8), mat);
    const capB = new THREE.Mesh(new THREE.SphereGeometry(r1, 10, 8), mat);
    capB.position.y = 1;
    capA.castShadow = capB.castShadow = true;
    this.mesh.add(capA, capB);
    this.capA = capA; this.capB = capB;
    parent.add(this.mesh);
  }
  private capA: THREE.Mesh; private capB: THREE.Mesh;
  place(p: THREE.Vector3[]) {
    const a = p[this.a], b = p[this.b];
    _a.subVectors(b, a);
    const len = Math.max(_a.length(), 1e-4);
    this.mesh.position.copy(a);
    this.mesh.quaternion.setFromUnitVectors(UP, _a.multiplyScalar(1 / len));
    this.mesh.scale.set(1, len, 1);
    // keep the end caps round despite the stretch
    this.capA.scale.set(1, 1 / len, 1);
    this.capB.scale.set(1, 1 / len, 1);
  }
}

const lathe = (pts: [number, number][], seg = 18) =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

export class Figure {
  readonly group = new THREE.Group();
  /** joint positions in the figure's local space (or world space when ragdolled) */
  readonly joints: THREE.Vector3[] = [];
  private segs: Segment[] = [];
  private torso: THREE.Mesh;
  private skirt: THREE.Mesh;
  private head: THREE.Group;
  private handL: THREE.Mesh; private handR: THREE.Mesh;
  private footL: THREE.Mesh; private footR: THREE.Mesh;
  /** radians the head is turned relative to the body */
  headYaw = 0; headPitch = 0;
  readonly rightHandSlot = new THREE.Group();
  readonly mouthSlot = new THREE.Group();
  /** set false to hide the coat skirt (seated figures) */
  skirtAmount = 1;

  constructor(look: FigureLook) {
    for (let i = 0; i < J.COUNT; i++) this.joints.push(new THREE.Vector3());
    const coat = new THREE.MeshStandardMaterial({ color: look.coat, roughness: 0.78, side: THREE.DoubleSide });
    const trousers = new THREE.MeshStandardMaterial({ color: look.trousers, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.75 });
    const boot = new THREE.MeshStandardMaterial({ color: '#191715', roughness: 0.55 });
    const accent = new THREE.MeshStandardMaterial({ color: '#6e2f20', roughness: 0.95 });
    const g = this.group;

    this.segs.push(
      new Segment(g, 0.062, 0.052, coat, J.shL, J.elL), new Segment(g, 0.05, 0.046, coat, J.elL, J.haL),
      new Segment(g, 0.062, 0.052, coat, J.shR, J.elR), new Segment(g, 0.05, 0.046, coat, J.elR, J.haR),
      new Segment(g, 0.085, 0.064, trousers, J.hipL, J.knL), new Segment(g, 0.062, 0.05, boot, J.knL, J.ftL),
      new Segment(g, 0.085, 0.064, trousers, J.hipR, J.knR), new Segment(g, 0.062, 0.05, boot, J.knR, J.ftR),
    );

    // torso: a turned profile from hips up to the base of the neck, flattened front to back
    const H = CHEST_Y - HIP_Y;
    const tg = lathe([[0.001, -0.09], [0.15, -0.085], [0.172, -0.02], [0.165, 0.1], [0.152, 0.2], [0.168, 0.32], [0.192, 0.41], [0.2, 0.455], [0.17, 0.5], [0.1, 0.535], [0.062, 0.56], [0.055, 0.62]].map(([r, y]) => [r, (y / 0.48) * H] as [number, number]));
    tg.scale(1, 1, 0.66);
    this.torso = new THREE.Mesh(tg, coat);
    this.torso.castShadow = true;
    g.add(this.torso);
    // belt, and a satchel on its strap
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.014, 6, 20), boot);
    belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.68, 1); belt.position.y = 0.17;
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.011, 5, 22), boot);
    strap.scale.set(1, 1.25, 0.7); strap.rotation.set(0, 0, 0.62); strap.position.y = 0.27;
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.24), new THREE.MeshStandardMaterial({ color: '#4b3b2a', roughness: 0.9 }));
    bag.position.set(0.2, 0.02, -0.02); bag.castShadow = true;
    this.torso.add(belt, strap, bag);

    // the long coat below the belt
    const sk = lathe([[0.168, 0.04], [0.2, -0.2], [0.24, -0.44], [0.265, -0.6]], 16);
    sk.scale(1, 1, 0.92);
    this.skirt = new THREE.Mesh(sk, coat);
    this.skirt.castShadow = true;
    g.add(this.skirt);

    this.head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.098, 16, 12), skin);
    skull.scale.set(0.9, 1.12, 1);
    skull.castShadow = true;
    this.head.add(skull);
    if (look.hood) {
      // a hood with its opening facing forward, deep enough to shade the face
      const hg = new THREE.SphereGeometry(0.128, 18, 12, 0, Math.PI * 2, 0.72, Math.PI - 0.72);
      hg.rotateX(Math.PI / 2);
      const hood = new THREE.Mesh(hg, coat);
      hood.scale.set(0.98, 1.16, 1.08);
      hood.position.set(0, 0.012, -0.006);
      hood.castShadow = true;
      const brim = new THREE.Mesh(new THREE.TorusGeometry(0.094, 0.016, 6, 20), coat);
      brim.scale.set(0.98, 1.16, 1); brim.position.set(0, 0.012, 0.098);
      this.head.add(hood, brim);
    }
    if (look.hat) {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.015, 16), boot);
      brim.position.y = 0.07;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.09, 14), boot);
      crown.position.y = 0.115;
      brim.castShadow = crown.castShadow = true;
      this.head.add(brim, crown);
    }
    this.mouthSlot.position.set(0.02, -0.05, 0.1);
    this.head.add(this.mouthSlot);
    g.add(this.head);
    // scarf wound round the neck
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.042, 8, 18), accent);
    scarf.rotation.x = Math.PI / 2; scarf.scale.set(1, 0.85, 1.25); scarf.position.y = H + 0.085;
    scarf.castShadow = true;
    this.torso.add(scarf);

    const hg2 = new THREE.SphereGeometry(0.046, 8, 6);
    hg2.scale(0.8, 1.25, 1);
    this.handL = new THREE.Mesh(hg2, skin); this.handR = new THREE.Mesh(hg2, skin);
    this.handR.add(this.rightHandSlot);
    const fg = new THREE.BoxGeometry(0.095, 0.075, 0.26, 2, 1, 2);
    fg.translate(0, 0.0375, 0.055);
    this.footL = new THREE.Mesh(fg, boot); this.footR = new THREE.Mesh(fg, boot);
    for (const m of [this.handL, this.handR, this.footL, this.footR]) { m.castShadow = true; g.add(m); }
    if (look.scale) g.scale.setScalar(look.scale);
    this.setStanding();
    this.refresh(0);
  }

  /** neutral standing pose */
  setStanding() {
    const p = this.joints;
    p[J.hips].set(0, HIP_Y, 0); p[J.chest].set(0, CHEST_Y, 0); p[J.head].set(0, HEAD_Y, 0.01);
    p[J.shL].set(SH_W, CHEST_Y - 0.03, 0); p[J.shR].set(-SH_W, CHEST_Y - 0.03, 0);
    p[J.elL].set(SH_W + 0.04, CHEST_Y - 0.32, -0.02); p[J.elR].set(-SH_W - 0.04, CHEST_Y - 0.32, -0.02);
    p[J.haL].set(SH_W + 0.05, CHEST_Y - 0.6, 0.04); p[J.haR].set(-SH_W - 0.05, CHEST_Y - 0.6, 0.04);
    p[J.hipL].set(HIP_W, HIP_Y - 0.04, 0); p[J.hipR].set(-HIP_W, HIP_Y - 0.04, 0);
    p[J.knL].set(HIP_W, 0.5, 0.02); p[J.knR].set(-HIP_W, 0.5, 0.02);
    p[J.ftL].set(HIP_W, 0.03, 0); p[J.ftR].set(-HIP_W, 0.03, 0);
  }

  /** Place the body parts from the current joints. footYaw is the feet's heading in joint space. */
  refresh(footYaw: number) {
    const p = this.joints;
    for (const s of this.segs) s.place(p);

    // torso basis: up along the spine, side along the shoulder line
    const hips = p[J.hips], chest = p[J.chest];
    _a.subVectors(chest, hips);
    const len = _a.length();
    _a.normalize();
    _b.subVectors(p[J.shL], p[J.shR]).normalize();
    _c.crossVectors(_b, _a).normalize();      // forward
    _b.crossVectors(_a, _c).normalize();      // re-orthogonalised side
    _m.makeBasis(_b, _a, _c);
    this.torso.quaternion.setFromRotationMatrix(_m);
    this.torso.position.copy(hips);
    this.torso.scale.set(1, len / (CHEST_Y - HIP_Y), 1);

    // the coat hangs from the hips, drawn a little toward the knees as they move
    this.skirt.visible = this.skirtAmount > 0.01;
    if (this.skirt.visible) {
      _d.addVectors(p[J.knL], p[J.knR]).multiplyScalar(0.5).sub(hips).normalize().negate();
      _e.copy(_a).lerp(_d, 0.45).normalize();          // skirt's up axis
      _b.subVectors(p[J.hipL], p[J.hipR]).normalize();
      _c.crossVectors(_b, _e).normalize();
      _b.crossVectors(_e, _c).normalize();
      _m.makeBasis(_b, _e, _c);
      this.skirt.quaternion.setFromRotationMatrix(_m);
      this.skirt.position.copy(hips);
      // widen with the stride so the legs never poke through
      const spread = Math.abs(p[J.knL].z - p[J.knR].z);
      this.skirt.scale.set(1, this.skirtAmount, 1 + spread * 1.6);
    }

    // head sits on the spine with its own look rotation
    this.head.position.copy(p[J.head]);
    this.head.quaternion.copy(this.torso.quaternion);
    _q.setFromEuler(_eul.set(this.headPitch, this.headYaw, 0, 'YXZ'));
    this.head.quaternion.multiply(_q);

    this.handL.position.copy(p[J.haL]); this.handR.position.copy(p[J.haR]);
    this.handR.quaternion.copy(this.segs[3].mesh.quaternion);
    this.handL.quaternion.copy(this.segs[1].mesh.quaternion);
    for (const [m, ft, kn] of [[this.footL, J.ftL, J.knL], [this.footR, J.ftR, J.knR]] as const) {
      m.position.copy(p[ft]).y -= 0.03;
      // toe pitches with the shin when the foot is off the ground
      const pitch = Math.max(0, Math.min(0.9, (p[ft].y - 0.03) * 2.2)) + Math.max(-0.5, Math.min(0.5, (p[ft].z - p[kn].z) * -0.6));
      m.rotation.set(pitch, footYaw, 0, 'YXZ');
    }
  }
}

export interface GaitState {
  phase: number;    // 0..1 stride cycle
  speed: number;    // smoothed ground speed
  bob: number;
  leanF: number; leanS: number;
  idleT: number;
}
export const newGait = (): GaitState => ({ phase: 0, speed: 0, bob: 0, leanF: 0, leanS: 0, idleT: Math.random() * 10 });

const _hipL = new THREE.Vector3(), _hipR = new THREE.Vector3(), _t = new THREE.Vector3();
const POLE_KNEE = new THREE.Vector3(0, 0, 1), POLE_ELBOW = new THREE.Vector3(0, -0.3, -1);

/**
 * Walking / running / idle, written straight into the figure's joints.
 * speed is ground speed in m/s; turn is yaw rate; slopeY(dx, dz) returns the
 * ground height offset under a foot placed at local (dx, dz).
 */
export function animateGait(f: Figure, g: GaitState, dt: number, speed: number, turn: number, slopeY?: (lx: number, lz: number) => number) {
  const p = f.joints;
  g.speed += (speed - g.speed) * Math.min(1, dt * 8);
  g.idleT += dt;
  const v = g.speed;
  const moving = Math.min(1, v / 0.6);
  const run = THREE.MathUtils.smoothstep(v, 2.6, 4.4);
  const stride = 0.62 + 0.42 * Math.min(1, v / 4.5) + run * 0.25; // half-cycle step length
  if (v > 0.05) g.phase = (g.phase + (v * dt) / (2 * stride)) % 1;
  else g.phase += (Math.round(g.phase * 2) / 2 - g.phase) * Math.min(1, dt * 6);

  const breathe = Math.sin(g.idleT * 1.5) * 0.006 * (1 - moving);
  const sway = Math.sin(g.idleT * 0.6) * 0.012 * (1 - moving);
  const bob = (Math.cos(g.phase * Math.PI * 4) * 0.5 + 0.5) * (0.035 + run * 0.035) * moving;
  const crouch = 0.02 + run * 0.05 + moving * 0.015;
  g.leanF += ((0.03 + run * 0.16) * moving - g.leanF) * Math.min(1, dt * 5);
  g.leanS += (THREE.MathUtils.clamp(-turn * 0.06 * moving, -0.15, 0.15) - g.leanS) * Math.min(1, dt * 5);

  const hipY = HIP_Y - crouch + bob - 0.03;
  const twist = Math.sin(g.phase * Math.PI * 2) * 0.16 * moving;
  p[J.hips].set(sway + Math.sin(g.phase * Math.PI * 2) * 0.018 * moving, hipY, 0);
  const spine = CHEST_Y - HIP_Y;
  p[J.chest].set(p[J.hips].x * 0.5 + g.leanS * spine, hipY + spine * Math.cos(g.leanF) + breathe, Math.sin(g.leanF) * spine);
  p[J.head].set(p[J.chest].x, p[J.chest].y + (HEAD_Y - CHEST_Y), p[J.chest].z + 0.01 + g.leanF * 0.06);

  const ct = Math.cos(twist), st = Math.sin(twist);
  // shoulders counter-rotate against the hips
  p[J.shL].set(p[J.chest].x + SH_W * ct, p[J.chest].y - 0.03, p[J.chest].z + SH_W * st);
  p[J.shR].set(p[J.chest].x - SH_W * ct, p[J.chest].y - 0.03, p[J.chest].z - SH_W * st);
  _hipL.set(p[J.hips].x + HIP_W * ct, hipY - 0.04, -HIP_W * st);
  _hipR.set(p[J.hips].x - HIP_W * ct, hipY - 0.04, HIP_W * st);
  p[J.hipL].copy(_hipL); p[J.hipR].copy(_hipR);

  // feet: stance slides back under the body, swing lifts and reaches forward
  for (let side = 0; side < 2; side++) {
    const ph = (g.phase + side * 0.5) % 1;
    const x = (side === 0 ? HIP_W : -HIP_W) * (1 - run * 0.3) + p[J.hips].x * 0.3;
    let z: number, y: number;
    const stanceShare = 0.6 - run * 0.2;
    if (ph < stanceShare) {
      const k = ph / stanceShare;
      z = stride * (0.5 - k);
      y = 0;
    } else {
      const k = (ph - stanceShare) / (1 - stanceShare);
      const e = k * k * (3 - 2 * k);
      z = stride * (-0.5 + e);
      y = Math.sin(k * Math.PI) * (0.1 + run * 0.14);
    }
    z *= moving;
    y *= moving;
    const ground = slopeY ? slopeY(x, z) : 0;
    _t.set(x, 0.03 + y + ground, z);
    const hip = side === 0 ? _hipL : _hipR;
    solveIK(hip, _t, THIGH, SHIN, POLE_KNEE, p[side === 0 ? J.knL : J.knR], p[side === 0 ? J.ftL : J.ftR]);
  }

  // arms swing opposite to the legs
  for (let side = 0; side < 2; side++) {
    const sgn = side === 0 ? 1 : -1;
    const sw = Math.sin(g.phase * Math.PI * 2 + (side === 0 ? Math.PI : 0)) * (0.2 + run * 0.25) * moving;
    const sh = p[side === 0 ? J.shL : J.shR];
    const bend = 0.12 + run * 0.55 + moving * 0.1;
    _t.set(sh.x + sgn * 0.06, sh.y - (UARM + FARM) * (0.97 - bend * 0.25), sh.z + sw * 0.75 + bend * 0.22 + 0.03);
    solveIK(sh, _t, UARM, FARM, POLE_ELBOW, p[side === 0 ? J.elL : J.elR], p[side === 0 ? J.haL : J.haR]);
  }
  f.refresh(0);
}
