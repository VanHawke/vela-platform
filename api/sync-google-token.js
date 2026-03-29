// api/sync-google-token.js — Auto-sync Google OAuth token on login
// Called by frontend after Google sign-in to store provider_token in user_tokens
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { email, access_token, refresh_token } = req.body;
  if (!email || !access_token) return res.status(400).json({ error: 'email and access_token required' });

  try {
    const upsertData = {
      user_email: email,
      provider: 'google',
      access_token,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    // Only set refresh_token if we got one (don't overwrite existing with empty)
    if (refresh_token) upsertData.refresh_token = refresh_token;

    const { error } = await supabase
      .from('user_tokens')
      .upsert(upsertData, { onConflict: 'user_email,provider' });

    if (error) {
      console.error('[SyncToken] DB error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    console.log('[SyncToken] Token synced for:', email);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
