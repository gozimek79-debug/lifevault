import { useState } from 'react'
import { useAuth } from '../app/auth'
import { useVault } from '../app/vault'
import { CONSENT_VERSION, readConsent } from '../lib/consent'
import { flushQueue } from '../lib/sync'
import { supabaseConfigured } from '../lib/supabase'
import { useI18n } from '../i18n/context'
import { ActionRow, PageIntro } from './chrome'

/** Język, motyw i skala są w pasku. Tu zostaje sesja, kolejka i zamknięcie sejfu. */

export function SettingsScreen() {
  const { t, lang } = useI18n()
  const { session, signOut } = useAuth()
  const vault = useVault()
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const consent = readConsent()
  const consentDate = consent ? new Date(consent.acceptedAt).toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-GB') : ''

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageIntro title={t('settingsTitle')} lede={session?.mode === 'supabase' ? t('sessionCloud') : t('sessionDemo')} />
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
