// The 0.15 utilities: power coverage (a building outside it goes dark until a substation reaches it), water and sewage
// for the bunks, an outbreak when they go without, the UTILITIES bar and view with coverage rings, and the building card.
import { open, newGame, shot, done } from './lib.mjs';
const { b, p, errs } = await open();
await newGame(p);
await p.keyboard.press('Space');
const run = n => p.evaluate(n => { const { sim, life } = window.__fob; for (let i = 0; i < n; i++) { sim.step(0.1); life.update(0.1); } }, n);
await run(450);
const r = await p.evaluate(() => {
  const { sim, view } = window.__fob, h = sim.b[0]; sim.supplies += 6000;
  const L = (ax, az, bx, bz) => sim.drawLine(sim.snapLine({ x: ax, z: az }, 'grid', 'dirt'), sim.snapLine({ x: bx, z: bz }, 'grid', 'dirt'), 'dirt');
  L(h.x + 1.5, h.z + 3.5, h.x + 1.5, h.z + 22.5); L(h.x - 12.5, h.z + 18.5, h.x + 14.5, h.z + 18.5);
  const put = (t, x, z, spec) => { const pl = sim.plotFor(t, x, z); return pl ? sim.place(t, pl.tx, pl.tz, pl.rot, false, spec) : null; };
  const far = put('barracks', h.x - 9, h.z + 20, { grow: true }), truth = put('pad', h.x + 11, h.z + 21);
  for (const o of sim.b) if (!o.done) { o.done = true; o.prog = 1; delete o.clr; }
  sim.recalc();
  const before = { dark: truth?.dark, dry: far?.dry, foul: far?.foul };
  const sub = (() => { for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const x = truth.x + dx, z = truth.z + truth.d + 1 + dz; if (sim.canPlace('substation', x, z, 0).ok) return sim.place('substation', x, z, 0); } })();
  const well = (() => { for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const x = far.x + far.w + 1 + dx, z = far.z - 2 + dz; if (sim.canPlace('well', x, z, 0).ok) return sim.place('well', x, z, 0); } })();
  for (const o of sim.b) if (!o.done) { o.done = true; o.prog = 1; delete o.clr; }
  sim.recalc();
  const after = { dark: truth?.dark, dry: far?.dry, foul: far?.foul };
  // a big thirsty base: lots of votes, bunks with no sewage: roll the dice until something breaks out
  for (let i = 0; i < 24; i++) sim.addTroop(60);
  sim.recalc(); let days = 0; while (!sim.stats.sick && days < 60) { sim.utilDay(); days++; }
  view.lookAt(h.x + 1, h.z + 16); view.zoomT = view.zoom = 16;
  return { before, after, sub: !!sub, well: !!well, sick: sim.stats.sick || 0, days, util: sim.util.water.made, mor: sim.mor };
});
await p.waitForTimeout(600);
await p.click('[data-g="power"]'); await p.waitForTimeout(500); await shot(p, 'utils-1-bar');
const cards = await p.$$eval('.bi[data-b]', l => l.map(x => x.dataset.b));
const head = await p.textContent('.bi-head');
await p.click('[data-iv="util"]'); await p.waitForTimeout(700); await shot(p, 'utils-2-view');
const rings = await p.evaluate(() => window.__fob.view.coverG?.children.length || 0);
const legend = await p.textContent('#iv-legend');
await p.click('[data-iv="util"]');
const ok = r.before.dark === true && r.after.dark === false && r.before.dry === true && r.after.dry === false && r.sub && r.well && r.sick > 0
  && ['substation', 'well', 'tower', 'rowpu', 'lagoon', 'treatment', 'fuelfarm'].every(k => cards.includes(k)) && /WATER/.test(head) && rings > 4 && /Water/.test(legend);
const out = { ...r, mor: undefined, cards: cards.length, rings, head: head.slice(0, 120) };
if (!ok) errs.push('checks failed: ' + JSON.stringify(out));
await done(b, errs, JSON.stringify(out) + '\n');
