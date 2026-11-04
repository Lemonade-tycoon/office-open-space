import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------------------
// Layout (metres). Room spans x: -14..14, z: -9..9. Front (z = +9) is open.
//   Work zone    : back-left   (5 pods x 4 desks = 20 seats)
//   Meeting room : back-right  (glass room, 6 seats)
//   Cafe tables  : centre-right
//   Pantry       : right wall  (bar counter, island, coffee, fridge)
//   Chill zone   : front-left  (bleacher steps, bean bags, sofa, swing chair)
// ---------------------------------------------------------------------------
const ROOM = { minX: -14, maxX: 14, minZ: -9, maxZ: 9, h: 4 };

const PALETTE = {
  cream: 0xfff4e6,
  wood: 0xc8925a,
  woodLight: 0xe0b98a,
  woodDark: 0x8a5a36,
  terracotta: 0xe07a5f,
  coral: 0xf4a261,
  mustard: 0xe9c46a,
  sage: 0x8ab17d,
  sageDark: 0x5f8a5a,
  lilac: 0xb8a9e3,
  pink: 0xf7a1b5,
  teal: 0x2a9d8f,
  charcoal: 0x2b2d31,
  white: 0xfafafa,
  leaf: 0x4f8f4a,
  leafLight: 0x7cbf6a,
};
const CHAIR_COLORS = [PALETTE.mustard, PALETTE.coral, PALETTE.sage, PALETTE.lilac, PALETTE.pink];

// ---------------------------------------------------------------------------
// Renderer, scene, camera
// ---------------------------------------------------------------------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const DAY_SKY = new THREE.Color(0xcfe6f5);
const NIGHT_SKY = new THREE.Color(0x141a33);
scene.background = DAY_SKY.clone();

const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envMap;

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(2, 21, 25);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.0, ...opts }));
  }
  return matCache.get(key);
}

function addMesh(geo, material, x, y, z, parent = scene, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  parent.add(m);
  return m;
}

function box(w, h, d, color, x, y, z, parent = scene, opts) {
  const material = color instanceof THREE.Material ? color : mat(color);
  return addMesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent, opts);
}

function cyl(rt, rb, h, color, x, y, z, parent = scene, seg = 24, opts) {
  const material = color instanceof THREE.Material ? color : mat(color);
  return addMesh(new THREE.CylinderGeometry(rt, rb, h, seg), material, x, y, z, parent, opts);
}

function sphere(r, color, x, y, z, parent = scene, opts) {
  const material = color instanceof THREE.Material ? color : mat(color);
  return addMesh(new THREE.SphereGeometry(r, 24, 16), material, x, y, z, parent, opts);
}

function group(x = 0, y = 0, z = 0, rotY = 0, parent = scene) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  parent.add(g);
  return g;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Things that glow at night (neon, bulbs, screens) and the lamps that switch on.
const glowMaterials = [];
const nightLights = [];
function glowMat(color, dayIntensity = 0.4, nightIntensity = 3) {
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: dayIntensity, roughness: 0.4 });
  m.userData = { dayIntensity, nightIntensity };
  glowMaterials.push(m);
  return m;
}

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xfff6e8, 0xb59a7a, 1.2);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.position.set(-12, 22, -16);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// ---------------------------------------------------------------------------
// Floors
// ---------------------------------------------------------------------------
// Outside ground
addMesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), mat(0xa7c98f), 0, -0.02, 0, scene, { cast: false });

// Warm wood plank floor for the whole office
const woodTex = canvasTexture(512, 512, (g, w, h) => {
  g.fillStyle = '#d9a873'; g.fillRect(0, 0, w, h);
  const plank = h / 8;
  for (let i = 0; i < 8; i++) {
    const shade = 200 + Math.floor(Math.random() * 30);
    g.fillStyle = `rgb(${shade}, ${Math.floor(shade * 0.72)}, ${Math.floor(shade * 0.45)})`;
    g.fillRect(0, i * plank, w, plank - 2);
    g.fillStyle = 'rgba(90,55,25,0.35)';
    g.fillRect(0, i * plank + plank - 2, w, 2);
    const off = (i % 2) * (w / 2) + Math.random() * 60;
    g.fillRect((off) % w, i * plank, 2, plank);
  }
});
woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
woodTex.repeat.set(7, 5);
const floorMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.6 });
addMesh(new THREE.PlaneGeometry(28, 18).rotateX(-Math.PI / 2), floorMat, 0, 0, 0, scene, { cast: false });

