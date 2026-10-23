/** Daty kalendarzowe liczone w UTC, żeby 30/7/1 nie zależało od strefy ani DST. */

export interface IsoParts {
  y: number
  m: number
  d: number
}

export function assertIsoDate(iso: string): IsoParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) throw new Error('Niepoprawna data')
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const utc = new Date(Date.UTC(y, m - 1, d))
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) {
    throw new Error('Niepoprawna data')
  }
  return { y, m, d }
}

export function formatIsoUtc(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

export function addIsoDays(iso: string, days: number): string {
  const { y, m, d } = assertIsoDate(iso)
  const utc = new Date(Date.UTC(y, m - 1, d))
  utc.setUTCDate(utc.getUTCDate() + days)
  return utc.toISOString().slice(0, 10)
}
