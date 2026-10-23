import { asArrayBuffer, b64ToBytes, bytesToB64 } from './codec'
import { metaOf, type EncryptedPayload, type EncryptionMeta } from './crypto-vault'
import {
  enqueueJob,
  getConsent,
  getDocument,
  listJobs,
  listMembers,
  listReminders,
  putDocument,
  removeJob,
} from './db'
import { getSupabase, supabaseConfigured } from './supabase'
import type { DocumentType } from './parse-document'
import type { Reminder, VaultDocument } from './types'

/**
 * Kolejka synchronizacji rusza tylko wtedy, gdy są oba klucze Supabase.
 * W górę idzie szyfrogram pliku i jawne pola potrzebne do szukania oraz przypomnień.
 * Klucz AES nie opuszcza przeglądarki.
 */

const BUCKET = 'documents'

export function documentPath(householdId: string, documentId: string): string {
  return `${householdId}/${documentId}`
}

export function manualPath(householdId: string, documentId: string): string {
  return `${householdId}/${documentId}-manual`
}

export async function enqueueDocument(documentId: string): Promise<void> {
  if (!supabaseConfigured()) return
  await enqueueJob({ id: `document:${documentId}`, kind: 'document', documentId, attempts: 0, lastError: null })
  await requestBackgroundSync()
}

export async function enqueueDelete(documentId: string, householdId: string): Promise<void> {
  if (!supabaseConfigured()) return
  await removeJob(`document:${documentId}`)
  await enqueueJob({
    id: `delete:${documentId}`,
    kind: 'delete-document',
    documentId,
    householdId,
    attempts: 0,
    lastError: null,
  })
  await requestBackgroundSync()
}

export async function flushQueue(): Promise<void> {
  if (!supabaseConfigured() || !navigator.onLine) return
  const jobs = await listJobs()
  for (const job of jobs) {
    try {
      if (job.kind === 'document') await pushDocument(job.documentId)
      else if (job.kind === 'delete-document') await pushDelete(job.documentId, job.householdId)
      else if (job.kind === 'consent') await pushConsent(job.consentId)
      else await pushInvite(job.memberId, job.householdId)
      await removeJob(job.id)
    } catch (error) {
      if (job.kind === 'document') {
        const failed = await getDocument(job.documentId)
        if (failed) await putDocument({ ...failed, syncState: 'error' })
      }
      await enqueueJob({ ...job, attempts: job.attempts + 1, lastError: shortError(error) })
    }
  }
}

export async function searchRemote(householdId: string, query: string): Promise<VaultDocument[]> {
  const supabase = getSupabase()
  const trimmed = query.trim()
  if (!supabase || trimmed.length < 2 || !navigator.onLine) return []
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('household_id', householdId)
    .textSearch('search_vector', trimmed, { type: 'plain', config: 'simple' })
  if (error || !data) return []
  return (data as DocumentRow[]).map(rowToDocument)
}

export async function mergeRemoteDocument(remote: VaultDocument): Promise<void> {
  const local = await getDocument(remote.id)
  if (!local) {
    await putDocument(remote)
    return
  }
  if (local.syncState === 'pending' || local.syncState === 'error' || local.updatedAt >= remote.updatedAt) return
  await putDocument({
    ...remote,
    file: local.file ?? remote.file,
    manualFile: local.manualFile ?? remote.manualFile,
    syncState: 'synced',
  })
}

export async function downloadEncrypted(
  document: VaultDocument,
  which: 'file' | 'manual',
): Promise<EncryptedPayload | null> {
  const local = which === 'file' ? document.file : document.manualFile
  if (local) return local
  const path = which === 'file' ? document.remotePath : document.manualRemotePath
  const meta = which === 'file' ? document.fileMeta : document.manualFileMeta
  const supabase = getSupabase()
  if (!path || !meta || !supabase) return null
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) throw new Error('download')
  const bytes = new Uint8Array(await data.arrayBuffer())
  return { ...meta, dataB64: bytesToB64(bytes) }
}

async function pushDocument(documentId: string): Promise<void> {
  const supabase = getSupabase()
  const document = await getDocument(documentId)
  if (!supabase || !document) return
  let remotePath = document.remotePath
  let manualRemotePath = document.manualRemotePath
  if (document.file) {
    remotePath = documentPath(document.householdId, document.id)
    await uploadCipher(remotePath, document.file)
  }
  if (document.manualFile) {
    manualRemotePath = manualPath(document.householdId, document.id)
    await uploadCipher(manualRemotePath, document.manualFile)
  }
  const { error } = await supabase.from('documents').upsert(documentToRow(document, remotePath, manualRemotePath), {
    onConflict: 'id',
  })
  if (error) throw new Error('document')
  await replaceWarranty(document)
  await replaceRemoteReminders(document.id)
  const latest = await getDocument(documentId)
  if (latest && latest.updatedAt !== document.updatedAt) {
    await putDocument({ ...latest, remotePath, manualRemotePath, syncState: 'pending' })
    throw new Error('stale')
  }
  await putDocument({ ...(latest ?? document), remotePath, manualRemotePath, syncState: 'synced' })
}

async function pushDelete(documentId: string, householdId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  await supabase.storage.from(BUCKET).remove([
    documentPath(householdId, documentId),
    manualPath(householdId, documentId),
  ])
  const { error } = await supabase.from('documents').delete().eq('id', documentId)
  if (error) throw new Error('delete')
}

