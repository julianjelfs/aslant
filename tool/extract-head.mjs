// Cuts the head and neck out of the MakeHuman hm08 base mesh (CC0) and writes
// a minimal binary glTF: one mesh, POSITION + NORMAL + indices, centred on its
// bounding box.
//
//   curl -LO https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj
//   npm i three@0.170.0
//   node tool/extract-head.mjs base.obj models/head.glb 5.7
//
// The Loomis fit in src/loomis.js is measured against this output, so
// re-cutting the head means re-checking MAKEHUMAN_FIT.
import fs from 'node:fs';
import * as THREE from 'three';
const [src, out, cutY] = [process.argv[2], process.argv[3], Number(process.argv[4] ?? 5.45)];
const v = []; let g = ''; const tris = [];
const keep = /^(body|helper-l-eye|helper-r-eye)$/;
for (const l of fs.readFileSync(src, 'utf8').split('\n')) {
  const p = l.trim().split(/\s+/);
  if (p[0] === 'v') v.push(p.slice(1, 4).map(Number));
  else if (p[0] === 'g') g = p[1];
  else if (p[0] === 'f' && keep.test(g)) {
    const f = p.slice(1).map(s => parseInt(s) - 1);
    // Above 5.95 the body is only head and neck. Below it the shoulders flare,
    // so keep just an elliptical neck down to cutY.
    if (f.every(i => { const [x, y, z] = v[i]; return y > 5.95 || (y > cutY && Math.hypot(x / 0.56, (z - 0.1) / 0.7) < 1); })) for (let k = 1; k + 1 < f.length; k++) tris.push(f[0], f[k], f[k + 1]);
  }
}
// The cut can leave slivers. Keep connected pieces of 100+ triangles (the head
// and both eyes); drop the rest.
{
  const parent = new Map();
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  for (const i of tris) if (!parent.has(i)) parent.set(i, i);
  for (let t = 0; t < tris.length; t += 3) { const r = find(tris[t]); parent.set(find(tris[t + 1]), r); parent.set(find(tris[t + 2]), find(r)); }
  const size = new Map();
  for (let t = 0; t < tris.length; t += 3) { const r = find(tris[t]); size.set(r, (size.get(r) ?? 0) + 1); }
  const kept = [];
  for (let t = 0; t < tris.length; t += 3) if (size.get(find(tris[t])) >= 100) kept.push(tris[t], tris[t + 1], tris[t + 2]);
  console.log('pieces', [...size.values()].sort((a, b) => b - a).join(' '));
  tris.length = 0; tris.push(...kept);
}
const remap = new Map(); const pos = [];
const idx = tris.map(i => { if (!remap.has(i)) { remap.set(i, remap.size); pos.push(...v[i]); } return remap.get(i); });
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
geo.setIndex(idx);
geo.computeBoundingBox();
// Centre on the skull, not the bounding box: x centred, y/z so the origin sits mid-head.
const bb = geo.boundingBox; const c = new THREE.Vector3(); bb.getCenter(c);
geo.translate(-c.x, -c.y, -c.z);
geo.computeVertexNormals(); geo.computeBoundingBox();
console.log('verts', remap.size, 'tris', tris.length / 3, 'bbox', geo.boundingBox.min.toArray().map(x=>x.toFixed(2)), geo.boundingBox.max.toArray().map(x=>x.toFixed(2)), 'shift', c.toArray().map(x=>x.toFixed(2)));
const P = new Float32Array(geo.attributes.position.array), N = new Float32Array(geo.attributes.normal.array), I = new Uint32Array(idx);
const bin = Buffer.concat([Buffer.from(P.buffer), Buffer.from(N.buffer), Buffer.from(I.buffer)]);
const json = {
  asset: { version: '2.0', generator: 'aslant extract.mjs', copyright: 'MakeHuman hm08 base mesh, CC0 1.0' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'head' }],
  meshes: [{ name: 'head', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] }],
  buffers: [{ byteLength: bin.length }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: P.byteLength, target: 34962 },
    { buffer: 0, byteOffset: P.byteLength, byteLength: N.byteLength, target: 34962 },
    { buffer: 0, byteOffset: P.byteLength + N.byteLength, byteLength: I.byteLength, target: 34963 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: P.length / 3, type: 'VEC3', min: geo.boundingBox.min.toArray(), max: geo.boundingBox.max.toArray() },
    { bufferView: 1, componentType: 5126, count: N.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5125, count: I.length, type: 'SCALAR' },
  ],
};
let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
const binP = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + js.length + 8 + binP.length, 8);
const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
fs.writeFileSync(out, Buffer.concat([header, ch(js.length, 0x4e4f534a), js, ch(binP.length, 0x004e4942), binP]));
console.log('wrote', out, fs.statSync(out).size);
