import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  ConsentRecord,
  DemoUser,
  Household,
  HouseholdMember,
  PushRecord,
  Reminder,
  SyncJob,
  OpsOrder,
  OpsPerson,
  OpsTask,
  VaultDocument,
  VaultRecord,
} from './types'

/**
 * Lokalny magazyn skanów, notatek, gospodarstwa i kolejki synchronizacji.
 * Plik leży tu już jako szyfrogram. Hasła sejfu tu nie ma.
 */

interface MetaValueMap {
  vault: VaultRecord
  users: DemoUser[]
  push: PushRecord
}

export type CreditReason = 'welcome' | 'analysis' | 'test-pack' | 'refund' | 'plan' | 'pack'

export interface CreditAccountRow {
  householdId: string
  balance: number
  updatedAt: string
}

export interface CreditLedgerRow {
  id: string
  householdId: string
  delta: number
  reason: CreditReason
  createdAt: string
}

interface LifeVaultSchema extends DBSchema {
  documents: {
    key: string
    value: VaultDocument
    indexes: { 'by-household': string }
  }
  reminders: {
    key: string
    value: Reminder
    indexes: { 'by-household': string; 'by-document': string }
  }
  members: {
    key: string
    value: HouseholdMember
    indexes: { 'by-household': string }
  }
  households: { key: string; value: Household }
  consents: { key: string; value: ConsentRecord }
  queue: { key: string; value: SyncJob }
  meta: { key: string; value: MetaValueMap[keyof MetaValueMap] }
  credits: { key: string; value: CreditAccountRow }
  creditLedger: {
    key: string
    value: CreditLedgerRow
    indexes: { 'by-household': string }
  }
  opsPeople: {
    key: string
    value: OpsPerson
    indexes: { 'by-household': string }
  }
  opsTasks: {
    key: string
    value: OpsTask
    indexes: { 'by-household': string }
  }
  opsOrders: {
    key: string
    value: OpsOrder
    indexes: { 'by-household': string }
  }
}

const DB_NAME = 'lifevault'
const DB_VERSION = 3

let opening: Promise<IDBPDatabase<LifeVaultSchema>> | null = null

function database(): Promise<IDBPDatabase<LifeVaultSchema>> {
  if (!opening) {
    opening = openDB<LifeVaultSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const documents = db.createObjectStore('documents', { keyPath: 'id' })
          documents.createIndex('by-household', 'householdId')
          const reminders = db.createObjectStore('reminders', { keyPath: 'id' })
          reminders.createIndex('by-household', 'householdId')
          reminders.createIndex('by-document', 'documentId')
          const members = db.createObjectStore('members', { keyPath: 'id' })
          members.createIndex('by-household', 'householdId')
          db.createObjectStore('households', { keyPath: 'id' })
          db.createObjectStore('consents', { keyPath: 'id' })
          db.createObjectStore('queue', { keyPath: 'id' })
          db.createObjectStore('meta')
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('credits')) {
            db.createObjectStore('credits', { keyPath: 'householdId' })
          }
          if (!db.objectStoreNames.contains('creditLedger')) {
            const ledger = db.createObjectStore('creditLedger', { keyPath: 'id' })
            ledger.createIndex('by-household', 'householdId')
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('opsPeople')) {
            const people = db.createObjectStore('opsPeople', { keyPath: 'id' })
            people.createIndex('by-household', 'householdId')
          }
          if (!db.objectStoreNames.contains('opsTasks')) {
            const tasks = db.createObjectStore('opsTasks', { keyPath: 'id' })
            tasks.createIndex('by-household', 'householdId')
          }
          if (!db.objectStoreNames.contains('opsOrders')) {
            const orders = db.createObjectStore('opsOrders', { keyPath: 'id' })
            orders.createIndex('by-household', 'householdId')
          }
        }
      },
      blocking() {
        void opening?.then((db) => {
          db.close()
          opening = null
        })
      },
    })
  }
  return opening
}

/** Księga kredytów czytnika korzysta z tej samej bazy, bez drugiego połączenia. */
export function lifeVaultDb(): Promise<IDBPDatabase<LifeVaultSchema>> {
  return database()
}

