// Tải sẵn đường bộ khu vực TP Buôn Ma Thuột vào public/osm-bmt.json: node scripts/prefetch.mjs
import { writeFileSync } from 'node:fs'
import { overpass, BMT_BBOX } from '../src/graph.js'

const elements = await overpass(BMT_BBOX, undefined, { 'User-Agent': 'danduong-prefetch/1.0', Accept: 'application/json' })
writeFileSync('public/osm-bmt.json', JSON.stringify(elements))
console.log(elements.length, 'phần tử')
