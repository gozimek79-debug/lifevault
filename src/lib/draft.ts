import { assertIsoDate } from './iso-date'
import { parseMoneyToken, type DocumentType, type ParsedDocument } from './parse-document'
import { reminderDates } from './reminder-dates'
import type { DocumentDraft, Reminder, VaultDocument } from './types'

export function keywordsFor(type: DocumentType): string {
  switch (type) {
    case 'invoice':
      return 'faktura invoice'
    case 'receipt':
      return 'paragon receipt'
    case 'warranty':
      return 'gwarancja warranty'
    case 'manual':
      return 'instrukcja manual'
    default:
      return 'inny other'
  }
}

export function emptyDraft(): DocumentDraft {
  return {
    documentType: 'other',
    title: '',
    warrantyEnd: '',
    priceAmount: '',
    priceCurrency: 'PLN',
    manufacturer: '',
    model: '',
    serial: '',
    vendor: '',
    purchaseDate: '',
    notes: '',
    extractedText: '',
  }
}

export function draftFromParsed(fields: ParsedDocument, text: string): DocumentDraft {
  return {
    documentType: fields.documentType,
    title: [fields.manufacturer, fields.model].filter(Boolean).join(' '),
    warrantyEnd: fields.warrantyEnd ?? '',
    priceAmount: fields.price ? fields.price.amount.toFixed(2) : '',
    priceCurrency: fields.price?.currency ?? 'PLN',
    manufacturer: fields.manufacturer ?? '',
    model: fields.model ?? '',
    serial: fields.serial ?? '',
    vendor: fields.vendor ?? '',
    purchaseDate: fields.purchaseDate ?? '',
    notes: '',
    extractedText: text,
  }
}

export function draftFromDocument(document: VaultDocument): DocumentDraft {
  return {
    documentType: document.documentType,
    title: document.title,
    warrantyEnd: document.warrantyEnd ?? '',
    priceAmount: document.priceAmount === null ? '' : document.priceAmount.toFixed(2),
    priceCurrency: document.priceCurrency ?? 'PLN',
    manufacturer: document.manufacturer ?? '',
    model: document.model ?? '',
    serial: document.serial ?? '',
    vendor: document.vendor ?? '',
    purchaseDate: document.purchaseDate ?? '',
    notes: document.notes,
    extractedText: document.extractedText,
  }
}

export function applyDraft(document: VaultDocument, draft: DocumentDraft, fallbackTitle: string): VaultDocument {
  const price = readPrice(draft)
  return {
    ...document,
    documentType: draft.documentType,
    title: draft.title.trim() || fallbackTitle,
    vendor: emptyToNull(draft.vendor),
    manufacturer: emptyToNull(draft.manufacturer),
    model: emptyToNull(draft.model),
    serial: emptyToNull(draft.serial),
    priceAmount: price?.amount ?? null,
    priceCurrency: price?.currency ?? null,
    purchaseDate: readIso(draft.purchaseDate),
    warrantyEnd: readIso(draft.warrantyEnd),
    extractedText: draft.extractedText,
    notes: draft.notes.trim(),
    keywords: keywordsFor(draft.documentType),
    updatedAt: new Date().toISOString(),
  }
}

export function buildReminders(document: VaultDocument): Reminder[] {
  const dueOn = document.warrantyEnd
  if (!dueOn) return []
  return reminderDates(dueOn).map((point) => ({
    id: `${document.id}:${point.daysBefore}:${point.date}`,
    householdId: document.householdId,
    documentId: document.id,
    dueOn,
    remindOn: point.date,
    daysBefore: point.daysBefore,
    kind: 'warranty',
    title: document.title,
    notifiedAt: null,
  }))
}

function readPrice(draft: DocumentDraft): { amount: number; currency: string | null } | null {
  if (!draft.priceAmount.trim()) return null
  const parsed = parseMoneyToken(`${draft.priceAmount} ${draft.priceCurrency}`.trim())
  if (!parsed) throw new Error('price')
  return { amount: parsed.amount, currency: parsed.currency ?? (draft.priceCurrency.trim() || null) }
}

function readIso(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  assertIsoDate(trimmed)
  return trimmed
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}
