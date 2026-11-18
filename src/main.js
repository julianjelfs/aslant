import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { ValueShader, greyOfLstar } from './values.js';
import { buildLoomis } from './loomis.js';
import { createLightBall, describeDir, anglesOf } from './lightball.js';
import { DARK_L, LIGHT_L } from './values.js';
import { kelvinAt, positionOf, rgbOfKelvin, describeKelvin, trackGradient, cssOfKelvin } from './kelvin.js';

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
// Aim at the middle of the whole bust (models/head.glb runs from y -2.02 at
// the base to 1.32 at the crown), from far enough back to leave a margin.
const AIM = new THREE.Vector3(0, -0.35, 0);
const HOME = new THREE.Vector3(0, -0.2, 9.2);
camera.position.copy(HOME);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(AIM);
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
Object.assign(key.shadow.camera, { left: -2.6, right: 2.6, top: 2.6, bottom: -2.6, near: 0.5, far: 25 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.015;
scene.add(key, key.target);

const fill = new THREE.HemisphereLight(0xf3f1ec, 0x3a3734, 0.18);
scene.add(fill);

// View space: +z points back at the viewer, +x to their right, +y up.
const lightDir = new THREE.Vector3();
const viewDir = new THREE.Vector3();

function placeKey() {
  viewDir.copy(lightDir).applyQuaternion(camera.quaternion);
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
  frame();
  loomis.setSize(w, h);
}

// Centre the head in the space the panel leaves. On a desktop the panel sits
// at the right, so the picture shifts left by half its width. On a phone it's
// a sheet along the bottom, so the picture shifts up and shrinks to fit above
// it. The camera itself doesn't move, so orbiting still turns about the head.
function frame() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const panel = $('panel').getBoundingClientRect();
  const sheet = panel.width >= w - 1;
  if (sheet) {
    const covered = Math.max(0, h - panel.top);
    camera.zoom = Math.min(1, ((h - covered) / h) * 1.15);
    camera.setViewOffset(w, h, 0, covered / 2, w, h);
  } else {
    camera.zoom = 1;
    const covered = Math.max(0, w - panel.left);
    camera.setViewOffset(w, h, covered / 2, 0, w, h);
  }
  camera.updateProjectionMatrix();
}

new ResizeObserver(frame).observe($('panel'));

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

// Every slider shows how far along it is through --fill, which the CSS uses
// to paint the track up to the thumb.
function bindRange(id, format, apply) {
  const input = $(id);
  const out = document.querySelector(`output[for="${id}"]`);
  const update = () => {
    const v = Number(input.value);
    const min = Number(input.min);
    const max = Number(input.max);
    input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
    if (out) out.textContent = format(v);
    apply(v);
  };
  input.addEventListener('input', update);
  update();
}

// The lit sphere. Its shading follows the scene's lights and the value pass,
// so it is kept in step whenever any of those change.
const ball = createLightBall($('ball'), {
  onChange: (d) => {
    lightDir.set(d.x, d.y, d.z);
    showWhere(d);
  },
});

function showWhere(d) {
  const { azimuth, elevation } = anglesOf(d);
  $('where').textContent = describeDir(d);
  $('where-deg').textContent = `${Math.round(azimuth)}° · ${Math.round(elevation)}°`;
}

function syncBall() {
  ball.set({
    key: key.color.toArray(),
    strength: key.intensity,
    sky: fill.color.toArray(),
    ground: fill.groundColor.toArray(),
    fill: fill.intensity,
    albedo: material.color.toArray(),
    steps: values.enabled ? values.uniforms.uSteps.value : 0,
  });
}

ball.setDir(ball.dir);

const deg = (v) => `${v}°`;
// Exposure and reflected light.
//
// The value bands are absolute L*, as in Askance, so the picture has to span
// the scale for every band to show. The lamp is therefore exposed for the
// light, the way a photographer would: at 100% strength, a plane facing the
// lamp squarely lands at L* 95 whatever colour the lamp is. Strength scales
// that exposure.
//
// Reflected light is set as a share of the lit side's brightness: "1/12 of
// the lamp" means a plane in shadow is a twelfth as bright as one facing the
// lamp. It's worked out in luminance, so its colour doesn't change how much
// it lifts the shadows. The fill is a hemisphere light, which reaches a
// side-facing shadow plane at about 0.59 of its intensity (halfway between
// the sky and the dimmer bounce from below).
const TARGET_Y = 0.88; // relative luminance of L* 95
const HEMI_SIDE = 0.59;
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

let strength = 1;
let reflected = 1 / 12;

// Slider 0..100: none, then 1/32 up to 1/2 on a log scale.
const reflectedAt = (t) => (t <= 0 ? 0 : 1 / (32 / 16 ** (t / 100)));

function applyLight() {
  const albedo = lum(material.color);
  const lit = TARGET_Y * strength;
  key.intensity = (lit * Math.PI * (1 - reflected)) / (albedo * lum(key.color));
  fill.intensity = reflected > 0 ? (reflected * lit * Math.PI) / (albedo * lum(fill.color) * HEMI_SIDE) : 0;
  syncBall();
}

bindRange('key', (v) => `${v}%`, (v) => {
  strength = v / 100;
  applyLight();
});
bindRange('fill', (v) => (v <= 0 ? 'None' : `1/${Math.round(1 / reflectedAt(v))} of the lamp`), (v) => {
  reflected = reflectedAt(v);
  applyLight();
});

// Colour temperature. The key defaults to noon sun and the reflected light to north sky, roughly the
// way a lamp and a north window light a studio.
function bindKelvin(id, kelvin, apply) {
  const input = $(id);
  input.value = Math.round(positionOf(kelvin) * 1000);
  input.style.setProperty('--track', trackGradient());
  bindRange(id, (v) => describeKelvin(kelvinAt(v / 1000)), (v) => {
    const k = kelvinAt(v / 1000);
    input.style.setProperty('--thumb', cssOfKelvin(k));
    const [r, g, b] = rgbOfKelvin(k);
    apply(new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace));
    applyLight();
  });
}