// Terrazzo floor for the pantry + cafe
const terrazzoTex = canvasTexture(512, 512, (g, w, h) => {
  g.fillStyle = '#f3ebe1'; g.fillRect(0, 0, w, h);
  const chips = ['#e07a5f', '#e9c46a', '#8ab17d', '#b8a9e3', '#f7a1b5', '#c9b8a6'];
  for (let i = 0; i < 900; i++) {
    g.fillStyle = chips[i % chips.length];
    g.beginPath();
    const r = 2 + Math.random() * 6;
    g.ellipse(Math.random() * w, Math.random() * h, r, r * (0.5 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
});
terrazzoTex.wrapS = terrazzoTex.wrapT = THREE.RepeatWrapping;
terrazzoTex.repeat.set(3, 3);
addMesh(new THREE.PlaneGeometry(10, 12).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ map: terrazzoTex, roughness: 0.35 }), 9, 0.005, 2.6, scene, { cast: false });

// ---------------------------------------------------------------------------
// Walls (back wall has big windows; left wall sage; right wall terracotta)
// ---------------------------------------------------------------------------
const H = ROOM.h;
// Back wall with windows
{
  const z = ROOM.minZ;
  const wallMat = mat(PALETTE.cream);
  box(28.4, 0.8, 0.2, wallMat, 0, 0.4, z);            // sill band
  box(28.4, 0.6, 0.2, wallMat, 0, H - 0.3, z);        // header band
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe3f2, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.1 });
  for (let x = -14; x <= 14.01; x += 3.5) box(0.18, H - 1.4, 0.22, PALETTE.charcoal, x, 0.8 + (H - 1.4) / 2, z);
  addMesh(new THREE.BoxGeometry(28, H - 1.4, 0.05), glass, 0, 0.8 + (H - 1.4) / 2, z, scene, { cast: false, receive: false });
}
// Left wall (sage, the chill + work side)
box(0.2, H, 18.4, PALETTE.sage, ROOM.minX, H / 2, 0);
// Right wall (terracotta, behind the pantry)
box(0.2, H, 18.4, PALETTE.terracotta, ROOM.maxX, H / 2, 0);
// Short front returns either side of the entrance
box(4, 1.1, 0.2, PALETTE.cream, -12, 0.55, ROOM.maxZ);
box(4, 1.1, 0.2, PALETTE.cream, 12, 0.55, ROOM.maxZ);

// Structural columns
for (const [x, z] of [[-7.5, -2.8], [3, -2.8], [-7.5, 3.4], [3, 3.4]]) {
  cyl(0.25, 0.25, H, PALETTE.white, x, H / 2, z);
}

// Trees outside the windows for a nicer view
for (let i = 0; i < 9; i++) {
  const x = -13 + i * 3.3 + (i % 2) * 0.8;
  const z = -13 - (i % 3) * 1.5;
  cyl(0.15, 0.2, 2.4, PALETTE.woodDark, x, 1.2, z);
  sphere(1.4 + (i % 3) * 0.3, PALETTE.leaf, x, 3.2, z);
}

// ---------------------------------------------------------------------------
// Furniture builders
// ---------------------------------------------------------------------------
function plant(x, z, scale = 1, parent = scene, potColor = PALETTE.terracotta) {
  const g = group(x, 0, z, 0, parent);
  g.scale.setScalar(scale);
  cyl(0.28, 0.22, 0.5, potColor, 0, 0.25, 0, g);
  const leafMat = [mat(PALETTE.leaf), mat(PALETTE.leafLight), mat(PALETTE.sageDark)];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = i === 0 ? 0 : 0.22;
    const leaf = addMesh(new THREE.IcosahedronGeometry(0.3 + (i % 3) * 0.06, 0), leafMat[i % 3],
      Math.cos(a) * r, 0.75 + (i % 3) * 0.18, Math.sin(a) * r, g);
    leaf.scale.y = 1.4;
  }
  return g;
}

function smallPlant(x, y, z, parent = scene) {
  cyl(0.07, 0.06, 0.12, PALETTE.white, x, y + 0.06, z, parent, 12);
  sphere(0.11, PALETTE.leafLight, x, y + 0.2, z, parent);
}

function officeChair(x, z, rotY, color, parent = scene) {
  const g = group(x, 0, z, rotY, parent);
  const seat = mat(color);
  box(0.5, 0.08, 0.5, seat, 0, 0.48, 0, g);
  box(0.5, 0.55, 0.08, seat, 0, 0.8, 0.24, g);
  cyl(0.03, 0.03, 0.4, PALETTE.charcoal, 0, 0.26, 0, g, 8);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = box(0.28, 0.03, 0.04, PALETTE.charcoal, Math.cos(a) * 0.14, 0.05, Math.sin(a) * 0.14, g);
    leg.rotation.y = -a;
  }
  return g;
}

