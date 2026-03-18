import { supabase } from '@/lib/supabase'

/**
 * Sign out the current tab's session and redirect to login.
 * Does NOT touch localStorage manually — supabase.auth.signOut handles cleanup safely.
 * PKCE code verifiers are only stored briefly during OAuth flow and are not affected.
 */
export async function signOut() {
  try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
  window.location.replace('/login')
}
