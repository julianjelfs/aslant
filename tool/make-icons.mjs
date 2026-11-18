// Draws Aslant's icon: a Loomis head in three-quarter view, tipped aslant,
// lit from the left and shaded as a two-value study, with the Loomis cross in
// vermilion. It's built from the same construction the overlay draws
// (HEAD_FIT in src/loomis.js), projected into that pose, then rasterised to
// every size the manifest and iOS ask for with headless Chrome.
//
//   node tool/make-icons.mjs            # writes icons/*.svg and icons/*.png
//
// Askance's icon is flat value bars on gesso with one vermilion accent; this
// is the same language on Aslant's graphite.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { HEAD_FIT } from '../src/loomis.js';

const OUT = 'icons';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const C = {
  graphite: '#1c1b1a',
  gesso: '#f3f1ec',
  shadow: '#7a746c',
  line: '#1c1b1a',
  accent: '#e2471f',
};

// Pose: turned to the viewer's left, looked at from a little above, tipped.
const pose = new THREE.Matrix4().makeRotationFromEuler(
  new THREE.Euler(THREE.MathUtils.degToRad(8), THREE.MathUtils.degToRad(-24), THREE.MathUtils.degToRad(-12), 'ZXY'),
);
// Light from the upper left, a little in front, in view space.
const LIGHT = new THREE.Vector3(-0.75, 0.45, 0.5).normalize();

const { cy, cz, r, u, chinZ } = HEAD_FIT;
const d = Math.sqrt(r * r - u * u);
const centre = new THREE.Vector3(0, cy, cz);
const v = (x, y, z) => new THREE.Vector3(x, y, z);

// Head space -> view space (orthographic, looking down -z).
const view = (p) => p.clone().sub(centre).applyMatrix4(pose);
const viewDirHead = v(0, 0, 1).applyMatrix4(pose.clone().invert()); // towards the eye, head space

// Landmarks, as in loomisSegments.
const browFront = cz + r;
const noseY = cy - u;
const chinY = cy - 2 * u;
const faceW = 0.42 * r;
const chinW = 0.2 * r;
const nose = (s) => v(s * faceW, noseY, browFront - 0.1 * r);
const brow = (s) => v(s * faceW, cy, cz + Math.sqrt(r * r - faceW * faceW));
const chin = (s) => v(s * chinW, chinY, chinZ);
const ear = (s) => v(s * d, cy - 0.35 * u, cz - 0.35 * u);
const jaw = (s) => v(s * 0.9 * d, cy - 1.45 * u, cz - 0.15 * u);

// --- 2D helpers (view space, y up) -------------------------------------------

