// Chạy thuật toán ở luồng riêng để giao diện không bị đơ (IDS có thể mất hàng chục giây)
import { ALGORITHMS, pathCost } from './search.js'
import { timeGraph } from './graph.js'

onmessage = ({ data: { g, s, t, limit, w, byTime } }) => {
  const G = byTime ? timeGraph(g) : g // cost theo giây hoặc mét; dist luôn là mét
  // IDS chậm nhất → chạy cuối để các thuật toán khác hiện kết quả trước
  const names = Object.keys(ALGORITHMS).sort((a, b) => (a === 'IDS') - (b === 'IDS'))
  for (const name of names) {
    try {
      const t0 = performance.now()
      const r = ALGORITHMS[name](G, s, t, { limit, w })
      const ms = performance.now() - t0
      const tree = Int32Array.from(r.tree)
      postMessage({ name, r: { ...r, tree, ms, dist: r.path ? pathCost(g, r.path) : Infinity } }, [tree.buffer])
    } catch (e) {
      return postMessage({ name, error: e?.message || String(e) }) // gửi lỗi thật về giao diện
    }
  }
  postMessage({ done: true })
}
