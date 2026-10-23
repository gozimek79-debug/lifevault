import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/** Język, motyw i skala tekstu zostają w przeglądarce. To nie są sekrety. */

export type Lang = 'pl' | 'en'
export type Theme = 'light' | 'dark'
export type FontScaleId = 'sm' | 'md' | 'lg' | 'xl'

const SCALES: Record<FontScaleId, number> = {
  sm: 0.9,
  md: 1,
  lg: 1.15,
  xl: 1.35,
}

interface SettingsValue {
  ready: boolean
  lang: Lang
  theme: Theme
  fontScale: FontScaleId
  setLang: (lang: Lang) => void
  setTheme: (theme: Theme) => void
  setFontScale: (scale: FontScaleId) => void
}

const SettingsContext = createContext<SettingsValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('pl')
  const [theme, setThemeState] = useState<Theme>('light')
  const [fontScale, setFontScaleState] = useState<FontScaleId>('md')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setLangState(readLang(localStorage.getItem('lifevault.lang')))
    setThemeState(localStorage.getItem('lifevault.theme') === 'dark' ? 'dark' : 'light')
    setFontScaleState(readScale(localStorage.getItem('lifevault.fontScale')))
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    document.documentElement.lang = lang
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.setProperty('--lv-scale', String(SCALES[fontScale]))
    localStorage.setItem('lifevault.lang', lang)
    localStorage.setItem('lifevault.theme', theme)
    localStorage.setItem('lifevault.fontScale', fontScale)
  }, [ready, lang, theme, fontScale])

  const value = useMemo<SettingsValue>(
    () => ({
      ready,
      lang,
      theme,
      fontScale,
      setLang: setLangState,
      setTheme: setThemeState,
      setFontScale: setFontScaleState,
    }),
    [ready, lang, theme, fontScale],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('settings')
  return value
}

function readLang(value: string | null): Lang {
  return value === 'en' ? 'en' : 'pl'
}

function readScale(value: string | null): FontScaleId {
  if (value === 'sm' || value === 'lg' || value === 'xl') return value
  return 'md'
}
