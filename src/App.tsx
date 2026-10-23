import { useEffect, useState } from 'react'
import { useAuth } from './app/auth'
import { useSettings } from './app/settings'
import { useVault } from './app/vault'
import { AuthScreen } from './components/AuthScreen'
import { ConsentScreen } from './components/ConsentScreen'
import { Shell } from './components/Shell'
import { VaultGate } from './components/VaultGate'
import { useI18n } from './i18n/context'
import { readConsent } from './lib/consent'
import { markReminderNotified } from './lib/db'
import { listenForWorker, scheduleStoredReminders } from './lib/notifications'
import { flushQueue } from './lib/sync'

export function App() {
  const { ready: settingsReady } = useSettings()
  const { ready: authReady, session } = useAuth()
  const { ready: vaultReady, unlocked } = useVault()
  const { t } = useI18n()
  const [consentOk, setConsentOk] = useState(() => Boolean(readConsent()))

  useEffect(() => {
    if (!session || !unlocked) return
    const stop = listenForWorker(
      (id) => void markReminderNotified(id),
      () => void flushQueue(),
    )
    const onOnline = () => void flushQueue()
    window.addEventListener('online', onOnline)
    void flushQueue()
    void scheduleStoredReminders(session.householdId, (reminder) => ({
      title: t('reminderTitle', { title: reminder.title }),
      body: t('reminderBody', { days: String(reminder.daysBefore), date: reminder.dueOn }),
    }))
    return () => {
      stop()
      window.removeEventListener('online', onOnline)
    }
  }, [session, unlocked, t])

  if (!settingsReady || !authReady || !vaultReady) {
    return <main className="p-6 text-xl">{t('loading')}</main>
  }
  if (!consentOk) return <ConsentScreen onAccepted={() => setConsentOk(true)} />
  if (!session) return <AuthScreen />
  if (!unlocked) return <VaultGate />
  return <Shell />
}
