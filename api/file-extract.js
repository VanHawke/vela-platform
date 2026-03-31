import mammoth from 'mammoth';
import { parseOffice } from 'officeparser';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { filename, data } = req.body;
    if (!data || !filename) return res.status(400).json({ error: 'Missing filename or data' });

    const buffer = Buffer.from(data, 'base64');
    const ext = filename.split('.').pop().toLowerCase();
    let text = '';
    let metadata = {};

    if (ext === 'pdf') {
      const result = await pdfParse(buffer);
      text = result.text;
      metadata = { type: 'pdf', pages: result.numpages };
    }

    else if (ext === 'docx' || ext === 'doc') {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
      metadata = { type: 'docx', warnings: result.messages?.length || 0 };
    }

    else if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'pptx' || ext === 'ppt') {
      const result = await parseOffice(buffer);
      text = typeof result === 'string' ? result : (result.toText ? result.toText() : JSON.stringify(result.content || result));
      metadata = { type: ext.startsWith('xl') ? 'xlsx' : 'pptx' };
    }

    else {
      return res.status(400).json({ error: `Unsupported file type: .${ext}` });
    }

    const truncated = text.length > 80000;
    if (truncated) text = text.slice(0, 80000);

    return res.status(200).json({
      text,
      filename,
      metadata: { ...metadata, chars: text.length, truncated },
    });
  } catch (err) {
    console.error('[file-extract] Error:', err);
    return res.status(500).json({ error: `Extraction failed: ${err.message}` });
  }
}
