// api/agents/document.js — Document Agent
// File generation: docx, xlsx, pptx, csv, images, QR codes, exports.
// Pure handler — no Claude calls. Takes structured input, produces files.
// Export operations (export_pipeline, export_contacts, generate_xlsx/csv/docx/pptx)
// are role-gated: only admin/super_admin can export.
import { sbFetch } from '../kiko-tools.js';
import { getUserRole, canExport } from '../_lib/get-user-role.js';

const BASE_URL = () => 'https://api.vanhawke.agency';

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
      case 'list_templates': return await listDocTemplates();
      case 'generate_from_template': return await generateFromTemplate(params, userId);
      default: return `Unknown document operation: ${operation}. Available: generate_docx, generate_xlsx, generate_pptx, generate_csv, generate_image, generate_qr, read_url, export_pipeline, export_contacts`;
    }
  } catch (err) {
    return `Document Agent error (${operation}): ${err.message}`;
  }
}

// ── Document Templates ──
async function listDocTemplates() {
  const res = await fetch(`${process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL}/rest/v1/kiko_doc_templates?order=doc_type.asc,name.asc`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY}` }
  })
  const templates = await res.json()
  if (!templates?.length) return 'No document templates available yet.'
  let result = '📄 **Available Document Templates:**\n\n'
  templates.forEach(t => {
    const fields = (t.field_schema || []).map(f => f.label || f.name).join(', ')
    result += `**${t.name}** (${t.doc_type})\n${t.description || ''}\nFields: ${fields}\nOutput: ${t.output_format}\n\n`
  })
  result += '_Use "create a [template name] for [deal/company]" to generate._'
  return result
}

async function generateFromTemplate(params, userId) {
  const { template_name, entity_type, entity_id, additional_fields } = params
  const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }
  
  // Find template by name or doc_type
  const tRes = await fetch(`${SB_URL}/rest/v1/kiko_doc_templates?order=name.asc`, { headers })
  const templates = await tRes.json()
  const template = templates?.find(t => 
    t.name.toLowerCase().includes((template_name || '').toLowerCase()) ||
    t.doc_type === template_name ||
    t.doc_type.replace('_', ' ') === (template_name || '').toLowerCase()
  )
  if (!template) return `Template "${template_name}" not found. Available: ${(templates || []).map(t => t.name).join(', ')}`

  // Resolve entity data
  let entityData = {}
  if (entity_type === 'deal' && entity_id) {
    const dRes = await fetch(`${SB_URL}/rest/v1/kiko_deals?id=eq.${entity_id}&limit=1`, { headers })
    const deals = await dRes.json()
    if (deals?.[0]) entityData = { company: deals[0].company_name, deal_value: deals[0].deal_value ? `$${(deals[0].deal_value / 1000000).toFixed(1)}m` : '', deal_stage: deals[0].stage, contact_name: deals[0].contact_name, team: deals[0].team || '', ...deals[0] }
  } else if (entity_type === 'deal') {
    // Search by company name in entity_id
    const dRes = await fetch(`${SB_URL}/rest/v1/kiko_deals?company_name=ilike.*${encodeURIComponent(entity_id || '')}*&limit=1`, { headers })
    const deals = await dRes.json()
    if (deals?.[0]) entityData = { company: deals[0].company_name, deal_value: deals[0].deal_value ? `$${(deals[0].deal_value / 1000000).toFixed(1)}m` : '', deal_stage: deals[0].stage, contact_name: deals[0].contact_name, team: deals[0].team || '', ...deals[0] }
  }

  // Merge with additional fields
  const mergedData = { ...entityData, ...(additional_fields || {}) }

  // Generate via Document Ops API
  const genRes = await fetch(`${SB_URL.replace('supabase.co', 'vanhawke.agency').includes('vanhawke') ? 'https://api.vanhawke.agency' : SB_URL}/api/document-ops?action=generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId: template.id, entityType: entity_type || 'deal', entityId: entity_id || '', data: mergedData, userId })
  })
  const result = await genRes.json()
  
  if (result.document) {
    return `✅ **Document Generated**\n\n**${result.document.name}**\nType: ${template.name}\nFormat: ${template.output_format}\n${result.document.file_url ? `\n[📥 View Document](${result.document.file_url})` : ''}\n\nThe document has been saved to the Document Library.`
  }
  return `Document generation failed: ${result.error || 'Unknown error'}`
}
