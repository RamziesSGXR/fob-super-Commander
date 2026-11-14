// Calling the HQ in on the big map, then buying a parcel of land through the LAND tool and its card: all by clicking
import { open } from './lib.mjs';
const { b, p, errs } = await open(1280, 760);
await p.click('#b-new'); await p.click('#fx-rand'); await p.click('#fx-go'); await p.waitForTimeout(600); await p.click('#ld-go'); await p.waitForTimeout(1500);
const st = () => p.evaluate(() => { const s = window.__fob.sim, v = window.__fob.view, sh = id => !document.getElementById(id).classList.contains('hidden') && getComputedStyle(document.getElementById(id)).display !== 'none';
  return { callIn: !!s.callIn, blds: s.b.map(b => b.type).join(','), held: s.held(), zoom: Math.round(v.zoom), card: sh('callin'), build: sh('build'), orders: sh('orders'), t: Math.round(s.t) }; });
const before = await st();
await p.screenshot({ path: 'test/shots/hq1.png' });
// the time does not run and nothing is built until the HQ is down
await p.waitForTimeout(1500); const still = await st();
// a bad spot first (the edge of the section), then the suggestion
const edge = await p.evaluate(() => window.__fob.view.toScreen(3, window.__fob.sim.N / 2));
if (edge) { await p.mouse.move(edge[0], edge[1]); await p.waitForTimeout(200); await p.mouse.click(edge[0], edge[1]); await p.waitForTimeout(300); }
const afterBad = await st();
await p.click('#ci-best'); await p.waitForTimeout(1200);
const spot = await p.evaluate(() => window.__fob.sim.autoSpot()), xy = await p.evaluate(([x, z]) => window.__fob.view.toScreen(x + 3, z + 3), spot);
await p.mouse.move(xy[0], xy[1]); await p.waitForTimeout(300); await p.screenshot({ path: 'test/shots/hq2.png' });
await p.mouse.click(xy[0], xy[1]); await p.waitForTimeout(1500);
const after = await st();
await p.screenshot({ path: 'test/shots/hq3.png' });
// LAND: open the tool, click a yellow parcel, press BUY on its card
await p.evaluate(() => { const s = window.__fob.sim; s.supplies += 2000; s.credits += 500; });
await p.click('#b-groups [data-g="roads"]').catch(() => {}); await p.waitForTimeout(200);
if (!(await p.$('#b-items [data-b="land"]'))) await p.click('#b-groups [data-g="roads"]');
await p.click('#b-items [data-b="land"]'); await p.waitForTimeout(400);
await p.evaluate(() => { const v = window.__fob.view; v.zoomT = v.zoom = 50; }); await p.waitForTimeout(600);
const pick = await p.evaluate(() => { const s = window.__fob.sim, P = 12; for (let pz = 1; pz < 22; pz++) for (let px = 1; px < 22; px++) if (s.parcelState(px, pz) === 'buy') { const xy = window.__fob.view.toScreen(px * P + 6, pz * P + 6); if (xy && xy[1] > 120 && xy[1] < 480 && xy[0] > 340 && xy[0] < 1000) return { px, pz, xy }; } return null; });
let bought = null;
if (pick) {
  await p.mouse.move(pick.xy[0], pick.xy[1]); await p.waitForTimeout(300); await p.mouse.click(pick.xy[0], pick.xy[1]); await p.waitForTimeout(500);
  await p.screenshot({ path: 'test/shots/hq4.png' });
  const card = await p.textContent('#selp').catch(() => '');
  if (await p.$('#lp-buy')) { await p.click('#lp-buy'); await p.waitForTimeout(500); }
  bought = { card: card.replace(/\s+/g, ' ').slice(0, 160), held: await p.evaluate(() => window.__fob.sim.held()), owns: await p.evaluate(([x, z]) => window.__fob.sim.owns(x, z), [pick.px, pick.pz]) };
}
await p.screenshot({ path: 'test/shots/hq5.png' });
const ok = before.callIn && before.card && !before.build && !before.orders && before.blds === '' && still.t === before.t && afterBad.callIn
  && !after.callIn && /hq/.test(after.blds) && after.held === 9 && !after.card && after.build && bought?.owns && bought.held === 10;
console.log(JSON.stringify({ before, still: still.t, afterBad: afterBad.callIn, after, bought }));
console.log(ok ? 'call-in and land purchase work' : 'CALL-IN OR LAND FAILED');
console.log(errs.slice(0, 5).join('\n') || 'no errors'); await b.close(); if (errs.length || !ok) process.exitCode = 1;
