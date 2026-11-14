// Everything the player is asked to do or read: every task-board button, every window and tab, and every building's
// card, scanned for text that didn't fill in (undefined, NaN) and buttons that do nothing.
import { open, newGame, foundation, shot, done } from './lib.mjs';
const { b, p, errs } = await open();
const T0 = Date.now(), lap = m => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
await newGame(p); await foundation(p, 3); await p.keyboard.press('Space'); lap('base up');
const BAD = /undefined|NaN|\[object|Infinity/;
const found = [];
const scan = async (where, sel) => { const t = await p.evaluate(sel => document.querySelector(sel)?.innerText || '', sel); const m = t.match(BAD); if (m) found.push(`${where}: …${t.slice(Math.max(0, t.indexOf(m[0]) - 60), t.indexOf(m[0]) + 20).replace(/\n/g, ' ')}…`); return t; };
// the task board: press the first button of each item and see the board change
let pressed = 0, stuck = [];
for (let round = 0; round < 12; round++) {
  const items = await p.$$eval('#tb-body .tb-i', l => l.map((e, i) => ({ i, t: e.innerText.split('\n')[0], btn: !!e.querySelector('button') })));
  const it = items.find(x => x.btn && !stuck.includes(x.t)); if (!it) break;
  await scan('task board', '#tb-body');
  const before = await p.$$eval('#tb-body .tb-i', l => l.map(e => e.innerText).join('|'));
  await p.evaluate(i => document.querySelectorAll('#tb-body .tb-i')[i].querySelector('button').click(), it.i); await p.waitForTimeout(250);
  const after = await p.$$eval('#tb-body .tb-i', l => l.map(e => e.innerText).join('|'));
  const opened = await p.evaluate(() => !document.getElementById('mins').classList.contains('hidden'));
  if (before === after && !opened) stuck.push(it.t); else pressed++;
  await p.evaluate(() => document.getElementById('mins').classList.add('hidden'));
}
lap('task board done');
// every window and tab
for (const t of ['led', 'def', 'pro', 'tru', 'sci', 'st']) { await p.evaluate(t => window.__fob.openMins(t), t); await p.waitForTimeout(250); await scan('window ' + t, '#mins'); }
for (const e of ['budget', 'market', 'commit', 'loans', 'prod']) { await p.evaluate(e => { window.__fob.setEco(e); window.__fob.openMins('eco'); }, e); await p.waitForTimeout(250); await scan('economy ' + e, '#mins'); }
await shot(p, 'popups-window');
await p.evaluate(() => document.getElementById('mins').classList.add('hidden'));
lap('windows done');
// every building's card, after giving the base one of everything that can stand on open ground
await p.evaluate(() => {
  const { sim: s } = window.__fob; s.supplies += 1e5; s.credits += 1e4; s.stage = 3; s.rebuildNet(); s.foundedF = true;
  const C = window.__fob.sim.constructor; const types = ['substation', 'well', 'tower', 'lagoon', 'treatment', 'fuelfarm', 'yard', 'lab', 'comms', 'patrol', 'medbay', 'armory', 'vbay', 'truth', 'lecture', 'course', 'parade', 'gen', 'solar', 'statue', 'memorial', 'club', 'shelter', 'hdbarracks', 'command'];
  for (const t of types) { const tiles = s.plotTiles(); for (let i = 0; i < 120; i++) { const [x, z] = tiles[(i * 53) % tiles.length]; const pl = s.plotFor(t, x, z) || { tx: x, tz: z, rot: 0 }; const b = s.place(t, pl.tx, pl.tz, pl.rot, true, { grow: true }); if (b) break; } }
  s.recalc();
});
const ids = await p.evaluate(() => window.__fob.sim.b.map(b => [b.id, b.type]));
for (const [id, type] of ids) { await p.evaluate(id => window.__fob.select(id), id); await p.waitForTimeout(60); await scan('card ' + type, '#selp'); }
await p.evaluate(() => window.__fob.select(null));
lap('cards done');
// info views and their legends
for (const v of await p.$$eval('[data-iv]', l => l.map(x => x.dataset.iv))) { await p.click(`[data-iv="${v}"]`); await p.waitForTimeout(200); await scan('view ' + v, '#iv-legend'); await p.click(`[data-iv="${v}"]`).catch(() => {}); }
if (found.length) errs.push('bad text: ' + found.slice(0, 10).join(' || '));
if (stuck.length) errs.push('buttons that did nothing: ' + stuck.join(', '));
await done(b, errs, `task board buttons pressed ${pressed}, cards ${ids.length}, bad text ${found.length}\n`);
