// Utilities (0.15): power, water, sewage and fuel by coverage area.
//   - Every utility building covers a circle round it (B[type].cover, and UTIL.powCover for power sources). A building is
//     covered when its footprint comes within the circle.
//   - Power: a building that draws power and is outside every power circle goes dark: it draws nothing and does nothing.
//   - Water: wells and purification units make water, towers carry it further. Bunks, messes, wards and the hydro dome need
//     it. Sewage: lagoons and treatment plants take the waste of the same buildings. The HQ covers the first tents.
//   - Fuel: a fuel farm pipes fuel to every generator, motor pool, vehicle bay and factory in reach, every hour.
//   - Health: bunks without water or sewage, or on a well next to a lagoon, raise a daily outbreak risk. Outbreaks put
//     troopers in the Medical Bay (or their bunks) for a day or two. Nobody dies of it.
// Mixed into Sim (see the end of sim.js), so `this` is the simulation.
import { B, UTIL } from './config.js';
import { GROUND } from './site.js';

const mid = b => [b.x + b.w / 2, b.z + b.d / 2];
// does a circle of radius r round source s reach building b's footprint?
const reaches = (s, b, r) => {
  const [cx, cz] = mid(s), dx = Math.max(b.x - cx, 0, cx - (b.x + b.w)), dz = Math.max(b.z - cz, 0, cz - (b.z + b.d));
  return dx * dx + dz * dz <= r * r;
};
const FUELED = new Set(['gen', 'motorpool', 'vbay', 'factory']);
const SICK = { water: ['dysentery', 'a stomach bug from the water'], sewer: ['camp fever', 'a stomach bug from the latrines'], bad: ['something in the well water'] };

