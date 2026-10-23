import { describe, expect, it } from 'vitest'
import { ANALYSIS_COST, TEST_PACK_CREDITS, WELCOME_CREDITS, addCredits, deductCredit } from './credits'

describe('deductCredit', () => {
  it('pobiera 1 kredyt z powitalnego salda', () => {
    expect(ANALYSIS_COST).toBe(1)
    expect(WELCOME_CREDITS).toBe(3)
    expect(deductCredit(WELCOME_CREDITS)).toEqual({ ok: true, balance: 2 })
  })

  it('schodzi do zera i przy zerze odmawia, bez salda ujemnego', () => {
    expect(deductCredit(1)).toEqual({ ok: true, balance: 0 })
    expect(deductCredit(0)).toEqual({ ok: false, balance: 0 })
    expect(deductCredit(-4)).toEqual({ ok: false, balance: 0 })
    expect(deductCredit(Number.NaN).balance).toBe(0)
    expect(deductCredit(2, 5)).toEqual({ ok: false, balance: 2 })
  })

  it('pakiet testowy dodaje kredyty i nie schodzi poniżej zera', () => {
    expect(TEST_PACK_CREDITS).toBe(5)
    expect(addCredits(0, TEST_PACK_CREDITS)).toBe(5)
    expect(addCredits(2, TEST_PACK_CREDITS)).toBe(7)
    expect(addCredits(1, -3)).toBe(1)
    expect(addCredits(Number.POSITIVE_INFINITY, 5)).toBe(5)
  })
})
