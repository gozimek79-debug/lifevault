import { getConsent, putConsent, enqueueJob } from './db'
import { supabaseConfigured } from './supabase'
import type { ConsentRecord, Session } from './types'

/** Wersja tekstu zgody. Zmiana wymusza ponowny ekran. */
export const CONSENT_VERSION = '2026-10-23'
const STORAGE_KEY = 'lifevault.consent'

export interface StoredConsent {
  version: string
  acceptedAt: string
  processingId: string
  encryptionId: string
}

export function readConsent(): StoredConsent | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const row = parsed as Partial<StoredConsent>
    if (row.version !== CONSENT_VERSION || !row.processingId || !row.encryptionId || !row.acceptedAt) return null
    return {
      version: CONSENT_VERSION,
      acceptedAt: row.acceptedAt,
      processingId: row.processingId,
      encryptionId: row.encryptionId,
    }
  } catch {
    return null
  }
}

export async function acceptConsent(): Promise<StoredConsent> {
  const acceptedAt = new Date().toISOString()
  const processing = consentRow('processing', acceptedAt)
  const encryption = consentRow('encryption_ack', acceptedAt)
  await putConsent(processing)
  await putConsent(encryption)
  const stored: StoredConsent = {
    version: CONSENT_VERSION,
    acceptedAt,
    processingId: processing.id,
    encryptionId: encryption.id,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  return stored
}

/** Po zalogowaniu dopisujemy osobę do zgody i, gdy jest Supabase, kolejkę wysyłki. */
export async function bindConsent(session: Session): Promise<void> {
  const stored = readConsent()
  if (!stored) return
  for (const id of [stored.processingId, stored.encryptionId]) {
    const row = await getConsent(id)
    if (!row) continue
    await putConsent({
      ...row,
      userId: session.userId,
      householdId: session.householdId,
      email: session.email,
    })
    if (supabaseConfigured()) {
      await enqueueJob({ id: `consent:${id}`, kind: 'consent', consentId: id, attempts: 0, lastError: null })
    }
  }
}

function consentRow(consentType: ConsentRecord['consentType'], createdAt: string): ConsentRecord {
  return {
    id: crypto.randomUUID(),
    userId: null,
    householdId: null,
    email: null,
    consentType,
    version: CONSENT_VERSION,
    granted: true,
    createdAt,
  }
}
