// Runs a base without a browser and prints how it does week by week.
//   node test/headless.mjs [weeks] [bot|idle] [seed]
// "bot" builds and plays like a sensible commander; "idle" builds nothing and shows the soft decline.
import { Sim, LOOSE } from '../js/sim.js';
import { B, C, GKEYS, TECH } from '../js/config.js';

const weeks = +(process.argv[2] || 12), mode = process.argv[3] || 'bot', seed = +(process.argv[4] || 7);
const s = new Sim({ seed });
const N = s.N, m = N / 2;

function spot(type, near = [m, m]) {
  let best = null;
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) for (const rot of [0, 1]) {
    if (!s.fits(type, x, z, rot).ok) continue;
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
const plan = ['depot', 'mess', 'barracks', 'range', 'course', 'potty', 'motorpool', 'fueldepot', 'gen', 'patrol', 'lookout', 'medbay', 'comms', 'lookout', 'lab', 'parade', 'truth', 'pad', 'banner', 'hab', 'vend', 'vbay',
  'memorial', 'speaker', 'hab', 'statue', 'lecture', 'pool', 'billboard', 'potty', 'barracks', 'dome', 'banner', 'flag', 'depot', 'mess'];
let step = 0, roadN = 0;
function bot() {
  const want = plan[step];
  if (want) {
    const d = B[want], waitable = (d.needs || []).every(t => s.count(t)) && (!d.tech || s.hasTech(d.tech) || s.tech.cur === d.tech || s.techState(d.tech) === 'open');
    if (s.locked(want) && !waitable) step++;
    else if (!s.locked(want) && build(want, want === 'lookout' ? [s.count('lookout') ? 14 : 50, 50] : want === 'barracks' || want === 'hab' ? [m - 10, m] : [m + 2, m + 2])) step++;
  } else if (s.power.ratio < 1) build('solar');
  else if (s.troops.length > s.beds - 3) build('hab', [m - 10, m]);
  if (s.power.ratio < 1 && s.supplies > 300) build('solar');
  if (!s.tech.cur) for (const k of ['drill', 'radio', 'shelving', 'frv', 'cargo', 'highrise', 'trucks', 'broadcast', 'solar', 'asphalt', 'command', 'tank']) if (s.supplies > TECH[k].cost + 300 && s.research(k)) break;
  if (s.patrols.length < 3) for (const o of s.offers) { const kinds = ['frv', 'tank'].filter(k => s.armourFree(k)); if (s.chance({ ...o, veh: kinds }) >= 0.65) { s.send(o.id, kinds); break; } }
  for (const b of s.b) if (b.cond < 55 && s.supplies > 500) s.repair(b.id);
}

const pad = (v, n = 6) => String(v).padStart(n);
console.log(`seed ${seed}, ${mode}, ${weeks} weeks`);
console.log('week rank  supply votes ready morale  def  pro  tru  total | rival | blds shipped trained  hunger short  rat/fuel/ammo  pw');
let lastWeek = 1;
let slow = 0, tStep = 0;
for (let i = 0; i < weeks * C.WEEK * 10; i++) {
  const t0 = performance.now(); s.step(0.1); const ms = performance.now() - t0; tStep += ms; if (ms > slow) slow = ms;
  if (mode === 'bot' && i % 20 === 0) bot();
  s.drain();
  if (s.week !== lastWeek) {
    lastWeek = s.week; process.stdout.write(`[step avg ${(tStep / (C.WEEK * 10)).toFixed(2)}ms max ${slow.toFixed(1)}ms] `); tStep = 0; slow = 0;
    const best = s.rivals.reduce((a, r) => s.total(r.stand) > s.total(a.stand) ? r : a);
    console.log(`${pad(s.week - 1, 4)} ${pad(s.rank + 1, 4)} ${pad(Math.round(s.supplies), 7)} ${pad(s.troops.length, 5)} ${pad(s.troops.filter(t => t.train >= 100).length, 5)} ${pad(Math.round(s.morale), 6)}`
      + ` ${pad(Math.round(s.stand.def), 4)} ${pad(Math.round(s.stand.pro), 4)} ${pad(Math.round(s.stand.tru), 4)} ${pad(s.total(s.stand), 6)} | ${pad(s.total(best.stand), 5)} |`
      + ` ${pad(s.b.length, 4)} ${pad(s.stats.deployed, 7)} ${pad(s.stats.trained, 7)} ${pad(s.hunger.toFixed(2), 7)} ${pad(s.audit ? s.audit.lines : '-', 5)}  ${GKEYS.map(g => Math.round(s.amount(g))).join('/').padStart(13)} ${s.power.made}/${s.power.used}`);
  }
}
const j = JSON.stringify(s.save());
if (process.env.SAVEOUT) (await import('node:fs')).writeFileSync(process.env.SAVEOUT, j);
const s2 = new Sim({ state: JSON.parse(j) });
console.log(`save ${(j.length / 1024).toFixed(1)} KB, reload ok: ${s2.b.length === s.b.length && s2.troops.length === s.troops.length && s2.roads.join('') === s.roads.join('')}`);
console.log('fort', JSON.stringify(s.fortify()), 'guards', s.guards, 'lookouts', s.count('lookout'));
console.log('tech', s.tech.done.join(','), '| pads', s.count('pad'), '/', s.padCap());
console.log('vehicles', s.veh.map(v => v.kind).join(','), '| morale parts', JSON.stringify(s.mor));
console.log('last log:'); for (const l of s.log.slice(-8)) console.log('  [' + l.ch + '] ' + l.text);
