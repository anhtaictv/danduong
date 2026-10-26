// Lấy dữ liệu đường bộ GIS từ OpenStreetMap (Overpass API) và dựng đồ thị
import { haversine } from './search.js'

const MAJOR = 'motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link'
export const ALL = MAJOR + '|unclassified|residential|living_street'
const MAJOR_RE = new RegExp(`^(${MAJOR})$`)

// Vùng tải sẵn (scripts/prefetch.mjs → public/osm-bmt.json): [s, w, n, e]
export const BMT_BBOX = [12.55, 107.9, 12.8, 108.2]
const inside = ([s, w, n, e], [S, W, N, E]) => s >= S && w >= W && n <= N && e <= E

// Máy chủ hay quá tải (502/504) hoặc bị chặn mạng → thử lần lượt, máy chạy được lần trước thử trước
const SERVERS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

export async function overpass([s, w, n, e], filter = ALL, headers = {}) {
  const q = `[out:json][timeout:180];way["highway"~"^(${filter})$"](${s},${w},${n},${e});(._;>;);out body;`
  let res, err
  // 2 vòng: lỗi 502/504 thường chỉ thoáng qua
  for (let round = 0; round < 2 && !res; round++) {
    if (round) await new Promise(r => setTimeout(r, 3000))
    for (const url of [...SERVERS]) {
      try {
        res = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: 'data=' + encodeURIComponent(q),
          signal: AbortSignal.timeout(90_000), // có máy chủ treo vài phút mới trả lỗi
        })
        if (res.ok) { SERVERS.splice(SERVERS.indexOf(url), 1); SERVERS.unshift(url); break }
        err = new Error('Overpass lỗi ' + res.status)
      } catch (e) { err = new Error('Overpass không kết nối được: ' + e.message) }
      res = null
    }
  }
  if (!res) throw err
  // Chỉ giữ những trường buildGraph cần để lưu cho nhẹ
  return (await res.json()).elements.map(el => el.type === 'node'
    ? { type: 'node', id: el.id, lat: +el.lat.toFixed(6), lon: +el.lon.toFixed(6) }
    : { type: 'way', id: el.id, nodes: el.nodes, tags: { highway: el.tags.highway, oneway: el.tags.oneway, junction: el.tags.junction } })
}

// --- Ô bản đồ 0.1° (~11 km) tải ngầm, lưu trong Cache Storage (còn sau khi tải lại trang) ---
const TILE = 0.1
const tileBox = ([i, j]) => [i * TILE, j * TILE, (i + 1) * TILE, (j + 1) * TILE]
const tileUrl = ([i, j]) => `/osm-tile/${i}_${j}`
const tilesOf = ([s, w, n, e]) => {
  const r = []
  for (let i = Math.floor(s / TILE); i <= Math.floor(n / TILE); i++)
    for (let j = Math.floor(w / TILE); j <= Math.floor(e / TILE); j++) r.push([i, j])
  return r
}
const store = () => caches.open('osm-tiles')
let local // promise các phần tử của file tải sẵn, chỉ đọc 1 lần
const loadLocal = () => (local ??= fetch('/osm-bmt.json')
  .then(r => r.ok ? r.json() : Promise.reject(new Error('Không có file tải sẵn')))
  .catch(e => { local = null; throw e }))

let want = [], running = false
// Tải ngầm các ô còn thiếu trong vùng bbox. Gọi lại khi đổi vùng nhìn sẽ thay danh sách chờ.
export async function prefetchTiles(bbox, onProgress) {
  const c = await store(), missing = []
  for (const t of tilesOf(bbox))
    if (!inside(tileBox(t), BMT_BBOX) && !(await c.match(tileUrl(t)))) missing.push(t)
  // ô gần giữa vùng nhìn tải trước
  const ci = (bbox[0] + bbox[2]) / 2 / TILE, cj = (bbox[1] + bbox[3]) / 2 / TILE
  want = missing.sort((p, q) => Math.hypot(p[0] + .5 - ci, p[1] + .5 - cj) - Math.hypot(q[0] + .5 - ci, q[1] + .5 - cj))
  if (running) return
  running = true
  try {
    while (want.length) {
      onProgress?.(want.length)
      const t = want.shift()
      try {
        await c.put(tileUrl(t), new Response(JSON.stringify(await overpass(tileBox(t)))))
      } catch { await new Promise(r => setTimeout(r, 5000)) } // Overpass bận: bỏ qua, lần sau thử lại
    }
  } finally { running = false; onProgress?.(0) }
}

// Lấy phần tử từ file tải sẵn + các ô đã cache; null nếu còn thiếu ô nào
async function fromCache(bbox) {
  const c = await store(), parts = new Set()
  for (const t of tilesOf(bbox)) {
    if (inside(tileBox(t), BMT_BBOX)) {
      try { parts.add(await loadLocal()) } catch { return null }
      continue
    }
    const r = await c.match(tileUrl(t))
    if (!r) return null
    parts.add(await r.json())
  }
  // Đường cắt qua nhiều ô bị trùng → bỏ trùng theo id
  const seen = new Set(), out = []
  for (const p of parts) for (const el of p) {
    const k = el.type[0] + el.id
    if (!seen.has(k)) { seen.add(k); out.push(el) }
  }
  return out
}

// majorOnly: chỉ lấy quốc lộ/tỉnh lộ khi vùng rộng (cả tỉnh), tránh tải quá nhiều dữ liệu
export async function fetchGraph(bbox, majorOnly) {
  let els = inside(bbox, BMT_BBOX) ? await loadLocal().catch(() => null) : null
  els ??= await fromCache(bbox)
  if (els && majorOnly) els = els.filter(el => el.type === 'node' || MAJOR_RE.test(el.tags.highway))
  return buildGraph(els ?? await overpass(bbox, majorOnly ? MAJOR : ALL))
}

export function buildGraph(elements) {
  const coord = new Map(), index = new Map(), g = { lat: [], lon: [], adj: [], ways: [] }
  for (const el of elements) if (el.type === 'node') coord.set(el.id, [el.lat, el.lon])
  const idx = id => {
    if (!index.has(id)) {
      const [la, lo] = coord.get(id)
      index.set(id, g.adj.length); g.lat.push(la); g.lon.push(lo); g.adj.push([])
    }
    return index.get(id)
  }
  for (const el of elements) {
    if (el.type !== 'way') continue
    const t = el.tags || {}
    const ow = t.oneway === '-1' ? -1
      : ['yes', 'true', '1'].includes(t.oneway) || t.junction === 'roundabout' || t.highway === 'motorway' ? 1 : 0
    const ns = el.nodes.filter(id => coord.has(id)).map(idx)
    g.ways.push(ns.map(i => [g.lat[i], g.lon[i]]))
    for (let i = 1; i < ns.length; i++) {
      const a = ns[i - 1], b = ns[i], w = haversine(g.lat[a], g.lon[a], g.lat[b], g.lon[b])
      if (ow >= 0) g.adj[a].push([b, w])
      if (ow <= 0) g.adj[b].push([a, w])
    }
  }
  return g
}

export function nearest(g, lat, lon) {
  let best = -1, bd = Infinity
  for (let i = 0; i < g.lat.length; i++) {
    const d = (g.lat[i] - lat) ** 2 + (g.lon[i] - lon) ** 2
    if (d < bd && g.adj[i].length) { bd = d; best = i }
  }
  return best
}
