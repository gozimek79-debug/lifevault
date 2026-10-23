/**
 * Parser pól z tekstu OCR. Nie woła sieci i nie zgaduje marki z powietrza:
 * bierze etykiety po polsku i angielsku, a braki zostawia puste do poprawki.
 */

export type DocumentType = 'invoice' | 'receipt' | 'warranty' | 'manual' | 'other'

export interface ParsedMoney {
  amount: number
  currency: string | null
}

export interface ParsedDocument {
  documentType: DocumentType
  warrantyEnd: string | null
  price: ParsedMoney | null
  manufacturer: string | null
  model: string | null
  serial: string | null
  vendor: string | null
  purchaseDate: string | null
}

const DATE_TOKEN = String.raw`(\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})`
const MONTH_WORD = String.raw`(?:miesi[aą]c\w*|miesiac\w*|months?)`

const EXPLICIT_WARRANTY = [
  new RegExp(String.raw`gwarancj\w*\s+wa[żz]na\s+do\s*[:\-]?\s*${DATE_TOKEN}`, 'i'),
  new RegExp(String.raw`gwarancj\w*\s+do\s*[:\-]?\s*${DATE_TOKEN}`, 'i'),
  new RegExp(String.raw`gwarancj\w*\s+wygasa(?:\s+dnia)?\s*[:\-]?\s*${DATE_TOKEN}`, 'i'),
  new RegExp(String.raw`koniec\s+gwarancji\s*[:\-]?\s*${DATE_TOKEN}`, 'i'),
  new RegExp(
    String.raw`warranty\s+(?:valid\s+until|until|expires(?:\s+on)?|end(?:\s+date)?)\s*[:\-]?\s*${DATE_TOKEN}`,
    'i',
  ),
  new RegExp(String.raw`valid\s+until\s*[:\-]?\s*${DATE_TOKEN}`, 'i'),
]

const DURATION_AFTER_LABEL = new RegExp(
  String.raw`(?:gwarancj\w*|warranty)[^\n]{0,40}?(\d{1,3})\s*${MONTH_WORD}`,
  'i',
)
const DURATION_BEFORE_LABEL = new RegExp(
  String.raw`(\d{1,3})\s*${MONTH_WORD}\s*(?:gwarancji|warranty)`,
  'i',
)

const LABELED_PRICE =
  /(?:do\s+zap[łl]aty|suma|razem|total|brutto|grand\s+total|kwota)\s*[:\-]?\s*([0-9][0-9\s\u00A0.,]*)\s*(z[łl]|pln|eur|euro|usd|gbp|\$|€|£)?/gi

const CURRENCY_PRICE =
  /([0-9][0-9\s\u00A0.,]*)\s*(z[łl]|pln|eur|euro|usd|gbp|\$|€|£)/gi

const PURCHASE_DATE = new RegExp(
  String.raw`(?:data\s+(?:zakupu|sprzeda[żz]y|wystawienia)|purchase\s+date|invoice\s+date|date\s+of\s+purchase)\s*[:\-]?\s*${DATE_TOKEN}`,
  'i',
)

export function parseDocumentText(text: string): ParsedDocument {
  const source = text.replace(/\r/g, '')
  const purchaseDate = firstDate(PURCHASE_DATE, source)
  return {
    documentType: detectType(source),
    warrantyEnd: warrantyEnd(source, purchaseDate),
    price: findPrice(source),
    manufacturer: labeled(source, /(?:producent|manufacturer|marka|brand)\s*[:\-]\s*([^\n;|]{2,80})/i),
    model: labeled(source, /(?:model|typ\s+urz[aą]dzenia|device\s+type)\s*[:\-]\s*([^\n;|]{1,80})/i),
    serial: labeled(
      source,
      /(?:nr\.?\s*seryjny|numer\s*seryjny|serial(?:\s*(?:no\.?|number))?|s\/n)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-/]{3,})/i,
    ),
    vendor: labeled(source, /(?:sprzedawca|wystawca|vendor|seller|sklep)\s*[:\-]\s*([^\n]{2,80})/i),
    purchaseDate,
  }
}

export function parseMoneyToken(raw: string): ParsedMoney | null {
  const trimmed = raw.replace(/\u00a0/g, ' ').trim()
  if (!trimmed) return null
  const currency = currencyCode(trimmed)
  const numeric = trimmed.replace(/[^\d.,\s]/g, '').trim()
  const amount = parseLocalizedNumber(numeric)
  if (amount === null) return null
  return { amount, currency }
}

