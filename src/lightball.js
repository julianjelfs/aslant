// The lit sphere: a ball shaded by the scene's own lights, with the lamp as a
// handle you drag round it.
//
// Inside the ball's outline the lamp is on the near side, between you and the
// head. Drag past the outline into the ring and it swings round behind, up to
// a rim light. The ball is shaded with the same maths as the head's material
// (Lambert key plus hemisphere fill), and banded into values when the scene
// is, so it doubles as a reference sphere.

import { DARK_L, LIGHT_L, greyOfLstar } from './values.js';

const RING = 0.32; // the "behind" ring, as a fraction of the ball's radius
const BEHIND_MAX = Math.PI * 0.45; // how far past side-on the ring reaches

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const lstarOfY = (y) => (y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y);

/** View-space unit vector to azimuth/elevation in degrees. */
export function anglesOf(d) {
  return {
    azimuth: (Math.atan2(d.x, d.z) * 180) / Math.PI,
    elevation: (Math.asin(Math.max(-1, Math.min(1, d.y))) * 180) / Math.PI,
  };
}

export function dirOfAngles(azimuth, elevation) {
  const a = (azimuth * Math.PI) / 180;
  const e = (elevation * Math.PI) / 180;
  return { x: Math.sin(a) * Math.cos(e), y: Math.sin(e), z: Math.cos(a) * Math.cos(e) };
}

/** "High, front left" and friends: where the lamp is, in words. */
export function describeDir(d) {
  const { azimuth, elevation } = anglesOf(d);
  const a = Math.abs(azimuth);
  const side = azimuth < 0 ? 'left' : 'right';
  let where;
  if (a < 15) where = 'front';
  else if (a < 70) where = `front ${side}`;
  else if (a < 110) where = `${side} side`;
  else if (a < 165) where = `behind ${side}`;
  else where = 'behind';
  const height = elevation > 50 ? 'Overhead' : elevation > 15 ? 'High' : elevation < -15 ? 'Low' : 'Level';
  return `${height}, ${where}`;
}

