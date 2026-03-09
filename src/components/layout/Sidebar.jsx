import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  Home, Mail, Calendar, Settings, LayoutDashboard, GitBranch,
  Briefcase, Users, Building2, CheckSquare, FileText, BookOpen,
  Globe, Trophy, Send, BarChart3, Code, ChevronLeft, ChevronRight, LogOut
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const NAV_ITEMS = [
  // Phase 1 — active
  { id: 'home', label: 'Home', icon: Home, path: '/', phase: 1 },
  { id: 'email', label: 'Email', icon: Mail, path: '/email', phase: 1 },
  { id: 'calendar', label: 'Calendar', icon: Calendar, path: '/calendar', phase: 1 },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings', phase: 1 },
  // Phase 2 — greyed
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', phase: 2 },
  { id: 'pipeline', label: 'Pipeline', icon: GitBranch, path: '/pipeline', phase: 2 },
  { id: 'deals', label: 'Deals', icon: Briefcase, path: '/deals', phase: 2 },
  { id: 'contacts', label: 'Contacts', icon: Users, path: '/contacts', phase: 2 },
  { id: 'companies', label: 'Companies', icon: Building2, path: '/companies', phase: 2 },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare, path: '/tasks', phase: 2 },
  // Phase 3 — greyed
  { id: 'documents', label: 'Documents', icon: FileText, path: '/documents', phase: 3 },
  { id: 'knowledge', label: 'Knowledge', icon: BookOpen, path: '/knowledge', phase: 3 },
  { id: 'sectors', label: 'Sectors', icon: Globe, path: '/sectors', phase: 3 },
  { id: 'sponsorship', label: 'Sponsorship', icon: Trophy, path: '/sponsorship', phase: 3 },
  { id: 'outreach', label: 'Outreach', icon: Send, path: '/outreach', phase: 3 },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, path: '/analytics', phase: 3 },
  { id: 'velacode', label: 'Vela Code', icon: Code, path: '/velacode', phase: 3 },
]

export default function Sidebar({ user, collapsed, setCollapsed }) {
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email?.[0] || 'V').toUpperCase()

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className="glass flex flex-col h-full border-r border-white/8 transition-all duration-200 ease-in-out flex-shrink-0"
        style={{ width: collapsed ? 60 : 220 }}
      >
        {/* Logo */}
        <div className="flex items-center h-14 px-4 border-b border-white/8">
          {!collapsed && (
            <span className="text-lg font-semibold text-white tracking-tight">Vela</span>
          )}
          {collapsed && (
            <span className="text-lg font-semibold text-white mx-auto">V</span>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = location.pathname === item.path || (item.path === '/' && location.pathname === '/home')
            const disabled = item.phase > 1

            const button = (
              <button
                key={item.id}
                onClick={() => !disabled && navigate(item.path)}
                disabled={disabled}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                  transition-all duration-200
                  ${active
                    ? 'bg-white text-black'
                    : disabled
                      ? 'text-white/20 cursor-not-allowed'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }
                  ${collapsed ? 'justify-center px-0' : ''}
                `}
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            )

            if (disabled || collapsed) {
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {disabled ? `${item.label} — Coming Soon` : item.label}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return button
          })}
        </nav>

        {/* Bottom — user + collapse toggle */}
        <div className="border-t border-white/8 p-2 space-y-1">
          {/* User */}
          <div className={`flex items-center gap-2 px-2 py-1.5 ${collapsed ? 'justify-center' : ''}`}>
            <Avatar className="h-6 w-6 flex-shrink-0">
              <AvatarFallback className="text-[10px] bg-white/10 text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <span className="text-xs text-white/50 truncate flex-1">{displayName}</span>
            )}
            {!collapsed && (
              <button
                onClick={handleLogout}
                className="text-white/30 hover:text-white/60 transition-colors"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center py-1.5 text-white/30 hover:text-white/60 transition-colors rounded-lg hover:bg-white/5"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  )
}
