// Runs a base without a browser and prints how it does week by week.
//   node test/headless.mjs [weeks] [bot|idle] [seed]
// "bot" builds and plays like a sensible commander; "idle" builds nothing; "lapse" plays the first half, then walks away.
import { Sim, LOOSE } from '../js/sim.js';
import { REQUESTS, trueGrade } from '../js/desk.js';
import { B, C, GKEYS, TECH, GROWS } from '../js/config.js';

const weeks = +(process.argv[2] || 12), mode = process.argv[3] || 'bot', seed = +(process.argv[4] || 7);
// the bot always builds round the middle of the section: the Command Post goes down there, and the ground for 60 cells
// round it is levelled first (as a player would with LANDSCAPE) so its fixed plan fits whatever the site is
const m = Math.floor(C.N / 2), s = new Sim({ seed, at: [m - 3, m - 3] });
{ const M = s.N + 1, R = 60, k0 = (m - R) * M + m - R, base = Math.max(0.5, s.hgt[k0]); for (let z = m - R; z <= m + R; z++) for (let x = m - R; x <= m + R; x++) s.hgt[z * M + x] = base; s.reclassify(m - R - 1, m - R - 1, m + R + 1, m + R + 1); s.rebuildNet(); }
if (process.env.COMMIT) { const [d, p, t] = process.env.COMMIT.split(',').map(Number); s.commit = { def: d, pro: p, tru: t }; }
const N = s.N;

function spot(type, near = [m, m]) {
  let best = null; const [x0, z0, x1, z1] = s.ownBounds();
  for (let z = Math.max(1, z0); z < Math.min(N - 1, z1); z++) for (let x = Math.max(1, x0); x < Math.min(N - 1, x1); x++) for (const rot of [0, 1]) {
    if (!s.canPlace(type, x, z, rot).ok) continue;
    let crowd = false;   // leave a walking gap round every building
    const [w, d] = rot % 2 ? [B[type].d, B[type].w] : [B[type].w, B[type].d];
    for (const b of s.b) if (x < b.x + b.w + 1 && x + w + 1 > b.x && z < b.z + b.d + 1 && z + d + 1 > b.z) crowd = true;
    if (crowd) continue;
    const dd = Math.hypot(x - near[0], z - near[1]);
    if (!best || dd < best.d) best = { x, z, rot, d: dd };
  }
  return best;
}
function build(type, near) {
  if (s.supplies < B[type].cost + 150 || s.locked(type)) return false;
  let p = null;
  if (LOOSE.has(type)) p = spot(type, near);
  else {
    p = s.plotFor(type, near[0], near[1]);
    if (!p) for (const [x, z] of s.plotTiles().sort((a, b) => Math.hypot(a[0] - near[0], a[1] - near[1]) - Math.hypot(b[0] - near[0], b[1] - near[1])).filter((_, i) => i % 6 === 0).slice(0, 40)) { p = s.plotFor(type, x, z); if (p) break; }
    if (p) p = { x: p.tx, z: p.tz, rot: p.rot };
  }
  if (!p) {   // no plot free near there: run a dirt road out from the nearest road and try again
    roadN = (roadN || 0) + 1; const base = s.net.nodes[roadN % s.net.nodes.length], a = s.snapLine({ x: base.x, z: base.z }, 'grid', 'dirt'), dir = [[1, 0], [0, 1], [-1, 0], [0, -1]][roadN % 4];
    const e = s.snapLine({ x: a.x + dir[0] * 8, z: a.z + dir[1] * 8 }, 'grid', 'dirt', a);
    s.drawLine(a, e, 'dirt'); return false;
  }
  return !!s.place(type, p.x, p.z, p.rot);
}
const plan = ['depot', 'mess', 'barracks', 'range', 'course', 'potty', 'yard', 'motorpool', 'fueldepot', 'gen', 'well', 'lagoon', 'patrol', 'lookout', 'medbay', 'comms', 'lookout', 'lab', 'parade', 'truth', 'pad', 'banner', 'hab', 'vend', 'vbay',
  'memorial', 'speaker', 'hab', 'statue', 'lecture', 'pool', 'billboard', 'potty', 'barracks', 'dome', 'banner', 'flag', 'depot', 'mess', 'fuelfarm', 'tower', 'turret', 'flood', 'plaque', 'mart', 'eob', 'vault', 'brig', 'casino', 'cryo', 'halls', 'warroom'];
