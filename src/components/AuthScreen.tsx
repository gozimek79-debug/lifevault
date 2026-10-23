import { useState, type FormEvent } from 'react'
import { useAuth } from '../app/auth'
import { useI18n } from '../i18n/context'

export function AuthScreen() {
  const { t } = useI18n()
  const { configured, signInEmail, signInGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signInEmail(email, password)
    } catch (caught) {
      setError(caught instanceof Error && caught.message === 'confirm-email' ? t('confirmEmail') : t('authFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 px-4 py-8">
      <p className="text-sm font-semibold text-teal-900 dark:text-teal-300">{t('appName')}</p>
      <h1 className="text-3xl font-semibold">{t('authTitle')}</h1>
      <p>{t('authLead')}</p>
      <p className="card">{configured ? t('cloudModeBanner') : t('demoModeBanner')}</p>
      <form className="flex flex-col gap-3" onSubmit={(event) => void onSubmit(event)}>
        <label className="label" htmlFor="email">
          {t('email')}
        </label>
        <input id="email" className="field" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <label className="label" htmlFor="password">
          {t('password')}
        </label>
        <input
          id="password"
          className="field"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={6}
        />
        {error ? <p role="alert">{error}</p> : null}
        <button className="tap-primary" type="submit" disabled={busy}>
          {t('signIn')}
        </button>
      </form>
      <button
        className="tap-ghost"
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setError(null)
          void signInGoogle()
            .catch(() => setError(t('authFailed')))
            .finally(() => setBusy(false))
        }}
      >
        {t('google')}
      </button>
      {configured ? null : <p>{t('demoGoogleNote')}</p>}
    </main>
  )
}
