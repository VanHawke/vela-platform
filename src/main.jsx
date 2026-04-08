import { createRoot } from 'react-dom/client'
import './index.css'
import { OrgProvider } from './contexts/OrgContext'
import App from './App.jsx'
import { initTheme } from './lib/theme.js'

initTheme()

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
