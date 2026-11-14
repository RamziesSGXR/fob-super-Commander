// Construction (0.13): who builds, to what standard, and the ground they clear first.
//   - Standards: tent, prefab and permanent (doctrine's initial, temporary and semi-permanent). Built at one, upgraded in place.
//   - Engineers: crews of three do every building job, one job per crew. Two crews land with you; each Engineer Yard trains
//     another from three of your recruits.
//   - Clearing: the SEAF security detachment sweeps the landing zone before work starts, and the ground is covered in scrub
//     and debris that engineers clear (for a little salvage) before anything goes up on it.
// Mixed into Sim (see the end of sim.js), so `this` is the simulation.
import { B, C, DESIGNS, STD, STANDARDS, ENG, SCRUB, SWEEP, RANKS } from './config.js';
import { Noise } from './noise.js';
import { GROUND } from './site.js';

const CREW_NAMES = ['Able', 'Baker', 'Charlie', 'Dog', 'Easy', 'Fox', 'George', 'How', 'Item', 'Jig', 'King', 'Love', 'Mike', 'Nan', 'Oboe', 'Peter', 'Queen', 'Roger'];
const rankOf = n => [...RANKS].reverse().find(r => n >= r[0])[1];

// what the sweep turns up, by biome: [what was driven off, what was found]
const SWEEP_FIND = {
  desert: [['A pack of sand-skippers was driven off the ridge.', 'Two burrows were collapsed with charges.'], ['A wrecked crawler was stripped for parts.', 'An old supply cache was dug out of a dune.']],
  steppe: [['Grazers were chased off the flats and did not come back.', 'A nest of something with too many legs was cleared from the gully.'], ['A downed drone was salvaged.', 'Fence wire and posts from an abandoned homestead were recovered.']],
  ice: [['A den of snow-stalkers was smoked out.', 'Something large moved off under the ice shelf and was not followed.'], ['A frozen supply drop was cut free.', 'A survey hut was found intact and stripped.']],
  jungle: [['Stalker tracks were found and followed out of the clearing.', 'Two Terminid scouts were dealt with quietly.'], ['A crashed pelican was salvaged for plate and wiring.', 'An overgrown outpost was searched and stripped.']],
  ash: [['Automaton scrap-crawlers were shot off the slag heaps.', 'A dormant patrol bot was found and disabled.'], ['A bot wreck was stripped for steel.', 'Fuel drums were recovered from a burned-out depot.']],
};

