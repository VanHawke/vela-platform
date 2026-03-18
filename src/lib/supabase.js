import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'vela-auth-token',
    flowType: 'implicit',
  },
})

// Auto-logout on 401 — catches expired sessions that slip past token refresh
supabase.auth.onAuthStateChange((event) => {
  if (event === 'TOKEN_REFRESH_FAILED') {
    // Clear stale token from storage so the next page load goes to /login cleanly
    localStorage.removeItem('vela-auth-token')
  }
})
