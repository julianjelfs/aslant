// Turns the smooth head into a planes head.
//
// meshoptimizer collapses edges until the surface drifts by `error` (a
// fraction of the head's size), which merges near-flat runs of triangles into
// single planes and keeps the breaks where the form turns. Only the right half
// is simplified; the left is its mirror image, so the planes come out
// symmetrical the way a cast's do.

import { BufferGeometry, Float32BufferAttribute } from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/meshopt_simplifier.module.js';

export const ready = MeshoptSimplifier.ready;

const SEAM = 1e-5;

export function planesOf(geometry, error) {
  const P = geometry.attributes.position.array;
  const I = geometry.index.array;

  // Right half, including the vertices on the centre line.
  const toHalf = new Map();
  const halfPos = [];
  const halfIdx = [];
  for (let t = 0; t < I.length; t += 3) {
    const tri = [I[t], I[t + 1], I[t + 2]];
    if (tri.some((i) => P[i * 3] < -SEAM)) continue;
    for (const i of tri) {
      if (!toHalf.has(i)) {
        toHalf.set(i, toHalf.size);
        halfPos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      }
      halfIdx.push(toHalf.get(i));
    }
  }

  const [kept] = MeshoptSimplifier.simplify(
    new Uint32Array(halfIdx),
    new Float32Array(halfPos),
    3,
    0,
    error,
    [],
  );

  // Mirror: vertices on the centre line are shared, the rest get a twin at -x.
  const n = halfPos.length / 3;
  const pos = halfPos.slice();
  const twin = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (Math.abs(halfPos[i * 3]) <= SEAM) {
      pos[i * 3] = 0;
      twin[i] = i;
    } else {
      twin[i] = pos.length / 3;
      pos.push(-halfPos[i * 3], halfPos[i * 3 + 1], halfPos[i * 3 + 2]);
    }
  }
  const idx = Array.from(kept);
  for (let t = 0; t < kept.length; t += 3) {
    // Reflection flips handedness, so swap two corners to keep faces outward.
    idx.push(twin[kept[t]], twin[kept[t + 2]], twin[kept[t + 1]]);
  }

  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}