export const Build = {
  // ---------------------------------------------------------------- standards
  hasStd(type) { return STANDARDS.has(type); },
  stdOf(b) { return b && this.hasStd(b.type) ? (b.std ?? 2) : 2; },
  // the standard a new building of this type goes up at: the one asked for, else the one picked in the build menu
  stdFor(type, spec) { return this.hasStd(type) ? (spec?.std ?? this.std ?? 2) : 2; },
  stdLock(k) { const s = STD[k]; return s.stage && (this.stage ?? 0) < s.stage ? `${s.name} needs a ${C.STAGES[s.stage].name} charter` : null; },
  setStd(k) { if (STD[k] && !this.stdLock(k)) this.std = k; return this.std; },
  // a capacity number (beds, eat, slots, ward, sales...) at the building's standard. Upgrades work at the old one until done
  capF(b) { return STD[this.stdOf(b)].cap; },
  cap(b, k) {
    const v = B[b.type][k]; if (!v) return 0; const m = this.capF(b);
    return k === 'beds' || k === 'eat' || k === 'slots' || k === 'ward' ? Math.max(1, Math.round(v * m)) : v * m;
  },
  upkeepOf(b) { return (B[b.type].up || 0) * STD[this.stdOf(b)].up; },
  wearOf(b) { return C.WEAR * (DESIGNS[b.design || 0].wear || 1) * STD[this.stdOf(b)].wear; },
  stdBase(type) { const d = B[type]; return d.stdCost ?? d.cost; },
  buildTime(type, k) { return (6 + this.stdBase(type) / 25) * STD[k].time; },
  // what upgrading a building one standard costs, and whether it can be done now
  upgradeInfo(b) {
    if (!b || !this.hasStd(b.type)) return { ok: false, why: 'Built to one standard' };
    const k = this.stdOf(b); if (k >= 2) return { ok: false, why: 'Already permanent' };
    const to = k + 1, base = this.stdBase(b.type), d = STD[to].cost - STD[k].cost;
    const cost = Math.round(base * d + base * C.REFIT), time = (3 + base * d / 25) * STD[to].time, info = { to, cost, time };
    if (!b.done) return { ...info, ok: false, why: 'Finish building it first' };
    if (b.upg) return { ...info, ok: false, why: `Being upgraded to ${STD[b.upg.to].name}` };
    const lk = this.stdLock(to); if (lk) return { ...info, ok: false, why: lk };
    if (this.supplies < cost) return { ...info, ok: false, why: 'Not enough supplies' };
    return { ...info, ok: true };
  },
  upgrade(id) {
    const b = this.byId(id), u = this.upgradeInfo(b); if (!u.ok) return u;
    this.spend('build', u.cost); b.cost = (b.cost ?? this.stdBase(b.type)) + u.cost;
    b.upg = { to: u.to, prog: 0, time: u.time };
    this.say('base', `${B[b.type].name}: upgrade to ${STD[u.to].name} ordered. It runs at half pace while the engineers are in.`);
    this.events.push({ t: 'placed', id: b.id });
    return u;
  },

  // ---------------------------------------------------------------- engineer crews
  newCrew(yard = null, wait = 0, men = null) {
    this.cnid = (this.cnid || 0) + 1;
    const r = () => this.rng.next(), sur = ['Okonkwo', 'Haldane', 'Reyes', 'Brannigan', 'Sato', 'Volkov', 'Mbeki', 'Lindgren', 'Castillo', 'Duarte', 'Kowalski', 'Ferreira', 'Nakamura', 'Ashby', 'Quinn', 'Morrow'];
    const c = { id: this.cnid, name: `Crew ${CREW_NAMES[(this.cnid - 1) % CREW_NAMES.length]}`, yard, wait, job: null, ct: 0,
      men: men || Array.from({ length: ENG.per }, () => sur[Math.floor(r() * sur.length)]) };
    (this.crews ||= []).push(c); return c;
  },
  crewsInit() { this.crews = []; this.cnid = 0; for (let i = 0; i < ENG.start; i++) this.newCrew(); },
  engineers() { return (this.crews || []).reduce((a, c) => a + c.men.length, 0); },
  heads() { return this.troops.length + this.engineers(); },   // votes on the base, engineers included
  crewOn(id) { return this.crews?.find(c => c.job === id) || null; },
  // where a job stands in the queue: 0 = a crew is on it
  jobQueue() { return this.b.filter(b => !b.done || b.upg).map(b => b.id).concat((this.clr || []).map(o => o.id)); },
  waitingAhead(id) { const q = this.jobQueue().filter(j => !this.crewOn(j)); return q.indexOf(id); },
  // each finished yard takes three recruits and trains them; a crew whose yard comes down is posted elsewhere
  yardStep() {
    for (const y of this.b) {
      if (y.type !== 'yard' || !y.done) continue;
      const want = B.yard.crews || 1, have = this.crews.filter(c => c.yard === y.id).length;
      if (have >= want) { y.short = false; continue; }
      const rec = this.troops.filter(t => !this.trained(t) && !(t.hurt > 0) && (t.state === 'idle' || t.state === 'job')).sort((a, b) => a.train - b.train);
      if (rec.length < ENG.per) { if (!y.short) this.say('base', `The Engineer Yard needs ${ENG.per} recruits to train a crew. It will take them as they arrive.`); y.short = true; continue; }
      const men = rec.slice(0, ENG.per), ids = new Set(men.map(t => t.id));
      this.troops = this.troops.filter(t => !ids.has(t.id));
      const c = this.newCrew(y.id, ENG.train, men.map(t => t.name)); y.short = false;
      this.events.push({ t: 'crew', id: c.id, from: men.map(t => t.id) });
      this.say('base', `Recruits ${men.map(t => t.name).join(', ')} report to the Engineer Yard. They will be ${c.name} by this time tomorrow.`);
    }
    for (const c of [...this.crews]) if (c.yard && !this.byId(c.yard)) {
      this.crews = this.crews.filter(x => x !== c);
      this.say('base', `With its yard gone, ${c.name} has been posted to another base. The Bureau thanks you for the loan.`);
    }
  },
  // every step: crews take the oldest jobs nobody is on, then work them. Nothing is built until the landing zone is secure
  construct(dt) {
    if (!this.crews) this.crewsInit();
    this.yardStep();
    for (const c of this.crews) if (c.wait > 0) { c.wait -= dt; if (c.wait <= 0) { c.wait = 0; this.say('base', `${c.name} has finished training at the Engineer Yard and reports for work.`); } }
    if (this.sweep && !this.sweep.done) this.sweepStep(dt);
    const work = this.jobQueue(), valid = new Set(work);
    for (const c of this.crews) if (c.job != null && !valid.has(c.job)) { c.job = null; c.ct = 0; }
    const taken = new Set(this.crews.map(c => c.job).filter(j => j != null));
    for (const c of this.crews) if (c.job == null && !c.wait) { const j = work.find(id => !taken.has(id)); if (j != null) { c.job = j; c.ct = 0; taken.add(j); } }
    if (!this.secure()) return;
    const pace = (1 + ENG.help * Math.min(2, this.idle || 0)) * (1 + 0.08 * (this.commitF ? this.commitF('pro') : 0));
    for (const c of this.crews) {
      if (c.job == null || c.wait) continue;
      if (c.job < 0) {   // a clearing order
        const o = this.clr.find(o => o.id === c.job); if (!o) continue;
        c.ct += dt * pace;
        while (c.ct >= SCRUB.t && o.tiles.length) { this.clearTile(o.tiles.shift(), true); c.ct -= SCRUB.t; }
        if (!o.tiles.length) { this.clr = this.clr.filter(x => x !== o); c.job = null; this.events.push({ t: 'scrub' }); }
        continue;
      }
      const b = this.byId(c.job); if (!b) continue;
      if (b.clr?.length) {   // the plot is cleared first
        c.ct += dt * pace;
        while (c.ct >= SCRUB.t && b.clr.length) { this.clearTile(b.clr.shift(), true); c.ct -= SCRUB.t; }
        continue;
      }
      if (!b.done) {
        b.prog += dt / (b.time * C.BUILD) * pace;
        if (b.prog >= 1) {
          b.prog = 1; b.done = true; this.events.push({ t: 'built', id: b.id }); this.roadsV++;
          this.say('base', b.refit ? `${B[b.type].name} refitted: ${DESIGNS[b.design || 0].name}.` : `${B[b.type].name} complete${this.hasStd(b.type) ? ` (${STD[this.stdOf(b)].name.toLowerCase()})` : ''}. ${c.name} moves on.`);
          b.refit = false; c.job = null;
        }
      } else if (b.upg) {
        b.upg.prog += dt / (b.upg.time * C.BUILD) * pace;
        if (b.upg.prog >= 1) {
          b.std = b.upg.to; delete b.upg; b.cond = 100; c.job = null;
          this.events.push({ t: 'built', id: b.id }); this.roadsV++;
          this.say('base', `${B[b.type].name} upgraded to ${STD[b.std].name.toLowerCase()} standard. ${c.name} moves on.`);
        }
      }
    }
  },

  // ---------------------------------------------------------------- scrub and debris
  makeScrub() {
    const N = this.N, sc = new Uint8Array(N * N); if (!this.site) return sc;
    const nz = new Noise((this.seed ^ 0x5c7b) >>> 0), dens = SCRUB.density[this.site.biome] ?? 0.4;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, t = this.terr?.[i]; if (t === GROUND.WATER || t === GROUND.ROCK) continue;
      const v = nz.fbm(x / 7, z / 7) * 0.8 + nz.v(x * 0.9, z * 0.9) * 0.2;
      if (v > 1 - dens) sc[i] = 1;
    }
    return sc;
  },
  packScrub() { const s = this.scrub; if (!s) return ''; let o = ''; for (let i = 0; i < s.length; i += 4) o += ((s[i] | s[i + 1] << 1 | s[i + 2] << 2 | s[i + 3] << 3) || 0).toString(16); return o; },
  unpackScrub(str) { const N = this.N, s = new Uint8Array(N * N); if (str) for (let k = 0; k < str.length; k++) { const v = parseInt(str[k], 16); for (let j = 0; j < 4; j++) if (k * 4 + j < s.length) s[k * 4 + j] = (v >> j) & 1; } return s; },
  scrubName() { return SCRUB.name[this.site?.biome] || 'scrub and debris'; },
  scrubUnder(x, z, w, d) { const out = []; if (!this.scrub) return out; for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) { const k = (z + j) * this.N + x + i; if (this.scrub[k]) out.push(k); } return out; },
  clearTile(i, pay) {
    if (!this.scrub?.[i]) return;
    this.scrub[i] = 0; this.scrubV = (this.scrubV || 0) + 1;
    if (pay) { this.earn('salvage', SCRUB.yield); this.stats.cleared = (this.stats.cleared || 0) + 1; }
  },
  // the engineers clear a patch of scrub round a tile, for its salvage: up to SCRUB.patch connected tiles inside the charter
  orderClear(tx, tz) {
    const N = this.N, i0 = tz * N + tx; if (!this.scrub?.[i0]) return { ok: false, why: `Nothing to clear here` };
    const held = new Set((this.clr || []).flatMap(o => o.tiles));
    if (held.has(i0)) return { ok: false, why: 'Already ordered' };
    if (!this.ownedTile(tx, tz)) return { ok: false, why: 'Outside your ground: buy the parcel first (LAND)' };
    const q = [i0], seen = new Set(q), tiles = [];
    while (q.length && tiles.length < SCRUB.patch) {
      const i = q.shift(), x = i % N, z = (i / N) | 0; tiles.push(i);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, j = nz * N + nx;
        if (!this.ownedTile(nx, nz) || seen.has(j) || !this.scrub[j] || held.has(j) || this.occ[j]) continue;
        seen.add(j); q.push(j);
      }
    }
    this.cnid2 = (this.cnid2 || 0) + 1; (this.clr ||= []).push({ id: -this.cnid2, tiles });
    this.events.push({ t: 'scrub' });
    return { ok: true, n: tiles.length };
  },
  cancelClear(id) { this.clr = (this.clr || []).filter(o => o.id !== id); this.events.push({ t: 'scrub' }); },
  clearOrderAt(i) { return (this.clr || []).find(o => o.tiles.includes(i)) || null; },

  // ---------------------------------------------------------------- the landing sweep
  startSweep() {
    const team = this.troops.filter(t => this.trained(t)).slice(0, 4); if (!team.length) return;
    for (const t of team) { t.state = 'sweep'; t.job = null; t.at = null; t.gate = null; }
    this.sweep = { t: 0, dur: SWEEP.dur, team: team.map(t => t.id), done: false };
    this.say('def', `${rankOf(team[0].missions)} ${team[0].name}'s security detachment fans out to sweep the landing zone. The engineers start work once it is declared secure, by early afternoon.`);
  },
  secure() { return !this.sweep || this.sweep.done; },
  sweepStep(dt) {
    const sw = this.sweep; sw.t += dt; if (sw.t < sw.dur) return;
    sw.done = true;
    const team = sw.team.map(id => this.troop(id)).filter(Boolean);
    for (const t of team) if (t.state === 'sweep') t.state = 'idle';
    const r = () => this.rng.next(), [lo, hi] = SWEEP.salvage, sal = Math.round(lo + r() * (hi - lo));
    this.earn('salvage', sal);
    const f = SWEEP_FIND[this.site?.biome] || SWEEP_FIND.steppe, pk = a => a[Math.floor(r() * a.length)];
    const lead = team[0], lines = [
      'The security detachment swept a ring round the landing zone in pairs, from the HQ out to the charter line.',
      pk(f[0]), pk(f[1]) + ` ${sal} supplies were brought in.`,
      `The ground beyond the landing zone is thick with ${this.scrubName()}; the engineers will have to clear it as they build.`,
      'The landing zone is declared secure. Everyone came home.'];
    const rep = { id: this.nid++, day: this.time?.day || 1, week: this.week, op: 'Landing zone sweep', kind: 'Security sweep', place: null, win: true,
      leader: lead?.name, n: team.length, veh: [], lines, def: 0, sup: sal };
    (this.reports ||= []).push(rep);
    this.events.push({ t: 'report', id: rep.id }, { t: 'secure' });
    this.say('def', `Landing zone secure. ${sal} supplies salvaged. Engineers, you may begin.`);
  },
};
