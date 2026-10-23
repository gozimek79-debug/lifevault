import { describe, expect, it } from 'vitest'
import { REMINDER_OFFSETS, reminderDates } from './reminder-dates'

describe('reminderDates', () => {
  it('zwraca dokładnie 30, 7 i 1 dzień przed terminem, w tej kolejności', () => {
    expect(REMINDER_OFFSETS).toEqual([30, 7, 1])
    expect(reminderDates('2026-12-31')).toEqual([
      { daysBefore: 30, date: '2026-12-01' },
      { daysBefore: 7, date: '2026-12-24' },
      { daysBefore: 1, date: '2026-12-30' },
    ])
  })

  it('przechodzi przez granicę roku', () => {
    expect(reminderDates('2026-01-15')).toEqual([
      { daysBefore: 30, date: '2025-12-16' },
      { daysBefore: 7, date: '2026-01-08' },
      { daysBefore: 1, date: '2026-01-14' },
    ])
  })

  it('uwzględnia 29 lutego w roku przestępnym', () => {
    expect(reminderDates('2024-03-01')).toEqual([
      { daysBefore: 30, date: '2024-01-31' },
      { daysBefore: 7, date: '2024-02-23' },
      { daysBefore: 1, date: '2024-02-29' },
    ])
  })

  it('w roku nieprzestępnym 1 marca minus jeden dzień to 28 lutego', () => {
    expect(reminderDates('2025-03-01')).toEqual([
      { daysBefore: 30, date: '2025-01-30' },
      { daysBefore: 7, date: '2025-02-22' },
      { daysBefore: 1, date: '2025-02-28' },
    ])
  })

  it('odrzuca daty kalendarzowo niemożliwe', () => {
    expect(() => reminderDates('2026-02-31')).toThrow('Niepoprawna data')
    expect(() => reminderDates('2026-13-01')).toThrow('Niepoprawna data')
    expect(() => reminderDates('')).toThrow('Niepoprawna data')
  })
})
