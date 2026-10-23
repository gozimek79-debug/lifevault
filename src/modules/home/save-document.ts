import { b64ToBytes } from '../../lib/codec'
import { encryptWithKey, metaOf } from '../../lib/crypto-vault'
import { deleteDocumentRow, putDocument, replaceReminders } from '../../lib/db'
import { applyDraft, buildReminders } from '../../lib/draft'
import type { ManualResolution } from '../../lib/manual'
import type { ReminderCopy } from '../../lib/notifications'
import { scheduleStoredReminders } from '../../lib/notifications'
import { enqueueDelete, enqueueDocument } from '../../lib/sync'
import { supabaseConfigured } from '../../lib/supabase'
import type { DocumentDraft, Reminder, Session, VaultDocument } from '../../lib/types'

/**
 * Zapis skanu, krok po kroku:
 * 1. Pola z formularza (człowiek mógł je poprawić).
 * 2. Plik i ewentualna instrukcja idą pod AES-256-GCM.
 * 3. Rekord ląduje w IndexedDB.
 * 4. Z końca gwarancji powstają terminy 30, 7 i 1.
 * 5. Przy Supabase rekord wpada do kolejki. Bez kluczy zostaje lokalny.
 */

interface SaveInput {
  session: Session
  key: CryptoKey
  saltB64: string
  draft: DocumentDraft
  fallbackTitle: string
  file: File | null
  manual: ManualResolution | null
  manualFile: File | null
  describe: (reminder: Reminder) => ReminderCopy
}

export async function saveNewDocument(input: SaveInput): Promise<string> {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const file = input.file ? await encryptWithKey(input.key, await input.file.arrayBuffer(), b64ToBytes(input.saltB64)) : null
  const manualFile = input.manualFile
    ? await encryptWithKey(input.key, await input.manualFile.arrayBuffer(), b64ToBytes(input.saltB64))
    : null
  const base: VaultDocument = {
    id,
    householdId: input.session.householdId,
    createdBy: input.session.userId,
    documentType: 'other',
    title: '',
    vendor: null,
    manufacturer: null,
    model: null,
    serial: null,
    priceAmount: null,
    priceCurrency: null,
    purchaseDate: null,
    warrantyEnd: null,
    extractedText: '',
    notes: '',
    keywords: '',
    manualSearchUrl: input.manual?.url ?? null,
    manualSource: input.manual?.source ?? null,
    file,
    fileMeta: file ? metaOf(file) : null,
    fileName: input.file?.name ?? null,
    fileMime: input.file?.type || null,
    manualFile,
    manualFileMeta: manualFile ? metaOf(manualFile) : null,
    manualFileName: input.manualFile?.name ?? null,
    remotePath: null,
    manualRemotePath: null,
    createdAt: now,
    updatedAt: now,
    syncState: supabaseConfigured() ? 'pending' : 'local',
  }
  const document = applyDraft(base, input.draft, input.fallbackTitle)
  await putDocument(document)
  await replaceReminders(document.id, buildReminders(document))
  if (document.syncState === 'pending') await enqueueDocument(document.id)
  await scheduleStoredReminders(document.householdId, input.describe)
  return document.id
}

export async function updateDocument(document: VaultDocument, input: SaveInput): Promise<void> {
  const manualFile = input.manualFile
    ? await encryptWithKey(input.key, await input.manualFile.arrayBuffer(), b64ToBytes(input.saltB64))
    : document.manualFile
  const next = applyDraft(
    {
      ...document,
      manualSearchUrl: input.manual?.url ?? document.manualSearchUrl,
      manualSource: input.manual?.source ?? document.manualSource,
      manualFile,
      manualFileMeta: input.manualFile && manualFile ? metaOf(manualFile) : document.manualFileMeta,
      manualFileName: input.manualFile?.name ?? document.manualFileName,
      syncState: supabaseConfigured() ? 'pending' : document.syncState,
    },
    input.draft,
    input.fallbackTitle,
  )
  await putDocument(next)
  await replaceReminders(next.id, buildReminders(next))
  if (supabaseConfigured()) await enqueueDocument(next.id)
  await scheduleStoredReminders(next.householdId, input.describe)
}

export async function removeDocument(document: VaultDocument, describe: (reminder: Reminder) => ReminderCopy): Promise<void> {
  await deleteDocumentRow(document.id)
  if (document.syncState !== 'local') await enqueueDelete(document.id, document.householdId)
  await scheduleStoredReminders(document.householdId, describe)
}
