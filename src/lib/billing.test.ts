import { describe, expect, it } from 'vitest'
import { CREDIT_PACK, PLAN_LIMITS } from './plans'
import { interpretStripeEvent, type PriceMap } from './billing'

const prices: PriceMap = {
  solo: 'price_solo',
  family: 'price_family',
  company: 'price_company',
  pack: 'price_pack',
}

const HOUSE = '11111111-1111-4111-8111-111111111111'

describe('kredyty ze zdarzenia Stripe', () => {
  it('Checkout miesięczny ustawia plan i dopisuje przydział', () => {
    const effect = interpretStripeEvent(checkout('evt_plan', 'subscription', { plan: 'family' }), prices, new Set())
    expect(effect).toMatchObject({
      eventId: 'evt_plan',
      householdId: HOUSE,
      plan: 'family',
      credits: PLAN_LIMITS.family.monthlyCredits,
      reason: 'plan',
      duplicate: false,
    })
    expect(PLAN_LIMITS.solo.monthlyCredits).toBe(10)
    expect(PLAN_LIMITS.family.monthlyCredits).toBe(40)
    expect(PLAN_LIMITS.company.monthlyCredits).toBe(40)
  })

  it('pakiet dopisuje kredyty i nie zmienia planu', () => {
    const effect = interpretStripeEvent(checkout('evt_pack', 'payment', { kind: 'pack' }), prices, new Set())
    expect(effect).toMatchObject({
      plan: null,
      credits: CREDIT_PACK,
      reason: 'pack',
      duplicate: false,
    })
    expect(CREDIT_PACK).toBe(20)
  })

  it('to samo zdarzenie drugi raz nie dopisuje kredytów', () => {
    const event = checkout('evt_plan', 'subscription', { plan: 'solo' })
    const first = interpretStripeEvent(event, prices, new Set())
    const second = interpretStripeEvent(event, prices, new Set([first?.eventId ?? '']))
    expect(first?.credits).toBe(10)
    expect(second).toMatchObject({ duplicate: true, credits: 0, plan: null, reason: null })
  })

  it('odnowienie faktury dopisuje miesiąc, a pierwsze wystawienie zostawia Checkoutowi', () => {
    const renewal = interpretStripeEvent(invoice('evt_cycle', 'subscription_cycle', 'price_company'), prices, new Set())
    const firstBill = interpretStripeEvent(invoice('evt_create', 'subscription_create', 'price_company'), prices, new Set())
    expect(renewal).toMatchObject({ plan: 'company', credits: 40, reason: 'plan' })
    expect(firstBill).toBeNull()
  })

  it('nieznana cena, brak domu i koniec subskrypcji', () => {
    expect(interpretStripeEvent(checkout('evt_x', 'subscription', { plan: 'gold' }), prices, new Set())).toBeNull()
    expect(interpretStripeEvent({ id: 'evt_y', type: 'checkout.session.completed', data: { object: { mode: 'payment', metadata: { kind: 'pack' } } } }, prices, new Set())).toBeNull()
    const ended = interpretStripeEvent(
      {
        id: 'evt_end',
        type: 'customer.subscription.deleted',
        data: { object: { metadata: { household_id: HOUSE }, customer: 'cus_test' } },
      },
      prices,
      new Set(),
    )
    expect(ended).toMatchObject({ plan: 'solo', credits: 0, reason: null, customerId: 'cus_test' })
  })
})

function checkout(id: string, mode: string, metadata: Record<string, string>) {
  return {
    id,
    type: 'checkout.session.completed',
    data: {
      object: {
        mode,
        client_reference_id: HOUSE,
        customer: 'cus_test',
        metadata: { household_id: HOUSE, ...metadata },
      },
    },
  }
}

function invoice(id: string, billingReason: string, price: string) {
  return {
    id,
    type: 'invoice.paid',
    data: {
      object: {
        billing_reason: billingReason,
        customer: 'cus_test',
        parent: { subscription_details: { metadata: { household_id: HOUSE } } },
        lines: { data: [{ price: { id: price } }] },
      },
    },
  }
}
