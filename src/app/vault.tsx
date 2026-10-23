import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createVault, unlockVault, VAULT_ITERATIONS, VaultPassphraseError } from '../lib/crypto-vault'
import { getVault, putVault } from '../lib/db'
import { useAuth } from './auth'

/**
 * Klucz AES siedzi wyłącznie w stanie React tej karty.
 * Odświeżenie albo wylogowanie czyści go z pamięci. Hasło nie jest zapisywane.
 */

interface VaultValue {
  ready: boolean
  unlocked: boolean
  hasVault: boolean
  key: CryptoKey | null
  saltB64: string | null
  create: (passphrase: string) => Promise<void>
  unlock: (passphrase: string) => Promise<void>
  lock: () => void
}

const VaultContext = createContext<VaultValue | null>(null)

export function VaultProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [key, setKey] = useState<CryptoKey | null>(null)
  const [saltB64, setSaltB64] = useState<string | null>(null)
  const [hasVault, setHasVault] = useState(false)
  const [ready, setReady] = useState(false)
  const userId = session?.userId ?? null

  useEffect(() => {
    let cancelled = false
    setKey(null)
    setSaltB64(null)
    if (!userId) {
      setHasVault(false)
      setReady(true)
      return
    }
    setReady(false)
    void getVault(userId).then((record) => {
      if (cancelled) return
      setHasVault(Boolean(record))
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  const value = useMemo<VaultValue>(
    () => ({
      ready,
      unlocked: key !== null,
      hasVault,
      key,
      saltB64,
      create: async (passphrase) => {
        if (!userId) return
        if (passphrase.length < 8) throw new Error('short')
        const created = await createVault(passphrase)
        await putVault({
          userId,
          saltB64: created.saltB64,
          iterations: VAULT_ITERATIONS,
          verifier: created.verifier,
        })
        setHasVault(true)
        setSaltB64(created.saltB64)
        setKey(created.key)
      },
      unlock: async (passphrase) => {
        if (!userId) return
        const record = await getVault(userId)
        if (!record) throw new VaultPassphraseError()
        const next = await unlockVault(passphrase, record.saltB64, record.verifier)
        setSaltB64(record.saltB64)
        setKey(next)
      },
      lock: () => {
        setKey(null)
        setSaltB64(null)
      },
    }),
    [ready, key, saltB64, hasVault, userId],
  )

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault(): VaultValue {
  const value = useContext(VaultContext)
  if (!value) throw new Error('vault')
  return value
}
