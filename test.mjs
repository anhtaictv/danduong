// node test.mjs — kiểm tra thuật toán tìm đường và phân loại
import assert from 'node:assert'
import { ALGORITHMS } from './src/search.js'
import { buildGraph, nearest } from './src/graph.js'
import { CLASSIFIERS, looAccuracy } from './src/classify.js'
import { DOCS } from './src/docs.js'

// Lưới 4x4, đường chéo dài 0-5-10-15 hai chiều; đường 0→3 một chiều
const nodes = [], ways = []
for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) nodes.push({ type: 'node', id: r * 4 + c, lat: 21 + r * 0.001, lon: 105 + c * 0.001 })
for (let r = 0; r < 4; r++) ways.push({ type: 'way', nodes: [0, 1, 2, 3].map(c => r * 4 + c), tags: r === 0 ? { oneway: 'yes' } : {} })
for (let c = 0; c < 4; c++) ways.push({ type: 'way', nodes: [0, 1, 2, 3].map(r => r * 4 + c), tags: {} })
// Đoạn đường lẻ 100-101 sát nút 15 nhưng không nối vào lưới → không được ghim vào
nodes.push({ type: 'node', id: 100, lat: 21.0031, lon: 105.0031 }, { type: 'node', id: 101, lat: 21.0032, lon: 105.0032 })
ways.push({ type: 'way', nodes: [100, 101], tags: {} })
const g = buildGraph([...nodes, ...ways])
const id = n => g.lat.findIndex((la, i) => la === nodes[n].lat && g.lon[i] === nodes[n].lon)
const s = id(0), t = id(15), back = id(3)
assert.equal(nearest(g, 21.0031, 105.0031), t)

const opt = ALGORITHMS.UCS(g, s, t).cost
for (const [name, f] of Object.entries(ALGORITHMS)) {
  const r = f(g, s, t, { limit: 10 })
  assert(r.path && r.path[0] === s && r.path.at(-1) === t, name + ' không tìm thấy đường')
  if (['UCS', 'A*'].includes(name)) assert(Math.abs(r.cost - opt) < 1e-6, name + ' không tối ưu')
  assert(r.cost >= opt - 1e-6)
}
assert.equal(ALGORITHMS.DLS(g, s, t, { limit: 5 }).path, null) // cần 6 cạnh
assert.equal(ALGORITHMS.IDS(g, s, t).depth, 6)
assert.notDeepEqual(ALGORITHMS.UCS(g, back, s).path, [back, id(2), id(1), s]) // một chiều: không đi ngược hàng 0

for (const [name, train] of Object.entries(CLASSIFIERS)) {
  const acc = looAccuracy(train, DOCS)
  console.log(name, 'LOO accuracy', acc.toFixed(2))
  assert(acc > 0.4, name)
}
assert.equal(CLASSIFIERS['Naive Bayes'](DOCS)('cầu thủ ghi bàn trong trận đấu'), 'Thể thao')
console.log('OK')
