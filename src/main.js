import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ValueShader, greyOfLstar } from './values.js';
import { buildLoomis } from './loomis.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const status = (text) => ($('status').textContent = text);

// --- Renderer, scene, camera -------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// No tone mapping: the values should come from the light, not a film curve.
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// A long lens, like standing a few feet back from a cast.
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
const HOME = new THREE.Vector3(0, 0.15, 8.5);
camera.position.copy(HOME);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 2.5;
controls.maxDistance = 25;

// --- Lights -----------------------------------------------------------------
//
// The key light is set relative to the viewer, so orbiting reads as turning
// the head under a lamp that stays where you put it.

const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 2.2, bottom: -2.2, near: 0.5, far: 25 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.015;
scene.add(key, key.target);

const fill = new THREE.HemisphereLight(0xf3f1ec, 0x3a3734, 0.18);
scene.add(fill);

const light = { azimuth: -50, elevation: 35 };
const viewDir = new THREE.Vector3();

function placeKey() {
  const a = THREE.MathUtils.degToRad(light.azimuth);
  const e = THREE.MathUtils.degToRad(light.elevation);
  // View space: +z points back at the viewer, +x to their right.
  viewDir.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
  viewDir.applyQuaternion(camera.quaternion);
  key.target.position.copy(controls.target);
  key.position.copy(controls.target).addScaledVector(viewDir, 10);
}

// --- Head --------------------------------------------------------------------

const material = new THREE.MeshStandardMaterial({ color: 0xd9d4ca, roughness: 0.88, metalness: 0 });
const head = new THREE.Mesh(new THREE.BufferGeometry(), material);
head.castShadow = true;
head.receiveShadow = true;

const headGroup = new THREE.Group();
headGroup.add(head);
scene.add(headGroup);

const surfaces = { smooth: null, planes: null };

function planesFrom(smooth) {
  // Collapse edges until the scan reads as a planes head, then shade flat.
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', smooth.attributes.position.clone());
  g.setIndex(smooth.index.clone());
  const merged = mergeVertices(g);
  const keep = 700;
  const simplified = new SimplifyModifier().modify(merged, Math.max(merged.attributes.position.count - keep, 0));
  simplified.computeVertexNormals();
  return simplified;
}

function setSurface(kind) {
  if (!surfaces.smooth) return;
  if (kind === 'planes' && !surfaces.planes) surfaces.planes = planesFrom(surfaces.smooth);
  head.geometry = surfaces[kind];
  material.flatShading = kind === 'planes';
  material.needsUpdate = true;
  overlayHead.geometry = head.geometry;
}

// --- Overlay: Loomis lines, drawn after the value pass -----------------------
//
// The lines stay in their own colour whatever the value banding does. A
// depth-only copy of the head lets them hide behind it.

const overlay = new THREE.Scene();
const overlayRoot = new THREE.Group();
overlayRoot.matrixAutoUpdate = false;
overlay.add(overlayRoot);

const overlayHead = new THREE.Mesh(
  head.geometry,
  new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
);
overlayHead.renderOrder = 0;
const loomis = buildLoomis();
loomis.group.visible = false;
overlayRoot.add(overlayHead, loomis.group);
const eye = new THREE.Vector3();

// --- Post-processing ---------------------------------------------------------

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new OutputPass());
const values = new ShaderPass(ValueShader);
values.enabled = false;
composer.addPass(values);

// --- Frame -------------------------------------------------------------------

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  loomis.setSize(w, h);
}

function render() {
  controls.update();
  placeKey();
  headGroup.updateMatrixWorld();
  overlayRoot.matrix.copy(headGroup.matrixWorld);

  renderer.autoClear = true;
  composer.render();
  if (loomis.group.visible) {
    overlayRoot.updateMatrixWorld(true);
    loomis.update(overlayRoot.worldToLocal(eye.copy(camera.position)));
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(overlay, camera);
  }
}

renderer.setAnimationLoop(render);
window.addEventListener('resize', resize);
resize();

// --- Controls ----------------------------------------------------------------

function bindRange(id, format, apply) {
  const input = $(id);
  const out = document.querySelector(`output[for="${id}"]`);
  const update = () => {
    const v = Number(input.value);
    if (out) out.textContent = format(v);
    apply(v);
  };
  input.addEventListener('input', update);
  update();
}

const deg = (v) => `${v}°`;
bindRange('azimuth', deg, (v) => (light.azimuth = v));
bindRange('elevation', deg, (v) => (light.elevation = v));
bindRange('key', (v) => v.toFixed(1), (v) => (key.intensity = v));
bindRange('fill', (v) => v.toFixed(2), (v) => (fill.intensity = v));
bindRange('roll', deg, (v) => (headGroup.rotation.z = THREE.MathUtils.degToRad(v)));
bindRange('backdrop', (v) => `L* ${v}`, (v) => {
  const g = greyOfLstar(v);
  scene.background = new THREE.Color().setRGB(g, g, g, THREE.SRGBColorSpace);
});

$('shadows').addEventListener('change', (e) => {
  key.castShadow = e.target.checked;
});

$('loomis').addEventListener('change', (e) => {
  loomis.group.visible = e.target.checked;
});

for (const input of document.querySelectorAll('input[name="surface"]')) {
  input.addEventListener('change', () => {
    if (input.value === 'planes' && !surfaces.planes) status('Cutting planes…');
    // Let the status paint before the simplifier blocks the thread.
    requestAnimationFrame(() => setTimeout(() => {
      setSurface(input.value);
      status('');
    }));
  });
}

for (const input of document.querySelectorAll('input[name="steps"]')) {
  input.addEventListener('change', () => {
    const steps = Number(input.value);
    values.enabled = steps > 0;
    values.uniforms.uSteps.value = steps;
  });
}

$('reset').addEventListener('click', () => {
  controls.target.set(0, 0, 0);
  camera.position.copy(HOME);
  controls.update();
});

$('collapse').addEventListener('click', (e) => {
  const collapsed = $('panel').classList.toggle('collapsed');
  e.target.textContent = collapsed ? 'Show' : 'Hide';
  e.target.setAttribute('aria-expanded', String(!collapsed));
});

$('export').addEventListener('click', () => {
  render();
  renderer.domElement.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `aslant-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
});

// --- Load --------------------------------------------------------------------

new GLTFLoader().load(
  'models/head.glb',
  (gltf) => {
    let mesh = null;
    gltf.scene.traverse((o) => {
      if (o.isMesh && !mesh) mesh = o;
    });
    surfaces.smooth = mesh.geometry;
    const checked = document.querySelector('input[name="surface"]:checked').value;
    setSurface(checked);
    status('');
  },
  undefined,
  (err) => {
    console.error(err);
    status('Could not load the head.');
  },
);
