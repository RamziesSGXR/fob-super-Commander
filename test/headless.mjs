// Runs a base without a browser and prints how it does week by week.
//   node test/headless.mjs [weeks] [bot|idle] [seed]
// "bot" builds and plays like a sensible commander; "idle" builds nothing and shows the soft decline.
import { Sim } from '../js/sim.js';
import { B, C } from '../js/config.js';

const weeks = +(process.argv[2] || 12), mode = process.argv[3] || 'bot', seed = +(process.argv[4] || 7);
const s = new Sim({ seed });
const N = s.N, m = N / 2;

function spot(type, near = [m, m], deposit = false) {
  let best = null;
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) for (const rot of [0, 1]) {
    if (!s.fits(type, x, z, rot).ok) continue;
    if (!deposit) {   // leave a walking gap round every building
      let crowd = false;
      for (const b of s.b) if (x < b.x + b.w + 1 && x + B[type].w + 1 > b.x && z < b.z + b.d + 1 && z + B[type].d + 1 > b.z) crowd = true;
      if (crowd) continue;
    }
    const d = Math.hypot(x - near[0], z - near[1]);
    if (!best || d < best.d) best = { x, z, rot, d };
  }
  return best;
}
function build(type, near, deposit) {
  if (s.supplies < B[type].cost || s.locked(type)) return false;
  const p = spot(type, near, deposit); if (!p) return false;
  return !!s.place(type, p.x, p.z, p.rot);
}
const plan = ['pump', 'depot', 'barracks', 'mess', 'pump', 'plant', 'solar', 'parade', 'truth', 'banner', 'hab', 'vend', 'armory', 'speaker',
  'memorial', 'potty', 'potty', 'shed', 'banner', 'gen', 'statue', 'pool', 'billboard', 'hab', 'dome', 'solar', 'flag', 'banner', 'depot', 'speaker'];
let step = 0;
function bot() {
  const want = plan[step];
  if (want) {
    const far = want === 'plant' ? [m + 10, m + 8] : [m, m];
    if (s.locked(want) && s.locked(want).some(t => !s.count(t))) step++;
    else if (s.locked(want)) { /* wait for it */ }
    else if (build(want, far, want === 'pump')) step++;
  } else if (s.power.ratio < 1) build('solar');
  else if (s.troops.length > s.beds - 2) build('hab', [m - 8, m]);
  if (s.patrols.length < 2) for (const o of s.offers) if (s.chance(o) >= 0.6 && s.idle + 1 >= o.size) { s.send(o.id); break; }
  for (const c of s.contracts) s.deliver(c.id);
  for (const b of s.b) if (b.cond < 55 && s.supplies > 500) s.repair(b.id);
}

const pad = (v, n = 6) => String(v).padStart(n);
console.log(`seed ${seed}, ${mode}, ${weeks} weeks`);
console.log('week rank  supply troops morale prop  def  pro  tru  total | best rival | builds e710 shells  won/lost fallen');
let lastWeek = 1;
for (let i = 0; i < weeks * C.WEEK * 10; i++) {
  s.step(0.1);
  if (mode === 'bot' && i % 20 === 0) bot();
  s.drain();
  if (s.week !== lastWeek) {
    lastWeek = s.week;
    const best = s.rivals.reduce((a, r) => s.total(r.stand) > s.total(a.stand) ? r : a);
    console.log(`${pad(s.week - 1, 4)} ${pad(s.rank + 1, 4)} ${pad(Math.round(s.supplies), 7)} ${pad(s.troops.length, 6)} ${pad(Math.round(s.morale), 6)} ${pad(s.prop, 5)}`
      + ` ${pad(Math.round(s.stand.def), 4)} ${pad(Math.round(s.stand.pro), 4)} ${pad(Math.round(s.stand.tru), 4)} ${pad(s.total(s.stand), 6)} | ${pad(s.total(best.stand), 10)} |`
      + ` ${pad(s.b.length, 6)} ${pad(Math.round(s.e710), 4)} ${pad(Math.round(s.shells), 6)} ${pad(s.stats.patrolsWon + '/' + s.stats.patrolsLost, 9)} ${pad(s.fallen.length, 6)}  cond ${Math.round(s.avgCond)} pw ${s.power.made}/${s.power.used}`);
  }
}
const j = JSON.stringify(s.save());
const s2 = new Sim({ state: JSON.parse(j) });
console.log(`save ${(j.length / 1024).toFixed(1)} KB, reload ok: ${s2.b.length === s.b.length && s2.troops.length === s.troops.length}`);
console.log('morale parts', s.mor);
console.log('last log:'); for (const l of s.log.slice(-6)) console.log('  [' + l.ch + '] ' + l.text);
