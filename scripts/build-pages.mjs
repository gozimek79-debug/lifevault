/**
 * Buduje stronę pod GitHub Pages: base /lifevault/ i kopia index.html jako 404.html.
 * Zwykły `npm run dev` i `npm run build` tego nie ustawiają.
 */
import { cpSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const result = spawnSync('vite', ['build'], {
  stdio: 'inherit',
  env: { ...process.env, PAGES_BASE: '/lifevault/' },
  shell: process.platform === 'win32',
})

if (result.status !== 0) process.exit(result.status ?? 1)
cpSync('dist/index.html', 'dist/404.html')
writeFileSync('dist/.nojekyll', '')
