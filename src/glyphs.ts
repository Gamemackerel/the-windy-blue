// The sea people's numerals: ten marks for nought to nine, written with a small
// vocabulary of strokes, rings and arcs. The same definitions draw them on the
// tower's keys (as raised metal), in the bottled note and in the journal that
// translates them (as ink).
import * as THREE from 'three';
import { rng } from './noise';

type Stroke = ['l', number, number, number, number] | ['c', number, number, number] | ['a', number, number, number, number, number];
/** each glyph in a box from -1 to 1; arcs are given in degrees, anticlockwise from the +x axis */
export const NUMERALS: Stroke[][] = [
  [['c', 0, 0, 0.62]],                                                                  // 0: the empty ring
  [['l', 0, -0.8, 0, 0.3], ['c', 0, 0.52, 0.22]],                                     // 1: a stem with a ring on its head
  [['l', 0.6, 0.7, -0.55, 0], ['l', -0.55, 0, 0.6, -0.7], ['l', -0.1, 0, 0.75, 0]],    // 2: the open angle with its bar
  [['a', 0, 0, 0.6, 90, 360], ['l', 0, 0, 0.6, 0]],                                     // 3: the ring cut open, with a spoke
  [['l', 0, -0.8, 0, 0.8], ['l', -0.7, 0, 0.7, 0]],                                     // 4: the crossing
  [['a', 0, 0.2, 0.55, 0, 180], ['l', 0, -0.8, 0, 0.2]],                                // 5: a hand raised
  [['c', 0, 0, 0.62], ['c', 0, 0, 0.14]],                                               // 6: the ring with its eye
  [['l', -0.6, 0.7, 0.5, 0.25], ['l', 0.5, 0.25, -0.5, -0.25], ['l', -0.5, -0.25, 0.6, -0.7]],   // 7: the wave
  [['a', -0.32, -0.05, 0.32, 180, 360], ['a', 0.32, -0.05, 0.32, 180, 360], ['l', 0, -0.05, 0, 0.7]],   // 8: two cups and a mast
  [['a', 0.1, 0, 0.6, 60, 300], ['l', -0.75, -0.8, 0.75, -0.8]],                        // 9: the open ring on its line
];
/** the two keys that are not numbers: wipe what has been entered, and a blank */
export const WIPE: Stroke[] = [['l', -0.6, -0.6, 0.6, 0.6], ['l', -0.6, 0.6, 0.6, -0.6]];

/** raised strokes on a key face. size is the half-width of the glyph in metres */
export function glyphMesh(strokes: Stroke[], size: number, mat: THREE.Material) {
  const g = new THREE.Group(), w = size * 0.13;
  for (const s of strokes) {
    if (s[0] === 'l') {
      const [, x1, y1, x2, y2] = s, len = Math.hypot(x2 - x1, y2 - y1) * size;
      const m = new THREE.Mesh(new THREE.BoxGeometry(len + w, w, w * 0.6), mat);
      m.position.set(((x1 + x2) / 2) * size, ((y1 + y2) / 2) * size, 0);
      m.rotation.z = Math.atan2(y2 - y1, x2 - x1);
      g.add(m);
    } else {
      const a0 = s[0] === 'a' ? (s[4] * Math.PI) / 180 : 0, a1 = s[0] === 'a' ? (s[5] * Math.PI) / 180 : Math.PI * 2;
      const m = new THREE.Mesh(new THREE.TorusGeometry(s[3] * size, w * 0.5, 5, 28, a1 - a0), mat);
      m.position.set(s[1] * size, s[2] * size, 0);
      m.rotation.z = a0;
      m.scale.z = 0.6;
      g.add(m);
    }
  }
  return g;
}

