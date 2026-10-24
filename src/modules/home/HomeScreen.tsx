import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth'
import { listDocuments } from '../../lib/db'
import { localSearch } from '../../lib/search'
import { mergeRemoteDocument, searchRemote } from '../../lib/sync'
import type { VaultDocument } from '../../lib/types'
import { useI18n } from '../../i18n/context'
import { ActionRow, PageIntro } from '../../components/chrome'
import { DocumentDetail } from './DocumentDetail'
import { RemindersScreen } from './RemindersScreen'
import { ScanFlow } from './ScanFlow'
import { ServiceReport } from './ServiceReport'

/**
 * Home Vault: lista, skan, karta dokumentu, przypomnienia i zgłoszenie usterki.
 * Nawigacja jest wewnętrzna, żeby pulpit nie musiał znać tych ekranów.
 */

type Screen =
  | { name: 'list' }
  | { name: 'scan' }
  | { name: 'detail'; id: string }
  | { name: 'reminders' }
  | { name: 'report'; documentId: string | null }

export default function HomeScreen() {
  const { t } = useI18n()
  const { session } = useAuth()
  const [screen, setScreen] = useState<Screen>({ name: 'list' })
  const [documents, setDocuments] = useState<VaultDocument[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!session || screen.name !== 'list') return
    let cancelled = false
    const handle = window.setTimeout(() => {
      void (async () => {
        if (query.trim().length >= 2) {
          const remote = await searchRemote(session.householdId, query).catch(() => [])
          for (const row of remote) await mergeRemoteDocument(row)
        }
        const local = await listDocuments(session.householdId)
        if (!cancelled) setDocuments(localSearch(local, query))
      })()
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [session, screen.name, query])

  if (screen.name === 'scan') {
    return <ScanFlow onCancel={() => setScreen({ name: 'list' })} onSaved={(id) => setScreen({ name: 'detail', id })} />
  }
  if (screen.name === 'detail') {
    return (
      <DocumentDetail
        id={screen.id}
        onBack={() => setScreen({ name: 'list' })}
        onReport={() => setScreen({ name: 'report', documentId: screen.id })}
      />
    )
  }
  if (screen.name === 'reminders') return <RemindersScreen onBack={() => setScreen({ name: 'list' })} />
  if (screen.name === 'report') {
    return <ServiceReport initialId={screen.documentId} onBack={() => setScreen({ name: 'list' })} />
  }

  return (
    <div className="flex flex-col gap-6">
      <PageIntro title={t('homeTitle')} lede={t('homeLead')} />
      <button className="tap-primary" type="button" onClick={() => setScreen({ name: 'scan' })}>
        {t('scan')}
      </button>
      <div>
        <ActionRow hint={t('remindersHint')}>
          <button className="tap-ghost" type="button" onClick={() => setScreen({ name: 'reminders' })}>
            {t('reminders')}
          </button>
        </ActionRow>
        <ActionRow hint={t('reportFaultHint')}>
          <button className="tap-ghost" type="button" onClick={() => setScreen({ name: 'report', documentId: null })}>
            {t('reportFault')}
          </button>
        </ActionRow>
      </div>
      <div className="form-stack">
        <label className="label" htmlFor="search">
          {t('searchPlaceholder')}
        </label>
        <input id="search" className="field" value={query} placeholder={t('searchPlaceholder')} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {documents.length === 0 ? <p className="text-stone-600 dark:text-stone-400">{t('emptyDocs')}</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {documents.map((document) => (
          <li key={document.id}>
            <button className="card h-full w-full" type="button" onClick={() => setScreen({ name: 'detail', id: document.id })}>
              <span className="block text-lg font-semibold">{document.title}</span>
              <span className="mt-1 block text-sm text-stone-600 dark:text-stone-400">{document.vendor || document.manufacturer || t('typeOther')}</span>
              {document.warrantyEnd ? <span className="mt-1 block text-sm">{t('warrantyEnds', { date: document.warrantyEnd })}</span> : null}
              <span className="mt-2 block text-xs font-medium uppercase tracking-wide text-stone-500">{syncLabel(document.syncState, t)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function syncLabel(state: VaultDocument['syncState'], t: (key: 'syncLocal' | 'syncPending' | 'syncSynced' | 'syncError') => string): string {
  if (state === 'pending') return t('syncPending')
  if (state === 'synced') return t('syncSynced')
  if (state === 'error') return t('syncError')
  return t('syncLocal')
}
