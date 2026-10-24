import { describe, expect, it } from 'vitest'
import { isPartnerPolicy } from './policy'

describe('polisa do linku partnera', () => {
  it('poznaje ubezpieczenie i energię, a gwarancji nie', () => {
    expect(isPartnerPolicy({ title: 'Polisa OC mieszkania' })).toBe(true)
    expect(isPartnerPolicy({ extractedText: 'Taryfa G11, energia 2400 kWh' })).toBe(true)
    expect(isPartnerPolicy({ title: 'Gwarancja pralki', vendor: 'Sklep AGD' })).toBe(false)
    expect(isPartnerPolicy({ title: 'Gazeta lokalna' })).toBe(false)
  })
})
