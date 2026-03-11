import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import KikoChat from '../kiko/KikoChat'
import { MessageCircle, X, ArrowUp } from 'lucide-react'

export default function Layout({ user }) {
  const [kikoStage, setKikoStage] = useState(0) // 0=button, 1=promptbar, 2=panel
  const [kikoInput, setKikoInput] = useState('')
  const loc = useLocation()
  const isHome = loc.pathname === '/' || loc.pathname === '/home'

  // Cmd+K toggle
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (!isHome) setKikoStage(s => s === 0 ? 1 : s === 1 ? 0 : s)
      }
      if (e.key === 'Escape') setKikoStage(0)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isHome])

  useEffect(() => { if (isHome) setKikoStage(0) }, [isHome])

  return (
    <div style={{ display:'flex', height:'100vh', width:'100vw', overflow:'hidden', background:'var(--bg)' }}>
      <Sidebar />
      <main style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', transition:'margin-right 0.3s ease', marginRight: kikoStage===2 && !isHome ? 420 : 0 }}>
        <Outlet />
      </main>

      {/* Kiko floating: Stage 0 = button */}
      {!isHome && kikoStage === 0 && (
        <button onClick={() => setKikoStage(1)} style={{
          position:'fixed', bottom:24, right:24, zIndex:100, width:52, height:52,
          borderRadius:'50%', background:'var(--accent)', border:'none', color:'#fff',
          cursor:'pointer', boxShadow:'var(--shadow-kiko)', display:'flex', alignItems:'center', justifyContent:'center',
          transition:'transform 0.2s, box-shadow 0.2s'
        }}
          onMouseOver={e => { e.currentTarget.style.transform='scale(1.05)' }}
          onMouseOut={e => { e.currentTarget.style.transform='scale(1)' }}
        >
          <MessageCircle size={22} strokeWidth={1.8} />
        </button>
      )}

      {/* Stage 1 = prompt bar */}
      {!isHome && kikoStage === 1 && (
        <div className="glass animate-scale-in" style={{
          position:'fixed', bottom:24, right:24, zIndex:100,
          borderRadius:'var(--radius-pill)', padding:'6px 6px 6px 20px',
          display:'flex', alignItems:'center', gap:8, width:400
        }}>
          <input value={kikoInput} onChange={e => setKikoInput(e.target.value)}
            onKeyDown={e => { if(e.key==='Enter' && kikoInput.trim()) setKikoStage(2) }}
            placeholder="Ask Kiko anything..." autoFocus
            style={{ flex:1, border:'none', background:'transparent', outline:'none', fontSize:14, color:'var(--text)', fontFamily:'var(--font)' }} />
          <button onClick={() => { if(kikoInput.trim()) setKikoStage(2) }} style={{
            width:36, height:36, borderRadius:'50%', background:'var(--accent)', border:'none', color:'#fff',
            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
          }}><ArrowUp size={16} /></button>
          <button onClick={() => setKikoStage(0)} style={{
            width:28, height:28, borderRadius:'50%', background:'transparent', border:'none',
            color:'var(--text-tertiary)', cursor:'pointer', fontSize:16
          }}>×</button>
        </div>
      )}

      {/* Stage 2 = full panel */}
      {!isHome && kikoStage === 2 && (
        <div className="animate-slide-in" style={{
          position:'fixed', top:0, right:0, width:420, height:'100%', zIndex:100,
          background:'rgba(255,255,255,0.95)', backdropFilter:'blur(40px)', WebkitBackdropFilter:'blur(40px)',
          borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column'
        }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
            <span style={{ fontSize:14, fontWeight:600, color:'var(--text)', fontFamily:'var(--font)' }}>Kiko</span>
            <button onClick={() => setKikoStage(0)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-tertiary)', padding:4 }}><X size={16} /></button>
          </div>
          <div style={{ flex:1, overflow:'hidden' }}><KikoChat user={user} compact initialMessage={kikoInput} /></div>
        </div>
      )}
    </div>
  )
}
