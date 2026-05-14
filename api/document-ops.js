// api/document-ops.js — Document generation, storage, and management
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sbFetch(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...opts.headers } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text().catch(() => '')}`);
  const text = await r.text(); return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  const { action } = req.query || {};
  try {
    switch (action) {

      case 'templates': {
        const templates = await sbFetch('kiko_doc_templates?order=doc_type.asc,name.asc');
        return res.json({ templates: templates || [] });
      }

      case 'documents': {
        const { entityType, entityId, docType } = req.body || {};
        let query = 'kiko_documents?order=created_at.desc&limit=50';
        if (entityType && entityId) query += `&entity_type=eq.${entityType}&entity_id=eq.${entityId}`;
        if (docType) query += `&doc_type=eq.${docType}`;
        const docs = await sbFetch(query);
        return res.json({ documents: docs || [] });
      }

      case 'upload': {
        const { name, entityType, entityId, storagePath, fileUrl, fileSize, mimeType, docType, userId, description, tags } = req.body || {};
        if (!name || !storagePath) return res.status(400).json({ error: 'Missing name or storagePath' });
        const doc = { name, description, doc_type: docType || 'other', entity_type: entityType || null, entity_id: entityId || null, storage_path: storagePath, file_url: fileUrl, file_size: fileSize || 0, mime_type: mimeType || 'application/pdf', generated_by: 'user', created_by: userId || null, tags: tags || [] };
        const result = await sbFetch('kiko_documents', { method: 'POST', body: JSON.stringify(doc) });
        return res.json({ document: result?.[0] || null });
      }

      case 'generate': {
        const { templateId, entityType, entityId, data, userId } = req.body || {};
        if (!templateId) return res.status(400).json({ error: 'Missing templateId' });
        
        // Load template
        const templates = await sbFetch(`kiko_doc_templates?id=eq.${templateId}&limit=1`);
        const template = templates?.[0];
        if (!template) return res.status(404).json({ error: 'Template not found' });

        // If entity provided, pull CRM data
        let entityData = {};
        if (entityType === 'deal' && entityId) {
          const deals = await sbFetch(`kiko_deals?id=eq.${entityId}&limit=1`);
          if (deals?.[0]) entityData = { company: deals[0].company_name, deal_value: deals[0].deal_value, deal_stage: deals[0].stage, contact_name: deals[0].contact_name, ...deals[0] };
        } else if (entityType === 'contact' && entityId) {
          const contacts = await sbFetch(`kiko_contacts?id=eq.${entityId}&limit=1`);
          if (contacts?.[0]) entityData = { contact_name: `${contacts[0].first_name} ${contacts[0].last_name}`, contact_title: contacts[0].title, company: contacts[0].company, ...contacts[0] };
        }

        // Merge CRM data with user-provided data
        const mergedData = { ...entityData, ...(data || {}) };

        // Generate HTML from template fields + data
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

        const fieldList = (template.field_schema || []).map(f => `${f.label || f.name}: ${mergedData[f.name] || f.default || '[not provided]'}`).join('\n');

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6', max_tokens: 4000,
          system: `You are a professional document writer for Van Hawke Group, an F1/Formula E sponsorship advisory firm. Generate a clean, professional ${template.doc_type.replace('_', ' ')} document. Use formal business language. Include all provided data. Output clean HTML with inline styles suitable for PDF conversion. Use Van Hawke's brand: primary colour #E8700A, professional serif headings, clean sans-serif body text. Include proper headers, sections, and formatting.`,
          messages: [{ role: 'user', content: `Generate a ${template.name} document with this data:\n\n${fieldList}\n\nTemplate type: ${template.doc_type}\nOutput: Professional HTML document ready for PDF conversion.` }]
        });

        const htmlContent = response.content?.[0]?.text || '<p>Document generation failed</p>';

        // Store the generated HTML as a file
        const timestamp = Date.now();
        const fileName = `${template.doc_type}-${mergedData.company || 'document'}-${timestamp}`.replace(/[^a-zA-Z0-9-]/g, '_');
        const storagePath = `documents/${entityType || 'general'}/${entityId || 'unlinked'}/${fileName}.html`;

        const { error: uploadErr } = await supabase.storage.from('vela-assets').upload(storagePath, htmlContent, { contentType: 'text/html', upsert: true });
        if (uploadErr) return res.status(500).json({ error: `Upload failed: ${uploadErr.message}` });

        const { data: urlData } = supabase.storage.from('vela-assets').getPublicUrl(storagePath);

        // Version check - if regenerating same template+entity, create new version
        let version = 1, parentId = null;
        if (entityType && entityId) {
          const existing = await sbFetch(`kiko_documents?template_id=eq.${templateId}&entity_type=eq.${entityType}&entity_id=eq.${entityId}&order=version.desc&limit=1`);
          if (existing?.[0]) { version = (existing[0].version || 1) + 1; parentId = existing[0].id; }
        }

        // Save document record
        const doc = {
          name: `${template.name} — ${mergedData.company || 'Document'}${version > 1 ? ' (v' + version + ')' : ''}`,
          doc_type: template.doc_type,
          template_id: templateId,
          entity_type: entityType || null,
          entity_id: entityId || null,
          storage_path: storagePath,
          file_url: urlData?.publicUrl,
          mime_type: 'text/html',
          generated_by: 'kiko',
          generated_data: mergedData,
          created_by: userId || null,
          version,
          parent_id: parentId,
        };
        const result = await sbFetch('kiko_documents', { method: 'POST', body: JSON.stringify(doc) });
        return res.json({ document: result?.[0] || null, html: htmlContent });
      }

      case 'versions': {
        const { documentId } = req.body || {};
        if (!documentId) return res.status(400).json({ error: 'Missing documentId' });
        // Get the root document (follow parent_id chain to first version)
        let rootId = documentId;
        let doc = (await sbFetch(\`kiko_documents?id=eq.\${documentId}&limit=1\`))?.[0];
        while (doc?.parent_id) { rootId = doc.parent_id; doc = (await sbFetch(\`kiko_documents?id=eq.\${doc.parent_id}&limit=1\`))?.[0]; }
        // Get all versions in this chain
        const versions = await sbFetch(\`kiko_documents?or=(id.eq.\${rootId},parent_id.eq.\${rootId})&order=version.asc\`);
        return res.json({ versions: versions || [] });
      }

      case 'delete': {
        const { documentId } = req.body || {};
        if (!documentId) return res.status(400).json({ error: 'Missing documentId' });
        // Get storage path to delete file
        const docs = await sbFetch(`kiko_documents?id=eq.${documentId}&limit=1`);
        if (docs?.[0]?.storage_path) {
          await supabase.storage.from('vela-assets').remove([docs[0].storage_path]).catch(() => {});
        }
        await sbFetch(`kiko_documents?id=eq.${documentId}`, { method: 'DELETE' });
        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[document-ops] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
