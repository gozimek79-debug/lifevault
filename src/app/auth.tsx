import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { bytesToHex } from '../lib/codec'
import { bindConsent } from '../lib/consent'
import { ensureCreditAccount } from '../lib/credits'
import { getDemoUsers, getHousehold, putDemoUsers, putHousehold, putMember } from '../lib/db'
import { ensureRemoteHousehold } from '../lib/household'
import { getSupabase, supabaseConfigured } from '../lib/supabase'
import type { DemoUser, Session } from '../lib/types'

/**
 * Wejście: Supabase, gdy są oba klucze, inaczej lokalna sesja demo.
 * Hasło demo jest tylko skrótem logowania. Nie szyfruje dokumentów.
 */

const SESSION_KEY = 'lifevault.demoSession'
const GOOGLE_DEMO_EMAIL = 'demo.google@lifevault.local'
const GOOGLE_DEMO_MARK = 'demo-google'

interface AuthValue {
  ready: boolean
  session: Session | null
  configured: boolean
  signInEmail: (email: string, password: string) => Promise<void>
  signInGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const configured = supabaseConfigured()

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabase()
    if (!supabase) {
      void restoreDemo().then((next) => {
        if (cancelled) return
        setSession(next)
        setReady(true)
      })
      return () => {
        cancelled = true
      }
    }
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      void (async () => {
        if (!next?.user) {
          if (!cancelled) {
            setSession(null)
            setReady(true)
          }
          return
        }
        try {
          const householdId = await ensureRemoteHousehold(next.user.id, next.user.email ?? '')
          const resolved: Session = {
            mode: 'supabase',
            userId: next.user.id,
            email: next.user.email ?? '',
            householdId,
          }
          await bindConsent(resolved)
          if (!cancelled) setSession(resolved)
        } catch {
          if (!cancelled) setSession(null)
        } finally {
          if (!cancelled) setReady(true)
        }
      })()
    })
    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      session,
      configured,
      signInEmail: async (email, password) => {
        const normalized = email.trim().toLowerCase()
        if (password.length < 6 || !normalized.includes('@')) throw new Error('auth')
        if (!configured) {
          const next = await demoEmail(normalized, password)
          await bindConsent(next)
          setSession(next)
          return
        }
        const supabase = getSupabase()
        if (!supabase) throw new Error('auth')
        const attempt = await supabase.auth.signInWithPassword({ email: normalized, password })
        let user = attempt.data.user
        let cloudSession = attempt.data.session
        if (!cloudSession || !user) {
          const created = await supabase.auth.signUp({ email: normalized, password })
          if (created.error) throw new Error('auth')
          user = created.data.user
          cloudSession = created.data.session
          if (!cloudSession || !user) throw new Error('confirm-email')
        }
        const householdId = await ensureRemoteHousehold(user.id, user.email ?? normalized)
        const next: Session = { mode: 'supabase', userId: user.id, email: user.email ?? normalized, householdId }
        await bindConsent(next)
        setSession(next)
      },
      signInGoogle: async () => {
        if (!configured) {
          const next = await demoGoogle()
          await bindConsent(next)
          setSession(next)
          return
        }
        const supabase = getSupabase()
        if (!supabase) throw new Error('auth')
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        })
        if (error) throw new Error('auth')
      },
      signOut: async () => {
        localStorage.removeItem(SESSION_KEY)
        await getSupabase()?.auth.signOut()
        setSession(null)
      },
    }),
    [ready, session, configured],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('auth')
  return value
}

async function restoreDemo(): Promise<Session | null> {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const row = parsed as Partial<Session>
    if (!row.userId || !row.email || !row.householdId) return null
    const household = await getHousehold(row.householdId)
    if (!household) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    const session: Session = { mode: 'demo', userId: row.userId, email: row.email, householdId: row.householdId }
    await bindConsent(session)
    return session
  } catch {
    return null
  }
}

async function demoEmail(email: string, password: string): Promise<Session> {
  const users = await getDemoUsers()
  const passwordHash = await hashPassword(email, password)
  let user = users.find((item) => item.email === email)
  if (!user) {
    user = await createDemoUser(email, passwordHash, users)
  } else if (user.passwordHash !== passwordHash) {
    throw new Error('auth')
  }
  return persistDemo(user)
}

async function demoGoogle(): Promise<Session> {
  const users = await getDemoUsers()
  let user = users.find((item) => item.email === GOOGLE_DEMO_EMAIL)
  if (!user) user = await createDemoUser(GOOGLE_DEMO_EMAIL, GOOGLE_DEMO_MARK, users)
  return persistDemo(user)
}

async function createDemoUser(email: string, passwordHash: string, users: DemoUser[]): Promise<DemoUser> {
  const now = new Date().toISOString()
  const user: DemoUser = {
    id: crypto.randomUUID(),
    email,
    passwordHash,
    householdId: crypto.randomUUID(),
  }
  await putHousehold({ id: user.householdId, name: 'Dom', createdAt: now, plan: 'solo' })
  await putMember({
    id: crypto.randomUUID(),
    householdId: user.householdId,
    userId: user.id,
    email,
    role: 'owner',
    inviteStatus: 'accepted',
    createdAt: now,
  })
  await putDemoUsers([...users, user])
  await ensureCreditAccount(user.householdId)
  return user
}

function persistDemo(user: DemoUser): Session {
  const session: Session = { mode: 'demo', userId: user.id, email: user.email, householdId: user.householdId }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

async function hashPassword(email: string, password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`lifevault-demo:${email}:${password}`))
  return bytesToHex(new Uint8Array(digest))
}
