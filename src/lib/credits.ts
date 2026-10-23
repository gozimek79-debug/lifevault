import { lifeVaultDb, type CreditAccountRow, type CreditLedgerRow, type CreditReason } from './db'
import { getSupabase } from './supabase'

/**
 * Kredyty czytnika dokumentów. Jedna analiza kosztuje 1.
 * Nowe gospodarstwo dostaje 3. Pakiet testowy dodaje 5 i nie jest płatnością.
 * Saldo nie schodzi poniżej zera. Stripe tu nie występuje.
 */

export const ANALYSIS_COST = 1
export const WELCOME_CREDITS = 3
export const TEST_PACK_CREDITS = 5

export interface CreditChange {
  ok: boolean
  balance: number
  via: 'remote' | 'local'
}

export function deductCredit(balance: number, cost = ANALYSIS_COST): { ok: boolean; balance: number } {
  const current = whole(balance)
  const price = whole(cost)
  if (price <= 0 || current < price) return { ok: false, balance: current }
  return { ok: true, balance: current - price }
}

export function addCredits(balance: number, amount: number): number {
  return whole(balance) + whole(amount)
}

function whole(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

/** 3 kredyty tylko wtedy, gdy gospodarstwo nie ma jeszcze konta. */
export async function ensureCreditAccount(householdId: string): Promise<number> {
  const remote = await remoteNumber('ensure_credit_account', householdId)
  if (remote !== null) {
    await writeBalance(householdId, remote)
    return remote
  }
  const db = await lifeVaultDb()
  const tx = db.transaction(['credits', 'creditLedger'], 'readwrite')
  const existing = await tx.objectStore('credits').get(householdId)
  if (existing) {
    await tx.done
    return existing.balance
  }
  const row = account(householdId, WELCOME_CREDITS)
  await tx.objectStore('credits').put(row)
  await tx.objectStore('creditLedger').put(entry(householdId, WELCOME_CREDITS, 'welcome'))
  await tx.done
  return WELCOME_CREDITS
}

export async function readCreditBalance(householdId: string): Promise<number> {
  const db = await lifeVaultDb()
  const row = await db.get('credits', householdId)
  return row?.balance ?? 0
}

/** Odmawia przy zerze. Przy chmurze liczy się wynik funkcji, nie drugi odpis lokalny. */
export async function spendAnalysisCredit(householdId: string): Promise<CreditChange> {
  const remote = await remoteSpend(householdId)
  if (remote) {
    await writeBalance(householdId, remote.balance)
    return remote
  }
  const db = await lifeVaultDb()
  const tx = db.transaction(['credits', 'creditLedger'], 'readwrite')
  const existing = await tx.objectStore('credits').get(householdId)
  const next = deductCredit(existing?.balance ?? 0)
  if (!next.ok) {
    await tx.done
    return { ok: false, balance: next.balance, via: 'local' }
  }
  await tx.objectStore('credits').put(account(householdId, next.balance))
  await tx.objectStore('creditLedger').put(entry(householdId, -ANALYSIS_COST, 'analysis'))
  await tx.done
  return { ok: true, balance: next.balance, via: 'local' }
}

/** Pakiet testowy. Wywołanie nie idzie do Stripe. */
export async function grantTestPack(householdId: string): Promise<number> {
  const remote = await remoteNumber('grant_test_pack', householdId)
  if (remote !== null) {
    await writeBalance(householdId, remote)
    return remote
  }
  return changeLocal(householdId, TEST_PACK_CREDITS, 'test-pack')
}

/** Zwrot, gdy analiza padła po pobraniu kredytu. Drugi zwrot z rzędu nic nie dodaje. */
export async function refundAnalysisCredit(householdId: string, via: 'remote' | 'local'): Promise<number> {
  if (via === 'remote') {
    const remote = await remoteNumber('refund_analysis_credit', householdId)
    if (remote !== null) {
      await writeBalance(householdId, remote)
      return remote
    }
  }
  const db = await lifeVaultDb()
  const tx = db.transaction(['credits', 'creditLedger'], 'readwrite')
  const ledger = await tx.objectStore('creditLedger').index('by-household').getAll(householdId)
  const latest = [...ledger].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const existing = await tx.objectStore('credits').get(householdId)
  const balance = existing?.balance ?? 0
  if (!latest || latest.reason !== 'analysis' || latest.delta >= 0) {
    await tx.done
    return balance
  }
  const next = balance + ANALYSIS_COST
  await tx.objectStore('credits').put(account(householdId, next))
  await tx.objectStore('creditLedger').put(entry(householdId, ANALYSIS_COST, 'refund'))
  await tx.done
  return next
}

async function changeLocal(householdId: string, delta: number, reason: CreditReason): Promise<number> {
  const db = await lifeVaultDb()
  const tx = db.transaction(['credits', 'creditLedger'], 'readwrite')
  const existing = await tx.objectStore('credits').get(householdId)
  const next = addCredits(existing?.balance ?? 0, delta)
  await tx.objectStore('credits').put(account(householdId, next))
  await tx.objectStore('creditLedger').put(entry(householdId, delta, reason))
  await tx.done
  return next
}

async function writeBalance(householdId: string, balance: number): Promise<void> {
  const db = await lifeVaultDb()
  await db.put('credits', account(householdId, whole(balance)))
}

function account(householdId: string, balance: number): CreditAccountRow {
  return { householdId, balance, updatedAt: new Date().toISOString() }
}

function entry(householdId: string, delta: number, reason: CreditReason): CreditLedgerRow {
  return { id: crypto.randomUUID(), householdId, delta, reason, createdAt: new Date().toISOString() }
}

async function remoteNumber(fn: string, householdId: string): Promise<number | null> {
  const supabase = getSupabase()
  if (!supabase || !navigator.onLine) return null
  try {
    const { data, error } = await supabase.rpc(fn, { hid: householdId })
    if (error || typeof data !== 'number' || !Number.isFinite(data)) return null
    return data
  } catch {
    return null
  }
}

async function remoteSpend(householdId: string): Promise<CreditChange | null> {
  const supabase = getSupabase()
  if (!supabase || !navigator.onLine) return null
  try {
    const { data, error } = await supabase.rpc('spend_analysis_credit', { hid: householdId })
    if (error || !data || typeof data !== 'object') return null
    const record = data as { ok?: unknown; balance?: unknown }
    if (typeof record.balance !== 'number' || !Number.isFinite(record.balance)) return null
    return { ok: record.ok === true, balance: record.balance, via: 'remote' }
  } catch {
    return null
  }
}
