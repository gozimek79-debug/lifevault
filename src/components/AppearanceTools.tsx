import type { ReactNode } from 'react'
import { useSettings, type FontScaleId } from '../app/settings'
import { useI18n } from '../i18n/context'

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

const scaleLabel = {
  sm: 'fontSmall',
  md: 'fontNormal',
  lg: 'fontLarge',
  xl: 'fontXLarge',
} as const

/** Język, motyw i skala. Te same małe kontrolki w pasku (szeroki ekran) i w ustawieniach (wąski). */

export function AppearanceTools({ labeled = false }: { labeled?: boolean }) {
  const { t } = useI18n()
  const settings = useSettings()

  return (
    <>
      <ToolGroup label={t('language')} labeled={labeled}>
        <div className="inline-flex rounded-full bg-stone-200/70 p-0.5 dark:bg-stone-800" role="group" aria-label={t('language')}>
          <button className={settings.lang === 'pl' ? 'tool tool-on' : 'tool'} type="button" aria-pressed={settings.lang === 'pl'} onClick={() => settings.setLang('pl')}>
            PL
          </button>
          <button className={settings.lang === 'en' ? 'tool tool-on' : 'tool'} type="button" aria-pressed={settings.lang === 'en'} onClick={() => settings.setLang('en')}>
            EN
          </button>
        </div>
      </ToolGroup>
      <ToolGroup label={t('theme')} labeled={labeled}>
        <button
          className="tool ring-1 ring-stone-300 dark:ring-stone-600"
          type="button"
          aria-label={t('theme')}
          aria-pressed={settings.theme === 'dark'}
          onClick={() => settings.setTheme(settings.theme === 'dark' ? 'light' : 'dark')}
        >
          {settings.theme === 'dark' ? t('themeDark') : t('themeLight')}
        </button>
      </ToolGroup>
      <ToolGroup label={t('fontScale')} labeled={labeled}>
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
      </ToolGroup>
    </>
  )
}

function ToolGroup({ label, labeled, children }: { label: string; labeled: boolean; children: ReactNode }) {
  if (!labeled) return children
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="shrink-0 text-sm text-stone-600 dark:text-stone-300">{label}</span>
      {children}
    </div>
  )
}
