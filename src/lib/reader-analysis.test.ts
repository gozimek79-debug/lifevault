import { describe, expect, it } from 'vitest'
import { mapModelPayload } from './reader-analysis'

describe('mapModelPayload', () => {
  it('układa flagi z ramką, słownikiem i szkicem', () => {
    const analysis = mapModelPayload({
      summary: 'Umowa najmu.',
      terms: [{ term: 'kara umowna', plain: 'opłata za złamanie umowy' }],
      flags: [
        {
          quote: 'kara 500 zł',
          why: 'to realny koszt',
          severity: 'high',
          box: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 },
        },
      ],
      replyDraft: 'Dzień dobry, proszę o wyjaśnienie kary.',
    })
    expect(analysis.summary).toBe('Umowa najmu.')
    expect(analysis.terms).toEqual([{ term: 'kara umowna', plain: 'opłata za złamanie umowy' }])
    expect(analysis.flags).toEqual([
      {
        quote: 'kara 500 zł',
        why: 'to realny koszt',
        severity: 'high',
        box: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 },
      },
    ])
    expect(analysis.replyDraft).toContain('wyjaśnienie')
  })

  it('przycina ramkę do zakresu 0–1 i przyjmuje szerokość jako width', () => {
    const analysis = mapModelPayload({
      flags: [{ quote: 'termin 12.05.2026', why: 'krótko', severity: 'HIGH', box: { x: -0.2, y: 1.4, width: 2, height: 0.2 } }],
    })
    expect(analysis.flags[0]?.box).toEqual({ x: 0, y: 1, w: 1, h: 0.2 })
    expect(analysis.flags[0]?.severity).toBe('high')
  })

  it('zostawia flagę bez ramki i odrzuca ramkę, której nie da się narysować', () => {
    const analysis = mapModelPayload({
      flags: [
        { quote: 'odsetki 12%', why: 'koszt', severity: 'low' },
        { quote: 'pusta ramka', why: 'nic', severity: 'medium', box: { x: 0.2, y: 0.2, w: 0, h: 0.1 } },
        { quote: '', why: 'bez cytatu', severity: 'high', box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
      ],
    })
    expect(analysis.flags).toHaveLength(2)
    expect(analysis.flags[0]?.box).toBeNull()
    expect(analysis.flags[1]?.box).toBeNull()
    expect(analysis.flags.map((flag) => flag.quote)).toEqual(['odsetki 12%', 'pusta ramka'])
  })

  it('bierze aliasy redFlags, jargon i reply oraz nieznaną wagę', () => {
    const analysis = mapModelPayload({
      jargon: [{ word: 'rękojmia', explanation: 'odpowiedzialność sprzedawcy' }],
      redFlags: [{ text: 'w ciągu 7 dni', reason: 'krótki termin', severity: 'urgent', bbox: [0.1, 0.2, 0.4, 0.1] }],
      reply: 'Proszę o więcej czasu.',
    })
    expect(analysis.terms).toEqual([{ term: 'rękojmia', plain: 'odpowiedzialność sprzedawcy' }])
    expect(analysis.flags[0]).toMatchObject({
      quote: 'w ciągu 7 dni',
      why: 'krótki termin',
      severity: 'medium',
      box: { x: 0.1, y: 0.2, w: 0.4, h: 0.1 },
    })
    expect(analysis.replyDraft).toBe('Proszę o więcej czasu.')
  })

  it('śmieci zamienia na pusty wynik', () => {
    expect(mapModelPayload(null)).toEqual({ summary: '', terms: [], flags: [], replyDraft: '' })
    expect(mapModelPayload('nie json')).toEqual({ summary: '', terms: [], flags: [], replyDraft: '' })
    expect(mapModelPayload([{ quote: 'poza obiektem' }])).toEqual({ summary: '', terms: [], flags: [], replyDraft: '' })
    expect(mapModelPayload({ documentType: 'invoice', extractedText: 'faktura' }).flags).toEqual([])
  })
})
