// The planet from orbit: a globe to turn, with the best landing areas marked. Click it to pick a section; the view
// swings round and closes in on it. The surface is the region map (site.js), mirrored round the planet so it has no seam.
import * as THREE from './vendor/three.js';
import { RW, RH, TPP } from './site.js';

const nh = m => { m.defines = { ...(m.defines || {}), NO_HGT: '' }; return m; };   // the ground's height shader is not for these
const TX = 4, TY = 2;   // the region map repeats (mirrored) this many times round and up the planet
export class Globe {
  constructor(canvas, onPick) {
    this.cv = canvas; this.onPick = onPick;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.sc = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(34, 1, 0.05, 50);
    this.sc.add(new THREE.AmbientLight('#8fa3c8', 0.55)); this.sun = new THREE.DirectionalLight('#fff3dc', 2.1); this.sc.add(this.sun);
    this.tex = new THREE.CanvasTexture(Object.assign(document.createElement('canvas'), { width: RW * TX, height: RH * TY })); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.wrapS = THREE.RepeatWrapping; this.tex.anisotropy = 4;
    const mat = new THREE.MeshLambertMaterial({ map: this.tex }); mat.defines = { NO_HGT: '' };
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat); this.sc.add(this.ball);
    const air = new THREE.Mesh(new THREE.SphereGeometry(1.045, 64, 40), new THREE.ShaderMaterial({ transparent: true, side: THREE.BackSide, depthWrite: false, uniforms: { c: { value: new THREE.Color('#7fc8ff') } },
      vertexShader: 'varying vec3 n; varying vec3 v; void main(){ n = normalize(normalMatrix * normal); vec4 p = modelViewMatrix * vec4(position, 1.0); v = normalize(-p.xyz); gl_Position = projectionMatrix * p; }',
      fragmentShader: 'uniform vec3 c; varying vec3 n; varying vec3 v; void main(){ float a = pow(1.0 - abs(dot(n, v)), 2.2); gl_FragColor = vec4(c, a * 0.85); }' }));
    this.sc.add(air);
    { const p = []; for (let i = 0; i < 900; i++) { const a = Math.random() * Math.PI * 2, y = Math.random() * 2 - 1, r = Math.sqrt(1 - y * y); p.push(Math.cos(a) * r * 30, y * 30, Math.sin(a) * r * 30); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); this.sc.add(new THREE.Points(g, nh(new THREE.PointsMaterial({ color: '#cfd8e6', size: 0.09, sizeAttenuation: true })))); }
    this.marks = new THREE.Group(); this.sc.add(this.marks);
    this.sel = new THREE.Group(); this.sc.add(this.sel);
    this.lon = 0.6; this.lat = 0.25; this.dist = 3.6; this.lonT = this.lon; this.latT = this.lat; this.distT = 3.6; this.idle = 0; this.on = false;
    let down = null;
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; down.moved += Math.abs(dx) + Math.abs(dy); down.x = e.clientX; down.y = e.clientY;
      const k = 0.0045 * this.dist / 3.6; this.lonT -= dx * k; this.latT = Math.max(-1.2, Math.min(1.2, this.latT + dy * k)); this.idle = 0; });
    canvas.addEventListener('pointerup', e => { const d = down; down = null; if (!d || d.moved > 6) return; const uv = this.hit(e); if (uv) this.onPick(uv[0], uv[1]); });
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.distT = Math.max(1.5, Math.min(4.2, this.distT * (e.deltaY > 0 ? 1.12 : 0.89))); this.idle = 0; }, { passive: false });
  }
  hit(e) {
    const b = this.cv.getBoundingClientRect(), ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((e.clientX - b.left) / b.width * 2 - 1, -((e.clientY - b.top) / b.height * 2 - 1)), this.cam);
    const h = ray.intersectObject(this.ball)[0]; if (!h) return null;
    const X = h.uv.x * RW * TX, Y = (1 - h.uv.y) * RH * TY, tile = Math.floor(X / RW), fx = X - tile * RW; this.tile = tile;
    // the map covers the middle half of the latitudes; above and below it the nearest edge is used
    return [tile % 2 ? RW - fx : fx, Math.max(0, Math.min(RH, (Y - RH * TY * 0.25) / (RH * TY * 0.5) * RH))];
  }
  setPlanet(pixels, sites) {
    const cv = this.tex.image, g = cv.getContext('2d'), src = Object.assign(document.createElement('canvas'), { width: RW, height: RH }), sg = src.getContext('2d'), im = sg.createImageData(RW, RH); im.data.set(pixels); sg.putImageData(im, 0, 0);
    // the map sits in the middle half of the latitudes, mirrored round the planet; its top and bottom rows stretch to the poles and fade to ice
    const H = RH * TY, band = H * 0.5, y0 = H * 0.25;
    for (let t = 0; t < TX; t++) { g.save(); if (t % 2) { g.translate((t + 1) * RW, 0); g.scale(-1, 1); } else g.translate(t * RW, 0);
      g.drawImage(src, 0, 0, RW, RH, 0, y0, RW, band); g.drawImage(src, 0, 0, RW, 1, 0, 0, RW, y0); g.drawImage(src, 0, RH - 1, RW, 1, 0, y0 + band, RW, H - y0 - band); g.restore(); }
    for (const [a, b] of [[0, y0 * 0.9], [H, H - y0 * 0.9]]) { const gr = g.createLinearGradient(0, a, 0, b); gr.addColorStop(0, 'rgba(236,242,248,0.96)'); gr.addColorStop(1, 'rgba(236,242,248,0)'); g.fillStyle = gr; g.fillRect(0, Math.min(a, b), cv.width, Math.abs(b - a)); }
    this.tex.needsUpdate = true;
    this.marks.clear(); this.tile = 0;
    const gm = nh(new THREE.MeshBasicMaterial({ color: '#7fe9e0' })), gh = nh(new THREE.MeshBasicMaterial({ color: '#7fe9e0', transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    for (const s of sites) { const p = this.at2(s.u, s.v, 0, 1.012); const pin = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), gm); pin.position.copy(p); this.marks.add(pin);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.028, 24), gh); halo.position.copy(p); halo.lookAt(p.clone().multiplyScalar(2)); this.marks.add(halo); }
  }
  // the same, with the map squeezed into the middle half of the latitudes as it is drawn
  at2(u, v, tile, r) { const X = tile % 2 ? (tile + 1) * RW - u : tile * RW + u, ux = X / (RW * TX), vy = 0.25 + v / RH * 0.5, phi = ux * Math.PI * 2, th = vy * Math.PI; return new THREE.Vector3(-Math.cos(phi) * Math.sin(th) * r, Math.cos(th) * r, Math.sin(phi) * Math.sin(th) * r); }
  // mark the chosen section and swing the camera over it
  select(u, v, sectionCells, fly = true) {
    this.sel.clear(); const p = this.at2(u, v, this.tile || 0, 1.014), n = p.clone().normalize();
    const half = sectionCells / TPP / 2, c = [[-half, -half], [half, -half], [half, half], [-half, half], [-half, -half]].map(([du, dv]) => this.at2(u + du, v + dv, this.tile || 0, 1.014));
    this.sel.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c), nh(new THREE.LineBasicMaterial({ color: '#f5d547' }))));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8), nh(new THREE.MeshBasicMaterial({ color: '#f5d547' }))); dot.position.copy(p); this.sel.add(dot);
    if (fly) { this.latT = Math.asin(n.y); let lo = Math.atan2(n.x, n.z); while (lo - this.lon > Math.PI) lo -= Math.PI * 2; while (lo - this.lon < -Math.PI) lo += Math.PI * 2; this.lonT = lo; this.distT = 2.45; this.idle = -1e9; }
  }
  start() { if (this.on) return; this.on = true; let last = performance.now(); const tick = now => { if (!this.on) return; const dt = Math.min(0.1, (now - last) / 1000); last = now; this.frame(dt); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
  stop() { this.on = false; }
  frame(dt) {
    const b = this.cv.getBoundingClientRect(), w = Math.max(2, Math.round(b.width)), h = Math.max(2, Math.round(b.height));
    if (this.w !== w || this.h !== h) { this.w = w; this.h = h; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
    this.idle += dt; if (this.idle > 4) this.lonT += dt * 0.05;   // left alone, the planet turns
    const k = Math.min(1, dt * 3.2); this.lon += (this.lonT - this.lon) * k; this.lat += (this.latT - this.lat) * k; this.dist += (this.distT - this.dist) * k;
    const cl = Math.cos(this.lat); this.cam.position.set(Math.sin(this.lon) * cl * this.dist, Math.sin(this.lat) * this.dist, Math.cos(this.lon) * cl * this.dist); this.cam.lookAt(0, 0, 0);
    this.sun.position.copy(this.cam.position).add(new THREE.Vector3(2.5, 1.5, 0).applyQuaternion(this.cam.quaternion));
    this.r.render(this.sc, this.cam);
  }
}
