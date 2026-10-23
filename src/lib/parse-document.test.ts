import { describe, expect, it } from 'vitest'
import { parseDocumentText, parseMoneyToken } from './parse-document'

describe('parseDocumentText', () => {
  it('czyta polską fakturę z jawnym końcem gwarancji', () => {
    const parsed = parseDocumentText(`
FAKTURA VAT
Sprzedawca: Media Expert
Producent: Bosch
Model: SMS46GI01E
Nr seryjny: SN123456
Data zakupu: 15.03.2025
Gwarancja do: 15.03.2027
Razem: 1 299,00 zł
Pozycja 10,00 zł
`)
    expect(parsed).toMatchObject({
      documentType: 'invoice',
      vendor: 'Media Expert',
      manufacturer: 'Bosch',
      model: 'SMS46GI01E',
      serial: 'SN123456',
      purchaseDate: '2025-03-15',
      warrantyEnd: '2027-03-15',
      price: { amount: 1299, currency: 'PLN' },
    })
  })

  it('czyta angielski paragon i woli etykietę Total', () => {
    const parsed = parseDocumentText(`
Receipt
Seller: North Market
Brand: Sony
Model: WH-1000XM5
Serial number: XM5-00991
Purchase date: 2024-11-02
Warranty until: 2026-11-02
Item 10.00 USD
Total: 1,299.00 USD
`)
    expect(parsed).toMatchObject({
      documentType: 'receipt',
      vendor: 'North Market',
      manufacturer: 'Sony',
      model: 'WH-1000XM5',
      serial: 'XM5-00991',
      purchaseDate: '2024-11-02',
      warrantyEnd: '2026-11-02',
      price: { amount: 1299, currency: 'USD' },
    })
  })

  it('dolicza miesiące gwarancji do daty zakupu', () => {
    const parsed = parseDocumentText(`
Faktura
Data sprzedaży: 01.02.2024
Gwarancja: 24 miesiące
`)
    expect(parsed.documentType).toBe('invoice')
    expect(parsed.purchaseDate).toBe('2024-02-01')
    expect(parsed.warrantyEnd).toBe('2026-02-01')
  })

  it('przycina koniec miesiąca w roku przestępnym', () => {
    const parsed = parseDocumentText(`
Faktura
Data zakupu: 31.01.2024
Gwarancja: 1 miesiąc
`)
    expect(parsed.warrantyEnd).toBe('2024-02-29')
  })

  it('jawna data gwarancji wygrywa z liczbą miesięcy', () => {
    const parsed = parseDocumentText(`
Data zakupu: 01.01.2024
Gwarancja: 24 miesiące
Gwarancja do: 01.06.2025
`)
    expect(parsed.warrantyEnd).toBe('2025-06-01')
  })

  it('nie wymyśla końca gwarancji, gdy nie ma daty zakupu', () => {
    const parsed = parseDocumentText('Warranty: 12 months')
    expect(parsed.documentType).toBe('warranty')
    expect(parsed.warrantyEnd).toBeNull()
    expect(parsed.price).toBeNull()
  })

  it('pusty tekst zostawia pola do ręcznego uzupełnienia', () => {
    expect(parseDocumentText('')).toEqual({
      documentType: 'other',
      warrantyEnd: null,
      price: null,
      manufacturer: null,
      model: null,
      serial: null,
      vendor: null,
      purchaseDate: null,
    })
  })

  it('składa dwucyfrowy rok i odrzuca 31 lutego', () => {
    expect(parseDocumentText('Paragon\nGwarancja do: 01.02.27').warrantyEnd).toBe('2027-02-01')
    expect(parseDocumentText('Gwarancja do: 31.02.2026').warrantyEnd).toBeNull()
  })

  it('rozumie kwotę z kropką tysięcy i walutą EUR', () => {
    const parsed = parseDocumentText('Invoice\nDo zapłaty: 1.299,50 EUR')
    expect(parsed.price).toEqual({ amount: 1299.5, currency: 'EUR' })
  })

  it('czyta kartę gwarancyjną i numer S/N', () => {
    const parsed = parseDocumentText(`
Warranty card
Manufacturer: Philips
S/N: AB-99-CD
`)
    expect(parsed.documentType).toBe('warranty')
    expect(parsed.manufacturer).toBe('Philips')
    expect(parsed.serial).toBe('AB-99-CD')
  })
})

describe('parseMoneyToken', () => {
  it('rozróżnia separator dziesiętny i tysięczny', () => {
    expect(parseMoneyToken('1 299,00 zł')).toEqual({ amount: 1299, currency: 'PLN' })
    expect(parseMoneyToken('1,299.00 USD')).toEqual({ amount: 1299, currency: 'USD' })
    expect(parseMoneyToken('1,299')).toEqual({ amount: 1299, currency: null })
    expect(parseMoneyToken('89,99')).toEqual({ amount: 89.99, currency: null })
    expect(parseMoneyToken('')).toBeNull()
  })
})
