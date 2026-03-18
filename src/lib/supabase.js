import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
    // Bypass navigator.locks — prevents auth lock contention that blocks
    // data queries from getting the Bearer token during initialization.
    // Safe for single-user SPA (no cross-tab session sync needed).
    lock: async (name, acquireTimeout, fn) => fn(),
  },
})