function deskWithSetup(x, z, rotY, chairColor, parent = scene, seatNo = 0) {
  const g = group(x, 0, z, rotY, parent);
  // Desk: 1.4 x 0.75, light wood top on white legs
  box(1.4, 0.04, 0.75, PALETTE.woodLight, 0, 0.74, 0, g);
  for (const sx of [-0.66, 0.66]) box(0.04, 0.72, 0.7, PALETTE.white, sx, 0.36, 0, g);
  // Monitor
  box(0.6, 0.36, 0.03, PALETTE.charcoal, 0, 1.1, -0.22, g);
  const screen = glowMat(seatNo % 2 ? 0x9fd3ff : 0xffd6a5, 0.25, 0.9);
  addMesh(new THREE.PlaneGeometry(0.56, 0.32), screen, 0, 1.1, -0.204, g, { cast: false });
  box(0.05, 0.18, 0.05, PALETTE.charcoal, 0, 0.85, -0.24, g);
  box(0.2, 0.02, 0.15, PALETTE.charcoal, 0, 0.77, -0.24, g);
  // Keyboard + mug + tiny plant
  box(0.42, 0.02, 0.14, PALETTE.white, 0, 0.77, 0.05, g);
  cyl(0.04, 0.04, 0.09, CHAIR_COLORS[(seatNo + 2) % 5], 0.45, 0.8, 0.05, g, 12);
  smallPlant(-0.5, 0.76, -0.2, g);
  // Chair
  officeChair(0, 0.6, 0, chairColor, g);
  return g;
}

// A pod of 4 desks (2 facing 2) with a planter divider in the middle.
let seatCounter = 0;
function deskPod(cx, cz) {
  const g = group(cx, 0, cz);
  const offs = [[-0.72, -0.62, Math.PI], [0.72, -0.62, Math.PI], [-0.72, 0.62, 0], [0.72, 0.62, 0]];
  offs.forEach(([x, z, r]) => {
    deskWithSetup(x, z, r, CHAIR_COLORS[seatCounter % CHAIR_COLORS.length], g, seatCounter);
    seatCounter++;
  });
  // Planter divider with greenery between facing desks
  box(2.8, 0.35, 0.3, PALETTE.white, 0, 0.93, 0, g);
  for (let i = -3; i <= 3; i++) {
    const leaf = addMesh(new THREE.IcosahedronGeometry(0.18, 0), mat(i % 2 ? PALETTE.leaf : PALETTE.leafLight), i * 0.4, 1.2, 0, g);
    leaf.scale.y = 1.3;
  }
  return g;
}

function loungeChair(x, z, rotY, color, parent = scene) {
  const g = group(x, 0, z, rotY, parent);
  box(0.5, 0.06, 0.5, color, 0, 0.46, 0, g);
  box(0.5, 0.45, 0.06, color, 0, 0.72, 0.22, g);
  for (const [lx, lz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) {
    cyl(0.02, 0.02, 0.45, PALETTE.woodDark, lx, 0.22, lz, g, 8);
  }
  return g;
}

function stool(x, z, color, parent = scene) {
  cyl(0.2, 0.2, 0.08, color, x, 0.75, z, parent);
  cyl(0.025, 0.025, 0.72, PALETTE.charcoal, x, 0.37, z, parent, 8);
  cyl(0.18, 0.18, 0.02, PALETTE.charcoal, x, 0.01, z, parent);
  return parent;
}

function pendantLamp(x, y, z, color = PALETTE.mustard, withLight = true) {
  cyl(0.008, 0.008, H - y, PALETTE.charcoal, x, y + (H - y) / 2, z, scene, 6, { cast: false });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.3, 24, 1, true), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
  shade.position.set(x, y, z);
  scene.add(shade);
  addMesh(new THREE.SphereGeometry(0.08, 12, 8), glowMat(0xffe2a8, 0.6, 4), x, y - 0.12, z, scene, { cast: false });
  if (withLight) {
    const l = new THREE.PointLight(0xffc98a, 0, 7, 1.5);
    l.position.set(x, y - 0.3, z);
    scene.add(l);
    nightLights.push({ light: l, night: 3.5 });
  }
}

function neonSign(text, x, y, z, rotY, color, width = 4, fontSize = 110) {
  const height = width * 0.25;
  const tex = canvasTexture(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = `italic 700 ${fontSize}px "Brush Script MT", "Segoe Script", cursive`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#ffffff';
    g.strokeText(text, w / 2, h / 2);
    g.fillStyle = '#ffffff';
    g.fillText(text, w / 2, h / 2);
  });
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveMap: tex, alphaMap: tex, transparent: true, emissiveIntensity: 1.2 });
  m.userData = { dayIntensity: 1.2, nightIntensity: 4 };
  glowMaterials.push(m);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), m);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  scene.add(mesh);
  const l = new THREE.PointLight(color, 0, 6, 1.5);
  l.position.set(x + Math.sin(rotY) * 0.8, y, z + Math.cos(rotY) * 0.8);
  scene.add(l);
  nightLights.push({ light: l, night: 4 });
}

