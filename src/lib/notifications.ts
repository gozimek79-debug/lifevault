import { asArrayBuffer, b64ToBytes } from './codec'
import { getPush, listReminders, putPush } from './db'
import { assertIsoDate } from './iso-date'
import { getSupabase } from './supabase'
import type { PushRecord, Reminder } from './types'

/** Godzina lokalnego powiadomienia w dniu 30/7/1. Sam dzień liczy reminderDates. */
const REMINDER_HOUR = 9

export interface ReminderCopy {
  title: string
  body: string
}

export function reminderInstant(dateIso: string): number {
  const { y, m, d } = assertIsoDate(dateIso)
  return new Date(y, m - 1, d, REMINDER_HOUR, 0, 0, 0).getTime()
}

export async function scheduleStoredReminders(
  householdId: string,
  describe: (reminder: Reminder) => ReminderCopy,
): Promise<void> {
  const reminders = (await listReminders(householdId))
    .filter((reminder) => !reminder.notifiedAt)
    .map((reminder) => {
      const copy = describe(reminder)
      return { id: reminder.id, at: reminderInstant(reminder.remindOn), title: copy.title, body: copy.body }
    })
  const registration = await swReady()
  registration?.active?.postMessage({ type: 'SCHEDULE_REMINDERS', reminders })
  await registerPeriodic(registration)
}

export async function enableReminders(userId: string, householdId: string): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  await rememberPush(userId, householdId)
  return 'granted'
}

export function listenForWorker(onShown: (id: string) => void, onFlush: () => void): () => void {
  if (!('serviceWorker' in navigator)) return () => undefined
  const handler = (event: MessageEvent<unknown>) => {
    const data = event.data
    if (!data || typeof data !== 'object' || !('type' in data)) return
    const message = data as { type?: string; ids?: unknown }
    if (message.type === 'REMINDER_SHOWN' && Array.isArray(message.ids)) {
      for (const id of message.ids) {
        if (typeof id === 'string') onShown(id)
      }
    }
    if (message.type === 'FLUSH_SYNC') onFlush()
  }
  navigator.serviceWorker.addEventListener('message', handler)
  return () => navigator.serviceWorker.removeEventListener('message', handler)
}

async function rememberPush(userId: string, householdId: string): Promise<void> {
  const existing = await getPush(userId)
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim()
  const registration = await swReady(4000)
  if (!vapid || !registration || !('pushManager' in registration)) {
    await putPush(existing ?? pendingPush(userId))
    return
  }
  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: asArrayBuffer(urlBase64ToBytes(vapid)),
    })
    const json = subscription.toJSON()
    const record: PushRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      userId,
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh ?? null,
      auth: json.keys?.auth ?? null,
      status: 'subscribed',
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    await putPush(record)
    await storePushRemote(record, householdId)
  } catch {
    await putPush(existing ?? pendingPush(userId))
  }
}

function pendingPush(userId: string): PushRecord {
  return {
    id: crypto.randomUUID(),
    userId,
    endpoint: null,
    p256dh: null,
    auth: null,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
}

async function storePushRemote(record: PushRecord, householdId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase || !record.endpoint) return
  await supabase.from('push_subscriptions').upsert(
    {
      id: record.id,
      user_id: record.userId,
      household_id: householdId,
      endpoint: record.endpoint,
      p256dh: record.p256dh,
      auth: record.auth,
    },
    { onConflict: 'id' },
  )
}

function urlBase64ToBytes(value: string): Uint8Array {
  const padded = `${value.replace(/-/g, '+').replace(/_/g, '/')}${'='.repeat((4 - (value.length % 4)) % 4)}`
  return b64ToBytes(padded)
}

async function registerPeriodic(registration: ServiceWorkerRegistration | null): Promise<void> {
  if (!registration) return
  const periodic = (
    registration as ServiceWorkerRegistration & {
      periodicSync?: { register: (tag: string, options: { minInterval: number }) => Promise<void> }
    }
  ).periodicSync
  try {
    await periodic?.register('lifevault-reminders', { minInterval: 12 * 60 * 60 * 1000 })
  } catch {
    // Okresowe budzenie bywa wyłączone. Harmonogram i tak sprawdzamy przy otwarciu aplikacji.
  }
}

function swReady(timeoutMs = 2000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null)
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), timeoutMs)
    navigator.serviceWorker.ready
      .then((registration) => {
        window.clearTimeout(timer)
        resolve(registration)
      })
      .catch(() => {
        window.clearTimeout(timer)
        resolve(null)
      })
  })
}
