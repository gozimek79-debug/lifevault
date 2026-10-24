/**
 * Czyta zdarzenie Stripe i mówi, jaki plan ustawić i ile kredytów dopisać.
 * Nie woła Stripe i nie zna sekretu. Puste identyfikatory cen niczego nie łapią.
 */

import { CREDIT_PACK, PLAN_LIMITS, isPlanId, type PlanId } from './plans'

export interface PriceMap {
  solo: string
  family: string
  company: string
  pack: string
}

export interface BillingEffect {
  eventId: string
  householdId: string
  plan: PlanId | null
  credits: number
  reason: 'plan' | 'pack' | null
  customerId: string | null
  duplicate: boolean
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function interpretStripeEvent(event: unknown, prices: PriceMap, seen: ReadonlySet<string>): BillingEffect | null {
  if (!event || typeof event !== 'object') return null
  const record = event as Record<string, unknown>
  const eventId = asString(record.id)
  const type = asString(record.type)
  const object = objectOf(record.data)
  if (!eventId || !type || !object) return null
  const householdId = householdIdOf(object)
  if (!householdId) return null
  if (seen.has(eventId)) {
    return { eventId, householdId, plan: null, credits: 0, reason: null, customerId: null, duplicate: true }
  }

  const customerId = asString(object.customer)
  if (type === 'checkout.session.completed') return fromCheckout(eventId, householdId, customerId, object, prices)
  if (type === 'invoice.paid') return fromInvoice(eventId, householdId, customerId, object, prices)
  if (type === 'customer.subscription.deleted') return planOnly(eventId, householdId, customerId, 'solo')
  if (type === 'customer.subscription.updated') return fromSubscription(eventId, householdId, customerId, object, prices)
  return null
}

function fromCheckout(
  eventId: string,
  householdId: string,
  customerId: string | null,
  object: Record<string, unknown>,
  prices: PriceMap,
): BillingEffect | null {
  const metadata = meta(object)
  const mode = asString(object.mode)
  if (mode === 'payment' || metadata.kind === 'pack') {
    const priced = priceIds(object).includes(prices.pack) && prices.pack.length > 0
    if (metadata.kind !== 'pack' && !priced) return null
    if (mode === 'subscription') return null
    return effect(eventId, householdId, customerId, null, CREDIT_PACK, 'pack')
  }
  if (mode !== 'subscription' && !isPlanId(metadata.plan)) return null
  const plan = isPlanId(metadata.plan) ? metadata.plan : planFromPrices(priceIds(object), prices)
  if (!plan) return null
  return effect(eventId, householdId, customerId, plan, PLAN_LIMITS[plan].monthlyCredits, 'plan')
}

function fromInvoice(
  eventId: string,
  householdId: string,
  customerId: string | null,
  object: Record<string, unknown>,
  prices: PriceMap,
): BillingEffect | null {
  const reason = asString(object.billing_reason)
  if (reason !== 'subscription_cycle') return null
  const plan = planFromPrices(priceIds(object), prices) ?? planFromMeta(meta(object).plan)
  if (!plan) return null
  return effect(eventId, householdId, customerId, plan, PLAN_LIMITS[plan].monthlyCredits, 'plan')
}

function fromSubscription(
  eventId: string,
  householdId: string,
  customerId: string | null,
  object: Record<string, unknown>,
  prices: PriceMap,
): BillingEffect | null {
  const status = asString(object.status)
  if (status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired') {
    return planOnly(eventId, householdId, customerId, 'solo')
  }
  if (status !== 'active' && status !== 'trialing') return null
  const plan = planFromPrices(priceIds(object), prices) ?? planFromMeta(meta(object).plan)
  if (!plan) return null
  return planOnly(eventId, householdId, customerId, plan)
}

function planOnly(eventId: string, householdId: string, customerId: string | null, plan: PlanId): BillingEffect {
  return effect(eventId, householdId, customerId, plan, 0, null)
}

function effect(
  eventId: string,
  householdId: string,
  customerId: string | null,
  plan: PlanId | null,
  credits: number,
  reason: 'plan' | 'pack' | null,
): BillingEffect {
  return { eventId, householdId, plan, credits, reason, customerId, duplicate: false }
}

function planFromPrices(ids: string[], prices: PriceMap): PlanId | null {
  for (const id of ids) {
    if (prices.company && id === prices.company) return 'company'
    if (prices.family && id === prices.family) return 'family'
    if (prices.solo && id === prices.solo) return 'solo'
  }
  return null
}

function planFromMeta(value: string | undefined): PlanId | null {
  return isPlanId(value) ? value : null
}

function householdIdOf(object: Record<string, unknown>): string | null {
  const own = meta(object).household_id || asString(object.client_reference_id)
  if (isUuid(own)) return own
  for (const nested of [object.subscription_details, parentSubscription(object)]) {
    if (!nested || typeof nested !== 'object') continue
    const id = meta(nested as Record<string, unknown>).household_id
    if (isUuid(id)) return id
  }
  return null
}

function parentSubscription(object: Record<string, unknown>): Record<string, unknown> | null {
  const parent = object.parent
  if (!parent || typeof parent !== 'object') return null
  const details = (parent as Record<string, unknown>).subscription_details
  return details && typeof details === 'object' ? (details as Record<string, unknown>) : null
}

function priceIds(object: Record<string, unknown>): string[] {
  const found: string[] = []
  collectPrices(object.lines, found)
  collectPrices(object.line_items, found)
  collectPrices(object.items, found)
  return found
}

function collectPrices(node: unknown, found: string[]): void {
  if (!node || typeof node !== 'object') return
  const data = (node as { data?: unknown }).data
  if (!Array.isArray(data)) return
  for (const row of data) {
    if (!row || typeof row !== 'object') continue
    const price = (row as { price?: unknown }).price
    if (typeof price === 'string' && price) found.push(price)
    else if (price && typeof price === 'object') {
      const id = asString((price as { id?: unknown }).id)
      if (id) found.push(id)
    }
  }
}

function meta(object: Record<string, unknown>): Record<string, string> {
  const raw = object.metadata
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

function objectOf(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null
  const object = (data as { object?: unknown }).object
  return object && typeof object === 'object' ? (object as Record<string, unknown>) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID.test(value))
}
