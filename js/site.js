// Landing sites. Every planet has a region map: hills, water, flats and deposits laid out by one seeded field. You pick a
// spot on it, and the base's own ground is cut from that spot at full detail, so what you saw is what you land on.
//
// Ground kinds, one per tile: 0 open ground, 1 water, 2 rock (cliffs and outcrops), 3 an E-710 seep, 4 an ore field.
// Water and rock can't be built on or walked through; nothing is laid across water; both shut the base in like a
// wall would. Deposits are open ground with something under it.
import { Noise } from './noise.js';

export const GROUND = { OPEN: 0, WATER: 1, ROCK: 2, SEEP: 3, ORE: 4 };
export const RW = 240, RH = 150;   // the region map, in map pixels
const SCALE = 0.07;
export const TPP = 26.25;   // 8 m cells to a region map pixel (210 m)            // base tiles to a region map pixel: an 80-tile map covers about 19 pixels

// the planet's look and how wet it is. Chosen from the planet's name, so each planet keeps its character
export const BIOMES = {
  desert: { name: 'Desert', water: 0.28, rock: 0.70, ground: [168, 136, 96], low: [140, 112, 84], high: [104, 86, 70], sea: [70, 108, 120] },
  steppe: { name: 'Steppe', water: 0.34, rock: 0.72, ground: [132, 128, 92], low: [112, 118, 84], high: [96, 94, 82], sea: [52, 92, 118] },
  ice:    { name: 'Tundra', water: 0.33, rock: 0.70, ground: [196, 202, 206], low: [168, 178, 186], high: [122, 128, 138], sea: [70, 110, 150] },
  jungle: { name: 'Jungle', water: 0.38, rock: 0.74, ground: [86, 112, 66], low: [70, 96, 58], high: [82, 84, 70], sea: [44, 92, 96] },
  ash:    { name: 'Ashlands', water: 0.25, rock: 0.66, ground: [104, 98, 96], low: [88, 82, 80], high: [64, 60, 62], sea: [120, 74, 52] },
};
export function biomeOf(planet) { const k = Object.keys(BIOMES), h = [...String(planet)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7); return k[h % k.length]; }

// the shared field: height 0..1, plus where the deposits are
function field(seed) {
  const n = new Noise(seed), d = new Noise(seed + 101), w = new Noise(seed + 202);
  return {
    h(x, y) {   // a little warping makes coasts and ridges less blobby
      const wx = x + (w.fbm(x * 0.5, y * 0.5, 2) - 0.5) * 1.4, wy = y + (w.fbm(x * 0.5 + 40, y * 0.5, 2) - 0.5) * 1.4;
      return n.fbm(wx * 0.9, wy * 0.9, 5);
    },
    dep(x, y) { return [d.fbm(x * 3.2, y * 3.2, 2), d.fbm(x * 3.2 + 90, y * 3.2 + 30, 2)]; },
  };
}
const classify = (b, h, dep) => h < b.water ? 1 : h > b.rock ? 2 : dep[0] > 0.795 ? 3 : dep[1] > 0.8 ? 4 : 0;

// the region map, as pixels for a canvas. u, v of a pixel go 0..RW, 0..RH
export function regionImage(seed, biome) {
  const b = BIOMES[biome], f = field(seed), img = new Uint8ClampedArray(RW * RH * 4);
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    const u = x * SCALE * 0.9, v = y * SCALE * 0.9, h = f.h(u, v), k = classify(b, h, f.dep(u, v)), i = (y * RW + x) * 4;
    let c;
    if (k === 1) { const dpt = Math.min(1, (b.water - h) * 6); c = b.sea.map(q => q * (1 - dpt * 0.35)); }
    else if (k === 2) { const t = Math.min(1, (h - b.rock) * 6); c = b.high.map((q, j) => q * (1 - t * 0.2) + 30 * t); }
    else { const t = (h - b.water) / (b.rock - b.water); c = b.low.map((q, j) => q + (b.ground[j] - q) * t); if (k === 3) c = [c[0] * 0.7 + 60, c[1] * 0.6, c[2] * 0.7 + 40]; if (k === 4) c = [c[0] * 0.8 + 50, c[1] * 0.75 + 10, c[2] * 0.6]; }
    // a hint of relief: light from the north-west
    const sh = (f.h(u - 0.05, v - 0.05) - h) * 260;
    img[i] = c[0] - sh; img[i + 1] = c[1] - sh; img[i + 2] = c[2] - sh; img[i + 3] = 255;
  }
  return img;
}

// the section's ground, N x N tiles, centred on region pixel (cx, cy)
export function makeSite(seed, biome, cx, cy, N) {
  const b = BIOMES[biome], f = field(seed), terr = new Uint8Array(N * N), hgt = new Float32Array(N * N);
  const k = SCALE * 0.9 / TPP;   // one tile, in field units
  const fine = new Noise(seed + 303);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const u = cx * SCALE * 0.9 + (x - N / 2) * k, v = cy * SCALE * 0.9 + (z - N / 2) * k;
    let h = f.h(u, v) + (fine.fbm(u * 9, v * 9, 2) - 0.5) * 0.06;   // close up, shores and cliffs are ragged
    hgt[z * N + x] = h; terr[z * N + x] = classify(b, h, f.dep(u, v));
  }
  return { terr, hgt, water: b.water, rock: b.rock };
}

