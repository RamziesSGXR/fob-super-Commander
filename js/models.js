// Every building, person and vehicle, built in code from simple shapes. Faction colours and the logo come in
// through the materials, so the same standard-issue buildings look like they belong to whoever built them.
// A model's origin is the centre of its footprint at ground level, front facing +z, one tile = one unit.
import * as THREE from './vendor/three.js';
import { logoCanvas } from './logo.js';

const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c; };

// ---------------------------------------------------------------- materials
export function makeMats(f) {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...o });
  const logo = new THREE.CanvasTexture(logoCanvas(f.logo, 256)); logo.colorSpace = THREE.SRGBColorSpace; logo.anisotropy = 4;
  const m = {
    concrete: std('#8d8f86'), wall: std('#a7a89c'), white: std('#d9dbd2'), dark: std('#2c302c'), metal: std('#6e7672', { metalness: 0.45, roughness: 0.5 }),
    steel: std('#4a514e', { metalness: 0.5, roughness: 0.45 }), sand: std('#b49a6a'), sandDark: std('#8e774f'), asphalt: std('#3f403d', { roughness: 0.95 }),
    prim: std(f.primary), primDark: std(shade(f.primary, 0.6)), sec: std(f.secondary), hazard: std('#ffd21f'), red: std('#b8322a'),
    glass: std('#9ad8ff', { metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.35 }),
    window: std('#1d2a33', { emissive: '#7fc8ff', emissiveIntensity: 0.25, roughness: 0.3 }),
    panel: std('#1b2a4a', { metalness: 0.6, roughness: 0.25 }), green: std('#4f8a3a'), green2: std('#77b84e'),
    water: std('#2a6d8f', { metalness: 0.5, roughness: 0.08 }), bronze: std('#8a6a3a', { metalness: 0.65, roughness: 0.35 }), gold: std('#d8b04a', { metalness: 0.8, roughness: 0.3 }),
    stone: std('#3b3d40'), e710: std('#1a1420', { metalness: 0.6, roughness: 0.15 }), rubber: std('#151515'),
    glowY: std('#3a2a00', { emissive: '#ffb020', emissiveIntensity: 1.4 }), glowB: std('#002033', { emissive: '#4db8ff', emissiveIntensity: 1.2 }),
    glowG: std('#002a10', { emissive: '#59ff8a', emissiveIntensity: 1.3 }), glowR: std('#300', { emissive: '#ff3a2a', emissiveIntensity: 1.3 }),
    cola: std('#b01f24'), colaFace: std('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.55 }),
    logo: std('#ffffff', { map: logo, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, roughness: 0.9 }),
    logoLit: std('#ffffff', { map: logo, emissiveMap: logo, emissive: '#ffffff', emissiveIntensity: 0.6, transparent: true, alphaTest: 0.05 }),
    skin: std('#c99a78'), uniform: std(new THREE.Color(f.primary).lerp(new THREE.Color('#9a9d92'), 0.45)), helmet: std(shade(f.primary, 0.75)), boots: std('#22251f'),
    coat: std('#141414'), cap: std('#e9e9e9'), paper: std('#f2f2ea'),
    pelican: std('#4c5550', { metalness: 0.35, roughness: 0.6 }), lift: std('#e0b21c'), crate: std('#5d6a3e'), scaffold: new THREE.LineBasicMaterial({ color: '#ffd21f', transparent: true, opacity: 0.8 }),
  };
  m.flag = flagMat(f, logo); m.banner = bannerMat(f); m.bill = billMat(f); m.tex = [logo, m.flag.map, m.banner.map, m.bill.map];
  return m;
}
function flagMat(f, logo) {
  const c = document.createElement('canvas'); c.width = 384; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = f.primary; g.fillRect(0, 0, 384, 256); g.fillStyle = f.secondary; g.fillRect(0, 0, 384, 18); g.fillRect(0, 238, 384, 18);
  g.drawImage(logo.image, 112, 48, 160, 160);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.9 });
}
function bannerMat(f) {
  const c = document.createElement('canvas'); c.width = 192; c.height = 384; const g = c.getContext('2d');
  g.fillStyle = f.primary; g.fillRect(0, 0, 192, 384);
  g.fillStyle = f.secondary; g.fillRect(14, 0, 10, 384); g.fillRect(168, 0, 10, 384);
  g.beginPath(); g.moveTo(0, 340); g.lineTo(96, 384); g.lineTo(192, 340); g.lineTo(192, 384); g.lineTo(0, 384); g.fill();
  const l = logoCanvas(f.logo, 160); g.drawImage(l, 16, 90, 160, 160);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.9 });
}
function billMat(f) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#0b0f0c'; g.fillRect(0, 0, 512, 256); g.fillStyle = f.primary; g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 512, 256);
  g.drawImage(logoCanvas(f.logo, 200), 20, 28, 200, 200);
  g.fillStyle = f.secondary; g.fillRect(236, 60, 256, 4);
  g.fillStyle = '#ffffff'; g.font = 'bold 30px ui-monospace, Menlo, Consolas, monospace'; g.textBaseline = 'top';
  wrap(g, f.name.toUpperCase(), 238, 76, 260, 34, 3);
  g.fillStyle = f.secondary; g.font = 'italic 20px Georgia, serif'; wrap(g, `"${f.motto}"`, 238, 190, 260, 24, 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.5, roughness: 0.6 });
}
export function wrap(g, text, x, y, w, lh, max) {
  const words = text.split(' '); let line = '', n = 0;
  for (const word of words) {
    const t = line ? line + ' ' + word : word;
    if (g.measureText(t).width > w && line) { g.fillText(line, x, y + n * lh); line = word; if (++n >= max) return; } else line = t;
  }
  if (line) g.fillText(line, x, y + n * lh);
}

