import mammoth from 'mammoth';
import { parseOffice } from 'officeparser';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const SB_URL = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { filename, storagePath, data } = req.body;
    if (!filename) return res.status(400).json({ error: 'Missing filename' });

    let buffer;
    if (storagePath) {
      // Download from Supabase Storage via REST API
      const dlUrl = `${SB_URL()}/storage/v1/object/vela-assets/${storagePath}`;
      const dlRes = await fetch(dlUrl, {
        headers: { 'Authorization': `Bearer ${SB_KEY()}`, 'apikey': SB_KEY() }
      });
      if (!dlRes.ok) throw new Error(`Storage download failed: ${dlRes.status} ${dlRes.statusText}`);
      buffer = Buffer.from(await dlRes.arrayBuffer());
    } else if (data) {
      buffer = Buffer.from(data, 'base64');
    } else {
      return res.status(400).json({ error: 'Missing storagePath or data' });
    }

    const ext = filename.split('.').pop().toLowerCase();
    let text = '';
    let metadata = {};

    if (ext === 'pdf') {
      const result = await pdfParse(buffer);
      text = result.text;
      metadata = { type: 'pdf', pages: result.numpages };
    } else if (ext === 'docx' || ext === 'doc') {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
      metadata = { type: 'docx', warnings: result.messages?.length || 0 };
    } else if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'pptx' || ext === 'ppt') {
      const result = await parseOffice(buffer);
      text = typeof result === 'string' ? result : (result.toText ? result.toText() : JSON.stringify(result.content || result));
      metadata = { type: ext.startsWith('xl') ? 'xlsx' : 'pptx' };
    } else {
      return res.status(400).json({ error: `Unsupported: .${ext}` });
    }

    const truncated = text.length > 80000;
    if (truncated) text = text.slice(0, 80000);

    // Clean up temp file from storage
    if (storagePath?.startsWith('tmp/')) {
      fetch(`${SB_URL()}/storage/v1/object/vela-assets/${storagePath}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${SB_KEY()}`, 'apikey': SB_KEY() }
      }).catch(() => {});
    }

    return res.status(200).json({ text, filename, metadata: { ...metadata, chars: text.length, truncated } });
  } catch (err) {
    console.error('[file-extract] Error:', err);
    return res.status(500).json({ error: `Extraction failed: ${err.message}` });
  }
}
