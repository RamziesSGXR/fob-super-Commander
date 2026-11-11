// The 3D view: a near-isometric camera you can rotate, the ground, the wire, every building and everyone walking about.
import * as THREE from './vendor/three.js';
import { B } from './config.js';
import { dims } from './sim.js';
import { makeMats, buildModel, makePerson, makeForklift, makeCrate, makePelican, wrap } from './models.js';
import { Noise } from './noise.js';

const TAU = Math.PI * 2;

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFShadowMap;
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);
    this.yaw = Math.PI / 4; this.yawT = this.yaw; this.pitch = 0.68; this.zoom = 9; this.zoomT = 9;
    this.target = new THREE.Vector3(0, 0, 2); this.ray = new THREE.Raycaster(); this.t = 0;
    const hemi = new THREE.HemisphereLight('#dfe9ff', '#6b5638', 1.1); this.scene.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight('#fff1d6', 2.4);
    sun.position.set(-18, 30, 12); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    this.scene.add(sun); this.scene.add(sun.target);
    this.world = new THREE.Group(); this.scene.add(this.world);
    window.addEventListener('resize', () => this.resize()); this.resize();
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.r.setSize(w, h, false); this.aspect = w / h; this.w = w; this.h = h;
  }

  // ---------------------------------------------------------------- a base to show
  attach(sim, life) {
    this.sim = sim; this.life = life; this.N = sim.N;
    this.world.clear();
    this.bm = new Map(); this.pm = new Map(); this.fm = new Map(); this.cm = []; this.lm = new Map(); this.smoke = [];
    this.ghostKey = '';
    this.buildGround();
    this.setFaction(sim.faction);
  }
  setFaction(f) {
    if (this.m) for (const t of this.m.tex) t.dispose();
    this.m = makeMats(f);
    for (const g of this.bm.values()) this.world.remove(g); this.bm.clear();
    for (const g of this.pm.values()) this.world.remove(g); this.pm.clear();
    for (const g of this.lm.values()) this.world.remove(g); this.lm.clear();
    this.ghostKey = '';
    if (this.gate) this.world.remove(this.gate);
    this.gate = this.buildGate(f); this.world.add(this.gate);
  }
  wx(x) { return x - this.N / 2; }

  depAt(fx, fz) {   // the deposit map, smoothed, so the oil reads as pools rather than squares
    const N = this.N, d = this.sim.dep, x0 = Math.floor(fx), z0 = Math.floor(fz), u = fx - x0, v = fz - z0;
    const at = (x, z) => (x < 0 || z < 0 || x >= N || z >= N) ? 0 : d[z * N + x];
    return (at(x0, z0) * (1 - u) + at(x0 + 1, z0) * u) * (1 - v) + (at(x0, z0 + 1) * (1 - u) + at(x0 + 1, z0 + 1) * u) * v;
  }
  buildGround() {
    const N = this.N, s = this.sim, nz = new Noise(s.seed + 3), P = 16, c = document.createElement('canvas');
    c.width = c.height = N * P; const g = c.getContext('2d'), img = g.createImageData(N * P, N * P), d = img.data;
    const hue = [[156, 128, 92], [142, 112, 84], [120, 118, 98], [164, 120, 84]][s.seed % 4];
    for (let y = 0; y < N * P; y++) for (let x = 0; x < N * P; x++) {
      const tx = Math.floor(x / P), tz = Math.floor(y / P), n = nz.fbm(x / 40, y / 40, 4), f = nz.v(x / 3, y / 3);
      let r = hue[0] * (0.8 + n * 0.4) + f * 10, gg = hue[1] * (0.8 + n * 0.4) + f * 8, b = hue[2] * (0.8 + n * 0.4) + f * 6;
      const dv = this.depAt(x / P - 0.5, y / P - 0.5) + (nz.fbm(x / 9, y / 9) - 0.5) * 0.5;
      if (dv > 0.5) { const k = 0.6 + nz.v(x / 5, y / 5) * 0.5, sheen = Math.max(0, nz.v(x / 14 + 9, y / 14) - 0.6) * 160; r = 26 * k + sheen * 0.6; gg = 20 * k + sheen * 0.3; b = 34 * k + sheen; }
      else if (dv > 0.38) { const e = (dv - 0.38) / 0.12; r *= 1 - e * 0.55; gg *= 1 - e * 0.6; b *= 1 - e * 0.5; }
      if (s.road(tx, tz) || (tz === N - 1 && s.road(tx, N - 2))) { r = 68 + f * 8; gg = 68 + f * 8; b = 64 + f * 8; if (x % P === P / 2 && (tx === N / 2 - 1 || tx === N / 2) && (y % 12) < 6) { r = 230; gg = 200; b = 40; } }
      const i = (y * N * P + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(N, N), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.world.add(ground); this.ground = ground;
    // the land beyond the wire
    const oc = document.createElement('canvas'); oc.width = oc.height = 256; const og = oc.getContext('2d'), oi = og.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const n = nz.fbm(x / 30 + 50, y / 30, 4), i = (y * 256 + x) * 4; oi.data[i] = hue[0] * (0.62 + n * 0.35); oi.data[i + 1] = hue[1] * (0.62 + n * 0.35); oi.data[i + 2] = hue[2] * (0.62 + n * 0.35); oi.data[i + 3] = 255; }
    og.putImageData(oi, 0, 0); const ot = new THREE.CanvasTexture(oc); ot.wrapS = ot.wrapT = THREE.RepeatWrapping; ot.repeat.set(10, 10); ot.colorSpace = THREE.SRGBColorSpace;
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: ot, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; outer.receiveShadow = true; this.world.add(outer);
    const sky = new THREE.Color(hue[0] / 255 * 0.55 + 0.25, hue[1] / 255 * 0.55 + 0.27, hue[2] / 255 * 0.55 + 0.32);
    this.scene.background = sky; this.scene.fog = new THREE.Fog(sky, 150, 260);
    // rocks and hills
    const rock = new THREE.MeshStandardMaterial({ color: new THREE.Color(hue[0] / 340, hue[1] / 340, hue[2] / 340), roughness: 1, flatShading: true });
    const rg = new THREE.DodecahedronGeometry(1, 0), rocks = new THREE.InstancedMesh(rg, rock, 160), mx = new THREE.Matrix4(), q = new THREE.Quaternion();
    let n = 0, k = 1;
    while (n < 160) {
      k++; const a = nz.v(k * 1.7, 3) * TAU * 3, r = N / 2 + 3 + nz.v(5, k * 1.3) * 45, x = Math.cos(a) * r, z = Math.sin(a) * r, sc = 0.3 + nz.v(k, k) * 1.4;
      if (Math.abs(x) < N / 2 + 2 && Math.abs(z) < N / 2 + 2) continue;
      if (Math.abs(x) < 3 && z > N / 2) continue;   // keep the road out clear
      q.setFromEuler(new THREE.Euler(a, a * 2, 0)); mx.compose(new THREE.Vector3(x, sc * 0.3, z), q, new THREE.Vector3(sc, sc * 0.7, sc)); rocks.setMatrixAt(n++, mx);
    }
    rocks.castShadow = rocks.receiveShadow = true; this.world.add(rocks);
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * TAU + nz.v(i, 9), r = 95 + nz.v(9, i) * 50, h = 10 + nz.v(i * 3, 2) * 22;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(h * 1.6, h, 6), rock); hill.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r); hill.rotation.y = a; this.world.add(hill);
    }
    // the road out of the gate
    const road = new THREE.Mesh(new THREE.PlaneGeometry(4, 60), new THREE.MeshStandardMaterial({ color: '#46443f', roughness: 1 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, -0.01, N / 2 + 30); road.receiveShadow = true; this.world.add(road);
    // the wire: Hesco barriers all round, a watchtower on each corner
    const m = N / 2, spots = [];
    for (let i = 0; i < N; i++) { spots.push([i, 0], [0, i], [N - 1, i]); if (i < m - 3 || i > m + 2) spots.push([i, N - 1]); }
    const hes = new THREE.MeshStandardMaterial({ color: '#b39a6c', roughness: 1 }), hesTop = new THREE.MeshStandardMaterial({ color: '#8b7652', roughness: 1 });
    const hm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.96, 0.8, 0.96), hes, spots.length), ht = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.04, 0.9), hesTop, spots.length);
    spots.forEach(([x, z], i) => { mx.makeTranslation(this.wx(x + 0.5), 0.4, this.wx(z + 0.5)); hm.setMatrixAt(i, mx); mx.makeTranslation(this.wx(x + 0.5), 0.81, this.wx(z + 0.5)); ht.setMatrixAt(i, mx); });
    hm.castShadow = hm.receiveShadow = true; this.world.add(hm, ht);
    const wood = new THREE.MeshStandardMaterial({ color: '#5a5650', roughness: 0.9 }), roof = new THREE.MeshStandardMaterial({ color: '#3f4440', roughness: 0.8 });
    this.tower = (x, z) => {
      const t = new THREE.Group(); t.position.set(this.wx(x + 0.5), 0, this.wx(z + 0.5));
      for (const [a, b] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), wood); l.position.set(a, 1.1, b); l.castShadow = true; t.add(l); }
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.1), hes); cab.position.y = 2.3; cab.castShadow = true; t.add(cab);
      const rf = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.4, 4), roof); rf.position.y = 2.9; rf.rotation.y = Math.PI / 4; rf.castShadow = true; t.add(rf);
      return t;
    };
    for (const [x, z] of [[0, 0], [N - 1, 0], [0, N - 1], [N - 1, N - 1]]) this.world.add(this.tower(x, z));
    // grid shown while building
    this.grid = new THREE.GridHelper(N - 2, N - 2, '#9dffb8', '#9dffb8'); this.grid.material.transparent = true; this.grid.material.opacity = 0.16; this.grid.position.y = 0.02; this.grid.visible = false; this.world.add(this.grid);
    this.depLayer = new THREE.Group(); this.depLayer.visible = false; this.world.add(this.depLayer);
    const dm = new THREE.MeshBasicMaterial({ color: '#c070ff', transparent: true, opacity: 0.28, depthWrite: false });
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (s.dep[z * N + x]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), dm); p.rotation.x = -Math.PI / 2; p.position.set(this.wx(x + 0.5), 0.03, this.wx(z + 0.5)); this.depLayer.add(p); }
    // selection and range markers
    this.sel = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#ffe600' }));
    this.sel.visible = false; this.world.add(this.sel);
    this.range = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: '#ff4a4a', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    this.range.rotation.x = -Math.PI / 2; this.range.position.y = 0.05; this.range.visible = false; this.world.add(this.range);
    this.foot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#59ff8a', transparent: true, opacity: 0.25, depthWrite: false }));
    this.foot.rotation.x = -Math.PI / 2; this.foot.position.y = 0.04; this.foot.visible = false; this.world.add(this.foot);
    this.smokeMat = []; this.smokeGeo = new THREE.SphereGeometry(0.12, 8, 6);
  }
  buildGate(f) {
    const N = this.N, m = N / 2, g = new THREE.Group();
    g.add(this.tower(m - 3, N - 1), this.tower(m + 2, N - 1));
    const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d');
    x.fillStyle = '#1a1d1a'; x.fillRect(0, 0, 512, 96); x.fillStyle = f.secondary; x.fillRect(0, 0, 512, 6); x.fillRect(0, 90, 512, 6);
    x.fillStyle = '#ffffff'; x.font = 'bold 40px ui-monospace, Menlo, Consolas, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(f.base.toUpperCase().slice(0, 22), 256, 48);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, 0.1), [this.m.dark, this.m.dark, this.m.dark, this.m.dark, new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#fff', emissiveIntensity: 0.4 }), new THREE.MeshStandardMaterial({ map: t })]);
    sign.position.set(0, 2.9, m - 0.5); sign.castShadow = true; g.add(sign);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.08), this.m.red); boom.position.set(-1.6, 1.4, m - 0.2); boom.rotation.z = 0.15; g.add(boom);
    return g;
  }

  // ---------------------------------------------------------------- the camera
  camUpdate(dt) {
    this.yaw += (this.yawT - this.yaw) * Math.min(1, dt * 8);
    this.zoom += (this.zoomT - this.zoom) * Math.min(1, dt * 10);
    const h = this.N / 2 + 6; this.target.x = Math.max(-h, Math.min(h, this.target.x)); this.target.z = Math.max(-h, Math.min(h + 8, this.target.z));
    const c = this.cam, z = this.zoom;
    const off = (this.shift || 0) * z * this.aspect;   // the title screen pushes the base to the right of the card
    c.left = -z * this.aspect + off; c.right = z * this.aspect + off; c.top = z; c.bottom = -z; c.updateProjectionMatrix();
    const d = 160, cp = Math.cos(this.pitch);
    c.position.set(this.target.x + Math.sin(this.yaw) * cp * d, Math.sin(this.pitch) * d, this.target.z + Math.cos(this.yaw) * cp * d);
    c.lookAt(this.target);
    this.sun.target.position.copy(this.target); this.sun.position.set(this.target.x - 18, 30, this.target.z + 12);
  }
  rotate(steps) { this.yawT += steps * Math.PI / 4; }
  spin(dx) { this.yawT += dx; this.yaw = this.yawT; }
  zoomBy(f) { this.zoomT = Math.max(4, Math.min(30, this.zoomT * f)); }
  pan(dxPx, dyPx) {   // drag the ground under the pointer
    const k = this.zoom * 2 / this.h, s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const ax = -dxPx * k, az = -dyPx * k / Math.sin(this.pitch);
    this.target.x += ax * c + az * -s; this.target.z += ax * -s + az * -c;
  }
  move(fx, fz, dt) { const k = this.zoom * 1.2 * dt, s = Math.sin(this.yaw), c = Math.cos(this.yaw); this.target.x += (fx * c - fz * s) * k; this.target.z += (-fx * s - fz * c) * k; }
  lookAt(tx, tz) { this.target.set(this.wx(tx), 0, this.wx(tz)); }

  // where the pointer is: the tile under it and the building it's over
  pick(cx, cy) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2((cx - rect.left) / rect.width * 2 - 1, -(cy - rect.top) / rect.height * 2 + 1);
    this.ray.setFromCamera(ndc, this.cam);
    const p = new THREE.Vector3(); this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
    const hits = this.ray.intersectObjects([...this.bm.values()], true);
    const bid = hits.length ? hits[0].object.userData.bid ?? null : null;
    return { x: p.x + this.N / 2, z: p.z + this.N / 2, bid };
  }

  // ---------------------------------------------------------------- the build ghost and the selection
  setGhost(type, x, z, rot, ok) {
    if (!type) { if (this.ghostG) this.ghostG.visible = false; this.foot.visible = false; this.range.visible = false; this.grid.visible = false; this.depLayer.visible = false; return; }
    const key = type + rot;
    if (key !== this.ghostKey) {
      if (this.ghostG) this.world.remove(this.ghostG);
      this.ghostG = buildModel(type, this.m); this.ghostKey = key;
      this.ghostMat = new THREE.MeshStandardMaterial({ color: '#59ff8a', transparent: true, opacity: 0.55, depthWrite: false });
      this.ghostG.traverse(o => { if (o.isMesh) { o.material = this.ghostMat; o.castShadow = false; } });
      this.ghostG.rotation.y = rot * Math.PI / 2; this.world.add(this.ghostG);
    }
    const [w, d] = dims(type, rot);
    this.ghostG.visible = true; this.ghostG.position.set(this.wx(x + w / 2), 0, this.wx(z + d / 2));
    this.ghostMat.color.set(ok ? '#59ff8a' : '#ff4a4a');
    this.foot.visible = true; this.foot.scale.set(w, d, 1); this.foot.position.set(this.wx(x + w / 2), 0.04, this.wx(z + d / 2)); this.foot.material.color.set(ok ? '#59ff8a' : '#ff4a4a');
    this.grid.visible = true; this.depLayer.visible = !!B[type].onDeposit;
    const nr = B[type].noise; this.range.visible = !!nr;
    if (nr) { this.range.scale.setScalar(nr); this.range.position.set(this.wx(x + w / 2), 0.05, this.wx(z + d / 2)); }
  }
  select(b) {
    this.selId = b ? b.id : null; this.sel.visible = !!b;
    if (!b) { this.range.visible = false; return; }
    const x0 = this.wx(b.x) - 0.05, z0 = this.wx(b.z) - 0.05, x1 = this.wx(b.x + b.w) + 0.05, z1 = this.wx(b.z + b.d) + 0.05;
    this.sel.geometry.setFromPoints([new THREE.Vector3(x0, 0.06, z0), new THREE.Vector3(x1, 0.06, z0), new THREE.Vector3(x1, 0.06, z1), new THREE.Vector3(x0, 0.06, z1)]);
    const nr = B[b.type].noise; this.range.visible = !!nr;
    if (nr) { this.range.scale.setScalar(nr); this.range.position.set(this.wx(b.x + b.w / 2), 0.05, this.wx(b.z + b.d / 2)); }
  }

  // ---------------------------------------------------------------- every frame
  frame(dt) {
    this.t += dt; const s = this.sim, t = this.t;
    this.camUpdate(dt);
    this.syncBuildings(dt);
    this.syncPeople(dt);
    this.syncVehicles(dt);
    this.smokeUpdate(dt);
    if (this.sel.visible) this.sel.material.color.setHSL(0.15, 1, 0.5 + 0.2 * Math.sin(t * 6));
    this.r.render(this.scene, this.cam);
    void s;
  }

  syncBuildings(dt) {
    const s = this.sim, t = this.t;
    for (const b of s.b) {
      let g = this.bm.get(b.id);
      if (!g) {
        g = new THREE.Group(); g.userData.b = b.id;
        const model = buildModel(b.type, this.m); model.rotation.y = b.rot * Math.PI / 2; g.add(model); g.userData.model = model;
        g.position.set(this.wx(b.x + b.w / 2), 0, this.wx(b.z + b.d / 2));
        g.traverse(o => { o.userData.bid = b.id; });
        const box = new THREE.Box3().setFromObject(model); g.userData.top = box.max.y;
        const d = B[b.type];
        if (d.crew || d.pw < 0) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), this.m.glowG); lamp.position.set(0, box.max.y + 0.25, 0); lamp.userData.bid = b.id; g.add(lamp); g.userData.lamp = lamp; }
        this.world.add(g); this.bm.set(b.id, g);
      }
      const model = g.userData.model, ud = model.userData;
      // under construction: it rises inside scaffolding
      if (!b.done) {
        if (!g.userData.scaf) {
          const h = Math.max(0.8, g.userData.top + 0.2), sc = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w - 0.1, h, b.d - 0.1, Math.max(1, b.w), 2, Math.max(1, b.d))), this.m.scaffold);
          sc.position.y = h / 2; g.add(sc); g.userData.scaf = sc;
        }
        model.scale.y = 0.06 + 0.94 * b.prog;
      } else if (g.userData.scaf) { g.remove(g.userData.scaf); g.userData.scaf = null; model.scale.y = 1; }
      // wear: grime on the roof as the condition drops, and it leans a little when it's really bad
      const worn = b.cond < 60 ? (b.cond < 35 ? 2 : 1) : 0;
      if (g.userData.worn !== worn) {
        if (g.userData.grime) g.remove(g.userData.grime);
        g.userData.grime = null; g.userData.worn = worn; model.rotation.z = worn === 2 ? 0.025 : 0;
        if (worn) {
          const gr = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: worn === 2 ? '#1a120a' : '#3a2c1a', transparent: true, opacity: worn === 2 ? 0.55 : 0.35, depthWrite: false });
          for (let i = 0; i < 3 + worn * 3; i++) { const p = new THREE.Mesh(new THREE.CircleGeometry(0.15 + Math.random() * 0.25, 7), mat); p.rotation.x = -Math.PI / 2; p.position.set((Math.random() - 0.5) * (b.w - 0.4), g.userData.top + 0.01, (Math.random() - 0.5) * (b.d - 0.4)); gr.add(p); }
          g.add(gr); g.userData.grime = gr;
        }
      }
      if (!b.done) continue;
      const w = s.work(b);
      if (g.userData.lamp) {
        const d = B[b.type], noCrew = d.crew && b.crew < d.crew, noPow = d.pw < 0 && s.power.ratio < 1;
        g.userData.lamp.material = b.off ? this.m.glowR : noPow ? ((t * 2) % 1 < 0.5 ? this.m.glowR : this.m.glowY) : noCrew ? this.m.glowY : this.m.glowG;
        g.userData.lamp.position.y = g.userData.top + 0.25 + Math.sin(t * 2 + b.id) * 0.03;
      }
      if (ud.beam) ud.beam.rotation.z = Math.sin(t * 2.2 + b.id) * 0.28 * Math.min(1, w * 1.5);
      if (ud.spin) ud.spin.rotation.y += dt * 0.6;
      if (ud.glow) ud.glow.material.emissiveIntensity = w > 0 ? 1 + Math.sin(t * 9) * 0.3 : 0.1;
      if (ud.smoke && b.running && Math.random() < dt * 5) for (const p of ud.smoke) {
        const v = new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.rot * Math.PI / 2).add(g.position); this.puff(v);
      }
      if (ud.plaques) ud.plaques.count = Math.min(64, s.fallen.length);
      if (ud.crates) { const n = Math.round(Math.min(1, (s.e710 + s.shells) / Math.max(1, s.cap)) * 12); ud.crates.forEach((c, i) => c.visible = i < n); }
      model.traverse(o => { const wv = o.userData.wave; if (!wv) return;
        const pos = o.geometry.attributes.position, a = pos.array, base = wv.base;
        for (let i = 0; i < a.length; i += 3) {
          const x = base[i], y = base[i + 1], k = wv.soft ? 0 : x / wv.w;
          a[i + 2] = wv.soft ? Math.sin(t * 1.8 + y * 2 + b.id) * 0.04 * (0.55 - y) : Math.sin(x * 5 - t * 6 + b.id) * 0.07 * k + Math.sin(t * 2.3 + b.id) * 0.03 * k;
        }
        pos.needsUpdate = true; });
    }
    for (const [id, g] of this.bm) if (!s.byId(id)) { this.world.remove(g); this.bm.delete(id); if (this.selId === id) this.select(null); }
  }

  puff(p) {
    let m = this.smoke.find(q => !q.visible);
    if (!m) { if (this.smoke.length > 120) return; m = new THREE.Mesh(this.smokeGeo, new THREE.MeshStandardMaterial({ color: '#8d8a84', transparent: true, opacity: 0.6, depthWrite: false })); this.world.add(m); this.smoke.push(m); }
    m.visible = true; m.position.copy(p); m.userData.age = 0; m.scale.setScalar(0.6);
  }
  smokeUpdate(dt) {
    for (const m of this.smoke) if (m.visible) {
      const a = (m.userData.age += dt); m.position.y += dt * 0.5; m.position.x += dt * 0.25; m.scale.setScalar(0.6 + a * 0.9);
      m.material.opacity = Math.max(0, 0.5 * (1 - a / 3.5)); if (a > 3.5) m.visible = false;
    }
  }

  syncPeople(dt) {
    const L = this.life, t = this.t;
    for (const [id, a] of L.actors) {
      let g = this.pm.get(id);
      if (!g) { g = makePerson(this.m, a.kind); g.scale.setScalar(1.15); this.world.add(g); this.pm.set(id, g); }
      g.visible = !a.hidden;
      g.position.set(this.wx(a.x), 0, this.wx(a.z)); g.rotation.y = a.yaw;
      const p = g.userData.parts, ph = t * 9 + a.seed;
      p.legL.rotation.set(0, 0, 0); p.legR.rotation.set(0, 0, 0); p.armL.rotation.set(0, 0, 0); p.armR.rotation.set(0, 0, 0); p.head.rotation.set(0, 0, 0);
      const eL = p.armL.userData.elbow, eR = p.armR.userData.elbow; eL.rotation.set(0, 0, 0); eR.rotation.set(0, 0, 0);
      g.position.y = 0;
      switch (a.act) {
        case 'walk': p.legL.rotation.x = Math.sin(ph) * 0.6; p.legR.rotation.x = -Math.sin(ph) * 0.6; p.armL.rotation.x = -Math.sin(ph) * 0.5; p.armR.rotation.x = Math.sin(ph) * 0.5; eL.rotation.x = eR.rotation.x = -0.35; g.position.y = Math.abs(Math.sin(ph)) * 0.015; break;
        case 'salute': p.armR.rotation.set(-1.05, 0, -0.35); eR.rotation.x = -2.1; break;
        case 'work': case 'build': p.armR.rotation.x = -1.4 + Math.sin(t * 7 + a.seed) * 0.5; eR.rotation.x = -0.9 + Math.sin(t * 7 + a.seed) * 0.4; p.armL.rotation.x = -0.6; eL.rotation.x = -0.8; break;
        case 'drill': { const k = Math.sin(t * 6 + Math.floor(a.x)); p.legL.rotation.x = Math.max(0, k) * -1.1; p.legR.rotation.x = Math.max(0, -k) * -1.1; p.armL.rotation.x = k * 0.7; p.armR.rotation.x = -k * 0.7; eL.rotation.x = eR.rotation.x = -0.4; g.position.y = Math.abs(k) * 0.02; break; }
        case 'drink': p.armR.rotation.set(-0.9, 0, -0.3); eR.rotation.x = -2.0 + Math.sin(t * 2 + a.seed) * 0.25; break;
        case 'mourn': p.head.rotation.x = 0.5; p.armL.rotation.x = -0.3; p.armR.rotation.x = -0.3; eL.rotation.x = eR.rotation.x = -1.2; break;
        case 'inspect': p.armR.rotation.x = -0.4; eR.rotation.x = -1.2; p.head.rotation.x = 0.3; p.head.rotation.y = Math.sin(t * 1.5 + a.seed) * 0.4; break;
        case 'look': p.head.rotation.x = -0.25; break;
        default: p.armL.rotation.x = Math.sin(t * 1.5 + a.seed) * 0.05;
      }
    }
    for (const [id, g] of this.pm) if (!L.actors.has(id)) { this.world.remove(g); this.pm.delete(id); }
  }

  syncVehicles(dt) {
    const L = this.life, t = this.t;
    for (const [id, f] of L.lifts) {
      let g = this.lm.get(id); if (!g) { g = makeForklift(this.m); g.scale.setScalar(1.2); this.world.add(g); this.lm.set(id, g); }
      g.position.set(this.wx(f.x), 0, this.wx(f.z)); g.rotation.y = f.yaw;
    }
    for (const [id, g] of this.lm) if (!L.lifts.has(id)) { this.world.remove(g); this.lm.delete(id); }
    while (this.cm.length < L.crates.length) { const c = makeCrate(this.m); this.world.add(c); this.cm.push(c); }
    this.cm.forEach((c, i) => { const k = L.crates[i]; c.visible = !!k; if (k) c.position.set(this.wx(k.x), k.y, this.wx(k.z)); });
    const live = new Set();
    for (const f of L.flights) {
      if (!f.mid) f.mid = Math.random();
      live.add(f.mid);
      let g = this.fm.get(f.mid); if (!g) { g = makePelican(this.m); this.world.add(g); this.fm.set(f.mid, g); }
      g.position.set(this.wx(f.x), f.y, this.wx(f.z)); g.rotation.y = f.yaw;
      g.rotation.z = f.ph === 'in' || f.ph === 'up' ? Math.sin(t * 2) * 0.03 : 0;
      for (const e of g.userData.engines) e.rotation.x = Math.PI / 2 + (f.ph === 'land' ? 0 : f.ph === 'down' ? 0.2 : 0.5);
    }
    for (const [k, g] of this.fm) if (!live.has(k)) { this.world.remove(g); this.fm.delete(k); }
    void dt;
  }
}
void wrap;
