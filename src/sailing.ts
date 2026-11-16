// Sailing physics, independent of rendering so it can be tested headless.
//
// Frame: heading psi, forward = (sin psi, cos psi) in world (x, z).
// Port (left) = (cos psi, -sin psi). Positive yaw turns toward port.

export interface SailState {
  x: number; z: number;
  psi: number;       // heading (rad)
  u: number;         // forward speed (m/s)
  v: number;         // sideways speed toward port (m/s)
  r: number;         // yaw rate (rad/s)
  sheet: number;     // max boom angle allowed by the sheet (rad)
  rudder: number;    // -1..1, smoothed
  boom: number;      // signed boom angle, + = boom out to port
  alpha: number;     // sail angle of attack (rad)
  heel: number;      // target heel, + = leaning to port
  drive: number;     // forward force (N), for audio/visual feedback
  awa: number;       // apparent wind angle off the bow (rad, 0 = head to wind)
  aws: number;       // apparent wind speed
  trimAssist: number; // seconds since the player last touched the sheet
  side: number;       // sideways force from the sail (N), + toward port
}

export interface SailInput {
  steer: number; // -1..1, + = turn to port
  sheet: number; // -1..1, + = sheet in
}

export const SHEET_MIN = 0.16;
export const SHEET_MAX = 1.5;

const MASS = 250;
const SAIL_AREA = 9;
const RHO = 1.2;
const BEST_ALPHA = 0.33;

export function createSailState(x = 0, z = 0, psi = 0): SailState {
  return {
    x, z, psi, u: 0, v: 0, r: 0, sheet: 0.6, rudder: 0, boom: 0, alpha: 0,
    heel: 0, drive: 0, awa: 0, aws: 0, trimAssist: 99, side: 0,
  };
}

function liftCoeff(a: number) {
  if (a <= 0) return 0;
  if (a < BEST_ALPHA) return 1.3 * Math.sin((a / BEST_ALPHA) * Math.PI * 0.5);
  return 1.3 * Math.cos(((a - BEST_ALPHA) / (Math.PI * 0.5 - BEST_ALPHA)) * Math.PI * 0.5);
}
function dragCoeff(a: number) {
  const s = Math.sin(a);
  return 0.07 + 1.15 * s * s;
}

/** Advance the boat. (wx, wz) is true wind velocity: the direction it blows toward. */
export function stepSailing(s: SailState, inp: SailInput, wx: number, wz: number, dt: number) {
  const sn = Math.sin(s.psi), cs = Math.cos(s.psi);
  // boat velocity in world
  const vx = s.u * sn + s.v * cs;
  const vz = s.u * cs - s.v * sn;
  // apparent wind in boat frame (f = forward, l = toward port)
  const ax = wx - vx, az = wz - vz;
  const wf = ax * sn + az * cs;
  const wl = ax * cs - az * sn;
  const aws = Math.hypot(wf, wl);
  const side = wl >= 0 ? 1 : -1; // boom swings to this side
  // angle the boom would take if free (0 = streaming straight aft)
  const free = Math.atan2(Math.abs(wl), -wf);
  s.awa = free; // equals angle of the wind off the bow
  s.aws = aws;

  // sheet control with a gentle trim assist
  if (inp.sheet !== 0) {
    s.sheet -= inp.sheet * 0.9 * dt;
    s.trimAssist = 0;
  } else {
    s.trimAssist += dt;
    if (s.trimAssist > 2.5) {
      // in a blow the helping hand spills wind: it eases until the boat is no longer pressed
      const spill = Math.max(0, Math.min(1, (Math.abs(s.side) - 1100) / 1300));
      const ideal = Math.min(SHEET_MAX, Math.max(SHEET_MIN, free - BEST_ALPHA * (1 - 0.88 * spill)));
      const rate = Math.min(1, (s.trimAssist - 2.5) * 0.5) * (0.35 + spill * 1.2);
      s.sheet += Math.max(-rate * dt, Math.min(rate * dt, ideal - s.sheet));
    }
  }
  s.sheet = Math.min(SHEET_MAX, Math.max(SHEET_MIN, s.sheet));

  const beta = Math.min(free, s.sheet);
  const alpha = free - beta;
  s.alpha = alpha;
  // boom follows with a little lag so gybes swing across
  const targetBoom = beta * side;
  s.boom += (targetBoom - s.boom) * Math.min(1, dt * 5);

  // aerodynamic force in the boat frame (x = port, z = forward)
  let Ff = 0, Fl = 0;
  if (aws > 0.01) {
    const wxl = wl / aws, wzl = wf / aws; // wind flow direction, local
    // sail normal on the side the wind pushes toward
    const bx = Math.sin(beta) * side, bz = -Math.cos(beta);
    let nx = -bz, nz = bx;
    if (nx * wxl + nz * wzl < 0) { nx = -nx; nz = -nz; }
    const dot = nx * wxl + nz * wzl;
    let lx = nx - dot * wxl, lz = nz - dot * wzl;
    const ll = Math.hypot(lx, lz);
    if (ll > 1e-5) { lx /= ll; lz /= ll; } else { lx = 0; lz = 0; }
    const q = 0.5 * RHO * aws * aws * SAIL_AREA;
    const cl = liftCoeff(alpha), cd = dragCoeff(alpha);
    // hull, mast and crew windage: this is what closes the no-go zone
    const wind = 0.5 * RHO * aws * aws * 2.4;
    Fl = q * (cl * lx + cd * wxl) + wind * wxl;
    Ff = q * (cl * lz + cd * wzl) + wind * wzl;
  }
  s.drive = Ff;
  s.side = Fl;

  // hull
  // past hull speed the water piles up: a small boat does not plane however hard it blows
  const fast = Math.max(0, Math.abs(s.u) - 7.5);
  const dragF = 18 * s.u + 8 * s.u * Math.abs(s.u) + Math.sign(s.u) * 160 * fast * fast;
  s.u += ((Ff - dragF) / MASS) * dt;
  s.v += (Fl / MASS) * 0.5 * dt;
  s.v -= s.v * Math.min(1, 4.5 * dt); // keel resists leeway
  if (s.u < -0.5) s.u = -0.5;

  // rudder
  s.rudder += (inp.steer - s.rudder) * Math.min(1, dt * 6);
  const flow = Math.abs(s.u) + 0.7;
  let yawAcc = s.rudder * 0.42 * flow * (s.u < -0.1 ? -1 : 1) - 3.0 * s.r;
  // stuck head to wind: fall off gently by itself
  if (free < 0.45 && Math.abs(s.u) < 0.8 && inp.steer === 0) yawAcc += -side * 0.25;
  s.r += yawAcc * dt;
  s.psi += s.r * dt;

  // heel from side force. The hull stiffens and holds: pressed hard in a storm it puts the rail under
  // but wind alone never puts it over (only a great wave does that, see Boat.sync).
  const press = Math.max(0, Math.abs(Fl) - 2100) / 1500;
  const heelTarget = Math.sign(Fl) * (Math.min(0.34, (Math.abs(Fl) / 900) * 0.3) + Math.min(0.45, press * 0.4));
  s.heel += (heelTarget - s.heel) * Math.min(1, dt * 2.2);

  const sn2 = Math.sin(s.psi), cs2 = Math.cos(s.psi);
  s.x += (s.u * sn2 + s.v * cs2) * dt;
  s.z += (s.u * cs2 - s.v * sn2) * dt;
}
