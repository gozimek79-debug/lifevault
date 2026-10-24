import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth'
import { useI18n } from '../../i18n/context'
import { listOpsPeople, listOpsTasks } from '../../lib/db'
import { addTaskFromPhrase, cycleOpsTask } from '../../lib/ops'
import type { OpsPerson, OpsTask, OpsTaskStatus } from '../../lib/types'
import { DeliveryPanel } from './DeliveryPanel'
import { formatDue } from './format'
import { listenOnce, speechAvailable } from './speech'

/**
 * Firma, czyli Micro-Ops. Osobny chunk. Tablica zadań, to samo zdanie
 * z klawiatury i z dyktowania, oraz zdjęcie dostawy. Dom i czytnik tu nie wchodzą.
 */

const STATUSES: OpsTaskStatus[] = ['new', 'doing', 'done']

const STATUS_KEY = {
  new: 'opsStatusNew',
  doing: 'opsStatusDoing',
  done: 'opsStatusDone',
} as const

export default function MicroOpsModule() {
  const { t, lang } = useI18n()
  const { session } = useAuth()
  const [view, setView] = useState<'tasks' | 'delivery'>('tasks')
  const [tasks, setTasks] = useState<OpsTask[]>([])
  const [people, setPeople] = useState<OpsPerson[]>([])
  const [draft, setDraft] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)
  const cycling = useRef(new Set<string>())
  const canSpeak = speechAvailable()

  useEffect(() => {
    if (!session) return
    let cancelled = false
    void reload(session.householdId, (nextTasks, nextPeople) => {
      if (cancelled) return
      setTasks(nextTasks)
      setPeople(nextPeople)
    })
    return () => {
      cancelled = true
      stopRef.current?.()
    }
  }, [session])

  async function submit(phrase: string) {
    if (!session) return
    const trimmed = phrase.trim()
    setDraft(trimmed)
    if (!trimmed) {
      setHint(t('opsNeedTitle'))
      return
    }
    const added = await addTaskFromPhrase(session.householdId, session.userId, trimmed)
    if (!added) {
      setHint(t('opsNeedTitle'))
      return
    }
    setHint(null)
    setDraft('')
    await reload(session.householdId, (nextTasks, nextPeople) => {
      setTasks(nextTasks)
      setPeople(nextPeople)
    })
  }

  async function cycle(task: OpsTask) {
    if (!session || cycling.current.has(task.id)) return
    cycling.current.add(task.id)
    try {
      await cycleOpsTask(task)
      await reload(session.householdId, (nextTasks, nextPeople) => {
        setTasks(nextTasks)
        setPeople(nextPeople)
      })
    } finally {
      cycling.current.delete(task.id)
    }
  }

  function toggleVoice() {
    if (listening) {
      stopRef.current?.()
      setListening(false)
      return
    }
    setListening(true)
    stopRef.current = listenOnce(
      lang === 'en' ? 'en-US' : 'pl-PL',
      (text) => {
        void submit(text)
      },
      () => setListening(false),
    )
  }

  const names = new Map(people.map((person) => [person.id, person.name]))

  return (
    <div className="flex flex-col gap-4 pb-8">
      <h1 className="text-3xl font-semibold">{t('opsTitle')}</h1>
      <p>{t('opsLead')}</p>
      <div className="grid grid-cols-2 gap-2">
        <button className={view === 'tasks' ? 'tap-primary' : 'tap-ghost'} type="button" onClick={() => setView('tasks')}>
          {t('opsTasks')}
        </button>
        <button className={view === 'delivery' ? 'tap-primary' : 'tap-ghost'} type="button" onClick={() => setView('delivery')}>
          {t('opsDelivery')}
        </button>
      </div>

      {view === 'delivery' && session ? <DeliveryPanel householdId={session.householdId} userId={session.userId} /> : null}

      {view === 'tasks' ? (
        <>
          <label className="label" htmlFor="ops-phrase">
            {t('opsAdd')}
          </label>
          <input
            id="ops-phrase"
            className="field"
            value={draft}
            placeholder={t('opsAddPlaceholder')}
            onChange={(event) => {
              setDraft(event.target.value)
              setHint(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit(draft)
            }}
          />
          <button className="tap-primary" type="button" onClick={() => void submit(draft)}>
            {t('opsAdd')}
          </button>
          {canSpeak ? (
            <button className="tap-ghost" type="button" onClick={toggleVoice}>
              {listening ? t('opsVoiceStop') : t('opsVoice')}
            </button>
          ) : (
            <p>{t('opsVoiceMissing')}</p>
          )}
          {listening ? <p>{t('opsListening')}</p> : null}
          {hint ? <p className="card">{hint}</p> : null}
          <p>{t('opsBoardHint')}</p>
          {people.length ? (
            <p>
              {t('opsPeople')}: {people.map((person) => person.name).join(', ')}
            </p>
          ) : null}
          {tasks.length === 0 ? <p>{t('opsEmpty')}</p> : null}
          {STATUSES.map((status) => (
            <section key={status} className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold">{t(STATUS_KEY[status])}</h2>
              {tasks
                .filter((task) => task.status === status)
                .map((task) => {
                  const person = task.personId ? names.get(task.personId) : null
                  const sync = syncKey(task.syncState)
                  return (
                    <button
                      key={task.id}
                      className={`card min-h-24 w-full ${status === 'done' ? 'opacity-80' : ''}`}
                      type="button"
                      onClick={() => void cycle(task)}
                    >
                      <span className="block text-2xl font-semibold">{task.title}</span>
                      <span className="mt-1 block">{t(STATUS_KEY[status])}</span>
                      {person ? <span className="mt-1 block">{person}</span> : null}
                      {task.dueAt ? <span className="mt-1 block">{formatDue(task.dueAt, lang)}</span> : null}
                      {sync ? <span className="mt-1 block text-sm">{t(sync)}</span> : null}
                    </button>
                  )
                })}
            </section>
          ))}
        </>
      ) : null}
    </div>
  )
}

function syncKey(state: OpsTask['syncState']): 'syncPending' | 'syncSynced' | 'syncError' | null {
  if (state === 'pending') return 'syncPending'
  if (state === 'synced') return 'syncSynced'
  if (state === 'error') return 'syncError'
  return null
}

async function reload(
  householdId: string,
  apply: (tasks: OpsTask[], people: OpsPerson[]) => void,
): Promise<void> {
  const [nextTasks, nextPeople] = await Promise.all([listOpsTasks(householdId), listOpsPeople(householdId)])
  apply(nextTasks, nextPeople)
}
