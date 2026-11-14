// The simulation: the base, its troops, its supply lines, the three Ministries, the rival factions and the week.
// No DOM and no 3D here, so it runs in Node for balance tests (test/headless.mjs).
//
// The base is a training and staging camp. Recruits arrive with the daily supply pelican, train at the range, the
// obstacle course, the parade ground and the Citizenship Hall, and Defence's deployment orders ship the trained ones
// to the front. Rations, fuel and ammo arrive by pelican every morning, billed automatically, and forklifts and trucks
// carry them along your roads to where they are used. Nothing needs a click to keep moving.
import { FOUNDATION, EARLY } from './config.js';
import { LAND } from './config.js';
import { C, B, MIN, CREW_ORDER, MISSIONS, OP_A, OP_B, RIVALS, SURNAMES, RANKS, PLANETS, FACTION_DEFAULT, GOODS, GKEYS, ROADS, VEHICLES, TRAIN, TECH, DESIGNS, PARTS, PARTS_FOR, LOANS, DEBT_MAX, DIFF, STD, ZONES, GROWS, GROW, UTIL } from './config.js';
import { RNG } from './rng.js';
import { findPath } from './path.js';
import { REQUESTS, GRADES, trueGrade, CALLS, hasOffice } from './desk.js';
import { makeSite, biomeOf, GROUND, RW, RH, survey, regionKind, placeName } from './site.js';
import { writeReport } from './reports.js';
import { Build } from './build.js';
import { Zones } from './zones.js';
import { Utilities } from './utils.js';
import { Land, GRID } from './land.js';
import { Market, bindMarket } from './market.js';
import { emptyNet, raster, addLine, snap, nearestSeg, removeSeg, segLen, lineTiles, node, KINDS } from './net.js';

