// Road-aware pathfinding on the base grid, shared by the simulation (trucks and forklifts) and the ant farm (people).
// A step costs its length divided by how fast you go on that tile, so routes bend toward roads when roads help.

// walk: 1 where you can go. roads: 0 none, 1 dirt, 2 paved. fast: speed multiplier for each road type.
export function findPath(N, walk, roads, fast, sx, sz, ex, ez) {
  const start = sz * N + sx, end = ez * N + ex;
  if (start === end) return [];
  const cost = new Float32Array(N * N).fill(Infinity), prev = new Int32Array(N * N).fill(-1), heap = [];
  const push = (n, c) => { heap.push([c, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } }
    return top;
  };
  cost[start] = 0; push(start, 0);
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (heap.length) {
    const [c, n] = pop(); if (n === end) break; if (c > cost[n]) continue;
    const cx = n % N, cz = (n / N) | 0;
    for (const [dx, dz, len] of D) {
      const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const m = nz * N + nx; if (!walk[m] && m !== end) continue;
      if (dx && dz && (!walk[cz * N + nx] || !walk[nz * N + cx])) continue;   // no cutting corners
      const sp = (fast[roads[n]] + fast[roads[m]]) / 2, nc = c + len / sp;
      if (nc < cost[m]) { cost[m] = nc; prev[m] = n; push(m, nc); }
    }
  }
  if (prev[end] < 0) return null;
  const out = []; for (let n = end; n !== start; n = prev[n]) out.push([n % N + 0.5, ((n / N) | 0) + 0.5]);
  return out.reverse();
}