export function createLightBall(canvas, { onChange }) {
  const ctx = canvas.getContext('2d');
  const shade = document.createElement('canvas');
  const sctx = shade.getContext('2d');

  const state = {
    dir: dirOfAngles(-50, 35),
    key: [1, 1, 1], // linear rgb
    strength: 2.4,
    sky: [0.9, 0.9, 1],
    ground: [0.2, 0.2, 0.2],
    fill: 0.18,
    albedo: [0.69, 0.66, 0.6],
    steps: 0,
    dragging: false,
  };

  let size = 0;
  let dpr = 1;
  let radius = 0;
  let queued = false;

  function layout() {
    const css = canvas.clientWidth;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = css;
    canvas.width = Math.round(css * dpr);
    canvas.height = Math.round(css * dpr);
    radius = css / 2 / (1 + RING + 0.06);
    const px = Math.round(radius * 2 * dpr);
    shade.width = px;
    shade.height = px;
    draw();
  }

  // Ball-relative point (css px from centre, y down) <-> light direction.
  function dirAt(px, py) {
    const rho = Math.hypot(px, py) / radius;
    const theta = rho <= 1 ? Math.asin(rho) : Math.PI / 2 + Math.min((rho - 1) / RING, 1) * BEHIND_MAX;
    const phi = Math.atan2(-py, px);
    return { x: Math.sin(theta) * Math.cos(phi), y: Math.sin(theta) * Math.sin(phi), z: Math.cos(theta) };
  }

  function pointOf(d) {
    const theta = Math.acos(Math.max(-1, Math.min(1, d.z)));
    const rho = theta <= Math.PI / 2 ? Math.sin(theta) : 1 + Math.min((theta - Math.PI / 2) / BEHIND_MAX, 1) * RING;
    const phi = Math.atan2(d.y, d.x);
    return { x: rho * radius * Math.cos(phi), y: -rho * radius * Math.sin(phi) };
  }

  function paintBall() {
    const w = shade.width;
    const img = sctx.createImageData(w, w);
    const { dir: L, key, strength, sky, ground, fill, albedo, steps } = state;
    const k = strength / Math.PI;
    const f = fill / Math.PI;
    const span = LIGHT_L - DARK_L;
    for (let j = 0; j < w; j++) {
      const v = ((j + 0.5) / w) * 2 - 1;
      for (let i = 0; i < w; i++) {
        const u = ((i + 0.5) / w) * 2 - 1;
        const rr = u * u + v * v;
        if (rr > 1) continue;
        const nx = u;
        const ny = -v;
        const nz = Math.sqrt(1 - rr);
        const lambert = Math.max(0, nx * L.x + ny * L.y + nz * L.z) * k;
        const h = ny * 0.5 + 0.5;
        const o = (j * w + i) * 4;
        const r = albedo[0] * (key[0] * lambert + (ground[0] + (sky[0] - ground[0]) * h) * f);
        const g = albedo[1] * (key[1] * lambert + (ground[1] + (sky[1] - ground[1]) * h) * f);
        const b = albedo[2] * (key[2] * lambert + (ground[2] + (sky[2] - ground[2]) * h) * f);
        if (steps > 0) {
          // Same banding as the value pass: L* of the displayed colour.
          const sr = linearToSrgb(Math.min(r, 1));
          const sg = linearToSrgb(Math.min(g, 1));
          const sb = linearToSrgb(Math.min(b, 1));
          const y = 0.2126 * srgbToLinear(sr) + 0.7152 * srgbToLinear(sg) + 0.0722 * srgbToLinear(sb);
          const band = Math.min(Math.max(Math.floor((lstarOfY(y) / 100) * steps), 0), steps - 1);
          const target = steps < 2 ? DARK_L : DARK_L + (span * band) / (steps - 1);
          const grey = greyOfLstar(target);
          img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(grey * 255);
        } else {
          img.data[o] = Math.round(linearToSrgb(Math.min(r, 1)) * 255);
          img.data[o + 1] = Math.round(linearToSrgb(Math.min(g, 1)) * 255);
          img.data[o + 2] = Math.round(linearToSrgb(Math.min(b, 1)) * 255);
        }
        // Soft edge: one device pixel of antialiasing at the rim.
        const edge = Math.min(1, (1 - Math.sqrt(rr)) * w * 0.5);
        img.data[o + 3] = Math.round(edge * 255);
      }
    }
    sctx.putImageData(img, 0, 0);
  }

  function draw() {
    if (!size) return;
    paintBall();
    const c = size / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // The ring the lamp swings through to get behind the head.
    const outer = radius * (1 + RING);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, outer, 0, Math.PI * 2);
    ctx.arc(c, c, radius, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(243, 241, 236, 0.035)';
    ctx.fill('evenodd');
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(243, 241, 236, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c, c, outer, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.drawImage(shade, c - radius, c - radius, radius * 2, radius * 2);

    const p = pointOf(state.dir);
    const hx = c + p.x;
    const hy = c + p.y;
    const behind = state.dir.z < 0;

    // A faint ray from the lamp to the middle of the ball.
    ctx.save();
    ctx.strokeStyle = behind ? 'rgba(243, 241, 236, 0.25)' : 'rgba(28, 27, 26, 0.35)';
    ctx.setLineDash(behind ? [3, 3] : []);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(c, c);
    ctx.stroke();
    ctx.restore();

    // The lamp: filled with its own colour, hollow when it's behind.
    const keyCss = `rgb(${state.key.map((v) => Math.round(linearToSrgb(v) * 255)).join(' ')})`;
    const r = state.dragging ? 10 : 8;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.fillStyle = behind ? 'rgba(28, 27, 26, 0.9)' : keyCss;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = behind ? keyCss : '#1c1b1a';
    ctx.stroke();
    if (!behind) {
      ctx.beginPath();
      ctx.arc(hx, hy, r + 2, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(243, 241, 236, 0.9)';
      ctx.stroke();
    }
  }

  function redraw() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      draw();
    });
  }

  function setDir(d, notify = true) {
    const n = Math.hypot(d.x, d.y, d.z) || 1;
    state.dir = { x: d.x / n, y: d.y / n, z: d.z / n };
    canvas.setAttribute('aria-valuetext', describeDir(state.dir));
    if (notify) onChange(state.dir);
    redraw();
  }

  function fromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    setDir(dirAt(e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2));
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    state.dragging = true;
    fromEvent(e);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (state.dragging) fromEvent(e);
  });
  const end = () => {
    state.dragging = false;
    redraw();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 15 : 5;
    let { azimuth, elevation } = anglesOf(state.dir);
    if (e.key === 'ArrowLeft') azimuth -= step;
    else if (e.key === 'ArrowRight') azimuth += step;
    else if (e.key === 'ArrowUp') elevation = Math.min(elevation + step, 89);
    else if (e.key === 'ArrowDown') elevation = Math.max(elevation - step, -89);
    else return;
    e.preventDefault();
    setDir(dirOfAngles(azimuth, elevation));
  });

  new ResizeObserver(layout).observe(canvas);

  return {
    get dir() {
      return state.dir;
    },
    setDir,
    /** Update the shading inputs; anything left out keeps its value. */
    set(values) {
      Object.assign(state, values);
      redraw();
    },
  };
}
