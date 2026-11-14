// Roads and walls share one network of nodes and straight segments, drawn freely like a city builder.
// Segments are turned into tiles for walking, driving and building: roads mark their tiles with a surface, walls block
// theirs, and where a road crosses a wall the tile becomes a gate. Whatever the walls fully enclose is the base.
//
// A segment: { id, a, b, k: 'dirt' | 'paved' | 'wall', w } where a and b are node ids and w is its width in tiles.
// Coordinates are in tiles, so the centre of tile (i, j) is (i + 0.5, j + 0.5).

export const KINDS = {
  dirt:  { name: 'Dirt Road', w: 1, surf: 1 },
  paved: { name: 'Paved Road', w: 2, surf: 2 },
  bridge: { name: 'Bridge', w: 2, surf: 2 },   // a paved deck on piers: spans water, ravines and rough ground
  wall:  { name: 'Wall', w: 1, surf: 0 },
};
const REACH = 0.22;   // tiles within half the width plus this of the centreline belong to a segment (keeps diagonals 4-connected)

export function emptyNet() { return { nodes: [], segs: [], nid: 1 }; }
export const node = (net, id) => net.nodes.find(n => n.id === id);
export function segLen(net, s) { const a = node(net, s.a), b = node(net, s.b); return Math.hypot(b.x - a.x, b.z - a.z); }

function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  return { d: Math.hypot(px - ax - t * dx, pz - az - t * dz), t };
}

// the tiles a line of a given width covers
export function lineTiles(N, ax, az, bx, bz, w) {
  const r = w / 2 + REACH, out = [];
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(N - 1, Math.floor(Math.max(ax, bx) + r));
  const z0 = Math.max(0, Math.floor(Math.min(az, bz) - r)), z1 = Math.min(N - 1, Math.floor(Math.max(az, bz) + r));
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (distSeg(x + 0.5, z + 0.5, ax, az, bx, bz).d <= r) out.push([x, z]);
  return out;
}

// Snapping. grid: ends on tile centres (or tile edges for even widths, so a 2-wide road covers exactly two tiles);
// 45: the direction from the start is held to multiples of 45 degrees and the length to whole tiles; free: no snapping.
// Existing nodes and segments always pull the end onto them, so roads join up.
export function snap(net, p, mode, w, from) {
  const near = net.nodes.map(n => [n, Math.hypot(n.x - p.x, n.z - p.z)]).filter(([, d]) => d < 0.8).sort((a, b) => a[1] - b[1])[0];
  if (near) return { x: near[0].x, z: near[0].z, node: near[0].id };
  let x = p.x, z = p.z;
  const g = v => w % 2 ? Math.floor(v) + 0.5 : Math.round(v);
  if (mode === '45' && from) {
    const dx = x - from.x, dz = z - from.z, ang = Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const diag = Math.abs(Math.round(Math.cos(ang))) && Math.abs(Math.round(Math.sin(ang)));
    const step = diag ? Math.SQRT2 : 1, len = Math.max(1, Math.round(Math.hypot(dx, dz) / step)) * step;
    x = from.x + Math.cos(ang) * len; z = from.z + Math.sin(ang) * len;
    x = Math.round(x * 2) / 2; z = Math.round(z * 2) / 2;
  } else if (mode !== 'free') { x = g(x); z = g(z); }
  // onto an existing segment: a T-junction
  let best = null;
  for (const s of net.segs) {
    const a = node(net, s.a), b = node(net, s.b), r = distSeg(x, z, a.x, a.z, b.x, b.z);
    if (r.d < 0.6 && r.t > 0.02 && r.t < 0.98 && (!best || r.d < best.d)) best = { d: r.d, seg: s.id, x: a.x + (b.x - a.x) * r.t, z: a.z + (b.z - a.z) * r.t };
  }
  if (best) return { x: best.x, z: best.z, seg: best.seg };
  return { x, z };
}

function addNode(net, x, z) {
  const n = net.nodes.find(n => Math.hypot(n.x - x, n.z - z) < 0.05); if (n) return n.id;
  const id = net.nid++; net.nodes.push({ id, x, z }); return id;
}
function split(net, segId, x, z) {
  const s = net.segs.find(s => s.id === segId); if (!s) return addNode(net, x, z);
  const m = addNode(net, x, z);
  net.segs = net.segs.filter(o => o !== s);
  net.segs.push({ ...s, id: net.nid++, b: m }, { ...s, id: net.nid++, a: m });
  return m;
}
function endpoint(net, p) { return p.node ?? (p.seg ? split(net, p.seg, p.x, p.z) : addNode(net, p.x, p.z)); }