export const MKEYS = ['def', 'pro', 'tru'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FAST = [1, ROADS[1].speed, ROADS[2].speed];
// wheels belong on roads: off them a vehicle crawls, so routes follow the road network wherever there is one
const VFAST = [0.3, ROADS[1].speed, ROADS[2].speed];

export function rankOf(missions) { let r = RANKS[0][1]; for (const [n, name] of RANKS) if (missions >= n) r = name; return r; }

// footprint after rotation, and which way the front faces (0 +z, 1 +x, 2 -z, 3 -x)
export function dims(type, rot, design = 0) { const d = B[type], w = d.w + (PARTS_FOR[type] ? (DESIGNS[design || 0]?.wings || 0) * 2 : 0); return rot % 2 ? [d.d, w] : [w, d.d]; }
// how many tiles of wing a building has each side (old saves keep the size they were built at)
export function wingOf(b) { return Math.max(0, ((b.rot % 2 ? b.d : b.w) - B[b.type].w) / 2); }

const zero = () => ({ rations: 0, fuel: 0, ammo: 0 });
const fmt = n => Math.round(n).toLocaleString('en-US');
// the most open, best-covered spot near the middle of the region map, for a base founded without picking one
export function bestSite(seed, biome, N, all = false) {
  let best = null; const list = [];
  for (let v = RH * 0.3; v <= RH * 0.7; v += 9) for (let u = RW * 0.3; u <= RW * 0.7; u += 9) {
    const s = survey(seed, biome, u, v, Math.min(N, 56)), score = s.open * 0.7 + s.cover * 0.4 + (s.seeps ? 0.05 : 0) + (s.ore ? 0.05 : 0) - (s.open < 0.6 ? 1 : 0);
    list.push({ u, v, score }); if (!best || score > best.score) best = { u, v, score };
  }
  return all ? list.sort((a, b) => b.score - a.score) : best;
}
// small things that go anywhere inside the wall; everything else is built on a roadside plot, door to the street
export const LOOSE = new Set(['flag', 'banner', 'hdbanner', 'potty', 'vend', 'speaker', 'solar', 'lookout', 'substation', 'well', 'tower']);

export class Sim {
  constructor(opts = {}) {
    if (opts.state) { this.load(opts.state); return; }
    this.seed = (opts.seed ?? (Date.now() & 0x7fffffff)) >>> 0;
    this.rng = new RNG(this.seed);
    this.N = C.N;
    this.t = 0; this.week = 1; this.wt = 0; this.inspected = false;
    this.faction = structuredClone(opts.faction || FACTION_DEFAULT);
    this.diff = DIFF[opts.diff || this.faction.diff] ? opts.diff || this.faction.diff : 'veteran';
    this.planet = this.faction.planet || this.rng.pick(PLANETS);
    // the landing site: chosen on the planet map, or the best open spot near the middle if none was chosen
    const biome = biomeOf(this.planet), site = opts.flat ? null : opts.site || bestSite(this.seed, biome, this.N);
    this.site = site ? { seed: this.seed, biome, u: site.u, v: site.v } : null; this.stage = opts.flat ? C.STAGES.length - 1 : 0; if (opts.flat) this.foundedF = true;
    this.supplies = C.START.supplies; this.credits = C.START.credits; this.mood = 0; this.desk = []; this.flow = { cur: this.newFlow(), last: null, today: this.newDay(), days: [] };
    this.loans = [{ k: 'charter', bal: this.D.charter }]; this.calls = []; this.supplies = this.D.sup;
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
    // the land: parcels, none held until the HQ comes down (a flat test map holds the middle 7 x 7, about the old 80 tiles)
    this.own = new Uint8Array(GRID * GRID);
    this.genMap();
    this.updateRivals();
    this.std = opts.flat ? 2 : 0;   // the standard the build menu is set to: tents, to start (a flat test map keeps the old base)
    this.scrub = this.makeScrub(); this.crewsInit(); this.zone = new Uint8Array(this.N * this.N); this.chain = null;
    this.net = emptyNet();
    for (let i = 0; i < C.START.troops; i++) this.addTroop(i < 3 ? 100 : 30);
    this.flat = !!opts.flat;
    // a new game opens on the empty section: the Commander calls the HQ in. Everyone else (tests, the bot, the title demo)
    // gets it set down on open ground near the middle
    if (opts.callIn) { this.callIn = 'flag'; this.rebuildNet(); this.ranking(); this.tick(); this.marketInit(); this.recalc(); return; }
    if (opts.flat) { const m = this.N / 2; this.found(m - 3, m - 3, { force: true }); const c = (GRID - 1) / 2; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) this.own[(c + j) * GRID + c + i] = 1; this.rebuildNet(); }
    else { const at = opts.at || this.autoSpot(); this.found(at[0], at[1], { force: !!opts.at }); }
    this.begin();
  }
  // the first day, once the HQ is down: the first offers, the Ministries' first words, the sweep
  begin() {
    const opts = { flat: this.flat };
    this.newOffers(); this.newOrder();
    this.ranking(); this.tick(); this.marketInit();
    this.say('base', `${this.faction.name} has landed on ${this.planet}. ${this.faction.base} is yours to build, Commander. ${C.START.troops} votes have been delivered to your base. You have open ground, a command post and ${C.START.supplies} supplies: draw a road, then build along it.`);
    if (!opts.flat) this.startSweep();
    this.say('def', 'The Ministry of Defence expects trained troopers. Train your recruits; transports leave from the landing pad every afternoon.');
    this.recalc();
  }

  // ---------------------------------------------------------------- map
  genMap() {
    const N = this.N;
    this.occ = new Int32Array(N * N);
    if (this.site) { const g = makeSite(this.site.seed, this.site.biome, this.site.u, this.site.v, N); this.terr = g.terr; this.hgt = g.hgt; } else { this.terr = new Uint8Array(N * N); this.hgt = null; }
    if (!this.roads) this.roads = new Uint8Array(N * N);
    if (!this.walls) this.walls = new Uint8Array(N * N);
    if (!this.inMask) this.inMask = new Uint8Array(N * N);
  }
  rebuildNet() {
    const r = raster(this.net, this.N, this.blockMask());
    this.roads = r.roads; this.walls = r.walls; this.wallIn = r.inside; this.gates = r.gates; this.area = r.area;
    if (this.scrub) for (let i = 0; i < this.scrub.length; i++) if (this.scrub[i] && (this.roads[i] || this.walls[i])) { this.scrub[i] = 0; this.scrubV = (this.scrubV || 0) + 1; }
    // a wall is for defence: it marks what is inside the perimeter (wallIn), but you may build on any of your land, in or out
    this.open = r.area === 0;
    const N = this.N; this.inMask = new Uint8Array(N * N);
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) { const i = z * N + x; this.inMask[i] = this.walls[i] || (this.blocked(i) && !this.roads[i]) ? 0 : 1; }
    // only on ground the Bureau has granted: the parcels you hold, or the old square charter
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (!this.ownedTile(x, z)) this.inMask[z * N + x] = 0;
    this.roadsV = (this.roadsV || 0) + 1; this.events?.push({ t: 'roads' });
  }
  blocked(i) { const t = this.terr?.[i]; return t === GROUND.WATER || t === GROUND.ROCK; }
  blockMask() { const N = this.N, m = new Uint8Array(N * N); if (this.terr) for (let i = 0; i < N * N; i++) m[i] = this.blocked(i) ? 1 : 0; return m; }
  // the charter's square: [lo, hi) on both axes
  box() { const [x0, z0, x1, z1] = this.ownBounds(); return [Math.min(x0, z0), Math.max(x1, z1)]; }   // the square round every parcel held
  // ---------------------------------------------------------------- the charter: outpost, fort, major base
  nextStage() { return C.STAGES[(this.stage || 0) + 1] || null; }
  stageCheck() {
    const n = this.nextStage(); if (!n) return null;
    return [{ ok: this.heads() >= n.troops, text: `${n.troops} votes on the base (${this.heads()})` }, { ok: this.stand.pro >= n.pro, text: `Expansion standing ${n.pro} (${Math.round(this.stand.pro)})` }, { ok: this.credits >= n.cr, text: `${n.cr.toLocaleString('en-US')} credits for the charter fee (${Math.round(this.credits).toLocaleString('en-US')})` }, { ok: this.supplies >= (n.sup || 0), text: `${(n.sup || 0).toLocaleString('en-US')} supplies for the charter works (${Math.round(this.supplies).toLocaleString('en-US')})` }].filter(c => !/^0 supplies/.test(c.text));
  }
  promote() {
    const n = this.nextStage(), ck = this.stageCheck(); if (!n || ck.some(c => !c.ok)) return false;
    this.spend('charter', n.sup || 0, n.cr); this.stage++; this.rebuildNet(); this.gain('pro', 6); this.pride += 4;
    this.say('bur', `The Bureau grants a new charter: ${this.faction.base} is now a ${n.name}. You may now hold up to ${n.parcels >= 441 ? 'every grantable' : n.parcels} parcels of land (LAND), the daily allocation rises, and new buildings may be raised. Congratulations, and the fee has been taken: ${n.cr.toLocaleString('en-US')} credits and ${(n.sup || 0).toLocaleString('en-US')} supplies.`);
    this.events.push({ t: 'stage', stage: this.stage }); return true;
  }
  inside(x, z) { return x >= 0 && z >= 0 && x < this.N && z < this.N && this.inMask[z * this.N + x] === 1; }
  road(x, z) { return x >= 0 && z >= 0 && x < this.N && z < this.N && this.roads[z * this.N + x] > 0; }
  // the main gate: the one nearest the bottom of the map. x, z: just inside it; ox, oz: off the edge of the map beyond it
  gate() {
    const N = this.N, gs = this.gates || [];
    if (!gs.length) {   // no wall yet: the way in is the road south from the HQ, off the bottom of your ground
      const hq = this.b.find(b => b.type === 'hq'), cx = hq ? hq.x + hq.w / 2 : N / 2, z1 = this.ownBounds()[3] || N / 2;
      return { x: cx, z: z1 - 2, ox: cx, oz: Math.min(N + 5, z1 + 30), gx: cx, gz: z1 };
    }
    const g = gs.reduce((p, q) => q.z > p.z ? q : p);
    let cx = 0, cz = 0, n = 0; for (let i = 0; i < N * N; i++) if (this.wallIn[i]) { cx += i % N; cz += (i / N) | 0; n++; }
    cx = n ? cx / n + 0.5 : N / 2; cz = n ? cz / n + 0.5 : N / 2;
    const dx = g.x - cx, dz = g.z - cz, ax = Math.abs(dx) > Math.abs(dz), sx = ax ? Math.sign(dx) : 0, sz = ax ? 0 : Math.sign(dz) || 1;
    const far = Math.min(30, ax ? (sx > 0 ? N - g.x : g.x) : (sz > 0 ? N - g.z : g.z));   // arrivals come in from 30 tiles out
    return { x: g.x - sx * 1.5, z: g.z - sz * 1.5, ox: g.x + sx * (far + 5), oz: g.z + sz * (far + 5), gx: g.x, gz: g.z };
  }
  walkGrid() {   // where people and vehicles can go: anywhere on the map that isn't a building or a wall; gates are open
    if (this._walkV === this.layoutV()) return this._walk;
    const N = this.N, w = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) w[i] = !this.occ[i] && this.walls[i] !== 1 && (!this.blocked(i) || this.roads[i]) ? 1 : 0;
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
  drivePath(sx, sz, ex, ez) {
    const N = this.N, w = this.walkGrid(), cl = v => Math.max(0, Math.min(N - 1, Math.floor(v)));
    let [ax, az] = [cl(sx), cl(sz)], [bx, bz] = this.nearWalk(cl(ex), cl(ez));
    if (!w[az * N + ax]) [ax, az] = this.nearWalk(ax, az);
    if (this._dpathV !== this._walkV) { this._dpaths = new Map(); this._dpathV = this._walkV; }
    const key = ((az * N + ax) * N + bz) * N + bx, hit = this._dpaths.get(key);
    if (hit) return hit.map(p => [p[0], p[1]]);
    const p = findPath(N, w, this.roads, VFAST, ax, az, bx, bz) || [[bx + 0.5, bz + 0.5]];
    if (this._dpaths.size > 2000) this._dpaths.clear();
    this._dpaths.set(key, p.map(q => [q[0], q[1]]));
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
  checkLine(a, b, k, dry) {
    const len = Math.hypot(b.x - a.x, b.z - a.z), tiles = lineTiles(this.N, a.x, a.z, b.x, b.z, KINDS[k].w);
    let wet = 0; for (const [x, z] of tiles) { const t = this.terr?.[z * this.N + x]; if (t === GROUND.ROCK) return { ok: false, why: 'Solid rock in the way', cost: 0 }; if (t === GROUND.WATER) { if (k === 'wall') return dry ? { ok: false, why: 'Water', cost: 0 } : this.shoreWall(a, b); return { ok: false, why: 'Water: nothing is built on it', cost: 0 }; } }
    const cost = Math.ceil(len) * this.linePrice(k) + Math.ceil(wet / KINDS[k].w) * this.linePrice(k) * (C.BRIDGE - 1);
    if (tiles.some(([x, z]) => !this.ownedTile(x, z))) return { ok: false, why: 'Outside your ground: buy the parcel first (LAND)', cost };
    if (len < 0.9) return { ok: false, why: 'Too short', cost };
    if (a.x < 0 || a.z < 0 || b.x < 0 || b.z < 0 || a.x > this.N || a.z > this.N || b.x > this.N || b.z > this.N) return { ok: false, why: 'Off the map', cost };
    for (const [x, z] of lineTiles(this.N, a.x, a.z, b.x, b.z, KINDS[k].w)) if (this.occ[z * this.N + x]) return { ok: false, why: 'A building is in the way', cost };
    if (this.supplies < cost) return { ok: false, why: 'Not enough supplies', cost };
    return { ok: true, cost };
  }
  // a wall drawn across water stops at each shore and picks up on the far side: the water closes the gap
  wallRuns(a, b) {
    const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(2, Math.ceil(len * 4)), W = (x, z) => x >= 0 && z >= 0 && x < this.N && z < this.N && this.terr?.[z * this.N + x] === GROUND.WATER,
      wet = t => { const x = Math.floor(a.x + (b.x - a.x) * t), z = Math.floor(a.z + (b.z - a.z) * t); return W(x, z) || W(x + 1, z) || W(x - 1, z) || W(x, z + 1) || W(x, z - 1); };
    const runs = []; let s = null;
    for (let i = 0; i <= n; i++) { const t = i / n, w = wet(t); if (!w && s === null) s = t; if ((w || i === n) && s !== null) { const e = w ? (i - 1) / n : 1; if ((e - s) * len >= 0.9) runs.push([s, e]); s = null; } }
    const at = (t, end) => t === 0 ? a : t === 1 ? b : { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    return runs.map(([s, e]) => [at(s), at(e)]);
  }
  shoreWall(a, b) {
    const runs = this.wallRuns(a, b);
    if (!runs.length) return { ok: false, why: 'All water: the shore defends itself', cost: 0 };
    let cost = 0; const ok = [];
    for (const [p, q] of runs) { const c = this.checkLine(p, q, 'wall', true); if (c.ok) { cost += c.cost; ok.push([p, q]); } else if (c.why !== 'Water' && c.why !== 'Too short') return c; }
    if (!ok.length) return { ok: false, why: 'Walls stop at the water: the shore defends itself', cost: 0 };
    if (this.supplies < cost) return { ok: false, why: 'Not enough supplies', cost };
    return { ok: true, cost, runs: ok, why: 'The wall stops at the shore; the water closes the gap' };
  }
  drawLine(a, b, k) {
    const c = this.checkLine(a, b, k); if (!c.ok) return null;
    if (c.runs) { let first = null; for (const [p, q] of c.runs) { const s = addLine(this.net, p, q, k); if (s) { first ??= s; } } if (first) { this.spend('build', c.cost); this.rebuildNet(); } return first; }
    const s = addLine(this.net, a, b, k); if (!s) return null;
    this.spend('build', c.cost); this.rebuildNet(); return s;
  }
  removeLine(x, z) {
    const s = nearestSeg(this.net, x, z); if (!s) return null;
    this.earn('refund', Math.floor(Math.ceil(segLen(this.net, s)) * this.linePrice(s.k) / 2));
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
    if (d.stage && (this.stage || 0) < d.stage) n.push(`a ${C.STAGES[d.stage].name} charter`);
    if (d.pad && this.count('pad') >= this.padCap()) n.push(this.has('comms') || this.count('comms') ? 'another Comms Tower' : 'a Comms Tower');
    if (!this.founded() && !EARLY.has(type)) n.push(`the foundation first (${this.foundMissing().map(t => B[t].name).join(', ')})`);
    return n.length ? n : null;
  }
  // the foundation: once a base has placed these it can build anything; until then, only what brings money in
  foundMissing() { return FOUNDATION.filter(t => !this.b.some(b => b.type === t)); }
  founded() { if (this.foundedF) return true; if (!this.foundMissing().length) { this.foundedF = true; this.say('base', 'The foundation is laid: pad, depot, barracks, mess and range. Every other building is open to you now.'); return true; } return false; }
  padCap() { return 1 + this.count('comms') * (this.hasTech('radio') ? 3 : 2) + this.count('mast') * B.mast.pads; }
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
    if (this.credits - TECH[k].cost < -this.OD) return false;
    this.spend('research', 0, TECH[k].cost); this.tech.cur = k; this.tech.pts = 0;
    this.say('base', `The Science Lab begins work on ${TECH[k].name}. Results in about ${TECH[k].hrs} lab hours.`);
    return true;
  }
  labRate() {
    const on = this.b.filter(b => b.done && !b.off), boost = on.filter(b => b.type !== 'lab').reduce((a, b) => a + this.stat(b, 'lab') * this.work(b), 0);
    return on.filter(b => b.type === 'lab').reduce((a, b) => a + this.work(b) * (1 + this.stat(b, 'lab')), 0) * (1 + boost);
  }
  study(dt) {
    const k = this.tech.cur; if (!k) return;
    this.tech.pts += this.labRate() * dt / C.DAY * 24;
    if (this.tech.pts < TECH[k].hrs) return;
    this.tech.done.push(k); this.tech.cur = null; this.tech.pts = 0;
    this.events.push({ t: 'tech', k });
    this.say('base', `Research complete: ${TECH[k].name}. ${TECH[k].desc} The scientists have been thanked and reassigned.`);
  }

  canPlace(type, x, z, rot = 0, spec = null) {
    const d = B[type]; if (!d) return { ok: false, why: 'Unknown building' };
    if (d.fixed) return { ok: false, why: 'Cannot be built' };
    if (d.unique && this.count(type)) return { ok: false, why: 'Only one allowed' };
    if (GROWS.has(type) && !spec?.grow) return { ok: false, why: `Grows by itself in a ${ZONES[GROWS.get(type)].name} zone: paint one from the ZONES bar` };
    if (d.chain) { const other = this.b.find(b => B[b.type].chain && b.type !== type); if (other) return { ok: false, why: `Exclusive franchise agreement with ${B[other.type].name}` }; }
    const lk = this.locked(type); if (lk) return { ok: false, why: 'Needs ' + lk.join(' and ') };
    if (this.hasStd(type)) { const sl = this.stdLock(this.stdFor(type, spec)); if (sl) return { ok: false, why: sl + ': build it as a tent or prefab' }; }
    if (this.supplies < this.costOf(type, spec)) return { ok: false, why: 'Not enough supplies' };
    if (d.atGate && !(this.gates || []).some(g => Math.hypot(g.x - x - 1, g.z - z - 0.5) < 4.5)) return { ok: false, why: 'Stands at a gate: within four tiles of one' };
    const dz = spec?.design || 0, f = this.fits(type, x, z, rot, dz); if (!f.ok) return f;
    if (this.inBuffer(type, x, z, rot, dz)) return { ok: false, why: 'Buffer zone: kept clear' };
    if (d.atWater) { const [w, dd] = dims(type, rot, dz); if (!this.nearWater(x, z, w, dd, 2)) return { ok: false, why: 'Must stand within two tiles of water' }; }
    if (d.deposit) { const [w, dd] = dims(type, rot, dz); let on = 0; for (let j = 0; j < dd; j++) for (let i = 0; i < w; i++) if (this.terr?.[(z + j) * this.N + x + i] === d.deposit) on++; if (on < 2) return { ok: false, why: d.deposit === 3 ? 'Must stand on an E-710 seep' : 'Must stand on an ore field' }; }
    if (d.atWall) { let near = false; for (let j = -2; j <= 2 && !near; j++) for (let i = -2; i <= 2; i++) { const tx = x + i, tz = z + j; if (tx >= 0 && tz >= 0 && tx < this.N && tz < this.N && this.walls[tz * this.N + tx]) { near = true; break; } } if (!near) return { ok: false, why: 'Stands at the wall: within two tiles of it' }; }
    if (!LOOSE.has(type) && !this.frontage(type, x, z, rot, dz)) return { ok: false, why: 'Needs a road out front: build along a road' };
    return f;
  }
  // a building's door has to open onto a road
  frontage(type, x, z, rot, dz = 0) { const [w, d] = dims(type, rot, dz), [tx, tz] = this.door({ x, z, w, d, rot }); return this.road(tx, tz); }
  // the roadside plot nearest the pointer that this building fits: it faces the road with its door on the street
  plotFor(type, px, pz, dz = 0) {
    let best = null;
    const cx = Math.floor(px), cz = Math.floor(pz);
    for (let rot = 0; rot < 4; rot++) {
      const [w, d] = dims(type, rot, dz);
      for (let z = cz - 7; z <= cz + 7; z++) for (let x = cx - 7; x <= cx + 7; x++) {
        const dist = Math.hypot(x + w / 2 - px, z + d / 2 - pz); if (best && dist >= best.dist) continue;
        if (!this.fits(type, x, z, rot, dz).ok || !this.frontage(type, x, z, rot, dz)) continue;
        best = { tx: x, tz: z, rot, dist };
      }
    }
    return best;
  }
  // the roadside strips buildings can go on: free ground inside the wall within four tiles of a road
  plotTiles() {
    const N = this.N, dist = new Int8Array(N * N).fill(-1), q = [];
    for (let i = 0; i < N * N; i++) if (this.roads[i] && this.inMask[i]) { dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % N; if (dist[i] >= 4) continue;
      for (const j of [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, i - N, i + N]) if (j >= 0 && j < N * N && dist[j] < 0 && this.inMask[j] && !this.roads[j] && !this.occ[j] && !this.walls[j]) { dist[j] = dist[i] + 1; q.push(j); }
    }
    const out = []; for (let i = 0; i < N * N; i++) if (dist[i] > 0) out.push([i % N, (i / N) | 0, dist[i]]); return out;
  }
  fits(type, x, z, rot, dz = 0, self = 0) {
    const [w, dd] = dims(type, rot, dz);
    for (let j = 0; j < dd; j++) for (let i = 0; i < w; i++) {
      const tx = x + i, tz = z + j;
      if (!this.inside(tx, tz)) return { ok: false, why: !this.ownedTile(tx, tz) ? 'Outside your land: buy the parcel first (LAND)' : this.walls[tz * this.N + tx] ? 'A wall is in the way' : 'Off the map' };
      if (this.occ[tz * this.N + tx] && this.occ[tz * this.N + tx] !== self) return { ok: false, why: 'Something is in the way' };
      if (this.roads[tz * this.N + tx]) return { ok: false, why: 'There is a road here' };
      const tr = this.terr?.[tz * this.N + tx]; if (tr === GROUND.WATER) return { ok: false, why: 'That is water' }; if (tr === GROUND.ROCK) return { ok: false, why: 'Solid rock' };
    }
    return { ok: true };
  }
  place(type, x, z, rot = 0, free = false, spec = null) {
    const d = B[type], cost = this.costOf(type, spec);
    if (!free) { const c = this.canPlace(type, x, z, rot, spec); if (!c.ok) return null; this.spend('build', cost); }
    const [w, dd] = dims(type, rot, spec?.design);
    const b = { id: this.nid++, type, x, z, rot, w, d: dd, cond: 100, prog: free ? 1 : 0, done: free, off: false, crew: 0, time: 6 + cost / 25, stock: zero() };
    if (d.squads) b.squads = d.squads;
    if (this.designable(type)) { b.design = spec?.design || 0; b.parts = (spec?.parts || []).filter(p => PARTS_FOR[type][p]); b.cost = cost; }
    if (this.hasStd(type)) { b.std = this.stdFor(type, spec); b.cost = cost; b.time = this.buildTime(type, b.std); }
    if (!free) { b.clr = this.scrubUnder(x, z, w, dd); if (!b.clr.length) delete b.clr; }
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
    this.earn('refund', Math.round((b.cost ?? B[b.type].cost) * (b.done ? C.REFUND : 1)));
    for (const t of this.troops) { if (t.job === id) { t.job = null; if (t.state === 'job') t.state = 'idle'; } if (t.at === id) t.at = null; }
    for (const v of this.veh) if (v.job && (v.job.src === id || v.job.dst === id)) this.dropJob(v);
    this.veh = this.veh.filter(v => v.home !== id);
    if (this.cleaning === id) this.cleaning = null;
    this.events.push({ t: 'removed', id }); this.roadsV++;
    return true;
  }
  repairCost(b) { return Math.ceil((b.cost ?? B[b.type].cost) * 0.25 * (1 - b.cond / 100)) + (b.cond < 100 ? 5 : 0); }
  repair(id) {
    const b = this.byId(id); if (!b || b.cond >= 100) return false;
    const c = this.repairCost(b); if (this.supplies < c) return false;
    this.spend('repair', c); b.cond = 100; return true;
  }
  toggle(id) { const b = this.byId(id); if (b && (B[b.type].crew || B[b.type].pw < 0)) b.off = !b.off; }
  setSquads(id, n) { const b = this.byId(id); if (b && B[b.type].squads) b.squads = clamp(n, 0, 3); }
  door(b) {   // the tile in front of a building, where people go in and out
    const cx = b.x + Math.floor(b.w / 2), cz = b.z + Math.floor(b.d / 2);
    return [[cx, b.z + b.d], [b.x + b.w, cz], [cx, b.z - 1], [b.x - 1, cz]][b.rot];
  }

  // ---------------------------------------------------------------- troops
  addTroop(train = 0) {
    const base = 40 + this.rng.int(40), tq = () => clamp(base + this.rng.int(36) - 12, 20, 99);
    const t = { q: { aim: tq(), fit: tq(), con: tq() }, grade: null, id: this.nid++, name: `${'ABCDEFGHJKLMNPRSTVW'[this.rng.int(19)]}. ${this.rng.pick(SURNAMES)}`, missions: 0, medals: 0, drill: 0, train, job: null, at: null, state: 'idle' };
    this.troops.push(t); return t;
  }
  troop(id) { return this.troops.find(t => t.id === id); }
  trained(t) { return t.train >= 100; }

  // ---------------------------------------------------------------- goods: who stores what, who needs what
  // a building's stat with its design and parts. k: prop, mor, sales, watch, guns, odds, lab, pw, pride
  stat(b, k) {
    let v = B[b.type][k] || 0; if (typeof v !== 'number') return v;
    const pf = PARTS_FOR[b.type]; if (pf && b.parts) for (const p of b.parts) v += pf[p]?.[k] || 0;
    const dz = DESIGNS[b.design || 0]; if (dz[k]) v += dz[k];
    if ((k === 'mor' || k === 'prop') && b.std != null) v *= STD[this.stdOf(b)][k];
    return v;
  }
  designable(type) { return !!PARTS_FOR[type]; }
  // refitting a building to another design or other parts: it pays the difference and a refit fee, closes while the work
  // is done, and the new design has to fit on the ground round it (the wings of Fortified and Monumental need a tile each side)
  refit(b, spec) {
    if (!b || !this.designable(b.type) || !spec) return { ok: false, why: 'This building has one design' };
    if (!b.done) return { ok: false, why: 'Finish building it first' };
    const same = (b.design || 0) === (spec.design || 0) && [...(b.parts || [])].sort().join() === [...(spec.parts || [])].sort().join();
    const now = this.costOf(b.type, spec), was = b.cost ?? this.costOf(b.type, { design: b.design || 0, parts: b.parts || [] });
    const cost = Math.max(0, now - was) + Math.ceil(B[b.type].cost * C.REFIT);
    if (same) return { ok: false, why: 'That is the design it has', cost: 0 };
    const [w, d] = dims(b.type, b.rot, spec.design), x = Math.round(b.x + b.w / 2 - w / 2), z = Math.round(b.z + b.d / 2 - d / 2);
    const f = this.fits(b.type, x, z, b.rot, spec.design, b.id); if (!f.ok) return { ...f, why: f.why === 'Something is in the way' ? 'No room: the wings need a clear tile each side' : f.why, cost, x, z, w, d };
    if (this.supplies < cost) return { ok: false, why: 'Not enough supplies', cost, x, z, w, d };
    return { ok: true, cost, x, z, w, d };
  }
  redesign(id, spec) {
    const b = this.byId(id), c = this.refit(b, spec); if (!c.ok) return c;
    for (let i = 0; i < this.occ.length; i++) if (this.occ[i] === b.id) this.occ[i] = 0;
    Object.assign(b, { x: c.x, z: c.z, w: c.w, d: c.d, design: spec.design || 0, parts: (spec.parts || []).filter(p => PARTS_FOR[b.type][p]), cost: this.costOf(b.type, spec) });
    for (let j = 0; j < c.d; j++) for (let i = 0; i < c.w; i++) this.occ[(c.z + j) * this.N + c.x + i] = b.id;
    this.spend('build', c.cost); b.done = false; b.prog = 0.5; b.time = 3 + c.cost / 25; b.refit = true;
    this.events.push({ t: 'placed', id: b.id }); this.roadsV = (this.roadsV || 0) + 1;
    return c;
  }
  costOf(type, spec) {
    const d = B[type]; if (this.hasStd(type)) return Math.round(this.stdBase(type) * STD[this.stdFor(type, spec)].cost);
    if (!spec || !this.designable(type)) return d.cost;
    return Math.round(d.cost * DESIGNS[spec.design || 0].cost + (spec.parts || []).reduce((a, p) => a + (PARTS[p]?.cost || 0), 0));
  }
  storeCap(b, g) { return b.done && B[b.type].store ? Math.floor((B[b.type].store[g] || 0) * this.capF(b) * (b.nearPad ? GROW.padBonus : 1) * (this.hasTech('shelving') ? 1.25 : 1)) : 0; }
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
    this.utilities();   // coverage: who has power, water and sewage (js/utils.js)
    const done = this.b.filter(b => b.done);
    let made = 0, used = 0, beds = 0;
    for (const b of done) {
      const d = B[b.type];
      if (d.beds) beds += this.cap(b, 'beds');
      if (b.off) continue;
      const pw = this.stat(b, 'pw'); if (pw < 0 && !b.dark) used -= pw;   // a building outside the grid draws nothing
    }
    // crew: keep troops where they are if they're still needed, then fill in priority order, trained troopers first,
    // so recruits stay free to train
    const need = new Map();
    for (const b of done) if (B[b.type].crew && !b.off) need.set(b.id, B[b.type].crew);
    for (const b of done) b.crew = 0;
    for (const t of this.troops) if (t.hurt > 0 && t.state !== 'patrol') { t.state = 'hurt'; t.job = null; t.at = null; t.gate = null; }
    const home = this.troops.filter(t => t.state !== 'patrol' && t.state !== 'sweep' && !(t.hurt > 0));
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
    // every gate wants a trained trooper on it
    const gN = (this.gates || []).length, taken = new Set();
    for (const t of home) { if (t.job || t.gate == null || t.gate >= gN || taken.has(t.gate)) t.gate = null; else taken.add(t.gate); }
    for (let g = 0; g < gN; g++) if (!taken.has(g)) { const t = home.find(t => !t.job && t.gate == null && t.train >= 100); if (t) { t.gate = g; taken.add(g); } }
    for (const t of home) if (t.gate != null) { t.state = 'guard'; t.at = null; }
    this.guards = taken.size;
    // power after crew, since a generator needs its crew and its fuel
    for (const b of done) {
      const d = B[b.type], pw = this.stat(b, 'pw'); if (b.off) continue;
      if (pw > 0 && d.pw <= 0) { made += pw; continue; }   // parts that add power to a building that otherwise draws it
      if (!(d.pw > 0)) continue;
      if (b.type === 'gen') made += d.pw * this.crewFrac(b) * (b.stock.fuel > 0.01 ? 1 : 0) * this.condF(b);
      else made += pw + (b.type === 'solar' && this.hasTech('solar') ? 2 : 0);
    }
    this.power = { made: Math.round(made), used, ratio: used > 0 ? Math.min(1, made / used) : 1 };
    this.slowF = done.some(o => B[o.type].sluggish) ? 1 - B.chicken.sluggish : 1;
    this.beds = beds;
    this.citizens = done.reduce((a, b) => a + (B[b.type].staff || 0), 0);
    this.wardBeds = done.filter(b => B[b.type].ward && !b.off && b.crew > 0).reduce((a, b) => a + this.cap(b, 'ward'), 0);
    this.idle = home.filter(t => t.state === 'idle' && !t.at).length;
    // propaganda and morale, each kind worth less the more of it you already have, so variety pays
    const seen = {}; let prop = 0, comfort = 0;
    for (const b of done) {
      const d = B[b.type], n = (seen[b.type] = (seen[b.type] || 0) + 1), dim = Math.pow(0.7, n - 1), cf = this.condF(b);
      const run = d.crew ? this.crewFrac(b) * (b.off ? 0 : 1) : 1;
      const dp = this.stat(b, 'prop'), dm = this.stat(b, 'mor');
      if (dp) prop += dp * dim * cf * (d.crew ? 0.4 + 0.6 * run : 1) * (d.pw < 0 ? 0.5 + 0.5 * (b.dark ? 0 : this.power.ratio) : 1);
      if (dm) comfort += dm * dim * cf * run * (d.potty ? (b.clean ?? 100) / 100 : 1) * (d.eat && b.stock.rations <= 0 ? 0.3 : 1);
    }
    this.prop = Math.round(100 * (1 - Math.exp(-prop / 55)));
    const worn = done.length ? done.filter(b => b.cond < 40).length / done.length : 0;
    const over = Math.max(0, this.troops.length - beds);
    const pots = done.filter(b => B[b.type].potty), users = home.length;
    const filthy = pots.filter(b => (b.clean ?? 100) < 25).length, queue = pots.length ? Math.max(0, users / pots.length - 10) : (users > 8 ? users - 8 : 0);
    this.potties = { n: pots.length, filthy, perPotty: pots.length ? users / pots.length : users };
    this.seats = done.filter(b => B[b.type].eat && !b.off).reduce((a, b) => a + this.cap(b, 'eat'), 0);
    this.mor = {
      base: 45,
      comfort: Math.round(30 * (1 - Math.exp(-comfort / 22))),
      prop: Math.round(this.prop * 0.12),
      pride: Math.round(this.pride),
      food: -Math.round(25 * this.hunger),
      crowd: -Math.min(25, over * 4),
      power: -Math.round(15 * (1 - this.power.ratio)),
      grief: -Math.round(this.grief),
      mood: Math.round(this.mood || 0),
      unpaid: this.unpaidDays ? -Math.min(10, 4 + this.unpaidDays) : 0,
      worn: -Math.round(12 * worn),
      latrine: -Math.min(12, Math.round(filthy * 4 + queue * 0.8)),
      noise: -Math.round(8 * (this.adj?.noise || 0)),
      hazard: -Math.min(6, 2 * (this.adj?.hazard || 0)),
      ...this.utilMorale(),
    };
    if (this.commit) this.mor.commit = 2 * this.commitF('tru');
    this.moraleTarget = clamp(Object.values(this.mor).reduce((a, b) => a + b, 0), 0, 100);
    this.avgCond = done.length ? done.reduce((a, b) => a + b.cond, 0) / done.length : 100;
  }
  crewFrac(b) { const c = B[b.type].crew; return c ? b.crew / c : 1; }
  condF(b) { return b.cond < 40 ? 0.5 : b.cond < 70 ? 0.85 : 1; }
  work(b) {   // how hard a building runs right now, 0..1+
    const d = B[b.type]; if (!b.done || b.off) return 0;
    const pw = d.pw < 0 ? (b.dark ? 0 : this.power.ratio) : 1;
    const slow = this.slowF ?? 1;
    return this.crewFrac(b) * pw * this.condF(b) * (0.6 + 0.8 * this.morale / 100) * slow * (b.upg ? 0.5 : 1) * this.zoneFit(b);
  }

  // ---------------------------------------------------------------- the clock
  step(dt) {
    this.t += dt; this.wt += dt;
    const k = dt / C.T, day = dt / C.DAY;   // economy time (the old 150 s week's scale), and the fraction of a day
    this.recalc();
    this.construct(dt);   // the engineers build (js/build.js)
    this.consume(day);
    this.train(dt); this.study(dt);
    // the wounded mend: properly in a staffed Medical Bay, slowly in their bunks
    { let bed = this.wardBeds;
      for (const t of this.troops) if (t.hurt > 0 && t.state !== 'patrol') {
        t.hurt -= dt * (bed-- > 0 ? 1 : 0.3);
        if (t.hurt <= 0) { t.hurt = 0; t.state = 'idle'; this.say('def', `${rankOf(t.missions)} ${t.name} is discharged and fit for duty.`); }
      } }
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
    if (before && Math.floor(before.sh) !== Math.floor(this.time.sh)) this.hourly(Math.floor(this.time.sh));
    for (const p of this.patrols.filter(p => p.t >= p.dur)) this.resolve(p);
    if (!this.inspected && this.wt >= C.WEEK * C.INSPECT_AT) this.inspect();
    if (this.wt >= C.WEEK) this.endWeek();
  }
  hourly(h) {
    if (h === C.SUPPLY_AT) this.supplyRun();
    if (h === C.PATROL_AT) this.standingPatrols();
    if (h === C.DEPLOY_AT) this.deployRun();
    if (h === 0) { this.checkOrders(); this.dayClose(); this.utilDay(); }
    if (h === 20 && !this.unpaidDays) { let cr = 0; for (const b of this.b) if (b.done && !b.off) cr += (C.SALES[b.type] || 0) * this.capF(b) + this.stat(b, 'sales'); if (cr) this.earn('sales', 0, cr); }
    this.mood *= 0.985;
    this.deskHour(h);
    if (h === 10) this.callDay();
    this.adjacency(); this.growStep();   // zones (js/zones.js)
    this.pipeFuel();   // utilities (js/utils.js)
    this.marketHour(h);
    this.fort = this.fortify();
  }

  // ---------------------------------------------------------------- the clock: a week of seven days, starting at 06:00
  // simulation seconds per real second at 1x: a calendar hour (C.WEEK / 24) in REAL_HOUR seconds
  static rate() { return C.WEEK / 24 / C.REAL_HOUR; }
  tick() {
    // shifts: the simulation's own day, C.DAY long; its hours drive the hourly work and each shift closes the books
    const sd = this.wt / C.DAY, d = Math.floor(sd), sh = (sd - d) * 24;
    // the calendar: one day per cycle, starting at 06:00 First Call; troops, light and the clock go by this
    const cd = this.wt / C.WEEK, tod = (cd + 0.25) % 1, h = tod * 24;
    // an Army-style duty day (AR 600-25 bugle calls): First Call 06:00, Reveille 06:30 as the flag goes up, PT, chow,
    // Work Call 09:00, lunch, Retreat 17:00 as the flag comes down, free time, Taps 21:00
    const phase = h < 6 || h >= 21 ? 'night' : h < 6.5 ? 'firstcall' : h < 7 ? 'reveille' : h < 8 ? 'pt' : h < 9 ? 'chow'
      : h < 11.5 ? 'work' : h < 13 ? 'mess' : h < 17 ? 'work' : h < 17.5 ? 'retreat' : 'evening';
    if (this.time && phase !== this.time.phase) this.events.push({ t: 'phase', phase });
    this.time = { day: (this.week - 1) * C.WEEK / C.DAY + d + 1, sh, hour: h, tod, phase, weekday: d, cday: this.week, rolled: cd + 0.25 >= 1 };
  }

  // ---------------------------------------------------------------- eating, burning, shooting: goods get used up
  consume(day) {
    // food: every vote at home eats a ration a day, at a mess, a franchise or the HQ, as far as their seats go
    const eaters = this.troops.length - this.troops.filter(t => t.state === 'patrol').length;
    const places = this.b.filter(b => b.done && !b.off && B[b.type].eat);
    let fed = 0;
    if (eaters > 0) {
      const seats = places.reduce((a, b) => a + this.cap(b, 'eat'), 0) || 1;
      for (const b of places) {
        const want = Math.min(this.cap(b, 'eat'), eaters * this.cap(b, 'eat') / seats) * day, cell = b.type === 'hq' ? 'rations' : 'rations';
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
    for (const t of recruits) if (t.at && load.has(t.at) && load.get(t.at) < this.cap(this.byId(t.at), 'slots')) load.set(t.at, load.get(t.at) + 1); else t.at = null;
    for (const t of recruits) if (!t.at) { const p = places.find(b => load.get(b.id) < this.cap(b, 'slots')); if (p) { t.at = p.id; load.set(p.id, load.get(p.id) + 1); } }
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
    if (!v.path.length) return;
    // traffic: a one-lane dirt road jams when vehicles share it; a two-lane paved road barely notices
    const tx0 = Math.floor(v.x), tz0 = Math.floor(v.z), r0 = tx0 >= 0 && tz0 >= 0 && tx0 < N && tz0 < N ? this.roads[tz0 * N + tx0] : 0;
    let near = 0; for (const o of this.veh) if (o !== v && !o.away && o.path.length && Math.abs(o.x - v.x) < 1.1 && Math.abs(o.z - v.z) < 1.1) near++;
    v.jam = near > 0 && r0 < 2;
    let step = VEHICLES[v.kind].speed * dt / (1 + near * (r0 === 2 ? 0.15 : 0.8));
    while (v.path.length && step > 0) {
      const tx = Math.floor(v.x), tz = Math.floor(v.z), r = tx >= 0 && tz >= 0 && tx < N && tz < N ? this.roads[tz * N + tx] : 0;
      const sp = VFAST[r] || 0.3, [px, pz] = v.path[0], dx = px - v.x, dz = pz - v.z, d = Math.hypot(dx, dz);
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
        if (!v.mission && !v.path.length && !v.parked) { const [x, z] = this.door(home); if (Math.hypot(v.x - x - 0.5, v.z - z - 0.5) > 1) v.path = this.drivePath(v.x, v.z, x, z); else v.parked = true; }
        this.roll(v, dt);
        if (v.go && !v.path.length) v.away = true;
        continue;
      }
      if (v.kind === 'truck' && (home.stock.fuel <= 0 || home.crew < 1 || home.off)) continue;   // no fuel or no driver: the trucks stay parked
      if (!v.job) {
        v.wait -= dt;
        if (v.wait <= 0) {
          v.job = this.findJob(v); v.wait = 1.5;
          if (v.job) { const s = this.byId(v.job.src), [x, z] = this.door(s); v.path = this.drivePath(v.x, v.z, x, z); }
          else if (!v.path.length) { const [x, z] = this.door(home); if (Math.hypot(v.x - x - 0.5, v.z - z - 0.5) > 1) v.path = this.drivePath(v.x, v.z, x, z); }
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
        j.leg = 'dst'; const [x, z] = this.door(d); v.path = this.drivePath(v.x, v.z, x, z);
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
    this.spend('deliveries', cost);
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
    // the Ministry asks for a little more than you shipped last week, so a steady base can always keep up
    const last = this.stats.deployed - (this.shipMark ?? 0); this.shipMark = this.stats.deployed;
    const n = clamp(Math.round(Math.max(5, last) * 1.15) + 2, 7, 40), dueDay = (this.week - 1) * C.WEEK / C.DAY + C.WEEK / C.DAY + 1;
    this.orders.push({ id: this.nid++, n, sent: 0, due: dueDay, def: 8 + n, week: this.week });
    this.say('def', `Deployment order: ${n} trained troopers to the front by day ${Math.floor((dueDay - 1) * C.DAY / C.WEEK) + 1}. Transports leave from the landing pad at ${C.DEPLOY_AT}:00.`);
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
    const pay = go.length * C.DEPLOY_PAY, cr = Math.round(go.reduce((a, t) => a + C.DEPLOY_CR * (t.grade === 'A' ? 1.5 : 1), 0) * (1 + 0.05 * this.commitF('def'))); this.earn('deploy', pay, cr);
    this.events.push({ t: 'deploy', ids, names: go.map(t => t.name), pads: this.byPad(pads, ids) });
    this.say('def', `${go.length} trooper${go.length > 1 ? 's' : ''} shipped to the front (${o.sent} of ${o.n}). +${pay} supplies, +${cr} credits.`);
    if (o.sent >= o.n) {
      this.orders.shift(); this.gain('def', o.def);
      this.say('def', `Deployment order complete. +${o.def} Defence standing. The front thanks you, briefly.`);
    }
  }
  checkOrders() {
    const day = this.time.day;
    for (const o of this.orders.filter(o => day > o.due)) {
      this.orders = this.orders.filter(x => x !== o);
      if (o.sent >= o.n * 0.75) { this.gain('def', Math.round(o.def * 0.4)); this.say('def', `Deployment order mostly met: ${o.sent} of ${o.n} shipped. +${Math.round(o.def * 0.4)} Defence standing.`); continue; }
      const pen = Math.round(3 + (o.n - o.sent) * 0.8);
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
  // until the first road goes down (and nothing else is built), the HQ and its flag can be set down anywhere inside the charter
  unsettled() { return !this.net.segs.length && this.b.every(b => b.type === 'hq' || b.type === 'seflag'); }
  hqFlagSpot(x, z, hq) {
    const [w, d] = dims('hq', 0), f = this.b.find(b => b.type === 'seflag');
    for (const [dx, dz] of [[-2, d + 1], [w + 1, d + 1], [-3, 0], [w + 1, 0], [0, -3], [w - 2, -3], [-3, d - 2], [w + 1, d - 2]]) {
      const fx = x + dx, fz = z + dz; let ok = true;
      for (let j = 0; j < 2 && ok; j++) for (let i = 0; i < 2 && ok; i++) {
        const tx = fx + i, tz = fz + j, o = this.inside(tx, tz) ? this.occ[tz * this.N + tx] : -1;
        if (o === -1 || (o && o !== f?.id && o !== hq.id) || this.blocked?.(tx, tz) || (tx >= x && tx < x + w && tz >= z && tz < z + d)) ok = false;
      }
      if (ok) return [fx, fz];
    }
    return null;
  }
  canMoveHQ(x, z) {
    if (!this.unsettled()) return { ok: false, why: 'The HQ is dug in: it can only move before the first road' };
    const hq = this.b.find(b => b.type === 'hq'), f = this.fits('hq', x, z, 0, 0, hq.id);
    if (!f.ok && f.why !== 'Something is in the way') return f;
    const [w, d] = dims('hq', 0), fl = this.b.find(b => b.type === 'seflag');
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) { const o = this.occ[(z + j) * this.N + x + i]; if (o && o !== hq.id && o !== fl?.id) return { ok: false, why: 'Something is in the way' }; }
    if (!this.hqFlagSpot(x, z, hq)) return { ok: false, why: 'No room beside it for the flag' };
    return { ok: true };
  }
  moveHQ(x, z) {
    const c = this.canMoveHQ(x, z); if (!c.ok) return c;
    const hq = this.b.find(b => b.type === 'hq'), fl = this.b.find(b => b.type === 'seflag'), [fx, fz] = this.hqFlagSpot(x, z, hq);
    for (let i = 0; i < this.occ.length; i++) if (this.occ[i] === hq.id || this.occ[i] === fl.id) this.occ[i] = 0;
    hq.x = x; hq.z = z; fl.x = fx; fl.z = fz;
    for (const o of [hq, fl]) for (const i of this.scrubUnder(o.x, o.z, o.w, o.d)) this.clearTile(i, false);
    for (const b of [hq, fl]) for (let j = 0; j < b.d; j++) for (let i = 0; i < b.w; i++) this.occ[(b.z + j) * this.N + b.x + i] = b.id;
    this.hqSet = true; this.rebuildNet();
    this.events.push({ t: 'moved', id: hq.id }, { t: 'moved', id: fl.id });
    return { ok: true };
  }
  moveFlag(x, z) {
    const c = this.canMoveFlag(x, z); if (!c.ok) return c;
    const f = this.b.find(b => b.type === 'seflag');
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) this.occ[(f.z + j) * this.N + f.x + i] = 0;
    f.x = x; f.z = z;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) this.occ[(z + j) * this.N + x + i] = f.id;
    this.spend('build', C.FLAGMOVE); this.events.push({ t: 'moved', id: f.id });
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
        const spot = this.opSpot(3, 9);
        const p = { id: this.nid++, op: `${spot.place} patrol`, kind: 'Standing patrol', diff, size: 3, ...spot,
          dur: C.DAY / C.PATROL, def: 2 + diff, sup: 15 * diff, office: b.id, t: 0, members: squad.map(t => t.id) };
        p.chance = this.chance(p, squad);
        this.startPatrol(p, squad, b.id);
      }
    }
  }
  // where an operation goes: a spot out in the region round the base, on dry ground, with a name and a distance
  opSite() { return this.site || { seed: this.seed, biome: biomeOf(this.planet), u: RW / 2, v: RH / 2 }; }
  opSpot(r0, r1) {
    const s = this.opSite(), dirs = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
    for (let i = 0; i < 24; i++) {
      const a = this.rng.angle(), r = this.rng.range(r0, r1), x = s.u + Math.cos(a) * r, y = s.v + Math.sin(a) * r;
      if (x < 2 || y < 2 || x > RW - 3 || y > RH - 3) continue;
      const g = regionKind(s.seed, s.biome, x, y); if (g.k === GROUND.WATER) continue;
      const shore = [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => regionKind(s.seed, s.biome, x + dx, y + dy).k === GROUND.WATER);
      const dir = dirs[Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
      let place = placeName(s.biome, g.k, shore, () => this.rng.next());
      if ([...this.offers, ...this.patrols].some(o => o.place === place) && i < 20) continue;
      return { px: x, py: y, km: Math.round(r * 2.1) / 10, dir, place };
    }
    return { px: s.u + r0, py: s.v, km: Math.round(r0 * 2.1) / 10, dir: 'E', place: 'Eastern Flats' };
  }
  newOffers() {
    this.offers = [];
    const used = new Set();
    const nOff = 3 + this.b.filter(b => b.done && !b.off && B[b.type].offers).reduce((a, b) => a + B[b.type].offers, 0);
    for (let i = 0; i < nOff; i++) {
      const pool = MISSIONS.filter(m => !m.heavy || this.has('vbay'));
      let m; do { m = this.rng.pick(pool); } while (used.has(m.kind)); used.add(m.kind);
      const diff = m.diff[0] + this.rng.int(m.diff[1] - m.diff[0] + 1) + (this.week > 6 && this.rng.chance(0.3) ? 1 : 0);
      const size = m.size[0] + this.rng.int(m.size[1] - m.size[0] + 1);
      const spot = this.opSpot(m.heavy ? 22 : 8, m.heavy ? 40 : 32);
      this.offers.push({ id: this.nid++, op: `Operation ${this.rng.pick(OP_A)} ${this.rng.pick(OP_B)}`, kind: m.kind, diff: Math.min(5, diff), size, ...spot, wants: m.wants || null, needs: !!m.needs,
        dur: Math.round(this.rng.range(m.dur[0], m.dur[1]) * (0.75 + spot.km / 16)), def: Math.round((4 + diff * 3) * (m.heavy ? 1.5 : 1)), sup: Math.round(diff * 40 * (m.heavy ? 1.5 : 1)), heavy: !!m.heavy });
    }
  }
  squadFor(size) {   // trained troopers first, idle before busy
    const home = this.troops.filter(t => t.state !== 'patrol' && t.state !== 'sweep' && !(t.hurt > 0));
    const order = t => (this.trained(t) ? 200 : 0) + (t.job ? 10 - CREW_ORDER.indexOf(this.byId(t.job)?.type) : t.gate != null ? 50 : 100);
    return home.sort((a, b) => order(b) - order(a) || b.missions - a.missions).slice(0, size);
  }
  oddsBonus() { return this.b.filter(b => b.done && !b.off && (!B[b.type].crew || b.crew > 0)).reduce((a, b) => a + this.stat(b, 'odds'), 0); }
  chance(o, squad = this.squadFor(o.size), kinds = o.veh || []) {
    if (squad.length < o.size) return 0;
    const armour = kinds.reduce((a, k) => a + VEHICLES[k].bonus, 0) + (o.wants && kinds.includes(o.wants) ? 0.08 : 0) - (o.needs && !kinds.includes(o.wants) ? 0.2 : 0);
    const vet = squad.reduce((a, t) => a + Math.min(1, t.missions / 6), 0) / squad.length;
    const drill = squad.reduce((a, t) => a + t.drill, 0) / squad.length;
    const raw = squad.reduce((a, t) => a + (this.trained(t) ? 0 : 0.15), 0) / squad.length;
    const arm = (this.b.some(b => b.type === 'armory' && b.done && b.crew > 0 && !b.off) ? 0.1 : 0) + this.oddsBonus();
    return clamp(0.66 + 0.02 * this.commitF('def') + 0.15 * vet + 0.1 * drill + 0.2 * (this.morale - 50) / 50 + arm + armour + 0.03 * (o.size - 2) - 0.1 * o.diff - raw, 0.05, 0.97);
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
    // the FRV gets there and back in two thirds of the time; the right vehicle for the job pays a quarter more
    if (p.veh.includes('frv')) p.dur = Math.round(p.dur * 0.67);
    if (p.wants && p.veh.includes(p.wants)) p.sup = Math.round(p.sup * 1.25);
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
    for (const t of squad) { t.state = 'patrol'; t.job = null; t.at = null; t.gate = null; }
    this.patrols.push(p);
    this.events.push({ t: 'patrolOut', id: p.id, members: p.members, at, leader: p.leader });
  }
  patrolGo(p) {
    p.brief = 0;
    const g = this.gate();
    for (const id of p.vids || []) { const v = this.veh.find(v => v.id === id); if (v) { v.go = true; v.path = this.drivePath(v.x, v.z, g.x, g.z); } }
    this.events.push({ t: 'patrolGo', id: p.id, members: p.members, leader: p.leader });
  }
  resolve(p) {
    this.patrols = this.patrols.filter(x => x !== p);
    const win = this.rng.chance(p.chance), dead = [], back = [], hurt = [], evac = [];
    const vs = (p.vids || []).map(id => this.veh.find(v => v.id === id)).filter(Boolean);
    const guard = vs.reduce((a, v) => Math.min(a, VEHICLES[v.kind].guard), 1);
    for (const id of p.members) {
      const t = this.troop(id); if (!t) continue;
      if (!this.rng.chance((win ? 0.05 * p.diff : 0.13 * p.diff) * guard)) { back.push(t); continue; }
      // hit: a free bed in a Medical Bay (or an FRV to carry them) saves most; otherwise some are flown off planet
      const beds = this.wardBeds - this.troops.filter(o => o.hurt > 0).length, frv = vs.some(v => v.kind === 'frv');
      if (this.rng.chance(beds > 0 ? (frv ? 0.9 : 0.75) : 0.25)) { t.hurt = C.HEAL; hurt.push(t); back.push(t); }
      else if (this.rng.chance(0.4)) evac.push(t); else dead.push(t);
    }
    for (const t of evac) this.troops = this.troops.filter(x => x !== t);
    if (evac.length) this.say('def', `${evac.map(t => t.name).join(', ')}: badly hurt on ${p.op} and flown off planet for treatment. The Bureau has sent a card.`);
    if (hurt.length) this.say('def', `${hurt.map(t => t.name).join(', ')}: wounded on ${p.op}${this.wardBeds ? ' and admitted to the Medical Bay' : ', resting in quarters: there is no Medical Bay'}.`);
    const g = this.gate(), lostVeh = [];
    for (const v of vs) {
      const h = this.byId(v.home);
      if (this.rng.chance(win ? 0.05 : v.kind === 'tank' ? 0.3 : 0.5)) {
        this.veh = this.veh.filter(x => x !== v);
        if (h) { h.wreck ||= {}; h.wreck[v.kind] = C.REBUILD; } lostVeh.push(VEHICLES[v.kind].name);
        this.say('def', `The ${VEHICLES[v.kind].name} did not come back from ${p.op}. Form V-9 filed; a replacement arrives in two watches, billed to the base's gratitude.`);
        continue;
      }
      v.mission = null; v.away = false; v.go = false; v.x = g.x; v.z = g.z; v.path = h ? this.drivePath(v.x, v.z, ...this.door(h)) : [];
    }
    if (back.length === 0 && dead.length) { back.push(dead.pop()); }   // somebody always makes it back to tell it
    for (const t of dead) {
      this.troops = this.troops.filter(x => x !== t);
      this.fallen.push({ name: t.name, rank: rankOf(t.missions), op: p.op, week: this.week });
      this.grief += this.has('memorial') ? 3 : 6;
    }
    if (dead.length) this.say('bur', `Form C-14 issued for ${dead.map(t => `${rankOf(t.missions)} ${t.name}`).join(', ')}. The Bureau thanks the family for their contribution and reminds them that the uniform remains Federation property.`);
    let hero = null;
    for (const t of back) { t.state = t.hurt > 0 ? 'hurt' : 'idle'; t.missions++; }
    const quiet = !!p.office;   // standing patrols only report when something happens
    if (win) {
      this.gain('def', p.def); this.earn('ops', p.sup, p.office ? 0 : p.diff * 10); this.stats.patrolsWon++;
      if (this.rng.chance((quiet ? 0.08 : 0.35) + 0.08 * p.diff)) {
        hero = this.rng.pick(back.filter(t => !(t.hurt > 0)).length ? back.filter(t => !(t.hurt > 0)) : back); hero.medals++; this.pride += 5;
        this.honours.push({ name: hero.name, rank: rankOf(hero.missions), op: p.op, week: this.week });
      }
      if (!quiet || dead.length || hero) this.say('def', `${p.op}: success. +${p.def} Defence standing, +${p.sup} supplies.` + (dead.length ? ` We lost ${dead.map(t => t.name).join(', ')}.` : ''));
      if (hero) this.say('def', `${rankOf(hero.missions)} ${hero.name} is awarded the Medal of Valour. All votes will assemble at the Super Earth flag.`);
    } else {
      this.gain('def', -(2 + p.diff)); this.stats.patrolsLost++;
      this.say('def', `${p.op}: failed. -${2 + p.diff} Defence standing.` + (dead.length ? ` Fallen: ${dead.map(t => t.name).join(', ')}.` : ''));
    }
    // the after-action report: every special operation files one; standing patrols only when something happened
    if (!quiet || dead.length || hurt.length || evac.length || hero) {
      const nm = t => `${rankOf(t.missions)} ${t.name}`, out = { win, dead: dead.map(nm), hurt: hurt.map(nm), evac: evac.map(nm), lostVeh, hero: hero ? nm(hero) : null };
      const rep = { id: this.nid++, day: this.time.day, week: this.week, op: p.op, kind: p.office ? 'Standing patrol' : p.kind, place: p.place, km: p.km, dir: p.dir, px: p.px, py: p.py,
        win, leader: this.troop(p.leader)?.name || back[0]?.name, n: p.members.length, veh: (p.veh || []).map(k => VEHICLES[k].name), lines: writeReport(() => this.rng.next(), p, out), def: win ? p.def : -(2 + p.diff), sup: win ? p.sup : 0 };
      (this.reports ||= []).push(rep); if (this.reports.length > 30) this.reports.shift();
      if (!quiet) this.events.push({ t: 'report', id: rep.id });
    }
    this.events.push({ t: 'patrolBack', members: back.map(t => t.id), dead: dead.map(t => t.name), hero: hero?.id ?? null, win });
  }

  // ---------------------------------------------------------------- Ministry of Expansion: the weekly supply audit
  expansionAudit() {
    const W = this.week_;
    const lines = W.total ? 100 * (1 - W.short / W.total) : 50, food = W.eat ? 100 * W.fed / W.eat : 50;
    const housing = 100 * Math.min(1, this.beds / Math.max(1, this.troops.length));
    const target = 12 + this.week * 8, growth = 100 * Math.min(1, this.heads() / target);   // the Ministry expects the base to keep growing
    const score = Math.round(0.25 * lines + 0.25 * food + 0.15 * housing + 0.35 * growth);
    const before = this.stand.pro;
    this.stand.pro = clamp(this.stand.pro + (score - this.stand.pro) * 0.6, 0, 100);
    const notes = [];
    if (food < 80) notes.push('Votes went hungry today. Rations must reach the mess.');
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
    const score = Math.min(100, Math.round(0.35 * this.morale + 0.45 * this.prop + 0.2 * this.avgCond) + this.b.filter(b => b.done && B[b.type].inspect).reduce((a, b) => a + B[b.type].inspect, 0));
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
    for (const r of this.rivals) r.commit = this.rivalCommit(r);
    for (const r of this.rivals) for (const m of MKEYS) {
      const target = (28 + r.w[m] * (26 + Math.min(52, this.week * 3.6))) * this.D.rivals + this.rng.range(-6, 6);
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
    const amt = Math.round(C.ALLOC.base * C.ALLOC.mult[rank] * (1 + (C.STAGES[this.stage || 0].alloc || 0)));
    this.closeFlow(); this.earn('alloc', amt, 0); this.lastAlloc = amt;
    const gross = Math.round(amt / 0.82), fee = Math.round(gross * 0.11);
    this.ledger = { week: this.week, gross, fee, consult: gross - fee - amt, net: amt };
    for (const b of this.b) if (b.done && B[b.type].cryo && !b.off && b.crew > 0 && this.power.ratio >= 1) { this.gain('def', 3); this.say('def', 'Helldivers thawed, briefed and shipped to the front. +3 Defence standing.'); }
    { const f = this.fort = this.fortify(), g = Math.round((f.score - 45) / 9);
      if (g && (this.week >= 3 || g > 0)) { this.gain('def', g); this.say('def', g > 0 ? `Perimeter review: the base scores ${f.score} for defensibility. +${g} Defence standing.` : `Perimeter review: the base scores ${f.score} for defensibility${f.closed ? '' : ' (there is no closed wall)'}. ${g} Defence standing. Watch the wall and man the gates.`); } }
    // standing earned by the buildings themselves: the bunker, the brig, fortified designs, monumental pride
    { const add = {}; let pr = 0;
      for (const b of this.b) if (b.done && !b.off) {
        for (const [m, v] of Object.entries({ ...(B[b.type].weekly || {}) })) add[m] = (add[m] || 0) + v;
        for (const [m, v] of Object.entries(DESIGNS[b.design || 0].weekly || {})) add[m] = (add[m] || 0) + v;
        pr += this.stat(b, 'pride');
      }
      for (const [m, v] of Object.entries(add)) if (v) this.gain(m, v);
      if (pr) this.pride += pr; }
    for (const b of this.b) if (b.done && B[b.type].kickback) { this.earn('sales', B[b.type].kickback); this.say('bur', `Bureau Cola & Fries remits a consulting fee of ${B[b.type].kickback} supplies. Please do not ask what was consulted.`); }
    this.events.push({ t: 'alloc', amt });
    // upkeep: what you can't pay for wears out
    // upkeep was paid day by day: a building that missed most of its days wears down
    const built = this.b.filter(b => b.done), bill = Math.round(built.reduce((a, b) => a + this.upkeepOf(b), 0));
    let unpaid = 0;
    const wear = b => this.wearOf(b);
    for (const b of built) { if ((b.unpaid || 0) >= 4) { b.cond = Math.max(5, b.cond - C.UNPAID); unpaid++; } else b.cond = Math.min(100, b.cond + C.MAINT - wear(b)); b.unpaid = 0; }
    this.payLoans();
    const place = ['1st', '2nd', '3rd', '4th'][rank];
    this.say('base', `Day ${this.week} closes. ${this.faction.name} ranks ${place} of 4: allocation ${amt} supplies. Upkeep ${bill}.`);
    if (unpaid) this.say('base', `Upkeep short: ${unpaid} building${unpaid > 1 ? 's' : ''} went unmaintained and are wearing down.`);
    if (rank < prev) this.say('riv', `Federation bulletin: ${this.faction.name} climbs to ${place}. Glory to the efficient.`);
    else if (rank > prev) this.say('riv', `Federation bulletin: ${this.table()[prev].name} overtakes ${this.faction.name}. Allocation reduced accordingly.`);
    if (this.citizens && this.week % 3 === 0) this.say('bur', this.rng.pick([
      `${this.citizens} citizens are employed on your base. Service guarantees citizenship. Would they like to know more? They would.`,
      'Federal Network reminder: the evening broadcast is voluntary. Attendance is recorded for your convenience.',
      'A citizen accepts personal responsibility for the safety of the body politic. Your canteen staff have been reminded.',
    ]));
    this.memo();
    this.week++; this.wt -= C.WEEK; this.inspected = false;
    this.newOffers(); this.newOrder();
    this.events.push({ t: 'week', rank, amt });
  }

  // how defensible the base is, 0 to 100: watched wall, manned gates, few entrances, and the HQ and fuel kept away from the wall
  fortify() {
    const N = this.N, gs = this.gates || [], posts = [];
    for (const b of this.b) { const w = this.stat(b, 'watch'); if (b.done && w && !b.off && (!B[b.type].crew || b.crew > 0)) posts.push([b.x + b.w / 2, b.z + b.d / 2, w]); }
    const guns = []; for (const b of this.b) { const g = this.stat(b, 'guns'); if (b.done && g && !b.off && (!B[b.type].need?.ammo || b.stock.ammo > 0)) guns.push([b.x + b.w / 2, b.z + b.d / 2, g]); }
    let manned = 0;
    gs.forEach((g, i) => { if (this.troops.some(t => t.gate === i && t.state === 'guard')) { manned++; posts.push([g.x, g.z, 5]); } });
    let wall = 0, seen = 0, armed = 0; const wt = [];
    for (let i = 0; i < N * N; i++) if (this.walls[i] === 1) { wall++; const x = i % N + 0.5, z = ((i / N) | 0) + 0.5; wt.push(x, z); if (posts.some(p => Math.hypot(p[0] - x, p[1] - z) <= p[2])) seen++; if (guns.some(p => Math.hypot(p[0] - x, p[1] - z) <= p[2])) armed++; }
    const key = this.b.filter(b => b.done && (b.type === 'hq' || b.type === 'fueldepot'));
    let depth = 0;
    for (const b of key) { let m = 99; for (let k = 0; k < wt.length; k += 2) m = Math.min(m, Math.hypot(wt[k] - b.x - b.w / 2, wt[k + 1] - b.z - b.d / 2)); depth += Math.min(1, m / 7); }
    const f = { closed: !this.open, cover: wall ? seen / wall : 0, armed: wall ? armed / wall : 0, gates: gs.length, manned, entr: gs.length <= 2 ? 1 : Math.max(0, 1 - (gs.length - 2) * 0.35), depth: key.length ? depth / key.length : 1 };
    // turrets are a bonus on top: a watched, manned wall scores well; an armed one scores more
    f.score = f.closed ? Math.min(100, Math.round(45 * f.cover + 25 * (gs.length ? manned / gs.length : 1) + 15 * f.entr + 15 * f.depth + 15 * f.armed)) : 0;
    return f;
  }
  // ---------------------------------------------------------------- supplies and credits: every income goes through here
  // ---------------------------------------------------------------- the daily round: upkeep and wages, then the books close
  dayClose() {
    // upkeep, a seventh of each building's week, in supplies; what can't be paid is marked against the building
    for (const b of this.rng.shuffle(this.b.filter(b => b.done))) { const due = this.upkeepOf(b) / (C.WEEK / C.DAY); if (this.supplies >= due) this.spend('upkeep', due); else b.unpaid = (b.unpaid || 0) + 1; }
    // wages for the citizen staff, in credits. Into the overdraft if need be; past it, the staff go unpaid
    const wages = (this.citizens || 0) * C.WAGE;
    if (wages) { if (this.credits - wages >= -this.OD) { this.spend('wages', 0, wages); this.unpaidDays = 0; } else { this.unpaidDays = (this.unpaidDays || 0) + 1; if (this.unpaidDays === 1 || this.unpaidDays % 3 === 0) this.say('base', `The citizen staff were not paid today. The canteen is serving its opinion of you, cold.`); } }
    // the industrial complexes turn fuel into supplies
    for (const b of this.b) { const pm = B[b.type].pump; if (pm && b.done && !b.off) { const w = this.work(b); b.stock.fuel = Math.min(this.storeCap(b, 'fuel'), (b.stock.fuel || 0) + pm * w); } }
    for (const b of this.b) { const mk = this.stat(b, 'make'); if (!b.done || b.off || !mk || (B[b.type].need?.fuel && (b.stock.fuel || 0) < 1)) continue; const w = this.work(b); if (w <= 0) continue; if (B[b.type].need?.fuel) b.stock.fuel = Math.max(0, b.stock.fuel - 10 * w); this.earn(b.type === 'mine' ? 'mine' : 'industry', Math.round(mk * w)); }
    this.marketDay();   // prices move, offers lapse, and the Ministry commitments are paid
    const f = this.flow; f.days.push(f.today); if (f.days.length > 7) f.days.shift(); f.today = this.newDay();
  }
  newDay() { return { sup: {}, cr: {} }; }
  // average over the last few days: per category and the net, for supplies and credits
  rates() {
    const ds = this.flow.days.length ? this.flow.days : [this.flow.today], n = ds.length, out = { sup: {}, cr: {}, supNet: 0, crNet: 0, days: n };
    for (const d of ds) for (const c of ['sup', 'cr']) for (const [k, v] of Object.entries(d[c])) out[c][k] = (out[c][k] || 0) + v / n;
    out.supNet = Object.values(out.sup).reduce((a, b) => a + b, 0); out.crNet = Object.values(out.cr).reduce((a, b) => a + b, 0);
    return out;
  }
  spend(cat, sup = 0, cr = 0) { this.earn(cat, -sup, -cr); }

  // ---------------------------------------------------------------- debt: the Founding Charter, loans, the overdraft
  debt() { return this.loans.reduce((a, l) => a + l.bal, 0) + Math.max(0, -this.credits); }
  canBorrow(k) { const L = LOANS[k]; return !!L && k !== 'charter' && !this.loans.some(l => l.k === k) && this.debt() + L.amt <= DEBT_MAX && this.credits > -this.OD / 2; }
  borrow(k) {
    if (!this.canBorrow(k)) return false;
    this.loans.push({ k, bal: LOANS[k].amt }); this.earn('loans', 0, LOANS[k].amt);
    this.say('bur', `${LOANS[k].name} approved: ${LOANS[k].amt} credits. The Bureau will be in touch every day, at ${Math.round(LOANS[k].rate * 1000) / 10}% interest.`); return true;
  }
  repay(i, amt) {
    const l = this.loans[i]; if (!l) return false; amt = Math.min(amt, l.bal, Math.max(0, this.credits)); if (amt <= 0) return false;
    l.bal -= amt; this.spend('loans', 0, amt);
    if (l.bal <= 0.5) { this.loans.splice(i, 1); this.gain('pro', 3); this.say('bur', `${LOANS[l.k].name} repaid in full. The Bureau is delighted, and slightly suspicious. +3 Expansion standing.`); }
    return true;
  }
  // every week: interest on each loan, then the least payment; the overdraft has its own fee
  payLoans() {
    for (const l of [...this.loans]) {
      const L = LOANS[l.k], int = Math.round(l.bal * (l.k === 'charter' ? this.D.rate : L.rate) * 10) / 10; l.bal += int; l.int = (l.int || 0) + int;   // interest goes on the loan, not out of pocket
      const pay = Math.min(l.bal, L.pay); l.bal -= pay; this.spend('loans', 0, pay);
      if (l.bal <= 0.5) { this.loans = this.loans.filter(x => x !== l); this.gain('pro', 3); this.say('bur', `${L.name} repaid in full. +3 Expansion standing.`); }
    }
    if (this.credits < 0) {
      const fee = Math.round(-this.credits * C.ODFEE); this.spend('interest', 0, fee);
      if (this.credits < -this.OD) { this.gain('pro', -2); this.say('bur', `Your base is ${fmt(-this.credits)} credits overdrawn, past the Bureau's patience. -2 Expansion standing. Staff wages will not be paid until this improves.`); }
      else this.say('bur', `Overdraft fee: ${fee} credits on ${fmt(-this.credits)} overdrawn.`);
    }
  }
  newFlow() { return { sup: {}, cr: {}, sup0: this.supplies ?? 0, cr0: this.credits ?? 0 }; }
  earn(cat, sup = 0, cr = 0) {
    this.supplies += sup; this.credits += cr;
    for (const f of [this.flow.cur, this.flow.today]) { if (sup) f.sup[cat] = (f.sup[cat] || 0) + sup; if (cr) f.cr[cat] = (f.cr[cat] || 0) + cr; }
  }
  closeFlow() {   // at the week's end: what came in by source, and what went out (everything else)
    const f = this.flow.cur, sum = o => Object.values(o).reduce((a, b) => a + b, 0);
    f.supOut = Math.round(f.sup0 + sum(f.sup) - this.supplies); f.crOut = Math.round(f.cr0 + sum(f.cr) - this.credits); f.week = this.week;
    this.flow.last = f; this.flow.cur = this.newFlow();
  }
  // the old Ledger buttons, now trades on the planet's market
  sellSupplies() { return this.trade('sup', 100, false).ok; }
  buySupplies() { return this.trade('sup', 100, true).ok; }

  // ---------------------------------------------------------------- the Base Ledger: requests on the Commander's desk
  deskHour(h) {
    for (const r of this.desk.filter(r => this.t >= r.due)) { this.desk = this.desk.filter(x => x !== r); this.mood -= 2; this.say('base', `"${REQUESTS[r.k].title}" sat on your desk until it was filed without action. People noticed.`); }
    if (h < 9 || h > 17 || this.desk.length >= 4 || this.t < C.DAY || !this.rng.chance(0.17)) return;
    const open = new Set(this.desk.map(r => r.k)), pool = REQUESTS.map((r, k) => k).filter(k => !open.has(k) && k !== this.deskLast && hasOffice(this, REQUESTS[k].from) && (!REQUESTS[k].when || REQUESTS[k].when(this)));
    if (!pool.length) return;
    const k = this.rng.pick(pool); this.deskLast = k;
    const r = { id: this.nid++, k, name: `${'ABCDEFGHJKLMNPRSTVW'[this.rng.int(19)]}. ${this.rng.pick(SURNAMES)}`, due: this.t + C.DAY * 2 };
    this.desk.push(r); this.events.push({ t: 'desk', id: r.id });
  }
  canDecide(r, i) { const fx = REQUESTS[r.k].opts[i].fx; return (!(fx.cr < 0) || this.credits + fx.cr >= -this.OD) && (!(fx.sup < 0) || this.supplies + fx.sup >= 0); }
  decide(id, i) {
    const r = this.desk.find(r => r.id === id); if (!r) return false;
    const o = REQUESTS[r.k].opts[i]; if (!o || !this.canDecide(r, i)) return false;
    const fx = o.fx; this.stats.desk = (this.stats.desk || 0) + 1;
    if (fx.sup || fx.cr) this.earn('ledger', fx.sup || 0, fx.cr || 0);
    if (fx.mood) this.mood = clamp(this.mood + fx.mood, -15, 15);
    if (fx.pride) this.pride += fx.pride;
    for (const m of MKEYS) if (fx[m]) this.gain(m, fx[m]);
    if (fx.clean) for (const b of this.b) if (b.type === 'potty') b.clean = 100;
    if (fx.heal) for (const t of this.troops) if (t.hurt > 0) t.hurt *= 0.5;
    this.desk = this.desk.filter(x => x !== r);
    this.say('base', o.say.replaceAll('NAME', r.name)); return true;
  }

  // ---------------------------------------------------------------- calls: set goods aside before the day, or pay for ignoring it
  have(g) { return g === 'supplies' ? this.supplies : g === 'credits' ? this.credits : this.stored(g) + this.onPad(g); }
  take(g, n) {   // out of the depots and off the pads, wherever it is
    if (g === 'supplies') { this.spend('calls', n); return; } if (g === 'credits') { this.spend('calls', 0, n); return; }
    for (const b of this.b) { if (n <= 0) break; const k = Math.min(n, b.stock[g] || 0); b.stock[g] -= k; n -= k; }
  }
  callDay() {
    const day = this.time.day;
    for (const c of this.calls.filter(c => day >= c.due)) {
      this.calls = this.calls.filter(x => x !== c); const C0 = CALLS[c.k];
      if (c.acc && this.have(c.g) >= c.n) {
        this.take(c.g, c.n); this.gain(C0.m, 4 + this.week * 0.4 | 0); this.earn('calls', 0, Math.round(c.n * (c.g === 'credits' ? 0.2 : c.g === 'supplies' ? 0.15 : 0.6)));
        this.mood += 2; this.say(C0.m, `"${C0.title}": ${c.n} ${c.g} handed over. The Ministry is grateful, in writing. +${4 + this.week * 0.4 | 0} standing and a small thank-you in credits.`);
      } else {
        const pen = c.acc ? 3 : 5; this.gain(C0.m, -pen); this.mood -= 2;
        this.say(C0.m, c.acc ? `"${C0.title}": you set it aside but had only ${Math.floor(this.have(c.g))} of ${c.n} ${c.g} on the day. -${pen} standing.` : `"${C0.title}" went unanswered. -${pen} standing, and people heard about it.`);
      }
    }
    if (this.calls.length < 2 && day >= 3 && this.rng.chance(0.3)) {
      const open = new Set(this.calls.map(c => c.k)), pool = CALLS.map((c, k) => k).filter(k => !open.has(k));
      const k = this.rng.pick(pool), C0 = CALLS[k], c = { id: this.nid++, k, g: C0.g, n: Math.round(C0.n(this)), due: day + C0.days, acc: false };
      this.calls.push(c); this.events.push({ t: 'call', id: c.id });
      this.say(C0.m, `Call from the Ministry: "${C0.title}". ${c.n} ${c.g} by day ${Math.floor((c.due - 1) * C.DAY / C.WEEK) + 1}. Answer it in the Ledger.`);
    }
  }
  answer(id, yes) {
    const c = this.calls.find(c => c.id === id); if (!c) return false;
    if (yes) { c.acc = true; this.stats.calls = (this.stats.calls || 0) + 1; this.say('base', `Set aside: ${c.n} ${c.g} for "${CALLS[c.k].title}", to go on day ${Math.floor((c.due - 1) * C.DAY / C.WEEK) + 1}.`); }
    else { this.calls = this.calls.filter(x => x !== c); this.gain(CALLS[c.k].m, -2); this.say(CALLS[c.k].m, `You declined "${CALLS[c.k].title}". Honest, at least. -2 standing.`); }
    return true;
  }
  // ---------------------------------------------------------------- roster review: read the file, give the grade
  reviewsLeft() { const day = Math.floor(this.t / C.DAY); if (this.revN?.day !== day) this.revN = { day, n: 0 }; return C.REVIEWS_DAY + this.b.filter(b => b.done && B[b.type].reviews).reduce((a, b) => a + B[b.type].reviews, 0) - this.revN.n; }
  toReview() { const day = Math.floor(this.t / C.DAY); return this.troops.filter(t => this.trained(t) && t.state !== 'patrol' && (t.grade == null || day - (t.revDay || 0) >= C.REVIEW)); }
  gradeTroop(id, g) {
    const t = this.troop(id); if (!t || !GRADES.includes(g) || this.reviewsLeft() <= 0) return null;
    this.revN.n++; this.stats.graded = (this.stats.graded || 0) + 1;
    const truth = trueGrade(t), off = Math.abs(GRADES.indexOf(g) - GRADES.indexOf(truth));
    t.grade = g; t.revDay = Math.floor(this.t / C.DAY);
    const out = { off, truth };
    if (off === 0) { this.earn('roster', 8, 3); out.text = `A fair grade. The Ministry of Defence concurs: +8 supplies, +3 credits.`; }
    else if (off === 1) { this.earn('roster', 3, 0); out.text = `Near enough. The Ministry had ${truth} in mind: +3 supplies.`; }
    else { this.spend('fees', 0, 8); this.gain('tru', -1); out.text = `The Bureau audited the file and had ${truth} in mind. An 8 credit correction fee, and a note to Truth.`; }
    if (g === 'D') { t.train = 70; for (const k in t.q) t.q[k] = Math.min(99, t.q[k] + 8); out.text += ' Sent back for remedial training.'; }
    if (g === 'A') out.text += ' Marked for distinction: worth half as much again when shipped.';
    return out;
  }
  get D() { return DIFF[this.diff || 'veteran']; }
  get OD() { return this.D.od; }
  gain(m, v) { if (v < 0) v *= this.D.pen; this.stand[m] = clamp(this.stand[m] + (v > 0 ? v * (1 - this.stand[m] / 115) : v), 0, 100); return Math.round(v > 0 ? v * (1 - (this.stand[m]) / 115) : v); }

  memo() {   // the Bureau writes every week, always pleased, never quite clear
    const lines = [
      `Memo: the Bureau congratulates ${this.faction.base} on a day of measurable progress. The measurements are classified.`,
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
    for (const k of Object.keys(this)) if (!['own', 'zone', 'scrub', 'rng', 'events', 'occ', 'mor', 'power', 'roads', 'walls', 'inMask', 'wallIn', 'gates', 'terr', 'hgt', '_walk', '_walkV', '_paths', '_pathV', '_dpaths', '_dpathV'].includes(k)) o[k] = this[k];
    o.rngS = this.rng.s; o.v = 11; o.scrubS = this.packScrub(); o.zoneS = this.packZones(); o.ownS = this.packOwn();
    return JSON.parse(JSON.stringify(o));
  }
  load(s) {
    if (!s.v || s.v < 11) throw new Error('save from before the big map (0.16)');
    Object.assign(this, structuredClone(s));
    this.rng = new RNG(1); this.rng.s = s.rngS; this.events = [];
    delete this.walls; delete this.inMask; delete this.gates; delete this.roads;
    this.own = this.unpackOwn(s.ownS); delete this.ownS;
    this.genMap();
    for (const b of this.b) for (let j = 0; j < b.d; j++) for (let i = 0; i < b.w; i++) this.occ[(b.z + j) * this.N + b.x + i] = b.id;
    this.scrub = this.unpackScrub(s.scrubS); delete this.scrubS;
    this.zone = this.unpackZones(s.zoneS); delete this.zoneS;
    this.rebuildNet();
    this.roadsV = 1;
    this.adjacency(); this.recalc(); this.tick(); this.marketInit();
    if (!this.orders.length) this.newOrder();
  }
}
Object.assign(Sim.prototype, Market, Build, Zones, Utilities, Land); bindMarket(B);
