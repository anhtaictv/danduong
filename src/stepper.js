// Chạy thuật toán từng bước trên đồ thị nhỏ, ghi lại tập biên (Open) và tập đã xét (Closed) sau mỗi bước.
// Cùng quy tắc với search.js (đếm đỉnh mở rộng, lazy deletion, DLS thăm lại đỉnh nếu nông hơn).
// Dùng cho tab "Từng bước" và để sinh bảng chạy tay trong báo cáo.

// x, y: toạ độ vẽ; h: ước lượng chi phí đến G (chấp nhận được và nhất quán)
export const SMALL = {
  nodes: { S: [50, 150, 5], A: [170, 50, 5], B: [230, 160, 4], C: [150, 260, 7], D: [330, 50, 3], E: [340, 270, 8], G: [450, 150, 0] },
  // thứ tự cạnh = thứ tự láng giềng khi duyệt
  edges: [['S', 'C', 2], ['S', 'A', 1], ['S', 'B', 4], ['A', 'D', 2], ['C', 'E', 3], ['B', 'G', 5], ['D', 'G', 3], ['E', 'G', 9]],
}

export const STEP_ALGOS = ['BFS', 'DFS', 'DLS', 'IDS', 'UCS', 'A*', 'Weighted A*', 'Greedy Best-First']

