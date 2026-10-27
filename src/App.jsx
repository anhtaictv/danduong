import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, GeoJSON, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { ALGORITHMS } from './search.js'
import { fetchGraph, nearest, prefetchTiles } from './graph.js'
import { CLASSIFIERS, looAccuracy, treeToText } from './classify.js'
import { DOCS } from './docs.js'

// Icon ghim vẽ bằng CSS: A = điểm đi (xanh), B = điểm đến (đỏ)
const pin = (text, cls) => L.divIcon({ className: '', html: `<div class="pin ${cls}"><span>${text}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 36] })
const START_ICON = pin('A', 'start'), END_ICON = pin('B', 'end')

const MAX_SPAN = 2.5 // độ: đủ phủ cả tỉnh Đắk Lắk
const DETAIL_SPAN = 0.12 // độ (~13 km): dưới mức này tải cả đường nhỏ, trên thì chỉ đường chính
const PROVINCE = 'Tỉnh Đắk Lắk'
const BMT = [12.6667, 108.0383] // TP Buôn Ma Thuột
const MAX_SEGS = 40000 // số cạnh tối đa khi vẽ quá trình tìm kiếm
const C = { tree: '#1e88ff', path: '#ffe600', tree2: '#d946ef', path2: '#a21caf' } // màu: thuật toán chính / thuật toán so sánh

export default function App() {
  const [tab, setTab] = useState('route')
  const [start, setStart] = useState(null)
  const [end, setEnd] = useState(null)
  const [graph, setGraph] = useState(null)
  const [results, setResults] = useState(null)
  const [algo, setAlgo] = useState('A*')
  const [limit, setLimit] = useState(200)
  const [status, setStatus] = useState('')
  const [province, setProvince] = useState(null)
  const [mode, setMode] = useState('start') // click bản đồ đang chọn điểm nào
  const [bg, setBg] = useState(0) // số ô bản đồ đang chờ tải ngầm
  const worker = useRef(null)

  useEffect(() => {
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=vn&polygon_geojson=1&polygon_threshold=0.002&q=' + encodeURIComponent(PROVINCE))
      .then(r => r.json()).then(d => d[0] && setProvince(d[0])).catch(() => {})
  }, [])

  // Đổi điểm → dừng worker đang chạy, tránh kết quả cũ hiện lại
  const reset = () => {
    worker.current?.terminate(); worker.current = null
    setResults(null); setStatus(s => s.startsWith('Đang chạy') ? '' : s)
  }

  const pick = p => {
    reset()
    if (mode === 'start') { setStart(p); if (!end) setMode('end') } else setEnd(p)
  }

  async function run() {
    const span = Math.max(Math.abs(start.lat - end.lat), Math.abs(start.lon - end.lon))
    if (span > MAX_SPAN) return setStatus('Hai điểm quá xa. Hãy chọn trong phạm vi tỉnh.')
    const pad = Math.max(0.01, span * 0.2)
    const bbox = [Math.min(start.lat, end.lat) - pad, Math.min(start.lon, end.lon) - pad,
      Math.max(start.lat, end.lat) + pad, Math.max(start.lon, end.lon) + pad]
    try {
      const majorOnly = span > DETAIL_SPAN
      setStatus(`Đang tải dữ liệu ${majorOnly ? 'đường chính' : 'toàn bộ đường'} từ OpenStreetMap...`)
      const g = await fetchGraph(bbox, majorOnly)
      setGraph(g)
      const s = nearest(g, start.lat, start.lon), t = nearest(g, end.lat, end.lon)
      if (s < 0 || t < 0) return setStatus('Không có đường nào gần điểm đã chọn.')
      setStatus(`Đồ thị: ${g.adj.length} đỉnh. Đang chạy thuật toán...`)
      worker.current?.terminate()
      const w = worker.current = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
      const res = {}
      setResults(res)
      w.onmessage = ({ data }) => {
        if (worker.current !== w) return
        if (data.done) {
          w.terminate()
          return setStatus(res.UCS.path ? '' : 'Không tìm được đường (có thể do đường một chiều hoặc vùng bị tách rời).')
        }
        const r = data.r
        res[data.name] = { ...r, line: r.path?.map(i => [g.lat[i], g.lon[i]]) }
        setResults({ ...res })
        if (data.name !== 'IDS' && !res.IDS) setStatus('Đang chạy IDS (có thể mất vài chục giây với quãng đường dài)...')
      }
      w.onerror = e => setStatus('Lỗi: ' + e.message)
      w.postMessage({ g: { lat: g.lat, lon: g.lon, adj: g.adj }, s, t, limit: +limit })
    } catch (e) {
      setStatus('Lỗi: ' + e.message)
    }
  }

  const [cmp, setCmp] = useState('') // thuật toán vẽ chồng để so sánh, '' = tắt
  const sel = results?.[algo], other = cmp !== algo ? results?.[cmp] : null
  const [step, setStep] = useState(0)
  const [replay, setReplay] = useState(0)
  const [dur, setDur] = useState(3) // số giây vẽ quá trình tìm kiếm (chậm lại khi trình bày)
  const segs = useMemo(() => sel && sample(sel.tree, graph), [sel, graph])
  const segs2 = useMemo(() => other && sample(other.tree, graph), [other, graph])
  // step = số cạnh cây đã vẽ, cả 2 thuật toán cùng tốc độ → thuật toán duyệt ít xong trước. Vẽ xong mới hiện đường đi.
  const total = Math.max(sel?.tree.length ?? 0, other?.tree.length ?? 0) / 2
  useEffect(() => {
    if (!total) return
    const inc = Math.max(1, Math.ceil(total / (dur * 60)))
    let n = 0, id
    const tick = () => { n = Math.min(total, n + inc); setStep(n); if (n < total) id = requestAnimationFrame(tick) }
    setStep(0); id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [total, sel, other, replay, dur])
  const searching = step < total
  const done = r => step >= r.tree.length / 2
  const progress = r => Math.round(r.expanded * Math.min(1, step / (r.tree.length / 2 || 1)))
  const km = r => (r.cost / 1000).toFixed(2) + ' km'
  const best = results && Math.min(Infinity, ...Object.values(results).map(r => r.cost))

  return (
    <div className="app">
      <aside>
        <nav>
          <button className={tab === 'route' ? 'on' : ''} onClick={() => setTab('route')}>Tìm đường</button>
          <button className={tab === 'cls' ? 'on' : ''} onClick={() => setTab('cls')}>Phân loại tài liệu</button>
        </nav>
        {tab === 'route' ? <>
          <PlaceInput label="A · Điểm đi" bbox={province?.boundingbox} value={start} onPick={p => { setStart(p); reset() }} />
          <PlaceInput label="B · Điểm đến" bbox={province?.boundingbox} value={end} onPick={p => { setEnd(p); reset() }} />
          <div className="modes">Click bản đồ để chọn:
            <button className={'start ' + (mode === 'start' ? 'on' : '')} onClick={() => setMode('start')}>A · Điểm đi</button>
            <button className={'end ' + (mode === 'end' ? 'on' : '')} onClick={() => setMode('end')}>B · Điểm đến</button>
          </div>
          <p className="hint">Bản đồ: {PROVINCE} (đường đỏ đứt = ranh giới tỉnh). Có thể kéo ghim A/B để đổi vị trí.</p>
          <label className="row">Giới hạn độ sâu DLS
            <input type="number" min="1" value={limit} onChange={e => setLimit(e.target.value)} />
          </label>
          <button className="primary" disabled={!start || !end || status.startsWith('Đang tải')} onClick={run}>Tìm đường</button>
          {status && <p className="status">{status}</p>}
          {bg > 0 && <p className="hint">Đang tải ngầm bản đồ vùng đang xem: còn {bg} ô...</p>}
          {results && <table>
            <thead><tr><th>Thuật toán</th><th>km</th><th>Đỉnh mở rộng</th><th>ms</th></tr></thead>
            <tbody>{Object.keys(ALGORITHMS).map(name => { const r = results[name]
              return !r ? <tr key={name}><td>{name}</td><td colSpan="3">đang chạy...</td></tr> :
              <tr key={name} className={name === algo ? 'sel' : name === cmp ? 'cmp' : ''}
                onClick={() => { setAlgo(name); if (name === cmp) setCmp(''); setReplay(x => x + 1) }}>
                <td>{name}{r.path && Math.abs(r.cost - best) < 1e-6 && ' ★'}</td>
                <td>{r.path ? (r.cost / 1000).toFixed(2) : '—'}</td>
                <td>{r.expanded}</td>
                <td>{r.ms.toFixed(1)}</td>
              </tr> })}
            </tbody>
          </table>}
          {results && <p className="hint">★ = ngắn nhất. Click một dòng để xem quá trình tìm kiếm của thuật toán đó; chọn "So sánh với" để vẽ chồng thêm một thuật toán (màu tím).</p>}
          {results && <label className="row">So sánh với
            <select value={cmp} onChange={e => { setCmp(e.target.value); setReplay(x => x + 1) }}>
              <option value="">Không</option>
              {Object.keys(ALGORITHMS).filter(n => n !== algo).map(n => <option key={n}>{n}</option>)}
            </select>
          </label>}
          {results && <label className="row">Tốc độ vẽ
            <select value={dur} onChange={e => setDur(+e.target.value)}>
              <option value="3">Nhanh (3 giây)</option>
              <option value="10">Vừa (10 giây)</option>
              <option value="30">Chậm (30 giây)</option>
            </select>
          </label>}
          {sel && <p className="hint">{algo}: đã mở rộng {progress(sel)} / {sel.expanded} đỉnh
            {other && <><br />{cmp}: đã mở rộng {progress(other)} / {other.expanded} đỉnh</>}
            {!searching && <> · <a href="#" onClick={e => { e.preventDefault(); setReplay(x => x + 1) }}>Xem lại</a></>}</p>}
        </> : <Classifier />}
      </aside>

      <div className="mapwrap">
      <Legend graph={graph} algo={sel && algo} cmp={other && cmp} />
      <MapContainer center={BMT} zoom={13} className="map" preferCanvas>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors" />
        {province && <GeoJSON data={province.geojson} style={{ color: '#d00', weight: 2, fillOpacity: 0.03, dashArray: '6 4' }} interactive={false} />}
        <ClickPicker onPick={pick} />
        <Prefetcher onProgress={setBg} />
        {graph && <Polyline positions={graph.ways} pathOptions={{ color: '#555', weight: 1, opacity: 0.4 }} />}
        {[[sel, segs, C.tree, algo], [other, segs2, C.tree2, cmp]].filter(x => x[0])
          .sort((a, b) => b[0].tree.length - a[0].tree.length) // cây lớn vẽ dưới để không che cây nhỏ
          .map(([r, s, color, name], i) =>
            <Polyline key={name + i} positions={s.segs.slice(0, Math.ceil(step / s.k))} pathOptions={{ color, weight: 2, opacity: 0.9 }} />)}
        {sel?.line && <FitTo line={sel.line} />}
        {other?.line && done(other) &&
          <PathLine key={'c' + cmp + replay} line={other.line} color={C.path2} label={`${cmp}: ${km(other)}`} dir="top" width={9} />}
        {/* canvas vẽ theo thứ tự thêm vào → key đổi khi đường so sánh hiện, để đường chính thêm lại và nằm trên */}
        {sel?.line && done(sel) &&
          <PathLine key={'y' + algo + replay + !!(other?.line && done(other))} line={sel.line} color={C.path} label={other ? `${algo}: ${km(sel)}` : km(sel)} dir={other ? 'bottom' : 'center'} />}
        {start && <Marker position={[start.lat, start.lon]} icon={START_ICON} draggable
          eventHandlers={{ dragend: e => { const p = e.target.getLatLng(); setStart({ lat: p.lat, lon: p.lng, name: 'Điểm đã chọn' }); reset() } }}>
          <Tooltip>Điểm đi</Tooltip></Marker>}
        {end && <Marker position={[end.lat, end.lon]} icon={END_ICON} draggable
          eventHandlers={{ dragend: e => { const p = e.target.getLatLng(); setEnd({ lat: p.lat, lon: p.lng, name: 'Điểm đã chọn' }); reset() } }}>
          <Tooltip>Điểm đến</Tooltip></Marker>}
      </MapContainer>
      </div>
    </div>
  )
}

// Cây duyệt có thể tới hàng triệu cạnh (IDS) → lấy mẫu đều tối đa MAX_SEGS cạnh để vẽ cho mượt; k = số cạnh thật mỗi đoạn vẽ
function sample(tr, g) {
  const n = tr.length / 2, k = Math.max(1, Math.ceil(n / MAX_SEGS)), segs = []
  for (let i = 0; i < n; i += k) { const a = tr[2 * i], b = tr[2 * i + 1]; segs.push([[g.lat[a], g.lon[a]], [g.lat[b], g.lon[b]]]) }
  return { segs, k }
}

// Đường so sánh vẽ to hơn (width 9) → trùng với đường chính thì thành viền tím quanh đường vàng
function PathLine({ line, color, label, dir, width = 5 }) {
  return <>
    <Polyline positions={line} pathOptions={{ color: '#222', weight: width + 4, opacity: 0.7 }} />
    <Polyline positions={line} pathOptions={{ color, weight: width }}>
      <Tooltip permanent direction={dir}>{label}</Tooltip>
    </Polyline>
  </>
}

// Chú thích màu (nằm ngoài MapContainer nên click vào không chọn điểm trên bản đồ)
function Legend({ graph, algo, cmp }) {
  const line = (background, extra) => ({ background, ...extra })
  const row = (style, text) => <li key={text}><i style={style} />{text}</li>
  return <ul className="legend">
    {row(line('#16a34a', { height: 12, width: 12, borderRadius: '50%' }), 'A · Điểm đi')}
    {row(line('#dc2626', { height: 12, width: 12, borderRadius: '50%' }), 'B · Điểm đến')}
    {row(line('none', { height: 0, borderTop: '2px dashed #d00' }), 'Ranh giới tỉnh')}
    {graph && row(line('#555', { opacity: 0.5, height: 2 }), 'Mạng đường đã tải')}
    {algo && row(line(C.tree), `${algo} · đỉnh đã duyệt`)}
    {algo && row(line(C.path, { outline: '2px solid #222' }), `${algo} · đường đi`)}
    {cmp && row(line(C.tree2), `${cmp} · đỉnh đã duyệt`)}
    {cmp && row(line(C.path2, { outline: '2px solid #222' }), `${cmp} · đường đi`)}
  </ul>
}

function ClickPicker({ onPick }) {
  useMapEvents({ click: e => onPick({ lat: e.latlng.lat, lon: e.latlng.lng, name: `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}` }) })
  return null
}

// Zoom/kéo bản đồ → tải ngầm đường bộ vùng đang xem (không tải khi zoom quá xa, vùng quá rộng)
const PREFETCH_MIN_ZOOM = 11
function Prefetcher({ onProgress }) {
  const map = useMap()
  useEffect(() => {
    const go = () => {
      if (map.getZoom() < PREFETCH_MIN_ZOOM) return
      const b = map.getBounds()
      prefetchTiles([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()], onProgress).catch(() => {})
    }
    go(); map.on('moveend', go)
    return () => { map.off('moveend', go) }
  }, [map, onProgress])
  return null
}

function FitTo({ line }) {
  const map = useMap()
  useEffect(() => { map.fitBounds(line, { padding: [40, 40] }) }, [line, map])
  return null
}

function PlaceInput({ label, value, onPick, bbox }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState([])
  useEffect(() => { if (value) setQ(value.name) }, [value])

  async function search(e) {
    e.preventDefault()
    try {
      // bbox = [s, n, w, e] của tỉnh → chỉ tìm trong tỉnh
      const box = bbox ? `&bounded=1&viewbox=${bbox[2]},${bbox[1]},${bbox[3]},${bbox[0]}` : ''
      const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=vn' + box + '&q=' + encodeURIComponent(q))
      const data = await res.json()
      setList(data.length ? data : [{ display_name: 'Không tìm thấy', none: true }])
    } catch { setList([{ display_name: 'Lỗi tìm kiếm', none: true }]) }
  }

  return (
    <form onSubmit={search} className="place">
      <label>{label}<input value={q} onChange={e => setQ(e.target.value)} placeholder="Nhập địa điểm rồi Enter" /></label>
      {list.length > 0 && <ul>{list.map((r, i) =>
        <li key={i} onClick={() => { setList([]); if (!r.none) onPick({ lat: +r.lat, lon: +r.lon, name: r.display_name }) }}>{r.display_name}</li>)}
      </ul>}
    </form>
  )
}

// Dữ liệu mẫu cố định → huấn luyện + LOO (~550ms) chỉ tính 1 lần, mở lại tab không đơ nữa
let trained
const train = () => trained ??= {
  models: Object.fromEntries(Object.entries(CLASSIFIERS).map(([n, f]) => [n, f(DOCS)])),
  acc: Object.fromEntries(Object.entries(CLASSIFIERS).map(([n, f]) => [n, looAccuracy(f, DOCS)])),
}

function Classifier() {
  const [text, setText] = useState('')
  const [preds, setPreds] = useState(null)
  const { models, acc } = train()

  return <>
    <p className="hint">Huấn luyện trên {DOCS.length} tài liệu mẫu ({[...new Set(DOCS.map(d => d[0]))].join(', ')}).</p>
    <textarea rows="5" value={text} onChange={e => setText(e.target.value)} placeholder="Nhập nội dung tài liệu mới..." />
    <button className="primary" disabled={!text.trim()}
      onClick={() => setPreds(Object.fromEntries(Object.entries(models).map(([n, m]) => [n, m(text)])))}>Dự đoán</button>
    <table>
      <thead><tr><th>Mô hình</th><th>Độ chính xác (LOO)</th><th>Dự đoán</th></tr></thead>
      <tbody>{Object.keys(models).map(n =>
        <tr key={n}><td>{n}</td><td>{(acc[n] * 100).toFixed(0)}%</td><td>{preds?.[n] ?? '—'}</td></tr>)}
      </tbody>
    </table>
    <details><summary>Xem cây quyết định</summary><pre>{treeToText(models['Decision Tree'].tree)}</pre></details>
  </>
}