function rug(x, z, rx, rz, color, pattern = true) {
  const tex = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    if (!pattern) return;
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 14;
    for (let r = 60; r < 260; r += 55) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, Math.PI * 2); g.stroke(); }
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  m.scale.set(rx, 1, rz);
  m.position.set(x, 0.012, z);
  m.receiveShadow = true;
  scene.add(m);
}

// ---------------------------------------------------------------------------
// WORK ZONE: 5 pods x 4 desks = 20 seats
// ---------------------------------------------------------------------------
deskPod(-11, -6.3);
deskPod(-5.5, -6.3);
deskPod(0, -6.3);
deskPod(-11, -0.2);
deskPod(-5.5, -0.2);

// Shelf / locker wall between work and chill zones with plants on top
{
  const g = group(-9, 0, 2.6);
  box(6, 1.1, 0.4, PALETTE.white, 0, 0.55, 0, g);
  for (let i = 0; i < 6; i++) box(0.9, 0.9, 0.02, CHAIR_COLORS[i % 5], -2.5 + i, 0.55, 0.21, g, { cast: false });
  for (let i = 0; i < 5; i++) smallPlant(-2.4 + i * 1.2, 1.1, 0, g);
}
plant(-13.3, -8.3, 1.2);
plant(2.2, -1.5, 1.0);
plant(-13.3, 1.9, 1.1);

// Whiteboard on left wall for quick stand-ups
box(0.05, 1.2, 2.4, PALETTE.white, ROOM.minX + 0.13, 1.6, -3);
box(0.06, 1.3, 2.5, PALETTE.charcoal, ROOM.minX + 0.12, 1.6, -3, scene, { cast: false });

// Pendant lamps over the pods
for (const [x, z] of [[-11, -6.3], [-5.5, -6.3], [0, -6.3], [-11, -0.2], [-5.5, -0.2]]) {
  pendantLamp(x - 0.7, 2.6, z, PALETTE.white, false);
  pendantLamp(x + 0.7, 2.6, z, PALETTE.white, true);
}

// ---------------------------------------------------------------------------
// MEETING ROOM: glass box, back-right
// ---------------------------------------------------------------------------
{
  const x0 = 3.6, x1 = 9.6, z0 = ROOM.minZ, z1 = -3.6;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const glass = new THREE.MeshStandardMaterial({ color: 0xcdeeea, transparent: true, opacity: 0.22, roughness: 0.05 });
  const frame = mat(PALETTE.teal);
  const wh = 2.8;
  // side walls
  for (const x of [x0, x1]) {
    addMesh(new THREE.BoxGeometry(0.04, wh, z1 - z0), glass, x, wh / 2, cz, scene, { cast: false, receive: false });
    box(0.08, 0.08, z1 - z0, frame, x, wh, cz);
  }
  // front wall with door gap
  addMesh(new THREE.BoxGeometry(4.6, wh, 0.04), glass, x0 + 2.3, wh / 2, z1, scene, { cast: false, receive: false });
  box(6, 0.08, 0.08, frame, cx, wh, z1);
  box(0.08, wh, 0.08, frame, x0 + 4.6, wh / 2, z1);
  // frosted band so it reads as glass
  addMesh(new THREE.BoxGeometry(4.6, 0.25, 0.05), mat(0xffffff, { transparent: true, opacity: 0.6 }), x0 + 2.3, 1.2, z1, scene, { cast: false });
  // table + 6 chairs
  box(3, 0.05, 1.2, PALETTE.wood, cx, 0.74, cz, scene);
  box(0.1, 0.72, 0.8, PALETTE.charcoal, cx - 1.2, 0.36, cz);
  box(0.1, 0.72, 0.8, PALETTE.charcoal, cx + 1.2, 0.36, cz);
  [-1, 0, 1].forEach((i) => {
    loungeChair(cx + i * 0.95, cz - 1.0, 0, PALETTE.teal);
    loungeChair(cx + i * 0.95, cz + 1.0, Math.PI, PALETTE.mustard);
  });
  // TV screen on right wall
  box(0.06, 1.0, 1.8, PALETTE.charcoal, x1 - 0.08, 1.6, cz);
  addMesh(new THREE.PlaneGeometry(1.7, 0.92), glowMat(0x7fd1c7, 0.3, 1.2), x1 - 0.12, 1.6, cz, scene, { cast: false })
    .rotation.y = -Math.PI / 2;
  plant(x0 + 0.5, z0 + 0.6, 0.9);
  pendantLamp(cx, 2.3, cz, PALETTE.teal, true);
}