export function runSteps(algo, { s = 'S', t = 'G', limit = 2, w = 2 } = {}, G = SMALL) {
  const adj = {}
  for (const n in G.nodes) adj[n] = []
  for (const [a, b, c] of G.edges) { adj[a].push([b, c]); adj[b].push([a, c]) }
  const H = n => G.nodes[n][2]
  const steps = []
  let expanded = 0

  // Một bước = lấy 1 đỉnh ra khỏi Open. tree: các cạnh (cha, con) đã mở rộng tới lúc đó
  const snap = (u, open, closed, tree, note, iter) =>
    steps.push({ u, open: open.map(o => ({ ...o })), closed: [...closed], tree: [...tree], note, iter })
  const pathOf = (prev, u) => { const p = [u]; while (prev[p[0]] !== undefined) p.unshift(prev[p[0]]); return p }
  const costOf = p => p.slice(1).reduce((c, v, i) => c + adj[p[i]].find(e => e[0] === v)[1], 0)
  const finish = path => ({ steps, path, cost: path ? costOf(path) : Infinity, expanded })
  const names = list => list.map(e => e[0]).join(', ')

  if (algo === 'BFS') {
    const open = [{ n: s, g: 0, d: 0 }], seen = new Set([s]), closed = [], tree = [], prev = {}
    while (open.length) {
      const o = open.shift(), u = o.n
      expanded++; closed.push(u); if (prev[u] !== undefined) tree.push([prev[u], u])
      if (u === t) { snap(u, open, closed, tree, `Lấy ${u} ra: là đích, dừng.`); return finish(pathOf(prev, u)) }
      const add = adj[u].filter(([v]) => !seen.has(v))
      for (const [v, c] of add) { seen.add(v); prev[v] = u; open.push({ n: v, g: o.g + c, d: o.d + 1 }) }
      snap(u, open, closed, tree, `Lấy ${u} ra khỏi đầu hàng đợi; ${add.length ? 'thêm vào cuối: ' + names(add) : 'không có đỉnh mới'}.`)
    }
    return finish(null)
  }

  if (algo === 'DFS') {
    const open = [{ n: s, g: 0, d: 0 }], done = new Set(), closed = [], tree = [], prev = {}
    while (open.length) {
      const o = open.shift(), u = o.n // phần tử đầu mảng = đỉnh ngăn xếp
      if (done.has(u)) continue
      done.add(u); expanded++; closed.push(u)
      if (o.p !== undefined) { prev[u] = o.p; tree.push([o.p, u]) }
      if (u === t) { snap(u, open, closed, tree, `Lấy ${u} ra: là đích, dừng.`); return finish(pathOf(prev, u)) }
      const add = adj[u].filter(([v]) => !done.has(v))
      open.unshift(...add.map(([v, c]) => ({ n: v, g: o.g + c, d: o.d + 1, p: u })))
      snap(u, open, closed, tree, `Lấy ${u} ra khỏi đỉnh ngăn xếp; ${add.length ? 'đẩy vào: ' + names(add) + ` (${add[0][0]} nằm trên cùng)` : 'không có đỉnh mới, quay lui'}.`)
    }
    return finish(null)
  }

  // DLS: trả về { found, cutoff, path }; ids dùng lại với nhãn vòng lặp
  const dls = (l, iter) => {
    const open = [{ n: s, g: 0, d: 0 }], best = { [s]: 0 }, closed = [], tree = [], prev = {}
    let cutoff = false
    while (open.length) {
      const o = open.shift(), u = o.n
      if (o.d > best[u]) continue
      expanded++; closed.push(u)
      if (o.p !== undefined) { prev[u] = o.p; tree.push([o.p, u]) }
      if (u === t) { snap(u, open, closed, tree, `Lấy ${u} (độ sâu ${o.d}) ra: là đích, dừng.`, iter); return { found: true, path: pathOf(prev, u) } }
      if (o.d === l) { cutoff = true; snap(u, open, closed, tree, `Lấy ${u} ra: độ sâu ${o.d} = giới hạn ${l}, không mở rộng (cắt).`, iter); continue }
      const add = adj[u].filter(([v]) => o.d + 1 < (best[v] ?? Infinity))
      for (const [v] of add) best[v] = o.d + 1
      open.unshift(...add.map(([v, c]) => ({ n: v, g: o.g + c, d: o.d + 1, p: u })))
      snap(u, open, closed, tree, `Lấy ${u} (độ sâu ${o.d}) ra; ${add.length ? 'đẩy vào: ' + names(add) : 'không có đỉnh mới, quay lui'}.`, iter)
    }
    return { found: false, cutoff, path: null }
  }

  if (algo === 'DLS') {
    const r = dls(limit)
    if (!r.found) steps.at(-1).note += r.cutoff ? ` Hết ngăn xếp: không tìm thấy trong giới hạn ${limit}.` : ' Hết ngăn xếp: không có đường.'
    return finish(r.path)
  }

  if (algo === 'IDS') {
    for (let l = 0; ; l++) {
      const r = dls(l, l)
      if (r.found) return finish(r.path)
      steps.at(-1).note += ` Kết thúc vòng l = ${l}: không thấy đích` + (r.cutoff ? ', tăng giới hạn.' : ', không còn đỉnh bị cắt, dừng.')
      if (!r.cutoff) return finish(null)
    }
  }

  // Best-first: UCS f = g, A* f = g + h, Weighted A* f = g + w·h, Greedy f = h
  const F = { UCS: (g, h) => g, 'A*': (g, h) => g + h, 'Weighted A*': (g, h) => g + w * h, 'Greedy Best-First': (g, h) => h }[algo]
  if (!F) throw new Error('Thuật toán không hỗ trợ: ' + algo)
  const open = [{ n: s, g: 0, h: H(s), f: F(0, H(s)) }], dist = { [s]: 0 }, done = new Set(), closed = [], tree = [], prev = {}
  let skipped = []
  while (open.length) {
    let k = 0 // f nhỏ nhất, hoà thì lấy bản ghi vào trước
    for (let i = 1; i < open.length; i++) if (open[i].f < open[k].f) k = i
    const [o] = open.splice(k, 1), u = o.n
    if (done.has(u)) { skipped.push(u); continue }
    done.add(u); expanded++; closed.push(u); if (prev[u] !== undefined) tree.push([prev[u], u])
    const pre = skipped.length ? `Bỏ qua bản ghi cũ của ${skipped.join(', ')}. ` : ''
    skipped = []
    if (u === t) { snap(u, open, closed, tree, `${pre}Lấy ${u} (f = ${fmt(o.f)}) ra: là đích, dừng.`); return finish(pathOf(prev, u)) }
    const add = []
    for (const [v, c] of adj[u]) {
      const g = dist[u] + c
      if (!done.has(v) && g < (dist[v] ?? Infinity)) {
        add.push(v + (dist[v] !== undefined ? ` (cập nhật g ${fmt(dist[v])} → ${fmt(g)})` : ''))
        dist[v] = g; prev[v] = u; open.push({ n: v, g, h: H(v), f: F(g, H(v)) })
      }
    }
    snap(u, open, closed, tree, `${pre}Lấy ${u} (f = ${fmt(o.f)}) ra; ${add.length ? 'thêm: ' + add.join(', ') : 'không có đỉnh mới hoặc đường tốt hơn'}.`)
  }
  return finish(null)
}

const fmt = x => +x.toFixed(2) + ''

// Open dạng chữ cho bảng: hàng đợi/ngăn xếp ghi theo thứ tự lấy ra; best-first ghi kèm g, h, f
export function openText(algo, open, w = 2) {
  if (['BFS', 'DFS', 'DLS', 'IDS'].includes(algo))
    return open.map(o => algo === 'BFS' || algo === 'DFS' ? o.n : `${o.n}(d=${o.d})`).join(', ') || '∅'
  return [...open].sort((a, b) => a.f - b.f).map(o =>
    algo === 'UCS' ? `${o.n}(g=${fmt(o.g)})`
      : algo === 'Greedy Best-First' ? `${o.n}(h=${fmt(o.h)})`
        : `${o.n}(${fmt(o.g)}+${algo === 'A*' ? '' : w + '×'}${fmt(o.h)}=${fmt(o.f)})`).join(', ') || '∅'
}
