// The simulation: the base, its troops, its supply lines, the three Ministries, the rival factions and the week.
// No DOM and no 3D here, so it runs in Node for balance tests (test/headless.mjs).
//
// The base is a training and staging camp. Recruits arrive with the daily supply pelican, train at the range, the
// obstacle course, the parade ground and the Citizenship Hall, and Defence's deployment orders ship the trained ones
// to the front. Rations, fuel and ammo arrive by pelican every morning, billed automatically, and forklifts and trucks
// carry them along your roads to where they are used. Nothing needs a click to keep moving.
import { C, B, MIN, CREW_ORDER, MISSIONS, OP_A, OP_B, RIVALS, SURNAMES, RANKS, PLANETS, FACTION_DEFAULT, GOODS, GKEYS, ROADS, VEHICLES, TRAIN, TECH } from './config.js';
import { RNG } from './rng.js';
import { findPath } from './path.js';
import { emptyNet, raster, addLine, snap, nearestSeg, removeSeg, segLen, lineTiles, node, KINDS } from './net.js';

export const MKEYS = ['def', 'pro', 'tru'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FAST = [1, ROADS[1].speed, ROADS[2].speed];

export function rankOf(missions) { let r = RANKS[0][1]; for (const [n, name] of RANKS) if (missions >= n) r = name; return r; }

// footprint after rotation, and which way the front faces (0 +z, 1 +x, 2 -z, 3 -x)
export function dims(type, rot) { const d = B[type]; return rot % 2 ? [d.d, d.w] : [d.w, d.d]; }

const zero = () => ({ rations: 0, fuel: 0, ammo: 0 });

export class Sim {
  constructor(opts = {}) {
    if (opts.state) { this.load(opts.state); return; }
    this.seed = (opts.seed ?? (Date.now() & 0x7fffffff)) >>> 0;
    this.rng = new RNG(this.seed);
    this.N = C.N;
    this.t = 0; this.week = 1; this.wt = 0; this.inspected = false;
    this.faction = structuredClone(opts.faction || FACTION_DEFAULT);
    this.planet = this.faction.planet || this.rng.pick(PLANETS);
    this.supplies = C.START.supplies;
    this.morale = C.START.morale; this.grief = 0; this.pride = 0; this.hunger = 0;
    this.stand = { def: C.STAND.start, pro: C.STAND.start, tru: C.STAND.start };
    this.rivals = RIVALS.map((r, i) => ({ id: i + 1, name: r.name, motto: r.motto, logo: r.logo, w: r.w, stand: { def: 0, pro: 0, tru: 0 } }));
    this.rank = 2; this.lastAlloc = 0; this.recruitAcc = 0;
    this.b = []; this.nid = 1; this.troops = []; this.fallen = []; this.honours = [];
    this.patrols = []; this.offers = []; this.orders = []; this.inspection = null; this.veh = [];
    this.events = []; this.log = []; this.audit = null; this.bill = null;
    this.tech = { done: [], cur: null, pts: 0 };
    this.stats = { patrolsWon: 0, patrolsLost: 0, deployed: 0, trained: 0, inspections: 0, delivered: 0 };
    this.week_ = { short: 0, total: 0, fed: 0, eat: 0 };   // this week's supply record, for the Expansion audit
    this.genMap();
    this.updateRivals();
    const m = this.N / 2;
    this.place('hq', m - 3, m - 3, 0, true);
    this.place('pad', m + 3, m - 3, 0, true);
    this.place('hab', m - 8, m - 2, 0, true);
    this.place('seflag', m - 5, m + 2, 0, true);
    // the starting wall, and a paved road in from the edge of the map through the gate, with a branch to the HQ and the pad
    this.startNet([]);
    this.rebuildNet();
    const hq = this.b.find(b => b.type === 'hq'); hq.stock = { ...B.hq.store };
    for (let i = 0; i < C.START.troops; i++) this.addTroop(i < 3 ? 100 : 30);
    this.newOffers(); this.newOrder();
    this.ranking(); this.tick();
    this.say('base', `${this.faction.name} has landed on ${this.planet}. ${this.faction.base} is yours to build, Commander. ${C.START.troops} votes have been delivered to your base.`);
    this.say('def', 'The Ministry of Defence expects trained troopers. Train your recruits; transports leave from the landing pad every afternoon.');
    this.recalc();
  }

  // ---------------------------------------------------------------- map
  genMap() {
    const N = this.N;
    this.occ = new Int32Array(N * N);
    if (!this.roads) this.roads = new Uint8Array(N * N);
    if (!this.walls) this.walls = new Uint8Array(N * N);
    if (!this.inMask) this.inMask = new Uint8Array(N * N);
  }
  // the wall round the starting box, plus the road in. extra: [[ax, az, bx, bz, kind, width]] lines to add
  startNet(extra) {
    const N = this.N, o = (N - C.BOX) / 2, lo = o + 0.5, hi = o + C.BOX - 0.5, m = N / 2;
    this.net = emptyNet();
    const line = (ax, az, bx, bz, k, w) => addLine(this.net, snap(this.net, { x: ax, z: az }, 'free', w), snap(this.net, { x: bx, z: bz }, 'free', w), k, w);
    line(lo, lo, hi, lo, 'wall'); line(hi, lo, hi, hi, 'wall'); line(hi, hi, lo, hi, 'wall'); line(lo, hi, lo, lo, 'wall');
    if (!extra.length) {
      line(m + 1, N, m + 1, m - 4, 'paved', 2);
      line(m - 1.5, m + 0.5, m + 4.5, m + 0.5, 'paved', 1);
    }
    for (const [ax, az, bx, bz, k, w] of extra) line(ax, az, bx, bz, k, w);
  }
  rebuildNet() {
    const r = raster(this.net, this.N);
    this.roads = r.roads; this.walls = r.walls; this.inMask = r.inside; this.gates = r.gates; this.area = r.area;
    this.roadsV = (this.roadsV || 0) + 1; this.events?.push({ t: 'roads' });
  }
  inside(x, z) { return x >= 0 && z >= 0 && x < this.N && z < this.N && this.inMask[z * this.N + x] === 1; }
  road(x, z) { return x >= 0 && z >= 0 && x < this.N && z < this.N && this.roads[z * this.N + x] > 0; }
  // the main gate: the one nearest the bottom of the map. x, z: just inside it; ox, oz: off the edge of the map beyond it
  gate() {
    const N = this.N, gs = this.gates || [];
    if (!gs.length) return { x: N / 2, z: N / 2 + C.BOX / 2 - 2, ox: N / 2, oz: N + 5, gx: N / 2, gz: N / 2 + C.BOX / 2 };
    const g = gs.reduce((p, q) => q.z > p.z ? q : p);
    let cx = 0, cz = 0, n = 0; for (let i = 0; i < N * N; i++) if (this.inMask[i]) { cx += i % N; cz += (i / N) | 0; n++; }
    cx = n ? cx / n + 0.5 : N / 2; cz = n ? cz / n + 0.5 : N / 2;
    const dx = g.x - cx, dz = g.z - cz, ax = Math.abs(dx) > Math.abs(dz), sx = ax ? Math.sign(dx) : 0, sz = ax ? 0 : Math.sign(dz) || 1;
    const far = ax ? (sx > 0 ? N - g.x : g.x) : (sz > 0 ? N - g.z : g.z);
    return { x: g.x - sx * 1.5, z: g.z - sz * 1.5, ox: g.x + sx * (far + 5), oz: g.z + sz * (far + 5), gx: g.x, gz: g.z };
  }
  walkGrid() {   // where people and vehicles can go: anywhere on the map that isn't a building or a wall; gates are open
    if (this._walkV === this.layoutV()) return this._walk;
    const N = this.N, w = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) w[i] = !this.occ[i] && this.walls[i] !== 1 ? 1 : 0;
    this._walk = w; this._walkV = this.layoutV(); return w;
  }
  layoutV() { return this.b.length * 7919 + this.nid * 31 + (this.roadsV || 0); }
  pathTo(sx, sz, ex, ez) {
    const N = this.N, w = this.walkGrid(), cl = v => Math.max(0, Math.min(N - 1, Math.floor(v)));
    let [ax, az] = [cl(sx), cl(sz)], [bx, bz] = this.nearWalk(cl(ex), cl(ez));
    if (!w[az * N + ax]) [ax, az] = this.nearWalk(ax, az);
    // many people walk the same routes (bunks to the flag, the mess to the range): remember them until the layout changes
    if (this._pathV !== this._walkV) { this._paths = new Map(); this._pathV = this._walkV; }
    const key = ((az * N + ax) * N + bz) * N + bx, hit = this._paths.get(key);
    if (hit) return hit.map(p => [p[0], p[1]]);
    const p = findPath(N, w, this.roads, FAST, ax, az, bx, bz) || [[bx + 0.5, bz + 0.5]];
    if (this._paths.size > 4000) this._paths.clear();
    this._paths.set(key, p.map(q => [q[0], q[1]]));
    return p;
  }
  nearWalk(x, z) {
    const w = this.walkGrid(), N = this.N;
    if (w[z * N + x]) return [x, z];
    for (let r = 1; r < 8; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, nz = z + dz;
      if (Math.max(Math.abs(dx), Math.abs(dz)) === r && nx >= 0 && nz >= 0 && nx < N && nz < N && w[nz * N + nx]) return [nx, nz];
    }
    return [N / 2, N - 2];
  }

  // ---------------------------------------------------------------- roads and walls: one line tool
  roadPrice(type) { return type === 2 && this.hasTech('asphalt') ? Math.ceil(ROADS[2].cost / 2) : ROADS[type].cost; }
  linePrice(k) { return k === 'wall' ? C.WALL : this.roadPrice(KINDS[k].surf) * (k === 'paved' ? 2 : 1); }   // per tile of length; paved is two wide
  snapLine(p, mode, k, from) { return snap(this.net, p, mode, KINDS[k].w, from); }
  // can this line go here, and what does it cost? a: snapped start, b: snapped end
  checkLine(a, b, k) {
    const len = Math.hypot(b.x - a.x, b.z - a.z), cost = Math.ceil(len) * this.linePrice(k);
    if (len < 0.9) return { ok: false, why: 'Too short', cost };
    if (a.x < 0 || a.z < 0 || b.x < 0 || b.z < 0 || a.x > this.N || a.z > this.N || b.x > this.N || b.z > this.N) return { ok: false, why: 'Off the map', cost };
    for (const [x, z] of lineTiles(this.N, a.x, a.z, b.x, b.z, KINDS[k].w)) if (this.occ[z * this.N + x]) return { ok: false, why: 'A building is in the way', cost };
    if (this.supplies < cost) return { ok: false, why: 'Not enough supplies', cost };
    return { ok: true, cost };
  }
  drawLine(a, b, k) {
    const c = this.checkLine(a, b, k); if (!c.ok) return null;
    const s = addLine(this.net, a, b, k); if (!s) return null;
    this.supplies -= c.cost; this.rebuildNet(); return s;
  }
  removeLine(x, z) {
    const s = nearestSeg(this.net, x, z); if (!s) return null;
    this.supplies += Math.floor(Math.ceil(segLen(this.net, s)) * this.linePrice(s.k) / 2);
    removeSeg(this.net, s.id); this.rebuildNet(); return s;
  }
  lineAt(x, z) { return nearestSeg(this.net, x, z); }

  // ---------------------------------------------------------------- building
  has(type) { return this.b.some(b => b.type === type && b.done); }
  count(type) { return this.b.filter(b => b.type === type).length; }
  byId(id) { return this.b.find(b => b.id === id); }
  // what still stands between you and a building, as names: buildings, research, or another Comms Tower for a pad
  locked(type) {
    const d = B[type], n = (d.needs || []).filter(t => !this.has(t)).map(t => B[t].name);
    if (d.tech && !this.hasTech(d.tech)) n.push(TECH[d.tech].name + ' research');
    if (d.pad && this.count('pad') >= this.padCap()) n.push(this.has('comms') || this.count('comms') ? 'another Comms Tower' : 'a Comms Tower');
    return n.length ? n : null;
  }
  padCap() { return 1 + this.count('comms') * (this.hasTech('radio') ? 3 : 2); }
  padLoad() { return C.PADLOAD + (this.hasTech('cargo') ? 60 : 0); }
  padSeats() { return C.PADSEATS + (this.hasTech('cargo') ? 4 : 0); }
  hasTech(k) { return !!this.tech?.done.includes(k); }
  techState(k) {
    if (this.hasTech(k)) return 'done';
    if (this.tech.cur === k) return 'busy';
    return (TECH[k].needs || []).every(t => this.hasTech(t)) ? 'open' : 'locked';
  }
  research(k) {
    if (!TECH[k] || this.techState(k) !== 'open' || this.tech.cur) return false;
    if (!this.b.some(b => b.type === 'lab' && b.done)) return false;
    if (this.supplies < TECH[k].cost) return false;
    this.supplies -= TECH[k].cost; this.tech.cur = k; this.tech.pts = 0;
    this.say('base', `The Science Lab begins work on ${TECH[k].name}. Results in about ${TECH[k].hrs} lab hours.`);
    return true;
  }
  labRate() { return this.b.filter(b => b.type === 'lab' && b.done && !b.off).reduce((a, b) => a + this.work(b), 0); }
  study(dt) {
    const k = this.tech.cur; if (!k) return;
    this.tech.pts += this.labRate() * dt / C.DAY * 24;
    if (this.tech.pts < TECH[k].hrs) return;
    this.tech.done.push(k); this.tech.cur = null; this.tech.pts = 0;
    this.events.push({ t: 'tech', k });
    this.say('base', `Research complete: ${TECH[k].name}. ${TECH[k].desc} The scientists have been thanked and reassigned.`);
  }

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
    const [w, dd] = dims(type, rot);
    for (let j = 0; j < dd; j++) for (let i = 0; i < w; i++) {
      const tx = x + i, tz = z + j;
      if (!this.inside(tx, tz)) return { ok: false, why: this.area ? 'Outside the wall' : 'The wall is open: close it to build' };
      if (this.occ[tz * this.N + tx]) return { ok: false, why: 'Something is in the way' };
      if (this.roads[tz * this.N + tx]) return { ok: false, why: 'There is a road here' };
    }
    return { ok: true };
  }
  place(type, x, z, rot = 0, free = false) {
    const d = B[type];
    if (!free) { const c = this.canPlace(type, x, z, rot); if (!c.ok) return null; this.supplies -= d.cost; }
    const [w, dd] = dims(type, rot);
    const b = { id: this.nid++, type, x, z, rot, w, d: dd, cond: 100, prog: free ? 1 : 0, done: free, off: false, crew: 0, time: 6 + d.cost / 25, stock: zero() };
    if (d.squads) b.squads = d.squads;
    for (let j = 0; j < dd; j++) for (let i = 0; i < w; i++) this.occ[(z + j) * this.N + x + i] = b.id;
    this.b.push(b);
    if (!free) this.events.push({ t: 'placed', id: b.id });
    this.roadsV = (this.roadsV || 0) + 1;   // roadside lamps step around new buildings
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
    for (const t of this.troops) { if (t.job === id) { t.job = null; if (t.state === 'job') t.state = 'idle'; } if (t.at === id) t.at = null; }
    for (const v of this.veh) if (v.job && (v.job.src === id || v.job.dst === id)) this.dropJob(v);
    this.veh = this.veh.filter(v => v.home !== id);
    if (this.cleaning === id) this.cleaning = null;
    this.events.push({ t: 'removed', id }); this.roadsV++;
    return true;
  }
  repairCost(b) { return Math.ceil(B[b.type].cost * 0.25 * (1 - b.cond / 100)) + (b.cond < 100 ? 5 : 0); }
  repair(id) {
    const b = this.byId(id); if (!b || b.cond >= 100) return false;
    const c = this.repairCost(b); if (this.supplies < c) return false;
    this.supplies -= c; b.cond = 100; return true;
  }
  toggle(id) { const b = this.byId(id); if (b && (B[b.type].crew || B[b.type].pw < 0)) b.off = !b.off; }
  setSquads(id, n) { const b = this.byId(id); if (b && B[b.type].squads) b.squads = clamp(n, 0, 3); }
  door(b) {   // the tile in front of a building, where people go in and out
    const cx = b.x + Math.floor(b.w / 2), cz = b.z + Math.floor(b.d / 2);
    return [[cx, b.z + b.d], [b.x + b.w, cz], [cx, b.z - 1], [b.x - 1, cz]][b.rot];
  }

  // ---------------------------------------------------------------- troops
  addTroop(train = 0) {
    const t = { id: this.nid++, name: `${'ABCDEFGHJKLMNPRSTVW'[this.rng.int(19)]}. ${this.rng.pick(SURNAMES)}`, missions: 0, medals: 0, drill: 0, train, job: null, at: null, state: 'idle' };
    this.troops.push(t); return t;
  }
  troop(id) { return this.troops.find(t => t.id === id); }
  trained(t) { return t.train >= 100; }

  // ---------------------------------------------------------------- goods: who stores what, who needs what
  storeCap(b, g) { return b.done && B[b.type].store ? Math.floor((B[b.type].store[g] || 0) * (this.hasTech('shelving') ? 1.25 : 1)) : 0; }
  needCap(b, g) { return b.done && !b.off && B[b.type].need ? B[b.type].need[g] || 0 : 0; }
  stored(g) { return this.b.reduce((a, b) => a + (this.storeCap(b, g) ? b.stock[g] : 0), 0); }
  storage(g) { return this.b.reduce((a, b) => a + this.storeCap(b, g), 0); }
  onPad(g) { return this.b.reduce((a, b) => a + (B[b.type].pad ? b.stock[g] : 0), 0); }
  inUse(g) { return this.b.reduce((a, b) => a + (this.needCap(b, g) ? b.stock[g] : 0), 0); }
  carried(g) { return this.veh.reduce((a, v) => a + (v.load && v.job?.g === g ? v.load : 0), 0); }
  amount(g) { return this.stored(g) + this.onPad(g) + this.inUse(g) + this.carried(g); }
  // goods used per day at the current rate, for the Expansion panel
  usage() {
    const u = zero(); u.rations = this.troops.length - this.troops.filter(t => t.state === 'patrol').length;
    for (const b of this.b) { const d = B[b.type]; if (b.done && !b.off && d.burn) for (const g in d.burn) u[g] += d.burn[g] * (b.type === 'gen' ? this.crewFrac(b) : 1); }
    for (const b of this.b) if (b.type === 'range' && b.done) u.ammo += 0.5 * 10.5 * Math.min(B.range.slots, this.troops.filter(t => t.at === b.id).length || B.range.slots / 2);
    u.ammo += this.b.filter(b => b.type === 'patrol' && b.done).reduce((a, b) => a + (b.squads || 0) * 4, 0);
    return u;
  }

  // ---------------------------------------------------------------- the state of the base, worked out fresh each step
  recalc() {
    const done = this.b.filter(b => b.done);
    let made = 0, used = 0, beds = 0;
    for (const b of done) {
      const d = B[b.type];
      if (d.beds) beds += d.beds;
      if (b.off) continue;
      if (d.pw < 0) used -= d.pw;
    }
    // crew: keep troops where they are if they're still needed, then fill in priority order, trained troopers first,
    // so recruits stay free to train
    const need = new Map();
    for (const b of done) if (B[b.type].crew && !b.off) need.set(b.id, B[b.type].crew);
    for (const b of done) b.crew = 0;
    const home = this.troops.filter(t => t.state !== 'patrol');
    for (const t of home) {
      if (t.job && need.get(t.job) > 0) { need.set(t.job, need.get(t.job) - 1); this.byId(t.job).crew++; }
      else t.job = null;
    }
    const free = home.filter(t => !t.job).sort((a, b) => b.train - a.train);
    for (const type of CREW_ORDER) for (const b of done) {
      if (b.type !== type) continue;
      while (need.get(b.id) > 0 && free.length) { const t = free.shift(); t.job = b.id; b.crew++; need.set(b.id, need.get(b.id) - 1); }
    }
    for (const t of home) { t.state = t.job ? 'job' : 'idle'; if (t.job) t.at = null; }
    // power after crew, since a generator needs its crew and its fuel
    for (const b of done) {
      const d = B[b.type]; if (b.off || !(d.pw > 0)) continue;
      if (b.type === 'gen') made += d.pw * this.crewFrac(b) * (b.stock.fuel > 0.01 ? 1 : 0) * this.condF(b);
      else made += d.pw + (b.type === 'solar' && this.hasTech('solar') ? 2 : 0);
    }
    this.power = { made: Math.round(made), used, ratio: used > 0 ? Math.min(1, made / used) : 1 };
    this.slowF = done.some(o => B[o.type].sluggish) ? 1 - B.chicken.sluggish : 1;
    this.beds = beds;
    this.idle = home.filter(t => t.state === 'idle' && !t.at).length;
    // propaganda and morale, each kind worth less the more of it you already have, so variety pays
    const seen = {}; let prop = 0, comfort = 0;
    for (const b of done) {
      const d = B[b.type], n = (seen[b.type] = (seen[b.type] || 0) + 1), dim = Math.pow(0.7, n - 1), cf = this.condF(b);
      const run = d.crew ? this.crewFrac(b) * (b.off ? 0 : 1) : 1;
      if (d.prop) prop += d.prop * dim * cf * (d.crew ? 0.4 + 0.6 * run : 1) * (d.pw < 0 ? 0.5 + 0.5 * this.power.ratio : 1);
      if (d.mor) comfort += d.mor * dim * cf * run * (d.potty ? (b.clean ?? 100) / 100 : 1) * (d.eat && b.stock.rations <= 0 ? 0.3 : 1);
    }
    this.prop = Math.round(100 * (1 - Math.exp(-prop / 55)));
    const worn = done.length ? done.filter(b => b.cond < 40).length / done.length : 0;
    const over = Math.max(0, this.troops.length - beds);
    const pots = done.filter(b => B[b.type].potty), users = home.length;
    const filthy = pots.filter(b => (b.clean ?? 100) < 25).length, queue = pots.length ? Math.max(0, users / pots.length - 10) : (users > 8 ? users - 8 : 0);
    this.potties = { n: pots.length, filthy, perPotty: pots.length ? users / pots.length : users };
    this.seats = done.filter(b => B[b.type].eat && !b.off).reduce((a, b) => a + B[b.type].eat, 0);
    this.mor = {
      base: 45,
      comfort: Math.round(30 * (1 - Math.exp(-comfort / 22))),
      prop: Math.round(this.prop * 0.12),
      pride: Math.round(this.pride),
      food: -Math.round(25 * this.hunger),
      crowd: -Math.min(25, over * 4),
      power: -Math.round(15 * (1 - this.power.ratio)),
      grief: -Math.round(this.grief),
      worn: -Math.round(12 * worn),
      latrine: -Math.min(12, Math.round(filthy * 4 + queue * 0.8)),
    };
    this.moraleTarget = clamp(Object.values(this.mor).reduce((a, b) => a + b, 0), 0, 100);
    this.avgCond = done.length ? done.reduce((a, b) => a + b.cond, 0) / done.length : 100;
  }
  crewFrac(b) { const c = B[b.type].crew; return c ? b.crew / c : 1; }
  condF(b) { return b.cond < 40 ? 0.5 : b.cond < 70 ? 0.85 : 1; }
  work(b) {   // how hard a building runs right now, 0..1+
    const d = B[b.type]; if (!b.done || b.off) return 0;
    const pw = d.pw < 0 ? this.power.ratio : 1;
    const slow = this.slowF ?? 1;
    return this.crewFrac(b) * pw * this.condF(b) * (0.6 + 0.8 * this.morale / 100) * slow;
  }

  // ---------------------------------------------------------------- the clock
  step(dt) {
    this.t += dt; this.wt += dt;
    const k = dt / C.T, day = dt / C.DAY;   // economy time (the old 150 s week's scale), and the fraction of a day
    this.recalc();
    for (const b of this.b) if (!b.done) {
      const helpers = Math.min(3, this.idle);
      b.prog += dt / (b.time * C.BUILD) * (0.4 + 0.2 * helpers);
      if (b.prog >= 1) { b.prog = 1; b.done = true; this.events.push({ t: 'built', id: b.id }); this.roadsV++; this.say('base', `${B[b.type].name} complete.`); }
    }
    this.consume(day);
    this.train(dt); this.study(dt);
    this.drive(dt);
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
    for (const p of this.patrols) { if (p.brief > 0) { p.brief -= dt; if (p.brief <= 0) this.patrolGo(p); } else p.t += dt / C.PATROL; }
    const before = this.time;
    this.tick();
    if (before && Math.floor(before.hour) !== Math.floor(this.time.hour)) this.hourly(Math.floor(this.time.hour));
    for (const p of this.patrols.filter(p => p.t >= p.dur)) this.resolve(p);
    if (!this.inspected && this.wt >= C.WEEK * C.INSPECT_AT) this.inspect();
    if (this.wt >= C.WEEK) this.endWeek();
  }
  hourly(h) {
    if (h === C.SUPPLY_AT) this.supplyRun();
    if (h === C.PATROL_AT) this.standingPatrols();
    if (h === C.DEPLOY_AT) this.deployRun();
    if (h === 0) this.checkOrders();
  }

  // ---------------------------------------------------------------- the clock: a week of seven days, starting at 06:00
  tick() {
    const days = this.wt / C.DAY + 0.25, d = Math.floor(days), tod = days - d, h = tod * 24;
    // an Army-style duty day (AR 600-25 bugle calls): First Call 06:00, Reveille 06:30 as the flag goes up, PT, chow,
    // Work Call 09:00, lunch, Retreat 17:00 as the flag comes down, free time, Taps 21:00
    const phase = h < 6 || h >= 21 ? 'night' : h < 6.5 ? 'firstcall' : h < 7 ? 'reveille' : h < 8 ? 'pt' : h < 9 ? 'chow'
      : h < 11.5 ? 'work' : h < 13 ? 'mess' : h < 17 ? 'work' : h < 17.5 ? 'retreat' : 'evening';
    if (this.time && phase !== this.time.phase) this.events.push({ t: 'phase', phase });
    this.time = { day: (this.week - 1) * 7 + d + 1, hour: h, tod, phase, weekday: d };
  }

  // ---------------------------------------------------------------- eating, burning, shooting: goods get used up
  consume(day) {
    // food: every vote at home eats a ration a day, at a mess, a franchise or the HQ, as far as their seats go
    const eaters = this.troops.length - this.troops.filter(t => t.state === 'patrol').length;
    const places = this.b.filter(b => b.done && !b.off && B[b.type].eat);
    let fed = 0;
    if (eaters > 0) {
      const seats = places.reduce((a, b) => a + B[b.type].eat, 0) || 1;
      for (const b of places) {
        const want = Math.min(B[b.type].eat, eaters * B[b.type].eat / seats) * day, cell = b.type === 'hq' ? 'rations' : 'rations';
        const got = Math.min(want, b.stock[cell]); b.stock[cell] -= got; fed += got;
      }
      const frac = clamp(fed / (eaters * day), 0, 1);
      this.hunger += ((1 - frac) - this.hunger) * Math.min(1, day * 2);
      this.week_.fed += frac * day; this.week_.eat += day;
    }
    // everything else that burns something
    for (const b of this.b) {
      if (!b.done || b.off) continue;
      const d = B[b.type];
      if (d.burn) for (const g in d.burn) { const rate = b.type === 'gen' ? this.crewFrac(b) : b.type === 'motorpool' ? (this.veh.some(v => v.home === b.id && v.job) ? 1 : 0.25) : 1; b.stock[g] = Math.max(0, b.stock[g] - d.burn[g] * rate * day); }
      // shortages, for the audit: a building that needs something and has none of it
      if (d.need) for (const g in d.need) { this.week_.total += day; if (b.stock[g] <= 0.01) this.week_.short += day; }
    }
  }

  // ---------------------------------------------------------------- training: recruits go where they can learn fastest
  train(dt) {
    const ph = this.time?.phase, on = ph === 'pt' || ph === 'work', hours = dt / C.DAY * 24;
    const recruits = this.troops.filter(t => t.state === 'idle' && !this.trained(t));
    if (!on) { for (const t of this.troops) t.at = null; return; }
    const places = this.b.filter(b => b.done && !b.off && B[b.type].train)
      .filter(b => !B[b.type].crew || b.crew > 0)
      .filter(b => !(B[b.type].need && B[b.type].need.ammo) || b.stock.ammo > 0.5)
      .sort((a, b) => TRAIN[B[b.type].train] - TRAIN[B[a.type].train]);
    const load = new Map(places.map(b => [b.id, 0]));
    for (const t of recruits) if (t.at && load.has(t.at) && load.get(t.at) < B[this.byId(t.at).type].slots) load.set(t.at, load.get(t.at) + 1); else t.at = null;
    for (const t of recruits) if (!t.at) { const p = places.find(b => load.get(b.id) < B[b.type].slots); if (p) { t.at = p.id; load.set(p.id, load.get(p.id) + 1); } }
    for (const t of this.troops) if (t.at && (t.state !== 'idle' || this.trained(t))) t.at = null;
    for (const t of recruits) {
      if (!t.at) continue;
      const p = this.byId(t.at), kind = B[p.type].train, rate = TRAIN[kind] * this.condF(p) * (0.7 + 0.6 * this.morale / 100) * (this.hasTech('drill') ? 1.2 : 1);
      t.train = Math.min(100, t.train + rate * hours);
      if (kind === 'parade' || kind === 'course') t.drill = Math.min(1, t.drill + hours * 0.01);
      if (kind === 'range') p.stock.ammo = Math.max(0, p.stock.ammo - 0.5 * hours);
      if (this.trained(t)) { t.at = null; this.stats.trained++; this.events.push({ t: 'trained', id: t.id }); }
    }
  }

  // ---------------------------------------------------------------- supply lines: forklifts and trucks
  fleet() {   // one vehicle per forklift or truck a building provides
    for (const b of this.b) {
      if (!b.done) continue;
      const d = B[b.type], w = b.wreck || {};
      const want = [['lift', d.lifts || 0], ['truck', (d.trucks || 0) + (d.trucks && this.hasTech('trucks') ? 1 : 0)], ['frv', d.armour && !w.frv ? 1 : 0], ['tank', d.armour && !w.tank && this.hasTech('tank') ? 1 : 0]];
      for (const [kind, n] of want) {
        const have = this.veh.filter(v => v.home === b.id && v.kind === kind).length;
        for (let i = have; i < n; i++) { const [x, z] = this.door(b); this.veh.push({ id: this.nid++, kind, home: b.id, x: x + 0.5, z: z + 0.5, yaw: 0, path: [], job: null, load: 0, wait: 0 }); }
      }
    }
  }
  dropJob(v) {
    const j = v.job; if (!j) return;
    const s = this.byId(j.src), d = this.byId(j.dst);
    if (s && !v.load) s.out[j.g] = Math.max(0, (s.out?.[j.g] || 0) - j.qty);
    if (d) d.in[j.g] = Math.max(0, (d.in?.[j.g] || 0) - j.qty);
    if (v.load) { const home = this.byId(v.home); if (home && this.storeCap(home, j.g)) home.stock[j.g] += v.load; v.load = 0; }
    v.job = null; v.path = [];
  }
  // the most urgent delivery an idle vehicle could make: empty consumers first, then unloading the pad
  findJob(v) {
    const done = this.b.filter(b => b.done);
    for (const b of done) { b.in ||= zero(); b.out ||= zero(); }
    const avail = (b, g) => b.stock[g] - b.out[g];
    const sources = g => done.filter(b => (this.storeCap(b, g) || B[b.type].pad) && avail(b, g) >= 1);
    const dist = (b) => Math.hypot(b.x + b.w / 2 - v.x, b.z + b.d / 2 - v.z);
    let best = null;
    for (const b of done) for (const g of GKEYS) {
      const cap = this.needCap(b, g); if (!cap) continue;
      const have = b.stock[g] + b.in[g]; if (have > cap * 0.6) continue;
      const src = sources(g).sort((p, q) => (B[p.type].pad ? 1 : 0) - (B[q.type].pad ? 1 : 0) || dist(p) - dist(q))[0]; if (!src) continue;
      const urgency = 2 + (1 - have / cap) * 2;
      if (!best || urgency > best.u) best = { u: urgency, src, dst: b, g, qty: Math.min(VEHICLES[v.kind].load, cap - have, avail(src, g)) };
    }
    if (!best) for (const p of done.filter(b => B[b.type].pad)) for (const g of GKEYS) {
      if (avail(p, g) < 1) continue;
      const dst = done.filter(b => this.storeCap(b, g) - b.stock[g] - b.in[g] >= 1).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (!dst) continue;
      const u = 1 + avail(p, g) / 100;
      if (!best || u > best.u) best = { u, src: p, dst, g, qty: Math.min(VEHICLES[v.kind].load, avail(p, g), this.storeCap(dst, g) - dst.stock[g] - dst.in[g]) };
    }
    if (!best || best.qty < 1) return null;
    best.src.out[best.g] += best.qty; best.dst.in[best.g] += best.qty;
    return { src: best.src.id, dst: best.dst.id, g: best.g, qty: best.qty, leg: 'src' };
  }
  roll(v, dt) {   // move along the path, faster on roads
    const N = this.N;
    let step = VEHICLES[v.kind].speed * dt;
    while (v.path.length && step > 0) {
      const tx = Math.floor(v.x), tz = Math.floor(v.z), r = tx >= 0 && tz >= 0 && tx < N && tz < N ? this.roads[tz * N + tx] : 0;
      const sp = FAST[r] || 1, [px, pz] = v.path[0], dx = px - v.x, dz = pz - v.z, d = Math.hypot(dx, dz);
      if (d > 1e-4) v.yaw = Math.atan2(dx, dz);
      const can = step * sp;
      if (d <= can) { v.x = px; v.z = pz; v.path.shift(); step -= d / sp; } else { v.x += dx / d * can; v.z += dz / d * can; step = 0; }
    }
  }
  drive(dt) {
    for (const b of this.b) if (b.wreck) for (const k in b.wreck) if ((b.wreck[k] -= dt) <= 0) delete b.wreck[k];
    this.fleet();
    for (const v of this.veh) {
      const home = this.byId(v.home), spec = VEHICLES[v.kind];
      if (!home) continue;
      if ((this.time?.phase === 'reveille' || this.time?.phase === 'retreat') && !v.go) continue;   // vehicles halt for the colours, drivers included
      if (VEHICLES[v.kind].armour) {
        if (v.away) continue;
        if (!v.mission && !v.path.length && !v.parked) { const [x, z] = this.door(home); if (Math.hypot(v.x - x - 0.5, v.z - z - 0.5) > 1) v.path = this.pathTo(v.x, v.z, x, z); else v.parked = true; }
        this.roll(v, dt);
        if (v.go && !v.path.length) v.away = true;
        continue;
      }
      if (v.kind === 'truck' && (home.stock.fuel <= 0 || home.crew < 1 || home.off)) continue;   // no fuel or no driver: the trucks stay parked
      if (!v.job) {
        v.wait -= dt;
        if (v.wait <= 0) {
          v.job = this.findJob(v); v.wait = 1.5;
          if (v.job) { const s = this.byId(v.job.src), [x, z] = this.door(s); v.path = this.pathTo(v.x, v.z, x, z); }
          else if (!v.path.length) { const [x, z] = this.door(home); if (Math.hypot(v.x - x - 0.5, v.z - z - 0.5) > 1) v.path = this.pathTo(v.x, v.z, x, z); }
        }
      }
      this.roll(v, dt);
      void spec;
      if (!v.job || v.path.length) continue;
      const j = v.job, s = this.byId(j.src), d = this.byId(j.dst);
      if (!s || !d) { this.dropJob(v); continue; }
      if (j.leg === 'src') {
        const got = Math.min(j.qty, s.stock[j.g]); s.stock[j.g] -= got; s.out[j.g] = Math.max(0, s.out[j.g] - j.qty); v.load = got;
        if (got < j.qty) d.in[j.g] = Math.max(0, d.in[j.g] - (j.qty - got)), j.qty = got;
        if (!got) { this.dropJob(v); continue; }
        j.leg = 'dst'; const [x, z] = this.door(d); v.path = this.pathTo(v.x, v.z, x, z);
      } else {
        d.stock[j.g] += v.load; d.in[j.g] = Math.max(0, d.in[j.g] - j.qty); this.stats.delivered += v.load; v.load = 0; v.job = null; v.wait = 0.5;
      }
    }
  }

  // ---------------------------------------------------------------- the morning supply pelican, billed automatically
  supplyRun() {
    const pads = this.b.filter(b => b.done && B[b.type].pad);
    if (!pads.length) { this.say('log', 'No landing pad: the supply pelican circled and went home.'); return; }
    let room = pads.length * this.padLoad();
    const order = zero();
    for (const g of GKEYS) {
      const want = this.storage(g) + this.b.reduce((a, b) => a + this.needCap(b, g), 0) - this.amount(g);
      order[g] = Math.max(0, Math.floor(want));
    }
    // fit it in the pelican, each good getting its fair share of the room
    const want = GKEYS.reduce((a, g) => a + order[g], 0);
    if (want > room) for (const g of GKEYS) order[g] = Math.floor(order[g] * room / want);
    let cost = GKEYS.reduce((a, g) => a + order[g] * GOODS[g].cost, 0);
    if (cost > this.supplies) { const f = Math.max(0, this.supplies) / cost; for (const g of GKEYS) order[g] = Math.floor(order[g] * f); cost = GKEYS.reduce((a, g) => a + order[g] * GOODS[g].cost, 0); }
    const n = GKEYS.reduce((a, g) => a + order[g], 0);
    // recruits come on the same flight, as many as there are bunks for
    const free = Math.max(0, this.beds - this.troops.length), r = Math.min(free ? Math.max(1, Math.round(free * C.FILL[this.rank])) : 0, pads.length * this.padSeats()), fresh = [];
    for (let i = 0; i < r; i++) fresh.push(this.addTroop().id);
    if (!n && !fresh.length) return;
    this.supplies -= cost;
    for (const g of GKEYS) { let left = order[g]; for (const p of pads) { const put = Math.ceil(left / pads.length); p.stock[g] += Math.min(put, left); left -= Math.min(put, left); } }
    this.bill = { day: this.time.day, order, cost };
    this.events.push({ t: 'supply', n, fresh, pads: this.byPad(pads, fresh) });
    if (fresh.length) this.events.push({ t: 'recruits', ids: fresh });
    const parts = GKEYS.filter(g => order[g]).map(g => `${order[g]} ${GOODS[g].name.toLowerCase()}`);
    this.say('log', (parts.length ? `Supply pelican down: ${parts.join(', ')}. Billed ${cost} supplies.` : 'Supply pelican down.') + (fresh.length ? ` ${fresh.length} vote${fresh.length > 1 ? 's' : ''} delivered.` : ''));
  }

  // every pad gets its own pelican: share the passengers out, eight to a pad
  byPad(pads, ids) { return pads.map((p, i) => ({ id: p.id, ids: ids.filter((_, k) => k % pads.length === i) })); }

  // ---------------------------------------------------------------- Ministry of Defence: deployment orders, shipped automatically
  newOrder() {
    const n = Math.min(40, 4 + this.week * 3), dueDay = (this.week - 1) * 7 + 8;
    this.orders.push({ id: this.nid++, n, sent: 0, due: dueDay, def: 8 + n, week: this.week });
    this.say('def', `Deployment order: ${n} trained troopers to the front by day ${dueDay}. Transports leave from the landing pad at ${C.DEPLOY_AT}:00.`);
  }
  deployRun() {
    const pads = this.b.filter(b => b.done && B[b.type].pad), o = this.orders[0];
    if (!pads.length || !o) return;
    // the Patrol Office keeps its squads back: three trained troopers for every squad it sends out
    const keep = this.b.filter(b => b.type === 'patrol' && b.done && !b.off).reduce((a, b) => a + (b.squads || 0) * 3, 0) - this.patrols.filter(p => p.office).length * 3;
    const ready = this.troops.filter(t => this.trained(t) && t.state === 'idle').sort((a, b) => b.missions - a.missions).slice(Math.max(0, keep));
    const go = ready.slice(0, Math.min(o.n - o.sent, pads.length * this.padSeats()));
    if (!go.length) return;
    const ids = go.map(t => t.id);
    this.troops = this.troops.filter(t => !ids.includes(t.id));
    o.sent += go.length; this.stats.deployed += go.length;
    const pay = go.length * C.DEPLOY_PAY; this.supplies += pay;
    this.events.push({ t: 'deploy', ids, names: go.map(t => t.name), pads: this.byPad(pads, ids) });
    this.say('def', `${go.length} trooper${go.length > 1 ? 's' : ''} shipped to the front (${o.sent} of ${o.n}). +${pay} supplies.`);
    if (o.sent >= o.n) {
      this.orders.shift(); this.gain('def', o.def);
      this.say('def', `Deployment order complete. +${o.def} Defence standing. The front thanks you, briefly.`);
    }
  }
  checkOrders() {
    const day = this.time.day;
    for (const o of this.orders.filter(o => day > o.due)) {
      this.orders = this.orders.filter(x => x !== o);
      const pen = Math.round(4 + (o.n - o.sent) * 1.5);
      this.gain('def', -pen);
      this.say('def', `Deployment order missed: ${o.sent} of ${o.n} shipped. -${pen} Defence standing. The front has been told to wait, and is not pleased.`);
    }
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
      if (this.roads[tz * this.N + tx]) return { ok: false, why: 'There is a road here' };
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

  // ---------------------------------------------------------------- patrols: standing patrols from the office, special operations by hand
  standingPatrols() {
    for (const b of this.b.filter(b => b.type === 'patrol' && b.done && !b.off && b.crew > 0)) {
      const out = this.patrols.filter(p => p.office === b.id).length;
      for (let i = out; i < (b.squads || 0); i++) {
        if (b.stock.ammo < 4) { this.say('def', 'The Patrol Office is out of ammo. No patrol today.'); break; }
        const squad = this.troops.filter(t => t.state === 'idle' && this.trained(t)).slice(0, 3);
        if (squad.length < 3) break;
        b.stock.ammo -= 4;
        const diff = this.rng.chance(0.3) ? 2 : 1;
        const p = { id: this.nid++, op: `${this.rng.pick(['North', 'South', 'East', 'West', 'Perimeter', 'Ridge', 'Valley'])} sector patrol`, kind: 'Standing patrol', diff, size: 3,
          dur: C.DAY / C.PATROL, def: 2 + diff, sup: 15 * diff, office: b.id, t: 0, members: squad.map(t => t.id) };
        p.chance = this.chance(p, squad);
        this.startPatrol(p, squad, b.id);
      }
    }
  }
  newOffers() {
    this.offers = [];
    const used = new Set();
    for (let i = 0; i < 3; i++) {
      const pool = MISSIONS.filter(m => !m.heavy || this.has('vbay'));
      let m; do { m = this.rng.pick(pool); } while (used.has(m.kind)); used.add(m.kind);
      const diff = m.diff[0] + this.rng.int(m.diff[1] - m.diff[0] + 1) + (this.week > 6 && this.rng.chance(0.3) ? 1 : 0);
      const size = m.size[0] + this.rng.int(m.size[1] - m.size[0] + 1);
      this.offers.push({ id: this.nid++, op: `Operation ${this.rng.pick(OP_A)} ${this.rng.pick(OP_B)}`, kind: m.kind, diff: Math.min(5, diff), size,
        dur: Math.round(this.rng.range(m.dur[0], m.dur[1])), def: Math.round((4 + diff * 3) * (m.heavy ? 1.5 : 1)), sup: Math.round(diff * 40 * (m.heavy ? 1.5 : 1)), heavy: !!m.heavy });
    }
  }
  squadFor(size) {   // trained troopers first, idle before busy
    const home = this.troops.filter(t => t.state !== 'patrol');
    const order = t => (this.trained(t) ? 200 : 0) + (t.job ? 10 - CREW_ORDER.indexOf(this.byId(t.job)?.type) : 100);
    return home.sort((a, b) => order(b) - order(a) || b.missions - a.missions).slice(0, size);
  }
  chance(o, squad = this.squadFor(o.size), kinds = o.veh || []) {
    if (squad.length < o.size) return 0;
    const armour = kinds.reduce((a, k) => a + VEHICLES[k].bonus, 0);
    const vet = squad.reduce((a, t) => a + Math.min(1, t.missions / 6), 0) / squad.length;
    const drill = squad.reduce((a, t) => a + t.drill, 0) / squad.length;
    const raw = squad.reduce((a, t) => a + (this.trained(t) ? 0 : 0.15), 0) / squad.length;
    const arm = this.b.some(b => b.type === 'armory' && b.done && b.crew > 0 && !b.off) ? 0.1 : 0;
    return clamp(0.66 + 0.15 * vet + 0.1 * drill + 0.2 * (this.morale - 50) / 50 + arm + armour + 0.03 * (o.size - 2) - 0.1 * o.diff - raw, 0.05, 0.97);
  }
  // armour parked in a staffed Vehicle Bay with fuel for the trip
  armourFree(kind) {
    return this.veh.filter(v => v.kind === kind && !v.mission && !v.away).find(v => {
      const h = this.byId(v.home); return h && h.done && !h.off && h.crew > 0 && h.stock.fuel >= VEHICLES[kind].fuel;
    });
  }
  send(offerId, kinds = []) {
    const o = this.offers.find(o => o.id === offerId); if (!o) return false;
    const squad = this.squadFor(o.size); if (squad.length < o.size) return false;
    const vs = [...new Set(kinds)].map(k => this.armourFree(k)).filter(Boolean);
    const p = { ...o, id: this.nid++, t: 0, veh: vs.map(v => v.kind), vids: vs.map(v => v.id), members: squad.map(t => t.id) };
    p.chance = this.chance(p, squad);
    for (const v of vs) { v.mission = p.id; v.parked = false; const h = this.byId(v.home); h.stock.fuel -= VEHICLES[v.kind].fuel; }
    this.offers = this.offers.filter(x => x !== o);
    this.startPatrol(p, squad, this.b.find(b => b.type === 'patrol' && b.done)?.id ?? this.b.find(b => b.type === 'hq').id);
    const with_ = vs.length ? ` with ${vs.map(v => 'a ' + VEHICLES[v.kind].name).join(' and ')}` : '';
    this.say('def', `${p.op}: ${squad[0].name} is briefing ${p.size} troopers${with_}. Odds ${Math.round(p.chance * 100)}%.`);
    return true;
  }
  // the squad gathers round its leader for the plan, then marches out together
  startPatrol(p, squad, at) {
    p.brief = C.BRIEF; p.at = at; p.leader = squad[0].id;
    for (const t of squad) { t.state = 'patrol'; t.job = null; t.at = null; }
    this.patrols.push(p);
    this.events.push({ t: 'patrolOut', id: p.id, members: p.members, at, leader: p.leader });
  }
  patrolGo(p) {
    p.brief = 0;
    const g = this.gate();
    for (const id of p.vids || []) { const v = this.veh.find(v => v.id === id); if (v) { v.go = true; v.path = this.pathTo(v.x, v.z, g.x, g.z); } }
    this.events.push({ t: 'patrolGo', id: p.id, members: p.members, leader: p.leader });
  }
  resolve(p) {
    this.patrols = this.patrols.filter(x => x !== p);
    const win = this.rng.chance(p.chance), dead = [], back = [];
    const vs = (p.vids || []).map(id => this.veh.find(v => v.id === id)).filter(Boolean);
    const guard = vs.reduce((a, v) => Math.min(a, VEHICLES[v.kind].guard), 1);
    for (const id of p.members) {
      const t = this.troop(id); if (!t) continue;
      if (this.rng.chance((win ? 0.04 * p.diff : 0.11 * p.diff) * guard)) dead.push(t); else back.push(t);
    }
    const g = this.gate();
    for (const v of vs) {
      const h = this.byId(v.home);
      if (this.rng.chance(win ? 0.05 : v.kind === 'tank' ? 0.3 : 0.5)) {
        this.veh = this.veh.filter(x => x !== v);
        if (h) { h.wreck ||= {}; h.wreck[v.kind] = C.REBUILD; }
        this.say('def', `The ${VEHICLES[v.kind].name} did not come back from ${p.op}. Form V-9 filed; a replacement arrives in two days, billed to the base's gratitude.`);
        continue;
      }
      v.mission = null; v.away = false; v.go = false; v.x = g.x; v.z = g.z; v.path = h ? this.pathTo(v.x, v.z, ...this.door(h)) : [];
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
    const quiet = !!p.office;   // standing patrols only report when something happens
    if (win) {
      this.gain('def', p.def); this.supplies += p.sup; this.stats.patrolsWon++;
      if (this.rng.chance((quiet ? 0.08 : 0.35) + 0.08 * p.diff)) {
        hero = this.rng.pick(back); hero.medals++; this.pride += 5;
        this.honours.push({ name: hero.name, rank: rankOf(hero.missions), op: p.op, week: this.week });
      }
      if (!quiet || dead.length || hero) this.say('def', `${p.op}: success. +${p.def} Defence standing, +${p.sup} supplies.` + (dead.length ? ` We lost ${dead.map(t => t.name).join(', ')}.` : ''));
      if (hero) this.say('def', `${rankOf(hero.missions)} ${hero.name} is awarded the Medal of Valour. All votes will assemble at the Super Earth flag.`);
    } else {
      this.gain('def', -(2 + p.diff)); this.stats.patrolsLost++;
      this.say('def', `${p.op}: failed. -${2 + p.diff} Defence standing.` + (dead.length ? ` Fallen: ${dead.map(t => t.name).join(', ')}.` : ''));
    }
    this.events.push({ t: 'patrolBack', members: back.map(t => t.id), dead: dead.map(t => t.name), hero: hero?.id ?? null, win });
  }

  // ---------------------------------------------------------------- Ministry of Expansion: the weekly supply audit
  expansionAudit() {
    const W = this.week_;
    const lines = W.total ? 100 * (1 - W.short / W.total) : 50, food = W.eat ? 100 * W.fed / W.eat : 50;
    const housing = 100 * Math.min(1, this.beds / Math.max(1, this.troops.length));
    const target = 12 + this.week * 8, growth = 100 * Math.min(1, this.troops.length / target);   // the Ministry expects the base to keep growing
    const score = Math.round(0.25 * lines + 0.25 * food + 0.15 * housing + 0.35 * growth);
    const before = this.stand.pro;
    this.stand.pro = clamp(this.stand.pro + (score - this.stand.pro) * 0.6, 0, 100);
    const notes = [];
    if (food < 80) notes.push('Votes went hungry this week. Rations must reach the mess.');
    if (lines < 80) notes.push('Buildings ran dry of what they need. More trucks, shorter roads or more storage.');
    if (housing < 100) notes.push('Not every vote has a bunk.');
    if (growth < 90) notes.push(`The Ministry expected ${target} votes on the base by now. Build housing; recruits fill empty bunks.`);
    if (!notes.length) notes.push('Supply lines clean. The Ministry is quietly impressed.');
    this.audit = { week: this.week, score, lines: Math.round(lines), food: Math.round(food), housing: Math.round(housing), growth: Math.round(growth), target, notes, delta: Math.round(this.stand.pro - before) };
    this.say('pro', `Expansion audit: ${score}/100. Expansion standing ${this.audit.delta >= 0 ? '+' : ''}${this.audit.delta}. ${notes[0]}`);
    this.week_ = { short: 0, total: 0, fed: 0, eat: 0 };
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
    if (this.hunger > 0.3) notes.push('Votes were seen eating their boot laces. The Ministry suggests rations.');
    if (this.avgCond < 60) notes.push('Several structures appear to be held together by optimism.');
    if (this.troops.length > this.beds) notes.push('Votes are sleeping outdoors. The Ministry finds this photogenic but concerning.');
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
      const target = 28 + r.w[m] * (26 + Math.min(52, this.week * 3.6)) + this.rng.range(-6, 6);
      r.stand[m] = clamp(r.stand[m] ? r.stand[m] + (target - r.stand[m]) * 0.5 : target, 0, 100);
    }
    // now and then a rival has a very good week
    if (this.week > 1 && this.rng.chance(0.35)) {
      const r = this.rng.pick(this.rivals), m = MKEYS.reduce((a, k) => r.w[k] > r.w[a] ? k : a, 'def');
      r.stand[m] = clamp(r.stand[m] + 14, 0, 100);
      const what = { def: 'a record deployment to the front', pro: 'a flawless supply audit', tru: 'a flawless inspection' }[m];
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
    if (!this.inspected) this.inspect();
    this.expansionAudit();
    for (const m of MKEYS) this.stand[m] += (C.STAND.rest - this.stand[m]) * C.STAND.drift;
    this.updateRivals();
    const prev = this.rank, rank = this.ranking();
    const amt = Math.round(C.ALLOC.base * C.ALLOC.mult[rank]);
    this.supplies += amt; this.lastAlloc = amt;
    const gross = Math.round(amt / 0.82), fee = Math.round(gross * 0.11);
    this.ledger = { week: this.week, gross, fee, consult: gross - fee - amt, net: amt };
    for (const b of this.b) if (b.done && B[b.type].cryo && !b.off && b.crew > 0 && this.power.ratio >= 1) { this.gain('def', 3); this.say('def', 'Helldivers thawed, briefed and shipped to the front. +3 Defence standing.'); }
    for (const b of this.b) if (b.done && B[b.type].kickback) { this.supplies += B[b.type].kickback; this.say('bur', `Bureau Cola & Fries remits a consulting fee of ${B[b.type].kickback} supplies. Please do not ask what was consulted.`); }
    this.events.push({ t: 'alloc', amt });
    // upkeep: what you can't pay for wears out
    const built = this.b.filter(b => b.done), bill = built.reduce((a, b) => a + B[b.type].up, 0);
    let unpaid = 0;
    if (this.supplies >= bill) { this.supplies -= bill; for (const b of built) b.cond = Math.min(100, b.cond + C.MAINT - C.WEAR); }
    else {
      for (const b of this.rng.shuffle(built.slice())) {
        if (this.supplies >= B[b.type].up) { this.supplies -= B[b.type].up; b.cond = Math.min(100, b.cond + C.MAINT - C.WEAR); }
        else { b.cond = Math.max(5, b.cond - C.UNPAID); unpaid++; }
      }
    }
    const place = ['1st', '2nd', '3rd', '4th'][rank];
    this.say('base', `Week ${this.week} closes. ${this.faction.name} ranks ${place} of 4: allocation ${amt} supplies. Upkeep ${bill}.`);
    if (unpaid) this.say('base', `Upkeep short: ${unpaid} building${unpaid > 1 ? 's' : ''} went unmaintained and are wearing down.`);
    if (rank < prev) this.say('riv', `Federation bulletin: ${this.faction.name} climbs to ${place}. Glory to the efficient.`);
    else if (rank > prev) this.say('riv', `Federation bulletin: ${this.table()[prev].name} overtakes ${this.faction.name}. Allocation reduced accordingly.`);
    this.memo();
    this.week++; this.wt -= C.WEEK; this.inspected = false;
    this.newOffers(); this.newOrder();
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
    for (const k of Object.keys(this)) if (!['rng', 'events', 'occ', 'mor', 'power', 'roads', 'walls', 'inMask', 'gates', '_walk', '_walkV', '_paths', '_pathV'].includes(k)) o[k] = this[k];
    o.rngS = this.rng.s; o.v = 5;
    return JSON.parse(JSON.stringify(o));
  }
  load(s) {
    Object.assign(this, structuredClone(s));
    if (!s.v || s.v < 2) this.wt *= C.T;
    this.rng = new RNG(1); this.rng.s = s.rngS; this.events = [];
    this.N = s.N || 40; delete this.walls; delete this.inMask; delete this.gates;
    this.roads = new Uint8Array(this.N * this.N);
    if (s.roadsS) for (let i = 0; i < s.roadsS.length; i++) this.roads[i] = +s.roadsS[i];
    this.genMap();
    if (!s.v || s.v < 3) this.migrate3();
    for (const b of this.b) for (let j = 0; j < b.d; j++) for (let i = 0; i < b.w; i++) this.occ[(b.z + j) * this.N + b.x + i] = b.id;
    if (!s.v || s.v < 3) this.roadsFromGate();
    if (!this.net) this.migrate5();
    delete this.roadsS;
    this.genMap();
    for (const b of this.b) for (let j = 0; j < b.d; j++) for (let i = 0; i < b.w; i++) this.occ[(b.z + j) * this.N + b.x + i] = b.id;
    this.rebuildNet();
    if (!this.b.some(b => b.type === 'seflag')) this.raiseFlag();
    this.veh ||= []; this.orders ||= []; this.week_ ||= { short: 0, total: 0, fed: 0, eat: 0 }; this.hunger ||= 0; this.recruitAcc ||= 0; this.tech ||= { done: [], cur: null, pts: 0 };
    this.roadsV = 1;
    this.recalc(); this.tick();
    if (!this.orders.length) this.newOrder();
  }
  // bases saved before the supply lines: pumps and plants go (refunded), E-710 and shells become fuel and ammo at the HQ
  migrate3() {
    const old = this.b.filter(b => b.type === 'pump' || b.type === 'plant');
    for (const b of old) this.supplies += b.type === 'pump' ? 250 : 380;
    this.b = this.b.filter(b => !old.includes(b));
    for (const b of this.b) { b.stock ||= zero(); if (B[b.type]?.squads) b.squads ??= 1; }
    this.b = this.b.filter(b => B[b.type]);
    const hq = this.b.find(b => b.type === 'hq');
    if (hq) hq.stock = { rations: B.hq.store.rations, fuel: Math.min(B.hq.store.fuel, Math.round(this.e710 || 0) + 10), ammo: Math.min(B.hq.store.ammo, Math.round(this.shells || 0) + 10) };
    for (const t of this.troops) t.train ??= t.missions > 0 ? 100 : 60;
    delete this.e710; delete this.shells; delete this.contracts; delete this.cap;
    this.stats = { deployed: 0, trained: 0, delivered: 0, ...this.stats };
    if (old.length) this.say('base', `The Bureau has decommissioned ${old.length} extraction site${old.length > 1 ? 's' : ''}: this is a military base. E-710 now arrives by pelican. Construction costs refunded.`);
  }
  // bases saved before roads and walls became lines: the old map moves into the middle of the bigger one, the old perimeter
  // becomes a wall, and painted road tiles become road lines, one per straight run
  migrate5() {
    const old = this.N, o = (C.N - old) / 2, R = this.roads, lines = [];
    const done = new Uint8Array(old * old);
    const runs = (t, horiz) => {
      for (let a = 1; a < old - 1; a++) {
        let s = -1;
        for (let b = 1; b <= old - 1; b++) {
          const on = b < old - 1 && (horiz ? R[a * old + b] : R[b * old + a]) === t;
          if (on && s < 0) s = b;
          if (!on && s >= 0) {
            if (b - s >= 3) { lines.push(horiz ? [s + o + 0.5, a + o + 0.5, b - 1 + o + 0.5, a + o + 0.5] : [a + o + 0.5, s + o + 0.5, a + o + 0.5, b - 1 + o + 0.5]); for (let k = s; k < b; k++) done[horiz ? a * old + k : k * old + a] = 1; }
            s = -1;
          }
        }
      }
    };
    const extra = [];
    for (const t of [1, 2]) {
      lines.length = 0; runs(t, true); runs(t, false);
      for (let i = 0; i < old * old; i++) if (R[i] === t && !done[i]) { const x = i % old + o, z = ((i / old) | 0) + o; lines.push([x + 0.25, z + 0.5, x + 0.75, z + 0.5]); }   // odd tiles left over
      for (const l of lines) extra.push([...l, t === 2 ? 'paved' : 'dirt', 1]);
    }
    // the old road out of the gate, carried on to the edge of the new map
    extra.push([C.N / 2 + 1, o + old - 1.5, C.N / 2 + 1, C.N, 'paved', 2]);
    for (const b of this.b) { b.x += o; b.z += o; }
    for (const v of this.veh) { v.x += o; v.z += o; v.path = []; v.parked = false; }
    this.N = C.N; this.roads = null;
    this.startNet(extra);
  }
  roadsFromGate() {   // a dirt road up from the gate on whatever ground is free
    const m = this.N / 2;
    for (const x of [m, m + 1]) for (let z = this.N - 2; z > 2; z--) { if (this.occ[z * this.N + x]) break; this.roads[z * this.N + x] = 1; }
  }
}