// Two phone / focus booths next to the meeting room
for (const [i, color] of [[0, PALETTE.lilac], [1, PALETTE.coral]]) {
  const g = group(11.0 + i * 1.6, 0, -7.8);
  box(1.4, 2.4, 0.08, color, 0, 1.2, -0.65, g);
  box(0.08, 2.4, 1.4, color, -0.68, 1.2, 0, g);
  box(0.08, 2.4, 1.4, color, 0.68, 1.2, 0, g);
  box(1.4, 0.08, 1.4, color, 0, 2.4, 0, g);
  box(0.9, 0.04, 0.45, PALETTE.woodLight, 0, 1.0, -0.4, g);
  stool(0, 0.1, PALETTE.charcoal, g);
}

// ---------------------------------------------------------------------------
// CAFE TABLES (centre-right): casual seating between work and pantry
// ---------------------------------------------------------------------------
for (const [x, z, c] of [[5.0, 0.0, PALETTE.pink], [7.8, 0.0, PALETTE.mustard], [5.0, 3.0, PALETTE.sage], [7.8, 3.0, PALETTE.lilac]]) {
  cyl(0.5, 0.5, 0.04, PALETTE.white, x, 0.74, z);
  cyl(0.04, 0.04, 0.72, PALETTE.charcoal, x, 0.36, z, scene, 8);
  cyl(0.25, 0.25, 0.02, PALETTE.charcoal, x, 0.01, z);
  loungeChair(x - 0.75, z, Math.PI / 2, c);
  loungeChair(x + 0.75, z, -Math.PI / 2, c);
  cyl(0.04, 0.035, 0.1, PALETTE.white, x + 0.15, 0.81, z, scene, 12); // coffee cup
}

// ---------------------------------------------------------------------------
// PANTRY / CAFE BAR (right wall)
// ---------------------------------------------------------------------------
{
  const wx = ROOM.maxX - 0.45;  // counter centre x along right wall
  const z0 = -3, z1 = 6;
  const len = z1 - z0, cz = (z0 + z1) / 2;
  // Back counter
  box(0.8, 0.9, len, PALETTE.sage, wx, 0.45, cz);
  box(0.84, 0.05, len + 0.04, PALETTE.white, wx, 0.92, cz);
  // Upper open shelves with jars and cups
  for (const y of [1.7, 2.2]) {
    box(0.35, 0.04, len - 2, PALETTE.wood, ROOM.maxX - 0.25, y, cz);
    for (let i = 0; i < 12; i++) {
      cyl(0.06, 0.06, 0.14, CHAIR_COLORS[(i + (y > 2 ? 2 : 0)) % 5], ROOM.maxX - 0.25, y + 0.09, z0 + 1.3 + i * 0.55, scene, 10);
    }
  }
  // Fridge (tall, retro mint) and coffee machine
  box(0.8, 2.0, 0.8, 0x9ad9c4, wx, 1.0, z1 + 0.5);
  box(0.04, 0.6, 0.04, PALETTE.white, wx - 0.42, 1.3, z1 + 0.2);
  box(0.5, 0.5, 0.4, PALETTE.charcoal, wx - 0.05, 1.2, z0 + 0.8);
  cyl(0.05, 0.05, 0.12, PALETTE.white, wx - 0.22, 1.0, z0 + 0.8, scene, 10);
  // Sink
  box(0.5, 0.04, 0.6, 0xb0b8c0, wx, 0.95, z0 + 3);
  cyl(0.02, 0.02, 0.3, 0xb0b8c0, wx + 0.2, 1.1, z0 + 3, scene, 8);
  // Fruit bowl, kettle, microwave
  box(0.5, 0.3, 0.4, PALETTE.white, wx, 1.1, z0 + 5.5);
  sphere(0.07, PALETTE.coral, wx - 0.1, 1.0, z0 + 7, scene);
  sphere(0.07, PALETTE.mustard, wx + 0.05, 1.0, z0 + 7.1, scene);
  sphere(0.07, 0x7cbf6a, wx, 1.0, z0 + 6.9, scene);

  // Island bar with stools (faces the room)
  const ix = 10.6;
  box(0.9, 1.0, 4.4, PALETTE.woodLight, ix, 0.5, 1.5);
  box(1.1, 0.06, 4.6, PALETTE.white, ix, 1.03, 1.5);
  // fluted front strips (cafe style)
  for (let i = 0; i < 18; i++) box(0.04, 0.95, 0.12, PALETTE.wood, ix - 0.47, 0.48, -0.6 + i * 0.25, scene, { cast: false });
  for (let i = 0; i < 4; i++) stool(ix - 1.0, -0.2 + i * 1.15, CHAIR_COLORS[i % 5]);
  for (let i = 0; i < 3; i++) pendantLamp(ix, 2.4, 0 + i * 1.5, [PALETTE.coral, PALETTE.mustard, PALETTE.pink][i], true);

  // Menu board
  const menu = canvasTexture(512, 768, (g, w, h) => {
    g.fillStyle = '#2b2d31'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e9c46a'; g.lineWidth = 10; g.strokeRect(16, 16, w - 32, h - 32);
    g.fillStyle = '#ffffff'; g.textAlign = 'center';
    g.font = 'bold 64px "Segoe UI", sans-serif'; g.fillText('PANTRY', w / 2, 110);
    g.font = '40px "Segoe UI", sans-serif';
    const items = ['Iced Latte', 'Matcha', 'Teh Tarik', 'Kopi O', 'Cold Brew', 'Snacks & Fruit'];
    items.forEach((t, i) => { g.fillStyle = ['#f4a261', '#8ab17d', '#e9c46a', '#f7a1b5', '#b8a9e3', '#ffffff'][i]; g.fillText(t, w / 2, 220 + i * 80); });
    g.fillStyle = '#ffffff'; g.font = 'italic 34px "Segoe UI", sans-serif'; g.fillText('free for the team :)', w / 2, 720);
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.95), new THREE.MeshStandardMaterial({ map: menu }));
  board.position.set(ROOM.maxX - 0.12, 2.9, cz + 3.6);
  board.rotation.y = -Math.PI / 2;
  scene.add(board);

  neonSign('but first, coffee', ROOM.maxX - 0.12, 3.0, cz - 1.5, -Math.PI / 2, 0xff7aa8, 4.2, 100);
  plant(ROOM.maxX - 0.5, 7.6, 1.2);
}

