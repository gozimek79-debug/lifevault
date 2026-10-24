import { describe, expect, it } from 'vitest'
import { parseTaskPhrase } from './task-phrase'

const now = new Date(2026, 9, 24, 16, 0, 0)

describe('parseTaskPhrase', () => {
  it('czyta Karol, montaż jutro 9:00 jako osobę, tytuł i termin', () => {
    expect(parseTaskPhrase('Karol, montaż jutro 9:00', now)).toEqual({
      personName: 'Karol',
      title: 'montaż',
      dueAt: '2026-10-25T09:00',
    })
  })

  it('jutro bez godziny zostawia samą datę', () => {
    expect(parseTaskPhrase('odbiór jutro', now)).toEqual({
      personName: null,
      title: 'odbiór',
      dueAt: '2026-10-25',
    })
  })

  it('godzina o 8, 14:30 i o godzinie 9', () => {
    expect(parseTaskPhrase('montaż o 8', now)).toEqual({
      personName: null,
      title: 'montaż',
      dueAt: '2026-10-24T08:00',
    })
    expect(parseTaskPhrase('sprzątanie 14:30', now)).toMatchObject({
      title: 'sprzątanie',
      dueAt: '2026-10-24T14:30',
    })
    expect(parseTaskPhrase('Karol, montaż jutro o godzinie 9', now)).toEqual({
      personName: 'Karol',
      title: 'montaż',
      dueAt: '2026-10-25T09:00',
    })
  })

  it('nieznane imię przed przecinkiem jest osobą, a pierwsze słowo bez przecinka zostaje tytułem', () => {
    expect(parseTaskPhrase('Zosia, odbiór paczki jutro o 9', now)).toEqual({
      personName: 'Zosia',
      title: 'odbiór paczki',
      dueAt: '2026-10-25T09:00',
    })
    expect(parseTaskPhrase('montaż jutro 9:00', now).personName).toBeNull()
    expect(parseTaskPhrase('Łukasz, przegląd pojutrze godz. 7:15', now)).toEqual({
      personName: 'Łukasz',
      title: 'przegląd',
      dueAt: '2026-10-26T07:15',
    })
  })

  it('tomorrow i day after tomorrow oraz znane imię bez przecinka', () => {
    expect(parseTaskPhrase('Karol, install tomorrow 9:00', now)).toEqual({
      personName: 'Karol',
      title: 'install',
      dueAt: '2026-10-25T09:00',
    })
    expect(parseTaskPhrase('call Anna day after tomorrow at 10', now)).toMatchObject({
      title: 'call Anna',
      dueAt: '2026-10-26T10:00',
    })
    expect(parseTaskPhrase('karol montaż jutro 9:00', now, ['Karol'])).toEqual({
      personName: 'Karol',
      title: 'montaż',
      dueAt: '2026-10-25T09:00',
    })
  })

  it('przechodzi na następny miesiąc i nie tworzy tytułu z samej godziny', () => {
    const endOfMonth = new Date(2026, 9, 31, 8, 0, 0)
    expect(parseTaskPhrase('Anna, telefon jutro 11:05', endOfMonth)).toEqual({
      personName: 'Anna',
      title: 'telefon',
      dueAt: '2026-11-01T11:05',
    })
    expect(parseTaskPhrase('jutro 9:00', now)).toEqual({
      personName: null,
      title: '',
      dueAt: '2026-10-25T09:00',
    })
    expect(parseTaskPhrase('Anna, telefon dziś 11:05', now).dueAt).toBe('2026-10-24T11:05')
  })
})
