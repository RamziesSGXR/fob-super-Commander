// Zoning (0.14): paint zones along roads, and everyday buildings grow in them by themselves as the base needs them.
//   - Zones: a number per tile (ZONES[k].n). Life Support, Logistics and Commerce grow buildings; Training, Operations and
//     Industry give a hand-placed building that fits them 5% more; Buffer is kept clear.
//   - Demand: bunks, mess seats, latrines, storage and shops, worked out every hour, like SimCity's RCI bars.
//   - Growth: every hour each growing zone with demand puts one building up on a free zoned plot, at the standard picked in
//     the build bar, paid for like any other, and the engineers build it. Never below GROW.reserve supplies.
//   - Adjacency: noise and hazards near housing cost morale; storage near a landing pad holds more.
// Mixed into Sim (see the end of sim.js), so `this` is the simulation.
import { B, C, ZONES, ZKEYS, GROWS, GROW, CHAINS, NOISE, HAZARD, GKEYS } from './config.js';
import { LOOSE, dims } from './sim.js';
import { GROUND } from './site.js';

const NAMES = { bunks: 'bunks', seats: 'mess seats', latrines: 'latrines', storage: 'storage', shops: 'shops' };

export const Zones = {
  // ---------------------------------------------------------------- the zone map
  zoneKey(n) { return ZKEYS[n - 1] || null; },
  zoneAt(x, z) { return x < 0 || z < 0 || x >= this.N || z >= this.N ? 0 : this.zone?.[z * this.N + x] || 0; },
  growZone(type) { return GROWS.get(type) || null; },
  // paint (or with zk null, clear) every tile in a rectangle that can hold a zone: inside the charter, on open land
  paintZone(x0, z0, x1, z1, zk) {
    const N = this.N, n = zk ? ZONES[zk].n : 0, [bx0, bz0, bx1, bz1] = this.ownBounds(); let k = 0;
    if (!this.zone) this.zone = new Uint8Array(N * N);
    for (let z = Math.max(bz0, Math.min(z0, z1)); z <= Math.min(bz1 - 1, Math.max(z0, z1)); z++)
      for (let x = Math.max(bx0, Math.min(x0, x1)); x <= Math.min(bx1 - 1, Math.max(x0, x1)); x++) {
        const i = z * N + x, t = this.terr?.[i];
        if (t === GROUND.WATER || t === GROUND.ROCK || this.roads[i] || this.walls[i] || !this.ownedTile(x, z)) continue;
        if (this.zone[i] !== n) { this.zone[i] = n; k++; }
      }
    if (k) { this.zoneV = (this.zoneV || 0) + 1; this.events.push({ t: 'zones' }); this.stats.zoned = (this.stats.zoned || 0) + k; }
    return { ok: k > 0, n: k };
  },
  zoneCount(zk) { const n = ZONES[zk].n; let c = 0; if (this.zone) for (let i = 0; i < this.zone.length; i++) if (this.zone[i] === n) c++; return c; },
  // the footprint of a building at x, z: every zone number under it
  zonesUnder(type, x, z, rot, dz = 0) {
    const [w, d] = dims(type, rot, dz), out = new Set();
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) out.add(this.zoneAt(x + i, z + j));
    return out;
  },
  inBuffer(type, x, z, rot, dz) { return this.zone ? this.zonesUnder(type, x, z, rot, dz).has(ZONES.buffer.n) : false; },
  // a hand-placed building standing in the zone it belongs to works a little better
  zoneFit(b) {
    if (!this.zone || b.grown) return 1;
    const n = this.zoneAt(Math.floor(b.x + b.w / 2), Math.floor(b.z + b.d / 2)), k = this.zoneKey(n);
    return k && ZONES[k].fits?.includes(b.type) ? GROW.fit : 1;
  },
  packZones() {
    const s = this.zone; if (!s) return ''; let o = '', v = s[0], c = 0;
    for (let i = 0; i <= s.length; i++) { if (i < s.length && s[i] === v) { c++; continue; } o += v + ':' + c + ','; v = s[i]; c = 1; }
    return o;
  },
  unpackZones(str) {
    const N = this.N, z = new Uint8Array(N * N); let k = 0;
    if (str) for (const run of str.split(',')) { if (!run) continue; const [v, c] = run.split(':').map(Number); z.fill(v, k, Math.min(z.length, k + c)); k += c; }
    return z;
  },
  setChain(k) { if (k && !CHAINS.includes(k)) return false; const have = this.b.find(b => B[b.type].chain); if (have) return false; this.chain = k || null; return true; },
  chainNow() { return this.b.find(b => B[b.type].chain)?.type || this.chain || null; },

  // ---------------------------------------------------------------- demand: what the base needs more of
  demand() {
    const home = this.troops.filter(t => t.state !== 'patrol').length, votes = this.troops.length, use = this.usage();
    // bunks follow jobs, like housing follows jobs in SimCity: crew posts, training places, gate guards and patrols, plus
    // a few spare. Recruits fill every empty bunk, so "more than we have" would never stop growing
    const done = this.b.filter(b => b.done && !b.off);
    const jobs = done.reduce((a, b) => a + (B[b.type].crew || 0) + (B[b.type].slots ? this.cap(b, 'slots') : 0) + (b.squads || 0) * 3, 0) + (this.gates || []).length;
    const head = Math.max(4, Math.round(jobs * GROW.head));
    const pots = this.b.filter(b => b.done && B[b.type].potty).length + this.b.filter(b => !b.done && B[b.type].potty).length;
    const building = t => this.b.filter(b => !b.done && b.type === t).reduce((a, b) => a + (B[b.type].beds ? this.cap({ ...b, done: true }, 'beds') : 0), 0);
    const bunksComing = ['barracks', 'block', 'hab'].reduce((a, t) => a + building(t), 0);
    const seatsComing = this.b.filter(b => !b.done && B[b.type].eat).reduce((a, b) => a + this.cap(b, 'eat'), 0);
    const store = {};
    for (const g of GKEYS) { const want = Math.max(20, use[g] * 3), have = this.storage(g) + this.b.filter(b => !b.done && B[b.type].store?.[g]).reduce((a, b) => a + B[b.type].store[g] * 0.75, 0); store[g] = Math.max(0, Math.round(want - have)); }
    const shopsHave = this.b.reduce((a, b) => a + (b.type === 'vend' ? 1 : b.type === 'club' ? 2 : B[b.type].chain ? 3 : 0), 0);
    const d = {
      bunks: Math.max(0, Math.max(jobs + head, Math.min(12 + this.week * 8, votes + head)) - this.beds - bunksComing), jobs,   // and the Ministry's growth target, which the audit checks
      seats: Math.max(0, home + 2 - (this.seats || 0) - seatsComing),
      latrines: Math.max(0, Math.ceil(home / 10) - pots),
      storage: Object.values(store).reduce((a, b) => a + b, 0), store,
      shops: Math.max(0, Math.floor(votes / GROW.shop) - shopsHave),
    };
    // 0..1 for the bars: how far short the base is, against what one building of the kind would give
    d.bars = { bunks: Math.min(1, d.bunks / 12), seats: Math.min(1, d.seats / 18), latrines: Math.min(1, d.latrines / 2), storage: Math.min(1, d.storage / 120), shops: Math.min(1, d.shops / 3) };
    return d;
  },
  // which building each growing zone wants next, or null
  wantFor(zk, d) {
    if (zk === 'life') {
      if (d.seats > 0) return ['mess'];
      if (d.latrines > 0) return ['potty'];
      if (d.bunks > 0) return d.bunks >= 12 && !this.locked('block') ? ['block', 'barracks', 'hab'] : ['barracks', 'hab'];
      return null;
    }
    if (zk === 'logi') {
      if (!d.storage) return null;
      return (d.store.fuel || 0) > (d.store.rations || 0) + (d.store.ammo || 0) ? ['fueldepot', 'shed'] : ['depot', 'shed'];
    }
    if (zk === 'comm') {
      if (!d.shops) return null;
      const ch = this.chainNow(), out = [];
      if (ch && !this.b.some(b => B[b.type].chain) && this.troops.length >= 16) out.push(ch);
      if (!this.b.some(b => b.type === 'club') && this.troops.length >= 20) out.push('club');
      out.push('vend'); return out;
    }
    return null;
  },
  // a free plot of the zone for this building: every tile of its footprint zoned, door to a road (unless it's a small thing)
  zonePlot(type, zk) {
    const N = this.N, zn = ZONES[zk].n, loose = LOOSE.has(type), spec = { grow: true, std: this.std };
    const tiles = [];
    for (let i = 0; i < N * N; i++) if (this.zone[i] === zn && !this.occ[i] && !this.roads[i]) tiles.push(i);
    if (!tiles.length) return null;
    // nearest the HQ first, so the base grows outward from its heart
    const hq = this.b.find(b => b.type === 'hq'), cx = hq ? hq.x + 1.5 : N / 2, cz = hq ? hq.z + 1.5 : N / 2;
    tiles.sort((a, b) => Math.hypot(a % N - cx, ((a / N) | 0) - cz) - Math.hypot(b % N - cx, ((b / N) | 0) - cz));
    for (const i of tiles.slice(0, 900)) {   // nearest first; a big zone is searched well beyond its first street
      const tx = i % N, tz = (i / N) | 0;
      for (let rot = 0; rot < 4; rot++) {
        const [w, d] = dims(type, rot);
        for (let oz = 0; oz < d; oz++) for (let ox = 0; ox < w; ox++) {
          const x = tx - ox, z = tz - oz; let all = true;
          for (let j = 0; j < d && all; j++) for (let k = 0; k < w; k++) if (this.zoneAt(x + k, z + j) !== zn) { all = false; break; }
          if (!all) continue;
          if (!loose && !this.frontage(type, x, z, rot)) continue;
          if (this.canPlace(type, x, z, rot, spec).ok) return { x, z, rot };
        }
      }
    }
    return null;
  },
  // every hour: each growing zone with demand starts one building, if nothing of its own is still going up
  growStep() {
    if (!this.zone || !this.secure()) return;
    const d = this.dem = this.demand();
    this.growNote = {};
    for (const zk of ['life', 'logi', 'comm']) {
      if (!this.zoneCount(zk)) { this.growNote[zk] = 'no zone painted'; continue; }
      const want = this.wantFor(zk, d); if (!want) { this.growNote[zk] = 'nothing needed'; continue; }
      if (this.b.some(b => b.grown === zk && (!b.done || b.clr?.length))) { this.growNote[zk] = 'building'; continue; }
      let placed = false, why = 'no free plot: paint more along a road';   // the reasons are shown on the zone's card
      for (const t of want) {
        const lk = this.locked(t); if (lk) { why = lk.some(x => /foundation/.test(x)) ? 'waits for the foundation' : `${B[t].name} needs ${lk.join(' and ')}`; continue; }
        const cost = this.costOf(t, { std: this.std, grow: true });
        if (this.supplies < cost + GROW.reserve) { why = `waiting for supplies (keeps ${GROW.reserve} in reserve)`; continue; }
        const p = this.zonePlot(t, zk); if (!p) continue;
        const b = this.place(t, p.x, p.z, p.rot, false, { std: this.std, grow: true });
        if (b) { b.grown = zk; placed = true; this.stats.grown = (this.stats.grown || 0) + 1; this.events.push({ t: 'grown', id: b.id }); break; }
      }
      this.growNote[zk] = placed ? 'building' : why;
    }
  },
  demandText(d = this.dem) {
    if (!d) return '';
    return Object.keys(NAMES).filter(k => d[k] > 0).map(k => `${NAMES[k]} ${d[k]}`).join(', ') || 'nothing';
  },

  // ---------------------------------------------------------------- adjacency: what's next to what
  adjacency() {
    const done = this.b.filter(b => b.done), mid = b => [b.x + b.w / 2, b.z + b.d / 2];
    const near = (a, b, r) => { const [ax, az] = mid(a), [bx, bz] = mid(b); return Math.max(Math.abs(ax - bx) - (a.w + b.w) / 2, Math.abs(az - bz) - (a.d + b.d) / 2) < r; };
    const homes = done.filter(b => B[b.type].beds && b.type !== 'hq'), pads = done.filter(b => B[b.type].pad);
    let noisy = 0, hazard = 0, beds = 0;
    for (const h of homes) {
      const nb = this.cap(h, 'beds'); beds += nb;
      h.noisy = done.some(o => NOISE[o.type] && o !== h && near(h, o, NOISE[o.type]));
      h.hazard = done.some(o => HAZARD[o.type] && o !== h && near(h, o, HAZARD[o.type]));
      if (h.noisy) noisy += nb; if (h.hazard) hazard++;
    }
    for (const b of done) b.nearPad = !!B[b.type].store && b.type !== 'hq' && pads.some(p => near(b, p, GROW.pad));
    this.adj = { noise: beds ? noisy / beds : 0, hazard, homes: homes.length };
  },
};