// the ground's height (0.17): one value per tile corner, (N + 1) x (N + 1), in world units (tiles; a tile is LAND.TILE_M
// metres). The waterline is height 0: the sea floor shelves below it, land rises above it on the same field that decides
// water and rock, and the rock is a stepped plateau with cliffs round its edge. A little fine noise roughens it close up.
export const RELIEF = 200 / 8, CLIFF = 45 / 8, WL = 0;   // in cells (8 m): 200 m of rise per unit of the field, 45 m cliffs
export const elevOf = (b, h) => h < b.water ? (h - b.water) * RELIEF * 0.6 - 0.04
  : (h - b.water) * RELIEF + CLIFF * Math.min(1, Math.max(0, (h - b.rock + 0.012) / 0.022)) ** 2 * (3 - 2 * Math.min(1, Math.max(0, (h - b.rock + 0.012) / 0.022)));
export function makeHeights(seed, biome, cx, cy, N) {
  const b = BIOMES[biome], f = field(seed), M = N + 1, out = new Float32Array(M * M), fine = new Noise(seed + 404);
  const k = SCALE * 0.9 / TPP;
  for (let z = 0; z < M; z++) for (let x = 0; x < M; x++) {
    const u = cx * SCALE * 0.9 + (x - 0.5 - N / 2) * k, v = cy * SCALE * 0.9 + (z - 0.5 - N / 2) * k;
    const h = f.h(u, v) + (fine.fbm(u * 9, v * 9, 2) - 0.5) * 0.012;
    out[z * M + x] = elevOf(b, h);
  }
  return out;
}

// what a spot offers, for the landing screen. Looks at the ground a base of N tiles would have
// a big section is sampled, not generated cell by cell: S x S points spread across it (counts are scaled back up)
export function survey(seed, biome, cx, cy, Nfull, S = 120) {
  const N = Math.min(Nfull, S), k = Nfull / N, b = BIOMES[biome], f = field(seed), terr = new Uint8Array(N * N), n = N * N, cnt = [0, 0, 0, 0, 0];
  const kk = SCALE * 0.9 / TPP * k;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const u = cx * SCALE * 0.9 + (x + 0.5 - N / 2) * kk, v = cy * SCALE * 0.9 + (z + 0.5 - N / 2) * kk; terr[z * N + x] = classify(b, f.h(u, v), f.dep(u, v)); }
  for (let i = 0; i < n; i++) cnt[terr[i]]++;
  cnt[3] = Math.round(cnt[3] * k * k); cnt[4] = Math.round(cnt[4] * k * k);
  // natural cover: how much of the ring round the landing zone is water or rock
  let ring = 0, rc = 0;
  for (let a = 0; a < 64; a++) for (const r of [16, 20, 24]) { const x = Math.round(N / 2 + Math.cos(a / 64 * Math.PI * 2) * r), z = Math.round(N / 2 + Math.sin(a / 64 * Math.PI * 2) * r); if (x < 0 || z < 0 || x >= N || z >= N) continue; rc++; if (terr[z * N + x] === 1 || terr[z * N + x] === 2) ring++; }
  const open = (cnt[0] + cnt[3] + cnt[4]) / n, cover = rc ? ring / rc : 0;
  return { open, water: cnt[1] / n, rock: cnt[2] / n, seeps: cnt[3], ore: cnt[4], cover,
    notes: [open > 0.8 ? 'Wide open ground: room to grow, little natural cover.' : open < 0.55 ? 'Cramped: water and rock limit how big the base can get.' : 'A fair amount of buildable ground.',
      cover > 0.35 ? 'Good natural defences: cliffs and water close much of the perimeter for free.' : cover > 0.15 ? 'Some natural cover on the approaches.' : 'Exposed on every side: the wall will be long.',
      cnt[3] ? `E-710 seeps (${cnt[3]} tiles): an Extractor can pump your own fuel.` : 'No E-710 under this ground.',
      cnt[4] ? `Ore fields (${cnt[4]} tiles): a Mine can dig your own supplies.` : 'No ore worth digging.',
      cnt[1] / n > 0.08 ? 'Water on site: nothing is built on it, but the shore is a wall you never pay for.' : ''].filter(Boolean) };
}

// what is at a region pixel (for placing operations on the map): k is a GROUND kind, h the height
const fields = new Map();
export function regionKind(seed, biome, x, y) {
  const b = BIOMES[biome]; let f = fields.get(seed); if (!f) { f = field(seed); fields.set(seed, f); }
  const u = x * SCALE * 0.9, v = y * SCALE * 0.9, h = f.h(u, v);
  return { k: classify(b, h, f.dep(u, v)), h };
}
// a name for a place out in the region, from what the ground is there
const PLACE = {
  desert: ['Saltpan', 'Dune', 'Scorch', 'Mesa', 'Dustbowl', 'Sunstrike'], steppe: ['Windgrass', 'Longsight', 'Barrow', 'Plainsman', 'Thistle', 'Greyfield'],
  ice: ['Frostbite', 'Glacier', 'Whiteout', 'Rime', 'Shiver', 'Hoarfrost'], jungle: ['Vinewall', 'Mire', 'Canopy', 'Rootknot', 'Fernshade', 'Greenhell'],
  ash: ['Cinder', 'Slag', 'Ember', 'Soot', 'Blackglass', 'Smoulder'],
};
const FEATURE = { 0: ['Flats', 'Hollow', 'Crossing', 'Plain', 'Basin', 'Draw'], 2: ['Ridge', 'Heights', 'Crags', 'Spur', 'Bluffs', 'Pass'], 3: ['Seep', 'Wells', 'Vents'], 4: ['Diggings', 'Lode', 'Quarry'], shore: ['Shore', 'Ford', 'Bank', 'Inlet'] };
export function placeName(biome, k, shore, r) {
  const a = PLACE[biome] || PLACE.steppe, f = FEATURE[shore ? 'shore' : k] || FEATURE[0];
  return `${a[Math.floor(r() * a.length)]} ${f[Math.floor(r() * f.length)]}`;
}
