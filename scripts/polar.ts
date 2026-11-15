// Headless check of the sailing model: steady speed at each true wind angle
// with the trim assist doing the sheet work.
import { createSailState, stepSailing } from '../src/sailing';

const WIND = 9; // m/s, blowing toward +Z
console.log('true wind angle off bow -> steady boat speed (m/s), trim assist on');
for (let twa = 0; twa <= 180; twa += 15) {
  // wind blows toward +Z, so the wind comes FROM -Z; heading into it is psi = PI
  const psi = Math.PI - (twa * Math.PI) / 180;
  const s = createSailState(0, 0, psi);
  for (let i = 0; i < 60 * 60; i++) {
    stepSailing(s, { steer: 0, sheet: 0 }, 0, WIND, 1 / 60);
    s.psi = psi; s.r = 0; // hold course
  }
  console.log(
    String(twa).padStart(4), '°  ', s.u.toFixed(2).padStart(6),
    '  boom', ((Math.abs(s.boom) * 180) / Math.PI).toFixed(0).padStart(3),
    '  heel', ((Math.abs(s.heel) * 180) / Math.PI).toFixed(0).padStart(3),
  );
}
