// api/generate-image.js — Image generation for Kiko via DALL-E
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { prompt, size = '1024x1024', style = 'natural', quality = 'standard' } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  try {
    const dalleRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_KEY}` },
      body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size, style, quality, response_format: 'b64_json' }),
    });
    const dalleData = await dalleRes.json();
    if (dalleData.error) throw new Error(dalleData.error.message);
    const b64 = dalleData.data?.[0]?.b64_json;
    if (!b64) throw new Error('No image returned');
    const buffer = Buffer.from(b64, 'base64');
    const filePath = `img_${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage.from('generated-files').upload(filePath, buffer, { contentType: 'image/png', upsert: true });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
    const { data: urlData } = supabase.storage.from('generated-files').getPublicUrl(filePath);
    return res.status(200).json({ success: true, url: urlData?.publicUrl, revised_prompt: dalleData.data?.[0]?.revised_prompt, size });
  } catch (err) {
    console.error('[generate-image]', err);
    return res.status(500).json({ error: err.message });
  }
}
