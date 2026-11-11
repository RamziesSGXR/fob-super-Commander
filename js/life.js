// The ant farm: everyone you can watch walking about. Troops go to work, drill, salute the flag, queue at the
// vending machine, march out on patrol and come home; forklifts unload pelicans; inspectors poke at things.
// It reads the simulation and never changes it. Positions are in tiles (a tile's centre is i + 0.5).
import { B } from './config.js';

const WALK = 1.5, DRIVE = 2.4;
const SHIFT = new Set(['pump', 'plant', 'gen']);   // these run round the clock, so their crews skip the routine
const HOUSING = ['hq', 'hab', 'barracks'];
const EAT = ['mess', 'burger', 'chicken', 'cola'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

export class Life {
  constructor(sim) {
    this.sim = sim; this.N = sim.N;
    this.actors = new Map();      // id -> person (troops by their sim id, inspectors by negative ids)
    this.lifts = new Map();       // depot id -> forklift
    this.crates = []; this.flights = []; this.queue = [];
    this.hold = new Set();        // recruits still on the pelican
    this.ceremony = null; this.nextFake = -1; this.t = 0;
    this.gridKey = '';
  }

  // ---------------------------------------------------------------- walking
  grid() {
    const s = this.sim, key = s.b.map(b => b.id).join(',');
    if (key === this.gridKey) return this.walk;
    const N = this.N, w = new Uint8Array(N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) w[z * N + x] = (s.inside(x, z) && !s.occ[z * N + x]) ? 1 : 0;
    const m = N / 2; for (let x = m - 2; x <= m + 1; x++) w[(N - 1) * N + x] = 1;   // the gate
    this.walk = w; this.gridKey = key; return w;
  }
  free(x, z) { const N = this.N; return x >= 0 && z >= 0 && x < N && z < N && this.grid()[z * N + x] === 1; }
  near(x, z) {   // the nearest walkable tile
    x = Math.floor(x); z = Math.floor(z);
    if (this.free(x, z)) return [x, z];
    for (let r = 1; r < 8; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++)
      if (Math.max(Math.abs(dx), Math.abs(dz)) === r && this.free(x + dx, z + dz)) return [x + dx, z + dz];
    return [Math.floor(this.N / 2), this.N - 2];
  }
  path(fx, fz, tx, tz) {
    const N = this.N, w = this.grid(), [sx, sz] = this.near(fx, fz), [ex, ez] = this.near(tx, tz);
    const prev = new Int32Array(N * N).fill(-1), start = sz * N + sx, end = ez * N + ex, q = [start]; prev[start] = start;
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let h = 0; h < q.length && prev[end] < 0; h++) {
      const c = q[h], cx = c % N, cz = (c / N) | 0;
      for (const [dx, dz] of D) {
        const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const n = nz * N + nx; if (prev[n] >= 0 || !w[n]) continue;
        if (dx && dz && (!w[cz * N + nx] || !w[nz * N + cx])) continue;   // no cutting corners
        prev[n] = c; q.push(n);
      }
    }
    if (prev[end] < 0) return [[tx, tz]];
    const out = []; for (let c = end; c !== start; c = prev[c]) out.push([c % N + 0.5, ((c / N) | 0) + 0.5]);
    out.reverse(); out.push([tx, tz]); return out;
  }
  go(a, tx, tz, then) { a.path = this.path(a.x, a.z, tx, tz); a.then = then; a.act = 'walk'; }
  doorOf(b) { const [x, z] = this.sim.door(b); return [x + 0.5, z + 0.5]; }
  centre(b) { return [b.x + b.w / 2, b.z + b.d / 2]; }
  front(b, dist, side = 0) {   // a point in front of a building, dist tiles out, side tiles across
    const [cx, cz] = this.centre(b), f = [[0, 1], [1, 0], [0, -1], [-1, 0]][b.rot], h = b.rot % 2 ? b.w / 2 : b.d / 2;
    return [cx + f[0] * (h + dist) + f[1] * side, cz + f[1] * (h + dist) - f[0] * side];
  }
  out() { return [this.N / 2 + rnd(-1, 1), this.N + 5]; }
  inGate() { return [this.N / 2 + rnd(-1.5, 1.5), this.N - 3]; }

  person(id, kind, x, z) {
    const a = { id, kind, x, z, yaw: 0, path: [], act: 'idle', wait: 0, then: null, seed: Math.random() * 10, hidden: false, face: null };
    this.actors.set(id, a); return a;
  }

  // ---------------------------------------------------------------- events from the simulation
  event(e) {
    const s = this.sim;
    if (e.t === 'patrolOut') for (const id of e.members) {
      const a = this.actors.get(id); if (!a) continue;
      a.hidden = false; a.leaving = true;
      const [gx, gz] = this.inGate();
      this.go(a, gx, gz, () => { const [ox, oz] = this.out(); a.path = [[ox, oz]]; a.act = 'walk'; a.then = () => this.actors.delete(id); });
    }
    if (e.t === 'patrolBack') {
      e.members.forEach((id, i) => {
        this.actors.delete(id);
        const [ox, oz] = this.out(), a = this.person(id, 'troop', ox + (i % 3) * 0.6, oz + Math.floor(i / 3) * 0.6);
        a.returning = true;
        const [gx, gz] = this.inGate();
        a.path = [[gx, gz]]; a.act = 'walk'; a.then = () => { a.returning = false; a.task = null; };
      });
      if (e.hero) this.startCeremony(e.hero);
    }
    if (e.t === 'alloc') this.queue.push({ kind: 'alloc', crates: e.crates });
    if (e.t === 'recruits') { for (const id of e.ids) this.hold.add(id); this.queue.push({ kind: 'recruits', ids: e.ids }); }
    if (e.t === 'inspector') this.queue.push({ kind: 'inspector' });
    if (e.t === 'pickup') this.queue.push({ kind: 'pickup', crates: Math.max(2, Math.min(8, Math.round(e.qty / 15))) });
  }
  startCeremony(hero) {
    const flag = this.sim.b.find(b => b.type === 'seflag') || this.sim.b.find(b => b.type === 'flag' && b.done) || this.sim.b.find(b => b.type === 'hq');
    if (flag) this.ceremony = { t: 26, flag: flag.id, hero, slots: new Map() };
  }

  // ---------------------------------------------------------------- pelicans
  pad() { return this.sim.b.find(b => b.type === 'pad' && b.done); }
  landAt() { const p = this.pad(); return p ? this.centre(p) : [this.N / 2, this.N - 4]; }
  flightsUpdate(dt) {
    if (!this.flights.length && this.queue.length) {
      const job = this.queue.shift(), [lx, lz] = this.landAt(), from = rnd(0, Math.PI * 2);
      this.flights.push({ ...job, lx, lz, from, ph: 'in', k: 0, wait: 0, x: lx + Math.cos(from) * 40, z: lz + Math.sin(from) * 40, y: 14, yaw: from + Math.PI });
    }
    for (const f of this.flights) {
      f.k += dt;
      if (f.ph === 'in') {
        const u = Math.min(1, f.k / 6), e = 1 - (1 - u) * (1 - u);
        f.x = f.lx + Math.cos(f.from) * 40 * (1 - e); f.z = f.lz + Math.sin(f.from) * 40 * (1 - e); f.y = 2.5 + 11.5 * (1 - e);
        f.yaw = Math.atan2(-Math.cos(f.from), -Math.sin(f.from));
        if (u >= 1) { f.ph = 'down'; f.k = 0; }
      } else if (f.ph === 'down') {
        f.y = 2.5 * (1 - Math.min(1, f.k / 2.5)) + 0.05;
        if (f.k >= 2.5) { f.ph = 'land'; f.k = 0; this.landed(f); }
      } else if (f.ph === 'land') {
        if (this.flightDone(f) || f.k > 45) { f.ph = 'up'; f.k = 0; for (const c of this.crates) if (c.flight === f) c.gone = true; }
      } else if (f.ph === 'up') {
        const u = Math.min(1, f.k / 6), e = u * u;
        f.y = 0.05 + e * 16; f.x = f.lx - Math.cos(f.from) * 40 * e; f.z = f.lz - Math.sin(f.from) * 40 * e;
        if (u >= 1) f.ph = 'gone';
      }
    }
    this.flights = this.flights.filter(f => f.ph !== 'gone');
    this.crates = this.crates.filter(c => !c.gone);
  }
  landed(f) {
    const s = this.sim;
    if (f.kind === 'alloc') for (let i = 0; i < f.crates; i++)
      this.crates.push({ x: f.lx - 1 + (i % 3) * 0.7, z: f.lz + 0.9 + Math.floor(i / 3) * 0.6, y: 0, state: 'pad', to: 'depot' });
    if (f.kind === 'recruits') f.ids.forEach((id, i) => {
      this.hold.delete(id);
      if (!s.troop(id) || this.actors.has(id)) return;
      const a = this.person(id, 'troop', f.lx - 0.6 + (i % 3) * 0.6, f.lz + 1.2);
      a.task = null;
    });
    if (f.kind === 'inspector') {
      const a = this.person(this.nextFake--, 'inspector', f.lx + 0.4, f.lz + 1.2), stops = [];
      const looks = s.b.filter(b => b.done && (B[b.type].prop || B[b.type].mor || b.type === 'barracks'));
      for (let i = 0; i < 4 && looks.length; i++) stops.push(looks.splice(Math.floor(Math.random() * looks.length), 1)[0]);
      a.stops = stops; a.home = [f.lx + 0.4, f.lz + 1.2]; f.inspector = a.id;
    }
    if (f.kind === 'pickup') {
      const depot = s.b.find(b => b.type === 'depot' && b.done);
      for (let i = 0; i < f.crates; i++) {
        const [dx, dz] = depot ? this.doorOf(depot) : [f.lx + 1.6, f.lz + 1.6];
        this.crates.push({ x: dx + (i % 2) * 0.4, z: dz + Math.floor(i / 2) * 0.4, y: 0, state: depot ? 'depot' : 'pad', to: 'pad', flight: f, dest: [f.lx - 1 + (i % 3) * 0.7, f.lz - 0.2 + Math.floor(i / 3) * 0.5] });
      }
    }
  }
  flightDone(f) {
    if (f.kind === 'alloc') return f.k > 5;
    if (f.kind === 'recruits') return f.k > 4;
    if (f.kind === 'inspector') return f.k > 6 && !this.actors.has(f.inspector);
    if (f.kind === 'pickup') return f.k > 4 && this.crates.filter(c => c.flight === f).every(c => c.state === 'loaded');
    return true;
  }

  // ---------------------------------------------------------------- forklifts and crates
  liftsUpdate(dt) {
    const s = this.sim, depots = s.b.filter(b => b.type === 'depot' && b.done);
    for (const d of depots) if (!this.lifts.has(d.id)) { const [x, z] = this.doorOf(d); this.lifts.set(d.id, { depot: d.id, x, z, yaw: 0, path: [], crate: null, act: 'idle' }); }
    for (const [id] of this.lifts) if (!depots.some(d => d.id === id)) this.lifts.delete(id);
    for (const L of this.lifts.values()) {
      if (L.act === 'idle') {
        const c = this.crates.find(c => !c.claimed && ((c.state === 'pad' && c.to === 'depot') || (c.state === 'depot' && c.to === 'pad')));
        if (c) { c.claimed = true; L.crate = c; L.path = this.path(L.x, L.z, c.x, c.z); L.act = 'fetch'; }
        else { const d = s.byId(L.depot), [hx, hz] = this.doorOf(d); if (Math.hypot(L.x - hx, L.z - hz) > 0.5) { L.path = this.path(L.x, L.z, hx, hz); L.act = 'home'; } }
      }
      if (this.move(L, dt * DRIVE)) {
        if (L.act === 'fetch') {
          const c = L.crate; c.state = 'carried';
          const [tx, tz] = c.to === 'depot' ? this.doorOf(s.byId(L.depot)) : c.dest;
          L.path = this.path(L.x, L.z, tx, tz); L.act = 'carry';
        } else if (L.act === 'carry') {
          const c = L.crate; L.crate = null; L.act = 'idle';
          if (c.to === 'depot') c.gone = true; else { c.state = 'loaded'; [c.x, c.z] = c.dest; }
        } else if (L.act === 'home') L.act = 'idle';
      }
      if (L.crate) { L.crate.x = L.x + Math.sin(L.yaw) * 0.35; L.crate.z = L.z + Math.cos(L.yaw) * 0.35; L.crate.y = 0.18; }
    }
    // with no depot, crates on the pad are carried off by hand (they just vanish after a while)
    for (const c of this.crates) if (c.state === 'pad' && c.to === 'depot' && !depots.length) { c.age = (c.age || 0) + dt; if (c.age > 20) c.gone = true; }
    for (const c of this.crates) if (c.state === 'depot' && c.to === 'pad' && !depots.length) c.state = 'loaded';
  }

  // ---------------------------------------------------------------- moving along a path; true on arrival
  move(a, step) {
    while (a.path && a.path.length && step > 0) {
      const [tx, tz] = a.path[0], dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
      if (d > 1e-4) a.yaw = Math.atan2(dx, dz);
      if (d <= step) { a.x = tx; a.z = tz; step -= d; a.path.shift(); }
      else { a.x += dx / d * step; a.z += dz / d * step; step = 0; }
    }
    return !a.path || a.path.length === 0;
  }

  // ---------------------------------------------------------------- what an idle trooper does next
  idleTask(a, t) {
    const s = this.sim, done = s.b.filter(b => b.done);
    const of = type => done.filter(b => b.type === type);
    const opts = [];
    const site = s.b.find(b => !b.done);
    const dirty = s.cleaning && s.byId(s.cleaning);
    if (dirty && !this.cleaner) opts.push([50, () => { this.cleaner = a.id; const [x, z] = this.front(dirty, 0.55, 0.3); this.go(a, x, z, () => { a.act = 'work'; a.face = this.centre(dirty); a.wait = rnd(8, 12); a.onDone = () => { this.cleaner = null; }; }); }]);
    if (site) opts.push([5, () => { const [cx, cz] = this.centre(site), ang = rnd(0, 6.28), r = Math.max(site.w, site.d) / 2 + 0.6; this.go(a, cx + Math.cos(ang) * r, cz + Math.sin(ang) * r, () => { a.act = 'build'; a.face = [cx, cz]; a.wait = rnd(6, 12); }); }]);
    if (of('parade').length) opts.push([4 + 3 * (1 - t.drill), () => {
      const p = pick(of('parade')), i = Math.floor(rnd(0, 12));
      this.go(a, p.x + 0.6 + (i % 4) * (p.w - 1.2) / 3, p.z + 0.6 + Math.floor(i / 4) * (p.d - 1.2) / 2, () => { a.act = 'drill'; a.face = null; a.yaw = Math.PI * 0.5 * p.rot; a.wait = rnd(10, 18); });
    }]);
    if (of('seflag').length) opts.push([2.5, () => { const f = pick(of('seflag')), [x, z] = this.front(f, rnd(1.2, 2.4), rnd(-1.2, 1.2)); this.go(a, x, z, () => { a.act = 'salute'; a.face = this.centre(f); a.wait = rnd(3, 5); }); }]);
    if (of('potty').length) opts.push([1.5, () => { const p = pick(of('potty')), [x, z] = this.front(p, 0.5, 0); this.go(a, x, z, () => { a.act = 'inside'; a.hidden = true; a.wait = rnd(3, 6); }); }]);
    if (of('flag').length) opts.push([1, () => { const f = pick(of('flag')), [x, z] = this.front(f, rnd(1.2, 2.2), rnd(-1, 1)); this.go(a, x, z, () => { a.act = 'salute'; a.face = this.centre(f); a.wait = rnd(3, 5); }); }]);
    if (of('vend').length) opts.push([3, () => { const v = pick(of('vend')), [x, z] = this.front(v, 0.6, rnd(-0.3, 0.3)); this.go(a, x, z, () => { a.act = 'drink'; a.face = this.centre(v); a.wait = rnd(3, 6); }); }]);
    for (const type of ['mess', 'hab', 'barracks', 'hq', 'dome']) if (of(type).length) opts.push([type === 'mess' ? 3 : 1.5, () => {
      const b = pick(of(type)), [x, z] = this.doorOf(b); this.go(a, x, z, () => { a.act = 'inside'; a.hidden = true; a.wait = rnd(6, 14); });
    }]);
    for (const type of ['statue', 'pool', 'billboard', 'speaker', 'banner']) if (of(type).length) opts.push([1.2, () => {
      const b = pick(of(type)), [x, z] = this.front(b, rnd(0.8, 1.8), rnd(-1, 1)); this.go(a, x, z, () => { a.act = 'look'; a.face = this.centre(b); a.wait = rnd(3, 6); });
    }]);
    if (of('memorial').length && s.fallen.length) opts.push([1.5, () => { const m = pick(of('memorial')), [x, z] = this.front(m, 1, rnd(-1, 1)); this.go(a, x, z, () => { a.act = 'mourn'; a.face = this.centre(m); a.wait = rnd(4, 7); }); }]);
    opts.push([1, () => { const [x, z] = this.near(a.x + rnd(-6, 6), a.z + rnd(-6, 6)); this.go(a, x + 0.5, z + 0.5, () => { a.act = 'idle'; a.wait = rnd(1, 4); }); }]);
    let sum = opts.reduce((p, o) => p + o[0], 0), r = Math.random() * sum;
    for (const [w, f] of opts) { r -= w; if (r <= 0) { f(); return; } }
  }

  update(dt) {
    this.t += dt;
    const s = this.sim;
    this.flightsUpdate(dt); this.liftsUpdate(dt);
    if (this.cleaner) { const c = this.actors.get(this.cleaner); if (!c || c.task !== 'free') this.cleaner = null; }
    if (this.ceremony) { this.ceremony.t -= dt; if (this.ceremony.t <= 0 || !s.byId(this.ceremony.flag)) this.ceremony = null; }
    // troops: make sure everyone at home has a body, and nobody who left still does
    const hq = s.b.find(b => b.type === 'hq');
    for (const t of s.troops) {
      if (t.state === 'patrol' || this.hold.has(t.id) || this.actors.has(t.id)) continue;
      const [x, z] = hq ? this.doorOf(hq) : [this.N / 2, this.N / 2];
      this.person(t.id, 'troop', x + rnd(-0.5, 0.5), z + rnd(0, 0.5));
    }
    for (const [id, a] of this.actors) {
      if (a.kind === 'troop' && !s.troop(id)) { this.actors.delete(id); continue; }
      if (a.kind === 'inspector') { this.inspector(a, dt); continue; }
      const t = s.troop(id);
      if (a.leaving || a.returning) { if (this.move(a, dt * WALK) && a.then) { const f = a.then; a.then = null; f(); } continue; }
      if (t.state === 'patrol') continue;
      // the daily routine: a ceremony beats everything, then reveille, lights out and meals, then the job, then drill
      const jobB = t.state === 'job' && t.job ? s.byId(t.job) : null;   // a building can vanish between simulation steps
      const ph = s.time.phase, shift = jobB && SHIFT.has(jobB.type), flag = s.b.find(b => b.type === 'seflag');
      const want = this.ceremony ? 'cer' : ph === 'reveille' && flag ? 'cer'
        : ph === 'night' ? (shift ? 'job' + t.job : 'sleep')
        : ph === 'mess' ? (shift ? 'job' + t.job : 'mess')
        : jobB ? 'job' + t.job
        : ph === 'drill' && s.has('parade') ? 'drill' : 'free';
      if (a.task !== want) {
        a.task = want; a.hidden = false; a.wait = 0; a.face = null; a.onDone = null;
        if (want.startsWith('job')) {
          const b = jobB, slot = s.troops.filter(o => o.job === t.job).indexOf(t);
          const [x, z] = this.front(b, 0.5, (slot - 1) * 0.5);
          this.go(a, x, z, () => { a.act = 'work'; a.face = this.centre(b); });
        } else if (want === 'cer') {
          const c = this.ceremony, f = (c && s.byId(c.flag)) || flag || s.b.find(o => o.type === 'hq'), hero = c && id === c.hero;
          const [x, z] = hero ? this.front(f, 1.1, 0) : this.slot(f, c ? 'medal' + c.hero : 'rev' + s.time.day, id);
          this.go(a, x, z, () => { a.act = 'salute'; a.face = this.centre(f); });
        } else if (want === 'sleep') this.toBed(a);
        else if (want === 'mess') this.toMess(a);
        else if (want === 'drill') {
          const p = pick(s.b.filter(b => b.type === 'parade' && b.done)), i = Math.floor(rnd(0, 12));
          this.go(a, p.x + 0.6 + (i % 4) * (p.w - 1.2) / 3, p.z + 0.6 + Math.floor(i / 4) * (p.d - 1.2) / 2, () => { a.act = 'drill'; a.face = null; a.yaw = Math.PI * 0.5 * p.rot; });
        } else { a.act = 'idle'; a.wait = rnd(0.5, 2); }
      }
      if (a.act === 'walk') { if (this.move(a, dt * WALK) && a.then) { const f = a.then; a.then = null; f(); } continue; }
      if (want === 'free') {
        a.wait -= dt;
        if (a.wait <= 0) { if (a.onDone) { a.onDone(); a.onDone = null; } a.hidden = false; a.act = 'idle'; this.idleTask(a, t); }
      }
      if (a.face) a.yaw = Math.atan2(a.face[0] - a.x, a.face[1] - a.z);
    }
  }
  // a place in the formation on the flag plaza: rows of two per open tile, nearest the flag first;
  // when the plaza is full, the rest stand round the edge, which the inspector notices
  slot(f, key, id) {
    if (!this.form || this.form.key !== key) {
      const pz = this.sim.plaza(), [fx, fz] = this.front(f, 0.6, 0);
      const tiles = pz ? pz.tiles.slice().sort((a, b) => Math.hypot(a[0] + 0.5 - fx, a[1] + 0.5 - fz) - Math.hypot(b[0] + 0.5 - fx, b[1] + 0.5 - fz)) : [];
      this.form = { key, tiles, taken: new Map() };
    }
    const F = this.form; if (!F.taken.has(id)) F.taken.set(id, F.taken.size);
    const i = F.taken.get(id), tile = F.tiles[Math.floor(i / 2)];
    if (tile) return [tile[0] + (i % 2 ? 0.72 : 0.28), tile[1] + 0.5];
    const [cx, cz] = this.centre(f), ang = i * 2.4, r = 6 + (i % 3) * 0.6;
    const [x, z] = this.near(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r); return [x + 0.5, z + 0.5];
  }
  toBed(a) {   // each night everyone finds a bunk; with none left they sleep outdoors by the HQ
    const s = this.sim, homes = s.b.filter(b => b.done && HOUSING.includes(b.type));
    if (!this.beds || this.beds.day !== s.time.day) this.beds = { day: s.time.day, used: new Map() };
    const U = this.beds.used, home = homes.find(b => (U.get(b.id) || 0) < B[b.type].beds);
    if (home) { U.set(home.id, (U.get(home.id) || 0) + 1); const [x, z] = this.doorOf(home); this.go(a, x, z, () => { a.act = 'inside'; a.hidden = true; }); return; }
    const hq = s.b.find(b => b.type === 'hq') || s.b[0], [cx, cz] = this.centre(hq), ang = rnd(0, 6.28), [x, z] = this.near(cx + Math.cos(ang) * 4, cz + Math.sin(ang) * 4);
    this.go(a, x + rnd(0.2, 0.8), z + rnd(0.2, 0.8), () => { a.act = 'lie'; a.yaw = rnd(0, 6.28); });
  }
  toMess(a) {   // lunch: the mess first, then a franchise, then the vending machine, then nothing
    const s = this.sim, places = s.b.filter(b => b.done && EAT.includes(b.type)), vend = s.b.filter(b => b.done && b.type === 'vend');
    if (places.length) { const p = pick(places), [x, z] = this.doorOf(p); this.go(a, x, z, () => { a.act = 'inside'; a.hidden = true; }); }
    else if (vend.length) { const v = pick(vend), [x, z] = this.front(v, rnd(0.6, 1.6), rnd(-0.6, 0.6)); this.go(a, x, z, () => { a.act = 'drink'; a.face = this.centre(v); }); }
    else { a.act = 'idle'; }
  }

  inspector(a, dt) {
    if (a.act === 'walk') { if (this.move(a, dt * WALK * 0.8) && a.then) { const f = a.then; a.then = null; f(); } return; }
    a.wait -= dt;
    if (a.wait > 0) return;
    const next = a.stops.shift();
    if (next && this.sim.byId(next.id)) {
      const [x, z] = this.front(next, 1, rnd(-0.6, 0.6));
      this.go(a, x, z, () => { a.act = 'inspect'; a.face = this.centre(next); a.yaw = Math.atan2(a.face[0] - a.x, a.face[1] - a.z); a.wait = rnd(2.5, 4); });
    } else if (!a.homeward) { a.homeward = true; this.go(a, a.home[0], a.home[1], () => this.actors.delete(a.id)); }
  }
}
