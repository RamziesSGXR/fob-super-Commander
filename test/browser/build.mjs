// The 0.13 construction loop: the landing pelican and the sweep, engineer crews, tents and prefabs, scrub clearing,
// an Engineer Yard training a third crew, and an upgrade from the building card.
import { open, newGame, shot, done } from './lib.mjs';
const { b, p, errs } = await open();
await newGame(p);
await p.keyboard.press('Space');   // the check steps the simulation itself
const run = n => p.evaluate(n => { const { sim, life } = window.__fob; for (let i = 0; i < n; i++) { sim.step(0.1); life.update(0.1); } }, n);
const start = await p.evaluate(() => { const { sim, life, view } = window.__fob, hq = sim.b[0]; view.lookAt(hq.x + 4, hq.z + 4); return { crews: sim.crews.length, sweep: !!sim.sweep && !sim.sweep.done, pelican: life.flights.some(f => f.kind === 'landing'), tent: sim.stdOf(hq) === 0 }; });
await run(200); await p.waitForTimeout(600); await shot(p, 'build-1-sweep');
const sweepers = await p.evaluate(() => [...window.__fob.life.actors.values()].filter(a => a.task === 'sweep').length);
const made = await p.evaluate(() => {
  const { sim } = window.__fob, hq = sim.b[0]; sim.supplies += 3000;
  const L = (ax, az, bx, bz) => sim.drawLine(sim.snapLine({ x: ax, z: az }, 'grid', 'dirt'), sim.snapLine({ x: bx, z: bz }, 'grid', 'dirt'), 'dirt');
  L(hq.x + 1.5, hq.z + 3.5, hq.x + 1.5, hq.z + 18.5); L(hq.x - 8.5, hq.z + 9.5, hq.x + 12.5, hq.z + 9.5);
  const put = (t, x, z, k) => { sim.setStd(k); const pl = sim.plotFor(t, x, z); return pl && sim.place(t, pl.tx, pl.tz, pl.rot, false, { std: k, grow: true }); };
  const out = [put('barracks', hq.x - 4, hq.z + 6, 0), put('mess', hq.x + 6, hq.z + 6, 0), put('depot', hq.x - 4, hq.z + 13, 1), put('pad', hq.x + 4, hq.z + 16, 0)].map(b => b ? b.type + ':' + b.std : null);
  sim.setStd(0);
  let sc = null; for (let z = hq.z - 14; z < hq.z + 14 && !sc; z++) for (let x = hq.x - 14; x < hq.x + 14; x++) if (sim.scrub[z * sim.N + x] && sim.inside(x, z) && !sim.occ[z * sim.N + x]) { sc = [x, z]; break; }
  out.push(sc ? sim.orderClear(sc[0], sc[1]).ok : 'no scrub');
  return out;
});
await run(1400); await p.waitForTimeout(600); await shot(p, 'build-2-crews');
await p.evaluate(() => { const { sim } = window.__fob, hq = sim.b[0], pl = sim.plotFor('yard', hq.x - 6, hq.z + 13); if (pl) sim.place('yard', pl.tx, pl.tz, pl.rot); });
await run(2600);
const mid = await p.evaluate(() => { const { sim } = window.__fob; return { secure: sim.secure(), built: sim.b.filter(b => b.done).length, cleared: sim.stats.cleared || 0, crews: sim.crews.length, report: (sim.reports || []).some(r => r.op === 'Landing zone sweep') }; });
// upgrade the mess from its card
const xy = await p.evaluate(() => { const { sim, view } = window.__fob, b = sim.b.find(b => b.type === 'mess'); view.lookAt(b.x + b.w / 2, b.z + b.d / 2); return [b.x + b.w / 2, b.z + b.d / 2]; });
await p.waitForTimeout(700);
const pt = await p.evaluate(([x, z]) => window.__fob.view.toScreen(x, z, 0.3), xy);
await p.keyboard.press('Escape'); await p.mouse.click(pt[0], pt[1]); await p.waitForTimeout(500);
const upg = await p.$('#sp-upg'); if (upg) await p.click('#sp-upg');
await run(400); await p.waitForTimeout(500); await shot(p, 'build-3-upgraded');
const end = await p.evaluate(() => { const { sim } = window.__fob, m = sim.b.find(b => b.type === 'mess'); return { mess: sim.stdOf(m), engineers: [...window.__fob.life.actors.values()].filter(a => a.kind === 'eng').length }; });
const ok = start.crews === 2 && start.sweep && start.pelican && start.tent && sweepers > 0 && mid.secure && mid.report && mid.cleared > 0 && mid.crews === 3 && end.mess === 1 && end.engineers >= 6;
if (!ok) errs.push('checks failed: ' + JSON.stringify({ start, sweepers, made, mid, end }));
await done(b, errs, JSON.stringify({ start, sweepers, made, mid, end }) + '\n');
