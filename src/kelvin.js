// Colour temperature, the way painters and photographers talk about light.
//
// The slider runs in mireds (a million over kelvin) rather than kelvin,
// because equal steps in mireds look like equal steps of warmth: kelvin
// crowds all the visible change into the low end.

export const MIN_K = 1800;
export const MAX_K = 10000;
const MIN_MIRED = 1e6 / MAX_K;
const MAX_MIRED = 1e6 / MIN_K;

/** Slider position 0..1 (warm to cool) to kelvin. */
export const kelvinAt = (t) => 1e6 / (MAX_MIRED - t * (MAX_MIRED - MIN_MIRED));

/** Kelvin to slider position 0..1. */
export const positionOf = (k) => (MAX_MIRED - 1e6 / k) / (MAX_MIRED - MIN_MIRED);

/**
 * Kelvin to an sRGB triple, 0..1, brightest channel at 1. Tanner Helland's
 * fit to the blackbody locus: close enough to tint a lamp.
 */
export function rgbOfKelvin(k) {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = [r, g, b].map((v) => Math.min(Math.max(v, 0), 255) / 255);
  const m = Math.max(...c);
  return c.map((v) => v / m);
}

export const cssOfKelvin = (k) => `rgb(${rgbOfKelvin(k).map((v) => Math.round(v * 255)).join(' ')})`;

// Named sources, so a number on a slider means something at the easel.
const SOURCES = [
  [1900, 'Candle'],
  [2700, 'Tungsten'],
  [3400, 'Studio lamp'],
  [4300, 'Morning sun'],
  [5500, 'Noon sun'],
  [6500, 'Overcast'],
  [8500, 'North sky'],
];

/** "3,400 K · Studio lamp", naming the nearest source when it's close. */
export function describeKelvin(k) {
  const rounded = Math.round(k / 50) * 50;
  let best = null;
  for (const [sk, name] of SOURCES) {
    const d = Math.abs(1e6 / sk - 1e6 / k);
    if (d < 25 && (!best || d < best.d)) best = { d, name };
  }
  const n = rounded.toLocaleString('en-GB');
  return best ? `${n} K · ${best.name}` : `${n} K`;
}

/** A CSS gradient across the slider's range, for its track. */
export function trackGradient(stops = 12) {
  const parts = [];
  for (let i = 0; i <= stops; i++) {
    const t = i / stops;
    parts.push(`${cssOfKelvin(kelvinAt(t))} ${(t * 100).toFixed(1)}%`);
  }
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}
