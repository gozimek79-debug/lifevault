import { addIsoDays } from './iso-date'

/** Wyprzedzenia przypomnień o końcu gwarancji. Kolejność jest częścią kontraktu. */
export const REMINDER_OFFSETS = [30, 7, 1] as const

export type ReminderOffset = (typeof REMINDER_OFFSETS)[number]

export interface ReminderPoint {
  daysBefore: ReminderOffset
  /** Dzień przypomnienia, YYYY-MM-DD. */
  date: string
}

/**
 * Trzy terminy: 30, 7 i 1 dzień przed datą końca gwarancji.
 * Daty z przeszłości też wracają — decyzja, czy powiadamiać, należy do planera.
 */
export function reminderDates(dueDateIso: string): ReminderPoint[] {
  return REMINDER_OFFSETS.map((daysBefore) => ({
    daysBefore,
    date: addIsoDays(dueDateIso, -daysBefore),
  }))
}
