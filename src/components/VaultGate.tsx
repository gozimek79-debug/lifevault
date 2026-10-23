import { useState, type FormEvent } from 'react'
import { useVault } from '../app/vault'
import { VaultPassphraseError } from '../lib/crypto-vault'
import { useI18n } from '../i18n/context'

export function VaultGate() {
  const { t } = useI18n()
  const vault = useVault()
  const [passphrase, setPassphrase] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const creating = !vault.hasVault

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (passphrase.length < 8) {
      setError(t('passphraseShort'))
      return
    }
    if (creating && passphrase !== again) {
      setError(t('passphraseMismatch'))
      return
    }
    setBusy(true)
    try {
      if (creating) await vault.create(passphrase)
      else await vault.unlock(passphrase)
    } catch (caught) {
      setError(caught instanceof VaultPassphraseError ? t('passphraseWrong') : t('passphraseShort'))
    } finally {
      setPassphrase('')
      setAgain('')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 px-4 py-8">
      <h1 className="text-3xl font-semibold">{creating ? t('vaultCreateTitle') : t('vaultUnlockTitle')}</h1>
      <p>{creating ? t('vaultCreateLead') : t('vaultUnlockLead')}</p>
      <form className="flex flex-col gap-3" onSubmit={(event) => void onSubmit(event)}>
        <label className="label" htmlFor="passphrase">
          {t('passphrase')}
        </label>
        <input
          id="passphrase"
          className="field"
          type="password"
          autoComplete={creating ? 'new-password' : 'current-password'}
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          required
        />
        {creating ? (
          <>
            <label className="label" htmlFor="passphrase-again">
              {t('passphraseAgain')}
            </label>
            <input
              id="passphrase-again"
              className="field"
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(event) => setAgain(event.target.value)}
              required
            />
          </>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <button className="tap-primary" type="submit" disabled={busy}>
          {creating ? t('vaultCreate') : t('vaultUnlock')}
        </button>
      </form>
    </main>
  )
}
