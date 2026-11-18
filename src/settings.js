// Remembers every setting in this browser, so a refresh changes nothing.
//
// localStorage can be missing or throw (private windows, blocked site data),
// so every read and write is guarded and the page works the same without it,
// just starting from the defaults each time.

const KEY = 'aslant:settings:v1';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s && typeof s === 'object' ? s : null;
  } catch {
    return null;
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Nowhere to keep it; the page still works.
  }
}

export function clearSettings() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored to clear.
  }
}

/** A finite number from saved data, or undefined. */
export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** A saved {x, y, z}, or undefined if any part is missing or not a number. */
export function vec(v) {
  if (!v) return undefined;
  const x = num(v.x);
  const y = num(v.y);
  const z = num(v.z);
  return x === undefined || y === undefined || z === undefined ? undefined : { x, y, z };
}
