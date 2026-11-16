// One closed surface from a distance field (surface nets on a plain grid).
// For small things modelled as a blend of simple volumes: a hand, say.
import * as THREE from 'three';

export function meshField(field: (x: number, y: number, z: number) => number, min: THREE.Vector3, max: THREE.Vector3, h: number) {
  const nx = Math.ceil((max.x - min.x) / h) + 1, ny = Math.ceil((max.y - min.y) / h) + 1, nz = Math.ceil((max.z - min.z) / h) + 1;
  const vals = new Float32Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) vals[at(i, j, k)] = field(min.x + i * h, min.y + j * h, min.z + k * h);
  const cx = nx - 1, cy = ny - 1, cellV = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const cat = (i: number, j: number, k: number) => (k * cy + j) * cx + i;
  const pos: number[] = [], corner = new Float32Array(8);
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { const v = vals[at(i + (c & 1), j + ((c >> 1) & 1), k + (c >> 2))]; corner[c] = v; if (v < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const va = corner[a], vb = corner[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t;
      n++;
    }
    cellV[cat(i, j, k)] = pos.length / 3;
    pos.push(min.x + (i + sx / n) * h, min.y + (j + sy / n) * h, min.z + (k + sz / n) * h);
  }
  const index: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) index.push(a, c, b, a, d, c); else index.push(a, b, c, a, c, d); };
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const v0 = vals[at(i, j, k)];
    if (j > 0 && k > 0 && (v0 < 0) !== (vals[at(i + 1, j, k)] < 0)) quad(cellV[cat(i, j - 1, k - 1)], cellV[cat(i, j, k - 1)], cellV[cat(i, j, k)], cellV[cat(i, j - 1, k)], v0 > 0);
    if (i > 0 && k > 0 && (v0 < 0) !== (vals[at(i, j + 1, k)] < 0)) quad(cellV[cat(i - 1, j, k - 1)], cellV[cat(i - 1, j, k)], cellV[cat(i, j, k)], cellV[cat(i, j, k - 1)], v0 > 0);
    if (i > 0 && j > 0 && (v0 < 0) !== (vals[at(i, j, k + 1)] < 0)) quad(cellV[cat(i - 1, j - 1, k)], cellV[cat(i, j - 1, k)], cellV[cat(i, j, k)], cellV[cat(i - 1, j, k)], v0 > 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
