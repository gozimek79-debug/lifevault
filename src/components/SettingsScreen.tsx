import { useEffect, useState } from 'react'
import { useAuth } from '../app/auth'
import { useNav } from '../app/nav'
import { useVault } from '../app/vault'
import { CONSENT_VERSION, readConsent } from '../lib/consent'
import { flushQueue } from '../lib/sync'
import { supabaseConfigured } from '../lib/supabase'
import { useI18n } from '../i18n/context'
import { AppearanceTools } from './AppearanceTools'
import { ActionRow, PageIntro } from './chrome'
import { PlansSection } from './PlansSection'

/** Na wąskim ekranie język, motyw, skala i rodzina są tutaj. Na szerokim zostają w pasku. */

export function SettingsScreen() {
  const { t, lang } = useI18n()
  const { openHousehold } = useNav()
  const { session, signOut } = useAuth()
  const vault = useVault()
  const online = useOnline()
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const consent = readConsent()
  const consentDate = consent ? new Date(consent.acceptedAt).toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-GB') : ''

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageIntro title={t('settingsTitle')} lede={session?.mode === 'supabase' ? t('sessionCloud') : t('sessionDemo')} />
      <PlansSection />
      <div className="flex flex-col gap-3 lg:hidden">
        <div className="flex flex-col items-start gap-2">
          <AppearanceTools labeled />
        </div>
        <p className="inline-flex items-center gap-1.5 text-sm text-stone-500 dark:text-stone-400">
          <span className={`size-1.5 rounded-full ${online ? 'bg-teal-600' : 'bg-stone-400'}`} />
          {online ? t('online') : t('offline')}
        </p>
        <button className="text-link" type="button" onClick={openHousehold}>
          {t('household')}
        </button>
      </div>
      <p className="max-w-xl text-sm text-stone-600 dark:text-stone-400">{t('encryptedNote')}</p>
      {consent ? <p className="text-sm text-stone-600 dark:text-stone-400">{t('consentStatus', { date: consentDate, version: CONSENT_VERSION })}</p> : null}
      {supabaseConfigured() ? (
        <ActionRow hint={t('syncNowHint')}>
          <button
            className="tap-ghost"
            type="button"
            onClick={() => {
              void flushQueue().then(() => setSyncNote(t('saved')))
            }}
          >
            {t('syncNow')}
          </button>
        </ActionRow>
      ) : null}
      {syncNote ? <p role="status">{syncNote}</p> : null}
      <ActionRow hint={t('lockVaultHint')}>
        <button className="tap-ghost" type="button" onClick={() => vault.lock()}>
          {t('lockVault')}
        </button>
      </ActionRow>
      <ActionRow hint={t('logoutHint')}>
        <button className="tap-ghost" type="button" onClick={() => void signOut()}>
          {t('logout')}
        </button>
      </ActionRow>
    </div>
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
