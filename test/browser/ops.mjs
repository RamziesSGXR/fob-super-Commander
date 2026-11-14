import { open } from './lib.mjs';
const { b, p, errs } = await open(1280, 860);
await p.click('#b-new'); await p.click('#fx-rand'); await p.click('#fx-go'); await p.waitForTimeout(600); await p.click('#ld-go'); await p.waitForTimeout(1500);
await p.keyboard.press('Escape');
await p.evaluate(() => { const { sim: s } = window.__fob; s.troops.forEach(t => t.train = 100); for (let i = 0; i < 10; i++) s.addTroop(100); s.send(s.offers[0].id, []); s.newOffers(); s.send(s.offers[1].id, []); });
await p.evaluate(() => { const { sim: s } = window.__fob; for (let i = 0; i < 400; i++) { s.step(0.5); } });
await p.click('#mdock [data-mt="def"]');
await p.waitForTimeout(500);
const opened = await p.evaluate(() => !!document.getElementById('opmap'));
if (!opened) { await p.evaluate(() => { const b = [...document.querySelectorAll('button, .dk')].find(x => /DEFENCE/.test(x.textContent)); b?.click(); }); await p.waitForTimeout(500); }
await p.evaluate(() => { document.getElementById('opmap')?.scrollIntoView(); }); await p.waitForTimeout(300);
await p.screenshot({ path: 'test/shots/ops1.png' });
await p.evaluate(() => { const { sim: s } = window.__fob; for (let i = 0; i < 4000 && s.patrols.length; i++) s.step(0.5); }); await p.waitForTimeout(600);
const r = await p.$('[data-rep]'); if (r) { await r.click(); await p.waitForTimeout(300); await r.scrollIntoViewIfNeeded().catch(() => {}); }
await p.screenshot({ path: 'test/shots/ops2.png' });
console.log(JSON.stringify(await p.evaluate(() => ({ reps: window.__fob.sim.reports?.length, pop: !document.getElementById('deskpop').classList.contains('hidden'), map: !!document.getElementById('opmap') }))));
console.log(errs.slice(0, 5).join('\n') || 'no errors'); await b.close(); if (errs.length) process.exitCode = 1;
