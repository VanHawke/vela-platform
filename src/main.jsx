import { createRoot } from 'react-dom/client'
import './index.css'
import { OrgProvider } from './contexts/OrgContext'
import App from './App.jsx'

// Apply custom favicon from localStorage BEFORE React mounts so the login page
// matches the post-login platform (fixes inconsistency between login tab icon and app tab icon)
try {
  const customFavicon = localStorage.getItem('custom_favicon_url')
  if (customFavicon) {
    const link = document.querySelector('link[rel="icon"]')
    if (link) { link.href = customFavicon; link.type = 'image/png' }
  }
} catch {}

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
