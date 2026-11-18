// Turns the Sketchfab download of "Head Planes Reference" by zsoltsulyok
// (CC BY 4.0, https://sketchfab.com/3d-models/head-planes-reference-7b6167ae3e484f1884ae0491a491e856)
// into models/head.glb: one mesh, POSITION + NORMAL + 16-bit indices.
//
//   npm install
//   node tool/prepare-head.mjs ~/Downloads/head_planes_reference.glb models/head.glb
//
// The download is 378k triangles in four chunks under a scaled, rotated node.
// This bakes the transforms, welds the chunks, and lets meshoptimizer cut it
// to TRIANGLES. At 60k the surface moves by about 0.01% of the head's height,
// under a pixel at full screen, and the file drops from 10 MB to about 1 MB.
//
// It then scales and moves the head so the Loomis ball has radius ~1 and sits
// just above the origin, which is where the camera orbits. The Loomis fit in
// src/loomis.js is measured in these output units.

import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/meshopt_simplifier.module.js';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: node tool/prepare-head.mjs <download.glb> <out.glb>');
  process.exit(1);
}

const TRIANGLES = 60000;

// Measured on the download (y up, face towards +z), in its own units after
// the node transforms: brow 0.34 above the base, crown 0.481, ball centre
// 0.007 behind the origin in z.
const SCALE = 6.95;
const ORIGIN_ABOVE_BASE = 0.29;
const BALL_Z = -0.007;

await MeshoptSimplifier.ready;

const buf = fs.readFileSync(src);
const gltf = await new Promise((resolve, reject) =>
  new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', resolve, reject),
);
gltf.scene.updateMatrixWorld(true);

const parts = [];
gltf.scene.traverse((o) => {
  if (o.isMesh) parts.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
});
const vertexCount = parts.reduce((n, g) => n + g.attributes.position.count, 0);
const indexCount = parts.reduce((n, g) => n + g.index.count, 0);
const pos = new Float32Array(vertexCount * 3);
const idx = new Uint32Array(indexCount);
let vo = 0;
let io = 0;
for (const g of parts) {
  pos.set(g.attributes.position.array, vo * 3);
  const I = g.index.array;
  for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo;
  vo += g.attributes.position.count;
  io += I.length;
}

let geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setIndex(new THREE.BufferAttribute(idx, 1));
geo = mergeVertices(geo, 1e-6);
geo.computeBoundingBox();
const baseY = geo.boundingBox.min.y;

const [kept, error] = MeshoptSimplifier.simplify(
  new Uint32Array(geo.index.array),
  geo.attributes.position.array,
  3,
  TRIANGLES * 3,
  1,
  ['LockBorder'],
);

// Compact to the vertices the simplified mesh still uses.
const remap = new Map();
const P = geo.attributes.position.array;
const outPos = [];
const outIdx = new Uint16Array(kept.length);
for (let i = 0; i < kept.length; i++) {
  const v = kept[i];
  if (!remap.has(v)) {
    remap.set(v, remap.size);
    outPos.push(P[v * 3] * SCALE, (P[v * 3 + 1] - baseY - ORIGIN_ABOVE_BASE) * SCALE, (P[v * 3 + 2] - BALL_Z) * SCALE);
  }
  outIdx[i] = remap.get(v);
}
if (remap.size > 65535) throw new Error(`${remap.size} vertices will not fit 16-bit indices`);

const head = new THREE.BufferGeometry();
head.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
head.setIndex(new THREE.BufferAttribute(outIdx, 1));
head.computeVertexNormals();
head.computeBoundingBox();

console.log(
  `${geo.index.count / 3} -> ${kept.length / 3} triangles, ${remap.size} vertices,`,
  `max drift ${(error * 100).toFixed(4)}% of size,`,
  'bbox', head.boundingBox.min.toArray().map((x) => +x.toFixed(2)), head.boundingBox.max.toArray().map((x) => +x.toFixed(2)),
);

// Minimal GLB: one buffer, three views.
const arrays = [
  [new Float32Array(head.attributes.position.array), 34962],
  [new Float32Array(head.attributes.normal.array), 34962],
  [outIdx, 34963],
];
const bufferViews = [];
const chunks = [];
let offset = 0;
for (const [arr, target] of arrays) {
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: arr.byteLength, target });
  chunks.push(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
  offset += arr.byteLength;
}
const bin = Buffer.concat(chunks);
const json = {
  asset: {
    version: '2.0',
    generator: 'aslant tool/prepare-head.mjs',
    copyright: '"Head Planes Reference" by zsoltsulyok, CC BY 4.0, reduced and rescaled',
    extras: {
      title: 'Head Planes Reference',
      author: 'zsoltsulyok (https://sketchfab.com/zsoltsulyok)',
      license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
      source: 'https://sketchfab.com/3d-models/head-planes-reference-7b6167ae3e484f1884ae0491a491e856',
      changes: `Reduced from 378k to ${kept.length / 3} triangles, welded, rescaled and recentred.`,
    },
  },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'head' }],
  meshes: [{ name: 'head', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] }],
  buffers: [{ byteLength: bin.length }],
  bufferViews,
  accessors: [
    { bufferView: 0, componentType: 5126, count: remap.size, type: 'VEC3', min: head.boundingBox.min.toArray(), max: head.boundingBox.max.toArray() },
    { bufferView: 1, componentType: 5126, count: remap.size, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: outIdx.length, type: 'SCALAR' },
  ],
};
let js = Buffer.from(JSON.stringify(json));
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const binP = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + js.length + 8 + binP.length, 8);
const chunk = (len, type) => {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(len, 0);
  b.writeUInt32LE(type, 4);
  return b;
};
fs.writeFileSync(out, Buffer.concat([header, chunk(js.length, 0x4e4f534a), js, chunk(binP.length, 0x004e4942), binP]));
console.log('wrote', out, fs.statSync(out).size, 'bytes');
