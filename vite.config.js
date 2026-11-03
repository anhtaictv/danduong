import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// base './' (đường dẫn tương đối): cùng một bản build chạy được ở gốc (exe) và ở /danduong/ (GitHub Pages)
export default defineConfig({ base: './', plugins: [react()] })
