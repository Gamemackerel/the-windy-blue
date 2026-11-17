// The player's own arms, seen from behind the eyes. They hang out of sight
// until there is something to do: reach for a thing, carry it, hold the tiller
// and sheet, or climb.
import * as THREE from 'three';
import { Tube, ProfKey, bodyMaterial, fillHand, setGrip, solveIK, LIMB } from './figure';

const _t = new THREE.Vector3(), _e = new THREE.Vector3(), _n = new THREE.Vector3(), _x = new THREE.Vector3(), _m = new THREE.Matrix4(), _pole = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, -1);

interface Arm {
  s: number;                      // +1 left, -1 right (camera space: left is -x)
  tube: Tube; hand: THREE.Group;
  sh: THREE.Vector3; el: THREE.Vector3; wr: THREE.Vector3;
  pos: THREE.Vector3;             // where the hand is now, camera space
  reachT: number; reachTo: THREE.Vector3;   // world point being reached for
}

export class Arms {
  readonly group = new THREE.Group();
  /** something being carried in both hands (positioned by the main loop), with its width */
  carry: { obj: THREE.Object3D; size: number } | null = null;
  /** what the right hand holds is the revolver (gripped) rather than something carried on the palm */
  heldGun = false;
  private arms: Arm[] = [];
  private sway = 0;

  constructor(private camera: THREE.Camera) {
    const cloth = bodyMaterial('cloth'), skinMat = bodyMaterial('skin');
    const coat = new THREE.Color('#b08a3c'), cuff = coat.clone().multiplyScalar(0.55), skin = new THREE.Color('#b08f78');
    const K = (t: number, rx: number, rz: number, c: THREE.Color): ProfKey => ({ t, rx, rz, c });
    const prof = [K(0, 0.05, 0.055, coat), K(0.25, 0.056, 0.06, coat), K(0.48, 0.05, 0.053, coat), K(0.86, 0.043, 0.041, coat), K(0.9, 0.05, 0.048, cuff), K(0.97, 0.049, 0.047, cuff), K(1, 0.028, 0.026, cuff)];
    for (const s of [1, -1]) {
      const tube = new Tube(this.group, cloth, prof, 20, 12, 0.6);
      const hand = new THREE.Group();
      fillHand(hand, s, skinMat, skin);
      this.group.add(hand);
      tube.mesh.castShadow = false;
      hand.traverse((m) => { m.castShadow = false; m.frustumCulled = false; });
      this.arms.push({ s, tube, hand, sh: new THREE.Vector3(-s * 0.19, -0.25, 0.06), el: new THREE.Vector3(), wr: new THREE.Vector3(), pos: new THREE.Vector3(-s * 0.24, -0.7, -0.1), reachT: 0, reachTo: new THREE.Vector3() });
    }
    camera.add(this.group);
  }

  /** send a hand out to a point in the world and back. Returns which hand went (0 left, 1 right). */
  reach(world: THREE.Vector3, avoidRight = false) {
    const i = avoidRight ? 0 : Math.random() < 0.5 ? 0 : 1;
    const a = this.arms[i];
    a.reachT = 0.0001; a.reachTo.copy(world);
    return i;
  }

  /**
   * held: camera-space point where the right hand holds an item, or null.
   * grips: world points for the hands to hold (tiller and sheet, or ladder rails), or null.
   */
  update(dt: number, t: number, speed: number, held: THREE.Vector3 | null, grips: [THREE.Vector3, THREE.Vector3] | null) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    this.sway += dt * (4 + speed * 1.6);
    let gl: THREE.Vector3 | null = null, gr: THREE.Vector3 | null = null;
    if (grips) {
      // each hand takes whichever grip is on its own side
      const a = cam.worldToLocal(_t.copy(grips[0])).x, b = cam.worldToLocal(_e.copy(grips[1])).x;
      gl = a < b ? grips[0] : grips[1]; gr = a < b ? grips[1] : grips[0];
    }
    for (let i = 0; i < 2; i++) {
      const a = this.arms[i], s = a.s;
      // where this hand wants to be, in camera space
      const want = _t.set(-s * 0.25, -0.72 + Math.sin(this.sway + i * Math.PI) * 0.012 * Math.min(1, speed), -0.12);
      let rate = 9, palmDown = 0, palmUp = 0, closed = false;
      if (this.carry) {
        closed = true;
        cam.worldToLocal(want.copy(this.carry.obj.getWorldPosition(_e)));
        want.x += -s * (this.carry.size * 0.5 + 0.03); want.y -= 0.02; want.z += 0.03;
        rate = 16;
      } else if (grips) {
        cam.worldToLocal(want.copy(i === 0 ? gl! : gr!)); rate = 14; palmDown = 1; closed = true;
        // the wrist stops short of the bar and a little under it, so it is the curled fingers that lie over it
        _e.subVectors(want, a.sh).normalize();
        want.addScaledVector(_e, -0.075); want.y -= 0.025;
      }
      else if (i === 1 && held) {
        // the revolver is gripped; anything else rests on the open palm, held up to be seen
        rate = 18;
        if (this.heldGun) {
          // the wrist sits just behind the grip, so the closed fingers come round it
          // the closed fingers lie on the palm side of the wrist: put the wrist half a fist to the outside of the grip, and they close round it
          want.copy(held); want.x -= s * 0.022; want.y += 0.004; want.z += 0.012;
          closed = true; rate = 30;
        }
        else { want.copy(held); want.y -= 0.045; want.z += 0.075; palmUp = 1; }
      }
      if (a.reachT > 0) {
        a.reachT += dt * 2.3;
        const k = Math.sin(Math.min(1, a.reachT) * Math.PI);
        cam.worldToLocal(_e.copy(a.reachTo));
        want.lerp(_e, k);
        rate = 22;
        if (a.reachT >= 1) a.reachT = 0;
      }
      // an arm is only so long
      _e.subVectors(want, a.sh);
      const max = (LIMB.UARM + LIMB.FARM) * 1.12, d = _e.length();
      if (d > max) want.copy(a.sh).addScaledVector(_e, max / d);
      a.pos.lerp(want, Math.min(1, dt * rate));

      // the arm is a little longer than the body's, so things at arm's length can be touched
      // holding something out on the palm, the elbow sits back by the ribs so the forearm runs forward under it
      if (palmUp) _pole.set(-s * 0.25, -0.35, 1); else _pole.set(-s * 0.7, -1, 0.35);
      solveIK(a.sh, a.pos, LIMB.UARM * 1.12, LIMB.FARM * 1.12, _pole, a.el, a.wr);
      _x.set(0, 0, -1);
      a.tube.update([a.sh, a.el, a.wr], _x, _x);
      // hand: along the forearm, palm turned in (or down, when gripping a bar)
      _e.subVectors(a.wr, a.el).normalize();
      _n.set(s * (1 - palmDown), -palmDown - 0.15, 0);
      if (palmUp) _n.set(-s * 0.15, 1, 0);
      setGrip(a.hand, closed);
      _n.addScaledVector(_e, -_n.dot(_e));
      if (_n.lengthSq() < 1e-6) _n.copy(FWD);
      _n.normalize();
      _x.crossVectors(_e, _n);
      _m.makeBasis(_x, _e, _n);
      a.hand.quaternion.setFromRotationMatrix(_m);
      a.hand.position.copy(a.wr).addScaledVector(_e, -0.02);
    }
  }
}
