// Chạy thuật toán ở luồng riêng để giao diện không bị đơ (IDS có thể mất hàng chục giây)
import { ALGORITHMS } from './search.js'

onmessage = ({ data: { g, s, t, limit } }) => {
  // IDS chậm nhất → chạy cuối để các thuật toán khác hiện kết quả trước
  const names = Object.keys(ALGORITHMS).sort((a, b) => (a === 'IDS') - (b === 'IDS'))
  for (const name of names) {
    const t0 = performance.now()
    const r = ALGORITHMS[name](g, s, t, { limit })
    const tree = Int32Array.from(r.tree)
    postMessage({ name, r: { ...r, tree, ms: performance.now() - t0 } }, [tree.buffer])
  }
  postMessage({ done: true })
}
