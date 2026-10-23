import { getSupabase } from '../../lib/supabase'
import {
  analyzeText,
  mapModelPayload,
  readerLooksUseful,
  type ReaderAnalysis,
  type ReaderLang,
} from '../../lib/reader-analysis'

/**
 * Analiza dokumentu czytnika.
 * Gdy jest adres modelu, idzie tam zdjęcie albo tekst PDF z prośbą o JSON.
 * Bez klucza, offline albo przy odmowie zostaje Tesseract i heurystyka na urządzeniu.
 */

export interface ReaderRun {
  source: 'cloud' | 'local'
  text: string
  analysis: ReaderAnalysis
  pdfEmpty: boolean
}

const LANGS = new Set<ReaderLang>(['pl', 'en', 'ua', 'de'])

export async function analyzeDocument(file: Blob, lang: ReaderLang): Promise<ReaderRun> {
  const safeLang = LANGS.has(lang) ? lang : 'pl'
  const mime = file.type || 'application/octet-stream'
  const url = readerUrl()
  if (url && navigator.onLine && file.size <= 8 * 1024 * 1024) {
    try {
      const cloud = await analyzeViaFunction(url, file, mime, safeLang)
      if (cloud) return cloud
    } catch {
      /* model albo sieć nie doszły — zostaje odczyt na urządzeniu */
    }
  }
  if (mime.startsWith('image/')) {
    const prepared = await downscaleImage(file)
    const text = await ocrImage(prepared)
    return { source: 'local', text, analysis: analyzeText(text, safeLang), pdfEmpty: false }
  }
  if (mime === 'application/pdf') {
    const text = extractPdfStrings(new Uint8Array(await file.arrayBuffer()))
    return {
      source: 'local',
      text,
      analysis: analyzeText(text, safeLang),
      pdfEmpty: !text.trim(),
    }
  }
  return { source: 'local', text: '', analysis: analyzeText('', safeLang), pdfEmpty: false }
}

function readerUrl(): string {
  return import.meta.env.VITE_AI_EXTRACT_URL?.trim() || import.meta.env.VITE_EXTRACT_FUNCTION_URL?.trim() || ''
}

async function analyzeViaFunction(url: string, file: Blob, mime: string, lang: ReaderLang): Promise<ReaderRun | null> {
  const headers = await authHeaders()
  let payload: Record<string, unknown>
  if (mime.startsWith('image/')) {
    const prepared = await downscaleImage(file)
    payload = { image: await blobToBase64(prepared), mime: prepared.type || mime, language: lang, purpose: 'reader' }
  } else if (mime === 'application/pdf') {
    const text = extractPdfStrings(new Uint8Array(await file.arrayBuffer()))
    if (!text.trim()) return null
    payload = { text, mime, language: lang, purpose: 'reader' }
  } else {
    return null
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25000),
  })
  if (!response.ok) return null
  const body: unknown = await response.json()
  if (!body || typeof body !== 'object' || !('ok' in body) || body.ok !== true) return null
  const record = body as Record<string, unknown>
  const mapped = mapModelPayload(record)
  const text = typeof record.extractedText === 'string' ? record.extractedText : ''
  if (readerLooksUseful(mapped)) {
    return { source: 'cloud', text: text || mapped.summary, analysis: mapped, pdfEmpty: false }
  }
  if (text.trim()) return { source: 'local', text, analysis: analyzeText(text, lang), pdfEmpty: false }
  return null
}

/** Tekst z nieskompresowanych operatorów PDF. Skompresowany strumień zostaje pusty i mówimy o tym wprost. */
export function extractPdfStrings(bytes: Uint8Array): string {
  const raw = latin1(bytes)
  const chunks: string[] = []
  const literal = String.raw`\((?:\\[nrtbf()\\]|\\[0-7]{1,3}|[^\\)]){1,400}\)`
  for (const match of raw.matchAll(new RegExp(`${literal}\\s*Tj`, 'g'))) chunks.push(unescapePdf(match[0]))
  for (const match of raw.matchAll(new RegExp(`\\[((?:\\s*${literal}\\s*|[-0-9.]+\\s*){1,40})\\]\\s*TJ`, 'g'))) {
    for (const piece of match[1].matchAll(new RegExp(literal, 'g'))) chunks.push(unescapePdf(piece[0]))
  }
  return chunks.join('\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, 12000)
}

function unescapePdf(token: string): string {
  const inner = token.slice(token.indexOf('(') + 1, token.lastIndexOf(')'))
  return inner
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, ' ')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\([0-7]{1,3})/g, (_item, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)))
}

function latin1(bytes: Uint8Array): string {
  let text = ''
  const size = 0x8000
  for (let index = 0; index < bytes.length; index += size) {
    text += String.fromCharCode(...bytes.subarray(index, index + size))
  }
  return text
}

async function ocrImage(blob: Blob): Promise<string> {
  const loaded = (await import('tesseract.js')) as unknown as OcrModule & { default?: OcrModule }
  const factory = typeof loaded.createWorker === 'function' ? loaded.createWorker : loaded.default?.createWorker
  if (!factory) throw new Error('ocr')
  const worker = await factory('pol+eng')
  try {
    const result = await worker.recognize(blob)
    return result.data.text ?? ''
  } finally {
    await worker.terminate()
  }
}

async function downscaleImage(file: Blob, maxEdge = 1600): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    if (scale === 1) {
      bitmap.close()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return file
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    return blob ?? file
  } catch {
    return file
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const supabase = getSupabase()
  if (!supabase) return headers
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const size = 0x8000
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size))
  }
  return btoa(binary)
}

interface OcrModule {
  createWorker?: (langs: string) => Promise<{
    recognize: (image: Blob) => Promise<{ data: { text: string } }>
    terminate: () => Promise<unknown>
  }>
}
