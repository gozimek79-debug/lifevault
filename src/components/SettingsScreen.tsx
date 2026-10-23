import { useState } from 'react'
import { useAuth } from '../app/auth'
import { useSettings, type FontScaleId } from '../app/settings'
import { useVault } from '../app/vault'
import { CONSENT_VERSION, readConsent } from '../lib/consent'
import { flushQueue } from '../lib/sync'
import { supabaseConfigured } from '../lib/supabase'
import { useI18n } from '../i18n/context'

const scales: { id: FontScaleId; label: 'fontSmall' | 'fontNormal' | 'fontLarge' | 'fontXLarge' }[] = [
  { id: 'sm', label: 'fontSmall' },
  { id: 'md', label: 'fontNormal' },
  { id: 'lg', label: 'fontLarge' },
  { id: 'xl', label: 'fontXLarge' },
]

export function SettingsScreen() {
  const { t, lang } = useI18n()
  const settings = useSettings()
  const { session, signOut } = useAuth()
  const vault = useVault()
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const consent = readConsent()
  const consentDate = consent ? new Date(consent.acceptedAt).toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-GB') : ''

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">{t('settingsTitle')}</h1>
      <p>{session?.mode === 'supabase' ? t('sessionCloud') : t('sessionDemo')}</p>
      <p>{t('encryptedNote')}</p>
      {consent ? <p>{t('consentStatus', { date: consentDate, version: CONSENT_VERSION })}</p> : null}
      <fieldset className="card flex flex-col gap-2">
        <legend className="font-semibold">{t('language')}</legend>
        <div className="flex gap-2">
          <button className={settings.lang === 'pl' ? 'tap-primary flex-1' : 'tap-ghost flex-1'} type="button" onClick={() => settings.setLang('pl')}>
            Polski
          </button>
          <button className={settings.lang === 'en' ? 'tap-primary flex-1' : 'tap-ghost flex-1'} type="button" onClick={() => settings.setLang('en')}>
            English
          </button>
        </div>
      </fieldset>
      <fieldset className="card flex flex-col gap-2">
        <legend className="font-semibold">{t('theme')}</legend>
        <div className="flex gap-2">
          <button className={settings.theme === 'light' ? 'tap-primary flex-1' : 'tap-ghost flex-1'} type="button" onClick={() => settings.setTheme('light')}>
            {t('themeLight')}
          </button>
          <button className={settings.theme === 'dark' ? 'tap-primary flex-1' : 'tap-ghost flex-1'} type="button" onClick={() => settings.setTheme('dark')}>
            {t('themeDark')}
          </button>
        </div>
      </fieldset>
      <fieldset className="card flex flex-col gap-2">
        <legend className="font-semibold">{t('fontScale')}</legend>
        {scales.map((scale) => (
          <button
            key={scale.id}
            className={settings.fontScale === scale.id ? 'tap-primary' : 'tap-ghost'}
            type="button"
            onClick={() => settings.setFontScale(scale.id)}
          >
            {t(scale.label)}
          </button>
        ))}
      </fieldset>
      {supabaseConfigured() ? (
        <button
          className="tap-ghost"
          type="button"
          onClick={() => {
            void flushQueue().then(() => setSyncNote(t('saved')))
          }}
        >
          {t('syncNow')}
        </button>
      ) : null}
      {syncNote ? <p>{syncNote}</p> : null}
      <button className="tap-ghost" type="button" onClick={() => vault.lock()}>
        {t('lockVault')}
      </button>
      <button className="tap-ghost" type="button" onClick={() => void signOut()}>
        {t('logout')}
      </button>
    </div>
  )
}
