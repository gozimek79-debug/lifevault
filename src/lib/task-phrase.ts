/**
 * Składnia zadania firmy. To samo zdanie działa z pola tekstu i z dyktowania.
 * „Karol, montaż jutro 9:00” daje osobę, tytuł i termin.
 * Przecinek albo dwukropek oznacza nieznane imię. Znane imię z gospodarstwa
 * wystarczy na początku zdania. Bez tego pierwsze słowo zostaje w tytule,
 * żeby „montaż jutro” nie zakładało osoby o imieniu Montaż.
 */

export interface ParsedTaskPhrase {
  personName: string | null
  title: string
  /** Data lokalna `RRRR-MM-DD` albo data z godziną `RRRR-MM-DDTHH:mm`. */
  dueAt: string | null
}

const DAYS: { phrase: string; offset: number }[] = [
  { phrase: 'day after tomorrow', offset: 2 },
  { phrase: 'pojutrze', offset: 2 },
  { phrase: 'jutro', offset: 1 },
  { phrase: 'tomorrow', offset: 1 },
  { phrase: 'dzisiaj', offset: 0 },
  { phrase: 'dzis', offset: 0 },
  { phrase: 'dziś', offset: 0 },
  { phrase: 'today', offset: 0 },
]

const TIME_PREFIX = String.raw`(?:o\s+godz(?:ina|inie|iny)?|godz(?:ina|inie|iny)?|o|at)\.?`

export function parseTaskPhrase(input: string, now: Date, knownPeople: readonly string[] = []): ParsedTaskPhrase {
  let text = input.replace(/\s+/g, ' ').trim()
  let personName: string | null = null
  const comma = /^([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,2})\s*[,:]\s*([\s\S]*)$/u.exec(text)
  if (comma && !isDayWord(comma[1])) {
    personName = preferKnown(comma[1], knownPeople)
    text = comma[2]
  } else {
    const known = matchKnownPerson(text, knownPeople)
    if (known && known.rest.trim()) {
      personName = known.name
      text = known.rest
    }
  }

  const time = takeTime(text)
  text = time.rest
  const day = takeDay(text)
  text = day.rest
  const title = text
    .replace(/^[,:.\-–—\s]+|[,:.\-–—\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)

  return {
    personName,
    title,
    dueAt: civilDue(now, day.offset, time.hour, time.minute),
  }
}

function preferKnown(spoken: string, knownPeople: readonly string[]): string {
  const clean = spoken.trim().replace(/\s+/g, ' ').slice(0, 40)
  const hit = knownPeople.find((name) => foldName(name) === foldName(clean))
  return hit?.trim() || clean
}

function matchKnownPerson(text: string, knownPeople: readonly string[]): { name: string; rest: string } | null {
  const tokens = text.split(' ').filter(Boolean)
  const sorted = [...knownPeople]
    .map((name) => name.trim())
    .filter((name) => name && !isDayWord(name))
    .sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length)
  for (const name of sorted) {
    const parts = name.split(/\s+/)
    if (tokens.length <= parts.length) continue
    const head = tokens.slice(0, parts.length)
    if (head.every((token, index) => foldName(token) === foldName(parts[index] ?? ''))) {
      return { name, rest: tokens.slice(parts.length).join(' ') }
    }
  }
  return null
}

function takeTime(text: string): { rest: string; hour: number | null; minute: number | null } {
  const clock = findClock(text)
  if (clock) return { rest: cut(text, clock.start, clock.end), hour: clock.hour, minute: clock.minute }
  const hour = findHour(text)
  if (hour) return { rest: cut(text, hour.start, hour.end), hour: hour.hour, minute: hour.minute }
  return { rest: text, hour: null, minute: null }
}

interface TimeHit {
  hour: number
  minute: number
  start: number
  end: number
}

function findClock(text: string): TimeHit | null {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(?:${TIME_PREFIX}\\s*)?(\\d{1,2})[:.](\\d{2})(?!\\d)`, 'giu')
  for (const match of text.matchAll(re)) {
    const hour = Number(match[2])
    const minute = Number(match[3])
    if (hour > 23 || minute > 59) continue
    const start = (match.index ?? 0) + match[1].length
    return { hour, minute, start, end: (match.index ?? 0) + match[0].length }
  }
  return null
}

function findHour(text: string): TimeHit | null {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${TIME_PREFIX}\\s*(\\d{1,2})(?!\\d)(?![:.])`, 'giu')
  for (const match of text.matchAll(re)) {
    const hour = Number(match[2])
    if (hour > 23) continue
    const start = (match.index ?? 0) + match[1].length
    return { hour, minute: 0, start, end: (match.index ?? 0) + match[0].length }
  }
  return null
}

function takeDay(text: string): { rest: string; offset: number | null } {
  let best: { start: number; end: number; offset: number } | null = null
  for (const day of DAYS) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeReg(day.phrase)})(?=$|[^\\p{L}\\p{N}])`, 'iu')
    const match = re.exec(text)
    if (!match || match.index === undefined) continue
    const start = match.index + match[1].length
    const end = start + match[2].length
    if (!best || start < best.start || (start === best.start && end - start > best.end - best.start)) {
      best = { start, end, offset: day.offset }
    }
  }
  if (!best) return { rest: text, offset: null }
  return { rest: cut(text, best.start, best.end), offset: best.offset }
}

function civilDue(now: Date, offset: number | null, hour: number | null, minute: number | null): string | null {
  if (offset === null && hour === null) return null
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (offset ?? 0))
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  if (hour === null) return `${y}-${m}-${d}`
  return `${y}-${m}-${d}T${String(hour).padStart(2, '0')}:${String(minute ?? 0).padStart(2, '0')}`
}

function isDayWord(value: string): boolean {
  const key = value.trim().toLowerCase()
  return DAYS.some((day) => day.phrase === key)
}

function foldName(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ł/g, 'l')
}

function cut(text: string, start: number, end: number): string {
  return `${text.slice(0, start)} ${text.slice(end)}`.replace(/\s+/g, ' ').trim()
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