// ---------------------------------------------------------------- shape helpers
function add(g, geo, mat, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = o.cast !== false; m.receiveShadow = true;
  if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
  g.add(m); return m;
}
const box = (g, w, h, d, mat, x, y, z, o) => add(g, new THREE.BoxGeometry(w, h, d), mat, x, y, z, o);
const cyl = (g, rt, rb, h, mat, x, y, z, o = {}) => add(g, new THREE.CylinderGeometry(rt, rb, h, o.seg || 14), mat, x, y, z, o);
const ball = (g, r, mat, x, y, z, o = {}) => add(g, new THREE.SphereGeometry(r, o.seg || 12, o.seg ? o.seg / 2 : 8), mat, x, y, z, o);
const plane = (g, w, h, mat, x, y, z, o) => add(g, new THREE.PlaneGeometry(w, h), mat, x, y, z, { cast: false, ...o });
function prism(g, len, w, h, mat, x, y, z) {   // a gable roof running along x
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); geo.translate(0, 0, -len / 2); geo.rotateY(Math.PI / 2);
  return add(g, geo, mat, x, y, z);
}
function sandbags(g, m, x, z, len, ry = 0) {
  const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = ry; g.add(s);
  for (let i = 0; i < Math.round(len / 0.22); i++) for (let r = 0; r < 2; r++) box(s, 0.2, 0.09, 0.14, r ? m.sandDark : m.sand, -len / 2 + 0.11 + i * 0.22 + (r ? 0.11 : 0), 0.05 + r * 0.09, 0);
}
function flagCloth(g, mat, w, h, x, y, z) {
  const geo = new THREE.PlaneGeometry(w, h, 10, 3); geo.translate(w / 2, 0, 0);
  const m = add(g, geo, mat, x, y, z); m.userData.wave = { w, base: geo.attributes.position.array.slice() };
  return m;
}
function slab(g, m, w, d, mat = m.concrete) { box(g, w - 0.08, 0.08, d - 0.08, mat, 0, 0.04, 0, { cast: false }); }

