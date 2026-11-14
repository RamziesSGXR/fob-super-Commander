import { open } from './lib.mjs';
const { b, p, errs } = await open(1280, 760);
await p.click('#b-new'); await p.click('#fx-rand'); await p.click('#fx-go'); await p.waitForTimeout(600); await p.click('#ld-go'); await p.waitForTimeout(1500);
const before = await p.evaluate(() => { const s = window.__fob.sim, h = s.b.find(b => b.type === 'hq'); return [h.x, h.z, s.box()]; });
// hover and click a spot 6 tiles to the right/up of the HQ
const target = await p.evaluate(([x, z]) => window.__fob.view.toScreen(x + 9, z - 4, 0), before);
await p.mouse.move(target[0], target[1]); await p.waitForTimeout(400); await p.screenshot({ path: 'test/shots/hq1.png' });
await p.mouse.click(target[0], target[1]); await p.waitForTimeout(800);
const after = await p.evaluate(() => { const s = window.__fob.sim, h = s.b.find(b => b.type === 'hq'), f = s.b.find(b => b.type === 'seflag'); return { hq: [h.x, h.z], flag: [f.x, f.z], set: s.hqSet, uns: s.unsettled() }; });
await p.waitForTimeout(800); await p.screenshot({ path: 'test/shots/hq2.png' });
const orders = await p.textContent('#tb-body');
console.log(JSON.stringify({ before, after, orders: orders.slice(0, 120) })); console.log(errs.slice(0, 5).join('\n') || 'no errors'); await b.close(); if (errs.length) process.exitCode = 1;
