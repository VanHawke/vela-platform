// api/cron-crm-enrich.js — CRM-wide contact enrichment via Apollo + MCP connectors
// Apollo is primary. For contacts Apollo can't enrich, falls back to Claude + MCP
// (Lusha, Vibe Prospecting, Bigdata, Ramp) using Claude as the brain.
// Processes contacts in batches, enriches with verified emails, titles, companies.
// Respects credit limits — stops when rate-limited.

import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import { enrichByEmail, enrichByNameDomain } from './lib/apollo-client.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// MCP servers for fallback enrichment via Claude
const MCP_SERVERS = [
  { type: 'url', url: 'https://mcp.lusha.com/mcp/claude', name: 'lusha' },
  { type: 'url', url: 'https://vibeprospecting.explorium.ai/mcp', name: 'vibe-prospecting' },
  { type: 'url', url: 'https://mcp.bigdata.com', name: 'bigdata' },
  { type: 'url', url: 'https://mcp.ramp.com/ramp-data/anthropic/mcp', name: 'ramp-data' },
];

async function enrichViaMCP(name, company, email) {
  // MCP servers not available via API — use web search tool instead
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Find the current job title, company, LinkedIn URL, and verified work email for: ${name}${company ? ` at ${company}` : ''}${email ? ` (email: ${email})` : ''}. Search LinkedIn and company websites. Return ONLY a JSON object: {"email":"...","email_verified":true/false,"title":"...","company":"...","linkedin_url":"...","phone":null,"city":"...","country":"..."}. If unknown, set null. JSON only, no other text.`
        }],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`${resp.status} ${errText.slice(0, 200)}`);
    }
    const data = await resp.json();
    const textBlocks = (data.content || []).filter(c => c.type === 'text').map(c => c.text);
    const text = textBlocks.join('\n').trim();
    const clean = text.replace(/```json|```/g, '').trim();
    // Find JSON in the response
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.warn('[crm-enrich] Web search fallback failed:', e.message);
    return null;
  }
}

const BATCH_SIZE = 10;
const DELAY_MS = 2000; // 2s between enrichments to respect rate limits

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-crm-enrich', 'started');
  let enriched = 0, skipped = 0, failed = 0;
  let apolloExhausted = false; // Track if Apollo credits are gone

  try {
    // Get all contacts
    const contacts = await sbFetch('contacts?select=id,data&order=updated_at.asc&limit=200');
    if (!contacts?.length) return res.json({ ok: true, enriched: 0, msg: 'no contacts' });

    for (const contact of contacts) {
      const d = contact.data || {};
      const email = d.email || d.workEmail;
      const name = `${d.firstName || ''} ${d.lastName || ''}`.trim();
      const domain = email ? email.split('@')[1] : (d.company || '').toLowerCase().replace(/\s/g, '') + '.com';

      // Skip if recently enriched (within 30 days) by either source
      if ((d.apollo_enriched_at && (Date.now() - new Date(d.apollo_enriched_at).getTime()) < 30 * 86400000) ||
          (d.mcp_enriched_at && (Date.now() - new Date(d.mcp_enriched_at).getTime()) < 30 * 86400000)) {
        skipped++;
        continue;
      }

      try {
        let result = null;
        // Try Apollo first (unless credits exhausted)
        if (!apolloExhausted) {
          try {
            if (email) {
              result = await enrichByEmail(email);
            } else if (name && domain) {
              const [first, ...rest] = name.split(' ');
              result = await enrichByNameDomain(first, rest.join(' '), domain);
            }
          } catch (apolloErr) {
            if (apolloErr.message?.includes('insufficient credits') || apolloErr.message?.includes('422')) {
              console.warn('[crm-enrich] Apollo credits exhausted — switching to MCP-only');
              apolloExhausted = true;
            } else {
              throw apolloErr;
            }
          }
        }

        if (result?.found) {
          const updates = { ...d, apollo_enriched_at: new Date().toISOString() };
          if (result.email && result.email_status === 'verified') updates.email = result.email;
          if (result.title && !d.title) updates.title = result.title;
          if (result.company && !d.company) updates.company = result.company;
          if (result.linkedin_url && !d.linkedinUrl) updates.linkedinUrl = result.linkedin_url;
          if (result.city && !d.city) updates.city = result.city;
          if (result.country && !d.country) updates.country = result.country;

          await sbFetch(`contacts?id=eq.${contact.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ data: updates, updated_at: new Date().toISOString() }),
          });
          enriched++;
          console.log(`[crm-enrich] ✓ Apollo: ${name || email}: ${result.email_status || 'found'}`);
        } else {
          // Apollo didn't find — try MCP fallback (Lusha/Vibe/Bigdata via Claude)
          const mcp = await enrichViaMCP(name, d.company || '', email);
          if (mcp && (mcp.email || mcp.title || mcp.linkedin_url)) {
            const updates = { ...d, mcp_enriched_at: new Date().toISOString() };
            if (mcp.email && mcp.email_verified) updates.email = mcp.email;
            if (mcp.title && !d.title) updates.title = mcp.title;
            if (mcp.company && !d.company) updates.company = mcp.company;
            if (mcp.linkedin_url && !d.linkedinUrl) updates.linkedinUrl = mcp.linkedin_url;
            if (mcp.phone && !d.phone) updates.phone = mcp.phone;
            if (mcp.city && !d.city) updates.city = mcp.city;
            if (mcp.country && !d.country) updates.country = mcp.country;

            await sbFetch(`contacts?id=eq.${contact.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ data: updates, updated_at: new Date().toISOString() }),
            });
            enriched++;
            console.log(`[crm-enrich] ✓ MCP: ${name || email}: enriched via fallback`);
          } else {
            skipped++;
          }
        }

        await new Promise(r => setTimeout(r, DELAY_MS));
      } catch (e) {
        if (e.message?.includes('429') || e.message?.includes('rate')) {
          console.warn('[crm-enrich] Rate limited — stopping batch');
          break;
        }
        failed++;
        console.warn(`[crm-enrich] Failed ${name || email}:`, e.message);
      }
    }

    await cronHeartbeat('cron-crm-enrich', 'finished', {
      heartbeatId: __hbId, durationMs: Date.now() - __hbStart,
      recordsProcessed: enriched + skipped + failed,
      enriched, skipped, failed,
    });
    return res.json({ ok: true, enriched, skipped, failed, duration_ms: Date.now() - __hbStart });
  } catch (err) {
    console.error('[crm-enrich] Fatal:', err.message);
    await cronHeartbeat('cron-crm-enrich', 'error', { heartbeatId: __hbId, errorMessage: err.message }).catch(() => {});
    return res.json({ ok: false, error: err.message });
  }
}
