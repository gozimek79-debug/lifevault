import { listOpsPeople, putOpsOrder, putOpsPerson, putOpsTask } from './db'
import { enqueueOpsOrder, enqueueOpsPerson, enqueueOpsTask } from './sync'
import { parseTaskPhrase } from './task-phrase'
import { supabaseConfigured } from './supabase'
import type { OpsOrder, OpsPerson, OpsSyncState, OpsTask, OpsTaskStatus } from './types'

/**
 * Zadania firmy najpierw lądują w IndexedDB. Kolejka rusza tylko wtedy,
 * gdy Supabase jest skonfigurowane. Nieznane imię ze zdania dopisuje osobę
 * do tego gospodarstwa. To nie jest członek z adresem e-mail.
 */

export function nextTaskStatus(status: OpsTaskStatus): OpsTaskStatus {
  if (status === 'new') return 'doing'
  if (status === 'doing') return 'done'
  return 'new'
}

export interface AddedTask {
  task: OpsTask
  person: OpsPerson | null
}

export async function addTaskFromPhrase(
  householdId: string,
  createdBy: string,
  phrase: string,
  now = new Date(),
): Promise<AddedTask | null> {
  const people = await listOpsPeople(householdId)
  const parsed = parseTaskPhrase(phrase, now, people.map((person) => person.name))
  if (!parsed.title.trim()) return null
  let person: OpsPerson | null = null
  if (parsed.personName) {
    const folded = fold(parsed.personName)
    person = people.find((item) => fold(item.name) === folded) ?? null
    if (!person) {
      person = {
        id: crypto.randomUUID(),
        householdId,
        name: parsed.personName,
        createdBy,
        createdAt: new Date().toISOString(),
        syncState: syncStateForSave(),
      }
      await putOpsPerson(person)
      await enqueueOpsPerson(person.id)
    }
  }
  const stamp = new Date().toISOString()
  const task: OpsTask = {
    id: crypto.randomUUID(),
    householdId,
    title: parsed.title.trim(),
    personId: person?.id ?? null,
    dueAt: parsed.dueAt,
    status: 'new',
    createdBy,
    createdAt: stamp,
    updatedAt: stamp,
    syncState: syncStateForSave(),
  }
  await putOpsTask(task)
  await enqueueOpsTask(task.id)
  return { task, person }
}

export async function cycleOpsTask(task: OpsTask): Promise<OpsTask> {
  const next: OpsTask = {
    ...task,
    status: nextTaskStatus(task.status),
    updatedAt: new Date().toISOString(),
    syncState: syncStateForSave(),
  }
  await putOpsTask(next)
  await enqueueOpsTask(next.id)
  return next
}

export async function saveOpsOrder(order: OpsOrder): Promise<OpsOrder> {
  const next: OpsOrder = { ...order, updatedAt: new Date().toISOString(), syncState: syncStateForSave() }
  await putOpsOrder(next)
  await enqueueOpsOrder(next.id)
  return next
}

function syncStateForSave(): OpsSyncState {
  return supabaseConfigured() ? 'pending' : 'local'
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ł/g, 'l')
}