// ---------------------------------------------------------------------------
// CHILL ZONE (front-left): bleacher steps, bean bags, sofa, swing chair
// ---------------------------------------------------------------------------
rug(-6.5, 6.0, 3.6, 2.4, '#b8a9e3', true);
{
  // Bleacher / tiered seating against the left wall
  const bx = ROOM.minX + 1.5;
  for (let t = 0; t < 3; t++) {
    box(1.0, 0.45, 5.6, PALETTE.woodLight, bx - t * 0.9 + 0.9, 0.225 + t * 0.45, 6.0, scene);
    box(1.0, 0.45 * (t + 1), 5.6, PALETTE.wood, bx - t * 0.9 + 0.9, 0.225 * (t + 1), 6.0, scene).scale.set(0.98, 1, 0.98);
  }
  // Cushions on the steps
  const cushionColors = [PALETTE.coral, PALETTE.mustard, PALETTE.pink, PALETTE.sage, PALETTE.lilac];
  for (let t = 0; t < 3; t++) {
    for (let i = 0; i < 4; i++) {
      box(0.55, 0.1, 0.55, cushionColors[(t + i) % 5], bx - t * 0.9 + 0.9, 0.5 + t * 0.45, 4.0 + i * 1.3);
    }
  }
  neonSign('good vibes only', ROOM.minX + 0.12, 3.0, 6.0, Math.PI / 2, 0x7af0ff, 4.4, 110);

  // Bean bags
  for (const [x, z, c] of [[-7.8, 5.0, PALETTE.mustard], [-6.6, 7.4, PALETTE.coral], [-8.4, 7.0, PALETTE.teal]]) {
    const b = sphere(0.55, c, x, 0.35, z);
    b.scale.set(1, 0.65, 1);
  }
  // Round coffee table on the rug
  cyl(0.6, 0.6, 0.06, PALETTE.white, -6.2, 0.42, 6.0);
  cyl(0.45, 0.45, 0.4, PALETTE.woodLight, -6.2, 0.2, 6.0);
  smallPlant(-6.0, 0.45, 5.9);

  // L-shaped sofa (pink velvet vibe)
  const sofa = group(-3.4, 0, 6.4, 0);
  const sofaMat = mat(PALETTE.pink, { roughness: 0.95 });
  box(1.0, 0.42, 3.2, sofaMat, 0, 0.21, 0, sofa);
  box(0.3, 0.45, 3.2, sofaMat, 0.35, 0.65, 0, sofa);
  box(2.2, 0.42, 1.0, sofaMat, -0.6, 0.21, 1.6, sofa);
  box(2.2, 0.45, 0.3, sofaMat, -0.6, 0.65, 1.95, sofa);
  box(0.5, 0.3, 0.12, PALETTE.mustard, 0.1, 0.6, -0.9, sofa).rotation.y = 0.3;
  box(0.5, 0.3, 0.12, PALETTE.lilac, -1.2, 0.6, 1.75, sofa);

  // Hanging egg / swing chair
  const swing = group(-1.6, 0, 3.9);
  cyl(0.01, 0.01, H - 2.0, PALETTE.charcoal, 0, 2.0 + (H - 2.0) / 2, 0, swing, 6, { cast: false });
  const egg = addMesh(new THREE.SphereGeometry(0.6, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), mat(PALETTE.woodLight, { side: THREE.DoubleSide }), 0, 1.15, 0, swing);
  egg.rotation.x = Math.PI;
  egg.rotation.z = 0.0;
  const eggPivot = egg;
  eggPivot.rotation.set(Math.PI + 0.35, 0, 0);
  sphere(0.4, PALETTE.white, 0, 0.75, 0.05, swing).scale.set(1, 0.3, 1);

  // Game corner: arcade cabinet + foosball-ish table
  const arc = group(-0.6, 0, 8.2, Math.PI);
  box(0.7, 1.7, 0.7, PALETTE.lilac, 0, 0.85, 0, arc);
  addMesh(new THREE.PlaneGeometry(0.5, 0.4), glowMat(0x7af0ff, 0.6, 2.5), 0, 1.35, -0.36, arc, { cast: false }).rotation.y = Math.PI;
  box(0.7, 0.1, 0.4, PALETTE.charcoal, 0, 1.0, -0.45, arc);

  // String lights across the chill zone
  const bulbMat = glowMat(0xffe7b0, 0.8, 5);
  const a = new THREE.Vector3(ROOM.minX + 0.2, 3.6, 3.4);
  const b = new THREE.Vector3(-1.2, 3.6, 8.6);
  for (let k = 0; k < 3; k++) {
    const off = k * 1.6;
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      p.z += off - 1.6; p.x += off * 0.4;
      p.y -= Math.sin(t * Math.PI) * 0.6;
      addMesh(new THREE.SphereGeometry(0.05, 8, 6), bulbMat, p.x, p.y, p.z, scene, { cast: false, receive: false });
    }
  }
  for (const [x, z] of [[-9, 5.5], [-5, 6.5]]) {
    const l = new THREE.PointLight(0xffd59a, 0, 7, 1.5);
    l.position.set(x, 3.0, z);
    scene.add(l);
    nightLights.push({ light: l, night: 5 });
  }

  // Lots of plants (biophilic = happy brain)
  plant(-13.2, 8.4, 1.3, scene, PALETTE.mustard);
  plant(-4.2, 8.4, 1.0, scene, PALETTE.white);
  plant(-9.6, 3.6, 0.9);
  plant(0.6, 4.8, 1.1, scene, PALETTE.lilac);
}

