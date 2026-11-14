// The planet's market and the Ministry commitments.
//
// Four goods trade between the bases on the planet for credits: supplies, rations, E-710 fuel and ammo. Each has a price
// that moves every day. Three Ministry indices (100 is normal) say how hard every base on the planet is chasing each
// Ministry's favour: when everyone pushes Defence, ammo and rations get dear and Defence standing gets expensive to buy.
//
// Commitments are how a base buys standing: for each Ministry a level from NONE to ALL OUT, paid every day in goods.
// Standing per day = level x rate x 100 / index, so standing is cheap when a Ministry is out of fashion. Maxing all three
// costs more than a base makes, which is the point: pick what to chase, and trade for what you are short of.
//
// Mixed into Sim (see the end of sim.js); every function here runs with `this` as the Sim.
import { MARKET, COMMIT, MKEYS_ALL } from './config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const GK = Object.keys(MARKET.goods);   // sup, rations, fuel, ammo

export const Market = {
  marketInit() {
    if (this.market) return;
    const goods = {}, idx = {};
    for (const g of GK) { const p = MARKET.goods[g].base; goods[g] = { p, hist: Array(14).fill(+p.toFixed(3)) }; }
    for (const m of MKEYS_ALL) idx[m] = { v: 100, hist: Array(14).fill(100) };
    this.market = { goods, idx, offers: [], shocks: [], bulletin: null, traded: {} };
    this.commit ??= { def: 1, pro: 1, tru: 1 };
    this.commitLast ??= { def: 1, pro: 1, tru: 1 };
    for (const r of this.rivals) r.commit ??= this.rivalCommit(r);
  },
  // a rival's commitments follow what it cares about, with a little week-to-week wobble
  rivalCommit(r) {
    const o = {}; for (const m of MKEYS_ALL) o[m] = clamp(Math.round(1 + r.w[m] * 3 + this.rng.range(-0.8, 0.8)), 0, 4); return o;
  },

  // ---------------------------------------------------------------- prices
  price(g) { return this.market.goods[g].p; },
  buyAt(g) { return this.price(g) * (1 + MARKET.spread); },
  sellAt(g) { return this.price(g) * (1 - MARKET.spread); },
  // credits for n units, with the price moving against you as you trade
  quote(g, n, buy) { const p = buy ? this.buyAt(g) : this.sellAt(g), slip = 1 + (buy ? 1 : -1) * MARKET.impact * n / 2; return Math.round(p * slip * n * 10) / 10; },
  room(g) { return g === 'sup' ? Infinity : Math.max(0, this.storage(g) - this.stored(g)) + (this.b.some(b => b.done && B_pad(b)) ? 60 : 0); },
  holding(g) { return g === 'sup' ? Math.max(0, this.supplies) : this.stored(g) + this.onPad(g); },
  // goods out of storage and off the pads only (never out of a mess hall's or a generator's own stock)
  takeStore(g, n) {
    if (g === 'sup') { const k = Math.min(n, Math.max(0, this.supplies)); this.spend('market', k); return k; }
    let left = n;
    for (const b of this.b) { if (left <= 0) break; if (!(this.storeCap(b, g) || B_pad(b))) continue; const k = Math.min(left, b.stock[g] || 0); b.stock[g] -= k; left -= k; }
    return n - left;
  },
  putStore(g, n) {
    if (g === 'sup') { this.earn('market', n); return n; }
    let left = n;
    for (const b of this.b) { if (left <= 0) break; const cap = this.storeCap(b, g); if (!cap) continue; const k = Math.min(left, cap - (b.stock[g] || 0)); if (k > 0) { b.stock[g] = (b.stock[g] || 0) + k; left -= k; } }
    const pad = this.b.find(b => b.done && B_pad(b)); if (pad && left > 0) { const k = Math.min(left, 60); pad.stock[g] = (pad.stock[g] || 0) + k; left -= k; }
    return n - left;
  },
  canTrade(g, n, buy) {
    if (n <= 0) return { ok: false, why: 'Nothing to trade' };
    if (buy) {
      const cr = this.quote(g, n, true);
      if (this.credits - cr < -this.OD) return { ok: false, why: 'Not enough credits, even on the overdraft' };
      if (this.room(g) < n) return { ok: false, why: `No room for ${n} ${MARKET.goods[g].name.toLowerCase()}: build more storage` };
      return { ok: true, cr };
    }
    if (this.holding(g) < n) return { ok: false, why: `You only hold ${Math.floor(this.holding(g))}` };
    return { ok: true, cr: this.quote(g, n, false) };
  },
  trade(g, n, buy) {
    const c = this.canTrade(g, n, buy); if (!c.ok) return c;
    const G = this.market.goods[g];
    if (buy) { this.spend('market', 0, c.cr); this.putStore(g, n); }
    else { this.takeStore(g, n); this.earn('market', 0, c.cr); }
    G.p = clamp(G.p * (1 + (buy ? 1 : -1) * MARKET.impact * n), MARKET.goods[g].base * 0.35, MARKET.goods[g].base * 3);
    const t = this.market.traded; t[g] = (t[g] || 0) + (buy ? n : -n); this.stats.mkt = (this.stats.mkt || 0) + 1;
    return { ok: true, cr: c.cr };
  },

  // ---------------------------------------------------------------- the daily close: indices, prices, offers, commitments
  marketDay() {
    this.marketInit();
    const M = this.market, day = this.time?.day || 1;
    // shocks: news that moves an index for a few days
    M.shocks = M.shocks.filter(s => s.until >= day);
    if (this.rng.chance(0.1) && !M.shocks.length) {
      const s = this.rng.pick(MARKET.shocks); M.shocks.push({ ...s, until: day + s.days });
      M.bulletin = { day, text: s.text }; this.say('riv', `Market bulletin: ${s.text}`);
    }
    for (const m of MKEYS_ALL) {
      const I = M.idx[m], riv = this.rivals.reduce((a, r) => a + (r.commit?.[m] ?? 2), 0) / Math.max(1, this.rivals.length);
      const target = 100 + 11 * (riv - 2) + 6 * ((this.commit[m] ?? 1) - 2) + M.shocks.filter(s => s.m === m).reduce((a, s) => a + s.d, 0);
      I.v = clamp(I.v + (target - I.v) * 0.3 + this.rng.range(-4, 4), 55, 190);
      I.hist.push(Math.round(I.v)); if (I.hist.length > 14) I.hist.shift();
    }
    for (const g of GK) {
      const G = M.goods[g], d = MARKET.goods[g], target = d.base * Math.pow(M.idx[d.idx].v / 100, d.w);
      G.p += (target - G.p) * 0.3; G.p *= Math.exp(this.rng.range(-1, 1) * MARKET.vol);
      G.p = clamp(G.p, d.base * 0.35, d.base * 3);
      G.hist.push(+G.p.toFixed(3)); if (G.hist.length > 14) G.hist.shift();
    }
    M.traded = {};
    M.offers = M.offers.filter(o => o.until >= day);
    this.payCommitments();
  },
  // a rival base posts an offer, mid-morning: something it has too much of, or is short of
  marketHour(h) {
    this.marketInit();
    if (h !== 10 && h !== 15) return;
    const M = this.market, day = this.time?.day || 1;
    if (M.offers.length >= 3 || !this.rng.chance(0.55)) return;
    const r = this.rng.pick(this.rivals), m = MKEYS_ALL.reduce((a, k) => r.w[k] > r.w[a] ? k : a, 'def');
    // what a rival chasing a Ministry wants is that Ministry's goods; it sells the others
    let wantG = GK.filter(g => MARKET.goods[g].idx === m), sellG = GK.filter(g => MARKET.goods[g].idx !== m);
    if (!wantG.length) wantG = GK;   // a base chasing Truth buys a bit of everything
    const buys = this.rng.chance(0.5), g = this.rng.pick(buys ? wantG : sellG), d = MARKET.goods[g];
    const n = Math.round(this.rng.range(d.lot[0], d.lot[1]) / 10) * 10;
    const p = this.price(g) * (buys ? this.rng.range(1.04, 1.28) : this.rng.range(0.76, 0.94));
    M.offers.push({ id: this.nid++, from: r.name, logo: r.logo, g, n, p, buys, until: day + 2 });
    this.events.push({ t: 'offer' });
  },
  canTakeOffer(o) {
    if (o.buys) return this.holding(o.g) >= o.n ? { ok: true } : { ok: false, why: `You hold ${Math.floor(this.holding(o.g))} of ${o.n}` };
    const cr = Math.round(o.p * o.n);
    if (this.credits - cr < -this.OD) return { ok: false, why: 'Not enough credits' };
    if (this.room(o.g) < o.n) return { ok: false, why: 'No room in storage' };
    return { ok: true };
  },
  takeOffer(id) {
    const M = this.market, o = M.offers.find(o => o.id === id); if (!o) return { ok: false, why: 'Gone' };
    const c = this.canTakeOffer(o); if (!c.ok) return c;
    const cr = Math.round(o.p * o.n);
    if (o.buys) { this.takeStore(o.g, o.n); this.earn('trade', 0, cr); this.say('riv', `${o.n} ${MARKET.goods[o.g].name.toLowerCase()} sold to ${o.from} for ${cr} credits.`); }
    else { this.spend('trade', 0, cr); this.putStore(o.g, o.n); this.say('riv', `${o.n} ${MARKET.goods[o.g].name.toLowerCase()} bought from ${o.from} for ${cr} credits. A truck brought it round.`); }
    M.offers = M.offers.filter(x => x !== o); this.stats.trades = (this.stats.trades || 0) + 1;
    return { ok: true };
  },

  // ---------------------------------------------------------------- commitments
  setCommit(m, lvl) { this.marketInit(); this.commit[m] = clamp(lvl | 0, 0, 4); this.commitSet = true; },
  // what a level costs a day, in each good
  commitCost(m, lvl = this.commit[m]) { const o = {}; for (const [g, v] of Object.entries(COMMIT[m].cost)) o[g] = v * lvl; return o; },
  // standing a day the level would earn at today's index (before the "harder near the top" damping)
  commitGain(m, lvl = this.commit[m]) { return COMMIT[m].gain * lvl * 100 / this.market.idx[m].v; },
  // what a commitment may spend: never the base's own reserve (a few days of what it eats, burns and pays in upkeep),
  // and never the overdraft. Short of that, it pays in part and buys less standing; the base itself never goes without
  spare(g) {
    if (g === 'cr') return Math.max(0, this.credits);
    if (g === 'sup') { const up = this.b.reduce((a, b) => a + (b.done ? B_up(b) : 0), 0) / 7; return Math.max(0, this.supplies - Math.max(300, up * 4 + 150)); }
    const use = this.usage()[g] || 0; return Math.max(0, this.holding(g) - use * 2.5);
  },
  payCommitments() {
    for (const m of MKEYS_ALL) {
      const lvl = this.commit[m] || 0; if (!lvl) { this.commitLast[m] = 1; continue; }
      const cost = this.commitCost(m, lvl); let frac = 1;
      for (const [g, n] of Object.entries(cost)) frac = Math.min(frac, this.spare(g) / n);
      frac = clamp(frac, 0, 1);
      for (const [g, n] of Object.entries(cost)) { const k = n * frac; if (g === 'cr') this.spend('commit', 0, k); else if (g === 'sup') this.spend('commit', k); else this.takeStore(g, k); }
      this.commitLast[m] = frac;
      if (frac > 0) this.gain(m, this.commitGain(m, lvl) * frac);
      if (frac < 0.6 && (this.time?.day || 0) % 3 === 0) this.say(m, `Commitment to the ${COMMIT[m].ministry} short: ${Math.round(frac * 100)}% paid. The base keeps a reserve of what it needs; trade for more ${Object.keys(cost).map(g => COMMIT_NAMES[g]).join(' and ')}, or lower the level.`);
    }
  },
  // the perks of a commitment, as a 0..4 number scaled by how much of it was actually paid
  commitF(m) { return (this.commit?.[m] || 0) * (this.commitLast?.[m] ?? 1); }
};
const COMMIT_NAMES = { sup: 'supplies', cr: 'credits', rations: 'rations', fuel: 'fuel', ammo: 'ammo' };
let B_pad = () => false, B_up = () => 0;
export function bindMarket(B) { B_pad = b => !!B[b.type]?.pad && b.done; B_up = b => B[b.type]?.up || 0; }
