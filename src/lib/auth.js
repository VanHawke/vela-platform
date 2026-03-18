import { supabase } from '@/lib/supabase'

// Standalone sign-out — no dependency on React state or App.jsx
// Safe to call even if session is already dead
export async function signOut() {
  try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
  window.location.replace('/login')
}
