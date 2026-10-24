import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNav } from '../app/nav'
import { useSettings, type FontScaleId } from '../app/settings'
import { useI18n } from '../i18n/context'
import { moduleRegistry, type ModuleId } from '../modules/registry'
import { Dashboard } from './Dashboard'
import { ErrorBoundary } from './ErrorBoundary'
import { HouseholdScreen } from './HouseholdScreen'
import { SettingsScreen } from './SettingsScreen'

const menu: { id: ModuleId; label: 'tileHomeTitle' | 'tileCompanyTitle' | 'tileDocsTitle' }[] = [
  { id: 'home', label: 'tileHomeTitle' },
  { id: 'micro-ops', label: 'tileCompanyTitle' },
  { id: 'docs', label: 'tileDocsTitle' },
]

const scales: { id: FontScaleId; mark: string }[] = [
  { id: 'sm', mark: 'A' },
  { id: 'md', mark: 'A' },
  { id: 'lg', mark: 'A' },
  { id: 'xl', mark: 'A' },
]

const scaleClass: Record<FontScaleId, string> = {
  sm: 'text-[11px]',
  md: 'text-[13px]',
  lg: 'text-[15px]',
  xl: 'text-[18px]',
}

/**
 * Pasek: znak LifeVault, menu trzech kategorii i małe sterowanie wyglądem.
 * Język, motyw i skala nie są osobnymi ekranami z wielkimi blokami.
 */

export function Shell() {
  const { t } = useI18n()
  const settings = useSettings()
  const { route, goDashboard, openModule, openHousehold, openSettings } = useNav()
  const online = useOnline()
  const activeModule = route.name === 'module' ? route.id : null

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-[#f7f4ee]/95 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
          <button className="wordmark px-1 text-xl text-stone-950 dark:text-stone-50" type="button" onClick={goDashboard}>
            {t('appName')}
          </button>
          <nav className="flex flex-wrap items-center gap-1" aria-label={t('dashboard')}>
            {menu.map((item) => (
              <button
                key={item.id}
                className={activeModule === item.id ? 'nav-link nav-on' : 'nav-link'}
                type="button"
                aria-current={activeModule === item.id ? 'page' : undefined}
                onClick={() => openModule(item.id)}
              >
                {t(item.label)}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <div className="inline-flex rounded-full bg-stone-200/70 p-0.5 dark:bg-stone-800" role="group" aria-label={t('language')}>
              <button className={settings.lang === 'pl' ? 'tool tool-on' : 'tool'} type="button" aria-pressed={settings.lang === 'pl'} onClick={() => settings.setLang('pl')}>
                PL
              </button>
              <button className={settings.lang === 'en' ? 'tool tool-on' : 'tool'} type="button" aria-pressed={settings.lang === 'en'} onClick={() => settings.setLang('en')}>
                EN
              </button>
            </div>
            <button
              className="tool ring-1 ring-stone-300 dark:ring-stone-600"
              type="button"
              aria-label={t('theme')}
              aria-pressed={settings.theme === 'dark'}
              onClick={() => settings.setTheme(settings.theme === 'dark' ? 'light' : 'dark')}
            >
              {settings.theme === 'dark' ? t('themeDark') : t('themeLight')}
            </button>
            <div className="inline-flex rounded-full bg-stone-200/70 p-0.5 dark:bg-stone-800" role="group" aria-label={t('fontScale')}>
              {scales.map((scale) => (
                <button
                  key={scale.id}
                  className={`${settings.fontScale === scale.id ? 'tool tool-on' : 'tool'} ${scaleClass[scale.id]}`}
                  type="button"
                  aria-pressed={settings.fontScale === scale.id}
                  aria-label={t(scaleLabel[scale.id])}
                  onClick={() => settings.setFontScale(scale.id)}
                >
                  {scale.mark}
                </button>
              ))}
            </div>
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

const scaleLabel = {
  sm: 'fontSmall',
  md: 'fontNormal',
  lg: 'fontLarge',
  xl: 'fontXLarge',
} as const

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
