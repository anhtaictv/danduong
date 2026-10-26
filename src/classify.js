// Phân loại văn bản: Naive Bayes, kNN, Decision Tree (ID3). docs = [[nhãn, văn bản], ...]

// Token = âm tiết + cặp âm tiết liền kề (tiếng Việt có nhiều từ ghép 2 âm tiết)
export function tokenize(text) {
  const s = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []
  return [...s, ...s.slice(1).map((w, i) => s[i] + '_' + w)]
}

const count = arr => arr.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map())
const majority = labels => [...count(labels)].sort((a, b) => b[1] - a[1])[0][0]

export function naiveBayes(docs) {
  const vocab = new Set(), byClass = new Map()
  for (const [y, text] of docs) {
    if (!byClass.has(y)) byClass.set(y, { n: 0, words: new Map(), total: 0 })
    const c = byClass.get(y); c.n++
    for (const w of tokenize(text)) { vocab.add(w); c.words.set(w, (c.words.get(w) || 0) + 1); c.total++ }
  }
  return text => {
    const toks = tokenize(text)
    let best, bs = -Infinity
    for (const [y, c] of byClass) {
      let s = Math.log(c.n / docs.length)
      for (const w of toks) s += Math.log(((c.words.get(w) || 0) + 1) / (c.total + vocab.size))
      if (s > bs) { bs = s; best = y }
    }
    return best
  }
}

export function knn(docs, k = 3) {
  const df = new Map()
  for (const [, t] of docs) for (const w of new Set(tokenize(t))) df.set(w, (df.get(w) || 0) + 1)
  const vec = text => {
    const v = new Map()
    for (const [w, tf] of count(tokenize(text))) v.set(w, tf * Math.log((docs.length + 1) / ((df.get(w) || 0) + 1)))
    const norm = Math.hypot(...v.values()) || 1
    for (const [w, x] of v) v.set(w, x / norm)
    return v
  }
  const train = docs.map(([y, t]) => [y, vec(t)])
  return text => {
    const q = vec(text)
    const sims = train.map(([y, v]) => {
      let s = 0
      for (const [w, x] of q) s += x * (v.get(w) || 0)
      return [s, y]
    }).sort((a, b) => b[0] - a[0]).slice(0, k)
    const votes = count(sims.map(x => x[1]))
    const top = Math.max(...votes.values())
    return sims.find(([, y]) => votes.get(y) === top)[1] // hoà phiếu → láng giềng gần nhất
  }
}

const entropy = labels => {
  let e = 0
  for (const c of count(labels).values()) { const p = c / labels.length; e -= p * Math.log2(p) }
  return e
}

// ID3 trên đặc trưng nhị phân "văn bản có chứa token w"
export function decisionTree(docs, maxDepth = 8) {
  const rows = docs.map(([y, t]) => ({ y, set: new Set(tokenize(t)) }))
  const df = count(rows.flatMap(r => [...r.set]))
  const features = [...df].filter(([, c]) => c >= 2).map(([w]) => w)

  const grow = (rows, depth) => {
    const ys = rows.map(r => r.y)
    const leaf = { label: majority(ys) }
    if (depth >= maxDepth || entropy(ys) === 0) return leaf
    let best = null, bestGain = 0
    const H = entropy(ys)
    for (const w of features) {
      const yes = rows.filter(r => r.set.has(w)), no = rows.filter(r => !r.set.has(w))
      if (!yes.length || !no.length) continue
      const gain = H - (yes.length * entropy(yes.map(r => r.y)) + no.length * entropy(no.map(r => r.y))) / rows.length
      if (gain > bestGain) { bestGain = gain; best = { w, yes, no } }
    }
    if (!best) return leaf
    return { ...leaf, word: best.w, yes: grow(best.yes, depth + 1), no: grow(best.no, depth + 1) }
  }
  const tree = grow(rows, 0)
  const predict = text => {
    const set = new Set(tokenize(text))
    let n = tree
    while (n.word) n = set.has(n.word) ? n.yes : n.no
    return n.label
  }
  predict.tree = tree
  return predict
}

export const CLASSIFIERS = { 'Naive Bayes': naiveBayes, kNN: knn, 'Decision Tree': decisionTree }

// Độ chính xác leave-one-out
export function looAccuracy(train, docs) {
  let ok = 0
  docs.forEach(([y, t], i) => { if (train(docs.filter((_, j) => j !== i))(t) === y) ok++ })
  return ok / docs.length
}

export function treeToText(n, indent = '') {
  if (!n.word) return `${indent}→ ${n.label}\n`
  const w = n.word.replace('_', ' ')
  return `${indent}có "${w}"?\n${indent}├ có:\n${treeToText(n.yes, indent + '│  ')}${indent}└ không:\n${treeToText(n.no, indent + '   ')}`
}
