import { addIsoDays } from './iso-date'

export interface CalendarEvent {
  uid: string
  date: string
  title: string
  description: string
}

export function googleCalendarUrl(title: string, dateIso: string, details: string): string {
  const start = dateIso.replaceAll('-', '')
  const end = addIsoDays(dateIso, 1).replaceAll('-', '')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    details,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function remindersToIcs(events: CalendarEvent[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LifeVault//Reminders//PL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcs(event.uid)}@lifevault.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${event.date.replaceAll('-', '')}`,
      `SUMMARY:${escapeIcs(event.title)}`,
      `DESCRIPTION:${escapeIcs(event.description)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

/** Składanie linii ICS liczy oktety UTF-8, nie znaki — polskie litery zajmują dwa bajty. */
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let start = 0
  let budget = 75
  while (start < bytes.length) {
    let end = Math.min(bytes.length, start + budget)
    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end -= 1
    parts.push(new TextDecoder().decode(bytes.slice(start, end)))
    start = end
    budget = 74
  }
  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join('\r\n')
}