// ---------------------------------------------------------------- buildings
const MAKE = {
  hq(g, m) {
    slab(g, m, 3, 3);
    box(g, 2.5, 1.1, 2.1, m.wall, 0, 0.63, -0.2); box(g, 2.56, 0.08, 2.16, m.prim, 0, 1.22, -0.2);
    box(g, 1.5, 0.7, 1.3, m.wall, 0, 1.6, -0.4); box(g, 1.56, 0.08, 1.36, m.prim, 0, 1.98, -0.4);
    box(g, 2.3, 0.14, 0.03, m.window, 0, 0.95, 0.86); box(g, 1.3, 0.12, 0.03, m.window, 0, 1.72, 0.26);
    box(g, 0.5, 0.6, 0.05, m.dark, 0, 0.38, 0.87); box(g, 0.7, 0.06, 0.25, m.prim, 0, 0.72, 0.98);
    plane(g, 0.62, 0.62, m.logo, 0, 1.5, 0.27);
    cyl(g, 0.02, 0.03, 1.3, m.metal, 0.55, 2.6, -0.7); ball(g, 0.04, m.glowR, 0.55, 3.25, -0.7);
    const dish = new THREE.Group(); dish.position.set(-0.45, 2.15, -0.6); g.add(dish);
    cyl(dish, 0.02, 0.02, 0.25, m.metal, 0, -0.1, 0); add(dish, new THREE.SphereGeometry(0.25, 14, 6, 0, Math.PI * 2, 0, 1.0), m.white, 0, 0.05, 0, { rx: -0.9 });
    g.userData.spin = dish;
    sandbags(g, m, -0.95, 1.25, 0.8); sandbags(g, m, 0.95, 1.25, 0.8);
  },
  pad(g, m) {
    box(g, 2.9, 0.1, 2.9, m.asphalt, 0, 0.05, 0, { cast: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.08, 40), m.hazard); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.105; g.add(ring);
    box(g, 0.12, 0.01, 1.0, m.hazard, -0.32, 0.105, 0, { cast: false }); box(g, 0.12, 0.01, 1.0, m.hazard, 0.32, 0.105, 0, { cast: false }); box(g, 0.64, 0.01, 0.12, m.hazard, 0, 0.105, 0, { cast: false });
    for (const [x, z] of [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]]) box(g, 0.1, 0.08, 0.1, m.glowY, x, 0.14, z);
  },
  depot(g, m) {
    slab(g, m, 2, 2);
    for (const [x, z] of [[-0.85, -0.8], [0.85, -0.8], [-0.85, 0.8], [0.85, 0.8]]) box(g, 0.08, 1.0, 0.08, m.steel, x, 0.5, z);
    box(g, 1.9, 0.06, 1.8, m.prim, 0, 1.03, 0); box(g, 1.8, 0.85, 0.05, m.metal, 0, 0.45, -0.82);
    box(g, 1.9, 0.08, 0.06, m.hazard, 0, 0.98, 0.9);
    const crates = [];
    for (let i = 0; i < 12; i++) { const c = box(g, 0.32, 0.28, 0.32, i % 3 ? m.crate : m.e710, -0.55 + (i % 4) * 0.37, 0.22 + Math.floor(i / 8) * 0.29, -0.45 + (Math.floor(i / 4) % 2) * 0.37); crates.push(c); }
    g.userData.crates = crates;
  },
  solar(g, m) {
    for (let i = 0; i < 3; i++) {
      const x = -0.6 + i * 0.6;
      box(g, 0.05, 0.35, 0.05, m.steel, x, 0.18, 0.15); box(g, 0.05, 0.2, 0.05, m.steel, x, 0.1, -0.2);
      box(g, 0.55, 0.03, 0.75, m.panel, x, 0.36, 0, { rx: -0.45 });
    }
  },
  gen(g, m) {
    slab(g, m, 2, 2);
    box(g, 1.3, 0.85, 1.1, m.metal, -0.1, 0.5, -0.15); box(g, 1.35, 0.06, 1.15, m.prim, -0.1, 0.95, -0.15);
    for (const x of [-0.4, 0.05]) { cyl(g, 0.09, 0.11, 0.8, m.steel, x, 1.3, -0.4); box(g, 0.2, 0.06, 0.2, m.dark, x, 1.72, -0.4); }
    const glow = box(g, 0.9, 0.12, 0.03, m.glowY, -0.1, 0.55, 0.42); g.userData.glow = glow;
    cyl(g, 0.22, 0.22, 0.9, m.prim, 0.72, 0.3, 0.25, { rz: Math.PI / 2 }); box(g, 0.05, 0.05, 0.6, m.steel, 0.55, 0.5, -0.1);
  },
  pump(g, m) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), m.e710); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.02; g.add(pool);
    box(g, 1.2, 0.12, 0.4, m.concrete, 0, 0.06, 0, { cast: false });
    box(g, 0.08, 0.95, 0.08, m.steel, 0, 0.5, -0.12, { rx: 0.2 }); box(g, 0.08, 0.95, 0.08, m.steel, 0, 0.5, 0.12, { rx: -0.2 });
    const beam = new THREE.Group(); beam.position.set(0, 0.98, 0); g.add(beam);
    box(beam, 1.2, 0.1, 0.1, m.prim, 0, 0, 0); box(beam, 0.14, 0.32, 0.14, m.prim, 0.62, -0.08, 0); box(beam, 0.2, 0.2, 0.18, m.dark, -0.55, -0.12, 0);
    g.userData.beam = beam;
    cyl(g, 0.03, 0.03, 0.8, m.metal, 0.62, 0.45, 0);
    cyl(g, 0.3, 0.3, 0.7, m.metal, -0.6, 0.35, 0.6); box(g, 0.62, 0.08, 0.02, m.hazard, -0.6, 0.45, 0.91);
  },
  plant(g, m) {
    slab(g, m, 3, 2);
    box(g, 2.7, 1.1, 1.5, m.wall, 0, 0.6, -0.1);
    for (let i = 0; i < 3; i++) box(g, 0.9, 0.45, 1.5, m.prim, -0.9 + i * 0.9, 1.3, -0.1, { rz: 0.35 });
    for (let i = 0; i < 3; i++) box(g, 0.05, 0.3, 1.45, m.window, -0.55 + i * 0.9, 1.35, -0.1, { rz: 0.35 });
    cyl(g, 0.12, 0.16, 1.4, m.concrete, 0.95, 1.6, -0.55); cyl(g, 0.12, 0.16, 1.2, m.concrete, 1.25, 1.5, -0.25);
    g.userData.smoke = [[0.95, 2.35, -0.55], [1.25, 2.15, -0.25]];
    box(g, 0.8, 0.7, 0.05, m.dark, -0.4, 0.39, 0.67); box(g, 2.7, 0.08, 0.03, m.hazard, 0, 0.12, 0.66);
    box(g, 0.9, 0.1, 0.3, m.steel, 0.7, 0.35, 0.8); for (let i = 0; i < 3; i++) box(g, 0.18, 0.14, 0.18, m.crate, 0.45 + i * 0.25, 0.47, 0.8);
  },
  barracks(g, m) {
    slab(g, m, 3, 2);
    box(g, 2.7, 0.75, 1.5, m.wall, 0, 0.45, -0.1); prism(g, 2.8, 1.62, 0.45, m.prim, 0, 0.82, -0.1);
    for (let i = 0; i < 6; i++) if (i !== 2 && i !== 3) box(g, 0.25, 0.18, 0.03, m.window, -1.1 + i * 0.44, 0.55, 0.66);
    box(g, 0.4, 0.55, 0.05, m.dark, 0, 0.35, 0.66); box(g, 0.6, 0.06, 0.2, m.prim, 0, 0.66, 0.76);
    sandbags(g, m, -0.9, 0.85, 0.9); sandbags(g, m, 0.9, 0.85, 0.9);
  },
  parade(g, m) {
    box(g, 3.9, 0.06, 2.9, m.asphalt, 0, 0.03, 0, { cast: false });
    for (const [w, d, x, z] of [[3.7, 0.04, 0, 1.35], [3.7, 0.04, 0, -1.0], [0.04, 2.35, -1.85, 0.18], [0.04, 2.35, 1.85, 0.18]]) box(g, w, 0.01, d, m.sec, x, 0.065, z, { cast: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.45, 32), m.sec); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.066, 0.2); g.add(ring);
    box(g, 1.4, 0.25, 0.5, m.concrete, 0, 0.13, -1.2); box(g, 1.0, 0.2, 0.35, m.concrete, 0, 0.35, -1.27);
    box(g, 1.5, 0.04, 0.6, m.prim, 0, 0.95, -1.25); for (const x of [-0.7, 0.7]) box(g, 0.04, 0.6, 0.04, m.steel, x, 0.65, -1.25);
    for (const x of [-1.7, 1.7]) { cyl(g, 0.02, 0.025, 1.6, m.metal, x, 0.8, -1.3); flagCloth(g, m.flag, 0.6, 0.4, x, 1.4, -1.3); }
  },
  armory(g, m) {
    slab(g, m, 2, 2);
    box(g, 1.6, 0.7, 1.5, m.concrete, 0, 0.4, -0.05);
    for (const [x, z, ry] of [[-0.85, 0, Math.PI / 2], [0.85, 0, Math.PI / 2]]) sandbags(g, m, x, z, 1.4, ry);
    box(g, 1.7, 0.1, 1.6, m.primDark, 0, 0.8, -0.05);
    box(g, 0.6, 0.5, 0.05, m.steel, 0, 0.3, 0.72);
    for (let i = 0; i < 5; i++) box(g, 0.12, 0.08, 0.02, i % 2 ? m.dark : m.hazard, -0.24 + i * 0.12, 0.6, 0.73);
    cyl(g, 0.015, 0.015, 0.8, m.metal, 0.6, 1.2, -0.5);
  },
  hab(g, m) {
    slab(g, m, 2, 2);
    box(g, 1.75, 0.75, 1.05, m.white, 0, 0.46, -0.15);
    for (let i = 0; i < 8; i++) { box(g, 0.04, 0.72, 0.03, m.wall, -0.8 + i * 0.23, 0.46, 0.39); box(g, 0.04, 0.72, 0.03, m.wall, -0.8 + i * 0.23, 0.46, -0.69); }
    box(g, 1.78, 0.1, 0.03, m.prim, 0, 0.7, 0.4);
    box(g, 0.32, 0.5, 0.04, m.dark, -0.45, 0.34, 0.4); box(g, 0.4, 0.08, 0.3, m.metal, -0.45, 0.08, 0.58);
    box(g, 0.4, 0.2, 0.04, m.window, 0.35, 0.5, 0.41);
    for (const x of [-0.45, 0.42]) box(g, 0.75, 0.03, 0.85, m.panel, x, 0.92, -0.15, { rx: -0.3 });
    box(g, 1.75, 0.05, 1.05, m.metal, 0, 0.85, -0.15);
  },
  vend(g, m) {
    box(g, 0.34, 0.6, 0.26, m.cola, 0, 0.3, -0.05); box(g, 0.22, 0.38, 0.02, m.colaFace, -0.03, 0.35, 0.09);
    box(g, 0.05, 0.2, 0.02, m.glowB, 0.12, 0.38, 0.09); box(g, 0.36, 0.07, 0.28, m.hazard, 0, 0.63, -0.05);
  },
  mess(g, m) {
    slab(g, m, 3, 2);
    box(g, 2.6, 0.55, 1.3, m.wall, 0, 0.32, -0.15);
    add(g, new THREE.CylinderGeometry(0.66, 0.66, 2.62, 16, 1, false, 0, Math.PI), m.prim, 0, 0.6, -0.15, { rz: Math.PI / 2 });
    for (let i = 0; i < 4; i++) box(g, 0.3, 0.16, 0.03, m.window, -0.9 + i * 0.6, 0.4, 0.51);
    box(g, 0.4, 0.45, 0.04, m.dark, 0.6, 0.27, 0.52); box(g, 0.8, 0.15, 0.04, m.hazard, -0.3, 0.75, 0.52);
    for (const x of [-0.8, 0.2]) { box(g, 0.6, 0.04, 0.22, m.metal, x, 0.22, 0.8); box(g, 0.6, 0.03, 0.08, m.steel, x, 0.13, 0.65); box(g, 0.6, 0.03, 0.08, m.steel, x, 0.13, 0.95); }
    cyl(g, 0.06, 0.06, 0.3, m.steel, -1.0, 1.25, -0.3);
  },
  dome(g, m) {
    cyl(g, 0.88, 0.92, 0.14, m.concrete, 0, 0.07, 0, { seg: 24 });
    for (let i = 0; i < 9; i++) { const a = i * 0.7, r = 0.25 + (i % 3) * 0.17; add(g, new THREE.ConeGeometry(0.1 + (i % 2) * 0.05, 0.35 + (i % 3) * 0.1, 7), i % 2 ? m.green : m.green2, Math.cos(a) * r, 0.32, Math.sin(a) * r); }
    add(g, new THREE.SphereGeometry(0.84, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.glass, 0, 0.14, 0, { cast: false });
    for (let i = 0; i < 4; i++) add(g, new THREE.TorusGeometry(0.84, 0.012, 4, 24, Math.PI), m.metal, 0, 0.14, 0, { ry: i * Math.PI / 4 });
    box(g, 0.35, 0.4, 0.2, m.metal, 0, 0.2, 0.86);
  },
  truth(g, m) {
    slab(g, m, 2, 2);
    box(g, 1.6, 1.0, 1.3, m.white, 0, 0.55, -0.15); box(g, 1.65, 0.08, 1.35, m.glowB, 0, 1.08, -0.15);
    box(g, 1.1, 0.75, 0.05, m.dark, 0, 0.65, 0.52); plane(g, 0.62, 0.62, m.logoLit, 0, 0.65, 0.55);
    cyl(g, 0.015, 0.02, 1.0, m.metal, -0.6, 1.6, -0.5); ball(g, 0.05, m.glowB, -0.6, 2.12, -0.5);
    box(g, 0.35, 0.35, 0.04, m.dark, 0.6, 0.2, 0.52);
  },
  flag(g, m) {
    box(g, 0.4, 0.1, 0.4, m.concrete, 0, 0.05, 0);
    cyl(g, 0.02, 0.025, 2.2, m.metal, 0, 1.15, 0); ball(g, 0.05, m.gold, 0, 2.27, 0);
    flagCloth(g, m.flag, 0.9, 0.6, 0.02, 1.88, 0);
  },
  banner(g, m) {
    for (const x of [-0.35, 0.35]) cyl(g, 0.02, 0.025, 1.6, m.steel, x, 0.8, 0);
    box(g, 0.8, 0.03, 0.03, m.steel, 0, 1.55, 0);
    const b = flagCloth(g, m.banner, 0.55, 1.1, -0.275, 0.98, 0.02); b.userData.wave.soft = true;
  },
  speaker(g, m) {
    box(g, 0.25, 0.08, 0.25, m.concrete, 0, 0.04, 0); cyl(g, 0.025, 0.03, 1.5, m.steel, 0, 0.78, 0);
    box(g, 0.12, 0.12, 0.12, m.dark, 0, 1.5, 0);
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.3, h = new THREE.Group(); h.position.set(0, 1.5, 0); h.rotation.y = a; g.add(h);
      add(h, new THREE.ConeGeometry(0.11, 0.3, 10, 1, true), m.metal, 0, 0, 0.18, { rx: Math.PI / 2 }); }
  },
  billboard(g, m) {
    for (const x of [-0.7, 0.7]) box(g, 0.08, 1.2, 0.08, m.steel, x, 0.6, 0);
    box(g, 1.85, 0.95, 0.08, m.dark, 0, 1.45, 0); plane(g, 1.78, 0.89, m.bill, 0, 1.45, 0.045);
    box(g, 1.85, 0.06, 0.25, m.steel, 0, 1.95, 0.1); for (const x of [-0.6, 0, 0.6]) box(g, 0.08, 0.05, 0.08, m.glowY, x, 1.92, 0.22);
  },
  pool(g, m) {
    box(g, 2.85, 0.06, 1.85, m.white, 0, 0.03, 0, { cast: false });
    for (const [w, d, x, z] of [[2.6, 0.1, 0, 0.72], [2.6, 0.1, 0, -0.72], [0.1, 1.54, -1.25, 0], [0.1, 1.54, 1.25, 0]]) box(g, w, 0.16, d, m.concrete, x, 0.1, z);
    box(g, 2.4, 0.02, 1.34, m.water, 0, 0.11, 0, { cast: false });
    add(g, new THREE.CylinderGeometry(0.05, 0.13, 1.1, 4), m.white, 0, 0.6, -0.84, { ry: Math.PI / 4 });
    for (const x of [-0.9, 0.9]) box(g, 0.45, 0.06, 0.15, m.stone, x, 0.15, 0.87);
  },
  memorial(g, m) {
    box(g, 2.8, 0.08, 0.9, m.white, 0, 0.04, 0.05, { cast: false });
    box(g, 2.7, 0.8, 0.22, m.stone, 0, 0.48, -0.25); box(g, 2.78, 0.06, 0.28, m.dark, 0, 0.9, -0.25);
    plane(g, 0.28, 0.28, m.logo, 0, 0.72, -0.135);
    const pl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.05, 0.01), m.gold, 64); pl.count = 0;
    for (let i = 0; i < 64; i++) { const r = Math.floor(i / 16), c = i % 16, mx = new THREE.Matrix4(); mx.setPosition(-1.2 + c * 0.16 + (c >= 8 ? 0.34 : 0) - (c >= 8 ? 0 : 0), 0.58 - r * 0.09, -0.135); pl.setMatrixAt(i, mx); }
    g.add(pl); g.userData.plaques = pl;
    add(g, new THREE.TorusGeometry(0.12, 0.035, 6, 14), m.green, 0, 0.3, -0.12);
  },
  statue(g, m) {
    box(g, 1.7, 0.2, 1.7, m.concrete, 0, 0.1, 0); box(g, 1.1, 0.7, 1.1, m.white, 0, 0.55, 0);
    plane(g, 0.5, 0.5, m.logo, 0, 0.55, 0.56); box(g, 1.2, 0.06, 1.2, m.concrete, 0, 0.93, 0);
    const f = new THREE.Group(); f.position.set(0, 0.96, 0); f.scale.setScalar(2.1); g.add(f);
    box(f, 0.07, 0.22, 0.08, m.bronze, -0.05, 0.11, 0); box(f, 0.07, 0.22, 0.08, m.bronze, 0.05, 0.11, 0.04, { rx: -0.3 });
    box(f, 0.2, 0.24, 0.12, m.bronze, 0, 0.34, 0); ball(f, 0.06, m.bronze, 0, 0.52, 0); add(f, new THREE.SphereGeometry(0.068, 10, 6, 0, 6.3, 0, 1.6), m.bronze, 0, 0.53, 0);
    box(f, 0.05, 0.22, 0.05, m.bronze, -0.13, 0.36, 0.03, { rz: 0.2 });
    const arm = box(f, 0.05, 0.24, 0.05, m.bronze, 0.14, 0.53, 0, { rz: -0.25 });
    cyl(f, 0.008, 0.008, 0.35, m.bronze, 0.19, 0.72, 0); box(f, 0.13, 0.08, 0.005, m.bronze, 0.26, 0.84, 0);
    add(f, new THREE.PlaneGeometry(0.24, 0.32), m.bronze, 0, 0.3, -0.07, { rx: 0.15 }).material = m.bronze;
    void arm;
  },
};

