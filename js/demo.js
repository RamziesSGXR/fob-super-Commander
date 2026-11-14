// A finished-looking base for the title screen, built through the same calls a player uses, with a road to every door.
import { Sim } from './sim.js';
import { B } from './config.js';

export function demoSim() {
  const s = new Sim({ seed: 20261110, flat: true }), N = s.N, m = N / 2;
  s.supplies = 1e6;
  const put = (type, x, z, std = 2, rot = 0) => { for (const r of [rot, (rot + 1) % 4, (rot + 2) % 4]) { const b = s.place(type, x, z, r, true, { std }); if (b) { b.prog = 1; b.done = true; return b; } } return null; };
  [['depot', m + 3, m + 2], ['fueldepot', m + 6, m + 2], ['motorpool', m + 3, m + 5], ['mess', m - 4, m - 7], ['barracks', m - 9, m - 7], ['barracks', m - 13, m - 7, 0],
   ['range', m + 4, m - 9], ['course', m + 9, m - 9], ['parade', m - 13, m + 2], ['patrol', m + 9, m + 5, 1], ['truth', m - 4, m + 7], ['lecture', m - 9, m + 7, 1],
   ['gen', m + 9, m + 1], ['solar', m - 4, m - 10], ['solar', m - 7, m - 10], ['hab', m - 13, m - 3], ['potty', m - 6, m - 4], ['potty', m - 5, m - 4],
   ['vend', m - 2, m + 3], ['flag', m - 6, m + 5], ['banner', m - 7, m + 5], ['banner', m - 8, m + 5], ['hdbanner', m + 3, m + 9], ['speaker', m - 2, m + 6],
   ['statue', m + 5, m + 9], ['pool', m + 8, m + 9], ['memorial', m - 13, m + 10], ['cola', m + 12, m - 3]]
    .forEach(([t, x, z, k]) => put(t, x, z, k ?? 2));
  put('yard', m + 12, m + 5, 1);   // the engineers' yard, still in prefabs, and a barracks still under canvas
  // a dirt path from every door to the main road
  for (const b of s.b) {
    const [dx, dz] = s.door(b), k = B[b.type].store || B[b.type].need ? 'paved' : 'dirt';
    const a = s.snapLine({ x: dx + 0.5, z: dz + 0.5 }, 'free', k), e = s.snapLine({ x: m + 1, z: dz + 0.5 }, 'free', k, a);
    s.drawLine(a, e, k);
  }
  for (const b of s.b) { if (B[b.type].store) b.stock = { ...b.stock, ...B[b.type].store }; if (B[b.type].need) b.stock = { ...b.stock, ...B[b.type].need }; }
  s.paintZone(m - 15, m - 9, m - 2, m - 2, 'life'); s.paintZone(m + 2, m - 1, m + 11, m + 3, 'logi'); s.paintZone(m - 15, m + 9, m - 10, m + 12, 'comm'); s.paintZone(m + 2, m - 11, m + 13, m - 6, 'train');
  for (let i = 0; i < 30; i++) s.addTroop(i % 2 ? 100 : 40);
  s.supplies = 2000; s.log = [];
  return s;
}
