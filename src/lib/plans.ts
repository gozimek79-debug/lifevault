/**
 * Plany LifeVault. Limity są tu, a nie w tekście przycisków.
 * Solo: jedna osoba. Rodzinny: wspólny dom. Firmowy: to samo i kilka osób przy zadaniach.
 */

export const PLAN_LIMITS = {
  solo: { members: 1, monthlyCredits: 10, assignees: 1 },
  family: { members: 6, monthlyCredits: 40, assignees: 1 },
  company: { members: 6, monthlyCredits: 40, assignees: 8 },
} as const

/** Pakiet kredytów z Checkout. To nie jest miesięczny przydział ani pakiet testowy. */
export const CREDIT_PACK = 20

export type PlanId = keyof typeof PLAN_LIMITS

const PLAN_IDS: readonly PlanId[] = ['solo', 'family', 'company']

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value)
}

export function householdPlan(household: { plan?: string | null } | null | undefined): PlanId {
  return isPlanId(household?.plan) ? household.plan : 'solo'
}

/** memberCount liczy właściciela i zaproszenia. Solo przy jednej osobie już nie zaprasza. */
export function canInvite(plan: PlanId, memberCount: number): boolean {
  const count = Number.isFinite(memberCount) ? Math.max(0, Math.floor(memberCount)) : 0
  return count < PLAN_LIMITS[plan].members
}

/**
 * nextId null = zadanie bez osoby, zawsze wolno.
 * To samo id, które już jest przy zadaniu, nie zwiększa liczby osób.
 */
export function assigneeAllowed(plan: PlanId, assignedIds: readonly (string | null | undefined)[], nextId: string | null): boolean {
  if (!nextId) return true
  const assigned = new Set(assignedIds.filter((id): id is string => Boolean(id)))
  if (assigned.has(nextId)) return true
  return assigned.size < PLAN_LIMITS[plan].assignees
}
