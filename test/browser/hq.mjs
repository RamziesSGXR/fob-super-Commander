// The landing, by clicking: raise the flag, set down the Command Post (HQ + pad); then the zones tab flips the view, a
// click beside a road fills a zone block, the menu pauses the clock, and F3 opens the debug window
import { open } from './lib.mjs';
const { b, p, errs } = await open(1280, 760);
await p.click('#b-new'); await p.click('#fx-rand'); await p.click('#fx-go'); await p.waitForTimeout(600); await p.click('#ld-go'); await p.waitForTimeout(1500);
const st = () => p.evaluate(() => { const s = window.__fob.sim, sh = id => !document.getElementById(id).classList.contains('hidden') && getComputedStyle(document.getElementById(id)).display !== 'none';
  return { callIn: s.callIn, blds: s.b.map(b => b.type).join(','), held: s.held(), card: sh('callin'), build: sh('build'), t: Math.round(s.t) }; });
const before = await st();
const click = async (x, z) => { const xy = await p.evaluate(([x, z]) => window.__fob.view.toScreen(x, z), [x, z]); await p.mouse.move(xy[0], xy[1]); await p.waitForTimeout(250); await p.mouse.click(xy[0], xy[1]); await p.waitForTimeout(700); };
const [x, z] = await p.evaluate(() => window.__fob.sim.autoSpot());
await click(x - 2 + 0.5, z + 1 + 0.5);
const flagged = await st(); await p.screenshot({ path: 'test/shots/hq1.png' });
await click(x + 3, z + 1.5);
const after = await st(); await p.screenshot({ path: 'test/shots/hq2.png' });
// zones: the tab flips the view; a road then a click beside it fills a block
await p.evaluate(([x, z]) => { const s = window.__fob.sim; s.supplies += 3000; s.drawLine(s.snapLine({ x: x + 1.5, z: z + 3.5 }, 'grid', 'dirt'), s.snapLine({ x: x + 1.5, z: z + 14.5 }, 'grid', 'dirt'), 'dirt'); }, [x, z]);
await p.click('#b-groups [data-g="zones"]'); await p.waitForTimeout(300);
const iv = await p.evaluate(() => document.querySelector('#iv .on')?.dataset.iv || document.querySelector('#iv [aria-pressed="true"]')?.dataset.iv || '');
await p.click('#b-items [data-b="zone:life"]').catch(() => {}); await p.waitForTimeout(300);
await click(x + 3.5, z + 9.5);
const zoned = await p.evaluate(() => window.__fob.sim.zoneCount('life'));
await p.screenshot({ path: 'test/shots/hq3.png' });
// the menu pauses, F3 opens the debug window
await p.click('#b-menu'); await p.waitForTimeout(200); const t0 = await p.evaluate(() => window.__fob.sim.t); await p.waitForTimeout(1200); const t1 = await p.evaluate(() => window.__fob.sim.t);
await p.click('#me-resume'); await p.waitForTimeout(200);
await p.keyboard.press('F3'); await p.waitForTimeout(600); const dbg = await p.evaluate(() => !document.getElementById('debug').classList.contains('hidden') && document.getElementById('debug').textContent.includes('FPS'));
await p.screenshot({ path: 'test/shots/hq4.png' });
const ok = before.callIn === 'flag' && before.card && before.blds === '' && flagged.callIn === 'hq' && flagged.blds === 'seflag' && flagged.held === 9
  && after.callIn === false && /hq/.test(after.blds) && /pad/.test(after.blds) && !after.card && zoned > 0 && t0 === t1 && dbg;
console.log(JSON.stringify({ before, flagged, after, iv, zoned, menuPaused: t0 === t1, dbg }));
console.log(ok ? 'landing, zoning, menu and debug work' : 'SOMETHING FAILED');
console.log(errs.slice(0, 5).join('\n') || 'no errors'); await b.close(); if (errs.length || !ok) process.exitCode = 1;