// Hanging plants from the ceiling line across the office
for (const [x, z] of [[-8, -3], [-2.5, -3], [5, 1.5], [-9.5, -3.2], [6.5, 6.5]]) {
  cyl(0.006, 0.006, 1.0, PALETTE.charcoal, x, H - 0.5, z, scene, 4, { cast: false });
  cyl(0.18, 0.14, 0.22, PALETTE.white, x, H - 1.1, z, scene, 16);
  for (let i = 0; i < 5; i++) {
    const a2 = (i / 5) * Math.PI * 2;
    const leaf = addMesh(new THREE.IcosahedronGeometry(0.12, 0), mat(PALETTE.leafLight), x + Math.cos(a2) * 0.18, H - 1.35 - (i % 2) * 0.25, z + Math.sin(a2) * 0.18);
    leaf.scale.y = 2;
  }
}

// Entrance mat + welcome sign
box(2.4, 0.01, 1.2, PALETTE.charcoal, 0, 0.01, 8.3, scene, { cast: false });

// ---------------------------------------------------------------------------
// Post-processing (bloom for neon at night)
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.25, 1.1);
bloom.enabled = false;
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------------------
// Controls: Orbit, Walk (pointer lock + WASD), Top view, zone presets
// ---------------------------------------------------------------------------
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 0, 0);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI / 2.05;
orbit.minDistance = 3;
orbit.maxDistance = 60;
orbit.update();

const walk = new PointerLockControls(camera, document.body);
let mode = 'orbit';
const keys = {};
const helpEl = document.getElementById('help');
const crosshair = document.getElementById('crosshair');
const btns = { orbit: document.getElementById('btn-orbit'), walk: document.getElementById('btn-walk'), top: document.getElementById('btn-top') };

