// Runs a base without a browser and prints how it does week by week.
//   node test/headless.mjs [weeks] [bot|idle] [seed]
// "bot" builds and plays like a sensible commander; "idle" builds nothing and shows the soft decline.
import { Sim } from '../js/sim.js';
import { B, C, GKEYS } from '../js/config.js';

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
  const p = spot(type, near); if (!p) return false;
  return !!s.place(type, p.x, p.z, p.rot);
}
const plan = ['depot', 'mess', 'barracks', 'range', 'course', 'potty', 'motorpool', 'fueldepot', 'gen', 'patrol', 'parade', 'truth', 'banner', 'hab', 'vend',
  'memorial', 'speaker', 'hab', 'statue', 'lecture', 'pool', 'billboard', 'potty', 'barracks', 'dome', 'banner', 'flag', 'depot', 'mess'];
let step = 0;
function bot() {
  const want = plan[step];
  if (want) {
    if (s.locked(want) && s.locked(want).some(t => !s.count(t))) step++;
    else if (!s.locked(want) && build(want, want === 'barracks' || want === 'hab' ? [m - 10, m] : [m + 2, m + 2])) step++;
  } else if (s.power.ratio < 1) build('solar');
  else if (s.troops.length > s.beds - 3) build('hab', [m - 10, m]);
  if (s.power.ratio < 1 && s.supplies > 300) build('solar');
  if (s.patrols.length < 3) for (const o of s.offers) if (s.chance(o) >= 0.65) { s.send(o.id); break; }
  for (const b of s.b) if (b.cond < 55 && s.supplies > 500) s.repair(b.id);
}

const pad = (v, n = 6) => String(v).padStart(n);
console.log(`seed ${seed}, ${mode}, ${weeks} weeks`);
console.log('week rank  supply votes ready morale  def  pro  tru  total | rival | blds shipped trained  hunger short  rat/fuel/ammo  pw');
let lastWeek = 1;
for (let i = 0; i < weeks * C.WEEK * 10; i++) {
  s.step(0.1);
  if (mode === 'bot' && i % 20 === 0) bot();
  s.drain();
  if (s.week !== lastWeek) {
    lastWeek = s.week;
    const best = s.rivals.reduce((a, r) => s.total(r.stand) > s.total(a.stand) ? r : a);
    console.log(`${pad(s.week - 1, 4)} ${pad(s.rank + 1, 4)} ${pad(Math.round(s.supplies), 7)} ${pad(s.troops.length, 5)} ${pad(s.troops.filter(t => t.train >= 100).length, 5)} ${pad(Math.round(s.morale), 6)}`
      + ` ${pad(Math.round(s.stand.def), 4)} ${pad(Math.round(s.stand.pro), 4)} ${pad(Math.round(s.stand.tru), 4)} ${pad(s.total(s.stand), 6)} | ${pad(s.total(best.stand), 5)} |`
      + ` ${pad(s.b.length, 4)} ${pad(s.stats.deployed, 7)} ${pad(s.stats.trained, 7)} ${pad(s.hunger.toFixed(2), 7)} ${pad(s.audit ? s.audit.lines : '-', 5)}  ${GKEYS.map(g => Math.round(s.amount(g))).join('/').padStart(13)} ${s.power.made}/${s.power.used}`);
  }
}
const j = JSON.stringify(s.save());
const s2 = new Sim({ state: JSON.parse(j) });
console.log(`save ${(j.length / 1024).toFixed(1)} KB, reload ok: ${s2.b.length === s.b.length && s2.troops.length === s.troops.length && s2.roads.join('') === s.roads.join('')}`);
console.log('vehicles', s.veh.map(v => v.kind).join(','), '| morale parts', JSON.stringify(s.mor));
console.log('last log:'); for (const l of s.log.slice(-8)) console.log('  [' + l.ch + '] ' + l.text);
