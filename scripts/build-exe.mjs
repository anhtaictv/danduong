// Đóng gói dist/ + scripts/server.cjs thành danduong.exe (Node Single Executable): npm run exe
import { readdirSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'

const run = cmd => execSync(cmd, { stdio: 'inherit' })
run('npx vite build')

const assets = Object.fromEntries(readdirSync('dist', { recursive: true, withFileTypes: true })
  .filter(f => f.isFile())
  .map(f => {
    const path = `${f.parentPath}/${f.name}`.replaceAll('\\', '/')
    return [path.slice('dist/'.length), path]
  }))

mkdirSync('release', { recursive: true })
writeFileSync('release/sea-config.json', JSON.stringify({
  main: 'scripts/server.cjs', output: 'release/sea-prep.blob', disableExperimentalSEAWarning: true, assets,
}))
run('node --experimental-sea-config release/sea-config.json')
copyFileSync(process.execPath, 'release/danduong.exe')
run('npx --yes postject release/danduong.exe NODE_SEA_BLOB release/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2')
console.log('Xong: release/danduong.exe')