bindKelvin('key-k', 5600, (c) => key.color.copy(c));
bindKelvin('fill-k', 8500, (c) => {
  fill.color.copy(c);
  // Light bounced up from below: the same colour, much dimmer.
  fill.groundColor.copy(c).multiplyScalar(0.18);
});

bindRange('roll', deg, (v) => (headGroup.rotation.z = THREE.MathUtils.degToRad(v)));

// Roll by gesture as well as by slider. Both go through the slider, so it
// always shows the head's roll. Positive roll tips the crown to the left.
function nudgeRoll(by) {
  const input = $('roll');
  const v = THREE.MathUtils.clamp(Number(input.value) + by, Number(input.min), Number(input.max));
  if (Math.round(v) === Number(input.value)) return;
  input.value = Math.round(v);
  input.dispatchEvent(new Event('input'));
}

// Trackpad: a horizontal two-finger swipe rolls, a vertical one zooms. Each
// gesture locks to the axis it starts on, so a slightly diagonal swipe does
// one thing. This listener runs in the capture phase on the stage, ahead of
// OrbitControls on the canvas, and keeps rolls away from it. It also stops
// Chrome reading a horizontal swipe as Back.
{
  const ROLL_PER_PX = 0.15;
  let axis = null;
  let last = 0;
  let pending = 0;
  $('stage').addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) return; // pinch-zoom on a trackpad arrives as ctrl+wheel
      const now = performance.now();
      if (now - last > 200) axis = null;
      last = now;
      if (!axis) {
        if (Math.abs(e.deltaX) < 1 && Math.abs(e.deltaY) < 1) return;
        axis = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? 'x' : 'y';
        pending = 0;
      }
      if (axis !== 'x') return;
      e.preventDefault();
      e.stopPropagation();
      pending += e.deltaX * ROLL_PER_PX;
      const whole = Math.trunc(pending);
      if (whole) {
        nudgeRoll(whole);
        pending -= whole;
      }
    },
    { capture: true, passive: false },
  );
}

