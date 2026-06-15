// api/cron-utils.js — Shared utilities for all cron jobs
// Loads all active users from kiko_user_config for multi-user cron loops
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fetch all active users from kiko_user_config
export async function getActiveUsers() {
  const { data, error } = await supabase
    .from('kiko_user_config')
    .select('user_id, email, display_name, role, timezone')
    .eq('active', true);
  if (error) throw new Error(`Failed to load users: ${error.message}`);
  return data || [];
}

// Supabase REST helper (same as kiko-tools.js)
export async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', Prefer: opts.headers?.Prefer || 'return=minimal',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Google token helper — proactively refreshes if missing/near-expiry and returns null on failure (no stale fallback)
export async function getGoogleToken(email, forceRefresh = false) {
  // Always look up tokens with .com (how Google OAuth tokens are stored in Supabase)
  const lookupEmail = email.replace('@vanhawke.agency', '@vanhawke.com');
  const rows = await sbFetch(`user_tokens?user_email=eq.${encodeURIComponent(lookupEmail)}&provider=eq.google&select=access_token,refresh_token,expires_at&limit=1`);
  if (!rows?.[0]) return null;
  const token = rows[0];
  // Refresh if: no expires_at OR within 5 min of expiry OR already past expiry
  const needsRefresh = forceRefresh || !token.expires_at || (new Date(token.expires_at).getTime() - Date.now() < 5 * 60 * 1000);
  if (needsRefresh) {
    if (!token.refresh_token) {
      console.error(`[getGoogleToken] ${email}: no refresh_token, cannot refresh`);
      return null;
    }
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: token.refresh_token,
          grant_type: 'refresh_token',
        }),
      });
      const data = await res.json();
      if (!data.access_token) {
        console.error(`[getGoogleToken] ${email}: refresh failed`, data);
        return null;
      }
      await sbFetch(`user_tokens?user_email=eq.${encodeURIComponent(lookupEmail)}&provider=eq.google`, {
        method: 'PATCH',
        body: JSON.stringify({ access_token: data.access_token, expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString() }),
      });
      return data.access_token;
    } catch (err) {
      console.error(`[getGoogleToken] ${email}: refresh threw`, err.message);
      return null;
    }
  }
  return token.access_token;
}

// Heartbeat logger
export async function logHeartbeat(cronName, status, details = '') {
  try {
    await sbFetch('kiko_cron_heartbeats', {
      method: 'POST',
      body: JSON.stringify({ cron_name: cronName, status, details: (details || '').slice(0, 500), started_at: new Date().toISOString() }),
    });
  } catch {}
}
