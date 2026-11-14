// The landing screen: the globe draws, a click picks a section and enables LAND HERE, and the five landing steps follow.
import { open, shot, done } from './lib.mjs';
const { b, p, errs } = await open();
await p.click('#b-new'); await p.click('#fx-rand'); await p.waitForTimeout(300);
await p.click('#fx-go'); await p.waitForTimeout(2500);
const r = { globe: await p.evaluate(() => { const c = document.getElementById('ld-globe'); return c.getBoundingClientRect().width > 100 && !document.getElementById('s-land').classList.contains('flat'); }), go0: await p.evaluate(() => document.getElementById('ld-go').disabled) };
await shot(p, 'globe0');
const box = await (await p.$('#ld-globe')).boundingBox();
await p.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5); await p.waitForTimeout(3500);
r.go1 = await p.evaluate(() => document.getElementById('ld-go').disabled); r.survey = await p.evaluate(() => document.getElementById('ld-survey').innerText.includes('BUILDABLE'));
await shot(p, 'globe1');
await p.click('#ld-best'); await p.waitForTimeout(3000); await shot(p, 'globe2');
await p.click('#ld-go'); await p.waitForFunction(() => window.__fob?.sim?.callIn === 'flag', null, { timeout: 60000 });
r.callIn = await p.evaluate(() => window.__fob.sim.callIn);
if (!(r.globe && r.go0 && !r.go1 && r.survey && r.callIn === 'flag')) errs.push('globe landing failed');
await done(b, errs, JSON.stringify(r) + '\n');
