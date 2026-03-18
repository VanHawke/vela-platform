import { createRoot } from 'react-dom/client'
import './index.css'
import { OrgProvider } from './contexts/OrgContext'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <OrgProvider>
    <App />
  </OrgProvider>,
)