function setActive(name) {
  Object.entries(btns).forEach(([k, b]) => b.classList.toggle('active', k === name));
}

let tween = null;
function flyTo(pos, target, duration = 1.2) {
  tween = {
    fromPos: camera.position.clone(), toPos: new THREE.Vector3(...pos),
    fromTarget: orbit.target.clone(), toTarget: new THREE.Vector3(...target),
    start: performance.now(), duration,
  };
}

function enterOrbit(pos, target) {
  if (mode === 'walk') walk.unlock();
  mode = 'orbit';
  orbit.enabled = true;
  crosshair.hidden = true;
  helpEl.textContent = 'Drag to rotate · Scroll to zoom · Right-drag to pan';
  setActive('orbit');
  if (pos) flyTo(pos, target);
}

btns.orbit.addEventListener('click', () => enterOrbit([2, 21, 25], [0, 0, 0]));
btns.top.addEventListener('click', () => {
  enterOrbit([0, 34, 0.5], [0, 0, 0]);
  setActive('top');
});
btns.walk.addEventListener('click', () => {
  if (matchMedia('(pointer: coarse)').matches) {
    helpEl.textContent = 'Walk mode needs a mouse + keyboard. Use the zone buttons on mobile.';
    return;
  }
  tween = null;
  mode = 'walk';
  orbit.enabled = false;
  camera.position.set(0, 1.6, 8.0);
  camera.lookAt(0, 1.6, 0);
  walk.lock();
});
walk.addEventListener('lock', () => {
  setActive('walk');
  crosshair.hidden = false;
  helpEl.textContent = 'WASD / arrows to walk · Mouse to look · Shift to run · Esc to exit';
});
walk.addEventListener('unlock', () => {
  if (mode !== 'walk') return;
  // Leave walk mode: orbit around a point in front of where we were looking.
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const target = camera.position.clone().addScaledVector(dir, 4);
  target.y = 0.8;
  mode = 'orbit';
  orbit.enabled = true;
  orbit.target.copy(target);
  crosshair.hidden = true;
  helpEl.textContent = 'Drag to rotate · Scroll to zoom · Right-drag to pan';
  setActive('orbit');
});

const PRESETS = {
  work: [[-1, 6.5, 5], [-6, 0.5, -3.5]],
  pantry: [[5.5, 3.4, 7.8], [12.2, 1.0, 1.0]],
  chill: [[-1.5, 3.8, 1.8], [-9, 0.8, 6.5]],
  meeting: [[6.6, 5.6, 2.2], [6.6, 0.6, -6.3]],
};
document.querySelectorAll('[data-goto]').forEach((b) => {
  b.addEventListener('click', () => {
    const [pos, target] = PRESETS[b.dataset.goto];
    enterOrbit(pos, target);
  });
});

window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// Night mode
const nightChk = document.getElementById('chk-night');
function applyNight(on) {
  scene.background.copy(on ? NIGHT_SKY : DAY_SKY);
  hemi.intensity = on ? 0.12 : 1.2;
  sun.intensity = on ? 0.15 : 2.2;
  sun.color.set(on ? 0x8899ff : 0xfff1d6);
  scene.environment = on ? null : envMap;
  glowMaterials.forEach((m) => { m.emissiveIntensity = on ? m.userData.nightIntensity : m.userData.dayIntensity; });
  nightLights.forEach(({ light, night }) => { light.intensity = on ? night : 0; });
  bloom.enabled = on;
}
nightChk.addEventListener('change', () => applyNight(nightChk.checked));

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const velocity = new THREE.Vector3();

function updateWalk(dt) {
  const speed = (keys.ShiftLeft || keys.ShiftRight ? 5 : 2.6);
  const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const side = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  velocity.set(side, 0, fwd);
  if (velocity.lengthSq() > 0) velocity.normalize().multiplyScalar(speed * dt);
  walk.moveForward(velocity.z);
  walk.moveRight(velocity.x);
  const p = camera.position;
  p.x = THREE.MathUtils.clamp(p.x, ROOM.minX + 0.4, ROOM.maxX - 0.4);
  p.z = THREE.MathUtils.clamp(p.z, ROOM.minZ + 0.4, ROOM.maxZ + 4);
  p.y = 1.6;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (tween) {
    const t = Math.min((performance.now() - tween.start) / (tween.duration * 1000), 1);
    const k = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
    orbit.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
    if (t >= 1) tween = null;
  }

  if (mode === 'walk' && walk.isLocked) updateWalk(dt);
  else orbit.update();

  composer.render();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

animate();
document.getElementById('loading').classList.add('done');
console.log(`Office ready: ${seatCounter} work seats`);
