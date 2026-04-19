import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/kiko-polish.css'
import './styles/mobile.css'
import { OrgProvider } from './contexts/OrgContext'
import App from './App.jsx'

// Favicon bootstrap now handled by the Safari-safe inline IIFE in index.html
// which runs synchronously during HTML parse (before any <link rel="icon">
// is encountered by the parser). See src/lib/favicon.js for runtime updates.

createRoot(document.getElementById('root')).render(
  <OrgProvider>
    <App />
  </OrgProvider>,
)

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
// build-bust 1775718796
