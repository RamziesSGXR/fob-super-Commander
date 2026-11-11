// The simulation: the base, its troops, the three Ministries, the rival factions and the weekly allocation.
// No DOM and no 3D here, so it runs in Node for balance tests (test/headless.mjs).
import { C, B, MIN, CREW_ORDER, MISSIONS, OP_A, OP_B, RIVALS, SURNAMES, RANKS, PLANETS, FACTION_DEFAULT } from './config.js';
import { RNG } from './rng.js';
import { Noise } from './noise.js';

export const MKEYS = ['def', 'pro', 'tru'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r5 = v => Math.max(5, Math.round(v / 5) * 5);
const RATION = 5;   // supplies per trooper per week, paid with the upkeep

export function rankOf(missions) { let r = RANKS[0][1]; for (const [n, name] of RANKS) if (missions >= n) r = name; return r; }

// footprint after rotation, and which way the front faces (0 +z, 1 +x, 2 -z, 3 -x)
export function dims(type, rot) { const d = B[type]; return rot % 2 ? [d.d, d.w] : [d.w, d.d]; }

export class Sim {
  constructor(opts = {}) {
    if (opts.state) { this.load(opts.state); return; }
    this.seed = (opts.seed ?? (Date.now() & 0x7fffffff)) >>> 0;
    this.rng = new RNG(this.seed);
    this.N = C.N;
    this.t = 0; this.week = 1; this.wt = 0; this.inspected = false;
    this.faction = structuredClone(opts.faction || FACTION_DEFAULT);
    this.planet = this.faction.planet || this.rng.pick(PLANETS);
    this.supplies = C.START.supplies; this.e710 = 0; this.shells = 0;
    this.morale = C.START.morale; this.grief = 0; this.pride = 0;
    this.stand = { def: C.STAND.start, pro: C.STAND.start, tru: C.STAND.start };
    this.rivals = RIVALS.map((r, i) => ({ id: i + 1, name: r.name, motto: r.motto, logo: r.logo, w: r.w, stand: { def: 0, pro: 0, tru: 0 } }));
    this.rank = 2; this.lastAlloc = 0;
    this.b = []; this.nid = 1; this.troops = []; this.fallen = []; this.honours = [];
    this.patrols = []; this.offers = []; this.contracts = []; this.inspection = null;
    this.events = []; this.log = []; this.stats = { patrolsWon: 0, patrolsLost: 0, delivered: 0, inspections: 0 };
    this.genMap();
    this.updateRivals();
    const m = this.N / 2;
    this.place('hq', m - 2, m - 3, 0, true);
    this.place('pad', m + 3, m - 3, 0, true);
    this.place('hab', m - 6, m - 2, 0, true);
    this.place('seflag', m - 1, m + 1, 0, true);
    for (let i = 0; i < C.START.troops; i++) this.addTroop();
    this.newOffers(); this.newContract(true);
    this.ranking(); this.tick();
    this.say('base', `${this.faction.name} has landed on ${this.planet}. ${this.faction.base} is yours to build, Commander. ${C.START.troops} votes have been delivered to your base.`);
    this.say('pro', 'The Ministry of Expansion welcomes you. Your first requisition is posted. Do not be late.');
    this.recalc();
  }

  // ---------------------------------------------------------------- map
  genMap() {
    const N = this.N, rng = new RNG(this.seed ^ 0x9e3779b9), nz = new Noise(this.seed);
    this.dep = new Uint8Array(N * N);
    this.occ = new Int32Array(N * N);
    const blobs = [];
    // one deposit close to the start, the rest further out
    for (let i = 0; i < 5; i++) {
      for (let tries = 0; tries < 60; tries++) {
        const a = rng.angle(), d = i === 0 ? rng.range(6.5, 8.5) : rng.range(8, 15);
        const x = N / 2 + Math.cos(a) * d, z = N / 2 + Math.sin(a) * d;
        if (x < 4 || z < 4 || x > N - 5 || z > N - 6) continue;
        if (blobs.some(b => Math.hypot(b[0] - x, b[1] - z) < 7)) continue;
        blobs.push([x, z, rng.range(1.7, 2.5)]); break;
      }
    }
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
      for (const [bx, bz, r] of blobs) {
        const d = Math.hypot(x + 0.5 - bx, z + 0.5 - bz) + (nz.fbm(x * 0.4, z * 0.4) - 0.5) * 1.6;
        if (d < r) this.dep[z * N + x] = 1;
      }
    }
    this.blobs = blobs;
  }
  inside(x, z) { return x >= 1 && z >= 1 && x < this.N - 1 && z < this.N - 1; }
  road(x, z) { const m = this.N / 2; return x >= m - 2 && x <= m + 1 && z >= this.N - 5; }  // the road in from the gate
  gate() { return { x: this.N / 2, z: this.N - 1 }; }

  // ---------------------------------------------------------------- building
  has(type) { return this.b.some(b => b.type === type && b.done); }
  count(type) { return this.b.filter(b => b.type === type).length; }
  byId(id) { return this.b.find(b => b.id === id); }
  locked(type) { const n = (B[type].needs || []).filter(t => !this.has(t)); return n.length ? n : null; }

  canPlace(type, x, z, rot = 0) {
    const d = B[type]; if (!d) return { ok: false, why: 'Unknown building' };
    if (d.fixed) return { ok: false, why: 'Cannot be built' };
    if (d.unique && this.count(type)) return { ok: false, why: 'Only one allowed' };
    if (d.chain) { const other = this.b.find(b => B[b.type].chain && b.type !== type); if (other) return { ok: false, why: `Exclusive franchise agreement with ${B[other.type].name}` }; }
    const lk = this.locked(type); if (lk) return { ok: false, why: 'Needs ' + lk.map(t => B[t].name).join(' and ') };
    if (this.supplies < d.cost) return { ok: false, why: 'Not enough supplies' };
    return this.fits(type, x, z, rot);
  }
  fits(type, x, z, rot) {
    const [w, dd] = dims(type, rot); let dep = 0;
    for (let j = 0; j < dd; j++) for (let i = 0; i < w; i++) {
      const tx = x + i, tz = z + j;
      if (!this.inside(tx, tz)) return { ok: false, why: 'Outside the wire' };
      if (this.road(tx, tz)) return { ok: false, why: 'Keep the gate road clear' };
      if (this.occ[tz * this.N + tx]) return { ok: false, why: 'Something is in the way' };
      dep += this.dep[tz * this.N + tx];
    }
    if (B[type].onDeposit && dep < (w * dd) / 2) return { ok: false, why: 'Must sit on an E-710 deposit' };
    return { ok: true };
  }
  place(type, x, z, rot = 0, free = false) {
    const d = B[type];
    if (!free) { const c = this.canPlace(type, x, z, rot); if (!c.ok) return null; this.supplies -= d.cost; }
    const [w, dd] = dims(type, rot);
    const b = { id: this.nid++, type, x, z, rot, w, d: dd, cond: 100, prog: free ? 1 : 0, done: free, off: false, crew: 0, time: 6 + d.cost / 25 };
    for (let j = 0; j < dd; j++) for (let i = 0; i < w; i++) this.occ[(z + j) * this.N + x + i] = b.id;
    this.b.push(b);
    if (!free) this.events.push({ t: 'placed', id: b.id });
    return b;
  }
  raiseFlag() {   // the nearest clear spot to the middle of the base
    const m = this.N / 2; let best = null;
    for (let z = 1; z < this.N - 2; z++) for (let x = 1; x < this.N - 2; x++) {
      if (!this.fits('seflag', x, z, 0).ok) continue;
      const d = Math.hypot(x + 1 - m, z + 1 - m - 2); if (!best || d < best.d) best = { x, z, d };
    }
    if (best) this.place('seflag', best.x, best.z, 0, true);
  }
  demolish(id) {
    const b = this.byId(id); if (!b || B[b.type].fixed) return false;
    for (let j = 0; j < b.d; j++) for (let i = 0; i < b.w; i++) this.occ[(b.z + j) * this.N + b.x + i] = 0;
    this.b = this.b.filter(o => o !== b);
    this.supplies += Math.round(B[b.type].cost * (b.done ? C.REFUND : 1));
    for (const t of this.troops) if (t.job === id) { t.job = null; if (t.state === 'job') t.state = 'idle'; }
    if (this.cleaning === id) this.cleaning = null;
    this.events.push({ t: 'removed', id });
    return true;
  }
  repairCost(b) { return Math.ceil(B[b.type].cost * 0.25 * (1 - b.cond / 100)) + (b.cond < 100 ? 5 : 0); }
  repair(id) {
    const b = this.byId(id); if (!b || b.cond >= 100) return false;
    const c = this.repairCost(b); if (this.supplies < c) return false;
    this.supplies -= c; b.cond = 100; return true;
  }
  toggle(id) { const b = this.byId(id); if (b && (B[b.type].crew || B[b.type].pw < 0)) b.off = !b.off; }
  door(b) {   // the tile in front of a building, where people go in and out
    const cx = b.x + Math.floor(b.w / 2), cz = b.z + Math.floor(b.d / 2);
    return [[cx, b.z + b.d], [b.x + b.w, cz], [cx, b.z - 1], [b.x - 1, cz]][b.rot];
  }

  // ---------------------------------------------------------------- troops
  addTroop() {
    const t = { id: this.nid++, name: `${'ABCDEFGHJKLMNPRSTVW'[this.rng.int(19)]}. ${this.rng.pick(SURNAMES)}`, missions: 0, medals: 0, drill: 0, job: null, state: 'idle' };
    this.troops.push(t); return t;
  }
  troop(id) { return this.troops.find(t => t.id === id); }

  // ---------------------------------------------------------------- the state of the base, worked out fresh each step
  recalc() {
    const done = this.b.filter(b => b.done);
    let made = 0, used = 0, beds = 0, depots = 0, sheds = 0;
    for (const b of done) {
      const d = B[b.type];
      if (d.beds) beds += d.beds;
      if (b.type === 'depot') depots++;
      if (b.type === 'shed') sheds++;
      if (b.off) continue;
      if (d.pw < 0) used -= d.pw;
    }
    // crew: keep troops where they are if they're still needed, then fill in priority order
    const need = new Map();
    for (const b of done) if (B[b.type].crew && !b.off) need.set(b.id, B[b.type].crew);
    for (const b of done) b.crew = 0;
    const home = this.troops.filter(t => t.state !== 'patrol');
    for (const t of home) {
      if (t.job && need.get(t.job) > 0) { need.set(t.job, need.get(t.job) - 1); this.byId(t.job).crew++; }
      else t.job = null;
    }
    const free = home.filter(t => !t.job);
    for (const type of CREW_ORDER) for (const b of done) {
      if (b.type !== type) continue;
      while (need.get(b.id) > 0 && free.length) { const t = free.shift(); t.job = b.id; b.crew++; need.set(b.id, need.get(b.id) - 1); }
    }
    for (const t of home) t.state = t.job ? 'job' : 'idle';
    // power after crew, since a generator needs its crew and its fuel
    for (const b of done) {
      const d = B[b.type]; if (b.off || !(d.pw > 0)) continue;
      if (b.type === 'gen') made += d.pw * this.crewFrac(b) * (this.e710 > 0.01 ? 1 : 0) * this.condF(b);
      else made += d.pw;
    }
    this.power = { made: Math.round(made), used, ratio: used > 0 ? Math.min(1, made / used) : 1 };
    this.beds = beds; this.cap = C.STORE.base + C.STORE.depot * depots + C.STORE.shed * sheds;
    this.idle = home.filter(t => t.state === 'idle').length;
    // propaganda and morale, each kind worth less the more of it you already have, so variety pays
    const seen = {}; let prop = 0, comfort = 0;
    for (const b of done) {
      const d = B[b.type], n = (seen[b.type] = (seen[b.type] || 0) + 1), dim = Math.pow(0.7, n - 1), cf = this.condF(b);
      const run = d.crew ? this.crewFrac(b) * (b.off ? 0 : 1) : 1;
      if (d.prop) prop += d.prop * dim * cf * (d.crew ? 0.4 + 0.6 * run : 1) * (d.pw < 0 ? 0.5 + 0.5 * this.power.ratio : 1);
      if (d.mor) comfort += d.mor * dim * cf * run * (d.potty ? (b.clean ?? 100) / 100 : 1);
    }
    this.prop = Math.round(100 * (1 - Math.exp(-prop / 55)));
    const noisy = done.filter(b => B[b.type].noise && !b.off && b.crew > 0);
    let noise = 0;
    for (const h of done) if (B[h.type].beds) for (const p of noisy)
      if (Math.hypot(h.x + h.w / 2 - p.x - p.w / 2, h.z + h.d / 2 - p.z - p.d / 2) < B[p.type].noise) { noise++; break; }
    const worn = done.length ? done.filter(b => b.cond < 40).length / done.length : 0;
    const over = Math.max(0, this.troops.length - beds);
    const pots = done.filter(b => B[b.type].potty), users = home.length;
    const filthy = pots.filter(b => (b.clean ?? 100) < 25).length, queue = pots.length ? Math.max(0, users / pots.length - 10) : (users > 8 ? users - 8 : 0);
    this.potties = { n: pots.length, filthy, perPotty: pots.length ? users / pots.length : users };
    this.mor = {
      base: 40,
      comfort: Math.round(30 * (1 - Math.exp(-comfort / 22))),
      prop: Math.round(this.prop * 0.12),
      pride: Math.round(this.pride),
      noise: -Math.min(20, noise * 6),
      crowd: -Math.min(25, over * 4),
      power: -Math.round(15 * (1 - this.power.ratio)),
      grief: -Math.round(this.grief),
      worn: -Math.round(12 * worn),
      latrine: -Math.min(12, Math.round(filthy * 4 + queue * 0.8)),
      plaza: (() => { const p = this.plaza(); return p && p.need > p.cap ? -Math.min(10, Math.ceil((p.need - p.cap) / 3)) : 0; })(),
    };
    this.moraleTarget = clamp(Object.values(this.mor).reduce((a, b) => a + b, 0), 0, 100);
    this.avgCond = done.length ? done.reduce((a, b) => a + b.cond, 0) / done.length : 100;
  }
  crewFrac(b) { const c = B[b.type].crew; return c ? b.crew / c : 1; }
  condF(b) { return b.cond < 40 ? 0.5 : b.cond < 70 ? 0.85 : 1; }
  work(b) {   // how hard a building runs right now, 0..1+
    const d = B[b.type]; if (!b.done || b.off) return 0;
    const pw = d.pw < 0 ? this.power.ratio : 1;
    const slow = this.b.some(o => o.done && B[o.type].sluggish) ? 1 - B.chicken.sluggish : 1;
    return this.crewFrac(b) * pw * this.condF(b) * (0.6 + 0.8 * this.morale / 100) * slow;
  }

  // ---------------------------------------------------------------- the clock
  step(dt) {
    this.t += dt; this.wt += dt;
    const k = dt / C.T;   // economy time: production, wear and morale run on the old 150 s week's scale
    this.recalc();
    for (const b of this.b) if (!b.done) {
      const helpers = Math.min(3, this.idle);
      b.prog += dt / (b.time * C.BUILD) * (0.4 + 0.2 * helpers);
      if (b.prog >= 1) { b.prog = 1; b.done = true; this.events.push({ t: 'built', id: b.id }); this.say('base', `${B[b.type].name} complete.`); }
    }
    for (const b of this.b) {
      if (!b.done) continue;
      const d = B[b.type], w = this.work(b);
      if (b.type === 'pump') this.e710 = Math.min(this.cap, this.e710 + d.make * w * k);
      else if (b.type === 'gen' && !b.off) this.e710 = Math.max(0, this.e710 - d.burn * this.crewFrac(b) * k);
      else if (b.type === 'plant' && w > 0) {
        const can = Math.min(d.use * w * k, this.e710, (this.cap - this.shells) / d.out * d.use);
        if (can > 0) { this.e710 -= can; this.shells += can / d.use * d.out; }
        b.running = can > 0;
      }
    }
    const pots = this.b.filter(b => b.done && B[b.type].potty);
    if (pots.length) {
      const users = this.troops.length - this.troops.filter(t => t.state === 'patrol').length;
      for (const p of pots) p.clean = Math.max(0, (p.clean ?? 100) - k * 0.012 * users / pots.length);
      // one idle trooper is always on latrine duty if anyone is free; they scrub the dirtiest one
      const worst = pots.reduce((a, b) => (a.clean ?? 100) < (b.clean ?? 100) ? a : b);
      this.cleaning = this.idle > 0 && worst.clean < 70 ? worst.id : null;
      if (this.cleaning) worst.clean = Math.min(100, worst.clean + k * 0.9);
    } else this.cleaning = null;
    this.morale += (this.moraleTarget - this.morale) * Math.min(1, k * 0.03);
    this.grief *= Math.exp(-k / 220); this.pride *= Math.exp(-k / 260);
    if (this.has('parade')) for (const t of this.troops) if (t.state === 'idle') t.drill = Math.min(1, t.drill + k * 0.004);
    for (const p of this.patrols) { p.t += dt / C.PATROL; }
    this.tick();
    for (const p of this.patrols.filter(p => p.t >= p.dur)) this.resolve(p);
    if (!this.inspected && this.wt >= C.WEEK * C.INSPECT_AT) this.inspect();
    if (this.wt >= C.WEEK) this.endWeek();
  }

  // ---------------------------------------------------------------- the clock: a week of seven days, starting at 06:00
  tick() {
    const days = this.wt / C.DAY + 0.25, d = Math.floor(days), tod = days - d, h = tod * 24;
    const phase = h < 5 || h >= 22 ? 'night' : h < 8 ? 'reveille' : h < 11.5 ? 'drill' : h < 13 ? 'mess' : h < 20 ? 'work' : 'evening';
    if (this.time && phase !== this.time.phase) this.events.push({ t: 'phase', phase });
    this.time = { day: (this.week - 1) * 7 + d + 1, hour: h, tod, phase, weekday: d };
  }

  // ---------------------------------------------------------------- the flag plaza: open ground round the Super Earth flag
  plazaAt(x, z, ignore = 0) {   // free tiles within four of a 2x2 flag at (x, z)
    const out = [];
    for (let j = z - 4; j < z + 6; j++) for (let i = x - 4; i < x + 6; i++) {
      if (i >= x && i < x + 2 && j >= z && j < z + 2) continue;
      if (!this.inside(i, j)) continue;
      const o = this.occ[j * this.N + i]; if (o && o !== ignore) continue;
      out.push([i, j]);
    }
    return out;
  }
  plaza() {
    const f = this.b.find(b => b.type === 'seflag'); if (!f) return null;
    const tiles = this.plazaAt(f.x, f.z), need = this.troops.length - this.troops.filter(t => t.state === 'patrol').length;
    return { flag: f, tiles, cap: tiles.length * 2, need };
  }
  canMoveFlag(x, z) {
    const f = this.b.find(b => b.type === 'seflag'); if (!f) return { ok: false, why: 'No flag' };
    if (this.supplies < C.FLAGMOVE) return { ok: false, why: `Moving the flag costs ${C.FLAGMOVE} supplies` };
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const tx = x + i, tz = z + j, o = this.inside(tx, tz) ? this.occ[tz * this.N + tx] : -1;
      if (o === -1) return { ok: false, why: 'Outside the wire' };
      if (this.road(tx, tz)) return { ok: false, why: 'Keep the gate road clear' };
      if (o && o !== f.id) return { ok: false, why: 'Something is in the way' };
    }
    const cap = this.plazaAt(x, z, f.id).length * 2, need = this.troops.length;
    if (cap < Math.min(need, 120)) return { ok: false, why: `Not enough open ground: the plaza holds ${cap}, you have ${need} votes` };
    return { ok: true };
  }
  moveFlag(x, z) {
    const c = this.canMoveFlag(x, z); if (!c.ok) return c;
    const f = this.b.find(b => b.type === 'seflag');
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) this.occ[(f.z + j) * this.N + f.x + i] = 0;
    f.x = x; f.z = z;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) this.occ[(z + j) * this.N + x + i] = f.id;
    this.supplies -= C.FLAGMOVE; this.events.push({ t: 'moved', id: f.id });
    this.say('base', 'The Super Earth flag has been moved, with ceremony. The base centre moves with it.');
    return { ok: true };
  }

  // ---------------------------------------------------------------- Ministry of Defence: patrols
  newOffers() {
    this.offers = [];
    const used = new Set();
    for (let i = 0; i < 3; i++) {
      let m; do { m = this.rng.pick(MISSIONS); } while (used.has(m.kind)); used.add(m.kind);
      const diff = m.diff[0] + this.rng.int(m.diff[1] - m.diff[0] + 1) + (this.week > 6 && this.rng.chance(0.3) ? 1 : 0);
      const size = m.size[0] + this.rng.int(m.size[1] - m.size[0] + 1);
      this.offers.push({ id: this.nid++, op: `Operation ${this.rng.pick(OP_A)} ${this.rng.pick(OP_B)}`, kind: m.kind, diff: Math.min(5, diff), size,
        dur: Math.round(this.rng.range(m.dur[0], m.dur[1])), def: 4 + diff * 3, sup: diff * 40 });
    }
  }
  squadFor(size) {   // idle troops first, then from the least important jobs
    const home = this.troops.filter(t => t.state !== 'patrol');
    const order = t => t.job ? 10 - CREW_ORDER.indexOf(this.byId(t.job)?.type) : 100;
    return home.sort((a, b) => order(b) - order(a) || b.missions - a.missions).slice(0, size);
  }
  chance(o, squad = this.squadFor(o.size)) {
    if (squad.length < o.size) return 0;
    const vet = squad.reduce((a, t) => a + Math.min(1, t.missions / 6), 0) / squad.length;
    const drill = squad.reduce((a, t) => a + t.drill, 0) / squad.length;
    const arm = this.b.some(b => b.type === 'armory' && b.done && b.crew > 0 && !b.off) ? 0.1 : 0;
    return clamp(0.64 + 0.15 * vet + 0.15 * drill + 0.2 * (this.morale - 50) / 50 + arm + 0.03 * (o.size - 2) - 0.1 * o.diff, 0.05, 0.97);
  }
  send(offerId) {
    const o = this.offers.find(o => o.id === offerId); if (!o) return false;
    const squad = this.squadFor(o.size); if (squad.length < o.size) return false;
    const p = { ...o, id: this.nid++, t: 0, chance: this.chance(o, squad), members: squad.map(t => t.id) };
    for (const t of squad) { t.state = 'patrol'; t.job = null; }
    this.patrols.push(p); this.offers = this.offers.filter(x => x !== o);
    this.events.push({ t: 'patrolOut', members: p.members });
    this.say('def', `${p.op} is under way: ${p.kind.toLowerCase()}, ${p.size} troopers. Odds ${Math.round(p.chance * 100)}%.`);
    return true;
  }
  resolve(p) {
    this.patrols = this.patrols.filter(x => x !== p);
    const win = this.rng.chance(p.chance), dead = [], back = [];
    for (const id of p.members) {
      const t = this.troop(id); if (!t) continue;
      if (this.rng.chance(win ? 0.04 * p.diff : 0.11 * p.diff)) dead.push(t); else back.push(t);
    }
    if (back.length === 0 && dead.length) { back.push(dead.pop()); }   // somebody always makes it back to tell it
    for (const t of dead) {
      this.troops = this.troops.filter(x => x !== t);
      this.fallen.push({ name: t.name, rank: rankOf(t.missions), op: p.op, week: this.week });
      this.grief += this.has('memorial') ? 3 : 6;
    }
    if (dead.length) this.say('bur', `Form C-14 issued for ${dead.map(t => `${rankOf(t.missions)} ${t.name}`).join(', ')}. The Bureau thanks the family for their contribution and reminds them that the uniform remains Federation property.`);
    let hero = null;
    for (const t of back) { t.state = 'idle'; t.missions++; }
    if (win) {
      this.gain('def', p.def); this.supplies += p.sup; this.stats.patrolsWon++;
      if (this.rng.chance(0.35 + 0.08 * p.diff)) {
        hero = this.rng.pick(back); hero.medals++; this.pride += 5;
        this.honours.push({ name: hero.name, rank: rankOf(hero.missions), op: p.op, week: this.week });
      }
      this.say('def', `${p.op}: success. +${p.def} Defence standing, +${p.sup} supplies.` + (dead.length ? ` We lost ${dead.map(t => t.name).join(', ')}.` : ''));
      if (hero) this.say('def', `${rankOf(hero.missions)} ${hero.name} is awarded the Medal of Valour. All votes will assemble at the Super Earth flag.`);
    } else {
      this.gain('def', -(2 + p.diff)); this.stats.patrolsLost++;
      this.say('def', `${p.op}: failed. -${2 + p.diff} Defence standing.` + (dead.length ? ` Fallen: ${dead.map(t => t.name).join(', ')}.` : ''));
    }
    this.events.push({ t: 'patrolBack', members: back.map(t => t.id), dead: dead.map(t => t.name), hero: hero?.id ?? null, win });
  }

  // ---------------------------------------------------------------- Ministry of Expansion: requisitions
  newContract(first = false) {
    const good = first ? 'e710' : this.rng.chance(this.has('plant') ? 0.6 : 0.25) ? 'shells' : 'e710';
    const qty = good === 'shells' ? r5(15 + this.week * 5) : r5(20 + this.week * 6);
    this.contracts.push({ id: this.nid++, good, qty, due: this.week + 2, pro: Math.round(10 + qty / 8), sup: qty * (good === 'shells' ? 3 : 2) });
  }
  deliver(id) {
    const c = this.contracts.find(c => c.id === id); if (!c) return false;
    if (!this.has('pad') || this[c.good] < c.qty - 1e-6) return false;
    this[c.good] -= c.qty;
    this.contracts = this.contracts.filter(x => x !== c);
    this.gain('pro', c.pro); this.supplies += c.sup; this.stats.delivered++;
    this.events.push({ t: 'pickup', good: c.good, qty: c.qty });
    this.say('pro', `Requisition filled: ${c.qty} ${c.good === 'shells' ? 'shells' : 'E-710'}. +${c.pro} Expansion standing, +${c.sup} supplies.`);
    return true;
  }

  // ---------------------------------------------------------------- Ministry of Truth: inspections
  inspect() {
    this.inspected = true; this.recalc();
    const score = Math.round(0.35 * this.morale + 0.45 * this.prop + 0.2 * this.avgCond);
    const before = this.stand.tru;
    this.stand.tru = clamp(this.stand.tru + (score - this.stand.tru) * 0.6, 0, 100);
    const notes = [];
    if (this.prop < 30) notes.push('The inspector could not find a single slogan at eye level.');
    else if (this.prop > 70) notes.push('Propaganda density is commendable. The inspector saluted twice.');
    if (this.morale < 45) notes.push('Several votes were seen frowning in an unauthorised manner.');
    else if (this.morale > 75) notes.push('Morale is radiant. Several votes sang unprompted.');
    if (this.avgCond < 60) notes.push('Several structures appear to be held together by optimism.');
    if (this.troops.length > this.beds) notes.push('Votes are sleeping outdoors. The Ministry finds this photogenic but concerning.');
    const pz = this.plaza(); if (pz && pz.need > pz.cap) notes.push('At the morning salute, votes were standing in the flowerbeds. The plaza is too small for the base.');
    if (this.potties.filthy) notes.push('The latrines were described in the report as "a matter for the Ministry of Science".');
    else if (!this.potties.n && this.troops.length > 8) notes.push('The inspector asked where the latrines were. Nobody would say.');
    if (!notes.length) notes.push('Adequate. The Ministry expects more than adequate.');
    this.inspection = { week: this.week, score, morale: Math.round(this.morale), prop: this.prop, cond: Math.round(this.avgCond), notes, delta: Math.round(this.stand.tru - before) };
    this.stats.inspections++;
    this.events.push({ t: 'inspector' });
    this.say('tru', `Inspection complete: ${score}/100. Truth standing ${this.inspection.delta >= 0 ? '+' : ''}${this.inspection.delta}. ${notes[0]}`);
  }

  // ---------------------------------------------------------------- the week, and the other factions
  updateRivals() {
    for (const r of this.rivals) for (const m of MKEYS) {
      const target = 28 + r.w[m] * (22 + Math.min(42, this.week * 2.8)) + this.rng.range(-6, 6);
      r.stand[m] = clamp(r.stand[m] ? r.stand[m] + (target - r.stand[m]) * 0.5 : target, 0, 100);
    }
    // now and then a rival has a very good week
    if (this.week > 1 && this.rng.chance(0.35)) {
      const r = this.rng.pick(this.rivals), m = MKEYS.reduce((a, k) => r.w[k] > r.w[a] ? k : a, 'def');
      r.stand[m] = clamp(r.stand[m] + 14, 0, 100);
      const what = { def: 'a decisive victory in the field', pro: 'a record munitions shipment', tru: 'a flawless inspection' }[m];
      this.say('riv', `Federation bulletin: ${r.name} reports ${what}. ${r.motto}`);
    }
  }
  total(s) { return Math.round(s.def + s.pro + s.tru); }
  table() {
    const rows = [{ me: true, name: this.faction.name, logo: this.faction.logo, stand: this.stand }, ...this.rivals.map(r => ({ me: false, name: r.name, logo: r.logo, stand: r.stand }))];
    return rows.sort((a, b) => this.total(b.stand) - this.total(a.stand));
  }
  ranking() { this.rank = this.table().findIndex(r => r.me); return this.rank; }

  endWeek() {
    for (const c of this.contracts.filter(c => this.week >= c.due)) {
      this.contracts = this.contracts.filter(x => x !== c);
      this.gain('pro', -8);
      this.say('pro', `Requisition for ${c.qty} ${c.good === 'shells' ? 'shells' : 'E-710'} missed. -8 Expansion standing. Disappointment has been noted.`);
    }
    if (!this.inspected) this.inspect();
    for (const m of MKEYS) this.stand[m] += (C.STAND.rest - this.stand[m]) * C.STAND.drift;
    this.updateRivals();
    const prev = this.rank, rank = this.ranking();
    const amt = Math.round(C.ALLOC.base * C.ALLOC.mult[rank]);
    this.supplies += amt; this.lastAlloc = amt;
    const gross = Math.round(amt / 0.82), fee = Math.round(gross * 0.11);
    this.ledger = { week: this.week, gross, fee, consult: gross - fee - amt, net: amt };
    for (const b of this.b) if (b.done && B[b.type].cryo && !b.off && b.crew > 0 && this.power.ratio >= 1) { this.gain('def', 3); this.say('def', 'Helldivers thawed, briefed and shipped to the front. +3 Defence standing.'); }
    for (const b of this.b) if (b.done && B[b.type].kickback) { this.supplies += B[b.type].kickback; this.say('bur', `Bureau Cola & Fries remits a consulting fee of ${B[b.type].kickback} supplies. Please do not ask what was consulted.`); }
    this.events.push({ t: 'alloc', amt, crates: 6 - rank });
    const room = Math.max(0, this.beds + C.OVERFLOW - this.troops.length);
    const n = Math.min(C.ALLOC.recruits[rank], room), fresh = [];
    for (let i = 0; i < n; i++) fresh.push(this.addTroop().id);
    if (fresh.length) this.events.push({ t: 'recruits', ids: fresh });
    // upkeep: what you can't pay for wears out
    const built = this.b.filter(b => b.done), rations = this.troops.length * RATION, bill = built.reduce((a, b) => a + B[b.type].up, 0) + rations;
    this.supplies -= Math.min(this.supplies, rations);
    let unpaid = 0;
    if (this.supplies >= bill - rations) { this.supplies -= bill - rations; for (const b of built) b.cond = Math.min(100, b.cond + C.MAINT - C.WEAR); }
    else {
      for (const b of this.rng.shuffle(built.slice())) {
        if (this.supplies >= B[b.type].up) { this.supplies -= B[b.type].up; b.cond = Math.min(100, b.cond + C.MAINT - C.WEAR); }
        else { b.cond = Math.max(5, b.cond - C.UNPAID); unpaid++; }
      }
    }
    const place = ['1st', '2nd', '3rd', '4th'][rank];
    this.say('base', `Week ${this.week} closes. ${this.faction.name} ranks ${place} of 4: allocation ${amt} supplies` + (fresh.length ? `. ${fresh.length} vote${fresh.length > 1 ? 's have' : ' has'} been delivered to your base` : '') + `. Upkeep and rations ${bill}.`);
    if (unpaid) this.say('base', `Upkeep short: ${unpaid} building${unpaid > 1 ? 's' : ''} went unmaintained and are wearing down.`);
    if (rank < prev) this.say('riv', `Federation bulletin: ${this.faction.name} climbs to ${place}. Glory to the efficient.`);
    else if (rank > prev) this.say('riv', `Federation bulletin: ${this.table()[prev].name} overtakes ${this.faction.name}. Allocation reduced accordingly.`);
    this.memo();
    this.week++; this.wt -= C.WEEK; this.inspected = false;
    this.newOffers();
    if (this.contracts.length < 3) this.newContract();
    this.events.push({ t: 'week', rank, amt });
  }

  gain(m, v) { this.stand[m] = clamp(this.stand[m] + (v > 0 ? v * (1 - this.stand[m] / 115) : v), 0, 100); return Math.round(v > 0 ? v * (1 - (this.stand[m]) / 115) : v); }

  memo() {   // the Bureau writes every week, always pleased, never quite clear
    const lines = [
      `Memo: the Bureau congratulates ${this.faction.base} on a week of measurable progress. The measurements are classified.`,
      'Memo: a reminder that all supplies remain the property of the Bureau until consumed, and partly afterwards.',
      'Memo: the Presidential Office for Base Excellence thanks you for your continued participation in its funding.',
      `Memo: ${this.troops.length} votes on file. The Bureau is grateful for every one of them, especially on election day.`,
      'Memo: Form 27-B (Request to Read Previous Memos) is now available from the Bureau, for a small fee.',
      'Memo: the Bureau has reviewed its own audit and found everything in order.',
      'Memo: allocations are calculated by a fair and transparent process. Details are available on request, by appointment, in person, on Super Earth.',
      'Memo: morale is mandatory. Paperwork about morale is also mandatory.',
    ];
    this.say('bur', lines[(this.week + this.seed) % lines.length]);
  }

  say(ch, text) { this.log.push({ ch, text, t: this.t, week: this.week }); if (this.log.length > 80) this.log.shift(); this.events.push({ t: 'say', ch, text }); }
  drain() { const e = this.events; this.events = []; return e; }

  // ---------------------------------------------------------------- saving
  save() {
    const o = {};
    for (const k of Object.keys(this)) if (!['rng', 'events', 'dep', 'occ', 'mor', 'power'].includes(k)) o[k] = this[k];
    o.rngS = this.rng.s; o.v = 2;
    return JSON.parse(JSON.stringify(o));
  }
  load(s) {
    Object.assign(this, structuredClone(s));
    if (!s.v || s.v < 2) { this.wt *= C.T; for (const p of this.patrols || []) { p.t *= 1; } }
    this.rng = new RNG(1); this.rng.s = s.rngS; this.events = [];
    this.genMap();
    for (const b of this.b) for (let j = 0; j < b.d; j++) for (let i = 0; i < b.w; i++) this.occ[(b.z + j) * this.N + b.x + i] = b.id;
    if (!this.b.some(b => b.type === 'seflag')) this.raiseFlag();
    this.recalc(); this.tick();
  }
}
