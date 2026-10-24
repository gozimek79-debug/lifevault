/**
 * Checkout Stripe tylko w trybie testowym (klucz sk_test_).
 * Ceny i sekret biorą się ze środowiska funkcji. Przeglądarka ich nie widzi.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405)

  const secret = Deno.env.get('STRIPE_SECRET_KEY')?.trim() ?? ''
  if (!secret.startsWith('sk_test_')) return json({ ok: false, reason: 'config' }, 503)

  const userId = await userIdFrom(req)
  if (!userId) return json({ ok: false, reason: 'auth' }, 401)

  let body: { householdId?: unknown; kind?: unknown; plan?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, reason: 'json' }, 400)
  }
  const householdId = typeof body.householdId === 'string' ? body.householdId : ''
  const kind = body.kind === 'pack' || body.kind === 'plan' ? body.kind : null
  const plan = body.plan === 'solo' || body.plan === 'family' || body.plan === 'company' ? body.plan : null
  if (!UUID.test(householdId) || !kind || (kind === 'plan' && !plan)) return json({ ok: false, reason: 'input' }, 400)

  const member = await isMember(householdId, userId)
  if (!member) return json({ ok: false, reason: 'forbidden' }, 403)

  const price = priceFor(kind, plan)
  const success = Deno.env.get('STRIPE_SUCCESS_URL')?.trim() ?? ''
  const cancel = Deno.env.get('STRIPE_CANCEL_URL')?.trim() ?? ''
  if (!price || !success || !cancel) return json({ ok: false, reason: 'config' }, 503)

  const params = new URLSearchParams()
  params.set('mode', kind === 'pack' ? 'payment' : 'subscription')
  params.set('line_items[0][price]', price)
  params.set('line_items[0][quantity]', '1')
  params.set('success_url', success)
  params.set('cancel_url', cancel)
  params.set('client_reference_id', householdId)
  params.set('metadata[household_id]', householdId)
  params.set('metadata[kind]', kind)
  if (kind === 'plan' && plan) {
    params.set('metadata[plan]', plan)
    params.set('subscription_data[metadata][household_id]', householdId)
    params.set('subscription_data[metadata][plan]', plan)
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  if (!response.ok) return json({ ok: false, reason: 'stripe' }, 502)
  const payload = await response.json()
  if (typeof payload?.url !== 'string') return json({ ok: false, reason: 'stripe' }, 502)
  return json({ ok: true, url: payload.url })
})

function priceFor(kind: 'plan' | 'pack', plan: 'solo' | 'family' | 'company' | null): string {
  if (kind === 'pack') return Deno.env.get('STRIPE_PRICE_PACK')?.trim() ?? ''
  if (plan === 'family') return Deno.env.get('STRIPE_PRICE_FAMILY')?.trim() ?? ''
  if (plan === 'company') return Deno.env.get('STRIPE_PRICE_COMPANY')?.trim() ?? ''
  return Deno.env.get('STRIPE_PRICE_SOLO')?.trim() ?? ''
}

async function userIdFrom(req: Request): Promise<string | null> {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!jwt || !url || !anon) return null
  const response = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${jwt}`, apikey: anon } })
  if (!response.ok) return null
  const user = await response.json()
  return typeof user?.id === 'string' ? user.id : null
}

async function isMember(householdId: string, userId: string): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !service) return false
  const query = new URLSearchParams({
    household_id: `eq.${householdId}`,
    user_id: `eq.${userId}`,
    invite_status: 'eq.accepted',
    select: 'id',
  })
  const response = await fetch(`${url}/rest/v1/household_members?${query}`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  })
  if (!response.ok) return false
  const rows = await response.json()
  return Array.isArray(rows) && rows.length > 0
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
