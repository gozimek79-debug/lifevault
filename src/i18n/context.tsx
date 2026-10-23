import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useSettings, type Lang } from '../app/settings'
import en from './en'
import pl, { type MessageKey } from './pl'

/**
 * PL jest domyślne. EN jest pełnym słownikiem od pierwszej wersji, nie doklejką.
 */

interface I18nValue {
  lang: Lang
  t: (key: MessageKey, vars?: Record<string, string>) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const { lang } = useSettings()
  const value = useMemo<I18nValue>(() => {
    const table = lang === 'en' ? en : pl
    return {
      lang,
      t: (key, vars) => {
        const template = table[key]
        if (!vars) return template
        return template.replace(/\{(\w+)\}/g, (_match, name: string) => vars[name] ?? '')
      },
    }
  }, [lang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('i18n')
  return value
}

export type { MessageKey }
