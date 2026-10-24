// @ts-nocheck — tsconfig aplikacji nie ma typów Node, a build Pages odpala tsc.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractFromFile } from './extract'

/**
 * Ścieżka OCR na Pages. Te asercje mają paść, dopóki worker, rdzeń i języki
 * nie idą z bazy Vite (`/lifevault/`), a funkcja wizyjna bez klucza udaje błąd modelu.
 */

const OCR_SOURCES = ['src/lib/extract.ts', 'src/modules/docs/analyze.ts']

function ocrBody(source: string): string {
  const start = source.indexOf('async function ocrImage')
  const next = source.indexOf('\nasync function ', start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

function walk(dir: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) found.push(...walk(path))
    else found.push(path.replaceAll('\\', '/'))
  }
  return found
}

describe('adresy plików OCR', () => {
  it('createWorker dostaje workerPath, corePath i langPath z BASE_URL', () => {
    for (const file of OCR_SOURCES) {
      const body = ocrBody(readFileSync(file, 'utf8'))
      expect(body, file).toContain('workerPath')
      expect(body, file).toContain('corePath')
      expect(body, file).toContain('langPath')
      expect(body, file).toContain('import.meta.env.BASE_URL')
      expect(body, file).not.toContain('cdn.jsdelivr.net')
      expect(body, file).not.toContain('tessdata.projectnaptha.com')
    }
  })

  it('worker, rdzeń i traineddata pol+eng leżą w public, pod bazą stron', () => {
    const files = walk('public')
    expect(files.some((file) => file.endsWith('worker.min.js'))).toBe(true)
    expect(files.some((file) => /tesseract-core.*\.wasm/.test(file))).toBe(true)
    expect(files.some((file) => /pol\.traineddata(\.gz)?$/.test(file))).toBe(true)
    expect(files.some((file) => /eng\.traineddata(\.gz)?$/.test(file))).toBe(true)
  })

  it('service worker nie trzyma martwego hosta tessdata, bo tesseract 5.1.1 bierze @tesseract.js-data', () => {
    const sw = readFileSync('src/sw.ts', 'utf8')
    const worker = readFileSync('node_modules/tesseract.js/src/worker-script/index.js', 'utf8')
    expect(worker).toContain('https://cdn.jsdelivr.net/npm/@tesseract.js-data/')
    expect(sw).toContain('cdn.jsdelivr.net')
    expect(sw).not.toContain('tessdata.projectnaptha.com')
  })
})

describe('pipeline bez klucza i bez obrazu', () => {
  it('PDF bez funkcji nie wraca pusty: jest z niego tekst', async () => {
    const pdf = new TextEncoder().encode(
      '%PDF-1.1\n1 0 obj<<>>endobj\n4 0 obj<< /Length 44 >>stream\nBT (FAKTURA Gwarancja do 15.03.2027) Tj ET\nendstream\nendobj\n%%EOF\n',
    )
    const result = await extractFromFile(new Blob([pdf], { type: 'application/pdf' }), 'application/pdf')
    expect(result.warning).not.toBe('pdf-manual')
    expect(result.text).toMatch(/FAKTURA/)
    expect(result.text).toMatch(/2027/)
  })

  it('funkcja wizyjna bez klucza oddaje no_key, a nie 502 model', async () => {
    const handlers: Array<(req: Request) => Promise<Response>> = []
    const env = new Map<string, string>()
    ;(globalThis as unknown as { Deno: unknown }).Deno = {
      serve(handler: (req: Request) => Promise<Response>) {
        handlers.push(handler)
      },
      env: {
        get(name: string) {
          return env.get(name)
        },
      },
    }
    const specifier = new URL('../../supabase/functions/extract-document/index.ts', import.meta.url).href
    await import(/* @vite-ignore */ specifier)
    const response = await handlers[0](
      new Request('http://lifevault.local/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: 'aaaa', mime: 'image/jpeg' }),
      }),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: false, reason: 'no_key' })
  })
})
