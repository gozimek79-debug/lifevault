import { useEffect, useState } from 'react'
import { useAuth } from '../app/auth'
import { useI18n } from '../i18n/context'
import { startCheckout, stripeCheckoutConfigured } from '../lib/checkout'
import { TEST_PACK_CREDITS, grantTestPack } from '../lib/credits'
import { getHousehold } from '../lib/db'
import { CREDIT_PACK, PLAN_LIMITS, householdPlan, type PlanId } from '../lib/plans'
import { ActionRow } from './chrome'

/**
 * Trzy plany w ustawieniach. Bez adresu Checkout widać limity i zdanie, że płatności nie ma.
 * Gospodarstwo demo zostawia osobny, podpisany przycisk kredytów testowych.
 */

const ORDER: PlanId[] = ['solo', 'family', 'company']

const COPY = {
  solo: { title: 'planSolo', body: 'planSoloBody' },
  family: { title: 'planFamily', body: 'planFamilyBody' },
  company: { title: 'planCompany', body: 'planCompanyBody' },
} as const

const TONE: Record<PlanId, string> = {
  solo: 'border-t-teal-700',
  family: 'border-t-amber-700',
  company: 'border-t-indigo-700',
}

export function PlansSection() {
  const { t } = useI18n()
  const { session } = useAuth()
  const [plan, setPlan] = useState<PlanId>('solo')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const payments = stripeCheckoutConfigured() && session?.mode === 'supabase'

  useEffect(() => {
    if (!session) return
    void getHousehold(session.householdId).then((household) => setPlan(householdPlan(household)))
  }, [session])

  async function choose(next: PlanId) {
    if (!session || busy) return
    setBusy(true)
    setNote(null)
    try {
      window.location.assign(await startCheckout(session.householdId, { kind: 'plan', plan: next }))
    } catch {
      setNote(t('planCheckoutFailed'))
      setBusy(false)
    }
  }

  async function addTestCredits() {
    if (!session || busy) return
    setBusy(true)
    setNote(null)
    try {
      await grantTestPack(session.householdId)
      setNote(t('planCreditsAdded', { count: String(TEST_PACK_CREDITS) }))
    } catch {
      setNote(t('planCheckoutFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="plany" className="flex flex-col gap-4">
      <header className="max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight">{t('plansTitle')}</h2>
        <p className="mt-1 text-stone-600 dark:text-stone-400">{t('plansLead')}</p>
      </header>
      <div className="grid gap-3 md:grid-cols-3">
        {ORDER.map((id) => {
          const limits = PLAN_LIMITS[id]
          const current = id === plan
          return (
            <article key={id} className={`card border-t-4 ${TONE[id]} flex flex-col gap-2`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{t(COPY[id].title)}</h3>
                {current ? <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold dark:bg-stone-800">{t('planCurrent')}</span> : null}
              </div>
              <p className="text-sm text-stone-600 dark:text-stone-300">
                {t(COPY[id].body, {
                  credits: String(limits.monthlyCredits),
                  members: String(limits.members),
                  assignees: String(limits.assignees),
                })}
              </p>
              {payments && !current ? (
                <ActionRow hint={t('planCheckoutHint')}>
                  <button className="tap-ghost" type="button" disabled={busy} onClick={() => void choose(id)}>
                    {t('planChoose')}
                  </button>
                </ActionRow>
              ) : null}
            </article>
          )
        })}
      </div>
      {payments ? (
        <ActionRow hint={t('planPackHint', { count: String(CREDIT_PACK) })}>
          <button
            className="tap-ghost"
            type="button"
            disabled={busy}
            onClick={() => {
              if (!session || busy) return
              setBusy(true)
              void startCheckout(session.householdId, { kind: 'pack' })
                .then((url) => window.location.assign(url))
                .catch(() => {
                  setNote(t('planCheckoutFailed'))
                  setBusy(false)
                })
            }}
          >
            {t('planPack')}
          </button>
        </ActionRow>
      ) : (
        <p className="text-sm text-stone-600 dark:text-stone-400">{t('planPaymentOff')}</p>
      )}
      {session?.mode === 'demo' ? (
        <ActionRow hint={t('planTestCreditsHint')}>
          <button className="tap-ghost" type="button" disabled={busy} onClick={() => void addTestCredits()}>
            {t('planTestCredits')}
          </button>
        </ActionRow>
      ) : null}
      {note ? <p role="status">{note}</p> : null}
    </section>
  )
}
