import type { VaultDocument } from './types'

/** Wyszukiwanie lokalne po tekście OCR i polach. Każdy wyraz musi paść. */

export function localSearch(documents: VaultDocument[], query: string): VaultDocument[] {
  const tokens = query.toLocaleLowerCase('pl').split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return documents
  return documents.filter((document) => {
    const haystack = [
      document.extractedText,
      document.title,
      document.vendor,
      document.manufacturer,
      document.model,
      document.serial,
      document.notes,
      document.keywords,
      document.documentType,
    ]
      .join('\n')
      .toLocaleLowerCase('pl')
    return tokens.every((token) => haystack.includes(token))
  })
}