export async function listDocuments(householdId: string): Promise<VaultDocument[]> {
  const db = await database()
  const rows = await db.getAllFromIndex('documents', 'by-household', householdId)
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getDocument(id: string): Promise<VaultDocument | null> {
  const db = await database()
  return (await db.get('documents', id)) ?? null
}

export async function putDocument(document: VaultDocument): Promise<void> {
  const db = await database()
  await db.put('documents', document)
}

export async function deleteDocumentRow(id: string): Promise<void> {
  const db = await database()
  const tx = db.transaction(['documents', 'reminders'], 'readwrite')
  await tx.objectStore('documents').delete(id)
  const reminders = await tx.objectStore('reminders').index('by-document').getAll(id)
  await Promise.all(reminders.map((row) => tx.objectStore('reminders').delete(row.id)))
  await tx.done
}

export async function listReminders(householdId: string): Promise<Reminder[]> {
  const db = await database()
  const rows = await db.getAllFromIndex('reminders', 'by-household', householdId)
  return rows.sort((a, b) => a.remindOn.localeCompare(b.remindOn))
}

export async function replaceReminders(documentId: string, next: Reminder[]): Promise<void> {
  const db = await database()
  const tx = db.transaction('reminders', 'readwrite')
  const existing = await tx.store.index('by-document').getAll(documentId)
  const notified = new Map(existing.map((row) => [row.id, row.notifiedAt]))
  await Promise.all(existing.map((row) => tx.store.delete(row.id)))
  for (const reminder of next) {
    await tx.store.put({ ...reminder, notifiedAt: notified.get(reminder.id) ?? null })
  }
  await tx.done
}

export async function markReminderNotified(id: string): Promise<void> {
  const db = await database()
  const row = await db.get('reminders', id)
  if (!row || row.notifiedAt) return
  await db.put('reminders', { ...row, notifiedAt: new Date().toISOString() })
}

export async function getHousehold(id: string): Promise<Household | null> {
  const db = await database()
  return (await db.get('households', id)) ?? null
}

export async function putHousehold(household: Household): Promise<void> {
  const db = await database()
  await db.put('households', household)
}

export async function listMembers(householdId: string): Promise<HouseholdMember[]> {
  const db = await database()
  const rows = await db.getAllFromIndex('members', 'by-household', householdId)
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function putMember(member: HouseholdMember): Promise<void> {
  const db = await database()
  await db.put('members', member)
}

export async function getConsent(id: string): Promise<ConsentRecord | null> {
  const db = await database()
  return (await db.get('consents', id)) ?? null
}

export async function putConsent(consent: ConsentRecord): Promise<void> {
  const db = await database()
  await db.put('consents', consent)
}

export async function enqueueJob(job: SyncJob): Promise<void> {
  const db = await database()
  await db.put('queue', job)
}

export async function listJobs(): Promise<SyncJob[]> {
  const db = await database()
  return db.getAll('queue')
}

export async function removeJob(id: string): Promise<void> {
  const db = await database()
  await db.delete('queue', id)
}

export async function getVault(userId: string): Promise<VaultRecord | null> {
  const db = await database()
  const value = await db.get('meta', `vault:${userId}`)
  if (!value || !('verifier' in value)) return null
  return value
}

export async function putVault(record: VaultRecord): Promise<void> {
  const db = await database()
  await db.put('meta', record, `vault:${record.userId}`)
}

export async function getDemoUsers(): Promise<DemoUser[]> {
  const db = await database()
  const value = await db.get('meta', 'demo-users')
  return Array.isArray(value) ? value : []
}

export async function putDemoUsers(users: DemoUser[]): Promise<void> {
  const db = await database()
  await db.put('meta', users, 'demo-users')
}

export async function getPush(userId: string): Promise<PushRecord | null> {
  const db = await database()
  const value = await db.get('meta', `push:${userId}`)
  if (!value || !('status' in value)) return null
  return value
}

export async function putPush(record: PushRecord): Promise<void> {
  const db = await database()
  await db.put('meta', record, `push:${record.userId}`)
}

export async function listOpsPeople(householdId: string): Promise<OpsPerson[]> {
  const db = await database()
  const rows = await db.getAllFromIndex('opsPeople', 'by-household', householdId)
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name))
}

export async function getOpsPerson(id: string): Promise<OpsPerson | null> {
  const db = await database()
  return (await db.get('opsPeople', id)) ?? null
}

export async function putOpsPerson(person: OpsPerson): Promise<void> {
  const db = await database()
  await db.put('opsPeople', person)
}

export async function listOpsTasks(householdId: string): Promise<OpsTask[]> {
  const db = await database()
  const rows = await db.getAllFromIndex('opsTasks', 'by-household', householdId)
  return rows.sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || b.createdAt.localeCompare(a.createdAt))
}

export async function getOpsTask(id: string): Promise<OpsTask | null> {
  const db = await database()
  return (await db.get('opsTasks', id)) ?? null
}

export async function putOpsTask(task: OpsTask): Promise<void> {
  const db = await database()
  await db.put('opsTasks', task)
}

export async function listOpsOrders(householdId: string): Promise<OpsOrder[]> {
  const db = await database()
  const rows = await db.getAllFromIndex('opsOrders', 'by-household', householdId)
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getOpsOrder(id: string): Promise<OpsOrder | null> {
  const db = await database()
  return (await db.get('opsOrders', id)) ?? null
}

export async function putOpsOrder(order: OpsOrder): Promise<void> {
  const db = await database()
  await db.put('opsOrders', order)
}