// adds a line between two snapped points; returns the new segment
export function addLine(net, p, q, k, w = KINDS[k].w) {
  const a = endpoint(net, p), b = endpoint(net, q);
  if (a === b) return null;
  const s = { id: net.nid++, a, b, k, w }; net.segs.push(s); return s;
}
export function nearestSeg(net, x, z, max = 0.9) {
  let best = null;
  for (const s of net.segs) { const a = node(net, s.a), b = node(net, s.b), r = distSeg(x, z, a.x, a.z, b.x, b.z); if (r.d < Math.max(max, s.w / 2 + 0.3) && (!best || r.d < best.d)) best = { d: r.d, s }; }
  return best?.s || null;
}
export function removeSeg(net, id) {
  net.segs = net.segs.filter(s => s.id !== id);
  const used = new Set(net.segs.flatMap(s => [s.a, s.b])); net.nodes = net.nodes.filter(n => used.has(n.id));
}

// tiles from the network: roads (surface 1 dirt, 2 paved), walls (1 wall, 2 gate) and the enclosed base
// win: [x0, z0, x1, z1), the part of the map that matters (your land and a margin); outside it nothing is inside
export function raster(net, N, block = null, win = null) {
  const roads = new Uint8Array(N * N), walls = new Uint8Array(N * N), inside = new Uint8Array(N * N);
  const [X0, Z0, X1, Z1] = win || [0, 0, N, N], each = f => { for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++) f(z * N + x, x, z); };
  for (const s of net.segs) {
    const a = node(net, s.a), b = node(net, s.b);
    for (const [x, z] of lineTiles(N, a.x, a.z, b.x, b.z, s.w)) {
      const i = z * N + x;
      if (s.k === 'wall') walls[i] = 1; else roads[i] = Math.max(roads[i], KINDS[s.k].surf);
    }
  }
  each(i => { if (walls[i] && roads[i]) walls[i] = 2; });   // a road through a wall is a gate
  // flood in from the map edge; what it can't reach, walls and gates aside, is inside
  const out = new Uint8Array(N * N), stack = [];
  const shut = i => walls[i] || (block && block[i] && !roads[i]);   // water and rock shut the base in like a wall, unless a road bridges them
  const seed = i => { if (!out[i] && !shut(i)) { out[i] = 1; stack.push(i); } };
  for (let x = X0; x < X1; x++) { seed(Z0 * N + x); seed((Z1 - 1) * N + x); }
  for (let z = Z0; z < Z1; z++) { seed(z * N + X0); seed(z * N + X1 - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % N, z = (i / N) | 0;
    if (x > X0) seed(i - 1); if (x < X1 - 1) seed(i + 1); if (z > Z0) seed(i - N); if (z < Z1 - 1) seed(i + N);
  }
  // what the flood can't reach is inside, but only a pocket a wall helps close: ground ringed by nothing but water and
  // rock is just a pocket of land, not a base
  let n = 0; const met = new Uint8Array(N * N);
  for (let z0 = Z0; z0 < Z1; z0++) for (let x0 = X0; x0 < X1; x0++) {
    const i0 = z0 * N + x0;
    if (out[i0] || shut(i0) || met[i0]) continue;
    const comp = [i0]; met[i0] = 1; let walled = false;
    for (let h = 0; h < comp.length; h++) {
      const i = comp[h], x = i % N, z = (i / N) | 0;
      for (const j of [x > X0 ? i - 1 : -1, x < X1 - 1 ? i + 1 : -1, z > Z0 ? i - N : -1, z < Z1 - 1 ? i + N : -1]) {
        if (j < 0) continue;
        if (walls[j]) walled = true;
        if (!out[j] && !shut(j) && !met[j]) { met[j] = 1; comp.push(j); }
      }
    }
    if (walled) for (const i of comp) { inside[i] = 1; n++; }
  }
  // gates: clusters of gate tiles
  const gates = [], seen = new Uint8Array(N * N);
  each(i => { if (walls[i] !== 2 || seen[i]) return;
    const q = [i], tiles = []; seen[i] = 1;
    while (q.length) { const j = q.pop(); tiles.push(j); for (const d of [1, -1, N, -N]) { const k = j + d; if (k >= 0 && k < N * N && walls[k] === 2 && !seen[k]) { seen[k] = 1; q.push(k); } } }
    const x = tiles.reduce((a, j) => a + j % N, 0) / tiles.length + 0.5, z = tiles.reduce((a, j) => a + ((j / N) | 0), 0) / tiles.length + 0.5;
    gates.push({ x, z, tiles });
  });
  return { roads, walls, inside, gates, area: n };
}
