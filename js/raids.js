// Raids: something out there probes the wire. Threat builds each day; when a raid forms, the Ministry of Intelligence
// warns as well as the base can listen (nothing, a lookout, a comms array), and at its hour the wall, the gates, the
// guns and whoever is fit to fight decide how it goes.
import { C, B } from './config.js';

export const RAID = {
  grace: 4,          // no raids before this day
  kinds: [
    { k: 'scouts', name: 'A scouting party', size: [1, 2], stage: 0 },
    { k: 'raiders', name: 'A raiding party', size: [2, 3], stage: 0 },
    { k: 'swarm', name: 'A swarm', size: [3, 4], stage: 1 },
    { k: 'assault', name: 'A full assault', size: [4, 6], stage: 2 },
  ],
  DIRS: ['north', 'east', 'south', 'west'],
};
const kindOf = k => RAID.kinds.find(q => q.k === k);

export const Raids = {
  // how well the base hears it coming: 0 nothing, 1 a day's notice (lookout or patrol hut), 2 the hour, size and side (comms)
  raidIntel() { return this.has('comms') ? 2 : this.has('lookout') || this.has('patrol') ? 1 : 0; },
  // each day close: threat climbs with the charter, and sometimes turns into a raid a day or two out
  raidPlan() {
    if (this.raid || this.callIn || this.week < RAID.grace || this.noRaids) return;
    this.threat = Math.min(100, (this.threat || 0) + 5 + (this.stage || 0) * 3 + this.rng.int(8));
    if (!this.rng.chance(this.threat / 150)) return;
    const pool = RAID.kinds.filter(q => q.stage <= (this.stage || 0)), q = pool[Math.min(pool.length - 1, this.rng.int(pool.length + 1))];
    const size = q.size[0] + this.rng.int(q.size[1] - q.size[0] + 1);
    this.raid = { k: q.k, size, week: this.week + 1 + (this.rng.chance(0.5) ? 1 : 0), wt: C.WEEK * this.rng.range(0.12, 0.9), dir: this.rng.int(4) };
    this.threat *= 0.3;
    const i = this.raidIntel();
    if (i === 2) this.say('def', `Intelligence: ${q.name.toLowerCase()} is forming to the ${RAID.DIRS[this.raid.dir]}. Expected ${this.raidWhen()}. See INTELLIGENCE.`);
    else if (i === 1) this.say('def', `Intelligence: the lookouts report movement beyond the wire. Something is coming on day ${this.raid.week}.`);
    if (i) this.events.push({ t: 'raidWarn' });
  },
  raidHour(r = this.raid) { return Math.floor(((r.wt / C.WEEK + 0.25) % 1) * 24); },
  raidWhen(r = this.raid) { return `day ${r.week} at ${String(this.raidHour(r)).padStart(2, '0')}:00`; },
  // what the Intelligence tab may say about it
  raidInfo() {
    const r = this.raid, i = this.raidIntel(), base = { threat: Math.round(this.threat || 0), intel: i, strength: this.raidStrength() };
    if (!r || (!i && !r.alarm)) return base;
    const q = kindOf(r.k);
    return { ...base, known: true, day: r.week, when: i === 2 || r.alarm ? this.raidWhen(r) : `day ${r.week}`, what: i === 2 || r.alarm ? q.name : 'Movement beyond the wire', dir: i === 2 || r.alarm ? RAID.DIRS[r.dir] : null, attack: i === 2 ? this.raidAttack(r) : null, alarm: !!r.alarm };
  },
  raidAttack(r) { return 22 + r.size * 12; },
  // what the base can put against it: the wall as scored for defensibility, fighters fit for duty, and its guns
  raidStrength() {
    const f = this.fortify(), fit = this.troops.filter(t => this.trained(t) && !(t.hurt > 0) && t.state !== 'patrol').length;
    return Math.round(f.score * 0.55 + Math.min(45, fit * 1.3) + f.armed * 20 + (this.has('armory') ? 6 : 0));
  },
  raidStep() {
    const r = this.raid; if (!r) return;
    const left = (r.week - this.week) * C.WEEK + r.wt - this.wt;
    if (left > 0) {
      if (!r.alarm && left < C.WEEK / 12) { r.alarm = true; const q = kindOf(r.k); this.say('def', `ALERT: ${q.name.toLowerCase()} is at the wire to the ${RAID.DIRS[r.dir]}. Stand to.`); this.events.push({ t: 'raidAlarm' }); }
      return;
    }
    this.raidResolve();
  },
  raidResolve() {
    const r = this.raid, q = kindOf(r.k); this.raid = null;
    const str = this.raidStrength(), atk = this.raidAttack(r), margin = str - atk + this.rng.int(21) - 10, shelter = this.has('shelter');
    const fit = this.rng.shuffle(this.troops.filter(t => !(t.hurt > 0) && t.state !== 'patrol'));
    const wound = n => { const w = fit.splice(0, Math.max(0, Math.round(n * (shelter ? 0.5 : 1)))); for (const t of w) { t.hurt = C.HEAL; t.state = 'hurt'; t.job = null; t.at = null; t.gate = null; } return w.length; };
    const damage = (n, by) => { const hit = this.rng.shuffle(this.b.filter(b => b.done && !B[b.type].fixed && b.type !== 'hq')).slice(0, n); for (const b of hit) b.cond = Math.max(5, b.cond - by - this.rng.int(10)); return hit.length; };
    this.stats.raids = (this.stats.raids || 0) + 1; let out, text;
    if (margin >= 12) {
      out = 'repelled'; const sal = r.size * 35; this.earn('salvage', sal); this.gain('def', 3); this.mood = Math.min(15, this.mood + 2); this.pride += 2; this.stats.raidsWon = (this.stats.raidsWon || 0) + 1;
      text = `${q.name} broke on the wire and was driven off without loss. ${sal} supplies of salvage recovered. Defence standing rises.`;
    } else if (margin >= -6) {
      out = 'held'; const w = wound(1 + (r.size > 2 ? 1 : 0)), d = damage(1, 12); this.gain('def', 1); this.stats.raidsWon = (this.stats.raidsWon || 0) + 1;
      text = `${q.name} was held at the wall. ${w} wounded, ${d} building${d === 1 ? '' : 's'} damaged. A stronger perimeter would have cost nothing.`;
    } else {
      out = 'breached'; const loot = Math.round(Math.min(Math.max(0, this.supplies) * 0.12, r.size * 140)), w = wound(r.size), d = damage(1 + Math.ceil(r.size / 2), 25);
      this.spend('raid', loot); this.gain('def', -3); this.mood = Math.max(-15, this.mood - 4); this.grief += 2;
      text = `${q.name} got inside the base. ${loot} supplies lost, ${w} wounded, ${d} building${d === 1 ? '' : 's'} damaged. Close the wall, watch it and arm it (DEFENCE).`;
    }
    this.lastRaid = { out, k: r.k, week: this.week, str, atk };
    this.say('def', text); this.events.push({ t: 'raid', out, text }); this.recalc();
  },
};
