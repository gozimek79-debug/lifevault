/** Termin zadania trzymamy jako lokalną datę, bez przesuwania strefą. */

export function formatDue(dueAt: string, lang: 'pl' | 'en'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(dueAt)
  if (!match) return dueAt
  const y = match[1] ?? ''
  const m = match[2] ?? ''
  const d = match[3] ?? ''
  const hh = match[4]
  const mm = match[5]
  const shown = lang === 'en' ? `${m}/${d}/${y}` : `${d}.${m}.${y}`
  if (!hh || !mm) return shown
  return `${shown} ${Number(hh)}:${mm}`
}

export function formatStamp(iso: string, lang: 'pl' | 'en'): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pl-PL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
