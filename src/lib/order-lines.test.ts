import { describe, expect, it } from 'vitest'
import { compareOrderLines, splitOrderLines } from './order-lines'

describe('compareOrderLines', () => {
  it('rozdziela zgodne, brakujące i dodatkowe linie', () => {
    const extracted = splitOrderLines('2x Mleko\nChleb\n- Masło 200g\n1. Jajka')
    expect(extracted).toEqual(['2x Mleko', 'Chleb', 'Masło 200g', 'Jajka'])
    expect(compareOrderLines(['mleko', 'chleb', 'jajka'], ['2x Mleko', 'Chleb', 'Masło 200g'])).toEqual({
      matched: ['mleko', 'chleb'],
      missing: ['jajka'],
      extra: ['Masło 200g'],
    })
  })

  it('składa polskie znaki i nie używa jednej linii zdjęcia dwa razy', () => {
    expect(compareOrderLines(['Żółty ser', 'żółty ser'], ['zolty ser 200g'])).toEqual({
      matched: ['Żółty ser'],
      missing: ['żółty ser'],
      extra: [],
    })
  })
})