// api/google-token.js — Shared Google token helper
// Exports getGoogleToken(userEmail) for use by email + calendar APIs
// Always reads from Supabase, auto-refreshes if expired

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Get a valid Google access token for the given user.
 * Auto-refreshes if expired or expiring within 5 minutes.
 * @param {string} userEmail
 * @returns {Promise<string>} valid access_token
 * @throws {Error} if no token found or refresh fails
 */
export async function getGoogleToken(userEmail) {
  if (!userEmail) throw new Error('userEmail required');

  const { data, error } = await supabase
    .from('user_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_email', userEmail)
    .eq('provider', 'google')
    .single();

  if (error || !data) {
    throw new Error(`No Google token for ${userEmail}. Connect Google in Settings.`);
  }

  if (!data.refresh_token) {
    throw new Error('No refresh token stored. Re-connect Google in Settings.');
  }

  // Check if token is still valid (with 5-minute buffer)
  const expiresAt = new Date(data.expires_at).getTime();
  const buffer = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();

  if (data.access_token && expiresAt > now + buffer) {
    return data.access_token;
  }

  // Token expired or expiring soon — refresh
  console.log('[GoogleToken] Refreshing token for:', userEmail);

  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: data.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const refreshData = await refreshRes.json();

  if (!refreshRes.ok) {
    console.error('[GoogleToken] Refresh failed:', refreshData);
    throw new Error('Token refresh failed. Re-connect Google in Settings.');
  }

  const newAccessToken = refreshData.access_token;
  const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString();

  // Update in Supabase
  const { error: updateError } = await supabase
    .from('user_tokens')
    .update({
      access_token: newAccessToken,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_email', userEmail)
    .eq('provider', 'google');

  if (updateError) {
    console.error('[GoogleToken] Failed to save refreshed token:', updateError.message);
  }

  console.log('[GoogleToken] Token refreshed successfully for:', userEmail);
  return newAccessToken;
}

// Also export as default handler for direct API calls (status check)
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const email = req.query?.email;
  if (!email) return res.status(400).json({ error: 'email query param required' });

  try {
    const { data } = await supabase
      .from('user_tokens')
      .select('provider, expires_at, scope, updated_at')
      .eq('user_email', email)
      .eq('provider', 'google')
      .single();

    if (!data) {
      return res.status(200).json({ connected: false });
    }

    return res.status(200).json({
      connected: true,
      provider: data.provider,
      expires_at: data.expires_at,
      scope: data.scope,
      last_updated: data.updated_at,
    });
  } catch (err) {
    return res.status(200).json({ connected: false, error: err.message });
  }
}
