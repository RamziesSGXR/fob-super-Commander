// Terrain height and landscaping (0.17). The ground has a height at every tile corner, (N + 1) x (N + 1), in world units
// (tiles). The waterline is 0. Buildings level the ground under them as they go down; roads have a grade they can climb;
// the LANDSCAPE tools reshape the ground (Shift, Level, Soften, Slope) and paint its surface (sand, dry ground, grass,
// dirt), for supplies. What is water and what is rock follows the ground once it has been worked.
import { C, B } from './config.js';
import { GROUND, makeHeights, WL } from './site.js';

// heights are in cells (8 m); a cell-unit of earth is 8 x 8 x 8 m
export const TERRA = {
  maxGrade: 0.75,    // 6 m: the most a building's footprint may rise across it before it has to be levelled first
  roadGrade: 0.13,   // about 1 m in 8: the steepest a road climbs from one cell to the next
  rockGrade: 1,      // worked ground steeper than 45 degrees across a cell is bare rock
  cost: 2,           // supplies for each cell-unit of ground moved
  min: -8, max: 30,
  PAINTS: ['', 'sand', 'dry', 'grass', 'dirt'],
};

export const Terrain = {
  // ---------------------------------------------------------------- the height field
  heightsInit() {
    const N = this.N, M = N + 1;
    this.hgt0 = this.site ? makeHeights(this.site.seed, this.site.biome, this.site.u, this.site.v, N) : new Float32Array(M * M).fill(0.4);
    this.hgt = Float32Array.from(this.hgt0);
    this.terr0 = Uint8Array.from(this.terr);
    this.paint = new Uint8Array(N * N);
    this.hgtV = (this.hgtV || 0) + 1;
  },
  hv(x, z) { const M = this.N + 1; return this.hgt[Math.max(0, Math.min(M - 1, z)) * M + Math.max(0, Math.min(M - 1, x))]; },
  // the height at any point (tile coordinates: corner (i, j) sits at x = i, z = j)
  hAt(x, z) {
    if (!this.hgt) return 0;
    const M = this.N + 1, fx = Math.max(0, Math.min(M - 1.001, x)), fz = Math.max(0, Math.min(M - 1.001, z)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, h = this.hgt;
    return (h[j * M + i] * (1 - u) + h[j * M + i + 1] * u) * (1 - v) + (h[(j + 1) * M + i] * (1 - u) + h[(j + 1) * M + i + 1] * u) * v;
  },
  // how much the ground rises across a rectangle of tiles: the highest corner less the lowest
  gradeOf(x, z, w, d) {
    let lo = Infinity, hi = -Infinity;
    for (let j = z; j <= z + d; j++) for (let i = x; i <= x + w; i++) { const h = this.hv(i, j); if (h < lo) lo = h; if (h > hi) hi = h; }
    return hi - lo;
  },
  // a building goes down: the ground under it is levelled to its average, and the ring round it eased halfway in
  levelFoot(x, z, w, d) {
    if (!this.hgt) return;
    const M = this.N + 1; let sum = 0, n = 0;
    for (let j = z; j <= z + d; j++) for (let i = x; i <= x + w; i++) { sum += this.hv(i, j); n++; }
    const avg = Math.max(WL + 0.03, sum / n);
    for (let j = z - 1; j <= z + d + 1; j++) for (let i = x - 1; i <= x + w + 1; i++) {
      if (i < 0 || j < 0 || i >= M || j >= M) continue;
      const inside = i >= x && i <= x + w && j >= z && j <= z + d, k = j * M + i;
      if (inside) this.hgt[k] = avg; else if (!this.lockedCorner(i, j)) this.hgt[k] += (avg - this.hgt[k]) * 0.5;
    }
    this.reclassify(x - 2, z - 2, x + w + 2, z + d + 2);
  },
  // a corner under a building, a road or a wall stays put when the ground round it is worked
  lockedCorner(i, j) {
    const N = this.N;
    for (const [x, z] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
      if (x < 0 || z < 0 || x >= N || z >= N) continue;
      const t = z * N + x; if (this.occ?.[t] || this.roads?.[t] || this.walls?.[t]) return true;
    }
    return false;
  },
  // after the ground moves: what is under water is water, what is too steep is rock, and worked rock that is now level is
  // ground again (seeps and ore stay where they were, unless they drown)
  reclassify(x0, z0, x1, z1) {
    const N = this.N; let changed = false;
    const d = this.dirtyBox; this.dirtyBox = d ? [Math.min(d[0], x0), Math.min(d[1], z0), Math.max(d[2], x1), Math.max(d[3], z1)] : [x0, z0, x1, z1];   // for the view to redraw
    for (let z = Math.max(0, z0); z < Math.min(N, z1); z++) for (let x = Math.max(0, x0); x < Math.min(N, x1); x++) {
      const i = z * N + x, M = N + 1, ks = [z * M + x, z * M + x + 1, (z + 1) * M + x, (z + 1) * M + x + 1];
      const was = this.terr[i], base = this.terr0[i];
      // ground nobody has worked keeps what it was made with
      if (!ks.some(k => Math.abs(this.hgt[k] - this.hgt0[k]) > 0.001)) { if (was !== base && !this.occ?.[i]) { this.terr[i] = base; changed = true; } continue; }
      const c = ks.map(k => this.hgt[k]), mean = (c[0] + c[1] + c[2] + c[3]) / 4, g = Math.max(...c) - Math.min(...c);
      let k = mean < WL - 0.02 ? GROUND.WATER : g > TERRA.rockGrade ? GROUND.ROCK : base === GROUND.WATER || base === GROUND.ROCK ? 0 : base;
      if (this.occ?.[i] && (k === GROUND.WATER || k === GROUND.ROCK)) k = 0;   // a building's levelled pad is always ground
      if (k !== was) { this.terr[i] = k; changed = true; }
    }
    this.hgtV = (this.hgtV || 0) + 1;
    if (changed) { this.terrV = (this.terrV || 0) + 1; if (this.roads) this.rebuildNet(); }
  },

  // ---------------------------------------------------------------- landscaping
  // one stroke of a tool at (x, z), radius r tiles, strength s, for dt seconds of brush. op: shift (sign: +1 raise, -1
  // lower), level (to target), soften, slope (along a to b). Only on your land, never under buildings or roads
  terraform(op, x, z, o = {}) {
    if (!this.hgt) return { ok: false, why: 'This ground cannot be worked' };
    const M = this.N + 1, r = o.r ?? 3, s = o.s ?? 1, dt = o.dt ?? 0.1, rr = r * r;
    const ch = []; let vol = 0;
    for (let j = Math.floor(z - r); j <= Math.ceil(z + r); j++) for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) {
      if (i < 0 || j < 0 || i >= M || j >= M) continue;
      const d2 = (i - x) ** 2 + (j - z) ** 2; if (d2 > rr) continue;
      if (!this.ownedTile(Math.min(this.N - 1, i), Math.min(this.N - 1, j)) || this.lockedCorner(i, j)) continue;
      const f = (1 - d2 / rr) ** 1.5, k = j * M + i, h = this.hgt[k]; let to = h;
      if (op === 'shift') to = h + (o.sign || 1) * s * dt * f * 1.5;
      else if (op === 'level') to = h + (o.target - h) * Math.min(1, s * dt * f * 4);
      else if (op === 'soften') { const avg = (this.hv(i - 1, j) + this.hv(i + 1, j) + this.hv(i, j - 1) + this.hv(i, j + 1)) / 4; to = h + (avg - h) * Math.min(1, s * dt * f * 6); }
      else if (op === 'slope') {
        const [ax, az, ah] = o.a, [bx, bz, bh] = o.b, L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1, t = Math.max(0, Math.min(1, ((i - ax) * (bx - ax) + (j - az) * (bz - az)) / L2));
        to = h + (ah + (bh - ah) * t - h) * Math.min(1, s * dt * f * 4);
      }
      to = Math.max(TERRA.min, Math.min(TERRA.max, to));
      if (Math.abs(to - h) < 1e-5) continue;
      ch.push([k, to]); vol += Math.abs(to - h);
    }
    if (!ch.length) return { ok: false, why: o.quiet ? '' : 'Nothing to move here: only your own open ground, clear of buildings and roads' };
    let cost = vol * TERRA.cost;
    if (cost > this.supplies) { if (this.supplies < 1) return { ok: false, why: 'Out of supplies' }; const f = this.supplies / cost; for (const c of ch) c[1] = this.hgt[c[0]] + (c[1] - this.hgt[c[0]]) * f; cost = this.supplies; }
    for (const [k, to] of ch) this.hgt[k] = to;
    this.tfCost = (this.tfCost || 0) + cost; this.spend('build', cost, 0);
    this.stats.moved = (this.stats.moved || 0) + vol;
    this.reclassify(Math.floor(x - r) - 1, Math.floor(z - r) - 1, Math.ceil(x + r) + 1, Math.ceil(z + r) + 1);
    return { ok: true, cost, vol };
  },
  // paint the surface: purely how it looks (sand, dry ground, lush grass, dirt), or 0 to take the paint off
  paintGround(x, z, r, kind) {
    const N = this.N; let k = 0;
    for (let j = Math.floor(z - r); j <= Math.ceil(z + r); j++) for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) {
      if (i < 0 || j < 0 || i >= N || j >= N || (i + 0.5 - x) ** 2 + (j + 0.5 - z) ** 2 > r * r || !this.ownedTile(i, j)) continue;
      if (this.paint[j * N + i] !== kind) { this.paint[j * N + i] = kind; k++; }
    }
    if (k) { this.paintV = (this.paintV || 0) + 1; const d = this.dirtyBox, b = [Math.floor(x - r) - 1, Math.floor(z - r) - 1, Math.ceil(x + r) + 1, Math.ceil(z + r) + 1]; this.dirtyBox = d ? [Math.min(d[0], b[0]), Math.min(d[1], b[1]), Math.max(d[2], b[2]), Math.max(d[3], b[3])] : b; }
    return { ok: k > 0 };
  },

  // ---------------------------------------------------------------- saving: only what was changed from the ground as found
  packHeights() {
    const out = [];
    for (let k = 0; k < this.hgt.length; k++) if (Math.abs(this.hgt[k] - this.hgt0[k]) > 0.001) out.push(k.toString(36) + ':' + Math.round(this.hgt[k] * 1000).toString(36));
    return out.join(',');
  },
  packPaint() { let s = '', run = 0, cur = -1; for (const v of this.paint) { if (v === cur) run++; else { if (run) s += cur + '.' + run.toString(36) + ','; cur = v; run = 1; } } if (run) s += cur + '.' + run.toString(36); return s; },
  unpackTerrain(hs, ps) {
    if (hs) for (const e of hs.split(',')) { const [k, v] = e.split(':'); this.hgt[parseInt(k, 36)] = parseInt(v, 36) / 1000; }
    if (ps) { let i = 0; for (const e of ps.split(',')) { if (!e) continue; const [v, n] = e.split('.'); this.paint.fill(+v, i, i + parseInt(n, 36)); i += parseInt(n, 36); } }
    this.reclassify(0, 0, this.N, this.N);
  },
};
