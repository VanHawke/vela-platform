// api/agents/document.js — Document Agent
// File generation: docx, xlsx, pptx, csv, images, QR codes, exports.
// Pure handler — no Claude calls. Takes structured input, produces files.
// Export operations (export_pipeline, export_contacts, generate_xlsx/csv/docx/pptx)
// are role-gated: only admin/super_admin can export.
import { sbFetch } from '../kiko-tools.js';
import { getUserRole, canExport } from '../_lib/get-user-role.js';

const BASE_URL = () => `https://${process.env.VERCEL_URL || 'kiko.vanhawke.agency'}`;

async function callGenerateDoc(format, payload) {
  const r = await fetch(`${BASE_URL()}/api/generate-doc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, ...payload })
  });
  return await r.json();
}

// ── Handlers ──
async function generateDocx({ filename, content }) {
  const data = await callGenerateDoc('docx', { filename, content });
  return data.url ? `✅ Document: [${data.filename}](${data.url}) (${(data.size / 1024).toFixed(1)}KB)` : `Error: ${data.error}`;
}

async function generateXlsx({ filename, sheets }) {
  const data = await callGenerateDoc('xlsx', { filename, sheets });
  return data.url ? `✅ Spreadsheet: [${data.filename}](${data.url}) (${(data.size / 1024).toFixed(1)}KB)` : `Error: ${data.error}`;
}

async function generatePptx({ filename, slides }) {
  const data = await callGenerateDoc('pptx', { filename, content: slides });
  return data.url ? `✅ Presentation: [${data.filename}](${data.url}) (${(data.size / 1024).toFixed(1)}KB)` : `Error: ${data.error}`;
}

async function generateCsv({ filename, content }) {
  const data = await callGenerateDoc('csv', { filename, content });
  return data.url ? `✅ CSV: [${data.filename}](${data.url})` : `Error: ${data.error}`;
}

async function generateImage({ prompt, size = '1024x1024', style = 'natural' }) {
  const r = await fetch(`${BASE_URL()}/api/generate-image`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, size, style })
  });
  const data = await r.json();
  return data.url ? `✅ Image: [View/Download](${data.url})${data.revised_prompt ? `\nPrompt: ${data.revised_prompt}` : ''}` : `Error: ${data.error}`;
}

async function generateQr({ text, size = 400 }) {
  const r = await fetch(`${BASE_URL()}/api/generate-qr`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, size })
  });
  const data = await r.json();
  return data.url ? `✅ QR code: [View/Download](${data.url})\nEncodes: ${text}` : `Error: ${data.error}`;
}

async function readUrl({ url }) {
  const r = await fetch(`${BASE_URL()}/api/fetch-url`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  const data = await r.json();
  if (data.content) return `PAGE: ${data.title || url}\n${data.description ? `DESC: ${data.description}\n` : ''}\n${data.content}`;
  return `Error: ${data.error}`;
}

async function exportPipeline({ pipeline }) {
  const deals = await sbFetch('deals?select=id,data&order=updated_at.desc&limit=500');
  if (!deals?.length) return 'No deals to export.';
  const filtered = pipeline ? deals.filter(d => d.data?.pipeline?.toLowerCase().includes(pipeline.toLowerCase())) : deals;
  const headers = ['Company', 'Contact', 'Stage', 'Pipeline', 'Value (USD)', 'Status', 'Source', 'Notes'];
  const rows = filtered.map(d => [d.data?.company || '', d.data?.contact || '', d.data?.stage || '', d.data?.pipeline || '', d.data?.value || 0, d.data?.status || '', d.data?.source || '', (d.data?.notes || '').slice(0, 100)]);
  const data = await callGenerateDoc('xlsx', { filename: `Pipeline_Export_${new Date().toISOString().split('T')[0]}`, sheets: [{ name: 'Pipeline', headers, rows }] });
  return data.url ? `✅ Pipeline exported: [${data.filename}](${data.url}) — ${filtered.length} deals.` : `Error: ${data.error}`;
}

async function exportContacts({ limit = 500, filter }) {
  const contacts = await sbFetch(`contacts?select=id,data&order=updated_at.desc&limit=${limit}`);
  if (!contacts?.length) return 'No contacts to export.';
  const filtered = filter ? contacts.filter(c => { const d = c.data || {}; return (d.company || '').toLowerCase().includes(filter.toLowerCase()) || (d.industry || '').toLowerCase().includes(filter.toLowerCase()); }) : contacts;
  const headers = ['First Name', 'Last Name', 'Company', 'Title', 'Email', 'Phone', 'LinkedIn', 'Industry'];
  const rows = filtered.map(c => { const d = c.data || {}; return [d.firstName || '', d.lastName || '', d.company || '', d.title || '', d.email || '', d.phone || '', d.linkedin ? 'Yes' : '', d.industry || '']; });
  const data = await callGenerateDoc('xlsx', { filename: `Contacts_Export_${new Date().toISOString().split('T')[0]}`, sheets: [{ name: 'Contacts', headers, rows }] });
  return data.url ? `✅ Contacts exported: [${data.filename}](${data.url}) — ${filtered.length} contacts.` : `Error: ${data.error}`;
}

// ── Export operations that require admin/super_admin role ──
const EXPORT_OPS = ['export_pipeline', 'export_contacts', 'generate_docx', 'generate_xlsx', 'generate_pptx', 'generate_csv'];

// ── Main Dispatch ──
export async function callDocumentAgent(operation, params = {}, userId = null) {
  try {
    // Role gate: export operations require admin or super_admin
    if (EXPORT_OPS.includes(operation) && userId) {
      const role = await getUserRole(userId);
      if (!canExport(role)) return 'Export is restricted to admin and super_admin roles. Contact your organisation admin for access.';
    }
    switch (operation) {
      case 'generate_docx': return await generateDocx(params);
      case 'generate_xlsx': return await generateXlsx(params);
      case 'generate_pptx': return await generatePptx(params);
      case 'generate_csv': return await generateCsv(params);
      case 'generate_image': return await generateImage(params);
      case 'generate_qr': return await generateQr(params);
      case 'read_url': return await readUrl(params);
      case 'export_pipeline': return await exportPipeline(params);
      case 'export_contacts': return await exportContacts(params);
      default: return `Unknown document operation: ${operation}. Available: generate_docx, generate_xlsx, generate_pptx, generate_csv, generate_image, generate_qr, read_url, export_pipeline, export_contacts`;
    }
  } catch (err) {
    return `Document Agent error (${operation}): ${err.message}`;
  }
}