function detectType(text: string): DocumentType {
  const folded = text.toLowerCase()
  if (folded.includes('faktura') || folded.includes('invoice')) return 'invoice'
  if (folded.includes('paragon') || folded.includes('receipt')) return 'receipt'
  if (folded.includes('gwaranc') || /\bwarranty\b/.test(folded)) return 'warranty'
  if (folded.includes('instrukcj') || folded.includes('manual') || folded.includes('user guide')) {
    return 'manual'
  }
  return 'other'
}

function warrantyEnd(text: string, purchaseDate: string | null): string | null {
  for (const pattern of EXPLICIT_WARRANTY) {
    const found = firstDate(pattern, text)
    if (found) return found
  }
  const duration = DURATION_AFTER_LABEL.exec(text) ?? DURATION_BEFORE_LABEL.exec(text)
  if (!duration || !purchaseDate) return null
  const months = Number(duration[1])
  if (!Number.isInteger(months) || months <= 0 || months > 600) return null
  return addMonthsIso(purchaseDate, months)
}

function firstDate(pattern: RegExp, text: string): string | null {
  const match = pattern.exec(text)
  if (!match?.[1]) return null
  return parseFlexibleDate(match[1])
}

function labeled(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text)
  if (!match?.[1]) return null
  return cleanValue(match[1])
}

function cleanValue(raw: string): string | null {
  const value = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[:\-#]+/, '')
    .replace(/[.,;]+$/, '')
    .trim()
  if (value.length < 2) return null
  return value.slice(0, 80)
}

function findPrice(text: string): ParsedMoney | null {
  const labeledHit = lastMoney(text, LABELED_PRICE)
  if (labeledHit) return labeledHit
  return lastMoney(text, CURRENCY_PRICE)
}

function lastMoney(text: string, pattern: RegExp): ParsedMoney | null {
  pattern.lastIndex = 0
  let found: ParsedMoney | null = null
  for (const match of text.matchAll(pattern)) {
    const token = `${match[1] ?? ''} ${match[2] ?? ''}`.trim()
    const parsed = parseMoneyToken(token)
    if (parsed) found = parsed
  }
  return found
}

function currencyCode(raw: string): string | null {
  const folded = raw.toLowerCase()
  if (folded.includes('zł') || folded.includes('zl') || folded.includes('pln')) return 'PLN'
  if (folded.includes('€') || folded.includes('eur')) return 'EUR'
  if (folded.includes('$') || folded.includes('usd')) return 'USD'
  if (folded.includes('£') || folded.includes('gbp')) return 'GBP'
  return null
}

function parseLocalizedNumber(input: string): number | null {
  const compact = input.replace(/\s/g, '')
  if (!compact || !/^[\d.,]+$/.test(compact)) return null
  const lastComma = compact.lastIndexOf(',')
  const lastDot = compact.lastIndexOf('.')
  if (lastComma === -1 && lastDot === -1) {
    const whole = Number(compact)
    return Number.isFinite(whole) ? whole : null
  }
  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSep = lastComma > lastDot ? ',' : '.'
    const thousandsSep = decimalSep === ',' ? '.' : ','
    const normalized = compact.split(thousandsSep).join('').replace(decimalSep, '.')
    return roundMoney(Number(normalized))
  }
  const sep = lastComma === -1 ? '.' : ','
  const decimals = compact.length - Math.max(lastComma, lastDot) - 1
  if (decimals === 3 && /^(\d{1,3}([.,]\d{3})+)$/.test(compact)) {
    return Number(compact.replace(/[.,]/g, ''))
  }
  if (decimals === 1 || decimals === 2) return roundMoney(Number(compact.replace(sep, '.')))
  return null
}

function roundMoney(value: number): number | null {
  if (!Number.isFinite(value)) return null
  return Number(value.toFixed(2))
}

function parseFlexibleDate(raw: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (iso) return validIso(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(raw.trim())
  if (!dmy) return null
  let year = Number(dmy[3])
  if (year < 100) year += year >= 70 ? 1900 : 2000
  return validIso(year, Number(dmy[2]), Number(dmy[1]))
}

function validIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const utc = new Date(Date.UTC(y, m - 1, d))
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) return null
  return utc.toISOString().slice(0, 10)
}

function addMonthsIso(iso: string, months: number): string | null {
  const parsed = parseFlexibleDate(iso)
  if (!parsed) return null
  const [y, m, d] = parsed.split('-').map(Number) as [number, number, number]
  const cursor = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate()
  return validIso(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, Math.min(d, lastDay))
}
