// A finished-looking base for the title screen, built through the same calls a player uses.
import { Sim } from './sim.js';

export function demoSim() {
  const s = new Sim({ seed: 20261110 }), N = s.N, m = N / 2;
  s.supplies = 1e6;
  const put = (type, x, z, rot = 0) => { for (const r of [rot, (rot + 1) % 4]) { const b = s.place(type, x, z, r); if (b) { b.prog = 1; b.done = true; return b; } } return null; };
  for (let k = 0; k < 2; k++) outer: for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) if (s.canPlace('pump', x, z, 0).ok) { put('pump', x, z); break outer; }
  [['depot', m + 3, m + 1], ['barracks', m - 7, m + 1], ['mess', m - 3, m + 3], ['parade', m - 8, m - 6], ['truth', m + 6, m - 3], ['plant', m + 8, m + 6],
   ['gen', m + 6, m + 1], ['solar', m - 4, m - 6], ['solar', m - 4, m - 8], ['armory', m - 11, m + 1], ['hab', m - 10, m - 2], ['hab', m - 13, m - 2],
   ['vend', m + 1, m + 4], ['vend', m + 2, m + 4], ['dome', m - 13, m + 4], ['flag', m - 3, m + 1], ['banner', m - 1, m + 6], ['banner', m + 1, m + 6],
   ['banner', m - 3, m + 6], ['speaker', m + 3, m + 4], ['billboard', m + 5, m + 4], ['pool', m - 2, m + 8], ['memorial', m + 2, m + 8], ['statue', m - 6, m + 7],
   ['potty', m - 11, m - 4], ['potty', m - 10, m - 4], ['shed', m + 9, m - 3], ['shelter', m - 14, m + 7]]
    .forEach(([t, x, z]) => put(t, x, z));
  for (let i = 0; i < 16; i++) s.addTroop();
  s.e710 = 120; s.supplies = 2000; s.log = [];
  return s;
}
