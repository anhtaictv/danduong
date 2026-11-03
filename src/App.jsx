import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, GeoJSON, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { ALGORITHMS } from './search.js'
import { fetchGraph, nearest, prefetchTiles } from './graph.js'
import { CLASSIFIERS, looPredict, evaluate, treeToText } from './classify.js'
import { SMALL, STEP_ALGOS, runSteps, openText } from './stepper.js'
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
  const [wA, setWA] = useState(2) // hệ số Weighted A*
  const [byTime, setByTime] = useState(false) // tối ưu theo thời gian thay vì quãng đường
  const [resTime, setResTime] = useState(false) // kết quả hiện tại tính theo thời gian?
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
      setResTime(byTime)
      w.postMessage({ g: { lat: g.lat, lon: g.lon, adj: g.adj }, s, t, limit: +limit, w: +wA, byTime })
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
  const km = r => (r.dist / 1000).toFixed(2) + ' km' + (resTime ? ` · ${(r.cost / 60).toFixed(1)} phút` : '')
  const best = results && Math.min(Infinity, ...Object.values(results).map(r => r.cost))

  return (
    <div className="app">
      <aside>
        <nav>
          <button className={tab === 'route' ? 'on' : ''} onClick={() => setTab('route')}>Tìm đường</button>
          <button className={tab === 'step' ? 'on' : ''} onClick={() => setTab('step')}>Từng bước</button>
          <button className={tab === 'cls' ? 'on' : ''} onClick={() => setTab('cls')}>Phân loại</button>
        </nav>
        {tab === 'step' ? <StepGuide /> : tab === 'route' ? <>
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
          <label className="row">Hệ số w của Weighted A*
            <input type="number" min="1" step="0.5" value={wA} onChange={e => setWA(e.target.value)} />
          </label>
          <label className="row">Tối ưu theo
            <select value={byTime ? 't' : 'd'} onChange={e => setByTime(e.target.value === 't')}>
              <option value="d">Quãng đường (km)</option>
              <option value="t">Thời gian (phút)</option>
            </select>
          </label>
          {byTime && <p className="hint">Tốc độ giả định theo loại đường: cao tốc 80, quốc lộ 60–70, tỉnh lộ 50, đường huyện 40, khu dân cư 25 km/h. Heuristic = chim bay ÷ 80 km/h (tốc độ lớn nhất) nên vẫn chấp nhận được.</p>}
          <button className="primary" disabled={!start || !end || status.startsWith('Đang tải')} onClick={run}>Tìm đường</button>
          {status && <p className="status">{status}</p>}
          {bg > 0 && <p className="hint">Đang tải ngầm bản đồ vùng đang xem: còn {bg} ô...</p>}
          {results && <table>
            <thead><tr><th>Thuật toán</th><th>km</th>{resTime && <th>phút</th>}<th>Đỉnh mở rộng</th><th>ms</th></tr></thead>
            <tbody>{Object.keys(ALGORITHMS).map(name => { const r = results[name]
              return !r ? <tr key={name}><td>{name}</td><td colSpan={resTime ? 4 : 3}>đang chạy...</td></tr> :
              <tr key={name} className={name === algo ? 'sel' : name === cmp ? 'cmp' : ''}
                onClick={() => { setAlgo(name); if (name === cmp) setCmp(''); setReplay(x => x + 1) }}>
                <td>{name}{r.path && Math.abs(r.cost - best) < 1e-6 && ' ★'}</td>
                <td>{r.path ? (r.dist / 1000).toFixed(2) : '—'}</td>
                {resTime && <td>{r.path ? (r.cost / 60).toFixed(1) : '—'}</td>}
                <td>{r.expanded}</td>
                <td>{r.ms.toFixed(1)}</td>
              </tr> })}
            </tbody>
          </table>}
          {results && <Bars results={results} algo={algo} cmp={other && cmp} />}
          {results && <p className="hint">★ = {resTime ? 'nhanh nhất' : 'ngắn nhất'}. Click một dòng để xem quá trình tìm kiếm của thuật toán đó; chọn "So sánh với" để vẽ chồng thêm một thuật toán (màu tím).</p>}
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
      {tab === 'step' && <Stepper />}
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

// Biểu đồ cột số đỉnh mở rộng. Thang log vì IDS có thể gấp hàng nghìn lần Greedy (thang thường thì các cột khác gần như bằng 0).
function Bars({ results, algo, cmp }) {
  const names = Object.keys(ALGORITHMS).filter(n => results[n])
  const max = Math.log10(Math.max(10, ...names.map(n => results[n].expanded)))
  return <div>
    <p className="hint">Số đỉnh mở rộng (thang logarit, cột càng ngắn càng ít việc)</p>
    {names.map(n => { const e = results[n].expanded
      return <div key={n} className="bar"><span>{n}</span>
        <i style={{ width: Math.log10(Math.max(1, e)) / max * 100 + '%', background: n === algo ? C.tree : n === cmp ? C.tree2 : '#bbb' }} />
        <b>{e.toLocaleString('vi-VN')}</b>
      </div> })}
  </div>
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
  ev: Object.fromEntries(Object.entries(CLASSIFIERS).map(([n, f]) => [n, evaluate(DOCS, looPredict(f, DOCS))])),
}

function Classifier() {
  const [text, setText] = useState('')
  const [preds, setPreds] = useState(null)
  const [cm, setCm] = useState('Naive Bayes') // mô hình đang xem ma trận nhầm lẫn
  const { models, ev } = train()
  const e = ev[cm], pct = x => (x * 100).toFixed(0) + '%'

  return <>
    <p className="hint">Huấn luyện trên {DOCS.length} tài liệu mẫu ({[...new Set(DOCS.map(d => d[0]))].join(', ')}).</p>
    <textarea rows="5" value={text} onChange={e => setText(e.target.value)} placeholder="Nhập nội dung tài liệu mới..." />
    <button className="primary" disabled={!text.trim()}
      onClick={() => setPreds(Object.fromEntries(Object.entries(models).map(([n, m]) => [n, m(text)])))}>Dự đoán</button>
    <table>
      <thead><tr><th>Mô hình</th><th>Độ chính xác (LOO)</th><th>Dự đoán</th></tr></thead>
      <tbody>{Object.keys(models).map(n =>
        <tr key={n} className={n === cm ? 'sel' : ''} onClick={() => setCm(n)}><td>{n}</td><td>{pct(ev[n].accuracy)}</td><td>{preds?.[n] ?? '—'}</td></tr>)}
      </tbody>
    </table>
    <p className="hint">Ma trận nhầm lẫn (LOO) của <b>{cm}</b>, click dòng trên để đổi mô hình. Hàng = nhãn thật, cột = dự đoán.</p>
    <table className="cm">
      <thead><tr><th></th>{e.labels.map(l => <th key={l}>{l}</th>)}</tr></thead>
      <tbody>{e.labels.map(r => <tr key={r}><th>{r}</th>{e.labels.map(c =>
        <td key={c} className={e.m[r][c] ? (r === c ? 'ok' : 'bad') : ''}>{e.m[r][c]}</td>)}</tr>)}</tbody>
    </table>
    <table>
      <thead><tr><th>Nhãn</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead>
      <tbody>{e.per.map(p => <tr key={p.label}><td>{p.label}</td><td>{pct(p.precision)}</td><td>{pct(p.recall)}</td><td>{pct(p.f1)}</td></tr>)}</tbody>
    </table>
    <details><summary>Xem cây quyết định</summary><pre>{treeToText(models['Decision Tree'].tree)}</pre></details>
  </>
}

function StepGuide() {
  return <>
    <p className="hint">Chạy thuật toán trên đồ thị nhỏ 7 đỉnh để thấy rõ tập biên (Open) và tập đã xét (Closed) thay đổi sau mỗi bước. Đi từ <b>S</b> đến <b>G</b>; số trên cạnh là chi phí, <b>h</b> dưới mỗi đỉnh là ước lượng chi phí còn lại đến G (chấp nhận được và nhất quán).</p>
    <ul className="hint guide">
      <li><i style={{ background: '#f97316' }} />Đỉnh vừa lấy ra để mở rộng</li>
      <li><i style={{ background: '#bfdbfe', border: '2px solid #2563eb' }} />Đỉnh trong Open (đang chờ)</li>
      <li><i style={{ background: '#cbd5e1' }} />Đỉnh trong Closed (đã mở rộng)</li>
      <li><i style={{ background: '#2563eb', height: 4 }} />Cạnh của cây tìm kiếm</li>
      <li><i style={{ background: '#facc15', height: 6 }} />Đường đi tìm được</li>
    </ul>
    <p className="hint">Gợi ý so sánh: BFS ra S-B-G (ít cạnh nhất nhưng chi phí 9); DFS đi vòng S-C-E-G (14); Greedy bị h(B) = 4 dụ sang B; UCS và A* cùng ra S-A-D-G (tối ưu, 6) nhưng A* chỉ mở rộng 4 đỉnh thay vì 7; DLS với l = 1 không tìm thấy; IDS lặp lại các tầng nông qua từng vòng.</p>
  </>
}

// Chạy từng bước trên đồ thị nhỏ (phủ lên bản đồ, bản đồ vẫn giữ nguyên trạng thái bên dưới)
function Stepper() {
  const [algo, setAlgo] = useState('A*')
  const [limit, setLimit] = useState(2)
  const [w, setW] = useState(2)
  const [i, setI] = useState(0)
  const [play, setPlay] = useState(false)
  const run = useMemo(() => runSteps(algo, { limit: +limit, w: +w }), [algo, limit, w])
  useEffect(() => { setI(0); setPlay(false) }, [run])
  useEffect(() => {
    if (!play) return
    if (i >= run.steps.length - 1) return setPlay(false)
    const id = setTimeout(() => setI(i + 1), 1200)
    return () => clearTimeout(id)
  }, [play, i, run])

  const st = run.steps[Math.min(i, run.steps.length - 1)], last = i >= run.steps.length - 1
  const inOpen = new Set(st.open.map(o => o.n)), inClosed = new Set(st.closed)
  const onTree = new Set(st.tree.map(e => e.join())), onPath = new Set()
  if (last && run.path) run.path.slice(1).forEach((v, k) => onPath.add(run.path[k] + ',' + v))
  const has = (set, a, b) => set.has(a + ',' + b) || set.has(b + ',' + a)
  const N = SMALL.nodes
  const fill = n => n === st.u ? '#f97316' : inClosed.has(n) ? '#cbd5e1' : inOpen.has(n) ? '#bfdbfe' : '#fff'

  return <div className="stepper">
    <div className="ctl">
      <select value={algo} onChange={e => setAlgo(e.target.value)}>{STEP_ALGOS.map(a => <option key={a}>{a}</option>)}</select>
      {algo === 'DLS' && <label className="row">Giới hạn l <input type="number" min="0" max="6" value={limit} onChange={e => setLimit(e.target.value)} /></label>}
      {algo === 'Weighted A*' && <label className="row">w <input type="number" min="1" step="0.5" value={w} onChange={e => setW(e.target.value)} /></label>}
      <button onClick={() => setI(0)} disabled={!i}>⏮ Đầu</button>
      <button onClick={() => setI(i - 1)} disabled={!i}>◀ Lùi</button>
      <button className="primary" onClick={() => setPlay(!play)} disabled={last}>{play ? '⏸ Dừng' : '▶ Tự chạy'}</button>
      <button onClick={() => setI(i + 1)} disabled={last}>Tiếp ▶</button>
      <button onClick={() => setI(run.steps.length - 1)} disabled={last}>Cuối ⏭</button>
      <span>Bước {i + 1} / {run.steps.length}{st.iter !== undefined && ` · vòng l = ${st.iter}`}</span>
    </div>
    <svg viewBox="0 0 500 310" role="img" aria-label="Đồ thị minh họa">
      {SMALL.edges.map(([a, b, c]) => {
        const [x1, y1] = N[a], [x2, y2] = N[b], path = has(onPath, a, b), tree = has(onTree, a, b)
        return <g key={a + b}>
          {path && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#facc15" strokeWidth="12" strokeLinecap="round" />}
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={tree ? '#2563eb' : '#94a3b8'} strokeWidth={tree ? 4 : 2} />
          <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} className="w">{c}</text>
        </g>
      })}
      {Object.entries(N).map(([n, [x, y, h]]) => <g key={n}>
        <circle cx={x} cy={y} r="20" fill={fill(n)} stroke={inOpen.has(n) ? '#2563eb' : '#334155'} strokeWidth={inOpen.has(n) ? 3 : 1.5} />
        <text x={x} y={y + 5} className="n">{n}</text>
        <text x={x} y={y + 36} className="h">h={h}</text>
      </g>)}
    </svg>
    <p className="note"><b>Bước {i + 1}:</b> {st.note}</p>
    {last && <p className="note">{run.path ? <>Kết quả: <b>{run.path.join(' → ')}</b>, chi phí <b>{run.cost}</b>, {run.path.length - 1} cạnh, mở rộng {run.expanded} lượt.</> : <>Không tìm được đường, đã mở rộng {run.expanded} lượt.</>}</p>}
    <table className="trace">
      <thead><tr><th>Bước</th>{algo === 'IDS' && <th>l</th>}<th>Lấy ra</th><th>Open sau bước ({algo === 'BFS' ? 'đầu hàng đợi trước' : ['DFS', 'DLS', 'IDS'].includes(algo) ? 'đỉnh ngăn xếp trước' : 'sắp theo f'})</th><th>Closed</th></tr></thead>
      <tbody>{run.steps.map((x, k) => <tr key={k} className={k === i ? 'sel' : ''} onClick={() => setI(k)}>
        <td>{k + 1}</td>{algo === 'IDS' && <td>{x.iter}</td>}<td>{x.u}</td><td>{openText(algo, x.open, +w)}</td><td>{x.closed.join(', ')}</td>
      </tr>)}</tbody>
    </table>
  </div>
}
