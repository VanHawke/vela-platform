import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // implicit flow: token arrives in URL hash fragment (#access_token=...)
    // detectSessionInUrl handles it automatically — no code verifier, no callback page needed.
    // PKCE was causing AuthPKCECodeVerifierMissingError because hardSignOut cleared all sb-* keys
    // including the verifier before the callback could use it.
    flowType: 'implicit',
  },
})