export function buildModel(type, m) {
  const g = new THREE.Group(); (MAKE[type] || MAKE.hab)(g, m); return g;
}

// ---------------------------------------------------------------- people and vehicles
export function makePerson(m, kind = 'troop') {
  const g = new THREE.Group(), body = kind === 'inspector' ? m.coat : m.uniform;
  const leg = (x) => { const p = new THREE.Group(); p.position.set(x, 0.2, 0); g.add(p); box(p, 0.05, 0.2, 0.06, m.boots, 0, -0.1, 0); return p; };
  const arm = (x) => { const p = new THREE.Group(); p.position.set(x, 0.38, 0); g.add(p); box(p, 0.045, 0.17, 0.05, body, 0, -0.08, 0); ball(p, 0.022, m.skin, 0, -0.17, 0, { seg: 6 }); return p; };
  const parts = { legL: leg(-0.035), legR: leg(0.035), armL: arm(-0.085), armR: arm(0.085) };
  parts.torso = box(g, 0.13, 0.19, 0.08, body, 0, 0.3, 0);
  parts.head = new THREE.Group(); parts.head.position.set(0, 0.44, 0); g.add(parts.head);
  ball(parts.head, 0.045, m.skin, 0, 0, 0, { seg: 8 });
  if (kind === 'inspector') { cyl(parts.head, 0.055, 0.05, 0.03, m.cap, 0, 0.035, 0, { seg: 10 }); box(parts.head, 0.07, 0.01, 0.04, m.coat, 0, 0.025, 0.05); box(parts.armR, 0.07, 0.09, 0.005, m.paper, 0, -0.12, 0.04); }
  else { add(parts.head, new THREE.SphereGeometry(0.055, 10, 5, 0, 6.3, 0, 1.5), m.helmet, 0, 0.005, 0); box(g, 0.1, 0.12, 0.05, m.helmet, 0, 0.32, -0.06); }
  g.userData.parts = parts;
  return g;
}
export function makeForklift(m) {
  const g = new THREE.Group();
  box(g, 0.3, 0.16, 0.42, m.lift, 0, 0.13, -0.04);
  for (const [x, z] of [[-0.15, 0.1], [0.15, 0.1], [-0.15, -0.18], [0.15, -0.18]]) cyl(g, 0.06, 0.06, 0.05, m.rubber, x, 0.06, z, { rz: Math.PI / 2, seg: 10 });
  for (const x of [-0.1, 0.1]) box(g, 0.03, 0.55, 0.03, m.steel, x, 0.32, 0.19);
  for (const x of [-0.07, 0.07]) box(g, 0.03, 0.02, 0.3, m.steel, x, 0.06, 0.34);
  for (const [x, z] of [[-0.13, -0.02], [0.13, -0.02], [-0.13, -0.22], [0.13, -0.22]]) box(g, 0.02, 0.32, 0.02, m.dark, x, 0.37, z);
  box(g, 0.3, 0.02, 0.24, m.lift, 0, 0.53, -0.12);
  box(g, 0.1, 0.12, 0.07, m.uniform, 0, 0.3, -0.12); ball(g, 0.04, m.helmet, 0, 0.4, -0.12, { seg: 8 });
  box(g, 0.05, 0.05, 0.05, m.glowY, 0, 0.56, -0.12);
  return g;
}
export function makeCrate(m) {
  const g = new THREE.Group(); box(g, 0.3, 0.26, 0.3, m.crate, 0, 0.13, 0); box(g, 0.31, 0.05, 0.31, m.hazard, 0, 0.19, 0); return g;
}
export function makePelican(m) {
  const g = new THREE.Group();
  box(g, 0.8, 0.65, 2.3, m.pelican, 0, 0.75, 0); box(g, 0.7, 0.45, 0.5, m.glass, 0, 0.85, 1.25, { rx: 0.3 });
  box(g, 0.35, 0.3, 1.4, m.pelican, 0, 0.95, -1.7); box(g, 0.06, 0.6, 0.6, m.pelican, 0, 1.3, -2.25);
  box(g, 1.2, 0.05, 0.4, m.pelican, 0, 1.05, -2.25);
  box(g, 3.0, 0.08, 0.6, m.pelican, 0, 1.05, -0.2);
  const engines = [];
  for (const x of [-1.5, 1.5]) { const e = cyl(g, 0.22, 0.22, 0.7, m.steel, x, 1.0, -0.2, { rx: Math.PI / 2 }); engines.push(e); box(g, 0.3, 0.06, 0.3, m.glowB, x, 0.78, -0.2); }
  for (const x of [-0.35, 0.35]) box(g, 0.05, 0.4, 1.5, m.steel, x, 0.22, 0);
  box(g, 0.82, 0.04, 2.0, m.hazard, 0, 0.42, 0.05);
  box(g, 0.08, 0.06, 0.08, m.glowR, -1.5, 1.1, 0.15); box(g, 0.08, 0.06, 0.08, m.glowG, 1.5, 1.1, 0.15);
  g.userData.engines = engines;
  return g;
}
