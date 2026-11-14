// The land (0.16). A base sits on a section of a planet: GRID x GRID parcels of PARCEL x PARCEL tiles. The Bureau never
// grants the ring of parcels round the edge, so 441 of the 529 can be held. You call the HQ down anywhere on the section,
// the 3 x 3 parcels round it are yours, and more are bought one at a time next to what you hold, up to the charter's
// allowance.
import { C, B, LAND, SCRUB } from './config.js';
import { GROUND } from './site.js';

const P = LAND.PARCEL, G = LAND.GRID;

export const Land = {
  pIdx(px, pz) { return pz * G + px; },
  parcelAt(x, z) { return [Math.floor(x / P), Math.floor(z / P)]; },
  grantable(px, pz) { return px >= 1 && pz >= 1 && px < G - 1 && pz < G - 1; },
  owns(px, pz) { return px >= 0 && pz >= 0 && px < G && pz < G && this.own[pz * G + px] === 1; },
  // is a tile inside the ground the Bureau has granted?
  ownedTile(x, z) {
    if (x < 0 || z < 0 || x >= this.N || z >= this.N) return false;
    return this.own[Math.floor(z / P) * G + Math.floor(x / P)] === 1;
  },
  held() { let n = 0; for (const v of this.own) n += v; return n; },
  allowance() { return C.STAGES[this.stage || 0].parcels ?? 441; },
  // the square that holds every parcel you own, in tiles [x0, z0, x1, z1): for loops that only need to look there
  ownBounds() {
    let x0 = G, z0 = G, x1 = -1, z1 = -1;
    for (let pz = 0; pz < G; pz++) for (let px = 0; px < G; px++) if (this.own[pz * G + px]) { x0 = Math.min(x0, px); z0 = Math.min(z0, pz); x1 = Math.max(x1, px); z1 = Math.max(z1, pz); }
    if (x1 < 0) return [0, 0, 0, 0];
    return [x0 * P, z0 * P, (x1 + 1) * P, (z1 + 1) * P];
  },
  touches(px, pz) { return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.owns(px + dx, pz + dz)); },
  // what is on a parcel: tiles of each ground kind, scrub, and how much of it a base could use
  parcelInfo(px, pz) {
    const N = this.N, cnt = [0, 0, 0, 0, 0]; let scrub = 0;
    for (let z = pz * P; z < pz * P + P; z++) for (let x = px * P; x < px * P + P; x++) { const i = z * N + x; cnt[this.terr?.[i] || 0]++; if (this.scrub?.[i]) scrub++; }
    const open = cnt[0] + cnt[3] + cnt[4], a = LAND.TILE_M * LAND.TILE_M / 1e6;
    return { open, water: cnt[1], rock: cnt[2], seeps: cnt[3], ore: cnt[4], scrub, tiles: P * P, km2: +(P * P * a).toFixed(2), buildKm2: +(open * a).toFixed(2), frac: open / (P * P) };
  },
  parcelCost(px, pz) {
    const f = this.parcelInfo(px, pz), extra = Math.max(0, this.held() - LAND.START * LAND.START);
    const w = 0.45 + f.frac * 0.75 + (f.seeps ? 0.15 : 0) + (f.ore ? 0.15 : 0) + (f.water && f.water < f.tiles * 0.6 ? 0.08 : 0);
    return { sup: Math.round((LAND.sup + LAND.supStep * extra) * w / 10) * 10, cr: Math.round((LAND.cr + LAND.crStep * extra) * w / 5) * 5 };
  },
  // the state of a parcel for the LAND view: owned, buy (can be bought now), next (next to yours but the charter or the
  // purse says no), far (not touching your ground), edge (never granted)
  parcelState(px, pz) {
    if (!this.grantable(px, pz)) return 'edge';
    if (this.owns(px, pz)) return 'owned';
    if (!this.touches(px, pz)) return 'far';
    return this.canBuy(px, pz).ok ? 'buy' : 'next';
  },
  canBuy(px, pz) {
    if (this.callIn) return { ok: false, why: 'Call in the HQ first' };
    if (!this.grantable(px, pz)) return { ok: false, why: 'The edge of the section: the Bureau does not grant it' };
    if (this.owns(px, pz)) return { ok: false, why: 'Already yours' };
    if (!this.touches(px, pz)) return { ok: false, why: 'Must touch ground you already hold' };
    const c = this.parcelCost(px, pz);
    if (this.held() >= this.allowance()) { const nx = C.STAGES[(this.stage || 0) + 1]; return { ok: false, why: `The ${C.STAGES[this.stage || 0].name} charter allows ${this.allowance()} parcels${nx ? `: the ${nx.name} charter allows ${nx.parcels}` : ''}`, ...c }; }
    if (this.credits < c.cr) return { ok: false, why: `Needs ${c.cr} credits`, ...c };
    if (this.supplies < c.sup) return { ok: false, why: `Needs ${c.sup} supplies for the survey and the stakes`, ...c };
    return { ok: true, ...c };
  },
  buyParcel(px, pz) {
    const c = this.canBuy(px, pz); if (!c.ok) return c;
    this.spend('land', c.sup, c.cr); this.own[pz * G + px] = 1; this.ownV = (this.ownV || 0) + 1;
    this.stats.parcels = (this.stats.parcels || 0) + 1;
    this.rebuildNet(); this.events.push({ t: 'land', px, pz });
    const f = this.parcelInfo(px, pz);
    this.say('bur', `Land grant ${String.fromCharCode(65 + px - 1)}${pz}: ${f.buildKm2} km² of buildable ground${f.seeps ? ', E-710 under it' : ''}${f.ore ? ', ore to dig' : ''}. ${c.sup} supplies and a ${c.cr} credit filing fee, in triplicate.`);
    return { ok: true, ...c };
  },
  // a name for a parcel on the grid: columns lettered A.., rows numbered 1..
  parcelName(px, pz) { return `${String.fromCharCode(65 + px - 1)}${pz}`; },

  // ---------------------------------------------------------------- calling in the HQ
  // the 3 x 3 parcels round an HQ at (x, z), kept off the ungranted edge
  startParcels(x, z) {
    const [w, d] = [B.hq.w, B.hq.d], [cx, cz] = this.parcelAt(x + w / 2, z + d / 2), h = (LAND.START - 1) / 2;
    const px = Math.max(1 + h, Math.min(G - 2 - h, cx)), pz = Math.max(1 + h, Math.min(G - 2 - h, cz));
    const out = []; for (let j = -h; j <= h; j++) for (let i = -h; i <= h; i++) out.push([px + i, pz + j]);
    return out;
  },
  canFound(x, z) {
    const N = this.N, [w, d] = [B.hq.w, B.hq.d];
    if (x < P || z < P || x + w > N - P || z + d > N - P) return { ok: false, why: 'Too close to the edge of the section' };
    // the HQ, the flag beside it and a landing zone for the first pelican want open, level ground
    for (let j = -3; j < d + 3; j++) for (let i = -3; i < w + 3; i++) {
      const t = this.terr?.[(z + j) * N + x + i];
      if (t === GROUND.WATER || t === GROUND.ROCK) return { ok: false, why: j >= 0 && i >= 0 && j < d && i < w ? (t === GROUND.WATER ? 'That is water' : 'Solid rock') : 'Needs open ground round it for the flag and the landing zone' };
    }
    return { ok: true, parcels: this.startParcels(x, z) };
  },
  // the HQ comes down: the starting ground is granted, the landing zone cleared from orbit, the flag goes up beside it
  found(x, z, opts = {}) {
    const c = opts.force ? { ok: true, parcels: this.startParcels(x, z) } : this.canFound(x, z); if (!c.ok) return c;
    const N = this.N;
    this.own.fill(0); for (const [px, pz] of c.parcels) this.own[pz * G + px] = 1; this.ownV = (this.ownV || 0) + 1;
    const [w, d] = [B.hq.w, B.hq.d], cx = x + w / 2, cz = z + d / 2;
    if (this.scrub) for (let j = -SCRUB.keep - 1; j <= SCRUB.keep + 1; j++) for (let i = -SCRUB.keep - 1; i <= SCRUB.keep + 1; i++) {
      const tx = Math.floor(cx + i), tz = Math.floor(cz + j); if (tx < 0 || tz < 0 || tx >= N || tz >= N) continue;
      if (Math.hypot(tx + 0.5 - cx, tz + 0.5 - cz) < SCRUB.keep) this.scrub[tz * N + tx] = 0;
    }
    this.scrubV = (this.scrubV || 0) + 1;
    this.callIn = false;
    this.rebuildNet();
    const hq = this.place('hq', x, z, 0, true, { std: this.std });
    const fs = this.hqFlagSpot(x, z, hq) || [x - 3, z]; this.place('seflag', fs[0], fs[1], 0, true);
    this.rebuildNet();
    hq.stock = { ...B.hq.store }; for (const g in hq.stock) hq.stock[g] = this.storeCap(hq, g);
    this.hqSet = true;
    return { ok: true };
  },
  // somewhere sensible to put the HQ when nobody is choosing (tests, the bot, the suggestion on the call-in screen): the
  // start whose 3 x 3 parcels have the most open ground, nearer the middle on a tie
  autoSpot() {
    const N = this.N, [w, d] = [B.hq.w, B.hq.d], m = N / 2; let best = null;
    const open = new Float32Array(G * G); for (let pz = 0; pz < G; pz++) for (let px = 0; px < G; px++) open[pz * G + px] = this.parcelInfo(px, pz).frac;
    for (let pz = 2; pz < G - 2; pz++) for (let px = 2; px < G - 2; px++) {
      let o = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) o += open[(pz + j) * G + px + i];
      const score = o / 9 - Math.hypot(px * P + P / 2 - m, pz * P + P / 2 - m) / N * 0.25;
      if (best && score <= best.score) continue;
      // the HQ goes as near the middle of that block as the ground allows
      const cx = px * P + P / 2 - w / 2 | 0, cz = pz * P + P / 2 - d / 2 | 0;
      for (let r = 0; r < P / 2; r++) { let hit = null; for (let dz = -r; dz <= r && !hit; dz++) for (let dx = -r; dx <= r && !hit; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === r && this.canFound(cx + dx, cz + dz).ok) hit = [cx + dx, cz + dz]; if (hit) { best = { score, at: hit }; break; } }
    }
    return best ? best.at : [m - w / 2 | 0, m - d / 2 | 0];
  },
  packOwn() { return [...this.own].join(''); },
  unpackOwn(s) { const o = new Uint8Array(G * G); if (!s) return o; for (let i = 0; i < s.length && i < o.length; i++) o[i] = +s[i]; return o; },
};
export { P as PARCEL, G as GRID };