function hull(points) {
  const p = points.map((q) => [q.x, q.y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function circle3(c, a, b, radius, n = 96) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push(c.clone().addScaledVector(a, Math.cos(t) * radius).addScaledVector(b, Math.sin(t) * radius));
  }
  return pts;
}

// --- Geometry in view space --------------------------------------------------

// Silhouette: the ball plus the face and jaw below it.
const ballRing = [];
for (let i = 0; i < 128; i++) {
  const t = (i / 128) * Math.PI * 2;
  ballRing.push(v(Math.cos(t) * r, Math.sin(t) * r, 0));
}
const facePoints = [-1, 1].flatMap((s) => [nose(s), brow(s), chin(s), jaw(s), ear(s)]).map(view);
const silhouette = hull([...ballRing, ...facePoints]);

// Shadow: the dark side of the ball, bounded by the terminator, carried down
// the jaw on that side to the chin.
const Lhead = LIGHT.clone().applyMatrix4(pose.clone().invert());
const a = new THREE.Vector3().crossVectors(Lhead, v(0, 1, 0)).normalize();
const b = new THREE.Vector3().crossVectors(Lhead, a).normalize();
const terminator = circle3(v(0, 0, 0), a, b, 1, 256)
  .filter((n) => n.dot(viewDirHead) > 0)
  .map((n) => centre.clone().addScaledVector(n, r));
// Order the visible arc from top to bottom on screen.
const arc = terminator.map(view).sort((p, q) => Math.atan2(p.y, p.x) - Math.atan2(q.y, q.x));
let tArc = arc;
{
  // The filtered arc can wrap; split at the largest gap.
  let gap = 0;
  let at = 0;
  for (let i = 0; i < arc.length; i++) {
    const j = (i + 1) % arc.length;
    const g = arc[i].distanceTo(arc[j]);
    if (g > gap) {
      gap = g;
      at = j;
    }
  }
  tArc = arc.slice(at).concat(arc.slice(0, at));
  if (tArc[0].y < tArc.at(-1).y) tArc.reverse();
}
const darkSide = LIGHT.x < 0 ? 1 : -1; // screen side away from the light
const darkJawSide = view(chin(1)).x * darkSide > view(chin(-1)).x * darkSide ? 1 : -1;
const shadowPoly = [
  ...tArc,
  view(chin(darkJawSide)),
  v(view(chin(darkJawSide)).x, -10, 0),
  v(darkSide * 10, -10, 0),
  v(darkSide * 10, 10, 0),
  v(tArc[0].x, 10, 0),
];

// Lines that face the viewer. A closed circle filtered to its near half comes
// back as runs; split them so the hidden half isn't bridged by a chord.
const visibleOnBall = (p) => p.clone().sub(centre).dot(viewDirHead) > 0;
function nearRuns(points) {
  const runs = [];
  let run = [];
  for (const p of points) {
    if (visibleOnBall(p)) run.push(p);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) {
    // The circle is closed: a run touching the end continues the first one.
    if (runs.length && visibleOnBall(points[0])) runs[0] = run.concat(runs[0]);
    else runs.push(run);
  }
  return runs.filter((r) => r.length > 1).map((r) => r.map(view));
}
function polyline(points) {
  return points.map(view);
}
const nearSide = viewDirHead.x > 0 ? 1 : -1;
const lines = {
  ball: ballRing.concat([ballRing[0]]),
  // Brow line and centre line round the ball: the Loomis cross.
  brow: nearRuns(circle3(centre, v(1, 0, 0), v(0, 0, 1), r, 192)),
  // Over the top of the ball only: below the brow the centre line leaves the
  // ball and runs straight down the face (centreDown).
  centre: nearRuns(circle3(centre, v(0, 1, 0), v(0, 0, 1), r, 192).filter((p) => p.y >= cy - 1e-6)),
  centreDown: polyline([v(0, cy, browFront), nose(0), chin(0)].map((p) => (p.x === undefined ? p : p))),
  side: polyline(circle3(v(nearSide * d, cy, cz), v(0, 1, 0), v(0, 0, 1), u, 96)),
  sideCross: [
    polyline([v(nearSide * d, cy + u, cz), v(nearSide * d, cy - u, cz)]),
    polyline([v(nearSide * d, cy, cz - u), v(nearSide * d, cy, cz + u)]),
  ],
  noseLine: polyline([nose(-1), nose(1)]),
  chinLine: polyline([chin(-1), chin(1)]),
  jawNear: polyline([ear(nearSide), jaw(nearSide), chin(nearSide)]),
  faceNear: polyline([brow(nearSide), nose(nearSide), chin(nearSide)]),
  faceFar: polyline([brow(-nearSide), nose(-nearSide), chin(-nearSide)]),
};
lines.centreDown = polyline([v(0, cy, browFront), v(0, noseY, browFront - 0.1 * r), chin(0)]);

// --- SVG -----------------------------------------------------------------------

function svg({ scale = 1 } = {}) {
  // Fit the silhouette into the square, centred, at `scale` of the safe size.
  const xs = silhouette.map((p) => p[0]);
  const ys = silhouette.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cyv = (Math.max(...ys) + Math.min(...ys)) / 2;
  const k = (76 * scale) / Math.max(w, h);
  const X = (x) => (50 + (x - cx) * k).toFixed(2);
  const Y = (y) => (50 - (y - cyv) * k).toFixed(2);
  const pts = (ps) => ps.map((p) => `${X(p.x ?? p[0])},${Y(p.y ?? p[1])}`).join(' ');
  const pl = (ps, cls) => `<polyline class="${cls}" points="${pts(ps)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <clipPath id="head"><polygon points="${pts(silhouette)}"/></clipPath>
  </defs>
  <style>
    polyline { fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .l { stroke: ${C.line}; stroke-width: ${(1.4 * scale).toFixed(2)}; }
    .a { stroke: ${C.accent}; stroke-width: ${(2.4 * scale).toFixed(2)}; }
  </style>
  <rect width="100" height="100" fill="${C.graphite}"/>
  <polygon points="${pts(silhouette)}" fill="${C.gesso}"/>
  <polygon points="${pts(shadowPoly)}" fill="${C.shadow}" clip-path="url(#head)"/>
  <g clip-path="url(#head)">
    ${pl(lines.side, 'l')}
    ${lines.sideCross.map((s) => pl(s, 'l')).join('\n    ')}
    ${pl(lines.jawNear, 'l')}
    ${pl(lines.faceNear, 'l')}
    ${pl(lines.faceFar, 'l')}
    ${pl(lines.noseLine, 'l')}
    ${pl(lines.chinLine, 'l')}
    ${lines.brow.map((s) => pl(s, 'a')).join('\n    ')}
    ${lines.centre.map((s) => pl(s, 'a')).join('\n    ')}
    ${pl(lines.centreDown, 'a')}
  </g>
</svg>
`;
}

// --- Rasterise ------------------------------------------------------------------

fs.mkdirSync(OUT, { recursive: true });
const full = svg();
const maskable = svg({ scale: 0.78 }); // inside the 80% safe circle
fs.writeFileSync(path.join(OUT, 'icon.svg'), full);
fs.writeFileSync(path.join(OUT, 'icon-maskable.svg'), maskable);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aslant-icon-'));
function png(source, size, name) {
  const html = path.join(tmp, `${name}.html`);
  fs.writeFileSync(
    html,
    `<!doctype html><style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="${pathToFileURL(path.resolve(OUT, source)).href}">`,
  );
  const out = path.resolve(OUT, name);
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${size},${size}`,
    '--default-background-color=00000000',
    `--screenshot=${out}`,
    pathToFileURL(html).href,
  ], { stdio: 'ignore' });
  console.log('wrote', path.join(OUT, name));
}

png('icon.svg', 512, 'icon-512.png');
png('icon.svg', 192, 'icon-192.png');
png('icon.svg', 180, 'apple-touch-icon.png');
png('icon.svg', 64, 'favicon-64.png');
png('icon-maskable.svg', 512, 'icon-maskable-512.png');
png('icon-maskable.svg', 192, 'icon-maskable-192.png');
fs.rmSync(tmp, { recursive: true, force: true });
