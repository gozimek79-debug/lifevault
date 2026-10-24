import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/** Puste albo `/` zostawia dev i zwykły build. Pages ustawia PAGES_BASE=/lifevault/. */
function siteBase(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const raw = env?.PAGES_BASE?.trim()
  if (!raw || raw === '/') return '/'
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`
  return withSlash.endsWith('/') ? withSlash : `${withSlash}/`
}

const base = siteBase()

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,ttf,wasm,gz}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'LifeVault – Cichy Asystent Domu i Firmy',
        short_name: 'LifeVault',
        description: 'Cichy asystent domu i firmy: dokumenty, gwarancje, zadania i odbiór dostawy.',
        theme_color: '#115e59',
        background_color: '#f5f5f4',
        display: 'standalone',
        lang: 'pl',
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
