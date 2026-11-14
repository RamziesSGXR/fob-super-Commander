// The 0.12 interface: the build toolbar and its cards, the economy window and its tabs, a trade, a commitment,
// every info view, the comms log, the task board, and the building card.
import { open, newGame, foundation, shot, done } from './lib.mjs';
const { b, p, errs } = await open();
await newGame(p); await foundation(p);
await p.click('[data-g="training"]'); await p.waitForTimeout(800); await shot(p, 'hud-1-build');
const cards = await p.$$eval('.bi img[data-th]', l => l.filter(i => i.src.startsWith('data:image')).length);
await p.click('#mdock [data-mt="eco"]'); await p.waitForTimeout(500); await shot(p, 'hud-2-budget');
await p.click('[data-et="market"]'); await p.waitForTimeout(300);
const cr0 = await p.evaluate(() => window.__fob.sim.credits);
await p.click('[data-trade="sup:0"]'); await p.waitForTimeout(300);
const sold = await p.evaluate(c => window.__fob.sim.credits > c, cr0); await shot(p, 'hud-3-market');
await p.click('[data-et="commit"]'); await p.waitForTimeout(300); await p.click('[data-commit="def:3"]'); await p.waitForTimeout(300);
const lvl = await p.evaluate(() => window.__fob.sim.commit.def); await shot(p, 'hud-4-commit');
for (const t of ['loans', 'prod', 'budget']) { await p.click(`[data-et="${t}"]`); await p.waitForTimeout(200); }
await p.click('#mi-x');
const views = await p.$$eval('[data-iv]', l => l.map(x => x.dataset.iv));
for (const v of views) { await p.click(`[data-iv="${v}"]`); await p.waitForTimeout(400); if (v === 'res' || v === 'routes' || v === 'money') await shot(p, 'hud-5-view-' + v); }
await p.click('[data-iv="none"]');
const routes = await p.evaluate(() => { const v = window.__fob.view; return v.routeG ? 0 : -1; });
await p.click('#b-comms'); await p.waitForTimeout(300); const comms = await p.isVisible('#comms'); await p.click('#cm-x');
const board = await p.$$eval('#tb-body .tb-i, #tb-body .tb-o', l => l.length);
const bid = await p.evaluate(() => { const { sim, view } = window.__fob, b = sim.b.find(b => b.type === 'range'); view.lookAt(b.x + b.w / 2, b.z + b.d / 2); return b.id; }); await p.waitForTimeout(700);
const xy = await p.evaluate(id => { const b = window.__fob.sim.byId(id); return window.__fob.view.toScreen(b.x + b.w / 2, b.z + b.d / 2, 0.3); }, bid);
await p.mouse.click(xy[0], xy[1]); await p.waitForTimeout(500); const card = await p.textContent('#selp .sp-status').catch(() => null); await shot(p, 'hud-6-card');
const ok = cards >= 3 && sold && lvl === 3 && views.length >= 9 && comms && board > 0 && card;
if (!ok) errs.push(`checks failed: ${JSON.stringify({ cards, sold, lvl, views: views.length, comms, board, card })}`);
await done(b, errs, `pictures ${cards}, sold ${sold}, commit ${lvl}, views ${views.length}, board items ${board}, card "${card}"\n`);
