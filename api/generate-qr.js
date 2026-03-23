// api/generate-qr.js — QR code generation for Kiko
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { text, size = 400 } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    const QRCode = (await import('qrcode')).default;
    const buffer = await QRCode.toBuffer(text, { width: size, margin: 2, color: { dark: '#FFFFFF', light: '#0A0A0C' } });
    const filePath = `qr_${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage.from('generated-files').upload(filePath, buffer, { contentType: 'image/png', upsert: true });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
    const { data: urlData } = supabase.storage.from('generated-files').getPublicUrl(filePath);
    return res.status(200).json({ success: true, url: urlData?.publicUrl, text, size });
  } catch (err) {
    console.error('[generate-qr]', err);
    return res.status(500).json({ error: err.message });
  }
}
