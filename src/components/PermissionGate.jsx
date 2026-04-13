// src/components/PermissionGate.jsx — Route guard for page permissions
// Wraps a route element. If user can't see the page, shows "no access" message.
import { useNavigate } from 'react-router-dom'
import { usePagePermissions } from '@/lib/usePagePermissions'
import T from '@/lib/theme'

const ORG_ID = '2c6b30da-2d1a-45e5-bbeb-dee1671deba3' // TODO: resolve dynamically when multi-org

export default function PermissionGate({ pageKey, user, children }) {
  const { canSee, loading } = usePagePermissions(user, ORG_ID)
  const nav = useNavigate()

  if (loading) return null // prevent flash

  if (!canSee(pageKey)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <div style={{ fontSize: 40, opacity: 0.3 }}>🔒</div>
        <h2 style={{ fontSize: 18, fontWeight: 400, color: T.text, fontFamily: T.font, margin: 0 }}>Page not available</h2>
        <p style={{ fontSize: 14, color: T.textSecondary, fontFamily: T.font, margin: 0, textAlign: 'center', maxWidth: 360 }}>
          You don't have access to this page. Contact your organisation admin to request access.
        </p>
        <button onClick={() => nav('/')} style={{
          padding: '10px 24px', borderRadius: 50, background: T.accent, color: '#fff',
          border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: T.font,
        }}>Go to Home</button>
      </div>
    )
  }

  return children
}