let step = 0, roadN = 0;
let founded = false, wallAt = 0, start0 = null;
// the bot's perimeter: a square round the middle, wider each charter (the land it starts with is far bigger, 8 m cells)
const PERIM = [36, 46, 58, 80], perim = () => { const h = PERIM[s.stage] / 2; return [Math.floor(m - h), Math.floor(m - h), Math.ceil(m + h), Math.ceil(m + h)]; };
function rewall() {   // take the old wall down and put a new one round the bigger square, with the gate road through the south side
  wallAt = s.stage;
  for (const g of s.net.segs.filter(g => g.k === 'wall')) { const a = s.net.nodes.find(n => n.id === g.a), b = s.net.nodes.find(n => n.id === g.b); if (a && b) s.removeLine((a.x + b.x) / 2, (a.z + b.z) / 2); }
  const [x0, z0, x1, z1] = perim(), L = (ax, az, bx, bz, k) => s.drawLine(s.snapLine({ x: ax, z: az }, 'free', k), s.snapLine({ x: bx, z: bz }, 'free', k), k);
  const lo = [x0 + 1.5, z0 + 1.5], hi = [x1 - 1.5, z1 - 1.5];
  L(lo[0], lo[1], hi[0], lo[1], 'wall'); L(hi[0], lo[1], hi[0], hi[1], 'wall'); L(hi[0], hi[1], lo[0], hi[1], 'wall'); L(lo[0], hi[1], lo[0], lo[1], 'wall');
  L(m + 1, z1 - 4, m + 1, z1 + 1, 'paved');
}
function found() {   // the bot's opening: a paved spine and cross streets, a pad, then a wall round it all with a gate
  founded = true; start0 = s.parcelAt(s.ownBounds()[0], s.ownBounds()[1]);
  const L = (ax, az, bx, bz, k) => s.drawLine(s.snapLine({ x: ax, z: az }, 'free', k), s.snapLine({ x: bx, z: bz }, 'free', k), k);
  const [b0, , b1] = perim();
  L(m + 1, b1 - 2, m + 1, m - 12, 'paved'); L(m - 12, m + 0.5, m + 13, m + 0.5, 'dirt'); L(m - 12, m + 8.5, m + 13, m + 8.5, 'dirt'); L(m - 12, m - 7.5, m + 13, m - 7.5, 'dirt');
  const lo = b0 + 1.5, hi = b1 - 1.5;
  L(lo, lo, hi, lo, 'wall'); L(hi, lo, hi, hi, 'wall'); L(hi, hi, lo, hi, 'wall'); L(lo, hi, lo, lo, 'wall');
  L(m + 1, b1 - 2, m + 1, b1 + 1, 'paved');
  build('pad', [m + 5, m - 3]);
  // zones: bunks, mess and latrines to the west, storage by the pad, shops to the south-west; the rest is placed by hand
  s.paintZone(m - 12, m - 7, m - 1, m + 8, 'life'); s.paintZone(m + 2, m - 7, m + 12, m - 1, 'logi'); s.paintZone(m - 12, m + 9, m - 1, m + 12, 'comm');
  s.setChain('cola');
}
function bot() {
  if (!founded) found();
  while (GROWS.has(plan[step])) step++;   // everyday buildings grow in the zones by themselves
  const want = plan[step], housing = s.dem?.bunks > 6 && /supplies/.test(s.growNote?.life || '');   // let the bunks grow first
  if (want && !housing) {
    const d = B[want], waitable = (d.needs || []).every(t => s.count(t) || GROWS.has(t)) && (!d.tech || s.hasTech(d.tech) || s.tech.cur === d.tech || s.techState(d.tech) === 'open');
    if (s.locked(want) && !waitable) step++;
    else if (!s.locked(want) && build(want, ['lookout', 'turret', 'flood'].includes(want) ? (k => [k ? s.box()[0] + 3 : s.box()[1] - 3, s.box()[1] - 3])(s.count(want) % 2) : want === 'barracks' || want === 'hab' ? [m - 10, m] : [m + 2, m + 2])) step++;
  } else if (s.power.ratio < 1) build('solar');
  else if (s.troops.length > s.beds - 3 && s.week > 3 && !s.b.some(b => b.grown === 'life' && !b.done)) { const top = Math.max(s.ownBounds()[1] + 4, m - 10 - 3 * s.week); s.paintZone(m - 12, top, m - 1, m - 8, 'life'); const L = (ax, az, bx, bz) => s.drawLine(s.snapLine({ x: ax, z: az }, 'grid', 'dirt'), s.snapLine({ x: bx, z: bz }, 'grid', 'dirt'), 'dirt'); if (!s.road(m - 7, top + 1)) L(m - 6.5, m - 7.5, m - 6.5, top + 0.5); }   // more room for bunks, with a street up the middle
  if (s.power.ratio < 1 && s.supplies > 300) build('solar');
  if (s.nextStage() && s.stageCheck().every(c => c.ok)) s.promote();
  for (const c of s.calls) if (!c.acc && s.have(c.g) > c.n * 1.5) s.answer(c.id, true);
  for (const r of [...s.desk]) s.decide(r.id, 0) || s.decide(r.id, REQUESTS[r.k].opts.length - 1);
  for (const t of s.toReview().slice(0, 2)) s.gradeTroop(t.id, trueGrade(t));
  // saving for the next charter: once the votes and standing are there, keep credits and sell surplus supplies for them
  const ns = s.nextStage(), saving = ns && s.stageCheck().filter(c => !c.ok).every(c => /credits|supplies for the charter/.test(c.text)), short = ns && s.stageCheck().some(c => !c.ok && /credits/.test(c.text));
  // land: each charter, the bot grows its ground to a bigger rectangle (north and west first, where the bunks go), and
  // once the rectangle is all held, moves its wall out to the new edge
  if (!saving) {
    // the starting 3 x 3 parcels (1.8 km) hold the whole base: no land to buy, just a wider wall each charter
    if (wallAt !== s.stage) rewall();
  }
  if ((!saving && s.credits > 700 && s.supplies < 1500) || (saving && ns && s.credits > ns.cr + 400 && s.supplies < (ns.sup || 0) + 300)) s.buySupplies();
  while ((s.credits < 150 || (saving && short)) && s.supplies > 1200 + (ns?.sup || 0) && s.sellSupplies());
  if (!saving && s.credits > 900 && s.loans[0]) s.repay(0, s.credits - 600);
  if (!saving && !s.tech.cur) for (const k of ['drill', 'fortworks', 'radio', 'shelving', 'civic', 'archive', 'frv', 'cargo', 'highrise', 'warroom', 'trucks', 'broadcast', 'solar', 'asphalt', 'command', 'tank']) if (s.credits >= TECH[k].cost && s.research(k)) break;
  if (s.patrols.length < 3) for (const o of s.offers) { const kinds = ['frv', 'tank'].filter(k => s.armourFree(k)); if (s.chance({ ...o, veh: kinds }) >= 0.65) { s.send(o.id, kinds); break; } }
  for (const b of s.b) if (b.cond < 55 && s.supplies > 500) s.repair(b.id);
  // utilities: a substation by anything dark, a well by bunks without water, a lagoon (downwind, a little off) for sewage
  if (s.util && s.week >= 1 && !s.b.some(b => !b.done && ['substation', 'well', 'lagoon', 'tower'].includes(b.type))) {
    const dark = s.b.find(b => b.done && b.dark), dry = s.b.find(b => b.done && b.dry), foul = s.b.find(b => b.done && b.foul);
    if (dark) build('substation', [dark.x + 1, dark.z + 1]);
    else if (dry || s.util.water.ratio < 0.9) { const h = dry || s.b.find(b => B[b.type].beds && b.type !== 'hq') || s.b[0]; build('well', [h.x - 2, h.z - 2]); }
    else if (foul || s.util.sewer.ratio < 0.9) { const h = foul || s.b.find(b => B[b.type].beds && b.type !== 'hq') || s.b[0]; build('lagoon', [h.x - 7, h.z + 3]); }
  }
  // construction standards: tents to found the base, prefabs once it pays, permanent at Fort; housing and food upgraded first
  if (s.founded() && s.week >= 2) s.setStd(s.stage >= 2 ? 2 : 1);
  if (!s.b.some(b => b.upg)) {
    const order = ['barracks', 'mess', 'hq', 'range', 'depot', 'medbay', 'course', 'patrol'], keep = s.stage >= 2 ? 1800 : 900;
    const next = s.b.filter(b => s.upgradeInfo(b).ok).sort((a, b) => ((order.indexOf(a.type) + 1) || 99) - ((order.indexOf(b.type) + 1) || 99) || s.stdOf(a) - s.stdOf(b))[0];
    if (next && s.supplies > keep + s.upgradeInfo(next).cost) s.upgrade(next.id);
  }
}

