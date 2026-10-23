import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { ModuleId } from '../modules/registry'

export type Route =
  | { name: 'dashboard' }
  | { name: 'settings' }
  | { name: 'household' }
  | { name: 'module'; id: ModuleId }

interface NavValue {
  route: Route
  openModule: (id: ModuleId) => void
  openSettings: () => void
  openHousehold: () => void
  goDashboard: () => void
}

const NavContext = createContext<NavValue | null>(null)

export function NavProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>({ name: 'dashboard' })
  const value = useMemo<NavValue>(
    () => ({
      route,
      openModule: (id) => setRoute({ name: 'module', id }),
      openSettings: () => setRoute({ name: 'settings' }),
      openHousehold: () => setRoute({ name: 'household' }),
      goDashboard: () => setRoute({ name: 'dashboard' }),
    }),
    [route],
  )
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

export function useNav(): NavValue {
  const value = useContext(NavContext)
  if (!value) throw new Error('nav')
  return value
}
