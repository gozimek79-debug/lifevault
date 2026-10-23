import { useState } from 'react'
import { acceptConsent } from '../lib/consent'
import { useI18n } from '../i18n/context'

export function ConsentScreen({ onAccepted }: { onAccepted: () => void }) {
  const { t } = useI18n()
  const [store, setStore] = useState(false)
  const [passphrase, setPassphrase] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 px-4 py-8">
      <p className="text-sm font-semibold text-teal-900 dark:text-teal-300">{t('appName')}</p>
      <h1 className="text-3xl font-semibold">{t('consentTitle')}</h1>
      <p>{t('consentLead')}</p>
      <ul className="card space-y-3">
        <li>{t('consentStore')}</li>
        <li>{t('consentEncrypt')}</li>
        <li>{t('consentCamera')}</li>
        <li>{t('consentCloud')}</li>
      </ul>
      <label className="card flex gap-3">
        <input type="checkbox" className="mt-1 size-6" checked={store} onChange={(event) => setStore(event.target.checked)} />
        <span>{t('consentStore')}</span>
      </label>
      <label className="card flex gap-3">
        <input
          type="checkbox"
          className="mt-1 size-6"
          checked={passphrase}
          onChange={(event) => setPassphrase(event.target.checked)}
        />
        <span>{t('consentPassphrase')}</span>
      </label>
      {blocked ? <p role="alert">{t('consentBlocked')}</p> : null}
      <button
        className="tap-primary"
        disabled={!store || !passphrase || busy}
        onClick={() => {
          setBusy(true)
          void acceptConsent().then(() => onAccepted())
        }}
      >
        {t('consentAccept')}
      </button>
      <button className="tap-ghost" type="button" onClick={() => setBlocked(true)}>
        {t('consentDecline')}
      </button>
    </main>
  )
}
