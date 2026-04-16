// api/voice-preview.js — Generate short TTS preview for voice selection
// Reads the authenticated user's display_name from kiko_user_config so the preview
// greeting uses their actual name instead of the legacy hardcoded "Sunny".
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.OPENAI_KEY;
  if (!key) return res.status(500).json({ error: 'OPENAI_KEY not configured' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { voice = 'coral', userEmail, speed = 1.0, instructions = '' } = body;

  // Resolve the greeting name: prefer user_settings.greeting_name, then first_name,
  // then kiko_user_config.display_name's first token, then neutral fallback.
  let greetingName = null;
  if (userEmail) {
    try {
      const { data: cfg } = await supabase
        .from('kiko_user_config')
        .select('display_name, user_id')
        .eq('email', userEmail)
        .maybeSingle();
      if (cfg?.user_id) {
        const { data: settings } = await supabase
          .from('user_settings')
          .select('greeting_name, first_name')
          .eq('user_id', cfg.user_id)
          .maybeSingle();
        greetingName = settings?.greeting_name || settings?.first_name || null;
      }
      if (!greetingName && cfg?.display_name) {
        greetingName = cfg.display_name.split(' ')[0];
      }
    } catch (err) {
      console.warn('[voice-preview] profile lookup failed:', err?.message);
    }
  }

  const input = greetingName
    ? `Hello ${greetingName}, this is how I sound. What do you think?`
    : 'Hello, this is how I sound. What do you think?';

  try {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice,
        input,
        speed: parseFloat(speed) || 1.0,
        ...(instructions ? { instructions } : {}),
        response_format: 'mp3',
      }),
    });
    if (!r.ok) return res.status(r.status).json({ error: 'TTS failed' });
    res.setHeader('Content-Type', 'audio/mpeg');
    const buf = await r.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (err) { res.status(500).json({ error: err.message }); }
}
