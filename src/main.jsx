import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/kiko-polish.css'
import './styles/mobile.css'
import { OrgProvider } from './contexts/OrgContext'
import App from './App.jsx'
import { installApiAuth } from './lib/apiAuth'

// Attach Supabase token to every Kiko API call (auth hardening, Session 70)
installApiAuth()

// Favicon bootstrap now handled by the Safari-safe inline IIFE in index.html
// which runs synchronously during HTML parse (before any <link rel="icon">
// is encountered by the parser). See src/lib/favicon.js for runtime updates.

createRoot(document.getElementById('root')).render(
  <OrgProvider>
    <App />
  </OrgProvider>,
)

// Unregister service worker — prevents stale cache on deployments
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister())
  })
}
// build-bust 1775718796
