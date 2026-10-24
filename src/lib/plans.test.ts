import { describe, expect, it } from 'vitest'
import { PLAN_LIMITS, assigneeAllowed, canInvite } from './plans'

describe('bramki planów', () => {
  it('Solo nie zaprasza drugiej osoby, Rodzinny i Firmowy tak', () => {
    expect(PLAN_LIMITS.solo.members).toBe(1)
    expect(canInvite('solo', 1)).toBe(false)
    expect(canInvite('solo', 0)).toBe(true)
    expect(canInvite('family', 1)).toBe(true)
    expect(canInvite('family', 5)).toBe(true)
    expect(canInvite('family', 6)).toBe(false)
    expect(canInvite('company', 5)).toBe(true)
    expect(canInvite('company', 6)).toBe(false)
  })

  it('kilka osób przy zadaniach jest tylko w planie Firmowym', () => {
    expect(PLAN_LIMITS.solo.assignees).toBe(1)
    expect(PLAN_LIMITS.family.assignees).toBe(1)
    expect(PLAN_LIMITS.company.assignees).toBe(8)
    expect(assigneeAllowed('solo', [], 'karol')).toBe(true)
    expect(assigneeAllowed('solo', [], null)).toBe(true)
    expect(assigneeAllowed('solo', ['karol'], 'karol')).toBe(true)
    expect(assigneeAllowed('solo', ['karol'], 'zosia')).toBe(false)
    expect(assigneeAllowed('family', ['karol'], 'zosia')).toBe(false)
    expect(assigneeAllowed('company', ['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'h')).toBe(true)
    expect(assigneeAllowed('company', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'i')).toBe(false)
    expect(assigneeAllowed('company', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'a')).toBe(true)
  })
})
