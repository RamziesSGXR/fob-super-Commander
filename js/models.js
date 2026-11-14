// Every building, person and vehicle, built in code from simple shapes. Faction colours and the logo come in
// through the materials, so the same standard-issue buildings look like they belong to whoever built them.
// A model's origin is the centre of its footprint at ground level, front facing +z, one tile = one unit.
import * as THREE from './vendor/three.js';
import { logoCanvas, lookOf } from './logo.js';

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
    skin: std('#c99a78'), uniform: std(lookOf(f).uniform), helmet: std(lookOf(f).helmet), armband: std(lookOf(f).armband), crestOn: lookOf(f).crest, boots: std('#22251f'),
    hdArmour: std('#17181a', { metalness: 0.4, roughness: 0.5 }), hdGold: std('#e0b21c', { metalness: 0.5, roughness: 0.4 }), hair: std('#3b2f25'),
    civ0: std('#c9c2ad'), civ1: std('#7d8b99'), civ2: std('#a3b18a'), trim: std('#2a3038', { roughness: 0.7 }),
    floodPool: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      return new THREE.MeshBasicMaterial({ color: '#fff3d0', map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }); })(),
    coat: std('#141414'), cap: std('#e9e9e9'), paper: std('#f2f2ea'),
    pelican: std('#4c5550', { metalness: 0.35, roughness: 0.6 }), olive: std('#4d5638', { metalness: 0.3, roughness: 0.7 }), oliveDark: std('#33392a', { metalness: 0.3, roughness: 0.7 }), lift: std('#e0b21c'), crate: std('#5d6a3e'), scaffold: new THREE.LineBasicMaterial({ color: '#ffd21f', transparent: true, opacity: 0.8 }),
  };
  m.seflag = seFlagMat(); m.hdbanner = hdBannerMat();
  m.signBurger = signMat('BIG LIBERTY BURGER', '#c0392b', '#ffe600'); m.signChicken = signMat('PATRIOT CLUCKS', '#1d3f8a', '#ffffff'); m.signCola = signMat('BUREAU COLA & FRIES', '#5a2a7a', '#ffd21f'); m.flag = flagMat(f, logo); m.banner = bannerMat(f); m.bill = billMat(f); m.tex = [logo, m.flag.map, m.banner.map, m.bill.map];
  m.potty = std('#3d7fb0'); m.pottyRoof = std('#e8ecef'); m.grime = new THREE.MeshBasicMaterial({ color: '#3a2a12', transparent: true, opacity: 0, depthWrite: false });
  // construction standards and engineers (0.13)
  m.canvas = std('#7d7556', { roughness: 0.95 }); m.canvasDark = std('#5a5440', { roughness: 0.95 }); m.gravel = std('#857c6a', { roughness: 1 });
  m.ply = std('#a08560', { roughness: 0.9 }); m.hesco = std('#a89470', { roughness: 1 }); m.box1 = std('#5f6e7a', { metalness: 0.4, roughness: 0.55 }); m.box2 = std('#7a5a3a', { metalness: 0.4, roughness: 0.55 });
  m.lagoonW = std('#4a4a2a', { metalness: 0.3, roughness: 0.2 });
  m.engSuit = std('#5d6046'); m.hardhat = std('#e8b81a', { roughness: 0.5 }); m.vest = std('#ff7a1a', { emissive: '#ff5a00', emissiveIntensity: 0.15 }); m.cross = std('#c8241e');
  return m;
}
// The Helldivers banner: an original design for this fan game, a yellow helmet on black over hazard stripes.
function hdBannerMat() {
  const c = document.createElement('canvas'); c.width = 192; c.height = 384; const g = c.getContext('2d');
  g.fillStyle = '#141414'; g.fillRect(0, 0, 192, 384);
  for (let i = -4; i < 12; i++) { g.fillStyle = i % 2 ? '#141414' : '#ffd21f'; g.beginPath(); g.moveTo(i * 24, 384); g.lineTo(i * 24 + 24, 384); g.lineTo(i * 24 + 64, 330); g.lineTo(i * 24 + 40, 330); g.fill(); }
  g.fillStyle = '#ffd21f'; g.beginPath(); g.arc(96, 150, 52, Math.PI, 0); g.lineTo(148, 175); g.lineTo(44, 175); g.closePath(); g.fill();
  g.fillStyle = '#141414'; g.beginPath(); g.roundRect(56, 128, 80, 18, 6); g.fill();
  g.fillStyle = '#ffd21f'; g.font = 'bold 22px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.fillText('HELLDIVERS', 96, 240);
  g.fillRect(30, 256, 132, 4); g.fillRect(30, 30, 132, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.9 });
}
function signMat(text, bg, fg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 96); g.fillStyle = fg; g.fillRect(0, 0, 512, 6); g.fillRect(0, 90, 512, 6);
  g.font = 'bold 40px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50, 490);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.45, roughness: 0.6 });
}
// The Super Earth flag: an original design for this fan game, a golden globe with wings on deep blue.
function seFlagMat() {
  const c = document.createElement('canvas'); c.width = 384; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#16244f'; g.fillRect(0, 0, 384, 256);
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 210, 384, 12); g.fillStyle = '#b8322a'; g.fillRect(0, 222, 384, 34);
  g.save(); g.translate(192, 108); g.fillStyle = '#ffd21f'; g.strokeStyle = '#ffd21f'; g.lineWidth = 5;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 40, -6); for (let i = 0; i < 4; i++) { g.lineTo(s * (70 + i * 18), -40 + i * 10); g.lineTo(s * (62 + i * 18), -18 + i * 12); } g.lineTo(s * 40, 22); g.closePath(); g.fill(); }
  g.beginPath(); g.arc(0, 0, 40, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#16244f'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.ellipse(0, 0, 13, 30, 0, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(-30, 0); g.lineTo(30, 0); g.stroke();
  g.restore();
  g.fillStyle = '#ffd21f'; for (const x of [150, 192, 234]) { g.save(); g.translate(x, 178); g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4 : 10; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); g.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.9 });
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
// A storey in the Super Earth city style: pale concrete panels on a dark plinth, a recessed band of windows, a trim band in
// colour round the top and a dark roof lip. y0: the height of its floor. bays: window panes across the front
function block(g, m, w, h, d, x, y0, z, trim = m.prim, bays = 4) {
  box(g, w + 0.06, 0.1, d + 0.06, m.trim, x, y0 + 0.05, z);
  box(g, w, h - 0.1, d, m.wall, x, y0 + 0.1 + (h - 0.1) / 2, z);
  box(g, w + 0.05, 0.09, d + 0.05, trim, x, y0 + h - 0.1, z);
  box(g, w + 0.02, 0.04, d + 0.02, m.dark, x, y0 + h + 0.005, z, { cast: false });   // sits proud of the wall top so the two never share a plane
  const wy = y0 + h * 0.5, wh = Math.min(0.22, h * 0.3);
  box(g, w - 0.3, wh + 0.06, 0.02, m.trim, x, wy, z + d / 2 + 0.005, { cast: false });
  for (let i = 0; i < bays; i++) box(g, (w - 0.4) / bays - 0.05, wh, 0.03, m.window, x - (w - 0.4) / 2 + (i + 0.5) * (w - 0.4) / bays, wy, z + d / 2 + 0.008, { cast: false });
  for (const s of [-1, 1]) { box(g, 0.02, wh + 0.06, d - 0.4, m.trim, x + s * (w / 2 + 0.005), wy, z, { cast: false }); box(g, 0.03, wh, d - 0.6, m.window, x + s * (w / 2 + 0.008), wy, z, { cast: false }); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.1, h - 0.1, 0.1, m.concrete, x + sx * (w / 2 - 0.02), y0 + 0.1 + (h - 0.1) / 2, z + sz * (d / 2 - 0.02));
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
  starter(g, m) {   // the HQ and its pad, side by side: the base's first footprint
    const a = new THREE.Group(); MAKE.hq(a, m); a.position.x = -1.5; const b = new THREE.Group(); MAKE.pad(b, m); b.position.x = 1.5; g.add(a, b);
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
  seflag(g, m) {
    box(g, 1.9, 0.12, 1.9, m.white, 0, 0.06, 0, { cast: false }); box(g, 0.9, 0.22, 0.9, m.concrete, 0, 0.23, 0); box(g, 0.6, 0.1, 0.6, m.stone, 0, 0.39, 0);
    cyl(g, 0.03, 0.04, 3.2, m.metal, 0, 2.0, 0); ball(g, 0.07, m.gold, 0, 3.63, 0);
    flagCloth(g, m.seflag, 1.3, 0.86, 0.03, 3.1, 0);
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { cyl(g, 0.02, 0.025, 0.5, m.steel, x, 0.37, z); ball(g, 0.05, m.glowY, x, 0.64, z); }
  },
  shed(g, m) {
    slab(g, m, 2, 2);
    box(g, 1.7, 0.75, 1.4, m.metal, 0, 0.45, -0.1);
    for (let i = 0; i < 9; i++) box(g, 0.03, 0.73, 1.42, m.steel, -0.8 + i * 0.2, 0.45, -0.1);
    box(g, 1.76, 0.06, 1.5, m.primDark, 0, 0.86, -0.1, { rx: 0.06 });
    box(g, 0.9, 0.6, 0.03, m.steel, 0, 0.36, 0.62); for (let i = 0; i < 6; i++) box(g, 0.9, 0.012, 0.035, m.dark, 0, 0.1 + i * 0.1, 0.63);
    box(g, 0.5, 0.12, 0.02, m.hazard, 0.55, 0.72, 0.62);
  },
  shelter(g, m) {
    add(g, new THREE.CylinderGeometry(0.75, 0.95, 0.4, 6), m.sand, 0, 0.2, -0.2);
    box(g, 0.9, 0.06, 0.9, m.concrete, 0, 0.42, -0.2);
    box(g, 0.7, 0.4, 0.5, m.concrete, 0, 0.2, 0.45); box(g, 0.5, 0.3, 0.04, m.steel, 0, 0.17, 0.71);
    for (let i = 0; i < 5; i++) box(g, 0.1, 0.06, 0.02, i % 2 ? m.dark : m.hazard, -0.2 + i * 0.1, 0.36, 0.72);
    for (const x of [-0.3, 0.3]) { cyl(g, 0.05, 0.05, 0.45, m.steel, x, 0.65, -0.4); add(g, new THREE.ConeGeometry(0.08, 0.08, 8), m.steel, x, 0.9, -0.4, { rx: Math.PI }); }
    ball(g, 0.04, m.glowR, 0, 0.45, 0.72);
  },
  potty(g, m) {
    box(g, 0.42, 0.04, 0.42, m.concrete, 0, 0.02, 0, { cast: false });
    box(g, 0.34, 0.66, 0.34, m.potty, 0, 0.37, -0.02);
    box(g, 0.38, 0.05, 0.38, m.pottyRoof, 0, 0.72, -0.02);
    box(g, 0.24, 0.52, 0.02, m.pottyRoof, 0, 0.34, 0.155); box(g, 0.04, 0.04, 0.02, m.dark, 0.08, 0.36, 0.17);
    box(g, 0.08, 0.025, 0.01, m.hazard, 0, 0.56, 0.17);
    cyl(g, 0.02, 0.02, 0.18, m.steel, 0.1, 0.83, -0.1);
    g.userData.dirt = box(g, 0.35, 0.3, 0.35, m.grime, 0, 0.2, -0.02, { cast: false }); g.userData.dirt.scale.set(1.01, 1, 1.01);
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
  hdbanner(g, m) {
    for (const x of [-0.35, 0.35]) cyl(g, 0.02, 0.025, 1.6, m.dark, x, 0.8, 0);
    box(g, 0.8, 0.03, 0.03, m.dark, 0, 1.55, 0);
    const b = flagCloth(g, m.hdbanner, 0.55, 1.1, -0.275, 0.98, 0.02); b.userData.wave.soft = true;
  },
  hdbarracks(g, m) {
    slab(g, m, 3, 2);
    box(g, 2.0, 0.8, 1.5, m.steel, -0.4, 0.48, -0.1); box(g, 2.04, 0.08, 1.54, m.hazard, -0.4, 0.9, -0.1);
    for (let i = 0; i < 6; i++) box(g, 0.14, 0.06, 0.02, i % 2 ? m.dark : m.hazard, -1.1 + i * 0.14, 0.2, 0.66);
    box(g, 0.45, 0.55, 0.05, m.dark, -0.4, 0.36, 0.66); plane(g, 0.32, 0.6, m.hdbanner, 0.3, 0.5, 0.661);
    for (let i = 0; i < 3; i++) {   // the cryo tanks, glowing faintly
      const z = -0.55 + i * 0.5; cyl(g, 0.2, 0.2, 1.1, m.metal, 1.05, 0.6, z); box(g, 0.05, 0.6, 0.18, m.glowB, 1.25, 0.6, z); cyl(g, 0.22, 0.22, 0.06, m.dark, 1.05, 1.17, z);
    }
    box(g, 0.25, 0.08, 1.2, m.steel, 0.75, 1.0, -0.05);
  },
  burger(g, m) {
    slab(g, m, 2, 2);
    box(g, 1.6, 0.7, 1.3, m.white, 0, 0.42, -0.1); box(g, 1.64, 0.1, 1.34, m.red, 0, 0.8, -0.1);
    box(g, 1.2, 0.35, 0.03, m.window, 0, 0.45, 0.56); box(g, 1.5, 0.28, 0.06, m.dark, 0, 0.98, 0.56); plane(g, 1.46, 0.26, m.signBurger, 0, 0.98, 0.595);
    // the mascot burger on the roof
    cyl(g, 0.32, 0.3, 0.1, m.bronze, 0, 0.92, -0.35); cyl(g, 0.34, 0.34, 0.05, m.green2, 0, 0.99, -0.35); cyl(g, 0.31, 0.31, 0.09, m.crate, 0, 1.06, -0.35);
    cyl(g, 0.33, 0.33, 0.03, m.hazard, 0, 1.12, -0.35); add(g, new THREE.SphereGeometry(0.32, 16, 8, 0, 6.3, 0, 1.4), m.bronze, 0, 1.12, -0.35);
    for (const x of [-0.5, 0.5]) { box(g, 0.4, 0.04, 0.2, m.red, x, 0.22, 0.85); box(g, 0.04, 0.2, 0.04, m.steel, x, 0.11, 0.85); }
  },
  chicken(g, m) {
    slab(g, m, 2, 2);
    box(g, 1.6, 0.7, 1.3, m.white, 0, 0.42, -0.1); prism(g, 1.66, 1.4, 0.35, m.prim, 0, 0.77, -0.1);
    box(g, 1.2, 0.35, 0.03, m.window, 0, 0.45, 0.56); box(g, 1.5, 0.28, 0.06, m.dark, 0, 0.98, 0.56); plane(g, 1.46, 0.26, m.signChicken, 0, 0.98, 0.595);
    // a giant drumstick, flying a tiny flag
    add(g, new THREE.ConeGeometry(0.16, 0.5, 10), m.bronze, 0.5, 1.3, -0.4, { rz: 0.5 }); ball(g, 0.2, m.bronze, 0.38, 1.18, -0.4);
    cyl(g, 0.01, 0.01, 0.4, m.metal, 0.7, 1.55, -0.4); box(g, 0.16, 0.1, 0.005, m.red, 0.79, 1.68, -0.4);
  },
  cola(g, m) {
    slab(g, m, 2, 2);
    box(g, 1.3, 0.55, 0.9, m.white, -0.1, 0.33, -0.25); box(g, 1.34, 0.08, 0.94, m.cola, -0.1, 0.64, -0.25);
    box(g, 1.0, 0.3, 0.03, m.colaFace, -0.1, 0.4, 0.21); box(g, 1.5, 0.28, 0.06, m.dark, 0, 0.9, 0.3); plane(g, 1.46, 0.26, m.signCola, 0, 0.9, 0.335);
    cyl(g, 0.22, 0.22, 0.7, m.cola, 0.55, 1.0, -0.4); cyl(g, 0.2, 0.2, 0.04, m.metal, 0.55, 1.37, -0.4); box(g, 0.45, 0.12, 0.01, m.white, 0.55, 1.0, -0.17);
    for (const x of [-0.6, 0.2]) { cyl(g, 0.18, 0.18, 0.03, m.white, x, 0.3, 0.65); cyl(g, 0.02, 0.02, 0.3, m.steel, x, 0.15, 0.65); cyl(g, 0.01, 0.01, 0.5, m.steel, x, 0.55, 0.65); add(g, new THREE.ConeGeometry(0.28, 0.12, 12), m.cola, x, 0.82, 0.65); }
  },
  fueldepot(g, m) {
    slab(g, m, 2, 2);
    for (const [x, z] of [[-0.45, -0.4], [0.45, -0.4]]) { cyl(g, 0.38, 0.38, 0.9, m.white, x, 0.55, z, { seg: 18 }); add(g, new THREE.SphereGeometry(0.38, 16, 6, 0, 6.3, 0, 0.9), m.white, x, 1.0, z); box(g, 0.78, 0.07, 0.02, m.hazard, x, 0.45, z + 0.39); }
    box(g, 1.7, 0.04, 0.04, m.steel, 0, 0.3, 0.2); for (const x of [-0.6, 0, 0.6]) box(g, 0.05, 0.3, 0.05, m.steel, x, 0.15, 0.2);
    box(g, 0.3, 0.45, 0.25, m.prim, 0.6, 0.23, 0.6); box(g, 0.18, 0.12, 0.02, m.glowY, 0.6, 0.35, 0.73);
    for (let i = 0; i < 4; i++) box(g, 0.1, 0.3, 0.02, m.steel, -0.75 + i * 0.5, 0.15, 0.95);
  },
  motorpool(g, m) {
    slab(g, m, 3, 2, m.asphalt);
    box(g, 2.7, 0.85, 1.2, m.metal, 0, 0.5, -0.3); box(g, 2.76, 0.08, 1.26, m.prim, 0, 0.96, -0.3);
    for (const x of [-0.65, 0.65]) { box(g, 1.05, 0.65, 0.03, m.dark, x, 0.37, 0.31); for (let i = 0; i < 6; i++) box(g, 1.05, 0.012, 0.035, m.steel, x, 0.1 + i * 0.1, 0.32); }
    box(g, 2.7, 0.1, 0.04, m.hazard, 0, 0.75, 0.32); cyl(g, 0.12, 0.12, 0.4, m.red, 1.15, 0.22, 0.75);
    for (let i = 0; i < 4; i++) cyl(g, 0.12, 0.12, 0.1, m.rubber, -1.1 + i * 0.12, 0.1 + (i % 2) * 0.05, 0.8, { rx: Math.PI / 2, seg: 10 });
  },
  range(g, m) {
    box(g, 3.9, 0.05, 1.9, m.sand, 0, 0.025, 0, { cast: false });
    for (let i = 0; i < 6; i++) { const x = -1.6 + i * 0.64; box(g, 0.04, 0.02, 1.4, m.white, x + 0.32, 0.055, -0.1, { cast: false }); box(g, 0.3, 0.4, 0.03, m.white, x, 0.3, -0.75); add(g, new THREE.RingGeometry(0.05, 0.1, 16), m.red, x, 0.32, -0.733, { cast: false }); cyl(g, 0.015, 0.015, 0.2, m.steel, x, 0.1, -0.75); }
    box(g, 3.9, 0.45, 0.25, m.sandDark, 0, 0.22, -0.95); for (let i = 0; i < 9; i++) box(g, 0.2, 0.09, 0.14, m.sand, -1.8 + i * 0.45, 0.5, -0.95);
    box(g, 3.8, 0.22, 0.15, m.concrete, 0, 0.11, 0.78); box(g, 3.8, 0.04, 0.2, m.hazard, 0, 0.23, 0.78);
    box(g, 0.6, 0.6, 0.45, m.prim, 1.6, 0.3, 0.65); box(g, 0.5, 0.15, 0.02, m.window, 1.6, 0.45, 0.88);
  },
  course(g, m) {
    box(g, 2.9, 0.04, 2.9, m.sandDark, 0, 0.02, 0, { cast: false });
    box(g, 0.9, 0.6, 0.12, m.wood || m.crate, -0.7, 0.3, -0.9); box(g, 0.06, 0.8, 0.06, m.steel, 0.9, 0.4, -0.9); box(g, 0.06, 0.8, 0.06, m.steel, 0.1, 0.4, -0.9);
    for (let i = 0; i < 5; i++) box(g, 0.8, 0.012, 0.012, m.dark, 0.5, 0.15 + i * 0.13, -0.9);
    for (let i = 0; i < 6; i++) cyl(g, 0.13, 0.13, 0.1, m.rubber, -0.9 + (i % 3) * 0.3, 0.06, 0.2 + Math.floor(i / 3) * 0.3, { seg: 12 });
    for (let i = 0; i < 4; i++) box(g, 0.08, 0.5, 0.08, m.crate, 0.6 + (i % 2) * 0.5, 0.25, 0.3 + Math.floor(i / 2) * 0.5);
    box(g, 0.7, 0.04, 0.7, m.crate, 0.85, 0.5, 0.55);
    box(g, 2.6, 0.06, 0.25, m.e710 || m.dark, 0, 0.03, 1.15, { cast: false });
  },
  patrol(g, m) {
    slab(g, m, 2, 2);
    box(g, 1.6, 0.8, 1.2, m.wall, 0, 0.45, -0.2); box(g, 1.66, 0.08, 1.26, m.prim, 0, 0.88, -0.2);
    box(g, 0.4, 0.55, 0.04, m.dark, -0.4, 0.33, 0.41); box(g, 0.6, 0.4, 0.03, m.white, 0.35, 0.5, 0.41); for (let i = 0; i < 3; i++) box(g, 0.04, 0.04, 0.01, m.red, 0.2 + i * 0.15, 0.55 - i * 0.06, 0.43);
    cyl(g, 0.02, 0.025, 1.5, m.steel, 0.6, 1.6, -0.6); for (const y of [1.9, 2.1, 2.3]) box(g, 0.3, 0.015, 0.015, m.steel, 0.6, y, -0.6); ball(g, 0.04, m.glowR, 0.6, 2.36, -0.6);
    sandbags(g, m, 0, 0.75, 1.4);
  },
  comms(g, m) {   // a lattice mast with red warning lights, like the ones over every Super Earth city
    slab(g, m, 2, 2);
    box(g, 0.8, 0.5, 0.6, m.wall, -0.45, 0.28, 0.45); box(g, 0.84, 0.05, 0.64, m.prim, -0.45, 0.55, 0.45); box(g, 0.5, 0.1, 0.02, m.window, -0.45, 0.35, 0.76);
    const H = 3.6;
    for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) box(g, 0.05, H, 0.05, m.steel, x * (1 - 0) + 0.3, H / 2, z - 0.2, { rx: 0, rz: 0 });
    for (let y = 0.4; y < H; y += 0.45) { box(g, 0.55, 0.025, 0.025, m.steel, 0.3, y, -0.45); box(g, 0.55, 0.025, 0.025, m.steel, 0.3, y, 0.05); box(g, 0.025, 0.025, 0.55, m.steel, 0.05, y, -0.2); box(g, 0.025, 0.025, 0.55, m.steel, 0.55, y, -0.2); }
    for (const y of [2.1, 2.9]) for (const s of [-1, 1]) box(g, 0.12, 0.3, 0.06, m.white, 0.3 + s * 0.34, y, -0.2);
    cyl(g, 0.015, 0.02, 0.8, m.metal, 0.3, H + 0.4, -0.2);
    const lights = [ball(g, 0.06, m.glowR, 0.3, H + 0.82, -0.2), ball(g, 0.05, m.glowR, 0.05, H * 0.6, -0.45), ball(g, 0.05, m.glowR, 0.55, H * 0.6, 0.05)];
    g.userData.blink = lights;
  },
  lab(g, m) {
    slab(g, m, 3, 2);
    box(g, 2.6, 0.9, 1.5, m.white, 0, 0.5, -0.1); box(g, 2.66, 0.06, 1.56, m.prim, 0, 0.98, -0.1); box(g, 2.66, 0.1, 1.56, m.sec, 0, 0.4, -0.1);
    for (let i = 0; i < 5; i++) box(g, 0.32, 0.22, 0.03, m.window, -1.0 + i * 0.5, 0.7, 0.66);
    box(g, 0.45, 0.6, 0.04, m.glass, 0.9, 0.32, 0.66);
    cyl(g, 0.3, 0.3, 0.5, m.metal, -0.7, 1.25, -0.3, { seg: 16 }); add(g, new THREE.SphereGeometry(0.3, 16, 8, 0, 6.3, 0, 1.57), m.white, -0.7, 1.5, -0.3);
    box(g, 0.04, 0.25, 0.04, m.steel, 0.6, 1.12, -0.4); add(g, new THREE.SphereGeometry(0.22, 14, 6, 0, Math.PI * 2, 0, 1.0), m.white, 0.6, 1.3, -0.4, { rx: -0.8 });
    box(g, 0.2, 0.08, 0.02, m.glowB, -1.1, 0.95, 0.67);
  },
  vbay(g, m) {
    slab(g, m, 3, 3, m.asphalt);
    box(g, 2.7, 1.1, 1.3, m.metal, 0, 0.6, -0.75); box(g, 2.76, 0.08, 1.36, m.prim, 0, 1.18, -0.75);
    for (const x of [-0.65, 0.65]) { box(g, 1.05, 0.85, 0.03, m.dark, x, 0.47, -0.09); for (let i = 0; i < 8; i++) box(g, 1.05, 0.012, 0.035, m.steel, x, 0.1 + i * 0.1, -0.08); }
    box(g, 2.7, 0.08, 0.04, m.hazard, 0, 0.95, -0.08);
    for (let i = 0; i < 6; i++) box(g, 0.3, 0.012, 0.08, m.hazard, -1.2 + i * 0.48, 0.09, 1.3, { cast: false });
    box(g, 0.4, 0.3, 0.3, m.e710, 1.15, 0.25, 0.6); cyl(g, 0.1, 0.1, 0.3, m.red, 1.15, 0.55, 0.2);
  },
  medbay(g, m) {
    slab(g, m, 3, 2);
    block(g, m, 2.6, 0.85, 1.45, 0, 0.08, -0.12, m.white);
    box(g, 0.7, 0.6, 0.05, m.glass, 0, 0.4, 0.62); box(g, 1.0, 0.05, 0.45, m.white, 0, 0.78, 0.8); for (const x of [-0.45, 0.45]) box(g, 0.04, 0.7, 0.04, m.steel, x, 0.43, 1.0);
    for (const [w, h] of [[0.34, 0.1], [0.1, 0.34]]) { box(g, w, h, 0.02, m.red, -0.95, 0.62, 0.62); box(g, w, 0.02, h, m.red, 0.7, 0.955, -0.12); }
    box(g, 0.5, 0.2, 0.3, m.metal, -0.8, 1.05, -0.4); box(g, 0.55, 0.12, 0.22, m.white, 1.0, 0.2, 0.85); box(g, 0.5, 0.03, 0.2, m.red, 1.0, 0.275, 0.85);
  },
  block(g, m) {   // three storeys of bunks
    slab(g, m, 3, 3);
    for (let f = 0; f < 3; f++) block(g, m, 2.6 - f * 0.06, 0.78, 2.3 - f * 0.06, 0, 0.08 + f * 0.8, -0.15, m.prim, 5);
    box(g, 0.5, 0.6, 0.05, m.dark, 0, 0.4, 1.02); box(g, 0.9, 0.06, 0.4, m.prim, 0, 0.76, 1.15);
    for (let f = 1; f < 3; f++) { box(g, 1.2, 0.04, 0.3, m.concrete, 0.6, 0.1 + f * 0.8, 1.1); box(g, 1.2, 0.16, 0.02, m.steel, 0.6, 0.2 + f * 0.8, 1.24); }
    box(g, 0.5, 0.22, 0.4, m.metal, -0.7, 2.6, -0.6); box(g, 0.35, 0.18, 0.35, m.metal, 0.6, 2.58, -0.2);
    cyl(g, 0.015, 0.02, 0.9, m.metal, 0.95, 2.95, -0.95); g.userData.blink = [ball(g, 0.05, m.glowR, 0.95, 3.42, -0.95)];
    plane(g, 0.5, 0.5, m.logo, -0.75, 1.95, 1.0);
  },
  command(g, m) {   // a concrete tower with a glass crown
    slab(g, m, 3, 3);
    block(g, m, 2.6, 0.95, 2.6, 0, 0.08, 0, m.prim, 5);
    for (let f = 0; f < 3; f++) block(g, m, 1.55, 0.78, 1.55, 0, 1.05 + f * 0.8, -0.2, m.trim, 3);
    box(g, 1.95, 0.08, 1.95, m.dark, 0, 3.5, -0.2); box(g, 1.85, 0.42, 1.85, m.window, 0, 3.75, -0.2); box(g, 1.9, 0.42, 1.9, m.glass, 0, 3.75, -0.2);
    box(g, 2.05, 0.1, 2.05, m.prim, 0, 4.0, -0.2); box(g, 1.2, 0.12, 1.2, m.concrete, 0, 4.1, -0.2);
    box(g, 0.6, 0.7, 0.05, m.dark, 0, 0.45, 1.31); box(g, 1.0, 0.06, 0.4, m.prim, 0, 0.85, 1.45);
    plane(g, 0.8, 0.8, m.logoLit, 0, 2.3, 0.58);
    const dish = new THREE.Group(); dish.position.set(-0.3, 4.3, -0.4); g.add(dish);
    cyl(dish, 0.02, 0.02, 0.3, m.metal, 0, -0.1, 0); add(dish, new THREE.SphereGeometry(0.3, 14, 6, 0, Math.PI * 2, 0, 1.0), m.white, 0, 0.08, 0, { rx: -0.9 });
    g.userData.spin = dish;
    cyl(g, 0.02, 0.03, 1.4, m.metal, 0.4, 4.85, 0.1); cyl(g, 0.015, 0.02, 0.9, m.metal, 0.1, 4.6, 0.25);
    g.userData.blink = [ball(g, 0.06, m.glowR, 0.4, 5.57, 0.1), ball(g, 0.05, m.glowR, 0.1, 5.07, 0.25), ball(g, 0.05, m.glowR, -1.25, 1.1, -1.25), ball(g, 0.05, m.glowR, 1.25, 1.1, 1.25)];
  },
  mast(g, m) {   // the big one: twice a Comms Tower, hung with dishes and loudspeakers
    slab(g, m, 2, 2);
    block(g, m, 0.9, 0.6, 0.7, -0.45, 0.08, 0.5, m.prim, 2);
    const H = 6.4, cx = 0.25, cz = -0.2;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = box(g, 0.07, H, 0.07, m.steel, cx + x * 0.26, H / 2, cz + z * 0.26); leg.rotation.set(z * 0.035, 0, -x * 0.035); }
    for (let y = 0.5; y < H; y += 0.55) { const w = 0.66 - y * 0.045; for (const s of [-1, 1]) { box(g, w, 0.03, 0.03, m.steel, cx, y, cz + s * w / 2); box(g, 0.03, 0.03, w, m.steel, cx + s * w / 2, y, cz); } }
    for (const [y, s] of [[3.2, 1], [4.1, -1], [5.0, 1]]) { box(g, 0.14, 0.4, 0.07, m.white, cx + s * 0.36, y, cz); add(g, new THREE.SphereGeometry(0.2, 12, 6, 0, Math.PI * 2, 0, 1.0), m.white, cx - s * 0.36, y, cz, { rz: s * 1.57 }); }
    for (const s of [-1, 1]) box(g, 0.3, 0.18, 0.2, m.dark, cx, 2.3, cz + s * 0.4);
    cyl(g, 0.02, 0.03, 1.2, m.metal, cx, H + 0.6, cz);
    g.userData.blink = [ball(g, 0.08, m.glowR, cx, H + 1.22, cz), ball(g, 0.06, m.glowR, cx - 0.3, H * 0.66, cz - 0.3), ball(g, 0.06, m.glowR, cx + 0.3, H * 0.66, cz + 0.3), ball(g, 0.06, m.glowR, cx + 0.3, H * 0.33, cz - 0.3)];
  },
  lookout(g, m) {
    for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) box(g, 0.07, 1.7, 0.07, m.steel, x, 0.85, z);
    box(g, 0.85, 0.07, 0.85, m.dark, 0, 1.7, 0); for (const [x, z, w, d] of [[0, -0.4, 0.85, 0.05], [0, 0.4, 0.85, 0.05], [-0.4, 0, 0.05, 0.85], [0.4, 0, 0.05, 0.85]]) box(g, w, 0.3, d, m.wall, x, 1.9, z);
    for (const [x, z] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]]) box(g, 0.04, 0.7, 0.04, m.steel, x, 2.1, z);
    box(g, 1.0, 0.06, 1.0, m.prim, 0, 2.47, 0); box(g, 0.05, 1.7, 0.05, m.steel, 0.3, 0.85, 0, { rz: 0 });
    for (let y = 0.25; y < 1.7; y += 0.25) box(g, 0.2, 0.025, 0.04, m.steel, 0.3, y, 0.33);
    const lamp = ball(g, 0.07, m.glowY, 0, 2.38, 0.42); void lamp;
  },
  lecture(g, m) {
    slab(g, m, 3, 2);
    box(g, 2.5, 0.85, 1.3, m.white, 0, 0.5, -0.15); prism(g, 2.7, 1.5, 0.4, m.prim, 0, 0.93, -0.15);
    for (let i = 0; i < 5; i++) cyl(g, 0.06, 0.07, 0.85, m.white, -1.0 + i * 0.5, 0.5, 0.6, { seg: 10 });
    box(g, 2.6, 0.08, 0.3, m.white, 0, 0.95, 0.6); box(g, 2.6, 0.1, 0.3, m.concrete, 0, 0.05, 0.62);
    plane(g, 0.4, 0.4, m.logo, 0, 1.12, 0.66); box(g, 0.45, 0.55, 0.03, m.dark, 0, 0.33, 0.51);
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
  // ---------------------------------------------------------------- Fort Sanctuary
  plaque(g, m) {   // a dark stone slab holding a lens of Illuminate glass, the poem lit inside it
    slab(g, m, 2, 1);
    box(g, 1.5, 0.12, 0.5, m.stone, 0, 0.14, 0); box(g, 1.3, 0.85, 0.16, m.stone, 0, 0.62, -0.05);
    box(g, 1.08, 0.62, 0.04, m.glowB, 0, 0.64, 0.04); box(g, 1.14, 0.03, 0.06, m.gold, 0, 0.97, 0.03); box(g, 1.14, 0.03, 0.06, m.gold, 0, 0.31, 0.03);
    for (let i = 0; i < 6; i++) box(g, 0.7 - (i % 3) * 0.12, 0.018, 0.01, m.white, 0, 0.84 - i * 0.07, 0.065, { cast: false });
    for (const s of [-1, 1]) { cyl(g, 0.02, 0.02, 1.5, m.metal, s * 0.85, 0.75, 0); flagCloth(g, m.prim, 0.3, 0.45, s * 0.85, 1.25, 0.02); }
  },
  flood(g, m) {   // a lattice mast with a bank of lamps that light the wall at night
    for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) box(g, 0.05, 2.4, 0.05, m.steel, x, 1.2, z);
    for (let y = 0.4; y < 2.4; y += 0.4) { box(g, 0.4, 0.025, 0.025, m.steel, 0, y, -0.18); box(g, 0.4, 0.025, 0.025, m.steel, 0, y, 0.18); }
    box(g, 0.7, 0.06, 0.3, m.dark, 0, 2.45, 0.05);
    const lamps = []; for (let i = 0; i < 4; i++) { box(g, 0.14, 0.12, 0.1, m.metal, -0.24 + i * 0.16, 2.55, 0.12); lamps.push(box(g, 0.11, 0.09, 0.02, m.glowY, -0.24 + i * 0.16, 2.55, 0.18)); }
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), m.floodPool); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.035, 1.6); pool.receiveShadow = false; pool.castShadow = false; g.add(pool);
    g.userData.night = pool;
  },
  turret(g, m) {   // a rotary gun on a concrete ring, turning to watch the approaches
    cyl(g, 0.45, 0.5, 0.35, m.concrete, 0, 0.18, 0, { seg: 10 }); cyl(g, 0.36, 0.36, 0.06, m.dark, 0, 0.38, 0, { seg: 10 });
    const t = new THREE.Group(); t.position.set(0, 0.42, 0); g.add(t);
    box(t, 0.42, 0.26, 0.42, m.metal, 0, 0.13, 0); box(t, 0.44, 0.04, 0.44, m.prim, 0, 0.27, 0); box(t, 0.3, 0.16, 0.1, m.dark, 0, 0.14, 0.24);
    for (const x of [-0.05, 0.05]) for (const y of [0.1, 0.18]) cyl(t, 0.022, 0.022, 0.7, m.steel, x, y, 0.6, { rx: Math.PI / 2, seg: 6 });
    cyl(t, 0.05, 0.05, 0.12, m.dark, 0.14, 0.32, -0.08); box(t, 0.06, 0.03, 0.02, m.glowR || m.red, 0.14, 0.4, -0.02);
    g.userData.spin = t;
  },
  eob(g, m) {   // the bunker: a low armoured blockhouse over a ramp down, comm masts and its own generators
    slab(g, m, 4, 3);
    box(g, 3.5, 0.75, 2.2, m.concrete, 0, 0.45, -0.35); box(g, 3.6, 0.12, 2.3, m.dark, 0, 0.86, -0.35); box(g, 3.65, 0.08, 2.35, m.prim, 0, 0.78, -0.35);
    for (const s of [-1, 1]) { const w = box(g, 0.3, 0.6, 2.2, m.concrete, s * 1.82, 0.3, -0.35, { rz: s * 0.4 }); void w; }
    box(g, 1.4, 0.05, 1.4, m.asphalt || m.dark, 0, 0.14, 1.0, { rx: -0.18 }); box(g, 1.1, 0.55, 0.06, m.dark, 0, 0.3, 0.76); for (let i = 0; i < 6; i++) box(g, 1.1, 0.012, 0.07, m.steel, 0, 0.08 + i * 0.09, 0.78);
    box(g, 1.5, 0.04, 0.04, m.hazard, 0, 0.62, 0.77);
    for (const s of [-1, 1]) { box(g, 0.5, 0.35, 0.4, m.metal, s * 1.2, 1.05, -0.9); cyl(g, 0.06, 0.06, 0.3, m.dark, s * 1.2, 1.35, -0.9); }
    cyl(g, 0.02, 0.03, 1.6, m.metal, 0.4, 1.7, -0.6); cyl(g, 0.015, 0.02, 1.1, m.metal, -0.3, 1.45, -0.4);
    g.userData.blink = [ball(g, 0.05, m.glowR, 0.4, 2.52, -0.6), ball(g, 0.04, m.glowR, -0.3, 2.02, -0.4)];
    for (const x of [-1.5, -0.9, 0.9, 1.5]) box(g, 0.22, 0.08, 0.04, m.glowY, x, 0.5, 0.77);
  },
  vault(g, m) {   // server halls: a windowless block with cooling stacks and conduit
    slab(g, m, 3, 3);
    block(g, m, 2.6, 1.1, 2.4, 0, 0.08, -0.1, m.trim, 0);
    for (let i = 0; i < 5; i++) box(g, 0.32, 0.6, 0.03, m.dark, -1.0 + i * 0.5, 0.6, 1.11);
    for (let i = 0; i < 5; i++) box(g, 0.24, 0.02, 0.02, m.glowB, -1.0 + i * 0.5, 0.8, 1.13);
    box(g, 0.6, 0.7, 0.05, m.metal, 0, 0.45, 1.12); box(g, 0.5, 0.05, 0.03, m.hazard, 0, 0.84, 1.14);
    for (const [x, z] of [[-0.7, -0.6], [0, -0.6], [0.7, -0.6]]) { box(g, 0.5, 0.35, 0.5, m.metal, x, 1.38, z); cyl(g, 0.18, 0.18, 0.05, m.dark, x, 1.58, z, { seg: 12 }); }
    box(g, 2.4, 0.08, 0.08, m.steel, 0, 1.25, 0.4); box(g, 0.08, 0.08, 1.2, m.steel, 1.1, 1.25, -0.2);
  },
  warroom(g, m) {   // a broad command block with a glass drum on top: the strat map turns inside it
    slab(g, m, 4, 4);
    block(g, m, 3.6, 1.0, 3.2, 0, 0.08, -0.2, m.prim, 6);
    block(g, m, 2.6, 0.8, 2.2, 0, 1.08, -0.3, m.trim, 4);
    cyl(g, 0.95, 0.95, 0.55, m.glass, 0, 2.2, -0.3, { seg: 24 }); cyl(g, 1.0, 1.0, 0.08, m.dark, 0, 2.5, -0.3, { seg: 24 }); cyl(g, 1.0, 1.0, 0.08, m.dark, 0, 1.92, -0.3, { seg: 24 });
    const holo = new THREE.Group(); holo.position.set(0, 2.2, -0.3); g.add(holo);
    add(holo, new THREE.SphereGeometry(0.42, 16, 10), m.glowB, 0, 0, 0); add(holo, new THREE.TorusGeometry(0.6, 0.015, 6, 32), m.glowY, 0, 0, 0, { rx: Math.PI / 2 });
    g.userData.spin = holo;
    box(g, 1.2, 0.85, 0.06, m.dark, 0, 0.5, 1.42); box(g, 1.6, 0.08, 0.6, m.prim, 0, 0.98, 1.6); for (const x of [-0.7, 0.7]) box(g, 0.08, 0.95, 0.08, m.steel, x, 0.5, 1.85);
    plane(g, 0.9, 0.9, m.logoLit, 0, 1.55, 0.81);
    for (const [x, z] of [[-1.6, -1.7], [1.6, -1.7]]) { cyl(g, 0.02, 0.03, 1.4, m.metal, x, 1.8, z); }
    g.userData.blink = [ball(g, 0.05, m.glowR, -1.6, 2.52, -1.7), ball(g, 0.05, m.glowR, 1.6, 2.52, -1.7)];
  },
  halls(g, m) {   // two wings and a colonnade, with holographic panels for the fallen
    slab(g, m, 4, 3, m.stone);
    for (const s of [-1, 1]) block(g, m, 1.3, 1.15, 2.2, s * 1.25, 0.08, -0.25, m.gold, 2);
    box(g, 1.2, 1.5, 2.2, m.white, 0, 0.83, -0.35); box(g, 1.3, 0.12, 2.3, m.gold, 0, 1.6, -0.35);
    add(g, new THREE.CylinderGeometry(0.55, 0.55, 0.3, 20, 1, false, 0, Math.PI), m.white, 0, 1.75, -0.35, { rz: Math.PI / 2, ry: Math.PI / 2 });
    for (let i = 0; i < 6; i++) cyl(g, 0.07, 0.08, 1.2, m.white, -1.6 + i * 0.64, 0.68, 1.0, { seg: 10 });
    box(g, 3.6, 0.1, 0.5, m.white, 0, 1.33, 1.0); box(g, 3.7, 0.12, 0.6, m.stone, 0, 0.08, 1.05);
    for (let i = 0; i < 4; i++) box(g, 0.42, 0.7, 0.02, m.glowB, -1.35 + i * 0.9, 0.62, 0.79);
    for (const s of [-1, 1]) { cyl(g, 0.1, 0.12, 0.15, m.dark, s * 0.4, 0.2, 1.3, { seg: 10 }); ball(g, 0.06, m.glowY, s * 0.4, 0.3, 1.3, { seg: 8 }); }
  },
  mart(g, m) {   // a bright store: glass front, a canopy and the DEMOCRA-MART sign
    slab(g, m, 3, 3);
    block(g, m, 2.7, 1.0, 2.3, 0, 0.08, -0.25, m.hazard, 0);
    box(g, 2.4, 0.6, 0.04, m.glass, 0, 0.45, 0.92); for (let i = 0; i < 5; i++) box(g, 0.04, 0.62, 0.05, m.steel, -1.2 + i * 0.6, 0.45, 0.93);
    box(g, 2.9, 0.06, 0.7, m.prim, 0, 0.9, 1.2); for (const x of [-1.35, 1.35]) box(g, 0.05, 0.85, 0.05, m.steel, x, 0.45, 1.5);
    box(g, 2.0, 0.32, 0.08, m.dark, 0, 1.25, 0.94); box(g, 1.85, 0.2, 0.02, m.glowY, 0, 1.25, 0.99);
    for (let i = 0; i < 3; i++) { box(g, 0.25, 0.3, 0.2, m.white, -0.8 + i * 0.8, 0.25, 1.35); box(g, 0.2, 0.06, 0.15, m.red, -0.8 + i * 0.8, 0.43, 1.35); }
    box(g, 0.8, 0.3, 0.6, m.metal, 0.7, 1.25, -0.8);
  },
  casino(g, m) {   // lights, gold, a marquee: luck, supervised
    slab(g, m, 3, 3);
    block(g, m, 2.6, 1.3, 2.3, 0, 0.08, -0.25, m.gold, 0);
    box(g, 2.0, 0.08, 0.6, m.dark, 0, 0.95, 1.15); for (const x of [-0.95, 0.95]) box(g, 0.06, 0.95, 0.06, m.gold, x, 0.47, 1.4);
    const bulbs = []; for (let i = 0; i < 12; i++) bulbs.push(ball(g, 0.035, m.glowY, -0.92 + i * 0.167, 1.0, 1.44, { seg: 6 }));
    box(g, 0.9, 0.6, 0.04, m.glass, 0, 0.4, 0.92); box(g, 1.6, 0.42, 0.08, m.red, 0, 1.6, 0.92); box(g, 1.5, 0.3, 0.02, m.glowY, 0, 1.6, 0.97);
    for (const s of [-1, 1]) { cyl(g, 0.22, 0.22, 0.05, m.gold, s * 0.9, 1.6, 0.94, { rx: Math.PI / 2, seg: 16 }); }
    g.userData.blink = bulbs.filter((_, i) => i % 2 === 0);
  },
  cryo(g, m) {   // a cold hall of upright pods, frost on the vents
    slab(g, m, 3, 2);
    block(g, m, 2.6, 0.95, 1.4, 0, 0.08, -0.2, m.glowB, 0);
    for (let i = 0; i < 5; i++) { cyl(g, 0.17, 0.17, 0.7, m.glass, -0.96 + i * 0.48, 0.48, 0.66, { seg: 10 }); cyl(g, 0.12, 0.12, 0.55, m.white, -0.96 + i * 0.48, 0.46, 0.66, { seg: 10 }); cyl(g, 0.19, 0.19, 0.06, m.metal, -0.96 + i * 0.48, 0.86, 0.66, { seg: 10 }); }
    for (const x of [-0.8, 0, 0.8]) { box(g, 0.45, 0.25, 0.4, m.white, x, 1.18, -0.4); box(g, 0.4, 0.04, 0.35, m.glowB, x, 1.32, -0.4); }
  },
  brig(g, m) {   // cell block: bars, a fenced yard, a watch light
    slab(g, m, 3, 2);
    block(g, m, 2.0, 0.95, 1.4, -0.35, 0.08, -0.2, m.red, 0);
    for (let i = 0; i < 4; i++) { box(g, 0.3, 0.32, 0.02, m.dark, -1.05 + i * 0.47, 0.6, 0.51); for (let k = 0; k < 4; k++) box(g, 0.015, 0.32, 0.02, m.steel, -1.15 + i * 0.47 + k * 0.07, 0.6, 0.53); }
    for (const [x, z, w, d] of [[1.2, 0, 0.03, 1.6], [0.95, -0.8, 0.5, 0.03], [0.95, 0.8, 0.5, 0.03]]) box(g, w, 0.55, d, m.steel, x, 0.35, z);
    for (const z of [-0.8, 0, 0.8]) cyl(g, 0.02, 0.02, 0.65, m.steel, 1.2, 0.36, z);
    cyl(g, 0.02, 0.025, 0.9, m.metal, -1.1, 1.45, -0.6); box(g, 0.14, 0.1, 0.12, m.glowY, -1.1, 1.92, -0.55);
  },
  extractor(g, m) {   // a pump jack nodding over the seep, and a tank for what it brings up
    slab(g, m, 2, 2, m.asphalt);
    box(g, 0.5, 0.2, 0.9, m.dark, -0.3, 0.12, 0); for (const z of [-0.2, 0.2]) box(g, 0.06, 0.9, 0.06, m.steel, -0.3, 0.6, z, { rx: z * 0.4 });
    const beam = new THREE.Group(); beam.position.set(-0.3, 1.02, 0); g.add(beam);
    box(beam, 0.1, 0.1, 1.2, m.hazard, 0, 0, 0); box(beam, 0.14, 0.32, 0.18, m.hazard, 0, -0.05, 0.62);
    g.userData.nod = beam;
    cyl(g, 0.04, 0.04, 0.5, m.steel, -0.3, 0.35, 0.62);
    cyl(g, 0.36, 0.36, 0.7, m.e710, 0.5, 0.43, -0.2, { seg: 14 }); cyl(g, 0.37, 0.37, 0.05, m.prim, 0.5, 0.8, -0.2, { seg: 14 });
    box(g, 0.3, 0.3, 0.3, m.metal, 0.55, 0.23, 0.55);
  },
  mine(g, m) {   // a headframe over the shaft, a conveyor and a heap of ore
    slab(g, m, 2, 2, m.asphalt);
    for (const [x, z] of [[-0.55, -0.45], [-0.05, -0.45], [-0.55, 0.05], [-0.05, 0.05]]) box(g, 0.06, 1.6, 0.06, m.steel, x, 0.8, z);
    box(g, 0.6, 0.06, 0.6, m.steel, -0.3, 1.6, -0.2); cyl(g, 0.2, 0.2, 0.06, m.dark, -0.3, 1.7, -0.2, { rx: Math.PI / 2, seg: 14 });
    const wheel = new THREE.Group(); wheel.position.set(-0.3, 1.7, -0.2); g.add(wheel); box(wheel, 0.04, 0.38, 0.04, m.hazard, 0, 0, 0.04); g.userData.spinZ = wheel;
    box(g, 1.1, 0.05, 0.18, m.steel, 0.35, 0.5, 0.45, { rz: -0.4 });
    add(g, new THREE.ConeGeometry(0.42, 0.45, 7), m.sandDark, 0.62, 0.22, 0.5);
    box(g, 0.45, 0.4, 0.45, m.wall, -0.3, 0.2, -0.2);
  },
  partyhq(g, m) {   // three storeys of offices behind a portico, red banners down the front
    slab(g, m, 3, 3);
    for (let f = 0; f < 3; f++) block(g, m, 2.6, 0.75, 2.0, 0, 0.08 + f * 0.75, -0.3, m.red, 5);
    box(g, 1.4, 0.1, 0.5, m.white, 0, 1.12, 0.95); for (const x of [-0.6, -0.2, 0.2, 0.6]) cyl(g, 0.06, 0.07, 1.04, m.white, x, 0.6, 1.1, { seg: 8 });
    box(g, 0.5, 0.65, 0.05, m.dark, 0, 0.42, 0.71);
    for (const x of [-1.05, 1.05]) box(g, 0.32, 1.6, 0.02, m.red, x, 1.3, 0.72);
    plane(g, 0.6, 0.6, m.logoLit, 0, 1.85, 0.72);
    cyl(g, 0.02, 0.025, 1.0, m.metal, 0, 2.8, -0.3); flagCloth(g, m.red, 0.5, 0.3, 0, 3.15, -0.3);
  },
  palace(g, m) {   // stepped tower, wings, a spire with a star
    slab(g, m, 5, 5, m.stone);
    for (const s of [-1, 1]) block(g, m, 1.2, 1.4, 3.6, s * 1.8, 0.08, -0.2, m.gold, 4);
    block(g, m, 2.4, 1.3, 2.4, 0, 0.08, -0.4, m.gold, 5);
    block(g, m, 1.9, 1.1, 1.9, 0, 1.38, -0.4, m.gold, 4);
    block(g, m, 1.4, 1.0, 1.4, 0, 2.48, -0.4, m.gold, 3);
    block(g, m, 0.9, 0.9, 0.9, 0, 3.48, -0.4, m.gold, 2);
    cyl(g, 0.12, 0.35, 1.4, m.wall, 0, 5.08, -0.4, { seg: 8 }); cyl(g, 0.02, 0.08, 1.0, m.gold, 0, 6.28, -0.4, { seg: 8 });
    add(g, new THREE.OctahedronGeometry(0.16), m.glowR, 0, 6.85, -0.4);
    box(g, 2.0, 0.08, 0.7, m.white, 0, 1.0, 1.4); for (let i = 0; i < 6; i++) cyl(g, 0.07, 0.08, 0.92, m.white, -0.85 + i * 0.34, 0.54, 1.6, { seg: 8 });
    for (let i = 0; i < 3; i++) box(g, 2.4 - i * 0.3, 0.06, 0.3, m.white, 0, 0.03 + i * 0.06, 2.1 - i * 0.12);
    plane(g, 0.9, 0.9, m.logoLit, 0, 2.0, 0.81);
    g.userData.blink = [ball(g, 0.05, m.glowR, -1.8, 1.55, -1.9), ball(g, 0.05, m.glowR, 1.8, 1.55, -1.9)];
  },
  club(g, m) {   // a small hall with a porch and a lit sign
    slab(g, m, 2, 2);
    block(g, m, 1.6, 0.8, 1.2, 0, 0.08, -0.15, m.sec, 3);
    box(g, 1.3, 0.05, 0.4, m.prim, 0, 0.75, 0.62); for (const x of [-0.6, 0.6]) box(g, 0.04, 0.7, 0.04, m.steel, x, 0.38, 0.8);
    box(g, 0.9, 0.16, 0.04, m.dark, 0, 1.0, 0.47); box(g, 0.8, 0.09, 0.02, m.glowY, 0, 1.0, 0.5);
    for (const x of [-0.35, 0.35]) box(g, 0.25, 0.25, 0.25, m.sand, x, 0.15, 0.75);
  },
  monument(g, m) {   // the Helldiver salute: a fist at chin height on a vertical forearm, in bronze, on a stepped plinth
    slab(g, m, 2, 2, m.stone);
    box(g, 1.5, 0.25, 1.5, m.stone, 0, 0.15, 0); box(g, 1.1, 0.5, 1.1, m.concrete, 0, 0.52, 0); box(g, 1.15, 0.05, 1.15, m.gold, 0, 0.8, 0);
    box(g, 0.34, 1.7, 0.34, m.bronze, 0, 1.68, 0);
    box(g, 0.5, 0.42, 0.42, m.bronze, 0, 2.7, 0.03); for (let i = 0; i < 4; i++) box(g, 0.1, 0.1, 0.14, m.bronze, -0.18 + i * 0.12, 2.7, 0.27);
    box(g, 0.12, 0.28, 0.12, m.bronze, 0.27, 2.62, 0.12);
    plane(g, 0.5, 0.5, m.logo, 0, 0.55, 0.56);
  },
  factory(g, m) {   // sheds, a chimney, a conveyor and a fuel tank
    slab(g, m, 4, 3, m.asphalt);
    block(g, m, 2.4, 1.0, 1.8, -0.6, 0.08, -0.35, m.hazard, 0); prism(g, 2.4, 1.85, 0.4, m.metal, -0.6, 1.08, -0.35);
    block(g, m, 1.2, 0.7, 1.4, 1.3, 0.08, -0.5, m.hazard, 2);
    cyl(g, 0.14, 0.18, 2.4, m.concrete, 1.5, 1.28, -1.0, { seg: 10 }); cyl(g, 0.16, 0.16, 0.08, m.red, 1.5, 2.2, -1.0, { seg: 10 });
    box(g, 1.6, 0.06, 0.3, m.steel, 0.3, 0.55, 0.9, { rz: 0.15 }); for (let i = 0; i < 4; i++) box(g, 0.22, 0.18, 0.22, m.sand, -0.3 + i * 0.38, 0.5 + i * 0.06, 0.9);
    cyl(g, 0.35, 0.35, 0.7, m.e710, -1.6, 0.43, 1.0, { seg: 14 }); cyl(g, 0.36, 0.36, 0.05, m.red, -1.6, 0.8, 1.0, { seg: 14 });
    box(g, 0.7, 0.55, 0.04, m.dark, -0.6, 0.36, 0.56);
    g.userData.blink = [ball(g, 0.05, m.glowR, 1.5, 2.55, -1.0)];
  },
  substation(g, m) {   // transformers on a pad behind a fence, a pole with insulators
    box(g, 0.94, 0.05, 0.94, m.concrete, 0, 0.025, 0, { cast: false });
    for (const x of [-0.18, 0.18]) { box(g, 0.24, 0.32, 0.22, m.olive, x, 0.21, -0.12); for (let i = 0; i < 3; i++) box(g, 0.25, 0.02, 0.23, m.dark, x, 0.1 + i * 0.09, -0.12); cyl(g, 0.025, 0.025, 0.12, m.white, x, 0.43, -0.12, { seg: 6 }); }
    cyl(g, 0.03, 0.035, 1.3, m.steel, 0.3, 0.65, 0.25, { seg: 6 }); box(g, 0.4, 0.03, 0.03, m.steel, 0.3, 1.2, 0.25); for (const x of [-0.15, 0, 0.15]) cyl(g, 0.02, 0.02, 0.06, m.white, 0.3 + x, 1.24, 0.25, { seg: 6 });
    for (const [x, z, w, d] of [[0, -0.44, 0.9, 0.02], [0, 0.44, 0.9, 0.02], [-0.44, 0, 0.02, 0.9], [0.44, 0, 0.02, 0.9]]) box(g, w, 0.35, d, m.steel, x, 0.2, z, { cast: false });
    box(g, 0.2, 0.12, 0.012, m.hazard, -0.2, 0.25, 0.45, { cast: false });
  },
  well(g, m) {   // a borehole head, a pump and a blue chlorine drum
    box(g, 0.8, 0.05, 0.8, m.concrete, 0, 0.025, 0, { cast: false });
    cyl(g, 0.12, 0.14, 0.32, m.steel, -0.12, 0.2, -0.05, { seg: 10 }); box(g, 0.26, 0.2, 0.18, m.prim, 0.18, 0.15, -0.05);
    cyl(g, 0.1, 0.1, 0.28, m.panel, 0.2, 0.16, 0.25, { seg: 10 }); cyl(g, 0.02, 0.02, 0.5, m.steel, -0.12, 0.6, -0.05, { seg: 6 }); box(g, 0.3, 0.02, 0.02, m.steel, -0.02, 0.84, -0.05);
  },
  tower(g, m) {   // a water tank on four legs, faction trim, a ladder
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { box(g, 0.05, 1.6, 0.05, m.steel, sx * 0.28, 0.8, sz * 0.28); }
    box(g, 0.6, 0.03, 0.03, m.steel, 0, 0.7, 0.28); box(g, 0.6, 0.03, 0.03, m.steel, 0, 0.7, -0.28);
    cyl(g, 0.4, 0.4, 0.5, m.white, 0, 1.85, 0, { seg: 16 }); cyl(g, 0.41, 0.41, 0.07, m.prim, 0, 1.75, 0, { seg: 16 }); cyl(g, 0.05, 0.42, 0.14, m.metal, 0, 2.17, 0, { seg: 16 });
    for (let i = 0; i < 8; i++) box(g, 0.12, 0.012, 0.012, m.steel, 0.3, 0.2 + i * 0.2, 0.32);
  },
  rowpu(g, m) {   // a purification trailer, filter columns, a bladder of clean water and hoses
    slab(g, m, 2, 2, m.gravel || m.concrete);
    container(g, m, -0.15, -0.45, 0, m.box1, 0, 1.3); for (let i = 0; i < 3; i++) cyl(g, 0.08, 0.08, 0.6, m.white, -0.55 + i * 0.25, 0.3, 0.1, { seg: 10 });
    const bl = cyl(g, 0.42, 0.46, 0.16, m.panel, 0.45, 0.09, 0.45, { seg: 16 }); bl.scale.z = 0.75;
    box(g, 0.04, 0.04, 1.2, m.rubber, 0.8, 0.03, -0.1, { cast: false });
  },
  lagoon(g, m) {   // a lined pit in a berm, murky water, a warning sign
    for (const [x, z, w, d] of [[0, -0.88, 2.9, 0.2], [0, 0.88, 2.9, 0.2], [-1.38, 0, 0.2, 1.6], [1.38, 0, 0.2, 1.6]]) box(g, w, 0.2, d, m.sandDark, x, 0.1, z);
    box(g, 2.55, 0.03, 1.55, m.lagoonW || m.dark, 0, 0.06, 0, { cast: false });
    box(g, 0.03, 0.4, 0.03, m.steel, 1.2, 0.2, 1.0); box(g, 0.3, 0.18, 0.02, m.hazard, 1.2, 0.38, 1.0);
  },
  treatment(g, m) {   // two round clarifiers, an aeration basin and a lab block
    slab(g, m, 3, 3);
    for (const x of [-0.7, 0.7]) { cyl(g, 0.55, 0.55, 0.32, m.concrete, x, 0.16, -0.65, { seg: 20 }); cyl(g, 0.48, 0.48, 0.02, m.water, x, 0.31, -0.65, { seg: 20, cast: false }); box(g, 1.0, 0.03, 0.04, m.steel, x, 0.36, -0.65); }
    box(g, 1.3, 0.25, 0.7, m.concrete, -0.55, 0.13, 0.65); box(g, 1.2, 0.02, 0.6, m.lagoonW || m.water, -0.55, 0.255, 0.65, { cast: false });
    block(g, m, 0.9, 0.6, 0.7, 0.75, 0, 0.65, m.prim, 2);
  },
  fuelfarm(g, m) {   // fuel bladders in a berm, a pump house and pipes
    slab(g, m, 3, 3, m.gravel || m.concrete);
    for (const [x, z, w, d] of [[0, -1.35, 2.8, 0.18], [-1.35, 0, 0.18, 2.8], [1.35, -0.3, 0.18, 2.2]]) box(g, w, 0.22, d, m.sandDark, x, 0.11, z);
    for (const [x, z] of [[-0.6, -0.65], [0.6, -0.65], [-0.6, 0.45]]) { const b = cyl(g, 0.48, 0.52, 0.2, m.rubber, x, 0.11, z, { seg: 16 }); b.scale.z = 0.7; }
    box(g, 0.6, 0.45, 0.5, m.olive, 0.65, 0.23, 0.6); box(g, 0.64, 0.05, 0.54, m.prim, 0.65, 0.47, 0.6);
    for (const z of [-0.65, 0.45]) box(g, 0.05, 0.05, 1.3, m.steel, 0.25, 0.06, z * 0.5 + 0.1, { cast: false });
  },
  yard(g, m) {   // an engineer yard: a vehicle shed with a roll door, HESCO, a bulldozer and stacked materials
    slab(g, m, 3, 2, m.asphalt);
    block(g, m, 1.5, 0.9, 1.3, -0.65, 0, -0.25, m.prim, 2);
    box(g, 0.9, 0.6, 0.03, m.dark, -0.65, 0.4, 0.42); for (let i = 0; i < 6; i++) box(g, 0.9, 0.012, 0.035, m.steel, -0.65, 0.12 + i * 0.09, 0.43);
    hesco(g, m, 0.95, -0.55, 3); dozer(g, m, 0.9, 0.35, -0.4);
    for (let i = 0; i < 3; i++) box(g, 0.5, 0.06, 0.2, m.ply, 0.35, 0.04 + i * 0.065, -0.7, { ry: 0.1 * i });
  },
  memorial(g, m) {
    box(g, 2.8, 0.08, 0.9, m.white, 0, 0.04, 0.05, { cast: false });
    box(g, 2.7, 0.8, 0.22, m.stone, 0, 0.48, -0.25); box(g, 2.78, 0.06, 0.28, m.dark, 0, 0.9, -0.25);
    plane(g, 0.3, 0.3, m.logo, 0, 0.62, -0.135);
    for (const s of [-1, 1]) { box(g, 0.16, 0.95, 0.3, m.dark, s * 1.38, 0.5, -0.25); box(g, 0.5, 0.5, 0.2, m.stone, s * 1.1, 0.33, 0.28, { ry: -s * 0.5 }); }
    cyl(g, 0.16, 0.1, 0.12, m.dark, 0, 0.14, 0.3, { seg: 10 }); ball(g, 0.07, m.glowY, 0, 0.24, 0.3, { seg: 8 });   // the eternal flame
    const pl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.05, 0.01), m.gold, 64); pl.count = 0;
    for (let i = 0; i < 64; i++) { const r = Math.floor(i / 16), c = i % 16, mx = new THREE.Matrix4(); mx.setPosition(c < 8 ? -1.2 + c * 0.135 : 0.255 + (c - 8) * 0.135, 0.74 - r * 0.1, -0.132); pl.setMatrixAt(i, mx); }
    g.add(pl); g.userData.plaques = pl;
    add(g, new THREE.TorusGeometry(0.1, 0.03, 6, 14), m.green, 0, 0.3, -0.12);
  },
  statue(g, m) {
    box(g, 1.7, 0.2, 1.7, m.concrete, 0, 0.1, 0); box(g, 1.1, 0.7, 1.1, m.white, 0, 0.55, 0);
    plane(g, 0.5, 0.5, m.logo, 0, 0.55, 0.56); box(g, 1.2, 0.06, 1.2, m.concrete, 0, 0.93, 0);
    const f = new THREE.Group(); f.position.set(0, 0.96, 0); f.scale.setScalar(2.1); g.add(f);
    box(f, 0.07, 0.22, 0.08, m.bronze, -0.05, 0.11, 0); box(f, 0.07, 0.22, 0.08, m.bronze, 0.05, 0.11, 0.04, { rx: -0.3 });
    box(f, 0.2, 0.24, 0.12, m.bronze, 0, 0.34, 0); ball(f, 0.06, m.bronze, 0, 0.52, 0); add(f, new THREE.SphereGeometry(0.068, 10, 6, 0, 6.3, 0, 1.6), m.bronze, 0, 0.53, 0);
    box(f, 0.05, 0.2, 0.05, m.bronze, -0.13, 0.34, 0.01, { rz: -0.12 });   // left arm at its side
    const sh = new THREE.Group(); sh.position.set(0.12, 0.44, 0); sh.rotation.set(-1.05, 0, -0.35); f.add(sh);
    box(sh, 0.05, 0.12, 0.055, m.bronze, 0, -0.06, 0);
    const el = new THREE.Group(); el.position.set(0, -0.12, 0); el.rotation.x = -2.1; sh.add(el);
    box(el, 0.048, 0.11, 0.05, m.bronze, 0, -0.055, 0); box(el, 0.045, 0.045, 0.05, m.bronze, 0, -0.125, 0);
    add(f, new THREE.PlaneGeometry(0.24, 0.32), m.bronze, 0, 0.3, -0.07, { rx: 0.15 }).material = m.bronze;
  },
};

