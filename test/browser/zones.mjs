// The 0.14 zones: paint Life Support and Logistics by dragging on the map, watch bunks, a mess and a depot grow there,
// the franchise picker, the demand bars, the Zoning view, and that everyday buildings can't be hand-placed.
import { open, newGame, shot, done } from './lib.mjs';
const { b, p, errs } = await open();
await newGame(p);
await p.keyboard.press('Space');
const run = n => p.evaluate(n => { const { sim, life } = window.__fob; for (let i = 0; i < n; i++) { sim.step(0.1); life.update(0.1); } }, n);
await run(450);   // past the landing sweep
const hq = await p.evaluate(() => { const { sim, view } = window.__fob, h = sim.b[0]; sim.supplies += 2000;
  const L = (ax, az, bx, bz) => sim.drawLine(sim.snapLine({ x: ax, z: az }, 'grid', 'dirt'), sim.snapLine({ x: bx, z: bz }, 'grid', 'dirt'), 'dirt');
  L(h.x + 1.5, h.z + 3.5, h.x + 1.5, h.z + 18.5); L(h.x - 9.5, h.z + 9.5, h.x + 12.5, h.z + 9.5);
  view.lookAt(h.x + 1, h.z + 9); view.zoomT = view.zoom = 12; return [h.x, h.z]; });
await p.waitForTimeout(800);
await p.click('[data-g="zones"]'); await p.waitForTimeout(400);
const scr = (x, z) => p.evaluate(([x, z]) => window.__fob.view.toScreen(x, z, 0), [x, z]);
const drag = async (k, a, c) => { await p.click(`[data-b="zone:${k}"]`); const A = await scr(...a), C = await scr(...c); await p.mouse.move(A[0], A[1]); await p.mouse.down(); await p.mouse.move((A[0] + C[0]) / 2, (A[1] + C[1]) / 2); await p.mouse.move(C[0], C[1]); await p.mouse.up(); await p.waitForTimeout(300); };
await drag('life', [hq[0] - 8.5, hq[1] + 4.5], [hq[0] + 0.5, hq[1] + 8.5]);
await drag('logi', [hq[0] + 2.5, hq[1] + 4.5], [hq[0] + 10.5, hq[1] + 8.5]);
await shot(p, 'zones-1-painted');
const painted = await p.evaluate(() => ({ life: window.__fob.sim.zoneCount('life'), logi: window.__fob.sim.zoneCount('logi') }));
await p.selectOption('#z-chain', 'cola');
await run(2400); await p.waitForTimeout(800); await shot(p, 'zones-2-grown');
const grown = await p.evaluate(() => window.__fob.sim.b.filter(b => b.grown).map(b => b.type + (b.done ? '' : '*') + '@' + b.grown));
await p.click('[data-iv="zone"]'); await p.waitForTimeout(600); await shot(p, 'zones-3-view');
const legend = await p.isVisible('#iv-legend'); await p.click('[data-iv="zone"]');
await p.click('[data-g="living"]'); await p.waitForTimeout(300);
const handCards = await p.$$eval('.bi[data-b]', l => l.map(x => x.dataset.b).filter(k => ['barracks', 'mess', 'potty', 'hab', 'block'].includes(k)));
const refused = await p.evaluate(() => { const { sim } = window.__fob, pl = sim.plotTiles()[0]; return sim.canPlace('barracks', pl[0], pl[1], 0).why; });
const chain = await p.evaluate(() => window.__fob.sim.chainNow());
const out = { painted, grown, legend, handCards, refused, chain };
const ok = painted.life > 10 && painted.logi > 10 && grown.some(g => g.startsWith('barracks')) && grown.some(g => g.startsWith('mess')) && grown.some(g => g.startsWith('depot')) && legend && !handCards.length && /zone/.test(refused || '') && chain === 'cola';
if (!ok) errs.push('checks failed: ' + JSON.stringify(out));
await done(b, errs, JSON.stringify(out) + '\n');
