/**
 * Instrukcja PDF. Resolver nie otwiera stron wyszukiwarki i niczego nie scrapuje.
 * Albo dostaje JSON z opcjonalnego API, albo zapisuje gotowy link i czeka na plik od człowieka.
 */

export interface ManualResolution {
  url: string
  source: 'api' | 'link'
}

export function fallbackManualLink(manufacturer: string, model: string): string {
  const query = `${manufacturer} ${model} instrukcja PDF`.replace(/\s+/g, ' ').trim()
  return `https://www.google.com/search?q=${encodeURIComponent(`${query} filetype:pdf`)}`
}

export async function resolveManual(manufacturer: string, model: string): Promise<ManualResolution> {
  const fallback = fallbackManualLink(manufacturer, model)
  const api = import.meta.env.VITE_MANUAL_SEARCH_API_URL?.trim()
  if (!api || !navigator.onLine) return { url: fallback, source: 'link' }
  try {
    const separator = api.includes('?') ? '&' : '?'
    const query = `${manufacturer} ${model}`.trim()
    const response = await fetch(`${api}${separator}q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return { url: fallback, source: 'link' }
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object' || !('url' in body)) return { url: fallback, source: 'link' }
    const url = body.url
    if (typeof url === 'string' && url.startsWith('https://')) return { url, source: 'api' }
  } catch {
    // Sieć albo kształt odpowiedzi: zostaje sam link.
  }
  return { url: fallback, source: 'link' }
}