export const Utilities = {
  needsWater(b) { const d = B[b.type]; return !!(d.beds || d.eat || d.ward || b.type === 'dome') && b.type !== 'hq'; },
  needsSewer(b) { const d = B[b.type]; return !!(d.beds || d.eat || d.ward) && b.type !== 'hq'; },
  // how far a building's services reach: { pw, wa, se, fu }, for a source that is up and switched on
  coverOf(b) {
    const d = B[b.type], c = { ...(d.cover || {}) };
    if (UTIL.powCover[b.type]) c.pw = UTIL.powCover[b.type];
    if (b.type === 'hq') { c.wa = UTIL.hq.wa; c.se = UTIL.hq.se; }
    return c;
  },
  graceOn() { return (this.utilGrace || 0) > 0; },
  // worked out when the base changes: who is covered, how much water and sewage there is, what smells
  utilities() {
    const key = `${this.troops.length}:${this.roadsV}:${this.b.length}:${this.b.reduce((a, b) => a + (b.done ? 1 : 0) + (b.off ? 2 : 0), 0)}:${this.b.reduce((a, b) => a + (b.crew || 0), 0)}`;
    if (this.utilKey === key && this.util) return this.util;
    this.utilKey = key;
    const done = this.b.filter(b => b.done), src = done.filter(b => !b.off).map(b => [b, this.coverOf(b)]);
    const makers = src.filter(([b]) => B[b.type].water || b.type === 'hq');
    // a tower only carries water if a well, purifier or the HQ is near enough to fill it
    const live = src.filter(([b, c]) => !(B[b.type].relay === 'wa' && !makers.some(([m]) => Math.hypot(mid(m)[0] - mid(b)[0], mid(m)[1] - mid(b)[1]) <= UTIL.relay)));
    const by = k => live.filter(([, c]) => c[k]).map(([s, c]) => [s, c[k]]);
    const pw = by('pw'), wa = by('wa'), se = by('se'), fu = by('fu'), lag = done.filter(b => B[b.type].smell);
    const grace = this.graceOn();
    for (const b of done) {
      const d = B[b.type];
      b.dark = d.pw < 0 && !grace && !pw.some(([s, r]) => s === b || reaches(s, b, r));
      b.dry = this.needsWater(b) && !wa.some(([s, r]) => reaches(s, b, r));
      b.foul = this.needsSewer(b) && !se.some(([s, r]) => reaches(s, b, r));
      b.piped = FUELED.has(b.type) && fu.some(([s, r]) => reaches(s, b, r));
      b.smelly = !!d.beds && b.type !== 'hq' && lag.some(l => reaches(l, b, B[l.type].smell));
      b.bad = !!d.water && lag.some(l => reaches(l, b, UTIL.badWell));   // a well by a lagoon: contaminated
    }
    // water and sewage, a day
    const use = done.reduce((a, b) => a + (B[b.type].eat && b.type !== 'hq' ? UTIL.use.eat : 0) + (B[b.type].ward ? UTIL.use.ward : 0) + (b.type === 'dome' ? UTIL.use.dome : 0), 0) + this.troops.length * UTIL.use.vote;
    const runs = b => (B[b.type].crew ? Math.min(1, b.crew / B[b.type].crew) : 1) * (b.dark ? 0 : 1) * (B[b.type].pw < 0 ? Math.max(0.3, this.power?.ratio ?? 1) : 1) * this.condF(b);
    let made = done.some(b => b.type === 'hq') ? UTIL.hq.water : 0, bad = 0, cap = done.some(b => b.type === 'hq') ? UTIL.hq.sewer : 0;
    for (const b of done) if (!b.off) {
      const d = B[b.type];
      if (d.water) { const w = d.water * runs(b); made += w; if (b.bad) bad += w; }
      if (d.sewer) cap += d.sewer * runs(b);
    }
    const homes = done.filter(b => B[b.type].beds && b.type !== 'hq'), beds = homes.reduce((a, b) => a + this.cap(b, 'beds'), 0) || 1;
    const share = f => homes.reduce((a, b) => a + (f(b) ? this.cap(b, 'beds') : 0), 0) / beds;
    this.util = {
      water: { made: Math.round(made), use: Math.round(use), ratio: use ? Math.min(1, made / use) : 1, bad: made ? bad / made : 0 },
      sewer: { cap: Math.round(cap), use: Math.round(use), ratio: use ? Math.min(1, cap / use) : 1 },
      wet: homes.length ? share(b => !b.dry) : 1, drained: homes.length ? share(b => !b.foul) : 1,
      smelly: homes.filter(b => b.smelly).length, dark: done.filter(b => b.dark).length, homes: homes.length,
    };
    return this.util;
  },
  // how well the bunks are served, 0..1
  waterEff() { const u = this.util; return u ? u.wet * u.water.ratio : 1; },
  sewerEff() { const u = this.util; return u ? u.drained * u.sewer.ratio : 1; },
  utilMorale() {
    if (this.graceOn() || !this.util) return { water: 0, sewer: 0, smell: 0, sick: 0 };
    const sick = this.troops.filter(t => t.sick && t.hurt > 0).length;
    return { water: -Math.round(UTIL.mor.water * (1 - this.waterEff())), sewer: -Math.round(UTIL.mor.sewer * (1 - this.sewerEff())),
      smell: -Math.min(UTIL.mor.smell, this.util.smelly), sick: -Math.min(8, sick * UTIL.mor.sick) };
  },
  // every hour: the fuel farm tops up everything it reaches
  pipeFuel() {
    const farms = this.b.filter(b => b.done && !b.off && B[b.type].cover?.fu && (b.stock.fuel || 0) > 1);
    if (!farms.length) return;
    for (const b of this.b) {
      if (!b.done || !b.piped) continue;
      const want = Math.max(this.needCap(b, 'fuel'), b.type === 'gen' ? B.gen.need.fuel : 0) - (b.stock.fuel || 0); if (want <= 0.5) continue;
      for (const f of farms) { const r = B[f.type].cover.fu, [cx, cz] = mid(f); if (Math.hypot(Math.max(b.x - cx, 0, cx - b.x - b.w), Math.max(b.z - cz, 0, cz - b.z - b.d)) > r) continue;
        const n = Math.min(want, f.stock.fuel); f.stock.fuel -= n; b.stock.fuel = (b.stock.fuel || 0) + n; this.stats.piped = (this.stats.piped || 0) + n; break; }
    }
  },
  // every day: the inspectorate's grace runs down, and the dice are rolled for an outbreak
  utilDay() {
    if (this.graceOn()) { this.utilGrace--; if (!this.utilGrace) this.say('pro', 'The utilities inspectorate has arrived. From today, bunks without water or sewage cost morale and risk sickness, and buildings outside power coverage go dark.'); return; }
    const o = UTIL.outbreak, home = this.troops.filter(t => t.state !== 'patrol' && !(t.hurt > 0));
    if (home.length < o.min) return;
    const wa = 1 - this.waterEff(), se = 1 - this.sewerEff(), bad = this.util?.water.bad || 0;
    let p = o.base + o.water * wa + o.sewer * se + o.bad * bad;
    if (this.b.some(b => b.done && B[b.type].ward && b.crew > 0)) p *= o.medbay;   // preventive medicine
    this.risk = p;
    if (this.rng.next() >= p) return;
    const cause = bad > 0.2 && bad * o.bad >= Math.max(wa * o.water, se * o.sewer) ? 'bad' : wa * o.water >= se * o.sewer ? 'water' : 'sewer';
    const n = Math.min(Math.ceil(home.length / 4), o.sick[0] + Math.floor(this.rng.next() * (o.sick[1] - o.sick[0] + 1)));
    const ill = this.rng.shuffle(home.slice()).slice(0, n);
    for (const t of ill) { t.hurt = o.hurt; t.sick = true; t.state = 'hurt'; t.job = null; t.at = null; t.gate = null; }
    this.stats.sick = (this.stats.sick || 0) + n;
    const what = SICK[cause][Math.floor(this.rng.next() * SICK[cause].length)];
    const fix = cause === 'bad' ? 'Move the well away from the lagoon.' : cause === 'water' ? 'More water: wells, a purification unit, towers to carry it.' : 'Sewage: a lagoon or a treatment plant in reach of the bunks.';
    this.say('base', `Outbreak: ${n} votes are down with ${what}. ${this.b.some(b => b.done && B[b.type].ward) ? 'The medics have them.' : 'Without a Medical Bay they will mend slowly in their bunks.'} ${fix}`);
    this.events.push({ t: 'outbreak', n, cause });
  },
  nearWater(x, z, w, d, r) {
    for (let j = -r; j < d + r; j++) for (let i = -r; i < w + r; i++) { const tx = x + i, tz = z + j; if (tx >= 0 && tz >= 0 && tx < this.N && tz < this.N && this.terr?.[tz * this.N + tx] === GROUND.WATER) return true; }
    return false;
  },
};
