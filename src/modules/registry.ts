import type { ComponentType } from 'react'

/**
 * Rejestr modułów. Każdy wchodzi osobnym importem, więc Firma i Dokumenty
 * nie obciążają startu, a kolejny etap podmienia tylko swój plik.
 */

export type ModuleId = 'home' | 'micro-ops' | 'docs'

export interface ModuleDefinition {
  id: ModuleId
  load: () => Promise<{ default: ComponentType }>
}

export const moduleRegistry: Record<ModuleId, ModuleDefinition> = {
  home: { id: 'home', load: () => import('./home') },
  'micro-ops': { id: 'micro-ops', load: () => import('./micro-ops') },
  docs: { id: 'docs', load: () => import('./docs') },
}
