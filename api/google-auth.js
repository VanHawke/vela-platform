// api/google-auth.js — Google OAuth2 consent flow
// GET /api/google-auth?email=sunny@vanhawke.com → redirect to Google
// GET /api/google-auth/callback?code=...&state=... → exchange code, store tokens

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/calendar',
  'openid',
  'email',
  'profile',
].join(' ');

const REDIRECT_URI = 'https://vela-platform-one.vercel.app/api/google-auth/callback';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Route: /api/google-auth/callback
  if (req.url?.includes('/callback')) {
    return handleCallback(req, res);
  }

  // Route: /api/google-auth — initiate consent
  return handleConsent(req, res);
}

function handleConsent(req, res) {
  const email = req.query?.email;
  if (!email) {
    return res.status(400).json({ error: 'email query param required' });
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: email,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  console.log('[GoogleAuth] Redirecting to consent for:', email);
  return res.redirect(302, url);
}

async function handleCallback(req, res) {
  const { code, state: userEmail, error: oauthError } = req.query || {};

  if (oauthError) {
    console.error('[GoogleAuth] OAuth error:', oauthError);
    return res.redirect(302, '/settings?error=google_denied');
  }

  if (!code || !userEmail) {
    return res.status(400).json({ error: 'Missing code or state' });
  }

  console.log('[GoogleAuth] Exchanging code for tokens, user:', userEmail);

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error('[GoogleAuth] Token exchange failed:', tokenData);
      return res.redirect(302, '/settings?error=token_exchange');
    }

    const { access_token, refresh_token, expires_in, scope } = tokenData;

    if (!refresh_token) {
      console.warn('[GoogleAuth] No refresh_token received — user may need to revoke and re-consent');
    }

    // Calculate expiry
    const expires_at = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

    // Upsert into user_tokens
    const { error: dbError } = await supabase
      .from('user_tokens')
      .upsert({
        user_email: userEmail,
        provider: 'google',
        access_token,
        refresh_token: refresh_token || '',
        expires_at,
        scope: scope || SCOPES,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_email,provider' });

    if (dbError) {
      console.error('[GoogleAuth] DB upsert error:', dbError.message);
      return res.redirect(302, '/settings?error=db_save');
    }

    console.log('[GoogleAuth] Tokens saved successfully for:', userEmail);
    return res.redirect(302, '/settings?connected=google');
  } catch (err) {
    console.error('[GoogleAuth] Exception:', err.message);
    return res.redirect(302, '/settings?error=exception');
  }
}
