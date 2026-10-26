// Server tĩnh cho bản exe: phục vụ dist/ (nhúng sẵn trong exe) tại localhost rồi mở trình duyệt
const http = require('node:http')
const { getAsset } = require('node:sea')
const { exec } = require('node:child_process')

// Cố định port để cache bản đồ (theo origin) giữ được giữa các lần chạy
const PORT = 51730
const URL = `http://localhost:${PORT}/`
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', ico: 'image/x-icon', woff2: 'font/woff2' }
const open = () => exec(`start "" "${URL}"`)

http.createServer((req, res) => {
  let p = decodeURIComponent(new globalThis.URL(req.url, URL).pathname).slice(1) || 'index.html'
  let body
  try { body = getAsset(p) } catch { res.writeHead(404).end(); return }
  res.writeHead(200, { 'Content-Type': TYPES[p.split('.').pop()] || 'application/octet-stream' })
  res.end(Buffer.from(body))
}).on('error', e => {
  if (e.code === 'EADDRINUSE') open() // đã có bản đang chạy
  else throw e
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Đang chạy tại ${URL} — đóng cửa sổ này để tắt.`)
  open()
})
