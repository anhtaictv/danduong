// Các thuật toán tìm kiếm trên đồ thị g = { lat[], lon[], adj[] }, adj[u] = [[v, w], ...] (w: mét)

export function haversine(aLat, aLon, bLat, bLon) {
  const R = 6371000, r = Math.PI / 180
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

class Heap {
  a = []
  get size() { return this.a.length }
  push(p, v) {
    const a = this.a
    a.push([p, v])
    for (let i = a.length - 1; i > 0;) {
      const j = (i - 1) >> 1
      if (a[j][0] <= a[i][0]) break
      ;[a[i], a[j]] = [a[j], a[i]]; i = j
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop()
    if (a.length) {
      a[0] = last
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < a.length && a[l][0] < a[m][0]) m = l
        if (r < a.length && a[r][0] < a[m][0]) m = r
        if (m === i) break
        ;[a[i], a[m]] = [a[m], a[i]]; i = m
      }
    }
    return top[1]
  }
}

function trace(prev, s, t) {
  const p = [t]
  while (p[p.length - 1] !== s) p.push(prev[p[p.length - 1]])
  return p.reverse()
}

export function pathCost(g, path) {
  let c = 0
  for (let i = 1; i < path.length; i++)
    c += Math.min(...g.adj[path[i - 1]].filter(e => e[0] === path[i]).map(e => e[1]))
  return c
}

// tree: mảng phẳng [cha, con, cha, con...] theo thứ tự mở rộng, dùng để vẽ quá trình tìm kiếm
const result = (g, path, expanded, tree, extra) =>
  ({ path, cost: path ? pathCost(g, path) : Infinity, expanded, tree, ...extra })

export function bfs(g, s, t) {
  const n = g.adj.length, prev = new Int32Array(n).fill(-1), seen = new Uint8Array(n)
  const q = [s], tree = []; seen[s] = 1
  let expanded = 0
  for (let h = 0; h < q.length; h++) {
    const u = q[h]; expanded++
    if (prev[u] >= 0) tree.push(prev[u], u)
    if (u === t) return result(g, trace(prev, s, t), expanded, tree)
    for (const [v] of g.adj[u]) if (!seen[v]) { seen[v] = 1; prev[v] = u; q.push(v) }
  }
  return result(g, null, expanded, tree)
}

export function dfs(g, s, t) {
  const n = g.adj.length, prev = new Int32Array(n).fill(-1), done = new Uint8Array(n)
  const st = [[s, -1]], tree = []
  let expanded = 0
  while (st.length) {
    const [u, p] = st.pop()
    if (done[u]) continue
    done[u] = 1; prev[u] = p; expanded++
    if (p >= 0) tree.push(p, u)
    if (u === t) return result(g, trace(prev, s, t), expanded, tree)
    const nb = g.adj[u]
    for (let i = nb.length - 1; i >= 0; i--) if (!done[nb[i][0]]) st.push([nb[i][0], u])
  }
  return result(g, null, expanded, tree)
}

// DLS: DFS giới hạn độ sâu `limit` (số cạnh). Cho phép thăm lại đỉnh nếu đến được ở độ sâu nhỏ hơn.
// noTree: IDS bỏ ghi cây ở các vòng trung gian. Stack phẳng [đỉnh, độ sâu, ...] để khỏi tạo mảng con (vòng lặp nóng của IDS).
// Danh sách kề dạng phẳng (CSR): láng giềng của u là to[off[u] .. off[u+1]), tạo 1 lần cho mỗi đồ thị
const csrCache = new WeakMap()
function csr(g) {
  let c = csrCache.get(g)
  if (c) return c
  const n = g.adj.length, off = new Int32Array(n + 1)
  for (let u = 0; u < n; u++) off[u + 1] = off[u] + g.adj[u].length
  const to = new Int32Array(off[n])
  for (let u = 0; u < n; u++) g.adj[u].forEach((e, i) => { to[off[u] + i] = e[0] })
  csrCache.set(g, c = { off, to })
  return c
}

export function dls(g, s, t, limit, noTree) {
  const n = g.adj.length, { off, to } = csr(g), prev = new Int32Array(n).fill(-1), best = new Int32Array(n).fill(0x7fffffff)
  const st = [s, 0], tree = []; best[s] = 0
  let expanded = 0, cutoff = false
  while (st.length) {
    const d = st.pop(), u = st.pop()
    if (d > best[u]) continue
    expanded++
    if (!noTree && prev[u] >= 0) tree.push(prev[u], u)
    if (u === t) return noTree ? { found: true, expanded } : result(g, trace(prev, s, t), expanded, tree, { cutoff })
    if (d === limit) { cutoff = true; continue }
    for (let i = off[u], end = off[u + 1]; i < end; i++) {
      const v = to[i]
      if (d + 1 < best[v]) { best[v] = d + 1; prev[v] = u; st.push(v, d + 1) }
    }
  }
  return noTree ? { found: false, cutoff, expanded } : result(g, null, expanded, tree, { cutoff })
}

// ponytail: IDS tăng limit từng bước 1, O(depth × E); đủ cho phạm vi quận/huyện
export function ids(g, s, t, maxDepth = 5000) {
  let expanded = 0
  for (let limit = 0; limit <= maxDepth; limit++) {
    const r = dls(g, s, t, limit, true)
    expanded += r.expanded
    if (r.found || !r.cutoff) return { ...dls(g, s, t, limit), expanded, depth: limit } // chạy lại vòng cuối để lấy path + tree
  }
  return result(g, null, expanded, [])
}

function bestFirst(g, s, t, f) {
  const n = g.adj.length, prev = new Int32Array(n).fill(-1), dist = new Float64Array(n).fill(Infinity)
  const done = new Uint8Array(n), pq = new Heap()
  dist[s] = 0; pq.push(f(0, s), s)
  let expanded = 0
  const tree = []
  while (pq.size) {
    const u = pq.pop()
    if (done[u]) continue
    done[u] = 1; expanded++
    if (prev[u] >= 0) tree.push(prev[u], u)
    if (u === t) return result(g, trace(prev, s, t), expanded, tree)
    for (const [v, w] of g.adj[u]) {
      const nd = dist[u] + w
      if (!done[v] && nd < dist[v]) { dist[v] = nd; prev[v] = u; pq.push(f(nd, v), v) }
    }
  }
  return result(g, null, expanded, tree)
}

const h = (g, t) => v => haversine(g.lat[v], g.lon[v], g.lat[t], g.lon[t])

export const ucs = (g, s, t) => bestFirst(g, s, t, gc => gc)
export const astar = (g, s, t) => { const H = h(g, t); return bestFirst(g, s, t, (gc, v) => gc + H(v)) }
export const greedy = (g, s, t) => { const H = h(g, t); return bestFirst(g, s, t, (_, v) => H(v)) }

export const ALGORITHMS = {
  BFS: bfs,
  DFS: dfs,
  DLS: (g, s, t, o) => dls(g, s, t, o.limit),
  IDS: (g, s, t) => ids(g, s, t),
  UCS: ucs,
  'A*': astar,
  'Greedy Best-First': greedy,
}
