/**
 * Adresy z otoczenia. Puste zostają puste: nie dokładamy numeru partnera ani klucza Stripe.
 */

import { getSupabase } from './supabase'
import type { PlanId } from './plans'

export function stripeCheckoutConfigured(): boolean {
  return Boolean(import.meta.env.VITE_STRIPE_CHECKOUT_URL?.trim())
}

export function compareOffersUrl(): string | null {
  const raw = import.meta.env.VITE_COMPARE_OFFERS_URL?.trim() ?? ''
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString()
  } catch {
    return null
  }
}

export async function startCheckout(householdId: string, input: { kind: 'plan'; plan: PlanId } | { kind: 'pack' }): Promise<string> {
  const endpoint = import.meta.env.VITE_STRIPE_CHECKOUT_URL?.trim()
  const supabase = getSupabase()
  if (!endpoint || !supabase) throw new Error('config')
  const session = await supabase.auth.getSession()
  const token = session.data.session?.access_token
  if (!token) throw new Error('auth')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      householdId,
      kind: input.kind,
      plan: input.kind === 'plan' ? input.plan : undefined,
    }),
  })
  if (!response.ok) throw new Error('checkout')
  const payload = (await response.json()) as { url?: unknown }
  if (typeof payload.url !== 'string' || !payload.url.startsWith('https://')) throw new Error('checkout')
  return payload.url
}
