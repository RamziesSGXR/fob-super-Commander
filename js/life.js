// The ant farm: everyone you can watch walking about. Troops go to work, drill, salute the flag, queue at the
// vending machine, train on the range, march out on patrol and come home, and board transports to the front;
// pelicans bring supplies and recruits; inspectors poke at things. Trucks and forklifts live in the simulation.
// It reads the simulation and never changes it. Positions are in tiles (a tile's centre is i + 0.5).
import { B, ROADS } from './config.js';

const WALK = 1.5, DRIVE = 2.4;
const SHIFT = new Set(['gen', 'motorpool']);   // these run round the clock, so their crews skip the routine
const HOUSING = ['hq', 'hab', 'barracks', 'block'];
const HD_PER = 4;   // Helldivers thawed and walking about per Helldiver Barracks
const EAT = ['mess', 'burger', 'chicken', 'cola'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

export class Life {
  constructor(sim) {
    this.sim = sim; this.N = sim.N;
    this.actors = new Map();      // id -> person (troops by their sim id, inspectors by negative ids)
    this.flights = []; this.queue = []; this.plans = [];
    this.hold = new Set();        // recruits still on the pelican
    this.ceremony = null; this.nextFake = -1; this.t = 0;
    this.gridKey = '';
    // a new base: the first pelican brings everyone down onto the landing zone beside the HQ
    if (sim.sweep && !sim.sweep.done && sim.sweep.t < 1) {
      const ids = sim.troops.map(t => t.id), hq = sim.b.find(b => b.type === 'hq'), [cx, cz] = hq ? this.centre(hq) : [this.N / 2, this.N / 2];
      for (const id of ids) this.hold.add(id);
      this.landing = true; this.queue.push({ kind: 'landing', ids, at: [cx + 4.5, cz + 2] });
    }
  }

  // ---------------------------------------------------------------- walking
  grid() { return this.sim.walkGrid(); }
  free(x, z) { const N = this.N; return x >= 0 && z >= 0 && x < N && z < N && this.grid()[z * N + x] === 1; }
  near(x, z) {   // the nearest walkable tile
    x = Math.floor(x); z = Math.floor(z);
    if (this.free(x, z)) return [x, z];
    for (let r = 1; r < 8; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++)
      if (Math.max(Math.abs(dx), Math.abs(dz)) === r && this.free(x + dx, z + dz)) return [x + dx, z + dz];
    return [Math.floor(this.N / 2), this.N - 2];
  }
  path(fx, fz, tx, tz) {
    const p = this.sim.pathTo(fx, fz, tx, tz); p.push([tx, tz]); return p;
  }
  // paths are worked out a few milliseconds' worth per frame, so a whole base changing activity at once doesn't freeze
  // the game: people set off a beat apart instead
  go(a, tx, tz, then) { a.path = []; a.then = then; a.act = 'plan'; a.goal = [tx, tz]; this.plans.push(a); }
  planPaths() {
    const t0 = performance.now();
    while (this.plans.length && performance.now() - t0 < 3) {
      const a = this.plans.shift(); if (a.act !== 'plan' || !a.goal) continue;
      a.path = this.path(a.x, a.z, a.goal[0], a.goal[1]); a.goal = null; a.act = 'walk';
    }
  }
  doorOf(b) { const [x, z] = this.sim.door(b); return [x + 0.5, z + 0.5]; }
  centre(b) { return [b.x + b.w / 2, b.z + b.d / 2]; }
  front(b, dist, side = 0) {   // a point in front of a building, dist tiles out, side tiles across
    const [cx, cz] = this.centre(b), f = [[0, 1], [1, 0], [0, -1], [-1, 0]][b.rot], h = b.rot % 2 ? b.w / 2 : b.d / 2;
    return [cx + f[0] * (h + dist) + f[1] * side, cz + f[1] * (h + dist) - f[0] * side];
  }
  out() { const g = this.sim.gate(); return [g.ox + rnd(-1, 1), g.oz + rnd(-1, 1)]; }
  inGate() { const g = this.sim.gate(); return [g.x + rnd(-1, 1), g.z + rnd(-1, 1)]; }

  person(id, kind, x, z) {
    const a = { id, kind, x, z, yaw: 0, path: [], act: 'idle', wait: 0, then: null, seed: Math.random() * 10, hidden: false, face: null };
    this.actors.set(id, a); return a;
  }

  // ---------------------------------------------------------------- events from the simulation
  event(e) {
    const s = this.sim;
    if (e.t === 'patrolOut') {   // the leader takes his squad aside and gives them the plan
      const b = s.byId(e.at) || s.b.find(o => o.type === 'hq'), [lx, lz] = this.front(b, 1.6, 0), [cx, cz] = this.centre(b);
      const n = e.members.length - 1;
      e.members.forEach((id, i) => {
        let a = this.actors.get(id);
        if (!a) { const [x, z] = this.doorOf(b); a = this.person(id, 'troop', x, z); }
        a.hidden = false; a.leaving = true; a.briefing = e.id; a.task = 'brief';
        if (id === e.leader) { this.go(a, lx, lz, () => { a.act = 'inspect'; a.face = [lx + (lx - cx), lz + (lz - cz)]; }); return; }
        // a half circle in front of the leader, facing him
        const k = n > 1 ? (i - 1) / (n - 1) - 0.5 : 0, ang = Math.atan2(lz - cz, lx - cx) + k * 2.2;
        const x = lx + Math.cos(ang) * 1.1, z = lz + Math.sin(ang) * 1.1;
        this.go(a, x, z, () => { a.act = 'idle'; a.face = [lx, lz]; });
      });
    }
    if (e.t === 'patrolGo') {   // plan given: they move out together, in a column behind the leader
      const order = [e.leader, ...e.members.filter(id => id !== e.leader)], g = this.sim.gate();
      order.forEach((id, i) => {
        const a = this.actors.get(id); if (!a) return;
        a.briefing = null; a.leaving = true; a.face = null;
        const col = (i % 2) * 0.7 - 0.35, row = Math.floor(i / 2) * 0.7;
        this.go(a, g.x + col, g.z, () => { a.path = [[g.gx + col, g.gz], [g.ox + col, g.oz + row]]; a.act = 'walk'; a.then = () => this.actors.delete(id); });
        a.delay = i * 0.35;
      });
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
    if (e.t === 'supply') { for (const id of e.fresh) this.hold.add(id); for (const p of e.pads || [{ ids: e.fresh }]) this.queue.push({ kind: 'supply', ids: p.ids, pad: p.id }); }
    if (e.t === 'deploy') {   // the shipped troopers walk to the pad and board the transport
      for (const p of e.pads || [{ ids: e.ids }]) {
        if (!p.ids.length) continue;
        const [px, pz] = this.landAt(p.id);
        p.ids.forEach((id, i) => { const a = this.actors.get(id); if (!a) return; a.boarding = true; a.hidden = false; this.go(a, px - 1 + (i % 4) * 0.5, pz + 1.6 + Math.floor(i / 4) * 0.5, () => { a.act = 'salute'; a.face = [px, pz]; }); });
        this.queue.push({ kind: 'deploy', ids: p.ids, pad: p.id });
      }
    }
    if (e.t === 'inspector') this.queue.push({ kind: 'inspector' });
  }
  startCeremony(hero) {
    const flag = this.sim.b.find(b => b.type === 'seflag') || this.sim.b.find(b => b.type === 'flag' && b.done) || this.sim.b.find(b => b.type === 'hq');
    if (flag) this.ceremony = { t: 26, flag: flag.id, hero, slots: new Map() };
  }

  // ---------------------------------------------------------------- pelicans
  pad(id) { const pads = this.sim.b.filter(b => b.type === 'pad' && b.done); return pads.find(b => b.id === id) || pads[0]; }
  landAt(id) { const p = this.pad(id); return p ? this.centre(p) : [this.N / 2, this.N - 4]; }
  flightsUpdate(dt) {
    // one pelican per pad at a time; pads work side by side
    for (let i = 0; i < this.queue.length; i++) {
      const job = this.queue[i], p = job.at ? null : this.pad(job.pad), key = job.at ? 'lz' : p ? p.id : 0;
      if (this.flights.some(f => f.padKey === key)) continue;
      this.queue.splice(i--, 1);
      const [lx, lz] = job.at || this.landAt(key), from = rnd(0, Math.PI * 2);
      this.flights.push({ ...job, padKey: key, lx, lz, from, ph: 'in', k: -rnd(0, 1.5), wait: 0, x: lx + Math.cos(from) * 40, z: lz + Math.sin(from) * 40, y: 14, yaw: from + Math.PI });
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
        if (this.flightDone(f) || f.k > 45) { f.ph = 'up'; f.k = 0; if (f.kind === 'deploy') for (const id of f.ids) this.actors.delete(id); }
      } else if (f.ph === 'up') {
        const u = Math.min(1, f.k / 6), e = u * u;
        f.y = 0.05 + e * 16; f.x = f.lx - Math.cos(f.from) * 40 * e; f.z = f.lz - Math.sin(f.from) * 40 * e;
        if (u >= 1) f.ph = 'gone';
      }
    }
    this.flights = this.flights.filter(f => f.ph !== 'gone');
  }
  landed(f) {
    const s = this.sim;
    if (f.kind === 'landing') {   // the detachment and the engineers jump down and fan out
      f.ids.forEach((id, i) => { this.hold.delete(id); if (s.troop(id) && !this.actors.has(id)) this.person(id, 'troop', f.lx - 0.8 + (i % 4) * 0.5, f.lz + 1.2 + Math.floor(i / 4) * 0.5); });
      this.landing = false; this.lzAt = [f.lx, f.lz];
    }
    if (f.kind === 'supply') f.ids.forEach((id, i) => {
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
  }
  flightDone(f) {
    if (f.kind === 'supply' || f.kind === 'landing') return f.k > 5;
    if (f.kind === 'deploy') return f.k > 3 && f.ids.every(id => { const a = this.actors.get(id); return !a || (!a.path.length && a.act !== 'plan'); });
    if (f.kind === 'inspector') return f.k > 6 && !this.actors.has(f.inspector);
    return true;
  }

  // ---------------------------------------------------------------- moving along a path; true on arrival
  move(a, step) {
    const N = this.N, r = this.sim.roads, tx = Math.floor(a.x), tz = Math.floor(a.z);
    if (tx >= 0 && tz >= 0 && tx < N && tz < N && r[tz * N + tx]) step *= ROADS[r[tz * N + tx]].walk;
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
    this.flightsUpdate(dt); this.planPaths();
    if (this.cleaner) { const c = this.actors.get(this.cleaner); if (!c || c.task !== 'free') this.cleaner = null; }
    if (this.ceremony) { this.ceremony.t -= dt; if (this.ceremony.t <= 0 || !s.byId(this.ceremony.flag)) this.ceremony = null; }
    // troops: make sure everyone at home has a body, and nobody who left still does
    const hq = s.b.find(b => b.type === 'hq');
    for (const t of s.troops) {
      if (t.state === 'patrol' || this.hold.has(t.id) || this.actors.has(t.id)) continue;
      const [x, z] = hq ? this.doorOf(hq) : [this.N / 2, this.N / 2];
      this.person(t.id, 'troop', x + rnd(-0.5, 0.5), z + rnd(0, 0.5));
    }
    this.extras(); this.engineers();
    for (const [id, a] of this.actors) {
      if (a.boarding) { if (a.act === 'walk' && this.move(a, dt * WALK) && a.then) { const f = a.then; a.then = null; f(); } continue; }
      if (a.kind === 'troop' && !s.troop(id)) { this.actors.delete(id); continue; }
      if (a.kind === 'inspector') { this.inspector(a, dt); continue; }
      if (a.extra === 'eng') { this.engineer(a, dt); continue; }
      if (a.extra) { this.extra(a, dt); continue; }
      const t = s.troop(id);
      if (a.delay > 0) { a.delay -= dt; continue; }
      if (a.leaving || a.returning) { if (a.act === 'walk' && this.move(a, dt * WALK) && a.then) { const f = a.then; a.then = null; f(); } continue; }
      if (t.state === 'patrol') continue;
      if (t.state === 'sweep') { this.sweeper(a, t, dt); continue; }
      // the daily routine: a ceremony beats everything, then reveille, lights out and meals, then the job, then drill
      const jobB = t.state === 'job' && t.job ? s.byId(t.job) : null;   // a building can vanish between simulation steps
      const ph = s.time.phase, shift = jobB && SHIFT.has(jobB.type), flag = s.b.find(b => b.type === 'seflag');
      // Reveille and Retreat: everyone outdoors stops where they stand, faces the nearest flag and salutes; indoors carries on
      const want = t.hurt > 0 ? 'ward' : this.ceremony ? 'cer' : (ph === 'reveille' || ph === 'retreat') && flag ? 'honors'
        : t.state === 'guard' ? 'guard' + t.gate
        : ph === 'firstcall' ? (shift ? 'job' + t.job : 'form')
        : ph === 'night' ? (shift ? 'job' + t.job : 'sleep')
        : ph === 'mess' || ph === 'chow' ? (shift ? 'job' + t.job : 'mess')
        : jobB ? 'job' + t.job
        : t.at && s.byId(t.at) ? 'train' + t.at
        : ph === 'pt' && s.has('parade') ? 'drill' : 'free';
      if (a.task !== want && want === 'honors') {
        a.task = want; a.goal = null; a.path = []; a.then = null; a.lap = null;
        if (a.hidden || a.act === 'plan') { if (a.act === 'plan') a.act = 'idle'; if (a.hidden) a.act = 'inside'; }   // indoors: no change
        else { a.act = 'salute'; a.face = this.nearestFlag(a); }
      }
      if (a.task !== want) {
        a.task = want; a.hidden = false; a.wait = 0; a.face = null; a.onDone = null;
        if (want.startsWith('job')) {
          const b = jobB, slot = s.troops.filter(o => o.job === t.job).indexOf(t);
          const [x, z] = this.front(b, 0.5, (slot - 1) * 0.5);
          this.go(a, x, z, () => { a.act = 'work'; a.face = this.centre(b); });
        } else if (want.startsWith('guard')) {   // on the gate, beside the barrier, watching the road in
          const g = s.gates[t.gate], m = s.gate(), c = g ? [g.x + (g.x - m.gx ? 0 : 0), g.z] : [m.x, m.z];
          const inx = g ? Math.sign(Math.round((s.N / 2 - g.x) / 4)) : 0, inz = g ? Math.sign(Math.round((s.N / 2 - g.z) / 4)) : -1;
          this.go(a, c[0] + inx * 1.2 + (inz ? 1.6 : 0), c[1] + inz * 1.2 + (inx ? 1.6 : 0), () => { a.act = 'idle'; a.face = [c[0] - inx * 6, c[1] - inz * 6]; });
        } else if (want === 'cer') {
          const c = this.ceremony, f = (c && s.byId(c.flag)) || flag || s.b.find(o => o.type === 'hq'), hero = c && id === c.hero;
          const [x, z] = hero ? this.front(f, 1.1, 0) : this.slot(f, c ? 'medal' + c.hero : 'rev' + s.time.day, id);
          this.go(a, x, z, () => { a.act = 'salute'; a.face = this.centre(f); });
        } else if (want.startsWith('train')) {
          const p = s.byId(t.at), slot = s.troops.filter(o => o.at === t.at).indexOf(t), kind = B[p.type].train;
          if (kind === 'lecture') { const [x, z] = this.doorOf(p); this.go(a, x, z, () => { a.act = 'inside'; a.hidden = true; }); }
          else if (kind === 'range') {   // a firing line along the front of the range, facing the targets
            const [x, z] = this.front(p, -0.55, (slot - 2.5) * (Math.max(p.w, p.d) - 0.8) / 6);
            this.go(a, x, z, () => { a.act = 'aim'; a.face = this.centre(p); });
          } else if (kind === 'course') { a.lap = p.id; a.act = 'run'; a.path = []; }
          else { const i = slot % 12; this.go(a, p.x + 0.6 + (i % 4) * (p.w - 1.2) / 3, p.z + 0.6 + Math.floor(i / 4) * (p.d - 1.2) / 2, () => { a.act = 'drill'; a.yaw = Math.PI * 0.5 * p.rot; }); }
        } else if (want === 'form') {   // First Call: out of the bunks and into a line in front of the quarters
          const homes = s.b.filter(b => b.done && HOUSING.includes(b.type)), h = homes.length ? homes.reduce((p, q) => Math.hypot(p.x - a.x, p.z - a.z) < Math.hypot(q.x - a.x, q.z - a.z) ? p : q) : null;
          if (h) { const n = (this.formN = (this.formN || 0) + 1) % 12, [x, z] = this.front(h, 0.9 + Math.floor(n / 6) * 0.45, (n % 6 - 2.5) * 0.42); this.go(a, x, z, () => { a.act = 'idle'; a.face = this.nearestFlag(a); }); }
          else { a.act = 'idle'; }
        } else if (want === 'ward') {   // the wounded go to the Medical Bay, or to their bunk if there isn't one
          const mb = s.b.find(b => b.done && b.type === 'medbay');
          if (mb) { const [x, z] = this.doorOf(mb); this.go(a, x, z, () => { a.act = 'inside'; a.hidden = true; }); } else this.toBed(a);
        } else if (want === 'sleep') this.toBed(a);
        else if (want === 'mess') this.toMess(a);
        else if (want === 'drill') {
          const p = pick(s.b.filter(b => b.type === 'parade' && b.done)), i = Math.floor(rnd(0, 12));
          this.go(a, p.x + 0.6 + (i % 4) * (p.w - 1.2) / 3, p.z + 0.6 + Math.floor(i / 4) * (p.d - 1.2) / 2, () => { a.act = 'drill'; a.face = null; a.yaw = Math.PI * 0.5 * p.rot; });
        } else { a.act = 'idle'; a.wait = rnd(0.5, 2); }
      }
      if (a.act === 'walk') { if (this.move(a, dt * WALK) && a.then) { const f = a.then; a.then = null; f(); } continue; }
      if (a.act === 'run' && a.lap) {   // laps of the obstacle course
        const p = s.byId(a.lap); if (!p) { a.lap = null; a.act = 'idle'; continue; }
        if (!a.path.length) { const c = [[p.x + 0.3, p.z + 0.3], [p.x + p.w - 0.3, p.z + 0.3], [p.x + p.w - 0.3, p.z + p.d - 0.3], [p.x + 0.3, p.z + p.d - 0.3]]; a.path = c.slice(Math.floor(a.seed) % 4).concat(c.slice(0, Math.floor(a.seed) % 4)); }
        this.move(a, dt * WALK * 1.4); continue;
      }
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
  nearestFlag(a) {
    const f = this.sim.b.filter(b => b.done && (b.type === 'seflag' || b.type === 'flag'));
    if (!f.length) return null;
    const b = f.reduce((p, q) => Math.hypot(p.x + 1 - a.x, p.z + 1 - a.z) < Math.hypot(q.x + 1 - a.x, q.z + 1 - a.z) ? p : q);
    return this.centre(b);
  }
  toBed(a) {   // each night everyone finds a bunk; with none left they sleep outdoors by the HQ
    const s = this.sim, homes = s.b.filter(b => b.done && HOUSING.includes(b.type));
    if (!this.beds || this.beds.day !== s.time.day) this.beds = { day: s.time.day, used: new Map() };
    const U = this.beds.used, home = homes.find(b => (U.get(b.id) || 0) < s.cap(b, 'beds'));
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

  // ---------------------------------------------------------------- engineers (0.13): three to a crew, in hard hats and hi-vis.
  // They work their crew's job (a building, an upgrade or a patch of scrub), drill at the yard while in training, knock off
  // at Taps and sleep at their yard, or at the HQ for the crews that landed with you
  engineers() {
    const s = this.sim, want = new Set();
    if (this.landing) return;
    for (const c of s.crews || []) for (let i = 0; i < c.men.length; i++) want.add(`en${c.id}_${i}`);
    for (const key of want) if (!this.actors.has(key)) {
      const [cid, i] = key.slice(2).split('_').map(Number), c = s.crews.find(c => c.id === cid), home = (c.yard && s.byId(c.yard)) || s.b.find(b => b.type === 'hq');
      const [x, z] = this.lzAt && s.t < 60 ? this.lzAt : home ? this.doorOf(home) : [this.N / 2, this.N / 2];
      const a = this.person(key, 'eng', x + rnd(-0.6, 0.6), z + rnd(0.6, 1.2)); a.extra = 'eng'; a.crew = cid; a.n = i;
    }
    for (const [id, a] of this.actors) if (a.extra === 'eng' && !want.has(id)) this.actors.delete(id);
  }
  // where an engineer should be: a tile of scrub, a spot round a building, the yard, or home
  engWant(a, c) {
    const s = this.sim, ph = s.time.phase;
    if (ph === 'night') return ['home'];
    if (c.wait > 0) return ['train'];
    if ((ph === 'reveille' || ph === 'retreat') && s.b.some(b => b.type === 'seflag')) return ['honors'];
    if (ph === 'mess' || ph === 'chow') return ['mess'];
    if (c.job == null || !s.secure()) return ['free'];
    if (c.job < 0) { const o = (s.clr || []).find(o => o.id === c.job); if (!o?.tiles.length) return ['free']; const i = o.tiles[Math.min(a.n, o.tiles.length - 1)]; return ['clr' + i, i]; }
    const b = s.byId(c.job); if (!b) return ['free'];
    if (b.clr?.length) { const i = b.clr[Math.min(a.n, b.clr.length - 1)]; return ['clr' + i, i]; }
    return ['site' + b.id, b];
  }
  engineer(a, dt) {
    const s = this.sim, c = s.crews?.find(c => c.id === a.crew); if (!c) return;
    const [want, arg] = this.engWant(a, c), home = (c.yard && s.byId(c.yard)) || s.b.find(b => b.type === 'hq');
    if (a.task !== want) {
      a.task = want; a.hidden = false; a.wait = 0; a.face = null; a.then = null;
      if (want === 'honors') { if (a.act === 'plan') a.act = 'idle'; a.act = 'salute'; a.face = this.nearestFlag(a); }
      else if (want === 'home' && home) { const [x, z] = this.doorOf(home); this.go(a, x, z, () => { a.act = 'inside'; a.hidden = true; }); }
      else if (want === 'mess') this.toMess(a);
      else if (want === 'train' && home) { const [x, z] = this.front(home, 1.0, (a.n - 1) * 0.5); this.go(a, x, z, () => { a.act = 'drill'; a.face = null; a.yaw = 0; }); }
      else if (want.startsWith('clr')) { const N = this.N, x = arg % N, z = (arg / N) | 0, [nx, nz] = this.near(x, z); this.go(a, nx + 0.5 + rnd(-0.2, 0.2), nz + 0.5 + rnd(-0.2, 0.2), () => { a.act = 'build'; a.face = [x + 0.5, z + 0.5]; }); }
      else if (want.startsWith('site')) {
        const b = arg, [cx, cz] = this.centre(b), ang = (a.n / 3) * Math.PI * 2 + (b.id % 7), r = Math.max(b.w, b.d) / 2 + 0.55;
        const [nx, nz] = this.near(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r);
        this.go(a, nx + 0.5, nz + 0.5, () => { a.act = 'build'; a.face = [cx, cz]; });
      } else { a.act = 'idle'; a.wait = rnd(0.5, 3); }
    }
    if (a.act === 'plan') return;
    if (a.act === 'walk') { if (this.move(a, dt * WALK) && a.then) { const f = a.then; a.then = null; f(); } return; }
    if (want === 'free') {   // between jobs: a smoke by the yard, a look at the plans, a walk round
      a.wait -= dt;
      if (a.wait <= 0) {
        const [hx, hz] = home ? this.front(home, rnd(0.8, 2), rnd(-1.5, 1.5)) : [a.x, a.z], [x, z] = this.near(hx, hz);
        this.go(a, x + 0.5, z + 0.5, () => { a.act = Math.random() < 0.5 ? 'look' : 'inspect'; a.face = home ? this.centre(home) : null; a.wait = rnd(5, 12); });
      }
    }
    if (a.face) a.yaw = Math.atan2(a.face[0] - a.x, a.face[1] - a.z);
  }
  // the landing sweep: each trooper takes a bearing and works outward from the HQ, stopping to scan the ground
  sweeper(a, t, dt) {
    const s = this.sim, sw = s.sweep; if (!sw) return;
    if (a.task !== 'sweep') { a.task = 'sweep'; a.hidden = false; a.sw = 0; a.wait = 0; a.act = 'idle'; }
    if (a.act === 'plan') return;
    if (a.act === 'walk') { if (this.move(a, dt * WALK) && a.then) { const f = a.then; a.then = null; f(); } return; }
    a.wait -= dt; if (a.wait > 0) { if (a.face) a.yaw = Math.atan2(a.face[0] - a.x, a.face[1] - a.z); return; }
    const hq = s.b.find(b => b.type === 'hq'), [cx, cz] = hq ? this.centre(hq) : [this.N / 2, this.N / 2];
    const k = Math.max(0, sw.team.indexOf(t.id)), n = Math.max(1, sw.team.length), u = Math.min(1, sw.t / sw.dur);
    const r = 5 + 13 * Math.sin(u * Math.PI), ang = (k / n) * Math.PI * 2 + a.sw * 0.5; a.sw++;
    const [x, z] = this.near(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r);
    this.go(a, x + 0.5, z + 0.5, () => { a.act = Math.random() < 0.6 ? 'aim' : 'look'; a.face = [cx + Math.cos(ang) * (r + 6), cz + Math.sin(ang) * (r + 6)]; a.wait = rnd(1.5, 3.5); });
  }

  // ---------------------------------------------------------------- Helldivers and citizens: people the Bureau doesn't bill you for
  // Helldivers live at their barracks and keep a Marine's day; citizens staff the counters and desks and keep office hours.
  extras() {
    const s = this.sim, want = new Set();
    for (const b of s.b) {
      if (!b.done) continue;
      const d = B[b.type];
      if (d.cryo && !b.off && s.power.ratio >= 0.5) for (let i = 0; i < HD_PER; i++) want.add(`hd${b.id}_${i}`);
      for (let i = 0; i < (d.staff || 0); i++) want.add(`cv${b.id}_${i}`);
    }
    for (const key of want) if (!this.actors.has(key)) {
      const hd = key[0] === 'h', home = +key.slice(2).split('_')[0], i = +key.split('_')[1], b = s.byId(home), [x, z] = this.doorOf(b);
      const a = this.person(key, hd ? 'hd' : 'civ' + ((home + i) % 3), x, z);
      a.extra = hd ? 'hd' : 'civ'; a.home = home; a.n = i; a.hidden = true; a.act = 'inside';
    }
    for (const [id, a] of this.actors) if ((a.extra === 'hd' || a.extra === 'civ') && !want.has(id)) this.actors.delete(id);   // engineers are engineers()'s to keep
  }
  extra(a, dt) {
    const s = this.sim, h = s.time.hour, ph = s.time.phase, b = s.byId(a.home); if (!b) return;
    const hd = a.extra === 'hd', flag = s.b.find(o => o.type === 'seflag');
    // Marines: reveille 05:30, PT, chow, Morning Colors at 08:00, training, Evening Colors, liberty, taps at 22:00
    // Citizens: in at 07:30, lunch, out at 17:30, the evening broadcast, home
    const colours = (ph === 'reveille' || ph === 'retreat' || (hd && h >= 8 && h < 8.25)) && flag;
    const want = this.ceremony && !a.hidden ? 'honors' : colours ? 'honors'
      : hd ? (h < 5.5 || h >= 22 ? 'home' : h < 7 ? 'pt' : h < 7.9 ? 'mess' : h < 11.5 ? 'train' : h < 12.5 ? 'mess' : h < 16.5 ? 'train' : h < 18 ? 'pt' : 'free')
      : (h < 7.5 || h >= 21 ? 'home' : h < 11.5 ? 'work' : h < 12.5 ? 'mess' : h < 17.5 ? 'work' : 'free');
    if (a.task !== want && want === 'honors') {
      a.task = want; a.goal = null; a.path = []; a.then = null; a.lap = null; a.wait = 0;
      if (a.act === 'plan') a.act = 'idle';
      if (!a.hidden) { a.act = hd ? 'salute' : 'heart'; a.face = this.ceremony ? this.centre(s.byId(this.ceremony.flag) || flag) : this.nearestFlag(a); }
    }
    if (a.task !== want) {
      a.task = want; a.hidden = false; a.wait = 0; a.face = null; a.lap = null;
      if (want === 'home') { const [x, z] = this.doorOf(b); this.go(a, x, z, () => { a.act = 'inside'; a.hidden = true; }); }
      else if (want === 'mess') this.toMess(a);
      else if (want === 'pt') {   // a squad run: laps of the obstacle course if there is one, otherwise round their own block
        const c = s.b.find(o => o.done && o.type === 'course') || b; a.lap = c.id; a.lapOut = c === b ? 1.3 : -0.3; a.act = 'run'; a.path = [];
      } else if (want === 'train') {
        const r = s.b.find(o => o.done && o.type === 'range'), p = s.b.find(o => o.done && o.type === 'parade');
        if (r && a.n % 2 === 0) { const [x, z] = this.front(r, -0.55, (a.n - 1.5) * 0.5 + 1.2); this.go(a, x, z, () => { a.act = 'aim'; a.face = this.centre(r); }); }
        else if (p) this.go(a, p.x + 0.8 + (a.n % 4) * 0.5, p.z + p.d - 0.7, () => { a.act = 'drill'; a.yaw = Math.PI * 0.5 * p.rot; });
        else { const [x, z] = this.front(b, 1.2, (a.n - 1.5) * 0.5); this.go(a, x, z, () => { a.act = 'drill'; a.yaw = 0; }); }
      } else if (want === 'work') {   // behind the counter most of the day, out front now and then
        const [x, z] = this.doorOf(b); this.go(a, x, z, () => { a.act = 'inside'; a.hidden = true; a.wait = rnd(20, 60); });
      } else { a.act = 'idle'; a.wait = rnd(0.5, 2); }
    }
    if (a.act === 'plan') return;
    if (a.act === 'walk') { if (this.move(a, dt * WALK) && a.then) { const f = a.then; a.then = null; f(); } return; }
    if (a.act === 'run' && a.lap) {
      const p = s.byId(a.lap); if (!p) { a.lap = null; a.act = 'idle'; return; }
      const o = a.lapOut ?? -0.3;
      if (!a.path.length) { const c = [[p.x - o, p.z - o], [p.x + p.w + o, p.z - o], [p.x + p.w + o, p.z + p.d + o], [p.x - o, p.z + p.d + o]]; a.path = c.slice(a.n % 4).concat(c.slice(0, a.n % 4)); }
      this.move(a, dt * WALK * 1.5); return;
    }
    if (want === 'work') {   // step outside for a moment: a smoke, a clipboard, a look at the sky
      a.wait -= dt;
      if (a.wait <= 0) {
        if (a.hidden) { a.hidden = false; const [x, z] = this.front(b, rnd(0.6, 1.4), rnd(-1, 1)); this.go(a, x, z, () => { a.act = Math.random() < 0.5 ? 'inspect' : 'look'; a.face = this.centre(b); a.wait = rnd(5, 10); }); }
        else { const [x, z] = this.doorOf(b); this.go(a, x, z, () => { a.act = 'inside'; a.hidden = true; a.wait = rnd(25, 70); }); }
      }
    }
    if (want === 'free') {
      a.wait -= dt;
      if (a.wait <= 0) {
        a.hidden = false;
        const done = s.b.filter(o => o.done), of = (...ts) => done.filter(o => ts.includes(o.type));
        // the evening broadcast draws a crowd; otherwise a drink, the flag, or a walk
        const tv = of('billboard', 'speaker', 'mast'), vend = of('vend'), r = Math.random();
        if (tv.length && r < (hd ? 0.25 : 0.55)) { const v = pick(tv), [x, z] = this.front(v, rnd(1, 2.4), rnd(-1.4, 1.4)); this.go(a, x, z, () => { a.act = 'look'; a.face = this.centre(v); a.wait = rnd(8, 16); }); }
        else if (vend.length && r < 0.75) { const v = pick(vend), [x, z] = this.front(v, 0.6, rnd(-0.3, 0.3)); this.go(a, x, z, () => { a.act = 'drink'; a.face = this.centre(v); a.wait = rnd(4, 7); }); }
        else if (flag && r < 0.88) { const [x, z] = this.front(flag, rnd(1.2, 2.4), rnd(-1.2, 1.2)); this.go(a, x, z, () => { a.act = hd ? 'salute' : 'heart'; a.face = this.centre(flag); a.wait = rnd(3, 5); }); }
        else { const [x, z] = this.near(a.x + rnd(-6, 6), a.z + rnd(-6, 6)); this.go(a, x + 0.5, z + 0.5, () => { a.act = 'idle'; a.wait = rnd(2, 5); }); }
      }
    }
    if (a.face) a.yaw = Math.atan2(a.face[0] - a.x, a.face[1] - a.z);
  }

  inspector(a, dt) {
    if (a.act === 'plan') return;
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
