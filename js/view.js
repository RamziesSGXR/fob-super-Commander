// The 3D view: a near-isometric camera you can rotate, the ground, the wire, every building and everyone walking about.
import * as THREE from './vendor/three.js';
import { B } from './config.js';
import { dims, wingOf } from './sim.js';
import { BIOMES } from './site.js';
import { SCRUB_COL, makeMats, mergeStatic, buildModel, makePerson, makeForklift, makeTruck, makeFRV, makeTank, makeCrate, makePelican, wrap } from './models.js';
const VMAKE = { lift: makeForklift, truck: makeTruck, frv: makeFRV, tank: makeTank };
import { Noise } from './noise.js';

const TAU = Math.PI * 2;

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    // a graphics driver can drop the 3D context (a black view under a working HUD): ask for it back and say so
    this.lost = false;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; this.onLost?.(true); });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.onLost?.(false); });
    this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFShadowMap; this.q = 0; this.qMode = 'auto'; this.qT = 0; this.qN = 0;
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);
    this.persp = new THREE.PerspectiveCamera(50, 1, 0.05, 700);   // photo mode: a free camera you can tilt down to ground level
    this.cam = this.ortho; this.photo = false; this.dist = 18; this.distT = 18; this.tilt = 0.6; this.tiltT = 0.6;
    this.yaw = Math.PI / 4; this.yawT = this.yaw; this.pitch = 0.68; this.zoom = 9; this.zoomT = 9;
    this.target = new THREE.Vector3(0, 0, 2); this.ray = new THREE.Raycaster(); this.t = 0;
    const hemi = this.hemi = new THREE.HemisphereLight('#dfe9ff', '#6b5638', 1.1); this.scene.add(hemi);
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
    this.chunks = new Map(); this.bm = new Map(); this.pm = new Map(); this.fm = new Map(); this.cm = []; this.vm = new Map(); this.smoke = []; this.roadsV = -1;
    this.ghostKey = ''; this.scrubKey = null; this.scrubM = null;
    this.buildGround();
    this.setFaction(sim.faction);
  }
  setFaction(f) {
    if (this.m) for (const t of this.m.tex) t.dispose();
    this.m = makeMats(f);
    for (const g of this.bm.values()) this.world.remove(g); this.bm.clear();
    for (const c of this.chunks?.values() || []) { this.world.remove(c.group); for (const m of c.group.children) m.geometry.dispose(); } this.chunks = new Map();
    this.pm.clear(); if (this.crowd) for (const c of Object.values(this.crowd)) for (const im of c.ims) { this.world.remove(im); im.dispose(); } this.crowd = {};
    for (const g of this.vm.values()) this.world.remove(g); this.vm.clear();
    this.ghostKey = '';
    this.faction = f; this.roadsV = -1;   // the gate sign carries the base's name
    this.thumbs = new Map(); if (this.infoMesh) { this.world.remove(this.infoMesh); this.infoMesh = null; }
    this.resG = null; this.routeG = null; this.packets = null;
  }

  // ---------------------------------------------------------------- pictures of buildings for the build menu: each type is
  // drawn once, from the game's own angle, into an image
  thumb(type, std = 2) {
    const tk = type + ':' + std; this.thumbs ||= new Map(); if (this.thumbs.has(tk)) return this.thumbs.get(tk);
    if (!this.m || this.lost) return null;
    const W = 160, H = 112;
    if (!this.th) {
      const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight('#dfe9ff', '#6b5638', 1.3));
      const sun = new THREE.DirectionalLight('#fff1d6', 2.2); sun.position.set(-6, 10, 5); sc.add(sun);
      const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
      this.th = { sc, rt, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100), px: new Uint8Array(W * H * 4), cv: Object.assign(document.createElement('canvas'), { width: W, height: H }) };
    }
    const { sc, rt, cam, px, cv } = this.th;
    const g = buildModel(type, this.m, false, std < 2 ? { std, w: B[type].w, d: B[type].d } : null); sc.add(g);
    const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2 || 1;
    const dir = new THREE.Vector3(Math.sin(Math.PI / 4), 0.82, Math.cos(Math.PI / 4)).normalize();
    cam.position.copy(c).addScaledVector(dir, 30); cam.lookAt(c);
    const a = W / H, k = r * 1.02; Object.assign(cam, { left: -k * a, right: k * a, top: k, bottom: -k }); cam.updateProjectionMatrix();
    const cc = new THREE.Color(); this.r.getClearColor(cc); const ca = this.r.getClearAlpha(), sh = this.r.shadowMap.enabled;
    this.r.shadowMap.enabled = false; this.r.setRenderTarget(rt); this.r.setClearColor(0x000000, 0); this.r.clear(); this.r.render(sc, cam);
    this.r.readRenderTargetPixels(rt, 0, 0, W, H, px); this.r.setRenderTarget(null); this.r.setClearColor(cc, ca); this.r.shadowMap.enabled = sh;
    sc.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    const x = cv.getContext('2d'), im = x.createImageData(W, H);
    for (let y = 0; y < H; y++) im.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);   // the GPU's rows run bottom-up
    x.putImageData(im, 0, 0); const url = cv.toDataURL(); this.thumbs.set(tk, url); return url;
  }

  // ---------------------------------------------------------------- info views: the base as coloured blocks, one colour per
  // building, like a city builder's data overlay. cols: Map of building id -> colour, or null to go back to the base itself
  setInfo(cols, ghost = false) {
    this.info = cols || null;
    for (const g of this.bm.values()) g.visible = !this.info;
    for (const c of this.chunks?.values() || []) c.group.visible = !this.info;
    if (!this.info) { if (this.infoMesh) this.infoMesh.visible = false; return; }
    const n = cols.size;
    if (!this.infoMesh || this.infoMesh.userData.cap < n) {
      if (this.infoMesh) { this.world.remove(this.infoMesh); this.infoMesh.dispose(); }
      const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
      this.infoMesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true }), Math.max(64, n * 2));
      this.infoMesh.userData.cap = Math.max(64, n * 2); this.infoMesh.castShadow = true; this.infoMesh.receiveShadow = true; this.infoMesh.frustumCulled = false;
      this.world.add(this.infoMesh);
    }
    const im = this.infoMesh, o = new THREE.Object3D(), col = new THREE.Color(); let i = 0;
    for (const [id, c] of cols) {
      const b = this.sim.byId(id), g = this.bm.get(id); if (!b) continue;
      o.position.set(this.wx(b.x + b.w / 2), 0, this.wx(b.z + b.d / 2)); o.scale.set(Math.max(0.3, b.w - 0.12), Math.max(0.25, (g?.userData.top || 0.8) * (b.done ? 1 : b.prog)), Math.max(0.3, b.d - 0.12)); o.updateMatrix();
      im.setMatrixAt(i, o.matrix); im.setColorAt(i, col.set(c)); i++;
    }
    im.count = i; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.visible = true;
    im.material.opacity = ghost ? 0.22 : 1; im.material.depthWrite = !ghost; im.castShadow = !ghost;
    this.r.shadowMap.needsUpdate = true;
  }
  // the RESOURCES view: E-710 seeps (violet), ore (rust), water and rock marked on the ground, crystals showing
  showResources(on) {
    if (on && !this.resG) {
      const N = this.N, T = this.sim.terr, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), im = g.createImageData(N, N);
      for (let i = 0; i < N * N; i++) { const t = T ? T[i] : 0, col = t === 3 ? [170, 80, 255, 200] : t === 4 ? [230, 120, 60, 200] : t === 1 ? [70, 150, 255, 90] : t === 2 ? [40, 40, 44, 120] : [0, 0, 0, 0]; im.data.set(col, i * 4); }
      g.putImageData(im, 0, 0);
      const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
      this.resG = new THREE.Mesh(new THREE.PlaneGeometry(N, N), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      this.resG.rotation.x = -Math.PI / 2; this.resG.position.y = 0.05; this.resG.renderOrder = 2; this.world.add(this.resG);
    }
    if (this.resG) this.resG.visible = !!on;
    if (this.crystals) this.crystals.visible = !!on;
  }
  // the SUPPLY ROUTES view: an arc for every route goods take, in the good's colour, with packets running along it.
  // routes: [{ a: [x, z], b: [x, z], col, live }]; live ones (a vehicle on it now) are brighter and quicker
  setRoutes(routes) {
    if (this.routeG) { this.world.remove(this.routeG); this.routeG.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); this.routeG = null; }
    if (!routes || !routes.length) return;
    const G = this.routeG = new THREE.Group(), pk = []; this.world.add(G);
    for (const r of routes) {
      const a = new THREE.Vector3(this.wx(r.a[0]), 0.4, this.wx(r.a[1])), b = new THREE.Vector3(this.wx(r.b[0]), 0.4, this.wx(r.b[1])), d = a.distanceTo(b);
      const mid = a.clone().add(b).multiplyScalar(0.5); mid.y = 0.6 + d * 0.25;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b), pts = curve.getPoints(24);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: r.col, transparent: true, opacity: r.live ? 0.95 : 0.5 }));
      line.renderOrder = 3; G.add(line);
      const n = Math.max(1, Math.round(d / 4)); for (let i = 0; i < n; i++) pk.push({ curve, t: i / n, sp: (r.live ? 0.5 : 0.22) * 6 / Math.max(6, d), col: r.col });
    }
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), pk.length), col = new THREE.Color();
    pk.forEach((p, i) => im.setColorAt(i, col.set(p.col))); im.frustumCulled = false; G.add(im);
    this.packets = { im, pk };
  }
  routeTick(dt) {
    const P = this.packets; if (!P || !this.routeG) return;
    const o = new THREE.Object3D();
    P.pk.forEach((p, i) => { p.t = (p.t + p.sp * dt) % 1; o.position.copy(p.curve.getPoint(p.t)); o.updateMatrix(); P.im.setMatrixAt(i, o.matrix); });
    P.im.instanceMatrix.needsUpdate = true;
  }
  // where the edges of the screen meet the ground, in tiles: the camera's footprint, for the minimap
  footprint() {
    const out = [], p = new THREE.Vector3(), pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { this.ray.setFromCamera(new THREE.Vector2(x, y), this.cam); if (this.ray.ray.intersectPlane(pl, p)) out.push([p.x + this.N / 2, p.z + this.N / 2]); }
    return out;
  }
  wx(x) { return x - this.N / 2; }

  buildGround() {
    this.crystals = null;
    const N = this.N, s = this.sim, nz = new Noise(s.seed + 3), P = 16, c = document.createElement('canvas');
    c.width = c.height = N * P; const g = c.getContext('2d'), img = g.createImageData(N * P, N * P), d = img.data;
    const bio = s.site ? BIOMES[s.site.biome] : null, hue = bio ? bio.ground : [[156, 128, 92], [142, 112, 84], [120, 118, 98], [164, 120, 84]][s.seed % 4], T = s.terr, H = s.hgt;
    for (let y = 0; y < N * P; y++) for (let x = 0; x < N * P; x++) {
      const tx = Math.floor(x / P), tz = Math.floor(y / P), n = nz.fbm(x / 40, y / 40, 4), f = nz.v(x / 3, y / 3);
      let r = hue[0] * (0.8 + n * 0.4) + f * 10, gg = hue[1] * (0.8 + n * 0.4) + f * 8, b = hue[2] * (0.8 + n * 0.4) + f * 6;
      const tk = T ? T[tz * N + tx] : 0;
      if (tk === 1) { const c = bio.sea; r = c[0] * 0.7 + f * 6; gg = c[1] * 0.7 + f * 6; b = c[2] * 0.7 + f * 6; }   // the bed under the water
      else if (tk === 2) { r *= 0.62; gg *= 0.62; b *= 0.64; }
      else if (tk === 3) { r *= 0.86; gg *= 0.84; b *= 0.88; }   // E-710 seeps and ore look like ground here: the RESOURCES view shows them
      else if (tk === 4) { r *= 0.92; gg *= 0.88; b *= 0.84; }
      else if (T && H) { const sh = Math.min(1, Math.max(0, (H[tz * N + tx] - bio.water) / (bio.rock - bio.water))); r *= 0.9 + sh * 0.18; gg *= 0.9 + sh * 0.18; b *= 0.9 + sh * 0.18; }
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
    const sky = new THREE.Color(hue[0] / 255 * 0.35 + 0.36, hue[1] / 255 * 0.35 + 0.43, hue[2] / 255 * 0.35 + 0.56);   // a pale blue haze, warmed by the planet's dust
    this.skyDay = sky.clone(); this.skyNight = new THREE.Color('#0a0f1e'); this.scene.background = sky.clone(); this.scene.fog = new THREE.Fog(sky.clone(), 140, 300);
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
    // the site's own water and rock
    if (T) {
      const wt = [], rk = [], dp = [];
      for (let i = 0; i < N * N; i++) { if (T[i] === 1) wt.push(i); else if (T[i] === 2) rk.push(i); else if (T[i] === 3 && nz.v(i * 0.37, 5) > 0.72) dp.push(i); }
      if (wt.length) {
        const wm = new THREE.MeshStandardMaterial({ color: new THREE.Color(...bio.sea.map(c => c / 255)), roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.86 });
        const wg = new THREE.PlaneGeometry(1.02, 1.02); wg.rotateX(-Math.PI / 2);
        const wi = new THREE.InstancedMesh(wg, wm, wt.length); wt.forEach((i, k) => { mx.makeTranslation(this.wx(i % N + 0.5), 0.03, this.wx(((i / N) | 0) + 0.5)); wi.setMatrixAt(k, mx); });
        wi.receiveShadow = true; this.world.add(wi); this.waterMat = wm;
      }
      if (rk.length) {   // each rock tile gets a boulder, taller the higher the ground
        const ri = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.75, 0), rock, rk.length);
        rk.forEach((i, k) => {
          const x = i % N, z = (i / N) | 0, h = Math.min(2.6, 0.5 + (H[i] - bio.rock) * 28), j = nz.v(x * 1.3, z * 1.3);
          q.setFromEuler(new THREE.Euler(j * 2, j * 5, j)); mx.compose(new THREE.Vector3(this.wx(x + 0.5), h * 0.4, this.wx(z + 0.5)), q, new THREE.Vector3(0.9 + j * 0.3, h, 0.9 + j * 0.3)); ri.setMatrixAt(k, mx);
        });
        ri.castShadow = ri.receiveShadow = true; this.world.add(ri);
      }
      if (dp.length) {   // violet crystals poking out of the seeps
        const cm = new THREE.MeshStandardMaterial({ color: '#2a1838', emissive: '#7a3cff', emissiveIntensity: 0.5, roughness: 0.2 });
        const ci = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.12), cm, dp.length);
        dp.forEach((i, k) => { const j = nz.v(i * 0.7, 9); q.setFromEuler(new THREE.Euler(j, j * 3, 0)); mx.compose(new THREE.Vector3(this.wx(i % N + 0.2 + j * 0.6), 0.08, this.wx(((i / N) | 0) + 0.3 + j * 0.4)), q, new THREE.Vector3(1, 1.8, 1)); ci.setMatrixAt(k, mx); });
        ci.visible = false; this.world.add(ci); this.crystals = ci;
      }
    }
    // rock spires on the skyline, fading into the haze
    const sg = new THREE.ConeGeometry(1, 1, 5), spires = new THREE.InstancedMesh(sg, rock, 70);
    for (let i = 0; i < 70; i++) {
      const a = nz.v(i * 2.3, 11) * TAU * 2, r = N / 2 + 14 + nz.v(11, i * 1.9) * 70, h = 4 + nz.v(i, i * 0.7) * 14, w = 1.2 + nz.v(i * 0.3, 4) * 2.6;
      q.setFromEuler(new THREE.Euler((nz.v(i, 1) - 0.5) * 0.25, a, (nz.v(1, i) - 0.5) * 0.25)); mx.compose(new THREE.Vector3(Math.cos(a) * r, h / 2 - 0.3, Math.sin(a) * r), q, new THREE.Vector3(w, h, w)); spires.setMatrixAt(i, mx);
    }
    spires.castShadow = true; this.world.add(spires);
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * TAU + nz.v(i, 9), r = 95 + nz.v(9, i) * 50, h = 10 + nz.v(i * 3, 2) * 22;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(h * 1.6, h, 6), rock); hill.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r); hill.rotation.y = a; this.world.add(hill);
    }
    this.hes = new THREE.MeshStandardMaterial({ color: '#8c8f88', roughness: 0.9 }); this.hesTop = new THREE.MeshStandardMaterial({ color: '#41464a', roughness: 0.8 });   // concrete perimeter wall, dark cap and buttresses
    const hes = this.hes, mx2 = mx; void mx2;
    const wood = new THREE.MeshStandardMaterial({ color: '#5a5650', roughness: 0.9 }), roof = new THREE.MeshStandardMaterial({ color: '#3f4440', roughness: 0.8 });
    this.tower = (x, z) => {
      const t = new THREE.Group(); t.position.set(this.wx(x + 0.5), 0, this.wx(z + 0.5));
      for (const [a, b] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), wood); l.position.set(a, 1.1, b); l.castShadow = true; t.add(l); }
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.1), hes); cab.position.y = 2.3; cab.castShadow = true; t.add(cab);
      const rf = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.4, 4), roof); rf.position.y = 2.9; rf.rotation.y = Math.PI / 4; rf.castShadow = true; t.add(rf);
      return t;
    };
    // grid shown while building
    this.grid = new THREE.GridHelper(N - 2, N - 2, '#9dffb8', '#9dffb8'); this.grid.material.transparent = true; this.grid.material.opacity = 0.16; this.grid.position.y = 0.02; this.grid.visible = false; this.world.add(this.grid);
    // selection and range markers
    this.sel = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#ffe600' }));
    this.sel.visible = false; this.world.add(this.sel);
    this.range = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: '#ff4a4a', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    this.range.rotation.x = -Math.PI / 2; this.range.position.y = 0.05; this.range.visible = false; this.world.add(this.range);
    this.foot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#59ff8a', transparent: true, opacity: 0.25, depthWrite: false }));
    this.foot.rotation.x = -Math.PI / 2; this.foot.position.y = 0.04; this.foot.visible = false; this.world.add(this.foot);
    this.smokeMat = []; this.smokeGeo = new THREE.SphereGeometry(0.12, 8, 6);
    this.roadMats = { 1: new THREE.MeshStandardMaterial({ color: '#7a6346', roughness: 1 }), 2: new THREE.MeshStandardMaterial({ color: '#3e3f3c', roughness: 0.9 }) };
    this.roadG = new THREE.Group(); this.world.add(this.roadG);
    this.roadGhost = new THREE.Group(); this.world.add(this.roadGhost);
    this.ghostTile = new THREE.MeshBasicMaterial({ color: '#59ff8a', transparent: true, opacity: 0.4, depthWrite: false });
    this.plazaG = new THREE.Group(); this.plazaG.visible = false; this.world.add(this.plazaG);
    this.plotG = new THREE.Group(); this.world.add(this.plotG);
    this.plazaMat = new THREE.MeshBasicMaterial({ color: '#ffe600', transparent: true, opacity: 0.22, depthWrite: false });
  }
  // the sign over the main gate, in the faction's colours
  gateSign(f) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d');
    x.fillStyle = '#1a1d1a'; x.fillRect(0, 0, 512, 96); x.fillStyle = f.secondary; x.fillRect(0, 0, 512, 6); x.fillRect(0, 90, 512, 6);
    x.fillStyle = '#ffffff'; x.font = 'bold 40px ui-monospace, Menlo, Consolas, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(f.base.toUpperCase().slice(0, 22), 256, 48);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 0.1), [this.m.dark, this.m.dark, this.m.dark, this.m.dark, new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#fff', emissiveIntensity: 0.4 }), new THREE.MeshStandardMaterial({ map: t })]);
  }

  syncRoads() {
    const s = this.sim; if (s.roadsV === this.roadsV) return; this.roadsV = s.roadsV;
    this.roadG.clear(); this.booms = [];
    const net = s.net, N = this.N, nd = id => net.nodes.find(n => n.id === id), surf = new THREE.Group();
    const strip = (g, a, b, w, y, mat, ext = 0) => {   // a flat strip from a to b, w wide
      const L = Math.hypot(b.x - a.x, b.z - a.z) + ext, geo = new THREE.PlaneGeometry(L, w); geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, mat); m.position.set(this.wx((a.x + b.x) / 2), y, this.wx((a.z + b.z) / 2)); m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x); m.receiveShadow = true; g.add(m); return m;
    };
    const dash = this.dashMat ||= new THREE.MeshBasicMaterial({ color: '#d8c35a' });
    for (const sg of net.segs) {
      if (sg.k === 'wall') continue;
      const a = nd(sg.a), b = nd(sg.b), surfK = sg.k === 'paved' ? 2 : 1, y = 0.012 + surfK * 0.002;
      strip(surf, a, b, sg.w, y, this.roadMats[surfK]);
      for (const n of [a, b]) { const c = new THREE.Mesh(new THREE.CircleGeometry(sg.w / 2, 16), this.roadMats[surfK]); c.rotation.x = -Math.PI / 2; c.position.set(this.wx(n.x), y - 0.001, this.wx(n.z)); c.receiveShadow = true; surf.add(c); }
      if (sg.k === 'paved' && sg.w >= 2) {   // a dashed centre line
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        for (let t = 0.6; t < L - 0.6; t += 0.9) { const p = { x: a.x + (b.x - a.x) * t / L, z: a.z + (b.z - a.z) * t / L }, q = { x: a.x + (b.x - a.x) * (t + 0.35) / L, z: a.z + (b.z - a.z) * (t + 0.35) / L }; strip(surf, p, q, 0.06, 0.02, dash); }
      }
    }
    mergeStatic(surf); this.roadG.add(surf);
    // walls: HESCO lines with gaps where roads run through, posts at the joints, towers on the corners
    const wallG = new THREE.Group(), gateAt = (x, z) => { const tx = Math.floor(x), tz = Math.floor(z); return tx >= 0 && tz >= 0 && tx < N && tz < N && s.walls[tz * N + tx] === 2; };
    const turns = new Map();
    for (const sg of net.segs) {
      if (sg.k !== 'wall') continue;
      const a = nd(sg.a), b = nd(sg.b), L = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(L / 0.25));
      for (const n of [a, b]) { const t = turns.get(n.id) || []; t.push(Math.atan2((n === a ? b : a).z - n.z, (n === a ? b : a).x - n.x)); turns.set(n.id, t); }
      let run = null;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, open = gateAt(x, z);
        if (!open && !run) run = { x, z };
        if ((open || i === steps) && run) { const e = open ? { x: a.x + (b.x - a.x) * (i - 1) / steps, z: a.z + (b.z - a.z) * (i - 1) / steps } : { x, z }; if (Math.hypot(e.x - run.x, e.z - run.z) > 0.1 || i === steps) this.wallPiece(wallG, run, e); run = null; }
      }
    }
    mergeStatic(wallG); this.roadG.add(wallG);
    for (const [id, angs] of turns) {
      const n = nd(id), bent = angs.length !== 2 || Math.abs(Math.cos(angs[0] - angs[1]) + 1) > 0.1;
      if (bent && !gateAt(n.x, n.z)) { const t = this.tower(n.x - 0.5, n.z - 0.5); this.roadG.add(t); }
    }
    // gates: a boom barrier across the road and a guard hut beside it; the main gate gets the base's sign
    const main = s.gate();
    for (const gt of s.gates || []) {
      const w = net.segs.filter(q => q.k === 'wall').map(q => { const a = nd(q.a), b = nd(q.b); return { q, a, b, d: Math.abs((b.x - a.x) * (a.z - gt.z) - (a.x - gt.x) * (b.z - a.z)) / Math.hypot(b.x - a.x, b.z - a.z) }; }).sort((p, q) => p.d - q.d)[0];
      const ang = w ? Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x) : 0, half = Math.sqrt(gt.tiles.length) / 2 + 0.5;
      const g = new THREE.Group(); g.position.set(this.wx(gt.x), 0, this.wx(gt.z)); g.rotation.y = -ang; this.roadG.add(g);
      for (const sx of [-half, half]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.4, 0.35), this.m.concrete); p.position.set(sx, 0.7, 0); p.castShadow = true; g.add(p); }
      const boom = new THREE.Group(); boom.position.set(-half + 0.2, 0.75, 0.25); g.add(boom);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(half * 2 - 0.4, 0.07, 0.07), this.m.hazard); arm.position.x = half - 0.2; boom.add(arm);
      for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.075, 0.075), this.m.red); r.position.x = 0.3 + i * (half * 2 - 0.6) / 4; boom.add(r); }
      g.userData.boom = boom;
      const hut = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.7), this.m.wall); hut.position.set(half + 0.75, 0.4, -0.9); hut.castShadow = true; g.add(hut);
      const hr = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.85), this.m.prim); hr.position.set(half + 0.75, 0.84, -0.9); g.add(hr);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.02), this.m.window); win.position.set(half + 0.75, 0.55, -0.54); g.add(win);
      if (Math.abs(gt.x - main.gx) < 0.01 && Math.abs(gt.z - main.gz) < 0.01 && this.faction) {
        const sign = this.gateSign(this.faction); sign.position.set(0, 2.5, 0); g.add(sign);
        for (const sx of [-half, half]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), this.m.dark); p.position.set(sx, 1.9, 0); g.add(p); }
      }
      boom.userData.gx = gt.x; boom.userData.gz = gt.z; boom.userData.r = half + 1.2; (this.booms ||= []).push(boom);
    }
    this.charterLine();
    this.streetLamps();
  }
  charterLine() {
    const [lo, hi] = this.sim.box(); if (hi - lo >= this.N) return;
    const mat = this.charterMat ||= new THREE.MeshBasicMaterial({ color: '#f5d547', transparent: true, opacity: 0.55 });
    const geo = new THREE.PlaneGeometry(0.6, 0.08); geo.rotateX(-Math.PI / 2); const pts = [];
    for (let t = lo; t < hi; t += 1) pts.push([t + 0.3, lo, 0], [t + 0.3, hi, 0], [lo, t + 0.3, 1], [hi, t + 0.3, 1]);
    const im = new THREE.InstancedMesh(geo, mat, pts.length), mx = new THREE.Matrix4(), q = new THREE.Quaternion(), qr = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), one = new THREE.Vector3(1, 1, 1);
    pts.forEach(([x, z, r], k) => { mx.compose(new THREE.Vector3(this.wx(x), 0.04, this.wx(z)), r ? qr : q, one); im.setMatrixAt(k, mx); });
    this.roadG.add(im);
  }
  wallPiece(g, a, b) {
    const L = Math.hypot(b.x - a.x, b.z - a.z) + 0.9, ang = -Math.atan2(b.z - a.z, b.x - a.x), mx = this.wx((a.x + b.x) / 2), mz = this.wx((a.z + b.z) / 2);
    const body = new THREE.Mesh(new THREE.BoxGeometry(L, 1.05, 0.5), this.hes); body.position.set(mx, 0.525, mz); body.rotation.y = ang; body.castShadow = body.receiveShadow = true; g.add(body);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(L, 0.22, 0.8), this.hesTop); foot.position.set(mx, 0.11, mz); foot.rotation.y = ang; foot.receiveShadow = true; g.add(foot);
    const top = new THREE.Mesh(new THREE.BoxGeometry(L, 0.1, 0.62), this.hesTop); top.position.set(mx, 1.1, mz); top.rotation.y = ang; g.add(top);
    // the seams between the baskets
    for (let t = 0.5; t < L - 0.4; t += 1) { const f = (t - L / 2) / L, x = (a.x + b.x) / 2 + (b.x - a.x) * f, z = (a.z + b.z) / 2 + (b.z - a.z) * f; if (Math.round(t) % 2) continue; const sm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.12, 0.74), this.hesTop); sm.castShadow = true; sm.position.set(this.wx(x), 0.56, this.wx(z)); sm.rotation.y = ang; g.add(sm); }
  }
  // street lamps along the roadside every few tiles; their heads and the pools under them light up at night
  streetLamps() {
    const s = this.sim, N = this.N, spots = [], net = s.net, nd = id => net.nodes.find(n => n.id === id);
    const free = (x, z) => { const tx = Math.floor(x), tz = Math.floor(z); return tx >= 0 && tz >= 0 && tx < N && tz < N && !s.roads[tz * N + tx] && !s.occ[tz * N + tx] && !s.walls[tz * N + tx]; };
    for (const sg of net.segs) {
      if (sg.k === 'wall') continue;
      const a = nd(sg.a), b = nd(sg.b), L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 1) continue;
      const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L, off = sg.w / 2 + 0.3;
      for (let t = 1.5, k = 0; t < L - 0.5; t += 3.2, k++) {
        const sd = k % 2 ? 1 : -1, x = a.x + ux * t - uz * off * sd, z = a.z + uz * t + ux * off * sd;
        if (free(x, z)) spots.push([x, z, a.x + ux * t, a.z + uz * t]);
      }
    }
    if (!this.lampHead) {
      this.lampHead = new THREE.MeshStandardMaterial({ color: '#2a2618', emissive: '#ffd890', emissiveIntensity: 0.1 });
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      this.lampPool = new THREE.MeshBasicMaterial({ color: '#ffcf7a', map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    }
    // a warm pool of light at every finished building's door, too
    const doors = s.b.filter(b => b.done && !B[b.type].pad && b.w * b.d > 1).map(b => { const [x, z] = s.door(b); return [x + 0.5, z + 0.5]; });
    if (doors.length) {
      const dp = new THREE.InstancedMesh(new THREE.CircleGeometry(1.0, 16), this.lampPool, doors.length), dm = new THREE.Matrix4(), fq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
      doors.forEach(([x, z], k) => { dm.compose(new THREE.Vector3(this.wx(x), 0.031, this.wx(z)), fq, new THREE.Vector3(1, 1, 1)); dp.setMatrixAt(k, dm); });
      dp.renderOrder = 2; dp.frustumCulled = false; this.roadG.add(dp);
    }
    if (!spots.length) return;
    const mx = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), q0 = new THREE.Quaternion(), flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.035, 1.2, 6), this.m.steel, spots.length);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.05, 0.1), this.lampHead, spots.length);
    const pool = new THREE.InstancedMesh(new THREE.CircleGeometry(1.3, 18), this.lampPool, spots.length);
    spots.forEach(([x, z, rx, rz], k) => {
      mx.compose(new THREE.Vector3(this.wx(x), 0.6, this.wx(z)), q0, one); pole.setMatrixAt(k, mx);
      mx.compose(new THREE.Vector3(this.wx(x + (rx - x) * 0.4), 1.2, this.wx(z + (rz - z) * 0.4)), q0, one); head.setMatrixAt(k, mx);
      mx.compose(new THREE.Vector3(this.wx(rx), 0.03, this.wx(rz)), flat, one); pool.setMatrixAt(k, mx);
    });
    pole.castShadow = true; pool.renderOrder = 2; pole.frustumCulled = head.frustumCulled = pool.frustumCulled = false;
    this.roadG.add(pole, head, pool);
  }
  // tiles a road tool is about to lay (green) or clear (red)
  showRoadGhost() { this.roadGhost.clear(); }
  // the roadside plots, like zoning cells: brightest next to the road
  showPlots(tiles) {
    this.plotG.clear(); if (!tiles || !tiles.length) return;
    const mats = [0.3, 0.22, 0.15, 0.09].map(o => new THREE.MeshBasicMaterial({ color: '#59ff8a', transparent: true, opacity: o, depthWrite: false }));
    const geo = new THREE.PlaneGeometry(0.86, 0.86); geo.rotateX(-Math.PI / 2);
    for (let k = 1; k <= 4; k++) {
      const t = tiles.filter(q => q[2] === k); if (!t.length) continue;
      const im = new THREE.InstancedMesh(geo, mats[k - 1], t.length), mx = new THREE.Matrix4();
      t.forEach(([x, z], i) => { mx.makeTranslation(this.wx(x + 0.5), 0.025, this.wx(z + 0.5)); im.setMatrixAt(i, mx); });
      im.frustumCulled = false; this.plotG.add(im);
    }
  }
  // a line being drawn: a see-through strip, green if it can go there; w: its width
  showLine(a, b, w, ok, wall) {
    this.roadGhost.clear(); if (!a || !b) return;
    this.ghostTile.color.set(ok ? (wall ? '#ffe600' : '#59ff8a') : '#ff4a4a');
    const L = Math.max(0.2, Math.hypot(b.x - a.x, b.z - a.z)), geo = new THREE.PlaneGeometry(L + w, w); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, this.ghostTile); m.position.set(this.wx((a.x + b.x) / 2), wall ? 0.5 : 0.04, this.wx((a.z + b.z) / 2)); m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x); this.roadGhost.add(m);
    for (const p of [a, b]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.18, 12), this.ghostTile); d.rotation.x = -Math.PI / 2; d.position.set(this.wx(p.x), 0.06, this.wx(p.z)); this.roadGhost.add(d); }
    this.grid.visible = true;
  }

  // the open ground the troops gather on, shown while the flag is selected or being moved
  showPlaza(tiles, ok = true) {
    this.plazaG.clear(); this.plazaG.visible = !!tiles;
    if (!tiles) return;
    this.plazaMat.color.set(ok ? '#ffe600' : '#ff4a4a');
    const geo = new THREE.PlaneGeometry(0.92, 0.92);
    for (const [x, z] of tiles) { const p = new THREE.Mesh(geo, this.plazaMat); p.rotation.x = -Math.PI / 2; p.position.set(this.wx(x + 0.5), 0.035, this.wx(z + 0.5)); this.plazaG.add(p); }
  }

  // ---------------------------------------------------------------- day and night
  setTime(h) {
    const ramp = (a, b, v) => Math.max(0, Math.min(1, (v - a) / (b - a)));
    const d = ramp(4.5, 7, h) * (1 - ramp(18, 20.5, h)), warm = 1 - Math.min(1, Math.abs(h - 12.5) / 6.5);
    this.dayLight = d;
    const ang = (h - 12.5) / 12 * Math.PI;
    this.sun.position.set(this.target.x - Math.sin(ang) * 26, 8 + 26 * Math.max(0.15, Math.cos(ang * 0.8)), this.target.z + 12);
    this.sun.intensity = 0.45 + 1.95 * d;   // at night this is moonlight: weaker and blue
    this.sun.color.setRGB(0.55 + 0.45 * d, 0.62 + 0.33 * warm * d + 0.08 * (1 - d), 0.85 * (1 - d) + (0.42 + 0.42 * warm) * d);
    this.hemi.intensity = 0.75 + 0.4 * d;
    this.hemi.color.setRGB(0.32 + 0.55 * d, 0.38 + 0.53 * d, 0.6 + 0.4 * d);
    this.scene.background.copy(this.skyNight).lerp(this.skyDay, d); this.scene.fog.color.copy(this.scene.background);
    if (this.lampHead) { this.lampHead.emissiveIntensity = 0.1 + (1 - d) * 2.4; this.lampPool.opacity = (1 - d) * 0.75; }
    if (this.m) { this.m.floodPool.opacity = Math.max(0, 0.75 - d * 1.2); this.m.window.emissiveIntensity = 0.25 + (1 - d) * 1.6; this.m.glowY.emissiveIntensity = 1.4 + (1 - d) * 1.2; this.m.colaFace.emissiveIntensity = 0.55 + (1 - d) * 0.8; }
  }

  // ---------------------------------------------------------------- the camera
  camUpdate(dt) {
    this.yaw += (this.yawT - this.yaw) * Math.min(1, dt * 8);
    this.zoom += (this.zoomT - this.zoom) * Math.min(1, dt * 10);
    const h = this.N / 2 + 6; this.target.x = Math.max(-h, Math.min(h, this.target.x)); this.target.z = Math.max(-h, Math.min(h + 8, this.target.z));
    if (this.photo) {
      this.dist += (this.distT - this.dist) * Math.min(1, dt * 8); this.tilt += (this.tiltT - this.tilt) * Math.min(1, dt * 8);
      const c = this.persp, cp = Math.cos(this.tilt), d = this.dist;
      c.aspect = this.aspect; c.updateProjectionMatrix();
      const look = this.target.clone(); look.y = Math.min(1.2, d * 0.04);
      c.position.set(look.x + Math.sin(this.yaw) * cp * d, look.y + Math.sin(this.tilt) * d, look.z + Math.cos(this.yaw) * cp * d);
      c.lookAt(look); this.sun.target.position.copy(this.target); this.scene.fog.near = d * 0.5 + 12; this.scene.fog.far = d + 170; return;
    }
    const c = this.cam, z = this.zoom;
    const off = (this.shift || 0) * z * this.aspect;   // the title screen pushes the base to the right of the card
    c.left = -z * this.aspect + off; c.right = z * this.aspect + off; c.top = z; c.bottom = -z; c.updateProjectionMatrix();
    const d = 160, cp = Math.cos(this.pitch);
    c.position.set(this.target.x + Math.sin(this.yaw) * cp * d, Math.sin(this.pitch) * d, this.target.z + Math.cos(this.yaw) * cp * d);
    c.lookAt(this.target); this.scene.fog.near = d - 34; this.scene.fog.far = d + 150;
    this.sun.target.position.copy(this.target);
  }
  rotate(steps) { this.yawT += steps * Math.PI / 4; }
  // photo mode: a perspective camera that orbits, tilts from overhead down to eye level, and closes in
  setPhoto(on) {
    this.photo = on; this.cam = on ? this.persp : this.ortho;
    if (on) { this.distT = this.dist = this.zoom * 1.6; this.tiltT = this.tilt = this.pitch; }
  }
  tiltBy(d) { this.tiltT = Math.max(0.03, Math.min(1.5, this.tiltT + d)); }
  dolly(f) { this.distT = Math.max(1.2, Math.min(90, this.distT * f)); }
  spin(dx) { this.yawT += dx; this.yaw = this.yawT; }
  zoomBy(f) { this.zoomT = Math.max(4, Math.min(30, this.zoomT * f)); }
  pan(dxPx, dyPx) {   // drag the ground under the pointer
    const k = this.photo ? this.dist * 1.1 / this.h : this.zoom * 2 / this.h, s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const ax = -dxPx * k, az = -dyPx * k / Math.sin(this.photo ? Math.max(0.35, this.tilt) : this.pitch);
    this.target.x += ax * c + az * -s; this.target.z += ax * -s + az * -c;
  }
  move(fx, fz, dt) { const k = (this.photo ? this.dist * 0.7 : this.zoom * 1.2) * dt, s = Math.sin(this.yaw), c = Math.cos(this.yaw); this.target.x += (fx * c - fz * s) * k; this.target.z += (-fx * s - fz * c) * k; }
  lookAt(tx, tz) { this.target.set(this.wx(tx), 0, this.wx(tz)); }

  // where the pointer is: the tile under it and the building it's over
  // a point on the base, on screen: [x, y] in page pixels, or null if behind the camera or off screen
  toScreen(x, z, y = 0) {
    const v = new THREE.Vector3(this.wx(x), y, this.wx(z)).project(this.cam);
    if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return null;
    const r = this.canvas.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
  }
  // where the ear is: the tile the camera looks at, how high the camera is, and the screen's right on the ground
  ear() {
    const h = this.photo ? Math.max(1.2, this.dist * Math.sin(this.tilt) + 0.6) : this.zoom * 0.8;
    const e = this.cam.matrixWorld.elements, l = Math.hypot(e[0], e[2]) || 1;
    return [this.target.x + this.N / 2, this.target.z + this.N / 2, h, e[0] / l, e[2] / l];
  }
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
  setGhost(type, x, z, rot, ok, spec = null) {
    if (!type) { if (this.ghostG) this.ghostG.visible = false; this.foot.visible = false; this.range.visible = false; this.grid.visible = false; return; }
    const key = type + rot + JSON.stringify(spec);
    if (key !== this.ghostKey) {
      if (this.ghostG) this.world.remove(this.ghostG);
      this.ghostG = buildModel(type, this.m, false, spec && { ...spec, wing: spec.wing ?? (dims(type, 0, spec.design)[0] - B[type].w) / 2 }); this.ghostKey = key;
      this.ghostMat = new THREE.MeshStandardMaterial({ color: '#59ff8a', transparent: true, opacity: 0.55, depthWrite: false });
      this.ghostG.traverse(o => { if (o.isMesh) { o.material = this.ghostMat; o.castShadow = false; } });
      this.ghostG.rotation.y = rot * Math.PI / 2; this.world.add(this.ghostG);
    }
    const [w, d] = dims(type, rot, spec?.design);
    this.ghostG.visible = true; this.ghostG.position.set(this.wx(x + w / 2), 0, this.wx(z + d / 2));
    this.ghostMat.color.set(ok ? '#59ff8a' : '#ff4a4a');
    this.foot.visible = true; this.foot.scale.set(w, d, 1); this.foot.position.set(this.wx(x + w / 2), 0.04, this.wx(z + d / 2)); this.foot.material.color.set(ok ? '#59ff8a' : '#ff4a4a');
    this.grid.visible = true;
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
    this.syncRoads();
    this.syncBuildings(dt);
    this.syncScrub();
    this.syncPeople(dt);
    this.syncVehicles(dt);
    this.smokeUpdate(dt); this.routeTick(dt);
    // the boom barriers lift for anything on wheels and drop behind it
    for (const bm of this.booms || []) {
      const u = bm.userData, up = s.veh.some(v => !v.away && Math.hypot(v.x - u.gx, v.z - u.gz) < u.r);
      if (up !== !!u.up) { u.up = up; this.onBoom?.(u.gx, u.gz, up); }
      bm.rotation.z += ((up ? 1.35 : 0) - bm.rotation.z) * Math.min(1, dt * 4);
    }
    if (this.sel.visible) this.sel.material.color.setHSL(0.15, 1, 0.5 + 0.2 * Math.sin(t * 6));
    // shadows are redrawn every frame only at the top graphics level; lower levels redraw them every few frames
    const every = [1, 3, 6, 0][this.q];
    this.fr = (this.fr || 0) + 1;
    if (every > 1 && this.fr % every === 0) this.r.shadowMap.needsUpdate = true;
    this.r.render(this.scene, this.cam);
    this.autoQuality();
    void s;
  }
  // graphics level: 0 full, 1 lighter shadows, 2 lower resolution, 3 no shadows. 'auto' steps down when frames run slow
  setQuality(mode) {
    this.qMode = mode; this.qT = 0; this.qN = 0;
    this.applyQ(mode === 'auto' ? (this.q ?? 0) : mode === 'high' ? 0 : mode === 'low' ? 3 : 1);
  }
  applyQ(q) {
    const was = this.q; this.q = q;
    const dpr = window.devicePixelRatio || 1;
    this.r.setPixelRatio([Math.min(2, dpr), Math.min(1.5, dpr), Math.min(1, dpr), Math.min(1, dpr) * 0.75][q]);
    this.r.shadowMap.autoUpdate = q === 0; this.r.shadowMap.needsUpdate = true;
    if ((q === 3) !== (was === 3)) { this.r.shadowMap.enabled = q !== 3; this.sun.castShadow = q !== 3; this.scene.traverse(o => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; }); }
    this.resize(); this.onQuality?.(q);
  }
  autoQuality() {
    const now = performance.now(), d = now - (this.qLast || now); this.qLast = now;
    if (this.qMode !== 'auto' || d > 500 || document.hidden) return;   // a long gap is a tab switch, not a slow frame
    this.qT += d; this.qN++;
    if (this.qT < 2500) return;
    const avg = this.qT / this.qN; this.qT = 0; this.qN = 0;
    if (avg > 30 && this.q < 3) this.applyQ(this.q + 1);   // under about 33 frames a second: ease off
  }

  syncBuildings(dt) {
    const s = this.sim, t = this.t;
    for (const b of s.b) {
      let g = this.bm.get(b.id);
      const key = `${b.std ?? ''}:${b.design || 0}:${(b.parts || []).join()}:${b.w}x${b.d}@${b.x},${b.z}`;
      if (g && g.userData.key !== key) { if (g.userData.ck) this.unbatch(g); this.world.remove(g); this.bm.delete(b.id); g = null; }   // refitted: build it again
      if (!g) {
        g = new THREE.Group(); g.userData.b = b.id; g.userData.key = key;
        const std = b.std != null && b.std < 2 ? { std: b.std, w: b.rot % 2 ? b.d : b.w, d: b.rot % 2 ? b.w : b.d } : null;
        const model = buildModel(b.type, this.m, true, std || (b.design || b.parts?.length ? { design: b.design, parts: b.parts, wing: wingOf(b) } : null)); model.rotation.y = b.rot * Math.PI / 2; g.add(model); g.userData.model = model;
        g.position.set(this.wx(b.x + b.w / 2), 0, this.wx(b.z + b.d / 2));
        g.traverse(o => { o.userData.bid = b.id; });
        const box = new THREE.Box3().setFromObject(model); g.userData.top = box.max.y;
        const d = B[b.type];
        if (d.crew || d.pw < 0) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), this.m.glowG); lamp.position.set(0, box.max.y + 0.25, 0); lamp.userData.bid = b.id; g.add(lamp); g.userData.lamp = lamp; }
        g.visible = !this.info; this.world.add(g); this.bm.set(b.id, g);
      }
      const model = g.userData.model, ud = model.userData;
      // under construction (or being upgraded): scaffolding round it, and a new building rises inside
      const busy = !b.done || !!b.upg;
      if (busy) {
        if (!g.userData.scaf) {
          const h = Math.max(0.8, g.userData.top + 0.2), sc = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w - 0.1, h, b.d - 0.1, Math.max(1, b.w), 2, Math.max(1, b.d))), this.m.scaffold);
          sc.position.y = h / 2; g.add(sc); g.userData.scaf = sc;
        }
        model.scale.y = b.done ? 1 : 0.06 + 0.94 * b.prog;
      } else if (g.userData.scaf) { g.remove(g.userData.scaf); g.userData.scaf = null; model.scale.y = 1; }
      // wear: grime on the roof as the condition drops, and it leans a little when it's really bad
      const worn = b.cond < 60 ? (b.cond < 35 ? 2 : 1) : 0;
      if (g.userData.worn !== worn) {
        if (g.userData.grime) g.remove(g.userData.grime);
        g.userData.grime = null; g.userData.worn = worn; model.rotation.z = worn === 2 ? 0.025 : 0; if (g.userData.ck) this.unbatch(g);
        if (worn) {
          const gr = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: worn === 2 ? '#1a120a' : '#3a2c1a', transparent: true, opacity: worn === 2 ? 0.55 : 0.35, depthWrite: false });
          for (let i = 0; i < 3 + worn * 3; i++) { const p = new THREE.Mesh(new THREE.CircleGeometry(0.15 + Math.random() * 0.25, 7), mat); p.rotation.x = -Math.PI / 2; p.position.set((Math.random() - 0.5) * (b.w - 0.4), g.userData.top + 0.01, (Math.random() - 0.5) * (b.d - 0.4)); gr.add(p); }
          g.add(gr); g.userData.grime = gr;
        }
      }
      if (busy) { if (g.userData.ck) this.unbatch(g); continue; }
      if (!g.userData.ck && !this.noBatch) this.batch(g);
      const w = s.work(b);
      if (g.userData.lamp) {
        const d = B[b.type], noCrew = d.crew && b.crew < d.crew, noPow = d.pw < 0 && s.power.ratio < 1;
        g.userData.lamp.material = b.off ? this.m.glowR : noPow ? ((t * 2) % 1 < 0.5 ? this.m.glowR : this.m.glowY) : noCrew ? this.m.glowY : this.m.glowG;
        g.userData.lamp.position.y = g.userData.top + 0.25 + Math.sin(t * 2 + b.id) * 0.03;
      }
      if (ud.beam) ud.beam.rotation.z = Math.sin(t * 2.2 + b.id) * 0.28 * Math.min(1, w * 1.5);
      if (ud.spin) ud.spin.rotation.y += dt * 0.6;
      if (ud.spin2) ud.spin2.rotation.y -= dt * 0.9;
      if (ud.nod) ud.nod.rotation.x = Math.sin(t * 1.6 + b.id) * 0.3;
      if (ud.spinZ) ud.spinZ.rotation.z += dt * 1.4;
      if (ud.blink) { const on = (t + b.id * 0.37) % 1.6 < 0.8; for (const l of ud.blink) l.visible = on; }
      if (ud.glow) ud.glow.material.emissiveIntensity = w > 0 ? 1 + Math.sin(t * 9) * 0.3 : 0.1;
      if (ud.smoke && b.running && Math.random() < dt * 5) for (const p of ud.smoke) {
        const v = new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.rot * Math.PI / 2).add(g.position); this.puff(v);
      }
      if (ud.plaques) ud.plaques.count = Math.min(64, s.fallen.length);
      if (ud.dirt) { if (ud.dirt.material === this.m.grime) ud.dirt.material = this.m.grime.clone(); ud.dirt.material.opacity = Math.max(0, 0.75 - (b.clean ?? 100) / 100 * 0.9); }
      if (ud.crates) { const cap = (B[b.type].store?.rations || 0) + (B[b.type].store?.ammo || 0), n = Math.round(Math.min(1, ((b.stock?.rations || 0) + (b.stock?.ammo || 0)) / Math.max(1, cap)) * 12); ud.crates.forEach((c, i) => c.visible = i < n); }
      if (B[b.type].pad) this.padCrates(g, b);
      if (!ud.waves) { ud.waves = []; model.traverse(o => { if (o.userData.wave) ud.waves.push(o); }); }
      for (const o of ud.waves) { const wv = o.userData.wave;
        const pos = o.geometry.attributes.position, a = pos.array, base = wv.base;
        for (let i = 0; i < a.length; i += 3) {
          const x = base[i], y = base[i + 1], k = wv.soft ? 0 : x / wv.w;
          a[i + 2] = wv.soft ? Math.sin(t * 1.8 + y * 2 + b.id) * 0.04 * (0.55 - y) : Math.sin(x * 5 - t * 6 + b.id) * 0.07 * k + Math.sin(t * 2.3 + b.id) * 0.03 * k;
        }
        pos.needsUpdate = true; }
    }
    for (const [id, g] of this.bm) if (!s.byId(id)) { if (g.userData.ck) this.unbatch(g); this.world.remove(g); this.bm.delete(id); if (this.selId === id) this.select(null); }
    // one chunk a frame is re-merged, so a big change spreads over a few frames
    for (const c of this.chunks?.values() || []) if (c.dirty) { this.rebuildChunk(c); break; }
  }
  // ---------------------------------------------------------------- batching: the still parts of finished buildings are
  // merged per 32-tile chunk and material, so a Major Base is a few hundred draw calls, not a few thousand. The building's
  // own copies stay (hidden) for picking, and come back while it's being built, refitted or changes its wear
  batch(g) {
    const mm = g.userData.mm ||= (() => { const l = []; g.userData.model.traverse(o => { if (o.isMesh && o.userData.merged) l.push(o); }); return l; })();
    if (!mm.length) { g.userData.ck = 'none'; return; }
    const ck = `${Math.floor(g.position.x / 32)},${Math.floor(g.position.z / 32)}`;
    this.chunks ||= new Map();
    let c = this.chunks.get(ck); if (!c) { c = { members: new Set(), group: new THREE.Group(), dirty: true }; c.group.visible = !this.info; this.world.add(c.group); this.chunks.set(ck, c); }
    c.members.add(g); c.dirty = true; g.userData.ck = ck;
  }
  unbatch(g) {
    const c = this.chunks?.get(g.userData.ck); g.userData.ck = null;
    for (const m of g.userData.mm || []) m.visible = true;
    if (c) { c.members.delete(g); c.dirty = true; }
  }
  rebuildChunk(c) {
    c.dirty = false;
    for (const m of [...c.group.children]) { c.group.remove(m); m.geometry.dispose(); }
    this.world.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.world.matrixWorld).invert(), groups = new Map(), mx = new THREE.Matrix4();
    for (const g of c.members) for (const m of g.userData.mm) {
      m.visible = false;
      const key = m.material.uuid + (m.castShadow ? 's' : '');
      if (!groups.has(key)) groups.set(key, { mat: m.material, cast: m.castShadow, list: [] });
      groups.get(key).list.push([m.geometry, mx.multiplyMatrices(inv, m.matrixWorld).clone()]);
    }
    for (const { mat, cast, list } of groups.values()) {
      const n = list.reduce((a, [geo]) => a + geo.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      let k = 0; const v = new THREE.Vector3(), nm = new THREE.Matrix3();
      for (const [geo, M] of list) {
        const P = geo.attributes.position.array, Nn = geo.attributes.normal.array, cnt = geo.attributes.position.count; nm.getNormalMatrix(M);
        for (let i = 0; i < cnt; i++) {
          v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(M); pos[(k + i) * 3] = v.x; pos[(k + i) * 3 + 1] = v.y; pos[(k + i) * 3 + 2] = v.z;
          v.set(Nn[i * 3], Nn[i * 3 + 1], Nn[i * 3 + 2]).applyMatrix3(nm).normalize(); nor[(k + i) * 3] = v.x; nor[(k + i) * 3 + 1] = v.y; nor[(k + i) * 3 + 2] = v.z;
        }
        uv.set(geo.attributes.uv.array, k * 2); k += cnt;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = cast; mesh.receiveShadow = true; mesh.raycast = () => {}; c.group.add(mesh);
    }
    this.r.shadowMap.needsUpdate = true;
  }

  padCrates(g, b) {   // supplies waiting on the pad, as stacks of crates
    const st = b.stock || {}, n = Math.min(18, Math.ceil(((st.rations || 0) + (st.fuel || 0) + (st.ammo || 0)) / 12));
    // two instanced meshes (the crates and their hazard bands) instead of 36 meshes per pad
    if (!g.userData.pc) {
      const body = new THREE.InstancedMesh(this.crateGeo ||= new THREE.BoxGeometry(0.3, 0.26, 0.3), this.m.crate, 18), band = new THREE.InstancedMesh(this.bandGeo ||= new THREE.BoxGeometry(0.31, 0.05, 0.31), this.m.hazard, 18), o = new THREE.Object3D();
      for (let i = 0; i < 18; i++) { o.position.set(-1.1 + (i % 3) * 0.36, 0.1 + Math.floor(i / 9) * 0.27 + 0.13, 0.75 + (Math.floor(i / 3) % 3) * 0.33); o.updateMatrix(); body.setMatrixAt(i, o.matrix); o.position.y += 0.06; o.updateMatrix(); band.setMatrixAt(i, o.matrix); }
      body.castShadow = true; body.userData.bid = band.userData.bid = b.id; body.raycast = band.raycast = () => {};
      g.add(body, band); g.userData.pc = [body, band];
    }
    for (const im of g.userData.pc) im.count = n;
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
    // only people on screen are posed and drawn; zoomed far out, limbs stop moving (nobody can see them) and a person who
    // has not moved keeps last frame's matrices
    this.cam.updateMatrixWorld(); const fr = this.frust ||= new THREE.Frustum(), sph = this.psph ||= new THREE.Sphere(new THREE.Vector3(), 1.2);
    fr.setFromProjectionMatrix((this.pmat ||= new THREE.Matrix4()).multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse));
    const far = this.zoom > 20;
    for (const [id, a] of L.actors) {
      let g = this.pm.get(id);
      // each person is a rig that is never drawn itself: its parts are copied into one instanced mesh per part
      if (!g) { g = makePerson(this.m, a.kind); g.scale.setScalar(1.15); g.userData.list = []; g.traverse(o => { if (o.isMesh) g.userData.list.push(o); }); this.pm.set(id, g); }
      g.visible = !a.hidden;
      const u = g.userData, wx = this.wx(a.x), wz = this.wx(a.z);
      sph.center.set(wx, 0.6, wz); u.seen = g.visible && fr.intersectsSphere(sph);
      if (!u.seen) continue;
      if (far && a.act !== 'lie') {
        if (!u.rest || u.px !== wx || u.pz !== wz || u.yaw !== a.yaw) {
          if (!u.rest) for (const k of ['legL', 'legR', 'armL', 'armR', 'head']) u.parts[k].rotation.set(0, 0, 0);
          if (!u.rest) { u.parts.armL.userData.elbow.rotation.set(0, 0, 0); u.parts.armR.userData.elbow.rotation.set(0, 0, 0); }
          g.position.set(wx, 0, wz); g.rotation.set(0, a.yaw, 0); u.rest = true; u.dirty = true; u.px = wx; u.pz = wz; u.yaw = a.yaw;
        }
        continue;
      }
      u.rest = false; u.dirty = true; u.px = NaN;
      g.position.set(wx, 0, wz); g.rotation.set(0, a.yaw, 0);
      const p = g.userData.parts, ph = t * 9 + a.seed;
      p.legL.rotation.set(0, 0, 0); p.legR.rotation.set(0, 0, 0); p.armL.rotation.set(0, 0, 0); p.armR.rotation.set(0, 0, 0); p.head.rotation.set(0, 0, 0);
      const eL = p.armL.userData.elbow, eR = p.armR.userData.elbow; eL.rotation.set(0, 0, 0); eR.rotation.set(0, 0, 0);
      g.position.y = 0;
      switch (a.act) {
        case 'walk': p.legL.rotation.x = Math.sin(ph) * 0.6; p.legR.rotation.x = -Math.sin(ph) * 0.6; p.armL.rotation.x = -Math.sin(ph) * 0.5; p.armR.rotation.x = Math.sin(ph) * 0.5; eL.rotation.x = eR.rotation.x = -0.35; g.position.y = Math.abs(Math.sin(ph)) * 0.015; break;
        case 'heart': p.armR.rotation.set(-0.55, 0, 0.5); eR.rotation.x = -2.0; break;
        case 'salute': p.armR.rotation.set(-1.05, 0, -0.35); eR.rotation.x = -2.1; break;
        case 'work': case 'build': p.armR.rotation.x = -1.4 + Math.sin(t * 7 + a.seed) * 0.5; eR.rotation.x = -0.9 + Math.sin(t * 7 + a.seed) * 0.4; p.armL.rotation.x = -0.6; eL.rotation.x = -0.8; break;
        case 'drill': { const k = Math.sin(t * 6 + Math.floor(a.x)); p.legL.rotation.x = Math.max(0, k) * -1.1; p.legR.rotation.x = Math.max(0, -k) * -1.1; p.armL.rotation.x = k * 0.7; p.armR.rotation.x = -k * 0.7; eL.rotation.x = eR.rotation.x = -0.4; g.position.y = Math.abs(k) * 0.02; break; }
        case 'drink': p.armR.rotation.set(-0.9, 0, -0.3); eR.rotation.x = -2.0 + Math.sin(t * 2 + a.seed) * 0.25; break;
        case 'mourn': p.head.rotation.x = 0.5; p.armL.rotation.x = -0.3; p.armR.rotation.x = -0.3; eL.rotation.x = eR.rotation.x = -1.2; break;
        case 'inspect': p.armR.rotation.x = -0.4; eR.rotation.x = -1.2; p.head.rotation.x = 0.3; p.head.rotation.y = Math.sin(t * 1.5 + a.seed) * 0.4; break;
        case 'look': p.head.rotation.x = -0.25; break;
        case 'run': p.legL.rotation.x = Math.sin(ph * 1.4) * 0.9; p.legR.rotation.x = -Math.sin(ph * 1.4) * 0.9; p.armL.rotation.x = -Math.sin(ph * 1.4) * 0.8; p.armR.rotation.x = Math.sin(ph * 1.4) * 0.8; eL.rotation.x = eR.rotation.x = -1.2; g.position.y = Math.abs(Math.sin(ph * 1.4)) * 0.03; break;
        case 'aim': p.armR.rotation.set(-1.5, 0, -0.25); p.armL.rotation.set(-1.45, 0, 0.35); eR.rotation.x = -0.2; eL.rotation.x = -0.3; p.head.rotation.x = 0.1; break;
        case 'lie': g.rotation.set(-Math.PI / 2, a.yaw, 0, 'YXZ'); g.position.y = 0.06; break;
        default: p.armL.rotation.x = Math.sin(t * 1.5 + a.seed) * 0.05;
      }
    }
    for (const id of this.pm.keys()) if (!L.actors.has(id)) this.pm.delete(id);
    this.drawCrowd();
  }
  // one instanced mesh per body part and kind of person: a few dozen draw calls for any number of people
  drawCrowd() {
    const counts = {};
    for (const [id, g] of this.pm) {
      if (!g.visible || !g.userData.seen) continue;
      const kind = this.life.actors.get(id)?.kind || 'troop';
      let c = this.crowd[kind];
      const n = counts[kind] || 0;
      if (!c || n >= c.cap) c = this.growCrowd(kind, Math.max(64, (c?.cap || 32) * 2), g);
      if (g.userData.dirty) { g.updateMatrixWorld(true); g.userData.dirty = false; }
      const list = g.userData.list;
      for (let i = 0; i < list.length && i < c.ims.length; i++) c.ims[i].setMatrixAt(n, list[i].matrixWorld);
      counts[kind] = n + 1;
    }
    for (const [kind, c] of Object.entries(this.crowd)) for (const im of c.ims) { im.count = counts[kind] || 0; im.instanceMatrix.needsUpdate = true; }
  }
  growCrowd(kind, cap, rig) {
    const old = this.crowd[kind];
    if (old) for (const im of old.ims) { this.world.remove(im); im.dispose(); }
    const ims = rig.userData.list.map(m => {
      const im = new THREE.InstancedMesh(m.geometry, m.material, cap);
      im.castShadow = m.castShadow; im.receiveShadow = false; im.frustumCulled = false; im.count = 0;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.world.add(im); return im;
    });
    return (this.crowd[kind] = { cap, ims });
  }

  // scrub and debris on the ground, a few low shapes per tile, and the patches ordered cleared, outlined in amber
  syncScrub() {
    const s = this.sim; if (!s.scrub) return;
    const key = `${s.scrubV || 0}:${(s.clr || []).map(o => o.id + '.' + o.tiles.length).join()}`;
    if (this.scrubKey === key && this.scrubSim === s) return;
    this.scrubKey = key; this.scrubSim = s;
    const N = this.N, cols = SCRUB_COL[s.site?.biome] || SCRUB_COL.steppe, tiles = [];
    for (let i = 0; i < s.scrub.length; i++) if (s.scrub[i]) tiles.push(i);
    if (!this.scrubM) {
      const mk = (geo, col) => { const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 1, flatShading: true }), 16); im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; return im; };
      this.scrubM = [mk(new THREE.IcosahedronGeometry(0.2, 0), cols[0]), mk(new THREE.ConeGeometry(0.16, 0.34, 5), cols[1])];
      const om = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.92, 0.92), new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.35, depthWrite: false }), 16);
      om.frustumCulled = false; this.scrubM.push(om);
    }
    for (const im of this.scrubM) if (im.parent !== this.world) this.world.add(im);
    this.scrubM[0].material.color.set(cols[0]); this.scrubM[1].material.color.set(cols[1]);
    const grow = (k, n) => { let im = this.scrubM[k]; if (im.count !== undefined && im.instanceMatrix.count >= n) return im; const nm = new THREE.InstancedMesh(im.geometry, im.material, Math.max(16, n * 1.5 | 0)); nm.castShadow = im.castShadow; nm.receiveShadow = im.receiveShadow; nm.frustumCulled = false; this.world.remove(im); im.dispose(); this.world.add(nm); return (this.scrubM[k] = nm); };
    const a = grow(0, tiles.length), b2 = grow(1, tiles.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const h = i => { let x = (i * 2654435761) >>> 0; x ^= x >>> 13; x = Math.imul(x, 1274126177) >>> 0; return (x >>> 8) / 16777216; };
    tiles.forEach((i, n) => {
      const x = i % N, z = (i / N) | 0, r1 = h(i), r2 = h(i + 7919), r3 = h(i + 104729);
      e.set(r1 * 0.6, r2 * TAU, r3 * 0.4); q.setFromEuler(e); sc.setScalar(0.7 + r3 * 0.7); sc.y *= 0.55 + r1 * 0.5;
      M.compose(v.set(this.wx(x + 0.25 + r1 * 0.5), 0.06, this.wx(z + 0.25 + r2 * 0.5)), q, sc); a.setMatrixAt(n, M);
      e.set(0, r3 * TAU, 0); q.setFromEuler(e); sc.setScalar(0.6 + r2 * 0.8);
      M.compose(v.set(this.wx(x + 0.15 + r3 * 0.7), 0.16 * sc.y, this.wx(z + 0.15 + r1 * 0.7)), q, sc); b2.setMatrixAt(n, M);
    });
    a.count = b2.count = tiles.length; a.instanceMatrix.needsUpdate = b2.instanceMatrix.needsUpdate = true;
    const ord = (s.clr || []).flatMap(o => o.tiles), om = grow(2, ord.length);
    e.set(-Math.PI / 2, 0, 0); q.setFromEuler(e); sc.setScalar(1);
    ord.forEach((i, n) => { M.compose(v.set(this.wx(i % N + 0.5), 0.025, this.wx(((i / N) | 0) + 0.5)), q, sc); om.setMatrixAt(n, M); });
    om.count = ord.length; om.instanceMatrix.needsUpdate = true;
  }
  syncVehicles(dt) {
    const L = this.life, t = this.t;
    for (const v of this.sim.veh) {
      let g = this.vm.get(v.id);
      if (!g) { g = (VMAKE[v.kind] || makeTruck)(this.m); g.scale.setScalar(v.kind === 'tank' ? 1.5 : 1.2); this.world.add(g); this.vm.set(v.id, g); }
      g.visible = !v.away;
      g.position.set(this.wx(v.x), 0, this.wx(v.z)); g.rotation.y = v.yaw;
      if (g.userData.cargo) g.userData.cargo.visible = v.load > 0;
    }
    for (const [id, g] of this.vm) if (!this.sim.veh.some(v => v.id === id)) { this.world.remove(g); this.vm.delete(id); }
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
