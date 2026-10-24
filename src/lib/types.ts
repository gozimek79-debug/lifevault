import type { EncryptedPayload, EncryptionMeta } from './crypto-vault'
import type { DocumentType } from './parse-document'
import type { PlanId } from './plans'
import type { ReminderOffset } from './reminder-dates'

export interface Session {
  mode: 'demo' | 'supabase'
  userId: string
  email: string
  householdId: string
}

export interface Household {
  id: string
  name: string
  createdAt: string
  /** Brak pola w starym zapisie oznacza plan Solo. */
  plan?: PlanId
}

export interface HouseholdMember {
  id: string
  householdId: string
  userId: string | null
  email: string
  role: 'owner' | 'member'
  inviteStatus: 'pending' | 'accepted'
  createdAt: string
}

export interface VaultDocument {
  id: string
  householdId: string
  createdBy: string
  documentType: DocumentType
  title: string
  vendor: string | null
  manufacturer: string | null
  model: string | null
  serial: string | null
  priceAmount: number | null
  priceCurrency: string | null
  purchaseDate: string | null
  warrantyEnd: string | null
  extractedText: string
  notes: string
  keywords: string
  manualSearchUrl: string | null
  manualSource: 'api' | 'link' | null
  file: EncryptedPayload | null
  fileMeta: EncryptionMeta | null
  fileName: string | null
  fileMime: string | null
  manualFile: EncryptedPayload | null
  manualFileMeta: EncryptionMeta | null
  manualFileName: string | null
  remotePath: string | null
  manualRemotePath: string | null
  createdAt: string
  updatedAt: string
  syncState: 'local' | 'pending' | 'synced' | 'error'
}

export interface Reminder {
  id: string
  householdId: string
  documentId: string
  dueOn: string
  remindOn: string
  daysBefore: ReminderOffset
  kind: 'warranty'
  title: string
  notifiedAt: string | null
}

export interface ConsentRecord {
  id: string
  userId: string | null
  householdId: string | null
  email: string | null
  consentType: 'processing' | 'encryption_ack'
  version: string
  granted: boolean
  createdAt: string
}

export interface PushRecord {
  id: string
  userId: string
  endpoint: string | null
  p256dh: string | null
  auth: string | null
  status: 'subscribed' | 'pending'
  createdAt: string
}

export interface DemoUser {
  id: string
  email: string
  /** Skrót hasła logowania demo. To nie jest klucz szyfrujący dokumentów. */
  passwordHash: string
  householdId: string
}

export interface VaultRecord {
  userId: string
  saltB64: string
  iterations: number
  verifier: EncryptedPayload
}

export type OpsSyncState = 'local' | 'pending' | 'synced' | 'error'
export type OpsTaskStatus = 'new' | 'doing' | 'done'
export type OpsOrderSource = 'cloud' | 'tesseract' | 'manual'

/** Imię przy zadaniu firmy. To nie jest zaproszenie e-mail domownika. */
export interface OpsPerson {
  id: string
  householdId: string
  name: string
  createdBy: string
  createdAt: string
  syncState: OpsSyncState
}

export interface OpsTask {
  id: string
  householdId: string
  title: string
  personId: string | null
  dueAt: string | null
  status: OpsTaskStatus
  createdBy: string
  createdAt: string
  updatedAt: string
  syncState: OpsSyncState
}

export interface OpsOrder {
  id: string
  householdId: string
  checklist: string[]
  extractedLines: string[]
  source: OpsOrderSource
  createdBy: string
  createdAt: string
  updatedAt: string
  syncState: OpsSyncState
}

export type SyncJob =
  | { id: string; kind: 'document'; documentId: string; attempts: number; lastError: string | null }
  | { id: string; kind: 'delete-document'; documentId: string; householdId: string; attempts: number; lastError: string | null }
  | { id: string; kind: 'consent'; consentId: string; attempts: number; lastError: string | null }
  | { id: string; kind: 'invite'; memberId: string; householdId: string; attempts: number; lastError: string | null }
  | { id: string; kind: 'ops-person'; personId: string; attempts: number; lastError: string | null }
  | { id: string; kind: 'ops-task'; taskId: string; attempts: number; lastError: string | null }
  | { id: string; kind: 'ops-order'; orderId: string; attempts: number; lastError: string | null }

export interface DocumentDraft {
  documentType: DocumentType
  title: string
  warrantyEnd: string
  priceAmount: string
  priceCurrency: string
  manufacturer: string
  model: string
  serial: string
  vendor: string
  purchaseDate: string
  notes: string
  extractedText: string
}

export type { DocumentType }
