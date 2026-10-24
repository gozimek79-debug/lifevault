import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth'
import { useI18n } from '../../i18n/context'
import { listOpsPeople, listOpsTasks } from '../../lib/db'
import { addTaskFromPhrase, cycleOpsTask } from '../../lib/ops'
import type { OpsPerson, OpsTask, OpsTaskStatus } from '../../lib/types'
import { ActionRow, PageIntro } from '../../components/chrome'
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

const STATUS_TONE: Record<OpsTaskStatus, string> = {
  new: 'bg-sky-100 text-sky-950 dark:bg-sky-950 dark:text-sky-100',
  doing: 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100',
  done: 'bg-teal-100 text-teal-950 dark:bg-teal-950 dark:text-teal-100',
}

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
    <div className="flex flex-col gap-6">
      <PageIntro title={t('opsTitle')} lede={t('opsLead')} />
      <div className="seg" role="tablist" aria-label={t('opsTitle')}>
        <button className={view === 'tasks' ? 'seg-on' : 'seg-off'} type="button" role="tab" aria-selected={view === 'tasks'} onClick={() => setView('tasks')}>
          {t('opsTasks')}
        </button>
        <button className={view === 'delivery' ? 'seg-on' : 'seg-off'} type="button" role="tab" aria-selected={view === 'delivery'} onClick={() => setView('delivery')}>
          {t('opsDelivery')}
        </button>
      </div>

      {view === 'delivery' && session ? <DeliveryPanel householdId={session.householdId} userId={session.userId} /> : null}

      {view === 'tasks' ? (
        <>
          <div className="form-stack">
            <label className="label" htmlFor="ops-phrase">
              {t('opsAdd')}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="ops-phrase"
                className="field w-auto min-w-[12rem] flex-1"
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
            </div>
          </div>
          {canSpeak ? (
            <ActionRow hint={t('voiceHint')}>
              <button className="tap-ghost" type="button" onClick={toggleVoice}>
                {listening ? t('opsVoiceStop') : t('opsVoice')}
              </button>
            </ActionRow>
          ) : (
            <p className="text-sm text-stone-600 dark:text-stone-400">{t('opsVoiceMissing')}</p>
          )}
          {listening ? <p>{t('opsListening')}</p> : null}
          {hint ? <p className="text-sm" role="status">{hint}</p> : null}
          <p className="text-sm text-stone-500">{t('opsBoardHint')}</p>
          {people.length ? (
            <p className="text-sm">
              <span className="font-semibold">{t('opsPeople')}: </span>
              {people.map((person) => person.name).join(', ')}
            </p>
          ) : null}
          {tasks.length === 0 ? <p className="text-stone-600 dark:text-stone-400">{t('opsEmpty')}</p> : null}
          <div className="grid gap-4 md:grid-cols-3">
          {STATUSES.map((status) => (
            <section key={status} className="flex flex-col gap-2">
              <h2 className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${STATUS_TONE[status]}`}>{t(STATUS_KEY[status])}</h2>
              {tasks
                .filter((task) => task.status === status)
                .map((task) => {
                  const person = task.personId ? names.get(task.personId) : null
                  const sync = syncKey(task.syncState)
                  return (
                    <button
                      key={task.id}
                      className={`card w-full text-left ${status === 'done' ? 'opacity-75' : ''}`}
                      type="button"
                      onClick={() => void cycle(task)}
                    >
                      <span className="block text-lg font-semibold">{task.title}</span>
                      {person ? <span className="mt-1 block text-sm">{person}</span> : null}
                      {task.dueAt ? <span className="mt-1 block text-sm text-stone-600 dark:text-stone-400">{formatDue(task.dueAt, lang)}</span> : null}
                      {sync ? <span className="mt-1 block text-xs">{t(sync)}</span> : null}
                    </button>
                  )
                })}
            </section>
          ))}
          </div>
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
