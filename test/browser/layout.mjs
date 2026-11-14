// Layout: at five screen sizes, open each panel and window in turn and report any two pieces of the interface that
// overlap (the floating windows in the middle are allowed to cover the map, not each other's controls).
import { open, newGame, foundation, shot, done } from './lib.mjs';
const SIZES = (process.env.SIZES || '1920x1080,1440x860,1280x720,1024x768,390x844').split(',').map(s => s.split('x').map(Number));
const PARTS = ['#top', '#notices', '#stand', '#orders', '#selp', '#comms', '#iv-legend', '#mmwrap', '#b-items', '#b-groups', '#status', '#deskpop', '#design', '#mdock', '#clock', '#iv'];
const report = [];
for (const [w, h] of SIZES) {
  const { b, p, errs } = await open(w, h);
  await newGame(p); await foundation(p, 2); await p.keyboard.press('Space');
  const boxes = () => p.evaluate(parts => parts.map(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return (r.width < 2 || r.height < 2 || cs.display === 'none' || cs.visibility === 'hidden' || e.style.visibility === 'hidden' || e.closest('.hidden')) ? null : { sel, x: r.left, y: r.top, w: r.width, h: r.height }; }).filter(Boolean), PARTS);
  const check = async (state) => {
    const bx = await boxes(), out = [];
    for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) {
      const a = bx[i], c = bx[j], ix = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x), iy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
      if (ix > 4 && iy > 4) {
        const inner = (o, q) => o.x >= q.x - 1 && o.y >= q.y - 1 && o.x + o.w <= q.x + q.w + 1 && o.y + o.h <= q.y + q.h + 1;   // nested by design (iv inside mmwrap)
        if (inner(a, c) || inner(c, a)) continue;
        out.push(`${a.sel}×${c.sel} ${Math.round(ix)}×${Math.round(iy)}`);
      }
    }
    // off the screen
    for (const a of bx) if (a.x < -2 || a.y < -2 || a.x + a.w > w + 2 || a.y + a.h > h + 2) out.push(`${a.sel} off screen`);
    if (out.length) { report.push(`${w}x${h} ${state}: ${out.join(', ')}`); await shot(p, `layout-${w}x${h}-${state}`); }
  };
  await check('plain');
  for (const g of ['roads', 'zones', 'power', 'living', 'defence']) { await p.click(`[data-g="${g}"]`).catch(() => {}); await p.waitForTimeout(250); await check('bar-' + g); }
  await p.evaluate(() => { const { sim, view } = window.__fob, x = sim.b.find(b => b.type === 'mess') || sim.b[0]; view.lookAt(x.x + 1, x.z + 1); });
  await p.waitForTimeout(500);
  const pt = await p.evaluate(() => { const { sim, view } = window.__fob, x = sim.b.find(b => b.type === 'mess') || sim.b[0]; return view.toScreen(x.x + x.w / 2, x.z + x.d / 2, 0.3); });
  if (pt) { await p.mouse.click(pt[0], pt[1]); await p.waitForTimeout(400); await check('card'); }
  await p.click('[data-iv="util"]').catch(() => {}); await p.waitForTimeout(400); await check('card+legend');
  await p.click('#b-comms').catch(() => {}); await p.waitForTimeout(300); await check('card+legend+comms');
  await p.evaluate(() => { const s = window.__fob.sim; s.events.push({ t: 'report', id: s.reports?.[0]?.id }); }); await p.waitForTimeout(500); await check('report-pop');
  report.push(`${w}x${h}: checked${errs.length ? ' ERRORS ' + errs.slice(0, 2).join(' | ') : ''}`);
  await b.close();
}
console.log(report.join('\n'));
