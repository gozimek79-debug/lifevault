/**
 * Webhook Stripe. Najpierw podpis, potem ta sama decyzja co src/lib/billing.ts.
 * Sekret nie wraca do przeglądarki. Zapis robi apply_billing_event, raz na zdarzenie.
 */

import { interpretStripeEvent, type PriceMap } from '../../../src/lib/billing.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405)
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')?.trim() ?? ''
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? ''
  const url = Deno.env.get('SUPABASE_URL')?.trim() ?? ''
  if (!secret || !service || !url) return json({ ok: false, reason: 'config' }, 503)

  const raw = await req.text()
  const header = req.headers.get('Stripe-Signature') ?? ''
  const signed = await verifyStripe(raw, header, secret)
  if (!signed) return json({ ok: false, reason: 'signature' }, 400)

  let event: unknown
  try {
    event = JSON.parse(raw)
  } catch {
    return json({ ok: false, reason: 'json' }, 400)
  }

  const effect = interpretStripeEvent(event, pricesFromEnv(), new Set())
  if (!effect) return json({ ok: true, ignored: true })

  const response = await fetch(`${url}/rest/v1/rpc/apply_billing_event`, {
    method: 'POST',
    headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hid: effect.householdId,
      next_plan: effect.plan,
      credit_delta: effect.credits,
      event_id: effect.eventId,
      grant_reason: effect.reason,
      stripe_customer: effect.customerId,
    }),
  })
  if (!response.ok) return json({ ok: false, reason: 'apply' }, 500)
  const balance = await response.json()
  return json({ ok: true, balance })
})

function pricesFromEnv(): PriceMap {
  return {
    solo: Deno.env.get('STRIPE_PRICE_SOLO')?.trim() ?? '',
    family: Deno.env.get('STRIPE_PRICE_FAMILY')?.trim() ?? '',
    company: Deno.env.get('STRIPE_PRICE_COMPANY')?.trim() ?? '',
    pack: Deno.env.get('STRIPE_PRICE_PACK')?.trim() ?? '',
  }
}

async function verifyStripe(raw: string, header: string, secret: string): Promise<boolean> {
  const parts = new Map(header.split(',').map((part) => {
    const index = part.indexOf('=')
    return [part.slice(0, index), part.slice(index + 1)] as const
  }))
  const timestamp = parts.get('t') ?? ''
  const signature = parts.get('v1') ?? ''
  if (!timestamp || !signature) return false
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${raw}`))
  const hex = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  if (hex.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i += 1) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
