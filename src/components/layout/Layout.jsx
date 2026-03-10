import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import KikoChat from '../kiko/KikoChat'
import { MessageCircle, X } from 'lucide-react'

export default function Layout({ user }) {
  const [collapsed, setCollapsed] = useState(true)
  const [kikoOpen, setKikoOpen] = useState(false)
  const location = useLocation()

  // On home route, Kiko IS the page — don't show panel
  const isHomePage = location.pathname === '/' || location.pathname === '/home'

  // Cmd+K / Ctrl+K to toggle Kiko panel (only on non-home pages)
  const handleKeyDown = useCallback((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      if (!isHomePage) setKikoOpen(prev => !prev)
    }
    // Escape to close
    if (e.key === 'Escape' && kikoOpen) {
      setKikoOpen(false)
    }
  }, [isHomePage, kikoOpen])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Close panel when navigating to home
  useEffect(() => {
    if (isHomePage) setKikoOpen(false)
  }, [isHomePage])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar user={user} collapsed={collapsed} setCollapsed={setCollapsed} />

      {/* Main content area */}
      <main className={`flex-1 overflow-hidden flex flex-col transition-all duration-300 ${kikoOpen && !isHomePage ? 'mr-[420px]' : ''}`}>
        <Outlet />
      </main>

      {/* Kiko floating button — only on non-home pages */}
      {!isHomePage && !kikoOpen && (
        <button
          onClick={() => setKikoOpen(true)}
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full bg-white text-black shadow-lg shadow-white/10 flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-200 group"
          title="Open Kiko (⌘K)"
        >
          <MessageCircle className="h-5 w-5" />
          <span className="absolute -top-8 right-0 text-[10px] text-white/30 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">⌘K</span>
        </button>
      )}

      {/* Kiko slide-over panel — only on non-home pages */}
      {!isHomePage && (
        <div className={`fixed top-0 right-0 h-full w-[420px] z-30 transform transition-transform duration-300 ease-in-out ${kikoOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="h-full flex flex-col bg-[#0A0A0A] border-l border-white/8">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 h-12 border-b border-white/8 flex-shrink-0">
              <span className="text-sm font-medium text-white/60">Kiko</span>
              <button
                onClick={() => setKikoOpen(false)}
                className="text-white/30 hover:text-white/60 transition-colors p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* KikoChat in panel mode */}
            <div className="flex-1 overflow-hidden">
              <KikoChat user={user} compact />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