// Touch: twisting two fingers rolls the head, alongside OrbitControls' own
// two-finger pinch and move. The head turns with the fingers.
{
  const touches = new Map();
  let lastAngle = null;
  let pending = 0; // a slow twist moves less than a degree per event
  const angle = () => {
    const [a, b] = [...touches.values()];
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  };
  const stage = $('stage');
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastAngle = touches.size === 2 ? angle() : null;
  });
  stage.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size !== 2 || lastAngle === null) return;
    const a = angle();
    let d = a - lastAngle;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    lastAngle = a;
    // Screen y points down, so a clockwise twist is positive here and tips the
    // crown right, which is negative roll.
    pending -= d;
    const whole = Math.trunc(pending);
    if (whole) {
      nudgeRoll(whole);
      pending -= whole;
    }
  });
  const lift = (e) => {
    touches.delete(e.pointerId);
    lastAngle = touches.size === 2 ? angle() : null;
  };
  stage.addEventListener('pointerup', lift);
  stage.addEventListener('pointercancel', lift);
}

{
  const stops = [];
  for (let i = 0; i <= 10; i++) {
    const g = Math.round(greyOfLstar(i * 10) * 255);
    stops.push(`rgb(${g} ${g} ${g}) ${i * 10}%`);
  }
  $('backdrop').style.setProperty('--track', `linear-gradient(90deg, ${stops.join(', ')})`);
}
bindRange('backdrop', (v) => `L* ${v}`, (v) => {
  const g = greyOfLstar(v);
  scene.background = new THREE.Color().setRGB(g, g, g, THREE.SRGBColorSpace);
  $('backdrop').style.setProperty('--thumb', `rgb(${Array(3).fill(Math.round(g * 255)).join(' ')})`);
});

$('loomis').addEventListener('change', (e) => {
  loomis.group.visible = e.target.checked;
});

// Each values choice draws the ladder it would give: the even L* steps
// between Askance's darkest and lightest grey, or a smooth ramp for Off.
for (const ramp of document.querySelectorAll('.ramp')) {
  const n = Number(ramp.dataset.steps);
  if (n === 0) {
    const a = Math.round(greyOfLstar(DARK_L) * 255);
    const b = Math.round(greyOfLstar(LIGHT_L) * 255);
    ramp.style.background = `linear-gradient(90deg, rgb(${a} ${a} ${a}), rgb(${b} ${b} ${b}))`;
    continue;
  }
  for (let i = 0; i < n; i++) {
    const g = Math.round(greyOfLstar(DARK_L + ((LIGHT_L - DARK_L) * i) / (n - 1)) * 255);
    const band = document.createElement('i');
    band.style.background = `rgb(${g} ${g} ${g})`;
    ramp.append(band);
  }
}

for (const input of document.querySelectorAll('input[name="steps"]')) {
  input.addEventListener('change', () => {
    const steps = Number(input.value);
    values.enabled = steps > 0;
    values.uniforms.uSteps.value = steps;
    syncBall();
  });
}

$('reset').addEventListener('click', () => {
  controls.target.copy(AIM);
  camera.position.copy(HOME);
  controls.update();
});

$('collapse').addEventListener('click', (e) => {
  const button = e.currentTarget;
  const collapsed = $('panel').classList.toggle('collapsed');
  button.setAttribute('aria-expanded', String(!collapsed));
  button.setAttribute('aria-label', collapsed ? 'Show controls' : 'Hide controls');
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
  `models/head.glb?v=${new URL(import.meta.url).searchParams.get('v') ?? ''}`,
  (gltf) => {
    gltf.scene.traverse((o) => {
      if (o.isMesh && o.name === 'head') {
        head.geometry = o.geometry;
        overlayHead.geometry = o.geometry;
      }
    });
    status('');
  },
  undefined,
  (err) => {
    console.error(err);
    status('Could not load the head.');
  },
);
