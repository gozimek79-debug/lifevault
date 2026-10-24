/**
 * Polisa ubezpieczeniowa albo energetyczna w tekście, który już mamy.
 * Nie ma tu numeru partnerskiego i niczego nie pobieramy ze stron porównywarek.
 */

export interface PolicyFields {
  title?: string | null
  vendor?: string | null
  keywords?: string | null
  notes?: string | null
  extractedText?: string | null
}

const INSURANCE = ['ubezpieczen', 'polisa', 'ubezpieczyciel', 'insurance']
const ENERGY = ['energia', 'taryf', 'kwh', 'kilowat', 'prad', 'energy', 'gaz ziem', 'dostawa gazu', 'dostawa energii']

export function isPartnerPolicy(fields: PolicyFields): boolean {
  const folded = fold(
    [fields.title, fields.vendor, fields.keywords, fields.notes, fields.extractedText].filter(Boolean).join('\n'),
  )
  if (!folded) return false
  return INSURANCE.some((token) => hasToken(folded, token)) || ENERGY.some((token) => hasToken(folded, token))
}

function fold(value: string): string {
  return value.toLowerCase().replace(/ł/g, 'l')
}

function hasToken(folded: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(folded)
}