// ---------------------------------------------------------------- construction standards (0.13): tents and prefabs
// Every building with standards has a tent and a prefab version, drawn from its footprint (w x d before rotation) with a
// few props that say what it is. Permanent is the building's own model above.
function hesco(g, m, x, z, n = 2, ry = 0) {   // wire-mesh bastions full of sand
  const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = ry; g.add(s);
  for (let i = 0; i < n; i++) { box(s, 0.3, 0.32, 0.3, m.hesco, (i - (n - 1) / 2) * 0.31, 0.16, 0); box(s, 0.31, 0.012, 0.31, m.steel, (i - (n - 1) / 2) * 0.31, 0.32, 0, { cast: false }); }
}
function dozer(g, m, x, z, ry = 0) {
  const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = ry; g.add(s);
  box(s, 0.42, 0.12, 0.28, m.rubber, 0, 0.06, 0); box(s, 0.32, 0.16, 0.22, m.hazard, -0.03, 0.2, 0); box(s, 0.14, 0.14, 0.18, m.glass, -0.1, 0.34, 0);
  box(s, 0.05, 0.16, 0.36, m.steel, 0.26, 0.1, 0); cyl(s, 0.015, 0.015, 0.12, m.dark, 0.08, 0.34, 0.06, { seg: 6 });
}
function tent(g, m, len, wid, x, z, ry = 0, h = 0.72, mat = m.canvas) {   // a GP-medium: low walls, a ridge roof, a door flap
  const t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = ry; g.add(t);
  box(t, len, h * 0.42, wid, mat, 0, h * 0.21, 0);
  prism(t, len + 0.04, wid + 0.1, h * 0.58, mat, 0, h * 0.42, 0);
  box(t, Math.min(0.3, len * 0.3), h * 0.36, 0.02, m.canvasDark, 0, h * 0.18, wid / 2 + 0.012, { cast: false });
  for (const sx of [-1, 1]) box(t, 0.012, h * 0.4, wid + 0.12, m.canvasDark, sx * len / 2, h * 0.2, 0, { cast: false });
  return t;
}
function hut(g, m, len, wid, x, z, ry = 0, h = 0.62) {   // a SEA hut: plywood on a raised floor, tin roof, trim in your colour
  const t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = ry; g.add(t);
  box(t, len, 0.08, wid, m.dark, 0, 0.04, 0);
  box(t, len - 0.02, h, wid - 0.02, m.ply, 0, 0.08 + h / 2, 0);
  box(t, len + 0.01, 0.07, wid + 0.01, m.prim, 0, 0.08 + h - 0.06, 0);
  prism(t, len + 0.14, wid + 0.16, 0.2, m.metal, 0, 0.08 + h, 0);
  const n = Math.max(1, Math.floor(len / 0.6));
  for (let i = 0; i < n; i++) { const wx = -len / 2 + (i + 0.5) * len / n; if (n > 1 && i === Math.floor(n / 2)) continue; box(t, 0.2, 0.13, 0.02, m.window, wx, 0.08 + h * 0.62, wid / 2 + 0.002, { cast: false }); }
  box(t, 0.2, 0.38, 0.02, m.trim, n > 1 ? -len / 2 + (Math.floor(n / 2) + 0.5) * len / n : 0, 0.08 + 0.19, wid / 2 + 0.004, { cast: false });
  box(t, 0.3, 0.06, 0.14, m.dark, n > 1 ? -len / 2 + (Math.floor(n / 2) + 0.5) * len / n : 0, 0.03, wid / 2 + 0.08);
  return t;
}
function container(g, m, x, z, ry = 0, mat = m.box1, y = 0, len = 1.2) {
  const t = new THREE.Group(); t.position.set(x, y, z); t.rotation.y = ry; g.add(t);
  box(t, len, 0.48, 0.46, mat, 0, 0.24, 0);
  for (let i = 0; i < 6; i++) box(t, 0.025, 0.44, 0.47, m.dark, -len / 2 + 0.1 + i * (len - 0.2) / 5, 0.24, 0, { cast: false });
  box(t, 0.02, 0.44, 0.44, m.steel, len / 2 + 0.005, 0.24, 0, { cast: false });
  return t;
}
function canopy(g, m, w, d, h, mat = m.canvas) {   // posts and a flat tarp or tin roof over open ground
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.06, h, 0.06, m.steel, sx * (w / 2 - 0.05), h / 2, sz * (d / 2 - 0.05));
  box(g, w, 0.04, d, mat, 0, h, 0);
}
function signPost(g, m, x, z, mat = m.prim) { box(g, 0.035, 0.5, 0.035, m.steel, x, 0.25, z); box(g, 0.34, 0.18, 0.02, mat, x, 0.48, z + 0.02); box(g, 0.24, 0.04, 0.021, m.white, x, 0.48, z + 0.025, { cast: false }); }
function redCross(g, m, x, y, z) { box(g, 0.24, 0.24, 0.015, m.white, x, y, z, { cast: false }); box(g, 0.16, 0.05, 0.02, m.cross, x, y, z + 0.004, { cast: false }); box(g, 0.05, 0.16, 0.02, m.cross, x, y, z + 0.004, { cast: false }); }
const SIGN_OF = { burger: 'signBurger', chicken: 'signChicken', cola: 'signCola' };
// rows of tents (or huts) filling the back of the plot, leaving a strip at the front for the street side
function rows(g, m, w, d, k, front = 0.35) {
  const W = w - 0.3, D = d - 0.25 - front, n = D > 1.5 ? 2 : 1, wid = D / n - (n > 1 ? 0.18 : 0);
  for (let i = 0; i < n; i++) { const z = -d / 2 + 0.15 + (i + 0.5) * D / n; k === 0 ? tent(g, m, W, wid, 0, z) : hut(g, m, W, wid, 0, z); }
}
function stdModel(type, k, w, d, m) {
  const g = new THREE.Group(), fz = d / 2 - 0.2;
  box(g, w - 0.08, 0.03, d - 0.08, k === 0 ? m.gravel : m.concrete, 0, 0.015, 0, { cast: false });
  const corners = () => { sandbags(g, m, -w / 2 + 0.4, fz, 0.6); sandbags(g, m, w / 2 - 0.4, fz, 0.6); };
  switch (type) {
    case 'range': case 'course': {   // the training ground is the same at every standard; the shelter beside it is not
      MAKE[type](g, m);
      if (k === 0) tent(g, m, 0.8, 0.6, w / 2 - 0.55, -d / 2 + 0.45, 0, 0.55); else hut(g, m, 0.8, 0.55, w / 2 - 0.55, -d / 2 + 0.42, 0, 0.5);
      break;
    }
    case 'depot': case 'shed': {
      const crates = [];
      if (k === 0) { for (let i = 0; i < 4; i++) { const x = -0.45 + (i % 2) * 0.9, z = -0.4 + Math.floor(i / 2) * 0.75; for (let j = 0; j < 4; j++) crates.push(box(g, 0.3, 0.26, 0.3, j % 3 ? m.crate : m.e710, x - 0.16 + (j % 2) * 0.32, 0.16, z - 0.16 + Math.floor(j / 2) * 0.32)); box(g, 0.72, 0.04, 0.72, m.canvas, x, 0.31, z); } }
      else { container(g, m, -0.1, -0.55, 0, m.box1); container(g, m, -0.1, 0.0, 0, m.box2); container(g, m, -0.1, -0.28, 0, m.box1, 0.48); for (let i = 0; i < 6; i++) crates.push(box(g, 0.26, 0.24, 0.26, m.crate, 0.7, 0.14 + Math.floor(i / 2) * 0.25, -0.5 + (i % 2) * 0.3)); }
      if (type === 'depot') g.userData.crates = crates.slice(0, 12);
      break;
    }
    case 'fueldepot': {   // bladders in a berm, then horizontal tanks on cradles
      box(g, w - 0.2, 0.14, 0.1, m.sandDark, 0, 0.07, -d / 2 + 0.15); box(g, w - 0.2, 0.14, 0.1, m.sandDark, 0, 0.07, d / 2 - 0.15); box(g, 0.1, 0.14, d - 0.2, m.sandDark, -w / 2 + 0.15, 0.07, 0); box(g, 0.1, 0.14, d - 0.2, m.sandDark, w / 2 - 0.15, 0.07, 0);
      if (k === 0) for (const z of [-0.38, 0.38]) { const b = cyl(g, 0.55, 0.6, 0.18, m.rubber, 0, 0.1, z, { seg: 18 }); b.scale.z = 0.62; }
      else for (const z of [-0.38, 0.38]) { cyl(g, 0.26, 0.26, 1.4, m.white, 0, 0.36, z, { rz: Math.PI / 2, seg: 14 }); for (const x of [-0.5, 0.5]) box(g, 0.08, 0.12, 0.4, m.steel, x, 0.06, z); }
      break;
    }
    case 'motorpool': case 'vbay': {
      if (k === 0) canopy(g, m, w - 0.3, d - 0.5, 0.85); else { canopy(g, m, w - 0.3, d - 0.5, 0.95, m.metal); box(g, w - 0.3, 0.8, 0.04, m.ply, 0, 0.5, -(d - 0.5) / 2); }
      for (let i = 0; i < 3; i++) cyl(g, 0.12, 0.12, 0.1, m.rubber, -w / 2 + 0.4 + i * 0.13, 0.1 + (i % 2) * 0.05, d / 2 - 0.2, { rx: Math.PI / 2, seg: 10 });
      container(g, m, w / 2 - 0.5, -(d - 0.5) / 2 + 0.3, 0, m.box2, 0, 0.7);
      break;
    }
    case 'burger': case 'chicken': case 'cola': {   // a stall, then a container kiosk, under the chain's own sign
      if (k === 0) { canopy(g, m, w - 0.4, d - 0.6, 0.8, m.red); box(g, w - 0.6, 0.38, 0.3, m.ply, 0, 0.19, 0.2); tent(g, m, w - 0.5, 0.6, 0, -d / 2 + 0.45); }
      else { container(g, m, 0, -0.1, 0, m.box1, 0, w - 0.4); box(g, (w - 0.6), 0.2, 0.03, m.window, 0, 0.32, 0.14); box(g, w - 0.4, 0.04, 0.4, m.red, 0, 0.6, 0.32); }
      plane(g, 1.2, 0.24, m[SIGN_OF[type]], 0, k === 0 ? 1.0 : 0.82, k === 0 ? 0.15 : 0.13);
      for (let i = 0; i < 2; i++) box(g, 0.4, 0.05, 0.16, m.ply, -0.4 + i * 0.8, 0.18, d / 2 - 0.2);
      break;
    }
    case 'hq': {   // the command post: tents or huts round a radio mast, the flag of the faction
      rows(g, m, w, d, k, 0.55);
      cyl(g, 0.02, 0.03, k === 0 ? 2.0 : 2.6, m.steel, w / 2 - 0.3, (k === 0 ? 2.0 : 2.6) / 2, -d / 2 + 0.3, { seg: 6 }); ball(g, 0.04, m.glowR, w / 2 - 0.3, k === 0 ? 2.02 : 2.62, -d / 2 + 0.3);
      box(g, 0.34, 0.24, 0.22, m.olive, -w / 2 + 0.35, 0.12, d / 2 - 0.3); cyl(g, 0.02, 0.02, 1.3, m.steel, 0.9, 0.65, d / 2 - 0.25, { seg: 6 }); flagCloth(g, m.flag, 0.45, 0.28, 0.91, 1.15, d / 2 - 0.25);
      corners(); break;
    }
    case 'mess': {
      rows(g, m, w, d, k, 0.5);
      box(g, 0.5, 0.36, 0.3, m.olive, w / 2 - 0.45, 0.18, d / 2 - 0.25); cyl(g, 0.035, 0.035, 0.45, m.steel, w / 2 - 0.3, 0.55, d / 2 - 0.25, { seg: 6 });
      for (let i = 0; i < 2; i++) box(g, 0.6, 0.05, 0.12, m.ply, -0.55 + i * 0.75, 0.16, d / 2 - 0.22);
      break;
    }
    case 'medbay': {
      rows(g, m, w, d, k, 0.4);
      redCross(g, m, 0.6, k === 0 ? 0.42 : 0.5, (k === 0 ? -0.15 : -0.15) + (d - 0.65) / 2 + 0.03);
      signPost(g, m, -w / 2 + 0.35, fz, m.white); break;
    }
    case 'yard': {
      if (k === 0) tent(g, m, 1.4, 1.0, -0.6, -0.25); else hut(g, m, 1.4, 0.95, -0.6, -0.25);
      hesco(g, m, 0.95, -0.6, k === 0 ? 2 : 3); dozer(g, m, 0.85, 0.3, -0.5);
      if (k === 1) container(g, m, 0.75, -0.15, Math.PI / 2, m.box2, 0, 0.7);
      break;
    }
    default: rows(g, m, w, d, k); signPost(g, m, -w / 2 + 0.3, fz); if (k === 0) sandbags(g, m, w / 2 - 0.45, fz, 0.6);
  }
  return g;
}
// the debris a site is cleared of, for the picture of the ground: a few low shapes per tile, coloured by biome
export const SCRUB_COL = { desert: ['#8a7550', '#6e5d44'], steppe: ['#6b7a3e', '#55623a'], ice: ['#cfd8de', '#a8b6c0'], jungle: ['#3f6a2c', '#2f5222'], ash: ['#4a4442', '#3a3432'] };
export function buildModel(type, m, merge = false, spec = null) {
  const g = new THREE.Group();
  if (spec?.std != null && spec.std < 2) g.add(stdModel(type, spec.std, spec.w, spec.d, m)); else (MAKE[type] || MAKE.hab)(g, m);
  if (g.children.length === 1 && g.children[0].userData.crates) g.userData.crates = g.children[0].userData.crates;
  if (spec && (spec.design || spec.parts?.length)) decorate(g, m, spec);
  if (merge) mergeStatic(g); return g;
}
// Designs and parts, added round any building's required shape. The building faces +z; its door is on that side.
function decorate(g, m, spec) {
  const bb = new THREE.Box3().setFromObject(g), x0 = bb.min.x + 0.1, x1 = bb.max.x - 0.1, z0 = bb.min.z + 0.1, z1 = bb.max.z - 0.1;
  const top = Math.max(0.6, Math.min(bb.max.y, 2.4)), W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const roofZ = cz - D * 0.15, wg = spec.wing || 0;
  if (wg && spec.design === 1) {   // Fortified wings: a walled yard each side with an ammo crate stack and a sandbagged post
    for (const s of [-1, 1]) {
      const wx = cx + s * (W / 2 + 0.1 + wg / 2), ox = cx + s * (W / 2 + 0.1 + wg - 0.08);
      box(g, 0.16, 0.5, D + 0.1, m.concrete, ox, 0.25, cz);                  // outer blast wall
      box(g, wg - 0.05, 0.5, 0.16, m.concrete, wx, 0.25, z0 - 0.02);          // back
      box(g, wg * 0.45, 0.5, 0.16, m.concrete, wx + s * wg * 0.22, 0.25, z1 + 0.02);   // front, with a gap by the building
      box(g, wg - 0.2, 0.03, D - 0.1, m.dirt || m.concrete, wx, 0.015, cz);   // the yard
      for (let i = 0; i < 3; i++) box(g, 0.22, 0.16, 0.16, m.oliveDark || m.dark, wx - s * 0.1, 0.08 + i * 0.165, cz - D * 0.25);
      sandbags(g, m, wx, cz + D * 0.15, wg * 0.5);
      box(g, wg * 0.5, 0.04, 0.05, m.hazard, wx + s * wg * 0.22, 0.52, z1 + 0.02);
    }
  } else if (wg && spec.design === 2) {   // Monumental wings: a lower colonnaded pavilion each side, gold-roofed
    const h = top * 0.65;
    for (const s of [-1, 1]) {
      const wx = cx + s * (W / 2 + 0.1 + wg / 2), ww = wg - 0.12;
      box(g, ww * 0.7, h, D * 0.7, m.white, wx, h / 2, cz - D * 0.1);
      box(g, ww + 0.04, 0.08, D * 0.95, m.gold, wx, h + 0.04, cz);
      box(g, ww * 0.9, 0.1, D * 0.9, m.white, wx, h + 0.13, cz);
      for (let i = 0; i < 3; i++) cyl(g, 0.045, 0.055, h, m.white, wx - ww * 0.4 + i * ww * 0.4, h / 2, z1 - 0.02, { seg: 8 });
      box(g, ww, 0.05, 0.3, m.white, wx, 0.025, z1 + 0.1);
    }
  }
  if (spec.design === 1) {   // Fortified: blast walls along the sides and back, sandbags at the door, armour plate on the corners
    for (const s of [-1, 1]) box(g, 0.14, 0.42, D * 0.85, m.concrete, cx + s * (W / 2 + 0.02), 0.21, cz - D * 0.05);
    box(g, W * 0.9, 0.42, 0.14, m.concrete, cx, 0.21, z0 - 0.02);
    for (const s of [-1, 1]) sandbags(g, m, cx + s * W * 0.32, z1 + 0.05, W * 0.22);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.18, top * 0.9, 0.18, m.oliveDark || m.dark, cx + sx * W / 2, top * 0.45, cz + sz * D / 2);
    box(g, W * 0.6, 0.05, 0.06, m.hazard, cx, 0.46, z0 - 0.06);
  } else if (spec.design === 2) {   // Monumental: a colonnade in front, gold trim, tall banners, steps
    const n = Math.max(3, Math.round(W / 0.55));
    for (let i = 0; i < n; i++) cyl(g, 0.055, 0.065, top * 0.85, m.white, x0 + 0.1 + i * (W - 0.2) / (n - 1), top * 0.425 + 0.06, z1 + 0.05, { seg: 8 });
    box(g, W + 0.1, 0.08, 0.3, m.gold, cx, top * 0.85 + 0.1, z1 + 0.05);
    box(g, W * 0.7, 0.06, 0.4, m.white, cx, 0.03, z1 + 0.25); box(g, W * 0.6, 0.06, 0.25, m.white, cx, 0.09, z1 + 0.18);
    const fo = wg ? W / 2 + wg : W / 2 + 0.15;
    for (const s of [-1, 1]) { cyl(g, 0.02, 0.025, top + 1.1, m.gold, cx + s * fo, (top + 1.1) / 2, z1 + 0.15); flagCloth(g, m.prim, 0.3, 0.6, cx + s * fo, top + 0.7, z1 + 0.16); }
  }
  for (const p of spec.parts || []) {
    if (p === 'antenna') { for (const [dx, h] of [[-0.3, 1.2], [0.25, 0.8]]) { cyl(g, 0.015, 0.02, h, m.metal, cx + dx * W * 0.5, top + h / 2, roofZ); } add(g, new THREE.SphereGeometry(0.22, 12, 6, 0, Math.PI * 2, 0, 1.0), m.white, cx + W * 0.3, top + 0.2, roofZ + 0.2, { rx: -0.8 }); (g.userData.blink ||= []).push(ball(g, 0.04, m.glowR, cx - 0.15 * W, top + 1.22, roofZ)); }
    else if (p === 'floods') { for (const s of [-1, 1]) { cyl(g, 0.02, 0.02, 0.5, m.steel, cx + s * W * 0.42, top + 0.25, z1 - 0.1); box(g, 0.16, 0.1, 0.08, m.glowY, cx + s * W * 0.42, top + 0.52, z1 - 0.06); } const pl = new THREE.Mesh(new THREE.CircleGeometry(Math.max(W, D) * 0.9, 20), m.floodPool); pl.rotation.x = -Math.PI / 2; pl.position.set(cx, 0.036, z1 + D * 0.4); g.add(pl); g.userData.night = g.userData.night ? [].concat(g.userData.night, pl) : pl; }
    else if (p === 'sign') { box(g, W * 0.6, 0.26, 0.06, m.dark, cx, top + 0.18, z1 - 0.05); box(g, W * 0.55, 0.16, 0.02, m.glowY, cx, top + 0.18, z1 - 0.01); }
    else if (p === 'flags') { for (let i = 0; i < 3; i++) { const x = cx - W * 0.35 + i * W * 0.35; cyl(g, 0.015, 0.02, 1.2, m.metal, x, top + 0.6, roofZ - D * 0.2); flagCloth(g, i === 1 ? m.seflag || m.prim : m.prim, 0.28, 0.18, x, top + 1.08, roofZ - D * 0.2); } }
    else if (p === 'solar') { for (let i = 0; i < 3; i++) box(g, W * 0.24, 0.03, D * 0.45, m.panel, cx - W * 0.3 + i * W * 0.3, top + 0.12, roofZ, { rx: -0.35 }); }
    else if (p === 'guns') { const t = new THREE.Group(); t.position.set(cx + W * 0.25, top, roofZ); g.add(t); cyl(t, 0.18, 0.2, 0.14, m.concrete, 0, 0.07, 0); box(t, 0.22, 0.14, 0.22, m.metal, 0, 0.2, 0); for (const x of [-0.04, 0.04]) cyl(t, 0.018, 0.018, 0.45, m.steel, x, 0.22, 0.3, { rx: Math.PI / 2, seg: 6 }); g.userData.spin = g.userData.spin || t; }
    else if (p === 'planter') { for (const s of [-1, 1]) { box(g, 0.45, 0.18, 0.3, m.concrete, cx + s * W * 0.38, 0.09, z1 + 0.35); ball(g, 0.2, m.green || m.olive, cx + s * W * 0.38, 0.32, z1 + 0.35, { seg: 8 }); } }
    else if (p === 'vents') { for (let i = 0; i < 2; i++) { box(g, 0.4, 0.3, 0.4, m.metal, cx - W * 0.2 + i * W * 0.4, top + 0.15, roofZ - D * 0.15); cyl(g, 0.14, 0.14, 0.04, m.dark, cx - W * 0.2 + i * W * 0.4, top + 0.32, roofZ - D * 0.15, { seg: 10 }); } }
    else if (p === 'holo') { const h = new THREE.Group(); h.position.set(cx - W * 0.25, top + 0.55, roofZ); g.add(h); add(h, new THREE.OctahedronGeometry(0.22), m.glowB, 0, 0, 0); add(h, new THREE.TorusGeometry(0.34, 0.012, 6, 24), m.glowY, 0, 0, 0, { rx: Math.PI / 2 }); cyl(g, 0.12, 0.16, 0.12, m.dark, cx - W * 0.25, top + 0.06, roofZ); if (!g.userData.spin) g.userData.spin = h; else (g.userData.spin2 = h); }
  }
}
// Fold every part that never moves into one mesh per material, so a building costs a handful of draw calls instead of
// dozens. Anything an animation reaches through userData (dishes, crates, flags, lights) is left alone.
export function mergeStatic(root) {
  const keep = new Set(), mark = o => o && o.isObject3D && o.traverse(c => keep.add(c));
  for (const v of Object.values(root.userData)) (Array.isArray(v) ? v : [v]).forEach(mark);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), groups = new Map(), drop = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || keep.has(o) || Array.isArray(o.material) || o.userData.wave || o.morphTargetInfluences) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!g.attributes.normal || !g.attributes.uv) return;
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const key = o.material.uuid + (o.castShadow ? 's' : '');
    if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow, list: [] });
    groups.get(key).list.push(g); drop.push(o);
  });
  for (const o of drop) o.parent.remove(o);
  for (const { mat, cast, list } of groups.values()) {
    const n = list.reduce((a, g) => a + g.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let k = 0;
    for (const g of list) { pos.set(g.attributes.position.array, k * 3); nor.set(g.attributes.normal.array, k * 3); uv.set(g.attributes.uv.array, k * 2); k += g.attributes.position.count; g.dispose(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = cast; mesh.receiveShadow = true; mesh.userData.merged = true; root.add(mesh);
  }
}

// ---------------------------------------------------------------- people and vehicles
export function makePerson(m, kind = 'troop') {
  const hd = kind === 'hd', civ = kind.startsWith('civ'), eng = kind === 'eng';   // engineers: coveralls, a hard hat and a hi-vis vest   // Helldivers: black and gold with a cape. Citizens: pressed, approved work clothes
  const g = new THREE.Group(), body = kind === 'inspector' ? m.coat : hd ? m.hdArmour : civ ? m[kind] : eng ? m.engSuit : m.uniform;
  const helmet = hd ? m.hdArmour : eng ? m.hardhat : m.helmet;
  const leg = (x) => { const p = new THREE.Group(); p.position.set(x, 0.2, 0); g.add(p); box(p, 0.05, 0.2, 0.06, m.boots, 0, -0.1, 0); return p; };
  // an arm is a shoulder joint with the upper arm, and an elbow joint with the forearm and a clenched fist,
  // so poses like the Helldiver salute (fist at the chin, forearm upright) are possible
  const arm = (x) => {
    const p = new THREE.Group(); p.position.set(x, 0.38, 0); g.add(p);
    box(p, 0.045, 0.09, 0.05, body, 0, -0.045, 0);
    const el = new THREE.Group(); el.position.set(0, -0.09, 0); p.add(el); p.userData.elbow = el;
    box(el, 0.042, 0.08, 0.046, body, 0, -0.04, 0); box(el, 0.036, 0.034, 0.04, m.boots, 0, -0.092, 0);
    return p;
  };
  const parts = { legL: leg(-0.035), legR: leg(0.035), armL: arm(-0.085), armR: arm(0.085) };
  if (kind !== 'inspector') {
    box(parts.armL, 0.05, 0.022, 0.055, hd ? m.hdGold : m.armband, 0, -0.06, 0, { cast: false });
    if (hd) box(parts.armR, 0.05, 0.022, 0.055, m.hdGold, 0, -0.06, 0, { cast: false });
    if (m.crestOn && !hd && !civ) { const c = plane(parts.armL, 0.04, 0.04, m.logo, -0.0235, -0.025, 0); c.rotation.y = -Math.PI / 2; }
  }
  parts.torso = box(g, 0.13, 0.19, 0.08, body, 0, 0.3, 0);
  if (eng) { box(g, 0.138, 0.13, 0.088, m.vest, 0, 0.33, 0); box(g, 0.14, 0.018, 0.09, m.white, 0, 0.31, 0, { cast: false }); }
  parts.head = new THREE.Group(); parts.head.position.set(0, 0.44, 0); g.add(parts.head);
  ball(parts.head, 0.045, m.skin, 0, 0, 0, { seg: 8 });
  if (kind === 'inspector') { cyl(parts.head, 0.055, 0.05, 0.03, m.cap, 0, 0.035, 0, { seg: 10 }); box(parts.head, 0.07, 0.01, 0.04, m.coat, 0, 0.025, 0.05); box(parts.armR.userData.elbow, 0.07, 0.09, 0.005, m.paper, 0, -0.05, 0.035); }
  else if (civ) { add(parts.head, new THREE.SphereGeometry(0.05, 8, 4, 0, 6.3, 0, 1.2), m.hair, 0, 0.008, -0.004); box(g, 0.132, 0.03, 0.082, m.boots, 0, 0.215, 0); }
  else {
    add(parts.head, new THREE.SphereGeometry(0.055, 10, 5, 0, 6.3, 0, 1.5), helmet, 0, 0.005, 0); box(g, 0.1, 0.12, 0.05, helmet, 0, 0.32, -0.06);
    if (hd) {   // gold trim, a visor stripe and the cape
      box(parts.head, 0.02, 0.012, 0.11, m.hdGold, 0, 0.058, 0); box(g, 0.132, 0.022, 0.082, m.hdGold, 0, 0.385, 0); box(g, 0.132, 0.022, 0.082, m.hdGold, 0, 0.215, 0);
      box(g, 0.12, 0.24, 0.012, m.hdGold, 0, 0.27, -0.094, { rx: 0.12 }); box(g, 0.1, 0.2, 0.013, m.hdArmour, 0, 0.27, -0.0935, { rx: 0.12 });
    }
  }
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
  box(g, 0.1, 0.12, 0.07, m.civ1, 0, 0.3, -0.12); ball(g, 0.04, m.skin || m.civ0, 0, 0.4, -0.12, { seg: 8 }); box(g, 0.085, 0.025, 0.085, m.lift, 0, 0.44, -0.12);   // a citizen driver in a hard hat
  box(g, 0.05, 0.05, 0.05, m.glowY, 0, 0.56, -0.12);
  const cargo = new THREE.Group(); g.add(cargo); box(cargo, 0.22, 0.18, 0.2, m.crate, 0, 0.17, 0.36); g.userData.cargo = cargo;
  return g;
}
export function makeTruck(m) {
  const g = new THREE.Group();
  box(g, 0.34, 0.06, 0.82, m.dark, 0, 0.12, 0);
  box(g, 0.34, 0.13, 0.24, m.prim, 0, 0.195, 0.28); box(g, 0.34, 0.03, 0.24, m.prim, 0, 0.385, 0.28); box(g, 0.34, 0.12, 0.03, m.prim, 0, 0.31, 0.175);
  for (const x of [-0.16, 0.16]) for (const z of [0.39, 0.17]) box(g, 0.02, 0.12, 0.02, m.prim, x, 0.31, z);
  box(g, 0.3, 0.11, 0.012, m.glass, 0, 0.315, 0.397); box(g, 0.1, 0.1, 0.07, m.civ1, -0.07, 0.3, 0.27); ball(g, 0.038, m.skin || m.civ0, -0.07, 0.345, 0.28, { seg: 8 });   // a citizen at the wheel box(g, 0.08, 0.04, 0.01, m.glowY, -0.1, 0.2, 0.405); box(g, 0.08, 0.04, 0.01, m.glowY, 0.1, 0.2, 0.405);
  box(g, 0.36, 0.06, 0.5, m.primDark, 0, 0.18, -0.12);
  const cargo = new THREE.Group(); g.add(cargo); for (let i = 0; i < 4; i++) box(cargo, 0.15, 0.13, 0.2, m.crate, -0.08 + (i % 2) * 0.16, 0.28, -0.24 + Math.floor(i / 2) * 0.22);
  g.userData.cargo = cargo;
  for (const [x, z] of [[-0.18, 0.28], [0.18, 0.28], [-0.18, -0.1], [0.18, -0.1], [-0.18, -0.28], [0.18, -0.28]]) cyl(g, 0.07, 0.07, 0.06, m.rubber, x, 0.07, z, { rz: Math.PI / 2, seg: 10 });
  return g;
}
export function makeFRV(m) {   // fast recon vehicle: open frame, roll cage, a mounted gun
  const g = new THREE.Group();
  box(g, 0.36, 0.1, 0.7, m.olive, 0, 0.16, 0); box(g, 0.34, 0.08, 0.2, m.oliveDark, 0, 0.24, 0.24);
  for (const x of [-0.15, 0.15]) { box(g, 0.025, 0.24, 0.025, m.steel, x, 0.33, 0.05); box(g, 0.025, 0.2, 0.025, m.steel, x, 0.31, -0.25); box(g, 0.025, 0.025, 0.32, m.steel, x, 0.45, -0.1); }
  box(g, 0.34, 0.02, 0.02, m.glass, 0, 0.36, 0.13);
  cyl(g, 0.04, 0.04, 0.06, m.steel, 0, 0.5, -0.12); box(g, 0.025, 0.025, 0.28, m.dark, 0, 0.52, 0.0);
  for (const [x, z] of [[-0.2, 0.23], [0.2, 0.23], [-0.2, -0.23], [0.2, -0.23]]) cyl(g, 0.09, 0.09, 0.07, m.rubber, x, 0.09, z, { rz: Math.PI / 2, seg: 12 });
  box(g, 0.06, 0.03, 0.01, m.glowY, -0.12, 0.2, 0.355); box(g, 0.06, 0.03, 0.01, m.glowY, 0.12, 0.2, 0.355);
  return g;
}
export function makeTank(m) {
  const g = new THREE.Group();
  for (const x of [-0.24, 0.24]) { box(g, 0.14, 0.16, 0.95, m.rubber, x, 0.09, 0); box(g, 0.15, 0.04, 0.9, m.oliveDark, x, 0.19, 0); }
  box(g, 0.38, 0.16, 0.85, m.olive, 0, 0.22, 0); box(g, 0.4, 0.04, 0.3, m.oliveDark, 0, 0.3, 0.32, { rx: -0.3 });
  const turret = new THREE.Group(); turret.position.set(0, 0.32, -0.05); g.add(turret);
  box(turret, 0.32, 0.14, 0.38, m.olive, 0, 0.07, 0); cyl(turret, 0.03, 0.035, 0.6, m.oliveDark, 0, 0.08, 0.45, { rx: Math.PI / 2 });
  cyl(turret, 0.05, 0.05, 0.05, m.steel, 0.08, 0.17, -0.06); box(turret, 0.08, 0.02, 0.01, m.hazard, -0.1, 0.1, 0.19);
  g.userData.turret = turret;
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
