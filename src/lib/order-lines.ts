/**
 * Linie ze zdjęcia zamówienia albo dostawy i porównanie z listą, którą
 * użytkownik może poprawić. Najpierw dokładne trafienie, potem zawieranie.
 * Jedna linia ze zdjęcia wchodzi do wyniku tylko raz.
 */

export interface OrderComparison {
  matched: string[]
  missing: string[]
  extra: string[]
}

export function splitOrderLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => cleanMarker(line))
    .filter((line) => foldLine(line).length > 1)
}

export function checklistItems(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => cleanMarker(line))
    .filter((line) => foldLine(line).length > 0)
}

export function compareOrderLines(checklist: readonly string[], extracted: readonly string[]): OrderComparison {
  const expected = checklist.map((line) => line.trim()).filter((line) => foldLine(line).length > 0)
  const actual = extracted.map((line) => line.trim()).filter((line) => foldLine(line).length > 0)
  const used = new Array<boolean>(actual.length).fill(false)
  const matchedAt = new Array<number>(expected.length).fill(-1)

  for (let index = 0; index < expected.length; index += 1) {
    const key = foldLine(expected[index] ?? '')
    const found = actual.findIndex((line, actualIndex) => !used[actualIndex] && foldLine(line) === key)
    if (found >= 0) {
      used[found] = true
      matchedAt[index] = found
    }
  }

  const pending = expected
    .map((line, index) => ({ index, key: foldLine(line) }))
    .filter((item) => matchedAt[item.index] < 0 && item.key.length >= 3)
    .sort((a, b) => b.key.length - a.key.length)

  for (const item of pending) {
    const found = actual.findIndex((line, actualIndex) => {
      if (used[actualIndex]) return false
      const other = foldLine(line)
      if (other.length < 3) return false
      return other.includes(item.key) || item.key.includes(other)
    })
    if (found >= 0) {
      used[found] = true
      matchedAt[item.index] = found
    }
  }

  return {
    matched: expected.filter((_, index) => matchedAt[index] >= 0),
    missing: expected.filter((_, index) => matchedAt[index] < 0),
    extra: actual.filter((_, index) => !used[index]),
  }
}

function cleanMarker(line: string): string {
  return line.replace(/^(?:[-*•·]+|\d{1,3}[.)])\s+/, '').replace(/\s+/g, ' ').trim()
}

function foldLine(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .replace(/^(?:\d+(?:[.,]\d+)?\s*(?:x|×|szt\.?)?\s+)/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
