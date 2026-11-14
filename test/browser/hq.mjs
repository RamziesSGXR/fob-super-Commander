// The landing, by clicking: pick the landing zone, drag a dirt track, set down the Command Post, raise the flag; then the
// zones tab flips the view, a click beside the track fills a zone block, the menu pauses the clock, and F3 opens debug
import { open } from './lib.mjs';
const { b, p, errs } = await open(1280, 760);
await p.click('#b-new'); await p.click('#fx-rand'); await p.click('#fx-go'); await p.waitForTimeout(600); await p.click('#ld-go'); await p.waitForTimeout(1500);
const st = () => p.evaluate(() => { const s = window.__fob.sim, sh = id => !document.getElementById(id).classList.contains('hidden') && getComputedStyle(document.getElementById(id)).display !== 'none';
  return { callIn: s.callIn, blds: s.b.map(b => b.type).join(','), held: s.held(), card: sh('callin'), build: sh('build'), t: Math.round(s.t), track: Math.round(s.trackLen()), sweep: !!(s.sweep && !s.sweep.done) }; });
const xy = (x, z) => p.evaluate(([x, z]) => window.__fob.view.toScreen(x, z), [x, z]);
const click = async (x, z) => { const q = await xy(x, z); await p.mouse.move(q[0], q[1]); await p.waitForTimeout(250); await p.mouse.click(q[0], q[1]); await p.waitForTimeout(700); };
const before = await st();
const [x, z] = await p.evaluate(() => window.__fob.sim.autoSpot());
await click(x - 2 + 0.5, z + 1 + 0.5);
const landed = await st(); await p.waitForTimeout(600);
// the track: drag from the landing zone south-east, clear of where the Command Post will go
{ const a = await xy(x - 1.5, z + 4.5), c = await xy(x + 9.5, z + 4.5); await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, { steps: 4 }); await p.mouse.move(c[0], c[1], { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(700); }
const tracked = await st(); await p.screenshot({ path: 'test/shots/hq1.png' });
await click(x + 3, z + 1.5);
const posted = await st();
await click(x - 2 + 0.5, z + 1 + 0.5);
const after = await st(); await p.waitForTimeout(1200); await p.screenshot({ path: 'test/shots/hq2.png' });
await p.evaluate(() => { window.__fob.sim.supplies += 3000; });
await p.click('#b-groups [data-g="zones"]'); await p.waitForTimeout(300);
const iv = await p.evaluate(() => document.querySelector('#iv .on')?.dataset.iv || '');
await p.click('#b-items [data-b="zone:life"]').catch(() => {}); await p.waitForTimeout(300);
await p.evaluate(([x, z]) => { const v = window.__fob.view; v.target.x = v.wx(x + 4.5); v.target.z = v.wx(z + 16); }, [x, z]); await p.waitForTimeout(500);   // the bottom bars are tall: bring the spot up the screen
await click(x + 4.5, z + 6.5);
const zoned = await p.evaluate(() => window.__fob.sim.zoneCount('life'));
await p.screenshot({ path: 'test/shots/hq3.png' });
await p.click('#b-menu'); await p.waitForTimeout(200); const t0 = await p.evaluate(() => window.__fob.sim.t); await p.waitForTimeout(1200); const t1 = await p.evaluate(() => window.__fob.sim.t);
await p.click('#me-resume'); await p.waitForTimeout(200);
await p.keyboard.press('F3'); await p.waitForTimeout(600); const dbg = await p.evaluate(() => !document.getElementById('debug').classList.contains('hidden') && document.getElementById('debug').textContent.includes('FPS'));
const ok = before.callIn === 'flag' && before.blds === '' && landed.callIn === 'road' && landed.held === 9 && landed.blds === '' && tracked.callIn === 'hq' && tracked.track >= 6
  && posted.callIn === 'flagpost' && /hq/.test(posted.blds) && /pad/.test(posted.blds) && after.callIn === false && /seflag/.test(after.blds) && !after.card && after.build && !after.sweep && zoned > 0 && t0 === t1 && dbg;
console.log(JSON.stringify({ before, landed, tracked, posted, after, iv, zoned, menuPaused: t0 === t1, dbg }));
console.log(ok ? 'landing, zoning, menu and debug work' : 'SOMETHING FAILED');
console.log(errs.slice(0, 5).join('\n') || 'no errors'); await b.close(); if (errs.length || !ok) process.exitCode = 1;
