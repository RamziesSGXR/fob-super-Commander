// Readouts: every number in the top bar and the status bar shows a live breakdown on hover, and a click takes you to the
// window or map view where it is managed.
import { open, newGame, foundation, shot, done } from './lib.mjs';
const { b, p, errs } = await open();
await newGame(p); await foundation(p, 2); await p.keyboard.press('Space');
const keys = await p.$$eval('[data-info]', l => l.map(e => e.dataset.info));
const res = {};
for (const k of keys) {
  const el = await p.$(`[data-info="${k}"]`); const box = await el.boundingBox(); if (!box) { res[k] = 'hidden'; continue; }
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.waitForTimeout(150);
  const tipText = await p.evaluate(() => { const t = document.getElementById('tip'); return t.classList.contains('hidden') ? '' : t.innerText; });
  const rows = await p.$$eval('#tip .tipt tr', l => l.length);
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await p.waitForTimeout(300);
  const where = await p.evaluate(() => { const m = document.getElementById('mins'); return { win: !m.classList.contains('hidden') ? (document.querySelector('#mi-tabs .on')?.textContent || 'open') : null, view: document.querySelector('#iv .on')?.dataset.iv || 'none' }; });
  res[k] = { head: tipText.split('\n')[0].slice(0, 50), rows, ...where };
  if (k === 'morale') await shot(p, 'info-morale');
  await p.keyboard.press('Escape'); await p.evaluate(() => { document.getElementById('mins').classList.add('hidden'); }); await p.waitForTimeout(100);
  const on = await p.$('#iv .on'); if (on && (await on.getAttribute('data-iv')) !== 'none') await on.click();
}
const want = { sup: 'win', cr: 'win', debt: 'win', votes: 'zone', morale: 'win', power: 'util', rations: 'supply', fuel: 'supply', ammo: 'supply', ready: 'win', week: 'win' };
const bad = Object.entries(want).filter(([k, w]) => { const r = res[k]; return !r || r === 'hidden' || r.rows < 1 || (w === 'win' ? !r.win : r.view !== w); });
if (bad.length) errs.push('readouts wrong: ' + JSON.stringify(bad.map(([k]) => [k, res[k]])));
await done(b, errs, JSON.stringify(res) + '\n');
