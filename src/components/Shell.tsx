import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNav } from '../app/nav'
import { useI18n } from '../i18n/context'
import { moduleRegistry, type ModuleId } from '../modules/registry'
import { AppearanceTools } from './AppearanceTools'
import { Dashboard } from './Dashboard'
import { ErrorBoundary } from './ErrorBoundary'
import { HouseholdScreen } from './HouseholdScreen'
import { SettingsScreen } from './SettingsScreen'

const menu: { id: ModuleId; label: 'tileHomeTitle' | 'tileCompanyTitle' | 'tileDocsTitle' }[] = [
  { id: 'home', label: 'tileHomeTitle' },
  { id: 'micro-ops', label: 'tileCompanyTitle' },
  { id: 'docs', label: 'tileDocsTitle' },
]

/**
 * Pasek: znak LifeVault i menu trzech kategorii.
 * Na szerokim ekranie język, motyw, skala, rodzina i ustawienia są w tym samym rzędzie.
 * Na wąskim zostaje jeden zwarty przycisk, który otwiera ustawienia.
 */

export function Shell() {
  const { t } = useI18n()
  const { route, goDashboard, openModule, openHousehold, openSettings } = useNav()
  const online = useOnline()
  const activeModule = route.name === 'module' ? route.id : null

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-[#f7f4ee]/95 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
        <div className="mx-auto flex w-full max-w-5xl flex-nowrap items-center gap-x-2 px-3 py-2 lg:flex-wrap lg:gap-x-3 lg:px-6 lg:py-2.5">
          <button className="wordmark shrink-0 px-0.5 text-[19px] text-stone-950 dark:text-stone-50 lg:px-1 lg:text-xl" type="button" onClick={goDashboard}>
            {t('appName')}
          </button>
          <nav className="flex min-w-0 flex-nowrap items-center gap-0.5 lg:gap-1" aria-label={t('dashboard')}>
            {menu.map((item) => (
              <button
                key={item.id}
                className={activeModule === item.id ? 'nav-link nav-on max-lg:px-2 max-lg:text-[13px]' : 'nav-link max-lg:px-2 max-lg:text-[13px]'}
                type="button"
                aria-current={activeModule === item.id ? 'page' : undefined}
                onClick={() => openModule(item.id)}
              >
                {t(item.label)}
              </button>
            ))}
          </nav>
          <div className="ml-auto hidden flex-wrap items-center gap-1.5 lg:flex">
            <AppearanceTools />
            <span className="inline-flex items-center gap-1.5 px-1 text-[12px] font-medium text-stone-500 dark:text-stone-400">
              <span className={`size-1.5 rounded-full ${online ? 'bg-teal-600' : 'bg-stone-400'}`} />
              {online ? t('online') : t('offline')}
            </span>
            <button className="tool" type="button" onClick={openHousehold}>
              {t('household')}
            </button>
            <button className="tool" type="button" onClick={openSettings}>
              {t('settings')}
            </button>
          </div>
          <button
            className="tool ml-auto grid size-8 shrink-0 place-items-center p-0 ring-1 ring-stone-300 lg:hidden dark:ring-stone-600"
            type="button"
            aria-label={t('settings')}
            aria-current={route.name === 'settings' ? 'page' : undefined}
            onClick={openSettings}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <ErrorBoundary title={t('loadFailed')}>
          {route.name === 'dashboard' ? <Dashboard /> : null}
          {route.name === 'settings' ? <SettingsScreen /> : null}
          {route.name === 'household' ? <HouseholdScreen /> : null}
          {route.name === 'module' ? <ModuleHost id={route.id} /> : null}
        </ErrorBoundary>
      </main>
    </div>
  )
}

function ModuleHost({ id }: { id: ModuleId }) {
  const { t } = useI18n()
  const Comp = useMemo(() => lazy(moduleRegistry[id].load), [id])
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">{t('loading')}</p>}>
      <Comp />
    </Suspense>
  )
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