async function pushConsent(consentId: string): Promise<void> {
  const supabase = getSupabase()
  const consent = await getConsent(consentId)
  if (!supabase || !consent || !consent.userId) return
  const { error } = await supabase.from('consents').upsert(
    {
      id: consent.id,
      user_id: consent.userId,
      household_id: consent.householdId,
      email: consent.email,
      consent_type: consent.consentType,
      version: consent.version,
      granted: consent.granted,
      created_at: consent.createdAt,
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error('consent')
}

async function pushInvite(memberId: string, householdId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const member = (await listMembers(householdId)).find((item) => item.id === memberId)
  if (!member) return
  const { error } = await supabase.rpc('invite_household_member', {
    hid: member.householdId,
    invite_email: member.email,
  })
  if (error) throw new Error('invite')
}

async function uploadCipher(path: string, payload: EncryptedPayload): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const bytes = b64ToBytes(payload.dataB64)
  const { error } = await supabase.storage.from(BUCKET).upload(path, asArrayBuffer(bytes), {
    contentType: 'application/octet-stream',
    upsert: true,
  })
  if (error) throw new Error('upload')
}

async function replaceWarranty(document: VaultDocument): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  await supabase.from('warranties').delete().eq('document_id', document.id)
  if (!document.warrantyEnd) return
  const { error } = await supabase.from('warranties').insert({
    id: crypto.randomUUID(),
    document_id: document.id,
    household_id: document.householdId,
    ends_on: document.warrantyEnd,
  })
  if (error) throw new Error('warranty')
}

async function replaceRemoteReminders(documentId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const document = await getDocument(documentId)
  if (!document) return
  await supabase.from('reminders').delete().eq('document_id', documentId)
  const reminders = (await listReminders(document.householdId)).filter((row) => row.documentId === documentId)
  if (reminders.length === 0) return
  const { error } = await supabase.from('reminders').insert(reminders.map(reminderToRow))
  if (error) throw new Error('reminders')
}

function documentToRow(
  document: VaultDocument,
  remotePath: string | null,
  manualRemotePath: string | null,
): Record<string, unknown> {
  return {
    id: document.id,
    household_id: document.householdId,
    created_by: document.createdBy || null,
    doc_type: document.documentType,
    title: document.title,
    vendor: document.vendor,
    manufacturer: document.manufacturer,
    model: document.model,
    serial_number: document.serial,
    price_amount: document.priceAmount,
    price_currency: document.priceCurrency,
    purchase_date: document.purchaseDate,
    warranty_end: document.warrantyEnd,
    extracted_text: document.extractedText,
    notes: document.notes,
    keywords: document.keywords,
    blob_path: remotePath,
    encryption_meta: document.file ? metaOf(document.file) : document.fileMeta,
    manual_search_url: document.manualSearchUrl,
    manual_source: document.manualSource,
    manual_blob_path: manualRemotePath,
    manual_encryption_meta: document.manualFile ? metaOf(document.manualFile) : document.manualFileMeta,
    manual_file_name: document.manualFileName,
    file_name: document.fileName,
    file_mime: document.fileMime,
    created_at: document.createdAt,
    updated_at: document.updatedAt,
  }
}

interface DocumentRow {
  id: string
  household_id: string
  created_by: string | null
  doc_type: DocumentType
  title: string | null
  vendor: string | null
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  price_amount: number | null
  price_currency: string | null
  purchase_date: string | null
  warranty_end: string | null
  extracted_text: string | null
  notes: string | null
  keywords: string | null
  blob_path: string | null
  encryption_meta: unknown
  manual_search_url: string | null
  manual_source: 'api' | 'link' | null
  manual_blob_path: string | null
  manual_encryption_meta: unknown
  manual_file_name: string | null
  file_name: string | null
  file_mime: string | null
  created_at: string
  updated_at: string
}

function rowToDocument(row: DocumentRow): VaultDocument {
  return {
    id: row.id,
    householdId: row.household_id,
    createdBy: row.created_by ?? '',
    documentType: row.doc_type,
    title: row.title ?? '',
    vendor: row.vendor,
    manufacturer: row.manufacturer,
    model: row.model,
    serial: row.serial_number,
    priceAmount: row.price_amount,
    priceCurrency: row.price_currency,
    purchaseDate: row.purchase_date,
    warrantyEnd: row.warranty_end,
    extractedText: row.extracted_text ?? '',
    notes: row.notes ?? '',
    keywords: row.keywords ?? '',
    manualSearchUrl: row.manual_search_url,
    manualSource: row.manual_source,
    file: null,
    fileMeta: readMeta(row.encryption_meta),
    fileName: row.file_name,
    fileMime: row.file_mime,
    manualFile: null,
    manualFileMeta: readMeta(row.manual_encryption_meta),
    manualFileName: row.manual_file_name,
    remotePath: row.blob_path,
    manualRemotePath: row.manual_blob_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncState: 'synced',
  }
}

function readMeta(value: unknown): EncryptionMeta | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<EncryptionMeta>
  if (row.version !== 1 || typeof row.saltB64 !== 'string' || typeof row.ivB64 !== 'string') return null
  return {
    version: 1,
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: typeof row.iterations === 'number' ? row.iterations : 210_000,
    saltB64: row.saltB64,
    ivB64: row.ivB64,
  }
}

function reminderToRow(reminder: Reminder): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    household_id: reminder.householdId,
    document_id: reminder.documentId,
    due_on: reminder.dueOn,
    remind_on: reminder.remindOn,
    days_before: reminder.daysBefore,
    kind: reminder.kind,
    notified_at: reminder.notifiedAt,
  }
}

function shortError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 120)
  return 'sync'
}

async function requestBackgroundSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.ready
    const sync = (registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync
    await sync?.register('lifevault-sync')
  } catch {
    // Kolejka i tak ruszy przy zdarzeniu online.
  }
}
