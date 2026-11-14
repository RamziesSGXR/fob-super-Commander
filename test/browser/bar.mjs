// 0.20: one bottom bar. EMPLOYMENT opens and closes the build bar, MAP the minimap, BUY SUPPLIES trades credits for
// supplies, INTELLIGENCE lists advice and warnings, the standings panel is gone and the flag has its plaza.
import { open, newGame, foundation, shot, done } from './lib.mjs';
const { b, p, errs } = await open();
await newGame(p); await foundation(p, 2); await p.keyboard.press('Space');
const vis = id => p.evaluate(id => { const e = document.getElementById(id), r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0; }, id);
const r = { stand: await vis('stand'), map0: await vis('minimap'), build0: await vis('build') };
await p.click('#md-map-b'); r.map1 = await vis('minimap'); await p.click('#md-map-b');
await p.click('#md-emp-b'); r.build1 = await vis('build'); await p.click('#md-emp-b'); r.build2 = await vis('build');
const s0 = await p.evaluate(() => [window.__fob.sim.supplies, window.__fob.sim.credits]);
await p.click('#b-buy'); await p.waitForTimeout(200);
const s1 = await p.evaluate(() => [window.__fob.sim.supplies, window.__fob.sim.credits]);
r.bought = s1[0] - s0[0]; r.paid = s0[1] - s1[1];
await p.click('#mdock [data-mt="int"]'); await p.waitForTimeout(300);
r.intel = await p.evaluate(() => { const t = document.getElementById('mins').innerText; return t.includes('SUGGESTED ACTIONS') && t.includes('THREAT LEVEL'); });
r.pics = await p.evaluate(() => [...document.querySelectorAll('#b-items img[data-th]')].every(i => i.src.startsWith('data:'))); if (!r.pics) errs.push('a tool card has no picture');
r.tabs = await p.$$eval('#mi-tabs button', l => l.map(e => e.textContent.trim()).join(','));
await shot(p, 'bar-intel'); await p.keyboard.press('Escape'); await p.evaluate(() => document.getElementById('mins').classList.add('hidden'));
r.plaza = await p.evaluate(() => { const s = window.__fob.sim, f = s.b.find(b => b.type === 'seflag'); return [s.fits('depot', f.x - 2, f.z, 0).why || 'ok', !!window.__fob.view.flagPlz]; });
const top = await p.evaluate(() => { const a = document.getElementById('top').getBoundingClientRect(); return [Math.round(a.top), innerHeight]; });
r.top = top;
r.res = await p.evaluate(() => [...document.querySelectorAll('#top .ri')].every(e => { const b = e.getBoundingClientRect(), t = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return b.width > 0 && e.contains(t); })); if (!r.res) errs.push('a readout is covered'); await shot(p, 'bar');
const ok = !r.stand && !r.map0 && r.map1 && r.build0 && !r.build1 && r.build2 && r.bought === 100 && r.paid > 0 && r.intel && /PROSPERITY,HUMANITY/.test(r.tabs) && /INTELLIGENCE,UNITY/.test(r.tabs) && /plaza/.test(r.plaza[0]) && r.plaza[1] && top[0] > top[1] - 120;
if (!ok) errs.push('bar check failed');
await done(b, errs, JSON.stringify(r) + '\n');
