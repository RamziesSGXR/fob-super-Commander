// Road-aware pathfinding on the base grid, shared by the simulation (trucks and forklifts) and the ant farm (people).
// A step costs its length divided by how fast you go on that tile, so routes bend toward roads when roads help.
// A* with a typed-array heap and buffers kept between calls: hundreds of people re-route every phase change, so
// nothing here allocates per call except the finished path.

let size = 0, cost, prev, seen, heapN, heapC, stamp = 0;
function buffers(n) {
  if (n === size) return;
  size = n; cost = new Float32Array(n); prev = new Int32Array(n); seen = new Uint32Array(n);
  heapN = new Int32Array(65536); heapC = new Float32Array(65536);   // grows as a search needs it
}
function heapRoom(len) { if (len < heapN.length) return; const a = new Int32Array(heapN.length * 2), b = new Float32Array(heapN.length * 2); a.set(heapN); b.set(heapC); heapN = a; heapC = b; }
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1], LEN = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

// walk: 1 where you can go. roads: 0 none, 1 dirt, 2 paved. fast: speed multiplier for each road type.
export function findPath(N, walk, roads, fast, sx, sz, ex, ez) {
  const start = sz * N + sx, end = ez * N + ex;
  if (start === end) return [];
  buffers(N * N);
  if (++stamp === 0xffffffff) { seen.fill(0); stamp = 1; }
  const top = Math.max(...fast);   // keeps the estimate optimistic, so the route is still the cheapest
  const h = n => { const dx = Math.abs(n % N - ex), dz = Math.abs(((n / N) | 0) - ez); return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) / top; };
  let len = 0;
  const push = (n, c) => {
    heapRoom(len + 1); let i = len++;
    while (i > 0) { const p = (i - 1) >> 1; if (heapC[p] <= c) break; heapN[i] = heapN[p]; heapC[i] = heapC[p]; i = p; }
    heapN[i] = n; heapC[i] = c;
  };
  const pop = () => {
    const n = heapN[0], ln = heapN[--len], lc = heapC[len];
    let i = 0;
    for (;;) { const l = 2 * i + 1; if (l >= len) break; const r = l + 1, m = r < len && heapC[r] < heapC[l] ? r : l; if (heapC[m] >= lc) break; heapN[i] = heapN[m]; heapC[i] = heapC[m]; i = m; }
    heapN[i] = ln; heapC[i] = lc;
    return n;
  };
  seen[start] = stamp; cost[start] = 0; prev[start] = -1; push(start, h(start));
  let found = false;
  while (len) {
    if (len >= heapN.length - 8) break;   // never happens on a sane grid; a guard rather than a crash
    const n = pop(); if (n === end) { found = true; break; }
    const c = cost[n], cx = n % N, cz = (n / N) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k], nz = cz + DZ[k]; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const m = nz * N + nx; if (!walk[m] && m !== end) continue;
      if (k > 3 && (!walk[cz * N + nx] || !walk[nz * N + cx])) continue;   // no cutting corners
      const nc = c + LEN[k] / ((fast[roads[n]] + fast[roads[m]]) / 2);
      if (seen[m] !== stamp || nc < cost[m]) { seen[m] = stamp; cost[m] = nc; prev[m] = n; push(m, nc + h(m)); }
    }
  }
  if (!found) return null;
  const out = []; for (let n = end; n !== start; n = prev[n]) out.push([n % N + 0.5, ((n / N) | 0) + 0.5]);
  return out.reverse();
}
