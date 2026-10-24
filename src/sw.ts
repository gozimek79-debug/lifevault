/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

/**
 * Service worker: powłoka PWA, cache danych Tesseracta i lokalny harmonogram 30/7/1.
 * Długie terminy nie trzymają się na setTimeout (worker jest usypiany).
 * Sprawdzamy je przy starcie, przy komunikacie z karty i przy periodic sync.
 * Powiadomienie starsze niż 12 godzin pomijamy, żeby zapis starej gwarancji nie zasypał człowieka.
 */

interface ScheduledReminder {
  id: string
  at: number
  title: string
  body: string
  shown?: boolean
}

interface ScheduleMessage {
  type: 'SCHEDULE_REMINDERS'
  reminders: ScheduledReminder[]
}

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<import('workbox-precaching').PrecacheEntry | string>
}

const DB_NAME = 'lifevault-notify'
const STORE = 'reminders'
const PAST_GRACE_MS = 12 * 60 * 60 * 1000
const SOON_MS = 24 * 60 * 60 * 1000
const timers: number[] = []

precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  ({ url }) => url.hostname === 'tessdata.projectnaptha.com' || url.hostname === 'cdn.jsdelivr.net',
  new CacheFirst({
    cacheName: 'lifevault-ocr',
    plugins: [new ExpirationPlugin({ maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
)

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim().then(() => checkReminders()))
})

self.addEventListener('message', (event) => {
  const data = event.data as ScheduleMessage | undefined
  if (!data || data.type !== 'SCHEDULE_REMINDERS' || !Array.isArray(data.reminders)) return
  event.waitUntil(replaceSchedule(data.reminders))
})

self.addEventListener('sync', (event) => {
  const tagged = event as ExtendableEvent & { tag?: string }
  if (tagged.tag !== 'lifevault-sync') return
  tagged.waitUntil(ping({ type: 'FLUSH_SYNC' }))
})

self.addEventListener('periodicsync', (event) => {
  const tagged = event as ExtendableEvent & { tag?: string }
  if (tagged.tag !== 'lifevault-reminders') return
  tagged.waitUntil(checkReminders())
})

self.addEventListener('push', (event) => {
  const payload = readPush(event)
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: new URL('icon-192.png', self.registration.scope).href,
      lang: 'pl',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(focusClient())
})

async function replaceSchedule(reminders: ScheduledReminder[]): Promise<void> {
  const db = await open()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  const previous = await request<ScheduledReminder[]>(store.getAll())
  const shown = new Set(previous.filter((row) => row.shown).map((row) => row.id))
  await request(store.clear())
  for (const reminder of reminders) {
    const row: ScheduledReminder = { ...reminder, shown: shown.has(reminder.id) }
    store.put(row)
  }
  await transactionDone(tx)
  db.close()
  await checkReminders()
  await ping({ type: 'REMINDER_SHOWN', ids: [...shown] })
}

async function checkReminders(): Promise<void> {
  clearTimers()
  const rows = await readAll()
  const now = Date.now()
  const due: ScheduledReminder[] = []
  for (const row of rows) {
    if (row.shown) continue
    if (now - row.at > PAST_GRACE_MS) {
      await markShown(row.id)
      continue
    }
    if (row.at <= now) due.push(row)
  }
  if (due.length > 0) {
    await show(due)
    await ping({ type: 'REMINDER_SHOWN', ids: due.map((row) => row.id) })
  }
  for (const row of rows) {
    if (row.shown || row.at <= now) continue
    const wait = row.at - now
    if (wait > SOON_MS) continue
    timers.push(self.setTimeout(() => void checkReminders(), wait + 50))
  }
}

async function show(rows: ScheduledReminder[]): Promise<void> {
  for (const row of rows) {
    await markShown(row.id)
    await self.registration.showNotification(row.title, {
      body: row.body,
      icon: new URL('icon-192.png', self.registration.scope).href,
      lang: 'pl',
      tag: row.id,
    })
  }
}

async function markShown(id: string): Promise<void> {
  const db = await open()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  const row = await request<ScheduledReminder | undefined>(store.get(id))
  if (row) store.put({ ...row, shown: true })
  await transactionDone(tx)
  db.close()
}

async function readAll(): Promise<ScheduledReminder[]> {
  const db = await open()
  const tx = db.transaction(STORE, 'readonly')
  const rows = await request<ScheduledReminder[]>(tx.objectStore(STORE).getAll())
  await transactionDone(tx)
  db.close()
  return rows
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('idb'))
  })
}

function request<T>(query: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    query.onsuccess = () => resolve(query.result)
    query.onerror = () => reject(query.error ?? new Error('idb'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('idb'))
    tx.onabort = () => reject(tx.error ?? new Error('idb'))
  })
}

function clearTimers(): void {
  for (const timer of timers) self.clearTimeout(timer)
  timers.length = 0
}

async function ping(message: { type: string; ids?: string[] }): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of clients) client.postMessage(message)
}

async function focusClient(): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const existing = clients[0]
  if (existing) {
    await existing.focus()
    return
  }
  await self.clients.openWindow('/')
}

function readPush(event: PushEvent): { title: string; body: string } {
  if (!event.data) return { title: 'LifeVault', body: '' }
  try {
    const json: unknown = event.data.json()
    if (json && typeof json === 'object') {
      const record = json as { title?: unknown; body?: unknown }
      return {
        title: typeof record.title === 'string' ? record.title : 'LifeVault',
        body: typeof record.body === 'string' ? record.body : '',
      }
    }
  } catch {
    return { title: 'LifeVault', body: event.data.text() }
  }
  return { title: 'LifeVault', body: '' }
}
