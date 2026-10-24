import { extractPdfStrings } from '../modules/docs/analyze'
import { assertIsoDate } from './iso-date'
import { parseDocumentText, type DocumentType, type ParsedDocument } from './parse-document'
import { getSupabase } from './supabase'

/**
 * Odczyt dokumentu.
 * Najpierw funkcja extract-document (klucz modelu zostaje na serwerze).
 * Gdy jej nie ma albo sieć padnie, obraz idzie do Tesseracta, a tekst do parsera.
 * PDF bez funkcji: tekst z nieskompresowanych napisów, tym samym odczytem co czytnik.
 */

export type ExtractSource = 'cloud' | 'tesseract' | 'manual'

export interface ExtractResult {
  source: ExtractSource
  text: string
  fields: ParsedDocument
  warning: 'pdf-manual' | 'cloud-failed' | null
}

const TYPES = new Set<DocumentType>(['invoice', 'receipt', 'warranty', 'manual', 'other'])

export async function extractFromFile(file: Blob, mime: string): Promise<ExtractResult> {
  const functionUrl = import.meta.env.VITE_EXTRACT_FUNCTION_URL?.trim()
  let cloudFailed = false
  if (functionUrl && navigator.onLine && file.size <= 8 * 1024 * 1024) {
    try {
      const prepared = mime.startsWith('image/') ? await downscaleImage(file) : file
      const cloud = await extractViaFunction(functionUrl, prepared, prepared.type || mime)
      if (cloud) return cloud
      cloudFailed = true
    } catch {
      cloudFailed = true
    }
  }
  if (mime.startsWith('image/')) {
    const prepared = await downscaleImage(file)
    const text = await ocrImage(prepared)
    return {
      source: 'tesseract',
      text,
      fields: parseDocumentText(text),
      warning: cloudFailed ? 'cloud-failed' : null,
    }
  }
  if (mime === 'application/pdf') {
    const text = extractPdfStrings(new Uint8Array(await file.arrayBuffer()))
    if (text.trim()) {
      return {
        source: 'manual',
        text,
        fields: parseDocumentText(text),
        warning: cloudFailed ? 'cloud-failed' : null,
      }
    }
  }
  return { source: 'manual', text: '', fields: parseDocumentText(''), warning: 'pdf-manual' }
}

async function extractViaFunction(url: string, file: Blob, mime: string): Promise<ExtractResult | null> {
  const image = await blobToBase64(file)
  const response = await fetch(url, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ image, mime }),
    signal: AbortSignal.timeout(25000),
  })
  if (!response.ok) return null
  const body: unknown = await response.json()
  if (!body || typeof body !== 'object' || !('ok' in body) || body.ok !== true) return null
  const record = body as Record<string, unknown>
  const text = typeof record.extractedText === 'string' ? record.extractedText : ''
  const parsed = parseDocumentText(text)
  return {
    source: 'cloud',
    text,
    warning: null,
    fields: {
      documentType: preferType(record.documentType, parsed.documentType),
      warrantyEnd: preferDate(record.warrantyEnd, parsed.warrantyEnd),
      price: preferPrice(record, parsed),
      manufacturer: preferText(record.manufacturer, parsed.manufacturer),
      model: preferText(record.model, parsed.model),
      serial: preferText(record.serial, parsed.serial),
      vendor: preferText(record.vendor, parsed.vendor),
      purchaseDate: preferDate(record.purchaseDate, parsed.purchaseDate),
    },
  }
}

async function ocrImage(blob: Blob): Promise<string> {
  const loaded = (await import('tesseract.js')) as unknown as OcrModule & { default?: OcrModule }
  const factory = typeof loaded.createWorker === 'function' ? loaded.createWorker : loaded.default?.createWorker
  if (!factory) throw new Error('ocr')
  const worker = await factory('pol+eng', 1, {
    workerPath: `${import.meta.env.BASE_URL}ocr/worker.min.js`,
    corePath: `${import.meta.env.BASE_URL}ocr`,
    langPath: `${import.meta.env.BASE_URL}ocr`,
    workerBlobURL: false,
  })
  try {
    const result = await worker.recognize(blob)
    return result.data.text ?? ''
  } finally {
    await worker.terminate()
  }
}

/**
 * Mniejszy obraz jest szybszy dla OCR i dla funkcji, a oryginał i tak szyfrujemy osobno przy zapisie.
 */
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

function preferType(value: unknown, fallback: DocumentType): DocumentType {
  return typeof value === 'string' && TYPES.has(value as DocumentType) ? (value as DocumentType) : fallback
}

function preferText(value: unknown, fallback: string | null): string | null {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, 80) : fallback
}

function preferDate(value: unknown, fallback: string | null): string | null {
  if (typeof value !== 'string' || !value.trim()) return fallback
  try {
    assertIsoDate(value.trim())
    return value.trim()
  } catch {
    return fallback
  }
}

function preferPrice(record: Record<string, unknown>, fallback: ParsedDocument): ParsedDocument['price'] {
  const amount = record.priceAmount
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return fallback.price
  const currency = typeof record.priceCurrency === 'string' && record.priceCurrency.trim()
    ? record.priceCurrency.trim().toUpperCase()
    : fallback.price?.currency ?? null
  return { amount: Number(amount.toFixed(2)), currency }
}

interface OcrWorkerOptions {
  workerPath: string
  corePath: string
  langPath: string
  workerBlobURL: boolean
}

interface OcrModule {
  createWorker?: (
    langs: string,
    oem?: number,
    options?: OcrWorkerOptions,
  ) => Promise<{
    recognize: (image: Blob) => Promise<{ data: { text: string } }>
    terminate: () => Promise<unknown>
  }>
}
