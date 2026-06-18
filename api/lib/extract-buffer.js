// api/lib/extract-buffer.js
// Extract plain text from a file buffer by extension. Mirrors file-extract.js so
// email attachments are read the same way as direct uploads. Used by read_email.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const mammoth = require("mammoth");
const { parseOffice } = require("officeparser");
const pdfParse = require("pdf-parse");

const SUPPORTED = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'xlsm', 'pptx', 'ppt'];

export function isExtractable(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  return SUPPORTED.includes(ext);
}

export async function extractTextFromBuffer(buffer, filename, maxChars = 8000) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  let text = '';
  if (ext === 'pdf') {
    const r = await pdfParse(buffer);
    text = r.text || '';
  } else if (ext === 'docx' || ext === 'doc') {
    const r = await mammoth.extractRawText({ buffer });
    text = r.value || '';
  } else if (['xlsx', 'xls', 'xlsm', 'pptx', 'ppt'].includes(ext)) {
    const r = await parseOffice(buffer);
    text = typeof r === 'string' ? r : (r && r.toText ? r.toText() : JSON.stringify((r && r.content) || r || ''));
  } else {
    return '';
  }
  text = (text || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length > maxChars) text = text.slice(0, maxChars) + `\n…[truncated — ${text.length} chars total]`;
  return text;
}
