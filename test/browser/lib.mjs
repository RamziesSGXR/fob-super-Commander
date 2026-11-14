// Shared set-up for the browser checks: start Chrome on the running page, collect errors, start a new game.
// Run `npm start` in one terminal, then `npm run ui:all` (or one file: `node test/browser/hud.mjs`).
// CHROME=/path/to/chrome picks the browser; URL= points at another copy. Screenshots land in test/shots/.
import { mkdirSync } from 'node:fs';
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('playwright-core')); }
mkdirSync('test/shots', { recursive: true });
export const URL = process.env.URL || 'http://localhost:8080/';
export const shot = (p, name) => p.screenshot({ path: `test/shots/${name}.png` });
export async function open(w = 1440, h = 860) {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: w, height: h } }), errs = [];
  p.on('pageerror', e => errs.push(e.message + (e.stack || '').split('\n')[1]));
  p.on('console', m => m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(2000);
  return { b, p, errs };
}
// found a random faction, land on the suggested site, and put the HQ tool away
export async function newGame(p) {
  await p.click('#b-new'); await p.click('#fx-rand'); await p.click('#fx-go'); await p.waitForTimeout(600);
  await p.click('#ld-go'); await p.waitForTimeout(1500); await p.keyboard.press('Escape');
}
// lay a cross of paved road and the foundation, through the simulation, then let a few days pass
export async function foundation(p, days = 6) {
  await p.evaluate(days => {
    const { sim: s } = window.__fob, [lo, hi] = s.box(), m = (lo + hi) / 2; s.supplies += 4000;
    const L = (ax, az, bx, bz, k) => s.drawLine(s.snapLine({ x: ax, z: az }, 'grid', k), s.snapLine({ x: bx, z: bz }, 'grid', k), k);
    L(lo + 3, m + 0.5, hi - 3, m + 0.5, 'paved'); L(m + 0.5, lo + 3, m + 0.5, hi - 3, 'paved');
    for (const t of ['pad', 'depot', 'barracks', 'mess', 'range', 'gen', 'barracks', 'potty']) {
      const tiles = s.plotTiles();
      for (let i = 0; i < 80; i++) { const [x, z] = tiles[(i * 37) % tiles.length]; const pl = s.plotFor(t, x, z); if (pl && s.canPlace(t, pl.tx, pl.tz, pl.rot).ok) { const b = s.place(t, pl.tx, pl.tz, pl.rot); b.done = true; b.prog = 1; break; } }
    }
    for (let i = 0; i < days * 240; i++) s.step(0.5);
  }, days);
  await p.waitForTimeout(1500);
}
export async function done(b, errs, extra = '') { console.log(extra + (errs.length ? errs.slice(0, 8).join('\n') : 'no errors')); await b.close(); if (errs.length) process.exitCode = 1; }
