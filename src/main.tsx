import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { AuthProvider } from './app/auth'
import { NavProvider } from './app/nav'
import { SettingsProvider } from './app/settings'
import { VaultProvider } from './app/vault'
import { I18nProvider } from './i18n/context'
import './index.css'

registerSW({ immediate: true })

const root = document.getElementById('root')
if (!root) throw new Error('root')

createRoot(root).render(
  <StrictMode>
    <SettingsProvider>
      <I18nProvider>
        <AuthProvider>
          <VaultProvider>
            <NavProvider>
              <App />
            </NavProvider>
          </VaultProvider>
        </AuthProvider>
      </I18nProvider>
    </SettingsProvider>
  </StrictMode>,
)
