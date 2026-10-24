import type { ReactNode } from 'react'
import { useNav } from '../app/nav'
import { useI18n } from '../i18n/context'
import type { ModuleId } from '../modules/registry'

const tiles: {
  id: ModuleId
  title: 'tileHomeTitle' | 'tileCompanyTitle' | 'tileDocsTitle'
  body: 'tileHomeBody' | 'tileCompanyBody' | 'tileDocsBody'
  accent: string
  well: string
  icon: ReactNode
}[] = [
  {
    id: 'home',
    title: 'tileHomeTitle',
    body: 'tileHomeBody',
    accent: 'border-t-teal-700',
    well: 'bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200',
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
        <path fill="currentColor" d="M12 3.2 3 11h2v9h6v-6h2v6h6v-9h2L12 3.2Zm0 2.3 6 5.1V18h-2v-6H8v6H6v-7.4l6-5.1Z" />
      </svg>
    ),
  },
  {
    id: 'micro-ops',
    title: 'tileCompanyTitle',
    body: 'tileCompanyBody',
    accent: 'border-t-amber-700',
    well: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
        <path fill="currentColor" d="M7 3h10a2 2 0 0 1 2 2v16l-7-3.2L5 21V5a2 2 0 0 1 2-2Zm0 2v12.4l5-2.3 5 2.3V5H7Zm2 3h6v2H9V8Zm0 4h6v2H9v-2Z" />
      </svg>
    ),
  },
  {
    id: 'docs',
    title: 'tileDocsTitle',
    body: 'tileDocsBody',
    accent: 'border-t-indigo-700',
    well: 'bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200',
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
        <path fill="currentColor" d="M6 2h8l6 6v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V9h5.5L13 3.5ZM8 12h8v2H8v-2Zm0 4h8v2H8v-2Z" />
      </svg>
    ),
  },
]

export function Dashboard() {
  const { t } = useI18n()
  const { openModule } = useNav()
  return (
    <div className="flex flex-col gap-8">
      <header className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">{t('dashboard')}</p>
        <h1 className="wordmark mt-2 text-4xl text-stone-950 dark:text-stone-50 sm:text-5xl">{t('appName')}</h1>
        <p className="mt-3 max-w-xl text-lg text-stone-600 dark:text-stone-300">{t('dashboardLead')}</p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            className={`card border-t-4 ${tile.accent} flex min-h-44 flex-col items-start gap-3 text-left transition hover:-translate-y-0.5 hover:shadow-md`}
            type="button"
            onClick={() => openModule(tile.id)}
          >
            <span className={`grid size-11 place-items-center rounded-xl ${tile.well}`}>{tile.icon}</span>
            <span className="text-xl font-semibold tracking-tight">{t(tile.title)}</span>
            <span className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">{t(tile.body)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