/** the same mark in ink, as inline SVG. blot smears it past reading */
export function glyphSvg(strokes: Stroke[], px = 34, blot = false) {
  let d = '';
  for (const s of strokes) {
    if (s[0] === 'l') d += `M${s[1]} ${-s[2]}L${s[3]} ${-s[4]}`;
    else {
      const r = s[3], a0 = s[0] === 'a' ? (s[4] * Math.PI) / 180 : 0, a1 = s[0] === 'a' ? (s[5] * Math.PI) / 180 : Math.PI * 1.999;
      const x0 = s[1] + Math.cos(a0) * r, y0 = -(s[2] + Math.sin(a0) * r), x1 = s[1] + Math.cos(a1) * r, y1 = -(s[2] + Math.sin(a1) * r);
      d += `M${x0.toFixed(3)} ${y0.toFixed(3)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 0 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
    }
  }
  const ink = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="0.17" stroke-linecap="round" stroke-linejoin="round"/>`;
  const smear = blot
    ? '<g fill="currentColor"><ellipse cx="-0.1" cy="0.05" rx="0.95" ry="0.7" opacity="0.5"/><ellipse cx="0.25" cy="-0.2" rx="0.6" ry="0.75" opacity="0.55"/><ellipse cx="-0.3" cy="0.3" rx="0.5" ry="0.4" opacity="0.6"/><ellipse cx="0.4" cy="0.45" rx="0.35" ry="0.2" opacity="0.4"/></g>'
    : '';
  return `<svg viewBox="-1.15 -1.15 2.3 2.3" width="${px}" height="${px}" style="vertical-align:middle;margin:0 3px">${blot ? smear : ink}</svg>`;
}

/** the tower's eight-figure code for this game */
export function towerCode(seed: number): number[] {
  const r = rng(seed * 7 + 31);
  return Array.from({ length: 8 }, () => Math.floor(r() * 10));
}

/** a line of writing that means nothing we can read: marks made of the same strokes as the numerals, but not numerals */
function gibberish(r: () => number, n: number, px: number) {
  let out = '';
  for (let i = 0; i < n; i++) {
    if (i > 0 && r() < 0.24) { out += '<span style="display:inline-block;width:14px"></span>'; }
    const k = Math.floor(r() * 5), s: Stroke[] = [];
    if (k === 0) s.push(['a', 0, 0, 0.6, 200, 340], ['l', -0.6, 0.5, 0.6, 0.5]);
    else if (k === 1) s.push(['l', -0.6, -0.7, 0, 0.7], ['l', 0, 0.7, 0.6, -0.7], ['c', 0, -0.25, 0.13]);
    else if (k === 2) s.push(['l', -0.7, 0.6, 0.7, 0.6], ['l', -0.7, 0, 0.7, 0], ['l', 0, 0, 0, -0.8]);
    else if (k === 3) s.push(['a', -0.2, 0, 0.5, 270, 450], ['a', 0.35, 0, 0.5, 90, 270]);
    else s.push(['l', -0.6, -0.7, -0.6, 0.7], ['a', -0.6, 0, 0.7, 300, 420], ['l', 0.5, -0.2, 0.5, 0.2]);
    out += glyphSvg(s, px);
  }
  return out;
}

/** the note from the bottle: lines of their writing, with the eight figures set apart in the middle and the fourth one lost */
export function noteHtml(seed: number) {
  const code = towerCode(seed), r = rng(seed * 3 + 5);
  const figs = code.map((dgt, i) => glyphSvg(NUMERALS[dgt], 46, i === 3)).join('');
  const line = (n: number) => `<div style="opacity:0.82">${gibberish(r, n, 24)}</div>`;
  return `<div style="text-align:center;line-height:1.5">${line(9)}${line(11)}${line(7)}<div style="margin:22px 0 22px">${figs}</div>${line(10)}${line(8)}${line(5)}</div>`;
}

/** the journal page that gives the numerals */
export function numeralsJournalHtml() {
  const row = (from: number) => `<div style="margin:8px 0">${[0, 1, 2, 3, 4].map((k) => `<span style="display:inline-block;width:86px;text-align:center">${glyphSvg(NUMERALS[from + k], 40)}<br>${from + k}</span>`).join('')}</div>`;
  return `<div>The sea people's script still defeats us, all but the numbers.<br><br>They count as we do: in tens, with a mark for nothing. Ten figures, written left to right, the greatest first.</div>${row(0)}${row(5)}<div><br>I have these from the tally boards at the tower quay, checked against the loads. I am certain of all ten.<br><br>Everything else they write, I cannot read a word of.</div>`;
}
