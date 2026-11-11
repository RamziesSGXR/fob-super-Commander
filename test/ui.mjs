import { chromium } from 'playwright';
// Plays the real page: npm start in one terminal, npm run ui in another. Screenshots land in test/shots/.
import { mkdirSync } from 'node:fs';
mkdirSync('test/shots', { recursive: true });
const URL = process.env.URL || 'http://localhost:8080/';
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const errs = [];
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(URL); await p.waitForTimeout(2500);
await p.screenshot({ path: 'test/shots/8-title.png' });
await p.click('#b-new'); await p.click('#fx-rand'); await p.click('#fx-go'); await p.waitForTimeout(1200);
// build a depot by clicking the bar and the map
await p.click('[data-b="depot"]');
await p.mouse.move(820, 560); await p.waitForTimeout(300);
await p.screenshot({ path: 'test/shots/9-ghost.png' });
await p.mouse.click(820, 560); await p.waitForTimeout(300);
const n1 = await p.evaluate(() => window.__fob.sim.b.length);
// pump on a deposit: find a deposit tile and click its screen position
await p.click('[data-g="industry"]'); await p.click('[data-b="pump"]');
const spot = await p.evaluate(() => { const { sim } = window.__fob; for (let z = 1; z < sim.N - 1; z++) for (let x = 1; x < sim.N - 1; x++) if (sim.canPlace('pump', x, z, 0).ok) return [x, z]; });
await p.evaluate(([x, z]) => window.__fob.view.lookAt(x + 1, z + 1), spot); await p.waitForTimeout(800);
await p.mouse.move(720, 430); await p.waitForTimeout(200); await p.mouse.click(720, 430); await p.waitForTimeout(300);
const n2 = await p.evaluate(() => window.__fob.sim.b.map(b => b.type).join(','));
// fast forward, then select the pump
await p.evaluate(() => { const { sim } = window.__fob; for (let i = 0; i < 900; i++) sim.step(0.1); });
await p.waitForTimeout(500);
await p.mouse.click(720, 425); await p.waitForTimeout(400);
await p.screenshot({ path: 'test/shots/10-select.png' });
// patrol and requisition through the panel
await p.keyboard.press('m'); await p.waitForTimeout(300);
await p.click('[data-send]'); await p.waitForTimeout(300);
await p.click('[data-t="pro"]'); await p.waitForTimeout(300);
await p.screenshot({ path: 'test/shots/11-pro.png' });
const ship = await p.$('[data-ship]:not([disabled])'); if (ship) await ship.click();
await p.click('[data-t="tru"]'); await p.waitForTimeout(300);
await p.screenshot({ path: 'test/shots/12-tru.png' });
const st = await p.evaluate(() => { const s = window.__fob.sim; return { patrols: s.patrols.length, delivered: s.stats.delivered, e710: Math.round(s.e710), contracts: s.contracts.map(c => c.good + c.qty) }; });
console.log('placed after depot:', n1, '| buildings:', n2, '|', JSON.stringify(st));
// phone held sideways
const q = await b.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
q.on('pageerror', e => errs.push('PHONE ' + e.message));
await q.goto(URL + '?play&seed=7', { timeout: 90000 }); await q.waitForTimeout(2500);
await q.screenshot({ path: 'test/shots/13-phone.png' });
console.log(errs.join('\n') || 'no errors');
await b.close();