const pad = (v, n = 6) => String(v).padStart(n);
console.log(`seed ${seed}, ${mode}, ${weeks} weeks`);
console.log('week rank  supply votes ready morale  def  pro  tru  total | rival | blds shipped trained  hunger short  rat/fuel/ammo  pw');
let lastWeek = 1;
let slow = 0, tStep = 0;
for (let i = 0; i < weeks * C.WEEK * 10; i++) {
  const t0 = performance.now(); s.step(0.1); const ms = performance.now() - t0; tStep += ms; if (ms > slow) slow = ms;
  if ((mode === 'bot' || (mode === 'lapse' && s.week <= weeks / 2)) && i % 20 === 0) bot();
  s.drain();
  if (s.week !== lastWeek) {
    lastWeek = s.week; process.stdout.write(`[step avg ${(tStep / (C.WEEK * 10)).toFixed(2)}ms max ${slow.toFixed(1)}ms] `); tStep = 0; slow = 0;
    const best = s.rivals.reduce((a, r) => s.total(r.stand) > s.total(a.stand) ? r : a);
    console.log(`${pad(s.week - 1, 4)} ${pad(s.rank + 1, 4)} ${pad(Math.round(s.supplies), 7)} ${pad(s.troops.length, 5)} ${pad(s.troops.filter(t => t.train >= 100).length, 5)} ${pad(Math.round(s.morale), 6)}`
      + ` ${pad(Math.round(s.stand.def), 4)} ${pad(Math.round(s.stand.pro), 4)} ${pad(Math.round(s.stand.tru), 4)} ${pad(s.total(s.stand), 6)} | ${pad(s.total(best.stand), 5)} |`
      + ` ${pad(s.b.length, 4)} ${pad(s.stats.deployed, 7)} ${pad(s.stats.trained, 7)} ${pad(s.hunger.toFixed(2), 7)} ${pad(s.audit ? s.audit.lines : '-', 5)}  ${GKEYS.map(g => Math.round(s.amount(g))).join('/').padStart(13)} ${s.power.made}/${s.power.used}` + ` st${s.stage} cr${Math.round(s.credits)} p${s.price("sup").toFixed(2)}`);
  }
}
if (process.env.DUMP) { const N = s.N, z = [0, 0, 0, 0], zin = [0, 0, 0, 0]; for (let i = 0; i < N * N; i++) if (s.zone[i]) { z[s.zone[i]]++; if (s.inMask[i]) zin[s.zone[i]]++; } console.log('held', s.held(), 'allow', s.allowance(), 'zones', z.join('/'), 'inside', zin.join('/'), 'bounds', s.ownBounds().join(','), 'hq', s.b[0].x, s.b[0].z); }
if (process.env.DUMP) console.log("stage", s.stage, JSON.stringify(s.stageCheck?.()), "credits", Math.round(s.credits), "heads", s.heads(), "debt", Math.round(s.debt()));
if (process.env.DUMP) console.log(JSON.stringify(s.util), 'risk', s.risk, 'sick', s.stats.sick, 'piped', Math.round(s.stats.piped || 0));
if (process.env.DUMP) console.log(s.b.map(b => b.type + (b.done ? "" : "*") + (b.grown ? "@" + b.grown : "")).join(" "), JSON.stringify(s.growNote), JSON.stringify(s.dem));
const j = JSON.stringify(s.save());
if (process.env.SAVEOUT) (await import('node:fs')).writeFileSync(process.env.SAVEOUT, j);
const s2 = new Sim({ state: JSON.parse(j) });
console.log(`save ${(j.length / 1024).toFixed(1)} KB, reload ok: ${s2.b.length === s.b.length && s2.troops.length === s.troops.length && s2.roads.join('') === s.roads.join('')}`);
console.log('fort', JSON.stringify(s.fortify()), 'guards', s.guards, 'lookouts', s.count('lookout'));
console.log('credits', Math.round(s.credits), 'flow last', JSON.stringify(s.flow.last));
console.log('tech', s.tech.done.join(','), '| pads', s.count('pad'), '/', s.padCap());
console.log('vehicles', s.veh.map(v => v.kind).join(','), '| morale parts', JSON.stringify(s.mor));
console.log('plan step', step, plan[step], 'locked', JSON.stringify(s.locked(plan[step] || 'hq')), 'sup', Math.round(s.supplies), 'segs', s.net.segs.length, 'open', s.open, 'area', s.area, 'plots', s.plotTiles().length);
console.log('last log:'); for (const l of s.log.slice(-8)) console.log('  [' + l.ch + '] ' + l.text);
