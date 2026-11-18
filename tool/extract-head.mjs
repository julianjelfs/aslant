// Cuts the head and neck out of the MakeHuman hm08 base mesh (CC0) and writes
// a minimal binary glTF with two meshes, "head" and "eyes" (POSITION + NORMAL
// + indices each), centred on the head's bounding box. The eyes are kept apart
// so the planes pass can leave them alone.
//
//   curl -LO https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj
//   npm i three@0.170.0
//   node tool/extract-head.mjs base.obj models/head.glb 5.7
//
// The Loomis fit in src/loomis.js is measured against this output, so
// re-cutting the head means re-checking MAKEHUMAN_FIT.
import fs from 'node:fs';
import * as THREE from 'three';

const [src, out, cutY] = [process.argv[2], process.argv[3], Number(process.argv[4] ?? 5.7)];
const v = [];
const tris = { head: [], eyes: [] };
let g = '';
for (const l of fs.readFileSync(src, 'utf8').split('\n')) {
  const p = l.trim().split(/\s+/);
  if (p[0] === 'v') v.push(p.slice(1, 4).map(Number));
  else if (p[0] === 'g') g = p[1];
  else if (p[0] === 'f') {
    const part = g === 'body' ? 'head' : /^helper-[lr]-eye$/.test(g) ? 'eyes' : null;
    if (!part) continue;
    const f = p.slice(1).map((s) => parseInt(s) - 1);
    // Above 5.95 the body is only head and neck. Below it the shoulders flare,
    // so keep just an elliptical neck down to cutY.
    const inside = f.every((i) => {
      const [x, y, z] = v[i];
      return y > 5.95 || (y > cutY && Math.hypot(x / 0.56, (z - 0.1) / 0.7) < 1);
    });
    if (inside) for (let k = 1; k + 1 < f.length; k++) tris[part].push(f[0], f[k], f[k + 1]);
  }
}

// The cut can leave slivers. Keep only the largest connected piece of the head.
{
  const t = tris.head;
  const parent = new Map();
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  for (const i of t) if (!parent.has(i)) parent.set(i, i);
  for (let k = 0; k < t.length; k += 3) { const r = find(t[k]); parent.set(find(t[k + 1]), r); parent.set(find(t[k + 2]), find(r)); }
  const size = new Map();
  for (let k = 0; k < t.length; k += 3) { const r = find(t[k]); size.set(r, (size.get(r) ?? 0) + 1); }
  const biggest = [...size.entries()].sort((a, b) => b[1] - a[1])[0][0];
  console.log('head pieces', [...size.values()].sort((a, b) => b - a).join(' '));
  tris.head = t.filter((_, k) => find(t[k - (k % 3)]) === biggest);
}

// The base mesh is symmetric to within a hair. Snap it exactly, so mirroring
// one half in the planes pass lines up with the other.
function symmetrise(indices) {
  const used = [...new Set(indices)];
  const key = (x, y, z) => `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)}`;
  const byPos = new Map(used.map((i) => [key(...v[i]), i]));
  let snapped = 0;
  for (const i of used) {
    const [x, y, z] = v[i];
    if (Math.abs(x) < 1e-3) { v[i] = [0, y, z]; continue; }
    if (x < 0) continue;
    const j = byPos.get(key(-x, y, z));
    if (j !== undefined) { v[j] = [-x, y, z]; snapped++; }
  }
  return snapped;
}
console.log('mirrored pairs', symmetrise(tris.head));

function geometry(indices) {
  const remap = new Map();
  const pos = [];
  const idx = indices.map((i) => {
    if (!remap.has(i)) { remap.set(i, remap.size); pos.push(...v[i]); }
    return remap.get(i);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

const parts = { head: geometry(tris.head), eyes: geometry(tris.eyes) };
parts.head.computeBoundingBox();
const c = new THREE.Vector3();
parts.head.boundingBox.getCenter(c);
c.x = 0;
for (const geo of Object.values(parts)) {
  geo.translate(-c.x, -c.y, -c.z);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
}
const bb = parts.head.boundingBox;
console.log('head verts', parts.head.attributes.position.count, 'tris', tris.head.length / 3,
  'bbox', bb.min.toArray().map((x) => x.toFixed(2)), bb.max.toArray().map((x) => x.toFixed(2)),
  'shift', c.toArray().map((x) => x.toFixed(2)));

// Minimal GLB writer: one buffer, three views per mesh.
const chunks = [];
const bufferViews = [];
const accessors = [];
const meshes = [];
let offset = 0;
for (const [name, geo] of Object.entries(parts)) {
  const P = new Float32Array(geo.attributes.position.array);
  const N = new Float32Array(geo.attributes.normal.array);
  const I = new Uint32Array(geo.index.array);
  const base = accessors.length;
  for (const [arr, target] of [[P, 34962], [N, 34962], [I, 34963]]) {
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: arr.byteLength, target });
    chunks.push(Buffer.from(arr.buffer));
    offset += arr.byteLength;
  }
  accessors.push(
    { bufferView: base, componentType: 5126, count: P.length / 3, type: 'VEC3', min: geo.boundingBox.min.toArray(), max: geo.boundingBox.max.toArray() },
    { bufferView: base + 1, componentType: 5126, count: N.length / 3, type: 'VEC3' },
    { bufferView: base + 2, componentType: 5125, count: I.length, type: 'SCALAR' },
  );
  meshes.push({ name, primitives: [{ attributes: { POSITION: base, NORMAL: base + 1 }, indices: base + 2 }] });
}
const bin = Buffer.concat(chunks);
const json = {
  asset: { version: '2.0', generator: 'aslant tool/extract-head.mjs', copyright: 'MakeHuman hm08 base mesh, CC0 1.0' },
  scene: 0,
  scenes: [{ nodes: meshes.map((_, i) => i) }],
  nodes: meshes.map((m, i) => ({ mesh: i, name: m.name })),
  meshes,
  buffers: [{ byteLength: bin.length }],
  bufferViews,
  accessors,
};
let js = Buffer.from(JSON.stringify(json));
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const binP = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + js.length + 8 + binP.length, 8);
const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
fs.writeFileSync(out, Buffer.concat([header, ch(js.length, 0x4e4f534a), js, ch(binP.length, 0x004e4942), binP]));
console.log('wrote', out, fs.statSync(out).size);
