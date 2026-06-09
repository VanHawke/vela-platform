import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

export default function MobileBottomNav() {
  const nav = useNavigate()
  const loc = useLocation()

  const isKiko = loc.pathname === '/' || loc.pathname === '/home' || loc.pathname === '/dashboard'
  const isCampaigns = loc.pathname === '/campaigns' || loc.pathname.startsWith('/campaigns/')

  return (
    <nav className="kiko-mobile-bottom-nav" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#FFFFFF', borderTop: '1px solid rgba(0,0,0,0.05)',
      display: 'none', alignItems: 'center', justifyContent: 'center',
      gap: 48,
      paddingTop: 6, paddingBottom: 'env(safe-area-inset-bottom, 4px)',
      zIndex: 999, fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <button onClick={() => nav('/')} style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 16px',
        color: isKiko ? '#0A0A0A' : '#A0A0A0', fontSize: 9,
        fontFamily: "'Inter', system-ui, sans-serif", fontWeight: isKiko ? 500 : 400,
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: '50%',
          background: 'radial-gradient(circle at 40% 35%, rgba(35,28,55,1), rgba(15,13,22,1))',
          boxShadow: isKiko ? '0 0 6px rgba(124,92,252,0.25)' : 'none',
        }} />
        <span>Kiko</span>
      </button>

      <button onClick={() => nav('/campaigns')} style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 16px',
        color: isCampaigns ? '#0A0A0A' : '#A0A0A0', fontSize: 9,
        fontFamily: "'Inter', system-ui, sans-serif", fontWeight: isCampaigns ? 500 : 400,
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: '50%',
          background: isCampaigns ? '#0A0A0A' : '#F5F4F1',
          color: isCampaigns ? '#FEFEFC' : '#A0A0A0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        </div>
        <span>Campaigns</span>
      </button>
    </nav>
  )
}
