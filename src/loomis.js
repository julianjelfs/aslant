// The Loomis construction, as line segments in the head's own space.
//
// One measurement drives it: the ball (centre and radius) and the unit `u`,
// the distance hairline -> brow -> nose -> chin. The side planes are cut so
// their circles have radius `u`, which puts hairline and nose line at the top
// and bottom of the side circle, as Loomis draws it.

import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Vector3,
} from 'three';

// Fitted by eye to the MakeHuman head in models/head.glb (centred on its
// bounding box). A different model needs its own numbers.
export const MAKEHUMAN_FIT = {
  cy: 0.57, // ball centre height = brow line
  cz: 0.01, // ball centre depth
  r: 0.94, // ball radius
  u: 0.65, // hairline-brow = brow-nose = nose-chin
  chinZ: 0.8, // depth of the chin's front
};

function circle(out, centre, a, b, radius, n = 64, from = 0, to = Math.PI * 2) {
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const t = from + ((to - from) * i) / n;
    const p = centre.clone().addScaledVector(a, Math.cos(t) * radius).addScaledVector(b, Math.sin(t) * radius);
    if (prev) out.push(prev, p);
    prev = p;
  }
}

function polyline(out, points) {
  for (let i = 1; i < points.length; i++) out.push(points[i - 1], points[i]);
}

export function loomisSegments({ cy, cz, r, u, chinZ }) {
  const X = new Vector3(1, 0, 0);
  const Y = new Vector3(0, 1, 0);
  const Z = new Vector3(0, 0, 1);
  const c = new Vector3(0, cy, cz);
  const d = Math.sqrt(Math.max(r * r - u * u, 0)); // where the side planes cut
  const v = (x, y, z) => new Vector3(x, y, z);
  const seg = [];

  circle(seg, c, Y, Z, r); // centre line round the ball
  circle(seg, c, X, Z, r); // brow line round the ball

  // Hairline: the arc across the front of the ball joining the tops of the
  // side circles.
  const hy = cy + u;
  const hairline = [];
  for (let i = 0; i <= 32; i++) {
    const x = -d + (2 * d * i) / 32;
    hairline.push(v(x, hy, cz + Math.sqrt(Math.max(r * r - u * u - x * x, 0))));
  }
  polyline(seg, hairline);

  const browFront = cz + r;
  const noseY = cy - u;
  const chinY = cy - 2 * u;
  const faceW = 0.42 * r; // half-width of the face plane at the nose
  const chinW = 0.2 * r;

  for (const s of [-1, 1]) {
    const sc = v(s * d, cy, cz);
    circle(seg, sc, Y, Z, u); // side plane
    seg.push(v(s * d, cy + u, cz), v(s * d, cy - u, cz)); // its vertical
    seg.push(v(s * d, cy, cz - u), v(s * d, cy, cz + u)); // its horizontal

    // Nose line: from the bottom of the side circle round to the front.
    polyline(seg, [v(s * d, noseY, cz), v(s * faceW, noseY, browFront - 0.1 * r)]);

    // Edge of the face plane: brow corner down to the chin.
    polyline(seg, [v(s * faceW, cy, cz + Math.sqrt(r * r - faceW * faceW)), v(s * faceW, noseY, browFront - 0.1 * r), v(s * chinW, chinY, chinZ)]);

    // Jaw: from just behind the side circle's foot (the ear) down to the
    // angle of the jaw, then forward to the chin.
    polyline(seg, [v(s * d, cy - 0.35 * u, cz - 0.35 * u), v(s * 0.9 * d, cy - 1.45 * u, cz - 0.15 * u), v(s * chinW, chinY, chinZ)]);
  }

  // Centre line down the face, and the chin.
  polyline(seg, [v(0, cy, browFront), v(0, noseY, browFront - 0.1 * r), v(0, chinY, chinZ)]);
  polyline(seg, [v(-faceW, noseY, browFront - 0.1 * r), v(faceW, noseY, browFront - 0.1 * r)]);
  polyline(seg, [v(-chinW, chinY, chinZ), v(chinW, chinY, chinZ)]);

  return seg;
}

/**
 * Two copies of the same lines: one depth-tested against the head, one drawn
 * faintly through it, so the hidden half of the ball still reads.
 */
export function buildLoomis(fit = MAKEHUMAN_FIT, color = 0xe2471f) {
  const points = loomisSegments(fit);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points.flatMap((p) => p.toArray()), 3));

  const hidden = new LineSegments(
    geometry,
    new LineBasicMaterial({ color, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false }),
  );
  hidden.renderOrder = 1;

  const visible = new LineSegments(geometry, new LineBasicMaterial({ color, depthWrite: false }));
  visible.renderOrder = 2;

  const group = new Group();
  group.add(hidden, visible);
  return group;
}
