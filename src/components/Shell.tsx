import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNav } from '../app/nav'
import { useI18n } from '../i18n/context'
import { moduleRegistry, type ModuleId } from '../modules/registry'
import { Dashboard } from './Dashboard'
import { ErrorBoundary } from './ErrorBoundary'
import { HouseholdScreen } from './HouseholdScreen'
import { SettingsScreen } from './SettingsScreen'

export function Shell() {
  const { t } = useI18n()
  const { route, goDashboard, openHousehold, openSettings } = useNav()
  const online = useOnline()
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-100/95 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <button className="min-h-12 text-left text-2xl font-semibold" type="button" onClick={goDashboard}>
              {t('appName')}
            </button>
            <span className="text-sm font-semibold">{online ? t('online') : t('offline')}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {route.name === 'dashboard' ? null : (
              <button className="tap-ghost" type="button" onClick={goDashboard}>
                {t('dashboard')}
              </button>
            )}
            <button className="tap-ghost" type="button" onClick={openHousehold}>
              {t('household')}
            </button>
            <button className="tap-ghost" type="button" onClick={openSettings}>
              {t('settings')}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg px-4 py-4">
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
    <Suspense fallback={<p>{t('loading')}</p>}>
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
